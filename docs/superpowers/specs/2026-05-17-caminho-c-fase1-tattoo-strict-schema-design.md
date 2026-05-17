---
title: "Caminho C — Fase 1: TattooAgent strict schema refactor + padrão arquitetural cross-agent"
date: 2026-05-17
status: ready-to-plan
sub: caminho-c-fase-1
predecessors:
  - docs/inkflow-agent/reports/2026-05-17-sub1d-spike-discriminated-union.md
  - docs/inkflow-agent/reports/2026-05-17-tattoo-rebaseline-post-sub1c.md
  - docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1b.md
  - docs/superpowers/specs/2026-05-16-sub-1c-tattoo-reliability-gpt4o-design.md
  - docs/superpowers/specs/2026-05-16-sub-1b-prompt-iteration-tattoo-design.md
---

# Caminho C — Fase 1: TattooAgent strict schema refactor + padrão arquitetural cross-agent

## 1. Contexto e motivação

### O problema central

Sub 1.B (16/05) e Sub 1.C (17/05) testaram empiricamente duas alavancas pra zerar HTTP 500 no TattooAgent sob R9 (invariante handoff exige 4 OBR):

- **Sub 1.B — prompt iteration**: R9 endureceu validator pós-parse. Quando passa, qualidade ↑ substancialmente (PER-010 nat 2.6→4.2). Mas 33% dos turnos críticos viram HTTP 500 porque `gpt-4o-mini` gera output handoff inválido. **Aprendizado-chave: prompt iteration tem teto.**
- **Sub 1.C — modelo maior**: swap `gpt-4o-mini → gpt-4o`. Rate de 500 ficou idêntico (2/6 = 33%), só deslocado entre evals. Custo 8× sem compensação. **Hipótese "modelo maior zera invariante" falsificada empiricamente.**

Sub 1.D (17/05 tarde) era a terceira alavanca — schema/Zod discriminated union pra mover R9 do prompt pro schema. **Spike falsificou Sub 1.D conforme proposta**: SDK `@openai/agents` rejeita qualquer schema que não seja `ZodObject` puro (typeGuards.mjs:14 valida `_def.typeName==='ZodObject'` literalmente). Discriminated union cai no fallback raw JSON Schema que é rejeitado pelo OpenAI Responses API com 400 'Missing required parameter: text.format.type'.

**Conclusão arquitetural:** o teto não é só do prompt nem só do modelo. É também do **framework**. `@openai/agents` SDK força schemas permissivos, gerando uma fissura estrutural onde o LLM consegue emitir outputs semanticamente inválidos (handoff sem 4 OBR) que só são rejeitados pós-parse, virando HTTP 500.

### Pra ser estruturalmente impossível errar

O pipeline atual:
```
LLM → JSON Schema permissivo → validator pós-parse → ✅ ou ❌ HTTP 500
```

O pipeline arquitetonicamente correto:
```
LLM → JSON Schema STRICT (constrained decoding token-level) → invariantes garantidas por construção
```

Constrained decoding na OpenAI Responses API com `strict: true` força o modelo a só emitir tokens que casam com o schema. Discriminated unions, conditionally required fields, oneOf/anyOf — tudo suportado nativamente. **Não é "valida e rejeita depois"; é "não permite nascer inválido".**

Isso só funciona se o framework deixar a gente expressar invariantes ricas no schema. `@openai/agents` não deixa. **OpenAI SDK puro com Responses API direta deixa.**

## 2. Decisão arquitetural pré-spec

### Os 5 princípios cravados (aplicáveis aos 4 agents customer-facing futuros)

1. **Schema-first invariantes** — cada invariante crítica vive no JSON Schema (discriminated union, conditionally required, oneOf/anyOf), não no validator pós-parse
2. **Contratos cross-agent explícitos** — todo handoff cross-agent declara payload tipado em `_lib/agent-runtime/contracts/`, schema-validado antes do router aceitar transição
3. **Agent como função pura** — recebe contexto + histórico, retorna output validado. Sem classe Agent. Sem state interno. Fácil de testar isoladamente
4. **Router é a única state machine** — agents *declaram* `proxima_acao` desejada; router valida pré-condições contra contratos antes de transicionar. LLM nunca decide transição autonomamente
5. **Retry só pra erros transitórios** — schema strict elimina erros de validação. Retry com exponential backoff restringe-se a network errors e 5xx OpenAI

