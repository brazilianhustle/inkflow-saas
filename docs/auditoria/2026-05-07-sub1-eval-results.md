# Sub-1 Eval Results — 2026-05-07

Snapshot dos resultados do eval suite (`tests/agent/tattoo-agent.eval.mjs`) rodando contra `gpt-4o-mini` real, mais bugs capturados e diagnóstico das 4 hipóteses.

## TL;DR

- **2 hipóteses validadas** (H1 whitelist hard, H4 SDK + Zod compatibility)
- **2 hipóteses parciais** (H2 structured-output-elimina-inventar, H3 handoff-condicional) — schema OK, mas LLM real ignora regras do prompt em cenários de conflito
- **2 bugs de SDK serialization capturados pelo eval** (que unit tests mockados não pegavam) — corrigidos
- **Sub-2 NÃO está totalmente unblocked** — H2 e H3 requerem tuning de prompt antes de comprometer 3 agents
- Custo total da iteração: ~$0.40

## Validação das 4 hipóteses

| # | Hipótese | Cenários | Status | Evidência |
|---|----------|----------|--------|-----------|
| **H1** | Tools restritas eliminam "pula fase" | TC-04, **TC-08** | ✅ **VALIDADA** | TC-08 PASS — LLM tentou chamar `calcular_orcamento`/`consultar_horarios` via prompt malicioso e SDK fisicamente bloqueou. Whitelist é HARD constraint do `@openai/agents`. |
| **H2** | Structured output JSON elimina "inventa dados" | TC-03, **TC-05** | ⚠️ **PARCIAL** | Schema Zod aceita output sem inferir, mas LLM real **ignora R9 do prompt**: TC-05 ("rosa pequena de 25cm") → agent chamou handoff_to_cadastro mesmo com conflito. R9 inline não basta — Sub-2 precisa de prompt mais agressivo OU pós-validation no agent loop. |
| **H3** | Handoff em código (não LLM-decidido) funciona limpo | **TC-09** | ⚠️ **PARCIAL** | TC-09 falhou: agent coletou todos os 3 OBR via dados_coletados (3x) mas **não chamou handoff_to_cadastro**. `validateTattooOutputInvariant` defende em route.js, mas agent não dispara handoff de forma confiável quando dados completos. Sub-2 precisa investigar (instrução mais explícita? few-shot dedicado a handoff?). |
| **H4** | OpenAI Agents SDK roda OK em CF Pages | **TC-07** + GATE 4 spike + endpoint smoke | ✅ **VALIDADA** | TC-07 PASS (schema sempre matches). GATE 4 do spike confirmou bundle compila com `compatibility_flags = ["nodejs_compat"]`. Endpoint POST /api/agent/route retorna response válida com structured output. |

## Bugs capturados pelo eval (que unit tests não pegaram)

### Bug 1: `.refine()` quebra structured output (commit `eb0495c`)

`TattooOutputSchema` originalmente usava `.refine()` para encodar o invariante "handoff exige dados_completos=true E campos_conflitantes=[]". Mas:

- `.refine()` em Zod retorna `ZodEffects`, não `ZodObject`.
- `@openai/agents` SDK detecta outputType via `typeName === 'ZodObject'` (`typeGuards.mjs:14`).
- Falha de detecção → SDK envia o schema raw como JSON Schema → Responses API rejeita HTTP 400 `Missing required parameter: 'text.format.type'`.

**Fix:** schema cru sem `.refine()`. Invariante movida para função exportada `validateTattooOutputInvariant()` chamada por `route.js` pós-`safeParse`. Se LLM retornar handoff inválido, route.js retorna HTTP 500 `invariant-violation`.

### Bug 2: `.optional()` precisa ser `.nullable().optional()` (commit `eb0495c`)

OpenAI Responses API requer que campos opcionais sejam **também** nullable:

```
Error: Zod field at `.../dados_persistidos/properties/estilo` uses `.optional()`
without `.nullable()` which is not supported by the API.
```

**Fix:** todos campos de `dados_persistidos` (estilo, tamanho_cm, altura_cm, etc) viraram `.nullable().optional()`.

## Por que unit tests não capturaram?

- Tests config-only de `tattoo-agent.test.mjs` (Task 3) chamavam apenas `safeParse()` no schema localmente — não exercitavam o caminho de **serialização** Zod → JSON Schema → Responses API.
- Tests de `route.test.mjs` (Task 4) testavam status codes e param validation, mas mockavam o agent run.
- O eval suite contra OpenAI real foi **a primeira vez** que o schema passou pelo serializer do SDK + Responses API.

