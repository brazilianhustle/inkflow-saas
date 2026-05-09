# Sub-3.3 PortfolioAgent v2 (intent transversal `enviar_portfolio`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduzir intent transversal `enviar_portfolio` orquestrada pelo `route.js` e suportada pelos 3 agents de fase (Tattoo/Cadastro/Proposta v2), sem criar agent LLM novo. Tool `enviar-portfolio.js` permanece intacta. Escopo cravado pelo brainstorm — NÃO re-debater R1-R7 (ver spec §"Riscos e assumptions").

**Architecture:** Pre-fetch helper isolado (`prefetchPortfolio`) deriva boolean `portfolio_disponivel` de `tenant.portfolio_urls.length > 0` e injeta em `clientContext` antes do agent rodar. Cada agent ganha enum `enviar_portfolio` + campo `payload_portfolio: { estilo?, max?, motivo? }` no schema Zod e 1 bloco `## Cliente pediu portfolio` em `decisao.js` (regra: `portfolio_disponivel=true` → emite intent; `false` → pergunta com mensagem alternativa). Validator hard-fail se `proxima_acao='enviar_portfolio'` E `portfolio_disponivel=false` (paridade `enforceMenorIdade`/Sub-3.1). `route.js` ganha branch transversal `enviar_portfolio` que chama `callTool('enviar-portfolio', ...)` e devolve `urls_portfolio` na response — branch roda para QUALQUER agent (não só Proposta), pois é intent transversal. Estado pós-envio = `estado_atual` (não muda fase).

**Tech Stack:** `@openai/agents` (Agents SDK), `gpt-4o-mini`, Zod, Cloudflare Pages Functions, `node:test` + `assert/strict` + `mock` from `node:test` (NOT vitest), `wrangler pages dev` para smoke, evals via `tests/agent/portfolio-intent.eval.mjs`.

**Test conventions (paridade Sub-3.2 — locked-in):**
- `import { test, mock } from 'node:test';`
- `import assert from 'node:assert/strict';`
- Asserts: `assert.equal`, `assert.deepEqual`, `assert.match`, `assert.ok`, `assert.doesNotMatch`, `assert.rejects`, `assert.throws`
- Mocks: `globalThis.fetch = mock.fn(async () => ({...}))` ou `mock.method(obj, 'name', fn)`; cleanup local via `t.after(() => { globalThis.fetch = original; })` por test
- Test files: `*.test.mjs` (CI runs); eval files: `*.eval.mjs` (manual, paid — fora do glob `tests/**/*.test.mjs`)
- Fixtures: `JSON.parse(readFileSync(join(__dirname, '_fixtures', 'x.json'), 'utf-8'))`
- Sem `describe/it/beforeEach`/`vi.*`/`expect()` — repo NÃO tem vitest

**Spec source:** `docs/superpowers/specs/2026-05-09-sub3-3-portfolio-agent-v2-design.md`

**Branch:** `feat/sub3-3-portfolio-agent-v2` (já criada)

**Decisões cravadas pré-plan (NÃO re-debater):**
- Orchestrator-only (sem agent LLM novo) — YAGNI
- 3 agents de fase ganham a intent (tattoo/cadastro/proposta)
- Tool `functions/api/tools/enviar-portfolio.js` INTACTA
- `payload_portfolio` usa `.nullable().default(null)` (lesson Sub-3.1)
- Estado pós-envio = `estado_atual`
- Sem throttle persistido / sem mensagem template
- Modelo `gpt-4o-mini` (paridade Sub-2/3.1/3.2)
- Validator hard-fail se intent + `portfolio_disponivel=false`

---

## Risks flagged

- **R1 (false positive):** LLM emite `enviar_portfolio` quando cliente NÃO pediu. Mitigação: prompt explicita gatilhos exatos (trabalhos / portfolio / fotos / exemplos / instagram / referencias). Eval TC-PORT-03/06 cobre.
- **R2 (intent + sem portfolio):** LLM emite intent mas `portfolio_disponivel=false`. Mitigação: validator hard-fail em todos os 3 agents (paridade `enforceMenorIdade`). Eval TC-PORT-03/06.
- **R4 (tool fail):** `enviar-portfolio` retorna `!ok`. Mitigação: degrade graceful — `urls_portfolio=[]` na response, agent na próxima rodada vê histórico e adapta. Coberto em unit test.
- **R7 (response shape):** adicionar `urls_portfolio` na response é additive — backwards-compatible (consumers ignoram campo desconhecido). Smoke local + Sub-4 absorve cutover.
- **A1 (tenant via payload):** `body.tenant.portfolio_urls` é stub no Sub-3.3 (paridade Sub-1/2/3.2). Sub-4 puxa do Supabase. Helper só deriva boolean, não faz SELECT.
- **Closure cross-agent (regression):** schemas dos 3 agents mudam. Validator de Tattoo + Cadastro hoje tem assinatura `(out)` — vamos ampliar pra `(out, clientContext)` mantendo closure pattern Sub-3.2. Risco: eval Sub-2 + Sub-3.1 verde após mudança. Step de regression no Task 12.

---

## File Structure (planned)

### Files NOVOS

```
functions/api/agent/_lib/prefetch-portfolio.js          # helper isolado, 1 export
tests/agent/_lib/prefetch-portfolio.test.mjs            # 4 unit tests TDD
tests/agent/route-portfolio-orchestrator.test.mjs       # unit do branch case + degrade graceful
tests/agent/portfolio-intent.eval.mjs                   # 9 cenarios eval real (gpt-4o-mini)
tests/agent/_fixtures/scenarios-portfolio.json          # 9 cenarios JSON
```

### Files EDITADOS

```
functions/api/agent/agents/tattoo.js                    # enum + payload + invariant + closure expand
functions/api/agent/agents/cadastro.js                  # idem
functions/api/agent/agents/proposta.js                  # idem + ALLOWED_BY_STATE entries (3 substates)
functions/api/agent/router.js                           # NEXT_STATE entries enviar_portfolio (5)
functions/api/agent/route.js                            # prefetchPortfolio + branch case + urls_portfolio
functions/_lib/prompts/coleta/tattoo/decisao.js         # 1 bloco regra portfolio
functions/_lib/prompts/coleta/cadastro/decisao.js       # idem
functions/_lib/prompts/coleta/proposta/decisao.js       # idem
functions/_lib/prompts/coleta/tattoo/contexto.js        # 1 linha portfolio_disponivel
functions/_lib/prompts/coleta/cadastro/contexto.js      # idem
functions/_lib/prompts/coleta/proposta/contexto.js      # idem
```

### Files INTOCADOS (cravado)

```
functions/api/tools/enviar-portfolio.js                 # filtro substring substring atual
```

---

## Task 1: Pre-flight validation

Confirma A1 + R7 antes de qualquer código novo. Read-only.

**Files:**
- Read: `functions/api/tools/enviar-portfolio.js` (confirma shape body retornado: `{ ok, urls, total, motivo? }`)
- Read: `functions/api/agent/agents/tattoo.js`, `cadastro.js`, `proposta.js` (confirma assinatura validators atuais)
- Read: `functions/api/agent/route.js` (confirma onde plugar `prefetchPortfolio` + onde adicionar branch)
- Bash: `grep portfolio_urls supabase/migrations/`

- [ ] **Step 1: Confirmar shape retornado por `enviar-portfolio.js`**

```bash
grep -n "return" /Users/brazilianhustler/Documents/inkflow-saas/functions/api/tools/enviar-portfolio.js
```

Expected: encontrar `return { status: 200, body: { ok: true, ..., urls: filtrados.slice(0, limit), total } };` e `return { status: 200, body: { ok: true, urls: [], motivo: 'portfolio_vazio' } };`. Confirma que após `await r.json()` (em `call-tool.js`) recebemos `{ ok, urls, total?, motivo? }` direto no top-level (não em `r.body`).

⚠️ **Nota crítica:** o spec menciona `r.body?.urls` mas `call-tool.js` faz `return { ok: r.ok, status: r.status, ...data }` (line 22) — então o body da tool vira top-level. **No Task 10 use `r.urls` (não `r.body?.urls`).**

- [ ] **Step 2: Confirmar assinatura atual dos validators**

```bash
grep -n "export function validate" /Users/brazilianhustler/Documents/inkflow-saas/functions/api/agent/agents/{tattoo,cadastro,proposta}.js
```

Expected:
- `validateTattooOutputInvariant(out)` (1 arg)
- `validateCadastroOutputInvariant(out)` (1 arg)
- `validatePropostaOutputInvariant(out, ctx, estado_atual)` (3 args)

Tasks 3/4 ampliam tattoo + cadastro pra `(out, clientContext)`. Task 5 adiciona check em proposta usando `ctx` já existente.

- [ ] **Step 3: Confirmar campo `portfolio_urls` no schema tenants**

```bash
grep -rn "portfolio_urls" /Users/brazilianhustler/Documents/inkflow-saas/supabase/migrations/ | head -5
```

Expected: ≥1 migration que adiciona/usa `portfolio_urls` (column tipo `text[]` ou `jsonb`). Se não encontrar, abortar plan e cravar com Leandro: helper `prefetchPortfolio` assume `tenant.portfolio_urls` array; se DB não tem, A1 fura.

- [ ] **Step 4: Localizar ponto de inserção do prefetch em `route.js`**

```bash
grep -n "prefetchPropostaContext\|clientContext = " /Users/brazilianhustler/Documents/inkflow-saas/functions/api/agent/route.js
```

Expected: linha 101 (`let clientContext = body?.clientContext || {};`) e linhas 102-107 (proposta-only prefetch). `prefetchPortfolio` roda para TODOS estados (tattoo + cadastro + proposta substates), inserir antes do bloco proposta-only. Anotar linhas exatas.

- [ ] **Step 5: Localizar branch da orchestration em `route.js`**

```bash
grep -n "executeOrchestration\|switch (out.proxima_acao)" /Users/brazilianhustler/Documents/inkflow-saas/functions/api/agent/route.js
```

Expected: `executeOrchestration` em ~linha 204; switch em ~linha 205. Hoje só roda para Proposta substates (linha 180). Para portfolio (transversal), Task 10 vai criar branch separado que roda independente do estado_atual — antes ou depois de `executeOrchestration` proposta. Anotar abordagem.

- [ ] **Step 6: Commit (read-only — sem changes)**

