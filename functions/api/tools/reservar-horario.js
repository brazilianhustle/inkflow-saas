// ── Tool 3.3 — reservar_horario ────────────────────────────────────────────
// POST /api/tools/reservar-horario
// Headers: X-Inkflow-Tool-Secret
// Body: { tenant_id, telefone, nome, inicio, fim, descricao? }
// Cria agendamento "tentative" (hold 24h) + atualiza conversas.estado=aguardando_sinal.
// Cron expira-holds libera automaticamente se nao pagar em 24h.

import { withTool, supaFetch } from './_tool-helpers.js';

const HOLD_MIN = 1440; // 24 horas

export const onRequest = withTool('reservar_horario', async ({ env, input }) => {
  const { tenant_id, telefone, nome, inicio, fim, descricao } = input || {};
  if (!tenant_id || !telefone || !inicio || !fim) {
    return { status: 400, body: { ok: false, error: 'tenant_id, telefone, inicio e fim obrigatorios' } };
  }

  const di = new Date(inicio);
  const df = new Date(fim);
  if (!Number.isFinite(di.getTime()) || !Number.isFinite(df.getTime()) || df <= di) {
    return { status: 400, body: { ok: false, error: 'inicio/fim invalidos' } };
  }
  if (di.getTime() < Date.now()) {
    return { status: 400, body: { ok: false, error: 'inicio no passado' } };
  }

  // Check conflito (evita race entre consulta e reserva)
  const cRes = await supaFetch(
    env,
    `/rest/v1/agendamentos?tenant_id=eq.${encodeURIComponent(tenant_id)}&status=in.(tentative,confirmed)&inicio=lt.${encodeURIComponent(df.toISOString())}&fim=gt.${encodeURIComponent(di.toISOString())}&select=id`
  );
  if (cRes.ok) {
    const conflitos = await cRes.json();
    if (Array.isArray(conflitos) && conflitos.length > 0) {
      return { status: 409, body: { ok: false, error: 'slot-ocupado', code: 'slot_taken' } };
    }
  }

  // Garantir que existe conversa pro telefone (upsert)
  const selConv = await supaFetch(env, `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}&select=id,dados_coletados`);
  const convs = selConv.ok ? await selConv.json() : [];
  const slotExpira = new Date(Date.now() + HOLD_MIN * 60000).toISOString();
  let conversa_id;
  if (Array.isArray(convs) && convs.length > 0) {
    conversa_id = convs[0].id;
    const dadosMerge = { ...(convs[0].dados_coletados || {}), nome, ultimo_slot_proposto: inicio };
    await supaFetch(env, `/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        estado: 'aguardando_sinal',
        slot_expira_em: slotExpira,
        dados_coletados: dadosMerge,
        updated_at: new Date().toISOString(),
      }),
    });
  } else {
    const insC = await supaFetch(env, '/rest/v1/conversas', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        tenant_id, telefone,
        estado: 'aguardando_sinal',
        dados_coletados: { nome, ultimo_slot_proposto: inicio },
        slot_expira_em: slotExpira,
      }),
    });
    if (insC.ok) {
      const c = await insC.json();
      conversa_id = c[0]?.id;
    }
  }

  // Insert agendamento tentative
  const insA = await supaFetch(env, '/rest/v1/agendamentos', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      tenant_id, conversa_id,
      cliente_nome: nome || null,
      cliente_telefone: telefone,
      inicio: di.toISOString(),
      fim: df.toISOString(),
      status: 'tentative',
    }),
  });
  if (!insA.ok) {
    return { status: 500, body: { ok: false, error: 'agendamento-falhou', detail: await insA.text() } };
  }
  const [ag] = await insA.json();

  // Atualiza conversas.slot_tentative_id
  if (conversa_id) {
    await supaFetch(env, `/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ slot_tentative_id: ag.id }),
    });
  }

  return {
    status: 200,
    body: {
      ok: true,
      agendamento_id: ag.id,
      conversa_id,
      expira_em: slotExpira,
      hold_minutos: HOLD_MIN,
      hold_horas: Math.round(HOLD_MIN / 60),
      descricao: descricao || null,
    },
  };
});
