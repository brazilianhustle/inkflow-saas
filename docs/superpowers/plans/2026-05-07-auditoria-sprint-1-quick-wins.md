# Auditoria Sprint 1 — Quick Wins (P0 + P3) — Plan macro

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Pattern:** este é um plan **macro** que coordena 5 ondas. Ondas 0, 1, 3, 5 estão totalmente detalhadas aqui. **Ondas 2 e 4 vão receber sub-plans dedicados** (criar quando chegar lá) por envolverem CI/CD e DDL com risco.

**Goal:** Fechar 16+ findings da auditoria (8 P0 críticos + 5 P3 + 3 P2) em ~5h de trabalho concentrado, criando safety net (backup + CI + observability) antes de mexer em DB security.

**Architecture:** Trabalho em 5 ondas sequenciais. Cada onda = 1 commit/PR isolado. Ondas zero-risco e cosméticas primeiro, CI/observability no meio (precondições), DB security e CSP no final (com safety net pronto).

**Tech Stack:** Cloudflare Pages/Workers, Supabase (Postgres 17), n8n (via MCP), GitHub Actions, `wrangler`, `pg_dump` via Supabase MCP `execute_sql`.

---

## Contexto

Inputs:
- Spec: `docs/superpowers/specs/2026-05-07-auditoria-completa-saas-design.md`
- Relatório: `docs/auditoria/2026-05-07-auditoria-completa.md` (2270 linhas — referência principal)
- Findings cobertos por este plan: F2.8.2, F1.4.6, F1.7.3, F1.6.8, F1.4.12, F1.4.8, F1.4.10, F1.4.5, F1.3.8, F2.4.4, F1.5.3, F1.3.1, F2.5.1, F1.4.2, F1.4.3, F1.5.5, F1.5.6

**Não escopo deste plan** (ficam pra Sprint 2+):
- F2.4.1 Auth tests (M-week)
- F2.4.2 Billing tests (M-week)
- F2.4.3 Evolution endpoints tests
- F1.6.4-6 Auditores novos (n8n health, evo per-tenant, tool integrity)
- F2.6.3 Rate limiting
- Refator multi-agent (Sprint 4+)

## Pré-condições

- [ ] **PC1 — Branch principal limpo**

```bash
git checkout main
git fetch origin --prune
git reset --hard origin/main
git status
```

Expected: `nothing to commit, working tree clean` + HEAD em `60847a5` ou mais novo.

- [ ] **PC2 — MCPs conectados**

```bash
claude mcp list 2>&1 | grep -E "(supabase|n8n)"
```

Expected: ambos `✓ Connected`.

- [ ] **PC3 — Working dir correto**

Expected: `pwd` retorna `/Users/brazilianhustler/Documents/inkflow-saas`.

---

## Onda 0 — Safety net (35min)

**Findings:** F2.8.2 (schema baseline), F1.4.6 (leaked password protection)

**Estratégia:** snapshot DR antes de qualquer DDL nas Ondas 1+. Toggle de auth é zero-risco e ortogonal.

**Branch:** `chore/auditoria-onda-0-safety-net`

**Files:**
- Create: `supabase/baseline-schema.sql`

### Task 0.1: Criar branch da Onda 0

- [ ] **Step 1: Criar branch a partir de main**

```bash
git checkout -b chore/auditoria-onda-0-safety-net
git status
```

Expected: `On branch chore/auditoria-onda-0-safety-net`, working tree clean.

### Task 0.2: Schema baseline em git (F2.8.2)

**Files:**
- Create: `supabase/baseline-schema.sql`

Como o Supabase MCP não expõe `pg_dump`, vou montar o baseline via queries SQL: tables + views + functions + triggers + policies + indexes — em ordem.

- [ ] **Step 1: Verificar contagens atuais**

Via Supabase MCP `execute_sql`:

```sql
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS tables,
  (SELECT count(*) FROM information_schema.views WHERE table_schema='public') AS views,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AS functions,
  (SELECT count(*) FROM information_schema.triggers WHERE trigger_schema='public') AS triggers,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS policies,
  (SELECT count(*) FROM pg_indexes WHERE schemaname='public') AS indexes;
```

Expected: `tables=16, views=3, functions=9, triggers=4, policies=23, indexes>=20` (segundo Fase 1.4).

- [ ] **Step 2: Gerar DDL completo via execute_sql**

Roda 6 queries pra extrair DDL:

1. `pg_get_viewdef` pras 3 views
2. `pg_get_functiondef` pras 9 functions
3. `pg_get_triggerdef` pros 4 triggers
4. Definição de policies via `pg_policies`
5. CREATE TABLE via metadata (mais complexo; alternativa: `\d+` do psql se rodar local — mas aqui usar metadata como aproximação)
6. CREATE INDEX via `pg_indexes.indexdef`

Como gerar DDL completo via REST API é tedioso, **estratégia alternativa simplificada**:

```bash
# Salva resultado das 6 queries em supabase/baseline-schema.sql como dump narrativo
# (não é restorable 1:1, mas serve como referência durável de "o que existia em 2026-05-07")
```

> **Nota dev:** baseline 100% restorable requereria acesso direto Postgres (via `psql` ou Supabase CLI local). MCP `execute_sql` retorna data, não DDL formatável. **Recomendação pragmática:** abrir issue Sprint 2+ pra fazer dump real via `supabase db dump --schema public > supabase/baseline-schema.sql` quando a CLI estiver instalada. Por agora, este step gera um **inventário narrativo** (lista de objetos + counts + checksums) suficiente como evidência DR.

- [ ] **Step 3: Escrever inventário narrativo**

Conteúdo do `supabase/baseline-schema.sql`:

