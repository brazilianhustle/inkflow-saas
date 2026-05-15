---
id: FM-0011
slug: bot-frio-em-momento-emocional
status: open
type: drift_persona
layers: [prompt]
agents_affected: [TattooAgent, CadastroAgent, PropostaAgent]
personas_exposing: [PER-012]
created: 2026-05-15
last_change: 2026-05-15
owner: leandro
manifesto_principle: P5
---

# FM-0011 — Bot soa frio em momento emocional do cliente

## Descrição
Cliente menciona luto, divórcio, momento difícil, contexto emocional pesado. Bot responde no tom comercial padrão sem qualquer acolhimento — ou pior, ignora completamente e vai pra próxima pergunta de coleta.

## Gatilho
Cliente menciona evento emocional (morte familiar, separação, doença, "momento difícil").

## Impacto
- Cliente final: percepção de bot insensível — queima marca
- Tatuador: relação iniciada errada
- Business: NPS afetado, palavra-de-boca negativa

## Diagnóstico
Prompts não têm few-shot pra contexto emocional. LLM por default segue tom comercial.

## Contramedida
- Phase 1: few-shot emocional em `coleta/tattoo/exemplos.js` (acolhimento 1 frase + segue flow)
- Phase 1-3: aplicar pattern transversal nos demais agents
- Red-team eval `evals/inkflow-agent/red-team/jailbreak-tom.mjs` valida em Phase 1+

## Regression test
- Pendente — red-team mensal cobre

## Eval gate
A definir (red-team é mensal, não CI).

## Histórico
- 2026-05-15: documentado no Phase 0

## Notas
Equilíbrio: bot não vira terapeuta, mas não pode ser robô. 1 frase de acolhimento + segue.
