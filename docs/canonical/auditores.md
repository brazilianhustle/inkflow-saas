# Auditores InkFlow

Spec: [2026-04-27-auditores-mvp-design.md](../superpowers/specs/2026-04-27-auditores-mvp-design.md) v1.1

Lista canônica dos auditores em prod. Cada entry: frequência, source de dados, política de severity, runbook, suggested_subagent. Pipeline core (`audit-state.js` + endpoints `/api/audit/*` + crons) compartilhado entre todos.

## key-expiry

**Status:** ✅ Em produção (2026-04-27)
**Onde:** `inkflow-cron` Worker
**Frequência:** Diário 03:00 BRT (cron `0 6 * * *`)
**Endpoint:** `functions/api/cron/audit-key-expiry.js`
**Lib `detect()`:** `functions/_lib/auditors/key-expiry.js`
**Tests:** `tests/auditor-key-expiry.test.mjs` (19 unit) + `tests/audit-key-expiry-endpoint.test.mjs` (5 integration)
**Runbook:** [secrets-expired.md](runbooks/secrets-expired.md)
**Suggested subagent:** `deploy-engineer`

### Detecção em 3 camadas

| Layer | Source | Severity rules |
|---|---|---|
| 1 (TTL) | env `CLOUDFLARE_API_TOKEN_EXPIRES_AT` (ISO date) | >14d clean / 7-14d warn / 1-6d critical / ≤0 critical |
| 2 (self-check) | API call em 8 secrets (verify endpoint) | 401/403 critical / network error warn / 200 clean / non-ok 4xx-5xx warn |
| 3 (drift) | CF Pages.modified_on vs Worker.modified_on | opt-in via `AUDIT_KEY_EXPIRY_LAYER3=true`. \|diff\| > 24h → warn |

### Secrets cobertos (Layer 2)

| Secret | Endpoint self-check |
|---|---|
| `CLOUDFLARE_API_TOKEN` | `https://api.cloudflare.com/client/v4/user/tokens/verify` |
| `CF_API_TOKEN` | mesmo (token CF para GHA Pages — separado) |
| `MP_ACCESS_TOKEN` | `https://api.mercadopago.com/users/me` |
| `TELEGRAM_BOT_TOKEN` | `https://api.telegram.org/bot<token>/getMe` |
| `OPENAI_API_KEY` | `https://api.openai.com/v1/models` |
| `PUSHOVER_APP_TOKEN` | `https://api.pushover.net/1/users/validate.json` (precisa `PUSHOVER_USER_KEY`) |
| `SUPABASE_SERVICE_KEY` | `https://bfzuxxuscyplfoimvomh.supabase.co/rest/v1/?limit=1` |
| `EVO_GLOBAL_KEY` | `https://evo.inkflowbrasil.com/instance/fetchInstances` |

### Layer 1 data source

`CLOUDFLARE_API_TOKEN_EXPIRES_AT` (ISO 8601 UTC) é uma env var setada manualmente quando o founder rotaciona o token. Sem env → Layer 1 skip silencioso. Próxima rotação: incluir update dessa env no checklist de `secrets-expired.md`.

### Dedupe (collapse single-state)

Auditor produz múltiplos eventos potenciais por run (até 8 do Layer 2 + 1 Layer 1 + 1 Layer 3 = 10). View `audit_current_state` agrupa por auditor (1 estado aberto). Pipeline collapsa eventos: emite só o de **severity mais alta** com `payload.affected_secrets` listando todos os falhantes. Trade-off pós-MVP: granularidade fina por (auditor, secret_name) requer migration.

### Runbook trigger

Quando alerta `[critical] [key-expiry]` chegar no Telegram, seguir [secrets-expired.md](runbooks/secrets-expired.md) — Ação A (rotação tradicional) ou Ação B (Roll permissions ruins). `payload.secret_name` indica qual secret específico precisa rotação.

### Limitações conhecidas

- **Layer 1 só cobre `CLOUDFLARE_API_TOKEN`** — outros secrets (Stripe, Slack, OpenAI, etc.) não têm TTL formal expostos. Fica por self-check (Layer 2 = 401 quando expirar).
- **Layer 3 é opt-in** — desabilitado por default (alto risco false-positive). Ligar via `AUDIT_KEY_EXPIRY_LAYER3=true` em CF Pages env após Camadas 1+2 estabilizadas (≥7d sem falsa-positiva).
- **Telegram bot self-check (Layer 2) usa o mesmo bot que envia alertas** — se TELEGRAM_BOT_TOKEN está inválido, o próprio alerta de critical não chega. Aceitável MVP — `monitor-whatsapp` cron + GHA notifications cobrem fallback.
- **Endpoint integration tests não exercitam Layer 2/3** — testes do endpoint focam em wiring (auth, dedupe, side effects). Layer 2/3 cobertos por unit tests isolados (`auditor-key-expiry.test.mjs`) + smoke E2E em prod.