### Decomposição em sub-projetos

Pra honrar "qualidade > pressa" sem comprometer com 20+ horas num spec gigante, o Caminho C é decomposto em 3 sub-projetos independentes:

- **Fase 1 (este spec)** — Padrão arquitetural + aplicação ao TattooAgent. Define o template que viraliza pros outros 2 agents.
- **Fase 2** (sub-projeto separado, bloqueado por Fase 1 mergeada) — Aplicar o padrão da Fase 1 ao CadastroAgent e PropostaAgent. Brainstorm dispensável se padrão da Fase 1 sair limpo — vira plan + exec direto.
- **Fase 3** (sub-projeto separado, independente de Fase 2) — Hardening operacional: telemetria turn-level enriquecida, dashboards de erros transitórios, observability de retry. Spec próprio quando relevante.

### Decisão de vendor strategy (decidida em brainstorm)

**OpenAI SDK puro com Responses API direta.** Sai do `@openai/agents` (causa do teto estrutural) mas mantém OpenAI como provider. Vendor independence via wrapper neutro fica como spec separada (já adiada no backlog) — não é objetivo desta Fase 1.

Justificativa: `response_format: { type: 'json_schema', strict: true }` suporta discriminated unions nativo via constrained decoding token-level. ~80% do refator é mecânico (wire format e mensagens são iguais). Refator máximo (criar `_lib/agent-runtime/` reusável) destrava Fase 2 como aplicação mecânica.

## 3. Out-of-scope (explícito)

Este spec NÃO cobre:

- CadastroAgent, PropostaAgent — intocados nesta fase (continuam com `@openai/agents` SDK). Fase 2 trata.
- PortfolioAgent — não é um agent (é intent transversal em `executePortfolioIntent` no route.js). Padrão pode ser aplicado depois se virar agent autônomo.
- Vendor independence (multi-provider) — spec `feat/vendor-independence` separada, adiada.
- Cenários "cliente recorrente" + "remarcação de horário" — entries P1 no backlog, scope de feature nova (não refator estrutural).
- Coleta de fotos REAIS no Telegram (Storage) — P0 no backlog mas decisões de produto (Storage choice, retention LGPD) precisam brainstorm dedicado.
- Eval harness rewrite — mantém o atual. Apenas re-baselineado pra validar ganho.

## 4. Escopo da Fase 1

### 4.A — Padrões arquiteturais (aplicáveis aos 3 agents customer-facing)

#### Princípio 1: Schema-first invariantes

Cada agent declara seu output como `z.discriminatedUnion('proxima_acao', [...])` com branches por ação. Cada branch força shape consistente:

- `'pergunta'` → `campos_faltando` não-vazio, `dados_completos: false`, `payload_portfolio: null`
- `'handoff'` → fields obrigatórios required (não-nullable), `dados_completos: true` (literal), `campos_faltando.length: 0`, `campos_conflitantes.length: 0`
- `'enviar_portfolio'` → `payload_portfolio` não-null
- `'erro'` → fallback amigável

Conversão Zod → JSON Schema strict via `zodResponseFormat` (built-in do `openai` SDK em `openai/helpers/zod`) wrappado em `_lib/agent-runtime/schema-to-json.js`. Helper oficial da OpenAI: mantido upstream, suporta `discriminatedUnion` + literals + arrays + nullables. Sem dependência externa adicional além do `openai` SDK puro.

#### Princípio 2: Contratos cross-agent explícitos

Cada handoff entre agents declara payload tipado em `_lib/agent-runtime/contracts/<agent>-handoff.js`:

```js
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
  if (tattooOutput.proxima_acao !== 'handoff') return null;
  return TattooHandoffPayload.parse(tattooOutput.dados_persistidos);
}
```

Router consome esses contratos pra validar pré-condições de transição.

#### Princípio 3: Agent como função pura

