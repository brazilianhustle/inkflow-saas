---
id: FM-0003
slug: bot-sugere-tamanho
status: mitigated
type: policy_violation
layers: [prompt, schema_invariant]
agents_affected: [TattooAgent]
personas_exposing: [PER-001, PER-009, PER-010]
created: 2026-05-13
last_change: 2026-05-15
owner: leandro
manifesto_principle: P1
---

# FM-0003 — Bot sugere tamanho em cm

## Descrição
Bot oferecia ranges de tamanho ao cliente ("uns 5-8cm?", "leão 18cm fica encaixado"). Viola P1 do manifesto: tatuador decide proporção no dia, bot não sugere.

## Gatilho
Cliente diz "não sei o tamanho" OU manda descrição sem tamanho.

## Impacto
- Cliente final: cria expectativa de tamanho que tatuador pode não honrar
- Tatuador: tem que desfazer expectativa no atendimento presencial (atrito)
- Business: percepção de bot "que decide", quebra autoridade do tatuador

## Diagnóstico (root cause)
Few-shots no `coleta/tattoo/few-shot.js` (legado) reforçavam comportamento. Regra R6 antiga mandava confrontar/propor range em vez de pedir foto.

## Contramedida
- Removidos few-shots problemáticos
- R6 reescrita pra pedir foto referência em conflito (sem confronto)
- R8 nova: "Bot NUNCA sugere tamanho"
- Invariante exige 4 OBR (descricao_curta, local_corpo, altura_cm, estilo) — tamanho_cm opcional
- Arquivos: `functions/_lib/prompts/coleta/tattoo/decisao.js`, `tattoo/exemplos.js`

## Regression test
- Eval: cenários MAN-1, MAN-2, MAN-3 em `tests/agent/refator-prompts-coleta-v2.eval.mjs`
- Unit: `tests/agent/tattoo-agent.test.mjs` ("invariante aceita handoff sem tamanho_cm")
- Migrar pra `evals/inkflow-agent/regression/invariants.mjs` na Task 18

## Eval gate
MAN-1, MAN-2, MAN-3 fazem parte do CI permanente (regression suite).

## Histórico
- 2026-05-13: descoberto via brainstorm Leandro, OBS no smoke prod cutover Sub-4.1
- 2026-05-13: spec `refator-prompts-coleta-v2` criado
- 2026-05-13/14: contramedida mergeada
- 2026-05-15: migrado pra failure catalog (Phase 0), status open → mitigated

## Notas
Princípio P1 do manifesto. Toda regressão futura deste failure mode deve disparar review do manifesto (não só fix técnico).
