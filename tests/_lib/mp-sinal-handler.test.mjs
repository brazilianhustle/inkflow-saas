// ── InkFlow — unit tests pra functions/_lib/mp-sinal-handler.js ─────────────
// Spec: docs/superpowers/specs/2026-05-07-billing-tests-b3-design.md
// Auditoria: F2.4.2 (billing flow sem teste)
//
// IMPORTANTE: tests cobrem código existente em prod desde 2026-05-04.
// Se um teste falhar, investigar se é bug na lib OU no teste — NUNCA
// ajustar teste pra mascarar bug.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Constantes ──────────────────────────────────────────────────────────
const VALID_TENANT_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_AGENDAMENTO_UUID = '00000000-0000-0000-0000-000000000aaa';
const VALID_CONVERSA_UUID = '00000000-0000-0000-0000-000000000bbb';
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const MP_API = 'https://api.mercadopago.com';

// ─── Helpers locais ──────────────────────────────────────────────────────
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

// ─── Tests ───────────────────────────────────────────────────────────────

// L1 — MP_ACCESS_TOKEN missing → mp-not-configured
test('mp-sinal-handler — L1: MP_ACCESS_TOKEN missing → mp-not-configured', async () => {
  const env = mockEnv({ MP_ACCESS_TOKEN: undefined });
  const handler = fetchMatcher({});
  await withMockFetch(handler, async () => {
    const { processMpSinal } = await import('../../functions/_lib/mp-sinal-handler.js');
    const result = await processMpSinal(env, 'pay-1');
    assert.deepEqual(result, { ok: false, error: 'mp-not-configured' });
    assert.equal(handler.calls.length, 0);
  });
});

// L2 — paymentId null/undefined/'' → no-payment-id (parameterized 3)
for (const paymentId of [null, undefined, '']) {
  test(`mp-sinal-handler — L2: paymentId=${JSON.stringify(paymentId)} → no-payment-id`, async () => {
    const env = mockEnv();
    const handler = fetchMatcher({});
    await withMockFetch(handler, async () => {
      const { processMpSinal } = await import('../../functions/_lib/mp-sinal-handler.js');
      const result = await processMpSinal(env, paymentId);
      assert.deepEqual(result, { ok: true, ignored: 'no-payment-id' });
      assert.equal(handler.calls.length, 0);
    });
  });
}

// L3 — MP API 404 → payment-fetch-failed
test('mp-sinal-handler — L3: MP API 404 → payment-fetch-failed', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/v1/payments/': () => jsonResponse({ error: 'not_found' }, 404),
  });
  await withMockFetch(handler, async () => {
    const { processMpSinal } = await import('../../functions/_lib/mp-sinal-handler.js');
    const result = await processMpSinal(env, 'not-found');
    assert.deepEqual(result, { ok: true, ignored: 'payment-fetch-failed' });
    assert.equal(handler.calls.length, 1);
  });
});

// L4 — external_reference inválido → not-a-sinal (parameterized 3)
// Code: externalRef = payment.external_reference || ''. ref=null → externalRef=''.
for (const ref of ['tenant-abc', null, 'sinal:']) {
  test(`mp-sinal-handler — L4: external_reference=${JSON.stringify(ref)} → not-a-sinal`, async () => {
    const env = mockEnv();
    const handler = fetchMatcher({
      '/v1/payments/': () => jsonResponse({ external_reference: ref, status: 'approved' }),
    });
    await withMockFetch(handler, async () => {
      const { processMpSinal } = await import('../../functions/_lib/mp-sinal-handler.js');
      const result = await processMpSinal(env, 'pay-1');
      const expectedRef = ref || '';
      assert.deepEqual(result, { ok: true, ignored: 'not-a-sinal', external_reference: expectedRef });
      assert.equal(handler.calls.length, 1);
    });
  });
}

// L5 — payment.status !== 'approved' → not-approved (parameterized 2)
for (const status of ['pending', 'rejected']) {
  test(`mp-sinal-handler — L5: status=${status} → not-approved`, async () => {
    const env = mockEnv();
    const handler = fetchMatcher({
      '/v1/payments/': () => jsonResponse({
        external_reference: `sinal:${VALID_AGENDAMENTO_UUID}`,
        status,
      }),
    });
    await withMockFetch(handler, async () => {
      const { processMpSinal } = await import('../../functions/_lib/mp-sinal-handler.js');
      const result = await processMpSinal(env, 'pay-1');
      assert.deepEqual(result, {
        ok: true,
        ignored: 'not-approved',
        status,
        agendamento_id: VALID_AGENDAMENTO_UUID,
      });
      assert.equal(handler.calls.length, 1);
    });
  });
}

