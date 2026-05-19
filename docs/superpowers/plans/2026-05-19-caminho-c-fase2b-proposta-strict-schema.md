# Caminho C — Fase 2B: PropostaAgent strict schema + cleanup total `@openai/agents` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar o padrão Fase 1/2A (PR #71 Tattoo + PR #75 Cadastro, mergeado hoje 19/05 via squash 7b01fcb) ao **PropostaAgent** — última peça customer-facing que ainda usa `@openai/agents`. Cleanup completo no MESMO PR: remove `LegacyCadastroOutputSchema`, migra todos os 3 evals pro path novo (`runtime.run` + schema strict), remove `buildCadastroAgent`/`buildPropostaAgent`/`selectAgentBuilder`/`BUILDERS` do router, remove `setDefaultOpenAIKey` de route.js + whatsapp-pipeline.js, `npm uninstall @openai/agents`. Gate: `grep -r '@openai/agents' functions/ tests/` retorna vazio.

**Architecture:** PropostaAgent vira `runPropostaAgent({ env, tenant, conversa, clientContext, mensagem, historico, estado_atual, openaiClient })` que despacha pra **1 de 3 schemas** (`PropostaPropondoValorSchema` / `PropostaEscolhendoHorarioSchema` / `PropostaAguardandoSinalSchema`) via `SCHEMA_BY_STATE` map. Cada schema é discriminated union strict que injeta `ALLOWED_BY_STATE` no `proxima_acao` — LLM **estruturalmente não consegue** emitir ação proibida pro substate (vs. validator pós-parse atual). Contratos cross-action consolidados em **1 arquivo** `proposta-actions.js` com discriminated union de 3 branches (`reservar_horario`, `pediu_desconto`, `enviar_portfolio` delegando pra `PortfolioIntentSchema` existente) + 1 função `extractPropostaAction(out, ctx)` — espelha padrão Fase 2A (1 contract file por agent, não N extracts separados). Router generaliza `validateTransition` → `validateAction(estado_atual, out, ctx)` cobrindo tattoo handoff + cadastro handoff + proposta-por-substate. TC-P09 (P2 backlog 2026-05-09) resolvido via pre-fetch enriquecido: `prefetchPropostaContext` busca `slots_reservados` quando `estado=aguardando_sinal`, e `extractPropostaAction` aceita slot em `horarios_livres` OR `slots_reservados`.

**Tech Stack:** OpenAI SDK puro (`openai@^4`) + `zodResponseFormat` (`openai/helpers/zod`), Zod `^3.23`, runtime existente `functions/_lib/agent-runtime/runtime.js` (envelope `z.object({ output: schema })` já tratado internamente), Cloudflare Pages Functions, `node --test` + `node:assert/strict`, eval harness atual.

**Spec source:** `docs/superpowers/specs/2026-05-18-caminho-c-fase2-cadastro-proposta-strict-schema-design.md` (parte Proposta, seções 2.2/2.3/2.4/2.5/4.B/4.C/4.D + decisões cravadas 19/05 parte 2)

**Templates:** PR #71 Tattoo (`docs/superpowers/plans/2026-05-17-caminho-c-fase1-tattoo-strict-schema.md`) + PR #75 Cadastro (squash 7b01fcb mergeado 19/05).

---

## File Structure

**Novos arquivos:**
- `functions/api/agent/agents/proposta-schema.js` — 3 schemas (1 por substate), cada um discriminated union de actions permitidas + erro
- `functions/_lib/agent-runtime/contracts/proposta-actions.js` — `PropostaActionPayloadSchema` (discriminated union 3 branches) + `extractPropostaAction(out, ctx)`
- `tests/agent/proposta-schema.test.mjs` — unit tests dos 3 schemas (rejeita action fora do substate, slot non-ISO, valor negativo, etc.)
- `tests/agent/run-proposta-agent.test.mjs` — unit tests do `runPropostaAgent` (mock `openaiClient`, paridade `run-cadastro-agent.test.mjs`)
- `tests/_lib/agent-runtime/contracts/proposta-actions.test.mjs` — unit tests do contract (aceita/rejeita por shape, slot em horarios_livres OR slots_reservados)
- `tests/agent/prefetch-proposta-context.test.mjs` — confirma que `aguardando_sinal` agora retorna `slots_reservados` no ctx
- `tests/agent/_spike-fase2b-multi-schema.mjs` — spike pré-PR validando 3 schemas distintos no mesmo runtime + slot ISO regex strict

**REESCRITOS:**
- `functions/api/agent/agents/proposta.js` — vira função pura `runPropostaAgent` (sem `@openai/agents`)
- `functions/api/agent/agents/cadastro.js` — remove `LegacyCadastroOutputSchema`, `buildCadastroAgent`, `validateCadastroOutputInvariant`, import `@openai/agents`
- `tests/agent/cadastro-agent.eval.mjs` — migra pra `runCadastroAgent` + `CadastroOutputSchema` strict
- `tests/agent/proposta-agent.eval.mjs` — migra pra `runPropostaAgent` + 3 schemas
- `tests/agent/tattoo-agent.eval.mjs` — migra pra `runTattooAgent` + `TattooOutputSchema` strict
- `tests/agent/proposta-validator.test.mjs` — REESCRITO contra novos schemas (renomeado pra `proposta-schema.test.mjs` no Task 2 e arquivo antigo deletado no Task 11)

**Modificados:**
- `functions/api/agent/router.js` — substitui `HANDOFF_CONTRACTS`/`validateTransition` por `ACTION_CONTRACTS`/`validateAction(estado_atual, out, ctx)`; remove `BUILDERS`/`selectAgentBuilder` + imports `buildCadastroAgent`/`buildPropostaAgent`
- `functions/api/agent/route.js` — adiciona branch `if (PROPOSTA_SUBSTATES.has(estado_atual))` chamando `runPropostaAgent`; remove `else` legado (path antigo proposta com `selectAgentBuilder`); remove imports `run`/`setDefaultOpenAIKey` de `@openai/agents`; renomeia `validateTransition` → `validateAction` nos call-sites tattoo/cadastro
- `functions/api/agent/_lib/prefetch-proposta.js` — adiciona `slots_reservados` ao ctx quando `estado_atual=aguardando_sinal` (TC-P09 fix)
- `functions/api/agent/_lib/sdk-init.js` — atualiza comment header (remove menção ao `@openai/agents`)
- `functions/_lib/whatsapp-pipeline.js` — remove `import { setDefaultOpenAIKey } from '@openai/agents-openai'` + chamada (não-necessária; `runtime.run` injeta key explícita)
- `tests/agent/router-validate-transition.test.mjs` — testes renomeados pra `validateAction`, adicionados casos pra proposta
- `package.json` — `npm uninstall @openai/agents` (depois `@openai/agents-openai` se vier como transitive)
- `package-lock.json` — atualizado pelo uninstall

**DELETADOS:**
- `tests/agent/proposta-validator.test.mjs` — testes do validator pós-parse antigo (`validatePropostaOutputInvariant`); substituído por `proposta-schema.test.mjs` (Task 2-4) + `proposta-actions.test.mjs` (Task 5)
- `scripts/spike-openai-agents.mjs` — spike de Sub 1.D obsoleto (Fase 1/2A já falsificaram SDK; arquivo só importa `@openai/agents` pra histórico)

---

## Riscos sinalizados (ler antes de executar)

- **Risco arquitetural Task 1 mitiga:** Fase 2A spike (`_spike-fase2a-regex-strict.mjs`) validou regex ISO + nullable. Fase 2B precisa validar **3 schemas distintos no mesmo runtime** + **regex ISO em campos de slot** (`slot_inicio`/`slot_fim` em vez de `data_nascimento`). Task 1 spike confirma em isolamento por ~$0.05. Se falhar, PAUSA e re-cravar design.
- **Custo eval re-baseline (Task 17):** 3 agents × ~6 personas média × 2 runs × $0.04 ≈ ~$1.50. Cap rígido $3 (spec section 6.3). Aborta se passar.
- **Breaking change `setDefaultOpenAIKey` removido:** `route.js` (line 357) e `whatsapp-pipeline.js` (line 6) chamavam. Antes da remoção, **confirmar que runtime.run injeta key via `apiKey: env.OPENAI_API_KEY`** em todos os 3 agents — Task 15 inclui grep + smoke local.
- **TC-P09 fix depende de tool `listar-agendamentos-ativos`:** Pre-fetch `slots_reservados` vai chamar uma tool. Se a tool não existir, Task 7 cria com endpoint dummy ou usa `consultar-proposta-tatuador` (que já existe e retorna proposta + agendamentos). Spec section 2.4 menciona "opção A do backlog" sem cravar tool — Task 7 sub-step 0 confirma qual tool usar via grep nos backlogs/tools.
- **`buildPropostaAgent` removido — testes legados quebram:** `tests/agent/proposta-validator.test.mjs` importa `validatePropostaOutputInvariant`/`PropostaOutputSchema`/`PROXIMA_ACAO_VALUES` do `proposta.js`. Task 11 deleta arquivo (já substituído por novos testes Tasks 2-5). Confirmar via grep que ninguém mais importa.
- **`@openai/agents-openai` dep transitive:** Após `npm uninstall @openai/agents`, o pacote `@openai/agents-openai` pode ficar no lock como transitive de outro caller. Task 15 grep verifica todos os refs em `functions/` e `tests/`; package.json só lista `@openai/agents` direto (não `-openai`). Se `-openai` aparecer em algum arquivo, remover na mesma task.
- **Secrets:** `OPENAI_API_KEY` já existe em `env` (Cloudflare bindings) e em `evals/.env`. Lição Fase 2A: `evals/.env` key **inválida** — usar `.dev.vars` com key da shell (`OPENAI_API_KEY=$(grep ^OPENAI .dev.vars | cut -d= -f2)`). Task 17 sub-step menciona isso.

---

## Task 1: Spike pré-PR — 3 schemas distintos + slot ISO regex strict

**Objetivo:** Antes de comprometer com refator de 3 schemas, validar empiricamente que (a) o mesmo `runtime.run` aceita schemas diferentes em chamadas sequenciais sem state-leak, (b) `z.string().regex(/ISO/)` em `slot_inicio`/`slot_fim` (campos non-handoff) funciona em strict mode (Fase 2A só validou em `data_nascimento`).

**Files:**
- Create: `tests/agent/_spike-fase2b-multi-schema.mjs`

- [ ] **Step 1: Verificar `.dev.vars` tem OPENAI_API_KEY válida**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
grep '^OPENAI_API_KEY' .dev.vars
```
Expected: `OPENAI_API_KEY=sk-proj-...`. Se ausente, abortar e pedir pro user popular.

- [ ] **Step 2: Criar o spike script**

Cria `tests/agent/_spike-fase2b-multi-schema.mjs`:

```js
// Spike Fase 2B pre-PR: valida (a) 3 schemas distintos no mesmo runtime
// (sequenciais, sem state-leak), (b) z.string().regex(ISO) em slot_inicio
// funciona em strict mode. Espelha _spike-fase2a-regex-strict.mjs mas
// pra Proposta.
//
// Run: OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) \
//      node tests/agent/_spike-fase2b-multi-schema.mjs
// Custo: ~$0.05 (3 chamadas gpt-4o-mini).
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

const PerguntaPV = z.object({
  proxima_acao: z.literal('pergunta'),
  resposta_cliente: z.string().min(1),
});
const PediuDesconto = z.object({
  proxima_acao: z.literal('pediu_desconto'),
  resposta_cliente: z.string().min(1),
  valor_pedido_cliente: z.number().positive(),
});
const PropondoValorSchema = z.object({
  output: z.discriminatedUnion('proxima_acao', [PerguntaPV, PediuDesconto]),
});

const PerguntaEH = z.object({
  proxima_acao: z.literal('pergunta'),
  resposta_cliente: z.string().min(1),
});
const ReservarHorario = z.object({
  proxima_acao: z.literal('reservar_horario'),
  resposta_cliente: z.string().min(1),
  slot_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
  slot_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
});
const EscolhendoHorarioSchema = z.object({
  output: z.discriminatedUnion('proxima_acao', [PerguntaEH, ReservarHorario]),
});

const PerguntaAS = z.object({
  proxima_acao: z.literal('pergunta'),
  resposta_cliente: z.string().min(1),
});
const AguardandoSinalSchema = z.object({
  output: z.discriminatedUnion('proxima_acao', [PerguntaAS]),
});

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function call(schema, name, instructions, mensagem) {
  const r = await client.responses.parse({
    model: 'gpt-4o-mini',
    instructions,
    input: [{ role: 'user', content: mensagem }],
    text: { format: zodTextFormat(schema, name) },
  });
  if (r.status !== 'completed') throw new Error(`${name}: status=${r.status}`);
  return r.output_parsed.output;
}

// Round 1: propondo_valor — pede desconto numerico
const o1 = await call(PropondoValorSchema, 'propondo_valor',
  'Estado: propondo_valor. Cliente pode aceitar valor, pedir desconto numerico, ou outro. Valor proposto: R$750.',
  'consegue por 600?');
console.log('R1 propondo_valor:', JSON.stringify(o1));
if (o1.proxima_acao !== 'pediu_desconto' || o1.valor_pedido_cliente !== 600) {
  console.error('FAIL R1'); process.exit(1);
}

// Round 2: escolhendo_horario — pede slot ISO
const o2 = await call(EscolhendoHorarioSchema, 'escolhendo_horario',
  'Estado: escolhendo_horario. Cliente escolheu ter 12/05 14h-17h (2026-05-12T17:00:00Z ate 2026-05-12T20:00:00Z UTC). Emita reservar_horario com slot ISO completo.',
  'pode ser terca 14h');
console.log('R2 escolhendo_horario:', JSON.stringify(o2));
if (o2.proxima_acao !== 'reservar_horario') { console.error('FAIL R2 acao'); process.exit(1); }
if (!/^\d{4}-\d{2}-\d{2}T/.test(o2.slot_inicio)) { console.error('FAIL R2 ISO'); process.exit(1); }

// Round 3: aguardando_sinal — pergunta sobre pagamento
const o3 = await call(AguardandoSinalSchema, 'aguardando_sinal',
  'Estado: aguardando_sinal. Cliente esta esperando confirmar pagamento.',
  'consegui pagar?');
console.log('R3 aguardando_sinal:', JSON.stringify(o3));
if (o3.proxima_acao !== 'pergunta') { console.error('FAIL R3'); process.exit(1); }