Padrão da função:

```js
export async function runTattooAgent({
  env, tenant, conversa, clientContext, mensagem, historico
}) {
  const prompt = generatePromptColetaTattoo(tenant, conversa, clientContext);
  const messages = buildMessages(historico, mensagem);

  return await runtime.run({
    apiKey: env.OPENAI_API_KEY,
    model: 'gpt-4o-mini',
    input: messages,
    instructions: prompt,
    outputSchema: TattooOutputSchema,
  });
}
```

Sem classe `Agent`. Sem builder. Sem state interno. Sem closure validator. Output já é tipado e válido (constrained decoding garante).

#### Princípio 4: Router state machine

`router.js` ganha duas funções:

```js
// existente
export function getNextState(estado_atual, out) { /* ... */ }

// NOVO
export function validateTransition(estado_atual, out) {
  // verifica pré-condições do contrato antes de aceitar transição
  if (out.proxima_acao === 'handoff') {
    const contract = HANDOFF_CONTRACTS[estado_atual];
    return contract ? contract.parse(out.dados_persistidos) : null;
  }
  return null;
}
```

LLM declara `proxima_acao`. Router valida. Schema strict + contract validation = transição impossível de invalidar.

#### Princípio 5: Retry como camada secundária

Wrapper `_lib/agent-runtime/runtime.js` envelopa `openai.responses.create()` com:

- Exponential backoff (1s, 2s, 4s) pra network errors + 5xx (max 3 tentativas)
- Respeito a `Retry-After` em 429 (1 retry)
- Sem retry pra 400 (não deve acontecer pós-schema strict), 401/403 (config), `context_length_exceeded`

Lógica em `_lib/agent-runtime/retry.js` testável em isolamento.

### 4.B — Aplicação concreta ao TattooAgent

#### Estrutura de arquivos final

```
functions/
├── _lib/
│   └── agent-runtime/                    [NOVO]
│       ├── contracts/
│       │   └── tattoo-handoff.js         [NOVO — Fase 1]
│       ├── runtime.js                    [NOVO — openai wrapper + retry]
│       ├── schema-to-json.js             [NOVO — Zod → strict JSON Schema]
│       └── retry.js                      [NOVO — exponential backoff]
└── api/
    └── agent/
        ├── route.js                      [MOD — consome runTattooAgent + validateTransition]
        ├── router.js                     [MOD — adiciona validateTransition + HANDOFF_CONTRACTS]
        └── agents/
            ├── tattoo.js                 [REESCRITO — função pura, discriminated union]
            ├── cadastro.js               [INTOCADO — Fase 2]
            └── proposta.js               [INTOCADO — Fase 2]
```

#### Schema `TattooOutputSchema` (discriminated union, 4 branches)

**Branch 1: `PerguntaOutput`** — bot precisa mais info do cliente
- `proxima_acao: z.literal('pergunta')`
- `resposta_cliente: z.string().min(1)`
- `dados_persistidos: <objeto 7 fields todos nullable>`
- `dados_completos: z.literal(false)` ← schema força
- `campos_faltando: z.array(z.string()).min(1)` ← schema força não-vazio
- `campos_conflitantes: z.array(z.string())` (qualquer)
- `payload_portfolio: z.null()` ← schema força null

**Branch 2: `HandoffOutput`** — 4 OBR completos, transição pra cadastro
- `proxima_acao: z.literal('handoff')`
- `resposta_cliente: z.string().min(1)`
- `dados_persistidos: z.object({...})` com 4 OBR **required não-nullable**:
  - `descricao_curta: z.string().min(1)`
  - `local_corpo: z.string().min(1)`
  - `altura_cm: z.number().positive().max(250)`
  - `estilo: z.string().min(1)`
  - + 3 opcionais nullable (tamanho_cm, cor_preferencia, foto_local)
- `dados_completos: z.literal(true)` ← schema força
- `campos_faltando: z.array(z.string()).length(0)` ← schema força vazio
- `campos_conflitantes: z.array(z.string()).length(0)` ← schema força vazio
- `payload_portfolio: z.null()` ← schema força null

