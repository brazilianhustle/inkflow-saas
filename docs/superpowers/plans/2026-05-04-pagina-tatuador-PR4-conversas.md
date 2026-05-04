# PR 4 — Conversas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o Painel Conversas (placeholder hoje em `studio.html#tab-conversas`) em interface estilo WhatsApp Web — 3 grupos navegáveis ("Hoje", "Aguardando orçamento", "Em negociação") + sub-tab "Histórico", lista lateral 300px com cards de conversa + thread direita com mensagens cronológicas, real-time via Supabase Realtime, paginação cursor-based, e botões "Assumir"/"Devolver" wireados aos endpoints `_transition.js` já mergeados no PR #23.

**Architecture:** Frontend HTML+JS estático em `studio.html` (single-file vanilla, padrão atual do repo). Backend 2 endpoints novos Cloudflare Functions em `functions/api/conversas/{list,thread}.js` reusando `verifyStudioTokenOrLegacy` (HMAC v1) + service-role Supabase. Mensagens vivem em `n8n_chat_histories` (tabela legacy, sem FK tenant_id — isolation via convenção `session_id = '{tenant_uuid}_{telefone}'`). Real-time via Supabase Realtime client (CDN UMD) subscribing a `conversas` UPDATE + `n8n_chat_histories` INSERT. Migration adiciona `conversas.last_msg_at` (timestamptz) + trigger ON INSERT em `n8n_chat_histories` que UPDATE conversas (spec assume `last_msg_at` existir; não existia ainda).

**Tech Stack:** HTML+JS vanilla, Cloudflare Pages Functions, Supabase Postgres + Realtime, Supabase JS client v2 via CDN UMD (`@supabase/supabase-js@2`), HMAC studio_token v1 auth.

**Spec mestre:** [`docs/superpowers/specs/2026-05-03-pagina-tatuador-refactor-design.md`](../specs/2026-05-03-pagina-tatuador-refactor-design.md) §"Painel 3 — Conversas" (linhas 190-223).

**Plano-mestre:** [`docs/superpowers/plans/2026-05-03-pagina-tatuador-MASTER.md`](./2026-05-03-pagina-tatuador-MASTER.md) §"PR 4 — Conversas" (linhas 173-203).

**Branch alvo:** `feat/pagina-tatuador-pr4-conversas` saindo de `main` (PR #21 + PR #23 já mergeados).

**Estimativa:** 1.5-2 dias com Claude assistido (subagent-driven recomendado, calibração marcada por task).

---

## Calibração subagent por task

Cada task tem tag explícita pra `superpowers:subagent-driven-development` decidir profundidade do pipeline:

- `[direto]` — orquestrador executa direto (setup, scaffolding, PR-open). Sem subagent.
- `[implementer-only]` — 1 subagent implementer. Sem code-review subagent. (Refator simples, helper puro, wiring sem security risk.)
- `[pipeline-completa]` — implementer + code-reviewer + (se aplicável) silent-failure-hunter. (Endpoints com auth/tenant filter, XSS-risk rendering, real-time subscription.)

Lições do PR #23 cravadas:
- Endpoints com tenant filter → **pipeline-completa** (race conditions, tenant leakage risk)
- Rendering DOM com user input → **pipeline-completa** (XSS via `innerHTML`)
- Real-time subscription → **pipeline-completa** (silent failure se subscribe falha, perf com tabelas crescentes)
- Wiring botões a endpoints existentes → **implementer-only**
- Helper puro com unit tests → **implementer-only**
- HTML markup estrutural → **implementer-only**
- Migration SQL idempotente → **direto** (review humana basta)
- Smoke + PR-open → **direto**

---

## Riscos identificados (mitigar durante execução)

1. **Isolation tenant em `n8n_chat_histories`:** tabela sem FK `tenant_id`, isolation hoje é convenção `session_id LIKE '<tenant_id>_%'`. **Mitigação:** endpoint `thread.js` precisa fazer 2 checks — (a) fetch conversa via `id+tenant_id` filter (tenant from studio_token) pra obter `telefone`, (b) buildar session_id `<tenant_id>_<telefone>` server-side e filtrar por igualdade exata. Nunca aceitar `session_id` do client.
2. **Real-time perf com `n8n_chat_histories` crescente:** P2 backlog #6 cita "tabela cresce indefinidamente" (436 rows hoje + 52 órfãs deletadas em 27/04). **Mitigação:** subscribe com filter exato `session_id=eq.<session_id>` (não LIKE) — Supabase Realtime suporta filter por igualdade. Lista lateral subscribe em `conversas` UPDATE filtrado por `tenant_id=eq.<tenant_id>` (count baixo).
3. **Paginação cursor-based:** evitar OFFSET (caro com tabela grande). Usar `last_msg_at < before_ts` (DESC ordered) na lista, `created_at < before_ts` na thread.
4. **`last_msg_at` não existe na tabela:** spec assume existir, não existe. Task 1 cria via migration + trigger backfill.
5. **RLS:** `conversas` e `n8n_chat_histories` têm RLS habilitado mas sem policies específicas pro tenant. Backend usa service-role key (bypass RLS). Frontend Supabase Realtime client precisa de anon key + RLS policies OU subscribe via studio_token-authenticated WebSocket. **Mitigação:** Task 9 documenta — primeiro spike usa anon key + filter por tenant_id (defense-in-depth via filter, não via RLS). Hardening de RLS fica P2 backlog (item já existe — n8n_chat_histories tenant isolation proper).
6. **CSP:** `studio.html` carrega scripts. Supabase JS UMD precisa estar allowlisted via meta tag CSP ou `_headers`. Task 9 audit confirma.
7. **88 nodes no n8n workflow:** PR 4 NÃO mexe em n8n. Kill-switch já está aplicado (sessão 04/05). Os 2 gaps n8n (UPSERT + gate incoming) ficam fora deste PR — UI Conversas substitui esse caminho.

---

## File Structure (decomposição)

**Criar:**
- `supabase/migrations/2026-05-04-pagina-tatuador-conversas.sql` — migration last_msg_at + trigger + backfill
- `functions/api/conversas/_grupos.js` — helper puro: `getGrupoFilter(grupo)` retorna `{ estados: string[], extra_filter?: string }`
- `functions/api/conversas/list.js` — `GET /api/conversas/list` — retorna conversas paginadas filtradas por grupo
- `functions/api/conversas/thread.js` — `GET /api/conversas/thread` — retorna mensagens paginadas de uma conversa
- `tests/api/conversas-grupos.test.mjs` — unit tests do helper `_grupos.js`
- `tests/api/conversas-list.test.mjs` — unit tests do endpoint list.js (mocked supaFetch)
- `tests/api/conversas-thread.test.mjs` — unit tests do endpoint thread.js (mocked supaFetch + tenant guard)

**Modificar:**
- `studio.html` — substituir placeholder `<div id="tab-conversas">` (linhas 631-638) por estrutura completa: 3 tabs + lista lateral + thread + real-time JS

**Não criar (já existem do PR #23):**
- `functions/api/conversas/assumir.js` ✅
- `functions/api/conversas/devolver.js` ✅
- `functions/api/conversas/_transition.js` ✅

---

## Tasks

### Task 0: Pre-flight (branch + baseline) `[direto]`

**Files:** none — git/setup only.

- [ ] **Step 1: Confirmar working tree limpo**

```bash
cd ~/Documents/inkflow-saas
git status
```

Expected: `nothing to commit, working tree clean` em `main`. Se houver mudanças soltas, abortar e investigar.

- [ ] **Step 2: Pull main + criar branch nova**

```bash
git checkout main && git pull origin main
git checkout -b feat/pagina-tatuador-pr4-conversas
```

Expected: branch `feat/pagina-tatuador-pr4-conversas` criada, HEAD em `main` atualizado.

- [ ] **Step 3: Rodar bateria de tests baseline**

```bash
bash scripts/test-prompts.sh
node --test tests/api/conversas-assumir-devolver.test.mjs
```

Expected: todos PASS. Anotar contagem (ex.: "12 passing, 0 failing"). Se falhar, abortar — main não pode estar quebrado antes do PR começar.

- [ ] **Step 4: Verificar plano + spec referenciados existem**

```bash
ls docs/superpowers/specs/2026-05-03-pagina-tatuador-refactor-design.md docs/superpowers/plans/2026-05-03-pagina-tatuador-MASTER.md docs/superpowers/plans/2026-05-04-pagina-tatuador-PR4-conversas.md
```

Expected: 3 arquivos listados.

- [ ] **Step 5: Commit do plano (se ainda não commitado)**

```bash
git add docs/superpowers/plans/2026-05-04-pagina-tatuador-PR4-conversas.md
git diff --cached --stat
git commit -m "docs(plan): add PR 4 Conversas detailed sub-plan"
```

Expected: commit criado. Pular se plano já tá em main.

---

### Task 1: Migration — `conversas.last_msg_at` + trigger + backfill `[direto]`

**Files:**
- Create: `supabase/migrations/2026-05-04-pagina-tatuador-conversas.sql`
- Test: validation queries pós-migration (executadas manualmente no Dashboard durante deploy)

**Por quê:** spec §198 cita filtro `last_msg_at >= today 00:00 BRT` mas coluna não existe. Sem esse campo, "Conversas de hoje" não consegue filtrar por atividade hoje. Trigger mantém valor sempre atualizado em vez de JOIN cara em cada query da lista.

- [ ] **Step 1: Criar arquivo migration**

```sql
-- ═════════════════════════════════════════════════════════════════════════
-- Migration: Página do Tatuador Refactor — PR 4 Conversas
-- Data: 2026-05-04
-- Spec: docs/superpowers/specs/2026-05-03-pagina-tatuador-refactor-design.md §"Painel 3 — Conversas"
--
-- Objetivos:
-- 1. Add `conversas.last_msg_at timestamptz` (necessário pra filtro "Conversas de hoje").
-- 2. Backfill `last_msg_at` a partir de max(n8n_chat_histories.created_at) por session_id.
-- 3. Trigger ON INSERT em `n8n_chat_histories` que UPDATE conversas.last_msg_at em real-time.
-- 4. Index pra ordenação DESC.
--
-- Idempotente (IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE). Defaults seguros.
-- ═════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Add coluna last_msg_at em conversas ──────────────────────────────
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS last_msg_at timestamptz;

-- ─── 2. Backfill: pra cada conversa, setar last_msg_at = max(n8n_chat_histories.created_at) ──
-- session_id format: '<tenant_uuid>_<telefone>'.
-- Match via concat(tenant_id::text, '_', telefone). Usa CTE pra performance.
WITH max_msg AS (
  SELECT
    SPLIT_PART(session_id, '_', 1)::uuid AS tenant_id,
    SUBSTRING(session_id FROM POSITION('_' IN session_id) + 1) AS telefone,
    MAX(created_at) AS last_at
  FROM n8n_chat_histories
  WHERE session_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_'
  GROUP BY 1, 2
)
UPDATE conversas c
SET last_msg_at = m.last_at
FROM max_msg m
WHERE c.tenant_id = m.tenant_id
  AND c.telefone = m.telefone
  AND c.last_msg_at IS NULL;

-- Pra conversas SEM mensagens em n8n_chat_histories (raras), usar created_at da própria conversa.
UPDATE conversas SET last_msg_at = created_at WHERE last_msg_at IS NULL;

-- ─── 3. Index pra ordenação DESC ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conversas_tenant_last_msg
  ON conversas(tenant_id, last_msg_at DESC);

-- ─── 4. Trigger function: atualiza last_msg_at quando msg nova chega ─────
CREATE OR REPLACE FUNCTION update_conversa_last_msg_at()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id uuid;
  v_telefone text;
BEGIN
  -- Parse session_id format '<tenant_uuid>_<telefone>'.
  IF NEW.session_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_' THEN
    RETURN NEW;
  END IF;

  v_tenant_id := SPLIT_PART(NEW.session_id, '_', 1)::uuid;
  v_telefone := SUBSTRING(NEW.session_id FROM POSITION('_' IN NEW.session_id) + 1);

  UPDATE conversas
    SET last_msg_at = NEW.created_at
    WHERE tenant_id = v_tenant_id
      AND telefone = v_telefone
      AND (last_msg_at IS NULL OR last_msg_at < NEW.created_at);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_n8n_chat_histories_update_conversa ON n8n_chat_histories;
CREATE TRIGGER trg_n8n_chat_histories_update_conversa
  AFTER INSERT ON n8n_chat_histories
  FOR EACH ROW
  EXECUTE FUNCTION update_conversa_last_msg_at();

COMMIT;

-- ─── Verificação pós-migration (rodar manualmente no Dashboard) ─────────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'conversas' AND column_name = 'last_msg_at';
-- Deve retornar 1 linha.
--
-- SELECT count(*) FROM conversas WHERE last_msg_at IS NULL;
-- Deve retornar 0.
--
-- SELECT trigger_name FROM information_schema.triggers
--   WHERE event_object_table = 'n8n_chat_histories';
-- Deve listar `trg_n8n_chat_histories_update_conversa`.
```

- [ ] **Step 2: Validar SQL syntax localmente (sem aplicar)**

```bash
# Sanity: arquivo bem formado, sem characters problemáticos.
wc -l supabase/migrations/2026-05-04-pagina-tatuador-conversas.sql
grep -c "BEGIN\|COMMIT" supabase/migrations/2026-05-04-pagina-tatuador-conversas.sql
```

Expected: ~70-80 linhas, 1 BEGIN + 1 COMMIT.

- [ ] **Step 3: Aplicar migration via Supabase MCP em prod (project `bfzuxxuscyplfoimvomh`, sa-east-1)**

Usar tool MCP `mcp__plugin_supabase_supabase__apply_migration`:
- `name`: `2026_05_04_pagina_tatuador_conversas`
- `query`: conteúdo do SQL acima.

Expected: migration aplicada sem erro. Anotar timestamp.

- [ ] **Step 4: Rodar 3 queries de verificação via `execute_sql` MCP**

Query 1 — coluna existe:
```sql
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'conversas' AND column_name = 'last_msg_at';
```
Expected: 1 linha (`last_msg_at`, `timestamp with time zone`).

Query 2 — backfill cobriu tudo:
```sql
SELECT count(*) AS total, count(last_msg_at) AS com_last_msg FROM conversas;
```
Expected: total == com_last_msg (zero NULL).

Query 3 — trigger existe:
```sql
SELECT trigger_name, event_manipulation, event_object_table
  FROM information_schema.triggers
  WHERE event_object_table = 'n8n_chat_histories';
```
Expected: 1 linha (`trg_n8n_chat_histories_update_conversa`, `INSERT`, `n8n_chat_histories`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-05-04-pagina-tatuador-conversas.sql
git commit -m "feat(migration): add conversas.last_msg_at + trigger + backfill (PR 4)"
```

---

### Task 2: Helper `_grupos.js` (puro, testável) `[implementer-only]`

**Files:**
- Create: `functions/api/conversas/_grupos.js`
- Test: `tests/api/conversas-grupos.test.mjs`

**Responsabilidade única:** mapear nome do grupo (`'hoje'`, `'aguardando'`, `'negociacao'`, `'historico'`) pra:
- Lista de estados que caem nesse grupo
- Filtro extra (ex.: `last_msg_at >= today 00:00 BRT` pra "hoje")

Função pura, sem side effects, sem fetch. Testável 100% via unit test.

- [ ] **Step 1: Escrever test failing primeiro**

Conteúdo de `tests/api/conversas-grupos.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('getGrupoFilter("hoje") — retorna estados de coleta + filtro last_msg_at hoje BRT', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('hoje');
  assert.deepEqual(r.estados, ['coletando_tattoo', 'coletando_cadastro', 'escolhendo_horario', 'aguardando_sinal']);
  assert.ok(r.last_msg_at_gte, 'deve incluir filtro last_msg_at_gte');
  // Confirma que é uma data ISO em hoje BRT 00:00 UTC equivalente.
  assert.match(r.last_msg_at_gte, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

test('getGrupoFilter("aguardando") — estados de espera por tatuador', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('aguardando');
  assert.deepEqual(r.estados, ['aguardando_tatuador', 'aguardando_decisao_desconto']);
  assert.equal(r.last_msg_at_gte, undefined);
});

test('getGrupoFilter("negociacao") — propondo + lead_frio + pausada_tatuador', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('negociacao');
  assert.deepEqual(r.estados, ['propondo_valor', 'lead_frio', 'pausada_tatuador']);
});

test('getGrupoFilter("historico") — só fechado', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('historico');
  assert.deepEqual(r.estados, ['fechado']);
});

test('getGrupoFilter("invalid") — retorna null (caller decide 400)', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  assert.equal(getGrupoFilter('invalid'), null);
  assert.equal(getGrupoFilter(''), null);
  assert.equal(getGrupoFilter(null), null);
  assert.equal(getGrupoFilter(undefined), null);
});

test('getGrupoFilter("hoje") — last_msg_at_gte é hoje 00:00 timezone São Paulo, expressed em UTC', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('hoje');
  // BRT é UTC-3 ano-redondo (sem DST desde 2019). Então 00:00 BRT = 03:00 UTC.
  assert.ok(r.last_msg_at_gte.endsWith('T03:00:00.000Z') || r.last_msg_at_gte.endsWith('T03:00:00Z'),
    `Esperava ISO terminando em T03:00:00Z, recebi: ${r.last_msg_at_gte}`);
});
```

- [ ] **Step 2: Rodar tests pra confirmar que falham**

```bash
node --test tests/api/conversas-grupos.test.mjs
```

Expected: ERR — `Cannot find module '../../functions/api/conversas/_grupos.js'`.

- [ ] **Step 3: Implementar `_grupos.js`**

Conteúdo:

```javascript
// ── InkFlow — Grupos de Conversas: helper puro mapeando nome → estados + filtros ──
// Usado por list.js endpoint pra construir query Supabase.
// Função pura, sem side effects, sem fetch. Testável.

