# Validacao Slice 1 - ConversationRouter

Data: 2026-05-24
Branch: `fix-coleta-prompt-visao-smoke`
Commit validado: `b4c89bc`

## Objetivo

Validar o Slice 1 do `ConversationRouter` para turnos laterais texto-only em atendimento de tatuagem:

- `preco_generico`
- `tempo_sessao`
- `processo_tatuagem`

## Resultado

Status: aprovado em validacao controlada.

O router respondeu aos tres tipos de turno sem alterar estado critico, sem gerar proposta, sem criar agendamento e sem avancar fluxo indevidamente.

Estado final da conversa de teste:

- `estado_agente`: `coletando_tattoo`
- `valor_proposto`: `null`
- `orcid`: `null`
- `agendamentos`: nenhum

## Evidencias

Telefone de teste: `5521970789797`
Tenant de teste: `db686ef2-ca42-43e4-a831-808984d8d6c6`

Turnos validados:

1. Cliente: `quanto fica?`
   - Bot: `O valor depende do tamanho, detalhe e local do corpo. O tatuador confirma certinho depois de avaliar tua ideia.`
   - Retomada: `Me conta o que tu pensa em tatuar?`

2. Cliente: `quanto tempo demora?`
   - Bot: `Depende do tamanho, detalhe e local do corpo. O tatuador confirma melhor quando avaliar tua ideia.`
   - Retomada: `Me conta o que tu pensa em tatuar?`

3. Cliente: `como funciona pra fazer uma tattoo?`
   - Bot: `Funciona assim: eu entendo tua ideia, junto as infos principais e o tatuador avalia pra passar valor e horario.`
   - Retomada: `Me conta o que tu pensa em tatuar?`

## Metodo Usado

O preview foi publicado em:

- `https://9912291c.inkflow-saas.pages.dev`
- alias: `https://fix-coleta-prompt-visao-smok.inkflow-saas.pages.dev`

Porem, o teste E2E via inbound do preview nao valida o router novo de ponta a ponta, porque:

1. `functions/api/whatsapp/inbound.js` enfileira no Durable Object `SESSION_QUEUE`.
2. A classe do Durable Object mora no Worker `inkflow-cron`.
3. `cron-worker/src/session-queue.js` chama `https://inkflowbrasil.com/api/whatsapp/process-batch`.
4. Portanto, uma mensagem recebida no preview e processada pelo endpoint de producao, nao pelo `process-batch` do preview.

Tambem foi confirmado que o endpoint `process-batch` do preview fica protegido por Cloudflare Access, impedindo POST direto externo.

Para validar o codigo do branch sem mexer em producao, foi usado `processBatch()` diretamente em Node, com mensagens controladas inseridas no tenant de teste.

## Implicacao Operacional

Antes de usar preview como smoke E2E confiavel para esse tipo de mudanca, precisamos de uma das opcoes:

1. Permitir que `SessionQueue` receba `PROCESS_BATCH_BASE_URL` por env e aponte para preview quando aplicavel.
2. Criar um endpoint/admin smoke interno que chame `processBatch()` no mesmo deployment sem passar pelo Durable Object.
3. Fazer smoke real apenas depois de deploy em producao, assumindo rollback/kill switch.

Para o Slice 1 atual, a validacao controlada e suficiente para confirmar comportamento do router. A validacao E2E publica completa continua pendente ate resolver a rota de processamento em preview ou promover o branch.
