---
id: FM-0001
slug: modo-consultor-nao-acionado
status: open
type: policy_violation
layers: [prompt]
agents_affected: [TattooAgent]
personas_exposing: [PER-002, PER-009]
created: 2026-05-15
last_change: 2026-05-16
owner: leandro
manifesto_principle: P6
notes: "Sub 1.B tentou ampliar detector §4.6 pra cobrir indecisão emergente — regrediu PER-001 happy path. Marcado intratável-via-prompt. Padrão recorrente: regras novas que mexem em atenção do modelo durante coleta de OBR sempre regridem happy path no gpt-4o-mini."
---

# FM-0001 — Bot não aciona modo consultor pra cliente indeciso

## Descrição
Cliente sinaliza indecisão ("não sei o que tatuar", "me ajuda a escolher") mas bot trata como cliente decidido — pede 4 OBR e cliente não tem info pra dar. Resultado: friction, cliente abandona.

## Gatilho
Cliente diz alguma variante de "não sei o que tatuar" / "tenho vontade mas não decidi" / "me ajuda a escolher" nos 1-2 primeiros turns.

## Impacto
- Cliente final: pergunta repetida sobre coisa que não sabe responder
- Tatuador: lead perdido (cliente abandona)
- Business: drop-off rate alto em PER-002, PER-009

## Diagnóstico
Decisao.js do TattooAgent não tem branch explícito pra modo consultor. P6 do manifesto é a regra mas prompt não tem few-shot dedicado.

## Contramedida
- Phase 1: adicionar §4.X no `functions/_lib/prompts/coleta/tattoo/decisao.js` com detecção de indecisão (1-2 turns)
- Few-shot novo cobrindo PER-002 (modo consultor → coletor)
- Eval directed em `evals/inkflow-agent/directed/tattoo/per-002/` (Phase 1)

## Regression test
- Pendente — eval directed em Phase 1 (TattooAgent)

## Eval gate
A definir em Phase 1.

## Histórico
- 2026-05-15: documentado no Phase 0 a partir do manifesto P6
- 2026-05-16: **Sub 1.B baseline pós-R9 confirma reprodução empírica em PER-009** (audit Sub 1.A já tinha previsto top-3). Bot continua em modo COLETOR rígido mesmo com sinais de indecisão emergente no msg 6-7 (mudança radical rosa→leão).
- 2026-05-16: **Sub 1.B Task 5 Iteração 3 (§4.6 ampliado)** — modificada §4.6 do `decisao.js` pra REAVALIE A CADA TURNO + lista de frases-gatilho de indecisão tardia ("ah na verdade não sei", "talvez X ou Y", mudança radical, etc). Mudança mínima sem few-shot novo. Resultados:
    - PER-009 (alvo): 1 run, sem 500, fail (nat + manif). Não passou pass rate.
    - PER-001 (regression — happy path): 3 runs, 2 com HTTP 500 ❌. **Regrediu de novo** — mesmo padrão da R10/R11.
    - PER-010: 1 run, sem 500, fail.
- 2026-05-16: **Marcado intratável-via-prompt.** Padrão recorrente confirmado pela 3ª vez consecutiva: qualquer regra nova que mexe em atenção do modelo durante coleta de OBR regrede PER-001 happy path no gpt-4o-mini. Mudança em §4.6 (modo consultor) também não escapou. §4.6 revertido ao estado da Sub 1.A. Defer pra exploration estrutural — possíveis caminhos:
    - Mudança de modelo (gpt-4o-mini parece ter teto pra tradeoffs deste tipo — testar com gpt-4o ou claude-haiku-4.5 como driver)
    - Refator do prompt em sub-sistemas (modo consultor como agent separado? Router cedo no fluxo?)
    - Persona PER-002 dedicada NO-CHANGE pra calibrar baseline (PER-009 mistura FM-0009 + FM-0001, difícil isolar sinal)

## Notas
Manifesto P6 já cobre o conceito; falta encarnar em prompt. Failure formal pra dar visibilidade até Phase 1 mergear refator.

Tentativa Sub 1.B revertida. Status: `open` — candidato pra Sub futura com abordagem estrutural diferente.
