// ── InkFlow — HTTP tests pra functions/api/request-studio-link.js ─────
// Spec: docs/superpowers/specs/2026-05-07-auth-tests-b2-http-endpoints-design.md
// Auditoria: F2.4.1 (auth tests) — par com B1 (#45)
//
// IMPORTANTE: tests cobrem código existente em prod desde abril/2026.
// Se um teste falhar, investigar se é bug no endpoint OU no teste — NUNCA
// ajustar teste pra mascarar bug.
//
// Garantias de segurança que estes tests protegem:
// 1. Endpoint SEMPRE retorna 200 quando passa input + env válidos —
//    não vaza se email/telefone existe (anti-enumeration). Ver T30/T34.
// 2. Phone é normalizado ANTES do lookup (11999999999 → 5511999999999).
//    Ver T31.
//
// mockEnv aqui é EXPANDIDO (4 vars extras vs outros arquivos do B2):
// EVO_CENTRAL_INSTANCE, EVO_CENTRAL_APIKEY, MAILERLITE_API_KEY, EVO_BASE_URL.
// Sem essas, sendViaWhatsApp/sendViaEmail retornam {sent:false, reason:'not-configured'}
// ANTES do mock fetch ser chamado — testes T31-T33 viram falsos positivos
// (channels_tried=[] mesmo com mock OK).

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
    EVO_CENTRAL_INSTANCE: 'inkflow_central',
    EVO_CENTRAL_APIKEY: 'test-evo-key',
    MAILERLITE_API_KEY: 'test-ml-key',
    EVO_BASE_URL: 'https://evo.test.example',
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

// Shape mínimo obrigatório do tenant em T31-T34. CRITICAL: sendViaWhatsApp lê
// `tenant.telefone` (NÃO o phone do input) e chama normalizePhoneBR nele —
// sem essa field, retorna {sent:false, reason:'no-phone'} antes do mock fetch
// e o teste de canal whatsapp falha silenciosamente (channels_tried=[]).
const TENANT_FOR_SEND = {
  id: VALID_UUID,
  email: 'a@b.com',
  telefone: '5511999999999',
  nome: 'Ana',
  nome_estudio: 'Ink',
  plano: 'estudio',
};

// ─── Tests ───────────────────────────────────────────────────────────────

// T28 — sem email nem phone (ou ambos inválidos) → 400
test('request-studio-link — T28: input inválido → 400', async () => {
  const { onRequest } = await import('../../functions/api/request-studio-link.js');
  const cases = [{}, { email: '', phone: '' }, { email: 'no-at-sign', phone: 'abc' }];
  // Sanity: input inválido aborta ANTES de qualquer fetch (validação síncrona).
  const matcher = fetchMatcher([]);
  const restore = withMockFetch(matcher);
  try {
    for (const body of cases) {
      const req = makeRequest('/api/request-studio-link', body);
      const res = await onRequest({ request: req, env: mockEnv() });
      assert.equal(res.status, 400, `case ${JSON.stringify(body)}`);
    }
    assert.equal(matcher.calls.length, 0, 'input inválido não deve triggerar fetch');
  } finally { restore(); }
});

// T29 — SB_KEY/TOKEN_SECRET ausente → 503
test('request-studio-link — T29: SB_KEY ausente → 503', async () => {
  const { onRequest } = await import('../../functions/api/request-studio-link.js');
  // Env check vem ANTES do lookup — não deve fazer fetch.
  const matcher = fetchMatcher([]);
  const restore = withMockFetch(matcher);
  try {
    const req = makeRequest('/api/request-studio-link', { email: 'a@b.com' });
    const env = mockEnv({
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      SUPABASE_SERVICE_KEY: undefined,
    });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 503);
    assert.equal(matcher.calls.length, 0, 'env ausente não deve triggerar fetch');
  } finally { restore(); }
});

