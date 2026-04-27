# Auditor #1 — `key-expiry` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o primeiro auditor real do Sub-projeto 3 — `key-expiry` — que detecta secrets expirando ou inválidos via 3 camadas (TTL conhecida, self-check API call, cross-replica drift opt-in) e dispara alerta Telegram com severity warn/critical via pipeline core já em prod.

**Architecture:** Função pura `detect({ env, fetchImpl, now })` em `functions/_lib/auditors/key-expiry.js` retorna lista de eventos potenciais. Endpoint `functions/api/cron/audit-key-expiry.js` orquestra: `startRun` → `detect` → loop por evento aplicando `dedupePolicy(currentState, event)` → ação (`fire`/`silent`/`supersede`/`resolve`/`no-op`) → `endRun`. Cron `0 6 * * *` no `inkflow-cron` Worker dispara o endpoint via dispatcher pattern já existente. Sem refatoração da lib `audit-state.js`.

**Tech Stack:** CF Pages Functions (ESM), `node:test` + `node:assert/strict` pra unit tests (sem deps externas), `cron-worker` (CF Workers) como dispatcher. Lib reusada: `functions/_lib/audit-state.js` (PR #10 commit `0de4e03`).

---

## Spec reference

- **Spec:** `docs/superpowers/specs/2026-04-27-auditores-mvp-design.md` v1.1 (commit `e8402d0`)
- **Seções foco:** §5.1 (key-expiry), §6.1-6.2 (audit-state lib + dedupe), §6.3 (Telegram format), §9.1 (ordem implementação), §10 "Por auditor" (DoD)
- **Runbook linkado:** `docs/canonical/runbooks/secrets-expired.md` (já existe)
- **Suggested subagent:** `deploy-engineer`

## Decisões de implementação não cravadas no spec

Decisões pequenas mas necessárias pra implementação destravar — registradas aqui pra rastreabilidade. Cada uma é defensável e consistente com o spec:

1. **Layer 1 (TTL) data source:** spec lista `CLOUDFLARE_API_TOKEN` (90d) mas não diz como o auditor sabe a expiry. Crava env var `CLOUDFLARE_API_TOKEN_EXPIRES_AT` (ISO 8601 UTC) populada manualmente quando o founder rotacionar (já hoje rotaciona via `runbooks/secrets-expired.md`). Sem env → layer 1 retorna nada (skip silencioso). Único secret com TTL conhecida no MVP — outros 7 secrets cobertos só por Layer 2.
2. **Layer 2 (self-check) error semantics:** 401 = `critical` imediato (key inválida). Network error / timeout = `warn` (transiente — não escala se reproduzir 3x). Sem env (secret ausente) = skip silencioso (não é dano em curso).
3. **Layer 3 (drift) opt-in:** flag `AUDIT_KEY_EXPIRY_LAYER3` aceita literal `'true'`. Qualquer outro valor (incluindo undefined) → skip. Documentado no spec §5.1.
4. **`detect()` purity:** recebe `{ env, fetchImpl, now }` como input. Test fixtures injetam `fetchImpl` mock + `now` fixo. Endpoint passa `globalThis.fetch` + `Date.now()`. Zero mock global.
5. **Telegram bot self-check:** spec §5.1 lista `TELEGRAM_BOT_TOKEN` na tabela. Self-check usa `/getMe`. Trade-off conhecido: se TELEGRAM_BOT_TOKEN está inválido, o próprio alerta de critical não chega. Aceitável no MVP — `monitor-whatsapp` cron e GHA notifications cobrem fallback.

---

## File structure

**Created:**
- `functions/_lib/auditors/key-expiry.js` — pure `detect()` com 3 camadas
- `tests/auditor-key-expiry.test.mjs` — unit tests da `detect()` (3+ fixtures por camada)
- `functions/api/cron/audit-key-expiry.js` — endpoint orquestrador
- `tests/audit-key-expiry-endpoint.test.mjs` — integration tests (auth, dedupe wiring)
- `docs/canonical/auditores.md` — doc canônico, primeira entry: `key-expiry`
- `evals/sub-projeto-3/2026-04-27-auditor-key-expiry-smoke.md` — smoke E2E doc

**Modified:**
- `cron-worker/src/index.js` — entry nova em `SCHEDULE_MAP`
- `cron-worker/wrangler.toml` — trigger `0 6 * * *`
- `.claude/agents/README.md` — Mapping auditor → agent (key-expiry → deploy-engineer)
- `docs/canonical/methodology/incident-response.md` — §6.3 cross-link pra `auditores.md`

---

## Pre-flight (validar antes de Task 1)

- [ ] **Branch limpa:** `git status` → working tree clean, em `main` no commit `deadeb7` ou descendente
- [ ] **Tests existentes passando:** `node --test tests/audit-state.test.mjs` → 21/21 PASS
- [ ] **Lib `audit-state.js` em prod:** `grep -c "export" functions/_lib/audit-state.js` → ≥7 funções exportadas
- [ ] **Spec v1.1 em main:** `git show e8402d0:docs/superpowers/specs/2026-04-27-auditores-mvp-design.md | head -5` → mostra header v1.1
- [ ] **`secrets-expired.md` em main:** `ls docs/canonical/runbooks/secrets-expired.md` → arquivo existe
- [ ] **Env var planejada não conflitante:** `grep -r "AUDIT_KEY_EXPIRY_LAYER3\|CLOUDFLARE_API_TOKEN_EXPIRES_AT" functions/ cron-worker/ 2>/dev/null` → vazio (nomes livres)

Se algum check falha → resolver antes de prosseguir. Não pular.

---

### Task 1: Branch + skeleton + smoke test do módulo

**Files:**
- Create: `functions/_lib/auditors/key-expiry.js`
- Create: `tests/auditor-key-expiry.test.mjs`

- [ ] **Step 1.1: Criar branch**

```bash
git checkout -b feat/auditor-key-expiry
```

- [ ] **Step 1.2: Stub do módulo `key-expiry.js`**

Arquivo: `functions/_lib/auditors/key-expiry.js`

```js
// ── InkFlow — Auditor #1: key-expiry ──────────────────────────────────────
// Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §5.1
//
// detect({ env, fetchImpl, now }) → Array<event>
//   event = { severity, payload, evidence }
//   - severity ∈ {'clean', 'warn', 'critical'}
//   - payload preenchido por camada (campos por layer abaixo)
//   - evidence = response bruto da camada que disparou
//
// 3 camadas:
//   Layer 1 (TTL):    env.CLOUDFLARE_API_TOKEN_EXPIRES_AT (ISO date)
//   Layer 2 (check):  GET self-check em 8 secrets críticos
//   Layer 3 (drift):  env.AUDIT_KEY_EXPIRY_LAYER3 === 'true' (opt-in)

export async function detect({ env, fetchImpl, now = Date.now() } = {}) {
  return [];
}
```

- [ ] **Step 1.3: Stub test file**

Arquivo: `tests/auditor-key-expiry.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../functions/_lib/auditors/key-expiry.js';

test('detect is exported as async function', () => {
  assert.equal(typeof detect, 'function');
});

test('detect with empty env returns empty array', async () => {
  const events = await detect({ env: {}, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
  assert.deepEqual(events, []);
});
```

- [ ] **Step 1.4: Rodar test, verificar PASS**

```bash
node --test tests/auditor-key-expiry.test.mjs
```

Expected: `# tests 2 # pass 2 # fail 0`

- [ ] **Step 1.5: Commit**

```bash
git add functions/_lib/auditors/key-expiry.js tests/auditor-key-expiry.test.mjs
git commit -m "feat(auditor-key-expiry): skeleton detect() + smoke test"
```

---

### Task 2: Camada 1 (TTL) — TDD

**Files:**
- Modify: `functions/_lib/auditors/key-expiry.js` (add layer 1)
- Modify: `tests/auditor-key-expiry.test.mjs` (add 4 tests)

**Spec mapping (§5.1 tabela TTL):**
| Dias até expiry | Severity |
|---|---|
| > 14d | clean |
| 7-14d | warn |
| 1-6d | critical |
| ≤ 0 | critical |

- [ ] **Step 2.1: Escrever 4 failing tests pra Layer 1**

Adicionar ao final de `tests/auditor-key-expiry.test.mjs`:

```js
// Layer 1 — TTL ─────────────────────────────────────────────────────────────

const NOW = new Date('2026-04-27T12:00:00Z').getTime();
const noopFetch = async () => ({ ok: true, json: async () => ({}) });

function envWithTTL(daysFromNow) {
  const expiresAt = new Date(NOW + daysFromNow * 24 * 3600 * 1000).toISOString();
  return { CLOUDFLARE_API_TOKEN_EXPIRES_AT: expiresAt };
}

test('layer1: TTL > 14d → clean event (or no event)', async () => {
  const events = await detect({ env: envWithTTL(20), fetchImpl: noopFetch, now: NOW });
  const ttlEvents = events.filter((e) => e.payload?.layer === 'ttl');
  assert.ok(ttlEvents.length === 0 || ttlEvents[0].severity === 'clean',
    'Should emit no event or clean for >14d TTL');
});

test('layer1: TTL 7-14d → warn event', async () => {
  const events = await detect({ env: envWithTTL(10), fetchImpl: noopFetch, now: NOW });
  const ttl = events.find((e) => e.payload?.layer === 'ttl');
  assert.ok(ttl, 'Layer 1 event should exist');
  assert.equal(ttl.severity, 'warn');
  assert.equal(ttl.payload.secret_name, 'CLOUDFLARE_API_TOKEN');
  assert.equal(ttl.payload.days_until_expiry, 10);
});

test('layer1: TTL 1-6d → critical event', async () => {
  const events = await detect({ env: envWithTTL(5), fetchImpl: noopFetch, now: NOW });
  const ttl = events.find((e) => e.payload?.layer === 'ttl');
  assert.equal(ttl.severity, 'critical');
  assert.equal(ttl.payload.days_until_expiry, 5);
});

test('layer1: TTL <=0 → critical event', async () => {
  const events = await detect({ env: envWithTTL(-2), fetchImpl: noopFetch, now: NOW });
  const ttl = events.find((e) => e.payload?.layer === 'ttl');
  assert.equal(ttl.severity, 'critical');
  assert.ok(ttl.payload.days_until_expiry <= 0);
});

test('layer1: env missing → skip (no TTL event)', async () => {
  const events = await detect({ env: {}, fetchImpl: noopFetch, now: NOW });
  const ttl = events.find((e) => e.payload?.layer === 'ttl');
  assert.equal(ttl, undefined);
});
```

- [ ] **Step 2.2: Rodar tests, verificar FAIL**

```bash
node --test tests/auditor-key-expiry.test.mjs
```

Expected: 4 das 5 layer1 tests devem FALHAR (skip case passa). Erro tipo `Cannot read property 'layer' of undefined` ou `Layer 1 event should exist`.

- [ ] **Step 2.3: Implementar Layer 1**

Substituir conteúdo de `functions/_lib/auditors/key-expiry.js`:

```js
// ── InkFlow — Auditor #1: key-expiry ──────────────────────────────────────
// Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §5.1

const RUNBOOK_PATH = 'docs/canonical/runbooks/secrets-expired.md';
const SUGGESTED_SUBAGENT = 'deploy-engineer';

// Layer 1: TTL ───────────────────────────────────────────────────────────────

function ttlSeverity(days) {
  if (days > 14) return 'clean';
  if (days >= 7) return 'warn';
  return 'critical';
}

function detectLayer1(env, now) {
  const expiresAtIso = env.CLOUDFLARE_API_TOKEN_EXPIRES_AT;
  if (!expiresAtIso) return [];
  const expiresAt = new Date(expiresAtIso).getTime();
  if (Number.isNaN(expiresAt)) return [];
  const daysUntil = Math.floor((expiresAt - now) / (24 * 3600 * 1000));
  const severity = ttlSeverity(daysUntil);
  return [{
    severity,
    payload: {
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: severity === 'clean'
        ? `CLOUDFLARE_API_TOKEN OK (expira em ${daysUntil}d)`
        : `CLOUDFLARE_API_TOKEN expira em ${daysUntil}d`,
      secret_name: 'CLOUDFLARE_API_TOKEN',
      layer: 'ttl',
      days_until_expiry: daysUntil,
      expires_at: expiresAtIso,
    },
    evidence: { source: 'env.CLOUDFLARE_API_TOKEN_EXPIRES_AT', value: expiresAtIso },
  }];
}

// detect ────────────────────────────────────────────────────────────────────

export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  const events = [];
  events.push(...detectLayer1(env, now));
  return events;
}
```

- [ ] **Step 2.4: Rodar tests, verificar PASS**

```bash
node --test tests/auditor-key-expiry.test.mjs
```

Expected: `# pass 7 # fail 0` (2 originais + 5 layer1 — clean case retorna evento clean ao invés de array vazio, ajustar assertion se necessário)

- [ ] **Step 2.5: Commit**

```bash
git add functions/_lib/auditors/key-expiry.js tests/auditor-key-expiry.test.mjs
git commit -m "feat(auditor-key-expiry): Layer 1 (TTL) — CLOUDFLARE_API_TOKEN expiry math"
```

---

### Task 3: Camada 2 (self-check) — TDD

**Files:**
- Modify: `functions/_lib/auditors/key-expiry.js` (add layer 2)
- Modify: `tests/auditor-key-expiry.test.mjs` (add 5 tests)

**Spec mapping (§5.1 tabela self-check):** 8 secrets, 401 = critical imediato.

| Secret | Endpoint | Header |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `https://api.cloudflare.com/client/v4/user/tokens/verify` | `Authorization: Bearer <key>` |
| `CF_API_TOKEN` | mesmo (token CF para GHA Pages — separado, mas mesma API) | `Authorization: Bearer <key>` |
| `MP_ACCESS_TOKEN` | `https://api.mercadopago.com/users/me` | `Authorization: Bearer <key>` |
| `TELEGRAM_BOT_TOKEN` | `https://api.telegram.org/bot<token>/getMe` | n/a (token na URL) |
| `OPENAI_API_KEY` | `https://api.openai.com/v1/models` | `Authorization: Bearer <key>` |
| `PUSHOVER_APP_TOKEN` | `https://api.pushover.net/1/users/validate.json` | form-data: `token=<key>&user=<PUSHOVER_USER_KEY>` |
| `SUPABASE_SERVICE_KEY` | `https://bfzuxxuscyplfoimvomh.supabase.co/rest/v1/?limit=1` | `apikey: <key>` + `Authorization: Bearer <key>` |
| `EVO_GLOBAL_KEY` | `https://evo.inkflowbrasil.com/instance/fetchInstances` | `apikey: <key>` |

**Nota nome real do env:** o repo usa `SUPABASE_SERVICE_KEY` (não `SUPABASE_SERVICE_ROLE_KEY` do spec) — confirmado em `audit-cleanup.js:27`. Plano usa nome real.

**Nota Pushover validate:** `validate.json` precisa de `token` + `user`. Sem `PUSHOVER_USER_KEY` → skip (não disparamos dispatch test priority=0 pra evitar push parasita em runs normais).

- [ ] **Step 3.1: Escrever tests pra Layer 2**

Adicionar ao final de `tests/auditor-key-expiry.test.mjs`:

```js
// Layer 2 — self-check ──────────────────────────────────────────────────────

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

const fullEnv = {
  CLOUDFLARE_API_TOKEN: 'cf-tok',
  CF_API_TOKEN: 'cf-gha-tok',
  MP_ACCESS_TOKEN: 'mp-tok',
  TELEGRAM_BOT_TOKEN: 'tg-tok',
  OPENAI_API_KEY: 'oa-key',
  PUSHOVER_APP_TOKEN: 'po-app',
  PUSHOVER_USER_KEY: 'po-user',
  SUPABASE_SERVICE_KEY: 'sb-key',
  EVO_GLOBAL_KEY: 'evo-key',
};

test('layer2: all 8 self-checks return 200 → no critical events', async () => {
  const fetchImpl = makeFetchImpl([
    ['cloudflare.com', { ok: true, status: 200, text: async () => '{"result":{"status":"active"}}' }],
    ['mercadopago.com', { ok: true, status: 200, text: async () => '{"id":1}' }],
    ['api.telegram.org', { ok: true, status: 200, text: async () => '{"ok":true}' }],
    ['api.openai.com', { ok: true, status: 200, text: async () => '{"data":[]}' }],
    ['api.pushover.net', { ok: true, status: 200, text: async () => '{"status":1}' }],
    ['supabase.co', { ok: true, status: 200, text: async () => '[]' }],
    ['evo.inkflowbrasil.com', { ok: true, status: 200, text: async () => '[]' }],
  ]);
  const events = await detect({ env: fullEnv, fetchImpl, now: NOW });
  const layer2Critical = events.filter((e) => e.payload?.layer === 'self-check' && e.severity === 'critical');
  assert.equal(layer2Critical.length, 0);
});

test('layer2: 401 from CLOUDFLARE → critical event with correct payload', async () => {
  const fetchImpl = makeFetchImpl([
    ['cloudflare.com', { ok: false, status: 401, text: async () => '{"errors":[{"code":1000}]}' }],
  ]);
  const events = await detect({ env: { CLOUDFLARE_API_TOKEN: 'invalid' }, fetchImpl, now: NOW });
  const evt = events.find((e) => e.payload?.layer === 'self-check' && e.payload?.secret_name === 'CLOUDFLARE_API_TOKEN');
  assert.ok(evt, 'Critical event for CF should exist');
  assert.equal(evt.severity, 'critical');
  assert.equal(evt.payload.suggested_subagent, 'deploy-engineer');
  assert.equal(evt.payload.runbook_path, 'docs/canonical/runbooks/secrets-expired.md');
});

test('layer2: missing env var → skip that secret silently', async () => {
  const fetchImpl = makeFetchImpl([]);
  const events = await detect({ env: {}, fetchImpl, now: NOW });
  const layer2 = events.filter((e) => e.payload?.layer === 'self-check');
  assert.equal(layer2.length, 0);
});

test('layer2: network error → warn (transient)', async () => {
  const fetchImpl = makeFetchImpl([
    ['mercadopago.com', new Error('ECONNRESET')],
  ]);
  const events = await detect({ env: { MP_ACCESS_TOKEN: 'mp-tok' }, fetchImpl, now: NOW });
  const evt = events.find((e) => e.payload?.layer === 'self-check' && e.payload?.secret_name === 'MP_ACCESS_TOKEN');
  assert.equal(evt.severity, 'warn');
  assert.match(evt.payload.summary, /transient|network|error/i);
});

test('layer2: 401 in two secrets → two critical events', async () => {
  const fetchImpl = makeFetchImpl([
    ['cloudflare.com', { ok: false, status: 401, text: async () => '{}' }],
    ['mercadopago.com', { ok: false, status: 401, text: async () => '{}' }],
  ]);
  const events = await detect({
    env: { CLOUDFLARE_API_TOKEN: 'x', MP_ACCESS_TOKEN: 'y' },
    fetchImpl, now: NOW,
  });
  const criticals = events.filter((e) => e.payload?.layer === 'self-check' && e.severity === 'critical');
  assert.equal(criticals.length, 2);
});

test('layer2: PUSHOVER without USER_KEY → skip (incomplete config)', async () => {
  const fetchImpl = makeFetchImpl([]);
  const events = await detect({
    env: { PUSHOVER_APP_TOKEN: 'po-app' },
    fetchImpl, now: NOW,
  });
  const evt = events.find((e) => e.payload?.secret_name === 'PUSHOVER_APP_TOKEN');
  assert.equal(evt, undefined);
});
```

- [ ] **Step 3.2: Rodar tests, verificar FAIL**

```bash
node --test tests/auditor-key-expiry.test.mjs
```

Expected: 6 layer2 tests FAIL.

- [ ] **Step 3.3: Implementar Layer 2**

Adicionar ao `functions/_lib/auditors/key-expiry.js` (antes da função `detect`):

```js
// Layer 2: self-check ───────────────────────────────────────────────────────

const SELF_CHECK_TARGETS = [
  {
    name: 'CLOUDFLARE_API_TOKEN',
    url: 'https://api.cloudflare.com/client/v4/user/tokens/verify',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: 'CF_API_TOKEN',
    url: 'https://api.cloudflare.com/client/v4/user/tokens/verify',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: 'MP_ACCESS_TOKEN',
    url: 'https://api.mercadopago.com/users/me',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: 'TELEGRAM_BOT_TOKEN',
    url: (key) => `https://api.telegram.org/bot${key}/getMe`,
    headers: () => ({}),
  },
  {
    name: 'OPENAI_API_KEY',
    url: 'https://api.openai.com/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: 'PUSHOVER_APP_TOKEN',
    url: 'https://api.pushover.net/1/users/validate.json',
    method: 'POST',
    body: (key, env) => `token=${encodeURIComponent(key)}&user=${encodeURIComponent(env.PUSHOVER_USER_KEY)}`,
    contentType: 'application/x-www-form-urlencoded',
    requires: ['PUSHOVER_USER_KEY'],
  },
  {
    name: 'SUPABASE_SERVICE_KEY',
    url: 'https://bfzuxxuscyplfoimvomh.supabase.co/rest/v1/?limit=1',
    headers: (key) => ({ apikey: key, Authorization: `Bearer ${key}` }),
  },
  {
    name: 'EVO_GLOBAL_KEY',
    url: 'https://evo.inkflowbrasil.com/instance/fetchInstances',
    headers: (key) => ({ apikey: key }),
  },
];

