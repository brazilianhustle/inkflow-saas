---
last_reviewed: 2026-04-26
owner: leandro
status: stable
related: [README.md, ../stack.md, ../methodology/matrix.md, ../methodology/incident-response.md, ../secrets.md, rollback.md]
---
# Runbook — Telegram bot down

Bot Telegram (`TELEGRAM_BOT_TOKEN`) é canal de alerts operacionais E approval pra heurística #4 (Safety/destrutivo). Quando para de responder ou retorna erro, esse runbook restaura o bot E disponibiliza Pushover como fallback de approval enquanto o conserto está em andamento.

## Sintomas

- Agent reporta erro 4xx/5xx ao chamar `/sendMessage`
- Founder não vê alertas regulares (cron, deploy, auditor) por >1h
- Logs CF Pages/Worker: `telegram fetch failed` / `401 Unauthorized` / `429 Too Many Requests`
- `curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe` retorna `ok=false`
- Agent reporta "aguardando approval Telegram há >10 min sem resposta" (cruza com timeout policy da `methodology/matrix.md` heurística #4)

## Pré-requisitos

- [ ] `TELEGRAM_BOT_TOKEN` (Bitwarden item `inkflow-telegram`)
- [ ] `PUSHOVER_USER_KEY` + `PUSHOVER_APP_TOKEN` (Bitwarden item `inkflow-pushover`)
- [ ] BotFather access (Telegram pessoal do founder)
- [ ] `wrangler` autenticado (CF Pages secrets + Worker secrets)
- [ ] Bitwarden CLI ou app desktop
- [ ] Acesso ao admin panel (Supabase Auth login) pra checar `approvals` table se Pushover foi acionado

## ⚠️ Decisão inicial (gate)

**Tem destrutivo P0 BLOQUEADO esperando approval?**

→ **Sim** — pular pra **Ação 0** (Pushover) IMEDIATAMENTE. Diagnóstico em paralelo (delegar / fazer depois).
→ **Não** — Diagnóstico normal sem urgência.

Razão: cenário "agent travado em P0" é assimétrico — desbloquear vem antes de consertar bot.

## Diagnóstico (decision tree, ordem)

1. **`getMe` responde?** (Telegram-the-service vivo)
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" \
     "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"
   ```
   - Timeout / `0` / DNS fail → **Ação D** (Telegram service down OU rede CF↔Telegram cortada)
   - `200` → seguir #2

2. **`getMe.ok == true`?** (token válido)
   ```bash
   curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe" | jq '.ok'
   ```
   - `false` ou `401` → **Ação A** (token revogado / inválido)
   - `true` → seguir #3

3. **`sendMessage` retorna `429`?** (rate limit)
   ```bash
   curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
     -d "chat_id=$TELEGRAM_CHAT_ID" \
     -d "text=runbook tg-bot-down: teste de envio" | jq '.'
   ```
   - `429` com `retry_after` no body → **Ação E** (rate limit)
   - Continuar

4. **`sendMessage` retorna `400 "chat not found"`?**
   - Sim → **Ação C** (chat_id inválido)
   - Não → seguir #5

5. **Tudo aparenta OK mas msgs não chegam ou comportamento errado?**
   - **Ação B** (env desync — catch-all)

## Ação 0 — Pushover fallback (P0 destrutivo bloqueado)

Disparar approval via Pushover priority=2 (acorda founder, bypassa modo silêncio).

**Passo 1:** Inserir row em `approvals`:

```sql
-- Via Supabase dashboard ou MCP execute_sql
INSERT INTO approvals (request_payload, severity, expires_at)
VALUES (
  '{"action":"<descrição>","details":{<contexto>}}'::jsonb,
  'P0',  -- ou P1/P2 conforme severity
  now() + interval '15 minutes'  -- 15min P0, 2h P1, 24h P2
)
RETURNING id;
```

Anotar o `id` retornado.

**Passo 2:** Disparar Pushover com URL deep-link:

```bash
PUSHOVER_USER_KEY="..."  # do Bitwarden inkflow-pushover
PUSHOVER_APP_TOKEN="..."  # do Bitwarden inkflow-pushover
APPROVAL_ID="<id-da-row-acima>"
DETAILS="<descrição curta da ação destrutiva, ex: 'drop column tenants.legacy_field'>"

curl -s -F "token=$PUSHOVER_APP_TOKEN" \
     -F "user=$PUSHOVER_USER_KEY" \
     -F "priority=2" \
     -F "retry=60" \
     -F "expire=1800" \
     -F "sound=siren" \
     -F "title=APPROVAL P0 — destrutivo bloqueado" \
     -F "message=$DETAILS — tap pra revisar e decidir" \
     -F "url=https://inkflowbrasil.com/admin.html#approvals/$APPROVAL_ID" \
     -F "url_title=Aprovar / Rejeitar" \
     https://api.pushover.net/1/messages.json
```

Parâmetros `retry=60 expire=1800`: priority=2 sem retry/expire **não acorda founder de verdade**. Esses valores fazem Pushover repetir push a cada 60s por até 30 min.

Founder recebe → toca URL → admin panel (login Supabase Auth) → revisa `request_payload` → ✅ ou ❌. Endpoint POST muta `approvals.status`.

**Passo 3:** Polling do agent (ou Leandro fazendo manual via SQL):

```sql
SELECT status, approved_at, approved_by, notes
FROM approvals
WHERE id = '<APPROVAL_ID>';
```

**Polling interval por severity:**

| Severity | Polling interval | Timeout total |
|---|---|---|
| P0 | 5s | 15 min |
| P1 | 30s | 2 h |
| P2 | 2 min | 24 h |

Se `now() > expires_at` sem decisão: marcar `status='expired'` e **abortar** a operação destrutiva. Sem 2º fallback.

```sql
-- Opcional: cron de expiry sweep (pra futuro Sub-projeto 3)
UPDATE approvals SET status='expired' WHERE status='pending' AND expires_at < now();
```

## Ação A — Token revogado / inválido (`getMe` retorna 401)

Causas: BotFather revogou (manual ou compromise detectado), token foi rotated mas env não atualizado.

```bash
# 1. Confirmar no BotFather
# Telegram pessoal → @BotFather → /mybots → InkFlow → API Token → "Revoke current token"
# (ou usar token existente se ainda ativo no BotFather)

# 2. Pegar novo token + atualizar Bitwarden
# Bitwarden item `inkflow-telegram` → editar → salvar novo valor

# 3. Atualizar CF Pages env
echo "<novo-token>" | wrangler pages secret put TELEGRAM_BOT_TOKEN --project-name=inkflow-saas

# 4. Atualizar Worker env (cron-worker)
echo "<novo-token>" | wrangler secret put TELEGRAM_BOT_TOKEN

# 5. Trigger redeploy CF Pages (secret novo só vale após reload)
git commit --allow-empty -m "chore: redeploy pra pegar novo TELEGRAM_BOT_TOKEN"
git push origin main

# 6. Verificar
sleep 60  # esperar deploy CF Pages
curl -s "https://api.telegram.org/bot<novo-token>/getMe" | jq '.ok'
# Esperado: true
```

## Ação B — Env desync entre CF Pages e Worker

Sintoma: msgs falham aleatoriamente OU funcionam de um lugar e não de outro. Causa típica: rotation parcial (rotacionou em CF Pages mas esqueceu Worker, ou vice-versa).

```bash
# 1. Listar secrets de ambos
wrangler pages secret list --project-name=inkflow-saas | grep TELEGRAM_BOT_TOKEN
wrangler secret list | grep TELEGRAM_BOT_TOKEN

# (wrangler não mostra o VALOR, só nome+timestamp. Comparar timestamps:
#  se CF Pages mostra "updated 5d ago" e Worker mostra "updated 30d ago", há drift)

# 2. Identificar valor canônico (Bitwarden é fonte da verdade)
# 3. Sobrescrever em ambos (mesmo valor)
echo "<valor-canonico>" | wrangler pages secret put TELEGRAM_BOT_TOKEN --project-name=inkflow-saas
echo "<valor-canonico>" | wrangler secret put TELEGRAM_BOT_TOKEN

# 4. Redeploy CF Pages
git commit --allow-empty -m "chore: redeploy resync TELEGRAM_BOT_TOKEN"
git push origin main

# 5. Verificar com sendMessage de ambos contextos
# (CF Pages e Worker disparam alertas distintos no curso normal — ver chegando ambos)
```

## Ação C — `chat_id` inválido (`sendMessage` retorna `400 "chat not found"`)

Causas raras: chat foi deletado, bot foi removido do canal, ou `TELEGRAM_CHAT_ID` env tem typo após rotation.

```bash
# 1. Pegar chat_id correto via getUpdates
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates" | \
  jq '.result[].message.chat.id' | sort -u
# Comparar com TELEGRAM_CHAT_ID env atual

# 2. Se diferente: atualizar
echo "<chat_id-correto>" | wrangler pages secret put TELEGRAM_CHAT_ID --project-name=inkflow-saas
echo "<chat_id-correto>" | wrangler secret put TELEGRAM_CHAT_ID

# 3. Redeploy + verificar com sendMessage
```

Se `getUpdates` retorna vazio: bot perdeu acesso ao chat. Founder precisa adicionar bot ao chat manualmente (Telegram → grupo → adicionar membro → @InkFlowBot).

## Ação D — Telegram-the-service down

Confirmar que é externo, não nosso:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.telegram.org/
# 200 esperado fora de outage
```

Verificar:
- [downdetector.com/status/telegram](https://downdetector.com/status/telegram)
- [status.telegram.org](https://status.telegram.org) (raramente atualizado, mas existe)
- Twitter `@telegram` ou `@durov` se outage anunciado

**Sem ação técnica nossa.** Pushover assume todos os alertas críticos enquanto durar (incluindo approvals via Ação 0). Re-checar a cada 30 min.

Quando voltar: validar com `getMe` + `sendMessage` teste antes de declarar resolvido.

## Ação E — Rate limit (`429 Too Many Requests`)

Cenário: cron com bug spamou 1000 msgs, ou loop infinito disparou alertas. Bot pega `429` com `Retry-After` em segundos.

```bash
# 1. Identificar a fonte do flood
wrangler pages deployment tail --project-name=inkflow-saas | grep -iE "telegram|sendMessage" | head -50
wrangler tail | grep -iE "telegram|sendMessage" | head -50

# 2. Throttle / disable a fonte
# - se for cron específico: pausar via wrangler trigger pause OU comentar binding
# - se for endpoint: deploy de hotfix com circuit breaker
# - se for n8n workflow: desativar workflow via dashboard

# 3. Esperar Retry-After
# Body do 429 traz parameters.retry_after em segundos (geralmente 5-30s pra burst pequeno, até horas pra abuso massivo)
RETRY_AFTER="<valor do response>"
sleep $RETRY_AFTER

# 4. Recuperar mensagens críticas perdidas (se houver)
# Verificar logs do cron-worker / CF Pages no período do flood — se algum alerta operacional crítico (incident, billing) ficou sem entrega, redisparar manualmente:
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d "chat_id=$TELEGRAM_CHAT_ID" \
  -d "text=[backfill] $MENSAGEM_CRITICA"
```

Pós-flood: investigar causa-raiz no commit / workflow / cron. Adicionar throttle ou rate limit local antes de re-enable.

## Verificação

```bash
# 1. getMe ok
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe" | jq '.ok'
# Esperado: true

# 2. sendMessage teste
curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d "chat_id=$TELEGRAM_CHAT_ID" \
  -d "text=runbook telegram-bot-down: resolved"
# Esperado: 200 + msg chega no chat

# 3. CF Pages e Worker em sync
wrangler pages secret list --project-name=inkflow-saas | grep TELEGRAM
wrangler secret list | grep TELEGRAM
# Timestamps próximos (mesma rotation)

# 4. Pushover continua funcionando como backup (curl teste pra não enferrujar)
curl -s -F "token=$PUSHOVER_APP_TOKEN" \
     -F "user=$PUSHOVER_USER_KEY" \
     -F "priority=0" \
     -F "title=Pushover health check" \
     -F "message=ok" \
     https://api.pushover.net/1/messages.json | jq '.status'
# Esperado: 1
```

## Critério de "resolvido"

- ✅ Bot entrega msg de teste E msg real subsequente (alerta operacional natural chegando)
- ✅ Founder confirma recebimento
- ✅ Sem alertas novos de "fetch failed" / "401" nos logs por 30 min
- ✅ Valor de `TELEGRAM_BOT_TOKEN` em CF Pages **idêntico** ao do Worker (`wrangler pages secret list` + `wrangler secret list` comparados — timestamps próximos indicam sync recente)
- ✅ Se Ação 0 foi acionada: row em `approvals` com status final (approved/rejected/expired) — operação destrutiva resolvida ou abortada explicitamente

## Pós-incidente

- [ ] Nota incidente: `incident_inkflow_<YYYY-MM-DD>_telegram-bot-down.md` (causa-raiz, duração, ação aplicada, se Pushover foi usado).
- [ ] Atualizar `[[InkFlow — Painel]]` seção 🐛 Bugs / Incidentes.
- [ ] Telegram (quando voltar): `[telegram-bot-resolved] causa: <breve>. Duração: <X>. Pushover: <usado / não usado>.`
- [ ] **Atualizar `methodology/matrix.md` heurística #4 `last_reviewed`** se houve aprendizado que mudou o protocolo (cross-link bidirecional cravado).
- [ ] Se causa-raiz é env desync (Ação B): avaliar adicionar audit cron pra detectar drift CF↔Worker (vai pro backlog P2 — `auditor secret-drift`).
- [ ] Se causa-raiz é token rotation falha (Ação A): avaliar TTL formal + cron de rotação preventiva.
- [ ] Se Pushover foi acionado: **contar uso**. Mais de 2x/trimestre = sinal pra abrir spec separado formalizando 2º alt channel.
- [ ] Se Ação E (rate limit): registrar fonte do flood + adicionar throttle local na causa-raiz antes de re-enable.