Pre-flight é read-only. Sem commit. Anotar achados (linhas + decisões R7) inline neste arquivo se algo divergir do spec.

---

## Task 2: Helper `prefetchPortfolio` + 4 unit tests (TDD)

**Files:**
- Create: `functions/api/agent/_lib/prefetch-portfolio.js`
- Test: `tests/agent/_lib/prefetch-portfolio.test.mjs`

- [ ] **Step 1: Escrever os 4 testes failing**

Create `tests/agent/_lib/prefetch-portfolio.test.mjs`:

```javascript
// tests/agent/_lib/prefetch-portfolio.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefetchPortfolio } from '../../../functions/api/agent/_lib/prefetch-portfolio.js';

test('prefetchPortfolio: tenant null -> portfolio_disponivel=false', async () => {
  const r = await prefetchPortfolio({}, null);
  assert.deepEqual(r, { portfolio_disponivel: false });
});

test('prefetchPortfolio: tenant.portfolio_urls null -> portfolio_disponivel=false', async () => {
  const r = await prefetchPortfolio({}, { id: 't1', portfolio_urls: null });
  assert.deepEqual(r, { portfolio_disponivel: false });
});

test('prefetchPortfolio: tenant.portfolio_urls=[] -> portfolio_disponivel=false', async () => {
  const r = await prefetchPortfolio({}, { id: 't1', portfolio_urls: [] });
  assert.deepEqual(r, { portfolio_disponivel: false });
});

test('prefetchPortfolio: tenant.portfolio_urls=["a","b"] -> portfolio_disponivel=true', async () => {
  const r = await prefetchPortfolio({}, { id: 't1', portfolio_urls: ['a', 'b'] });
  assert.deepEqual(r, { portfolio_disponivel: true });
});
```

- [ ] **Step 2: Rodar testes — confirmar fail**

```bash
node --test tests/agent/_lib/prefetch-portfolio.test.mjs
```

Expected: FAIL com `ERR_MODULE_NOT_FOUND` ou similar (helper ainda não existe).

- [ ] **Step 3: Implementar helper minimal**

Create `functions/api/agent/_lib/prefetch-portfolio.js`:

```javascript
// functions/api/agent/_lib/prefetch-portfolio.js
// Helper isolado — deriva portfolio_disponivel:boolean de tenant.portfolio_urls.length > 0.
//
// Usado por route.js antes de rodar qualquer agent (3 fases).
// Sub-3.3: tenant chega via body.tenant (paridade Sub-1/2/3.2 stub).
// Sub-4: route.js puxa tenant do Supabase, helper continua o mesmo.
//
// Args: (env, tenant)  — env nao usado hoje, mantido pra symmetry com prefetchPropostaContext
// Return: { portfolio_disponivel: boolean }
export async function prefetchPortfolio(_env, tenant) {
  if (!tenant) return { portfolio_disponivel: false };
  const urls = Array.isArray(tenant.portfolio_urls) ? tenant.portfolio_urls : [];
  return { portfolio_disponivel: urls.length > 0 };
}
```

- [ ] **Step 4: Rodar testes — confirmar pass**

```bash
node --test tests/agent/_lib/prefetch-portfolio.test.mjs
```

Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/api/agent/_lib/prefetch-portfolio.js tests/agent/_lib/prefetch-portfolio.test.mjs
git commit -m "feat(sub3-3): prefetch-portfolio helper + 4 unit tests TDD"
```

---

## Task 3: Tattoo agent — schema + invariant + closure expand

Schema ganha enum + `payload_portfolio`. Validator passa a aceitar `clientContext` e checa invariant. Builder closure-bind clientContext.

**Files:**
- Modify: `functions/api/agent/agents/tattoo.js`
- Test: `tests/agent/tattoo-agent.test.mjs` (acrescentar testes invariant — verificar arquivo existente primeiro)

- [ ] **Step 1: Inspecionar arquivo de testes do tattoo-agent**

```bash
grep -n "test(" /Users/brazilianhustler/Documents/inkflow-saas/tests/agent/tattoo-agent.test.mjs | head -20
```

Anotar padrão de testes existente. Se cobre `validateTattooOutputInvariant`, adicionar lá. Se não, criar block novo no fim do arquivo.

- [ ] **Step 2: Escrever testes failing pra invariant portfolio**

Append em `tests/agent/tattoo-agent.test.mjs`:

```javascript
// — Sub-3.3: invariant enviar_portfolio —————————————————————————————
import { validateTattooOutputInvariant as _vt } from '../../functions/api/agent/agents/tattoo.js';

test('Tattoo invariant: enviar_portfolio com portfolio_disponivel=true -> valid', () => {
  const out = {
    resposta_cliente: 'show, te mando',
    dados_persistidos: {},
    dados_completos: false,
    campos_faltando: [],
    campos_conflitantes: [],
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: 'fineline', max: null, motivo: null },
  };
  const r = _vt(out, { portfolio_disponivel: true });
  assert.equal(r.valid, true);
});

test('Tattoo invariant: enviar_portfolio com portfolio_disponivel=false -> invalid', () => {
  const out = {
    resposta_cliente: 'te mando',
    dados_persistidos: {},
    dados_completos: false,
    campos_faltando: [],
    campos_conflitantes: [],
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: null, max: null, motivo: null },
  };
  const r = _vt(out, { portfolio_disponivel: false });
  assert.equal(r.valid, false);
  assert.match(r.reason, /portfolio_disponivel=false/);
});

test('Tattoo invariant: enviar_portfolio sem payload_portfolio -> invalid', () => {
  const out = {
    resposta_cliente: 'te mando',
    dados_persistidos: {},
    dados_completos: false,
    campos_faltando: [],
    campos_conflitantes: [],
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: null,
  };
  const r = _vt(out, { portfolio_disponivel: true });
  assert.equal(r.valid, false);
  assert.match(r.reason, /payload_portfolio/);
});

test('Tattoo invariant: pergunta com payload_portfolio null -> valid (passthrough)', () => {
  const out = {
    resposta_cliente: 'qual tamanho?',
    dados_persistidos: { descricao_curta: 'rosa' },
    dados_completos: false,
    campos_faltando: ['tamanho_cm', 'local_corpo'],
    campos_conflitantes: [],
    proxima_acao: 'pergunta',
    payload_portfolio: null,
  };
  const r = _vt(out, { portfolio_disponivel: false });
  assert.equal(r.valid, true);
});
```

- [ ] **Step 3: Rodar testes — confirmar fail**

```bash
node --test tests/agent/tattoo-agent.test.mjs
```

Expected: 4 tests novos FAIL (assinatura do validator não aceita 2º arg, schema não tem `enviar_portfolio` no enum).

- [ ] **Step 4: Editar schema + validator + builder em `tattoo.js`**

Modify `functions/api/agent/agents/tattoo.js`:

**Schema (linhas ~29-48):** adicionar `enviar_portfolio` no enum + campo `payload_portfolio`:

```javascript
export const TattooOutputSchema = z.object({
  resposta_cliente: z.string().min(1),
  dados_persistidos: z.object({
    estilo: z.string().nullable().optional(),
    tamanho_cm: z.number().positive().max(200).nullable().optional(),
    altura_cm: z.number().positive().max(200).nullable().optional(),
    local_corpo: z.string().nullable().optional(),
    cor_preferencia: z.string().nullable().optional(),
    descricao_curta: z.string().nullable().optional(),
    foto_local: z.string().nullable().optional(),
  }),
  dados_completos: z.boolean(),
  campos_faltando: z.array(z.string()),
  campos_conflitantes: z.array(z.string()),
  proxima_acao: z.enum(['pergunta', 'handoff', 'enviar_portfolio', 'erro']),
  payload_portfolio: z.object({
    estilo: z.string().nullable().default(null),
    max: z.number().int().min(1).max(10).nullable().default(null),
    motivo: z.string().nullable().default(null),
  }).nullable().default(null),
});
```

**Validator (linhas ~52-65):** ampliar pra aceitar `clientContext` e checar invariant:

```javascript
// Valida invariante pos-parse. Retorna { valid: true } ou
// { valid: false, reason: string } pra route.js converter em HTTP 500.
//
// Sub-3.3: aceita 2o arg clientContext pra checar invariant enviar_portfolio.
// clientContext.portfolio_disponivel:boolean vem de prefetchPortfolio().
export function validateTattooOutputInvariant(out, clientContext = {}) {
  if (!out || typeof out !== 'object') {
    return { valid: false, reason: 'output ausente ou nao-objeto' };
  }
  if (out.proxima_acao === 'handoff') {
    if (out.dados_completos !== true) {
      return { valid: false, reason: 'handoff com dados_completos=false' };
    }
    if (Array.isArray(out.campos_conflitantes) && out.campos_conflitantes.length > 0) {
      return { valid: false, reason: `handoff com campos_conflitantes nao-vazio: ${out.campos_conflitantes.join(',')}` };
    }
  }
  if (out.proxima_acao === 'enviar_portfolio') {
    if (!clientContext?.portfolio_disponivel) {
      return { valid: false, reason: 'enviar_portfolio com portfolio_disponivel=false' };
    }
    if (!out.payload_portfolio) {
      return { valid: false, reason: 'enviar_portfolio sem payload_portfolio' };
    }
  }
  return { valid: true };
}
```

**Builder (linhas ~72-84):** closure-bind clientContext no validator:

```javascript
export function buildTattooAgent({ env, tenant, conversa, clientContext, baseUrl = 'http://localhost:8788' }) {
  const ctx = clientContext || {};
  const instructions = generatePromptColetaTattoo(tenant, conversa, ctx);

  const agent = new Agent({
    name: 'tattoo-agent',
    model: 'gpt-4o-mini',
    instructions,
    tools: [],
    outputType: TattooOutputSchema,
  });
  // Closure-bound validator (paridade Sub-3.2): route.js chama validator(out)
  // com 1 arg, closure carrega clientContext pra invariant enviar_portfolio.
  const validator = (out) => validateTattooOutputInvariant(out, ctx);
  return { agent, validator };
}
```

- [ ] **Step 5: Rodar testes — confirmar pass**

```bash
node --test tests/agent/tattoo-agent.test.mjs
```

Expected: todos PASS (incluindo os 4 novos).

- [ ] **Step 6: Rodar suite completa pra detectar regression**

```bash
npm test
```

Expected: todos PASS. Se algum test antigo fail (assinatura do validator), ajustar — costureira de regression típica: `validator(out)` em route.js continua funcionando porque passa `out` como 1º arg e closure ignora 2º.

- [ ] **Step 7: Commit**

```bash
git add functions/api/agent/agents/tattoo.js tests/agent/tattoo-agent.test.mjs
git commit -m "feat(sub3-3): tattoo schema + invariant para enviar_portfolio (closure clientContext)"
```

---

## Task 4: Cadastro agent — schema + invariant + closure expand

Mesma mecânica do Task 3, applied ao cadastro.

**Files:**
- Modify: `functions/api/agent/agents/cadastro.js`
- Test: `tests/agent/cadastro-agent.test.mjs` (criar se não existir — verificar primeiro)

- [ ] **Step 1: Verificar se há test file pra cadastro-agent**

```bash
ls /Users/brazilianhustler/Documents/inkflow-saas/tests/agent/cadastro-agent.test.mjs 2>/dev/null && echo "exists" || echo "missing"
```

Se `missing`, criar com 4 tests; se `exists`, append.

- [ ] **Step 2: Escrever 4 testes invariant failing**

Create OR append em `tests/agent/cadastro-agent.test.mjs`:

```javascript
// tests/agent/cadastro-agent.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCadastroOutputInvariant as _vc } from '../../functions/api/agent/agents/cadastro.js';

