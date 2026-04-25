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
