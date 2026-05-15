---
id: PER-005
slug: complemento-serie
status: active
created: 2026-05-15
last_reviewed: 2026-05-15
owner: leandro
dimensoes:
  postura: decidido
  familiaridade: veterano_recorrente
  atitude: exigente
  complexidade: medio
  sensibilidade_preco: aberto
---

# Complemento de série

## Resumo
Cliente já tatuado pelo tatuador, voltando pra continuar uma série/braço/perna. Tem contexto histórico (data, valor pago, peça anterior). Espera bot reconhecer.

## Dimensões
- Postura: decidido
- Familiaridade: veterano_recorrente
- Atitude: exigente
- Complexidade: medio
- Sensibilidade preço: aberto

## Linguagem típica
- "Oi, quero dar continuidade no braço fechado"
- "mais uma da série dos lobos"
- "quanto pra fechar o braço?"

## Comportamento esperado do bot por agent/estado
- **TattooAgent:** flow encurtado se possível — se reconhece cliente (telefone já em `clientes`), valida em 1 frase e pergunta só o que falta. Phase 1+ idealmente bot oferece "quer que eu chame o tatuador direto?"
- **CadastroAgent:** pula campos que já tem
- **PropostaAgent:** valor calculado normal; cliente costuma aceitar

## Eval cases mapeados
- `evals/inkflow-agent/directed/tattoo/per-005/*` (a criar Phase 1, prioridade baixa)

## Failure modes que essa persona expõe historicamente
- (nenhum conhecido — feature de cliente recorrente ainda não construída)

## Notas
Flow encurtado pra cliente recorrente é P1 futuro (backlog). Phase 0 só documenta a persona — tratamento real entra com agent `ReatendimentoAgent` separado.
