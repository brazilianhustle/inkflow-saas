// ── InkFlow — HTTP tests pra functions/api/evo-create-instance.js ───────
// Spec: docs/superpowers/specs/2026-05-07-evolution-tests-b4-design.md
// Auditoria: F2.4.3 (Evolution endpoints sem teste)
// Atualizado no cutover total do n8n (2026-05-14): webhook agora deriva de
// AGENT_INTERNAL_BASE_URL + WEBHOOK_SECRET. Spec do cutover: C1, C7, D2 em
// docs/superpowers/specs/2026-05-14-cutover-total-n8n-design.md
//
// IMPORTANTE: tests cobrem código existente em prod desde 2026-04 (Sprint 1).
// Se um teste falhar, investigar se é bug no endpoint OU no teste — NUNCA
// ajustar teste pra mascarar bug.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Constantes ──────────────────────────────────────────────────────────
const VALID_TENANT_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_INSTANCE = 'inst_abc123';
const EVO_BASE = 'https://evo.test.local';
const AGENT_BASE = 'https://inkflow-saas.pages.dev';
const WEBHOOK_URL = AGENT_BASE + '/api/whatsapp/inbound';

// ─── Helpers byte-identical com Tasks 2, 3, 4 ───────────────────────────
function mockEnv(overrides = {}) {
  return {
    EVO_BASE_URL: EVO_BASE,
    EVO_GLOBAL_KEY: 'test-global-key',
    AGENT_INTERNAL_BASE_URL: AGENT_BASE,
    WEBHOOK_SECRET: 'test-webhook-secret',
    SUPABASE_SERVICE_KEY: 'test-service-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
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

function makeRequest(body, opts = {}) {
  return new Request('https://example.com/api/evo-create-instance', {
    method: opts.method || 'POST',
    headers: opts.headers || { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────

// EC1 — body sem instanceName/tenant_id → 400
test('evo-create-instance — EC1: body sem campos obrigatórios → 400', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({});
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/evo-create-instance.js');
    const req = makeRequest({});
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'instanceName e tenant_id sao obrigatorios');
    assert.equal(handler.calls.length, 0);
  });
});

// EC2 — instanceName regex inválido → 400 (sub-tests parameterized)
test('evo-create-instance — EC2: instanceName regex inválido → 400', async () => {
  const env = mockEnv();
  const invalidNames = ['inst@bad', 'inst with space', 'a'.repeat(65)];
  for (const instanceName of invalidNames) {
    const handler = fetchMatcher({});
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/evo-create-instance.js');
      const req = makeRequest({ instanceName, tenant_id: VALID_TENANT_UUID });
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 400, `failed for ${instanceName}`);
      const body = await res.json();
      assert.equal(body.error, 'instanceName invalido (apenas letras, numeros, hifen e underscore)');
      assert.equal(handler.calls.length, 0);
    });
  }
});

// EC3 — Env vars ausentes → 503 (sub-tests parameterized)
test('evo-create-instance — EC3: env vars ausentes → 503', async () => {
  const missingCases = [
    { EVO_BASE_URL: undefined },
    { EVO_GLOBAL_KEY: undefined },
    { AGENT_INTERNAL_BASE_URL: undefined },
    { WEBHOOK_SECRET: undefined },
  ];
  for (const overrides of missingCases) {
    const env = mockEnv(overrides);
    const handler = fetchMatcher({});
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/evo-create-instance.js');
      const req = makeRequest({ instanceName: VALID_INSTANCE, tenant_id: VALID_TENANT_UUID });
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.error, 'Configuração interna ausente');
      assert.equal(handler.calls.length, 0);
    });
  }
});

