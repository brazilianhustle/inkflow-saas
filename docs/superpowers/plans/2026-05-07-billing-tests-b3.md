# Billing Tests B3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar 41 testes cobrindo o fluxo billing do InkFlow — 3 endpoints HTTP (`mp-ipn`, `create-subscription`, `webhooks/mp-sinal`) + lib core `mp-sinal-handler`. Fecha F2.4.2 da auditoria 2026-05-07.

**Architecture:** Lib real (sem mock) + override de `globalThis.fetch` via helper `withMockFetch`. Cada teste invoca o endpoint/lib via dynamic import e asserta resposta + lista de chamadas downstream. Padrão herdado de B1 (#45) e B2 (#46), com extensões pra HMAC webhook (`makeMpSignature`/`makeIpnRequest`/`makeSinalRequest`) e discriminação por método HTTP no `fetchMatcher` (necessário pra mp-ipn que faz GET-then-PATCH em `/rest/v1/tenants?id=eq.<uuid>` e mp-sinal-handler que faz GET-then-PATCH em `/rest/v1/conversas?id=eq.<uuid>`).

**Tech Stack:** `node:test` + `node:assert/strict`, ESM (`.mjs`), Web Crypto API (`crypto.subtle.sign` HMAC-SHA256), Fetch API (Request/Response/Headers nativos do Node 20+).

---

## Spec Reference

Spec: `docs/superpowers/specs/2026-05-07-billing-tests-b3-design.md` (518 linhas, commit `db2d04c` na branch `feat/billing-tests-b3`).

Specs irmãos (já mergeados):
- B1 (#45): `docs/superpowers/specs/2026-05-07-auth-tests-helpers-design.md` — 25 unit tests de `_auth-helpers.js`
- B2 (#46): `docs/superpowers/specs/2026-05-07-auth-tests-b2-http-endpoints-design.md` — 34 HTTP tests de 4 endpoints auth

---

## File Structure

**4 arquivos novos. 0 arquivos modificados.**

| Arquivo | Tests | Helpers (LoC aprox) | Helpers extras |
|---|---|---|---|
| `tests/_lib/mp-sinal-handler.test.mjs` | 13 (L1-L13) | ~40 | nenhum (chama lib direto) |
| `tests/api/create-subscription.test.mjs` | 12 (C1-C12) | ~50 | `makeRequest` |
| `tests/api/webhooks/mp-sinal.test.mjs` | 5 (M1-M5) | ~70 | `makeRequest` + `makeMpSignature` + `makeSinalRequest` |
| `tests/api/mp-ipn.test.mjs` | 11 (I1-I11) | ~80 | `makeRequest` + `makeMpSignature` + `makeIpnRequest` |
| **Total** | **41** | | |

**Padrão B1+B2 herdado:** 1 arquivo de teste por unidade, helpers duplicados inline (auto-contido, sem cross-file imports). Constantes (`VALID_TENANT_UUID`, `SUPABASE_URL`, etc) e helpers base (`mockEnv`, `jsonResponse`, `withMockFetch`, `fetchMatcher`) **byte-identical** entre os 4 arquivos. Webhook helpers (`makeMpSignature` + um de `makeIpnRequest`/`makeSinalRequest`) **byte-identical** entre tasks 2 e 3.

**Divergência consciente vs B1+B2:**
- `withMockFetch` em B3 é **wrapper-style** (`async (handler, fn) => { try { return await fn() } finally { restore } }`) ao invés de B1+B2 retornarem função restorer pra try/finally manual. Cleaner pros tests com side-effect ordering.
- `fetchMatcher` em B3 é **objeto** (`{ pattern: handlerFn }`) com handlerFn recebendo `{url, method, body, init}` pra discriminação por método. B1+B2 usavam tuplas-array sem discriminação por método (não precisavam — auth endpoints fazem 1 call por path).

---

## Task Order

Tasks 1-4 são **independentes** e podem rodar em paralelo via subagent-driven-development. Cada task = 1 arquivo + 1 commit.

Recomendação de ordem se rodar sequencial: **Task 1 (lib) → Task 3 (mp-sinal alias mais simples) → Task 2 (mp-ipn HMAC complexo) → Task 4 (create-subscription mais testes)**. Mas paralelo é preferido.

---

## Task 1: tests/_lib/mp-sinal-handler.test.mjs

**Files:**
- Create: `tests/_lib/mp-sinal-handler.test.mjs`

**Tests:** 13 (L1-L13). 9 cobrem `processMpSinal`, 4 cobrem `isSinalCandidateEvent`.

**Reference:** Lib alvo `functions/_lib/mp-sinal-handler.js` (122 LoC). Lib auxiliar dinamicamente importada em runtime: `functions/_lib/conversas-lifecycle.js` (90 LoC, `markConversaFechada` faz GET + PATCH).

### Step 1.1: Criar arquivo com header + helpers

- [ ] **Step 1.1.1: Criar `tests/_lib/mp-sinal-handler.test.mjs` com imports, constantes e helpers**

```js
// ── InkFlow — unit tests pra functions/_lib/mp-sinal-handler.js ─────────────
// Spec: docs/superpowers/specs/2026-05-07-billing-tests-b3-design.md
// Auditoria: F2.4.2 (billing flow sem teste)
//
// IMPORTANTE: tests cobrem código existente em prod desde 2026-05-04.
// Se um teste falhar, investigar se é bug na lib OU no teste — NUNCA
// ajustar teste pra mascarar bug.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Constantes ──────────────────────────────────────────────────────────
const VALID_TENANT_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_AGENDAMENTO_UUID = '00000000-0000-0000-0000-000000000aaa';
const VALID_CONVERSA_UUID = '00000000-0000-0000-0000-000000000bbb';
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const MP_API = 'https://api.mercadopago.com';

// ─── Helpers locais ──────────────────────────────────────────────────────
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

async function withMockFetch(handler, fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await fn(handler); }
  finally { globalThis.fetch = orig; }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

// ─── Tests ───────────────────────────────────────────────────────────────
// (preenchidos nos próximos steps)
```

- [ ] **Step 1.1.2: Verificar que arquivo compila e roda (zero testes ainda)**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/_lib/mp-sinal-handler.test.mjs`

Expected: `# tests 0` + `# pass 0` + `# fail 0`. Sem syntax errors.

### Step 1.2: Adicionar tests L1-L4 (input validation + ignored)

- [ ] **Step 1.2.1: Append tests L1, L2, L3, L4 ao arquivo**

```js
// L1 — MP_ACCESS_TOKEN missing → mp-not-configured
test('mp-sinal-handler — L1: MP_ACCESS_TOKEN missing → mp-not-configured', async () => {
  const env = mockEnv({ MP_ACCESS_TOKEN: undefined });
  const handler = fetchMatcher({});
  await withMockFetch(handler, async () => {
    const { processMpSinal } = await import('../../functions/_lib/mp-sinal-handler.js');
    const result = await processMpSinal(env, 'pay-1');
    assert.deepEqual(result, { ok: false, error: 'mp-not-configured' });
    assert.equal(handler.calls.length, 0);
  });
});

// L2 — paymentId null/undefined/'' → no-payment-id (parameterized 3)
for (const paymentId of [null, undefined, '']) {
  test(`mp-sinal-handler — L2: paymentId=${JSON.stringify(paymentId)} → no-payment-id`, async () => {
    const env = mockEnv();
    const handler = fetchMatcher({});
    await withMockFetch(handler, async () => {
      const { processMpSinal } = await import('../../functions/_lib/mp-sinal-handler.js');
      const result = await processMpSinal(env, paymentId);
      assert.deepEqual(result, { ok: true, ignored: 'no-payment-id' });
      assert.equal(handler.calls.length, 0);
    });
  });
}

// L3 — MP API 404 → payment-fetch-failed
test('mp-sinal-handler — L3: MP API 404 → payment-fetch-failed', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/v1/payments/': () => jsonResponse({ error: 'not_found' }, 404),
  });
  await withMockFetch(handler, async () => {
    const { processMpSinal } = await import('../../functions/_lib/mp-sinal-handler.js');
    const result = await processMpSinal(env, 'not-found');
    assert.deepEqual(result, { ok: true, ignored: 'payment-fetch-failed' });
    assert.equal(handler.calls.length, 1);
  });
});

// L4 — external_reference inválido → not-a-sinal (parameterized 3)
// Code: externalRef = payment.external_reference || ''. ref=null → externalRef=''.
for (const ref of ['tenant-abc', null, 'sinal:']) {
  test(`mp-sinal-handler — L4: external_reference=${JSON.stringify(ref)} → not-a-sinal`, async () => {
    const env = mockEnv();
    const handler = fetchMatcher({
      '/v1/payments/': () => jsonResponse({ external_reference: ref, status: 'approved' }),
    });
    await withMockFetch(handler, async () => {
      const { processMpSinal } = await import('../../functions/_lib/mp-sinal-handler.js');
      const result = await processMpSinal(env, 'pay-1');
      const expectedRef = ref || '';
      assert.deepEqual(result, { ok: true, ignored: 'not-a-sinal', external_reference: expectedRef });
      assert.equal(handler.calls.length, 1);
    });
  });
}
```

- [ ] **Step 1.2.2: Run tests, esperar pass**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/_lib/mp-sinal-handler.test.mjs`

Expected: `# tests 8` (L1 + L2×3 + L3 + L4×3) + `# pass 8` + `# fail 0`.

### Step 1.3: Adicionar tests L5-L9 (status + idempotência + happy path)

- [ ] **Step 1.3.1: Append tests L5, L6, L7, L8, L9 ao arquivo**

```js
// L5 — payment.status !== 'approved' → not-approved (parameterized 2)
for (const status of ['pending', 'rejected']) {
  test(`mp-sinal-handler — L5: status=${status} → not-approved`, async () => {
    const env = mockEnv();
    const handler = fetchMatcher({
      '/v1/payments/': () => jsonResponse({
        external_reference: `sinal:${VALID_AGENDAMENTO_UUID}`,
        status,
      }),
    });
    await withMockFetch(handler, async () => {
      const { processMpSinal } = await import('../../functions/_lib/mp-sinal-handler.js');
      const result = await processMpSinal(env, 'pay-1');
      assert.deepEqual(result, {
        ok: true,
        ignored: 'not-approved',
        status,
        agendamento_id: VALID_AGENDAMENTO_UUID,
      });
      assert.equal(handler.calls.length, 1);
    });
  });
}

// L6 — PATCH agendamento 5xx → update-failed
test('mp-sinal-handler — L6: PATCH agendamento 5xx → update-failed', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/v1/payments/': () => jsonResponse({
      external_reference: `sinal:${VALID_AGENDAMENTO_UUID}`,
      status: 'approved',
    }),
    '/rest/v1/agendamentos': () => jsonResponse({ error: 'internal' }, 500),
  });
  await withMockFetch(handler, async () => {
    const { processMpSinal } = await import('../../functions/_lib/mp-sinal-handler.js');
    const result = await processMpSinal(env, 'pay-1');
    assert.deepEqual(result, {
      ok: true,
      ignored: 'update-failed',
      agendamento_id: VALID_AGENDAMENTO_UUID,
    });
    assert.equal(handler.calls.length, 2);
  });
});

// L7 — IDEMPOTÊNCIA: PATCH retorna [] (filtro &status=eq.tentative não bate)
// INTENTIONAL: idempotência via Postgres filter no PATCH; segundo webhook pro mesmo
// paymentId atinge 0 rows e cai em already-processed. Asserto a presença do filtro.
test('mp-sinal-handler — L7: PATCH retorna [] → already-processed (idempotência)', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/v1/payments/': () => jsonResponse({
      external_reference: `sinal:${VALID_AGENDAMENTO_UUID}`,
      status: 'approved',
    }),
    '/rest/v1/agendamentos': () => jsonResponse([]),
  });
  await withMockFetch(handler, async () => {
    const { processMpSinal } = await import('../../functions/_lib/mp-sinal-handler.js');
    const result = await processMpSinal(env, 'pay-1');
    assert.deepEqual(result, {
      ok: true,
      ignored: 'already-processed',
      agendamento_id: VALID_AGENDAMENTO_UUID,
    });
    assert.equal(handler.calls.length, 2);
    // INTENTIONAL: filter '&status=eq.tentative' is what makes idempotência work
    assert.ok(
      handler.calls[1].url.includes('&status=eq.tentative'),
      'PATCH agendamento URL must contain &status=eq.tentative for idempotência'
    );
  });
});

// L8 — HAPPY PATH com cliente_telefone → 5 calls em ordem
// INTENTIONAL: 5 calls (não 3) porque markConversaFechada (lifecycle) faz GET + PATCH
// internamente. Padrão read-then-write valida estado_agente antes de fechar.
test('mp-sinal-handler — L8: HAPPY PATH com cliente_telefone → 5 calls em ordem', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/v1/payments/': () => jsonResponse({
      external_reference: `sinal:${VALID_AGENDAMENTO_UUID}`,
      status: 'approved',
    }),
    '/rest/v1/agendamentos': () => jsonResponse([{
      id: VALID_AGENDAMENTO_UUID,
      cliente_telefone: '5511999',
      tenant_id: VALID_TENANT_UUID,
    }]),
    '/rest/v1/conversas?tenant_id=': () => jsonResponse([{ id: VALID_CONVERSA_UUID }]),
    '/rest/v1/conversas?id=': ({ method }) => {
      // Discriminate: GET (lifecycle read) vs PATCH (lifecycle write)
      if (method === 'GET') {
        return jsonResponse([{ dados_coletados: {}, estado_agente: 'aberto' }]);
      }
      return jsonResponse([{ id: VALID_CONVERSA_UUID, estado_agente: 'fechado' }]);
    },
  });
  await withMockFetch(handler, async () => {
    const { processMpSinal } = await import('../../functions/_lib/mp-sinal-handler.js');
    const result = await processMpSinal(env, 'pay-1');
    assert.deepEqual(result, {
      ok: true,
      processed: true,
      agendamento_id: VALID_AGENDAMENTO_UUID,
      status: 'confirmed',
      payment_id: 'pay-1',
    });
    // Calls (em ordem): MP GET → PATCH agendamento → PATCH conversa(tenant+phone)
    //                   → GET conversa(id) → PATCH conversa(id, neq.fechado)
    assert.equal(handler.calls.length, 5);
    assert.ok(handler.calls[0].url.includes('/v1/payments/'), 'call 0: MP GET payment');
    assert.equal(handler.calls[0].method, 'GET');
    assert.ok(handler.calls[1].url.includes('/rest/v1/agendamentos'), 'call 1: PATCH agendamento');
    assert.equal(handler.calls[1].method, 'PATCH');
    assert.ok(handler.calls[2].url.includes('/rest/v1/conversas?tenant_id='), 'call 2: PATCH conversa by tenant+phone');
    assert.equal(handler.calls[2].method, 'PATCH');
    assert.ok(handler.calls[3].url.includes('/rest/v1/conversas?id='), 'call 3: GET conversa by id (lifecycle read)');
    assert.equal(handler.calls[3].method, 'GET');
    assert.ok(handler.calls[4].url.includes('/rest/v1/conversas?id='), 'call 4: PATCH conversa (lifecycle write)');
    assert.equal(handler.calls[4].method, 'PATCH');
    assert.ok(handler.calls[4].url.includes('&estado_agente=neq.fechado'),
      'PATCH lifecycle URL must contain &estado_agente=neq.fechado filter');
  });
});

// L9 — HAPPY PATH sem cliente_telefone → 2 calls (conversa NÃO tocada)
test('mp-sinal-handler — L9: HAPPY PATH sem cliente_telefone → 2 calls', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/v1/payments/': () => jsonResponse({
      external_reference: `sinal:${VALID_AGENDAMENTO_UUID}`,
      status: 'approved',
    }),
    '/rest/v1/agendamentos': () => jsonResponse([{
      id: VALID_AGENDAMENTO_UUID,
      cliente_telefone: null,
      tenant_id: VALID_TENANT_UUID,
    }]),
  });
  await withMockFetch(handler, async () => {
    const { processMpSinal } = await import('../../functions/_lib/mp-sinal-handler.js');
    const result = await processMpSinal(env, 'pay-1');
    assert.equal(result.processed, true);
    assert.equal(result.agendamento_id, VALID_AGENDAMENTO_UUID);
    assert.equal(handler.calls.length, 2);
  });
});
```

- [ ] **Step 1.3.2: Run tests, esperar pass**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/_lib/mp-sinal-handler.test.mjs`

Expected: `# tests 13` (8 anteriores + L5×2 + L6 + L7 + L8 + L9) + `# pass 13` + `# fail 0`.

### Step 1.4: Adicionar tests L10-L13 (isSinalCandidateEvent)

- [ ] **Step 1.4.1: Append tests L10, L11, L12, L13 ao arquivo**

```js
// L10 — isSinalCandidateEvent type case-insensitive (parameterized 3)
for (const input of [{ type: 'payment' }, { type: 'PAYMENT' }, { type: 'Payment' }]) {
  test(`mp-sinal-handler — L10: isSinalCandidateEvent(${JSON.stringify(input)}) → true`, async () => {
    const { isSinalCandidateEvent } = await import('../../functions/_lib/mp-sinal-handler.js');
    assert.equal(isSinalCandidateEvent(input), true);
  });
}

// L11 — isSinalCandidateEvent type contains 'payment' (parameterized 2)
for (const input of [{ type: 'subscription_payment' }, { type: 'payment.created' }]) {
  test(`mp-sinal-handler — L11: isSinalCandidateEvent(${JSON.stringify(input)}) → true (contains 'payment')`, async () => {
    const { isSinalCandidateEvent } = await import('../../functions/_lib/mp-sinal-handler.js');
    assert.equal(isSinalCandidateEvent(input), true);
  });
}

// L12 — isSinalCandidateEvent topic fallback
test('mp-sinal-handler — L12: isSinalCandidateEvent({topic:"payment", type:undefined}) → true', async () => {
  const { isSinalCandidateEvent } = await import('../../functions/_lib/mp-sinal-handler.js');
  assert.equal(isSinalCandidateEvent({ topic: 'payment', type: undefined }), true);
});

// L13 — isSinalCandidateEvent falsy/non-payment (parameterized 4)
for (const input of [
  { type: 'preapproval' },
  { type: null, topic: null },
  {},
  { type: '', topic: '' },
]) {
  test(`mp-sinal-handler — L13: isSinalCandidateEvent(${JSON.stringify(input)}) → false`, async () => {
    const { isSinalCandidateEvent } = await import('../../functions/_lib/mp-sinal-handler.js');
    assert.equal(isSinalCandidateEvent(input), false);
  });
}
```

- [ ] **Step 1.4.2: Run tests, esperar pass**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/_lib/mp-sinal-handler.test.mjs`

Expected: `# tests 23` (13 anteriores + L10×3 + L11×2 + L12 + L13×4) + `# pass 23` + `# fail 0`.

Wait — espec diz 13 testes pra Task 1, mas via parameterization rodam ~23 sub-tests. node:test count parameterized como tests separados. Conta total ≈ 23. Spec usa "13 testes" como "13 cenários L1-L13" (alguns parameterized) — conferir final.

### Step 1.5: Run completo + commit

- [ ] **Step 1.5.1: Run full file, confirmar pass**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/_lib/mp-sinal-handler.test.mjs`

Expected: ~23 tests pass, 0 fail. Tempo < 200ms.

- [ ] **Step 1.5.2: Run suite completa do projeto pra confirmar zero regressão**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/**/*.test.mjs 2>&1 | tail -20`

Expected: suite anterior 450 + ~23 novos. Total ~473 pass. Zero fail.

- [ ] **Step 1.5.3: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add tests/_lib/mp-sinal-handler.test.mjs
git commit -m "$(cat <<'EOF'
test(billing-tests-b3): Task 1 — 13 unit tests pra mp-sinal-handler.js

Cobertura: processMpSinal (9 cenários L1-L9, ~16 sub-tests parameterized)
+ isSinalCandidateEvent (4 cenários L10-L13, ~10 sub-tests).

Cobre:
- Input validation (token missing, paymentId null/undefined/'')
- MP API 404 → payment-fetch-failed
- external_reference inválido → not-a-sinal (parameterized 3)
- Status not approved → not-approved (parameterized 2)
- PATCH 5xx → update-failed
- Idempotência (PATCH retorna [] via filtro &status=eq.tentative) → already-processed
- Happy path com cliente_telefone (5 calls em ordem incluindo lifecycle GET+PATCH)
- Happy path sem cliente_telefone (2 calls, conversa não tocada)
- isSinalCandidateEvent case-insensitive + topic fallback + falsy

INTENTIONAL comments inline em L7 (idempotência via filter) e L8 (5 calls
porque markConversaFechada faz GET+PATCH lifecycle).

Spec: docs/superpowers/specs/2026-05-07-billing-tests-b3-design.md
Auditoria: F2.4.2 (parte lib core)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: tests/api/mp-ipn.test.mjs

**Files:**
- Create: `tests/api/mp-ipn.test.mjs`

**Tests:** 11 (I1-I11). Cobre HMAC validation, fail-open, dispatch pra processMpSinal, fluxo preapproval com side-effects ordering.

**Reference:** Endpoint alvo `functions/api/mp-ipn.js` (283 LoC). Helpers HMAC: `verifyMPSignature` (manifest URL-only). Dependências: `processMpSinal` (real, mockada via fetch), `moveToMailerLiteGroup`, `sendTelegramAlert`, `PLANO_PRECO_BRL`.

### Step 2.1: Criar arquivo com header + helpers + HMAC helpers

- [ ] **Step 2.1.1: Criar `tests/api/mp-ipn.test.mjs` com imports, constantes, helpers base + helpers HMAC**

```js
// ── InkFlow — HTTP tests pra functions/api/mp-ipn.js ───────────────────────
// Spec: docs/superpowers/specs/2026-05-07-billing-tests-b3-design.md
// Auditoria: F2.4.2 (billing flow sem teste)
//
// IMPORTANTE: tests cobrem código existente em prod desde 2026-04 (Sprint 1).
// Se um teste falhar, investigar se é bug no endpoint OU no teste — NUNCA
// ajustar teste pra mascarar bug.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Constantes ──────────────────────────────────────────────────────────
const VALID_TENANT_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_AGENDAMENTO_UUID = '00000000-0000-0000-0000-000000000aaa';
const VALID_CONVERSA_UUID = '00000000-0000-0000-0000-000000000bbb';
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const MP_API = 'https://api.mercadopago.com';

// ─── Helpers locais (byte-identical com Task 1, 3, 4) ───────────────────
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

async function withMockFetch(handler, fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await fn(handler); }
  finally { globalThis.fetch = orig; }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

function makeRequest(url, opts = {}) {
  return new Request(url, {
    method: opts.method || 'POST',
    headers: opts.headers || { 'Content-Type': 'application/json' },
    body: opts.body !== undefined
      ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body))
      : undefined,
  });
}

// ─── HMAC helpers (byte-identical com Task 3) ───────────────────────────
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

// IPN-specific: URL = ?type=<type>&data.id=<dataId>. Manifest assina dataId (URL-only).
async function makeIpnRequest({
  secret = 'test-webhook-secret-min-32-chars',
  dataId = 'mp-data-id-123',
  requestId = 'req-id-456',
  ts = '1715000000',
  type = 'preapproval',
  body = {},
  sigOverride = null,
} = {}) {
  const url = `https://example.com/api/mp-ipn?type=${type}&data.id=${encodeURIComponent(dataId)}`;
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

// ─── Tests ───────────────────────────────────────────────────────────────
// (preenchidos nos próximos steps)
```

- [ ] **Step 2.1.2: Verificar arquivo compila + zero testes**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/api/mp-ipn.test.mjs`

Expected: `# tests 0` + `# pass 0` + `# fail 0`. Sem syntax errors.

### Step 2.2: Adicionar tests I1-I4 (HMAC paths + no-op)

- [ ] **Step 2.2.1: Append tests I1, I2, I3, I4 ao arquivo**

```js
// I1 — MP_WEBHOOK_SECRET missing → fail-open + warning log
// INTENTIONAL: mp-ipn LOGA warning quando secret missing (diverge de mp-sinal que NÃO loga)
test('mp-ipn — I1: MP_WEBHOOK_SECRET missing → fail-open + ipn_warning_no_secret log', async () => {
  const env = mockEnv({ MP_WEBHOOK_SECRET: undefined });
  const handler = fetchMatcher({
    '/preapproval/': () => jsonResponse({
      external_reference: VALID_TENANT_UUID,
      status: 'paused',
      payer_email: 'p@b',
    }),
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') return jsonResponse([{ plano: 'individual', nome_estudio: 'X', email: 'a@b' }]);
      return jsonResponse({}, 200); // PATCH return=minimal
    },
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    // Sig irrelevant when secret missing — endpoint pula HMAC check
    const req = await makeIpnRequest({ type: 'preapproval' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    // Procura log com event_type='ipn_warning_no_secret'
    const warningLog = handler.calls.find(c =>
      c.url.includes('/rest/v1/payment_logs')
      && JSON.parse(c.body).event_type === 'ipn_warning_no_secret'
    );
    assert.ok(warningLog, 'ipn_warning_no_secret log must be present when secret missing');
  });
});

// I2 — secret presente + sig válida → 200 (HMAC ok, normal processing)
test('mp-ipn — I2: HMAC valid → 200 (no rejection)', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/preapproval/': () => jsonResponse({
      external_reference: VALID_TENANT_UUID,
      status: 'paused',  // status=paused evita ML+Telegram (simplifica mock)
      payer_email: 'p@b',
    }),
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') return jsonResponse([{ plano: 'individual', nome_estudio: 'X', email: 'a@b' }]);
      return jsonResponse({}, 200);
    },
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    const req = await makeIpnRequest();
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
  });
});

// I3 — secret presente + sig inválida → 401 + ipn_hmac_rejected log
test('mp-ipn — I3: HMAC invalid → 401 + ipn_hmac_rejected log', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    const req = await makeIpnRequest({ sigOverride: 'ts=123,v1=00deadbeef' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Assinatura invalida');
    // Asserta exactly 1 call: payment_logs com event_type ipn_hmac_rejected
    assert.equal(handler.calls.length, 1);
    assert.ok(handler.calls[0].url.includes('/rest/v1/payment_logs'));
    const logBody = JSON.parse(handler.calls[0].body);
    assert.equal(logBody.event_type, 'ipn_hmac_rejected');
  });
});

// I4 — type/id ausente → received:true no-op (zero downstream)
// Setup: dataId='' faz searchParams.get retornar '' (falsy) → id=undefined → received:true
// Sig é válida pra dataId='' (manifest 'id:;request-id:...;ts:...;') — HMAC passa
test('mp-ipn — I4: type/id ausente → received:true (zero downstream calls)', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({});
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    const req = await makeIpnRequest({ dataId: '' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { received: true });
    // Zero calls: HMAC passou (sig assinada com dataId=''), endpoint retornou cedo
    assert.equal(handler.calls.length, 0);
  });
});
```

- [ ] **Step 2.2.2: Run tests, esperar pass**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/api/mp-ipn.test.mjs`

Expected: `# tests 4` + `# pass 4` + `# fail 0`.

### Step 2.3: Adicionar tests I5-I8 (dispatch + preapproval ordering)

- [ ] **Step 2.3.1: Append tests I5, I6, I7, I8 ao arquivo**

```js
// I5 — type=payment delega pra processMpSinal (lib é REAL, não mockada)
test('mp-ipn — I5: type=payment → delega processMpSinal', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    // processMpSinal busca payment no MP /v1/payments/<id>
    '/v1/payments/': () => jsonResponse({
      external_reference: 'tenant-abc',  // não-sinal → ignored:'not-a-sinal'
      status: 'approved',
    }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    const req = await makeIpnRequest({ type: 'payment' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.received, true);
    assert.equal(body.dispatched, 'sinal');
    assert.equal(handler.calls.length, 1);
    assert.ok(handler.calls[0].url.includes('/v1/payments/'));
  });
});

// I6 sub-case (a) — preapproval authorized HAPPY PATH com tenant snapshot completo
test('mp-ipn — I6a: preapproval authorized + snapshot completo → PATCH preço grandfathered + 6 calls', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/preapproval/': () => jsonResponse({
      external_reference: VALID_TENANT_UUID,
      status: 'authorized',
      payer_email: 'p@b',
    }),
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') {
        return jsonResponse([{ plano: 'individual', nome_estudio: 'X', email: 'a@b' }]);
      }
      return jsonResponse({}, 200); // PATCH return=minimal
    },
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
    'connect.mailerlite.com': ({ method }) => {
      // DELETE from grupo trial_expirou OU POST subscribers (handler discrimina por method)
      if (method === 'DELETE') return jsonResponse({}, 200);
      return jsonResponse({ id: 'ml-sub-1' }, 200);
    },
    'api.telegram.org': () => jsonResponse({ ok: true }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    const req = await makeIpnRequest({ type: 'preapproval' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    // 6 calls: GET tenants snapshot + PATCH tenants + DELETE ML group + POST ML subscribers
    //          + POST telegram + POST payment_logs
    assert.equal(handler.calls.length, 6);
    // PATCH body inclui ativo:true, status_pagamento:'authorized', preço grandfathered
    const patchCall = handler.calls.find(c =>
      c.method === 'PATCH' && c.url.includes('/rest/v1/tenants?id=eq.'));
    assert.ok(patchCall, 'PATCH tenant must be present');
    const patchBody = JSON.parse(patchCall.body);
    assert.equal(patchBody.ativo, true);
    assert.equal(patchBody.status_pagamento, 'authorized');
    assert.equal(patchBody.mp_subscription_id, 'mp-data-id-123');
    assert.equal(patchBody.preco_mensal, 197);  // PLANO_PRECO_BRL.individual
    assert.equal(patchBody.trial_ate, null);
    // Telegram body inclui nome_estudio
    const telegramCall = handler.calls.find(c => c.url.includes('api.telegram.org'));
    const telegramBody = JSON.parse(telegramCall.body);
    assert.ok(telegramBody.text.includes('X'), 'Telegram body must include nome_estudio');
  });
});

// I6 sub-case (b) — preapproval authorized com snapshot vazio (tenants returna [])
// Snapshot vazio → tenantSnapshot={} → patchBody SEM preco_mensal/trial_ate.
// Email cai em fallback pra sub.payer_email → ML+Telegram disparam usando 'p@b'.
test('mp-ipn — I6b: preapproval authorized + snapshot vazio → PATCH sem preço, email payer_email', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/preapproval/': () => jsonResponse({
      external_reference: VALID_TENANT_UUID,
      status: 'authorized',
      payer_email: 'p@b',
    }),
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') return jsonResponse([]);  // empty snapshot
      return jsonResponse({}, 200);
    },
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
    'connect.mailerlite.com': ({ method }) => {
      if (method === 'DELETE') return jsonResponse({}, 200);
      return jsonResponse({ id: 'ml-sub-1' }, 200);
    },
    'api.telegram.org': () => jsonResponse({ ok: true }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    const req = await makeIpnRequest({ type: 'preapproval' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    assert.equal(handler.calls.length, 6);
    // PATCH body NÃO inclui preco_mensal/trial_ate (snapshot vazio)
    const patchCall = handler.calls.find(c =>
      c.method === 'PATCH' && c.url.includes('/rest/v1/tenants?id=eq.'));
    const patchBody = JSON.parse(patchCall.body);
    assert.equal(patchBody.ativo, true);
    assert.equal(patchBody.status_pagamento, 'authorized');
    assert.equal(patchBody.mp_subscription_id, 'mp-data-id-123');
    assert.ok(!('preco_mensal' in patchBody), 'preco_mensal must NOT be in patchBody when snapshot empty');
    assert.ok(!('trial_ate' in patchBody), 'trial_ate must NOT be in patchBody when snapshot empty');
    // ML POST body usa email do payer_email (snapshot.email undefined)
    const mlPostCall = handler.calls.find(c =>
      c.method === 'POST' && c.url.includes('connect.mailerlite.com'));
    assert.ok(mlPostCall.url.includes('p%40b'), 'ML POST URL must include encoded payer_email');
  });
});

// I7 — ORDERING crítica em authorized: GET → PATCH → DELETE ML → POST ML → Telegram → log
test('mp-ipn — I7: side-effects ordering em authorized (GET<PATCH<DELETE_ML<POST_ML<Telegram<log)', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/preapproval/': () => jsonResponse({
      external_reference: VALID_TENANT_UUID,
      status: 'authorized',
      payer_email: 'p@b',
    }),
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') return jsonResponse([{ plano: 'individual', nome_estudio: 'X', email: 'a@b' }]);
      return jsonResponse({}, 200);
    },
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
    'connect.mailerlite.com': ({ method }) => {
      if (method === 'DELETE') return jsonResponse({}, 200);
      return jsonResponse({ id: 'ml-sub-1' }, 200);
    },
    'api.telegram.org': () => jsonResponse({ ok: true }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    const req = await makeIpnRequest({ type: 'preapproval' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const idx = (pred) => handler.calls.findIndex(pred);
    const iGet = idx(c => c.method === 'GET' && c.url.includes('/rest/v1/tenants?id=eq.'));
    const iPatch = idx(c => c.method === 'PATCH' && c.url.includes('/rest/v1/tenants?id=eq.'));
    const iDelML = idx(c => c.method === 'DELETE' && c.url.includes('connect.mailerlite.com'));
    const iPostML = idx(c => c.method === 'POST' && c.url.includes('connect.mailerlite.com'));
    const iTelegram = idx(c => c.url.includes('api.telegram.org'));
    const iLog = idx(c => c.url.includes('/rest/v1/payment_logs'));
    assert.ok(iGet >= 0, 'GET tenants snapshot must exist');
    assert.ok(iPatch >= 0, 'PATCH tenants must exist');
    assert.ok(iDelML >= 0, 'DELETE ML must exist');
    assert.ok(iPostML >= 0, 'POST ML must exist');
    assert.ok(iTelegram >= 0, 'Telegram must exist');
    assert.ok(iLog >= 0, 'payment_logs must exist');
    assert.ok(iGet < iPatch, 'GET snapshot must precede PATCH tenants');
    assert.ok(iPatch < iDelML, 'PATCH tenants must precede DELETE ML');
    assert.ok(iDelML < iPostML, 'DELETE ML must precede POST ML');
    assert.ok(iPostML < iTelegram, 'POST ML must precede Telegram');
    assert.ok(iTelegram < iLog, 'Telegram must precede payment_logs');
  });
});

// I8 — preapproval status cancelled/paused/pending (parameterized 3) — sem ML/Telegram
const STATUS_MAP_EXPECTED = { cancelled: 'cancelled', paused: 'paused', pending: 'pendente' };
for (const status of ['cancelled', 'paused', 'pending']) {
  test(`mp-ipn — I8: status=${status} → ativo:false, status_pagamento:${STATUS_MAP_EXPECTED[status]}, no ML/Telegram`, async () => {
    const env = mockEnv();
    const handler = fetchMatcher({
      '/preapproval/': () => jsonResponse({
        external_reference: VALID_TENANT_UUID,
        status,
        payer_email: 'p@b',
      }),
      '/rest/v1/tenants?id=eq.': ({ method }) => {
        if (method === 'GET') return jsonResponse([{ plano: 'individual', nome_estudio: 'X', email: 'a@b' }]);
        return jsonResponse({}, 200);
      },
      '/rest/v1/payment_logs': () => jsonResponse({}, 201),
    });
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/mp-ipn.js');
      const req = await makeIpnRequest({ type: 'preapproval' });
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 200);
      const patchCall = handler.calls.find(c =>
        c.method === 'PATCH' && c.url.includes('/rest/v1/tenants?id=eq.'));
      const patchBody = JSON.parse(patchCall.body);
      assert.equal(patchBody.ativo, false);
      assert.equal(patchBody.status_pagamento, STATUS_MAP_EXPECTED[status]);
      // Zero ML/Telegram calls (não-authorized → if (ativo) block skipped)
      assert.equal(handler.calls.filter(c => c.url.includes('connect.mailerlite.com')).length, 0);
      assert.equal(handler.calls.filter(c => c.url.includes('api.telegram.org')).length, 0);
    });
  });
}
```

- [ ] **Step 2.3.2: Run tests, esperar pass**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/api/mp-ipn.test.mjs`

Expected: `# tests 10` (4 anteriores + I5 + I6a + I6b + I7 + I8×3) + `# pass 10` + `# fail 0`.

### Step 2.4: Adicionar tests I9-I11 (skip + env errors + MP error)

- [ ] **Step 2.4.1: Append tests I9, I10, I11 ao arquivo**

```js
// I9 — type=invoice (não-payment, não-preapproval) → received:true skipped:'invoice'
test('mp-ipn — I9: type=invoice → received:true skipped:invoice (zero downstream)', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({});
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    const req = await makeIpnRequest({ type: 'invoice' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { received: true, skipped: 'invoice' });
    assert.equal(handler.calls.length, 0);
  });
});

// I10 — env vars críticas missing (parameterized 2: MP_ACCESS_TOKEN, SUPABASE_SERVICE_KEY)
for (const missingVar of ['MP_ACCESS_TOKEN', 'SUPABASE_SERVICE_KEY']) {
  test(`mp-ipn — I10: ${missingVar} missing → 503`, async () => {
    const env = mockEnv({ [missingVar]: undefined });
    const handler = fetchMatcher({});
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/mp-ipn.js');
      const req = await makeIpnRequest({ type: 'preapproval' });
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.error, 'Env vars não configuradas');
    });
  });
}

// I11 — MP API GET preapproval 500 → 500 + ipn_error log
test('mp-ipn — I11: MP API GET preapproval 500 → 500 + ipn_error log', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/preapproval/': () => jsonResponse({ message: 'mp internal' }, 500),
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/mp-ipn.js');
    const req = await makeIpnRequest({ type: 'preapproval' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, 'Falha ao buscar assinatura MP');
    const logCall = handler.calls.find(c => c.url.includes('/rest/v1/payment_logs'));
    assert.ok(logCall, 'payment_logs call must be present');
    const logBody = JSON.parse(logCall.body);
    assert.equal(logBody.event_type, 'ipn_error');
  });
});
```

- [ ] **Step 2.4.2: Run tests, esperar pass**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/api/mp-ipn.test.mjs`

Expected: `# tests 13` (10 anteriores + I9 + I10×2 + I11) + `# pass 13` + `# fail 0`.

### Step 2.5: Run completo + commit

- [ ] **Step 2.5.1: Run full file, confirmar pass**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/api/mp-ipn.test.mjs`

Expected: ~13 tests pass, 0 fail. Tempo < 200ms.

- [ ] **Step 2.5.2: Run suite completa**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/**/*.test.mjs 2>&1 | tail -10`

Expected: ~486 pass (450 + 23 task1 + 13 task2). Zero fail.

- [ ] **Step 2.5.3: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add tests/api/mp-ipn.test.mjs
git commit -m "$(cat <<'EOF'
test(billing-tests-b3): Task 2 — 11 HTTP tests pra mp-ipn.js

Cobre 11 cenários (I1-I11, ~13 sub-tests parameterized):
- HMAC fail-open com warning log (I1)
- HMAC valid passa (I2)
- HMAC invalid → 401 + ipn_hmac_rejected log (I3)
- type/id ausente → received:true zero downstream (I4)
- type=payment delega processMpSinal (I5)
- preapproval authorized HAPPY PATH com snapshot completo (I6a) e vazio (I6b)
- Side-effect ordering: GET<PATCH<DELETE_ML<POST_ML<Telegram<log (I7)
- preapproval cancelled/paused/pending (I8 parameterized 3, sem ML/Telegram)
- type=invoice → skipped (I9)
- MP_ACCESS_TOKEN ou SUPABASE_SERVICE_KEY missing → 503 (I10 parameterized 2)
- MP API 500 → 500 + ipn_error log (I11)

INTENTIONAL comments inline em I1 (mp-ipn loga warning, mp-sinal NÃO — divergência
preservada).

Spec: docs/superpowers/specs/2026-05-07-billing-tests-b3-design.md
Auditoria: F2.4.2 (parte mp-ipn endpoint)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: tests/api/webhooks/mp-sinal.test.mjs

**Files:**
- Create: `tests/api/webhooks/mp-sinal.test.mjs`

**Tests:** 5 (M1-M5). Cobre HMAC validation (divergente de mp-ipn — não loga em fail-open) + delegação pra processMpSinal + paths de paymentId via query/body.

**Reference:** Endpoint alvo `functions/api/webhooks/mp-sinal.js` (51 LoC). Helpers HMAC: `verifyMpSig` (manifest URL OR body — divergente de mp-ipn que é URL-only). Lib delegada `processMpSinal` (real, mockada via fetch).

### Step 3.1: Criar arquivo com header + helpers + HMAC helpers

- [ ] **Step 3.1.1: Criar `tests/api/webhooks/mp-sinal.test.mjs`**

```js
// ── InkFlow — HTTP tests pra functions/api/webhooks/mp-sinal.js ────────────
// Spec: docs/superpowers/specs/2026-05-07-billing-tests-b3-design.md
// Auditoria: F2.4.2 (billing flow sem teste)
//
// IMPORTANTE: tests cobrem código existente em prod desde 2026-05-04.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Constantes ──────────────────────────────────────────────────────────
const VALID_TENANT_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_AGENDAMENTO_UUID = '00000000-0000-0000-0000-000000000aaa';
const VALID_CONVERSA_UUID = '00000000-0000-0000-0000-000000000bbb';
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const MP_API = 'https://api.mercadopago.com';

// ─── Helpers locais (byte-identical com Tasks 1, 2, 4) ─────────────────
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

async function withMockFetch(handler, fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await fn(handler); }
  finally { globalThis.fetch = orig; }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

function makeRequest(url, opts = {}) {
  return new Request(url, {
    method: opts.method || 'POST',
    headers: opts.headers || { 'Content-Type': 'application/json' },
    body: opts.body !== undefined
      ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body))
      : undefined,
  });
}

// ─── HMAC helpers (byte-identical com Task 2) ───────────────────────────
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

// mp-sinal-specific: paymentId pode vir de URL query (?data.id=) OU body (body.data.id ou body.id)
// O sig é calculado com paymentId que o endpoint VAI USAR (URL > body.data.id > body.id).
async function makeSinalRequest({
  secret = 'test-webhook-secret-min-32-chars',
  paymentId = 'mp-data-id-123',
  requestId = 'req-id-456',
  ts = '1715000000',
  body = {},
  sigOverride = null,
  paymentIdLocation = 'url', // 'url' | 'body.data.id' | 'body.id'
  omitHeaders = false,
} = {}) {
  let url = `https://example.com/api/webhooks/mp-sinal`;
  let finalBody = { ...body };
  if (paymentIdLocation === 'url') {
    url += `?data.id=${encodeURIComponent(paymentId)}`;
  } else if (paymentIdLocation === 'body.data.id') {
    finalBody = { ...finalBody, data: { id: paymentId } };
  } else if (paymentIdLocation === 'body.id') {
    finalBody = { ...finalBody, id: paymentId };
  }
  const sig = sigOverride !== null
    ? sigOverride
    : await makeMpSignature(secret, paymentId, requestId, ts);
  const headers = omitHeaders
    ? { 'Content-Type': 'application/json' }
    : {
        'Content-Type': 'application/json',
        'x-signature': sig,
        'x-request-id': requestId,
      };
  return makeRequest(url, { method: 'POST', headers, body: finalBody });
}

// ─── Tests ───────────────────────────────────────────────────────────────
// (preenchidos nos próximos steps)
```

- [ ] **Step 3.1.2: Verificar arquivo compila + zero testes**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/api/webhooks/mp-sinal.test.mjs`

Expected: `# tests 0` + `# pass 0` + `# fail 0`. Sem syntax errors.

### Step 3.2: Adicionar tests M1-M5 (todos)

- [ ] **Step 3.2.1: Append tests M1, M2, M3, M4, M5 ao arquivo**

```js
// M1 — MP_WEBHOOK_SECRET missing → fail-open + delega (sem log)
// INTENTIONAL: mp-sinal NÃO loga warning em fail-open (diverge de mp-ipn que loga).
// Divergência preservada — refator de unificação fica como backlog separado.
test('mp-sinal — M1: MP_WEBHOOK_SECRET missing → fail-open + delega (sem log)', async () => {
  const env = mockEnv({ MP_WEBHOOK_SECRET: undefined });
  const handler = fetchMatcher({
    '/v1/payments/': () => jsonResponse({
      external_reference: 'tenant-xyz',
      status: 'approved',
    }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../../functions/api/webhooks/mp-sinal.js');
    const req = await makeSinalRequest();
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    // Body é o resultado de processMpSinal (ignored:'not-a-sinal' aqui)
    assert.equal(body.ok, true);
    assert.equal(body.ignored, 'not-a-sinal');
    // Zero calls em payment_logs (INTENTIONAL: mp-sinal não loga fail-open warning)
    assert.equal(handler.calls.filter(c => c.url.includes('/rest/v1/payment_logs')).length, 0);
  });
});

// M2 — secret presente + sig válida → delega processMpSinal
test('mp-sinal — M2: HMAC valid → delega processMpSinal', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/v1/payments/': () => jsonResponse({
      external_reference: 'tenant-xyz',
      status: 'approved',
    }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../../functions/api/webhooks/mp-sinal.js');
    const req = await makeSinalRequest();
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    assert.equal(handler.calls.length, 1);
    assert.ok(handler.calls[0].url.includes('/v1/payments/'));
  });
});

// M3 — sig inválida ou malformada (parameterized 4 cases)
const M3_CASES = [
  ['sig wrong', { sigOverride: 'ts=123,v1=00deadbeef' }],
  ['v1= ausente', { sigOverride: 'ts=123' }],
  ['ts= ausente', { sigOverride: 'v1=00deadbeef' }],
  ['headers ausentes', { omitHeaders: true }],
];
for (const [label, opts] of M3_CASES) {
  test(`mp-sinal — M3: ${label} → 401 invalid-signature (zero downstream)`, async () => {
    const env = mockEnv();
    const handler = fetchMatcher({});
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../../functions/api/webhooks/mp-sinal.js');
      const req = await makeSinalRequest(opts);
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.error, 'invalid-signature');
      // Zero downstream: sem MP fetch, sem payment_logs
      assert.equal(handler.calls.length, 0);
    });
  });
}

// M4 — paymentId via query.data.id / body.data.id / body.id (parameterized 3)
// Helper makeSinalRequest assina o paymentId que o endpoint VAI USAR (G6 critical).
const M4_LOCATIONS = ['url', 'body.data.id', 'body.id'];
for (const loc of M4_LOCATIONS) {
  test(`mp-sinal — M4: paymentId via ${loc} → processMpSinal called with correct id`, async () => {
    const env = mockEnv();
    const handler = fetchMatcher({
      '/v1/payments/': () => jsonResponse({
        external_reference: 'tenant-xyz',
        status: 'approved',
      }),
    });
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../../functions/api/webhooks/mp-sinal.js');
      const req = await makeSinalRequest({ paymentId: 'pay-from-' + loc, paymentIdLocation: loc });
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 200);
      assert.equal(handler.calls.length, 1);
      assert.ok(handler.calls[0].url.includes('/v1/payments/pay-from-' + loc.replace(/\./g, '%2E')) ||
                handler.calls[0].url.includes('/v1/payments/pay-from-' + loc),
        `MP fetch URL must include paymentId pay-from-${loc} (got ${handler.calls[0].url})`);
    });
  });
}

// M5 — processMpSinal retorna ignored (ex: not-a-sinal) → endpoint passa adiante
test('mp-sinal — M5: processMpSinal ignored → 200 com payload {ok:true, ignored:...}', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/v1/payments/': () => jsonResponse({
      external_reference: 'not-a-sinal-format',  // invalid → ignored:'not-a-sinal'
      status: 'approved',
    }),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../../functions/api/webhooks/mp-sinal.js');
    const req = await makeSinalRequest();
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.ignored, 'not-a-sinal');
    assert.equal(body.external_reference, 'not-a-sinal-format');
  });
});
```

- [ ] **Step 3.2.2: Run tests, esperar pass**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/api/webhooks/mp-sinal.test.mjs`

Expected: ~10 tests pass (M1 + M2 + M3×4 + M4×3 + M5), 0 fail.

**Possível falha em M4**: `encodeURIComponent` em `data.id` na URL transforma `.` em `%2E`? NÃO — `.` não é encoded por `encodeURIComponent`. Então URL fica `?data.id=pay-from-url`. Verifica se assert match aceita ambas formas; se falhar, ajustar o assert pra string match exato sem regex.

### Step 3.3: Run completo + commit

- [ ] **Step 3.3.1: Run full file, confirmar pass**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/api/webhooks/mp-sinal.test.mjs`

Expected: ~10 tests pass, 0 fail. Tempo < 200ms.

- [ ] **Step 3.3.2: Run suite completa**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/**/*.test.mjs 2>&1 | tail -10`

Expected: ~496 pass (450 + 23 task1 + 13 task2 + 10 task3). Zero fail.

- [ ] **Step 3.3.3: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add tests/api/webhooks/mp-sinal.test.mjs
git commit -m "$(cat <<'EOF'
test(billing-tests-b3): Task 3 — 5 HTTP tests pra webhooks/mp-sinal.js

Cobre 5 cenários (M1-M5, ~10 sub-tests parameterized):
- HMAC fail-open SEM log (M1, INTENTIONAL: divergente de mp-ipn que loga)
- HMAC valid → delega processMpSinal (M2)
- HMAC invalid (sig wrong, v1 ausente, ts ausente, headers ausentes) → 401 (M3 ×4)
- paymentId via URL/body.data.id/body.id (M4 ×3, todos delegam corretamente)
- processMpSinal ignored → endpoint passa payload adiante (M5)

INTENTIONAL comments inline em M1 (fail-open sem log preservado).

Spec: docs/superpowers/specs/2026-05-07-billing-tests-b3-design.md
Auditoria: F2.4.2 (parte webhooks/mp-sinal endpoint)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: tests/api/create-subscription.test.mjs

**Files:**
- Create: `tests/api/create-subscription.test.mjs`

**Tests:** 12 (C1-C12). Cobre 4 fluxos do endpoint (trial / free legado / card_token / redirect) + validação + 409 existing.

**Reference:** Endpoint alvo `functions/api/create-subscription.js` (354 LoC). Lib auxiliar `trial-helpers.js` (`calculateTrialEnd` puro), `plans.js` (`PLANOS`, `PAID_PLAN_IDS`).

### Step 4.1: Criar arquivo com header + helpers

- [ ] **Step 4.1.1: Criar `tests/api/create-subscription.test.mjs`**

```js
// ── InkFlow — HTTP tests pra functions/api/create-subscription.js ─────────
// Spec: docs/superpowers/specs/2026-05-07-billing-tests-b3-design.md
// Auditoria: F2.4.2 (billing flow sem teste)
//
// IMPORTANTE: tests cobrem código existente em prod desde 2026-04 (Sprint 1).

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Constantes ──────────────────────────────────────────────────────────
const VALID_TENANT_UUID = '00000000-0000-0000-0000-000000000001';
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const MP_API = 'https://api.mercadopago.com';

// ─── Helpers locais (byte-identical com Tasks 1, 2, 3) ──────────────────
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

async function withMockFetch(handler, fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await fn(handler); }
  finally { globalThis.fetch = orig; }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

function makeRequest(url, opts = {}) {
  return new Request(url, {
    method: opts.method || 'POST',
    headers: opts.headers || { 'Content-Type': 'application/json' },
    body: opts.body !== undefined
      ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body))
      : undefined,
  });
}

