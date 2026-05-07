# Onda 4 — DB security migrations — Sub-plan

> Sub-plan da Onda 4 do macro plan `2026-05-07-auditoria-sprint-1-quick-wins.md`. Mudanças DDL com risco — caller mapping documentado abaixo.

**Goal:** fechar 4 lints de security advisor (`security_definer_view` × 2 + `anon_security_definer_function_executable` × 2 + `authenticated_security_definer_function_executable` × 2 = total 6 lints) sem quebrar callers em produção.

**Findings cobertos:** F1.4.2 (2 views SECURITY DEFINER) + F1.4.3 (2 RPCs anon-callable).

## Caller mapping (confirmado via grep + leitura do código)

| Item | Caller code | Auth method |
|---|---|---|
| `expire_trials()` | **NINGUÉM** — `functions/api/cron/expira-trial.js` usa REST direto (`PATCH /rest/v1/tenants?...`), não a RPC | N/A — RPC dead |
| `merge_conversa_jsonb(...)` | `functions/api/tools/dados-coletados.js:113` via `supaFetch` (`_tool-helpers.js`) | `SUPABASE_SERVICE_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` |
| view `audit_current_state` | `functions/_lib/audit-state.js:53` (chamado pelos 5 auditores) | service_role via `sbHeaders(supabase)` |
| view `orcamentos` | `functions/api/dashboard/kpis.js:99` + `functions/api/dashboard/regenerate-resumo-semanal.js:84` | `SUPABASE_SERVICE_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` |

**Conclusão:** todos os callers usam **service_role**, que mantém EXECUTE em functions e bypassa restrições de RLS por default. Mudanças são SAFE.

## Cenário de risco

| Mudança | Risco | Mitigação |
|---|---|---|
| REVOKE EXECUTE FROM anon, authenticated em `expire_trials()` | **zero** — RPC dead | dropar a RPC inteira é tentador mas vai pra Sprint 2 (não force scope creep agora) |
| REVOKE EXECUTE FROM anon, authenticated em `merge_conversa_jsonb(...)` | baixo — caller usa service_role | smoke pós-apply: rodar tool `dados_coletados` end-to-end |
| ALTER VIEW `audit_current_state` SET (security_invoker = on) | baixo — caller usa service_role | smoke: GET via REST com service_role retorna rows |
| ALTER VIEW `orcamentos` SET (security_invoker = on) | baixo — caller usa service_role | smoke: GET via REST retorna count |

## Pré-condições

- [ ] Branch `chore/auditoria-onda-4-db-security` ativa, working tree clean
- [ ] Onda 0 (baseline) e Onda 1 (cleanup) já mergeadas (state em main = `3af5ec4`+)

## Migration

**Files:**
- Create: `supabase/migrations/2026-05-07-onda-4-db-security.sql`

```sql
-- Onda 4 — DB security migrations
-- Refs F1.4.2 (views SECURITY DEFINER) + F1.4.3 (RPCs anon-callable)
-- Plan: docs/superpowers/plans/2026-05-07-onda-4-db-security.md
--
-- Caller mapping confirmado: todos callers usam service_role (SUPABASE_SERVICE_KEY).
-- service_role mantém EXECUTE em functions e bypassa restrições de RLS by default.

BEGIN;

-- F1.4.2 — Views SECURITY DEFINER → SECURITY INVOKER
-- Postgres 15+ syntax: ALTER VIEW ... SET (security_invoker = on)
ALTER VIEW public.audit_current_state SET (security_invoker = on);
ALTER VIEW public.orcamentos SET (security_invoker = on);

-- F1.4.3 — Revoke EXECUTE de anon e authenticated nas 2 RPCs SECURITY DEFINER
-- service_role mantém EXECUTE (não revogado). Functions continuam SECURITY DEFINER
-- (preservando privilégio elevado quando chamadas pelo service_role) mas não são
-- mais expostas via /rest/v1/rpc/ pra anon/authenticated tokens.
REVOKE EXECUTE ON FUNCTION public.expire_trials() FROM anon;
REVOKE EXECUTE ON FUNCTION public.expire_trials() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_conversa_jsonb(uuid, text, jsonb, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.merge_conversa_jsonb(uuid, text, jsonb, text, boolean) FROM authenticated;

COMMIT;
```

## Smoke tests pós-apply

### Smoke 1: views ainda retornam dados via service_role

```sql
SELECT COUNT(*) AS audit_state_rows FROM public.audit_current_state;
SELECT COUNT(*) AS orcamentos_rows FROM public.orcamentos;
```

Expected: counts >= 0 sem erro.

### Smoke 2: RPC `merge_conversa_jsonb` com service_role ainda funciona

Não vou rodar isso aqui — vai ficar como TODO smoke pós-merge:

```bash
# Via curl com SUPABASE_SERVICE_KEY (não rodar nesta auditoria — requer env var):
# curl -X POST "https://bfzuxxuscyplfoimvomh.supabase.co/rest/v1/rpc/merge_conversa_jsonb" \
#   -H "apikey: $SUPABASE_SERVICE_KEY" \
#   -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
#   -H "Content-Type: application/json" \
#   -d '{"p_conversa_id": "<UUID>", "p_field_name": "test", "p_patch": {}}'
# Expected: 200 (ou erro de validação de UUID — não 403)
```

### Smoke 3: confirmar bloqueio com anon key

```bash
# Após apply, via curl com SUPABASE_ANON_KEY:
# curl -X POST "https://bfzuxxuscyplfoimvomh.supabase.co/rest/v1/rpc/expire_trials" \
#   -H "apikey: $SUPABASE_ANON_KEY" \
#   -H "Authorization: Bearer $SUPABASE_ANON_KEY"
# Expected: 403 ou 401 (NÃO 200)
```

### Smoke 4: re-rodar advisors

```
mcp__plugin_supabase_supabase__get_advisors({type: "security"})
```

Expected delta:
- `security_definer_view` × 2 → ausentes
- `anon_security_definer_function_executable` × 2 → ausentes
- `authenticated_security_definer_function_executable` × 2 → ausentes

Total: 6 lints fechados.

## Rollback

Se algum smoke falhar pós-apply:

```sql
BEGIN;
ALTER VIEW public.audit_current_state SET (security_invoker = off);
ALTER VIEW public.orcamentos SET (security_invoker = off);
GRANT EXECUTE ON FUNCTION public.expire_trials() TO anon;
GRANT EXECUTE ON FUNCTION public.expire_trials() TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_conversa_jsonb(uuid, text, jsonb, text, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.merge_conversa_jsonb(uuid, text, jsonb, text, boolean) TO authenticated;
COMMIT;
```

## DoD

- [ ] Migration aplicada via `apply_migration` do Supabase MCP
- [ ] Arquivo `supabase/migrations/2026-05-07-onda-4-db-security.sql` no repo
- [ ] Smoke 1: views retornam rows via service_role
- [ ] Smoke 4: 6 lints de security advisor fechados
- [ ] Commit + push + PR + CI verde + merge
- [ ] **Pós-merge** (manual, com env vars apropriadas):
  - [ ] Smoke 2 (merge_conversa_jsonb com service_role retorna 200)
  - [ ] Smoke 3 (expire_trials com anon retorna 403)
  - [ ] Smoke E2E hot path 1: cliente WhatsApp → bot agente → tool `dados_coletados` chama merge_conversa_jsonb → conversa persiste
