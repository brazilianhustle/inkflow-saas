// ── InkFlow — HTTP tests pra functions/api/validate-onboarding-key.js ───
// Spec: docs/superpowers/specs/2026-05-07-auth-tests-b2-http-endpoints-design.md
// Auditoria: F2.4.1 (auth tests) — par com B1 (#45)
//
// IMPORTANTE: tests cobrem código existente em prod desde abril/2026.
// Se um teste falhar, investigar se é bug no endpoint OU no teste — NUNCA
// ajustar teste pra mascarar bug.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Constantes ──────────────────────────────────────────────────────────
const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

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

// ─── Tests ───────────────────────────────────────────────────────────────

// T1 — input vazio ou key < 8 chars → 400
test('validate-onboarding-key — T1: input vazio ou key < 8 chars → 400', async () => {
  const { onRequest } = await import('../../functions/api/validate-onboarding-key.js');
  const cases = [{}, { key: '' }, { key: 'short' }];
  for (const body of cases) {
    const req = makeRequest('/api/validate-onboarding-key', body);
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 400, `case ${JSON.stringify(body)}`);
    const json = await res.json();
    assert.match(json.error, /Key inválida/i);
  }
});

// T2 — JSON inválido no body → 400
test('validate-onboarding-key — T2: JSON inválido no body → 400', async () => {
  const { onRequest } = await import('../../functions/api/validate-onboarding-key.js');
  const req = new Request('https://inkflowbrasil.com/api/validate-onboarding-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not-json{{{',
  });
  const res = await onRequest({ request: req, env: mockEnv() });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.match(json.error, /JSON/i);
});

// T3 — SUPABASE_SERVICE_KEY ausente → 503
test('validate-onboarding-key — T3: SUPABASE_SERVICE_KEY ausente → 503', async () => {
  const { onRequest } = await import('../../functions/api/validate-onboarding-key.js');
  const req = makeRequest('/api/validate-onboarding-key', { key: 'mykey1234' });
  const env = mockEnv({ SUPABASE_SERVICE_KEY: undefined });
  const res = await onRequest({ request: req, env });
  assert.equal(res.status, 503);
});

// T4 — Supabase 500 (DB error) → 500
test('validate-onboarding-key — T4: Supabase 500 → 500', async () => {
  const matcher = fetchMatcher([
    ['/rest/v1/onboarding_links?', () => new Response('boom', { status: 500 })],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/validate-onboarding-key.js');
    const req = makeRequest('/api/validate-onboarding-key', { key: 'mykey1234' });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 500);
    const json = await res.json();
    assert.match(json.error, /Erro ao verificar link/i);
  } finally { restore(); }
});

// T5 — link não encontrado → 200 valid:false
test('validate-onboarding-key — T5: link não encontrado → 200 valid:false', async () => {
  const matcher = fetchMatcher([
    ['/rest/v1/onboarding_links?', () => jsonResponse([])],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/validate-onboarding-key.js');
    const req = makeRequest('/api/validate-onboarding-key', { key: 'mykey1234' });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.valid, false);
    assert.match(json.error, /não encontrado/i);
  } finally { restore(); }
});

// T6 — link expirado → 200 valid:false
test('validate-onboarding-key — T6: link expirado → 200 valid:false', async () => {
  const matcher = fetchMatcher([
    ['/rest/v1/onboarding_links?', () => jsonResponse([{
      id: 'L6', key: 'mykey1234', plano: 'estudio', email: 'a@b.com',
      used: false, expires_at: '2020-01-01T00:00:00Z',
    }])],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/validate-onboarding-key.js');
    const req = makeRequest('/api/validate-onboarding-key', { key: 'mykey1234' });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.valid, false);
    assert.match(json.error, /expirado/i);
  } finally { restore(); }
});

// T7 — link used:true + tenant não existe → 200 valid:false (3 fetches: 1 links + 2 tenants)
test('validate-onboarding-key — T7: link used + tenant não existe → 200 valid:false', async () => {
  const matcher = fetchMatcher([
    ['/rest/v1/onboarding_links?', () => jsonResponse([{
      id: 'L7', key: 'mykey1234', plano: 'estudio', email: 'a@b.com',
      used: true, expires_at: '2099-01-01T00:00:00Z',
    }])],
    ['/rest/v1/tenants?', () => jsonResponse([])],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/validate-onboarding-key.js');
    const req = makeRequest('/api/validate-onboarding-key', { key: 'mykey1234' });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.valid, false);
    assert.match(json.error, /já foi utilizado/i);
    // Confirma que findTenant tentou email + onboarding_key (2 fetches em tenants?)
    const tenantsCalls = matcher.calls.filter(c => c.url.includes('/rest/v1/tenants?'));
    assert.equal(tenantsCalls.length, 2, 'esperava 2 fetches em tenants? (email + onboarding_key)');
  } finally { restore(); }
});

