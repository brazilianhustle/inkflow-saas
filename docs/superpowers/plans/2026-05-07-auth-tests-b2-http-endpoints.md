# B2 — HTTP tests endpoints auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cobrir os 4 endpoints de auth do studio (`validate-onboarding-key`, `validate-studio-token`, `get-studio-token`, `request-studio-link`) com 34 HTTP tests que protegem contra auth bypass, vazamento silencioso, magic link enumeration, reset silencioso e refresh quebrado. Fecha o par F2.4.1 com o B1 mergeado em #45.

**Architecture:** 4 arquivos auto-contidos em `tests/api/<endpoint>.test.mjs` seguindo padrão `tests/api/conversas-list.test.mjs`. Lib `_auth-helpers.js` roda **real** (não mockada) — testes mockam só `globalThis.fetch` para Supabase/Evolution/MailerLite via `fetchMatcher` por substring. Helpers locais duplicados em cada arquivo (auto-contido, padrão do projeto).

**Tech Stack:** Node.js native test runner (`node:test` + `node:assert/strict`), Web Crypto API (HMAC), `globalThis.fetch` mock, dynamic imports.

**Spec:** `docs/superpowers/specs/2026-05-07-auth-tests-b2-http-endpoints-design.md` (commits `c0318f7` + `f39b9bc`)

---

## File Structure

| Arquivo | Status | Tamanho esperado | Testes |
|---|---|---|---|
| `tests/api/validate-onboarding-key.test.mjs` | Create | ~250 LoC | T1-T10 (10) |
| `tests/api/validate-studio-token.test.mjs` | Create | ~230 LoC | T11-T19 (9) |
| `tests/api/get-studio-token.test.mjs` | Create | ~210 LoC | T20-T27 (8) |
| `tests/api/request-studio-link.test.mjs` | Create | ~280 LoC | T28-T34 (7) |

**Não modifica:** nenhum arquivo de produção. Tests cobrem código existente em prod desde abril/2026.

**Estrutura de cada arquivo:**
1. Imports (`node:test`, `node:assert/strict`)
2. Constantes (`VALID_UUID`, `SUPABASE_URL`)
3. Helpers locais (`mockEnv`, `withMockFetch`, `jsonResponse`, `fetchMatcher`, `makeStudioToken`, `makeRequest`, opcionalmente `mutateSig`)
4. Tests T_x..T_y (em ordem do spec)

**Importante (regra de ouro):** se um teste falhar durante implementação, **investigar se é bug na lib ou no teste**. NUNCA ajustar teste pra mascarar bug. Comentário inline obrigatório no topo de cada arquivo (replica padrão de `tests/auth-helpers.test.mjs`).

---

## Task 0: Baseline check

**Files:** nenhum (verificação)

- [ ] **Step 1: Confirmar branch e estado limpo**

```bash
git rev-parse --abbrev-ref HEAD
git status
```

Expected: branch `feat/auth-tests-b2-http-endpoints`, working tree clean.

- [ ] **Step 2: Rodar baseline da suite**

```bash
npm test 2>&1 | tail -5
```

Expected: `# pass 311` (ou número similar), zero failures. Se falhas pré-existentes, **PARAR** e investigar antes de adicionar testes novos.

---

## Task 1: `validate-onboarding-key.test.mjs` — 10 testes (T1-T10)

**Files:**
- Create: `tests/api/validate-onboarding-key.test.mjs`

### Step 1: Criar arquivo com helpers + comentário inicial

- [ ] **Step 1: Escrever helpers + cabeçalho**

```js
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
```

Append esse bloco ao arquivo recém-criado (`tests/api/validate-onboarding-key.test.mjs`).

- [ ] **Step 2: Adicionar T1-T3 (input validation + env missing)**

Append:

```js
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
```

- [ ] **Step 3: Rodar T1-T3 e validar que passam**

```bash
node --test tests/api/validate-onboarding-key.test.mjs 2>&1 | tail -10
```

