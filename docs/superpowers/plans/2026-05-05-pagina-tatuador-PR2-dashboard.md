# PR 2 Dashboard — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`. Steps usam checkbox (`- [ ]`) pra tracking.

**Goal:** Refatorar Painel Dashboard do `studio.html` com 5 KPI cards (Conversas hoje / Orçamentos esta semana / Aguardando sinal / Taxa conversão / Sinal recebido), slot Atividade recente (últimas 3 conversas), slot Resumo semanal IA (cron seg 9h BRT + botão regenerate rate-limit 1×/24h), slot Conectar Telegram condicional (Coleta v2), slot Info estúdio, e header com 2 indicadores (WhatsApp + Telegram).

**Architecture:** 4 endpoints CF Pages em `functions/api/dashboard/` + 1 endpoint cron em `functions/api/cron/resumo-semanal.js` + helper compartilhado de prompt LLM. Frontend modifica `studio.html` substituindo placeholder Dashboard por UI completa. Cron-worker dispatcher central recebe nova entry SCHEDULE_MAP. KPIs SQL leem da view `orcamentos` (criada 2026-05-05 — projeção de `conversas WHERE valor_proposto IS NOT NULL`). Auth via `verifyStudioTokenOrLegacy` HMAC v1, `tenant_id` sempre derivado server-side.

**Tech Stack:** JS ES modules, Node 20+, `node --test`, Supabase via PostgREST, Cloudflare Pages, OpenAI gpt-4o-mini, cron-worker dispatcher.

**Spec:** [`docs/superpowers/specs/2026-05-03-pagina-tatuador-refactor-design.md`](../specs/2026-05-03-pagina-tatuador-refactor-design.md) §"Painel 1 — Dashboard" (linhas 55-125) + §"Critérios de aceitação — Dashboard" (linhas 855-862).

**Plano-mestre:** [`docs/superpowers/plans/2026-05-03-pagina-tatuador-MASTER.md`](2026-05-03-pagina-tatuador-MASTER.md) §"PR 2 Dashboard" (linhas 88-122).

---

## Pre-conditions

1. **PR 1 Foundation mergeado** (#21 squash `0dcecd3`) — sidebar 8 painéis criada, "Artistas" eliminado, placeholder Dashboard existe pronto pra substituição.
2. **PR 4 Conversas mergeado** (#24 squash `90a8c2e`) — `conversas.last_msg_at` + trigger ON INSERT em `n8n_chat_histories` existe (KPI K1 + slot Atividade recente usam esse campo).
3. **PR 4.1 Fix grupos mergeado** (#25 squash `a6ecd3f`) — helper `markConversaFechada` grava `dados_coletados.fechado_motivo` + `fechado_em` (KPIs K4/K5 usam esses campos via view `orcamentos`).
4. **View `orcamentos` criada** (2026-05-05 via `apply_migration 2026_05_05_create_orcamentos_view`) — 1 fonte de verdade, projeta conversas com `valor_proposto IS NOT NULL`, status derivado de `estado_agente + dados_coletados.fechado_motivo`. KPIs SQL leem dela direto.
5. **Modo Coleta v2 deployed** (PRs #19+#20) — `tenants.tatuador_telegram_chat_id`, `conversas.valor_proposto`, `conversas.dados_coletados`, bot `@inkflow_studio_bot` ativo.
6. **Branch:** `feat/pagina-tatuador-pr2-dashboard` saindo de `main`.
7. **Bateria de testes existente verde** (`bash scripts/test-prompts.sh` passa 100%).

---

## Decisões de design pré-resolvidas

1. **View `orcamentos`** já criada — KPIs SQL leem dela como se fosse tabela. Reversível via `DROP VIEW IF EXISTS orcamentos`.
2. **LLM:** `gpt-4o-mini` via `OPENAI_API_KEY` env var (já existe em CF Pages prod). ~$0.0006/call × 100 tenants × 4-5x/mês = ~$1.80/mês. Trocar pra Claude Haiku 4.5 = env var change futura.
3. **Cron pattern:** dispatcher central `cron-worker/src/index.js` (SCHEDULE_MAP entry) + endpoint CF Pages `functions/api/cron/resumo-semanal.js` (Bearer `CRON_SECRET`). NÃO `cron-worker/src/jobs/` (que não existe e quebraria pattern).
4. **Auth:** `verifyStudioTokenOrLegacy` (HMAC v1) pros endpoints `/api/dashboard/*`. `tenant_id` derivado SEMPRE de `verified.tenantId` (NUNCA query param). Pattern do PR 4.
5. **Cálculo BRT:** UTC-3 ano-redondo (sem DST desde 2019). Helpers `todayStartBrt()` e `weekStartBrt()` retornam ISO strings em UTC. Edge case: se UTC < 03:00, "hoje BRT" ainda é dia anterior.
6. **Header indicators escopo:** `whatsapp_status` (já existe em `tenants`), Telegram derivado de `tatuador_telegram_chat_id IS NOT NULL`. Modo Exato esconde indicador Telegram (já cravado no spec linha 122).

---

## File Structure

### Criar

```
supabase/migrations/2026-05-05-pr2-dashboard.sql        ← ADD tenants.resumo_semanal_*
functions/_lib/dashboard-time.js                         ← helpers BRT (todayStartBrt, weekStartBrt)
functions/_lib/resumo-semanal-prompt.js                  ← LLM call helper + prompt builder
functions/api/dashboard/kpis.js                          ← GET 5 KPIs
functions/api/dashboard/atividade-recente.js             ← GET últimas 3 conversas
functions/api/dashboard/regenerate-resumo-semanal.js     ← POST rate-limit 1×/24h
functions/api/cron/resumo-semanal.js                     ← POST cron handler (loop tenants)
tests/_lib/dashboard-time.test.mjs
tests/_lib/resumo-semanal-prompt.test.mjs
tests/api/dashboard-kpis.test.mjs
tests/api/dashboard-atividade-recente.test.mjs
tests/api/dashboard-regenerate-resumo.test.mjs
tests/api/cron-resumo-semanal.test.mjs
```

### Modificar

```
studio.html                  ← Dashboard tab: substituir placeholder por UI completa + header indicators
cron-worker/wrangler.toml    ← adicionar trigger `0 12 * * 1` (seg 09:00 BRT = 12:00 UTC)
cron-worker/src/index.js     ← adicionar SCHEDULE_MAP entry pro novo cron
scripts/test-prompts.sh      ← adicionar 6 novos test files no runner
```

---

## Fase 0 — Pre-flight

### Task 0.1: Branch + baseline

**Files:** none

- [ ] **Step 1: Criar branch a partir de main**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git checkout main && git pull origin main
git checkout -b feat/pagina-tatuador-pr2-dashboard
```

- [ ] **Step 2: Rodar baseline de testes**

```bash
bash scripts/test-prompts.sh 2>&1 | tee /tmp/pr2-baseline.log | tail -20
```

Expected: última linha `✓ Todos os tests passaram.` Se falha, **NÃO seguir** — corrigir baseline antes.

- [ ] **Step 3: Confirmar view `orcamentos` existe e responde**

Via Supabase MCP:

```sql
SELECT column_name FROM information_schema.columns WHERE table_name='orcamentos' ORDER BY ordinal_position;
```

Expected: 12 rows (id, tenant_id, telefone, orcid, valor, valor_pedido_cliente, status, fechado_motivo, pago_em, created_at, last_msg_at, estado_agente_origem).

```sql
SELECT status, count(*) FROM orcamentos GROUP BY status;
```

Expected: 0 rows ou poucos rows (Dagobert ainda sem proposta enviada). Não precisa mais ação — view tá viva.

- [ ] **Step 4: Confirmar OPENAI_API_KEY em CF Pages**

```bash
# Via curl (NÃO mostra valor, só checa se endpoint que usa ela responde):
curl -s "https://inkflowbrasil.com/api/tools/simular-conversa" -o /dev/null -w "%{http_code}\n"
```

Expected: `200` ou `405` (OPTIONS rejeitado). Se `503`, env var ausente — pedir Leandro confirmar antes de seguir.

---

## Fase 1 — Migration

### Task 1.1: Migration tenants.resumo_semanal_*

**Files:**
- Create: `supabase/migrations/2026-05-05-pr2-dashboard.sql`

- [ ] **Step 1: Escrever migration SQL**

```sql
-- supabase/migrations/2026-05-05-pr2-dashboard.sql
-- PR 2 Dashboard: colunas pra resumo semanal IA.
-- - resumo_semanal_atual: JSONB { texto, gerado_em, periodo_inicio, periodo_fim, modelo }
-- - resumo_semanal_ultima_geracao_manual: TIMESTAMPTZ pra rate-limit do botão "Atualizar"

BEGIN;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS resumo_semanal_atual JSONB,
  ADD COLUMN IF NOT EXISTS resumo_semanal_ultima_geracao_manual TIMESTAMPTZ;

-- Index parcial pro cron filtrar tenants ativos rapidinho
CREATE INDEX IF NOT EXISTS idx_tenants_ativo_resumo
  ON tenants(ativo)
  WHERE ativo = true;

COMMIT;

-- Verificacoes pos-migration:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name='tenants' AND column_name LIKE 'resumo_semanal%';
--   -- esperado: 2 rows (jsonb + timestamptz)
```

- [ ] **Step 2: Aplicar via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` com:
- `project_id`: `bfzuxxuscyplfoimvomh`
- `name`: `2026_05_05_pr2_dashboard`
- `query`: conteúdo do SQL acima (sem `BEGIN;`/`COMMIT;` — MCP faz transação)

- [ ] **Step 3: Validar via execute_sql**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='tenants' AND column_name LIKE 'resumo_semanal%';
```

Expected: 2 rows: `resumo_semanal_atual jsonb`, `resumo_semanal_ultima_geracao_manual timestamp with time zone`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-05-05-pr2-dashboard.sql
git commit -m "feat(db): PR 2 Dashboard — resumo_semanal_atual + ultima_geracao_manual

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Fase 2 — Helpers

### Task 2.1: Helper `dashboard-time.js` (BRT calculations)

**Files:**
- Create: `functions/_lib/dashboard-time.js`
- Test: `tests/_lib/dashboard-time.test.mjs`

- [ ] **Step 1: Escrever testes failing primeiro**

```javascript
// tests/_lib/dashboard-time.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayStartBrt, weekStartBrt, daysAgoBrt } from '../../functions/_lib/dashboard-time.js';

test('todayStartBrt — 12:00 UTC (09:00 BRT) retorna mesmo dia 03:00 UTC', () => {
  const now = new Date('2026-05-05T12:00:00Z');
  const result = todayStartBrt(now);
  assert.equal(result.toISOString(), '2026-05-05T03:00:00.000Z');
});

test('todayStartBrt — 02:00 UTC (23:00 BRT do dia anterior) retorna ontem 03:00 UTC', () => {
  const now = new Date('2026-05-05T02:00:00Z');
  const result = todayStartBrt(now);
  assert.equal(result.toISOString(), '2026-05-04T03:00:00.000Z');
});

test('weekStartBrt — quarta 12:00 UTC retorna segunda 03:00 UTC', () => {
  // 2026-05-06 = quarta-feira; segunda anterior = 2026-05-04
  const now = new Date('2026-05-06T12:00:00Z');
  const result = weekStartBrt(now);
  assert.equal(result.toISOString(), '2026-05-04T03:00:00.000Z');
});

test('weekStartBrt — segunda 04:00 UTC (01:00 BRT) ainda conta como semana passada', () => {
  // 2026-05-04 = segunda 01:00 BRT — week_start_brt deve ser segunda anterior
  const now = new Date('2026-05-04T04:00:00Z');
  const result = weekStartBrt(now);
  assert.equal(result.toISOString(), '2026-04-27T03:00:00.000Z');
});

test('daysAgoBrt(30) — retorna 30d antes do today_start_brt', () => {
  const now = new Date('2026-05-05T12:00:00Z');
  const result = daysAgoBrt(30, now);
  assert.equal(result.toISOString(), '2026-04-05T03:00:00.000Z');
});
```

- [ ] **Step 2: Rodar tests pra confirmar fail**

```bash
node --test tests/_lib/dashboard-time.test.mjs
```

Expected: 5 tests fail com `Cannot find module`.

- [ ] **Step 3: Implementar helper**

```javascript
// functions/_lib/dashboard-time.js
// Helpers BRT (UTC-3 ano-redondo, sem DST desde 2019).
// Retornam Date objects em UTC; chamadores fazem .toISOString() pra Supabase.

const BRT_OFFSET_HOURS = 3; // UTC = BRT + 3

/**
 * Início do dia BRT atual em UTC.
 * @param {Date} [now=new Date()] — pra testes determinísticos
 * @returns {Date} 03:00 UTC do dia BRT atual
 */
export function todayStartBrt(now = new Date()) {
  const utcMs = now.getTime();
  // Shift UTC pra "BRT clock": subtrai 3h
  const brtClock = new Date(utcMs - BRT_OFFSET_HOURS * 3600_000);
  // Zera HH:MM:SS no BRT clock
  brtClock.setUTCHours(0, 0, 0, 0);
  // Volta pra UTC: adiciona 3h
  return new Date(brtClock.getTime() + BRT_OFFSET_HOURS * 3600_000);
}

/**
 * Início da semana BRT (segunda-feira 00:00 BRT) em UTC.
 * @param {Date} [now=new Date()]
 * @returns {Date} 03:00 UTC da segunda-feira da semana BRT atual
 */
export function weekStartBrt(now = new Date()) {
  const today = todayStartBrt(now);
  const brtClock = new Date(today.getTime() - BRT_OFFSET_HOURS * 3600_000);
  // getUTCDay: 0=domingo, 1=segunda, ..., 6=sábado
  // Queremos voltar pra segunda: dayOfWeek=1 → 0 dias atrás; dayOfWeek=0 (dom) → 6 dias atrás
  const dayOfWeek = brtClock.getUTCDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  brtClock.setUTCDate(brtClock.getUTCDate() - daysToMonday);
  return new Date(brtClock.getTime() + BRT_OFFSET_HOURS * 3600_000);
}

/**
 * N dias atrás a partir do início do dia BRT atual.
 * @param {number} n — número de dias
 * @param {Date} [now=new Date()]
 * @returns {Date}
 */
export function daysAgoBrt(n, now = new Date()) {
  const today = todayStartBrt(now);
  return new Date(today.getTime() - n * 86400_000);
}
```

- [ ] **Step 4: Rodar tests pra confirmar pass**

```bash
node --test tests/_lib/dashboard-time.test.mjs
```

Expected: `tests 5 / pass 5 / fail 0`.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/dashboard-time.js tests/_lib/dashboard-time.test.mjs
git commit -m "feat(_lib): dashboard-time helpers BRT (todayStart/weekStart/daysAgo)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 2.2: Helper `resumo-semanal-prompt.js` (LLM call)

**Files:**
- Create: `functions/_lib/resumo-semanal-prompt.js`
- Test: `tests/_lib/resumo-semanal-prompt.test.mjs`

- [ ] **Step 1: Escrever testes failing primeiro**

```javascript
// tests/_lib/resumo-semanal-prompt.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, callLlm } from '../../functions/_lib/resumo-semanal-prompt.js';

test('buildPrompt — inclui contagens da semana atual e anterior', () => {
  const stats = {
    semana_atual: { conversas: 5, orcamentos: 3, fechados: 1, sinal_recebido: 250 },
    semana_anterior: { conversas: 2, orcamentos: 1, fechados: 0, sinal_recebido: 0 },
    nome_estudio: 'Hustle Ink',
  };
  const prompt = buildPrompt(stats);
  assert.match(prompt, /Hustle Ink/);
  assert.match(prompt, /5 conversas/);
  assert.match(prompt, /3 orçamentos/);
  assert.match(prompt, /R\$ 250/);
  assert.match(prompt, /comparado.*semana anterior/i);
});

test('buildPrompt — semana ruim (zero) gera tom positivo', () => {
  const stats = {
    semana_atual: { conversas: 0, orcamentos: 0, fechados: 0, sinal_recebido: 0 },
    semana_anterior: { conversas: 3, orcamentos: 2, fechados: 1, sinal_recebido: 100 },
    nome_estudio: 'Tatto X',
  };
  const prompt = buildPrompt(stats);
  // Esperado: prompt instrui a gerar tom positivo mesmo em zero
  assert.match(prompt, /tom positivo/i);
  assert.match(prompt, /sem sugest[aã]o/i);
  assert.match(prompt, /600 chars/i);
});

test('callLlm — chama OpenAI com modelo gpt-4o-mini e retorna texto', async () => {
  const mockFetch = mock.fn(async (url) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Foi uma semana movimentada com 5 conversas...' } }],
      }),
    };
  });
  const result = await callLlm({
    prompt: 'gera resumo',
    apiKey: 'sk-test',
    fetchFn: mockFetch,
  });
  assert.equal(result, 'Foi uma semana movimentada com 5 conversas...');
  assert.equal(mockFetch.mock.callCount(), 1);
  const body = JSON.parse(mockFetch.mock.calls[0].arguments[1].body);
  assert.equal(body.model, 'gpt-4o-mini');
  assert.equal(body.max_tokens, 500);
});

