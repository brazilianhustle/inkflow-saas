# Auditores MVP — Infra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o pipeline core (lib + migration + ack webhook + escalation + cleanup) que destrava os 5 auditores e o relatório semanal do Sub-projeto 3.

**Architecture:** Pattern do repo: `cron-worker` é PURE DISPATCHER, lógica em `functions/api/cron/*.js`, helpers em `functions/_lib/*.js`. Este plano cria a lib `audit-state.js` (7 funções compartilhadas), migration de 3 tabelas + 1 view + RLS, endpoint customer-facing `/api/audit/telegram-webhook` (ack flow), e dois endpoints de manutenção (`audit-escalate`, `audit-cleanup`). Auditores individuais entram em planos seguintes.

**Tech Stack:** SQL (Postgres via Supabase MCP), JS (CF Pages Functions, ES modules), `node:test` (testes nativos), Cloudflare Workers (dispatcher), Telegram Bot API, Pushover API.

**Spec source:** `docs/superpowers/specs/2026-04-27-auditores-mvp-design.md` (v1.1, commit e8402d0), §9.0

---

## Escopo deste plano (recorte do spec)

✅ **Coberto:**
- §9.0 pré-reqs de capability (cron limit, Telegram webhook, smoke Routine — só validação)
- §4 schema completo (audit_events, audit_runs, audit_reports, view, RLS, índices)
- §6.1 lib `audit-state.js` (insertEvent, getCurrentState, dedupePolicy, sendTelegram, sendPushover, startRun, endRun)
- §6.4 ack flow (`/api/audit/telegram-webhook`)
- §6.5 escalation flow (`/api/cron/audit-escalate`, cron `*/5`)
- §6.6 cleanup flow (`/api/cron/audit-cleanup`, cron `0 4 * * 1`)
- Cron-worker SCHEDULE_MAP + wrangler.toml para os 2 triggers acima

❌ **Fora deste plano (planos separados):**
- §5.1 auditor key-expiry → próximo plano
- §5.2 auditor deploy-health → plano seguinte
- §5.5 auditor billing-flow → plano seguinte
- §5.3 auditor vps-limits (Routine) → plano seguinte
- §5.4 auditor rls-drift (Routine) → plano seguinte
- §7 relatório semanal → plano final
- §8 cross-references nos agents existentes → plano final

---

## File Structure

**Create:**
- `supabase/migrations/2026-04-27-create-audit-tables.sql` — DDL + RLS + índices + view
- `functions/_lib/audit-state.js` — 7 funções compartilhadas
- `functions/api/audit/telegram-webhook.js` — endpoint ack flow (bot Telegram chama aqui)
- `functions/api/cron/audit-escalate.js` — endpoint escalation Pushover
- `functions/api/cron/audit-cleanup.js` — endpoint DELETE old rows
- `tests/audit-state.test.mjs` — testes da lib (dedupePolicy + insertEvent + getCurrentState + telegram + pushover)
- `tests/audit-telegram-webhook.test.mjs` — testes do ack flow
- `tests/audit-escalate.test.mjs` — testes do escalation
- `tests/audit-cleanup.test.mjs` — testes do cleanup
- `evals/smoke-tests/2026-04-27-auditores-infra-e2e.md` — checklist do smoke test ponta-a-ponta

**Modify:**
- `cron-worker/wrangler.toml` — adiciona 2 triggers (`*/5 * * * *`, `0 4 * * 1`)
- `cron-worker/src/index.js` — adiciona 2 entries no `SCHEDULE_MAP`

**Convenção estabelecida:** este plano é o primeiro a criar `functions/api/audit/` (endpoints customer-facing de audit) e `functions/api/cron/audit-*.js` (endpoints internos de audit). Auditores subsequentes seguem o mesmo path.

---

## Risk markers

🚨 **Migration produção (Task 2):** CREATE TABLE em prod. Não-destrutivo (não toca dados existentes). Aplicar via `mcp__plugin_supabase_supabase__apply_migration`. Sem `IF NOT EXISTS` — falha-fast em runs duplos é o desejo aqui.

🚨 **Endpoint customer-facing sem auth tradicional (Task 7):** `/api/audit/telegram-webhook` é exposto publicamente — autenticação é via header `X-Telegram-Bot-Api-Secret-Token` configurado no `setWebhook`. Ataque: terceiro descobre URL e POSTa updates falsos. Mitigação dupla: secret token + whitelist `from.id == TELEGRAM_ADMIN_USER_ID`. **Cravar bem**.

🚨 **Cron triggers limit (Task 1):** plano CF Free cap 5 triggers/Worker. `inkflow-cron` tem 4 hoje; este plano adiciona 2 (total 6). **Se Free → estoura**, exige upgrade Paid Bundled OU Worker dedicado `inkflow-cron-audit`. Validar ANTES de Task 10.

🚨 **Telegram webhook único por bot (Task 1 + 11):** bot só comporta 1 webhook ativo. Se já houver webhook em uso (n8n? polling antigo?), `setWebhook` deste plano sobrescreve e quebra o fluxo existente. Validar via `getWebhookInfo` ANTES de Task 11.

⚠️ **`escalated_at` separado de `acknowledged_*`:** spec v1.1 §4.1 corrigiu isso. Garantir que migration tem `escalated_at` como coluna distinta (não reusar `acknowledged_by` pra audit trail). Plano abaixo já cobre.

⚠️ **PUSHOVER_*** já estão em CF Pages env? Spec do telegram-bot-down (commit b2ec1c3) deixou em Bitwarden mas não migrou pra CF Pages. Task 11 valida e cadastra se faltar.

⚠️ **`event_id_short` colisão:** primeiros 8 chars do UUID. Probabilidade de colisão em eventos abertos simultâneos é negligível (5 auditores × 1 evento aberto cada = 5 prefixos), mas o webhook valida com `WHERE id::text LIKE 'xxxxx%' AND resolved_at IS NULL` — se colidir, retorna ambíguo e pede ID completo.

---

## Task 1: Pré-reqs e capabilities check (sem código)

**Files:** nenhum — output são decisões registradas em `docs/canonical/decisions/`

- [ ] **Step 1: Verificar plano CF Workers atual + cron triggers limit**

Manual:
```bash
# 1. Login CF dashboard → Workers & Pages → ver plano (Free | Paid)
# 2. Free cap = 5 cron triggers por Worker. Hoje inkflow-cron tem 4.
# 3. Este plano adiciona 2 (audit-escalate, audit-cleanup) → total 6.
```

Decisão a registrar:
- Se **Paid (Bundled/Unbound)**: 30 triggers/Worker → OK, segue plano.
- Se **Free + 5 cap**: precisa upgrade OU criar Worker dedicado `inkflow-cron-audit`. Pausar plano e abrir issue de decisão.

Registrar em `docs/canonical/limits.md` seção CF Workers (`last_reviewed: 2026-04-27`).

- [ ] **Step 2: Verificar webhook Telegram conflito**

Substituir `<TOKEN>` pelo `TELEGRAM_BOT_TOKEN` real (Bitwarden):

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo" | jq .
```

Resposta tem campo `result.url`:
- **Vazio (`""`)** ou apontando pra `inkflowbrasil.com/api/audit/telegram-webhook`: OK, segue.
- **Outro endpoint** (n8n, etc): pausar plano, decidir merge OU bot dedicado pra audit. Registrar decisão em `docs/canonical/decisions/2026-04-27-telegram-webhook-strategy.md`.

- [ ] **Step 3: Coletar `TELEGRAM_ADMIN_USER_ID`**

Founder abre Telegram → busca `@userinfobot` → envia `/start` → bot responde com `Id: 123456789`.

Anotar valor em Bitwarden item "InkFlow Telegram Admin" (criar se não existir). Será cadastrado em CF Pages env na Task 11.

**Nota (spec §6.4):** se bot está em DM (caso atual), `TELEGRAM_ADMIN_USER_ID == TELEGRAM_CHAT_ID`. Confirmar visualmente.

- [ ] **Step 4: Smoke Routine (apenas registro — não bloqueia este plano)**

Routines do Sub-projeto 3 são auditores #3 e #4 — fora deste plano. Mas o spec §9.0 pede smoke test mínimo. Registrar como TODO em `docs/canonical/decisions/2026-04-27-routine-capability.md` (status: "pendente, validar antes de §9.4 do spec").

- [ ] **Step 5: Commit**

```bash
git add docs/canonical/limits.md docs/canonical/decisions/
git commit -m "docs(auditores): pré-reqs §9.0 validados — cron limit + telegram webhook + admin id"
```

---

## Task 2: Migration `audit_*` tables

**Files:**
- Create: `supabase/migrations/2026-04-27-create-audit-tables.sql`

- [ ] **Step 1: Escrever migration completa**

Conteúdo do arquivo (cravado a partir de §4 do spec):

```sql
-- Migration: create audit_events + audit_runs + audit_reports + view + RLS
-- Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §4
-- Purpose: storage do estado dos 5 auditores MVP (detect-only).

