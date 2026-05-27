# Wave 51 - Cadencia real de bolhas e queda para LLM lento

Data: 2026-05-27
Nivel: 4B

## Incidente

Teste manual WhatsApp real mostrou dois problemas combinados:

- o bot respondeu antes do cliente concluir 2-3 bolhas em ritmo humano;
- em alguns turnos simples, o lote caiu no agente operacional/LLM e registrou latencia anormal de ~80-90s, parecendo que o bot parou.

Evidencia observada:

- `oi` + `quero fazer um fechamento` foram processados ainda dentro de conversa suja de teste antigo;
- resposta veio ~79.6s depois;
- estado persistido anterior (`coletando_tattoo`) fez o bot retomar `Qual a tua altura?`, provando que o smoke manual nao estava limpo.

## Causa raiz

1. `SessionQueue` usava `DEBOUNCE_MS=8000` e `MAX_WAIT_MS=20000`, janela insuficiente para bursts organicos de 2-3 bolhas em ritmo humano.
2. Primeiro contato com ideia simples, sem preco e sem multi-info suficiente, ainda podia cair no LLM.
3. Teste manual sem limpeza previa reaproveitou estado antigo, contaminando o diagnostico conversacional.

## Decisao

- aumentar a janela estrutural da fila para `DEBOUNCE_MS=12000` e `MAX_WAIT_MS=35000`;
- rotear deterministicamente primeiro contato com ideia simples (`oi` + `quero fazer um fechamento`) quando a descricao pendente foi respondida;
- manter greeting curto apenas como intro, sem reabrir apresentacao longa;
- nao marcar PASS real enquanto o teste nao for do zero, com limpeza confirmada, WhatsApp real e conversa organica.

## Validacao local

- `node --test tests/_lib/conversation-router.test.mjs` PASS 74/74
- `node --test tests/_lib/whatsapp-pipeline.test.mjs` PASS 73/73
- `node --test tests/_lib/session-queue.test.mjs` PASS 13/13
- `npm test` PASS 1252/1252

## Provas locais

Cliente: `oi` + `quero fazer um fechamento`

Bot esperado local: `Oii, tudo bem.` + reconhecimento de `fechamento` + pergunta de local do corpo.

`runAgent=0`, ou seja, sem LLM no caminho simples.

## Proximo gate

Depois de deploy, limpar historico do telefone de teste e validar WhatsApp real do inicio:

1. Cliente envia 2-3 bolhas em ritmo humano.
2. Bot deve esperar a janela de silencio e responder uma vez ao lote completo.
3. Bot nao pode responder antes da ultima bolha humana planejada.
4. Bot nao pode cair em latencia de 80-90s nesse caso simples.
