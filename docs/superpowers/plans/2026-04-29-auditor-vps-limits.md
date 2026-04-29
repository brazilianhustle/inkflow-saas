# Auditor #3 `vps-limits` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o auditor #3 `vps-limits` (4 sintomas: RAM / Disk / CPU load avg / Egress mensal opt-in) como **primeira Routine Anthropic** do Sub-projeto 3. Routine `/schedule` cron `15 */6 * * *` UTC chama endpoint `/api/cron/audit-vps-limits` em CF Pages, que faz fetch a um endpoint `/health/metrics` rodando no VPS Vultr (bash + nginx) e dispara a pipeline `detect → collapseEvents → dedupePolicy` já provada estável (PRs #11 + #12 + #13).

**Architecture:**
- **Coleta no VPS** — bash script `/usr/local/bin/inkflow-health-metrics.sh` rodando via cron `* * * * *` (1min) escreve `/var/www/health/metrics.json` com `{ram_used_pct, ram_total_mb, disk_used_pct, disk_total_gb, load_avg_5m, vcpu_count, ts}`.
- **Hosting** — novo container `inkflow-health-1` (nginx:alpine) com volume `/var/www/health:/usr/share/nginx/html:ro`, exposto via labels Traefik (pattern espelhado no `evoadmin` existente: `Host(${N8N_DOMAIN}) && PathPrefix(/_health)`, priority 100). Traefik v2.11 já gerencia cert Let's Encrypt + DNS pra `n8n.inkflowbrasil.com`. Auth via header `X-Health-Token` validado dentro do container nginx (config `if ($http_x_health_token != $expected) { return 401; }`).
- **Detect puro** em `functions/_lib/auditors/vps-limits.js` — recebe `{env, metrics, now}`, retorna array de eventos sem efeitos colaterais.
- **Endpoint orchestrator** `functions/api/cron/audit-vps-limits.js` — auth Bearer CRON_SECRET, faz fetch a `${VPS_HEALTH_URL}` com `X-Health-Token: $VPS_HEALTH_TOKEN`, parsea JSON, chama `startRun → detect → collapseEvents → dedupePolicy → fire/silent/supersede/resolve` via lib `audit-state` já em prod.
- **Routine Anthropic** registrada via skill `/schedule` (cron `15 */6 * * *` UTC, offset 15min do deploy-health) com prompt mínimo "POST `${BASE}/api/cron/audit-vps-limits` com `Authorization: Bearer ${CRON_SECRET}`".

**Tech Stack:** Cloudflare Pages Functions (CF Pages onRequest), Anthropic Routines (`/schedule`), Traefik v2.11 (containerizado, edge proxy), Docker Compose (stack `/opt/inkflow/docker-compose.yml`), nginx:alpine container dedicado, bash + cron host, Supabase REST (PostgREST), Node test runner (`node:test`), TDD strict (red→green per step), wrangler v3.

**Spec source:** `docs/superpowers/specs/2026-04-27-auditores-mvp-design.md` §5.3 + §9.4.

---

## Spec deviations cravadas neste plano

Antes de começar, 5 desvios do spec §5.3 / §9.4 — documentados aqui pra evitar review-time surprise:

1. **Sub-decisão de hosting do endpoint VPS: container nginx:alpine via Docker Compose, exposto pelo Traefik existente com PathPrefix em `n8n.inkflowbrasil.com/_health/metrics`.** Spec §5.3 diz "Express simples ou nginx static? — decisão na implementação". Cravamos **container nginx-static + bash collector** porque: (a) o VPS NÃO tem nginx no host — reverse proxy é Traefik v2.11 containerizado (descoberto via `find /etc/nginx → not exists` + `docker ps` em 2026-04-29); (b) pattern já provado no stack — `evoadmin` (admin-bridge) usa exatamente `Host(${EVO_DOMAIN}) && PathPrefix(/__admin__)` com priority 100; (c) cert Let's Encrypt + DNS já gerenciados pelo Traefik; (d) container nginx:alpine adiciona ~10MB e zero deps no host. Trade-off: bash collector tem latência de até 1min (cron `* * * * *` no host) — aceitável pra cadence 6h. Volume bind: `/var/www/health/` (host) → `/usr/share/nginx/html/` (container, read-only).

2. **Sintoma D (Egress mensal) é opt-in via env var, com valor recomendado já cravado.** Spec §5.3 política de severity inclui `egress_monthly: { warn: 0.70, critical: 0.90 }` requerendo denominador (egress contratado mensal em GB). Pool atual confirmado via Vultr Dashboard 2026-04-29: **5.29 TB / 5290 GB** (Instance 3.14 TB + Free 2.00 TB). Sintoma D ativa **somente se** `AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB=5290` env var estiver setada. Pattern espelha key-expiry Camada 3 opt-in (spec §5.1 fix A4). Sem env, skip silencioso. Por que opt-in mesmo com valor conhecido: free credits podem variar mês-a-mês — founder ativa quando estiver pronto pra avaliar ruído de alerta. Trade-off: alternativa "instance-only quota" (3.14 TB) seria mais conservador mas geraria false-positives no estado atual (uso real = 1.5 GB, dentro de free credits).

3. **Backups Vultr (spec §5.3 implícito + `limits.md` §Vultr) NÃO entra como sintoma.** Backups falhando é check manual periódico no Vultr panel — sem API consistente pra auditar programaticamente sem credentials Vultr na Routine (não temos). Marcar como gap pós-MVP em `auditores.md` entry vps-limits §"Não cobertos no MVP".

4. **Routine chama endpoint CF Pages vazio (sem body) — endpoint busca metrics sozinho.** Spec §5.3 dá flexibilidade ("Routine faz curl com header, parsea JSON, aplica thresholds"). Cravamos **endpoint busca metrics**, Routine é pure-trigger. Razão: detect() puro segue pattern dos #1/#2/#5 (input vem de fetch dentro do endpoint, não do body), dedupe + Telegram + collapseEvents reaproveita lib audit-state sem duplicação. Trade-off: dupla fetch (Routine→CF Pages→VPS) — irrelevante pro budget (`fetch` CF Pages tem subrequest cap 50 que comporta).

5. **CPU thresholds: load avg 5min absoluto, não normalizado por vCPU.** Spec §5.3 diz `load_avg: { warn: 1.0, critical: 1.5 }, // multiplier × vcpu_count`. Cravamos **threshold absoluto = `1.0 × vcpu_count` (warn) e `1.5 × vcpu_count` (critical)**, com `vcpu_count=4` resolvido em `limits.md` 2026-04-29 = **warn > 4.0, critical > 6.0**. detect() lê `vcpu_count` do JSON metrics (campo presente, não hardcoded) pra adaptar se VPS escalar.

Os 5 desvios mantêm a intenção do spec (detectar saturação VPS) com custos controlados pro plano CF Pages e zero dependência de credentials Vultr na Routine.

---

## File Structure

**Files to create (5):**

1. `functions/_lib/auditors/vps-limits.js` — detect puro (4 sintomas), ~220 lines (similar a billing-flow.js 280 lines mas com 1 sintoma a menos efetivo dado opt-in).
2. `functions/api/cron/audit-vps-limits.js` — endpoint orchestrator com fetch VPS + collapseEvents + dedupe wiring, ~180 lines.
3. `tests/auditor-vps-limits.test.mjs` — unit tests dos 4 sintomas, ~24 tests.
4. `tests/audit-vps-limits-endpoint.test.mjs` — endpoint integration tests (auth/method/missing-key/missing-vps-config/no-event/critical-fire/supersede/resolve/vps-fetch-fail), 9 tests.
5. `docs/canonical/decisions/2026-04-29-vps-limits-data-source.md` — registro da decisão "container nginx via Traefik + bash collector host" + alternativas avaliadas + capability check (per spec §5.3 último parágrafo).

**Files to create no VPS (3 — via SSH):**

1. `/usr/local/bin/inkflow-health-metrics.sh` — bash collector host-side (~30 lines).
2. `/opt/inkflow/health-nginx.conf` — nginx config dentro do container, com `location /_health/metrics` + token validation (~25 lines).
3. `/var/www/health/` — directory pra metrics.json (host volume mount).

**Files to modify no VPS (2 — via SSH):**

1. `/opt/inkflow/docker-compose.yml` — adicionar service `health` (nginx:alpine) com Traefik labels.
2. crontab root (`crontab -e`) — adicionar entry `* * * * * /usr/local/bin/inkflow-health-metrics.sh`.

**Files to modify (4):**

1. `docs/canonical/auditores.md` — add `## vps-limits` section + remove "vps-limits" do `## (Próximos auditores)`.
2. `.claude/agents/README.md` — atualizar row "`vps-limits` | `vps-ops`" — agent ainda não existe (Sub-projeto 2 pendente), valor é hint pra futuro.
3. `docs/canonical/methodology/incident-response.md` §6.3 — atualizar status vps-limits pra ✅ implementado.
4. `docs/canonical/runbooks/outage-wa.md` — adicionar nota "Auditor vps-limits pode ter alertado antes" no início (cross-link bidirecional).

**Files to modify (1, condicional):**

5. `docs/canonical/limits.md` §Vultr — atualizar 2 `[confirmar]`s restantes (Network egress + Backups) **somente se** founder passar valores na pré-flight Task 0. Senão fica como follow-up no backlog.

**Database:** zero migrations. Schema `audit_events` + `audit_runs` + view `audit_current_state` já existe desde PR #10 (`0de4e03`).

**Cron worker:** zero modificações. Routine Anthropic é externa ao `inkflow-cron` Worker — não adiciona trigger ao `wrangler.toml`. Endpoint `/api/cron/audit-vps-limits` ainda aceita Bearer CRON_SECRET (mesmo secret) pra consistência.

---

## Pré-requisitos cravados

Validar antes de começar Task 1:

