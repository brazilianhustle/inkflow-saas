# Auditor #5 `billing-flow` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o auditor #5 `billing-flow` (4 sintomas: webhook delay/silent + MailerLite drift + DB consistency) como Worker auditor em `inkflow-cron`, seguindo clone-pattern do auditor #2 deploy-health (em prod desde 2026-04-29 via PR #12 `4250be0`).

**Architecture:**
- `detect(input)` puro em `functions/_lib/auditors/billing-flow.js` — recebe `{env, supabaseQuery, fetchImpl, now}`, retorna array de eventos sem efeitos colaterais.
- Endpoint orchestrator `functions/api/cron/audit-billing-flow.js` — auth Bearer CRON_SECRET, chama `startRun → detect → collapseEvents → dedupePolicy → fire/silent/supersede/resolve` via lib `audit-state` já provada estável (PRs #10 + #11 + #12).
- Cron `30 */6 * * *` (00:30/06:30/12:30/18:30 UTC, offset 30min do deploy-health) registrado em `cron-worker/wrangler.toml` + dispatcher.

**Tech Stack:** Cloudflare Pages Functions (CF Pages onRequest), CF Workers (`inkflow-cron`), Supabase REST (PostgREST), Mercado Pago `preapproval` API, MailerLite Connect API v2, Node test runner (`node:test`), TDD strict (red→green per step), wrangler v3.

**Spec source:** `docs/superpowers/specs/2026-04-27-auditores-mvp-design.md` §5.5 + §9.3.

---

## Spec deviations cravadas neste plano

Antes de começar, 3 desvios do spec §5.5 — documentados aqui pra evitar review-time surprise:

1. **Fonte do "último webhook MP recebido": `payment_logs.created_at` (não `tenants.mp_webhook_received_at`).** Razão: a coluna `mp_webhook_received_at` não existe na tabela `tenants` — spec §5.5 foi otimista. Verificado em `functions/api/mp-ipn.js:63-79` (logIPNEvent escreve em `payment_logs` com `created_at` default). Trade-off: `payment_logs` pode ter rows de IPNs com `tenant_id=NULL` (signup attempts antes do primeiro pagamento) — filtramos `WHERE tenant_id IS NOT NULL` pra remover ruído. Documentar em `docs/canonical/auditores.md` na entry billing-flow.

2. **MP API check pra critical (Sintoma B): amostragem LIMIT 5.** Spec diz "verificação de subscription ativa via MP API" sem fixar count. Pra MVP, amostramos até 5 tenants ativos (`plano!='trial' AND ativo=true AND mp_subscription_id IS NOT NULL`) e chamamos `GET preapproval/{id}`. Se ≥1 retornar `status='authorized'` E último `payment_logs.created_at` >24h → critical. Se 0 ativos no MP → demote pra warn (sub não ativa explica ausência de webhook). Trade-off: 5 calls × 1s timeout = budget controlado.

3. **MailerLite drift (Sintoma C): amostragem LIMIT 5.** Spec é cross-source check sem count. Mesmo trade-off — iterar sobre todos tenants ativos chamando GET subscriber individual é caro. Amostragem 5 mais antigos por `created_at`. Se 1+ não estão no group `MAILERLITE_GROUP_CLIENTES_ATIVOS` → warn com lista dos email faltantes em `payload.missing_emails`.

Os 3 desvios mantêm a intenção do spec (detectar billing/onboarding drift) com custos controlados pro plano Paid Worker (10ms CPU/request budget cap).

---

## File Structure

**Files to create (4):**

1. `functions/_lib/auditors/billing-flow.js` — detect puro (4 sintomas), ~280 lines (similar a deploy-health.js 296 lines).
2. `functions/api/cron/audit-billing-flow.js` — endpoint orchestrator com `collapseEvents` + dedupe wiring, ~165 lines.
3. `tests/auditor-billing-flow.test.mjs` — unit tests dos 4 sintomas, ~30 tests.
4. `tests/audit-billing-flow-endpoint.test.mjs` — endpoint integration tests (auth/method/missing-key/no-event/critical-fire/supersede/resolve), 7 tests.

**Files to modify (5):**

1. `cron-worker/wrangler.toml` — add cron `30 */6 * * *` ao array `triggers.crons`.
2. `cron-worker/src/index.js` — add SCHEDULE_MAP entry mapeando `'30 */6 * * *' → /api/cron/audit-billing-flow`.
3. `docs/canonical/auditores.md` — add `## billing-flow` section + remove "billing-flow" do `## (Próximos auditores)`.
4. `.claude/agents/README.md` — add row "`billing-flow` | _none_ | MP é manual; runbook é a doutrina." na tabela Mapping.
5. `docs/canonical/methodology/incident-response.md` — atualizar §6.3 cross-reference (já lista os 5 auditores; só atualizar status billing-flow pra ✅ implementado).

**Database:** zero migrations. Schema `audit_events` + `audit_runs` + view `audit_current_state` já existe desde PR #10 (`0de4e03`).

---

## Pré-requisitos cravados

Validar antes de começar Task 1:

- [ ] Estado git limpo em `main` (commit `40698ea` ou descendente). `git status` retorna "working tree clean".
- [ ] Branch novo `feat/auditor-billing-flow` criado a partir de main: `git switch -c feat/auditor-billing-flow`.
- [ ] `node --test tests/*.test.mjs` passa em main com 105 tests (todos os 11 arquivos `.test.mjs` em `tests/`). Não há `package.json` na raiz — usar invocação direta do node test runner.
- [ ] Env vars já em prod (zero novos secrets a cadastrar):
  - `SUPABASE_SERVICE_KEY` ✅ — já em CF Pages env (usado por todos auditores).
  - `MP_ACCESS_TOKEN` ✅ — já em CF Pages env (usado por mp-ipn.js, key-expiry, create-subscription).
  - `MAILERLITE_API_KEY` ✅ — já em CF Pages env (usado por mp-ipn.js, expira-trial.js).
  - `MAILERLITE_GROUP_CLIENTES_ATIVOS` ✅ — já em CF Pages env (default fallback `184387920768009398`).
  - `CRON_SECRET` ✅ — já em CF Pages env + cron-worker secret.
  - `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` ✅ — já em CF Pages env (auditores #1 + #2).

Sem novos PATs/secrets pra cadastrar — diferente do auditor #2 que precisou criar `GITHUB_API_TOKEN`. Esse é um plus do clone-pattern: só código.

---

## Task 1: Skeleton + smoke test (TDD red→green do detect vazio)

**Files:**
- Create: `functions/_lib/auditors/billing-flow.js`
- Create: `tests/auditor-billing-flow.test.mjs`

**Goal:** Estabelecer arquivo skeleton com `detect()` exportada como async function que retorna `[]` quando env vazia, e suite de tests inicializada com 2 smoke tests (existência da função + skip silencioso). Espelha a abertura do test deploy-health (linhas 1-15).

- [ ] **Step 1: Criar test file com 2 smoke tests (red)**

```javascript
// tests/auditor-billing-flow.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../functions/_lib/auditors/billing-flow.js';

test('detect is exported as async function', () => {
  assert.equal(typeof detect, 'function');
});

test('detect with empty env returns empty array', async () => {
  const events = await detect({
    env: {},
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  });
  assert.deepEqual(events, []);
});
```

- [ ] **Step 2: Rodar e confirmar FAIL (módulo ausente)**

Run: `node --test tests/auditor-billing-flow.test.mjs`
Expected: FAIL com `Cannot find module 'functions/_lib/auditors/billing-flow.js'` ou `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Criar lib skeleton (green minimal)**

```javascript
// functions/_lib/auditors/billing-flow.js
// ── InkFlow — Auditor #5: billing-flow ─────────────────────────────────────
// Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §5.5
// Sintomas:
//   A — webhook MP delay (>6h sem payment_logs row → warn)
//   B — webhook MP silent (>24h + MP confirma sub ativa → critical)
//   C — MailerLite group drift (tenant ativo não no CLIENTES_ATIVOS → warn)
//   D — DB consistency (trial_expirado + ativo=true → critical)

const RUNBOOK_PATH = 'docs/canonical/runbooks/mp-webhook-down.md';
const SUGGESTED_SUBAGENT = null; // MP é manual no MVP, sem agent dedicado

function timeoutSignal(ms) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  const events = [];
  if (!fetchImpl) return events;
  // Sintomas serão adicionados nas tasks 2-5
  return events;
}
```

- [ ] **Step 4: Rodar e confirmar PASS**

Run: `node --test tests/auditor-billing-flow.test.mjs`
Expected: PASS — `tests 2 | pass 2 | fail 0`.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/auditors/billing-flow.js tests/auditor-billing-flow.test.mjs
git commit -m "feat(auditor-billing-flow): skeleton detect() + smoke test"
```

---

## Task 2: Sintoma A — webhook MP delay (>6h sem payment_logs → warn)

**Files:**
- Modify: `functions/_lib/auditors/billing-flow.js` (add `detectSymptomA`, helper `mostRecentWebhookAt`, helper `countActiveSubscriptions`)
- Modify: `tests/auditor-billing-flow.test.mjs` (add 6 tests pro Sintoma A)

**Goal:** Detectar quando o último webhook MP (proxy: `MAX(payment_logs.created_at) WHERE tenant_id IS NOT NULL`) é mais antigo que `AUDIT_BILLING_FLOW_WEBHOOK_DELAY_HOURS` (default 6h) E há tenants ativos com `mp_subscription_id`. Retorna 1 evento `warn` (`severity='warn'`) ou 1 evento `clean`. Skip silencioso se `payment_logs` vazia ou zero tenants ativos.

**Spec compliance check:** §5.5 tabela linha "Webhook MP atrasado" — severity warn quando último >6h. Critério usa `tenants WHERE plano!='trial' ORDER BY mp_webhook_received_at DESC LIMIT 1`. Adaptado pra `payment_logs.created_at` (ver Spec deviation #1 acima).

- [ ] **Step 1: Adicionar 6 tests (red)**

```javascript
// tests/auditor-billing-flow.test.mjs (append after existing tests)

const NOW = new Date('2026-04-29T12:00:00Z').getTime();
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const baseEnv = {
  SUPABASE_SERVICE_KEY: 'sb-key-test',
  MP_ACCESS_TOKEN: 'mp-tok',
  MAILERLITE_API_KEY: 'ml-tok',
  MAILERLITE_GROUP_CLIENTES_ATIVOS: '184387920768009398',
};

function paymentLogRow(hoursAgo) {
  return { created_at: new Date(NOW - hoursAgo * 3600 * 1000).toISOString() };
}

function makeFetchImpl(routes) {
  return async (url, opts) => {
    for (const [pattern, response] of routes) {
      if (String(url).includes(pattern)) {
        if (response instanceof Error) throw response;
        return typeof response === 'function' ? response(url, opts) : response;
      }
    }
    return { ok: true, status: 200, text: async () => '[]', json: async () => [] };
  };
}

// ── Sintoma A: webhook delay ────────────────────────────────────────────────

test('symptomA: env missing SUPABASE_SERVICE_KEY → skip silently', async () => {
  const fetchImpl = makeFetchImpl([]);
  const events = await detect({ env: {}, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'webhook-delay');
  assert.equal(a, undefined);
});

test('symptomA: payment_logs empty + zero active subs → skip silently', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [] }],
    ['tenants?', { ok: true, status: 200, json: async () => [{ count: 0 }] }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'webhook-delay');
  assert.equal(a, undefined);
});

test('symptomA: last webhook 2h ago → clean (under 6h threshold)', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(2)] }],
    ['tenants?', { ok: true, status: 200, json: async () => [{ count: 3 }] }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'webhook-delay');
  assert.equal(a?.severity, 'clean');
});

test('symptomA: last webhook 8h ago + 2 active subs → warn', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(8)] }],
    ['tenants?', { ok: true, status: 200, json: async () => [{ count: 2 }] }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'webhook-delay');
  assert.equal(a.severity, 'warn');
  assert.equal(a.payload.hours_since_last_webhook, 8);
  assert.equal(a.payload.active_subscriptions_count, 2);
  assert.equal(a.payload.runbook_path, 'docs/canonical/runbooks/mp-webhook-down.md');
});

test('symptomA: last webhook 8h ago + 0 active subs → clean (no subs explains absence)', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(8)] }],
    ['tenants?', { ok: true, status: 200, json: async () => [{ count: 0 }] }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'webhook-delay');
  assert.equal(a?.severity, 'clean');
});

test('symptomA: respects AUDIT_BILLING_FLOW_WEBHOOK_DELAY_HOURS env override', async () => {
  const env = { ...baseEnv, AUDIT_BILLING_FLOW_WEBHOOK_DELAY_HOURS: '12' };
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(8)] }],
    ['tenants?', { ok: true, status: 200, json: async () => [{ count: 2 }] }],
  ]);
  const events = await detect({ env, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'webhook-delay');
  assert.equal(a?.severity, 'clean'); // 8h < 12h threshold → clean
});
```

- [ ] **Step 2: Rodar e confirmar 6 FAILS (sintomas A não implementado)**

Run: `node --test tests/auditor-billing-flow.test.mjs`
Expected: FAIL nos 6 novos tests com `a.severity` undefined ou similar.

- [ ] **Step 3: Implementar Sintoma A no lib (green)**

Edit `functions/_lib/auditors/billing-flow.js` — adicionar antes do `export async function detect`:

```javascript
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const DEFAULT_WEBHOOK_DELAY_HOURS = 6;

function webhookDelayThresholdMs(env) {
  const raw = env.AUDIT_BILLING_FLOW_WEBHOOK_DELAY_HOURS;
  const h = parseInt(raw || `${DEFAULT_WEBHOOK_DELAY_HOURS}`, 10);
  return Number.isFinite(h) && h > 0 ? h * 3600 * 1000 : DEFAULT_WEBHOOK_DELAY_HOURS * 3600 * 1000;
}

function sbHeaders(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function fetchMostRecentWebhookAt(env, fetchImpl) {
  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return null;
  // Latest payment_logs row with non-null tenant_id (filters out signup attempts)
  const url = `${SUPABASE_URL}/rest/v1/payment_logs?tenant_id=not.is.null&select=created_at&order=created_at.desc&limit=1`;
  try {
    const res = await fetchImpl(url, { headers: sbHeaders(sbKey), signal: timeoutSignal(5000) });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return new Date(rows[0].created_at).getTime();
  } catch {
    return null;
  }
}

async function fetchActiveSubscriptionsCount(env, fetchImpl) {
  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return 0;
  // Count tenants with active paid plan + mp_subscription_id present
  const url = `${SUPABASE_URL}/rest/v1/tenants?select=count&plano=neq.trial&ativo=eq.true&mp_subscription_id=not.is.null`;
  try {
    const res = await fetchImpl(url, {
      headers: sbHeaders(sbKey, { Prefer: 'count=exact' }),
      signal: timeoutSignal(5000),
    });
    if (!res.ok) return 0;
    const rows = await res.json();
    if (Array.isArray(rows) && rows[0]?.count !== undefined) return rows[0].count;
    return 0;
  } catch {
    return 0;
  }
}

async function detectSymptomA(env, fetchImpl, now) {
  if (!env.SUPABASE_SERVICE_KEY) return [];

  const lastWebhookMs = await fetchMostRecentWebhookAt(env, fetchImpl);
  const activeSubs = await fetchActiveSubscriptionsCount(env, fetchImpl);

  // No payment_logs at all → no signal (could be pre-MVP state, no real customers yet)
  if (lastWebhookMs === null) return [];
  // Active subs absent → no signal (webhook silence is expected)
  if (activeSubs === 0) {
    return [{
      severity: 'clean',
      payload: { symptom: 'webhook-delay', active_subscriptions_count: 0 },
      evidence: { source: 'supabase/payment_logs+tenants' },
    }];
  }

  const elapsedMs = now - lastWebhookMs;
  const thresholdMs = webhookDelayThresholdMs(env);
  if (elapsedMs <= thresholdMs) {
    return [{
      severity: 'clean',
      payload: { symptom: 'webhook-delay', hours_since_last_webhook: Math.round(elapsedMs / 3600000) },
      evidence: { source: 'supabase/payment_logs' },
    }];
  }

  const hoursSince = Math.round(elapsedMs / 3600000);
  return [{
    severity: 'warn',
    payload: {
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: `Último webhook MP recebido há ${hoursSince}h (esperado <${Math.round(thresholdMs / 3600000)}h)`,
      symptom: 'webhook-delay',
      hours_since_last_webhook: hoursSince,
      last_webhook_at: new Date(lastWebhookMs).toISOString(),
      active_subscriptions_count: activeSubs,
      drift_type: 'webhook_delay',
    },
    evidence: { source: 'supabase/payment_logs+tenants' },
  }];
}
```

E atualizar `detect`:

```javascript
export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  const events = [];
  if (!fetchImpl) return events;
  events.push(...await detectSymptomA(env, fetchImpl, now));
  return events;
}
```

- [ ] **Step 4: Rodar e confirmar 8 PASS (2 antigos + 6 novos)**

Run: `node --test tests/auditor-billing-flow.test.mjs`
Expected: PASS — `tests 8 | pass 8 | fail 0`.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/auditors/billing-flow.js tests/auditor-billing-flow.test.mjs
git commit -m "feat(auditor-billing-flow): Sintoma A (webhook MP delay >6h)"
```

---

## Task 3: Sintoma B — webhook MP silent (>24h + MP API confirma sub ativa → critical)

**Files:**
- Modify: `functions/_lib/auditors/billing-flow.js` (add `detectSymptomB`, helpers `fetchActiveTenantsSample`, `confirmActiveSubscriptionInMP`)
- Modify: `tests/auditor-billing-flow.test.mjs` (add 5 tests pro Sintoma B)

**Goal:** Quando último webhook >24h E pelo menos 1 dos top-5 tenants ativos retorna `status='authorized'` da MP API → critical. Se 0 retornarem authorized → demote pra warn (sub não ativa explica ausência). Spec §5.5 linha 2.

- [ ] **Step 1: Adicionar 5 tests (red)**

```javascript
// tests/auditor-billing-flow.test.mjs (append)

// ── Sintoma B: webhook silent + MP confirm ──────────────────────────────────

function tenantRow(id, mpSubId) {
  return { id, mp_subscription_id: mpSubId, plano: 'estudio', ativo: true };
}

test('symptomB: last webhook 30h + 1 MP sub authorized → critical', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(30)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 2 }] }],
    ['tenants?select=id', { ok: true, status: 200, json: async () => [
      tenantRow('t1', 'mp-sub-1'),
      tenantRow('t2', 'mp-sub-2'),
    ] }],
    ['preapproval/mp-sub-1', { ok: true, status: 200, json: async () => ({ status: 'authorized' }) }],
    ['preapproval/mp-sub-2', { ok: true, status: 200, json: async () => ({ status: 'paused' }) }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'webhook-silent');
  assert.equal(b?.severity, 'critical');
  assert.equal(b.payload.confirmed_active_in_mp, 1);
  assert.equal(b.payload.runbook_path, 'docs/canonical/runbooks/mp-webhook-down.md');
});

