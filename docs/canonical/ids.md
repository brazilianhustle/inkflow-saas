---
last_reviewed: 2026-05-03
owner: leandro
status: stable
related: [stack.md, secrets.md]
---

# Mapa Canônico — IDs e Referências

Inventário de identificadores estáveis do InkFlow (IDs de domínio, tabelas Supabase, workflows n8n, group IDs MailerLite e endpoints internos). Para schema completo do Supabase, fazer grep nos arquivos referenciados — não há `supabase/migrations/` no repo. Para lista detalhada de secrets, ver `secrets.md`.

## IDs de domínio

| Nome | Formato | Exemplo | Onde usado |
|---|---|---|---|
| `tenant_id` | UUID v4 | `a1b2c3d4-e5f6-7890-abcd-ef0123456789` | `tenants.id`, FK em quase todas as tabelas, query string em endpoints `/api/*` |
| `mp_subscription_id` | string opaca MP | `2c93808495a1b2c30001f2g3h4i5j6k7` | `tenants.mp_subscription_id`, MercadoPago Preapproval API |
| `mp_payment_id` | int64 | `1234567890` | `payment_logs.mp_payment_id`, payload de webhooks MP IPN |
| `evo_instance` | string custom | `central` ou `tenant-<uuid-prefix>` | `tenants.evo_instance`, path da Evolution API e nome da instância no Evo |
| `onboarding_key` | UUID v4 | `b2c3d4e5-f6a7-8901-bcde-f01234567890` | `onboarding_links.onboarding_key`, header / body em endpoints de self-checkout |
| `studio_token` | string opaca | `studio_<random>` | `tenants.studio_token`, cookie/body para acesso ao painel do estúdio |
| `tatuador_telegram_chat_id` | int (string) | `123456789` | `tenants.tatuador_telegram_chat_id` — Modo Coleta v2 canal tatuador |
| `orcid` | string curto base36 | `orc_a1b2c3` | `conversas.orcid` — identificador do orçamento (Modo Coleta v2). Usado em `callback_data` Telegram pra rotear callback → conversa |

## Tabelas Supabase

Esquema vive em `supabase/migrations/` (versionado desde 2026-04-26) + aplicado no Dashboard SQL Editor. As tabelas abaixo foram identificadas via grep `rest/v1/<tabela>` em `functions/` **e** via inspeção do helper wrapper `del()` em `functions/api/delete-tenant.js` (que constrói a URL `rest/v1/` internamente, então não aparece no grep direto).

> Nota: nem toda tabela aparece via grep `rest/v1/` — algumas só são acessadas por wrappers (`del()`, etc.). Sempre validar contra `delete-tenant.js` ao mapear o esquema.

| Tabela | Propósito | Referenciada em |
|---|---|---|
| `tenants` | registro mestre de cada estúdio (status, plano, MP sub, Evo instance, prompt) | `functions/api/_auth-helpers.js`, `functions/api/get-tenant.js`, `functions/api/update-tenant.js` (+ ~25 outros) |
| `payment_logs` | histórico de pagamentos MP recebidos via IPN | `functions/api/create-subscription.js`, `functions/api/mp-ipn.js`, `functions/api/delete-tenant.js:224,239` |
| `conversas` | mensagens trocadas com clientes pelo bot WhatsApp | `functions/api/tools/prompt.js`, `functions/api/tools/reservar-horario.js`, `functions/_lib/mp-sinal-handler.js` |
| `agendamentos` | slots agendados/holds/confirmados | `functions/api/tools/reservar-horario.js`, `functions/api/tools/reagendar-horario.js`, `functions/api/cron/expira-holds.js`, `functions/api/cron/followup.js` |
| `tool_calls_log` | log de invocações das tools (auditoria + guardrails) | `functions/api/tools/_tool-helpers.js`, `functions/api/tools/guardrails/post.js` |
| `onboarding_links` | chaves temporárias de self-checkout (público) | `functions/api/public-start.js`, `functions/api/create-onboarding-link.js`, `functions/api/validate-onboarding-key.js` |
| `dados_cliente` | dados estendidos por cliente (usado no reset diário) | `functions/api/cron/reset-agendamentos.js` |
| `chat_messages` | mensagens individuais de chats WhatsApp (histórico granular por mensagem) | `functions/api/delete-tenant.js:219,234` |
| `chats` | sessões/threads de chat WhatsApp (parent de `chat_messages`) | `functions/api/delete-tenant.js:220,235` |
| `logs` | logs genéricos da aplicação (eventos diversos por tenant) | `functions/api/delete-tenant.js:222,237` |
| `signups_log` | log de eventos de signup (auditoria de cadastros) | `functions/api/delete-tenant.js:223,238` |
| `audit_runs` | execuções dos auditores Sub-projeto 3 (key-expiry, deploy-health, etc) | `functions/api/audit/*` |
| `approvals` | tabela de aprovações pendentes (Telegram bot down runbook) | `functions/api/approvals/decide.js`, `functions/api/approvals/list.js` |

