# Intent: `preco_generico`

## Status

`validado_smoke_pass`

## Família

`lateral_atendivel`

## Risco

`alto`

## Exemplos

- "quanto fica?"
- "qual valor?"
- "me passa preço"
- "fica caro?"
- "quanto custa uma dessa?"
- "tem uma média?"
- "quanto é uma tattoo no braço?"
- "essa do desenho aí fica quanto?"

## O Que O Bot Deve Entender

O cliente quer preço antes da avaliação. O bot precisa ser útil sem inventar valor, faixa, desconto ou promessa.

Esta intent é lateral na fase de coleta, mas é financeira por natureza. O risco é alto porque preço errado destrói confiança.

## Resposta Premium

```text
O valor depende do tamanho, detalhe e local do corpo. O tatuador confirma certinho depois de avaliar tua ideia.

Pra eu te direcionar melhor, tu pensa em fazer em qual parte?
```

Se o cliente já forneceu local, retomar com outro dado faltante:

```text
O valor depende do detalhe e da proporção no corpo. O tatuador confirma depois de avaliar.

Tu curte mais qual estilo pra essa tattoo?
```

## O Que Nunca Fazer

- Inventar valor.
- Dar faixa de preço.
- Prometer desconto.
- Dizer que é barato/caro.
- Usar "não sei" seco.
- Encaminhar para tatuador antes de coletar o mínimo necessário, salvo risco/handoff.
- Cobrar sinal ou gerar link.

## Dados Extraíveis

Se a mensagem contiver dados mistos, pode extrair:

- `descricao_curta`;
- `local_corpo`;
- `estilo`;
- `tamanho_cm`, se o cliente mencionar espontaneamente;
- referência visual, se vier com imagem.

## Estados Onde Pode Acontecer

- `coletando_tattoo`
- `coletando_cadastro`
- `propondo_valor`
- `escolhendo_horario`
- `aguardando_sinal`
- `aguardando_tatuador`

## Pode Mudar Estado?

`nao`

Explicação: pergunta genérica de preço não muda estado. Em `propondo_valor`, se já existe `valor_proposto`, a pergunta pode ser tratada pelo PropostaAgent, mas esta ficha cobre o caso genérico pré-avaliação.

## Pode Persistir Dados?

`depende`

Dados permitidos:

- dados de tattoo claramente fornecidos no mesmo turno.

Dados proibidos:

- `valor_proposto`;
- `valor_pedido_cliente`;
- qualquer preço inferido.

## Ação Operacional

- nenhuma na coleta;
- se já estiver em fase de proposta, delegar para agent operacional de proposta.

## Retomada Do Fluxo

Retomar pelo primeiro dado faltante relevante:

- sem descrição: "me conta o que tu pensa em tatuar?"
- sem local: "em qual parte do corpo?"
- sem estilo: "tu curte mais qual estilo?"
- sem altura: "qual tua altura?"

## Fallback

Se a mensagem for só "quanto?":

```text
Consigo te ajudar, mas o valor depende da ideia, local e detalhe. Me conta primeiro o que tu pensa em tatuar?
```

## Testes Automatizados

- Classifica "quanto fica?" como `preco_generico`.
- Não retorna número monetário.
- Não altera `valor_proposto`.
- Não gera Pix/link/sinal.
- Em mensagem mista, preserva dados úteis.
- Em `propondo_valor`, não intercepta indevidamente aceitação/negociação que deve ir para PropostaAgent.

## Smoke Real

- mensagem: "quanto fica uma rosa no braço?"
- estado inicial: `coletando_tattoo`
- resposta esperada: explica dependência de avaliação e retoma com estilo/altura.
- estado esperado: `coletando_tattoo`
- side effects proibidos: valor persistido, orçamento, Telegram tatuador, cobrança.

## Observações

Esta intent precisa ser separada de `negociacao`. "quanto fica?" é preço genérico. "faz por 500?" é negociação e pertence a onda financeira/operacional.
