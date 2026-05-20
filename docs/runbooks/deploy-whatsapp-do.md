# Runbook — Deploy do DO SessionQueue (serializacao WhatsApp)

## Ordem OBRIGATORIA (a class precisa existir antes do binding por script_name)

1. **Deploy do cron-worker primeiro** (define a class + roda a migration sqlite):
   ```bash
   cd cron-worker
   npx wrangler deploy        # cria/atualiza a class SessionQueue + migration v1
   cd ..
   ```
   Confirme no output: `Your Durable Objects: SessionQueue` e a migration `v1` aplicada.

2. **Garantir o secret** (mesmo valor nos dois lados; provavelmente ja existe):
   ```bash
   cd cron-worker && npx wrangler secret put CRON_SECRET && cd ..   # se ainda nao setado
   ```
   O Pages project (inkflow-saas) ja usa CRON_SECRET nos endpoints cron — nenhum secret novo.

3. **Deploy do Pages project** (resolve o binding via script_name=inkflow-cron):
   - Via Git (quando o deploy-via-Git estiver OK) OU `npx wrangler pages deploy .`
   - O binding `SESSION_QUEUE` so resolve DEPOIS que o inkflow-cron tem a class publicada.

## Rollback

- O `inbound.js` tem fallback: sem o binding, retorna `queued:false` e a msg fica `received`
  (recuperavel). Reverter o deploy do Pages volta ao comportamento anterior, mas o pipeline
  antigo (`processMessage`) nao existe mais — o rollback real e revert do commit + redeploy.
- Para desligar rapido sem revert: remover o `[[durable_objects.bindings]]` do Pages faz o
  inbound cair no fallback (msgs ficam received). Combinar com a varredura fase-2 (futura).

## Dev local

DO de Worker externo em `wrangler pages dev` exige rodar o cron-worker em paralelo:
```bash
# terminal 1
cd cron-worker && npx wrangler dev
# terminal 2 (raiz)
npx wrangler pages dev . --do SESSION_QUEUE=SessionQueue@inkflow-cron
```
Testes unitarios NAO dependem disso (deps/state mockados).

## Smoke E2E (o mesmo que pegou o bug — tenant teste db686ef2)

1. 1o contato: cliente manda **foto + legenda + 2-3 textos** em rajada (<4s entre balões).
2. Esperado: **UMA** resposta coerente que considera tudo; **sem** re-saudação dupla;
   estado preservado (nao reinicia do zero); a foto correlacionada (foto_local_msg_id).
3. Conferir nos logs do CF (Workers → inkflow-cron → Logs e Pages Functions):
   - `process-batch` chamado 1× pro lote (nao N×).
   - runAgent 1×.
4. Calibrar DEBOUNCE_MS/MAX_WAIT_MS se a cadencia real de digitacao pedir.

## Checklist pos-deploy

- [ ] cron-worker deployado, class SessionQueue listada, migration v1 ok
- [ ] Pages deployado, binding SESSION_QUEUE resolvido (sem erro de script_name)
- [ ] Smoke E2E passou (1 resposta, sem re-saudacao, foto correlacionada)
- [ ] Logs sem `SESSION_QUEUE binding ausente`
