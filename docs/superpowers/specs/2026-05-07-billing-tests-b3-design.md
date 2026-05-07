---
name: Billing tests — B3 (HTTP endpoints + lib mp-sinal-handler)
description: Tests pros 3 endpoints do fluxo billing (mp-ipn, create-subscription, webhooks/mp-sinal) + lib core mp-sinal-handler — fecha F2.4.2 da auditoria
date: 2026-05-07
status: ready-to-plan
type: feature-tests
tags: [billing, mp, tests, sprint-2]
parent_finding: F2.4.2 (auditoria 2026-05-07)
related:
  - docs/superpowers/specs/2026-05-07-auth-tests-helpers-design.md (B1, mergeado em #45)
  - docs/superpowers/specs/2026-05-07-auth-tests-b2-http-endpoints-design.md (B2, mergeado em #46)
  - docs/auditoria/2026-05-07-auditoria-completa.md
---

# Billing tests — B3 — Design

## Contexto

Auditoria de 2026-05-07 (F2.4.2) flaggou **billing flow completamente sem teste** como crítico — 3 endpoints HTTP (`mp-ipn`, `create-subscription`, `webhooks/mp-sinal`) e a lib core `mp-sinal-handler.js` sem cobertura. Sprint 2 ataca o gap depois do par F2.4.1 (B1 + B2) mergeado.

**Decomposição:**
- ~~B1 (mergeado em #45)~~: unit tests `_auth-helpers.js` (25 testes)
- ~~B2 (mergeado em #46)~~: HTTP tests dos 4 endpoints auth do studio (34 testes)
- **B3 (este spec)**: tests do fluxo billing (3 endpoints HTTP + lib `mp-sinal-handler`)
- B4 (futuro): Evolution endpoints (F2.4.3)

B3 segue padrão estabelecido por B1+B2 (lib real + mock fetch + helpers inline + 1 arquivo por unidade).

## Framing — 2 famílias distintas

Igual B2, B3 cobre **2 famílias**:

| Família | Arquivo | Testes |
|---|---|---|
| **HTTP endpoints** (3) | `tests/api/mp-ipn.test.mjs` | 11 |
| | `tests/api/create-subscription.test.mjs` | 12 |
| | `tests/api/webhooks/mp-sinal.test.mjs` | 5 |
| **Lib core** (1) | `tests/_lib/mp-sinal-handler.test.mjs` | 13 |
| **Total** | | **41** |

Combinar HTTP + lib num único B3 (em vez de fazer B3a/B3b como B1/B2) é decisão consciente: lib é pequena (122 LoC), evita débito de "lib core não testada" pós-merge, fecha F2.4.2 inteiro num PR.

## Goal — 7 riscos cobertos

| # | Risco | Coberto por |
|---|---|---|
| 1 | HMAC bypass (`mp-ipn` + `mp-sinal`) — webhook MP forjado vira PATCH em tenant ou agendamento alheio | I3, M3 |
| 2 | `external_reference` forging (`mp-sinal-handler`) — atacante cria payment com `external_reference=sinal:UUID_alheio` e promove agendamento de outro tenant | L4 |
| 3 | Idempotência quebrada (`mp-sinal-handler`) — race entre 2 webhooks pro mesmo paymentId duplica side-effects | L7 (URL contém `&status=eq.tentative`) |
| 4 | Side-effect ordering (`mp-ipn` authorized) — Telegram dispara antes de PATCH tenant, alerta sai com estado stale | I7 (PATCH precede DELETE ML + POST ML + Telegram + log) |
| 5 | Subscription duplicada (`create-subscription`) — bypass do check 409 cria 2 cobranças MP | C8 |
| 6 | Trial path bloqueado quando feature flag `ENABLE_TRIAL_V2='false'` desabilitada | C4 |
| 7 | Status not-approved promove (`mp-sinal-handler`) — payment `pending`/`rejected` confirma agendamento | L5 |

## Decisões cravadas

| Decisão | Valor |
|---|---|
| Escopo | 3 endpoints HTTP + 1 lib (mp-sinal-handler) |
| Total de testes | 41 |
| Tempo estimado | brainstorm 50min + spec 30min + plan 60-90min + execução 3-4h + smoke 30min = **5.5-6.5h** |
| Mock strategy | Lib real + mock `globalThis.fetch` via `fetchMatcher` (padrão B2) |
| File layout | `tests/api/<endpoint>.test.mjs` + `tests/api/webhooks/mp-sinal.test.mjs` + `tests/_lib/mp-sinal-handler.test.mjs` |
| Helpers | Duplicados localmente em cada arquivo (auto-contido, padrão B1+B2). Webhooks têm helpers extras (`makeMpSignature`, `makeIpnRequest`/`makeSinalRequest`) |
| HMAC fail-open divergence | Testar comportamento atual de cada endpoint sem unificar — INTENTIONAL comments documentam (mp-ipn loga warning, mp-sinal não) |
| `create-subscription` depth | Padrão (4 fluxos felizes + erros principais, 12 testes) — pula assertions de payment_logs em fluxos felizes (já cobertos pelo auditor billing-flow) |
| Logging assertions | Skipar payment_logs PATCH em testes HTTP (ruído). Exceção: 1 teste em mp-ipn confirma `ipn_warning_no_secret` quando secret missing (validar fail-open log) |
| Side-effect ordering | Asserto **PRESENÇA sempre** + **ORDEM crítica** apenas em `mp-ipn` authorized (PATCH tenant DEVE preceder DELETE ML + POST ML + Telegram + log) |
| Pula CORS/405 | Sim (idênticos entre endpoints, regressão zero — decisão herdada do B2) |
| Skip OPTIONS | Sim (todos os 3 endpoints têm path 204 idêntico) |
| Plano nomes | C5: `'trial'` (path early return); C6: `'free'` (path legado); C3: `'unknown'` (qualquer fora de PLAN_IDS); C8/C10/C11/C12: `'individual'` (PAID_PLAN_IDS[0], preço R$ 197) |

## Helpers compartilhados

Padrão B2: helpers duplicados inline em cada arquivo (auto-contido, sem cross-file imports). Block size varia por arquivo:

| Arquivo | LoC helpers | Helpers extras |
|---|---|---|
| `tests/_lib/mp-sinal-handler.test.mjs` | ~40 | nenhum |
| `tests/api/create-subscription.test.mjs` | ~50 | `makeRequest` |
| `tests/api/webhooks/mp-sinal.test.mjs` | ~70 | `makeRequest` + `makeMpSignature` + `makeSinalRequest` |
| `tests/api/mp-ipn.test.mjs` | ~80 | `makeRequest` + `makeMpSignature` + `makeIpnRequest` |

### Constantes (todos os arquivos)

```js
const VALID_TENANT_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_AGENDAMENTO_UUID = '00000000-0000-0000-0000-000000000aaa';
const VALID_CONVERSA_UUID = '00000000-0000-0000-0000-000000000bbb';
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const MP_API = 'https://api.mercadopago.com';
const ML_BASE = 'https://connect.mailerlite.com/api';
```

### `mockEnv(overrides)` — base (todos os arquivos)

```js
function mockEnv(overrides = {}) {
  return {
    MP_ACCESS_TOKEN: 'TEST-mp-token',
    MP_WEBHOOK_SECRET: 'test-webhook-secret-min-32-chars',
    SUPABASE_SERVICE_KEY: 'test-service-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    SITE_URL: 'https://inkflowbrasil.com',
    MAILERLITE_API_KEY: 'test-ml-key',
    MAILERLITE_GROUP_ID: '184387920768009398',
    MAILERLITE_GROUP_TRIAL_ATIVO: 'group-trial-ativo',
    MAILERLITE_GROUP_TRIAL_EXPIROU: 'group-trial-expirou',
    MAILERLITE_GROUP_CLIENTES_ATIVOS: 'group-clientes-ativos',
    TELEGRAM_BOT_TOKEN: 'test-telegram-token',
    TELEGRAM_CHAT_ID: 'test-chat-id',
    ENABLE_TRIAL_V2: 'true',
    ...overrides,
  };
}
```

### `fetchMatcher(patterns)` — recorder de calls em ordem

```js
function fetchMatcher(patterns) {
  const calls = [];
  const handler = async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body || null;
    calls.push({ url: String(url), method, body, ts: Date.now() });
    for (const [pattern, fn] of Object.entries(patterns)) {
      if (String(url).includes(pattern)) return fn({ url, method, body, init });
    }
    throw new Error(`fetchMatcher: no pattern matched ${method} ${url}`);
  };
  handler.calls = calls;
  return handler;
}
```

**Convenção:** chaves de pattern devem ser substring **distinta o suficiente** pra não colidir. Match: primeira chave cuja substring aparece na URL ganna. Quando duas URLs no mesmo arquivo têm path comum mas métodos distintos (ex: GET vs PATCH em `/tenants?id=eq.`), o handler discrimina pelo `init.method`.

### `withMockFetch(handler, fn)` — override + restore

```js
async function withMockFetch(handler, fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await fn(handler); }
  finally { globalThis.fetch = orig; }
}
```

### `jsonResponse(body, status)` — Response stub

```js
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### `makeRequest(url, opts)` — Request básico (não-webhook)

```js
function makeRequest(url, opts = {}) {
  return new Request(url, {
    method: opts.method || 'POST',
    headers: opts.headers || { 'Content-Type': 'application/json' },
    body: opts.body !== undefined
      ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body))
      : undefined,
  });
}
```

### `makeMpSignature(secret, dataId, requestId, ts)` — gera X-Signature válido (só webhooks)

```js
async function makeMpSignature(secret, dataId, requestId, ts) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(manifest));
  const hex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return `ts=${ts},v1=${hex}`;
}
```

### `makeIpnRequest({ secret, dataId, requestId, type, body, sigOverride })` — só `mp-ipn.test.mjs`

```js
async function makeIpnRequest({
  secret = 'test-webhook-secret-min-32-chars',
  dataId = 'mp-data-id-123',
  requestId = 'req-id-456',
  ts = '1715000000',
  type = 'preapproval',
  body = {},
  sigOverride = null,
} = {}) {
  const url = `https://example.com/api/mp-ipn?type=${type}&data.id=${dataId}`;
  const sig = sigOverride !== null
    ? sigOverride
    : await makeMpSignature(secret, dataId, requestId, ts);
  const headers = {
    'Content-Type': 'application/json',
    'x-signature': sig,
    'x-request-id': requestId,
  };
  return makeRequest(url, { method: 'POST', headers, body });
}
```

### `makeSinalRequest({ secret, dataId, requestId, body, sigOverride })` — só `webhooks/mp-sinal.test.mjs`

Igual `makeIpnRequest` mas URL `https://example.com/api/webhooks/mp-sinal?data.id=<dataId>` (sem param `type`).

