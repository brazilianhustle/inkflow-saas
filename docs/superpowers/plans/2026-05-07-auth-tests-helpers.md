# Auth tests B1 (lib helpers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar 25 testes unitários cobrindo os 5 exports de `functions/api/_auth-helpers.js` em um único arquivo `tests/auth-helpers.test.mjs`, fechando finding F2.4.1 da auditoria.

**Architecture:** Tests escritos pra **código que já existe** (não TDD verdadeiro — o source já está em prod desde abril/2026 e funciona). Cada teste deve **passar na primeira run**. Se algum falhar, investigar se é bug na lib (fix em PR separado) ou no teste — NUNCA ajustar o teste pra mascarar bug. Tests organizados em flat structure com prefix por função; mock fetch via `globalThis.fetch` override; manipulação de `ttlDays` da `generateStudioToken` pra cenários de expiração (sem mock de Date).

**Tech Stack:** Node.js `node:test` runner, `node:assert/strict`, Web Crypto API (HMAC-SHA256), dynamic imports.

---

## Spec referência

`docs/superpowers/specs/2026-05-07-auth-tests-helpers-design.md`

## File Structure

| Arquivo | Responsabilidade | Status |
|---|---|---|
| `tests/auth-helpers.test.mjs` | **Único arquivo desta feature.** Setup + 6 helpers + 25 testes | Create |
| `functions/api/_auth-helpers.js` | Source da lib testada (143 LoC) | **Read-only — não modificar** |
| `.github/workflows/tests.yml` | CI já existente (Sprint 1 Onda 2) | Auto-roda este teste novo |

## Pré-condições

- [ ] **PC1 — Branch correta**

```bash
git branch --show-current
```

Expected: `feat/auth-tests`. Se não estiver, executar `git checkout feat/auth-tests`.

- [ ] **PC2 — Spec existe**

```bash
ls docs/superpowers/specs/2026-05-07-auth-tests-helpers-design.md
```

Expected: arquivo existe (committed em `8fe7b65`).

- [ ] **PC3 — Source intacto**

```bash
git diff main -- functions/api/_auth-helpers.js
```

Expected: vazio (nenhuma mudança planejada na lib).

- [ ] **PC4 — Node version**

```bash
node --version
```

Expected: v20+ (precisa pra Web Crypto API + node:test estável). Atual: v25.9 local; CI usa v20.

---

## Task 1: Setup arquivo + helpers + smoke

**Goal:** criar arquivo base com imports, fixtures e 6 helpers. Validar que `node --test` aceita arquivo sem testes.

**Files:**
- Create: `tests/auth-helpers.test.mjs`

- [ ] **Step 1.1: Criar arquivo com setup completo**

Conteúdo inicial completo:

```js
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
```

- [ ] **Step 1.2: Smoke — node:test aceita arquivo sem testes**

```bash
node --test tests/auth-helpers.test.mjs
```

Expected: exit 0, output `# tests 0` ou similar (sem erro de parse).

- [ ] **Step 1.3: Commit**

```bash
git add tests/auth-helpers.test.mjs
git commit -m "test(auth): setup tests/auth-helpers.test.mjs (fixtures + 6 helpers)

Setup base do arquivo de testes pra functions/api/_auth-helpers.js.

Helpers:
- withMockFetch — substitui globalThis.fetch com try/finally restore
- jsonResponse — monta Response JSON pra mock Supabase
- fetchMatcher — multi-rota pra testes com mais de 1 fetch
- forgeToken — constrói token com payload custom (T11, T13)
- mutateSig — modifica sig de token gerado (T9, T10)
- makeToken — DRY wrapper sobre generateStudioToken com ttlDays arbitrário

Próximas tasks adicionam os 25 testes.

Refs spec: docs/superpowers/specs/2026-05-07-auth-tests-helpers-design.md
"
```

---

## Task 2: T1 — `b64url` round-trip

**Files:**
- Modify: `tests/auth-helpers.test.mjs` (adiciona após linha `// ─── Tests below ───`)

- [ ] **Step 2.1: Adicionar T1**

Adicionar ao final do arquivo:

```js
// ─── b64url ───
test('b64url — round-trip', async () => {
  const { b64url, b64urlDecode } = await import('../functions/api/_auth-helpers.js');
  assert.equal(b64urlDecode(b64url('hello world')), 'hello world');
});
```

- [ ] **Step 2.2: Run test**

```bash
node --test tests/auth-helpers.test.mjs
```

Expected: `# pass 1`, `# fail 0`.

