// ── InkFlow — HTTP tests pra functions/api/evo-qr.js ────────────────────
// Spec: docs/superpowers/specs/2026-05-07-evolution-tests-b4-design.md
// Auditoria: F2.4.3

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Constantes ──────────────────────────────────────────────────────────
const VALID_TENANT_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_INSTANCE = 'inst_abc123';
const EVO_BASE = 'https://evo.test.local';

// ─── Helpers byte-identical com Tasks 1, 2, 4 ───────────────────────────
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
  const url = new URL('https://example.com/api/evo-qr');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  return new Request(url.toString(), { method: 'GET' });
}

// ─── Tests ───────────────────────────────────────────────────────────────

// EQ1 — Body inválido (sub-tests parameterized)
test('evo-qr — EQ1: body inválido → 400', async () => {
  const env = mockEnv();
  const cases = [
    { params: {}, expected: 'instance obrigatorio' },
    { params: { instance: 'inst@bad' }, expected: 'instance invalido' },
  ];
  for (const { params, expected } of cases) {
    const handler = fetchMatcher({});
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/evo-qr.js');
      const req = makeRequest(params);
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 400, `failed for ${JSON.stringify(params)}`);
      const body = await res.json();
      assert.equal(body.error, expected);
      assert.equal(handler.calls.length, 0);
    });
  }
});

// EQ2 — Tenant não encontrado → 404
test('evo-qr — EQ2: tenant não encontrado → 404', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?evo_instance=eq.': () => jsonResponse([]),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/evo-qr.js');
    const req = makeRequest({ instance: VALID_INSTANCE });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'Instancia nao encontrada');
    assert.equal(handler.calls.length, 1);
  });
});

// EQ3 — apikey ausente/'pending' → 425
test('evo-qr — EQ3: apikey ausente/pending → 425', async () => {
  const env = mockEnv();
  const apikeyCases = [null, 'pending'];
  for (const evo_apikey of apikeyCases) {
    const handler = fetchMatcher({
      '/rest/v1/tenants?evo_instance=eq.': () => jsonResponse([{
        evo_base_url: EVO_BASE, evo_apikey, ativo: true,
      }]),
    });
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/evo-qr.js');
      const req = makeRequest({ instance: VALID_INSTANCE });
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 425, `failed for evo_apikey=${evo_apikey}`);
      const body = await res.json();
      assert.equal(body.error, 'Instancia ainda nao configurada. Aguarde alguns segundos e tente novamente.');
      assert.equal(handler.calls.length, 1);
    });
  }
});

// EQ4 — Happy path 3 paths base64 parameterized
// INTENTIONAL: Evolution responde com 3 shapes diferentes — base64 direct, qrcode.base64 nested, code (legacy)
test('evo-qr — EQ4: happy path 3 paths base64', async () => {
  const env = mockEnv();
  const cases = [
    { evoData: { base64: 'data:image/png;base64,AAAA' }, expected: 'data:image/png;base64,AAAA', label: 'base64 direct' },
    { evoData: { qrcode: { base64: 'data:image/png;base64,BBBB' } }, expected: 'data:image/png;base64,BBBB', label: 'qrcode.base64 nested' },
    { evoData: { code: 'data:image/png;base64,CCCC' }, expected: 'data:image/png;base64,CCCC', label: 'code legacy' },
  ];
  for (const { evoData, expected, label } of cases) {
    const handler = fetchMatcher({
      '/rest/v1/tenants?evo_instance=eq.': () => jsonResponse([{
        evo_base_url: EVO_BASE, evo_apikey: 'tenant-apikey', ativo: true,
      }]),
      '/instance/connect/': () => jsonResponse(evoData),
    });
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/evo-qr.js');
      const req = makeRequest({ instance: VALID_INSTANCE });
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 200, `failed for ${label}`);
      const body = await res.json();
      assert.equal(body.base64, expected, `failed for ${label}`);
      assert.equal(handler.calls.length, 2);
    });
  }
});

// EQ5 — Evo /instance/connect retorna não-OK → 502
test('evo-qr — EQ5: Evo connect non-OK → 502', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?evo_instance=eq.': () => jsonResponse([{
      evo_base_url: EVO_BASE, evo_apikey: 'tenant-apikey', ativo: true,
    }]),
    '/instance/connect/': () => jsonResponse({}, 500),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/evo-qr.js');
    const req = makeRequest({ instance: VALID_INSTANCE });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error, 'Erro ao gerar QR code');
    assert.equal(handler.calls.length, 2);
  });
});