test('symptomB: last webhook 30h + 0 MP subs authorized → demote to warn', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(30)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 1 }] }],
    ['tenants?select=id', { ok: true, status: 200, json: async () => [tenantRow('t1', 'mp-sub-1')] }],
    ['preapproval/mp-sub-1', { ok: true, status: 200, json: async () => ({ status: 'cancelled' }) }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'webhook-silent');
  assert.equal(b?.severity, 'warn');
  assert.equal(b.payload.confirmed_active_in_mp, 0);
});

test('symptomB: last webhook 12h (under 24h threshold) → no symptomB event', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(12)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 1 }] }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'webhook-silent');
  assert.equal(b, undefined); // Only Sintoma A applies (warn)
});

test('symptomB: MP API transient error → silent skip (no critical from network blip)', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(30)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 1 }] }],
    ['tenants?select=id', { ok: true, status: 200, json: async () => [tenantRow('t1', 'mp-sub-1')] }],
    ['preapproval/mp-sub-1', new Error('ECONNRESET')],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'webhook-silent');
  // Network error = 0 confirmed → demote to warn (not critical from blip)
  assert.equal(b?.severity, 'warn');
  assert.equal(b.payload.confirmed_active_in_mp, 0);
});

test('symptomB: missing MP_ACCESS_TOKEN → skip Sintoma B silently', async () => {
  const env = { ...baseEnv };
  delete env.MP_ACCESS_TOKEN;
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(30)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 1 }] }],
  ]);
  const events = await detect({ env, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'webhook-silent');
  assert.equal(b, undefined);
});
```

- [ ] **Step 2: Rodar e confirmar 5 FAILS**

Run: `node --test tests/auditor-billing-flow.test.mjs`
Expected: FAIL nos 5 novos tests.

- [ ] **Step 3: Implementar Sintoma B**

Adicionar em `functions/_lib/auditors/billing-flow.js`:

```javascript
const DEFAULT_WEBHOOK_SILENT_HOURS = 24;
const ACTIVE_TENANTS_SAMPLE_LIMIT = 5;

function webhookSilentThresholdMs(env) {
  const h = parseInt(env.AUDIT_BILLING_FLOW_WEBHOOK_SILENT_HOURS || `${DEFAULT_WEBHOOK_SILENT_HOURS}`, 10);
  return Number.isFinite(h) && h > 0 ? h * 3600 * 1000 : DEFAULT_WEBHOOK_SILENT_HOURS * 3600 * 1000;
}

