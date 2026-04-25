---
last_reviewed: 2026-04-26
owner: leandro
status: stable
related: [stack.md, runbooks/rollback.md]  # rollback.md sera criado em Task 5
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

> **Aviso sobre vazamento via shell history:** o padrão `echo "$VAR" | wrangler secret put X` expande `$VAR` para o valor literal na linha de comando registrada. zsh com `INC_APPEND_HISTORY` (default em muitos setups) escreve isso em `~/.zsh_history` IMEDIATAMENTE. Por isso, abaixo o padrão primário é **paste interativo** — o valor nunca aparece na linha de comando. `history -c` só limpa a memória da sessão; se a linha já foi appendada, ela está lá.

```bash
# 1. Gerar valor novo localmente (entropia 256-bit, não persistir em arquivo)
#    DICA: prefixar comandos com espaço (com HIST_IGNORE_SPACE) os mantém fora do history
 NEW_VAL=$(openssl rand -hex 32)
# (NEW_VAL fica só nessa shell; NÃO ecoar, NÃO escrever arquivo)

# 2. Atualizar Worker PRIMEIRO (assim, mesmo que dê erro, o Pages
#    ainda aceita o antigo até a próxima cron — Worker é quem chama)
#    PRIMÁRIO (recomendado): paste interativo — valor não vai pro shell history
cd ~/Documents/inkflow-saas/cron-worker
wrangler secret put CRON_SECRET --name=inkflow-cron
# → wrangler abre prompt: cola o valor de $NEW_VAL manualmente (echo "$NEW_VAL" em
#   outro terminal pra ver, ou pbcopy < <(printf %s "$NEW_VAL") pra copiar; nunca
#   no mesmo terminal sem o leading-space + HIST_IGNORE_SPACE)
#
#   ALTERNATIVA (só se scripting automatizado, ATENÇÃO: vaza history):
#   printf '%s' "$NEW_VAL" | wrangler secret put CRON_SECRET --name=inkflow-cron

# 3. Atualizar CF Pages IMEDIATAMENTE em seguida (mesmo padrão: paste interativo)
cd ~/Documents/inkflow-saas
wrangler pages secret delete CRON_SECRET --project-name=inkflow-saas
wrangler pages secret put CRON_SECRET --project-name=inkflow-saas
# → cola o mesmo valor de $NEW_VAL

# 4. Forçar redeploy CF Pages pra pegar o novo valor
git commit --allow-empty -m "chore: redeploy pra pegar novo CRON_SECRET"
git push origin main

# 5. VALIDAR usando $NEW_VAL ainda em memória (NÃO ler do Keychain — Keychain ainda
#    tem o valor antigo, só vamos salvar lá no passo 6 se a validação passar)
#    Espera redeploy completar (~1-2min) e então:
curl -H "Authorization: Bearer $NEW_VAL" \
  https://inkflowbrasil.com/api/cron/monitor-whatsapp
# Esperado: 200. Se 401 → algo deu errado nos passos 2/3, repetir.
#   Recovery: re-rodar passo 2 e/ou 3 com $NEW_VAL ainda em memória.

# 6. SE validação passou: salvar novo valor em Bitwarden + Keychain pra debug futuro
#    (paste interativo via `bw edit` e `security add-generic-password -w` — sem -w no comando, ele prompt)
bw edit item inkflow-cron-secret
security delete-generic-password -s CRON_SECRET 2>/dev/null
security add-generic-password -s CRON_SECRET -a "$USER" -w   # prompt pra colar
# (cola o valor de $NEW_VAL)

# 7. Limpar var da shell
unset NEW_VAL
# (history -c só limpa memória da sessão; se algum echo escapou, ~/.zsh_history já tem)
```

**Atomic guarantee:** se a sequência falhar entre passos 2 e 3, o próximo cron retorna 401 e dispara alerta Telegram. **Recovery:** `$NEW_VAL` ainda está em memória da shell — completar o passo que faltou. Se perder a shell antes de completar, o valor antigo ainda está no Bitwarden/Keychain (só foi sobrescrito no passo 6, que só roda APÓS validação) — usar pra rolar manualmente até reconvergir.

### Rotacionar `EVO_GLOBAL_KEY` / `EVOLUTION_GLOBAL_KEY` (coordenado com Vultr VPS)

Severidade crítica. Esse secret existe em DOIS lugares: CF Pages env (cliente) e env do Evolution VPS (server). Tem que trocar nos dois.

```bash
# 1. SSH na VPS Vultr (acesso restrito ao founder)
ssh root@<ip-vultr-evo>   # IP em [[InkFlow — Links e IDs]] no vault

# 2. Gerar novo valor + atualizar env do Evolution
#    Evolution roda via docker-compose; arquivo de env tipicamente em /opt/evolution/.env
#    NÃO ler o .env existente — só editar via $EDITOR ou substituir a linha:
 NEW_KEY=$(openssl rand -hex 32)   # leading-space pra HIST_IGNORE_SPACE

# 2a. BACKUP da linha atual ANTES do sed (recovery se algo falhar)
OLD_LINE=$(grep "^AUTHENTICATION_API_KEY=" /opt/evolution/.env)
BACKUP_FILE=/root/evo-rotation-backup-$(date +%s).bak
printf '%s\n' "$OLD_LINE" > "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
echo "Backup salvo em: $BACKUP_FILE"

# 2b. Substitui (delimitador | em vez de / pra evitar escape se key tiver /)
sed -i "s|^AUTHENTICATION_API_KEY=.*|AUTHENTICATION_API_KEY=$NEW_KEY|" /opt/evolution/.env

# 2c. IMPORTANTE: NUNCA fazer 'cat /opt/evolution/.env' ou 'less' nele.
#     Verificar a substituição via grep direcionado (conta linhas, não printa valor):
grep -c "^AUTHENTICATION_API_KEY=" /opt/evolution/.env  # esperado: 1

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

**Rollback (se passo 4 falhar com 401, ou qualquer falha antes do passo 8):**

```bash
# Ainda na VPS (ou re-SSH)
ssh root@<ip-vultr-evo>

# 1. Localizar o backup criado no passo 2a
ls -t /root/evo-rotation-backup-*.bak | head -1
BACKUP_FILE=<caminho-do-mais-recente>

# 2. Restaurar a linha original (substitui a linha atual pela do backup)
#    Lê só a linha do backup (single line) e usa ela na substituição
OLD_LINE=$(cat "$BACKUP_FILE")
# Extrai só o valor (depois do =) pra usar no sed sem reler .env
OLD_VAL="${OLD_LINE#AUTHENTICATION_API_KEY=}"
sed -i "s|^AUTHENTICATION_API_KEY=.*|AUTHENTICATION_API_KEY=$OLD_VAL|" /opt/evolution/.env

# 3. Verificar (sem cat — só conta)
grep -c "^AUTHENTICATION_API_KEY=" /opt/evolution/.env  # esperado: 1

# 4. Restart pra pegar o valor antigo de volta
cd /opt/evolution && docker compose restart

# 5. Validar com o valor antigo (que CF Pages ainda está usando — não chegou ao passo 5)
curl -H "apikey: $OLD_VAL" https://<evo-vps-domain>/instance/fetchInstances
# Esperado: 200. Sistema voltou ao estado pré-rotação.

# 6. Limpar backup + var
unset OLD_VAL OLD_LINE
shred -u "$BACKUP_FILE" 2>/dev/null || rm -f "$BACKUP_FILE"
```

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
