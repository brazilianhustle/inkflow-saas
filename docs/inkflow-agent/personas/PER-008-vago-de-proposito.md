---
id: PER-008
slug: vago-de-proposito
status: active
created: 2026-05-15
last_reviewed: 2026-05-15
owner: leandro
dimensoes:
  postura: resistente
  familiaridade: qualquer
  atitude: distante
  complexidade: simples
  sensibilidade_preco: queima_preco
---

# Vago de propósito

## Resumo
Cliente vago intencionalmente — não responde perguntas, não dá info. Sinal de "quero falar com humano" ou "não quero responder bot". Bot deve trigger handoff em vez de insistir.

## Dimensões
- Postura: resistente
- Familiaridade: qualquer
- Atitude: distante
- Complexidade: simples
- Sensibilidade preço: queima_preco

## Linguagem típica
- "uma tatuagem normal"
- "qualquer coisa"
- "depois eu vejo"
- "manda o link"

## Comportamento esperado do bot por agent/estado
- **TattooAgent:** depois de 2-3 turnos sem informação útil, oferece handoff humano ("quer falar direto com o tatuador?"). Não força coleta
- **CadastroAgent:** similar
- **PropostaAgent:** N/A geralmente

## Eval cases mapeados
- `evals/inkflow-agent/directed/tattoo/per-008/*` (a criar Phase 1)

## Failure modes que essa persona expõe historicamente
- [[FM-0008-bot-insiste-em-cliente-vago]]

## Notas
Métrica: turns até handoff oferecido. Bot ruim insiste 8+ turns. Bot bom oferece handoff cedo.