## Patterns por arquivo

### `tests/_lib/mp-sinal-handler.test.mjs`

```js
{
  '/v1/payments/': mpPaymentHandler,                        // GET payment do MP
  '/rest/v1/agendamentos': agendamentoHandler,              // PATCH promove
  '/rest/v1/conversas?tenant_id=': conversaPatchByTenantHandler, // PATCH conversa por tenant+telefone
  '/rest/v1/conversas?id=': conversaByIdHandler,            // GET + PATCH de markConversaFechada
}
```

**Discriminação `init.method` nos handlers:** `/rest/v1/conversas?id=` é chamada 2× (GET pelo lifecycle + PATCH pelo lifecycle), handler verifica método.

### `tests/api/mp-ipn.test.mjs`

```js
{
  '/preapproval/': mpPreapprovalGetHandler,         // GET preapproval (route preapproval)
  '/v1/payments/': mpPaymentGetHandler,             // GET payment (route payment)
  '/rest/v1/tenants?id=eq.': tenantHandler,         // GET snapshot ou PATCH (handler discrimina por método)
  '/rest/v1/payment_logs': paymentLogsHandler,      // POST log
  'connect.mailerlite.com': mlHandler,              // DELETE + POST (handler discrimina por método)
  'api.telegram.org': telegramHandler,              // POST sendMessage
}
```

