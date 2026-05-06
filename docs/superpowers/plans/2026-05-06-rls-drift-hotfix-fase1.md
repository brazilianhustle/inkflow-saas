# RLS Drift Hotfix Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar alerta crítico `rls-drift c4934661` (4 funções em `public` sem `search_path`) aplicando migration DDL em prod, validando via auditor, e capturando o procedimento cru em runbook canônico + postmortem.

**Architecture:** Migration single-file aplicada via Supabase MCP `apply_migration`. Validação via re-run do auditor (cron endpoint POST). Naked runbook documenta cada comando real rodado (vira fonte da Fase 2 formatada). Postmortem em vault Obsidian. PR registra mudança pós-aplicação (alerta crítico fecha em prod ANTES do merge — PR é histórico versionado).

**Tech Stack:** Supabase Postgres (Mgmt API + MCP), Cloudflare Pages (audit cron), Telegram Bot API (alert + ack), GitHub (gh CLI), Obsidian vault local (postmortem), Claude Code memory (Painel + Anomalias).

**Spec:** `docs/superpowers/specs/2026-05-06-auditor-self-remediation-design.md` (Fase 1 §Phasing).

**Branch atual:** `feat/auditor-self-remediation` (já criada do main, spec commitada `546ad50`).

**Alerta sendo resolvido:**
- `audit_events.id` short: `c4934661`
- 4 functions: `dashboard_resumo_periodo`, `dashboard_sinal_recebido`, `dashboard_taxa_conversao`, `update_conversa_last_msg_at`
- Severity: critical
- Sintoma: `function_no_search_path`

---

## File Structure

| Path | Action | Responsabilidade |
|---|---|---|
| `supabase/migrations/2026-05-06-fix-rls-drift-search-path.sql` | Create | Migration DDL: `ALTER FUNCTION ... SET search_path = ''` x4 |
| `functions/_lib/auditors/rls-drift.js` | Modify (linha 18) | `RUNBOOK_PATH = 'docs/canonical/runbooks/rls-drift.md'` (era `null`) |
| `docs/canonical/runbooks/rls-drift.md` | Create | Runbook canônico naked (5 etapas, comandos crus rodados) |
| `/Users/brazilianhustler/Documents/vault/InkFlow — Incidentes/2026-05-06-rls-drift-search-path.md` | Create | Postmortem do incidente (template 5 etapas preenchido) |
| `/Users/brazilianhustler/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Painel.md` | Modify | Empurra "Onde estamos agora" pra "Estado anterior" + nova entrada com este incidente |
| `/Users/brazilianhustler/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Anomalias observadas.md` | Modify | Adiciona entry `### 2026-05-06 04:01 BRT — rls-drift dashboard functions sem search_path` |

**Não toca em:**
- `functions/api/cron/audit-rls-drift.js` — sem mudanças (já funciona)
- `functions/_lib/audit-state.js` — sem mudanças
- Outros auditores — Fase 3 (JIT)

---

## Task 1: Pre-flight check

**Files:**
- (read-only checks)

**Objetivo:** Confirmar que estamos na branch certa, env vars necessárias estão setadas (pra audit cron trigger), e estado do schema confere com o evento.

- [ ] **Step 1: Confirmar branch e estado git limpo**

Run:
```bash
git -C /Users/brazilianhustler/Documents/inkflow-saas branch --show-current
git -C /Users/brazilianhustler/Documents/inkflow-saas status -s
```
Expected: branch `feat/auditor-self-remediation`, status vazio (ou só specs/plans recém-criados).

- [ ] **Step 2: Confirmar audit_events row aberto pelo short_id**

Use Supabase MCP `execute_sql`:
```sql
SELECT id, severity, payload->>'symptom' AS symptom, payload->>'summary' AS summary,
       resolved_at, resolved_reason, created_at
FROM audit_events
WHERE auditor = 'rls-drift' AND resolved_at IS NULL
ORDER BY created_at DESC
LIMIT 5;
```
Project ID: `bfzuxxuscyplfoimvomh`.

Expected: ≥1 row, severity=critical, summary contém "search_path", short_id (primeiros 8 chars do `id`) começa com `c4934661`. Anotar `id` completo (UUID) — vai ser usado no postmortem.

- [ ] **Step 3: Confirmar lista atual de functions sem search_path (estado dirty)**

Use Supabase MCP `execute_sql`:
```sql
SELECT n.nspname AS schema, p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND (p.proconfig IS NULL OR NOT EXISTS (
    SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=%'
  ))
ORDER BY p.proname;
```

Expected: 4 rows — `dashboard_resumo_periodo`, `dashboard_sinal_recebido`, `dashboard_taxa_conversao`, `update_conversa_last_msg_at`. Se aparecerem 0 ou >4 funções, **PARE** — schema mudou desde o alert; revisar antes de prosseguir.

---

## Task 2: Criar migration SQL

**Files:**
- Create: `supabase/migrations/2026-05-06-fix-rls-drift-search-path.sql`

- [ ] **Step 1: Escrever arquivo de migration**

Create `/Users/brazilianhustler/Documents/inkflow-saas/supabase/migrations/2026-05-06-fix-rls-drift-search-path.sql`:

