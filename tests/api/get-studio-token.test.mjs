// ── InkFlow — HTTP tests pra functions/api/get-studio-token.js ─────────
// Spec: docs/superpowers/specs/2026-05-07-auth-tests-b2-http-endpoints-design.md
// Auditoria: F2.4.1 (auth tests) — par com B1 (#45)
//
// IMPORTANTE: tests cobrem código existente em prod desde abril/2026.
// Se um teste falhar, investigar se é bug no endpoint OU no teste — NUNCA
// ajustar teste pra mascarar bug.
//
// fetchMatcher patterns importantes (get-studio-token faz 2 fetches em
// tenants?id=eq.<tid> com select= diferente — precisa diferenciar):
// - 'tenants?id=eq.X&select=onboarding_key' (verifyOnboardingKey step1)
// - 'onboarding_links?key=eq' (TTL check dentro de verifyOnboardingKey)
// - 'tenants?id=eq.X&select=plano,ativo' (lookup plano no endpoint)

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Constantes ──────────────────────────────────────────────────────────
const VALID_UUID = '00000000-0000-0000-0000-000000000001';

// ─── Helpers locais ──────────────────────────────────────────────────────
function mockEnv(overrides = {}) {
  return {
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    SUPABASE_SERVICE_KEY: 'test-service-key',
    STUDIO_TOKEN_SECRET: 'test-secret-min-32-chars-padding-padding',
    ...overrides,
  };
}

function withMockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

function fetchMatcher(routes) {
  const calls = [];
  const handler = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body });
    for (const [pattern, response] of routes) {
      if (url.includes(pattern)) return response();
    }
    throw new Error(`unmocked fetch: ${url}`);
  };
  handler.calls = calls;
  return handler;
}

function makeRequest(path, body, method = 'POST') {
  return new Request(`https://inkflowbrasil.com${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// Mock de step1 (verifyOnboardingKey OK) reutilizado em T25-T27. step1 faz 2
// fetches: tenant.onboarding_key match + onboarding_links.expires_at TTL check.
// Reuso evita repetir o mesmo bloco em cada cenário de step2 (lookup plano).
const STEP1_OK_ROUTES = [
  ['tenants?id=eq.' + VALID_UUID + '&select=onboarding_key',
   () => jsonResponse([{ onboarding_key: 'mykey1234' }])],
  ['onboarding_links?key=eq',
   () => jsonResponse([{ expires_at: '2099-01-01T00:00:00Z' }])],
];

// ─── Tests ───────────────────────────────────────────────────────────────

// T20 — falta tenant_id ou onboarding_key → 400
test('get-studio-token — T20: missing fields → 400', async () => {
  const { onRequest } = await import('../../functions/api/get-studio-token.js');
  const cases = [{}, { tenant_id: VALID_UUID }, { onboarding_key: 'mykey1234' }];
  for (const body of cases) {
    const req = makeRequest('/api/get-studio-token', body);
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 400, `case ${JSON.stringify(body)}`);
  }
});

// T21 — JSON inválido → 400
test('get-studio-token — T21: JSON inválido → 400', async () => {
  const { onRequest } = await import('../../functions/api/get-studio-token.js');
  const req = new Request('https://inkflowbrasil.com/api/get-studio-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{{{',
  });
  const res = await onRequest({ request: req, env: mockEnv() });
  assert.equal(res.status, 400);
});

// T22 — SB_KEY ausente → 503
test('get-studio-token — T22: SB_KEY ausente → 503', async () => {
  const { onRequest } = await import('../../functions/api/get-studio-token.js');
  const req = makeRequest('/api/get-studio-token', {
    tenant_id: VALID_UUID, onboarding_key: 'mykey1234',
  });
  const env = mockEnv({
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    SUPABASE_SERVICE_KEY: undefined,
  });
  const res = await onRequest({ request: req, env });
  assert.equal(res.status, 503);
});

// T23 — verifyOnboardingKey rejeita (key mismatch) → 403
test('get-studio-token — T23: key mismatch → 403', async () => {
  const matcher = fetchMatcher([
    ['tenants?id=eq.' + VALID_UUID + '&select=onboarding_key',
     () => jsonResponse([{ onboarding_key: 'different-key' }])],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/get-studio-token.js');
    const req = makeRequest('/api/get-studio-token', {
      tenant_id: VALID_UUID, onboarding_key: 'mykey1234',
    });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.match(json.error, /Autenticação falhou/i);
    // Mismatch: step1 aborta no 1º fetch, sem TTL check nem step2.
    assert.equal(matcher.calls.length, 1, 'esperava 1 fetch (apenas onboarding_key lookup)');
  } finally { restore(); }
});

// T24 — verifyOnboardingKey rejeita (tenant não existe) → 403
test('get-studio-token — T24: tenant não existe → 403', async () => {
  const matcher = fetchMatcher([
    ['tenants?id=eq.' + VALID_UUID + '&select=onboarding_key',
     () => jsonResponse([])],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/get-studio-token.js');
    const req = makeRequest('/api/get-studio-token', {
      tenant_id: VALID_UUID, onboarding_key: 'mykey1234',
    });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 403);
    // Tenant inexistente: step1 aborta no 1º fetch, sem TTL check nem step2.
    assert.equal(matcher.calls.length, 1, 'esperava 1 fetch (apenas onboarding_key lookup)');
  } finally { restore(); }
});

// T25 — tenant existe na step1 mas não na step2 (lookup plano) → 404
test('get-studio-token — T25: tenant não existe no select de plano → 404', async () => {
  const matcher = fetchMatcher([
    ...STEP1_OK_ROUTES,
    ['tenants?id=eq.' + VALID_UUID + '&select=plano,ativo',
     () => jsonResponse([])],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/get-studio-token.js');
    const req = makeRequest('/api/get-studio-token', {
      tenant_id: VALID_UUID, onboarding_key: 'mykey1234',
    });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 404);
  } finally { restore(); }
});

// T26 — plano inválido ('free') → 400
test('get-studio-token — T26: plano inválido → 400', async () => {
  const matcher = fetchMatcher([
    ...STEP1_OK_ROUTES,
    ['tenants?id=eq.' + VALID_UUID + '&select=plano,ativo',
     () => jsonResponse([{ plano: 'free', ativo: true }])],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/get-studio-token.js');
    const req = makeRequest('/api/get-studio-token', {
      tenant_id: VALID_UUID, onboarding_key: 'mykey1234',
    });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.match(json.error, /Plano não reconhecido/i);
  } finally { restore(); }
});

// T27 — happy path → 200 com token + link + expires_at
test('get-studio-token — T27: happy path → 200', async () => {
  const matcher = fetchMatcher([
    ...STEP1_OK_ROUTES,
    ['tenants?id=eq.' + VALID_UUID + '&select=plano,ativo',
     () => jsonResponse([{ plano: 'estudio', ativo: true }])],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/get-studio-token.js');
    const req = makeRequest('/api/get-studio-token', {
      tenant_id: VALID_UUID, onboarding_key: 'mykey1234',
    });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.token.startsWith('v1.'), 'token deve começar com v1.');
    assert.equal(json.token.split('.').length, 4, 'HMAC = 4 segmentos');
    assert.equal(
      json.link,
      `https://inkflowbrasil.com/studio.html?token=${json.token}&welcome=true`,
      'link deve ter formato exato'
    );
    const now = Math.floor(Date.now() / 1000);
    assert.ok(json.expires_at > now, `expires_at(${json.expires_at}) > now(${now})`);
  } finally { restore(); }
});
