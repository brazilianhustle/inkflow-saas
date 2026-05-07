---
name: Auth tests — B2 (HTTP endpoints)
description: HTTP tests pros 4 endpoints relacionados ao fluxo de auth do studio — fecha o par F2.4.1 com o B1 (lib helpers)
date: 2026-05-07
status: ready-to-plan
type: feature-tests
tags: [auth, security, tests, sprint-2]
parent_finding: F2.4.1 (auditoria 2026-05-07)
related:
  - docs/superpowers/specs/2026-05-07-auth-tests-helpers-design.md (B1, mergeado em #45)
  - docs/auditoria/2026-05-07-auditoria-completa.md
---

# Auth tests — B2 (HTTP endpoints) — Design

## Contexto

Auditoria de 2026-05-07 (F2.4.1) flaggou **auth completamente sem teste** como crítico — 5 arquivos sem cobertura, risco de bypass = leak entre tenants. Sprint 2 ataca o gap.

**Decomposição em 2 sub-features (decidida no brainstorm do B1):**
- ~~**B1 (mergeado em #45):** unit tests da lib `_auth-helpers.js` (25 testes — fundação)~~
- **B2 (este spec):** HTTP tests dos endpoints do fluxo de auth do studio

B1 veio primeiro porque B2 depende da lib testada — `verifyOnboardingKey` e `verifyStudioTokenOrLegacy` rodam de verdade nos testes do B2 e precisam estar comprovadamente corretos.

## Framing — não é "endpoints que usam a lib"

Pegada importante do brainstorm: o B1 spec dizia que B2 cobriria "os 4 endpoints que usam a lib". **Falso.** Auditoria mostrou:

| Endpoint | Usa `_auth-helpers`? | Risco principal |
|---|---|---|
| `validate-onboarding-key` | **NÃO** (faz fetch direto em `tenants` + `onboarding_links`) | Link enumeration (key vazada → leak de `evo_instance` + `config_agente` + `config_precificacao`) |
| `validate-studio-token` | Sim (`verifyStudioTokenOrLegacy` + `generateStudioToken`) | HMAC bypass + tenant não-bloqueado quando token expira |
| `get-studio-token` | Sim (`verifyOnboardingKey` + `generateStudioToken`) | Auth bypass do gerador de token (impersona dono via key vazada) |
| `request-studio-link` | Sim (`generateStudioToken`) | Magic link enumeration + side-channel via timing |

Então B2 cobre **2 famílias distintas**: 3 endpoints que usam a lib + 1 quasi-irmão (`validate-onboarding-key`) com risco análogo (link enumeration).

## Goal

Cobrir os **4 endpoints** com **34 testes HTTP** que protegem contra:

1. Auth bypass (token forjado / expirado / mismatch de key)
2. Vazamento silencioso (response com tenant data quando token inválido)
3. Magic link enumeration (`request-studio-link` precisa devolver 200 idêntico mesmo sem tenant)
4. Reset silencioso (link reativado sem PATCH efetivo no DB)
5. Refresh quebrado (HMAC sliding window e legacy promotion)

## Decisões cravadas (do brainstorm)

| Decisão | Valor |
|---|---|
| Escopo de cobertura | Padrão (~30-35 testes) — pula CORS preflight + 405 redundante (idênticos entre endpoints, regressão semântica zero) |
| Mock strategy | Lib real + mock fetch (`globalThis.fetch` override + try/finally restore) |
| File layout | 4 arquivos em `tests/api/<endpoint>.test.mjs` — espelha padrão `tests/api/conversas-*.test.mjs` |
| Helpers | Duplicados localmente em cada arquivo (~10 LoC overhead) — auto-contido, espelha padrão atual |
| External calls (`request-studio-link`) | `fetchMatcher` por substring com 3 patterns: Supabase + Evolution + MailerLite |
| Total de testes | 34 |
| Tempo estimado | 3-4h |

## Helpers compartilhados (no topo de cada arquivo)

Todos os 4 arquivos compartilham o **mesmo bloco de helpers**, copiado-e-colado intencionalmente (auto-contido, sem cross-file imports):

### Constantes
```js
const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
```

### `mockEnv(overrides)`
```js
function mockEnv(overrides = {}) {
  return {
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    SUPABASE_SERVICE_KEY: 'test-service-key',  // alguns endpoints usam essa var
    STUDIO_TOKEN_SECRET: 'test-secret-min-32-chars-padding-padding',
    ...overrides,
  };
}
```

**Override obrigatório no `request-studio-link.test.mjs`:**
```js
function mockEnv(overrides = {}) {
  return {
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    STUDIO_TOKEN_SECRET: 'test-secret-min-32-chars-padding-padding',
    EVO_CENTRAL_INSTANCE: 'inkflow_central',
    EVO_CENTRAL_APIKEY: 'test-evo-key',
    MAILERLITE_API_KEY: 'test-ml-key',
    EVO_BASE_URL: 'https://evo.test.example',
    ...overrides,
  };
}
```

Sem essas 4 vars extras, `sendViaWhatsApp`/`sendViaEmail` retornam `{sent:false, reason:'not-configured'}` antes do mock fetch — testes ficam falsos positivos.

### `withMockFetch(handler)` + `jsonResponse(body, status)`
```js
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
```

### `fetchMatcher(routes)` — com rastreio de `calls[]`
```js
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
```

**`handler.calls`** é crítico pro T8 — assertar que PATCH foi disparado.

### `makeStudioToken(tenantId, env, ttlDays)`
```js
async function makeStudioToken(tenantId, env, ttlDays = 30) {
  const { generateStudioToken } = await import('../../functions/api/_auth-helpers.js');
  return generateStudioToken(tenantId, env.STUDIO_TOKEN_SECRET, ttlDays);
}
```

### `mutateSig(token, mutator)` — só no `validate-studio-token.test.mjs`
```js
function mutateSig(token, mutator) {
  const parts = token.split('.');
  parts[3] = mutator(parts[3]);
  return parts.join('.');
}
```
Uso: T13 — `mutateSig(token, sig => sig.slice(0,-1) + 'x')` (preserva length, força HMAC mismatch).

### `makeRequest(path, body, method)`
```js
function makeRequest(path, body, method = 'POST') {
  return new Request(`https://inkflowbrasil.com${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
```

## Testes — lista completa (34)

### `tests/api/validate-onboarding-key.test.mjs` — 10 testes

| ID | Teste | Mock | Asserção principal |
|---|---|---|---|
| **T1** | input vazio (`{}` ou key < 8 chars) | sem fetch | status 400, `body.error` match |
| **T2** | JSON inválido no body (string raw) | sem fetch | status 400 |
| **T3** | `SUPABASE_SERVICE_KEY` ausente | sem fetch | status 503 |
| **T4** | Supabase 500 (DB error) | `links?` → status 500 | status 500, `body.error` match |
| **T5** | link não encontrado | `links?` → `[]` | 200, `{valid: false, error: /n.o encontrado/}` |
| **T6** | link expirado | `links?` → `[{expires_at: '2020-01-01T00:00:00Z'}]` | 200, `{valid: false, error: /expirado/}` |
| **T7** | link `used:true` + tenant não existe | `links?` → `[{used:true,...}]`, `tenants?` → `[]` (× 2) | 200, `{valid: false, error: /j. foi utilizado/}` |
| **T8** ⭐ | link `used:true` + tenant existe (reativa) | `links?` → `[{used:true,id:'L1'}]`, `tenants?` → `[{...}]`, PATCH `links?` → 204 | 200, `valid:true`, **+ assertar `handler.calls.find(c => c.method==='PATCH' && c.url.includes('onboarding_links?id=eq.L1'))` truthy** |
| **T9** | link válido + tenant novo (não criado) | `links?` → `[{used:false,...}]`, `tenants?` → `[]` × 2 | 200, `{valid:true, plano, link_id}` (sem `tenant`) |
| **T10** | link válido + tenant existe (smart-resume) | `links?` → `[{used:false,...}]`, `tenants?` → `[{...}]` | 200, `valid:true`, `tenant.{id, ativo, welcome_shown, evo_instance, ...}` |

### `tests/api/validate-studio-token.test.mjs` — 9 testes

| ID | Teste | Mock | Asserção principal |
|---|---|---|---|
| **T11** | token < 10 chars | sem fetch | 400 |
| **T12** | JSON inválido | sem fetch | 400 |
| **T13** | HMAC sig errada | token construído via `makeStudioToken(VALID_UUID, env)` + `mutateSig(token, sig => sig.slice(0,-1)+'x')` (preserva length) | 401, `body.tenant` undefined |
| **T14** | HMAC expirado | token construído via `makeStudioToken(VALID_UUID, env, -1)` (ttlDays negativo) | 401 |
| **T15** | UUID legacy (sem prefix `v1.`) + tenant não existe | token = `'12345678-1234-1234-1234-123456789012'` (UUID raw); `tenants?studio_token=eq` → `[]` | 401 |
| **T16** | UUID legacy + tenant existe (legacy → HMAC promotion) | token = UUID raw; `tenants?studio_token=eq.<UUID>` → `[{id: VALID_UUID}]`; `tenants?id=eq.VALID_UUID` → `[{nome_estudio,plano,...}]` | 200, **`refreshed_token.startsWith('v1.')`**, **split=4 partes**, **`token_exp` no body** |
| **T17** | HMAC válido + `shouldRefresh=false` (TTL 30d) | `tenants?id=eq` → `[{...}]` | 200, **`refreshed_token === null`** |
| **T18** ⭐ | HMAC válido + `shouldRefresh=true` (TTL 6.5d) | `tenants?id=eq` → `[{...}]` | 200, **`refreshed_token` válido**, **split=4**, **exp(refreshed) > exp(original)** |
| **T19** | HMAC válido + tenant não existe no DB | `tenants?id=eq` → `[]` | 404 |

**Importante (Furo 3):** os 2 fetches em `tenants?` precisam de patterns DIFERENTES no `fetchMatcher`:
- `'tenants?studio_token=eq'` (lookup legacy via `verifyStudioTokenOrLegacy`)
- `'tenants?id=eq'` (select pleno do endpoint)

### `tests/api/get-studio-token.test.mjs` — 8 testes

| ID | Teste | Mock | Asserção principal |
|---|---|---|---|
| **T20** | falta `tenant_id` ou `onboarding_key` | sem fetch | 400 |
| **T21** | JSON inválido | sem fetch | 400 |
| **T22** | `SB_KEY` ausente | sem fetch (env override `{SUPABASE_SERVICE_ROLE_KEY: undefined, SUPABASE_SERVICE_KEY: undefined}`) | 503 (cobre `||` via short-circuit; ramo `TOKEN_SECRET` por similaridade estrutural não precisa teste extra) |
| **T23** | `verifyOnboardingKey` rejeita (key mismatch) | `tenants?` (lookup key) → `[{onboarding_key:'other'}]` | 403, `body.error` match `/Autenticação falhou/` |
| **T24** | `verifyOnboardingKey` rejeita (tenant não existe) | `tenants?` → `[]` | 403 |
| **T25** | tenant não existe no select de plano | step1 ok (`tenants?` lookup key match), step2 (`tenants?` lookup plano) → `[]` | 404 |
| **T26** | plano inválido (`'free'`) | step1 ok, step2 → `[{plano:'free'}]` | 400, `body.error` match `/Plano não reconhecido/` |
| **T27** ⭐ | happy path | step1 ok, step2 → `[{plano:'estudio',ativo:true}]` | 200, **`token.startsWith('v1.')`**, **`link === 'https://inkflowbrasil.com/studio.html?token='+token+'&welcome=true'`**, **`expires_at > Math.floor(Date.now()/1000)`** |

### `tests/api/request-studio-link.test.mjs` — 7 testes

| ID | Teste | Mock | Asserção principal |
|---|---|---|---|
| **T28** | sem email nem phone (ou ambos inválidos) | sem fetch | 400 |
| **T29** | `SB_KEY` ausente | sem fetch (env override `{SUPABASE_SERVICE_ROLE_KEY: undefined, SUPABASE_SERVICE_KEY: undefined}`) | 503 (cobre `||` via short-circuit) |
| **T30** ⭐ | tenant **não existe** | `tenants?` → `[]` | 200, **`{ok:true, channels_tried:[]}`** (security: não vaza) |
| **T31** ⭐ | tenant existe + WA OK + email OK + **phone normaliza** | `tenants?telefone=eq.5511999999999` → `[{...}]`, Evo `/message/sendText/` → 200, ML → 200 | 200, `channels_tried:['whatsapp','email']`, **assertar `handler.calls.find(c => c.url.includes('telefone=eq.5511999999999'))`** (phone foi normalizado de `'11999999999'`) |
| **T32** | tenant existe + WA OK + email FAIL | Evo → 200, ML → 500 | 200, `channels_tried:['whatsapp']` |
| **T33** | tenant existe + WA FAIL + email OK | Evo → 500, ML → 200 | 200, `channels_tried:['email']` |
| **T34** | tenant existe + ambos FAIL | Evo → 500, ML → 500 | 200, `channels_tried:[]` (não vaza erro upstream) |

## Refinamentos vindos da revisão crítica

5 furos identificados antes da escrita do spec. Resolvidos em testes existentes (não viraram testes novos):

1. **Premissa errada** "endpoints que usam a lib" → corrigida no Framing acima.
2. **`mockEnv` incompleto** pro `request-studio-link.test.mjs` → 4 env vars extras adicionadas.
3. **fetchMatcher ambíguo** no `validate-studio-token.test.mjs` → 2 patterns distintos cravados (T15, T16).
4. **T8 só asserta response** → adicionada assertion explícita do PATCH disparado em `handler.calls[]`.
5. **Asserts fracos** em T18 e T27 → ampliados pra prefix, formato split, exp comparado.

## Anti-goals (escopo PULADO deliberadamente)

- ❌ CORS preflight (`OPTIONS → 204`) — idêntico nos 4 endpoints, regressão semântica zero
- ❌ `method !== POST → 405` — idêntico, mesma regressão zero
- ❌ Cobertura de CORS headers no response — configuração estática, protegida por `o-confere`
- ❌ Strings exotic em `plano` (além de `'free'`) — 1 caso por branch é suficiente
- ❌ Shape guard do `validate-onboarding-key` — frágil/auto-anestesiante; risco real de leak (`evo_instance`, `config_agente`) é **design**, não bug, e vira finding pra Sprint 2

## Definition of Done

- [ ] 34 testes novos passam (`npm test` → 311 prévios + 34 novos = **345**)
- [ ] CI passa no PR (workflow `tests-on-pr` da Onda 2)
- [ ] Zero `console.error` ou warning não-esperado no output da suite
- [ ] Cada arquivo é auto-contido (não importa de outros tests)
- [ ] Frontmatter do spec referencia `parent_finding: F2.4.1` + B1 spec
- [ ] PR description liga ao **B1 (#45)** explicitamente como "fechamento do par F2.4.1"
- [ ] Auditoria 2026-05-07: marcar finding F2.4.1 como **resolvido** após merge

## Ordem de execução (4 commits, 1 PR)

| # | Arquivo | Testes | Por quê nessa ordem |
|---|---|---|---|
| 1 | `validate-onboarding-key.test.mjs` | 10 | Não usa `_auth-helpers` → confirma padrão de helpers locais sem dep extra |
| 2 | `validate-studio-token.test.mjs` | 9 | Usa lib + fetchMatcher 2-pattern (cravado no spec) |
| 3 | `get-studio-token.test.mjs` | 8 | Reusa `verifyOnboardingKey` mock pattern do arquivo 1 + `generateStudioToken` do 2 |
| 4 | `request-studio-link.test.mjs` | 7 | Maior superfície (3 services externos), último depois que padrão tá maduro |

Cada commit:
- Roda `npm test` localmente antes de criar
- Mensagem: `test(auth): B2 — HTTP tests <endpoint> (N testes)`

## Riscos secundários (vão pro backlog Sprint 2 — não cobertos por testes)

Identificados durante o brainstorm. Não são **bugs**, são **decisões de design** que merecem revisão futura:

1. **`validate-onboarding-key` shape massivo no response** — retorna `evo_instance`, `config_agente`, `config_precificacao`, `email`, `welcome_shown` só com a key. Se key vaza em URL/log, atacante recebe configuração completa do estúdio. **Refator:** mover esses campos pro `validate-studio-token` (que requer auth HMAC mais forte) ou pra endpoint distinto pós-onboarding.

2. **`request-studio-link` falha silenciosa do Evolution 200 com error body** — `r.ok=true` mas mensagem não chega quando WhatsApp instance não tá conectada. **Refator:** parsear `r.json()` e verificar `key.id`/`status` antes de marcar como `sent:true`.

3. **Rate limit ausente em `request-studio-link`** — comentário TODO no código (linha 8). Atacante pode enumerar emails/telefones por timing (Evolution latência varia). **Mitigação:** KV-based rate limiter por IP ou coluna `last_recovery_at` no tenants.

## Output

- `tests/api/validate-onboarding-key.test.mjs` (~250 LoC)
- `tests/api/validate-studio-token.test.mjs` (~230 LoC)
- `tests/api/get-studio-token.test.mjs` (~210 LoC)
- `tests/api/request-studio-link.test.mjs` (~280 LoC)
- **Total esperado: ~970 LoC, 34 testes**

PR esperado: `test(auth): B2 — HTTP tests dos 4 endpoints de fluxo studio (34 testes, fecha par F2.4.1)`
