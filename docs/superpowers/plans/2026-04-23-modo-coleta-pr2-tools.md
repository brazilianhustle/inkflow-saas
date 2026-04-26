# Modo Coleta — PR 2 enxuto (só tools novas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar as 2 tools HTTP novas (`dados_coletados` e `detectar-trigger`) + coluna SQL `conversas.valor_fechado` que o modo Coleta precisa — sem tocar prompts ainda. Entrega-morta-por-feature-flag: nada novo é exercitado em produção porque o modo Coleta segue barrado por `ENABLE_COLETA_MODE` OFF.

**Architecture:** Duas Cloudflare Pages Functions que seguem o padrão `withTool` já usado pelas 7 tools existentes. `dados_coletados` faz merge em `conversas.dados_coletados` (JSONB). `detectar-trigger` roda regex contra o trigger-phrase do tenant quando mensagem vem do tatuador (a detecção é orquestrada pelo n8n), e quando match, transiciona `estado_agente='agendamento'` + grava `valor_fechado`. Nova coluna `conversas.valor_fechado NUMERIC` complementa `estado_agente` criado no PR 1.

**Tech Stack:** JavaScript ES modules (Node 20+), Cloudflare Pages Functions, Supabase Postgres (via MCP), `node --test` + `node:assert/strict`. Sem npm.

---

## Pre-conditions

- PR #2 (refactor-only) está aberto em <https://github.com/brazilianhustle/inkflow-saas/pull/2> — pode ou não estar mergeado.
- **Se PR #2 não mergeado:** branch parent é `feat/modo-coleta-pr1-refactor`. Crie `feat/modo-coleta-pr2-tools` a partir dela. Após merge do PR #2, rebase em main.
- **Se PR #2 já mergeado:** branch parent é `main`. Crie `feat/modo-coleta-pr2-tools` direto.
- DB tem `conversas.estado_agente TEXT DEFAULT 'ativo'` e `tenants.fewshots_por_modo JSONB` (aplicado via MCP em 2026-04-22).
- 42 testes existentes verdes (`node --test tests/`).

## Setup (uma vez)

- [ ] **Step A: Verificar branch base e criar feature branch**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git fetch origin
# Checar estado do PR #2 — se mergeado, base=main; senão, base=feat/modo-coleta-pr1-refactor
gh pr view 2 --json state,mergedAt 2>&1
```

Se `"state":"MERGED"`:
```bash
git checkout main
git pull origin main
git checkout -b feat/modo-coleta-pr2-tools
```

Se `"state":"OPEN"`:
```bash
git checkout feat/modo-coleta-pr1-refactor
git pull origin feat/modo-coleta-pr1-refactor
git checkout -b feat/modo-coleta-pr2-tools
```

- [ ] **Step B: Garantir hooks path ativo**

```bash
git config core.hooksPath .githooks
```

---

## File Structure

**Novos arquivos:**

```
migrations/
└── 2026-04-23-conversas-valor-fechado.sql   ← coluna nova

functions/api/tools/
├── dados-coletados.js                        ← tool nova (merge em conversa.dados_coletados)
└── detectar-trigger.js                       ← tool nova (regex + update estado_agente)

tests/
├── dados-coletados.test.mjs                  ← 12 unit tests
└── detectar-trigger.test.mjs                 ← 18 unit tests (regex edge cases)
```

**Sem modificações** em prompts, validadores, ou workflow CI/hook. A hook e o CI já cobrem `tests/**/*.test.mjs` via `find`; só precisamos que os novos arquivos respeitem essa convenção de nome.

---

## Task 1: Migração SQL — coluna `conversas.valor_fechado`

**Files:**
- Create: `migrations/2026-04-23-conversas-valor-fechado.sql`
- Apply via Supabase MCP

> **Por que dedicated column em vez de dentro de `dados_coletados` JSONB:** `valor_fechado` é queryable, numérico, e vai alimentar relatórios/dashboards depois. Manter como coluna separada é mais limpo do que enterrar em JSONB. Cost: um `ALTER TABLE` a mais. Benefit: type safety, indices futuros, queries simples.

- [ ] **Step 1: Criar arquivo SQL**

Conteúdo de `migrations/2026-04-23-conversas-valor-fechado.sql`:

```sql
-- Migration: 2026-04-23 Modo Coleta — conversas.valor_fechado
-- Modo Coleta-Reentrada: tatuador declara valor via trigger-phrase; agente reentra
-- pra agendar + cobrar sinal usando este campo como source of truth.
-- Faixa/Exato ignoram essa coluna.

ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS valor_fechado NUMERIC(10, 2);
```

- [ ] **Step 2: Apresentar ao user e aplicar via MCP**

Antes de rodar, apresente:

> "Vou aplicar `ALTER TABLE conversas ADD COLUMN IF NOT EXISTS valor_fechado NUMERIC(10, 2)` no Supabase prod via MCP. Idempotente, nullable (zero breaking), usada só pelo modo Coleta. OK?"

Se aprovado, chamar `mcp__plugin_supabase_supabase__apply_migration`:
- `project_id`: `bfzuxxuscyplfoimvomh`
- `name`: `2026_04_23_conversas_valor_fechado`
- `query`: o ALTER TABLE acima

- [ ] **Step 3: Verificar coluna aplicada**

Via MCP `execute_sql`:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'conversas' AND column_name = 'valor_fechado';
```

