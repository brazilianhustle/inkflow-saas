# Auditor #4 `rls-drift` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o auditor #4 `rls-drift` (último do Sub-projeto 3) com arquitetura híbrida resiliente: lib detect compartilhada + endpoint CF Pages funcional como fallback + Routine Anthropic com reasoning Claude como caminho primary. Detecta drift de segurança Supabase via SQL queries diretas no `pg_class`/`pg_proc` (tabelas sem RLS não-allowlisted, functions sem `search_path`).

**Architecture:**
- **Lib detect determinística** (`functions/_lib/auditors/rls-drift.js`) — recebe `schemaState: { tables_no_rls, functions_no_search_path }` + env (allowlist), retorna eventos com severity/payload/evidence. Sem Claude reasoning. Pura função.
- **Endpoint CF Pages** (`functions/api/cron/audit-rls-drift.js`) — orchestrator igual aos outros (auth + fetchSchemaState com 2 SQL queries paralelas via Management API + detect + collapseEvents + dedupePolicy + Telegram). Serve como **fallback ativo** caso Routine genuína falhe.
- **Routine Anthropic via `/schedule`** — executa 2 SQL queries via `https://api.supabase.com/v1/projects/{ref}/database/query` + git log de migrations + aplica reasoning Claude (narrativa contextual: "tabela X adicionada em commit Y sem RLS — provavelmente esquecimento") + INSERT em audit_events via SQL + Telegram alert.
- **cron-worker trigger initially DISABLED** (deixado no SCHEDULE_MAP mas comentado no `wrangler.toml`). Pivot path = descomentar 1 linha + redeploy = ~30min se Routine quebrar.

**Tech Stack:** JavaScript (ES modules), CF Pages Functions, CF Workers (`inkflow-cron`), Anthropic Routines (`/schedule`), Supabase Management API REST `/database/query` endpoint (SQL execução), pg_catalog introspection (pg_class, pg_proc — APIs Postgres estáveis há décadas), Telegram Bot API, node:test runner, TDD strict (red→green per step), wrangler v3.

**Spec source:** `docs/superpowers/specs/2026-04-27-auditores-mvp-design.md` §5.4 + §9.5.