async function fetchActiveTenantsSample(env, fetchImpl) {
  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return [];
  const url = `${SUPABASE_URL}/rest/v1/tenants?select=id,mp_subscription_id&plano=neq.trial&ativo=eq.true&mp_subscription_id=not.is.null&order=created_at.asc&limit=${ACTIVE_TENANTS_SAMPLE_LIMIT}`;
  try {
    const res = await fetchImpl(url, { headers: sbHeaders(sbKey), signal: timeoutSignal(5000) });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function confirmActiveInMP(mpSubId, env, fetchImpl) {
  const token = env.MP_ACCESS_TOKEN;
  if (!token) return false;
  try {
    const res = await fetchImpl(`https://api.mercadopago.com/preapproval/${encodeURIComponent(mpSubId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: timeoutSignal(5000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.status === 'authorized';
  } catch {
    return false;
  }
}

async function detectSymptomB(env, fetchImpl, now) {
  if (!env.SUPABASE_SERVICE_KEY || !env.MP_ACCESS_TOKEN) return [];

  const lastWebhookMs = await fetchMostRecentWebhookAt(env, fetchImpl);
  if (lastWebhookMs === null) return []; // No payment_logs → no signal

  const elapsedMs = now - lastWebhookMs;
  const thresholdMs = webhookSilentThresholdMs(env);
  if (elapsedMs <= thresholdMs) return []; // Under 24h → only Sintoma A applies

  const sample = await fetchActiveTenantsSample(env, fetchImpl);
  if (sample.length === 0) return []; // No active subs → no signal

  // Confirm via MP API in parallel (≤5 calls, 5s timeout each)
  const confirmations = await Promise.all(
    sample.map((t) => confirmActiveInMP(t.mp_subscription_id, env, fetchImpl))
  );
  const confirmedActive = confirmations.filter(Boolean).length;

  const hoursSince = Math.round(elapsedMs / 3600000);
  const severity = confirmedActive >= 1 ? 'critical' : 'warn';

  return [{
    severity,
    payload: {
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: confirmedActive >= 1
        ? `Webhook MP silente há ${hoursSince}h com ${confirmedActive} subs ativas confirmadas no MP`
        : `Webhook MP silente há ${hoursSince}h mas zero subs ativas confirmadas (demoted)`,
      symptom: 'webhook-silent',
      hours_since_last_webhook: hoursSince,
      last_webhook_at: new Date(lastWebhookMs).toISOString(),
      sample_size: sample.length,
      confirmed_active_in_mp: confirmedActive,
      drift_type: 'webhook_silent',
    },
    evidence: {
      source: 'supabase/payment_logs+tenants + mercadopago/preapproval',
      sampled_subscription_ids: sample.map((t) => t.mp_subscription_id),
    },
  }];
}
```

E atualizar `detect`:

```javascript
export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  const events = [];
  if (!fetchImpl) return events;
  events.push(...await detectSymptomA(env, fetchImpl, now));
  events.push(...await detectSymptomB(env, fetchImpl, now));
  return events;
}
```

- [ ] **Step 4: Rodar e confirmar 13 PASS (8 antigos + 5 novos)**

Run: `node --test tests/auditor-billing-flow.test.mjs`
Expected: PASS — `tests 13 | pass 13 | fail 0`.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/auditors/billing-flow.js tests/auditor-billing-flow.test.mjs
git commit -m "feat(auditor-billing-flow): Sintoma B (webhook silent >24h + MP confirm)"
```

---

## Task 4: Sintoma C — MailerLite group drift (tenant ativo não no CLIENTES_ATIVOS → warn)

**Files:**
- Modify: `functions/_lib/auditors/billing-flow.js` (add `detectSymptomC`, helpers `fetchActiveTenantEmailsSample`, `subscriberInGroup`)
- Modify: `tests/auditor-billing-flow.test.mjs` (add 5 tests)

**Goal:** Amostrar até 5 tenants `ativo=true plano!='trial'`, verificar pra cada se está no group `MAILERLITE_GROUP_CLIENTES_ATIVOS` via API. Se 1+ não estiver → warn com `payload.missing_emails` listando até 5. Spec §5.5 linha 3.

- [ ] **Step 1: Adicionar 5 tests (red)**

```javascript
// tests/auditor-billing-flow.test.mjs (append)

// ── Sintoma C: MailerLite group drift ───────────────────────────────────────

function tenantWithEmail(id, email) {
  return { id, email, mp_subscription_id: `mp-${id}`, plano: 'estudio', ativo: true };
}

test('symptomC: all 3 active tenants in MailerLite group → clean', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(1)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 3 }] }],
    ['tenants?select=id,email', { ok: true, status: 200, json: async () => [
      tenantWithEmail('t1', 'a@test.com'),
      tenantWithEmail('t2', 'b@test.com'),
      tenantWithEmail('t3', 'c@test.com'),
    ] }],
    ['/api/subscribers/a@test.com', { ok: true, status: 200, json: async () => ({ data: { groups: [{ id: '184387920768009398' }] } }) }],
    ['/api/subscribers/b@test.com', { ok: true, status: 200, json: async () => ({ data: { groups: [{ id: '184387920768009398' }] } }) }],
    ['/api/subscribers/c@test.com', { ok: true, status: 200, json: async () => ({ data: { groups: [{ id: '184387920768009398' }] } }) }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const c = events.find((e) => e.payload?.symptom === 'mailerlite-drift');
  assert.equal(c?.severity, 'clean');
});

test('symptomC: 2 of 3 tenants missing in group → warn with emails', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(1)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 3 }] }],
    ['tenants?select=id,email', { ok: true, status: 200, json: async () => [
      tenantWithEmail('t1', 'a@test.com'),
      tenantWithEmail('t2', 'b@test.com'),
      tenantWithEmail('t3', 'c@test.com'),
    ] }],
    ['/api/subscribers/a@test.com', { ok: true, status: 200, json: async () => ({ data: { groups: [{ id: '184387920768009398' }] } }) }],
    ['/api/subscribers/b@test.com', { ok: true, status: 200, json: async () => ({ data: { groups: [] } }) }],
    ['/api/subscribers/c@test.com', { ok: false, status: 404, json: async () => ({ message: 'not found' }) }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const c = events.find((e) => e.payload?.symptom === 'mailerlite-drift');
  assert.equal(c?.severity, 'warn');
  assert.equal(c.payload.missing_count, 2);
  assert.deepEqual(c.payload.missing_emails.sort(), ['b@test.com', 'c@test.com']);
});

test('symptomC: missing MAILERLITE_API_KEY → skip silently', async () => {
  const env = { ...baseEnv };
  delete env.MAILERLITE_API_KEY;
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(1)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 1 }] }],
  ]);
  const events = await detect({ env, fetchImpl, now: NOW });
  const c = events.find((e) => e.payload?.symptom === 'mailerlite-drift');
  assert.equal(c, undefined);
});

test('symptomC: zero active tenants → skip silently', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(1)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 0 }] }],
    ['tenants?select=id,email', { ok: true, status: 200, json: async () => [] }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const c = events.find((e) => e.payload?.symptom === 'mailerlite-drift');
  assert.equal(c, undefined);
});

test('symptomC: ML API transient error on all calls → skip silently (no false warn)', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(1)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 2 }] }],
    ['tenants?select=id,email', { ok: true, status: 200, json: async () => [
      tenantWithEmail('t1', 'a@test.com'),
      tenantWithEmail('t2', 'b@test.com'),
    ] }],
    ['/api/subscribers/', new Error('ETIMEDOUT')],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const c = events.find((e) => e.payload?.symptom === 'mailerlite-drift');
  // All ML calls failed → skip Sintoma C (don't false-positive on network blip)
  assert.equal(c, undefined);
});
```

- [ ] **Step 2: Rodar e confirmar 5 FAILS**

Run: `node --test tests/auditor-billing-flow.test.mjs`
Expected: FAIL nos 5 novos tests.

- [ ] **Step 3: Implementar Sintoma C**

Adicionar em `functions/_lib/auditors/billing-flow.js`:

```javascript
const ML_BASE = 'https://connect.mailerlite.com/api';
const DEFAULT_ML_GROUP_CLIENTES = '184387920768009398';

async function fetchActiveTenantEmailsSample(env, fetchImpl) {
  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return [];
  const url = `${SUPABASE_URL}/rest/v1/tenants?select=id,email&plano=neq.trial&ativo=eq.true&email=not.is.null&order=created_at.asc&limit=${ACTIVE_TENANTS_SAMPLE_LIMIT}`;
  try {
    const res = await fetchImpl(url, { headers: sbHeaders(sbKey), signal: timeoutSignal(5000) });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows.filter((r) => r.email) : [];
  } catch {
    return [];
  }
}

// Returns: 'in' | 'missing' | 'unknown' (network error or 5xx — not 404)
async function checkSubscriberInGroup(email, groupId, env, fetchImpl) {
  const token = env.MAILERLITE_API_KEY;
  if (!token) return 'unknown';
  const url = `${ML_BASE}/subscribers/${encodeURIComponent(email)}`;
  try {
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: timeoutSignal(5000),
    });
    if (res.status === 404) return 'missing'; // Subscriber doesn't exist in ML at all
    if (!res.ok) return 'unknown'; // 5xx, 401, 403 → don't false-positive
    const body = await res.json();
    const groups = body?.data?.groups;
    if (!Array.isArray(groups)) return 'unknown';
    return groups.some((g) => String(g.id) === String(groupId)) ? 'in' : 'missing';
  } catch {
    return 'unknown';
  }
}

async function detectSymptomC(env, fetchImpl) {
  if (!env.SUPABASE_SERVICE_KEY || !env.MAILERLITE_API_KEY) return [];

  const sample = await fetchActiveTenantEmailsSample(env, fetchImpl);
  if (sample.length === 0) return [];

  const groupId = env.MAILERLITE_GROUP_CLIENTES_ATIVOS || DEFAULT_ML_GROUP_CLIENTES;
  const results = await Promise.all(
    sample.map(async (t) => ({
      email: t.email,
      status: await checkSubscriberInGroup(t.email, groupId, env, fetchImpl),
    }))
  );

  // If ALL came back 'unknown' → all calls failed; suppress (network blip)
  const allUnknown = results.every((r) => r.status === 'unknown');
  if (allUnknown) return [];

  const missing = results.filter((r) => r.status === 'missing').map((r) => r.email);
  if (missing.length === 0) {
    return [{
      severity: 'clean',
      payload: { symptom: 'mailerlite-drift', sample_size: sample.length, missing_count: 0 },
      evidence: { source: 'supabase/tenants + mailerlite/subscribers' },
    }];
  }

  return [{
    severity: 'warn',
    payload: {
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: `${missing.length} de ${sample.length} tenants ativos sem inscrição no grupo MailerLite "Clientes Ativos"`,
      symptom: 'mailerlite-drift',
      sample_size: sample.length,
      missing_count: missing.length,
      missing_emails: missing.slice(0, 5),
      group_id: groupId,
      drift_type: 'mailerlite_sync',
    },
    evidence: {
      source: 'supabase/tenants + mailerlite/subscribers',
      checked_emails: sample.map((t) => t.email),
    },
  }];
}
```

E atualizar `detect`:

```javascript
export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  const events = [];
  if (!fetchImpl) return events;
  events.push(...await detectSymptomA(env, fetchImpl, now));
  events.push(...await detectSymptomB(env, fetchImpl, now));
  events.push(...await detectSymptomC(env, fetchImpl));
  return events;
}
```

- [ ] **Step 4: Rodar e confirmar 18 PASS**

Run: `node --test tests/auditor-billing-flow.test.mjs`
Expected: PASS — `tests 18 | pass 18 | fail 0`.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/auditors/billing-flow.js tests/auditor-billing-flow.test.mjs
git commit -m "feat(auditor-billing-flow): Sintoma C (MailerLite group drift)"
```