-- ── audit_events ───────────────────────────────────────────────────────────
CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  auditor TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warn','critical','resolved')),
  payload JSONB NOT NULL,
  evidence JSONB,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_alerted_at TIMESTAMPTZ,
  alert_count INT NOT NULL DEFAULT 1,
  superseded_by UUID REFERENCES audit_events(id),
  escalated_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_reason TEXT
);

CREATE INDEX audit_events_open_critical
  ON audit_events (severity, detected_at DESC)
  WHERE resolved_at IS NULL AND severity = 'critical';

CREATE INDEX audit_events_auditor_recent
  ON audit_events (auditor, detected_at DESC);

CREATE INDEX audit_events_open_by_auditor
  ON audit_events (auditor)
  WHERE resolved_at IS NULL;

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_events_admin_read ON audit_events
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'email' = 'lmf4200@gmail.com');

-- service_role bypassa RLS automaticamente — não precisa policy explícita.

COMMENT ON TABLE audit_events IS 'Eventos de detecção dos auditores. Distinto de approvals (Sub-projeto 5).';
COMMENT ON COLUMN audit_events.escalated_at IS 'Quando Pushover disparou (cron */5 critical sem ack >2h). Distinto de acknowledged_* (humano).';

-- ── audit_runs (heartbeat / liveness) ──────────────────────────────────────
CREATE TABLE audit_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auditor TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','error')),
  error_message TEXT,
  events_emitted INT NOT NULL DEFAULT 0
);

CREATE INDEX audit_runs_recent ON audit_runs (auditor, started_at DESC);

ALTER TABLE audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_runs_admin_read ON audit_runs
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'email' = 'lmf4200@gmail.com');

COMMENT ON TABLE audit_runs IS 'Liveness/heartbeat de cada execução. Sem essa tabela, auditor crashado silencioso não é detectado.';

-- ── audit_reports (relatório semanal materializado) ────────────────────────
CREATE TABLE audit_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE UNIQUE NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metrics JSONB NOT NULL,
  markdown TEXT NOT NULL
);

ALTER TABLE audit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_reports_admin_read ON audit_reports
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'email' = 'lmf4200@gmail.com');

COMMENT ON TABLE audit_reports IS 'Relatório semanal. Cron 0 12 * * 1 (segunda 09:00 BRT).';

-- ── view audit_current_state ───────────────────────────────────────────────
CREATE VIEW audit_current_state AS
SELECT DISTINCT ON (auditor)
  auditor, id AS event_id, severity, payload, evidence,
  detected_at, last_seen_at, last_alerted_at, alert_count,
  acknowledged_at, escalated_at
FROM audit_events
WHERE resolved_at IS NULL
ORDER BY auditor, detected_at DESC;

COMMENT ON VIEW audit_current_state IS 'Estado aberto por auditor (max 1 row). Usada pela política de dedupe (spec §6.2).';
```

- [ ] **Step 2: Aplicar via Supabase MCP**

Usar tool `mcp__plugin_supabase_supabase__apply_migration` com `name="2026-04-27-create-audit-tables"` e `query` = conteúdo do SQL acima.

Esperado: response `{ success: true }`.

- [ ] **Step 3: Verificar tabelas criadas**

Usar tool `mcp__plugin_supabase_supabase__execute_sql`:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'audit_%';
```

Esperado: 3 rows — `audit_events`, `audit_runs`, `audit_reports`.

```sql
SELECT viewname FROM pg_views WHERE viewname = 'audit_current_state';
```

Esperado: 1 row.

```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'audit_events' AND schemaname = 'public';
```

Esperado: 4 índices (PK + 3 criados).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-04-27-create-audit-tables.sql
git commit -m "feat(auditores): migration audit_events + audit_runs + audit_reports + view + RLS"
```

---

## Task 3: `audit-state.js` skeleton + fixtures

**Files:**
- Create: `functions/_lib/audit-state.js`
- Create: `tests/audit-state.test.mjs`

- [ ] **Step 1: Criar lib com 7 funções stub**

`functions/_lib/audit-state.js`:

```js
// ── InkFlow — audit-state lib ────────────────────────────────────────────────
// Helpers compartilhados pelos auditores. Spec: docs/superpowers/specs/
// 2026-04-27-auditores-mvp-design.md §6.1.
//
// Todas as funções que tocam Supabase recebem `supabase = { url, key }` (URL
// + service_role key). Fail-open onde aplicável (Telegram/Pushover): logam
// e retornam {ok:false}, nunca throw.

export const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

// ── Run lifecycle ───────────────────────────────────────────────────────────

export async function startRun(supabase, auditor) {
  throw new Error('not implemented');
}

export async function endRun(supabase, runId, { status, eventsEmitted, errorMessage }) {
  throw new Error('not implemented');
}

// ── Event state ─────────────────────────────────────────────────────────────

export async function getCurrentState(supabase, auditor) {
  throw new Error('not implemented');
}

export async function insertEvent(supabase, evt) {
  throw new Error('not implemented');
}

// ── Dedupe policy (pure) ────────────────────────────────────────────────────

export function dedupePolicy(current, next, { now = Date.now() } = {}) {
  throw new Error('not implemented');
}

// ── Outbound alerts ─────────────────────────────────────────────────────────

export async function sendTelegram(env, event) {
  throw new Error('not implemented');
}

export async function sendPushover(env, event) {
  throw new Error('not implemented');
}
```

- [ ] **Step 2: Criar fixtures base no test file**

`tests/audit-state.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startRun,
  endRun,
  getCurrentState,
  insertEvent,
  dedupePolicy,
  sendTelegram,
  sendPushover,
} from '../functions/_lib/audit-state.js';

// Fixtures —————————————————————————————————————————————————————————————————

export const FIXTURE_SUPABASE = { url: 'https://test.supabase.co', key: 'service-key' };

export const FIXTURE_EVENT_WARN = {
  id: 'a3f1b9c2-1111-2222-3333-444455556666',
  run_id: 'r1',
  auditor: 'key-expiry',
  severity: 'warn',
  payload: { runbook_path: 'docs/canonical/runbooks/secrets-expired.md', summary: 'CF token expira em 10d' },
  evidence: { source: 'ttl' },
  detected_at: '2026-04-27T03:00:00Z',
  last_seen_at: '2026-04-27T03:00:00Z',
  last_alerted_at: '2026-04-27T03:00:00Z',
  alert_count: 1,
  acknowledged_at: null,
  escalated_at: null,
  resolved_at: null,
};

export const FIXTURE_EVENT_CRITICAL = {
  ...FIXTURE_EVENT_WARN,
  id: 'b4e2cad3-aaaa-bbbb-cccc-dddd11112222',
  severity: 'critical',
  payload: { ...FIXTURE_EVENT_WARN.payload, summary: 'CF token expirou' },
};

export const FIXTURE_ENV = {
  TELEGRAM_BOT_TOKEN: 'tg-token',
  TELEGRAM_CHAT_ID: '999',
  PUSHOVER_APP_TOKEN: 'po-app',
  PUSHOVER_USER_KEY: 'po-user',
};