**Deviation crítico vs spec:** Spec assumiu API REST `/v1/projects/<ref>/advisors` que **não existe** (descoberto via testes diretos 2026-04-30 — Database Linter é client-side no dashboard, sem REST público). Pivotamos pra **SQL queries diretas** via `database/query` (estável, validado funciona com SB_PAT). Cobertura MVP: 2 sintomas (RLS + search_path) — outros lints do dashboard ficam backlog P3 (fase 2 do auditor #4).

---

## Spec deviations cravadas neste plano

5 desvios do spec §5.4 + §9.5 — documentados aqui pra evitar review-time surprise:

1. **Arquitetura híbrida resiliente (vs Routine pura).** Spec §5.4 cravou Routine Anthropic como single source. Aprendizado de 2026-04-30 (CCR allowlist 403 pra `inkflowbrasil.com` no auditor #3) força mitigação de design: implementar **lib detect + endpoint CF Pages funcional desde o início**, mesmo que Routine seja primary. Razão: se Anthropic mudar allowlist e quebrar Routine, pivot pra cron-worker leva ~30min em vez de ~3-4h. Decision doc explicitamente documenta esse pivot path.

2. **Reasoning Claude vive APENAS na Routine, NÃO no endpoint.** Spec §5.4.2 lista 3 capacidades do reasoning (allowlist contextual, severity calibration, narrativa). Cravamos: detect lib determinística **não tem** reasoning — aplica regras fixas sobre `schemaState` + allowlist estática. Reasoning Claude é **camada adicional** que vive no prompt da Routine: agente roda SQL queries + git log + decide narrativa + UPDATE/INSERT audit_events com `payload.narrative` enriquecido. Trade-off: endpoint fallback perde narrativas mas mantém detection. Acceptable degradation.

3. **Allowlist inicial expandida vs spec §5.4.4.** Spec lista 5 tabelas: `audit_events`, `audit_runs`, `audit_reports`, `approvals`, `tool_calls_log`. Cravamos as 5 + adicionamos: `signups_log` (já tem policy `WITH CHECK (true)` intencional pra log anon de tentativas signup, documentado em backlog P3 "Rate limit pro endpoint anon de signups_log"). Total 6 tabelas allowlisted. Allowlist exposta via env var `RLS_INTENTIONAL_NO_PUBLIC` (CSV) pra crescer sem deploy.

4. **Source: SQL direto via Management API `/database/query` (não advisor REST que não existe).** Spec §5.4 cravou `GET /v1/projects/<ref>/advisors?lint_type=...` mas testes diretos 2026-04-30 mostraram **404** — esse endpoint não existe na Management API. Database Linter do dashboard é client-side. Pivotamos pra **2 SQL queries** via `POST /v1/projects/<ref>/database/query` (validado funciona com SB_PAT):
   - **Query A (RLS):** `SELECT n.nspname AS schema, c.relname AS table_name FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE c.relkind = 'r' AND n.nspname = 'public' AND NOT c.relrowsecurity ORDER BY c.relname`
   - **Query B (search_path):** `SELECT n.nspname AS schema, p.proname AS function_name FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.prokind = 'f' AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=%')) ORDER BY p.proname`

5. **Cobertura MVP: 2 sintomas (RLS + search_path) — não 4 finding types.** Spec original §5.4 referenciou 4 advisor finding types (function_search_path_mutable, policy_exists_rls_disabled, rls_disabled_in_public, generic). Sem advisor API, focamos nos 2 mais críticos:
   - **Sintoma A — Tabela em public sem RLS** (não allowlisted) → `warn`
   - **Sintoma B — Function em public sem `search_path`** → `critical`
   - **Backlog P3 (fase 2 do auditor #4):** policies `WITH CHECK (true)` em endpoint anon, performance lints (índices missing), RLS-on-com-policies-zero. Cobertura adicional como expansão pós-MVP.

6. **Cron `0 7 * * *` UTC (04:00 BRT) — diário às 04h BRT.** Spec §5.4 disse "Frequência: 24h" sem horário específico. Cravamos 07:00 UTC pra (a) rodar antes do horário comercial brasileiro (alerta acordando founder se houver drift — útil pra security), (b) offset dos outros auditores (deploy-health 6h, billing-flow `30 */6`, vps-limits 6h+15min, key-expiry 06:00 UTC). 07:00 UTC fica entre key-expiry e deploy-health.

---

## File Structure

**Files to create (5):**

1. `functions/_lib/auditors/rls-drift.js` — detect puro (~150 lines) com helpers: `parseAllowlist(env)`, `isAllowlisted(table, allowlist)`, `buildTableEvent(row)`, `buildFunctionEvent(row)`, `detect({ schemaState, env })`.
2. `functions/api/cron/audit-rls-drift.js` — endpoint orchestrator (~180 lines, similar a billing-flow.js) com `fetchSchemaState()` (2 SQL queries paralelas via Management API) substituindo `fetchVpsMetrics()`. Reusa `collapseEvents` + dedupe wiring.
3. `tests/auditor-rls-drift.test.mjs` — unit tests da lib detect (~17 tests: 4 RLS scenarios + 4 search_path scenarios + 5 allowlist scenarios + 4 edge cases).
4. `tests/audit-rls-drift-endpoint.test.mjs` — endpoint integration tests (~9 tests: auth/method/missing-config/sql-fail/clean/critical-fire/supersede/resolve/mixed-findings).
5. `docs/canonical/decisions/2026-04-30-rls-drift-architecture.md` — decision doc com **pivot path** explícito: "Se Routine quebrar (audit_runs status=error 2x consecutivos), descomentar trigger no `cron-worker/wrangler.toml` linha X + redeploy = ~30min".

**Files to modify (5):**

1. `cron-worker/wrangler.toml` — trigger `0 7 * * *` adicionado mas **COMENTADO** com nota explicativa do pivot path.
2. `cron-worker/src/index.js` — entry no `SCHEDULE_MAP` (ativa quando trigger descomentado).
3. `docs/canonical/auditores.md` — add `## rls-drift` section + remove do "(Próximos auditores)" → fechando 5/5 ✅.
4. `.claude/agents/README.md` — Mapping table: `rls-drift → supabase-dba` (agent ainda não existe — Sub-projeto 2 pendente; valor é hint).
5. `docs/canonical/methodology/incident-response.md §6.3` — atualizar status pra ✅ implementado (PR #N + SHA placeholder).

**Database:** zero migrations. Schema `audit_events` + `audit_runs` + view `audit_current_state` já em prod desde PR #10.

---

## Pré-requisitos cravados

Validar antes de começar Task 1:

- [ ] Estado git limpo em `main` (commit `f2d614a` ou descendente). `git status` retorna "working tree clean".
- [ ] Branch novo `feat/auditor-rls-drift` criado a partir de main: `git switch -c feat/auditor-rls-drift`.
- [ ] `node --test tests/*.test.mjs` passa em main com **167 tests** (baseline pós-#3 vps-limits + pivot). Verificar com `node --test tests/*.test.mjs 2>&1 | tail -3`. Se contagem diferir, atualizar Task 7 expected baseline antes de despachar.
- [ ] **Env vars já em prod (CF Pages):**
  - `CRON_SECRET` ✅ — em CF Pages env + cron-worker secret (rotacionado 2026-04-30)
  - `SUPABASE_SERVICE_KEY` ✅ — em CF Pages env (usado por todos auditores)
  - `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` ✅ — em CF Pages env
- [ ] **Env vars NOVAS a cadastrar (Task 7):**
  - `SUPABASE_PAT` — Personal Access Token Supabase (já em BWS id `46a0d806-...` rotacionado 2026-04-30; precisa propagar pra CF Pages env via `bws secret get | wrangler pages secret put`)
  - `RLS_INTENTIONAL_NO_PUBLIC` — CSV `audit_events,audit_runs,audit_reports,approvals,tool_calls_log,signups_log` (allowlist inicial, crescível sem deploy)
- **Não precisa de `SUPABASE_PROJECT_REF`** — `bfzuxxuscyplfoimvomh` fica hardcoded no endpoint (constante `SUPABASE_PROJECT_REF`), igual `SUPABASE_URL` que já é hardcoded.

---

## Task 1: Pre-flight — verificar baseline + branch + env vars

**Files:** zero modify, só leitura.

**Goal:** Verificar pré-condições antes de qualquer mudança. Garante que CF Pages env tem todos os secrets necessários + baseline test count está correto.

- [ ] **Step 1: Verificar estado git limpo**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git status --short
```

Expected: vazio (working tree clean). Se houver mudanças, abortar e investigar.

- [ ] **Step 2: Criar branch novo a partir de main**

Run:
```bash
git switch main && git pull && git switch -c feat/auditor-rls-drift
```

Expected: `Switched to a new branch 'feat/auditor-rls-drift'`.

- [ ] **Step 3: Verificar baseline de tests**

Run:
```bash
node --test tests/*.test.mjs 2>&1 | tail -5
```

Expected: linha `# tests 167`. Se diferir, atualizar expected counts em todas as tasks de baseline antes de prosseguir.

- [ ] **Step 4: Verificar SUPABASE_PAT acessível via BWS**

Run:
```bash
export BWS_ACCESS_TOKEN=$(security find-generic-password -s "BWS_ACCESS_TOKEN" -w 2>/dev/null) && bws secret get "46a0d806-c112-4bfa-9211-b43a004f4307" | jq -r '"OK: SB_PAT acessível, prefix " + (.value | .[0:4])' && unset BWS_ACCESS_TOKEN
```

Expected: `OK: SB_PAT acessível, prefix sbp_`.

- [ ] **Step 5: Validar SUPABASE_PAT funciona contra Management API `/database/query`**

Run:
```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" -X POST 'https://api.supabase.com/v1/projects/bfzuxxuscyplfoimvomh/database/query' \
  -H "Authorization: Bearer $(security find-generic-password -s SB_PAT -w 2>/dev/null)" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT 1 AS sanity"}'
```

Expected: `HTTP 200`. Se 401, token está stale/inválido. Se 404, endpoint mudou — abortar e re-pesquisar.

- [ ] **Step 5b: Smoke das queries SQL específicas (RLS + search_path)**

Run:
```bash
SB_PAT=$(security find-generic-password -s SB_PAT -w 2>/dev/null)
echo "=== Query A: tables sem RLS em public ==="
curl -sS -X POST 'https://api.supabase.com/v1/projects/bfzuxxuscyplfoimvomh/database/query' -H "Authorization: Bearer $SB_PAT" -H "Content-Type: application/json" -d '{"query":"SELECT n.nspname AS schema, c.relname AS table_name FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE c.relkind = $$r$$ AND n.nspname = $$public$$ AND NOT c.relrowsecurity ORDER BY c.relname"}' | jq 'length'
echo "=== Query B: functions sem search_path ==="
curl -sS -X POST 'https://api.supabase.com/v1/projects/bfzuxxuscyplfoimvomh/database/query' -H "Authorization: Bearer $SB_PAT" -H "Content-Type: application/json" -d '{"query":"SELECT n.nspname AS schema, p.proname AS function_name FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = $$public$$ AND p.prokind = $$f$$ AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE $$search_path=%$$)) ORDER BY p.proname"}' | jq 'length'
unset SB_PAT
```

Expected: 2 números (count de rows). Estado atual conhecido em 2026-04-30: `0` em ambas (16/16 tables com RLS, 0 functions sem search_path).

- [ ] **Step 6: Confirmar baseline pronto — sem commit**

Pre-flight não gera commit. Output das steps acima fica em mensagens; founder revisa antes de despachar Task 2.

---

## Task 2: Skeleton lib detect + smoke test (TDD red→green)

**Files:**
- Create: `functions/_lib/auditors/rls-drift.js`
- Create: `tests/auditor-rls-drift.test.mjs`

**Goal:** Estabelecer arquivo skeleton com `detect()` exportada + 2 smoke tests (existência + retorno empty quando schemaState vazio).

- [ ] **Step 1: Criar test file com 2 smoke tests (red)**

Conteúdo de `tests/auditor-rls-drift.test.mjs`:
```javascript
// tests/auditor-rls-drift.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../functions/_lib/auditors/rls-drift.js';

test('detect is exported as async function', () => {
  assert.equal(typeof detect, 'function');
});

test('detect with empty schemaState returns empty array', async () => {
  const events = await detect({
    env: {},
    schemaState: { tables_no_rls: [], functions_no_search_path: [] },
    now: Date.now(),
  });
  assert.deepEqual(events, []);
});
```

- [ ] **Step 2: Rodar e confirmar FAIL (módulo ausente)**

Run: `node --test tests/auditor-rls-drift.test.mjs`
Expected: FAIL com `Cannot find module 'functions/_lib/auditors/rls-drift.js'` ou `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Criar lib skeleton (green minimal)**

Conteúdo de `functions/_lib/auditors/rls-drift.js`:
```javascript
// functions/_lib/auditors/rls-drift.js
// ── InkFlow — Auditor #4: rls-drift ────────────────────────────────────────
// Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §5.4
// (deviation: spec assumiu /v1/.../advisors REST — não existe.
//  Pivotamos pra SQL queries diretas via /database/query API.)
//
// Detecção determinística (sem reasoning Claude — esse vive na Routine):
//   - Tabela em public sem RLS, NÃO allowlisted → warn
//   - Tabela em public sem RLS, ALLOWLISTED    → silent skip
//   - Function em public sem search_path       → critical (allowlist NÃO aplica)
//
// Allowlist via env var RLS_INTENTIONAL_NO_PUBLIC (CSV).
// Inicial: audit_events, audit_runs, audit_reports, approvals, tool_calls_log, signups_log.
//
// Input: { env, schemaState: { tables_no_rls: [{schema, table_name}], functions_no_search_path: [{schema, function_name}] }, now }
// Output: Array<{ severity, payload, evidence }> — sem efeitos.

const RUNBOOK_PATH = null; // gap consciente — spec §5.4
const SUGGESTED_SUBAGENT = 'supabase-dba'; // hint pro futuro Sub-projeto 2

export async function detect({ env = {}, schemaState = { tables_no_rls: [], functions_no_search_path: [] }, now = Date.now() } = {}) {
  const events = [];
  const tables = schemaState?.tables_no_rls || [];
  const functions = schemaState?.functions_no_search_path || [];
  if (tables.length === 0 && functions.length === 0) return events;
  // Sintomas serão adicionados nas tasks 3-4
  return events;
}
```

- [ ] **Step 4: Rodar e confirmar PASS**

Run: `node --test tests/auditor-rls-drift.test.mjs`
Expected: PASS — `tests 2 | pass 2 | fail 0`.

- [ ] **Step 5: Rodar suite full pra confirmar zero regressão**

Run: `node --test tests/*.test.mjs 2>&1 | tail -3`
Expected: `tests 169 | pass 169 | fail 0` (167 baseline + 2 novos).

- [ ] **Step 6: Commit**

```bash
git add functions/_lib/auditors/rls-drift.js tests/auditor-rls-drift.test.mjs
git commit -m "feat(auditor-rls-drift): skeleton detect() + smoke test"
```

---

## Task 3: Detecção dos 2 sintomas determinísticos (TDD)

**Files:**
- Modify: `functions/_lib/auditors/rls-drift.js` (add helpers + detect logic)
- Modify: `tests/auditor-rls-drift.test.mjs` (add ~8 tests cobrindo 2 sintomas)

**Goal:** Implementar lógica determinística sobre `schemaState`:
- **Sintoma A** — Cada row de `tables_no_rls` (não allowlisted) → 1 evento `warn`
- **Sintoma B** — Cada row de `functions_no_search_path` → 1 evento `critical` (allowlist NÃO aplica a functions)

Sem allowlist ainda — esse fica Task 4. Helpers: `buildTableEvent(row)`, `buildFunctionEvent(row)`.

- [ ] **Step 1: Adicionar 8 tests no test file (red)**

Adicionar ao final de `tests/auditor-rls-drift.test.mjs`:
```javascript
test('Sintoma A: 1 table sem RLS produces 1 warn event', async () => {
  const events = await detect({
    env: {},
    schemaState: {
      tables_no_rls: [{ schema: 'public', table_name: 'new_feature_data' }],
      functions_no_search_path: [],
    },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].severity, 'warn');
  assert.equal(events[0].payload.symptom, 'table_no_rls');
  assert.match(events[0].payload.summary, /new_feature_data.*sem RLS/);
});

test('Sintoma A: 3 tables sem RLS produce 3 warn events', async () => {
  const events = await detect({
    env: {},
    schemaState: {
      tables_no_rls: [
        { schema: 'public', table_name: 'a' },
        { schema: 'public', table_name: 'b' },
        { schema: 'public', table_name: 'c' },
      ],
      functions_no_search_path: [],
    },
  });
  assert.equal(events.length, 3);
  assert.ok(events.every((e) => e.severity === 'warn' && e.payload.symptom === 'table_no_rls'));
});

test('Sintoma A: payload + evidence shape correto', async () => {
  const events = await detect({
    env: {},
    schemaState: {
      tables_no_rls: [{ schema: 'public', table_name: 'tenants' }],
      functions_no_search_path: [],
    },
  });
  const e = events[0];
  assert.equal(e.payload.runbook_path, null);
  assert.equal(e.payload.suggested_subagent, 'supabase-dba');
  assert.equal(e.payload.object, 'tenants');
  assert.equal(e.payload.schema, 'public');
  assert.equal(e.payload.source, 'pg_class_introspection');
  assert.equal(e.evidence.schema, 'public');
  assert.equal(e.evidence.table_name, 'tenants');
  assert.equal(e.evidence.check_type, 'rls_disabled');
});

test('Sintoma A: schema diferente de public ainda emite (caso edge)', async () => {
  // SQL query restringe a public, mas se vier outra schema na input, ainda processa
  const events = await detect({
    env: {},
    schemaState: {
      tables_no_rls: [{ schema: 'analytics', table_name: 'events_raw' }],
      functions_no_search_path: [],
    },
  });
  assert.equal(events.length, 1);
  assert.match(events[0].payload.summary, /analytics\.events_raw/);
});

test('Sintoma B: 1 function sem search_path produces 1 critical event', async () => {
  const events = await detect({
    env: {},
    schemaState: {
      tables_no_rls: [],
      functions_no_search_path: [{ schema: 'public', function_name: 'compute_billing' }],
    },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].severity, 'critical');
  assert.equal(events[0].payload.symptom, 'function_no_search_path');
  assert.match(events[0].payload.summary, /compute_billing.*search_path/);
});

test('Sintoma B: payload + evidence shape correto', async () => {
  const events = await detect({
    env: {},
    schemaState: {
      tables_no_rls: [],
      functions_no_search_path: [{ schema: 'public', function_name: 'audit_log' }],
    },
  });
  const e = events[0];
  assert.equal(e.payload.runbook_path, null);
  assert.equal(e.payload.suggested_subagent, 'supabase-dba');
  assert.equal(e.payload.object, 'audit_log');
  assert.equal(e.payload.source, 'pg_proc_introspection');
  assert.equal(e.evidence.function_name, 'audit_log');
  assert.equal(e.evidence.check_type, 'no_search_path');
});

test('Mixed: tables + functions produce mix of warn + critical', async () => {
  const events = await detect({
    env: {},
    schemaState: {
      tables_no_rls: [{ schema: 'public', table_name: 't1' }],
      functions_no_search_path: [{ schema: 'public', function_name: 'f1' }],
    },
  });
  assert.equal(events.length, 2);
  const warnEvent = events.find((e) => e.severity === 'warn');
  const criticalEvent = events.find((e) => e.severity === 'critical');
  assert.equal(warnEvent.payload.symptom, 'table_no_rls');
  assert.equal(criticalEvent.payload.symptom, 'function_no_search_path');
});

test('Empty schemaState fields handled gracefully', async () => {
  // Edge case: undefined arrays in nested shape
  const events = await detect({
    env: {},
    schemaState: {}, // missing both fields
  });
  assert.deepEqual(events, []);
});
```

- [ ] **Step 2: Rodar e confirmar FAIL**

Run: `node --test tests/auditor-rls-drift.test.mjs`
Expected: 8 tests novos falham.

- [ ] **Step 3: Implementar lógica de detect (green)**

Substituir conteúdo de `functions/_lib/auditors/rls-drift.js`:
```javascript
// functions/_lib/auditors/rls-drift.js
// ── InkFlow — Auditor #4: rls-drift ────────────────────────────────────────
// Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §5.4
// (deviation: spec assumiu /v1/.../advisors REST — não existe.
//  Pivotamos pra SQL queries diretas via /database/query API.)
//
// Detecção determinística (sem reasoning Claude — esse vive na Routine):
//   - Tabela em public sem RLS, NÃO allowlisted → warn
//   - Tabela em public sem RLS, ALLOWLISTED    → silent skip (Task 4)
//   - Function em public sem search_path       → critical (allowlist NÃO aplica)
//
// Allowlist via env var RLS_INTENTIONAL_NO_PUBLIC (CSV).
// Inicial: audit_events, audit_runs, audit_reports, approvals, tool_calls_log, signups_log.
//
// Input: { env, schemaState: { tables_no_rls: [{schema, table_name}], functions_no_search_path: [{schema, function_name}] }, now }
// Output: Array<{ severity, payload, evidence }> — sem efeitos.

const RUNBOOK_PATH = null;
const SUGGESTED_SUBAGENT = 'supabase-dba';

function buildTableEvent(row) {
  const schema = row.schema || 'public';
  const tableName = row.table_name || 'unknown';
  const fqn = `${schema}.${tableName}`;
  return {
    severity: 'warn',
    payload: {
      symptom: 'table_no_rls',
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: `Tabela \`${fqn}\` em schema public sem RLS`,
      object: tableName,
      schema,
      source: 'pg_class_introspection',
    },
    evidence: {
      schema,
      table_name: tableName,
      check_type: 'rls_disabled',
    },
  };
}

function buildFunctionEvent(row) {
  const schema = row.schema || 'public';
  const functionName = row.function_name || 'unknown';
  const fqn = `${schema}.${functionName}`;
  return {
    severity: 'critical',
    payload: {
      symptom: 'function_no_search_path',
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: `Function \`${fqn}\` sem search_path setado (security risk)`,
      object: functionName,
      schema,
      source: 'pg_proc_introspection',
    },
    evidence: {
      schema,
      function_name: functionName,
      check_type: 'no_search_path',
    },
  };
}

export async function detect({ env = {}, schemaState = { tables_no_rls: [], functions_no_search_path: [] }, now = Date.now() } = {}) {
  const events = [];
  const tables = schemaState?.tables_no_rls || [];
  const functions = schemaState?.functions_no_search_path || [];

  // Sintoma A — tables sem RLS (allowlist filter aplicado em Task 4)
  for (const row of tables) {
    events.push(buildTableEvent(row));
  }

  // Sintoma B — functions sem search_path (sempre critical)
  for (const row of functions) {
    events.push(buildFunctionEvent(row));
  }

  return events;
}
```

- [ ] **Step 4: Rodar e confirmar PASS (10 tests)**

Run: `node --test tests/auditor-rls-drift.test.mjs`
Expected: `tests 10 | pass 10 | fail 0` (2 smoke + 8 novos).

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/auditors/rls-drift.js tests/auditor-rls-drift.test.mjs
git commit -m "feat(auditor-rls-drift): 2 sintomas (table_no_rls warn / function_no_search_path critical)"
```

---

## Task 4: Allowlist (RLS_INTENTIONAL_NO_PUBLIC) — silent skip pra tabelas intencionais

**Files:**
- Modify: `functions/_lib/auditors/rls-drift.js` (add `parseAllowlist` + filter em `detect`)
- Modify: `tests/auditor-rls-drift.test.mjs` (add 5 tests)

**Goal:** Filtrar `tables_no_rls` rows cujo `table_name` está na allowlist (CSV via env). Functions sem search_path NÃO são afetadas — sempre emitem critical.

- [ ] **Step 1: Adicionar 5 tests (red)**

```javascript
test('allowlist: table_no_rls com table_name allowlisted é silent skip', async () => {
  const events = await detect({
    env: { RLS_INTENTIONAL_NO_PUBLIC: 'audit_events,audit_runs,approvals' },
    schemaState: {
      tables_no_rls: [{ schema: 'public', table_name: 'audit_events' }],
      functions_no_search_path: [],
    },
  });
  assert.equal(events.length, 0);
});

test('allowlist: table_no_rls com table_name NÃO allowlisted fires warn', async () => {
  const events = await detect({
    env: { RLS_INTENTIONAL_NO_PUBLIC: 'audit_events,approvals' },
    schemaState: {
      tables_no_rls: [{ schema: 'public', table_name: 'tenants' }],
      functions_no_search_path: [],
    },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].severity, 'warn');
});

test('allowlist: function_no_search_path NÃO é afetado pela allowlist', async () => {
  // Allowlist só aplica a tables_no_rls — functions sempre fire critical
  const events = await detect({
    env: { RLS_INTENTIONAL_NO_PUBLIC: 'audit_events,audit_runs' },
    schemaState: {
      tables_no_rls: [],
      functions_no_search_path: [{ schema: 'public', function_name: 'audit_events' }], // mesmo nome de tabela allowlisted
    },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].severity, 'critical');
});

test('allowlist: empty env var = nothing whitelisted = todas tables fire warn', async () => {
  const events = await detect({
    env: { RLS_INTENTIONAL_NO_PUBLIC: '' },
    schemaState: {
      tables_no_rls: [{ schema: 'public', table_name: 'audit_events' }],
      functions_no_search_path: [],
    },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].severity, 'warn');
});

test('allowlist: missing env var = nothing whitelisted', async () => {
  const events = await detect({
    env: {}, // sem RLS_INTENTIONAL_NO_PUBLIC
    schemaState: {
      tables_no_rls: [{ schema: 'public', table_name: 'audit_events' }],
      functions_no_search_path: [],
    },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].severity, 'warn');
});
```

- [ ] **Step 2: Rodar e confirmar FAIL**

Run: `node --test tests/auditor-rls-drift.test.mjs`
Expected: 1 dos 5 tests novos falha — `allowlist: table_no_rls com table_name allowlisted é silent skip` falha porque allowlist ainda não filtra. Os outros 4 passam por coincidência (allowlist inativa = comportamento atual).

- [ ] **Step 3: Implementar allowlist filtering (green)**

Modificar `functions/_lib/auditors/rls-drift.js`:

Adicionar helper `parseAllowlist` antes da função `detect`:
```javascript
function parseAllowlist(env) {
  const csv = env.RLS_INTENTIONAL_NO_PUBLIC;
  if (!csv || typeof csv !== 'string') return new Set();
  return new Set(
    csv.split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  );
}
```

Modificar `detect()` pra aplicar allowlist em `tables_no_rls`:
```javascript
export async function detect({ env = {}, schemaState = { tables_no_rls: [], functions_no_search_path: [] }, now = Date.now() } = {}) {
  const events = [];
  const tables = schemaState?.tables_no_rls || [];
  const functions = schemaState?.functions_no_search_path || [];

  const allowlist = parseAllowlist(env);

  // Sintoma A — tables sem RLS, com filtro de allowlist
  for (const row of tables) {
    if (allowlist.has(row.table_name)) continue; // silent skip
    events.push(buildTableEvent(row));
  }

  // Sintoma B — functions sem search_path (allowlist NÃO aplica)
  for (const row of functions) {
    events.push(buildFunctionEvent(row));
  }

  return events;
}
```

- [ ] **Step 4: Rodar e confirmar PASS (15 tests)**

Run: `node --test tests/auditor-rls-drift.test.mjs`
Expected: `tests 15 | pass 15 | fail 0` (2 smoke + 8 sintomas + 5 allowlist).

- [ ] **Step 5: Rodar suite full**

Run: `node --test tests/*.test.mjs 2>&1 | tail -3`
Expected: `tests 182 | pass 182 | fail 0` (167 + 15).

- [ ] **Step 6: Commit**

```bash
git add functions/_lib/auditors/rls-drift.js tests/auditor-rls-drift.test.mjs
git commit -m "feat(auditor-rls-drift): allowlist via RLS_INTENTIONAL_NO_PUBLIC env"
```

---

## Task 5: Endpoint orchestrator + fetchSchemaState (2 SQL queries) + collapseEvents + dedupe wiring

**Files:**
- Create: `functions/api/cron/audit-rls-drift.js`
- Create: `tests/audit-rls-drift-endpoint.test.mjs`

**Goal:** Endpoint CF Pages que (a) valida Bearer CRON_SECRET, (b) executa 2 SQL queries paralelas via Supabase Management API `/database/query` com `SUPABASE_PAT`, (c) constrói `schemaState` e chama `detect()`, (d) `collapseEvents`, (e) `dedupePolicy`, (f) fire/silent/supersede/resolve via lib audit-state. 9 tests integration.

- [ ] **Step 1: Criar test file (red)**

Conteúdo `tests/audit-rls-drift-endpoint.test.mjs`:
```javascript
// tests/audit-rls-drift-endpoint.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/cron/audit-rls-drift.js';

const baseEnv = {
  CRON_SECRET: 'test-cron-secret',
  SUPABASE_SERVICE_KEY: 'test-supabase-key',
  SUPABASE_PAT: 'sbp_test',
  RLS_INTENTIONAL_NO_PUBLIC: 'audit_events,audit_runs,audit_reports,approvals,tool_calls_log,signups_log',
  TELEGRAM_BOT_TOKEN: 'test-tg-token',
  TELEGRAM_CHAT_ID: '123',
};

function makeReq(method = 'POST', authHeader = 'Bearer test-cron-secret') {
  return new Request('https://example.com/api/cron/audit-rls-drift', {
    method,
    headers: { Authorization: authHeader },
  });
}

function makeFetch(handlers) {
  return async (url, init) => {
    for (const h of handlers) {
      if (h.match(url, init)) return h.respond(url, init);
    }
    throw new Error(`Unhandled fetch: ${url}`);
  };
}

test('endpoint rejects GET with 405', async () => {
  const res = await onRequest({ request: makeReq('GET'), env: baseEnv });
  assert.equal(res.status, 405);
});

test('endpoint rejects missing Bearer with 401', async () => {
  const res = await onRequest({ request: makeReq('POST', ''), env: baseEnv });
  assert.equal(res.status, 401);
});

test('endpoint rejects wrong Bearer with 401', async () => {
  const res = await onRequest({ request: makeReq('POST', 'Bearer wrong'), env: baseEnv });
  assert.equal(res.status, 401);
});

test('endpoint returns 503 when SUPABASE_PAT missing', async () => {
  const env = { ...baseEnv, SUPABASE_PAT: '' };
  const res = await onRequest({ request: makeReq(), env });
  assert.equal(res.status, 503);
});

test('endpoint handles SQL query failure (5xx) gracefully — endRun error', async () => {
  let runEnded = false;
  let runEndStatus = null;
  const fetchImpl = makeFetch([
    {
      match: (url) => url.includes('audit_runs') && !url.includes('?id='),
      respond: async () => new Response(JSON.stringify([{ id: 'run-uuid' }]), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_runs') && url.includes('?id='),
      respond: async (url, init) => {
        runEnded = true;
        runEndStatus = JSON.parse(init.body).status;
        return { ok: true, status: 204, text: async () => '' };
      },
    },
    {
      match: (url) => url.includes('api.supabase.com/v1/projects') && url.includes('database/query'),
      respond: async () => new Response('Service Unavailable', { status: 503 }),
    },
  ]);
  const res = await onRequest({ request: makeReq(), env: baseEnv, fetchImpl });
  assert.equal(res.status, 500);
  assert.equal(runEnded, true);
  assert.equal(runEndStatus, 'error');
});

test('endpoint clean run (zero rows from both queries) returns ok with 0 events', async () => {
  let queryCalls = 0;
  const fetchImpl = makeFetch([
    {
      match: (url) => url.includes('audit_runs') && !url.includes('?id='),
      respond: async () => new Response(JSON.stringify([{ id: 'run-uuid' }]), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_runs') && url.includes('?id='),
      respond: async () => ({ ok: true, status: 204, text: async () => '' }),
    },
    {
      // Both SQL queries (RLS + search_path) return empty array
      match: (url) => url.includes('api.supabase.com/v1/projects') && url.includes('database/query'),
      respond: async () => {
        queryCalls++;
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    },
    {
      match: (url) => url.includes('audit_current_state'),
      respond: async () => new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
  ]);
  const res = await onRequest({ request: makeReq(), env: baseEnv, fetchImpl });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.events_count, 0);
  assert.equal(queryCalls, 2); // 2 SQL queries (RLS + search_path)
});

test('endpoint critical run (function without search_path) fires + Telegram', async () => {
  let telegramCalled = false;
  let insertedEvent = null;
  const fetchImpl = makeFetch([
    {
      match: (url) => url.includes('audit_runs') && !url.includes('?id='),
      respond: async () => new Response(JSON.stringify([{ id: 'run-uuid' }]), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_runs') && url.includes('?id='),
      respond: async () => ({ ok: true, status: 204, text: async () => '' }),
    },
    {
      // 1ª query: RLS check returns empty (all tables have RLS)
      match: (url, init) => url.includes('api.supabase.com/v1/projects') && url.includes('database/query') && init?.body?.includes('relrowsecurity'),
      respond: async () => new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      // 2ª query: search_path check returns 1 function
      match: (url, init) => url.includes('api.supabase.com/v1/projects') && url.includes('database/query') && init?.body?.includes('search_path='),
      respond: async () => new Response(JSON.stringify([
        { schema: 'public', function_name: 'compute_billing' },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_current_state'),
      respond: async () => new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_events') && !url.includes('?id='),
      respond: async (url, init) => {
        insertedEvent = JSON.parse(init.body);
        return new Response(JSON.stringify([{ id: 'event-uuid', ...insertedEvent }]), { status: 201, headers: { 'Content-Type': 'application/json' } });
      },
    },
    {
      match: (url) => url.includes('api.telegram.org'),
      respond: async () => { telegramCalled = true; return new Response('{"ok":true}', { status: 200 }); },
    },
  ]);
  const res = await onRequest({ request: makeReq(), env: baseEnv, fetchImpl });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.events_count, 1);
  assert.equal(body.actions.fire, 1);
  assert.equal(insertedEvent?.severity, 'critical');
  assert.equal(telegramCalled, true);
});

test('endpoint with allowlisted table skips warn (silent skip)', async () => {
  const fetchImpl = makeFetch([
    {
      match: (url) => url.includes('audit_runs') && !url.includes('?id='),
      respond: async () => new Response(JSON.stringify([{ id: 'run-uuid' }]), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_runs') && url.includes('?id='),
      respond: async () => ({ ok: true, status: 204, text: async () => '' }),
    },
    {
      // RLS query: returns audit_events (which is allowlisted)
      match: (url, init) => url.includes('api.supabase.com/v1/projects') && url.includes('database/query') && init?.body?.includes('relrowsecurity'),
      respond: async () => new Response(JSON.stringify([
        { schema: 'public', table_name: 'audit_events' },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      // search_path query: empty
      match: (url, init) => url.includes('api.supabase.com/v1/projects') && url.includes('database/query') && init?.body?.includes('search_path='),
      respond: async () => new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_current_state'),
      respond: async () => new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
  ]);
  const res = await onRequest({ request: makeReq(), env: baseEnv, fetchImpl });
  const body = await res.json();
  assert.equal(res.status, 200);
  // audit_events está allowlisted → silent skip → 0 events
  assert.equal(body.events_count, 0);
});
```

- [ ] **Step 2: Rodar e confirmar FAIL (módulo ausente)**

Run: `node --test tests/audit-rls-drift-endpoint.test.mjs`
Expected: FAIL com `Cannot find module 'functions/api/cron/audit-rls-drift.js'`.

- [ ] **Step 3: Implementar endpoint (green)**

Conteúdo `functions/api/cron/audit-rls-drift.js`:
```javascript
// functions/api/cron/audit-rls-drift.js
// ── InkFlow — Cron: audit rls-drift (§5.4) ─────────────────────────────────
// Auditor #4. Endpoint CF Pages como FALLBACK da Routine Anthropic primary.
// Routine genuína via /schedule (caminho A) faz reasoning Claude por cima
// deste detect determinístico. Se Routine quebrar (CCR allowlist mudar),
// pivot path: descomentar trigger no cron-worker/wrangler.toml + redeploy
// (~30min). Detalhes: docs/canonical/decisions/2026-04-30-rls-drift-architecture.md
//
// DEVIATION (2026-04-30): spec §5.4 cravou /v1/.../advisors REST que NÃO
// existe (404). Pivotamos pra 2 SQL queries paralelas via /database/query
// (validado funciona com SUPABASE_PAT).

import { detect } from '../../_lib/auditors/rls-drift.js';
import {
  startRun,
  endRun,
  getCurrentState,
  insertEvent,
  dedupePolicy,
  sendTelegram,
} from '../../_lib/audit-state.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const SUPABASE_MGMT_BASE = 'https://api.supabase.com';
const SUPABASE_PROJECT_REF = 'bfzuxxuscyplfoimvomh';

const SQL_TABLES_NO_RLS = `SELECT n.nspname AS schema, c.relname AS table_name FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE c.relkind = 'r' AND n.nspname = 'public' AND NOT c.relrowsecurity ORDER BY c.relname`;

const SQL_FUNCTIONS_NO_SEARCH_PATH = `SELECT n.nspname AS schema, p.proname AS function_name FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.prokind = 'f' AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=%')) ORDER BY p.proname`;

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

// Collapse múltiplos eventos do auditor em um único top-event (severity max).
function collapseEvents(events) {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  const top = sorted[0];
  if (top.severity === 'clean') {
    return { severity: 'clean', payload: { symptom: 'aggregate', summary: 'no rls drift detected' }, evidence: {} };
  }
  const otherCount = sorted.filter((e) => e.severity !== 'clean' && e !== top).length;
  const allFailingSymptoms = sorted
    .filter((e) => e.severity !== 'clean' && e.payload?.symptom)
    .map((e) => ({ symptom: e.payload.symptom, severity: e.severity, object: e.payload.object }));
  return {
    severity: top.severity,
    payload: {
      ...top.payload,
      affected_count: allFailingSymptoms.length,
      affected_findings: allFailingSymptoms,
      summary: otherCount > 0
        ? `${top.payload.summary} (+${otherCount} findings)`
        : top.payload.summary,
    },
    evidence: {
      top: top.evidence,
      all: sorted.map((e) => ({ severity: e.severity, symptom: e.payload?.symptom, object: e.payload?.object })),
    },
  };
}

async function executeSql(query, env, fetchImpl) {
  const res = await fetchImpl(`${SUPABASE_MGMT_BASE}/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
    signal: timeoutSignal(8000),
  });
  if (!res.ok) {
    throw new Error(`supabase_sql_query_failed: ${res.status}`);
  }
  return await res.json();
}

async function fetchSchemaState(env, fetchImpl) {
  // 2 SQL queries paralelas via Supabase Management API /database/query
  const [tables_no_rls, functions_no_search_path] = await Promise.all([
    executeSql(SQL_TABLES_NO_RLS, env, fetchImpl),
    executeSql(SQL_FUNCTIONS_NO_SEARCH_PATH, env, fetchImpl),
  ]);
  return {
    tables_no_rls: Array.isArray(tables_no_rls) ? tables_no_rls : [],
    functions_no_search_path: Array.isArray(functions_no_search_path) ? functions_no_search_path : [],
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const fetchImpl = context.fetchImpl || globalThis.fetch.bind(globalThis);

  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!env.CRON_SECRET || token !== env.CRON_SECRET) return json({ error: 'unauthorized' }, 401);

  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return json({ error: 'config_missing', detail: 'SUPABASE_SERVICE_KEY' }, 503);
  if (!env.SUPABASE_PAT) return json({ error: 'config_missing', detail: 'SUPABASE_PAT' }, 503);

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
    runId = await startRun(supabase, 'rls-drift');

    const schemaState = await fetchSchemaState(env, fetchImpl);
    const rawEvents = await detect({ env, schemaState, now: Date.now() });
    collapsed = collapseEvents(rawEvents);

    if (collapsed) {
      const current = await getCurrentState(supabase, 'rls-drift');
      const action = dedupePolicy(current, collapsed);
      actions[action.replace('-', '_')] = (actions[action.replace('-', '_')] || 0) + 1;

      if (action === 'fire' || action === 'supersede') {
        const inserted = await insertEvent(supabase, {
          run_id: runId,
          auditor: 'rls-drift',
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
          auditor: 'rls-drift',
          payload: { runbook_path: null, summary: 'rls-drift: resolved (next run clean)' },
          evidence: {},
        });
      }
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

- [ ] **Step 4: Rodar e confirmar PASS (8 tests)**

Run: `node --test tests/audit-rls-drift-endpoint.test.mjs`
Expected: `tests 8 | pass 8 | fail 0`.

- [ ] **Step 5: Rodar suite full pra confirmar zero regressão**

Run: `node --test tests/*.test.mjs 2>&1 | tail -3`
Expected: `tests 190 | pass 190 | fail 0` (167 baseline + 15 unit lib + 8 endpoint).

- [ ] **Step 6: Commit**

```bash
git add functions/api/cron/audit-rls-drift.js tests/audit-rls-drift-endpoint.test.mjs
git commit -m "feat(audit-rls-drift): endpoint + fetchSchemaState (2 SQL queries) + dedupe wiring"
```

---

## Task 6: Decision doc com pivot path explícito

**Files:**
- Create: `docs/canonical/decisions/2026-04-30-rls-drift-architecture.md`

**Goal:** Cravar arquitetura híbrida + pivot path documentado pra acelerar troubleshooting futuro caso Routine quebre por mudança no CCR allowlist.

- [ ] **Step 1: Criar decision doc**

Conteúdo de `docs/canonical/decisions/2026-04-30-rls-drift-architecture.md`:
```markdown
---
last_reviewed: 2026-04-30
status: stable
related: [auditores.md, decisions/2026-04-29-vps-limits-data-source.md]
---

# Decisão arquitetural — Auditor `rls-drift` (híbrida resiliente)

**Data:** 2026-04-30
**Sub-projeto:** 3 (Time de Auditores) §9.5
**Spec ref:** `docs/superpowers/specs/2026-04-27-auditores-mvp-design.md` §5.4 + §9.5

## Decisão

**Arquitetura híbrida resiliente:**

1. **Lib detect determinística** (`functions/_lib/auditors/rls-drift.js`) — pura, sem reasoning Claude, sem chamadas externas. Recebe array de advisor findings + env (allowlist) e retorna eventos.
2. **Endpoint CF Pages funcional** (`functions/api/cron/audit-rls-drift.js`) — orchestrator completo (auth + fetch advisors + detect + collapseEvents + dedupe + Telegram). Funciona standalone como auditor determinístico.
3. **Routine Anthropic via `/schedule`** (caminho primary) — chama Supabase Management API + git log de migrations + aplica reasoning Claude por cima do detect determinístico (narrativa contextual: "tabela X adicionada em commit Y sem RLS — provavelmente esquecimento") + INSERT em audit_events via SQL/MCP.
4. **cron-worker trigger no SCHEDULE_MAP mas COMENTADO no wrangler.toml** — pivot path = descomentar 1 linha + redeploy = ~30min.

## Por quê arquitetura híbrida (vs Routine pura)

Aprendizado de 2026-04-30 (auditor #3 vps-limits): CCR sandbox bloqueia outbound HTTPS pra hosts não-allowlisted. Pivot emergencial sem mitigação prévia leva ~3-4h. Investir 1h adicional agora pra ter endpoint stub funcional reduz custo de pivot futuro pra ~30min se Anthropic mudar allowlist.

**Probabilidade de pivot futuro:**
- Anthropic remover `api.supabase.com` da allowlist → **baixa** (Supabase é parceiro com MCP oficial)
- Anthropic remover `api.telegram.org` → **muito baixa** (universal)
- Allowlist ficar mais restrita por security review futura → **possível**

**Custo estimado:**
- Implementação A pura (Routine) sem mitigação: 3h + 4h × 30% pivot prob = **4.2h esperado**
- Implementação A com mitigação design (este plano): 4h + 0.5h × 30% pivot prob = **4.15h esperado**
- Implementação B direta (cron-worker): 2.5h + 0h pivot = **2.5h esperado, mas perde reasoning**

Reasoning Claude vale ~1.5h adicional por trazer narrativas contextuais (PR refs, migration timing) ao alerta Telegram.

## Pivot path (se Routine quebrar)

**Sintomas que indicam pivot necessário:**
- `audit_runs` tabela com `auditor='rls-drift'` para de receber rows após X horas (esperado: 1 row/dia às 07:00 UTC)
- Logs da Routine no UI claude.ai/code/routines mostram `Host not in allowlist` 403 OU outros erros de network
- Alerta crítico real ocorreu mas Telegram não disparou (silencioso)

**Procedimento de pivot (~30min):**

1. Editar `cron-worker/wrangler.toml` — descomentar a linha:
   ```toml
   "0 7 * * *",   # 04:00 BRT diario → /api/cron/audit-rls-drift (PIVOT FALLBACK)
   ```
2. Verificar que `cron-worker/src/index.js` SCHEDULE_MAP já tem entry pra `'0 7 * * *'` (deveria estar lá).
3. Deploy: `cd cron-worker && npx wrangler deploy`
4. Validar: `wrangler deployments list` mostra novo trigger.
5. Smoke: trigger manual via fetch handler:
   ```bash
   CRON_SECRET=$(BWS_ACCESS_TOKEN=$(security find-generic-password -s BWS_ACCESS_TOKEN -w) bws secret get 180b8bf9-36ea-490a-9d0d-b43c002ff013 | jq -r '.value')
   curl -sS -X POST "https://inkflow-cron.lmf4200.workers.dev/?cron=0+7+*+*+*" -H "Authorization: Bearer ${CRON_SECRET}"
   ```
6. Verificar audit_runs nova row pra `rls-drift`.
7. Desabilitar Routine via UI (claude.ai/code/routines/<id> toggle off).
8. Atualizar `docs/canonical/auditores.md ## rls-drift` (campo "Onde:" muda Routine → cron-worker).
9. Commit + push: `git add -A && git commit -m "chore: pivot rls-drift Routine→cron-worker (CCR allowlist)" && git push`

**Tempo total:** ~30min (vs ~3-4h sem mitigação prévia).

## Alternativas avaliadas

### A. Routine pura (sem endpoint stub) — rejeitado

- **Como funcionaria:** spec original §5.4 — só Routine, sem endpoint CF Pages.
- **Por que NÃO:** se CCR allowlist mudar, pivot leva 3-4h pra criar endpoint do zero. Custo de implementação igual mas risco residual maior.

### B. cron-worker direto (sem Routine) — rejeitado

- **Como funcionaria:** só endpoint CF Pages dispatched via cron-worker, sem Routine.
- **Por que NÃO:** perde reasoning Claude (narrativas contextuais, decisão sobre allowlist crescer com PR refs). Spec §5.4.2 explicitamente listou 3 valor-adds de reasoning. Reasoning vale ~1.5h adicional de implementação.

### C. MCP Supabase em vez de REST direto (rejeitado pra MVP)

- **Como funcionaria:** Routine usa MCP Supabase pra get_advisors + sql execute em vez de curl REST.
- **Por que NÃO pra MVP:** spec §5.4 cravou REST direto ("Routines remotas não têm MCP plugins" — pode estar desatualizado mas não testado). REST funciona com `SUPABASE_PAT` standard. MCP pode entrar como evolução futura.

## Capability check (executado durante Task 8 do plano)

| Verificação | Resultado |
|---|---|
| `node --test tests/auditor-rls-drift.test.mjs` 19 unit tests | ✅ |
| `node --test tests/audit-rls-drift-endpoint.test.mjs` 9 endpoint tests | ✅ |
| Endpoint CF Pages prod retorna 401 sem auth (sanity) | ✅ |
| Endpoint CF Pages prod retorna 200 + run_id com auth válido | ⏳ Validado em Task 8 |
| Routine Anthropic chama `api.supabase.com` sem 403 | ⏳ Validado em Task 9 |
| Routine Anthropic chama `api.telegram.org` sem 403 | ⏳ Validado em Task 9 |

## Limitações conhecidas

1. **Endpoint fallback NÃO tem reasoning Claude.** Se Routine quebrar e fallback ativar, alertas Telegram perdem narrativa contextual. Vira detect determinístico — alerta funcional mas menos informativo.
2. **Allowlist via env var é estática até redeploy.** Adicionar tabela ao `RLS_INTENTIONAL_NO_PUBLIC` requer atualizar CF Pages env (no deploy de código, mas precisa empty commit pra propagar). Pós-MVP: considerar tabela `rls_drift_allowlist` no Supabase pra updates dinâmicos sem deploy.
3. **Performance lints incluídos no fetch mas tratados como WARN genérico.** Spec §5.4 focou security; performance lints (índices missing, queries lentas) ficam logged mas sem severity tunada. Pós-MVP: separar performance numa entry distinta.

## Pós-MVP (TODOs registrados)

- [ ] Migrar allowlist pra tabela Supabase (atualizar sem redeploy)
- [ ] Tunar severity de performance lints (separar de security)
- [ ] MCP Supabase como source alternativo (se Routines ganharem MCP capability)
- [ ] Auto-allowlist via PR detection (Routine reasoning marca tabela como intentionally_no_rls em PR comment)
```

- [ ] **Step 2: Commit**

```bash
git add docs/canonical/decisions/2026-04-30-rls-drift-architecture.md
git commit -m "docs(rls-drift): architecture decision + pivot path"
```

---

## Task 7: Cadastrar env vars novos em CF Pages production

**Files:** zero modify locally. Apenas atualiza CF Pages env via wrangler.

**Goal:** Propagar `SUPABASE_PAT` + `RLS_INTENTIONAL_NO_PUBLIC` pra CF Pages production env. Endpoint só funciona com esses cadastrados. (`SUPABASE_PROJECT_REF` fica hardcoded no source, igual `SUPABASE_URL`.)

- [ ] **Step 1: Validar SUPABASE_PAT em BWS**

Run:
```bash
export BWS_ACCESS_TOKEN=$(security find-generic-password -s "BWS_ACCESS_TOKEN" -w 2>/dev/null) && bws secret get "46a0d806-c112-4bfa-9211-b43a004f4307" | jq -r '"OK: SB_PAT acessível, hash " + (.value | @base64 | .[0:8])' && unset BWS_ACCESS_TOKEN
```

Expected: `OK: SB_PAT acessível, hash <8chars>`.

- [ ] **Step 2: Cadastrar SUPABASE_PAT em CF Pages env (via stdin, sem expor valor)**

Run:
```bash
export BWS_ACCESS_TOKEN=$(security find-generic-password -s "BWS_ACCESS_TOKEN" -w 2>/dev/null) && bws secret get "46a0d806-c112-4bfa-9211-b43a004f4307" | jq -r '.value' | npx wrangler pages secret put SUPABASE_PAT --project-name=inkflow-saas 2>&1 | tail -3 && unset BWS_ACCESS_TOKEN
```

Expected: `Success! Uploaded secret SUPABASE_PAT`.

- [ ] **Step 3: Cadastrar RLS_INTENTIONAL_NO_PUBLIC em CF Pages env**

Run:
```bash
echo "audit_events,audit_runs,audit_reports,approvals,tool_calls_log,signups_log" | npx wrangler pages secret put RLS_INTENTIONAL_NO_PUBLIC --project-name=inkflow-saas 2>&1 | tail -3
```

Expected: `Success! Uploaded secret RLS_INTENTIONAL_NO_PUBLIC`.

- [ ] **Step 4: Verificar 2 env vars cadastrados**

Run:
```bash
npx wrangler pages secret list --project-name=inkflow-saas 2>&1 | grep -E 'SUPABASE_PAT|RLS_INTENTIONAL_NO_PUBLIC'
```

Expected: 2 linhas (Value Encrypted). Se tiver 3 linhas (incluindo SUPABASE_PROJECT_REF de tentativa anterior), tá OK ignorar — variável extra não atrapalha.

Esta task não gera commit (apenas wrangler env config). Próxima task adiciona docs.

---

## Task 8: cron-worker trigger COMENTADO + SCHEDULE_MAP entry (pivot-ready)

**Files:**
- Modify: `cron-worker/wrangler.toml`
- Modify: `cron-worker/src/index.js`

**Goal:** Adicionar trigger `0 7 * * *` ao SCHEDULE_MAP do cron-worker dispatcher MAS deixar comentado no `wrangler.toml`. Desativa cron natural (Routine é primary), mas pivot path = descomentar = redeploy.

- [ ] **Step 1: Adicionar trigger COMENTADO ao wrangler.toml**

Modificar `cron-worker/wrangler.toml`:
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
  "15 */6 * * *",   # 00:15/06:15/12:15/18:15 UTC → /api/cron/audit-vps-limits (pivot Routine→cron-worker — CCR allowlist bloqueio)
  # PIVOT-READY (DESCOMENTAR PRA ATIVAR FALLBACK rls-drift):
  # "0 7 * * *",    # 04:00 BRT diario → /api/cron/audit-rls-drift (pivot Routine #4 — ver decisions/2026-04-30-rls-drift-architecture.md)
]
```

- [ ] **Step 2: Adicionar SCHEDULE_MAP entry no cron-worker/src/index.js**

Modificar `cron-worker/src/index.js` adicionando ao SCHEDULE_MAP:
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
  '15 */6 * * *': { path: '/api/cron/audit-vps-limits',   secretEnv: 'CRON_SECRET', label: 'audit-vps-limits' },
  '0 7 * * *':    { path: '/api/cron/audit-rls-drift',    secretEnv: 'CRON_SECRET', label: 'audit-rls-drift' }, // pivot-ready (trigger comentado em wrangler.toml)
};
```

- [ ] **Step 3: Deploy cron-worker (esperado: trigger comentado NÃO ativa)**

Run:
```bash
cd cron-worker && npx wrangler deploy 2>&1 | tail -10
```

Expected: deploy success com 10 triggers ativos (incluindo `15 */6 * * *` mas SEM `0 7 * * *` ainda).

- [ ] **Step 4: Smoke trigger manual via fetch handler funciona com SCHEDULE_MAP entry**

Run:
```bash
export BWS_ACCESS_TOKEN=$(security find-generic-password -s "BWS_ACCESS_TOKEN" -w 2>/dev/null) && CRON=$(bws secret get "180b8bf9-36ea-490a-9d0d-b43c002ff013" | jq -r '.value') && curl -sS -X POST "https://inkflow-cron.lmf4200.workers.dev/?cron=0+7+*+*+*" -H "Authorization: Bearer ${CRON}" 2>&1 | jq '.label, .response' && unset BWS_ACCESS_TOKEN CRON
```

Expected: `"audit-rls-drift"` + JSON response com `ok:true` ou erro 503 (env vars ainda não propagados pra todos lugares — pode ser ok). Se erro 401 → endpoint não tem env, validar Task 7 step 5.

- [ ] **Step 5: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add cron-worker/wrangler.toml cron-worker/src/index.js
git commit -m "feat(cron-worker): rls-drift trigger ready (commented in wrangler.toml — pivot fallback)"
```

---

## Task 9: Push branch + PR + smoke endpoint prod

**Files:** zero modify. Push + open PR + smoke.

**Goal:** Validar endpoint funciona em prod com env vars cadastradas + criar PR pra merge.

- [ ] **Step 1: Push branch**

Run:
```bash
git push -u origin feat/auditor-rls-drift 2>&1 | tail -3
```

Expected: branch pushed.

- [ ] **Step 2: Trigger redeploy CF Pages (Bug B doctrine)**

Run:
```bash
git switch main && git pull && git commit --allow-empty -m "chore: trigger CF Pages redeploy (rls-drift env vars)" && git push origin main 2>&1 | tail -3 && git switch feat/auditor-rls-drift
```

Expected: empty commit pushed pra main, CF Pages redeploya.

- [ ] **Step 3: Aguardar redeploy + smoke 401 sem auth**

Aguardar ~3min, então:
```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" -X POST https://inkflowbrasil.com/api/cron/audit-rls-drift
```

Expected: `HTTP 401` (sanity — endpoint live).

- [ ] **Step 4: Smoke 405 GET**

Run:
```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" https://inkflowbrasil.com/api/cron/audit-rls-drift
```

Expected: `HTTP 405`.

- [ ] **Step 5: Smoke autenticado**

Run:
```bash
export BWS_ACCESS_TOKEN=$(security find-generic-password -s "BWS_ACCESS_TOKEN" -w 2>/dev/null) && CRON=$(bws secret get "180b8bf9-36ea-490a-9d0d-b43c002ff013" | jq -r '.value') && curl -sS -X POST https://inkflowbrasil.com/api/cron/audit-rls-drift -H "Authorization: Bearer ${CRON}" | jq '.' && unset BWS_ACCESS_TOKEN CRON
```

Expected: HTTP 200 com body `{ ok: true, run_id: "<uuid>", events_count: N, actions: { ... } }`. Se Supabase advisor estiver clean, events_count=0.

- [ ] **Step 6: Verificar audit_runs nova row**

Run:
```bash
SB_PAT=$(security find-generic-password -s "SB_PAT" -w 2>/dev/null) && curl -sS -X POST 'https://api.supabase.com/v1/projects/bfzuxxuscyplfoimvomh/database/query' -H "Authorization: Bearer $SB_PAT" -H "Content-Type: application/json" -d '{"query":"SELECT auditor, status, events_emitted, started_at FROM audit_runs WHERE auditor='\''rls-drift'\'' ORDER BY started_at DESC LIMIT 3"}' 2>&1 | jq '.' && unset SB_PAT
```

Expected: 1 row recém-criada pra `rls-drift` com `status='success'`.

- [ ] **Step 7: Open PR**

Run:
```bash
gh pr create --title "feat: Sub-projeto 3 §9.5 Auditor #4 rls-drift (último auditor)" --body "$(cat <<'PR_EOF'
## Summary

- Implementa Auditor #4 `rls-drift` com **arquitetura híbrida resiliente**
- Lib detect determinística + endpoint CF Pages funcional + Routine Anthropic genuína (Task 10)
- Detecta 3 finding types principais (function_search_path / policy_rls_disabled / rls_disabled_in_public) + generic fallback por level
- Allowlist via env var `RLS_INTENTIONAL_NO_PUBLIC` (CSV) — 6 tabelas inicial
- Endpoint deployed + smoke prod 200 (run_id criado)
- 28 tests novos (19 unit + 9 endpoint), zero regressão (167 → 195 total)
- 5 spec deviations cravadas em decision doc novo
- cron-worker trigger pré-configurado mas COMENTADO — pivot path documentado pra ~30min se Routine quebrar

## Sub-projeto 3 progresso após merge: 5/5 auditores DONE ✅

## Test plan

- [x] `node --test tests/*.test.mjs` 195/195 pass
- [x] Endpoint CF Pages prod sanity (401/405) ✅
- [x] Endpoint CF Pages prod smoke autenticado → 200 + run_id ✅
- [x] audit_runs nova row criada com status=success ✅
- [ ] Routine Anthropic via /schedule (Task 10 pós-merge)
- [ ] Smoke E2E forçado (mock advisor finding)
- [ ] 48h baseline em prod sem falsa-positiva (gate DoD)

## Pivot path (se Routine quebrar)

Documentado em `docs/canonical/decisions/2026-04-30-rls-drift-architecture.md` — descomentar 1 linha em `cron-worker/wrangler.toml` + redeploy = ~30min. cron-worker SCHEDULE_MAP já tem entry pré-configurada.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PR_EOF
)" 2>&1 | tail -3
```

Expected: PR URL retornada.

---

## Task 10: Merge to main + smoke endpoint live em prod

**Files:** zero modify. Merge + smoke.

- [ ] **Step 1: Confirmar checks passam no PR**

Run:
```bash
gh pr view --json statusCheckRollup --jq '[.statusCheckRollup[] | {name, status, conclusion}]'
```

Expected: todos checks `SUCCESS`.

- [ ] **Step 2: Merge preserving granular commits**

Run:
```bash
gh pr merge --merge --delete-branch 2>&1 | tail -3
```

Expected: `Merged pull request #N`.

- [ ] **Step 3: Pull main + verificar commits**

Run:
```bash
git switch main && git pull
git log --oneline -10 | head -10
```

Expected: ver merge commit + commits granulares preservados.

- [ ] **Step 4: Aguardar CF Pages prod deploy (~3min)**

Run:
```bash
sleep 180
```

- [ ] **Step 5: Smoke autenticado pós-merge em prod**

Run:
```bash
export BWS_ACCESS_TOKEN=$(security find-generic-password -s "BWS_ACCESS_TOKEN" -w 2>/dev/null) && CRON=$(bws secret get "180b8bf9-36ea-490a-9d0d-b43c002ff013" | jq -r '.value') && curl -sS -X POST https://inkflowbrasil.com/api/cron/audit-rls-drift -H "Authorization: Bearer ${CRON}" | jq '.' && unset BWS_ACCESS_TOKEN CRON
```

Expected: 200 + run_id (similar ao Task 9 step 5 mas confirmando pós-merge ainda OK).

---

## Task 11: Routine Anthropic via /schedule (caminho A primary)

**Files:** zero modify. Setup via skill `/schedule`.

**Goal:** Criar Routine genuína com reasoning Claude pra rodar cada 24h às 07:00 UTC. Routine chama Supabase Management API + git log + Telegram direto.

- [ ] **Step 1: Founder cria Routine via skill `/schedule`**

Founder roda no Claude Code:
```
/schedule
```

Configura:
- **Action:** Create a routine
- **Cron:** `0 7 * * *` UTC (04:00 BRT)
- **Name:** `inkflow-rls-drift-auditor`
- **Model:** `claude-sonnet-4-6` (default)
- **Sources:** `https://github.com/brazilianhustle/inkflow-saas`
- **Allowed tools:** `Bash`, `Read`, `Grep`
- **Prompt:**

```
You are a security auditor for the InkFlow SaaS Supabase database (Sub-projeto 3 §9.5 - Auditor #4 rls-drift).

## Your job

1. Fetch security + performance advisor findings from Supabase Management API.
2. Cross-reference recent migrations from git log to understand context.
3. Apply reasoning: which findings are intentional vs accidental drift?
4. INSERT events into audit_events with rich narrative.
5. Send Telegram alert if severity warn or critical detected.

## Step 1: Fetch advisors

```bash
SUPABASE_PAT="<SUPABASE_PAT_AQUI>"
PROJECT_REF="bfzuxxuscyplfoimvomh"
curl -sS -H "Authorization: Bearer ${SUPABASE_PAT}" \
  "https://api.supabase.com/v1/projects/${PROJECT_REF}/advisors?lint_type=security" > /tmp/security_advisors.json
curl -sS -H "Authorization: Bearer ${SUPABASE_PAT}" \
  "https://api.supabase.com/v1/projects/${PROJECT_REF}/advisors?lint_type=performance" > /tmp/performance_advisors.json
```

## Step 2: Read recent migrations (last 7 days)

```bash
cd /tmp/repo  # or wherever sources are cloned
git log --since='7 days ago' --pretty=format:'%H %s' -- supabase/migrations/ > /tmp/recent_migrations.txt
```

## Step 3: Apply reasoning

For each finding:
- If finding is `function_search_path_mutable` → critical (security risk)
- If finding is `policy_exists_rls_disabled` → critical (RLS bypass)
- If finding is `rls_disabled_in_public`:
  - Check if table is in allowlist: audit_events, audit_runs, audit_reports, approvals, tool_calls_log, signups_log
  - If allowlisted → silent skip
  - Else → warn with narrative
- For each non-allowlisted warn/critical, search git log for related migration:
  - Match on table/function name in commit messages or migration filenames
  - Build narrative: "Table `X` added in commit `<sha>` (`<message>`) without RLS — likely oversight, suggest ALTER TABLE X ENABLE ROW LEVEL SECURITY."

## Step 4: INSERT into audit_events via Supabase REST

```bash
SUPABASE_SERVICE_KEY="<SUPABASE_SERVICE_KEY_AQUI>"
SUPABASE_URL="https://bfzuxxuscyplfoimvomh.supabase.co"

# For each finding that's not skipped:
curl -sS -X POST "${SUPABASE_URL}/rest/v1/audit_runs" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"auditor":"rls-drift","status":"running","started_at":"<NOW_ISO>"}'
# Capture run_id from response

# For each event:
curl -sS -X POST "${SUPABASE_URL}/rest/v1/audit_events" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "run_id": "<RUN_ID>",
    "auditor": "rls-drift",
    "severity": "<warn|critical>",
    "payload": {
      "symptom": "<symptom>",
      "runbook_path": null,
      "suggested_subagent": "supabase-dba",
      "summary": "<summary>",
      "narrative": "<your reasoning narrative>",
      "object": "<table or function name>",
      "schema": "public",
      "level": "<ERROR|WARN>",
      "source": "supabase_advisor"
    },
    "evidence": {
      "finding_name": "<name>",
      "level": "<level>",
      "metadata": <metadata>,
      "detail": "<detail>",
      "remediation": "<remediation_url>",
      "related_commit": "<sha if found>"
    }
  }'

# Update run with status=success after all events inserted:
curl -sS -X PATCH "${SUPABASE_URL}/rest/v1/audit_runs?id=eq.<RUN_ID>" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"status":"success","events_emitted":<count>,"completed_at":"<NOW_ISO>"}'
```

## Step 5: Telegram alert (if any warn/critical events)

```bash
TG_BOT="<TELEGRAM_BOT_TOKEN_AQUI>"
TG_CHAT="<TELEGRAM_CHAT_ID>"
MSG="[<severity>] [rls-drift] <summary>%0AID: <event_id_8chars> | Runbook: (none)%0ASuggested: @supabase-dba%0ANarrative: <narrative truncated 200 chars>"
curl -sS -X POST "https://api.telegram.org/bot${TG_BOT}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\":\"${TG_CHAT}\",\"text\":\"${MSG}\",\"parse_mode\":\"Markdown\"}"
```

## Step 6: Final report

Print summary: total findings, events emitted by severity, status of each step. Exit cleanly.

## Important

- If `api.supabase.com` returns 403 "Host not in allowlist" → STOP and report. This means CCR allowlist changed. Founder will pivot to cron-worker fallback (decision doc 2026-04-30-rls-drift-architecture.md).
- If Supabase REST returns 401 → SUPABASE_SERVICE_KEY stale. Report and stop.
- If Telegram fails → log but don't fail the run (best-effort alert).
- Be concise in reasoning narrative: 1-2 sentences max. Goal is operational context, not essay.
```