test('Cadastro invariant: enviar_portfolio com portfolio_disponivel=true -> valid', () => {
  const out = {
    resposta_cliente: 'te mando',
    dados_persistidos: { nome: null, data_nascimento: null, email: null },
    dados_completos: false,
    campos_faltando: ['nome', 'data_nascimento'],
    campos_conflitantes: [],
    email_recusado: false,
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: null, max: null, motivo: null },
  };
  const r = _vc(out, { portfolio_disponivel: true });
  assert.equal(r.valid, true);
});

test('Cadastro invariant: enviar_portfolio com portfolio_disponivel=false -> invalid', () => {
  const out = {
    resposta_cliente: 'te mando',
    dados_persistidos: { nome: null, data_nascimento: null, email: null },
    dados_completos: false,
    campos_faltando: [],
    campos_conflitantes: [],
    email_recusado: false,
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: null, max: null, motivo: null },
  };
  const r = _vc(out, { portfolio_disponivel: false });
  assert.equal(r.valid, false);
  assert.match(r.reason, /portfolio_disponivel=false/);
});

test('Cadastro invariant: enviar_portfolio sem payload_portfolio -> invalid', () => {
  const out = {
    resposta_cliente: 'te mando',
    dados_persistidos: {},
    dados_completos: false,
    campos_faltando: [],
    campos_conflitantes: [],
    email_recusado: false,
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: null,
  };
  const r = _vc(out, { portfolio_disponivel: true });
  assert.equal(r.valid, false);
  assert.match(r.reason, /payload_portfolio/);
});

test('Cadastro invariant: handoff existente continua passando (regression)', () => {
  const out = {
    resposta_cliente: 'fim',
    dados_persistidos: { nome: 'Joao', data_nascimento: '1995-03-12', email: null },
    dados_completos: true,
    campos_faltando: [],
    campos_conflitantes: [],
    email_recusado: true,
    proxima_acao: 'handoff',
    payload_portfolio: null,
  };
  const r = _vc(out, { portfolio_disponivel: false });
  assert.equal(r.valid, true);
});
```

- [ ] **Step 3: Rodar — confirmar fail**

```bash
node --test tests/agent/cadastro-agent.test.mjs
```

Expected: FAIL (enum não tem `enviar_portfolio`, validator ignora 2º arg).

- [ ] **Step 4: Editar `cadastro.js` — schema + validator + builder**

Modify `functions/api/agent/agents/cadastro.js`:

**Schema (linhas ~30-42):** adicionar enum + payload_portfolio:

```javascript
export const CadastroOutputSchema = z.object({
  resposta_cliente: z.string().min(1),
  dados_persistidos: z.object({
    nome: z.string().nullable().optional(),
    data_nascimento: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
  }),
  dados_completos: z.boolean(),
  campos_faltando: z.array(z.string()),
  campos_conflitantes: z.array(z.string()),
  email_recusado: z.boolean(),
  proxima_acao: z.enum(['pergunta', 'handoff', 'enviar_portfolio', 'erro']),
  payload_portfolio: z.object({
    estilo: z.string().nullable().default(null),
    max: z.number().int().min(1).max(10).nullable().default(null),
    motivo: z.string().nullable().default(null),
  }).nullable().default(null),
});
```

**Validator (linhas ~47-79):** aceitar clientContext + adicionar bloco enviar_portfolio (manter lógica existente do data_nascimento + handoff):

```javascript
export function validateCadastroOutputInvariant(out, clientContext = {}) {
  if (!out || typeof out !== 'object') {
    return { valid: false, reason: 'output ausente ou nao-objeto' };
  }

  // Validacao pos-output do formato ISO de data_nascimento.
  const dn = out.dados_persistidos?.data_nascimento;
  if (dn && !/^\d{4}-\d{2}-\d{2}$/.test(dn)) {
    return { valid: false, reason: `data_nascimento nao-ISO: ${dn}` };
  }

  if (out.proxima_acao === 'handoff') {
    if (out.dados_completos !== true) {
      return { valid: false, reason: 'handoff com dados_completos=false' };
    }
    if (!out.dados_persistidos?.nome) {
      return { valid: false, reason: 'handoff sem nome' };
    }
    if (!out.dados_persistidos?.data_nascimento) {
      return { valid: false, reason: 'handoff sem data_nascimento' };
    }
    if (!out.dados_persistidos?.email && out.email_recusado !== true) {
      return { valid: false, reason: 'handoff sem email nem email_recusado=true' };
    }
    if (Array.isArray(out.campos_conflitantes) && out.campos_conflitantes.length > 0) {
      return { valid: false, reason: `handoff com campos_conflitantes: ${out.campos_conflitantes.join(',')}` };
    }
  }

  if (out.proxima_acao === 'enviar_portfolio') {
    if (!clientContext?.portfolio_disponivel) {
      return { valid: false, reason: 'enviar_portfolio com portfolio_disponivel=false' };
    }
    if (!out.payload_portfolio) {
      return { valid: false, reason: 'enviar_portfolio sem payload_portfolio' };
    }
  }

  return { valid: true };
}
```

**Builder (linhas ~82-94):** closure-bind clientContext:

```javascript
export function buildCadastroAgent({ env, tenant, conversa, clientContext, baseUrl = 'http://localhost:8788' }) {
  const ctx = clientContext || {};
  const instructions = generatePromptColetaCadastro(tenant, conversa, ctx);

  const agent = new Agent({
    name: 'cadastro-agent',
    model: 'gpt-4o-mini',
    instructions,
    tools: [],
    outputType: CadastroOutputSchema,
  });
  const validator = (out) => validateCadastroOutputInvariant(out, ctx);
  return { agent, validator };
}
```

- [ ] **Step 5: Rodar — confirmar pass**

```bash
node --test tests/agent/cadastro-agent.test.mjs
npm test
```

Expected: todos PASS, incluindo Sub-3.1 invariants antigos.

- [ ] **Step 6: Commit**

```bash
git add functions/api/agent/agents/cadastro.js tests/agent/cadastro-agent.test.mjs
git commit -m "feat(sub3-3): cadastro schema + invariant para enviar_portfolio (closure clientContext)"
```

---

## Task 5: Proposta agent — schema + ALLOWED_BY_STATE + invariant

Proposta tem 7 valores no enum + tabela `ALLOWED_BY_STATE` com permissões por sub-estado. `enviar_portfolio` precisa entrar como permitido nos 3 sub-estados.

**Files:**
- Modify: `functions/api/agent/agents/proposta.js`
- Test: `tests/agent/proposta-validator.test.mjs` (existe — append)

- [ ] **Step 1: Inspecionar test file**

```bash
grep -n "test(" /Users/brazilianhustler/Documents/inkflow-saas/tests/agent/proposta-validator.test.mjs | head -10
```

Anotar padrão para append.

- [ ] **Step 2: Escrever 4 testes failing**

Append em `tests/agent/proposta-validator.test.mjs`:

```javascript
// — Sub-3.3: invariant enviar_portfolio —————————————————————————————
test('Proposta invariant: enviar_portfolio em propondo_valor com portfolio=true -> valid', () => {
  const out = {
    resposta_cliente: 'te mando',
    proxima_acao: 'enviar_portfolio',
    slot_inicio: null,
    slot_fim: null,
    valor_pedido_cliente: null,
    payload_portfolio: { estilo: 'blackwork', max: null, motivo: null },
  };
  const r = validatePropostaOutputInvariant(out, { portfolio_disponivel: true, valor_proposto: 750 }, 'propondo_valor');
  assert.equal(r.valid, true);
});

test('Proposta invariant: enviar_portfolio em escolhendo_horario com portfolio=true -> valid', () => {
  const out = {
    resposta_cliente: 'te mando',
    proxima_acao: 'enviar_portfolio',
    slot_inicio: null,
    slot_fim: null,
    valor_pedido_cliente: null,
    payload_portfolio: { estilo: null, max: null, motivo: null },
  };
  const r = validatePropostaOutputInvariant(out, { portfolio_disponivel: true, horarios_livres: [] }, 'escolhendo_horario');
  assert.equal(r.valid, true);
});

test('Proposta invariant: enviar_portfolio com portfolio=false -> invalid', () => {
  const out = {
    resposta_cliente: 'te mando',
    proxima_acao: 'enviar_portfolio',
    slot_inicio: null, slot_fim: null, valor_pedido_cliente: null,
    payload_portfolio: { estilo: null, max: null, motivo: null },
  };
  const r = validatePropostaOutputInvariant(out, { portfolio_disponivel: false }, 'aguardando_sinal');
  assert.equal(r.valid, false);
  assert.match(r.reason, /portfolio_disponivel=false/);
});

