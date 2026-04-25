---
last_reviewed: 2026-04-26
owner: leandro
status: stable
related: [README.md, ../stack.md, restore-backup.md]
---
# Runbook — Supabase indisponível

Banco principal fora do ar. Endpoints CF Pages que dependem dele (quase todos `/api/*`) retornam 5xx. Project alvo: `bfzuxxuscyplfoimvomh` (`https://bfzuxxuscyplfoimvomh.supabase.co`).

## Sintomas

- Endpoints `/api/create-subscription`, `/api/update-tenant`, `/api/mp-ipn`, `/api/get-tenant` retornando 500/503 simultaneamente
- Telegram alert do auditor `billing-flow-health` (Sub-projeto 3) reportando spike de erros
- Reclamações simultâneas: "site não funciona", "não consigo logar"
- Bot WhatsApp parado (workflow n8n falha em queries de `bot_state`/`conversas`)
- Logs CF Pages com `ECONNREFUSED`, `fetch failed`, ou `5xx upstream` apontando pro hostname Supabase

## Pré-requisitos

- [ ] Acesso ao Supabase dashboard (Bitwarden item `supabase`)
- [ ] Acesso ao Cloudflare dashboard (Bitwarden item `cloudflare`)
- [ ] `wrangler` autenticado pra checar logs CF Pages
- [ ] Bitwarden item `vultr` (Evolution VPS — não é afetado por Supabase down, fica como canal de comunicação degradado)

## Diagnóstico

### 1. Supabase status page reporta incidente?

Acessar https://status.supabase.com.

Se houver incidente em "Database" / "REST API" / "Auth" da região correspondente: **aguardar resolução upstream** + comunicar usuários (ver Ação A).

### 2. Project específico responde?

```bash
SUPABASE_ANON_KEY="<anon key>"  # CF Pages env ou Bitwarden

curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  https://bfzuxxuscyplfoimvomh.supabase.co/rest/v1/
# Esperado: 200
# 5xx persistente = project caiu (raro, geralmente zona específica)
# Timeout = network entre CF e Supabase
```

```bash
# Endpoint Auth também responde?
curl -s -o /dev/null -w "%{http_code}\n" \
  https://bfzuxxuscyplfoimvomh.supabase.co/auth/v1/health
# Esperado: 200 com {"name":"GoTrue", ...}
```

### 3. Logs CF Pages — qual erro exato?

```bash
wrangler pages deployment tail --project-name=inkflow-saas \
  | grep -iE "supabase|fetch failed|ECONNREFUSED|ETIMEDOUT" \
  | head -30
```

Padrões:
- `fetch failed` / `ECONNREFUSED` → project ou network
- `connection pool exhausted` → conexões vazadas (Ação B)
- `permission denied` ou `42501` → RLS quebrou (regressão de migration)
- `relation does not exist` → migration revertida ou tabela dropada

### 4. Pool de conexões saturado?

Supabase dashboard → **Database** → **Connections** (gráfico em tempo real).

Se conexões batendo no limite do plano: **Ação B**.

## Ação A — Status page mostra incidente Supabase

1. **Aguardar.** Supabase historicamente resolve incidentes em <2h (consultar histórico em status.supabase.com).
2. **Comunicar usuários** afetados:
   - Telegram founder: `[degraded] Supabase incidente upstream. Site retornando 5xx. ETA: aguardando.`
   - Se outage prolongado (>30 min): considerar Modo Manutenção (ver seção abaixo).
3. **NÃO tentar fixes próprios.** Root cause é fora do nosso controle. Mexer pode piorar (ex: criar branch que não promove depois).
4. **Monitorar** status.supabase.com a cada 10 min até resolver.

## Ação B — Project respondendo, mas queries falham (pool ou RLS)

### Pool exhausted

```bash
# Supabase dashboard → Database → Connections → ver gráfico
# Se >80% do limite: identificar query lenta
```

Supabase dashboard → **Logs** → **Postgres logs** → filtrar por queries `slow` ou `idle in transaction`.

Mitigação:
- **Kill query travada:** dashboard → Database → Roles → encontrar PID e `pg_terminate_backend(<pid>)`.
- **Restart pooler:** dashboard → Database → Pooler config → restart (causa downtime de ~30s).
- **Causa-raiz comum:** loop em código que abre conexão e não fecha. Verificar último deploy.