function timeoutSignal(ms) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

async function selfCheckOne(target, env, fetchImpl) {
  const key = env[target.name];
  if (!key) return null;
  if (target.requires) {
    for (const r of target.requires) {
      if (!env[r]) return null;
    }
  }
  const url = typeof target.url === 'function' ? target.url(key) : target.url;
  const opts = {
    method: target.method || 'GET',
    headers: typeof target.headers === 'function' ? target.headers(key) : (target.headers || {}),
    signal: timeoutSignal(5000),
  };
  if (target.body) {
    opts.body = target.body(key, env);
    opts.headers = { ...opts.headers, 'Content-Type': target.contentType };
  }

  let res;
  try {
    res = await fetchImpl(url, opts);
  } catch (err) {
    return {
      severity: 'warn',
      payload: {
        runbook_path: RUNBOOK_PATH,
        suggested_subagent: SUGGESTED_SUBAGENT,
        summary: `${target.name} self-check transient network error: ${err.message}`,
        secret_name: target.name,
        layer: 'self-check',
        status: 'network_error',
      },
      evidence: { error: err.message, url },
    };
  }

  if (res.status === 401 || res.status === 403) {
    let bodyShort = '';
    try { bodyShort = (await res.text()).slice(0, 200); } catch { /* ignore */ }
    return {
      severity: 'critical',
      payload: {
        runbook_path: RUNBOOK_PATH,
        suggested_subagent: SUGGESTED_SUBAGENT,
        summary: `${target.name} self-check returned ${res.status} (key inválida)`,
        secret_name: target.name,
        layer: 'self-check',
        status: res.status,
      },
      evidence: { status: res.status, body_short: bodyShort, url },
    };
  }

  if (!res.ok) {
    let bodyShort = '';
    try { bodyShort = (await res.text()).slice(0, 200); } catch { /* ignore */ }
    return {
      severity: 'warn',
      payload: {
        runbook_path: RUNBOOK_PATH,
        suggested_subagent: SUGGESTED_SUBAGENT,
        summary: `${target.name} self-check returned ${res.status} (transient)`,
        secret_name: target.name,
        layer: 'self-check',
        status: res.status,
      },
      evidence: { status: res.status, body_short: bodyShort, url },
    };
  }

  return null;
}

