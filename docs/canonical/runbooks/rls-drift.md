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
  SELECT id, severity, payload, evidence, detected_at, escalated_at,
         resolved_at, alert_count, run_id
  FROM audit_events
  WHERE auditor = 'rls-drift' AND resolved_at IS NULL
  ORDER BY detected_at DESC;
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

```sql
BEGIN;
ALTER FUNCTION public.dashboard_resumo_periodo(uuid, timestamptz, timestamptz) SET search_path = '';
ALTER FUNCTION public.dashboard_sinal_recebido(uuid, timestamptz) SET search_path = '';
ALTER FUNCTION public.dashboard_taxa_conversao(uuid, timestamptz) SET search_path = '';
ALTER FUNCTION public.update_conversa_last_msg_at() SET search_path = '';
COMMIT;
```

### PATCH manual de audit_events (se cron natural ainda não rodou)

Se schema foi fixado mas event ainda aparece como `resolved_at IS NULL` no banco (cron natural roda a cada ~12h):

```sql
UPDATE audit_events
SET acknowledged_at = NOW(),
    acknowledged_by = '<who>',
    resolved_at = NOW(),
    resolved_reason = 'manual_fix_search_path_added_via_migration_<date>'
WHERE auditor = 'rls-drift'
  AND id IN ('<event_id>', ...)
  AND resolved_at IS NULL;
```

**Limitação:** PATCH manual NÃO dispara Telegram resolved message (dedupePolicy + sendTelegram só rodam no cron). Próximo cron natural reconhece schema clean e envia resolved automático. Push notification no celular precisa ser dismissed manual.

### Procedimento auto (Fase 2 — futuro)

Telegram reply `fix <short_id>` ou slash command `/fix-incident <short_id>` → server-side gera migration + abre PR. Approval visual no GitHub → merge → verify loop dispara ack auto + Telegram resolved.

Não-implementado nesta Fase 1. Deixar como pointer pro spec da Fase 2.

## Verify

### Caminho A — auditor cron manual (precisa CRON_SECRET)

```bash
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

`actions.resolve = 1` é a evidência canônica de que dedupePolicy detectou transição critical→clean e disparou resolve flow + Telegram resolved.

**Nota:** CRON_SECRET vive no env do worker CF Pages (não em bws). Caminho A só funciona dentro do worker context, não shell local. Se precisar trigger manual a partir do shell, adicionar CRON_SECRET ao bws ou usar Cloudflare Pages dashboard "Manual trigger".

### Caminho B — query introspection (sempre funciona)

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

Expected: zero rows.

### Caminho C — audit_events row check

```sql
SELECT id, severity, resolved_at, resolved_reason, acknowledged_by
FROM audit_events
WHERE auditor = 'rls-drift'
ORDER BY detected_at DESC LIMIT 5;
```

Expected: events recentes têm `resolved_at` populado.

## Postmortem

Template em `vault/InkFlow — Incidentes/<data>-rls-drift-<slug>.md`. Estrutura:

1. **TL;DR** (1-2 frases)
2. **Timeline** (BRT, fact-only)
3. **Root cause** (direto + drift histórico)
4. **Detection** (como o auditor pegou)
5. **Resolution** (migration + PATCH se aplicável)
6. **O que mudar pra não repetir** (prevention concreta)
7. **Lições**

Atualizar [[InkFlow — Painel]] + adicionar entry em [[InkFlow — Anomalias observadas]] (1ª ocorrência — promove a backlog se reincidir).

---

## Histórico de incidentes

- **2026-05-06** — primeiro incidente. 4 functions affected (3 dashboard RPCs + 1 trigger). 2 events abertos no audit_events table (atual `c4934661` 06/05 + `9ad6fb70` 05/05 — dedupePolicy supersede não funcionou entre eles, vale investigar). Ambos resolved via PATCH manual + migration `2026-05-06-fix-rls-drift-search-path.sql`. Postmortem: `vault/InkFlow — Incidentes/2026-05-06-rls-drift-search-path.md`.