test('callLlm — OpenAI 500 lança Error com detail', async () => {
  const mockFetch = mock.fn(async () => ({
    ok: false,
    status: 500,
    text: async () => 'rate limit',
  }));
  await assert.rejects(
    callLlm({ prompt: 'x', apiKey: 'sk-test', fetchFn: mockFetch }),
    /openai-error.*500/
  );
});

test('callLlm — texto >600 chars trunca', async () => {
  const longText = 'a'.repeat(700);
  const mockFetch = mock.fn(async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: longText } }] }),
  }));
  const result = await callLlm({ prompt: 'x', apiKey: 'sk-test', fetchFn: mockFetch });
  assert.equal(result.length, 600);
  assert.match(result, /\.\.\.$/);
});
```

- [ ] **Step 2: Rodar tests pra confirmar fail**

```bash
node --test tests/_lib/resumo-semanal-prompt.test.mjs
```

Expected: 5 tests fail.

- [ ] **Step 3: Implementar helper**

```javascript
// functions/_lib/resumo-semanal-prompt.js
// Constrói prompt + chama OpenAI gpt-4o-mini pra gerar resumo semanal.
// Output: 1 parágrafo pt-BR casual <=600 chars, sem sugestão acionável.

const SYSTEM_PROMPT = `Você é o InkFlow, assistente de tatuadores. Gere UM parágrafo curto (máximo 600 caracteres) em português brasileiro casual resumindo a semana do estúdio.

REGRAS RÍGIDAS:
- Tom positivo SEMPRE — mesmo em semana ruim ("foi mais quieta — ótima pra preparar próximos trabalhos")
- Inclua os números (conversas, orçamentos, fechados, sinal recebido) e UMA comparação com semana anterior
- NÃO dê sugestão acionável — apenas relate. O tatuador tira a conclusão sozinho.
- Sem emoji, sem bullet points, sem markdown — só texto corrido
- Se algum número for 0, não escrever "0 conversas" — usar fraseado natural ("nenhuma conversa nova" ou "ainda esperando")`;

/**
 * Monta prompt do usuário com stats da semana.
 * @param {object} stats
 * @param {{conversas, orcamentos, fechados, sinal_recebido}} stats.semana_atual
 * @param {{conversas, orcamentos, fechados, sinal_recebido}} stats.semana_anterior
 * @param {string} stats.nome_estudio
 * @returns {string}
 */
export function buildPrompt({ semana_atual, semana_anterior, nome_estudio }) {
  return `Estúdio: ${nome_estudio}

Semana atual:
- ${semana_atual.conversas} conversas novas
- ${semana_atual.orcamentos} orçamentos enviados
- ${semana_atual.fechados} orçamentos fechados (sinal pago)
- R$ ${semana_atual.sinal_recebido.toFixed(2)} de sinal recebido

Semana anterior (comparação):
- ${semana_anterior.conversas} conversas, ${semana_anterior.orcamentos} orçamentos, ${semana_anterior.fechados} fechados, R$ ${semana_anterior.sinal_recebido.toFixed(2)} de sinal

Gere o resumo seguindo as regras (tom positivo, 1 parágrafo, <=600 chars, comparação com semana anterior, sem sugestão acionável, sem emoji/markdown).`;
}

/**
 * Chama OpenAI gpt-4o-mini.
 * @param {object} opts
 * @param {string} opts.prompt — user prompt já buildado
 * @param {string} opts.apiKey — OPENAI_API_KEY
 * @param {Function} [opts.fetchFn=fetch] — pra testes
 * @returns {Promise<string>} texto do resumo (truncado a 600 chars)
 */
export async function callLlm({ prompt, apiKey, fetchFn = fetch }) {
  const res = await fetchFn('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`openai-error ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim() || '';

  // Truncate a 600 chars com "..." (segurança — system prompt já pede)
  if (text.length > 600) {
    return text.slice(0, 597) + '...';
  }
  return text;
}
```

- [ ] **Step 4: Rodar tests pra confirmar pass**

```bash
node --test tests/_lib/resumo-semanal-prompt.test.mjs
```

Expected: `tests 5 / pass 5`.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/resumo-semanal-prompt.js tests/_lib/resumo-semanal-prompt.test.mjs
git commit -m "feat(_lib): resumo-semanal-prompt — buildPrompt + callLlm gpt-4o-mini

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Fase 3 — Endpoints Dashboard

### Task 3.1: Endpoint `GET /api/dashboard/kpis`

**Files:**
- Create: `functions/api/dashboard/kpis.js`
- Test: `tests/api/dashboard-kpis.test.mjs`

- [ ] **Step 1: Escrever testes failing primeiro**

```javascript
// tests/api/dashboard-kpis.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/dashboard/kpis.js';

const VALID_TOKEN = 'studio_token_v1.test';
const TENANT_ID = '00000000-0000-0000-0000-000000000010';

function mkContext({ url, fetchFn, env = {} }) {
  return {
    request: { url, method: 'GET', headers: new Map() },
    env: {
      SUPABASE_SERVICE_KEY: 'sb_test',
      STUDIO_TOKEN_SECRET: 'secret',
      _fetch: fetchFn,
      ...env,
    },
  };
}

test('kpis — sem studio_token retorna 401', async () => {
  const ctx = mkContext({ url: 'https://x/api/dashboard/kpis' });
  const res = await onRequest(ctx);
  assert.equal(res.status, 401);
});

test('kpis — studio_token inválido retorna 401', async () => {
  const fetchFn = mock.fn(async () => ({ ok: false, status: 401 }));
  const ctx = mkContext({
    url: 'https://x/api/dashboard/kpis?studio_token=invalido',
    fetchFn,
  });
  const res = await onRequest(ctx);
  assert.equal(res.status, 401);
});

test('kpis — happy path: retorna 5 KPIs com tenant_id derivado do token', async () => {
  // Mock fetch sequence:
  // 1. verifyStudioToken HMAC → 200 retornando tenant_id
  // 2-6. Supabase queries pros 5 KPIs
  let callIdx = 0;
  const responses = [
    { ok: true, json: async () => ({ tenant_id: TENANT_ID, exp: 9999999999 }) }, // auth
    { ok: true, json: async () => [{ count: 7 }] },              // K1 conversas hoje
    { ok: true, json: async () => [{ count: 3 }] },              // K2 orcamentos esta semana
    { ok: true, json: async () => [{ count: 1 }] },              // K3 aguardando sinal
    { ok: true, json: async () => [{ fechados: 2, total: 5 }] }, // K4 taxa conversao
    { ok: true, json: async () => [{ sum_sinal: 450.50 }] },     // K5 sinal recebido
  ];
  const fetchFn = mock.fn(async () => responses[callIdx++]);
  const ctx = mkContext({
    url: `https://x/api/dashboard/kpis?studio_token=${VALID_TOKEN}`,
    fetchFn,
  });
  const res = await onRequest(ctx);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.kpis, {
    conversas_hoje: 7,
    orcamentos_esta_semana: 3,
    aguardando_sinal: 1,
    taxa_conversao_30d: 40, // 2/5 * 100
    sinal_recebido_semana: 450.50,
  });
});