async function detectLayer2(env, fetchImpl) {
  const events = [];
  for (const target of SELF_CHECK_TARGETS) {
    const evt = await selfCheckOne(target, env, fetchImpl);
    if (evt) events.push(evt);
  }
  return events;
}
```

E atualizar `detect`:

```js
export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  const events = [];
  events.push(...detectLayer1(env, now));
  if (fetchImpl) {
    events.push(...await detectLayer2(env, fetchImpl));
  }
  return events;
}
```

- [ ] **Step 3.4: Rodar tests, verificar PASS**

```bash
node --test tests/auditor-key-expiry.test.mjs
```

Expected: `# pass 13 # fail 0` (2 + 5 + 6).

- [ ] **Step 3.5: Commit**

```bash
git add functions/_lib/auditors/key-expiry.js tests/auditor-key-expiry.test.mjs
git commit -m "feat(auditor-key-expiry): Layer 2 (self-check) — 8 secrets via API"
```

---

### Task 4: Camada 3 (drift opt-in) — TDD

**Files:**
- Modify: `functions/_lib/auditors/key-expiry.js` (add layer 3)
- Modify: `tests/auditor-key-expiry.test.mjs` (add 4 tests)

**Spec mapping (§5.1 Camada 3):** opt-in via `env.AUDIT_KEY_EXPIRY_LAYER3 === 'true'`. Compara `pages.latest_deployment.modified_on` vs `worker.modified_on`. |diff| > 24h → warn. Requer `CLOUDFLARE_API_TOKEN` com scopes Account/Pages/Workers Read.