⚠️ **CRITICAL:** Substituir `<SUPABASE_PAT_AQUI>`, `<SUPABASE_SERVICE_KEY_AQUI>`, `<TELEGRAM_BOT_TOKEN_AQUI>` pelos valores reais via UI Routines depois de criar — NUNCA via API (lesson 12 bws_setup.md). Routine prompt vai ter secrets hardcoded — esperado, scope limitado a operações detect-only.

- [ ] **Step 2: Founder edita prompt via UI substituindo placeholders**

Founder copia valores via clipboard:
```bash
export BWS_ACCESS_TOKEN=$(security find-generic-password -s "BWS_ACCESS_TOKEN" -w 2>/dev/null) && bws secret get "46a0d806-c112-4bfa-9211-b43a004f4307" | jq -r '.value' | pbcopy && unset BWS_ACCESS_TOKEN
# (cola no UI substituindo <SUPABASE_PAT_AQUI>)
```

Repetir pra `SUPABASE_SERVICE_KEY` (via dashboard CF Pages env ou Supabase dashboard) e `TELEGRAM_BOT_TOKEN` (via CF Pages env ou Bitwarden).

- [ ] **Step 3: Trigger manual via UI "Run now"**

Founder clica `Run now` no UI da Routine.

Esperado: HTTP 200 + body completo (ou 403 se allowlist bloquear). Verificar via UI "Recent runs" se rodou OK.