## Workflows n8n

| Nome | ID | Status | MCP path |
|---|---|---|---|
| MEU NOVO WORK - SAAS | `PmCMHTaTi07XGgWh` | ATIVO | `n8n://workflows/PmCMHTaTi07XGgWh` |
| Expira Trial | `KEO1tJRKpYTxi15E` | DESATIVADO (migrado pra cron-worker em 21/04) | `n8n://workflows/KEO1tJRKpYTxi15E` |
| Cleanup Tenants | `JuWleItL6kb0x1NO` | DESATIVADO | `n8n://workflows/JuWleItL6kb0x1NO` |
| Reset Agendamentos | `V2zccb03P9ZUEH3o` | DESATIVADO | `n8n://workflows/V2zccb03P9ZUEH3o` |
| Monitor WA | `JZF5llQOonKjDxpY` | DESATIVADO | `n8n://workflows/JZF5llQOonKjDxpY` |

### Nodes-chave do workflow principal

| Node | ID | Tipo | Função |
|---|---|---|---|
| Apply Fact-Check | `2c1604c7-c965-4029-99c4-4a747a36ead5` | Set | aplica resultado do fact-checker de preços |
| Guardrails PRE | `b65df60a-6d6c-4881-851e-fc95a2d0a826` | HTTP | chama `/api/tools/guardrails/pre` |
| Guardrails POST | `d37d740d-df43-449a-8b14-bbbce842d586` | HTTP | chama `/api/tools/guardrails/post` |

## Group IDs MailerLite

Valores numéricos vivem em CF Pages env vars — não inclua valores aqui.

| Group | ID env var | Propósito |
|---|---|---|
| Trial Ativo | `MAILERLITE_GROUP_TRIAL_ATIVO` | tenants em trial 7d |
| Trial Expirou | `MAILERLITE_GROUP_TRIAL_EXPIROU` | tenants que não converteram |
| Clientes Ativos | `MAILERLITE_GROUP_CLIENTES_ATIVOS` | tenants pagantes |
| Default (legado) | `MAILERLITE_GROUP_ID` | grupo genérico inicial; uso a depreciar conforme segmentação amadurece |

## Endpoints internos

Todos os endpoints aceitam `OPTIONS` (CORS preflight) e `POST` no método principal — `GET` retorna 405. Auth varia por endpoint.

### Públicos / self-service

| Endpoint | Método | Auth | Propósito |
|---|---|---|---|
| `/api/public-start` | POST | nenhuma | gera `onboarding_key` para self-checkout |
| `/api/create-subscription` | POST | nenhuma (validação interna) | cria subscription MP + tenant + Evo instance |
| `/api/create-onboarding-link` | POST | admin Bearer JWT | gera link de onboarding manualmente |
| `/api/validate-onboarding-key` | POST | nenhuma (a chave é o segredo) | valida `onboarding_key` antes do form |
| `/api/create-tenant` | POST | onboarding_key | cria tenant após onboarding completo |

### Tenant / estúdio (escopados)

| Endpoint | Método | Auth | Propósito |
|---|---|---|---|
| `/api/get-tenant` | POST | onboarding_key OU studio_token OU admin JWT | lê dados do tenant (campos por escopo) |
| `/api/update-tenant` | POST | onboarding_key OU studio_token OU admin JWT | atualiza campos do tenant (whitelist por escopo) |
| `/api/request-studio-link` | POST | nenhuma (envia link p/ tenant cadastrado) | envia link mágico de acesso ao painel |
| `/api/validate-studio-token` | POST | studio_token | valida token e devolve sessão |
| `/api/get-studio-token` | POST | onboarding_key | troca onboarding_key por studio_token |
| `/api/send-studio-email` | POST | admin JWT | envia email de acesso ao estúdio |
| `/api/send-whatsapp-link` | POST | admin JWT | envia link via WhatsApp ao tenant |
| `/api/create-artist-invite` | POST | admin JWT | cria convite p/ artista vinculado |
| `/api/delete-tenant` | POST | admin JWT | exclui tenant + dados relacionados |

### Evolution / WhatsApp

| Endpoint | Método | Auth | Propósito |
|---|---|---|---|
| `/api/evo-create-instance` | POST | admin JWT | cria instância na Evolution API |
| `/api/evo-qr` | POST | onboarding_key OU studio_token | retorna QR code de pareamento |
| `/api/evo-pairing-code` | POST | onboarding_key OU studio_token | retorna código numérico alternativo |
| `/api/evo-status` | POST | onboarding_key OU studio_token | status de conexão da instância |

### Webhooks externos

