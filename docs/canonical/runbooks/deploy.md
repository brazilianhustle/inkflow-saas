---
last_reviewed: 2026-04-26
owner: leandro
status: stable
related: [rollback.md, ../stack.md]
---

# Runbook — Deploy padrão (CF Pages + Worker)

Procedimento pra publicar uma alteração em produção. **Não é um incidente** — é a
rotina padrão. Se algo der errado durante o deploy, abortar e ir pra `rollback.md`.

Stack alvo:
- **CF Pages** (`inkflow-saas` → `https://inkflowbrasil.com`) — frontend + Pages Functions (`functions/`)
- **Worker** (`inkflow-cron`) — dispatcher de crons que chama os endpoints `/api/cron/*` e `/api/cleanup-tenants`

CF Pages tem dois caminhos:
1. **Automático via GitHub Actions** — `git push origin main` dispara `.github/workflows/deploy.yml`.
2. **Manual via wrangler** — Direct Upload pelo terminal (caminho histórico, mantido como fallback).

O Worker é sempre deploy manual via wrangler (não tem GHA pra ele).

## Pré-requisitos

- [ ] `wrangler` autenticado: `wrangler whoami` retorna o email do user
- [ ] Working tree limpo: `git status` não mostra mudanças não commitadas (se for usar GHA)
- [ ] Branch `main` atualizada com a feature mergeada
- [ ] `CLOUDFLARE_API_TOKEN` válido (se for rodar GHA, está em GitHub Secrets como `CF_API_TOKEN`)
- [ ] Smoke test pré-deploy local passou (build local não quebra)
- [ ] Para Worker: estar dentro de `/Users/brazilianhustler/Documents/inkflow-saas/cron-worker`

Verificar credenciais em `secrets.md` se algum comando reclamar de auth.

## Pré-flight checks (manuais)

Bateria de validações pra rodar **antes** do `git push origin main` (ou abertura de PR mergeável). Cobre os 7 pontos que historicamente queimaram deploy. Resultado esperado: PASS em todos. Qualquer FAIL bloqueia push até corrigir.

### 1. Sintaxe JS em todos os endpoints

```bash
for f in /Users/brazilianhustler/Documents/inkflow-saas/functions/api/**/*.js; do
  node --check "$f" 2>&1 || echo "FAIL: $f"
done
```

PASS = nenhum output. FAIL = path do arquivo + erro.

### 2. HTML bem-formado em arquivos críticos

Confere tags não-fechadas em `index.html`, `onboarding.html`, `studio.html`, `admin.html`. Pode usar `tidy -e` ou inspeção visual rápida — qualquer tag aberta sem `</...>` correspondente quebra DOM em CF Pages CDN.

```bash
for f in /Users/brazilianhustler/Documents/inkflow-saas/{index,onboarding,studio,admin}.html; do
  echo "=== $f ==="
  tidy -errors -quiet "$f" 2>&1 | head -5 || true
done
```

PASS = "no warnings or errors found". FAIL = lista de erros.

### 3. Links internos não-quebrados

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
grep -rn 'href="\.\?/[^"]*\.html"' --include="*.html" --include="*.js" | grep -v "://" | while IFS= read -r line; do
  file=$(echo "$line" | grep -oE 'href="[^"]*\.html"' | head -1 | sed 's|href="||' | sed 's|"||')
  test -f "$file" || echo "BROKEN: $line"
done
```

PASS = nenhum "BROKEN:" output. FAIL = referência a HTML que não existe.

### 4. Env vars críticas presentes em CF Pages

Lista canônica em `docs/canonical/secrets.md`. Verifica se cada uma está configurada (sem ler valor — só presença) via MCP Cloudflare:

```
mcp__plugin_cloudflare_cloudflare-bindings__workers_get_worker (ou via wrangler env list)
```

Lista mínima: `SUPABASE_SERVICE_KEY`, `EVO_GLOBAL_KEY`, `EVO_BASE_URL`, `N8N_WEBHOOK_URL`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `STUDIO_TOKEN_SECRET`, `EVO_CENTRAL_INSTANCE`, `EVO_CENTRAL_APIKEY`, `MAILERLITE_API_KEY`, `EVO_DB_CLEANUP_URL`, `EVO_DB_CLEANUP_SECRET`, `CRON_SECRET`, `CLEANUP_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

PASS = todas presentes em production. FAIL = lista de missing vars.

### 5. Schema Supabase (colunas usadas pelo código existem)

