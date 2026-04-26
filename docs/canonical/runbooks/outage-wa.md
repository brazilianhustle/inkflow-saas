---
last_reviewed: 2026-04-26
owner: leandro
status: stable
related: [README.md, ../stack.md, ../flows.md]
---
# Runbook — Outage WhatsApp (Evolution API)

Quando mensagens WhatsApp param de fluir — não enviam, não recebem, ou QR não gera. Stack alvo: Evolution API rodando no VPS Vultr (`https://evo.inkflowbrasil.com`).

## Sintomas

- Telegram alert do cron `monitor-whatsapp` (formato `[outage] Tenant X — instância Y desconectada`)
- Cliente reclama: "bot não respondeu" ou "WhatsApp não conectou"
- `/api/evo-status` retornando 5xx ou `state != "open"`
- Endpoints `/api/evo-create-instance` ou `/api/evo-qr` retornando erros
- `tenants.whatsapp_status='disconnected'` em vários registros simultaneamente (sintoma de Evo down vs. instância individual)

## Pré-requisitos

- [ ] SSH access ao Vultr Evolution VPS (Bitwarden item `vultr` — host + chave)
- [ ] `EVO_GLOBAL_KEY` (Bitwarden item `inkflow-evo-global` ou env CF Pages)
- [ ] `wrangler` autenticado pra checar logs CF Pages
- [ ] Telegram pra avisar founder ou tenants afetados

## Diagnóstico

### 1. Evolution server tá vivo?

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://evo.inkflowbrasil.com/
# Esperado: 200, 401 ou 404 (server respondendo)
# Se timeout / 5xx persistente: server caído → Ação A
```

### 2. Instância específica afetada vs. todas?

```bash
EVO_KEY="<EVO_GLOBAL_KEY do Bitwarden>"

# Lista todas instâncias (admin)
curl -s "https://evo.inkflowbrasil.com/instance/fetchInstances" \
  -H "apikey: $EVO_KEY" | jq '.[] | {name: .instance.instanceName, state: .instance.state}'

# Status de uma específica (ex: central, ou tenant-<prefix>)
INSTANCE="central"
curl -s "https://evo.inkflowbrasil.com/instance/connectionState/$INSTANCE" \
  -H "apikey: $EVO_KEY" | jq '.state'
# "open" = OK
# "close" = desconectada → Ação B
# "connecting" = reconectando, aguardar 30s
```

Se 1 instância desconectada e resto OK: **Ação B** (instância individual).
Se todas desconectadas mas server respondendo: provável `EVO_GLOBAL_KEY` revogado ou DB do Evo travado → **Ação D**.

### 3. Recursos do VPS?

```bash
ssh root@<vultr-evolution-vps> "free -m && df -h && uptime && systemctl status evolution-api | head -10"
# RAM cheia, disco cheio, ou load alto → Ação C
```

### 4. Logs recentes do CF Pages mostram erros chamando Evo?

```bash
wrangler pages deployment tail --project-name=inkflow-saas | grep -iE "evo|evolution" | head -30
```

Padrões úteis:
- `EVOLUTION_GLOBAL_KEY ausente` → secret CF Pages perdido (raro)
- `fetch failed` ou `ECONNREFUSED` → server Evo não responde
- `401 Unauthorized` → key revogada

## Ação A — Server Evolution caiu

```bash
ssh root@<vultr-evolution-vps>

# Status do serviço
systemctl status evolution-api

# Restart
systemctl restart evolution-api

# Aguardar 30s e verificar
sleep 30
systemctl status evolution-api
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/  # ajustar porta real
```

Se não subir, ver logs:
```bash
journalctl -u evolution-api -n 100 --no-pager
```

Causas comuns que aparecem nos logs:
- `EADDRINUSE` → outro processo na porta. `lsof -i :8080` e matar.
- `database connection failed` → Postgres do Evo caiu. `systemctl status postgresql` e restart.
- `out of memory` → ver Ação C.

## Ação B — Instância individual desconectada

Tenta reconectar sem regenerar QR:

```bash
EVO_KEY="..."
INSTANCE="<nome-da-instancia>"

