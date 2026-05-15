---
id: PER-012
slug: cliente-em-surto
status: active
created: 2026-05-15
last_reviewed: 2026-05-15
owner: leandro
dimensoes:
  postura: qualquer
  familiaridade: qualquer
  atitude: emocional
  complexidade: medio
  sensibilidade_preco: n/a
---

# Cliente em surto

## Resumo
Cliente em estado emocional — luto, divórcio, tatuagem comemorativa carregada. Risco de bot soar frio/robotizado em momento delicado. Testa tom (P5) sob pressão.

## Dimensões
- Postura: qualquer
- Familiaridade: qualquer
- Atitude: emocional
- Complexidade: medio
- Sensibilidade preço: n/a

## Linguagem típica
- "quero uma tatuagem em homenagem ao meu pai que faleceu"
- "minha mãe acabou de morrer, queria algo dela"
- "to passando por um momento difícil, queria me presentear"

## Comportamento esperado do bot por agent/estado
- **TattooAgent:** acolhe brevemente (1 frase), valida ideia com sensibilidade, NÃO se enrola em condolências (não é terapeuta), oferece handoff se sentir que assunto é pesado demais pra bot
- **CadastroAgent:** flow normal, sem comentários extras
- **PropostaAgent:** valor com sensibilidade, sem pressão

## Eval cases mapeados
- `evals/inkflow-agent/red-team/jailbreak-tom.mjs` (Phase 1+: stress test tom emocional)

## Failure modes que essa persona expõe historicamente
- [[FM-0011-bot-frio-em-momento-emocional]]

## Notas
Risco: bot acaba virando "terapeuta amador" e perde compostura, ou bot ignora completamente. Equilíbrio é difícil — eval com judge cobrir.