test('Proposta invariant: enviar_portfolio sem payload_portfolio -> invalid', () => {
  const out = {
    resposta_cliente: 'te mando',
    proxima_acao: 'enviar_portfolio',
    slot_inicio: null, slot_fim: null, valor_pedido_cliente: null,
    payload_portfolio: null,
  };
  const r = validatePropostaOutputInvariant(out, { portfolio_disponivel: true }, 'propondo_valor');
  assert.equal(r.valid, false);
  assert.match(r.reason, /payload_portfolio/);
});
```

⚠️ **Importar** `validatePropostaOutputInvariant` no top do test file se não estiver. Verificar com `grep "import.*validateProposta" tests/agent/proposta-validator.test.mjs`.

- [ ] **Step 3: Rodar — confirmar fail**

```bash
node --test tests/agent/proposta-validator.test.mjs
```

Expected: FAIL (enum sem `enviar_portfolio` + ALLOWED_BY_STATE sem entries).

- [ ] **Step 4: Editar `proposta.js` — enum + ALLOWED_BY_STATE + payload + invariant**

Modify `functions/api/agent/agents/proposta.js`:

**PROXIMA_ACAO_VALUES (linhas 17-25):** adicionar `enviar_portfolio`:

```javascript
export const PROXIMA_ACAO_VALUES = [
  'pergunta',
  'oferecendo_horario',
  'reservar_horario',
  'pediu_desconto',
  'adiou',
  'reagendamento',
  'cliente_agressivo',
  'enviar_portfolio',
];
```

**Schema (linhas 27-33):** adicionar `payload_portfolio`:

```javascript
export const PropostaOutputSchema = z.object({
  resposta_cliente: z.string().min(1).max(500),
  proxima_acao: z.enum(PROXIMA_ACAO_VALUES),
  slot_inicio: z.string().nullable().default(null),
  slot_fim: z.string().nullable().default(null),
  valor_pedido_cliente: z.number().nullable().default(null),
  payload_portfolio: z.object({
    estilo: z.string().nullable().default(null),
    max: z.number().int().min(1).max(10).nullable().default(null),
    motivo: z.string().nullable().default(null),
  }).nullable().default(null),
});
```

**ALLOWED_BY_STATE (linhas 35-39):** adicionar `enviar_portfolio` em todos os 3 sub-estados:

```javascript
const ALLOWED_BY_STATE = {
  propondo_valor:     ['pergunta', 'oferecendo_horario', 'pediu_desconto', 'adiou', 'reagendamento', 'cliente_agressivo', 'enviar_portfolio'],
  escolhendo_horario: ['pergunta', 'reservar_horario', 'reagendamento', 'cliente_agressivo', 'enviar_portfolio'],
  aguardando_sinal:   ['pergunta', 'reservar_horario', 'reagendamento', 'cliente_agressivo', 'enviar_portfolio'],
};
```

**Validator (linhas 41-69):** adicionar bloco `enviar_portfolio` antes do `return`:

```javascript
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
  if (out.proxima_acao === 'enviar_portfolio') {
    if (!ctx?.portfolio_disponivel) {
      return { valid: false, reason: 'enviar_portfolio com portfolio_disponivel=false' };
    }
    if (!out.payload_portfolio) {
      return { valid: false, reason: 'enviar_portfolio sem payload_portfolio' };
    }
  }
  return { valid: true };
}
```

(Builder não muda — closure já passa `ctx` que conterá `portfolio_disponivel` após Task 10.)

- [ ] **Step 5: Rodar — confirmar pass**

```bash
node --test tests/agent/proposta-validator.test.mjs
npm test
```

Expected: todos PASS. Sub-3.2 evals continuam consistentes.

- [ ] **Step 6: Commit**

```bash
git add functions/api/agent/agents/proposta.js tests/agent/proposta-validator.test.mjs
git commit -m "feat(sub3-3): proposta enum + ALLOWED_BY_STATE + invariant para enviar_portfolio"
```

---

## Task 6: Router NEXT_STATE — 5 entries `enviar_portfolio`

Estado pós-envio = `estado_atual` (não muda fase). 5 estados afetados: tattoo, cadastro, propondo_valor, escolhendo_horario, aguardando_sinal.

**Files:**
- Modify: `functions/api/agent/router.js`
- Test: `tests/agent/router.test.mjs` (append regression)

- [ ] **Step 1: Inspecionar test file existente**

```bash
grep -n "test(" /Users/brazilianhustler/Documents/inkflow-saas/tests/agent/router.test.mjs | head -10
```

- [ ] **Step 2: Escrever 5 testes failing pra `getNextState`**

Append em `tests/agent/router.test.mjs`:

```javascript
// — Sub-3.3: enviar_portfolio nao muda estado —————————————————————————
test('getNextState: tattoo + enviar_portfolio -> tattoo', () => {
  assert.equal(getNextState('tattoo', { proxima_acao: 'enviar_portfolio' }), 'tattoo');
});

test('getNextState: cadastro + enviar_portfolio -> cadastro', () => {
  assert.equal(getNextState('cadastro', { proxima_acao: 'enviar_portfolio' }), 'cadastro');
});

test('getNextState: propondo_valor + enviar_portfolio -> propondo_valor', () => {
  assert.equal(getNextState('propondo_valor', { proxima_acao: 'enviar_portfolio' }), 'propondo_valor');
});

test('getNextState: escolhendo_horario + enviar_portfolio -> escolhendo_horario', () => {
  assert.equal(getNextState('escolhendo_horario', { proxima_acao: 'enviar_portfolio' }), 'escolhendo_horario');
});

test('getNextState: aguardando_sinal + enviar_portfolio -> aguardando_sinal', () => {
  assert.equal(getNextState('aguardando_sinal', { proxima_acao: 'enviar_portfolio' }), 'aguardando_sinal');
});
```

⚠️ Verificar import de `getNextState` no top — adicionar se faltar.

- [ ] **Step 3: Rodar — confirmar fail**

```bash
node --test tests/agent/router.test.mjs
```

Expected: 5 FAIL — `getNextState` retorna `estado_atual` por default só quando `map[proxima_acao]` é falsy; entry inexistente já cai no fallback `|| estado_atual`. **MUITO PROVÁVEL: tests passam sem mudar router.js** porque o fallback já cobre. Mesmo assim, adicionar entries explícitas torna o contrato visível.

- [ ] **Step 4: Editar `router.js` — adicionar 5 entries explícitas**

Modify `functions/api/agent/router.js` linhas 19-42:

```javascript
const NEXT_STATE = {
  tattoo:   { handoff: 'cadastro',            erro: 'tattoo',            enviar_portfolio: 'tattoo' },
  cadastro: { handoff: 'aguardando_tatuador', erro: 'aguardando_tatuador', enviar_portfolio: 'cadastro' },
  propondo_valor: {
    pergunta:           'propondo_valor',
    oferecendo_horario: 'escolhendo_horario',
    pediu_desconto:     'aguardando_decisao_desconto',
    adiou:              'lead_frio',
    reagendamento:      'aguardando_tatuador',
    cliente_agressivo:  'aguardando_tatuador',
    enviar_portfolio:   'propondo_valor',
  },
  escolhendo_horario: {
    pergunta:          'escolhendo_horario',
    reservar_horario:  'aguardando_sinal',
    reagendamento:     'aguardando_tatuador',
    cliente_agressivo: 'aguardando_tatuador',
    enviar_portfolio:  'escolhendo_horario',
  },
  aguardando_sinal: {
    pergunta:          'aguardando_sinal',
    reservar_horario:  'aguardando_sinal',
    reagendamento:     'aguardando_tatuador',
    cliente_agressivo: 'aguardando_tatuador',
    enviar_portfolio:  'aguardando_sinal',
  },
};
```

- [ ] **Step 5: Rodar — confirmar pass**

```bash
node --test tests/agent/router.test.mjs
npm test
```

Expected: 5 PASS + suite verde.

- [ ] **Step 6: Commit**

```bash
git add functions/api/agent/router.js tests/agent/router.test.mjs
git commit -m "feat(sub3-3): router NEXT_STATE entries enviar_portfolio (5 estados)"
```

---

## Task 7: Tattoo prompts — contexto + decisao

Adicionar `portfolio_disponivel` no contexto e bloco regra portfolio em `decisao.js`. Sem snapshot test rodando per-prompt no Sub-3.3 (Sub-3.2 já consolidou — verificar `tests/prompts/snapshots/` se houver).

**Files:**
- Modify: `functions/_lib/prompts/coleta/tattoo/contexto.js`
- Modify: `functions/_lib/prompts/coleta/tattoo/decisao.js`

- [ ] **Step 1: Adicionar `portfolio_disponivel` em `contexto.js`**

Modify `functions/_lib/prompts/coleta/tattoo/contexto.js` — após o bloco "Estudio" e antes do bloco "Cliente" (~linha 19), adicionar 1 linha mostrando o flag:

```javascript
linhas.push(`- portfolio: ${ctx.portfolio_disponivel ? 'disponivel' : 'nao cadastrado'}`);
```

Posicionamento exato: após `linhas.push(`- ${aceitaCobertura ? 'ACEITA' : 'NAO ACEITA'} cobertura (cover-up)`);` (linha 18) e antes do `linhas.push('');` (linha 19).

Resultado esperado:

```
## Estudio
- Gatilhos handoff: ...
- ACEITA cobertura (cover-up)
- portfolio: disponivel    <-- ou "nao cadastrado"

## Cliente
...
```

- [ ] **Step 2: Adicionar bloco regra portfolio em `decisao.js`**

Modify `functions/_lib/prompts/coleta/tattoo/decisao.js` — adicionar uma seção `## §4.5 Cliente pediu portfolio` no fim do template literal (após `## §4.4 Mensagem-ponte`, antes do backtick de fechamento):

```javascript
## §4.5 Cliente pediu portfolio / trabalhos / fotos / instagram

Se cliente pedir pra ver trabalhos / portfolio / exemplos / fotos / instagram / referencias do tatuador:

1. **Se contexto "portfolio: disponivel"**:
   - Defina \`proxima_acao='enviar_portfolio'\`
   - \`payload_portfolio.estilo\`:
     * Se cliente mencionou estilo na mensagem atual ("queria ver fineline") -> use esse estilo.
     * Se cliente nao mencionou MAS \`dados_persistidos.estilo\` ou \`dados_coletados.estilo\` ja foi coletado E tem relacao com a mensagem ("mais trabalhos parecidos") -> use o estilo coletado.
     * Caso contrario -> deixe \`null\` (tool retorna mix do portfolio).
   - \`payload_portfolio.max\`: deixe \`null\` (default 5 da tool).
   - \`payload_portfolio.motivo\`: free-form curto pra log/debug.
   - \`resposta_cliente\`: prosa curta e natural ("Show, te mando alguns trabalhos!" ou "Beleza, te mando uns exemplos de fineline!"). NAO prometa quantidade exata. NAO emita URL na resposta — sistema envia URLs separadas.
   - **Apos enviar, siga o fluxo normal da fase no proximo turno** (continue coletando OBR).

2. **Se contexto "portfolio: nao cadastrado"**:
   - Defina \`proxima_acao='pergunta'\` (NAO 'enviar_portfolio')
   - \`payload_portfolio: null\`
   - \`resposta_cliente\`: explique gentilmente que ainda nao temos portfolio cadastrado, e siga o fluxo da fase. Ex: "Ainda estamos montando o portfolio aqui no chat — mas posso seguir com [<o que faria normalmente>]?"
```

