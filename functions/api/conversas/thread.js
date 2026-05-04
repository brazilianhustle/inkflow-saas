// ── InkFlow — GET /api/conversas/thread ──
// Retorna mensagens paginadas (cronológico DESC) de uma conversa específica.
// Auth: studio_token v1 HMAC. Tenant guard: 1ª query confirma conversa pertence ao tenant.
//
// Query params:
//   studio_token (obrigatório)
//   conversa_id (uuid, obrigatório)
//   before_ts (ISO string, cursor opcional)
//   limit (1-200, default 50, clamped)
//
// Response 200: { ok: true, conversa: {...}, mensagens: [{id, role, content, created_at}], next_cursor: ISO|null }

import { verifyStudioTokenOrLegacy } from '../_auth-helpers.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function clampLimit(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(n, 200);
}

// Mapeia role: human → human, ai → ai, outros tipos (tool/system) → null (skip).
function mapRole(messageType) {
  if (messageType === 'human') return 'human';
  if (messageType === 'ai') return 'ai';
  return null;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(request.url);
  const studio_token = url.searchParams.get('studio_token');
  const conversa_id = url.searchParams.get('conversa_id');
  const before_ts = url.searchParams.get('before_ts');
  const limit = clampLimit(url.searchParams.get('limit'));

  if (!studio_token) return json({ error: 'studio_token obrigatório' }, 400);
  if (!conversa_id) return json({ error: 'conversa_id obrigatório' }, 400);

  if (before_ts) {
    const d = new Date(before_ts);
    if (!Number.isFinite(d.getTime())) {
      return json({ error: 'before_ts inválido (esperava ISO timestamp)' }, 400);
    }
  }

  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return json({ error: 'Configuração interna ausente' }, 503);

  const verified = await verifyStudioTokenOrLegacy({
    token: studio_token,
    secret: env.STUDIO_TOKEN_SECRET,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SB_KEY,
  });
  if (!verified) return json({ error: 'Token inválido' }, 401);
  const tenant_id = verified.tenantId;

  // 1) Fetch conversa com tenant guard. 404 se não pertence ao tenant verificado.
  const cR = await fetch(
    `${SUPABASE_URL}/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}&tenant_id=eq.${tenant_id}&select=id,telefone,estado_agente,estado_agente_anterior,pausada_em,valor_proposto,dados_coletados,dados_cadastro,last_msg_at`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  if (!cR.ok) {
    const errText = await cR.text().catch(() => '');
    console.error('thread: GET conversa falhou', cR.status, errText);
    return json({ error: 'Erro ao consultar conversa' }, 500);
  }
  const conversas = await cR.json();
  if (!Array.isArray(conversas) || conversas.length === 0) {
    return json({ error: 'Conversa não encontrada' }, 404);
  }
  const conversa = conversas[0];

  // 2) Fetch mensagens via session_id construído server-side (igualdade exata, NÃO LIKE).
  const session_id = `${tenant_id}_${conversa.telefone}`;
  const params = [
    `session_id=eq.${encodeURIComponent(session_id)}`,
    'select=id,message,created_at',
    'order=created_at.desc',
    `limit=${limit}`,
  ];
  if (before_ts) params.push(`created_at=lt.${encodeURIComponent(before_ts)}`);

  const mR = await fetch(`${SUPABASE_URL}/rest/v1/n8n_chat_histories?${params.join('&')}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!mR.ok) {
    const errText = await mR.text().catch(() => '');
    console.error('thread: GET n8n_chat_histories falhou', mR.status, errText);
    return json({ error: 'Erro ao consultar mensagens' }, 500);
  }
  const rows = await mR.json();

  // Mapear + filtrar tipos válidos (skip tool/system/etc).
  const mensagens = rows
    .map((r) => {
      const role = mapRole(r.message?.type);
      if (!role) return null;
      const content = typeof r.message?.content === 'string' ? r.message.content : '';
      return { id: r.id, role, content, created_at: r.created_at };
    })
    .filter(Boolean);

  // Cursor baseado na última row crua (não filtrada) — paginação consistente.
  const next_cursor = rows.length === limit ? rows[rows.length - 1].created_at : null;

  return json({ ok: true, conversa, mensagens, next_cursor });
}
