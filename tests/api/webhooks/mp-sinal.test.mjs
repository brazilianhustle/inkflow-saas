// ── InkFlow — HTTP tests pra functions/api/webhooks/mp-sinal.js ────────────
// Spec: docs/superpowers/specs/2026-05-07-billing-tests-b3-design.md
// Auditoria: F2.4.2 (billing flow sem teste)
//
// IMPORTANTE: tests cobrem código existente em prod desde 2026-05-04.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Constantes ──────────────────────────────────────────────────────────
const VALID_TENANT_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_AGENDAMENTO_UUID = '00000000-0000-0000-0000-000000000aaa';
const VALID_CONVERSA_UUID = '00000000-0000-0000-0000-000000000bbb';
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const MP_API = 'https://api.mercadopago.com';

// ─── Helpers locais (byte-identical com Tasks 1, 2, 4) ─────────────────
function mockEnv(overrides = {}) {
  return {
    MP_ACCESS_TOKEN: 'TEST-mp-token',
    MP_WEBHOOK_SECRET: 'test-webhook-secret-min-32-chars',
    SUPABASE_SERVICE_KEY: 'test-service-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    SITE_URL: 'https://inkflowbrasil.com',
    MAILERLITE_API_KEY: 'test-ml-key',
    MAILERLITE_GROUP_ID: '184387920768009398',
    MAILERLITE_GROUP_TRIAL_ATIVO: 'group-trial-ativo',
    MAILERLITE_GROUP_TRIAL_EXPIROU: 'group-trial-expirou',
    MAILERLITE_GROUP_CLIENTES_ATIVOS: 'group-clientes-ativos',
    TELEGRAM_BOT_TOKEN: 'test-telegram-token',
    TELEGRAM_CHAT_ID: 'test-chat-id',
    ENABLE_TRIAL_V2: 'true',
    ...overrides,
  };
}

async function withMockFetch(handler, fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await fn(handler); }
  finally { globalThis.fetch = orig; }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fetchMatcher(patterns) {
  const calls = [];
  const handler = async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body || null;
    calls.push({ url: String(url), method, body, ts: Date.now() });
    for (const [pattern, fn] of Object.entries(patterns)) {
      if (String(url).includes(pattern)) return fn({ url, method, body, init });
    }
    throw new Error(`fetchMatcher: no pattern matched ${method} ${url}`);
  };
  handler.calls = calls;
  return handler;
}

function makeRequest(url, opts = {}) {
  return new Request(url, {
    method: opts.method || 'POST',
    headers: opts.headers || { 'Content-Type': 'application/json' },
    body: opts.body !== undefined
      ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body))
      : undefined,
  });
}

// ─── HMAC helpers (makeMpSignature byte-identical com Task 2) ───────────
async function makeMpSignature(secret, dataId, requestId, ts) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(manifest));
  const hex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return `ts=${ts},v1=${hex}`;
}

// mp-sinal-specific: paymentId pode vir de URL query (?data.id=) OU body (body.data.id ou body.id)
// O sig é calculado com paymentId que o endpoint VAI USAR (URL > body.data.id > body.id).
async function makeSinalRequest({
  secret = 'test-webhook-secret-min-32-chars',
  paymentId = 'mp-data-id-123',
  requestId = 'req-id-456',
  ts = '1715000000',
  body = {},
  sigOverride = null,
  paymentIdLocation = 'url', // 'url' | 'body.data.id' | 'body.id'
  omitHeaders = false,
} = {}) {
  let url = `https://example.com/api/webhooks/mp-sinal`;
  let finalBody = { ...body };
  if (paymentIdLocation === 'url') {
    url += `?data.id=${encodeURIComponent(paymentId)}`;
  } else if (paymentIdLocation === 'body.data.id') {
    finalBody = { ...finalBody, data: { id: paymentId } };
  } else if (paymentIdLocation === 'body.id') {
    finalBody = { ...finalBody, id: paymentId };
  }
  const sig = sigOverride !== null
    ? sigOverride
    : await makeMpSignature(secret, paymentId, requestId, ts);
  const headers = omitHeaders
    ? { 'Content-Type': 'application/json' }
    : {
        'Content-Type': 'application/json',
        'x-signature': sig,
        'x-request-id': requestId,
      };
  return makeRequest(url, { method: 'POST', headers, body: finalBody });
}

