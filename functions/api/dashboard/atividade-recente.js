// ── InkFlow — GET /api/dashboard/atividade-recente ──────────────────────────
// Retorna as últimas 3 conversas do painel Dashboard do estúdio.
//
// Auth: studio_token HMAC v1 → tenant_id derivado SEMPRE do token (nunca query param).
//
// Query params:
//   studio_token (obrigatório)
//
// Response 200: {
//   ok: true,
//   atividades: [
//     { id: "uuid", nome: "Maria Silva", estado_agente: "propondo_valor", last_msg_at: "..." }
//   ]
// }
//
// nome fallback chain: dados_cadastro.nome → telefone → 'sem nome'
// last_msg_at fallback: last_msg_at ?? updated_at

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

/**
 * Extrai nome da conversa seguindo a cadeia de fallback:
 *   1. dados_cadastro.nome
 *   2. telefone
 *   3. 'sem nome'
 */
function extractNome(conversa) {
  const nome = conversa?.dados_cadastro?.nome;
  if (nome && typeof nome === 'string' && nome.trim().length > 0) return nome.trim();
  if (conversa?.telefone && typeof conversa.telefone === 'string' && conversa.telefone.trim().length > 0) {
    return conversa.telefone.trim();
  }
  return 'sem nome';
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(request.url);
  const studio_token = url.searchParams.get('studio_token');

  // Auth guard — antes de qualquer acesso ao DB
  if (!studio_token) return json({ error: 'studio_token obrigatório' }, 401);

  const sbKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbKey) return json({ error: 'Configuração interna ausente' }, 503);

  const verified = await verifyStudioTokenOrLegacy({
    token: studio_token,
    secret: env.STUDIO_TOKEN_SECRET,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: sbKey,
  });
  if (!verified) return json({ error: 'studio_token inválido' }, 401);

  // SECURITY: tenant_id SEMPRE derivado do token verificado — NUNCA da query.
  const tenantId = verified.tenantId;

  try {
    const queryUrl =
      `${SUPABASE_URL}/rest/v1/conversas` +
      `?select=id,telefone,dados_cadastro,estado_agente,last_msg_at,updated_at` +
      `&tenant_id=eq.${tenantId}` +
      `&order=last_msg_at.desc.nullslast` +
      `&limit=3`;

    const res = await fetch(queryUrl, {
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
      },
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`supabase-conversas ${res.status}: ${detail.slice(0, 200)}`);
    }

    const rows = await res.json();

    const atividades = (Array.isArray(rows) ? rows : []).map((c) => ({
      id: c.id,
      nome: extractNome(c),
      estado_agente: c.estado_agente ?? null,
      last_msg_at: c.last_msg_at ?? c.updated_at ?? null,
    }));

    return json({ ok: true, atividades });
  } catch (err) {
    console.error('atividade-recente: erro ao buscar conversas:', err.message);
    return json({ error: 'Erro ao buscar atividade recente' }, 500);
  }
}
