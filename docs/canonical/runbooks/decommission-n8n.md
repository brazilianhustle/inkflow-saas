# Runbook — Desligamento do n8n

> **Status:** pronto pra execução manual, **aguardando autorização do Leandro**
> após validação por smoke do cutover (feature `feat/cutover-total-n8n`).
> Este runbook **não** é executado pela feature de cutover — só entregue por ela.

## Contexto

O código já está 100% livre de n8n como dependência viva (cutover de 2026-05-14).
O n8n segue de pé, ocioso, como rede de segurança / rollback. Este runbook desliga
ele fisicamente, na ordem segura.

- **Workflow:** `MEU NOVO WORK - SAAS` — id `PmCMHTaTi07XGgWh`, 98 nós, `active: true`
- **Webhook:** `https://n8n.inkflowbrasil.com/webhook/inkflow` (sem tráfego real)
- **Container:** VPS `root@104.207.145.47`
- **Env vars no CF Pages:** `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET` (prod + preview)

## Pré-requisito

Smoke do cutover validado em produção: mensagem real no `inkflow_test_sub4` chega
via `/api/whatsapp/inbound` e é respondida pelo bot.

## ⚠️ Atenção — dependência no domínio `n8n.inkflowbrasil.com`

O cron `functions/api/cron/audit-vps-limits.js` (Auditor #3) faz fetch de
`https://n8n.inkflowbrasil.com/_health/metrics` pra coletar métricas da VPS. Esse
endpoint **não é o n8n** — é um endpoint de health da VPS servido no mesmo domínio
(reverse-proxy). Antes do passo 3 (parar o container), confirmar se `_health/metrics`
continua respondendo com o container n8n parado:

```bash
curl -sS https://n8n.inkflowbrasil.com/_health/metrics
```

- **Se continuar respondendo** (servido por nginx/outro processo): nada a fazer.
- **Se quebrar junto com o n8n:** `audit-vps-limits.js` vai falhar silenciosamente —
  re-apontar a URL pro novo host das métricas (ou desativar o Auditor #3) **antes**
  do passo 3.

## Passos (na ordem)

1. **Exportar o JSON do workflow pra arquivo morto versionado.**
   Exportar `MEU NOVO WORK - SAAS` (id `PmCMHTaTi07XGgWh`) e salvar em
   `docs/canonical/archive/n8n-workflow-PmCMHTaTi07XGgWh.json`. Commitar.

2. **Desativar o workflow no n8n** (`active: false`).
   Pela UI do n8n ou API. Confirmar que ficou inativo.

3. **Parar o container n8n na VPS** (`root@104.207.145.47`).
   `docker stop <container-n8n>` (confirmar nome do container antes).
   Pré-checagem: ver a seção "⚠️ Atenção" acima sobre `_health/metrics`.

4. **Remover as env vars do dashboard CF Pages.**
   Remover `N8N_WEBHOOK_URL` e `N8N_WEBHOOK_SECRET` dos environments
   **production e preview** do projeto InkFlow no Cloudflare Pages.

## Rollback

Se algo quebrar **antes do passo 3** (container ainda de pé):
re-ativar o workflow (`active: true`) e re-apontar o webhook da Evolution do
tenant afetado de volta pro n8n. Como o container nunca parou, o rollback é imediato.

Depois do passo 3, o rollback exige subir o container de novo antes de re-ativar.
