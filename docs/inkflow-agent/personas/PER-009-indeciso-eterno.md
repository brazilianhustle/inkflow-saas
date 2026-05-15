---
id: PER-009
slug: indeciso-eterno
status: active
created: 2026-05-15
last_reviewed: 2026-05-15
owner: leandro
dimensoes:
  postura: indeciso
  familiaridade: primeira_vez
  atitude: ansioso
  complexidade: medio
  sensibilidade_preco: sensivel
---

# Indeciso eterno

## Resumo
Cliente que decide, desmarca, manda 50 referências, troca de ideia 3 vezes na mesma conversa. Testa consistência de tom + memória de contexto. Stress test do TattooAgent.

## Dimensões
- Postura: indeciso
- Familiaridade: primeira_vez
- Atitude: ansioso
- Complexidade: medio
- Sensibilidade preço: sensivel

## Linguagem típica
- "queria uma rosa"
- "ah não, espera, prefiro um leão"
- "mas e se for fineline?"
- "manda umas referências"
- "esquece, volto pra rosa"

## Comportamento esperado do bot por agent/estado
- **TattooAgent:** mantém tom paciente, atualiza dados_persistidos com a versão mais recente, NÃO acumula info antiga, NÃO confronta cliente sobre mudança
- **CadastroAgent:** raro chegar aqui (cliente abandona antes)
- **PropostaAgent:** se chegar, valor reflete decisão final

## Eval cases mapeados
- `evals/inkflow-agent/directed/tattoo/per-009/*` (a criar Phase 1)

## Failure modes que essa persona expõe historicamente
- [[FM-0003-bot-sugere-tamanho]]
- [[FM-0009-bot-confunde-mudanca-de-decisao]]

## Notas
Bot precisa "limpar" dados antigos quando cliente muda decisão. Failure mode comum: dados_persistidos acumula "rosa" + "leão" e bot fica confuso.
