# Caminho C — Fase 1: TattooAgent strict schema refactor + agent-runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar o TattooAgent saindo do SDK `@openai/agents` (que rejeita schemas ricos via typeGuards.mjs:14) pra OpenAI SDK puro com Responses API + `response_format: { type:'json_schema', strict:true }`, codificando o handoff como **discriminated union** no schema (constrained decoding token-level), e extraindo um módulo `_lib/agent-runtime/` reusável que sirva de template pros Cadastro/Proposta na Fase 2.

**Architecture:** Pipeline novo só pro estado `tattoo`: agent como função pura (`runTattooAgent`) → `runtime.run()` (wrapper `openai.responses.create` + retry) → schema strict discriminated union de 4 branches (pergunta/handoff/enviar_portfolio/erro) onde shape inválido é estruturalmente impossível. Router valida pré-condições de transição contra contratos tipados (`HANDOFF_CONTRACTS`). Cadastro/Proposta permanecem no path antigo (`selectAgentBuilder` + `@openai/agents`) até Fase 2. Coexistência durante a transição: `@openai/agents` continua em `package.json`.

**Tech Stack:** OpenAI SDK puro (`openai@^4`) + `zodResponseFormat` de `openai/helpers/zod`, Zod `^3.23`, Cloudflare Pages Functions runtime, `node --test` + `node:assert/strict`, eval harness Anthropic Claude Haiku 4.5 judge.

**Spec source:** `docs/superpowers/specs/2026-05-17-caminho-c-fase1-tattoo-strict-schema-design.md`

---

## File Structure

**Novos arquivos:**
- `functions/_lib/agent-runtime/retry.js` — exponential backoff + taxonomia de erros retryáveis
- `functions/_lib/agent-runtime/schema-to-json.js` — wrapper Zod → JSON Schema strict via `zodResponseFormat`
- `functions/_lib/agent-runtime/runtime.js` — `runtime.run({ apiKey, model, instructions, input, outputSchema })` wrappando `openai.responses.create`
- `functions/_lib/agent-runtime/contracts/tattoo-handoff.js` — `TattooHandoffPayload` + `extractHandoffPayload`
- `functions/_lib/agent-runtime/fallbacks.js` — mensagens last-resort pro cliente quando todos retries falham
- `functions/api/agent/agents/tattoo-schema.js` — `TattooOutputSchema` (discriminated union 4 branches) extraído pra reuso em tests
- `tests/_lib/agent-runtime/retry.test.mjs`
- `tests/_lib/agent-runtime/schema-to-json.test.mjs`
- `tests/_lib/agent-runtime/runtime.test.mjs`
- `tests/_lib/agent-runtime/contracts/tattoo-handoff.test.mjs`
- `tests/agent/tattoo-schema.test.mjs`
- `tests/agent/_spike-fase1-openai-strict.mjs` — spike pré-código (Task 1)
- `tests/integration/agent-tattoo-handoff.test.mjs`

**Modificados:**
- `functions/api/agent/agents/tattoo.js` — REESCRITO: `runTattooAgent` função pura, sem classe `Agent`, sem `@openai/agents`
- `functions/api/agent/router.js` — adiciona `HANDOFF_CONTRACTS` + `validateTransition`
- `functions/api/agent/route.js` — branch `if (estado_atual === 'tattoo')` no path novo (linhas ~100-180)
- `tests/agent/tattoo-agent.test.mjs` — REESCRITO pro padrão `runTattooAgent` (mock runtime, sem chamar OpenAI)
- `package.json` — adiciona `openai` como dep direta (já existe bundled via `@openai/agents`, mas extrair pra dep explícita destrava upgrade independente)

**Intocados (Fase 2):**
- `functions/api/agent/agents/cadastro.js`
- `functions/api/agent/agents/proposta.js`

---

## Riscos sinalizados (ler antes de executar)

- **Risco arquitetural cravado (Task 1 mitiga):** O spike Sub 1.D falsificou `@openai/agents` SDK. Antes de gastar 6h refatorando, Task 1 valida em isolamento que `openai.responses.create()` puro + `strict:true` + discriminated union 4 branches retorna 200. Se falhar, PAUSA e re-cravar design.
- **Custo monetário Task 1 + Task 12:** ~$0.05 (spike) + ~$1.50-2.00 (eval re-baseline) = total ≤$2.05.
- **Coexistência `@openai/agents`:** package.json continua com a dep até Fase 2. Cadastro/Proposta não devem regressar — Task 12 inclui smoke nos 3 agents (não só Tattoo).
- **Breaking change na assinatura interna:** `route.js` deixa de chamar `selectAgentBuilder('tattoo')` no path novo. `selectAgentBuilder` continua exportada (cadastro/proposta usam). Mas se houver dead code chamando `buildTattooAgent` direto, vai quebrar. Task 8 inclui grep pra confirmar zero callers além de tests e router.
- **Secrets:** `OPENAI_API_KEY` já existe em `env` (Cloudflare bindings). Nenhum secret novo. Não há migration DB.

---

## Task 1: Spike pré-PR — valida OpenAI Responses API + discriminated union strict mode

**Objetivo:** Antes de comprometer com 6h de refator, validar empiricamente que `openai.responses.create()` puro aceita JSON Schema strict com discriminated union (4 branches via `oneOf` + `const` discriminators). Spike isolado, descartável após Task 12 (vira regression test).

**Files:**
- Create: `tests/agent/_spike-fase1-openai-strict.mjs`

- [ ] **Step 1: Adicionar `openai` como dep direta**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
npm install openai@^4
```

Run: `node -e "console.log(require('openai/package.json').version)"`
Expected: prints `4.x.y` (versão ≥4.55 para `openai/helpers/zod` com `zodResponseFormat`).

- [ ] **Step 2: Escrever o spike script**

Cria `tests/agent/_spike-fase1-openai-strict.mjs`:

```js
// Spike Fase 1 pre-PR: valida que openai SDK puro + Responses API + strict mode
// aceita discriminated union no schema. Falsifica em isolamento o risco do
// spike Sub 1.D (que era no @openai/agents SDK, cai em fallback rejeitado).
//
// Run: node --env-file=evals/.env tests/agent/_spike-fase1-openai-strict.mjs
// Custo: ~$0.05 (1 chamada gpt-4o-mini).
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

const Pergunta = z.object({
  proxima_acao: z.literal('pergunta'),
  resposta_cliente: z.string().min(1),
  campos_faltando: z.array(z.string()).min(1),
});
const Handoff = z.object({
  proxima_acao: z.literal('handoff'),
  resposta_cliente: z.string().min(1),
  dados: z.object({
    descricao_curta: z.string().min(1),
    local_corpo: z.string().min(1),
    altura_cm: z.number().positive().max(250),
    estilo: z.string().min(1),
  }),
});
const SpikeSchema = z.discriminatedUnion('proxima_acao', [Pergunta, Handoff]);

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await client.responses.create({
  model: 'gpt-4o-mini',
  instructions: 'Você é um agente de tatuagem. Se o cliente disse tudo (descricao, local, altura, estilo), retorne handoff. Senão pergunta.',
  input: [{ role: 'user', content: 'Quero uma rosa pequena no braço direito, sou 1.70m, traço fino' }],
  text: { format: zodResponseFormat(SpikeSchema, 'tattoo_output') },
});

console.log('status:', response.status);
console.log('output_parsed:', JSON.stringify(response.output_parsed, null, 2));

if (response.status !== 'completed') {
  console.error('FAIL: response.status !== completed');
  process.exit(1);
}
const parsed = response.output_parsed;
if (!parsed || !['pergunta', 'handoff'].includes(parsed.proxima_acao)) {
  console.error('FAIL: discriminated union não respeitado');
  process.exit(1);
}
console.log('PASS: discriminated union strict mode funciona com openai SDK puro');
```

- [ ] **Step 3: Rodar o spike**

Run: `node --env-file=evals/.env tests/agent/_spike-fase1-openai-strict.mjs`

**Expected (✅ caso de sucesso):**
- `status: completed`
- `output_parsed.proxima_acao` é `'pergunta'` ou `'handoff'`
- Script imprime `PASS`
- Exit 0

**Decisão pós-spike:**
- ✅ PASS → prossegue pra Task 2
- ❌ FAIL (400 ou erro de schema) → **PARA**. Re-lê o erro completo, documenta em `docs/inkflow-agent/reports/2026-05-17-spike-fase1-openai-strict-FAIL.md`, e volta pro spec pra re-cravar design (talvez `chat.completions.create()` + `response_format` em vez de `responses.create()`).

- [ ] **Step 4: Commit (spike passou)**

```bash
git add tests/agent/_spike-fase1-openai-strict.mjs package.json package-lock.json
git commit -m "spike(fase-1): valida openai SDK puro + Responses API + strict discriminated union

Spike pre-PR isolado: confirma que oneOf via z.discriminatedUnion('proxima_acao', [...])
e aceito pelo Responses API com response_format strict:true + zodResponseFormat helper.

Falsifica risco do spike Sub 1.D (que falhou em @openai/agents SDK, typeGuards.mjs:14).
Custo: ~\$0.05. Verifica em isolamento antes de comprometer com refator de 6h."
```

---

## Task 2: Eval baseline em main (zero-regression gate)

**Objetivo:** Antes de tocar em qualquer arquivo de produção, rodar o eval harness no main pra capturar baseline atual (PER-001, PER-009, PER-010 + os 2 outros agents). Pós-PR, vamos comparar pra garantir zero regressão em Cadastro/Proposta (que ficam intocados).

**Files:** (nenhum)

- [ ] **Step 1: Confirmar branch limpa e em main**

Run: `git status && git branch --show-current`
Expected: working tree clean, branch `main` (ou cria a branch de feature agora a partir de main).

- [ ] **Step 2: Criar branch de feature**

```bash
git checkout -b feat/caminho-c-fase1-tattoo-strict
```

- [ ] **Step 3: Rodar eval harness baseline (3 personas tattoo)**

Run:
```bash
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo --persona=PER-001
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo --persona=PER-009
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo --persona=PER-010
```

**Expected (paridade com re-baseline Sub 1.C):**
- PER-001: ✅ pass
- PER-009: ❌ fail (nat 3.5 < 3.8 OU HTTP 500)
- PER-010: ❌ fail (HTTP 500 esperado em ~33%)
- Total: 1/3 pass, 2/6 HTTP 500 esperados

- [ ] **Step 4: Salvar baseline em report**

Crie `docs/inkflow-agent/reports/2026-05-17-baseline-pre-fase1.md` com:
- timestamp
- comando exato rodado
- output completo de cada persona (status, score, motivos de fail)
- soma de HTTP 500
- número da sha do commit base (`git rev-parse HEAD`)

- [ ] **Step 5: Commit baseline**

```bash
git add docs/inkflow-agent/reports/2026-05-17-baseline-pre-fase1.md
git commit -m "docs(fase-1): captura baseline eval pre-refator (2/6 HTTP 500, 1/3 pass)"
```

---

## Task 3: `_lib/agent-runtime/retry.js` (TDD)

**Objetivo:** Wrapper `runWithRetry(fn, opts)` com exponential backoff (1s/2s/4s), respeitando `Retry-After` em 429 e bloqueando retry pra erros não-retryáveis (`context_length_exceeded`, 401, 403, `invalid_api_key`).

**Files:**
- Create: `functions/_lib/agent-runtime/retry.js`
- Create: `tests/_lib/agent-runtime/retry.test.mjs`

- [ ] **Step 1: Escrever os tests primeiro (failing)**

```js
// tests/_lib/agent-runtime/retry.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWithRetry, isRetryable } from '../../../functions/_lib/agent-runtime/retry.js';