test('kpis — taxa_conversao com denominator=0 retorna 0 (sem divisão por zero)', async () => {
  let callIdx = 0;
  const responses = [
    { ok: true, json: async () => ({ tenant_id: TENANT_ID, exp: 9999999999 }) },
    { ok: true, json: async () => [{ count: 0 }] },
    { ok: true, json: async () => [{ count: 0 }] },
    { ok: true, json: async () => [{ count: 0 }] },
    { ok: true, json: async () => [{ fechados: 0, total: 0 }] }, // denom=0
    { ok: true, json: async () => [{ sum_sinal: 0 }] },
  ];
  const fetchFn = mock.fn(async () => responses[callIdx++]);
  const ctx = mkContext({
    url: `https://x/api/dashboard/kpis?studio_token=${VALID_TOKEN}`,
    fetchFn,
  });
  const res = await onRequest(ctx);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.kpis.taxa_conversao_30d, 0);
});

test('kpis — Supabase 500 em qualquer KPI retorna 500 com error', async () => {
  let callIdx = 0;
  const responses = [
    { ok: true, json: async () => ({ tenant_id: TENANT_ID, exp: 9999999999 }) },
    { ok: false, status: 500, text: async () => 'db error' },
  ];
  const fetchFn = mock.fn(async () => responses[callIdx++] || { ok: false, status: 500 });
  const ctx = mkContext({
    url: `https://x/api/dashboard/kpis?studio_token=${VALID_TOKEN}`,
    fetchFn,
  });
  const res = await onRequest(ctx);
  assert.equal(res.status, 500);
});

test('kpis — tenant_id de query param é IGNORADO (sempre do token)', async () => {
  let callIdx = 0;
  const callsToVerify = [];
  const fetchFn = mock.fn(async (url) => {
    callsToVerify.push(url);
    callIdx++;
    if (callIdx === 1) return { ok: true, json: async () => ({ tenant_id: TENANT_ID, exp: 9999999999 }) };
    return { ok: true, json: async () => [{ count: 0 }] };
  });
  const ctx = mkContext({
    url: `https://x/api/dashboard/kpis?studio_token=${VALID_TOKEN}&tenant_id=11111111-1111-1111-1111-111111111111`,
    fetchFn,
  });
  await onRequest(ctx);
  // Verifica que TODAS as queries Supabase usam TENANT_ID, não o spoofado
  for (const url of callsToVerify.slice(1)) {
    assert.match(url, new RegExp(`tenant_id=eq.${TENANT_ID}`));
    assert.doesNotMatch(url, /11111111-1111-1111-1111-111111111111/);
  }
});
```

- [ ] **Step 2: Rodar tests pra confirmar fail**

```bash
node --test tests/api/dashboard-kpis.test.mjs
```

Expected: 6 tests fail.

- [ ] **Step 3: Implementar endpoint**

```javascript
// functions/api/dashboard/kpis.js
// GET /api/dashboard/kpis?studio_token=<token>
// Auth: studio_token HMAC v1 → tenant_id derivado server-side.
// Response 200: { ok: true, kpis: { conversas_hoje, orcamentos_esta_semana, aguardando_sinal, taxa_conversao_30d, sinal_recebido_semana } }

import { verifyStudioTokenOrLegacy } from '../_auth-helpers.js';
import { todayStartBrt, weekStartBrt, daysAgoBrt } from '../../_lib/dashboard-time.js';

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

async function supaCount(env, fetchFn, path) {
  const res = await fetchFn(`${SUPABASE_URL}${path}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      Prefer: 'count=exact',
    },
  });
  if (!res.ok) throw new Error(`supa ${res.status}`);
  // Supabase retorna count via header `Content-Range: 0-N/total`. Pra simplicidade
  // usamos `select=id&head=true` + parse Content-Range, OU `select=count` quando RPC.
  // Aqui usamos pattern simples: select=count via array de 1 row { count }.
  const rows = await res.json();
  return rows?.[0]?.count ?? 0;
}

export async function onRequest(context) {
  const { request, env } = context;
  const fetchFn = env._fetch || fetch; // pra testes

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(request.url);
  const studio_token = url.searchParams.get('studio_token');
  if (!studio_token) return json({ error: 'studio_token obrigatório' }, 401);

  const verified = await verifyStudioTokenOrLegacy({
    token: studio_token,
    secret: env.STUDIO_TOKEN_SECRET,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: env.SUPABASE_SERVICE_KEY,
    fetchFn,
  });
  if (!verified) return json({ error: 'studio_token inválido' }, 401);

  const tenantId = verified.tenantId;
  const todayBrt = todayStartBrt().toISOString();
  const weekBrt = weekStartBrt().toISOString();
  const days30Brt = daysAgoBrt(30).toISOString();

  try {
    // K1: Conversas hoje
    const conversasHoje = await supaCount(env, fetchFn,
      `/rest/v1/conversas?select=count&tenant_id=eq.${tenantId}&last_msg_at=gte.${encodeURIComponent(todayBrt)}`);

    // K2: Orçamentos esta semana (via view orcamentos)
    const orcamentosSemana = await supaCount(env, fetchFn,
      `/rest/v1/orcamentos?select=count&tenant_id=eq.${tenantId}&created_at=gte.${encodeURIComponent(weekBrt)}`);

    // K3: Aguardando sinal
    const aguardandoSinal = await supaCount(env, fetchFn,
      `/rest/v1/conversas?select=count&tenant_id=eq.${tenantId}&estado_agente=eq.aguardando_sinal`);

    // K4: Taxa conversão últimos 30d (via view orcamentos)
    // Numerador: status='fechado'; Denominador: total de orcamentos no período
    const k4Res = await fetchFn(`${SUPABASE_URL}/rest/v1/rpc/dashboard_taxa_conversao`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_tenant_id: tenantId, p_since: days30Brt }),
    });
    let taxaConversao = 0;
    if (k4Res.ok) {
      const k4Data = await k4Res.json();
      const row = Array.isArray(k4Data) ? k4Data[0] : k4Data;
      const fechados = row?.fechados || 0;
      const total = row?.total || 0;
      taxaConversao = total > 0 ? Math.round((fechados / total) * 100) : 0;
    }

    // K5: Sinal recebido na semana (sum(valor * sinal_percentual / 100) WHERE status='fechado')
    const k5Res = await fetchFn(`${SUPABASE_URL}/rest/v1/rpc/dashboard_sinal_recebido`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_tenant_id: tenantId, p_since: weekBrt }),
    });
    let sinalRecebido = 0;
    if (k5Res.ok) {
      const k5Data = await k5Res.json();
      const row = Array.isArray(k5Data) ? k5Data[0] : k5Data;
      sinalRecebido = parseFloat(row?.sum_sinal || 0);
    }

    return json({
      ok: true,
      kpis: {
        conversas_hoje: conversasHoje,
        orcamentos_esta_semana: orcamentosSemana,
        aguardando_sinal: aguardandoSinal,
        taxa_conversao_30d: taxaConversao,
        sinal_recebido_semana: sinalRecebido,
      },
    });
  } catch (err) {
    console.error('kpis error:', err.message);
    return json({ error: 'Erro ao calcular KPIs', detail: err.message }, 500);
  }
}
```

- [ ] **Step 4: Criar 2 funções Postgres pros agregados (RPC)**

Migration nova:

```sql
-- supabase/migrations/2026-05-05-pr2-dashboard-rpc.sql
BEGIN;

CREATE OR REPLACE FUNCTION dashboard_taxa_conversao(p_tenant_id UUID, p_since TIMESTAMPTZ)
RETURNS TABLE(fechados BIGINT, total BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    count(*) FILTER (WHERE status = 'fechado') AS fechados,
    count(*) AS total
  FROM orcamentos
  WHERE tenant_id = p_tenant_id AND created_at >= p_since;
$$;

CREATE OR REPLACE FUNCTION dashboard_sinal_recebido(p_tenant_id UUID, p_since TIMESTAMPTZ)
RETURNS TABLE(sum_sinal NUMERIC)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(sum(o.valor * t.sinal_percentual / 100.0), 0) AS sum_sinal
  FROM orcamentos o
  JOIN tenants t ON t.id = o.tenant_id
  WHERE o.tenant_id = p_tenant_id
    AND o.status = 'fechado'
    AND o.pago_em >= p_since;
$$;

COMMIT;
```

Aplicar via Supabase MCP `apply_migration` com nome `2026_05_05_pr2_dashboard_rpc`.

- [ ] **Step 5: Validar funções via execute_sql**

```sql
SELECT * FROM dashboard_taxa_conversao('00000000-0000-0000-0000-000000000010'::uuid, NOW() - INTERVAL '30 days');
SELECT * FROM dashboard_sinal_recebido('00000000-0000-0000-0000-000000000010'::uuid, NOW() - INTERVAL '7 days');
```

Expected: ambas retornam 1 row com 0 (sem dados em prod ainda).

- [ ] **Step 6: Rodar tests pra confirmar pass**

```bash
node --test tests/api/dashboard-kpis.test.mjs
```

Expected: `tests 6 / pass 6`.

- [ ] **Step 7: Commit**

```bash
git add functions/api/dashboard/kpis.js tests/api/dashboard-kpis.test.mjs supabase/migrations/2026-05-05-pr2-dashboard-rpc.sql
git commit -m "feat(api): GET /api/dashboard/kpis — 5 KPIs + RPC functions

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3.2: Endpoint `GET /api/dashboard/atividade-recente`

**Files:**
- Create: `functions/api/dashboard/atividade-recente.js`
- Test: `tests/api/dashboard-atividade-recente.test.mjs`

- [ ] **Step 1: Escrever testes failing primeiro**

```javascript
// tests/api/dashboard-atividade-recente.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/dashboard/atividade-recente.js';

const VALID_TOKEN = 'studio_token_v1.test';
const TENANT_ID = '00000000-0000-0000-0000-000000000010';

function mkContext({ url, fetchFn }) {
  return {
    request: { url, method: 'GET', headers: new Map() },
    env: { SUPABASE_SERVICE_KEY: 'sb_test', STUDIO_TOKEN_SECRET: 'secret', _fetch: fetchFn },
  };
}

test('atividade-recente — sem token retorna 401', async () => {
  const ctx = mkContext({ url: 'https://x/api/dashboard/atividade-recente' });
  const res = await onRequest(ctx);
  assert.equal(res.status, 401);
});

test('atividade-recente — happy path: 3 conversas mais recentes', async () => {
  let i = 0;
  const responses = [
    { ok: true, json: async () => ({ tenant_id: TENANT_ID, exp: 9999999999 }) }, // auth
    {
      ok: true,
      json: async () => [
        { id: 'c1', telefone: '5521999999999', dados_cadastro: { nome: 'Maria Silva' }, estado_agente: 'propondo_valor', last_msg_at: '2026-05-05T15:00:00Z', updated_at: '2026-05-05T15:00:00Z' },
        { id: 'c2', telefone: '5521988888888', dados_cadastro: {}, estado_agente: 'coletando_tattoo', last_msg_at: '2026-05-05T14:30:00Z', updated_at: '2026-05-05T14:30:00Z' },
        { id: 'c3', telefone: '5521977777777', dados_cadastro: { nome: 'João' }, estado_agente: 'aguardando_tatuador', last_msg_at: '2026-05-05T14:00:00Z', updated_at: '2026-05-05T14:00:00Z' },
      ],
    },
  ];
  const fetchFn = mock.fn(async () => responses[i++]);
  const ctx = mkContext({ url: `https://x/api/dashboard/atividade-recente?studio_token=${VALID_TOKEN}`, fetchFn });
  const res = await onRequest(ctx);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.atividades.length, 3);
  assert.equal(body.atividades[0].id, 'c1');
  assert.equal(body.atividades[0].nome, 'Maria Silva');
  assert.equal(body.atividades[1].nome, '5521988888888'); // fallback pra telefone
});

test('atividade-recente — query usa LIMIT 3 e ORDER BY last_msg_at DESC', async () => {
  let i = 0;
  const calls = [];
  const fetchFn = mock.fn(async (url) => {
    calls.push(url);
    if (i === 0) {
      i++;
      return { ok: true, json: async () => ({ tenant_id: TENANT_ID, exp: 9999999999 }) };
    }
    return { ok: true, json: async () => [] };
  });
  const ctx = mkContext({ url: `https://x/api/dashboard/atividade-recente?studio_token=${VALID_TOKEN}`, fetchFn });
  await onRequest(ctx);
  assert.match(calls[1], /tenant_id=eq\.00000000/);
  assert.match(calls[1], /order=last_msg_at\.desc/);
  assert.match(calls[1], /limit=3/);
});

test('atividade-recente — 0 conversas retorna array vazio', async () => {
  let i = 0;
  const responses = [
    { ok: true, json: async () => ({ tenant_id: TENANT_ID, exp: 9999999999 }) },
    { ok: true, json: async () => [] },
  ];
  const fetchFn = mock.fn(async () => responses[i++]);
  const ctx = mkContext({ url: `https://x/api/dashboard/atividade-recente?studio_token=${VALID_TOKEN}`, fetchFn });
  const res = await onRequest(ctx);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.atividades, []);
});
```

- [ ] **Step 2: Rodar tests pra confirmar fail**

```bash
node --test tests/api/dashboard-atividade-recente.test.mjs
```

Expected: 4 tests fail.

- [ ] **Step 3: Implementar endpoint**

```javascript
// functions/api/dashboard/atividade-recente.js
// GET /api/dashboard/atividade-recente?studio_token=<token>
// Retorna últimas 3 conversas do tenant, ordenadas por last_msg_at DESC.
// Response: { ok, atividades: [{ id, nome, estado_agente, last_msg_at }] }

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

