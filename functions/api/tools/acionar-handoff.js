// ── Tool 3.6 — acionar_handoff ─────────────────────────────────────────────
// POST /api/tools/acionar-handoff
// Headers: X-Inkflow-Tool-Secret
// Body: { tenant_id, telefone, motivo }
// Marca conversa como handoff e notifica o tatuador via WhatsApp central.
// O workflow n8n deve checar conversas.estado antes de responder — se estiver
// em 'handoff' ou 'confirmado', não aciona o agente.

import { withTool, supaFetch } from './_tool-helpers.js';

function normalizePhoneBR(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  return digits;
}

async function upsertConversaHandoff(env, tenant_id, telefone, motivo) {
  // Primeiro busca conversa existente pra preservar dados_coletados (merge, nao sobrescrita).
  const selRes = await supaFetch(
    env,
    `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}&select=id,dados_coletados`
  );
  const existentes = selRes.ok ? await selRes.json() : [];
  const dadosAntes = (existentes[0]?.dados_coletados) || {};
  const dadosMerge = { ...dadosAntes, handoff_motivo: motivo, handoff_em: new Date().toISOString() };

  // Se existe, PATCH; se nao, INSERT.
  if (Array.isArray(existentes) && existentes.length > 0) {
    const updRes = await supaFetch(
      env,
      `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          estado: 'handoff',
          dados_coletados: dadosMerge,
          updated_at: new Date().toISOString(),
        }),
      }
    );
    if (!updRes.ok) return { ok: false, reason: 'update-failed', status: updRes.status };
    const rows = await updRes.json();
    return { ok: true, id: rows[0]?.id, criado: false };
  }

  // Não existia → insert
  const insRes = await supaFetch(env, '/rest/v1/conversas', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      tenant_id,
      telefone,
      estado: 'handoff',
      dados_coletados: dadosMerge,
    }),
  });
  if (!insRes.ok) return { ok: false, reason: 'insert-failed', status: insRes.status };
  const created = await insRes.json();
  return { ok: true, id: created[0]?.id, criado: true };
}

async function notificarTatuador(env, tenant, telefone_cliente, motivo) {
  const CENTRAL_INSTANCE = env.EVO_CENTRAL_INSTANCE;
  const CENTRAL_APIKEY = env.EVO_CENTRAL_APIKEY || env.EVO_GLOBAL_KEY;
  const EVO_BASE_URL = env.EVO_BASE_URL || 'https://evo.inkflowbrasil.com';
  if (!CENTRAL_INSTANCE || !CENTRAL_APIKEY) {
    return { sent: false, reason: 'central-instance-not-configured' };
  }
  const phone = normalizePhoneBR(tenant.telefone);
  if (!phone) return { sent: false, reason: 'tenant-sem-telefone' };

  const text =
    `*InkFlow - Handoff automatico*\n\n` +
    `Cliente ${telefone_cliente} precisa de atendimento humano.\n\n` +
    `Motivo: ${motivo || 'nao informado'}\n\n` +
    `A IA pausou a conversa. Responda direto no WhatsApp do estudio.`;

  try {
    const r = await fetch(
      `${EVO_BASE_URL}/message/sendText/${encodeURIComponent(CENTRAL_INSTANCE)}`,
      {
        method: 'POST',
        headers: { apikey: CENTRAL_APIKEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: phone, text }),
      }
    );
    if (!r.ok) return { sent: false, reason: 'evolution-error', status: r.status };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: 'exception', detail: String(e?.message || e) };
  }
}

export const onRequest = withTool('acionar_handoff', async ({ env, input }) => {
  const { tenant_id, telefone, motivo } = input || {};
  if (!tenant_id || !telefone) {
    return { status: 400, body: { ok: false, error: 'tenant_id e telefone obrigatorios' } };
  }

  // Busca dados do tatuador
  const r = await supaFetch(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=id,telefone,nome_estudio`);
  if (!r.ok) return { status: 500, body: { ok: false, error: 'db-error' } };
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return { status: 404, body: { ok: false, error: 'tenant-nao-encontrado' } };
  }
  const tenant = rows[0];

  // 1. Atualiza conversa
  const conv = await upsertConversaHandoff(env, tenant_id, telefone, motivo || null);
  if (!conv.ok) {
    return { status: 500, body: { ok: false, error: 'conversa-falhou', detail: conv } };
  }

  // 2. Notifica tatuador (best-effort, não bloqueia)
  const notif = await notificarTatuador(env, tenant, telefone, motivo);

  return {
    status: 200,
    body: {
      ok: true,
      conversa_id: conv.id,
      conversa_criada: conv.criado,
      notificacao: notif,
    },
  };
});