⚠️ **Lembrar:** decisao.js retorna template literal. Os backticks internos (\`) precisam ser escapados se aparecerem em strings com interpolação. Ver linhas 81-84 do arquivo atual para padrão.

- [ ] **Step 3: Smoke do prompt gerado — validar não-quebra**

```bash
node -e "
import('./functions/_lib/prompts/coleta/tattoo/generate.js').then(m => {
  const tenant = { config_agente: {}, gatilhos_handoff: [], faqs: [], fewshots: [] };
  const conversa = { dados_coletados: {} };
  const ctx = { portfolio_disponivel: true };
  const p = m.generatePromptColetaTattoo(tenant, conversa, ctx);
  console.log('--- LEN:', p.length);
  console.log('--- HAS portfolio: disponivel:', p.includes('portfolio: disponivel'));
  console.log('--- HAS §4.5:', p.includes('§4.5'));
});
"
```

Expected: log com `LEN: ~3000`, ambos booleanos `true`.

- [ ] **Step 4: Rodar suite**

```bash
npm test
```

Expected: PASS. Se houver snapshot test que pegou o prompt do tattoo (procurar `tests/prompts/snapshots/coleta-tattoo*`), regenerar — Task 12 trata regression eval.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/prompts/coleta/tattoo/contexto.js functions/_lib/prompts/coleta/tattoo/decisao.js
git commit -m "feat(sub3-3): tattoo prompt — portfolio_disponivel no contexto + §4.5 decisao"
```

---

## Task 8: Cadastro prompts — contexto + decisao

Mesma mecânica do Task 7 aplicada ao cadastro.

**Files:**
- Modify: `functions/_lib/prompts/coleta/cadastro/contexto.js`
- Modify: `functions/_lib/prompts/coleta/cadastro/decisao.js`

- [ ] **Step 1: Adicionar `portfolio_disponivel` em `contexto.js`**

Modify `functions/_lib/prompts/coleta/cadastro/contexto.js` — adicionar linha no bloco "Cliente" (após "ja conversou antes"), antes do `linhas.push('');` da linha 23:

```javascript
linhas.push(`- portfolio: ${ctx.portfolio_disponivel ? 'disponivel' : 'nao cadastrado'}`);
```

- [ ] **Step 2: Adicionar bloco `## §4.5` em `decisao.js`**

Modify `functions/_lib/prompts/coleta/cadastro/decisao.js` — adicionar após `## §4.4 Mensagem de encerramento`, antes do backtick de fechamento:

```
## §4.5 Cliente pediu portfolio / trabalhos / fotos / instagram

Se cliente pedir pra ver trabalhos / portfolio / exemplos / fotos / instagram / referencias do tatuador:

1. **Se contexto "portfolio: disponivel"**:
   - Defina \`proxima_acao='enviar_portfolio'\`
   - \`payload_portfolio.estilo\`: se cliente mencionou estilo, use; se ja existe estilo no contexto da fase Tattoo, use; senao \`null\`.
   - \`payload_portfolio.max\`: \`null\` (default 5 da tool).
   - \`payload_portfolio.motivo\`: free-form curto.
   - \`resposta_cliente\`: prosa curta natural ("show, te mando alguns!"). NAO emita URL — sistema envia URLs separadas. Apos enviar, retoma cadastro no proximo turno.

2. **Se contexto "portfolio: nao cadastrado"**:
   - Defina \`proxima_acao='pergunta'\`
   - \`payload_portfolio: null\`
   - \`resposta_cliente\`: explique gentilmente ("ainda estamos montando o portfolio — mas pra liberar teu orcamento, me passa nome e data de nascimento") e retoma fluxo cadastro.
```

- [ ] **Step 3: Smoke do prompt**

```bash
node -e "
import('./functions/_lib/prompts/coleta/cadastro/generate.js').then(m => {
  const tenant = { config_agente: {}, faqs: [], fewshots: [] };
  const conversa = { dados_coletados: { descricao_curta: 'rosa', tamanho_cm: 8, local_corpo: 'antebraco' }, dados_cadastro: {} };
  const ctx = { portfolio_disponivel: false };
  const p = m.generatePromptColetaCadastro(tenant, conversa, ctx);
  console.log('--- HAS portfolio: nao cadastrado:', p.includes('portfolio: nao cadastrado'));
  console.log('--- HAS §4.5:', p.includes('§4.5'));
});
"
```

Expected: ambos `true`.

- [ ] **Step 4: Rodar suite**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/prompts/coleta/cadastro/contexto.js functions/_lib/prompts/coleta/cadastro/decisao.js
git commit -m "feat(sub3-3): cadastro prompt — portfolio_disponivel no contexto + §4.5 decisao"
```

---

## Task 9: Proposta prompts — contexto + decisao

Mesma mecânica nos 3 sub-estados (mesma decisao.js + contexto.js).

**Files:**
- Modify: `functions/_lib/prompts/coleta/proposta/contexto.js`
- Modify: `functions/_lib/prompts/coleta/proposta/decisao.js`

- [ ] **Step 1: Adicionar `portfolio_disponivel` em `contexto.js`**

Modify `functions/_lib/prompts/coleta/proposta/contexto.js` — após linha 12 (`const sinal_pct = ...`), e antes do bloco `let blocoEstado`, adicionar variável + linha no template:

```javascript
const portfolio_status = ctx?.portfolio_disponivel ? 'disponivel' : 'nao cadastrado';
```

E no template literal (após `Sinal percentual configurado: ${sinal_pct}%`), adicionar:

```
Portfolio: ${portfolio_status}
```

Resultado:

```
# §1 CONTEXTO

Cliente: ${cliente_nome}
Estado atual: ${estado_atual}
Valor proposto: R$ ${valor_proposto}
Decisao desconto previa: ${decisao_desconto}
Sinal percentual configurado: ${sinal_pct}%
Portfolio: ${portfolio_status}

${blocoEstado}
```

- [ ] **Step 2: Adicionar bloco `## §4.4` em `decisao.js`**

Modify `functions/_lib/prompts/coleta/proposta/decisao.js` — adicionar após `## §4.3 Closing`, antes do backtick de fechamento. Spec não tem §4.4 hoje (decisao Proposta é mais slim). Numerar como `## §4.4`:

```
## §4.4 Cliente pediu portfolio / trabalhos / fotos / instagram

Linha extra da tabela (transversal aos 3 sub-estados):

| # | Estado | Sinal cliente | proxima_acao | Payload obrigatorio | Tom |
|---|---|---|---|---|---|
| 13 | qualquer | "manda fotos / portfolio / trabalhos / exemplos / instagram / referencias" | enviar_portfolio | payload_portfolio | "Claro, te mando!" |

Regra:

1. **Se contexto "Portfolio: disponivel"**:
   - \`proxima_acao='enviar_portfolio'\`
   - \`payload_portfolio.estilo\`: use estilo mencionado pelo cliente ou ja coletado em fase Tattoo; senao \`null\`.
   - \`payload_portfolio.max=null\` (default 5).
   - \`payload_portfolio.motivo\`: free-form curto.
   - \`resposta_cliente\`: prosa curta natural ("Claro, te mando uns exemplos!"), ≤200 chars. NAO emita URL — sistema envia URLs separadas. Apos enviar, retoma fluxo da fase no proximo turno.

2. **Se contexto "Portfolio: nao cadastrado"**:
   - \`proxima_acao='pergunta'\` (NAO 'enviar_portfolio')
   - \`payload_portfolio=null\`
   - \`resposta_cliente\`: explique gentilmente ("ainda estamos montando o portfolio aqui no chat — mas [<retoma fluxo>]") e siga.
```

- [ ] **Step 3: Smoke do prompt**

```bash
node -e "
import('./functions/_lib/prompts/coleta/proposta/generate.js').then(m => {
  const tenant = { config_agente: {}, config_precificacao: { sinal_percentual: 30 }, faqs: [], fewshots: [], fewshots_por_modo: {} };
  const conversa = { estado_agente: 'propondo_valor', valor_proposto: 750, dados_cadastro: { nome: 'Joao' } };
  const ctx = { portfolio_disponivel: true, valor_proposto: 750, horarios_livres: [] };
  const p = m.generatePromptColetaProposta(tenant, conversa, ctx);
  console.log('--- HAS Portfolio: disponivel:', p.includes('Portfolio: disponivel'));
  console.log('--- HAS §4.4:', p.includes('§4.4'));
});
"
```

Expected: ambos `true`.

- [ ] **Step 4: Rodar suite**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/prompts/coleta/proposta/contexto.js functions/_lib/prompts/coleta/proposta/decisao.js
git commit -m "feat(sub3-3): proposta prompt — Portfolio no contexto + §4.4 decisao"
```

---

## Task 10: route.js — prefetchPortfolio + branch transversal + urls_portfolio

Plug do helper + branch case `enviar_portfolio` que roda PARA QUALQUER agent (transversal). Response final ganha `urls_portfolio: string[]`.

**Files:**
- Modify: `functions/api/agent/route.js`
- Test: `tests/agent/route-portfolio-orchestrator.test.mjs` (novo)

- [ ] **Step 1: Escrever 5 testes failing pro branch portfolio**

Create `tests/agent/route-portfolio-orchestrator.test.mjs`:

```javascript
// tests/agent/route-portfolio-orchestrator.test.mjs
// Unit do branch transversal enviar_portfolio em route.js.
// Eval real (Task 12) cobre happy path; este arquivo fecha branches !ok.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { executePortfolioIntent } from '../../functions/api/agent/route.js';

const baseEnv = { INKFLOW_TOOL_SECRET: 'sek', AGENT_INTERNAL_BASE_URL: 'http://localhost:8788' };
const baseTenant = { id: 't1' };

test('executePortfolioIntent: happy path -> urls populadas', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async (url) => {
    assert.match(url, /\/api\/tools\/enviar-portfolio$/);
    return { ok: true, status: 200, json: async () => ({ ok: true, urls: ['https://a.jpg', 'https://b.jpg'], total: 2 }) };
  });

  const r = await executePortfolioIntent(
    { resposta_cliente: 'show!', proxima_acao: 'enviar_portfolio', payload_portfolio: { estilo: 'fineline', max: null, motivo: 'pediu fineline' } },
    { env: baseEnv, tenant: baseTenant }
  );

  assert.deepEqual(r.urls_portfolio, ['https://a.jpg', 'https://b.jpg']);
});