console.log('\nOK SPIKE — 3 schemas distintos + slot ISO regex funcionam strict mode.');
```

- [ ] **Step 3: Rodar o spike**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) \
  node tests/agent/_spike-fase2b-multi-schema.mjs
```
Expected output:
```
R1 propondo_valor: {"proxima_acao":"pediu_desconto","resposta_cliente":"...","valor_pedido_cliente":600}
R2 escolhendo_horario: {"proxima_acao":"reservar_horario","resposta_cliente":"...","slot_inicio":"2026-05-12T...","slot_fim":"2026-05-12T..."}
R3 aguardando_sinal: {"proxima_acao":"pergunta","resposta_cliente":"..."}

OK SPIKE — 3 schemas distintos + slot ISO regex funcionam strict mode.
```

Se falhar com HTTP 400 / schema rejection: PAUSA, reportar pro user, NÃO seguir tasks 2+. Fallback design seria voltar a 1 schema universal com validator pós-parse — re-spec necessário.

- [ ] **Step 4: Commit spike**

```bash
git checkout -b feat/caminho-c-fase2b-proposta-strict
git add tests/agent/_spike-fase2b-multi-schema.mjs
git commit -m "spike(fase2b): valida 3 schemas distintos + slot ISO regex strict"
```

---

## Task 2: `PropostaPropondoValorSchema` — discriminated union 8 branches (TDD)

**Objetivo:** Primeiro dos 3 schemas. Substate `propondo_valor` aceita 7 actions (`pergunta`, `oferecendo_horario`, `pediu_desconto`, `adiou`, `reagendamento`, `cliente_agressivo`, `enviar_portfolio`) + `erro`. `ALLOWED_BY_STATE['propondo_valor']` injetado via discriminator literals.

**Files:**
- Create: `functions/api/agent/agents/proposta-schema.js` (1º dos 3 schemas)
- Create: `tests/agent/proposta-schema.test.mjs` (subsection propondo_valor)

- [ ] **Step 1: Escrever testes propondo_valor (failing)**

Cria `tests/agent/proposta-schema.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PropostaPropondoValorSchema } from '../../functions/api/agent/agents/proposta-schema.js';

const baseSentinel = {
  resposta_cliente: 'oi',
  slot_inicio: null,
  slot_fim: null,
  valor_pedido_cliente: null,
  payload_portfolio: null,
};

// — Branch pergunta —
test('propondo_valor: pergunta aceita sentinels nulls', () => {
  const r = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'pergunta',
    ...baseSentinel,
  });
  assert.equal(r.success, true);
});

test('propondo_valor: pergunta com resposta_cliente vazio REJEITADO', () => {
  const r = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'pergunta',
    ...baseSentinel,
    resposta_cliente: '',
  });
  assert.equal(r.success, false);
});

// — Branch oferecendo_horario —
test('propondo_valor: oferecendo_horario aceita', () => {
  const r = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'oferecendo_horario',
    ...baseSentinel,
    resposta_cliente: 'tem ter 12/05 14h-17h ou qui 14/05 10h-13h?',
  });
  assert.equal(r.success, true);
});

// — Branch pediu_desconto —
test('propondo_valor: pediu_desconto exige valor_pedido_cliente positive', () => {
  const ok = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'pediu_desconto',
    ...baseSentinel,
    resposta_cliente: 'vou consultar',
    valor_pedido_cliente: 600,
  });
  assert.equal(ok.success, true);
});

test('propondo_valor: pediu_desconto sem valor_pedido_cliente REJEITADO', () => {
  const r = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'pediu_desconto',
    ...baseSentinel,
    resposta_cliente: 'x',
  });
  assert.equal(r.success, false);
});

test('propondo_valor: pediu_desconto com valor_pedido_cliente <= 0 REJEITADO', () => {
  const r = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'pediu_desconto',
    ...baseSentinel,
    resposta_cliente: 'x',
    valor_pedido_cliente: 0,
  });
  assert.equal(r.success, false);
});

// — Branch enviar_portfolio —
test('propondo_valor: enviar_portfolio exige payload_portfolio non-null', () => {
  const ok = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'enviar_portfolio',
    ...baseSentinel,
    resposta_cliente: 'te mando referencia',
    payload_portfolio: { estilo: 'blackwork', max: 3, motivo: 'cliente pediu' },
  });
  assert.equal(ok.success, true);
});

test('propondo_valor: enviar_portfolio com payload null REJEITADO', () => {
  const r = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'enviar_portfolio',
    ...baseSentinel,
    resposta_cliente: 'x',
  });
  assert.equal(r.success, false);
});

// — Branches adiou/reagendamento/cliente_agressivo —
for (const acao of ['adiou', 'reagendamento', 'cliente_agressivo']) {
  test(`propondo_valor: ${acao} aceita sentinels`, () => {
    const r = PropostaPropondoValorSchema.safeParse({
      proxima_acao: acao,
      ...baseSentinel,
      resposta_cliente: 'ok',
    });
    assert.equal(r.success, true);
  });
}

// — Branch erro —
test('propondo_valor: erro aceita mensagem amigavel', () => {
  const r = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'erro',
    ...baseSentinel,
    resposta_cliente: 'Tive um problema, podes mandar de novo?',
  });
  assert.equal(r.success, true);
});

// — Actions PROIBIDAS em propondo_valor (reservar_horario) —
test('propondo_valor: reservar_horario REJEITADO (action fora do substate)', () => {
  const r = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'reservar_horario',
    ...baseSentinel,
    resposta_cliente: 'reservei',
    slot_inicio: '2026-05-12T17:00:00Z',
    slot_fim: '2026-05-12T20:00:00Z',
  });
  assert.equal(r.success, false);
});
```

- [ ] **Step 2: Rodar testes — confirma FAIL (arquivo inexistente)**

```bash
node --test tests/agent/proposta-schema.test.mjs
```
Expected: `Error: Cannot find module .../proposta-schema.js` ou ENOENT.

- [ ] **Step 3: Criar `proposta-schema.js` com 1º schema**

Cria `functions/api/agent/agents/proposta-schema.js`:

```js
// functions/api/agent/agents/proposta-schema.js
// 3 schemas (1 por substate ativo do PropostaAgent). Cada um e discriminated
// union de actions permitidas no substate + erro. ALLOWED_BY_STATE injetado
// como discriminator literals — LLM NAO consegue emitir action fora do
// permitido (constrained decoding token-level).
//
// Antes (pre-fase2b): 1 schema flat com enum PROXIMA_ACAO_VALUES (8 valores)
// pra todos os substates + validator pos-parse ALLOWED_BY_STATE rejeitando
// action invalida. Violava principio "estruturalmente impossivel errar".
//
// Spec Caminho C Fase 2 section 2.2.
import { z } from 'zod';

const PayloadPortfolio = z.object({
  estilo: z.string().nullable(),
  max: z.number().int().min(1).max(10),
  motivo: z.string().min(1),
});

// — Shape sentinel (campos null quando action nao usa o campo) —
function sentinelBranch(acao) {
  return z.object({
    proxima_acao: z.literal(acao),
    resposta_cliente: z.string().min(1),
    slot_inicio: z.null(),
    slot_fim: z.null(),
    valor_pedido_cliente: z.null(),
    payload_portfolio: z.null(),
  });
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// ─── PROPONDO_VALOR ────────────────────────────────────────────────────
const PV_Pergunta           = sentinelBranch('pergunta');
const PV_OferecendoHorario  = sentinelBranch('oferecendo_horario');
const PV_Adiou              = sentinelBranch('adiou');
const PV_Reagendamento      = sentinelBranch('reagendamento');
const PV_ClienteAgressivo   = sentinelBranch('cliente_agressivo');
const PV_Erro               = sentinelBranch('erro');

const PV_PediuDesconto = z.object({
  proxima_acao: z.literal('pediu_desconto'),
  resposta_cliente: z.string().min(1),
  slot_inicio: z.null(),
  slot_fim: z.null(),
  valor_pedido_cliente: z.number().positive(),
  payload_portfolio: z.null(),
});

const PV_EnviarPortfolio = z.object({
  proxima_acao: z.literal('enviar_portfolio'),
  resposta_cliente: z.string().min(1),
  slot_inicio: z.null(),
  slot_fim: z.null(),
  valor_pedido_cliente: z.null(),
  payload_portfolio: PayloadPortfolio,
});

export const PropostaPropondoValorSchema = z.discriminatedUnion('proxima_acao', [
  PV_Pergunta,
  PV_OferecendoHorario,
  PV_PediuDesconto,
  PV_Adiou,
  PV_Reagendamento,
  PV_ClienteAgressivo,
  PV_EnviarPortfolio,
  PV_Erro,
]);
```

- [ ] **Step 4: Rodar testes — confirma PASS**

```bash
node --test tests/agent/proposta-schema.test.mjs
```
Expected: todos os ~13 tests passam.

- [ ] **Step 5: Commit**

```bash
git add functions/api/agent/agents/proposta-schema.js tests/agent/proposta-schema.test.mjs
git commit -m "feat(fase2b): PropostaPropondoValorSchema (discriminated union 8 branches)"
```

---

## Task 3: `PropostaEscolhendoHorarioSchema` — 6 branches (TDD)

**Objetivo:** 2º schema. Substate `escolhendo_horario` aceita `pergunta`, `reservar_horario`, `reagendamento`, `cliente_agressivo`, `enviar_portfolio`, `erro` (5 actions + erro).

**Files:**
- Modify: `functions/api/agent/agents/proposta-schema.js`
- Modify: `tests/agent/proposta-schema.test.mjs`

- [ ] **Step 1: Adicionar testes escolhendo_horario (failing)**

Append em `tests/agent/proposta-schema.test.mjs`:

```js
import { PropostaEscolhendoHorarioSchema } from '../../functions/api/agent/agents/proposta-schema.js';

const baseSentinelEH = {
  resposta_cliente: 'oi',
  slot_inicio: null,
  slot_fim: null,
  valor_pedido_cliente: null,
  payload_portfolio: null,
};

test('escolhendo_horario: pergunta aceita', () => {
  const r = PropostaEscolhendoHorarioSchema.safeParse({ proxima_acao: 'pergunta', ...baseSentinelEH });
  assert.equal(r.success, true);
});

test('escolhendo_horario: reservar_horario com slots ISO aceita', () => {
  const r = PropostaEscolhendoHorarioSchema.safeParse({
    proxima_acao: 'reservar_horario',
    ...baseSentinelEH,
    resposta_cliente: 'reservado',
    slot_inicio: '2026-05-12T17:00:00Z',
    slot_fim: '2026-05-12T20:00:00Z',
  });
  assert.equal(r.success, true);
});

test('escolhendo_horario: reservar_horario com slot non-ISO REJEITADO', () => {
  const r = PropostaEscolhendoHorarioSchema.safeParse({
    proxima_acao: 'reservar_horario',
    ...baseSentinelEH,
    resposta_cliente: 'x',
    slot_inicio: 'amanha 14h',
    slot_fim: 'amanha 17h',
  });
  assert.equal(r.success, false);
});

test('escolhendo_horario: reservar_horario com slot_inicio null REJEITADO', () => {
  const r = PropostaEscolhendoHorarioSchema.safeParse({
    proxima_acao: 'reservar_horario',
    ...baseSentinelEH,
    resposta_cliente: 'x',
    slot_inicio: null,
    slot_fim: '2026-05-12T20:00:00Z',
  });
  assert.equal(r.success, false);
});

test('escolhendo_horario: enviar_portfolio com payload aceita', () => {
  const r = PropostaEscolhendoHorarioSchema.safeParse({
    proxima_acao: 'enviar_portfolio',
    ...baseSentinelEH,
    resposta_cliente: 'te mando',
    payload_portfolio: { estilo: 'fineline', max: 3, motivo: 'pediu' },
  });
  assert.equal(r.success, true);
});

test('escolhendo_horario: reagendamento/cliente_agressivo aceitos', () => {
  for (const acao of ['reagendamento', 'cliente_agressivo']) {
    const r = PropostaEscolhendoHorarioSchema.safeParse({
      proxima_acao: acao, ...baseSentinelEH, resposta_cliente: 'ok',
    });
    assert.equal(r.success, true);
  }
});

test('escolhendo_horario: oferecendo_horario REJEITADO (action fora do substate)', () => {
  const r = PropostaEscolhendoHorarioSchema.safeParse({
    proxima_acao: 'oferecendo_horario', ...baseSentinelEH, resposta_cliente: 'x',
  });
  assert.equal(r.success, false);
});

test('escolhendo_horario: pediu_desconto REJEITADO (action fora do substate)', () => {
  const r = PropostaEscolhendoHorarioSchema.safeParse({
    proxima_acao: 'pediu_desconto', ...baseSentinelEH,
    resposta_cliente: 'x', valor_pedido_cliente: 500,
  });
  assert.equal(r.success, false);
});

test('escolhendo_horario: erro aceita', () => {
  const r = PropostaEscolhendoHorarioSchema.safeParse({
    proxima_acao: 'erro', ...baseSentinelEH, resposta_cliente: 'tive um problema',
  });
  assert.equal(r.success, true);
});
```

- [ ] **Step 2: Rodar testes — confirma FAIL**

```bash
node --test tests/agent/proposta-schema.test.mjs
```
Expected: testes novos falham com `PropostaEscolhendoHorarioSchema is not a function` / undefined import.

- [ ] **Step 3: Adicionar schema no `proposta-schema.js`**

Append em `functions/api/agent/agents/proposta-schema.js`:

```js
// ─── ESCOLHENDO_HORARIO ────────────────────────────────────────────────
const EH_Pergunta          = sentinelBranch('pergunta');
const EH_Reagendamento     = sentinelBranch('reagendamento');
const EH_ClienteAgressivo  = sentinelBranch('cliente_agressivo');
const EH_Erro              = sentinelBranch('erro');

const EH_ReservarHorario = z.object({
  proxima_acao: z.literal('reservar_horario'),
  resposta_cliente: z.string().min(1),
  slot_inicio: z.string().regex(ISO_RE),
  slot_fim: z.string().regex(ISO_RE),
  valor_pedido_cliente: z.null(),
  payload_portfolio: z.null(),
});

const EH_EnviarPortfolio = z.object({
  proxima_acao: z.literal('enviar_portfolio'),
  resposta_cliente: z.string().min(1),
  slot_inicio: z.null(),
  slot_fim: z.null(),
  valor_pedido_cliente: z.null(),
  payload_portfolio: PayloadPortfolio,
});

export const PropostaEscolhendoHorarioSchema = z.discriminatedUnion('proxima_acao', [
  EH_Pergunta,
  EH_ReservarHorario,
  EH_Reagendamento,
  EH_ClienteAgressivo,
  EH_EnviarPortfolio,
  EH_Erro,
]);
```