// ─── Tests ───────────────────────────────────────────────────────────────

// M1 — MP_WEBHOOK_SECRET missing → fail-open + delega (sem log)
// INTENTIONAL: mp-sinal NÃO loga warning em fail-open (diverge de mp-ipn que loga).
// Divergência preservada — refator de unificação fica como backlog separado.
test('mp-sinal — M1: MP_WEBHOOK_SECRET missing → fail-open + delega (sem log)', async () => {
  const env = mockEnv({ MP_WEBHOOK_SECRET: undefined });
  const handler = fetchMatcher({
    '/v1/payments/': () => jsonResponse({
      external_reference: 'tenant-xyz',
      status: 'approved',
    }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../../functions/api/webhooks/mp-sinal.js');
    const req = await makeSinalRequest();
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    // Body é o resultado de processMpSinal (ignored:'not-a-sinal' aqui)
    assert.equal(body.ok, true);
    assert.equal(body.ignored, 'not-a-sinal');
    // Zero calls em payment_logs (INTENTIONAL: mp-sinal não loga fail-open warning)
    assert.equal(handler.calls.filter(c => c.url.includes('/rest/v1/payment_logs')).length, 0);
  });
});

// M2 — secret presente + sig válida → delega processMpSinal
test('mp-sinal — M2: HMAC valid → delega processMpSinal', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/v1/payments/': () => jsonResponse({
      external_reference: 'tenant-xyz',
      status: 'approved',
    }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../../functions/api/webhooks/mp-sinal.js');
    const req = await makeSinalRequest();
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    assert.equal(handler.calls.length, 1);
    assert.ok(handler.calls[0].url.includes('/v1/payments/'));
  });
});

// M3 — sig inválida ou malformada (parameterized 4 cases)
const M3_CASES = [
  ['sig wrong', { sigOverride: 'ts=123,v1=00deadbeef' }],
  ['v1= ausente', { sigOverride: 'ts=123' }],
  ['ts= ausente', { sigOverride: 'v1=00deadbeef' }],
  ['headers ausentes', { omitHeaders: true }],
];
for (const [label, opts] of M3_CASES) {
  test(`mp-sinal — M3: ${label} → 401 invalid-signature (zero downstream)`, async () => {
    const env = mockEnv();
    const handler = fetchMatcher({});
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../../functions/api/webhooks/mp-sinal.js');
      const req = await makeSinalRequest(opts);
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.error, 'invalid-signature');
      assert.equal(handler.calls.length, 0);
    });
  });
}

// M4 — paymentId via query.data.id / body.data.id / body.id (parameterized 3)
// Helper makeSinalRequest assina o paymentId que o endpoint VAI USAR (G6 critical).
const M4_LOCATIONS = ['url', 'body.data.id', 'body.id'];
for (const loc of M4_LOCATIONS) {
  test(`mp-sinal — M4: paymentId via ${loc} → processMpSinal called with correct id`, async () => {
    const env = mockEnv();
    const handler = fetchMatcher({
      '/v1/payments/': () => jsonResponse({
        external_reference: 'tenant-xyz',
        status: 'approved',
      }),
    });
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../../functions/api/webhooks/mp-sinal.js');
      const paymentId = 'pay-from-' + loc.replace(/\./g, '-');
      const req = await makeSinalRequest({ paymentId, paymentIdLocation: loc });
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 200);
      assert.equal(handler.calls.length, 1);
      assert.ok(handler.calls[0].url.includes('/v1/payments/' + paymentId),
        `MP fetch URL must include paymentId ${paymentId} (got ${handler.calls[0].url})`);
    });
  });
}

// M5 — processMpSinal retorna ignored (ex: not-a-sinal) → endpoint passa adiante
test('mp-sinal — M5: processMpSinal ignored → 200 com payload {ok:true, ignored:...}', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/v1/payments/': () => jsonResponse({
      external_reference: 'not-a-sinal-format',
      status: 'approved',
    }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../../functions/api/webhooks/mp-sinal.js');
    const req = await makeSinalRequest();
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.ignored, 'not-a-sinal');
    assert.equal(body.external_reference, 'not-a-sinal-format');
  });
});