Expected: 1 linha (`valor_fechado | numeric | YES`).

- [ ] **Step 4: Commit arquivo**

```bash
git add migrations/2026-04-23-conversas-valor-fechado.sql
git commit -m "$(cat <<'EOF'
feat(db): adiciona conversas.valor_fechado (modo Coleta-Reentrada)

Coluna nova, nullable, default NULL — zero breaking change. Usada só pelo
prompt coleta/agendamento como source of truth do valor fechado pelo tatuador
via trigger-phrase. Aplicada em prod via MCP.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Tool `dados_coletados`

**Files:**
- Create: `functions/api/tools/dados-coletados.js`
- Create: `tests/dados-coletados.test.mjs`

**Purpose:** Expor uma tool HTTP que o LLM agente chama pra persistir info incrementalmente em `conversa.dados_coletados` JSONB. Hoje outras tools (`acionar-handoff`, `reservar-horario`) fazem merge ad-hoc; o modo Coleta-Info precisa de uma tool dedicada pro agente gravar `descricao_tattoo`, `tamanho_cm`, `local_corpo` conforme cliente responde.

**API:**
- POST `/api/tools/dados-coletados`
- Headers: `X-Inkflow-Tool-Secret`
- Body: `{ tenant_id, telefone, campo, valor }`
- Response: `{ ok: true, conversa_id, campos_coletados: {...} }` ou `{ ok: false, error }`

**Semantics:**
- Se conversa não existe pra `(tenant_id, telefone)` → cria com `dados_coletados = { [campo]: valor }`
- Se existe → PATCH merge: `dados_coletados = { ...existing, [campo]: valor }`
- `campo` deve ser string non-empty (alphanumeric + underscore)
- `valor` aceita qualquer JSON serializable (string, number, boolean, array, object)

### Step-by-step (TDD)

- [ ] **Step 1: Criar `tests/dados-coletados.test.mjs` com os 12 unit tests**

Nota: `withTool` wrapper é async e chama `fetch()` (Supabase). Nos testes, stubamos `globalThis.fetch` retornando respostas Supabase simuladas, como já é feito em `tests/telegram.test.mjs`. Importamos diretamente a função `handler` interna via um export nomeado (não só o wrapper `onRequest`), pra testar a lógica sem reconstruir Request/Response.

Conteúdo completo:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Tool exporta `handler` (puro) além do `onRequest` (wrapped).
// Facilita test sem simular Request/Response.
import { handler } from '../functions/api/tools/dados-coletados.js';

function makeSupabaseStub(responses) {
  // responses: array de { match: RegExp, body: any, status?: number }
  // Retorna (url, opts) => Response simulada conforme regex match.
  return async (url, opts = {}) => {
    for (const r of responses) {
      if (r.match.test(url)) {
        return {
          ok: (r.status ?? 200) < 400,
          status: r.status ?? 200,
          json: async () => r.body,
          text: async () => JSON.stringify(r.body),
        };
      }
    }
    throw new Error(`Unmocked URL: ${url}`);
  };
}

const envStub = { SUPABASE_SERVICE_ROLE_KEY: 'test-key' };

test('rejeita sem tenant_id', async () => {
  const res = await handler({ env: envStub, input: { telefone: '5511999', campo: 'tamanho_cm', valor: 10 } });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /tenant_id/);
});

test('rejeita sem telefone', async () => {
  const res = await handler({ env: envStub, input: { tenant_id: 't1', campo: 'tamanho_cm', valor: 10 } });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /telefone/);
});

test('rejeita sem campo', async () => {
  const res = await handler({ env: envStub, input: { tenant_id: 't1', telefone: '5511', valor: 10 } });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /campo/);
});

test('rejeita campo inválido (não alphanumérico + underscore)', async () => {
  const res = await handler({ env: envStub, input: { tenant_id: 't1', telefone: '5511', campo: 'tamanho cm', valor: 10 } });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /campo inválido/i);
});

test('rejeita campo vazio', async () => {
  const res = await handler({ env: envStub, input: { tenant_id: 't1', telefone: '5511', campo: '', valor: 10 } });
  assert.equal(res.status, 400);
});

test('aceita valor=undefined como null (deleção implícita)', async () => {
  globalThis.fetch = makeSupabaseStub([
    { match: /\/conversas\?tenant_id=.*select/, body: [{ id: 'c1', dados_coletados: { antigo: 1 } }] },
    { match: /\/conversas\?id=eq/, body: null, status: 204 },
  ]);
  const res = await handler({ env: envStub, input: { tenant_id: 't1', telefone: '5511', campo: 'antigo', valor: null } });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.campos_coletados.antigo, null);
});

test('cria conversa quando não existe', async () => {
  let insertCapturedBody = null;
  globalThis.fetch = makeSupabaseStub([
    { match: /\/conversas\?tenant_id=.*select/, body: [] },
    {
      match: /\/conversas$/, body: [{ id: 'c-new', dados_coletados: { tamanho_cm: 10 } }],
    },
  ]);
  // Wrap fetch pra capturar body do POST
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (/\/conversas$/.test(url) && opts?.method === 'POST') {
      insertCapturedBody = JSON.parse(opts.body);
    }
    return originalFetch(url, opts);
  };
  const res = await handler({ env: envStub, input: { tenant_id: 't1', telefone: '5511', campo: 'tamanho_cm', valor: 10 } });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.conversa_id, 'c-new');
  assert.equal(res.body.campos_coletados.tamanho_cm, 10);
  assert.ok(insertCapturedBody, 'POST body deveria ter sido capturado');
  assert.equal(insertCapturedBody.tenant_id, 't1');
  assert.deepEqual(insertCapturedBody.dados_coletados, { tamanho_cm: 10 });
});

test('faz merge preservando campos existentes', async () => {
  let patchCapturedBody = null;
  globalThis.fetch = async (url, opts = {}) => {
    if (/\/conversas\?tenant_id=.*select/.test(url)) {
      return { ok: true, status: 200, json: async () => [{ id: 'c1', dados_coletados: { local_corpo: 'antebraco', tema: 'rosa' } }] };
    }
    if (/\/conversas\?id=eq/.test(url) && opts.method === 'PATCH') {
      patchCapturedBody = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => [{ id: 'c1' }] };
    }
    throw new Error(`Unmocked: ${url}`);
  };
  const res = await handler({ env: envStub, input: { tenant_id: 't1', telefone: '5511', campo: 'tamanho_cm', valor: 15 } });
  assert.equal(res.body.ok, true);
  assert.deepEqual(patchCapturedBody.dados_coletados, { local_corpo: 'antebraco', tema: 'rosa', tamanho_cm: 15 });
  assert.equal(res.body.campos_coletados.local_corpo, 'antebraco');
  assert.equal(res.body.campos_coletados.tamanho_cm, 15);
});

test('sobrescreve campo existente', async () => {
  let patchBody = null;
  globalThis.fetch = async (url, opts = {}) => {
    if (/select/.test(url)) return { ok: true, status: 200, json: async () => [{ id: 'c1', dados_coletados: { tamanho_cm: 10 } }] };
    if (opts.method === 'PATCH') { patchBody = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => [{ id: 'c1' }] }; }
    throw new Error('unmocked');
  };
  const res = await handler({ env: envStub, input: { tenant_id: 't1', telefone: '5511', campo: 'tamanho_cm', valor: 20 } });
  assert.equal(res.body.ok, true);
  assert.equal(patchBody.dados_coletados.tamanho_cm, 20);
});

test('aceita valor array/objeto', async () => {
  let patchBody = null;
  globalThis.fetch = async (url, opts = {}) => {
    if (/select/.test(url)) return { ok: true, status: 200, json: async () => [{ id: 'c1', dados_coletados: {} }] };
    if (opts.method === 'PATCH') { patchBody = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => [{ id: 'c1' }] }; }
    throw new Error('unmocked');
  };
  await handler({ env: envStub, input: { tenant_id: 't1', telefone: '5511', campo: 'refs_imagens', valor: ['url1', 'url2'] } });
  assert.deepEqual(patchBody.dados_coletados.refs_imagens, ['url1', 'url2']);
});

test('retorna 500 se Supabase falhar no select', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'boom' });
  const res = await handler({ env: envStub, input: { tenant_id: 't1', telefone: '5511', campo: 'x', valor: 1 } });
  assert.equal(res.status, 500);
  assert.match(res.body.error, /db-error/);
});

test('retorna 500 se PATCH falhar', async () => {
  globalThis.fetch = async (url, opts = {}) => {
    if (/select/.test(url)) return { ok: true, status: 200, json: async () => [{ id: 'c1', dados_coletados: {} }] };
    return { ok: false, status: 500, json: async () => ({}), text: async () => 'boom' };
  };
  const res = await handler({ env: envStub, input: { tenant_id: 't1', telefone: '5511', campo: 'x', valor: 1 } });
  assert.equal(res.status, 500);
});
```

