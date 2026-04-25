---
last_reviewed: 2026-04-26
owner: leandro
status: stable
related: [stack.md, runbooks/rollback.md]
---
# Mapa Canônico — Secrets

> ⚠️ **Este arquivo lista APENAS NOMES de secrets e onde encontrar os valores. ZERO valores plaintext aqui.**
>
> Para obter o valor de qualquer secret, ir na fonte canônica indicada (Bitwarden, Keychain, CF Pages env, GitHub Secrets, Vultr). Agents devem usar MCP autenticado (Cloudflare/Supabase) ou pedir ao founder via Telegram.

Este arquivo casa com a regra `feedback_nunca_ler_arquivos_com_secrets_plaintext`: não ler `.env`, `~/.zshrc`, `--raw` outputs ou afins. Sempre passar por canal seguro.

---

## Tabela master

Todos os secrets referenciados em código (`functions/**` e `cron-worker/src/**`) cruzados com os configurados no projeto CF Pages e Worker.

| Nome | Fonte canônica | TTL | Owner | Severidade rotação |
|---|---|---|---|---|
| `SUPABASE_SERVICE_KEY` | Bitwarden + CF Pages env | sem expiry | leandro | crítica |
| `SUPABASE_SERVICE_ROLE_KEY` | Bitwarden + CF Pages env (alias do SERVICE_KEY — Task 2 detectou dual naming) | sem expiry | leandro | crítica |
| `MP_ACCESS_TOKEN` | Bitwarden item `inkflow-mp-prod` + CF Pages env | sem expiry MP | leandro | crítica |
| `MP_WEBHOOK_SECRET` | CF Pages env | n/a | leandro | alta |
| `EVO_GLOBAL_KEY` | Bitwarden + CF Pages env | sem expiry | leandro | crítica |
| `EVOLUTION_GLOBAL_KEY` | Bitwarden + CF Pages env (alias do EVO_GLOBAL_KEY — Task 2 detectou dual naming) | sem expiry | leandro | crítica |
| `EVO_CENTRAL_APIKEY` | Bitwarden + CF Pages env | sem expiry | leandro | alta |
| `EVO_DB_CLEANUP_SECRET` | CF Pages env | sem expiry | leandro | alta |
| `MAILERLITE_API_KEY` | Bitwarden + CF Pages env | sem expiry | leandro | alta |
| `TELEGRAM_BOT_TOKEN` | Bitwarden + CF Pages env + Worker env | sem expiry | leandro | crítica |
| `CRON_SECRET` | CF Pages env + Worker env (mesmo valor nas duas pontas) | sem expiry | leandro | alta |
| `CLEANUP_SECRET` | CF Pages env + Worker env | sem expiry | leandro | alta |
| `INKFLOW_TOOL_SECRET` | CF Pages env | sem expiry | leandro | alta |
| `STUDIO_TOKEN_SECRET` | CF Pages env | sem expiry | leandro | alta |
| `EVAL_SECRET` | CF Pages env | sem expiry | leandro | média |
| `N8N_WEBHOOK_SECRET` | Bitwarden + CF Pages env (compartilhado com workflows n8n; hoje desativados — backup) | sem expiry | leandro | média |
| `OPENAI_API_KEY` | Bitwarden + CF Pages env | sem expiry | leandro | crítica |
| `CLOUDFLARE_API_TOKEN` | Bitwarden item `cloudflare-agent-token` + GitHub Secrets + `~/.zshrc`/Keychain (uso local) | 90d | leandro | crítica |
| `CLOUDFLARE_ACCOUNT_ID` | Bitwarden + GitHub Secrets + `~/.zshrc` | sem expiry (não-secreto, mas tratado como confidencial) | leandro | baixa |

### Não-secrets (configs públicas / IDs / flags)

Aparecem como `env.X` no código mas **não são secrets**. Listados aqui para evitar confusão na hora de rotacionar — não precisam Bitwarden, não precisam rotação.