API endpoints:
- Pages: `GET https://api.cloudflare.com/client/v4/accounts/{account_id}/pages/projects/{project_name}` → `result.latest_deployment.modified_on`
- Workers: `GET https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{script_name}` → `result.modified_on`

Env vars necessários (já existem em CF Pages env): `CLOUDFLARE_ACCOUNT_ID`, `CF_PAGES_PROJECT_NAME` (default `inkflow-saas`), `CF_WORKER_SCRIPT_NAME` (default `inkflow-cron`). Crava defaults pra reduzir config necessária.

- [ ] **Step 4.1: Escrever tests pra Layer 3**

Adicionar ao final de `tests/auditor-key-expiry.test.mjs`:

```js
// Layer 3 — drift (opt-in) ──────────────────────────────────────────────────

const layer3Env = (extras = {}) => ({
  CLOUDFLARE_API_TOKEN: 'cf-tok',
  CLOUDFLARE_ACCOUNT_ID: 'acc-123',
  AUDIT_KEY_EXPIRY_LAYER3: 'true',
  ...extras,
});

function makeLayer3Fetch({ pagesModifiedAt, workerModifiedAt }) {
  return makeFetchImpl([
    ['/pages/projects/', {
      ok: true, status: 200,
      text: async () => JSON.stringify({ result: { latest_deployment: { modified_on: pagesModifiedAt } } }),
      json: async () => ({ result: { latest_deployment: { modified_on: pagesModifiedAt } } }),
    }],
    ['/workers/scripts/', {
      ok: true, status: 200,
      text: async () => JSON.stringify({ result: { modified_on: workerModifiedAt } }),
      json: async () => ({ result: { modified_on: workerModifiedAt } }),
    }],
    ['/user/tokens/verify', { ok: true, status: 200, text: async () => '{}' }],
  ]);
}

test('layer3: flag missing → skip (no drift event)', async () => {
  const fetchImpl = makeLayer3Fetch({
    pagesModifiedAt: '2026-04-25T10:00:00Z',
    workerModifiedAt: '2026-04-20T10:00:00Z',
  });
  const events = await detect({
    env: { CLOUDFLARE_API_TOKEN: 'x', CLOUDFLARE_ACCOUNT_ID: 'acc' },
    fetchImpl, now: NOW,
  });
  const drift = events.find((e) => e.payload?.layer === 'drift');
  assert.equal(drift, undefined);
});

test('layer3: flag on + diff < 24h → no event', async () => {
  const fetchImpl = makeLayer3Fetch({
    pagesModifiedAt: '2026-04-27T08:00:00Z',
    workerModifiedAt: '2026-04-27T06:00:00Z',
  });
  const events = await detect({ env: layer3Env(), fetchImpl, now: NOW });
  const drift = events.find((e) => e.payload?.layer === 'drift');
  assert.equal(drift, undefined);
});

test('layer3: flag on + diff > 24h → warn event', async () => {
  const fetchImpl = makeLayer3Fetch({
    pagesModifiedAt: '2026-04-27T08:00:00Z',
    workerModifiedAt: '2026-04-25T08:00:00Z',
  });
  const events = await detect({ env: layer3Env(), fetchImpl, now: NOW });
  const drift = events.find((e) => e.payload?.layer === 'drift');
  assert.ok(drift, 'Drift event should exist');
  assert.equal(drift.severity, 'warn');
  assert.match(drift.payload.summary, /drift/i);
  assert.ok(drift.payload.diff_hours);
});

test('layer3: flag on + token missing → skip silently (no crash)', async () => {
  const fetchImpl = makeLayer3Fetch({ pagesModifiedAt: 'x', workerModifiedAt: 'y' });
  const events = await detect({
    env: { AUDIT_KEY_EXPIRY_LAYER3: 'true' },
    fetchImpl, now: NOW,
  });
  const drift = events.find((e) => e.payload?.layer === 'drift');
  assert.equal(drift, undefined);
});
```

- [ ] **Step 4.2: Rodar tests, verificar FAIL**

```bash
node --test tests/auditor-key-expiry.test.mjs
```

Expected: 1 dos 4 layer3 tests passa por chance (skip case), 3 falham.

- [ ] **Step 4.3: Implementar Layer 3**

Adicionar ao `functions/_lib/auditors/key-expiry.js` (antes da função `detect`):

```js
// Layer 3: drift (opt-in) ───────────────────────────────────────────────────

const TWENTY_FOUR_HOURS_MS = 24 * 3600 * 1000;

async function fetchModifiedOn(url, headers, fetchImpl) {
  try {
    const res = await fetchImpl(url, { headers, signal: timeoutSignal(5000) });
    if (!res.ok) return null;
    const body = await res.json();
    return body?.result?.latest_deployment?.modified_on || body?.result?.modified_on || null;
  } catch {
    return null;
  }
}

async function detectLayer3(env, fetchImpl, now) {
  if (env.AUDIT_KEY_EXPIRY_LAYER3 !== 'true') return [];
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) return [];

  const projectName = env.CF_PAGES_PROJECT_NAME || 'inkflow-saas';
  const scriptName = env.CF_WORKER_SCRIPT_NAME || 'inkflow-cron';
  const headers = { Authorization: `Bearer ${token}` };

  const pagesUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`;
  const workerUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`;

  const [pagesIso, workerIso] = await Promise.all([
    fetchModifiedOn(pagesUrl, headers, fetchImpl),
    fetchModifiedOn(workerUrl, headers, fetchImpl),
  ]);

  if (!pagesIso || !workerIso) return [];

  const diffMs = Math.abs(new Date(pagesIso).getTime() - new Date(workerIso).getTime());
  if (diffMs <= TWENTY_FOUR_HOURS_MS) return [];

  const diffHours = Math.round(diffMs / 3600000);
  return [{
    severity: 'warn',
    payload: {
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: `CF Pages vs Worker drift: ${diffHours}h gap`,
      layer: 'drift',
      diff_hours: diffHours,
      pages_modified_at: pagesIso,
      worker_modified_at: workerIso,
    },
    evidence: { pages_modified_on: pagesIso, worker_modified_on: workerIso, project: projectName, script: scriptName },
  }];
}
```

