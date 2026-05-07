---
name: Refator Coleta v2 → Multi-Agent — Sub-1 (TattooAgent PoC standalone)
description: Sub-1 do refator multi-agent — PoC standalone do TattooAgent (fase tattoo) via OpenAI Agents SDK. Valida arquitetura nova ANTES de comprometer Sub-2/3.
date: 2026-05-07
status: implemented-partial
type: feature-refator
outcome: docs/auditoria/2026-05-07-sub1-eval-results.md
hypotheses_status:
  H1_whitelist_hard: VALIDADA
  H2_structured_elimina_inventar: PARCIAL
  H3_handoff_condicional: PARCIAL
  H4_sdk_cf_pages: VALIDADA
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

**Glossário rápido** (para leitura standalone deste spec — definições completas em `docs/superpowers/specs/2026-05-06-refator-prompts-coleta-v2-design.md`):

- **R9** — princípio "devolver contradições, NUNCA decidir pelo cliente". Quando cliente fornece dados conflitantes (ex: "rosa pequena de 25cm"), agent pergunta de volta em vez de inferir.
- **T7** — princípio "tracking via histórico". Agent NÃO tenta deduzir estado a partir do que disse antes — confia no histórico estruturado passado no payload.
- **OBR_RECOMENDADO** — single shots que pedem dado obrigatório com confidence soft (estilo, tamanho_cm, altura_cm, local_corpo, foto_local). Marcado no prompt original como 🚨 mas single-agent ignora frequentemente.
- **foto_local** — campo onde fica a descrição textual da foto da referência tatuagem (no Sub-1, via vision externa simulada no payload — vision pipeline real é Sub-3).

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
| **Tools restritas (whitelist)** | **2 tools**: `dados_coletados` (existente — persiste em `conversas.dados_tattoo`) + `handoff_to_cadastro` (NOVA — Sub-1 cria) | Tools fora do whitelist fisicamente inacessíveis ao TattooAgent. Outras 12 tools existentes (calcular_orcamento, consultar_horarios, enviar_orcamento_tatuador, enviar_portfolio, gerar_link_sinal, etc) ficam pros agents Cadastro/Proposta/Portfolio em Sub-2. **Princípio**: tool `consultar_horarios` semanticamente pertence à fase proposta — cliente perguntar horário durante fase tattoo é fora-de-fase, TattooAgent deve responder "vou perguntar isso depois quando fechar a tatuagem" e seguir coletando. |
| **Tool `handoff_to_cadastro`** | NOVA — sinaliza fim de fase tattoo, retorna structured | Substitui o sinal `proxima_fase` do single-agent atual. Só pode ser chamada quando dados_completos=true. |
| **Mock de tools no eval** | Eval framework substitui as 2 tools whitelisted por wrappers no-op (`dados_coletados` registra args sem tocar Supabase; `handoff_to_cadastro` registra que foi chamada sem ação real). LLM call REAL contra OpenAI `gpt-4o-mini`. | Sub-1 valida agent loop + tool_call_log + structured output, NÃO persistência Supabase. Persistência real é Sub-3 quando integra com webhook. Asserções verificam args + ordem das tool calls. |
| **Structured output (Zod schema)** | `{ resposta_cliente, dados_persistidos, proxima_acao, dados_completos, campos_faltando, campos_conflitantes }` | Schema cravado força agent a sempre devolver shape válido. Bug "inventa dados" elimina via JSON validation. |
| **Tracing** | OpenAI Traces builtin SE disponível pra `gpt-4o-mini` (validar em Task 0 spike). Caso contrário, segue sem tracing no Sub-1 — tracing definitivo é Sub-3. | Tracing é nice-to-have, NÃO bloqueante. Free tier 1k traces/mês cobre PoC se funcionar. |
| **Cenários eval** | 9 cenários estáticos rodados via `node --test` chamando OpenAI real com `gpt-4o-mini` | Cobertura: happy path, progressivo, vago, pula-fase, conflito, foto-via-descrição, JSON-shape, tools-whitelist, handoff-condicional. Custo eval suite: ~$0.020. |
| **Princípios portados de PR #28** | R9 (devolver contradições, nunca decidir pelo cliente), T7 (tracking via histórico), altura_cm como campo próprio, foto_local OBR_RECOMENDADO, princípio de NUNCA inventar dados | FUNDAÇÃO do prompt do TattooAgent. NÃO re-deriva, NÃO modifica — importa literal de `functions/_lib/prompts/coleta/tattoo/` (já modular pós-PR #28). |
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
├── tattoo-agent.eval.mjs   # eval framework (9 cenários)
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
@openai/agents Agent.run(messages, tools=[dados_coletados, handoff_to_cadastro])
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

### Shape do `scenarios.json` (eval framework)

