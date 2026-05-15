---
id: PER-NNN
slug: kebab-case-curto
status: draft               # draft | active | archived
created: YYYY-MM-DD
last_reviewed: YYYY-MM-DD
owner: leandro
dimensoes:
  postura: <valor>
  familiaridade: <valor>
  atitude: <valor>
  complexidade: <valor>
  sensibilidade_preco: <valor>
---

# <Nome da persona>

## Resumo
1-2 parágrafos curtos. Quem é, sinal característico, % esperado do tráfego se tiver hipótese.

## Dimensões
- Postura: <valor>
- Familiaridade: <valor>
- Atitude: <valor>
- Complexidade: <valor>
- Sensibilidade preço: <valor>

## Linguagem típica (amostras reais ou plausíveis)
- "exemplo de mensagem 1"
- "exemplo de mensagem 2"
- "exemplo de mensagem 3"

## Comportamento esperado do bot por agent/estado
- **TattooAgent (coletando_tattoo):** o que o bot deve fazer
- **CadastroAgent (coletando_cadastro):** o que deve fazer
- **PropostaAgent (propondo_valor):** o que deve fazer
- **PortfolioAgent (intent enviar_portfolio):** o que deve fazer (se aplica)

## Eval cases mapeados
- `evals/inkflow-agent/directed/<agent>/<slug>/*.json` (a criar)

## Failure modes que essa persona expõe historicamente
- [[FM-NNNN-slug]]

## Notas
Qualquer contexto extra. Histórico de mudanças no fim.
