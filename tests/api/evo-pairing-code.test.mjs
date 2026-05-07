// ── InkFlow — HTTP tests pra functions/api/evo-pairing-code.js ─────────
// Spec: docs/superpowers/specs/2026-05-07-evolution-tests-b4-design.md
// Auditoria: F2.4.3

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Constantes ──────────────────────────────────────────────────────────
const VALID_TENANT_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_INSTANCE = 'inst_abc123';
const VALID_NUMBER = '5511999999999';
const EVO_BASE = 'https://evo.test.local';

// ─── Helpers byte-identical com Tasks 1, 3, 4 ───────────────────────────
function mockEnv(overrides = {}) {
  return {
    EVO_BASE_URL: EVO_BASE,
    EVO_GLOBAL_KEY: 'test-global-key',
    N8N_WEBHOOK_URL: 'https://n8n.test.local/webhook/abc',
    N8N_WEBHOOK_SECRET: 'test-webhook-secret',
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

function makeRequest(params = {}) {
  const url = new URL('https://example.com/api/evo-pairing-code');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  return new Request(url.toString(), { method: 'GET' });
}

// ─── Tests ───────────────────────────────────────────────────────────────

// EP1 — Body inválido (sub-tests parameterized)
test('evo-pairing-code — EP1: body inválido → 400', async () => {
  const env = mockEnv();
  const cases = [
    { params: {}, expected: 'instance obrigatorio' },
    { params: { instance: VALID_INSTANCE }, expected: 'number obrigatorio' },
    { params: { instance: 'inst@bad', number: VALID_NUMBER }, expected: 'instance invalido' },
    { params: { instance: VALID_INSTANCE, number: '123' }, expected: 'Numero invalido. Use formato: 5511999999999 (codigo do pais + DDD + numero)' },
    { params: { instance: VALID_INSTANCE, number: '1234567890123456' }, expected: 'Numero invalido. Use formato: 5511999999999 (codigo do pais + DDD + numero)' },
  ];
  for (const { params, expected } of cases) {
    const handler = fetchMatcher({});
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/evo-pairing-code.js');
      const req = makeRequest(params);
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 400, `failed for ${JSON.stringify(params)}`);
      const body = await res.json();
      assert.equal(body.error, expected);
      assert.equal(handler.calls.length, 0);
    });
  }
});

// EP2 — Tenant não encontrado → 404
test('evo-pairing-code — EP2: tenant não encontrado → 404', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?evo_instance=eq.': () => jsonResponse([]),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/evo-pairing-code.js');
    const req = makeRequest({ instance: VALID_INSTANCE, number: VALID_NUMBER });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'Instancia nao encontrada');
    assert.equal(handler.calls.length, 1);
  });
});

// EP3 — apikey ausente/'pending' → 425
test('evo-pairing-code — EP3: apikey ausente/pending → 425', async () => {
  const env = mockEnv();
  const apikeyCases = [null, 'pending'];
  for (const evo_apikey of apikeyCases) {
    const handler = fetchMatcher({
      '/rest/v1/tenants?evo_instance=eq.': () => jsonResponse([{
        evo_base_url: EVO_BASE, evo_apikey, ativo: true,
      }]),
    });
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/evo-pairing-code.js');
      const req = makeRequest({ instance: VALID_INSTANCE, number: VALID_NUMBER });
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 425, `failed for evo_apikey=${evo_apikey}`);
      const body = await res.json();
      assert.equal(body.error, 'Instancia ainda nao configurada. Aguarde alguns segundos e tente novamente.');
      assert.equal(handler.calls.length, 1);
    });
  }
});

// EP4 — connectionState=open → 409 (já conectado)
test('evo-pairing-code — EP4: connectionState=open → 409', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?evo_instance=eq.': () => jsonResponse([{
      evo_base_url: EVO_BASE, evo_apikey: 'tenant-apikey', ativo: true,
    }]),
    '/instance/connectionState/': () => jsonResponse({ instance: { state: 'open' } }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/evo-pairing-code.js');
    const req = makeRequest({ instance: VALID_INSTANCE, number: VALID_NUMBER });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.ok(body.error.includes('já está conectado'));
    assert.equal(handler.calls.length, 2);
  });
});

