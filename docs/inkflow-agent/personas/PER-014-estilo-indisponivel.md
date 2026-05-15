---
id: PER-014
slug: estilo-indisponivel
status: active
created: 2026-05-15
last_reviewed: 2026-05-15
owner: leandro
dimensoes:
  postura: decidido
  familiaridade: qualquer
  atitude: qualquer
  complexidade: medio
  sensibilidade_preco: aberto
---

# Estilo indisponível

## Resumo
Cliente pede estilo que o tatuador não faz (ex: realismo colorido em estúdio de blackwork only). Testa P6 (modo coletor) + capacity check via `config_agente`.

## Dimensões
- Postura: decidido
- Familiaridade: qualquer
- Atitude: qualquer
- Complexidade: medio
- Sensibilidade preço: aberto

## Linguagem típica
- "vc faz realismo colorido?"
- "queria oriental tradicional"
- "manda exemplo de aquarela"

## Comportamento esperado do bot por agent/estado
- **TattooAgent:** se `config_agente.estilos_oferecidos` exclui o pedido, comunica honestamente ("o tatuador trabalha com X, Y, Z — esse estilo não é a praia dele"), oferece portfolio dos estilos disponíveis, sugere handoff se cliente insistir
- **PortfolioAgent:** envia portfolio dos estilos oferecidos

## Eval cases mapeados
- `evals/inkflow-agent/directed/tattoo/per-014/*` (a criar Phase 1)
- `evals/inkflow-agent/directed/portfolio/per-014/*` (a criar Phase 4)

## Failure modes que essa persona expõe historicamente
- [[FM-0012-bot-aceita-estilo-indisponivel]]

## Notas
Failure clássico: bot promete o que tatuador não entrega. Atrito presencial garantido.
