// ── InkFlow — unit tests pra functions/api/_auth-helpers.js ──────────────
// Spec: docs/superpowers/specs/2026-05-07-auth-tests-helpers-design.md
// Auditoria: F2.4.1 (auth bypass = leak entre tenants)
//
// IMPORTANTE: tests cobrem código existente em prod desde abril/2026.
// Se um teste falhar, investigar se é bug na lib OU no teste — NUNCA
// ajustar teste pra mascarar bug.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Fixtures ────────────────────────────────────────────────────────────
const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const STUDIO_SECRET = 'test-secret-min-32-chars-padding-padding';
const SUPABASE_URL = 'https://test.supabase.co';
const SUPABASE_KEY = 'test-service-key';

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Substitui globalThis.fetch e retorna função pra restaurar.
 * Use em try/finally pra garantir cleanup.
 */
function withMockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}

/**
 * Monta Response JSON consistente com Supabase REST output.
 */
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Multi-rota — match por substring na URL.
 * Uso: fetchMatcher([['/rest/v1/tenants?', () => jsonResponse([...])]])
 */
function fetchMatcher(routes) {
  return async (url) => {
    for (const [pattern, response] of routes) {
      if (url.includes(pattern)) return response();
    }
    throw new Error(`unmocked fetch: ${url}`);
  };
}

/**
 * Constrói token v1.<tidB64>.<expStr>.<sig> com HMAC válido sobre payload custom.
 * Pra cenários onde precisa de payload deliberadamente malformado mas com sig
 * assinada (T11: exp=NaN, T13: tenantId não-UUID).
 */
async function forgeToken({ tidB64, expStr, secret = STUDIO_SECRET }) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const payload = `${tidB64}.${expStr}`;
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const sig = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return `v1.${payload}.${sig}`;
}

/**
 * Pega token gerado e modifica só a sig (parte 4).
 * Pra T9 (sig trocada mesma length) e T10 (sig length diferente).
 */
function mutateSig(token, mutator) {
  const parts = token.split('.');
  parts[3] = mutator(parts[3]);
  return parts.join('.');
}

/**
 * DRY wrapper sobre generateStudioToken. Aceita ttlDays arbitrário (default 30).
 * - ttlDays = -1 → token expirado
 * - ttlDays = 6.5 → shouldRefresh = true (< 7d)
 * - ttlDays = 30 → válido (default)
 */
async function makeToken(tenantId, ttlDays = 30) {
  const { generateStudioToken } = await import('../functions/api/_auth-helpers.js');
  return generateStudioToken(tenantId, STUDIO_SECRET, ttlDays);
}

// ─── Tests below ─────────────────────────────────────────────────────────
// (próximas tasks adicionam testes aqui)

// ─── b64url ───
test('b64url — round-trip', async () => {
  const { b64url, b64urlDecode } = await import('../functions/api/_auth-helpers.js');
  assert.equal(b64urlDecode(b64url('hello world')), 'hello world');
});

// ─── generateStudioToken ───

test('generateStudioToken — happy path retorna formato v1.<3 parts>', async () => {
  const { generateStudioToken } = await import('../functions/api/_auth-helpers.js');
  const token = await generateStudioToken(VALID_UUID, STUDIO_SECRET);
  const parts = token.split('.');
  assert.equal(parts.length, 4, 'token deve ter 4 segmentos');
  assert.equal(parts[0], 'v1', 'prefix deve ser v1');
  assert.ok(parts[1].length > 0, 'tidB64 não vazio');
  const exp = parseInt(parts[2], 10);
  const now = Math.floor(Date.now() / 1000);
  // 30 dias = 2592000 segundos. Tolerância 5s pra rounding.
  assert.ok(Math.abs(exp - (now + 30 * 86400)) < 5, 'exp deve ser ~now + 30d');
  assert.equal(parts[3].length, 64, 'sig deve ser 64 hex chars (HMAC-SHA256)');
});

test('generateStudioToken — tenantId não-UUID throws', async () => {
  const { generateStudioToken } = await import('../functions/api/_auth-helpers.js');
  await assert.rejects(
    generateStudioToken('not-a-uuid', STUDIO_SECRET),
    /tenant_id inválido/
  );
});

test('generateStudioToken — secret missing throws', async () => {
  const { generateStudioToken } = await import('../functions/api/_auth-helpers.js');
  await assert.rejects(
    generateStudioToken(VALID_UUID, ''),
    /STUDIO_TOKEN_SECRET ausente/
  );
});

// ─── verifyStudioToken ───