E atualizar `detect`:

```js
export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  const events = [];
  events.push(...detectLayer1(env, now));
  if (fetchImpl) {
    events.push(...await detectLayer2(env, fetchImpl));
    events.push(...await detectLayer3(env, fetchImpl, now));
  }
  return events;
}
```

- [ ] **Step 4.4: Rodar tests, verificar PASS**

```bash
node --test tests/auditor-key-expiry.test.mjs
```

Expected: `# pass 17 # fail 0`.

- [ ] **Step 4.5: Commit**

```bash
git add functions/_lib/auditors/key-expiry.js tests/auditor-key-expiry.test.mjs
git commit -m "feat(auditor-key-expiry): Layer 3 (drift) opt-in via AUDIT_KEY_EXPIRY_LAYER3"
```

---

### Task 5: Endpoint `/api/cron/audit-key-expiry` — TDD

**Files:**
- Create: `functions/api/cron/audit-key-expiry.js`
- Create: `tests/audit-key-expiry-endpoint.test.mjs`

**Pattern reusado** de `audit-escalate.js` (auth + json helper + sbHeaders) + `audit-state.js` (lifecycle).

Pipeline interno:
1. Validar auth `Authorization: Bearer ${env.CRON_SECRET}`
2. Validar `env.SUPABASE_SERVICE_KEY` presente
3. `runId = await startRun(supabase, 'key-expiry')`
4. Try: `events = await detect({ env, fetchImpl: globalThis.fetch })`
5. Por evento: `currentState = await getCurrentState('key-expiry')` (1x — cache local; key-expiry só tem 1 estado aberto por dedupe), aplicar `dedupePolicy(currentState, event)`, executar ação:
   - `fire`: `insertEvent` + `sendTelegram`
   - `silent`: noop (no DB write — heartbeat fica em audit_runs)
   - `supersede`: `insertEvent` + PATCH antigo `resolved_at + resolved_reason='superseded'`
   - `resolve`: PATCH antigo `resolved_at + resolved_reason='next_run_clean'` + `sendTelegram` ([resolved])
   - `no-op`: noop
6. `endRun(runId, { status: 'success', eventsEmitted: N })`
7. Return JSON `{ ok, run_id, events_count, actions: {fire, silent, supersede, resolve, no_op} }`

**Importante:** key-expiry pode produzir múltiplos eventos por run (até 8 do layer 2 + 1 do layer 1 + 1 do layer 3 = 10). Pra simplificar dedupe sem refatorar `audit-state`: aplicar dedupe **por payload.secret_name** (chave de identidade do evento dentro do auditor). Como `getCurrentState` retorna 1 row máximo por `auditor`, e a view `audit_current_state` agrupa por auditor, **o MVP do dedupe trata todos os eventos do auditor como um único estado**. Decisão: **emitir só o evento de severity mais alta por run** (collapse). Documentado no spec §6.1 como "auditor → 1 evento aberto". Múltiplos secrets falhando virariam summary tipo "3 secrets em estado critical: CF_API_TOKEN, MP_ACCESS_TOKEN, OPENAI_API_KEY" no payload.

Trade-off: granularidade fica menor mas dedupe simples. Se 2 secrets diferentes estão críticos em runs separados → ambos colapsam num único estado aberto. Pós-MVP pode evoluir pra 1 estado por (auditor, secret_name) com migration nova. Por agora, `secret_name` vai no payload pra debug.

- [ ] **Step 5.1: Escrever integration tests**

Arquivo: `tests/audit-key-expiry-endpoint.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/cron/audit-key-expiry.js';

const baseEnv = {
  CRON_SECRET: 'test-cron-secret',
  SUPABASE_SERVICE_KEY: 'sb-key',
};

function makeRequest(authHeader = 'Bearer test-cron-secret') {
  return new Request('https://inkflowbrasil.com/api/cron/audit-key-expiry', {
    method: 'POST',
    headers: { Authorization: authHeader },
  });
}

test('endpoint: missing auth → 401', async () => {
  const res = await onRequest({ request: makeRequest('Bearer wrong'), env: baseEnv });
  assert.equal(res.status, 401);
});

test('endpoint: GET → 405', async () => {
  const req = new Request('https://inkflowbrasil.com/api/cron/audit-key-expiry', { method: 'GET' });
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
  const sbCalls = [];
  const fetchSpy = async (url, opts) => {
    sbCalls.push({ url: String(url), method: opts?.method || 'GET' });
    if (url.includes('audit_runs') && opts?.method === 'POST') {
      return { ok: true, status: 201, json: async () => [{ id: 'run-1' }] };
    }
    if (url.includes('audit_current_state')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (url.includes('audit_runs') && opts?.method === 'PATCH') {
      return { ok: true, status: 204, text: async () => '' };
    }
    return { ok: true, status: 200, json: async () => [] };
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
    CLOUDFLARE_API_TOKEN_EXPIRES_AT: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    TELEGRAM_BOT_TOKEN: 'tg-tok',
    TELEGRAM_CHAT_ID: '999',
  };
  const calls = { runs: 0, events_post: 0, telegram: 0 };
  const fetchSpy = async (url, opts) => {
    const u = String(url);
    if (u.includes('audit_runs') && opts?.method === 'POST') {
      calls.runs += 1;
      return { ok: true, status: 201, json: async () => [{ id: 'run-1' }] };
    }
    if (u.includes('audit_current_state')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (u.includes('audit_events') && opts?.method === 'POST') {
      calls.events_post += 1;
      return { ok: true, status: 201, json: async () => [{ id: 'evt-uuid-1234-5678-9abc-def012345678' }] };
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
  assert.ok(body.actions.fire >= 1);
  assert.equal(calls.events_post, 1, 'INSERT audit_events called once');
  assert.equal(calls.telegram, 1, 'sendTelegram called once');
});
```

- [ ] **Step 5.2: Rodar tests, verificar FAIL**

```bash
node --test tests/audit-key-expiry-endpoint.test.mjs
```

Expected: módulo não existe → `Cannot find module '../functions/api/cron/audit-key-expiry.js'`.

- [ ] **Step 5.3: Implementar endpoint**

Arquivo: `functions/api/cron/audit-key-expiry.js`

