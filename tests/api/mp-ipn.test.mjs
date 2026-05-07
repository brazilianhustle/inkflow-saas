// ── InkFlow — HTTP tests pra functions/api/mp-ipn.js ───────────────────────
// Spec: docs/superpowers/specs/2026-05-07-billing-tests-b3-design.md
// Auditoria: F2.4.2 (billing flow sem teste)
//
// IMPORTANTE: tests cobrem código existente em prod desde 2026-04 (Sprint 1).
// Se um teste falhar, investigar se é bug no endpoint OU no teste — NUNCA
// ajustar teste pra mascarar bug.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Constantes ──────────────────────────────────────────────────────────
const VALID_TENANT_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_AGENDAMENTO_UUID = '00000000-0000-0000-0000-000000000aaa';
const VALID_CONVERSA_UUID = '00000000-0000-0000-0000-000000000bbb';
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const MP_API = 'https://api.mercadopago.com';

// ─── Helpers locais (byte-identical com Task 1, 3, 4) ───────────────────
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

// ─── HMAC helpers (byte-identical com Task 3) ───────────────────────────
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

// IPN-specific: URL = ?type=<type>&data.id=<dataId>. Manifest assina dataId (URL-only).
async function makeIpnRequest({
  secret = 'test-webhook-secret-min-32-chars',
  dataId = 'mp-data-id-123',
  requestId = 'req-id-456',
  ts = '1715000000',
  type = 'preapproval',
  body = {},
  sigOverride = null,
} = {}) {
  const url = `https://example.com/api/mp-ipn?type=${type}&data.id=${encodeURIComponent(dataId)}`;
  const sig = sigOverride !== null
    ? sigOverride
    : await makeMpSignature(secret, dataId, requestId, ts);
  const headers = {
    'Content-Type': 'application/json',
    'x-signature': sig,
    'x-request-id': requestId,
  };
  return makeRequest(url, { method: 'POST', headers, body });
}

// ─── Tests ───────────────────────────────────────────────────────────────

// I1 — MP_WEBHOOK_SECRET missing → fail-open + warning log
// INTENTIONAL: mp-ipn LOGA warning quando secret missing (diverge de mp-sinal que NÃO loga)
test('mp-ipn — I1: MP_WEBHOOK_SECRET missing → fail-open + ipn_warning_no_secret log', async () => {
  const env = mockEnv({ MP_WEBHOOK_SECRET: undefined });
  const handler = fetchMatcher({
    '/preapproval/': () => jsonResponse({
      external_reference: VALID_TENANT_UUID,
      status: 'paused',
      payer_email: 'p@b',
    }),
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') return jsonResponse([{ plano: 'individual', nome_estudio: 'X', email: 'a@b' }]);
      return jsonResponse({}, 200);
    },
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    const req = await makeIpnRequest({ type: 'preapproval' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const warningLog = handler.calls.find(c =>
      c.url.includes('/rest/v1/payment_logs')
      && JSON.parse(c.body).event_type === 'ipn_warning_no_secret'
    );
    assert.ok(warningLog, 'ipn_warning_no_secret log must be present when secret missing');
  });
});

// I2 — secret presente + sig válida → 200 (HMAC ok, normal processing)
test('mp-ipn — I2: HMAC valid → 200 (no rejection)', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/preapproval/': () => jsonResponse({
      external_reference: VALID_TENANT_UUID,
      status: 'paused',  // paused evita ML+Telegram (simplifica mock)
      payer_email: 'p@b',
    }),
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') return jsonResponse([{ plano: 'individual', nome_estudio: 'X', email: 'a@b' }]);
      return jsonResponse({}, 200);
    },
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    const req = await makeIpnRequest();
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
  });
});

// I3 — secret presente + sig inválida → 401 + ipn_hmac_rejected log
test('mp-ipn — I3: HMAC invalid → 401 + ipn_hmac_rejected log', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    const req = await makeIpnRequest({ sigOverride: 'ts=123,v1=00deadbeef' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Assinatura invalida');
    assert.equal(handler.calls.length, 1);
    assert.ok(handler.calls[0].url.includes('/rest/v1/payment_logs'));
    const logBody = JSON.parse(handler.calls[0].body);
    assert.equal(logBody.event_type, 'ipn_hmac_rejected');
  });
});

// I4 — type/id ausente → received:true no-op (zero downstream)
// Setup: dataId='' faz searchParams.get retornar '' (falsy) → id=undefined → received:true
// Sig assinada com dataId='' (manifest 'id:;request-id:...;ts:...;') — HMAC passa
test('mp-ipn — I4: type/id ausente → received:true (zero downstream calls)', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({});
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    const req = await makeIpnRequest({ dataId: '' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { received: true });
    assert.equal(handler.calls.length, 0);
  });
});