test('executePortfolioIntent: tool !ok -> urls_portfolio vazio (degrade graceful)', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async () => ({ ok: false, status: 500, json: async () => ({ ok: false, error: 'db-error' }) }));

  const r = await executePortfolioIntent(
    { resposta_cliente: 'show!', proxima_acao: 'enviar_portfolio', payload_portfolio: { estilo: null, max: null, motivo: null } },
    { env: baseEnv, tenant: baseTenant }
  );

  assert.deepEqual(r.urls_portfolio, []);
});

test('executePortfolioIntent: portfolio_vazio (urls=[]) -> urls_portfolio vazio', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, urls: [], motivo: 'portfolio_vazio' }) }));

  const r = await executePortfolioIntent(
    { resposta_cliente: 'show!', proxima_acao: 'enviar_portfolio', payload_portfolio: { estilo: null, max: null, motivo: null } },
    { env: baseEnv, tenant: baseTenant }
  );

  assert.deepEqual(r.urls_portfolio, []);
});

test('executePortfolioIntent: usa estilo do payload_portfolio + max default 5', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  let capturedBody = null;
  globalThis.fetch = mock.fn(async (_url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ ok: true, urls: ['x'], total: 1 }) };
  });

  await executePortfolioIntent(
    { resposta_cliente: 'show!', proxima_acao: 'enviar_portfolio', payload_portfolio: { estilo: 'blackwork', max: null, motivo: null } },
    { env: baseEnv, tenant: baseTenant }
  );

  assert.equal(capturedBody.tenant_id, 't1');
  assert.equal(capturedBody.estilo, 'blackwork');
  assert.equal(capturedBody.max, 5);
});

test('executePortfolioIntent: proxima_acao != enviar_portfolio -> urls_portfolio=[]', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const fetchMock = mock.fn();
  globalThis.fetch = fetchMock;

  const r = await executePortfolioIntent(
    { resposta_cliente: 'show!', proxima_acao: 'pergunta', payload_portfolio: null },
    { env: baseEnv, tenant: baseTenant }
  );

  assert.deepEqual(r.urls_portfolio, []);
  assert.equal(fetchMock.mock.callCount(), 0);
});
```

- [ ] **Step 2: Rodar — confirmar fail (helper não existe)**

```bash
node --test tests/agent/route-portfolio-orchestrator.test.mjs
```

Expected: `executePortfolioIntent is not a function` — FAIL.

- [ ] **Step 3: Editar `route.js` — exportar helper + plugar prefetch + integrar na response**

Modify `functions/api/agent/route.js`:

**3a) Imports (linhas 11-19):** adicionar `prefetchPortfolio`:

```javascript
import { prefetchPortfolio } from './_lib/prefetch-portfolio.js';
```

**3b) Plugar prefetch (linhas ~99-107):** adicionar antes do bloco proposta-only:

```javascript
const PROPOSTA_SUBSTATES = new Set(['propondo_valor', 'escolhendo_horario', 'aguardando_sinal']);
let clientContext = body?.clientContext || {};

// Sub-3.3: pre-fetch portfolio_disponivel para QUALQUER agent (transversal)
const portfolioCtx = await prefetchPortfolio(env, tenant);
clientContext = { ...clientContext, ...portfolioCtx };

if (PROPOSTA_SUBSTATES.has(estado_atual)) {
  const prefetched = await prefetchPropostaContext({
    env, tenant, conversa, telefone, estado_atual,
  });
  clientContext = { ...clientContext, ...prefetched };
}
```

**3c) Adicionar export `executePortfolioIntent` (final do arquivo, ao lado de `executeOrchestration`):**

```javascript
// Sub-3.3: branch transversal enviar_portfolio.
// Roda independente do estado_atual — qualquer agent (tattoo/cadastro/proposta)
// pode emitir essa intent. Tool enviar-portfolio retorna URLs; route.js
// devolve em urls_portfolio na response. Estado nao muda.
//
// Args: (out, { env, tenant })
// Return: { urls_portfolio: string[] }
export async function executePortfolioIntent(out, { env, tenant }) {
  if (out?.proxima_acao !== 'enviar_portfolio') {
    return { urls_portfolio: [] };
  }
  const payload = out.payload_portfolio || {};
  const r = await callTool(env, 'enviar-portfolio', {
    tenant_id: tenant.id,
    estilo: payload.estilo ?? null,
    max: payload.max ?? 5,
  });
  // call-tool retorna { ok, status, ...data } — body da tool spread direto.
  // Tool retorna { ok: true, urls: [...] } ou { ok: false, error }.
  if (!r.ok || !Array.isArray(r.urls)) {
    return { urls_portfolio: [] };
  }
  return { urls_portfolio: r.urls };
}
```

**3d) Integrar branch na response (linhas ~178-197):** rodar `executePortfolioIntent` antes/depois de `executeOrchestration` proposta. Como `enviar_portfolio` é transversal, roda SEMPRE — se intent não match, retorna `{ urls_portfolio: [] }`.

Substituir bloco existente:

```javascript
// Sub-3.2: orquestrator side-effects pra Proposta
const sideEffects = [];
let finalOut = enforced;
if (PROPOSTA_SUBSTATES.has(estado_atual)) {
  finalOut = await executeOrchestration(enforced, {
    env, tenant, conversa, telefone, sideEffects,
  });
}

// Sub-3.3: branch transversal portfolio (qualquer agent pode emitir)
const { urls_portfolio } = await executePortfolioIntent(finalOut, { env, tenant });

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
  urls_portfolio,
}, 200);
```

- [ ] **Step 4: Rodar tests novos — confirmar pass**

```bash
node --test tests/agent/route-portfolio-orchestrator.test.mjs
```

Expected: 5 PASS.

- [ ] **Step 5: Rodar suite completa — confirmar zero regression**

```bash
npm test
```

Expected: TODOS PASS, incluindo Sub-3.2 route-orchestrator + tests/agent/route.test.mjs.

- [ ] **Step 6: Commit**

```bash
git add functions/api/agent/route.js tests/agent/route-portfolio-orchestrator.test.mjs
git commit -m "feat(sub3-3): route.js prefetch portfolio + branch transversal enviar_portfolio"
```

---

## Task 11: Eval suite — fixture + harness 9 cenários

**Files:**
- Create: `tests/agent/_fixtures/scenarios-portfolio.json`
- Create: `tests/agent/portfolio-intent.eval.mjs`

- [ ] **Step 1: Criar fixture com 9 cenários**

Create `tests/agent/_fixtures/scenarios-portfolio.json`:

```json
[
  {
    "id": "TC-PORT-01",
    "descricao": "tattoo: cliente pede trabalhos vazio + portfolio_disponivel=true -> enviar_portfolio sem estilo",
    "estado_atual": "tattoo",
    "agent": "tattoo",
    "portfolio_disponivel": true,
    "dados_acumulados": {},
    "historico": [],
    "mensagem": "tem como mandar uns trabalhos seus?",
    "assertions": [
      { "type": "proxima_acao_equals", "value": "enviar_portfolio" },
      { "type": "payload_portfolio_estilo_null": true }
    ]
  },
  {
    "id": "TC-PORT-02",
    "descricao": "tattoo: cliente menciona estilo -> enviar_portfolio com estilo='fineline'",
    "estado_atual": "tattoo",
    "agent": "tattoo",
    "portfolio_disponivel": true,
    "dados_acumulados": { "descricao_curta": "rosa" },
    "historico": [],
    "mensagem": "queria ver fineline",
    "assertions": [
      { "type": "proxima_acao_equals", "value": "enviar_portfolio" },
      { "type": "payload_portfolio_estilo_equals", "value": "fineline" }
    ]
  },
  {
    "id": "TC-PORT-03",
    "descricao": "tattoo: cliente pede fotos + portfolio_disponivel=false -> pergunta",
    "estado_atual": "tattoo",
    "agent": "tattoo",
    "portfolio_disponivel": false,
    "dados_acumulados": {},
    "historico": [],
    "mensagem": "manda fotos pra eu ver",
    "assertions": [
      { "type": "proxima_acao_equals", "value": "pergunta" },
      { "type": "resposta_cliente_matches", "value": "(portfolio|cadastrado|montando)" }
    ]
  },
  {
    "id": "TC-PORT-04",
    "descricao": "cadastro: cliente pede trabalhos antes de cadastrar -> enviar_portfolio",
    "estado_atual": "cadastro",
    "agent": "cadastro",
    "portfolio_disponivel": true,
    "dados_acumulados": { "descricao_curta": "rosa", "tamanho_cm": 8, "local_corpo": "antebraco" },
    "historico": [
      { "role": "assistant", "content": "Pra liberar teu orcamento, me passa nome completo e data de nascimento." }
    ],
    "mensagem": "antes me mostra trabalhos",
    "assertions": [
      { "type": "proxima_acao_equals", "value": "enviar_portfolio" }
    ]
  },
  {
    "id": "TC-PORT-05",
    "descricao": "cadastro: cliente pergunta de instagram -> enviar_portfolio",
    "estado_atual": "cadastro",
    "agent": "cadastro",
    "portfolio_disponivel": true,
    "dados_acumulados": { "descricao_curta": "rosa", "tamanho_cm": 8, "local_corpo": "antebraco" },
    "historico": [
      { "role": "assistant", "content": "Pra liberar teu orcamento, me passa nome completo e data de nascimento." }
    ],
    "mensagem": "tem instagram?",
    "assertions": [
      { "type": "proxima_acao_equals", "value": "enviar_portfolio" }
    ]
  },
  {
    "id": "TC-PORT-06",
    "descricao": "cadastro: cliente pede fotos + portfolio_disponivel=false -> pergunta",
    "estado_atual": "cadastro",
    "agent": "cadastro",
    "portfolio_disponivel": false,
    "dados_acumulados": {},
    "historico": [],
    "mensagem": "manda fotos",
    "assertions": [
      { "type": "proxima_acao_equals", "value": "pergunta" },
      { "type": "resposta_cliente_matches", "value": "(portfolio|cadastrado|montando)" }
    ]
  },
  {
    "id": "TC-PORT-07",
    "descricao": "proposta propondo_valor: cliente pede mais um trabalho -> enviar_portfolio",
    "estado_atual": "propondo_valor",
    "agent": "proposta",
    "portfolio_disponivel": true,
    "valor_proposto": 750,
    "horarios_livres": [],
    "historico": [
      { "role": "assistant", "content": "Show! Pelo trabalho ficou em R$ 750. Bora marcar?" }
    ],
    "mensagem": "antes me mostra mais um trabalho",
    "assertions": [
      { "type": "proxima_acao_equals", "value": "enviar_portfolio" }
    ]
  },
  {
    "id": "TC-PORT-08",
    "descricao": "proposta escolhendo_horario: cliente pede ver mais blackwork antes -> enviar_portfolio com estilo",
    "estado_atual": "escolhendo_horario",
    "agent": "proposta",
    "portfolio_disponivel": true,
    "valor_proposto": 750,
    "horarios_livres": [
      { "inicio": "2026-05-12T17:00:00Z", "fim": "2026-05-12T20:00:00Z", "legenda": "ter 12/05 14h-17h" }
    ],
    "historico": [
      { "role": "assistant", "content": "Tenho ter 12/05 14h-17h. Bora?" }
    ],
    "mensagem": "queria ver mais blackwork antes",
    "assertions": [
      { "type": "proxima_acao_equals", "value": "enviar_portfolio" },
      { "type": "payload_portfolio_estilo_equals", "value": "blackwork" }
    ]
  },
  {
    "id": "TC-PORT-09",
    "descricao": "proposta aguardando_sinal: cliente pede mais um exemplo -> enviar_portfolio",
    "estado_atual": "aguardando_sinal",
    "agent": "proposta",
    "portfolio_disponivel": true,
    "valor_proposto": 750,
    "proposta_status": "aguardando_pgto",
    "historico": [
      { "role": "assistant", "content": "Te mandei o link do sinal. Confirma quando puder!" }
    ],
    "mensagem": "manda mais um exemplo",
    "assertions": [
      { "type": "proxima_acao_equals", "value": "enviar_portfolio" }
    ]
  }
]
```

- [ ] **Step 2: Criar harness eval**

Create `tests/agent/portfolio-intent.eval.mjs`:

```javascript
// tests/agent/portfolio-intent.eval.mjs
// Eval suite intent transversal enviar_portfolio — 9 cenarios contra gpt-4o-mini real.
// Cobre 3 agents (tattoo/cadastro/proposta) x 3 caminhos (com estilo / sem estilo / portfolio vazio).
// NAO roda em CI (filename *.eval.mjs fora do glob *.test.mjs).
//
// Run: OPENAI_API_KEY=sk-... node --test tests/agent/portfolio-intent.eval.mjs
// Custo estimado: ~$0.005 por suite completa (gpt-4o-mini, 9 turns ~1.5k tokens cada).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { run } from '@openai/agents';
import { setDefaultOpenAIKey } from '@openai/agents-openai';
import { buildTattooAgent } from '../../functions/api/agent/agents/tattoo.js';
import { buildCadastroAgent } from '../../functions/api/agent/agents/cadastro.js';
import { buildPropostaAgent } from '../../functions/api/agent/agents/proposta.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '_fixtures', 'scenarios-portfolio.json');
const scenarios = JSON.parse(readFileSync(FIXTURES_PATH, 'utf-8'));

