# Intent: `pergunta_imagem`

## Status

`aprovado_para_planejamento`

## Família

`lateral_atendivel`

## Risco

`medio`

## Exemplos

- "o que você viu na imagem?"
- "o que aparece nessa foto?"
- "você entendeu a foto?"
- "essa imagem serve?"
- "dá pra ver a tattoo?"
- "você consegue ver o desenho?"
- "o que achou dessa referência?"

## O Que O Bot Deve Entender

O cliente não está necessariamente respondendo um campo. Ele está pedindo confirmação da leitura visual, testando se o bot viu a imagem ou buscando validação da referência/local.

Essa intent pode vir junto com uma foto no turno atual ou se referir a uma foto recente no histórico.

## Resposta Premium

Quando a imagem for referência clara:

```text
Vi uma referência com traços finos e uma composição mais delicada.

Essa imagem é a ideia do desenho ou é a foto do local onde tu quer tatuar?
```

Quando a imagem parecer local do corpo:

```text
Vi uma foto do local do corpo, parece uma área boa pra avaliar espaço e proporção.

Tu quer fazer a tattoo exatamente nessa região?
```

Quando estiver ambígua:

```text
Vi a foto, mas fiquei em dúvida se ela é referência do desenho ou o local do corpo.

Qual dos dois fica valendo?
```

## O Que Nunca Fazer

- Ignorar a pergunta e seguir direto para "qual parte do corpo?".
- Dizer que viu algo que não está claro.
- Assumir que pele tatuada é sempre cobertura.
- Assumir que toda imagem é referência.
- Assumir que toda foto de corpo é local definitivo.
- Avançar para handoff só porque viu imagem.

## Dados Extraíveis

- `descricao_curta`, se a referência for clara.
- `foto_local_msg_id`, se for claramente foto do local.
- `refs_imagens_msg_ids`, se for claramente referência.
- `descricao_visual`, se houver análise visual confiável.
- `tipo_foto`, se precisar perguntar referência vs local.

## Estados Onde Pode Acontecer

- `coletando_tattoo`
- `coletando_cadastro`
- `propondo_valor`
- `escolhendo_horario`
- `aguardando_sinal`
- `aguardando_tatuador`

## Pode Mudar Estado?

`nao`

Explicação: responder sobre a imagem não deve, por si só, avançar fase. Mudança de estado só deve acontecer se outro componente operacional confirmar que os requisitos da fase foram cumpridos.

## Pode Persistir Dados?

`depende`

Dados permitidos:

- descrição visual;
- classificação de foto como referência/local/incerta;
- IDs de imagem;
- `descricao_curta` apenas quando a imagem for referência clara e o modelo tiver confiança.

## Ação Operacional

- nenhuma ferramenta externa obrigatória;
- pode reutilizar análise visual já feita;
- pode cair no agent atual se a mensagem também trouxer dados de coleta.

## Retomada Do Fluxo

Retomar com a pergunta mais útil para destravar o caso:

- se ambígua: perguntar se é referência ou local;
- se referência: perguntar local/altura/estilo faltante;
- se local: perguntar ideia/estilo/altura faltante;
- se fora da fase tattoo: responder curto e voltar ao estado atual.

## Fallback

Se não houver imagem atual nem descrição visual recente:

```text
Consigo te ajudar, mas não estou vendo uma imagem clara aqui.

Pode mandar a foto de novo?
```

Se a classificação estiver incerta, não persistir como dado definitivo.

## Testes Automatizados

- Classifica "o que você viu na imagem?" como `pergunta_imagem`.
- Com imagem presente, não cai direto em pergunta de campo desconectada.
- Estado permanece igual.
- Quando imagem é ambígua, resposta pergunta referência vs local.
- Quando não há imagem, pede reenvio sem avançar estado.
- Com mensagem mista "o que você viu? quero no braço", não perde `local_corpo`.

## Smoke Real

- mensagem: enviar imagem + "o que você viu na imagem?"
- estado inicial: `coletando_tattoo`
- resposta esperada: menciona conteúdo visual e pergunta referência/local ou próximo dado útil.
- estado esperado: permanece `coletando_tattoo`
- side effects proibidos: handoff para tatuador, orçamento, agendamento, cobrança.

## Observações

Esta é a intent mais importante do Bloco 1 porque foi o sintoma real observado no smoke: o bot ignorou a pergunta visual e voltou ao formulário.