---

## deploy-health

**Status:** ✅ Em produção (2026-04-29)
**Onde:** `inkflow-cron` Worker
**Frequência:** A cada 6h (cron `0 */6 * * *`)
**Endpoint:** `functions/api/cron/audit-deploy-health.js`
**Lib `detect()`:** `functions/_lib/auditors/deploy-health.js`
**Tests:** `tests/auditor-deploy-health.test.mjs` + `tests/audit-deploy-health-endpoint.test.mjs`
**Runbook:** [rollback.md](runbooks/rollback.md)
**Suggested subagent:** `deploy-engineer`

### Detecção em 3 sintomas

| Symptom | Source | Severity rules |
|---|---|---|
| A (gha-failures) | GitHub Actions API — `Deploy to Cloudflare Pages` workflow | 0 fail clean / 1 warn / 2+ consecutivos critical (janela `AUDIT_DEPLOY_HEALTH_WINDOW_HOURS`, default 6h) |
| B (pages-failures) | CF Pages API — `deployments?per_page=20` `latest_stage.status='failure'` | 0 fail clean / 1 warn / 2+ consecutivos critical (mesma janela) |
| C (wrangler-drift) | CF Workers API `modified_on` vs GitHub `commits?path=cron-worker` | opt-in via `AUDIT_DEPLOY_HEALTH_WRANGLER_DRIFT='true'`. lag > 1h → warn |

### Env vars necessárias

- **`GITHUB_API_TOKEN`** (fine-grained PAT, repo `brazilianhustle/inkflow-saas`, Actions:Read + Contents:Read) — sem ele Sintomas A + C ficam skip silencioso.
- **`CLOUDFLARE_API_TOKEN`** (já em prod) — Sintomas B + C.
- **`CLOUDFLARE_ACCOUNT_ID`** (já em prod) — Sintomas B + C.
- **`AUDIT_DEPLOY_HEALTH_WINDOW_HOURS`** (opcional, default 6) — janela de detecção pra Sintomas A + B.
- **`AUDIT_DEPLOY_HEALTH_WRANGLER_DRIFT`** (opcional, default off) — opt-in pra Sintoma C.
- **`CF_PAGES_PROJECT_NAME`** (opcional, default `inkflow-saas`).
- **`CF_WORKER_SCRIPT_NAME`** (opcional, default `inkflow-cron`).
- **`GITHUB_REPO_FULL_NAME`** (opcional, default `brazilianhustle/inkflow-saas`).

### Dedupe

Single-state per auditor (collapse). Múltiplos sintomas no mesmo run colapsam em 1 evento top-severity. `payload.affected_symptoms` lista todos. Trade-off pós-MVP: granularidade fina por sintoma requer migration.

### Runbook trigger

Quando alerta `[critical] [deploy-health]` chegar no Telegram, seguir [rollback.md](runbooks/rollback.md) — diagnóstico (1 min) → rollback (CF Pages + Worker) → fix git depois.

---

## billing-flow

**Status:** ✅ Em produção (2026-04-29)
**Onde:** `inkflow-cron` Worker
**Frequência:** A cada 6h (cron `30 */6 * * *`, offset 30min do deploy-health)
**Endpoint:** `functions/api/cron/audit-billing-flow.js`
**Lib `detect()`:** `functions/_lib/auditors/billing-flow.js`
**Tests:** `tests/auditor-billing-flow.test.mjs` + `tests/audit-billing-flow-endpoint.test.mjs`
**Runbook:** [mp-webhook-down.md](runbooks/mp-webhook-down.md)
**Suggested subagent:** _none_ (MP é manual no MVP — runbook é a doutrina)

### Detecção em 4 sintomas

| Symptom | Source | Severity rules |
|---|---|---|
| A (webhook-delay) | `payment_logs.created_at` (latest, tenant_id NOT NULL) | warn quando >`AUDIT_BILLING_FLOW_WEBHOOK_DELAY_HOURS` (default 6h) E ≥1 active sub. Clean caso contrário. |
| B (webhook-silent) | mesmo + Mercado Pago `preapproval/{id}` API | critical quando >`AUDIT_BILLING_FLOW_WEBHOOK_SILENT_HOURS` (default 24h) E ≥1 sub `status='authorized'` em amostra de 5. Demote pra warn se 0 confirmadas. |
| C (mailerlite-drift) | Supabase tenants + MailerLite `/subscribers/{email}` | warn quando ≥1 tenant ativo (sample 5) não está no group `MAILERLITE_GROUP_CLIENTES_ATIVOS`. Network errors → silent skip. |
| D (db-consistency) | Supabase `tenants WHERE status_pagamento='trial_expirado' AND ativo=true` | critical quando count > 0 (invariante violada — bug em `expira-trial` cron ou race). |

