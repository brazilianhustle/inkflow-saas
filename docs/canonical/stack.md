---
last_reviewed: 2026-04-26
owner: leandro
status: stable
related: [flows.md, ids.md, runbooks/deploy.md]
---
# Mapa Canônico — Stack Técnica

Inventário dos 8 serviços que compõem o InkFlow. Para detalhes técnicos vivos (bindings, env vars, schema), seguir os links na seção `Config técnica` de cada serviço — este Mapa é a verdade narrativa, os arquivos linkados são a verdade técnica.

## Cloudflare Pages

### Propósito
Frontend HTML estático (landing, onboarding, admin, studio) + endpoints `/api/*` (Pages Functions). É o coração das integrações server-side: fala com Supabase, MP, Evolution e MailerLite.

### URL principal
Produção: `https://inkflowbrasil.com`. Dashboard: `https://dash.cloudflare.com/1bea7a6f2e41f53d5687b29ec0bd6fec/pages/view/inkflow-saas`.

### Owner
Leandro (founder).

### Pontos de integração
- → Supabase (via `SUPABASE_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`)
- → Mercado Pago (via `MP_ACCESS_TOKEN` em `/api/create-subscription`; recebe webhook em `/api/mp-ipn`)
- → Evolution API (via `EVO_GLOBAL_KEY` / `EVOLUTION_GLOBAL_KEY` em `/api/evo-*`)
- → MailerLite (via `MAILERLITE_API_KEY`)
- → Telegram (alertas críticos via `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`)
- ← Cloudflare Worker `inkflow-cron` (via `CRON_SECRET` no header)
- ← n8n (via `N8N_WEBHOOK_SECRET` em `/api/tools/*`)

### Config técnica
Bindings e flags em `wrangler.toml` (raiz do repo). Endpoints code em `functions/api/` (root: `create-subscription.js`, `create-tenant.js`, `evo-*.js`, `mp-ipn.js`; subdirs: `cron/`, `tools/`, `webhooks/`). Libs compartilhadas em `functions/_lib/`. Env vars referenciadas listadas em `scripts/preflight-envvars.sh` (executado pré-deploy).

### Health check
`curl -s -o /dev/null -w "%{http_code}\n" https://inkflowbrasil.com/` (esperado `200`).

## Cloudflare Workers

### Propósito
Worker `inkflow-cron` é o dispatcher de rotinas agendadas. Cada trigger cron chama o endpoint `/api/cron/*` (ou `/api/cleanup-tenants`) correspondente em CF Pages, autenticando via `CRON_SECRET` (ou `CLEANUP_SECRET`).

### URL principal
`https://inkflow-cron.<subdomain>.workers.dev` (rota `*.workers.dev`, account `1bea7a6f2e41f53d5687b29ec0bd6fec`). Code em `cron-worker/src/index.js`.

### Owner
Leandro.

### Pontos de integração
- → CF Pages `/api/cron/expira-trial` (cron `0 12 * * *` — 09h BRT)
- → CF Pages `/api/cleanup-tenants` (cron `0 2 * * *` — 23h BRT)
- → CF Pages `/api/cron/reset-agendamentos` (cron `0 9 * * *` — 06h BRT)
- → CF Pages `/api/cron/monitor-whatsapp` (cron `*/30 * * * *`)
- → Telegram (alertas de falha via `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`)

### Config técnica
Schedules e observability em `cron-worker/wrangler.toml`. Handler `scheduled()` em `cron-worker/src/index.js`. Scripts de teste manual em `cron-worker/package.json` (`npm run test-expira-trial`, etc.). Logs no CF dashboard → Workers → `inkflow-cron` → Logs (observability `enabled = true`).

### Health check
`wrangler tail inkflow-cron --format=pretty` (a partir de `cron-worker/`) — confirmar que o próximo trigger dispara sem `[error]`.

## Supabase

### Propósito
Banco de dados Postgres + auth + storage. Concentra dados de tenants, conversas WhatsApp, agendamentos, logs de tool-calls e logs de pagamento. Acessado server-side por CF Pages e n8n.

### URL principal
Project: `https://bfzuxxuscyplfoimvomh.supabase.co`. Dashboard: `https://supabase.com/dashboard/project/bfzuxxuscyplfoimvomh`.