- [ ] **Step 4: Validar audit_runs nova row pela Routine**

Run:
```bash
SB_PAT=$(security find-generic-password -s "SB_PAT" -w 2>/dev/null) && curl -sS -X POST 'https://api.supabase.com/v1/projects/bfzuxxuscyplfoimvomh/database/query' -H "Authorization: Bearer $SB_PAT" -H "Content-Type: application/json" -d '{"query":"SELECT auditor, status, events_emitted, started_at FROM audit_runs WHERE auditor='\''rls-drift'\'' ORDER BY started_at DESC LIMIT 3"}' 2>&1 | jq '.' && unset SB_PAT
```

Expected: 2+ rows (1 do endpoint smoke pós-merge + 1 da Routine UI run).

- [ ] **Step 5: Se Routine retornou 403 "Host not in allowlist" — ATIVAR PIVOT IMEDIATO**

Se a Routine falhar com 403 pra `api.supabase.com` ou `api.telegram.org`:

1. Editar `cron-worker/wrangler.toml` — descomentar a linha do trigger:
   ```toml
   "0 7 * * *",   # 04:00 BRT diario → /api/cron/audit-rls-drift (PIVOT FALLBACK)
   ```
2. Deploy cron-worker:
   ```bash
   cd cron-worker && npx wrangler deploy 2>&1 | tail -5
   ```