| Nome | Tipo | Onde mora |
|---|---|---|
| `AI` | binding nativo Workers AI | `wrangler.toml` |
| `ENABLE_TRIAL_V2` | feature flag (`true`/`false`) | CF Pages env |
| `EVO_BASE_URL` | URL pública do Evolution VPS | CF Pages env |
| `EVO_CENTRAL_INSTANCE` | nome da instância Evo (`central`) | CF Pages env |
| `EVO_DB_CLEANUP_URL` | URL pública do endpoint cleanup do Evo | CF Pages env |
| `MAILERLITE_GROUP_ID` / `..._CLIENTES_ATIVOS` / `..._TRIAL_ATIVO` / `..._TRIAL_EXPIROU` | IDs de grupos MailerLite | CF Pages env |
| `N8N_WEBHOOK_URL` | URL pública dos webhooks n8n | CF Pages env |
| `SITE_URL` | URL canônica (`https://inkflowbrasil.com`) | CF Pages env |
| `TELEGRAM_CHAT_ID` | chat ID numérico do canal de alertas | CF Pages env + Worker env |

---

## Por categoria

### Supabase
- `SUPABASE_SERVICE_KEY` — chave server-side (bypass RLS) usada por `functions/_lib/supa.js` e edge functions.
- `SUPABASE_SERVICE_ROLE_KEY` — alias do anterior; algumas funções referenciam um nome, outras o outro. Ver [stack.md → Supabase](stack.md) e [ids.md](ids.md) para o registro do dual naming.
- (Não há `SUPABASE_ANON_KEY` em uso server-side — frontend não chama Supabase direto; tudo passa pelos endpoints `/api/*`.)
- (Não há `SUPABASE_URL` como env var — está hardcoded como `https://bfzuxxuscyplfoimvomh.supabase.co` em vários endpoints; ver [ids.md](ids.md).)

### Mercado Pago
- `MP_ACCESS_TOKEN` — usado em `/api/create-subscription` para criar assinaturas.
- `MP_WEBHOOK_SECRET` — valida HMAC do webhook MP em `/api/mp-ipn`.

### Evolution API (WhatsApp VPS)
- `EVO_GLOBAL_KEY` / `EVOLUTION_GLOBAL_KEY` — chave global do Evolution server (Vultr VPS); usada em `/api/evo-*`.
- `EVO_CENTRAL_APIKEY` — apikey específica da instância `central` (instância de onboarding e de tools).
- `EVO_DB_CLEANUP_SECRET` — auth do endpoint de cleanup interno do Evolution.

### MailerLite
- `MAILERLITE_API_KEY` — chave de automação de emails (trial → ativo, expirou, etc.).

### Telegram (alertas)
- `TELEGRAM_BOT_TOKEN` — bot dedicado a alertas operacionais. Compartilhado entre CF Pages e Worker (mesmo valor).

### Cron / autenticação inter-serviço
- `CRON_SECRET` — header de auth dos endpoints `/api/cron/*`. **Crítico: tem que ser o mesmo valor em CF Pages e Worker.**
- `CLEANUP_SECRET` — auth do `/api/cleanup-tenants` (aceita `CRON_SECRET` como fallback).
- `INKFLOW_TOOL_SECRET` — auth dos endpoints `/api/tools/*` (chamados por agents/n8n).
- `STUDIO_TOKEN_SECRET` — assina tokens do studio dashboard.
- `N8N_WEBHOOK_SECRET` — auth dos webhooks vindos do n8n (workflows hoje desativados desde 21-22/04/2026; ficam como backup até ≥28/04).
- `EVAL_SECRET` — auth do endpoint `/api/eval-runner` (rodar evals em prod sob demanda).

### OpenAI / IA
- `OPENAI_API_KEY` — usado pelo agent runtime / evals.

