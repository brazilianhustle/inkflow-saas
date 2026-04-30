---
last_reviewed: 2026-04-29
owner: leandro
status: stable
related: [stack.md, runbooks/outage-wa.md, runbooks/db-indisponivel.md]
---
# Mapa Canônico — Limites e quotas

Limites contratados + thresholds de alerta. Alimenta os auditores **#3 (VPS limits)** e **#5 (billing health)** do Sub-projeto 3 (Time de Auditores). Quando um auditor consultar este arquivo e ver `last_reviewed` >30 dias, sinaliza pra revisão.

> ⚠️ **Valores marcados `[confirmar]` precisam ser validados contra o dashboard real** na próxima sessão de manutenção. O agent de auditoria deve preferir o valor live do dashboard, não esta tabela, quando possível.

## Vultr (Evolution VPS)

VPS dedicado que roda Evolution API + Postgres dela + n8n (3 containers) + n8n Postgres + redis + Traefik + admin-bridge. Único serviço auto-hospedado. Hostname `inkflow-vps`, IP `104.207.145.47`, Ubuntu 22.04 x64 (kernel 5.15), CPU Intel Broadwell, swap 8 GB. Location: Miami. Custo atual: ~$37.72/mês.

| Recurso | Limite | Threshold warn | Threshold critical | Como medir |
|---|---|---|---|---|
| RAM | **8 GB** (8192 MB no painel; 7931 MB usable em `free -m`) | 75% (≈ 5.95 GB) | 90% (≈ 7.14 GB) | `ssh root@<vps> "free -m"` |
| Disco | **160 GB SSD** contratado (150 GB usable em `/dev/vda2`, ~10 GB overhead boot/swap) | 75% (≈ 112 GB usable) | 90% (≈ 135 GB usable) | `ssh root@<vps> "df -h /"` |
| CPU (load avg 5min) | **4 vCPU** | load > 4.0 (1.0×N) | load > 6.0 (1.5×N) | `ssh root@<vps> "uptime"` |
| Network egress (outbound mensal) | **5.29 TB / 5290 GB** pool total (Instance 3.14 TB + Free 2.00 TB; validado painel Dashboard "Bandwidth Pool" 2026-04-29; usage atual 0.00 TB) | 70% (≈ 3700 GB) | 90% (≈ 4760 GB) | Vultr dashboard → Dashboard → "Bandwidth Usage" |
| Backups automáticos | `Enabled` — **Weekly, Monday 07:00 UTC** (próximo: 2026-05-04 07:00 UTC; histórico: 2026-04-27 + 2026-04-20 confirma cadência 7d) | falhar 1x | falhar 2x consecutivos | Vultr dashboard → Backups |

**Dashboard:** https://my.vultr.com (login Bitwarden item `vultr`) — instance `InkFlow SaaS` ID `d111655f-f57b-4fd6-bc27-577f6b04b0b0`.
**Provisionamento:** Ubuntu 22.04 x64, 4 vCPU / 8 GB RAM / 160 GB SSD, Miami location, $37.72/mês (validado painel 2026-04-29). Plano Vultr Cloud Compute Regular Performance.
**Endpoint health metrics:** `https://n8n.inkflowbrasil.com/_health/metrics` (auth via header `X-Health-Token`). Coleta via bash script + cron 1min no host (`/usr/local/bin/inkflow-health-metrics.sh`), servido por container `inkflow-health-1` (nginx:alpine) via Traefik labels. Decisão arquitetural em [decisions/2026-04-29-vps-limits-data-source.md](decisions/2026-04-29-vps-limits-data-source.md).

## Cloudflare Workers (`inkflow-cron`)

CF Worker dispatcher dos crons. **Plano atual: Workers Paid ($5/mês, recorrente, próxima renovação 2026-04-30).**

