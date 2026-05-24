# Arquitetura Alvo

Este documento descreve a direção arquitetural esperada para o atendimento premium. Ele não é uma implementação fechada; é o norte para planos técnicos.

## Arquitetura Atual Simplificada

```text
WhatsApp/Evolution
-> inbound
-> SessionQueue/batching
-> whatsapp-pipeline
-> runAgent por estado
-> agent strict da fase
-> router de action/proximo estado
-> persistência/tools
-> resposta
```

Problema:

```text
Toda mensagem entra primeiro como mensagem da fase atual.
```

Se o estado é `coletando_tattoo`, a mensagem tende a virar coleta, mesmo quando o cliente fez uma pergunta lateral.

## Arquitetura Alvo

```text
WhatsApp/Evolution
-> inbound
-> SessionQueue/batching
-> TurnContext
-> ConversationRouter
-> AtendimentoPolicy
-> Skill/Agent operacional quando necessário
-> tools/side effects
-> resposta + retomada
```

## Camadas

### 1. TurnContext

Normaliza o turno:

- mensagem textual;
- lote de balões;
- imagens;
- histórico;
- estado atual;
- dados coletados;
- dados de cadastro;
- tenant/config;
- contexto de portfolio/proposta quando necessário.

### 2. ConversationRouter

Classifica o tipo de turno humano.

Exemplo de saída:

```json
{
  "intent": "tempo_sessao",
  "confidence": 0.91,
  "family": "lateral_atendivel",
  "risk": "medium",
  "can_mutate_state": false,
  "handoff_required": false
}
```

### 3. AtendimentoPolicy

Decide o que pode acontecer.

Perguntas:

- pode responder direto?
- pode persistir dado?
- pode mudar estado?
- precisa de humano?
- deve cair no agent atual?
- precisa bloquear?

### 4. Response/Resume

Gera a resposta lateral e a retomada do fluxo.

Padrão:

```text
resposta à intenção humana

pergunta útil para seguir
```

### 5. Skill/Agent Operacional

Agents atuais continuam importantes:

- TattooAgent;
- CadastroAgent;
- PropostaAgent;
- Portfolio/action tools.

Mas devem ser chamados quando a política decidir que o turno é operacional ou que precisa de extração/persistência estruturada.

## Fronteira Importante

O `router.js` atual não deve ser confundido com `ConversationRouter`.

Hoje:

```text
router.js = valida action e calcula próximo estado depois do agent
```

Alvo:

```text
ConversationRouter = classifica intenção antes do agent
```

## Fallback

Todo slice inicial deve ter fallback conservador:

```text
confidence baixo -> fluxo atual
intent desconhecida -> fluxo atual
erro no router -> fluxo atual
feature flag off -> fluxo atual
```

## Rollout Recomendado

### Fase 0 - Contrato e testes sem produção

- criar contrato do router;
- testar classificação local;
- sem mudar hot path.

### Fase 1 - Onda 1 atrás de flag

- intents laterais;
- sem mudança crítica de estado;
- smoke real.

### Fase 2 - Persistência leve

- dados extraídos de história/multi-info;
- imagem com descrição;
- portfolio.

### Fase 3 - Risco/contexto

- terceiro;
- menoridade;
- cobertura;
- cliente irritado.

### Fase 4 - Operação financeira/agenda

- negociação;
- pagamento/sinal;
- remarcação;
- novo pedido.

## Critério De Arquitetura Saudável

A arquitetura está saudável quando:

- intent lateral não precisa ser enfiada dentro de prompt de coleta;
- estado não muda sem política explícita;
- resposta lateral sempre sabe retomar;
- tests cobrem intent por estado;
- smoke real confirma comportamento;
- rollback é simples.