```sql
-- Migration: fix rls-drift — set search_path='' em 4 funções public
-- Disparada por audit_events alerta c4934661 (2026-05-06 04:01 BRT)
-- Spec: docs/superpowers/specs/2026-05-06-auditor-self-remediation-design.md
-- Plan: docs/superpowers/plans/2026-05-06-rls-drift-hotfix-fase1.md
--
-- Por que `search_path = ''`:
--   Postgres ≥15 best-practice. Empty string força qualificação total
--   (pg_catalog.count, public.tenants) — evita search-path injection
--   onde role com CREATE em schema do path consegue sequestrar funções
--   built-in (count, sum, SPLIT_PART) ou objetos.
--
-- Idempotência: ALTER FUNCTION é idempotente; rodar 2× retorna o mesmo
-- estado final. Sem CREATE OR REPLACE — preserva body atual.

BEGIN;

-- 3 dashboard RPCs (origem: PR #26, mig 2026-05-05-pr2-dashboard-rpc.sql)
ALTER FUNCTION public.dashboard_resumo_periodo(uuid, timestamptz, timestamptz)
  SET search_path = '';

ALTER FUNCTION public.dashboard_sinal_recebido(uuid, timestamptz)
  SET search_path = '';

ALTER FUNCTION public.dashboard_taxa_conversao(uuid, timestamptz)
  SET search_path = '';

-- 1 trigger antigo (origem: pré-PR #26, criado em conversas table setup)
ALTER FUNCTION public.update_conversa_last_msg_at()
  SET search_path = '';

COMMIT;

-- Verify (rodar manual após apply):
--   SELECT n.nspname, p.proname, p.proconfig
--   FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('dashboard_resumo_periodo', 'dashboard_sinal_recebido',
--                       'dashboard_taxa_conversao', 'update_conversa_last_msg_at')
--   ORDER BY p.proname;
-- Expected: proconfig = {search_path=""} pra cada row.
```

- [ ] **Step 2: Validar sintaxe do arquivo (read back)**

Run:
```bash
head -50 /Users/brazilianhustler/Documents/inkflow-saas/supabase/migrations/2026-05-06-fix-rls-drift-search-path.sql
```
Expected: vê o conteúdo completo, BEGIN/COMMIT envelopam 4 ALTERs, paths dos comments corretos.

**Não aplicar ainda. Apply é Task 3.**

---

## Task 3: Aplicar migration em prod via Supabase MCP

**Files:**
- (executa migration criada na Task 2)

**Objetivo:** Aplicar DDL em prod (projeto `bfzuxxuscyplfoimvomh`). É **destrutivo** (não tem rollback automático) — mas idempotente. Se falhar parcialmente, re-rodar após investigar.

- [ ] **Step 1: Apply migration via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration`:
- `project_id`: `bfzuxxuscyplfoimvomh`
- `name`: `2026-05-06-fix-rls-drift-search-path`
- `query`: conteúdo do arquivo SQL (copy do Task 2 Step 1, sem comments terminais opcional)

Expected: response sem erro. Se erro de syntax/permission, **PARE** e investigar antes de Task 4.

- [ ] **Step 2: Confirmar entry em supabase_migrations.schema_migrations**

Use Supabase MCP `execute_sql`:
```sql
SELECT version, name, statements
FROM supabase_migrations.schema_migrations
WHERE name = '2026-05-06-fix-rls-drift-search-path'
LIMIT 1;
```

Expected: 1 row, statements array contém os 4 ALTER FUNCTION.

- [ ] **Step 3: Verify schema state — query introspection**

Use Supabase MCP `execute_sql`:
```sql
SELECT n.nspname AS schema, p.proname AS function_name, p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('dashboard_resumo_periodo', 'dashboard_sinal_recebido',
                    'dashboard_taxa_conversao', 'update_conversa_last_msg_at')
ORDER BY p.proname;
```

Expected: 4 rows, **cada uma com `proconfig = {"search_path="}`**. Se alguma row tem `proconfig = NULL` ou ausente, ALTER falhou silenciosamente — re-investigar.

- [ ] **Step 4: Verify schema state — re-rodar query do auditor**

Use Supabase MCP `execute_sql` com a mesma SQL do auditor (`SQL_FUNCTIONS_NO_SEARCH_PATH` em `functions/api/cron/audit-rls-drift.js:29`):

```sql
SELECT n.nspname AS schema, p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND (p.proconfig IS NULL OR NOT EXISTS (
    SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=%'
  ))
ORDER BY p.proname;
```

Expected: **0 rows**. Schema está clean do ponto de vista do auditor.

---

## Task 4: Validar fix end-to-end (auditor + Telegram)

**Files:**
- (read-only checks)

**Objetivo:** Disparar audit cron manual pra que `dedupePolicy` detecte transição critical→clean e marque event resolved + envie Telegram resolved message. Confirma que **o auditor concorda** com o fix.

- [ ] **Step 1: Trigger audit cron manual via curl**

Run:
```bash
curl -X POST https://inkflowbrasil.com/api/cron/audit-rls-drift \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}' \
  --max-time 30
```

Nota: `CRON_SECRET` precisa estar no env do shell. Se não, usar `bws secret get` (Bitwarden Secrets Manager — `bws_setup` memory). Alternativa: rodar via Cloudflare Pages dashboard (Manual trigger).

Expected: HTTP 200, JSON `{"ok": true, "run_id": "<uuid>", "events_count": 0, "actions": {"resolve": 1, ...}}`. **`actions.resolve = 1` é a evidência crítica** — significa dedupePolicy detectou critical→clean transition e disparou resolve flow.

Se `events_count > 0` ou `actions.resolve = 0`, schema ainda tem drift ou cron não detectou — **PARE** e re-investigar.

- [ ] **Step 2: Confirmar audit_events resolved**

Use Supabase MCP `execute_sql`:
```sql
SELECT id, severity, payload->>'summary' AS summary,
       resolved_at, resolved_reason, superseded_by