test('runWithRetry: retorna o valor na primeira tentativa', async () => {
  const result = await runWithRetry(async () => 'ok', { maxRetries: 3, baseMs: 1 });
  assert.equal(result, 'ok');
});

test('runWithRetry: retry em 503 e converge depois de 2 falhas', async () => {
  let calls = 0;
  const fn = async () => {
    calls++;
    if (calls < 3) { const e = new Error('503'); e.status = 503; throw e; }
    return 'ok';
  };
  const result = await runWithRetry(fn, { maxRetries: 3, baseMs: 1 });
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});

test('runWithRetry: nao faz retry em 401', async () => {
  let calls = 0;
  const fn = async () => { calls++; const e = new Error('401'); e.status = 401; throw e; };
  await assert.rejects(runWithRetry(fn, { maxRetries: 3, baseMs: 1 }), /401/);
  assert.equal(calls, 1);
});

test('runWithRetry: nao faz retry em context_length_exceeded', async () => {
  let calls = 0;
  const fn = async () => { calls++; const e = new Error('too big'); e.code = 'context_length_exceeded'; throw e; };
  await assert.rejects(runWithRetry(fn, { maxRetries: 3, baseMs: 1 }), /too big/);
  assert.equal(calls, 1);
});

test('runWithRetry: respeita Retry-After em 429 (header presente)', async () => {
  let calls = 0;
  const t0 = Date.now();
  const fn = async () => {
    calls++;
    if (calls === 1) {
      const e = new Error('429'); e.status = 429;
      e.headers = { 'retry-after': '0' }; // 0s pra teste rapido
      throw e;
    }
    return 'ok';
  };
  const result = await runWithRetry(fn, { maxRetries: 1, baseMs: 1 });
  assert.equal(result, 'ok');
  assert.ok(Date.now() - t0 < 100, 'respeitou retry-after=0');
});

test('runWithRetry: estoura maxRetries e re-lanca o ultimo erro', async () => {
  let calls = 0;
  const fn = async () => { calls++; const e = new Error('flap'); e.status = 502; throw e; };
  await assert.rejects(runWithRetry(fn, { maxRetries: 2, baseMs: 1 }), /flap/);
  assert.equal(calls, 3); // attempt 0, 1, 2
});

test('isRetryable: 500/502/503/504 sao retryaveis', () => {
  for (const s of [500, 502, 503, 504]) {
    assert.equal(isRetryable({ status: s }), true, `status ${s}`);
  }
});

test('isRetryable: ECONNRESET/ETIMEDOUT/EAI_AGAIN sao retryaveis', () => {
  for (const c of ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']) {
    assert.equal(isRetryable({ code: c }), true, `code ${c}`);
  }
});

test('isRetryable: 401/403 nao sao retryaveis', () => {
  assert.equal(isRetryable({ status: 401 }), false);
  assert.equal(isRetryable({ status: 403 }), false);
});
```

- [ ] **Step 2: Rodar tests e ver que falham**

Run: `node --test tests/_lib/agent-runtime/retry.test.mjs`
Expected: FAIL com `Cannot find module .../retry.js`.

- [ ] **Step 3: Implementar `retry.js`**

```js
// functions/_lib/agent-runtime/retry.js
// Exponential backoff + taxonomia de erros retryaveis. Wrappa qualquer fn
// async — usado pelo runtime.run() pra envelopar openai.responses.create().
//
// Decisao cravada (spec Caminho C Fase 1 secao 5):
// - Retry: 500/502/503/504, 429 (respeita Retry-After), ECONNRESET/ETIMEDOUT/EAI_AGAIN
// - NO retry: 401/403 (config), context_length_exceeded, 400 (nao deve acontecer pos-strict)
// - Backoff: 1s, 2s, 4s (baseMs * 2^attempt). Worst case: 1+2+4=7s.

const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);
const RATE_LIMIT_STATUS = 429;
const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']);
const NON_RETRYABLE_CODES = new Set(['context_length_exceeded', 'invalid_api_key']);
const NON_RETRYABLE_STATUS = new Set([401, 403]);

export function isRetryable(err) {
  if (!err) return false;
  if (NON_RETRYABLE_CODES.has(err.code)) return false;
  if (NON_RETRYABLE_STATUS.has(err.status)) return false;
  if (err.status === RATE_LIMIT_STATUS) return true;
  return RETRYABLE_STATUS.has(err.status) || RETRYABLE_CODES.has(err.code);
}