// Helper local pra montar Request de create-subscription com URL fixa
function makeCreateSubRequest(body) {
  return makeRequest('https://example.com/api/create-subscription', {
    method: 'POST',
    body,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────
// (preenchidos nos próximos steps)
```

- [ ] **Step 4.1.2: Verificar arquivo compila + zero testes**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/api/create-subscription.test.mjs`

Expected: `# tests 0` + `# pass 0` + `# fail 0`. Sem syntax errors.

### Step 4.2: Adicionar tests C1-C4 (input validation + trial flag)

- [ ] **Step 4.2.1: Append tests C1, C2, C3, C4 ao arquivo**

```js
// C1 — JSON body inválido → 400
test('create-subscription — C1: JSON body inválido → 400', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({});
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeRequest('https://example.com/api/create-subscription', {
      method: 'POST',
      body: '{invalid',  // string raw, não objeto
    });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'JSON inválido');
  });
});

// C2 — tenant_id ou plano missing (parameterized 2)
const C2_CASES = [
  ['tenant_id missing', { plano: 'individual' }],
  ['plano missing', { tenant_id: VALID_TENANT_UUID }],
];
for (const [label, body] of C2_CASES) {
  test(`create-subscription — C2: ${label} → 400`, async () => {
    const env = mockEnv();
    const handler = fetchMatcher({});
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/create-subscription.js');
      const req = makeCreateSubRequest(body);
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 400);
      const respBody = await res.json();
      assert.equal(respBody.error, 'tenant_id e plano são obrigatórios');
    });
  });
}

// C3 — plano inválido (fora de PLAN_IDS) → 400
test('create-subscription — C3: plano=unknown → 400', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({});
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeCreateSubRequest({ tenant_id: VALID_TENANT_UUID, plano: 'unknown', email: 'a@b.com' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Plano inválido: unknown');
  });
});

// C4 — trial bloqueado por feature flag ENABLE_TRIAL_V2='false' → 503
test('create-subscription — C4: trial bloqueado por flag → 503', async () => {
  const env = mockEnv({ ENABLE_TRIAL_V2: 'false' });
  const handler = fetchMatcher({});
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeCreateSubRequest({ tenant_id: VALID_TENANT_UUID, plano: 'trial' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'Trial temporariamente indisponível. Escolha um plano pago.');
  });
});
```

- [ ] **Step 4.2.2: Run tests, esperar pass**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/api/create-subscription.test.mjs`

Expected: ~5 tests pass (C1 + C2×2 + C3 + C4) + 0 fail.

### Step 4.3: Adicionar tests C5-C8 (trial happy + free legado + email validation + existing)

- [ ] **Step 4.3.1: Append tests C5, C6, C7, C8 ao arquivo**

```js
// C5 — trial HAPPY PATH → trial_ate ISO + ML add + payment_logs
test('create-subscription — C5: trial HAPPY PATH', async () => {
  const env = mockEnv();  // ENABLE_TRIAL_V2='true' default, MAILERLITE keys set
  const handler = fetchMatcher({
    '/rest/v1/tenants?id=eq.': () => jsonResponse({}, 200),  // PATCH return=minimal
    'connect.mailerlite.com': () => jsonResponse({ id: 'ml-sub-1' }, 200),
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
  });
  const tStart = Date.now();
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeCreateSubRequest({
      tenant_id: VALID_TENANT_UUID,
      plano: 'trial',
      email: 'a@b.com',
    });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.trial, true);
    // trial_ate é ISO string +7 dias
    assert.match(body.trial_ate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    const trialMs = Date.parse(body.trial_ate);
    assert.ok(trialMs > tStart, 'trial_ate must be after now');
    assert.ok(trialMs < tStart + 8 * 24 * 60 * 60 * 1000, 'trial_ate must be < 8 days from now');
    // PATCH tenant body
    const patchCall = handler.calls.find(c =>
      c.method === 'PATCH' && c.url.includes('/rest/v1/tenants?id=eq.'));
    assert.ok(patchCall, 'PATCH tenant must exist');
    const patchBody = JSON.parse(patchCall.body);
    assert.equal(patchBody.plano, 'trial');
    assert.equal(patchBody.status_pagamento, 'trial');
    assert.equal(patchBody.ativo, true);
    assert.match(patchBody.trial_ate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    // ML POST body inclui groups:['group-trial-ativo']
    const mlCall = handler.calls.find(c =>
      c.method === 'POST' && c.url.includes('connect.mailerlite.com'));
    assert.ok(mlCall, 'ML POST must exist');
    const mlBody = JSON.parse(mlCall.body);
    assert.deepEqual(mlBody.groups, ['group-trial-ativo']);
    // payment_logs com event_type='trial_started'
    const logCall = handler.calls.find(c => c.url.includes('/rest/v1/payment_logs'));
    assert.ok(logCall, 'payment_logs must exist');
    const logBody = JSON.parse(logCall.body);
    assert.equal(logBody.event_type, 'trial_started');
  });
});

// C6 — free legado → 200 trial:true zero downstream
test('create-subscription — C6: plano=free (legado) → 200 trial:true zero downstream', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({});
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeCreateSubRequest({ tenant_id: VALID_TENANT_UUID, plano: 'free' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { trial: true });
    assert.equal(handler.calls.length, 0);
  });
});

