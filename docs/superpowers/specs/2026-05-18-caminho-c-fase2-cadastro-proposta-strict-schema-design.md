---
title: "Caminho C — Fase 2: CadastroAgent + PropostaAgent strict schema refactor"
date: 2026-05-18
status: ready-to-plan
sub: caminho-c-fase-2
predecessors:
  - docs/superpowers/specs/2026-05-17-caminho-c-fase1-tattoo-strict-schema-design.md
  - docs/superpowers/plans/2026-05-17-caminho-c-fase1-tattoo-strict-schema.md
---

# Caminho C — Fase 2: CadastroAgent + PropostaAgent strict schema refactor

## 1. Contexto e motivação

Este spec é a aplicação mecânica do padrão arquitetural cravado pela Fase 1 (PR #71, mergeado 17/05) aos 2 agents customer-facing restantes: **CadastroAgent** e **PropostaAgent**.

A Fase 1 estabeleceu 5 princípios + módulo `_lib/agent-runtime/` reusável + template concreto no TattooAgent. Brainstorm formal foi explicitamente dispensado no backlog porque "espelha mecanicamente" — vai direto pra plan + exec.

**Por que existir como spec próprio (não só plan):** apesar de mecânico no Cadastro, o PropostaAgent tem uma diferença estrutural significativa — **NÃO tem handoff cross-agent**. Em vez disso, suas 8 actions transicionam pra estados terminais do funil (`aguardando_tatuador`, `lead_frio`, `aguardando_sinal`, `aguardando_decisao_desconto`) via state machine no router. Isso desloca o modelo de "contratos de handoff" pra "contratos por ação com side-effect", o que merece decisão cravada em spec.

Além disso, Cadastro tem invariante cross-field (`handoff sem email exige email_recusado=true`) que força decisão de design: explodir branches OU manter validator residual.

**O que NÃO muda da Fase 1:**
- Princípios arquiteturais (schema-first invariantes, contratos explícitos, agent como função pura, router como state machine única, retry só transitório)
- Módulo `_lib/agent-runtime/{runtime,retry,schema-to-json,fallbacks}.js` — reusado as-is
- Padrão `runXxxAgent({ env, tenant, conversa, clientContext, mensagem, historico })`
- OpenAI SDK puro + `responses.create()` + `zodResponseFormat`

## 2. Decisões arquiteturais pré-spec

### 2.1 Cadastro — 4 branches + 1 validator residual

Schema é discriminated union de 4 branches espelhando Tattoo:
- `pergunta` — `campos_faltando` não-vazio, `dados_completos: literal(false)`, `payload_portfolio: null`
- `handoff` — `dados_completos: literal(true)`, `nome`+`data_nascimento` required não-nullable, `email: string().nullable()`, `email_recusado: boolean()`, `campos_faltando: array().length(0)`, `campos_conflitantes: array().length(0)`, `payload_portfolio: null`
- `enviar_portfolio` — `payload_portfolio` não-null, demais campos com mesmo shape de pergunta
- `erro` — fallback amigável

**Invariante cross-field NÃO codificada no schema:** "handoff com `email===null` exige `email_recusado===true`". Razão:
- Codificar via discriminated union exigiria 5 branches (split handoff em `handoff_com_email` vs `handoff_sem_email_recusado`).
- Custo de manutenção do schema sobe (5 branches vs 4 limpos espelhando Tattoo), e a invariante é semanticamente trivial — schema strict já garante que `email_recusado` é sempre boolean.
- **Decisão:** manter 4 branches + 1 validator residual (`validateCadastroHandoffEmail(out)`) que silently force `proxima_acao='pergunta'` se violar. Esse é o único validator pós-parse residual do Cadastro.

**Formato ISO de `data_nascimento`:** codificado no schema via `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` (que traduz pra `pattern` em JSON Schema, suportado em strict mode). Elimina o silently-force-pergunta atual do route.js (linhas 71-74 do cadastro.js).

**Spike pré-PR confirma**: regex + nullable juntos em strict mode (parte do Task 1 do plan). Se falhar, fallback pra validator residual.

### 2.2 Proposta — schema por substate (3 schemas) + contratos por ação

**Decisão crítica:** 3 schemas separados (`PropostaPropondoValorSchema`, `PropostaEscolhendoHorarioSchema`, `PropostaAguardandoSinalSchema`), não 1 schema universal de 8 branches.

Por quê:
- `ALLOWED_BY_STATE` do PropostaAgent atual restringe quais actions são válidas por substate. Hoje vive em validator pós-parse (linhas 53-56 do proposta.js).
- 1 schema universal força router a aceitar action inválida pra substate e rejeitar pós-parse — viola o princípio "estruturalmente impossível errar".
- 3 schemas separados injetam `ALLOWED_BY_STATE` no enum `proxima_acao` de cada schema. Resultado: LLM **não consegue emitir** action fora do permitido. Schema strict é a fronteira.

Trade-off aceito: 3 schemas pra manter vs 1. Compensação: cada schema é mais simples (3-5 branches cada vs 8). Total de código não cresce significativamente.

**Mapeamento substate → actions permitidas (espelhando ALLOWED_BY_STATE atual):**

| Substate | Actions permitidas |
|---|---|
| `propondo_valor` | `pergunta`, `oferecendo_horario`, `pediu_desconto`, `adiou`, `reagendamento`, `cliente_agressivo`, `enviar_portfolio`, `erro` |
| `escolhendo_horario` | `pergunta`, `reservar_horario`, `reagendamento`, `cliente_agressivo`, `enviar_portfolio`, `erro` |
| `aguardando_sinal` | `pergunta`, `reservar_horario`, `reagendamento`, `cliente_agressivo`, `enviar_portfolio`, `erro` |

`erro` adicionado em todos (paridade Tattoo/Cadastro — branch fallback amigável).

### 2.3 Contratos cross-agent — Proposta é por ação

Cadastro segue padrão Tattoo: `CadastroHandoffPayload` em `_lib/agent-runtime/contracts/cadastro-handoff.js`.

Proposta **não** tem handoff. Mas tem 3 ações com side-effect que precisam de payload validado antes do router executar:

- `ReservarHorarioPayload` — `slot_inicio` ISO + `slot_fim` ISO + (validação extra) presente em `ctx.horarios_livres` ou `ctx.slots_reservados`.
- `PediuDescontoPayload` — `valor_pedido_cliente: number > 0`, opcionalmente `≤ ctx.valor_proposto` (validação extra com `ctx`).
- `EnviarPortfolioPayload` — `estilo: string`, `max: int 1-10`, `motivo: string`. **Compartilhado** entre Cadastro e Proposta. Extrair pra `_lib/agent-runtime/contracts/portfolio-intent.js`.

Adições no router:

```js
// router.js
const ACTION_CONTRACTS = {
  cadastro: { handoff: extractCadastroHandoff, enviar_portfolio: extractPortfolioIntent },
  propondo_valor:     { pediu_desconto: extractPediuDesconto, enviar_portfolio: extractPortfolioIntent },
  escolhendo_horario: { reservar_horario: extractReservarHorario, enviar_portfolio: extractPortfolioIntent },
  aguardando_sinal:   { reservar_horario: extractReservarHorario, enviar_portfolio: extractPortfolioIntent },
};

export function validateAction(estado_atual, out) {
  const contracts = ACTION_CONTRACTS[estado_atual] || {};
  const extract = contracts[out?.proxima_acao];
  if (!extract) return null;
  return extract(out);  // throw em violation
}
```

Substitui o `validateTransition` atual da Fase 1 (que era handoff-only). Backward-compatible: handoff continua sendo um caso especial dentro de `ACTION_CONTRACTS`.

**Nota sobre validações context-dependent:** algumas extrações precisam de `ctx` (ex: `lookupHorario(ctx.horarios_livres, ...)`, `valor_pedido_cliente <= ctx.valor_proposto`). O contract recebe `(out, ctx)` como assinatura, idêntico ao padrão do Tattoo Fase 1 (que recebia apenas `out` porque não tinha cross-validation com ctx).

### 2.4 Validators pós-parse residuais

Padrão da Fase 1 removeu o validator pós-parse do Tattoo (schema strict garante). Na Fase 2, removidos **na maior parte**, mas residuais permanecem em 2 casos específicos:

1. **Cadastro `email_recusado` cross-field** (descrito em 2.1) — silently force pergunta.
2. **Proposta TC-P09 follow-up** (P2 backlog 2026-05-09) — quando `proxima_acao=reservar_horario` em `aguardando_sinal`, slot pode bater em `ctx.slots_reservados` (agendamento ativo) E NÃO em `ctx.horarios_livres`. Solução **opção A** do backlog: incluir `slots_reservados` no `clientContext` via prefetch quando estado for `aguardando_sinal`. Validator do contract aceita slot que bate em **qualquer** das duas listas. Fora isso, sem validator residual.

Outros silent-force-pergunta atuais (data_nascimento não-ISO, etc.) são absorvidos pelo schema strict via regex/numeric constraints.

### 2.5 Cleanup `@openai/agents`

Depois que Cadastro e Proposta saem do `@openai/agents`, **nenhum agent customer-facing usa o SDK**. Cleanup final do `package.json`:

1. `npm uninstall @openai/agents`
2. `grep -r '@openai/agents' functions/ tests/` retorna vazio
3. Lock file atualizado
4. Commit dedicado pro cleanup ao fim do PR (não misturar com refator dos agents)

Ações futuras com SDK Agents (improvável dado lições aprendidas) exigem re-add explícito.

## 3. Out-of-scope (explícito)

- TattooAgent — já refatorado na Fase 1, intocado nesta fase.
- PortfolioAgent — não é agent (intent transversal em `executePortfolioIntent`). Não migra.
- `EnviarPortfolioPayload` ser estendido com novos campos (`max=20` etc.) — fora de escopo, plan futuro.
- Cenários "cliente recorrente" + "remarcação de horário" — entries P1 no backlog, novo agent.
- Coleta fotos REAIS no Telegram — P0 stale no backlog, desbloqueado apenas após este spec mergear.
- Vendor independence (multi-provider) — spec separada, adiada.
- Eval harness rewrite — mantém o atual. Re-baseline pra validar ganho.
- Telemetria turn-level enriquecida — Fase 3 (sub-projeto independente).

## 4. Escopo

### 4.A — CadastroAgent

**Estrutura final:**
```
functions/_lib/agent-runtime/contracts/
├── cadastro-handoff.js                    [NOVO — Fase 2]
└── portfolio-intent.js                    [NOVO — Fase 2, compartilhado]

functions/api/agent/agents/
├── cadastro.js                            [REESCRITO — função pura]
└── cadastro-schema.js                     [NOVO — discriminated union 4 branches]
```

**`CadastroOutputSchema`** (4 branches discriminated union):
- `pergunta`: `campos_faltando` ≥1, `dados_completos: literal(false)`, `payload_portfolio: null`, `email_recusado: boolean`.
- `handoff`: `nome: string().min(1)`, `data_nascimento: string().regex(ISO)`, `email: string().email().nullable()`, `email_recusado: boolean`, `dados_completos: literal(true)`, `campos_faltando: array().length(0)`, `campos_conflitantes: array().length(0)`, `payload_portfolio: null`.
- `enviar_portfolio`: `payload_portfolio: PortfolioIntentSchema` (não-null), demais campos qualquer.
- `erro`: `resposta_cliente` amigável, demais shape igual a pergunta.

**`runCadastroAgent`** — função pura idêntica em estrutura ao `runTattooAgent`. Sem classe Agent, sem closure validator.

**Validator residual**: `validateCadastroHandoffEmail(out)` — chamado pós-parse no route.js apenas pro caso edge "handoff com email=null E email_recusado=false". Silently force pergunta.

### 4.B — PropostaAgent

**Estrutura final:**
```
functions/_lib/agent-runtime/contracts/
├── proposta-actions.js                    [NOVO — extractReservarHorario, extractPediuDesconto]
└── portfolio-intent.js                    [reuso 4.A]

functions/api/agent/agents/
├── proposta.js                            [REESCRITO — função pura]
└── proposta-schema.js                     [NOVO — 3 schemas por substate]
```

**3 schemas (1 por substate)**:
- `PropostaPropondoValorSchema` — discriminated union 8 branches (7 actions + erro).
- `PropostaEscolhendoHorarioSchema` — discriminated union 6 branches (5 actions + erro).
- `PropostaAguardandoSinalSchema` — discriminated union 6 branches (5 actions + erro).

Cada branch força shape consistente:
- `pergunta`: `resposta_cliente` + sentinel nulls (slot_inicio/slot_fim/valor_pedido_cliente todos null, payload_portfolio null).
- `oferecendo_horario` (só propondo_valor): `resposta_cliente` apresenta horários inline, sentinels null.
- `reservar_horario` (só escolhendo_horario/aguardando_sinal): `slot_inicio: string().regex(ISO)`, `slot_fim: string().regex(ISO)`, `valor_pedido_cliente: null`, `payload_portfolio: null`.
- `pediu_desconto` (só propondo_valor): `valor_pedido_cliente: number().positive()`, slots null, payload null.
- `adiou`/`reagendamento`/`cliente_agressivo`: shape sentinel (igual pergunta).
- `enviar_portfolio`: `payload_portfolio: PortfolioIntentSchema` não-null.
- `erro`: fallback amigável.

**`runPropostaAgent`** — função pura. Recebe `estado_atual` no input, despacha pro schema correspondente:

```js
const SCHEMA_BY_STATE = {
  propondo_valor: PropostaPropondoValorSchema,
  escolhendo_horario: PropostaEscolhendoHorarioSchema,
  aguardando_sinal: PropostaAguardandoSinalSchema,
};

export async function runPropostaAgent({ env, tenant, conversa, clientContext, mensagem, historico, estado_atual }) {
  const schema = SCHEMA_BY_STATE[estado_atual];
  if (!schema) throw new Error(`Estado proposta desconhecido: ${estado_atual}`);
  const prompt = generatePromptColetaProposta(tenant, conversa, clientContext);
  const messages = buildMessages(historico, mensagem);
  return await runtime.run({
    apiKey: env.OPENAI_API_KEY,
    model: 'gpt-4o-mini',
    instructions: prompt,
    input: messages,
    outputSchema: schema,
  });
}
```

**Pre-fetch enriquecido pra `aguardando_sinal`** (P2 backlog TC-P09): `prefetchPropostaContext` busca agendamento ativo via tool e injeta `slots_reservados` no `clientContext` quando estado for `aguardando_sinal`. Contract `extractReservarHorario` aceita slot em `horarios_livres` OR `slots_reservados`.

### 4.C — `route.js` modificações

Hoje route.js bifurca: `if (estado_atual === 'tattoo') runTattooAgent else selectAgentBuilder path antigo`.

Fase 2 expande pra todos os 5 estados implementados:
```js
if (estado_atual === 'tattoo') return processOutput(estado_atual, await runTattooAgent({...}));
if (estado_atual === 'cadastro') {
  const out = await runCadastroAgent({...});
  const violated = validateCadastroHandoffEmail(out);  // residual
  if (violated) return processOutput(estado_atual, forcePergunta(out, violated.reason));
  return processOutput(estado_atual, out);
}
if (PROPOSTA_SUBSTATES.includes(estado_atual)) return processOutput(estado_atual, await runPropostaAgent({...}));
return notImplemented(estado_atual);
```

`selectAgentBuilder` deletado de `router.js` (sem callers). `BUILDERS` map deletado. `buildCadastroAgent` e `buildPropostaAgent` deletados.

### 4.D — Cleanup final `@openai/agents`

Último commit do PR:
- `npm uninstall @openai/agents`
- Verificação grep zero refs em `functions/` + `tests/`
- Commit dedicado (não misturado).

## 5. Migration plan

### 5.1 Path: hard cut (paridade Fase 1)

Dual-write inviável — schemas mudam shape. PR único contra `main`:

1. **Cadastro** primeiro (mais simples), commits separados:
   - Schema novo
   - Contract
   - runCadastroAgent
   - route.js branch novo
   - Tests
2. **Proposta** depois (mais complexo, 3 schemas), commits separados:
   - 3 schemas
   - 2 contracts (proposta-actions, portfolio-intent reusado)
   - runPropostaAgent
   - route.js branch novo
   - Tests
3. **Cleanup `@openai/agents`** — commit dedicado, último antes do PR.

### 5.2 Spike pré-PR (Task 1 do plan)

Antes de comprometer com refator, **mini-spike** valida 2 features avançadas do strict mode:
- `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` (Cadastro `data_nascimento`)
- 3 schemas diferentes em 3 chamadas separadas pro mesmo agent (Proposta substates) — confirma que múltiplos schemas no mesmo runtime funcionam (esperado, mas barato validar).

Custo spike: ~$0.10. Reutiliza setup do spike Fase 1.

## 6. Eval validation

### 6.1 Harness

Eval harness atual mantido. Re-baseline em 2 cenários:
- **TattooAgent**: confirma zero regressão (Fase 1 já estabilizou).
- **CadastroAgent**: re-baseline directed sub-3.1 (PER-CAD-01 a PER-CAD-08).
- **PropostaAgent**: re-baseline directed sub-3.2 (PER-PROP-01 a PER-PROP-11, exceto TC-P09 cobrado por mudança).

### 6.2 Métricas-chave

| Métrica | Baseline atual | Target pós-Fase 2 |
|---|---|---|
| HTTP 500 rate (Cadastro 8 personas × 2 runs) | ≤1/16 | **0/16** |
| HTTP 500 rate (Proposta 11 personas × 2 runs) | ≤2/22 | **0/22** |
| TC-P09 (Proposta `aguardando_sinal` slot reservado) | 0/2 | **2/2** (pre-fetch enriquecido) |
| Pass rate Cadastro | ≥7/8 | **≥7/8** (manter) |
| Pass rate Proposta | 10/11 | **11/11** |
| HTTP 500 Tattoo (regression gate) | 0/6 | **0/6** (manter Fase 1) |

### 6.3 Custo eval

3 agents × ~6 personas médio × 2 runs × $0.04 ≈ ~$1.50. Mediana se diff > 0.3.

## 7. DoD oficial Fase 2

- [ ] **0 HTTP 500 nos 3 agents em re-baseline N=2 cada persona**
- [ ] **Pass rate Cadastro ≥ 7/8** (manter)
- [ ] **Pass rate Proposta ≥ 11/11** (incluindo TC-P09 corrigido via pre-fetch)
- [ ] **Pass rate Tattoo regression gate ≥ 3/3** (Fase 1 não regrediu)
- [ ] **`grep -r '@openai/agents' functions/ tests/`** retorna vazio
- [ ] **`grep '@openai/agents' package.json`** retorna vazio
- [ ] **Suite local 100% pass** (todos os tests novos + existentes)
- [ ] **CI verde**
- [ ] **Eval custo ≤ $2.00**
- [ ] **Schemas discriminated union testados** (unit test rejeita shape inválido pra cada branch em cada schema)
- [ ] **Contratos cadastro-handoff + proposta-actions + portfolio-intent extraem corretamente** (unit + integration test)
- [ ] **PR description** detalha: cleanup `@openai/agents`, 3 schemas por substate Proposta, validators residuais Cadastro+Proposta TC-P09

## 8. Risk + mitigations

| Risk | Probabilidade | Impacto | Mitigation |
|---|---|---|---|
| `z.string().regex()` não traduz pra `pattern` JSON Schema strict | Baixa | Médio (cair pra validator residual) | Task 1 spike valida em isolamento. Fallback: regex no validator residual. |
| 3 schemas Proposta inflamam manutenção | Baixa | Baixo | Compartilhar branches comuns via helper Zod (`makeSentinelBranch`, etc.). |
| Cleanup `@openai/agents` quebra import dormente em test/script | Média | Médio | `grep -r '@openai/agents'` antes E depois do cleanup. Smoke local pré-PR. |
| Pre-fetch `slots_reservados` em `aguardando_sinal` introduz latency | Baixa | Baixo | Pre-fetch já existia (`prefetchPropostaContext`). Apenas 1 campo adicional. |
| Refator Cadastro+Proposta no mesmo PR gera review difícil (8h trabalho) | Média | Médio | Commits granulares por agent. PR description com mapa de mudanças. Subagent-driven-development pode dividir tasks. |
| Eval re-baseline custa mais que $2 | Baixa | Baixo | Cap rígido $3, abortar se passar. |
| TC-P09 fix via pre-fetch não resolve em produção real | Baixa | Médio | Eval cobre cenário. Smoke pré-PR confirma. |

## 9. Estimativa de execução (não-bloqueante, calibração)

- Spike pré-PR + eval baseline: ~30 min
- Cadastro (schema + contract + agent + route.js + tests): ~3-4h
- Proposta (3 schemas + contracts + agent + route.js + tests): ~4-5h
- Pre-fetch `slots_reservados` (TC-P09 fix): ~30 min
- Cleanup `@openai/agents`: ~15 min
- Re-baseline eval + report: ~1h
- PR description + CI: ~30 min

**Total ~10-12h**. Plan separado detalha tasks granulares pra execução via `superpowers:executing-plans` ou `subagent-driven-development`.

## 10. Pós-Fase 2

Fica desbloqueado:
- **P0 stale: Coleta fotos REAIS no Telegram** — schema strict de Tattoo+Cadastro+Proposta estabilizado destrava decisões de produto (Storage choice, retention LGPD) que estavam gated.
- **Fase 3 (independente)** — Hardening operacional: telemetria turn-level enriquecida, dashboards de erros transitórios, observability de retry. Spec próprio quando relevante.

## 11. Artefatos referenciados

### Predecessores diretos
- **Spec Fase 1:** `docs/superpowers/specs/2026-05-17-caminho-c-fase1-tattoo-strict-schema-design.md`
- **Plan Fase 1:** `docs/superpowers/plans/2026-05-17-caminho-c-fase1-tattoo-strict-schema.md`
- **Backlog P1 entry:** `InkFlow — Pendências (backlog).md` (linha 25)
- **Backlog P2 TC-P09 follow-up:** `InkFlow — Pendências (backlog).md` (linha 261)

### Arquivos do projeto tocados

**NOVOS:**
- `functions/api/agent/agents/cadastro-schema.js`
- `functions/api/agent/agents/proposta-schema.js`
- `functions/_lib/agent-runtime/contracts/cadastro-handoff.js`
- `functions/_lib/agent-runtime/contracts/proposta-actions.js`
- `functions/_lib/agent-runtime/contracts/portfolio-intent.js`
- `tests/agent/cadastro-schema.test.mjs`
- `tests/agent/proposta-schema.test.mjs`
- `tests/agent/_spike-fase2-strict-features.mjs`
- `tests/_lib/agent-runtime/contracts/cadastro-handoff.test.mjs`
- `tests/_lib/agent-runtime/contracts/proposta-actions.test.mjs`
- `tests/_lib/agent-runtime/contracts/portfolio-intent.test.mjs`
- `tests/integration/agent-cadastro-handoff.test.mjs`
- `tests/integration/agent-proposta-actions.test.mjs`

**REESCRITOS:**
- `functions/api/agent/agents/cadastro.js`
- `functions/api/agent/agents/proposta.js`
- `tests/agent/cadastro-agent.test.mjs`
- `tests/agent/proposta-agent.test.mjs`

**MODIFICADOS:**
- `functions/api/agent/route.js` (branches novos pra cadastro + proposta-substates)
- `functions/api/agent/router.js` (substitui `validateTransition` por `validateAction`, deleta `BUILDERS` + `selectAgentBuilder`)
- `functions/api/agent/_lib/prefetch-proposta-context.js` (adiciona `slots_reservados` quando estado=`aguardando_sinal`)
- `package.json` (uninstall `@openai/agents`)
- `package-lock.json`

### Roadmap relacionado
- Fase 3 spec/plan: a ser criado quando hardening for prioridade
- P0 "Coleta fotos REAIS no Telegram": desbloqueado pós-merge
- Vendor independence: adiada, separada

---

**Status:** ready-to-plan. Próximo passo: `/plan` neste spec gera plan executável com tasks granulares (estimativa ~14-18 tasks pelo padrão da Fase 1).