// Smoke: módulo importa sem crashar
test('module exports 7 named functions', () => {
  assert.equal(typeof startRun, 'function');
  assert.equal(typeof endRun, 'function');
  assert.equal(typeof getCurrentState, 'function');
  assert.equal(typeof insertEvent, 'function');
  assert.equal(typeof dedupePolicy, 'function');
  assert.equal(typeof sendTelegram, 'function');
  assert.equal(typeof sendPushover, 'function');
});
```

- [ ] **Step 3: Rodar smoke test**

```bash
node --test tests/audit-state.test.mjs
```

Expected: 1 PASS (smoke export check).

- [ ] **Step 4: Commit**

```bash
git add functions/_lib/audit-state.js tests/audit-state.test.mjs
git commit -m "feat(auditores): scaffold audit-state lib (skeleton + fixtures)"
```

---

## Task 4: `dedupePolicy` (função pura) — TDD

**Files:**
- Modify: `functions/_lib/audit-state.js` (implementa `dedupePolicy`)
- Modify: `tests/audit-state.test.mjs` (adiciona 7 casos)

- [ ] **Step 1: Escrever 7 testes (cobrir tabela §6.2)**

Adicionar ao final de `tests/audit-state.test.mjs`:

```js
// dedupePolicy — 7 cases da tabela §6.2 do spec ——————————————————————————————

const HOUR = 3600 * 1000;
const NOW = new Date('2026-04-27T12:00:00Z').getTime();

test('dedupe: current vazio + new warn → fire', () => {
  const action = dedupePolicy(null, { severity: 'warn' }, { now: NOW });
  assert.equal(action, 'fire');
});

test('dedupe: current vazio + new critical → fire', () => {
  const action = dedupePolicy(null, { severity: 'critical' }, { now: NOW });
  assert.equal(action, 'fire');
});

test('dedupe: same severity + last_alerted_at <24h → silent', () => {
  const current = { severity: 'warn', last_alerted_at: new Date(NOW - 5 * HOUR).toISOString() };
  const action = dedupePolicy(current, { severity: 'warn' }, { now: NOW });
  assert.equal(action, 'silent');
});

test('dedupe: same severity + last_alerted_at >=24h → fire (lembrete)', () => {
  const current = { severity: 'warn', last_alerted_at: new Date(NOW - 25 * HOUR).toISOString() };
  const action = dedupePolicy(current, { severity: 'warn' }, { now: NOW });
  assert.equal(action, 'fire');
});

test('dedupe: warn → critical → supersede', () => {
  const current = { severity: 'warn', last_alerted_at: new Date(NOW - HOUR).toISOString() };
  const action = dedupePolicy(current, { severity: 'critical' }, { now: NOW });
  assert.equal(action, 'supersede');
});

test('dedupe: critical → warn → silent (não rebaixa)', () => {
  const current = { severity: 'critical', last_alerted_at: new Date(NOW - HOUR).toISOString() };
  const action = dedupePolicy(current, { severity: 'warn' }, { now: NOW });
  assert.equal(action, 'silent');
});

test('dedupe: current existe + next clean → resolve', () => {
  const current = { severity: 'warn', last_alerted_at: new Date(NOW - HOUR).toISOString() };
  const action = dedupePolicy(current, { severity: 'clean' }, { now: NOW });
  assert.equal(action, 'resolve');
});

test('dedupe: current vazio + next clean → no-op', () => {
  const action = dedupePolicy(null, { severity: 'clean' }, { now: NOW });
  assert.equal(action, 'no-op');
});
```

- [ ] **Step 2: Rodar — todos devem FALHAR com "not implemented"**

```bash
node --test tests/audit-state.test.mjs
```

Expected: 8 fails (export smoke passa, 7 cases pra dedupePolicy explodem).

- [ ] **Step 3: Implementar `dedupePolicy`**

Substituir o stub em `functions/_lib/audit-state.js`:

```js
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function dedupePolicy(current, next, { now = Date.now() } = {}) {
  const isOpen = (s) => s === 'warn' || s === 'critical';
  const isClean = (s) => s === 'clean';

  // current vazio
  if (!current) {
    if (isOpen(next.severity)) return 'fire';
    if (isClean(next.severity)) return 'no-op';
    return 'no-op';
  }

  // current existe + next clean
  if (isClean(next.severity)) return 'resolve';

  // escalation warn → critical
  if (current.severity === 'warn' && next.severity === 'critical') return 'supersede';

  // não rebaixa (critical → warn não auto-resolve)
  if (current.severity === 'critical' && next.severity === 'warn') return 'silent';

  // mesma severity — decide por janela 24h
  if (current.severity === next.severity) {
    const lastAlert = current.last_alerted_at ? new Date(current.last_alerted_at).getTime() : 0;
    const elapsed = now - lastAlert;
    return elapsed >= TWENTY_FOUR_HOURS_MS ? 'fire' : 'silent';
  }

  return 'silent';
}
```

- [ ] **Step 4: Rodar — todos devem PASSAR**

```bash
node --test tests/audit-state.test.mjs
```

Expected: 9 PASS (1 smoke + 8 dedupe).

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/audit-state.js tests/audit-state.test.mjs
git commit -m "feat(auditores): dedupePolicy (pura) cobrindo 8 casos do spec §6.2"
```

---

## Task 5: `startRun` + `endRun` + `insertEvent` + `getCurrentState`

**Files:**
- Modify: `functions/_lib/audit-state.js`
- Modify: `tests/audit-state.test.mjs`

- [ ] **Step 1: Escrever testes com fetch mock (pattern dos tests existentes)**

Adicionar ao `tests/audit-state.test.mjs`:

```js
// Supabase REST helpers — mock fetch ————————————————————————————————————————

function makeFetchMock(responses) {
  // responses: array of { match: (url, opts) => bool, response: { status, json } }
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body });
    const handler = responses.find((r) => r.match(String(url), opts));
    if (!handler) throw new Error(`unmocked fetch: ${url}`);
    return {
      ok: handler.response.status < 400,
      status: handler.response.status,
      json: async () => handler.response.json,
      text: async () => JSON.stringify(handler.response.json),
    };
  };
  return { calls };
}

test('startRun INSERTs row in audit_runs and returns id', async () => {
  const mock = makeFetchMock([
    {
      match: (url, o) => url.includes('/rest/v1/audit_runs') && o.method === 'POST',
      response: { status: 201, json: [{ id: 'run-uuid-1' }] },
    },
  ]);
  const runId = await startRun(FIXTURE_SUPABASE, 'key-expiry');
  assert.equal(runId, 'run-uuid-1');
  assert.equal(mock.calls.length, 1);
  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.auditor, 'key-expiry');
  assert.equal(body.status, 'running');
});

test('endRun PATCHes audit_runs with status=success', async () => {
  const mock = makeFetchMock([
    {
      match: (url, o) => url.includes('/rest/v1/audit_runs') && o.method === 'PATCH',
      response: { status: 204, json: null },
    },
  ]);
  await endRun(FIXTURE_SUPABASE, 'run-uuid-1', { status: 'success', eventsEmitted: 2 });
  assert.equal(mock.calls.length, 1);
  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.status, 'success');
  assert.equal(body.events_emitted, 2);
  assert.ok(body.completed_at, 'completed_at should be set');
});

test('endRun PATCHes audit_runs with status=error and message', async () => {
  const mock = makeFetchMock([
    {
      match: (url, o) => url.includes('/rest/v1/audit_runs') && o.method === 'PATCH',
      response: { status: 204, json: null },
    },
  ]);
  await endRun(FIXTURE_SUPABASE, 'run-uuid-1', { status: 'error', errorMessage: 'boom' });
  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.status, 'error');
  assert.equal(body.error_message, 'boom');
});

test('getCurrentState returns row from audit_current_state view', async () => {
  const mock = makeFetchMock([
    {
      match: (url) => url.includes('/rest/v1/audit_current_state'),
      response: { status: 200, json: [{ auditor: 'key-expiry', severity: 'warn', event_id: 'e1' }] },
    },
  ]);
  const state = await getCurrentState(FIXTURE_SUPABASE, 'key-expiry');
  assert.equal(state.severity, 'warn');
  assert.equal(state.event_id, 'e1');
});

test('getCurrentState returns null when no open event', async () => {
  makeFetchMock([
    { match: (url) => url.includes('/rest/v1/audit_current_state'), response: { status: 200, json: [] } },
  ]);
  const state = await getCurrentState(FIXTURE_SUPABASE, 'key-expiry');
  assert.equal(state, null);
});

test('insertEvent POSTs to audit_events and returns inserted row', async () => {
  const mock = makeFetchMock([
    {
      match: (url, o) => url.includes('/rest/v1/audit_events') && o.method === 'POST',
      response: { status: 201, json: [{ id: 'evt-1', ...FIXTURE_EVENT_WARN }] },
    },
  ]);
  const inserted = await insertEvent(FIXTURE_SUPABASE, {
    run_id: 'r1', auditor: 'key-expiry', severity: 'warn',
    payload: { summary: 'x' }, evidence: null,
  });
  assert.equal(inserted.id, 'evt-1');
  assert.equal(mock.calls.length, 1);
});
```