Via MCP em vez de `SB_PAT` plaintext (Safety #5):

```
mcp__plugin_supabase_supabase__execute_sql

SELECT column_name FROM information_schema.columns
WHERE table_name = 'tenants' AND table_schema = 'public';
```

Colunas obrigatórias mínimas: `onboarding_key`, `telefone`, `welcome_shown`, `parent_tenant_id`, `is_artist_slot`, `studio_token`, `evo_instance`, `evo_apikey`, `evo_base_url`, `ativo`, `plano`, `mp_subscription_id`, `status_pagamento`, `trial_ate`.

PASS = todas presentes. FAIL = colunas missing (rodar migration antes de deploy).

### 6. Git status — sem changes não-staged não-committed

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git status --porcelain
```

PASS = output vazio. FAIL = working tree dirty (commitar ou stash antes de push).

### 7. CORS consistency

Confere se todas as funções em `functions/api/*.js` retornam header CORS uniforme:

```bash
grep -rn 'Access-Control-Allow-Origin' /Users/brazilianhustler/Documents/inkflow-saas/functions/api/ | head -20
```

PASS = todas as ocorrências apontam pra `https://inkflowbrasil.com` ou `*` consistentemente. FAIL = mistura de origens (tipo dev `localhost` em prod).

### Resultado consolidado

Se 7/7 PASS → seguro pra `git push origin main` (ou abrir PR mergeável).
Se qualquer FAIL → bloqueado até corrigir. Re-rodar checklist após fix.

---

## Procedure — CF Pages

### 1. Pre-flight checks

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git status                 # working tree clean?
git log --oneline -3       # último commit é o esperado?
wrangler whoami            # autenticado?
```

**Output esperado de `wrangler whoami`:**
```
👋 You are logged in with an OAuth Token, associated with the email <seu-email>!
```

**Output de erro comum:**
- `You are not authenticated.` → rodar `wrangler login` (abre browser)
- `Error: Authentication error [code: 10000]` → token expirou → ver `../secrets.md`

### 2. Deploy

**Caminho A — GitHub Actions (recomendado):**

```bash
git push origin main
```

Acompanhar em `https://github.com/brazilianhustle/inkflow-saas/actions` — workflow "Deploy to Cloudflare Pages" leva ~1-2 min.

**Caminho B — Manual via wrangler (fallback):**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
npx wrangler pages deploy . --project-name=inkflow-saas
```

**Output esperado (manual):**
```
✨ Success! Uploaded N files (M already uploaded) (Xs)
✨ Deployment complete! Take a peek over at https://<hash>.inkflow-saas.pages.dev
```

**Output de erro comum:**
- `Project not found` → nome do projeto errado, deve ser exatamente `inkflow-saas`
- `Error: Authentication error` → token expirou → ver `../secrets.md`
- Build falha em arquivo X → corrigir local, não fazer push, abortar deploy

### 3. Verify deploy worked

```bash
# Verifica que o domínio responde com a versão nova (cache-bust com query)
curl -s "https://inkflowbrasil.com/onboarding?v=$(date +%s%N)" | grep -c "<title>"
# Esperado: 1
```

```bash
# Lista os últimos deploys e confirma que o topo é recente
npx wrangler pages deployment list --project-name=inkflow-saas | head -5
```

**Output esperado:** primeiro deploy listado é o que você acabou de fazer (timestamp últimos minutos).

### 4. Smoke test

```bash
# Endpoint público real, não retorna 5xx
curl -s -o /dev/null -w "%{http_code}\n" https://inkflowbrasil.com/api/public-start \
  -X POST -H "content-type: application/json" -d '{"test": true}'
# Esperado: 200 ou 400 (não 500)
```

**Se receber 5xx:** algo no deploy quebrou rota Functions. **ABORTAR** e ir pra
`rollback.md` imediatamente.

## Procedure — Worker `inkflow-cron`

### 1. Deploy

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas/cron-worker
wrangler deploy
```

**Output esperado:**
```
Total Upload: X KiB / gzip: Y KiB
Uploaded inkflow-cron (Xs)
Deployed inkflow-cron triggers (Xs)
  schedule: 0 12 * * *
  schedule: 0 2 * * *
  schedule: 0 9 * * *
  schedule: */30 * * * *
Current Version ID: <uuid>
```

**Output de erro comum:**
- `Error: A request to the Cloudflare API failed` → reautenticar com `wrangler login`
- `Missing entry-point` → confirmar que `cron-worker/src/index.js` existe
- `Compatibility date errors` → checar `cron-worker/wrangler.toml`

### 2. Verify

```bash
# Lista deploys do Worker — primeiro tem que ser o que acabou de subir
wrangler deployments list --name=inkflow-cron | head -10
```

```bash
# Tail logs em tempo real (Ctrl+C pra sair)
wrangler tail inkflow-cron --format=pretty
```

Se quiser forçar um cron específico pra validar (sem esperar o schedule):
```bash
# (do dir cron-worker/, scripts npm já com o auth header certo)
npm run test-monitor      # dispara monitor-whatsapp manualmente
```

## Pós-deploy

- [ ] Confirmar smoke test passou (CF Pages)
- [ ] Confirmar Worker deploy listou os 4 cron triggers
- [ ] Atualizar `[[InkFlow — Painel]]` com a versão / mudança publicada
- [ ] Se virou versão grande: criar nota de release no vault
- [ ] Avisar Telegram quando aplicável (mudança visível pro user)

## Critério de "resolvido"

- ✅ `curl https://inkflowbrasil.com/onboarding` retorna 200 com `<title>`
- ✅ Smoke test em `/api/public-start` retorna 200 ou 400 (não 5xx)
- ✅ `wrangler pages deployment list` mostra o deploy novo no topo
- ✅ Worker `wrangler deployments list` mostra a versão nova
- ✅ Nenhum erro 5xx aparece em `wrangler tail` nos primeiros 60s

## Variantes

### Deploy manual via dashboard (último fallback)

Se wrangler CLI não funcionar e GHA também estiver fora:
1. Build local do bundle (se aplicável).
2. Acessar `https://dash.cloudflare.com` → Workers & Pages → `inkflow-saas` → Deployments → Upload manual.
3. Arrastar o diretório do projeto.

Esse caminho é raro e não recomendado — perdemos o histórico via wrangler/GHA.

### Deploy de hotfix urgente

Pular o GHA e ir direto via wrangler manual (caminho B do passo 2). Comitar
depois — mas comitar **no mesmo dia**, senão prod desincroniza do git.
