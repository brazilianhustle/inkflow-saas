---
id: FM-0009
slug: bot-confunde-mudanca-de-decisao
status: open
type: state_error
layers: [prompt, schema_invariant]
agents_affected: [TattooAgent]
personas_exposing: [PER-009]
created: 2026-05-15
last_change: 2026-05-15
owner: leandro
---

# FM-0009 — Bot acumula info antiga após cliente mudar de decisão

## Descrição
Cliente disse "rosa" no turn 2. No turn 4 muda pra "leão". Bot mantém `descricao_curta = "rosa"` em dados_persistidos OU mistura "rosa e leão". Resultado: orçamento errado, tatuador confuso.

## Gatilho
Cliente muda de ideia explicitamente ("ah não, espera, prefiro...", "esquece a rosa, leão").

## Impacto
- Cliente final: bot parece ignorar mudança
- Tatuador: handoff com info contraditória
- Business: má experiência tipo "bot burro"

## Diagnóstico
Prompt não tem regra "substituir dados_persistidos quando cliente muda decisão". LLM tende a aditivo, não substitutivo.

## Contramedida
- Phase 1: adicionar §4.X em `decisao.js` — "campo já preenchido + cliente menciona alternativa = substituir, não somar"
- Few-shot PER-009 com mudança de decisão
- Eval directed PER-009

## Regression test
- Pendente — Phase 1

## Eval gate
A definir.

## Histórico
- 2026-05-15: documentado no Phase 0

## Notas
Pode estar OK no prompt atual — eval real em Phase 1 valida.
