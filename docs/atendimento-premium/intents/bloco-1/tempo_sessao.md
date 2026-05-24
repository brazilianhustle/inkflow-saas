# Intent: `tempo_sessao`

## Status

`implementado_localmente_pendente_smoke`

## Família

`lateral_atendivel`

## Risco

`medio`

## Exemplos

- "quanto tempo demora?"
- "demora muito?"
- "faz em uma sessão?"
- "quantas horas leva?"
- "quanto tempo eu fico aí?"
- "dá pra fazer no mesmo dia?"
- "precisa de mais de uma sessão?"

## O Que O Bot Deve Entender

O cliente quer previsibilidade de duração ou número de sessões. O bot pode explicar os fatores, mas não deve prometer duração exata nem quantidade de sessões.

## Resposta Premium

```text
Depende do tamanho, detalhe e local do corpo. O tatuador confirma melhor quando avaliar tua ideia.

Tu imagina fazer em qual parte?
```

Se o local já foi coletado:

```text
Depende do detalhe e da proporção no corpo. O tatuador confirma certinho na avaliação.

Tu prefere qual estilo pra essa ideia?
```

## O Que Nunca Fazer

- Prometer horas exatas.
- Prometer uma sessão.
- Dizer que é rápido.
- Dizer que precisa de várias sessões sem avaliação.
- Misturar tempo com preço inventado.
- Encerrar a conversa sem retomar.

## Dados Extraíveis

Normalmente nenhum, exceto se a pergunta vier com dados:

- "uma rosa no braço demora?" -> `descricao_curta=rosa`, `local_corpo=braço`.
- "realismo demora muito?" -> `estilo=realismo`, se fizer sentido no contexto.

## Estados Onde Pode Acontecer

- `coletando_tattoo`
- `coletando_cadastro`
- `propondo_valor`
- `escolhendo_horario`
- `aguardando_sinal`
- `aguardando_tatuador`

## Pode Mudar Estado?

`nao`

## Pode Persistir Dados?

`depende`

Persistir apenas dados de tattoo fornecidos explicitamente no mesmo turno.

## Ação Operacional

- nenhuma.

## Retomada Do Fluxo

Retomar com o próximo dado faltante da fase atual. Em estados pós-proposta, responder e manter o passo atual.

## Fallback

Se não houver contexto suficiente:

```text
Depende bastante da ideia, tamanho e local. Me conta o que tu pensa em tatuar que eu te direciono melhor?
```

## Testes Automatizados

- Classifica perguntas de duração como `tempo_sessao`.
- Não contém número de horas inventado.
- Não promete "uma sessão".
- Estado permanece igual.
- Retoma com pergunta útil.
- Em mensagem mista, extrai dados explícitos.

## Smoke Real

- mensagem: "essa tattoo demora quantas horas?"
- estado inicial: `coletando_tattoo`
- resposta esperada: depende de tamanho/detalhe/local e retoma coleta.
- estado esperado: `coletando_tattoo`
- side effects proibidos: orçamento, agendamento, valor, handoff.

## Observações

Esta intent costuma aparecer junto com medo, primeira tattoo ou história de vida. Se houver componente emocional forte, combinar com `historia_vida` na resposta.
