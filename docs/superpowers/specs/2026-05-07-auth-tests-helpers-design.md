---
name: Auth tests — B1 (lib helpers)
description: Unit tests pra functions/api/_auth-helpers.js — fundação de auth do studio dashboard + onboarding
date: 2026-05-07
status: ready-to-plan
type: feature-tests
tags: [auth, security, tests, sprint-2]
parent_finding: F2.4.1 (auditoria 2026-05-07)
related: docs/superpowers/specs/2026-05-07-auditoria-completa-saas-design.md
---

# Auth tests — B1 (lib helpers) — Design

## Contexto

Auditoria de 2026-05-07 (F2.4.1) flaggou **auth completamente sem teste** como crítico — 5 arquivos sem cobertura, risco de bypass = leak entre tenants. Sprint 2 ataca o gap.

**Decomposição em 2 sub-features (decidida no brainstorm):**
- **B1 (este spec):** unit tests da lib `_auth-helpers.js` (fundação)
- **B2 (próxima feature):** HTTP tests dos 4 endpoints que usam a lib (`validate-onboarding-key`, `validate-studio-token`, `get-studio-token`, `request-studio-link`)

B1 vai primeiro porque B2 depende da lib testada — endpoints reusam `generateStudioToken` pra gerar tokens válidos nos próprios testes.

## Goal

Cobrir os **5 exports** de `functions/api/_auth-helpers.js` com **25 testes unitários** focados em paths críticos de segurança:
- HMAC sign/verify do studio token
- Validação de onboarding key contra DB
- Fallback HMAC ↔ UUID legacy
- 2 edge cases security: timing-safe compare + fail-open TTL

Risco protegido: bypass de auth do studio dashboard ou de onboarding.

## Decisões cravadas (do brainstorm)

| Decisão | Valor |
|---|---|
| Localização do arquivo | `tests/auth-helpers.test.mjs` (top-level — lib tests no projeto seguem top-level: `audit-state`, `trial-helpers`, `telegram`) |
| Estrutura de teste | flat com prefix por função: `test('verifyStudioToken — happy path', ...)` |
| Mock de fetch | `globalThis.fetch` override com try/finally restore (padrão do projeto) |
| Mock de Date / tempo | Manipular `ttlDays` da `generateStudioToken` (sem `Date.now()` mock; sem `t.mock.timers`) |
| Estratégia de import | Dynamic import dentro de cada teste (`await import('...')`) — segue padrão `tests/api/conversas-list.test.mjs` |
| Cobertura | "Padrão" + 2 edge cases security (timing-safe, fail-open) |
| Total de testes | 25 |
| LoC esperadas | ~340-360 |

## Helpers compartilhados (no topo do arquivo de teste)

### Fixtures
```js
const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const STUDIO_SECRET = 'test-secret-min-32-chars-padding-padding';
const SUPABASE_URL = 'https://test.supabase.co';
const SUPABASE_KEY = 'test-service-key';
```

### `withMockFetch(handler) → restore`

Substitui `globalThis.fetch` e retorna função pra restaurar. Use em `try/finally`.

```js
function withMockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}
```

### `jsonResponse(body, status = 200)`

Helper pra montar `Response` JSON consistente com Supabase REST output.