```sql
-- InkFlow Supabase baseline schema
-- Generated: 2026-05-07
-- Project: bfzuxxuscyplfoimvomh (sa-east-1)
-- Postgres: 17.6.1.084
-- Auditoria source: docs/auditoria/2026-05-07-auditoria-completa.md §1.4
--
-- This is a NARRATIVE inventory, not a 1:1 restorable dump.
-- For restorable dump, use: supabase db dump --schema public --linked

-- ============================================================
-- TABLES (16)
-- ============================================================
-- public.tenants                  (rls_enabled, 1 row)
-- public.dados_cliente            (rls_enabled, 1 row)
-- ... [completar com lista do §1.4]

-- ============================================================
-- VIEWS (3)
-- ============================================================
-- ⚠️ public.audit_current_state — SECURITY DEFINER (será corrigido em Onda 4)
-- ⚠️ public.orcamentos — SECURITY DEFINER (será corrigido em Onda 4)
-- public.tenant_stats — OK

-- ============================================================
-- RPCs / FUNCTIONS (9)
-- ============================================================
-- ⚠️ public.expire_trials() — SECURITY DEFINER, callable by anon (será corrigido em Onda 4)
-- ⚠️ public.merge_conversa_jsonb(...) — SECURITY DEFINER, callable by anon (Onda 4)
-- public.update_updated_at()
-- public.update_conversa_last_msg_at()
-- public.atualizar_timestamp_campanha() — DEAD CODE (será dropado em Onda 1)
-- public.buscar_historico_campanha(p_telefone, p_limite)
-- public.dashboard_resumo_periodo(p_tenant_id, p_since, p_until)
-- public.dashboard_sinal_recebido(p_tenant_id, p_since)
-- public.dashboard_taxa_conversao(p_tenant_id, p_since)

-- ============================================================
-- TRIGGERS (4)
-- ============================================================
-- chats.trg_chats_updated_at (BEFORE UPDATE)
-- dados_cliente.trg_dados_cliente_updated_at (BEFORE UPDATE)
-- n8n_chat_histories.trg_n8n_chat_histories_update_conversa (AFTER INSERT)
-- tenants.trg_tenants_updated_at (BEFORE UPDATE)

-- ============================================================
-- RLS POLICIES (23)
-- ============================================================
-- [completar com §1.4]

-- ============================================================
-- INDEXES (relevantes pra auditoria)
-- ============================================================
-- ⚠️ dados_cliente.dados_cliente_tenant_id_telefone_key — DUPLICATE (será dropado em Onda 1)
-- ⚠️ dados_cliente.unique_tenant_telefone — KEEP (mesmo conteúdo do anterior)
-- ⚠️ approvals.approvals_status_idx — UNUSED (Onda 1)
-- ⚠️ approvals.approvals_expires_at_idx — UNUSED (Onda 1)
-- ⚠️ conversas.idx_conversas_orcid — UNUSED (Onda 1)
-- ⚠️ chats.idx_chats_tenant_id — UNUSED (Onda 1)
-- [completar com restante via execute_sql]
```

- [ ] **Step 4: Verificar arquivo criado**

```bash
ls -la supabase/baseline-schema.sql
wc -l supabase/baseline-schema.sql
head -20 supabase/baseline-schema.sql
```

Expected: arquivo existe, ≥80 linhas, header batendo com formato acima.

- [ ] **Step 5: Commit**

```bash
git add supabase/baseline-schema.sql
git commit -m "$(cat <<'EOF'
chore(supabase): inventário baseline schema 2026-05-07 (F2.8.2)

Inventário narrativo dos 16 tables + 3 views + 9 RPCs + 4 triggers + 23
RLS policies + indexes do projeto bfzuxxuscyplfoimvomh em 2026-05-07.

Não é dump 1:1 restorable (Supabase MCP não expõe DDL formatável). Pra
dump restorable real, instalar Supabase CLI e rodar:
  supabase db dump --schema public --linked > supabase/baseline-schema.sql

Esta versão serve como evidência DR + referência das mudanças vindouras
(Ondas 1 e 4 vão dropar/alterar items marcados ⚠️).

Refs auditoria: F2.8.2, F1.4.1
EOF
)"
```

### Task 0.3: Habilitar leaked password protection (F1.4.6)

Operação manual no dashboard Supabase (não há SQL/MCP — é setting do Auth).

- [ ] **Step 1: Acessar dashboard Auth settings**

URL: https://supabase.com/dashboard/project/bfzuxxuscyplfoimvomh/auth/policies

Caminho: Authentication → Policies → Password Settings → toggle "Leaked password protection".

- [ ] **Step 2: Habilitar via dashboard**

Click no toggle. Expected: confirma "Updated successfully".

- [ ] **Step 3: Verificar via advisor**

Via Supabase MCP `get_advisors` com `type=security`:

```sql
-- não é SQL — é tool call:
-- mcp__plugin_supabase_supabase__get_advisors({type: "security", project_id: "bfzuxxuscyplfoimvomh"})
```

Expected: lint `auth_leaked_password_protection` **não aparece** mais nos resultados.

- [ ] **Step 4: Commit (apenas docs)**

Como é toggle dashboard, sem mudança em arquivo. Anotar no commit body que foi feito:

```bash
git commit --allow-empty -m "$(cat <<'EOF'
chore(supabase): habilitar leaked password protection (F1.4.6)

Dashboard toggle: Authentication → Policies → Password Settings
→ Leaked password protection: ON.

Confirma via get_advisors (security): lint auth_leaked_password_protection
não aparece mais.

Refs auditoria: F1.4.6
EOF
)"
```

### Task 0.4: Push + PR Onda 0

- [ ] **Step 1: Push branch**

```bash
git push -u origin chore/auditoria-onda-0-safety-net
```

- [ ] **Step 2: Criar PR**

