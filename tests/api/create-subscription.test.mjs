// ── InkFlow — HTTP tests pra functions/api/create-subscription.js ─────────
// Spec: docs/superpowers/specs/2026-05-07-billing-tests-b3-design.md
// Auditoria: F2.4.2 (billing flow sem teste)
//
// IMPORTANTE: tests cobrem código existente em prod desde 2026-04 (Sprint 1).

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Constantes ──────────────────────────────────────────────────────────
const VALID_TENANT_UUID = '00000000-0000-0000-0000-000000000001';
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const MP_API = 'https://api.mercadopago.com';

// ─── Helpers locais (byte-identical com Tasks 1, 2, 3) ──────────────────
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

function makeCreateSubRequest(body) {
  return makeRequest('https://example.com/api/create-subscription', {
    method: 'POST',
    body,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────

// C1 — JSON body inválido → 400
test('create-subscription — C1: JSON body inválido → 400', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({});
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeRequest('https://example.com/api/create-subscription', {
      method: 'POST',
      body: '{invalid',
    });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'JSON inválido');
  });
});

// C2 — tenant_id ou plano missing (parameterized 2)
const C2_CASES = [
  ['tenant_id missing', { plano: 'individual' }],
  ['plano missing', { tenant_id: VALID_TENANT_UUID }],
];
for (const [label, body] of C2_CASES) {
  test(`create-subscription — C2: ${label} → 400`, async () => {
    const env = mockEnv();
    const handler = fetchMatcher({});
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/create-subscription.js');
      const req = makeCreateSubRequest(body);
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 400);
      const respBody = await res.json();
      assert.equal(respBody.error, 'tenant_id e plano são obrigatórios');
    });
  });
}

// C3 — plano inválido (fora de PLAN_IDS) → 400
test('create-subscription — C3: plano=unknown → 400', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({});
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeCreateSubRequest({ tenant_id: VALID_TENANT_UUID, plano: 'unknown', email: 'a@b.com' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Plano inválido: unknown');
  });
});

// C4 — trial bloqueado por feature flag ENABLE_TRIAL_V2='false' → 503
test('create-subscription — C4: trial bloqueado por flag → 503', async () => {
  const env = mockEnv({ ENABLE_TRIAL_V2: 'false' });
  const handler = fetchMatcher({});
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeCreateSubRequest({ tenant_id: VALID_TENANT_UUID, plano: 'trial' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'Trial temporariamente indisponível. Escolha um plano pago.');
  });
});

// C5 — trial HAPPY PATH → trial_ate ISO + ML add + payment_logs
test('create-subscription — C5: trial HAPPY PATH', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?id=eq.': () => jsonResponse({}, 200),
    'connect.mailerlite.com': () => jsonResponse({ id: 'ml-sub-1' }, 200),
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
  });
  const tStart = Date.now();
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeCreateSubRequest({
      tenant_id: VALID_TENANT_UUID,
      plano: 'trial',
      email: 'a@b.com',
    });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.trial, true);
    assert.match(body.trial_ate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    const trialMs = Date.parse(body.trial_ate);
    assert.ok(trialMs > tStart, 'trial_ate must be after now');
    assert.ok(trialMs < tStart + 8 * 24 * 60 * 60 * 1000, 'trial_ate must be < 8 days from now');
    const patchCall = handler.calls.find(c =>
      c.method === 'PATCH' && c.url.includes('/rest/v1/tenants?id=eq.'));
    assert.ok(patchCall, 'PATCH tenant must exist');
    const patchBody = JSON.parse(patchCall.body);
    assert.equal(patchBody.plano, 'trial');
    assert.equal(patchBody.status_pagamento, 'trial');
    assert.equal(patchBody.ativo, true);
    assert.match(patchBody.trial_ate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    const mlCall = handler.calls.find(c =>
      c.method === 'POST' && c.url.includes('connect.mailerlite.com'));
    assert.ok(mlCall, 'ML POST must exist');
    const mlBody = JSON.parse(mlCall.body);
    assert.deepEqual(mlBody.groups, ['group-trial-ativo']);
    const logCall = handler.calls.find(c => c.url.includes('/rest/v1/payment_logs'));
    assert.ok(logCall, 'payment_logs must exist');
    const logBody = JSON.parse(logCall.body);
    assert.equal(logBody.event_type, 'trial_started');
  });
});