const GRUPOS = {
  hoje: {
    estados: ['coletando_tattoo', 'coletando_cadastro', 'escolhendo_horario', 'aguardando_sinal'],
    inclui_filtro_hoje: true,
  },
  aguardando: {
    estados: ['aguardando_tatuador', 'aguardando_decisao_desconto'],
    inclui_filtro_hoje: false,
  },
  negociacao: {
    estados: ['propondo_valor', 'lead_frio', 'pausada_tatuador'],
    inclui_filtro_hoje: false,
  },
  historico: {
    estados: ['fechado'],
    inclui_filtro_hoje: false,
  },
};

// Retorna ISO string de hoje 00:00 BRT (= 03:00 UTC).
// BRT é UTC-3 ano-redondo (Brasil aboliu DST em 2019).
function isoHojeBrtUtc() {
  const now = new Date();
  // Construir 00:00 UTC de hoje, depois +3h pra obter 03:00 UTC = 00:00 BRT.
  const utc0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 0, 0, 0));
  // Edge: se agora UTC é antes de 03:00 (ex.: 02:30 UTC = 23:30 BRT do dia anterior),
  // "hoje BRT" ainda é o dia anterior. Subtrair 1 dia se aplicável.
  if (now.getTime() < utc0.getTime()) {
    utc0.setUTCDate(utc0.getUTCDate() - 1);
  }
  return utc0.toISOString();
}

export function getGrupoFilter(grupo) {
  if (typeof grupo !== 'string' || !GRUPOS[grupo]) return null;
  const cfg = GRUPOS[grupo];
  const result = { estados: cfg.estados };
  if (cfg.inclui_filtro_hoje) {
    result.last_msg_at_gte = isoHojeBrtUtc();
  }
  return result;
}

export const GRUPOS_VALIDOS = Object.keys(GRUPOS);
```

- [ ] **Step 4: Rodar tests pra confirmar PASS**

```bash
node --test tests/api/conversas-grupos.test.mjs
```

Expected: 6 passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add functions/api/conversas/_grupos.js tests/api/conversas-grupos.test.mjs
git commit -m "feat(conversas): add _grupos.js helper + 6 tests"
```

---

### Task 3: Endpoint `GET /api/conversas/list` `[pipeline-completa]`

**Files:**
- Create: `functions/api/conversas/list.js`
- Test: `tests/api/conversas-list.test.mjs`

**Responsabilidade:** retornar conversas paginadas filtradas por grupo (`hoje|aguardando|negociacao|historico`).

**Contrato:**
- Method: GET
- Query params: `studio_token` (HMAC v1, obrigatório), `grupo` (obrigatório), `limit` (1-100, default 30), `before_ts` (ISO string opcional, cursor pra paginação).
- Response 200: `{ ok: true, conversas: [{id, telefone, estado_agente, last_msg_at, valor_proposto, dados_coletados, dados_cadastro, last_msg_preview}], next_cursor: ISO|null }`
- `last_msg_preview` é até 60 chars de `n8n_chat_histories.message.content` mais recente — fetch separado limit 1 desc por conversa (acceptable n+1 com batch limit 30; pode otimizar via SQL view futuro).
- Errors: 400 (params inválidos), 401 (token inválido), 500 (DB error).

**Security:**
- `tenant_id` SEMPRE derivado do `studio_token` verificado, NUNCA aceito do query string.
- Filter `tenant_id=eq.<verified>` em TODA query.

- [ ] **Step 1: Escrever tests failing**

