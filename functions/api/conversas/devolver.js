// ── InkFlow — POST /api/conversas/devolver ──
// Retoma o bot pra uma conversa pausada via UI manual (botão "Devolver" no Painel Conversas).
// Body: { conversa_id, studio_token }

import { applyTransition } from './_transition.js';
import { verifyStudioTokenOrLegacy } from '../_auth-helpers.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const { conversa_id, studio_token } = body;
  if (!conversa_id || !studio_token) return json({ error: 'conversa_id e studio_token obrigatórios' }, 400);

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

  const r = await fetch(`${SUPABASE_URL}/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}&tenant_id=eq.${tenant_id}&select=id,estado_agente,estado_agente_anterior`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  });
  if (!r.ok) return json({ error: 'Erro ao consultar conversa' }, 500);
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) return json({ error: 'Conversa não encontrada' }, 404);
  const conv = rows[0];

  const transition = applyTransition({
    estado_atual: conv.estado_agente,
    action: 'resume',
    estado_agente_anterior: conv.estado_agente_anterior,
  });
  if (transition.action === 'noop') return json({ ok: true, noop: true, message: 'Não estava pausada' });

  const upd = await fetch(`${SUPABASE_URL}/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}`, {
    method: 'PATCH',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      estado_agente: transition.new_state,
      estado_agente_anterior: transition.estado_agente_anterior,
      pausada_em: transition.pausada_em,
    }),
  });
  if (!upd.ok) {
    const errText = await upd.text().catch(() => '');
    console.error('devolver: PATCH conversa falhou', upd.status, errText);
    return json({ error: 'Erro ao atualizar conversa' }, 500);
  }

  return json({ ok: true, new_state: transition.new_state });
}