---

## Task 5: Sintoma D — DB consistency (`trial_expirado` + `ativo=true` → critical)

**Files:**
- Modify: `functions/_lib/auditors/billing-flow.js` (add `detectSymptomD`, helper `fetchInconsistentTenants`)
- Modify: `tests/auditor-billing-flow.test.mjs` (add 4 tests)

**Goal:** Detectar tenants no estado inválido `status_pagamento='trial_expirado' AND ativo=true` (deveria ser `ativo=false`). É indicador de bug em `expira-trial` cron ou race condition. Spec §5.5 linha 4 (severity critical).

- [ ] **Step 1: Adicionar 4 tests (red)**

```javascript
// tests/auditor-billing-flow.test.mjs (append)

// ── Sintoma D: DB consistency (trial_expirado + ativo=true) ─────────────────

test('symptomD: zero inconsistent tenants → clean', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(1)] }],
    ['tenants?select=count&plano=neq.trial&ativo=eq.true&mp_subscription_id', { ok: true, status: 200, json: async () => [{ count: 1 }] }],
    ['tenants?select=count&status_pagamento=eq.trial_expirado&ativo=eq.true', { ok: true, status: 200, json: async () => [{ count: 0 }] }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const d = events.find((e) => e.payload?.symptom === 'db-consistency');
  assert.equal(d?.severity, 'clean');
});

test('symptomD: 1 inconsistent tenant → critical', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(1)] }],
    ['tenants?select=count&plano=neq.trial&ativo=eq.true&mp_subscription_id', { ok: true, status: 200, json: async () => [{ count: 1 }] }],
    ['tenants?select=count&status_pagamento=eq.trial_expirado&ativo=eq.true', { ok: true, status: 200, json: async () => [{ count: 1 }] }],
    ['tenants?select=id,email&status_pagamento=eq.trial_expirado&ativo=eq.true', { ok: true, status: 200, json: async () => [
      { id: 'bad-tenant-id', email: 'broken@test.com' },
    ] }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const d = events.find((e) => e.payload?.symptom === 'db-consistency');
  assert.equal(d?.severity, 'critical');
  assert.equal(d.payload.inconsistent_count, 1);
  assert.deepEqual(d.payload.affected_tenant_ids, ['bad-tenant-id']);
});

test('symptomD: 7 inconsistent tenants → critical with capped tenant ids list', async () => {
  const tenants = Array.from({ length: 7 }, (_, i) => ({ id: `bad-${i}`, email: `e${i}@t.com` }));
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(1)] }],
    ['tenants?select=count&plano=neq.trial&ativo=eq.true&mp_subscription_id', { ok: true, status: 200, json: async () => [{ count: 5 }] }],
    ['tenants?select=count&status_pagamento=eq.trial_expirado&ativo=eq.true', { ok: true, status: 200, json: async () => [{ count: 7 }] }],
    ['tenants?select=id,email&status_pagamento=eq.trial_expirado&ativo=eq.true', { ok: true, status: 200, json: async () => tenants }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const d = events.find((e) => e.payload?.symptom === 'db-consistency');
  assert.equal(d.severity, 'critical');
  assert.equal(d.payload.inconsistent_count, 7);
  // Cap at 5 in payload (full list in evidence)
  assert.equal(d.payload.affected_tenant_ids.length, 5);
});

test('symptomD: query error → skip silently (no false critical)', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(1)] }],
    ['tenants?select=count&plano=neq.trial&ativo=eq.true&mp_subscription_id', { ok: true, status: 200, json: async () => [{ count: 1 }] }],
    ['tenants?select=count&status_pagamento=eq.trial_expirado&ativo=eq.true', { ok: false, status: 500, json: async () => ({}) }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const d = events.find((e) => e.payload?.symptom === 'db-consistency');
  assert.equal(d, undefined);
});
```

- [ ] **Step 2: Rodar e confirmar 4 FAILS**

Run: `node --test tests/auditor-billing-flow.test.mjs`
Expected: FAIL nos 4 novos tests.

- [ ] **Step 3: Implementar Sintoma D**

Adicionar em `functions/_lib/auditors/billing-flow.js`:

```javascript
const INCONSISTENT_PAYLOAD_CAP = 5;

async function fetchInconsistentTenantsCount(env, fetchImpl) {
  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return null;
  const url = `${SUPABASE_URL}/rest/v1/tenants?select=count&status_pagamento=eq.trial_expirado&ativo=eq.true`;
  try {
    const res = await fetchImpl(url, {
      headers: sbHeaders(sbKey, { Prefer: 'count=exact' }),
      signal: timeoutSignal(5000),
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows[0]?.count !== undefined ? rows[0].count : null;
  } catch {
    return null;
  }
}

async function fetchInconsistentTenantIds(env, fetchImpl) {
  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return [];
  const url = `${SUPABASE_URL}/rest/v1/tenants?select=id,email&status_pagamento=eq.trial_expirado&ativo=eq.true&order=created_at.desc&limit=20`;
  try {
    const res = await fetchImpl(url, { headers: sbHeaders(sbKey), signal: timeoutSignal(5000) });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function detectSymptomD(env, fetchImpl) {
  if (!env.SUPABASE_SERVICE_KEY) return [];

  const count = await fetchInconsistentTenantsCount(env, fetchImpl);
  if (count === null) return []; // Query error → skip silently

  if (count === 0) {
    return [{
      severity: 'clean',
      payload: { symptom: 'db-consistency', inconsistent_count: 0 },
      evidence: { source: 'supabase/tenants' },
    }];
  }

  const inconsistent = await fetchInconsistentTenantIds(env, fetchImpl);
  const affectedIds = inconsistent.map((t) => t.id);

  return [{
    severity: 'critical',
    payload: {
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: `${count} tenants em estado inconsistente: trial_expirado + ativo=true`,
      symptom: 'db-consistency',
      inconsistent_count: count,
      affected_tenant_ids: affectedIds.slice(0, INCONSISTENT_PAYLOAD_CAP),
      drift_type: 'db_invariant_violation',
    },
    evidence: {
      source: 'supabase/tenants',
      query_predicate: 'status_pagamento=trial_expirado AND ativo=true',
      full_affected_count: count,
      sample_size: affectedIds.length,
    },
  }];
}
```

E atualizar `detect`:

```javascript
export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  const events = [];
  if (!fetchImpl) return events;
  events.push(...await detectSymptomA(env, fetchImpl, now));
  events.push(...await detectSymptomB(env, fetchImpl, now));
  events.push(...await detectSymptomC(env, fetchImpl));
  events.push(...await detectSymptomD(env, fetchImpl));
  return events;
}
```

- [ ] **Step 4: Rodar e confirmar 22 PASS**

Run: `node --test tests/auditor-billing-flow.test.mjs`
Expected: PASS — `tests 22 | pass 22 | fail 0`.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/auditors/billing-flow.js tests/auditor-billing-flow.test.mjs
git commit -m "feat(auditor-billing-flow): Sintoma D (DB consistency trial_expirado+ativo)"
```

---

## Task 6: Endpoint orchestrator + collapseEvents + dedupe wiring

**Files:**
- Create: `functions/api/cron/audit-billing-flow.js` (orchestrator)
- Create: `tests/audit-billing-flow-endpoint.test.mjs` (7 integration tests)

**Goal:** CF Pages Function que recebe POST com Bearer CRON_SECRET, chama `detect()`, colapsa múltiplos sintomas em 1 evento top-severity, aplica dedupe policy, e dispara fire/silent/supersede/resolve via lib `audit-state`. Espelha endpoint deploy-health byte-a-byte com troca de auditor name e detect import.

- [ ] **Step 1: Criar test file com 7 tests (red)**

```javascript
// tests/audit-billing-flow-endpoint.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/cron/audit-billing-flow.js';

const baseEnv = {
  CRON_SECRET: 'test-cron-secret',
  SUPABASE_SERVICE_KEY: 'sb-key',
};

function makeRequest(authHeader = 'Bearer test-cron-secret') {
  return new Request('https://inkflowbrasil.com/api/cron/audit-billing-flow', {
    method: 'POST',
    headers: { Authorization: authHeader },
  });
}

test('endpoint: missing auth → 401', async () => {
  const res = await onRequest({ request: makeRequest('Bearer wrong'), env: baseEnv });
  assert.equal(res.status, 401);
});

test('endpoint: GET → 405', async () => {
  const req = new Request('https://inkflowbrasil.com/api/cron/audit-billing-flow', { method: 'GET' });
  const res = await onRequest({ request: req, env: baseEnv });
  assert.equal(res.status, 405);
});

test('endpoint: missing SUPABASE_SERVICE_KEY → 503', async () => {
  const env = { CRON_SECRET: 'test-cron-secret' };
  const res = await onRequest({ request: makeRequest(), env });
  assert.equal(res.status, 503);
});

test('endpoint: empty detect (no triggers) → ok=true with zero events', async () => {
  const fetchSpy = async (url, opts) => {
    const u = String(url);
    if (u.includes('audit_runs') && opts?.method === 'POST') {
      return { ok: true, status: 201, json: async () => [{ id: 'run-1' }] };
    }
    if (u.includes('audit_current_state')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (u.includes('audit_runs') && opts?.method === 'PATCH') {
      return { ok: true, status: 204, text: async () => '' };
    }
    // payment_logs empty + tenant counts 0 → no events
    return { ok: true, status: 200, json: async () => [] };
  };
  const res = await onRequest({ request: makeRequest(), env: baseEnv, fetchImpl: fetchSpy });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.events_count, 0);
});

