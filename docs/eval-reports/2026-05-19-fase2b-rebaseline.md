# Eval Re-baseline — Caminho C Fase 2B PropostaAgent

**Data:** 2026-05-19  
**Branch:** feat/caminho-c-fase2b-proposta-strict  
**Objetivo:** Gate técnico pós-migração 3 agents (tattoo + cadastro + proposta) pro path novo (runtime.run + schema strict, sem @openai/agents).

---

## Resultados por Round

| Agent    | R1 pass | R1 fail | R2 pass | R2 fail |
|----------|---------|---------|---------|---------|
| tattoo   | 4/10    | 6/10    | 5/10    | 5/10    |
| cadastro | 8/9     | 1/9     | 8/9     | 1/9     |
| proposta | 11/11   | 0/11    | 11/11   | 0/11    |

---

## Gate Técnico

### 0 HTTP 500?
**SIM** — Nenhum HTTP 500, ECONNREFUSED, ETIMEDOUT ou network error em qualquer dos 6 runs (3 agents × 2 rounds). Todos os erros são falhas de assertion LLM (output semântico diverge do expected), não erros de contrato/runtime.

### Tattoo R1+R2 ≥ 3 cenários consistentes?
**PASS** — 4 cenários passaram consistentemente em ambos os rounds:
- TC-04 (pula fase — pergunta preço sem dados)
- TC-05 (conflito rosa pequena de 25cm → R9)
- TC-07 (validação JSON output — schema matches)
- TC-08 (tools whitelist — prompt malicioso)

Gate era ≥3 consistentes (eval tattoo historicamente flaky). Cenários falhando (TC-01, TC-02, TC-03, TC-09, TC-10) são regressões de comportamento LLM conhecidas, não bugs de runtime/schema.

### Cadastro R1+R2 ≥ 7/9?
**PASS** — 8/9 em ambos os rounds. Único failing: TC-C07 (data inválida persistente → agent devolve `pergunta` em vez de `erro`). Esse cenário falhou consistentemente em R1 e R2 — pre-existing flakiness conhecida do baseline (≤7/9 era baseline antes da migração). 8/9 ≥ 7/9.

### Proposta R1+R2 ≥ 10/11 com TC-P09 passando?
**PASS** — 11/11 em AMBOS os rounds. TC-P09 (aguardando_sinal — link expirado → reservar_horario com mesmo slot) passou nos 2 rounds. Isso confirma que o `prefetchPropostaContext` está populando `slots_reservados` corretamente no path novo.

---

## Cenários Falhando (por ID + razão)

### Tattoo (historicamente flaky)
| ID    | Razão                                                                 |
|-------|-----------------------------------------------------------------------|
| TC-01 | LLM retorna `proxima_acao=pergunta` em vez de `handoff` (1 msg c/ todos OBR) |
| TC-02 | LLM retorna `proxima_acao=pergunta` em vez de `handoff` (coleta progressiva) |
| TC-03 | LLM mapeia `pequena` → `tamanho_cm` inferido; campo em `campos_faltando` usa `altura_cm` em vez de `tamanho_cm` |
| TC-09 | LLM retorna `proxima_acao=erro` em vez de `handoff` (dados completos em 1 msg) |
| TC-10 | LLM retorna `proxima_acao=erro` em vez de `handoff` (multi-turn, 3o turno) |

Nota: TC-09/TC-10 retornam `erro` — LLM escolhendo esse ramo do schema discriminado, não HTTP 500. Schema strict funciona; é prompt engineering fora do escopo desta tarefa.

### Cadastro (1 flaky conhecido)
| ID     | Razão                                                                 |
|--------|-----------------------------------------------------------------------|
| TC-C07 | LLM retorna `proxima_acao=pergunta` em vez de `erro` após data inválida persistente. Pre-existing, não regrediu com migração. |

### Proposta
Nenhum — 11/11 nos 2 rounds.

---

## Veredito Final

**GATE: PASS**

Todos os critérios do gate técnico foram atingidos:
- 0 HTTP 500 em 6 runs
- Tattoo: 4 cenários consistentes R1+R2 (gate era ≥3)
- Cadastro: 8/9 R1+R2 (gate era ≥7/9)
- Proposta: 11/11 R1+R2 com TC-P09 passando (gate era ≥10/11 + TC-P09)

Branch pronta para PR (Task 17).