// C6 — free legado → 200 trial:true zero downstream
test('create-subscription — C6: plano=free (legado) → 200 trial:true zero downstream', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({});
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeCreateSubRequest({ tenant_id: VALID_TENANT_UUID, plano: 'free' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { trial: true });
    assert.equal(handler.calls.length, 0);
  });
});

// C7 — email missing/inválido (parameterized 2)
const C7_CASES = [
  ['email undefined', undefined],
  ['email sem @', 'noatsign'],
];
for (const [label, email] of C7_CASES) {
  test(`create-subscription — C7: ${label} (plano pago) → 400`, async () => {
    const env = mockEnv();
    const handler = fetchMatcher({});
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/create-subscription.js');
      const req = makeCreateSubRequest({
        tenant_id: VALID_TENANT_UUID,
        plano: 'individual',
        email,
      });
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error, 'Email válido é obrigatório para processar o pagamento.');
    });
  });
}

// C8 — existing subscription authorized → 409 (zero MP calls)
test('create-subscription — C8: existing authorized subscription → 409', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?id=eq.': () => jsonResponse([{
      mp_subscription_id: 'mp-existing',
      status_pagamento: 'authorized',
    }]),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeCreateSubRequest({
      tenant_id: VALID_TENANT_UUID,
      plano: 'individual',
      email: 'a@b.com',
    });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, 'Este estúdio já possui uma assinatura ativa.');
    assert.equal(handler.calls.filter(c => c.url.includes('api.mercadopago.com')).length, 0);
  });
});

// C9 — MP_ACCESS_TOKEN missing → 503
test('create-subscription — C9: MP_ACCESS_TOKEN missing → 503', async () => {
  const env = mockEnv({ MP_ACCESS_TOKEN: undefined });
  const handler = fetchMatcher({});
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeCreateSubRequest({
      tenant_id: VALID_TENANT_UUID,
      plano: 'individual',
      email: 'a@b.com',
    });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'Gateway de pagamento não configurado.');
  });
});

// C10 — card_token HAPPY PATH → 200 status:authorized + body MP completo
test('create-subscription — C10: card_token HAPPY PATH', async () => {
  const env = mockEnv();
  const tStart = Date.now();
  const handler = fetchMatcher({
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') return jsonResponse([]);
      return jsonResponse({}, 200);
    },
    'mercadopago.com/preapproval': () => jsonResponse({
      id: 'mp-sub-1',
      status: 'authorized',
    }),
    'connect.mailerlite.com': () => jsonResponse({ id: 'ml-sub-1' }, 200),
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeCreateSubRequest({
      tenant_id: VALID_TENANT_UUID,
      plano: 'individual',
      email: 'a@b.com',
      card_token: 'ct-1',
      payment_method_id: 'visa',
      issuer_id: '25',
    });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.subscription_id, 'mp-sub-1');
    assert.equal(data.status, 'authorized');
    const mpCall = handler.calls.find(c =>
      c.method === 'POST' && c.url.includes('mercadopago.com/preapproval'));
    assert.ok(mpCall, 'MP POST must exist');
    const mpBody = JSON.parse(mpCall.body);
    assert.equal(mpBody.card_token_id, 'ct-1');
    assert.equal(mpBody.payer_email, 'a@b.com');
    assert.equal(mpBody.payment_method_id, 'visa');
    assert.equal(mpBody.issuer_id, '25');
    assert.equal(mpBody.status, 'authorized');
    assert.equal(mpBody.external_reference, VALID_TENANT_UUID);
    assert.equal(mpBody.back_url, 'https://inkflowbrasil.com/onboarding');
    assert.equal(mpBody.auto_recurring.frequency, 1);
    assert.equal(mpBody.auto_recurring.frequency_type, 'months');
    assert.equal(mpBody.auto_recurring.transaction_amount, 197);
    assert.equal(mpBody.auto_recurring.currency_id, 'BRL');
    assert.match(mpBody.auto_recurring.start_date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    const startMs = Date.parse(mpBody.auto_recurring.start_date);
    assert.ok(startMs > tStart + 4 * 60 * 1000, 'start_date must be > +4 min');
    assert.ok(startMs < tStart + 6 * 60 * 1000, 'start_date must be < +6 min');
    assert.ok(handler.calls.find(c =>
      c.method === 'POST' && c.url.includes('connect.mailerlite.com')), 'ML POST must exist');
    const patchCall = handler.calls.find(c =>
      c.method === 'PATCH' && c.url.includes('/rest/v1/tenants?id=eq.'));
    assert.ok(patchCall, 'PATCH tenant must exist');
    const patchBody = JSON.parse(patchCall.body);
    assert.equal(patchBody.mp_subscription_id, 'mp-sub-1');
    assert.equal(patchBody.status_pagamento, 'authorized');
    const logCall = handler.calls.find(c => c.url.includes('/rest/v1/payment_logs'));
    assert.ok(logCall, 'payment_logs must exist');
    const logBody = JSON.parse(logCall.body);
    assert.equal(logBody.event_type, 'subscription_created');
  });
});