export async function onRequest(context) {
  const { request, env } = context;
  const fetchFn = env._fetch || fetch;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(request.url);
  const studio_token = url.searchParams.get('studio_token');
  if (!studio_token) return json({ error: 'studio_token obrigatório' }, 401);

  const verified = await verifyStudioTokenOrLegacy({
    token: studio_token,
    secret: env.STUDIO_TOKEN_SECRET,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: env.SUPABASE_SERVICE_KEY,
    fetchFn,
  });
  if (!verified) return json({ error: 'studio_token inválido' }, 401);

  const tenantId = verified.tenantId;
  const select = 'id,telefone,dados_cadastro,estado_agente,last_msg_at,updated_at';
  const queryUrl = `${SUPABASE_URL}/rest/v1/conversas?select=${select}&tenant_id=eq.${tenantId}&order=last_msg_at.desc.nullslast&limit=3`;

  try {
    const res = await fetchFn(queryUrl, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    });
    if (!res.ok) {
      console.error('atividade-recente supa error:', res.status);
      return json({ error: 'Erro ao buscar atividade' }, 500);
    }
    const conversas = await res.json();
    const atividades = conversas.map(c => ({
      id: c.id,
      nome: c.dados_cadastro?.nome || c.telefone || 'sem nome',
      estado_agente: c.estado_agente,
      last_msg_at: c.last_msg_at || c.updated_at,
    }));
    return json({ ok: true, atividades });
  } catch (err) {
    console.error('atividade-recente exception:', err.message);
    return json({ error: 'Erro interno' }, 500);
  }
}
```

- [ ] **Step 4: Rodar tests pra confirmar pass**

```bash
node --test tests/api/dashboard-atividade-recente.test.mjs
```

Expected: `tests 4 / pass 4`.

- [ ] **Step 5: Commit**

```bash
git add functions/api/dashboard/atividade-recente.js tests/api/dashboard-atividade-recente.test.mjs
git commit -m "feat(api): GET /api/dashboard/atividade-recente — últimas 3 conversas

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3.3: Endpoint `POST /api/dashboard/regenerate-resumo-semanal`

**Files:**
- Create: `functions/api/dashboard/regenerate-resumo-semanal.js`
- Test: `tests/api/dashboard-regenerate-resumo.test.mjs`

- [ ] **Step 1: Escrever testes failing primeiro**

```javascript
// tests/api/dashboard-regenerate-resumo.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/dashboard/regenerate-resumo-semanal.js';

const VALID_TOKEN = 'studio_token_v1.test';
const TENANT_ID = '00000000-0000-0000-0000-000000000010';

function mkContext({ method = 'POST', fetchFn, body = '{}' }) {
  return {
    request: {
      url: `https://x/api/dashboard/regenerate-resumo-semanal?studio_token=${VALID_TOKEN}`,
      method,
      headers: new Map(),
      json: async () => JSON.parse(body),
    },
    env: {
      SUPABASE_SERVICE_KEY: 'sb_test',
      STUDIO_TOKEN_SECRET: 'secret',
      OPENAI_API_KEY: 'sk-test',
      _fetch: fetchFn,
    },
  };
}

test('regenerate — método != POST retorna 405', async () => {
  const ctx = mkContext({ method: 'GET' });
  const res = await onRequest(ctx);
  assert.equal(res.status, 405);
});

test('regenerate — sem studio_token retorna 401', async () => {
  const ctx = {
    request: { url: 'https://x/api/dashboard/regenerate-resumo-semanal', method: 'POST', headers: new Map(), json: async () => ({}) },
    env: { SUPABASE_SERVICE_KEY: 'sb_test', STUDIO_TOKEN_SECRET: 'secret', OPENAI_API_KEY: 'sk' },
  };
  const res = await onRequest(ctx);
  assert.equal(res.status, 401);
});

test('regenerate — rate limit 1×/24h: ultima_geracao_manual há 2h → 429', async () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
  let i = 0;
  const responses = [
    { ok: true, json: async () => ({ tenant_id: TENANT_ID, exp: 9999999999 }) },
    { ok: true, json: async () => [{ resumo_semanal_ultima_geracao_manual: twoHoursAgo, nome: 'Hustle Ink' }] },
  ];
  const fetchFn = mock.fn(async () => responses[i++]);
  const ctx = mkContext({ fetchFn });
  const res = await onRequest(ctx);
  assert.equal(res.status, 429);
  const body = await res.json();
  assert.match(body.error, /j[áa] atualizado/i);
});

test('regenerate — happy path: gera resumo + atualiza tenants', async () => {
  let i = 0;
  const responses = [
    { ok: true, json: async () => ({ tenant_id: TENANT_ID, exp: 9999999999 }) },                         // auth
    { ok: true, json: async () => [{ resumo_semanal_ultima_geracao_manual: null, nome: 'Hustle Ink', sinal_percentual: 30 }] }, // tenant
    { ok: true, json: async () => [{ count: 5 }] },         // conversas semana atual
    { ok: true, json: async () => [{ count: 3 }] },         // orcamentos semana atual
    { ok: true, json: async () => [{ fechados: 1, sum_sinal: 250 }] },  // fechados+sinal semana atual
    { ok: true, json: async () => [{ count: 2 }] },         // conversas semana anterior
    { ok: true, json: async () => [{ count: 1 }] },         // orcamentos semana anterior
    { ok: true, json: async () => [{ fechados: 0, sum_sinal: 0 }] },    // fechados+sinal semana anterior
    { ok: true, json: async () => ({ choices: [{ message: { content: 'Foi uma semana movimentada com 5 conversas...' } }] }) }, // openai
    { ok: true, status: 204, text: async () => '' },        // PATCH tenants
  ];
  const fetchFn = mock.fn(async () => responses[i++]);
  const ctx = mkContext({ fetchFn });
  const res = await onRequest(ctx);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.resumo.texto, 'Foi uma semana movimentada com 5 conversas...');
  assert.ok(body.resumo.gerado_em);
});

test('regenerate — OpenAI error retorna 502 com detail', async () => {
  let i = 0;
  const responses = [
    { ok: true, json: async () => ({ tenant_id: TENANT_ID, exp: 9999999999 }) },
    { ok: true, json: async () => [{ resumo_semanal_ultima_geracao_manual: null, nome: 'Hustle Ink', sinal_percentual: 30 }] },
    { ok: true, json: async () => [{ count: 0 }] },
    { ok: true, json: async () => [{ count: 0 }] },
    { ok: true, json: async () => [{ fechados: 0, sum_sinal: 0 }] },
    { ok: true, json: async () => [{ count: 0 }] },
    { ok: true, json: async () => [{ count: 0 }] },
    { ok: true, json: async () => [{ fechados: 0, sum_sinal: 0 }] },
    { ok: false, status: 500, text: async () => 'rate limit' },  // openai 500
  ];
  const fetchFn = mock.fn(async () => responses[i++]);
  const ctx = mkContext({ fetchFn });
  const res = await onRequest(ctx);
  assert.equal(res.status, 502);
});
```

- [ ] **Step 2: Rodar tests pra confirmar fail**

```bash
node --test tests/api/dashboard-regenerate-resumo.test.mjs
```

Expected: 5 tests fail.

- [ ] **Step 3: Implementar endpoint**

```javascript
// functions/api/dashboard/regenerate-resumo-semanal.js
// POST /api/dashboard/regenerate-resumo-semanal?studio_token=<token>
// Rate-limit 1×/24h por tenant via tenants.resumo_semanal_ultima_geracao_manual.
// Calcula stats da semana atual + anterior, chama LLM, salva em tenants.resumo_semanal_atual.

import { verifyStudioTokenOrLegacy } from '../_auth-helpers.js';
import { weekStartBrt } from '../../_lib/dashboard-time.js';
import { buildPrompt, callLlm } from '../../_lib/resumo-semanal-prompt.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