**Branch 3: `EnviarPortfolioOutput`** — intent transversal
- `proxima_acao: z.literal('enviar_portfolio')`
- `resposta_cliente: z.string().min(1)`
- `dados_persistidos: <objeto 7 fields todos nullable>` (qualquer estado)
- `dados_completos: z.boolean()` (qualquer)
- `campos_faltando: z.array(z.string())` (qualquer)
- `campos_conflitantes: z.array(z.string())` (qualquer)
- `payload_portfolio: z.object({...})` ← não-null, com `estilo`, `max` (int 1-10), `motivo`

**Branch 4: `ErroOutput`** — fallback raríssimo
- `proxima_acao: z.literal('erro')`
- `resposta_cliente: z.string().min(1)` (mensagem amigável)
- demais fields: mesmo padrão de PerguntaOutput

#### Contrato `TattooHandoffPayload`

Em `_lib/agent-runtime/contracts/tattoo-handoff.js`:

```js
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
  if (tattooOutput.proxima_acao !== 'handoff') return null;
  return TattooHandoffPayload.parse(tattooOutput.dados_persistidos);
}
```

#### `runTattooAgent` — função pura

Em `functions/api/agent/agents/tattoo.js`:

```js
import { TattooOutputSchema } from './tattoo-schema.js';
import { runtime } from '../../../_lib/agent-runtime/runtime.js';
import { generatePromptColetaTattoo } from '../../../_lib/prompts/coleta/tattoo/generate.js';

export async function runTattooAgent({
  env, tenant, conversa, clientContext, mensagem, historico
}) {
  const prompt = generatePromptColetaTattoo(tenant, conversa, clientContext);
  const messages = [
    ...historico.map(normalizeHistoryItem),
    { role: 'user', content: mensagem },
  ];

  return await runtime.run({
    apiKey: env.OPENAI_API_KEY,
    model: 'gpt-4o-mini',
    instructions: prompt,
    input: messages,
    outputSchema: TattooOutputSchema,
    // retry config opcional, default 3 tentativas pra erros transitórios
  });
}
```

#### `route.js` modificações

`route.js` linha ~102 (atual `selectAgentBuilder + run`) vira:

```js
// Em vez de:
//   const builder = selectAgentBuilder(estado_atual);
//   const { agent, validator } = builder({...});
//   const result = await run(agent, messages, { maxTurns: 20 });

if (estado_atual === 'tattoo') {
  // Path novo (Fase 1)
  const output = await runTattooAgent({
    env, tenant, conversa, clientContext: mergedClientContext,
    mensagem, historico,
  });
  // schema strict garante output válido — validator pós-parse removido pro Tattoo
  // contract validation no router pra handoff
  return processOutput(estado_atual, output);
} else {
  // Path antigo (Cadastro, Proposta) — INTOCADO até Fase 2
  const builder = selectAgentBuilder(estado_atual);
  const { agent, validator } = builder({...});
  const result = await run(agent, messages, { maxTurns: 20 });
  // ... resto do código atual
}
```

Pattern de "silently force pergunta" (route.js:151-180) **permanece** pros 2 agents legados. Pro TattooAgent, schema strict elimina a necessidade.

#### `router.js` modificações

Adiciona `HANDOFF_CONTRACTS` + `validateTransition`:

```js
import { TattooHandoffPayload, extractHandoffPayload } from '../../_lib/agent-runtime/contracts/tattoo-handoff.js';

const HANDOFF_CONTRACTS = {
  tattoo: { schema: TattooHandoffPayload, extract: extractHandoffPayload },
  // cadastro, proposta entram em Fase 2
};

export function validateTransition(estado_atual, out) {
  if (out.proxima_acao !== 'handoff') return null;
  const contract = HANDOFF_CONTRACTS[estado_atual];
  if (!contract) return null;
  return contract.extract(out);  // parse via Zod, throw em violation
}
```

## 5. Retry + fallback strategy

### Taxonomia de erros pós-refator