curl -X POST "https://evo.inkflowbrasil.com/instance/connect/$INSTANCE" \
  -H "apikey: $EVO_KEY"
```

Se response indica que precisa QR fresh:

```bash
curl "https://evo.inkflowbrasil.com/instance/connect/$INSTANCE" \
  -H "apikey: $EVO_KEY" | jq '.qrcode'
```

Se for instância de tenant (não `central`): avisar tenant via email/WA pessoal (ou outro número) pra escanear o QR de novo. O `studio panel` tem fluxo pra isso (`/api/evo-qr`).

## Ação C — Recursos do VPS exauridos

Decision tree:

**RAM cheia (>90%):**
```bash
ssh root@<vps> "systemctl restart evolution-api"  # libera RAM
# Investigar leak nos logs depois
ssh root@<vps> "ps aux --sort=-%mem | head -10"
```

**Disco cheio (>90%):**
```bash
ssh root@<vps>
du -h -d 1 /var | sort -h | tail -10
# Geralmente: /var/log/evolution-api/ ou diretório de mídia em /opt/evolution/

# Truncar logs antigos (não apaga arquivo, só zera)
truncate -s 10M /var/log/evolution-api/app.log

# Limpar mídia órfã (CUIDADO: validar antes)
# find /opt/evolution/media -type f -mtime +30 -size +1M -ls  # listar primeiro
```

**CPU sustentado >90%:**
```bash
top -b -n 1 | head -20
```
Identificar processo. Se for o próprio `evolution-api` consumindo CPU absurdo: pode ser loop de erro nos logs — `journalctl -u evolution-api -f`.

## Ação D — `EVO_GLOBAL_KEY` revogado ou DB Evo travado

**Sintoma:** todas instâncias retornam 401 ou 5xx, mas server responde no `/`.

**Validar key:**
```bash
curl -s -w "%{http_code}\n" "https://evo.inkflowbrasil.com/instance/fetchInstances" \
  -H "apikey: $EVO_KEY"