```bash
gh pr create --base main --head chore/auditoria-onda-0-safety-net \
  --title "chore(auditoria): Onda 0 — safety net (baseline schema + leaked password)" \
  --body "$(cat <<'EOF'
## Summary

Sprint 1 / Onda 0 da auditoria — safety net antes de DDL nas Ondas 1+.

- F2.8.2: inventário narrativo do schema em 2026-05-07
- F1.4.6: habilitar leaked password protection (dashboard toggle)

## Test plan

- [x] Inventário cobre 16 tables + 3 views + 9 RPCs + 4 triggers + 23 policies
- [x] Dashboard toggle confirmado via advisor (lint ausente)

Ref: docs/superpowers/plans/2026-05-07-auditoria-sprint-1-quick-wins.md (Onda 0)
EOF
)"
```

- [ ] **Step 3: Squash merge após CI verde**

```bash
gh pr checks <NUM>
gh pr merge <NUM> --squash --delete-branch
```

---

## Onda 1 — Zero-risk wins (1h)

**Findings:** F1.7.3, F1.6.8, F1.4.12, F1.4.8, F1.4.10, F1.4.5, F1.3.8

**Estratégia:** drops, archives e atualizações de doc. Tudo reversível ou cosmético.

**Branch:** `chore/auditoria-onda-1-zero-risk-wins`

**Files:**
- Create: `supabase/migrations/2026-05-07-onda-1-cleanup.sql`
- Modify: `/Users/brazilianhustler/.claude/projects/-Users-brazilianhustler-Documents-inkflow-saas/memory/project_agents.md`

### Task 1.1: Criar branch + sync main

- [ ] **Step 1**

```bash
git checkout main
git pull --ff-only origin main
git checkout -b chore/auditoria-onda-1-zero-risk-wins
```

### Task 1.2: Migration de cleanup DB (F1.4.12 + F1.4.8 + F1.4.10)

**Files:**
- Create: `supabase/migrations/2026-05-07-onda-1-cleanup.sql`

- [ ] **Step 1: Verificar uso atual dos índices candidatos**

Via Supabase MCP:

```sql
SELECT schemaname, relname AS table_name, indexrelname AS index_name, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE schemaname='public'
  AND indexrelname IN (
    'approvals_status_idx',
    'approvals_expires_at_idx',
    'idx_conversas_orcid',
    'idx_chats_tenant_id',
    'dados_cliente_tenant_id_telefone_key'
  )
ORDER BY idx_scan ASC;
```

Expected: `idx_scan = 0` pra todos os 5 (confirma "unused" do advisor).

- [ ] **Step 2: Verificar se RPC `atualizar_timestamp_campanha` é referenciada em algum lugar**

```bash
grep -rn "atualizar_timestamp_campanha" functions/ cron-worker/ supabase/migrations/ docs/
```

Expected: zero matches (ou apenas em migrations onde foi criada). Se aparecer em código ativo, **abortar drop** e mover finding pra investigação.

- [ ] **Step 3: Escrever migration**

```sql
-- supabase/migrations/2026-05-07-onda-1-cleanup.sql
-- Onda 1 — Zero-risk wins da auditoria 2026-05-07
-- Refs: F1.4.12, F1.4.8, F1.4.10

BEGIN;

-- F1.4.12 — Drop RPC dead (não referenciada em nenhum trigger ou código)
DROP FUNCTION IF EXISTS public.atualizar_timestamp_campanha();

-- F1.4.8 — Drop índice duplicado (mesmo conteúdo de unique_tenant_telefone)
DROP INDEX IF EXISTS public.dados_cliente_tenant_id_telefone_key;

-- F1.4.10 — Drop 4 índices unused (idx_scan = 0 confirmado)
DROP INDEX IF EXISTS public.approvals_status_idx;
DROP INDEX IF EXISTS public.approvals_expires_at_idx;
DROP INDEX IF EXISTS public.idx_conversas_orcid;
DROP INDEX IF EXISTS public.idx_chats_tenant_id;

COMMIT;
```

- [ ] **Step 4: Aplicar migration via Supabase MCP**

Tool call:

```
mcp__plugin_supabase_supabase__apply_migration({
  project_id: "bfzuxxuscyplfoimvomh",
  name: "2026_05_07_onda_1_cleanup",
  query: <conteúdo da migration acima>
})
```

Expected: sem erros.

- [ ] **Step 5: Verificar drops aplicados**

```sql
-- RPC dropada?
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='atualizar_timestamp_campanha';
-- Expected: 0

-- Índices dropados?
SELECT count(*) FROM pg_indexes
WHERE schemaname='public'
  AND indexname IN ('dados_cliente_tenant_id_telefone_key','approvals_status_idx',
                    'approvals_expires_at_idx','idx_conversas_orcid','idx_chats_tenant_id');
-- Expected: 0
```

- [ ] **Step 6: Re-rodar performance advisor**

```
mcp__plugin_supabase_supabase__get_advisors({type: "performance", project_id: "bfzuxxuscyplfoimvomh"})
```

Expected: lints `unused_index` e `duplicate_index` reduzidos em 5.

### Task 1.3: Storage policy `tattoo_bucket` revoke LIST (F1.4.5)

- [ ] **Step 1: Verificar policy atual**

```sql
SELECT policyname, cmd, qual::text
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
  AND qual::text LIKE '%tattoo_bucket%';
```

Expected: 1 policy `public_read_all_images 1k3l0rg_0` com `cmd = SELECT`.

- [ ] **Step 2: Drop + recriar policy sem LIST**

A operação correta: dashboard Storage → buckets → tattoo_bucket → Policies → editar a SELECT policy pra restringir paths individuais (objeto direto), não LIST.

**Estratégia mínima:** trocar o USING pra exigir um `name` (nome do objeto) específico — bloqueando LIST que não passa name no qualifier.

```sql
-- migration adicional: supabase/migrations/2026-05-07-onda-1-storage-fix.sql
BEGIN;
DROP POLICY IF EXISTS "public_read_all_images 1k3l0rg_0" ON storage.objects;
CREATE POLICY "tattoo_bucket_public_object_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'tattoo_bucket' AND name IS NOT NULL);
COMMIT;
```

> **Nota:** essa restrição (`name IS NOT NULL`) bloqueia LIST sem nome específico mas mantém GET de objeto direto. **Validar que URLs públicas dos portfolios continuam funcionando** após apply.