// T8 ⭐ — link used:true + tenant existe → reativa link (PATCH onboarding_links)
test('validate-onboarding-key — T8: link used + tenant existe → reativa link', async () => {
  const tenant = {
    id: VALID_UUID, ativo: true, welcome_shown: false,
    evo_instance: 'test_instance', nome: 'Ana', nome_estudio: 'Ink',
    nome_agente: 'Bot', email: 'a@b.com', cidade: 'SP', plano: 'estudio',
    config_precificacao: null, config_agente: null,
  };
  const matcher = fetchMatcher([
    ['/rest/v1/onboarding_links?', () => {
      // primeiro fetch é GET, segundo é PATCH (mesma URL pattern)
      return jsonResponse([{
        id: 'L8', key: 'mykey1234', plano: 'estudio', email: 'a@b.com',
        used: true, expires_at: '2099-01-01T00:00:00Z',
      }]);
    }],
    ['/rest/v1/tenants?', () => jsonResponse([tenant])],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/validate-onboarding-key.js');
    const req = makeRequest('/api/validate-onboarding-key', { key: 'mykey1234' });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.valid, true);
    assert.ok(json.tenant, 'esperava tenant no response');
    assert.equal(json.tenant.id, VALID_UUID);
    // Asserção crítica: PATCH foi disparado
    const patchCall = matcher.calls.find(c =>
      c.method === 'PATCH' && c.url.includes('onboarding_links?id=eq.L8'));
    assert.ok(patchCall, 'esperava PATCH em onboarding_links?id=eq.L8 (resetLinkUsed)');
  } finally { restore(); }
});

// T9 — link válido + tenant novo (não criado) → 200 valid:true sem tenant
test('validate-onboarding-key — T9: link válido + tenant novo → 200 sem tenant', async () => {
  const matcher = fetchMatcher([
    ['/rest/v1/onboarding_links?', () => jsonResponse([{
      id: 'L9', key: 'mykey1234', plano: 'estudio', email: 'a@b.com',
      used: false, expires_at: '2099-01-01T00:00:00Z',
    }])],
    ['/rest/v1/tenants?', () => jsonResponse([])],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/validate-onboarding-key.js');
    const req = makeRequest('/api/validate-onboarding-key', { key: 'mykey1234' });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.valid, true);
    assert.equal(json.plano, 'estudio');
    assert.equal(json.link_id, 'L9');
    assert.equal(json.tenant, undefined, 'tenant ausente quando não existe');
  } finally { restore(); }
});

// T10 — link válido + tenant existe (smart-resume) → 200 com tenant
test('validate-onboarding-key — T10: link válido + tenant existe (smart-resume)', async () => {
  const tenant = {
    id: VALID_UUID, ativo: true, welcome_shown: true,
    evo_instance: 'live_instance', nome: 'Ana', nome_estudio: 'Ink',
    nome_agente: 'Bot', email: 'a@b.com', cidade: 'SP', plano: 'estudio',
    config_precificacao: { faixa_a: 100 }, config_agente: { tom: 'casual' },
  };
  const matcher = fetchMatcher([
    ['/rest/v1/onboarding_links?', () => jsonResponse([{
      id: 'L10', key: 'mykey1234', plano: 'estudio', email: 'a@b.com',
      used: false, expires_at: '2099-01-01T00:00:00Z',
    }])],
    ['/rest/v1/tenants?', () => jsonResponse([tenant])],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/validate-onboarding-key.js');
    const req = makeRequest('/api/validate-onboarding-key', { key: 'mykey1234' });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.valid, true);
    assert.equal(json.tenant.id, VALID_UUID);
    assert.equal(json.tenant.welcome_shown, true);
    assert.equal(json.tenant.evo_instance, 'live_instance');
    assert.deepEqual(json.tenant.config_precificacao, { faixa_a: 100 });
  } finally { restore(); }
});