- [ ] **Step 2: Rodar — devem falhar**

```bash
node --test tests/audit-state.test.mjs
```

Expected: 6 fails novos.

- [ ] **Step 3: Implementar 4 funções**

Substituir os stubs em `functions/_lib/audit-state.js`:

```js
function sbHeaders(supabase, extra = {}) {
  return {
    apikey: supabase.key,
    Authorization: `Bearer ${supabase.key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export async function startRun(supabase, auditor) {
  const res = await fetch(`${supabase.url}/rest/v1/audit_runs`, {
    method: 'POST',
    headers: sbHeaders(supabase, { Prefer: 'return=representation' }),
    body: JSON.stringify({ auditor, status: 'running' }),
  });
  if (!res.ok) throw new Error(`startRun failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows[0].id;
}

export async function endRun(supabase, runId, { status, eventsEmitted = 0, errorMessage = null }) {
  const patch = { status, completed_at: new Date().toISOString(), events_emitted: eventsEmitted };
  if (errorMessage) patch.error_message = errorMessage;
  const res = await fetch(`${supabase.url}/rest/v1/audit_runs?id=eq.${runId}`, {
    method: 'PATCH',
    headers: sbHeaders(supabase),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`endRun failed: ${res.status} ${await res.text()}`);
}

export async function getCurrentState(supabase, auditor) {
  const url = `${supabase.url}/rest/v1/audit_current_state?auditor=eq.${encodeURIComponent(auditor)}&limit=1`;
  const res = await fetch(url, { headers: sbHeaders(supabase) });
  if (!res.ok) throw new Error(`getCurrentState failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows.length === 0 ? null : rows[0];
}

export async function insertEvent(supabase, evt) {
  const res = await fetch(`${supabase.url}/rest/v1/audit_events`, {
    method: 'POST',
    headers: sbHeaders(supabase, { Prefer: 'return=representation' }),
    body: JSON.stringify(evt),
  });
  if (!res.ok) throw new Error(`insertEvent failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows[0];
}
```

- [ ] **Step 4: Rodar — todos devem passar**

```bash
node --test tests/audit-state.test.mjs
```

Expected: 15 PASS (1 smoke + 8 dedupe + 6 novos).

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/audit-state.js tests/audit-state.test.mjs
git commit -m "feat(auditores): startRun/endRun/getCurrentState/insertEvent contra Supabase REST"
```

---

## Task 6: `sendTelegram` + `sendPushover`

**Files:**
- Modify: `functions/_lib/audit-state.js`
- Modify: `tests/audit-state.test.mjs`

- [ ] **Step 1: Escrever testes**

Adicionar ao test:

```js
// sendTelegram + sendPushover ————————————————————————————————————————————————

test('sendTelegram formats event per spec §6.3 and POSTs to bot API', async () => {
  let captured = null;
  globalThis.fetch = async (url, opts) => { captured = { url, opts }; return { ok: true }; };
  const evt = {
    ...FIXTURE_EVENT_WARN,
    payload: {
      runbook_path: 'docs/canonical/runbooks/secrets-expired.md',
      suggested_subagent: 'deploy-engineer',
      summary: 'CF token expira em 5 dias',
    },
  };
  const res = await sendTelegram(FIXTURE_ENV, evt);
  assert.equal(res.ok, true);
  assert.match(captured.url, /api\.telegram\.org\/bottg-token\/sendMessage/);
  const body = JSON.parse(captured.opts.body);
  assert.equal(body.chat_id, '999');
  assert.match(body.text, /\[warn\] \[key-expiry\]/);
  assert.match(body.text, /CF token expira em 5 dias/);
  assert.match(body.text, /ID: a3f1b9c2/); // event_id_short
  assert.match(body.text, /Runbook: secrets-expired\.md/);
  assert.match(body.text, /Suggested: @deploy-engineer/);
  assert.match(body.text, /Reply "ack a3f1b9c2"/);
});

test('sendTelegram omits Suggested line when suggested_subagent is null', async () => {
  let captured = null;
  globalThis.fetch = async (url, opts) => { captured = { url, opts }; return { ok: true }; };
  const evt = {
    ...FIXTURE_EVENT_WARN,
    payload: { runbook_path: 'docs/canonical/runbooks/x.md', suggested_subagent: null, summary: 's' },
  };
  await sendTelegram(FIXTURE_ENV, evt);
  const body = JSON.parse(captured.opts.body);
  assert.doesNotMatch(body.text, /Suggested:/);
});

test('sendTelegram returns skipped when env missing', async () => {
  const res = await sendTelegram({}, FIXTURE_EVENT_WARN);
  assert.equal(res.ok, false);
  assert.equal(res.skipped, true);
});

test('sendPushover POSTs priority=2 retry=60 expire=1800', async () => {
  let captured = null;
  globalThis.fetch = async (url, opts) => { captured = { url, opts }; return { ok: true }; };
  const res = await sendPushover(FIXTURE_ENV, FIXTURE_EVENT_CRITICAL);
  assert.equal(res.ok, true);
  assert.match(captured.url, /api\.pushover\.net.*messages/);
  const body = captured.opts.body;
  assert.match(body, /priority=2/);
  assert.match(body, /retry=60/);
  assert.match(body, /expire=1800/);
  assert.match(body, /token=po-app/);
  assert.match(body, /user=po-user/);
});

test('sendPushover returns skipped when env missing', async () => {
  const res = await sendPushover({}, FIXTURE_EVENT_CRITICAL);
  assert.equal(res.ok, false);
  assert.equal(res.skipped, true);
});

test('sendTelegram fail-open when fetch throws', async () => {
  globalThis.fetch = async () => { throw new Error('network'); };
  const res = await sendTelegram(FIXTURE_ENV, FIXTURE_EVENT_WARN);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'network');
});
```

- [ ] **Step 2: Rodar — devem falhar**

```bash
node --test tests/audit-state.test.mjs
```

Expected: 6 fails novos.

- [ ] **Step 3: Implementar `sendTelegram` + `sendPushover`**

Em `functions/_lib/audit-state.js`:

```js
import { basename } from 'node:path';

function eventIdShort(uuid) {
  return uuid.slice(0, 8);
}

function formatTelegramText(event) {
  const p = event.payload || {};
  const idShort = eventIdShort(event.id);
  const runbookFile = p.runbook_path ? basename(p.runbook_path) : 'none';
  const evidenceShort = event.evidence
    ? JSON.stringify(event.evidence).slice(0, 120)
    : 'n/a';

  const lines = [
    `[${event.severity}] [${event.auditor}] ${p.summary || '(sem summary)'}`,
    `ID: ${idShort} | Runbook: ${runbookFile}`,
  ];
  if (p.suggested_subagent) {
    lines.push(`Suggested: @${p.suggested_subagent}`);
  }
  lines.push(`Evidence: ${evidenceShort}`);
  lines.push(`Reply "ack ${idShort}" pra acknowledge.`);

  return lines.join('\n');
}

export async function sendTelegram(env, event) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('audit: TELEGRAM_* ausente, alerta não enviado');
    return { ok: false, skipped: true };
  }
  try {
    const text = formatTelegramText(event);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok };
  } catch (e) {
    console.error('audit: Telegram send failed:', e.message);
    return { ok: false, error: e.message };
  }
}

