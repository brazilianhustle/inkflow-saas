# Sub-3.2 PropostaAgent v2 + route.js orquestrador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar PropostaAgent legacy (single-agent n8n com 6 tools) pra agent v2 pure structured-output + route.js orquestrador que executa side-effects via switch por `proxima_acao`, padronizando builder cross-agent pra retornar `{ agent, validator }`.

**Architecture:** PropostaAgent v2 = `tools=[]` + schema Zod com `proxima_acao` enum + payloads opcionais. route.js cresce com 2 layers: pre-fetch eager (`consultar-horarios`/`consultar-proposta-tatuador`) e orchestrator switch que chama tools internas em `functions/api/tools/*` via `_lib/call-tool.js` (header `X-Inkflow-Tool-Secret`). Closure pattern: builder devolve `{ agent, validator }` com validator pre-vinculado a `clientContext + estado_atual` — refactor aplicado em paridade pros 3 agents (tattoo/cadastro/proposta), eliminando `selectAgentValidator`.

**Tech Stack:** `@openai/agents` (Agents SDK), `gpt-4o-mini`, Zod, Cloudflare Pages Functions, `node:test` + `assert/strict` + `mock` from `node:test` (NOT vitest — confirmado em `package.json: "test": "node --test tests/**/*.test.mjs"`), `wrangler pages dev` smoke, evals via `tests/agent/proposta-agent.eval.mjs`.

**Test conventions (lock-in):**
- `import { test, mock } from 'node:test';`
- `import assert from 'node:assert/strict';`
- Asserts: `assert.equal`, `assert.deepEqual`, `assert.match`, `assert.ok`, `assert.doesNotMatch`, `assert.rejects`, `assert.throws` (NOTA: API correta do Node é `doesNotMatch`, não `notMatch`)
- Mocks: `globalThis.fetch = mock.fn(async () => ({...}))` (mock global) ou `mock.method(obj, 'name', fn)` (monkey-patch); cleanup local via `t.after(() => { globalThis.fetch = original; })` por test (node:test API — sem `beforeEach`/`afterEach` globais)
- Test files: `*.test.mjs` (CI runs); eval files: `*.eval.mjs` (manual, paid)
- Fixtures: `JSON.parse(readFileSync(join(__dirname, '_fixtures', 'x.json'), 'utf-8'))` — sem import attributes
- Sem `describe/it/beforeEach`/`vi.*`/`expect()` — repo NÃO tem vitest instalado.

**Spec source:** `docs/superpowers/specs/2026-05-08-sub3-2-proposta-prompt-v2-design.md`

**Branch:** `feature/coleta-proposta-v2` (já criada no brainstorm)

**Decisão cravada antes do plan:** closure pattern = **cross-agent** (tattoo.js + cadastro.js + proposta.js TODOS retornam `{ agent, validator }`; `selectAgentValidator` some).

---

## Risks flagged

- **R1 (secret):** `INKFLOW_TOOL_SECRET` precisa estar em `.dev.vars` pra `wrangler pages dev` rodar smoke. Validado em Task 1.
- **R2 (MercadoPago real):** smoke local de `gerar-link-sinal` chama API real do MP. Mitigação: usar tenant de teste com MP token sandbox configurado. Validado em Task 14.
- **R5 (nome):** `reservar-horario` exige `nome`. Fallback `conversa?.dados_cadastro?.nome || telefone` implementado no orchestrator (Task 11). Validado em Task 1 via Read em CadastroAgent persistence path.
- **R6 (sinal_percentual):** fallback chain dupla `tenant?.config_precificacao?.sinal_percentual ?? tenant?.sinal_percentual ?? 30` (alinhado com pattern legacy em `functions/_lib/prompts/_shared/contexto.js:4`). Aplicado em Task 11 (route.js orchestrator) E Task 9 (contexto.js do Proposta). Confirmação shape em Task 1.
- **R7 (consultar-horarios shape):** shape `{ ok, slots: [{inicio, fim, legenda, ...}] }` confirmado durante o plan via leitura direta de `functions/api/tools/consultar-horarios.js` — campo `r.slots` é correto.
- **Breaking change:** Task 8 muda interface dos builders (todos retornam `{ agent, validator }`). Re-rodar Sub-2/3.1 evals depois pra garantir não-regressão.
- **Estados pausados (501):** `aguardando_decisao_desconto`, `lead_frio`, `fechado` ficam fora deste plan. Sub-4 cuida.

---

## File Structure (planned)

### Helpers novos (`functions/api/agent/_lib/`)
- `calcular-sinal.js` — Math.round((valor * pct/100)*100)/100
- `format-link-sinal-msg.js` — template fixo §3.4 (3 linhas, URL crua, sem markdown)
- `lookup-horario.js` — valida slot ISO contra `horarios_livres`; export `isValidIso`
- `call-tool.js` — fetch wrapper com header `X-Inkflow-Tool-Secret`
- `prefetch-proposta.js` — orquestra `consultar-horarios` / `consultar-proposta-tatuador` por estado

### Agent novo (`functions/api/agent/agents/proposta.js`)
- `PropostaOutputSchema` (Zod): `resposta_cliente`, `proxima_acao`, payloads opcionais (`slot_inicio`, `slot_fim`, `valor_pedido_cliente`)
- `validatePropostaOutputInvariant(out, ctx, estado_atual)` — hard-fail OR silently force pergunta
- `buildPropostaAgent({ env, tenant, conversa, clientContext, estado_atual })` — retorna `{ agent, validator }` (validator closure-bound)

### Refactor cross-agent
- `agents/tattoo.js`, `agents/cadastro.js` — adaptar pra retornar `{ agent, validator }`
- `agent/router.js` — remover `VALIDATORS`/`selectAgentValidator`; adicionar entries pros 3 sub-estados de Proposta em `BUILDERS`/`NEXT_STATE`
- `agent/route.js` — destructure `{ agent, validator }` do builder; orchestrator switch + pre-fetch + force pergunta

### Prompt v2 (`functions/_lib/prompts/coleta/proposta/`)
- NOVOS (Task 9): `identidade.js`, `objetivo.js`, `contexto.js`, `faq.js`, `decisao.js`, `exemplos.js`
- EDIT (Task 10 — atomic com generate.js): `generate.js` (rewrite composer 8 blocos), `fluxo.js` (rewrite v2 — ~250 tokens slim)
- EDIT (Task 9 se necessario): `few-shot-tenant.js` (cap 10 se ainda não tiver)
- ÓRFÃOS (não importados, ficam no repo): `regras.js`, `few-shot.js`

**Order rationale (race entre Task 9 e Task 10):** legacy `generate.js` importa `{ fluxo }` de `fluxo.js`. Se Task 9 reescrever `fluxo.js` antes de Task 10 reescrever `generate.js`, o intermediario fica quebrado (`SyntaxError: Named export 'fluxo' not found`) e qualquer `npm test` entre os 2 commits falha. Solucao: Task 9 cria 6 blocos novos sem tocar `fluxo.js`. Task 10 reescreve `generate.js` v2 + `fluxo.js` v2 num unico commit atomic.

### Tests novos (`tests/`)
- `tests/agent/_lib/calcular-sinal.test.mjs`
- `tests/agent/_lib/lookup-horario.test.mjs`
- `tests/agent/_lib/format-link-sinal-msg.test.mjs`
- `tests/agent/_lib/call-tool.test.mjs`
- `tests/agent/_lib/prefetch-proposta.test.mjs`
- `tests/agent/proposta-validator.test.mjs`
- `tests/agent/proposta-agent.eval.mjs`
- `tests/agent/_fixtures/scenarios-proposta.json`

### Tests editados
- `tests/prompts/contracts/coleta-proposta.mjs` (REWRITE — legacy `CONTRACT_COLETA_PROPOSTA` v1 → v2 com novos ancoras + must_not_contain de tool names)
- `tests/prompts/snapshots/coleta-proposta.txt` (regenerado via `bash scripts/update-prompt-snapshots.sh`)
- `tests/prompts/invariants.test.mjs` (filter de `PROMPTS_V1` adiciona `coleta-proposta` na exclusion list — paridade Sub-3.1 cadastro)
- `tests/agent/route.test.mjs` (4 testes proposta — 501 estados pausados + isStateImplemented)

---

## Task 1: Pre-flight validation

Confirma R1, R5, R6 antes de qualquer código novo. Read-only.

**Files:**
- Read: `.dev.vars` (R1: `INKFLOW_TOOL_SECRET`)
- Read: `functions/api/tools/_tool-helpers.js` (R1: confirmar header `X-Inkflow-Tool-Secret`)
- Read: `functions/api/tools/reservar-horario.js` (R5: confirmar `nome` no body)
- Read: `functions/api/agent/agents/cadastro.js` + `tests/agent/cadastro-agent.eval.mjs` (R5: confirmar `dados_cadastro.nome` é persistido)
- Read: `supabase/migrations/*precificacao*` ou `select tenants` (R6: confirmar `config_precificacao.sinal_percentual` shape)

- [ ] **Step 1: Validar `INKFLOW_TOOL_SECRET` em `.dev.vars`**

```bash
grep -c "INKFLOW_TOOL_SECRET" /Users/brazilianhustler/Documents/inkflow-saas/.dev.vars
```
Expected: `1` (linha `INKFLOW_TOOL_SECRET=...`). Se `0`, abortar plan e cravar com Leandro: rotacionar secret + adicionar em `.dev.vars` antes de smoke.

- [ ] **Step 2: Confirmar shape `tenant.config_precificacao.sinal_percentual`**

```bash
ls /Users/brazilianhustler/Documents/inkflow-saas/supabase/migrations/ | grep -i precific
```
Read a migration mais recente que mexe em `config_precificacao`. Confirmar coluna `jsonb` e propriedade `sinal_percentual` (number). Tenants legacy podem ter coluna top-level `tenants.sinal_percentual` — fallback chain dupla `cfg?.sinal_percentual ?? tenant?.sinal_percentual ?? 30` cobre ambos casos (alinhado com `_shared/contexto.js:4`).

- [ ] **Step 3: Confirmar `dados_cadastro.nome` persistido pelo CadastroAgent**

```bash
grep -n "dados_cadastro" /Users/brazilianhustler/Documents/inkflow-saas/functions/api/agent/agents/cadastro.js
grep -rn "dados_cadastro" /Users/brazilianhustler/Documents/inkflow-saas/functions/api/agent/route.js
```
Expected: schema `CadastroOutputSchema.dados_persistidos.nome` existe. route.js (Sub-3.1) escreve `dados_persistidos` que vira `conversa.dados_cadastro` em Sub-4 — pre-Sub-4, fallback `|| telefone` cobre.

- [ ] **Step 4: Confirmar header secret em `_tool-helpers.js`**

```bash
grep -n "X-Inkflow-Tool-Secret\|INKFLOW_TOOL_SECRET" /Users/brazilianhustler/Documents/inkflow-saas/functions/api/tools/_tool-helpers.js
```
Expected: middleware `withTool` valida header contra `env.INKFLOW_TOOL_SECRET`. Confirma que `call-tool.js` precisa enviar esse header em TODA requisição.

- [ ] **Step 5: Sem commit (read-only validation)**

Documentar findings inline na próxima task se algum default precisar ajuste. Sem mudanças no repo.

---

## Task 2: Helper `calcular-sinal.js`

**Files:**
- Create: `functions/api/agent/_lib/calcular-sinal.js`
- Test: `tests/agent/_lib/calcular-sinal.test.mjs`

- [ ] **Step 1: Write failing test**

```js
// tests/agent/_lib/calcular-sinal.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularValorSinal } from '../../../functions/api/agent/_lib/calcular-sinal.js';

test('calcularValorSinal: 30% de 750 = 225', () => {
  assert.equal(calcularValorSinal(750, 30), 225);
});

test('calcularValorSinal: arredonda 2 casas (1000 * 33.33% = 333.3)', () => {
  assert.equal(calcularValorSinal(1000, 33.33), 333.3);
});

test('calcularValorSinal: retorna 0 se valor invalido', () => {
  assert.equal(calcularValorSinal(0, 30), 0);
  assert.equal(calcularValorSinal(-100, 30), 0);
  assert.equal(calcularValorSinal('foo', 30), 0);
  assert.equal(calcularValorSinal(null, 30), 0);
});

test('calcularValorSinal: retorna 0 se pct invalido', () => {
  assert.equal(calcularValorSinal(750, 0), 0);
  assert.equal(calcularValorSinal(750, null), 0);
  assert.equal(calcularValorSinal(750, -10), 0);
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/agent/_lib/calcular-sinal.test.mjs
```
Expected: FAIL "Cannot find module" (helper ainda nao existe).

- [ ] **Step 3: Implement helper**

```js
// functions/api/agent/_lib/calcular-sinal.js
export function calcularValorSinal(valor_proposto, sinal_pct) {
  if (typeof valor_proposto !== 'number' || valor_proposto <= 0) return 0;
  if (typeof sinal_pct !== 'number' || sinal_pct <= 0) return 0;
  return Math.round((valor_proposto * sinal_pct) / 100 * 100) / 100;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/agent/_lib/calcular-sinal.test.mjs
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git add functions/api/agent/_lib/calcular-sinal.js tests/agent/_lib/calcular-sinal.test.mjs && git commit -m "$(cat <<'EOF'
feat(agent/proposta): helper calcular-sinal com unit tests

Sub-3.2 leaf helper. Math.round((valor * pct/100)*100)/100,
fallback 0 pra valores invalidos. 4 unit tests cobrem casos
felizes + 0/negativo/typeof/pct invalido.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Helper `lookup-horario.js` + `isValidIso`

**Files:**
- Create: `functions/api/agent/_lib/lookup-horario.js`
- Test: `tests/agent/_lib/lookup-horario.test.mjs`

- [ ] **Step 1: Write failing test**

```js
// tests/agent/_lib/lookup-horario.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupHorario, isValidIso } from '../../../functions/api/agent/_lib/lookup-horario.js';

const slots = [
  { inicio: '2026-05-12T17:00:00Z', fim: '2026-05-12T20:00:00Z', legenda: 'ter 12/05 14h-17h' },
  { inicio: '2026-05-14T13:00:00Z', fim: '2026-05-14T16:00:00Z', legenda: 'qui 14/05 10h-13h' },
];

test('lookupHorario: encontra slot exato pelo par inicio/fim', () => {
  const r = lookupHorario(slots, '2026-05-12T17:00:00Z', '2026-05-12T20:00:00Z');
  assert.deepEqual(r, slots[0]);
});

test('lookupHorario: retorna null se inicio nao bate', () => {
  assert.equal(lookupHorario(slots, '2026-05-12T18:00:00Z', '2026-05-12T20:00:00Z'), null);
});

test('lookupHorario: retorna null se slots nao for array', () => {
  assert.equal(lookupHorario(null, 'x', 'y'), null);
  assert.equal(lookupHorario(undefined, 'x', 'y'), null);
});

test('lookupHorario: retorna null se lista vazia', () => {
  assert.equal(lookupHorario([], 'x', 'y'), null);
});

test('isValidIso: aceita ISO com T', () => {
  assert.equal(isValidIso('2026-05-12T17:00:00Z'), true);
  assert.equal(isValidIso('2026-05-12T17:00:00-03:00'), true);
});

test('isValidIso: rejeita string sem T', () => {
  assert.equal(isValidIso('2026-05-12 17:00:00'), false);
  assert.equal(isValidIso('2026-05-12'), false);
});

