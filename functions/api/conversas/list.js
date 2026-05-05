// ── InkFlow — GET /api/conversas/list ──
// Lista conversas paginadas filtradas por grupo (hoje|aguardando|negociacao|historico).
// Auth: studio_token HMAC v1 → tenant_id sempre derivado do token, nunca aceito do query.
//
// Query params:
//   studio_token (obrigatório)
//   grupo (obrigatório, hoje|aguardando|negociacao|historico)
//   limit (opcional, 1-100, default 30, clamped)
//   before_ts (opcional, ISO string — cursor pra paginação)
//
// Response 200: { ok: true, conversas: [...], next_cursor: ISO|null }
// `next_cursor` é o `last_msg_at` da última row se houver mais páginas.

import { verifyStudioTokenOrLegacy } from '../_auth-helpers.js';
import { getGrupoFilter, GRUPOS_VALIDOS } from './_grupos.js';

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
  if (!Number.isFinite(n) || n < 1) return 30;
  return Math.min(n, 100);
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(request.url);
  const studio_token = url.searchParams.get('studio_token');
  const grupo = url.searchParams.get('grupo');
  const limit = clampLimit(url.searchParams.get('limit'));
  const before_ts = url.searchParams.get('before_ts');

  if (!studio_token) return json({ error: 'studio_token obrigatório' }, 400);
  if (!grupo) return json({ error: 'grupo obrigatório', grupos_validos: GRUPOS_VALIDOS }, 400);

  const grupoFilter = getGrupoFilter(grupo);
  if (!grupoFilter) return json({ error: 'grupo inválido', grupos_validos: GRUPOS_VALIDOS }, 400);

  if (before_ts) {
    // Validate as parseable ISO date
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

  // Build query string (cross-column or single-column dependendo do grupo)
  // PostgREST suporta `or=(estado_agente.in.(a,b),estado.in.(c,d))` pra cruzar colunas.
  // Painel "Hoje" precisa cruzar (coletando_* em estado_agente OR escolhendo_horario/aguardando_sinal em estado).
  // Outros painéis filtram só estado_agente — usamos forma direta pra evitar `or=` com 1 cláusula.
  const { estados_agente, estados } = grupoFilter;
  const params = [
    `tenant_id=eq.${tenant_id}`,
    'select=id,telefone,estado,estado_agente,last_msg_at,valor_proposto,dados_coletados,dados_cadastro,estado_agente_anterior,pausada_em',
    'order=last_msg_at.desc',
    `limit=${limit}`,
  ];

  if (estados_agente.length && estados.length) {
    // Cross-column: ambas listas com itens (caso "hoje")
    const ea = estados_agente.map(encodeURIComponent).join(',');
    const es = estados.map(encodeURIComponent).join(',');
    params.push(`or=(estado_agente.in.(${ea}),estado.in.(${es}))`);
  } else if (estados_agente.length) {
    // Single-col estado_agente (casos "aguardando", "negociacao", "historico")
    const ea = estados_agente.map(encodeURIComponent).join(',');
    params.push(`estado_agente=in.(${ea})`);
  } else {
    // Single-col estado (não usado atualmente, mas defensive)
    const es = estados.map(encodeURIComponent).join(',');
    params.push(`estado=in.(${es})`);
  }

  if (grupoFilter.last_msg_at_gte) {
    params.push(`last_msg_at=gte.${encodeURIComponent(grupoFilter.last_msg_at_gte)}`);
  }
  if (before_ts) {
    params.push(`last_msg_at=lt.${encodeURIComponent(before_ts)}`);
  }

  const r = await fetch(`${SUPABASE_URL}/rest/v1/conversas?${params.join('&')}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => '');
    console.error('list: GET conversas falhou', r.status, errText);
    return json({ error: 'Erro ao consultar conversas' }, 500);
  }
  const conversas = await r.json();

  // Buscar last_msg_preview pra cada conversa em paralelo (até `limit` calls).
  const previews = await Promise.all(conversas.map(async (c) => {
    try {
      const session_id = `${tenant_id}_${c.telefone}`;
      const pr = await fetch(`${SUPABASE_URL}/rest/v1/n8n_chat_histories?session_id=eq.${encodeURIComponent(session_id)}&select=message&order=id.desc&limit=1`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      });
      if (!pr.ok) return '';
      const rows = await pr.json();
      if (!Array.isArray(rows) || rows.length === 0) return '';
      const content = rows[0]?.message?.content;
      if (typeof content !== 'string') return '';
      return content.slice(0, 60);
    } catch (e) {
      console.warn('list: preview fetch falhou', c.id, e?.message);
      return '';
    }
  }));

  const conversasComPreview = conversas.map((c, i) => ({ ...c, last_msg_preview: previews[i] }));
  const next_cursor = conversas.length === limit ? conversas[conversas.length - 1].last_msg_at : null;

  return json({ ok: true, conversas: conversasComPreview, next_cursor });
}