export async function sendPushover(env, event) {
  const token = env.PUSHOVER_APP_TOKEN;
  const user = env.PUSHOVER_USER_KEY;
  if (!token || !user) {
    console.warn('audit: PUSHOVER_* ausente, escalation não enviado');
    return { ok: false, skipped: true };
  }
  try {
    const p = event.payload || {};
    const idShort = eventIdShort(event.id);
    const params = new URLSearchParams({
      token, user,
      title: `[CRITICAL ESCALATION] ${event.auditor}`,
      message: `${p.summary || ''} (id: ${idShort}). Sem ack >2h.`,
      priority: '2',
      retry: '60',
      expire: '1800',
    });
    const res = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok };
  } catch (e) {
    console.error('audit: Pushover send failed:', e.message);
    return { ok: false, error: e.message };
  }
}
```

**Nota:** `node:path` é built-in e o Workers runtime tem suporte. Se houver problema em runtime CF Pages Functions, substituir por `runbook_path.split('/').pop()` inline.

- [ ] **Step 4: Rodar — todos passam**

```bash
node --test tests/audit-state.test.mjs
```

Expected: 21 PASS (1 + 8 + 6 + 6).

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/audit-state.js tests/audit-state.test.mjs
git commit -m "feat(auditores): sendTelegram (format §6.3) + sendPushover (priority=2)"
```

---

## Task 7: Endpoint `/api/audit/telegram-webhook` (ack flow)

**Files:**
- Create: `functions/api/audit/telegram-webhook.js`
- Create: `tests/audit-telegram-webhook.test.mjs`

- [ ] **Step 1: Escrever testes**

`tests/audit-telegram-webhook.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/audit/telegram-webhook.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

function makeRequest({ method = 'POST', secretHeader, body }) {
  const headers = { 'Content-Type': 'application/json' };
  if (secretHeader !== undefined) headers['X-Telegram-Bot-Api-Secret-Token'] = secretHeader;
  return new Request('https://example.com/api/audit/telegram-webhook', {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
}

const ENV = {
  SUPABASE_SERVICE_KEY: 'service-key',
  TELEGRAM_WEBHOOK_SECRET: 'whsec',
  TELEGRAM_ADMIN_USER_ID: '12345',
  TELEGRAM_BOT_TOKEN: 'tg-token',
  TELEGRAM_CHAT_ID: '12345',
};

test('returns 405 on GET', async () => {
  const res = await onRequest({ request: makeRequest({ method: 'GET' }), env: ENV });
  assert.equal(res.status, 405);
});

test('returns 401 when X-Telegram-Bot-Api-Secret-Token mismatch', async () => {
  const req = makeRequest({ secretHeader: 'wrong', body: { message: {} } });
  const res = await onRequest({ request: req, env: ENV });
  assert.equal(res.status, 401);
});

test('returns 200 noop when message.from.id is not admin', async () => {
  globalThis.fetch = async () => { throw new Error('should not be called'); };
  const req = makeRequest({
    secretHeader: 'whsec',
    body: { message: { from: { id: 99999 }, text: 'ack a3f1b9c2' } },
  });
  const res = await onRequest({ request: req, env: ENV });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.skipped, 'not_admin');
});

test('returns 200 noop when text does not start with "ack "', async () => {
  globalThis.fetch = async () => { throw new Error('should not be called'); };
  const req = makeRequest({
    secretHeader: 'whsec',
    body: { message: { from: { id: 12345 }, text: 'oi' } },
  });
  const res = await onRequest({ request: req, env: ENV });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.skipped, 'not_ack');
});

test('ack <id_short> resolves UUID, PATCHes acknowledged_*, sends confirmation', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body });
    if (String(url).includes('/rest/v1/audit_events') && (opts.method || 'GET') === 'GET') {
      return { ok: true, status: 200, json: async () => [{
        id: 'a3f1b9c2-1111-2222-3333-444455556666',
        auditor: 'key-expiry', severity: 'warn',
      }] };
    }
    if (String(url).includes('/rest/v1/audit_events') && opts.method === 'PATCH') {
      return { ok: true, status: 204 };
    }
    if (String(url).includes('api.telegram.org')) {
      return { ok: true, status: 200 };
    }
    throw new Error(`unmocked: ${url}`);
  };
  const req = makeRequest({
    secretHeader: 'whsec',
    body: { message: { from: { id: 12345 }, text: 'ack a3f1b9c2' } },
  });
  const res = await onRequest({ request: req, env: ENV });
  assert.equal(res.status, 200);
  const patchCall = calls.find((c) => c.method === 'PATCH');
  assert.ok(patchCall, 'PATCH happened');
  const patchBody = JSON.parse(patchCall.body);
  assert.ok(patchBody.acknowledged_at);
  assert.equal(patchBody.acknowledged_by, '12345');
});

test('ack with unknown id_short returns 200 with not_found', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('/rest/v1/audit_events')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (String(url).includes('api.telegram.org')) return { ok: true };
    throw new Error('unmocked');
  };
  const req = makeRequest({
    secretHeader: 'whsec',
    body: { message: { from: { id: 12345 }, text: 'ack deadbeef' } },
  });
  const res = await onRequest({ request: req, env: ENV });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.skipped, 'not_found');
});
```

- [ ] **Step 2: Rodar — falham (módulo não existe)**

```bash
node --test tests/audit-telegram-webhook.test.mjs
```

Expected: import error.

- [ ] **Step 3: Implementar endpoint**

`functions/api/audit/telegram-webhook.js`:

```js
// ── InkFlow — Audit Telegram webhook (ack flow) ──────────────────────────────
// Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §6.4.
// Bot Telegram chama POST aqui com update; auth dupla:
//   1. Header X-Telegram-Bot-Api-Secret-Token == TELEGRAM_WEBHOOK_SECRET
//   2. message.from.id == TELEGRAM_ADMIN_USER_ID
// Parsea "ack <id_short>" → resolve UUID via prefix → PATCH acknowledged_*.

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function sendBotConfirmation(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.error('telegram-webhook: confirmation send failed:', e.message);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Auth #1: secret header (definido no setWebhook)
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!env.TELEGRAM_WEBHOOK_SECRET || secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return json({ error: 'unauthorized' }, 401);
  }

  let update;
  try { update = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }

  const msg = update?.message;
  if (!msg || !msg.text) return json({ skipped: 'no_text' });

  // Auth #2: admin whitelist
  const fromId = String(msg.from?.id || '');
  if (fromId !== String(env.TELEGRAM_ADMIN_USER_ID)) {
    console.warn(`telegram-webhook: non-admin from.id=${fromId}, ignorando`);
    return json({ skipped: 'not_admin' });
  }

  const text = msg.text.trim();
  if (!text.toLowerCase().startsWith('ack ')) return json({ skipped: 'not_ack' });

  const idShort = text.slice(4).trim().split(/\s+/)[0];
  if (!/^[0-9a-f]{8}$/i.test(idShort)) return json({ skipped: 'invalid_id' });

  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return json({ error: 'config_missing' }, 503);

  const sbHeaders = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
  };

  // Resolver UUID por prefix (apenas eventos abertos pra evitar colisão histórica)
  const lookupUrl = `${SUPABASE_URL}/rest/v1/audit_events?id=like.${idShort}*&resolved_at=is.null&select=id,auditor,severity&limit=2`;
  const lookupRes = await fetch(lookupUrl, { headers: sbHeaders });
  if (!lookupRes.ok) {
    console.error('telegram-webhook: lookup failed:', lookupRes.status);
    return json({ error: 'lookup_failed' }, 502);
  }
  const matches = await lookupRes.json();

  if (matches.length === 0) {
    await sendBotConfirmation(env, `❌ ack ${idShort}: evento não encontrado (já resolvido?)`);
    return json({ skipped: 'not_found' });
  }
  if (matches.length > 1) {
    await sendBotConfirmation(env, `⚠️ ack ${idShort}: ambíguo (${matches.length} matches). Use ID mais longo.`);
    return json({ skipped: 'ambiguous' });
  }

  const event = matches[0];
  const patchUrl = `${SUPABASE_URL}/rest/v1/audit_events?id=eq.${event.id}`;
  const patchRes = await fetch(patchUrl, {
    method: 'PATCH',
    headers: sbHeaders,
    body: JSON.stringify({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: fromId,
    }),
  });
  if (!patchRes.ok) {
    console.error('telegram-webhook: patch failed:', patchRes.status);
    return json({ error: 'patch_failed' }, 502);
  }

  await sendBotConfirmation(env, `✅ Acknowledged: ${event.auditor} ${event.severity}`);
  return json({ ok: true, event_id: event.id });
}
```