- [ ] **Step 2: Rodar testes — devem falhar (tool ainda não existe)**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
node --test tests/dados-coletados.test.mjs
```

Expected: `Cannot find module` (arquivo da tool ainda não existe).

- [ ] **Step 3: Criar `functions/api/tools/dados-coletados.js`**

```javascript
// ── Tool — dados_coletados ─────────────────────────────────────────────────
// POST /api/tools/dados-coletados
// Headers: X-Inkflow-Tool-Secret
// Body: { tenant_id, telefone, campo, valor }
//
// Faz merge incremental em conversa.dados_coletados. Se conversa não existe
// pra (tenant_id, telefone), cria. Usada pelo prompt coleta/info durante a
// coleta de descricao_tattoo, tamanho_cm, local_corpo etc.

import { withTool, supaFetch } from './_tool-helpers.js';

// Campo deve ser alphanumeric + underscore, 1-50 chars. Evita injection
// em jsonb_set path e facilita queries futuras.
const CAMPO_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,49}$/;

export async function handler({ env, input }) {
  const { tenant_id, telefone, campo, valor } = input || {};
  if (!tenant_id) return { status: 400, body: { ok: false, error: 'tenant_id obrigatório' } };
  if (!telefone) return { status: 400, body: { ok: false, error: 'telefone obrigatório' } };
  if (!campo || typeof campo !== 'string') return { status: 400, body: { ok: false, error: 'campo obrigatório' } };
  if (!CAMPO_RE.test(campo)) return { status: 400, body: { ok: false, error: 'campo inválido (use snake_case sem espaços/acentos)' } };

  // Normalização: undefined vira null (tratado como "apagar campo" logicamente,
  // mas mantido no JSONB como null pra ficar queryable).
  const valorNorm = valor === undefined ? null : valor;

  const selRes = await supaFetch(
    env,
    `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}&select=id,dados_coletados`
  );
  if (!selRes.ok) return { status: 500, body: { ok: false, error: 'db-error', detail: `select-${selRes.status}` } };
  const rows = await selRes.json();

  if (Array.isArray(rows) && rows.length > 0) {
    const { id, dados_coletados: atuais } = rows[0];
    const merged = { ...(atuais || {}), [campo]: valorNorm };
    const updRes = await supaFetch(
      env,
      `/rest/v1/conversas?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          dados_coletados: merged,
          updated_at: new Date().toISOString(),
        }),
      }
    );
    if (!updRes.ok) return { status: 500, body: { ok: false, error: 'db-error', detail: `patch-${updRes.status}` } };
    return { status: 200, body: { ok: true, conversa_id: id, campos_coletados: merged } };
  }

  // Não existe — cria.
  const insRes = await supaFetch(env, '/rest/v1/conversas', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      tenant_id,
      telefone,
      dados_coletados: { [campo]: valorNorm },
    }),
  });
  if (!insRes.ok) return { status: 500, body: { ok: false, error: 'db-error', detail: `insert-${insRes.status}` } };
  const created = await insRes.json();
  return {
    status: 200,
    body: {
      ok: true,
      conversa_id: created[0]?.id,
      campos_coletados: created[0]?.dados_coletados || { [campo]: valorNorm },
    },
  };
}

export const onRequest = withTool('dados_coletados', handler);
```

- [ ] **Step 4: Rodar testes — devem passar**

```bash
node --test tests/dados-coletados.test.mjs
```

Expected: `# pass 12 # fail 0`.

- [ ] **Step 5: Commit**

```bash
git add functions/api/tools/dados-coletados.js tests/dados-coletados.test.mjs
git commit -m "$(cat <<'EOF'
feat(tools): dados_coletados — merge incremental em conversa.dados_coletados

Tool nova pro prompt coleta/info persistir descricao_tattoo, tamanho_cm,
local_corpo etc conforme cliente responde. Upsert pattern:
- existe → PATCH com merge
- não existe → INSERT com dados_coletados = { [campo]: valor }

Validação: campo snake_case 1-50 chars, valor qualquer JSON serializable.
12 unit tests cobrindo happy path, edge cases, erros do Supabase.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Tool `detectar-trigger`

**Files:**
- Create: `functions/api/tools/detectar-trigger.js`
- Create: `tests/detectar-trigger.test.mjs`

**Purpose:** Quando tatuador manda mensagem no chat do cliente em modo Coleta-Reentrada (ex: "Lina, assume 750"), o n8n chama esta tool ANTES do prompt. Se detectar match, atualiza `conversa.estado_agente='agendamento'` + `conversa.valor_fechado=X` e retorna `{ match: true, transicionou: true }`. n8n então dispara nova inferência do agente, que pega o prompt coleta/agendamento.

**API:**
- POST `/api/tools/detectar-trigger`
- Headers: `X-Inkflow-Tool-Secret`
- Body: `{ tenant_id, telefone, message, is_from_tenant }`
- Response (match): `{ ok: true, match: true, valor: 750, transicionou: true, estado_agente: 'agendamento' }`
- Response (no match): `{ ok: true, match: false }`

**Semantics:**
- Só tenta match se `is_from_tenant === true`.
- Busca tenant pra pegar `trigger_handoff` (custom) ou fallback `"{nome_agente}, assume"`.
- Ignora se `tenant.config_precificacao.coleta_submode !== 'reentrada'`.
- Regex tolerante a `R$`, espaços, vírgula/ponto no decimal. Case-insensitive, acento-insensitive.
- Valor deve estar em [10, 100000] (evita chutes como "Lina assume 2" ou "Lina assume 999999999").
- Só transiciona estado se `conversa.estado_agente !== 'agendamento'` já (idempotência).

### Step-by-step (TDD)

- [ ] **Step 1: Criar `tests/detectar-trigger.test.mjs`**

Conteúdo:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrigger, handler } from '../functions/api/tools/detectar-trigger.js';

// ── parseTrigger — função pura, sem I/O ────────────────────────────────────

test('parseTrigger: match simples "Lina, assume 750"', () => {
  const r = parseTrigger('Lina, assume 750', 'Lina, assume');
  assert.deepEqual(r, { match: true, valor: 750 });
});

test('parseTrigger: match sem vírgula "Lina assume 750"', () => {
  const r = parseTrigger('Lina assume 750', 'Lina assume');
  assert.deepEqual(r, { match: true, valor: 750 });
});

test('parseTrigger: match com R$ "Lina, assume R$ 750"', () => {
  const r = parseTrigger('Lina, assume R$ 750', 'Lina, assume');
  assert.deepEqual(r, { match: true, valor: 750 });
});

test('parseTrigger: match com R$ colado "Lina, assume R$750"', () => {
  const r = parseTrigger('Lina, assume R$750', 'Lina, assume');
  assert.deepEqual(r, { match: true, valor: 750 });
});

test('parseTrigger: match com decimal vírgula "Lina assume 750,50"', () => {
  const r = parseTrigger('Lina assume 750,50', 'Lina assume');
  assert.deepEqual(r, { match: true, valor: 750.5 });
});

test('parseTrigger: match com decimal ponto "Lina assume 750.50"', () => {
  const r = parseTrigger('Lina assume 750.50', 'Lina assume');
  assert.deepEqual(r, { match: true, valor: 750.5 });
});

test('parseTrigger: case-insensitive', () => {
  const r = parseTrigger('LINA, ASSUME 750', 'Lina, assume');
  assert.deepEqual(r, { match: true, valor: 750 });
});

test('parseTrigger: acento-insensitive', () => {
  const r = parseTrigger('Joao, assume 500', 'João, assume');
  assert.deepEqual(r, { match: true, valor: 500 });
});

test('parseTrigger: match com texto antes/depois', () => {
  const r = parseTrigger('e ai Lina, assume 750 por favor', 'Lina, assume');
  assert.deepEqual(r, { match: true, valor: 750 });
});

test('parseTrigger: no match sem trigger', () => {
  const r = parseTrigger('bom dia', 'Lina, assume');
  assert.deepEqual(r, { match: false });
});

test('parseTrigger: no match com trigger mas sem número', () => {
  const r = parseTrigger('Lina, assume isso', 'Lina, assume');
  assert.deepEqual(r, { match: false });
});

test('parseTrigger: no match valor fora do range (< 10)', () => {
  const r = parseTrigger('Lina, assume 5', 'Lina, assume');
  assert.deepEqual(r, { match: false });
});

test('parseTrigger: no match valor fora do range (> 100000)', () => {
  const r = parseTrigger('Lina, assume 200000', 'Lina, assume');
  assert.deepEqual(r, { match: false });
});

test('parseTrigger: no match trigger vazio', () => {
  const r = parseTrigger('Lina, assume 750', '');
  assert.deepEqual(r, { match: false });
});

test('parseTrigger: pega o PRIMEIRO número após trigger', () => {
  const r = parseTrigger('Lina assume 750 não 900', 'Lina assume');
  assert.deepEqual(r, { match: true, valor: 750 });
});

// ── handler — com stubs do Supabase ────────────────────────────────────────

const envStub = { SUPABASE_SERVICE_ROLE_KEY: 'test-key' };

function fetchStub(responses) {
  return async (url, opts = {}) => {
    for (const r of responses) {
      if (r.match.test(url) && (r.method === undefined || r.method === (opts.method || 'GET'))) {
        return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.body, text: async () => JSON.stringify(r.body) };
      }
    }
    throw new Error(`Unmocked: ${opts.method || 'GET'} ${url}`);
  };
}

test('handler: ignora quando is_from_tenant=false', async () => {
  const res = await handler({ env: envStub, input: { tenant_id: 't1', telefone: '5511', message: 'Lina, assume 750', is_from_tenant: false } });
  assert.equal(res.body.match, false);
});

test('handler: ignora quando tenant não está em modo coleta-reentrada', async () => {
  globalThis.fetch = fetchStub([
    { match: /\/tenants\?/, body: [{ nome_agente: 'Lina', trigger_handoff: 'Lina, assume', config_precificacao: { modo: 'faixa' } }] },
  ]);
  const res = await handler({ env: envStub, input: { tenant_id: 't1', telefone: '5511', message: 'Lina, assume 750', is_from_tenant: true } });
  assert.equal(res.body.match, false);
});

test('handler: match completo — transiciona estado + valor_fechado', async () => {
  let patchBody = null;
  globalThis.fetch = async (url, opts = {}) => {
    if (/\/tenants\?/.test(url)) {
      return { ok: true, status: 200, json: async () => [{
        nome_agente: 'Lina',
        config_precificacao: { modo: 'coleta', coleta_submode: 'reentrada', trigger_handoff: 'Lina, assume' },
      }] };
    }
    if (/\/conversas\?tenant_id=.*select/.test(url)) {
      return { ok: true, status: 200, json: async () => [{ id: 'c1', estado_agente: 'silencioso' }] };
    }
    if (/\/conversas\?id=eq/.test(url) && opts.method === 'PATCH') {
      patchBody = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => [{ id: 'c1' }] };
    }
    throw new Error(`Unmocked: ${opts.method || 'GET'} ${url}`);
  };
  const res = await handler({ env: envStub, input: { tenant_id: 't1', telefone: '5511', message: 'Lina, assume 750', is_from_tenant: true } });
  assert.equal(res.body.match, true);
  assert.equal(res.body.valor, 750);
  assert.equal(res.body.transicionou, true);
  assert.equal(res.body.estado_agente, 'agendamento');
  assert.equal(patchBody.estado_agente, 'agendamento');
  assert.equal(patchBody.valor_fechado, 750);
});

test('handler: idempotente — se estado_agente já é agendamento, retorna match mas transicionou=false', async () => {
  globalThis.fetch = async (url) => {
    if (/\/tenants/.test(url)) return { ok: true, status: 200, json: async () => [{ config_precificacao: { modo: 'coleta', coleta_submode: 'reentrada', trigger_handoff: 'Lina, assume' } }] };
    if (/\/conversas\?tenant_id.*select/.test(url)) return { ok: true, status: 200, json: async () => [{ id: 'c1', estado_agente: 'agendamento' }] };
    throw new Error('unmocked ' + url);
  };
  const res = await handler({ env: envStub, input: { tenant_id: 't1', telefone: '5511', message: 'Lina, assume 900', is_from_tenant: true } });
  assert.equal(res.body.match, true);
  assert.equal(res.body.valor, 900);
  assert.equal(res.body.transicionou, false);
});

test('handler: usa fallback "{nome_agente}, assume" se trigger_handoff não setado', async () => {
  let patchBody = null;
  globalThis.fetch = async (url, opts = {}) => {
    if (/\/tenants/.test(url)) return { ok: true, status: 200, json: async () => [{ nome_agente: 'Isa', config_precificacao: { modo: 'coleta', coleta_submode: 'reentrada' } }] };
    if (/\/conversas\?tenant_id.*select/.test(url)) return { ok: true, status: 200, json: async () => [{ id: 'c1', estado_agente: 'silencioso' }] };
    if (/\/conversas\?id/.test(url) && opts.method === 'PATCH') { patchBody = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => [{ id: 'c1' }] }; }
    throw new Error('unmocked ' + url);
  };
  const res = await handler({ env: envStub, input: { tenant_id: 't1', telefone: '5511', message: 'Isa, assume 500', is_from_tenant: true } });
  assert.equal(res.body.match, true);
  assert.equal(res.body.valor, 500);
});
```

- [ ] **Step 2: Rodar testes — devem falhar**

```bash
node --test tests/detectar-trigger.test.mjs
```

Expected: `Cannot find module`.

- [ ] **Step 3: Criar `functions/api/tools/detectar-trigger.js`**

```javascript
// ── Tool — detectar_trigger ────────────────────────────────────────────────
// POST /api/tools/detectar-trigger
// Headers: X-Inkflow-Tool-Secret
// Body: { tenant_id, telefone, message, is_from_tenant }
//
// Orquestrado pelo n8n: quando mensagem no chat vem do tatuador (is_from_tenant)
// e o tenant está em modo Coleta-Reentrada, verifica se a mensagem casa com a
// trigger-phrase. Se sim, transiciona estado_agente pra 'agendamento' e grava
// valor_fechado. n8n então dispara nova inferência — que pega o prompt coleta/agendamento.

import { withTool, supaFetch } from './_tool-helpers.js';

const VALOR_MIN = 10;
const VALOR_MAX = 100000;

function normalize(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// parseTrigger(message, trigger) — função pura, testável.
// Retorna { match: true, valor } | { match: false }.
export function parseTrigger(message, trigger) {
  const msgN = normalize(message);
  const trigN = normalize(trigger);
  if (!trigN) return { match: false };

  const pattern = `${escapeRegex(trigN)}[^\\d]{0,20}(\\d+(?:[.,]\\d+)?)`;
  const m = msgN.match(new RegExp(pattern));
  if (!m) return { match: false };

  const valor = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(valor) || valor < VALOR_MIN || valor > VALOR_MAX) return { match: false };
  return { match: true, valor };
}

export async function handler({ env, input }) {
  const { tenant_id, telefone, message, is_from_tenant } = input || {};
  if (!tenant_id || !telefone) {
    return { status: 400, body: { ok: false, error: 'tenant_id e telefone obrigatórios' } };
  }
  if (!is_from_tenant) {
    return { status: 200, body: { ok: true, match: false } };
  }

  // Busca trigger + modo do tenant
  const tRes = await supaFetch(
    env,
    `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=nome_agente,config_precificacao`
  );
  if (!tRes.ok) return { status: 500, body: { ok: false, error: 'db-error' } };
  const tenants = await tRes.json();
  if (!tenants.length) return { status: 404, body: { ok: false, error: 'tenant-nao-encontrado' } };
  const tenant = tenants[0];
  const cfg = tenant.config_precificacao || {};
  if (cfg.modo !== 'coleta' || cfg.coleta_submode !== 'reentrada') {
    return { status: 200, body: { ok: true, match: false } };
  }

  const trigger = cfg.trigger_handoff || `${tenant.nome_agente || 'atendente'}, assume`;
  const parsed = parseTrigger(message, trigger);
  if (!parsed.match) return { status: 200, body: { ok: true, match: false } };

  // Busca conversa pra idempotência
  const cRes = await supaFetch(
    env,
    `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}&select=id,estado_agente`
  );
  if (!cRes.ok) return { status: 500, body: { ok: false, error: 'db-error' } };
  const convs = await cRes.json();
  if (!convs.length) {
    // Conversa não existe — criar seria estranho neste caso (cliente nunca mandou msg).
    // Reporta match mas não transiciona.
    return { status: 200, body: { ok: true, match: true, valor: parsed.valor, transicionou: false, reason: 'no-conversa' } };
  }
  const conv = convs[0];
  if (conv.estado_agente === 'agendamento') {
    return { status: 200, body: { ok: true, match: true, valor: parsed.valor, transicionou: false, reason: 'ja-em-agendamento' } };
  }

  // Transiciona
  const uRes = await supaFetch(
    env,
    `/rest/v1/conversas?id=eq.${encodeURIComponent(conv.id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        estado_agente: 'agendamento',
        valor_fechado: parsed.valor,
        updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!uRes.ok) return { status: 500, body: { ok: false, error: 'db-error', detail: `patch-${uRes.status}` } };

  return {
    status: 200,
    body: {
      ok: true,
      match: true,
      valor: parsed.valor,
      transicionou: true,
      estado_agente: 'agendamento',
    },
  };
}

export const onRequest = withTool('detectar_trigger', handler);
```

- [ ] **Step 4: Rodar testes — devem passar**

```bash
node --test tests/detectar-trigger.test.mjs
```

Expected: `# pass 18 # fail 0` (15 de parseTrigger + 3 de handler novos + 2 extras já cobertos acima... revise o count real após execução e ajuste se necessário).

- [ ] **Step 5: Commit**

```bash
git add functions/api/tools/detectar-trigger.js tests/detectar-trigger.test.mjs
git commit -m "$(cat <<'EOF'
feat(tools): detectar_trigger — regex trigger-phrase + update estado_agente

Tool nova pra orquestração do modo Coleta-Reentrada: quando tatuador manda
mensagem no chat do cliente com trigger-phrase + valor (ex: "Lina, assume
750"), transiciona conversa.estado_agente='agendamento' + grava valor_fechado.

parseTrigger é pura, testável: case-insensitive, acento-insensitive, tolera
R$/espaços/vírgula decimal. Valor bounded [10, 100000]. Idempotente (skip se
já em agendamento). 18 unit tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Verificação final + push

- [ ] **Step 1: Rodar toda a bateria de testes**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
find tests -name '*.test.mjs' -exec node --test {} +
```

Expected: **72 testes pass** (42 pré-existentes + 12 dados_coletados + 18 detectar-trigger).

- [ ] **Step 2: Lint check nos arquivos novos**

```bash
node --check functions/api/tools/dados-coletados.js
node --check functions/api/tools/detectar-trigger.js
```

Expected: clean.

- [ ] **Step 3: Confirmar que nada em produção quebrou**

```bash
# Grep por imports das tools novas fora dos arquivos novos — deve retornar nada
grep -rn "dados-coletados\|detectar-trigger" --include="*.js" --include="*.mjs" functions/ tests/ 2>/dev/null | grep -v "tools/dados-coletados.js\|tools/detectar-trigger.js\|dados-coletados.test.mjs\|detectar-trigger.test.mjs"
```

Expected: vazio. Estas tools são novas — nada chama elas ainda. O n8n workflow vai ser configurado pra chamar em PR posterior (ou manualmente após merge).

- [ ] **Step 4: Review git log antes do push**

```bash
git log --oneline feat/modo-coleta-pr2-tools ^origin/main 2>/dev/null || git log --oneline -5
```

Expected: 3 commits novos (migration, dados_coletados, detectar-trigger).

- [ ] **Step 5: Push**

```bash
git push -u origin feat/modo-coleta-pr2-tools
```

- [ ] **Step 6: Decidir formato de entrega com user**

Apresentar opções:

> "PR 2 enxuto pronto: 2 tools novas + 1 coluna SQL + 30 testes verdes. Zero comportamento visível em prod (tools só passam a ser usadas quando prompts Coleta + config do n8n entrarem nos PRs seguintes). Três opções:
>
> **A)** Abrir PR separado pra `main` agora. Mergeable independente — plumbing seguro pra ser staged e dogfooded sem feature flag expose.
>
> **B)** Esperar — deixar a branch aberta e começar a próxima fatia (prompts) no mesmo branch, abrindo só UM PR grande no fim.
>
> **C)** Push-only (sem PR) — marco de checkpoint pra próxima sessão decidir.
>
> Qual?"