### Spec deviations vs §5.5

1. **Source pra "último webhook":** `payment_logs.created_at` (não `tenants.mp_webhook_received_at` que não existe no schema). Filtra `tenant_id IS NOT NULL` pra ignorar signup attempts.
2. **MP API check (Sintoma B):** amostragem LIMIT 5 (top 5 tenants ativos por `created_at` asc). Se 0 confirmadas → demote critical → warn.
3. **MailerLite drift (Sintoma C):** mesma amostragem LIMIT 5, com `payload.missing_emails` capped em 5.

### Env vars necessárias

- **`SUPABASE_SERVICE_KEY`** ✅ (já em prod) — base de todos os 4 sintomas.
- **`MP_ACCESS_TOKEN`** ✅ (já em prod) — Sintoma B (sem ele Sintoma B fica skip silencioso).
- **`MAILERLITE_API_KEY`** ✅ (já em prod) — Sintoma C (sem ele Sintoma C fica skip silencioso).
- **`MAILERLITE_GROUP_CLIENTES_ATIVOS`** (default `184387920768009398`) — Sintoma C target group.
- **`AUDIT_BILLING_FLOW_WEBHOOK_DELAY_HOURS`** (opcional, default 6) — Sintoma A threshold.
- **`AUDIT_BILLING_FLOW_WEBHOOK_SILENT_HOURS`** (opcional, default 24) — Sintoma B threshold.

### Dedupe

Single-state per auditor (collapse). Múltiplos sintomas no mesmo run colapsam em 1 evento top-severity. `payload.affected_symptoms` lista todos. Mesmo trade-off do deploy-health.

### Runbook trigger

Quando alerta `[critical] [billing-flow]` chegar no Telegram, seguir [mp-webhook-down.md](runbooks/mp-webhook-down.md) — 4 ações (A: webhook config, B: endpoint health, C: signature validation, D: parsing/lógica). Sintoma D (`db-consistency`) requer query SQL adicional pra encontrar root cause em `expira-trial` cron.

---

## vps-limits

**Status:** ✅ Em prod desde 2026-04-30 (pivot Routine→cron-worker — CCR allowlist bloqueio)
**Endpoint:** `functions/api/cron/audit-vps-limits.js`
**Lib detect():** `functions/_lib/auditors/vps-limits.js`
**Tests:** `tests/auditor-vps-limits.test.mjs` (22 unit) + `tests/audit-vps-limits-endpoint.test.mjs` (11 integration)
**Onde:** `inkflow-cron` Worker (cron-worker dispatcher — pivotado de Routine devido a CCR `Host not in allowlist` bloqueando outbound HTTPS pra `inkflowbrasil.com`)
**Frequência:** `15 */6 * * *` UTC (00:15/06:15/12:15/18:15 — offset 15min do deploy-health, 15min antes do billing-flow)
**suggested_subagent:** `vps-ops` (agent ainda não existe — Sub-projeto 2 pendente; valor é hint pra futuro)
**Runbook:** `null` (gap consciente — adjacente a `outage-wa.md`. Founder cai no Telegram alert sem runbook dedicado por escolha consciente do MVP, alinhada com `runbooks/README.md` regra "criar runbook na 2ª ocorrência ad-hoc").
**Spec source:** `docs/superpowers/specs/2026-04-27-auditores-mvp-design.md` §5.3 + §9.4.

### Detecção em 4 sintomas

| Sintoma | Resource | Severity |
|---|---|---|
| **A — RAM** | `ram_used_pct` | warn ≥75% / critical ≥90% |
| **B — Disk** | `disk_used_pct` | warn ≥75% / critical ≥90% |
| **C — Load avg 5m** | `load_avg_5m` (relativo a `vcpu_count`) | warn ≥1.0×N / critical ≥1.5×N |
| **D — Egress mensal** | `egress_month_gb / quota` | warn ≥70% / critical ≥90% — **opt-in** |

### Spec deviations vs §5.3

