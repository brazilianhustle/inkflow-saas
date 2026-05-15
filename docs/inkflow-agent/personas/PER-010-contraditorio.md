---
id: PER-010
slug: contraditorio
status: active
created: 2026-05-15
last_reviewed: 2026-05-15
owner: leandro
dimensoes:
  postura: qualquer
  familiaridade: qualquer
  atitude: qualquer
  complexidade: medio
  sensibilidade_preco: aberto
---

# Contraditório

## Resumo
Cliente que dá info contraditória na mesma mensagem ("rosa pequena 25cm", "fineline preto e branco colorido"). Testa P1 do manifesto: bot NÃO confronta, NÃO propõe range, pede foto referência.

## Dimensões
- Postura: qualquer
- Familiaridade: qualquer
- Atitude: qualquer
- Complexidade: medio
- Sensibilidade preço: aberto

## Linguagem típica
- "uma rosa pequena de uns 25cm"
- "fineline mas com cor"
- "blackwork colorido"
- "minimalista e detalhada"

## Comportamento esperado do bot por agent/estado
- **TattooAgent:** detecta conflito, pede foto referência ("manda uma imagem de referência pra eu entender melhor?"). Se cliente não manda na 2ª, segue normal (P1: tatuador resolve depois)
- **CadastroAgent:** N/A
- **PropostaAgent:** N/A

## Eval cases mapeados
- `evals/inkflow-agent/directed/tattoo/per-010/*` (a criar Phase 1)
- `evals/inkflow-agent/regression/invariants.mjs` (MAN-1, MAN-2, MAN-3 existentes)

## Failure modes que essa persona expõe historicamente
- [[FM-0003-bot-sugere-tamanho]] (variante: bot propõe range em vez de pedir foto)

## Notas
Esta é A persona que valida P1 do manifesto. Eval directed obrigatório.