- [ ] **Step 4: Rodar — todos passam**

```bash
node --test tests/audit-telegram-webhook.test.mjs
```

Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/api/audit/telegram-webhook.js tests/audit-telegram-webhook.test.mjs
git commit -m "feat(auditores): /api/audit/telegram-webhook ack flow (§6.4)"
```

---

## Task 8: Endpoint `/api/cron/audit-escalate`

**Files:**
- Create: `functions/api/cron/audit-escalate.js`
- Create: `tests/audit-escalate.test.mjs`

- [ ] **Step 1: Escrever testes**

`tests/audit-escalate.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/cron/audit-escalate.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const ENV = {
  CRON_SECRET: 'cron-secret',
  SUPABASE_SERVICE_KEY: 'sb-key',
  PUSHOVER_APP_TOKEN: 'po-app',
  PUSHOVER_USER_KEY: 'po-user',
};

function reqAuthed(body) {
  return new Request('https://x/api/cron/audit-escalate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cron-secret' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test('401 sem CRON_SECRET match', async () => {
  const req = new Request('https://x/api/cron/audit-escalate', {
    method: 'POST', headers: { Authorization: 'Bearer wrong' },
  });
  const res = await onRequest({ request: req, env: ENV });
  assert.equal(res.status, 401);
});

test('escalates each row: Pushover send + PATCH escalated_at', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body });
    if (String(url).includes('/rest/v1/audit_events') && (opts.method || 'GET') === 'GET') {
      return { ok: true, status: 200, json: async () => [
        { id: 'evt1', auditor: 'key-expiry', payload: { summary: 's1' } },
        { id: 'evt2', auditor: 'deploy-health', payload: { summary: 's2' } },
      ]};
    }
    if (String(url).includes('api.pushover.net')) return { ok: true, status: 200 };
    if (String(url).includes('/rest/v1/audit_events') && opts.method === 'PATCH') {
      return { ok: true, status: 204 };
    }
    throw new Error(`unmocked: ${url}`);
  };
  const res = await onRequest({ request: reqAuthed(), env: ENV });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.escalated_count, 2);
  const patches = calls.filter((c) => c.method === 'PATCH');
  assert.equal(patches.length, 2);
  patches.forEach((p) => assert.match(p.body, /escalated_at/));
});

test('returns 0 when no critical sem ack >2h', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('/rest/v1/audit_events')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    throw new Error('unmocked');
  };
  const res = await onRequest({ request: reqAuthed(), env: ENV });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.escalated_count, 0);
});
```

- [ ] **Step 2: Implementar endpoint**

`functions/api/cron/audit-escalate.js`:

```js
// ── InkFlow — Cron: audit escalation (§6.5) ─────────────────────────────────
// Cron */5 * * * * → SELECT critical sem ack >2h → Pushover priority=2 +
// PATCH escalated_at. Coluna dedicada (não confunde com ack humano em
// acknowledged_*).