- [ ] **Step 4: Rodar testes — confirma PASS**

```bash
node --test tests/agent/proposta-schema.test.mjs
```
Expected: todos os tests (~22 com Task 2+3) passam.

- [ ] **Step 5: Commit**

```bash
git add functions/api/agent/agents/proposta-schema.js tests/agent/proposta-schema.test.mjs
git commit -m "feat(fase2b): PropostaEscolhendoHorarioSchema (6 branches, slot ISO regex)"
```

---

## Task 4: `PropostaAguardandoSinalSchema` — 6 branches (TDD)

**Objetivo:** 3º schema. Substate `aguardando_sinal` aceita `pergunta`, `reservar_horario` (novo cenário TC-P09: slot que bate em `slots_reservados`), `reagendamento`, `cliente_agressivo`, `enviar_portfolio`, `erro`. Shape idêntico ao `EscolhendoHorarioSchema` mas branches duplicados pra discriminator não-leak (limitação Zod 3.x: discriminated union exige instâncias separadas).

**Files:**
- Modify: `functions/api/agent/agents/proposta-schema.js`
- Modify: `tests/agent/proposta-schema.test.mjs`

- [ ] **Step 1: Adicionar testes aguardando_sinal (failing)**

Append em `tests/agent/proposta-schema.test.mjs`:

```js
import { PropostaAguardandoSinalSchema } from '../../functions/api/agent/agents/proposta-schema.js';

const baseSentinelAS = {
  resposta_cliente: 'oi',
  slot_inicio: null,
  slot_fim: null,
  valor_pedido_cliente: null,
  payload_portfolio: null,
};

test('aguardando_sinal: pergunta aceita', () => {
  const r = PropostaAguardandoSinalSchema.safeParse({ proxima_acao: 'pergunta', ...baseSentinelAS });
  assert.equal(r.success, true);
});

test('aguardando_sinal: reservar_horario com slots ISO aceita (TC-P09)', () => {
  const r = PropostaAguardandoSinalSchema.safeParse({
    proxima_acao: 'reservar_horario',
    ...baseSentinelAS,
    resposta_cliente: 'reservado',
    slot_inicio: '2026-05-12T17:00:00Z',
    slot_fim: '2026-05-12T20:00:00Z',
  });
  assert.equal(r.success, true);
});

test('aguardando_sinal: reservar_horario com slot non-ISO REJEITADO', () => {
  const r = PropostaAguardandoSinalSchema.safeParse({
    proxima_acao: 'reservar_horario',
    ...baseSentinelAS,
    resposta_cliente: 'x',
    slot_inicio: '12/05 14h',
    slot_fim: '12/05 17h',
  });
  assert.equal(r.success, false);
});

test('aguardando_sinal: enviar_portfolio aceita', () => {
  const r = PropostaAguardandoSinalSchema.safeParse({
    proxima_acao: 'enviar_portfolio', ...baseSentinelAS,
    resposta_cliente: 'te mando',
    payload_portfolio: { estilo: null, max: 5, motivo: 'pediu' },
  });
  assert.equal(r.success, true);
});

test('aguardando_sinal: pediu_desconto REJEITADO (action fora do substate)', () => {
  const r = PropostaAguardandoSinalSchema.safeParse({
    proxima_acao: 'pediu_desconto', ...baseSentinelAS,
    resposta_cliente: 'x', valor_pedido_cliente: 500,
  });
  assert.equal(r.success, false);
});

test('aguardando_sinal: erro aceita', () => {
  const r = PropostaAguardandoSinalSchema.safeParse({
    proxima_acao: 'erro', ...baseSentinelAS, resposta_cliente: 'tive um problema',
  });
  assert.equal(r.success, true);
});
```

- [ ] **Step 2: Rodar testes — confirma FAIL**

```bash
node --test tests/agent/proposta-schema.test.mjs
```
Expected: tests novos falham com import undefined.

- [ ] **Step 3: Adicionar schema no `proposta-schema.js`**

Append em `functions/api/agent/agents/proposta-schema.js`:

```js
// ─── AGUARDANDO_SINAL ──────────────────────────────────────────────────
const AS_Pergunta          = sentinelBranch('pergunta');
const AS_Reagendamento     = sentinelBranch('reagendamento');
const AS_ClienteAgressivo  = sentinelBranch('cliente_agressivo');
const AS_Erro              = sentinelBranch('erro');

const AS_ReservarHorario = z.object({
  proxima_acao: z.literal('reservar_horario'),
  resposta_cliente: z.string().min(1),
  slot_inicio: z.string().regex(ISO_RE),
  slot_fim: z.string().regex(ISO_RE),
  valor_pedido_cliente: z.null(),
  payload_portfolio: z.null(),
});

const AS_EnviarPortfolio = z.object({
  proxima_acao: z.literal('enviar_portfolio'),
  resposta_cliente: z.string().min(1),
  slot_inicio: z.null(),
  slot_fim: z.null(),
  valor_pedido_cliente: z.null(),
  payload_portfolio: PayloadPortfolio,
});

export const PropostaAguardandoSinalSchema = z.discriminatedUnion('proxima_acao', [
  AS_Pergunta,
  AS_ReservarHorario,
  AS_Reagendamento,
  AS_ClienteAgressivo,
  AS_EnviarPortfolio,
  AS_Erro,
]);

// — Map p/ despacho em runPropostaAgent —
export const SCHEMA_BY_STATE = {
  propondo_valor: PropostaPropondoValorSchema,
  escolhendo_horario: PropostaEscolhendoHorarioSchema,
  aguardando_sinal: PropostaAguardandoSinalSchema,
};
```

- [ ] **Step 4: Rodar testes — confirma PASS**

```bash
node --test tests/agent/proposta-schema.test.mjs
```
Expected: todos os tests passam.

- [ ] **Step 5: Commit**

```bash
git add functions/api/agent/agents/proposta-schema.js tests/agent/proposta-schema.test.mjs
git commit -m "feat(fase2b): PropostaAguardandoSinalSchema + SCHEMA_BY_STATE map"
```

---

## Task 5: `proposta-actions.js` — discriminated union de 3 payloads + extract (TDD)

**Objetivo:** Espelhando padrão Fase 2A (1 contract file por agent), criar `proposta-actions.js` com **1 schema discriminated union** de 3 branches (`reservar_horario`, `pediu_desconto`, `enviar_portfolio`) + **1 função** `extractPropostaAction(out, ctx)` que valida shape do payload + invariantes context-dependent (slot em `horarios_livres` OR `slots_reservados`, `valor_pedido_cliente <= ctx.valor_proposto`). Delega `enviar_portfolio` pra `PortfolioIntentSchema` existente (sem duplicar).

**Files:**
- Create: `functions/_lib/agent-runtime/contracts/proposta-actions.js`
- Create: `tests/_lib/agent-runtime/contracts/proposta-actions.test.mjs`

- [ ] **Step 1: Escrever testes (failing)**

Cria `tests/_lib/agent-runtime/contracts/proposta-actions.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PropostaActionPayloadSchema,
  extractPropostaAction,
} from '../../../../functions/_lib/agent-runtime/contracts/proposta-actions.js';

const ctxComSlots = {
  valor_proposto: 750,
  horarios_livres: [
    { inicio: '2026-05-12T17:00:00Z', fim: '2026-05-12T20:00:00Z', legenda: 'ter 12/05 14h-17h' },
  ],
  slots_reservados: [
    { inicio: '2026-05-14T13:00:00Z', fim: '2026-05-14T16:00:00Z', agendamento_id: 'agd-001' },
  ],
  portfolio_disponivel: true,
};

// — Schema —
test('PropostaActionPayloadSchema: reservar_horario aceita slots ISO', () => {
  const r = PropostaActionPayloadSchema.safeParse({
    proxima_acao: 'reservar_horario',
    slot_inicio: '2026-05-12T17:00:00Z',
    slot_fim: '2026-05-12T20:00:00Z',
  });
  assert.equal(r.success, true);
});

test('PropostaActionPayloadSchema: pediu_desconto aceita valor positive', () => {
  const r = PropostaActionPayloadSchema.safeParse({
    proxima_acao: 'pediu_desconto',
    valor_pedido_cliente: 600,
  });
  assert.equal(r.success, true);
});

test('PropostaActionPayloadSchema: enviar_portfolio aceita payload_portfolio', () => {
  const r = PropostaActionPayloadSchema.safeParse({
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: 'blackwork', max: 5, motivo: 'pediu' },
  });
  assert.equal(r.success, true);
});

// — Extract: ações sem payload retornam null —
test('extractPropostaAction: pergunta retorna null', () => {
  const r = extractPropostaAction({ proxima_acao: 'pergunta' }, ctxComSlots);
  assert.equal(r, null);
});

// — Extract: reservar_horario com slot em horarios_livres —
test('extractPropostaAction: reservar_horario com slot em horarios_livres valido', () => {
  const out = {
    proxima_acao: 'reservar_horario',
    slot_inicio: '2026-05-12T17:00:00Z',
    slot_fim: '2026-05-12T20:00:00Z',
  };
  const r = extractPropostaAction(out, ctxComSlots);
  assert.equal(r.slot_inicio, '2026-05-12T17:00:00Z');
});

// — Extract: TC-P09 — reservar_horario com slot em slots_reservados valido —
test('extractPropostaAction: reservar_horario com slot em slots_reservados valido (TC-P09)', () => {
  const out = {
    proxima_acao: 'reservar_horario',
    slot_inicio: '2026-05-14T13:00:00Z',
    slot_fim: '2026-05-14T16:00:00Z',
  };
  const r = extractPropostaAction(out, ctxComSlots);
  assert.equal(r.slot_inicio, '2026-05-14T13:00:00Z');
});

// — Extract: reservar_horario com slot fora das listas throws —
test('extractPropostaAction: reservar_horario com slot fora das listas throw', () => {
  const out = {
    proxima_acao: 'reservar_horario',
    slot_inicio: '2026-05-99T99:99:99Z',
    slot_fim: '2026-05-99T99:99:99Z',
  };
  assert.throws(() => extractPropostaAction(out, ctxComSlots), /fora da lista/);
});

// — Extract: pediu_desconto valor > valor_proposto throws —
test('extractPropostaAction: pediu_desconto valor > valor_proposto throw', () => {
  const out = { proxima_acao: 'pediu_desconto', valor_pedido_cliente: 800 };
  assert.throws(() => extractPropostaAction(out, ctxComSlots), /> valor_proposto/);
});

test('extractPropostaAction: pediu_desconto valor <= valor_proposto valido', () => {
  const out = { proxima_acao: 'pediu_desconto', valor_pedido_cliente: 600 };
  const r = extractPropostaAction(out, ctxComSlots);
  assert.equal(r.valor_pedido_cliente, 600);
});

// — Extract: enviar_portfolio delega pra PortfolioIntentSchema —
test('extractPropostaAction: enviar_portfolio com portfolio_disponivel=true valido', () => {
  const out = {
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: 'fineline', max: 3, motivo: 'pediu' },
  };
  const r = extractPropostaAction(out, ctxComSlots);
  assert.equal(r.estilo, 'fineline');
});

test('extractPropostaAction: enviar_portfolio com portfolio_disponivel=false throw', () => {
  const out = {
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: null, max: 5, motivo: 'pediu' },
  };
  assert.throws(() => extractPropostaAction(out, { ...ctxComSlots, portfolio_disponivel: false }), /portfolio_disponivel/);
});

// — Extract: shape invalido lanca ZodError —
test('extractPropostaAction: reservar_horario sem slot_fim ZodError', () => {
  const out = { proxima_acao: 'reservar_horario', slot_inicio: '2026-05-12T17:00:00Z' };
  assert.throws(() => extractPropostaAction(out, ctxComSlots));
});

// — Extract: out null retorna null —
test('extractPropostaAction: out null retorna null', () => {
  assert.equal(extractPropostaAction(null, ctxComSlots), null);
});
```

- [ ] **Step 2: Rodar testes — confirma FAIL (ENOENT)**

```bash
node --test tests/_lib/agent-runtime/contracts/proposta-actions.test.mjs
```
Expected: `Cannot find module .../proposta-actions.js`.

- [ ] **Step 3: Criar `proposta-actions.js`**

Cria `functions/_lib/agent-runtime/contracts/proposta-actions.js`:

```js
// functions/_lib/agent-runtime/contracts/proposta-actions.js
// Contratos cross-action do PropostaAgent. Espelha cadastro-handoff.js da
// Fase 2A (1 arquivo por agent, 1 schema discriminated union, 1 funcao
// extract) — NAO sao 3 contratos separados (decisao cravada 19/05).
//
// Schema strict (Task 2-4) ja garante shape estrutural (slot ISO, valor>0).
// Este contract valida invariantes CONTEXT-DEPENDENT que schema nao cobre:
//   - reservar_horario: slot em ctx.horarios_livres OR ctx.slots_reservados (TC-P09)
//   - pediu_desconto: valor_pedido_cliente <= ctx.valor_proposto
//   - enviar_portfolio: ctx.portfolio_disponivel === true
//
// enviar_portfolio delega pra PortfolioIntentSchema/extractPortfolioIntent
// (compartilhado com Cadastro Fase 2A) — sem duplicar.
//
// Spec Fase 2 section 2.3 + 2.4.
import { z } from 'zod';
import { PortfolioIntentSchema, extractPortfolioIntent } from './portfolio-intent.js';

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

const ReservarHorarioBranch = z.object({
  proxima_acao: z.literal('reservar_horario'),
  slot_inicio: z.string().regex(ISO_RE),
  slot_fim: z.string().regex(ISO_RE),
});

const PediuDescontoBranch = z.object({
  proxima_acao: z.literal('pediu_desconto'),
  valor_pedido_cliente: z.number().positive(),
});

const EnviarPortfolioBranch = z.object({
  proxima_acao: z.literal('enviar_portfolio'),
  payload_portfolio: PortfolioIntentSchema,
});

export const PropostaActionPayloadSchema = z.discriminatedUnion('proxima_acao', [
  ReservarHorarioBranch,
  PediuDescontoBranch,
  EnviarPortfolioBranch,
]);

function slotMatches(slot, slot_inicio, slot_fim) {
  return slot.inicio === slot_inicio && slot.fim === slot_fim;
}

export function extractPropostaAction(out, ctx) {
  if (!out) return null;
  const acao = out.proxima_acao;
  if (acao !== 'reservar_horario' && acao !== 'pediu_desconto' && acao !== 'enviar_portfolio') {
    return null;
  }

  if (acao === 'reservar_horario') {
    const payload = PropostaActionPayloadSchema.parse({
      proxima_acao: 'reservar_horario',
      slot_inicio: out.slot_inicio,
      slot_fim: out.slot_fim,
    });
    const livres = ctx?.horarios_livres || [];
    const reservados = ctx?.slots_reservados || [];
    const hit = livres.some(s => slotMatches(s, payload.slot_inicio, payload.slot_fim))
             || reservados.some(s => slotMatches(s, payload.slot_inicio, payload.slot_fim));
    if (!hit) throw new Error('slot fora da lista pre-fetched');
    return payload;
  }

  if (acao === 'pediu_desconto') {
    const payload = PropostaActionPayloadSchema.parse({
      proxima_acao: 'pediu_desconto',
      valor_pedido_cliente: out.valor_pedido_cliente,
    });
    if (typeof ctx?.valor_proposto === 'number' && payload.valor_pedido_cliente > ctx.valor_proposto) {
      throw new Error(`valor_pedido_cliente=${payload.valor_pedido_cliente} > valor_proposto=${ctx.valor_proposto}`);
    }
    return payload;
  }

  // enviar_portfolio: delega pra extractPortfolioIntent (compartilhado).
  return extractPortfolioIntent(out, ctx);
}
```

