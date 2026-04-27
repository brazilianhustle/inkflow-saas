---
last_reviewed: 2026-04-27
status: pending
related: [docs/superpowers/specs/2026-04-27-auditores-mvp-design.md]
---

# Routines Anthropic — capability smoke (TODO)

**Status:** pending validation. Required before starting Sub-projeto 3 §9.4 (auditor #3 vps-limits) and §9.5 (auditor #4 rls-drift).

**Why this is open:** Routines (`/schedule` skill) rodam em contexto remoto gerenciado pela Anthropic. A chave SSH local do founder e os tokens pessoais de API NÃO estão nesse contexto. Spec §9.0 explicitamente adia o smoke pra antes de §9.4.

**Default approach (per spec §5.3):** a Routine chama um endpoint HTTP custom `/health/metrics` na VPS (auth: header `X-Health-Token`). A Routine faz `fetch` + parse JSON + comparação de threshold — sem necessidade de SSH ou Vultr API pro MVP. Caminhos aspiracionais (Vultr API, SSH key forwarding) só são reabertos se Routines passar a expor essas capabilities no futuro.

**Smoke checklist (rodar antes da implementação de §9.4):**
- [ ] Confirmar que o contexto da Routine consegue fazer HTTPS outbound com headers customizados (`Authorization` / `X-Health-Token`)
- [ ] Confirmar que a Routine consegue armazenar um secret per-Routine (`VPS_HEALTH_TOKEN`) sem vazar pro histórico de prompt
- [ ] Se algum dos dois falhar, fallback: Routine chama `/api/cron/audit-vps-limits` em CF Pages, que mantém o secret em env var e proxia o trabalho