```typescript
{
  scenarios: [
    {
      id: "TC-01" | "TC-02" | ... | "TC-09",
      descricao: string,                         // human-readable
      hipoteses: ("H1" | "H2" | "H3" | "H4")[],  // quais hipóteses esse cenário valida
      input: {
        tenant_id: string,                       // mock UUID, usado só pra logs
        telefone: string,                        // mock "+5521..."
        mensagens: [                             // pode ter 1+ turns (TC-02 tem 3)
          { role: "user", content: string }
        ],
        estado_atual: "tattoo",                  // sempre tattoo no Sub-1
        dados_acumulados: object,                // dados já coletados em turns anteriores
        historico: object[]                      // turns prévios formatados
      },
      expected: {
        proxima_acao?: "pergunta" | "handoff" | "erro",
        dados_completos?: boolean,
        tools_chamadas?: string[],               // sublist de [dados_coletados, handoff_to_cadastro]
        tools_NUNCA_chamadas?: string[],         // ex: TC-04 espera ["calcular_orcamento", "consultar_horarios", "handoff_to_cadastro"]
        campos_faltando_inclui?: string[],       // partial match
        campos_conflitantes_inclui?: string[],
        dados_persistidos_NAO_inclui?: string[]  // TC-03: NÃO deve ter "tamanho_cm"
      }
    }
  ]
}
```

## Cenários eval

| ID | Cenário | Hipótese | Asserções principais |
|----|---------|----------|----------------------|
| TC-01 | Happy path completo: cliente fornece todos campos OBR em 1 msg | H4 (smoke) | `dados_completos=true`, `proxima_acao='handoff'`, tool `dados_coletados` chamada com payload completo, tool `handoff_to_cadastro` chamada |
| TC-02 | Coleta progressiva: cliente fornece campos aos poucos (3 turns) | H4 | A cada turn, agent pergunta APENAS o que falta; após último, handoff |
| TC-03 | Cliente vago: "quero uma rosa pequena" | H1, H2 | NÃO infere `tamanho_cm` (não chama dados_coletados com tamanho). `campos_faltando` contém `tamanho_cm`. Pergunta tamanho específico. |
| TC-04 | Tentativa de pular fase: cliente pergunta preço E disponibilidade sem dar dados | H1 | NÃO chama `handoff_to_cadastro`. NÃO chama `calcular_orcamento` nem `consultar_horarios` (não estão no whitelist). Foca em coletar OBR pendentes. Resposta tipo: "Vou te passar o preço e horários assim que a gente fechar os detalhes da tatuagem." |
| TC-05 | Dados conflitantes: "rosa pequena de 25cm" | H2 | `campos_conflitantes=['tamanho_cm']`. `proxima_acao='pergunta'`. Devolve contradição (R9 portado). |
| TC-06 | Foto via descrição: "olha essa rosa que mandei" + payload tem `foto_descricao='rosa minimalista preto'` | H4 | TattooAgent persiste `foto_local='rosa minimalista preto'` via `dados_coletados`. Confirma com cliente sem inventar detalhes não descritos. |
| TC-07 | Validação JSON output: qualquer input | H4 | Output sempre matches Zod schema. Sem null em campos required. |
| TC-08 | Tools whitelist: força agent a tentar tool fora (via prompt malicioso "calcule o orçamento agora" ou "consulte horários disponíveis") | H1 | Agent NUNCA chama tool fora do whitelist (`calcular_orcamento`, `consultar_horarios`, `enviar_orcamento_tatuador`, etc). SDK fisicamente bloqueia. Asserção: `tool_call_log` só contém tools de [`dados_coletados`, `handoff_to_cadastro`]. |
| TC-09 | Handoff condicional: cliente termina coleta perfeita | H3 | `handoff_to_cadastro` chamada APENAS quando `dados_completos=true`. Router roteia pra próximo estado (mock CadastroAgent). |

## Diretivas pro `superpowers:writing-plans`

- **Pipeline**: spec → plan via `superpowers:writing-plans` → exec via `superpowers:subagent-driven-development` (4-5 implementers + reviewers, padrão consolidado em B1-B4 do Sprint 2 — ver `docs/superpowers/specs/2026-05-07-evolution-tests-b4-design.md` pra referência de estrutura)
- **Pré-requisitos confirmados** (zero verificação no plan stage):
  - `OPENAI_API_KEY` já configurado em CF Pages env (usado por `functions/api/tools/simular-conversa.js:112`, `functions/api/cron/resumo-semanal.js:128`, `functions/api/dashboard/regenerate-resumo-semanal.js:228`, `functions/_lib/auditors/key-expiry.js:63`)
  - `functions/_lib/prompts/coleta/tattoo/` já existe com prompts modulares pós-PR #28 — TattooAgent IMPORTA dali sem filtrar
  - `functions/_lib/prompts/coleta/_shared/` contém código compartilhado entre fases — TattooAgent reusa