### Cloudflare (admin / deploy)
- `CLOUDFLARE_API_TOKEN` — usado por `wrangler`, GHA deploy, `scripts/preflight-envvars.sh`, MCP Cloudflare. **Único token com TTL** (90d, política do dashboard CF). Nome no Bitwarden: `cloudflare-agent-token`.
- `CLOUDFLARE_ACCOUNT_ID` — ID da conta. Não é segredo de fato (vaza em URLs do dashboard) mas tratado como confidencial.

---

## Procedure de rotação

### Rotacionar `MP_ACCESS_TOKEN`

Severidade crítica. Vazamento permite criar/cancelar subscriptions em nome do tatuador.

```bash
# 1. Gerar novo no MP dashboard
#    https://www.mercadopago.com.br/developers/panel/app
#    → Aplicação → Credenciais de produção → Gerar novo Access Token
#    (NÃO revogar o antigo ainda — vamos fazer rollover)

# 2. Salvar no Bitwarden (NÃO copiar pra chat/log/screenshot)
bw edit item inkflow-mp-prod   # ou via app desktop, mais seguro

# 3. Atualizar CF Pages (apaga e recria — wrangler não tem update in-place)
cd ~/Documents/inkflow-saas
wrangler pages secret delete MP_ACCESS_TOKEN --project-name=inkflow-saas
wrangler pages secret put MP_ACCESS_TOKEN --project-name=inkflow-saas
# (cola o novo valor quando prompt — NÃO passa via flag, NÃO ecoa)

# 4. Forçar redeploy pra pegar o novo valor
git commit --allow-empty -m "chore: redeploy pra pegar novo MP_ACCESS_TOKEN"
git push origin main

# 5. Validar — criar uma subscription de teste e confirmar 200
curl -X POST https://inkflowbrasil.com/api/create-subscription \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":"<id-de-teste>","plano":"basic"}'

# 6. Revogar o antigo no dashboard MP (só DEPOIS de validar o novo)
#    Aplicação → Credenciais → ⋯ → Revogar token anterior
```

### Rotacionar `CLOUDFLARE_API_TOKEN`

Severidade crítica. **Único secret com TTL fixo (90d)**. Calendar reminder a cada 75 dias.

```bash
# 1. Criar novo token no CF dashboard
#    https://dash.cloudflare.com/profile/api-tokens → Create Token
#    Template: "Cloudflare Pages:Edit" + adicionar permissão Workers Scripts:Edit
#    Account Resources: incluir <CLOUDFLARE_ACCOUNT_ID> (ver ids.md)
#    TTL: 90 dias
#    Nome sugerido: cloudflare-agent-token-YYYYMMDD

# 2. Salvar no Bitwarden (item cloudflare-agent-token; renomeia o antigo pra ...-old)
bw edit item cloudflare-agent-token

# 3. Atualizar GitHub Secret (usado pelo workflow de deploy)
#    repo Settings → Secrets and variables → Actions
#    → Update CLOUDFLARE_API_TOKEN
#    (ou via gh CLI: gh secret set CLOUDFLARE_API_TOKEN --repo brazilianhustler/inkflow-saas)

# 4. Atualizar uso local (Keychain via ~/.zshrc — NÃO ler o arquivo direto)
security delete-generic-password -s CLOUDFLARE_API_TOKEN 2>/dev/null
security add-generic-password -s CLOUDFLARE_API_TOKEN -a "$USER" -w
# (cola o novo valor quando prompt)

# 5. Validar GHA — disparar deploy manual e ver se passa
gh workflow run deploy.yml --repo brazilianhustler/inkflow-saas
gh run watch --repo brazilianhustler/inkflow-saas

# 6. Validar wrangler local
wrangler whoami

# 7. Revogar o antigo no CF dashboard (só DEPOIS de validar)
#    Profile → API Tokens → token antigo → Delete
```

### Rotacionar `CRON_SECRET` (atomic — DUAS pontas sem janela)

Severidade alta. Crítico: se trocar só num lado, cron quebra (Worker manda secret X, Pages espera Y → 401).

