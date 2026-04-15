// ── Webhook — mp-sinal ─────────────────────────────────────────────────────
// POST /api/webhooks/mp-sinal
// Recebe IPN do Mercado Pago para pagamentos de sinal (one-shot). Quando o
// pagamento e approved, promove agendamento tentative → confirmed e atualiza
// conversa para estado=confirmado.
// Auth: valida x-signature do MP (MP_WEBHOOK_SECRET).

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const MP_API = 'https://api.mercadopago.com';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function supaFetch(env, path, init = {}) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

// Valida assinatura MP webhook (padrao x-signature=ts=...,v1=HMAC_SHA256)
// Doc: https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks
async function verifyMpSig(request, env, dataId) {
  const secret = env.MP_WEBHOOK_SECRET;
  if (!secret) return { ok: true, reason: 'secret-missing' }; // fail-open (avisa em log)
  const sig = request.headers.get('x-signature');
  const reqId = request.headers.get('x-request-id');
  if (!sig || !reqId || !dataId) return { ok: false, reason: 'headers-missing' };
  const tsMatch = sig.match(/ts=([^,]+)/);
  const v1Match = sig.match(/v1=([a-f0-9]+)/);
  if (!tsMatch || !v1Match) return { ok: false, reason: 'sig-malformed' };
  const manifest = `id:${dataId};request-id:${reqId};ts:${tsMatch[1]};`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBytes = await crypto.subtle.sign('HMAC', key, enc.encode(manifest));
  const hex = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
  return { ok: hex === v1Match[1], reason: hex === v1Match[1] ? 'ok' : 'sig-mismatch' };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);

  const url = new URL(request.url);
  const topic = url.searchParams.get('topic') || url.searchParams.get('type');
  const dataId = url.searchParams.get('data.id') || url.searchParams.get('id');

  let body = {};
  try { body = await request.json(); } catch {}
  const paymentId = dataId || body?.data?.id || body?.id;

  if (!paymentId) {
    console.warn('mp-sinal: payment id ausente', { topic, body });
    return json({ ok: true, ignored: 'no-payment-id' });
  }

  // Validacao de assinatura
  const sigCheck = await verifyMpSig(request, env, paymentId);
  if (!sigCheck.ok) {
    console.warn('mp-sinal: assinatura invalida', sigCheck);
    return json({ error: 'invalid-signature' }, 401);
  }

  // So processa eventos de payment
  if (topic && topic !== 'payment' && !String(topic).includes('payment')) {
    return json({ ok: true, ignored: 'not-payment-topic', topic });
  }

  // Busca payment no MP pra confirmar status (webhook pode vir com dados stale)
  const MP_TOKEN = env.MP_ACCESS_TOKEN;
  if (!MP_TOKEN) return json({ error: 'mp-not-configured' }, 503);

  const payRes = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
  });
  if (!payRes.ok) {
    console.error('mp-sinal: erro buscando payment', payRes.status, await payRes.text());
    return json({ ok: true, ignored: 'payment-fetch-failed' });
  }
  const payment = await payRes.json();
  const externalRef = payment.external_reference || '';
  const match = externalRef.match(/^sinal:([a-f0-9-]+)$/i);
  if (!match) {
    return json({ ok: true, ignored: 'not-a-sinal', external_reference: externalRef });
  }
  const agendamento_id = match[1];

  if (payment.status !== 'approved') {
    console.log(`mp-sinal: payment ${paymentId} status=${payment.status} agendamento=${agendamento_id}`);
    return json({ ok: true, ignored: 'not-approved', status: payment.status });
  }

  // Promove agendamento para confirmed (so se ainda estiver tentative — evita reprocesso)
  const updRes = await supaFetch(env, `/rest/v1/agendamentos?id=eq.${encodeURIComponent(agendamento_id)}&status=eq.tentative`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      status: 'confirmed',
      sinal_pago_em: new Date().toISOString(),
      mp_payment_id: String(paymentId),
    }),
  });
  if (!updRes.ok) {
    console.error('mp-sinal: erro promovendo agendamento', await updRes.text());
    return json({ ok: true, ignored: 'update-failed' });
  }
  const updated = await updRes.json();
  if (!Array.isArray(updated) || updated.length === 0) {
    // Ja processado (idempotencia)
    return json({ ok: true, ignored: 'already-processed', agendamento_id });
  }
  const ag = updated[0];

  // Atualiza conversa correspondente
  if (ag.cliente_telefone && ag.tenant_id) {
    await supaFetch(env, `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(ag.tenant_id)}&telefone=eq.${encodeURIComponent(ag.cliente_telefone)}`, {
      method: 'PATCH',
      body: JSON.stringify({ estado: 'confirmado', updated_at: new Date().toISOString() }),
    });
  }

  console.log(`mp-sinal: agendamento ${agendamento_id} confirmado via payment ${paymentId}`);
  return json({ ok: true, agendamento_id, status: 'confirmed' });
}