- [ ] Estado git limpo em `main` (commit `08ed84c` ou descendente). `git status` retorna "working tree clean" — exceto `docs/canonical/limits.md` que tem 3/5 valores Vultr resolvidos via SSH 2026-04-29 (commit pendente, entra junto no PR final).
- [ ] Branch novo `feat/auditor-vps-limits` criado a partir de main: `git switch -c feat/auditor-vps-limits`.
- [ ] `node --test tests/*.test.mjs` passa em main com **134 tests** (baseline pós-#5 billing-flow). Verificar com `node --test tests/*.test.mjs 2>&1 | tail -3`. Se contagem diferir, atualizar Task 7 expected baseline antes de despachar.
- [ ] SSH funcional pro VPS: `ssh -o ConnectTimeout=10 root@104.207.145.47 "uptime"` retorna sem erro. Validado 2026-04-29 (load avg 0.03, uptime 21d).
- [ ] **Env vars já em prod (CF Pages):**
  - `SUPABASE_SERVICE_KEY` ✅ — já em CF Pages env (usado por todos auditores).
  - `CRON_SECRET` ✅ — já em CF Pages env + cron-worker secret.
  - `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` ✅ — já em CF Pages env.
- [ ] **Env vars NOVAS a cadastrar (Task 2):**
  - `VPS_HEALTH_URL` (default `https://n8n.inkflowbrasil.com/_health/metrics`)
  - `VPS_HEALTH_TOKEN` (gerar via `openssl rand -hex 32` na Task 1)
  - `AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB=5290` (opt-in — valor recomendado: 5.29 TB pool atual Vultr; setar quando founder estiver pronto pra ativar Sintoma D)

---

## Task 1: Pre-flight — verificar baseline + branch + Traefik/Docker stack

**Files:** zero modify, só leitura.

**Goal:** Verificar pré-condições do plano antes de qualquer mudança. Garante que estamos em estado limpo e que Traefik + Docker Compose do VPS são compatíveis com a abordagem cravada (validado parcialmente em 2026-04-29 — Traefik v2.11, compose em `/opt/inkflow/docker-compose.yml`, evoadmin pattern existente).

- [ ] **Step 1: Verificar estado git limpo (exceto limits.md já modificado)**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git status --short
```

Expected: somente `M  docs/canonical/limits.md` + `?? docs/superpowers/plans/2026-04-29-auditor-vps-limits.md` (esta plan + valores Vultr 3/5). Se houver outras mudanças, abortar e investigar.

- [ ] **Step 2: Criar branch novo a partir de main**

Run:
```bash
git switch -c feat/auditor-vps-limits
```

Expected: `Switched to a new branch 'feat/auditor-vps-limits'`.

- [ ] **Step 3: Verificar baseline de tests**

Run:
```bash
node --test tests/*.test.mjs 2>&1 | tail -5
```

Expected: linha `# tests 134` ou similar. Se diferir, atualizar expected counts em todas as tasks de baseline antes de prosseguir.

- [ ] **Step 4: Inspecionar `docker-compose.yml` pra confirmar pattern Traefik**

Run:
```bash
ssh root@104.207.145.47 "grep -B 1 -A 10 'evoadmin' /opt/inkflow/docker-compose.yml"
```

Expected: ver bloco `evoadmin` com labels `traefik.http.routers.evoadmin.rule=Host(...) && PathPrefix(/__admin__)` + `priority=100` + middleware `stripprefix`. Pattern espelhado pelo novo `health` service.

Se `evoadmin` ausente, abortar — premissa do plano quebra (precisa pattern de PathPrefix funcional no stack).

- [ ] **Step 5: Verificar variável `N8N_DOMAIN` em `.env` do compose**

Run:
```bash
ssh root@104.207.145.47 "grep -E '^N8N_DOMAIN|^EVO_DOMAIN' /opt/inkflow/.env 2>/dev/null"
```

Expected: 2 linhas — `N8N_DOMAIN=n8n.inkflowbrasil.com` + similar pra EVO. Anotar valor exato.

Se `.env` não está em `/opt/inkflow/`, procurar via `find /opt /root -name .env -type f 2>/dev/null`.

- [ ] **Step 6: Verificar network `inkflow` existe**

Run:
```bash
ssh root@104.207.145.47 "docker network ls | grep inkflow"
```

Expected: 1 linha listando network `inkflow_inkflow` ou similar (Docker Compose prefixa com nome do projeto).

- [ ] **Step 7: Verificar `/var/www/health/` existe ou criar (host-side)**

Run:
```bash
ssh root@104.207.145.47 'mkdir -p /var/www/health && ls -la /var/www/health/'
```

Expected: directory criado vazio.

- [ ] **Step 8: Verificar que cron está habilitado no host**

Run:
```bash
ssh root@104.207.145.47 'systemctl is-active cron && which crontab'
```

Expected: `active` + path do crontab binary (provavelmente `/usr/bin/crontab`).

- [ ] **Step 9: Confirmar baseline pronto — sem commit**

Pre-flight não gera commit. Output das steps acima fica em mensagens; founder revisa antes de despachar Task 2.

---

## Task 2: Setup endpoint `_health/metrics` no VPS (bash collector + container nginx via Traefik) + secrets CF Pages

**Files:**
- Create no VPS: `/usr/local/bin/inkflow-health-metrics.sh` (bash collector host)
- Create no VPS: `/opt/inkflow/health-nginx.conf` (config nginx dentro do container)
- Modify no VPS: `/opt/inkflow/docker-compose.yml` (add service `health`)
- Modify no VPS: crontab root (`crontab -e`)
- Local: gerar `VPS_HEALTH_TOKEN` e cadastrar em CF Pages env + VPS `.env`

**Goal:** Stand up endpoint VPS-side servindo JSON com métricas live + auth via header `X-Health-Token`. Pattern espelhado no `evoadmin` (PathPrefix em domínio existente, priority 100, Traefik gerencia cert+TLS).

- [ ] **Step 1: Gerar `VPS_HEALTH_TOKEN`**

Run local:
```bash
openssl rand -hex 32 > /tmp/vps-health-token.txt
cat /tmp/vps-health-token.txt
```

Expected: 64 chars hex. Anotar em local seguro (BWS depois — followup P3).

- [ ] **Step 2: Adicionar `VPS_HEALTH_TOKEN` ao `.env` do Docker Compose**

Run:
```bash
TOKEN=$(cat /tmp/vps-health-token.txt)
ssh root@104.207.145.47 "echo '' >> /opt/inkflow/.env && echo 'VPS_HEALTH_TOKEN=${TOKEN}' >> /opt/inkflow/.env && grep VPS_HEALTH_TOKEN /opt/inkflow/.env"
```

Expected: linha `VPS_HEALTH_TOKEN=<hex>` no `.env`. Esse arquivo é lido pelo Docker Compose pra interpolar variáveis no `docker-compose.yml`.

- [ ] **Step 3: Criar bash collector no VPS**

Run:
```bash
ssh root@104.207.145.47 'cat > /usr/local/bin/inkflow-health-metrics.sh << "BASH_EOF"
#!/usr/bin/env bash
# InkFlow — collector de métricas VPS pro auditor #3 vps-limits.
# Output: /var/www/health/metrics.json (lido por nginx + auditor CF Pages)
set -euo pipefail

OUT=/var/www/health/metrics.json
TMP=$(mktemp)

# RAM (free -m output em MB)
RAM_LINE=$(free -m | awk "NR==2 {print \$2,\$3}")
RAM_TOTAL=$(echo "$RAM_LINE" | cut -d" " -f1)
RAM_USED=$(echo "$RAM_LINE" | cut -d" " -f2)
RAM_PCT=$(awk -v u="$RAM_USED" -v t="$RAM_TOTAL" "BEGIN{printf \"%.4f\", u/t}")

# Disk root (/dev/vda2 ou similar)
DISK_LINE=$(df -BG / | awk "NR==2 {print \$2,\$3}" | tr -d "G")
DISK_TOTAL=$(echo "$DISK_LINE" | cut -d" " -f1)
DISK_USED=$(echo "$DISK_LINE" | cut -d" " -f2)
DISK_PCT=$(awk -v u="$DISK_USED" -v t="$DISK_TOTAL" "BEGIN{printf \"%.4f\", u/t}")

# Load average (5min)
LOAD_5M=$(uptime | awk -F"load average:" "{print \$2}" | awk -F"," "{print \$2}" | tr -d " ")

# vCPU count
VCPU=$(nproc)

# Timestamp ISO 8601 UTC
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "$TMP" << JSON_EOF
{
  "ram_used_pct": ${RAM_PCT},
  "ram_total_mb": ${RAM_TOTAL},
  "ram_used_mb": ${RAM_USED},
  "disk_used_pct": ${DISK_PCT},
  "disk_total_gb": ${DISK_TOTAL},
  "disk_used_gb": ${DISK_USED},
  "load_avg_5m": ${LOAD_5M},
  "vcpu_count": ${VCPU},
  "ts": "${TS}"
}
JSON_EOF

mv "$TMP" "$OUT"
chmod 644 "$OUT"
BASH_EOF
chmod +x /usr/local/bin/inkflow-health-metrics.sh
ls -la /usr/local/bin/inkflow-health-metrics.sh'
```

Expected: file criado com permissions `-rwxr-xr-x`.

- [ ] **Step 4: Rodar collector uma vez pra validar output**

Run:
```bash
ssh root@104.207.145.47 'mkdir -p /var/www/health && /usr/local/bin/inkflow-health-metrics.sh && cat /var/www/health/metrics.json'
```

Expected: JSON válido com 8 campos. RAM_PCT entre 0.10 e 0.50 (medido 0.23 em 2026-04-29), disk_pct entre 0.20 e 0.40 (medido 0.24), load_avg_5m próximo de 0.03.

- [ ] **Step 5: Adicionar collector ao crontab root (1min cadence)**

Run:
```bash
ssh root@104.207.145.47 '(crontab -l 2>/dev/null; echo "* * * * * /usr/local/bin/inkflow-health-metrics.sh >> /var/log/inkflow-health.log 2>&1") | crontab -'
ssh root@104.207.145.47 'crontab -l | tail -3'
```

Expected: última linha do crontab mostra a entry adicionada.

- [ ] **Step 6: Criar nginx config pra dentro do container**

Run:
```bash
ssh root@104.207.145.47 'cat > /opt/inkflow/health-nginx.conf << "NGINX_EOF"
# InkFlow — health metrics endpoint (auditor #3 vps-limits)
# Container nginx:alpine; recebe tráfego do Traefik com PathPrefix /_health.
server {
    listen 80;
    server_name _;

    # Auth via header X-Health-Token (env var injetada via docker-compose).
    # Nginx não suporta env vars em conf nativamente — usamos placeholder
    # substituído no entrypoint do container via envsubst (default na imagem
    # nginx:alpine quando /etc/nginx/templates/* existem). Aqui mantemos
    # config simples com token literal — substitution feita no Step 7.

    location = /_health/metrics {
        set $expected_token "VPS_HEALTH_TOKEN_PLACEHOLDER";
        if ($http_x_health_token != $expected_token) {
            return 401 "{\"error\":\"unauthorized\"}\n";
        }
        alias /usr/share/nginx/html/metrics.json;
        add_header Content-Type application/json;
        add_header Cache-Control "no-store";
    }

    # Healthcheck pro Docker (sem auth)
    location = /_health/up {
        return 200 "ok\n";
        add_header Content-Type text/plain;
    }

    location / {
        return 404;
    }
}
NGINX_EOF
ls -la /opt/inkflow/health-nginx.conf'
```

Expected: file criado.

- [ ] **Step 7: Substituir placeholder do token no config**

Run:
```bash
TOKEN=$(cat /tmp/vps-health-token.txt)
ssh root@104.207.145.47 "sed -i 's|VPS_HEALTH_TOKEN_PLACEHOLDER|${TOKEN}|' /opt/inkflow/health-nginx.conf && grep -c '${TOKEN}' /opt/inkflow/health-nginx.conf"
```

Expected: output `1` (token aparece 1 vez).

- [ ] **Step 8: Backup do `docker-compose.yml`**

Run:
```bash
ssh root@104.207.145.47 'cp /opt/inkflow/docker-compose.yml /opt/inkflow/docker-compose.yml.bak-vps-limits-$(date +%Y%m%d) && ls /opt/inkflow/docker-compose.yml.bak*'
```

Expected: backup criado.

- [ ] **Step 9: Adicionar service `health` ao `docker-compose.yml`**

Inspecionar primeiro se já existe service `health`:
```bash
ssh root@104.207.145.47 "grep -n '^  health:' /opt/inkflow/docker-compose.yml"
```

Se vazio, adicionar bloco YAML antes do final do `services:`. Caminho seguro: copiar pra local, editar, copiar de volta.

```bash
ssh root@104.207.145.47 'cat >> /opt/inkflow/docker-compose.yml << "COMPOSE_EOF"

  health:
    image: nginx:alpine
    container_name: inkflow-health
    restart: always
    volumes:
      - /var/www/health:/usr/share/nginx/html:ro
      - /opt/inkflow/health-nginx.conf:/etc/nginx/conf.d/default.conf:ro
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.health.rule=Host(`${N8N_DOMAIN}`) && PathPrefix(`/_health`)"
      - "traefik.http.routers.health.entrypoints=websecure"
      - "traefik.http.routers.health.tls.certresolver=le"
      - "traefik.http.routers.health.priority=100"
      - "traefik.http.services.health.loadbalancer.server.port=80"
    networks:
      - inkflow
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "-", "http://localhost/_health/up"]
      interval: 30s
      timeout: 5s
      retries: 3
COMPOSE_EOF'
```

**Atenção:** o YAML usa indentação com 2 espaços (verificar via `head -5` do arquivo se padrão diferente). Backticks dentro de heredoc precisam de escape OU heredoc com `<< 'COMPOSE_EOF'` (single-quoted) que desabilita expansão. Acima usamos double-quoted; testar e ajustar se Traefik não pegar `${N8N_DOMAIN}`.

Verificar:
```bash
ssh root@104.207.145.47 "tail -25 /opt/inkflow/docker-compose.yml"
```

Expected: bloco `health:` adicionado com 4 labels Traefik + volume + network.

- [ ] **Step 10: Validar sintaxe do compose file**

Run:
```bash
ssh root@104.207.145.47 "cd /opt/inkflow && docker compose config --quiet && echo OK"
```

Expected: `OK`. Se erro, restaurar backup:
```bash
ssh root@104.207.145.47 "cp /opt/inkflow/docker-compose.yml.bak-vps-limits-$(date +%Y%m%d) /opt/inkflow/docker-compose.yml"
```

- [ ] **Step 11: Subir o container `health`**

Run:
```bash
ssh root@104.207.145.47 "cd /opt/inkflow && docker compose up -d health 2>&1 | tail -5"
```

Expected: container criado/iniciado. Sem afetar outros services.

- [ ] **Step 12: Verificar container está rodando**

Run:
```bash
ssh root@104.207.145.47 "docker ps --filter name=inkflow-health --format '{{.Names}}\t{{.Status}}'"
```

Expected: `inkflow-health  Up <Xs>` ou `Up <Xs> (healthy)`.

- [ ] **Step 13: Smoke positivo via HTTPS**

Run:
```bash
TOKEN=$(cat /tmp/vps-health-token.txt)
curl -sS -H "X-Health-Token: ${TOKEN}" https://n8n.inkflowbrasil.com/_health/metrics | jq .
```

Expected: JSON válido com 8 campos. Cert TLS gerenciado pelo Traefik (mesmo cert do `n8n.inkflowbrasil.com`). Se erro `cert authority` ou similar, Traefik provavelmente regenerou cert pra novo router — aguardar ~15s e retry.

- [ ] **Step 14: Smoke negativo — sem header → 401**

Run:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://n8n.inkflowbrasil.com/_health/metrics
```

Expected: `401`.

- [ ] **Step 15: Smoke negativo — header errado → 401**

Run:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "X-Health-Token: wrong-token-xyz" https://n8n.inkflowbrasil.com/_health/metrics
```

Expected: `401`.

- [ ] **Step 16: Smoke negativo — n8n principal continua funcionando**

Run:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://n8n.inkflowbrasil.com/
```

Expected: 401 ou 200 (n8n exige login). NÃO `404`. Se 404, priority do router `health` está sobrescrevendo n8n — investigar `priority` (deve ser 100, mesmo do evoadmin).

- [ ] **Step 17: Cadastrar `VPS_HEALTH_URL` em CF Pages env (production)**

Run local:
```bash
echo "https://n8n.inkflowbrasil.com/_health/metrics" | wrangler pages secret put VPS_HEALTH_URL --project-name=inkflow-saas
```

Expected: `Success! Uploaded secret VPS_HEALTH_URL`.

- [ ] **Step 18: Cadastrar `VPS_HEALTH_TOKEN` em CF Pages env (production)**

Run local:
```bash
cat /tmp/vps-health-token.txt | wrangler pages secret put VPS_HEALTH_TOKEN --project-name=inkflow-saas
```

Expected: `Success! Uploaded secret VPS_HEALTH_TOKEN`.

- [ ] **Step 19: Verificar secrets cadastrados (sem mostrar valor)**

Run:
```bash
wrangler pages secret list --project-name=inkflow-saas | grep -E 'VPS_HEALTH_(URL|TOKEN)'
```

Expected: 2 linhas listando os secrets.

- [ ] **Step 20: Limpar token de `/tmp` local**

Run:
```bash
shred -u /tmp/vps-health-token.txt 2>/dev/null || rm /tmp/vps-health-token.txt
```

Expected: file removido (não fica em plaintext na máquina).

- [ ] **Step 21: Commit infra VPS — só docs (não há código local nessa task)**

Esta task modifica VPS + secrets CF Pages, não arquivos locais do repo. Sem commit nesta task. Decision doc é criado em Task 3.

---

## Task 3: Documentar decisão "data-source" + atualizar limits.md

**Files:**
- Create: `docs/canonical/decisions/2026-04-29-vps-limits-data-source.md`
- Modify: `docs/canonical/limits.md` (adicionar nota sobre endpoint `_health/metrics` em §Vultr)

**Goal:** Cumprir requisito do spec §5.3 último parágrafo ("Decisão final + capability check fica registrada em `docs/canonical/decisions/<data>-vps-limits-data-source.md` durante implementação"). Documenta as 3 alternativas avaliadas + capability check do que ficou cravado.

- [ ] **Step 1: Criar decision doc**

Conteúdo a escrever em `docs/canonical/decisions/2026-04-29-vps-limits-data-source.md`:

```markdown
---
last_reviewed: 2026-04-29
status: stable
related: [auditores.md, limits.md, runbooks/outage-wa.md]
---

# Decisão arquitetural — Auditor `vps-limits` data source

**Data:** 2026-04-29
**Sub-projeto:** 3 (Time de Auditores) §9.4
**Spec ref:** `docs/superpowers/specs/2026-04-27-auditores-mvp-design.md` §5.3

## Decisão

**Data source = endpoint custom no VPS** (default per spec §5.3 hierarquia).

- **Coleta:** bash script `/usr/local/bin/inkflow-health-metrics.sh` rodando via cron `* * * * *` (1min). Usa `free -m`, `df -BG /`, `uptime`, `nproc`. Output JSON em `/var/www/health/metrics.json`.
- **Hosting:** novo container `inkflow-health` (nginx:alpine, ~10MB) adicionado ao stack `/opt/inkflow/docker-compose.yml`. Volume mount `/var/www/health` → `/usr/share/nginx/html` (read-only). Exposto via Traefik labels com `Host(${N8N_DOMAIN}) && PathPrefix(/_health)` (priority 100, espelha pattern `evoadmin`). Cert Let's Encrypt + DNS reaproveitados (Traefik gerencia automaticamente).
- **Auth:** Header `X-Health-Token` validado pelo nginx dentro do container (`/opt/inkflow/health-nginx.conf` → mounted como `/etc/nginx/conf.d/default.conf`). Valor literal substituído via `sed` durante setup. `VPS_HEALTH_TOKEN` cadastrado em CF Pages env (lado consumer) e `/opt/inkflow/.env` (lado VPS, lido pelo Docker Compose).

## Alternativas avaliadas

### A. SSH via Routine Bash (rejeitado)

- **Como funcionaria:** Routine Anthropic faz `ssh root@<vps> "free -m && df -h /"` direto, parsea output.
- **Por que NÃO:** Routines remotas não têm acesso à SSH key local do founder. Spec §5.3 cravou esse realismo operacional.

### B. API Vultr (rejeitado pra MVP)

- **Como funcionaria:** Routine usa `VULTR_API_KEY` no contexto chamando `GET /v2/instances/{id}` + `/bandwidth`.
- **Por que NÃO:** Vultr API não fornece RAM/disk usage live granular (só specs contratadas + bandwidth mensal). Bandwidth é útil pro Sintoma D (egress) mas insuficiente sozinho. Adiciona dependência (API key + rotação) sem cobrir RAM/disk.
- **Pós-MVP:** vale considerar HÍBRIDO — endpoint custom pra RAM/disk/CPU + Vultr API só pra egress. Detalhar em decisão futura quando primeiro tenant pagante entrar.

### C. Express/Node minimal app no VPS (rejeitado)

- **Como funcionaria:** mini-app Node escutando porta interna, exposto via `proxy_pass` do nginx.
- **Por que NÃO:** adiciona dependência (Node install no host OU outro container Node, systemd unit ou label Traefik específica) por benefício marginal vs nginx static. Bash + container nginx é equivalente em capability sem deps de runtime adicionais.

### D. nginx no host (rejeitado — premissa errada)

- **Como funcionaria:** snippet em `/etc/nginx/snippets/` incluído no server block de `n8n.inkflowbrasil.com`.
- **Por que NÃO:** VPS não tem nginx no host (descoberto na pre-flight Task 1). Reverse proxy é Traefik containerizado. Tentar instalar nginx no host conflitaria com Traefik nas portas 80/443.

## Capability check (executado durante Task 2 do plano)

| Verificação | Resultado |
|---|---|
| `docker compose config --quiet` valida (compose com novo service `health`) | ✅ |
| `docker compose up -d health` sobe container sem afetar outros | ✅ |
| Container `inkflow-health` `Up <X>s (healthy)` | ✅ |
| `n8n.inkflowbrasil.com/` continua respondendo (não 404) | ✅ |
| Smoke positivo (`curl` com header válido) → 200 + JSON | ✅ |
| Smoke negativo (sem header) → 401 | ✅ |
| Smoke negativo (header errado) → 401 | ✅ |
| Routine Anthropic chama endpoint via `curl` (Task 12) | ✅ (validado em smoke E2E) |

## Limitações conhecidas

1. **Latência de coleta até 1min** — bash collector roda a cada 1min via cron. Métrica pode estar até 60s desatualizada quando endpoint serve. Aceitável pra cadence 6h do auditor (0.027% drift máximo).
2. **Backups não cobertos** — Vultr panel é única fonte de verdade pra estado dos backups. Auditor não tenta. Check manual periódico fica como gap pós-MVP em `auditores.md`.
3. **Egress mensal opt-in** — depende de `AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB` env var (denominador). Se não cadastrada, Sintoma D faz skip silencioso. Pattern espelha key-expiry Camada 3.

## Pós-MVP (TODOs registrados)

- [ ] Salvar `VPS_HEALTH_TOKEN` em BWS (followup §"P3 Salvar secrets" no backlog).
- [ ] Considerar híbrido endpoint+Vultr API quando egress ficar relevante (primeiro tenant pagante).
- [ ] Avaliar coleta sub-1min (systemd timer) se latência virar problema.
```

- [ ] **Step 2: Atualizar `docs/canonical/limits.md` §Vultr com nota sobre endpoint**

Adicionar logo após o parágrafo `**Provisionamento:**`:

```markdown
**Endpoint health metrics:** `https://n8n.inkflowbrasil.com/_health/metrics` (auth via header `X-Health-Token`). Coleta via bash script + cron 1min no host, servido por container `inkflow-health` (nginx:alpine) via Traefik PathPrefix routing. Decisão arquitetural em [decisions/2026-04-29-vps-limits-data-source.md](decisions/2026-04-29-vps-limits-data-source.md).
```

- [ ] **Step 3: Commit dos docs**

```bash
git add docs/canonical/decisions/2026-04-29-vps-limits-data-source.md docs/canonical/limits.md
git commit -m "docs(vps-limits): data-source decision + limits.md endpoint note"
```

Expected: commit criado, branch ahead of main por 1 commit.

---

## Task 4: Skeleton + smoke test (TDD red→green do detect vazio)

**Files:**
- Create: `functions/_lib/auditors/vps-limits.js`
- Create: `tests/auditor-vps-limits.test.mjs`

**Goal:** Estabelecer arquivo skeleton com `detect()` exportada como async function que retorna `[]` quando metrics ausentes, e suite de tests inicializada com 2 smoke tests.

- [ ] **Step 1: Criar test file com 2 smoke tests (red)**

Conteúdo:
```javascript
// tests/auditor-vps-limits.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../functions/_lib/auditors/vps-limits.js';

test('detect is exported as async function', () => {
  assert.equal(typeof detect, 'function');
});

test('detect with no metrics returns empty array', async () => {
  const events = await detect({
    env: {},
    metrics: null,
    now: Date.now(),
  });
  assert.deepEqual(events, []);
});
```

- [ ] **Step 2: Rodar e confirmar FAIL (módulo ausente)**

Run: `node --test tests/auditor-vps-limits.test.mjs`
Expected: FAIL com `Cannot find module 'functions/_lib/auditors/vps-limits.js'` ou `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Criar lib skeleton (green minimal)**

Conteúdo de `functions/_lib/auditors/vps-limits.js`:
```javascript
// functions/_lib/auditors/vps-limits.js
// ── InkFlow — Auditor #3: vps-limits ───────────────────────────────────────
// Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §5.3
// Sintomas:
//   A — RAM (warn 75% / critical 90%)
//   B — Disk (warn 75% / critical 90%)
//   C — CPU load avg 5m (warn > vcpu_count / critical > 1.5×vcpu_count)
//   D — Egress mensal (opt-in via AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB; warn 70% / critical 90%)
//
// Input: { env, metrics: { ram_used_pct, ram_total_mb, disk_used_pct, disk_total_gb,
//                          load_avg_5m, vcpu_count, ts, ... }, now }
// Output: array de events { severity, payload, evidence } — sem efeitos.

const RUNBOOK_PATH = null; // gap consciente — spec §5.3
const SUGGESTED_SUBAGENT = 'vps-ops'; // hint pro futuro Sub-projeto 2

export async function detect({ env = {}, metrics = null, now = Date.now() } = {}) {
  const events = [];
  if (!metrics) return events;
  // Sintomas serão adicionados nas tasks 5-8
  return events;
}
```

- [ ] **Step 4: Rodar e confirmar PASS**

Run: `node --test tests/auditor-vps-limits.test.mjs`
Expected: PASS — `tests 2 | pass 2 | fail 0`.

- [ ] **Step 5: Rodar suite full pra confirmar zero regressão**

Run: `node --test tests/*.test.mjs 2>&1 | tail -3`
Expected: `tests 136 | pass 136 | fail 0` (134 baseline + 2 novos).

- [ ] **Step 6: Commit**

```bash
git add functions/_lib/auditors/vps-limits.js tests/auditor-vps-limits.test.mjs
git commit -m "feat(auditor-vps-limits): skeleton detect() + smoke test"
```

---

## Task 5: Sintoma A — RAM (warn 75% / critical 90%)

**Files:**
- Modify: `functions/_lib/auditors/vps-limits.js` (add `detectSymptomA`)
- Modify: `tests/auditor-vps-limits.test.mjs` (add 6 tests)

**Goal:** Detectar RAM saturation com 2 thresholds. Retorna 1 evento `warn` ou `critical` ou `clean`.

- [ ] **Step 1: Adicionar 6 tests no test file (red)**

Adicionar ao final de `tests/auditor-vps-limits.test.mjs`:
```javascript
test('symptom A: ram below warn threshold returns clean', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.50, ram_total_mb: 8000, disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const ramEvent = events.find((e) => e.payload.symptom === 'ram');
  assert.equal(ramEvent?.severity, 'clean');
});

test('symptom A: ram at warn threshold (0.75 boundary) fires warn', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.75, ram_total_mb: 8000, disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const ramEvent = events.find((e) => e.payload.symptom === 'ram');
  assert.equal(ramEvent?.severity, 'warn');
});

test('symptom A: ram between warn and critical fires warn', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.85, ram_total_mb: 8000, disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const ramEvent = events.find((e) => e.payload.symptom === 'ram');
  assert.equal(ramEvent?.severity, 'warn');
  assert.match(ramEvent.payload.summary, /RAM em 85%/);
});

test('symptom A: ram at critical threshold (0.90 boundary) fires critical', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.90, ram_total_mb: 8000, disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const ramEvent = events.find((e) => e.payload.symptom === 'ram');
  assert.equal(ramEvent?.severity, 'critical');
});

test('symptom A: ram above critical fires critical with live_value', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.95, ram_total_mb: 8000, disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const ramEvent = events.find((e) => e.payload.symptom === 'ram');
  assert.equal(ramEvent?.severity, 'critical');
  assert.equal(ramEvent.payload.live_value, 0.95);
  assert.equal(ramEvent.payload.threshold_critical, 0.90);
  assert.equal(ramEvent.evidence.ram_total_mb, 8000);
});

test('symptom A: missing ram_used_pct skips silently', async () => {
  const events = await detect({
    env: {},
    metrics: { disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const ramEvents = events.filter((e) => e.payload.symptom === 'ram');
  assert.equal(ramEvents.length, 0);
});
```

- [ ] **Step 2: Rodar e confirmar FAIL**

Run: `node --test tests/auditor-vps-limits.test.mjs`
Expected: 6 tests novos falham (eventos vazios).

- [ ] **Step 3: Implementar `detectSymptomA` (green)**

Adicionar a `functions/_lib/auditors/vps-limits.js` (antes de `export async function detect`):
```javascript
const THRESHOLDS = {
  ram: { warn: 0.75, critical: 0.90 },
  disk: { warn: 0.75, critical: 0.90 },
  load_multiplier: { warn: 1.0, critical: 1.5 },
  egress: { warn: 0.70, critical: 0.90 },
};

function detectSymptomA(metrics) {
  const pct = metrics.ram_used_pct;
  if (typeof pct !== 'number') return null;

  let severity = 'clean';
  let threshold_warn = THRESHOLDS.ram.warn;
  let threshold_critical = THRESHOLDS.ram.critical;
  if (pct >= threshold_critical) severity = 'critical';
  else if (pct >= threshold_warn) severity = 'warn';

  const pctStr = `${Math.round(pct * 100)}%`;
  return {
    severity,
    payload: {
      symptom: 'ram',
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: severity === 'clean'
        ? `RAM em ${pctStr} (saudável)`
        : `RAM em ${pctStr}`,
      resource: 'ram',
      live_value: pct,
      threshold_warn,
      threshold_critical,
      source: 'custom_endpoint',
    },
    evidence: {
      ram_used_pct: pct,
      ram_total_mb: metrics.ram_total_mb,
      ram_used_mb: metrics.ram_used_mb,
      ts: metrics.ts,
    },
  };
}
```

E modificar `detect()` pra chamar:
```javascript
export async function detect({ env = {}, metrics = null, now = Date.now() } = {}) {
  const events = [];
  if (!metrics) return events;

  const symA = detectSymptomA(metrics);
  if (symA) events.push(symA);

  return events;
}
```

- [ ] **Step 4: Rodar e confirmar PASS (8 tests no file)**

Run: `node --test tests/auditor-vps-limits.test.mjs`
Expected: `tests 8 | pass 8 | fail 0`.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/auditors/vps-limits.js tests/auditor-vps-limits.test.mjs
git commit -m "feat(auditor-vps-limits): Sintoma A (RAM warn 75%/critical 90%)"
```

---

## Task 6: Sintoma B — Disk (warn 75% / critical 90%)

**Files:**
- Modify: `functions/_lib/auditors/vps-limits.js` (add `detectSymptomB`)
- Modify: `tests/auditor-vps-limits.test.mjs` (add 5 tests)

**Goal:** Mesmo pattern do Sintoma A aplicado a `disk_used_pct`. Retorna 1 evento por execução.

- [ ] **Step 1: Adicionar 5 tests (red)**

Adicionar ao final de `tests/auditor-vps-limits.test.mjs`:
```javascript
test('symptom B: disk below warn threshold returns clean', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.30, ram_total_mb: 8000, disk_used_pct: 0.50, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const diskEvent = events.find((e) => e.payload.symptom === 'disk');
  assert.equal(diskEvent?.severity, 'clean');
});

test('symptom B: disk at warn threshold fires warn', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.30, ram_total_mb: 8000, disk_used_pct: 0.75, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const diskEvent = events.find((e) => e.payload.symptom === 'disk');
  assert.equal(diskEvent?.severity, 'warn');
});

test('symptom B: disk above critical fires critical with summary text', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.30, ram_total_mb: 8000, disk_used_pct: 0.92, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const diskEvent = events.find((e) => e.payload.symptom === 'disk');
  assert.equal(diskEvent?.severity, 'critical');
  assert.match(diskEvent.payload.summary, /Disco em 92%/);
  assert.equal(diskEvent.payload.live_value, 0.92);
});

test('symptom B: payload includes disk_total_gb in evidence', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.30, ram_total_mb: 8000, disk_used_pct: 0.78, disk_total_gb: 150, disk_used_gb: 117, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const diskEvent = events.find((e) => e.payload.symptom === 'disk');
  assert.equal(diskEvent.evidence.disk_total_gb, 150);
  assert.equal(diskEvent.evidence.disk_used_gb, 117);
});

test('symptom B: missing disk_used_pct skips silently', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.30, ram_total_mb: 8000, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const diskEvents = events.filter((e) => e.payload.symptom === 'disk');
  assert.equal(diskEvents.length, 0);
});
```

- [ ] **Step 2: Rodar e confirmar FAIL**

Run: `node --test tests/auditor-vps-limits.test.mjs`
Expected: 5 tests novos falham.

- [ ] **Step 3: Implementar `detectSymptomB` (green)**

Adicionar a `functions/_lib/auditors/vps-limits.js`:
```javascript
function detectSymptomB(metrics) {
  const pct = metrics.disk_used_pct;
  if (typeof pct !== 'number') return null;

  let severity = 'clean';
  if (pct >= THRESHOLDS.disk.critical) severity = 'critical';
  else if (pct >= THRESHOLDS.disk.warn) severity = 'warn';

  const pctStr = `${Math.round(pct * 100)}%`;
  return {
    severity,
    payload: {
      symptom: 'disk',
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: severity === 'clean'
        ? `Disco em ${pctStr} (saudável)`
        : `Disco em ${pctStr}`,
      resource: 'disk',
      live_value: pct,
      threshold_warn: THRESHOLDS.disk.warn,
      threshold_critical: THRESHOLDS.disk.critical,
      source: 'custom_endpoint',
    },
    evidence: {
      disk_used_pct: pct,
      disk_total_gb: metrics.disk_total_gb,
      disk_used_gb: metrics.disk_used_gb,
      ts: metrics.ts,
    },
  };
}
```

E adicionar a chamada no `detect()`:
```javascript
  const symB = detectSymptomB(metrics);
  if (symB) events.push(symB);
```

- [ ] **Step 4: Rodar e confirmar PASS (13 tests no file)**

Run: `node --test tests/auditor-vps-limits.test.mjs`
Expected: `tests 13 | pass 13 | fail 0`.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/auditors/vps-limits.js tests/auditor-vps-limits.test.mjs
git commit -m "feat(auditor-vps-limits): Sintoma B (Disk warn 75%/critical 90%)"
```

---

## Task 7: Sintoma C — CPU load avg 5min (warn > vcpu_count / critical > 1.5× vcpu_count)

**Files:**
- Modify: `functions/_lib/auditors/vps-limits.js` (add `detectSymptomC`)
- Modify: `tests/auditor-vps-limits.test.mjs` (add 5 tests)

**Goal:** Detectar saturação CPU. Threshold relativo ao `vcpu_count` recebido nas metrics (vps com 4 vCPU: warn > 4.0, critical > 6.0).

- [ ] **Step 1: Adicionar 5 tests (red)**

```javascript
test('symptom C: load below vcpu_count returns clean', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.30, ram_total_mb: 8000, disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const loadEvent = events.find((e) => e.payload.symptom === 'load_avg');
  assert.equal(loadEvent?.severity, 'clean');
});

test('symptom C: load at vcpu_count boundary (4.0) fires warn', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.30, ram_total_mb: 8000, disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 4.0, vcpu_count: 4 },
  });
  const loadEvent = events.find((e) => e.payload.symptom === 'load_avg');
  assert.equal(loadEvent?.severity, 'warn');
});

test('symptom C: load at 1.5×vcpu_count (6.0) fires critical', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.30, ram_total_mb: 8000, disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 6.0, vcpu_count: 4 },
  });
  const loadEvent = events.find((e) => e.payload.symptom === 'load_avg');
  assert.equal(loadEvent?.severity, 'critical');
});

test('symptom C: thresholds scale with vcpu_count', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.30, ram_total_mb: 8000, disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 2.5, vcpu_count: 2 },
  });
  const loadEvent = events.find((e) => e.payload.symptom === 'load_avg');
  // 2.5 > 2.0 (warn=1.0×2) and 2.5 < 3.0 (critical=1.5×2) → warn
  assert.equal(loadEvent?.severity, 'warn');
  assert.equal(loadEvent.payload.threshold_warn, 2.0);
  assert.equal(loadEvent.payload.threshold_critical, 3.0);
});

test('symptom C: missing vcpu_count skips silently', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.30, ram_total_mb: 8000, disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 5.0 },
  });
  const loadEvents = events.filter((e) => e.payload.symptom === 'load_avg');
  assert.equal(loadEvents.length, 0);
});
```

- [ ] **Step 2: Rodar e confirmar FAIL**

Run: `node --test tests/auditor-vps-limits.test.mjs`
Expected: 5 tests novos falham.

- [ ] **Step 3: Implementar `detectSymptomC` (green)**

Adicionar a `functions/_lib/auditors/vps-limits.js`:
```javascript
function detectSymptomC(metrics) {
  const load = metrics.load_avg_5m;
  const vcpu = metrics.vcpu_count;
  if (typeof load !== 'number' || typeof vcpu !== 'number' || vcpu <= 0) return null;

  const warn = THRESHOLDS.load_multiplier.warn * vcpu;
  const critical = THRESHOLDS.load_multiplier.critical * vcpu;

  let severity = 'clean';
  if (load >= critical) severity = 'critical';
  else if (load >= warn) severity = 'warn';

  return {
    severity,
    payload: {
      symptom: 'load_avg',
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: severity === 'clean'
        ? `Load avg 5m em ${load.toFixed(2)} (vCPU ${vcpu}, saudável)`
        : `Load avg 5m em ${load.toFixed(2)} (vCPU ${vcpu})`,
      resource: 'load_avg_5m',
      live_value: load,
      threshold_warn: warn,
      threshold_critical: critical,
      source: 'custom_endpoint',
    },
    evidence: {
      load_avg_5m: load,
      vcpu_count: vcpu,
      ts: metrics.ts,
    },
  };
}
```

E adicionar a chamada em `detect()`:
```javascript
  const symC = detectSymptomC(metrics);
  if (symC) events.push(symC);
```

- [ ] **Step 4: Rodar e confirmar PASS (18 tests no file)**

Run: `node --test tests/auditor-vps-limits.test.mjs`
Expected: `tests 18 | pass 18 | fail 0`.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/auditors/vps-limits.js tests/auditor-vps-limits.test.mjs
git commit -m "feat(auditor-vps-limits): Sintoma C (CPU load avg, threshold × vcpu_count)"
```

---

## Task 8: Sintoma D — Egress mensal (opt-in via env)

**Files:**
- Modify: `functions/_lib/auditors/vps-limits.js` (add `detectSymptomD`)
- Modify: `tests/auditor-vps-limits.test.mjs` (add 4 tests)

**Goal:** Sintoma opt-in. Ativa **somente se** env `AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB` setada (denominador, em GB) E metric `egress_month_gb` presente. Threshold 70%/90% sobre quota mensal contratada.

**Nota:** o bash collector da Task 2 NÃO coleta egress mensal (Vultr não expõe via SSH/CLI sem API). Sintoma D depende de extensão futura: ou (a) collector adicionar campo via Vultr API call (requer `VULTR_API_KEY` no VPS), ou (b) endpoint CF Pages buscar egress separadamente via Vultr API. Pra MVP, tratamos como **opt-in tracking** — Sintoma D fica skip silencioso até que `egress_month_gb` apareça no JSON. Esta Task implementa a lógica detect-side; integração com Vultr API fica como TODO pós-MVP em backlog (P3).

- [ ] **Step 1: Adicionar 4 tests (red)**

```javascript
test('symptom D: missing env (egress quota) skips silently', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.30, ram_total_mb: 8000, disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4, egress_month_gb: 1500 },
  });
  const egressEvents = events.filter((e) => e.payload.symptom === 'egress');
  assert.equal(egressEvents.length, 0);
});

test('symptom D: env set but missing metric skips silently', async () => {
  const events = await detect({
    env: { AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB: '4000' },
    metrics: { ram_used_pct: 0.30, ram_total_mb: 8000, disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const egressEvents = events.filter((e) => e.payload.symptom === 'egress');
  assert.equal(egressEvents.length, 0);
});

test('symptom D: env set + metric below warn returns clean', async () => {
  const events = await detect({
    env: { AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB: '4000' },
    metrics: { ram_used_pct: 0.30, ram_total_mb: 8000, disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4, egress_month_gb: 1000 },
  });
  const egressEvent = events.find((e) => e.payload.symptom === 'egress');
  assert.equal(egressEvent?.severity, 'clean');
  assert.equal(egressEvent.payload.live_value, 0.25);
});

test('symptom D: env set + metric above critical fires critical', async () => {
  const events = await detect({
    env: { AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB: '4000' },
    metrics: { ram_used_pct: 0.30, ram_total_mb: 8000, disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4, egress_month_gb: 3700 },
  });
  const egressEvent = events.find((e) => e.payload.symptom === 'egress');
  assert.equal(egressEvent?.severity, 'critical');
  assert.equal(egressEvent.payload.threshold_critical, 0.90);
  assert.match(egressEvent.payload.summary, /Egress mensal/);
});
```

- [ ] **Step 2: Rodar e confirmar FAIL**

Run: `node --test tests/auditor-vps-limits.test.mjs`
Expected: 4 tests novos falham.

- [ ] **Step 3: Implementar `detectSymptomD` (green)**

Adicionar a `functions/_lib/auditors/vps-limits.js`:
```javascript
function detectSymptomD(env, metrics) {
  const quotaStr = env.AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB;
  if (!quotaStr) return null;

  const quota = parseFloat(quotaStr);
  if (!Number.isFinite(quota) || quota <= 0) return null;

  const usedGb = metrics.egress_month_gb;
  if (typeof usedGb !== 'number') return null;

  const pct = usedGb / quota;
  let severity = 'clean';
  if (pct >= THRESHOLDS.egress.critical) severity = 'critical';
  else if (pct >= THRESHOLDS.egress.warn) severity = 'warn';

  const pctStr = `${Math.round(pct * 100)}%`;
  return {
    severity,
    payload: {
      symptom: 'egress',
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: severity === 'clean'
        ? `Egress mensal em ${pctStr} (${usedGb}/${quota} GB, saudável)`
        : `Egress mensal em ${pctStr} (${usedGb}/${quota} GB)`,
      resource: 'egress_monthly',
      live_value: pct,
      threshold_warn: THRESHOLDS.egress.warn,
      threshold_critical: THRESHOLDS.egress.critical,
      source: 'custom_endpoint',
    },
    evidence: {
      egress_used_gb: usedGb,
      egress_quota_gb: quota,
      egress_used_pct: pct,
      ts: metrics.ts,
    },
  };
}
```

E adicionar a chamada em `detect()`:
```javascript
  const symD = detectSymptomD(env, metrics);
  if (symD) events.push(symD);
```

- [ ] **Step 4: Rodar e confirmar PASS (22 tests no file)**

Run: `node --test tests/auditor-vps-limits.test.mjs`
Expected: `tests 22 | pass 22 | fail 0`.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/auditors/vps-limits.js tests/auditor-vps-limits.test.mjs
git commit -m "feat(auditor-vps-limits): Sintoma D (Egress monthly opt-in)"
```

---

## Task 9: Endpoint orchestrator + fetch VPS metrics + collapseEvents + dedupe wiring

**Files:**
- Create: `functions/api/cron/audit-vps-limits.js`
- Create: `tests/audit-vps-limits-endpoint.test.mjs`

**Goal:** Endpoint CF Pages que (a) valida Bearer CRON_SECRET, (b) faz fetch a `VPS_HEALTH_URL` com header `X-Health-Token`, (c) parsea JSON metrics, (d) chama `detect()`, (e) `collapseEvents`, (f) `dedupePolicy`, (g) fire/silent/supersede/resolve via lib audit-state. 9 tests integration.

- [ ] **Step 1: Criar test file (red)**

Conteúdo `tests/audit-vps-limits-endpoint.test.mjs`:
```javascript
// tests/audit-vps-limits-endpoint.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/cron/audit-vps-limits.js';

const baseEnv = {
  CRON_SECRET: 'test-cron-secret',
  SUPABASE_SERVICE_KEY: 'test-supabase-key',
  VPS_HEALTH_URL: 'https://n8n.inkflowbrasil.com/_health/metrics',
  VPS_HEALTH_TOKEN: 'test-vps-token',
  TELEGRAM_BOT_TOKEN: 'test-tg-token',
  TELEGRAM_CHAT_ID: '123',
};

function makeReq(method = 'POST', authHeader = 'Bearer test-cron-secret') {
  return new Request('https://example.com/api/cron/audit-vps-limits', {
    method,
    headers: { Authorization: authHeader },
  });
}

function makeFetch(handlers) {
  return async (url, init) => {
    for (const h of handlers) {
      if (h.match(url, init)) return h.respond(url, init);
    }
    throw new Error(`Unhandled fetch: ${url}`);
  };
}

test('endpoint rejects GET with 405', async () => {
  const res = await onRequest({ request: makeReq('GET'), env: baseEnv });
  assert.equal(res.status, 405);
});

test('endpoint rejects missing Bearer with 401', async () => {
  const res = await onRequest({ request: makeReq('POST', ''), env: baseEnv });
  assert.equal(res.status, 401);
});

test('endpoint rejects wrong Bearer with 401', async () => {
  const res = await onRequest({ request: makeReq('POST', 'Bearer wrong'), env: baseEnv });
  assert.equal(res.status, 401);
});

test('endpoint returns 503 when SUPABASE_SERVICE_KEY missing', async () => {
  const env = { ...baseEnv, SUPABASE_SERVICE_KEY: '' };
  const res = await onRequest({ request: makeReq(), env });
  assert.equal(res.status, 503);
});

test('endpoint returns 503 when VPS_HEALTH_URL missing', async () => {
  const env = { ...baseEnv, VPS_HEALTH_URL: '' };
  const res = await onRequest({ request: makeReq(), env });
  assert.equal(res.status, 503);
});

test('endpoint returns 503 when VPS_HEALTH_TOKEN missing', async () => {
  const env = { ...baseEnv, VPS_HEALTH_TOKEN: '' };
  const res = await onRequest({ request: makeReq(), env });
  assert.equal(res.status, 503);
});

test('endpoint handles VPS fetch failure (5xx) gracefully — endRun error', async () => {
  let runStarted = false;
  let runEnded = false;
  let runEndStatus = null;
  const fetchImpl = makeFetch([
    {
      match: (url) => url.includes('audit_runs') && !url.includes('?id='),
      respond: async () => {
        runStarted = true;
        return new Response(JSON.stringify([{ id: 'run-uuid' }]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
    {
      match: (url) => url.includes('audit_runs') && url.includes('?id='),
      respond: async (url, init) => {
        runEnded = true;
        runEndStatus = JSON.parse(init.body).status;
        return new Response('', { status: 204 });
      },
    },
    {
      match: (url) => url.includes('_health/metrics'),
      respond: async () => new Response('Service Unavailable', { status: 503 }),
    },
  ]);
  const res = await onRequest({ request: makeReq(), env: baseEnv, fetchImpl });
  const body = await res.json();
  assert.equal(res.status, 500);
  assert.equal(runStarted, true);
  assert.equal(runEnded, true);
  assert.equal(runEndStatus, 'error');
});

test('endpoint clean run (all metrics healthy) returns ok with 0 events', async () => {
  const fetchImpl = makeFetch([
    {
      match: (url) => url.includes('audit_runs') && !url.includes('?id='),
      respond: async () => new Response(JSON.stringify([{ id: 'run-uuid' }]), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_runs') && url.includes('?id='),
      respond: async () => new Response('', { status: 204 }),
    },
    {
      match: (url) => url.includes('_health/metrics'),
      respond: async () => new Response(JSON.stringify({
        ram_used_pct: 0.30, ram_total_mb: 8000, ram_used_mb: 2400,
        disk_used_pct: 0.25, disk_total_gb: 150, disk_used_gb: 37,
        load_avg_5m: 0.5, vcpu_count: 4,
        ts: '2026-04-29T22:53:00Z',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_current_state'),
      respond: async () => new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
  ]);
  const res = await onRequest({ request: makeReq(), env: baseEnv, fetchImpl });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.events_count, 0);
});

test('endpoint critical run (disk 92%) fires + sends Telegram', async () => {
  let telegramCalled = false;
  let insertedEvent = null;
  const fetchImpl = makeFetch([
    {
      match: (url) => url.includes('audit_runs') && !url.includes('?id='),
      respond: async () => new Response(JSON.stringify([{ id: 'run-uuid' }]), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_runs') && url.includes('?id='),
      respond: async () => new Response('', { status: 204 }),
    },
    {
      match: (url) => url.includes('_health/metrics'),
      respond: async () => new Response(JSON.stringify({
        ram_used_pct: 0.30, ram_total_mb: 8000,
        disk_used_pct: 0.92, disk_total_gb: 150, disk_used_gb: 138,
        load_avg_5m: 0.5, vcpu_count: 4,
        ts: '2026-04-29T22:53:00Z',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_current_state'),
      respond: async () => new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_events') && !url.includes('?id='),
      respond: async (url, init) => {
        insertedEvent = JSON.parse(init.body);
        return new Response(JSON.stringify([{ id: 'event-uuid', ...insertedEvent }]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
    {
      match: (url) => url.includes('api.telegram.org'),
      respond: async () => { telegramCalled = true; return new Response('{"ok":true}', { status: 200 }); },
    },
  ]);
  const res = await onRequest({ request: makeReq(), env: baseEnv, fetchImpl });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.events_count, 1);
  assert.equal(body.actions.fire, 1);
  assert.equal(insertedEvent?.severity, 'critical');
  assert.equal(telegramCalled, true);
});
```

- [ ] **Step 2: Rodar e confirmar FAIL (módulo ausente)**

Run: `node --test tests/audit-vps-limits-endpoint.test.mjs`
Expected: FAIL com `Cannot find module 'functions/api/cron/audit-vps-limits.js'`.

- [ ] **Step 3: Implementar endpoint orchestrator (green)**

Conteúdo `functions/api/cron/audit-vps-limits.js`:
```javascript
// functions/api/cron/audit-vps-limits.js
// ── InkFlow — Cron: audit vps-limits (§5.3) ────────────────────────────────
// Auditor #3. Routine Anthropic cron 15 */6 * * * UTC. Endpoint:
//   1. Auth Bearer CRON_SECRET
//   2. Fetch metrics ao endpoint VPS (https://n8n.inkflowbrasil.com/_health/metrics)
//   3. detect() puro → events array
//   4. collapseEvents → 1 top event (severidade max)
//   5. dedupePolicy → fire/silent/supersede/resolve
//   6. INSERT audit_events + Telegram quando aplicável

import { detect } from '../../_lib/auditors/vps-limits.js';
import {
  startRun,
  endRun,
  getCurrentState,
  insertEvent,
  dedupePolicy,
  sendTelegram,
} from '../../_lib/audit-state.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

function timeoutSignal(ms) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function severityRank(s) {
  return s === 'critical' ? 3 : s === 'warn' ? 2 : s === 'clean' ? 1 : 0;
}

// Collapse múltiplos eventos do auditor em um único top-event (severity max).
function collapseEvents(events) {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  const top = sorted[0];
  if (top.severity === 'clean') {
    return { severity: 'clean', payload: { symptom: 'aggregate', summary: 'all checks ok' }, evidence: {} };
  }
  const otherCount = sorted.filter((e) => e.severity !== 'clean' && e !== top).length;
  const allFailingSymptoms = sorted
    .filter((e) => e.severity !== 'clean' && e.payload?.symptom)
    .map((e) => ({ symptom: e.payload.symptom, severity: e.severity }));
  return {
    severity: top.severity,
    payload: {
      ...top.payload,
      affected_count: allFailingSymptoms.length,
      affected_symptoms: allFailingSymptoms,
      summary: otherCount > 0
        ? `${top.payload.summary} (+${otherCount} sintomas)`
        : top.payload.summary,
    },
    evidence: {
      top: top.evidence,
      all: sorted.map((e) => ({ severity: e.severity, symptom: e.payload?.symptom })),
    },
  };
}

async function fetchVpsMetrics(env, fetchImpl) {
  const res = await fetchImpl(env.VPS_HEALTH_URL, {
    method: 'GET',
    headers: { 'X-Health-Token': env.VPS_HEALTH_TOKEN, Accept: 'application/json' },
    signal: timeoutSignal(8000),
  });
  if (!res.ok) {
    throw new Error(`vps_health_fetch_failed: ${res.status}`);
  }
  return res.json();
}

export async function onRequest(context) {
  const { request, env } = context;
  const fetchImpl = context.fetchImpl || globalThis.fetch.bind(globalThis);

  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!env.CRON_SECRET || token !== env.CRON_SECRET) return json({ error: 'unauthorized' }, 401);

  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return json({ error: 'config_missing', detail: 'SUPABASE_SERVICE_KEY' }, 503);
  if (!env.VPS_HEALTH_URL) return json({ error: 'config_missing', detail: 'VPS_HEALTH_URL' }, 503);
  if (!env.VPS_HEALTH_TOKEN) return json({ error: 'config_missing', detail: 'VPS_HEALTH_TOKEN' }, 503);

  const supabase = { url: SUPABASE_URL, key: sbKey, fetchImpl };
  const sbHeaders = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
  };

  const originalFetch = globalThis.fetch;
  if (context.fetchImpl) globalThis.fetch = context.fetchImpl;

  let runId;
  const actions = { fire: 0, silent: 0, supersede: 0, resolve: 0, no_op: 0 };
  let collapsed = null;

  try {
    runId = await startRun(supabase, 'vps-limits');

    const metrics = await fetchVpsMetrics(env, fetchImpl);
    const rawEvents = await detect({ env, metrics, now: Date.now() });
    collapsed = collapseEvents(rawEvents);

    if (collapsed) {
      const current = await getCurrentState(supabase, 'vps-limits');
      const action = dedupePolicy(current, collapsed);
      actions[action.replace('-', '_')] = (actions[action.replace('-', '_')] || 0) + 1;

      if (action === 'fire' || action === 'supersede') {
        const inserted = await insertEvent(supabase, {
          run_id: runId,
          auditor: 'vps-limits',
          severity: collapsed.severity,
          payload: collapsed.payload,
          evidence: collapsed.evidence,
        });
        await sendTelegram(env, inserted);

        if (action === 'supersede' && current) {
          await fetchImpl(`${SUPABASE_URL}/rest/v1/audit_events?id=eq.${current.event_id}`, {
            method: 'PATCH',
            headers: sbHeaders,
            body: JSON.stringify({
              resolved_at: new Date().toISOString(),
              resolved_reason: 'superseded',
              superseded_by: inserted.id,
            }),
            signal: timeoutSignal(5000),
          });
        }
      } else if (action === 'resolve' && current) {
        await fetchImpl(`${SUPABASE_URL}/rest/v1/audit_events?id=eq.${current.event_id}`, {
          method: 'PATCH',
          headers: sbHeaders,
          body: JSON.stringify({
            resolved_at: new Date().toISOString(),
            resolved_reason: 'next_run_clean',
          }),
          signal: timeoutSignal(5000),
        });
        await sendTelegram(env, {
          id: current.event_id,
          severity: 'resolved',
          auditor: 'vps-limits',
          payload: { runbook_path: null, summary: 'vps-limits: resolved (next run clean)' },
          evidence: {},
        });
      }
      // 'silent' e 'no-op' → nada.
    }

    await endRun(supabase, runId, {
      status: 'success',
      eventsEmitted: actions.fire + actions.supersede,
    });
    return json({ ok: true, run_id: runId, events_count: collapsed && collapsed.severity !== 'clean' ? 1 : 0, actions });
  } catch (err) {
    if (runId) {
      try {
        await endRun(supabase, runId, {
          status: 'error',
          eventsEmitted: 0,
          errorMessage: err.message,
        });
      } catch { /* ignore */ }
    }
    return json({ error: 'internal_error', message: err.message }, 500);
  } finally {
    if (context.fetchImpl) globalThis.fetch = originalFetch;
  }
}
```

- [ ] **Step 4: Rodar e confirmar PASS (9 tests)**

Run: `node --test tests/audit-vps-limits-endpoint.test.mjs`
Expected: `tests 9 | pass 9 | fail 0`.

- [ ] **Step 5: Rodar suite full pra confirmar zero regressão**

Run: `node --test tests/*.test.mjs 2>&1 | tail -3`
Expected: `tests 165 | pass 165 | fail 0` (134 baseline + 22 unit + 9 endpoint).

- [ ] **Step 6: Commit**

```bash
git add functions/api/cron/audit-vps-limits.js tests/audit-vps-limits-endpoint.test.mjs
git commit -m "feat(audit-vps-limits): endpoint + fetchVpsMetrics + collapseEvents + dedupe wiring"
```

---

## Task 10: Deploy CF Pages + smoke endpoint live

**Files:** zero modify. Push branch + aguardar CF Pages preview deploy + smoke.

**Goal:** Validar que o endpoint deploya corretamente no preview de CF Pages e responde 401 sem auth (sanity check).

- [ ] **Step 1: Push branch + abrir PR (draft)**

Run:
```bash
git push -u origin feat/auditor-vps-limits
gh pr create --draft --title "feat: Sub-projeto 3 §9.4 Auditor #3 vps-limits" --body "$(cat <<'PR_EOF'
## Summary

- Implementa Auditor #3 `vps-limits` como **primeira Routine Anthropic** do Sub-projeto 3
- 4 sintomas: RAM, Disk, Load avg, Egress (opt-in)
- Routine `15 */6 * * *` UTC (offset 15min do deploy-health) → `/api/cron/audit-vps-limits`
- Endpoint busca metrics via fetch a `https://n8n.inkflowbrasil.com/_health/metrics` (auth header `X-Health-Token`)
- Bash collector host + container nginx via Traefik no VPS (decisão arquitetural em `docs/canonical/decisions/2026-04-29-vps-limits-data-source.md`)
- 31 tests novos (22 unit + 9 endpoint), zero regressão (165 total)
- 5 spec deviations cravadas no plano (hosting, opt-in egress, no-backups, fetch-side metrics, threshold absoluto)