// EC4 — Gate pgto: status refused/pending/cancelled bloqueia → 403
// ALLOWED em prod: ['authorized', 'approved', 'paid', 'artist_slot']
// BLOQUEADO em prod: ['refused', 'pending', 'cancelled', 'rascunho']
test('evo-create-instance — EC4: gate pgto bloqueia status refused/pending/cancelled', async () => {
  const env = mockEnv();
  const blockedStatuses = ['refused', 'pending', 'cancelled'];
  for (const status of blockedStatuses) {
    const handler = fetchMatcher({
      '/rest/v1/tenants?id=eq.': () => jsonResponse([{
        status_pagamento: status,
        plano: 'individual',
        trial_ate: null,
      }]),
    });
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/evo-create-instance.js');
      const req = makeRequest({ instanceName: VALID_INSTANCE, tenant_id: VALID_TENANT_UUID });
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 403, `failed for status=${status}`);
      const body = await res.json();
      assert.equal(body.code, 'payment_required');
      assert.equal(body.status_pagamento, status);
      assert.ok(body.error.includes('Pagamento nao confirmado'));
      assert.equal(handler.calls.length, 1);
    });
  }
});

// EC5 — Gate pgto: trial_ate futuro passa (status pending mas trial ativo)
test('evo-create-instance — EC5: trial_ate futuro passa gate', async () => {
  const env = mockEnv();
  const futureMs = Date.now() + 5 * 24 * 60 * 60 * 1000; // +5 dias
  const handler = fetchMatcher({
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') {
        return jsonResponse([{
          status_pagamento: 'pending',
          plano: 'individual',
          trial_ate: new Date(futureMs).toISOString(),
        }]);
      }
      return jsonResponse({}, 200);
    },
    '/instance/fetchInstances': () => jsonResponse([]),
    '/instance/create': () => jsonResponse({ hash: { apikey: 'KEY-FROM-CREATE' } }),
    '/webhook/set/': () => jsonResponse({ ok: true }),
    '/webhook/find/': () => jsonResponse({ enabled: true, base64: true, events: ['MESSAGES_UPSERT'] }),
    '/settings/set/': () => jsonResponse({ ok: true }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/evo-create-instance.js');
    const req = makeRequest({ instanceName: VALID_INSTANCE, tenant_id: VALID_TENANT_UUID });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.webhook_configured, true);
    assert.equal(handler.calls.length, 7);
  });
});

// EC6 — Gate pgto: free plan passa (isFreeTrial=true)
// NOTA: prod usa plano='trial' como o único isFreeTrial=true (vide functions/_lib/plans.js).
// O spec original mencionava 'free' mas isFreeTrial('free')→false em prod; corrigimos pra 'trial'
// pra refletir o comportamento real (free trial 7 dias).
test('evo-create-instance — EC6: plano trial passa gate via isFreeTrial', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') {
        return jsonResponse([{
          status_pagamento: 'pending',
          plano: 'trial',
          trial_ate: null,
        }]);
      }
      return jsonResponse({}, 200);
    },
    '/instance/fetchInstances': () => jsonResponse([]),
    '/instance/create': () => jsonResponse({ hash: { apikey: 'KEY-FROM-CREATE' } }),
    '/webhook/set/': () => jsonResponse({ ok: true }),
    '/webhook/find/': () => jsonResponse({ enabled: true, base64: true, events: ['MESSAGES_UPSERT'] }),
    '/settings/set/': () => jsonResponse({ ok: true }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/evo-create-instance.js');
    const req = makeRequest({ instanceName: VALID_INSTANCE, tenant_id: VALID_TENANT_UUID });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.webhook_configured, true);
    assert.equal(handler.calls.length, 7);
  });
});

// EC7 — Idempotência: instância já existe → already_existed=true, skip /instance/create
test('evo-create-instance — EC7: instance já existe → already_existed=true, skip create', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') {
        return jsonResponse([{ status_pagamento: 'authorized', plano: 'individual', trial_ate: null }]);
      }
      return jsonResponse({}, 200);
    },
    '/instance/fetchInstances': () => jsonResponse([{ hash: { apikey: 'EXISTING-KEY' } }]),
    '/webhook/set/': () => jsonResponse({ ok: true }),
    '/webhook/find/': () => jsonResponse({ enabled: true, base64: true, events: ['MESSAGES_UPSERT'] }),
    '/settings/set/': () => jsonResponse({ ok: true }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/evo-create-instance.js');
    const req = makeRequest({ instanceName: VALID_INSTANCE, tenant_id: VALID_TENANT_UUID });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.already_existed, true);
    assert.equal(body.webhook_configured, true);
    assert.equal(handler.calls.length, 6);
    // POST /instance/create NÃO foi chamado
    const createCall = handler.calls.find(c =>
      c.url.includes('/instance/create') && c.method === 'POST');
    assert.equal(createCall, undefined, '/instance/create should NOT be called when already exists');
  });
});

