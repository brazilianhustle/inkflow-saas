---
last_reviewed: 2026-04-26
owner: leandro
status: stable
related: [README.md, ../secrets.md, ../methodology/incident-response.md, ../methodology/matrix.md, rollback.md, telegram-bot-down.md]
---
# Runbook — Secret expirado / autenticação silenciosamente quebrada

Secrets podem **expirar** (TTL — `CLOUDFLARE_API_TOKEN` tem 90d) ou **perder permissions** sem alerta. Falhas costumam ser silenciosas: cron parou, deploy não saiu, mas sem notif. Esse runbook detecta qual secret quebrou, rotaciona, propaga em todas as réplicas e fecha o loop. Caso canônico que motivou esse runbook: CF API Token sem permission `Cloudflare Pages: Edit` causou 5 deploys GHA falhando por 24h em 2026-04-25/26 (`secrets.md` §Cloudflare Histórico de incidents).

## Sintomas

- Cron / GHA workflow falhando há **>2h sem causa óbvia** em commit recente
- Logs com `Authentication error`, `401 Unauthorized`, `403 Forbidden`, `Token invalid`, `API token has expired`
- **Deploy silent**: commits chegam em main mas mudança não aparece em prod
- Cliente reclama "dado não atualiza após eu salvar" (write paths quebrados)
- MCP que dependia de credential começa a falhar com timeout/auth
- `getMe` / `/me` / `/user/tokens/verify` self-check de algum serviço retorna falha
- Telegram alert do auditor `secret-rotation` (Sub-projeto 3 — quando ativar)

## Pré-requisitos

- [ ] Bitwarden CLI ou app desktop autenticado
- [ ] Acesso ao dashboard de cada serviço afetado (CF, MP, Supabase, Pushover, OpenAI, Telegram, Evolution)
- [ ] `gh` CLI autenticado (`gh auth status`)
- [ ] `wrangler` autenticado pra editar CF Pages env / Worker env
- [ ] Acesso aos logs: `wrangler pages deployment tail`, `wrangler tail`, n8n dashboard

## Diagnóstico (qual secret quebrou)

### 1. Identifica o erro nos logs

Mapeia mensagem → secret provável:

| Erro nos logs | Secret provável | Self-check |
|---|---|---|
| `Authentication error [code: 10000]` em `/accounts/.../pages/...` | `CF_API_TOKEN` (GHA, sem Pages perm) | curl `/user/tokens/verify` |
| `Authentication error` em outras CF APIs | `CLOUDFLARE_API_TOKEN` (master) | curl `/user/tokens/verify` |
| `Mercado Pago: invalid_token` / `401 unauthorized` em `/api/mp-ipn` | `MP_ACCESS_TOKEN` | curl `/users/me` |
| `Telegram fetch failed` / `getMe ok=false` / `401` | `TELEGRAM_BOT_TOKEN` | curl `/getMe` |
| `OpenAI 401: Invalid API key` | `OPENAI_API_KEY` | curl `/v1/models` |
| `Pushover: token invalid` (`status:0`) | `PUSHOVER_APP_TOKEN` | dispatch test message |
| `Supabase 401: JWT expired` ou `Invalid API key` | `SUPABASE_SERVICE_ROLE_KEY` ou anon | curl `/rest/v1/` |
| `Evolution: x-api-key invalid` | `EVO_GLOBAL_KEY` | curl `/instance/fetchInstances` |
| GHA workflow conclusion `failure` em `Deploy to Cloudflare Pages` | `CF_API_TOKEN` | `gh run view --log-failed` |

### 2. Self-check rápido (após identificar o serviço)