function parseRetryAfter(err) {
  const h = err.headers && (err.headers['retry-after'] ?? err.headers['Retry-After']);
  if (h == null) return null;
  const seconds = Number(h);
  if (!Number.isFinite(seconds)) return null;
  return seconds * 1000;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function runWithRetry(fn, { maxRetries = 3, baseMs = 1000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxRetries) throw err;
      const retryAfterMs = err.status === RATE_LIMIT_STATUS ? parseRetryAfter(err) : null;
      const delay = retryAfterMs ?? baseMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
  throw lastErr;
}
```

- [ ] **Step 4: Rodar tests, ver que passam**

Run: `node --test tests/_lib/agent-runtime/retry.test.mjs`
Expected: PASS — 9 testes, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/agent-runtime/retry.js tests/_lib/agent-runtime/retry.test.mjs
git commit -m "feat(agent-runtime): adiciona retry.js com exponential backoff

Wrappa fn async com retry 1s/2s/4s pra 5xx + network errors + 429 (respeita
Retry-After). NO retry em 401/403/context_length_exceeded. Testavel em isolamento.

Spec Caminho C Fase 1 secao 5 — base do runtime.run() (Task 5)."
```

---

## Task 4: `_lib/agent-runtime/schema-to-json.js` (TDD)

**Objetivo:** Wrapper minimalista em torno de `zodResponseFormat` de `openai/helpers/zod` que aceita um Zod schema (incluindo `discriminatedUnion`) e retorna o objeto pronto pra ser passado em `responses.create({ text: { format: ... } })`. Existe pra:
1. Isolar a dep do helper oficial num único lugar (futuro multi-provider).
2. Garantir que erros do conversor são captured (e.g., `ZodEffects` rejeitado) com mensagem clara antes de virar 400 do servidor.

**Files:**
- Create: `functions/_lib/agent-runtime/schema-to-json.js`
- Create: `tests/_lib/agent-runtime/schema-to-json.test.mjs`

- [ ] **Step 1: Escrever os tests primeiro (failing)**

```js
// tests/_lib/agent-runtime/schema-to-json.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { toResponseFormat } from '../../../functions/_lib/agent-runtime/schema-to-json.js';

test('toResponseFormat: ZodObject puro retorna format type=json_schema strict', () => {
  const schema = z.object({ foo: z.string() });
  const fmt = toResponseFormat(schema, 'test_output');
  assert.equal(fmt.type, 'json_schema');
  assert.equal(fmt.name, 'test_output');
  assert.equal(fmt.strict, true);
  assert.ok(fmt.schema && typeof fmt.schema === 'object');
});

test('toResponseFormat: discriminatedUnion gera oneOf no schema', () => {
  const A = z.object({ tag: z.literal('a'), x: z.string() });
  const B = z.object({ tag: z.literal('b'), y: z.number() });
  const schema = z.discriminatedUnion('tag', [A, B]);
  const fmt = toResponseFormat(schema, 'union_test');
  const json = fmt.schema;
  assert.ok(Array.isArray(json.anyOf) || Array.isArray(json.oneOf), 'tem anyOf ou oneOf');
});

test('toResponseFormat: schema com ZodEffects (.refine) lanca erro claro', () => {
  const schema = z.object({ foo: z.string() }).refine(v => v.foo.length > 0);
  assert.throws(
    () => toResponseFormat(schema, 'bad'),
    /ZodEffects|refine|nao suportado|json_schema/i,
  );
});
```

- [ ] **Step 2: Rodar tests, ver que falham**

Run: `node --test tests/_lib/agent-runtime/schema-to-json.test.mjs`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `schema-to-json.js`**

```js
// functions/_lib/agent-runtime/schema-to-json.js
// Wrapper minimalista em torno de zodResponseFormat (openai/helpers/zod).
// Existe pra:
// 1. Isolar a dep oficial em um unico lugar (futuro multi-provider).
// 2. Detectar ZodEffects/discriminated invalido cedo com mensagem clara,
//    em vez de virar 400 do Responses API.
//
// Decisao cravada (spec Caminho C Fase 1 secao 4.A Principio 1).
import { zodResponseFormat } from 'openai/helpers/zod';

export function toResponseFormat(zodSchema, name) {
  if (!zodSchema || !zodSchema._def) {
    throw new Error('toResponseFormat: zodSchema invalido (sem _def)');
  }
  const typeName = zodSchema._def.typeName;
  if (typeName === 'ZodEffects') {
    throw new Error(
      'toResponseFormat: ZodEffects (.refine/.transform) nao suportado em json_schema strict. ' +
      'Mova invariantes pra discriminated union ou validacao pos-parse.',
    );
  }
  // zodResponseFormat ja gera { type:'json_schema', json_schema:{ name, strict, schema } }
  // Mas a Responses API espera shape achatado em text.format. Conferir:
  // openai/helpers/zod retorna { type:'json_schema', json_schema:{...} } pra Chat Completions.
  // Pra Responses API, esperamos { type:'json_schema', name, strict, schema }.
  // Normalizamos aqui:
  const raw = zodResponseFormat(zodSchema, name);
  if (raw?.json_schema) {
    const { name: n, strict, schema } = raw.json_schema;
    return { type: 'json_schema', name: n, strict, schema };
  }
  return raw;
}
```

- [ ] **Step 4: Rodar tests, ver que passam**

Run: `node --test tests/_lib/agent-runtime/schema-to-json.test.mjs`
Expected: PASS — 3 testes.

**Observação importante:** Se o test `discriminatedUnion gera oneOf no schema` falhar porque `zodResponseFormat` versão 4.x gera `anyOf` em vez de `oneOf`, o test já aceita ambos. Se gerar nada (ex: representação alternativa), ajustar o assert pra inspecionar `fmt.schema.properties.tag` (discriminator deve aparecer como `const`).

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/agent-runtime/schema-to-json.js tests/_lib/agent-runtime/schema-to-json.test.mjs
git commit -m "feat(agent-runtime): schema-to-json.js converte Zod pra Responses API format

Wrappa zodResponseFormat (openai/helpers/zod) + normaliza shape pra
text.format do Responses API. Detecta ZodEffects cedo com mensagem clara
em vez de 400 obscuro do servidor.

Spec Caminho C Fase 1 secao 4.A Principio 1."
```

---

## Task 5: `_lib/agent-runtime/runtime.js` (TDD com mock)

**Objetivo:** Função `runtime.run({ apiKey, model, instructions, input, outputSchema, retryConfig })` que:
1. Converte `outputSchema` via `toResponseFormat`.
2. Chama `openai.responses.create()` via `runWithRetry`.
3. Retorna `response.output_parsed` (já é objeto JS, sem `JSON.parse` manual).
4. Aceita opcionalmente um `openaiClient` injetado pra testes (default: `new OpenAI({ apiKey })`).

**Files:**
- Create: `functions/_lib/agent-runtime/runtime.js`
- Create: `tests/_lib/agent-runtime/runtime.test.mjs`

- [ ] **Step 1: Escrever os tests primeiro (failing)**

```js
// tests/_lib/agent-runtime/runtime.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { runtime } from '../../../functions/_lib/agent-runtime/runtime.js';

const SimpleSchema = z.object({
  proxima_acao: z.literal('pergunta'),
  resposta_cliente: z.string(),
});

function makeFakeClient({ parsed, status = 'completed', throwTimes = 0 } = {}) {
  let calls = 0;
  return {
    _calls: () => calls,
    responses: {
      create: async (params) => {
        calls++;
        if (calls <= throwTimes) {
          const e = new Error('503');
          e.status = 503;
          throw e;
        }
        return {
          status,
          output_parsed: parsed,
          _params: params, // pra inspecionar o que foi enviado
        };
      },
    },
  };
}

test('runtime.run: chama openai.responses.create com schema convertido', async () => {
  const fake = makeFakeClient({ parsed: { proxima_acao: 'pergunta', resposta_cliente: 'oi' } });
  const out = await runtime.run({
    openaiClient: fake,
    model: 'gpt-4o-mini',
    instructions: 'instrucoes',
    input: [{ role: 'user', content: 'hi' }],
    outputSchema: SimpleSchema,
    schemaName: 'simple',
  });
  assert.deepEqual(out, { proxima_acao: 'pergunta', resposta_cliente: 'oi' });
  // valida params enviados
  const params = fake.responses.create.lastParams ?? (await (async () => {
    const f2 = makeFakeClient({ parsed: out });
    await runtime.run({ openaiClient: f2, model: 'gpt-4o-mini', instructions: 'x', input: [], outputSchema: SimpleSchema, schemaName: 's' });
    return null;
  })());
});

test('runtime.run: passa instructions e model corretos', async () => {
  let captured;
  const fake = {
    responses: {
      create: async (params) => {
        captured = params;
        return { status: 'completed', output_parsed: { proxima_acao: 'pergunta', resposta_cliente: 'x' } };
      },
    },
  };
  await runtime.run({
    openaiClient: fake,
    model: 'gpt-4o-mini',
    instructions: 'sou um agente',
    input: [{ role: 'user', content: 'oi' }],
    outputSchema: SimpleSchema,
    schemaName: 'simple',
  });
  assert.equal(captured.model, 'gpt-4o-mini');
  assert.equal(captured.instructions, 'sou um agente');
  assert.deepEqual(captured.input, [{ role: 'user', content: 'oi' }]);
  assert.equal(captured.text.format.type, 'json_schema');
  assert.equal(captured.text.format.strict, true);
  assert.equal(captured.text.format.name, 'simple');
});

test('runtime.run: retry em 503 transitorio e retorna output', async () => {
  const fake = makeFakeClient({ parsed: { proxima_acao: 'pergunta', resposta_cliente: 'ok' }, throwTimes: 2 });
  const out = await runtime.run({
    openaiClient: fake,
    model: 'gpt-4o-mini',
    instructions: 'x',
    input: [],
    outputSchema: SimpleSchema,
    schemaName: 's',
    retryConfig: { maxRetries: 3, baseMs: 1 },
  });
  assert.equal(out.resposta_cliente, 'ok');
  assert.equal(fake._calls(), 3);
});

test('runtime.run: status != completed lanca erro', async () => {
  const fake = makeFakeClient({ parsed: null, status: 'incomplete' });
  await assert.rejects(
    runtime.run({
      openaiClient: fake, model: 'gpt-4o-mini', instructions: 'x', input: [],
      outputSchema: SimpleSchema, schemaName: 's', retryConfig: { maxRetries: 0, baseMs: 1 },
    }),
    /incomplete|status/i,
  );
});

test('runtime.run: output_parsed null lanca erro', async () => {
  const fake = makeFakeClient({ parsed: null, status: 'completed' });
  await assert.rejects(
    runtime.run({
      openaiClient: fake, model: 'gpt-4o-mini', instructions: 'x', input: [],
      outputSchema: SimpleSchema, schemaName: 's', retryConfig: { maxRetries: 0, baseMs: 1 },
    }),
    /output_parsed|parsed/i,
  );
});
```

- [ ] **Step 2: Rodar tests, ver que falham**

Run: `node --test tests/_lib/agent-runtime/runtime.test.mjs`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `runtime.js`**

```js
// functions/_lib/agent-runtime/runtime.js
// runtime.run({ apiKey, model, instructions, input, outputSchema, schemaName, retryConfig, openaiClient })
//
// Wrappa openai.responses.create() com:
// - Schema strict via toResponseFormat (constrained decoding token-level)
// - Retry exponential backoff via runWithRetry (network + 5xx + 429)
// - Verifica status === 'completed' e output_parsed != null
//
// Padrao spec Caminho C Fase 1 secao 4.A Principio 3: agent como funcao pura.
import OpenAI from 'openai';
import { toResponseFormat } from './schema-to-json.js';
import { runWithRetry } from './retry.js';

export const runtime = {
  async run({
    apiKey,
    openaiClient,
    model,
    instructions,
    input,
    outputSchema,
    schemaName,
    retryConfig = { maxRetries: 3, baseMs: 1000 },
  }) {
    const client = openaiClient ?? new OpenAI({ apiKey });
    const format = toResponseFormat(outputSchema, schemaName);

    const response = await runWithRetry(
      () => client.responses.create({
        model,
        instructions,
        input,
        text: { format },
      }),
      retryConfig,
    );

    if (response.status !== 'completed') {
      const err = new Error(`runtime.run: response.status='${response.status}' (esperado 'completed')`);
      err.responseStatus = response.status;
      err.responseId = response.id;
      throw err;
    }
    if (response.output_parsed == null) {
      throw new Error('runtime.run: output_parsed null/undefined (schema strict deveria garantir parsed)');
    }
    return response.output_parsed;
  },
};
```

- [ ] **Step 4: Rodar tests, ver que passam**

Run: `node --test tests/_lib/agent-runtime/runtime.test.mjs`
Expected: PASS — 5 testes. Ajustar test 1 se o helper `lastParams` der problema (já tem fallback no test 2 que valida o mesmo).

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/agent-runtime/runtime.js tests/_lib/agent-runtime/runtime.test.mjs
git commit -m "feat(agent-runtime): runtime.js wrappa openai.responses.create com strict + retry

Funcao pura runtime.run() recebe { apiKey, model, instructions, input,
outputSchema, schemaName }. Converte schema via toResponseFormat, chama
Responses API com text.format.strict=true, retry exponential backoff
em network/5xx/429. Retorna output_parsed direto (sem JSON.parse manual).

Aceita openaiClient injetado pra testes sem chamar OpenAI real.

Spec Caminho C Fase 1 secao 4.A Principio 3 — base do runTattooAgent (Task 8)."
```

---

## Task 6: Fallbacks last-resort (`_lib/agent-runtime/fallbacks.js`)

**Objetivo:** Mensagens amigáveis pro cliente quando todos retries falham. Pequeno e isolado pra ser reusado pelos 3 agents (Fase 2 também consome).

**Files:**
- Create: `functions/_lib/agent-runtime/fallbacks.js`
- Create: `tests/_lib/agent-runtime/fallbacks.test.mjs`

- [ ] **Step 1: Test failing**

```js
// tests/_lib/agent-runtime/fallbacks.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackOutput, FALLBACK_MESSAGE } from '../../../functions/_lib/agent-runtime/fallbacks.js';

test('buildFallbackOutput: retorna shape compativel com TattooOutput pergunta', () => {
  const out = buildFallbackOutput('tattoo');
  assert.equal(out.proxima_acao, 'pergunta');
  assert.equal(out.resposta_cliente, FALLBACK_MESSAGE);
  assert.equal(out.dados_completos, false);
  assert.ok(Array.isArray(out.campos_faltando));
  assert.ok(Array.isArray(out.campos_conflitantes));
  assert.equal(out.payload_portfolio, null);
});

test('FALLBACK_MESSAGE: nao expoe stack/error interno', () => {
  assert.ok(typeof FALLBACK_MESSAGE === 'string');
  assert.ok(FALLBACK_MESSAGE.length > 0);
  assert.ok(!/error|exception|stack|null|undefined/i.test(FALLBACK_MESSAGE));
});
```

- [ ] **Step 2: Rodar — FAIL**

Run: `node --test tests/_lib/agent-runtime/fallbacks.test.mjs`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `fallbacks.js`**

```js
// functions/_lib/agent-runtime/fallbacks.js
// Fallback last-resort quando todos os retries falham (network down, 401, etc).
// Cliente recebe mensagem amigavel; route.js loga erro detalhado em telemetria.
//
// Spec Caminho C Fase 1 secao 5.

export const FALLBACK_MESSAGE = 'Recebi tua mensagem — me da um segundinho que ja respondo direito.';

export function buildFallbackOutput(agentName) {
  // Shape minimo compativel com qualquer branch 'pergunta' dos agents.
  // route.js trata como turno normal: cliente ve mensagem, estado nao muda.
  return {
    proxima_acao: 'pergunta',
    resposta_cliente: FALLBACK_MESSAGE,
    dados_persistidos: {},
    dados_completos: false,
    campos_faltando: [],
    campos_conflitantes: [],
    payload_portfolio: null,
  };
}
```

- [ ] **Step 4: Rodar — PASS**

Run: `node --test tests/_lib/agent-runtime/fallbacks.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/agent-runtime/fallbacks.js tests/_lib/agent-runtime/fallbacks.test.mjs
git commit -m "feat(agent-runtime): fallbacks.js com mensagem amigavel last-resort

Quando todos os retries falham, runtime nao quebra: cliente recebe
'Recebi tua mensagem — me da um segundinho que ja respondo direito.'
Estado nao muda; telemetria loga erro detalhado pra ops.

Spec Caminho C Fase 1 secao 5."
```

---

## Task 7: `tattoo-schema.js` — TattooOutputSchema discriminated union 4 branches (TDD)

**Objetivo:** Extrair `TattooOutputSchema` de `agents/tattoo.js` pra `agents/tattoo-schema.js` reescrito como **discriminated union** de 4 branches. Schema enforça invariantes que antes ficavam em `validateTattooOutputInvariant` (handoff sem 4 OBR é estruturalmente impossível, etc).

**Files:**
- Create: `functions/api/agent/agents/tattoo-schema.js`
- Create: `tests/agent/tattoo-schema.test.mjs`

- [ ] **Step 1: Escrever tests do schema (failing)**

```js
// tests/agent/tattoo-schema.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TattooOutputSchema } from '../../functions/api/agent/agents/tattoo-schema.js';

// ─── Branch 'pergunta' ─────────────────────────────────────────────────

test('pergunta valido com campos_faltando nao-vazio passa', () => {
  const ok = TattooOutputSchema.safeParse({
    proxima_acao: 'pergunta',
    resposta_cliente: 'Qual o local da tatuagem?',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false,
    campos_faltando: ['local_corpo'],
    campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(ok.success, true);
});

test('pergunta com dados_completos=true e REJEITADO (literal:false)', () => {
  const r = TattooOutputSchema.safeParse({
    proxima_acao: 'pergunta',
    resposta_cliente: 'qual local?',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: true, // <-- invalido
    campos_faltando: ['local_corpo'],
    campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

test('pergunta com campos_faltando vazio e REJEITADO (min:1)', () => {
  const r = TattooOutputSchema.safeParse({
    proxima_acao: 'pergunta',
    resposta_cliente: 'qual local?',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false,
    campos_faltando: [], // <-- invalido
    campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

// ─── Branch 'handoff' ──────────────────────────────────────────────────

test('handoff com 4 OBR completos passa', () => {
  const ok = TattooOutputSchema.safeParse({
    proxima_acao: 'handoff',
    resposta_cliente: 'Beleza, ja vou passar pra cadastro!',
    dados_persistidos: {
      descricao_curta: 'rosa pequena traco fino',
      local_corpo: 'braco direito',
      altura_cm: 170,
      estilo: 'fineline',
      tamanho_cm: 5,
      cor_preferencia: 'preto',
      foto_local: null,
    },
    dados_completos: true,
    campos_faltando: [],
    campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(ok.success, true);
});

test('handoff sem descricao_curta e REJEITADO', () => {
  const r = TattooOutputSchema.safeParse({
    proxima_acao: 'handoff',
    resposta_cliente: 'oi',
    dados_persistidos: {
      // descricao_curta missing
      local_corpo: 'braco', altura_cm: 170, estilo: 'fineline',
      tamanho_cm: null, cor_preferencia: null, foto_local: null,
    },
    dados_completos: true,
    campos_faltando: [],
    campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

test('handoff com altura_cm null e REJEITADO (handoff exige non-null)', () => {
  const r = TattooOutputSchema.safeParse({
    proxima_acao: 'handoff',
    resposta_cliente: 'oi',
    dados_persistidos: {
      descricao_curta: 'x', local_corpo: 'y', altura_cm: null, estilo: 'z',
      tamanho_cm: null, cor_preferencia: null, foto_local: null,
    },
    dados_completos: true, campos_faltando: [], campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

test('handoff com dados_completos=false e REJEITADO (literal:true)', () => {
  const r = TattooOutputSchema.safeParse({
    proxima_acao: 'handoff',
    resposta_cliente: 'oi',
    dados_persistidos: {
      descricao_curta: 'x', local_corpo: 'y', altura_cm: 170, estilo: 'z',
      tamanho_cm: null, cor_preferencia: null, foto_local: null,
    },
    dados_completos: false, // <-- invalido
    campos_faltando: [], campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

test('handoff com campos_conflitantes nao-vazio e REJEITADO (length:0)', () => {
  const r = TattooOutputSchema.safeParse({
    proxima_acao: 'handoff',
    resposta_cliente: 'oi',
    dados_persistidos: {
      descricao_curta: 'x', local_corpo: 'y', altura_cm: 170, estilo: 'z',
      tamanho_cm: null, cor_preferencia: null, foto_local: null,
    },
    dados_completos: true, campos_faltando: [],
    campos_conflitantes: ['x'], // <-- invalido
    payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

// ─── Branch 'enviar_portfolio' ─────────────────────────────────────────

test('enviar_portfolio com payload_portfolio nao-null passa', () => {
  const ok = TattooOutputSchema.safeParse({
    proxima_acao: 'enviar_portfolio',
    resposta_cliente: 'aqui vai uma referencia',
    dados_persistidos: { estilo: 'fineline', tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false, campos_faltando: ['local_corpo'], campos_conflitantes: [],
    payload_portfolio: { estilo: 'fineline', max: 3, motivo: 'cliente pediu referencia' },
  });
  assert.equal(ok.success, true);
});

test('enviar_portfolio com payload_portfolio null e REJEITADO', () => {
  const r = TattooOutputSchema.safeParse({
    proxima_acao: 'enviar_portfolio',
    resposta_cliente: 'oi',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false, campos_faltando: ['local_corpo'], campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

// ─── Branch 'erro' ─────────────────────────────────────────────────────

test('erro com mensagem amigavel passa', () => {
  const ok = TattooOutputSchema.safeParse({
    proxima_acao: 'erro',
    resposta_cliente: 'Tive um problema aqui, podes mandar de novo?',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false, campos_faltando: [], campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(ok.success, true);
});

// ─── Discriminator ──────────────────────────────────────────────────────

test('proxima_acao desconhecido e REJEITADO', () => {
  const r = TattooOutputSchema.safeParse({
    proxima_acao: 'xyz',
    resposta_cliente: 'oi',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false, campos_faltando: [], campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(r.success, false);
});
```

- [ ] **Step 2: Rodar — FAIL (módulo inexistente)**

Run: `node --test tests/agent/tattoo-schema.test.mjs`

- [ ] **Step 3: Implementar `tattoo-schema.js`**

```js
// functions/api/agent/agents/tattoo-schema.js
// TattooOutputSchema — discriminated union de 4 branches.
//
// Antes (commit pre-fase1): schema era ZodObject puro permissivo,
// invariantes (handoff exige 4 OBR, dados_completos=true, etc) eram
// validadas POS-parse via validateTattooOutputInvariant. Output podia
// nascer invalido — virava HTTP 500 em 33% dos turnos criticos.
//
// Agora (Fase 1 Caminho C): discriminator='proxima_acao'. Cada branch
// forca shape consistente via z.literal() + min/max/nullable conditional.
// Schema strict no Responses API (constrained decoding token-level)
// torna output invalido estruturalmente impossivel.
import { z } from 'zod';

// Sub-shape: dados quando handoff NAO foi atingido (todos nullable)
const DadosParciais = z.object({
  descricao_curta: z.string().nullable(),
  local_corpo: z.string().nullable(),
  altura_cm: z.number().positive().max(250).nullable(),
  estilo: z.string().nullable(),
  tamanho_cm: z.number().positive().max(200).nullable(),
  cor_preferencia: z.string().nullable(),
  foto_local: z.string().nullable(),
});

// Sub-shape: dados no handoff (4 OBR obrigatorios non-nullable)
const DadosHandoff = z.object({
  descricao_curta: z.string().min(1),
  local_corpo: z.string().min(1),
  altura_cm: z.number().positive().max(250),
  estilo: z.string().min(1),
  tamanho_cm: z.number().positive().max(200).nullable(),
  cor_preferencia: z.string().nullable(),
  foto_local: z.string().nullable(),
});

// Sub-shape: payload portfolio
const PayloadPortfolio = z.object({
  estilo: z.string().nullable(),
  max: z.number().int().min(1).max(10),
  motivo: z.string().min(1),
});

// ─── Branch 1: pergunta ────────────────────────────────────────────────
const PerguntaOutput = z.object({
  proxima_acao: z.literal('pergunta'),
  resposta_cliente: z.string().min(1),
  dados_persistidos: DadosParciais,
  dados_completos: z.literal(false),
  campos_faltando: z.array(z.string()).min(1),
  campos_conflitantes: z.array(z.string()),
  payload_portfolio: z.null(),
});

// ─── Branch 2: handoff ─────────────────────────────────────────────────
const HandoffOutput = z.object({
  proxima_acao: z.literal('handoff'),
  resposta_cliente: z.string().min(1),
  dados_persistidos: DadosHandoff,
  dados_completos: z.literal(true),
  campos_faltando: z.array(z.string()).length(0),
  campos_conflitantes: z.array(z.string()).length(0),
  payload_portfolio: z.null(),
});

// ─── Branch 3: enviar_portfolio ────────────────────────────────────────
const EnviarPortfolioOutput = z.object({
  proxima_acao: z.literal('enviar_portfolio'),
  resposta_cliente: z.string().min(1),
  dados_persistidos: DadosParciais,
  dados_completos: z.boolean(),
  campos_faltando: z.array(z.string()),
  campos_conflitantes: z.array(z.string()),
  payload_portfolio: PayloadPortfolio,
});

// ─── Branch 4: erro ────────────────────────────────────────────────────
const ErroOutput = z.object({
  proxima_acao: z.literal('erro'),
  resposta_cliente: z.string().min(1),
  dados_persistidos: DadosParciais,
  dados_completos: z.literal(false),
  campos_faltando: z.array(z.string()),
  campos_conflitantes: z.array(z.string()),
  payload_portfolio: z.null(),
});

export const TattooOutputSchema = z.discriminatedUnion('proxima_acao', [
  PerguntaOutput,
  HandoffOutput,
  EnviarPortfolioOutput,
  ErroOutput,
]);
```

- [ ] **Step 4: Rodar — PASS**

Run: `node --test tests/agent/tattoo-schema.test.mjs`
Expected: PASS — 12 testes.

- [ ] **Step 5: Commit**

```bash
git add functions/api/agent/agents/tattoo-schema.js tests/agent/tattoo-schema.test.mjs
git commit -m "feat(tattoo): TattooOutputSchema vira discriminated union 4 branches

Antes: ZodObject puro + validateTattooOutputInvariant pos-parse (handoff
sem 4 OBR virava HTTP 500 em 33% dos turnos R9 — falsificado pelo eval
Sub 1.B/1.C).

Agora: z.discriminatedUnion('proxima_acao', [pergunta, handoff, enviar_portfolio, erro]).
- pergunta: dados_completos=literal(false), campos_faltando.min(1), payload_portfolio=null
- handoff: dados_persistidos com 4 OBR non-nullable, dados_completos=literal(true), arrays vazios
- enviar_portfolio: payload_portfolio non-null
- erro: fallback amigavel

Schema strict no Responses API (token-level constrained decoding) torna
output invalido estruturalmente impossivel — invariantes saem do validator
pos-parse pro contrato do tipo.

Spec Caminho C Fase 1 secao 4.B."
```

---

## Task 8: `contracts/tattoo-handoff.js` — contrato cross-agent (TDD)

**Objetivo:** `TattooHandoffPayload` é o payload tipado que o router consome pra validar transição `tattoo → cadastro`. Espelha o que o `HandoffOutput.dados_persistidos` garante, mas existe como contrato explícito reusado pelo `router.js` (Princípio 2 do spec).

**Files:**
- Create: `functions/_lib/agent-runtime/contracts/tattoo-handoff.js`
- Create: `tests/_lib/agent-runtime/contracts/tattoo-handoff.test.mjs`

- [ ] **Step 1: Test failing**

```js
// tests/_lib/agent-runtime/contracts/tattoo-handoff.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TattooHandoffPayload,
  extractHandoffPayload,
} from '../../../../functions/_lib/agent-runtime/contracts/tattoo-handoff.js';

test('TattooHandoffPayload aceita 4 OBR + 3 opcionais nullable', () => {
  const ok = TattooHandoffPayload.safeParse({
    descricao_curta: 'rosa pequena',
    local_corpo: 'braco direito',
    altura_cm: 170,
    estilo: 'fineline',
    tamanho_cm: null,
    cor_preferencia: null,
    foto_local: null,
  });
  assert.equal(ok.success, true);
});

test('TattooHandoffPayload rejeita descricao_curta vazio', () => {
  const r = TattooHandoffPayload.safeParse({
    descricao_curta: '', local_corpo: 'x', altura_cm: 170, estilo: 'y',
    tamanho_cm: null, cor_preferencia: null, foto_local: null,
  });
  assert.equal(r.success, false);
});

test('TattooHandoffPayload rejeita altura_cm > 250', () => {
  const r = TattooHandoffPayload.safeParse({
    descricao_curta: 'x', local_corpo: 'y', altura_cm: 300, estilo: 'z',
    tamanho_cm: null, cor_preferencia: null, foto_local: null,
  });
  assert.equal(r.success, false);
});

test('extractHandoffPayload: handoff valido extrai payload', () => {
  const out = {
    proxima_acao: 'handoff',
    resposta_cliente: 'beleza',
    dados_persistidos: {
      descricao_curta: 'x', local_corpo: 'y', altura_cm: 170, estilo: 'z',
      tamanho_cm: null, cor_preferencia: null, foto_local: null,
    },
    dados_completos: true, campos_faltando: [], campos_conflitantes: [],
    payload_portfolio: null,
  };
  const payload = extractHandoffPayload(out);
  assert.equal(payload.descricao_curta, 'x');
  assert.equal(payload.altura_cm, 170);
});

test('extractHandoffPayload: proxima_acao !== handoff retorna null', () => {
  const out = { proxima_acao: 'pergunta', dados_persistidos: {} };
  assert.equal(extractHandoffPayload(out), null);
});

test('extractHandoffPayload: dados_persistidos invalido lanca ZodError', () => {
  const out = {
    proxima_acao: 'handoff',
    dados_persistidos: { descricao_curta: '' }, // invalido
  };
  assert.throws(() => extractHandoffPayload(out));
});
```

- [ ] **Step 2: Rodar — FAIL**

Run: `node --test tests/_lib/agent-runtime/contracts/tattoo-handoff.test.mjs`

- [ ] **Step 3: Implementar `tattoo-handoff.js`**

```js
// functions/_lib/agent-runtime/contracts/tattoo-handoff.js
// Contrato cross-agent: payload validado quando estado='tattoo' transiciona
// pra 'cadastro' via proxima_acao='handoff'.
//
// Espelha as garantias do branch HandoffOutput do TattooOutputSchema, mas
// existe como contrato explicito (Principio 2 spec Caminho C Fase 1):
// router consome pra validar pre-condicoes de transicao independente do
// schema do agent (separation of concerns).
import { z } from 'zod';

export const TattooHandoffPayload = z.object({
  descricao_curta: z.string().min(1),
  local_corpo: z.string().min(1),
  altura_cm: z.number().positive().max(250),
  estilo: z.string().min(1),
  tamanho_cm: z.number().positive().max(200).nullable(),
  cor_preferencia: z.string().nullable(),
  foto_local: z.string().nullable(),
});

export function extractHandoffPayload(tattooOutput) {
  if (!tattooOutput || tattooOutput.proxima_acao !== 'handoff') return null;
  return TattooHandoffPayload.parse(tattooOutput.dados_persistidos);
}
```

- [ ] **Step 4: Rodar — PASS**

Run: `node --test tests/_lib/agent-runtime/contracts/tattoo-handoff.test.mjs`
Expected: PASS — 6 testes.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/agent-runtime/contracts/tattoo-handoff.js tests/_lib/agent-runtime/contracts/tattoo-handoff.test.mjs
git commit -m "feat(agent-runtime): contracts/tattoo-handoff.js para validacao cross-agent

TattooHandoffPayload + extractHandoffPayload(out) consumidos pelo router
em validateTransition (Task 9). Espelha garantias do branch handoff do
TattooOutputSchema mas existe como contrato explicito.

Padrao replicavel pra Fase 2 (CadastroHandoffPayload, PropostaHandoffPayload).

Spec Caminho C Fase 1 secao 4.A Principio 2."
```

---

## Task 9: `tattoo.js` — `runTattooAgent` função pura (TDD com mock runtime)

**Objetivo:** REESCREVER `functions/api/agent/agents/tattoo.js`:
- **Remover:** `import { Agent } from '@openai/agents'`, `TattooOutputSchema` (movido pra `tattoo-schema.js` Task 7), `buildTattooAgent`, `validateTattooOutputInvariant` (não exporta mais), classe `Agent`.
- **Manter compat exports temporariamente:** re-exporta `TattooOutputSchema` e `validateTattooOutputInvariant` durante a transição pra não quebrar `tests/agent/tattoo-agent.test.mjs` em outras chamadas — REMOVE no fim da Task 11 após `tattoo-agent.test.mjs` ser reescrito.
- **Adicionar:** `runTattooAgent({ env, tenant, conversa, clientContext, mensagem, historico, openaiClient })` que chama `runtime.run`.

**Files:**
- Modify: `functions/api/agent/agents/tattoo.js` (reescrita completa)
- Create: `tests/agent/run-tattoo-agent.test.mjs` (testes da função pura, com mock runtime)

- [ ] **Step 1: Tests com mock runtime (failing)**

```js
// tests/agent/run-tattoo-agent.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { runTattooAgent } from '../../functions/api/agent/agents/tattoo.js';

const FAKE_TENANT = { id: 't1', nome_estudio: 'Estudio X', config_agente: {}, gatilhos_handoff: [], faqs: [], fewshots: [] };
const FAKE_CONVERSA = { id: 'c1', telefone: '+5511', estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };

function makeFakeClient(parsed) {
  return {
    responses: {
      create: async (params) => ({
        status: 'completed',
        output_parsed: parsed,
        _params: params,
      }),
    },
  };
}

test('runTattooAgent: retorna output parseado quando OpenAI responde', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta',
    resposta_cliente: 'qual o local?',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false,
    campos_faltando: ['local_corpo'],
    campos_conflitantes: [],
    payload_portfolio: null,
  });
  const out = await runTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT,
    conversa: FAKE_CONVERSA,
    clientContext: {},
    mensagem: 'quero uma tattoo',
    historico: [],
    openaiClient: fake,
  });
  assert.equal(out.proxima_acao, 'pergunta');
  assert.deepEqual(out.campos_faltando, ['local_corpo']);
});