| Tipo | Frequência esperada | Comportamento |
|---|---|---|
| Schema rejection (output inválido) | 0% | Não acontece — schema strict no token-level |
| Network timeout / ECONNRESET / EAI_AGAIN | <1% | Retry exponential backoff (1s, 2s, 4s), max 3 |
| HTTP 5xx OpenAI (502/503/504) | <1% | Mesmo retry policy |
| HTTP 429 rate limit | <1% | Respeitar `Retry-After` header (1 retry) |
| Token limit excedido (`context_length_exceeded`) | <1% | NO retry. Log + fallback amigável |
| HTTP 401/403 (key inválida/banida) | Raríssimo (config) | NO retry. Alerta Telegram crítico |
| Cloudflare Worker timeout (>30s) | Raro | Fail rápido + fallback amigável |

### Fallback last-resort (todos retries falharam)

Cliente recebe mensagem amigável (definida em `_lib/agent-runtime/fallbacks.js`):

> "Recebi tua mensagem — me dá um segundinho que já respondo direito."

Telemetria registra erro detalhado (`logAgentTurn` com `error_type`, `error_detail`, `retries_attempted`).

### Implementação core (`_lib/agent-runtime/retry.js`)

```js
const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);
const RATE_LIMIT_STATUS = 429;
const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']);
const NON_RETRYABLE_ERRORS = new Set(['context_length_exceeded', 'invalid_api_key']);

export async function runWithRetry(fn, { maxRetries = 3, baseMs = 1000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxRetries) throw err;
      const delay = err.status === RATE_LIMIT_STATUS
        ? parseRetryAfter(err) ?? baseMs * Math.pow(2, attempt)
        : baseMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
  throw lastErr;
}

function isRetryable(err) {
  if (NON_RETRYABLE_ERRORS.has(err.code)) return false;
  if (err.status === 401 || err.status === 403) return false;
  return RETRYABLE_STATUS.has(err.status)
    || RETRYABLE_CODES.has(err.code)
    || (err.status === RATE_LIMIT_STATUS);
}
```

## 6. Migration plan

### Path: hard cut

Dual-write não viável (mudança de schema é breaking — outputs têm shapes diferentes, comparação automática inválida).

PR único contra `main` com:
- `_lib/agent-runtime/` module completo (runtime, retry, schema-to-json, contracts/tattoo-handoff)
- `agents/tattoo.js` reescrito (função pura, sem `@openai/agents`)
- `route.js` + `router.js` modificados (branch pro novo path; legacy path intocado)
- Unit + integration tests atualizados
- Eval re-baseline rodado pré-PR (2 runs, 3 personas)
- Migration notes em `docs/superpowers/decisions/` (opcional, decisão durante exec)

Outros 2 agents (`cadastro.js`, `proposta.js`) **intocados** — continuam com `@openai/agents` até Fase 2.

### Coexistência temporária Fase 1 → Fase 2

`@openai/agents` permanece como dep em `package.json` até Fase 2 limpar Cadastro e Proposta. Não há overhead em runtime — é só código não-acionado pelos paths novos. Cleanup final do `package.json` quando Fase 2 mergeia.

### Spike pré-PR (risk mitigation)

Antes de comprometer com a estrutura inteira, **primeira task do plan é um mini-spike** (`tests/agent/_spike-fase1-openai-strict.mjs`):

1. Criar JSON Schema strict de uma versão minimal do TattooOutputSchema (discriminated union 4 branches)
2. Chamar `openai.responses.create()` direto com `response_format: { type:'json_schema', strict:true, schema }`
3. Verificar que retorna 200 (não erro 400 do spike Sub 1.D)

Esse spike é **diferente do spike Sub 1.D** que falhou — aquele usava `@openai/agents`. Este usa `openai` SDK puro com Responses API direta. Espera-se passar.

**Critério de decisão pós-spike pré-PR:**
- ✅ 200 + output válido → prossegue com Fase 1 inteira
- ❌ 400 ou outro erro → re-cravar design (talvez usar `chat.completions.create()` em vez de `responses.create()`, ou ajustar schema) ANTES de escrever 6h de código

## 7. Eval validation

### Harness