async function fetchStats(env, fetchFn, tenantId, sinceIso, untilIso) {
  // Conversas no período
  const conversasRes = await fetchFn(
    `${SUPABASE_URL}/rest/v1/conversas?select=count&tenant_id=eq.${tenantId}&created_at=gte.${encodeURIComponent(sinceIso)}&created_at=lt.${encodeURIComponent(untilIso)}`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  );
  const conversas = (await conversasRes.json())?.[0]?.count ?? 0;

  // Orçamentos no período (via view)
  const orcRes = await fetchFn(
    `${SUPABASE_URL}/rest/v1/orcamentos?select=count&tenant_id=eq.${tenantId}&created_at=gte.${encodeURIComponent(sinceIso)}&created_at=lt.${encodeURIComponent(untilIso)}`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  );
  const orcamentos = (await orcRes.json())?.[0]?.count ?? 0;

  // Fechados + sinal no período (via RPC)
  const sinalRes = await fetchFn(`${SUPABASE_URL}/rest/v1/rpc/dashboard_resumo_periodo`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_tenant_id: tenantId, p_since: sinceIso, p_until: untilIso }),
  });
  const sinalRow = (await sinalRes.json())?.[0] || {};
  const fechados = sinalRow.fechados || 0;
  const sinal_recebido = parseFloat(sinalRow.sum_sinal || 0);

  return { conversas, orcamentos, fechados, sinal_recebido };
}

export async function onRequest(context) {
  const { request, env } = context;
  const fetchFn = env._fetch || fetch;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(request.url);
  const studio_token = url.searchParams.get('studio_token');
  if (!studio_token) return json({ error: 'studio_token obrigatório' }, 401);

  const verified = await verifyStudioTokenOrLegacy({
    token: studio_token,
    secret: env.STUDIO_TOKEN_SECRET,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: env.SUPABASE_SERVICE_KEY,
    fetchFn,
  });
  if (!verified) return json({ error: 'studio_token inválido' }, 401);

  const tenantId = verified.tenantId;

  // 1. Carrega tenant + checa rate-limit
  const tenantRes = await fetchFn(
    `${SUPABASE_URL}/rest/v1/tenants?id=eq.${tenantId}&select=resumo_semanal_ultima_geracao_manual,nome,sinal_percentual`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  );
  if (!tenantRes.ok) return json({ error: 'Erro ao carregar tenant' }, 500);
  const tenant = (await tenantRes.json())?.[0];
  if (!tenant) return json({ error: 'tenant não encontrado' }, 404);

  const ultima = tenant.resumo_semanal_ultima_geracao_manual;
  if (ultima) {
    const ultimaMs = new Date(ultima).getTime();
    if (Date.now() - ultimaMs < 24 * 3600_000) {
      return json({ error: 'Já atualizado hoje, volta amanhã' }, 429);
    }
  }

  // 2. Calcula stats semana atual (segunda 00:00 BRT até agora) + semana anterior
  const semanaAtualInicio = weekStartBrt();
  const semanaAtualFim = new Date();
  const semanaAnteriorInicio = new Date(semanaAtualInicio.getTime() - 7 * 86400_000);
  const semanaAnteriorFim = semanaAtualInicio;

  let stats;
  try {
    const [atual, anterior] = await Promise.all([
      fetchStats(env, fetchFn, tenantId, semanaAtualInicio.toISOString(), semanaAtualFim.toISOString()),
      fetchStats(env, fetchFn, tenantId, semanaAnteriorInicio.toISOString(), semanaAnteriorFim.toISOString()),
    ]);
    stats = { semana_atual: atual, semana_anterior: anterior, nome_estudio: tenant.nome };
  } catch (err) {
    console.error('regenerate stats error:', err.message);
    return json({ error: 'Erro ao calcular stats' }, 500);
  }

  // 3. Chama LLM
  let texto;
  try {
    const prompt = buildPrompt(stats);
    texto = await callLlm({ prompt, apiKey: env.OPENAI_API_KEY, fetchFn });
  } catch (err) {
    console.error('regenerate llm error:', err.message);
    return json({ error: 'Falha LLM', detail: err.message }, 502);
  }

  const agora = new Date().toISOString();
  const resumo = {
    texto,
    gerado_em: agora,
    periodo_inicio: semanaAtualInicio.toISOString(),
    periodo_fim: semanaAtualFim.toISOString(),
    modelo: 'gpt-4o-mini',
  };

  // 4. Salva em tenants
  const patchRes = await fetchFn(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${tenantId}`, {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      resumo_semanal_atual: resumo,
      resumo_semanal_ultima_geracao_manual: agora,
    }),
  });
  if (!patchRes.ok) {
    console.error('regenerate patch error:', patchRes.status);
    return json({ error: 'Erro ao salvar resumo' }, 500);
  }

  return json({ ok: true, resumo });
}
```

- [ ] **Step 4: Criar RPC `dashboard_resumo_periodo`**

Adicionar à migration `2026-05-05-pr2-dashboard-rpc.sql`:

```sql
CREATE OR REPLACE FUNCTION dashboard_resumo_periodo(p_tenant_id UUID, p_since TIMESTAMPTZ, p_until TIMESTAMPTZ)
RETURNS TABLE(fechados BIGINT, sum_sinal NUMERIC)
LANGUAGE sql
STABLE
AS $$
  SELECT
    count(*) FILTER (WHERE o.status = 'fechado' AND o.pago_em >= p_since AND o.pago_em < p_until) AS fechados,
    COALESCE(sum(o.valor * t.sinal_percentual / 100.0) FILTER (WHERE o.status = 'fechado' AND o.pago_em >= p_since AND o.pago_em < p_until), 0) AS sum_sinal
  FROM orcamentos o
  JOIN tenants t ON t.id = o.tenant_id
  WHERE o.tenant_id = p_tenant_id;
$$;
```

Aplicar via MCP (re-apply mesmo nome `2026_05_05_pr2_dashboard_rpc` é idempotente — `CREATE OR REPLACE`).

- [ ] **Step 5: Rodar tests pra confirmar pass**

```bash
node --test tests/api/dashboard-regenerate-resumo.test.mjs
```

Expected: `tests 5 / pass 5`.

- [ ] **Step 6: Commit**

```bash
git add functions/api/dashboard/regenerate-resumo-semanal.js tests/api/dashboard-regenerate-resumo.test.mjs supabase/migrations/2026-05-05-pr2-dashboard-rpc.sql
git commit -m "feat(api): POST /api/dashboard/regenerate-resumo-semanal — rate-limit + LLM

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Fase 4 — Cron resumo semanal

### Task 4.1: Endpoint `POST /api/cron/resumo-semanal`

**Files:**
- Create: `functions/api/cron/resumo-semanal.js`
- Test: `tests/api/cron-resumo-semanal.test.mjs`

- [ ] **Step 1: Escrever testes failing primeiro**

```javascript
// tests/api/cron-resumo-semanal.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/cron/resumo-semanal.js';

function mkContext({ method = 'POST', authHeader = 'Bearer cron-secret', fetchFn }) {
  const headers = new Map();
  if (authHeader) headers.set('authorization', authHeader);
  return {
    request: {
      url: 'https://x/api/cron/resumo-semanal',
      method,
      headers: { get: (k) => headers.get(k.toLowerCase()) },
    },
    env: {
      SUPABASE_SERVICE_KEY: 'sb_test',
      CRON_SECRET: 'cron-secret',
      OPENAI_API_KEY: 'sk-test',
      _fetch: fetchFn,
    },
  };
}

test('cron — sem Authorization Bearer retorna 401', async () => {
  const ctx = mkContext({ authHeader: '' });
  const res = await onRequest(ctx);
  assert.equal(res.status, 401);
});

test('cron — Bearer errado retorna 401', async () => {
  const ctx = mkContext({ authHeader: 'Bearer wrong' });
  const res = await onRequest(ctx);
  assert.equal(res.status, 401);
});

test('cron — método != POST retorna 405', async () => {
  const ctx = mkContext({ method: 'GET' });
  const res = await onRequest(ctx);
  assert.equal(res.status, 405);
});

test('cron — happy path: 2 tenants ativos, gera 2 resumos', async () => {
  let i = 0;
  const responses = [
    // 1. Lista tenants ativos
    { ok: true, json: async () => [
      { id: 't1', nome: 'Hustle Ink', sinal_percentual: 30 },
      { id: 't2', nome: 'Tatto X', sinal_percentual: 20 },
    ] },
    // Tenant 1: 6 stats queries + 1 LLM call + 1 PATCH
    { ok: true, json: async () => [{ count: 5 }] },
    { ok: true, json: async () => [{ count: 3 }] },
    { ok: true, json: async () => [{ fechados: 1, sum_sinal: 250 }] },
    { ok: true, json: async () => [{ count: 2 }] },
    { ok: true, json: async () => [{ count: 1 }] },
    { ok: true, json: async () => [{ fechados: 0, sum_sinal: 0 }] },
    { ok: true, json: async () => ({ choices: [{ message: { content: 'Resumo t1' } }] }) },
    { ok: true, status: 204, text: async () => '' },
    // Tenant 2: idem
    { ok: true, json: async () => [{ count: 1 }] },
    { ok: true, json: async () => [{ count: 0 }] },
    { ok: true, json: async () => [{ fechados: 0, sum_sinal: 0 }] },
    { ok: true, json: async () => [{ count: 0 }] },
    { ok: true, json: async () => [{ count: 0 }] },
    { ok: true, json: async () => [{ fechados: 0, sum_sinal: 0 }] },
    { ok: true, json: async () => ({ choices: [{ message: { content: 'Resumo t2' } }] }) },
    { ok: true, status: 204, text: async () => '' },
  ];
  const fetchFn = mock.fn(async () => responses[i++]);
  const ctx = mkContext({ fetchFn });
  const res = await onRequest(ctx);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.processados, 2);
  assert.equal(body.falhas, 0);
});

test('cron — 1 tenant falha LLM, outros continuam (try/catch isolado)', async () => {
  let i = 0;
  const responses = [
    { ok: true, json: async () => [
      { id: 't1', nome: 'Hustle Ink', sinal_percentual: 30 },
      { id: 't2', nome: 'Tatto X', sinal_percentual: 20 },
    ] },
    // Tenant 1: stats OK, LLM falha
    { ok: true, json: async () => [{ count: 0 }] },
    { ok: true, json: async () => [{ count: 0 }] },
    { ok: true, json: async () => [{ fechados: 0, sum_sinal: 0 }] },
    { ok: true, json: async () => [{ count: 0 }] },
    { ok: true, json: async () => [{ count: 0 }] },
    { ok: true, json: async () => [{ fechados: 0, sum_sinal: 0 }] },
    { ok: false, status: 500, text: async () => 'rate limit' },  // LLM 500
    // Tenant 2: tudo OK
    { ok: true, json: async () => [{ count: 0 }] },
    { ok: true, json: async () => [{ count: 0 }] },
    { ok: true, json: async () => [{ fechados: 0, sum_sinal: 0 }] },
    { ok: true, json: async () => [{ count: 0 }] },
    { ok: true, json: async () => [{ count: 0 }] },
    { ok: true, json: async () => [{ fechados: 0, sum_sinal: 0 }] },
    { ok: true, json: async () => ({ choices: [{ message: { content: 'Resumo t2' } }] }) },
    { ok: true, status: 204, text: async () => '' },
  ];
  const fetchFn = mock.fn(async () => responses[i++]);
  const ctx = mkContext({ fetchFn });
  const res = await onRequest(ctx);
  assert.equal(res.status, 200); // Worker exit code OK mesmo com falha parcial
  const body = await res.json();
  assert.equal(body.processados, 1);
  assert.equal(body.falhas, 1);
  assert.equal(body.detalhes[0].tenant_id, 't1');
  assert.match(body.detalhes[0].error, /openai-error/);
});

test('cron — 0 tenants ativos retorna { processados: 0 }', async () => {
  const fetchFn = mock.fn(async () => ({ ok: true, json: async () => [] }));
  const ctx = mkContext({ fetchFn });
  const res = await onRequest(ctx);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.processados, 0);
});
```

- [ ] **Step 2: Rodar tests pra confirmar fail**

```bash
node --test tests/api/cron-resumo-semanal.test.mjs
```

Expected: 6 tests fail.

- [ ] **Step 3: Implementar endpoint**

```javascript
// functions/api/cron/resumo-semanal.js
// POST /api/cron/resumo-semanal
// Bearer auth com CRON_SECRET. Disparado pelo cron-worker SCHEDULE_MAP entry "0 12 * * 1".
// Loop em todos tenants ativos, gera resumo via LLM, salva em tenants.resumo_semanal_atual.
// Try/catch isolado por tenant — uma falha não derruba batch.