import { sendPushover } from '../../_lib/audit-state.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!env.CRON_SECRET || token !== env.CRON_SECRET) return json({ error: 'unauthorized' }, 401);

  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return json({ error: 'config_missing' }, 503);

  const sbHeaders = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
  };

  // detected_at < now() - 2h, severity=critical, sem ack, sem escalation, sem resolved
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const url = `${SUPABASE_URL}/rest/v1/audit_events`
    + `?severity=eq.critical`
    + `&resolved_at=is.null`
    + `&acknowledged_at=is.null`
    + `&escalated_at=is.null`
    + `&detected_at=lt.${cutoff}`
    + `&select=id,auditor,payload,evidence,severity,detected_at`;

  const queryRes = await fetch(url, { headers: sbHeaders });
  if (!queryRes.ok) {
    console.error('audit-escalate: query failed:', queryRes.status);
    return json({ error: 'query_failed' }, 502);
  }
  const rows = await queryRes.json();

  let escalated = 0;
  for (const evt of rows) {
    const result = await sendPushover(env, evt);
    if (!result.ok) {
      console.error(`audit-escalate: pushover failed for ${evt.id}:`, result.error || result.skipped);
      continue;
    }
    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/audit_events?id=eq.${evt.id}`, {
      method: 'PATCH',
      headers: sbHeaders,
      body: JSON.stringify({ escalated_at: new Date().toISOString() }),
    });
    if (patchRes.ok) escalated += 1;
  }

  return json({ ok: true, escalated_count: escalated, candidates: rows.length });
}
```

- [ ] **Step 3: Rodar testes**

```bash
node --test tests/audit-escalate.test.mjs
```

Expected: 3 PASS.

- [ ] **Step 4: Commit**

```bash
git add functions/api/cron/audit-escalate.js tests/audit-escalate.test.mjs
git commit -m "feat(auditores): /api/cron/audit-escalate Pushover escalation (§6.5)"
```

---

## Task 9: Endpoint `/api/cron/audit-cleanup`

**Files:**
- Create: `functions/api/cron/audit-cleanup.js`
- Create: `tests/audit-cleanup.test.mjs`

- [ ] **Step 1: Escrever testes**

`tests/audit-cleanup.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/cron/audit-cleanup.js';

const ENV = { CRON_SECRET: 'cs', SUPABASE_SERVICE_KEY: 'sb' };

function reqAuthed() {
  return new Request('https://x/api/cron/audit-cleanup', {
    method: 'POST', headers: { Authorization: 'Bearer cs' },
  });
}

test('401 sem CRON_SECRET', async () => {
  const req = new Request('https://x/api/cron/audit-cleanup', {
    method: 'POST', headers: { Authorization: 'Bearer wrong' },
  });
  const res = await onRequest({ request: req, env: ENV });
  assert.equal(res.status, 401);
});

test('DELETEs audit_events resolved >90d e audit_runs >30d', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: opts.method || 'GET' });
    return { ok: true, status: 204 };
  };
  const res = await onRequest({ request: reqAuthed(), env: ENV });
  assert.equal(res.status, 200);
  const deletes = calls.filter((c) => c.method === 'DELETE');
  assert.equal(deletes.length, 2);
  assert.ok(deletes.some((c) => c.url.includes('audit_events')));
  assert.ok(deletes.some((c) => c.url.includes('audit_runs')));
});
```

- [ ] **Step 2: Implementar endpoint**

`functions/api/cron/audit-cleanup.js`:

```js
// ── InkFlow — Cron: audit cleanup (§6.6) ────────────────────────────────────
// Cron 0 4 * * 1 (segunda 01:00 BRT) — DELETE audit_events resolved >90d e
// audit_runs >30d.

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!env.CRON_SECRET || token !== env.CRON_SECRET) return json({ error: 'unauthorized' }, 401);

  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return json({ error: 'config_missing' }, 503);

  const sbHeaders = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
  };

  const eventsCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const runsCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const eventsUrl = `${SUPABASE_URL}/rest/v1/audit_events`
    + `?resolved_at=not.is.null&resolved_at=lt.${eventsCutoff}`;
  const runsUrl = `${SUPABASE_URL}/rest/v1/audit_runs?started_at=lt.${runsCutoff}`;

  const [eventsRes, runsRes] = await Promise.all([
    fetch(eventsUrl, { method: 'DELETE', headers: sbHeaders }),
    fetch(runsUrl, { method: 'DELETE', headers: sbHeaders }),
  ]);

  return json({
    ok: true,
    events_deleted: eventsRes.ok,
    runs_deleted: runsRes.ok,
    events_status: eventsRes.status,
    runs_status: runsRes.status,
  });
}
```

- [ ] **Step 3: Rodar testes**

```bash
node --test tests/audit-cleanup.test.mjs
```

Expected: 2 PASS.

- [ ] **Step 4: Commit**

```bash
git add functions/api/cron/audit-cleanup.js tests/audit-cleanup.test.mjs
git commit -m "feat(auditores): /api/cron/audit-cleanup DELETE old rows (§6.6)"
```

---

## Task 10: Wire-up cron-worker (escalate + cleanup triggers)

**Files:**
- Modify: `cron-worker/wrangler.toml`
- Modify: `cron-worker/src/index.js`

- [ ] **Step 1: Adicionar 2 triggers em `wrangler.toml`**

Editar `cron-worker/wrangler.toml`, adicionar dentro do array `crons`:

```toml
[triggers]
crons = [
  "0 12 * * *",     # 09:00 BRT diario → /api/cron/expira-trial
  "0 2 * * *",      # 23:00 BRT diario → /api/cleanup-tenants
  "0 9 * * *",      # 06:00 BRT diario → /api/cron/reset-agendamentos
  "*/30 * * * *",   # a cada 30min     → /api/cron/monitor-whatsapp
  "*/5 * * * *",    # a cada 5min      → /api/cron/audit-escalate
  "0 4 * * 1",      # seg 01:00 BRT    → /api/cron/audit-cleanup
]
```

**Pré-cheque (Task 1 §9.0):** total = 6 triggers. Se plano CF Free com cap 5 → bloqueado, voltar à Task 1 e decidir Worker dedicado.

- [ ] **Step 2: Adicionar 2 entries em `SCHEDULE_MAP`**

Em `cron-worker/src/index.js`, no objeto `SCHEDULE_MAP`:

```js
const SCHEDULE_MAP = {
  '0 12 * * *':   { path: '/api/cron/expira-trial',       secretEnv: 'CRON_SECRET', label: 'expira-trial' },
  '0 2 * * *':    { path: '/api/cleanup-tenants',         secretEnv: 'CRON_SECRET', label: 'cleanup-tenants' },
  '0 9 * * *':    { path: '/api/cron/reset-agendamentos', secretEnv: 'CRON_SECRET', label: 'reset-agendamentos' },
  '*/30 * * * *': { path: '/api/cron/monitor-whatsapp',   secretEnv: 'CRON_SECRET', label: 'monitor-whatsapp' },
  '*/5 * * * *':  { path: '/api/cron/audit-escalate',     secretEnv: 'CRON_SECRET', label: 'audit-escalate' },
  '0 4 * * 1':    { path: '/api/cron/audit-cleanup',      secretEnv: 'CRON_SECRET', label: 'audit-cleanup' },
};
```

- [ ] **Step 3: Deploy do Worker**

```bash
cd cron-worker && npx wrangler deploy
```

Expected: deploy success, log mostra "Cron Triggers updated" listando 6 expressions.

- [ ] **Step 4: Smoke manual dos novos endpoints via cron-worker fetch handler**

```bash
# Substituir <CRON_SECRET> pelo valor real (Bitwarden)
curl -X POST "https://inkflow-cron.<account>.workers.dev/?cron=*/5+*+*+*+*" \
     -H "Authorization: Bearer <CRON_SECRET>"
# Expected: { ok: true, label: "audit-escalate", elapsedMs: ..., response: '{"ok":true,"escalated_count":0,"candidates":0}' }

curl -X POST "https://inkflow-cron.<account>.workers.dev/?cron=0+4+*+*+1" \
     -H "Authorization: Bearer <CRON_SECRET>"
# Expected: { ok: true, label: "audit-cleanup", ... }
```

⚠️ **Pré-req:** os 2 endpoints já estão deployados em CF Pages após o próximo `git push origin main` (deploy automático via GHA `.github/workflows/deploy.yml`). Garantir que o push aconteceu antes deste step (Task 11 cobre o push).

- [ ] **Step 5: Commit**

```bash
git add cron-worker/wrangler.toml cron-worker/src/index.js
git commit -m "feat(auditores): cron-worker dispatch /api/cron/audit-{escalate,cleanup}"
```

---

## Task 11: Secrets em CF Pages env + setWebhook Telegram (manual)

**Files:** nenhum — operações manuais no CF dashboard + Telegram Bot API. Output documentado no smoke test (Task 12).

- [ ] **Step 1: Push do branch pra deploy CF Pages**

```bash
git push origin main
```

GHA `.github/workflows/deploy.yml` dispara `cloudflare/wrangler-action@v3` com `pages deploy` — leva ~2min. Confirmar em CF dashboard → Pages → inkflow-saas → último deploy = success.

- [ ] **Step 2: Cadastrar secrets em CF Pages env (manual no dashboard)**

CF Dashboard → Workers & Pages → inkflow-saas → Settings → Environment variables (Production):

| Var | Valor | Notas |
|---|---|---|
| `TELEGRAM_WEBHOOK_SECRET` | gerar `openssl rand -hex 32` | só pra este webhook |
| `TELEGRAM_ADMIN_USER_ID` | valor de Task 1 step 3 | string numérica do @userinfobot |
| `PUSHOVER_APP_TOKEN` | de Bitwarden "inkflow-pushover" | se ausente, pular escalation funcional até cadastrar |
| `PUSHOVER_USER_KEY` | de Bitwarden "inkflow-pushover" | mesmo |

`SUPABASE_SERVICE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CRON_SECRET` já existem (validar visualmente).

Save → CF re-deploya o Pages automaticamente (~30s).

- [ ] **Step 3: `setWebhook` no bot Telegram**

```bash
# Substituir <BOT_TOKEN> e <WEBHOOK_SECRET> pelos valores reais
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://inkflowbrasil.com/api/audit/telegram-webhook",
    "secret_token": "<WEBHOOK_SECRET>",
    "allowed_updates": ["message"]
  }'
```

Expected: `{"ok":true,"result":true,"description":"Webhook was set"}`.

Validar:

```bash
curl -s "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo" | jq .
```

Expected: `result.url == "https://inkflowbrasil.com/api/audit/telegram-webhook"`, `result.has_custom_certificate == false`, `pending_update_count == 0`.

- [ ] **Step 4: Sem commit (operações fora do repo)** — registro vai no smoke test da Task 12.

---

## Task 12: Smoke test ponta-a-ponta + doc

**Files:**
- Create: `evals/smoke-tests/2026-04-27-auditores-infra-e2e.md`

- [ ] **Step 1: INSERT manual de evento `critical`**

Via Supabase MCP `mcp__plugin_supabase_supabase__execute_sql`:

```sql
INSERT INTO audit_runs (auditor, status) VALUES ('smoke-test', 'success')
RETURNING id;
-- anota o run_id retornado, ex: run_id_X

INSERT INTO audit_events (
  run_id, auditor, severity, payload, evidence
) VALUES (
  '<run_id_X>',
  'smoke-test',
  'critical',
  '{"runbook_path":"docs/canonical/runbooks/secrets-expired.md","suggested_subagent":"deploy-engineer","summary":"Smoke test infra auditores"}'::jsonb,
  '{"source":"manual_smoke_test"}'::jsonb
)
RETURNING id;
-- anota o event_id, ex: event_id_X
```

- [ ] **Step 2: Disparar Telegram chamando `sendTelegram` direto via endpoint dummy**

A lib não tem endpoint dedicado, então simular com fetch direto pra Telegram a partir do dashboard ou criar uma chamada one-shot. **Alternativa mais limpa:** após o auditor #1 estar em prod (próximo plano), o Telegram dispara naturalmente. Pra este smoke, usar curl direto:

```bash
# Validar formato copiando do test esperado em §6.3 do spec
EVENT_ID_SHORT=$(echo <event_id_X> | cut -c1-8)
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{
    \"chat_id\": \"<TELEGRAM_CHAT_ID>\",
    \"text\": \"[critical] [smoke-test] Smoke test infra auditores\\nID: $EVENT_ID_SHORT | Runbook: secrets-expired.md\\nSuggested: @deploy-engineer\\nEvidence: {\\\"source\\\":\\\"manual_smoke_test\\\"}\\nReply \\\"ack $EVENT_ID_SHORT\\\" pra acknowledge.\"
  }"
```

Confirmar no Telegram do founder: mensagem chega.

- [ ] **Step 3: Reply "ack <id_short>" no Telegram**

Founder responde no chat com `ack <event_id_short>`.

Bot responde em <5s: `✅ Acknowledged: smoke-test critical`.

Validar via SQL:

```sql
SELECT id, acknowledged_at, acknowledged_by
FROM audit_events
WHERE id = '<event_id_X>';
```

Expected: `acknowledged_at` preenchido, `acknowledged_by = '<TELEGRAM_ADMIN_USER_ID>'`.

- [ ] **Step 4: Simular resolve manual e confirmar audit trail**

```sql
UPDATE audit_events
SET resolved_at = now(), resolved_reason = 'manual'
WHERE id = '<event_id_X>';
```

Validar que view `audit_current_state` não lista mais o evento:

```sql
SELECT * FROM audit_current_state WHERE auditor = 'smoke-test';
```

Expected: 0 rows.

- [ ] **Step 5: Smoke do escalation (cron */5 dispara Pushover)**

Criar evento crítico com `detected_at` no passado pra trigger immediate:

```sql
INSERT INTO audit_runs (auditor, status) VALUES ('smoke-escalation', 'success') RETURNING id;
INSERT INTO audit_events (
  run_id, auditor, severity, payload, detected_at
) VALUES (
  '<new_run_id>',
  'smoke-escalation',
  'critical',
  '{"summary":"Escalation smoke test"}'::jsonb,
  now() - interval '3 hours'
) RETURNING id;
```

Disparar manual (sem esperar 5min):

```bash
curl -X POST "https://inkflow-cron.<account>.workers.dev/?cron=*/5+*+*+*+*" \
     -H "Authorization: Bearer <CRON_SECRET>"
```

Expected response: `{ ok: true, label: "audit-escalate", response: '{"ok":true,"escalated_count":1,"candidates":1}' }`.

Confirmar push notification no celular do founder via Pushover (priority=2 → som forte, requer dismissal). 

Validar via SQL:

```sql
SELECT id, escalated_at, acknowledged_at FROM audit_events
WHERE auditor = 'smoke-escalation' ORDER BY detected_at DESC LIMIT 1;
```

Expected: `escalated_at` preenchido, `acknowledged_at` ainda null (escalation precede ack humano).

- [ ] **Step 6: Cleanup dos eventos de smoke test**

```sql
DELETE FROM audit_events WHERE auditor IN ('smoke-test', 'smoke-escalation');
DELETE FROM audit_runs WHERE auditor IN ('smoke-test', 'smoke-escalation');
```

- [ ] **Step 7: Documentar o smoke test**

`evals/smoke-tests/2026-04-27-auditores-infra-e2e.md`:

```markdown
# Smoke Test E2E — Auditores MVP Infra

**Data:** 2026-04-27
**Spec:** docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §9.0
**Plan:** docs/superpowers/plans/2026-04-27-auditores-infra.md Task 12

## Cenários executados

- [x] INSERT manual `audit_events critical` → linha em DB
- [x] Telegram dispara mensagem com format §6.3 (severity, auditor, summary, ID, runbook, suggested, ack hint)
- [x] Reply "ack <id_short>" → webhook resolve UUID via prefix → PATCH `acknowledged_at` + `acknowledged_by`
- [x] Bot envia confirmação `✅ Acknowledged: smoke-test critical`
- [x] UPDATE manual `resolved_at` → `audit_current_state` view não lista mais
- [x] Escalation cron */5: critical >2h sem ack → Pushover priority=2 → `escalated_at` preenchido (sem confundir com ack humano)

## Findings / TODOs

(adicionar se algo falhou ou comportamento inesperado)

## Próximo passo

Auditor #1 (key-expiry) — primeiro detector real. Plano `2026-04-XX-auditores-key-expiry.md`.
```

- [ ] **Step 8: Commit**

```bash
git add evals/smoke-tests/2026-04-27-auditores-infra-e2e.md
git commit -m "test(auditores): smoke E2E infra — INSERT → Telegram → ack → resolve → escalate"
```

- [ ] **Step 9: Push final**

```bash
git push origin main
```

GHA dispara deploy. Confirmar em CF Pages: deploy success. Worker já deployado (Task 10). Pipeline completo em produção.

---

## Self-review

**1. Spec coverage check:**

| Spec section | Coberto em | Status |
|---|---|---|
| §9.0 pré-reqs (cron limit) | Task 1 step 1 | ✅ |
| §9.0 pré-reqs (telegram webhook) | Task 1 step 2 + Task 11 step 3 | ✅ |
| §9.0 pré-reqs (admin user id) | Task 1 step 3 | ✅ |
| §9.0 routine smoke | Task 1 step 4 (registro como TODO — fora deste plano por design) | ✅ |
| §4.1 audit_events + RLS | Task 2 | ✅ |
| §4.2 audit_runs + RLS | Task 2 | ✅ |
| §4.3 audit_reports + RLS | Task 2 | ✅ |
| §4.4 view audit_current_state | Task 2 | ✅ |
| §6.1 lib 7 funções | Tasks 3-6 | ✅ |
| §6.2 política dedupe (8 casos) | Task 4 (8 testes) | ✅ |
| §6.3 format Telegram | Task 6 (sendTelegram + 6 testes) | ✅ |
| §6.4 ack flow | Task 7 (telegram-webhook + 6 testes) | ✅ |
| §6.5 escalation flow | Task 8 (audit-escalate + 3 testes) | ✅ |
| §6.6 cleanup flow | Task 9 (audit-cleanup + 2 testes) | ✅ |
| Cron triggers wire-up | Task 10 | ✅ |
| Secrets CF Pages env | Task 11 | ✅ |
| Smoke E2E | Task 12 | ✅ |

**Gaps deliberados (cobertos em planos seguintes):**
- §5.1-5.5 auditores individuais — fora deste plano
- §7 relatório semanal — fora
- §8 cross-references nos agents — fora
- §10 DoD por auditor (48h em prod) — fora (item de DoD do sub-projeto, não desta fatia)

**2. Placeholder scan:** zero. Todo step tem código completo ou comando exato.

**3. Type consistency:**
- `dedupePolicy(current, next, { now })` — assinatura usada nos 8 testes da Task 4 e idêntica na implementação.
- `startRun` retorna `runId` (string), `endRun(supabase, runId, opts)` recebe-o — compatível.
- `insertEvent(supabase, evt)` recebe object com `run_id, auditor, severity, payload, evidence` — Task 8 (`audit-escalate`) NÃO chama insertEvent (não cria evento, só PATCH escalated_at), Task 12 step 1 INSERT direto via SQL — OK.
- `sendTelegram(env, event)` / `sendPushover(env, event)` — assinatura idêntica nos testes (Task 6) e nos consumers (Task 8).
- `getCurrentState` retorna `null` ou row do view — convém pra dedupePolicy.
- `event_id_short` = primeiros 8 chars (Task 6 + Task 7) — consistente.
- `escalated_at` (não `escalated_by`) — coluna usada em migration (Task 2) + endpoint (Task 8) + smoke test (Task 12) — consistente.

**4. Risk markers cravados** em risk markers section (5 itens). Cada um com mitigação concreta.

**5. Reversibilidade:**
- Migration (Task 2): rollback via `DROP TABLE audit_events, audit_runs, audit_reports CASCADE; DROP VIEW audit_current_state;` — não há outras tabelas referenciando.
- cron-worker triggers (Task 10): rollback via revert do commit + `wrangler deploy`.
- setWebhook (Task 11): rollback via `setWebhook url=""` (limpa webhook).
- Endpoints (Tasks 7-9): rollback via revert + GHA redeploy.

**6. Plano fica em <13 tasks (12 tasks).** Cada task tem 4-9 steps internos. Tasks individuais estão dentro do orçamento de 2-5min/step ou explicitamente longas (Task 11 e 12 são manuais, levam mais tempo no smoke).

---

## Execution Handoff

**Plano salvo em `docs/superpowers/plans/2026-04-27-auditores-infra.md`. Duas opções de execução:**

**1. Subagent-Driven (recomendado)** — dispatch de subagent fresco por task, review entre tasks, iteração rápida. Melhor pra este plano: Tasks 2, 7, 8 são candidatas naturais a subagent (cada uma é self-contained com file structure + tests + impl).

**2. Inline Execution** — executa tasks na sessão atual via `executing-plans`, batch com checkpoints. Melhor se você quer acompanhar visualmente cada step.

**Qual abordagem?**