- [ ] **Step 4: Rodar testes — confirma PASS**

```bash
node --test tests/_lib/agent-runtime/contracts/proposta-actions.test.mjs
```
Expected: 13 tests passam.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/agent-runtime/contracts/proposta-actions.js \
        tests/_lib/agent-runtime/contracts/proposta-actions.test.mjs
git commit -m "feat(fase2b): proposta-actions contract (1 discriminated union, 3 branches)"
```

---

## Task 6: `runPropostaAgent` — função pura com despacho por substate (TDD)

**Objetivo:** Reescrever `functions/api/agent/agents/proposta.js` como função pura `runPropostaAgent({ env, tenant, conversa, clientContext, mensagem, historico, estado_atual, openaiClient })` que escolhe schema via `SCHEMA_BY_STATE[estado_atual]` e chama `runtime.run`. Sem classe `Agent`, sem closure validator, sem `@openai/agents`. Espelha `runCadastroAgent`.

**Files:**
- Rewrite: `functions/api/agent/agents/proposta.js`
- Create: `tests/agent/run-proposta-agent.test.mjs`

- [ ] **Step 1: Escrever testes (failing)**

Cria `tests/agent/run-proposta-agent.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPropostaAgent } from '../../functions/api/agent/agents/proposta.js';

const FAKE_TENANT = {
  id: 't1', nome_estudio: 'Estudio X', nome_agente: 'Bot',
  config_agente: {}, config_precificacao: { sinal_percentual: 30 },
  gatilhos_handoff: [], faqs: [], fewshots: [], fewshots_por_modo: {},
  plano: 'individual',
};
const FAKE_CONVERSA = {
  id: 'c1', telefone: '+5511', estado_agente: 'propondo_valor',
  dados_coletados: { decisao_desconto: null }, dados_cadastro: { nome: 'Cli' },
  valor_proposto: 750,
};

function makeFakeClient(parsed) {
  let captured;
  return {
    _captured: () => captured,
    responses: {
      parse: async (params) => {
        captured = params;
        return { status: 'completed', output_parsed: { output: parsed }, id: 'resp_fake' };
      },
    },
  };
}

test('runPropostaAgent: propondo_valor retorna output parseado', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta',
    resposta_cliente: 'me explica mais',
    slot_inicio: null, slot_fim: null,
    valor_pedido_cliente: null, payload_portfolio: null,
  });
  const out = await runPropostaAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA,
    clientContext: { valor_proposto: 750, horarios_livres: [] },
    mensagem: 'que valor?', historico: [],
    estado_atual: 'propondo_valor',
    openaiClient: fake,
  });
  assert.equal(out.proxima_acao, 'pergunta');
});

test('runPropostaAgent: escolhendo_horario despacha schema correto', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'reservar_horario',
    resposta_cliente: 'reservei',
    slot_inicio: '2026-05-12T17:00:00Z',
    slot_fim: '2026-05-12T20:00:00Z',
    valor_pedido_cliente: null, payload_portfolio: null,
  });
  await runPropostaAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA,
    clientContext: {}, mensagem: 'terca 14h', historico: [],
    estado_atual: 'escolhendo_horario',
    openaiClient: fake,
  });
  const captured = fake._captured();
  assert.equal(captured.text.format.name, 'proposta_escolhendo_horario');
});

test('runPropostaAgent: aguardando_sinal usa schema AS', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'ainda nao recebi',
    slot_inicio: null, slot_fim: null, valor_pedido_cliente: null, payload_portfolio: null,
  });
  await runPropostaAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA,
    clientContext: {}, mensagem: 'paguei', historico: [],
    estado_atual: 'aguardando_sinal',
    openaiClient: fake,
  });
  const captured = fake._captured();
  assert.equal(captured.text.format.name, 'proposta_aguardando_sinal');
});

test('runPropostaAgent: estado desconhecido lanca', async () => {
  await assert.rejects(
    runPropostaAgent({
      env: { OPENAI_API_KEY: 'sk-test' },
      tenant: FAKE_TENANT, conversa: FAKE_CONVERSA,
      clientContext: {}, mensagem: 'x', historico: [],
      estado_atual: 'estado_inexistente',
      openaiClient: makeFakeClient({}),
    }),
    /Estado proposta desconhecido/
  );
});

test('runPropostaAgent: monta input com historico + mensagem', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'x',
    slot_inicio: null, slot_fim: null, valor_pedido_cliente: null, payload_portfolio: null,
  });
  await runPropostaAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    mensagem: 'mensagem nova',
    historico: [{ autor: 'cliente', texto: 'oi' }, { autor: 'bot', texto: 'opa' }],
    estado_atual: 'propondo_valor',
    openaiClient: fake,
  });
  const captured = fake._captured();
  assert.equal(captured.input.length, 3);
  assert.deepEqual(captured.input[0], { role: 'user', content: 'oi' });
  assert.deepEqual(captured.input[1], { role: 'assistant', content: 'opa' });
  assert.equal(captured.input[2].content, 'mensagem nova');
});
```

- [ ] **Step 2: Rodar testes — confirma FAIL**

```bash
node --test tests/agent/run-proposta-agent.test.mjs
```
Expected: `runPropostaAgent is not a function` ou import error.

- [ ] **Step 3: Reescrever `proposta.js`**

Sobrescreve `functions/api/agent/agents/proposta.js` (deleta builder + validator antigos):

```js
// functions/api/agent/agents/proposta.js
// PropostaAgent — Caminho C Fase 2B. Funcao pura sem classe Agent.
//
// Antes (pre-fase2b): builder pattern com @openai/agents SDK + validator
// pos-parse ALLOWED_BY_STATE rejeitando action invalida pro substate. Mesma
// arquitetura que Tattoo/Cadastro pre-Fase 1/2A — falsificada (HTTP 500
// em violacoes, LLM produzindo action fora do permitido).
//
// Agora: openai SDK puro + Responses API + 3 schemas strict (1 por substate)
// onde ALLOWED_BY_STATE vira discriminator literal — LLM nao consegue
// emitir action proibida. SCHEMA_BY_STATE despacha. Sem validator pos-parse:
// invariantes context-dependent (slot em ctx, valor <= proposto, portfolio
// disponivel) extraidas pra contract proposta-actions.js (consumido pelo
// route.js apos parse).
//
// Spec Caminho C Fase 2 section 4.B + decisoes cravadas 19/05.
import { runtime } from '../../../_lib/agent-runtime/runtime.js';
import { generatePromptColetaProposta } from '../../../_lib/prompts/coleta/proposta/generate.js';
import { SCHEMA_BY_STATE } from './proposta-schema.js';

function normalizeHistoryItem(item) {
  // historico de conversa: pode vir com role+content ja shapeado, ou com
  // shape do Supabase (autor='cliente'|'bot' + texto). Normaliza pra OpenAI.
  if (item.role && item.content != null) return { role: item.role, content: item.content };
  if (item.autor && item.texto != null) {
    return { role: item.autor === 'cliente' ? 'user' : 'assistant', content: item.texto };
  }
  return item;
}

const SCHEMA_NAME_BY_STATE = {
  propondo_valor: 'proposta_propondo_valor',
  escolhendo_horario: 'proposta_escolhendo_horario',
  aguardando_sinal: 'proposta_aguardando_sinal',
};

export async function runPropostaAgent({
  env,
  tenant,
  conversa,
  clientContext,
  mensagem,
  historico,
  estado_atual,
  openaiClient,
}) {
  const schema = SCHEMA_BY_STATE[estado_atual];
  if (!schema) {
    throw new Error(`Estado proposta desconhecido: ${estado_atual}`);
  }
  const ctx = clientContext || {};
  const instructions = generatePromptColetaProposta(tenant, conversa, ctx);

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
    outputSchema: schema,
    schemaName: SCHEMA_NAME_BY_STATE[estado_atual],
  });
}
```

- [ ] **Step 4: Rodar testes — confirma PASS**

```bash
node --test tests/agent/run-proposta-agent.test.mjs
```
Expected: 5 tests passam.

- [ ] **Step 5: Confirmar suite local ainda passa (sem proposta-validator antigo)**

```bash
node --test 'tests/**/*.test.mjs' 2>&1 | tail -30
```
Expected: FAIL em `tests/agent/proposta-validator.test.mjs` (imports `validatePropostaOutputInvariant`/`PropostaOutputSchema`/`PROXIMA_ACAO_VALUES` que foram deletados). NÃO commitar — Task 11 deleta esse arquivo. Anote pra resolver lá.

- [ ] **Step 6: Commit**

```bash
git add functions/api/agent/agents/proposta.js tests/agent/run-proposta-agent.test.mjs
git commit -m "feat(fase2b): runPropostaAgent (despacho 3 substates, sem @openai/agents)"
```

---

## Task 7: Pre-fetch TC-P09 — adiciona `slots_reservados` em `aguardando_sinal` (TDD)

**Objetivo:** Em `prefetchPropostaContext({ estado_atual: 'aguardando_sinal' })`, além de `proposta_status` (que já existe), buscar `slots_reservados` (agendamentos ativos do cliente). Solução opção A do backlog P2 2026-05-09: contract `extractPropostaAction` (Task 5) já aceita slot que bate em `horarios_livres` OR `slots_reservados`. Aqui só popula o ctx.

**Sub-step 0 — escolha de tool:** O fix exige uma tool que liste agendamentos ativos por telefone. Spec section 2.4 sugere "opção A". Confirmar via grep qual tool já existe:

```bash
grep -r 'consultar-proposta-tatuador\|listar-agendamentos\|slots_reservados' functions/api/tools/ 2>/dev/null | head -10
```

Se `consultar-proposta-tatuador` retornar agendamento ativo (data + slot), usar essa tool. Senão, criar tool nova `listar-agendamentos-ativos` em sub-task. Plan assume reuso de `consultar-proposta-tatuador` (default; ajustar shape se necessário).

**Files:**
- Modify: `functions/api/agent/_lib/prefetch-proposta.js`
- Create: `tests/agent/prefetch-proposta-context.test.mjs`

- [ ] **Step 1: Confirmar shape de `consultar-proposta-tatuador`**

```bash
grep -A 30 'consultar-proposta-tatuador' functions/api/tools/ -r 2>/dev/null | head -50
```
Expected: encontrar endpoint que retorna `{ ok, status, slots_reservados?: [{inicio,fim,agendamento_id}] }` OU `{ ok, agendamento: { slot: {...} } }`. Se shape não tiver `slots_reservados`, adaptar tool ou parse server-side.

- [ ] **Step 2: Escrever testes (failing)**

Cria `tests/agent/prefetch-proposta-context.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefetchPropostaContext } from '../../functions/api/agent/_lib/prefetch-proposta.js';

// Mock minimo de callTool via override do modulo — testar com env stub.
// Como callTool() chama fetch, usar wrapper test-aware: prefetchPropostaContext
// nao injeta deps; usaremos fetch global override.
const ORIG_FETCH = globalThis.fetch;

function mockFetch(handlers) {
  return async (url, init) => {
    const u = typeof url === 'string' ? url : url.toString();
    const matched = Object.keys(handlers).find(k => u.includes(k));
    if (!matched) throw new Error(`unmocked fetch: ${u}`);
    return new Response(JSON.stringify(handlers[matched]), { status: 200 });
  };
}

test.beforeEach(() => { globalThis.fetch = ORIG_FETCH; });

test('prefetchPropostaContext: aguardando_sinal retorna slots_reservados E proposta_status', async () => {
  globalThis.fetch = mockFetch({
    'consultar-proposta-tatuador': {
      ok: true,
      status: 'aguardando_sinal',
      slots_reservados: [
        { inicio: '2026-05-14T13:00:00Z', fim: '2026-05-14T16:00:00Z', agendamento_id: 'agd-001' },
      ],
    },
  });
  const ctx = await prefetchPropostaContext({
    env: { TOOLS_BASE_URL: 'https://stub' },
    tenant: { id: 't1' },
    conversa: { valor_proposto: 750, dados_coletados: { decisao_desconto: null } },
    telefone: '+5511', estado_atual: 'aguardando_sinal',
  });
  assert.equal(ctx.proposta_status, 'aguardando_sinal');
  assert.ok(Array.isArray(ctx.slots_reservados));
  assert.equal(ctx.slots_reservados.length, 1);
  assert.equal(ctx.slots_reservados[0].agendamento_id, 'agd-001');
});

test('prefetchPropostaContext: propondo_valor NAO retorna slots_reservados', async () => {
  globalThis.fetch = mockFetch({
    'consultar-horarios': { ok: true, slots: [] },
  });
  const ctx = await prefetchPropostaContext({
    env: { TOOLS_BASE_URL: 'https://stub' },
    tenant: { id: 't1' },
    conversa: { valor_proposto: 750, dados_coletados: { decisao_desconto: null } },
    telefone: '+5511', estado_atual: 'propondo_valor',
  });
  assert.equal(ctx.slots_reservados, undefined);
  assert.ok(Array.isArray(ctx.horarios_livres));
});