import { weekStartBrt } from '../../_lib/dashboard-time.js';
import { buildPrompt, callLlm } from '../../_lib/resumo-semanal-prompt.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const CORS = {
  'Access-Control-Allow-Origin': '*',  // cron interno
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

async function fetchStatsLocal(env, fetchFn, tenantId, sinceIso, untilIso) {
  // Replica de dashboard/regenerate-resumo-semanal#fetchStats. DRY: extrair pra _lib se virar 3ª replica.
  const conversasRes = await fetchFn(
    `${SUPABASE_URL}/rest/v1/conversas?select=count&tenant_id=eq.${tenantId}&created_at=gte.${encodeURIComponent(sinceIso)}&created_at=lt.${encodeURIComponent(untilIso)}`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  );
  const conversas = (await conversasRes.json())?.[0]?.count ?? 0;

  const orcRes = await fetchFn(
    `${SUPABASE_URL}/rest/v1/orcamentos?select=count&tenant_id=eq.${tenantId}&created_at=gte.${encodeURIComponent(sinceIso)}&created_at=lt.${encodeURIComponent(untilIso)}`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  );
  const orcamentos = (await orcRes.json())?.[0]?.count ?? 0;

  const sinalRes = await fetchFn(`${SUPABASE_URL}/rest/v1/rpc/dashboard_resumo_periodo`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_tenant_id: tenantId, p_since: sinceIso, p_until: untilIso }),
  });
  const sinalRow = (await sinalRes.json())?.[0] || {};
  return {
    conversas,
    orcamentos,
    fechados: sinalRow.fechados || 0,
    sinal_recebido: parseFloat(sinalRow.sum_sinal || 0),
  };
}

async function processTenant(env, fetchFn, tenant, semanaAtualInicio, semanaAtualFim, semanaAnteriorInicio, semanaAnteriorFim) {
  const stats = {
    semana_atual: await fetchStatsLocal(env, fetchFn, tenant.id, semanaAtualInicio.toISOString(), semanaAtualFim.toISOString()),
    semana_anterior: await fetchStatsLocal(env, fetchFn, tenant.id, semanaAnteriorInicio.toISOString(), semanaAnteriorFim.toISOString()),
    nome_estudio: tenant.nome,
  };
  const prompt = buildPrompt(stats);
  const texto = await callLlm({ prompt, apiKey: env.OPENAI_API_KEY, fetchFn });
  const agora = new Date().toISOString();
  const resumo = {
    texto,
    gerado_em: agora,
    periodo_inicio: semanaAtualInicio.toISOString(),
    periodo_fim: semanaAtualFim.toISOString(),
    modelo: 'gpt-4o-mini',
  };
  const patchRes = await fetchFn(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${tenant.id}`, {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ resumo_semanal_atual: resumo }),
  });
  if (!patchRes.ok) throw new Error(`patch ${patchRes.status}`);
}

export async function onRequest(context) {
  const { request, env } = context;
  const fetchFn = env._fetch || fetch;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== env.CRON_SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // Lista tenants ativos
  const tenantsRes = await fetchFn(
    `${SUPABASE_URL}/rest/v1/tenants?select=id,nome,sinal_percentual&ativo=eq.true`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  );
  if (!tenantsRes.ok) return json({ error: 'Erro listando tenants' }, 500);
  const tenants = await tenantsRes.json();

  if (tenants.length === 0) {
    return json({ ok: true, processados: 0, falhas: 0, detalhes: [] });
  }

  const semanaAtualInicio = weekStartBrt();
  const semanaAtualFim = new Date();
  const semanaAnteriorInicio = new Date(semanaAtualInicio.getTime() - 7 * 86400_000);
  const semanaAnteriorFim = semanaAtualInicio;

  const detalhes = [];
  let processados = 0;
  let falhas = 0;
  for (const tenant of tenants) {
    try {
      await processTenant(env, fetchFn, tenant, semanaAtualInicio, semanaAtualFim, semanaAnteriorInicio, semanaAnteriorFim);
      processados++;
      detalhes.push({ tenant_id: tenant.id, ok: true });
    } catch (err) {
      falhas++;
      console.error(`cron resumo-semanal falhou tenant ${tenant.id}:`, err.message);
      detalhes.push({ tenant_id: tenant.id, ok: false, error: err.message });
    }
  }

  return json({ ok: true, processados, falhas, detalhes });
}
```

- [ ] **Step 4: Rodar tests pra confirmar pass**

```bash
node --test tests/api/cron-resumo-semanal.test.mjs
```

Expected: `tests 6 / pass 6`.

- [ ] **Step 5: Commit**

```bash
git add functions/api/cron/resumo-semanal.js tests/api/cron-resumo-semanal.test.mjs
git commit -m "feat(api): POST /api/cron/resumo-semanal — loop tenants, try/catch isolado

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 4.2: Wire cron-worker (trigger + SCHEDULE_MAP)

**Files:**
- Modify: `cron-worker/wrangler.toml` (linhas em `[triggers]`)
- Modify: `cron-worker/src/index.js` (constante `SCHEDULE_MAP`)

- [ ] **Step 1: Adicionar trigger em wrangler.toml**

Editar `cron-worker/wrangler.toml`. Encontrar bloco `[triggers]` `crons = [...]` e adicionar:

```toml
  "0 12 * * 1",     # seg 09:00 BRT → /api/cron/resumo-semanal
```

Como última linha do array (antes do `]`).

- [ ] **Step 2: Adicionar SCHEDULE_MAP entry em cron-worker/src/index.js**

Editar `cron-worker/src/index.js`. Encontrar `const SCHEDULE_MAP = { ... }` e adicionar entry:

```javascript
  '0 12 * * 1':   { path: '/api/cron/resumo-semanal',     secretEnv: 'CRON_SECRET', label: 'resumo-semanal' },
```

Como última linha antes do `};`.

- [ ] **Step 3: Validar sintaxe**

```bash
node --check cron-worker/src/index.js
```

Expected: sem output (sintaxe OK).

- [ ] **Step 4: Commit**

```bash
git add cron-worker/wrangler.toml cron-worker/src/index.js
git commit -m "feat(cron-worker): wire trigger seg 9h BRT → /api/cron/resumo-semanal

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Fase 5 — UI (studio.html)

> **Decisão:** Cada slot é uma sub-task isolada pra commit granular + review focado.

### Task 5.1: 5 KPI cards na Dashboard tab

**Files:**
- Modify: `studio.html` (Dashboard placeholder + JS data fetching)

- [ ] **Step 1: Localizar placeholder Dashboard**

```bash
grep -n "Dashboard\|painel-dashboard\|tab-dashboard" studio.html | head -10
```

Identificar elemento placeholder do Dashboard que foi criado no PR #21 Foundation.

- [ ] **Step 2: Substituir HTML do painel Dashboard**

Substituir o conteúdo do `<section id="painel-dashboard">` (ou similar identificado no Step 1) por:

```html
<section id="painel-dashboard" class="painel" hidden>
  <div class="dashboard-kpis" id="dashboard-kpis">
    <div class="kpi-card" data-kpi="conversas-hoje">
      <div class="kpi-label">Conversas hoje</div>
      <div class="kpi-value" id="kpi-conversas-hoje">—</div>
    </div>
    <div class="kpi-card" data-kpi="orcamentos-semana">
      <div class="kpi-label">Orçamentos esta semana</div>
      <div class="kpi-value" id="kpi-orcamentos-semana">—</div>
    </div>
    <div class="kpi-card" data-kpi="aguardando-sinal">
      <div class="kpi-label">Aguardando sinal</div>
      <div class="kpi-value" id="kpi-aguardando-sinal">—</div>
    </div>
    <div class="kpi-card" data-kpi="taxa-conversao">
      <div class="kpi-label">Taxa de conversão (30d)</div>
      <div class="kpi-value" id="kpi-taxa-conversao">—</div>
    </div>
    <div class="kpi-card" data-kpi="sinal-recebido">
      <div class="kpi-label">Sinal recebido (semana)</div>
      <div class="kpi-value" id="kpi-sinal-recebido">—</div>
    </div>
  </div>
  <!-- Slots adicionados em tasks subsequentes -->
  <div id="dashboard-atividade-recente"></div>
  <div id="dashboard-resumo-semanal"></div>
  <div id="dashboard-conectar-telegram"></div>
  <div id="dashboard-info-estudio"></div>
</section>
```

- [ ] **Step 3: Adicionar CSS pros KPI cards**

No `<style>` global do studio.html, adicionar:

```css
.dashboard-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}
.kpi-card {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.kpi-label { font-size: 13px; color: var(--text-muted, #6b7280); }
.kpi-value { font-size: 28px; font-weight: 700; color: var(--text, #111); }
.kpi-card.loading .kpi-value { color: var(--text-muted, #9ca3af); }
@media (max-width: 768px) {
  .dashboard-kpis { grid-template-columns: repeat(2, 1fr); }
}
```

- [ ] **Step 4: Adicionar JS pra carregar KPIs**

Em `<script>` global (ou na função que abre o painel Dashboard), adicionar:

```javascript
async function loadDashboardKpis() {
  const cards = document.querySelectorAll('.kpi-card');
  cards.forEach(c => c.classList.add('loading'));
  try {
    const token = getStudioToken(); // helper já existente no studio.html
    const res = await fetch(`/api/dashboard/kpis?studio_token=${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error(`kpis ${res.status}`);
    const { kpis } = await res.json();
    document.getElementById('kpi-conversas-hoje').textContent = kpis.conversas_hoje;
    document.getElementById('kpi-orcamentos-semana').textContent = kpis.orcamentos_esta_semana;
    document.getElementById('kpi-aguardando-sinal').textContent = kpis.aguardando_sinal;
    document.getElementById('kpi-taxa-conversao').textContent = `${kpis.taxa_conversao_30d}%`;
    document.getElementById('kpi-sinal-recebido').textContent = `R$ ${kpis.sinal_recebido_semana.toFixed(2)}`;
  } catch (err) {
    console.error('Erro carregando KPIs:', err);
    cards.forEach(c => c.querySelector('.kpi-value').textContent = '?');
  } finally {
    cards.forEach(c => c.classList.remove('loading'));
  }
}

// Hook: carregar quando user navegar pro painel Dashboard
// (assumindo função showPainel(name) existente no studio.html)
const _origShowPainel = window.showPainel;
window.showPainel = function(name) {
  _origShowPainel.call(this, name);
  if (name === 'dashboard') loadDashboardKpis();
};
```

- [ ] **Step 5: Smoke manual no browser**

Abrir `https://inkflowbrasil.com/studio.html?token=<token-test>`, navegar pro painel Dashboard, abrir DevTools Network. Verificar:
- Request `GET /api/dashboard/kpis?studio_token=...` retorna 200
- 5 cards mostram valores numéricos (todos 0 em prod com Dagobert)
- Sem erro no console

- [ ] **Step 6: Commit**

