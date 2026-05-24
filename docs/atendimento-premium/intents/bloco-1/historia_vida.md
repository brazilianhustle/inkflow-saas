# Intent: `historia_vida`

## Status

`aprovado_para_planejamento`

## Família

`consultivo`

## Risco

`medio`

## Exemplos

- "quero fazer uma homenagem pro meu pai que faleceu ano passado..."
- "passei por uma fase difícil e queria marcar isso..."
- "minha mãe sempre gostou de borboletas..."
- "é minha primeira tattoo e tô com medo..."
- "essa frase tem um significado muito importante pra mim..."
- "eu queria algo pra representar superação..."

## O Que O Bot Deve Entender

O cliente trouxe contexto emocional, simbólico ou longo. O bot deve acolher sem exagerar, extrair dados úteis e conduzir com uma pergunta por vez.

Não é terapia. Não é design final. É atendimento consultivo.

## Resposta Premium

Com tema claro:

```text
Entendi. Dá pra pensar em algo simbólico e delicado com essa ideia.

Tu imagina fazer em qual parte do corpo?
```

Com primeira tattoo/medo:

```text
Tranquilo, é normal ficar com receio na primeira. A gente vai por partes pra deixar tudo claro.

Tu já tem alguma ideia de desenho ou referência?
```

Com história longa mas pouco definida:

```text
Entendi o sentido que tu quer trazer. Pra transformar isso numa ideia de tattoo, ajuda escolher um símbolo ou referência.

Tem algum desenho, frase ou imagem que represente isso pra ti?
```

## O Que Nunca Fazer

- Ignorar a emoção e perguntar seco "qual parte do corpo?".
- Responder como terapeuta.
- Fazer julgamento emocional.
- Inventar design final.
- Fazer três perguntas de uma vez.
- Persistir inferência simbólica como se fosse escolha final.
- Usar frase genérica demais como "que legal".

## Dados Extraíveis

- `descricao_curta`, se houver tema claro;
- estilo, se mencionado;
- local, se mencionado;
- referência, se enviada;
- sinal de `indeciso_consultor`, se não houver ideia concreta;
- contexto de primeira tattoo/medo para ajustar tom.

## Estados Onde Pode Acontecer

- `coletando_tattoo`
- `coletando_cadastro`
- `propondo_valor`
- `escolhendo_horario`
- `aguardando_sinal`
- `aguardando_tatuador`

## Pode Mudar Estado?

`depende`

Não muda estado por emoção isolada. Pode seguir o fluxo se dados suficientes forem extraídos e validados pelo agent operacional.

## Pode Persistir Dados?

`depende`

Pode persistir dados explícitos. Evitar persistir interpretações subjetivas.

Exemplo:

- Cliente: "quero homenagear meu pai com pássaros e uma frase"
- Pode persistir: `descricao_curta=homenagem ao pai com pássaros e frase`

Não persistir:

- "símbolo de liberdade" se o cliente não disse isso.

## Ação Operacional

- nenhuma por padrão;
- pode cair no agent operacional para extração estruturada se houver dados claros;
- pode se relacionar com `indeciso_consultor` se não houver ideia concreta.

## Retomada Do Fluxo

Retomar com a pergunta que transforma história em briefing:

- se falta ideia: pedir símbolo/desenho/referência;
- se ideia existe: perguntar local;
- se local existe: perguntar estilo;
- se medo/primeira tattoo: conduzir com calma, sem textão.

## Fallback

Se a mensagem for longa e confusa:

```text
Entendi o sentido geral. Pra eu te ajudar a transformar isso em tattoo, vamos por partes.

Tu imagina mais uma frase, um desenho ou os dois juntos?
```

## Testes Automatizados

- Classifica mensagem emocional longa como `historia_vida`.
- Extrai dados explícitos sem inventar.
- Resposta acolhe em uma frase.
- Faz uma pergunta só.
- Não muda estado indevidamente.
- Não produz textão.

## Smoke Real

- mensagem: "quero fazer uma homenagem pro meu pai que faleceu, pensei em pássaros e uma frase"
- estado inicial: `coletando_tattoo`
- resposta esperada: acolhe, extrai tema, pergunta local ou referência.
- estado esperado: `coletando_tattoo`
- side effects proibidos: handoff imediato, orçamento, agendamento.

## Observações

Esta intent é central para o salto de qualidade percebida. Muitos clientes de tatuagem não chegam com um briefing limpo; chegam com memória, emoção e insegurança.