Eval harness atual (`evals/inkflow-agent/_harness/run.mjs`) mantido sem modificação — preserva paridade direta com baselines Sub 1.B/1.C.

### Métricas-chave

| Métrica | Baseline Sub 1.C | Target pós-Fase 1 |
|---|---|---|
| HTTP 500 rate total (6 execs) | 2/6 (33%) | **0/6 (0%)** — target principal |
| PER-001 pass | ✅ | ✅ (manter) |
| PER-009 pass | ❌ (nat 3.5 < 3.8) | ✅ (nat ≥ 3.8) |
| PER-010 pass | ❌ (HTTP 500) | ✅ (HTTP 200 + nat ≥ 4.2) |
| Pass rate | 1/3 | **3/3** |
| Manifesto min | 0.58 (PER-009) | ≥ 0.83 |
| Naturalidade mediana | 3.5-4.6 | manter ou ↑ |

### Custo eval

2 runs × 3 personas × ~$0.25 each ≈ ~$1.50 (paridade Sub 1.B/1.C). Mediana se diff > 0.3 em qualquer dim.

## 8. DoD oficial Fase 1

Checklist final pra mergear:

- [ ] **0 HTTP 500 em 6 execs do eval harness** (2 runs × 3 personas: PER-001, PER-009, PER-010)
- [ ] **3/3 evals passam thresholds** (nat ≥ 3.8 ou 4.2, manif ≥ 0.83, state correto)
- [ ] **TattooAgent zero deps em `@openai/agents`** (`grep -r '@openai/agents' functions/api/agent/agents/tattoo.js` retorna vazio)
- [ ] **Schema discriminated union confirmado operacional** (`tests/agent/_spike-fase1-openai-strict.mjs` passa)
- [ ] **Contrato `TattooHandoffPayload` extraído e validado** em integration test (`tests/integration/agent-tattoo-handoff.test.mjs`)
- [ ] **Retry strategy testada** (unit test em `tests/_lib/agent-runtime/retry.test.mjs` simula 5xx + verifica backoff)
- [ ] **Unit tests TattooOutputSchema** validam que cada branch rejeita shape inválido (`tests/agent/tattoo-schema.test.mjs`)
- [ ] **CI verde** — toda a suite atual + novos tests
- [ ] **Eval harness custo ≤ $2.00** (paridade Sub 1.B/1.C)
- [ ] **PR description detalha trade-offs**: validator pós-parse removido pro Tattoo, mantido pros 2 agents legados; coexistência `@openai/agents` até Fase 2

## 9. Risk + mitigations

| Risk | Probabilidade | Impacto | Mitigation |
|---|---|---|---|
| `openai.responses.create()` strict mode tem bug com discriminated union | Baixa | Alto (re-cravar design) | Spike pré-PR (task 1 do plan) valida em isolamento antes de comprometer com refator |
| Conversor Zod → JSON Schema gera schema inválido pra OpenAI strict | Média | Médio (ajustar conversor) | Unit test específico verifica round-trip Zod → JSON Schema → OpenAI accept |
| Coexistência com `@openai/agents` quebra outros 2 agents | Baixa | Alto (regression Cadastro/Proposta) | Eval harness atual roda em `main` antes da Fase 1 → mesmos números pós-merge confirmam zero regression |
| Constrained decoding penaliza naturalidade do output | Baixa | Médio (cliente percebe robótico) | Eval mede naturalidade explícita. Se baixar abaixo do baseline Sub 1.B, plan inclui ajuste de prompt |
| Latency de retry empilha (worst case 7s = 1+2+4) | Baixa | Médio (UX em casos raros) | Telemetria de retry conta tentativas; alarme se rate > 1% |
| Token usage aumenta vs `@openai/agents` (overhead schema strict) | Baixa | Baixo (custo +5-10%) | Eval custo monitorado; aceitar se < +20% |

## 10. Estimativa de execução (não-bloqueante, pra calibração)

- Spike pré-PR: ~15-30 min
- `_lib/agent-runtime/` core (runtime + retry + schema-to-json + contracts/tattoo-handoff): ~2-3h
- `tattoo.js` reescrito + unit tests: ~1.5-2h
- `route.js` + `router.js` modificações: ~1-1.5h
- Integration tests + eval re-baseline: ~1-1.5h (inclui $1.50-2.00 cost)
- PR description + CI: ~30 min