// EP5 — connectionState=connecting → logout chamado, sleep stubbed, depois connect
// INTENTIONAL: sleep 1500ms stubbed via mock.method(globalThis, 'setTimeout', ...) — não
// validamos duração, só ORDEM (logout antes de connect via handler.calls)
test('evo-pairing-code — EP5: connectionState=connecting → logout + connect (sleep stubbed)', async () => {
  const env = mockEnv();
  const setTimeoutStub = mock.method(globalThis, 'setTimeout', (fn) => { fn(); return 0; });
  try {
    const handler = fetchMatcher({
      '/rest/v1/tenants?evo_instance=eq.': () => jsonResponse([{
        evo_base_url: EVO_BASE, evo_apikey: 'tenant-apikey', ativo: true,
      }]),
      '/instance/connectionState/': () => jsonResponse({ instance: { state: 'connecting' } }),
      '/instance/logout/': () => jsonResponse({ ok: true }),
      '/instance/connect/': () => jsonResponse({ pairingCode: '12345678' }),
    });
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/evo-pairing-code.js');
      const req = makeRequest({ instance: VALID_INSTANCE, number: VALID_NUMBER });
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.pairingCode, '1234-5678'); // formatado XXXX-XXXX
      assert.equal(handler.calls.length, 4);
      // Ordem cronológica: tenant lookup → connectionState → logout → connect
      const logoutIdx = handler.calls.findIndex(c =>
        c.url.includes('/instance/logout/') && c.method === 'DELETE');
      const connectIdx = handler.calls.findIndex(c =>
        c.url.includes('/instance/connect/') && c.method === 'GET');
      assert.ok(logoutIdx >= 0, 'logout must be called');
      assert.ok(connectIdx >= 0, 'connect must be called');
      assert.ok(logoutIdx < connectIdx, 'logout must precede connect');
    });
  } finally {
    setTimeoutStub.mock.restore();
  }
});

// EP6 — Happy path: connectionState=close → connect retorna pairingCode
// Sub-tests parameterized: pairingCode 8-char (formatado), 6-char (raw), ausente (404)
test('evo-pairing-code — EP6: connectionState=close → pairingCode (3 sub-cases)', async () => {
  const env = mockEnv();
  const cases = [
    { evoData: { pairingCode: '12345678' }, expectedStatus: 200, expectedCode: '1234-5678', label: '8-char formatted' },
    { evoData: { pairingCode: 'ABC123' }, expectedStatus: 200, expectedCode: 'ABC123', label: '6-char raw' },
    { evoData: {}, expectedStatus: 404, expectedCode: undefined, label: 'pairingCode missing' },
  ];
  for (const { evoData, expectedStatus, expectedCode, label } of cases) {
    const handler = fetchMatcher({
      '/rest/v1/tenants?evo_instance=eq.': () => jsonResponse([{
        evo_base_url: EVO_BASE, evo_apikey: 'tenant-apikey', ativo: true,
      }]),
      '/instance/connectionState/': () => jsonResponse({ instance: { state: 'close' } }),
      '/instance/connect/': () => jsonResponse(evoData),
    });
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/evo-pairing-code.js');
      const req = makeRequest({ instance: VALID_INSTANCE, number: VALID_NUMBER });
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, expectedStatus, `failed for ${label}`);
      const body = await res.json();
      if (expectedCode !== undefined) {
        assert.equal(body.pairingCode, expectedCode, `failed for ${label}`);
      } else {
        assert.ok(body.error.includes('Codigo de pareamento nao disponivel'));
      }
      assert.equal(handler.calls.length, 3);
    });
  }
});