- **Decomposição em tasks** (6 tasks, Task 0 = spike obrigatório):
  - **Task 0 (SPIKE — gate hard pra Sub-1)**: Validar via docs/source `@openai/agents` que (a) bundle funciona em CF Pages Functions e (b) tools whitelist é HARD constraint (SDK fisicamente bloqueia tool fora do whitelist, NÃO regras só em prompt). Time-box: 30min. Output esperado: docs links + 1 smoke test rodando `Agent.run()` em CF Pages local. **Se Task 0 FALHA, Sub-1 PARA — abrir nova brainstorm pra arquitetura alternativa (DIY orchestration via `fetch` + tool schema manual, OU Anthropic SDK direct, OU outro framework). NÃO pivotar dentro do Sub-1 silenciosamente.**
  - **Task 1**: Setup — `package.json` add `@openai/agents` + `_lib/sdk-init.js` + smoke import test em CF Pages local
  - **Task 2**: Tool nova `handoff_to_cadastro` (signature, Zod schema args, no-op stub retornando `{handoff: true, proximo_estado: 'cadastro'}`)
  - **Task 3**: TattooAgent (`agents/tattoo.js`) — importa prompt de `functions/_lib/prompts/coleta/tattoo/` (sem modificar) + tools whitelist + Zod structured output
  - **Task 4**: Router + endpoint (`router.js` + `route.js`) — POST handler, dispatch por estado_atual, no Sub-1 só roteia 'tattoo' (outros estados retornam 501 Not Implemented com mensagem "fase X será implementada em Sub-2")
  - **Task 5**: Eval framework (`tattoo-agent.eval.mjs` + fixtures) — 9 cenários, asserções por hipótese
- **Cada task = 1 commit granular** (padrão Sprint 2 — squash final no merge da PR)
- **Prompt do TattooAgent**: importa LITERAL de `functions/_lib/prompts/coleta/tattoo/` + `functions/_lib/prompts/coleta/_shared/`. Zero modificação de tom/regras no Sub-1. Refator de prompt fica pra Sub-2.
- **Eval framework — decisão cravada**: rodar contra OpenAI real com `gpt-4o-mini`. Custo trivial (~$0.50-1/sessão dev iterando). Mock do client fica pra Sub-2 quando arquitetura é known-good (eval real é mais fiel mas mais lento; mock é necessário pra CI escalar). Plan stage NÃO decide entre real vs mock — é REAL.
- **Smoke pós-merge**:
  - **OBRIGATÓRIO**: `npm test tests/agent/tattoo-agent.eval.mjs` localmente — 9/9 cenários PASS (eval framework chama OpenAI real com `gpt-4o-mini`, tools mockadas no-op). Esse é o smoke definitivo do Sub-1.
  - **OPCIONAL**: `curl POST /api/agent/route` em prod APÓS deploy CF Pages, com `tenant_id` mock UUID inválido — espera HTTP 200 com structured output. Tool `dados_coletados` real vai falhar FK silenciosamente (tenant não existe) MAS o agent loop completa antes, demonstrando endpoint vivo. NÃO automatizado no Sub-1 — Sub-3 (cutover real) adiciona smoke automático com tenant real.

## Risk gotchas (pra plan stage prestar atenção)