1. **Hosting endpoint VPS:** container `inkflow-health-1` (nginx:alpine) adicionado ao stack `/opt/inkflow/docker-compose.yml`, exposto via Traefik labels `Host(${N8N_DOMAIN}) && PathPrefix(/_health)` priority 100 (espelha pattern `evoadmin`). Bash collector host + cron 1min escreve `/var/www/health/metrics.json`. Decisão em `docs/canonical/decisions/2026-04-29-vps-limits-data-source.md`.
2. **Sintoma D opt-in:** ativa só se `AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB` env setada. Valor recomendado: 5290 GB (pool atual Vultr). Razão: bash collector não emite `egress_month_gb` ainda — gap pós-MVP pra integrar Vultr API.
3. **Pivotado de Routine pra cron-worker:** Spec §5.3 cravou Routine Anthropic, mas CCR sandbox bloqueia outbound HTTPS pra hosts não-allowlisted (`Host not in allowlist` 403 ao testar com `inkflowbrasil.com` em 2026-04-30). Como o auditor é puramente determinístico (thresholds numéricos sobre metrics, sem reasoning Claude — alinhado com decisão original de "pure-trigger"), **pivot pra cron-worker é zero-loss em capability**. Backlog cravado: "Promover vps-limits cron-worker → Routine quando Anthropic permitir adicionar custom hosts à allowlist OU quando MCP connector funcionar como HTTP proxy". Auditores `rls-drift` (#4) que de fato precisam reasoning Claude continuam Routine — usam MCP Supabase já allowlisted.
4. **Backups Vultr não cobertos:** sem API consistente. Check manual periódico no Vultr panel — gap pós-MVP. Backups configurados Weekly Monday 07:00 UTC (Vultr default — validado painel 2026-04-29).
5. **CPU thresholds escalam com vcpu_count:** detect lê `vcpu_count` do JSON metrics (não hardcoded), thresholds escalam se VPS for redimensionado.

### Env vars necessárias

- `VPS_HEALTH_URL` — `https://n8n.inkflowbrasil.com/_health/metrics` (CF Pages env)
- `VPS_HEALTH_TOKEN` — 64-char hex (CF Pages env + `/opt/inkflow/.env` no VPS — manter sincronizados)
- `CRON_SECRET` — Bearer pro endpoint (já em prod)
- `SUPABASE_SERVICE_KEY` — INSERT em audit_events (já em prod)
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` — alerts (já em prod)
- `AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB` — **opcional**, ativa Sintoma D (recomendado: 5290)

### Dedupe

Comportamento padrão de `audit-state.dedupePolicy` (§6.2):
- Mesma severity, < 24h desde último alert → silent (UPDATE last_seen)
- Mesma severity, ≥ 24h → fire lembrete
- warn → critical → supersede + Telegram
- critical → warn → silent (não rebaixa)
- next_run_clean → resolve + Telegram `[resolved]`

### Runbook trigger

Não tem runbook dedicado. Quando alert chega, founder usa hint `suggested_subagent='vps-ops'` (futuro Sub-projeto 2) ou investiga manualmente via SSH ao VPS:
```bash
ssh root@104.207.145.47 'free -m && df -h / && uptime && ps aux --sort=-%mem | head'
```

### Não cobertos no MVP

- **Backups Vultr** — sem API; check manual no Vultr panel (gap pós-MVP). Schedule: Weekly Monday 07:00 UTC.
- **Egress live (sub-mensal)** — bash collector não coleta egress instantâneo. Cobertura mensal só (e ainda opt-in pendente integração Vultr API).

### Próximos passos pós-MVP

1. Salvar `VPS_HEALTH_TOKEN` em BWS (followup §"P3 Salvar secrets" no backlog).
2. Avaliar híbrido endpoint+Vultr API quando primeiro tenant pagante entrar (necessário pra ativar Sintoma D efetivo).
3. Investigar causa-raiz do bug `container_name` + Traefik (deletado durante setup pra fazer routing funcionar — ver decision doc).

---

## rls-drift

**Status:** ✅ Em prod desde 2026-04-30 (Sub-projeto 3 5/5 DONE)
**Endpoint:** `functions/api/cron/audit-rls-drift.js`
**Lib detect():** `functions/_lib/auditors/rls-drift.js`
**Tests:** `tests/auditor-rls-drift.test.mjs` (15 unit) + `tests/audit-rls-drift-endpoint.test.mjs` (8 endpoint)
**Onde:** Routine Anthropic (`/schedule`) primary; cron-worker pivot pré-configurado mas comentado em `wrangler.toml`
**Frequência:** `0 7 * * *` UTC (04:00 BRT diário)
**suggested_subagent:** `supabase-dba` (agent ainda não existe — Sub-projeto 2 pendente; valor é hint pra futuro)
**Runbook:** `null` (gap consciente — adjacente a `db-indisponivel.md`. Founder cai no Telegram alert sem runbook dedicado)
**Spec source:** `docs/superpowers/specs/2026-04-27-auditores-mvp-design.md` §5.4 + §9.5

### Detecção em 2 sintomas

| Sintoma | Source | Severity |
|---|---|---|
| **Tabela em public sem RLS** (não allowlisted) | SQL `pg_class` introspection | warn |
| **Tabela em public sem RLS** (allowlisted) | SQL `pg_class` introspection | silent skip |
| **Function em public sem search_path** | SQL `pg_proc` introspection | critical (allowlist NÃO aplica) |

### Spec deviations vs §5.4

1. **Arquitetura híbrida resiliente.** Spec original cravou Routine pura. Aprendizado #3 vps-limits (CCR allowlist 403) força mitigação: lib detect + endpoint CF Pages funcional ALÉM de Routine. Decision doc com pivot path explícito em `decisions/2026-04-30-rls-drift-architecture.md`.
2. **🚨 Source: SQL queries diretas via `/database/query` (não advisor REST).** Spec §5.4 cravou `/v1/.../advisors?lint_type=...` mas esse endpoint **não existe** (404 confirmado 2026-04-30). Database Linter Supabase é client-side no dashboard. Pivotamos pra 2 SQL queries via `pg_class`/`pg_proc` introspection.
3. **Reasoning Claude vive APENAS na Routine.** Endpoint fallback é determinístico (sem reasoning). Trade-off: alertas Telegram perdem narrativas contextuais se pivot ativar — mas detection continua funcional.
4. **Cobertura MVP: 2 sintomas (RLS + search_path).** Outros lints do dashboard (performance, policies WITH CHECK true) ficam backlog P3 fase 2.
5. **Allowlist expandida** com `signups_log` (6 tables): `audit_events`, `audit_runs`, `audit_reports`, `approvals`, `tool_calls_log`, `signups_log`.

### Env vars necessárias

- `SUPABASE_PAT` — Personal Access Token Supabase (CF Pages env + BWS id `46a0d806-...`)
- `RLS_INTENTIONAL_NO_PUBLIC` — CSV `audit_events,audit_runs,audit_reports,approvals,tool_calls_log,signups_log` (CF Pages env)
- `CRON_SECRET` — Bearer pro endpoint (já em prod)
- `SUPABASE_SERVICE_KEY` — INSERT em audit_events (já em prod)
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` — alerts (já em prod)

(`SUPABASE_PROJECT_REF=bfzuxxuscyplfoimvomh` fica hardcoded no source.)

### Dedupe

Comportamento padrão de `audit-state.dedupePolicy` (§6.2) — mesmo dos outros auditores.

### Pivot path (se Routine quebrar)

Detalhes em `docs/canonical/decisions/2026-04-30-rls-drift-architecture.md`. Resumo: descomentar 1 linha em `cron-worker/wrangler.toml` + redeploy = ~30min.

### Runbook trigger

Sem runbook dedicado. Quando alert chega:
1. Olhar narrativa do payload (Routine geralmente cita PR/commit relacionado)
2. Investigar manualmente: `SELECT * FROM pg_class WHERE relname = '<X>'` ou `SELECT proconfig FROM pg_proc WHERE proname = '<Y>'`
3. Decidir: corrigir via migration nova OU adicionar à `RLS_INTENTIONAL_NO_PUBLIC`

### Não cobertos no MVP (backlog P3 fase 2)

- **Policies `WITH CHECK (true)` em endpoint anon** — detect via SQL adicional
- **RLS-on-com-policies-zero** (silent fail comum em dev)
- **Performance lints** — índices missing, queries lentas
- **Auto-allowlist via PR detection** — Routine reasoning marca tabela como intentional

## Pipeline core (compartilhado)

- **Lib:** `functions/_lib/audit-state.js` — `startRun`, `endRun`, `getCurrentState`, `insertEvent`, `dedupePolicy`, `sendTelegram`, `sendPushover`
- **Schema:** `audit_events` + `audit_runs` + `audit_reports` tables, view `audit_current_state` (RLS admin-read only)
- **Endpoints:** `/api/audit/telegram-webhook` (ack flow), `/api/cron/audit-escalate` (Pushover priority=2), `/api/cron/audit-cleanup` (DELETE old)
- **Triggers cron:** `*/5 * * * *` escalation, `0 4 * * 1` cleanup, `0 6 * * *` key-expiry

Implementado via PR #10 (commit `0de4e03`). Spec §6, §9.0.
