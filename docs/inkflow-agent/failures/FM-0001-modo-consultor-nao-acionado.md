---
id: FM-0001
slug: modo-consultor-nao-acionado
status: open
type: policy_violation
layers: [prompt]
agents_affected: [TattooAgent]
personas_exposing: [PER-002, PER-009]
created: 2026-05-15
last_change: 2026-05-15
owner: leandro
manifesto_principle: P6
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
- Status: open (sem contramedida em prod ainda)

## Notas
Manifesto P6 já cobre o conceito; falta encarnar em prompt. Failure formal pra dar visibilidade até Phase 1 mergear refator.
