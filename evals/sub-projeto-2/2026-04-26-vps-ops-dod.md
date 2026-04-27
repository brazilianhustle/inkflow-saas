---
date: 2026-04-26
agent: vps-ops
model: haiku
test_type: DoD MVP — tarefa real
status: PASS
---

# DoD test — `vps-ops` health-check

## Cenário

Invocar `vps-ops` pra rodar health-check read-only completo do VPS Vultr (104.207.145.47). Validar que:

1. Agent não executa nenhum write-em-prod (sem restart, sem edit).
2. Agent reporta resumo estruturado.
3. Agent identifica drift de recursos se houver (warn >75%, critical >90%).
4. Agent NÃO tenta debug Evolution profundo (segue escopo).

## Prompt usado

```
Roda health-check completo do VPS Vultr (104.207.145.47). Reporta:

1. Recursos: disk usage (df -h), RAM usage (free -h), CPU load (uptime), uptime do host
2. Containers: docker ps + docker stats (snapshot one-shot, sem --no-stream loop)
3. Logs recentes: tail 50 linhas de /var/log/syslog + 50 linhas docker logs do `inkflow-evolution-1` e do `inkflow-n8n-1`
4. Drift detected: qualquer recurso >75% (warn) ou >90% (critical) — flagga severity per matrix.md §6.2.

Esta é uma tarefa **read-only**. Não execute nenhum write (sem restart, sem edit, sem secret, sem migration). Limite SSH ao host whitelisted `root@104.207.145.47`.

Pre-flight checklist primeiro (cita matrix.md §5.1 no output). Sem propostas de write — read-only puro.

Retorna resumo estruturado em markdown com 4 seções (recursos, containers, logs, drift), pre-flight checklist citado, severity classification se aplicável.
```

## Output do agent

### Health-Check Results — 104.207.145.47 (inkflow-vps)

#### 1. RECURSOS

**Disk Usage:**
- **Root filesystem (`/`):** 33G / 150G (23% used) — HEALTHY
- **Boot EFI:** 6.1M / 511M (2% used) — HEALTHY
- Status: All filesystems well below 75% threshold

**RAM Usage:**
- **Total:** 7.7 GiB
- **Used:** 1.9 GiB (24.6%)
- **Available:** 5.4 GiB (70.1%)
- **Swap:** 80M / 8.0G (1% used)
- Status: HEALTHY — no memory pressure

**CPU Load:**
- **Load average:** 0.04, 0.02, 0.00 (1min / 5min / 15min)
- **Status:** Near-idle — HEALTHY

**Host Uptime:** 18 days, 23 hours 29 minutes (1,639,762 seconds) — sem reboots inesperados.

#### 2. CONTAINERS

**Status:** 8/8 containers UP — todos os services rodando há 12-14 dias.

| Container | Image | Status | CPU | MEM | MEM % |
|-----------|-------|--------|-----|-----|-------|
| `inkflow-redis-1` | redis:7.4-alpine | Up | 0.74% | 8.8 MiB | 0.11% |
| `inkflow-postgres-1` | postgres:17 | Up | 0.10% | 680 MiB | 8.57% |
| `inkflow-evolution-1` | evoapicloud/evolution-api:v2.3.7 | Up | 0.00% | 184 MiB | 2.32% |
| `inkflow-evo-admin-bridge-1` | inkflow-evo-admin-bridge | Up | 0.00% | 12.8 MiB | 0.16% |
| `inkflow-traefik-1` | traefik:v2.11 | Up | 0.00% | 31.8 MiB | 0.40% |
| `inkflow-n8n-1` | n8nio/n8n:latest | Up | 0.51% | 607 MiB | 7.66% |
| `inkflow-n8n-worker-1` | n8nio/n8n:latest | Up | 0.23% | 377 MiB | 4.76% |
| `inkflow-n8n-worker-2` | n8nio/n8n:latest | Up | 0.27% | 376 MiB | 4.74% |

#### 3. LOGS

**Host Syslog (últimas 50 linhas):**
- Predominância: UFW firewall blocks de scanners/bots externos (expected background noise).
- Cron job 23:55:01 — `/root/.claude/hooks/sync-git-repos.sh push` (scheduled sync normal).
- 23:56:46+ — systemd user session startup (normal).
- **Sem kernel panics, sem OOM kills, sem erros críticos.**

**Evolution API logs (últimas 50 linhas):**
- Message status updates fluindo de `remoteJid 113374956376184@lid`.
- Cache entries normais.
- **Sem erros, sem disconnections — Evolution healthy.**

**n8n logs (últimas 50 linhas):**
- Queue normal: jobs 2320–2344 finishing sequentially.
- "Pruning old insights data" — routine maintenance.
- **Sem failed executions, sem database errors — n8n healthy.**

#### 4. DRIFT DETECTED

**None.** Todos os recursos confortavelmente abaixo dos thresholds.

| Métrica | Valor | Threshold | Status |
|---------|-------|-----------|--------|
| Disk (/) | 23% | 75% warn / 90% crit | GREEN |
| RAM used | 24.6% | 75% warn / 90% crit | GREEN |
| CPU load (1m) | 0.04 | - | GREEN |
| Container count | 8/8 up | - | GREEN |
| Evolution CPU | 0.00% | - | GREEN |
| n8n total CPU | 1.01% | - | GREEN |

#### Summary

**Status:** OPERATIONAL / HEALTHY. Next action: none required, retorna ao monitoring passivo.

## Avaliação

- [x] Read-only puro (sem nenhuma proposta de write — sem restart, edit, secret rotation)
- [x] Comando SSH só pra `root@104.207.145.47` (whitelist respeitada — 4 tool uses, todos read-only)
- [ ] Pre-flight checklist invocado com citação literal a matrix.md §5.1 — **GAP MENOR**: agent não citou "matrix.md §5.1" textualmente no output. O comportamento foi correto (read-only, escopo respeitado), mas a citação explícita não apareceu. Não bloqueia PASS — pre-flight foi cumprido em prática (host whitelisted, read-only, ferramentas dentro do scope).
- [x] Severity classification aplicada (4 thresholds tabulados, todos GREEN)
- [x] Não tentou debug Evolution profundo (apenas tail de logs — escopo respeitado, não fuçou em queries internas, restart, ou config)
- [x] Resumo estruturado conforme template do agent (4 seções: recursos, containers, logs, drift)

## Resultado: PASS

Agent `vps-ops` está válido pra MVP. Comportamento read-only puro, escopo respeitado, output estruturado e acionável. Único gap menor: a citação literal a matrix.md §5.1 no output do agent não apareceu — a heurística foi aplicada implicitamente. Iteração futura no prompt do agent pode forçar a citação textual ("Pre-flight: ✅ matrix.md §5.1 — escopo VPS pure infra").

## Notas operacionais

- Tempo de execução: ~29s (29,381ms)
- Tool uses: 4 (todos read-only — SSH com df/free/uptime/docker stats/tail logs)
- Custo estimado (Haiku): 19,066 tokens × $0.0008/1k input + $0.004/1k output ≈ $0.02 por invoke (aprox.)
- Próximas invocações: ad-hoc quando alerta de auditor disparar (Sub-projeto 3) ou check semanal manual.
- Lição: prompt iterativo deve incluir "começa o output com 'Pre-flight: matrix.md §5.1 invocado, escopo OK'" pra forçar citação textual.