| Recurso | Limite plano atual | Threshold warn | Threshold critical | Como medir |
|---|---|---|---|---|
| CPU time / req | 30s (Paid Bundled) | 80% do limite | 95% | observability dashboard |
| Subrequests / req | 50 (paid Bundled) ou 1000 (Unbound) | 30 | 45 | observability |
| Requests / dia | 10M+ (Paid) | 80% | 95% | dashboard analytics |
| Cron triggers / dia | conforme schedule (`cron-worker/wrangler.toml`) | n/a | n/a | logs Worker |
| Cron triggers / Worker | **30 (cap Paid)** | n/a | aproximação do cap | wrangler.toml + dashboard |

> **Cron triggers em uso:** atualmente **4** (`expira-trial`, `cleanup-tenants`, `reset-agendamentos`, `monitor-whatsapp`). Sub-projeto 3 (Auditores) adicionará mais 2, totalizando **6** — folga grande até o cap de 30.

**Dashboard:** CF dashboard → Workers & Pages → `inkflow-cron` → Metrics
**Account ID:** `1bea7a6f2e41f53d5687b29ec0bd6fec`

## Cloudflare Pages (`inkflow-saas`)

Site + APIs (`/api/*` rodando como Pages Functions). **Plano atual: Free** (não há subscription `Pages Pro` ativa — billing dashboard 2026-04-27 lista apenas `Workers Paid` como recorrente; R2, Teams, Images/Stream estão em tier Free $0/mo).

| Recurso | Limite | Threshold warn | Threshold critical | Como medir |
|---|---|---|---|---|
| Builds / mês | 500 (Free) | 70% | 90% | dashboard |
| Bandwidth | `unlimited` | n/a | n/a | dashboard |
| Functions invocações / dia | 100k (Free) | 80% | 95% | dashboard |
| Functions CPU time / req | 10ms (Free) | 80% | 95% | observability |
| Concurrent builds | 1 (Free) | n/a (fila) | builds presos >30 min | dashboard |

**Dashboard:** CF dashboard → Workers & Pages → `inkflow-saas` → Settings/Metrics

## Supabase

Banco principal + Auth. Plano: `[confirmar — Free ou Pro $25/mês]`.

| Recurso | Limite plano atual | Threshold warn | Threshold critical | Como medir |
|---|---|---|---|---|
| Storage DB | `[confirmar — 500MB free, 8GB pro+]` | 70% | 85% | dashboard → Database → Disk usage |
| Egress | `[confirmar — 5GB free, 250GB pro]` | 70% | 90% | dashboard → Settings → Usage |
| Auth users | `[confirmar — 50k MAU free]` | 80% | 95% | dashboard → Authentication |
| API requests | conforme plano | 80% | 95% | dashboard |
| Realtime concurrent | conforme plano | 80% | 95% | dashboard |
| Backups (PITR) | só Pro+, retenção 7 dias | falha automática | 2 falhas consecutivas | dashboard → Database → Backups |

**Dashboard:** https://supabase.com/dashboard/project/bfzuxxuscyplfoimvomh/settings/billing
**Project ref:** `bfzuxxuscyplfoimvomh`

## Mercado Pago

Gateway de pagamento. Plano: API pública (sem mensalidade), comissão por transação.

| Recurso | Limite | Notas |
|---|---|---|
| Rate limit API | ver docs MP — sliding window por IP/token | retry com backoff exponencial; ver [docs MP](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/api-management/rate-limits) |
| Valor mínimo subscription | R$ 5/mês | abaixo MP rejeita preapproval |
| Webhook retry (IPN) | até 5x se 5xx | configurável no dashboard |
| Webhook timeout | 22s (resposta) | endpoint `/api/mp-ipn` precisa responder rápido |
| Concurrent preapprovals por payer | 1 ativa | tentar criar 2ª retorna erro |

**Dashboard:** https://www.mercadopago.com.br/developers (Bitwarden `mercado-pago`)
**Notas operacionais:**
- `MP_ACCESS_TOKEN` rotacionável via dashboard. Sem expiração automática mas pode ser revogado.
- Sandbox e produção têm tokens separados — não misturar.

## MailerLite

Email transacional + segmentação. Plano: `[confirmar — Free 1k subs ou Growing $9+/mês]`.