test('prefetchPropostaContext: aguardando_sinal com tool retornando vazio nao quebra', async () => {
  globalThis.fetch = mockFetch({
    'consultar-proposta-tatuador': { ok: true, status: null },
  });
  const ctx = await prefetchPropostaContext({
    env: { TOOLS_BASE_URL: 'https://stub' },
    tenant: { id: 't1' },
    conversa: {},
    telefone: '+5511', estado_atual: 'aguardando_sinal',
  });
  assert.deepEqual(ctx.slots_reservados, []);
});
```

- [ ] **Step 3: Rodar testes — confirma FAIL**

```bash
node --test tests/agent/prefetch-proposta-context.test.mjs
```
Expected: `ctx.slots_reservados` é undefined em todos os tests (atual `prefetch-proposta.js` não popula).

- [ ] **Step 4: Modificar `prefetch-proposta.js`**

Substitui o bloco `aguardando_sinal` em `functions/api/agent/_lib/prefetch-proposta.js`:

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
    // Caminho C Fase 2B TC-P09: agendamento ativo do cliente. Slot ja
    // reservado nao consta em horarios_livres — extractPropostaAction
    // (contract) aceita slot em horarios_livres OR slots_reservados.
    const r = await callTool(env, 'consultar-proposta-tatuador', {
      tenant_id: tenant.id,
      telefone,
    });
    ctx.proposta_status = r.ok ? r.status : null;
    ctx.slots_reservados = r.ok && Array.isArray(r.slots_reservados) ? r.slots_reservados : [];
  }

  return ctx;
}
```

- [ ] **Step 5: Rodar testes — confirma PASS**

```bash
node --test tests/agent/prefetch-proposta-context.test.mjs
```
Expected: 3 tests passam.

- [ ] **Step 6: Commit**

```bash
git add functions/api/agent/_lib/prefetch-proposta.js \
        tests/agent/prefetch-proposta-context.test.mjs
git commit -m "feat(fase2b): prefetch slots_reservados em aguardando_sinal (TC-P09)"
```

---

## Task 8: Router — generalizar `validateTransition` → `validateAction(estado, out, ctx)`

**Objetivo:** Substituir `HANDOFF_CONTRACTS` (só handoff) por `ACTION_CONTRACTS` que cobre tattoo handoff + cadastro handoff + proposta-actions. Remover `BUILDERS` map + `selectAgentBuilder` + imports `buildCadastroAgent`/`buildPropostaAgent` (não-existentes após Task 6/11). Renomear `validateTransition` → `validateAction`. Atualizar tests.

**Files:**
- Modify: `functions/api/agent/router.js`
- Modify: `tests/agent/router-validate-transition.test.mjs` (renomear ou manter nome — testes renomeados internamente)

- [ ] **Step 1: Atualizar testes pra `validateAction`**

Sobrescreve `tests/agent/router-validate-transition.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAction, isStateImplemented } from '../../functions/api/agent/router.js';

// — Tattoo handoff (Fase 1) —
test('validateAction: tattoo + handoff valido retorna payload extraido', () => {
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
  const payload = validateAction('tattoo', out, {});
  assert.equal(payload.descricao_curta, 'rosa');
});

test('validateAction: tattoo + pergunta retorna null', () => {
  const payload = validateAction('tattoo', { proxima_acao: 'pergunta' }, {});
  assert.equal(payload, null);
});

// — Cadastro handoff (Fase 2A) —
test('validateAction: cadastro + handoff valido retorna payload', () => {
  const out = {
    proxima_acao: 'handoff',
    dados_persistidos: { nome: 'Joao', data_nascimento: '1995-03-12', email: 'j@e.com' },
    email_recusado: false,
  };
  const payload = validateAction('cadastro', out, {});
  assert.equal(payload.nome, 'Joao');
});

// — Proposta actions (Fase 2B) —
test('validateAction: propondo_valor + pediu_desconto valido', () => {
  const out = { proxima_acao: 'pediu_desconto', valor_pedido_cliente: 600 };
  const payload = validateAction('propondo_valor', out, { valor_proposto: 750 });
  assert.equal(payload.valor_pedido_cliente, 600);
});

test('validateAction: propondo_valor + pediu_desconto valor > proposto throw', () => {
  const out = { proxima_acao: 'pediu_desconto', valor_pedido_cliente: 800 };
  assert.throws(() => validateAction('propondo_valor', out, { valor_proposto: 750 }), /> valor_proposto/);
});

test('validateAction: escolhendo_horario + reservar_horario slot em horarios_livres', () => {
  const out = {
    proxima_acao: 'reservar_horario',
    slot_inicio: '2026-05-12T17:00:00Z', slot_fim: '2026-05-12T20:00:00Z',
  };
  const payload = validateAction('escolhendo_horario', out, {
    horarios_livres: [{ inicio: '2026-05-12T17:00:00Z', fim: '2026-05-12T20:00:00Z' }],
    slots_reservados: [],
  });
  assert.equal(payload.slot_inicio, '2026-05-12T17:00:00Z');
});

test('validateAction: aguardando_sinal + reservar_horario slot em slots_reservados (TC-P09)', () => {
  const out = {
    proxima_acao: 'reservar_horario',
    slot_inicio: '2026-05-14T13:00:00Z', slot_fim: '2026-05-14T16:00:00Z',
  };
  const payload = validateAction('aguardando_sinal', out, {
    horarios_livres: [],
    slots_reservados: [{ inicio: '2026-05-14T13:00:00Z', fim: '2026-05-14T16:00:00Z' }],
  });
  assert.equal(payload.slot_inicio, '2026-05-14T13:00:00Z');
});

test('validateAction: enviar_portfolio em qualquer substate', () => {
  const out = {
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: 'fineline', max: 3, motivo: 'pediu' },
  };
  for (const estado of ['propondo_valor', 'escolhendo_horario', 'aguardando_sinal']) {
    const payload = validateAction(estado, out, { portfolio_disponivel: true });
    assert.equal(payload.estilo, 'fineline');
  }
});

test('validateAction: propondo_valor + pergunta retorna null', () => {
  const payload = validateAction('propondo_valor', { proxima_acao: 'pergunta' }, {});
  assert.equal(payload, null);
});

test('validateAction: estado sem contrato retorna null', () => {
  const payload = validateAction('estado_inexistente', { proxima_acao: 'handoff' }, {});
  assert.equal(payload, null);
});

test('validateAction: out null retorna null', () => {
  assert.equal(validateAction('tattoo', null, {}), null);
});

test('isStateImplemented: cobre tattoo + cadastro + 3 substates proposta', () => {
  for (const e of ['tattoo', 'cadastro', 'propondo_valor', 'escolhendo_horario', 'aguardando_sinal']) {
    assert.equal(isStateImplemented(e), true);
  }
  assert.equal(isStateImplemented('inexistente'), false);
});
```

- [ ] **Step 2: Rodar testes — confirma FAIL**

```bash
node --test tests/agent/router-validate-transition.test.mjs
```
Expected: `validateAction is not a function` ou similar.

- [ ] **Step 3: Reescrever `router.js`**

Sobrescreve `functions/api/agent/router.js`:

```js
// functions/api/agent/router.js
// Router — dispatch por estado_atual pra calculo do proximo estado e
// validacao de invariantes context-dependent via contracts cross-agent.
//
// Caminho C Fase 1: tattoo migrou pro path novo (runTattooAgent).
// Caminho C Fase 2A: cadastro migrou.
// Caminho C Fase 2B: proposta (3 substates) migrou. BUILDERS/selectAgentBuilder
// removidos — nao ha mais nenhum agent no path antigo (@openai/agents).
//
// validateAction(estado_atual, out, ctx) generaliza validateTransition (Fase 1):
//   - tattoo handoff   -> extractTattooHandoff(out)
//   - cadastro handoff -> extractCadastroHandoff(out)
//   - propondo_valor / escolhendo_horario / aguardando_sinal -> extractPropostaAction(out, ctx)
//   - outras           -> null (sem invariante context-dependent)
import { extractHandoffPayload as extractTattooHandoff } from '../../_lib/agent-runtime/contracts/tattoo-handoff.js';
import { extractCadastroHandoff } from '../../_lib/agent-runtime/contracts/cadastro-handoff.js';
import { extractPropostaAction } from '../../_lib/agent-runtime/contracts/proposta-actions.js';

const PROPOSTA_SUBSTATES = ['propondo_valor', 'escolhendo_horario', 'aguardando_sinal'];

const IMPLEMENTED_STATES = new Set(['tattoo', 'cadastro', ...PROPOSTA_SUBSTATES]);

const NEXT_STATE = {
  tattoo:   { handoff: 'cadastro',            erro: 'tattoo',              enviar_portfolio: 'tattoo' },
  cadastro: { handoff: 'aguardando_tatuador', erro: 'aguardando_tatuador', enviar_portfolio: 'cadastro' },
  propondo_valor: {
    pergunta:           'propondo_valor',
    oferecendo_horario: 'escolhendo_horario',
    pediu_desconto:     'aguardando_decisao_desconto',
    adiou:              'lead_frio',
    reagendamento:      'aguardando_tatuador',
    cliente_agressivo:  'aguardando_tatuador',
    enviar_portfolio:   'propondo_valor',
    erro:               'propondo_valor',
  },
  escolhendo_horario: {
    pergunta:          'escolhendo_horario',
    reservar_horario:  'aguardando_sinal',
    reagendamento:     'aguardando_tatuador',
    cliente_agressivo: 'aguardando_tatuador',
    enviar_portfolio:  'escolhendo_horario',
    erro:              'escolhendo_horario',
  },
  aguardando_sinal: {
    pergunta:          'aguardando_sinal',
    reservar_horario:  'aguardando_sinal',
    reagendamento:     'aguardando_tatuador',
    cliente_agressivo: 'aguardando_tatuador',
    enviar_portfolio:  'aguardando_sinal',
    erro:              'aguardando_sinal',
  },
};

export function isStateImplemented(estado_atual) {
  return IMPLEMENTED_STATES.has(estado_atual);
}

export function getNextState(estado_atual, out) {
  const map = NEXT_STATE[estado_atual] || {};
  return map[out?.proxima_acao] || estado_atual;
}

// ─── Contracts cross-agent ─────────────────────────────────────────────
const ACTION_CONTRACTS = {
  tattoo:             (out, _ctx) => (out?.proxima_acao === 'handoff' ? extractTattooHandoff(out) : null),
  cadastro:           (out, _ctx) => (out?.proxima_acao === 'handoff' ? extractCadastroHandoff(out) : null),
  propondo_valor:     (out, ctx)  => extractPropostaAction(out, ctx),
  escolhendo_horario: (out, ctx)  => extractPropostaAction(out, ctx),
  aguardando_sinal:   (out, ctx)  => extractPropostaAction(out, ctx),
};

export function validateAction(estado_atual, out, ctx) {
  if (!out) return null;
  const extract = ACTION_CONTRACTS[estado_atual];
  if (!extract) return null;
  return extract(out, ctx || {});
}
```

- [ ] **Step 4: Rodar testes — confirma PASS**

```bash
node --test tests/agent/router-validate-transition.test.mjs
```
Expected: 12 tests passam.

- [ ] **Step 5: Commit**

```bash
git add functions/api/agent/router.js tests/agent/router-validate-transition.test.mjs
git commit -m "refactor(fase2b): generaliza validateTransition -> validateAction (tattoo+cadastro+proposta)"
```

---

## Task 9: route.js — branch Proposta novo + remove path antigo + silent force pergunta

**Objetivo:** Adicionar `if (PROPOSTA_SUBSTATES.has(estado_atual))` branch em `runAgent()` chamando `runPropostaAgent`. Validar via `validateAction(estado_atual, out, ctx)`. Implementar silent-force-pergunta quando contract lança `/fora da lista/` ou `/> valor_proposto/` (espelha route.js linhas 266-275 atuais). Remover `else` legado completo (path antigo proposta, ~70 linhas). Renomear `validateTransition` → `validateAction` nos call-sites tattoo/cadastro. Remover imports `run` de `@openai/agents` e `setDefaultOpenAIKey` de `@openai/agents-openai` no topo do arquivo.

**Files:**
- Modify: `functions/api/agent/route.js`
- Create: `tests/agent/route-runagent-proposta.test.mjs` (testes integration novos)

- [ ] **Step 1: Escrever testes integration (failing)**

