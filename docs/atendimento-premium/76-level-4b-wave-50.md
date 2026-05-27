# Wave 50 - Nome curto pendente sem LLM

Data: 2026-05-27
Level: 4B
Status: local_validated_pending_real_whatsapp

## Problema

Teste manual em WhatsApp real mostrou atraso de aproximadamente 80-90s quando o bot perguntava `Como posso te chamar?` e o cliente respondia apenas o nome.

Evidencia observada:

- Cliente: `Macus`
- Bot: respondeu somente cerca de 89s depois com `Em qual parte do corpo tu quer fazer?`
- `agent_turn_logs.latency_total_ms=79593`

## Causa Raiz

O sistema ja detectava `nome_curto` como pergunta pendente, mas no estado `tattoo` a resposta pura de nome sem pergunta lateral nao tinha caminho deterministico no `ConversationRouter`.

Resultado anterior:

- mensagem curta de nome caia no `runAgent`;
- o LLM podia demorar excessivamente;
- o nome nao era persistido como contexto preferido;
- o fluxo parecia travar antes de retomar a coleta.

## Decisao Estrutural

Criar tratamento deterministico para `nome_curto` pendente no estado `tattoo`, sem transformar esse nome em cadastro formal.

Contrato:

- `nome_curto` respondido no estado `tattoo` vira `dados_coletados.nome_preferido`;
- `dados_cadastro.nome` continua reservado para nome completo na fase de cadastro;
- a resposta retoma a proxima pergunta de tattoo sem chamar LLM;
- `clientContext.nome_cliente` passa a usar `dados_cadastro.nome || dados_coletados.nome_preferido`.

## Arquivos Alterados

- `functions/_lib/conversation-policy.js`
- `functions/_lib/conversation-router.js`
- `functions/_lib/whatsapp-pipeline.js`
- `tests/_lib/conversation-router.test.mjs`
- `tests/_lib/whatsapp-pipeline.test.mjs`

## Validacao Local

```text
node --test tests/_lib/conversation-router.test.mjs
PASS 73/73

node --test tests/_lib/whatsapp-pipeline.test.mjs
PASS 73/73

npm test
PASS 1251/1251
```

## Provas Locais

```text
Cliente: "Macus"
Bot esperado: "Boa, Macus. Tu imagina fazer em qual parte do corpo?"
Garantia: runAgent callCount=0; dados_coletados.nome_preferido="Macus"; dados_cadastro permanece {}
```

## Status De Producao

Nao marcar PASS final ainda.

Proximo gate obrigatorio:

- commit/deploy;
- zerar historico;
- WhatsApp real do inicio do fluxo;
- validar que a resposta ao nome curto sai sem atraso anormal e continua a coleta.
