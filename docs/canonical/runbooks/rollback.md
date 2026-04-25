---
last_reviewed: 2026-04-25
owner: leandro
status: stable
related: [deploy.md, ../stack.md]
---

# Runbook — Rollback (CF Pages + Worker)

Procedimento pra reverter produção pro último estado bom conhecido depois de
deploy quebrado. **Severidade: critical.** Tempo alvo: <10 min até prod estar
voltando ao estado anterior.

Princípio: **primeiro reverte prod, depois conserta o git.** Não tenta debugar
no quente — a prioridade é voltar a respirar.

## Sintomas

- HTTP 5xx em `https://inkflowbrasil.com/*` ou em `/api/*`
- JS errors no browser (página em branco, "ChunkLoadError")
- Smoke test do `deploy.md` falhou (passo 4 — `/api/public-start` retornou 5xx)
- Telegram alert do auditor `deploy-health` (quando ativo)
- User reclamando que onboarding ou admin não abre
- Worker `inkflow-cron` parando de disparar (visível em `wrangler tail`)

## Pré-requisitos

- [ ] `wrangler` autenticado (`wrangler whoami`)
- [ ] Hash do commit ruim em mãos (`git log --oneline -5`)
- [ ] Confirmar que o problema é deploy (não Supabase fora, não Evolution fora)
- [ ] Ter `../secrets.md` aberto caso precise rotacionar algo no caminho

## Diagnóstico (1 min)

```bash
# Lista os últimos deploys CF Pages — o topo é o que está em prod
npx wrangler pages deployment list --project-name=inkflow-saas | head -10
```

```bash
# Confirma o último commit que entrou em prod
git log --oneline -5
```

```bash
# Confere status HTTP nas rotas críticas
for path in "/" "/onboarding" "/admin"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://inkflowbrasil.com$path?v=$(date +%s%N)")
  echo "$path: $code"
done
```

**Se todos retornam 5xx ou timeout:** confirma deploy quebrado, segue pra Ação.
**Se só algumas rotas falham:** pode ser bug específico, não rollback total — abrir
issue e considerar revert do commit antes de rollback de prod.

## Decision tree

```
Deploy veio de commit no main (GHA)?
├── SIM → Rollback CF Pages (Ação 1) + git revert (Ação 3)
└── NÃO (foi wrangler manual)
    └── Rollback CF Pages (Ação 1) — git já está consistente

Worker também foi deployado junto?
├── SIM → Também roda Ação 2 (Rollback Worker)
└── NÃO → pula Ação 2
```

## Ação 1 — Rollback CF Pages

Duas opções. **Opção A (promote previous deploy)** é a mais rápida; **Opção B**
é o caminho safe se a A falhar.

### Opção A — Promover deploy anterior (rápido)

Listar deploys e identificar o último bom:
```bash
npx wrangler pages deployment list --project-name=inkflow-saas
```

Anotar o ID do penúltimo deploy (o último antes do que quebrou).

Promover via dashboard (caminho mais confiável pra Pages atualmente):
1. Acessar `https://dash.cloudflare.com` → Workers & Pages → `inkflow-saas` → Deployments
2. Localizar o deploy bom (timestamp anterior ao quebrado)
3. Clicar nos 3 pontos → "Rollback to this deployment"
4. Confirmar

### Opção B — Re-deploy do commit anterior (safe)

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git checkout <hash-do-commit-bom>
npx wrangler pages deploy . --project-name=inkflow-saas
git checkout main      # voltar pra main após o deploy
```

Isso publica o estado antigo como um deploy novo (mantém histórico).

## Ação 2 — Rollback Worker `inkflow-cron`

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas/cron-worker
wrangler deployments list --name=inkflow-cron
```

Anotar o `version-id` da versão anterior (penúltima da lista).

```bash
wrangler rollback --name=inkflow-cron --version-id=<id-da-versao-anterior>
```

**Output esperado:**
```
The previous version of your Worker will be deployed in place of the current version.
✅ Worker rolled back to version <id>
```

## Ação 3 — Reverter o commit no git (após rollback do prod)

**IMPORTANTE: usar `git revert`, NUNCA `git reset --hard` em `main`.**
Reset reescreve histórico — quebra GHA e qualquer outro clone (VPS espelhada).

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git log --oneline -5                       # confirmar hash do commit ruim
git revert <hash-do-commit-ruim>
git push origin main
```

Isso cria um commit novo que desfaz as mudanças. Histórico fica honesto e
documenta o que aconteceu. Se o GHA está ativo, esse push vai deployar o
estado revertido — confirmando o rollback no automatizado também.

Se foram múltiplos commits, reverter na ordem inversa (do mais novo pro mais velho):
```bash
git revert <hash-mais-novo>
git revert <hash-meio>
git revert <hash-mais-antigo>
git push origin main
```

## Verificação

```bash
# Mesmo loop do diagnóstico — agora tem que voltar 200 em todas as rotas
for path in "/" "/onboarding" "/admin"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://inkflowbrasil.com$path?v=$(date +%s%N)")
  echo "$path: $code"
done
```

```bash
# Smoke test do deploy.md — não pode retornar 5xx
curl -s -o /dev/null -w "%{http_code}\n" https://inkflowbrasil.com/api/public-start \
  -X POST -H "content-type: application/json" -d '{"test": true}'
# Esperado: 200 ou 400 (não 5xx)
```

```bash
# Worker — sem erros nos primeiros 60s de tail
wrangler tail inkflow-cron --format=pretty
# Ctrl+C após 1min se nada estranho aparecer
```

```bash
# Confirma o deploy ativo é o anterior (ou o re-deploy do estado antigo)
npx wrangler pages deployment list --project-name=inkflow-saas | head -3
```

## Critério de "resolvido"

- ✅ Todas as rotas críticas (`/`, `/onboarding`, `/admin`) retornam 200
- ✅ Smoke test `/api/public-start` retorna 200 ou 400 (não 5xx)
- ✅ Nenhum 5xx em `wrangler tail` por 60s consecutivos
- ✅ Worker rollback (se aplicável) confirmou versão anterior ativa
- ✅ Git: ou `git revert` empurrado, ou commit ruim foi removido do main de outra forma documentada

## Pós-incidente

- [ ] Criar nota de incidente no vault: `Incidente — <data> — <título curto>`
  - O que quebrou
  - Hash do commit ruim + hash do revert
  - Tempo até resolver (MTTR)
  - Causa raiz (se conhecida) ou ação pendente pra investigar
- [ ] Atualizar `[[InkFlow — Painel]]` mencionando o incidente do dia
- [ ] Avisar Telegram que prod voltou
- [ ] Se virou tech debt (precisa refatorar/testar antes de re-deployar): adicionar
  em `[[InkFlow — Pendências (backlog)]]` com prioridade adequada (P0/P1)
- [ ] Se a causa foi falta de teste: planejar adicionar regression test antes de
  re-tentar o deploy
- [ ] Considerar atualizar `deploy.md` se o rollback expôs gap no procedimento padrão
- [ ] Atualizar `last_reviewed` deste runbook se algum passo mudou na prática
