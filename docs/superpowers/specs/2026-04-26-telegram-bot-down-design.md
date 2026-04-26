---
slug: telegram-bot-down
status: aprovado
created: 2026-04-26
sub_projeto_pai: 1
related:
  - docs/canonical/runbooks/README.md
  - docs/canonical/methodology/matrix.md
  - docs/canonical/methodology/incident-response.md
  - docs/canonical/secrets.md
---

# Spec — Runbook `telegram-bot-down.md` + Pushover como alt channel formalizado

> **Escopo:** runbook preventivo + canal alternativo de approval (Pushover) + infra mínima de aprovação assíncrona (`approvals` table) + cross-link bidirecional na heurística #4 da matrix.

## 1. Contexto

A heurística #4 do `docs/canonical/methodology/matrix.md` (Safety/destrutivo) exige aprovação humana via Telegram pra qualquer operação destrutiva (drop column aplicada, force push, `wrangler delete`, etc.). Hoje o fallback se Telegram falhar é vago: "aguardar founder via canal habitual".

Esse gap é P0 no `[[InkFlow — Pendências (backlog)]]` porque a primeira vez que um agent (Sub-projeto 2) precisar de approval em P0 e o bot Telegram tiver erro técnico (token revogado, env desync, BotFather banido), ele fica travado sem caminho deterministico — agent abort silencioso é inaceitável; agent autoriza sem aprovação é violação da heurística #4.

Bot Telegram alvo: `TELEGRAM_BOT_TOKEN` configurado em **CF Pages env** + **Worker env** (replicados); chat alvo `TELEGRAM_CHAT_ID`; API base `https://api.telegram.org`. Documentado em `docs/canonical/stack.md` §171+.

## 2. Não-objetivos

Fora de escopo:

- **Wiring automático de Pushover em CF Worker / cron-worker.** Fica pra Sub-projeto 2 (subagents). Hoje uso é manual via curl no runbook.
- **Replicação de `PUSHOVER_*` em CF Pages env / Worker env.** Mesma razão. TODO marcado em `secrets.md`.
- **Auditor cron pra detectar drift `TELEGRAM_BOT_TOKEN` CF↔Worker.** Sub-projeto 3 (auditores). Vai pro backlog P2 separado.
- **2º alt channel se Pushover também falhar.** Default determinístico: abort + log + retry manual. Só formalizar 2º alt se ocorrer >2x/trimestre — aí virar spec separado.
- **UI rica no admin panel** (filtros, search, histórico de approvals). V1 mínima: render payload JSON + 2 botões.
- **Cobertura do cenário "founder unreachable"** (celular sem internet, dormindo). Tratado como **policy** na matrix #4 (timeout total → abort), não como modo de falha do runbook.

## 3. Princípios

1. **Pushover é trigger + ponteiro, não payload.** Notificação contém URL pro admin panel onde founder vê o pedido completo. Resposta volta via tabela `approvals` no Supabase.
2. **Determinismo sobre criatividade.** Se ambos canais falham, fluxo é abort + log. Não inventar 3º canal ad-hoc.
3. **Doctrine primeiro, código depois.** Esse spec define o protocolo manual; agents do Sub-projeto 2 vão consumir o mesmo protocolo via código.
4. **Single source of truth pros tempos.** Timeouts P0/P1/P2 saem do `incident-response.md §6.2`; runbook e matrix #4 referenciam, não redefinem.
5. **Reusar auth existente.** Endpoint admin valida `studio_token` (pattern já usado), não inventar JWT/cookie próprios.

## 4. Entregáveis (4 internos)

| # | Entregável | Tipo | Checkpoint testável |
|---|---|---|---|
| 1 | Pushover setup + `secrets.md` | doc + Bitwarden | curl manual com `priority=2` dispara push notif no celular do founder |
| 2 | Tabela `approvals` + endpoint + UI admin | código | insert SQL → curl GET retorna página → POST muta → polling SQL vê mudança |
| 3 | `runbooks/telegram-bot-down.md` + entrada no `runbooks/README.md` | doc | dry-run textual de cada Ação (0/A/B/C/D/E) com decision tree resolvendo |
| 4 | `matrix.md` #4 fix + `last_reviewed: 2026-04-26` | doc | diff bate com spec, sem dangling references |