FROM audit_events
WHERE auditor = 'rls-drift'
ORDER BY created_at DESC
LIMIT 3;
```

Expected: linha mais recente do alerta crítico tem `resolved_at` populado e `resolved_reason = 'next_run_clean'`.

- [ ] **Step 3: Confirmar Telegram resolved message recebida**

Manual: abrir Telegram → chat `InkFlow Alerts` → verificar mensagem nova com texto começando `[resolved] [rls-drift]`.

Expected: mensagem chegou. Anotar timestamp pra postmortem.

Se mensagem **não** chegou (mas `actions.resolve=1` no Step 1 e `resolved_at` populado no Step 2): bug em `sendTelegram` — anotar e investigar paralelo (não bloqueia este plano).

- [ ] **Step 4 (fallback manual): Ack manual se necessário**

Se por algum motivo o resolve flow não disparou (Step 1 retornou `actions.resolve=0`):

Manual: Telegram reply `ack c4934661` no chat InkFlow Alerts.

Expected: bot responde confirmando ack. Audit_events row PATCH manual `resolved_at`.

(Pular este step se o auto-resolve no Step 1-3 funcionou.)

---

## Task 5: Atualizar `RUNBOOK_PATH` em rls-drift.js

**Files:**
- Modify: `functions/_lib/auditors/rls-drift.js:18`

**Objetivo:** Linha 18 hoje cospe `RUNBOOK_PATH = null` — Telegram alert mostra "Runbook: none". Apontar pro runbook canônico que será criado na Task 6.

**Nota sobre escopo:** Spec aloca este update à Fase 2 (success criteria), mas adiantamos pra Fase 1 porque o naked runbook é entregue nesta sessão (Task 6). Próximo alerta `rls-drift` (caso venha antes da Fase 2 estar implementada) já cospe link clicável em vez de "none". Sem custo extra — 1 linha de change + redeploy automático via PR merge.

- [ ] **Step 1: Edit single line**

Edit `/Users/brazilianhustler/Documents/inkflow-saas/functions/_lib/auditors/rls-drift.js`:

Old:
```js
const RUNBOOK_PATH = null; // gap consciente — spec §5.4
```

New:
```js
const RUNBOOK_PATH = 'docs/canonical/runbooks/rls-drift.md';
```

- [ ] **Step 2: Verify edit**

Run:
```bash
grep -n "RUNBOOK_PATH" /Users/brazilianhustler/Documents/inkflow-saas/functions/_lib/auditors/rls-drift.js
```

Expected: linha 18 mostra novo valor.

---

## Task 6: Criar runbook canônico naked

**Files:**
- Create: `docs/canonical/runbooks/rls-drift.md`

**Objetivo:** Capturar o procedimento cru rodado neste hotfix. Não é o runbook formatado da Fase 2 — é o esboço fiel do que efetivamente foi feito. Cada comando que rodou no Task 1-4 entra aqui.

- [ ] **Step 1: Escrever arquivo**

Create `/Users/brazilianhustler/Documents/inkflow-saas/docs/canonical/runbooks/rls-drift.md`:

```markdown
---
title: Runbook — rls-drift
status: naked (Fase 1 — formalização canônica em Fase 2)
related_spec: docs/superpowers/specs/2026-05-06-auditor-self-remediation-design.md
first_incident: 2026-05-06 (audit_events c4934661)
---

# Runbook — rls-drift

> **Status:** Naked. Capturado durante hotfix 2026-05-06. Será formalizado
> em formato canônico na Fase 2 do framework auditor self-remediation.

## Detect

- **Auditor:** `functions/_lib/auditors/rls-drift.js` + cron `functions/api/cron/audit-rls-drift.js` (rodado a cada 12h via Routine Anthropic).
- **Sintomas detectados:**
  - `table_no_rls` (severity warn): tabela em `public` sem RLS, fora da allowlist.
  - `function_no_search_path` (severity critical): function em `public` sem `SET search_path`.
- **Telegram alert format:**
  ```
  [critical] [rls-drift] Function `public.<name>` sem search_path setado (security risk)
  ID: <short_id> | Runbook: docs/canonical/runbooks/rls-drift.md
  ```
- **Audit events query:**
  ```sql
  SELECT id, severity, payload, evidence, resolved_at
  FROM audit_events
  WHERE auditor = 'rls-drift' AND resolved_at IS NULL
  ORDER BY created_at DESC;
  ```

## Confirm (manual SQL)

Reproduzir a detecção do auditor (mesma query que `SQL_FUNCTIONS_NO_SEARCH_PATH` em `audit-rls-drift.js:29`):

```sql
-- Functions sem search_path
SELECT n.nspname AS schema, p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND (p.proconfig IS NULL OR NOT EXISTS (
    SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=%'
  ))
ORDER BY p.proname;
```

```sql
-- Tables sem RLS (warn — verificar allowlist RLS_INTENTIONAL_NO_PUBLIC)
SELECT n.nspname AS schema, c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relkind = 'r' AND n.nspname = 'public' AND NOT c.relrowsecurity
ORDER BY c.relname;
```