test('runTattooAgent: monta input com historico + mensagem', async () => {
  let captured;
  const fake = {
    responses: {
      create: async (p) => {
        captured = p;
        return { status: 'completed', output_parsed: {
          proxima_acao: 'pergunta', resposta_cliente: 'x',
          dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
          dados_completos: false, campos_faltando: ['local_corpo'], campos_conflitantes: [],
          payload_portfolio: null,
        } };
      },
    },
  };
  await runTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    mensagem: 'mensagem nova',
    historico: [
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'oi, em que posso ajudar?' },
    ],
    openaiClient: fake,
  });
  // ultimo item do input deve ser a mensagem nova
  const last = captured.input[captured.input.length - 1];
  assert.equal(last.role, 'user');
  assert.equal(last.content, 'mensagem nova');
  assert.equal(captured.input.length, 3);
  // instructions deve conter prompt gerado (nao-vazio)
  assert.ok(captured.instructions && captured.instructions.length > 100);
  // modelo cravado em gpt-4o-mini
  assert.equal(captured.model, 'gpt-4o-mini');
});

test('runTattooAgent: schema strict aplicado em text.format', async () => {
  let captured;
  const fake = {
    responses: {
      create: async (p) => {
        captured = p;
        return { status: 'completed', output_parsed: {
          proxima_acao: 'pergunta', resposta_cliente: 'x',
          dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
          dados_completos: false, campos_faltando: ['local_corpo'], campos_conflitantes: [],
          payload_portfolio: null,
        } };
      },
    },
  };
  await runTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    mensagem: 'oi', historico: [], openaiClient: fake,
  });
  assert.equal(captured.text.format.type, 'json_schema');
  assert.equal(captured.text.format.strict, true);
  assert.equal(captured.text.format.name, 'tattoo_output');
});
```

- [ ] **Step 2: Rodar tests — FAIL (`runTattooAgent` não exportado)**

Run: `node --test tests/agent/run-tattoo-agent.test.mjs`

- [ ] **Step 3: Reescrever `tattoo.js` (substituição completa)**

```js
// functions/api/agent/agents/tattoo.js
// TattooAgent — Caminho C Fase 1. Funcao pura sem classe Agent.
//
// Antes (pre-fase1): builder pattern com @openai/agents SDK, validator
// pos-parse pra invariante handoff (4 OBR). HTTP 500 em 33% dos turnos
// criticos R9 (eval Sub 1.B/1.C falsificou que prompt ou modelo maior
// resolviam). Spike Sub 1.D falsificou @openai/agents SDK (rejeita
// discriminatedUnion via typeGuards.mjs:14).
//
// Agora: openai SDK puro + Responses API + schema strict discriminated
// union (constrained decoding token-level). Handoff sem 4 OBR e
// estruturalmente impossivel.
//
// Padrao spec Caminho C Fase 1 secao 4 — replicavel pros 2 agents
// restantes na Fase 2.
import { runtime } from '../../../_lib/agent-runtime/runtime.js';
import { generatePromptColetaTattoo } from '../../../_lib/prompts/coleta/tattoo/generate.js';
import { TattooOutputSchema as _Schema } from './tattoo-schema.js';

