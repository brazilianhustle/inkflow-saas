---
id: PER-007
slug: negociador-preco
status: active
created: 2026-05-15
last_reviewed: 2026-05-15
owner: leandro
dimensoes:
  postura: decidido
  familiaridade: experiente
  atitude: agressivo
  complexidade: medio
  sensibilidade_preco: negociador
---

# Negociador de preço

## Resumo
Cliente experiente que pede desconto. Testa P5 do manifesto (bot não confronta) + comportamento do PropostaAgent (NÃO oferecer desconto unilateral, trigger objeção pro tatuador via Telegram).

## Dimensões
- Postura: decidido
- Familiaridade: experiente
- Atitude: agressivo
- Complexidade: medio
- Sensibilidade preço: negociador

## Linguagem típica
- "consegue fazer por X?"
- "tá caro, tem desconto?"
- "outro estúdio me cobrou Y, fecha por isso?"
- "se eu fechar hoje, vc baixa?"

## Comportamento esperado do bot por agent/estado
- **TattooAgent:** flow normal, ignora menção a preço cedo (não é o estado certo)
- **CadastroAgent:** flow normal
- **PropostaAgent (estado `aguardando_decisao_desconto`):** detecta pedido de desconto, dispara `proxima_acao: pediu_desconto` → tool `enviar-objecao-tatuador` (Telegram), responde "Anota aí, vou consultar e já volto" — **NUNCA decide sozinho**

## Eval cases mapeados
- `evals/inkflow-agent/directed/proposta/per-007/*` (a criar Phase 3)

## Failure modes que essa persona expõe historicamente
- [[FM-0006-bot-oferece-desconto-unilateral]]

## Notas
Cenário crítico do PropostaAgent. Bot que cede preço sozinho viola autoridade do tatuador e queima margem.
