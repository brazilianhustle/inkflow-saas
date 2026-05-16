---
id: FM-0009
slug: bot-confunde-mudanca-de-decisao
status: open
type: state_error
layers: [prompt, schema_invariant]
agents_affected: [TattooAgent]
personas_exposing: [PER-009]
created: 2026-05-15
last_change: 2026-05-16
owner: leandro
notes: "Sub 1.B tentou R11 (substituição + validação substantiva) — eliminou 500s em PER-009 mas regrediu PER-001 happy path (2/3 com 500). Marcado intratável-via-prompt. Defer pra solução estrutural."
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
- 2026-05-16: **Sub 1.B baseline pós-R9 confirma reprodução empírica.** Audit Sub 1.A dizia "pode estar OK" — não estava. PER-009 msg 7 não valida nova ideia ao receber mudança radical (rosa → leão); P5 violado; state=0.
- 2026-05-16: **Sub 1.B Task 5 Iteração 2 (R11 mudança-de-decisão)** — adicionada regra R11 em `decisao.js` + Exemplo 11 em `exemplos.js`. R11 instruía: (a) SUBSTITUIR em `dados_persistidos`, (b) VALIDAR substantivamente nova ideia (P5), (c) PRESERVAR OBRs não-trocados, (d) continuar coleta. Resultados:
    - PER-009 (alvo): 4 runs, 0 HTTP 500 ✅ (eliminou 500s). Manifesto subiu pra 0.85+ em 1 run mas flake — pass rate ainda 0/4.
    - PER-001 (regression — happy path): 3 runs, 2 com HTTP 500 ❌. Pre-R11 baseline era 0/1 500. Regressão clara.
    - PER-010: 1 run sem 500 (estável).
- 2026-05-16: **Marcado intratável-via-prompt nesta sub.** Padrão recorrente confirmado (mesmo do FM-0005): cada regra nova traz tradeoff colateral em PER-001 happy path. Cap de 3 iterações da Task 5 não comporta refinar R11 condicional sem comprometer happy path. R11 + Exemplo 11 revertidos. Defer pra Sub futura — opções pra exploration:
    - Refator do invariante pra ser stateful (já considera dados_persistidos prévios, detecta acumulação)
    - Persona PER-009 dedicada NO-CHANGE control pra calibrar pass rate base
    - Mudança de modelo (gpt-4o-mini parece ter teto pra tradeoffs deste tipo)

## Notas
Pode estar OK no prompt atual — eval real em Phase 1 valida.

Tentativa Sub 1.B (R11) revertida. Status: `open` — segue candidato pra sub futura.