```js
// ── InkFlow — Cron: audit key-expiry (§5.1) ─────────────────────────────────
// Auditor #1. Cron 0 6 * * * (03:00 BRT). Detecta secrets expirando ou
// inválidos via 3 camadas (TTL, self-check, drift opt-in). Emite eventos
// via audit-state lib seguindo dedupe policy §6.2.

import { detect } from '../../_lib/auditors/key-expiry.js';
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
// alta). Outros eventos viram detalhe no payload.affected_secrets.
function collapseEvents(events) {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  const top = sorted[0];
  if (top.severity === 'clean') {
    // Run clean → não emite event aberto. Sinaliza com severity 'clean'.
    return { severity: 'clean', payload: { layer: 'aggregate', summary: 'all checks ok' }, evidence: {} };
  }
  const otherCount = sorted.length - 1;
  const allFailingNames = sorted
    .filter((e) => e.severity !== 'clean' && e.payload?.secret_name)
    .map((e) => e.payload.secret_name);
  return {
    severity: top.severity,
    payload: {
      ...top.payload,
      affected_count: sorted.filter((e) => e.severity !== 'clean').length,
      affected_secrets: allFailingNames,
      summary: otherCount > 0
        ? `${top.payload.summary} (+${otherCount} mais)`
        : top.payload.summary,
    },
    evidence: { top: top.evidence, all: sorted.map((e) => ({ severity: e.severity, secret: e.payload?.secret_name, layer: e.payload?.layer })) },
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

  // Wrap audit-state fetch calls so tests can inject fetchImpl. Real prod
  // uses globalThis.fetch (audit-state imports nothing — uses global).
  const originalFetch = globalThis.fetch;
  if (context.fetchImpl) globalThis.fetch = context.fetchImpl;

  let runId;
  const actions = { fire: 0, silent: 0, supersede: 0, resolve: 0, no_op: 0 };
  let collapsed = null;
  try {
    runId = await startRun(supabase, 'key-expiry');

    const rawEvents = await detect({ env, fetchImpl, now: Date.now() });
    collapsed = collapseEvents(rawEvents);

    if (collapsed) {
      const current = await getCurrentState(supabase, 'key-expiry');
      const action = dedupePolicy(current, collapsed);
      actions[action.replace('-', '_')] = (actions[action.replace('-', '_')] || 0) + 1;

      if (action === 'fire' || action === 'supersede') {
        const inserted = await insertEvent(supabase, {
          run_id: runId,
          auditor: 'key-expiry',
          severity: collapsed.severity,
          payload: collapsed.payload,
          evidence: collapsed.evidence,
          suggested_subagent: 'deploy-engineer',
        });
        await sendTelegram(env, inserted);

        if (action === 'supersede' && current) {
          await fetchImpl(`${SUPABASE_URL}/rest/v1/audit_events?id=eq.${current.id}`, {
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
        await fetchImpl(`${SUPABASE_URL}/rest/v1/audit_events?id=eq.${current.id}`, {
          method: 'PATCH',
          headers: sbHeaders,
          body: JSON.stringify({
            resolved_at: new Date().toISOString(),
            resolved_reason: 'next_run_clean',
          }),
          signal: timeoutSignal(5000),
        });
        await sendTelegram(env, {
          id: current.id,
          severity: 'resolved',
          auditor: 'key-expiry',
          payload: { runbook_path: 'docs/canonical/runbooks/secrets-expired.md', summary: 'key-expiry: resolved (next run clean)' },
          evidence: {},
        });
      }
      // 'silent' e 'no-op' → nada.
    }

    await endRun(supabase, runId, {
      status: 'success',
      eventsEmitted: actions.fire + actions.supersede,
    });
    return json({ ok: true, run_id: runId, events_count: collapsed ? 1 : 0, actions });
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

- [ ] **Step 5.4: Rodar tests, verificar PASS**

```bash
node --test tests/audit-key-expiry-endpoint.test.mjs
```

Expected: `# pass 5 # fail 0`.

- [ ] **Step 5.5: Rodar TODOS os tests do auditor (regression check)**

```bash
node --test tests/auditor-key-expiry.test.mjs tests/audit-key-expiry-endpoint.test.mjs tests/audit-state.test.mjs
```

Expected: `# pass 38+ # fail 0` (17 unit + 5 integration + 21 lib existente — totalizam pelo menos 43, ajuste conforme execução real).

- [ ] **Step 5.6: Commit**

```bash
git add functions/api/cron/audit-key-expiry.js tests/audit-key-expiry-endpoint.test.mjs
git commit -m "feat(auditor-key-expiry): endpoint /api/cron/audit-key-expiry com dedupe"
```

---

### Task 6: Registrar cron no dispatcher + deploy

**Files:**
- Modify: `cron-worker/src/index.js:18-25` (SCHEDULE_MAP)
- Modify: `cron-worker/wrangler.toml:9-15` (triggers)

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
]
```

- [ ] **Step 6.3: Deploy do cron-worker**

```bash
cd cron-worker && npx wrangler deploy
```

Expected output: `✨ Success! ... Triggers: ... 7 cron(s)`. Confirma que os 7 triggers (incluindo o novo) foram registrados.

- [ ] **Step 6.4: Push da branch + trigger Pages deploy**

```bash
cd ..
git add cron-worker/src/index.js cron-worker/wrangler.toml
git commit -m "feat(cron-worker): trigger 0 6 * * * → audit-key-expiry"
git push -u origin feat/auditor-key-expiry
```

GHA deploy.yml dispara em push. Acompanhar:

```bash
gh run list --workflow="deploy.yml" --limit 1
gh run watch
```

Expected: deploy ✅ em ~30s. Endpoint `/api/cron/audit-key-expiry` deve responder 401 (falta auth) em curl test:

```bash
curl -i -X POST https://inkflowbrasil.com/api/cron/audit-key-expiry
# HTTP/2 401
```

---

### Task 7: Smoke test em prod (E2E)

**Files:**
- Create: `evals/sub-projeto-3/2026-04-27-auditor-key-expiry-smoke.md` (doc do smoke)

Pré-requisito: branch deployada (Task 6).

**Smoke real (sem mock):** trigger via cron-worker fetch handler — disparar manualmente o cron simulando o schedule. Sem injetar fixture pra `CLOUDFLARE_API_TOKEN_EXPIRES_AT`, nenhum evento deve ser emitido (todos os secrets atuais válidos). Pra forçar critical, inserir `CLOUDFLARE_API_TOKEN_EXPIRES_AT` apontando pro dia seguinte temporariamente.

- [ ] **Step 7.1: Smoke 1 — trigger sem TTL configurado (no event esperado)**

```bash
# Pega CRON_SECRET do Bitwarden (ou pede pro Leandro colar)
read -s "CRON_SECRET?Cole CRON_SECRET: "
echo

curl -X POST "https://inkflow-cron.workers.dev/?cron=0+6+*+*+*" \
  -H "Authorization: Bearer $CRON_SECRET" \
  | jq .
```

Expected JSON: `{ "ok": true, "label": "audit-key-expiry", "elapsedMs": <num>, "response": "{\"ok\":true,\"run_id\":\"<uuid>\",\"events_count\":0,\"actions\":{...}}" }`

Validar via Supabase MCP:

```sql
SELECT * FROM audit_runs WHERE auditor='key-expiry' ORDER BY started_at DESC LIMIT 1;
-- status='success', completed_at preenchido, events_emitted=0
```

- [ ] **Step 7.2: Smoke 2 — disparar critical real (TTL expirado)**

Trabalho de uma transação atômica:
1. Set CF Pages env `CLOUDFLARE_API_TOKEN_EXPIRES_AT` → ontem
2. Empty commit + push (força redeploy pra Pages picking up env nova — bug B do PR #10)
3. Trigger cron manual
4. Validar event criado + Telegram chegou

```bash
# Set env via CF dashboard ou wrangler:
echo "$(date -u -v-1d +%Y-%m-%dT%H:%M:%SZ)" | npx wrangler pages secret put CLOUDFLARE_API_TOKEN_EXPIRES_AT --project-name inkflow-saas

# Empty commit pra forçar Pages redeploy (bug B documentado)
git commit --allow-empty -m "chore: trigger CF Pages redeploy after env update"
git push

# Aguarda deploy (~30s)
sleep 35

# Trigger manual
curl -X POST "https://inkflow-cron.workers.dev/?cron=0+6+*+*+*" \
  -H "Authorization: Bearer $CRON_SECRET" | jq .