// C7 — email missing/inválido (parameterized 2: undefined, sem '@')
const C7_CASES = [
  ['email undefined', undefined],
  ['email sem @', 'noatsign'],
];
for (const [label, email] of C7_CASES) {
  test(`create-subscription — C7: ${label} (plano pago) → 400`, async () => {
    const env = mockEnv();
    const handler = fetchMatcher({});
    await withMockFetch(handler, async () => {
      const { onRequest } = await import('../../functions/api/create-subscription.js');
      const req = makeCreateSubRequest({
        tenant_id: VALID_TENANT_UUID,
        plano: 'individual',
        email,  // pode ser undefined ou inválido
      });
      const res = await onRequest({ request: req, env });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error, 'Email válido é obrigatório para processar o pagamento.');
    });
  });
}

// C8 — existing subscription authorized → 409 (zero MP calls)
test('create-subscription — C8: existing authorized subscription → 409', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?id=eq.': () => jsonResponse([{
      mp_subscription_id: 'mp-existing',
      status_pagamento: 'authorized',
    }]),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeCreateSubRequest({
      tenant_id: VALID_TENANT_UUID,
      plano: 'individual',
      email: 'a@b.com',
    });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, 'Este estúdio já possui uma assinatura ativa.');
    // Zero calls em MP
    assert.equal(handler.calls.filter(c => c.url.includes('api.mercadopago.com')).length, 0);
  });
});
```

- [ ] **Step 4.3.2: Run tests, esperar pass**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/api/create-subscription.test.mjs`