// C11 — card_token MP retorna 400 erro → passthrough status + log error
test('create-subscription — C11: card_token MP retorna 400 → passthrough + subscription_error log', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') return jsonResponse([]);
      return jsonResponse({}, 200);
    },
    'mercadopago.com/preapproval': () => jsonResponse({
      message: 'invalid_token',
      cause: [{ description: 'Token inválido' }],
    }, 400),
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeCreateSubRequest({
      tenant_id: VALID_TENANT_UUID,
      plano: 'individual',
      email: 'a@b.com',
      card_token: 'ct-bad',
    });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Token inválido');
    const logCall = handler.calls.find(c => c.url.includes('/rest/v1/payment_logs'));
    assert.ok(logCall);
    const logBody = JSON.parse(logCall.body);
    assert.equal(logBody.event_type, 'subscription_error');
  });
});

// C12 — redirect HAPPY PATH (sem card_token) → 200 init_point + status:'pendente' HARDCODED
test('create-subscription — C12: redirect HAPPY PATH (sem card_token)', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') return jsonResponse([]);
      return jsonResponse({}, 200);
    },
    'mercadopago.com/preapproval': () => jsonResponse({
      id: 'mp-sub-2',
      init_point: 'https://mp.com/checkout/X',
      status: 'pending',
    }),
    'connect.mailerlite.com': () => jsonResponse({ id: 'ml-sub-1' }, 200),
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeCreateSubRequest({
      tenant_id: VALID_TENANT_UUID,
      plano: 'individual',
      email: 'a@b.com',
    });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.init_point, 'https://mp.com/checkout/X');
    assert.equal(data.subscription_id, 'mp-sub-2');
    const mpCall = handler.calls.find(c =>
      c.method === 'POST' && c.url.includes('mercadopago.com/preapproval'));
    assert.ok(mpCall);
    const mpBody = JSON.parse(mpCall.body);
    assert.equal(mpBody.payer_email, 'a@b.com');
    assert.equal(mpBody.back_url, 'https://inkflowbrasil.com/onboarding');
    assert.equal(mpBody.status, 'pending');
    assert.ok(!('card_token_id' in mpBody), 'redirect path must NOT have card_token_id');
    const patchCall = handler.calls.find(c =>
      c.method === 'PATCH' && c.url.includes('/rest/v1/tenants?id=eq.'));
    const patchBody = JSON.parse(patchCall.body);
    assert.equal(patchBody.status_pagamento, 'pendente');
    assert.equal(patchBody.mp_subscription_id, 'mp-sub-2');
    const logCall = handler.calls.find(c => c.url.includes('/rest/v1/payment_logs'));
    const logBody = JSON.parse(logCall.body);
    assert.equal(logBody.event_type, 'subscription_redirect');
  });
});