### `tests/api/create-subscription.test.mjs`

```js
{
  '/preapproval': mpPreapprovalPostHandler,         // POST cria (note: SEM trailing /)
  '/rest/v1/tenants?id=eq.': tenantHandler,         // GET (checkExisting) ou PATCH (handler discrimina)
  '/rest/v1/payment_logs': paymentLogsHandler,      // POST log
  'connect.mailerlite.com': mlHandler,              // POST add (handler discrimina por método)
}
```

### `tests/api/webhooks/mp-sinal.test.mjs`

Igual lib + mp-ipn:

```js
{
  '/v1/payments/': mpPaymentGetHandler,
  '/rest/v1/agendamentos': agendamentoHandler,
  '/rest/v1/conversas?tenant_id=': conversaPatchByTenantHandler,
  '/rest/v1/conversas?id=': conversaByIdHandler,
}
```

## Tabela de testes — completa

### Arquivo 1 — `tests/_lib/mp-sinal-handler.test.mjs` (13 testes)

#### `processMpSinal(env, paymentId)` — 9 testes

| # | Cenário | Setup | Asserções principais |
|---|---|---|---|
| L1 | `MP_ACCESS_TOKEN` missing | `mockEnv({ MP_ACCESS_TOKEN: undefined })`, `paymentId='pay-1'` | `result === { ok:false, error:'mp-not-configured' }` + `handler.calls.length === 0` |
| L2 | `paymentId` null/undefined/`""` (parameterized 3) | `mockEnv()`, `paymentId` em [`null`, `undefined`, `''`] | `result === { ok:true, ignored:'no-payment-id' }` + `handler.calls.length === 0` |
| L3 | MP API retorna 404 (payment não existe) | `mockEnv()`, `paymentId='not-found'`. Mock MP: 404 | `result === { ok:true, ignored:'payment-fetch-failed' }` + `calls.length === 1` (só MP GET) |
| L4 | `external_reference` não é `sinal:UUID` (parameterized 3) | Mock MP retorna `{external_reference: <ref>, status:'approved'}` com ref em [`'tenant-abc'`, `null`, `'sinal:'`] | `result === { ok:true, ignored:'not-a-sinal', external_reference: <ref> }` + `calls.length === 1` |
| L5 | `payment.status !== 'approved'` (parameterized 2) | Mock MP retorna `{external_reference: 'sinal:<UUID>', status: <s>}` com status em [`'pending'`, `'rejected'`] | `result === { ok:true, ignored:'not-approved', status:<s>, agendamento_id:<UUID> }` + `calls.length === 1` |
| L6 | PATCH agendamento retorna 5xx | Mock agendamento PATCH: 500 | `result === { ok:true, ignored:'update-failed', agendamento_id:<UUID> }` + `calls.length === 2` |
| L7 | **IDEMPOTÊNCIA** — PATCH retorna `[]` (já confirmed, filtro `status=eq.tentative` não bate) | Mock agendamento PATCH: 200 com `[]` | `result === { ok:true, ignored:'already-processed', agendamento_id:<UUID> }` + `calls.length === 2` + URL do PATCH inclui `&status=eq.tentative` |
| L8 | **HAPPY PATH** — promove agendamento, atualiza conversa, fecha lifecycle | Mock MP `{external_reference:'sinal:<AG_UUID>', status:'approved'}`, agendamento PATCH retorna `[{id:<AG_UUID>, cliente_telefone:'5511999', tenant_id:<TENANT_UUID>}]`, conversa PATCH (tenant+phone) retorna `[{id:<CONV_UUID>}]`, lifecycle GET retorna `[{dados_coletados:{}, estado_agente:'aberto'}]`, lifecycle PATCH retorna `[{...}]` | `result === { ok:true, processed:true, agendamento_id:<AG_UUID>, status:'confirmed', payment_id:'pay-1' }` + `calls.length === 5` em ordem: (1) GET MP, (2) PATCH agendamento, (3) PATCH conversa por tenant+telefone, (4) GET conversa por id (lifecycle read), (5) PATCH conversa por id+estado_agente=neq.fechado (lifecycle write) |
| L9 | HAPPY PATH sem `cliente_telefone` | Igual L8 mas agendamento PATCH retorna `[{id:<AG_UUID>, cliente_telefone:null, tenant_id:<TENANT_UUID>}]` | `result.processed === true` + `calls.length === 2` (MP + agendamento PATCH apenas, conversa NÃO tocada) |