// I5 — type=payment delega pra processMpSinal (lib é REAL, não mockada)
test('mp-ipn — I5: type=payment → delega processMpSinal', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/v1/payments/': () => jsonResponse({
      external_reference: 'tenant-abc',  // não-sinal → ignored:'not-a-sinal'
      status: 'approved',
    }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    const req = await makeIpnRequest({ type: 'payment' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.received, true);
    assert.equal(body.dispatched, 'sinal');
    assert.equal(handler.calls.length, 1);
    assert.ok(handler.calls[0].url.includes('/v1/payments/'));
  });
});

// I6 sub-case (a) — preapproval authorized HAPPY PATH com tenant snapshot completo
// Call count = 7: GET MP + GET tenant + PATCH tenant + DELETE ML + POST ML + Telegram + payment_logs
// (Spec original dizia 6 — esquecera GET MP preapproval. Corrigido pra refletir prod real.)
test('mp-ipn — I6a: preapproval authorized + snapshot completo → PATCH preço grandfathered + 7 calls', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/preapproval/': () => jsonResponse({
      external_reference: VALID_TENANT_UUID,
      status: 'authorized',
      payer_email: 'p@b',
    }),
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') {
        return jsonResponse([{ plano: 'individual', nome_estudio: 'X', email: 'a@b' }]);
      }
      return jsonResponse({}, 200);
    },
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
    'connect.mailerlite.com': ({ method }) => {
      if (method === 'DELETE') return jsonResponse({}, 200);
      return jsonResponse({ id: 'ml-sub-1' }, 200);
    },
    'api.telegram.org': () => jsonResponse({ ok: true }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    const req = await makeIpnRequest({ type: 'preapproval' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    assert.equal(handler.calls.length, 7);
    const patchCall = handler.calls.find(c =>
      c.method === 'PATCH' && c.url.includes('/rest/v1/tenants?id=eq.'));
    assert.ok(patchCall, 'PATCH tenant must be present');
    const patchBody = JSON.parse(patchCall.body);
    assert.equal(patchBody.ativo, true);
    assert.equal(patchBody.status_pagamento, 'authorized');
    assert.equal(patchBody.mp_subscription_id, 'mp-data-id-123');
    assert.equal(patchBody.preco_mensal, 197);  // PLANO_PRECO_BRL.individual
    assert.equal(patchBody.trial_ate, null);
    const telegramCall = handler.calls.find(c => c.url.includes('api.telegram.org'));
    const telegramBody = JSON.parse(telegramCall.body);
    assert.ok(telegramBody.text.includes('X'), 'Telegram body must include nome_estudio');
  });
});

// I6 sub-case (b) — preapproval authorized com snapshot vazio (tenants returna [])
// Snapshot vazio → tenantSnapshot={} → patchBody SEM preco_mensal/trial_ate.
// Email cai em fallback pra sub.payer_email → ML+Telegram disparam usando 'p@b'.
test('mp-ipn — I6b: preapproval authorized + snapshot vazio → PATCH sem preço, email payer_email', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/preapproval/': () => jsonResponse({
      external_reference: VALID_TENANT_UUID,
      status: 'authorized',
      payer_email: 'p@b',
    }),
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') return jsonResponse([]);
      return jsonResponse({}, 200);
    },
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
    'connect.mailerlite.com': ({ method }) => {
      if (method === 'DELETE') return jsonResponse({}, 200);
      return jsonResponse({ id: 'ml-sub-1' }, 200);
    },
    'api.telegram.org': () => jsonResponse({ ok: true }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    const req = await makeIpnRequest({ type: 'preapproval' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    assert.equal(handler.calls.length, 7);
    const patchCall = handler.calls.find(c =>
      c.method === 'PATCH' && c.url.includes('/rest/v1/tenants?id=eq.'));
    const patchBody = JSON.parse(patchCall.body);
    assert.equal(patchBody.ativo, true);
    assert.equal(patchBody.status_pagamento, 'authorized');
    assert.equal(patchBody.mp_subscription_id, 'mp-data-id-123');
    assert.ok(!('preco_mensal' in patchBody), 'preco_mensal must NOT be in patchBody when snapshot empty');
    assert.ok(!('trial_ate' in patchBody), 'trial_ate must NOT be in patchBody when snapshot empty');
    const mlPostCall = handler.calls.find(c =>
      c.method === 'POST' && c.url.includes('connect.mailerlite.com'));
    assert.ok(mlPostCall.url.includes('p%40b'), 'ML POST URL must include encoded payer_email');
  });
});