test('verifyStudioToken — happy path (TTL 30, shouldRefresh false)', async () => {
  const { verifyStudioToken } = await import('../functions/api/_auth-helpers.js');
  const token = await makeToken(VALID_UUID); // default 30d
  const result = await verifyStudioToken(token, STUDIO_SECRET);
  assert.equal(result.valid, true);
  assert.equal(result.tenantId, VALID_UUID);
  assert.ok(typeof result.exp === 'number');
  assert.equal(result.shouldRefresh, false, 'TTL 30d não está em janela de refresh');
});

test('verifyStudioToken — sem prefix v1. retorna null', async () => {
  const { verifyStudioToken } = await import('../functions/api/_auth-helpers.js');
  const result = await verifyStudioToken('foo.bar.baz', STUDIO_SECRET);
  assert.equal(result, null);
});

test('verifyStudioToken — secret ausente retorna invalid', async () => {
  const { verifyStudioToken } = await import('../functions/api/_auth-helpers.js');
  const token = await makeToken(VALID_UUID);
  const result = await verifyStudioToken(token, '');
  assert.deepStrictEqual(result, { valid: false, reason: 'secret-missing' });
});

test('verifyStudioToken — malformado (3 parts) retorna invalid', async () => {
  const { verifyStudioToken } = await import('../functions/api/_auth-helpers.js');
  const result = await verifyStudioToken('v1.aaa.bbb', STUDIO_SECRET);
  assert.deepStrictEqual(result, { valid: false, reason: 'malformed' });
});

test('verifyStudioToken — sig trocada (mesma length) retorna bad-signature', async () => {
  const { verifyStudioToken } = await import('../functions/api/_auth-helpers.js');
  const token = await makeToken(VALID_UUID);
  // Troca último char preservando length
  const tampered = mutateSig(token, (sig) => {
    const last = sig.slice(-1);
    const swap = last === 'a' ? 'b' : 'a';
    return sig.slice(0, -1) + swap;
  });
  const result = await verifyStudioToken(tampered, STUDIO_SECRET);
  assert.deepStrictEqual(result, { valid: false, reason: 'bad-signature' });
});

test('verifyStudioToken — sig length diferente retorna bad-signature (timing-safe)', async () => {
  // edge case #1: INTENTIONAL — length mismatch retorna bad-signature antes do
  // byte compare loop, protegendo contra timing attacks (NIST SP 800-107).
  // Não consolidar com loop XOR — separação é a invariante de segurança.
  const { verifyStudioToken } = await import('../functions/api/_auth-helpers.js');
  const token = await makeToken(VALID_UUID);
  const truncated = mutateSig(token, (sig) => sig.slice(0, -2)); // 62 chars
  const result = await verifyStudioToken(truncated, STUDIO_SECRET);
  assert.deepStrictEqual(result, { valid: false, reason: 'bad-signature' });
});

test('verifyStudioToken — exp não numérico retorna malformed-exp', async () => {
  const { verifyStudioToken, b64url } = await import('../functions/api/_auth-helpers.js');
  const token = await forgeToken({ tidB64: b64url(VALID_UUID), expStr: 'abc' });
  const result = await verifyStudioToken(token, STUDIO_SECRET);
  assert.deepStrictEqual(result, { valid: false, reason: 'malformed-exp' });
});

test('verifyStudioToken — exp passado retorna expired', async () => {
  const { verifyStudioToken } = await import('../functions/api/_auth-helpers.js');
  const token = await makeToken(VALID_UUID, -1); // expirou 1 dia atrás
  const result = await verifyStudioToken(token, STUDIO_SECRET);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'expired');
  assert.ok(typeof result.exp === 'number');
});

test('verifyStudioToken — tenantId payload malformado retorna malformed-tenant', async () => {
  const { verifyStudioToken, b64url } = await import('../functions/api/_auth-helpers.js');
  const token = await forgeToken({ tidB64: b64url('not-uuid'), expStr: '9999999999' });
  const result = await verifyStudioToken(token, STUDIO_SECRET);
  assert.deepStrictEqual(result, { valid: false, reason: 'malformed-tenant' });
});

test('verifyStudioToken — sliding refresh boundary (ttlDays 6.5) retorna shouldRefresh true', async () => {
  const { verifyStudioToken } = await import('../functions/api/_auth-helpers.js');
  const token = await makeToken(VALID_UUID, 6.5); // < 7 dias
  const result = await verifyStudioToken(token, STUDIO_SECRET);
  assert.equal(result.valid, true);
  assert.equal(result.shouldRefresh, true);
});

// ─── verifyOnboardingKey ───