Cria `tests/agent/route-runagent-proposta.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../../functions/api/agent/route.js';

const FAKE_TENANT = {
  id: 't1', nome_estudio: 'Estudio X', nome_agente: 'Bot',
  config_agente: {}, config_precificacao: { sinal_percentual: 30 },
  gatilhos_handoff: [], faqs: [], fewshots: [], fewshots_por_modo: {},
  plano: 'individual',
};
const FAKE_CONVERSA = {
  id: 'c1', telefone: '+5511', valor_proposto: 750,
  dados_coletados: {}, dados_cadastro: { nome: 'Cli' },
};

// Fake fetch pra mockar todos os callTool (prefetch + side-effects)
function setupFakeFetch(handlers) {
  globalThis.fetch = async (url) => {
    const u = typeof url === 'string' ? url : url.toString();
    const matched = Object.keys(handlers).find(k => u.includes(k));
    if (!matched) return new Response('{"ok":true,"slots":[]}', { status: 200 });
    return new Response(JSON.stringify(handlers[matched]), { status: 200 });
  };
}

function makeFakeOpenAI(parsed) {
  return {
    responses: {
      parse: async () => ({ status: 'completed', output_parsed: { output: parsed }, id: 'r' }),
    },
  };
}

test('runAgent: propondo_valor + pediu_desconto valido', async () => {
  setupFakeFetch({
    'consultar-horarios': { ok: true, slots: [] },
    'consultar-portfolio-disponivel': { ok: true, portfolio_disponivel: false },
    'enviar-objecao-tatuador': { ok: true },
  });
  const r = await runAgent({
    env: { OPENAI_API_KEY: 'sk-test', TOOLS_BASE_URL: 'https://stub' },
    tenant_id: 't1', telefone: '+5511', mensagem: 'consegue 600?',
    estado_atual: 'propondo_valor', dados_acumulados: {}, historico: [],
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    openaiClient: makeFakeOpenAI({
      proxima_acao: 'pediu_desconto', resposta_cliente: 'vou consultar',
      slot_inicio: null, slot_fim: null, valor_pedido_cliente: 600, payload_portfolio: null,
    }),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'pediu_desconto');
  assert.equal(r.estado_novo, 'aguardando_decisao_desconto');
});

test('runAgent: escolhendo_horario + reservar_horario slot em horarios_livres', async () => {
  setupFakeFetch({
    'consultar-horarios': { ok: true, slots: [{ inicio: '2026-05-12T17:00:00Z', fim: '2026-05-12T20:00:00Z', legenda: 'ter' }] },
    'consultar-portfolio-disponivel': { ok: true, portfolio_disponivel: false },
    'reservar-horario': { ok: true, agendamento_id: 'agd-1' },
    'gerar-link-sinal': { ok: true, link_pagamento: 'https://pay', hold_horas: 24 },
  });
  const r = await runAgent({
    env: { OPENAI_API_KEY: 'sk-test', TOOLS_BASE_URL: 'https://stub' },
    tenant_id: 't1', telefone: '+5511', mensagem: 'terca 14h',
    estado_atual: 'escolhendo_horario', dados_acumulados: {}, historico: [],
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    openaiClient: makeFakeOpenAI({
      proxima_acao: 'reservar_horario', resposta_cliente: 'reservado',
      slot_inicio: '2026-05-12T17:00:00Z', slot_fim: '2026-05-12T20:00:00Z',
      valor_pedido_cliente: null, payload_portfolio: null,
    }),
  });
  assert.equal(r.ok, true);
  assert.equal(r.estado_novo, 'aguardando_sinal');
});

test('runAgent: aguardando_sinal + reservar_horario slot em slots_reservados (TC-P09)', async () => {
  setupFakeFetch({
    'consultar-proposta-tatuador': {
      ok: true, status: 'aguardando_sinal',
      slots_reservados: [{ inicio: '2026-05-14T13:00:00Z', fim: '2026-05-14T16:00:00Z' }],
    },
    'consultar-portfolio-disponivel': { ok: true, portfolio_disponivel: false },
    'reservar-horario': { ok: true, agendamento_id: 'agd-1' },
    'gerar-link-sinal': { ok: true, link_pagamento: 'https://pay', hold_horas: 24 },
  });
  const r = await runAgent({
    env: { OPENAI_API_KEY: 'sk-test', TOOLS_BASE_URL: 'https://stub' },
    tenant_id: 't1', telefone: '+5511', mensagem: 'meu link expirou',
    estado_atual: 'aguardando_sinal', dados_acumulados: {}, historico: [],
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    openaiClient: makeFakeOpenAI({
      proxima_acao: 'reservar_horario', resposta_cliente: 'reservei',
      slot_inicio: '2026-05-14T13:00:00Z', slot_fim: '2026-05-14T16:00:00Z',
      valor_pedido_cliente: null, payload_portfolio: null,
    }),
  });
  assert.equal(r.ok, true);
});

test('runAgent: silent force pergunta quando slot fora da lista', async () => {
  setupFakeFetch({
    'consultar-horarios': { ok: true, slots: [{ inicio: '2026-05-12T17:00:00Z', fim: '2026-05-12T20:00:00Z', legenda: 'ter' }] },
    'consultar-portfolio-disponivel': { ok: true, portfolio_disponivel: false },
  });
  const r = await runAgent({
    env: { OPENAI_API_KEY: 'sk-test', TOOLS_BASE_URL: 'https://stub' },
    tenant_id: 't1', telefone: '+5511', mensagem: 'qua',
    estado_atual: 'escolhendo_horario', dados_acumulados: {}, historico: [],
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    openaiClient: makeFakeOpenAI({
      proxima_acao: 'reservar_horario', resposta_cliente: 'reservado',
      slot_inicio: '2026-05-99T99:99:99Z', slot_fim: '2026-05-99T99:99:99Z',
      valor_pedido_cliente: null, payload_portfolio: null,
    }),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'pergunta'); // silent force
  assert.match(r.resposta_cliente, /nao esta na lista|escolhe/i);
});
```

- [ ] **Step 2: Rodar testes — confirma FAIL**

```bash
node --test tests/agent/route-runagent-proposta.test.mjs
```
Expected: testes falham porque route.js ainda usa path antigo (`selectAgentBuilder` que não existe mais após Task 8).

- [ ] **Step 3: Reescrever `route.js`**

Edits em `functions/api/agent/route.js`:

1. **Topo:** Remover linhas 13-14 (`import { run } from '@openai/agents'` + `import { setDefaultOpenAIKey }`). Remover `setDefaultOpenAIKey` import — chamada será removida abaixo. Atualizar import de router:

```js
import { isStateImplemented, getNextState, validateAction } from './router.js';
import { runTattooAgent } from './agents/tattoo.js';
import { runCadastroAgent } from './agents/cadastro.js';
import { runPropostaAgent } from './agents/proposta.js';
```

(Remover `selectAgentBuilder, validateTransition` da lista.)

2. **`runAgent`** — substituir o `if (estado_atual === 'tattoo')` chamada `validateTransition` por `validateAction(estado_atual, out, mergedClientContext)`:

Antes (linhas 159-166):
```js
if (out.proxima_acao === 'handoff') {
  try {
    validateTransition('tattoo', out);
```

Depois:
```js
if (out.proxima_acao === 'handoff') {
  try {
    validateAction('tattoo', out, mergedClientContext);
```

Idem pro bloco `cadastro` linha 211.

3. **Substituir o `else` legado** (linhas 218-284) — TODO o branch antigo de proposta — pelo novo branch:

```js
} else if (PROPOSTA_SUBSTATES.has(estado_atual)) {
  // ─── Caminho C Fase 2B: PropostaAgent path novo (3 substates) ──────
  let out;
  try {
    out = await runPropostaAgent({
      env, tenant, conversa, clientContext: mergedClientContext,
      mensagem, historico, estado_atual,
      openaiClient,
    });
  } catch (e) {
    console.error('[agent/route] runPropostaAgent exhausted retries:', {
      message: e?.message, status: e?.status, code: e?.code,
    });
    out = buildFallbackOutput('proposta');
  }
  // Valida payload da acao contra contract (slot em ctx, valor<=proposto,
  // portfolio_disponivel). Schema strict ja garante shape (slot ISO,
  // valor>0). Aqui sao invariantes context-dependent.
  try {
    validateAction(estado_atual, out, mergedClientContext);
    working = out;
  } catch (e) {
    const reason = e?.message || '';
    if (/fora da lista/.test(reason)) {
      console.warn('[agent/route] silently force pergunta (slot fora):', reason);
      const slots = mergedClientContext.horarios_livres || [];
      const legendas = slots.map(s => s.legenda).filter(Boolean).join(', ') || '(nenhum slot disponivel)';
      working = forcePergunta(out, `Esse horario nao esta na lista — escolhe um destes? ${legendas}`);
      invariantCheck = { valid: false, reason };
    } else if (/> valor_proposto/.test(reason)) {
      console.warn('[agent/route] silently force pergunta (valor > proposto):', reason);
      working = forcePergunta(out, `O valor pedido excede o proposto — pode confirmar o valor?`);
      invariantCheck = { valid: false, reason };
    } else if (/portfolio_disponivel/.test(reason)) {
      console.warn('[agent/route] silently force pergunta (portfolio indisp):', reason);
      working = forcePergunta(out, `Posso te mostrar referencias depois — bora seguir?`);
      invariantCheck = { valid: false, reason };
    } else {
      console.error('[agent/route] proposta action contract violation:', reason);
      return { ok: false, error: 'invariant-violation', reason, status: 500 };
    }
  }
} else {
  return { ok: false, error: `estado_atual='${estado_atual}' nao implementado`, status: 501 };
}
```

4. **`onRequest`:** Remover linha 357 (`setDefaultOpenAIKey(env.OPENAI_API_KEY);`). Não-necessário pq `runtime.run` recebe `apiKey` explícito via `env.OPENAI_API_KEY`.

5. **`PROPOSTA_SUBSTATES`** já existe (linha 37) — manter.

- [ ] **Step 4: Confirmar nenhum import de `@openai/agents` resta em route.js**

```bash
grep '@openai/agents' functions/api/agent/route.js
```
Expected: vazio.

- [ ] **Step 5: Rodar testes — confirma PASS**

```bash
node --test tests/agent/route-runagent-proposta.test.mjs
node --test tests/agent/route-runagent.test.mjs
```
Expected: ambos passam (tattoo+cadastro testes existentes não regrediram; novos proposta passam).

- [ ] **Step 6: Commit**

```bash
git add functions/api/agent/route.js tests/agent/route-runagent-proposta.test.mjs
git commit -m "feat(fase2b): route.js branch Proposta novo + silent force pergunta + validateAction"
```

---

## Task 10: Cleanup `cadastro.js` — remove Legacy + buildCadastroAgent (Decisão 19/05)

**Objetivo:** Remover `LegacyCadastroOutputSchema`, `validateCadastroOutputInvariant`, `buildCadastroAgent` e import `@openai/agents` de `cadastro.js`. Após Task 6 (proposta migrado) e Task 8 (router não importa mais buildCadastroAgent), esses exports são órfãos.

**Files:**
- Modify: `functions/api/agent/agents/cadastro.js`

- [ ] **Step 1: Grep callers antes de deletar**

```bash
grep -rn 'LegacyCadastroOutputSchema\|buildCadastroAgent\|validateCadastroOutputInvariant' \
  functions/ tests/ scripts/ 2>/dev/null
```
Expected (após Tasks 6 + 8): só `cadastro.js` próprio + `tests/agent/cadastro-agent.eval.mjs` (que vai ser migrado na Task 12). Se tiver outro caller, parar e investigar.

- [ ] **Step 2: Reescrever `cadastro.js` enxuto**

Sobrescreve `functions/api/agent/agents/cadastro.js`:

```js
// functions/api/agent/agents/cadastro.js
// CadastroAgent — Caminho C Fase 2A (cleanup completo Fase 2B).
//
// Funcao pura sem classe Agent. Schema strict (discriminated union 4 branches)
// + Responses API + constrained decoding token-level. Handoff sem invariantes
// (nome+ISO+email-or-recusado) estruturalmente impossivel.
//
// Validador residual cross-field (handoff sem email exige email_recusado=true)
// vive em route.js (validateCadastroHandoffEmail).
//
// Cleanup Fase 2B: removidos LegacyCadastroOutputSchema, buildCadastroAgent,
// validateCadastroOutputInvariant (path antigo @openai/agents) — todos os
// callers migrados. Spec section 2.5 + decisao cravada 19/05 parte 2.
import { runtime } from '../../../_lib/agent-runtime/runtime.js';
import { generatePromptColetaCadastro } from '../../../_lib/prompts/coleta/cadastro/generate.js';
import { CadastroOutputSchema as _Schema } from './cadastro-schema.js';

export const CadastroOutputSchema = _Schema;

function normalizeHistoryItem(item) {
  if (item.role && item.content != null) return { role: item.role, content: item.content };
  if (item.autor && item.texto != null) {
    return { role: item.autor === 'cliente' ? 'user' : 'assistant', content: item.texto };
  }
  return item;
}

export async function runCadastroAgent({
  env,
  tenant,
  conversa,
  clientContext,
  mensagem,
  historico,
  openaiClient,
}) {
  const ctx = clientContext || {};
  const instructions = generatePromptColetaCadastro(tenant, conversa, ctx);

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
    outputSchema: CadastroOutputSchema,
    schemaName: 'cadastro_output',
  });
}
```

- [ ] **Step 3: Confirmar suite local ainda passa**

```bash
node --test 'tests/**/*.test.mjs' 2>&1 | tail -20
```
Expected: testes passam **exceto** `cadastro-agent.eval.mjs` que continua importando `LegacyCadastroOutputSchema` (vai ser arrumado Task 12). Esse arquivo é `.eval.mjs` — não está no glob `*.test.mjs`, portanto **não roda** em `npm test`. Confirmar via:

```bash
node -e "console.log(require('./package.json').scripts.test)"
```
Expected: `node --test 'tests/**/*.test.mjs'`. `.eval.mjs` fora do match — OK.

- [ ] **Step 4: Commit**

```bash
git add functions/api/agent/agents/cadastro.js
git commit -m "cleanup(fase2b): remove LegacyCadastroOutputSchema + buildCadastroAgent (callers migrados)"
```

---

## Task 11: Deletar `proposta-validator.test.mjs` (testes antigos)

**Objetivo:** Testes do validator pós-parse antigo (`validatePropostaOutputInvariant`/`PropostaOutputSchema`/`PROXIMA_ACAO_VALUES`) ficaram órfãos após Task 6 (export removido). Substituídos por `proposta-schema.test.mjs` (Tasks 2-4) + `proposta-actions.test.mjs` (Task 5).

**Files:**
- Delete: `tests/agent/proposta-validator.test.mjs`

- [ ] **Step 1: Confirmar substituição via grep**

```bash
grep -l 'PropostaOutputSchema\|validatePropostaOutputInvariant\|PROXIMA_ACAO_VALUES' tests/ -r
```
Expected: só `tests/agent/proposta-validator.test.mjs`.

- [ ] **Step 2: Deletar arquivo**

```bash
git rm tests/agent/proposta-validator.test.mjs
```

- [ ] **Step 3: Confirmar suite local 100%**

```bash
node --test 'tests/**/*.test.mjs' 2>&1 | tail -5
```
Expected: `# pass <N>`, `# fail 0`.

- [ ] **Step 4: Commit**

```bash
git commit -m "cleanup(fase2b): remove proposta-validator.test.mjs (substituido por schema+actions tests)"
```

---

## Task 12: Migrar `tattoo-agent.eval.mjs` pro path novo (runtime.run + strict)

**Objetivo:** Substituir `import { Agent, run } from '@openai/agents'` por `runtime.run` + `TattooOutputSchema` strict. Eval continua chamando OpenAI real — só muda o transport. Espelha `run-tattoo-agent.test.mjs` (mas com `openaiClient` undefined → cria default).

**Files:**
- Rewrite: `tests/agent/tattoo-agent.eval.mjs`

- [ ] **Step 1: Reescrever eval**

Sobrescreve `tests/agent/tattoo-agent.eval.mjs`:

```js
// Eval suite TattooAgent — 10 cenarios contra gpt-4o-mini real.
// Migrado Fase 2B: path novo (runtime.run + schema strict), sem @openai/agents.
//
// Run: OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) \
//      node --test tests/agent/tattoo-agent.eval.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runTattooAgent } from '../../functions/api/agent/agents/tattoo.js';
import { TattooOutputSchema } from '../../functions/api/agent/agents/tattoo-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '_fixtures', 'scenarios.json');
const { scenarios } = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY ausente — eval suite nao pode rodar');
  process.exit(1);
}

const FAKE_TENANT = {
  id: 'tenant-eval', nome_estudio: 'Estudio Eval',
  config_agente: { aceita_cobertura: true },
  gatilhos_handoff: [], faqs: [], fewshots: [],
};

for (const scenario of scenarios) {
  test(`${scenario.id} — ${scenario.descricao}`, async () => {
    const conversa = {
      id: `conv-${scenario.id}`,
      telefone: scenario.input.telefone,
      estado_agente: 'coletando_tattoo',
      dados_coletados: scenario.input.dados_acumulados || {},
      dados_cadastro: {},
    };
    // Normaliza historico: scenarios.json usa shape { role, content } direto.
    const historico = scenario.input.historico || [];
    // mensagens array antigo (multi-turn) — concatenar pra single user message
    // ou rodar cada mensagem como turn separado. Manter shape antigo (1 msg final).
    const mensagensArr = scenario.input.mensagens || [];
    const mensagem = mensagensArr[mensagensArr.length - 1]?.content || '';

    const out = await runTattooAgent({
      env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY },
      tenant: FAKE_TENANT,
      conversa,
      clientContext: {},
      mensagem,
      historico: [...historico, ...mensagensArr.slice(0, -1)],
    });

    const parsed = TattooOutputSchema.safeParse(out);
    assert.equal(parsed.success, true, `${scenario.id}: schema invalido — ${parsed.error?.issues?.[0]?.message || ''}`);

    if (scenario.expected.proxima_acao !== undefined) {
      assert.equal(out.proxima_acao, scenario.expected.proxima_acao,
        `${scenario.id}: proxima_acao esperado=${scenario.expected.proxima_acao} got=${out.proxima_acao}`);
    }
    if (scenario.expected.dados_completos !== undefined) {
      assert.equal(out.dados_completos, scenario.expected.dados_completos,
        `${scenario.id}: dados_completos esperado=${scenario.expected.dados_completos} got=${out.dados_completos}`);
    }
    if (Array.isArray(scenario.expected.campos_faltando_inclui)) {
      for (const c of scenario.expected.campos_faltando_inclui) {
        assert.ok(out.campos_faltando.includes(c),
          `${scenario.id}: esperava campos_faltando inclui '${c}' — got=${JSON.stringify(out.campos_faltando)}`);
      }
    }
    if (Array.isArray(scenario.expected.campos_conflitantes_inclui)) {
      for (const c of scenario.expected.campos_conflitantes_inclui) {
        assert.ok(out.campos_conflitantes.includes(c),
          `${scenario.id}: esperava campos_conflitantes inclui '${c}'`);
      }
    }
    if (Array.isArray(scenario.expected.dados_persistidos_NAO_inclui)) {
      for (const c of scenario.expected.dados_persistidos_NAO_inclui) {
        assert.ok((out.dados_persistidos || {})[c] == null,
          `${scenario.id}: esperava dados_persistidos NAO inclui '${c}'`);
      }
    }
    if (Array.isArray(scenario.expected.dados_persistidos_inclui)) {
      for (const c of scenario.expected.dados_persistidos_inclui) {
        const v = (out.dados_persistidos || {})[c];
        const filled = v !== null && v !== undefined && v !== '';
        assert.ok(filled, `${scenario.id}: esperava ${c} preenchido — got=${JSON.stringify(v)}`);
      }
    }
  });
}
```

- [ ] **Step 2: Confirmar zero refs `@openai/agents` no arquivo**

```bash
grep '@openai/agents' tests/agent/tattoo-agent.eval.mjs
```
Expected: vazio.

- [ ] **Step 3: Smoke local (1 cenário p/ confirmar sintaxe)**

```bash
OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) \
  node --test --test-name-pattern 'TC-01' tests/agent/tattoo-agent.eval.mjs
```
Expected: TC-01 passa (custo ~$0.002). Se falhar com erro de import/sintaxe, corrigir antes de seguir.

- [ ] **Step 4: Commit**

```bash
git add tests/agent/tattoo-agent.eval.mjs
git commit -m "refactor(fase2b): migra tattoo-agent.eval pro path novo (runtime.run, sem @openai/agents)"
```

---

## Task 13: Migrar `cadastro-agent.eval.mjs` pro path novo

**Objetivo:** Substituir `Agent + run + LegacyCadastroOutputSchema` por `runCadastroAgent + CadastroOutputSchema` strict.

**Files:**
- Rewrite: `tests/agent/cadastro-agent.eval.mjs`

- [ ] **Step 1: Reescrever eval**

Sobrescreve `tests/agent/cadastro-agent.eval.mjs`:

```js
// Eval suite CadastroAgent — 9 cenarios contra gpt-4o-mini real.
// Migrado Fase 2B: path novo (runCadastroAgent + schema strict).
//
// Run: OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) \
//      node --test tests/agent/cadastro-agent.eval.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runCadastroAgent, CadastroOutputSchema } from '../../functions/api/agent/agents/cadastro.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '_fixtures', 'scenarios-cadastro.json');
const { scenarios } = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY ausente — eval suite nao pode rodar');
  process.exit(1);
}

const FAKE_TENANT = {
  id: 'tenant-eval-cadastro', nome_estudio: 'Estudio Eval', nome_agente: 'Atendente',
  config_agente: {}, faqs: [], fewshots_por_modo: {},
};

for (const scenario of scenarios) {
  test(`${scenario.id} — ${scenario.descricao}`, async () => {
    const conversa = {
      id: `conv-${scenario.id}`,
      telefone: scenario.input.telefone,
      estado_agente: 'cadastro',
      dados_coletados: scenario.input.dados_acumulados || {},
      dados_cadastro: scenario.input.dados_cadastro || {},
    };
    const mensagensArr = scenario.input.mensagens || [];
    const mensagem = mensagensArr[mensagensArr.length - 1]?.content || '';
    const historico = [...(scenario.input.historico || []), ...mensagensArr.slice(0, -1)];

    const out = await runCadastroAgent({
      env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY },
      tenant: FAKE_TENANT,
      conversa,
      clientContext: {},
      mensagem,
      historico,
    });

    const parsed = CadastroOutputSchema.safeParse(out);
    assert.equal(parsed.success, true, `${scenario.id}: schema invalido — ${parsed.error?.issues?.[0]?.message || ''}`);

    if (scenario.expected.proxima_acao !== undefined) {
      assert.equal(out.proxima_acao, scenario.expected.proxima_acao,
        `${scenario.id}: proxima_acao esperado=${scenario.expected.proxima_acao} got=${out.proxima_acao}`);
    }
    if (scenario.expected.dados_completos !== undefined) {
      assert.equal(out.dados_completos, scenario.expected.dados_completos,
        `${scenario.id}: dados_completos esperado=${scenario.expected.dados_completos} got=${out.dados_completos}`);
    }
    if (scenario.expected.email_recusado !== undefined) {
      assert.equal(out.email_recusado, scenario.expected.email_recusado,
        `${scenario.id}: email_recusado esperado=${scenario.expected.email_recusado} got=${out.email_recusado}`);
    }
    if (Array.isArray(scenario.expected.campos_faltando_inclui)) {
      for (const c of scenario.expected.campos_faltando_inclui) {
        assert.ok(out.campos_faltando.includes(c),
          `${scenario.id}: esperava campos_faltando inclui '${c}' — got=${JSON.stringify(out.campos_faltando)}`);
      }
    }
    if (Array.isArray(scenario.expected.campos_conflitantes_inclui)) {
      for (const c of scenario.expected.campos_conflitantes_inclui) {
        assert.ok(out.campos_conflitantes.includes(c), `${scenario.id}: faltou ${c}`);
      }
    }
    if (Array.isArray(scenario.expected.dados_persistidos_NAO_inclui)) {
      for (const c of scenario.expected.dados_persistidos_NAO_inclui) {
        const v = (out.dados_persistidos || {})[c];
        const absent = v == null || v === '' || v === 'null' || v === 'undefined';
        assert.ok(absent, `${scenario.id}: ${c} deveria estar ausente — got=${JSON.stringify(v)}`);
      }
    }
    if (Array.isArray(scenario.expected.dados_persistidos_inclui)) {
      for (const c of scenario.expected.dados_persistidos_inclui) {
        const v = (out.dados_persistidos || {})[c];
        const filled = v !== null && v !== undefined && v !== '';
        assert.ok(filled, `${scenario.id}: ${c} deveria estar preenchido — got=${JSON.stringify(v)}`);
      }
    }
    if (scenario.expected.data_nascimento_iso_match === true) {
      const dn = out.dados_persistidos?.data_nascimento;
      assert.match(String(dn || ''), /^\d{4}-\d{2}-\d{2}$/,
        `${scenario.id}: esperava data_nascimento ISO — got=${dn}`);
    }
  });
}
```

- [ ] **Step 2: Smoke 1 cenário**

```bash
OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) \
  node --test --test-name-pattern 'PER-CAD-01' tests/agent/cadastro-agent.eval.mjs
```
Expected: PER-CAD-01 passa (custo ~$0.003).

- [ ] **Step 3: Commit**

```bash
git add tests/agent/cadastro-agent.eval.mjs
git commit -m "refactor(fase2b): migra cadastro-agent.eval pro path novo (runCadastroAgent strict)"
```

---

## Task 14: Migrar `proposta-agent.eval.mjs` pro path novo

**Objetivo:** Substituir `buildPropostaAgent + run + validator` por `runPropostaAgent + extractPropostaAction`. Os 11 cenários usam `validator(out)` pra checar invariantes — substituído por `validateAction(scenario.estado_atual, out, clientContext)` (wrapper do contract).

**Files:**
- Rewrite: `tests/agent/proposta-agent.eval.mjs`

- [ ] **Step 1: Reescrever eval**

Sobrescreve `tests/agent/proposta-agent.eval.mjs`:

```js
// tests/agent/proposta-agent.eval.mjs
// Eval suite PropostaAgent — 11 cenarios contra gpt-4o-mini real.
// Migrado Fase 2B: path novo (runPropostaAgent + 3 schemas strict + contract).
//
// Run: OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) \
//      node --test tests/agent/proposta-agent.eval.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runPropostaAgent } from '../../functions/api/agent/agents/proposta.js';
import { validateAction } from '../../functions/api/agent/router.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '_fixtures', 'scenarios-proposta.json');
const scenarios = JSON.parse(readFileSync(FIXTURES_PATH, 'utf-8'));

if (!process.env.OPENAI_API_KEY) {
  test('proposta-agent eval skipped (no OPENAI_API_KEY)', { skip: true }, () => {});
} else {
  for (const sc of scenarios) {
    test(`${sc.id} — ${sc.descricao}`, async () => {
      const tenant = {
        id: 't-eval', nome_estudio: 'Estudio Eval', nome_agente: 'Atendente',
        config_precificacao: { sinal_percentual: 30 },
        config_agente: {}, faqs: [], fewshots: [], fewshots_por_modo: {},
      };
      const conversa = {
        id: `conv-${sc.id}`, telefone: '5511999000001',
        estado_agente: sc.estado_atual,
        dados_cadastro: { nome: 'Cliente Eval' },
        dados_coletados: { decisao_desconto: sc.decisao_desconto ?? null },
        valor_proposto: sc.valor_proposto,
      };
      const clientContext = {
        valor_proposto: sc.valor_proposto,
        decisao_desconto: sc.decisao_desconto ?? null,
        horarios_livres: sc.horarios_livres || [],
        slots_reservados: sc.slots_reservados || [],
        proposta_status: sc.proposta_status || null,
        portfolio_disponivel: sc.portfolio_disponivel ?? false,
      };

      const out = await runPropostaAgent({
        env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY },
        tenant, conversa, clientContext,
        mensagem: sc.mensagem,
        historico: sc.historico || [],
        estado_atual: sc.estado_atual,
      });
      assert.ok(out, `${sc.id}: agent retornou null/undefined`);

      // Contract: invariantes context-dependent (slot em ctx, valor<=proposto).
      // Para acoes sem contrato (pergunta/oferecendo/erro/etc), validateAction
      // retorna null sem throw — esses passam por padrao.
      let contractOk = true;
      let contractReason = null;
      try {
        validateAction(sc.estado_atual, out, clientContext);
      } catch (e) {
        contractOk = false;
        contractReason = e.message;
      }
      assert.equal(contractOk, true, `${sc.id}: contract violation: ${contractReason || ''}`);

      for (const a of sc.assertions) {
        if (a.type === 'proxima_acao_equals') {
          assert.equal(out.proxima_acao, a.value,
            `${sc.id}/proxima_acao: esperado=${a.value} got=${out.proxima_acao}`);
        } else if (a.type === 'payload_includes') {
          for (const [k, v] of Object.entries(a.value)) {
            assert.equal(out[k], v, `${sc.id}/${k}: esperado=${v} got=${out[k]}`);
          }
        } else if (a.type === 'resposta_cliente_matches') {
          assert.match(out.resposta_cliente, new RegExp(a.value, 'i'),
            `${sc.id}/regex: pattern=${a.value} resposta="${out.resposta_cliente}"`);
        } else if (a.type === 'resposta_cliente_contains_slots') {
          const lower = (out.resposta_cliente || '').toLowerCase();
          for (const term of a.value) {
            assert.ok(lower.includes(term.toLowerCase()),
              `${sc.id}: faltou "${term}" em "${out.resposta_cliente}"`);
          }
        }
      }
    });
  }
}
```

- [ ] **Step 2: Verificar fixture TC-P09 tem `slots_reservados` populado**

```bash
jq '.[] | select(.id=="TC-P09") | {estado_atual, horarios_livres, slots_reservados}' \
  tests/agent/_fixtures/scenarios-proposta.json
```
Expected: TC-P09 com `estado_atual: 'aguardando_sinal'`. Se não tiver `slots_reservados`, **adicionar** ao fixture (ID exato no fixture e shape espelhando contract — `{ inicio, fim, agendamento_id? }`). Recomendado: 1 slot reservado batendo com o slot que o LLM precisa emitir.

```bash
# Se fixture precisa update — editar via jq:
jq 'map(if .id == "TC-P09" then .slots_reservados = [{"inicio":"2026-05-14T13:00:00Z","fim":"2026-05-14T16:00:00Z","agendamento_id":"agd-tcp09"}] else . end)' \
  tests/agent/_fixtures/scenarios-proposta.json > /tmp/p.json && \
  mv /tmp/p.json tests/agent/_fixtures/scenarios-proposta.json
```

- [ ] **Step 3: Smoke local — 1 cenário por substate (3 calls)**

```bash
OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) \
  node --test --test-name-pattern 'TC-P01|TC-P05|TC-P09' tests/agent/proposta-agent.eval.mjs
```
Expected: 3 testes passam (custo ~$0.01).

- [ ] **Step 4: Commit**

```bash
git add tests/agent/proposta-agent.eval.mjs tests/agent/_fixtures/scenarios-proposta.json
git commit -m "refactor(fase2b): migra proposta-agent.eval pro path novo + TC-P09 slots_reservados fixture"
```

---

## Task 15: Cleanup final `@openai/agents` — uninstall + grep verify