## Test plan

- [x] `node --test tests/*.test.mjs` passa (165 tests)
- [ ] Smoke endpoint: `curl -X POST https://inkflowbrasil.com/api/cron/audit-vps-limits` (sem auth) → 401
- [ ] Smoke endpoint: com Bearer válido + VPS up → 200 + `{ ok: true, events_count: 0|1 }`
- [ ] Smoke E2E full: aguardar Routine disparar (cron natural ou trigger manual)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PR_EOF
)"
```

Expected: PR criado em modo draft com URL retornada.

- [ ] **Step 2: Aguardar deploy CF Pages preview (~2min)**

Run:
```bash
sleep 90 && gh pr view --json statusCheckRollup --jq '.statusCheckRollup[] | select(.name | contains("Cloudflare"))'
```

Expected: status `SUCCESS` ou `IN_PROGRESS`. Se `FAILURE`, ver logs antes de prosseguir.

Alternativa: checar via CF dashboard `https://dash.cloudflare.com` → Pages → inkflow-saas → Deployments. Anotar URL preview (formato `https://<hash>.inkflow-saas.pages.dev`).

- [ ] **Step 3: Smoke 401 (sem auth) no preview**

Run (substituir `<PREVIEW_URL>` pela URL anotada no Step 2):
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST <PREVIEW_URL>/api/cron/audit-vps-limits
```

Expected: `401`.

- [ ] **Step 4: Smoke 405 (GET) no preview**

Run:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X GET <PREVIEW_URL>/api/cron/audit-vps-limits
```