#### `isSinalCandidateEvent({type, topic})` — 4 testes

| # | Cenário | Inputs | Asserção |
|---|---|---|---|
| L10 | type case-insensitive (parameterized 3) | `{type:'payment'}`, `{type:'PAYMENT'}`, `{type:'Payment'}` | `=== true` |
| L11 | type contains 'payment' (parameterized 2) | `{type:'subscription_payment'}`, `{type:'payment.created'}` | `=== true` |
| L12 | topic fallback (parameterized 1) | `{topic:'payment', type:undefined}` | `=== true` |
| L13 | falsy/non-payment (parameterized 4) | `{type:'preapproval'}`, `{type:null, topic:null}`, `{}`, `{type:'', topic:''}` | `=== false` |

### Arquivo 2 — `tests/api/mp-ipn.test.mjs` (11 testes)

| # | Cenário | Setup | Asserções principais |
|---|---|---|---|
| I1 | `MP_WEBHOOK_SECRET` missing → fail-open + warning log | `mockEnv({ MP_WEBHOOK_SECRET: undefined })`, body type=preapproval, mocks completos | Resp 200 + 1 POST em `/rest/v1/payment_logs` com body parseado contém `event_type:'ipn_warning_no_secret'` |
| I2 | secret presente + sig válida (HMAC ok) | Padrão `makeIpnRequest()` | Resp 200, processamento normal (não 401) |
| I3 | secret presente + sig inválida | `makeIpnRequest({ sigOverride: 'ts=123,v1=00deadbeef' })` | Resp 401 com body `{error:'Assinatura invalida'}` + 1 POST em `/rest/v1/payment_logs` `event_type:'ipn_hmac_rejected'` |
| I4 | type/id ausente — `received:true` no-op | URL sem `data.id` E body sem `data.id` | Resp 200 `{received:true}` + ZERO chamadas downstream (Supabase/MP/ML/Telegram) |
| I5 | type=`payment` → delega `processMpSinal` | URL `?type=payment&data.id=pay-X`, mock MP /v1/payments/pay-X retorna external_reference não-sinal | Resp 200 com `dispatched:'sinal'` + chamada GET em `/v1/payments/pay-X` (lib é REAL, não mockada) |
| I6 | type=preapproval status=`authorized` — **HAPPY PATH** (parameterized 2 sub-cases por plano) | (a) snapshot `{plano:'individual', nome_estudio:'X', email:'a@b'}`. (b) snapshot `{plano:null, nome_estudio:null, email:null}`. Em ambos: mock MP /preapproval/X retorna `{external_reference:<TENANT_UUID>, status:'authorized', payer_email:'p@b'}` | (a) PATCH tenant body inclui `{ativo:true, status_pagamento:'authorized', mp_subscription_id:..., preco_mensal:197, trial_ate:null}` + 6 calls. (b) PATCH tenant body inclui apenas `{ativo:true, status_pagamento:'authorized', mp_subscription_id:...}` SEM preco_mensal/trial_ate + 6 calls (ML/Telegram disparam usando email do payer_email). Telegram body inclui `nome_estudio` |
| I7 | **ORDERING crítica em authorized** | Setup do I6 sub-case (a) | `idx(GET tenants snapshot) < idx(PATCH tenants) < idx(DELETE ML group/<TRIAL_EXPIROU>) < idx(POST ML subscribers) < idx(POST telegram sendMessage) < idx(POST payment_logs)` |
| I8 | type=preapproval status `cancelled`/`paused`/`pending` (parameterized 3) | Mock MP retorna status correspondente | PATCH tenant body inclui `{ativo:false, status_pagamento:<STATUS_MAP[s]>}`, **ZERO** chamadas em `connect.mailerlite.com` E `api.telegram.org` |
| I9 | type=`invoice` (não-payment, não-preapproval) | URL `?type=invoice&data.id=X` | Resp 200 `{received:true, skipped:'invoice'}` + zero downstream |
| I10 | env vars críticas missing (parameterized 2: `MP_ACCESS_TOKEN`, `SUPABASE_SERVICE_KEY`) | `mockEnv({ <var>: undefined })`, body type=preapproval | Resp 503 `{error:'Env vars não configuradas'}` |
| I11 | MP API GET preapproval retorna 404/500 | Mock MP /preapproval/X: 500 | Resp 500 `{error:'Falha ao buscar assinatura MP'}` + 1 POST em `/rest/v1/payment_logs` `event_type:'ipn_error'` |

### Arquivo 3 — `tests/api/webhooks/mp-sinal.test.mjs` (5 testes)