// L6 — PATCH agendamento 5xx → update-failed
test('mp-sinal-handler — L6: PATCH agendamento 5xx → update-failed', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/v1/payments/': () => jsonResponse({
      external_reference: `sinal:${VALID_AGENDAMENTO_UUID}`,
      status: 'approved',
    }),
    '/rest/v1/agendamentos': () => jsonResponse({ error: 'internal' }, 500),
  });
  await withMockFetch(handler, async () => {
    const { processMpSinal } = await import('../../functions/_lib/mp-sinal-handler.js');
    const result = await processMpSinal(env, 'pay-1');
    assert.deepEqual(result, {
      ok: true,
      ignored: 'update-failed',
      agendamento_id: VALID_AGENDAMENTO_UUID,
    });
    assert.equal(handler.calls.length, 2);
  });
});

// L7 — IDEMPOTÊNCIA: PATCH retorna [] (filtro &status=eq.tentative não bate)
// INTENTIONAL: idempotência via Postgres filter no PATCH; segundo webhook pro mesmo
// paymentId atinge 0 rows e cai em already-processed. Asserto a presença do filtro.
test('mp-sinal-handler — L7: PATCH retorna [] → already-processed (idempotência)', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/v1/payments/': () => jsonResponse({
      external_reference: `sinal:${VALID_AGENDAMENTO_UUID}`,
      status: 'approved',
    }),
    '/rest/v1/agendamentos': () => jsonResponse([]),
  });
  await withMockFetch(handler, async () => {
    const { processMpSinal } = await import('../../functions/_lib/mp-sinal-handler.js');
    const result = await processMpSinal(env, 'pay-1');
    assert.deepEqual(result, {
      ok: true,
      ignored: 'already-processed',
      agendamento_id: VALID_AGENDAMENTO_UUID,
    });
    assert.equal(handler.calls.length, 2);
    // INTENTIONAL: filter '&status=eq.tentative' is what makes idempotência work
    assert.ok(
      handler.calls[1].url.includes('&status=eq.tentative'),
      'PATCH agendamento URL must contain &status=eq.tentative for idempotência'
    );
  });
});

// L8 — HAPPY PATH com cliente_telefone → 5 calls em ordem
// INTENTIONAL: 5 calls (não 3) porque markConversaFechada (lifecycle) faz GET + PATCH
// internamente. Padrão read-then-write valida estado_agente antes de fechar.
test('mp-sinal-handler — L8: HAPPY PATH com cliente_telefone → 5 calls em ordem', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/v1/payments/': () => jsonResponse({
      external_reference: `sinal:${VALID_AGENDAMENTO_UUID}`,
      status: 'approved',
    }),
    '/rest/v1/agendamentos': () => jsonResponse([{
      id: VALID_AGENDAMENTO_UUID,
      cliente_telefone: '5511999',
      tenant_id: VALID_TENANT_UUID,
    }]),
    '/rest/v1/conversas?tenant_id=': () => jsonResponse([{ id: VALID_CONVERSA_UUID }]),
    '/rest/v1/conversas?id=': ({ method }) => {
      // Discriminate: GET (lifecycle read) vs PATCH (lifecycle write)
      if (method === 'GET') {
        return jsonResponse([{ dados_coletados: {}, estado_agente: 'aberto' }]);
      }
      return jsonResponse([{ id: VALID_CONVERSA_UUID, estado_agente: 'fechado' }]);
    },
  });
  await withMockFetch(handler, async () => {
    const { processMpSinal } = await import('../../functions/_lib/mp-sinal-handler.js');
    const result = await processMpSinal(env, 'pay-1');
    assert.deepEqual(result, {
      ok: true,
      processed: true,
      agendamento_id: VALID_AGENDAMENTO_UUID,
      status: 'confirmed',
      payment_id: 'pay-1',
    });
    // Calls (em ordem): MP GET → PATCH agendamento → PATCH conversa(tenant+phone)
    //                   → GET conversa(id) → PATCH conversa(id, neq.fechado)
    assert.equal(handler.calls.length, 5);
    assert.ok(handler.calls[0].url.includes('/v1/payments/'), 'call 0: MP GET payment');
    assert.equal(handler.calls[0].method, 'GET');
    assert.ok(handler.calls[1].url.includes('/rest/v1/agendamentos'), 'call 1: PATCH agendamento');
    assert.equal(handler.calls[1].method, 'PATCH');
    assert.ok(handler.calls[2].url.includes('/rest/v1/conversas?tenant_id='), 'call 2: PATCH conversa by tenant+phone');
    assert.equal(handler.calls[2].method, 'PATCH');
    assert.ok(handler.calls[3].url.includes('/rest/v1/conversas?id='), 'call 3: GET conversa by id (lifecycle read)');
    assert.equal(handler.calls[3].method, 'GET');
    assert.ok(handler.calls[4].url.includes('/rest/v1/conversas?id='), 'call 4: PATCH conversa (lifecycle write)');
    assert.equal(handler.calls[4].method, 'PATCH');
    assert.ok(handler.calls[4].url.includes('&estado_agente=neq.fechado'),
      'PATCH lifecycle URL must contain &estado_agente=neq.fechado filter');
  });
});