test('isValidIso: rejeita non-string e date invalido', () => {
  assert.equal(isValidIso(null), false);
  assert.equal(isValidIso(123), false);
  assert.equal(isValidIso('foo-T-bar'), false);
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/agent/_lib/lookup-horario.test.mjs
```
Expected: FAIL "Cannot find module".

- [ ] **Step 3: Implement helper**

```js
// functions/api/agent/_lib/lookup-horario.js
export function lookupHorario(slots, inicio, fim) {
  if (!Array.isArray(slots)) return null;
  return slots.find(s => s.inicio === inicio && s.fim === fim) || null;
}

export function isValidIso(s) {
  if (typeof s !== 'string') return false;
  if (!s.includes('T')) return false;
  const d = new Date(s);
  return !isNaN(d.getTime());
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/agent/_lib/lookup-horario.test.mjs
```
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git add functions/api/agent/_lib/lookup-horario.js tests/agent/_lib/lookup-horario.test.mjs && git commit -m "$(cat <<'EOF'
feat(agent/proposta): helper lookup-horario + isValidIso

Sub-3.2 leaf helpers. lookupHorario faz par-match exato
inicio+fim contra horarios_livres pre-fetched. isValidIso
exige ISO com 'T' (rejeita date-only). 7 unit tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Helper `format-link-sinal-msg.js`

**Files:**
- Create: `functions/api/agent/_lib/format-link-sinal-msg.js`
- Test: `tests/agent/_lib/format-link-sinal-msg.test.mjs`

- [ ] **Step 1: Write failing test**

```js
// tests/agent/_lib/format-link-sinal-msg.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLinkSinalMessage } from '../../../functions/api/agent/_lib/format-link-sinal-msg.js';

test('formatLinkSinalMessage: 3 partes separadas por linha em branco com URL crua', () => {
  const out = formatLinkSinalMessage({
    agent_text: 'Bora marcar!',
    sinal_pct: 30,
    valor_sinal: 225,
    link_pagamento: 'https://mpago.la/abc123',
    hold_horas: 24,
  });
  assert.equal(
    out,
    'Bora marcar!\n\n' +
    'Pra agendar a gente trabalha com sinal de 30% do valor, fica em R$ 225,00.\n\n' +
    'https://mpago.la/abc123\n\n' +
    'O link tem validade de 24 horas. Se expirar, so me chamar que envio outro.'
  );
});

test('formatLinkSinalMessage: formata BRL com virgula decimal', () => {
  const out = formatLinkSinalMessage({
    agent_text: 'Bora!',
    sinal_pct: 30,
    valor_sinal: 333.5,
    link_pagamento: 'https://mp/x',
    hold_horas: 24,
  });
  assert.match(out, /R\$ 333,50/);
});

test('formatLinkSinalMessage: omite prefix se agent_text vazio', () => {
  const out = formatLinkSinalMessage({
    agent_text: '',
    sinal_pct: 30,
    valor_sinal: 100,
    link_pagamento: 'https://mp/y',
    hold_horas: 24,
  });
  assert.equal(out.startsWith('Pra agendar'), true);
});

test('formatLinkSinalMessage: NAO inclui markdown link (URL crua)', () => {
  const out = formatLinkSinalMessage({
    agent_text: 'oi',
    sinal_pct: 30,
    valor_sinal: 100,
    link_pagamento: 'https://mp/z',
    hold_horas: 24,
  });
  assert.doesNotMatch(out, /\]\(http/);
  assert.doesNotMatch(out, /\[.*\]\(/);
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/agent/_lib/format-link-sinal-msg.test.mjs
```
Expected: FAIL "Cannot find module".

- [ ] **Step 3: Implement helper**

```js
// functions/api/agent/_lib/format-link-sinal-msg.js
// Template fixo §3.4 — 3 partes separadas por linha em branco, URL crua.
// PROIBIDO markdown — WhatsApp nao renderiza.
export function formatLinkSinalMessage({ agent_text, sinal_pct, valor_sinal, link_pagamento, hold_horas }) {
  const linha1 = `Pra agendar a gente trabalha com sinal de ${sinal_pct}% do valor, fica em R$ ${formatBRL(valor_sinal)}.`;
  const linha2 = link_pagamento;
  const linha3 = `O link tem validade de ${hold_horas} horas. Se expirar, so me chamar que envio outro.`;
  const prefix = agent_text && agent_text.trim() ? `${agent_text.trim()}\n\n` : '';
  return `${prefix}${linha1}\n\n${linha2}\n\n${linha3}`;
}

function formatBRL(n) {
  return Number(n).toFixed(2).replace('.', ',');
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/agent/_lib/format-link-sinal-msg.test.mjs
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git add functions/api/agent/_lib/format-link-sinal-msg.js tests/agent/_lib/format-link-sinal-msg.test.mjs && git commit -m "$(cat <<'EOF'
feat(agent/proposta): helper format-link-sinal-msg template fixo §3.4

Sub-3.2 leaf helper. 3 partes separadas por \\n\\n, URL crua
(WhatsApp nao renderiza markdown — R5 legacy). BRL com virgula
decimal. 4 unit tests cobrem prefix vazio, casas decimais,
ausencia de markdown.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Helper `call-tool.js`

**Files:**
- Create: `functions/api/agent/_lib/call-tool.js`
- Test: `tests/agent/_lib/call-tool.test.mjs`

- [ ] **Step 1: Write failing test**

Pattern de mock no repo: monkey-patch `globalThis.fetch = mock.fn(...)` no inicio do test, restaurar em `t.after(...)` (cleanup local). Sem `beforeEach/afterEach` globais — node:test usa `t.before/t.after` por test ou setup manual.

```js
// tests/agent/_lib/call-tool.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { callTool } from '../../../functions/api/agent/_lib/call-tool.js';

test('callTool: envia header X-Inkflow-Tool-Secret + body JSON', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const fetchMock = mock.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, slots: [] }),
  }));
  globalThis.fetch = fetchMock;

  const env = { INKFLOW_TOOL_SECRET: 'sek', AGENT_INTERNAL_BASE_URL: 'http://localhost:8788' };
  const r = await callTool(env, 'consultar-horarios', { tenant_id: 't1' });

  assert.equal(fetchMock.mock.callCount(), 1);
  const [url, opts] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, 'http://localhost:8788/api/tools/consultar-horarios');
  assert.equal(opts.method, 'POST');
  assert.equal(opts.headers['X-Inkflow-Tool-Secret'], 'sek');
  assert.equal(opts.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(opts.body), { tenant_id: 't1' });
  assert.equal(r.ok, true);
  assert.equal(r.status, 200);
  assert.deepEqual(r.slots, []);
});

test('callTool: retorna ok:false se INKFLOW_TOOL_SECRET ausente (sem chamar fetch)', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const fetchMock = mock.fn();
  globalThis.fetch = fetchMock;

  const r = await callTool({}, 'consultar-horarios', { tenant_id: 't1' });
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.deepEqual(r, { ok: false, status: 0, error: 'env-tool-secret-missing' });
});

test('callTool: retorna ok:false se fetch lanca', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async () => { throw new Error('econnreset'); });

  const env = { INKFLOW_TOOL_SECRET: 'sek' };
  const r = await callTool(env, 'reservar-horario', { tenant_id: 't1' });
  assert.deepEqual(r, { ok: false, status: 0, error: 'fetch-failed' });
});

test('callTool: default base URL = localhost:8788', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const fetchMock = mock.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
  globalThis.fetch = fetchMock;

  const env = { INKFLOW_TOOL_SECRET: 'sek' };
  await callTool(env, 'acionar-handoff', { tenant_id: 't1' });
  assert.equal(fetchMock.mock.calls[0].arguments[0], 'http://localhost:8788/api/tools/acionar-handoff');
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/agent/_lib/call-tool.test.mjs
```
Expected: FAIL "Cannot find module".

- [ ] **Step 3: Implement helper**

```js
// functions/api/agent/_lib/call-tool.js
// Wrapper fetch pras tools internas em functions/api/tools/*.js
// Side-effects ficam isoladas aqui (testavel via mock fetch).
// Auth: header X-Inkflow-Tool-Secret e OBRIGATORIO em TODAS as tools
// (validado em _tool-helpers.js contra env.INKFLOW_TOOL_SECRET).
export async function callTool(env, tool_name, body) {
  if (!env || !env.INKFLOW_TOOL_SECRET) {
    console.error(`[call-tool] env.INKFLOW_TOOL_SECRET ausente — ${tool_name} vai 401`);
    return { ok: false, status: 0, error: 'env-tool-secret-missing' };
  }
  const base = env.AGENT_INTERNAL_BASE_URL || 'http://localhost:8788';
  try {
    const r = await fetch(`${base}/api/tools/${tool_name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Inkflow-Tool-Secret': env.INKFLOW_TOOL_SECRET,
      },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, ...data };
  } catch (e) {
    console.error(`[call-tool] ${tool_name} threw:`, e);
    return { ok: false, status: 0, error: 'fetch-failed' };
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/agent/_lib/call-tool.test.mjs
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git add functions/api/agent/_lib/call-tool.js tests/agent/_lib/call-tool.test.mjs && git commit -m "$(cat <<'EOF'
feat(agent/proposta): helper call-tool wrapper fetch interno

Sub-3.2 helper. Envia header X-Inkflow-Tool-Secret obrigatorio.
Retorna {ok, status, ...data} ou {ok:false, error} em falha
(secret ausente OR fetch threw). Base URL via
env.AGENT_INTERNAL_BASE_URL (default localhost:8788). 4 unit
tests com mock fetch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Helper `prefetch-proposta.js`

**Files:**
- Create: `functions/api/agent/_lib/prefetch-proposta.js`
- Test: `tests/agent/_lib/prefetch-proposta.test.mjs`

- [ ] **Step 1: Write failing test**

```js
// tests/agent/_lib/prefetch-proposta.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { prefetchPropostaContext } from '../../../functions/api/agent/_lib/prefetch-proposta.js';

test('prefetchPropostaContext em propondo_valor: chama consultar-horarios + retorna horarios_livres', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const fetchMock = mock.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ ok: true, slots: [{ inicio: 'a', fim: 'b', legenda: 'x' }] }),
  }));
  globalThis.fetch = fetchMock;

  const env = { INKFLOW_TOOL_SECRET: 'sek' };
  const tenant = { id: 't1' };
  const conversa = { valor_proposto: 750, dados_coletados: { decisao_desconto: null } };
  const r = await prefetchPropostaContext({ env, tenant, conversa, telefone: '5511', estado_atual: 'propondo_valor' });

  assert.equal(r.valor_proposto, 750);
  assert.equal(r.decisao_desconto, null);
  assert.deepEqual(r.horarios_livres, [{ inicio: 'a', fim: 'b', legenda: 'x' }]);
  assert.match(fetchMock.mock.calls[0].arguments[0], /\/api\/tools\/consultar-horarios/);
  // NAO deve passar telefone (evita side-effect bumpEstadoEscolhendo)
  const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
  assert.equal(body.telefone, undefined);
});

test('prefetchPropostaContext em escolhendo_horario: refetch slots, sem proposta_status', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ ok: true, slots: [] }),
  }));

  const env = { INKFLOW_TOOL_SECRET: 'sek' };
  const r = await prefetchPropostaContext({
    env, tenant: { id: 't1' }, conversa: {}, telefone: '5511',
    estado_atual: 'escolhendo_horario',
  });
  assert.deepEqual(r.horarios_livres, []);
  assert.equal(r.proposta_status, undefined);
});

test('prefetchPropostaContext em aguardando_sinal: chama consultar-proposta-tatuador com telefone', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const fetchMock = mock.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ ok: true, status: 'aguardando_pgto' }),
  }));
  globalThis.fetch = fetchMock;

  const env = { INKFLOW_TOOL_SECRET: 'sek' };
  const r = await prefetchPropostaContext({
    env, tenant: { id: 't1' }, conversa: {}, telefone: '5511999',
    estado_atual: 'aguardando_sinal',
  });
  assert.equal(r.proposta_status, 'aguardando_pgto');
  assert.equal(r.horarios_livres, undefined);
  const url = fetchMock.mock.calls[0].arguments[0];
  assert.match(url, /\/api\/tools\/consultar-proposta-tatuador/);
  const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
  assert.deepEqual(body, { tenant_id: 't1', telefone: '5511999' });
});

test('prefetchPropostaContext: horarios_livres vira [] se tool retornar !ok', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async () => ({
    ok: false, status: 500, json: async () => ({ ok: false }),
  }));

  const env = { INKFLOW_TOOL_SECRET: 'sek' };
  const r = await prefetchPropostaContext({
    env, tenant: { id: 't1' }, conversa: { valor_proposto: 100 }, telefone: '55',
    estado_atual: 'propondo_valor',
  });
  assert.deepEqual(r.horarios_livres, []);
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/agent/_lib/prefetch-proposta.test.mjs
```
Expected: FAIL "Cannot find module".

- [ ] **Step 3: Implement helper**

```js
// functions/api/agent/_lib/prefetch-proposta.js
import { callTool } from './call-tool.js';

export async function prefetchPropostaContext({ env, tenant, conversa, telefone, estado_atual }) {
  const ctx = {
    valor_proposto: conversa?.valor_proposto ?? null,
    decisao_desconto: conversa?.dados_coletados?.decisao_desconto ?? null,
  };

  if (estado_atual === 'propondo_valor' || estado_atual === 'escolhendo_horario') {
    // NAO passa telefone — evita side-effect bumpEstadoEscolhendo da tool.
    const r = await callTool(env, 'consultar-horarios', {
      tenant_id: tenant.id,
      data_preferida: null,
    });
    ctx.horarios_livres = r.ok ? (r.slots || []) : [];
  }

  if (estado_atual === 'aguardando_sinal') {
    const r = await callTool(env, 'consultar-proposta-tatuador', {
      tenant_id: tenant.id,
      telefone,
    });
    ctx.proposta_status = r.ok ? r.status : null;
  }

  return ctx;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/agent/_lib/prefetch-proposta.test.mjs
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git add functions/api/agent/_lib/prefetch-proposta.js tests/agent/_lib/prefetch-proposta.test.mjs && git commit -m "$(cat <<'EOF'
feat(agent/proposta): helper prefetch-proposta orquestra contexto eager

Sub-3.2 helper. Eager-fetch de horarios_livres (em propondo_valor
e escolhendo_horario) e proposta_status (em aguardando_sinal).
NAO passa telefone pra consultar-horarios (evita side-effect
bumpEstadoEscolhendo em route lateral). 4 unit tests cobrem 3
estados + tool failure.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: PropostaAgent (schema + builder + closure validator)

**Files:**
- Create: `functions/api/agent/agents/proposta.js`
- Test: `tests/agent/proposta-validator.test.mjs`

- [ ] **Step 1a: Verificar shape do legacy `generate.js`**

`proposta.js` faz `import { generatePromptColetaProposta } from '../../../_lib/prompts/coleta/proposta/generate.js'`. O arquivo legacy ja existe — confirmar que exporta a funcao com esse nome:

```bash
grep -n "export.*generatePromptColetaProposta" /Users/brazilianhustler/Documents/inkflow-saas/functions/_lib/prompts/coleta/proposta/generate.js
```
Expected: 1 match (`export function generatePromptColetaProposta(...)`). Se export tem nome diferente OU nao existe, abortar e criar shim antes.

Por que: este test NAO mocka `generate.js`. node:test nao tem `mock.module()` estavel ainda (Node 25 experimental). Confiar no legacy export — validator nao chama o prompt, so o builder chama. Test importa apenas schema + validator + PROXIMA_ACAO_VALUES.

- [ ] **Step 1b: Write failing test pro validator + schema**

```js
// tests/agent/proposta-validator.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PropostaOutputSchema,
  validatePropostaOutputInvariant,
  PROXIMA_ACAO_VALUES,
} from '../../functions/api/agent/agents/proposta.js';

// ── Schema tests ─────────────────────────────────────────────────────────

test('PropostaOutputSchema: aceita output minimo (proxima_acao=pergunta, payloads null)', () => {
  const r = PropostaOutputSchema.parse({
    resposta_cliente: 'oi',
    proxima_acao: 'pergunta',
  });
  assert.equal(r.slot_inicio, null);
  assert.equal(r.slot_fim, null);
  assert.equal(r.valor_pedido_cliente, null);
});

test('PropostaOutputSchema: rejeita resposta_cliente vazia', () => {
  assert.throws(() => PropostaOutputSchema.parse({ resposta_cliente: '', proxima_acao: 'pergunta' }));
});

test('PropostaOutputSchema: rejeita proxima_acao desconhecida', () => {
  assert.throws(() => PropostaOutputSchema.parse({ resposta_cliente: 'a', proxima_acao: 'foo' }));
});

test('PROXIMA_ACAO_VALUES: tem 7 entries inclusive reservar_horario, pediu_desconto, cliente_agressivo', () => {
  assert.equal(PROXIMA_ACAO_VALUES.length, 7);
  assert.ok(PROXIMA_ACAO_VALUES.includes('reservar_horario'));
  assert.ok(PROXIMA_ACAO_VALUES.includes('pediu_desconto'));
  assert.ok(PROXIMA_ACAO_VALUES.includes('cliente_agressivo'));
});

// ── Validator tests ──────────────────────────────────────────────────────

const ctx = {
  valor_proposto: 750,
  horarios_livres: [
    { inicio: '2026-05-12T17:00:00Z', fim: '2026-05-12T20:00:00Z', legenda: 'a' },
  ],
};

test('validator: rejeita proxima_acao nao permitida pro estado', () => {
  const r = validatePropostaOutputInvariant(
    { resposta_cliente: 'x', proxima_acao: 'reservar_horario' },
    ctx, 'propondo_valor'
  );
  assert.equal(r.valid, false);
  assert.match(r.reason, /nao permitido/);
});

test('validator: aceita oferecendo_horario em propondo_valor', () => {
  const r = validatePropostaOutputInvariant(
    { resposta_cliente: 'x', proxima_acao: 'oferecendo_horario' },
    ctx, 'propondo_valor'
  );
  assert.equal(r.valid, true);
});

test('validator: rejeita reservar_horario sem slot_inicio/slot_fim', () => {
  const r = validatePropostaOutputInvariant(
    { resposta_cliente: 'x', proxima_acao: 'reservar_horario' },
    ctx, 'escolhendo_horario'
  );
  assert.equal(r.valid, false);
  assert.match(r.reason, /slot_inicio/);
});

test('validator: reservar_horario com slot nao-ISO = reason nao-ISO', () => {
  const r = validatePropostaOutputInvariant(
    { resposta_cliente: 'x', proxima_acao: 'reservar_horario', slot_inicio: 'amanha 14h', slot_fim: 'amanha 17h' },
    ctx, 'escolhendo_horario'
  );
  assert.equal(r.valid, false);
  assert.match(r.reason, /nao-ISO/);
});

test('validator: reservar_horario com slot fora da lista = reason slot fora', () => {
  const r = validatePropostaOutputInvariant(
    { resposta_cliente: 'x', proxima_acao: 'reservar_horario',
      slot_inicio: '2026-05-15T10:00:00Z', slot_fim: '2026-05-15T13:00:00Z' },
    ctx, 'escolhendo_horario'
  );
  assert.equal(r.valid, false);
  assert.match(r.reason, /fora da lista/);
});

test('validator: reservar_horario com slot da lista = valid', () => {
  const r = validatePropostaOutputInvariant(
    { resposta_cliente: 'x', proxima_acao: 'reservar_horario',
      slot_inicio: '2026-05-12T17:00:00Z', slot_fim: '2026-05-12T20:00:00Z' },
    ctx, 'escolhendo_horario'
  );
  assert.equal(r.valid, true);
});

test('validator: pediu_desconto sem valor_pedido_cliente = invalid', () => {
  const r = validatePropostaOutputInvariant(
    { resposta_cliente: 'x', proxima_acao: 'pediu_desconto' },
    ctx, 'propondo_valor'
  );
  assert.equal(r.valid, false);
});

test('validator: pediu_desconto com valor > valor_proposto = invalid', () => {
  const r = validatePropostaOutputInvariant(
    { resposta_cliente: 'x', proxima_acao: 'pediu_desconto', valor_pedido_cliente: 800 },
    ctx, 'propondo_valor'
  );
  assert.equal(r.valid, false);
  assert.match(r.reason, /> valor_proposto/);
});

test('validator: cliente_agressivo + reagendamento permitidos em todos os 3 estados', () => {
  for (const estado of ['propondo_valor', 'escolhendo_horario', 'aguardando_sinal']) {
    for (const acao of ['cliente_agressivo', 'reagendamento']) {
      const r = validatePropostaOutputInvariant(
        { resposta_cliente: 'x', proxima_acao: acao }, ctx, estado
      );
      assert.equal(r.valid, true, `falhou em ${estado}/${acao}: ${r.reason || ''}`);
    }
  }
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/agent/proposta-validator.test.mjs
```
Expected: FAIL "Cannot find module" (proposta.js ainda nao existe).

- [ ] **Step 3: Implement schema + validator + builder**

```js
// functions/api/agent/agents/proposta.js
// PropostaAgent — fase Proposta do fluxo Coleta v2 (Sub-3.2).
// Pure structured-output (tools=[]); side-effects orquestrados em route.js
// via switch por proxima_acao.
//
// 3 sub-estados ativos:
// - propondo_valor: bot apresenta valor + lida com aceita/desconto/adia
// - escolhendo_horario: bot recebe slot escolhido, emite reservar
// - aguardando_sinal: bot lida com link expirado / mudancas
//
// Builder retorna { agent, validator } com validator pre-vinculado a
// clientContext + estado_atual via closure (cross-agent pattern Sub-3.2).
import { Agent } from '@openai/agents';
import { z } from 'zod';
import { generatePromptColetaProposta } from '../../../_lib/prompts/coleta/proposta/generate.js';
import { lookupHorario, isValidIso } from '../_lib/lookup-horario.js';

export const PROXIMA_ACAO_VALUES = [
  'pergunta',
  'oferecendo_horario',
  'reservar_horario',
  'pediu_desconto',
  'adiou',
  'reagendamento',
  'cliente_agressivo',
];

export const PropostaOutputSchema = z.object({
  resposta_cliente: z.string().min(1).max(500),
  proxima_acao: z.enum(PROXIMA_ACAO_VALUES),
  slot_inicio: z.string().nullable().default(null),
  slot_fim: z.string().nullable().default(null),
  valor_pedido_cliente: z.number().nullable().default(null),
});

const ALLOWED_BY_STATE = {
  propondo_valor:     ['pergunta', 'oferecendo_horario', 'pediu_desconto', 'adiou', 'reagendamento', 'cliente_agressivo'],
  escolhendo_horario: ['pergunta', 'reservar_horario', 'reagendamento', 'cliente_agressivo'],
  aguardando_sinal:   ['pergunta', 'reservar_horario', 'reagendamento', 'cliente_agressivo'],
};

export function validatePropostaOutputInvariant(out, ctx, estado_atual) {
  if (!out || typeof out !== 'object') {
    return { valid: false, reason: 'output ausente ou nao-objeto' };
  }
  const allowed = ALLOWED_BY_STATE[estado_atual] || [];
  if (!allowed.includes(out.proxima_acao)) {
    return { valid: false, reason: `proxima_acao='${out.proxima_acao}' nao permitido em estado='${estado_atual}'` };
  }
  if (out.proxima_acao === 'reservar_horario') {
    if (!out.slot_inicio || !out.slot_fim) {
      return { valid: false, reason: 'reservar_horario requer slot_inicio e slot_fim' };
    }
    if (!isValidIso(out.slot_inicio) || !isValidIso(out.slot_fim)) {
      return { valid: false, reason: `slot_inicio/slot_fim nao-ISO: ${out.slot_inicio}/${out.slot_fim}` };
    }
    if (!lookupHorario(ctx?.horarios_livres || [], out.slot_inicio, out.slot_fim)) {
      return { valid: false, reason: 'slot fora da lista pre-fetched' };
    }
  }
  if (out.proxima_acao === 'pediu_desconto') {
    if (typeof out.valor_pedido_cliente !== 'number' || out.valor_pedido_cliente <= 0) {
      return { valid: false, reason: 'pediu_desconto requer valor_pedido_cliente number > 0' };
    }
    if (typeof ctx?.valor_proposto === 'number' && out.valor_pedido_cliente > ctx.valor_proposto) {
      return { valid: false, reason: `valor_pedido_cliente=${out.valor_pedido_cliente} > valor_proposto=${ctx.valor_proposto}` };
    }
  }
  return { valid: true };
}

export function buildPropostaAgent({ env, tenant, conversa, clientContext, estado_atual }) {
  const ctx = clientContext || {};
  const instructions = generatePromptColetaProposta(tenant, conversa, ctx);
  const agent = new Agent({
    name: 'proposta-agent',
    model: 'gpt-4o-mini',
    instructions,
    tools: [],
    outputType: PropostaOutputSchema,
  });
  // Closure-bound validator: route.js chama validator(out) com 1 arg
  // (paridade Sub-3.1), mas closure carrega ctx + estado_atual.
  const validator = (out) => validatePropostaOutputInvariant(out, ctx, estado_atual);
  return { agent, validator };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/agent/proposta-validator.test.mjs
```
Expected: 13 passed (4 schema + 9 validator).

- [ ] **Step 5: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git add functions/api/agent/agents/proposta.js tests/agent/proposta-validator.test.mjs && git commit -m "$(cat <<'EOF'
feat(agent/proposta): schema Zod + builder closure-bound validator

Sub-3.2 PropostaAgent v2. tools=[], outputType
PropostaOutputSchema (resposta_cliente + proxima_acao enum 7 +
3 payloads opcionais nullable.default(null) — sem ZodEffects).
buildPropostaAgent retorna {agent, validator} com validator
pre-vinculado a clientContext+estado_atual via closure.
Validator hard-fails: proxima_acao nao permitida, payload
obrigatorio missing, slot ISO invalido, slot fora da lista,
valor_pedido > valor_proposto. 13 unit tests (4 schema + 9
validator) via node:test.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Closure pattern cross-agent + router proposta entries

Refactor `tattoo.js` + `cadastro.js` pra retornarem `{ agent, validator }`. Atualiza `router.js` (remove `VALIDATORS`/`selectAgentValidator`, adiciona BUILDERS+NEXT_STATE entries pros 3 sub-estados de Proposta). Atualiza `route.js` pra destructurar. Re-roda Sub-2/3.1 evals pra garantir não-regressão.

**Files:**
- Modify: `functions/api/agent/agents/tattoo.js`
- Modify: `functions/api/agent/agents/cadastro.js`
- Modify: `functions/api/agent/router.js`
- Modify: `functions/api/agent/route.js` (apenas a destructuring; orchestrator vem na Task 11)

- [ ] **Step 1a: Read tattoo.js completo pra capturar shape exato**

```bash
cat /Users/brazilianhustler/Documents/inkflow-saas/functions/api/agent/agents/tattoo.js
```
Capturar:
- nome do export (`buildTattooAgent`)
- nome do validator exportado (`validateTattooOutputInvariant`)
- assinatura `function buildTattooAgent({ ... })` — params completos
- todo conteudo dentro do `return new Agent({ ... })` (model, instructions, tools, outputType, ferramentas, etc)

- [ ] **Step 1b: Edit buildTattooAgent — substituir `return new Agent(...)` por `{ agent, validator }`**

Pattern (substituir na funcao do tattoo.js, mantendo TODA config existente):

```js
// ANTES:
export function buildTattooAgent({ env, tenant, conversa, clientContext }) {
  // ... setup que voce tinha ...
  return new Agent({
    name: 'tattoo-agent',
    // ... config completa que VOCE LEU NO STEP 1a ...
  });
}

// DEPOIS:
export function buildTattooAgent({ env, tenant, conversa, clientContext }) {
  // ... setup que voce tinha (intacto) ...
  const agent = new Agent({
    name: 'tattoo-agent',
    // ... config completa que VOCE LEU NO STEP 1a (copiar literal) ...
  });
  const validator = (out) => validateTattooOutputInvariant(out);
  return { agent, validator };
}
```

REGRA: NAO inferir config. Copiar literal do que leu no Step 1a.

- [ ] **Step 2: Adapt buildCadastroAgent**

Em `functions/api/agent/agents/cadastro.js:82-92`:

```js
export function buildCadastroAgent({ env, tenant, conversa, clientContext, baseUrl = 'http://localhost:8788' }) {
  const instructions = generatePromptColetaCadastro(tenant, conversa, clientContext || {});
  const agent = new Agent({
    name: 'cadastro-agent',
    model: 'gpt-4o-mini',
    instructions,
    tools: [],
    outputType: CadastroOutputSchema,
  });
  const validator = (out) => validateCadastroOutputInvariant(out);
  return { agent, validator };
}
```

- [ ] **Step 3: Update router.js**

Substituir `functions/api/agent/router.js` inteiro (48→ ~62 LoC):

```js
// functions/api/agent/router.js
// Router — dispatch por estado_atual pra escolha de Agent builder
// e calculo do proximo estado.
//
// Sub-3.2: cross-agent pattern. Builder retorna { agent, validator }.
// VALIDATORS/selectAgentValidator REMOVIDOS — validator vem do builder.
import { buildTattooAgent } from './agents/tattoo.js';
import { buildCadastroAgent } from './agents/cadastro.js';
import { buildPropostaAgent } from './agents/proposta.js';

const PROPOSTA_SUBSTATES = ['propondo_valor', 'escolhendo_horario', 'aguardando_sinal'];

const BUILDERS = {
  tattoo: buildTattooAgent,
  cadastro: buildCadastroAgent,
  ...Object.fromEntries(PROPOSTA_SUBSTATES.map(s => [s, buildPropostaAgent])),
};

const NEXT_STATE = {
  tattoo:   { handoff: 'cadastro',            erro: 'tattoo' },
  cadastro: { handoff: 'aguardando_tatuador', erro: 'aguardando_tatuador' },
  propondo_valor: {
    pergunta:           'propondo_valor',
    oferecendo_horario: 'escolhendo_horario',
    pediu_desconto:     'aguardando_decisao_desconto',
    adiou:              'lead_frio',
    reagendamento:      'aguardando_tatuador',
    cliente_agressivo:  'aguardando_tatuador',
  },
  escolhendo_horario: {
    pergunta:          'escolhendo_horario',
    reservar_horario:  'aguardando_sinal',
    reagendamento:     'aguardando_tatuador',
    cliente_agressivo: 'aguardando_tatuador',
  },
  aguardando_sinal: {
    pergunta:          'aguardando_sinal',
    reservar_horario:  'aguardando_sinal',
    reagendamento:     'aguardando_tatuador',
    cliente_agressivo: 'aguardando_tatuador',
  },
};

export function selectAgentBuilder(estado_atual) {
  return BUILDERS[estado_atual] || null;
}

export function isStateImplemented(estado_atual) {
  return Boolean(BUILDERS[estado_atual]);
}

export function getNextState(estado_atual, out) {
  const map = NEXT_STATE[estado_atual] || {};
  return map[out?.proxima_acao] || estado_atual;
}
```

- [ ] **Step 4: Update route.js destructuring (NAO o orchestrator ainda)**

Em `functions/api/agent/route.js`:

1. Remover `selectAgentValidator` da linha 13 import.
2. Substituir linha 86-94 (builder + invocação):
```js
const builder = selectAgentBuilder(estado_atual);
// ... tenant/conversa/clientContext setup permanece igual ...
const { agent, validator } = builder({ env, tenant, conversa, clientContext, estado_atual });
```
3. Remover linha 123: `const validator = selectAgentValidator(estado_atual);`
   (validator agora vem do builder).

NAO mexer ainda no orchestrator (Task 11). NAO mexer ainda no enforce/silently force pergunta — só a destructuring.

- [ ] **Step 5: Re-roda toda test suite pra garantir não-regressão**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/agent/route.test.mjs tests/agent/router.test.mjs tests/agent/tattoo-agent.test.mjs 2>&1 | tail -40
```

Expected: tudo passa. Se `route.test.mjs` ou `router.test.mjs` referencia `selectAgentValidator` direto, ajustar pra novo pattern (`{agent, validator}` do builder). Cobrir essa edicao no commit do Step 6.

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && npm test 2>&1 | tail -40
```

Expected: full suite verde. Nenhum import quebrado.

NOTA: evals pagos (`tests/agent/*-agent.eval.mjs`) NAO rodam aqui — sao manuais (custo). Eval gate de regressao Sub-2/3.1 fica em Task 13 ou skip se eval ja rodou na branch (DoD final).

- [ ] **Step 6: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git add functions/api/agent/agents/tattoo.js functions/api/agent/agents/cadastro.js functions/api/agent/router.js functions/api/agent/route.js tests/agent/route.test.mjs && git commit -m "$(cat <<'EOF'
refactor(agent): builder retorna {agent, validator} cross-agent

Sub-3.2 closure pattern: tattoo/cadastro/proposta builders todos
retornam {agent, validator}. Validator de proposta eh
closure-bound a clientContext+estado_atual. selectAgentValidator
+ VALIDATORS removidos — route.js destructura direto. router.js
ganha BUILDERS+NEXT_STATE entries pros 3 sub-estados Proposta
(propondo_valor, escolhendo_horario, aguardando_sinal). Estados
pausados (aguardando_decisao_desconto, lead_frio, fechado) sem
entry → 501 not-implemented continua funcionando. npm test verde
sem regressao (evals pagos rodam separado).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Prompt blocks v2 (6 arquivos novos — fluxo.js fica pra Task 10)

**Files:**
- Create: `functions/_lib/prompts/coleta/proposta/identidade.js`
- Create: `functions/_lib/prompts/coleta/proposta/objetivo.js`
- Create: `functions/_lib/prompts/coleta/proposta/contexto.js`
- Create: `functions/_lib/prompts/coleta/proposta/faq.js`
- Create: `functions/_lib/prompts/coleta/proposta/decisao.js`
- Create: `functions/_lib/prompts/coleta/proposta/exemplos.js`
- Modify (se necessario): `functions/_lib/prompts/coleta/proposta/few-shot-tenant.js` (cap 10 se nao tiver)

**NAO mexer em `fluxo.js` aqui** — rewrite vai pra Task 10 atomic com generate.js. Razao: legacy `generate.js` importa `{ fluxo }` de `fluxo.js`. Se Task 9 reescrever `fluxo.js` v2 (export `fluxoProposta`), o import legacy quebra entre os commits e `npm test` falha.

- [ ] **Step 1: Read pattern Sub-3.1 cadastro pra paridade**

```bash
ls /Users/brazilianhustler/Documents/inkflow-saas/functions/_lib/prompts/coleta/cadastro/
```
Read `identidade.js`, `objetivo.js`, `decisao.js`, `exemplos.js` do cadastro pra confirmar shape (export default function vs export const, parametros, etc).

- [ ] **Step 2: Criar `identidade.js` (~150 tokens)**

```js
// functions/_lib/prompts/coleta/proposta/identidade.js
export function identidadeProposta(tenant) {
  const estudio = tenant?.nome_estudio || 'o estudio';
  return `# §0 IDENTIDADE

Voce eh atendente do ${estudio} no WhatsApp. Fala "tu", direto, sem groselha. Cliente ja conversou contigo nas fases anteriores (tattoo + cadastro) — nao precisa se apresentar de novo.`;
}
```

- [ ] **Step 3: Criar `objetivo.js` (~200 tokens)**

```js
// functions/_lib/prompts/coleta/proposta/objetivo.js
export const OBJETIVO_PROPOSTA = `# §2 OBJETIVO — Fase Proposta

Voce ESTA na fase Proposta. Sua missao tem 3 partes:

1. Apresentar o valor que o tatuador fechou (vem em \`valor_proposto\` no contexto)
2. Lidar com 3 reacoes do cliente: aceita / pede desconto / adia
3. Em caso de aceite: oferecer horarios livres e fechar agendamento + sinal

Voce NAO inventa valores, NAO calcula desconto, NAO confirma reducao sem o tatuador. Quem decide eh ele.

Voce NAO escreve link de pagamento — o sistema gera e formata. Voce so emite a INTENCAO de reservar.`;
```

- [ ] **Step 4: Criar `contexto.js` (~250 tokens)**

```js
// functions/_lib/prompts/coleta/proposta/contexto.js
// Injeta variaveis dinamicas no prompt: cliente_nome, valor_proposto,
// decisao_desconto, sinal_percentual, e horarios_livres OR proposta_status.
export function contextoProposta(tenant, conversa, ctx) {
  const cliente_nome = conversa?.dados_cadastro?.nome || conversa?.nome || 'sem nome';
  const estado_atual = conversa?.estado_agente || 'propondo_valor';
  const valor_proposto = ctx?.valor_proposto ?? conversa?.valor_proposto ?? '?';
  const decisao_desconto = ctx?.decisao_desconto ?? 'nenhuma';
  // Fallback chain dupla — config_precificacao.sinal_percentual (jsonb)
  // OR tenant.sinal_percentual (legacy column) OR 30 default.
  // Alinha com _shared/contexto.js:4 pattern.
  const sinal_pct = tenant?.config_precificacao?.sinal_percentual ?? tenant?.sinal_percentual ?? 30;

  let blocoEstado = '';
  if (estado_atual === 'propondo_valor' || estado_atual === 'escolhendo_horario') {
    const slots = Array.isArray(ctx?.horarios_livres) ? ctx.horarios_livres : [];
    if (slots.length === 0) {
      blocoEstado = 'Horarios livres disponiveis: nenhum no momento.';
    } else {
      const linhas = slots.map(s => `- ${s.legenda} — slot_inicio=${s.inicio}, slot_fim=${s.fim}`).join('\n');
      blocoEstado = `Horarios livres disponiveis (use SOMENTE estes, formato ISO):\n${linhas}`;
    }
  } else if (estado_atual === 'aguardando_sinal') {
    const status = ctx?.proposta_status ?? 'desconhecido';
    blocoEstado = `Status da proposta atual: ${status}`;
  }

  return `# §1 CONTEXTO

Cliente: ${cliente_nome}
Estado atual: ${estado_atual}
Valor proposto: R$ ${valor_proposto}
Decisao desconto previa: ${decisao_desconto}
Sinal percentual configurado: ${sinal_pct}%

${blocoEstado}`;
}
```

- [ ] **Step 5: Criar `faq.js` (~100 tokens)**

```js
// functions/_lib/prompts/coleta/proposta/faq.js
// FAQ do tenant — paridade Sub-3.1 cadastro/faq.js.
export function faqProposta(tenant) {
  const faqs = Array.isArray(tenant?.faqs) ? tenant.faqs : [];
  if (faqs.length === 0) return '';
  const linhas = faqs.slice(0, 8).map((f, i) => `${i + 1}. ${f.pergunta || f.q}: ${f.resposta || f.a}`).join('\n');
  return `# §6 FAQ DO ESTUDIO\n\n${linhas}`;
}
```

- [ ] **Step 6: Criar `decisao.js` (~600 tokens — CORE)**

```js
// functions/_lib/prompts/coleta/proposta/decisao.js
export function decisaoProposta(tenant) {
  return `# §4 TABELA DE DECISAO + REGRAS

## §4.1 Tabela 12 linhas

| # | Estado | Sinal do cliente | proxima_acao | Payload obrigatorio | Tom da resposta |
|---|---|---|---|---|---|
| 1 | propondo_valor | "fechou", "topo", "vamos", "sim", "ok", "bora" | oferecendo_horario | — | "Show! Tenho {slots da lista}. Qual prefere?" |
| 2 | propondo_valor | "caro", "menos" (sem valor) | pergunta | — | "Quanto tu tava pensando?" |
| 3 | propondo_valor | "consegue por X?", "deixa por X?" | pediu_desconto | valor_pedido_cliente=X | "Anotado! Vou consultar com o tatuador e te retorno." |
| 4 | propondo_valor | "vou pensar", "te volto", "depois" | adiou | — | "Tranquilo! Qualquer coisa eh so me chamar." |
| 5 | escolhendo_horario | "qui", "ter 14h" (slot da lista) | reservar_horario | slot_inicio, slot_fim ISO | "Bora!" (sistema concatena link MP) |
| 6 | escolhendo_horario | "amanha 9h" (fora da lista) | pergunta | — | "Esse horario nao esta livre. Tenho {slots}. Qual prefere?" |
| 7 | aguardando_sinal | "o link venceu" | reservar_horario | slot_inicio, slot_fim (mesmo do agendamento) | "Beleza, gerei outro!" (sistema concatena novo link) |
| 8 | aguardando_sinal | "instrucoes pre-tattoo?" | pergunta | — | resposta breve da FAQ |
| 9 | qualquer | "quero mudar a data" (pos-agendado) | reagendamento | — | "Vou pedir pro tatuador conferir contigo." |
| 10 | qualquer | xingamento, agressao | cliente_agressivo | — | "Vou pedir ajuda do tatuador aqui." |
| 11 | qualquer | duvida leve / FAQ | pergunta | — | resposta breve |
| 12 | qualquer | mudanca tattoo (cor, tamanho) pos-proposta | reagendamento | — | "Vou avisar o tatuador pra ajustar valor. Volto rapidinho." |

## §4.2 R1-R9

R1. O VALOR vem de \`valor_proposto\` no contexto. NAO calcula. NAO inventa.

R2. PROIBIDO: oferecer desconto sem o tatuador. Cliente pediu menos? Voce SO emite \`pediu_desconto\` — JAMAIS confirma valor menor.

R3. PROIBIDO usar palavras "contraproposta", "contra-oferta", "negociacao". Use "vou consultar com o tatuador".

R4. SLOTS: SEMPRE da lista \`horarios_livres\` no contexto. JAMAIS invente. Se nenhum serve apos perguntar, emite \`reagendamento\`.

R5. LINK DE SINAL: voce NUNCA escreve URL na resposta. Sistema concatena template fixo apos voce emitir \`reservar_horario\`. Se voce escrever URL, vai duplicar.

R6. APOS emitir \`pediu_desconto\`, voce SAI da conversa (estado vira \`aguardando_decisao_desconto\`). NAO continue conversando.

R7. APOS emitir \`adiou\`, voce SAI da conversa (estado vira \`lead_frio\`). NAO ofereca alternativas, NAO insista. Despedida educada.

R8. Mudanca de data de agendamento ja confirmado: emite \`reagendamento\`. Voce nao reagenda nesta fase.

R9. TODA resposta SUA cabe em ≤200 chars. Maximo 1 pergunta por turno. (Sistema PODE concatenar template fixo apos sua resposta no caso \`reservar_horario\` — esse template nao conta no seu cap.)

## §4.3 Closing

Voce esta no controle desta fase. Cliente confia em voce. Nao decida valor (eh do tatuador), nao invente slot (eh do sistema), nao escreva URL (eh do sistema). Decida intent + escreva conversa natural — o resto eh codigo.`;
}
```

- [ ] **Step 7: Criar `exemplos.js` (~500 tokens)**

```js
// functions/_lib/prompts/coleta/proposta/exemplos.js
export function exemplosProposta(tenant) {
  return `# §7 EXEMPLOS DE CONVERSAS IDEAIS

## Exemplo 1 — Caminho A (cliente aceita, oferece slots)
[estado=propondo_valor, valor_proposto=750, decisao=null, slots=ter 12/05 14h-17h, qui 14/05 10h-13h]
CLIENTE: fechou, vamos marcar
AGENTE: Show! Tenho ter 12/05 das 14h as 17h ou qui 14/05 das 10h as 13h. Qual prefere?
// proxima_acao=oferecendo_horario, sem payload

## Exemplo 2 — Caminho B sem valor
[estado=propondo_valor, valor_proposto=750]
CLIENTE: ta um pouco caro
AGENTE: Quanto tu tava pensando?
// proxima_acao=pergunta

## Exemplo 3 — Caminho B com valor
[estado=propondo_valor, valor_proposto=750]
CLIENTE: consegue por 600?
AGENTE: Anotado! Vou consultar com o tatuador e te retorno.
// proxima_acao=pediu_desconto, payload valor_pedido_cliente=600

## Exemplo 4 — Caminho C (adia)
[estado=propondo_valor, valor_proposto=750]
CLIENTE: deixa eu pensar e te volto
AGENTE: Tranquilo! Qualquer coisa eh so me chamar.
// proxima_acao=adiou

## Exemplo 5 — Reentrada apos desconto aceito
[estado=propondo_valor, valor_proposto=600, decisao=aceito]
CLIENTE: vamos
AGENTE: Show! Tenho ter 14h, qui 10h. Qual prefere?
// proxima_acao=oferecendo_horario

## Exemplo 6 — Reentrada apos desconto recusado
[estado=propondo_valor, valor_proposto=750, decisao=recusado]
CLIENTE: humm, vou pensar
AGENTE: Tranquilo! Qualquer coisa eh so me chamar.
// proxima_acao=adiou

## Exemplo 7 — Cliente escolhe slot
[estado=escolhendo_horario, slots=ter 12/05 14h-17h (slot_inicio=2026-05-12T17:00:00Z, slot_fim=2026-05-12T20:00:00Z), qui 14/05 10h-13h]
CLIENTE: qui
AGENTE: Bora!
// proxima_acao=reservar_horario, payload slot_inicio=2026-05-14T13:00:00Z, slot_fim=2026-05-14T16:00:00Z
// (sistema concatena: "Bora! Pra agendar... R$ 225,00. https://link... O link tem validade de 24 horas...")

## Exemplo 8 — Slot fora da lista
[estado=escolhendo_horario, slots=ter 14h, qui 10h, sex 16h]
CLIENTE: amanha 9h?
AGENTE: Amanha nao tenho disponivel — tenho ter 14h, qui 10h, sex 16h. Qual prefere?
// proxima_acao=pergunta

## Exemplo 9 — Cliente xinga
[qualquer estado]
CLIENTE: vai se f*der, ta caro pra c*ralho
AGENTE: Vou pedir ajuda do tatuador aqui contigo.
// proxima_acao=cliente_agressivo

## Exemplo 10 — Mudanca tattoo pos-proposta
[estado=propondo_valor]
CLIENTE: ah esqueci, queria colorida
AGENTE: Boa! Vou avisar o tatuador pra ele ajustar o valor. Volto rapidinho.
// proxima_acao=reagendamento`;
}
```

- [ ] **Step 8: Verificar `few-shot-tenant.js`**

```bash
cat /Users/brazilianhustler/Documents/inkflow-saas/functions/_lib/prompts/coleta/proposta/few-shot-tenant.js
```
Se ja tem cap 10 (paridade Sub-3.1), nao mexer. Se nao, adicionar `.slice(0, 10)` na lista de fewshots — pequeno edit. Comparar com `cadastro/few-shot-tenant.js` pra paridade exata.

- [ ] **Step 9: Commit (NAO inclui fluxo.js — fica pra Task 10 atomic)**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git add functions/_lib/prompts/coleta/proposta/identidade.js functions/_lib/prompts/coleta/proposta/objetivo.js functions/_lib/prompts/coleta/proposta/contexto.js functions/_lib/prompts/coleta/proposta/faq.js functions/_lib/prompts/coleta/proposta/decisao.js functions/_lib/prompts/coleta/proposta/exemplos.js functions/_lib/prompts/coleta/proposta/few-shot-tenant.js && git commit -m "$(cat <<'EOF'
feat(prompts/proposta): 6 blocos v2 novos (sem tocar generate/fluxo)

Sub-3.2 prompt v2 — Tarefa 9 escopo restrito. Cria 6 blocos
novos: identidade, objetivo, contexto (injeta valor_proposto,
decisao_desconto, horarios_livres OR proposta_status), faq,
decisao (CORE — 12 linhas tabela + R1-R9 + closing), exemplos
(10 conversas ideais cobrindo §3.1-§3.6 e tabela §4.1 1:1).
few-shot-tenant cap 10 confirmado. NAO mexe em fluxo.js nem
generate.js — Task 10 vai reescrever ambos atomically pra
evitar quebra do import legacy entre commits. regras.js +
few-shot.js legacy ficam orfaos (paridade Sub-2/3.1).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

NOTA: ate este ponto, `npm test` continua verde porque legacy `generate.js` ainda importa `{ fluxo }` de `fluxo.js` legacy (intacto). Os 6 blocos novos ficam orfaos no diretorio (nao importados ainda). Proxima task (10) faz a swap atomic.

---

## Task 10: `generate.js` + `fluxo.js` rewrite (atomic) + contract v2

**Files:**
- Modify: `functions/_lib/prompts/coleta/proposta/generate.js` (rewrite v2 — 8 blocos)
- Modify: `functions/_lib/prompts/coleta/proposta/fluxo.js` (rewrite v2 — slim ~250 tokens, export `fluxoProposta`)
- Modify: `tests/prompts/contracts/coleta-proposta.mjs` (REWRITE legacy v1 → v2 — arquivo JA EXISTE)
- Modify: `tests/prompts/snapshots/coleta-proposta.txt` (regenerado via `update-prompt-snapshots.sh`)

**Atomic rationale:** legacy `generate.js` importa `{ fluxo }` de `fluxo.js`. Reescrever um sem o outro deixa repo num estado quebrado (`SyntaxError`). Esta task faz os DOIS rewrites + contract update num unico commit.

- [ ] **Step 1: Inspect existing contract pattern (cadastro v2 + proposta legacy)**

```bash
cat /Users/brazilianhustler/Documents/inkflow-saas/tests/prompts/contracts/coleta-cadastro.mjs
cat /Users/brazilianhustler/Documents/inkflow-saas/tests/prompts/contracts/coleta-proposta.mjs
```
Confirma:
1. Export pattern eh `export const CONTRACT_COLETA_PROPOSTA = { must_contain, must_not_contain, max_tokens }` (NAO `SLUG`/`SPEC`).
2. Cadastro v2 contract usa ancoras simples (sem prefixo §): `'IDENTIDADE'`, `'CONTEXTO'`, etc.
3. Legacy proposta tem `must_contain: ['IDENTIDADE', 'CHECKLIST', 'FLUXO', 'REGRAS INVIOLAVEIS', ..., 'consultar_horarios_livres', ...]` — TUDO ISSO SAI no v2.

- [ ] **Step 2: REWRITE `tests/prompts/contracts/coleta-proposta.mjs` (v1 → v2)**

Substituir conteudo COMPLETO do arquivo existing (mantem nome do export):

```js
// tests/prompts/contracts/coleta-proposta.mjs
// Contrato do prompt Coleta v2 (rewrite Sub-3.2 2026-05-08) — fase PROPOSTA.
// Pure structured-output (sem tools no agent — orchestrator em route.js
// chama tools internas via fetch). Garante que o prompt:
// - tem as 4 ancoras v2 (IDENTIDADE, CONTEXTO, OBJETIVO, DECISAO);
// - injeta valor_proposto, decisao_desconto, horarios_livres no contexto;
// - menciona payloads opcionais do schema (slot_inicio, slot_fim, valor_pedido_cliente);
// - lista 7 valores de proxima_acao explicitamente;
// - NAO menciona tools v1 (consultar_horarios_livres, gerar_link_sinal, etc);
// - NAO contem markdown link (URL deve ser crua — WhatsApp nao renderiza);
// - NAO contem ancoras v1 (CHECKLIST, REGRAS INVIOLAVEIS, §4b TOOLS).
export const CONTRACT_COLETA_PROPOSTA = {
  must_contain: [
    // Ancoras v2 (paridade cadastro/tattoo)
    'IDENTIDADE',
    'CONTEXTO',
    'OBJETIVO',
    'DECISAO',
    // Variaveis dinamicas injetadas no contexto
    'valor_proposto',
    'decisao_desconto',
    'horarios_livres',
    // Schema fields que orchestrator consome
    'proxima_acao',
    'slot_inicio',
    'slot_fim',
    'valor_pedido_cliente',
    // Valores do enum proxima_acao (devem aparecer no prompt — tabela §4 + exemplos)
    'oferecendo_horario',
    'reservar_horario',
    'pediu_desconto',
    'adiou',
    'reagendamento',
    'cliente_agressivo',
  ],
  must_not_contain: [
    // Ancoras v1 removidas
    'CHECKLIST',
    'REGRAS INVIOLAVEIS',
    '§4b TOOLS',
    // Tools v1 removidas do prompt (orchestrator usa, agent nao chama)
    'consultar_horarios_livres',
    'consultar-horarios-livres',
    'enviar_objecao_tatuador',
    'gerar_link_sinal',
    'acionar_handoff(',
    'consultar_proposta_tatuador',
    'reservar_horario(',  // chamada de funcao com paren — diferente de menus em prosa
    // Sintaxe pseudo-codigo legacy
    '[chama tool',
    // Markdown link (WhatsApp nao renderiza — link MP fica URL crua)
    '](http',
  ],
  max_tokens: 2400,
};
```

- [ ] **Step 3a: Rewrite `fluxo.js` v2 (slim, export `fluxoProposta`)**

Substituir conteudo completo de `functions/_lib/prompts/coleta/proposta/fluxo.js`:

```js
// functions/_lib/prompts/coleta/proposta/fluxo.js
// Sub-3.2 v2 — slim. Mapa de transicao + variantes copy de reentry.
// Legacy 6 estados/5 camadas/regras T1-T5 (tools) saiu — tools no v2 sao
// orquestradas pelo route.js, nao pelo agent.
//
// Export RENAMED: legacy `fluxo` → v2 `fluxoProposta` (paridade
// `fluxoCadastro`, `fluxoTattoo`). Generate.js v2 (rewrite no Step 3b
// abaixo) importa o nome novo. Edit atomic com generate.js evita quebra.
export function fluxoProposta(tenant, ctx) {
  return `# §3 FLUXO DOS ESTADOS

## §3.1 propondo_valor (entry)

Voce abre apresentando o valor. Variantes copy baseadas em \`decisao_desconto\` no contexto:

- null (primeira proposta): "Show! Pelo trabalho ficou em R$ {valor}. Bora marcar?"
- "aceito" (tatuador topou desconto): "Show! Ele topou em R$ {valor_aceito}. Bora marcar?"
- "recusado" (tatuador manteve valor): "Ele preferiu manter R$ {valor}. Ta fechado pra ti? Bora marcar?"

Apos enviar, AGUARDE resposta do cliente.

## §3.2 Transicoes a partir de propondo_valor

- Cliente aceita -> emite \`oferecendo_horario\` + resposta inclui slots da lista
- Cliente pede desconto sem valor -> emite \`pergunta\` + "Quanto tu tava pensando?"
- Cliente pede desconto com valor -> emite \`pediu_desconto\` + payload \`valor_pedido_cliente=N\`
- Cliente adia -> emite \`adiou\` + despedida educada

## §3.3 escolhendo_horario

- Cliente escolheu slot da lista -> emite \`reservar_horario\` + payload \`slot_inicio\`, \`slot_fim\` (ISO da lista). Sistema reserva + gera link.
- Cliente perguntou outra coisa -> emite \`pergunta\`.
- Cliente pediu slot fora da lista -> emite \`pergunta\` + reapresenta slots disponiveis.

## §3.4 aguardando_sinal

- Cliente avisa "venceu" -> emite \`reservar_horario\` (sistema re-gera link).
- Cliente quer mudar data -> emite \`reagendamento\` (handoff humano).
- Cliente xinga -> emite \`cliente_agressivo\`.`;
}
```

- [ ] **Step 3b: Rewrite `generate.js` v2**

Substituir `functions/_lib/prompts/coleta/proposta/generate.js`:

```js
// functions/_lib/prompts/coleta/proposta/generate.js
// Generator — modo Coleta v2, fase PROPOSTA (Sub-3.2 v2 rewrite).
// Substitui composicao 5-camadas legacy (fluxo, regras com T1-T5 tools,
// few-shot, few-shot-tenant) por 8 blocos focados em pure
// structured-output: identidade, contexto, objetivo, faq, fluxo slim,
// decisao (CORE), exemplos, few-shot-tenant. Pattern Sub-2/3.1.
//
// Files legacy (regras.js, few-shot.js) NAO sao mais importados —
// permanecem orfaos no diretorio.
import { identidadeProposta } from './identidade.js';
import { contextoProposta } from './contexto.js';
import { OBJETIVO_PROPOSTA } from './objetivo.js';
import { faqProposta } from './faq.js';
import { fluxoProposta } from './fluxo.js';
import { decisaoProposta } from './decisao.js';
import { exemplosProposta } from './exemplos.js';
import { fewShotTenant } from './few-shot-tenant.js';

export function generatePromptColetaProposta(tenant, conversa, clientContext) {
  const ctx = clientContext || {};
  const blocks = [
    identidadeProposta(tenant),
    contextoProposta(tenant, conversa, ctx),
    OBJETIVO_PROPOSTA,
    faqProposta(tenant),
    fluxoProposta(tenant, ctx),
    decisaoProposta(tenant),
    exemplosProposta(tenant),
    fewShotTenant(tenant),
  ].filter(b => b && b.trim().length > 0);
  return blocks.join('\n\n---\n\n');
}
```

- [ ] **Step 4: Inspect invariants test pra confirmar shape de PROMPTS_V1/V2 antes de rodar contract**

```bash
grep -n "PROMPTS_V1\|PROMPTS_V2\|coleta-proposta\|coleta-cadastro" /Users/brazilianhustler/Documents/inkflow-saas/tests/prompts/invariants.test.mjs
```
Esperado: `coleta-cadastro` e `coleta-tattoo` ja em PROMPTS_V2 (Sub-2/3.1). `coleta-proposta` ainda em PROMPTS_V1 — Task 12 vai mover.

- [ ] **Step 5: Update snapshot pro novo prompt**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && bash scripts/update-prompt-snapshots.sh
git diff tests/prompts/snapshots/coleta-proposta.txt
```
Confirmar que o snapshot novo:
1. Inclui blocos §1-§4 + payloads (`slot_inicio`, `valor_pedido_cliente`, etc).
2. NAO tem `REGRAS INVIOLAVEIS`, `§4b TOOLS`, `consultar_horarios_livres`, etc.

Se o script `update-prompt-snapshots.sh` nao aceitar slug filtrado, rodar geral; o diff so vai mexer em `coleta-proposta.txt` porque os outros nao mudaram.

- [ ] **Step 6: Run invariants tests parciais (sem PROMPTS_V1 ainda corrigido)**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/prompts/invariants.test.mjs 2>&1 | tail -40
```
Esperado: contract `coleta-proposta` v2 passa (must_contain/must_not_contain/<2400 tokens). PROMPTS_V1 PODE falhar com `coleta-proposta` ainda na lista legacy — Task 12 cuida. Se falhar SO em PROMPTS_V1 com regex de header legacy, ok seguir; se falhar em qualquer outra coisa do v2, parar e fix.

NOTA: se quiser deixar tudo verde antes do commit, mover `coleta-proposta` de PROMPTS_V1 → PROMPTS_V2 aqui mesmo (ao inves de na Task 12 — entrega mais limpa). O plan permite essa swap inline.

- [ ] **Step 7: Commit (atomic — generate.js + fluxo.js + contract + snapshot)**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git add functions/_lib/prompts/coleta/proposta/generate.js functions/_lib/prompts/coleta/proposta/fluxo.js tests/prompts/contracts/coleta-proposta.mjs tests/prompts/snapshots/coleta-proposta.txt && git commit -m "$(cat <<'EOF'
feat(prompts/proposta): generate.js + fluxo.js v2 atomic + contract

Sub-3.2 prompt swap atomico. generate.js rewrite com 8 blocos:
identidade, contexto, OBJETIVO, faq, fluxo, decisao, exemplos,
few-shot-tenant. fluxo.js renamed export `fluxo` → `fluxoProposta`
(slim ~250 tokens, vs ~600 legacy). Atomic pra evitar quebra do
import legacy entre commits. Contract coleta-proposta valida
must_contain (§1-§4, payloads, proxima_acao values) +
must_not_contain (legacy 'REGRAS INVIOLAVEIS', '§4b TOOLS', tool
names snake_case, markdown links). max_tokens=2400 (vs 2000
cadastro — relaxado pra cobrir 3 estados). Snapshot regenerado.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: route.js orchestrator + pre-fetch + force pergunta

**Files:**
- Modify: `functions/api/agent/route.js`

- [ ] **Step 1: Read estado atual de route.js**

```bash
cat /Users/brazilianhustler/Documents/inkflow-saas/functions/api/agent/route.js
```
Confirma que Task 8 ja foi commitada (destructuring `{ agent, validator } = builder({...})` ja existe).

- [ ] **Step 2: Add imports**

No topo de `functions/api/agent/route.js`, adicionar:

```js
import { prefetchPropostaContext } from './_lib/prefetch-proposta.js';
import { callTool } from './_lib/call-tool.js';
import { calcularValorSinal } from './_lib/calcular-sinal.js';
import { formatLinkSinalMessage } from './_lib/format-link-sinal-msg.js';
```

- [ ] **Step 3: Add pre-fetch eager apos isStateImplemented**

Em `functions/api/agent/route.js`, depois da linha que declara `const conversa = body?.conversa || ...` (~linha 91) e ANTES da declaracao atual `const clientContext = body?.clientContext || {};` (~linha 92):

```js
// Set definido tambem mais abaixo no orchestrator — declarado em escopo
// mais alto pra reuso. Subsumir o `const clientContext = body?.clientContext || {};`
// existente.
const PROPOSTA_SUBSTATES = new Set(['propondo_valor', 'escolhendo_horario', 'aguardando_sinal']);
let clientContext = body?.clientContext || {};
if (PROPOSTA_SUBSTATES.has(estado_atual)) {
  const prefetched = await prefetchPropostaContext({
    env, tenant, conversa, telefone, estado_atual,
  });
  clientContext = { ...clientContext, ...prefetched };
}
```

REMOVER a linha `const clientContext = body?.clientContext || {};` original (a versao acima ja inicializa). `tenant` e `conversa` ja sao locals declarados nas linhas 90-91 do route.js — sem conflito.

- [ ] **Step 4: Add executeOrchestration helper + force-pergunta (EXPORTED pra unit test)**

No fim do arquivo (depois de `onRequest`), adicionar funcao com `export` pra que Task 12 possa testar branches de failure direto sem rodar route.js inteiro:

```js
export function forcePergunta(out, msg) {
  return { ...out, proxima_acao: 'pergunta', resposta_cliente: msg };
}

export async function executeOrchestration(out, { env, tenant, conversa, telefone, sideEffects }) {
  switch (out.proxima_acao) {
    case 'pergunta':
    case 'oferecendo_horario':
    case 'adiou':
      return out;

    case 'reservar_horario': {
      const nome = conversa?.dados_cadastro?.nome || conversa?.nome || telefone;
      const ag = await callTool(env, 'reservar-horario', {
        tenant_id: tenant.id,
        telefone, nome,
        inicio: out.slot_inicio,
        fim: out.slot_fim,
      });
      sideEffects.push({ tool: 'reservar-horario', ok: ag.ok, agendamento_id: ag.agendamento_id });
      if (!ag.ok) {
        return forcePergunta(out, 'Esse horario acabou de sair — pode escolher outro?');
      }
      // Fallback chain dupla — config_precificacao.sinal_percentual (jsonb)
      // OR tenant.sinal_percentual (legacy column) OR 30 default.
      const sinal_pct = tenant?.config_precificacao?.sinal_percentual ?? tenant?.sinal_percentual ?? 30;
      const valor_sinal = calcularValorSinal(conversa.valor_proposto, sinal_pct);
      const lk = await callTool(env, 'gerar-link-sinal', {
        tenant_id: tenant.id,
        agendamento_id: ag.agendamento_id,
        valor_sinal,
      });
      sideEffects.push({ tool: 'gerar-link-sinal', ok: lk.ok });
      if (!lk.ok) {
        return forcePergunta(out, 'Tive um problema gerando o link — me da um minuto?');
      }
      const resposta_cliente = formatLinkSinalMessage({
        agent_text: out.resposta_cliente,
        sinal_pct, valor_sinal,
        link_pagamento: lk.link_pagamento,
        hold_horas: lk.hold_horas ?? 24,
      });
      return { ...out, resposta_cliente };
    }

    case 'pediu_desconto': {
      const r = await callTool(env, 'enviar-objecao-tatuador', {
        tenant_id: tenant.id,
        telefone,
        valor_pedido_cliente: out.valor_pedido_cliente,
      });
      sideEffects.push({ tool: 'enviar-objecao-tatuador', ok: r.ok });
      if (!r.ok) return forcePergunta(out, 'Anota ai — vou consultar e ja volto.');
      return out;
    }

    case 'reagendamento':
    case 'cliente_agressivo': {
      const r = await callTool(env, 'acionar-handoff', {
        tenant_id: tenant.id,
        telefone,
        motivo: out.proxima_acao,
      });
      sideEffects.push({ tool: 'acionar-handoff', ok: r.ok, motivo: out.proxima_acao });
      return out;
    }

    default:
      return out;
  }
}
```

- [ ] **Step 5: Wire force-pergunta pos-validator (silently force pra slot ISO/fora da lista)**

Localizar em `route.js` o bloco `if (!invariantCheck.valid) { ... }` existente (linhas ~127-146 da Sub-3.1). Hoje ele tem 2 branches: caso especial cadastro `data_nascimento nao-ISO` (silently force pergunta) + fallback hard-fail 500.

Adicionar 3a branch ANTES do fallback hard-fail, pra Proposta. Substituir o bloco INTEIRO por:

```js
if (!invariantCheck.valid) {
  if (estado_atual === 'cadastro' && invariantCheck.reason?.startsWith('data_nascimento nao-ISO')) {
    // Caso especial Sub-3.1: data_nascimento mal-formatada — silently force
    // pergunta. Agente reformula no proximo turno.
    console.warn('[agent/route] silently force pergunta (data_nascimento nao-ISO):', invariantCheck.reason);
    working = {
      ...working,
      dados_persistidos: { ...(working.dados_persistidos || {}), data_nascimento: null },
      dados_completos: false,
      campos_faltando: Array.from(new Set([...(working.campos_faltando || []), 'data_nascimento'])),
      proxima_acao: 'pergunta',
      resposta_cliente: 'Nao consegui ler a data — pode mandar tipo 12/03/1995?',
    };
  } else if (PROPOSTA_SUBSTATES.has(estado_atual) && /(nao-ISO|fora da lista)/.test(invariantCheck.reason || '')) {
    // Caso especial Sub-3.2: slot mal-formatado ou inexistente — silently
    // force pergunta com lista atualizada de slots.
    console.warn('[agent/route] silently force pergunta (slot invalido):', invariantCheck.reason);
    const slots = clientContext.horarios_livres || [];
    const legendas = slots.map(s => s.legenda).join(', ') || '(nenhum slot disponivel)';
    const msg = invariantCheck.reason.startsWith('slot fora')
      ? `Esse horario nao esta na lista — escolhe um destes? ${legendas}`
      : `Nao consegui ler o horario — pode escolher um da lista? ${legendas}`;
    working = { ...working, proxima_acao: 'pergunta', resposta_cliente: msg };
  } else {
    // Hard-fail: violacao de contrato (proxima_acao nao permitida no estado,
    // payload obrigatorio missing, valor_pedido > valor_proposto, etc).
    // Bug do agent — nao UX issue.
    console.error('[agent/route] invariant violation:', invariantCheck.reason, out);
    return json({ ok: false, error: 'invariant-violation', reason: invariantCheck.reason }, 500);
  }
}
```

NOTA: o bloco do cadastro acima e EXATAMENTE o que ja existe em `route.js:130-141` da Sub-3.1 — copiei pra o plan ficar self-contained. Confirmar via Read antes do Edit que a transcricao bate.

- [ ] **Step 6: SUBSTITUIR o `return json({...}, 200);` final pela versao com orchestrator + side_effects**

Localizar em `route.js` o `return json({ ok: true, resposta_cliente: enforced.resposta_cliente, ... }, 200);` final (linhas ~152-162 da Sub-3.1). SUBSTITUIR por:

```js
// Sub-3.2: orquestrator side-effects pra Proposta
const sideEffects = [];
let finalOut = enforced;
if (PROPOSTA_SUBSTATES.has(estado_atual)) {
  finalOut = await executeOrchestration(enforced, {
    env, tenant, conversa, telefone, sideEffects,
  });
}

return json({
  ok: true,
  resposta_cliente: finalOut.resposta_cliente,
  estado_novo: getNextState(estado_atual, finalOut),
  dados_persistidos: finalOut.dados_persistidos,
  dados_completos: finalOut.dados_completos,
  campos_faltando: finalOut.campos_faltando,
  campos_conflitantes: finalOut.campos_conflitantes,
  proxima_acao: finalOut.proxima_acao,
  agent_usado: estado_atual,
  side_effects: PROPOSTA_SUBSTATES.has(estado_atual) ? sideEffects : undefined,
}, 200);
```

NOTA: campos `dados_persistidos`/`dados_completos`/`campos_faltando`/`campos_conflitantes` so existem em outputs do CadastroAgent — pra Proposta sao `undefined` e `JSON.stringify` omite. `side_effects` only quando estado eh Proposta. Cadastro/Tattoo nao mudam shape de resposta.

- [ ] **Step 7: Smoke local — Caminho A end-to-end (sem subir wrangler ainda)**

Verificar que arquivo nao quebra parse:

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --check functions/api/agent/route.js
```
Expected: sem erro. Se sintaxe quebrar, ajustar antes de prosseguir.

- [ ] **Step 8: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git add functions/api/agent/route.js && git commit -m "$(cat <<'EOF'
feat(agent/route): orchestrator switch + pre-fetch + force pergunta

Sub-3.2 route.js cresce. Pre-fetch eager pra propondo_valor/
escolhendo_horario/aguardando_sinal injeta horarios_livres OR
proposta_status no clientContext antes do buildPropostaAgent.
executeOrchestration switch por proxima_acao chama tools
internas via call-tool wrapper com header X-Inkflow-Tool-Secret:
reservar-horario + gerar-link-sinal (com formatLinkSinalMessage),
enviar-objecao-tatuador, acionar-handoff. Silently force
pergunta quando: tool falhou (slot vencido, MP timeout, Telegram
down) OR validator reclamou de slot ISO/fora-da-lista. Side
effects logados no return body pra debug. Pos-validator hard-fail
500 em casos de contrato (proxima_acao nao permitida, payload
obrigatorio missing) — UX issues viram pergunta natural.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Update invariants test + route.test.mjs proposta + orchestrator unit tests

**Files:**
- Modify: `tests/prompts/invariants.test.mjs`
- Modify: `tests/agent/route.test.mjs`
- Create: `tests/agent/route-orchestrator.test.mjs` (unit tests pros failure branches do `executeOrchestration` — fechando gap de cobertura que eval real + smoke nao pegam)

- [ ] **Step 1: Update `PROMPTS_V1` filter em invariants.test.mjs**

Confirmado pattern do repo (head 30 do arquivo): `PROMPTS_V1` eh um filter inverso da const `PROMPTS`. Hoje:

```js
const PROMPTS_V1 = PROMPTS.filter(p => p.nome !== 'coleta-tattoo' && p.nome !== 'coleta-cadastro');
```

Sub-3.2: adicionar `'coleta-proposta'` na exclusion (paridade Sub-3.1 que adicionou `coleta-cadastro`):

```js
const PROMPTS_V1 = PROMPTS.filter(p =>
  p.nome !== 'coleta-tattoo' &&
  p.nome !== 'coleta-cadastro' &&
  p.nome !== 'coleta-proposta'
);
```

Tambem buscar se ha `PROMPTS_V2` ou similar (lista que carrega contratos novos):

```bash
grep -n "PROMPTS_V2\|CONTRACT_COLETA\|coleta-proposta" /Users/brazilianhustler/Documents/inkflow-saas/tests/prompts/invariants.test.mjs
```

Se invariants.test.mjs IMPORTA `CONTRACT_COLETA_PROPOSTA` legacy (do arquivo antigo do contract), o import path NAO MUDA (mesmo arquivo, nome do export mantido) — Task 10 reescreveu o conteudo, nao o nome. Verificar se invariants ja chama `assertContract(CONTRACT_COLETA_PROPOSTA, generate(...))` ou similar — adaptar pra v2 se necessario.

- [ ] **Step 2: Read route.test.mjs pra capturar helpers existentes (makeEnv, run mocks, etc)**

```bash
cat /Users/brazilianhustler/Documents/inkflow-saas/tests/agent/route.test.mjs | head -120
```

Procurar:
- `buildContext({...})` ou helper similar
- como Sub-3.1 mockou `agent.run()` (provavelmente via `globalThis.fetch` interceptando OpenAI call OU passando `tenant`/`conversa` direto pelo body sem rodar OpenAI)
- pattern de mock fetch (provavelmente `mock.method(globalThis, 'fetch', ...)`)

Se Sub-3.1 testa route.js SEM rodar agent (skipa OpenAI), seguir mesmo pattern. Se roda agent real (eval), mover esses tests pra `*.eval.mjs`.

ASSUMPTION pro plan: Sub-3.1 mockou `run` de `@openai/agents` via monkey-patch ou injetou mock no env. Se nao tem ainda, **opcao mais limpa: deixar route.test.mjs cobrir SO 501 + body parsing + cors**, e mover testes de orchestrator pra `proposta-agent.eval.mjs` (Task 13) que ja chama LLM real.

Decisao final do plan: **route.test.mjs cobre apenas 501 + headers**. Logica de orchestrator e pre-fetch e validada via Task 13 eval suite (LLM real) + Task 14 smoke (curl real). Reduz over-mocking.

- [ ] **Step 3: Run invariants tests — confirm PASS**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/prompts/invariants.test.mjs
```
Expected: tudo passa. PROMPTS_V1 nao reclama de proposta legacy + PROMPTS_V2 valida v2 contract.

- [ ] **Step 4: Add proposta 501 tests em route.test.mjs (escopo restrito)**

Em `tests/agent/route.test.mjs`, adicionar tests no padrao do arquivo (test() flat, assert/strict, buildContext helper existente):

```js
test('route Proposta: estado pausado lead_frio retorna 501', async () => {
  const res = await onRequest(buildContext({
    tenant_id: 't1', telefone: '5511', mensagem: 'oi', estado_atual: 'lead_frio',
  }));
  assert.equal(res.status, 501);
});

test('route Proposta: estado pausado aguardando_decisao_desconto retorna 501', async () => {
  const res = await onRequest(buildContext({
    tenant_id: 't1', telefone: '5511', mensagem: 'oi', estado_atual: 'aguardando_decisao_desconto',
  }));
  assert.equal(res.status, 501);
});

test('route Proposta: estado fechado retorna 501', async () => {
  const res = await onRequest(buildContext({
    tenant_id: 't1', telefone: '5511', mensagem: 'oi', estado_atual: 'fechado',
  }));
  assert.equal(res.status, 501);
});

test('route Proposta: propondo_valor eh implementado (nao 501)', async (t) => {
  // Sem mock OpenAI: este test so checa que isStateImplemented retorna true.
  // Se executar sem OPENAI_API_KEY, vai 503 (env-incomplete) — aceitavel
  // pra unit test (nao executa LLM). Eval real fica em Task 13.
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  // Stub minimo de fetch pra evitar chamada real ao Supabase em pre-fetch
  globalThis.fetch = mock.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ ok: true, slots: [] }),
  }));

  const res = await onRequest(buildContext({
    tenant_id: 't1', telefone: '5511', mensagem: 'fechou', estado_atual: 'propondo_valor',
    tenant: { id: 't1', nome_estudio: 'X', config_precificacao: { sinal_percentual: 30 } },
    conversa: { telefone: '5511', estado_agente: 'propondo_valor', valor_proposto: 750, dados_cadastro: { nome: 'Y' } },
  }));
  // Pode ser 500 (LLM falha sem key) OU 200 — o que importa eh NAO ser 501.
  assert.notEqual(res.status, 501);
});
```

Adicionar import de `mock` se ainda nao tiver: `import { test, mock } from 'node:test';`

- [ ] **Step 5: Run route tests**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/agent/route.test.mjs
```
Expected: 4 proposta tests passam + Sub-2/3.1 existing tests verde.

- [ ] **Step 6: Create `tests/agent/route-orchestrator.test.mjs` — unit tests pros failure branches**

Gap fechado: eval real + smoke local cobrem happy paths (tools retornam ok). Failure paths (`!ok` de cada tool) NUNCA sao testados — bug ai vai aparecer so em prod. Estes 5 unit tests cobrem cada branch de force-pergunta:

```js
// tests/agent/route-orchestrator.test.mjs
// Unit tests pros failure branches do executeOrchestration.
// Eval real (Task 13) + smoke (Task 14) cobrem happy path; este arquivo
// fecha o gap dos branches !ok que tools reais nao retornam.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { executeOrchestration, forcePergunta } from '../../functions/api/agent/route.js';

const baseEnv = { INKFLOW_TOOL_SECRET: 'sek', AGENT_INTERNAL_BASE_URL: 'http://localhost:8788' };
const baseTenant = { id: 't1', config_precificacao: { sinal_percentual: 30 } };
const baseConversa = { dados_cadastro: { nome: 'X' }, valor_proposto: 750 };

test('forcePergunta: muda proxima_acao + resposta_cliente preservando o resto', () => {
  const out = { resposta_cliente: 'orig', proxima_acao: 'reservar_horario', slot_inicio: 'a', slot_fim: 'b' };
  const r = forcePergunta(out, 'tente outro');
  assert.equal(r.proxima_acao, 'pergunta');
  assert.equal(r.resposta_cliente, 'tente outro');
  assert.equal(r.slot_inicio, 'a');  // payload preservado pra log
});

test('executeOrchestration reservar_horario: !ok de reservar-horario vira pergunta', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async (url) => {
    if (url.includes('reservar-horario')) {
      return { ok: false, status: 409, json: async () => ({ ok: false, error: 'slot-taken' }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  const sideEffects = [];
  const r = await executeOrchestration(
    { resposta_cliente: 'Bora!', proxima_acao: 'reservar_horario', slot_inicio: '2026-05-12T17:00:00Z', slot_fim: '2026-05-12T20:00:00Z' },
    { env: baseEnv, tenant: baseTenant, conversa: baseConversa, telefone: '5511', sideEffects }
  );

  assert.equal(r.proxima_acao, 'pergunta');
  assert.match(r.resposta_cliente, /escolher outro/);
  assert.equal(sideEffects.length, 1);
  assert.equal(sideEffects[0].tool, 'reservar-horario');
  assert.equal(sideEffects[0].ok, false);
});

test('executeOrchestration reservar_horario: !ok de gerar-link-sinal vira pergunta + 2 side effects', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async (url) => {
    if (url.includes('reservar-horario')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, agendamento_id: 'ag-1' }) };
    }
    if (url.includes('gerar-link-sinal')) {
      return { ok: false, status: 502, json: async () => ({ ok: false, error: 'mp-timeout' }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  const sideEffects = [];
  const r = await executeOrchestration(
    { resposta_cliente: 'Bora!', proxima_acao: 'reservar_horario', slot_inicio: '2026-05-12T17:00:00Z', slot_fim: '2026-05-12T20:00:00Z' },
    { env: baseEnv, tenant: baseTenant, conversa: baseConversa, telefone: '5511', sideEffects }
  );

  assert.equal(r.proxima_acao, 'pergunta');
  assert.match(r.resposta_cliente, /problema gerando o link/);
  assert.equal(sideEffects.length, 2);
  assert.equal(sideEffects[0].ok, true);
  assert.equal(sideEffects[1].ok, false);
});

test('executeOrchestration reservar_horario: happy path concatena link MP no resposta_cliente', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async (url) => {
    if (url.includes('reservar-horario')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, agendamento_id: 'ag-1' }) };
    }
    if (url.includes('gerar-link-sinal')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, link_pagamento: 'https://mpago.la/x', hold_horas: 24 }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  const sideEffects = [];
  const r = await executeOrchestration(
    { resposta_cliente: 'Bora!', proxima_acao: 'reservar_horario', slot_inicio: '2026-05-12T17:00:00Z', slot_fim: '2026-05-12T20:00:00Z' },
    { env: baseEnv, tenant: baseTenant, conversa: baseConversa, telefone: '5511', sideEffects }
  );

  assert.equal(r.proxima_acao, 'reservar_horario');  // mantem
  assert.match(r.resposta_cliente, /Bora!/);  // prefix preservado
  assert.match(r.resposta_cliente, /R\$ 225,00/);  // 30% de 750
  assert.match(r.resposta_cliente, /https:\/\/mpago\.la\/x/);  // URL crua
  assert.match(r.resposta_cliente, /24 horas/);
  assert.equal(sideEffects.length, 2);
});

test('executeOrchestration pediu_desconto: !ok de enviar-objecao-tatuador vira pergunta', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async () => ({
    ok: false, status: 502, json: async () => ({ ok: false, error: 'telegram-down' }),
  }));

  const sideEffects = [];
  const r = await executeOrchestration(
    { resposta_cliente: 'Anotado!', proxima_acao: 'pediu_desconto', valor_pedido_cliente: 600 },
    { env: baseEnv, tenant: baseTenant, conversa: baseConversa, telefone: '5511', sideEffects }
  );

  assert.equal(r.proxima_acao, 'pergunta');
  assert.match(r.resposta_cliente, /Anota ai/);
  assert.equal(sideEffects.length, 1);
  assert.equal(sideEffects[0].tool, 'enviar-objecao-tatuador');
  assert.equal(sideEffects[0].ok, false);
});

test('executeOrchestration cliente_agressivo: chama acionar-handoff com motivo correto', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const fetchMock = mock.fn(async () => ({
    ok: true, status: 200, json: async () => ({ ok: true }),
  }));
  globalThis.fetch = fetchMock;

  const sideEffects = [];
  await executeOrchestration(
    { resposta_cliente: 'Vou pedir ajuda', proxima_acao: 'cliente_agressivo' },
    { env: baseEnv, tenant: baseTenant, conversa: baseConversa, telefone: '5511', sideEffects }
  );

  assert.equal(fetchMock.mock.callCount(), 1);
  const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
  assert.equal(body.motivo, 'cliente_agressivo');
  assert.equal(sideEffects[0].tool, 'acionar-handoff');
  assert.equal(sideEffects[0].motivo, 'cliente_agressivo');
});

test('executeOrchestration noop cases: pergunta/oferecendo_horario/adiou retornam out sem fetch', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const fetchMock = mock.fn();
  globalThis.fetch = fetchMock;

  const sideEffects = [];
  for (const acao of ['pergunta', 'oferecendo_horario', 'adiou']) {
    const r = await executeOrchestration(
      { resposta_cliente: 'x', proxima_acao: acao },
      { env: baseEnv, tenant: baseTenant, conversa: baseConversa, telefone: '5511', sideEffects }
    );
    assert.equal(r.proxima_acao, acao);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(sideEffects.length, 0);
});
```

Run:

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/agent/route-orchestrator.test.mjs
```
Expected: 7 passed (1 forcePergunta + 6 executeOrchestration cobrindo happy path + 3 failure branches + 1 handoff + 1 noops).

- [ ] **Step 7: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git add tests/prompts/invariants.test.mjs tests/agent/route.test.mjs tests/agent/route-orchestrator.test.mjs && git commit -m "$(cat <<'EOF'
test(agent/route): proposta 501 + invariants v2 + orchestrator units

Sub-3.2 testes do route.js + invariants + orchestrator unit.
PROMPTS_V1 exclui coleta-proposta (legacy) — agora valida v2
contract. route.test.mjs cobre 4 cases (501 estados pausados +
isStateImplemented).

route-orchestrator.test.mjs (NOVO) fecha gap de cobertura
deixado pelo eval real + smoke (que so cobrem happy path).
7 unit tests via mock fetch: forcePergunta (1), reservar_horario
happy/falha-reservar/falha-link (3), pediu_desconto !ok (1),
cliente_agressivo handoff (1), noops sem fetch (1).

Decisao: nao mockar OpenAI run() em route.test.mjs — superficie
complexa de manter. executeOrchestration eh extraido como export
puro pra test direto, validando branches que eval/smoke nao
exercitam.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Eval suite TC-P01..TC-P11

**Files:**
- Create: `tests/agent/_fixtures/scenarios-proposta.json`
- Create: `tests/agent/proposta-agent.eval.mjs`

- [ ] **Step 1: Read scenarios-cadastro.json + cadastro-agent.eval.mjs como referência**

```bash
cat /Users/brazilianhustler/Documents/inkflow-saas/tests/agent/_fixtures/scenarios-cadastro.json | head -80
cat /Users/brazilianhustler/Documents/inkflow-saas/tests/agent/cadastro-agent.eval.mjs
```
Confirmar shape de scenarios + assertion types + como eval invoca o agent (mocks vs real OpenAI).

- [ ] **Step 2: Write scenarios-proposta.json (TC-P01..TC-P11)**

```json
[
  {
    "id": "TC-P01",
    "estado_atual": "propondo_valor",
    "valor_proposto": 750,
    "decisao_desconto": null,
    "horarios_livres": [
      { "inicio": "2026-05-12T17:00:00Z", "fim": "2026-05-12T20:00:00Z", "legenda": "ter 12/05 14h-17h" },
      { "inicio": "2026-05-14T13:00:00Z", "fim": "2026-05-14T16:00:00Z", "legenda": "qui 14/05 10h-13h" }
    ],
    "historico": [{ "role": "assistant", "content": "Show! Pelo trabalho ficou em R$ 750. Bora marcar?" }],
    "mensagem": "fechou, vamos marcar",
    "assertions": [
      { "type": "proxima_acao_equals", "value": "oferecendo_horario" },
      { "type": "resposta_cliente_contains_slots", "value": ["ter", "qui"] }
    ]
  },
  {
    "id": "TC-P02",
    "estado_atual": "propondo_valor",
    "valor_proposto": 750,
    "horarios_livres": [],
    "historico": [{ "role": "assistant", "content": "Show! Pelo trabalho ficou em R$ 750. Bora marcar?" }],
    "mensagem": "ta um pouco caro",
    "assertions": [
      { "type": "proxima_acao_equals", "value": "pergunta" },
      { "type": "resposta_cliente_matches", "value": "\\?" }
    ]
  },
  {
    "id": "TC-P03",
    "estado_atual": "propondo_valor",
    "valor_proposto": 750,
    "horarios_livres": [],
    "historico": [{ "role": "assistant", "content": "Show! Pelo trabalho ficou em R$ 750. Bora marcar?" }],
    "mensagem": "consegue por 600?",
    "assertions": [
      { "type": "proxima_acao_equals", "value": "pediu_desconto" },
      { "type": "payload_includes", "value": { "valor_pedido_cliente": 600 } }
    ]
  },
  {
    "id": "TC-P04",
    "estado_atual": "propondo_valor",
    "valor_proposto": 750,
    "horarios_livres": [],
    "historico": [{ "role": "assistant", "content": "Show! Pelo trabalho ficou em R$ 750. Bora marcar?" }],
    "mensagem": "vou pensar e te volto",
    "assertions": [{ "type": "proxima_acao_equals", "value": "adiou" }]
  },
  {
    "id": "TC-P05",
    "estado_atual": "propondo_valor",
    "valor_proposto": 600,
    "decisao_desconto": "aceito",
    "horarios_livres": [
      { "inicio": "2026-05-12T17:00:00Z", "fim": "2026-05-12T20:00:00Z", "legenda": "ter 12/05 14h-17h" },
      { "inicio": "2026-05-14T13:00:00Z", "fim": "2026-05-14T16:00:00Z", "legenda": "qui 14/05 10h-13h" }
    ],
    "historico": [{ "role": "assistant", "content": "Show! Ele topou em R$ 600. Bora marcar?" }],
    "mensagem": "vamos",
    "assertions": [{ "type": "proxima_acao_equals", "value": "oferecendo_horario" }]
  },
  {
    "id": "TC-P06",
    "estado_atual": "propondo_valor",
    "valor_proposto": 750,
    "decisao_desconto": "recusado",
    "horarios_livres": [],
    "historico": [{ "role": "assistant", "content": "Ele preferiu manter R$ 750. Ta fechado pra ti? Bora marcar?" }],
    "mensagem": "humm, vou pensar",
    "assertions": [{ "type": "proxima_acao_equals", "value": "adiou" }]
  },
  {
    "id": "TC-P07",
    "estado_atual": "escolhendo_horario",
    "valor_proposto": 750,
    "horarios_livres": [
      { "inicio": "2026-05-12T17:00:00Z", "fim": "2026-05-12T20:00:00Z", "legenda": "ter 12/05 14h-17h" },
      { "inicio": "2026-05-14T13:00:00Z", "fim": "2026-05-14T16:00:00Z", "legenda": "qui 14/05 10h-13h" }
    ],
    "historico": [{ "role": "assistant", "content": "Tenho ter 12/05 14h-17h ou qui 14/05 10h-13h. Qual prefere?" }],
    "mensagem": "qui",
    "assertions": [
      { "type": "proxima_acao_equals", "value": "reservar_horario" },
      { "type": "payload_includes", "value": { "slot_inicio": "2026-05-14T13:00:00Z", "slot_fim": "2026-05-14T16:00:00Z" } }
    ]
  },
  {
    "id": "TC-P08",
    "estado_atual": "escolhendo_horario",
    "valor_proposto": 750,
    "horarios_livres": [
      { "inicio": "2026-05-12T17:00:00Z", "fim": "2026-05-12T20:00:00Z", "legenda": "ter 12/05 14h-17h" }
    ],
    "historico": [{ "role": "assistant", "content": "Tenho ter 12/05 14h-17h. Qual prefere?" }],
    "mensagem": "amanha 9h?",
    "assertions": [
      { "type": "proxima_acao_equals", "value": "pergunta" },
      { "type": "resposta_cliente_contains_slots", "value": ["ter"] }
    ]
  },
  {
    "id": "TC-P09",
    "estado_atual": "aguardando_sinal",
    "valor_proposto": 750,
    "proposta_status": "aguardando_pgto",
    "horarios_livres": [
      { "inicio": "2026-05-14T13:00:00Z", "fim": "2026-05-14T16:00:00Z", "legenda": "qui 14/05 10h-13h" }
    ],
    "historico": [{ "role": "assistant", "content": "Bora! Pra agendar... R$ 225,00. https://mp/abc..." }],
    "mensagem": "o link venceu",
    "assertions": [{ "type": "proxima_acao_equals", "value": "reservar_horario" }]
  },
  {
    "id": "TC-P10",
    "estado_atual": "aguardando_sinal",
    "valor_proposto": 750,
    "proposta_status": "aguardando_pgto",
    "historico": [{ "role": "assistant", "content": "Bora! Pra agendar... R$ 225,00. https://mp/abc..." }],
    "mensagem": "preciso mudar pra outro dia",
    "assertions": [{ "type": "proxima_acao_equals", "value": "reagendamento" }]
  },
  {
    "id": "TC-P11",
    "estado_atual": "propondo_valor",
    "valor_proposto": 750,
    "historico": [{ "role": "assistant", "content": "Show! Pelo trabalho ficou em R$ 750. Bora marcar?" }],
    "mensagem": "vai se f*der",
    "assertions": [{ "type": "proxima_acao_equals", "value": "cliente_agressivo" }]
  }
]
```

- [ ] **Step 3: Write proposta-agent.eval.mjs (node:test pattern do cadastro-agent.eval.mjs)**

```js
// tests/agent/proposta-agent.eval.mjs
// Eval suite PropostaAgent — 11 cenarios contra gpt-4o-mini real.
// NAO roda em CI (filename *.eval.mjs fora do glob *.test.mjs).
//
// Run: OPENAI_API_KEY=sk-... node --test tests/agent/proposta-agent.eval.mjs
// Custo estimado: ~$0.03 por suite completa.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { run } from '@openai/agents';
import { setDefaultOpenAIKey } from '@openai/agents-openai';
import { buildPropostaAgent } from '../../functions/api/agent/agents/proposta.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '_fixtures', 'scenarios-proposta.json');
const scenarios = JSON.parse(readFileSync(FIXTURES_PATH, 'utf-8'));

if (!process.env.OPENAI_API_KEY) {
  test('proposta-agent eval skipped (no OPENAI_API_KEY)', { skip: true }, () => {});
} else {
  setDefaultOpenAIKey(process.env.OPENAI_API_KEY);

  for (const sc of scenarios) {
    test(`${sc.id}: ${sc.mensagem.slice(0, 40)}`, async () => {
      const tenant = {
        id: 't-eval',
        nome_estudio: 'Estudio Eval',
        config_precificacao: { sinal_percentual: 30 },
        faqs: [], fewshots: [],
      };
      const conversa = {
        telefone: '5511999',
        estado_agente: sc.estado_atual,
        dados_cadastro: { nome: 'Cliente Eval' },
        dados_coletados: { decisao_desconto: sc.decisao_desconto ?? null },
        valor_proposto: sc.valor_proposto,
      };
      const clientContext = {
        valor_proposto: sc.valor_proposto,
        decisao_desconto: sc.decisao_desconto ?? null,
        horarios_livres: sc.horarios_livres || [],
        proposta_status: sc.proposta_status || null,
      };
      const { agent, validator } = buildPropostaAgent({
        env: {}, tenant, conversa, clientContext, estado_atual: sc.estado_atual,
      });
      const messages = [
        ...sc.historico.map(h => h.role === 'assistant'
          ? { role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: h.content }] }
          : { role: 'user', content: h.content }),
        { role: 'user', content: sc.mensagem },
      ];
      const result = await run(agent, messages, { maxTurns: 5 });
      const out = result.finalOutput;
      assert.ok(out, `${sc.id}: agent retornou null/undefined`);
      const inv = validator(out);
      assert.equal(inv.valid, true, `${sc.id}: invariant violation: ${inv.reason || ''}`);

      for (const a of sc.assertions) {
        if (a.type === 'proxima_acao_equals') {
          assert.equal(out.proxima_acao, a.value, `${sc.id}/proxima_acao`);
        } else if (a.type === 'payload_includes') {
          for (const [k, v] of Object.entries(a.value)) {
            assert.equal(out[k], v, `${sc.id}/${k}`);
          }
        } else if (a.type === 'resposta_cliente_matches') {
          assert.match(out.resposta_cliente, new RegExp(a.value), `${sc.id}/regex`);
        } else if (a.type === 'resposta_cliente_contains_slots') {
          const lower = out.resposta_cliente.toLowerCase();
          for (const term of a.value) {
            assert.ok(lower.includes(term.toLowerCase()), `${sc.id}: faltou "${term}" em "${out.resposta_cliente}"`);
          }
        }
      }
    });
  }
}
```

- [ ] **Step 4: Run eval (gate)**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && OPENAI_API_KEY=$(grep OPENAI_API_KEY .dev.vars | cut -d= -f2) node --test tests/agent/proposta-agent.eval.mjs 2>&1 | tail -40
```
Target: 11/11 pass. Aceitavel: 10/11 com plano de fix em <1 round.

Se algum cenario falhar (ex: TC-P05 mini interpretou "vamos" como pergunta), iterar prompt em `decisao.js`/`exemplos.js` (1-2 rounds = ~$0.03 conforme estimado no spec). Documentar fix inline antes do commit. Pattern Sub-3.1: 7/9 → 9/9 em 1 round.

- [ ] **Step 5: Adicionar npm script `eval:proposta` em `package.json`**

Adicionar entry no objeto `scripts`:

```json
{
  "scripts": {
    "test": "node --test tests/**/*.test.mjs",
    "eval:tattoo": "node --test tests/agent/tattoo-agent.eval.mjs",
    "eval:cadastro": "node --test tests/agent/cadastro-agent.eval.mjs",
    "eval:proposta": "node --test tests/agent/proposta-agent.eval.mjs"
  }
}
```

NOTA: `eval:cadastro` PODE nao existir ainda (depende se Sub-3.1 adicionou). Se nao existir, ADICIONAR junto — tudo num commit. Se ja existir, manter.

Validar:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && OPENAI_API_KEY=$(grep OPENAI_API_KEY .dev.vars | cut -d= -f2) npm run eval:proposta 2>&1 | tail -20
```

- [ ] **Step 6: Regressao Sub-2 + Sub-3.1 evals (paid)**

Antes de declarar Sub-3.2 done, garantir que cross-agent refactor (Task 8) nao quebrou Sub-2/3.1:

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && OPENAI_API_KEY=$(grep OPENAI_API_KEY .dev.vars | cut -d= -f2) npm run eval:tattoo 2>&1 | tail -20
cd /Users/brazilianhustler/Documents/inkflow-saas && OPENAI_API_KEY=$(grep OPENAI_API_KEY .dev.vars | cut -d= -f2) npm run eval:cadastro 2>&1 | tail -20
```

Target: tattoo 10/10 (baseline Sub-2), cadastro 9/9 (baseline Sub-3.1). Custo combinado: ~$0.05.

Se algum cenario regrediu (ex: cadastro 8/9), investigar SE a regressao foi por causa do refactor (Task 8) — closure pattern muda chamada do validator, nao deveria afetar output do agent. Mais provavel: flake do mini. Re-rodar 1x; se persistir, abrir P0 issue.

- [ ] **Step 7: Commit (gate aprovado)**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git add tests/agent/_fixtures/scenarios-proposta.json tests/agent/proposta-agent.eval.mjs package.json && git commit -m "$(cat <<'EOF'
test(agent/proposta): eval suite TC-P01..TC-P11 cobre §3.1-§3.6

Sub-3.2 eval gate. 11 cenarios cobrindo §3 fluxo + §4 tabela
1:1 da spec. Assertion types: proxima_acao_equals,
payload_includes (slots ISO + valor_pedido_cliente),
resposta_cliente_matches (regex), resposta_cliente_contains_slots
(legendas). gpt-4o-mini paridade Sub-2/3.1. Skip se
OPENAI_API_KEY ausente. npm script eval:proposta adicionado
(paridade eval:tattoo/eval:cadastro). Eval gate atual: X/11.
Sub-2 tattoo eval Y/10 + Sub-3.1 cadastro eval Z/9 (sem
regressao do cross-agent refactor).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Substituir `X/11`, `Y/10`, `Z/9` pelos resultados reais antes do commit.

---

## Task 14: Smoke local 4 fluxos via wrangler pages dev

Validacao end-to-end antes de declarar Sub-3.2 done. Usa MP em ambiente sandbox (R2).

**Files:**
- Modify (temp): `.dev.vars` se faltar `INKFLOW_TOOL_SECRET` ou `AGENT_INTERNAL_BASE_URL`
- Create: `scripts/smoke-proposta.sh` (helper opcional)

- [ ] **Step 1: Confirmar `.dev.vars` (R1, R2)**

```bash
grep -E "INKFLOW_TOOL_SECRET|AGENT_INTERNAL_BASE_URL|MERCADO_PAGO|OPENAI_API_KEY" /Users/brazilianhustler/Documents/inkflow-saas/.dev.vars | head -10
```
Expected: `INKFLOW_TOOL_SECRET`, `OPENAI_API_KEY`, `MERCADO_PAGO_ACCESS_TOKEN` (sandbox). Adicionar `AGENT_INTERNAL_BASE_URL=http://localhost:8788` se ausente.

R2 mitigação: confirmar com Leandro que o token MP em `.dev.vars` é o sandbox (chave começa com `TEST-...`), nao o de produção (`APP_USR-...`). Se for prod, ABORTAR smoke e cravar token sandbox antes.

- [ ] **Step 1b: Identificar tenant_id de teste com config minima**

Smoke chama tools reais que dependem de `tenant.horario_funcionamento` + `tenant.config_precificacao.sinal_percentual`. Precisa tenant Supabase configurado:

```bash
# Via supa MCP ou psql:
# SELECT id, nome_estudio, horario_funcionamento, config_precificacao
# FROM tenants
# WHERE horario_funcionamento IS NOT NULL
#   AND config_precificacao->>'sinal_percentual' IS NOT NULL
# LIMIT 3;
```

Pegar 1 ID que tenha `horario_funcionamento` populated (caso contrario `consultar-horarios` retorna lista vazia e fluxo trava). Substituir `<TENANT_TESTE_ID>` por esse UUID em todos os curls abaixo.

ALTERNATIVA: criar tenant `smoke-test-proposta` via SQL pre-smoke se nao houver candidato natural. Recomendado: usar tenant que VOCE administra (proprio inkflow ou conta de dev) — tenant de cliente real podia receber Telegram do `enviar-objecao-tatuador` smoke.

- [ ] **Step 2: Subir wrangler pages dev**

Comando correto pro repo (confirmado em `scripts/spike-openai-agents.mjs:106`):

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && npx wrangler pages dev functions --port 8788 --compatibility-date=2024-09-23 2>&1 | tee /tmp/wrangler-smoke.log
```
Run em background. Aguardar log "Ready on http://localhost:8788". Wrangler NAO precisa `dist` — Pages Functions roda direto do dir `functions`.

- [ ] **Step 3: Smoke fluxo Caminho A (propondo_valor → escolhendo_horario → aguardando_sinal)**

```bash
# POST 1 — propondo_valor + "fechou"
curl -sS -X POST http://localhost:8788/api/agent/route \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "<TENANT_TESTE_ID>",
    "telefone": "5511988887777",
    "mensagem": "fechou, vamos marcar",
    "estado_atual": "propondo_valor",
    "tenant": {"id":"<TENANT_TESTE_ID>","nome_estudio":"Smoke","config_precificacao":{"sinal_percentual":30}},
    "conversa": {"telefone":"5511988887777","estado_agente":"propondo_valor","valor_proposto":750,"dados_cadastro":{"nome":"Cliente Smoke"}}
  }' | jq

# Validar: ok=true, proxima_acao=oferecendo_horario, resposta_cliente menciona slots, side_effects=[]
```

```bash
# POST 2 — escolhendo_horario + "qui" (ajustar slot ISO conforme retorno do consultar-horarios)
curl -sS -X POST http://localhost:8788/api/agent/route \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "<TENANT_TESTE_ID>",
    "telefone": "5511988887777",
    "mensagem": "qui",
    "estado_atual": "escolhendo_horario",
    "tenant": {"id":"<TENANT_TESTE_ID>","nome_estudio":"Smoke","config_precificacao":{"sinal_percentual":30}},
    "conversa": {"telefone":"5511988887777","estado_agente":"escolhendo_horario","valor_proposto":750,"dados_cadastro":{"nome":"Cliente Smoke"}}
  }' | jq

# Validar:
# - proxima_acao=reservar_horario
# - side_effects: [{tool:"reservar-horario",ok:true,...}, {tool:"gerar-link-sinal",ok:true}]
# - resposta_cliente tem 3 partes separadas por \n\n: agent_text + linha pagamento + URL crua + linha validade
```

- [ ] **Step 4: Smoke fluxo Caminho B (cliente pede desconto) — ATENCAO TELEGRAM REAL**

⚠ `enviar-objecao-tatuador` MANDA TELEGRAM REAL pro chat configurado em `tenant.gatilhos_handoff[].telegram_chat_id`. O smoke vai disparar uma mensagem real "[CLIENTE PEDIU DESCONTO] valor proposto 750, cliente quer 600" pro tatuador. Antes de rodar:

1. Confirmar que o tenant teste aponta `telegram_chat_id` pra **VOCE** (nao um cliente real).
2. OU: avisar o tatuador real do tenant teste antes (1 mensagem teste so).
3. OU: temporariamente alterar `gatilhos_handoff` do tenant pra um chat dummy (e reverter depois).

Verificar chat_id atual via supa MCP:
```sql
SELECT id, nome_estudio, gatilhos_handoff FROM tenants WHERE id = '<TENANT_TESTE_ID>';
```

Apos validar, executar:

```bash
curl -sS -X POST http://localhost:8788/api/agent/route \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "<TENANT_TESTE_ID>",
    "telefone": "5511988886666",
    "mensagem": "consegue por 600?",
    "estado_atual": "propondo_valor",
    "tenant": {"id":"<TENANT_TESTE_ID>","nome_estudio":"Smoke","config_precificacao":{"sinal_percentual":30}},
    "conversa": {"telefone":"5511988886666","estado_agente":"propondo_valor","valor_proposto":750,"dados_cadastro":{"nome":"X"}}
  }' | jq

# Validar:
# - proxima_acao=pediu_desconto
# - side_effects: [{tool:"enviar-objecao-tatuador",ok:true}]
# - estado_novo=aguardando_decisao_desconto
# - Telegram do tatuador recebeu mensagem (validar visualmente).
```

- [ ] **Step 5: Smoke fluxo Caminho C (cliente adia)**

```bash
curl -sS -X POST http://localhost:8788/api/agent/route \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "<TENANT_TESTE_ID>",
    "telefone": "5511988885555",
    "mensagem": "vou pensar e te volto",
    "estado_atual": "propondo_valor",
    "tenant": {"id":"<TENANT_TESTE_ID>","nome_estudio":"Smoke","config_precificacao":{"sinal_percentual":30}},
    "conversa": {"telefone":"5511988885555","estado_agente":"propondo_valor","valor_proposto":750,"dados_cadastro":{"nome":"X"}}
  }' | jq

# Validar:
# - proxima_acao=adiou
# - side_effects=[]
# - estado_novo=lead_frio
```

- [ ] **Step 6: Smoke slot invalido (silently force pergunta)**

```bash
# POST com mensagem que vai fazer mini emitir slot fora da lista
curl -sS -X POST http://localhost:8788/api/agent/route \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "<TENANT_TESTE_ID>",
    "telefone": "5511988884444",
    "mensagem": "amanha 9h serve?",
    "estado_atual": "escolhendo_horario",
    "tenant": {"id":"<TENANT_TESTE_ID>","nome_estudio":"Smoke","config_precificacao":{"sinal_percentual":30}},
    "conversa": {"telefone":"5511988884444","estado_agente":"escolhendo_horario","valor_proposto":750,"dados_cadastro":{"nome":"X"}}
  }' | jq

# Validar:
# - proxima_acao=pergunta (forced)
# - side_effects=[]
# - resposta_cliente menciona slots disponiveis
```

- [ ] **Step 7: Tear down + commit**

```bash
# Matar wrangler pages dev (Ctrl+C ou kill da PID em background)
# Confirmar que nenhuma reserva orfã ficou no banco — checar via supa MCP:
# SELECT id,telefone,status,inicio FROM agendamentos WHERE telefone IN ('5511988887777','5511988886666','5511988885555','5511988884444') ORDER BY criado_em DESC LIMIT 10;
# Se houver tentative orfã do smoke, deletar manualmente.
```

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git add scripts/smoke-proposta.sh 2>/dev/null; git commit --allow-empty -m "$(cat <<'EOF'
test(smoke): Sub-3.2 PropostaAgent v2 smoke 4 fluxos verde

Validacao end-to-end via wrangler pages dev:
- Caminho A: propondo_valor → escolhendo_horario →
  aguardando_sinal (reservar+link MP concatenado byte-a-byte)
- Caminho B: pediu_desconto chama enviar-objecao-tatuador
- Caminho C: adiou → lead_frio sem side-effect
- Slot invalido: silently force pergunta com legendas

MP em sandbox (R2 mitigado). Reservas teste limpas pos-smoke.
Sub-3.2 done — Sub-4 cuida de cutover prod.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Definition of Done — Sub-3.2

- [ ] 5 helpers TDD verde via `node --test`: calcular-sinal (4), lookup-horario (7), format-link-sinal-msg (4), call-tool (4), prefetch-proposta (4) — total 23 tests.
- [ ] PropostaOutputSchema + validator closure-bound TDD verde — 13 tests (4 schema + 9 validator).
- [ ] Cross-agent refactor: tattoo/cadastro/proposta builders todos retornam `{ agent, validator }`. `selectAgentValidator`/`VALIDATORS` removidos do router.js. `npm test` verde.
- [ ] router.js: NEXT_STATE entries pros 3 sub-estados Proposta + 4 transicoes cada. Estados pausados (`aguardando_decisao_desconto`, `lead_frio`, `fechado`) → 501.
- [ ] 6 prompt blocks novos (Task 9) + generate.js v2 e fluxo.js v2 atomic (Task 10) + contract `coleta-proposta` v2 valido (must_contain/must_not_contain/<2400 tokens).
- [ ] route.js orchestrator switch (5 cases handled) + pre-fetch + force-pergunta (3 reasons) wired. `executeOrchestration` e `forcePergunta` exportados pra unit test.
- [ ] route.test.mjs com 4 proposta tests verde (3 estados pausados em 501 + 1 implementado).
- [ ] route-orchestrator.test.mjs com 7 unit tests verdes — fecha gap de cobertura dos branches `!ok` que eval real + smoke nao exercitam.
- [ ] invariants.test.mjs `PROMPTS_V1` exclui `coleta-proposta` legacy via filter — npm test verde.
- [ ] Eval suite TC-P01..TC-P11 ≥10/11 pass via `npm run eval:proposta`. npm script adicionado em package.json.
- [ ] Smoke local 4 fluxos verde via `npx wrangler pages dev functions` (Caminho A/B/C + slot invalido) — tenant_id real com horario_funcionamento + MP token sandbox + Telegram chat_id de teste (NAO cliente real).
- [ ] Sub-2 + Sub-3.1 evals re-rodados verde (`npm run eval:tattoo`, `npm run eval:cadastro`) — sem regressao do cross-agent refactor.
- [ ] CI verde no PR (`npm test` no GitHub Actions).
- [ ] Branch `feature/coleta-proposta-v2` mergeado em `main` via PR (ou pronto pra merge).

---

## Out-of-scope (Sub-4 / follow-up PRs)

Confirmado e cravado:
- Sub-4 cutover Evolution → CF Workers webhook direto.
- Persistencia real de conversa em Supabase.
- Estados pausados noop (`aguardando_decisao_desconto`, `lead_frio`, `fechado`).
- PortfolioAgent v2 (Sub-3.3).
- Bug-fix botao Telegram "Fechar valor" → "Informar valor" (P1 separado).
- Parcelamento configurado no Painel (P1 feature nova).
- Reentry agent turn-zero (bot abre conversa sem mensagem cliente).