| # | Cenário | Setup | Asserções principais |
|---|---|---|---|
| M1 | `MP_WEBHOOK_SECRET` missing → fail-open + delega (**INTENTIONAL: divergente de mp-ipn, NÃO loga**) | `mockEnv({ MP_WEBHOOK_SECRET: undefined })`, body válido, mock MP retorna ignored | Resp 200 com payload do `processMpSinal` + ZERO chamadas em `/rest/v1/payment_logs` |
| M2 | secret presente + sig válida → delega `processMpSinal` | `makeSinalRequest()` | Resp 200, 1 GET em `/v1/payments/<id>` |
| M3 | sig inválida ou malformada (parameterized 4: sig wrong, `v1=` ausente, `ts=` ausente, headers `x-signature`+`x-request-id` missing) | `makeSinalRequest({ sigOverride: ... })` ou request sem headers | Resp 401 `{error:'invalid-signature'}` + ZERO chamadas downstream (sem log, sem MP fetch) |
| M4 | paymentId via `query.data.id` / `body.data.id` / `body.id` (parameterized 3 paths) | URL com/sem param + body com/sem `data.id` | Em todos os 3, `processMpSinal` é chamado com paymentId correto + 1 GET em `/v1/payments/<paymentId>` |
| M5 | `processMpSinal` retorna `ignored` (ex: `not-a-sinal`) | Mock MP retorna external_reference inválido | Resp 200 com payload `{ok:true, ignored:'not-a-sinal', ...}` (endpoint passa o ignored adiante como JSON normal) |

### Arquivo 4 — `tests/api/create-subscription.test.mjs` (12 testes)

| # | Cenário | Setup | Asserções principais |
|---|---|---|---|
| C1 | JSON body inválido | `body: '{invalid'` (string) | Resp 400 `{error:'JSON inválido'}` |
| C2 | `tenant_id` ou `plano` missing (parameterized 2) | (a) `{plano:'individual'}`. (b) `{tenant_id:<UUID>}` | Resp 400 `{error:'tenant_id e plano são obrigatórios'}` |
| C3 | plano inválido | `{tenant_id:<UUID>, plano:'unknown'}`, email válido | Resp 400 `{error:'Plano inválido: unknown'}` |
| C4 | trial bloqueado por flag | `mockEnv({ ENABLE_TRIAL_V2: 'false' })`, body `{tenant_id:<UUID>, plano:'trial'}` | Resp 503 `{error:'Trial temporariamente indisponível. Escolha um plano pago.'}` |
| C5 | trial **HAPPY PATH** | `mockEnv()` (default ENABLE_TRIAL_V2='true'), body `{tenant_id:<UUID>, plano:'trial', email:'a@b'}` | Resp 200 com `{trial:true, trial_ate:<ISO>}` + 1 PATCH em `/rest/v1/tenants?id=eq.<UUID>` body inclui `{plano:'trial', status_pagamento:'trial', ativo:true, trial_ate:<ISO>}` + 1 POST em `connect.mailerlite.com/api/subscribers` body inclui `groups:['group-trial-ativo']` + 1 POST em `/rest/v1/payment_logs` `event_type:'trial_started'`. ISO date asserted via `Date.parse(trial_ate) > Date.now() && Date.parse(trial_ate) < Date.now() + 8*24*60*60*1000` |
| C6 | free legado | body `{tenant_id:<UUID>, plano:'free'}` | Resp 200 `{trial:true}` + ZERO chamadas downstream (sem PATCH, sem ML, sem log) |
| C7 | email missing/inválido (parameterized 2: missing, sem `@`) | body `{tenant_id:<UUID>, plano:'individual', email:<v>}` com v em [`undefined`, `'no-at-sign'`] | Resp 400 `{error:'Email válido é obrigatório para processar o pagamento.'}` |
| C8 | existing subscription `authorized` → 409 | Mock GET tenants retorna `[{mp_subscription_id:'mp-existing', status_pagamento:'authorized'}]`, body `{tenant_id:<UUID>, plano:'individual', email:'a@b'}` | Resp 409 `{error:'Este estúdio já possui uma assinatura ativa.'}` + ZERO chamadas em `api.mercadopago.com` |
| C9 | `MP_ACCESS_TOKEN` missing | `mockEnv({ MP_ACCESS_TOKEN: undefined })`, body `{tenant_id:<UUID>, plano:'individual', email:'a@b'}` | Resp 503 `{error:'Gateway de pagamento não configurado.'}` |
| C10 | **card_token HAPPY PATH** | body `{tenant_id:<UUID>, plano:'individual', email:'a@b', card_token:'ct-1', payment_method_id:'visa', issuer_id:'25'}`, mock GET tenants vazio (sem existing), mock POST MP `/preapproval` retorna `{id:'mp-sub-1', status:'authorized'}` | Resp 200 `{subscription_id:'mp-sub-1', status:'authorized'}` + body do POST MP inclui `card_token_id:'ct-1', auto_recurring:{frequency:1, frequency_type:'months', transaction_amount:197, currency_id:'BRL', start_date:<ISO ~5min future>}, status:'authorized', back_url:'https://inkflowbrasil.com/onboarding', payer_email:'a@b', payment_method_id:'visa', issuer_id:'25', external_reference:<UUID>` + 1 POST ML subscribers + 1 PATCH tenants (com `mp_subscription_id`, `status_pagamento`) + 1 POST payment_logs `subscription_created`. ISO start_date asserted via regex + `Date.parse(start) > Date.now() + 4*60*1000` |
| C11 | card_token MP retorna erro | body `{tenant_id:<UUID>, plano:'individual', email:'a@b', card_token:'ct-bad'}`, mock POST MP retorna `{ message:'invalid_token', cause:[{description:'Token inválido'}] }` com status 400 | Resp 400 (passthrough mpRes.status) `{error:'Token inválido'}` + 1 POST payment_logs `subscription_error` |
| C12 | **redirect HAPPY PATH** (sem card_token) | body `{tenant_id:<UUID>, plano:'individual', email:'a@b'}` (sem card_token), mock POST MP retorna `{id:'mp-sub-2', init_point:'https://mp.com/checkout/X', status:'pending'}` | Resp 200 `{init_point:'https://mp.com/checkout/X', subscription_id:'mp-sub-2'}` + body do POST MP inclui `payer_email:'a@b', auto_recurring:{...}, back_url:'https://inkflowbrasil.com/onboarding', status:'pending'` SEM `card_token_id` + 1 POST ML + 1 PATCH tenants `status_pagamento:'pendente'` (HARDCODED, não passa data.status) + 1 POST payment_logs `subscription_redirect` |