```bash
# 1. Gerar valor novo localmente (entropia 256-bit, não persistir em arquivo)
NEW_VAL=$(openssl rand -base64 32)
# (NEW_VAL fica só nessa shell; NÃO ecoar, NÃO escrever arquivo)

# 2. Atualizar Worker PRIMEIRO (assim, mesmo que dê erro, o Pages
#    ainda aceita o antigo até a próxima cron — Worker é quem chama)
cd ~/Documents/inkflow-saas/cron-worker
echo "$NEW_VAL" | wrangler secret put CRON_SECRET --name=inkflow-cron
# (sim, aqui usa stdin via echo; alternativa mais segura: omitir o pipe e colar manualmente)

# 3. Atualizar CF Pages IMEDIATAMENTE em seguida
cd ~/Documents/inkflow-saas
wrangler pages secret delete CRON_SECRET --project-name=inkflow-saas
echo "$NEW_VAL" | wrangler pages secret put CRON_SECRET --project-name=inkflow-saas

# 4. Limpar var da shell
unset NEW_VAL
history -c   # zsh: limpa history desta sessão (não toca ~/.zsh_history)

# 5. Forçar redeploy CF Pages
git commit --allow-empty -m "chore: redeploy pra pegar novo CRON_SECRET"
git push origin main

# 6. Validar próxima execução cron
#    Espera próximo trigger (max 30min: monitor-whatsapp roda */30) ou força:
curl -H "Authorization: Bearer $(security find-generic-password -s CRON_SECRET -w)" \
  https://inkflowbrasil.com/api/cron/monitor-whatsapp
# Esperado: 200. Se 401 → trocar voltou só num lado, repetir.

# 7. Salvar novo valor no Bitwarden + Keychain pra debug futuro
#    (de novo: NÃO ecoar, usar `bw edit` e `security add-generic-password -w`)
```

**Atomic guarantee:** se a sequência falhar entre passos 2 e 3, o próximo cron retorna 401 e dispara alerta Telegram. Recovery: completar o passo 3 ou reverter o passo 2 com o valor antigo (que ainda está no Bitwarden até passo 7).

### Rotacionar `EVO_GLOBAL_KEY` / `EVOLUTION_GLOBAL_KEY` (coordenado com Vultr VPS)

Severidade crítica. Esse secret existe em DOIS lugares: CF Pages env (cliente) e env do Evolution VPS (server). Tem que trocar nos dois.

```bash
# 1. SSH na VPS Vultr (acesso restrito ao founder)
ssh root@<ip-vultr-evo>   # IP em [[InkFlow — Links e IDs]] no vault

# 2. Gerar novo valor + atualizar env do Evolution
#    Evolution roda via docker-compose; arquivo de env tipicamente em /opt/evolution/.env
#    NÃO ler o .env existente — só editar via $EDITOR ou substituir a linha:
NEW_KEY=$(openssl rand -hex 32)
sed -i "s/^AUTHENTICATION_API_KEY=.*/AUTHENTICATION_API_KEY=$NEW_KEY/" /opt/evolution/.env
# (anota NEW_KEY pra próximo passo, NÃO ecoa)

# 3. Restart Evolution pra pegar novo valor
cd /opt/evolution && docker compose restart

# 4. Validar Evolution responde com nova key
curl -H "apikey: $NEW_KEY" https://<evo-vps-domain>/instance/fetchInstances
# Esperado: 200 + JSON de instâncias.

# 5. Sair da VPS, atualizar CF Pages com o mesmo valor
exit
cd ~/Documents/inkflow-saas
# Os DOIS aliases têm que ser atualizados (dual naming):
wrangler pages secret delete EVO_GLOBAL_KEY --project-name=inkflow-saas
wrangler pages secret put EVO_GLOBAL_KEY --project-name=inkflow-saas
wrangler pages secret delete EVOLUTION_GLOBAL_KEY --project-name=inkflow-saas
wrangler pages secret put EVOLUTION_GLOBAL_KEY --project-name=inkflow-saas

# 6. Redeploy
git commit --allow-empty -m "chore: redeploy pra pegar novo EVO_GLOBAL_KEY"
git push origin main

# 7. Validar end-to-end — criar uma instância de teste via tool
curl -X POST https://inkflowbrasil.com/api/tools/criar-instancia-evo \
  -H "Authorization: Bearer $(security find-generic-password -s INKFLOW_TOOL_SECRET -w)" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":"<id-de-teste>"}'
# Esperado: 200 + qrcode.

# 8. Salvar novo valor no Bitwarden
bw edit item inkflow-evo-global-key
```

