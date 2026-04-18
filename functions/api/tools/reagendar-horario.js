import { withTool, supaFetch } from './_tool-helpers.js';

export const onRequest = withTool('reagendar_horario', async ({ env, input }) => {
  const { tenant_id, telefone } = input || {};
  if (!tenant_id || !telefone) {
    return { status: 400, body: { ok: false, error: 'tenant_id e telefone obrigatórios' } };
  }

  const res = await supaFetch(
    env,
    `/rest/v1/agendamentos?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}&status=in.(tentative,confirmed)&order=created_at.desc&limit=1&select=id,status,inicio,fim,gcal_event_id`
  );
  if (!res.ok) {
    return { status: 500, body: { ok: false, error: 'erro-busca-agendamento' } };
  }

  const rows = await res.json();
  if (!rows || rows.length === 0) {
    return { body: { ok: false, error: 'nenhum-agendamento-ativo', mensagem: 'Não encontrei agendamento ativo para cancelar.' } };
  }

  const ag = rows[0];

  const cancelRes = await supaFetch(
    env,
    `/rest/v1/agendamentos?id=eq.${encodeURIComponent(ag.id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'cancelled' }),
    }
  );
  if (!cancelRes.ok) {
    return { status: 500, body: { ok: false, error: 'erro-cancelar' } };
  }

  if (ag.gcal_event_id) {
    try {
      const tenantRes = await supaFetch(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=google_calendar_id`);
      if (tenantRes.ok) {
        const tenants = await tenantRes.json();
        const calId = tenants[0]?.google_calendar_id;
        if (calId) {
          console.log(`reagendar: gcal event ${ag.gcal_event_id} no calendar ${calId} — delete manual necessário`);
        }
      }
    } catch {}
  }

  await supaFetch(
    env,
    `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ estado: 'orcando', slot_expira_em: null }),
    }
  );

  return {
    body: {
      ok: true,
      cancelado: true,
      agendamento_id: ag.id,
      horario_anterior: ag.inicio,
      mensagem: 'Agendamento cancelado. Consulte novos horários com consultar_horarios_livres.',
    },
  };
});
