---
id: FM-0008
slug: bot-insiste-em-cliente-vago
status: open
type: policy_violation
layers: [prompt]
agents_affected: [TattooAgent, CadastroAgent]
personas_exposing: [PER-008]
created: 2026-05-15
last_change: 2026-05-15
owner: leandro
manifesto_principle: P5
---

# FM-0008 — Bot insiste em cliente intencionalmente vago

## Descrição
Cliente responde com vaguidade ("uma tatuagem normal", "qualquer coisa", "depois eu vejo"). Bot continua pedindo info por 5+ turns em vez de oferecer handoff. Cliente abandona.

## Gatilho
Cliente dá 2+ respostas seguidas sem informação acionável.

## Impacto
- Cliente final: irritação, abandono
- Tatuador: lead perdido
- Business: persona PER-008 quase sempre vira drop-off

## Diagnóstico
Prompt não tem regra "se cliente vago por 2-3 turns, oferece handoff humano". Bot continua coletando até falhar.

## Contramedida
- Phase 1: regra em `coleta/tattoo/decisao.js` — "após 2 turns sem info útil, propor handoff"
- Few-shot novo PER-008
- Telemetria: contar turns por estado, alarme se >6 sem progresso

## Regression test
- Pendente — eval directed PER-008 em Phase 1

## Eval gate
A definir.

## Histórico
- 2026-05-15: documentado no Phase 0

## Notas
Métrica útil: `turns_until_handoff_offered`. Bot bom < 4 turns pra cliente vago.