Substituir variáveis pelo valor do Bitwarden item canônico. **Não usa `Read` em `~/.zshrc`** (per `methodology/matrix.md` heurística #5).

```bash
# CF API token (geral OU dedicado Pages — testar ambos)
curl -s -H "Authorization: Bearer <TOKEN>" \
  "https://api.cloudflare.com/client/v4/user/tokens/verify" | jq '{success, status: .result.status}'
# Esperado: {"success": true, "status": "active"}

# Telegram bot
curl -s "https://api.telegram.org/bot<TOKEN>/getMe" | jq '.ok'
# Esperado: true

# MP access token
curl -s -H "Authorization: Bearer <TOKEN>" \
  "https://api.mercadopago.com/users/me" | jq '.id // .message'
# Esperado: ID numérico (não "invalid_token")

# OpenAI
curl -s -H "Authorization: Bearer <TOKEN>" \
  "https://api.openai.com/v1/models" | jq '.data | length // .error.message'
# Esperado: número (>0)

# Pushover (precisa APP_TOKEN + USER_KEY)
curl -s -F "token=<APP_TOKEN>" -F "user=<USER_KEY>" \
  -F "priority=0" -F "title=health" -F "message=ok" \
  https://api.pushover.net/1/messages.json | jq '.status'
# Esperado: 1

# Supabase service role
curl -s -H "apikey: <KEY>" -H "Authorization: Bearer <KEY>" \
  "https://bfzuxxuscyplfoimvomh.supabase.co/rest/v1/tenants?select=id&limit=1" \
  -w "\nHTTP: %{http_code}\n" | tail -3
# Esperado: HTTP 200 + array JSON

# Evolution
curl -s -H "apikey: <EVO_GLOBAL_KEY>" \
  "https://evo.inkflowbrasil.com/instance/fetchInstances" -w "\nHTTP: %{http_code}\n" | tail -3
# Esperado: HTTP 200 + array (não 401)
```

### 3. Detectar GHA silent failures (caso especial)

Cenário validado: workflow falha repetidamente sem ninguém perceber.

```bash
# Últimos 5 runs do deploy
gh run list --repo brazilianhustle/inkflow-saas --workflow="Deploy to Cloudflare Pages" --limit 5 \
  --json databaseId,conclusion,createdAt,headSha

# Se vir múltiplos `failure` em sequência → secret quebrado
# Pega o erro do mais recente
gh run view <databaseId> --log-failed --repo brazilianhustle/inkflow-saas | \
  grep -iE "(error|✘|denied|401|403|authentication)" | head -10
```

### 4. Compare timestamps de rotação

Última rotation conhecida: ver `secrets.md` seção "Histórico de rotação / Histórico de incidents" do secret. Se rotation > TTL (90d pro CF, sem expiry oficial pros outros mas vale rotacionar a cada 6 meses), provável trigger.

## Ação A — Rotacionar secret tradicional (TTL ou vazamento)

Caminho geral:

1. **Identificar source canônica** — campo "Onde mora" da tabela em `secrets.md` §32 (Bitwarden item específico).
2. **Gerar novo valor no dashboard do serviço:**
   - CF: `dash.cloudflare.com/profile/api-tokens` → `Roll` (mantém permissions) OU `Create Token` (define permissions novas)
   - MP: `mercadopago.com/developers/credentials`
   - Telegram: `@BotFather` → `/token` → revoke + new
   - OpenAI: `platform.openai.com/api-keys`
   - Pushover: `pushover.net/apps/edit/<id>` → checkbox "Regenerate Token" → Save
   - Supabase: `supabase.com/dashboard/.../settings/api` (cuidado: rotacionar service_role afeta MUITO)
3. **Atualizar Bitwarden** com novo valor (timestamp `last modified` documenta a rotation).
4. **Atualizar TODAS as réplicas** — secrets propagados em múltiplos lugares. Lista de propagação por secret:

| Secret | CF Pages env | Worker env | GHA Secret | `~/.zshrc`/Keychain |
|---|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | ✅ | — | — |
| `MP_ACCESS_TOKEN` | ✅ | — | — | — |
| `MP_WEBHOOK_SECRET` | ✅ | — | — | — |
| `EVO_GLOBAL_KEY` | ✅ | — | — | — |
| `OPENAI_API_KEY` | ✅ | — | — | ✅ (dev local) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | — | ✅ (scripts) |
| `CRON_SECRET` | ✅ | ✅ | — | — |
| `STUDIO_TOKEN_SECRET` | ✅ | — | — | — |
| `CLOUDFLARE_API_TOKEN` (master) | — | — | — | ✅ (Bitwarden + Keychain) |
| `CF_API_TOKEN` (GHA Pages dedicado) | — | — | ✅ | — |
| `PUSHOVER_APP_TOKEN` | — (futuro Sub-projeto 2) | — | — | — |

```bash
# CF Pages env
echo "<NOVO_VALOR>" | wrangler pages secret put NOME_DA_VAR --project-name=inkflow-saas

# Worker env (cron-worker)
echo "<NOVO_VALOR>" | wrangler secret put NOME_DA_VAR

# GitHub Secrets
gh secret set NOME_DA_VAR --repo brazilianhustle/inkflow-saas

# Keychain (macOS)
security delete-generic-password -s NOME_DA_VAR 2>/dev/null
security add-generic-password -s NOME_DA_VAR -a "$USER" -w
```

5. **Trigger redeploy** — CF Pages secret só vale após reload do isolate. Force commit vazio:

```bash
git commit --allow-empty -m "chore: redeploy pra pegar novo NOME_DA_VAR"
git push origin main
```

6. **Aguardar deploy** (1-2min) e rodar self-check do passo 2.

### Per-secret — procedures canônicos

Pra casos com procedure documentada, seguir as seções específicas de `secrets.md`:

- `MP_ACCESS_TOKEN` — `secrets.md` §Procedure de rotação > "Rotacionar `MP_ACCESS_TOKEN`"
- `TELEGRAM_BOT_TOKEN` — `secrets.md` §Procedure de rotação + `runbooks/telegram-bot-down.md` Ação A
- `EVO_GLOBAL_KEY` — `secrets.md` §Procedure de rotação > "Rotacionar `EVO_GLOBAL_KEY`" (envolve restart Evolution VPS — janela de risco 2-5min)
- `CLOUDFLARE_API_TOKEN` — `secrets.md` §Procedure de rotação > "Rotacionar `CLOUDFLARE_API_TOKEN`"
- `STUDIO_TOKEN_SECRET` — invalida sessões de TODOS os tenants ativos (cuidado: customer impact)

Pra secrets sem procedure dedicada (OpenAI, Pushover, Supabase keys): seguir o caminho geral acima.

### Pareamento: `CLOUDFLARE_API_TOKEN` ↔ `CLOUDFLARE_API_TOKEN_EXPIRES_AT`

Auditor `key-expiry` (Layer 1 TTL — `functions/_lib/auditors/key-expiry.js`) lê a env var **`CLOUDFLARE_API_TOKEN_EXPIRES_AT`** (formato ISO 8601, ex: `2026-07-26T00:00:00Z`) pra calcular `days_until_expiry` e disparar `warn` (≤14d) ou `critical` (≤6d). Sem essa env, Layer 1 fica em "skip" e auditor perde a única defesa pré-falha contra expiração silenciosa.

**Toda vez que rotacionar `CLOUDFLARE_API_TOKEN`:**

1. Após criar o token novo no CF dashboard, anotar o TTL escolhido (default 90d).
2. Calcular ISO date da expiração e atualizar a env var:
   ```bash
   # Exemplo: token criado hoje com TTL 90d
   EXPIRES=$(date -u -v+90d +%FT%TZ 2>/dev/null || date -u -d '+90 days' +%FT%TZ)
   printf %s "$EXPIRES" | npx wrangler pages secret put CLOUDFLARE_API_TOKEN_EXPIRES_AT --project-name=inkflow-saas
   ```
3. Empty commit + push pra disparar redeploy CF Pages (env edit não dispara redeploy automático — Bug B doctrine):
   ```bash
   git commit --allow-empty -m "chore: refresh CLOUDFLARE_API_TOKEN_EXPIRES_AT pós-rotação"
   git push origin main
   ```
4. Próximo run do `audit-key-expiry` (cron `0 6 * * *`) já roda com TTL fresh.

**Se o token foi criado **sem** TTL** (token "perpétuo"): considerar definir uma data de revisão arbitrária (ex: 1 ano) e setar `CLOUDFLARE_API_TOKEN_EXPIRES_AT=<+365d>`. Caso contrário, Layer 1 fica skip e auditor depende só de Layer 2 (self-check) — que detecta key inválida mas só **depois** de quebrar.

## Ação B — Token rolled mas permissions ruins (caso especial)

Cenário validado em 2026-04-26: token rotacionado via "Roll" no CF dashboard MAS deploys continuaram falhando porque o token original **nunca teve** `Cloudflare Pages: Edit` permission. Roll preserva permissions, não consegue mudar.

```bash
# Se Roll não resolveu o auth error:
# 1. CF dashboard → API Tokens → Create Token
# 2. Use template adequado:
#    - Pages deploy → "Edit Cloudflare Workers" (inclui Pages: Edit)
#    - Workers KV/R2/D1 → "Edit Cloudflare Workers"
#    - DNS → "Edit zone DNS"
#    - Ou Custom Token com permissions explícitas
# 3. Permissions essenciais por uso:
#    - GHA Pages deploy: Account → Cloudflare Pages → Edit
#                        Account → Account Settings → Read
#                        User → User Details → Read
# 4. Account Resources: Include → All accounts (ou específica)
# 5. Continue → Create Token → COPIA (só aparece uma vez)
# 6. Atualizar GitHub Secret `CF_API_TOKEN` com o novo valor
# 7. (Opcional) Revogar o token antigo "rolled" se não for usado em outro lugar
# 8. Re-rodar workflow falho:
gh run rerun <last-failed-id> --repo brazilianhustle/inkflow-saas
```

**Evitar repetir esse erro:** documentar em `secrets.md` qual permission cada token precisa. Não assumir que master cobre tudo — Pages especificamente fica de fora do default "Cloudflare Workers" template em algumas contas.

## Ação C — Vazamento (rotação forçada)

Se secret foi exposto (commit acidental, transcript, screenshot, log público):

1. **Revogar imediatamente na fonte** (regenerate antes de qualquer outra coisa).
2. Seguir Ação A normal (gerar novo, propagar).
3. **Investigar escopo do vazamento**:
   - `git filter-repo` ou BFG no histórico se foi pushed
   - Logs do serviço pra atividade não-autorizada no período
   - Se o token vazou junto com outro (ex: APP_TOKEN + USER_KEY do Pushover), avaliar se o segundo também precisa rotacionar — geralmente NÃO se sozinho não é exploitable.
4. **Documentar em `secrets.md` Histórico** com causa: "vazado em `<onde>` em `<DATA>`, escopo: `<o que era exploitable>`".

## Verificação

```bash
# 1. Self-check do serviço retorna OK (passo 2 do Diagnóstico)

# 2. Próxima execução cron / GHA passa
gh run list --repo brazilianhustle/inkflow-saas --limit 1 \
  --json conclusion,name,databaseId

# 3. CF Pages env e Worker env em sync (timestamps próximos)
wrangler pages secret list --project-name=inkflow-saas | grep <NOME>
wrangler secret list | grep <NOME>
# Esperado: timestamps próximos = mesma rotation

# 4. Bitwarden tem o novo valor (last modified recente)

# 5. Sem 401/403 nos logs por 30 min após rotation
wrangler pages deployment tail --project-name=inkflow-saas | grep -iE "401|403|auth"
```

## Critério de "resolvido"

- ✅ Self-check do serviço afetado retorna OK (validation API call passa)
- ✅ Próximo trigger natural (cron, deploy, webhook) executa sem erro
- ✅ Sem novos 401/403 nos logs por 30 min
- ✅ Bitwarden atualizado com `last modified` recente
- ✅ Todas as réplicas (CF env, Worker env, GitHub Secrets, Keychain) batem com Bitwarden — verificável via `wrangler ... list` timestamps + `gh secret list`
- ✅ `secrets.md` "Histórico de rotação" do secret atualizado com data + causa

## Pós-incidente

- [ ] Atualizar `secrets.md` seção "Histórico de rotação" / "Histórico de incidents" do secret afetado: data, causa-raiz, duração silenciosa.
- [ ] Nota incidente: `incident_inkflow_<YYYY-MM-DD>_secret-expired-<service>.md` (causa, duração silenciosa, impacto financeiro/operacional, lições).
- [ ] Atualizar `[[InkFlow — Painel]]` seção 🐛 Bugs / Incidentes.
- [ ] Telegram (se voltou): `[secret-rotated] <NOME> rotacionado. Causa: <breve>. Duração silenciosa: <X>.`
- [ ] **Avaliar adição do auditor `secret-rotation`** (Sub-projeto 3) — cron diário que faz self-check de cada secret listado em `secrets.md` e alerta:
  - 30d antes do TTL conhecido (`CLOUDFLARE_API_TOKEN` 90d → alerta dia 60)
  - Imediato se self-check retorna falha
  - Telegram + Pushover (já que Telegram pode ser o que falhou)
- [ ] **Se causa-raiz é GHA failing silently:** considerar workflow GHA `health-check.yml` que após N runs consecutivos failed dispara alerta Telegram. Sub-projeto 3 backlog.
- [ ] **Se causa-raiz é "permissions diferentes do master":** documentar em `secrets.md` qual permission cada secret precisa explicitamente (ex: `CF_API_TOKEN` → "Account → Cloudflare Pages → Edit").
- [ ] **Se rotation foi por vazamento:** investigar fonte do vazamento + considerar invalidar tokens adjacentes que coexistiam no canal vazado.
- [ ] Se >24h de duração silenciosa: P0 backlog item pra implementar detecção automática.

## Anti-padrões observados

1. **Roll de token preserva permissions.** Token original sem permission X continua sem permission X após Roll (só o valor muda). Pra mudar permissions: criar token novo, não rolar.
2. **GHA workflow failing silently.** Sem health-check externo, deploys parados podem passar dias sem ser percebidos. Adicionar webhook Telegram OU branch protection que bloqueia merge se workflow critical tá em failure state.
3. **"Master token" assumido cobrindo tudo.** Tokens super-permissivos podem não incluir produtos novos da plataforma (ex: Cloudflare Pages adicionado depois do template "Cloudflare Workers" existir). Preferir tokens dedicados por uso quando blast radius justifica.
4. **Rotation parcial.** Atualizou Bitwarden mas esqueceu CF Pages env (ou vice-versa) → 401 intermitente. Sempre seguir checklist completo da Ação A passo 4.
5. **Self-check ausente.** Após rotation, não validar com `getMe`/`/me`/`/verify` API calls = correr risco de descobrir falha só no próximo cron natural (horas depois).