Expected: 3 passing, 0 failing. Se falhar, INVESTIGAR sem ajustar teste.

- [ ] **Step 4: Adicionar T4-T6 (DB error + link states)**

Append:

```js
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
```

- [ ] **Step 5: Rodar T4-T6 e validar**

```bash
node --test tests/api/validate-onboarding-key.test.mjs 2>&1 | tail -10
```

Expected: 6 passing.

- [ ] **Step 6: Adicionar T7-T10 (link used variants + happy paths)**

Append:

```js
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
```

- [ ] **Step 7: Rodar suite do arquivo + suite completa**

```bash
node --test tests/api/validate-onboarding-key.test.mjs 2>&1 | tail -10
npm test 2>&1 | tail -5
```

Expected: 10 passing no arquivo. Suite completa: 311 + 10 = 321 testes total, 0 failing.

- [ ] **Step 8: Commit**

```bash
git add tests/api/validate-onboarding-key.test.mjs
git commit -m "$(cat <<'EOF'
test(auth): B2 — HTTP tests validate-onboarding-key (10 testes)

Cobre T1-T10 do spec:
- Input validation (T1-T3)
- DB error + link states (T4-T6)
- Link used variants + smart-resume (T7-T10)

T8 inclui assertion crítica do PATCH em onboarding_links (resetLinkUsed)
pra detectar reset silencioso.

Spec: docs/superpowers/specs/2026-05-07-auth-tests-b2-http-endpoints-design.md
Plan: docs/superpowers/plans/2026-05-07-auth-tests-b2-http-endpoints.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `validate-studio-token.test.mjs` — 9 testes (T11-T19)

**Files:**
- Create: `tests/api/validate-studio-token.test.mjs`

- [ ] **Step 1: Criar arquivo com helpers + `mutateSig` + comentário**

```js
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
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

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
```

- [ ] **Step 2: Adicionar T11-T14 (input + HMAC inválido/expirado)**

Append:

```js
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
```

- [ ] **Step 3: Rodar T11-T14**

```bash
node --test tests/api/validate-studio-token.test.mjs 2>&1 | tail -10
```

Expected: 4 passing.

- [ ] **Step 4: Adicionar T15-T16 (UUID legacy)**

Append:

```js
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
  } finally { restore(); }
});
```

- [ ] **Step 5: Adicionar T17-T19 (HMAC válido)**

Append:

```js
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
  } finally { restore(); }
});

// T18 ⭐ — HMAC válido + shouldRefresh=true (TTL 6.5d) → 200 com refreshed_token
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
  } finally { restore(); }
});
```

- [ ] **Step 6: Rodar suite do arquivo + suite completa**

```bash
node --test tests/api/validate-studio-token.test.mjs 2>&1 | tail -10
npm test 2>&1 | tail -5
```

Expected: 9 passing no arquivo. Suite completa: 321 + 9 = 330, 0 failing.

- [ ] **Step 7: Commit**

```bash
git add tests/api/validate-studio-token.test.mjs
git commit -m "$(cat <<'EOF'
test(auth): B2 — HTTP tests validate-studio-token (9 testes)

Cobre T11-T19 do spec:
- Input validation (T11-T12)
- HMAC inválido/expirado com goal #2 (body.tenant undefined) (T13-T14)
- UUID legacy fallback + HMAC promotion (T15-T16)
- HMAC válido com/sem sliding refresh (T17-T18)
- HMAC válido + tenant órfão (T19)

T13 documenta caminho legacy fallback p/ bad-signature (não-expired).
T18 valida sliding refresh com exp(novo) > exp(original).
T16 confirma token_exp=null em path legacy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `get-studio-token.test.mjs` — 8 testes (T20-T27)

**Files:**
- Create: `tests/api/get-studio-token.test.mjs`

- [ ] **Step 1: Criar arquivo com helpers + comentário**