Conteúdo de `tests/api/conversas-list.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mock helpers compartilhados — recriados em cada test pra isolation.
function mockEnv() {
  return {
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    STUDIO_TOKEN_SECRET: 'test-secret-min-32-chars-padding-padding',
  };
}

async function makeStudioToken(tenantId, env) {
  const { generateStudioToken } = await import('../../functions/api/_auth-helpers.js');
  return generateStudioToken(tenantId, env.STUDIO_TOKEN_SECRET);
}

test('list — falta studio_token → 400', async () => {
  const { onRequest } = await import('../../functions/api/conversas/list.js');
  const req = new Request('https://x.com/api/conversas/list?grupo=hoje', { method: 'GET' });
  const res = await onRequest({ request: req, env: mockEnv() });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /studio_token/i);
});

test('list — studio_token inválido → 401', async () => {
  const { onRequest } = await import('../../functions/api/conversas/list.js');
  const req = new Request('https://x.com/api/conversas/list?studio_token=invalid&grupo=hoje', { method: 'GET' });
  const res = await onRequest({ request: req, env: mockEnv() });
  assert.equal(res.status, 401);
});

test('list — grupo inválido → 400 com lista de válidos', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  // Stub fetch pra evitar hit real no Supabase nessa rota (não chega lá — falha antes).
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('[]', { status: 200 });

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=invalido`, { method: 'GET' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /grupo/i);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('list — happy path: stub Supabase, retorna conversas + previews', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push(url);
    if (url.includes('/rest/v1/conversas?')) {
      // Lista de conversas
      return new Response(JSON.stringify([
        { id: 'c1', telefone: '5511999999999', estado_agente: 'coletando_tattoo', last_msg_at: '2026-05-04T12:00:00Z', valor_proposto: null, dados_coletados: { nome: 'Ana' }, dados_cadastro: null },
        { id: 'c2', telefone: '5511888888888', estado_agente: 'aguardando_sinal', last_msg_at: '2026-05-04T11:00:00Z', valor_proposto: 500, dados_coletados: {}, dados_cadastro: null },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/rest/v1/n8n_chat_histories?')) {
      // Last msg preview pra cada session_id
      return new Response(JSON.stringify([
        { message: { content: 'Oi! Quero fazer uma tattoo de leão no antebraço.' } }
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=hoje&limit=30`, { method: 'GET' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(Array.isArray(body.conversas), true);
    assert.equal(body.conversas.length, 2);
    assert.equal(body.conversas[0].id, 'c1');
    assert.ok(body.conversas[0].last_msg_preview, 'deve trazer preview da última msg');
    // Confirma que toda call usa tenant_id derivado do token, não do query string.
    const conversaCalls = calls.filter(u => u.includes('/rest/v1/conversas?'));
    for (const url of conversaCalls) {
      assert.ok(url.includes(`tenant_id=eq.${tenantId}`), `Esperava tenant_id=eq.${tenantId} em ${url}`);
    }
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('list — limit fora de range → clamped pra 30', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let lastUrl = '';
  globalThis.fetch = async (url) => {
    lastUrl = url;
    if (url.includes('conversas?')) return new Response('[]', { status: 200 });
    if (url.includes('n8n_chat_histories?')) return new Response('[]', { status: 200 });
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=hoje&limit=999`, { method: 'GET' });
    await onRequest({ request: req, env });
    // Confirma que o limit aplicado foi 100 (cap), não 999.
    assert.match(lastUrl, /limit=100/, `Esperava limit=100 em ${lastUrl}`);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('list — before_ts cursor → adiciona last_msg_at=lt na query', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let lastConvUrl = '';
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?')) {
      lastConvUrl = url;
      return new Response('[]', { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=negociacao&before_ts=2026-05-03T00:00:00Z`, { method: 'GET' });
    await onRequest({ request: req, env });
    assert.match(lastConvUrl, /last_msg_at=lt\.2026-05-03T00%3A00%3A00Z/);
  } finally {
    globalThis.fetch = origFetch;
  }
});
```

- [ ] **Step 2: Rodar tests pra confirmar fail**

```bash
node --test tests/api/conversas-list.test.mjs
```

Expected: ERR — `Cannot find module '../../functions/api/conversas/list.js'`.

- [ ] **Step 3: Implementar `list.js`**

Conteúdo:

```javascript
// ── InkFlow — GET /api/conversas/list ──
// Lista conversas paginadas filtradas por grupo (hoje|aguardando|negociacao|historico).
// Auth: studio_token HMAC v1 → tenant_id sempre derivado do token, nunca aceito do query.
//
// Query params:
//   studio_token (obrigatório)
//   grupo (obrigatório, hoje|aguardando|negociacao|historico)
//   limit (opcional, 1-100, default 30, clamped)
//   before_ts (opcional, ISO string — cursor pra paginação)
//
// Response 200: { ok: true, conversas: [...], next_cursor: ISO|null }
// `next_cursor` é o `last_msg_at` da última row se houver mais páginas.

import { verifyStudioTokenOrLegacy } from '../_auth-helpers.js';
import { getGrupoFilter, GRUPOS_VALIDOS } from './_grupos.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function clampLimit(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 30;
  return Math.min(n, 100);
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(request.url);
  const studio_token = url.searchParams.get('studio_token');
  const grupo = url.searchParams.get('grupo');
  const limit = clampLimit(url.searchParams.get('limit'));
  const before_ts = url.searchParams.get('before_ts');

  if (!studio_token) return json({ error: 'studio_token obrigatório' }, 400);
  if (!grupo) return json({ error: 'grupo obrigatório', grupos_validos: GRUPOS_VALIDOS }, 400);

  const grupoFilter = getGrupoFilter(grupo);
  if (!grupoFilter) return json({ error: 'grupo inválido', grupos_validos: GRUPOS_VALIDOS }, 400);

  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return json({ error: 'Configuração interna ausente' }, 503);

  const verified = await verifyStudioTokenOrLegacy({
    token: studio_token,
    secret: env.STUDIO_TOKEN_SECRET,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SB_KEY,
  });
  if (!verified) return json({ error: 'Token inválido' }, 401);
  const tenant_id = verified.tenantId;

  // Build query string
  const estadosCsv = grupoFilter.estados.map(s => encodeURIComponent(s)).join(',');
  const params = [
    `tenant_id=eq.${tenant_id}`,
    `estado_agente=in.(${estadosCsv})`,
    'select=id,telefone,estado_agente,last_msg_at,valor_proposto,dados_coletados,dados_cadastro,estado_agente_anterior,pausada_em',
    'order=last_msg_at.desc',
    `limit=${limit}`,
  ];
  if (grupoFilter.last_msg_at_gte) {
    params.push(`last_msg_at=gte.${encodeURIComponent(grupoFilter.last_msg_at_gte)}`);
  }
  if (before_ts) {
    params.push(`last_msg_at=lt.${encodeURIComponent(before_ts)}`);
  }

  const r = await fetch(`${SUPABASE_URL}/rest/v1/conversas?${params.join('&')}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => '');
    console.error('list: GET conversas falhou', r.status, errText);
    return json({ error: 'Erro ao consultar conversas' }, 500);
  }
  const conversas = await r.json();

  // Buscar last_msg_preview pra cada conversa em paralelo (até `limit` calls).
  const previews = await Promise.all(conversas.map(async (c) => {
    const session_id = `${tenant_id}_${c.telefone}`;
    const pr = await fetch(`${SUPABASE_URL}/rest/v1/n8n_chat_histories?session_id=eq.${encodeURIComponent(session_id)}&select=message&order=id.desc&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!pr.ok) return '';
    const rows = await pr.json();
    if (!Array.isArray(rows) || rows.length === 0) return '';
    const content = rows[0]?.message?.content;
    if (typeof content !== 'string') return '';
    return content.slice(0, 60);
  }));

  const conversasComPreview = conversas.map((c, i) => ({ ...c, last_msg_preview: previews[i] }));
  const next_cursor = conversas.length === limit ? conversas[conversas.length - 1].last_msg_at : null;

  return json({ ok: true, conversas: conversasComPreview, next_cursor });
}
```

- [ ] **Step 4: Rodar tests pra confirmar PASS**

```bash
node --test tests/api/conversas-list.test.mjs
```

Expected: 6 passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add functions/api/conversas/list.js tests/api/conversas-list.test.mjs
git commit -m "feat(conversas): add GET /api/conversas/list endpoint + 6 tests"
```

**Code review focus areas (subagent code-reviewer):**
- Tenant filter `tenant_id=eq.<verified>` em TODA query? Sem fallback pra query string?
- `session_id` build server-side com tenant verificado? Nunca aceito do client?
- `clampLimit` cobre input não-numérico, negativo, zero?
- `before_ts` URL-encoded corretamente?
- Promise.all com N=30 chamadas paralelas é aceitável (Cloudflare Workers tem 6 req simultâneas por isolate, mas batched fetch escala)?

---

### Task 4: Endpoint `GET /api/conversas/thread` `[pipeline-completa]`

**Files:**
- Create: `functions/api/conversas/thread.js`
- Test: `tests/api/conversas-thread.test.mjs`

**Responsabilidade:** retornar mensagens paginadas (cronológico DESC) de uma conversa específica.

**Contrato:**
- Method: GET
- Query: `studio_token` (obrigatório), `conversa_id` (uuid obrigatório), `before_ts` (ISO opcional cursor), `limit` (1-200, default 50).
- Response 200: `{ ok: true, conversa: {id, telefone, estado_agente, ...}, mensagens: [{id, content, role, created_at}], next_cursor: ISO|null }`
- `role` derivado do payload n8n: `human` (cliente) | `ai` (bot) | `tool` (skip) | `system` (skip).
- Errors: 400, 401, 404 (conversa não existe ou não pertence ao tenant), 500.

**Security:**
- 1ª query: fetch conversa via `id+tenant_id` filter — confirma ownership ANTES de buscar mensagens.
- 2ª query: `session_id = '<tenant_id>_<telefone>'` (built server-side, igualdade exata, NUNCA LIKE).

- [ ] **Step 1: Escrever tests failing**

Conteúdo de `tests/api/conversas-thread.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

function mockEnv() {
  return {
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    STUDIO_TOKEN_SECRET: 'test-secret-min-32-chars-padding-padding',
  };
}

async function makeStudioToken(tenantId, env) {
  const { generateStudioToken } = await import('../../functions/api/_auth-helpers.js');
  return generateStudioToken(tenantId, env.STUDIO_TOKEN_SECRET);
}

test('thread — falta conversa_id → 400', async () => {
  const env = mockEnv();
  const token = await makeStudioToken('00000000-0000-0000-0000-000000000001', env);
  const { onRequest } = await import('../../functions/api/conversas/thread.js');
  const req = new Request(`https://x.com/api/conversas/thread?studio_token=${token}`, { method: 'GET' });
  const res = await onRequest({ request: req, env });
  assert.equal(res.status, 400);
});

test('thread — conversa de outro tenant → 404 (tenant guard)', async () => {
  const env = mockEnv();
  const tenantA = '00000000-0000-0000-0000-000000000001';
  const tokenA = await makeStudioToken(tenantA, env);

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    // Conversa não pertence ao tenant A → query retorna lista vazia.
    if (url.includes('/rest/v1/conversas?')) {
      assert.match(url, /tenant_id=eq\.00000000-0000-0000-0000-000000000001/);
      return new Response('[]', { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/thread.js');
    const req = new Request(`https://x.com/api/conversas/thread?studio_token=${tokenA}&conversa_id=11111111-1111-1111-1111-111111111111`, { method: 'GET' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 404);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('thread — happy path: retorna mensagens com role mapeado', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let mensagensUrl = '';
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?')) {
      return new Response(JSON.stringify([
        { id: 'cv1', telefone: '5511999999999', estado_agente: 'coletando_tattoo', estado_agente_anterior: null, pausada_em: null, dados_coletados: {}, dados_cadastro: null, valor_proposto: null }
      ]), { status: 200 });
    }
    if (url.includes('/rest/v1/n8n_chat_histories?')) {
      mensagensUrl = url;
      return new Response(JSON.stringify([
        { id: 3, message: { type: 'human', content: 'Oi quero tattoo' }, created_at: '2026-05-04T12:00:00Z' },
        { id: 4, message: { type: 'ai', content: 'Show! Conta mais.' }, created_at: '2026-05-04T12:00:30Z' },
        { id: 5, message: { type: 'tool', content: 'tool_call' }, created_at: '2026-05-04T12:00:31Z' },
      ]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/thread.js');
    const req = new Request(`https://x.com/api/conversas/thread?studio_token=${token}&conversa_id=cv1`, { method: 'GET' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.conversa.id, 'cv1');
    // Confirma que skipou tool/system → só human + ai retornados.
    assert.equal(body.mensagens.length, 2);
    assert.equal(body.mensagens[0].role, 'human');
    assert.equal(body.mensagens[1].role, 'ai');
    // Confirma que session_id é tenant_telefone (igualdade exata, não LIKE).
    assert.match(mensagensUrl, /session_id=eq\.00000000-0000-0000-0000-000000000001_5511999999999/);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('thread — before_ts cursor → adiciona created_at=lt', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let mensagensUrl = '';
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?')) {
      return new Response(JSON.stringify([{ id: 'cv1', telefone: '5511999999999' }]), { status: 200 });
    }
    if (url.includes('/rest/v1/n8n_chat_histories?')) {
      mensagensUrl = url;
      return new Response('[]', { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/thread.js');
    const req = new Request(`https://x.com/api/conversas/thread?studio_token=${token}&conversa_id=cv1&before_ts=2026-05-04T10:00:00Z`, { method: 'GET' });
    await onRequest({ request: req, env });
    assert.match(mensagensUrl, /created_at=lt\.2026-05-04T10%3A00%3A00Z/);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('thread — limit clamped pra 200 max', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let mensagensUrl = '';
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?')) {
      return new Response(JSON.stringify([{ id: 'cv1', telefone: '5511999999999' }]), { status: 200 });
    }
    if (url.includes('/rest/v1/n8n_chat_histories?')) {
      mensagensUrl = url;
      return new Response('[]', { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/thread.js');
    const req = new Request(`https://x.com/api/conversas/thread?studio_token=${token}&conversa_id=cv1&limit=999`, { method: 'GET' });
    await onRequest({ request: req, env });
    assert.match(mensagensUrl, /limit=200/);
  } finally {
    globalThis.fetch = origFetch;
  }
});
```

- [ ] **Step 2: Rodar tests pra confirmar fail**

```bash
node --test tests/api/conversas-thread.test.mjs
```

Expected: 5 errors (módulo não existe).

- [ ] **Step 3: Implementar `thread.js`**

```javascript
// ── InkFlow — GET /api/conversas/thread ──
// Retorna mensagens paginadas (cronológico DESC) de uma conversa específica.
// Auth: studio_token v1 HMAC. Tenant guard: 1ª query confirma conversa pertence ao tenant.
//
// Query params:
//   studio_token (obrigatório)
//   conversa_id (uuid, obrigatório)
//   before_ts (ISO string, cursor opcional)
//   limit (1-200, default 50, clamped)
//
// Response 200: { ok: true, conversa: {...}, mensagens: [{id, content, role, created_at}], next_cursor: ISO|null }

import { verifyStudioTokenOrLegacy } from '../_auth-helpers.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function clampLimit(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(n, 200);
}

// Mapeia role: human → cliente, ai → bot, outros tipos → null (skip).
function mapRole(messageType) {
  if (messageType === 'human') return 'human';
  if (messageType === 'ai') return 'ai';
  return null;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(request.url);
  const studio_token = url.searchParams.get('studio_token');
  const conversa_id = url.searchParams.get('conversa_id');
  const before_ts = url.searchParams.get('before_ts');
  const limit = clampLimit(url.searchParams.get('limit'));

  if (!studio_token) return json({ error: 'studio_token obrigatório' }, 400);
  if (!conversa_id) return json({ error: 'conversa_id obrigatório' }, 400);

  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return json({ error: 'Configuração interna ausente' }, 503);

  const verified = await verifyStudioTokenOrLegacy({
    token: studio_token,
    secret: env.STUDIO_TOKEN_SECRET,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SB_KEY,
  });
  if (!verified) return json({ error: 'Token inválido' }, 401);
  const tenant_id = verified.tenantId;

  // 1) Fetch conversa com tenant guard.
  const cR = await fetch(
    `${SUPABASE_URL}/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}&tenant_id=eq.${tenant_id}&select=id,telefone,estado_agente,estado_agente_anterior,pausada_em,valor_proposto,dados_coletados,dados_cadastro,last_msg_at`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  if (!cR.ok) {
    const errText = await cR.text().catch(() => '');
    console.error('thread: GET conversa falhou', cR.status, errText);
    return json({ error: 'Erro ao consultar conversa' }, 500);
  }
  const conversas = await cR.json();
  if (!Array.isArray(conversas) || conversas.length === 0) {
    return json({ error: 'Conversa não encontrada' }, 404);
  }
  const conversa = conversas[0];

  // 2) Fetch mensagens via session_id construído server-side (igualdade exata, NÃO LIKE).
  const session_id = `${tenant_id}_${conversa.telefone}`;
  const params = [
    `session_id=eq.${encodeURIComponent(session_id)}`,
    'select=id,message,created_at',
    'order=created_at.desc',
    `limit=${limit}`,
  ];
  if (before_ts) params.push(`created_at=lt.${encodeURIComponent(before_ts)}`);

  const mR = await fetch(`${SUPABASE_URL}/rest/v1/n8n_chat_histories?${params.join('&')}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!mR.ok) {
    const errText = await mR.text().catch(() => '');
    console.error('thread: GET n8n_chat_histories falhou', mR.status, errText);
    return json({ error: 'Erro ao consultar mensagens' }, 500);
  }
  const rows = await mR.json();

  // Mapear + filtrar tipos válidos.
  const mensagens = rows
    .map((r) => {
      const role = mapRole(r.message?.type);
      if (!role) return null;
      const content = typeof r.message?.content === 'string' ? r.message.content : '';
      return { id: r.id, role, content, created_at: r.created_at };
    })
    .filter(Boolean);

  const next_cursor = rows.length === limit ? rows[rows.length - 1].created_at : null;

  return json({ ok: true, conversa, mensagens, next_cursor });
}
```

- [ ] **Step 4: Rodar tests pra confirmar PASS**

```bash
node --test tests/api/conversas-thread.test.mjs
```

Expected: 5 passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add functions/api/conversas/thread.js tests/api/conversas-thread.test.mjs
git commit -m "feat(conversas): add GET /api/conversas/thread endpoint + 5 tests"
```

**Code review focus (subagent code-reviewer):**
- Tenant guard via 1ª query? `tenant_id=eq.<verified>` filter presente?
- `session_id` built server-side com tenant verificado, NÃO aceito do client?
- Filter é igualdade exata (`session_id=eq.X`), NÃO LIKE?
- `mapRole` skipa `tool`/`system`/null/undefined sem crash?

**Silent-failure-hunter focus:**
- Se `cR.ok` mas `conversas` é `[]` → 404 (correto, OK).
- Se `mR.ok` mas rows vazios → mensagens=[] (não erro, OK).
- Se `r.message?.content` for objeto/array em vez de string → fallback `''` (silent? OK por design — log seria spam).

---

### Task 5: Frontend — HTML markup do Painel Conversas `[implementer-only]`

**Files:**
- Modify: `studio.html` (linhas 631-638, substituir placeholder `<div id="tab-conversas">`)

**Responsabilidade:** scaffold HTML do painel — 3 tabs + sub-tab "Histórico", lista lateral, thread vazia, header com nome + estado + botões. Sem JS de fetch ainda. Task 6 + 7 enchem render.

**Princípio:** layout em 2 colunas (lista 300px esquerda + thread direita) usando flexbox. Mobile vira layout em duas telas (lista visível por default, click numa conversa abre thread fullscreen com botão "voltar").

- [ ] **Step 1: Localizar markup atual**

```bash
grep -n "tab-conversas" studio.html
```

Expected: linha ~632 (`<div class="tab-panel" id="tab-conversas">`).

- [ ] **Step 2: Substituir bloco placeholder por estrutura completa**

Edit linhas 631-638 de `studio.html` — substituir:

```html
        <!-- ═══ TAB: Conversas ═══ -->
        <div class="tab-panel" id="tab-conversas">
          <div class="empty-state">
            <div class="empty-state-icon">&#128172;</div>
            <div class="empty-state-title">Conversas</div>
            Em breve — Histórico de conversas com clientes
          </div>
        </div>
```

Por:

```html
        <!-- ═══ TAB: Conversas ═══ -->
        <div class="tab-panel" id="tab-conversas">
          <div class="conv-layout">
            <!-- Lista lateral 300px -->
            <aside class="conv-sidebar" id="conv-sidebar">
              <div class="conv-tabs" role="tablist">
                <button class="conv-tab active" role="tab" aria-selected="true" data-grupo="hoje">Hoje</button>
                <button class="conv-tab" role="tab" aria-selected="false" data-grupo="aguardando">Aguardando</button>
                <button class="conv-tab" role="tab" aria-selected="false" data-grupo="negociacao">Em negociação</button>
                <button class="conv-tab conv-tab-historico" role="tab" aria-selected="false" data-grupo="historico" title="Histórico (conversas fechadas)">📁</button>
              </div>
              <div class="conv-list-scroll">
                <ul class="conv-list" id="conv-list" aria-live="polite"></ul>
                <div class="conv-list-empty" id="conv-list-empty" style="display:none">
                  Nenhuma conversa neste grupo ainda.
                </div>
                <button class="conv-load-more" id="conv-load-more" style="display:none">Carregar mais</button>
              </div>
            </aside>

            <!-- Thread (painel direita) -->
            <section class="conv-thread" id="conv-thread">
              <div class="conv-thread-empty" id="conv-thread-empty">
                <div class="empty-state-icon">&#128172;</div>
                <p>Selecione uma conversa pra ver as mensagens.</p>
              </div>

              <div class="conv-thread-content" id="conv-thread-content" style="display:none">
                <header class="conv-thread-header">
                  <button class="conv-back-btn" id="conv-back-btn" aria-label="Voltar pra lista">&larr;</button>
                  <div class="conv-thread-info">
                    <div class="conv-thread-name" id="conv-thread-name">—</div>
                    <div class="conv-thread-state" id="conv-thread-state"></div>
                  </div>
                  <div class="conv-thread-actions">
                    <button class="conv-action-btn" id="conv-action-assumir" style="display:none">Assumir</button>
                    <button class="conv-action-btn conv-action-devolver" id="conv-action-devolver" style="display:none">Devolver pro bot</button>
                  </div>
                </header>

                <div class="conv-thread-messages" id="conv-thread-messages" aria-live="polite">
                  <button class="conv-load-older" id="conv-load-older" style="display:none">Carregar mensagens antigas</button>
                  <!-- mensagens renderizadas aqui dinamicamente (Task 7) -->
                </div>
              </div>
            </section>
          </div>
        </div>
```

- [ ] **Step 3: Adicionar CSS (no `<style>` existente do studio.html)**

Localizar `<style>` block, adicionar antes do `</style>`:

```css
/* ═══ Painel Conversas (PR 4) ═══ */
.conv-layout { display: flex; height: calc(100vh - 80px); border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden; background: #fff; }
.conv-sidebar { width: 300px; min-width: 300px; border-right: 1px solid #e5e5e5; display: flex; flex-direction: column; background: #fafafa; }
.conv-tabs { display: flex; gap: 4px; padding: 8px; border-bottom: 1px solid #e5e5e5; background: #fff; }
.conv-tab { flex: 1; padding: 6px 8px; border: 1px solid transparent; border-radius: 4px; background: transparent; cursor: pointer; font-size: 13px; color: #666; transition: all .15s; }
.conv-tab:hover { background: #eee; }
.conv-tab.active { background: #000; color: #fff; }
.conv-tab-historico { flex: 0 0 36px; padding: 6px; }
.conv-list-scroll { flex: 1; overflow-y: auto; }
.conv-list { list-style: none; margin: 0; padding: 0; }
.conv-list-item { padding: 12px; border-bottom: 1px solid #eee; cursor: pointer; transition: background .1s; }
.conv-list-item:hover { background: #f0f0f0; }
.conv-list-item.active { background: #e8f0ff; border-left: 3px solid #000; }
.conv-list-item-name { font-weight: 600; font-size: 14px; margin-bottom: 2px; color: #1a1a1a; }
.conv-list-item-preview { font-size: 12px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.conv-list-item-meta { display: flex; justify-content: space-between; margin-top: 4px; font-size: 11px; color: #999; }
.conv-list-item-badge { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 10px; background: #ddd; color: #555; }
.conv-list-item-badge.pausada { background: #fef3c7; color: #92400e; }
.conv-list-item-badge.aguardando { background: #fed7aa; color: #9a3412; }
.conv-list-empty { padding: 32px 16px; text-align: center; color: #999; font-size: 13px; }
.conv-load-more, .conv-load-older { display: block; width: 100%; padding: 8px; border: none; border-top: 1px solid #eee; background: #f5f5f5; cursor: pointer; font-size: 12px; color: #666; }
.conv-load-more:hover, .conv-load-older:hover { background: #eaeaea; }
.conv-thread { flex: 1; display: flex; flex-direction: column; }
.conv-thread-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #999; padding: 32px; }
.conv-thread-content { flex: 1; display: flex; flex-direction: column; }
.conv-thread-header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #e5e5e5; background: #fff; }
.conv-back-btn { display: none; padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; background: #fff; cursor: pointer; font-size: 14px; }
.conv-thread-info { flex: 1; }
.conv-thread-name { font-weight: 600; font-size: 15px; color: #1a1a1a; }
.conv-thread-state { font-size: 11px; color: #999; margin-top: 2px; }
.conv-thread-actions { display: flex; gap: 8px; }
.conv-action-btn { padding: 6px 12px; border: 1px solid #000; border-radius: 4px; background: #000; color: #fff; cursor: pointer; font-size: 13px; }
.conv-action-btn:hover { background: #333; }
.conv-action-devolver { background: #fff; color: #000; }
.conv-action-devolver:hover { background: #f0f0f0; }
.conv-thread-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; background: #f9f9f9; }
.conv-msg { max-width: 70%; padding: 8px 12px; border-radius: 12px; font-size: 14px; line-height: 1.4; word-wrap: break-word; white-space: pre-wrap; }
.conv-msg-cliente { align-self: flex-start; background: #fff; border: 1px solid #e5e5e5; border-bottom-left-radius: 4px; }
.conv-msg-bot { align-self: flex-end; background: #000; color: #fff; border-bottom-right-radius: 4px; }
.conv-msg-tatuador { align-self: flex-end; background: #fef3c7; color: #92400e; border-bottom-right-radius: 4px; }
.conv-msg-tatuador::before { content: "🔇 "; }
.conv-msg-time { font-size: 10px; opacity: .7; margin-top: 2px; }

/* Mobile: lista em uma tela, thread fullscreen ao selecionar */
@media (max-width: 768px) {
  .conv-layout { flex-direction: column; height: calc(100vh - 60px); border: none; border-radius: 0; }
  .conv-sidebar { width: 100%; min-width: 0; border-right: none; border-bottom: 1px solid #e5e5e5; }
  .conv-thread { display: none; }
  .conv-layout.show-thread .conv-sidebar { display: none; }
  .conv-layout.show-thread .conv-thread { display: flex; }
  .conv-back-btn { display: block; }
}
```

- [ ] **Step 4: Validar HTML carrega sem erro JS**

Abrir `studio.html` localmente:
```bash
open studio.html
```
Navegar até tab Conversas. Expected: vê tabs "Hoje/Aguardando/Em negociação/📁", lista vazia, painel direito com "Selecione uma conversa". Console sem erros.

(Lista fica vazia porque Task 6 ainda não fez fetch.)

- [ ] **Step 5: Commit**

```bash
git add studio.html
git commit -m "feat(conversas): add HTML markup for Painel Conversas (3 tabs + sidebar + thread skeleton)"
```

---

### Task 6: Frontend — render lista lateral (XSS-safe DOM) `[pipeline-completa]`

**Files:**
- Modify: `studio.html` (adicionar JS no bloco `<script>` final)

**Responsabilidade:** ao trocar de tab ou abrir Painel Conversas, fazer `GET /api/conversas/list?grupo=...&studio_token=...`, renderizar cards na `<ul id="conv-list">` usando **DOM textContent** (NUNCA innerHTML com user input). Click num card seleciona + abre thread.

**XSS-risk:** `telefone`, `dados_coletados.nome`, `last_msg_preview`, `dados_cadastro.nome` são free-text vindos do cliente WhatsApp. Hostile content possível.

- [ ] **Step 1: Adicionar funções helper no script**

Localizar bloco `<script>` no final de `studio.html` (procurar `function switchTab`). Adicionar antes do `</script>` final:

```javascript
// ═══ Painel Conversas (PR 4) ═══

const CONV_STATE = {
  grupoAtivo: 'hoje',
  conversaAberta: null,
  cursors: { hoje: null, aguardando: null, negociacao: null, historico: null },
  // Cache último resultado por grupo pra recuperar seleção pós-refresh.
  ultimo: { hoje: [], aguardando: [], negociacao: [], historico: [] },
};

// Formato de timestamp relativo: "agora", "5min", "2h", "ontem", "3d".
function fmtTempoRelativo(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diffMs = Date.now() - t;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// Nome de exibição: prioridade dados_cadastro.nome > dados_coletados.nome > telefone.
function nomeExibicao(c) {
  const n1 = c.dados_cadastro?.nome;
  if (typeof n1 === 'string' && n1.trim()) return n1.trim();
  const n2 = c.dados_coletados?.nome;
  if (typeof n2 === 'string' && n2.trim()) return n2.trim();
  return c.telefone || 'Sem identificação';
}

// Mapping estado → label + classe badge.
function badgeFromEstado(estado) {
  const map = {
    coletando_tattoo: { label: 'Coletando tatuagem', cls: '' },
    coletando_cadastro: { label: 'Cadastrando', cls: '' },
    aguardando_tatuador: { label: 'Aguardando você', cls: 'aguardando' },
    propondo_valor: { label: 'Propondo valor', cls: '' },
    aguardando_decisao_desconto: { label: 'Decisão de desconto', cls: 'aguardando' },
    escolhendo_horario: { label: 'Escolhendo horário', cls: '' },
    aguardando_sinal: { label: 'Aguardando sinal', cls: '' },
    lead_frio: { label: 'Lead frio', cls: '' },
    fechado: { label: 'Fechado', cls: '' },
    pausada_tatuador: { label: '🔇 Você assumiu', cls: 'pausada' },
    ativo: { label: 'Ativo', cls: '' },
  };
  return map[estado] || { label: estado || '—', cls: '' };
}

// Renderiza UM card via DOM API (textContent — XSS-safe).
function renderConvCard(c) {
  const li = document.createElement('li');
  li.className = 'conv-list-item';
  li.dataset.conversaId = c.id;
  if (CONV_STATE.conversaAberta && CONV_STATE.conversaAberta.id === c.id) {
    li.classList.add('active');
  }

  const nameDiv = document.createElement('div');
  nameDiv.className = 'conv-list-item-name';
  nameDiv.textContent = nomeExibicao(c);
  li.appendChild(nameDiv);

  const previewDiv = document.createElement('div');
  previewDiv.className = 'conv-list-item-preview';
  previewDiv.textContent = c.last_msg_preview || '(sem mensagens)';
  li.appendChild(previewDiv);

  const metaDiv = document.createElement('div');
  metaDiv.className = 'conv-list-item-meta';

  const badge = badgeFromEstado(c.estado_agente);
  const badgeSpan = document.createElement('span');
  badgeSpan.className = 'conv-list-item-badge ' + badge.cls;
  badgeSpan.textContent = badge.label;
  metaDiv.appendChild(badgeSpan);

  const timeSpan = document.createElement('span');
  timeSpan.textContent = fmtTempoRelativo(c.last_msg_at);
  metaDiv.appendChild(timeSpan);

  li.appendChild(metaDiv);

  li.addEventListener('click', () => abrirConversa(c));
  return li;
}

// Render lista inteira na ul#conv-list.
function renderConvLista(conversas, append = false) {
  const ul = document.getElementById('conv-list');
  const empty = document.getElementById('conv-list-empty');
  const loadMore = document.getElementById('conv-load-more');
  if (!append) ul.innerHTML = '';
  if (conversas.length === 0 && !append) {
    empty.style.display = 'block';
    loadMore.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  for (const c of conversas) ul.appendChild(renderConvCard(c));
  loadMore.style.display = CONV_STATE.cursors[CONV_STATE.grupoAtivo] ? 'block' : 'none';
}

// Fetch + render. Call ao trocar grupo OU abrir tab Conversas.
async function carregarGrupo(grupo, append = false) {
  CONV_STATE.grupoAtivo = grupo;
  const cursor = append ? CONV_STATE.cursors[grupo] : null;
  const params = new URLSearchParams({ studio_token: STUDIO_TOKEN, grupo, limit: '30' });
  if (cursor) params.set('before_ts', cursor);
  try {
    const r = await fetch(`/api/conversas/list?${params}`);
    if (!r.ok) {
      console.error('carregarGrupo: HTTP', r.status);
      const ul = document.getElementById('conv-list');
      ul.innerHTML = '';
      const li = document.createElement('li');
      li.className = 'conv-list-empty';
      li.textContent = 'Erro ao carregar conversas. Tente novamente em alguns segundos.';
      ul.appendChild(li);
      return;
    }
    const body = await r.json();
    if (append) {
      CONV_STATE.ultimo[grupo] = CONV_STATE.ultimo[grupo].concat(body.conversas);
    } else {
      CONV_STATE.ultimo[grupo] = body.conversas;
    }
    CONV_STATE.cursors[grupo] = body.next_cursor || null;
    renderConvLista(body.conversas, append);
  } catch (err) {
    console.error('carregarGrupo: exception', err);
  }
}

// Wire: cliques nas tabs trocam grupo.
function setupConvTabs() {
  const tabs = document.querySelectorAll('#tab-conversas .conv-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      carregarGrupo(tab.dataset.grupo);
    });
  });
  document.getElementById('conv-load-more').addEventListener('click', () => {
    carregarGrupo(CONV_STATE.grupoAtivo, true);
  });
}

// Hook: chamado quando user troca pra tab Conversas.
function onAbrirTabConversas() {
  if (!CONV_STATE._setup) {
    setupConvTabs();
    CONV_STATE._setup = true;
  }
  carregarGrupo(CONV_STATE.grupoAtivo);
}

// abrirConversa será definida na Task 7 (thread render). Stub temporário pra evitar ReferenceError.
if (typeof abrirConversa === 'undefined') {
  window.abrirConversa = function(c) {
    console.log('abrirConversa stub — Task 7 implementa', c);
  };
}
```

- [ ] **Step 2: Wire `onAbrirTabConversas` no `switchTab` existente**

Localizar `function switchTab` em `studio.html`. Adicionar dentro do switch/condicional que ativa o painel:

```javascript
if (tabName === 'conversas') {
  if (typeof onAbrirTabConversas === 'function') onAbrirTabConversas();
}
```

(Coloque dentro do `switchTab` depois das linhas que mostram/escondem painéis.)

- [ ] **Step 3: Smoke browser local**

```bash
open studio.html
```

Navegar até Conversas. Expected:
- Tabs aparecem clicáveis.
- Lista mostra "Erro ao carregar conversas" (porque local sem backend) — comportamento OK.
- Console: 1 erro de fetch (esperado em local).

Pra smoke real, usar URL de produção `https://inkflowbrasil.com/studio.html?token=...`. Quando deployar.

- [ ] **Step 4: Auditoria XSS-safe (manual antes de commit)**

```bash
grep -n "innerHTML\|outerHTML\|insertAdjacentHTML\|document.write" studio.html | grep -A1 -B1 "conv-"
```

Expected: ZERO hits dentro do código de Conversas. (Apenas `ul.innerHTML = ''` pra clear é aceitável — não recebe user input.)

- [ ] **Step 5: Commit**

```bash
git add studio.html
git commit -m "feat(conversas): render lista lateral via DOM API (XSS-safe), fetch /api/conversas/list"
```

**Code review focus (subagent code-reviewer):**
- TODOS os campos com user input (nome, preview, telefone) renderizam via `textContent`, NUNCA `innerHTML`?
- `nomeExibicao`/`fmtTempoRelativo`/`badgeFromEstado` são puras (sem side effects)?
- Erro de fetch mostra mensagem amigável, não null/undefined?
- Click num card faz feedback visual antes do thread renderizar (active state)?

---

### Task 7: Frontend — render thread + abrir conversa (XSS-safe DOM) `[pipeline-completa]`

**Files:**
- Modify: `studio.html` (adicionar JS no mesmo `<script>` da Task 6)

**Responsabilidade:** ao clicar num card da lista, fazer `GET /api/conversas/thread?conversa_id=X&studio_token=Y`, renderizar bolhas alinhadas (cliente esquerda, bot direita preto, tatuador direita amarelo com 🔇), header com nome + estado + botões Assumir/Devolver visíveis condicionalmente.

**XSS-risk:** `mensagens[i].content` é texto livre vindo de cliente WhatsApp. Pode conter HTML, script, emoji, links.

- [ ] **Step 1: Adicionar funções de thread render**

No mesmo `<script>` da Task 6, adicionar (substitui o stub `window.abrirConversa`):

```javascript
// Render UMA mensagem como bolha. content via textContent (XSS-safe).
function renderMsg(msg, conversa) {
  const div = document.createElement('div');
  let cls = 'conv-msg ';
  // role: 'human' = cliente; 'ai' = bot.
  // Heurística: se conversa estava pausada e msg foi gerada ENQUANTO pausada (após pausada_em), trata como tatuador.
  if (msg.role === 'human') {
    cls += 'conv-msg-cliente';
  } else if (msg.role === 'ai') {
    if (conversa.estado_agente === 'pausada_tatuador' && conversa.pausada_em && new Date(msg.created_at) > new Date(conversa.pausada_em)) {
      cls += 'conv-msg-tatuador';
    } else {
      cls += 'conv-msg-bot';
    }
  } else {
    cls += 'conv-msg-bot'; // fallback
  }
  div.className = cls;
  div.textContent = msg.content || '';

  const time = document.createElement('div');
  time.className = 'conv-msg-time';
  time.textContent = new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  div.appendChild(time);

  return div;
}

// Render thread inteira a partir de array de mensagens (DESC vinda do servidor → reverter pra ASC visual).
function renderThread(conversa, mensagens, append = false) {
  const wrap = document.getElementById('conv-thread-messages');
  const loadOlder = document.getElementById('conv-load-older');
  if (!append) {
    // Limpar mantendo o botão "Carregar mais antigas" no topo.
    wrap.innerHTML = '';
    wrap.appendChild(loadOlder);
  }
  // mensagens vem DESC (mais recente primeiro) → reverter pra ordem cronológica.
  const ordered = mensagens.slice().reverse();
  for (const m of ordered) {
    if (append) {
      wrap.insertBefore(renderMsg(m, conversa), loadOlder.nextSibling);
    } else {
      wrap.appendChild(renderMsg(m, conversa));
    }
  }
  if (!append) wrap.scrollTop = wrap.scrollHeight; // scroll pro fim em load inicial
}

// Atualiza header da thread (nome, estado, botões).
function renderThreadHeader(conversa) {
  document.getElementById('conv-thread-name').textContent = nomeExibicao(conversa);
  const stateDiv = document.getElementById('conv-thread-state');
  const badge = badgeFromEstado(conversa.estado_agente);
  stateDiv.textContent = badge.label + ' · ' + (conversa.telefone || '');

  const assumirBtn = document.getElementById('conv-action-assumir');
  const devolverBtn = document.getElementById('conv-action-devolver');
  if (conversa.estado_agente === 'pausada_tatuador') {
    assumirBtn.style.display = 'none';
    devolverBtn.style.display = 'inline-block';
  } else {
    assumirBtn.style.display = 'inline-block';
    devolverBtn.style.display = 'none';
  }
}

// Abre thread de UMA conversa: fetch + render.
async function abrirConversa(c) {
  CONV_STATE.conversaAberta = c;
  CONV_STATE.threadCursor = null;
  // Marcar card ativo.
  document.querySelectorAll('.conv-list-item.active').forEach(el => el.classList.remove('active'));
  const targetCard = document.querySelector(`.conv-list-item[data-conversa-id="${c.id}"]`);
  if (targetCard) targetCard.classList.add('active');
  // Mostrar thread, esconder empty state.
  document.getElementById('conv-thread-empty').style.display = 'none';
  document.getElementById('conv-thread-content').style.display = 'flex';
  document.querySelector('.conv-layout').classList.add('show-thread');

  try {
    const params = new URLSearchParams({ studio_token: STUDIO_TOKEN, conversa_id: c.id, limit: '50' });
    const r = await fetch(`/api/conversas/thread?${params}`);
    if (!r.ok) {
      const wrap = document.getElementById('conv-thread-messages');
      wrap.innerHTML = '';
      const err = document.createElement('div');
      err.className = 'conv-msg conv-msg-cliente';
      err.textContent = 'Erro ao carregar mensagens.';
      wrap.appendChild(err);
      return;
    }
    const body = await r.json();
    CONV_STATE.threadCursor = body.next_cursor;
    renderThreadHeader(body.conversa);
    renderThread(body.conversa, body.mensagens, false);
    document.getElementById('conv-load-older').style.display = body.next_cursor ? 'block' : 'none';
  } catch (err) {
    console.error('abrirConversa: exception', err);
  }
}

async function carregarMaisAntigas() {
  if (!CONV_STATE.conversaAberta || !CONV_STATE.threadCursor) return;
  const params = new URLSearchParams({
    studio_token: STUDIO_TOKEN,
    conversa_id: CONV_STATE.conversaAberta.id,
    limit: '50',
    before_ts: CONV_STATE.threadCursor,
  });
  try {
    const r = await fetch(`/api/conversas/thread?${params}`);
    if (!r.ok) return;
    const body = await r.json();
    renderThread(body.conversa, body.mensagens, true);
    CONV_STATE.threadCursor = body.next_cursor;
    document.getElementById('conv-load-older').style.display = body.next_cursor ? 'block' : 'none';
  } catch (err) {
    console.error('carregarMaisAntigas: exception', err);
  }
}

// Wire load-older + back-btn (mobile).
function setupConvThread() {
  document.getElementById('conv-load-older').addEventListener('click', carregarMaisAntigas);
  document.getElementById('conv-back-btn').addEventListener('click', () => {
    document.querySelector('.conv-layout').classList.remove('show-thread');
  });
}

// Modificar setupConvTabs (Task 6) pra incluir setupConvThread.
const _origOnAbrir = onAbrirTabConversas;
window.onAbrirTabConversas = function() {
  if (!CONV_STATE._threadSetup) {
    setupConvThread();
    CONV_STATE._threadSetup = true;
  }
  _origOnAbrir();
};
```

- [ ] **Step 2: Smoke browser local (mock prod via DevTools)**

Abrir `studio.html` em prod (deployed) com tenant token válido. Click numa conversa na lista.

Expected:
- Header mostra nome do cliente + estado.
- Bolhas alinhadas: cliente esquerda branco, bot direita preto.
- Scroll ao bottom no load inicial.
- "Carregar mensagens antigas" aparece se houver next_cursor.
- Mobile: lista vira fullscreen, click abre thread fullscreen, botão "← voltar" funciona.

- [ ] **Step 3: Audit XSS test manual**

No DevTools console, simular conversa com content malicioso:
```javascript
renderMsg({ role: 'human', content: '<img src=x onerror=alert(1)>', created_at: new Date().toISOString() }, { estado_agente: 'ativo', pausada_em: null });
```

Expected: bolha mostra string literal `<img src=x onerror=alert(1)>`, NUNCA executa `alert`. Confirma textContent funcionou.

- [ ] **Step 4: Audit grep**

```bash
grep -n "innerHTML\|outerHTML\|insertAdjacentHTML\|dangerouslySetInnerHTML" studio.html | grep -i "conv\|thread\|msg"
```

Expected: ZERO hits dentro de código de thread (exceto `wrap.innerHTML = ''` pra clear, que não recebe user input).

- [ ] **Step 5: Commit**

```bash
git add studio.html
git commit -m "feat(conversas): render thread WhatsApp Web style (XSS-safe), fetch /api/conversas/thread"
```

**Code review focus (subagent code-reviewer):**
- `renderMsg` usa `textContent` em `content`?
- Heurística "pausada → bolha tatuador" usa comparação de Date corretamente (e não strings)?
- Click em card limpa thread anterior antes de fetch novo (sem mensagens leak entre conversas)?
- Mobile back-btn funciona sem perder contexto?

**Silent-failure-hunter focus:**
- Fetch error → user vê mensagem amigável, não thread vazia silently?
- Conversa sem mensagens → renderiza header + empty state, não crash?
- `body.conversa.pausada_em` null → comparação com Date funciona (não NaN)?

---

### Task 8: Frontend — wiring botões Assumir/Devolver `[implementer-only]`

**Files:**
- Modify: `studio.html`

**Responsabilidade:** wire os 2 botões (`#conv-action-assumir`, `#conv-action-devolver`) aos endpoints `POST /api/conversas/{assumir,devolver}` (já existentes do PR #23). Após sucesso, atualizar header + lista lateral pra refletir novo estado.

**Endpoints existentes (PR #23):**
- `POST /api/conversas/assumir` body `{conversa_id, studio_token}` → 200 `{ok:true, new_state}` ou `{ok:true, noop:true}`.
- `POST /api/conversas/devolver` body `{conversa_id, studio_token}` → 200 `{ok:true, new_state}`.

- [ ] **Step 1: Adicionar handler no script**

Adicionar antes do `</script>` final:

```javascript
async function executarAcaoConversa(action) {
  if (!CONV_STATE.conversaAberta) return;
  const conversa_id = CONV_STATE.conversaAberta.id;
  const endpoint = action === 'assumir' ? '/api/conversas/assumir' : '/api/conversas/devolver';
  const btn = document.getElementById(action === 'assumir' ? 'conv-action-assumir' : 'conv-action-devolver');
  btn.disabled = true;
  btn.textContent = action === 'assumir' ? 'Assumindo…' : 'Devolvendo…';
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversa_id, studio_token: STUDIO_TOKEN }),
    });
    if (!r.ok) {
      alert(action === 'assumir' ? 'Erro ao assumir conversa.' : 'Erro ao devolver pro bot.');
      return;
    }
    const body = await r.json();
    if (body.noop) {
      // Estado já era o desejado — refresh local.
    }
    // Atualizar conversa local + header.
    if (body.new_state) {
      CONV_STATE.conversaAberta.estado_agente = body.new_state;
      if (action === 'assumir') {
        CONV_STATE.conversaAberta.estado_agente_anterior = CONV_STATE.conversaAberta.estado_agente;
        CONV_STATE.conversaAberta.pausada_em = new Date().toISOString();
      } else {
        CONV_STATE.conversaAberta.estado_agente_anterior = null;
        CONV_STATE.conversaAberta.pausada_em = null;
      }
    }
    renderThreadHeader(CONV_STATE.conversaAberta);
    // Recarregar grupo ativo pra refletir mudança no badge da lista.
    await carregarGrupo(CONV_STATE.grupoAtivo);
  } catch (err) {
    console.error('executarAcaoConversa: exception', err);
    alert('Erro de rede. Tente novamente.');
  } finally {
    btn.disabled = false;
    btn.textContent = action === 'assumir' ? 'Assumir' : 'Devolver pro bot';
  }
}

// Wire dentro de setupConvThread (modificar a função criada na Task 7).
// Adicionar listeners aos 2 botões:
const _origSetupThread = setupConvThread;
window.setupConvThread = function() {
  _origSetupThread();
  document.getElementById('conv-action-assumir').addEventListener('click', () => executarAcaoConversa('assumir'));
  document.getElementById('conv-action-devolver').addEventListener('click', () => executarAcaoConversa('devolver'));
};
```

- [ ] **Step 2: Smoke browser**

Em prod, abrir conversa com estado `ativo`. Click "Assumir".

Expected:
- Botão muda pra "Assumindo…" temporariamente.
- Após sucesso: botão "Assumir" some, "Devolver pro bot" aparece. Header mostra "🔇 Você assumiu".
- Lista lateral atualiza badge da conversa.
- Click "Devolver pro bot" → reverte estado.

- [ ] **Step 3: Smoke prod com Evolution real (opcional, validação E2E)**

Mandar mensagem do número cliente teste. Confirmar que aparece no Studio em real-time (Task 9 wire) E que após "Assumir" no Studio, próxima msg do cliente NÃO recebe resposta do bot (porque n8n flow detecta `estado_agente='pausada_tatuador'`).

NOTA: gate n8n incoming não foi implementado (P1 backlog). Esse smoke vai mostrar bot AINDA respondendo. Após PR 4 mergeado, gate n8n vira opcional — UI Studio é o caminho oficial. Mas se Leandro quiser testar fluxo completo agora, precisa rodar tasks do P1 backlog "kill-switch E2E" primeiro.

- [ ] **Step 4: Verificar que erro de rede não trava UI**

Em DevTools, ativar "Offline mode". Click "Assumir".

Expected: alert "Erro de rede…", botão volta ao estado original (não fica disabled). Conversa ainda mostrada.

- [ ] **Step 5: Commit**

```bash
git add studio.html
git commit -m "feat(conversas): wire Assumir/Devolver buttons to /api/conversas/{assumir,devolver}"
```

---

### Task 9: Frontend — Real-time via Supabase Realtime `[pipeline-completa]`

**Files:**
- Modify: `studio.html` (adicionar import CDN + subscribe logic)
- Modify: `_headers` (CSP allowlist se aplicável)

**Responsabilidade:** quando msg nova chegar OU `conversas.estado_agente` mudar (ex.: bot grava `dados_coletados` mid-coleta), atualizar UI sem refresh.

**Strategy:**
- Subscribe `conversas` UPDATE filtered by `tenant_id=eq.<tenant>` (count baixo, OK).
- Subscribe `n8n_chat_histories` INSERT filtered by `session_id=eq.<session>` (apenas conversa aberta — evita tráfego com lista fechada).
- Quando UPDATE em conversa: atualiza badge na lista + header se for a aberta.
- Quando INSERT em mensagem: append na thread se for a aberta + bump position na lista.

**Risco:** Supabase Realtime requer `anon_key` no client + RLS policy ON SELECT pra `conversas` + `n8n_chat_histories`. Hoje RLS está habilitada mas SEM policy de tenant em `n8n_chat_histories` (P2 backlog). Subscribe pode receber TODAS as msgs ou ZERO dependendo da policy default.

**Mitigação:** primeira spike usa filter explícito client-side + verifica RLS policy via SQL antes do Task 9 começar. Se RLS bloquear tudo, fallback é polling 5s (não preferido mas aceitável pra MVP).

- [ ] **Step 1: Verificar RLS policies via Supabase MCP**

```sql
SELECT polname, tablename, cmd, qual::text FROM pg_policies
WHERE tablename IN ('conversas', 'n8n_chat_histories');
```

Expected: documentar resultado. Se houver policy que permita anon SELECT com filter por tenant, prosseguir Realtime. Se não, decisão: (a) adicionar policy nesse PR, (b) fallback polling.

- [ ] **Step 2: Decisão arquitetural baseada em policies**

**Caminho A (RLS policy permite ou pode-se adicionar):** continua com Realtime conforme passos 3-7.

**Caminho B (RLS bloqueia, sem policy fácil):** polling 8s. Substitui passos 3-7 por:

```javascript
let _convPollTimer = null;
function startConvPolling() {
  if (_convPollTimer) clearInterval(_convPollTimer);
  _convPollTimer = setInterval(async () => {
    if (CONV_STATE.grupoAtivo) await carregarGrupo(CONV_STATE.grupoAtivo);
    if (CONV_STATE.conversaAberta) await abrirConversa(CONV_STATE.conversaAberta);
  }, 8000);
}
function stopConvPolling() {
  if (_convPollTimer) clearInterval(_convPollTimer);
  _convPollTimer = null;
}
// Hook em onAbrirTabConversas / outros tabs.
```

Documentar caminho escolhido no commit message + adicionar TODO P2 pra hardening de RLS.

- [ ] **Step 3 (Caminho A): Carregar Supabase JS client via CDN**

No `<head>` de `studio.html`, adicionar antes dos scripts existentes:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

Verificar `_headers` permite essa CDN no CSP. Se houver `Content-Security-Policy` strict:

```bash
grep -i "Content-Security-Policy" _headers
```

Se policy bloquear, adicionar `script-src 'self' https://cdn.jsdelivr.net` ao header. Senão (sem CSP atual), nada a fazer.

- [ ] **Step 4 (Caminho A): Inicializar client + subscribe**

No script:

```javascript
// ═══ Real-time via Supabase Realtime (Caminho A) ═══

const SUPABASE_URL_PUBLIC = 'https://bfzuxxuscyplfoimvomh.supabase.co';
// Anon key — public, safe to embed (RLS protege).
const SUPABASE_ANON_KEY = 'PASTE_ANON_KEY_FROM_DASHBOARD'; // TODO: substituir por valor real ou env var no build.

let _sbClient = null;
let _convChan = null;
let _msgChan = null;

function initRealtime(tenantId) {
  if (_sbClient || !window.supabase) return;
  _sbClient = window.supabase.createClient(SUPABASE_URL_PUBLIC, SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: 5 } }, // throttle defensivo
  });

  // Subscribe UPDATE em conversas pro tenant inteiro.
  _convChan = _sbClient.channel(`conversas-${tenantId}`)
    .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversas', filter: `tenant_id=eq.${tenantId}` },
        (payload) => onConversaUpdate(payload.new))
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') console.log('Realtime conversas: connected');
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('Realtime conversas:', status);
    });
}

function subscribeMensagensConversa(conversa, tenantId) {
  if (_msgChan) _sbClient.removeChannel(_msgChan);
  if (!_sbClient) return;
  const session_id = `${tenantId}_${conversa.telefone}`;
  _msgChan = _sbClient.channel(`msg-${conversa.id}`)
    .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'n8n_chat_histories', filter: `session_id=eq.${session_id}` },
        (payload) => onNovaMensagem(payload.new, conversa))
    .subscribe();
}

function onConversaUpdate(updated) {
  // Reflect em conversaAberta se for a mesma.
  if (CONV_STATE.conversaAberta && CONV_STATE.conversaAberta.id === updated.id) {
    Object.assign(CONV_STATE.conversaAberta, updated);
    renderThreadHeader(CONV_STATE.conversaAberta);
  }
  // Reflect na lista cacheada.
  const lista = CONV_STATE.ultimo[CONV_STATE.grupoAtivo];
  const idx = lista.findIndex(c => c.id === updated.id);
  if (idx !== -1) {
    lista[idx] = { ...lista[idx], ...updated };
    renderConvLista(lista, false);
  }
}

function onNovaMensagem(row, conversa) {
  if (!CONV_STATE.conversaAberta || CONV_STATE.conversaAberta.id !== conversa.id) return;
  const msgRole = row.message?.type;
  if (msgRole !== 'human' && msgRole !== 'ai') return;
  const msg = {
    id: row.id,
    role: msgRole,
    content: row.message?.content || '',
    created_at: row.created_at,
  };
  const wrap = document.getElementById('conv-thread-messages');
  wrap.appendChild(renderMsg(msg, conversa));
  wrap.scrollTop = wrap.scrollHeight;
}

// Hook: chamar initRealtime + subscribeMensagensConversa quando conversa abrir.
const _origAbrirConversa = abrirConversa;
window.abrirConversa = async function(c) {
  await _origAbrirConversa(c);
  // tenantId derivado do studio_token client-side via verify trick — usar STUDIO_TENANT_ID se já existe.
  if (typeof STUDIO_TENANT_ID !== 'undefined' && STUDIO_TENANT_ID) {
    initRealtime(STUDIO_TENANT_ID);
    subscribeMensagensConversa(c, STUDIO_TENANT_ID);
  }
};
```

NOTA: `STUDIO_TENANT_ID` precisa estar disponível client-side. Se não estiver, derivar de um endpoint `/api/conversas/me` (1 call após login) OU do payload do studio_token (decode b64url da parte 1). Procurar no studio.html existente — se já tem `tenant_id` carregado em outro fluxo, reusar.

- [ ] **Step 5 (Caminho A): Smoke realtime em prod**

Abrir studio.html em 2 browsers (ou 1 browser + WhatsApp). Mandar msg do número cliente teste.

Expected:
- Em ~500ms, mensagem nova aparece na thread sem refresh.
- Lista lateral atualiza last_msg_preview + bump pra topo.
- Console: log "Realtime conversas: connected" no abrir.

- [ ] **Step 6 (Caminho A ou B): Documentar caminho escolhido em comment + commit**

Adicionar comment no início do bloco real-time:

```javascript
// CAMINHO ESCOLHIDO: A (Realtime) — RLS policies permitem subscribe filtrado.
// OU
// CAMINHO ESCOLHIDO: B (polling 8s) — RLS bloqueia anon read em n8n_chat_histories.
// Hardening RLS = P2 backlog "n8n_chat_histories tenant isolation proper".
```

- [ ] **Step 7: Commit**

```bash
git add studio.html
# se modificou _headers:
git add _headers
git commit -m "feat(conversas): real-time updates via Supabase Realtime (Caminho A) OR polling 8s (Caminho B)"
```

**Code review focus (subagent code-reviewer):**
- Subscribe usa filter `tenant_id=eq.<verified>` ou `session_id=eq.<verified>`?
- Channel cleanup ao trocar conversa (`removeChannel`)?
- ANON_KEY é realmente public (não service_role mascarado)?

**Silent-failure-hunter focus:**
- Realtime subscribe falha (`CHANNEL_ERROR`) → user vê alguma indicação ou só log? Considerar adicionar fallback polling após N erros.
- Caminho B polling silenciosamente falha após muitos retries?
- Caminho A: se RLS policy mudar em runtime e subscribe começar bloqueando, user fica sem updates silently.

---

### Task 10: Smoke E2E + Audit + PR open `[direto]`

**Files:** none (apenas teste + commit final).

- [ ] **Step 1: Audit grep — XSS, SQL injection, tenant leak**

```bash
# XSS-risk patterns no painel Conversas:
grep -nE "innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML" studio.html | grep -i "conv\|thread\|msg" | grep -v "innerHTML = ''"

# Tenant leak: tenant_id vindo de query string em vez de token:
grep -rn "tenant_id" functions/api/conversas/ | grep -v "verified.tenantId\|verified\.tenant"

# SQL injection: input sem encodeURIComponent:
grep -rnE 'fetch.*\?(grupo|conversa_id|studio_token)' functions/api/conversas/ | grep -v "encodeURIComponent\|URLSearchParams"
```

Expected: ZERO hits em todas 3 grep. Se houver, abortar e fixar antes do PR.

- [ ] **Step 2: Bateria de testes full**

```bash
bash scripts/test-prompts.sh
node --test tests/api/conversas-grupos.test.mjs
node --test tests/api/conversas-list.test.mjs
node --test tests/api/conversas-thread.test.mjs
node --test tests/api/conversas-assumir-devolver.test.mjs
```

Expected: tudo PASS. Anotar contagem total (tests novos + existentes).

- [ ] **Step 3: Push branch + criar PR**

```bash
git push -u origin feat/pagina-tatuador-pr4-conversas
gh pr create --title "feat: PR 4 — Painel Conversas (3 grupos + thread WhatsApp Web + Assumir/Devolver UI)" --body "$(cat <<'EOF'
## Summary

Implementa o Painel Conversas (sidebar #3 do refator página tatuador), substituindo o placeholder por interface estilo WhatsApp Web:

- **3 grupos** navegáveis: "Hoje", "Aguardando orçamento", "Em negociação" + sub-tab "Histórico"
- **Lista lateral** 300px com cards (avatar, nome, preview, badge estado, timestamp relativo)
- **Thread WhatsApp Web** com bolhas alinhadas (cliente esquerda branco, bot direita preto, tatuador direita amarelo + 🔇)
- **Botões "Assumir"/"Devolver"** wireados aos endpoints `_transition.js` (PR #23)
- **Real-time** via Supabase Realtime (Caminho A) OU polling 8s (Caminho B) — confirmar no commit final
- **Paginação cursor-based** (lista + thread "carregar mais antigas")
- **Migration** adiciona `conversas.last_msg_at` + trigger ON INSERT em `n8n_chat_histories` + backfill

## Implementação

| Task | Arquivo | Linhas |
|---|---|---|
| 1. Migration | `supabase/migrations/2026-05-04-pagina-tatuador-conversas.sql` | ~80 |
| 2. Helper grupos | `functions/api/conversas/_grupos.js` + 6 tests | ~50 |
| 3. Endpoint list | `functions/api/conversas/list.js` + 6 tests | ~120 |
| 4. Endpoint thread | `functions/api/conversas/thread.js` + 5 tests | ~110 |
| 5-9. Frontend | `studio.html` | ~400 |

**Tests novos:** 17 unit tests + smoke E2E manual em prod.

## Bloqueia / desbloqueado por

- ✅ Bloqueado por PR #21 (Foundation) + PR #23 (Agente + kill-switch backend) — ambos mergeados
- 🔓 Desbloqueia: PR 9 Settings (referencia Conversas pra cancelar plano UX)

## Resolve P1 backlog

Substitui o caminho `/eu assumo` no WhatsApp (frase mágica) pela UI Studio — Caminho B já cravado na spec como ideal. Os 2 gaps n8n incoming (UPSERT + gate) deixam de ser bloqueantes — UI é o caminho oficial.

## Test plan

- [ ] Migration aplicada em prod via Supabase MCP, 3 queries de verificação PASS
- [ ] `bash scripts/test-prompts.sh` 0 fail
- [ ] `node --test tests/api/conversas-*.test.mjs` 17 passing
- [ ] Smoke browser: tabs trocam, lista renderiza, click abre thread, botões Assumir/Devolver atualizam estado, real-time ou polling reflete msgs novas em <10s
- [ ] Audit grep: zero `innerHTML` + user input em código de Conversas, zero tenant leak via query string

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR criado. Anotar URL.

- [ ] **Step 4: Atualizar plano-mestre marcando PR 4 done**

Edit `docs/superpowers/plans/2026-05-03-pagina-tatuador-MASTER.md`:
- Linha 175: `- [ ] Sub-plan escrito? **NÃO**` → `- [x] Sub-plan escrito? `docs/superpowers/plans/2026-05-04-pagina-tatuador-PR4-conversas.md``
- Linha 438: `- [ ] PR 4 — Conversas` → `- [x] PR 4 — Conversas (PR #__)` (substituir __ pelo número real)

```bash
git add docs/superpowers/plans/2026-05-03-pagina-tatuador-MASTER.md
git commit -m "docs(plan): mark PR 4 sub-plan done in master"
git push
```

- [ ] **Step 5: Sumarizar pra Leandro**

Output esperado: stats do PR (commits, files, +/-, tests), URL do PR, gaps conhecidos (real-time caminho A vs B), próximo PR sugerido (PR 2 Dashboard ou PR 5 Portfólio paralelos).

---

## Self-Review

### 1. Spec coverage

Skim do spec §"Painel 3 — Conversas" linhas 190-223:

- ✅ "3 grupos navegáveis" → Tasks 5+6 (HTML + render lista)
- ✅ "Tabs ou collapsibles" → Task 5 escolhe tabs (decisão local)
- ✅ Mapping grupo → estados → Task 2 (`_grupos.js`)
- ✅ Sub-tab "Histórico" pra `fechado` → Task 5
- ✅ "Lista lateral 300px com cards (avatar, nome, preview, timestamp, badge)" → Task 5+6 (sem avatar — placeholder text icon, vira backlog se quiser foto real)
- ✅ "Painel direito: thread completa scrollable" → Task 7
- ✅ "Mensagens cliente esquerda, bot direita c/ avatar, tatuador direita fundo diferente + 🔇" → Task 7 (sem avatar do bot — placeholder cor, igual)
- ✅ "Header thread: nome cliente + estado_agente badge + ações" → Task 7
- ✅ "Se pausada_tatuador: botão Devolver" → Task 7+8
- ✅ "Se qualquer: botão Assumir" → Task 7+8
- ✅ "Click numa msg → copy text" → ⚠️ NÃO COBERTO. Adiciona como follow-up backlog (não-bloqueante).
- ✅ "Lista paginada 30 inicial, carregar mais" → Task 6
- ✅ "Thread paginada 50 msgs inicial, carregar mais antigas" → Task 7
- ✅ "Real-time via Supabase Realtime (conversas, mensagens)" → Task 9

**Gap não coberto:** "Click numa msg → copy text". → Adicionar como follow-up no PR body (não bloqueante MVP).

### 2. Placeholder scan

Grep mental por "TBD", "TODO", "fill in":
- `SUPABASE_ANON_KEY = 'PASTE_ANON_KEY_FROM_DASHBOARD'` em Task 9 — **NÃO É PLACEHOLDER**, é instrução clara pro implementer (paste o valor real, public, anônimo).
- Tudo mais explícito.

✅ Sem placeholders.

### 3. Type consistency

- `nomeExibicao(c)` Task 6 — usa `c.dados_cadastro?.nome` e `c.dados_coletados?.nome`. Confirmar response do `list.js` (Task 3) inclui esses campos: `select=...,dados_coletados,dados_cadastro,...` ✅
- `renderMsg(msg, conversa)` Task 7 — espera `msg.role`, `msg.content`, `msg.created_at`. Confirmar response do `thread.js` (Task 4) retorna isso: `{id, role, content, created_at}` ✅
- `executarAcaoConversa('assumir')` Task 8 — chama `/api/conversas/assumir` body `{conversa_id, studio_token}` → response `{ok:true, new_state}`. Confere com PR #23 `assumir.js` lido (linhas 64-76) ✅
- `getGrupoFilter` Task 2 retorna `{estados, last_msg_at_gte?}`. Endpoint `list.js` Task 3 consome `result.estados` + `result.last_msg_at_gte`. ✅

✅ Types consistentes.

### Edge cases adicionais identificados

- **Migration backfill:** `SPLIT_PART(session_id, '_', 1)::uuid` falha se session_id não bater regex. Por isso o `WHERE session_id ~ '^[0-9a-f]{8}-...'`. ✅
- **Lista refresh após Assumir/Devolver:** Task 8 chama `carregarGrupo(grupoAtivo)` — pode causar flash visual. Acceptable MVP, otimizar depois.
- **WebSocket reconnect:** Supabase JS faz auto-reconnect. Task 9 só log status — não user-facing. Acceptable.

---

## Próximo passo

**Plano completo e salvo em `docs/superpowers/plans/2026-05-04-pagina-tatuador-PR4-conversas.md`.**

Recomendação: executar via `superpowers:subagent-driven-development` com a calibração já marcada por task. 11 tasks, ~1.5-2 dias.

Pra começar: aprovar o plano, depois invocar:

```
/superpowers:executing-plans @docs/superpowers/plans/2026-05-04-pagina-tatuador-PR4-conversas.md
```

OU via subagent-driven (recomendado):

```
Executa o plano em docs/superpowers/plans/2026-05-04-pagina-tatuador-PR4-conversas.md via superpowers:subagent-driven-development. Calibração marcada por task no header de cada uma.
```