test('endpoint: critical event detected → fire path (insert + telegram)', async () => {
  const env = {
    ...baseEnv,
    MP_ACCESS_TOKEN: 'mp',
    TELEGRAM_BOT_TOKEN: 'tg-tok',
    TELEGRAM_CHAT_ID: '999',
  };
  const calls = { events_post: 0, telegram: 0 };
  const fetchSpy = async (url, opts) => {
    const u = String(url);
    if (u.includes('audit_runs') && opts?.method === 'POST') {
      return { ok: true, status: 201, json: async () => [{ id: 'run-1' }] };
    }
    if (u.includes('audit_current_state')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (u.includes('payment_logs?')) {
      return { ok: true, status: 200, json: async () => [{ created_at: new Date(Date.now() - 30 * 3600 * 1000).toISOString() }] };
    }
    if (u.includes('tenants?select=count&plano=neq.trial&ativo=eq.true&mp_subscription_id')) {
      return { ok: true, status: 200, json: async () => [{ count: 1 }] };
    }
    if (u.includes('tenants?select=id,mp_subscription_id')) {
      return { ok: true, status: 200, json: async () => [{ id: 't1', mp_subscription_id: 'mp-1' }] };
    }
    if (u.includes('preapproval/mp-1')) {
      return { ok: true, status: 200, json: async () => ({ status: 'authorized' }) };
    }
    if (u.includes('tenants?select=count&status_pagamento=eq.trial_expirado')) {
      return { ok: true, status: 200, json: async () => [{ count: 0 }] };
    }
    if (u.includes('audit_events') && opts?.method === 'POST') {
      calls.events_post += 1;
      return { ok: true, status: 201, json: async () => [{ id: 'evt-1234-5678-9abc-def012345678' }] };
    }
    if (u.includes('api.telegram.org')) {
      calls.telegram += 1;
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    if (u.includes('audit_runs') && opts?.method === 'PATCH') {
      return { ok: true, status: 204, text: async () => '' };
    }
    return { ok: true, status: 200, json: async () => [] };
  };
  const res = await onRequest({ request: makeRequest(), env, fetchImpl: fetchSpy });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(body.actions.fire >= 1, 'fire action should fire');
  assert.equal(calls.events_post, 1, 'INSERT audit_events called once');
  assert.equal(calls.telegram, 1, 'sendTelegram called once');
});

test('endpoint: warn → critical transition → supersede path', async () => {
  const env = {
    ...baseEnv,
    MP_ACCESS_TOKEN: 'mp',
    TELEGRAM_BOT_TOKEN: 'tg-tok',
    TELEGRAM_CHAT_ID: '999',
  };
  const calls = { events_post: 0, events_patch: 0, telegram: 0 };
  const fetchSpy = async (url, opts) => {
    const u = String(url);
    if (u.includes('audit_runs') && opts?.method === 'POST') {
      return { ok: true, status: 201, json: async () => [{ id: 'run-2' }] };
    }
    if (u.includes('audit_current_state')) {
      return {
        ok: true, status: 200,
        json: async () => [{
          auditor: 'billing-flow',
          event_id: 'old-uuid-aaaa-bbbb-cccc-dddddddddddd',
          severity: 'warn',
          payload: {},
          evidence: {},
          detected_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
          last_seen_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
          last_alerted_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
          alert_count: 1,
          acknowledged_at: null,
        }],
      };
    }
    // Symptom D = critical (1 inconsistent tenant) — will supersede the warn
    if (u.includes('tenants?select=count&status_pagamento=eq.trial_expirado')) {
      return { ok: true, status: 200, json: async () => [{ count: 1 }] };
    }
    if (u.includes('tenants?select=id,email&status_pagamento=eq.trial_expirado')) {
      return { ok: true, status: 200, json: async () => [{ id: 'bad', email: 'b@t.com' }] };
    }
    if (u.includes('audit_events') && opts?.method === 'POST') {
      calls.events_post += 1;
      return { ok: true, status: 201, json: async () => [{ id: 'evt-new-1234-5678-9abc-def012345678' }] };
    }
    if (u.includes('audit_events') && opts?.method === 'PATCH') {
      calls.events_patch += 1;
      assert.match(u, /id=eq\.old-uuid-aaaa-bbbb-cccc-dddddddddddd/);
      return { ok: true, status: 204, text: async () => '' };
    }
    if (u.includes('api.telegram.org')) {
      calls.telegram += 1;
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    if (u.includes('audit_runs') && opts?.method === 'PATCH') {
      return { ok: true, status: 204, text: async () => '' };
    }
    return { ok: true, status: 200, json: async () => [] };
  };
  const res = await onRequest({ request: makeRequest(), env, fetchImpl: fetchSpy });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.actions.supersede >= 1, 'supersede action should fire');
  assert.equal(calls.events_post, 1, 'INSERT new critical event');
  assert.equal(calls.events_patch, 1, 'PATCH old event with resolved_at + superseded_by');
  assert.equal(calls.telegram, 1, 'sendTelegram called once for new critical');
});

test('endpoint: open critical → next run clean → resolve path', async () => {
  const env = {
    ...baseEnv,
    TELEGRAM_BOT_TOKEN: 'tg-tok',
    TELEGRAM_CHAT_ID: '999',
  };
  const calls = { events_patch: 0, telegram: 0 };
  const fetchSpy = async (url, opts) => {
    const u = String(url);
    if (u.includes('audit_runs') && opts?.method === 'POST') {
      return { ok: true, status: 201, json: async () => [{ id: 'run-3' }] };
    }
    if (u.includes('audit_current_state')) {
      return {
        ok: true, status: 200,
        json: async () => [{
          auditor: 'billing-flow',
          event_id: 'open-critical-1234-5678-9abc-def012345678',
          severity: 'critical',
          payload: {},
          evidence: {},
          detected_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
          last_seen_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
          last_alerted_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
          alert_count: 1,
          acknowledged_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
        }],
      };
    }
    // All checks clean
    if (u.includes('tenants?select=count&status_pagamento=eq.trial_expirado')) {
      return { ok: true, status: 200, json: async () => [{ count: 0 }] };
    }
    if (u.includes('audit_events') && opts?.method === 'PATCH') {
      calls.events_patch += 1;
      assert.match(u, /id=eq\.open-critical-1234-5678-9abc-def012345678/);
      return { ok: true, status: 204, text: async () => '' };
    }
    if (u.includes('api.telegram.org')) {
      calls.telegram += 1;
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    if (u.includes('audit_runs') && opts?.method === 'PATCH') {
      return { ok: true, status: 204, text: async () => '' };
    }
    return { ok: true, status: 200, json: async () => [] };
  };
  const res = await onRequest({ request: makeRequest(), env, fetchImpl: fetchSpy });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.actions.resolve >= 1, 'resolve action should fire');
  assert.equal(calls.events_patch, 1, 'PATCH old event with resolved_at=now, resolved_reason=next_run_clean');
  assert.equal(calls.telegram, 1, 'sendTelegram [resolved] message');
});
```

- [ ] **Step 2: Rodar e confirmar 7 FAILS (módulo ausente)**

Run: `node --test tests/audit-billing-flow-endpoint.test.mjs`
Expected: FAIL com `Cannot find module 'functions/api/cron/audit-billing-flow.js'`.

- [ ] **Step 3: Criar endpoint orchestrator (green)**

```javascript
// functions/api/cron/audit-billing-flow.js
// ── InkFlow — Cron: audit billing-flow (§5.5) ──────────────────────────────
// Auditor #5. Cron 30 */6 * * * (6h, offset 30min). Detecta drift no fluxo
// de billing via 4 sintomas (webhook delay, webhook silent, MailerLite drift,
// DB consistency). Emite eventos via audit-state lib seguindo dedupe policy
// §6.2.

import { detect } from '../../_lib/auditors/billing-flow.js';
import {
  startRun,
  endRun,
  getCurrentState,
  insertEvent,
  dedupePolicy,
  sendTelegram,
} from '../../_lib/audit-state.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

function timeoutSignal(ms) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function severityRank(s) {
  return s === 'critical' ? 3 : s === 'warn' ? 2 : s === 'clean' ? 1 : 0;
}

// Collapse múltiplos eventos do auditor em um único top-event (severity mais
// alta). Outros eventos viram detalhe no payload.affected_symptoms.
function collapseEvents(events) {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  const top = sorted[0];
  if (top.severity === 'clean') {
    return { severity: 'clean', payload: { symptom: 'aggregate', summary: 'all checks ok' }, evidence: {} };
  }
  const otherCount = sorted.filter((e) => e.severity !== 'clean' && e !== top).length;
  const allFailingSymptoms = sorted
    .filter((e) => e.severity !== 'clean' && e.payload?.symptom)
    .map((e) => ({ symptom: e.payload.symptom, severity: e.severity }));
  return {
    severity: top.severity,
    payload: {
      ...top.payload,
      affected_count: allFailingSymptoms.length,
      affected_symptoms: allFailingSymptoms,
      summary: otherCount > 0
        ? `${top.payload.summary} (+${otherCount} sintomas)`
        : top.payload.summary,
    },
    evidence: {
      top: top.evidence,
      all: sorted.map((e) => ({ severity: e.severity, symptom: e.payload?.symptom })),
    },
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const fetchImpl = context.fetchImpl || globalThis.fetch.bind(globalThis);

  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!env.CRON_SECRET || token !== env.CRON_SECRET) return json({ error: 'unauthorized' }, 401);

  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return json({ error: 'config_missing' }, 503);

  const supabase = { url: SUPABASE_URL, key: sbKey, fetchImpl };
  const sbHeaders = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
  };

  const originalFetch = globalThis.fetch;
  if (context.fetchImpl) globalThis.fetch = context.fetchImpl;

  let runId;
  const actions = { fire: 0, silent: 0, supersede: 0, resolve: 0, no_op: 0 };
  let collapsed = null;

  try {
    runId = await startRun(supabase, 'billing-flow');

    const rawEvents = await detect({ env, fetchImpl, now: Date.now() });
    collapsed = collapseEvents(rawEvents);

    if (collapsed) {
      const current = await getCurrentState(supabase, 'billing-flow');
      const action = dedupePolicy(current, collapsed);
      actions[action.replace('-', '_')] = (actions[action.replace('-', '_')] || 0) + 1;

      if (action === 'fire' || action === 'supersede') {
        const inserted = await insertEvent(supabase, {
          run_id: runId,
          auditor: 'billing-flow',
          severity: collapsed.severity,
          payload: collapsed.payload,
          evidence: collapsed.evidence,
        });
        await sendTelegram(env, inserted);

        if (action === 'supersede' && current) {
          await fetchImpl(`${SUPABASE_URL}/rest/v1/audit_events?id=eq.${current.event_id}`, {
            method: 'PATCH',
            headers: sbHeaders,
            body: JSON.stringify({
              resolved_at: new Date().toISOString(),
              resolved_reason: 'superseded',
              superseded_by: inserted.id,
            }),
            signal: timeoutSignal(5000),
          });
        }
      } else if (action === 'resolve' && current) {
        await fetchImpl(`${SUPABASE_URL}/rest/v1/audit_events?id=eq.${current.event_id}`, {
          method: 'PATCH',
          headers: sbHeaders,
          body: JSON.stringify({
            resolved_at: new Date().toISOString(),
            resolved_reason: 'next_run_clean',
          }),
          signal: timeoutSignal(5000),
        });
        await sendTelegram(env, {
          id: current.event_id,
          severity: 'resolved',
          auditor: 'billing-flow',
          payload: { runbook_path: 'docs/canonical/runbooks/mp-webhook-down.md', summary: 'billing-flow: resolved (next run clean)' },
          evidence: {},
        });
      }
      // 'silent' e 'no-op' → nada.
    }

    await endRun(supabase, runId, {
      status: 'success',
      eventsEmitted: actions.fire + actions.supersede,
    });
    return json({ ok: true, run_id: runId, events_count: collapsed && collapsed.severity !== 'clean' ? 1 : 0, actions });
  } catch (err) {
    if (runId) {
      try {
        await endRun(supabase, runId, {
          status: 'error',
          eventsEmitted: 0,
          errorMessage: err.message,
        });
      } catch { /* ignore */ }
    }
    return json({ error: 'internal_error', message: err.message }, 500);
  } finally {
    if (context.fetchImpl) globalThis.fetch = originalFetch;
  }
}
```

- [ ] **Step 4: Rodar e confirmar 7 PASS no endpoint test**

Run: `node --test tests/audit-billing-flow-endpoint.test.mjs`
Expected: PASS — `tests 7 | pass 7 | fail 0`.

- [ ] **Step 5: Rodar a suite COMPLETA (regression check)**

Run: `node --test tests/*.test.mjs`
Expected: PASS — todos os tests do repo passing. **Atual baseline: 105 → novo total esperado: 105 + 22 + 7 = 134 tests.** Se algum dos 105 antigos falhar, é regression introduzida — fix antes de prosseguir.

- [ ] **Step 6: Commit**

```bash
git add functions/api/cron/audit-billing-flow.js tests/audit-billing-flow-endpoint.test.mjs
git commit -m "feat(auditor-billing-flow): endpoint /api/cron/audit-billing-flow + collapseEvents + dedupe wiring"
```

---

## Task 7: Cron registration (wrangler.toml + cron-worker dispatcher)

**Files:**
- Modify: `cron-worker/wrangler.toml` (add cron `30 */6 * * *`)
- Modify: `cron-worker/src/index.js` (add SCHEDULE_MAP entry)

**Goal:** Adicionar trigger `30 */6 * * *` ao Worker `inkflow-cron` (00:30/06:30/12:30/18:30 UTC, offset 30min do deploy-health pra evitar contention nos endpoints CF Pages). Mapear pra `/api/cron/audit-billing-flow`. Atual cap: 8 triggers; após esta task: 9 triggers (plano Paid: 30 cap, folga 21).

- [ ] **Step 1: Modificar wrangler.toml**

Edit `cron-worker/wrangler.toml`. Localizar bloco `[triggers]` linha 7 e adicionar a nova linha **antes do fechamento `]`**:

```toml
[triggers]
crons = [
  "0 12 * * *",     # 09:00 BRT diario → /api/cron/expira-trial
  "0 2 * * *",      # 23:00 BRT diario → /api/cleanup-tenants
  "0 9 * * *",      # 06:00 BRT diario → /api/cron/reset-agendamentos
  "*/30 * * * *",   # a cada 30min     → /api/cron/monitor-whatsapp
  "*/5 * * * *",    # a cada 5min      → /api/cron/audit-escalate
  "0 4 * * 1",      # seg 01:00 BRT    → /api/cron/audit-cleanup
  "0 6 * * *",      # 03:00 BRT diario → /api/cron/audit-key-expiry
  "0 */6 * * *",    # 00:00/06:00/12:00/18:00 UTC → /api/cron/audit-deploy-health
  "30 */6 * * *",   # 00:30/06:30/12:30/18:30 UTC → /api/cron/audit-billing-flow
]
```

- [ ] **Step 2: Modificar cron-worker/src/index.js — adicionar entrada ao SCHEDULE_MAP**

Edit `cron-worker/src/index.js` linha 26 (após o entry do `audit-deploy-health`):

```javascript
const SCHEDULE_MAP = {
  '0 12 * * *':   { path: '/api/cron/expira-trial',       secretEnv: 'CRON_SECRET', label: 'expira-trial' },
  '0 2 * * *':    { path: '/api/cleanup-tenants',         secretEnv: 'CRON_SECRET', label: 'cleanup-tenants' },
  '0 9 * * *':    { path: '/api/cron/reset-agendamentos', secretEnv: 'CRON_SECRET', label: 'reset-agendamentos' },
  '*/30 * * * *': { path: '/api/cron/monitor-whatsapp',   secretEnv: 'CRON_SECRET', label: 'monitor-whatsapp' },
  '*/5 * * * *':  { path: '/api/cron/audit-escalate',     secretEnv: 'CRON_SECRET', label: 'audit-escalate' },
  '0 4 * * 1':    { path: '/api/cron/audit-cleanup',      secretEnv: 'CRON_SECRET', label: 'audit-cleanup' },
  '0 6 * * *':    { path: '/api/cron/audit-key-expiry',   secretEnv: 'CRON_SECRET', label: 'audit-key-expiry' },
  '0 */6 * * *':  { path: '/api/cron/audit-deploy-health', secretEnv: 'CRON_SECRET', label: 'audit-deploy-health' },
  '30 */6 * * *': { path: '/api/cron/audit-billing-flow', secretEnv: 'CRON_SECRET', label: 'audit-billing-flow' },
};
```

- [ ] **Step 3: Validar wrangler.toml syntax**

Run: `cd cron-worker && npx wrangler deploy --dry-run`
Expected: output similar a `Total Upload: ...kB` e listagem dos 9 triggers — sem erro de parse no TOML.

Se rodar `wrangler deploy --dry-run` falhar com `not authenticated`, validar manualmente que o array TOML está fechado corretamente: `grep -c "^\\s*\"" cron-worker/wrangler.toml` deve retornar 9.

- [ ] **Step 4: Commit (sem deploy ainda — deploy será na Task 9 pós-PR-merge)**

```bash
git add cron-worker/wrangler.toml cron-worker/src/index.js
git commit -m "feat(cron-worker): trigger 30 */6 * * * → audit-billing-flow"
```

---

## Task 8: Docs canonical (auditores.md + agents/README.md + incident-response.md)

**Files:**
- Modify: `docs/canonical/auditores.md` (add `## billing-flow` section, remove from "Próximos auditores")
- Modify: `.claude/agents/README.md` (add row na Mapping table)
- Modify: `docs/canonical/methodology/incident-response.md` (atualizar §6.3 status)

