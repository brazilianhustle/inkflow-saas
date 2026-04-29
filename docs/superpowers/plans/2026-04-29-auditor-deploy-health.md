# Auditor #2 — `deploy-health` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o segundo auditor real do Sub-projeto 3 — `deploy-health` — que detecta falhas recentes na pipeline de deploy via 3 sintomas (GHA workflow failures, CF Pages build failures, opcional Wrangler drift) e dispara alerta Telegram com severity warn/critical via pipeline core já em prod.

**Architecture:** Função pura `detect({ env, fetchImpl, now })` em `functions/_lib/auditors/deploy-health.js` consulta GitHub Actions API + Cloudflare Pages API e retorna lista de eventos potenciais. Endpoint `functions/api/cron/audit-deploy-health.js` orquestra: `startRun` → `detect` → `collapseEvents` → `dedupePolicy(currentState, event)` → ação (`fire`/`silent`/`supersede`/`resolve`/`no-op`) → `endRun`. Cron `0 */6 * * *` no `inkflow-cron` Worker dispara o endpoint via dispatcher pattern já existente. Reusa lib `audit-state.js` sem refatorar.

**Tech Stack:** CF Pages Functions (ESM), `node:test` + `node:assert/strict` pra unit tests (sem deps externas), `cron-worker` (CF Workers) como dispatcher. Lib reusada: `functions/_lib/audit-state.js` (PR #10). Pattern reusado: `functions/_lib/auditors/key-expiry.js` (PR #11) e `functions/api/cron/audit-key-expiry.js` (PR #11) — clone estrutural com adaptação de fonte de dados.

---

## Spec reference

- **Spec:** `docs/superpowers/specs/2026-04-27-auditores-mvp-design.md` v1.1 (commit `e8402d0`)
- **Seções foco:** §5.2 (deploy-health), §6.1-6.2 (audit-state lib + dedupe), §6.3 (Telegram format), §9.2 (ordem implementação), §10 "Por auditor" (DoD)
- **Runbook linkado:** `docs/canonical/runbooks/rollback.md` (já existe, já menciona "Telegram alert do auditor `deploy-health` (quando ativo)" linha 19 — auditor está alinhado com runbook)
- **Suggested subagent:** `deploy-engineer`
- **Plan precedente reusado como referência:** `docs/superpowers/plans/2026-04-27-auditor-key-expiry.md` (PR #11)

## Decisões de implementação não cravadas no spec

Decisões pequenas mas necessárias pra implementação destravar — registradas aqui pra rastreabilidade. Cada uma é defensável e consistente com o spec:

1. **Sintoma A (GHA failures) data source:** API REST do GitHub `GET /repos/brazilianhustle/inkflow-saas/actions/runs?per_page=10` autenticado via `GITHUB_API_TOKEN` (env nova em CF Pages). Filtro client-side: `workflow.name === 'Deploy to Cloudflare Pages'` (nome real do workflow `deploy.yml`) **OU** `path === '.github/workflows/deploy.yml'`. Sem env → sintoma retorna nada (skip silencioso).
2. **Sintoma B (CF Pages build failures) data source:** API REST CF `GET /accounts/{account_id}/pages/projects/{project_name}/deployments?per_page=10` autenticado via `CLOUDFLARE_API_TOKEN` (já em CF Pages env). Filtro: `latest_stage.status === 'failure'` E `created_on > now - window`.
3. **Janela de detecção:** 6h por padrão (configurável via `AUDIT_DEPLOY_HEALTH_WINDOW_HOURS`, default 6). Match com frequência cron `0 */6 * * *`. Janela maior que cron evita perder failure entre runs adjacentes.
4. **Severity rules cravadas (alinhadas com spec §5.2):**
   - Sintoma A: 0 fail = clean / 1 fail = warn / 2+ fail consecutivos = critical
   - Sintoma B: 0 fail = clean / 1 fail = warn / 2+ fail = critical
   - Sintoma C: drift = warn (sempre — sem escalation pra critical no MVP)
5. **Sintoma C (Wrangler drift) opt-in:** flag `AUDIT_DEPLOY_HEALTH_WRANGLER_DRIFT` aceita literal `'true'`. Default OFF. Lógica simplificada pragmática: compara `worker.modified_on` (CF Worker API) vs commit mais recente que tocou `cron-worker/` no GitHub (`GET /repos/{owner}/{repo}/commits?path=cron-worker&per_page=1` → `commit.author.date`). Se `worker.modified_on < commit_date - 1h` → drift warn (worker em prod desatualizado vs commits no main). False positive minimizado pelo opt-in inicial.
6. **`detect()` purity:** mesma assinatura do key-expiry — `{ env, fetchImpl, now }`. Test fixtures injetam `fetchImpl` mock + `now` fixo. Endpoint passa `globalThis.fetch` + `Date.now()`. Zero mock global.
7. **Account ID e project name reusados:** env vars já cravadas em prod desde PR #11 — `CLOUDFLARE_ACCOUNT_ID`, `CF_PAGES_PROJECT_NAME` (default `inkflow-saas`), `CF_WORKER_SCRIPT_NAME` (default `inkflow-cron`). Pré-flight valida existência.
8. **Repo owner/name como const:** `'brazilianhustle/inkflow-saas'` cravado como const no módulo. Configurável via `GITHUB_REPO_FULL_NAME` env opcional pra override (ex: testes locais ou fork). Sem dependência de runtime extras.
9. **Collapse single-state:** múltiplos sintomas (A+B+C) num run colapsam em 1 evento top-severity. `payload.affected_symptoms` lista todos. Mesma decisão do key-expiry §6.1 spec (auditor → 1 evento aberto). Granularidade fina por sintoma fica pós-MVP.
10. **Severity rebaixamento:** se Sintoma A retorna critical e Sintoma B retorna warn no mesmo run, evento final = critical (top vence). Spec §6.2 dedupe não rebaixa automaticamente — humano decide.

---

## File structure

**Created:**
- `functions/_lib/auditors/deploy-health.js` — pure `detect()` com 3 sintomas
- `tests/auditor-deploy-health.test.mjs` — unit tests da `detect()` (3+ fixtures por sintoma)
- `functions/api/cron/audit-deploy-health.js` — endpoint orquestrador
- `tests/audit-deploy-health-endpoint.test.mjs` — integration tests (auth, dedupe wiring)
- `evals/sub-projeto-3/2026-04-29-auditor-deploy-health-smoke.md` — smoke E2E doc

**Modified:**
- `cron-worker/src/index.js:18-26` — entry nova em `SCHEDULE_MAP`
- `cron-worker/wrangler.toml:9-17` — trigger `0 */6 * * *`
- `.claude/agents/README.md` — Mapping auditor → agent (deploy-health → deploy-engineer)
- `docs/canonical/methodology/incident-response.md` — §6.3 cross-link pra auditores.md#deploy-health
- `docs/canonical/auditores.md` — nova seção `## deploy-health` (file já existe desde PR #11)

---

## Pre-flight (validar antes de Task 1)

- [ ] **Branch limpa:** `git status` → working tree clean, em `main` no commit `14c17b0` ou descendente
- [ ] **Tests existentes passando:** `node --test tests/audit-state.test.mjs tests/auditor-key-expiry.test.mjs tests/audit-key-expiry-endpoint.test.mjs` → todos PASS (audit-state 21 + key-expiry unit 17 + key-expiry endpoint 5 = 43+ tests)
- [ ] **Lib `audit-state.js` em prod:** `grep -c "^export" functions/_lib/audit-state.js` → ≥7 funções exportadas
- [ ] **Spec v1.1 em main:** `git show e8402d0:docs/superpowers/specs/2026-04-27-auditores-mvp-design.md | head -3` → mostra header v1.1
- [ ] **`rollback.md` em main:** `ls docs/canonical/runbooks/rollback.md` → arquivo existe
- [ ] **`auditores.md` em main com entry key-expiry:** `grep -c "^## key-expiry" docs/canonical/auditores.md` → 1
- [ ] **Env var `CLOUDFLARE_ACCOUNT_ID` em CF Pages:** `npx wrangler pages secret list --project-name inkflow-saas | grep CLOUDFLARE_ACCOUNT_ID` → presente. Se ausente, criar antes de Task 5 (já necessário pelo key-expiry Layer 3 mas só ativa se opt-in).
- [ ] **Env var planejadas não conflitantes:** `grep -rn "AUDIT_DEPLOY_HEALTH\|GITHUB_API_TOKEN\|GITHUB_REPO_FULL_NAME" functions/ cron-worker/ 2>/dev/null` → vazio (nomes livres)
- [ ] **Cron triggers atual no Worker:** `cat cron-worker/wrangler.toml | grep -c '"' | head -1` → confirma 7 triggers atuais (key-expiry foi o último). Adicionar 1 = 8. Plano CF Workers Paid Bundled cap 30/Worker — folga 22.
- [ ] **GHA workflow file existe:** `head -1 .github/workflows/deploy.yml` → `name: Deploy to Cloudflare Pages`

Se algum check falha → resolver antes de prosseguir. Não pular.

---

### Task 1: Branch + skeleton + smoke test do módulo

**Files:**
- Create: `functions/_lib/auditors/deploy-health.js`
- Create: `tests/auditor-deploy-health.test.mjs`

- [ ] **Step 1.1: Criar branch**

```bash
git checkout main
git pull origin main
git checkout -b feat/auditor-deploy-health
```

- [ ] **Step 1.2: Stub do módulo `deploy-health.js`**

Arquivo: `functions/_lib/auditors/deploy-health.js`

```js
// ── InkFlow — Auditor #2: deploy-health ───────────────────────────────────
// Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §5.2
//
// detect({ env, fetchImpl, now }) → Array<event>
//   event = { severity, payload, evidence }
//   - severity ∈ {'clean', 'warn', 'critical'}
//   - payload preenchido por sintoma (campos por symptom abaixo)
//   - evidence = response bruto do source que disparou
//
// 3 sintomas:
//   Sintoma A (gha-failures):    GitHub Actions API — failures em deploy.yml
//   Sintoma B (pages-failures):  CF Pages API — deployments com latest_stage.status='failure'
//   Sintoma C (wrangler-drift):  env.AUDIT_DEPLOY_HEALTH_WRANGLER_DRIFT === 'true' (opt-in)

export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  return [];
}
```

- [ ] **Step 1.3: Stub test file**

Arquivo: `tests/auditor-deploy-health.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../functions/_lib/auditors/deploy-health.js';

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

- [ ] **Step 1.4: Rodar test, verificar PASS**

```bash
node --test tests/auditor-deploy-health.test.mjs
```

Expected: `# tests 2 # pass 2 # fail 0`

- [ ] **Step 1.5: Commit**

```bash
git add functions/_lib/auditors/deploy-health.js tests/auditor-deploy-health.test.mjs
git commit -m "feat(auditor-deploy-health): skeleton detect() + smoke test"
```

---

### Task 2: Sintoma A — GHA failures (TDD)

**Files:**
- Modify: `functions/_lib/auditors/deploy-health.js` (add Sintoma A)
- Modify: `tests/auditor-deploy-health.test.mjs` (add 5 tests)

**Spec mapping (§5.2 tabela detecção, linhas 1-2):**
| Sintoma | Severity | Critério |
|---|---|---|
| 1 GHA workflow `failure` em "Deploy to Cloudflare Pages" nas últimas 6h | warn | `actions/runs?workflow_id=deploy.yml` |
| 2+ GHA workflow `failure` consecutivos | critical | mesmo source |

**API endpoint:** `GET https://api.github.com/repos/{owner}/{repo}/actions/runs?per_page=10`

Headers: `Authorization: Bearer ${GITHUB_API_TOKEN}`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`

Resposta:
```json
{
  "workflow_runs": [
    {
      "id": 12345,
      "name": "Deploy to Cloudflare Pages",
      "path": ".github/workflows/deploy.yml",
      "conclusion": "failure",
      "created_at": "2026-04-29T10:00:00Z",
      "html_url": "https://github.com/.../actions/runs/12345"
    }
  ]
}
```

Filtro: `name === 'Deploy to Cloudflare Pages'` E `created_at > now - window` (6h default).

- [ ] **Step 2.1: Escrever 5 failing tests pra Sintoma A**

Adicionar ao final de `tests/auditor-deploy-health.test.mjs`:

```js
// Sintoma A — GHA failures ──────────────────────────────────────────────────

const NOW = new Date('2026-04-29T12:00:00Z').getTime();

function makeFetchImpl(routes) {
  return async (url, opts) => {
    for (const [pattern, response] of routes) {
      if (url.includes(pattern)) {
        if (response instanceof Error) throw response;
        return response;
      }
    }
    return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
  };
}

function ghaRun({ id, conclusion, hoursAgo, name = 'Deploy to Cloudflare Pages' }) {
  return {
    id,
    name,
    path: '.github/workflows/deploy.yml',
    conclusion,
    created_at: new Date(NOW - hoursAgo * 3600 * 1000).toISOString(),
    html_url: `https://github.com/brazilianhustle/inkflow-saas/actions/runs/${id}`,
  };
}

const ghaEnv = {
  GITHUB_API_TOKEN: 'ghp_test',
};

test('symptomA: env missing GITHUB_API_TOKEN → skip silently', async () => {
  const fetchImpl = makeFetchImpl([]);
  const events = await detect({ env: {}, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'gha-failures');
  assert.equal(a, undefined);
});

test('symptomA: 0 failures in window → no event (clean)', async () => {
  const fetchImpl = makeFetchImpl([
    ['api.github.com/repos/', {
      ok: true, status: 200,
      json: async () => ({
        workflow_runs: [
          ghaRun({ id: 1, conclusion: 'success', hoursAgo: 1 }),
          ghaRun({ id: 2, conclusion: 'success', hoursAgo: 7 }),
        ],
      }),
    }],
  ]);
  const events = await detect({ env: ghaEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'gha-failures' && e.severity !== 'clean');
  assert.equal(a, undefined);
});

test('symptomA: 1 failure in 6h window → warn', async () => {
  const fetchImpl = makeFetchImpl([
    ['api.github.com/repos/', {
      ok: true, status: 200,
      json: async () => ({
        workflow_runs: [
          ghaRun({ id: 1, conclusion: 'failure', hoursAgo: 2 }),
          ghaRun({ id: 2, conclusion: 'success', hoursAgo: 8 }),
        ],
      }),
    }],
  ]);
  const events = await detect({ env: ghaEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'gha-failures');
  assert.ok(a, 'Sintoma A event should exist');
  assert.equal(a.severity, 'warn');
  assert.equal(a.payload.failed_count, 1);
  assert.equal(a.payload.suggested_subagent, 'deploy-engineer');
  assert.equal(a.payload.runbook_path, 'docs/canonical/runbooks/rollback.md');
});

test('symptomA: 2 failures in 6h window → critical', async () => {
  const fetchImpl = makeFetchImpl([
    ['api.github.com/repos/', {
      ok: true, status: 200,
      json: async () => ({
        workflow_runs: [
          ghaRun({ id: 1, conclusion: 'failure', hoursAgo: 1 }),
          ghaRun({ id: 2, conclusion: 'failure', hoursAgo: 3 }),
          ghaRun({ id: 3, conclusion: 'success', hoursAgo: 24 }),
        ],
      }),
    }],
  ]);
  const events = await detect({ env: ghaEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'gha-failures');
  assert.equal(a.severity, 'critical');
  assert.equal(a.payload.failed_count, 2);
  assert.ok(Array.isArray(a.payload.failed_runs));
  assert.equal(a.payload.failed_runs.length, 2);
});

test('symptomA: ignora runs de outros workflows (filtra por name)', async () => {
  const fetchImpl = makeFetchImpl([
    ['api.github.com/repos/', {
      ok: true, status: 200,
      json: async () => ({
        workflow_runs: [
          ghaRun({ id: 1, conclusion: 'failure', hoursAgo: 1, name: 'Lint' }),
          ghaRun({ id: 2, conclusion: 'failure', hoursAgo: 2, name: 'CI Tests' }),
        ],
      }),
    }],
  ]);
  const events = await detect({ env: ghaEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'gha-failures' && e.severity !== 'clean');
  assert.equal(a, undefined);
});

test('symptomA: ignora failures fora da janela (>6h)', async () => {
  const fetchImpl = makeFetchImpl([
    ['api.github.com/repos/', {
      ok: true, status: 200,
      json: async () => ({
        workflow_runs: [
          ghaRun({ id: 1, conclusion: 'failure', hoursAgo: 10 }),
          ghaRun({ id: 2, conclusion: 'failure', hoursAgo: 20 }),
        ],
      }),
    }],
  ]);
  const events = await detect({ env: ghaEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'gha-failures' && e.severity !== 'clean');
  assert.equal(a, undefined);
});
```

- [ ] **Step 2.2: Rodar tests, verificar FAIL**

```bash
node --test tests/auditor-deploy-health.test.mjs
```

Expected: 4 dos 6 sintoma A tests devem FAIL (skip cases passam por trivialmente retornar []).

- [ ] **Step 2.3: Implementar Sintoma A**

Substituir conteúdo de `functions/_lib/auditors/deploy-health.js`:

```js
// ── InkFlow — Auditor #2: deploy-health ───────────────────────────────────
// Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §5.2

const RUNBOOK_PATH = 'docs/canonical/runbooks/rollback.md';
const SUGGESTED_SUBAGENT = 'deploy-engineer';
const DEFAULT_REPO = 'brazilianhustle/inkflow-saas';
const DEFAULT_WINDOW_HOURS = 6;
const GHA_WORKFLOW_NAME = 'Deploy to Cloudflare Pages';

function timeoutSignal(ms) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

function windowMs(env) {
  const h = parseInt(env.AUDIT_DEPLOY_HEALTH_WINDOW_HOURS || `${DEFAULT_WINDOW_HOURS}`, 10);
  return Number.isFinite(h) && h > 0 ? h * 3600 * 1000 : DEFAULT_WINDOW_HOURS * 3600 * 1000;
}

// Sintoma A: GHA failures ────────────────────────────────────────────────────

async function detectSymptomA(env, fetchImpl, now) {
  const token = env.GITHUB_API_TOKEN;
  if (!token) return [];

  const repo = env.GITHUB_REPO_FULL_NAME || DEFAULT_REPO;
  const url = `https://api.github.com/repos/${repo}/actions/runs?per_page=10`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'inkflow-audit-deploy-health',
  };

  let data;
  try {
    const res = await fetchImpl(url, { headers, signal: timeoutSignal(5000) });
    if (!res.ok) {
      return [{
        severity: 'warn',
        payload: {
          runbook_path: RUNBOOK_PATH,
          suggested_subagent: SUGGESTED_SUBAGENT,
          summary: `GHA API self-check returned ${res.status}`,
          symptom: 'gha-failures',
          status: res.status,
        },
        evidence: { status: res.status, source: 'github.com/actions/runs' },
      }];
    }
    data = await res.json();
  } catch (err) {
    return [{
      severity: 'warn',
      payload: {
        runbook_path: RUNBOOK_PATH,
        suggested_subagent: SUGGESTED_SUBAGENT,
        summary: `GHA API transient error: ${err.message}`,
        symptom: 'gha-failures',
        status: 'network_error',
      },
      evidence: { error: err.message, source: 'github.com/actions/runs' },
    }];
  }

  const runs = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
  const cutoff = now - windowMs(env);
  const failed = runs.filter((r) =>
    r.name === GHA_WORKFLOW_NAME &&
    r.conclusion === 'failure' &&
    new Date(r.created_at).getTime() >= cutoff
  );

  if (failed.length === 0) {
    return [{
      severity: 'clean',
      payload: { symptom: 'gha-failures', failed_count: 0 },
      evidence: { source: 'github.com/actions/runs' },
    }];
  }

  const severity = failed.length >= 2 ? 'critical' : 'warn';
  const lastSuccess = runs.find((r) =>
    r.name === GHA_WORKFLOW_NAME && r.conclusion === 'success'
  );

  return [{
    severity,
    payload: {
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: failed.length >= 2
        ? `${failed.length} GHA deploys consecutivos falharam`
        : `1 GHA deploy falhou`,
      symptom: 'gha-failures',
      failed_count: failed.length,
      failed_runs: failed.map((r) => ({
        id: r.id,
        conclusion: r.conclusion,
        created_at: r.created_at,
        html_url: r.html_url,
      })),
      last_successful_deploy: lastSuccess?.created_at || null,
    },
    evidence: { source: 'github.com/actions/runs', total_runs_inspected: runs.length },
  }];
}

// detect ────────────────────────────────────────────────────────────────────

export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  const events = [];
  if (fetchImpl) {
    events.push(...await detectSymptomA(env, fetchImpl, now));
  }
  return events;
}
```

- [ ] **Step 2.4: Rodar tests, verificar PASS**

```bash
node --test tests/auditor-deploy-health.test.mjs
```

Expected: `# pass 8 # fail 0` (2 originais + 6 sintoma A).

- [ ] **Step 2.5: Commit**

```bash
git add functions/_lib/auditors/deploy-health.js tests/auditor-deploy-health.test.mjs
git commit -m "feat(auditor-deploy-health): Sintoma A (GHA failures) — 1 fail=warn, 2+=critical"
```

---

### Task 3: Sintoma B — CF Pages build failures (TDD)

**Files:**
- Modify: `functions/_lib/auditors/deploy-health.js` (add Sintoma B)
- Modify: `tests/auditor-deploy-health.test.mjs` (add 4 tests)

**Spec mapping (§5.2 tabela detecção, linha 4):**
| Sintoma | Severity | Critério |
|---|---|---|
| CF Pages build failed nas últimas 6h | warn | `GET /accounts/{id}/pages/projects/{name}/deployments?limit=5` |

**Decisão alinhada com Sintoma A:** 1 fail = warn, 2+ fails = critical (consistência entre sintomas).

**API endpoint:** `GET https://api.cloudflare.com/client/v4/accounts/{account_id}/pages/projects/{project_name}/deployments?per_page=10`

Headers: `Authorization: Bearer ${CLOUDFLARE_API_TOKEN}`

Resposta:
```json
{
  "result": [
    {
      "id": "abc-123",
      "created_on": "2026-04-29T10:00:00Z",
      "latest_stage": { "name": "deploy", "status": "failure" },
      "url": "https://abc-123.inkflow-saas.pages.dev"
    }
  ]
}
```

Filtro: `latest_stage.status === 'failure'` E `created_on > now - window`.

- [ ] **Step 3.1: Escrever tests pra Sintoma B**

Adicionar ao final de `tests/auditor-deploy-health.test.mjs`:

```js
// Sintoma B — CF Pages build failures ───────────────────────────────────────

const cfEnv = {
  CLOUDFLARE_API_TOKEN: 'cf-tok',
  CLOUDFLARE_ACCOUNT_ID: 'acc-123',
};

function pagesDeployment({ id, status, hoursAgo }) {
  return {
    id,
    created_on: new Date(NOW - hoursAgo * 3600 * 1000).toISOString(),
    latest_stage: { name: 'deploy', status },
    url: `https://${id}.inkflow-saas.pages.dev`,
  };
}

test('symptomB: env missing CLOUDFLARE_API_TOKEN → skip', async () => {
  const fetchImpl = makeFetchImpl([]);
  const events = await detect({ env: {}, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'pages-failures');
  assert.equal(b, undefined);
});

test('symptomB: env missing CLOUDFLARE_ACCOUNT_ID → skip', async () => {
  const fetchImpl = makeFetchImpl([]);
  const events = await detect({
    env: { CLOUDFLARE_API_TOKEN: 'cf' },
    fetchImpl, now: NOW,
  });
  const b = events.find((e) => e.payload?.symptom === 'pages-failures');
  assert.equal(b, undefined);
});

test('symptomB: 0 failures → clean (no warn/critical)', async () => {
  const fetchImpl = makeFetchImpl([
    ['/pages/projects/', {
      ok: true, status: 200,
      json: async () => ({
        result: [
          pagesDeployment({ id: 'a', status: 'success', hoursAgo: 1 }),
          pagesDeployment({ id: 'b', status: 'success', hoursAgo: 4 }),
        ],
      }),
    }],
  ]);
  const events = await detect({ env: cfEnv, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'pages-failures' && e.severity !== 'clean');
  assert.equal(b, undefined);
});

test('symptomB: 1 failure in window → warn', async () => {
  const fetchImpl = makeFetchImpl([
    ['/pages/projects/', {
      ok: true, status: 200,
      json: async () => ({
        result: [
          pagesDeployment({ id: 'a', status: 'failure', hoursAgo: 2 }),
          pagesDeployment({ id: 'b', status: 'success', hoursAgo: 8 }),
        ],
      }),
    }],
  ]);
  const events = await detect({ env: cfEnv, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'pages-failures');
  assert.ok(b);
  assert.equal(b.severity, 'warn');
  assert.equal(b.payload.failed_count, 1);
});

test('symptomB: 2 failures in window → critical', async () => {
  const fetchImpl = makeFetchImpl([
    ['/pages/projects/', {
      ok: true, status: 200,
      json: async () => ({
        result: [
          pagesDeployment({ id: 'a', status: 'failure', hoursAgo: 1 }),
          pagesDeployment({ id: 'b', status: 'failure', hoursAgo: 4 }),
        ],
      }),
    }],
  ]);
  const events = await detect({ env: cfEnv, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'pages-failures');
  assert.equal(b.severity, 'critical');
  assert.equal(b.payload.failed_count, 2);
});

test('symptomB: failures fora da janela ignorados', async () => {
  const fetchImpl = makeFetchImpl([
    ['/pages/projects/', {
      ok: true, status: 200,
      json: async () => ({
        result: [
          pagesDeployment({ id: 'a', status: 'failure', hoursAgo: 12 }),
        ],
      }),
    }],
  ]);
  const events = await detect({ env: cfEnv, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'pages-failures' && e.severity !== 'clean');
  assert.equal(b, undefined);
});
```

- [ ] **Step 3.2: Rodar tests, verificar FAIL**

```bash
node --test tests/auditor-deploy-health.test.mjs
```

Expected: 3 dos 6 sintoma B tests FAIL (skip cases trivialmente passam).

- [ ] **Step 3.3: Implementar Sintoma B**

Adicionar ao `functions/_lib/auditors/deploy-health.js` (antes da função `detect`):

```js
// Sintoma B: CF Pages build failures ────────────────────────────────────────

async function detectSymptomB(env, fetchImpl, now) {
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) return [];

  const projectName = env.CF_PAGES_PROJECT_NAME || 'inkflow-saas';
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments?per_page=10`;
  const headers = { Authorization: `Bearer ${token}` };

  let data;
  try {
    const res = await fetchImpl(url, { headers, signal: timeoutSignal(5000) });
    if (!res.ok) {
      return [{
        severity: 'warn',
        payload: {
          runbook_path: RUNBOOK_PATH,
          suggested_subagent: SUGGESTED_SUBAGENT,
          summary: `CF Pages API self-check returned ${res.status}`,
          symptom: 'pages-failures',
          status: res.status,
        },
        evidence: { status: res.status, source: 'cloudflare/pages/deployments' },
      }];
    }
    data = await res.json();
  } catch (err) {
    return [{
      severity: 'warn',
      payload: {
        runbook_path: RUNBOOK_PATH,
        suggested_subagent: SUGGESTED_SUBAGENT,
        summary: `CF Pages API transient error: ${err.message}`,
        symptom: 'pages-failures',
        status: 'network_error',
      },
      evidence: { error: err.message, source: 'cloudflare/pages/deployments' },
    }];
  }

  const deployments = Array.isArray(data?.result) ? data.result : [];
  const cutoff = now - windowMs(env);
  const failed = deployments.filter((d) =>
    d.latest_stage?.status === 'failure' &&
    new Date(d.created_on).getTime() >= cutoff
  );

  if (failed.length === 0) {
    return [{
      severity: 'clean',
      payload: { symptom: 'pages-failures', failed_count: 0 },
      evidence: { source: 'cloudflare/pages/deployments' },
    }];
  }

  const severity = failed.length >= 2 ? 'critical' : 'warn';
  const lastSuccess = deployments.find((d) => d.latest_stage?.status === 'success');

  return [{
    severity,
    payload: {
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: failed.length >= 2
        ? `${failed.length} CF Pages builds consecutivos falharam`
        : `1 CF Pages build falhou`,
      symptom: 'pages-failures',
      failed_count: failed.length,
      failed_deployments: failed.map((d) => ({
        id: d.id,
        created_on: d.created_on,
        url: d.url,
      })),
      last_successful_deploy: lastSuccess?.created_on || null,
    },
    evidence: { source: 'cloudflare/pages/deployments', total_inspected: deployments.length },
  }];
}
```

E atualizar `detect`:

```js
export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  const events = [];
  if (fetchImpl) {
    events.push(...await detectSymptomA(env, fetchImpl, now));
    events.push(...await detectSymptomB(env, fetchImpl, now));
  }
  return events;
}
```

- [ ] **Step 3.4: Rodar tests, verificar PASS**

```bash
node --test tests/auditor-deploy-health.test.mjs
```

Expected: `# pass 14 # fail 0` (2 + 6 + 6).

- [ ] **Step 3.5: Commit**

```bash
git add functions/_lib/auditors/deploy-health.js tests/auditor-deploy-health.test.mjs
git commit -m "feat(auditor-deploy-health): Sintoma B (CF Pages build failures)"
```

---

### Task 4: Sintoma C — Wrangler drift opt-in (TDD)

**Files:**
- Modify: `functions/_lib/auditors/deploy-health.js` (add Sintoma C)
- Modify: `tests/auditor-deploy-health.test.mjs` (add 4 tests)

**Spec mapping (§5.2 tabela detecção, linha 3):**
| Sintoma | Severity | Critério |
|---|---|---|
| Wrangler version drift (Worker em prod vs `wrangler.toml`) | critical | `GET /accounts/{id}/workers/scripts/{name}` retorna `etag` ≠ esperado |

**Decisão pragmática (Decisão #5):** spec não cravou onde mora o "etag esperado". Solução: opt-in via `AUDIT_DEPLOY_HEALTH_WRANGLER_DRIFT='true'`. Compara `worker.modified_on` (CF Workers API) vs commit mais recente que tocou `cron-worker/` no GitHub. Se `worker.modified_on < commit_date - 1h` → drift warn (worker em prod desatualizado vs main).

**Severity:** `warn` (não critical) — escolha conservadora pra opt-in. Spec marca como critical, mas decisão pragmática rebaixa pra warn no MVP devido ao alto false-positive risk inicial. Pode promover pra critical pós-7d baseline (decisão registrada via `docs/canonical/decisions/`).

**APIs:**
- Worker: `GET https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{script_name}` → `result.modified_on`
- GitHub: `GET https://api.github.com/repos/{owner}/{repo}/commits?path=cron-worker&per_page=1` → `[0].commit.author.date`

- [ ] **Step 4.1: Escrever tests pra Sintoma C**

Adicionar ao final de `tests/auditor-deploy-health.test.mjs`:

```js
// Sintoma C — Wrangler drift (opt-in) ───────────────────────────────────────

const driftEnv = (extras = {}) => ({
  CLOUDFLARE_API_TOKEN: 'cf-tok',
  CLOUDFLARE_ACCOUNT_ID: 'acc-123',
  GITHUB_API_TOKEN: 'gh-tok',
  AUDIT_DEPLOY_HEALTH_WRANGLER_DRIFT: 'true',
  ...extras,
});

function makeDriftFetch({ workerModifiedOn, commitDate, ghaSuccess = true, pagesSuccess = true }) {
  return makeFetchImpl([
    ['api.github.com/repos/brazilianhustle/inkflow-saas/commits?path=cron-worker', {
      ok: true, status: 200,
      json: async () => ([{ commit: { author: { date: commitDate } } }]),
    }],
    ['api.github.com/repos/', {
      ok: true, status: 200,
      json: async () => ({
        workflow_runs: ghaSuccess
          ? [ghaRun({ id: 1, conclusion: 'success', hoursAgo: 1 })]
          : [ghaRun({ id: 1, conclusion: 'failure', hoursAgo: 1 })],
      }),
    }],
    ['/workers/scripts/', {
      ok: true, status: 200,
      json: async () => ({ result: { modified_on: workerModifiedOn } }),
    }],
    ['/pages/projects/', {
      ok: true, status: 200,
      json: async () => ({
        result: pagesSuccess
          ? [pagesDeployment({ id: 'a', status: 'success', hoursAgo: 1 })]
          : [pagesDeployment({ id: 'a', status: 'failure', hoursAgo: 1 })],
      }),
    }],
  ]);
}

test('symptomC: flag missing → skip (no drift event)', async () => {
  const fetchImpl = makeDriftFetch({
    workerModifiedOn: '2026-04-20T10:00:00Z',
    commitDate: '2026-04-29T10:00:00Z',
  });
  const events = await detect({
    env: { CLOUDFLARE_API_TOKEN: 'x', CLOUDFLARE_ACCOUNT_ID: 'acc', GITHUB_API_TOKEN: 'gh' },
    fetchImpl, now: NOW,
  });
  const c = events.find((e) => e.payload?.symptom === 'wrangler-drift');
  assert.equal(c, undefined);
});

test('symptomC: flag on, worker recent (newer than commit) → no event', async () => {
  const fetchImpl = makeDriftFetch({
    workerModifiedOn: '2026-04-29T10:00:00Z',
    commitDate: '2026-04-29T08:00:00Z',
  });
  const events = await detect({ env: driftEnv(), fetchImpl, now: NOW });
  const c = events.find((e) => e.payload?.symptom === 'wrangler-drift' && e.severity !== 'clean');
  assert.equal(c, undefined);
});

test('symptomC: flag on, worker stale > 1h vs commit → warn drift', async () => {
  const fetchImpl = makeDriftFetch({
    workerModifiedOn: '2026-04-25T10:00:00Z',
    commitDate: '2026-04-29T10:00:00Z',
  });
  const events = await detect({ env: driftEnv(), fetchImpl, now: NOW });
  const c = events.find((e) => e.payload?.symptom === 'wrangler-drift');
  assert.ok(c, 'Drift event should exist');
  assert.equal(c.severity, 'warn');
  assert.match(c.payload.summary, /drift/i);
  assert.ok(c.payload.lag_hours > 1);
});

test('symptomC: flag on, GitHub API 404 (no commits) → skip silently', async () => {
  const fetchImpl = makeFetchImpl([
    ['api.github.com/repos/brazilianhustle/inkflow-saas/commits?path=cron-worker', {
      ok: true, status: 200,
      json: async () => ([]),
    }],
    ['api.github.com/repos/', {
      ok: true, status: 200,
      json: async () => ({ workflow_runs: [] }),
    }],
    ['/workers/scripts/', {
      ok: true, status: 200,
      json: async () => ({ result: { modified_on: '2026-04-29T10:00:00Z' } }),
    }],
    ['/pages/projects/', {
      ok: true, status: 200,
      json: async () => ({ result: [] }),
    }],
  ]);
  const events = await detect({ env: driftEnv(), fetchImpl, now: NOW });
  const c = events.find((e) => e.payload?.symptom === 'wrangler-drift');
  assert.equal(c, undefined);
});
```

- [ ] **Step 4.2: Rodar tests, verificar FAIL**

```bash
node --test tests/auditor-deploy-health.test.mjs
```

Expected: 1 dos 4 sintoma C tests FAIL (drift warn case).

- [ ] **Step 4.3: Implementar Sintoma C**

Adicionar ao `functions/_lib/auditors/deploy-health.js` (antes da função `detect`):

```js
// Sintoma C: Wrangler drift (opt-in) ────────────────────────────────────────

const ONE_HOUR_MS = 3600 * 1000;

async function fetchJson(url, headers, fetchImpl) {
  try {
    const res = await fetchImpl(url, { headers, signal: timeoutSignal(5000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function detectSymptomC(env, fetchImpl) {
  if (env.AUDIT_DEPLOY_HEALTH_WRANGLER_DRIFT !== 'true') return [];

  const cfToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const ghToken = env.GITHUB_API_TOKEN;
  if (!cfToken || !accountId || !ghToken) return [];

  const scriptName = env.CF_WORKER_SCRIPT_NAME || 'inkflow-cron';
  const repo = env.GITHUB_REPO_FULL_NAME || DEFAULT_REPO;

  const workerUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`;
  const commitsUrl = `https://api.github.com/repos/${repo}/commits?path=cron-worker&per_page=1`;

  const [workerData, commitsData] = await Promise.all([
    fetchJson(workerUrl, { Authorization: `Bearer ${cfToken}` }, fetchImpl),
    fetchJson(commitsUrl, {
      Authorization: `Bearer ${ghToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'inkflow-audit-deploy-health',
    }, fetchImpl),
  ]);

  const workerModifiedOn = workerData?.result?.modified_on;
  const lastCommitDate = commitsData?.[0]?.commit?.author?.date;
  if (!workerModifiedOn || !lastCommitDate) return [];

  const workerMs = new Date(workerModifiedOn).getTime();
  const commitMs = new Date(lastCommitDate).getTime();
  const lagMs = commitMs - workerMs;
  if (lagMs <= ONE_HOUR_MS) return [];

  const lagHours = Math.round(lagMs / ONE_HOUR_MS);
  return [{
    severity: 'warn',
    payload: {
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: `Wrangler drift: worker ${lagHours}h atrás do commit mais recente em cron-worker/`,
      symptom: 'wrangler-drift',
      lag_hours: lagHours,
      worker_modified_on: workerModifiedOn,
      last_commit_date: lastCommitDate,
    },
    evidence: {
      source: 'cloudflare/workers/scripts + github/repos/commits',
      worker_script: scriptName,
      repo,
    },
  }];
}
```

E atualizar `detect`:

```js
export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  const events = [];
  if (fetchImpl) {
    events.push(...await detectSymptomA(env, fetchImpl, now));
    events.push(...await detectSymptomB(env, fetchImpl, now));
    events.push(...await detectSymptomC(env, fetchImpl));
  }
  return events;
}
```

- [ ] **Step 4.4: Rodar tests, verificar PASS**

```bash
node --test tests/auditor-deploy-health.test.mjs
```

Expected: `# pass 18 # fail 0` (2 + 6 + 6 + 4).

- [ ] **Step 4.5: Commit**

```bash
git add functions/_lib/auditors/deploy-health.js tests/auditor-deploy-health.test.mjs
git commit -m "feat(auditor-deploy-health): Sintoma C (wrangler drift) opt-in via env flag"
```

---

### Task 5: Endpoint `/api/cron/audit-deploy-health` (TDD)

**Files:**
- Create: `functions/api/cron/audit-deploy-health.js`
- Create: `tests/audit-deploy-health-endpoint.test.mjs`

**Pattern reusado** literalmente de `audit-key-expiry.js` (PR #11) — clone estrutural com troca de import + auditor name + suggested_subagent. Pipeline interno idêntico:

1. Validar auth `Authorization: Bearer ${env.CRON_SECRET}`
2. Validar `env.SUPABASE_SERVICE_KEY` presente
3. `runId = await startRun(supabase, 'deploy-health')`
4. `events = await detect({ env, fetchImpl })`
5. `collapsed = collapseEvents(events)` — top severity vence; outros sintomas viram metadata
6. Aplica `dedupePolicy(currentState, collapsed)` → ação:
   - `fire`: `insertEvent` + `sendTelegram`
   - `silent`: noop (heartbeat fica em audit_runs)
   - `supersede`: `insertEvent` + PATCH antigo `resolved_at + resolved_reason='superseded'` + `sendTelegram`
   - `resolve`: PATCH antigo `resolved_at + resolved_reason='next_run_clean'` + `sendTelegram` ([resolved])
   - `no-op`: noop
7. `endRun(runId, { status, eventsEmitted })`
8. Return JSON `{ ok, run_id, events_count, actions: {fire, silent, supersede, resolve, no_op} }`

**Diferença vs key-expiry endpoint:** `auditor` name é `'deploy-health'` (não `'key-expiry'`), `suggested_subagent` é `'deploy-engineer'` (idêntico), e o import vem de `_lib/auditors/deploy-health.js`.

- [ ] **Step 5.1: Escrever integration tests**

Arquivo: `tests/audit-deploy-health-endpoint.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/cron/audit-deploy-health.js';

const baseEnv = {
  CRON_SECRET: 'test-cron-secret',
  SUPABASE_SERVICE_KEY: 'sb-key',
};

function makeRequest(authHeader = 'Bearer test-cron-secret') {
  return new Request('https://inkflowbrasil.com/api/cron/audit-deploy-health', {
    method: 'POST',
    headers: { Authorization: authHeader },
  });
}

test('endpoint: missing auth → 401', async () => {
  const res = await onRequest({ request: makeRequest('Bearer wrong'), env: baseEnv });
  assert.equal(res.status, 401);
});

test('endpoint: GET → 405', async () => {
  const req = new Request('https://inkflowbrasil.com/api/cron/audit-deploy-health', { method: 'GET' });
  const res = await onRequest({ request: req, env: baseEnv });
  assert.equal(res.status, 405);
});

test('endpoint: missing SUPABASE_SERVICE_KEY → 503', async () => {
  const env = { CRON_SECRET: 'test-cron-secret' };
  const res = await onRequest({ request: makeRequest(), env });
  assert.equal(res.status, 503);
});

test('endpoint: empty detect (no env triggers) → ok=true with zero events', async () => {
  const env = { ...baseEnv };
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
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const res = await onRequest({ request: makeRequest(), env, fetchImpl: fetchSpy });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.events_count, 0);
});

test('endpoint: critical event detected → fire path (insert + telegram)', async () => {
  const env = {
    ...baseEnv,
    GITHUB_API_TOKEN: 'gh',
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
    if (u.includes('api.github.com/repos/') && u.includes('/actions/runs')) {
      return {
        ok: true, status: 200,
        json: async () => ({
          workflow_runs: [
            { id: 1, name: 'Deploy to Cloudflare Pages', path: '.github/workflows/deploy.yml',
              conclusion: 'failure', created_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
              html_url: 'https://x' },
            { id: 2, name: 'Deploy to Cloudflare Pages', path: '.github/workflows/deploy.yml',
              conclusion: 'failure', created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
              html_url: 'https://y' },
          ],
        }),
      };
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
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const res = await onRequest({ request: makeRequest(), env, fetchImpl: fetchSpy });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(body.actions.fire >= 1);
  assert.equal(calls.events_post, 1, 'INSERT audit_events called once');
  assert.equal(calls.telegram, 1, 'sendTelegram called once');
});
```

- [ ] **Step 5.2: Rodar tests, verificar FAIL**

```bash
node --test tests/audit-deploy-health-endpoint.test.mjs
```

Expected: `Cannot find module '../functions/api/cron/audit-deploy-health.js'`.

- [ ] **Step 5.3: Implementar endpoint**

Arquivo: `functions/api/cron/audit-deploy-health.js`

```js
// ── InkFlow — Cron: audit deploy-health (§5.2) ─────────────────────────────
// Auditor #2. Cron 0 */6 * * * (6h). Detecta falhas recentes na pipeline de
// deploy via 3 sintomas (GHA failures, CF Pages build failures, opt-in
// Wrangler drift). Emite eventos via audit-state lib seguindo dedupe policy
// §6.2.

import { detect } from '../../_lib/auditors/deploy-health.js';
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
    runId = await startRun(supabase, 'deploy-health');

    const rawEvents = await detect({ env, fetchImpl, now: Date.now() });
    collapsed = collapseEvents(rawEvents);

    if (collapsed) {
      const current = await getCurrentState(supabase, 'deploy-health');
      const action = dedupePolicy(current, collapsed);
      actions[action.replace('-', '_')] = (actions[action.replace('-', '_')] || 0) + 1;

      if (action === 'fire' || action === 'supersede') {
        const inserted = await insertEvent(supabase, {
          run_id: runId,
          auditor: 'deploy-health',
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
          auditor: 'deploy-health',
          payload: { runbook_path: 'docs/canonical/runbooks/rollback.md', summary: 'deploy-health: resolved (next run clean)' },
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

**Nota sobre `current.event_id` (não `current.id`):** view `audit_current_state` expõe a chave do evento como `event_id` (FK pra `audit_events.id`). Bug #2 do auditor key-expiry (commit `0bbcd69`) já cravou esse aprendizado — replicado aqui pra evitar regressão.

- [ ] **Step 5.4: Rodar tests, verificar PASS**

```bash
node --test tests/audit-deploy-health-endpoint.test.mjs
```

Expected: `# pass 5 # fail 0`.

- [ ] **Step 5.5: Rodar TODOS os tests do auditor (regression check)**

```bash
node --test tests/auditor-deploy-health.test.mjs tests/audit-deploy-health-endpoint.test.mjs tests/audit-state.test.mjs tests/auditor-key-expiry.test.mjs tests/audit-key-expiry-endpoint.test.mjs
```

Expected: `# pass 60+ # fail 0` (18 unit deploy-health + 5 endpoint deploy-health + 21 audit-state + 17 unit key-expiry + 5 endpoint key-expiry = 66, ajuste conforme execução real).

- [ ] **Step 5.6: Commit**

```bash
git add functions/api/cron/audit-deploy-health.js tests/audit-deploy-health-endpoint.test.mjs
git commit -m "feat(auditor-deploy-health): endpoint /api/cron/audit-deploy-health com dedupe"
```

---

### Task 6: Cron registration + deploy

**Files:**
- Modify: `cron-worker/src/index.js:18-26` (SCHEDULE_MAP)
- Modify: `cron-worker/wrangler.toml:9-17` (triggers)

**Pré-deploy: Setup de env vars novas**

- [ ] **Step 6.0: Criar `GITHUB_API_TOKEN` no GitHub + cadastrar em CF Pages env**

1. GitHub UI → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Token name: `inkflow-audit-deploy-health` (descritivo)
3. Expiration: 90 dias (alinha com rotação CLOUDFLARE_API_TOKEN)
4. Repository access: `brazilianhustle/inkflow-saas` (single repo)
5. Permissions:
   - Repository permissions → **Actions: Read-only**
   - Repository permissions → **Contents: Read-only** (necessário pra `commits?path=cron-worker`)
6. Generate token → copy
7. Cadastrar em CF Pages env (production):

```bash
# Pode rodar em script .sh isolado (memory feedback_preferir_script_sh)
# Cole o token quando solicitado
read -s "GITHUB_API_TOKEN?Cole o GITHUB_API_TOKEN: "
echo
echo "$GITHUB_API_TOKEN" | npx wrangler pages secret put GITHUB_API_TOKEN --project-name inkflow-saas
unset GITHUB_API_TOKEN
```

8. Salvar em BWS pra rotação futura:

```bash
PROJECT_ID=$(bws project list 2>/dev/null | jq -r '.[] | select(.name=="inkflow") | .id')
bash /tmp/inkflow-bws-create-secret.sh "GITHUB_API_TOKEN" "$PROJECT_ID"  # script reusa pattern do bws_setup.md
```

- [ ] **Step 6.1: Adicionar entry no SCHEDULE_MAP**

Edit `cron-worker/src/index.js`. Localizar bloco `const SCHEDULE_MAP = {` (linha 18) e adicionar nova entry:

```js
const SCHEDULE_MAP = {
  '0 12 * * *':   { path: '/api/cron/expira-trial',       secretEnv: 'CRON_SECRET', label: 'expira-trial' },
  '0 2 * * *':    { path: '/api/cleanup-tenants',         secretEnv: 'CRON_SECRET', label: 'cleanup-tenants' },
  '0 9 * * *':    { path: '/api/cron/reset-agendamentos', secretEnv: 'CRON_SECRET', label: 'reset-agendamentos' },
  '*/30 * * * *': { path: '/api/cron/monitor-whatsapp',   secretEnv: 'CRON_SECRET', label: 'monitor-whatsapp' },
  '*/5 * * * *':  { path: '/api/cron/audit-escalate',     secretEnv: 'CRON_SECRET', label: 'audit-escalate' },
  '0 4 * * 1':    { path: '/api/cron/audit-cleanup',      secretEnv: 'CRON_SECRET', label: 'audit-cleanup' },
  '0 6 * * *':    { path: '/api/cron/audit-key-expiry',   secretEnv: 'CRON_SECRET', label: 'audit-key-expiry' },
  '0 */6 * * *':  { path: '/api/cron/audit-deploy-health', secretEnv: 'CRON_SECRET', label: 'audit-deploy-health' },
};
```

- [ ] **Step 6.2: Adicionar trigger no wrangler.toml**

Edit `cron-worker/wrangler.toml`. Localizar bloco `[triggers]` e adicionar nova linha:

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
]
```

- [ ] **Step 6.3: Deploy do cron-worker**

```bash
cd cron-worker && npx wrangler deploy
```

Expected output: `✨ Success! ... Triggers: ... 8 cron(s)`. Confirma que os 8 triggers (incluindo o novo `0 */6 * * *`) foram registrados.

- [ ] **Step 6.4: Push da branch + trigger Pages deploy**

```bash
cd ..
git add cron-worker/src/index.js cron-worker/wrangler.toml
git commit -m "feat(cron-worker): trigger 0 */6 * * * → audit-deploy-health"
git push -u origin feat/auditor-deploy-health
```

GHA `deploy.yml` dispara em push. Acompanhar:

```bash
gh run list --workflow="deploy.yml" --limit 1
gh run watch
```

Expected: deploy ✅ em ~30s. Endpoint `/api/cron/audit-deploy-health` deve responder 401 (falta auth) em curl test:

```bash
curl -i -X POST https://inkflowbrasil.com/api/cron/audit-deploy-health
# HTTP/2 401
```

---

### Task 7: Smoke test em prod (E2E)

**Files:**
- Create: `evals/sub-projeto-3/2026-04-29-auditor-deploy-health-smoke.md` (doc do smoke)

Pré-requisito: branch deployada (Task 6) + `GITHUB_API_TOKEN` em CF Pages env.

**Smoke real (sem mock):** trigger via cron-worker fetch handler com `CRON_SECRET`. Cenários cobertos: (1) trigger sem failures recentes — clean / no-op, (2) forçar critical via fixture artificial, (3) ack flow real, (4) resolve via next-run-clean.

- [ ] **Step 7.1: Smoke 1 — trigger sem failures recentes (no-op esperado)**

```bash
# Pega CRON_SECRET do BWS
CRON_SECRET=$(bws secret list "$PROJECT_ID" | jq -r '.[] | select(.key=="CRON_SECRET") | .value')

curl -X POST "https://inkflow-cron.lmf4200.workers.dev/?cron=0+%2A%2F6+%2A+%2A+%2A" \
  -H "Authorization: Bearer $CRON_SECRET" \
  | jq .
```

Expected JSON: `{ "ok": true, "label": "audit-deploy-health", "elapsedMs": <num>, "response": "{\"ok\":true,\"run_id\":\"<uuid>\",\"events_count\":0,\"actions\":{\"no_op\":1,...}}" }`

Validar via Supabase MCP:

```sql
SELECT auditor, status, completed_at, events_emitted, error_message
FROM audit_runs WHERE auditor='deploy-health' ORDER BY started_at DESC LIMIT 1;
-- status='success', completed_at preenchido, events_emitted=0
```

- [ ] **Step 7.2: Smoke 2 — disparar critical real (forçar 2 GHA failures)**

**Não vamos quebrar deploy real.** Em vez disso, induz critical via INSERT manual de fixture em `audit_events` simulando o output do auditor (mesma técnica do smoke key-expiry §4b mas sem env). Ou, opção mais autêntica: workflow_dispatch fail intencional via GHA UI (ex: workflow `lint` que sempre falha).

**Decisão:** opção fixture é mais segura (não pollui histórico GHA). Expected: o auditor próximo run lê GHA + Pages, ainda vê 0 fails reais → no-op ou resolve do fixture artificial.

Plano alternativo: criar workflow temporário `failing.yml` com `name: Deploy to Cloudflare Pages` (mesmo nome) e `exit 1`, push, deixar falhar 2 vezes via `workflow_dispatch`, depois deletar. Garante critical real.

```bash
# Criar workflow temporário com mesmo nome
cat > .github/workflows/failing-deploy.yml <<'EOF'
name: Deploy to Cloudflare Pages
on:
  workflow_dispatch:
jobs:
  fail:
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo "intentional smoke failure"
          exit 1
EOF

git add .github/workflows/failing-deploy.yml
git commit -m "chore(smoke): temporary failing workflow for deploy-health critical smoke"
git push

# Disparar 2x
gh workflow run failing-deploy.yml
sleep 30
gh workflow run failing-deploy.yml
sleep 60

# Confirmar 2 failures registradas
gh run list --workflow=failing-deploy.yml --limit 3 --json conclusion
```

```bash
# Trigger auditor manual
curl -X POST "https://inkflow-cron.lmf4200.workers.dev/?cron=0+%2A%2F6+%2A+%2A+%2A" \
  -H "Authorization: Bearer $CRON_SECRET" | jq .
```

Expected `actions.fire = 1`. Telegram bot deve receber:

```
[critical] [deploy-health] 2 GHA deploys consecutivos falharam
ID: <8chars> | Runbook: rollback.md
Suggested: @deploy-engineer
Evidence: {"top":{"source":"github.com/actions/runs",...},...}
Reply "ack <8chars>" pra acknowledge.
```

- [ ] **Step 7.3: Validar ack flow**

No Telegram, reply: `ack <8chars>`. Bot responde: `✅ Acknowledged: deploy-health critical`.

Validar no DB:

```sql
SELECT id, severity, acknowledged_at, acknowledged_by, payload->>'symptom' AS symptom
FROM audit_events
WHERE auditor='deploy-health' AND resolved_at IS NULL
ORDER BY detected_at DESC LIMIT 1;
-- acknowledged_at preenchido, acknowledged_by = TELEGRAM_ADMIN_USER_ID, symptom='gha-failures'
```

- [ ] **Step 7.4: Cleanup (remover workflow temporário + verificar resolve)**

```bash
git rm .github/workflows/failing-deploy.yml
git commit -m "chore(smoke): cleanup temporary failing workflow after deploy-health smoke"
git push

# Aguarda deploy GHA
sleep 60

# Trigger novo run (sem failing-deploy.yml mas as runs antigas ainda estão na janela 6h)
# IMPORTANTE: as failures antigas ainda contam até saírem da janela 6h.
# Esperar até que >6h passe OU manualmente expirar via SQL update do detected_at:

# Caminho A — esperar 6h naturalmente (smoke estende pra >6h dia inteiro)
# Caminho B — forçar resolve via SQL update do evento aberto pra severity='clean'
#   (não recomendado — quebra integridade)
# Caminho C — ajustar AUDIT_DEPLOY_HEALTH_WINDOW_HOURS=1 temporariamente em CF Pages env, trigger, voltar pra 6.

# Caminho C é mais rápido pra smoke:
echo "1" | npx wrangler pages secret put AUDIT_DEPLOY_HEALTH_WINDOW_HOURS --project-name inkflow-saas

# Empty commit pra forçar redeploy (bug B do PR #10 documentado)
git commit --allow-empty -m "chore: trigger redeploy after window override"
git push
sleep 35

# Trigger
curl -X POST "https://inkflow-cron.lmf4200.workers.dev/?cron=0+%2A%2F6+%2A+%2A+%2A" \
  -H "Authorization: Bearer $CRON_SECRET" | jq .
```

Expected `actions.resolve = 1`. Telegram bot deve receber `[resolved] [deploy-health] ...`.

Validar no DB:

```sql
SELECT id, severity, resolved_at, resolved_reason
FROM audit_events WHERE auditor='deploy-health'
ORDER BY detected_at DESC LIMIT 1;
-- resolved_at preenchido, resolved_reason='next_run_clean'
```

Cleanup final (remover override window):

```bash
npx wrangler pages secret delete AUDIT_DEPLOY_HEALTH_WINDOW_HOURS --project-name inkflow-saas
git commit --allow-empty -m "chore: cleanup window override after deploy-health smoke"
git push
```

- [ ] **Step 7.5: Documentar smoke**

Criar `evals/sub-projeto-3/2026-04-29-auditor-deploy-health-smoke.md` com:
- 4 smokes executados (no-op / critical / ack / resolve)
- Output de cada curl
- Bugs encontrados (se houver)
- Status final: PASS / PARTIAL / FAIL

Estrutura mínima do doc:

```markdown
# Smoke E2E — Auditor #2 deploy-health

**Data:** 2026-04-XX
**Branch:** feat/auditor-deploy-health
**Spec:** docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §5.2
**Plano:** docs/superpowers/plans/2026-04-29-auditor-deploy-health.md

## Smoke 1 — Trigger sem failures (no-op)
- Cron triggered manualmente via `curl POST .../?cron=0+%2A%2F6+%2A+%2A+%2A`
- Response: `{ ok: true, events_count: 0, actions: { no_op: 1 } }`
- audit_runs row criada: status='success', events_emitted=0
- Status: ✅ PASS

## Smoke 2 — Critical real (2 GHA failures)
[...]

## Smoke 3 — Ack flow
[...]

## Smoke 4 — Resolve
[...]

## Status final
✅ PASS — 4/4 smokes executados sem regressões
```

- [ ] **Step 7.6: Commit smoke doc**

```bash
git add evals/sub-projeto-3/2026-04-29-auditor-deploy-health-smoke.md
git commit -m "test(auditor-deploy-health): smoke E2E PASS — 4 cenários (no-op, critical, ack, resolve)"
```

---

### Task 8: Cross-references (docs canônicos)

**Files:**
- Modify: `docs/canonical/auditores.md` (adicionar `## deploy-health` após `## key-expiry`)
- Modify: `.claude/agents/README.md` (adicionar entry deploy-health no Mapping)
- Modify: `docs/canonical/methodology/incident-response.md` (§6.3 cross-link adicional)

- [ ] **Step 8.1: Adicionar entry em `docs/canonical/auditores.md`**

Localizar seção `## key-expiry` e inserir nova seção logo após (antes de `## (Próximos)` se ainda existir):

```markdown
## deploy-health

**Status:** ✅ Em produção (2026-04-XX)
**Onde:** `inkflow-cron` Worker
**Frequência:** A cada 6h (cron `0 */6 * * *`)
**Endpoint:** `functions/api/cron/audit-deploy-health.js`
**Lib `detect()`:** `functions/_lib/auditors/deploy-health.js`
**Tests:** `tests/auditor-deploy-health.test.mjs` + `tests/audit-deploy-health-endpoint.test.mjs`
**Runbook:** [rollback.md](runbooks/rollback.md)
**Suggested subagent:** `deploy-engineer`

### Detecção em 3 sintomas

| Symptom | Source | Severity rules |
|---|---|---|
| A (gha-failures) | GitHub Actions API — `Deploy to Cloudflare Pages` workflow | 0 fail clean / 1 warn / 2+ critical (janela `AUDIT_DEPLOY_HEALTH_WINDOW_HOURS`, default 6h) |
| B (pages-failures) | CF Pages API — `deployments?per_page=10` `latest_stage.status='failure'` | 0 fail clean / 1 warn / 2+ critical (mesma janela) |
| C (wrangler-drift) | CF Workers API `modified_on` vs GitHub `commits?path=cron-worker` | opt-in via `AUDIT_DEPLOY_HEALTH_WRANGLER_DRIFT='true'`. lag > 1h → warn |

### Env vars necessárias

- **`GITHUB_API_TOKEN`** (fine-grained PAT, repo `brazilianhustle/inkflow-saas`, Actions:Read + Contents:Read) — sem ele Sintomas A + C ficam skip silencioso.
- **`CLOUDFLARE_API_TOKEN`** (já em prod) — Sintomas B + C.
- **`CLOUDFLARE_ACCOUNT_ID`** (já em prod) — Sintomas B + C.
- **`AUDIT_DEPLOY_HEALTH_WINDOW_HOURS`** (opcional, default 6) — janela de detecção pra Sintomas A + B.
- **`AUDIT_DEPLOY_HEALTH_WRANGLER_DRIFT`** (opcional, default off) — opt-in pra Sintoma C.
- **`CF_PAGES_PROJECT_NAME`** (opcional, default `inkflow-saas`).
- **`CF_WORKER_SCRIPT_NAME`** (opcional, default `inkflow-cron`).
- **`GITHUB_REPO_FULL_NAME`** (opcional, default `brazilianhustle/inkflow-saas`).

### Dedupe

Single-state per auditor (collapse). Múltiplos sintomas no mesmo run colapsam em 1 evento top-severity. `payload.affected_symptoms` lista todos. Trade-off pós-MVP: granularidade fina por sintoma requer migration.

### Runbook trigger

Quando alerta `[critical] [deploy-health]` chegar no Telegram, seguir [rollback.md](runbooks/rollback.md) — diagnóstico (1 min) → rollback (CF Pages + Worker) → fix git depois.
```

- [ ] **Step 8.2: Atualizar `.claude/agents/README.md`**

Localizar seção "Mapping auditor → agent" (criada no PR #11). Adicionar entry deploy-health:

```markdown
## Mapping auditor → agent

| Auditor | Suggested subagent | Doctrine reason |
|---|---|---|
| `key-expiry` | `deploy-engineer` | Secrets vivem em CF Pages env; rotação envolve `wrangler` + GHA Secrets. Domain match. |
| `deploy-health` | `deploy-engineer` | Failures de pipeline (GHA + CF Pages + Wrangler). Domain match — agent já roteia rollback.md. |
```

- [ ] **Step 8.3: Atualizar `incident-response.md` §6.3**

Localizar §6.3 "Auditores em prod (cross-ref)" e adicionar bullet:

```markdown
- **deploy-health** (2026-04-XX): detecta falhas recentes na pipeline de deploy via GHA Actions API + CF Pages API. Alerta `[critical] [deploy-health]` → seguir [rollback.md](../runbooks/rollback.md). Doc canônico: [auditores.md#deploy-health](../auditores.md#deploy-health).
```

- [ ] **Step 8.4: Commit docs**

```bash
git add docs/canonical/auditores.md .claude/agents/README.md docs/canonical/methodology/incident-response.md
git commit -m "docs(auditor-deploy-health): canonical entry + agent mapping + incident-response cross-link"
```

---

### Task 9: PR + merge + atualizar Painel

- [ ] **Step 9.1: Verificar status final**

```bash
git log --oneline main..HEAD
# Deve listar 8-10 commits (Task 1-8 cada gerou ≥1 commit)

node --test tests/auditor-deploy-health.test.mjs tests/audit-deploy-health-endpoint.test.mjs tests/audit-state.test.mjs tests/auditor-key-expiry.test.mjs tests/audit-key-expiry-endpoint.test.mjs tests/audit-cleanup.test.mjs tests/audit-escalate.test.mjs tests/audit-telegram-webhook.test.mjs
# Tudo PASS
```

- [ ] **Step 9.2: Push final + abrir PR**

```bash
git push
gh pr create --title "feat: Sub-projeto 3 §9.2 — Auditor #2 deploy-health" --body "$(cat <<'EOF'
## Summary

Implementa o segundo auditor real do Sub-projeto 3 — `deploy-health` — seguindo spec v1.1 §5.2 + plano `docs/superpowers/plans/2026-04-29-auditor-deploy-health.md`.

- **3 sintomas** — A (GHA failures via GitHub Actions API, 1=warn/2+=critical), B (CF Pages build failures, mesma escala), C (Wrangler drift opt-in via `AUDIT_DEPLOY_HEALTH_WRANGLER_DRIFT='true'`)
- **Endpoint** `/api/cron/audit-deploy-health` orquestra detect → collapseEvents → dedupePolicy → fire/silent/supersede/resolve via lib `audit-state` (já em prod desde PR #10)
- **Cron** `0 */6 * * *` registrado no `inkflow-cron` dispatcher (8 triggers totais, cap 30 do plano CF Workers Paid)
- **Smoke E2E PASS** — `evals/sub-projeto-3/2026-04-29-auditor-deploy-health-smoke.md`
- **Docs canônicos** — `docs/canonical/auditores.md` (entry nova) + cross-links em `incident-response.md` + `.claude/agents/README.md`

Dependência §9.1 (key-expiry): PR #11 — em prod.

## Test plan

- [ ] CI deploy GHA passes
- [ ] Cron registrado em CF Workers (8 triggers totais)
- [ ] Smoke 1 — trigger sem failures → events_count=0
- [ ] Smoke 2 — 2 GHA failures forçados → critical no Telegram
- [ ] Smoke 3 — ack flow fecha (`acknowledged_at` preenchido)
- [ ] Smoke 4 — resolve (`resolved_at` preenchido após next clean run)
- [ ] 48h em prod sem falsa-positiva (gate pós-merge, monitor passive)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 9.3: Merge commit (preserva história granular)**

Decisão: **merge commit** (preserva 8-10 commits granulares como nos PRs #10 e #11). Doctrine cravada no Sub-projeto 5: PRs canonical preservam história granular.

```bash
# Antes: confirmar GHA verde + nenhum review pendente
gh pr checks
gh pr merge --merge --delete-branch
```

- [ ] **Step 9.4: Pós-merge — Atualizar Painel + vault**

Manualmente atualizar `~/.claude/projects/-*/memory/InkFlow — Painel.md`:
- Estado anterior agora é "Sub-projeto 3 §9.0 + §9.1 (key-expiry) + §9.2 (deploy-health) em prod"
- Próxima sessão sugerida: Auditor #5 `billing-flow` (§9.3, próximo Worker auditor) ou Modo Coleta

Atualizar `~/.claude/projects/-*/memory/InkFlow — Pendências (backlog).md`:
- Sub-projeto 3 progresso: 2/5 auditores done

Criar nota-âncora vault `~/.claude/projects/-*/memory/InkFlow — Auditor deploy-health (2026-04-XX).md` linkando spec + plano + smoke doc.

---

## Self-review

Revisão executada inline conforme skill writing-plans:

**1. Spec coverage:**
- §5.2 detecção 3 sintomas → Tasks 2/3/4 ✅
- §5.2 payload format (`runbook_path`, `suggested_subagent`, `summary`, `failed_runs`, `last_successful_deploy`) → Task 2 + 5 ✅
- §6.1-6.2 dedupe via lib existente → Task 5 ✅
- §6.3 Telegram format via `sendTelegram` da lib → Task 5 (delegado) ✅
- §6.4 ack flow → endpoint webhook já em prod (PR #10), validado em Task 7.3 ✅
- §6.5 escalation → cron já em prod (PR #10), deploy-health herda automaticamente ✅
- §9.2 ordem (detect → endpoint → cron → smoke → 48h) → Tasks 1-9 ✅
- §10 DoD por auditor:
  - `detect()` pura com 3+ fixtures → Tasks 2/3/4 ✅
  - Unit tests passando → Task 5.5 ✅
  - Smoke test E2E (trigger → Telegram → ack → resolve) → Task 7 ✅
  - Heartbeat audit_runs → Task 5 (startRun/endRun) ✅
  - Payload `runbook_path` válido → Task 2 (`rollback.md` — confirmado em pre-flight) ✅
  - Payload `suggested_subagent` → Task 2 (`deploy-engineer`) ✅
  - Cross-ref `.claude/agents/README.md` → Task 8.2 ✅
  - Doc canonical entry → Task 8.1 ✅
  - 48h em prod sem falsa-positiva → gate passive pós-merge (registrado em Task 9 test plan) ✅

**2. Placeholder scan:** zero TBD/TODO/"add error handling"/"similar to Task N". Cada step tem código real ou comando exato.

**3. Type consistency:**
- `detect({ env, fetchImpl, now })` — assinatura idêntica ao key-expiry, mantida em Tasks 1, 2, 3, 4, 5
- `dedupePolicy(current, next)` — usa nome real da lib `audit-state.js`
- `startRun(supabase, auditor)` / `endRun(supabase, runId, { status, eventsEmitted, errorMessage })` — nomes idênticos aos da lib
- `insertEvent(supabase, evt)` — assinatura idêntica
- `payload.symptom` — string literal `'gha-failures'` / `'pages-failures'` / `'wrangler-drift'` / `'aggregate'` consistente
- `current.event_id` (não `current.id`) — replicado do fix bug #2 do key-expiry (commit `0bbcd69`) pra evitar regressão

**4. Risk markers:**
- ⚠️ **GHA API rate limit** — fine-grained PAT autenticado tem 5000 req/h. Auditor faz 1-3 req/run × 4 runs/dia = 12 req/dia. Negligível. Pre-flight Task 6 cria PAT com escopo mínimo (Actions:Read + Contents:Read).
- ⚠️ **GitHub API false positive em "Deploy to Cloudflare Pages" name match** — se outro workflow ganhar mesmo `name`, contagem inflada. Mitigação: nome canônico do workflow está cravado em `deploy.yml`. Se renomeado, atualizar `GHA_WORKFLOW_NAME` const + atualizar test fixtures.
- ⚠️ **Bug B do PR #10 (CF Pages env edit redeploy)** — Task 7.4 path C (override window) requer empty commit + push. Documentado.
- ⚠️ **Smoke 2 efeito colateral em GHA history** — workflow temporário `failing-deploy.yml` deixa runs failed permanentes no histórico GitHub Actions. Aceitável (não polui prod), mas vai aparecer em busca futura. Cleanup do workflow file (Task 7.4) impede novos disparos mas não apaga runs antigas.
- ⚠️ **Sintoma C false positive opt-in** — `worker.modified_on` representa ÚLTIMO deploy do Worker, não last edit do `wrangler.toml`. Se um commit toca cron-worker/* mas não deploya o worker (ex: edit em README do dir), drift detectado falso. Mitigação: opt-in default OFF + threshold 1h folga + observar 7d antes de promover pra critical.
- ⚠️ **Collapse single-state** — múltiplos sintomas (A+B+C) colapsam em 1 evento. Founder vê só top severity no Telegram, mas `payload.affected_symptoms` lista todos. Comportamento documentado em `auditores.md` (Task 8.1) ✅.
- ⚠️ **Resolve flow após smoke 2 (Task 7.4)** — failures GHA "antigas" continuam na janela 6h por algumas horas. Caminho C (window=1h temporário) é a opção pragmática pra concluir smoke no mesmo dia. Caminho A (esperar 6h naturalmente) é mais limpo mas demora.

**5. Independent task validation:** cada Task termina em commit. Tasks 1-5 podem ser executadas localmente sem deploy. Task 6+ requer prod. Task 7 requer interação humana (reply no Telegram + confirmar workflow disparos). Tasks 8-9 são docs/PR — independentes do código.

**Ajustes inline aplicados:**
- ✅ Decisão #5 (Sintoma C severity) — rebaixei spec `critical` → `warn` no opt-in MVP. Decisão pragmática registrada com promoção pós-7d baseline.
- ✅ Task 5 endpoint usa `current.event_id` (não `current.id`) — replica fix bug #2 do key-expiry, evita regressão idêntica.
- ✅ Task 7.4 cleanup tem 3 caminhos documentados — escolha registrada como C (window override) por velocidade.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-29-auditor-deploy-health.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch fresh subagent per task + 2-stage review (spec-compliance + code-quality reviewers entre tasks). Fast iteration, principal supervises. Pattern usado nos PRs #10 e #11 — funcionou bem.

**2. Inline Execution** — Executar tasks na sessão atual via `superpowers:executing-plans`. Mais rápido se plano é simples (este é médio — 9 tasks, TDD strict).

**Recomendação:** **Subagent-Driven**. Tasks 1-5 são puro TDD (mecânico, perfeito pra subagent), Task 6 envolve setup de PAT + deploy (principal coordena, secret-handling), Task 7 envolve interação humana (principal coordena), Tasks 8-9 são docs/PR (subagent ou principal).

**Aguarda aprovação do founder antes de começar execução.**