```js
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

const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

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

// Mock de step1 (verifyOnboardingKey OK) reutilizado em T25-T27
const STEP1_OK_ROUTES = [
  ['tenants?id=eq.' + VALID_UUID + '&select=onboarding_key',
   () => jsonResponse([{ onboarding_key: 'mykey1234' }])],
  ['onboarding_links?key=eq',
   () => jsonResponse([{ expires_at: '2099-01-01T00:00:00Z' }])],
];

// ─── Tests ───────────────────────────────────────────────────────────────
```

- [ ] **Step 2: Adicionar T20-T22 (input + env)**

Append:

```js
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
```

- [ ] **Step 3: Adicionar T23-T24 (verifyOnboardingKey rejeita)**

Append:

```js
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
  } finally { restore(); }
});
```

- [ ] **Step 4: Adicionar T25-T27 (step2 variants + happy)**

Append:

```js
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

// T27 ⭐ — happy path → 200 com token + link + expires_at
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
```

- [ ] **Step 5: Rodar suite do arquivo + suite completa**

```bash
node --test tests/api/get-studio-token.test.mjs 2>&1 | tail -10
npm test 2>&1 | tail -5
```

Expected: 8 passing no arquivo. Suite completa: 330 + 8 = 338, 0 failing.

- [ ] **Step 6: Commit**

```bash
git add tests/api/get-studio-token.test.mjs
git commit -m "$(cat <<'EOF'
test(auth): B2 — HTTP tests get-studio-token (8 testes)

Cobre T20-T27 do spec:
- Input validation + env (T20-T22)
- verifyOnboardingKey rejeita (T23-T24)
- Step2 variants: tenant órfão + plano inválido + happy (T25-T27)

fetchMatcher patterns incluem &select= pra distinguir 2 chamadas em
tenants?id=eq (verifyOnboardingKey vs lookup plano). T27 valida formato
exato do link + expires_at futuro.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `request-studio-link.test.mjs` — 7 testes (T28-T34)

**Files:**
- Create: `tests/api/request-studio-link.test.mjs`

- [ ] **Step 1: Criar arquivo com helpers + mockEnv expandido + comentário**

```js
// ── InkFlow — HTTP tests pra functions/api/request-studio-link.js ─────
// Spec: docs/superpowers/specs/2026-05-07-auth-tests-b2-http-endpoints-design.md
// Auditoria: F2.4.1 (auth tests) — par com B1 (#45)
//
// IMPORTANTE: tests cobrem código existente em prod desde abril/2026.
// Se um teste falhar, investigar se é bug no endpoint OU no teste — NUNCA
// ajustar teste pra mascarar bug.
//
// mockEnv aqui é EXPANDIDO (4 vars extras vs outros arquivos):
// EVO_CENTRAL_INSTANCE, EVO_CENTRAL_APIKEY, MAILERLITE_API_KEY, EVO_BASE_URL.
// Sem essas, sendViaWhatsApp/sendViaEmail retornam {sent:false, reason:'not-configured'}
// antes do mock fetch — testes T31-T33 viram falsos positivos.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

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

// Shape mínimo obrigatório do tenant em T31-T34 (sendViaWhatsApp lê tenant.telefone!)
const TENANT_FOR_SEND = {
  id: VALID_UUID,
  email: 'a@b.com',
  telefone: '5511999999999',
  nome: 'Ana',
  nome_estudio: 'Ink',
  plano: 'estudio',
};

// ─── Tests ───────────────────────────────────────────────────────────────
```

- [ ] **Step 2: Adicionar T28-T30 (input + env + tenant não existe)**

Append:

```js
// T28 — sem email nem phone (ou ambos inválidos) → 400
test('request-studio-link — T28: input inválido → 400', async () => {
  const { onRequest } = await import('../../functions/api/request-studio-link.js');
  const cases = [{}, { email: '', phone: '' }, { email: 'no-at-sign', phone: 'abc' }];
  for (const body of cases) {
    const req = makeRequest('/api/request-studio-link', body);
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 400, `case ${JSON.stringify(body)}`);
  }
});