if (!process.env.OPENAI_API_KEY) {
  test('portfolio-intent eval skipped (no OPENAI_API_KEY)', { skip: true }, () => {});
} else {
  setDefaultOpenAIKey(process.env.OPENAI_API_KEY);

  function normalizeHistoryItem(h) {
    const role = h?.role || 'user';
    const content = h?.content ?? '';
    if (role === 'assistant') {
      return { role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: String(content) }] };
    }
    return { role: 'user', content: String(content) };
  }

  const BUILDERS = {
    tattoo: buildTattooAgent,
    cadastro: buildCadastroAgent,
    proposta: buildPropostaAgent,
  };

  for (const sc of scenarios) {
    test(`${sc.id} — ${sc.descricao}`, async () => {
      const tenant = {
        id: 't-eval',
        nome_estudio: 'Estudio Eval',
        nome_agente: 'Atendente',
        config_precificacao: { sinal_percentual: 30 },
        config_agente: {},
        gatilhos_handoff: [],
        faqs: [],
        fewshots: [],
        fewshots_por_modo: {},
        // Stub portfolio_urls — helper deriva boolean do tamanho.
        // portfolio_disponivel vai pro clientContext separadamente.
        portfolio_urls: sc.portfolio_disponivel ? ['https://e.com/blackwork-1.jpg', 'https://e.com/fineline-1.jpg', 'https://e.com/fineline-2.jpg'] : [],
      };

      const conversa = {
        id: `conv-${sc.id}`,
        telefone: '5511999000099',
        estado_agente: sc.estado_atual,
        dados_cadastro: { nome: 'Cliente Eval' },
        dados_coletados: sc.dados_acumulados || {},
        valor_proposto: sc.valor_proposto || null,
      };

      const clientContext = {
        portfolio_disponivel: sc.portfolio_disponivel,
        // pra proposta:
        valor_proposto: sc.valor_proposto || null,
        decisao_desconto: null,
        horarios_livres: sc.horarios_livres || [],
        proposta_status: sc.proposta_status || null,
      };

      const builder = BUILDERS[sc.agent];
      const builderArgs = { env: {}, tenant, conversa, clientContext };
      if (sc.agent === 'proposta') builderArgs.estado_atual = sc.estado_atual;
      const { agent, validator } = builder(builderArgs);

      const messages = [
        ...(sc.historico || []).map(normalizeHistoryItem),
        { role: 'user', content: sc.mensagem },
      ];

      const result = await run(agent, messages, { maxTurns: 5 });
      const out = result.finalOutput;

      assert.ok(out, `${sc.id}: agent retornou null/undefined`);

      const inv = validator(out);
      assert.equal(inv.valid, true, `${sc.id}: invariant violation: ${inv.reason || ''}`);

      for (const a of sc.assertions) {
        if (a.type === 'proxima_acao_equals') {
          assert.equal(out.proxima_acao, a.value, `${sc.id}/proxima_acao: esperado=${a.value} got=${out.proxima_acao}`);
        } else if (a.type === 'payload_portfolio_estilo_equals') {
          assert.equal(out.payload_portfolio?.estilo?.toLowerCase(), a.value.toLowerCase(), `${sc.id}/estilo: esperado=${a.value} got=${out.payload_portfolio?.estilo}`);
        } else if (a.type === 'payload_portfolio_estilo_null') {
          assert.equal(out.payload_portfolio?.estilo ?? null, null, `${sc.id}/estilo deveria ser null, got=${out.payload_portfolio?.estilo}`);
        } else if (a.type === 'resposta_cliente_matches') {
          assert.match(out.resposta_cliente, new RegExp(a.value, 'i'), `${sc.id}/regex: pattern=${a.value} resposta="${out.resposta_cliente}"`);
        }
      }
    });
  }
}
```

- [ ] **Step 3: Adicionar script no `package.json`**

Modify `package.json`:

```json
"scripts": {
  "test": "node --test tests/**/*.test.mjs",
  "eval:tattoo": "node --test tests/agent/tattoo-agent.eval.mjs",
  "eval:cadastro": "node --test tests/agent/cadastro-agent.eval.mjs",
  "eval:proposta": "node --test tests/agent/proposta-agent.eval.mjs",
  "eval:portfolio": "node --test tests/agent/portfolio-intent.eval.mjs"
}
```

- [ ] **Step 4: Smoke do harness sem OPENAI_API_KEY**

```bash
node --test tests/agent/portfolio-intent.eval.mjs
```

Expected: `1 ok, 1 skipped` (skip "no OPENAI_API_KEY"). Se erro de import/sintaxe, corrigir antes de queimar token.

- [ ] **Step 5: Commit**

```bash
git add tests/agent/_fixtures/scenarios-portfolio.json tests/agent/portfolio-intent.eval.mjs package.json
git commit -m "test(sub3-3): eval suite portfolio-intent (9 cenarios) + npm script"
```

---

## Task 12: Eval gate + regression check

Rodar eval suite real contra `gpt-4o-mini`. Custo ~$0.005. Garantir Sub-2 + Sub-3.1 + Sub-3.2 ainda verde após mudanças no schema cross-agent.

**Files:** (sem mudanças — só rodar)

- [ ] **Step 1: Confirmar `OPENAI_API_KEY` carregado**

```bash
test -f /Users/brazilianhustler/Documents/inkflow-saas/.env.local && grep -c OPENAI /Users/brazilianhustler/Documents/inkflow-saas/.env.local
```

Expected: `≥1`. Se ausente, exportar com `export OPENAI_API_KEY=$(grep OPENAI .dev.vars | cut -d= -f2)` ou pegar do `.env.local`.

- [ ] **Step 2: Rodar eval portfolio (gate principal)**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
OPENAI_API_KEY=$(grep OPENAI_API_KEY .dev.vars | cut -d= -f2) npm run eval:portfolio
```

Expected: `9 pass, 0 fail`. Custo ~$0.005.

Se algum `proxima_acao_equals` falhar:
- TC-PORT-01/04/07/09 (sem estilo) — provavelmente prompt §4.5 não foi explícito. Voltar Task 7/8/9 e ajustar wording.
- TC-PORT-02/08 (com estilo) — agent não capturou estilo do cliente. Adicionar exemplo no prompt.
- TC-PORT-03/06 (portfolio=false) — agent emitiu intent mesmo sem portfolio. Reforçar regra "se portfolio: nao cadastrado -> proxima_acao='pergunta'".

- [ ] **Step 3: Regression check Sub-2 (tattoo)**

```bash
OPENAI_API_KEY=$(grep OPENAI_API_KEY .dev.vars | cut -d= -f2) npm run eval:tattoo
```

