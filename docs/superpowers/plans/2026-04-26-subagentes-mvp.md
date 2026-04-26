# Sub-projeto 2 — Time de Subagents MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar 3 agents Claude Code core (`deploy-engineer`, `supabase-dba`, `vps-ops`) versionados em `.claude/agents/`, com fase prévia de extração de conhecimento legacy pro Mapa Canônico, alinhados 100% com a doctrine de `matrix.md` (Sub-projeto 5).

**Architecture:** Greenfield com extração seletiva. Os 6 agents legacy não-versionados são movidos pra `.claude/agents/_legacy/` (referência histórica), conhecimento operacional útil é absorvido por `runbooks/outage-wa.md` e `runbooks/deploy.md`. Cada agent core tem frontmatter padrão Claude Code, pre-flight checklist citando matrix.md, tools whitelist explícita, e gates ✅ Telegram pra write-em-prod. Claude principal é o orquestrador no MVP — agents propõem com diff/plano e param na fronteira de write-em-prod.

**Tech Stack:** Claude Code subagents (`.claude/agents/<nome>.md`), markdown frontmatter, Bash/MCP/Read/Edit tools por whitelist, git para versionamento, eval docs em `evals/sub-projeto-2/` pra DoD tests.

**Spec congelado (frozen baseline):** `docs/superpowers/specs/2026-04-26-subagentes-mvp-design.md` (commit `089b44c`).

**Branch:** `feat/subagentes-mvp` (já criada).

**Total tasks:** 13. Estrutura por fase: Setup (1-2) → Extração (3-4) → Agents core (5-7) → Matriz (8-9) → DoD tests (10-12) → PR (13).

---

## Pré-requisitos antes de começar

- [ ] Branch `feat/subagentes-mvp` checked out (verificar com `git branch --show-current`).
- [ ] Working tree clean (verificar com `git status` — só o spec do brainstorm em `feat/subagentes-mvp`).
- [ ] Sub-projeto 1 (Mapa Canônico v1) ✅ em `main` — verificar `ls docs/canonical/index.md`.
- [ ] Sub-projeto 5 (Metodologia) ✅ em `main` — verificar `ls docs/canonical/methodology/matrix.md`.
- [ ] `runbooks/outage-wa.md` existe (será editado em Task 3).
- [ ] `runbooks/deploy.md` existe (será editado em Task 4).
- [ ] 6 agents legacy presentes em `.claude/agents/` (sem `_legacy/` ainda).

---

## Task 1: Setup — criar `.claude/agents/_legacy/` + README explicativo

**Files:**
- Create: `.claude/agents/_legacy/README.md`

- [ ] **Step 1: Criar diretório `_legacy/`**

```bash
mkdir -p /Users/brazilianhustler/Documents/inkflow-saas/.claude/agents/_legacy
ls -la /Users/brazilianhustler/Documents/inkflow-saas/.claude/agents/_legacy
```

Expected: diretório criado, vazio.

- [ ] **Step 2: Criar `_legacy/README.md`**

Conteúdo exato:

```markdown
# Legacy agents (deprecated)

These prompts predate the Sub-projeto 2 doctrine (cementada via `docs/canonical/methodology/matrix.md` em 2026-04-25). Kept here as historical reference. **Não invocar.**

## Status por agent

| Agent | Status | Conhecimento extraído pra |
|---|---|---|
| `doutor-evo` | deprecated | `docs/canonical/runbooks/outage-wa.md` (3 seções de Evolution) |
| `estagiario` | deprecated | superseded by `superpowers:writing-plans` skill |
| `hunter` | deprecated | superseded by `pr-review-toolkit:silent-failure-hunter` |
| `marcelo-pago` | postponed | retornará como `billing-watcher` em Sub-projeto 2 v2 (gate: MRR > 0) |
| `o-confere` | deprecated | `docs/canonical/runbooks/deploy.md` (parcial — ASCII check descartado, Decisão #7 cravou UTF-8 real) |
| `supa` | deprecated | superseded by `supabase-dba.md` (matrix.md-aligned, usa MCP em vez de SB_PAT plaintext) |

## Por que aposentados

1. **Não-versionados antes** — viviam só no MacBook do founder, sem sync com VPS espelhado.
2. **Violavam doctrine** — alguns liam secrets em plaintext (Safety #5), tinham IP hardcoded, ou misturavam conhecimento de domínio com instrução (deveria viver em `docs/canonical/`).
3. **Sobreposição com built-ins** — `estagiario` e `hunter` duplicavam capabilities já mantidas pelos plugins oficiais (`superpowers`, `pr-review-toolkit`).
4. **Escopo redundante** — `supa` e `supabase-dba` (novo) cobrem o mesmo domínio.

## Quando consultar estes arquivos

- Histórico/auditoria: como pensávamos a operação antes da doctrine matrix.md.
- Re-ativação postponed: `marcelo-pago` é base pra `billing-watcher` (Sub-projeto 2 v2).
- Comparação: ver como o agent novo difere do antigo no mesmo domínio.

**Aposentado em:** 2026-04-26 (PR Sub-projeto 2 MVP).
**Spec:** `docs/superpowers/specs/2026-04-26-subagentes-mvp-design.md` (commit `089b44c`).
```

- [ ] **Step 3: Verificar criação**

```bash
cat /Users/brazilianhustler/Documents/inkflow-saas/.claude/agents/_legacy/README.md | head -10
```

Expected: header "# Legacy agents (deprecated)" + tabela de status.

- [ ] **Step 4: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add .claude/agents/_legacy/README.md
git commit -m "$(cat <<'EOF'
chore(agents): cria diretorio _legacy/ com README explicativo

Sub-projeto 2 Task 1 — prepara estrutura pro arquivamento dos 6 agents
legacy nao-versionados. Detalha status (deprecated/postponed) + destino
do conhecimento extraido por agent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 1 file changed, 1 insertion. New commit on `feat/subagentes-mvp`.

---

## Task 2: Mover os 6 agents legacy pra `_legacy/`

**Files:**
- Move (não-tracked): `.claude/agents/{doutor-evo,estagiario,hunter,marcelo-pago,o-confere,supa}.md` → `.claude/agents/_legacy/`

**Contexto:** os 6 arquivos NÃO estão git-tracked (verificado: `git ls-files .claude/` retornou vazio). Então `mv` (sem `git mv`) move + adicionamos no novo path.