- [ ] **Step 3: Aplicar via MCP `apply_migration`**

- [ ] **Step 4: Smoke — fetch direto a um objeto + tentativa de LIST**

```bash
# Smoke positivo: GET direto a um objeto (deve continuar funcionando)
curl -sI "https://bfzuxxuscyplfoimvomh.supabase.co/storage/v1/object/public/tattoo_bucket/<objeto-conhecido>" \
  | head -1
# Expected: HTTP/2 200

# Smoke negativo: LIST do bucket (deve falhar/retornar vazio)
curl -s "https://bfzuxxuscyplfoimvomh.supabase.co/storage/v1/object/list/tattoo_bucket" \
  -H "apikey: $SUPABASE_ANON_KEY"
# Expected: 401 ou array vazio (sem listing)
```

> Se este step falhar (objetos públicos quebraram), reverter via:
> ```sql
> CREATE POLICY "public_read_all_images 1k3l0rg_0" ON storage.objects FOR SELECT USING (bucket_id='tattoo_bucket');
> DROP POLICY "tattoo_bucket_public_object_read" ON storage.objects;
> ```

- [ ] **Step 5: Re-rodar security advisor**

Expected: lint `public_bucket_allows_listing` ausente.

### Task 1.4: Atualizar memory `project_agents.md` (F1.7.3)

**Files:**
- Modify: `/Users/brazilianhustler/.claude/projects/-Users-brazilianhustler-Documents-inkflow-saas/memory/project_agents.md`

- [ ] **Step 1: Ler estado atual**

```bash
cat "/Users/brazilianhustler/.claude/projects/-Users-brazilianhustler-Documents-inkflow-saas/memory/project_agents.md"
```

Provavelmente lista 6 agentes ativos (drift documentado em F1.7.3).

- [ ] **Step 2: Reescrever com 3 ativos + 6 legacy**

Conteúdo correto (referência: `.claude/agents/README.md` no repo):

```markdown
---
name: Specialized agents
description: 3 subagents ativos em .claude/agents/ + 6 movidos pra _legacy/
type: project
---

InkFlow tem **3 subagents ativos** (após reorg Sub-projeto 2 MVP em 2026-04-26):

- `supabase-dba` (Sonnet) — migrations, RLS, advisor, queries. Gate Telegram pra apply_migration prod, DDL, DELETE/UPDATE em massa.
- `deploy-engineer` (Sonnet) — CF Pages/Workers, GHA, secret rotation. Gate Telegram pra wrangler deploy, secret put, force push, GHA edit.
- `vps-ops` (Haiku) — Vultr resources, uptime, restart Docker. Gate Telegram pra restart/stop container, edit config, reboot.

**6 agents arquivados em `.claude/agents/_legacy/`:** o-confere, estagiario, supa, marcelo-pago, doutor-evo, hunter. Não usar.

Detalhes: `.claude/agents/README.md` + frontmatter de cada `.md`.
Doctrine: `docs/canonical/methodology/matrix.md` §5.
```

(Salvar com Write tool.)

### Task 1.5: Cleanup dados de teste — archive smokes (F1.6.8)

- [ ] **Step 1: Confirmar contagem antes**

```sql
SELECT auditor, count(*)
FROM public.audit_runs
WHERE auditor IN ('smoke-test', 'smoke-escalation')
GROUP BY auditor;
```

Expected: 5 rows total (3 smoke-test + 2 smoke-escalation, conforme §1.6).

- [ ] **Step 2: Archive (DELETE) via MCP**

```sql
BEGIN;
DELETE FROM public.audit_events
  WHERE auditor IN ('smoke-test', 'smoke-escalation') AND payload->>'is_smoke' IS NOT NULL OR detected_at < '2026-04-28';

DELETE FROM public.audit_runs
  WHERE auditor IN ('smoke-test', 'smoke-escalation');
COMMIT;
```

> **Cuidado:** verificar antes via SELECT que os smokes são todos < 2026-04-28 e não tem nenhum legítimo recente. Se houver dúvida, fazer só `audit_runs` e deixar `audit_events` pra Sprint 2.

- [ ] **Step 3: Confirmar pós**

```sql
SELECT auditor, count(*) FROM public.audit_runs
WHERE auditor IN ('smoke-test', 'smoke-escalation') GROUP BY auditor;
```

Expected: 0 rows.

### Task 1.6: Delete 4 workflows n8n backup (F1.3.8)

Workflows desativados em 21-22/04 após migração pro `cron-worker`. Mais de 2 semanas de janela = seguro deletar.

IDs (de §1.3):
- `KEO1tJRKpYTxi15E` — Expira Trial (7d)
- `V2zccb03P9ZUEH3o` — Reset Agendamentos
- `JuWleItL6kb0x1NO` — Cleanup Tenants Rascunho
- `JZF5llQOonKjDxpY` — Monitor WhatsApp

- [ ] **Step 1: Confirmar status `active=false` pra cada um**

Via n8n MCP `search_workflows`:

Expected: 4 workflows com `active: false`.

- [ ] **Step 2: Archive (não deletar — n8n MCP só tem `archive_workflow`)**

Pra cada ID:

```
mcp__n8n__archive_workflow({workflowId: "KEO1tJRKpYTxi15E"})
mcp__n8n__archive_workflow({workflowId: "V2zccb03P9ZUEH3o"})
mcp__n8n__archive_workflow({workflowId: "JuWleItL6kb0x1NO"})
mcp__n8n__archive_workflow({workflowId: "JZF5llQOonKjDxpY"})
```

- [ ] **Step 3: Confirmar via search**

```
mcp__n8n__search_workflows({limit: 50})
```

Expected: lista NÃO inclui mais os 4 IDs (foram pra archive). Sobram 6 workflows ativos+inativos (5 ativos + Sentry + outros).

### Task 1.7: Commit Onda 1

