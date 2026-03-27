// ── InkFlow — Webhook IPN do Mercado Pago ─────────────────────────────────────
// Recebe notificações automáticas do MP quando o status da assinatura muda.
// Configurar no painel do MP: Notificações → URL → /.netlify/functions/mp-ipn
//
// Variáveis de ambiente necessárias:
//   MP_ACCESS_TOKEN      → chave de acesso de produção
//   SUPABASE_URL         → https://bfzuxxuscyplfoimvomh.supabase.co
//   SUPABASE_SERVICE_KEY → chave service_role do Supabase (não a anon!)

const STATUS_MAP = {
  authorized: 'ativo',
  paused:     'suspenso',
  cancelled:  'cancelado',
  pending:    'pendente',
};

exports.handler = async (event) => {
  const params = new URLSearchParams(event.rawQuery || '');
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}

  const topic = body.type || params.get('topic');
  const id = body.data?.id || params.get('id');

  if (topic !== 'preapproval' || !id) {
    return { statusCode: 200, body: 'ok' };
  }

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bfzuxxuscyplfoimvomh.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!ACCESS_TOKEN || !SUPABASE_KEY) {
    console.error('mp-ipn: env vars ausentes');
    return { statusCode: 200, body: 'ok' };
  }

  try {
    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });

    if (!mpRes.ok) {
      console.error('mp-ipn: falha ao buscar preapproval', await mpRes.text());
      return { statusCode: 200, body: 'ok' };
    }

    const subscription = await mpRes.json();
    const tenantId = subscription.external_reference;
    const mpStatus = subscription.status;

    if (!tenantId) {
      console.warn('mp-ipn: external_reference ausente');
      return { statusCode: 200, body: 'ok' };
    }

    const statusPagamento = STATUS_MAP[mpStatus] || 'pendente';
    const isAtivo = mpStatus === 'authorized';

    const sbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ status_pagamento: statusPagamento, mp_subscription_id: id, ativo: isAtivo }),
      }
    );

    if (!sbRes.ok) {
      console.error('mp-ipn: falha ao atualizar Supabase', await sbRes.text());
    } else {
      console.log(`mp-ipn: tenant ${tenantId} → ${statusPagamento}`);
    }
  } catch (err) {
    console.error('mp-ipn error:', err);
  }

  return { statusCode: 200, body: 'ok' };
};