// EC8 — Apikey extraction: 5 paths parameterized
// INTENTIONAL: Evolution v1.x usa hash string, v2.x nested apikey, fallback paths cobrem variações
// NOTA: prod suporta `token` apenas no path de idempotência (/instance/fetchInstances), nao no
// /instance/create. O caso `token` é testado via fetchInstances (instância existente) — os outros 4
// via /instance/create (instância nova).
test('evo-create-instance — EC8: apikey extraction 5 paths', async () => {
  const env = mockEnv();
  const apikeyPaths = [
    { mock: { hash: { apikey: 'KEY-A' } }, expected: 'KEY-A', label: 'hash.apikey', viaCreate: true },
    { mock: { hash: 'KEY-B' }, expected: 'KEY-B', label: 'hash string', viaCreate: true },
    { mock: { instance: { apikey: 'KEY-C' } }, expected: 'KEY-C', label: 'instance.apikey', viaCreate: true },
    { mock: { apikey: 'KEY-D' }, expected: 'KEY-D', label: 'apikey direct', viaCreate: true },
    { mock: { token: 'KEY-E' }, expected: 'KEY-E', label: 'token (idempotency path)', viaCreate: false },
  ];
  for (const { mock: payload, expected, label, viaCreate } of apikeyPaths) {
    let patchBody = null;
    const handler = fetchMatcher({
      '/rest/v1/tenants?id=eq.': ({ method, body }) => {
        if (method === 'GET') {
          return jsonResponse([{ status_pagamento: 'authorized', plano: 'individual', trial_ate: null }]);
        }
        if (method === 'PATCH') {
          patchBody = JSON.parse(body);
          return jsonResponse({}, 200);
        }
        return jsonResponse({}, 200);
      },
      // Se viaCreate: fetchInstances vazio (vai criar). Senão: já existe com payload do path.
      '/instance/fetchInstances': () => viaCreate ? jsonResponse([]) : jsonResponse([payload]),
      '/instance/create': () => jsonResponse(payload),
      '/webhook/set/': () => jsonResponse({ ok: true }),
      '/webhook/find/': () => jsonResponse({ enabled: true, base64: true, events: ['MESSAGES_UPSERT'] }),
      '/settings/set/': () => jsonResponse({ ok: true }),
    });
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/evo-create-instance.js');
      const req = makeRequest({ instanceName: VALID_INSTANCE, tenant_id: VALID_TENANT_UUID });
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 200, `failed for path=${label}`);
      // viaCreate: 7 calls (gate + fetchInstances + create + SET + FIND + settings + PATCH)
      // !viaCreate: 6 calls (gate + fetchInstances + SET + FIND + settings + PATCH, skip create)
      assert.equal(handler.calls.length, viaCreate ? 7 : 6, `calls.length for path=${label}`);
      assert.ok(patchBody, `PATCH body must be set for path=${label}`);
      assert.equal(patchBody.evo_apikey, expected, `apikey path ${label}`);
      assert.equal(patchBody.evo_instance, VALID_INSTANCE);
    });
  }
});