// I7 — ORDERING crítica em authorized: GET → PATCH → DELETE ML → POST ML → Telegram → log
test('mp-ipn — I7: side-effects ordering em authorized (GET<PATCH<DELETE_ML<POST_ML<Telegram<log)', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/preapproval/': () => jsonResponse({
      external_reference: VALID_TENANT_UUID,
      status: 'authorized',
      payer_email: 'p@b',
    }),
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') return jsonResponse([{ plano: 'individual', nome_estudio: 'X', email: 'a@b' }]);
      return jsonResponse({}, 200);
    },
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
    'connect.mailerlite.com': ({ method }) => {
      if (method === 'DELETE') return jsonResponse({}, 200);
      return jsonResponse({ id: 'ml-sub-1' }, 200);
    },
    'api.telegram.org': () => jsonResponse({ ok: true }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    const req = await makeIpnRequest({ type: 'preapproval' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const idx = (pred) => handler.calls.findIndex(pred);
    const iGet = idx(c => c.method === 'GET' && c.url.includes('/rest/v1/tenants?id=eq.'));
    const iPatch = idx(c => c.method === 'PATCH' && c.url.includes('/rest/v1/tenants?id=eq.'));
    const iDelML = idx(c => c.method === 'DELETE' && c.url.includes('connect.mailerlite.com'));
    const iPostML = idx(c => c.method === 'POST' && c.url.includes('connect.mailerlite.com'));
    const iTelegram = idx(c => c.url.includes('api.telegram.org'));
    const iLog = idx(c => c.url.includes('/rest/v1/payment_logs'));
    assert.ok(iGet >= 0, 'GET tenants snapshot must exist');
    assert.ok(iPatch >= 0, 'PATCH tenants must exist');
    assert.ok(iDelML >= 0, 'DELETE ML must exist');
    assert.ok(iPostML >= 0, 'POST ML must exist');
    assert.ok(iTelegram >= 0, 'Telegram must exist');
    assert.ok(iLog >= 0, 'payment_logs must exist');
    assert.ok(iGet < iPatch, 'GET snapshot must precede PATCH tenants');
    assert.ok(iPatch < iDelML, 'PATCH tenants must precede DELETE ML');
    assert.ok(iDelML < iPostML, 'DELETE ML must precede POST ML');
    assert.ok(iPostML < iTelegram, 'POST ML must precede Telegram');
    assert.ok(iTelegram < iLog, 'Telegram must precede payment_logs');
  });
});

// I8 — preapproval status cancelled/paused/pending (parameterized 3) — sem ML/Telegram
const STATUS_MAP_EXPECTED = { cancelled: 'cancelled', paused: 'paused', pending: 'pendente' };
for (const status of ['cancelled', 'paused', 'pending']) {
  test(`mp-ipn — I8: status=${status} → ativo:false, status_pagamento:${STATUS_MAP_EXPECTED[status]}, no ML/Telegram`, async () => {
    const env = mockEnv();
    const handler = fetchMatcher({
      '/preapproval/': () => jsonResponse({
        external_reference: VALID_TENANT_UUID,
        status,
        payer_email: 'p@b',
      }),
      '/rest/v1/tenants?id=eq.': ({ method }) => {
        if (method === 'GET') return jsonResponse([{ plano: 'individual', nome_estudio: 'X', email: 'a@b' }]);
        return jsonResponse({}, 200);
      },
      '/rest/v1/payment_logs': () => jsonResponse({}, 201),
    });
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/mp-ipn.js');
      const req = await makeIpnRequest({ type: 'preapproval' });
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 200);
      const patchCall = handler.calls.find(c =>
        c.method === 'PATCH' && c.url.includes('/rest/v1/tenants?id=eq.'));
      const patchBody = JSON.parse(patchCall.body);
      assert.equal(patchBody.ativo, false);
      assert.equal(patchBody.status_pagamento, STATUS_MAP_EXPECTED[status]);
      assert.equal(handler.calls.filter(c => c.url.includes('connect.mailerlite.com')).length, 0);
      assert.equal(handler.calls.filter(c => c.url.includes('api.telegram.org')).length, 0);
    });
  });
}

// I9 — type=invoice (não-payment, não-preapproval) → received:true skipped:'invoice'
test('mp-ipn — I9: type=invoice → received:true skipped:invoice (zero downstream)', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({});
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    const req = await makeIpnRequest({ type: 'invoice' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { received: true, skipped: 'invoice' });
    assert.equal(handler.calls.length, 0);
  });
});

// I10 — env vars críticas missing (parameterized 2: MP_ACCESS_TOKEN, SUPABASE_SERVICE_KEY)
for (const missingVar of ['MP_ACCESS_TOKEN', 'SUPABASE_SERVICE_KEY']) {
  test(`mp-ipn — I10: ${missingVar} missing → 503`, async () => {
    const env = mockEnv({ [missingVar]: undefined });
    const handler = fetchMatcher({});
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/mp-ipn.js');
      const req = await makeIpnRequest({ type: 'preapproval' });
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.error, 'Env vars não configuradas');
    });
  });
}

// I11 — MP API GET preapproval 500 → 500 + ipn_error log
test('mp-ipn — I11: MP API GET preapproval 500 → 500 + ipn_error log', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/preapproval/': () => jsonResponse({ message: 'mp internal' }, 500),
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    const req = await makeIpnRequest({ type: 'preapproval' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, 'Falha ao buscar assinatura MP');
    const logCall = handler.calls.find(c => c.url.includes('/rest/v1/payment_logs'));
    assert.ok(logCall, 'payment_logs call must be present');
    const logBody = JSON.parse(logCall.body);
    assert.equal(logBody.event_type, 'ipn_error');
  });
});