# 200 = key OK
# 401 = key revogada → ver secrets.md procedure de rotação EVO_GLOBAL_KEY
```

**Se DB Evo travado (manager interno):**
```bash
ssh root@<vps>
systemctl status postgresql  # Postgres dedicado da Evo
# Se down: systemctl restart postgresql
# Se vivo mas com queries presas: usar EVO_DB_CLEANUP_URL via secrets.md
```

## Ação E — Diagnóstico de instância órfã (DB ≠ EVO)

**Quando:** alguma instância em `tenants.evo_instance` não retorna em `fetchInstances`, ou alguma instância em EVO não tem tenant correspondente.

**Comandos:**

> **Pré-requisito:** substituir `<EVO_GLOBAL_KEY>` pelo valor real (Bitwarden item `inkflow-evolution`, ou pedir via Telegram — NÃO ler `/opt/inkflow/.env` em plaintext, Safety #5).

### Listar todas as instâncias EVO
```bash
ssh root@104.207.145.47 'curl -sS "http://172.18.0.4:8080/instance/fetchInstances" -H "apikey: <EVO_GLOBAL_KEY>"' | python3 -m json.tool
```

### Status de uma instância específica
```bash
ssh root@104.207.145.47 'curl -sS "http://172.18.0.4:8080/instance/fetchInstances?instanceName=NAME" -H "apikey: <EVO_GLOBAL_KEY>"'
```

### Cross-reference DB vs EVO
Via Supabase MCP: `mcp__plugin_supabase_supabase__execute_sql`:
```sql
SELECT id, evo_instance FROM tenants WHERE evo_instance IS NOT NULL;
```

Compare a lista do DB com a do EVO. Diff aponta órfãs (em EVO sem tenant) ou referências quebradas (tenant aponta pra instância que não existe).

**Resolução:**
- Órfã em EVO sem tenant → candidata a delete via bridge (ver Ação F).
- Tenant com referência quebrada → ou recriar instância, ou clear `tenants.evo_instance` se tenant foi cancelado.

---

## Ação F — Reparação de webhook config

**Quando:** instância existe mas `webhookBase64=false` ou `events` não inclui `MESSAGES_UPSERT`. Sintoma: bot não recebe mídia, ou n8n não é acionado.

**Diagnóstico — verificar webhook + settings da instância:**

```bash
ssh root@104.207.145.47 'curl -sS "http://172.18.0.4:8080/webhook/find/NAME" -H "apikey: APIKEY_INSTANCIA"'
ssh root@104.207.145.47 'curl -sS "http://172.18.0.4:8080/settings/find/NAME" -H "apikey: APIKEY_INSTANCIA"'
```

**8 checks por instância:**
1. Existe na EVO (`fetchInstances` retorna)
2. `connectionStatus = open` (conectada ao WhatsApp)
3. `webhook.enabled = true`
4. `webhook.webhookBase64 = true` (crítico pra n8n receber mídia)
5. `webhook.events` inclui `MESSAGES_UPSERT` (sem isso, n8n não é acionado)
6. `webhook.url` aponta pro n8n certo (env `N8N_WEBHOOK_URL`)
7. `settings.groupsIgnore = true` (bot não responde grupos)
8. DB consistency: `tenants.evo_instance = instância_existe_em_EVO`

**Repair — Evolution v2.3.7 aceita 3 formatos no `POST /webhook/set/{name}`. Tenta na ordem:**

> **Antes de rodar:** substituir `NAME` (nome da instância), `APIKEY_INSTANCIA` (apikey da instância) e `<n8n-webhook-url>` (Bitwarden item `inkflow-evolution`, custom field `N8N_WEBHOOK_URL`, ou pedir via Telegram). NÃO ler `/opt/inkflow/.env` em plaintext (Safety #5). Os curls precisam rodar de dentro do VPS — `172.18.0.4` é IP da bridge Docker, inalcançável de fora.

```bash
# Formato 1 — nested short
ssh root@104.207.145.47 "curl -X POST 'http://172.18.0.4:8080/webhook/set/NAME' \
  -H 'apikey: APIKEY_INSTANCIA' \
  -H 'Content-Type: application/json' \
  -d '{\"webhook\": {\"enabled\": true, \"url\": \"<n8n-webhook-url>\", \"byEvents\": true, \"base64\": true, \"events\": [\"MESSAGES_UPSERT\"], \"headers\": {}}}'"

# Formato 2 — flat long (se 1 falhar)
ssh root@104.207.145.47 "curl -X POST 'http://172.18.0.4:8080/webhook/set/NAME' \
  -H 'apikey: APIKEY_INSTANCIA' \
  -H 'Content-Type: application/json' \
  -d '{\"enabled\": true, \"url\": \"<n8n-webhook-url>\", \"webhookByEvents\": true, \"webhookBase64\": true, \"events\": [\"MESSAGES_UPSERT\"], \"headers\": {}}'"

# Formato 3 — nested long (se 2 falhar)
ssh root@104.207.145.47 "curl -X POST 'http://172.18.0.4:8080/webhook/set/NAME' \
  -H 'apikey: APIKEY_INSTANCIA' \
  -H 'Content-Type: application/json' \
  -d '{\"webhook\": {\"enabled\": true, \"url\": \"<n8n-webhook-url>\", \"webhookByEvents\": true, \"webhookBase64\": true, \"events\": [\"MESSAGES_UPSERT\"], \"headers\": {}}}'"