**Goal:** Cravar a doutrina canônica do billing-flow como fonte única — espelha o pattern do deploy-health (§9.2 spec compliance). Subagents do Sub-projeto 5 vão ler esses docs em runbook execution.

- [ ] **Step 1: Modificar `docs/canonical/auditores.md`**

Localizar a seção `## (Próximos auditores)` linha ~100 e remover `billing-flow` da lista. Adicionar a seguinte seção **antes** dessa (após `## deploy-health`):

```markdown
---

## billing-flow

**Status:** ✅ Em produção (2026-04-29)
**Onde:** `inkflow-cron` Worker
**Frequência:** A cada 6h (cron `30 */6 * * *`, offset 30min do deploy-health)
**Endpoint:** `functions/api/cron/audit-billing-flow.js`
**Lib `detect()`:** `functions/_lib/auditors/billing-flow.js`
**Tests:** `tests/auditor-billing-flow.test.mjs` + `tests/audit-billing-flow-endpoint.test.mjs`
**Runbook:** [mp-webhook-down.md](runbooks/mp-webhook-down.md)
**Suggested subagent:** _none_ (MP é manual no MVP — runbook é a doutrina)

### Detecção em 4 sintomas

| Symptom | Source | Severity rules |
|---|---|---|
| A (webhook-delay) | `payment_logs.created_at` (latest, tenant_id NOT NULL) | warn quando >`AUDIT_BILLING_FLOW_WEBHOOK_DELAY_HOURS` (default 6h) E ≥1 active sub. Clean caso contrário. |
| B (webhook-silent) | mesmo + Mercado Pago `preapproval/{id}` API | critical quando >`AUDIT_BILLING_FLOW_WEBHOOK_SILENT_HOURS` (default 24h) E ≥1 sub `status='authorized'` em amostra de 5. Demote pra warn se 0 confirmadas. |
| C (mailerlite-drift) | Supabase tenants + MailerLite `/subscribers/{email}` | warn quando ≥1 tenant ativo (sample 5) não está no group `MAILERLITE_GROUP_CLIENTES_ATIVOS`. Network errors → silent skip. |
| D (db-consistency) | Supabase `tenants WHERE status_pagamento='trial_expirado' AND ativo=true` | critical quando count > 0 (invariante violada — bug em `expira-trial` cron ou race). |

### Spec deviations vs §5.5

1. **Source pra "último webhook":** `payment_logs.created_at` (não `tenants.mp_webhook_received_at` que não existe no schema). Filtra `tenant_id IS NOT NULL` pra ignorar signup attempts.
2. **MP API check (Sintoma B):** amostragem LIMIT 5 (top 5 tenants ativos por `created_at` asc). Se 0 confirmadas → demote critical → warn.
3. **MailerLite drift (Sintoma C):** mesma amostragem LIMIT 5, com `payload.missing_emails` capped em 5.

### Env vars necessárias

- **`SUPABASE_SERVICE_KEY`** ✅ (já em prod) — base de todos os 4 sintomas.
- **`MP_ACCESS_TOKEN`** ✅ (já em prod) — Sintoma B (sem ele Sintoma B fica skip silencioso).
- **`MAILERLITE_API_KEY`** ✅ (já em prod) — Sintoma C (sem ele Sintoma C fica skip silencioso).
- **`MAILERLITE_GROUP_CLIENTES_ATIVOS`** (default `184387920768009398`) — Sintoma C target group.
- **`AUDIT_BILLING_FLOW_WEBHOOK_DELAY_HOURS`** (opcional, default 6) — Sintoma A threshold.
- **`AUDIT_BILLING_FLOW_WEBHOOK_SILENT_HOURS`** (opcional, default 24) — Sintoma B threshold.

### Dedupe

Single-state per auditor (collapse). Múltiplos sintomas no mesmo run colapsam em 1 evento top-severity. `payload.affected_symptoms` lista todos. Mesmo trade-off do deploy-health.

### Runbook trigger

Quando alerta `[critical] [billing-flow]` chegar no Telegram, seguir [mp-webhook-down.md](runbooks/mp-webhook-down.md) — 4 ações (A: webhook config, B: endpoint health, C: signature validation, D: parsing/lógica). Sintoma D (`db-consistency`) requer query SQL adicional pra encontrar root cause em `expira-trial` cron.
```

- [ ] **Step 2: Atualizar a linha "Próximos auditores"**

Substitui em `docs/canonical/auditores.md`:

