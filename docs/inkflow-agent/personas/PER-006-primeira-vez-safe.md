---
id: PER-006
slug: primeira-vez-safe
status: active
created: 2026-05-15
last_reviewed: 2026-05-15
owner: leandro
dimensoes:
  postura: decidido
  familiaridade: primeira_vez
  atitude: ansioso
  complexidade: simples
  sensibilidade_preco: aberto
---

# Primeira-vez safe

## Resumo
Cliente novo com ideia simples, clara, sem complicação. Não pesquisa muito, confia. Happy path 2 — usado pra detectar regressão "bot está dificultando o fácil".

## Dimensões
- Postura: decidido
- Familiaridade: primeira_vez
- Atitude: ansioso
- Complexidade: simples
- Sensibilidade preço: aberto

## Linguagem típica
- "queria fazer uma tattoo simples"
- "uma palavrinha no pulso, em fineline"
- "ok, quanto fica?"

## Comportamento esperado do bot por agent/estado
- **TattooAgent:** flow rápido, 3-5 turnos pra fechar 4 OBR, sem reperguntar o que cliente já deu
- **CadastroAgent:** rápido, sem fricção
- **PropostaAgent:** entrega valor, cliente aceita

## Eval cases mapeados
- `evals/inkflow-agent/directed/tattoo/per-006/*` (a criar Phase 1)
- `evals/inkflow-agent/regression/golden-paths.mjs`

## Failure modes que essa persona expõe historicamente
- [[FM-0005-bot-reperguntando-info-ja-dada]]

## Notas
Regressão clássica: bot complica o simples. Esta persona deve fechar em <5 turnos sempre.