**Janela de risco:** entre passo 3 (Evolution restart com nova key) e passo 5 (CF Pages atualizado), TODO tráfego CF Pages → Evolution falha com 401. Tempo estimado: 2-5 min. Fora de horário comercial é o ideal. Avisa o canal Telegram antes.

Para detalhes do restore caso algo dê errado, ver `runbooks/restore-backup.md` (a ser criado em Task 9).

---

## Onde valores vivem

| Fonte | Quem usa | Como acessar (sem expor valor) |
|---|---|---|
| **Bitwarden** | founder, agents via MCP autenticado | `bw get item <nome>` (CLI) ou app desktop. 19 itens organizados em folders por sistema. |
| **Keychain (macOS)** | founder local (uso interativo via `~/.zshrc` que lê via `security`) | `security find-generic-password -s <nome>` — NÃO usar `-w` em chat/log; o `-w` printa o valor. |
| **Cloudflare Pages env** | runtime do site em prod | `wrangler pages secret list --project-name=inkflow-saas` (lista NOMES). **NUNCA usar `--raw`** — expõe valores. |
| **Cloudflare Worker env** | runtime do `inkflow-cron` (dir é `cron-worker/`) | `wrangler secret list --name=inkflow-cron` (lista NOMES). **NUNCA `--raw`**. |
| **GitHub Secrets** | GHA workflows (deploy CF Pages) | repo Settings → Secrets and variables → Actions. Ou `gh secret list --repo brazilianhustler/inkflow-saas` (lista NOMES, não valores — GH API não permite ler valor). |
| **Supabase (`tenants.evo_apikey`)** | per-tenant Evo apikeys (uma por tatuador) | query SQL via service key. Não rotacionar manualmente — gerado pelo `/api/evo-create-instance`. |
| **Vultr (env do Evolution VPS)** | Evolution API server | SSH → `/opt/evolution/.env` (acesso restrito ao founder; senha root + chave SSH com passphrase). |

---

## Em caso de vazamento

Se um secret vazou (chat com terceiro, log público, screenshot, repo público, push acidental):

1. **Revogar imediatamente na fonte** (MP dashboard, CF dashboard, Telegram BotFather, etc.). Antes de rotacionar — ANTES de qualquer outra coisa, mata o token vazado.
2. **Rotacionar seguindo a procedure** acima (escolher a do secret específico).
3. **Auditar uso indevido:**
   - Cloudflare → Analytics + Logs (`wrangler tail` em retroativo via dashboard)
   - Supabase → `auth.audit_log_entries` + queries no `payment_logs` por janela suspeita
   - Mercado Pago → painel de transações + filtro por valores anômalos
   - Telegram → histórico de mensagens do bot (ver se mandaram do canal alheio)
4. **Registrar incidente:** criar nota `incident_inkflow_<YYYY-MM-DD>_secret-leak.md` no vault Obsidian em `/Users/brazilianhustler/.claude/projects/-Users-brazilianhustler/memory/`. Documentar: o que vazou, como, quando, o que foi feito, o que falta. Linkar de `[[InkFlow — Painel]]` na seção de incidentes.
5. **Avisar founder via Telegram** (se for um agent detectando) ou avisar a si mesmo (calendar + checklist) se for o founder. Se foi o vazamento via push pro GitHub, executar **também**: `git filter-repo` ou BFG no histórico + `git push --force` + invalidar caches CF, e abrir nota separada de remediação.