- [ ] **Step 2.3: Commit**

```bash
git add tests/auth-helpers.test.mjs
git commit -m "test(auth): T1 — b64url round-trip"
```

---

## Task 3: T2-T4 — `generateStudioToken`

**Files:**
- Modify: `tests/auth-helpers.test.mjs`

- [ ] **Step 3.1: Adicionar T2-T4**

Adicionar ao final do arquivo:

```js
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
```

- [ ] **Step 3.2: Run tests**

```bash
node --test tests/auth-helpers.test.mjs
```

Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 3.3: Commit**

```bash
git add tests/auth-helpers.test.mjs
git commit -m "test(auth): T2-T4 — generateStudioToken (happy + 2 throws)"
```

---

## Task 4: T5-T9 — `verifyStudioToken` happy + erros básicos

**Files:**
- Modify: `tests/auth-helpers.test.mjs`

- [ ] **Step 4.1: Adicionar T5-T9**

Adicionar ao final do arquivo:

```js
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
```

- [ ] **Step 4.2: Run tests**

```bash
node --test tests/auth-helpers.test.mjs
```

Expected: `# pass 9`, `# fail 0`.

- [ ] **Step 4.3: Commit**

```bash
git add tests/auth-helpers.test.mjs
git commit -m "test(auth): T5-T9 — verifyStudioToken happy + erros básicos"
```

---

## Task 5: T10-T14 — `verifyStudioToken` edge cases

**Files:**
- Modify: `tests/auth-helpers.test.mjs`

- [ ] **Step 5.1: Adicionar T10-T14**

Adicionar ao final do arquivo:

```js
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
```

- [ ] **Step 5.2: Run tests**

```bash
node --test tests/auth-helpers.test.mjs
```

Expected: `# pass 14`, `# fail 0`.

- [ ] **Step 5.3: Commit**

```bash
git add tests/auth-helpers.test.mjs
git commit -m "test(auth): T10-T14 — verifyStudioToken edge cases (timing-safe, expired, sliding)

T10 inclui comentário INTENTIONAL documentando edge case #1 (timing-safe
compare). Próximo dev não deve consolidar length-check com loop XOR sem
revisão de segurança."
```

---

## Task 6: T15-T19 — `verifyOnboardingKey` validation + DB lookup

**Files:**
- Modify: `tests/auth-helpers.test.mjs`

- [ ] **Step 6.1: Adicionar T15-T19**

Adicionar ao final do arquivo:

```js
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
```

- [ ] **Step 6.2: Run tests**

```bash
node --test tests/auth-helpers.test.mjs
```

Expected: `# pass 19`, `# fail 0`.

- [ ] **Step 6.3: Commit**

```bash
git add tests/auth-helpers.test.mjs
git commit -m "test(auth): T15-T19 — verifyOnboardingKey validation + DB lookup"
```

---

## Task 7: T20-T21 — `verifyOnboardingKey` TTL paths

**Files:**
- Modify: `tests/auth-helpers.test.mjs`

- [ ] **Step 7.1: Adicionar T20 e T21**

Adicionar ao final do arquivo:

```js
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
```

- [ ] **Step 7.2: Run tests**

```bash
node --test tests/auth-helpers.test.mjs
```

Expected: `# pass 21`, `# fail 0`.

- [ ] **Step 7.3: Commit**

```bash
git add tests/auth-helpers.test.mjs
git commit -m "test(auth): T20-T21 — verifyOnboardingKey TTL paths

T21 inclui comentário INTENTIONAL documentando edge case #3 (fail-open
quando link ausente). Próximo dev não deve converter em fail-closed sem
revisão de fluxo de onboarding."
```

---

## Task 8: T22-T25 — `verifyStudioTokenOrLegacy`

**Files:**
- Modify: `tests/auth-helpers.test.mjs`

- [ ] **Step 8.1: Adicionar T22-T25**

Adicionar ao final do arquivo:

```js
// ─── verifyStudioTokenOrLegacy ───

test('verifyStudioTokenOrLegacy — HMAC válido retorna source=hmac', async () => {
  const { verifyStudioTokenOrLegacy } = await import('../functions/api/_auth-helpers.js');
  const token = await makeToken(VALID_UUID);
  // Sem mock fetch — HMAC válido não cai no DB lookup
  const result = await verifyStudioTokenOrLegacy({
    token,
    secret: STUDIO_SECRET,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
  });
  assert.equal(result.tenantId, VALID_UUID);
  assert.equal(result.source, 'hmac');
  assert.equal(result.shouldRefresh, false);
  assert.ok(typeof result.exp === 'number');
});

test('verifyStudioTokenOrLegacy — HMAC expirado retorna null (não fallback pro legacy)', async () => {
  const { verifyStudioTokenOrLegacy } = await import('../functions/api/_auth-helpers.js');
  const expiredToken = await makeToken(VALID_UUID, -1);
  // Mock que retornaria match — não deve ser chamado pq HMAC expirado curto-circuita
  const restore = withMockFetch(fetchMatcher([
    ['/rest/v1/tenants?', () => jsonResponse([{ id: VALID_UUID }])],
  ]));
  try {
    const result = await verifyStudioTokenOrLegacy({
      token: expiredToken,
      secret: STUDIO_SECRET,
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
    });
    assert.equal(result, null);
  } finally {
    restore();
  }
});

test('verifyStudioTokenOrLegacy — UUID legacy match retorna source=legacy-uuid', async () => {
  const { verifyStudioTokenOrLegacy } = await import('../functions/api/_auth-helpers.js');
  const legacyToken = '00000000-0000-0000-0000-000000000099'; // UUID raw, sem prefix v1.
  const restore = withMockFetch(fetchMatcher([
    ['/rest/v1/tenants?studio_token=eq.', () => jsonResponse([{ id: VALID_UUID }])],
  ]));
  try {
    const result = await verifyStudioTokenOrLegacy({
      token: legacyToken,
      secret: STUDIO_SECRET,
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
    });
    assert.equal(result.tenantId, VALID_UUID);
    assert.equal(result.source, 'legacy-uuid');
  } finally {
    restore();
  }
});

test('verifyStudioTokenOrLegacy — nem HMAC nem UUID legacy retorna null', async () => {
  const { verifyStudioTokenOrLegacy } = await import('../functions/api/_auth-helpers.js');
  const garbageToken = 'random-string-not-hmac-not-uuid';
  const restore = withMockFetch(fetchMatcher([
    ['/rest/v1/tenants?studio_token=eq.', () => jsonResponse([])], // sem match
  ]));
  try {
    const result = await verifyStudioTokenOrLegacy({
      token: garbageToken,
      secret: STUDIO_SECRET,
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
    });
    assert.equal(result, null);
  } finally {
    restore();
  }
});
```

- [ ] **Step 8.2: Run tests — todos os 25**

```bash
node --test tests/auth-helpers.test.mjs
```

Expected: `# pass 25`, `# fail 0`, duration < 5s.

- [ ] **Step 8.3: Commit**

```bash
git add tests/auth-helpers.test.mjs
git commit -m "test(auth): T22-T25 — verifyStudioTokenOrLegacy HMAC + legacy paths

Fecha B1 (lib helpers) — 25/25 testes passando.
Refs spec: docs/superpowers/specs/2026-05-07-auth-tests-helpers-design.md
Refs auditoria: F2.4.1"
```

---

## Task 9: Smoke check + LoC final

- [ ] **Step 9.1: Validar 25 testes + duration**

```bash
node --test tests/auth-helpers.test.mjs 2>&1 | tail -10
```

Expected: 
```
# tests 25
# pass 25
# fail 0
# duration_ms <5000
```

Se `# pass < 25`: investigar quais falharam. NÃO ajustar testes pra mascarar — investigar lib OU teste.

- [ ] **Step 9.2: Validar LoC ~340-360**

```bash
wc -l tests/auth-helpers.test.mjs
```

Expected: ~340-360 linhas.

- [ ] **Step 9.3: Validar comentários INTENTIONAL presentes**

```bash
grep -n "INTENTIONAL" tests/auth-helpers.test.mjs
```

Expected: 2 matches (T10 timing-safe + T21 fail-open).

- [ ] **Step 9.4: Suite completa de regressão**

```bash
node --test tests/**/*.test.mjs 2>&1 | tail -10
```

Expected: `# pass <total>`, `# fail 0`. Confirma que os 25 novos não quebraram outros testes.

---

## Task 10: Push + PR + merge

- [ ] **Step 10.1: Push branch**

```bash
git push -u origin feat/auth-tests
```

- [ ] **Step 10.2: Criar PR**