### Owner
Leandro.

### Pontos de integração
- ← CF Pages (server-side via `SUPABASE_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`)
- ← n8n workflow (via auth token configurado nos credentials do n8n)
- ← Worker `inkflow-cron` indireto (via endpoints CF Pages)

### Config técnica
Schema gerenciado direto via Supabase MCP (`mcp__plugin_supabase_supabase__list_migrations` / `apply_migration`) — não há diretório `supabase/migrations/` versionado no repo neste momento. Tabelas core: `tenants` (com `evo_apikey`, `evo_base_url`, `evo_instance`, `ativo`, etc.), `payment_logs`, `conversas`, `agendamentos`, `tool_calls_log`, `chat_messages`, `bot_state`. RLS policies aplicadas via MCP.

### Health check
`curl -s -o /dev/null -w "%{http_code}\n" -H "apikey: $SUPABASE_ANON_KEY" https://bfzuxxuscyplfoimvomh.supabase.co/rest/v1/` (esperado `200`).

## Evolution API

### Propósito
Servidor de mensagens WhatsApp self-hosted (Vultr VPS). Cada tenant tem 1 instância Evo (criada em `/api/evo-create-instance`) + uma instância "central" pra ações administrativas. Webhooks de mensagens recebidas vão Evo → n8n → Claude.

### URL principal
Base URL configurada via `EVO_BASE_URL` (CF Pages env) e por-tenant em `tenants.evo_base_url`. Hospedagem: Vultr VPS.

### Owner
Leandro (auto-hospedado).

### Pontos de integração
- ← CF Pages (via `EVO_GLOBAL_KEY` / `EVOLUTION_GLOBAL_KEY` para criar/deletar instâncias e via `EVO_CENTRAL_APIKEY` para ações na instância central)
- → n8n (webhook ao receber mensagem WhatsApp)
- ← n8n (envio de mensagens via APIKEY por-tenant lida de `tenants.evo_apikey` no Supabase)

### Config técnica
Instância central: `EVO_CENTRAL_INSTANCE` + `EVO_CENTRAL_APIKEY` + `EVO_BASE_URL` (CF Pages env). Instâncias por tenant: criadas dinamicamente em `functions/api/evo-create-instance.js`, com `evo_apikey` + `evo_instance` salvos em `tenants` (Supabase). Cleanup via `functions/api/cleanup-tenants.js` + endpoint `EVO_DB_CLEANUP_URL` / `EVO_DB_CLEANUP_SECRET`. Risco aberto: instância central sumiu em cleanup recente — ver `InkFlow — Pendências (backlog)`.

### Health check
`curl -s "$EVO_BASE_URL/instance/connectionState/$EVO_CENTRAL_INSTANCE" -H "apikey: $EVO_GLOBAL_KEY" | jq '.state'` (esperado `"open"`).

## Mercado Pago

### Propósito
Billing recorrente (subscriptions com cobrança mensal) + sinais de agendamento (cobrança avulsa). Webhook IPN notifica eventos de pagamento e mudanças de assinatura.

### URL principal
API: `https://api.mercadopago.com`. Dashboard: `https://www.mercadopago.com.br/developers/panel`.

### Owner
Leandro.

### Pontos de integração
- ← CF Pages `/api/create-subscription` (cria assinatura via `MP_ACCESS_TOKEN`)
- → CF Pages `/api/mp-ipn` (webhook IPN — eventos `payment`, `subscription`, etc., autenticado via `MP_WEBHOOK_SECRET`)
- → CF Pages `/api/webhooks/mp-sinal` (sinais de agendamento, lógica em `functions/_lib/mp-sinal-handler.js`)

### Config técnica
Token: `MP_ACCESS_TOKEN` (CF Pages env — nome do secret apenas, valor em `secrets.md` quando criado). Catálogo de planos em `functions/_lib/plans.js` (com snapshot `preco_mensal` para grandfathering). Webhook configurado no painel MP apontando pra `https://inkflowbrasil.com/api/mp-ipn`. Risco aberto: subscription órfã do tenant `e773533e...` precisa cleanup.

### Health check
`curl -s -H "Authorization: Bearer $MP_ACCESS_TOKEN" https://api.mercadopago.com/users/me | jq '.id'` (esperado ID numérico).