// EC9 — Webhook formato A (nested-short, instance-key) succeed na 1ª tentativa
test('evo-create-instance — EC9: webhook formato A (nested-short) instance-key succeed', async () => {
  const env = mockEnv();
  let lastSetBody = null;
  const handler = fetchMatcher({
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') {
        return jsonResponse([{ status_pagamento: 'authorized', plano: 'individual', trial_ate: null }]);
      }
      return jsonResponse({}, 200);
    },
    '/instance/fetchInstances': () => jsonResponse([]),
    '/instance/create': () => jsonResponse({ hash: { apikey: 'KEY-FROM-CREATE' } }),
    '/webhook/set/': ({ body }) => {
      lastSetBody = JSON.parse(body);
      return jsonResponse({ ok: true });
    },
    '/webhook/find/': () => jsonResponse({ enabled: true, base64: true, events: ['MESSAGES_UPSERT'] }),
    '/settings/set/': () => jsonResponse({ ok: true }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/evo-create-instance.js');
    const req = makeRequest({ instanceName: VALID_INSTANCE, tenant_id: VALID_TENANT_UUID });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.webhook_configured, true);
    assert.equal(body.webhook_format, 'A:nested-short');
    assert.equal(body.webhook_key_used, 'instance-key');
    assert.equal(handler.calls.length, 7);
    // Asserto body do SET request: formato A nested-short
    assert.ok(lastSetBody.webhook, 'A format wraps in {webhook: {...}}');
    assert.equal(lastSetBody.webhook.enabled, true);
    assert.equal(lastSetBody.webhook.url, WEBHOOK_URL);
    assert.equal(lastSetBody.webhook.byEvents, false);
    assert.equal(lastSetBody.webhook.base64, true);
    assert.deepEqual(lastSetBody.webhook.events, ['MESSAGES_UPSERT']);
    assert.deepEqual(lastSetBody.webhook.headers, { 'x-webhook-secret': 'test-webhook-secret' });
  });
});

// EC10 — Webhook formato A falha + formato B (flat-long) succeed
// INTENTIONAL: comportamento de fallback intencional — Evolution v2.3.7 aceita formato A em
// algumas instâncias, formato B em outras (instâncias antigas migradas).
test('evo-create-instance — EC10: webhook A falha + B succeed', async () => {
  const env = mockEnv();
  const setBodies = [];
  let setCount = 0;
  const handler = fetchMatcher({
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') {
        return jsonResponse([{ status_pagamento: 'authorized', plano: 'individual', trial_ate: null }]);
      }
      return jsonResponse({}, 200);
    },
    '/instance/fetchInstances': () => jsonResponse([]),
    '/instance/create': () => jsonResponse({ hash: { apikey: 'KEY-FROM-CREATE' } }),
    '/webhook/set/': ({ body }) => {
      setCount++;
      setBodies.push(JSON.parse(body));
      // 1ª chamada (formato A) → 500; 2ª chamada (formato B) → 200
      return jsonResponse({}, setCount === 1 ? 500 : 200);
    },
    '/webhook/find/': () => jsonResponse({ enabled: true, webhookBase64: true, events: ['MESSAGES_UPSERT'] }),
    '/settings/set/': () => jsonResponse({ ok: true }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/evo-create-instance.js');
    const req = makeRequest({ instanceName: VALID_INSTANCE, tenant_id: VALID_TENANT_UUID });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.webhook_configured, true);
    assert.equal(body.webhook_format, 'B:flat-long');
    assert.equal(body.webhook_key_used, 'instance-key');
    assert.equal(handler.calls.length, 8);
    // Asserto bodies enviados — formato A (nested-short) primeiro, depois B (flat-long)
    assert.ok(setBodies[0].webhook, 'first attempt (A) is nested');
    assert.equal(setBodies[1].webhook, undefined, 'second attempt (B) is flat (no webhook key)');
    assert.equal(setBodies[1].enabled, true);
    assert.equal(setBodies[1].webhookByEvents, false);
    assert.equal(setBodies[1].webhookBase64, true);
  });
});

