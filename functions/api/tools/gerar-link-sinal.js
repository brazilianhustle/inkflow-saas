// ── Tool 3.4 — gerar_link_sinal ────────────────────────────────────────────
// POST /api/tools/gerar-link-sinal
// Headers: X-Inkflow-Tool-Secret
// Body: { tenant_id, agendamento_id, valor_sinal, metodo? }
// Gera cobrança de sinal via Mercado Pago. Padrão: Pix dinâmico (POST
// /v1/payments → copia-e-cola + QR, persiste mp_payment_id). Fallback para
// cartão/Preference quando metodo='cartao' ou ENABLE_PIX_SINAL='false'.
// Aceita regeneracao: status 'tentative' ou 'cancelled'. Se cancelled,
// reabre pra tentative e reseta slot_expira_em.

import { withTool, supaFetch } from './_tool-helpers.js';
import { getMpAccessToken } from '../../_lib/mp-token.js';

const MP_API = 'https://api.mercadopago.com/checkout/preferences';
const MP_PAYMENTS_API = 'https://api.mercadopago.com/v1/payments';
const HOLD_MIN = 2880; // 48 horas — mesmo TTL do reservar-horario

// MP exige date_of_expiration com offset explícito; toISOString() devolve Z (UTC).
// Brasil aboliu o horário de verão em 2019 → America/Sao_Paulo é -03:00 fixo.
function isoComOffsetSP(date) {
  const sp = new Date(date.getTime() - 3 * 3600 * 1000); // desloca pro "relógio SP"
  const p = (n) => String(n).padStart(2, '0');
  return `${sp.getUTCFullYear()}-${p(sp.getUTCMonth() + 1)}-${p(sp.getUTCDate())}` +
    `T${p(sp.getUTCHours())}:${p(sp.getUTCMinutes())}:${p(sp.getUTCSeconds())}.000-03:00`;
}

export const onRequest = withTool('gerar_link_sinal', async ({ env, input }) => {
  const { tenant_id, agendamento_id, valor_sinal, metodo } = input || {};
  if (!tenant_id || !agendamento_id) {
    return { status: 400, body: { ok: false, error: 'tenant_id e agendamento_id obrigatorios' } };
  }
  if (!Number.isFinite(Number(valor_sinal)) || Number(valor_sinal) < 1) {
    return { status: 400, body: { ok: false, error: 'valor_sinal invalido' } };
  }

  const MP_TOKEN = getMpAccessToken(env); // tenant entra no Plano MP Connect
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

  const siteUrl = env.SITE_URL || 'https://inkflowbrasil.com';
  const externalRef = `sinal:${agendamento_id}`;
  const expiresAt = new Date(Date.now() + HOLD_MIN * 60000);
  const novoSlotExpira = expiresAt.toISOString();

  // Pix é o padrão (decisão #2). Flag ENABLE_PIX_SINAL=false força o cartão
  // (rollback sem revert). metodo='cartao' explícito também força o cartão.
  const pixEnabled = env.ENABLE_PIX_SINAL !== 'false';
  const usarPix = (metodo !== 'cartao') && pixEnabled;

  // Helper de persistência (compartilhado pelos dois caminhos).
  async function persistir(patchExtra) {
    const { mp_preference_id, ...agExtra } = patchExtra;
    const agendamentoPatch = { sinal_valor: Number(valor_sinal), ...agExtra };
    if (regenerado) agendamentoPatch.status = 'tentative';
    await supaFetch(env, `/rest/v1/agendamentos?id=eq.${encodeURIComponent(agendamento_id)}`, {
      method: 'PATCH', body: JSON.stringify(agendamentoPatch),
    });
    if (ag.cliente_telefone) {
      await supaFetch(env, `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(ag.cliente_telefone)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(mp_preference_id ? { mp_preference_id } : {}),
          estado: 'aguardando_sinal',
          slot_tentative_id: agendamento_id,
          slot_expira_em: novoSlotExpira,
          updated_at: new Date().toISOString(),
        }),
      });
    }
  }

  if (usarPix) {
    // ── Caminho Pix dinâmico: POST /v1/payments → copia-e-cola + QR ──────────
    const telDigits = String(ag.cliente_telefone || '').replace(/\D/g, '');
    const pixBody = {
      transaction_amount: Number(Number(valor_sinal).toFixed(2)),
      description: `Sinal tatuagem - ${tenant.nome_estudio || 'Estudio'}`,
      payment_method_id: 'pix',
      external_reference: externalRef,
      notification_url: `${siteUrl}/api/webhooks/mp-sinal`,
      date_of_expiration: isoComOffsetSP(expiresAt),
      payer: {
        email: telDigits ? `cli${telDigits}@inkflowbrasil.com` : 'cliente@inkflowbrasil.com',
        first_name: ag.cliente_nome || 'Cliente',
      },
    };
    // Idempotency key inclui a expiração recomputada por chamada: protege contra
    // retry duplicado da MESMA geração, mas regen (Pix expirado) produz key nova
    // e portanto um Pix novo (não devolve o expirado).
    const idemKey = `sinal-${agendamento_id}-${novoSlotExpira}`;
    const mpRes = await fetch(MP_PAYMENTS_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': idemKey },
      body: JSON.stringify(pixBody),
    });
    if (!mpRes.ok) {
      const errd = await mpRes.text();
      console.error('gerar-link-sinal: MP pix error:', errd);
      return { status: 502, body: { ok: false, error: 'mp-error', detail: errd.slice(0, 300) } };
    }
    const pix = await mpRes.json();
    const td = pix?.point_of_interaction?.transaction_data || {};
    if (!td.qr_code || !pix.id) {
      return { status: 502, body: { ok: false, error: 'mp-sem-qr' } };
    }
    await persistir({ mp_payment_id: String(pix.id) });
    return {
      status: 200,
      body: {
        ok: true,
        metodo_usado: 'pix',
        mp_payment_id: String(pix.id),
        copia_e_cola: td.qr_code,
        qr_code_base64: td.qr_code_base64 || null,
        external_reference: externalRef,
        valor: Number(valor_sinal),
        sinal_percentual: sinalPct,
        hold_horas: Math.round(HOLD_MIN / 60),
        expira_em: novoSlotExpira,
        regenerado,
      },
    };
  }

  // ── Caminho cartão: Preference one-shot (comportamento legado, intocado) ──
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
    const errd = await mpRes.text();
    console.error('gerar-link-sinal: MP error:', errd);
    return { status: 502, body: { ok: false, error: 'mp-error', detail: errd.slice(0, 300) } };
  }
  const pref = await mpRes.json();
  const link = pref.init_point || pref.sandbox_init_point;
  if (!link) return { status: 502, body: { ok: false, error: 'mp-sem-link' } };
  // mp_payment_id: null — cartão não tem payment id na geração (só após pagar)
  await persistir({ mp_payment_id: null, mp_preference_id: pref.id });
  return {
    status: 200,
    body: {
      ok: true,
      metodo_usado: 'cartao',
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