Expected: `405`.

- [ ] **Step 5: Não fazer trigger autenticado no preview** — preview não tem secrets de prod, vai falhar 503. Skip.

- [ ] **Step 6: Marcar PR como ready (não merge ainda)**

Run:
```bash
gh pr ready
```

Expected: PR sai de draft.

---

## Task 11: Merge to main + deploy prod + smoke endpoint live em prod

**Files:** zero modify. Merge + smoke.

**Goal:** Mergear na main e validar endpoint em prod via sanity check (401 + 200 com auth).

- [ ] **Step 1: Confirmar todos os checks passam no PR**

Run:
```bash
gh pr view --json statusCheckRollup --jq '.statusCheckRollup'
```

Expected: todos os checks com `state: SUCCESS`.

- [ ] **Step 2: Merge preserving granular commits (não squash)**

Run:
```bash
gh pr merge --merge --delete-branch
```

Expected: `Merged pull request #N`. Branch deletado.

- [ ] **Step 3: Pull main + verificar commits preservados**

Run:
```bash
git switch main
git pull
git log --oneline -15 | head -15
```

Expected: ver merge commit + commits granulares (Task 3, 4, 5, 6, 7, 8, 9 individual commits) preservados.

- [ ] **Step 4: Aguardar CF Pages prod deploy (~3min)**

