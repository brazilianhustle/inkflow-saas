---
last_reviewed: 2026-04-27
status: decided
related: [docs/superpowers/specs/2026-04-27-auditores-mvp-design.md, docs/canonical/runbooks/telegram-bot-down.md]
---

# Telegram bot strategy — Sub-projeto 3 (Auditores)

**Decisão:** o webhook de ack de auditoria (`/api/audit/telegram-webhook`) será conectado ao bot existente `ink_flow_alerts`. Nenhum bot novo será criado.

**Contexto (2026-04-27):**
- Existem dois bots na conta Telegram do founder: `claaudio code` (experimentos pessoais com Claude Code) e `ink_flow_alerts` (bot de alertas operacionais do projeto).
- `getWebhookInfo` em ambos retornou `result.url == ""` — nenhum tem webhook ativo, então conectar `ink_flow_alerts` ao novo endpoint é não-destrutivo.
- `ink_flow_alerts` já está configurado em produção: as env vars `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` em CF Pages e nos secrets do cron-worker já apontam pra ele. O founder já monitora esse chat pros alertas de outage do `monitor-whatsapp`, runs do `expira-trial`, etc.

**Por que não criar um bot dedicado pra auditoria:**
- Um bot dedicado duplicaria o item Bitwarden, as env vars e o chat que o founder acompanha. Três fontes de custo de context-switching sem ganho operacional.
- Alertas de auditoria são operacionais por natureza — pertencem ao mesmo canal que o stream operacional existente.

**Por que não usar `claaudio code`:**
- Misturar tráfego de auditoria do projeto num bot pessoal de experimentação polui as duas superfícies.

**Nota operacional:**
- `TELEGRAM_ADMIN_USER_ID` (Telegram user ID do founder, usado como whitelist no handler do webhook) está armazenado no item Bitwarden `inkflow-telegram-admin` e será configurado como env var em CF Pages. Por design, NÃO é registrado neste repo.
- `setWebhook` será configurado durante a Task 11 do plano de infra, fora do escopo deste decision doc.