// T29 — SB_KEY/TOKEN_SECRET ausente → 503
test('request-studio-link — T29: SB_KEY ausente → 503', async () => {
  const { onRequest } = await import('../../functions/api/request-studio-link.js');
  const req = makeRequest('/api/request-studio-link', { email: 'a@b.com' });
  const env = mockEnv({
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    SUPABASE_SERVICE_KEY: undefined,
  });
  const res = await onRequest({ request: req, env });
  assert.equal(res.status, 503);
});

// T30 ⭐ — tenant não existe → 200 ok com channels_tried=[] (security: não vaza)
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
  } finally { restore(); }
});
```

- [ ] **Step 3: Adicionar T31 (happy + phone normaliza)**

Append:

```js
// T31 ⭐ — tenant existe + WA OK + email OK + phone normaliza
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
  } finally { restore(); }
});
```

- [ ] **Step 4: Adicionar T32-T34 (variantes WA/email)**

Append:

```js
// T32 — tenant existe + WA OK + email FAIL
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
  } finally { restore(); }
});

// T33 — tenant existe + WA FAIL + email OK
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
  } finally { restore(); }
});
```

- [ ] **Step 5: Rodar suite do arquivo + suite completa**

```bash
node --test tests/api/request-studio-link.test.mjs 2>&1 | tail -10
npm test 2>&1 | tail -5
```

Expected: 7 passing no arquivo. Suite completa: 338 + 7 = **345 testes**, 0 failing.

- [ ] **Step 6: Commit**

```bash
git add tests/api/request-studio-link.test.mjs
git commit -m "$(cat <<'EOF'
test(auth): B2 — HTTP tests request-studio-link (7 testes)