## Risk Gotchas — verificadas contra código real

### G1 — Dynamic import de `conversas-lifecycle.js`

`mp-sinal-handler.js:91` faz `const { markConversaFechada } = await import('./conversas-lifecycle.js')`. Em test runner Node, esse import resolve do path REAL — `markConversaFechada` chama `globalThis.fetch` (que está mockado) **2 vezes**:
- GET `${SUPABASE_URL}/rest/v1/conversas?id=eq.<id>&select=dados_coletados,estado_agente`
- PATCH `${SUPABASE_URL}/rest/v1/conversas?id=eq.<id>&estado_agente=neq.fechado` (se não estava fechada)

Pattern matcher `'/rest/v1/conversas?id='` cobre as 2 chamadas. Handler discrimina por `init.method`. **L8 espera 5 calls totais** (não 4 como rascunhado inicialmente).

### G2 — `calculateTrialEnd` é puro

`trial-helpers.js:5` retorna ISO string +7 dias UTC (`end.setUTCDate(end.getUTCDate() + 7)`). Sem fetch. C5 NÃO precisa de pattern especial. Assertion deve usar regex ISO 8601 ou `Date.parse(value) > Date.now() && < Date.now() + 8*24*60*60*1000` — **não comparar valor literal**.

### G3 — `moveToMailerLiteGroup` faz DELETE + POST

`trial-helpers.js:14` faz **2 chamadas condicionais**:
- DELETE `${ML_BASE}/groups/${from}/subscribers/${email}` (somente se `from` truthy)
- POST `${ML_BASE}/subscribers/${email}` body `{groups:[to]}` (somente se `to` truthy)

mp-ipn:246 passa `{from: env.MAILERLITE_GROUP_TRIAL_EXPIROU || null, to: env.MAILERLITE_GROUP_CLIENTES_ATIVOS || env.MAILERLITE_GROUP_ID || '184387920768009398'}`. Default `mockEnv` tem ambos setados → **2 chamadas ML em I6 happy path**.

### G4 — `addToMailerLite` em create-subscription tem early-return silencioso

`create-subscription.js:31` faz `if (!ML_KEY || !ML_GROUP || !email) return;`. Se `mockEnv` apaga `MAILERLITE_API_KEY` ou `MAILERLITE_GROUP_ID`, ML POST nunca dispara. C5/C10/C12 que asseguram ML add precisam env COMPLETO. **Falsa positivo se overrides apagar accidental** — não passar override.

### G5 — `auto_recurring.start_date` muda a cada call

`create-subscription.js:226` e `:299` setam `start_date: new Date(Date.now() + 5 * 60 * 1000).toISOString()`. Test não pode comparar string literal. Asserção:

```js
assert.match(body.auto_recurring.start_date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
const ms = Date.parse(body.auto_recurring.start_date);
assert.ok(ms > Date.now() + 4 * 60 * 1000); // pelo menos 4min no futuro
assert.ok(ms < Date.now() + 6 * 60 * 1000); // no máximo 6min no futuro
```

### G6 — HMAC verification difere entre mp-ipn e mp-sinal

| Endpoint | Função | Retorno | Manifest dataId source |
|---|---|---|---|
| mp-ipn | `verifyMPSignature(request, env, rawBody)` | `boolean` (true/false) | **Apenas URL** (`url.searchParams.get('data.id') \|\| url.searchParams.get('id')`) — body ignorado no HMAC |
| mp-sinal | `verifyMpSig(request, env, paymentId)` | `{ ok:boolean, reason:string }` | **paymentId computado de URL OU body** (`dataId \|\| body?.data?.id \|\| body?.id`) — body PODE entrar no manifest |

Ambas usam mesmo formato de manifest (`id:<dataId>;request-id:<reqId>;ts:<ts>;`) e HMAC-SHA256.