### Migration buggy revertendo schema

```bash
# Logs CF Pages mostrando "relation does not exist" → tabela some
# Ou "permission denied for table X" → RLS quebrou
```

Decisão:
- **Se migration foi aplicada manualmente** (Supabase MCP `apply_migration`): reverter via SQL no dashboard.
- **Se migration veio de PR**: revert do commit + redeploy.
- **Se irrecuperável via SQL:** ir pra `restore-backup.md`.

## Ação C — Network entre CF e Supabase

Raríssimo. Se acontecer:

1. Verificar Cloudflare status (https://www.cloudflarestatus.com).
2. Tentar deploy minor pra forçar recreate de connections / isolates:
   ```bash
   git commit --allow-empty -m "chore: redeploy pra reforçar conexões"
   git push origin main
   ```
3. Se persiste: abrir ticket Supabase + Cloudflare simultaneamente.

## Modo manutenção (se outage > 1h prevista)

Deploy temporário de página estática avisando manutenção. Usuários não veem 5xx feio.

⚠️ **Operação reversível mas chata.** Só fazer se outage for confirmado >1h.

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas

# Branch separada pra não poluir main
git checkout -b maint/supabase-outage

# Substituir index com página de manutenção
cat > index.html <<'HTML'
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>InkFlow — Manutenção</title></head>
<body style="font-family: sans-serif; text-align: center; padding: 4rem;">
  <h1>InkFlow — manutenção breve</h1>
  <p>Estamos resolvendo um problema com nosso provedor de banco. Voltamos em alguns minutos.</p>
  <p>Bot do WhatsApp pode estar lento ou indisponível.</p>
</body>
</html>
HTML

# Direct Upload (não via GHA pra ser rápido)
npx wrangler pages deploy . --project-name=inkflow-saas --commit-dirty=true
```

⚠️ **REVERTER quando Supabase voltar:**

```bash
git checkout main
git branch -D maint/supabase-outage
git commit --allow-empty -m "chore: redeploy pos-manutencao"
git push origin main  # GHA redeploya state correto
```

## Verificação

```bash
# 1. Project Supabase responde
curl -s -o /dev/null -w "%{http_code}\n" -H "apikey: $SUPABASE_ANON_KEY" \
  https://bfzuxxuscyplfoimvomh.supabase.co/rest/v1/
# Esperado: 200

# 2. Auth endpoint responde
curl -s -o /dev/null -w "%{http_code}\n" \
  https://bfzuxxuscyplfoimvomh.supabase.co/auth/v1/health
# Esperado: 200

# 3. Endpoint app crítico funciona
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://inkflowbrasil.com/api/public-start \
  -H "content-type: application/json" -d '{"plano":"trial"}'
# Esperado: 200 com {key, url}

# 4. Logs CF Pages limpos
wrangler pages deployment tail --project-name=inkflow-saas | head -20
# Não deve ter erros novos relacionados a Supabase
```

## Critério de "resolvido"

- ✅ HTTP 200 do Supabase REST + Auth
- ✅ Endpoint `/api/public-start` retorna sucesso
- ✅ Logs CF Pages limpos por 10 minutos consecutivos
- ✅ Bot WhatsApp respondendo (workflow n8n não falhando)
- ✅ Se modo manutenção foi ativado: revertido com sucesso

## Pós-incidente

- [ ] Nota incidente: `incident_inkflow_<YYYY-MM-DD>_db-indisponivel.md` com causa-raiz, duração, ações tomadas.
- [ ] Atualizar `[[InkFlow — Painel]]` seção 🐛 Bugs / Incidentes.
- [ ] Telegram: `[supabase-resolved] DB normalizado. Causa: <upstream/pool/migration>. Duração: <X>.`
- [ ] Avaliar:
   - Outage longa (>1h): vale ter banco secundário pra leituras críticas (read replica)?
   - Pool exhausted: revisar código que está vazando conexões.
   - Migration buggy: adicionar smoke test obrigatório pré-merge tocando schema.
- [ ] Se houve perda/corrupção de dados: ver `restore-backup.md`.
