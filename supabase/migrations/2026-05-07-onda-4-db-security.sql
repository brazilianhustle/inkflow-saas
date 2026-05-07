-- Onda 4 — DB security migrations (parte 1 de 2)
-- Applied: 2026-05-07 (version 20260507060656 in supabase_migrations)
-- Refs F1.4.2 (views SECURITY DEFINER) + F1.4.3 (RPCs anon-callable)
-- Plan: docs/superpowers/plans/2026-05-07-onda-4-db-security.md
--
-- Caller mapping confirmado: todos callers das 2 views e 2 RPCs usam service_role.
-- service_role mantém EXECUTE em functions e bypassa restrições de RLS by default.
--
-- ⚠️ NOTA pós-apply: o REVOKE FROM anon, authenticated NÃO foi suficiente — anon e
-- authenticated herdam EXECUTE de PUBLIC, que tinha grant default. Ver migration
-- complementar 2026-05-07-onda-4-db-security-fix-public-grant.sql.

BEGIN;

-- F1.4.2 — Views SECURITY DEFINER → SECURITY INVOKER
-- Postgres 15+ syntax: ALTER VIEW ... SET (security_invoker = on)
ALTER VIEW public.audit_current_state SET (security_invoker = on);
ALTER VIEW public.orcamentos SET (security_invoker = on);

-- F1.4.3 — Revoke EXECUTE de anon e authenticated nas 2 RPCs SECURITY DEFINER
-- (nota: insuficiente — ver migration complementar de PUBLIC revoke)
REVOKE EXECUTE ON FUNCTION public.expire_trials() FROM anon;
REVOKE EXECUTE ON FUNCTION public.expire_trials() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_conversa_jsonb(uuid, text, jsonb, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.merge_conversa_jsonb(uuid, text, jsonb, text, boolean) FROM authenticated;

COMMIT;