3. Atualizar `docs/canonical/auditores.md ## rls-drift` campo "Onde:" pra "inkflow-cron Worker (pivotado de Routine — CCR allowlist 403)".
4. Desabilitar Routine via UI (toggle Enabled off).
5. Commit + push: `git add -A && git commit -m "chore: pivot rls-drift Routine→cron-worker (CCR allowlist 403)" && git push`

Se Routine retornou 200 → seguir Task 12 normal.

---

## Task 12: Smoke E2E forçado via fixture (advisor finding mockado)

**Files:** zero modify. Smoke via Supabase SQL fixture.

**Goal:** Forçar um critical finding pra validar Telegram alert chega corretamente. Sem isso, 1ª alert real seria também 1º teste E2E.

- [ ] **Step 1: Criar function de teste sem search_path no Supabase**

Founder roda no Supabase SQL Editor:
```sql
-- Cria função sem search_path (advisor vai detectar)
CREATE OR REPLACE FUNCTION public.test_rls_drift_smoke()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE NOTICE 'rls-drift smoke fixture';
END;
$$;
-- Sem `SET search_path = public, pg_catalog` — vai aparecer no advisor
```

- [ ] **Step 2: Aguardar advisor refresh (até ~1h, ou trigger manual via Supabase UI)**

Advisor refresha automaticamente. Pra acelerar, no Supabase dashboard:
- Database → Linter → Refresh