// Re-export pra compat com tests existentes (removido apos Task 11 reescrever
// tests/agent/tattoo-agent.test.mjs).
export const TattooOutputSchema = _Schema;

// Re-export do validator antigo durante a transicao. Apos Task 9 mergeada
// route.js NAO chama mais validator pro estado tattoo (schema strict garante
// invariante). Mas Cadastro/Proposta ainda chamam suas proprias validators —
// aqui mantemos so a referencia exportada caso algum test legado importe.
// CLEANUP final: remove no fim da Task 11.
export function validateTattooOutputInvariant(out) {
  // No-op compat: schema strict ja garante. Retorna sempre valid.
  if (!out || typeof out !== 'object') return { valid: false, reason: 'output ausente' };
  return { valid: true };
}

function normalizeHistoryItem(item) {
  // historico de conversa: pode vir com role+content ja shapeado, ou com
  // shape do Supabase (autor='cliente'|'bot' + texto). Normaliza pra OpenAI.
  if (item.role && item.content != null) return { role: item.role, content: item.content };
  if (item.autor && item.texto != null) {
    return { role: item.autor === 'cliente' ? 'user' : 'assistant', content: item.texto };
  }
  return item;
}

export async function runTattooAgent({
  env,
  tenant,
  conversa,
  clientContext,
  mensagem,
  historico,
  openaiClient,
}) {
  const ctx = clientContext || {};
  const instructions = generatePromptColetaTattoo(tenant, conversa, ctx);

  const input = [
    ...((historico || []).map(normalizeHistoryItem)),
    { role: 'user', content: mensagem },
  ];

  return await runtime.run({
    apiKey: env.OPENAI_API_KEY,
    openaiClient,
    model: 'gpt-4o-mini',
    instructions,
    input,
    outputSchema: TattooOutputSchema,
    schemaName: 'tattoo_output',
  });
}
```

- [ ] **Step 4: Rodar tests novos — PASS**

Run: `node --test tests/agent/run-tattoo-agent.test.mjs`
Expected: PASS — 3 testes.

- [ ] **Step 5: Rodar `tattoo-agent.test.mjs` antigo, verificar quais falham**

Run: `node --test tests/agent/tattoo-agent.test.mjs`
Expected: alguns FAIL (`buildTattooAgent` removido) — anotar quais; reescritos na Task 11.

- [ ] **Step 6: Grep pra confirmar ausência de `@openai/agents` em tattoo.js**

Run: `grep -n '@openai/agents' functions/api/agent/agents/tattoo.js`
Expected: zero hits.

- [ ] **Step 7: Commit**

```bash
git add functions/api/agent/agents/tattoo.js tests/agent/run-tattoo-agent.test.mjs
git commit -m "refactor(tattoo): runTattooAgent funcao pura, sai do @openai/agents SDK