// EC11 — Webhook todos 6 attempts falham (3 formatos × 2 keys) → 502
// Mock: SET retorna 200 mas FIND retorna {enabled: false} (webhookIsCorrect fails)
test('evo-create-instance — EC11: todos 6 webhook attempts falham → 502 + apikey ainda salva', async () => {
  const env = mockEnv();
  let patchCalled = false;
  const handler = fetchMatcher({
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') {
        return jsonResponse([{ status_pagamento: 'authorized', plano: 'individual', trial_ate: null }]);
      }
      if (method === 'PATCH') {
        patchCalled = true;
        return jsonResponse({}, 200);
      }
      return jsonResponse({}, 200);
    },
    '/instance/fetchInstances': () => jsonResponse([]),
    '/instance/create': () => jsonResponse({ hash: { apikey: 'KEY-FROM-CREATE' } }),
    '/webhook/set/': () => jsonResponse({ ok: true }), // 200 mas...
    '/webhook/find/': () => jsonResponse({ enabled: false }), // FIND retorna webhook desabilitado
    '/settings/set/': () => jsonResponse({ ok: true }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/evo-create-instance.js');
    const req = makeRequest({ instanceName: VALID_INSTANCE, tenant_id: VALID_TENANT_UUID });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.webhook_configured, false);
    assert.equal(body.instanceName, VALID_INSTANCE);
    assert.equal(body.already_existed, false);
    assert.ok(body.error.includes('webhook não configurou'));
    // Total: 1 gate + 1 fetchInstances + 1 create + 12 webhook (6 SET + 6 FIND) + 1 settings + 1 PATCH = 17
    assert.equal(handler.calls.length, 17);
    // PATCH ocorreu mesmo com webhook fail
    assert.ok(patchCalled, 'PATCH tenant must be called even when webhook fails');
  });
});

// EC12 — Side-effect ordering completo (happy path)
// Sequência cronológica: gate → idempotency → create → webhook SET → webhook FIND → settings → PATCH
test('evo-create-instance — EC12: side-effect ordering cronológico (7 calls em ordem)', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') {
        return jsonResponse([{ status_pagamento: 'authorized', plano: 'individual', trial_ate: null }]);
      }
      return jsonResponse({}, 200);
    },
    '/instance/fetchInstances': () => jsonResponse([]),
    '/instance/create': () => jsonResponse({ hash: { apikey: 'KEY-FROM-CREATE' } }),
    '/webhook/set/': () => jsonResponse({ ok: true }),
    '/webhook/find/': () => jsonResponse({ enabled: true, base64: true, events: ['MESSAGES_UPSERT'] }),
    '/settings/set/': () => jsonResponse({ ok: true }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/evo-create-instance.js');
    const req = makeRequest({ instanceName: VALID_INSTANCE, tenant_id: VALID_TENANT_UUID });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    assert.equal(handler.calls.length, 7);
    // Ordem cronológica via handler.calls (push em ordem de invocação)
    const expectedOrder = [
      { method: 'GET', urlContains: '/rest/v1/tenants?id=eq.' },           // 1: gate
      { method: 'GET', urlContains: '/instance/fetchInstances' },          // 2: idempotency
      { method: 'POST', urlContains: '/instance/create' },                  // 3: create
      { method: 'POST', urlContains: '/webhook/set/' },                     // 4: webhook SET
      { method: 'GET', urlContains: '/webhook/find/' },                     // 5: webhook FIND
      { method: 'POST', urlContains: '/settings/set/' },                    // 6: settings
      { method: 'PATCH', urlContains: '/rest/v1/tenants?id=eq.' },         // 7: PATCH apikey
    ];
    for (let i = 0; i < expectedOrder.length; i++) {
      const expected = expectedOrder[i];
      const actual = handler.calls[i];
      assert.equal(actual.method, expected.method, `call[${i}] method`);
      assert.ok(actual.url.includes(expected.urlContains),
        `call[${i}] url ${actual.url} should contain ${expected.urlContains}`);
    }
  });
});

// EC13 — Evo /instance/create network error → 502
test('evo-create-instance — EC13: /instance/create network error → 502', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?id=eq.': () => jsonResponse([{
      status_pagamento: 'authorized',
      plano: 'individual',
      trial_ate: null,
    }]),
    '/instance/fetchInstances': () => jsonResponse([]),
    '/instance/create': () => { throw new Error('network failure'); },
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/evo-create-instance.js');
    const req = makeRequest({ instanceName: VALID_INSTANCE, tenant_id: VALID_TENANT_UUID });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error, 'Erro de conexao com a Evolution API. Tente novamente.');
    assert.equal(handler.calls.length, 3);
  });
});