**Objetivo:** Remover `setDefaultOpenAIKey` de `whatsapp-pipeline.js`, atualizar comment de `sdk-init.js`, deletar `scripts/spike-openai-agents.mjs`, `npm uninstall @openai/agents`. Gate: `grep -r '@openai/agents' functions/ tests/` retorna vazio.

**Files:**
- Modify: `functions/_lib/whatsapp-pipeline.js`
- Modify: `functions/api/agent/_lib/sdk-init.js`
- Delete: `scripts/spike-openai-agents.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Remover `setDefaultOpenAIKey` de `whatsapp-pipeline.js`**

Em `functions/_lib/whatsapp-pipeline.js`:
- Remover linha 6: `import { setDefaultOpenAIKey } from '@openai/agents-openai';`
- Procurar chamadas `setDefaultOpenAIKey(env.OPENAI_API_KEY)` no arquivo (qualquer linha) e remover. (`runtime.run` injeta key explícita; não-necessário.)

```bash
grep -n 'setDefaultOpenAIKey' functions/_lib/whatsapp-pipeline.js
```
Expected após edit: vazio.

- [ ] **Step 2: Atualizar `sdk-init.js`**

Em `functions/api/agent/_lib/sdk-init.js`, substituir comments referenciando `@openai/agents`:

```js
// SDK init helpers — OpenAI key validation.
// Usado por functions/api/agent/route.js (validateEnv pre-runAgent).
// Pos Fase 2B: nao ha mais SDK init real — runtime.run injeta apiKey
// explicita. Este arquivo so faz validate.

const REQUIRED_VARS = ['OPENAI_API_KEY'];

export function getApiKey(env) {
  const key = env?.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY ausente no env');
  }
  return key;
}

export function validateEnv(env) {
  const missing = REQUIRED_VARS.filter(v => !env?.[v]);
  return { ok: missing.length === 0, missing };
}
```

- [ ] **Step 3: Deletar spike obsoleto**

```bash
git rm scripts/spike-openai-agents.mjs
```

- [ ] **Step 4: `npm uninstall @openai/agents`**

```bash
npm uninstall @openai/agents
```
Expected: `package.json` perde a entry `@openai/agents`. `package-lock.json` perde `@openai/agents` + transitives (`@openai/agents-openai`, `@openai/agents-core`, etc.).

- [ ] **Step 5: Grep verify zero refs**

```bash
echo '=== functions/ ===' && grep -r '@openai/agents' functions/ || echo '(vazio)'
echo '=== tests/ ===' && grep -r '@openai/agents' tests/ || echo '(vazio)'
echo '=== package.json ===' && grep '@openai/agents' package.json || echo '(vazio)'
```
Expected:
```
=== functions/ ===
(vazio)
=== tests/ ===
(vazio)
=== package.json ===
(vazio)
```

Se algum aparecer: corrigir e refazer Step 5.

- [ ] **Step 6: Suite local 100% pass**

```bash
node --test 'tests/**/*.test.mjs' 2>&1 | tail -10
```
Expected: `# pass <N>`, `# fail 0`, `# tests <N>` (todos verde).

- [ ] **Step 7: Commit**

```bash
git add functions/_lib/whatsapp-pipeline.js functions/api/agent/_lib/sdk-init.js \
        package.json package-lock.json
git rm scripts/spike-openai-agents.mjs 2>/dev/null || true
git commit -m "cleanup(fase2b): uninstall @openai/agents + remove setDefaultOpenAIKey + delete spike"
```

---

## Task 16: Eval re-baseline + smoke E2E gate

**Objetivo:** Rodar 3 evals (tattoo + cadastro + proposta) localmente contra OpenAI real. Confirmar gate: **0 HTTP 500** nos 3 agents × N=2 rounds, **smoke E2E 4/4** nos 3 substates Proposta (TC-P01 propondo_valor, TC-P05 escolhendo_horario, TC-P09 aguardando_sinal + 1 enviar_portfolio).

**Files:** (sem mudanças — só execução)

- [ ] **Step 1: Round 1 — tattoo eval**

```bash
OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) \
  node --test tests/agent/tattoo-agent.eval.mjs 2>&1 | tee /tmp/eval-tattoo-r1.log
```
Expected: 10/10 PASS, zero HTTP 500.

- [ ] **Step 2: Round 1 — cadastro eval**

```bash
OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) \
  node --test tests/agent/cadastro-agent.eval.mjs 2>&1 | tee /tmp/eval-cadastro-r1.log
```
Expected: ≥7/9 PASS (manter baseline), zero HTTP 500.

- [ ] **Step 3: Round 1 — proposta eval**

```bash
OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) \
  node --test tests/agent/proposta-agent.eval.mjs 2>&1 | tee /tmp/eval-proposta-r1.log
```
Expected: ≥10/11 PASS, **TC-P09 deve passar** agora (pre-fetch `slots_reservados` resolve), zero HTTP 500.

- [ ] **Step 4: Round 2 — repete os 3 evals (variance check)**

```bash
for agent in tattoo cadastro proposta; do
  OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) \
    node --test tests/agent/${agent}-agent.eval.mjs 2>&1 | tee /tmp/eval-${agent}-r2.log
done
```
Expected: mesmas métricas R1 (±1 cenário variance aceitável). Total custo R1+R2: ~$1.50.

- [ ] **Step 5: Compilar report**

```bash
echo '=== Eval Re-baseline Fase 2B ===' > /tmp/eval-fase2b-summary.md
for agent in tattoo cadastro proposta; do
  for r in r1 r2; do
    echo "--- ${agent} ${r} ---" >> /tmp/eval-fase2b-summary.md
    grep -E '# (pass|fail|tests)' /tmp/eval-${agent}-${r}.log >> /tmp/eval-fase2b-summary.md
  done
done
cat /tmp/eval-fase2b-summary.md
```

- [ ] **Step 6: Gate técnico**

Confirmar:
- [ ] 0 HTTP 500 em qualquer dos 6 runs (3 agents × 2 rounds)
- [ ] Tattoo pass rate R1+R2 ≥ 3/3 (regression gate Fase 1)
- [ ] Cadastro pass rate R1+R2 ≥ 7/9
- [ ] Proposta pass rate R1+R2 ≥ 10/11 **com TC-P09 passando**

Se algum gate falhar:
- Investigar logs em `/tmp/eval-*-r*.log`
- Se TC-P09 falhar: confirmar `prefetchPropostaContext` está populando `slots_reservados` corretamente e que o fixture tem `slots_reservados` no shape esperado.
- Se HTTP 500 em qualquer cenário: capturar stack trace, identificar se é schema/contract/runtime.

- [ ] **Step 7: Salvar eval report no repo**

```bash
mkdir -p docs/eval-reports
cp /tmp/eval-fase2b-summary.md docs/eval-reports/2026-05-19-fase2b-rebaseline.md
git add docs/eval-reports/2026-05-19-fase2b-rebaseline.md
git commit -m "docs(fase2b): eval re-baseline 3 agents × 2 rounds — gate PASS"
```

---

## Task 17: PR — push + descrição detalhada + abertura

**Objetivo:** Push da branch `feat/caminho-c-fase2b-proposta-strict` e abertura de PR com descrição cobrindo todas as mudanças (Proposta refator + cleanup completo `@openai/agents` + LegacyCadastroOutputSchema removido + 3 evals migrados + TC-P09 fix). Espelhar formato de PR #75 (Cadastro Fase 2A).

**Files:** (PR description)

- [ ] **Step 1: Confirmar branch + commits**

```bash
git status
git log main..HEAD --oneline
```
Expected: ~10-15 commits granulares (1 por task), working tree clean.

- [ ] **Step 2: Push branch**

```bash
git push -u origin feat/caminho-c-fase2b-proposta-strict
```

- [ ] **Step 3: Procurar template PR**

```bash
ls .github/PULL_REQUEST_TEMPLATE.md .github/PULL_REQUEST_TEMPLATE/ 2>/dev/null
```

- [ ] **Step 4: Criar PR via gh**

```bash
gh pr create --title "Caminho C Fase 2B: PropostaAgent strict schema + cleanup total @openai/agents" --body "$(cat <<'EOF'
## Summary

Aplica o padrao Caminho C (PR #71 Tattoo + PR #75 Cadastro) ao **PropostaAgent** — ultima peca customer-facing que usava @openai/agents. Cleanup completo no MESMO PR (decisao cravada 19/05 parte 2): zero refs ao SDK em `functions/` + `tests/`, `LegacyCadastroOutputSchema` removido, 3 evals migrados pro path novo, TC-P09 resolvido via pre-fetch enriquecido.

- **PropostaAgent vira funcao pura** (`runPropostaAgent`) com despacho via `SCHEMA_BY_STATE` map. 3 schemas strict (1 por substate: `propondo_valor`/`escolhendo_horario`/`aguardando_sinal`) — `ALLOWED_BY_STATE` antigo (validator pos-parse) vira discriminator literal, LLM nao consegue emitir acao fora do permitido.
- **Contracts consolidados em 1 arquivo** (`proposta-actions.js`): discriminated union de 3 branches (`reservar_horario`, `pediu_desconto`, `enviar_portfolio`) + 1 funcao `extractPropostaAction(out, ctx)`. Espelha cadastro-handoff.js — NAO 3 contratos separados.
- **`validateTransition` generalizado** -> `validateAction(estado, out, ctx)` cobrindo tattoo handoff + cadastro handoff + proposta-por-substate.
- **TC-P09 (P2 backlog 2026-05-09) resolvido:** `prefetchPropostaContext` busca `slots_reservados` quando `estado=aguardando_sinal`; contract aceita slot em `horarios_livres` OR `slots_reservados`.
- **Cleanup completo `@openai/agents`:** uninstall do package.json, `LegacyCadastroOutputSchema`/`buildCadastroAgent`/`buildPropostaAgent`/`selectAgentBuilder`/`BUILDERS` removidos, `setDefaultOpenAIKey` removido de route.js + whatsapp-pipeline.js, 3 evals (tattoo/cadastro/proposta) migrados pro `runtime.run`.

## Gate (todos PASS)

- [x] 0 HTTP 500 nos 3 agents × 2 rounds (smoke E2E)
- [x] Tattoo regression gate (Fase 1 nao regrediu)
- [x] Pass rate Cadastro >= 7/9
- [x] Pass rate Proposta >= 10/11 incluindo TC-P09 passando
- [x] `grep -r '@openai/agents' functions/ tests/` retorna vazio
- [x] `grep '@openai/agents' package.json` retorna vazio
- [x] Suite local 100% pass
- [x] Eval custo total <= $2.00

## Test plan

- [x] Spike pre-PR: 3 schemas distintos + slot ISO regex strict (~$0.05)
- [x] Unit tests: `proposta-schema.test.mjs` (3 schemas, ~28 cases), `proposta-actions.test.mjs` (~13 cases)
- [x] Integration tests: `route-runagent-proposta.test.mjs` (4 cenarios cobrindo 3 substates + silent force)
- [x] Eval re-baseline 3 agents × 2 rounds (smoke E2E gate)
- [x] Suite local `npm test` 100% verde

## Risk + mitigation

- Coexistencia removida: hard cut do SDK. Cadastro Fase 2A foi a unica fase que coexistia (PR #75); aqui finalizamos.
- `whatsapp-pipeline.js` `setDefaultOpenAIKey` removido: `runtime.run` ja recebe `apiKey` explicito via env. Smoke local confirma route + pipeline (3 agents) funcionam.
- Eval custo: $1.50 (3 agents × 2 rounds × ~$0.25 cada).

## Files changed

**Novos (7):** `proposta-schema.js`, `proposta-actions.js`, `proposta-schema.test.mjs`, `run-proposta-agent.test.mjs`, `proposta-actions.test.mjs`, `prefetch-proposta-context.test.mjs`, `_spike-fase2b-multi-schema.mjs`
**Reescritos (5):** `proposta.js`, `cadastro.js` (cleanup), `cadastro-agent.eval.mjs`, `proposta-agent.eval.mjs`, `tattoo-agent.eval.mjs`
**Modificados (5):** `router.js`, `route.js`, `prefetch-proposta.js`, `sdk-init.js`, `whatsapp-pipeline.js`
**Deletados (2):** `proposta-validator.test.mjs`, `scripts/spike-openai-agents.mjs`

## Predecessores

- PR #71 — Caminho C Fase 1: TattooAgent strict schema (mergeado 17/05)
- PR #75 — Caminho C Fase 2A: CadastroAgent strict schema (squash 7b01fcb, mergeado 19/05)

## Pos-merge desbloqueia

- P0 stale: Coleta fotos REAIS no Telegram (storage choice / retention LGPD).
- Fase 3 (independente): Hardening operacional / telemetria turn-level / dashboards retry.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Retornar URL do PR**

```bash
gh pr view --json url --jq .url
```

Compartilhar URL com o user.

---

## Self-Review Checklist

- **Spec coverage:** Spec sections 2.2 (3 schemas) → Tasks 2-4. 2.3 (proposta-actions + portfolio compartilhado) → Task 5. 2.4 (TC-P09 + validators residuais) → Tasks 5+7. 2.5 (cleanup @openai/agents) → Tasks 10+15. 4.B (estrutura proposta) → Tasks 2-6. 4.C (route.js modificações) → Task 9. 4.D (cleanup final) → Task 15. Decisões cravadas 19/05 parte 2 (#1 1 contract com union, #2 cleanup completo + migra evals) → Tasks 5+10+12+13+14+15. ✓
- **Placeholders:** Nenhum "TBD" / "appropriate" / "similar to". Cada step tem código exato ou comando exato. ✓
- **Type consistency:** `extractPropostaAction(out, ctx)` mesma signature em Tasks 5, 8, 9, 14. `validateAction(estado, out, ctx)` consistent. `runPropostaAgent({...estado_atual, openaiClient})` consistent Tasks 6, 9, 14. ✓
- **Task count:** 17 tasks (cap ≤15 recomendado mas estimativa user 14-18). 17 dentro do range. Considerei fundir mas T9 (route.js) + T10 (cadastro cleanup) tocam arquivos diferentes em sessões logicas separadas — não fundir.
- **Commits:** Cada task termina com 1 commit. Total ~15 commits granulares (alguns tasks têm múltiplos commits implícitos por step mas só 1 final).
- **Risks flagged:** TC-P09 tool selection (sub-step 0 Task 7), `@openai/agents-openai` transitive, eval cost cap, breaking change `setDefaultOpenAIKey`. ✓

---

**Status:** ready-to-execute. Aguarda aprovação do user pra invocar `/superpowers:executing-plans` ou `/superpowers:subagent-driven-development`.