Substitui buildTattooAgent (classe Agent + validator closure) por
runTattooAgent({env, tenant, conversa, clientContext, mensagem, historico}).
Chama runtime.run() (openai SDK puro + Responses API + schema strict).

Schema migrado pra tattoo-schema.js (discriminated union). validator
pos-parse vira no-op compat (schema strict garante invariantes).

tests/agent/tattoo-agent.test.mjs ainda quebrado — reescrito na Task 11.

Spec Caminho C Fase 1 secao 4.A Principio 3 + secao 4.B."
```

---

## Task 10: `router.js` — `validateTransition` + `HANDOFF_CONTRACTS`

**Objetivo:** Adicionar `validateTransition(estado_atual, out)` que consome `HANDOFF_CONTRACTS[estado_atual]` pra garantir que payload de handoff é parsable contra o contrato. **Não muda** `getNextState` nem `selectAgentBuilder`.

**Files:**
- Modify: `functions/api/agent/router.js`
- Create: `tests/agent/router-validate-transition.test.mjs`

- [ ] **Step 1: Test failing**

```js
// tests/agent/router-validate-transition.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTransition } from '../../functions/api/agent/router.js';

test('validateTransition: tattoo + handoff valido retorna payload extraido', () => {
  const out = {
    proxima_acao: 'handoff',
    resposta_cliente: 'beleza',
    dados_persistidos: {
      descricao_curta: 'rosa', local_corpo: 'braco', altura_cm: 170, estilo: 'fineline',
      tamanho_cm: null, cor_preferencia: null, foto_local: null,
    },
    dados_completos: true, campos_faltando: [], campos_conflitantes: [],
    payload_portfolio: null,
  };
  const payload = validateTransition('tattoo', out);
  assert.equal(payload.descricao_curta, 'rosa');
  assert.equal(payload.altura_cm, 170);
});

test('validateTransition: proxima_acao != handoff retorna null', () => {
  const payload = validateTransition('tattoo', { proxima_acao: 'pergunta' });
  assert.equal(payload, null);
});

test('validateTransition: estado sem contrato (cadastro Fase 2) retorna null', () => {
  const payload = validateTransition('cadastro', { proxima_acao: 'handoff', dados_persistidos: {} });
  assert.equal(payload, null);
});

test('validateTransition: handoff com payload invalido lanca', () => {
  const out = {
    proxima_acao: 'handoff',
    dados_persistidos: { descricao_curta: '', local_corpo: 'x', altura_cm: 170, estilo: 'y', tamanho_cm: null, cor_preferencia: null, foto_local: null },
  };
  assert.throws(() => validateTransition('tattoo', out));
});
```

- [ ] **Step 2: Rodar — FAIL (`validateTransition` não exportado)**

Run: `node --test tests/agent/router-validate-transition.test.mjs`

- [ ] **Step 3: Modificar `router.js`**

Lê o arquivo primeiro: `Read functions/api/agent/router.js`.

Adiciona ao final do arquivo (depois dos exports atuais):

```js
// ─── Caminho C Fase 1: contratos cross-agent + validateTransition ──────
// HANDOFF_CONTRACTS mapeia estado origem → { extract(out) } onde extract
// valida o payload contra o contrato tipado e retorna o objeto extraido
// (ou throw se invalido).
//
// Fase 1: apenas tattoo. Fase 2 adiciona cadastro e proposta.
import { extractHandoffPayload as extractTattooHandoff } from '../../_lib/agent-runtime/contracts/tattoo-handoff.js';

const HANDOFF_CONTRACTS = {
  tattoo: { extract: extractTattooHandoff },
  // cadastro: { extract: extractCadastroHandoff }, // Fase 2
  // proposta: { extract: extractPropostaHandoff }, // Fase 2 (3 substates)
};

export function validateTransition(estado_atual, out) {
  if (!out || out.proxima_acao !== 'handoff') return null;
  const contract = HANDOFF_CONTRACTS[estado_atual];
  if (!contract) return null;
  return contract.extract(out);
}
```

- [ ] **Step 4: Rodar tests novos — PASS**

Run: `node --test tests/agent/router-validate-transition.test.mjs`
Expected: PASS — 4 testes.

- [ ] **Step 5: Rodar tests existentes do router pra garantir zero regressão**

Run: `node --test tests/agent/router.test.mjs`
Expected: PASS (igual ao baseline).

- [ ] **Step 6: Commit**

```bash
git add functions/api/agent/router.js tests/agent/router-validate-transition.test.mjs
git commit -m "feat(router): adiciona validateTransition + HANDOFF_CONTRACTS

router.validateTransition(estado_atual, out) consome contratos tipados em
HANDOFF_CONTRACTS pra validar payload de handoff. Fase 1: so 'tattoo'.
Fase 2 adiciona cadastro + proposta.

LLM declara proxima_acao no output (schema strict); router valida payload
contra contrato; ZodError em violation. State machine continua no router
(linha original getNextState intocada).

Spec Caminho C Fase 1 secao 4.A Principio 4."
```

---

## Task 11: `route.js` — branch novo path pro estado `tattoo` + reescrita do test legado

**Objetivo:** No `runAgent()` (route.js linha ~90-235), envolver o trecho atual em `if (estado_atual === 'tattoo') { /* path novo */ } else { /* path antigo intocado */ }`. Cadastro/Proposta continuam usando `selectAgentBuilder` + `run(agent, ...)` sem modificação. Tattoo passa por `runTattooAgent` + `validateTransition`.

Em paralelo, reescrever `tests/agent/tattoo-agent.test.mjs` pro padrão novo (substituir tests de `buildTattooAgent` por `runTattooAgent`, remover testes que dependem da classe `Agent`).

**Files:**
- Modify: `functions/api/agent/route.js` (linhas ~100-180)
- Modify: `tests/agent/tattoo-agent.test.mjs` (reescrita completa OU deletada se `run-tattoo-agent.test.mjs` cobre tudo)

- [ ] **Step 1: Reler `route.js` linhas 80-200 pra cravar a edição**

Run: `Read functions/api/agent/route.js offset=80 limit=120`

- [ ] **Step 2: Editar `route.js` envolvendo o trecho num branch**

Onde está hoje (route.js:101-178 aproximadamente):
```js
const t0 = Date.now();
const builder = selectAgentBuilder(estado_atual);
let mergedClientContext = clientContext || {};
// ... portfolio + proposta prefetch ...
const { agent, validator } = builder({ env, tenant, conversa, clientContext: mergedClientContext, estado_atual });
const messages = [...historico.map(normalizeHistoryItem), { role: 'user', content: mensagem }];
let result;
try {
  result = await run(agent, messages, { maxTurns: 20 });
} catch (e) { /* ... */ }
const out = result?.finalOutput;
if (!out) { /* ... */ }
let working = out;
const invariantCheck = validator(working);
if (!invariantCheck.valid) { /* silently force pergunta logic */ }
```

Vira (com novo branch tattoo + path antigo preservado pros outros):
```js
const t0 = Date.now();
let mergedClientContext = clientContext || {};
const portfolioCtx = await prefetchPortfolio(env, tenant);
mergedClientContext = { ...mergedClientContext, ...portfolioCtx };
if (PROPOSTA_SUBSTATES.has(estado_atual)) {
  const prefetched = await prefetchPropostaContext({ env, tenant, conversa, telefone, estado_atual });
  mergedClientContext = { ...mergedClientContext, ...prefetched };
}