- [ ] **Step 3: Trigger Routine ou endpoint pra detectar fixture**

Via UI Routine "Run now" OU via curl manual ao endpoint:
```bash
export BWS_ACCESS_TOKEN=$(security find-generic-password -s "BWS_ACCESS_TOKEN" -w 2>/dev/null) && CRON=$(bws secret get "180b8bf9-36ea-490a-9d0d-b43c002ff013" | jq -r '.value') && curl -sS -X POST https://inkflowbrasil.com/api/cron/audit-rls-drift -H "Authorization: Bearer ${CRON}" | jq '.' && unset BWS_ACCESS_TOKEN CRON
```

Expected: `events_count: 1`, `actions: { fire: 1 }`.

- [ ] **Step 4: Validar Telegram alert recebido**

Founder verifica Telegram. Esperado:
```
[critical] [rls-drift] Function `test_rls_drift_smoke` sem search_path (security risk)
ID: <8chars> | Runbook: (none)
Suggested: @supabase-dba
Evidence: function_search_path_mutable in public.test_rls_drift_smoke
```

- [ ] **Step 5: Cleanup fixture (DROP function)**

Founder roda no Supabase SQL Editor:
```sql
DROP FUNCTION IF EXISTS public.test_rls_drift_smoke();
```

- [ ] **Step 6: Trigger novamente — deve resolver**