## MailerLite

### Propósito
Email transactional + automations de ciclo de vida do tenant (Trial Ativo, Trial Expirou, Clientes Ativos). Subscribers movidos entre 3 grupos via API conforme estado da assinatura.

### URL principal
API: `https://connect.mailerlite.com/api/`. Dashboard: `https://dashboard.mailerlite.com/`.

### Owner
Leandro.

### Pontos de integração
- ← CF Pages (via `MAILERLITE_API_KEY` em `/api/create-tenant`, `/api/mp-ipn`, `/api/cron/expira-trial`)

### Config técnica
3 group IDs em CF Pages env: `MAILERLITE_GROUP_TRIAL_ATIVO`, `MAILERLITE_GROUP_TRIAL_EXPIROU`, `MAILERLITE_GROUP_CLIENTES_ATIVOS` (mais um legado `MAILERLITE_GROUP_ID`). API key: `MAILERLITE_API_KEY`. Acesso direto via MCP `claude_ai_MailerLite__*` quando precisar inspecionar / mexer em automations.

### Health check
`curl -s -H "Authorization: Bearer $MAILERLITE_API_KEY" https://connect.mailerlite.com/api/groups | jq '.data | length'` (esperado `>= 3`).

## n8n

### Propósito
Orquestração do workflow do bot WhatsApp. Workflow principal "MEU NOVO WORK - SAAS" (id `PmCMHTaTi07XGgWh`) recebe webhook do Evolution, chama Claude/OpenAI, dispara guardrails (PRE/POST) em CF Pages, registra em Supabase e envia resposta via Evolution.

### URL principal
App: `https://n8n.inkflowbrasil.com`. MCP: `https://n8n.inkflowbrasil.com/mcp-server/http` (já conectado em `claude mcp list`).

### Owner
Leandro (auto-hospedado, mesma VPS Vultr da Evolution).

### Pontos de integração
- ← Evolution API (webhook ao receber mensagem WhatsApp)
- → CF Pages `/api/tools/guardrails/pre` e `/api/tools/guardrails/post` (autenticados via `N8N_WEBHOOK_SECRET` / `INKFLOW_TOOL_SECRET`)
- → Claude / OpenAI (API key configurada nos credentials n8n; também `OPENAI_API_KEY` em CF Pages para fallback)
- → Supabase (auth token nos credentials n8n)
- → Evolution API (envia resposta via APIKEY por-tenant)

### Config técnica
Workflows hospedados no servidor n8n; inspeção / edição via MCP `n8n` (`get_workflow_details` retorna ~159 KB — sempre salvar em arquivo + jq, não carregar em contexto). Nodes-chave do workflow principal: `Apply Fact-Check` (`2c1604c7-…`), `Guardrails PRE` (`b65df60a-…`), `Guardrails POST` (`d37d740d-…`). 4 workflows secundários migrados para `inkflow-cron` em 21-22/04 — manter desativados como backup até ≥28/04.

### Health check
`curl -s -o /dev/null -w "%{http_code}\n" https://n8n.inkflowbrasil.com/` (esperado `200`).

## Telegram

### Propósito
Canal de alertas e aprovações (incidentes, deploys, rotações de secret, divergências detectadas pelos auditores do Sub-projeto 3). Bidirecional — bot pode receber comandos / aprovações.

### URL principal
Bot configurado via `TELEGRAM_BOT_TOKEN`; chat alvo `TELEGRAM_CHAT_ID`. API base: `https://api.telegram.org`.

### Owner
Leandro.

### Pontos de integração
- ← CF Worker `inkflow-cron` (alertas de falha em qualquer cron — implementado em `cron-worker/src/index.js`)
- ← CF Pages (alertas críticos vindos dos endpoints `/api/*`)
- ← Auditores do Sub-projeto 3 (futuro — divergências canonical-vs-real)

### Config técnica
Token `TELEGRAM_BOT_TOKEN` e chat id `TELEGRAM_CHAT_ID` configurados em ambos: CF Pages env e Worker env (replicados). Integração também acessível via MCP `plugin_telegram_telegram__*` quando precisar mandar / editar mensagens fora de código.

### Health check
`curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe" | jq '.ok'` (esperado `true`).
