// ── InkFlow — HTTP tests pra functions/api/validate-studio-token.js ────
// Spec: docs/superpowers/specs/2026-05-07-auth-tests-b2-http-endpoints-design.md
// Auditoria: F2.4.1 (auth tests) — par com B1 (#45)
//
// IMPORTANTE: tests cobrem código existente em prod desde abril/2026.
// Se um teste falhar, investigar se é bug no endpoint OU no teste — NUNCA
// ajustar teste pra mascarar bug.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

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

async function makeStudioToken(tenantId, env, ttlDays = 30) {
  const { generateStudioToken } = await import('../../functions/api/_auth-helpers.js');
  return generateStudioToken(tenantId, env.STUDIO_TOKEN_SECRET, ttlDays);
}

function mutateSig(token, mutator) {
  const parts = token.split('.');
  parts[3] = mutator(parts[3]);
  return parts.join('.');
}

function makeRequest(path, body, method = 'POST') {
  return new Request(`https://inkflowbrasil.com${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const TENANT_FULL = {
  id: VALID_UUID,
  nome_estudio: 'Ink', plano: 'estudio', email: 'a@b.com',
  evo_instance: 'inst', ativo: true, nome: 'Ana', welcome_shown: true,
  nome_agente: 'Bot', faq_texto: null,
  config_agente: null, config_precificacao: null,
  horario_funcionamento: null, duracao_sessao_padrao_h: null,
  sinal_percentual: null, gatilhos_handoff: null, portfolio_urls: null,
  tatuador_telegram_chat_id: null, tatuador_telegram_username: null,
  whatsapp_status: null,
  resumo_semanal_atual: null, resumo_semanal_ultima_geracao_manual: null,
  onboarding_key: 'mykey1234',
};

// ─── Tests ───────────────────────────────────────────────────────────────

// T11 — token < 10 chars → 400
test('validate-studio-token — T11: token < 10 chars → 400', async () => {
  const { onRequest } = await import('../../functions/api/validate-studio-token.js');
  const req = makeRequest('/api/validate-studio-token', { token: 'short' });
  const res = await onRequest({ request: req, env: mockEnv() });
  assert.equal(res.status, 400);
});

// T12 — JSON inválido → 400
test('validate-studio-token — T12: JSON inválido → 400', async () => {
  const { onRequest } = await import('../../functions/api/validate-studio-token.js');
  const req = new Request('https://inkflowbrasil.com/api/validate-studio-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{{{',
  });
  const res = await onRequest({ request: req, env: mockEnv() });
  assert.equal(res.status, 400);
});

// T13 — HMAC sig errada → cai no path legacy fallback → 401
test('validate-studio-token — T13: HMAC sig errada → 401', async () => {
  const env = mockEnv();
  const validToken = await makeStudioToken(VALID_UUID, env);
  const mutated = mutateSig(validToken, sig => sig.slice(0, -1) + 'x'); // preserva length
  const matcher = fetchMatcher([
    // bad-signature ≠ expired → lib continua pro path 2 → fetch tenants?studio_token=eq
    ['tenants?studio_token=eq', () => jsonResponse([])],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/validate-studio-token.js');
    const req = makeRequest('/api/validate-studio-token', { token: mutated });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.tenant, undefined, 'goal #2: não vaza tenant em token inválido');
  } finally { restore(); }
});

// T14 — HMAC expirado → 401 (lib retorna null pelo guard de expired, sem fetch)
test('validate-studio-token — T14: HMAC expirado → 401', async () => {
  const env = mockEnv();
  const expiredToken = await makeStudioToken(VALID_UUID, env, -1); // ttl negativo
  const { onRequest } = await import('../../functions/api/validate-studio-token.js');
  const req = makeRequest('/api/validate-studio-token', { token: expiredToken });
  const res = await onRequest({ request: req, env });
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.equal(json.tenant, undefined);
});

// T15 — UUID legacy + tenant não existe → 401
test('validate-studio-token — T15: UUID legacy + tenant não existe → 401', async () => {
  const legacyToken = '12345678-1234-1234-1234-123456789012';
  const matcher = fetchMatcher([
    ['tenants?studio_token=eq', () => jsonResponse([])],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/validate-studio-token.js');
    const req = makeRequest('/api/validate-studio-token', { token: legacyToken });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.tenant, undefined);
    // Apenas 1 fetch: legacy lookup falhou, não vai pro select pleno
    assert.equal(matcher.calls.length, 1, 'esperava 1 fetch (legacy lookup)');
  } finally { restore(); }
});

// T16 — UUID legacy + tenant existe → 200 + refreshed_token (legacy → HMAC promotion)
test('validate-studio-token — T16: UUID legacy → HMAC promotion', async () => {
  const legacyToken = '12345678-1234-1234-1234-123456789012';
  const matcher = fetchMatcher([
    // pattern 1: lookup legacy (verifyStudioTokenOrLegacy)
    ['tenants?studio_token=eq', () => jsonResponse([{ id: VALID_UUID }])],
    // pattern 2: select pleno do endpoint
    ['tenants?id=eq', () => jsonResponse([TENANT_FULL])],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/validate-studio-token.js');
    const req = makeRequest('/api/validate-studio-token', { token: legacyToken });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.valid, true);
    assert.equal(json.tenant.id, VALID_UUID);
    // refreshed_token deve ser HMAC novo
    assert.ok(json.refreshed_token, 'esperava refreshed_token (legacy promotion)');
    assert.ok(json.refreshed_token.startsWith('v1.'), 'refreshed_token deve começar com v1.');
    assert.equal(json.refreshed_token.split('.').length, 4, 'HMAC deve ter 4 segmentos');
    // path legacy não popula exp → token_exp é null
    assert.equal(json.token_exp, null, 'path legacy: token_exp = null');
    // 2 fetches: legacy lookup + select pleno
    assert.equal(matcher.calls.length, 2, 'esperava 2 fetches (legacy lookup + select pleno)');
  } finally { restore(); }
});

// T17 — HMAC válido + shouldRefresh=false (TTL 30d) → 200 sem refreshed_token
test('validate-studio-token — T17: HMAC válido sem refresh → 200', async () => {
  const env = mockEnv();
  const token = await makeStudioToken(VALID_UUID, env, 30);
  const matcher = fetchMatcher([
    ['tenants?id=eq', () => jsonResponse([TENANT_FULL])],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/validate-studio-token.js');
    const req = makeRequest('/api/validate-studio-token', { token });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.valid, true);
    assert.equal(json.tenant.id, VALID_UUID);
    assert.equal(json.refreshed_token, null, 'TTL 30d → sem refresh');
    // Apenas 1 fetch: HMAC válido pula legacy lookup
    assert.equal(matcher.calls.length, 1, 'esperava 1 fetch (select pleno apenas)');
  } finally { restore(); }
});

// T18 — HMAC válido + shouldRefresh=true (TTL 6.5d) → 200 com refreshed_token
test('validate-studio-token — T18: HMAC válido com sliding refresh', async () => {
  const env = mockEnv();
  const originalToken = await makeStudioToken(VALID_UUID, env, 6.5);
  const originalExp = parseInt(originalToken.split('.')[2], 10);
  const matcher = fetchMatcher([
    ['tenants?id=eq', () => jsonResponse([TENANT_FULL])],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/validate-studio-token.js');
    const req = makeRequest('/api/validate-studio-token', { token: originalToken });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.valid, true);
    assert.ok(json.refreshed_token, 'esperava refreshed_token (TTL < 7d)');
    assert.ok(json.refreshed_token.startsWith('v1.'));
    assert.equal(json.refreshed_token.split('.').length, 4);
    const newExp = parseInt(json.refreshed_token.split('.')[2], 10);
    assert.ok(newExp > originalExp, `exp(refreshed=${newExp}) deve ser > exp(original=${originalExp})`);
    assert.equal(matcher.calls.length, 1, 'esperava 1 fetch (select pleno apenas)');
  } finally { restore(); }
});

// T19 — HMAC válido + tenant não existe no DB → 404
test('validate-studio-token — T19: HMAC válido + tenant não existe → 404', async () => {
  const env = mockEnv();
  const token = await makeStudioToken(VALID_UUID, env);
  const matcher = fetchMatcher([
    ['tenants?id=eq', () => jsonResponse([])],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/validate-studio-token.js');
    const req = makeRequest('/api/validate-studio-token', { token });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 404);
    assert.equal(matcher.calls.length, 1, 'esperava 1 fetch (select pleno apenas)');
  } finally { restore(); }
});