| Recurso | Limite plano atual | Threshold warn |
|---|---|---|
| Subscribers | `[confirmar — 1000 free, 5000 starter]` | 80% |
| Emails / mês | `[confirmar — 12k free, 15k+ paid]` | 80% |
| API rate limit | 60 req/min (documentado) | 50 req/min sustentado vira warn |
| Automation steps | `[confirmar]` | n/a |

**Notas:**
- Grupos usados (envs em CF Pages): `MAILERLITE_GROUP_TRIAL_ATIVO`, `MAILERLITE_GROUP_TRIAL_EXPIROU`, `MAILERLITE_GROUP_CLIENTES_ATIVOS`, `MAILERLITE_GROUP_ID` (legado).
- Falha de API em rotinas críticas (ex: cron expira-trial) loga `mlOk: false` mas NÃO bloqueia o resto do fluxo.

## Telegram (alertas operacionais)

Canal de alertas pro founder. Bot enviando ao chat configurado em `TELEGRAM_CHAT_ID`.

| Recurso | Limite | Notas |
|---|---|---|
| Mensagens / sec por bot | 30 (global) | batch alertas se >30 simultâneos |
| Mensagens / min por chat | 20 | mitigado por agrupamento em runbooks |
| Tamanho mensagem | 4096 chars | quebrar em N mensagens se exceder |

## n8n (self-hosted, mesma VPS Vultr da Evolution)

Orquestrador do bot WhatsApp. Domain: `https://n8n.inkflowbrasil.com`. Hospedado na **mesma VPS Vultr** da Evolution API (per `stack.md`) — disco / RAM / CPU compartilhados com Evolution + Postgres dela.

| Recurso | Limite | Threshold warn |
|---|---|---|
| Concurrent executions | `[confirmar — config self-host]` | n/a |
| Workflow execution time | `[confirmar — depende de config]` | timeout >60s |
| Storage (postgres dedicado) | compartilhado com VPS Evolution (ver seção Vultr acima) | 75% do disco total da VPS |

⚠️ **Implicação operacional:** auditoria de disco / RAM da VPS Vultr cobre Evolution API + Evolution Postgres + n8n + n8n Postgres simultaneamente. Spike em qualquer um derruba todos. Auditor #3 (VPS limits) deve tratar a VPS Vultr como recurso compartilhado, não individual por serviço.

**Workflow principal:** `MEU NOVO WORK - SAAS` (id `PmCMHTaTi07XGgWh`)

## LLM Providers (Claude / OpenAI)

Usados via n8n workflow. Cobrança por token.

| Provider | Modelo principal | Rate limit típico | Custo aprox / 1M tokens |
|---|---|---|---|
| Anthropic | `[confirmar — claude-sonnet-4 ou similar]` | tier 1: 50 req/min | input ~$3, output ~$15 |
| OpenAI | `[confirmar — gpt-4o ou similar]` | tier varia | input ~$2.5, output ~$10 |

**Mitigação de custo runaway:**
- Guardrails PRE bloqueia conversas suspeitas antes do LLM call.
- `simular-conversa` tem rate limit 50 msg/dia/tenant + 5/min (eval-secret bypassa).
- Alerta Telegram se custo diário >R$ X (`[confirmar threshold com founder]`).

---

## Como auditores usam este arquivo

Sub-projeto 3 (Time de Auditores) inclui:

- **Auditor #3 (VPS limits):** lê seções Vultr + n8n. Compara contra valores live (SSH ou API). Dispara Telegram em `warn`/`critical`.
- **Auditor #5 (billing health):** lê seções MP + MailerLite + Supabase. Compara contra dashboards. Flagga discrepâncias billing/comm.
- **Auditor `doc-freshness`:** se `last_reviewed` deste arquivo defasar >30 dias, dispara alerta pra revisar limites contratados.

**Fluxo de update:**
1. Founder altera plano contratado (ex: upgrade Supabase Free → Pro).
2. Atualiza este arquivo (limite + `last_reviewed`).
3. Commit `docs(canonical): atualiza limits.md (upgrade Supabase Pro)`.

**Itens `[confirmar]`:** ao revisar, founder/agent abre cada dashboard listado acima e cola os valores atuais. Se algum estiver muito diferente do contratado, investigar antes de só atualizar a tabela.