Se aprovar A, abrir PR com body:

```bash
gh pr create --base main --head feat/modo-coleta-pr2-tools --title "feat(tools): dados_coletados + detectar-trigger (modo Coleta plumbing)" --body "$(cat <<'EOF'
## Summary

Plumbing do modo Coleta — 2 tools HTTP novas + 1 coluna SQL. **Zero comportamento visível em prod** — tools não são chamadas por ninguém ainda (n8n workflow + prompts Coleta entram em PRs seguintes).

- **`/api/tools/dados-coletados`** — merge incremental em `conversa.dados_coletados` JSONB. Usada pelo prompt coleta/info pra gravar descricao_tattoo, tamanho_cm, local_corpo etc conforme cliente responde.
- **`/api/tools/detectar-trigger`** — regex trigger-phrase + transição de estado_agente. Usada pelo n8n ANTES do prompt quando mensagem vem do tatuador em modo Coleta-Reentrada.
- **`conversas.valor_fechado NUMERIC(10,2)`** — nova coluna (nullable), source of truth pro prompt coleta/agendamento.

Migração SQL aplicada em prod via MCP (`bfzuxxuscyplfoimvomh`).

Spec: `docs/superpowers/specs/2026-04-22-modo-coleta-design.md`
Plano: `docs/superpowers/plans/2026-04-23-modo-coleta-pr2-tools.md`
Plano completo (referência): `docs/superpowers/plans/2026-04-23-modo-coleta-pr2-backend-full.md`

## Test plan

- [x] `node --test tests/dados-coletados.test.mjs` — 12 tests (happy path, edge cases, erros)
- [x] `node --test tests/detectar-trigger.test.mjs` — 18 tests (parseTrigger puro + handler com stubs)
- [x] Full suite `find tests -name '*.test.mjs' -exec node --test {} +` — 72 tests pass
- [x] Migration aplicada via MCP; `information_schema.columns` confirma `valor_fechado`
- [x] Tools NÃO são chamadas por nada em `functions/` ou `tests/` — plumbing dormant até PR 3

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Post-PR — o que vem a seguir

Esta fatia entrega as duas tools + a coluna SQL. O modo Coleta **ainda não funciona end-to-end** porque faltam:

1. **Prompts `coleta/info/` e `coleta/agendamento/`** — Tasks 4-12 do plano completo
2. **Dispatcher branch `case 'coleta'`** — Task 13 do plano completo
3. **Snapshots + contracts + invariants + contamination linter** pros novos modos — Tasks 14-17
4. **n8n workflow config** — chamar `detectar-trigger` ANTES de `prompt` quando `msg.key.fromMe === true`; não faz parte deste repo

Continuação em sessão nova: consultar `docs/superpowers/plans/2026-04-23-modo-coleta-pr2-backend-full.md`.

---

## Self-Review Notes

**Spec coverage (Bloco 6.2 do spec):**
- [x] Fase 2.1 — "Inventariar tools + criar `dados_coletados`" → Task 2
- [x] Fase 2.4 (parcial) — "Detector de trigger-phrase" → Task 3. Spec assumia `webhooks/evo.js` mas esse arquivo não existe (webhook vive no n8n/VPS); realizado como tool HTTP que o n8n chama.
- [x] Pre-req implícito — coluna `valor_fechado` em `conversas` → Task 1. Não listado no spec literal mas necessário pelo spec de agendamento (`conversa.valor_fechado` é source of truth).

**Escopo FORA deste plano (vai pro plano completo):**
- Prompts Coleta
- Dispatcher branch
- Testes Tier 1 dos modos coleta (snapshots, contracts, invariants, contamination)

**Placeholder scan:** nenhum TODO/TBD/placeholder. Código completo em cada step.

**Type consistency:** `parseTrigger` mesmo nome em teste e impl. `handler` exportado como nomeado em ambas as tools. `estado_agente` string literal `'agendamento'` consistente com migration do PR 1.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-23-modo-coleta-pr2-tools.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.

**2. Inline Execution** — executar inline com checkpoints.

**Which approach?**