Cobre T28-T34 do spec:
- Input validation + env (T28-T29)
- Tenant não existe: 200 sem vazar (security goal #3) (T30)
- WA + email com 4 combinações de OK/FAIL (T31-T34)

mockEnv expandido com EVO + MailerLite vars pra evitar falsos positivos.
T31 valida phone normalization (11999999999 → 5511999999999) ANTES do
lookup. T34 confirma que falha de upstream não vaza pra cliente.

Fecha o par F2.4.1 (auth tests) com B1 (#45). Suite total: 345 testes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Push, PR e atualização da auditoria

**Files:**
- Modify: `docs/auditoria/2026-05-07-auditoria-completa.md` (marcar F2.4.1 como resolvido)

- [ ] **Step 1: Push da branch**

```bash
git push -u origin feat/auth-tests-b2-http-endpoints
```

Expected: branch criada no remoto.

- [ ] **Step 2: Validar suite completa rodando uma última vez**

```bash
npm test 2>&1 | tail -10
```

Expected: `# pass 345`, `# fail 0`. Se falhar aqui, **NÃO ABRIR PR** — investigar.

- [ ] **Step 3: Atualizar auditoria — marcar F2.4.1 como resolvido**

Modify `docs/auditoria/2026-05-07-auditoria-completa.md`. Buscar pela seção que cita F2.4.1 (provavelmente em "Findings fechados" ou "Pendências Sprint 1") e adicionar:

```markdown
**F2.4.1 — Auth completamente sem teste:** ✅ RESOLVIDO
- B1 (PR #45): 25 unit tests pra `_auth-helpers.js`
- B2 (PR #XX): 34 HTTP tests pros 4 endpoints de fluxo studio
- Cobertura total: 5 funções da lib + 4 endpoints = todos paths críticos de auth testados
- Risk: bypass de auth + leak entre tenants → mitigado por suite de regressão
```

(Substitir `#XX` pelo número do PR criado no próximo step.)

- [ ] **Step 4: Abrir PR**

```bash
gh pr create --base main --title "test(auth): B2 — HTTP tests dos 4 endpoints de fluxo studio (34 testes, fecha par F2.4.1)" --body "$(cat <<'EOF'
## Summary

Adiciona 34 HTTP tests cobrindo os 4 endpoints relacionados ao fluxo de auth do studio. Fecha o par com B1 (#45) para resolver F2.4.1 (auditoria 2026-05-07).

- `tests/api/validate-onboarding-key.test.mjs` (10 testes — T1-T10)
- `tests/api/validate-studio-token.test.mjs` (9 testes — T11-T19)
- `tests/api/get-studio-token.test.mjs` (8 testes — T20-T27)
- `tests/api/request-studio-link.test.mjs` (7 testes — T28-T34)

## Riscos protegidos

1. **Auth bypass** — token forjado / expirado / mismatch de key (T13, T14, T23)
2. **Vazamento silencioso** — `body.tenant === undefined` em token inválido (T13, T14, T15)
3. **Magic link enumeration** — `request-studio-link` retorna 200 idêntico mesmo sem tenant (T30)
4. **Reset silencioso** — assertion explícita do PATCH em `onboarding_links` (T8)
5. **Refresh quebrado** — sliding window e legacy promotion (T16, T18)

## Test plan

- [x] Suite local: 311 prévios + 34 novos = 345 passando
- [ ] CI passa (workflow `tests-on-pr` da Onda 2)
- [ ] Zero `console.error` no output da suite
- [ ] Auditoria F2.4.1 atualizada como resolvido

## Spec + Plan

- Spec: `docs/superpowers/specs/2026-05-07-auth-tests-b2-http-endpoints-design.md` (commits `c0318f7` + `f39b9bc`)
- Plan: `docs/superpowers/plans/2026-05-07-auth-tests-b2-http-endpoints.md`

## Sequência (par com B1)

- B1 (#45 mergeado): unit tests da lib `_auth-helpers.js` (25 testes)
- B2 (este PR): HTTP tests dos 4 endpoints (34 testes)
- **Total cobrindo F2.4.1: 59 testes**

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL retornada. Anota o número pra atualizar a auditoria.

- [ ] **Step 5: Commit da atualização da auditoria com #PR**

Re-edita `docs/auditoria/2026-05-07-auditoria-completa.md` substituindo `#XX` pelo número real do PR.

```bash
git add docs/auditoria/2026-05-07-auditoria-completa.md
git commit -m "docs(auditoria): F2.4.1 resolvido (B1 #45 + B2 #<PR>)"
git push
```

Expected: commit no PR atualiza a descrição da auditoria.

---

## Definition of Done (final check)

- [ ] 34 testes novos passam (`npm test` → 345 testes total, 0 failing)
- [ ] CI passa no PR (workflow `tests-on-pr` da Onda 2)
- [ ] Zero `console.error` ou warning não-esperado no output da suite
- [ ] Cada arquivo é auto-contido (sem cross-file imports)
- [ ] PR description liga ao **B1 (#45)** explicitamente
- [ ] Auditoria F2.4.1 marcada como resolvido com referências aos 2 PRs

---

## Notas de implementação

**Se um teste falhar:** investigar PRIMEIRO se é bug no endpoint, depois se é bug no teste. NUNCA ajustar o teste pra mascarar comportamento errado. Se o endpoint tem bug, abre issue, marca o teste com `test.skip(...)` com link pro issue, e continua.

**Console errors esperados:** o endpoint `validate-onboarding-key` faz `console.error('validate-onboarding-key: Supabase error', ...)` em T4. Esse é comportamento esperado — não é warning não-esperado. Outras `console.warn`/`console.log` são instrumentation legítima.

**Ordem importa pros 4 commits:** seguir ordem das tasks (validate-onboarding-key → validate-studio-token → get-studio-token → request-studio-link). Cada task adiciona helpers e patterns que a próxima reusa mentalmente. Pular ordem complica diagnóstico se algo falhar.

**Tempo estimado:** 3-4h totais.
- Task 1 (validate-onboarding-key): ~1h
- Task 2 (validate-studio-token): ~1h
- Task 3 (get-studio-token): ~45min
- Task 4 (request-studio-link): ~1h
- Task 5 (push + PR + auditoria): ~15min