test('verifyOnboardingKey — happy path', async () => {
  const { verifyOnboardingKey } = await import('../functions/api/_auth-helpers.js');
  const restore = withMockFetch(fetchMatcher([
    ['/rest/v1/tenants?', () => jsonResponse([{ onboarding_key: 'mykey1234' }])],
    ['/rest/v1/onboarding_links?', () => jsonResponse([{ expires_at: '2030-01-01T00:00:00Z' }])],
  ]));
  try {
    const result = await verifyOnboardingKey({
      tenantId: VALID_UUID,
      onboardingKey: 'mykey1234',
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
    });
    assert.deepStrictEqual(result, { ok: true });
  } finally {
    restore();
  }
});

test('verifyOnboardingKey — tenantId não-UUID retorna invalid-tenant-id', async () => {
  const { verifyOnboardingKey } = await import('../functions/api/_auth-helpers.js');
  // Sem mock fetch — função falha antes de qualquer call
  const result = await verifyOnboardingKey({
    tenantId: 'not-a-uuid',
    onboardingKey: 'mykey1234',
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
  });
  assert.deepStrictEqual(result, { ok: false, reason: 'invalid-tenant-id' });
});

test('verifyOnboardingKey — key < 8 chars retorna missing', async () => {
  const { verifyOnboardingKey } = await import('../functions/api/_auth-helpers.js');
  const result = await verifyOnboardingKey({
    tenantId: VALID_UUID,
    onboardingKey: 'short', // 5 chars
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
  });
  assert.deepStrictEqual(result, { ok: false, reason: 'missing' });
});

test('verifyOnboardingKey — tenant não existe retorna not-found', async () => {
  const { verifyOnboardingKey } = await import('../functions/api/_auth-helpers.js');
  const restore = withMockFetch(fetchMatcher([
    ['/rest/v1/tenants?', () => jsonResponse([])], // DB retorna vazio
  ]));
  try {
    const result = await verifyOnboardingKey({
      tenantId: VALID_UUID,
      onboardingKey: 'mykey1234',
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
    });
    assert.deepStrictEqual(result, { ok: false, reason: 'not-found' });
  } finally {
    restore();
  }
});

test('verifyOnboardingKey — key mismatch retorna mismatch', async () => {
  const { verifyOnboardingKey } = await import('../functions/api/_auth-helpers.js');
  const restore = withMockFetch(fetchMatcher([
    ['/rest/v1/tenants?', () => jsonResponse([{ onboarding_key: 'different' }])],
  ]));
  try {
    const result = await verifyOnboardingKey({
      tenantId: VALID_UUID,
      onboardingKey: 'mykey1234',
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
    });
    assert.deepStrictEqual(result, { ok: false, reason: 'mismatch' });
  } finally {
    restore();
  }
});

test('verifyOnboardingKey — link expirado retorna expired com expires_at', async () => {
  const { verifyOnboardingKey } = await import('../functions/api/_auth-helpers.js');
  const expiredAt = '2020-01-01T00:00:00Z';
  const restore = withMockFetch(fetchMatcher([
    ['/rest/v1/tenants?', () => jsonResponse([{ onboarding_key: 'mykey1234' }])],
    ['/rest/v1/onboarding_links?', () => jsonResponse([{ expires_at: expiredAt }])],
  ]));
  try {
    const result = await verifyOnboardingKey({
      tenantId: VALID_UUID,
      onboardingKey: 'mykey1234',
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
    });
    assert.deepStrictEqual(result, {
      ok: false,
      reason: 'expired',
      expires_at: expiredAt,
    });
  } finally {
    restore();
  }
});

test('verifyOnboardingKey — link ausente em onboarding_links retorna ok (fail-open)', async () => {
  // edge case #3: INTENTIONAL fail-open quando link ausente em onboarding_links.
  // Decisão histórica pra permitir retry após admin reset. Mudar pra fail-closed
  // requer decisão explícita (auditoria 2026-05-07 documenta o comportamento).
  // Não converter em fail-fast sem revisão de fluxo de onboarding.
  const { verifyOnboardingKey } = await import('../functions/api/_auth-helpers.js');
  const restore = withMockFetch(fetchMatcher([
    ['/rest/v1/tenants?', () => jsonResponse([{ onboarding_key: 'mykey1234' }])],
    ['/rest/v1/onboarding_links?', () => jsonResponse([])], // sem link
  ]));
  try {
    const result = await verifyOnboardingKey({
      tenantId: VALID_UUID,
      onboardingKey: 'mykey1234',
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
    });
    assert.deepStrictEqual(result, { ok: true });
  } finally {
    restore();
  }
});