let working;
if (estado_atual === 'tattoo') {
  // ─── Caminho C Fase 1: path novo, schema strict ─────────────────────
  let out;
  try {
    out = await runTattooAgent({
      env, tenant, conversa, clientContext: mergedClientContext,
      mensagem, historico,
    });
  } catch (e) {
    // Todos os retries falharam (network down, 401, context_length, etc).
    // UX: cliente nao recebe HTTP 500 — recebe mensagem amigavel.
    // Telemetria: erro detalhado logado pra ops investigar.
    console.error('[agent/route] runTattooAgent exhausted retries:', {
      message: e.message, status: e.status, code: e.code,
    });
    out = buildFallbackOutput('tattoo');
  }
  // Schema strict garante shape valido — sem validator pos-parse.
  // Valida payload do handoff contra contrato cross-agent.
  if (out.proxima_acao === 'handoff') {
    try {
      validateTransition('tattoo', out);
    } catch (e) {
      console.error('[agent/route] handoff contract violation:', e);
      return { ok: false, error: 'invariant-violation', reason: e.message, status: 500 };
    }
  }
  working = out;
} else {
  // ─── Path antigo: cadastro, proposta (intocado ate Fase 2) ──────────
  const builder = selectAgentBuilder(estado_atual);
  const { agent, validator } = builder({ env, tenant, conversa, clientContext: mergedClientContext, estado_atual });
  const messages = [...historico.map(normalizeHistoryItem), { role: 'user', content: mensagem }];
  let result;
  try {
    result = await run(agent, messages, { maxTurns: 20 });
  } catch (e) {
    console.error('[agent/route] run() failed:', e);
    return { ok: false, error: 'agent-run-failed', status: 500 };
  }
  const out = result?.finalOutput;
  if (!out) {
    console.error('[agent/route] no finalOutput', { result });
    return { ok: false, error: 'no-final-output', status: 500 };
  }
  working = out;
  const invariantCheck = validator(working);
  if (!invariantCheck.valid) {
    if (estado_atual === 'cadastro' && invariantCheck.reason?.startsWith('data_nascimento nao-ISO')) {
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
      console.warn('[agent/route] silently force pergunta (slot invalido):', invariantCheck.reason);
      const slots = mergedClientContext.horarios_livres || [];
      const legendas = slots.map(s => s.legenda).join(', ') || '(nenhum slot disponivel)';
      const msg = invariantCheck.reason.startsWith('slot fora')
        ? `Esse horario nao esta na lista — escolhe um destes? ${legendas}`
        : `Nao consegui ler o horario — pode escolher um da lista? ${legendas}`;
      working = { ...working, proxima_acao: 'pergunta', resposta_cliente: msg };
    } else {
      console.error('[agent/route] invariant violation:', invariantCheck.reason, out);
      return { ok: false, error: 'invariant-violation', reason: invariantCheck.reason, status: 500 };
    }
  }
}
```

Importações no topo do arquivo (linhas ~10-30): adicionar `runTattooAgent`, `validateTransition`, `buildFallbackOutput`:

```js
import { runTattooAgent } from './agents/tattoo.js';
import { validateTransition } from './router.js';
import { buildFallbackOutput } from '../../_lib/agent-runtime/fallbacks.js';
```

(Confirmar que o import existente de `selectAgentBuilder` continua — Cadastro/Proposta usam.)

- [ ] **Step 3: Reescrever `tests/agent/tattoo-agent.test.mjs`**

Substituir conteúdo completo por um suite enxuto que valida só o que ainda faz sentido (re-exports de compat + `runTattooAgent` via mock):

```js
// tests/agent/tattoo-agent.test.mjs
// Tests do TattooAgent pos-Caminho-C-Fase-1.
//
// buildTattooAgent foi removido. Tests de schema completos vivem em
// tests/agent/tattoo-schema.test.mjs. Tests de runtime vivem em
// tests/agent/run-tattoo-agent.test.mjs. Aqui ficam tests de smoke do
// modulo (re-exports de compat) — eventual remocao quando o codigo
// callsite dos re-exports for limpo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TattooOutputSchema, runTattooAgent, validateTattooOutputInvariant } from '../../functions/api/agent/agents/tattoo.js';

test('TattooOutputSchema esta exportado (compat)', () => {
  assert.ok(TattooOutputSchema && typeof TattooOutputSchema.safeParse === 'function');
});

test('runTattooAgent esta exportado', () => {
  assert.equal(typeof runTattooAgent, 'function');
});

test('validateTattooOutputInvariant compat retorna valid:true sempre que input shape valido', () => {
  const r = validateTattooOutputInvariant({ proxima_acao: 'pergunta' });
  assert.equal(r.valid, true);
});
```

- [ ] **Step 4: Rodar suite inteira**

Run: `node --test tests/agent/ tests/_lib/agent-runtime/`
Expected: PASS — todos os tests.

- [ ] **Step 5: Smoke do route.js manualmente (sem chamar OpenAI real ainda)**

```bash
# Confirma que o modulo carrega sem erro de sintaxe
node --input-type=module -e "import('./functions/api/agent/route.js').then(m => console.log('OK', Object.keys(m)))"
```
Expected: prints `OK [ 'runAgent', 'onRequest', ... ]` (depende dos exports do arquivo).

- [ ] **Step 6: Grep final — TattooAgent zero deps em `@openai/agents`**

Run: `grep -n '@openai/agents' functions/api/agent/agents/tattoo.js`
Expected: zero hits (DoD bullet do spec confirmado).

- [ ] **Step 7: Commit**

```bash
git add functions/api/agent/route.js tests/agent/tattoo-agent.test.mjs
git commit -m "feat(route): branch novo path pra estado tattoo (Caminho C Fase 1)

route.runAgent() agora bifurca por estado_atual:
- estado === 'tattoo': runTattooAgent (openai SDK puro + schema strict) +
  validateTransition em handoff. Sem validator pos-parse, sem silently
  force pergunta — schema garante.
- estado in {cadastro, proposta}: path antigo intocado (selectAgentBuilder
  + @openai/agents). Sera migrado em Fase 2.

tests/agent/tattoo-agent.test.mjs reescrito (suite enxuta de smoke);
testes completos em tattoo-schema.test.mjs e run-tattoo-agent.test.mjs.