**Implicação crítica pra M4 (paymentId via body):** sig precisa ser computada com o paymentId que o endpoint VAI USAR (que é o que vem de URL ou body, dependendo do path). Helper `makeSinalRequest` deve aceitar `paymentId` e usar esse mesmo valor pra:
- Computar `makeMpSignature(secret, paymentId, requestId, ts)` (manifest)
- Decidir onde colocar (URL `?data.id=X`, body `{data:{id:X}}`, ou body `{id:X}`)

Helpers `makeIpnRequest`/`makeSinalRequest` montam request com:
- URL com query string `?data.id=<paymentId>` (default; mp-ipn também aceita `?id=<paymentId>`)
- Header `x-signature: ts=<ts>,v1=<hex_HMAC>`
- Header `x-request-id: <requestId>`
- Body: padrão `{}` (mp-ipn ignora body no HMAC; mp-sinal só usa body se paymentId vier dele)

**M3 (sig inválida)** pode usar paymentId qualquer; M4 (paths parameterized) precisa cravar paymentId consistente entre sig + posição.

### G7 — STATUS_MAP no mp-ipn aceita unknown status

`mp-ipn.js:216` define `STATUS_MAP = { authorized: 'authorized', paused: 'paused', cancelled: 'cancelled', pending: 'pendente' }` e cai em `STATUS_MAP[mpStatus] || mpStatus` — status novo (ex: `'rejected'`) passa raw. I8 parameterized cobre os 3 status mapeados; teste extra de "unknown status raw" não está no escopo (marginal).

### G8 — `PLANO_PRECO_BRL` vs `PLANOS` — chaves cravadas

`plans.js` define apenas planos pagos em `PAID_PLAN_IDS = ['individual', 'estudio', 'premium']`. `PLANOS` e `PLANO_PRECO_BRL` SÃO `Object.fromEntries` desses 3 + atributos diferentes:

```js
PLANOS = {
  individual: { nome: 'InkFlow Individual', valor: 197.00 },
  estudio: { nome: 'InkFlow Estúdio', valor: 497.00 },
  premium: { nome: 'InkFlow Estúdio VIP', valor: 997.00 },
};

PLANO_PRECO_BRL = { individual: 197, estudio: 497, premium: 997 };
```

`'trial'` está em `PLANS` mas NÃO em `PLANOS`. `'free'` não está em nenhum (legado). Tests usam:
- C5: `plano:'trial'` (path early return antes de validação `PLANOS[plano]`)
- C6: `plano:'free'` (path early return)
- C3: `plano:'unknown'` (qualquer string fora de PLAN_IDS)
- C8/C10/C11/C12: `plano:'individual'` (R$ 197 via PAID_PLAN_IDS[0])
- I6 sub-case (a): snapshot `{plano:'individual'}` → patchBody.preco_mensal=197

### G9 — `external_reference` regex em mp-sinal-handler

`mp-sinal-handler.js:43` usa `/^sinal:([a-f0-9-]+)$/i` — apenas hex/dash, case-insensitive. UUIDs reais batem. **Mas:** strings tipo `sinal:abc-def` (não-UUID) **passam** o regex e viram `agendamento_id='abc-def'`. PATCH no Postgres com UUID inválido retorna erro ou `[]` (UUID invalid syntax). **L4 não cobre esse edge** (vira ignored:'update-failed' ou 'already-processed' dependendo) — INTENTIONAL: regex não-strict é decisão histórica documentada como anti-goal.

### G10 — Trial path retorna ANTES da validação de email

`create-subscription.js:168-183` — trial path retorna `{trial:true, trial_ate}` ANTES da validação `if (!email...)`. Implicação:
- C5 (trial happy) PODE testar com ou sem email; teste passa email pra cobrir branch ML add
- C7 (email missing) DEVE usar plano pago (`'individual'`), não trial — senão path early-return mascara o teste

### G11 — `fetchMatcher` throw é diferente de MP error

Se pattern match falhar, helper lança `Error('fetchMatcher: no pattern matched ...')`. Endpoint envolve em try/catch e retorna 500. **Test pode passar com 500 acreditando estar testando "MP error"**, mas na verdade o pattern faltou. **Mitigação:** após cada teste, assertar `handler.calls.length === <expected>` E que cada call seja exatamente o esperado.

## Critérios de sucesso (Definition of Done)

1. **41 testes pass** distribuídos em 4 arquivos: 13 lib + 11 mp-ipn + 5 mp-sinal + 12 create-subscription
2. **Suite total ≥ 491 pass / 0 fail** (450 atuais + 41 novos)
3. **CI verde:** GitGuardian Security ✅ + node --test ✅ no PR
4. **Lib `mp-sinal-handler.js`** comprovadamente correta — todos os 8 casos `ignored` + happy path + idempotência + branch sem cliente_telefone cobertos
5. **HMAC fail-open divergence** documentada com INTENTIONAL comments inline em mp-sinal e mp-ipn (testes asserting comportamento atual de cada um sem unificar)
6. **Side-effect ordering em mp-ipn authorized** assertado (PATCH precede DELETE ML, POST ML, Telegram, log) via `calls[].url`/`calls[].method` index lookup
7. **Helpers self-contained** em cada arquivo (sem cross-file imports além de `node:test`/`node:assert`/path do endpoint testado)
8. **Smoke prod opcional após merge:** 1 POST forjado em `/api/mp-ipn` (sem x-signature válida) → resp 401 esperado, confirmando que B3 não introduziu regressão no endpoint live