```bash
git add studio.html
git commit -m "feat(studio): Dashboard 5 KPI cards + JS loadDashboardKpis

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 5.2: Slot Atividade recente

**Files:**
- Modify: `studio.html`

- [ ] **Step 1: Substituir `<div id="dashboard-atividade-recente"></div>` por estrutura real**

```html
<div id="dashboard-atividade-recente" class="dashboard-slot">
  <h3>Atividade recente</h3>
  <ul id="atividade-recente-lista" class="atividade-lista"></ul>
  <div id="atividade-recente-empty" class="atividade-empty" hidden>
    Nenhuma conversa ainda. Quando o bot atender clientes, eles aparecem aqui.
  </div>
</div>
```

- [ ] **Step 2: Adicionar CSS**

```css
.dashboard-slot {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 24px;
}
.dashboard-slot h3 { font-size: 16px; margin: 0 0 12px; }
.atividade-lista { list-style: none; padding: 0; margin: 0; }
.atividade-item {
  display: flex;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border, #f3f4f6);
  cursor: pointer;
  align-items: center;
}
.atividade-item:last-child { border-bottom: none; }
.atividade-item:hover { background: var(--bg-hover, #f9fafb); }
.atividade-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--avatar-bg, #e5e7eb);
  display: flex; align-items: center; justify-content: center;
  font-weight: 600; color: var(--text, #111);
}
.atividade-info { flex: 1; min-width: 0; }
.atividade-nome { font-weight: 500; font-size: 14px; }
.atividade-meta { font-size: 12px; color: var(--text-muted, #6b7280); display: flex; gap: 8px; align-items: center; }
.atividade-badge { padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500; }
.atividade-empty { color: var(--text-muted, #9ca3af); padding: 12px 0; }
```

- [ ] **Step 3: Adicionar JS pra renderizar lista**

```javascript
function renderAtividadeRecente(atividades) {
  const lista = document.getElementById('atividade-recente-lista');
  const empty = document.getElementById('atividade-recente-empty');
  lista.innerHTML = '';
  if (atividades.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  for (const a of atividades) {
    const li = document.createElement('li');
    li.className = 'atividade-item';
    li.dataset.conversaId = a.id;

    const avatar = document.createElement('div');
    avatar.className = 'atividade-avatar';
    avatar.textContent = (a.nome || '?').charAt(0).toUpperCase();

    const info = document.createElement('div');
    info.className = 'atividade-info';
    const nome = document.createElement('div');
    nome.className = 'atividade-nome';
    nome.textContent = a.nome;
    const meta = document.createElement('div');
    meta.className = 'atividade-meta';
    const badge = document.createElement('span');
    badge.className = 'atividade-badge';
    badge.textContent = a.estado_agente.replace(/_/g, ' ');
    badge.style.background = badgeColor(a.estado_agente);
    const ts = document.createElement('span');
    ts.textContent = formatRelativeTime(a.last_msg_at);
    meta.append(badge, ts);
    info.append(nome, meta);

    li.append(avatar, info);
    li.addEventListener('click', () => {
      // Navega pra Conversas + abre thread
      showPainel('conversas');
      if (typeof openConversaById === 'function') openConversaById(a.id);
    });
    lista.appendChild(li);
  }
}

function badgeColor(estado) {
  const map = {
    coletando_tattoo: '#dbeafe',
    coletando_cadastro: '#dbeafe',
    aguardando_tatuador: '#fef3c7',
    propondo_valor: '#dcfce7',
    aguardando_decisao_desconto: '#fef3c7',
    escolhendo_horario: '#dcfce7',
    aguardando_sinal: '#fef3c7',
    lead_frio: '#fee2e2',
    fechado: '#e5e7eb',
  };
  return map[estado] || '#f3f4f6';
}

// formatRelativeTime já existe no studio.html (PR #24 implementou). Reutilizar.

async function loadAtividadeRecente() {
  try {
    const token = getStudioToken();
    const res = await fetch(`/api/dashboard/atividade-recente?studio_token=${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error(`atividade ${res.status}`);
    const { atividades } = await res.json();
    renderAtividadeRecente(atividades);
  } catch (err) {
    console.error('Erro atividade-recente:', err);
  }
}
```

Atualizar `loadDashboardKpis` callback do showPainel pra também chamar `loadAtividadeRecente`:

```javascript
window.showPainel = function(name) {
  _origShowPainel.call(this, name);
  if (name === 'dashboard') {
    loadDashboardKpis();
    loadAtividadeRecente();
  }
};
```

- [ ] **Step 4: Smoke manual**

Abrir Dashboard. Verificar lista renderiza últimas 3 conversas (em prod com Dagobert: 0 conversas → empty state visível).

- [ ] **Step 5: Commit**

```bash
git add studio.html
git commit -m "feat(studio): Dashboard slot Atividade recente (3 conversas + click → thread)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 5.3: Slot Resumo semanal IA + botão regenerate

**Files:**
- Modify: `studio.html`

- [ ] **Step 1: Substituir `<div id="dashboard-resumo-semanal"></div>` por estrutura real**

```html
<div id="dashboard-resumo-semanal" class="dashboard-slot">
  <div class="resumo-header">
    <h3>Resumo semanal</h3>
    <button id="btn-atualizar-resumo" class="btn-secondary">Atualizar resumo</button>
  </div>
  <p id="resumo-texto" class="resumo-texto"></p>
  <p id="resumo-meta" class="resumo-meta"></p>
</div>
```

- [ ] **Step 2: CSS**

```css
.resumo-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.resumo-texto { font-size: 14px; line-height: 1.5; color: var(--text, #111); margin: 8px 0; }
.resumo-meta { font-size: 12px; color: var(--text-muted, #6b7280); margin: 0; }
.btn-secondary { padding: 6px 12px; border-radius: 6px; background: transparent; border: 1px solid var(--border, #d1d5db); cursor: pointer; font-size: 13px; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary:hover:not(:disabled) { background: var(--bg-hover, #f9fafb); }
```

- [ ] **Step 3: JS pra renderizar resumo + handler do botão**

```javascript
function renderResumoSemanal(resumo, ultima_geracao_manual) {
  const texto = document.getElementById('resumo-texto');
  const meta = document.getElementById('resumo-meta');
  const btn = document.getElementById('btn-atualizar-resumo');

  if (!resumo || !resumo.texto) {
    texto.textContent = 'Próximo resumo na segunda 9h.';
    meta.textContent = '';
  } else {
    texto.textContent = resumo.texto;
    const geradoEm = new Date(resumo.gerado_em);
    meta.textContent = `Gerado ${formatRelativeTime(resumo.gerado_em)} · ${geradoEm.toLocaleDateString('pt-BR')}`;
  }

  // Rate-limit: desabilitar botão se ultima_geracao_manual nas últimas 24h
  if (ultima_geracao_manual) {
    const ultimaMs = new Date(ultima_geracao_manual).getTime();
    if (Date.now() - ultimaMs < 24 * 3600_000) {
      btn.disabled = true;
      btn.title = 'Já atualizado hoje, volta amanhã';
    }
  }
}

async function loadResumoSemanal() {
  // Resumo vem direto de tenants.resumo_semanal_atual via /api/get-tenant ou similar.
  // Aproveitamos que studio.html já carrega tenant data ao abrir — apenas extrair.
  if (window.tenantData) {
    renderResumoSemanal(
      window.tenantData.resumo_semanal_atual,
      window.tenantData.resumo_semanal_ultima_geracao_manual
    );
  }
}

document.getElementById('btn-atualizar-resumo')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-atualizar-resumo');
  btn.disabled = true;
  btn.textContent = 'Atualizando...';
  try {
    const token = getStudioToken();
    const res = await fetch(`/api/dashboard/regenerate-resumo-semanal?studio_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.status === 429) {
      const { error } = await res.json();
      alert(error || 'Já atualizado hoje');
      return;
    }
    if (!res.ok) throw new Error(`regenerate ${res.status}`);
    const { resumo } = await res.json();
    renderResumoSemanal(resumo, new Date().toISOString());
    btn.disabled = true;
    btn.title = 'Já atualizado hoje';
  } catch (err) {
    console.error('Erro regenerate:', err);
    alert('Erro ao gerar resumo. Tenta de novo em instantes.');
  } finally {
    btn.textContent = 'Atualizar resumo';
  }
});
```

Atualizar `showPainel` callback:

```javascript
window.showPainel = function(name) {
  _origShowPainel.call(this, name);
  if (name === 'dashboard') {
    loadDashboardKpis();
    loadAtividadeRecente();
    loadResumoSemanal();
  }
};
```

- [ ] **Step 4: Smoke manual**

Abrir Dashboard. Verificar:
- Slot mostra "Próximo resumo na segunda 9h" se `tenants.resumo_semanal_atual` IS NULL
- Click "Atualizar resumo" → loading → texto aparece + botão fica disabled

- [ ] **Step 5: Commit**

```bash
git add studio.html
git commit -m "feat(studio): Dashboard slot Resumo semanal IA + botão regenerate (rate-limit)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 5.4: Slot Conectar Telegram + Info estúdio

**Files:**
- Modify: `studio.html`

- [ ] **Step 1: Substituir os 2 divs**

```html
<div id="dashboard-conectar-telegram" class="dashboard-slot dashboard-slot-cta" hidden>
  <h3>Conecte seu Telegram</h3>
  <p>Pra receber orçamentos do InkFlow no Telegram, escaneia o QR ou clica no link:</p>
  <div class="conectar-tg-content">
    <img id="conectar-tg-qr" alt="QR code Telegram" />
    <a id="conectar-tg-link" href="" target="_blank" rel="noopener">Abrir no Telegram</a>
  </div>
  <p id="conectar-tg-status" class="conectar-tg-status">Aguardando conexão…</p>
</div>

<div id="dashboard-info-estudio" class="dashboard-slot">
  <h3>Estúdio</h3>
  <ul class="info-estudio-lista">
    <li><span class="info-label">Nome</span> <span id="info-nome">—</span></li>
    <li><span class="info-label">Plano</span> <span id="info-plano" class="badge"></span></li>
    <li><span class="info-label">Responsável</span> <span id="info-responsavel">—</span></li>
    <li><span class="info-label">WhatsApp</span> <span id="info-whatsapp">—</span></li>
  </ul>
</div>
```

- [ ] **Step 2: CSS**

```css
.dashboard-slot-cta { background: linear-gradient(135deg, #f3e8ff 0%, #fae8ff 100%); }
.conectar-tg-content { display: flex; gap: 16px; align-items: center; }
#conectar-tg-qr { width: 120px; height: 120px; }
#conectar-tg-link { color: var(--accent, #7c3aed); text-decoration: underline; }
.conectar-tg-status { font-size: 13px; color: var(--text-muted, #6b7280); margin-top: 8px; }
.info-estudio-lista { list-style: none; padding: 0; margin: 0; }
.info-estudio-lista li { display: flex; justify-content: space-between; padding: 6px 0; }
.info-label { color: var(--text-muted, #6b7280); font-size: 13px; }
.badge { padding: 2px 8px; border-radius: 4px; background: var(--bg-hover, #e5e7eb); font-size: 12px; font-weight: 500; }
```

- [ ] **Step 3: JS — slot Conectar Telegram condicional + polling**

```javascript
let _telegramPollTimer = null;

function renderConectarTelegram() {
  const slot = document.getElementById('dashboard-conectar-telegram');
  if (!window.tenantData) return;
  const tg = window.tenantData.tatuador_telegram_chat_id;
  if (tg) {
    // Já conectado → esconder
    slot.hidden = true;
    return;
  }
  slot.hidden = false;

  // Reaproveitar QR pattern do onboarding Telegram
  const onboardingKey = window.tenantData.onboarding_key || '';
  const link = `https://t.me/inkflow_studio_bot?start=${encodeURIComponent(onboardingKey)}`;
  document.getElementById('conectar-tg-link').href = link;
  // QR usando api.qrserver.com (mesmo pattern do PR #19 onboarding)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(link)}`;
  document.getElementById('conectar-tg-qr').src = qrUrl;

  // Polling /api/check-telegram-connected a cada 3s
  if (_telegramPollTimer) clearInterval(_telegramPollTimer);
  _telegramPollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/check-telegram-connected?onboarding_key=${encodeURIComponent(onboardingKey)}`);
      if (!res.ok) return;
      const { connected } = await res.json();
      if (connected) {
        document.getElementById('conectar-tg-status').textContent = '✅ Conectado!';
        clearInterval(_telegramPollTimer);
        _telegramPollTimer = null;
        // Recarregar tenant data + esconder slot
        if (typeof reloadTenantData === 'function') await reloadTenantData();
        slot.hidden = true;
      }
    } catch {} // silencioso
  }, 3000);
}

function renderInfoEstudio() {
  if (!window.tenantData) return;
  const t = window.tenantData;
  document.getElementById('info-nome').textContent = t.nome_estudio || t.nome || '—';
  document.getElementById('info-plano').textContent = t.plano || 'trial';
  document.getElementById('info-responsavel').textContent = t.nome_agente || t.nome || '—';
  document.getElementById('info-whatsapp').textContent = t.evo_instance || '—';
}

window.showPainel = function(name) {
  _origShowPainel.call(this, name);
  if (name === 'dashboard') {
    loadDashboardKpis();
    loadAtividadeRecente();
    loadResumoSemanal();
    renderConectarTelegram();
    renderInfoEstudio();
  } else {
    // Limpar polling Telegram quando sai do Dashboard
    if (_telegramPollTimer) {
      clearInterval(_telegramPollTimer);
      _telegramPollTimer = null;
    }
  }
};
```

- [ ] **Step 4: Smoke manual**

Tenant Dagobert tem Telegram conectado → slot deve ficar HIDDEN. Info estúdio deve mostrar nome+plano+responsável+WA.

- [ ] **Step 5: Commit**

```bash
git add studio.html
git commit -m "feat(studio): Dashboard slot Conectar Telegram (condicional) + Info estúdio

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 5.5: Header indicators (WhatsApp + Telegram)

**Files:**
- Modify: `studio.html`

- [ ] **Step 1: Localizar header existente**

```bash
grep -n "<header\|class=\"header\|#header-" studio.html | head -10
```

- [ ] **Step 2: Adicionar indicadores ao header**

Inserir antes do fechamento do `<header>` ou ao lado do nome do estúdio:

```html
<div class="header-indicators">
  <span id="indicator-whatsapp" class="indicator" title="WhatsApp">
    <span class="indicator-dot"></span>WhatsApp
  </span>
  <span id="indicator-telegram" class="indicator" title="Telegram" hidden>
    <span class="indicator-dot"></span>Telegram
  </span>
</div>
```

- [ ] **Step 3: CSS**

```css
.header-indicators { display: flex; gap: 12px; font-size: 12px; }
.indicator { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.indicator-dot { width: 8px; height: 8px; border-radius: 50%; background: #9ca3af; }
.indicator.ok .indicator-dot { background: #22c55e; }
.indicator.warn .indicator-dot { background: #f59e0b; }
.indicator.fail .indicator-dot { background: #ef4444; }
```

- [ ] **Step 4: JS pra atualizar indicators**

```javascript
function updateHeaderIndicators() {
  if (!window.tenantData) return;
  const t = window.tenantData;

  // WhatsApp: tenants.whatsapp_status
  const wa = document.getElementById('indicator-whatsapp');
  wa.classList.remove('ok', 'warn', 'fail');
  const waStatus = t.whatsapp_status || 'unknown';
  if (waStatus === 'online') wa.classList.add('ok');
  else if (waStatus === 'pending' || waStatus === 'unknown') wa.classList.add('warn');
  else wa.classList.add('fail');
  wa.title = `WhatsApp: ${waStatus}`;
  wa.onclick = () => showPainel('settings');

  // Telegram: derivado de tatuador_telegram_chat_id (Coleta only)
  const tg = document.getElementById('indicator-telegram');
  const modo = t.config_precificacao?.modo || 'coleta';
  if (modo === 'exato') {
    tg.hidden = true;
    return;
  }
  tg.hidden = false;
  tg.classList.remove('ok', 'warn', 'fail');
  if (t.tatuador_telegram_chat_id) {
    tg.classList.add('ok');
    tg.title = 'Telegram: conectado';
  } else {
    tg.classList.add('fail');
    tg.title = 'Telegram: desconectado';
  }
  tg.onclick = () => showPainel('settings');
}

// Hook: chamar ao carregar tenant data
const _origLoadTenant = window.loadTenantData || (() => {});
window.loadTenantData = async function() {
  await _origLoadTenant.apply(this, arguments);
  updateHeaderIndicators();
};
// Também chamar no startup
document.addEventListener('DOMContentLoaded', () => {
  if (window.tenantData) updateHeaderIndicators();
});
```

- [ ] **Step 5: Smoke manual**

- Tenant em Coleta com WA online + Telegram conectado: 2 dots verdes
- Tenant em Coleta sem Telegram: WA verde, Telegram vermelho
- Tenant em Exato: só WA aparece

- [ ] **Step 6: Commit**

```bash
git add studio.html
git commit -m "feat(studio): Header com indicators WhatsApp + Telegram (Coleta only)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Fase 6 — Smoke + PR

### Task 6.1: Atualizar test runner + audit + push + open PR

**Files:**
- Modify: `scripts/test-prompts.sh`

- [ ] **Step 1: Adicionar 6 novos test files no runner**

Editar `scripts/test-prompts.sh`. Antes da linha `echo "✓ Todos os tests passaram."`, adicionar:

```bash
echo "▶ Lib — dashboard-time..."
node --test tests/_lib/dashboard-time.test.mjs

echo "▶ Lib — resumo-semanal-prompt..."
node --test tests/_lib/resumo-semanal-prompt.test.mjs

echo "▶ API — dashboard kpis..."
node --test tests/api/dashboard-kpis.test.mjs

echo "▶ API — dashboard atividade-recente..."
node --test tests/api/dashboard-atividade-recente.test.mjs

echo "▶ API — dashboard regenerate-resumo..."
node --test tests/api/dashboard-regenerate-resumo.test.mjs

echo "▶ API — cron resumo-semanal..."
node --test tests/api/cron-resumo-semanal.test.mjs
```

- [ ] **Step 2: Rodar bateria full**

```bash
bash scripts/test-prompts.sh
```

Expected: última linha `✓ Todos os tests passaram.`. Se algum falha, parar e fixar antes de PR.

- [ ] **Step 3: Audit grep — sem refs a tabela orcamentos hardcoded**

```bash
grep -rn "FROM orcamentos\|/rest/v1/orcamentos" functions/ tests/ 2>&1 | grep -v '\.test\.mjs' | head
```

Esperado: matches só em `functions/api/dashboard/kpis.js`, `functions/api/dashboard/regenerate-resumo-semanal.js`, `functions/api/cron/resumo-semanal.js`. Nenhum reference a tabela orcamentos como entidade física (todas leem da view).

- [ ] **Step 4: Audit grep — sem placeholders TODO/FIXME**

```bash
grep -rn "TODO\|FIXME\|XXX" functions/api/dashboard/ functions/api/cron/resumo-semanal.js functions/_lib/dashboard-time.js functions/_lib/resumo-semanal-prompt.js 2>&1 | head
```

Esperado: zero matches.

- [ ] **Step 5: Commit final**

```bash
git add scripts/test-prompts.sh
git commit -m "test: incluir 6 novos test files do PR 2 Dashboard no runner

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Push + abrir PR**

```bash
git push -u origin feat/pagina-tatuador-pr2-dashboard
gh pr create --title "PR 2 Dashboard: KPIs + Atividade recente + Resumo IA + slot Telegram" --body "$(cat <<'EOF'
## Summary

PR 2 do refator página tatuador — implementa o Painel Dashboard completo, fechando o ciclo Modo Coleta v2 (tatuador agora vê quantos orçamentos estão aguardando resposta dele no Telegram).

- **5 KPI cards**: Conversas hoje, Orçamentos esta semana, Aguardando sinal, Taxa de conversão (30d), Sinal recebido (semana)
- **Slot Atividade recente**: últimas 3 conversas com link pra Conversas
- **Slot Resumo semanal IA**: cron seg 9h BRT (gpt-4o-mini) + botão regenerate rate-limit 1×/24h
- **Slot Conectar Telegram**: condicional (some quando conectado), reaproveita QR do onboarding Coleta v2
- **Slot Info estúdio**: nome, plano, responsável, WhatsApp
- **Header indicators**: WhatsApp + Telegram (esconde no Modo Exato)

KPIs leem da view `orcamentos` (criada em 2026-05-05 — projeção de `conversas WHERE valor_proposto IS NOT NULL`). Sem duplicação de dados.

## Test plan
- [ ] `bash scripts/test-prompts.sh` passa 100%
- [ ] Smoke browser em prod: Dashboard renderiza 5 cards (todos 0 com Dagobert), atividade recente vazia, resumo "Próximo resumo segunda 9h", slot Telegram hidden (Dagobert já conectado)
- [ ] Click "Atualizar resumo" gera resumo via OpenAI + atualiza UI + botão desabilita
- [ ] Cron seg 9h BRT roda em prod (verificar via `inkflow-cron` Workers logs)
- [ ] Header mostra WA verde + Telegram verde

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Critérios de DONE (do plano-mestre + spec)

- [ ] Tatuador novo (tenant trial) abre Dashboard, vê todos os KPIs em 0, "Próximo resumo na segunda 9h", slot Conectar Telegram visível.
- [ ] Tatuador existente (Dagobert) vê KPIs com dados reais (0 hoje porque sem conversas; mas estrutura correta).
- [ ] Cron `0 12 * * 1` roda pelo menos 1x em prod, gera resumo válido em `tenants.resumo_semanal_atual`.
- [ ] Botão "Atualizar resumo" funciona, desabilita após click até next day (rate-limit via `resumo_semanal_ultima_geracao_manual`).
- [ ] Bateria de testes verde (`bash scripts/test-prompts.sh` passa 100%).
- [ ] Header indicators corretos por modo (Exato esconde Telegram, Coleta mostra ambos).

---

## Estimativa de esforço

| Fase | Esforço |
|---|---|
| 0 Pre-flight | 15min |
| 1 Migration | 30min |
| 2 Helpers (BRT + LLM) | 1.5h |
| 3 Endpoints Dashboard (3) | 4h |
| 4 Cron (endpoint + wire worker) | 2h |
| 5 UI (5 sub-tasks) | 4h |
| 6 Smoke + PR | 30min |

**Total:** ~12h de execução com Claude assistido. Distribuído em 1.5-2 dias se sessões fragmentadas.

---

## Notas de execução

- Branch única `feat/pagina-tatuador-pr2-dashboard`. PR só ao final, com tudo verde.
- Cada commit roda os testes da fase antes de fechar.
- Se baseline de tests quebra durante execução, **parar** e investigar — qualidade > velocidade ([[feedback_qualidade_sobre_pressa]]).
- Tasks 3.1, 3.2, 3.3, 4.1 são pipeline-completa candidatas (multi-file + lógica BRT + auth + LLM). Tasks 5.1-5.5 são implementer-only (UI mecânica).
- View `orcamentos` é leitura-only — qualquer escrita continua sendo via tools que mexem em `conversas`.
- Atualizar Painel + memory anchors ao fim do PR ([[feedback_atualizar_painel_e_mapa_geral_sempre]]).