```js
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### `fetchMatcher(routes)`

Multi-rota — match por substring na URL. Pra testes que fazem mais de 1 fetch (ex: `verifyOnboardingKey` faz tenants + onboarding_links).

```js
function fetchMatcher(routes) {
  return async (url) => {
    for (const [pattern, response] of routes) {
      if (url.includes(pattern)) return response();
    }
    throw new Error(`unmocked fetch: ${url}`);
  };
}
```

### `forgeToken({ tidB64, expStr, secret = STUDIO_SECRET })`

Constrói token `v1.<tidB64>.<expStr>.<sig>` com HMAC válido sobre o payload custom — pra cenários onde precisa de payload deliberadamente malformado mas com sig assinada (T11, T13).

```js
async function forgeToken({ tidB64, expStr, secret = STUDIO_SECRET }) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const payload = `${tidB64}.${expStr}`;
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const sig = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return `v1.${payload}.${sig}`;
}
```

### `mutateSig(token, mutator)`

Pega token gerado e modifica só a sig (parte 4). Pra T9 (sig trocada mesma length) e T10 (sig length diferente).

```js
function mutateSig(token, mutator) {
  const parts = token.split('.');
  parts[3] = mutator(parts[3]);
  return parts.join('.');
}
```

### `makeToken(tenantId, ttlDays = 30)`

DRY wrapper sobre `generateStudioToken` passando `STUDIO_SECRET` automaticamente.

```js
async function makeToken(tenantId, ttlDays = 30) {
  const { generateStudioToken } = await import('../functions/api/_auth-helpers.js');
  return generateStudioToken(tenantId, STUDIO_SECRET, ttlDays);
}
```

## Testes — lista completa (25)

### `b64url` / `b64urlDecode` — 1 teste

| ID | Teste | Asserção |
|---|---|---|
| **T1** | round-trip simples | `b64urlDecode(b64url('hello world')) === 'hello world'` |

### `generateStudioToken` — 3 testes

| ID | Teste | Asserção |
|---|---|---|
| **T2** | happy path | retorna formato `v1.<3 parts>` (4 segmentos no split por `.`); exp ≈ now + 30d |
| **T3** | tenantId não-UUID | `assert.rejects(...)` com mensagem `/tenant_id inválido/` |
| **T4** | secret missing | `assert.rejects(...)` com mensagem `/STUDIO_TOKEN_SECRET ausente/` |

### `verifyStudioToken` — 10 testes

| ID | Teste | Setup | Asserção |
|---|---|---|---|
| **T5** | happy path | `await makeToken(VALID_UUID)` (TTL 30) | `{valid: true, tenantId: VALID_UUID, exp: number, shouldRefresh: false}` |
| **T6** | sem prefix v1. | string `'foo.bar.baz'` | retorna `null` (early return) |
| **T7** | secret missing | passa secret vazio | `{valid: false, reason: 'secret-missing'}` |
| **T8** | malformado (3 parts) | string `'v1.aaa.bbb'` | `{valid: false, reason: 'malformed'}` |
| **T9** | sig trocada (mesma length) | `mutateSig(token, sig => sig.slice(0,-1) + 'x')` (preserva length) | `{valid: false, reason: 'bad-signature'}` |
| **T10** ⭐ edge#1 | sig length diferente | `mutateSig(token, sig => sig.slice(0,-2))` | `{valid: false, reason: 'bad-signature'}` (cobre branch length-mismatch antes do byte compare) |
| **T11** | exp não numérico | `forgeToken({ tidB64: b64url(VALID_UUID), expStr: 'abc' })` | `{valid: false, reason: 'malformed-exp'}` |
| **T12** | exp passado | `await makeToken(VALID_UUID, -1)` | `{valid: false, reason: 'expired', exp: number}` |
| **T13** | tenantId payload malformado | `forgeToken({ tidB64: b64url('not-uuid'), expStr: '9999999999' })` | `{valid: false, reason: 'malformed-tenant'}` |
| **T14** | sliding refresh boundary | `await makeToken(VALID_UUID, 6.5)` | `{valid: true, shouldRefresh: true}` |

**T10 deve ter comentário inline:**
```js
// edge case #1: INTENTIONAL — length mismatch retorna bad-signature antes do
// byte compare loop, protegendo contra timing attacks (NIST SP 800-107).
// Não consolidar com loop XOR — separação é a invariante de segurança.
```

### `verifyOnboardingKey` — 7 testes (todos com mock fetch)

| ID | Teste | Mock fetch retorna | Asserção |
|---|---|---|---|
| **T15** | happy path | `tenants?` → `[{onboarding_key: 'mykey1234'}]`<br>`onboarding_links?` → `[{expires_at: '2030-01-01T00:00:00Z'}]` | `{ok: true}` |
| **T16** | tenantId não-UUID | (sem fetch — fail antes) | `{ok: false, reason: 'invalid-tenant-id'}` |
| **T17** | key < 8 chars | (sem fetch — fail antes) | `{ok: false, reason: 'missing'}` |
| **T18** | tenant não existe | `tenants?` → `[]` | `{ok: false, reason: 'not-found'}` |
| **T19** | key mismatch | `tenants?` → `[{onboarding_key: 'different'}]` | `{ok: false, reason: 'mismatch'}` |
| **T20** | link expirado | `tenants?` → match key, `onboarding_links?` → `[{expires_at: '2020-01-01T00:00:00Z'}]` | `{ok: false, reason: 'expired', expires_at: '2020-01-01T00:00:00Z'}` |
| **T21** ⭐ edge#3 | link ausente fail-open | `tenants?` → match key, `onboarding_links?` → `[]` (vazio) | `{ok: true}` |

**T21 deve ter comentário inline:**
```js
// edge case #3: INTENTIONAL fail-open quando link ausente em onboarding_links.
// Decisão histórica pra permitir retry após admin reset. Mudar pra fail-closed
// requer decisão explícita (advisor F1.4.x na auditoria 2026-05-07).
// Não converter em fail-fast sem revisão.
```

### `verifyStudioTokenOrLegacy` — 4 testes (mock fetch pra UUID legacy lookup)

| ID | Teste | Setup + Mock | Asserção |
|---|---|---|---|
| **T22** | HMAC válido | token recém-gerado; sem fetch | `{tenantId: VALID_UUID, exp: number, shouldRefresh: false, source: 'hmac'}` |
| **T23** | HMAC expirado, sem fallback | `await makeToken(VALID_UUID, -1)`; mock fetch que retornaria match (não deve ser chamado) | retorna `null` (HMAC expirado curto-circuita, não cai pro legacy lookup) |
| **T24** | UUID legacy match | token = `'00000000-0000-0000-0000-000000000099'` (UUID raw, sem prefix v1.); mock fetch `tenants?studio_token=eq.X` → `[{id: VALID_UUID}]` | `{tenantId: VALID_UUID, source: 'legacy-uuid'}` |
| **T25** | nem HMAC nem legacy | token aleatório; mock fetch retorna `[]` | retorna `null` |

## Estrutura final do arquivo

```
tests/auth-helpers.test.mjs
├── Imports (test, assert)
├── Fixtures (VALID_UUID, STUDIO_SECRET, SUPABASE_URL, SUPABASE_KEY)
├── Helpers (withMockFetch, jsonResponse, fetchMatcher, forgeToken, mutateSig, makeToken)
│
├── // ─── b64url ───
│   └── T1
│
├── // ─── generateStudioToken ───
│   ├── T2 (happy)
│   ├── T3 (non-UUID throws)
│   └── T4 (secret missing throws)
│
├── // ─── verifyStudioToken ───
│   ├── T5 (happy)
│   ├── T6 (no v1. prefix)
│   ├── T7 (secret missing)
│   ├── T8 (malformed 3 parts)
│   ├── T9 (sig swapped same length)
│   ├── T10 ⭐ edge#1 (sig length diff) + comentário INTENTIONAL
│   ├── T11 (exp NaN via forgeToken)
│   ├── T12 (exp passed via ttlDays=-1)
│   ├── T13 (tenantId payload non-UUID via forgeToken)
│   └── T14 (sliding refresh ttlDays=6.5)
│
├── // ─── verifyOnboardingKey ───
│   ├── T15 (happy)
│   ├── T16 (non-UUID tenantId)
│   ├── T17 (short key)
│   ├── T18 (tenant not found)
│   ├── T19 (key mismatch)
│   ├── T20 (link expired)
│   └── T21 ⭐ edge#3 (link absent fail-open) + comentário INTENTIONAL
│
└── // ─── verifyStudioTokenOrLegacy ───
    ├── T22 (HMAC valid)
    ├── T23 (HMAC expired, no legacy fallback)
    ├── T24 (UUID legacy match)
    └── T25 (neither valid)
