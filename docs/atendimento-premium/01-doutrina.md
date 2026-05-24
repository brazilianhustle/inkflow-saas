# Doutrina Do Atendimento Premium

> Regra canônica de mudança: antes de adicionar prompt, regex ou exceção conversacional, aplicar [`Conversation Change Doctrine`](../canonical/methodology/conversation-change-doctrine.md). O objetivo é evitar acúmulo de regras ruidosas: decidir explicitamente entre **adicionar**, **substituir** ou **redesenhar**.

## Tese

O InkFlow não deve ser apenas um formulário conversacional. Ele deve agir como um atendente consultivo de estúdio sério: acolhe, entende, responde o suficiente, não inventa decisões técnicas e conduz o cliente até o orçamento/agendamento com segurança.

## Separação Central

Existem duas funções diferentes:

1. **Atendimento**
   - entende intenção;
   - responde dúvidas;
   - acolhe contexto humano;
   - desescala atrito;
   - decide se precisa de humano;
   - retoma o fluxo com naturalidade.

2. **Operação**
   - coleta campos;
   - valida schema;
   - muda estado;
   - envia portfolio;
   - aciona tatuador;
   - reserva horário;
   - gera Pix/sinal;
   - persiste dados.

O erro arquitetural atual é misturar as duas funções dentro dos agents de fase. O agent de coleta tenta ser atendente, parser, guardrail, FAQ e executor ao mesmo tempo.

## Princípios

### 1. Atendimento antes de workflow

Antes de perguntar o próximo campo, o sistema deve identificar o tipo de turno humano.

Exemplo:

```text
Cliente: o que você viu nessa imagem?
```

Resposta errada:

```text
Em qual parte do corpo você quer fazer?
```

Resposta certa:

```text
Vi uma referência com traços finos e composição delicada.

Essa imagem é a referência do desenho ou é a foto do local onde tu quer tatuar?
```

### 2. Naturalidade não é enfeite de prompt

Naturalidade nasce de decisão correta de turno:

- responder a dúvida antes de retomar;
- não repetir pergunta;
- aproveitar dados soltos;
- acolher contexto sem virar textão;
- saber quando parar e chamar humano.

Só proibir palavras como "anotado" ajuda, mas não resolve a causa.

### 3. Segurança operacional continua soberana

Atendimento premium não pode quebrar:

- valor cobrado;
- agendamento;
- estado da conversa;
- dados de cadastro;
- menoridade;
- cobertura;
- handoff para tatuador;
- rastreabilidade em smoke/teste.

Agents strict continuam importantes. Eles devem ser a camada operacional, não a primeira camada de conversa.

### 4. Uma resposta lateral precisa de retomada

O bot premium não vira FAQ solta. Ele responde e retoma.

Padrão:

```text
Resposta curta à intenção lateral.

Pergunta útil para voltar ao fluxo.
```

### 5. Não fingir ser tatuador

O bot pode orientar e explicar processo, mas não deve inventar:

- preço final;
- duração exata;
- número de sessões;
- diagnóstico de pele;
- avaliação médica;
- decisão sobre cobertura complexa;
- aprovação de menor;
- desconto sem tatuador.

### 6. Humano entra quando risco sobe

Quando a conversa tocar risco financeiro, menoridade, agressividade, cobertura complexa, remarcação sensível ou confusão persistente, o sistema deve ter caminho claro para humano.

## Persona Alvo

O tom alvo é **atendente consultivo de estúdio sério**.

Não é:

- formulário frio;
- secretária que só "passa para o tatuador";
- especialista que promete demais;
- amigo excessivamente casual;
- chatbot que escreve textão.

É:

- direto;
- humano;
- brasileiro;
- seguro;
- útil;
- capaz de conduzir.

## Perguntas De Controle

Antes de implementar qualquer mudança conversacional, responder:

1. Que tipo de turno humano isso resolve?
2. Em quais estados isso pode acontecer?
3. Pode mudar estado?
4. Pode persistir dados?
5. Pode acionar ferramenta?
6. Qual é o risco se classificar errado?
7. Como o bot retoma o fluxo?
8. Qual teste prova que está correto?
9. Qual smoke real valida?
10. Esta mudança é correção local, substituição ou sinal de redesenho?

## Regra Anti-Ruído

O atendimento premium não deve evoluir por acúmulo cego de prompt e exceção.

Antes de cada novo slice ou hardening:

- **Adicionar regra** apenas quando a falha for pequena, clara, testável e reversível.
- **Substituir regra** quando uma regra existente estiver ampla, competindo ou gerando falso positivo.
- **Redesenhar camada** quando a mesma família de falha exigir exceções sucessivas ou depender de intenção + dados + histórico + mídia ao mesmo tempo.

Sinais para parar e repensar:

- terceira exceção nova para a mesma intent;
- prompt crescendo para compensar falha de estado/pipeline;
- regex longa sem teste de falso positivo;
- resposta tecnicamente correta mas desatenta ao que o cliente já disse;
- necessidade de explicar ao humano por que a resposta "faz sentido" mesmo soando ruim.