- [ ] **Step 1: Stage**

```bash
git add supabase/migrations/2026-05-07-onda-1-cleanup.sql
git add supabase/migrations/2026-05-07-onda-1-storage-fix.sql 2>/dev/null || true
git status
```

Expected: 2 arquivos staged (mais o memory que é fora do repo, não entra no commit).

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore(auditoria): Onda 1 — zero-risk cleanup (7 findings)

DB:
- Drop RPC dead atualizar_timestamp_campanha (F1.4.12)
- Drop índice duplicado dados_cliente_tenant_id_telefone_key (F1.4.8)
- Drop 4 índices unused: approvals_status/expires, idx_conversas_orcid, idx_chats_tenant_id (F1.4.10)
- Storage tattoo_bucket: replace public LIST policy por SELECT name IS NOT NULL (F1.4.5)

n8n:
- Archive 4 workflows backup desativados (Expira Trial, Reset Agendamentos, Cleanup Tenants, Monitor WhatsApp) — F1.3.8

Memory (fora do repo):
- Atualizar project_agents.md: 3 ativos + 6 legacy (F1.7.3)

Audit data cleanup:
- Archive smoke-test/smoke-escalation runs do framework setup (F1.6.8)

Refs auditoria: F1.4.5, F1.4.8, F1.4.10, F1.4.12, F1.6.8, F1.3.8, F1.7.3
EOF
)"
```

### Task 1.8: Push + PR Onda 1

- [ ] **Step 1: Push + PR**

```bash
git push -u origin chore/auditoria-onda-1-zero-risk-wins
gh pr create --base main --head chore/auditoria-onda-1-zero-risk-wins \
  --title "chore(auditoria): Onda 1 — zero-risk cleanup (7 findings)" \
  --body "Fecha 7 findings P3 da auditoria — todos reversíveis ou cosméticos. Ref: docs/superpowers/plans/2026-05-07-auditoria-sprint-1-quick-wins.md (Onda 1)"
```

- [ ] **Step 2: Squash merge após CI**

---

## Onda 2 — CI/CD foundation (1h)

**Findings:** F2.4.4 (tests em GHA), F1.5.3 (preflight em GHA)

**Estratégia:** **REQUIRES SUB-PLAN.** Setup de GHA é mudança em CI/CD que afeta TODOS os PRs subsequentes. Requer rigor formal: matrix de Node version, secrets, fail-fast strategy, timeout, etc.

**Sub-plan a criar quando chegar lá:** `docs/superpowers/plans/2026-05-08-onda-2-tests-ci.md`

Sub-plan vai cobrir:
- Workflow `tests.yml` (matrix Node 20, run `node --test tests/`)
- Decisão: `tests.yml` separado ou estender `prompts-ci.yml`?
- Triggers: on PR to main + on push main
- Secrets necessários (probably nenhum — tests já são unit/mock-based)
- Timeout, concurrency settings
- Treatment de testes flaky (`auditor-vps-limits.test` errou 1× em 30d — investigar)
- Mover `scripts/preflight-envvars.sh` pra step do `deploy.yml`
- Smoke local antes de push

**Branch sugerido:** `chore/auditoria-onda-2-ci-foundation`

**Subagent sugerido:** `deploy-engineer` (tools: Bash, Edit, mcp github + cloudflare)

---

## Onda 3 — Observability + bug ativo (45min)

**Findings:** F1.3.1 (tool zumbi), F2.5.1 (Sentry trigger)

**Estratégia:** ativar Sentry ANTES de mexer em DB security (Onda 4) — voar com olhos abertos. Tool zumbi é bug ativo, fix é XS.

**Branch:** `chore/auditoria-onda-3-observability`

### Task 3.1: Criar branch

- [ ] **Step 1**

```bash
git checkout main && git pull --ff-only
git checkout -b chore/auditoria-onda-3-observability
```

### Task 3.2: Remover tool zumbi `consultar_preco_retoque` do agent n8n (F1.3.1)

**Estratégia:** opção A — remover a tool node do workflow (preferível, não introduz endpoint). Opção B — criar endpoint stub que retorna "feature em breve". Vou pela A — mais limpo.

- [ ] **Step 1: Confirmar tool ainda existe no workflow**

```bash
jq -r '.nodes[] | select(.name=="consultar_preco_retoque") | {name, type, parameters: {url: .parameters.url}}' \
  "docs/workflows/MEU NOVO WORK - SAAS - 2026-05-06.json"
```

Expected: 1 node httpRequestTool com URL `/api/tools/consultar-preco-retoque`.

> **Cuidado:** `docs/workflows/...json` é snapshot manual de 2026-05-06. Workflow real em prod (n8n) pode ter mudado. **Antes de remover, exportar workflow atual via MCP**:

```
mcp__n8n__get_workflow_details({workflowId: "PmCMHTaTi07XGgWh"})
```

Salvar em `/tmp/workflow-current-pre-onda3.json` pra rollback.

- [ ] **Step 2: Detectar referências cruzadas no agent**

`Seu Agente` (LangChain) usa as tools via connections. Tem que confirmar que `consultar_preco_retoque` está nas connections do `Seu Agente` e não em outro lugar.

```bash
jq -r '.connections | keys[] | select(. == "consultar_preco_retoque")' \
  /tmp/workflow-current-pre-onda3.json
```

Expected: ou retorna o nome (tem connection) ou vazio (já não conecta).

- [ ] **Step 3: Editar workflow via n8n MCP**

n8n MCP tem `update_workflow` que aceita workflow code (SDK format). **Não vou editar diretamente** — vou usar `archive_workflow` ou pedir pro user remover via dashboard.

> **Decisão pragmática:** remover via **dashboard n8n** (mais seguro) — abrir `https://n8n.inkflowbrasil.com/workflow/PmCMHTaTi07XGgWh`, clicar no node `consultar_preco_retoque`, **delete**. Depois clicar no `Seu Agente` e confirmar que a connection sumiu da lista de tools. Save workflow.