| Endpoint | Método | Auth | Propósito |
|---|---|---|---|
| `/api/mp-ipn` | POST | header `x-signature` (HMAC MP) | recebe IPN de assinatura MP |
| `/api/webhooks/mp-sinal` | POST | header `x-signature` (HMAC MP) | recebe pagamento de sinal de agendamento |
| `/api/telegram/webhook` | POST | header `X-Telegram-Bot-Api-Secret-Token` (`INKFLOW_TELEGRAM_WEBHOOK_SECRET`) | recebe updates do bot Modo Coleta v2 (start/callbacks/replies) |
| `/api/check-telegram-connected` | GET | onboarding_key (query string) | polling do onboarding UI pra detectar quando tatuador conectou Telegram |

### Cron (chamados pelo `cron-worker`)

| Endpoint | Método | Auth | Propósito |
|---|---|---|---|
| `/api/cleanup-tenants` | POST | Bearer `CLEANUP_SECRET` ou `CRON_SECRET` | remove tenants abandonados |
| `/api/cron/expira-trial` | POST | Bearer `CRON_SECRET` | expira tenants em trial 7d |
| `/api/cron/expira-holds` | POST | Bearer `CRON_SECRET` | libera holds de agendamento expirados |
| `/api/cron/reset-agendamentos` | POST | Bearer `CRON_SECRET` | reset diário de slots / dados_cliente |
| `/api/cron/monitor-whatsapp` | POST | Bearer `CRON_SECRET` | checa instâncias Evo desconectadas |
| `/api/cron/followup` | POST | Bearer `CRON_SECRET` | dispara follow-up pós-agendamento |
| `/api/cron/cuidados-pos` | POST | Bearer `CRON_SECRET` | envia mensagem de cuidados pós-tatuagem |

### Tools (chamadas pelo workflow n8n principal)

Todas validam `X-Inkflow-Tool-Secret` contra `INKFLOW_TOOL_SECRET` (ver `functions/api/tools/_tool-helpers.js`).

| Endpoint | Método | Auth | Propósito |
|---|---|---|---|
| `/api/tools/prompt` | POST | Tool Secret | retorna prompt de sistema do tenant (mode-aware Coleta v2) |
| `/api/tools/calcular-orcamento` | POST | Tool Secret | calcula preço (modo Exato apenas — Coleta v2 não usa) |
| `/api/tools/preview-orcamento` | POST | Tool Secret | preview rápido de orçamento (sem persistir) |
| `/api/tools/consultar-horarios` | POST | Tool Secret | lista horários disponíveis |
| `/api/tools/reservar-horario` | POST | Tool Secret | cria hold/agendamento |
| `/api/tools/reagendar-horario` | POST | Tool Secret | reagenda horário existente |
| `/api/tools/gerar-link-sinal` | POST | Tool Secret | gera link MP p/ pagamento de sinal |
| `/api/tools/enviar-portfolio` | POST | Tool Secret | envia imagens do portfolio via WA |
| `/api/tools/aprimorar-persona` | POST | Tool Secret | refina persona do tenant via LLM |
| `/api/tools/acionar-handoff` | POST | Tool Secret | transfere conversa pra humano |
| `/api/tools/simular-conversa` | POST | Tool Secret | simulador de conversa (admin/debug) |
| `/api/tools/guardrails/pre` | POST | Tool Secret | guardrail antes da resposta do bot |
| `/api/tools/guardrails/post` | POST | Tool Secret | guardrail depois da resposta + log |
| `/api/tools/dados-coletados` | POST | Tool Secret | **Modo Coleta v2** — persiste 1 campo em `dados_coletados`/`dados_cadastro`. Side-effects: 3 OBR completos → estado=coletando_cadastro; menor de idade → estado=aguardando_tatuador (gatilho) |
| `/api/tools/enviar-orcamento-tatuador` | POST | Tool Secret | **Modo Coleta v2** — monta orçamento, envia Telegram com inline keyboard, gera `orcid`, estado=aguardando_tatuador |
| `/api/tools/enviar-objecao-tatuador` | POST | Tool Secret | **Modo Coleta v2** — manda objeção de desconto pro Telegram do tatuador (Aceitar X / Manter Y), estado=aguardando_decisao_desconto |
| `/api/tools/consultar-proposta-tatuador` | POST | Tool Secret | **Modo Coleta v2** — lê estado da conversa pra agente saber se tatuador já decidiu |

## Identificadores externos relevantes

- Cloudflare Account ID: `1bea7a6f2e41f53d5687b29ec0bd6fec`
- CF Pages project: `inkflow-saas` (root `wrangler.toml`)
- CF Worker (cron dispatcher): `inkflow-cron` (`cron-worker/wrangler.toml`)
- Supabase Project ref: `bfzuxxuscyplfoimvomh` — `https://bfzuxxuscyplfoimvomh.supabase.co`
- Domínio produção: `inkflowbrasil.com`
- n8n MCP: `https://n8n.inkflowbrasil.com/mcp-server/http`