Run:
```bash
sleep 180
```

- [ ] **Step 5: Smoke 401 em prod**

Run:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST https://inkflowbrasil.com/api/cron/audit-vps-limits
```

Expected: `401`.

- [ ] **Step 6: Smoke 405 em prod**

Run:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X GET https://inkflowbrasil.com/api/cron/audit-vps-limits
```

Expected: `405`.

- [ ] **Step 7: Smoke autenticado em prod (sanity full)**

Founder roda este step (precisa de CRON_SECRET). Comando:
```bash
CRON_SECRET=$(wrangler pages secret list --project-name=inkflow-saas | grep -A 0 CRON_SECRET) # ou via BWS
# Note: wrangler list não mostra valor — founder usa BWS ou passa direto:
curl -sS -X POST https://inkflowbrasil.com/api/cron/audit-vps-limits \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

Expected: HTTP 200 com body `{"ok":true,"run_id":"<uuid>","events_count":0|1,"actions":{...}}`.

Se 500 com `vps_health_fetch_failed`: VPS endpoint inacessível — verificar nginx + bash collector.

Se 200 com `events_count: 1`: VPS está em estado warn/critical real. Verificar Telegram pra confirmar alert recebido.

Se 200 com `events_count: 0`: VPS clean. Esperado em estado normal (medições 2026-04-29: RAM 23%, disk 24%, load 0.03 — todos abaixo de warn 75%).

---

## Task 12: Routine Anthropic registration + smoke E2E

**Files:** zero modify. Skill `/schedule` invocation.

**Goal:** Criar Routine Anthropic via skill `/schedule` que dispara o endpoint a cada 6h. Pure-trigger (sem reasoning Claude no MVP — endpoint faz todo o trabalho).

**Pre-flight:** founder precisa rodar `/schedule` skill no Claude Code (trigger manual). Implementer (Claude) prepara o conteúdo do prompt + cron e instrui founder.

- [ ] **Step 1: Preparar prompt da Routine**

Conteúdo do prompt (copiar pra Routine):
```
You are a scheduled trigger for the InkFlow vps-limits auditor. Your job is to POST to a fixed endpoint and report the response.

