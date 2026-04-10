// ── InkFlow — Webhook IPN Mercado Pago (Cloudflare Pages Function) ───────────
// Recebe notificações de pagamento do MP e atualiza o status do tenant no Supabase.
// URL configurada no painel MP: https://inkflowbrasil.com/api/mp-ipn

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

// ── Verificação de assinatura X-Signature do Mercado Pago ────────────────────
async function verifyMPSignature(request, env, rawBody) {
  const secret = env.MP_WEBHOOK_SECRET;
  if (!secret) return true;

  const xSignature = request.headers.get('x-signature');
  const xRequestId = request.headers.get('x-request-id');
  if (!xSignature) return false;

  const parts = Object.fromEntries(
    xSignature.split(',').map(p => p.split('=').map(s => s.trim()))
  );
  const ts   = parts['ts'];
  const hash = parts['v1'];
  if (!ts || !hash) return false;

  const url    = new URL(request.url);
  const dataId = url.searchParams.get('data.id') || url.searchParams.get('id');
  const manifest = 'id:' + (dataId || '') + ';request-id:' + (xRequestId || '') + ';ts:' + ts + ';';

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(manifest));
  const computed = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  return computed === hash;
}

// ── [FIX #14] Log de evento IPN no Supabase ─────────────────────────────────
async function logIPNEvent(env, tenantId, eventType, data = {}) {
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/payment_logs`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        tenant_id: tenantId || null,
        event_type: eventType,
        mp_subscription_id: data.subscriptionId || null,
        status: data.status || null,
        error_message: data.error || null,
        raw_response: data.raw || null,
      }),
    });
  } catch (e) {
    console.error('logIPNEvent error:', e);
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // FIX AUDIT-2 #4: Rejeitar métodos que não sejam POST
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let rawBody = '';
  let body = {};
  try {
    rawBody = await request.text();
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {}

  // [FIX AUDIT5 #1] Validacao HMAC — rejeitar sempre que secret configurado, alertar quando ausente
  if (!env.MP_WEBHOOK_SECRET) {
    console.warn('mp-ipn: MP_WEBHOOK_SECRET nao configurado — assinatura nao verificada. Configure a env var para seguranca.');
    await logIPNEvent(env, null, 'ipn_warning_no_secret', {
      error: 'MP_WEBHOOK_SECRET nao configurado — webhook aceito sem validacao HMAC',
    });
  } else {
    const valid = await verifyMPSignature(request, env, rawBody);
    if (!valid) {
      console.warn('mp-ipn: assinatura HMAC invalida — rejeitando request');
      await logIPNEvent(env, null, 'ipn_hmac_rejected', {
        error: 'Assinatura HMAC invalida',
      });
      return json({ error: 'Assinatura invalida' }, 401);
    }
  }

  const url    = new URL(request.url);
  const topic  = url.searchParams.get('topic')  || url.searchParams.get('type');
  const dataId = url.searchParams.get('data.id') || url.searchParams.get('id');
  const type = topic || body.type;
  const id   = dataId || body.data?.id;

  if (!type || !id) return json({ received: true });

  if (type !== 'preapproval' && type !== 'subscription_preapproval') {
    return json({ received: true, skipped: type });
  }

  const ACCESS_TOKEN  = env.MP_ACCESS_TOKEN;
  const SUPABASE_KEY  = env.SUPABASE_SERVICE_KEY;

  if (!ACCESS_TOKEN || !SUPABASE_KEY) return json({ error: 'Env vars não configuradas' }, 503);

  try {
    const mpRes = await fetch('https://api.mercadopago.com/preapproval/' + encodeURIComponent(id), {
      headers: { Authorization: 'Bearer ' + ACCESS_TOKEN },
    });
    const sub = await mpRes.json();
    if (!mpRes.ok) {
      // [FIX #14] Log erro
      await logIPNEvent(env, null, 'ipn_error', {
        subscriptionId: id,
        error: 'Falha ao buscar assinatura MP',
        raw: sub,
      });
      return json({ error: 'Falha ao buscar assinatura MP' }, 500);
    }

    const tenantId  = sub.external_reference;
    const mpStatus  = sub.status;
    const ativo = mpStatus === 'authorized';
    const STATUS_MAP = { authorized: 'authorized', paused: 'paused', cancelled: 'cancelled', pending: 'pendente' };
    const statusPagamento = STATUS_MAP[mpStatus] || mpStatus;

    // [FIX AUDIT4 #3] encodeURIComponent para consistencia defensiva
    await fetch(SUPABASE_URL + '/rest/v1/tenants?id=eq.' + encodeURIComponent(tenantId), {
      method:  'PATCH',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ ativo, status_pagamento: statusPagamento, mp_subscription_id: id }),
    });

    // [FIX #14] Log do IPN processado
    await logIPNEvent(env, tenantId, 'ipn_processed', {
      subscriptionId: id,
      status: mpStatus,
      raw: { status: mpStatus, ativo, payer_email: sub.payer_email || null },
    });

    console.log('IPN: tenant ' + tenantId + ' -> ' + mpStatus + ' (ativo=' + ativo + ')');
    return json({ ok: true, tenant: tenantId, status: mpStatus });
  } catch (err) {
    console.error('mp-ipn error:', err);

    await logIPNEvent(env, null, 'ipn_error', {
      subscriptionId: id,
      error: err.message || 'Erro interno',
    });

    return json({ error: 'Erro interno' }, 500);
  }
}