```

## Definition of Done

- [ ] `tests/auth-helpers.test.mjs` criado com **25 testes** + 6 helpers
- [ ] **Local:** `node --test tests/auth-helpers.test.mjs` → 25/25 pass / 0 fail / < 5s
- [ ] **CI:** workflow `Tests` (`.github/workflows/tests.yml`, criado no Sprint 1 Onda 2) passa em PR
- [ ] **Cobertura grosseira:** todos os 5 exports de `_auth-helpers.js` exercitados
- [ ] **T10 e T21:** comentários `INTENTIONAL` inline obrigatórios documentando intent
- [ ] PR aberto, CI verde, mergeado em `main`
- [ ] Total LoC: ~340-360

## Out of scope (intencional)

### Pra B2 (próxima sub-feature)

- Tests dos 4 HTTP endpoints (`validate-onboarding-key`, `validate-studio-token`, `get-studio-token`, `request-studio-link`)
- Mock de `env`, side-effects (Evolution sendText, MailerLite subscribe)
- Smoke E2E com curl real contra prod

### Não cobertos no escopo "Padrão" (anotar pra Sprint 3+ se quiser exhaustive)

- `verifyOnboardingKey` — exception no DB call (catch retorna `{ok: false, reason: 'exception'}`) — não testado
- `verifyStudioTokenOrLegacy` — exception na legacy lookup (catch retorna `null`) — não testado
- Token com sig vazia → cai em T10 implicitamente (length mismatch)
- Token com payload vazio → cai em T13 implicitamente (malformed-tenant)

### Não usado no projeto

- `node --experimental-test-coverage` — projeto não tem coverage tool. Adoção marginal pra B1.

## Riscos e mitigações

| Risco | Probabilidade | Mitigação |
|---|---|---|
| HMAC `crypto.subtle` não disponível em Node test | Baixa | Node 20+ tem WebCrypto API estável. CI usa Node 20. |
| Tests flaky por timing real (Date.now durante test) | Baixa | `ttlDays=-1` produz exp ~1 dia atrás; rounding insignificante |
| Comentário `INTENTIONAL` ignorado em refactor futuro | Média | Pre-commit/PR review captura. Plus: comentário linka pra esta auditoria 2026-05-07. |
| Padrão dynamic import quebrar pra static no futuro | Baixa | Decisão registrada aqui. Mudança requer alterar 25 testes — fricção natural protege. |

## Critério de sucesso

- 25/25 testes passam local + CI
- Próximo dev consegue **ler T10/T21 e entender que NÃO deve consolidar/refactorar** (comentários cumprem o papel)
- B2 (HTTP endpoints) consegue **reusar `makeToken`** pra gerar tokens válidos sem duplicar HMAC logic

## Próximos passos

1. User revisa este spec (verificar se algo escapou)
2. Invocar `superpowers:writing-plans` pra gerar plan de implementação
3. Plan vai detalhar ordem dos testes (qual fazer primeiro, refactors em meio se necessário)
