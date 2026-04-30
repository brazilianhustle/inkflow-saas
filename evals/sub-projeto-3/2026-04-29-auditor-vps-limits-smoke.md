---
date: 2026-04-29
auditor: vps-limits
status: PARTIAL
pr: 14
merge_sha: 8095fc7
---

# Smoke E2E — Auditor #3 vps-limits (primeira Routine Anthropic)

## Status: PARTIAL (sanity passed, full E2E aguardando Routine ativada por founder)

## O que rodou

- ✅ **Sanity endpoint prod:** `POST https://inkflowbrasil.com/api/cron/audit-vps-limits` retorna HTTP 401 sem auth + HTTP 405 em GET. Endpoint deployed em CF Pages e validando CRON_SECRET corretamente.
- ✅ **Endpoint VPS live:** `https://n8n.inkflowbrasil.com/_health/metrics` retorna JSON válido com 8 campos (RAM/disk/load/vcpu) quando autenticado via header `X-Health-Token`. Validado com 5 smokes (positive + 2 negative + 2 sanity vizinhos):
  - Auth válido → 200 + JSON
  - Sem header → 401 + `{"error":"unauthorized"}`
  - Header errado → 401 + `{"error":"unauthorized"}`
  - `https://n8n.inkflowbrasil.com/` → 200 (n8n principal continua respondendo, router health não sequestra)
  - `https://evo.inkflowbrasil.com/` → 200 (evo-admin continua funcionando)
- ✅ **Container `inkflow-health-1` rodando:** nginx:alpine via Docker Compose, exposto pelo Traefik com labels `Host(${N8N_DOMAIN}) && PathPrefix(/_health)` priority 100. Volume `/var/www/health/` montado read-only.
- ✅ **Bash collector ativo:** cron `* * * * *` no host VPS executando `/usr/local/bin/inkflow-health-metrics.sh`, escrevendo JSON em `/var/www/health/metrics.json` a cada 1min. Validado output: ram 23%, disk 22%, load 0.09, vcpu 4 — todos abaixo de qualquer threshold.
- ✅ **Bug Traefik resolvido:** removendo `container_name: inkflow-health` do compose (Docker Compose auto-nomeia `inkflow-health-1`) restaura detecção de labels Traefik. Documentado em decision doc + plan lessons learned. Causa-raiz não-confirmada (suspeita: cache Docker provider).
- ✅ **22 unit tests** cobrindo 4 sintomas (clean/warn/critical/missing) + boundary conditions (0.75/0.90 RAM/Disk + 1.0×N/1.5×N CPU + opt-in env Egress).
- ✅ **11 endpoint tests** cobrindo todos os paths via dedupe (auth/method/3× missing-config/fetch-fail/clean/critical-fire/supersede/resolve).
- ✅ **CF Pages env vars cadastrados:** `VPS_HEALTH_URL` + `VPS_HEALTH_TOKEN` em production. Token gerado via `openssl rand -hex 32`, sincronizado VPS `.env` ↔ CF Pages env, depois limpo de `/tmp` local.

## O que ficou pendente