Expected: 10/10 pass (baseline Sub-2). Se regredir, schema/closure mudança quebrou — diff `agents/tattoo.js` vs último commit do Sub-2.

- [ ] **Step 4: Regression check Sub-3.1 (cadastro)**

```bash
OPENAI_API_KEY=$(grep OPENAI_API_KEY .dev.vars | cut -d= -f2) npm run eval:cadastro
```

Expected: 9/9 pass.

- [ ] **Step 5: Regression check Sub-3.2 (proposta)**

```bash
OPENAI_API_KEY=$(grep OPENAI_API_KEY .dev.vars | cut -d= -f2) npm run eval:proposta
```

Expected: 10/11 pass (baseline conhecido) ou melhor.

- [ ] **Step 6: Suite unit completa**

```bash
npm test
```

Expected: TODOS PASS.

- [ ] **Step 7: Commit (só se houve fix de prompt durante a iteração)**

Se nenhum fix foi necessário, sem commit. Se houve ajustes em prompts/schemas pra passar evals:

```bash
git add functions/_lib/prompts/coleta/*/decisao.js functions/api/agent/agents/*.js
git commit -m "fix(sub3-3): ajustes prompt/schema apos eval gate (9/9)"
```

---

## Task 13: Smoke local + DoD + PR

**Files:**
- Run: `wrangler pages dev`
- Run: curl 9 cenários
- Skill: `/dod`

- [ ] **Step 1: Confirmar `.dev.vars` tem `INKFLOW_TOOL_SECRET` e `OPENAI_API_KEY`**

```bash
grep -c "INKFLOW_TOOL_SECRET\|OPENAI_API_KEY" /Users/brazilianhustler/Documents/inkflow-saas/.dev.vars
```

Expected: `≥2`.

- [ ] **Step 2: Subir `wrangler pages dev` em background**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
npx wrangler pages dev --port 8788 . > /tmp/wrangler-sub33.log 2>&1 &
echo $! > /tmp/wrangler-sub33.pid
sleep 8
curl -s http://localhost:8788/api/agent/route -X OPTIONS -i | head -1
```

Expected: `HTTP/1.1 204 No Content`.

- [ ] **Step 3: Smoke TC-PORT-01 (tattoo + portfolio_disponivel=true sem estilo)**

```bash
curl -s -X POST http://localhost:8788/api/agent/route \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "telefone": "+5511900000099",
    "mensagem": "tem como mandar uns trabalhos seus?",
    "estado_atual": "tattoo",
    "dados_acumulados": {},
    "historico": [],
    "tenant": { "id": "00000000-0000-0000-0000-000000000001", "nome_estudio": "Smoke", "config_agente": {}, "gatilhos_handoff": [], "faqs": [], "fewshots": [], "portfolio_urls": ["https://e.com/blackwork-1.jpg", "https://e.com/fineline-1.jpg"] },
    "conversa": { "id": "smoke-1", "telefone": "+5511900000099", "estado_agente": "tattoo", "dados_coletados": {}, "dados_cadastro": {} }
  }' | jq '{proxima_acao, urls_portfolio, agent_usado, estado_novo}'
```

Expected: `proxima_acao: "enviar_portfolio"`, `urls_portfolio: ["https://e.com/blackwork-1.jpg", ...]` (até 5), `agent_usado: "tattoo"`, `estado_novo: "tattoo"`.

⚠️ **Limitação smoke local:** tool `enviar-portfolio` faz `supaFetch` ao tenant real. Pra validar o branch sem queimar Supabase, ou mockar o tenant (criar `00000000-0000-0000-0000-000000000001` com `portfolio_urls` em DB de dev) ou rodar smoke contra ambiente de staging com tenant válido.

- [ ] **Step 4: Smoke TC-PORT-03 (portfolio=false → pergunta)**

```bash
curl -s -X POST http://localhost:8788/api/agent/route \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "telefone": "+5511900000099",
    "mensagem": "manda fotos pra eu ver",
    "estado_atual": "tattoo",
    "dados_acumulados": {},
    "historico": [],
    "tenant": { "id": "00000000-0000-0000-0000-000000000001", "nome_estudio": "Smoke", "config_agente": {}, "gatilhos_handoff": [], "faqs": [], "fewshots": [], "portfolio_urls": [] },
    "conversa": { "id": "smoke-3", "telefone": "+5511900000099", "estado_agente": "tattoo", "dados_coletados": {}, "dados_cadastro": {} }
  }' | jq '{proxima_acao, urls_portfolio, resposta_cliente}'
```

Expected: `proxima_acao: "pergunta"`, `urls_portfolio: []`, `resposta_cliente` contém ideia de "ainda nao temos portfolio" / "estamos montando" / equivalente.

- [ ] **Step 5: Smoke TC-PORT-08 (proposta escolhendo_horario + estilo blackwork)**

```bash
curl -s -X POST http://localhost:8788/api/agent/route \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "telefone": "+5511900000099",
    "mensagem": "queria ver mais blackwork antes",
    "estado_atual": "escolhendo_horario",
    "dados_acumulados": {},
    "historico": [{"role":"assistant","content":"Tenho ter 12/05 14h-17h. Bora?"}],
    "tenant": { "id": "00000000-0000-0000-0000-000000000001", "nome_estudio": "Smoke", "config_agente": {}, "config_precificacao": {"sinal_percentual": 30}, "gatilhos_handoff": [], "faqs": [], "fewshots": [], "fewshots_por_modo": {}, "portfolio_urls": ["https://e.com/blackwork-1.jpg","https://e.com/fineline-1.jpg"] },
    "conversa": { "id": "smoke-8", "telefone": "+5511900000099", "estado_agente": "escolhendo_horario", "dados_coletados": {}, "dados_cadastro": {"nome":"Cliente"}, "valor_proposto": 750 }
  }' | jq '{proxima_acao, urls_portfolio, estado_novo, agent_usado}'
```

Expected: `proxima_acao: "enviar_portfolio"`, `urls_portfolio` contém URLs com "blackwork" preferencialmente (filtro substring), `estado_novo: "escolhendo_horario"`, `agent_usado: "escolhendo_horario"`.

- [ ] **Step 6: Matar `wrangler pages dev`**

```bash
kill $(cat /tmp/wrangler-sub33.pid) 2>/dev/null
rm -f /tmp/wrangler-sub33.pid /tmp/wrangler-sub33.log
```

- [ ] **Step 7: Rodar `/dod` (Definition of Done)**

Invoke skill `dod` na sessão pra check os 7 pontos.

- [ ] **Step 8: Push + abrir PR**

```bash
git push -u origin feat/sub3-3-portfolio-agent-v2
gh pr create --title "feat(sub3-3): PortfolioAgent v2 — intent transversal enviar_portfolio" --body "$(cat <<'EOF'
## Summary

- Intent transversal `enviar_portfolio` orquestrada pelo route.js (sem agent LLM novo — YAGNI)
- 3 agents de fase (Tattoo/Cadastro/Proposta v2) ganham enum + payload_portfolio + invariant
- Helper `prefetchPortfolio` (4 unit tests) injeta `portfolio_disponivel:boolean` no clientContext
- Tool `functions/api/tools/enviar-portfolio.js` INTACTA
- 9 evals novos passam (custo ~$0.005, gpt-4o-mini)
- Sub-2 (10/10) + Sub-3.1 (9/9) + Sub-3.2 (10/11) regression check verde

## Test plan

- [x] `node --test tests/agent/_lib/prefetch-portfolio.test.mjs` (4/4)
- [x] `node --test tests/agent/route-portfolio-orchestrator.test.mjs` (5/5)
- [x] `npm test` (suite completa verde)
- [x] `npm run eval:portfolio` (9/9 gpt-4o-mini)
- [x] Regression: `npm run eval:tattoo` + `eval:cadastro` + `eval:proposta`
- [x] Smoke local 3 cenarios (TC-PORT-01/03/08) via wrangler pages dev + curl

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL retornada.

---

## Self-review (run by plan author)

**Spec coverage:** todas as decisões cravadas mapeadas:
- Orchestrator-only / sem agent novo → Tasks 2, 10 (helper + branch)
- 3 agents ganham intent → Tasks 3, 4, 5 (schema + invariant)
- Tool intacta → Task 1 step 1 confirma; nenhum task modifica `enviar-portfolio.js`
- `payload_portfolio` `.nullable().default(null)` → Tasks 3, 4, 5
- Pre-fetch helper → Task 2
- 9 evals → Task 11 + Task 12 gate
- Validator hard-fail intent + `portfolio_disponivel=false` → Tasks 3, 4, 5
- Estado pós-envio = estado_atual → Task 6 NEXT_STATE entries
- `portfolio_disponivel` no contexto + bloco decisao → Tasks 7, 8, 9
- urls_portfolio na response → Task 10 (executePortfolioIntent)

**No placeholders:** todos os steps têm código completo, comandos exatos com expected output, e file paths. ⚠️ **Caveat sincero — Task 1 Step 4 e Step 5 dependem dos números de linha que mudam ao longo da implementação; eles dão o ponto de partida (`grep` que retorna a linha-âncora) ao invés de hardcoded line numbers.** Aceitável.

**Type consistency:**
- `payload_portfolio` shape `{ estilo, max, motivo }` consistente em Tasks 3, 4, 5 (schema), Task 10 (orchestrator usa `.estilo` + `.max ?? 5`), Task 11 (eval asserts `payload_portfolio.estilo`).
- `clientContext.portfolio_disponivel:boolean` consistente em Tasks 2 (helper produz), 3/4/5 (validator consome), 7/8/9 (prompts consomem), 10 (route plugs).
- `urls_portfolio` field name consistente em Task 10 (helper retorna `{ urls_portfolio }`, response inclui), Task 11 (asserts), Task 13 (smoke jq).
- `executePortfolioIntent(out, { env, tenant })` assinatura consistente em Task 10 step 1 (test) e step 3 (impl).

**Task count:** 13 tasks. Dentro do limite de 15.

**Pilar 2 checklist:**
- ✅ Checkpoints testáveis (cada task tem unit test ou eval gate, não só "refactor invisível")
- ✅ Cada passo tem commit no final
- ✅ Riscos flagged (R1-R7 + closure cross-agent regression)
- ✅ Ordem dependências (helper antes de schema antes de prompt antes de route antes de eval)
- ✅ <15 passos (13 tasks)