Antes:
```
`billing-flow`, `vps-limits`, `rls-drift` — pendentes. Ver spec §5 e plano-mestre Fábrica `2026-04-25-fabrica-inkflow-design.md` §3.
```

Depois:
```
`vps-limits`, `rls-drift` — pendentes. Ver spec §5 e plano-mestre Fábrica `2026-04-25-fabrica-inkflow-design.md` §3.
```

- [ ] **Step 3: Modificar `.claude/agents/README.md` — Mapping table**

Localizar a tabela "Mapping auditor → agent" linha 56 e adicionar a row do billing-flow após deploy-health:

```markdown
| Auditor | Suggested subagent | Doctrine reason |
|---|---|---|
| `key-expiry` | `deploy-engineer` | Secrets vivem em CF Pages env; rotação envolve `wrangler` + GHA Secrets. Domain match. |
| `deploy-health` | `deploy-engineer` | Failures de pipeline (GHA + CF Pages + Wrangler). Domain match — agent já roteia rollback.md. |
| `billing-flow` | _none_ | MP webhook é integração externa (Mercado Pago dashboard) sem agent dedicado no MVP. Runbook `mp-webhook-down.md` é a doutrina — founder executa as 4 ações manuais. |
```

- [ ] **Step 4: Modificar `docs/canonical/methodology/incident-response.md` §6.3**

Esse arquivo lista os 5 auditores no §6.3 (cross-reference). Atual estado: lista billing-flow como "pendente". Atualizar pra "✅ implementado" ou similar — `grep -n "billing-flow" docs/canonical/methodology/incident-response.md` pra localizar. Trocar a label de status com edit cirúrgica de 1 linha.

Se a frase atual for `- billing-flow: pendente`, substitui por `- billing-flow: ✅ em prod 2026-04-29 (PR #N — atualizar com número real após Task 9)`.

- [ ] **Step 5: Verificar visualmente os 3 docs**

Run:
```bash
grep -A 2 "## billing-flow" docs/canonical/auditores.md
grep "billing-flow" .claude/agents/README.md
grep "billing-flow" docs/canonical/methodology/incident-response.md
```

Expected: cada comando retorna a entry recém-adicionada/modificada.

- [ ] **Step 6: Commit**

```bash
git add docs/canonical/auditores.md .claude/agents/README.md docs/canonical/methodology/incident-response.md
git commit -m "docs(auditor-billing-flow): canonical entry + agent mapping + incident-response cross-link"
```

---

## Task 9: PR + merge to main + smoke deploy in prod