Expected: ~10 tests pass (5 anteriores + C5 + C6 + C7×2 + C8) + 0 fail.

### Step 4.4: Adicionar tests C9-C12 (env error + card_token + MP error + redirect)

- [ ] **Step 4.4.1: Append tests C9, C10, C11, C12 ao arquivo**

```js
// C9 — MP_ACCESS_TOKEN missing → 503
test('create-subscription — C9: MP_ACCESS_TOKEN missing → 503', async () => {
  const env = mockEnv({ MP_ACCESS_TOKEN: undefined });
  const handler = fetchMatcher({});
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeCreateSubRequest({
      tenant_id: VALID_TENANT_UUID,
      plano: 'individual',
      email: 'a@b.com',
    });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'Gateway de pagamento não configurado.');
  });
});

// C10 — card_token HAPPY PATH → 200 status:authorized + body MP completo
test('create-subscription — C10: card_token HAPPY PATH', async () => {
  const env = mockEnv();
  const tStart = Date.now();
  const handler = fetchMatcher({
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') return jsonResponse([]);  // checkExisting → no existing
      return jsonResponse({}, 200);  // PATCH return=minimal
    },
    'mercadopago.com/preapproval': () => jsonResponse({
      id: 'mp-sub-1',
      status: 'authorized',
    }),
    'connect.mailerlite.com': () => jsonResponse({ id: 'ml-sub-1' }, 200),
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeCreateSubRequest({
      tenant_id: VALID_TENANT_UUID,
      plano: 'individual',
      email: 'a@b.com',
      card_token: 'ct-1',
      payment_method_id: 'visa',
      issuer_id: '25',
    });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.subscription_id, 'mp-sub-1');
    assert.equal(data.status, 'authorized');
    // MP POST body
    const mpCall = handler.calls.find(c =>
      c.method === 'POST' && c.url.includes('mercadopago.com/preapproval'));
    assert.ok(mpCall, 'MP POST must exist');
    const mpBody = JSON.parse(mpCall.body);
    assert.equal(mpBody.card_token_id, 'ct-1');
    assert.equal(mpBody.payer_email, 'a@b.com');
    assert.equal(mpBody.payment_method_id, 'visa');
    assert.equal(mpBody.issuer_id, '25');
    assert.equal(mpBody.status, 'authorized');
    assert.equal(mpBody.external_reference, VALID_TENANT_UUID);
    assert.equal(mpBody.back_url, 'https://inkflowbrasil.com/onboarding');
    assert.equal(mpBody.auto_recurring.frequency, 1);
    assert.equal(mpBody.auto_recurring.frequency_type, 'months');
    assert.equal(mpBody.auto_recurring.transaction_amount, 197);  // PLANOS.individual.valor
    assert.equal(mpBody.auto_recurring.currency_id, 'BRL');
    // start_date = +5 min (range tolerance ±1 min)
    assert.match(mpBody.auto_recurring.start_date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    const startMs = Date.parse(mpBody.auto_recurring.start_date);
    assert.ok(startMs > tStart + 4 * 60 * 1000, 'start_date must be > +4 min');
    assert.ok(startMs < tStart + 6 * 60 * 1000, 'start_date must be < +6 min');
    // ML POST + PATCH tenants + payment_logs created
    assert.ok(handler.calls.find(c =>
      c.method === 'POST' && c.url.includes('connect.mailerlite.com')), 'ML POST must exist');
    const patchCall = handler.calls.find(c =>
      c.method === 'PATCH' && c.url.includes('/rest/v1/tenants?id=eq.'));
    assert.ok(patchCall, 'PATCH tenant must exist');
    const patchBody = JSON.parse(patchCall.body);
    assert.equal(patchBody.mp_subscription_id, 'mp-sub-1');
    assert.equal(patchBody.status_pagamento, 'authorized');
    const logCall = handler.calls.find(c => c.url.includes('/rest/v1/payment_logs'));
    assert.ok(logCall, 'payment_logs must exist');
    const logBody = JSON.parse(logCall.body);
    assert.equal(logBody.event_type, 'subscription_created');
  });
});

// C11 — card_token MP retorna 400 erro → passthrough status + log error
test('create-subscription — C11: card_token MP retorna 400 → passthrough + subscription_error log', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') return jsonResponse([]);
      return jsonResponse({}, 200);
    },
    'mercadopago.com/preapproval': () => jsonResponse({
      message: 'invalid_token',
      cause: [{ description: 'Token inválido' }],
    }, 400),
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeCreateSubRequest({
      tenant_id: VALID_TENANT_UUID,
      plano: 'individual',
      email: 'a@b.com',
      card_token: 'ct-bad',
    });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 400);  // passthrough mpRes.status
    const body = await res.json();
    assert.equal(body.error, 'Token inválido');  // pulls from cause[0].description
    const logCall = handler.calls.find(c => c.url.includes('/rest/v1/payment_logs'));
    assert.ok(logCall);
    const logBody = JSON.parse(logCall.body);
    assert.equal(logBody.event_type, 'subscription_error');
  });
});

// C12 — redirect HAPPY PATH (sem card_token) → 200 init_point + status:'pendente' HARDCODED
test('create-subscription — C12: redirect HAPPY PATH (sem card_token)', async () => {
  const env = mockEnv();
  const handler = fetchMatcher({
    '/rest/v1/tenants?id=eq.': ({ method }) => {
      if (method === 'GET') return jsonResponse([]);
      return jsonResponse({}, 200);
    },
    'mercadopago.com/preapproval': () => jsonResponse({
      id: 'mp-sub-2',
      init_point: 'https://mp.com/checkout/X',
      status: 'pending',
    }),
    'connect.mailerlite.com': () => jsonResponse({ id: 'ml-sub-1' }, 200),
    '/rest/v1/payment_logs': () => jsonResponse({}, 201),
  });
  await withMockFetch(handler, async () => {
    const { onRequest } = await import('../../functions/api/create-subscription.js');
    const req = makeCreateSubRequest({
      tenant_id: VALID_TENANT_UUID,
      plano: 'individual',
      email: 'a@b.com',
      // sem card_token → redirect path
    });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.init_point, 'https://mp.com/checkout/X');
    assert.equal(data.subscription_id, 'mp-sub-2');
    // MP POST body — sem card_token_id, status:'pending'
    const mpCall = handler.calls.find(c =>
      c.method === 'POST' && c.url.includes('mercadopago.com/preapproval'));
    assert.ok(mpCall);
    const mpBody = JSON.parse(mpCall.body);
    assert.equal(mpBody.payer_email, 'a@b.com');
    assert.equal(mpBody.back_url, 'https://inkflowbrasil.com/onboarding');
    assert.equal(mpBody.status, 'pending');
    assert.ok(!('card_token_id' in mpBody), 'redirect path must NOT have card_token_id');
    // PATCH tenant body — status_pagamento:'pendente' HARDCODED (não passa data.status)
    const patchCall = handler.calls.find(c =>
      c.method === 'PATCH' && c.url.includes('/rest/v1/tenants?id=eq.'));
    const patchBody = JSON.parse(patchCall.body);
    assert.equal(patchBody.status_pagamento, 'pendente');
    assert.equal(patchBody.mp_subscription_id, 'mp-sub-2');
    // payment_logs com event_type='subscription_redirect'
    const logCall = handler.calls.find(c => c.url.includes('/rest/v1/payment_logs'));
    const logBody = JSON.parse(logCall.body);
    assert.equal(logBody.event_type, 'subscription_redirect');
  });
});
```