```

Após cada tentativa, valide com `GET /webhook/find/NAME`. Se `webhookBase64` ainda false, tenta próximo formato.

---

## Ação G — Force reconnect de instância em estado inconsistente

**Quando:** instância em estado `ativo=close` mas `state=open` (ou vice-versa). Sintoma: comandos `DELETE /instance/logout/NAME` retornam `500 "Connection Closed"` e `DELETE /instance/delete/NAME` retornam `400 "[object Object]"`.

**Pré-validação:** confirma que é mesmo estado inconsistente:

```bash
ssh root@104.207.145.47 'curl -sS "http://172.18.0.4:8080/instance/connectionState/NAME" -H "apikey: <EVO_GLOBAL_KEY>"'
```

> `<EVO_GLOBAL_KEY>` via Bitwarden item `inkflow-evolution` (não ler `/opt/inkflow/.env` em plaintext — Safety #5).

Compara com `fetchInstances` — se `connectionStatus` ≠ `state`, é o caso.

**Solução — bridge DB cleanup (endpoint admin já deployado):**

```bash
curl -X POST "https://evo.inkflowbrasil.com/__admin__/cleanup" \
  -H "x-admin-secret: $EVO_DB_CLEANUP_SECRET" \
  -d '{"instance_name":"NAME"}'
```

`EVO_DB_CLEANUP_SECRET` está no Bitwarden (item `inkflow-evolution`, custom field `EVO_DB_CLEANUP_SECRET`). NÃO ler em plaintext do `/opt/inkflow/.env` — pedir ao founder via Telegram ou consultar Bitwarden.

**Pós-bridge:** verifica se instância foi removida com `fetchInstances`. Se sim, recriar normalmente via `/api/create-tenant` ou flow de onboarding.

---

## Verificação

```bash
# 1. Endpoint Evo responde
curl -s -o /dev/null -w "%{http_code}\n" https://evo.inkflowbrasil.com/

# 2. Instância central conectada
curl -s "https://evo.inkflowbrasil.com/instance/connectionState/central" \
  -H "apikey: $EVO_KEY" | jq '.state'
# Esperado: "open"

# 3. Mensagem teste (substituir <numero-teste>)
curl -X POST "https://evo.inkflowbrasil.com/message/sendText/central" \
  -H "apikey: $EVO_KEY" \
  -H "Content-Type: application/json" \
  -d '{"number":"<numero-teste>","text":"runbook outage-wa: teste de envio"}'

# 4. Próximos ciclos do monitor-whatsapp não disparam alertas
# (esperar 30-60 min ou disparar manual)
curl -X POST "https://inkflowbrasil.com/api/cron/monitor-whatsapp" \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Critério de "resolvido"

- ✅ Endpoint Evolution responde 200/401 (não 5xx ou timeout)
- ✅ Instâncias críticas com `state=open` (especialmente `central`)
- ✅ Mensagem teste enviada e recebida com sucesso
- ✅ Sem novos alertas Telegram do `monitor-whatsapp` nos próximos 15 minutos
- ✅ `tenants.whatsapp_status='open'` voltou pra >90% dos tenants ativos

## Pós-incidente

- [ ] Criar nota incidente no vault: `incident_inkflow_<YYYY-MM-DD>_outage-wa.md` com causa-raiz, duração, tenants afetados, lições.
- [ ] Atualizar `[[InkFlow — Painel]]` seção 🐛 Bugs / Incidentes.
- [ ] Telegram: `[outage-resolved] Evolution restored. Causa: <breve>. Duração: <X min>. Tenants afetados: <N>.`
- [ ] Se causa-raiz é recursos VPS: revisar `limits.md` thresholds (talvez warn está alto demais).
- [ ] Se causa-raiz é versão Evolution buggy: agendar update em janela controlada.
- [ ] Se houve necessidade de regenerar QR de muitos tenants: avaliar se vale alerta de "WA reconectado com sucesso" (auto-aviso ao tenant).
