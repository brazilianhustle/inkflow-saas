---
name: Refator Coleta v2 → Multi-Agent — Sub-1 (TattooAgent PoC standalone)
description: Sub-1 do refator multi-agent — PoC standalone do TattooAgent (fase tattoo) via OpenAI Agents SDK. Valida arquitetura nova ANTES de comprometer Sub-2/3.
date: 2026-05-07
status: ready-to-plan
type: feature-refator
tags: [coleta-v2, multi-agent, openai-agents-sdk, poc, sub-1]
parent_decision: docs/auditoria/2026-05-07-auditoria-completa.md (n8n no hot path acumula 8 problemas — refator multi-agent reposicionado P0→P1 com escopo expandido)
related:
  - docs/superpowers/specs/2026-05-06-refator-prompts-coleta-v2-design.md (PR #28 — princípios R9/T7/altura_cm/foto_local portados como FUNDAÇÃO)
  - docs/superpowers/specs/2026-05-05-wire-tools-coleta-v2-bot-design.md (PR #27 — wire tools, sub-bug "imita pseudo-código" motivou refator)
---

# Refator Coleta v2 — Sub-1 (TattooAgent PoC standalone) — Design

## Contexto

Smoke E2E PR #33 (refator coleta-tattoo OBR_RECOMENDADO) provou empiricamente em 2026-05-06 que **tool-calling puro com gates não escala** pra workflows transacionais como Coleta v2. Sintomas observados em prod:

1. Bot pula single shots OBR_RECOMENDADO mesmo com warnings 🚨 explícitos no prompt
2. Bot inventa dados (e.g. `tamanho_cm=10` sem cliente dizer)
3. Bot não persiste foto via tool mesmo com R8 + Vision habilitados
4. Sinal `proxima_fase: 'cadastro'` da tool sempre vence prosa do prompt

Cada hotfix de prompt é band-aid — próximo edge case bate no mesmo princípio. Auditoria de 2026-05-07 (`docs/auditoria/2026-05-07-auditoria-completa.md`) confirmou que n8n no hot path acumula 8 problemas distintos. Decisão arquitetural cravada: migrar pra **Multi-Agent com Handoff explícito** usando **OpenAI Agents SDK** + remoção integrada de n8n.

**Decomposição do refator em 3 sub-features:**

| Sub | Escopo | Status |
|---|---|---|
| **Sub-1 (este spec)** | PoC standalone TattooAgent (fase tattoo) — valida arquitetura ANTES de comprometer 80% do trabalho | em design |
| Sub-2 | 3 agents restantes (Cadastro/Proposta/Portfolio) com arquitetura known-good | bloqueado por Sub-1 |
| Sub-3 | Cutover n8n (shrink workflow 38→~5 nodes + integração webhook Evolution real) | bloqueado por Sub-2 |

Sub-1 é PoC isolado: endpoint standalone que tu chamas via curl/postman com payload simulando msg do Telegram. **Zero toque em n8n ou Evolution real.** Smoke determinístico via eval framework. Se PoC validar 4 hipóteses cravadas, arquitetura segue pra Sub-2. Se falhar em alguma, replanejamos antes de comprometer 3 agents.

## Framing — 4 hipóteses a validar

| # | Hipótese | Como validamos |
|---|----------|----------------|
| H1 | Tools restritas eliminam "pula fase" | Eval TC-04 (cliente pergunta preço sem dados) — TattooAgent NÃO consegue chamar `handoff_to_cadastro` antes de `dados_completos=true` |
| H2 | Structured output JSON elimina "inventa dados" | Eval TC-05 (cliente diz "rosa pequena de 25cm") — TattooAgent devolve contradição via `proxima_acao='pergunta'` + `campos_conflitantes`, NUNCA preenche tamanho inferido |
| H3 | Handoff explícito em código (não LLM-decidido) funciona limpo | Eval TC-09 (handoff condicional) — router só roteia pra CadastroAgent quando TattooAgent retorna `proxima_acao='handoff'` E `dados_completos=true` |
| H4 | OpenAI Agents SDK roda OK em Cloudflare Pages Functions | Smoke endpoint POST `/api/agent/route` retorna 200 com response válida em < 5s |

Os 4 são bloqueantes pro Sub-2. Falha em qualquer um trava progressão.

## Decisões cravadas

| Decisão | Valor | Razão |
|---------|-------|-------|
| **Modelo LLM TattooAgent** | `gpt-4o-mini` | Paridade com baseline n8n hoje → eval apples-to-apples (se PoC der bom, foi a arquitetura). SDK-native (zero baseURL friction). Custo desprezível. Trocar pra Sonnet/Gemini é 1 linha em Sub-2. |
| **Framework** | `@openai/agents` (OpenAI Agents SDK oficial) via npm | Open-source, handoff first-class API, structured output embutido, tools por agent restritas, tracing built-in, TypeScript SDK pronto pra CF Pages. |
| **Superfície** | Endpoint POST standalone (`/api/agent/route`) | Zero toque em n8n/Evolution no Sub-1. Eval determinístico via curl/test. PoC isolado. |
| **Estado conversacional** | Recebido no payload (in-memory, NÃO Supabase no Sub-1) | Reduz superfície do PoC. Eval injeta estado mock. Persistência Supabase fica em Sub-3 quando integra com webhook real. |
| **Tools restritas (whitelist)** | 3 das 13 existentes: `dados_coletados`, `consultar_horarios`, `handoff_to_cadastro` | Tools fora do whitelist fisicamente inacessíveis ao TattooAgent. Outras tools (calcular_orcamento, enviar_orcamento_tatuador, enviar_portfolio, etc) ficam pra agents subsequentes em Sub-2. |
| **Tool `handoff_to_cadastro`** | NOVA — sinaliza fim de fase tattoo, retorna structured | Substitui o sinal `proxima_fase` do single-agent atual. Só pode ser chamada quando dados_completos=true. |
| **Mock de tools no eval** | `dados_coletados` mockada no eval (não toca Supabase) | Sub-1 valida agent loop, não persistência. Asserções verificam args passados pra tool. |
| **Structured output (Zod schema)** | `{ resposta_cliente, dados_persistidos, proxima_acao, dados_completos, campos_faltando, campos_conflitantes }` | Schema cravado força agent a sempre devolver shape válido. Bug "inventa dados" elimina via JSON validation. |
| **Tracing** | OpenAI Traces builtin (free tier 1k traces/mês) | Zero esforço extra. Cobre debug do PoC. Langfuse/custom dashboards ficam pra Sub-3. |
| **Cenários eval** | 9 cenários estáticos rodados via `node --test` (sem rede) | Cobertura: happy path, progressivo, vago, pula-fase, conflito, foto-via-descrição, JSON-shape, tools-whitelist, handoff-condicional. |
| **Princípios portados de PR #28** | R9 (devolver contradições, nunca decidir pelo cliente), T7 (tracking via histórico), altura_cm como campo próprio, foto_local OBR_RECOMENDADO, princípio de NUNCA inventar dados | FUNDAÇÃO do prompt do TattooAgent. Não re-deriva, porta literalmente. |
| **OUT of scope Sub-1** | 3 agents restantes, integração webhook Evolution real, migração/remoção n8n, comparativo de modelos, persistência Supabase, vision/audio na pipeline | Cada item vira Sub-2 ou Sub-3 quando arquitetura é known-good. |

## Arquitetura

### Arquivos novos

```
functions/api/agent/
├── route.js              # POST /api/agent/route — entry standalone
├── router.js             # state machine: estado_agente → escolha de agent
├── agents/
│   └── tattoo.js         # TattooAgent — prompt + tools + structured output
└── _lib/
    └── sdk-init.js       # @openai/agents config + auth (OPENAI_API_KEY)

functions/api/tools/
└── handoff-to-cadastro.js  # tool NOVA — sinaliza fim de fase

tests/agent/
├── tattoo-agent.eval.mjs   # eval framework (8 cenários)
└── _fixtures/
    └── scenarios.json      # cenários estáticos (input + expected output shape)
```

### Fluxo

```
POST /api/agent/route
  ↓
Body: { tenant_id, telefone, mensagem, estado_atual, dados_acumulados, historico }
  ↓
router.js — escolhe agent por estado_atual
  ↓
estado_atual='tattoo' → tattoo.js (TattooAgent)
  ↓
@openai/agents Agent.run(messages, tools=[dados_coletados, consultar_horarios, handoff_to_cadastro])
  ↓
gpt-4o-mini gera response com tool calls
  ↓
SDK executa tools com args validados
  ↓
TattooAgent retorna structured output (Zod schema)
  ↓
route.js retorna { resposta_cliente, estado_novo, dados_persistidos, proxima_acao, agent_usado: 'tattoo' }
```

### Contrato structured output do TattooAgent

```typescript
{
  resposta_cliente: string,           // texto pra mandar pro cliente no Telegram
  dados_persistidos: {                // o que a tool dados_coletados foi chamada COM
    estilo?: string,
    tamanho_cm?: number,
    altura_cm?: number,
    local_corpo?: string,
    cor_preferencia?: string,
    descricao_curta?: string,
    foto_local?: string,              // descrição textual da foto (vision externa)
  },
  dados_completos: boolean,           // true só quando todos OBR estão presentes
  campos_faltando: string[],          // OBR ainda não coletados
  campos_conflitantes: string[],      // ex: ["tamanho_cm: cliente disse 'pequena' E '25cm'"]
  proxima_acao: 'pergunta' | 'handoff' | 'erro',
}
```

Regra invariante: `proxima_acao='handoff'` ⟹ `dados_completos=true` ∧ `campos_conflitantes=[]`. Caso contrário, schema validation falha e SDK força agent a recompor.

## Cenários eval

| ID | Cenário | Hipótese | Asserções principais |
|----|---------|----------|----------------------|
| TC-01 | Happy path completo: cliente fornece todos campos OBR em 1 msg | H4 (smoke) | `dados_completos=true`, `proxima_acao='handoff'`, tool `dados_coletados` chamada com payload completo, tool `handoff_to_cadastro` chamada |
| TC-02 | Coleta progressiva: cliente fornece campos aos poucos (3 turns) | H4 | A cada turn, agent pergunta APENAS o que falta; após último, handoff |
| TC-03 | Cliente vago: "quero uma rosa pequena" | H1, H2 | NÃO infere `tamanho_cm` (não chama dados_coletados com tamanho). `campos_faltando` contém `tamanho_cm`. Pergunta tamanho específico. |
| TC-04 | Tentativa de pular fase: cliente pergunta preço sem dar dados | H1 | NÃO chama `handoff_to_cadastro`. NÃO chama `calcular_orcamento` (não está no whitelist). Foca em coletar OBR pendentes. |
| TC-05 | Dados conflitantes: "rosa pequena de 25cm" | H2 | `campos_conflitantes=['tamanho_cm']`. `proxima_acao='pergunta'`. Devolve contradição (R9 portado). |
| TC-06 | Foto via descrição: "olha essa rosa que mandei" + payload tem `foto_descricao='rosa minimalista preto'` | H4 | TattooAgent persiste `foto_local='rosa minimalista preto'` via `dados_coletados`. Confirma com cliente sem inventar detalhes não descritos. |
| TC-07 | Validação JSON output: qualquer input | H4 | Output sempre matches Zod schema. Sem null em campos required. |
| TC-08 | Tools whitelist: força agent a tentar tool fora (via prompt malicioso) | H1 | Agent NUNCA chama tool fora do whitelist. SDK fisicamente bloqueia. Asserção: `tool_call_log` só contém tools whitelisted. |
| TC-09 | Handoff condicional: cliente termina coleta perfeita | H3 | `handoff_to_cadastro` chamada APENAS quando `dados_completos=true`. Router roteia pra próximo estado (mock CadastroAgent). |

## Diretivas pro `superpowers:writing-plans`

- **Pipeline**: spec → plan via `superpowers:writing-plans` → exec via `superpowers:subagent-driven-development` (4-5 implementers + reviewers, padrão consolidado em B1-B4 do Sprint 2)
- **Decomposição em tasks**: sugestão (~4-5 tasks):
  - **Task 1**: Setup — `package.json` add `@openai/agents` + `_lib/sdk-init.js` + ENV vars (OPENAI_API_KEY) + smoke import test
  - **Task 2**: Tool nova `handoff_to_cadastro` (signature, schema args, no-op stub que retorna sinal)
  - **Task 3**: TattooAgent (`agents/tattoo.js`) — prompt portando R9/T7/altura_cm/foto_local + tools whitelist + Zod structured output
  - **Task 4**: Router + endpoint (`router.js` + `route.js`) — POST handler, dispatch por estado
  - **Task 5**: Eval framework (`tattoo-agent.eval.mjs` + fixtures) — 8 cenários, asserções por hipótese
- **Cada task = 1 commit granular** (padrão Sprint 2)
- **Prompt do TattooAgent**: começar com cópia LITERAL do prompt atual de `functions/_lib/prompts/coleta/` filtrado pra fase tattoo (estrutura modular pós-PR #28). Refatorações de tom/regras ficam pra Sub-2 quando arquitetura é known-good.
- **Eval framework**: usar `node --test` sem rede. `@openai/agents` permite mock do model layer? Investigar — alternativas: rodar contra OpenAI real com gpt-4o-mini ($desprezível) OU mock do client. Plan stage decide.
- **Smoke pós-merge**: `curl POST /api/agent/route` com payload TC-01 — espera 200 + `proxima_acao='handoff'`.

## Risk gotchas (pra plan stage prestar atenção)

| # | Gotcha | Mitigação |
|---|--------|-----------|
| 1 | `@openai/agents` em CF Pages Functions pode ter problema de bundle size ou Node-specific deps | Task 1 testa import + smoke local antes de prosseguir. Se falhar, considerar alternativa: chamar OpenAI API direto via fetch com tools schema manual (DIY orchestration). |
| 2 | OpenAI Agents SDK pode não suportar Zod structured output nativamente em gpt-4o-mini | Plan stage valida via docs `@openai/agents` antes de cravar Zod. Fallback: JSON Schema string + parse manual. |
| 3 | Eval com `node --test` sem rede exige mock do OpenAI client | Investigar `@openai/agents` test utilities. Se ausente, plan stage decide: (a) mock via `withMockFetch` padrão Sprint 2, (b) rodar contra OpenAI real (acrescenta ~$0.01/run, ~$0.10/eval suite). |
| 4 | TattooAgent pode "alucinar" handoff em TC-04 (pula fase) mesmo com tool restrita se prompt não enfatizar | Prompt explicita: "JAMAIS chame handoff_to_cadastro com dados_completos=false. Schema validation rejeitará e tu voltarás a perguntar." |
| 5 | Tool `dados_coletados` real grava em Supabase — eval mock precisa interceptar | Plan stage define mock interceptor. Pode ser SDK feature OU wrapper local. |
| 6 | Cenário TC-05 (conflito "pequena de 25cm") depende de prompt entender contradição | Prompt portado de R9 já tem essa lógica. Eval valida que persiste no agent novo. |
| 7 | TC-08 (prompt malicioso forçando tool fora do whitelist) — se SDK não bloqueia fisicamente, regras só no prompt são frágeis | Plan stage valida via docs SDK que tools whitelist é hard constraint, não soft. Se for soft, adicionar guardrail extra. |
| 8 | Custo OpenAI durante eval: 8 cenários × 5 turns × ~3k tokens × $0.15/MTok = ~$0.018 por eval suite. Dev iterando: ~$0.50-1/sessão. Trivial. | Sem mitigação necessária. Mencionar no plan pra calibrar expectativa. |

## Cross-references

- Auditoria que reposicionou prioridade: `docs/auditoria/2026-05-07-auditoria-completa.md`
- Refator de prompts anterior (princípios R9/T7/altura_cm/foto_local): `docs/superpowers/specs/2026-05-06-refator-prompts-coleta-v2-design.md` (PR #28)
- Wire tools que motivou (sub-bug "imita pseudo-código"): `docs/superpowers/specs/2026-05-05-wire-tools-coleta-v2-bot-design.md` (PR #27)
- Backlog ativo entry: `~/.claude/projects/-*/memory/InkFlow — Pendências (backlog).md` seção "P1 — Refator arquitetura Coleta v2 → Multi-Agent Handoff + remoção n8n"
- OpenAI Agents SDK docs: https://platform.openai.com/docs/agents (validar version + features no plan stage)

## Estimativa final

| Etapa | Tempo |
|-------|-------|
| Brainstorm (este spec) | ~1h ✅ (em curso) |
| `superpowers:writing-plans` (plan macro) | ~1-1.5h |
| Execução via `subagent-driven-development` (4-5 tasks) | ~3-4h |
| Smoke + ajustes | ~30-45min |
| **Sub-1 total** | **~6-7h em 1-2 sessões** |

Sub-2 (3 agents restantes) e Sub-3 (cutover n8n) ficam pra próximas sessões dedicadas. Total refator inteiro estimado: ~18-22h em 4-5 sessões (Sub-1 + Sub-2 + Sub-3).

**Status pós-aprovação:** spec congelado → próximo passo `/plan` com este spec como input.
