// ── Tool 3.4 — gerar_link_sinal ────────────────────────────────────────────
// POST /api/tools/gerar-link-sinal
// Headers: X-Inkflow-Tool-Secret
// Body: { tenant_id, agendamento_id, valor_sinal }
// Cria Preference Mercado Pago one-shot, salva mp_preference_id no agendamento
// e retorna link curto. Webhook /api/webhooks/mp-sinal promove para confirmed
// quando o pagamento cai.

import { withTool, supaFetch } from './_tool-helpers.js';

const MP_API = 'https://api.mercadopago.com/checkout/preferences';

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

  // Valida que o agendamento existe e esta tentative
  const aRes = await supaFetch(env, `/rest/v1/agendamentos?id=eq.${encodeURIComponent(agendamento_id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}&select=id,status,inicio,cliente_nome,cliente_telefone`);
  if (!aRes.ok) return { status: 500, body: { ok: false, error: 'db-error' } };
  const rows = await aRes.json();
  if (!Array.isArray(rows) || rows.length === 0) return { status: 404, body: { ok: false, error: 'agendamento-nao-encontrado' } };
  const ag = rows[0];
  if (ag.status !== 'tentative') {
    return { status: 409, body: { ok: false, error: 'agendamento nao esta em tentative', status_atual: ag.status } };
  }

  const tRes = await supaFetch(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=nome_estudio`);
  const tenant = tRes.ok ? (await tRes.json())[0] : {};

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

  // Salva preference_id no agendamento e na conversa
  await supaFetch(env, `/rest/v1/agendamentos?id=eq.${encodeURIComponent(agendamento_id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sinal_valor: Number(valor_sinal), mp_payment_id: null }),
  });
  if (ag.cliente_telefone) {
    await supaFetch(env, `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(ag.cliente_telefone)}`, {
      method: 'PATCH',
      body: JSON.stringify({ mp_preference_id: pref.id, updated_at: new Date().toISOString() }),
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
    },
  };
});