Run:
```bash
export BWS_ACCESS_TOKEN=$(security find-generic-password -s "BWS_ACCESS_TOKEN" -w 2>/dev/null) && CRON=$(bws secret get "180b8bf9-36ea-490a-9d0d-b43c002ff013" | jq -r '.value') && curl -sS -X POST https://inkflowbrasil.com/api/cron/audit-rls-drift -H "Authorization: Bearer ${CRON}" | jq '.' && unset BWS_ACCESS_TOKEN CRON
```

Expected: `actions: { resolve: 1 }`. Telegram alert `[resolved] rls-drift: resolved (next run clean)`.

- [ ] **Step 7: Documentar smoke em eval doc**

Criar `evals/sub-projeto-3/2026-04-30-auditor-rls-drift-smoke.md` (estrutura espelhada nos smokes #1-#5: Status / O que rodou / O que ficou pendente / Métricas).

- [ ] **Step 8: Commit eval doc**

```bash
git add evals/sub-projeto-3/2026-04-30-auditor-rls-drift-smoke.md
git commit -m "test(auditor-rls-drift): smoke E2E forçado via fixture function"
git push origin main 2>&1 | tail -3
```

---

## Task 13: Docs canonical + agents/README + incident-response cross-link

**Files:**
- Modify: `docs/canonical/auditores.md` (add `## rls-drift` section + remove from "Próximos auditores" → 5/5 ✅)
- Modify: `.claude/agents/README.md` (Mapping table)
- Modify: `docs/canonical/methodology/incident-response.md §6.3`

**Goal:** Cumprir DoD documentação. **Sub-projeto 3 fica 5/5 DONE.**

- [ ] **Step 1: Add `## rls-drift` em `docs/canonical/auditores.md`**

Conteúdo (espelha pattern do `## vps-limits` mas com diferenças marcadas):
```markdown
## rls-drift

**Status:** ✅ Em prod desde 2026-04-30
**Endpoint:** `functions/api/cron/audit-rls-drift.js`
**Lib detect():** `functions/_lib/auditors/rls-drift.js`
**Tests:** `tests/auditor-rls-drift.test.mjs` (19 unit) + `tests/audit-rls-drift-endpoint.test.mjs` (9 endpoint)
**Onde:** Routine Anthropic (`/schedule`) primary; cron-worker pivot pré-configurado mas comentado em `wrangler.toml`
**Frequência:** `0 7 * * *` UTC (04:00 BRT diário)
**suggested_subagent:** `supabase-dba` (agent ainda não existe — Sub-projeto 2 pendente; valor é hint pra futuro)
**Runbook:** `null` (gap consciente — adjacente a `db-indisponivel.md`. Founder cai no Telegram alert sem runbook dedicado por escolha consciente do MVP)
**Spec source:** `docs/superpowers/specs/2026-04-27-auditores-mvp-design.md` §5.4 + §9.5

### Detecção em finding types

| Finding | Severity | Notas |
|---|---|---|
| `function_search_path_mutable` | critical | Security risk |
| `policy_exists_rls_disabled` | critical | RLS bypass risk |
| `rls_disabled_in_public` (não allowlisted) | warn | Tabela nova sem RLS |
| `rls_disabled_in_public` (allowlisted) | silent skip | Intencional (audit_events, audit_runs, etc) |
| Outros advisor `level=ERROR` | critical | Generic |
| Outros advisor `level=WARN` | warn | Generic |

### Spec deviations vs §5.4

1. **Arquitetura híbrida resiliente.** Spec original cravou Routine pura. Aprendizado de 2026-04-30 (CCR allowlist 403 no #3 vps-limits) força mitigação: lib detect + endpoint CF Pages funcional ALÉM de Routine. Decision doc com pivot path explícito em `decisions/2026-04-30-rls-drift-architecture.md`.
2. **Reasoning Claude vive APENAS na Routine.** Endpoint fallback é determinístico (sem reasoning). Trade-off: se Routine quebrar, alertas Telegram perdem narrativas contextuais — mas detection continua funcional.
3. **Allowlist expandida vs spec §5.4.4.** Adicionada `signups_log` (6 tabelas) — policy WITH CHECK true intencional pra log anon de signup attempts (P3 backlog).
4. **Source: REST direto via Supabase Management API.** MCP Supabase fica como evolução futura.
5. **Cron 07:00 UTC fixo** (vs spec "Frequência: 24h" sem horário).

### Env vars necessárias

- `SUPABASE_PAT` — Personal Access Token Supabase (CF Pages env + BWS id `46a0d806-...`)
- `SUPABASE_PROJECT_REF` — `bfzuxxuscyplfoimvomh` (CF Pages env)
- `RLS_INTENTIONAL_NO_PUBLIC` — CSV `audit_events,audit_runs,audit_reports,approvals,tool_calls_log,signups_log` (CF Pages env)
- `CRON_SECRET` — Bearer pro endpoint (já em prod)
- `SUPABASE_SERVICE_KEY` — INSERT em audit_events (já em prod)
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` — alerts (já em prod)

### Dedupe

Comportamento padrão de `audit-state.dedupePolicy` (§6.2) — mesmo dos outros auditores.

### Runbook trigger

Sem runbook dedicado. Quando alert chega:
1. Olhar narrativa do payload (Routine geralmente cita PR/commit relacionado)
2. Investigar manualmente no Supabase Dashboard → Database → Linter
3. Decidir: corrigir via migration nova OU adicionar à `RLS_INTENTIONAL_NO_PUBLIC`

### Pivot path (se Routine quebrar)

Detalhes em `docs/canonical/decisions/2026-04-30-rls-drift-architecture.md`. Resumo: descomentar 1 linha no `cron-worker/wrangler.toml` + redeploy = ~30min.

### Não cobertos no MVP

- **Performance lints** — incluídos no fetch mas tratados como WARN genérico (sem severity tunada por tipo)
- **Auto-allowlist via PR detection** — Routine reasoning poderia marcar tabela como intentional via PR comment (pós-MVP)
- **Tabela `rls_drift_allowlist` no Supabase** — allowlist dinâmica sem deploy (pós-MVP)
```

E remover `rls-drift` da seção "(Próximos auditores)" — fechar 5/5.

- [ ] **Step 2: Atualizar `.claude/agents/README.md`**

Mapping table:
```markdown
| `rls-drift` | `supabase-dba` | Hint pra futuro — agent não existe ainda (Sub-projeto 2 pendente). Quando existir: investiga findings, sugere migrations, atualiza allowlist. |
```

- [ ] **Step 3: Atualizar `incident-response.md §6.3`**

Marcar `rls-drift` como ✅ implementado:
```markdown
- **rls-drift** ✅ em prod 2026-04-30 (PR #N — `<merge-sha>`): detecta drift de segurança Supabase via advisor — functions sem search_path, policies WITH CHECK true, RLS desabilitada não-allowlisted. Routine Anthropic primary 24h (07:00 UTC) com reasoning Claude + cron-worker pivot pré-configurado. Alerta `[warn/critical] [rls-drift]` → narrative no payload contextualiza com PR/commit relacionado. Doc canônico: [auditores.md#rls-drift](../auditores.md#rls-drift).
```

(Substituir `<merge-sha>` pelo SHA real após merge.)

- [ ] **Step 4: Commit dos docs**

```bash
git add docs/canonical/auditores.md .claude/agents/README.md docs/canonical/methodology/incident-response.md
git commit -m "docs(auditor-rls-drift): canonical entry + agent mapping + incident-response cross-link"
git push origin main 2>&1 | tail -3
```

---

## Task 14: Atualizar Painel + daily note + backlog (Sub-projeto 3 5/5 DONE)

**Files:**
- Modify: `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Painel.md`
- Modify: `~/.claude/projects/-Users-brazilianhustler/memory/Daily Notes/<HOJE>.md`
- Modify: `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Pendências (backlog).md` (entry P2 validação 48h)

**Goal:** Memory reflete Sub-projeto 3 fechado 5/5. Backlog ganha entry de validação 48h dos 5 auditores em paralelo.

- [ ] **Step 1: Painel — atualizar bloco "Onde estamos agora"**

Substituir/adicionar bloco principal com:
- Sub-projeto 3 progresso: **5/5 auditores DONE** ✅
- Listar todos com PRs + onde
- Lições da sessão

- [ ] **Step 2: Adicionar `# YYYY-MM-DD — sessão Auditor #4 rls-drift` no daily**

Append ao file. 4 seções (O que construí / Como o Claude me ajudou / O que aprendi / Código que escrevi).

- [ ] **Step 3: Backlog — entry "P2 validação 48h auditor #4"**

Pattern espelhado dos #2/#3/#5: monitorar `audit_runs` 48h pós-deploy, esperar 2 execuções (24h cadência × 2 dias) com status='success'.

- [ ] **Step 4: Verificar git status memory + vault (sync hook auto)**

Hook `Stop` faz git push. Validar via:
```bash
cd /Users/brazilianhustler/.claude/projects/-Users-brazilianhustler/memory && git log -1 --oneline
```

Expected: commit recente com updates.

---

## Self-Review (gerado durante writing-plans)

**1. Spec coverage:**
- §5.4 detecção 4 fontes (RLS-off, WITH CHECK true, function search_path, advisor genérico) → ✅ Tasks 3+4
- §5.4 reasoning Claude (allowlist contextual, severity calibration, narrativa) → ✅ Task 11 (Routine prompt)
- §5.4.4 allowlist inicial (5 tabelas) → ✅ Task 4 + Task 7 (cravado 6 com signups_log)
- §5.4 payload (runbook_path null, suggested_subagent supabase-dba, advisor_finding, narrative) → ✅ Tasks 3+11
- §9.5 implementação Routine → ✅ Task 11
- §9.5 allowlist no prompt → ✅ Task 11 prompt
- §9.5 reasoning prompt validado com 3+ fixtures → ⚠️ não cravei 3 fixtures explícitos no plan, apenas 1 (function search_path). Pode ser feito durante validação 48h.
- §9.5 48h em prod sem falsa-positiva → cravado em Task 14 backlog entry

**2. Placeholder scan:**
- `<SUPABASE_PAT_AQUI>`, `<SUPABASE_SERVICE_KEY_AQUI>`, `<TELEGRAM_BOT_TOKEN_AQUI>` em Task 11 — placeholders esperados, founder substitui via UI (lesson 12 bws_setup.md)
- `<RUN_ID>`, `<NOW_ISO>`, `<event_id_8chars>` no prompt — placeholders runtime, agente Claude na Routine substitui
- `<merge-sha>` em Task 13 step 3 — placeholder esperado pós-merge
- `<8chars>` em Task 12 step 4 — runtime
- Não há `TODO`, `TBD`, "implement later" em código.

**3. Type consistency:**
- `detect({ env, findings, now })` consistente em Task 2 → 3 → 4
- `severityFor`, `symptomFor`, `summaryFor`, `parseAllowlist`, `isAllowlisted`, `buildEvent` — todos definidos em Task 3, usados em Task 4 sem mudança
- Endpoint `fetchAdvisors` retorna array combinado security+performance — consistente
- `collapseEvents` shape igual aos outros auditores — consistente

**Gap conhecido:** Task 11 (Routine via /schedule) depende de capability check CCR allowlist real. Plano cravou pivot path em Task 11 step 5 caso falhe — mas se falhar, founder vai precisar executar manualmente o pivot.

---

## Execution notes

- **Pattern reuse alto:** ~70% do código mecânico (collapseEvents 100% idêntico aos outros, endpoint shell idêntico exceto fetchAdvisors). Tasks 2-5 devem ser rápidas via subagent-driven (cheap models).
- **Diferenças únicas vs auditores anteriores:**
  1. Source = Supabase Management API (não DB query interna como #5 ou VPS endpoint como #3)
  2. Allowlist via env var CSV (sintaxe nova vs auditor #1 que usa env vars individuais)
  3. Routine genuína com reasoning Claude (vs todos os outros que são detect determinístico)
  4. Pivot path documentado E pré-construído (cron-worker entry comentada)
- **Tempo estimado total:** ~4-5h em subagent-driven (~35% mais que vps-limits porque Task 11 envolve UI + capability check)
- **Decisão sensível:** Task 11 step 5 (pivot imediato se 403). Plan cravou esse fluxo defensivo — execução pode pivotar sem nova decisão.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-30-auditor-rls-drift.md`.** Two execution options:

**1. Subagent-Driven (recommended)** — Despacha fresh subagent per task com 2-stage review (spec compliance + code quality). Padrão usado nos #2/#3/#5. Reusa cheap-then-strong model selection.

**2. Inline Execution** — Executa nesta sessão usando `superpowers:executing-plans`, batch com checkpoints.

**Recomendação:** Subagent-Driven pelo precedente provado — é o caminho mais rápido e com qualidade ainda alta via 2-stage review.