## Contain

**N/A.** Search-path injection requer adversário com privilégio CREATE em schema do path. Em InkFlow, role `service_role` tem CREATE mas é usado server-side com auth; role `authenticated`/`anon` não têm CREATE. Sem hot-path bleed.

Mitigação suficiente é o fix DDL (etapa Fix). Sem necessidade de revoke temp ou kill connection.

## Fix

### Procedimento manual (escape hatch — usado neste primeiro incidente)

Por function affected:

```sql
ALTER FUNCTION public.<function_name>([arg_types]) SET search_path = '';
```

Aplicar via Supabase MCP `apply_migration` (preferível, versiona em `supabase_migrations.schema_migrations`) OU via Supabase Studio SQL Editor (não versiona — usar só em emergency).

**Decisão `search_path = ''` (string vazia):** força qualificação total (`pg_catalog.count`, `public.tenants`). Mais seguro que `pg_catalog, public` — evita ambiguidade. Best-practice Postgres ≥15 + recomendação Supabase advisor [`0011_function_search_path_mutable`](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0011_function_search_path_mutable).

### Migration aplicada no incidente 2026-05-06

`supabase/migrations/2026-05-06-fix-rls-drift-search-path.sql` — 4 ALTER FUNCTION x4 dashboard RPCs + 1 trigger.

### Procedimento auto (Fase 2 — futuro)

Telegram reply `fix <short_id>` ou slash command `/fix-incident <short_id>` → server-side gera migration + abre PR. Approval visual no GitHub → merge → verify loop dispara ack auto.

Não-implementado nesta Fase 1. Deixar como pointer pro spec da Fase 2.

## Verify

```bash
# Re-rodar audit cron manual:
curl -X POST https://inkflowbrasil.com/api/cron/audit-rls-drift \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}' \
  --max-time 30
```

Expected response:
```json
{
  "ok": true,
  "run_id": "<uuid>",
  "events_count": 0,
  "actions": { "resolve": 1, "fire": 0, "supersede": 0, "silent": 0, "no_op": 0 }
}
```

**`actions.resolve = 1`** é a evidência canônica de que dedupePolicy detectou transição critical→clean e disparou resolve flow.

Confirmar paralelo:
- `audit_events` row do alert tem `resolved_at` populado + `resolved_reason = 'next_run_clean'`.
- Telegram chat InkFlow Alerts recebe mensagem `[resolved] [rls-drift] ...`.

## Postmortem

Template em `vault/InkFlow — Incidentes/<data>-rls-drift-<slug>.md`. Estrutura:

1. **O que aconteceu** (timeline factual)
2. **Por que aconteceu** (root cause: migration sem `SET search_path`)
3. **Como detectamos** (auditor cron — ver Detect acima)
4. **Como resolvemos** (Fix acima)
5. **O que mudar pra não repetir** (prevention: template de migration novo? CI check? pre-commit hook?)

Atualizar [[InkFlow — Painel]] + adicionar entry em [[InkFlow — Anomalias observadas]] (1ª ocorrência — promove a backlog se reincidir).

---

## Histórico de incidentes

- **2026-05-06** — primeiro incidente. 4 functions affected (3 dashboard RPCs + 1 trigger). Resolved via migration `2026-05-06-fix-rls-drift-search-path.sql`. Postmortem: `vault/InkFlow — Incidentes/2026-05-06-rls-drift-search-path.md`.
```

- [ ] **Step 2: Validar arquivo criado**

Run:
```bash
wc -l /Users/brazilianhustler/Documents/inkflow-saas/docs/canonical/runbooks/rls-drift.md
ls -la /Users/brazilianhustler/Documents/inkflow-saas/docs/canonical/runbooks/rls-drift.md
```

Expected: arquivo existe, ≥80 linhas.

---

## Task 7: Criar postmortem em vault

**Files:**
- Create: `/Users/brazilianhustler/Documents/vault/InkFlow — Incidentes/2026-05-06-rls-drift-search-path.md`

**Objetivo:** Documentar o incidente in-depth no vault Obsidian. Esse é a fonte de verdade do "lessons learned" — o runbook é processo, postmortem é caso.

- [ ] **Step 1: Criar diretório do vault Incidentes se não existir**

Run:
```bash
mkdir -p "/Users/brazilianhustler/Documents/vault/InkFlow — Incidentes"
ls -la "/Users/brazilianhustler/Documents/vault/InkFlow — Incidentes/"
```

Expected: diretório existe, lista vazia ou com outras notas (provavelmente vazia — primeiro incidente real do vault).

- [ ] **Step 2: Escrever postmortem**

Create `/Users/brazilianhustler/Documents/vault/InkFlow — Incidentes/2026-05-06-rls-drift-search-path.md`:

```markdown
---
date: 2026-05-06
incident_id: c4934661
auditor: rls-drift
severity: critical
duration_open: ~2h (alert 04:01 → escalation 06:05 → resolved <hotfix timestamp>)
related_pr: TBD (PR criado na Task 9)
related_runbook: docs/canonical/runbooks/rls-drift.md
related_spec: docs/superpowers/specs/2026-05-06-auditor-self-remediation-design.md
tags: [inkflow, incidente, rls-drift, security, postmortem]
---

# 2026-05-06 — rls-drift dashboard functions sem search_path