- [ ] **Step 4: Smoke — disparar uma conversa e verificar agent não chama**

```bash
# Verificar logs no n8n executions dashboard pos-deploy.
# Conversação real é via WhatsApp — pra testar em staging seria ideal mas não temos.
# Smoke alternativo: confirmar que a remoção foi salva
```

```
mcp__n8n__get_workflow_details({workflowId: "PmCMHTaTi07XGgWh"})
```

Expected: nodes não inclui mais `consultar_preco_retoque`.

- [ ] **Step 5: Atualizar snapshot em git**

```bash
mcp__n8n__get_workflow_details({workflowId: "PmCMHTaTi07XGgWh"}) > /tmp/workflow-post-onda3.json
mv /tmp/workflow-post-onda3.json "docs/workflows/MEU NOVO WORK - SAAS - 2026-05-07.json"
```

### Task 3.3: Configurar trigger no workflow `INKFLOW - Sentry Error Handler` (F2.5.1)

- [ ] **Step 1: Pegar detalhes do workflow Sentry**

```
mcp__n8n__get_workflow_details({workflowId: "8J1I0ru4yFlSab61"})
```

Inspecionar nodes — provavelmente tem webhook handler ou error trigger sem cron/webhook configurado.

- [ ] **Step 2: Decidir trigger correto**

Opções:
- **Error Trigger** — n8n nativo (`Error Trigger` node) — captura quando OUTRO workflow falha. **Provavelmente é isso** que o Sentry handler quer.
- Webhook — se for receber eventos externos do Sentry SaaS.

> Investigar via `get_workflow_details` qual é a intenção do workflow. **Se Error Trigger:** configurar nos workflows que devem reportar (especialmente o principal `MEU NOVO WORK - SAAS`). Se Webhook: configurar URL do Sentry (precisaria ter conta Sentry ativa).

- [ ] **Step 3: Configurar via dashboard n8n**

Abrir `https://n8n.inkflowbrasil.com/workflow/8J1I0ru4yFlSab61`. Verificar se o trigger está configurado mas inativo, ou se está ausente. Configurar conforme decidido em Step 2. Save + activate.

- [ ] **Step 4: Smoke — verificar `triggerCount` mudou**

```
mcp__n8n__search_workflows({query: "Sentry"})
```

Expected: workflow `INKFLOW - Sentry Error Handler` agora com `triggerCount >= 1`.

- [ ] **Step 5: Smoke real**

Forçar um erro num workflow secundário (ex: rodar smoke-test workflow com input inválido) e ver se Sentry handler dispara. Idealmente, gerar 1 alerta Telegram pra confirmar end-to-end.

### Task 3.4: Commit + PR Onda 3

- [ ] **Step 1: Stage + commit**

```bash
git add "docs/workflows/MEU NOVO WORK - SAAS - 2026-05-07.json"
git commit -m "$(cat <<'EOF'
chore(auditoria): Onda 3 — observability + bug ativo (2 findings)

n8n:
- Remove tool ZUMBI consultar_preco_retoque do agent (endpoint não
  existia, agent ia 404 silencioso) — F1.3.1
- Configura trigger no INKFLOW - Sentry Error Handler workflow
  (estava active=true mas triggerCount=0, captura zero) — F2.5.1

Snapshot workflow atualizado: docs/workflows/MEU NOVO WORK - SAAS - 2026-05-07.json

Refs auditoria: F1.3.1, F2.5.1
EOF
)"
```

- [ ] **Step 2: Push + PR**

```bash
git push -u origin chore/auditoria-onda-3-observability
gh pr create --base main --head chore/auditoria-onda-3-observability \
  --title "chore(auditoria): Onda 3 — fix tool zumbi + Sentry trigger" \
  --body "Refs: F1.3.1, F2.5.1. Ref plan: docs/superpowers/plans/2026-05-07-auditoria-sprint-1-quick-wins.md (Onda 3)"
```

---

## Onda 4 — DB security (1h)

**Findings:** F1.4.2 (views SECURITY DEFINER), F1.4.3 (RPCs anon-callable)

**Estratégia:** **REQUIRES SUB-PLAN.** Mudanças em RLS / RPC permissions têm risco de quebrar features que dependiam silenciosamente. Requer:
- Mapeamento de quem chama cada RPC (functions/, n8n, edge functions)
- Test plan smoke pré-mudança
- Migration com transaction + rollback
- Test plan smoke pós-mudança
- Backout procedure se algo quebrar

**Sub-plan a criar quando chegar lá:** `docs/superpowers/plans/2026-05-08-onda-4-db-security.md`

Sub-plan vai cobrir:

#### F1.4.2 — Views SECURITY DEFINER

```sql
-- Estratégia: ALTER VIEW ... SET (security_invoker = on);
-- Se isso quebrar (caller não tem permission), ALTER VIEW DROP SECURITY DEFINER (DDL diferente)
-- ou recriar view sem o SECURITY DEFINER.

-- audit_current_state — chamada por quem?
-- orcamentos — chamada por quem?
```

Mapping de callers a fazer:
- `grep -rn "audit_current_state" functions/`
- `grep -rn "orcamentos" functions/`
- Verificar n8n nodes que fazem SELECT FROM views

#### F1.4.3 — RPCs SECURITY DEFINER callable por anon

```sql
-- expire_trials() — chamada por:
--   - cron-worker → /api/cron/expira-trial → functions/api/cron/expira-trial.js
--   - functions/api/cron/expira-trial.js usa Supabase service_key (não anon)
--   ✓ Pode revogar EXECUTE pra anon/authenticated com segurança
REVOKE EXECUTE ON FUNCTION public.expire_trials() FROM anon;
REVOKE EXECUTE ON FUNCTION public.expire_trials() FROM authenticated;

-- merge_conversa_jsonb(...) — chamada por:
--   - functions/api/tools/dados-coletados.js (provável)
--   - n8n agent tools (?)
--   - Verificar se chama via service_role ou via anon
-- Se via service_role: REVOKE pra anon/authenticated é seguro
-- Se via anon (improvável): refator pra service_role primeiro
REVOKE EXECUTE ON FUNCTION public.merge_conversa_jsonb(uuid, text, jsonb, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.merge_conversa_jsonb(uuid, text, jsonb, text, boolean) FROM authenticated;
```

