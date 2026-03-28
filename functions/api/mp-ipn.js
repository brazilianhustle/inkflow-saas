// ── InkFlow — Webhook IPN do Mercado Pago (Cloudflare Pages) ──────────────────
// Recebe notificacoes automaticas do MP quando o status da assinatura muda.
// MP_ACCESS_TOKEN → chave de acesso de producao
// SUPABASE_SERVICE_KEY → chave service_role do Supabase

const STATUS_MAP = {
  authorized: 'ativo',
  paused: 'suspenso',
  cancelled: 'cancelado',
  pending: 'pendente',
};

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const params = url.searchParams;

  let body = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {}

  const topic = body.type || params.get('topic');
  const id = (body.data && body.data.id) || params.get('id');

  if (topic !== 'preapproval' || !id) {
    return new Response('ok', { status: 200 });
  }

  const ACCESS_TOKEN = env.MP_ACCESS_TOKEN;
  const SUPABASE_URL = env.SUPABASE_URL || 'https://bfzuxxuscyplfoimvomh.supabase.co';
  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;

  if (!ACCESS_TOKEN || !SUPABASE_KEY) {
    console.error('mp-ipn: env vars ausentes');
    return new Response('ok', { status: 200 });
  }

  try {
    const mpRes = await fetch('https://api.mercadopago.com/preapproval/' + id, {
      headers: { Authorization: 'Bearer ' + ACCESS_TOKEN },
    });

    if (!mpRes.ok) {
      console.error('mp-ipn: falha ao buscar preapproval', await mpRes.text());
      return new Response('ok', { status: 200 });
    }

    const subscription = await mpRes.json();
    const tenantId = subscription.external_reference;
    const mpStatus = subscription.status;

    if (!tenantId) {
      console.warn('mp-ipn: external_reference ausente');
      return new Response('ok', { status: 200 });
    }

    const statusPagamento = STATUS_MAP[mpStatus] || 'pendente';
    const isAtivo = mpStatus === 'authorized';

    const sbRes = await fetch(
      SUPABASE_URL + '/rest/v1/tenants?id=eq.' + encodeURIComponent(tenantId),
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ status_pagamento: statusPagamento, mp_subscription_id: id, ativo: isAtivo }),
      }
    );

    if (!sbRes.ok) {
      console.error('mp-ipn: falha ao atualizar Supabase', await sbRes.text());
    } else {
      console.log('mp-ipn: tenant ' + tenantId + ' atualizado para ' + statusPagamento);
    }
  } catch (err) {
    console.error('mp-ipn error:', err);
  }

  return new Response('ok', { status: 200 });
}