| # | Gotcha | Mitigação |
|---|--------|-----------|
| 1 | `@openai/agents` pode não bundle em CF Pages Functions (Node-specific deps, dynamic require, etc) | **Task 0 (spike) gate hard**: 30min time-box. Se bundle não funciona, Sub-1 PARA — replanejamos arquitetura alternativa numa NOVA brainstorm. NÃO pivotar silenciosamente dentro do Sub-1. |
| 2 | OpenAI Agents SDK pode não suportar Zod structured output em `gpt-4o-mini` (validar OpenAI feature compatibility por modelo) | Task 0 (spike) também valida structured output. Se Zod não funciona com mini, fallback documentado: JSON Schema literal + `JSON.parse` + Zod runtime validation no callsite (extra ~10 LoC, zero arquitetura mudança). |
| 3 | Tool `dados_coletados` real grava em Supabase — eval real chamando agent vai disparar gravação real | Plan stage cria wrapper `dados_coletados_eval` (mesma interface, no-op em vez de Supabase) usado APENAS no eval framework. Tool real (`functions/api/tools/dados-coletados.js`) fica intocada. |
| 4 | TattooAgent pode "alucinar" handoff em TC-04 (pula fase) mesmo com tool restrita se prompt não enfatizar | Prompt já tem essa lógica via R9 portado de PR #28. Reforço extra no agent prompt: "JAMAIS chame `handoff_to_cadastro` quando `dados_completos=false`. Schema validation rejeitará e tu voltarás a perguntar." |
| 5 | TC-08 (prompt malicioso forçando tool fora do whitelist) — se SDK whitelist é SOFT (regras só em prompt), H1 inválido | **Resolvido em Task 0 (spike)**. Se whitelist é hard constraint do SDK, TC-08 passa trivialmente. Se for soft, Sub-1 falha gate H1 — replanejamos. |
| 6 | Cenário TC-05 (conflito "pequena de 25cm") depende de prompt entender contradição | Prompt portado de `functions/_lib/prompts/coleta/tattoo/` já tem R9 (devolver contradição). Eval valida que comportamento persiste no agent novo. Se falhar, escalada de prompt fica pra Sub-2 (refator de tom). |
| 7 | OpenAI Traces tracing pode não estar disponível pra `gpt-4o-mini` ou pode requer config extra (org-level setting) | Tracing é **nice-to-have no Sub-1**, não bloqueante. Se OpenAI Traces não funciona out-of-box, segue sem tracing. Tracing definitivo é Sub-3. |
| 8 | Custo OpenAI durante eval: 9 cenários × ~5 turns × ~3k tokens × $0.15/MTok input + $0.60/MTok output = ~$0.020 por eval suite. Dev iterando: ~$0.50-1/sessão. Trivial. | Sem mitigação necessária. Mencionar no plan pra calibrar expectativa. |
| 9 | `@openai/agents` é npm package — package-lock.json muda, dev container precisa rebuildar | Task 1 commit inclui `package.json` + `package-lock.json`. CI roda `npm ci` automaticamente. Sem ação adicional. |

## Cross-references

- Auditoria que reposicionou prioridade: `docs/auditoria/2026-05-07-auditoria-completa.md`
- Refator de prompts anterior (princípios R9/T7/altura_cm/foto_local): `docs/superpowers/specs/2026-05-06-refator-prompts-coleta-v2-design.md` (PR #28)
- Wire tools que motivou (sub-bug "imita pseudo-código"): `docs/superpowers/specs/2026-05-05-wire-tools-coleta-v2-bot-design.md` (PR #27)
- Backlog ativo entry: `~/.claude/projects/-*/memory/InkFlow — Pendências (backlog).md` seção "P1 — Refator arquitetura Coleta v2 → Multi-Agent Handoff + remoção n8n"
- OpenAI Agents SDK docs: https://platform.openai.com/docs/agents (validar version + features no plan stage)

## Estimativa final

| Etapa | Tempo |
|-------|-------|
| Brainstorm (este spec) | ~1h ✅ |
| `superpowers:writing-plans` (plan macro) | ~1-1.5h |
| Task 0 (spike `@openai/agents` em CF Pages + tools whitelist hard-constraint validation) | ~30min (gate pra Sub-1) |
| Execução via `subagent-driven-development` (Tasks 1-5) | ~3-4h |
| Smoke + ajustes | ~30-45min |
| **Sub-1 total** | **~6-7.5h em 1-2 sessões** |

Sub-2 (3 agents restantes) e Sub-3 (cutover n8n) ficam pra próximas sessões dedicadas. Total refator inteiro estimado: ~18-22h em 4-5 sessões (Sub-1 + Sub-2 + Sub-3).

**Status pós-aprovação:** spec congelado → próximo passo `/plan` com este spec como input.

---

## Outcome (preenchido pós-implementação 2026-05-07)

Detalhes completos em `docs/auditoria/2026-05-07-sub1-eval-results.md`.

**Status:** `implemented-partial` — arquitetura known-good, mas H2/H3 requerem tuning de prompt antes de Sub-2 comprometer 3 agents.

**Validação das 4 hipóteses:**
- **H1** (whitelist hard) ✅ VALIDADA — TC-08 PASS
- **H4** (SDK + Zod em CF Pages) ✅ VALIDADA — TC-07 PASS + GATE 4 spike
- **H2** (structured output elimina inventar) ⚠️ PARCIAL — schema OK, mas LLM real ignora R9 (TC-05 falhou)
- **H3** (handoff condicional) ⚠️ PARCIAL — agent não dispara handoff de forma confiável (TC-09 falhou)

**Bugs capturados pelo eval (que unit tests não pegavam):**
1. `.refine()` retorna ZodEffects → SDK só aceita ZodObject como outputType. Fix: schema cru + validator pós-parse.
2. OpenAI Responses API exige fields `.nullable().optional()` (vs apenas `.optional()`). Fix: aplicado em todos campos opcionais.

**Custo total Sub-1:** ~$0.40 (3 eval runs durante diagnose) + $0.001 spike = ~$0.40.

**Decisão:** PROCEED pra Sub-2 **com brainstorm prévio focado em H2/H3** (prompt tuning, não arquitetura).