## 5. Componente — Pushover setup + `secrets.md`

### 5.1 Pré-trabalho do founder (one-time, antes do PR)

1. Criar conta em [pushover.net](https://pushover.net/).
2. Pagar **$5 one-time** pelo app iOS/Android no device pessoal (Leandro).
3. Criar application `InkFlow Alerts` no dashboard Pushover → copiar `APP_TOKEN`.
4. Copiar `USER_KEY` do perfil pessoal.
5. Criar item Bitwarden `inkflow-pushover` com ambos os secrets + URL do dashboard.
6. Curl de teste validador (executar antes de implementar):

   ```bash
   curl -s -F "token=$PUSHOVER_APP_TOKEN" \
        -F "user=$PUSHOVER_USER_KEY" \
        -F "priority=1" \
        -F "title=InkFlow Pushover test" \
        -F "message=setup OK" \
        https://api.pushover.net/1/messages.json
   ```

   Esperado: `{"status":1,"request":"..."}` + push notification chega no celular em <10s.

### 5.2 Atualização do `secrets.md`

**Tabela §32 — adicionar 2 linhas após `TELEGRAM_CHAT_ID`:**

```
| `PUSHOVER_APP_TOKEN` | Bitwarden `inkflow-pushover` | sem expiry | leandro | alta |
| `PUSHOVER_USER_KEY` | Bitwarden `inkflow-pushover` | sem expiry | leandro | alta |
```

Severidade `alta` (não `crítica`) — vazamento permite social engineering ("✅ aprovo drop tenants" falso) mas não dá acesso direto a sistemas. Match com `MP_WEBHOOK_SECRET`.

**Seção §81+ — nova entrada após "Telegram (alertas)":**

```markdown
### Pushover (alt channel emergência)
- `PUSHOVER_APP_TOKEN` — token da application "InkFlow Alerts" criada no dashboard Pushover.
- `PUSHOVER_USER_KEY` — user key do founder (Leandro). Único por device/conta.
- Uso: ver `runbooks/telegram-bot-down.md` Ação 0.
- **NÃO replicado em CF Pages env / Worker env nesse momento** — fica em Bitwarden até Sub-projeto 2 wirar agents (manual via curl no runbook até lá).
- **TODO Sub-projeto 2:** quando agents forem implementados em CF Worker, replicar `PUSHOVER_APP_TOKEN` + `PUSHOVER_USER_KEY` em CF Pages env + Worker env (`wrangler pages secret put` + `wrangler secret put`). Hoje uso é manual via curl no runbook, então só Bitwarden basta.
- **Procedure de rotação:** se vazar, regenerar `APP_TOKEN` no dashboard Pushover (`USER_KEY` é estável por conta). Atualizar Bitwarden.
```

## 6. Componente — Tabela `approvals` + endpoint + UI admin

### 6.1 Migration

```sql
CREATE TABLE approvals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_payload jsonb NOT NULL,
  severity    text NOT NULL CHECK (severity IN ('P0','P1','P2')),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  expires_at  timestamptz NOT NULL,
  approved_at timestamptz,
  approved_by text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX approvals_status_idx ON approvals (status) WHERE status = 'pending';
CREATE INDEX approvals_expires_at_idx ON approvals (expires_at) WHERE status = 'pending';
```

`request_payload` é jsonb pra permitir qualquer estrutura (drop column, force push, deploy rollback, etc.). Validação de schema fica no agent que insere, não no DB.

### 6.2 Endpoint `GET /api/admin/approvals/:id`

- Auth: validar `studio_token` (header `Authorization: Bearer <token>` OU query `?studio_token=<token>` — confirmar pattern exato durante `/plan` lendo admin existente).
- 401 se ausente/inválido.
- 200 → renderiza HTML simples: `<h1>Approval P0</h1><pre>{request_payload pretty}</pre><button>✅ Aprovar</button><button>❌ Rejeitar</button>` + status atual.
- Se já decidido (status != pending): mostrar histórico, sem botões.

### 6.3 Endpoint `POST /api/admin/approvals/:id`

- Mesma auth.
- Body: `{action: 'approve' | 'reject', notes?: string}`.
- Atomicidade: `UPDATE approvals SET status=$1, approved_at=now(), approved_by=$2, notes=$3 WHERE id=$4 AND status='pending'`.
  - Se `0 rows affected` → conflito (já decidido / expirado). Retornar 409.
- `approved_by` = email mapeado do `studio_token`. Se admin tem mapeamento token→email, usar; senão registrar hash do token (8 primeiros chars) pra audit.

### 6.4 UI mínima

V1 é uma página HTML auto-suficiente (sem React/build step). Renderizada server-side pelo endpoint GET. Botões fazem POST via fetch JS inline. Loading / success / error states inline.

Pattern de referência: confirmar durante `/plan` se admin existente já tem páginas server-side simples ou se é tudo SPA. Adaptar.

### 6.5 Polling do agent

Tabela severity → polling interval (também documentada em runbook + matrix #4):

| Severity | Polling interval | Timeout total |
|---|---|---|
| P0 | 5s | 15 min |
| P1 | 30s | 2 h |
| P2 | 2 min | 24 h |

Polling stops quando status != pending **ou** `now() > expires_at` (cron do agent ou loop do código). Se expira, agent marca `status='expired'` (atomic UPDATE) e aborta operação.

## 7. Componente — `runbooks/telegram-bot-down.md`

### 7.1 Estrutura completa

```
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
- [ ] Acesso ao admin panel (`studio_token`) pra checar `approvals` table se Pushover foi acionado

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

```bash
PUSHOVER_USER_KEY="..."
PUSHOVER_APP_TOKEN="..."
APPROVAL_ID="<uuid da row inserida em approvals>"
DETAILS="<descrição curta da ação destrutiva, ex: 'drop column tenants.legacy_field'>"

curl -s -F "token=$PUSHOVER_APP_TOKEN" \
     -F "user=$PUSHOVER_USER_KEY" \
     -F "priority=2" \
     -F "retry=60" \
     -F "expire=1800" \
     -F "sound=siren" \
     -F "title=APPROVAL P0 — destrutivo bloqueado" \
     -F "message=$DETAILS — tap pra revisar e decidir" \
     -F "url=https://inkflowbrasil.com/admin/approvals/$APPROVAL_ID" \
     -F "url_title=Aprovar / Rejeitar" \
     https://api.pushover.net/1/messages.json
```

Parâmetros `retry=60 expire=1800`: priority=2 sem retry/expire **não acorda founder de verdade**. Esses valores fazem Pushover repetir push a cada 60s por até 30 min.

Founder recebe → toca URL → admin panel → revisa `request_payload` → ✅ ou ❌. Endpoint POST muta `approvals.status`.

Agent (ou Leandro fazendo manual) faz polling do row por ID conforme tabela severity → vê status change → prossegue ou aborta.

**Polling interval por severity:**

| Severity | Polling interval | Timeout total |
|---|---|---|
| P0 | 5s | 15 min |
| P1 | 30s | 2 h |
| P2 | 2 min | 24 h |

Se `now() > expires_at` sem decisão: agent marca `status='expired'` e **aborta** a operação destrutiva. Sem 2º fallback.

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
```

### 7.2 Atualização do `runbooks/README.md`

Adicionar entrada na tabela §15:

```
| `telegram-bot-down.md` | Telegram bot off / approval bloqueado | critical (se P0 ativo) | 15-30 min |
```

`last_reviewed: 2026-04-26`.

## 8. Componente — `matrix.md` heurística #4 fix

### 8.1 Substituição do parágrafo "Fallback se Telegram indisponível..."

Texto atual (linhas 24-25 do arquivo):

> **Fallback se Telegram indisponível ou sem resposta:** abortar a operação. **Nunca** timeout silencioso autorizando destrutivo. Em P0 com Telegram down, preferir caminhos não-destrutivos (`runbooks/rollback.md` é recuperação, não destrutivo). Se destrutivo for inevitável e Telegram down: aguardar founder via canal habitual (não há canal alternativo formalizado hoje — gap registrado em §11 do spec como pré-trabalho do runbook `telegram-bot-down.md`).

Texto novo:

```markdown
**Fallback se Telegram indisponível ou sem resposta:** ver `../runbooks/telegram-bot-down.md` Ação 0. Resumo:

- **Trigger:** Telegram API retornou erro **OU** msg aceita mas zero resposta do founder em 10 min.
- **Canal alt:** Pushover (priority=2, retry=60, expire=1800, sound=siren).
- **Mecanismo de retorno:** tabela `approvals` no Supabase + admin panel `/admin/approvals/:id` linkado no Pushover. Agent faz polling.
- **Polling interval por severity** (alinhado com `incident-response.md §6.2`):

  | Severity | Polling interval | Timeout total |
  |---|---|---|
  | P0 | 5s | 15 min |
  | P1 | 30s | 2 h |
  | P2 | 2 min | 24 h |

- **Default se Pushover também falhar (ambos canais sem resposta em `expires_at`):** abort destrutivo automático. Operação fica registrada em log com payload completo pra retry manual quando founder ficar disponível. **Não inventar 3º canal ad-hoc** — fluxo é deterministicamente "abort". Se ocorrer >2x/trimestre, abrir spec separado pra formalizar 2º alt channel.
- **Não** timeout silencioso autorizando destrutivo. Se nem canal primário nem alt respondem em `expires_at`, **default = abort**.
```

### 8.2 Frontmatter

Atualizar `last_reviewed: 2026-04-26` no frontmatter do `matrix.md`.

## 9. Sequência de implementação

```
1. Pushover setup           → pré-trabalho one-time, sem código
   ├─ Conta Pushover criada, $5 pago, app instalado
   ├─ App "InkFlow Alerts" criada → APP_TOKEN obtido
   ├─ USER_KEY anotado
   ├─ Bitwarden item `inkflow-pushover` criado com ambos
   └─ secrets.md atualizado (tabela §32 + seção §81+)
   ✅ Checkpoint: curl manual com priority=2 dispara push notif no celular do founder.

2. Approvals infra          → migration + endpoint + UI admin
   ├─ Migration: CREATE TABLE approvals (...)
   ├─ Endpoint GET /api/admin/approvals/:id → renderiza página com payload + botões
   ├─ Endpoint POST /api/admin/approvals/:id → muta status, registra approved_at/by
   ├─ Auth: validar studio_token (pattern existente)
   └─ UI mínima: payload JSON pretty + ✅/❌ + success/error state
   ✅ Checkpoint: insert row manual via SQL → curl GET retorna página → POST muta → polling SQL vê mudança.

3. Runbook telegram-bot-down.md  → consome 1+2
   ├─ Estrutura completa (Sintomas / Pré-req / Decisão inicial / Diagnóstico / Ações 0/A/B/C/D/E / Verificação / Critério / Pós-incidente)
   ├─ Curl Pushover completo com retry/expire/sound
   ├─ Polling instructions com tabela severity → interval
   ├─ runbooks/README.md atualizado: nova entrada na tabela
   └─ Cross-references: matrix.md #4, secrets.md Pushover, stack.md Telegram, approvals migration
   ✅ Checkpoint: dry-run textual de cada Ação (A-E + 0) com decision tree resolvendo.

4. matrix.md #4 fix         → cross-link bidirecional
   ├─ Substituir parágrafo "Fallback se Telegram indisponível..." pelo novo texto da §8.1
   ├─ Adicionar tabela polling interval por severity
   └─ last_reviewed: 2026-04-26
   ✅ Checkpoint: diff bate com spec, sem dangling references.
```

## 10. Estratégia de PR

**Default: PR único squashed** — match com precedente do Sub-projeto 5 (`bb2828d`).

Razões pra manter unitário:
- Cross-links bidirecionais (matrix → runbook → secrets) ficam consistentes na hora do merge. Splitar arrisca janela onde matrix referencia runbook que ainda não tá em main.
- 1 review final, mais rápido.
- Coesão semântica: tudo cobre um único conceito.

**Escape hatch:** durante o `/plan`, se Deliverable 2 (approvals infra) passar de **300 linhas** de código novo (migration + endpoint + UI + auth + testes), splitar em 2 PRs:

- **PR-1:** Pushover setup + approvals infra (deliverables 1+2)
- **PR-2:** Runbook + matrix.md #4 (deliverables 3+4) — depende do PR-1 mergeado

Estimativa preliminar D2: 270-400 LoC. Borderline. Decisão fica pro `/plan` que tem visibilidade real do código admin existente.

## 11. Cross-references

Spec final consome / referencia / atualiza:

- `docs/canonical/methodology/matrix.md` heurística #4 (atualizado em D4)
- `docs/canonical/methodology/incident-response.md` §6.2 (timeouts source-of-truth — só leitura)
- `docs/canonical/secrets.md` (atualizado em D1: Pushover row + procedure rotação)
- `docs/canonical/stack.md` §171+ Telegram (referenciado no runbook — só leitura)
- `docs/canonical/runbooks/README.md` (atualizado em D3: nova entrada na tabela)
- Migration nova `approvals` em `supabase/migrations/` (D2)
- `[[InkFlow — Pendências (backlog)]]` seção P0 telegram-bot-down (mover pra "✅ feito" pós-merge)
- `[[InkFlow — Painel]]` (atualizar pós-merge)

## 12. Pré-trabalho do founder (antes do PR)

Bloqueante pra D1 começar. Estimativa: 15-20 min total.

1. ☐ Criar conta em pushover.net
2. ☐ Pagar $5 no app iOS/Android (one-time)
3. ☐ Instalar app no celular pessoal
4. ☐ Criar application "InkFlow Alerts" no dashboard → copiar `APP_TOKEN`
5. ☐ Copiar `USER_KEY` do perfil
6. ☐ Criar item Bitwarden `inkflow-pushover` (TOKEN + USER_KEY + URL dashboard)
7. ☐ Curl de teste validador (§5.1 fim) → push notif chegou em <10s

Quando os 7 itens estiverem ✅, sinalizar pro `/plan` que D1 pode iniciar.

## 13. Riscos e mitigações

- **Pushover-down simultâneo com Telegram-down:** baixa probabilidade (infraestruturas independentes). Se ocorrer, default abort — coberto em §8.1. Se >2x/trimestre, formalizar 2º alt em spec separado.
- **`studio_token` comprometido permite aprovar destrutivo falso:** mesmo risco que admin existente — mitigação é rotação periódica do token (já em `secrets.md` procedure). Não introduz risco novo.
- **Polling de 5s em P0 com timeout 15min = 180 queries no Supabase:** carga negligível (<0.5% do free tier). Sem mitigação adicional necessária.
- **Founder ignora Pushover na primeira vez (notif fadiga):** priority=2 com retry=60 expire=1800 + sound=siren maximiza chance. Se ainda for ignorado: timeout total → abort, log com payload pra retry manual. Aceitável.
- **`approvals.expires_at` chega antes do agent fazer polling final:** cron racionalizado — agent polla com interval menor que `expires_at - now()`. Atomicidade no UPDATE garante que mesmo race entre agent e cron de expiry não corrompe estado (CHECK constraint + WHERE status='pending').
