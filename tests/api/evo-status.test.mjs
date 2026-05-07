// ── InkFlow — HTTP tests pra functions/api/evo-status.js ────────────────
// Spec: docs/superpowers/specs/2026-05-07-evolution-tests-b4-design.md
// Auditoria: F2.4.3

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Constantes ──────────────────────────────────────────────────────────
const VALID_TENANT_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_INSTANCE = 'inst_abc123';
const EVO_BASE = 'https://evo.test.local';

// ─── Helpers byte-identical com Tasks 1, 2, 3 ───────────────────────────
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
  const url = new URL('https://example.com/api/evo-status');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  return new Request(url.toString(), { method: 'GET' });
}

// ─── Tests ───────────────────────────────────────────────────────────────

// ES1 — Body inválido (sub-tests parameterized)
test('evo-status — ES1: body inválido → 400', async () => {
  const env = mockEnv();
  const cases = [
    { params: {}, expected: 'instance obrigatorio' },
    { params: { instance: 'inst@bad' }, expected: 'instance invalido' },
  ];
  for (const { params, expected } of cases) {
    const handler = fetchMatcher({});
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/evo-status.js');
      const req = makeRequest(params);
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 400, `failed for ${JSON.stringify(params)}`);
      const body = await res.json();
      assert.equal(body.error, expected);
      assert.equal(handler.calls.length, 0);
    });
  }
});

// ES2 — Tenant não encontrado → 404
test('evo-status — ES2: tenant não encontrado → 404', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?evo_instance=eq.': () => jsonResponse([]),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/evo-status.js');
    const req = makeRequest({ instance: VALID_INSTANCE });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'Instancia nao encontrada');
    assert.equal(handler.calls.length, 1);
  });
});

// ES3 — apikey ausente/'pending' → 425
test('evo-status — ES3: apikey ausente/pending → 425', async () => {
  const env = mockEnv();
  const apikeyCases = [null, 'pending'];
  for (const evo_apikey of apikeyCases) {
    const handler = fetchMatcher({
      '/rest/v1/tenants?evo_instance=eq.': () => jsonResponse([{
        evo_base_url: EVO_BASE, evo_apikey, ativo: true,
      }]),
    });
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/evo-status.js');
      const req = makeRequest({ instance: VALID_INSTANCE });
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 425, `failed for evo_apikey=${evo_apikey}`);
      const body = await res.json();
      assert.equal(body.error, 'Instancia ainda nao configurada');
      assert.equal(handler.calls.length, 1);
    });
  }
});

// ES4 — State extraction schema A: inst.instance.state (Evolution v1.x nested)
test('evo-status — ES4: state extraction inst.instance.state → open', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?evo_instance=eq.': () => jsonResponse([{
      evo_base_url: EVO_BASE, evo_apikey: 'tenant-apikey', ativo: true,
    }]),
    '/instance/fetchInstances?instanceName=': () => jsonResponse([{
      instance: { instanceName: VALID_INSTANCE, state: 'open' },
    }]),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/evo-status.js');
    const req = makeRequest({ instance: VALID_INSTANCE });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.state, 'open');
    assert.equal(handler.calls.length, 2);
  });
});

// ES5 — State extraction schema B: inst.state (Evolution v2.x flat)
test('evo-status — ES5: state extraction inst.state → connecting', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?evo_instance=eq.': () => jsonResponse([{
      evo_base_url: EVO_BASE, evo_apikey: 'tenant-apikey', ativo: true,
    }]),
    '/instance/fetchInstances?instanceName=': () => jsonResponse([{
      instanceName: VALID_INSTANCE, state: 'connecting',
    }]),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/evo-status.js');
    const req = makeRequest({ instance: VALID_INSTANCE });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.state, 'connecting');
    assert.equal(handler.calls.length, 2);
  });
});

// ES6 — State extraction schema C: inst.connectionStatus (Evolution v2.x alt + name field)
test('evo-status — ES6: state extraction inst.connectionStatus → close', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?evo_instance=eq.': () => jsonResponse([{
      evo_base_url: EVO_BASE, evo_apikey: 'tenant-apikey', ativo: true,
    }]),
    '/instance/fetchInstances?instanceName=': () => jsonResponse([{
      name: VALID_INSTANCE, connectionStatus: 'close',
    }]),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/evo-status.js');
    const req = makeRequest({ instance: VALID_INSTANCE });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.state, 'close');
    assert.equal(handler.calls.length, 2);
  });
});

// ES7 — Instance not found in response → state='unknown'
// INTENTIONAL: fallback 'unknown' intencional — quando Evolution não lista a instância
// (recém-deletada / busca cache stale), interface mostra 'unknown' em vez de erro
test('evo-status — ES7: instance not found → state=unknown', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?evo_instance=eq.': () => jsonResponse([{
      evo_base_url: EVO_BASE, evo_apikey: 'tenant-apikey', ativo: true,
    }]),
    '/instance/fetchInstances?instanceName=': () => jsonResponse([{
      instanceName: 'OUTRA-INSTANCIA', state: 'open',
    }]),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/evo-status.js');
    const req = makeRequest({ instance: VALID_INSTANCE });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.state, 'unknown');
    assert.equal(handler.calls.length, 2);
  });
});
