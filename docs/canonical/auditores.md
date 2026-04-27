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

## (Próximos auditores)

`deploy-health`, `billing-flow`, `vps-limits`, `rls-drift` — pendentes. Ver spec §5 e plano-mestre Fábrica `2026-04-25-fabrica-inkflow-design.md` §3.

## Pipeline core (compartilhado)

- **Lib:** `functions/_lib/audit-state.js` — `startRun`, `endRun`, `getCurrentState`, `insertEvent`, `dedupePolicy`, `sendTelegram`, `sendPushover`
- **Schema:** `audit_events` + `audit_runs` + `audit_reports` tables, view `audit_current_state` (RLS admin-read only)
- **Endpoints:** `/api/audit/telegram-webhook` (ack flow), `/api/cron/audit-escalate` (Pushover priority=2), `/api/cron/audit-cleanup` (DELETE old)
- **Triggers cron:** `*/5 * * * *` escalation, `0 4 * * 1` cleanup, `0 6 * * *` key-expiry

Implementado via PR #10 (commit `0de4e03`). Spec §6, §9.0.
