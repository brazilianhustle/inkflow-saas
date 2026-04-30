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
- **Hosting:** novo container `inkflow-health-1` (nginx:alpine, ~10MB) adicionado ao stack `/opt/inkflow/docker-compose.yml`. Volume mount `/var/www/health` → `/usr/share/nginx/html` (read-only). Exposto via Traefik labels com `Host(${N8N_DOMAIN}) && PathPrefix(/_health)` priority 100. Cert Let's Encrypt + DNS reaproveitados (Traefik gerencia automaticamente).
- **Auth:** Header `X-Health-Token` validado pelo nginx dentro do container (`/opt/inkflow/health-nginx.conf` mounted como `/etc/nginx/conf.d/default.conf`). Valor literal substituído via `sed` durante setup. `VPS_HEALTH_TOKEN` cadastrado em CF Pages env (lado consumer) e `/opt/inkflow/.env` (lado VPS, lido pelo Docker Compose).

## Alternativas avaliadas

### A. SSH via Routine Bash (rejeitado)

- **Como funcionaria:** Routine Anthropic faz `ssh root@<vps> "free -m && df -h /"` direto, parsea output.
- **Por que NÃO:** Routines remotas não têm acesso à SSH key local do founder. Spec §5.3 cravou esse realismo operacional.

### B. API Vultr (rejeitado pra MVP)

- **Como funcionaria:** Routine usa `VULTR_API_KEY` no contexto chamando `GET /v2/instances/{id}` + `/bandwidth`.
- **Por que NÃO:** Vultr API não fornece RAM/disk usage live granular (só specs contratadas + bandwidth mensal). Bandwidth é útil pro Sintoma D (egress) mas insuficiente sozinho. Adiciona dependência (API key + rotação) sem cobrir RAM/disk.
- **Pós-MVP:** vale considerar HÍBRIDO — endpoint custom pra RAM/disk/CPU + Vultr API só pra egress (denominador `AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB` é estático mas live usage não vem do collector).

### C. Express/Node minimal app no VPS (rejeitado)

- **Como funcionaria:** mini-app Node escutando porta interna, exposto via `proxy_pass` do Traefik.
- **Por que NÃO:** adiciona dependência (Node install no host OU outro container Node, systemd unit ou gerenciamento de processo) por benefício marginal vs nginx static. Bash + container nginx é equivalente em capability sem deps de runtime adicionais.

### D. nginx no host (rejeitado — premissa errada do plano original)

- **Como funcionaria:** snippet em `/etc/nginx/snippets/` incluído no server block de `n8n.inkflowbrasil.com`.
- **Por que NÃO:** VPS não tem nginx no host (descoberto na pre-flight Task 1). Reverse proxy é Traefik containerizado. Tentar instalar nginx no host conflitaria com Traefik nas portas 80/443.

## Capability check (executado durante Task 2 do plano)

| Verificação | Resultado |
|---|---|
| `docker compose config --quiet` valida | ✅ |
| `docker compose up -d health` sobe container sem afetar outros | ✅ |
| Container `inkflow-health-1` `Up <X>s` | ✅ |
| `n8n.inkflowbrasil.com/` continua respondendo (não 404) | ✅ HTTP 200 |
| `evo.inkflowbrasil.com/` continua respondendo | ✅ HTTP 200 |
| Smoke positivo (`curl` com header válido) → 200 + JSON | ✅ |
| Smoke negativo (sem header) → 401 | ✅ |
| Smoke negativo (header errado) → 401 | ✅ |
| Routine Anthropic chama endpoint via `curl` (Task 12) | ⏳ Pendente Task 12 |

## Lições aprendidas durante Task 2

**🚨 `container_name` explícito quebra detecção Traefik.** Primeira tentativa usou `container_name: inkflow-health` no service. Container subiu, labels OK, network OK, healthcheck OK — mas Traefik **não registrava o router**. Todos os requests `/_health/*` em `n8n.inkflowbrasil.com` retornavam o body do n8n (router default).

**Diagnóstico:** Removi `container_name`, deixando Compose auto-nomear pra `inkflow-health-1`. Traefik passou a detectar normalmente. Causa-raiz não foi confirmada (talvez cache do Docker provider em entries antigas, talvez bug interaction com `traefik.enable=true`). Reproduzível.

**Aplicação futura:** evitar `container_name` em services novos com Traefik labels. evoadmin (pattern de referência) também não usa `container_name`. Se precisar nome estável (e.g., pra healthcheck externo), usar service name + `${COMPOSE_PROJECT_NAME}-<service>-1` convention.

**Outras lições:**

1. **Heredoc em SSH precisa cuidado** — primeira tentativa de criar bash collector via `ssh "cat > /usr/local/bin/script << EOF ..."` corrompeu aspas escape. Caminho confiável: criar local com `Write` + `scp`.
2. **Substituição de placeholder via sed** funciona se o placeholder for único e não tiver caracteres especiais. `VPS_HEALTH_TOKEN_PLACEHOLDER` → token de 64 hex chars: OK.
3. **Compose sem `services:` declarado em modificação** funciona se inserir bloco antes de `volumes:`. YAML respeita indentação 2-space (consistente com pattern do stack).

## Limitações conhecidas

1. **Latência de coleta até 1min** — bash collector roda a cada 1min via cron. Métrica pode estar até 60s desatualizada quando endpoint serve. Aceitável pra cadence 6h do auditor (0.027% drift máximo).
2. **Backups não cobertos** — Vultr panel é única fonte de verdade pra estado dos backups. Auditor não tenta. Check manual periódico fica como gap pós-MVP em `auditores.md`.
3. **Egress mensal opt-in** — depende de `AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB` env var (denominador). Valor cravado em `limits.md` 2026-04-29: 5290 GB (pool Vultr). Sintoma D ativa quando founder cadastrar env. Pattern espelha key-expiry Camada 3.
4. **Egress live não coletado pelo bash** — `egress_month_gb` não aparece no JSON. Ativação completa do Sintoma D requer extensão futura: ou (a) collector chama Vultr API, ou (b) endpoint CF Pages busca egress separadamente. Pós-MVP.

## Pós-MVP (TODOs registrados)

- [ ] Salvar `VPS_HEALTH_TOKEN` em BWS (followup §"P3 Salvar secrets" no backlog).
- [ ] Considerar híbrido endpoint+Vultr API quando egress ficar relevante (primeiro tenant pagante).
- [ ] Avaliar coleta sub-1min (systemd timer) se latência virar problema.
- [ ] Investigar causa-raiz do bug `container_name` + Traefik (reproduzir em ambiente isolado).