```bash
gh pr create --base main --head feat/auth-tests \
  --title "test(auth): B1 — unit tests pra _auth-helpers.js (25 testes)" \
  --body "$(cat <<'EOF'
## Summary

Sprint 2 / B1 — fecha parte de F2.4.1 da auditoria com 25 unit tests cobrindo os 5 exports de \`functions/api/_auth-helpers.js\`.

### Coverage

| Export | Testes |
|---|---|
| \`b64url\` / \`b64urlDecode\` | 1 (round-trip) |
| \`generateStudioToken\` | 3 (happy + 2 throws) |
| \`verifyStudioToken\` | 10 (happy + 9 erros, incluindo edge #1 timing-safe) |
| \`verifyOnboardingKey\` | 7 (happy + 6 erros, incluindo edge #3 fail-open) |
| \`verifyStudioTokenOrLegacy\` | 4 (HMAC, expired, legacy, neither) |
| **Total** | **25** |

### Edge cases security marcados INTENTIONAL

- **T10** — length mismatch antes do byte compare (timing-safe, NIST SP 800-107)
- **T21** — fail-open quando link ausente em onboarding_links (decisão histórica pra retry após admin reset)

Próximo dev tem comentários inline pra não consolidar/refatorar sem revisão.

## Test plan

- [x] Local: \`node --test tests/auth-helpers.test.mjs\` → 25/25 pass / 0 fail / <5s
- [x] Comentários INTENTIONAL presentes em T10 + T21
- [x] Outros testes do projeto continuam passando (regressão)
- [ ] **CI:** workflow Tests do GHA passa neste PR

## Próximo

B2 — HTTP tests dos 4 endpoints (\`validate-onboarding-key\`, \`validate-studio-token\`, \`get-studio-token\`, \`request-studio-link\`) vira nova feature.

Refs:
- Spec: docs/superpowers/specs/2026-05-07-auth-tests-helpers-design.md
- Plan: docs/superpowers/plans/2026-05-07-auth-tests-helpers.md
- Auditoria: F2.4.1

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 10.3: Aguardar CI**

```bash
until [ "$(gh pr checks <PR_NUM> 2>&1 | grep -cE 'pending|queued')" = "0" ] && [ "$(gh pr checks <PR_NUM> 2>&1 | wc -l)" -gt "1" ]; do sleep 5; done
gh pr checks <PR_NUM>
```

Expected: `Tests / node --test` pass + `GitGuardian Security Checks` pass.

- [ ] **Step 10.4: Merge**

```bash
gh pr merge <PR_NUM> --squash --delete-branch
```

- [ ] **Step 10.5: Sync main local**

```bash
git checkout main
git pull --ff-only origin main
```

---

## Self-review

### Spec coverage check

| Spec requirement | Task que cobre |
|---|---|
| 25 testes cobrindo 5 exports | Tasks 2-8 (todas) |
| Path `tests/auth-helpers.test.mjs` (top-level) | Task 1 |
| 6 helpers (withMockFetch, jsonResponse, fetchMatcher, forgeToken, mutateSig, makeToken) | Task 1 |
| Mock fetch via globalThis.fetch override | Task 1 helper + Tasks 6-8 |
| Mock tempo via ttlDays (sem Date mock) | makeToken helper + T12, T14 |
| Dynamic import dentro de cada teste | Todos os tests usam `await import('...')` |
| T10 comentário INTENTIONAL timing-safe | Task 5 step 5.1 |
| T21 comentário INTENTIONAL fail-open | Task 7 step 7.1 |
| LoC esperadas ~340-360 | Validado em Task 9 step 9.2 |
| 25/25 pass local | Task 8 step 8.2 + Task 9 step 9.1 |
| CI verde | Task 10 step 10.3 |

### Placeholder scan

- ✅ Sem "TBD", "TODO", "implement later"
- ✅ Cada step tem código completo executável
- ✅ Cada step tem comando exato + expected output
- ✅ Comentários INTENTIONAL têm texto completo (não placeholder)

### Type consistency

- ✅ `STUDIO_SECRET` (40 chars) consistente em todos os usos
- ✅ `VALID_UUID` consistente (`'00000000-0000-0000-0000-000000000001'`)
- ✅ `makeToken(tenantId, ttlDays)` signature consistente entre helper e usos
- ✅ `forgeToken({tidB64, expStr, secret})` signature consistente
- ✅ `mutateSig(token, mutator)` signature consistente
- ✅ `assert.deepStrictEqual` usado pra exact-match em retornos `{valid, reason}`
- ✅ `assert.equal` usado pra valores escalares
- ✅ `assert.rejects` usado pra throws assíncronos (T3, T4)

### Riscos não cobertos no plan (intencional)

- DB exception handlers (catch de fetch error) — out-of-scope conforme spec
- Coverage tool report — projeto não tem
- Smoke E2E em prod — out-of-scope (B2 e além)