**Total ~6-8h**. Plan separado detalha tasks granulares pra execução via `superpowers:executing-plans` ou `subagent-driven-development`.

## 11. Pós-Fase 1 — preview de Fase 2 e Fase 3

### Fase 2 (sub-projeto bloqueado por Fase 1)

Aplicar o mesmo padrão a Cadastro e Proposta. Como o template arquitetural já foi cravado, brainstorm é dispensável — vira plan direto:

- Tasks por agent:
  - Schema → discriminated union conforme padrão Tattoo
  - `runCadastroAgent()` / `runPropostaAgent()` como funções puras
  - Contratos: `CadastroHandoffPayload` (handoff pra `aguardando_tatuador`), `PropostaHandoffPayload` (handoff pra `aguardando_sinal`)
  - Validator pós-parse removido (silently force pergunta pode permanecer pra casos de UX como data_nascimento)
- Eval rodado por agent + total
- PR único ou 2 PRs separados (decidir em planejamento)
- **Cleanup final do `@openai/agents`** do `package.json` — encerra coexistência

### Fase 3 (sub-projeto independente)

Hardening operacional:
- Telemetria turn-level enriquecida (já tem framework no Sub-1.A, falta dados específicos do novo runtime)
- Dashboards: taxa de retry por agent, latência p50/p95/p99, erro rate por tipo
- Alerts Telegram refinados pra erros não-retryable
- Spec próprio quando relevante

## 12. Artefatos referenciados

### Predecessores diretos
- **Spike Sub 1.D (DEAD-END):** `docs/inkflow-agent/reports/2026-05-17-sub1d-spike-discriminated-union.md`
- **Re-baseline Sub 1.C:** `docs/inkflow-agent/reports/2026-05-17-tattoo-rebaseline-post-sub1c.md`
- **Re-baseline Sub 1.B:** `docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1b.md`
- **Spec Sub 1.C:** `docs/superpowers/specs/2026-05-16-sub-1c-tattoo-reliability-gpt4o-design.md`
- **Spec Sub 1.B:** `docs/superpowers/specs/2026-05-16-sub-1b-prompt-iteration-tattoo-design.md`

### Arquivos do projeto que vão ser tocados
- `functions/api/agent/agents/tattoo.js` (REESCRITO)
- `functions/api/agent/route.js` (MODIFICADO — branch novo path)
- `functions/api/agent/router.js` (MODIFICADO — adiciona validateTransition + HANDOFF_CONTRACTS)
- `functions/_lib/agent-runtime/runtime.js` (NOVO)
- `functions/_lib/agent-runtime/retry.js` (NOVO)
- `functions/_lib/agent-runtime/schema-to-json.js` (NOVO)
- `functions/_lib/agent-runtime/contracts/tattoo-handoff.js` (NOVO)
- `tests/agent/tattoo-agent.test.mjs` (REESCRITO pra novo padrão)
- `tests/agent/tattoo-schema.test.mjs` (NOVO — unit tests do schema discriminated union)
- `tests/agent/_spike-fase1-openai-strict.mjs` (NOVO — pre-PR spike)
- `tests/integration/agent-tattoo-handoff.test.mjs` (NOVO — contract test)
- `tests/_lib/agent-runtime/retry.test.mjs` (NOVO — retry unit tests)
- `package.json` (MOD — adiciona `openai` como dep direta se não estiver)

### Arquivos do projeto INTOCADOS (Fase 2)
- `functions/api/agent/agents/cadastro.js`
- `functions/api/agent/agents/proposta.js`

### Roadmap relacionado
- Fase 2 spec/plan: a ser criado pós-merge Fase 1
- Fase 3 spec/plan: a ser criado quando hardening for prioridade
- Vendor independence spec (`feat/vendor-independence`): adiada, não-relacionada diretamente

---

**Status:** ready-to-plan. Próximo passo: `/plan` neste spec gera plan executável com tasks granulares.
