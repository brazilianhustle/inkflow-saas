---
id: PER-003
slug: pesquisador-orcamento
status: active
created: 2026-05-15
last_reviewed: 2026-05-15
owner: leandro
dimensoes:
  postura: pesquisando
  familiaridade: qualquer
  atitude: distante
  complexidade: simples
  sensibilidade_preco: queima_preco
---

# Pesquisador de orçamento

## Resumo
Cliente "tô só vendo preço" — está sondando vários estúdios, não tem intenção de fechar agora. Métrica esperada: alto drop-off entre TattooAgent e PropostaAgent.

## Dimensões
- Postura: pesquisando
- Familiaridade: qualquer
- Atitude: distante
- Complexidade: simples
- Sensibilidade preço: queima_preco

## Linguagem típica
- "quanto custa uma tattoo de 10cm"
- "qual o valor de uma tattoo no antebraço"
- "só tô vendo preço"
- "obrigado vou ver" (após orçamento)

## Comportamento esperado do bot por agent/estado
- **TattooAgent:** mesma coleta — bot não "filtra" cliente, deixa fluir
- **PropostaAgent:** entrega valor + condições, sem pressão. Se cliente abandona, telemetria registra dropoff
- **CadastroAgent:** se cliente chega aqui, é sinal positivo — happy path

## Eval cases mapeados
- `evals/inkflow-agent/directed/tattoo/per-003/*` (a criar Phase 1)
- `evals/inkflow-agent/directed/proposta/per-003/*` (a criar Phase 3)

## Failure modes que essa persona expõe historicamente
- [[FM-0002-bot-pressiona-fechamento]]

## Notas
Métrica útil: turns até abandono. Bot bem-calibrado deixa cliente sair limpo — bot ruim insiste e queima reputação do tatuador.
