---
last_reviewed: 2026-04-25
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
