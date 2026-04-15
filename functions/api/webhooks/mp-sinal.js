// ── Webhook — mp-sinal (alias direto) ──────────────────────────────────────
// POST /api/webhooks/mp-sinal
// Endpoint dedicado caso voce queira configurar URL separada no MP.
// Fluxo normal: MP chama /api/mp-ipn (URL unica) e ele internamente roteia
// eventos de payment pro sinal-handler. Este endpoint existe como alternativa
// e pra testes diretos.

import { processMpSinal } from '../../_lib/mp-sinal-handler.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// Valida assinatura MP (v1 HMAC-SHA256). Fail-open se secret ausente.
async function verifyMpSig(request, env, dataId) {
  const secret = env.MP_WEBHOOK_SECRET;
  if (!secret) return { ok: true, reason: 'secret-missing' };
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
  const dataId = url.searchParams.get('data.id') || url.searchParams.get('id');
  let body = {};
  try { body = await request.json(); } catch {}
  const paymentId = dataId || body?.data?.id || body?.id;

  const sigCheck = await verifyMpSig(request, env, paymentId);
  if (!sigCheck.ok) {
    console.warn('webhooks/mp-sinal: assinatura invalida', sigCheck);
    return json({ error: 'invalid-signature' }, 401);
  }

  const result = await processMpSinal(env, paymentId);
  return json(result);
}