## Anti-goals (não escopo deste B3)

- Tools `gerar-link-sinal.js` (chamada por LLM, B4 ou separado)
- Refator de unificação fail-open HMAC entre mp-ipn e mp-sinal (vira backlog `/backlog-add` se Leandro quiser pós-merge)
- Tests de `payment_logs` shape em fluxos felizes (já cobertos pelo auditor billing-flow — só log de erro/warning verificado em I1, I3, I11, C5, C10, C11, C12)
- Performance/load testing (fora F2.4.2)
- Rate limiting de webhook (separado, infra)
- `external_reference` malformado tipo `sinal:not-uuid-string` — passa regex mas falha no PATCH; comportamento documentado em G9 mas NÃO testado (edge marginal)
- `existing subscription com status='pendente'` passar pra MP normalmente (intencional no código, não testado — adicionar em P3 se aparecer bug)
- Cobertura de `addSubscriberToMailerLite` em mp-ipn (dead code — função definida mas não chamada no `onRequest`; remover em backlog separado)
- Test de "trial path com email missing" (intencional — trial não exige email; G10)
- Cobertura de status MP não-mapeados (ex: `'rejected'` passando raw — G7; cobertura adicional marginal)

## Estimativas

| Métrica | Valor |
|---|---|
| Arquivos novos | 4 (3 em `tests/api/` + 1 em `tests/_lib/`) |
| Arquivos modificados | 0 |
| LoC estimado | ~1100 (240 helpers + 780 testes + 80 boilerplate) |
| Tempo brainstorm + spec | ~50min (concluído) |
| Tempo plan | ~60-90min |
| Tempo execução (subagent-driven) | ~3-4h (4 tasks paralelas, 1 file por task) |
| Tempo smoke + merge | ~30min |
| **Total sessão** | **~5.5-6.5h** |

## Próxima fase — writing-plans

Após spec aprovado e committed → invocar `superpowers:writing-plans` com este spec como input. Plan deve gerar:

### Estrutura do plan

- 4 tasks paralelas (1 por arquivo de teste)
- Cada task self-contained: imports + helpers block (copiado byte-identical do spec) + N testes (código completo, sem placeholder)
- Helpers BLOCK byte-identical entre tasks 2-4 (`mockEnv`, `jsonResponse`, `fetchMatcher`, `withMockFetch`, `makeRequest`). Tasks 3+4 (webhooks) acrescentam `makeMpSignature` + `makeIpnRequest`/`makeSinalRequest` byte-identical entre si.
- Two-stage review per task: (1) spec compliance reviewer (asserta cada teste do spec está implementado, asserts exatamente conforme tabela); (2) code quality reviewer (DRY, naming, helper block byte-identity)
- Final reviewer holístico cross-file: verifica helpers byte-identical, padding em ISO date assertions, PATTERN matcher chaves não-colidem

### Diretivas obrigatórias pro plan

1. **Helpers byte-identical** — replicar B2 lesson: subagent reviewer cross-file confere. Plan deve listar o bloco de helpers EXATO (copy-paste-style) que cada task usa.
2. **Sem placeholder** — código completo de todos os 41 testes no plan, prontos pra implementador colar.
3. **Patterns cravados por arquivo** — cada task tem o objeto `patterns` listado explicitamente no plan (não "implementador decide").
4. **ISO date assertions** — fórmula explícita pro plan (regex + `Date.parse` ranges) onde aplicável (C5 trial_ate, C10/C12 start_date).
5. **`fetchMatcher` calls.length asserts** — toda task deve fechar cada teste com `assert.equal(handler.calls.length, <N>)` pra evitar G11 (pattern faltando mascarado como MP error).
6. **INTENTIONAL comments inline** — onde decisão divergente preservada (M1 fail-open sem log, L8 5 calls com markConversaFechada, G9 regex não-strict).

### Fora do plan (decidir no momento)

- Branch / PR title
- Estratégia de smoke prod (opcional pós-merge)
- Criação de `/backlog-add` pra anti-goals (decisão pós-merge)

## Cross-references

- Spec B1: `docs/superpowers/specs/2026-05-07-auth-tests-helpers-design.md` (lib helpers, 25 testes, mergeado em #45)
- Spec B2: `docs/superpowers/specs/2026-05-07-auth-tests-b2-http-endpoints-design.md` (HTTP endpoints auth, 34 testes, mergeado em #46)
- Auditoria F2.4.2: `docs/auditoria/2026-05-07-auditoria-completa.md`
- Endpoints alvo:
  - `functions/api/mp-ipn.js` (283 LoC)
  - `functions/api/create-subscription.js` (354 LoC)
  - `functions/api/webhooks/mp-sinal.js` (51 LoC)
- Lib alvo: `functions/_lib/mp-sinal-handler.js` (122 LoC)
- Libs auxiliares (read-only durante implementação):
  - `functions/_lib/conversas-lifecycle.js` (90 LoC) — chamado por mp-sinal-handler via dynamic import
  - `functions/_lib/trial-helpers.js` (44 LoC) — `calculateTrialEnd` + `moveToMailerLiteGroup`
  - `functions/_lib/plans.js` (79 LoC) — `PLANS`, `PLANOS`, `PLANO_PRECO_BRL`, helpers
  - `functions/_lib/telegram.js` — `sendTelegramAlert`
