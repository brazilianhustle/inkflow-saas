// ── Tool 3.4 — gerar_link_sinal ────────────────────────────────────────────
// POST /api/tools/gerar-link-sinal
// Headers: X-Inkflow-Tool-Secret
// Body: { tenant_id, agendamento_id, valor_sinal }
// Cria Preference Mercado Pago one-shot, salva mp_preference_id no agendamento
// e retorna link. Webhook /api/webhooks/mp-sinal promove para confirmed
// quando o pagamento cai.
//
// Aceita regeneracao: se o agendamento estiver em status 'cancelled' ou 'tentative',
// gera novo link. Se cancelled, reabre pra tentative e reseta slot_expira_em.

import { withTool, supaFetch } from './_tool-helpers.js';

const MP_API = 'https://api.mercadopago.com/checkout/preferences';
const HOLD_MIN = 1440; // 24h — mesmo TTL do reservar-horario

export const onRequest = withTool('gerar_link_sinal', async ({ env, input }) => {
  const { tenant_id, agendamento_id, valor_sinal } = input || {};
  if (!tenant_id || !agendamento_id) {
    return { status: 400, body: { ok: false, error: 'tenant_id e agendamento_id obrigatorios' } };
  }
  if (!Number.isFinite(Number(valor_sinal)) || Number(valor_sinal) < 1) {
    return { status: 400, body: { ok: false, error: 'valor_sinal invalido' } };
  }

  const MP_TOKEN = env.MP_ACCESS_TOKEN;
  if (!MP_TOKEN) return { status: 503, body: { ok: false, error: 'mp-nao-configurado' } };

  // Valida que o agendamento existe em status permitido (tentative ou cancelled)
  // cancelled = permite regeneracao de link quando cliente volta apos expiracao.
  // confirmed/done = nao gera (ja pago)
  const aRes = await supaFetch(env, `/rest/v1/agendamentos?id=eq.${encodeURIComponent(agendamento_id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}&select=id,status,inicio,fim,cliente_nome,cliente_telefone`);
  if (!aRes.ok) return { status: 500, body: { ok: false, error: 'db-error' } };
  const rows = await aRes.json();
  if (!Array.isArray(rows) || rows.length === 0) return { status: 404, body: { ok: false, error: 'agendamento-nao-encontrado' } };
  const ag = rows[0];
  const statusesPermitidos = ['tentative', 'cancelled'];
  if (!statusesPermitidos.includes(ag.status)) {
    return { status: 409, body: { ok: false, error: `agendamento em status ${ag.status} nao aceita gerar link`, status_atual: ag.status } };
  }
  const regenerado = ag.status === 'cancelled';

  // Se for regeneracao, verifica se o slot ainda esta livre (evita duplicar horario)
  if (regenerado) {
    const conflito = await supaFetch(
      env,
      `/rest/v1/agendamentos?tenant_id=eq.${encodeURIComponent(tenant_id)}&status=in.(tentative,confirmed)&inicio=lt.${encodeURIComponent(ag.fim)}&fim=gt.${encodeURIComponent(ag.inicio)}&id=neq.${encodeURIComponent(agendamento_id)}&select=id`
    );
    if (conflito.ok) {
      const conflitos = await conflito.json();
      if (Array.isArray(conflitos) && conflitos.length > 0) {
        return { status: 409, body: { ok: false, error: 'slot-ocupado', code: 'slot_taken_other' } };
      }
    }
  }

  const tRes = await supaFetch(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=nome_estudio,sinal_percentual,config_precificacao`);
  const tenant = tRes.ok ? (await tRes.json())[0] : {};
  const sinalPct = (tenant.config_precificacao && tenant.config_precificacao.sinal_percentual) || tenant.sinal_percentual || 30;

  // Monta Preference
  const siteUrl = env.SITE_URL || 'https://inkflowbrasil.com';
  const externalRef = `sinal:${agendamento_id}`;
  const prefBody = {
    items: [{
      id: agendamento_id,
      title: `Sinal - ${tenant.nome_estudio || 'Tatuagem'}`,
      description: `Sinal para sessao em ${new Date(ag.inicio).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
      quantity: 1,
      unit_price: Number(Number(valor_sinal).toFixed(2)),
      currency_id: 'BRL',
    }],
    external_reference: externalRef,
    notification_url: `${siteUrl}/api/webhooks/mp-sinal`,
    back_urls: {
      success: `${siteUrl}/sinal-ok?ag=${agendamento_id}`,
      failure: `${siteUrl}/sinal-falha?ag=${agendamento_id}`,
      pending: `${siteUrl}/sinal-pendente?ag=${agendamento_id}`,
    },
    auto_return: 'approved',
    metadata: { tenant_id, agendamento_id, tipo: 'sinal_tatuagem' },
  };

  const mpRes = await fetch(MP_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(prefBody),
  });
  if (!mpRes.ok) {
    const err = await mpRes.text();
    console.error('gerar-link-sinal: MP error:', err);
    return { status: 502, body: { ok: false, error: 'mp-error', detail: err.slice(0, 300) } };
  }
  const pref = await mpRes.json();
  const link = pref.init_point || pref.sandbox_init_point;
  if (!link) return { status: 502, body: { ok: false, error: 'mp-sem-link' } };

  // Salva preference_id no agendamento e reabre pra tentative se era regeneracao
  const novoSlotExpira = new Date(Date.now() + HOLD_MIN * 60000).toISOString();
  const agendamentoPatch = {
    sinal_valor: Number(valor_sinal),
    mp_payment_id: null,
  };
  if (regenerado) {
    agendamentoPatch.status = 'tentative';
  }
  await supaFetch(env, `/rest/v1/agendamentos?id=eq.${encodeURIComponent(agendamento_id)}`, {
    method: 'PATCH',
    body: JSON.stringify(agendamentoPatch),
  });
  if (ag.cliente_telefone) {
    await supaFetch(env, `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(ag.cliente_telefone)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        mp_preference_id: pref.id,
        estado: 'aguardando_sinal',
        slot_tentative_id: agendamento_id,
        slot_expira_em: novoSlotExpira,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  return {
    status: 200,
    body: {
      ok: true,
      link_pagamento: link,
      preference_id: pref.id,
      external_reference: externalRef,
      valor: Number(valor_sinal),
      sinal_percentual: sinalPct,
      hold_horas: Math.round(HOLD_MIN / 60),
      expira_em: novoSlotExpira,
      regenerado,
    },
  };
});
