# Onda 2 — CI/CD foundation — Sub-plan

> **Sub-plan da Onda 2** do macro plan `2026-05-07-auditoria-sprint-1-quick-wins.md`. Mais conciso que o macro porque o escopo é pequeno: 2 workflows YAML.

**Goal:** rodar 42 testes do repo em GHA em todo PR e push pra main + executar preflight de env vars antes do deploy CF Pages.

**Findings cobertos:** F2.4.4 (tests em CI), F1.5.3 (preflight em CI).

**Tech Stack:** GitHub Actions, Node 20, `node --test`, `wrangler-action@v3`.

## Decisões cravadas

1. **Workflow separado, não estender `prompts-ci.yml`.** Responsabilidades distintas (testes amplos vs prompts CI focado). Quando `prompts-ci.yml` é triggered? Só em `functions/_lib/prompts/**`. Tests amplos rodam em qualquer mudança.

2. **Triggers**: `pull_request` (qualquer base) + `push: branches: [main]`. Mesmo padrão do existing.

3. **Sem matrix**: Node 20 only. Cron-worker deploy script já usa Node 20+. Wrangler 4 requer 18+. Não precisa de redundância.

4. **Concurrency cancel-in-progress**: economiza minutes se push múltiplo em PR.

5. **Timeout 10min**: 42 testes no `node --test` historicamente rodam em <30s. 10min margem ampla.

6. **Run script `scripts/test-prompts.sh` continua existindo** — ele é entry point específico pra prompts CI (`prompts-ci.yml`). Tests CI novo roda `node --test tests/**/*.test.mjs` direto pros 42 outros.

7. **Preflight no deploy.yml**: roda antes do `cloudflare/wrangler-action`. Se faltar env var, deploy aborta.

8. **fail-fast por default**: Não forço `continue-on-error`. Se 1 teste flakea, deploy block — sinaliza problema.

## Files

- Create: `.github/workflows/tests.yml`
- Modify: `.github/workflows/deploy.yml`

## Pré-condições

- [ ] **PC1:** branch `chore/auditoria-onda-2-ci-foundation` ativa, working tree clean (continuação da Onda 1 mergeada).

## Task 2.1: Criar `.github/workflows/tests.yml`

**Files:**
- Create: `.github/workflows/tests.yml`

- [ ] **Step 1: Write tests.yml**

```yaml
name: Tests

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: tests-${{ github.ref }}
  cancel-in-progress: true

jobs:
  node-test:
    name: node --test
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run all tests
        run: node --test tests/**/*.test.mjs
```

- [ ] **Step 2: Smoke local — roda os mesmos testes**

```bash
node --test tests/**/*.test.mjs 2>&1 | tail -30
```

Expected: `# tests <NUM>` + `# pass <NUM>` + `# fail 0`.

> **Se algum teste falhar localmente:** investigar antes de pushar. Pode ser teste flaky pré-existente. Não introduzir teste novo nesta onda.

- [ ] **Step 3: Validar YAML syntax**

```bash
# Tenta parsear como GitHub vê (mesma validação base que GHA usa)
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/tests.yml'))" && echo "YAML OK"
```

Expected: `YAML OK`.

## Task 2.2: Modificar `.github/workflows/deploy.yml`

**Files:**
- Modify: `.github/workflows/deploy.yml`

Adicionar step `Preflight env vars` ANTES do `Deploy to Cloudflare Pages`.

- [ ] **Step 1: Editar deploy.yml**

Versão final:

```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    name: Deploy
    steps:
      - uses: actions/checkout@v4

      - name: Preflight env vars
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
        run: bash scripts/preflight-envvars.sh inkflow-saas

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          command: pages deploy . --project-name=inkflow-saas --commit-dirty=true
```

> **Por quê o env mapping**: `scripts/preflight-envvars.sh` espera `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` (lê do `~/.zshrc` localmente; em GHA, vem dos secrets via `env:`). Os secrets do repo já existem como `CF_API_TOKEN` e `CF_ACCOUNT_ID` (já usados pelo deploy step) — só remapeio.

- [ ] **Step 2: Validar YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))" && echo "YAML OK"
```

- [ ] **Step 3: Smoke local do preflight (sem token, deve skipar gracefully)**

```bash
bash scripts/preflight-envvars.sh inkflow-saas 2>&1 | head -3
```

Expected (sem CLOUDFLARE_API_TOKEN no env):
```
🔍 Scanning ...functions for env.X references...
   Found N unique env vars referenced in code
⚠️  CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID not set — skipping preflight
```

Exit `0` (não bloqueia). Em GHA com secrets disponíveis, vai bloquear se faltar var.

## Task 2.3: Commit + push + PR

- [ ] **Step 1: Stage**

```bash
git add .github/workflows/tests.yml .github/workflows/deploy.yml
git status
```

Expected: 1 new + 1 modified.

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
ci(auditoria): Onda 2 — tests CI + preflight no deploy (F2.4.4 + F1.5.3)

- Novo workflow .github/workflows/tests.yml — roda os 42 testes
  (node --test tests/**/*.test.mjs) em PR + push main + workflow_dispatch.
  Concurrency cancel-in-progress, timeout 10min, fail-fast.
- Update .github/workflows/deploy.yml — step Preflight env vars antes
  do deploy CF Pages. Bloqueia deploy se faltar env var referenciada
  em functions/. Re-uso secrets CF_API_TOKEN + CF_ACCOUNT_ID via env mapping.

Refs auditoria: F2.4.4 (tests CI), F1.5.3 (preflight em GHA)
Plan: docs/superpowers/plans/2026-05-07-onda-2-ci-foundation.md
EOF
)"
```

- [ ] **Step 3: Push + PR**

```bash
git push -u origin chore/auditoria-onda-2-ci-foundation
gh pr create --base main --head chore/auditoria-onda-2-ci-foundation \
  --title "ci(auditoria): Onda 2 — tests CI + preflight no deploy" \
  --body "Refs: F2.4.4 (tests em GHA), F1.5.3 (preflight em deploy)..."
```

- [ ] **Step 4: Verificar CI próprio rodando no PR**

Após push, CI deve disparar dois workflows:
- `Tests` (novo) — deve rodar 42 testes
- `Prompts CI` (existente) — só roda se PR toca prompts (não toca neste PR)

Expected após ~30-60s:
- `Tests / node --test`: ✅ pass
- `GitGuardian Security Checks`: ✅ pass

Se algum falhar: investigar antes de merge.

- [ ] **Step 5: Merge após CI verde**

```bash
gh pr merge <NUM> --squash --delete-branch
```

## DoD Onda 2

- [ ] `tests.yml` rodando em todo push/PR (visível na aba Actions)
- [ ] Próximo PR (Onda 3) terá tests CI rodando automaticamente
- [ ] Próximo deploy (push main) terá preflight rodando antes do wrangler

## Risco / rollback

Rollback é trivial: revert do PR. CI não tem state externo, é só YAML.

Risco de fail no smoke do CI próprio: se tests.yml encontrar teste flaky pré-existente, vai virar bloqueador. Identificar e tratar caso a caso (skip ou fix).
