# inkflow-cron — Dispatcher de crons InkFlow

Worker Cloudflare dedicado que roda scheduled handlers para disparar endpoints
cron do `inkflow-saas` (CF Pages Functions) em horários fixos.

Substitui 4 workflows n8n de schedule (expira-trial, cleanup-tenants,
reset-agendamentos, monitor-whatsapp). Zero dependência do n8n.

## Schedules

| Cron                | Endpoint                         | Frequência               |
| ------------------- | -------------------------------- | ------------------------ |
| `0 12 * * *`        | `/api/cron/expira-trial`         | Diário 09:00 BRT         |
| `0 2 * * *`         | `/api/cleanup-tenants`           | Diário 23:00 BRT         |
| `0 9 * * *`         | `/api/cron/reset-agendamentos`   | Diário 06:00 BRT         |
| `*/30 * * * *`      | `/api/cron/monitor-whatsapp`     | A cada 30 min            |

Configurado em `wrangler.toml`. Mudar horário = editar + redeploy.

## Setup inicial

Pré-requisitos: `npm install -g wrangler` e `wrangler login`.

```bash
cd cron-worker
npm install
wrangler deploy

# Secrets (mesmos valores que os da CF Pages inkflow-saas)
wrangler secret put CRON_SECRET
wrangler secret put CLEANUP_SECRET

# Opcional — alerta Telegram quando um cron falha
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
```

## Verificar que rodou

```bash
wrangler tail         # logs em tempo real
```

Ou no dashboard: Workers & Pages → `inkflow-cron` → Logs.

## Rerun manual (sem esperar o cron)

O worker expõe um `fetch` handler autenticado para debug:

```bash
curl -X POST \
  "https://inkflow-cron.<account>.workers.dev/?cron=0+9+*+*+*" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Troque o cron expression pelo que quiser rodar (ver tabela acima).

## Como adicionar um cron novo

1. Criar o endpoint em `../functions/api/cron/XYZ.js` (padrão dos existentes)
2. Adicionar o cron em `wrangler.toml` → `[triggers].crons`
3. Adicionar entrada em `SCHEDULE_MAP` no `src/index.js`
4. `wrangler deploy`

## Observability

- Logs: Workers Observability (30d grátis)
- Alerta Telegram em falha: se `TELEGRAM_*` configurado, manda mensagem quando
  endpoint retorna não-2xx ou exception.

## Rollback

Para desativar temporariamente sem redeploy: Workers dashboard →
`inkflow-cron` → Triggers → desligar os crons. Reativar = ligar de volta.
