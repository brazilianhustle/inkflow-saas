---
name: Evolution endpoints tests — B4 (HTTP endpoints)
description: Tests pros 4 endpoints do fluxo Evolution (evo-create-instance, evo-pairing-code, evo-qr, evo-status) — fecha F2.4.3 da auditoria
date: 2026-05-07
status: ready-to-plan
type: feature-tests
tags: [evolution, whatsapp, tests, sprint-2]
parent_finding: F2.4.3 (auditoria 2026-05-07)
related:
  - docs/superpowers/specs/2026-05-07-auth-tests-helpers-design.md (B1, mergeado em #45)
  - docs/superpowers/specs/2026-05-07-auth-tests-b2-http-endpoints-design.md (B2, mergeado em #46)
  - docs/superpowers/specs/2026-05-07-billing-tests-b3-design.md (B3, mergeado em #50)
  - docs/auditoria/2026-05-07-auditoria-completa.md
---

# Evolution endpoints tests — B4 — Design

## Contexto

Auditoria de 2026-05-07 (F2.4.3) flaggou os 4 endpoints Evolution sem cobertura de teste como risco alto — onboarding pode falhar silencioso porque a Evolution API v2.3.7 tem múltiplos quirks de schema (webhook config em 3 formatos, 5 paths pra extrair apikey, 3 schemas pra extrair state). B4 fecha esse gap.

**Decomposição Sprint 2:**
- ~~B1 (mergeado em #45)~~: unit tests `_auth-helpers.js` (25 testes)
- ~~B2 (mergeado em #46)~~: HTTP tests dos 4 endpoints auth do studio (34 testes)
- ~~B3 (mergeado em #50)~~: tests do fluxo billing — 3 endpoints HTTP + lib `mp-sinal-handler` (41 testes)
- **B4 (este spec)**: HTTP tests dos 4 endpoints Evolution (31 testes)

Após B4 mergeado, Sprint 2 fecha 100% do gap de testes apontado pela auditoria (F2.4.1 + F2.4.2 + F2.4.3 = 131 testes cobrindo auth + billing + Evolution).

B4 segue padrão estabelecido por B1+B2+B3 (lib real + mock fetch via `fetchMatcher` + helpers inline + 1 arquivo por endpoint).

## Framing — 4 endpoints

| Endpoint | Arquivo | Cenários | Foco |
|---|---|---|---|
| `evo-create-instance` (303 LoC) | `tests/api/evo-create-instance.test.mjs` | **13** (EC1-EC13) | Gate pgto + idempotência + webhook multi-format/multi-key + Supabase PATCH + Evo errors |
| `evo-pairing-code` (123 LoC) | `tests/api/evo-pairing-code.test.mjs` | **6** (EP1-EP6) | Body val + tenant lookup + connectionState pre-check + "connecting" recovery + happy path + Evo error |
| `evo-qr` (73 LoC) | `tests/api/evo-qr.test.mjs` | **5** (EQ1-EQ5) | Body val + tenant lookup + happy path 3 paths base64 + Evo error |
| `evo-status` (81 LoC) | `tests/api/evo-status.test.mjs` | **7** (ES1-ES7) | Body val + tenant lookup + happy path 3 schemas state + 3 schemas instance match + Evo error |
| **Total** | | **31** | |

## Goal — 9 riscos cobertos

| # | Risco | Coberto por |
|---|---|---|
| 1 | Onboarding cria instância **com pagamento não-confirmado** (gate furado) | EC4 (status `refused`/`pending`/`cancelled` sem trial → 403), EC5 (trial ativo passa), EC6 (free plan passa) |
| 2 | Webhook config **silenciosamente quebrado** após criação (Evolution v2.3.7 quirk: 3 formatos × 2 keys = até 6 attempts) | EC9 (formato A succeed na 1ª), EC10 (A falha + B succeed), EC11 (todos 6 falham → 502 mas instância criada) |
| 3 | Idempotência quebrada — re-onboarding cria instância duplicada na Evolution | EC7 (`already_existed=true`, apikey extraída de `existing.hash.apikey`) |
| 4 | "connecting" stuck — pairing code falha porque instância em estado inválido sem reset | EP5 (connectionState=`connecting` → `instance/logout` chamado **antes** de `instance/connect`) |
| 5 | State extraction quebrado pós-upgrade Evolution (3 schemas: `instance.state`, `state`, `connectionStatus`) | ES4, ES5, ES6 (cada schema retorna estado correto) |
| 6 | Apikey extraction quebrado — instância criada mas tenant sem credenciais | EC8 (5 paths parameterized: `hash.apikey` / `hash` string / `instance.apikey` / `apikey` / `token`) |
| 7 | QR code base64 não retornado — onboarding trava sem feedback | EQ4 (3 paths parameterized: `base64` / `qrcode.base64` / `code`) |
| 8 | Side-effect ordering: webhook é configurado **antes** de salvar apikey no tenant — race em onboarding rápido | EC12 (sequência cronológica completa: gate → idempotency → create → webhook → settings → PATCH) |
| 9 | Magic auth bypass — endpoint chamado sem credentials válidas acessa Evolution sob credenciais alheias | EC1 (body inválido → 400), EP2/EQ2/ES2 (tenant não encontrado → 404), EP3/EQ3/ES3 (apikey ausente/`pending` → 425) |

## Decisões cravadas

| Decisão | Valor |
|---|---|
| Escopo | 4 endpoints (F2.4.3 nominal — `send-whatsapp-link.js` adjacente fica fora) |
| Total de testes | 31 (EC×13 + EP×6 + EQ×5 + ES×7) |
| Tempo estimado | brainstorm 50min ✅ + spec 40min ✅ + plan 60-90min + execução 3-4h + smoke 30min = **6-7.5h** |
| Mock strategy | Lib real + mock `globalThis.fetch` via `fetchMatcher` (Object form, padrão B2/B3) |
| File layout | 1 arquivo por endpoint em `tests/api/evo-*.test.mjs` (4 arquivos) |
| Helpers | Duplicados localmente em cada arquivo (auto-contido, padrão B1+B2+B3). Helpers Evolution onde se sobrepõem (`fetchMatcher`/`withMockFetch` em todos 4; `mockEvoFetchInstances` em create-instance + status) **byte-identical** — final reviewer holístico verifica via `md5` |
| Sleep stub | Apenas em `evo-pairing-code.test.mjs` EP5 — `mock.method(globalThis, 'setTimeout', fn => { fn(); return 0; })` com `try/finally` restore |
| Side-effect ordering | EC12 apenas (sequência completa create-instance, 7 calls em ordem cronológica) |
| Logging assertions | Skipar — não asserta `console.log/warn/error` (ruído) |
| Skip CORS/405/OPTIONS | Sim — idênticos entre endpoints, regressão zero (decisão herdada B2/B3) |
| Plano nomes (gate pgto) | EC4 `'individual'` (PAID_PLAN_IDS[0], status=`refused`/`pending`/`cancelled`); EC5 `'individual'` + `trial_ate` futuro; EC6 `'free'` (`isFreeTrial=true`) |
| **Gate pgto baseline (assumption)** | EC7-EC13 assumem `mockTenant` default = `{status_pagamento: 'authorized', plano: 'individual', trial_ate: null}` — gate passa silenciosamente sem assert explícito |
| INTENTIONAL comments | EC10 (webhook fallback intencional 2-tentativa), EP5 (sleep stub justificativa), ES7 (unknown fallback intencional), EC8 (5 paths apikey extraction documentados como compat Evolution v1.x/v2.x) |

## Helpers compartilhados

Padrão B1+B2+B3: helpers duplicados inline em cada arquivo (auto-contido, sem cross-file imports). Block size varia por arquivo:

| Arquivo | LoC helpers (estimado) | Helpers extras |
|---|---|---|
| `tests/api/evo-qr.test.mjs` | ~50 | `makeRequest` (GET com query) |
| `tests/api/evo-status.test.mjs` | ~60 | `makeRequest` + `mockEvoFetchInstances` |
| `tests/api/evo-pairing-code.test.mjs` | ~70 | `makeRequest` + `mockEvoConnectionState` + `mockEvoConnect` |
| `tests/api/evo-create-instance.test.mjs` | ~120 | `makeRequest` (POST) + `mockEvoFetchInstances` + `mockEvoCreate` + `mockWebhookSet` + `mockWebhookFind` + `mockSettingsSet` |

### Constantes (todos os arquivos)

```js
const VALID_TENANT_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_INSTANCE = 'inst_abc123';
const VALID_NUMBER = '5511999999999';
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const EVO_BASE = 'https://evo.test.local';
const N8N_WEBHOOK = 'https://n8n.test.local/webhook/abc';
```

### `mockEnv(overrides)` — base (todos os arquivos)

```js
function mockEnv(overrides = {}) {
  return {
    EVO_BASE_URL: EVO_BASE,
    EVO_GLOBAL_KEY: 'test-global-key',
    N8N_WEBHOOK_URL: N8N_WEBHOOK,
    N8N_WEBHOOK_SECRET: 'test-webhook-secret',
    SUPABASE_SERVICE_KEY: 'test-service-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    ...overrides,
  };
}
```

**Diferenciação crítica:** `EVO_BASE_URL` global vem de `env` (usado por `evo-create-instance`). `evo_base_url` per-tenant vem do Supabase mock (usado por `evo-pairing-code`/`evo-qr`/`evo-status`). Constante `EVO_BASE` no mock bate com ambos.

### `fetchMatcher(patterns)` — recorder em ordem (Object form, byte-identical com B3)

```js
function fetchMatcher(patterns) {
  const calls = [];
  const handler = async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    calls.push({ url, method, body: init.body, headers: init.headers });
    for (const [key, response] of Object.entries(patterns)) {
      const [matchMethod, matchUrl] = key.split(' ');
      if (matchMethod !== method) continue;
      if (url.includes(matchUrl)) {
        if (typeof response === 'function') return response(url, init);
        return response;
      }
    }
    throw new Error(`No mock for ${method} ${url}`);
  };
  handler.calls = calls;
  return handler;
}

function withMockFetch(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try { return fn(); } finally { globalThis.fetch = original; }
}
```

### `makeRequest(env, body, opts)` — varia por arquivo

Cada arquivo tem o seu — POST com `JSON.stringify(body)` pra create-instance, GET com query params pros 3 GETs.

### Helpers Evolution-específicos

```js
// Em evo-create-instance.test.mjs + evo-status.test.mjs (byte-identical):
function mockEvoFetchInstances(instances) {
  return new Response(JSON.stringify(instances), { status: 200 });
}

// Em evo-pairing-code.test.mjs:
function mockEvoConnectionState(state) {
  return new Response(JSON.stringify({ instance: { state } }), { status: 200 });
}

// Em evo-pairing-code.test.mjs + evo-qr.test.mjs:
function mockEvoConnect(payload) {
  return new Response(JSON.stringify(payload), { status: 200 });
}

// Em evo-create-instance.test.mjs:
function mockEvoCreate(opts) {
  // opts pode ter { hash: {apikey: 'X'} } | { hash: 'X' } | { instance: {apikey: 'X'} } | { apikey: 'X' } | { token: 'X' }
  return new Response(JSON.stringify(opts), { status: 200 });
}

function mockWebhookSet(status = 200) {
  return new Response('{"ok":true}', { status });
}

function mockWebhookFind(wh) {
  // wh pode ser objeto webhook correto ou incorreto (ex: {enabled: false})
  return new Response(JSON.stringify(wh), { status: 200 });
}

function mockSettingsSet(status = 200) {
  return new Response('{"ok":true}', { status });
}
```

### Sleep stub (somente em `evo-pairing-code.test.mjs` EP5)

```js
import { test, mock } from 'node:test';

// Em EP5, dentro do test:
const setTimeoutStub = mock.method(globalThis, 'setTimeout', (fn) => { fn(); return 0; });
try {
  // ... teste ...
} finally {
  setTimeoutStub.mock.restore();
}
```

Não asserta duração — só que `instance/logout` foi chamado **antes** de `instance/connect` (via `handler.calls` ordering).

## Cenários detalhados

### `evo-create-instance` — 13 cenários (EC1-EC13)

#### EC1 — Body inválido
- Setup: `mockEnv()` completo, body = `{}` (sem `instanceName`/`tenant_id`)
- Asserts: status=400, `body.error='instanceName e tenant_id sao obrigatorios'`
- calls.length = 0

#### EC2 — `instanceName` regex inválido
- Setup: body = `{instanceName: 'inst@bad', tenant_id: VALID_TENANT_UUID}` + variações (`'inst with space'`, string com 65 chars)
- Asserts: status=400, `body.error='instanceName invalido (apenas letras, numeros, hifen e underscore)'`
- calls.length = 0
- Sub-tests parameterized: 3 inputs inválidos

#### EC3 — Env vars ausentes
- Setup: `mockEnv({EVO_BASE_URL: undefined})` (ou `EVO_GLOBAL_KEY` undefined / `N8N_WEBHOOK_URL` undefined)
- Asserts: status=503, `body.error='Configuração interna ausente'`
- calls.length = 0

#### EC4 — Gate pgto: status `refused`/`pending`/`cancelled` bloqueia
- Setup: `mockEnv()` + Supabase mock retorna `[{status_pagamento: 'refused', plano: 'individual', trial_ate: null}]`
- Body: `{instanceName: VALID_INSTANCE, tenant_id: VALID_TENANT_UUID}`
- Asserts: status=403, `body.error` contém 'Pagamento nao confirmado', `body.code='payment_required'`, `body.status_pagamento='refused'`
- calls.length = 1 (só GET tenants gate)
- Sub-tests parameterized: 3 statuses (`refused`, `pending`, `cancelled`)

#### EC5 — Gate pgto: trial ativo passa
- Setup: Supabase gate retorna `[{status_pagamento: 'pending', plano: 'individual', trial_ate: <future_iso>}]`
- Mock Evo create + webhook + settings + PATCH (happy path)
- Asserts: status=200, `body.webhook_configured=true`
- calls.length = 7 (gate passa, fluxo completo)

#### EC6 — Gate pgto: free plan passa
- Setup: Supabase gate retorna `[{status_pagamento: 'pending', plano: 'free', trial_ate: null}]`
- Mock Evo flow happy path
- Asserts: status=200
- calls.length = 7

#### EC7 — Idempotência: instância já existe
- Setup: gate happy + `fetchInstances` retorna `[{hash: {apikey: 'EXISTING-KEY'}, instance: {instanceName: VALID_INSTANCE}}]`
- Mock webhook + settings + PATCH happy
- Asserts: status=200, `body.already_existed=true`, **POST `/instance/create` NÃO foi chamado** (ausente em handler.calls)
- calls.length = 6 (gate + fetchInstances + webhook SET + webhook FIND + settings + PATCH; NÃO inclui POST create)

#### EC8 — Apikey extraction: 5 paths parameterized
- Setup: gate happy + `fetchInstances` retorna `[]` + `mockEvoCreate(opts)` com cada path
- Sub-tests parameterized:
  - `{hash: {apikey: 'KEY-A'}}` → `apikey='KEY-A'`
  - `{hash: 'KEY-B'}` (string) → `apikey='KEY-B'`
  - `{instance: {apikey: 'KEY-C'}}` → `apikey='KEY-C'`
  - `{apikey: 'KEY-D'}` → `apikey='KEY-D'`
  - `{token: 'KEY-E'}` → `apikey='KEY-E'`
- Asserts (cada sub-test): status=200, body.apikey corresponde, PATCH Supabase chamado com `{evo_apikey: 'KEY-X'}`
- calls.length = 7 cada sub-test

#### EC9 — Webhook formato A (nested-short, instance-key) succeed na 1ª
- Setup: gate happy + fetchInstances=[] + create OK
- Mock webhook: SET formato A → 200; FIND → response com `enabled=true, base64=true, events=['MESSAGES_UPSERT']` (corretto)
- Asserts: status=200, `body.webhook_format='A:nested-short'`, `body.webhook_key_used='instance-key'`
- calls.length = 7 (gate + fetchInstances + create + SET A + FIND + settings + PATCH)
- **Asserto body do SET request:** request body tem shape `{webhook: {enabled:true, url:N8N_WEBHOOK, byEvents:false, base64:true, events:['MESSAGES_UPSERT'], headers:{'x-webhook-secret':'test-webhook-secret'}}}`

#### EC10 — Webhook formato A falha + formato B (flat-long) succeed
- Setup: gate happy + fetchInstances=[] + create OK
- Mock webhook: SET formato A → 500; SET formato B → 200; FIND após B → `{enabled:true, webhookBase64:true, events:['MESSAGES_UPSERT']}`
- Asserts: status=200, `body.webhook_format='B:flat-long'`, `body.webhook_key_used='instance-key'`
- calls.length = 8 (gate + fetchInstances + create + SET A 500 + SET B 200 + FIND + settings + PATCH)
- **INTENTIONAL comment:** "Comportamento de fallback intencional — Evolution v2.3.7 aceita formato A em algumas instâncias, formato B em outras"

#### EC11 — Webhook todos 6 attempts falham
- Setup: gate happy + fetchInstances=[] + create OK
- Mock webhook: TODOS 6 SETs (3 formatos × 2 keys) retornam 200 mas FIND retorna `{enabled: false}` (webhookIsCorrect fails)
- Asserts: status=502, `body.webhook_configured=false`, `body.error` contém 'webhook não configurou', `body.instanceName=VALID_INSTANCE`, `body.already_existed=false`
- calls.length = 17 (1 gate + 1 fetchInstances + 1 create + 12 webhook [6 SET + 6 FIND] + 1 settings + 1 PATCH)
- **Verifica:** PATCH Supabase ainda foi chamado (apikey salvo mesmo sem webhook funcionar)

#### EC12 — Side-effect ordering completo (happy path)
- Setup: idêntico EC9
- Asserts: status=200 + sequência cronológica verificada via `handler.calls[idx].url + handler.calls[idx].method`:
  1. `GET /rest/v1/tenants?id=eq...` (gate)
  2. `GET /instance/fetchInstances?instanceName=...` (idempotency)
  3. `POST /instance/create` (criar)
  4. `POST /webhook/set/{instance}` (configurar formato A)
  5. `GET /webhook/find/{instance}` (verificar)
  6. `POST /settings/set/{instance}` (settings flat)
  7. `PATCH /rest/v1/tenants?id=eq...` (salvar apikey + evo_instance)
- calls.length = 7

#### EC13 — Evo `/instance/create` network error
- Setup: gate happy + fetchInstances=[] + `fetch /instance/create` throws (mock função throws)
- Asserts: status=502, `body.error='Erro de conexao com a Evolution API. Tente novamente.'`
- calls.length = 3 (gate + fetchInstances + create [throws])

---

### `evo-pairing-code` — 6 cenários (EP1-EP6)

#### EP1 — Body inválido
- Sub-tests parameterized:
  - sem `instance` (query param)
  - sem `number`
  - `instance='inst@bad'` (regex inválido)
  - `number='123'` (length<10)
  - `number='1234567890123456'` (length>15)
- Asserts: status=400, `body.error` apropriado
- calls.length = 0

#### EP2 — Tenant não encontrado
- Setup: query string válida + Supabase retorna `[]`
- Asserts: status=404, `body.error='Instancia nao encontrada'`
- calls.length = 1 (Supabase)

#### EP3 — apikey ausente/`pending`
- Sub-tests:
  - Supabase retorna `[{evo_base_url: EVO_BASE, evo_apikey: null}]`
  - Supabase retorna `[{evo_base_url: EVO_BASE, evo_apikey: 'pending'}]`
- Asserts: status=425, `body.error='Instancia ainda nao configurada. Aguarde alguns segundos e tente novamente.'`
- calls.length = 1

#### EP4 — connectionState=open → 409
- Setup: tenant lookup OK + connectionState retorna `{instance: {state: 'open'}}`
- Asserts: status=409, `body.error` contém 'já está conectado'
- calls.length = 2 (Supabase + connectionState)

#### EP5 — connectionState=connecting → logout + connect
- Setup: tenant lookup OK + connectionState retorna `{instance: {state: 'connecting'}}` + connect retorna `{pairingCode: '12345678'}`
- **Sleep stub** ativo (`mock.method(globalThis, 'setTimeout', fn => { fn(); return 0; })`)
- Asserts: status=200, `body.pairingCode='1234-5678'` (formatado XXXX-XXXX)
- calls.length = 4 (Supabase + connectionState + DELETE logout + GET connect)
- **Ordem cronológica verificada:** logout precede connect via `handler.calls`
- **INTENTIONAL comment:** "Sleep 1500ms stubbed — não validamos duração, só ordem (logout antes de connect)"

#### EP6 — Happy path (connectionState=close)
- Setup: tenant lookup OK + connectionState retorna `{instance: {state: 'close'}}` + connect retorna `{pairingCode: '12345678'}`
- Sub-tests:
  - `pairingCode='12345678'` (length=8) → formatted='1234-5678'
  - `pairingCode='ABC123'` (length=6) → formatted='ABC123' (raw, sem hífen)
  - `pairingCode` ausente → status=404, `body.error='Codigo de pareamento nao disponivel...'`
- Asserts: status=200 (primeiros 2) ou 404 (terceiro), formato correto
- calls.length = 3 (Supabase + connectionState + connect)

---

### `evo-qr` — 5 cenários (EQ1-EQ5)

#### EQ1 — Body inválido
- Sub-tests:
  - sem `instance` (query param)
  - `instance='inst@bad'` (regex inválido)
- Asserts: status=400
- calls.length = 0

#### EQ2 — Tenant não encontrado
- Setup: query OK + Supabase retorna `[]`
- Asserts: status=404, `body.error='Instancia nao encontrada'`
- calls.length = 1

#### EQ3 — apikey ausente/`pending`
- Sub-tests: `evo_apikey=null`, `evo_apikey='pending'`
- Asserts: status=425
- calls.length = 1

#### EQ4 — Happy path 3 paths base64 parameterized
- Setup: tenant OK + connect retorna 1 dos 3 shapes
- Sub-tests:
  - `{base64: 'data:image/png;base64,AAAA'}` → `body.base64='data:image/png;base64,AAAA'`
  - `{qrcode: {base64: 'data:image/png;base64,BBBB'}}` → `body.base64='data:image/png;base64,BBBB'`
  - `{code: 'data:image/png;base64,CCCC'}` → `body.base64='data:image/png;base64,CCCC'`
- Asserts: status=200, body.base64 correto
- calls.length = 2 (Supabase + connect) cada sub-test

#### EQ5 — Evo connect retorna não-OK
- Setup: tenant OK + connect retorna 500
- Asserts: status=502, `body.error='Erro ao gerar QR code'`
- calls.length = 2

---

### `evo-status` — 7 cenários (ES1-ES7)

#### ES1 — Body inválido
- Sub-tests: sem `instance`, regex inválido
- Asserts: status=400
- calls.length = 0

#### ES2 — Tenant não encontrado
- Setup: Supabase retorna `[]`
- Asserts: status=404
- calls.length = 1

#### ES3 — apikey ausente/`pending`
- Sub-tests: null, 'pending'
- Asserts: status=425
- calls.length = 1

#### ES4 — State extraction schema A (`inst.instance.state`)
- Setup: tenant OK + fetchInstances retorna `[{instance: {instanceName: VALID_INSTANCE, state: 'open'}}]`
- Asserts: status=200, `body.state='open'`
- calls.length = 2

#### ES5 — State extraction schema B (`inst.state`)
- Setup: tenant OK + fetchInstances retorna `[{instanceName: VALID_INSTANCE, state: 'connecting'}]` (flat v2)
- Asserts: status=200, `body.state='connecting'`
- calls.length = 2

#### ES6 — State extraction schema C (`inst.connectionStatus`)
- Setup: tenant OK + fetchInstances retorna `[{name: VALID_INSTANCE, connectionStatus: 'close'}]` (alt v2)
- Asserts: status=200, `body.state='close'`
- calls.length = 2

#### ES7 — Instância não encontrada na response → unknown
- Setup: tenant OK + fetchInstances retorna `[{instanceName: 'OUTRA-INSTANCIA', state: 'open'}]` (não-bate)
- Asserts: status=200, `body.state='unknown'`
- calls.length = 2
- **INTENTIONAL comment:** "Fallback 'unknown' intencional — quando Evolution não lista a instância (recém-deletada / busca cache stale), interface mostra 'unknown' em vez de erro"

## Diretivas pro `superpowers:writing-plans`

Espelha o que funcionou em B3 (plano 1925 linhas com código completo, zero placeholder, plan implementado em ~3h elapsed):

1. **Helpers byte-identical entre arquivos onde se sobrepõem.** `mockEvoFetchInstances` aparece em EC + ES; `fetchMatcher`/`withMockFetch`/`mockEnv` aparecem em todos 4. Final reviewer holístico verifica via `md5` (igual B3 fez). Plan crava blocos byte-identical com comentário "DO NOT EDIT — duplicated byte-identical with X".

2. **Sem placeholder no plan.** Cada teste vem com setup completo (mock patterns + body) + asserts cravados (status code, body shape, calls.length, calls ordering) + expected output do `node --test` (ex: `# pass 31, # fail 0, # tests 47, ms ~80ms`).

3. **Patterns cravados por arquivo.** `fetchMatcher` patterns de cada teste em forma final com URL substrings + method exato.

4. **`calls.length` asserts em CADA cenário.** Plan tabula totals por cenário (acima já cravado: EC1=0, EC2=0, EC3=0, EC4=1, EC5=7, EC6=7, EC7=6, EC8=7, EC9=7, EC10=8, EC11=17, EC12=7, EC13=3; EP1=0, EP2=1, EP3=1, EP4=2, EP5=4, EP6=3; EQ1=0, EQ2=1, EQ3=1, EQ4=2, EQ5=2; ES1=0, ES2=1, ES3=1, ES4-7=2). Asserto via `assert.equal(handler.calls.length, N)`.

5. **`instanceName` regex assertions cravados.** EC2/EP1/EQ1/ES1: testar `'inst@bad'`, `'inst with space'`, `''`, string com 65 chars (>64 max).

6. **Number regex (EP1):** testar `'123'` (length<10), `'1234567890123456'` (length>15), e edge `'5511999999999'` (length=13, valid).

7. **INTENTIONAL comments inline pros 4 pontos identificados** (EC8 5 paths apikey extraction documentando compat Evolution v1.x/v2.x; EC10 webhook fallback intencional; EP5 sleep stub justificativa; ES7 unknown fallback intencional) — preserva decisão de design contra futuro refator que removeria.

8. **Subagent dispatch sequencial (mesmo branch).** Plan ordena tasks 1-4 (create-instance → pairing-code → qr → status — ordem decrescente de complexidade pra forçar disciplina cedo). Implementer fresh por task, two-stage review (spec compliance + code quality) por task, final reviewer holístico cross-file.

9. **Webhook body assertions cravados (EC9, EC10, EC11).** Plan tabula JSON exato esperado em cada SET request (formato A nested-short / formato B flat-long / formato C nested-long), incluindo `headers: {'x-webhook-secret': 'test-webhook-secret'}` quando `N8N_WEBHOOK_SECRET` set.

10. **Supabase URL assertions.** Cada cenário com Supabase call cravado deve verificar URL completa: `${SUPABASE_URL}/rest/v1/tenants?id=eq.${VALID_TENANT_UUID}&select=...` (gate) e `${SUPABASE_URL}/rest/v1/tenants?id=eq.${VALID_TENANT_UUID}` (PATCH final). Diferenciação `?evo_instance=eq...` (lookup pra 3 GETs) vs `?id=eq...` (gate/PATCH em create-instance).

## Risk gotchas (pra plan stage prestar atenção)

Erros prováveis no plan stage que B3 também sofreu (spec corrections caught durante exec):

| # | Gotcha | Onde aparece | Mitigação no plan |
|---|---|---|---|
| G1 | `evo-create-instance` faz **N tentativas de webhook** dependendo do path. Plan precisa contar fetch calls EXATO no segmento webhook em cada cenário (EC9 segmento webhook = 2 calls: 1 SET A + 1 FIND; EC10 segmento = 3 calls: SET A 500 + SET B 200 + FIND; EC11 segmento = 12 calls: 6 SET + 6 FIND porque ALL FIND check fail). | EC9, EC10, EC11 | Plan crava `calls.length` total por cenário com tabela embutida (acima) |
| G2 | `evo-create-instance` chama Supabase 2× (gate GET + final PATCH). Total calls em happy path = 2 Supabase + 1 fetchInstances + 1 create + N webhook + N settings + 1 PATCH. **PATCH ocorre mesmo em EC11** (webhook fail) porque code salva apikey antes do return 502. | EC9, EC11, EC12 | Plan tabula totals por cenário verifica PATCH em EC11 também |
| G3 | `evo-pairing-code` chama Evolution `connectionState` ANTES do `instance/connect`. Se connectionState falhar (catch), continua sem reset (não-fatal). | EP4, EP5, EP6 | Plan testa caminho "connectionState falha → continua mesmo assim" implícito em EP6 (mock connectionState OK retornando close) |
| G4 | `evo-status` faz `instances.find()` com 3 schemas. Code: `(i.instance?.instanceName \|\| i.instanceName \|\| i.name)`. Match em qualquer 1 dos 3. | ES4-ES7 | Plan testa shape `{instance: {instanceName, state}}`, `{instanceName, state}`, `{name, connectionStatus}` |
| G5 | `instanceName` validation regex é `/^[a-zA-Z0-9_-]{1,64}$/`. Testar strings com hífen/underscore explicitamente válidos (não confundir com URL-encoded). | EC2, EP1, EQ1, ES1 | Cravar test inputs no plan — `'inst_abc-123'` válido vs `'inst@bad'` inválido |
| G6 | Webhook config request body diferente em cada formato (A=`{webhook:{...short}}`, B=flat-long, C=`{webhook:{long-names}}`). Plan precisa cravar JSON exato esperado em cada um, incluindo `headers: {'x-webhook-secret':...}` condicional. | EC9, EC10 | Plan tabula 3 bodies completos |
| G7 | `evo-pairing-code` formata pairingCode como `XXXX-XXXX` se length=8, senão retorna raw. Testar ambos. | EP6 | Plan: 1 sub-test com code 8-char + 1 com 6-char (raw) |
| G8 | `evo-qr` extrai base64 com `evoData.base64 \|\| evoData.qrcode?.base64 \|\| evoData.code`. Sub-tests parameterized devem testar cada path **isolado** (não setar 2 paths juntos — primeiro path no OR ganha). | EQ4 | Cada sub-test setta APENAS 1 path no response mock |
| G9 | `evo-create-instance` gate pgto: cobre status `authorized`, `approved`, `paid`, `artist_slot` como ALLOWED. EC4 testa `refused`/`pending`/`cancelled` como BLOQUEADO. Plan cravar lista completa em comentário no test pra clarificar. | EC4, EC5, EC6 | Plan inclui INTENTIONAL comment listando ALLOWED + BLOQUEADO |
| G10 | `EVO_BASE_URL` global (env, usado por create-instance) vs `evo_base_url` per-tenant (Supabase, usado por 3 GETs). Constante `EVO_BASE` no mock bate com ambos pra simplicidade. | Todos | Plan documenta diferenciação inline |

## Cross-references

- **B1** (mergeado em #45): `docs/superpowers/specs/2026-05-07-auth-tests-helpers-design.md` + `docs/superpowers/plans/2026-05-07-auth-tests-helpers.md`
- **B2** (mergeado em #46): `docs/superpowers/specs/2026-05-07-auth-tests-b2-http-endpoints-design.md`
- **B3** (mergeado em #50): `docs/superpowers/specs/2026-05-07-billing-tests-b3-design.md` + `docs/superpowers/plans/2026-05-07-billing-tests-b3.md`
- **Auditoria F2.4.3:** `docs/auditoria/2026-05-07-auditoria-completa.md` linhas 1805 e 2154
- **Endpoints alvos:**
  - `functions/api/evo-create-instance.js` (303 LoC)
  - `functions/api/evo-pairing-code.js` (123 LoC)
  - `functions/api/evo-qr.js` (73 LoC)
  - `functions/api/evo-status.js` (81 LoC)
- **Endpoint adjacente fora de escopo:** `functions/api/send-whatsapp-link.js` (148 LoC) — gap residual de F2.4.1, atacar em sessão separada se necessário

## Estimativa final

| Stage | Tempo |
|---|---|
| Brainstorm (este) | 50 min ✅ |
| Spec (este doc) | 40 min ✅ |
| Plan (`writing-plans`) | 60-90 min |
| Execução (`subagent-driven-development`, 4 tasks) | 3-4 h |
| Smoke prod | 30 min |
| **Total restante** | **~4.5-6 h** |

Após merge: Sprint 2 fechado (F2.4.1 + F2.4.2 + F2.4.3 = 131 testes cobrindo auth + billing + Evolution).