**Files:**
- Modify (later): `docs/canonical/methodology/incident-response.md` (PR# após merge)

**Goal:** Abrir PR com 8 commits granulares, two-stage code review (spec compliance + code quality), merge via `gh pr merge --merge` (preservando history como pattern do PR #12), confirmar deploy GHA + CF Pages success, smoke sanity check em prod.

- [ ] **Step 1: Push branch + abrir PR**

```bash
git push -u origin feat/auditor-billing-flow
gh pr create --title "feat(auditor-billing-flow): Sub-projeto 3 §9.3 Auditor #5 billing-flow" --body "$(cat <<'EOF'
## Summary

Implementa Auditor #5 `billing-flow` (4 sintomas: webhook delay/silent + MailerLite drift + DB consistency) como Worker auditor em `inkflow-cron`. Clone-pattern do auditor #2 deploy-health (PR #12), pipeline core via lib `audit-state` provada estável.

- 4 sintomas detect puro com env-tunable thresholds (TDD strict, 22 unit tests)
- Endpoint `/api/cron/audit-billing-flow` + `collapseEvents` + dedupe wiring (7 endpoint tests)
- Cron `30 */6 * * *` (offset 30min do deploy-health)
- 3 spec deviations cravadas no plan + canonical doc (payment_logs vs mp_webhook_received_at, MP/ML LIMIT 5 sampling)
- Sub-projeto 3 progresso: 3/5 auditores DONE

## Test plan

- [ ] `node --test tests/*.test.mjs` — 134 tests passing (105 baseline + 22 unit billing-flow + 7 endpoint billing-flow)
- [ ] `npx wrangler deploy --dry-run` em `cron-worker/` — TOML válido, 9 triggers listados
- [ ] Após merge: GHA `Deploy to Cloudflare Pages` success → endpoint live (HTTP 401 sem auth)
- [ ] Cron natural dispara 18:30 UTC (próximo) e exercita pipeline em prod

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Stage 1 — Spec compliance review (subagent)**

Dispatch subagent com prompt:
> Review entire PR diff vs spec `docs/superpowers/specs/2026-04-27-auditores-mvp-design.md` §5.5 + §9.3 + §6 (pipeline core). Check: (a) 4 sintomas implementados batem com tabela §5.5 (severity rules + sources), (b) endpoint segue contract §6.1 (CRON_SECRET auth + auditor name + collapseEvents + dedupe wiring), (c) docs canonical entry está completa (4 sintomas + env vars + runbook trigger), (d) 3 spec deviations declaradas estão coerentes com a implementação. Skip code style/quality (Stage 2 cobre). Report: PASS/FAIL com 3-5 bullets do que validou.

Resolve qualquer FAIL antes de prosseguir.

- [ ] **Step 3: Stage 2 — Code quality review (subagent)**

Dispatch subagent com prompt:
> Code quality review do PR diff. Foco: (a) timer leaks (toda chamada fetch tem `signal: timeoutSignal(...)` ou equivalente), (b) error handling (network errors → skip silent, não false-positive), (c) consistency com pattern de deploy-health.js (helper signatures, `evidence` shape, env var naming), (d) testes cobrem edge cases (empty arrays, null returns, transient errors), (e) sem hardcoded fixtures de tenant ids reais que possam vazar dados. Report: PASS/FAIL com bullets de issues encontradas. Se WARN-level, tag como "non-blocking".

Resolve FAILs blocantes antes de mergear.

- [ ] **Step 4: Merge com history preservation**

```bash
gh pr merge --merge --delete-branch
```

(`--merge` cria merge commit preservando os 8 commits granulares — pattern do PR #11 + #12. Não usar `--squash`.)

Confirmar com `git log main --oneline -15` que aparecem os 8 commits + merge commit.

- [ ] **Step 5: Aguardar GHA Pages deploy**

```bash
gh run list --branch main --limit 3
gh run watch <latest-run-id>
```

Expected: `Deploy to Cloudflare Pages` success em ~30-60s.

- [ ] **Step 6: Deploy cron-worker (não automático)**

```bash
cd cron-worker && npx wrangler deploy
```

Expected: output lista 9 triggers, último `30 */6 * * *`. Se algum trigger desaparecer, `wrangler.toml` foi corrompido — fix antes de prosseguir.

- [ ] **Step 7: Sanity check endpoint em prod**

```bash
curl -i -X POST https://inkflowbrasil.com/api/cron/audit-billing-flow
```

Expected: `HTTP/2 401` com body `{"error":"unauthorized"}`. Endpoint deployed e responde.

- [ ] **Step 8: Atualizar incident-response.md PR#**

Edit `docs/canonical/methodology/incident-response.md` substituindo `(PR #N — atualizar com número real após Task 9)` pelo número real do PR (e.g., `(PR #13)`).

```bash
git add docs/canonical/methodology/incident-response.md
git commit -m "docs(auditores): wire PR# in incident-response §6.3"
git push origin main
```

---

## Task 10: Smoke E2E + Painel update

**Files:**
- Create: `evals/sub-projeto-3/2026-04-29-auditor-billing-flow-smoke.md`
- Update memory: `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Painel.md`
- Update memory: `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Pendências (backlog).md`

**Goal:** Documentar smoke tests, registrar 48h baseline gate, atualizar Painel + backlog. Smoke E2E full requer CRON_SECRET em mãos (mesmo bloqueio do auditor #2 — vai ficar parcial em sanity check).

- [ ] **Step 1: Confirmar cron-worker está disparando**

```bash
# CF dashboard → Workers → inkflow-cron → Crons (verificar 9 triggers listados)
# OU listar via wrangler:
cd cron-worker && npx wrangler cron list 2>/dev/null || echo "comando não suporta em wrangler v3 — verificar via dashboard"
```

Expected: 9 triggers ativos. Próximo `30 */6 * * *` será 18:30 UTC do dia.

- [ ] **Step 2: Sanity check unit + endpoint passando em main**

```bash
git checkout main && git pull origin main
node --test tests/*.test.mjs
```

Expected: PASS — 134 tests `tests 134 | pass 134 | fail 0`.

- [ ] **Step 3: Criar eval doc**

Create `evals/sub-projeto-3/2026-04-29-auditor-billing-flow-smoke.md`:

```markdown
---
date: 2026-04-29
auditor: billing-flow
status: PARTIAL
---

# Smoke E2E — Auditor #5 billing-flow

## Status: PARTIAL (sanity passed, full E2E aguardando cron natural ou sessão dedicada)

## O que rodou

- ✅ **Sanity check endpoint:** `POST /api/cron/audit-billing-flow` retorna HTTP 401 sem auth (deployed in prod, validates CRON_SECRET path).
- ✅ **22 unit tests** cobrindo 4 sintomas (clean/warn/critical) + edge cases (empty payment_logs, network errors, missing env vars, sampling caps).
- ✅ **7 endpoint tests** cobrindo todos os paths via dedupe (fire/supersede/resolve + auth/method/missing-key validation).
- ✅ **Pipeline core já validado em prod** via smoke do auditor #1 key-expiry (28/04) + smoke parcial do #2 deploy-health (29/04).

## O que ficou pendente

- ⏳ **Smoke E2E full** (4 cenários: no-event, critical fire, ack flow, resolve) — bloqueio: CRON_SECRET fora do BWS (mesmo gap operacional do #2). Requer regenerar CRON_SECRET pra rodar smoke manual, com efeito colateral em 9 outros crons. Decisão pragmática: aceitar smoke parcial.
- ⏳ **Cron natural dispara 18:30 UTC** (próximo) e vai exercitar pipeline ponta-a-ponta automaticamente. Audit_runs row criada com status='success', events_emitted=0 ou 1 dependendo do estado real.
- ⏳ **48h em prod sem falsa-positiva** é o gate real do DoD por auditor (~01/05).

## Validação passiva 48h (gate de DoD)

Query SQL pra rodar em ~01/05:

```sql
SELECT auditor, status, events_emitted, started_at, completed_at, error_message
FROM audit_runs
WHERE auditor='billing-flow'
ORDER BY started_at DESC
LIMIT 12;
```

Esperado: 8 execuções (4x ao dia × 2 dias), todas `status='success'`, **zero falsa-positiva**. Se aparecer `status='error'` ou `events_emitted >= 1` sem incidente real → debug.

## Próximos passos

1. Esperar cron natural disparar — confirmar primeiro run em ~18:30 UTC.
2. Monitorar `audit_runs` table próximas 48h.
3. Se primeira execução falhar com erro inesperado, abrir issue.
4. Se 48h passar zero false-positive → marcar billing-flow DoD como ✅ no spec §10.
```

- [ ] **Step 4: Update Painel (memory)**

Edit `/Users/brazilianhustler/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Painel.md` — adicionar nova entry **antes** da seção "📊 Estado anterior (29/04/2026 — Auditor #2 deploy-health MERGEADO em prod)":

```markdown
## 📊 Onde estamos agora (29/04/2026 — sessão noite, **Auditor #5 billing-flow MERGEADO em prod (PR #N)**)

**Sessão 29/04 noite — execução completa do plano `auditor-billing-flow` via subagent-driven (10 tasks):**

### 🎯 Sub-projeto 3 progresso: 3/5 auditores DONE

| Auditor | Status | PR | Onde |
|---|---|---|---|
| #1 key-expiry | ✅ Em prod desde 28/04 | #11 (`cd262ab`) | inkflow-cron Worker |
| #2 deploy-health | ✅ Em prod desde 29/04 (manhã) | #12 (`4250be0`) | inkflow-cron Worker |
| **#5 billing-flow** | ✅ **Em prod desde 29/04 (noite)** | **#N (`<merge-sha>`)** | **inkflow-cron Worker** |
| #3 vps-limits | ⏳ Pendente | — | Routine Anthropic |
| #4 rls-drift | ⏳ Pendente | — | Routine Anthropic |

### 🔍 Auditor #5 billing-flow — detalhes

**4 sintomas implementados:**
- **A (webhook-delay):** payment_logs.created_at >`AUDIT_BILLING_FLOW_WEBHOOK_DELAY_HOURS` (default 6h) + ≥1 active sub → warn
- **B (webhook-silent):** mesmo + amostra 5 tenants → MP API confirma ≥1 authorized + >24h → critical (demote pra warn se 0 confirmadas)
- **C (mailerlite-drift):** amostra 5 tenants ativos não no group MAILERLITE_GROUP_CLIENTES_ATIVOS → warn
- **D (db-consistency):** count tenants `status_pagamento='trial_expirado' AND ativo=true` >0 → critical

**Cron:** `30 */6 * * *` — 4x ao dia (00:30/06:30/12:30/18:30 UTC), offset 30min do deploy-health. cron-worker `inkflow-cron` agora com 9 triggers (cap 30 do plano Paid).

**Tests:** 134 verde (105 baseline + 22 unit billing-flow + 7 endpoint billing-flow). TDD strict.

**Endpoint live em prod:** `POST https://inkflowbrasil.com/api/cron/audit-billing-flow` retorna HTTP 401 sem auth (sanity check OK).

### ⚠️ Smoke E2E parcial (DONE_WITH_CONCERNS)

- ✅ **Sanity check** — endpoint deployed (HTTP 401)
- ✅ **29 tests** cobrindo todos os paths (4 sintomas × clean/warn/critical + dedupe paths)
- ✅ **Pipeline core** já validado em prod via smokes do #1 e #2
- ⏳ **Smoke E2E full** (4 cenários) **pendente** — mesmo bloqueio do #2: CRON_SECRET fora do BWS
- ⏳ **Cron natural** dispara hoje 18:30 UTC — vai exercitar pipeline ponta-a-ponta automaticamente
- ⏳ **48h em prod sem falsa-positiva** é o gate real do DoD por auditor (~01/05)

Eval doc: `evals/sub-projeto-3/2026-04-29-auditor-billing-flow-smoke.md`

### 📚 Docs canônicos atualizados

- `docs/canonical/auditores.md` — entry `## billing-flow` (4 sintomas + env vars + spec deviations + runbook trigger)
- `.claude/agents/README.md` — mapping `billing-flow → _none_` (MP é manual)
- `docs/canonical/methodology/incident-response.md §6.3` — cross-link

### Lições da sessão

1. **Spec deviation cravada em plan + canonical doc:** `tenants.mp_webhook_received_at` não existe — usar `payment_logs.created_at`. Documentar desvios em ambos os lugares pra futuro reviewer não pegar de surpresa.
2. **MP/ML sampling LIMIT 5:** spec não trava count — decisão de design defensiva pro MVP. Quando primeiro tenant pagante real entrar, revisar se 5 é suficiente.
3. **Clone-pattern do #2 → #5 funcionou ainda mais rápido:** ~70% código mecânico (orchestrator + collapseEvents 100% idênticos, troca só auditor name). Auditores Worker subsequentes serão proporcionalmente rápidos.

### Próxima sessão (recomendação)

1. **Auditor #3 `vps-limits`** — Routine Anthropic, primeira fora do CF Pages Worker. Pré-req: resolver Vultr `[confirmar]`s + endpoint `/health/metrics` no VPS via subagent `vps-ops`.
2. **Auditor #4 `rls-drift`** — Routine Anthropic, último auditor. Allowlist `RLS_INTENTIONAL_NO_PUBLIC` + reasoning prompt.
3. **Smoke E2E full** dos auditores #2 e #5 quando próxima rotação CRON_SECRET acontecer (com BWS save).
4. **Validação passiva:** monitorar `audit_runs` do billing-flow + deploy-health nas próximas 48h.

---
```

Atualizar também o frontmatter:
```yaml
last_updated: "2026-04-29"
last_session_focus: "Auditor #5 billing-flow MERGEADO em prod via PR #N. 10 tasks completas via subagent-driven, 105 tests passing, smoke E2E partial (sanity OK, full pendente). Sub-projeto 3 progresso: 3/5 auditores DONE."
```

- [ ] **Step 5: Update Backlog (memory)**

Edit `/Users/brazilianhustler/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Pendências (backlog).md`:

(a) Adicionar nova seção `## P2 — Auditor #5 billing-flow: validação 48h passiva + smoke E2E full` (espelho da entry do #2):

```markdown
## P2 — Auditor #5 billing-flow: validação 48h passiva + smoke E2E full

**Contexto:** Auditor #5 billing-flow mergeado em prod via PR #N (`<merge-sha>`) em 29/04 noite. Smoke E2E ficou parcial — sanity check OK + 29 unit tests, mas full E2E (4 cenários) ainda não rodou. Pipeline core já validado pelos #1 e #2 (28/04 + 29/04 manhã).

**Validação necessária:**
- [ ] **Próximas 48h:** monitorar `audit_runs` do auditor `billing-flow`. Esperado: 8 execuções, todas `success`, zero falsa-positiva. Cron natural 4x/dia (00:30/06:30/12:30/18:30 UTC). Query igual ao #2 com `auditor='billing-flow'`.
- [ ] **Smoke E2E full** quando primeiro evento real ocorrer OU sessão dedicada com CRON_SECRET regenerado.

**Trigger:** automático (48h baseline expira ~01/05) ou primeiro tenant pagante real entrar.
```

(b) Adicionar followup ao P3 do BWS (mesma rotação CRON_SECRET):

Localizar entry `## ~~P2 — Integrar Bitwarden Secrets Manager (BWS)~~` linha ~324 e na lista de followups, adicionar marcador:

```markdown
- [ ] **P3** — **Salvar `CRON_SECRET` em BWS na próxima rotação.** Bloqueio descoberto 29/04 durante smoke do auditor #2 deploy-health E confirmado 29/04 noite no smoke do auditor #5 billing-flow: ambos smokes E2E full ficaram pendentes pelo mesmo motivo. Memo: incluir BWS save no script de regeneração.
```

- [ ] **Step 6: Commit eval doc + push**

```bash
git add evals/sub-projeto-3/2026-04-29-auditor-billing-flow-smoke.md
git commit -m "test(auditor-billing-flow): smoke partial doc"
git push origin main
```

- [ ] **Step 7: Verificar 1ª execução do cron natural (~18:30 UTC ou próxima janela)**

```bash
# Query Supabase via MCP supabase ou curl direto
curl -X GET "https://bfzuxxuscyplfoimvomh.supabase.co/rest/v1/audit_runs?auditor=eq.billing-flow&order=started_at.desc&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
```

Expected: 1 row com `status='success'`, `events_emitted=0` (estado inicial, sem incidentes reais). Se `events_emitted >= 1` → checar `audit_events` pra confirmar evento legítimo (e.g., MailerLite drift real).

---

## Self-Review (gerado durante writing-plans)

**1. Spec coverage check:**

| Spec section | Task |
|---|---|
| §5.5 Sintoma A "webhook delay >6h" | Task 2 ✓ |
| §5.5 Sintoma B "webhook silent >24h + MP confirm" | Task 3 ✓ |
| §5.5 Sintoma C "MailerLite drift" | Task 4 ✓ |
| §5.5 Sintoma D "DB consistency trial_expirado+ativo" | Task 5 ✓ |
| §5.5 Payload structure | Task 2-5 (cada sintoma define payload completo) |
| §6.1 Pipeline core (audit-state lib) | Task 6 (reuso direto, sem mudança lib) |
| §6.2 Dedupe policy fire/silent/supersede/resolve | Task 6 ✓ (wired via dedupePolicy) |
| §6.3 Format Telegram | Task 6 ✓ (reuso direto sendTelegram) |
| §9.3 Auditor #5 DoD checklist (5 items) | Tasks 1-7 (skeleton + tests + endpoint + cron + 48h gate cravado em Task 10) |

**2. Placeholder scan:** Todos os steps tem código completo, sem TODO/TBD/"add appropriate error handling"/etc. Subagent prompts em Tasks 9.2 + 9.3 são instruções para subagent (não código a executar) — são prompts validáveis, não placeholders.

**3. Type consistency:** Verifiquei manualmente:
- `evidence` shape consistente entre os 4 sintomas (sempre `{source: '...'}`).
- `payload.symptom` strings: `'webhook-delay'`, `'webhook-silent'`, `'mailerlite-drift'`, `'db-consistency'`. Stable across detect, tests, e collapseEvents.
- Helper signatures: `detectSymptomX(env, fetchImpl, now?)` — mesmo shape do deploy-health.
- Env var naming: `AUDIT_BILLING_FLOW_*` prefix consistente com `AUDIT_DEPLOY_HEALTH_*` do #2.

**4. Tasks fail-fast safety:** Cada task tem teste antes da implementação. Self-contained — pode parar entre tasks sem deixar estado inconsistente.

---

## Execution notes

- **Modo execução autônoma + qualidade > pressa:** subagent dispatch deve seguir TDD strict (red→green per step), não pular steps. Code review é parte do processo, não opcional.
- **PR# placeholder:** vai ser substituído em runtime após `gh pr create` retornar o número real.
- **Tests baseline atual main:** 105 (verificado pre-flight via `node --test tests/*.test.mjs`). Se ao começar Task 1 esse número não bater, parar e investigar regression antes de prosseguir.
- **CRON_SECRET smoke E2E full:** aceitar smoke parcial conscientemente — bloqueio operacional já documentado em backlog.