// L9 — HAPPY PATH sem cliente_telefone → 2 calls (conversa NÃO tocada)
test('mp-sinal-handler — L9: HAPPY PATH sem cliente_telefone → 2 calls', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/v1/payments/': () => jsonResponse({
      external_reference: `sinal:${VALID_AGENDAMENTO_UUID}`,
      status: 'approved',
    }),
    '/rest/v1/agendamentos': () => jsonResponse([{
      id: VALID_AGENDAMENTO_UUID,
      cliente_telefone: null,
      tenant_id: VALID_TENANT_UUID,
    }]),
  });
  await withMockFetch(handler, async () => {
    const { processMpSinal } = await import('../../functions/_lib/mp-sinal-handler.js');
    const result = await processMpSinal(env, 'pay-1');
    assert.equal(result.processed, true);
    assert.equal(result.agendamento_id, VALID_AGENDAMENTO_UUID);
    assert.equal(handler.calls.length, 2);
  });
});

// L10 — isSinalCandidateEvent type case-insensitive (parameterized 3)
for (const input of [{ type: 'payment' }, { type: 'PAYMENT' }, { type: 'Payment' }]) {
  test(`mp-sinal-handler — L10: isSinalCandidateEvent(${JSON.stringify(input)}) → true`, async () => {
    const { isSinalCandidateEvent } = await import('../../functions/_lib/mp-sinal-handler.js');
    assert.equal(isSinalCandidateEvent(input), true);
  });
}

// L11 — isSinalCandidateEvent type contains 'payment' (parameterized 2)
for (const input of [{ type: 'subscription_payment' }, { type: 'payment.created' }]) {
  test(`mp-sinal-handler — L11: isSinalCandidateEvent(${JSON.stringify(input)}) → true (contains 'payment')`, async () => {
    const { isSinalCandidateEvent } = await import('../../functions/_lib/mp-sinal-handler.js');
    assert.equal(isSinalCandidateEvent(input), true);
  });
}

// L12 — isSinalCandidateEvent topic fallback
test('mp-sinal-handler — L12: isSinalCandidateEvent({topic:"payment", type:undefined}) → true', async () => {
  const { isSinalCandidateEvent } = await import('../../functions/_lib/mp-sinal-handler.js');
  assert.equal(isSinalCandidateEvent({ topic: 'payment', type: undefined }), true);
});

// L13 — isSinalCandidateEvent falsy/non-payment (parameterized 4)
for (const input of [
  { type: 'preapproval' },
  { type: null, topic: null },
  {},
  { type: '', topic: '' },
]) {
  test(`mp-sinal-handler — L13: isSinalCandidateEvent(${JSON.stringify(input)}) → false`, async () => {
    const { isSinalCandidateEvent } = await import('../../functions/_lib/mp-sinal-handler.js');
    assert.equal(isSinalCandidateEvent(input), false);
  });
}