// T30 — tenant não existe → 200 ok com channels_tried=[] (security: não vaza)
test('request-studio-link — T30: tenant não existe → 200 sem vazar', async () => {
  const matcher = fetchMatcher([
    ['/rest/v1/tenants?', () => jsonResponse([])],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/request-studio-link.js');
    const req = makeRequest('/api/request-studio-link', { email: 'unknown@b.com' });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.deepEqual(json.channels_tried, []);
    // Apenas email no input → 1 lookup (email). Sem phone → sem 2º fetch.
    assert.equal(matcher.calls.length, 1, 'esperava 1 fetch (lookup por email)');
  } finally { restore(); }
});

// T31 — tenant existe + WA OK + email OK + phone normaliza
test('request-studio-link — T31: WA + email OK, phone normaliza', async () => {
  const matcher = fetchMatcher([
    // input phone='11999999999' → normaliza pra 5511999999999 → lookup
    ['telefone=eq.5511999999999', () => jsonResponse([TENANT_FOR_SEND])],
    // sendViaWhatsApp
    ['/message/sendText/', () => new Response('ok', { status: 200 })],
    // sendViaEmail (MailerLite)
    ['connect.mailerlite.com/api/subscribers', () => new Response('ok', { status: 200 })],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/request-studio-link.js');
    const req = makeRequest('/api/request-studio-link', { phone: '11999999999' });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.deepEqual(json.channels_tried.sort(), ['email', 'whatsapp']);
    // Asserção crítica: phone foi normalizado ANTES do lookup
    const lookupCall = matcher.calls.find(c =>
      c.url.includes('telefone=eq.5511999999999'));
    assert.ok(lookupCall, 'lookup deve usar phone normalizado (5511999999999)');
    // 3 fetches: 1 tenants (phone lookup) + 1 EVO + 1 MailerLite.
    assert.equal(matcher.calls.length, 3, 'esperava 3 fetches (tenant + WA + email)');
  } finally { restore(); }
});

// T32 — tenant existe + WA OK + email FAIL → channels_tried=[whatsapp]
test('request-studio-link — T32: WA OK, email FAIL → channels_tried=[whatsapp]', async () => {
  const matcher = fetchMatcher([
    ['/rest/v1/tenants?', () => jsonResponse([TENANT_FOR_SEND])],
    ['/message/sendText/', () => new Response('ok', { status: 200 })],
    ['connect.mailerlite.com/api/subscribers', () => new Response('boom', { status: 500 })],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/request-studio-link.js');
    const req = makeRequest('/api/request-studio-link', { email: 'a@b.com' });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.deepEqual(json.channels_tried, ['whatsapp']);
    assert.equal(matcher.calls.length, 3, 'esperava 3 fetches (tenant + WA + email)');
  } finally { restore(); }
});

// T33 — tenant existe + WA FAIL + email OK → channels_tried=[email]
test('request-studio-link — T33: WA FAIL, email OK → channels_tried=[email]', async () => {
  const matcher = fetchMatcher([
    ['/rest/v1/tenants?', () => jsonResponse([TENANT_FOR_SEND])],
    ['/message/sendText/', () => new Response('boom', { status: 500 })],
    ['connect.mailerlite.com/api/subscribers', () => new Response('ok', { status: 200 })],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/request-studio-link.js');
    const req = makeRequest('/api/request-studio-link', { email: 'a@b.com' });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.deepEqual(json.channels_tried, ['email']);
    assert.equal(matcher.calls.length, 3, 'esperava 3 fetches (tenant + WA + email)');
  } finally { restore(); }
});

// T34 — tenant existe + ambos FAIL → 200 ainda (não vaza erro upstream)
test('request-studio-link — T34: ambos FAIL → 200 channels_tried=[]', async () => {
  const matcher = fetchMatcher([
    ['/rest/v1/tenants?', () => jsonResponse([TENANT_FOR_SEND])],
    ['/message/sendText/', () => new Response('boom', { status: 500 })],
    ['connect.mailerlite.com/api/subscribers', () => new Response('boom', { status: 500 })],
  ]);
  const restore = withMockFetch(matcher);
  try {
    const { onRequest } = await import('../../functions/api/request-studio-link.js');
    const req = makeRequest('/api/request-studio-link', { email: 'a@b.com' });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.deepEqual(json.channels_tried, []);
    assert.equal(matcher.calls.length, 3, 'esperava 3 fetches (tenant + WA + email)');
  } finally { restore(); }
});