DoD bullet: grep @openai/agents em tattoo.js retorna vazio."
```

---

## Task 12: Integration test `agent-tattoo-handoff.test.mjs`

**Objetivo:** Teste de integração ponta-a-ponta (mockando OpenAI client) que simula `runAgent({ estado_atual: 'tattoo', ... })` retornando handoff válido e confirma que `validateTransition` aceita o payload, telemetria é logada, e estado próximo (`cadastro`) é calculado. NÃO chama OpenAI real — usa mock injectado via DI.

**Files:**
- Create: `tests/integration/agent-tattoo-handoff.test.mjs`

- [ ] **Step 1: Decidir DI strategy pro mock**

`route.runAgent()` instancia o cliente OpenAI dentro de `runTattooAgent → runtime.run`. Pra testar sem chamar OpenAI, opções:
- **A:** Injectar `openaiClient` via `runAgent` param (adicionar arg opcional).
- **B:** Mock global via `globalThis` (mais frágil).

Escolha: **A**. Adicionar param opcional em `runAgent({ ..., openaiClient })` que é repassado pra `runTattooAgent`. Default `undefined` → produção continua igual.

- [ ] **Step 2: Adicionar param `openaiClient` em `runAgent` (route.js)**

Edit `functions/api/agent/route.js`:

Antiga linha (signature de runAgent):
```js
export async function runAgent({
  env, mensagem, telefone, historico, tenant, estado_atual, conversa, clientContext,
}) {
```

Nova:
```js
export async function runAgent({
  env, mensagem, telefone, historico, tenant, estado_atual, conversa, clientContext,
  openaiClient, // Caminho C Fase 1: DI pra testes do path tattoo
}) {
```

E no branch tattoo (do Task 11):
```js
out = await runTattooAgent({
  env, tenant, conversa, clientContext: mergedClientContext,
  mensagem, historico,
  openaiClient, // <-- repassado
});
```

- [ ] **Step 3: Escrever o integration test**

```js
// tests/integration/agent-tattoo-handoff.test.mjs
// Integration test ponta-a-ponta do path novo (Caminho C Fase 1) pra
// estado_atual='tattoo'. Mocka openai client; valida que:
// - runAgent retorna ok:true com out.proxima_acao='handoff' valido
// - payload de handoff e validavel pelo TattooHandoffPayload contract
// - estado proximo via router.getNextState === 'cadastro'
//
// NAO chama OpenAI real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../../functions/api/agent/route.js';
import { getNextState, validateTransition } from '../../functions/api/agent/router.js';

const FAKE_TENANT = {
  id: 't1', nome_estudio: 'Estudio X',
  config_agente: { aceita_cobertura: true },
  gatilhos_handoff: [], faqs: [], fewshots: [],
};
const FAKE_CONVERSA = {
  id: 'c1', telefone: '+5511999999999',
  estado_agente: 'coletando_tattoo',
  dados_coletados: {}, dados_cadastro: {},
};
const FAKE_ENV = {
  OPENAI_API_KEY: 'sk-test',
  // Bindings Supabase: integration test nao deve falhar se telemetria nao
  // alcanca o servidor real. Confirme que logAgentTurn e fire-and-forget.
  SUPABASE_URL: 'http://localhost:9999',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
};

function makeFakeHandoffClient() {
  return {
    responses: {
      create: async () => ({
        status: 'completed',
        output_parsed: {
          proxima_acao: 'handoff',
          resposta_cliente: 'Show, ja anotei tudo. Vou te passar pra cadastro.',
          dados_persistidos: {
            descricao_curta: 'rosa pequena traco fino',
            local_corpo: 'braco direito',
            altura_cm: 170,
            estilo: 'fineline',
            tamanho_cm: 5,
            cor_preferencia: 'preto',
            foto_local: null,
          },
          dados_completos: true,
          campos_faltando: [],
          campos_conflitantes: [],
          payload_portfolio: null,
        },
      }),
    },
  };
}

test('runAgent estado=tattoo handoff valido: ok + estado proximo cadastro', async () => {
  const result = await runAgent({
    env: FAKE_ENV,
    mensagem: 'Quero uma rosa pequena no braco direito, sou 1.70m, traco fino',
    telefone: '+5511999999999',
    historico: [],
    tenant: FAKE_TENANT,
    estado_atual: 'tattoo',
    conversa: FAKE_CONVERSA,
    clientContext: {},
    openaiClient: makeFakeHandoffClient(),
  });

  assert.equal(result.ok, true, `runAgent retornou ok=false: ${result.error}`);
  assert.equal(result.out.proxima_acao, 'handoff');
  assert.equal(result.out.dados_persistidos.altura_cm, 170);

  // Contrato extraivel
  const payload = validateTransition('tattoo', result.out);
  assert.equal(payload.descricao_curta, 'rosa pequena traco fino');

  // Estado proximo
  const proximo = getNextState('tattoo', result.out);
  assert.equal(proximo, 'cadastro');
});

test('runAgent estado=tattoo pergunta: ok + estado proximo permanece tattoo', async () => {
  const fakeClient = {
    responses: {
      create: async () => ({
        status: 'completed',
        output_parsed: {
          proxima_acao: 'pergunta',
          resposta_cliente: 'Em qual parte do corpo voce quer?',
          dados_persistidos: {
            estilo: 'fineline', tamanho_cm: null, altura_cm: 170,
            local_corpo: null, cor_preferencia: null, descricao_curta: 'rosa',
            foto_local: null,
          },
          dados_completos: false,
          campos_faltando: ['local_corpo'],
          campos_conflitantes: [],
          payload_portfolio: null,
        },
      }),
    },
  };
  const result = await runAgent({
    env: FAKE_ENV, mensagem: 'quero rosa', telefone: '+5511999',
    historico: [], tenant: FAKE_TENANT, estado_atual: 'tattoo',
    conversa: FAKE_CONVERSA, clientContext: {},
    openaiClient: fakeClient,
  });
  assert.equal(result.ok, true);
  assert.equal(result.out.proxima_acao, 'pergunta');
  assert.equal(getNextState('tattoo', result.out), 'tattoo');
});
```

- [ ] **Step 4: Rodar test, ver que passa**

Run: `node --test tests/integration/agent-tattoo-handoff.test.mjs`
Expected: PASS — 2 testes.

Se falhar com `result.out is undefined`: confirmar shape do retorno de `runAgent` (provavelmente é `{ ok, out, sideEffects, ... }`). Lê `route.js` perto da linha 230 (return final do runAgent) e ajusta o assert.

- [ ] **Step 5: Rodar a suite inteira**

Run: `node --test tests/ functions/`
Expected: tudo PASS. Se houver fail em algum test legado, anotar e revisar.

- [ ] **Step 6: Commit**

```bash
git add functions/api/agent/route.js tests/integration/agent-tattoo-handoff.test.mjs
git commit -m "test(integration): agent-tattoo-handoff cobre path novo end-to-end

runAgent(estado='tattoo') com openai client mockado retornando handoff valido:
- ok=true
- payload extraivel via validateTransition + TattooHandoffPayload
- getNextState retorna 'cadastro'

Cenario 'pergunta' tambem coberto (estado permanece tattoo).

DI: adiciona param opcional openaiClient em runAgent pra testes sem chamar
OpenAI. Producao continua igual (default undefined -> new OpenAI({apiKey}))."
```

---

## Task 13: Eval re-baseline pós-Fase 1 + DoD + PR

**Objetivo:** Rodar o eval harness completo no branch nova, comparar com baseline da Task 2, validar DoD, abrir PR.

**Files:**
- Create: `docs/inkflow-agent/reports/2026-05-17-eval-post-fase1.md`

- [ ] **Step 1: Confirmar suite local 100% verde**

Run:
```bash
node --test tests/
```
Expected: 0 failures.

- [ ] **Step 2: Rodar eval harness — 3 personas TattooAgent (2 runs cada pra estatística)**

```bash
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo --persona=PER-001
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo --persona=PER-009
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo --persona=PER-010
# 2a rodada (paridade Sub 1.B/1.C):
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo --persona=PER-001
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo --persona=PER-009
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo --persona=PER-010
```

**DoD esperado (spec secao 8):**
- 0/6 HTTP 500 (vs 2/6 no baseline)
- 3/3 evals passam thresholds (nat ≥ 3.8 ou 4.2, manif ≥ 0.83)
- Custo total ≤ $2.00

- [ ] **Step 3: Smoke nos outros 2 agents (zero regressão Cadastro/Proposta)**

```bash
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=cadastro --persona=PER-001
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=proposta --persona=PER-001
```
Expected: mesmos números do baseline Task 2.

- [ ] **Step 4: Escrever report pós-Fase 1**

Crie `docs/inkflow-agent/reports/2026-05-17-eval-post-fase1.md` com:
- timestamp + sha do branch
- comando rodado
- output completo (status, score, motivos de fail se houver)
- comparação tabela com baseline da Task 2 (antes vs depois)
- soma de HTTP 500 (espera 0/6)
- custo total
- DoD checklist completo do spec secao 8 com ✅/❌

- [ ] **Step 5: Verificar DoD checklist do spec inteiro**

Run os greps do DoD:
```bash
grep -r '@openai/agents' functions/api/agent/agents/tattoo.js
# expected: vazio

node --test tests/_lib/agent-runtime/retry.test.mjs
node --test tests/_lib/agent-runtime/schema-to-json.test.mjs
node --test tests/_lib/agent-runtime/runtime.test.mjs
node --test tests/_lib/agent-runtime/fallbacks.test.mjs
node --test tests/_lib/agent-runtime/contracts/tattoo-handoff.test.mjs
node --test tests/agent/tattoo-schema.test.mjs
node --test tests/agent/run-tattoo-agent.test.mjs
node --test tests/agent/router-validate-transition.test.mjs
node --test tests/integration/agent-tattoo-handoff.test.mjs
# todos: PASS
```

- [ ] **Step 6: Commit do report**

```bash
git add docs/inkflow-agent/reports/2026-05-17-eval-post-fase1.md
git commit -m "docs(fase-1): eval re-baseline pos-Caminho-C-Fase-1 (0/6 HTTP 500, 3/3 pass)

Comparativo:
- Pre-Fase-1: 2/6 HTTP 500, PER-009/PER-010 fail
- Pos-Fase-1: 0/6 HTTP 500, 3/3 pass (PER-001/PER-009/PER-010)

Custo eval: \$X.XX (≤\$2 DoD spec). Smoke Cadastro/Proposta: zero regressao.

DoD spec secao 8 — todos os bullets ✅."
```

- [ ] **Step 7: Abrir PR**

```bash
git push -u origin feat/caminho-c-fase1-tattoo-strict
gh pr create --title "feat(agent): Caminho C Fase 1 — TattooAgent strict schema refactor" --body "$(cat <<'EOF'
## Summary
- Migra TattooAgent de `@openai/agents` SDK pra `openai` SDK puro + Responses API + `response_format: { type:'json_schema', strict:true }`
- `TattooOutputSchema` vira `z.discriminatedUnion('proxima_acao', [pergunta, handoff, enviar_portfolio, erro])` — invariantes (4 OBR no handoff, etc) passam a ser **estruturalmente impossiveis** de violar
- Novo modulo `_lib/agent-runtime/` (runtime + retry + schema-to-json + contracts + fallbacks) reusavel pros 2 agents restantes na Fase 2
- Cadastro/Proposta **intocados** (continuam com `@openai/agents` ate Fase 2)

## Spec
- `docs/superpowers/specs/2026-05-17-caminho-c-fase1-tattoo-strict-schema-design.md`
- Plan: `docs/superpowers/plans/2026-05-17-caminho-c-fase1-tattoo-strict-schema.md`

## Eval (DoD spec secao 8)
- HTTP 500 rate: 2/6 → **0/6** ✅
- Pass rate: 1/3 → **3/3** ✅
- Cadastro/Proposta smoke: zero regressao ✅
- Custo eval: \$X.XX (≤\$2.00) ✅
- Report completo: `docs/inkflow-agent/reports/2026-05-17-eval-post-fase1.md`

## Trade-offs
- `validateTattooOutputInvariant` virou no-op compat (schema strict garante). Removivel em Fase 2.
- `@openai/agents` continua em `package.json` durante coexistencia — cleanup final quando Fase 2 mergiar Cadastro/Proposta.
- `openai` SDK adicionado como dep direta.

## Test plan
- [ ] CI verde (toda a suite + novos tests)
- [ ] Smoke manual via WhatsApp pipeline em staging (1 persona PER-010 que era a mais flaky)
- [ ] Confirmar logs telemetria turn-level continuam chegando em Supabase

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 8: Validar que CI passa**

Aguarda CI rodar; se vermelho, fix + push novo commit. Não amend.

---

## Notas finais sobre execução

- **Tempo total estimado:** 6-8h (paridade com a estimativa do spec secao 10).
- **Custo OpenAI:** ≤$2.05 total (spike $0.05 + baseline $1.50 + re-baseline $1.50 — alguns custos sobrepostos quando reusar runs).
- **Pontos de parada críticos:**
  - Após Task 1: se spike falhar, PARAR e refazer design.
  - Após Task 9: confirmar que `runTattooAgent` carrega sem erro (smoke import).
  - Após Task 12: rodar suite completa antes de partir pra eval (eval gasta $).
- **Sub-tasks deletáveis se DoD permitir:** Task 6 (fallbacks) é "nice-to-have" — se o tempo apertar, dá pra adiar pra Fase 2 (mas atrapalha telemetria de erros se omitido). Manter.

**Pós-merge:** Fase 2 ganha plan separado replicando o padrão pros 2 agents restantes + cleanup do `@openai/agents` em `package.json`.