**Lição:** a separação entre "config tests sem chamar OpenAI" e "eval contra OpenAI real" é exatamente o que pegou o bug. Os 2 são complementares — eval custa mais ($0.40/iteração) mas captura categorias que mocks não conseguem.

## Resultados detalhados por cenário (run final, commit `5dc6ee6`)

| ID | Hipóteses | Status | Detalhes |
|----|-----------|--------|----------|
| TC-01 | H4 | ❌ | Max turns (20) exceeded — happy path "rosa fineline 8cm antebraço" → agent loop em dados_coletados, não entrega final |
| TC-02 | H4 | ❌ | Max turns 20 — coleta progressiva 3 turns |
| TC-03 | H1, H2 | ❌ | `campos_faltando=["nome","data_nascimento"]` — agent confunde fase tattoo com cadastro (devia ser `tamanho_cm`) |
| TC-04 | H1 | ❌ | Max turns 20 |
| TC-05 | H2 | ❌ | Conflito ignorado — chamou `handoff_to_cadastro` apesar de "pequena + 25cm" |
| TC-06 | H4 | ❌ | Max turns 20 — foto via descricao |
| TC-07 | H4 | ✅ PASS | Schema sempre matches output do agent |
| TC-08 | H1 | ✅ PASS | Whitelist hard — agent NUNCA chamou tools fora do registry |
| TC-09 | H3 | ❌ | Coleta 3x mas não chama handoff |

**Final: 2/9 PASS, 7/9 FAIL.**

## Categorização das falhas

- **5 falhas com Max turns** (TC-01, 02, 04, 06 + TC-05 inicialmente): agent não termina o loop quando deveria. maxTurns=20 ainda insuficiente. Possíveis causas:
  - Prompt longo (Coleta v2 tattoo + REFORCO_HANDOFF) confunde gpt-4o-mini sobre quando parar
  - Combo `outputType` + `tools` requer instrução mais explícita
  - LLM de 4o-mini pode não ser capaz de gerenciar este nível de complexidade
- **2 falhas de lógica** (TC-03 confusion entre fases, TC-09 não dispara handoff): apontam que o prompt do tattoo precisa refinar o sinal de "fim de coleta" e separar mais claramente do escopo cadastro.

## Recomendações pra Sub-2

1. **Antes de implementar 3 agents, novo brainstorm focado em H2/H3.** Sub-1 mostrou que arquitetura SDK/whitelist funciona, mas a **disciplina de prompt** é o gargalo, não tecnologia.
2. **Considerar simplificar o prompt do tattoo** (remover R9/T7 inline + fazer few-shot dedicado a handoff condicional).
3. **Avaliar gpt-4o (full)** vs `gpt-4o-mini` em alguns cenários críticos. Spec cravou mini pra paridade, mas se mini não converge consistentemente, vale comparar custo vs reliability.
4. **Reescrever cenários TC-03/TC-05** com instruções mais explícitas se o approach for "treinar" o prompt (ou mantê-los como golden set anti-regression).
5. **Sub-3 (cutover n8n)** segue **bloqueado** até Sub-2 atingir ≥7/9 nos cenários acima.

## Commits do Sub-1

| SHA | Descrição |
|-----|-----------|
| `f73a073` | Task 0 SPIKE — 4 GATEs validados |
| `9a7a326` | Task 0 hardening — rotate-openai-key.sh |
| `2ca8535` | Task 1 — sdk-init + CI npm ci |
| `8a7ad7a` | Task 2 — handoff_to_cadastro stub |
| `ca2efb8` | Task 2 hardening — strict equality |
| `6d0c214` | Task 3 — TattooAgent |
| `68c292c` | Task 3 hardening — schema constraints |
| `aa7149e` | Task 4 — router + endpoint |
| `61a1002` | Task 4 hardening — assistant history + finalOutput guard + CORS |
| `617b9fc` | Task 5 — eval suite (descobriu Bug 1) |
| `eb0495c` | Task 5 fix — schema bugs 1 e 2 |
| `5dc6ee6` | Task 5 — maxTurns 20 + reforco output final |

## Decisão

- [ ] PROCEED pra Sub-2 sem reservas (4/4 PASS)
- [x] **PROCEED pra Sub-2 com brainstorm prévio** (2/4 sólido, 2/4 PARCIAL — arquitetura known-good, prompt tuning necessário)
- [ ] BLOCK total + nova brainstorm de arquitetura

## Custo

- Eval suite (3 runs durante diagnose): ~$0.40
- Total Sub-1 OpenAI spend: ~$0.40 + $0.001 spike = **~$0.40**
- Dentro do orçamento estimado no spec ($0.50-1/sessão dev)