- ⏳ **Smoke E2E full** (4 cenários: no-event / forced critical via fixture / resolve flow / Routine trigger manual) — bloqueio: CRON_SECRET fora do BWS local (mesmo gap operacional do #2 e #5). Smoke autenticado requer Bearer.
- ⏳ **Routine Anthropic** — pendente ativação manual via skill `/schedule` pelo founder. Cron `15 */6 * * *` UTC. Sem Routine ativa, endpoint não é exercitado em prod.
- ⏳ **48h em prod sem falsa-positiva** é o gate real do DoD por auditor — só começa após Routine ativada.
- ⏳ **Sintoma D (Egress) opt-in** — pendente cadastro de `AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB=5290` em CF Pages env. Bash collector ainda não emite `egress_month_gb` (gap pós-MVP). Sintoma D fica skip silencioso até integração Vultr API ser feita.

## Próximas ações (ordem recomendada)

1. **Founder ativa Routine** via `/schedule` skill (Task 12 do plano):
   - Cron: `15 */6 * * *` (UTC — 00:15/06:15/12:15/18:15)
   - Prompt: pure-trigger, faz `curl -sS -X POST https://inkflowbrasil.com/api/cron/audit-vps-limits -H "Authorization: Bearer ${CRON_SECRET}"` e reporta status
   - Name: `inkflow-vps-limits-auditor`
2. **Smoke #1 (trigger manual):** `/schedule run inkflow-vps-limits-auditor` — esperar HTTP 200 + body `{ ok: true, run_id, events_count: 0, actions: { ... no_op: 1 } }`. VPS está clean atualmente.
3. **Smoke #2 (forced critical via fixture):** sobrescrever `/var/www/health/metrics.json` com `disk_used_pct: 0.92` por 75s, suspender cron, trigger Routine, validar Telegram alert `[critical] [vps-limits] Disco em 92%`, restaurar. Detalhes no plan Task 12 step 7.
4. **48h baseline:** monitorar `audit_runs` por 48h após Routine ativada — esperado 8 execuções (4x dia × 2 dias), todas `status='success'`. Query:
   ```sql
   SELECT auditor, status, events_emitted, started_at, completed_at, error_message
   FROM audit_runs WHERE auditor='vps-limits'
   ORDER BY started_at DESC LIMIT 12;
   ```

## Validação passiva (gate de DoD)

Após Routine ativada, gate de 48h sem falsa-positiva. Se primeira execução falhar com erro inesperado, abrir issue. Se 48h passar zero false-positive → marcar vps-limits DoD como ✅ no spec §10.

## Métricas da implementação

- **PR:** [#14](https://github.com/brazilianhustle/inkflow-saas/pull/14) merge commit `8095fc7`
- **Commits granulares preservados:** 11 (plan/limits → decision doc → skeleton → 4 sintomas → endpoint → fix endRun → docs canonical + 2 commits pós-merge: tests adicionais + wire-up incident-response)
- **Tests:** 167 (134 baseline + 22 unit vps-limits + 11 endpoint vps-limits)
- **Files added:** 5 (lib + endpoint + 2 test files + plan + decision doc)
- **Files modified:** 5 (auditores.md + agents/README.md + incident-response.md + outage-wa.md + limits.md)
- **Spec deviations cravadas:** 5 (Traefik+container vs nginx host; Sintoma D opt-in com valor recomendado; Routine pure-trigger; backups gap; CPU thresholds escalam vcpu)
- **Novos secrets:** 2 (VPS_HEALTH_URL + VPS_HEALTH_TOKEN — gerados + cadastrados em CF Pages env + VPS `.env`)
- **Mudança VPS:** 1 container novo (`inkflow-health-1` nginx:alpine), 1 cron entry no host, 1 backup do compose
- **Tempo total:** ~3.5h (subagent-driven, two-stage review per task, qualidade > pressa) — Task 2 levou 1h por causa do bug Traefik

## Lições aprendidas

1. **`container_name` explícito no Docker Compose quebra detecção Traefik** — descoberto durante setup, custou ~30min de debug. Fix simples (remover) mas causa-raiz desconhecida. Documentado em decision doc + adicionado como TODO pós-MVP de investigação.
2. **CF Pages não tem preview deploy de feature branches** — só prod deploy quando merge. Smoke do preview (Task 10 do plano) ficou N/A. Plan precisa atualizar pra refletir isso em features futuras.
3. **Heredoc via SSH é frágil** — primeira tentativa de criar bash collector via SSH heredoc corrompeu aspas escape. Caminho confiável: criar local com Write + scp. Lesson aplicada em decision doc.
4. **Final code reviewer pegou 2 issues** que sobreviveram ao 2-stage review per-task: (a) tests supersede/resolve faltando; (b) auditores.md metadata fields faltando. Pattern dos PRs anteriores: final review é a camada que enxerga consistência cross-task.