- [ ] **Step 4.4.2: Run tests, esperar pass**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/api/create-subscription.test.mjs`

Expected: ~14 tests pass (10 anteriores + C9 + C10 + C11 + C12) + 0 fail.

### Step 4.5: Run completo + commit

- [ ] **Step 4.5.1: Run full file, confirmar pass**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/api/create-subscription.test.mjs`

Expected: ~14 tests pass, 0 fail. Tempo < 200ms.

- [ ] **Step 4.5.2: Run suite completa**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/**/*.test.mjs 2>&1 | tail -10`

Expected: ~510 pass (450 + 23 task1 + 13 task2 + 10 task3 + 14 task4). Zero fail.

- [ ] **Step 4.5.3: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add tests/api/create-subscription.test.mjs
git commit -m "$(cat <<'EOF'
test(billing-tests-b3): Task 4 — 12 HTTP tests pra create-subscription.js

Cobre 12 cenários (C1-C12, ~14 sub-tests parameterized):
- JSON body inválido → 400 (C1)
- tenant_id ou plano missing → 400 (C2 ×2)
- plano inválido → 400 (C3)
- trial bloqueado por flag ENABLE_TRIAL_V2='false' → 503 (C4)
- trial HAPPY PATH → trial_ate ISO + ML group_trial_ativo + log (C5)
- free legado → 200 trial:true zero downstream (C6)
- email missing/inválido pra plano pago → 400 (C7 ×2)
- existing authorized subscription → 409 zero MP calls (C8)
- MP_ACCESS_TOKEN missing → 503 (C9)
- card_token HAPPY PATH → 200 + body MP completo + ML + PATCH + log (C10)
- card_token MP error → passthrough mpRes.status + subscription_error log (C11)
- redirect HAPPY PATH → init_point + status:'pendente' HARDCODED + log (C12)

Asserts ISO date com regex + Date.parse range pra trial_ate (C5) e auto_recurring.start_date
(C10/C12, ±1min tolerance).

Spec: docs/superpowers/specs/2026-05-07-billing-tests-b3-design.md
Auditoria: F2.4.2 (parte create-subscription endpoint) — fecha F2.4.2 inteiro

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

Após implementar todas as 4 tasks, rodar checklist holístico cross-file:

- [ ] **Helpers byte-identical:** `mockEnv`, `withMockFetch`, `jsonResponse`, `fetchMatcher` exatamente iguais nos 4 arquivos. `makeRequest` exatamente igual em tasks 2/3/4. `makeMpSignature` exatamente igual em tasks 2/3.
- [ ] **Pattern matchers não-colidem:** em mp-ipn.test.mjs verificar que `'/preapproval/'` (com trailing /) não bate em URL de processMpSinal `/v1/payments/...` (que não contém `/preapproval/`). Verificar que `connect.mailerlite.com` (sem path) bate ambos DELETE e POST.
- [ ] **ISO date assertions consistentes:** regex `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/` + `Date.parse() > tStart` + `Date.parse() < tStart + tolerance` em todos os tests com data dinâmica (C5 trial_ate, C10/C12 start_date).
- [ ] **calls.length asserts:** todo teste com setup de mocks exige assert explícito de `handler.calls.length === N` ou `.filter(...).length === 0` pra zero downstream. Mitiga G11 (pattern faltando vira 500 mascarado).
- [ ] **INTENTIONAL comments preservados:** L7 (idempotência via filtro), L8 (5 calls com lifecycle), I1 (mp-ipn loga warning), M1 (mp-sinal NÃO loga warning — diverge).
- [ ] **Suite total verde:** `node --test tests/**/*.test.mjs` retorna ~510 pass, 0 fail (450 baseline + ~60 novos).

## Smoke pós-merge (opcional)

Após mergear PR em main + deploy CF Pages success, rodar 1 smoke contra prod (sem precisar de dados reais):

```bash
curl -i -X POST 'https://inkflowbrasil.com/api/mp-ipn?type=preapproval&data.id=test' \
  -H 'Content-Type: application/json' \
  -H 'x-signature: ts=1715000000,v1=00deadbeef' \
  -H 'x-request-id: smoke-test' \
  -d '{}'
```

Expected: HTTP 401 + body `{"error":"Assinatura invalida"}` — confirma I3 batendo em prod sem regressão.

---

## Decisões fora do plan

- **Branch / PR title** — decidir no momento do PR (sugerido: `test(billing-tests-b3): F2.4.2 — 41 testes pra fluxo billing` ou simplesmente referenciar o spec).
- **Backlog-add pros anti-goals** — após merge, decidir se vai criar entries pra: refator HMAC unification (mp-ipn vs mp-sinal fail-open divergence), `addSubscriberToMailerLite` dead code em mp-ipn, edge `external_reference` regex non-strict.
- **Estratégia de smoke** — opcional pós-merge (1 curl, ver acima).

## Cross-references

- Spec: `docs/superpowers/specs/2026-05-07-billing-tests-b3-design.md`
- Specs irmãos mergeados: B1 (#45), B2 (#46)
- Auditoria F2.4.2: `docs/auditoria/2026-05-07-auditoria-completa.md`
- Endpoints alvo: `functions/api/mp-ipn.js`, `functions/api/create-subscription.js`, `functions/api/webhooks/mp-sinal.js`
- Lib alvo: `functions/_lib/mp-sinal-handler.js`
