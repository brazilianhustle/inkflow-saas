# Intent: `processo_tatuagem`

## Status

`implementado_localmente_pendente_smoke`

## Família

`lateral_atendivel`

## Risco

`medio`

## Exemplos

- "como funciona?"
- "qual o processo?"
- "como faço pra marcar?"
- "primeiro eu mando a ideia?"
- "preciso pagar antes?"
- "como é pra fazer uma tattoo com vocês?"
- "quais são os passos?"

## O Que O Bot Deve Entender

O cliente quer entender o caminho, não necessariamente responder um campo. A resposta precisa explicar o processo de forma curta e conduzir para a primeira informação útil.

## Resposta Premium

```text
Funciona assim: eu entendo tua ideia, junto as infos principais e o tatuador avalia pra passar valor e horário.

Me conta o que tu pensa em tatuar?
```

Se já há ideia coletada:

```text
Agora eu junto as infos principais e o tatuador avalia pra passar valor e horário.

Em qual parte do corpo tu quer fazer?
```

## O Que Nunca Fazer

- Virar textão com muitas etapas.
- Prometer aprovação imediata.
- Prometer horário antes de proposta.
- Falar de ferramentas internas.
- Gerar link de sinal sem valor/horário.
- Encerrar sem conduzir.

## Dados Extraíveis

Se o cliente incluir dados no turno:

- ideia;
- local;
- estilo;
- referência;
- urgência.

## Estados Onde Pode Acontecer

- `coletando_tattoo`
- `coletando_cadastro`
- `propondo_valor`
- `escolhendo_horario`
- `aguardando_sinal`
- `aguardando_tatuador`

## Pode Mudar Estado?

`nao`

Explicação: explicar processo não muda estado. A fase operacional continua de onde estava.

## Pode Persistir Dados?

`depende`

Persistir somente dados explícitos da tattoo/cadastro quando vierem junto.

## Ação Operacional

- nenhuma.

## Retomada Do Fluxo

Retomar de acordo com estado:

- coleta tattoo: pedir ideia/local/estilo/altura faltante;
- cadastro: pedir nome/data/e-mail faltante;
- proposta: voltar para decisão de valor/horário/sinal;
- aguardando tatuador: explicar que está aguardando avaliação.

## Fallback

```text
Eu te guio por aqui: primeiro entendo a ideia, depois o tatuador avalia e a gente combina valor e horário.

Qual tattoo tu pensa em fazer?
```

## Testes Automatizados

- Classifica "como funciona?" como `processo_tatuagem`.
- Resposta tem no máximo poucas etapas.
- Não gera side effect.
- Estado permanece igual.
- Retomada respeita estado atual.

## Smoke Real

- mensagem: "como funciona pra marcar uma tattoo?"
- estado inicial: conversa nova ou `coletando_tattoo`
- resposta esperada: explica fluxo curto e pergunta ideia da tattoo.
- estado esperado: `coletando_tattoo`
- side effects proibidos: orçamento, agendamento, link de pagamento.

## Observações

Esta intent é importante para primeiras conversas. Se a resposta for boa, reduz ansiedade e aumenta confiança sem sobrecarregar a coleta.