```

Expected `actions.fire = 1`. Telegram bot deve receber:

```
[critical] [key-expiry] CLOUDFLARE_API_TOKEN expira em -1d
ID: <8chars> | Runbook: secrets-expired.md
Suggested: @deploy-engineer
Evidence: {"source":"env.CLOUDFLARE_API_TOKEN_EXPIRES_AT",...}
Reply "ack <8chars>" pra acknowledge.
```

- [ ] **Step 7.3: Validar ack flow**

No Telegram, reply: `ack <8chars>`. Bot responde: `✅ Acknowledged: key-expiry critical`.

Validar no DB:

```sql
SELECT id, severity, acknowledged_at, acknowledged_by
FROM audit_events
WHERE auditor='key-expiry' AND resolved_at IS NULL
ORDER BY detected_at DESC LIMIT 1;
-- acknowledged_at preenchido, acknowledged_by = TELEGRAM_ADMIN_USER_ID
```

- [ ] **Step 7.4: Cleanup (remover env de teste + verificar resolve)**

```bash
# Delete env var de teste
npx wrangler pages secret delete CLOUDFLARE_API_TOKEN_EXPIRES_AT --project-name inkflow-saas

# Empty commit pra redeploy
git commit --allow-empty -m "chore: cleanup test env after key-expiry smoke"
git push

# Aguarda deploy
sleep 35

# Trigger novo run (sem TTL → next run clean → resolve)
curl -X POST "https://inkflow-cron.workers.dev/?cron=0+6+*+*+*" \
  -H "Authorization: Bearer $CRON_SECRET" | jq .
```

Expected `actions.resolve = 1`. Telegram bot deve receber `[resolved] [key-expiry] ...`.

Validar no DB:

```sql
SELECT id, severity, resolved_at, resolved_reason
FROM audit_events WHERE auditor='key-expiry'
ORDER BY detected_at DESC LIMIT 1;
-- resolved_at preenchido, resolved_reason='next_run_clean'
```

- [ ] **Step 7.5: Documentar smoke**

Criar `evals/sub-projeto-3/2026-04-27-auditor-key-expiry-smoke.md` com:
- 4 smokes executados (trigger sem TTL / trigger com critical / ack flow / resolve)
- Output de cada curl
- Screenshot opcional do Telegram (anexar como `_assets/`)
- Bugs encontrados (se houver)
- Status final: PASS / PARTIAL / FAIL

Estrutura mínima do doc:

```markdown
# Smoke E2E — Auditor #1 key-expiry

**Data:** 2026-04-XX
**Branch:** feat/auditor-key-expiry
**Spec:** docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §5.1
**Plano:** docs/superpowers/plans/2026-04-27-auditor-key-expiry.md

## Smoke 1 — Trigger sem TTL (no event)
- Cron triggered manualmente via `curl POST .../?cron=0+6+*+*+*`
- Response: `{ ok: true, events_count: 0, actions: { no_op: 1 } }`
- audit_runs row criada: status='success', events_emitted=0
- Status: ✅ PASS

## Smoke 2 — Critical real (TTL expirado)
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
git add evals/sub-projeto-3/2026-04-27-auditor-key-expiry-smoke.md
git commit -m "test(auditor-key-expiry): smoke E2E PASS — 4 cenários (no-event, critical, ack, resolve)"
```

---

### Task 8: Cross-references (docs canônicos)

**Files:**
- Create: `docs/canonical/auditores.md`
- Modify: `.claude/agents/README.md` (seção Mapping auditor → agent)
- Modify: `docs/canonical/methodology/incident-response.md` (§6.3 cross-link)

- [ ] **Step 8.1: Criar `docs/canonical/auditores.md`**

```markdown
# Auditores InkFlow

Spec: [2026-04-27-auditores-mvp-design.md](../superpowers/specs/2026-04-27-auditores-mvp-design.md)

Lista canônica dos auditores em prod. Cada entry: frequência, source de dados, política de severity, runbook, suggested_subagent.

## key-expiry

**Status:** ✅ Em produção (2026-04-XX)
**Onde:** `inkflow-cron` Worker
**Frequência:** Diário 03:00 BRT (cron `0 6 * * *`)
**Endpoint:** `functions/api/cron/audit-key-expiry.js`
**Lib `detect()`:** `functions/_lib/auditors/key-expiry.js`
**Tests:** `tests/auditor-key-expiry.test.mjs` + `tests/audit-key-expiry-endpoint.test.mjs`
**Runbook:** [secrets-expired.md](runbooks/secrets-expired.md)
**Suggested subagent:** `deploy-engineer`

### Detecção em 3 camadas

| Layer | Source | Severity rules |
|---|---|---|
| 1 (TTL) | env `CLOUDFLARE_API_TOKEN_EXPIRES_AT` | >14d clean / 7-14d warn / 1-6d critical / ≤0 critical |
| 2 (self-check) | API call em 8 secrets | 401/403 critical / network warn / 200 clean |
| 3 (drift) | CF Pages.modified_on vs Worker.modified_on | opt-in via `AUDIT_KEY_EXPIRY_LAYER3=true`. \|diff\| > 24h → warn |

### Secrets cobertos (Layer 2)

`CLOUDFLARE_API_TOKEN`, `CF_API_TOKEN`, `MP_ACCESS_TOKEN`, `TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY`, `PUSHOVER_APP_TOKEN`, `SUPABASE_SERVICE_KEY`, `EVO_GLOBAL_KEY`.

### Dedupe

Single-state per auditor (collapse). Se múltiplos secrets falham num mesmo run, evento top-severity é emitido com `payload.affected_secrets` listando todos. Trade-off pós-MVP: granularidade fina por secret requer migration.

### Runbook trigger

Quando alerta `[critical] [key-expiry]` chegar no Telegram, seguir [secrets-expired.md](runbooks/secrets-expired.md) — Ação A (rotação tradicional) ou Ação B (Roll permissions ruins).

---

## (Próximos) deploy-health, billing-flow, vps-limits, rls-drift

Pendentes — ver spec §5 e plano-mestre Fábrica `2026-04-25-fabrica-inkflow-design.md` §3.
```

- [ ] **Step 8.2: Atualizar `.claude/agents/README.md`**

Localizar seção "Mapping auditor → agent" (criada no PR #9). Adicionar entry:

```markdown
## Mapping auditor → agent

| Auditor | Suggested subagent | Doctrine reason |
|---|---|---|
| `key-expiry` | `deploy-engineer` | Secrets vivem em CF Pages env; rotação envolve `wrangler` + GHA Secrets. Domain match. |
```

(Se a seção já tem outras entries, adicionar `key-expiry` na primeira linha. Se não existir, criar a seção.)

- [ ] **Step 8.3: Atualizar `incident-response.md` §6.3**

Localizar §6.3 do `docs/canonical/methodology/incident-response.md` e adicionar referência:

```markdown
### Auditores em prod (cross-ref)

Auditores que detectam sintomas mapeados em §6.3:

- **key-expiry** (2026-04-XX): detecta secrets expirando ou inválidos via TTL/self-check/drift. Alerta `[critical] [key-expiry]` → seguir [secrets-expired.md](../runbooks/secrets-expired.md). Doc canônico: [auditores.md#key-expiry](../auditores.md#key-expiry).
```

- [ ] **Step 8.4: Commit docs**

```bash
git add docs/canonical/auditores.md .claude/agents/README.md docs/canonical/methodology/incident-response.md
git commit -m "docs(auditor-key-expiry): canonical doc + agent mapping + incident-response cross-link"
```

---

### Task 9: PR + merge

- [ ] **Step 9.1: Verificar status final**

```bash
git log --oneline main..HEAD
# Deve listar 8 commits (Task 1-8 cada gerou ≥1 commit)

node --test tests/auditor-key-expiry.test.mjs tests/audit-key-expiry-endpoint.test.mjs tests/audit-state.test.mjs tests/audit-cleanup.test.mjs tests/audit-escalate.test.mjs tests/audit-telegram-webhook.test.mjs
# Tudo PASS
```

- [ ] **Step 9.2: Push final + abrir PR**

```bash
git push
gh pr create --title "feat: Sub-projeto 3 §9.1 — Auditor #1 key-expiry" --body "$(cat <<'EOF'
## Summary

Implementa o primeiro auditor real do Sub-projeto 3 — `key-expiry` — seguindo spec v1.1 §5.1 + plano `docs/superpowers/plans/2026-04-27-auditor-key-expiry.md`.

- **3 camadas de detecção** — TTL (CLOUDFLARE_API_TOKEN via env date), self-check (8 secrets via API call, 401 = critical), drift (opt-in via `AUDIT_KEY_EXPIRY_LAYER3`)
- **Endpoint** `/api/cron/audit-key-expiry` orquestra detect → dedupePolicy → fire/silent/supersede/resolve via lib `audit-state` (já em prod desde PR #10)
- **Cron** `0 6 * * *` registrado no `inkflow-cron` dispatcher
- **Smoke E2E PASS** — `evals/sub-projeto-3/2026-04-27-auditor-key-expiry-smoke.md`
- **Docs canônicos** — `docs/canonical/auditores.md` (NEW) + cross-links em `incident-response.md` + `.claude/agents/README.md`

Dependência §9.0 Infra: PR #10 (commit `0de4e03`) — em prod.

## Test plan

- [ ] CI deploy GHA passes
- [ ] Cron registrado em CF Workers (7 triggers totais)
- [ ] Smoke 1 — trigger sem TTL → events_count=0
- [ ] Smoke 2 — TTL expirado → critical no Telegram
- [ ] Smoke 3 — ack flow fecha (`acknowledged_at` preenchido)
- [ ] Smoke 4 — resolve (`resolved_at` preenchido após next clean run)
- [ ] 48h em prod sem falsa-positiva (gate pós-merge, monitor passive)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 9.3: Squash merge ou merge commit?**

Decisão: **merge commit** (preserva 8 commits granulares como no PR #10). Doctrine cravada no Sub-projeto 5: PRs canonical preservam história granular.

```bash
gh pr merge --merge --delete-branch
```

(Antes: confirmar GHA verde + nenhum review pendente.)

- [ ] **Step 9.4: Pós-merge — Atualizar Painel + vault**

Manualmente atualizar `~/.claude/projects/-*/memory/InkFlow — Painel.md`:
- Estado anterior agora é "Sub-projeto 3 §9.0 + §9.1 (key-expiry) em prod"
- Próxima sessão sugerida: Auditor #2 `deploy-health` (§9.2)

Atualizar `~/.claude/projects/-*/memory/InkFlow — Pendências (backlog).md`:
- Sub-projeto 3 progresso: 1/5 auditores done

Criar nota-âncora vault `~/.claude/projects/-*/memory/InkFlow — Auditor key-expiry (2026-04-XX).md` linkando spec + plano + smoke doc.

---

## Self-review

Revisão executada inline conforme skill writing-plans:

**1. Spec coverage:**
- §5.1 detecção 3 camadas → Task 2/3/4 ✅
- §5.1 payload format (`runbook_path`, `suggested_subagent`, `secret_name`, `layer`, `days_until_expiry`) → Task 2 + 5 ✅
- §6.1-6.2 dedupe via lib existente → Task 5 ✅
- §6.3 Telegram format via `sendTelegram` da lib → Task 5 (delegado) ✅
- §6.4 ack flow → endpoint webhook já em prod (PR #10), validado em Task 7.3 ✅
- §6.5 escalation → cron já em prod (PR #10), key-expiry herda ✅
- §9.1 ordem (detect → endpoint → cron → smoke → 48h) → Tasks 1-9 ✅
- §10 DoD por auditor:
  - `detect()` pura com 3+ fixtures → Task 2/3/4 ✅
  - Unit tests passando → Task 5.5 ✅
  - Smoke test E2E (trigger → Telegram → ack → resolve) → Task 7 ✅
  - Heartbeat audit_runs → Task 5 (startRun/endRun) ✅
  - Payload `runbook_path` válido → Task 2 (`secrets-expired.md` — confirmado em pre-flight) ✅
  - Payload `suggested_subagent` → Task 2 (`deploy-engineer`) ✅
  - Cross-ref `.claude/agents/README.md` → Task 8.2 ✅
  - Doc canonical entry → Task 8.1 ✅
  - 48h em prod sem falsa-positiva → gate passive pós-merge (registrado em Task 9 test plan) ✅

**2. Placeholder scan:** zero TBD/TODO/"add error handling"/"similar to Task N". Cada step tem código real ou comando exato.

**3. Type consistency:**
- `detect({ env, fetchImpl, now })` — assinatura mantida em Tasks 1, 2, 3, 4, 5
- `dedupePolicy(current, next)` — usa nome real da lib `audit-state.js`
- `startRun(supabase, auditor)` / `endRun(supabase, runId, { status, eventsEmitted, errorMessage })` — nomes idênticos aos da lib
- `insertEvent(supabase, evt)` — assinatura idêntica
- `payload.layer` — string literal `'ttl'` / `'self-check'` / `'drift'` / `'aggregate'` consistente

**4. Risk markers:**
- ⚠️ **Layer 1 data source** — env var `CLOUDFLARE_API_TOKEN_EXPIRES_AT` precisa ser populada manualmente. Se não populada, layer 1 fica permanentemente skip. Documentar em `secrets-expired.md` próxima rotação (mas fora do escopo deste plano).
- ⚠️ **Bug B do PR #10** — CF Pages env edit não dispara redeploy. Smoke 2 (Task 7.2) exige empty commit + push pra Pages picking up env. Workaround documentado.
- ⚠️ **Smoke 2 efeito colateral** — populá `CLOUDFLARE_API_TOKEN_EXPIRES_AT` em prod temporariamente pode confundir auditor real se rodar em janela de teste. Cleanup em Task 7.4 deleta env. Risco mitigado se executar Tasks 7.2 + 7.4 sequencialmente em <10min.
- ⚠️ **Pushover validate** — `validate.json` consome 1 chamada do quota. Quota grátis = 10k/mês. 1 chamada/dia = 30/mês. Negligível.
- ⚠️ **Collapse single-state** — múltiplos secrets críticos colapsam em 1 evento. Founder vê só o top severity no Telegram, mas `payload.affected_secrets` lista todos. Documentar comportamento em `auditores.md` (Task 8.1) ✅.

**5. Independent task validation:** cada Task termina em commit. Tasks 1-5 podem ser executadas localmente sem deploy. Task 6+ requer prod. Task 7 requer interação humana (reply no Telegram). Tasks 8-9 são docs/PR — independentes do código.

**Ajustes inline aplicados:** nenhum. Plano pronto pra execução.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-27-auditor-key-expiry.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch fresh subagent per task + 2-stage review (spec-compliance + code-quality reviewers entre tasks). Fast iteration, principal supervises. Pattern usado no PR #10 (Sub-projeto 3 Infra) — funcionou bem.

**2. Inline Execution** — Executar tasks na sessão atual via `superpowers:executing-plans`. Mais rápido se o plano é simples (este é médio — 9 tasks, mas TDD strict). Checkpoints automáticos.

**Qual abordagem?**

Recomendação minha: **Subagent-Driven**. Tasks 1-5 são puro TDD (mecânico, perfeito pra subagent), Tasks 6-7 envolvem deploy + interação humana (principal coordena), Tasks 8-9 são docs (subagent ou principal, qualquer um). 2-stage review pega bugs antes de commit como aconteceu no PR #10.