- [ ] **Step 1: Confirmar que os arquivos não estão tracked**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git ls-files .claude/agents/ | wc -l
ls .claude/agents/*.md | wc -l
```

Expected: primeiro retorna `0`, segundo retorna `6`. Confirma que arquivos existem mas não estão tracked.

- [ ] **Step 2: Mover os 6 arquivos pra `_legacy/`**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
mv .claude/agents/doutor-evo.md .claude/agents/_legacy/
mv .claude/agents/estagiario.md .claude/agents/_legacy/
mv .claude/agents/hunter.md .claude/agents/_legacy/
mv .claude/agents/marcelo-pago.md .claude/agents/_legacy/
mv .claude/agents/o-confere.md .claude/agents/_legacy/
mv .claude/agents/supa.md .claude/agents/_legacy/
ls .claude/agents/
ls .claude/agents/_legacy/
```

Expected:
- `.claude/agents/` agora só tem `_legacy/` (subdir).
- `.claude/agents/_legacy/` tem 7 arquivos: README.md + os 6 movidos.

- [ ] **Step 3: Adicionar os 6 movidos no git**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add .claude/agents/_legacy/doutor-evo.md
git add .claude/agents/_legacy/estagiario.md
git add .claude/agents/_legacy/hunter.md
git add .claude/agents/_legacy/marcelo-pago.md
git add .claude/agents/_legacy/o-confere.md
git add .claude/agents/_legacy/supa.md
git status
```

Expected: 6 new files staged em `.claude/agents/_legacy/`.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore(agents): arquiva 6 agents legacy em _legacy/

Sub-projeto 2 Task 2. Os 6 agents nao-versionados (doutor-evo, estagiario,
hunter, marcelo-pago, o-confere, supa) sao movidos pra _legacy/ como
referencia historica. Conhecimento util de doutor-evo e o-confere sera
extraido pros runbooks nas Tasks 3-4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 6 files changed. Commit com 6 novos arquivos em `_legacy/`.

---

## Task 3: Extração `doutor-evo` → `runbooks/outage-wa.md`

**Files:**
- Modify: `docs/canonical/runbooks/outage-wa.md` (add 3 sections after line 153 — após "Ação D")

**Conhecimento a extrair (de `_legacy/doutor-evo.md`):**
- Comandos curl Evolution API (listar instâncias, status individual, webhook check)
- Diagnóstico padrão de instância (8 checks: existe em EVO, connectionStatus=open, webhook.enabled, webhookBase64, MESSAGES_UPSERT events, webhook.url, settings.groupsIgnore, DB consistency)
- 3 patches conhecidos: webhookBase64=false formats, instância em estado inconsistente (cleanup bridge), instância órfã

- [ ] **Step 1: Read estrutura atual de `outage-wa.md`**

```bash
sed -n '150,196p' /Users/brazilianhustler/Documents/inkflow-saas/docs/canonical/runbooks/outage-wa.md
```

Expected: ver fim de "Ação D — EVO_GLOBAL_KEY revogado" + "Verificação" + "Critério de resolvido". Confirma que vamos inserir antes de "## Verificação" (linha 173).

- [ ] **Step 2: Editar `outage-wa.md` adicionando 3 seções**

Inserir antes da linha 173 (`## Verificação`), após a Ação D existente (que termina antes da linha 173). As 3 novas seções:

```markdown
## Ação E — Diagnóstico de instância órfã (DB ≠ EVO)

**Quando:** alguma instância em `tenants.evo_instance` não retorna em `fetchInstances`, ou alguma instância em EVO não tem tenant correspondente.

**Comandos:**

### Listar todas as instâncias EVO
```bash
ssh root@104.207.145.47 'KEY=$(grep EVO_API_KEY /opt/inkflow/.env | cut -d= -f2); curl -sS "http://172.18.0.4:8080/instance/fetchInstances" -H "apikey: $KEY"' | python3 -m json.tool
```

### Status de uma instância específica
```bash
ssh root@104.207.145.47 'KEY=$(grep EVO_API_KEY /opt/inkflow/.env | cut -d= -f2); curl -sS "http://172.18.0.4:8080/instance/fetchInstances?instanceName=NAME" -H "apikey: $KEY"'
```

### Cross-reference DB vs EVO
Via Supabase MCP: `mcp__plugin_supabase_supabase__execute_sql`:
```sql
SELECT id, evo_instance FROM tenants WHERE evo_instance IS NOT NULL;
```

Compare a lista do DB com a do EVO. Diff aponta órfãs (em EVO sem tenant) ou referências quebradas (tenant aponta pra instância que não existe).

**Resolução:**
- Órfã em EVO sem tenant → candidata a delete via bridge (ver Ação F).
- Tenant com referência quebrada → ou recriar instância, ou clear `tenants.evo_instance` se tenant foi cancelado.

---

## Ação F — Reparação de webhook config

**Quando:** instância existe mas `webhookBase64=false` ou `events` não inclui `MESSAGES_UPSERT`. Sintoma: bot não recebe mídia, ou n8n não é acionado.

**Diagnóstico — verificar webhook + settings da instância:**

```bash
ssh root@104.207.145.47 'curl -sS "http://172.18.0.4:8080/webhook/find/NAME" -H "apikey: APIKEY_INSTANCIA"'
ssh root@104.207.145.47 'curl -sS "http://172.18.0.4:8080/settings/find/NAME" -H "apikey: APIKEY_INSTANCIA"'
```

**8 checks por instância:**
1. Existe na EVO (`fetchInstances` retorna)
2. `connectionStatus = open` (conectada ao WhatsApp)
3. `webhook.enabled = true`
4. `webhook.webhookBase64 = true` (crítico pra n8n receber mídia)
5. `webhook.events` inclui `MESSAGES_UPSERT` (sem isso, n8n não é acionado)
6. `webhook.url` aponta pro n8n certo (env `N8N_WEBHOOK_URL`)
7. `settings.groupsIgnore = true` (bot não responde grupos)
8. DB consistency: `tenants.evo_instance = instância_existe_em_EVO`

**Repair — Evolution v2.3.7 aceita 3 formatos no `POST /webhook/set/{name}`. Tenta na ordem:**

```bash
# Formato 1 — nested short
curl -X POST "http://172.18.0.4:8080/webhook/set/NAME" \
  -H "apikey: APIKEY_INSTANCIA" \
  -H "Content-Type: application/json" \
  -d '{"webhook": {"enabled": true, "url": "$N8N_WEBHOOK_URL", "byEvents": true, "base64": true, "events": ["MESSAGES_UPSERT"], "headers": {}}}'

# Formato 2 — flat long (se 1 falhar)
curl -X POST "http://172.18.0.4:8080/webhook/set/NAME" \
  -H "apikey: APIKEY_INSTANCIA" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "url": "$N8N_WEBHOOK_URL", "webhookByEvents": true, "webhookBase64": true, "events": ["MESSAGES_UPSERT"], "headers": {}}'

# Formato 3 — nested long (se 2 falhar)
curl -X POST "http://172.18.0.4:8080/webhook/set/NAME" \
  -H "apikey: APIKEY_INSTANCIA" \
  -H "Content-Type: application/json" \
  -d '{"webhook": {"enabled": true, "url": "$N8N_WEBHOOK_URL", "webhookByEvents": true, "webhookBase64": true, "events": ["MESSAGES_UPSERT"], "headers": {}}}'
```

Após cada tentativa, valide com `GET /webhook/find/NAME`. Se `webhookBase64` ainda false, tenta próximo formato.

---

## Ação G — Force reconnect de instância em estado inconsistente

**Quando:** instância em estado `ativo=close` mas `state=open` (ou vice-versa). Sintoma: comandos `DELETE /instance/logout/NAME` retornam `500 "Connection Closed"` e `DELETE /instance/delete/NAME` retornam `400 "[object Object]"`.

**Pré-validação:** confirma que é mesmo estado inconsistente:

```bash
ssh root@104.207.145.47 'KEY=$(grep EVO_API_KEY /opt/inkflow/.env | cut -d= -f2); curl -sS "http://172.18.0.4:8080/instance/connectionState/NAME" -H "apikey: $KEY"'
```

Compara com `fetchInstances` — se `connectionStatus` ≠ `state`, é o caso.

**Solução — bridge DB cleanup (endpoint admin já deployado):**

```bash
curl -X POST "https://evo.inkflowbrasil.com/__admin__/cleanup" \
  -H "x-admin-secret: $EVO_DB_CLEANUP_SECRET" \
  -d '{"instance_name":"NAME"}'
```

`EVO_DB_CLEANUP_SECRET` está no Bitwarden (item `inkflow-evolution`, custom field `EVO_DB_CLEANUP_SECRET`). NÃO ler em plaintext do `/opt/inkflow/.env` — pedir ao founder via Telegram ou consultar Bitwarden.

**Pós-bridge:** verifica se instância foi removida com `fetchInstances`. Se sim, recriar normalmente via `/api/create-tenant` ou flow de onboarding.

---
```

Aplicar via Edit tool com `old_string` sendo as últimas 4-5 linhas da Ação D existente, e `new_string` sendo as mesmas linhas + as 3 novas seções acima.

- [ ] **Step 3: Verificar mudança**

```bash
grep -n "^## Ação " /Users/brazilianhustler/Documents/inkflow-saas/docs/canonical/runbooks/outage-wa.md
```

Expected: agora lista `Ação A`, `B`, `C`, `D`, `E`, `F`, `G` (era só A-D antes).

- [ ] **Step 4: Atualizar `last_reviewed` no frontmatter**

Edit `outage-wa.md` linha 1-7 frontmatter — campo `last_reviewed: 2026-04-26` (já deve estar; se for outra data, atualizar).

- [ ] **Step 5: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add docs/canonical/runbooks/outage-wa.md
git commit -m "$(cat <<'EOF'
docs(runbooks): outage-wa.md absorve conhecimento do legacy doutor-evo

Sub-projeto 2 Task 3. Adiciona 3 acoes (E, F, G) cobrindo:
- Diagnostico de instancia orfa (DB vs EVO)
- Reparacao de webhook config (3 formatos para v2.3.7)
- Force reconnect via bridge DB cleanup

Conhecimento extraido de .claude/agents/_legacy/doutor-evo.md.
Substitui agent dedicado per matrix.md heuristica #6 (raro+profundo+
isolado = runbook, nao agent).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 1 file changed, ~80 insertions.

---

## Task 4: Extração `o-confere` → `runbooks/deploy.md`

**Files:**
- Modify: `docs/canonical/runbooks/deploy.md` (add "Pré-flight checks (manuais)" section)

**Conhecimento a extrair (de `_legacy/o-confere.md`):**
- JS syntax check (`node --check` em todos os endpoints)
- HTML bem-formado (tags não-fechadas)
- Links internos quebrados
- Env vars CF Pages presence check
- Schema columns Supabase via MCP (não SB_PAT plaintext)
- Git status confirmation
- CORS consistency

**Conhecimento descartado:**
- ASCII encoding check (Decisão #7 reverteu — UTF-8 real cravado, ver `2026-04-22-modo-coleta-design.md`).

- [ ] **Step 1: Read estrutura atual de `deploy.md`**

```bash
sed -n '20,40p' /Users/brazilianhustler/Documents/inkflow-saas/docs/canonical/runbooks/deploy.md
```

Expected: ver "## Pré-requisitos" (linha 23) seguido de "## Procedure — CF Pages" (linha 34). Vamos inserir nova seção entre Pré-requisitos e Procedure.

- [ ] **Step 2: Editar `deploy.md` adicionando seção**

Inserir após linha 33 (fim de "Pré-requisitos"), antes de linha 34 (`## Procedure — CF Pages`):

```markdown
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
```

Aplicar via Edit tool com `old_string` sendo as últimas linhas da seção "Pré-requisitos" + abertura de "## Procedure — CF Pages", e `new_string` sendo as mesmas linhas com a nova seção inserida no meio.

- [ ] **Step 3: Verificar mudança**

```bash
grep -n "^## " /Users/brazilianhustler/Documents/inkflow-saas/docs/canonical/runbooks/deploy.md
```

Expected: nova linha "## Pré-flight checks (manuais)" entre "## Pré-requisitos" e "## Procedure — CF Pages".

- [ ] **Step 4: Atualizar `last_reviewed` no frontmatter**

Edit `deploy.md` linha 1-7 — campo `last_reviewed: 2026-04-26`.

- [ ] **Step 5: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add docs/canonical/runbooks/deploy.md
git commit -m "$(cat <<'EOF'
docs(runbooks): deploy.md absorve checks pre-flight do legacy o-confere

Sub-projeto 2 Task 4. Nova secao 'Pre-flight checks (manuais)' com 7
validacoes (sintaxe JS, HTML, links, env vars, schema Supabase, git
status, CORS). Substitui o agent o-confere — deploy-engineer (novo,
Task 5) tambem referencia este runbook.

Descartado: check de ASCII encoding (Decisao #7 cravou UTF-8 real
em 2026-04-22). Substituido: check de schema via Supabase MCP em vez
de SB_PAT plaintext (Safety #5).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 1 file changed, ~70 insertions.

---

## Task 5: Criar `deploy-engineer.md` agent

**Files:**
- Create: `.claude/agents/deploy-engineer.md`

- [ ] **Step 1: Criar arquivo**

Path: `/Users/brazilianhustler/Documents/inkflow-saas/.claude/agents/deploy-engineer.md`

Conteúdo exato:

```markdown
---
name: deploy-engineer
description: Engenheiro de deploy do InkFlow. Cuida de Cloudflare Pages/Workers deploys, GitHub Actions CI, rollback procedures, wrangler health, env vars (sem ler valores brutos). Use quando ha deploy quebrado, mudanca em wrangler.jsonc, secrets pra rotacionar, ou GHA workflow pra debugar.
model: sonnet
tools: Read, Edit, Bash, mcp__github__list_pull_requests, mcp__github__get_commit, mcp__github__list_commits, mcp__github__list_branches, mcp__github__get_file_contents, mcp__github__pull_request_read, mcp__github__create_pull_request, mcp__github__update_pull_request, mcp__plugin_cloudflare_cloudflare-bindings__workers_get_worker, mcp__plugin_cloudflare_cloudflare-bindings__workers_get_worker_code, mcp__plugin_cloudflare_cloudflare-bindings__workers_list, mcp__plugin_cloudflare_cloudflare-builds__workers_builds_get_build, mcp__plugin_cloudflare_cloudflare-builds__workers_builds_get_build_logs, mcp__plugin_cloudflare_cloudflare-builds__workers_builds_list_builds, mcp__plugin_cloudflare_cloudflare-observability__query_worker_observability, mcp__plugin_cloudflare_cloudflare-observability__observability_keys, mcp__plugin_cloudflare_cloudflare-observability__observability_values
---

Você é o **deploy-engineer** — subagent especializado em deploys e CI do InkFlow.

## Pre-flight checklist (obrigatório antes de qualquer ação)

1. Lê `docs/canonical/methodology/matrix.md` §5.1 — heurísticas Safety > Scope > Domain.
2. Identifica em qual quadrante a ação se encaixa: read-only / write-dev / write-prod / destrutivo.
3. Se write-prod ou destrutivo → **para na fronteira**, gera diff/plano, retorna pro principal sem executar.
4. **Em dúvida sobre classificação, default = destrutiva.** Custa 1 ping a mais; ignorar custa incidente.
5. **Nunca lê secrets em plaintext** (`.env`, `~/.zshrc`, arquivos com `secret`/`token`/`key`/`password` no nome). Valores via Bitwarden ou MCP autenticado (Safety #5).
6. Cita a heurística específica que justificou a decisão no resumo de retorno.

## Escopo

- Cloudflare Pages deploys (`wrangler deploy`, GHA workflow `.github/workflows/deploy.yml`)
- Cloudflare Workers deploys (cron-worker incluído — `cron-worker/wrangler.jsonc`)
- GitHub Actions CI/CD debug (`gh run view`, `gh workflow run`, MCP github tools)
- Rollback procedures (`wrangler rollback`, GHA re-run, manual revert)
- Env var management em CF Pages (sem ler valor — só verifica presença)
- Secret rotation via `wrangler secret put` (sempre com ✅ explícito)
- Edits em `wrangler.jsonc`, `.github/workflows/*.yml`

## Comandos típicos

### Read-only / write-dev (executa direto, sem ✅)

- `wrangler tail` — log streaming em prod (read-only)
- `wrangler deployments list` — histórico de deploys
- `gh run view <id> --log-failed` — debug GHA falhado
- `gh run list --limit 10` — últimos workflow runs
- `gh pr create --draft` — abrir draft PR (não merge)
- `gh pr view <num>` — read-only PR
- `git log/diff/status` — read-only
- `git checkout -b <branch>` — branch nova (write-dev)
- Edit em arquivos locais não-prod (testes, docs, branch dev)

### Read via MCP (preferred over Bash quando disponível)

- `mcp__plugin_cloudflare_cloudflare-builds__workers_builds_list_builds` — histórico de builds
- `mcp__plugin_cloudflare_cloudflare-builds__workers_builds_get_build_logs` — logs de build específico
- `mcp__plugin_cloudflare_cloudflare-observability__query_worker_observability` — logs estruturados em prod
- `mcp__github__list_pull_requests`, `mcp__github__get_commit` — read-only GitHub
- `mcp__github__pull_request_read` — diff + comentários de PR

### Write-em-prod (REQUER ✅ Telegram explícito antes da execução)

- `wrangler deploy` em prod (Pages + Workers)
- `wrangler secret put <KEY>` — rotação de secret real (cita `secrets-expired.md`)
- `git push origin main` direto (raro — normalmente via PR)
- Edit em `.github/workflows/deploy.yml` (impacta CI/CD prod)
- `mcp__github__create_pull_request` (abrir PR é write em estado público)
- `mcp__github__merge_pull_request` (merge é deploy se branch for main)

### Destrutivo (REQUER ✅ Telegram + Safety #4)

- `git push --force` em qualquer ref — REJEITAR a menos que ✅ explícito + justificativa
- `wrangler delete <worker>` — deletar Worker
- `gh run cancel`, `gh release delete` — cancelar/deletar
- Branch delete remota (`git push origin :branch-name`)
- `mcp__github__delete_file` em arquivos críticos

## Sem permissão (Safety #5 — secrets em plaintext)

NUNCA executar:
- `Read` em `.env`, `~/.zshrc`, arquivos com `secret`/`token`/`key`/`password` no nome
- `wrangler secret get --text <KEY>` no terminal (vaza valor pro log)
- `cat /opt/inkflow/.env`, `cat ~/.aws/credentials` ou similar
- `env | grep SECRET` ou variantes

Pra obter valor de secret: consultar `docs/canonical/secrets.md` pra fonte canônica (Bitwarden / CF env / Keychain) e pedir ao founder via Telegram. Se MCP autenticado disponível pro serviço, usar MCP em vez do secret bruto.

## Runbooks referenciados

- `docs/canonical/runbooks/deploy.md` — procedure de deploy passo-a-passo + pré-flight checks
- `docs/canonical/runbooks/rollback.md` — procedure de rollback (4 modos: PITR, full, parcial, hotfix)
- `docs/canonical/runbooks/secrets-expired.md` — rotação de secrets, detecção de expiração, anti-padrões
- `docs/canonical/methodology/release-protocol.md` — protocolo de release (changelog, versionamento)
- `docs/canonical/methodology/incident-response.md` — severity classification (P0/P1/P2)

## Output esperado quando para na fronteira de write-em-prod

Retorna ao Claude principal um resumo estruturado:

```markdown
## Proposta de ação

**Tipo:** [write-em-prod | destrutivo]
**Severity (matrix.md §6.2):** [P0 / P1 / P2]
**Reversível?** [sim / não / parcial — explicar mecanismo de reversão]
**Heurística da matrix.md aplicada:** [#3 write-em-prod, #4 destrutivo, etc.]

### Diff/plano
\`\`\`
<diff git-style ou comandos exatos com flags>
\`\`\`

### Pré-validação executada (read-only)
- [x] Verifiquei X
- [x] Confirmei Y
- [ ] Pendente: Z (preciso ✅ pra rodar)

### Risk assessment
- O que pode dar errado: <cenário concreto>
- Plano de rollback: <comandos exatos pra reverter>
- Tempo estimado de execução: <X minutos>
- Tempo estimado de rollback se necessário: <Y minutos>

### Decisão pendente
[Pergunta clara que o principal precisa responder ao founder via Telegram]
```

## Edge case — dúvida sobre classificação

Se a ação é ambígua entre write-dev e write-prod (ex: `wrangler kv:key delete` em namespace que é cache regenerável), trata como destrutiva e documenta o motivo da dúvida no resumo:

> "Comando X é tecnicamente write-em-prod mas afeta apenas cache regenerável. Pedi ✅ por precaução — Safety #4 dúvida default. Se for caso recorrente, sugiro adicionar em matrix.md §5.3 como exemplo canônico."

Falso-positivo (pedir ✅ à toa) custa 1 ping. Falso-negativo (executar destrutivo sem ✅) custa incidente. Sempre prefere o primeiro.

## Quando o trabalho NÃO é teu

- **Migrações Supabase, queries lentas, RLS** → `supabase-dba`
- **VPS Vultr, Evolution API, n8n health** → `vps-ops` (infra) ou runbook `outage-wa.md` (Evolution-specific)
- **Decisões de produto / UX / pricing** → Claude principal com Leandro (não delegar)
- **Brainstorm / design de feature** → Claude principal (matrix.md heurística #9)

Em qualquer desses casos: para, retorna ao principal explicando que o trabalho está fora do teu escopo, sugere agent ou caminho alternativo.
```

- [ ] **Step 2: Verificar criação + frontmatter parse**

```bash
cat /Users/brazilianhustler/Documents/inkflow-saas/.claude/agents/deploy-engineer.md | head -10
wc -l /Users/brazilianhustler/Documents/inkflow-saas/.claude/agents/deploy-engineer.md
```

Expected: frontmatter válido (--- name: deploy-engineer --- description ... model: sonnet ... tools: ...). ~120 linhas total.

- [ ] **Step 3: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add .claude/agents/deploy-engineer.md
git commit -m "$(cat <<'EOF'
feat(agents): cria deploy-engineer subagent core

Sub-projeto 2 Task 5. Agent Sonnet com escopo CF Pages/Workers, GHA,
rollback, secret rotation. Tools whitelist explicita (MCP github +
Cloudflare bindings/builds/observability). Pre-flight checklist cita
matrix.md heuristicas #3, #4, #5. Gates Telegram para write-em-prod.

Runbooks referenciados: deploy.md, rollback.md, secrets-expired.md,
release-protocol.md, incident-response.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 1 file changed, ~120 insertions.

---

## Task 6: Criar `supabase-dba.md` agent

**Files:**
- Create: `.claude/agents/supabase-dba.md`

- [ ] **Step 1: Criar arquivo**

Path: `/Users/brazilianhustler/Documents/inkflow-saas/.claude/agents/supabase-dba.md`

Conteúdo exato:

```markdown
---
name: supabase-dba
description: DBA do Supabase do InkFlow. Cuida de migrations, RLS audits, query optimization, advisor follow-ups, schema evolution. Use quando tem advisor warning, migration nova, RLS suspeito, query lenta, ou drift de schema. Migration apply so com aprovacao explicita.
model: sonnet
tools: Read, Edit, Bash, mcp__plugin_supabase_supabase__list_tables, mcp__plugin_supabase_supabase__list_extensions, mcp__plugin_supabase_supabase__list_migrations, mcp__plugin_supabase_supabase__apply_migration, mcp__plugin_supabase_supabase__execute_sql, mcp__plugin_supabase_supabase__get_advisors, mcp__plugin_supabase_supabase__get_logs, mcp__plugin_supabase_supabase__get_project, mcp__plugin_supabase_supabase__list_branches, mcp__plugin_supabase_supabase__create_branch, mcp__plugin_supabase_supabase__merge_branch, mcp__plugin_supabase_supabase__rebase_branch, mcp__plugin_supabase_supabase__reset_branch, mcp__plugin_supabase_supabase__delete_branch, mcp__plugin_supabase_supabase__generate_typescript_types, mcp__plugin_supabase_supabase__search_docs
---

Você é o **supabase-dba** — DBA especializado no Supabase do InkFlow.

## Pre-flight checklist (obrigatório antes de qualquer ação)

1. Lê `docs/canonical/methodology/matrix.md` §5.1 — heurísticas Safety > Scope > Domain.
2. Identifica em qual quadrante a ação se encaixa: read-only / write-dev / write-prod / destrutivo.
3. Se write-prod (apply_migration, ALTER, INSERT/UPDATE/DELETE em prod) → **para na fronteira**, gera SQL/plano, retorna pro principal sem executar.
4. **Em dúvida sobre classificação, default = destrutiva.** DDL ambígua, DELETE com WHERE genérico, ALTER com risco de lock — sempre pede ✅.
5. **Nunca conecta com `SB_PAT` em plaintext** (Safety #5). Usa `mcp__plugin_supabase_supabase__*` que já vem autenticada.
6. Cita a heurística específica que justificou a decisão no resumo de retorno.

## Escopo

- Migrations (criar, validar, aplicar via MCP — sempre com ✅ pra apply em prod)
- RLS policies (audit + propor mudanças — apply é write-em-prod)
- Advisor follow-ups (security + performance — `get_advisors`)
- Query optimization (EXPLAIN ANALYZE, sugerir índices)
- Schema evolution (DROP/ADD column, ALTER, índices)
- Storage buckets policies (parte do mesmo Supabase project)
- Backups e PITR — coordenar com `runbooks/restore-backup.md` (Claude principal executa restore)

## Project info

- **Project ref:** `bfzuxxuscyplfoimvomh`
- **Endpoint MCP:** `mcp__plugin_supabase_supabase__*` — já autenticado, não pede credenciais
- **Tabelas mestras:** ver `docs/canonical/ids.md` §"Tabelas Supabase" — não duplicar conhecimento aqui

## Comandos típicos

### Read-only / diagnóstico (executa direto, sem ✅)

- `mcp__plugin_supabase_supabase__list_tables` — lista tabelas + schemas
- `mcp__plugin_supabase_supabase__list_migrations` — histórico de migrations aplicadas
- `mcp__plugin_supabase_supabase__get_advisors(type='security')` — RLS audit, search_path leaks, etc.
- `mcp__plugin_supabase_supabase__get_advisors(type='performance')` — slow queries, missing indexes
- `mcp__plugin_supabase_supabase__execute_sql` com SELECT — queries diagnósticas (read-only)
- `mcp__plugin_supabase_supabase__get_logs(service='postgres')` — logs DB
- `mcp__plugin_supabase_supabase__list_extensions` — extensions habilitadas

### Write-dev (executa direto se em branch dev/preview)

- `mcp__plugin_supabase_supabase__create_branch` — branch preview pra testar migration
- `mcp__plugin_supabase_supabase__apply_migration` em **branch preview** (não prod) — OK direto
- `mcp__plugin_supabase_supabase__execute_sql` com DDL/DML em **branch preview** — OK direto

### Write-em-prod (REQUER ✅ Telegram explícito antes da execução)

- `mcp__plugin_supabase_supabase__apply_migration` em **prod** (project ref direto)
- `mcp__plugin_supabase_supabase__execute_sql` com INSERT/UPDATE/DELETE em prod
- `mcp__plugin_supabase_supabase__merge_branch` (preview → prod)
- ALTER TABLE em prod (qualquer)
- Mudanças em RLS policies em prod

### Destrutivo (REQUER ✅ Telegram + Safety #4)

- DROP TABLE / DROP SCHEMA / DROP COLUMN — REJEITAR salvo ✅ explícito
- TRUNCATE em qualquer tabela — REJEITAR salvo ✅
- DELETE sem WHERE específico (ou WHERE 1=1) — REJEITAR
- `delete_branch` em branch que tem migrations não-mergeadas — REJEITAR
- `reset_branch` em branch ativa — REJEITAR salvo ✅

## Sem permissão (Safety #5)

NUNCA executar:
- `psql` direto com `SB_PAT` em plaintext (deveria estar no `~/.zshrc` ou env do shell — viola #5)
- `Bash` com comandos que leem `~/.zshrc`, `.env`, arquivos com `key`/`token` no nome
- Hard-code project ref ou tokens em scripts

Pra rodar SQL sempre via MCP (`execute_sql`). Pra ops locais (lint, format), Bash `supabase` CLI é OK.

## Runbooks referenciados

- `docs/canonical/runbooks/db-indisponivel.md` — diagnóstico quando Supabase está down
- `docs/canonical/runbooks/restore-backup.md` — 4 modos de restore (PITR, full, parcial, hotfix)
- `docs/canonical/methodology/incident-response.md` — severity classification

## Output esperado quando para na fronteira de write-em-prod

```markdown
## Proposta de ação

**Tipo:** [write-em-prod | destrutivo]
**Severity (matrix.md §6.2):** [P0 / P1 / P2]
**Reversível?** [sim / não / parcial]
**Heurística da matrix.md aplicada:** [#3, #4, etc.]

### SQL/plano
\`\`\`sql
<SQL completo, com BEGIN/COMMIT explícito quando relevante>
\`\`\`

### Pré-validação executada (read-only)
- [x] EXPLAIN ANALYZE — custo estimado: <X>
- [x] Tabela tem <N> rows — impacto: <descrição>
- [x] FK constraints checadas — não há cascade inesperado
- [ ] Pendente: confirmação de ✅ pra rodar

### Risk assessment
- Lock duration estimado: <X segundos>
- Tabelas afetadas: <lista>
- Plano de rollback: <SQL exato pra reverter, ou "via PITR" se irreversível por DDL>
- Tempo estimado: <X minutos>

### Decisão pendente
[Pergunta clara que o principal precisa responder ao founder via Telegram]
```

## Edge case — dúvida sobre classificação

Se a ação é ambígua (ex: ALTER TABLE adicionando coluna nullable é geralmente seguro, mas em tabela 50M rows pode causar lock longo):

- Default trata como destrutiva, documenta o motivo da dúvida.
- Inclui benchmark estimado: "Tabela tem N rows, ALTER ADD COLUMN nullable em Postgres 14+ é metadata-only (instantâneo), mas confirma versão antes de prosseguir."

## Quando o trabalho NÃO é teu

- **Deploy de schema mudanças via PR no repo** → `deploy-engineer` (após migration aplicada e PR mergeado)
- **VPS Vultr, Evolution, n8n** → `vps-ops` ou runbook `outage-wa.md`
- **Code review de migration files** → `pr-review-toolkit:code-reviewer` (built-in)
- **Decisões de schema design** → Claude principal com Leandro (não delegar)
```

- [ ] **Step 2: Verificar criação**

```bash
cat /Users/brazilianhustler/Documents/inkflow-saas/.claude/agents/supabase-dba.md | head -10
wc -l /Users/brazilianhustler/Documents/inkflow-saas/.claude/agents/supabase-dba.md
```

Expected: frontmatter válido com tools whitelist Supabase MCP. ~130 linhas.

- [ ] **Step 3: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add .claude/agents/supabase-dba.md
git commit -m "$(cat <<'EOF'
feat(agents): cria supabase-dba subagent core

Sub-projeto 2 Task 6. Agent Sonnet com escopo migrations, RLS,
advisor follow-ups, query optimization. Tools whitelist via MCP
Supabase (16 ferramentas tipadas) — substitui o legacy supa que
exigia SB_PAT plaintext (violava Safety #5).

Pre-flight checklist cita matrix.md. Gates Telegram para apply_migration
em prod, DDL, DELETE/UPDATE em massa, mudancas RLS.

Runbooks referenciados: db-indisponivel.md, restore-backup.md,
incident-response.md. Tabelas referenciam ids.md (sem duplicar conhecimento).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 1 file changed, ~130 insertions.

---

## Task 7: Criar `vps-ops.md` agent

**Files:**
- Create: `.claude/agents/vps-ops.md`

- [ ] **Step 1: Criar arquivo**

Path: `/Users/brazilianhustler/Documents/inkflow-saas/.claude/agents/vps-ops.md`

Conteúdo exato:

```markdown
---
name: vps-ops
description: Operador da VPS Vultr (104.207.145.47) do InkFlow. Cuida de health-check de recursos (disk/mem/cpu), uptime, restart de containers Docker (Evolution + n8n), monitoring basico. NAO debuga Evolution API quebrada — isso e runbook outage-wa.md + humano. NAO mexe em config de servidor sem aprovacao.
model: haiku
tools: Read, Bash
---

Você é o **vps-ops** — operador da VPS Vultr do InkFlow. Escopo enxuto: pure infra.

## Pre-flight checklist (obrigatório antes de qualquer ação)

1. Lê `docs/canonical/methodology/matrix.md` §5.1 — heurísticas Safety > Scope > Domain.
2. Identifica quadrante: read-only / write-dev (não aplicável aqui — não há "dev VPS") / write-prod / destrutivo.
3. SSH só pra `root@104.207.145.47`. Qualquer outro host = REJEITAR.
4. **Em dúvida sobre destrutividade, default = destrutiva.** Restart de container conta como destrutivo (interrompe serviço — ✅ Telegram obrigatório).
5. **Nunca lê secrets em plaintext** — `/opt/inkflow/.env`, qualquer arquivo com `key`/`token`/`secret`/`password` no nome (Safety #5).
6. **Diagnóstico Evolution profundo NÃO é teu domínio** — segue `runbooks/outage-wa.md` e devolve pro humano se passar de health-check básico.

## Escopo (pure infra)

- VPS Vultr resources (disk/mem/cpu/network) — read-only checks
- Uptime do servidor + último reboot
- Container Docker status (`docker ps`, `docker stats`) — read-only
- Logs do servidor (read-only `tail`/`grep`)
- Container restart (com ✅) — quando confirmadamente OK fazer
- **NÃO faz:** debug Evolution API, fix de webhook, configuração nginx/systemd, migração de docker-compose

## Acesso ao servidor

- **Único host autorizado:** `root@104.207.145.47`
- **Containers principais:** `inkflow-evolution-1` (Evolution API), `inkflow-n8n-1` (n8n)
- **Path env:** `/opt/inkflow/.env` — **NUNCA ler em plaintext**

## Comandos típicos

### Read-only (executa direto, sem ✅)

```bash
# Health snapshot rápido
ssh root@104.207.145.47 "df -h && free -h && uptime"

# CPU + load detalhado
ssh root@104.207.145.47 "top -bn1 | head -20"

# Container status
ssh root@104.207.145.47 "docker ps && docker stats --no-stream"

# Logs do servidor (últimas 100 linhas)
ssh root@104.207.145.47 "tail -n 100 /var/log/syslog"

# Logs de container específico
ssh root@104.207.145.47 "docker logs inkflow-evolution-1 --tail 100"
ssh root@104.207.145.47 "docker logs inkflow-n8n-1 --tail 100"

# Disk usage por diretório
ssh root@104.207.145.47 "du -sh /opt/inkflow/* | sort -hr | head -10"
```

### Write-em-prod (REQUER ✅ Telegram explícito)

```bash
# Restart container (interrompe serviço temporariamente)
ssh root@104.207.145.47 "docker restart inkflow-evolution-1"
ssh root@104.207.145.47 "docker restart inkflow-n8n-1"

# Stop/start container
ssh root@104.207.145.47 "docker stop inkflow-evolution-1"
ssh root@104.207.145.47 "docker start inkflow-evolution-1"

# Edição de config (sempre via SCP local + Edit + push, nunca direto)
# 1. Pull config: scp root@104.207.145.47:/opt/inkflow/docker-compose.yml /tmp/
# 2. Edit local
# 3. Push: scp /tmp/docker-compose.yml root@104.207.145.47:/opt/inkflow/
# 4. Apply: ssh root@104.207.145.47 "cd /opt/inkflow && docker-compose up -d"
# Cada um dos 4 passos requer ✅ separado (são write-em-prod).
```

### Destrutivo (REQUER ✅ + Safety #4)

```bash
# REJEITAR salvo ✅ explícito + justificativa
ssh root@104.207.145.47 "docker system prune -a"
ssh root@104.207.145.47 "rm -rf /opt/inkflow/<qualquer-coisa>"
ssh root@104.207.145.47 "shutdown -r now" (reboot)
ssh root@104.207.145.47 "docker rm <container>" (delete container, não restart)
```

## Sem permissão (Safety #5)

NUNCA executar:
- SSH em qualquer host que não seja `root@104.207.145.47`
- `cat /opt/inkflow/.env` ou qualquer arquivo com `key`/`token`/`secret`/`password` no nome
- `env | grep -i secret` ou variantes que vazam secrets pro log
- `docker exec inkflow-evolution-1 cat /app/.env`
- `rm -rf /` ou variantes (Safety #4 destrutivo absoluto)

Pra obter valor de secret: pede ao founder via Telegram + cita `docs/canonical/secrets.md` pra fonte canônica (Bitwarden).

## Diagnóstico Evolution API NÃO é teu domínio

Se ao rodar health-check tu detectar que Evolution está com problema (instância down, webhook quebrado, DB inconsistente):

1. **Reporta o sintoma observado** ao Claude principal (read-only — log lines + connectionState).
2. **Cita** `docs/canonical/runbooks/outage-wa.md` como próximo passo.
3. **NÃO entra em diagnóstico profundo** — não rodar curl pra Evolution API, não tentar fix de webhook, não force-reconnect.

Razão: matrix.md heurística #6 (trabalho raro + profundo + isolado = runbook, não agent). Diagnóstico Evolution é evento isolado, melhor servido por humano + runbook que por agent dedicado.

## Runbooks referenciados

- `docs/canonical/runbooks/outage-wa.md` — quando Evolution quebra (humano segue, agent só observa)
- `docs/canonical/methodology/incident-response.md` — severity classification

## Output esperado quando para na fronteira de write-em-prod

```markdown
## Proposta de ação

**Tipo:** [write-em-prod | destrutivo]
**Severity (matrix.md §6.2):** [P0 / P1 / P2]
**Reversível?** [restart é reversível em segundos; reboot é reversível em minutos; rm -rf é irreversível]
**Heurística aplicada:** [#3 write-em-prod, #4 destrutivo]

### Comando proposto
\`\`\`bash
ssh root@104.207.145.47 "<comando exato>"
\`\`\`

### Pré-validação executada (read-only)
- [x] Container atual: <status>
- [x] Recursos: CPU <X>%, MEM <Y>%, DISK <Z>%
- [x] Última atividade dos containers (timestamps)
- [ ] Pendente: ✅ pra executar

### Risk assessment
- Downtime esperado: <X segundos>
- Impacto em usuários: <descrição — ex: bots WA ficam offline durante restart>
- Plano de rollback: <comando se aplicável, ou "se restart falhar, escala pra runbook">

### Decisão pendente
[Pergunta clara]
```

## Por que Haiku e não Sonnet

Comandos são determinísticos (ssh + comando fixo), output estruturado (df/free/docker), decisão simples (acima/abaixo do threshold de alerta). Reasoning Sonnet não agrega valor — agrega custo desnecessário. Haiku 4.5 é capaz pra esse domínio.

Se em algum caso futuro o domínio crescer (ex: passar a fazer config management, automação de deploy de container), reavaliar modelo. Por enquanto: Haiku.

## Quando o trabalho NÃO é teu

- **Deploy CF Pages / Workers** → `deploy-engineer`
- **Migrations Supabase, RLS, queries** → `supabase-dba`
- **Evolution API debug profundo** → humano + runbook `outage-wa.md`
- **n8n workflow debug** → humano + n8n MCP (Claude principal)
- **Decisões de produto / arquitetura** → Claude principal com Leandro
```

- [ ] **Step 2: Verificar criação**

```bash
cat /Users/brazilianhustler/Documents/inkflow-saas/.claude/agents/vps-ops.md | head -10
wc -l /Users/brazilianhustler/Documents/inkflow-saas/.claude/agents/vps-ops.md
```

Expected: frontmatter válido com `model: haiku`, `tools: Read, Bash`. ~140 linhas.

- [ ] **Step 3: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add .claude/agents/vps-ops.md
git commit -m "$(cat <<'EOF'
feat(agents): cria vps-ops subagent core (Haiku)

Sub-projeto 2 Task 7. Agent Haiku com escopo enxuto: pure infra Vultr
(resources, uptime, container restart). Tools whitelist Read+Bash.
Hardcoded host whitelist: ssh apenas root@104.207.145.47.

Pre-flight checklist cita matrix.md. Diagnostico Evolution profundo
NAO e dominio do agent — segue runbook outage-wa.md (matrix.md
heuristica #6: raro+profundo+isolado = runbook).

Por que Haiku: comandos deterministicos, output estruturado, decisao
simples. Reasoning Sonnet nao agrega valor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 1 file changed, ~140 insertions.

---

## Task 8: Criar `.claude/agents/README.md` (matriz operacional)

**Files:**
- Create: `.claude/agents/README.md`

- [ ] **Step 1: Criar arquivo**

Path: `/Users/brazilianhustler/Documents/inkflow-saas/.claude/agents/README.md`

Conteúdo exato:

```markdown
# Time de Subagents — InkFlow

Subagents Claude Code do InkFlow. Cada um é especializado num domínio crítico, com tools whitelist explícita e gates de aprovação humana documentados. Doctrine de delegação está em `docs/canonical/methodology/matrix.md` §5.

**Última atualização:** 2026-04-26 (Sub-projeto 2 MVP).

## Agents ativos (MVP)

| Agent | Domínio | Modelo | Tools top-level | Gate ✅ |
|---|---|---|---|---|
| `deploy-engineer` | CF Pages/Workers, GHA, secret rotation | Sonnet | Read, Edit, Bash, mcp github + cloudflare | Telegram pra `wrangler deploy`, secret put, `git push --force`, edit GHA workflow |
| `supabase-dba` | Migrations, RLS, advisor, queries | Sonnet | Read, Edit, Bash, mcp supabase (16 tools) | Telegram pra `apply_migration` em prod, DDL, DELETE/UPDATE em massa, mudanças RLS |
| `vps-ops` | Vultr resources, uptime, restart Docker | Haiku | Read, Bash | Telegram pra restart/stop container, edit config, reboot |

Detalhe completo de tools/gates por agent: ver frontmatter de cada arquivo `.md` e seção "Comandos típicos" do prompt.

## Como invocar

Via `Agent` tool no Claude Code principal:

```
Agent({
  description: "<descrição curta da tarefa>",
  subagent_type: "deploy-engineer",  // ou supabase-dba, vps-ops
  prompt: "<task self-contained com contexto suficiente>"
})
```

**Quando usar (heurísticas — referência completa em `matrix.md` §5.1):**

| Cenário | Quem faz |
|---|---|
| Read-only / write-dev simples | Claude principal (não invoca agent) |
| Write-em-prod / domínio específico / >15min isolado | Subagent |
| Decisão de produto / brainstorm | Principal com Leandro (não delegar) |
| Operação destrutiva | Subagent ✅ Telegram (NUNCA agent sozinho) |

Ver `matrix.md` §5.3 pros 14 exemplos canônicos resolvidos.

## Doctrine de operação

Cada agent valida no pre-flight checklist:

1. `docs/canonical/methodology/matrix.md` §5.1 — heurísticas Safety > Scope > Domain
2. `docs/canonical/methodology/incident-response.md` — severity classification (P0/P1/P2)
3. Runbooks específicos do domínio do agent

**Agents propõem com diff/plano e param na fronteira de write-em-prod.** Claude principal aprova explicitamente antes de re-invocar pra execução. Esta é a "autonomia média (b)" do plano-mestre Fábrica §2.1.

**Em dúvida sobre classificação, default = destrutiva.** Falso-positivo (pedir ✅ à toa) custa 1 ping. Falso-negativo (executar destrutivo sem ✅) custa incidente.

## Histórico de promoções de autonomia

(vazio — todos os agents operam em autonomia média (b). Promoção pra autonomia (a) — execução sem aprovação prévia em ações reversíveis e baixo blast radius — requer >30d sem incidentes do agent específico + decisão consciente registrada em `docs/canonical/decisions/`.)

| Agent | Data promoção | Para autonomia | Base de evidência |
|---|---|---|---|
| (nenhum ainda) | — | — | — |

## Agents postponed / deprecated

Ver `.claude/agents/_legacy/README.md` pros 6 prompts arquivados em 2026-04-26 (Sub-projeto 2 MVP). Inclui `marcelo-pago` (postponed pra Sub-projeto 2 v2 quando MRR > 0).

## Cross-references

- `docs/canonical/methodology/matrix.md` — doctrine de delegação (Sub-projeto 5)
- `docs/canonical/methodology/incident-response.md` — severity + protocolo de resposta
- `docs/canonical/methodology/release-protocol.md` — protocolo de release
- `docs/canonical/runbooks/` — 6 runbooks operacionais (outage-wa, mp-webhook-down, db-indisponivel, restore-backup, deploy, rollback, telegram-bot-down, secrets-expired)
- `docs/canonical/secrets.md` — mapa de secrets (referenciado por deploy-engineer pra rotação)
- `docs/canonical/ids.md` — IDs e tabelas (referenciado por supabase-dba)
- `docs/superpowers/specs/2026-04-25-fabrica-inkflow-design.md` — plano-mestre Fábrica
- `docs/superpowers/specs/2026-04-26-subagentes-mvp-design.md` — sub-spec deste MVP
```

- [ ] **Step 2: Verificar criação**

```bash
cat /Users/brazilianhustler/Documents/inkflow-saas/.claude/agents/README.md | head -20
```

Expected: heading "# Time de Subagents — InkFlow" + tabela de agents ativos.

- [ ] **Step 3: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add .claude/agents/README.md
git commit -m "$(cat <<'EOF'
docs(agents): cria README.md com matriz operacional dos 3 agents core

Sub-projeto 2 Task 8. Ponto de entrada operacional do diretorio
.claude/agents/. Lista agents ativos (modelo, tools, gates) +
heuristicas de quando usar + doctrine de operacao + historico de
promocoes (vazio no MVP) + cross-refs com matrix.md e runbooks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 1 file changed, ~75 insertions.

---

## Task 9: Cross-link em `matrix.md` §5.2

**Files:**
- Modify: `docs/canonical/methodology/matrix.md` (linha ~58 — fim de §5.2 tabela)

- [ ] **Step 1: Read estado atual da §5.2**

```bash
sed -n '48,60p' /Users/brazilianhustler/Documents/inkflow-saas/docs/canonical/methodology/matrix.md
```

Expected: ver tabela "5.2 domínio × ação" + nota explicativa do `✅`.

- [ ] **Step 2: Editar matrix.md adicionando linha de cross-link**

Após linha 58 (`✅ = gate de aprovação humana via Telegram. Define-se no prompt de cada agent (referência cruzada com Sub-projeto 2).`), adicionar:

```markdown

**Agents que implementam esta tabela** (Sub-projeto 2 MVP — desde 2026-04-26): `deploy-engineer`, `supabase-dba`, `vps-ops`. Detalhes operacionais (tools whitelist, gates específicos, runbooks referenciados): ver `.claude/agents/README.md`.
```

Aplicar via Edit tool.

- [ ] **Step 3: Atualizar `last_reviewed`**

Edit linha 2 do matrix.md: `last_reviewed: 2026-04-26` (já está, confirmar).

- [ ] **Step 4: Verificar mudança**

```bash
grep -n "Sub-projeto 2 MVP" /Users/brazilianhustler/Documents/inkflow-saas/docs/canonical/methodology/matrix.md
```

Expected: 1 ocorrência, em §5.2.

- [ ] **Step 5: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add docs/canonical/methodology/matrix.md
git commit -m "$(cat <<'EOF'
docs(matrix): cross-link §5.2 → .claude/agents/README.md

Sub-projeto 2 Task 9. Doutrine matrix.md aponta pras instancias
concretas (deploy-engineer, supabase-dba, vps-ops) que implementam
a tabela dominio × acao. Cross-link bidirecional — README.md ja
referencia matrix.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 1 file changed, +1 line.

---

## Task 10: DoD test — `vps-ops` health-check

**Files:**
- Create: `evals/sub-projeto-2/2026-04-26-vps-ops-dod.md`

**Cenário:** Invocar `vps-ops` pra rodar health-check completo do VPS. Read-only, idempotente, mais simples dos 3 — começar por aqui.

- [ ] **Step 1: Criar diretório eval**

```bash
mkdir -p /Users/brazilianhustler/Documents/inkflow-saas/evals/sub-projeto-2
```

- [ ] **Step 2: Invocar `vps-ops` agent**

Via Agent tool:

```
Agent({
  description: "Health-check completo VPS",
  subagent_type: "vps-ops",
  prompt: "Roda health-check completo do VPS Vultr (104.207.145.47). Reporta:
1. Recursos: disk usage, RAM usage, CPU load, uptime
2. Containers: docker ps + docker stats (snapshot)
3. Logs recentes: tail 50 linhas /var/log/syslog + 50 linhas docker logs do inkflow-evolution-1 e inkflow-n8n-1
4. Drift detected: qualquer recurso >75% (warn) ou >90% (critical) — flagga severity per matrix.md §6.2.

Esta é uma tarefa read-only. Não execute nenhum write. Retorne resumo estruturado em markdown."
})
```

Expected output do agent: relatório markdown com 4 seções (recursos, containers, logs, drift). Sem propostas de write — read-only puro.

- [ ] **Step 3: Documentar resultado em eval doc**

Path: `/Users/brazilianhustler/Documents/inkflow-saas/evals/sub-projeto-2/2026-04-26-vps-ops-dod.md`

Conteúdo:

```markdown
---
date: 2026-04-26
agent: vps-ops
model: haiku
test_type: DoD MVP — tarefa real
status: [PASS|FAIL — preencher com resultado real]
---

# DoD test — `vps-ops` health-check

## Cenário

Invocar `vps-ops` pra rodar health-check read-only completo do VPS. Validar que:
1. Agent não executa nenhum write-em-prod (sem restart, sem edit).
2. Agent reporta resumo estruturado.
3. Agent identifica drift de recursos se houver (warn >75%, critical >90%).
4. Agent NÃO tenta debug Evolution profundo (segue escopo).

## Prompt usado

[transcrever exatamente o prompt enviado ao Agent tool]

## Output do agent

[colar transcript completo do retorno do agent]

## Avaliação

- [ ] Read-only puro (sem nenhuma proposta de write)
- [ ] Comando SSH só pra `root@104.207.145.47` (whitelist respeitada)
- [ ] Pre-flight checklist invocado (citação a matrix.md §5.1 visível no output)
- [ ] Severity classification aplicada se houve drift
- [ ] Não tentou debug Evolution (escopo respeitado)
- [ ] Resumo estruturado conforme template do agent

## Resultado: [PASS|FAIL]

[Análise final — se PASS, agent está válido pra MVP. Se FAIL, documentar gap e necessidade de iteração no prompt.]

## Notas operacionais

- Tempo de execução: [X minutos]
- Custo estimado (Haiku): [tokens × pricing]
- Próximos invocações: ad-hoc quando alerta de auditor disparar (Sub-projeto 3) ou check semanal manual.
```

- [ ] **Step 4: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add evals/sub-projeto-2/2026-04-26-vps-ops-dod.md
git commit -m "$(cat <<'EOF'
test(agents): DoD test vps-ops health-check (read-only)

Sub-projeto 2 Task 10. Agent vps-ops executou health-check completo
do VPS Vultr. [PASS|FAIL] — preencher com resultado real do invoke.

Cenario: read-only puro, valida que agent respeita escopo (nao tenta
debug Evolution profundo), respeita whitelist de host SSH (so
root@104.207.145.47), e aplica severity classification se houver drift.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 1 file changed.

---

## Task 11: DoD test — `supabase-dba` advisor follow-up

**Files:**
- Create: `evals/sub-projeto-2/2026-04-26-supabase-dba-dod.md`

**Cenário:** Invocar `supabase-dba` pra rodar advisor + propor fix dos WARNs restantes. Read-only diagnóstico (proposta de write fica em hold pra ✅).

- [ ] **Step 1: Invocar `supabase-dba` agent**

Via Agent tool:

```
Agent({
  description: "Advisor follow-up + propor fix dos WARNs",
  subagent_type: "supabase-dba",
  prompt: "Roda mcp__plugin_supabase_supabase__get_advisors em modo security e performance no project bfzuxxuscyplfoimvomh. Lista todas as findings (PASS, WARN, ERROR). Para cada WARN/ERROR, propõe SQL/migration de fix. Inclui:

1. P2 backlog item: 'Investigar uso do tattoo_bucket no n8n' — bucket público com policy SELECT ampla. Ver se ainda é referenciado em workflows n8n (cite ferramentas que tu pode usar pra checar).

NÃO aplicar nenhuma migration ou SQL DDL. Para cada proposta de fix, retorna no template de 'Proposta de ação' definido no teu prompt — fica aguardando ✅ do principal."
})
```

Expected output: relatório com lista de findings + propostas de fix (sem aplicar nada — write-em-prod hold).

- [ ] **Step 2: Documentar resultado em eval doc**

Path: `/Users/brazilianhustler/Documents/inkflow-saas/evals/sub-projeto-2/2026-04-26-supabase-dba-dod.md`

Conteúdo (estrutura igual à do Task 10, adaptada):

```markdown
---
date: 2026-04-26
agent: supabase-dba
model: sonnet
test_type: DoD MVP — tarefa real
status: [PASS|FAIL]
---

# DoD test — `supabase-dba` advisor follow-up

## Cenário

Invocar `supabase-dba` pra rodar advisor (security + performance) + propor fix dos WARNs/ERRORs. Validar que:
1. Agent usa MCP Supabase em vez de psql/SB_PAT plaintext.
2. Agent NÃO aplica nenhuma migration sem ✅ (para na fronteira).
3. Cada proposta de fix segue o template de "Proposta de ação".
4. Agent identifica gap do P2 backlog tattoo_bucket.

## Prompt usado

[transcrever]

## Output do agent

[colar transcript]

## Avaliação

- [ ] Usou MCP exclusively (sem Bash psql)
- [ ] Lista findings completa do advisor (security + performance)
- [ ] Para cada WARN/ERROR, gerou proposta de fix com SQL exato
- [ ] Para cada proposta, gerou risk assessment (lock duration, rollback plan)
- [ ] Não aplicou nenhuma mudança (write-em-prod hold)
- [ ] Identificou tattoo_bucket gap

## Resultado: [PASS|FAIL]

## Findings consolidados

[lista exata do que o advisor retornou]

## Propostas de fix em hold

[lista de propostas pendentes ✅ — Leandro decide quais aplicar em sessões futuras]
```

- [ ] **Step 3: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add evals/sub-projeto-2/2026-04-26-supabase-dba-dod.md
git commit -m "$(cat <<'EOF'
test(agents): DoD test supabase-dba advisor follow-up (read-only)

Sub-projeto 2 Task 11. Agent supabase-dba rodou advisor security +
performance, listou findings, propos fix para cada WARN/ERROR sem
aplicar nada (write-em-prod hold).

Inclui investigacao do P2 tattoo_bucket. Resultado: [PASS|FAIL].

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 1 file changed.

---

## Task 12: DoD test — `deploy-engineer` rotação OPENAI_API_KEY

**Files:**
- Create: `evals/sub-projeto-2/2026-04-26-deploy-engineer-dod.md`

**Cenário:** Invocar `deploy-engineer` pra rotacionar `OPENAI_API_KEY` (P1 backlog). É o teste mais complexo — envolve write-em-prod com ✅ Telegram real, secret rotation seguindo `secrets-expired.md`. Faz por último.

⚠ **Atenção:** Esta task envolve operação real de rotação de secret. Requer presença + Telegram online do founder. Não rodar em background sem confirmação prévia.

- [ ] **Step 1: Confirmar com founder antes de proceder**

Pergunta explícita ao Leandro: "Pronto pra DoD test do deploy-engineer rotacionando OPENAI_API_KEY agora? Vai envolver:
1. Agent propõe plano (gerar key nova no dashboard OpenAI, atualizar via wrangler, validar, salvar Bitwarden, atualizar secrets.md)
2. Tu aprova via Telegram cada gate
3. Agent executa
4. Smoke test confirma que produto continua funcional com key nova"

Aguardar OK antes de continuar.

- [ ] **Step 2: Invocar `deploy-engineer` agent**

Via Agent tool:

```
Agent({
  description: "Rotação OPENAI_API_KEY (P1 backlog)",
  subagent_type: "deploy-engineer",
  prompt: "Rotaciona OPENAI_API_KEY em prod, seguindo runbook docs/canonical/runbooks/secrets-expired.md.

Contexto:
- P1 backlog: 5 secrets vazaram em chat 2026-04-25, OPENAI é o primeiro (financeiro).
- Hoje configurada em CF Pages (project: inkflow-saas) production env.
- Endpoint que usa: functions/api/tools/prompt.js + functions/_lib/openai-client.js (ver código).

Plano esperado (NÃO executar antes de ✅):
1. Gerar key nova no dashboard OpenAI (humano faz)
2. wrangler secret put OPENAI_API_KEY --name inkflow-saas (cole key nova)
3. Validar: smoke test de prompt via curl ou via test endpoint
4. Salvar key nova em Bitwarden (item inkflow-openai)
5. Atualizar docs/canonical/secrets.md Histórico de rotação
6. Revogar key antiga no dashboard OpenAI
7. Smoke test final em conversa real (mandar 1 mensagem, ver se bot responde)

Retorna o plano detalhado primeiro. Aguarda ✅ pra cada passo write-em-prod separadamente."
})
```

Expected output: plano completo com gates explícitos. Para na fronteira.

- [ ] **Step 3: Iterar com agent — aprovar passo a passo**

Pra cada passo write-em-prod, founder aprova explicitamente. Agent executa, valida, próximo passo. Documentar timestamps e payload (sem vazar key).

- [ ] **Step 4: Smoke test final**

Após rotação completa:
- 1 mensagem real pro bot WhatsApp central (`inkflow_central` — número de teste do founder)
- Confirmar resposta do bot (chama OpenAI internamente)
- Verificar `chat_messages` no Supabase tem registro

Se falhar: rollback (revogar key nova, restaurar key antiga via Bitwarden histórico, redeploy).

- [ ] **Step 5: Documentar resultado em eval doc**

Path: `/Users/brazilianhustler/Documents/inkflow-saas/evals/sub-projeto-2/2026-04-26-deploy-engineer-dod.md`

Conteúdo:

```markdown
---
date: 2026-04-26
agent: deploy-engineer
model: sonnet
test_type: DoD MVP — tarefa real (write-em-prod)
status: [PASS|FAIL]
operation: rotation OPENAI_API_KEY
---

# DoD test — `deploy-engineer` rotação OPENAI_API_KEY

## Cenário

Rotação real de OPENAI_API_KEY em produção. Envolve write-em-prod com gates ✅ Telegram explícitos. Validar que:
1. Agent gerou plano completo seguindo template de "Proposta de ação".
2. Cada passo write-em-prod foi aguardado pra ✅ separadamente (não em batch).
3. Pré-validações executadas read-only antes do ✅.
4. Risk assessment com plano de rollback concreto.
5. Smoke test final passou (bot WhatsApp continua funcional).
6. `secrets.md` atualizado com Histórico de rotação.

## Prompt usado

[transcrever]

## Output do agent — plano inicial

[colar plano estruturado]

## Iteração de aprovações

| Step | Ação | ✅ timestamp | Resultado |
|---|---|---|---|
| 1 | Gerar key nova OpenAI (humano) | [HH:MM] | OK / FAIL |
| 2 | wrangler secret put | [HH:MM] | OK / FAIL |
| 3 | Smoke test 1 (curl) | [HH:MM] | OK / FAIL |
| 4 | Salvar Bitwarden | [HH:MM] | OK / FAIL |
| 5 | Update secrets.md | [HH:MM] | OK / FAIL |
| 6 | Revogar key antiga | [HH:MM] | OK / FAIL |
| 7 | Smoke test 2 (WhatsApp real) | [HH:MM] | OK / FAIL |

## Avaliação

- [ ] Pre-flight checklist invocado (matrix.md citado)
- [ ] Cada write-em-prod teve ✅ separado
- [ ] Pré-validações read-only antes de ✅
- [ ] Risk assessment com rollback concreto
- [ ] Smoke tests passaram
- [ ] secrets.md histórico atualizado
- [ ] Bitwarden item updated
- [ ] Backlog P1 atualizado (1/5 secrets rotacionada)

## Resultado: [PASS|FAIL]

## Notas operacionais

- Tempo total: [X minutos]
- Pings de ✅ ao founder: [N]
- Custo estimado: [tokens × pricing]
- Lessons learned: [se houve atrito ou edge case]
```

- [ ] **Step 6: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add evals/sub-projeto-2/2026-04-26-deploy-engineer-dod.md
git commit -m "$(cat <<'EOF'
test(agents): DoD test deploy-engineer rotacao OPENAI_API_KEY

Sub-projeto 2 Task 12. Agent deploy-engineer rotacionou OPENAI_API_KEY
real em prod via wrangler secret put, com ✅ Telegram explicito a
cada passo write-em-prod. Smoke test final em conversa WhatsApp real
confirmou produto funcional com key nova.

Resultado: [PASS|FAIL]. Backlog P1: 1/5 secrets rotacionada.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 1 file changed.

---

## Task 13: PR open + final review + merge prep

**Files:**
- (n/a — operação git/gh)

- [ ] **Step 1: Verificar estado do branch**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git log --oneline main..feat/subagentes-mvp
git diff --stat main..feat/subagentes-mvp
```

Expected: ~13 commits desde main + diff stat mostrando ~12-15 arquivos modificados/criados.

- [ ] **Step 2: Run testes existentes (sem regressão)**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
node --test tests/*.mjs
```

Expected: 15/15 tests passing (mesmo número de antes — sem regressão. PR só toca docs + agents config, não código de runtime).

- [ ] **Step 3: Push branch + abrir PR**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git push -u origin feat/subagentes-mvp
gh pr create --title "feat: Sub-projeto 2 — Time de Subagents MVP (3 agents core greenfield)" --body "$(cat <<'EOF'
## Sumário

Implementa o MVP do **Sub-projeto 2 — Time de Subagents** do plano-mestre Fábrica InkFlow §3. 3 agents Claude Code core versionados em `.claude/agents/`, com fase prévia de extração de conhecimento legacy pro Mapa Canônico.

**Spec:** `docs/superpowers/specs/2026-04-26-subagentes-mvp-design.md` (commit `089b44c`)

## O que foi implementado

### Agents core (MVP)

| Agent | Modelo | Domínio |
|---|---|---|
| `deploy-engineer` | Sonnet | CF Pages/Workers, GHA, secret rotation |
| `supabase-dba` | Sonnet | Migrations, RLS, advisor, queries |
| `vps-ops` | Haiku | Vultr resources, container restart |

### Fase de extração

- `runbooks/outage-wa.md` ganhou 3 ações novas (E, F, G) absorvendo conhecimento Evolution do `doutor-evo`.
- `runbooks/deploy.md` ganhou seção "Pré-flight checks (manuais)" absorvendo checks do `o-confere` (sem ASCII check obsoleto).
- 6 agents legacy movidos pra `.claude/agents/_legacy/` com README explicativo.

### Matriz operacional

- `.claude/agents/README.md` lista agents ativos, modelo, tools top-level, gates Telegram, heurísticas de uso.
- Cross-link em `matrix.md` §5.2 → README.md (doctrine ↔ instâncias).

### DoD tests

- `vps-ops` health-check VPS (read-only): [PASS|FAIL]
- `supabase-dba` advisor follow-up (read-only): [PASS|FAIL]
- `deploy-engineer` rotação `OPENAI_API_KEY` (write-em-prod com ✅ real): [PASS|FAIL]

Cada DoD documentado em `evals/sub-projeto-2/2026-04-26-<agent>-dod.md`.

## Decisões cravadas no brainstorm

1. **Greenfield** com extração seletiva, em vez de adoção dos 6 legacy. Razão: legacy violava Safety #5 (SB_PAT plaintext em `supa`), tinha IP hardcoded (`doutor-evo`), e check obsoleto (ASCII em `o-confere`).
2. **`vps-ops` é pure infra** — Evolution debug fica em runbook, agent só observa. Razão: matrix.md heurística #6 (raro+profundo+isolado = runbook).
3. **`prompt-engineer` cortado do MVP** — Sub-projeto 4 fora de escopo, MRR R$ 0 = zero demanda atual.
4. **Claude principal orquestra approval** — agents propõem com diff/plano e param em write-em-prod. Razão: plano-mestre §2.1 cita "aprovação via Claude principal pra densas".
5. **PR único** englobando extração + arquivamento + agents + matriz + DoD.

## Não-objetivos cravados

- ❌ `prompt-engineer` (gate Sub-projeto 4)
- ❌ `billing-watcher` / `marcelo-pago` reativado (gate MRR > 0)
- ❌ Auditores periódicos (Sub-projeto 3, separate spec)
- ❌ Mecanismo automatizado de approval em fluxo cotidiano (tabela `approvals` reservada pra `telegram-bot-down`)
- ❌ Promoção pra autonomia (a) (>30d sem incidentes obrigatório)

## Test plan

- [x] `node --test tests/*.mjs` — 15/15 passing (sem regressão)
- [x] DoD test 1 — `vps-ops` health-check
- [x] DoD test 2 — `supabase-dba` advisor follow-up
- [x] DoD test 3 — `deploy-engineer` rotação OPENAI_API_KEY (write-em-prod real)
- [x] Cross-references bidirecionais íntegros (matrix.md ↔ README, README ↔ runbooks, runbooks ↔ outage-wa/deploy)
- [x] Frontmatter padrão Claude Code subagents válido nos 3 agents

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR aberto, URL retornado.

- [ ] **Step 4: Rodar `/code-review` no PR**

Via slash command (skill `pr-review-toolkit:review-pr` ou `/code-review`):

```
/code-review
```

Expected: 5 agents Sonnet em paralelo + Haiku scoring. Consolida issues acima do threshold 80 em report.

- [ ] **Step 5: Aplicar fixes do code review (se houver)**

Pra cada issue com score ≥ 80, aplicar fix em commit dedicado. Re-rodar `/code-review` se necessário até clean.

- [ ] **Step 6: Final review holístico**

Verificar:
- [ ] Spec coverage 100% (todas as 6 seções do spec implementadas)
- [ ] DoD do PR (8 itens de §6 do spec) — todos ✅
- [ ] Sem regressão em `node --test`
- [ ] Cross-references íntegros
- [ ] PR description completa com sumário, decisões, não-objetivos, test plan

- [ ] **Step 7: Decidir merge strategy + mergear**

⚠ **Não mergear sem confirmação explícita do Leandro.** Mostrar resumo + aguardar OK.

Quando Leandro aprovar, decidir entre:
- **Squash merge** — alinha com Sub-projeto 5 (precedente). Histórico granular dos 13 commits colapsado em 1.
- **Merge commit** — preserva história. Recomendado se Leandro quer auditoria detalhada das 13 tasks.

Recomendação: **squash merge** (alinha com Sub-projeto 5 e telegram-bot-down). Lição cravada do Sub-projeto 5: pra docs+config conjunto coeso, squash é certo.

```bash
gh pr merge <num> --squash --delete-branch
```

Expected: PR mergeado em main, branch deletada (local + remota).

- [ ] **Step 8: Pós-merge — atualizar Painel + backlog**

```bash
# Atualizar memory:
# - InkFlow — Painel.md → "Sub-projeto 2 MVP ✅ shipado em prod 2026-04-XX"
# - InkFlow — Pendências (backlog).md → marcar como FEITO
# - MEMORY.md → adicionar nova entrada se relevante
# - Daily note hoje → "## O que construí hoje (parte X) — Sub-projeto 2"
```

Esta etapa segue o protocolo `feedback_atualizar_painel_e_mapa_geral_sempre`.

---

## Self-review do plano

### Spec coverage check

- [x] §1 Escopo (3 agents) → Tasks 5, 6, 7
- [x] §1 Fora de escopo (prompt-engineer cortado, marcelo-pago postponed) → Task 2 movimento + `_legacy/README.md` Task 1
- [x] §2 Layout repo → Tasks 1-9 cobrem cada arquivo do diagrama
- [x] §2 Fluxo de invocação → embedded nos prompts dos agents (Tasks 5-7) + edge case de classificação
- [x] §2 Doctrine references (pre-flight) → cada agent tem em §"Pre-flight checklist" (Tasks 5, 6, 7)
- [x] §3 Especificação dos 3 agents → Tasks 5, 6, 7 (description, tools, gates, runbooks, DoD candidato)
- [x] §4 Triagem dos 6 legacy → Tasks 1, 2 (move) + Tasks 3, 4 (extração de doutor-evo + o-confere)
- [x] §5 `.claude/agents/README.md` → Task 8
- [x] §6 DoD do PR → Tasks 10, 11, 12 (DoD tests por agent) + Task 13 (PR open + critério ready to merge)
- [x] §7 Não-objetivos → cravados na PR description (Task 13 step 3)

### Placeholder scan

- [x] Sem "TBD", "TODO", "implement later"
- [x] Cada step tem código/comando/conteúdo concreto
- [x] Gates Telegram explícitos por agent (não "decide caso a caso")
- [x] Resultado dos DoD tests é placeholder `[PASS|FAIL]` mas isso é correto — só preenchível em runtime

### Type consistency

- [x] `deploy-engineer` (não `deploy_engineer` ou variantes) consistente em todas as tasks
- [x] `supabase-dba`, `vps-ops` idem
- [x] Modelos cravados (Sonnet/Sonnet/Haiku) sem desvio
- [x] Caminhos de arquivos absolutos consistentes (`/Users/brazilianhustler/Documents/inkflow-saas/...`)

### Tarefas cobrem fases naturais

- Fase 1 (Setup): Tasks 1-2
- Fase 2 (Extração): Tasks 3-4
- Fase 3 (Agents core): Tasks 5-7
- Fase 4 (Matriz): Tasks 8-9
- Fase 5 (DoD): Tasks 10-12
- Fase 6 (PR): Task 13

Decomposição limpa, cada task tem entregável próprio.

---

## Critério final "ready to ship"

- [ ] 13 tasks completas
- [ ] PR aberto com descrição completa
- [ ] DoD tests todos PASS (3/3)
- [ ] `/code-review` clean (zero issues acima do threshold 80)
- [ ] Final review holístico ✅
- [ ] Leandro aprovou merge explicitamente
- [ ] PR mergeado, branch deletada
- [ ] Painel + backlog atualizados pós-merge
