# Plano Técnico Slice 1 - ConversationRouter Texto-Only

## Status

`validado_smoke_pass`

## Objetivo

Provar a arquitetura do `ConversationRouter` com intents laterais texto-only em estados de coleta, sem tocar dinheiro, agenda ou side effects críticos.

## Intents Do Slice

- `preco_generico`
- `tempo_sessao`
- `processo_tatuagem`

## Escopo

O router intercepta mensagens em:

- `tattoo`
- `cadastro`

Não intercepta:

- `propondo_valor`
- `escolhendo_horario`
- `aguardando_sinal`
- `aguardando_tatuador`
- estados financeiros/terminais

## Arquitetura Implementada

```text
whatsapp-pipeline
-> monta TurnContext básico
-> routeConversationTurn
   -> se intent Slice 1 reconhecida: retorna output compatível com runAgent
   -> se não reconhecida: null
-> fallback para runAgent atual
```

## Arquivos

- `functions/_lib/conversation-router.js`
- `functions/_lib/whatsapp-pipeline.js`
- `tests/_lib/conversation-router.test.mjs`
- `tests/_lib/whatsapp-pipeline.test.mjs`

## Contrato Atual

Entrada:

```text
estado_atual
mensagem
historico
imagens
tenant
conversa
clientContext
disabled
```

Saída quando intercepta:

```text
ok: true
handled_by: conversation_router
intent
confidence
risk
resposta_cliente
estado_novo: estado_atual
dados_persistidos: {}
proxima_acao: pergunta
agent_usado: conversation_router
```

## Kill Switch

```text
DISABLE_CONVERSATION_ROUTER=true
```

Quando ativo, o pipeline cai no `runAgent` atual.

## Regras De Segurança

- Não muda estado.
- Não persiste valor.
- Não gera cobrança.
- Não agenda.
- Não aciona tatuador.
- Não intercepta negociação com valor explícito como "faz por 500?".
- Não intercepta proposta/agendamento/sinal.

## Validação Automatizada

Testes focados:

```bash
node --test tests/_lib/conversation-router.test.mjs
node --test tests/_lib/whatsapp-pipeline.test.mjs
```

Cobertura mínima:

- classificação das três intents;
- negociação não vira preço genérico;
- resposta preserva estado;
- cadastro retoma cadastro;
- pipeline não chama `runAgent` quando router intercepta;
- kill switch chama `runAgent`.

## Smoke Real Validado

Cenários mínimos validados:

1. `quanto fica?`
2. `quanto tempo demora?`
3. `como funciona pra fazer uma tattoo?`

Cada smoke confirmou:

- resposta lateral adequada;
- próxima pergunta útil;
- `estado_agente` preservado;
- nenhum orçamento/agendamento/cobrança criado;
- mensagens persistidas corretamente.

## Próximo Slice

Depois do smoke do Slice 1, os próximos incrementos foram executados dentro do slice `atendimento-lateral`:

- `historia_vida`
- `pergunta_imagem`
- `portfolio`

Gate atual:

```bash
bash scripts/smoke/check-slice-gate.sh atendimento-lateral
```