**Smokes obrigatórios pós-aplicar:**
- POST `/api/cron/expira-trial` com Bearer CRON_SECRET → expected 200
- Modo Coleta v2 fluxo: cliente manda mensagem → bot dispara `dados_coletados` tool → merge_conversa_jsonb deve funcionar
- Verificar via curl que `https://bfzuxxuscyplfoimvomh.supabase.co/rest/v1/rpc/expire_trials` retorna **403** com anon key

**Branch sugerido:** `chore/auditoria-onda-4-db-security`

**Subagent sugerido:** `supabase-dba` (tools: Bash, Edit, mcp supabase 16 tools, gate Telegram pra DDL prod)

---

## Onda 5 — Docs + CSP (1h30)

**Findings:** F1.5.5 (secrets.md desatualizado), F1.5.6 (sem CSP)

**Estratégia:** docs por último (refletem mudanças anteriores). CSP precisa ser testado em staging (pode quebrar JS inline nos HTMLs gigantes — `onboarding.html` 200KB).

**Branch:** `chore/auditoria-onda-5-docs-csp`

### Task 5.1: Atualizar `secrets.md` (F1.5.5)

**Files:**
- Modify: `docs/canonical/secrets.md`

- [ ] **Step 1: Comparar secrets em código vs documentados**

```bash
grep -rEho "env\.[A-Z][A-Z0-9_]+" functions/ cron-worker/src/ | sed 's/^env\.//' | sort -u > /tmp/code-vars.txt
grep -E "^\| \`[A-Z]" docs/canonical/secrets.md | grep -oE "[A-Z][A-Z0-9_]+" | sort -u > /tmp/doc-vars.txt
diff /tmp/code-vars.txt /tmp/doc-vars.txt
```

Expected: ~21 vars em code-vars.txt mas não em doc-vars.txt (conforme F1.5.5).

- [ ] **Step 2: Adicionar 21 vars ausentes em `secrets.md`**

Vars a adicionar (categorizar como secret vs config):

**Auditor params (não-secrets — feature flags numéricas):**
- `AUDIT_BILLING_FLOW_WEBHOOK_DELAY_HOURS`
- `AUDIT_BILLING_FLOW_WEBHOOK_SILENT_HOURS`
- `AUDIT_DEPLOY_HEALTH_WINDOW_HOURS`
- `AUDIT_DEPLOY_HEALTH_WRANGLER_DRIFT`
- `AUDIT_KEY_EXPIRY_LAYER3`
- `AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB`
- `RLS_INTENTIONAL_NO_PUBLIC`

**Self-reference do auditor (não-secrets):**
- `CF_PAGES_PROJECT_NAME`
- `CF_WORKER_SCRIPT_NAME`
- `CLOUDFLARE_API_TOKEN_EXPIRES_AT`
- `GITHUB_REPO_FULL_NAME`

**Secrets faltando (alta severidade):**
- `KILL_SWITCH_SECRET` (vs bws `INKFLOW_KILL_SWITCH_SECRET` — naming drift, F1.5.4)
- `SUPABASE_PAT` (vs bws `SB_PAT` — naming drift)
- `TELEGRAM_WEBHOOK_SECRET` (vs `INKFLOW_TELEGRAM_WEBHOOK_SECRET` — provável dual)
- `N8N_REENTRADA_WEBHOOK_URL`
- `REENTRADA_URL`
- `TELEGRAM_ADMIN_USER_ID`
- `VPS_HEALTH_TOKEN`
- `VPS_HEALTH_URL`

Adicionar cada uma na seção apropriada do `secrets.md` (tabela master OR tabela non-secrets).

- [ ] **Step 3: Verificar diff**

```bash
git diff docs/canonical/secrets.md | head -80
```

Expected: ~25-50 linhas adicionadas.

### Task 5.2: Adicionar CSP no `_headers` (F1.5.6)

**Files:**
- Modify: `_headers`

- [ ] **Step 1: Determinar política CSP baseada em uso**

`onboarding.html` (200KB com JS inline gigante) é o maior risco de quebrar. Precisa permitir:
- `script-src 'self' 'unsafe-inline'` (JS inline existente)
- `style-src 'self' 'unsafe-inline'` (CSS inline)
- `connect-src` pra Supabase REST + CF Pages API + Mercado Pago + Evolution
- `img-src` pra portfolios (R2)
- `frame-ancestors 'none'` (já tem X-Frame-Options DENY)

Política sugerida (conservativa pra início, depois apertar):

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://www.mercadopago.com.br https://sdk.mercadopago.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.supabase.co https://*.cloudflare.com; connect-src 'self' https://bfzuxxuscyplfoimvomh.supabase.co https://api.mercadopago.com https://evo.inkflowbrasil.com; frame-src https://www.mercadopago.com.br; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

- [ ] **Step 2: Adicionar header em `_headers`**

Editar bloco `/*`:

```
# === Security headers em TODAS as páginas ===
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self)
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-XSS-Protection: 1; mode=block
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://www.mercadopago.com.br https://sdk.mercadopago.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.supabase.co https://*.cloudflare.com; connect-src 'self' https://bfzuxxuscyplfoimvomh.supabase.co https://api.mercadopago.com https://evo.inkflowbrasil.com; frame-src https://www.mercadopago.com.br; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

- [ ] **Step 3: Smoke local com `wrangler pages dev` (se possível)**

```bash
npx wrangler pages dev . --port 8788
```

Em outro terminal:

```bash
curl -sI http://localhost:8788/onboarding | grep -i content-security
```

Expected: header CSP presente.

Abrir `http://localhost:8788/onboarding` no browser, abrir DevTools Console, verificar se há erros CSP. **Se houver:** ajustar política antes de pushed.