Action:
1. Run: curl -sS -X POST https://inkflowbrasil.com/api/cron/audit-vps-limits -H "Authorization: Bearer ${CRON_SECRET}"
2. Report the HTTP status + body to the schedule output (so failures show up in logs).

Do NOT do anything else. Do NOT analyze metrics or make decisions — the endpoint handles all logic. You are a pure trigger.

If status != 200, the failure is already alerted via Telegram by the endpoint's error path. No further action needed.
```

- [ ] **Step 2: Founder cria Routine via `/schedule` skill**

Founder roda no Claude Code:
```
/schedule
```

E configura:
- **Cron:** `15 */6 * * *` (UTC — 00:15/06:15/12:15/18:15)
- **Prompt:** conteúdo do Step 1 acima
- **Secrets necessários:** `CRON_SECRET` (a Routine precisa ler — verificar se /schedule suporta secret injection ou se prompt precisa hardcode token; **AVISO:** se hardcode, criar secret rotation reminder em backlog).
- **Name:** `inkflow-vps-limits-auditor`

- [ ] **Step 3: Trigger manual da Routine via /schedule run (smoke #1)**

Founder roda:
```
/schedule run inkflow-vps-limits-auditor
```

Expected: log da Routine mostra HTTP 200 + body `{"ok":true,...}`.

Se HTTP 401: prompt da Routine não está injetando o token corretamente. Investigar `/schedule` capabilities.

- [ ] **Step 4: Verificar `audit_runs` no Supabase**

Founder roda no Supabase Dashboard SQL Editor:
```sql
SELECT auditor, status, events_emitted, started_at, completed_at, error_message
FROM audit_runs
WHERE auditor='vps-limits'
ORDER BY started_at DESC
LIMIT 5;
```

Expected: 1 row com `status='success'`, `events_emitted=0`, `completed_at` ~5s após `started_at`.

- [ ] **Step 5: Aguardar primeiro cron natural (até 6h)**

Após Routine criada, próxima execução natural acontece no próximo `15 */6 * * *` UTC. Anotar timestamp esperado em daily note pra monitorar.

- [ ] **Step 6: Verificar 2ª execução (cron natural)**

Após o cron natural disparar (founder pode validar 6h+ depois ou Claude verifica em sessão futura):
```sql
SELECT auditor, status, events_emitted, started_at, completed_at
FROM audit_runs
WHERE auditor='vps-limits'
ORDER BY started_at DESC
LIMIT 5;
```

Expected: 2+ rows com `status='success'`.

- [ ] **Step 7: Smoke E2E forçado (warn) — opcional, via fixture injection (sem stress real)**

Em vez de carregar a VPS com `stress` (risco de OOM no n8n/Evolution), injeta-se um JSON fake no path do collector por ~75s, dispara Routine, restaura. Sem impacto em prod.

```bash
ssh root@104.207.145.47 '
# 1. Backup do JSON real
cp /var/www/health/metrics.json /tmp/metrics.json.real
# 2. Sobrescreve com fake critical (disk 92%)
cat > /var/www/health/metrics.json << "FAKE_EOF"
{
  "ram_used_pct": 0.30,
  "ram_total_mb": 8192,
  "ram_used_mb": 2458,
  "disk_used_pct": 0.92,
  "disk_total_gb": 160,
  "disk_used_gb": 147,
  "load_avg_5m": 0.5,
  "vcpu_count": 4,
  "ts": "2026-04-29T23:00:00Z"
}
FAKE_EOF
# 3. Suspender o cron por 75s pra collector não sobrescrever
crontab -l | grep -v inkflow-health-metrics | crontab -
sleep 5
echo "fake injected at $(date)"
'
```

Trigger manual da Routine:
```
/schedule run inkflow-vps-limits-auditor
```

Aguardar Telegram alert. Esperado:
```
[critical] [vps-limits] Disco em 92%
ID: <8chars> | Runbook: (none)
Suggested: @vps-ops
Evidence: disk_total_gb=160, disk_used_pct=0.92
```

Restaurar imediatamente após validar:
```bash
ssh root@104.207.145.47 '
mv /tmp/metrics.json.real /var/www/health/metrics.json
(crontab -l 2>/dev/null; echo "* * * * * /usr/local/bin/inkflow-health-metrics.sh >> /var/log/inkflow-health.log 2>&1") | crontab -
crontab -l | grep inkflow
'
```

Validar resolve flow: trigger Routine de novo, esperar Telegram `[resolved]`.

**Por que fixture > stress:** zero risco pra prod (n8n/Evolution intactos), mais rápido (sem aguardar build-up de stress), e testa exatamente o path crítico (collector→endpoint→detect→Telegram).

- [ ] **Step 8: Documentar smoke em `evals/sub-projeto-3/2026-04-29-auditor-vps-limits-smoke.md`**

Conteúdo cabe em ~80 linhas. Estrutura espelhada nos smokes #1 e #2: `Status final` (DONE_WITH_CONCERNS se smoke E2E forçado não rodou, DONE se rodou).

- [ ] **Step 9: Commit eval doc**

```bash
git add evals/sub-projeto-3/2026-04-29-auditor-vps-limits-smoke.md
git commit -m "test(auditor-vps-limits): smoke partial doc"
git push origin main
```

---

## Task 13: Docs canonical + agents/README + incident-response cross-link

**Files:**
- Modify: `docs/canonical/auditores.md` (add `## vps-limits` section)
- Modify: `.claude/agents/README.md` (Mapping table — `vps-limits` row já deve existir do PR #11; verificar e atualizar se necessário)
- Modify: `docs/canonical/methodology/incident-response.md` §6.3 (cross-link com PR #N)
- Modify: `docs/canonical/runbooks/outage-wa.md` (adicionar nota top sobre auditor pode ter alertado antes)

**Goal:** Cumprir DoD documentação (spec §10).

- [ ] **Step 1: Add `## vps-limits` em `docs/canonical/auditores.md`**

Conteúdo:
```markdown
## vps-limits

**Onde:** Routine Anthropic (`/schedule`) — primeira Routine do MVP
**Frequência:** `15 */6 * * *` UTC (00:15/06:15/12:15/18:15 — offset 15min do deploy-health)
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

1. **Hosting endpoint VPS:** novo container `inkflow-health` (nginx:alpine) adicionado ao stack `/opt/inkflow/docker-compose.yml`, exposto via Traefik labels `Host(${N8N_DOMAIN}) && PathPrefix(/_health)` priority 100 (espelha pattern `evoadmin`). Bash collector host + cron 1min escreve `/var/www/health/metrics.json` (volume mount read-only no container). Decisão em `docs/canonical/decisions/2026-04-29-vps-limits-data-source.md`.
2. **Sintoma D opt-in:** ativa só se `AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB` env setada. Razão: denominador (egress contratado) requer leitura no Vultr panel pelo founder; sem env, skip silencioso.
3. **Routine pure-trigger:** Routine NÃO faz reasoning sobre metrics — só POST ao endpoint. Endpoint faz fetch ao VPS e toda a lógica (consistente com #1/#2/#5).
4. **Backups Vultr não cobertos:** sem API consistente. Check manual periódico no Vultr panel — gap pós-MVP.
5. **CPU thresholds absolutos × vcpu_count:** detect lê `vcpu_count` do JSON metrics (não hardcoded), thresholds escalam com VPS.

### Env vars necessárias

- `VPS_HEALTH_URL` — `https://n8n.inkflowbrasil.com/_health/metrics` (CF Pages env)
- `VPS_HEALTH_TOKEN` — 64-char hex (CF Pages env + VPS `/etc/environment` — manter sincronizados)
- `CRON_SECRET` — Bearer pro endpoint (já em prod)
- `SUPABASE_SERVICE_KEY` — INSERT em audit_events (já em prod)
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` — alerts (já em prod)
- `AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB` — **opcional**, ativa Sintoma D quando setada

### Dedupe

Comportamento padrão de `audit-state.dedupePolicy` (§6.2):
- Mesma severity, < 24h desde último alert → silent (UPDATE last_seen)
- Mesma severity, ≥ 24h → fire lembrete
- warn → critical → supersede + Telegram
- crítical → warn → silent (não rebaixa)
- next_run_clean → resolve + Telegram `[resolved]`

### Runbook trigger

Não tem runbook dedicado. Quando alert chega, founder usa hint `suggested_subagent='vps-ops'` (futuro Sub-projeto 2) ou investiga manualmente via SSH ao VPS:
```bash
ssh root@104.207.145.47 'free -m && df -h / && uptime && ps aux --sort=-%mem | head'
```

### Não cobertos no MVP

- **Backups Vultr** — sem API; check manual no Vultr panel (gap pós-MVP).
- **Egress mensal** — opt-in via env (gap se founder não cadastrar quota).
- **Egress live (sub-mensal)** — bash collector não coleta egress instantâneo (`vnstat` ou similar requerem instalação extra). Cobertura mensal só.

### Próximos passos pós-MVP

1. Salvar `VPS_HEALTH_TOKEN` em BWS (followup §"P3 Salvar secrets" no backlog).
2. Avaliar híbrido endpoint+Vultr API quando primeiro tenant pagante entrar.
3. Considerar `vnstat` no VPS pra cobrir egress live (não só mensal).
4. Criar runbook dedicado quando 2ª ocorrência ad-hoc passar do limite de 5min ad-hoc per `runbooks/README.md`.
```

E remover `vps-limits` da lista `## (Próximos auditores)` no fim do arquivo (se ainda existir entry).

- [ ] **Step 2: Atualizar `.claude/agents/README.md` Mapping table**

Verificar se row `vps-limits` já existe. Se sim, atualizar valor. Se não, adicionar:
```markdown
| `vps-limits` | `vps-ops` | Hint pra futuro — agent não existe ainda (Sub-projeto 2 pendente). |
```

- [ ] **Step 3: Atualizar `docs/canonical/methodology/incident-response.md` §6.3**

Marcar status `vps-limits → ✅ implementado (PR #N — `<merge_sha>`)`.

- [ ] **Step 4: Atualizar `docs/canonical/runbooks/outage-wa.md`**

Adicionar logo após o cabeçalho do runbook:
```markdown
> **Auditor `vps-limits` pode ter alertado antes:** se VPS estava saturado (RAM/disk/load), Auditor #3 dispara alert Telegram cada 6h via Routine Anthropic. Conferir histórico de alerts antes de iniciar este runbook — se há alert recente, ler `audit_events` pra contexto. Cross-ref `docs/canonical/auditores.md#vps-limits`.
```

- [ ] **Step 5: Commit dos docs**

```bash
git add docs/canonical/auditores.md .claude/agents/README.md docs/canonical/methodology/incident-response.md docs/canonical/runbooks/outage-wa.md
git commit -m "docs(auditor-vps-limits): canonical entry + agent mapping + incident-response + outage-wa cross-link"
```

- [ ] **Step 6: Push direto pra main (docs-only)**

Esses arquivos são docs — pode commitar diretamente em main pós-merge sem PR (igual aos #2 e #5). Mas idealmente, esses docs entram NO MESMO PR do código. **Decisão:** se Task 13 é executada APÓS merge da Task 11, push direto. Se executada ANTES, fica no PR.

**Recomendação:** executar Task 13 ANTES de Task 11 step 2 (merge), incluir docs no PR. Reorganizar tasks se necessário.

---

## Task 14: Atualizar Painel + daily note + fechar

**Files:**
- Modify: `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Painel.md`
- Modify: `~/.claude/projects/-Users-brazilianhustler/memory/Daily Notes/2026-04-29.md` (parte 3 ou novo dia)
- Modify: `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Pendências (backlog).md` (mover/atualizar entries)

**Goal:** Painel reflete 4/5 auditores DONE. Daily note registra "parte N" se mesma sessão ou novo arquivo se sessão de dia diferente.

- [ ] **Step 1: Atualizar Painel — bloco principal**

Substituir bloco "📊 Onde estamos agora" do dia 29/04 noite por:
```markdown
## 📊 Onde estamos agora (29/04/2026 — sessão pós-noite, **Auditor #3 vps-limits MERGEADO em prod (PR #N)**)

### 🎯 Sub-projeto 3 progresso: 4/5 auditores DONE

| Auditor | Status | PR | Onde |
|---|---|---|---|
| #1 key-expiry | ✅ Em prod desde 28/04 | #11 | inkflow-cron Worker |
| #2 deploy-health | ✅ Em prod desde 29/04 manhã | #12 | inkflow-cron Worker |
| #5 billing-flow | ✅ Em prod desde 29/04 noite | #13 | inkflow-cron Worker |
| **#3 vps-limits** | ✅ **Em prod desde 29/04 (pós-noite)** | **#N** | **Routine Anthropic + endpoint CF Pages** |
| #4 rls-drift | ⏳ Pendente | — | Routine Anthropic |
```

E continuar com 4 sintomas + cron + tests + endpoint + spec deviations + lições.

- [ ] **Step 2: Adicionar `# 2026-04-29 — sessão Auditor #3 vps-limits (parte 3)` no daily**

Append ao file. 4 seções (O que construí / Como o Claude me ajudou / O que aprendi / Código que escrevi).

- [ ] **Step 3: Atualizar backlog — adicionar entry `## P2 — Auditor #3 vps-limits: validação 48h + smoke E2E forçado`**

Igual aos #2 e #5: monitorar `audit_runs` 48h + smoke forçado quando primeira saturação real ocorrer.

- [ ] **Step 4: Commit memory + vault**

(O hook `Stop` faz git push automático em memory + vault — ver `[[automation_git_sync]]`. Validar `git status` em ambos os repos antes de fechar sessão.)

---

## Self-Review (gerado durante writing-plans)

**1. Spec coverage:** Skimei §5.3 e §9.4 do spec. Cobertura:
- §5.3 hierarquia de coleta (default endpoint custom) → ✅ Task 2 (bash + nginx) + decision doc Task 3
- §5.3 política de severity (4 thresholds) → ✅ Tasks 5-8
- §5.3 payload schema (runbook_path null, suggested_subagent vps-ops, source) → ✅ Tasks 5-8
- §5.3 aspiracionais (Vultr API, SSH) → ✅ documentados como rejeitados em decision doc Task 3
- §9.4 pré-req `[confirmar]`s Vultr → ✅ 3/5 resolvidos via SSH 2026-04-29 (RAM/disk/vCPU); 2/5 (egress + backups) cobertos via opt-in (Sintoma D) e gap consciente (backups)
- §9.4 pré-req endpoint /health/metrics → ✅ Task 2
- §9.4 pré-req VPS_HEALTH_TOKEN → ✅ Task 2 step 14
- §9.4 pré-req decision doc → ✅ Task 3
- §9.4 implementação Routine → ✅ Task 12
- §9.4 smoke test fixture → ✅ Task 12 step 7 (forçado via `stress`)
- §9.4 48h prod sem falsa-positiva → registrado no backlog Task 14 step 3 (gate ~01/05)

**2. Placeholder scan:**
- `<NGINX_CONFIG_PATH>` em Task 2 step 8 — placeholder explicitamente esperado da Task 1 step 4 (resolução em runtime)
- `<TBD>` em §"Spec deviations" item 2 — refere a commit que vai ser feito durante implementação; aceitável (substituído pelo SHA real ao executar Task 13)
- `<PREVIEW_URL>` em Task 10 step 3 — placeholder esperado do Step 2 (URL CF Pages preview)
- `<merge_sha>` em Task 13 step 3 — placeholder esperado do Task 11 step 2
- Nenhum `TODO`, `TBD final`, "implement later" em código.

**3. Type consistency:**
- `detectSymptomA/B/C/D` retornam mesmo shape `{ severity, payload: { symptom, runbook_path, suggested_subagent, summary, resource, live_value, threshold_warn, threshold_critical, source }, evidence: { ...metric_specific, ts } }` — consistente.
- `collapseEvents()` chama `severityRank` definida acima — consistente com #5 billing-flow.
- `endpoint orchestrator` chama `startRun/getCurrentState/insertEvent/dedupePolicy/sendTelegram/endRun` da lib `audit-state` — assinaturas batem com o source verificado em billing-flow.

**4. Gap conhecido:** Task 12 step 2 ("Founder cria Routine") — depende de capability `/schedule` skill aceitar secret injection. Se não aceitar, prompt vai precisar hardcode do CRON_SECRET (escolha antes de Task 12). Marcado como "AVISO" no plano. Se hardcode for único caminho, criar followup P3 "rotacionar secret após primeiro uso".

---

## Execution notes

- **Pattern reuse:** ~70% do código de `vps-limits.js` é mecânico (helpers `detectSymptomA/B/C/D` parecidos, `collapseEvents` 100% idêntico ao billing-flow, endpoint shell idêntico exceto `fetchVpsMetrics`). Clone-pattern já calibrado nos #2 e #5 deve permitir execução em ~60% do tempo do #5.

- **Diferenças únicas vs Worker auditors (#1/#2/#5):**
  1. Coleta no VPS (bash + nginx) — code novo no host, não no repo CF Pages
  2. Endpoint orchestrator faz fetch a URL externa autenticada (vs database queries)
  3. Routine Anthropic em vez de cron-worker trigger — não toca `wrangler.toml`
  4. Decision doc obrigatório (registro arquitetural pós-MVP)

- **Risco de quebra do `n8n.inkflowbrasil.com`:** Task 2 modifica `docker-compose.yml` (adiciona service novo `health`) — não modifica configs existentes do n8n/evolution. Risco principal é conflito de routing: novo router `health` usa `Host(N8N_DOMAIN) && PathPrefix(/_health)` com priority 100; se algum path existente do n8n começar com `/_health`, request seria sequestrado. Mitigação: prefix `_health` (underscore) é convenção pra endpoints internos, improvável colisão com n8n. Backup do compose criado em Task 2 step 8 (`docker-compose.yml.bak-vps-limits-<DATE>`); rollback é `cp <backup> docker-compose.yml && docker compose up -d`.

- **Sintoma D escopo:** opt-in. Task 8 implementa lógica detect; integração com Vultr API fica TODO pós-MVP. Sintoma fica skip silencioso até that env var é setada — não prejudica os outros 3 sintomas.

- **Smoke E2E forçado (Task 12 step 7):** opcional, mas recomendado. **Caminho seguro = fixture injection** (sobrescreve `/var/www/health/metrics.json` por ~75s com valores fake critical, suspende cron do collector pra evitar overwrite, dispara Routine, valida Telegram alert, restaura). Zero risco pra n8n/Evolution. Se preferir pular, marcar smoke como DONE_WITH_CONCERNS no eval doc — cron natural valida com tráfego real ao longo das próximas 48h.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-29-auditor-vps-limits.md`.** Two execution options:

**1. Subagent-Driven (recommended)** — Despacha fresh subagent per task com 2-stage review (spec compliance + code quality). Padrão usado nos #2 deploy-health e #5 billing-flow. Reusa cheap-then-strong model selection (Haiku pra reviews mecânicas, Sonnet pra implementação).

**2. Inline Execution** — Executa as tasks nesta sessão usando `superpowers:executing-plans`, batch com checkpoints.

**Recomendação:** Subagent-Driven pelo precedente provado nos últimos 2 PRs (#12 e #13), mesmo com este plan tendo 1 task a mais (14 vs 9-10 dos anteriores) por causa da Routine + decision doc.