## TL;DR

Migration `2026-05-05-pr2-dashboard-rpc.sql` (PR #26 Dashboard) criou 3 functions em `public` sem `SET search_path`. Trigger antigo `update_conversa_last_msg_at` também não tinha. Auditor `rls-drift` detectou às 04:01 BRT, escalou às 06:05 (>2h sem ack). Hotfix: migration `2026-05-06-fix-rls-drift-search-path.sql` aplicou `ALTER FUNCTION ... SET search_path = ''` nas 4. Auditor confirmou clean no próximo run manual.

## Timeline (BRT)

- **2026-05-05 ~22:00** — PR #26 Dashboard merged. Migration `2026-05-05-pr2-dashboard-rpc.sql` aplicada. 3 dashboard RPCs criados em `public` sem `SET search_path` clause.
- **2026-05-06 04:01** — Auditor cron `audit-rls-drift` rodou. SQL introspection retornou 4 functions sem search_path (3 dashboard + 1 trigger antigo). DedupePolicy: action `fire` (estado prévio era clean). Telegram alert enviado: `[critical] [rls-drift] Function public.dashboard_resumo_periodo sem search_path setado (+3 findings)`. Push notification disparada via APN/FCM.
- **2026-05-06 06:05** — Sistema escalation. Push notification critical-level (sem ack >2h).
- **2026-05-06 ~<hotfix start>** — Leandro acordou, abriu Claude Code, começou brainstorming do framework auditor self-remediation.
- **2026-05-06 ~<spec time>** — Spec design `auditor-self-remediation-framework` commitada. Decisão Fase 1 = hotfix manual + naked runbook.
- **2026-05-06 ~<migration time>** — Migration `2026-05-06-fix-rls-drift-search-path.sql` aplicada via Supabase MCP. Re-run auditor → 0 findings.
- **2026-05-06 ~<resolve time>** — Audit cron manual disparado → action `resolve`. Telegram resolved message. Audit_events row resolved.

## Root cause

**Direto:** PR #26 (mig 2026-05-05) gerou DDL via copy/paste de SQL ad-hoc, sem template que inclua `SET search_path = ''`. Nem CI nem pre-commit hook validavam.

**Trigger antigo `update_conversa_last_msg_at`:** criado num momento anterior à introdução do auditor `rls-drift`. Foi inadvertidamente atrás de uma allowlist mental ("já existe, não cuteca") até o auditor pegar. Drift histórico, não regressão.

**Por que escalou >2h:** alerta às 04:01 BRT — Leandro dormindo. Sem ack handler automatizado, sem caminho fix automatizado, escalation funcionou como projetado.

## Detection

Auditor `rls-drift` SQL introspection contra `pg_proc`:
```sql
SELECT n.nspname, p.proname FROM pg_proc p ... WHERE p.proconfig IS NULL OR ...
```

Encontrou 4 functions. Collapse policy promoveu top-event critical com `affected_count: 4`. Telegram + push.

**Funcionou como projetado.** Sem falsos negativos, sem falsos positivos.

## Resolution

Migration aplicada via Supabase MCP `apply_migration`:

```sql
BEGIN;
ALTER FUNCTION public.dashboard_resumo_periodo(uuid, timestamptz, timestamptz) SET search_path = '';
ALTER FUNCTION public.dashboard_sinal_recebido(uuid, timestamptz) SET search_path = '';
ALTER FUNCTION public.dashboard_taxa_conversao(uuid, timestamptz) SET search_path = '';
ALTER FUNCTION public.update_conversa_last_msg_at() SET search_path = '';
COMMIT;
```

Verify via re-run auditor cron manual: `actions.resolve = 1`, `events_count: 0`. Telegram resolved confirmado.

## O que mudar pra não repetir

### P1 — Template de migration com `SET search_path` boilerplate

Criar template/snippet `supabase/migrations/_template-with-search-path.sql.example` que sirva de copy-paste pra futuras `CREATE OR REPLACE FUNCTION`. Exemplo:

```sql
CREATE OR REPLACE FUNCTION public.<name>(<args>)
RETURNS <type>
LANGUAGE <lang>
[STABLE | VOLATILE | IMMUTABLE]
SET search_path = ''      -- 🔒 ALWAYS include
SECURITY [DEFINER | INVOKER]
AS $$
  ...
$$;
```

Adicionar nota em `docs/canonical/runbooks/migration-checklist.md` (futuro) ou no README de `supabase/migrations/`.

### P1 — Pre-commit hook (Fase 2 ou separado)

Lint pre-commit que detecta `CREATE OR REPLACE FUNCTION` sem `SET search_path` linha em diff staged. Falha o commit com mensagem instrutiva.

Não-bloqueante pra esta Fase 1. Backlog item P1.

### P2 — Framework auditor self-remediation (Fase 2 desta spec)

Próxima sessão executará Fase 2: `remediate()`, `/fix-incident`, verify loop, alert enrichment. Ack >2h não vai mais virar surpresa — sistema já cospe PR proposto + comando reply.

## Lições

1. **Auditor funcionou como projetado.** Sem ele, esse drift teria ficado em prod indefinidamente.
2. **Gap de runbook (`RUNBOOK_PATH = null`) custou tempo.** Sem caminho documentado, primeira hora foi descobrir o que fazer. Fase 1 fecha esse gap.
3. **Naked runbook hoje > runbook formal nunca.** Capturar comandos crus enquanto frescos é o seed da Fase 2 formal — não é desperdiçado, é fundação.

---

[[InkFlow — Painel]] · [[InkFlow — Anomalias observadas]] · [[Mentalidade — Runbook incidentes]]
```

Substituir `<hotfix timestamp>`, `<migration time>`, `<resolve time>` com horários reais antes do commit.

- [ ] **Step 3: Validar arquivo criado**

Run:
```bash
wc -l "/Users/brazilianhustler/Documents/vault/InkFlow — Incidentes/2026-05-06-rls-drift-search-path.md"
```

Expected: ≥70 linhas.

---

## Task 8: Atualizar memory (Painel + Anomalias observadas)

**Files:**
- Modify: `/Users/brazilianhustler/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Painel.md`
- Modify: `/Users/brazilianhustler/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Anomalias observadas.md`

**Objetivo:** Atualizar o Painel pra refletir incidente resolvido + framework spec commitada. Adicionar entry no watchlist Anomalias observadas (1ª ocorrência — vira backlog item se reincidir).

- [ ] **Step 1: Atualizar Painel — empurrar "Onde estamos agora" pra "Estado anterior"**

O Painel atual tem 2 estados ativos:
1. "Onde estamos agora (06/05/2026 noite — refator prompts Coleta v2 + hotfix race condition MERGED)"
2. "Estado anterior (06/05/2026 madrugada — Limpeza Tooling completada)"

Esta sessão é hotfix rls-drift + spec framework. Vai virar nova "Onde estamos agora". Empurrar:
- Atual "Onde estamos agora" → "Estado anterior" (renomear seção)
- Atual "Estado anterior" → empurrar pro `InkFlow — Painel histórico.md` (regra: máx 2 ativos)

Edit `/Users/brazilianhustler/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Painel.md`:

a. **Append em `InkFlow — Painel histórico.md`** o conteúdo atual de "Estado anterior (06/05/2026 madrugada — Limpeza Tooling)" (linhas ~85-167 do Painel atual). Adicionar prepend no histórico com header próprio.

b. **Renomear seção:** mudar `## 📊 Onde estamos agora (06/05/2026 noite — refator...)` → `## 📊 Estado anterior (06/05/2026 noite — refator...)`. Apagar a seção velha "Estado anterior (06/05/2026 madrugada — Limpeza Tooling)" do Painel ativo (já foi pro histórico no passo a).

c. **Adicionar nova seção "Onde estamos agora"** no topo (logo após "## Atualização desta página..."):

```markdown
## 📊 Onde estamos agora (06/05/2026 manhã — **rls-drift hotfix + spec framework auditor self-remediation 🚨🛠️**)

**Resumo da sessão (06/05 ~04:01 BRT alerta → ~<hotfix end> resolved):** alerta crítico `rls-drift c4934661` (4 functions em `public` sem `search_path`) detectado pelo auditor às 04:01 BRT. Escalou >2h (push notification 06:05). Brainstorm framework "auditor self-remediation" (3 fases: hotfix manual + framework genérico + roll-out JIT). Spec commitada `feat/auditor-self-remediation` (`546ad50`, 468 linhas). Fase 1 executada nesta sessão: migration `2026-05-06-fix-rls-drift-search-path.sql` aplicada via Supabase MCP, auditor confirmou clean (`actions.resolve=1`, `events_count=0`), Telegram resolved, audit_events row `resolved_at` populado. Naked runbook `docs/canonical/runbooks/rls-drift.md` criado. Postmortem em vault. `RUNBOOK_PATH` agora aponta pro runbook (era `null`). PR aberto registrando hotfix + spec.

### 🚨 Incidente resolvido — rls-drift c4934661

| Function | Origem | Fix |
|---|---|---|
| `dashboard_resumo_periodo` | PR #26 mig 2026-05-05 | `SET search_path = ''` |
| `dashboard_sinal_recebido` | PR #26 mig 2026-05-05 | `SET search_path = ''` |
| `dashboard_taxa_conversao` | PR #26 mig 2026-05-05 | `SET search_path = ''` |
| `update_conversa_last_msg_at` | trigger antigo | `SET search_path = ''` |

### 🛠️ Framework auditor self-remediation — Fase 1 entregue

- **Spec:** `docs/superpowers/specs/2026-05-06-auditor-self-remediation-design.md` (3 fases, 468 linhas)
- **Plano Fase 1:** `docs/superpowers/plans/2026-05-06-rls-drift-hotfix-fase1.md`
- **Naked runbook:** `docs/canonical/runbooks/rls-drift.md` (será formalizado na Fase 2)
- **Postmortem:** `vault/InkFlow — Incidentes/2026-05-06-rls-drift-search-path.md`
- **Branch:** `feat/auditor-self-remediation` (PR #<TBD>)

### 📌 Próxima sessão (Fase 2)

Framework genérico: contract `remediate(event)` em cada auditor, slash command `/fix-incident <id>`, verify loop, alert Telegram enriquecido. Spec §Phasing detalha tasks.

### 🔗 Memory anchors atualizados nesta sessão

- (esta entry no Painel)
- `[[InkFlow — Anomalias observadas]]` — entry rls-drift (1ª ocorrência)
- Daily note 2026-05-06.md — adicionar parte 3 (rls-drift hotfix)
```

Substituir `<hotfix end>` e `<TBD>` (PR number) com valores reais antes do commit.

- [ ] **Step 2: Adicionar entry em Anomalias observadas**

Edit `/Users/brazilianhustler/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Anomalias observadas.md`.

Adicionar antes da seção `## Arquivadas` (após a entry `2026-04-30 14:08 BRT — vps-limits disco 92% falsa-positiva`):

```markdown
### 2026-05-06 04:01 BRT — rls-drift dashboard functions sem search_path

**Severidade observada:** critical
**Componente:** Auditor #4 rls-drift (cron CF Pages — Routine Anthropic primary)
**Reincidências:** 1
**Run IDs:** `<run_id do fire>`, `<run_id do resolve>`
**Audit event ID:** c4934661...

**O que aconteceu (objetivo, sem hipótese):**
Auditor `rls-drift` detectou 4 functions em `public` sem `SET search_path` (3 dashboard RPCs criadas em PR #26 + 1 trigger antigo `update_conversa_last_msg_at`). Telegram alert às 04:01 BRT (severity critical). Escalation push às 06:05 (>2h sem ack). Hotfix manual: migration `2026-05-06-fix-rls-drift-search-path.sql` aplicada via Supabase MCP, audit cron re-run confirmou clean. Janela total alert→resolve: ~<X horas>.

**Hipóteses não-confirmadas:**
- H1: PR #26 Dashboard usou template/copy-paste sem `SET search_path` clause — evidência pró: 3 das 4 functions são da mesma migration; evidência contra: nenhuma — H1 muito provavelmente correta.
- H2: trigger `update_conversa_last_msg_at` criado pré-auditor (drift histórico) — evidência pró: function existia antes do auditor `rls-drift` ser introduzido (Sub-projeto 3, 2026-04-27); evidência contra: nenhuma.

**Resolução observada:**
Hotfix manual via migration `ALTER FUNCTION ... SET search_path = ''` x4. Re-run auditor confirmou `actions.resolve=1`. Sistema dedupePolicy + Telegram resolved flow funcionou como projetado.

**Trigger pra escalar pro backlog:**
Reincidência **+1 vez nos próximos 30 dias** (até **2026-06-05**) abre item P2 `Pre-commit hook valida SET search_path em CREATE FUNCTION` no Backlog atual. Ver postmortem `vault/InkFlow — Incidentes/2026-05-06-rls-drift-search-path.md` §"O que mudar pra não repetir".

**Próxima checagem:**
2026-06-05 (30d após este evento). Se zero reincidências e Fase 2 do framework já merged, arquiva entry.

---
```

Anotar `<run_id do fire>` e `<run_id do resolve>` da Task 1 Step 2 e Task 4 Step 1 respectivamente. Substituir `<X horas>` com diff real.

- [ ] **Step 3: Verify ambos arquivos**

Run:
```bash
grep -c "rls-drift" "/Users/brazilianhustler/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Painel.md"
grep -c "rls-drift" "/Users/brazilianhustler/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Anomalias observadas.md"
```

Expected: ambos ≥1 occurrence (Painel novo bloco + Anomalias nova entry).

---

## Task 9: Commit + push + abrir PR

**Files:**
- (commits e push da branch `feat/auditor-self-remediation`)

**Objetivo:** Versionar tudo da Fase 1 num PR. Migration já aplicada em prod (Task 3) — PR é registro pós-fato.

- [ ] **Step 1: Verificar git status — todos os arquivos staged**

Run:
```bash
git -C /Users/brazilianhustler/Documents/inkflow-saas status -s
```

Expected: novos files:
- `supabase/migrations/2026-05-06-fix-rls-drift-search-path.sql`
- `docs/canonical/runbooks/rls-drift.md`
- `docs/superpowers/plans/2026-05-06-rls-drift-hotfix-fase1.md`
- (já committed: `docs/superpowers/specs/2026-05-06-auditor-self-remediation-design.md`)

Modified:
- `functions/_lib/auditors/rls-drift.js`

Note: arquivos do vault e memory não estão neste repo — sync separado via hook `sync-git-repos.sh`.

- [ ] **Step 2: Add e commitar**

Run:
```bash
git -C /Users/brazilianhustler/Documents/inkflow-saas add \
  supabase/migrations/2026-05-06-fix-rls-drift-search-path.sql \
  docs/canonical/runbooks/rls-drift.md \
  docs/superpowers/plans/2026-05-06-rls-drift-hotfix-fase1.md \
  functions/_lib/auditors/rls-drift.js

git -C /Users/brazilianhustler/Documents/inkflow-saas commit -m "$(cat <<'EOF'
fix(rls-drift): set search_path='' em 4 functions + naked runbook

Resolve audit alert c4934661 (critical, 2026-05-06 04:01 BRT). Migration
ALTER FUNCTION nas 3 dashboard RPCs (PR #26) + trigger update_conversa_last_msg_at.
Auditor confirmou clean via re-run manual (actions.resolve=1, events_count=0).

Naked runbook docs/canonical/runbooks/rls-drift.md captura o procedimento
cru rodado neste hotfix — Fase 2 do framework formaliza em formato canônico.

RUNBOOK_PATH em rls-drift.js agora aponta pro runbook (era null) — próximos
alertas vão cospir link clicável no Telegram.

Postmortem em vault/InkFlow — Incidentes/2026-05-06-rls-drift-search-path.md.

Spec: docs/superpowers/specs/2026-05-06-auditor-self-remediation-design.md
Plan: docs/superpowers/plans/2026-05-06-rls-drift-hotfix-fase1.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit criado (1 file change spec já estava commitada anterior).

- [ ] **Step 3: Push branch**

Run:
```bash
git -C /Users/brazilianhustler/Documents/inkflow-saas push -u origin feat/auditor-self-remediation 2>&1 | tail -5
```

Expected: branch pushed, link pro PR sugerido pelo GitHub.

- [ ] **Step 4: Abrir PR via gh**

Run:
```bash
gh -R brazilianhustle/inkflow-saas pr create \
  --title "fix(rls-drift): hotfix search_path + spec framework auditor self-remediation Fase 1" \
  --body "$(cat <<'EOF'
## Summary

Resolve audit alert critical `rls-drift c4934661` (2026-05-06 04:01 BRT). Migration aplicada via Supabase MCP em prod ANTES deste PR (alerta crítico, hotfix imediato — PR é registro versionado pós-fato).

Inclui também spec do framework "auditor self-remediation" (3 fases) que generaliza o caminho **detect → remediate → verify → ack** com PR como gate humano. Fase 1 (este PR) entrega o hotfix manual + naked runbook que vira input da Fase 2 (próxima sessão).

## Mudanças

### Hotfix (Fase 1)

- **Migration `supabase/migrations/2026-05-06-fix-rls-drift-search-path.sql`** — `ALTER FUNCTION ... SET search_path = ''` em 4 functions:
  - `dashboard_resumo_periodo` (PR #26)
  - `dashboard_sinal_recebido` (PR #26)
  - `dashboard_taxa_conversao` (PR #26)
  - `update_conversa_last_msg_at` (trigger antigo)
- **`functions/_lib/auditors/rls-drift.js:18`** — `RUNBOOK_PATH` aponta pro runbook (era `null`).
- **`docs/canonical/runbooks/rls-drift.md`** — naked runbook capturando comandos crus do hotfix (Fase 2 formaliza).

### Spec + Plano

- **Spec:** `docs/superpowers/specs/2026-05-06-auditor-self-remediation-design.md` (468 linhas, commit anterior nesta branch)
- **Plano Fase 1:** `docs/superpowers/plans/2026-05-06-rls-drift-hotfix-fase1.md`

### Postmortem

`vault/InkFlow — Incidentes/2026-05-06-rls-drift-search-path.md` (vault Obsidian, não está neste PR — sync via hook).

## Test plan

- [x] Verify schema state pre-fix: query introspection retornou 4 functions sem search_path.
- [x] Apply migration via Supabase MCP `apply_migration`.
- [x] Verify schema state post-fix: query introspection retornou 0 functions.
- [x] Re-run audit cron manual (`POST /api/cron/audit-rls-drift`): `actions.resolve=1`, `events_count=0`.
- [x] Confirm `audit_events` row: `resolved_at` populado, `resolved_reason='next_run_clean'`.
- [x] Confirm Telegram resolved message recebida em chat InkFlow Alerts.

## Próximo

Fase 2 em sessão dedicada: contract `remediate()` em cada auditor, slash command `/fix-incident`, verify loop, alert Telegram enriquecido. Ver spec §Phasing.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR criado, URL retornada. Anotar PR number.

- [ ] **Step 5: Atualizar Painel + Postmortem com PR number**

Substituir `<TBD>` (Painel) e `related_pr: TBD` (postmortem) com PR number real.

```bash
# Painel
sed -i '' "s/PR #<TBD>/PR #<N>/" "/Users/brazilianhustler/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Painel.md"

# Postmortem
sed -i '' "s/related_pr: TBD.*$/related_pr: <pr_url>/" "/Users/brazilianhustler/Documents/vault/InkFlow — Incidentes/2026-05-06-rls-drift-search-path.md"
```

Substituir `<N>` e `<pr_url>` com valores reais.

- [ ] **Step 6: Confirmar PR aberto e CI status**

Run:
```bash
gh -R brazilianhustle/inkflow-saas pr view --json number,url,state,statusCheckRollup
```

Expected: state=OPEN, statusCheckRollup ainda PENDING (deploy preview rodando).

PR fica aberto pra Leandro mergear quando quiser. Migration já está em prod.

---

## Done check

- [ ] Audit alert `c4934661` resolved (audit_events.resolved_at populado).
- [ ] Telegram resolved message recebida.
- [ ] Schema state clean (query introspection 0 rows).
- [ ] Migration `2026-05-06-fix-rls-drift-search-path.sql` em `supabase_migrations.schema_migrations`.
- [ ] `functions/_lib/auditors/rls-drift.js:18` aponta pro runbook canônico.
- [ ] Runbook canônico criado em `docs/canonical/runbooks/rls-drift.md`.
- [ ] Postmortem criado em `vault/InkFlow — Incidentes/2026-05-06-rls-drift-search-path.md`.
- [ ] Painel atualizado (nova seção "Onde estamos agora" + push pro histórico).
- [ ] Anomalias observadas tem entry rls-drift 1ª ocorrência.
- [ ] PR aberto na branch `feat/auditor-self-remediation`.
- [ ] PR description tem link pra spec, plano, runbook.

Saída: alerta resolvido em prod, infra básica do framework no lugar (RUNBOOK_PATH populado), Fase 2 spec'ada e plano'ada — pronto pra próxima sessão de implementação.