- [ ] **Step 4: Deploy preview pra testar em staging**

`wrangler pages deploy . --project-name=inkflow-saas --branch=chore/auditoria-onda-5-docs-csp` cria preview em URL `<branch>.inkflow-saas.pages.dev`. Validar:
- Onboarding completo (criar tenant teste)
- Studio dashboard (login + carregar KPIs)
- Admin (Leandro view)
- Modo Coleta v2 (uma conversa de teste)

Cada um sem CSP errors no console.

> **Se UI quebrar:** afinar a política. Pode precisar adicionar `wasm-unsafe-eval`, ou liberar mais hosts. **Não merger sem ter validado em browser real.**

### Task 5.3: Commit + PR Onda 5

- [ ] **Step 1: Commit**

```bash
git add docs/canonical/secrets.md _headers
git commit -m "$(cat <<'EOF'
chore(auditoria): Onda 5 — secrets.md + CSP (2 findings)

docs(secrets): adicionar 21 vars de código não documentadas (F1.5.5)
- 7 auditor params (feature flags numéricas)
- 4 self-reference do auditor
- 8 secrets faltando + 2 naming drift identificados (F1.5.4 → Sprint posterior)

security(headers): adicionar Content-Security-Policy (F1.5.6)
- default-src 'self' + permits específicos pra MP, Supabase, R2, Evolution
- 'unsafe-inline' em script/style mantido (JS/CSS inline nos HTMLs)
- frame-ancestors 'none' reforça X-Frame-Options
- Validado em preview deployment via dev tools console (sem CSP errors)

Refs auditoria: F1.5.5, F1.5.6
EOF
)"
```

- [ ] **Step 2: Push + PR + merge**

```bash
git push -u origin chore/auditoria-onda-5-docs-csp
gh pr create --base main --head chore/auditoria-onda-5-docs-csp \
  --title "chore(auditoria): Onda 5 — secrets.md + CSP" \
  --body "Refs: F1.5.5, F1.5.6. Ref plan: Onda 5."
```

---

## Pós-Sprint 1 — review

- [ ] **DoD geral**

  - [ ] Onda 0 — backup baseline + leaked password ON
  - [ ] Onda 1 — 7 findings P3/P2 fechados
  - [ ] Onda 2 — `tests.yml` GHA verde com 53 testes
  - [ ] Onda 3 — tool zumbi removida, Sentry trigger ativo
  - [ ] Onda 4 — RPCs anon revogadas, views SECURITY INVOKER, smokes pós-fix verdes
  - [ ] Onda 5 — secrets.md atualizado, CSP em prod sem quebrar UI

- [ ] **Verificação final via Supabase advisors**

  ```
  mcp__plugin_supabase_supabase__get_advisors({type: "security"})
  mcp__plugin_supabase_supabase__get_advisors({type: "performance"})
  ```

  Expected:
  - 13 → ~3-5 lints security (caem: 2 SECURITY DEFINER views + 2 RPCs anon + 1 leaked password + 1 tattoo_bucket = 6)
  - 20 → ~9-13 lints performance (caem: 1 duplicate index + 4 unused = 5)

- [ ] **Update `MEMORY.md` index**

  Adicionar linha apontando pra este plan + ao relatório de auditoria, marcando Sprint 1 completo.

- [ ] **Atualizar relatório de auditoria**

  No `docs/auditoria/2026-05-07-auditoria-completa.md`, adicionar tabela "Sprint 1 — completed YYYY-MM-DD" no final, listando cada finding fechado + commit/PR.

---

## Self-review

**Spec coverage check:**
- ✅ F2.8.2 — Onda 0 Task 0.2
- ✅ F1.4.6 — Onda 0 Task 0.3
- ✅ F1.7.3 — Onda 1 Task 1.4
- ✅ F1.6.8 — Onda 1 Task 1.5
- ✅ F1.4.12 — Onda 1 Task 1.2
- ✅ F1.4.8 — Onda 1 Task 1.2
- ✅ F1.4.10 — Onda 1 Task 1.2
- ✅ F1.4.5 — Onda 1 Task 1.3
- ✅ F1.3.8 — Onda 1 Task 1.6
- ⏸ F2.4.4 — Onda 2 (sub-plan pendente)
- ⏸ F1.5.3 — Onda 2 (sub-plan pendente)
- ✅ F1.3.1 — Onda 3 Task 3.2
- ✅ F2.5.1 — Onda 3 Task 3.3
- ⏸ F1.4.2 — Onda 4 (sub-plan pendente)
- ⏸ F1.4.3 — Onda 4 (sub-plan pendente)
- ✅ F1.5.5 — Onda 5 Task 5.1
- ✅ F1.5.6 — Onda 5 Task 5.2

**Placeholder scan:**
- Onda 0 Task 0.2: baseline narrativo (não restorable). Documented trade-off — aceito como pragmatismo pré-Supabase CLI install.
- Onda 4: sub-plan TODO — esperado, é o Pattern C
- Onda 2: sub-plan TODO — idem

**Type consistency:**
- Migration filename `2026-05-07-onda-1-cleanup.sql` consistente entre Task 1.2, 1.3, 1.7
- IDs n8n consistentes entre §1.3 do relatório e Task 1.6
- Workflow snapshot path consistente em Task 3.2 + 3.4

**Riscos não cobertos no plan:**
- Smoke E2E do hot path 1 (cliente WhatsApp → resposta bot) **não está no DoD**. Após Onda 4, vale rodar uma conversa real pra confirmar que `merge_conversa_jsonb` revoke não quebrou Modo Coleta. Adicionar ao sub-plan da Onda 4.
- Rollback de cada onda — descrito pra alguns steps mas não pra todos. Sub-plans Onda 2 e 4 devem detalhar.
