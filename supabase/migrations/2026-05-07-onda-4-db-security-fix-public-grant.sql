-- Onda 4 — DB security migrations (parte 2 de 2 — fix do REVOKE)
-- Applied: 2026-05-07 (version 20260507060735 in supabase_migrations)
-- Refs F1.4.3 (RPCs anon-callable)
-- Plan: docs/superpowers/plans/2026-05-07-onda-4-db-security.md
--
-- Issue descoberto pós-apply da migration anterior:
-- ACL pré-fix nos 2 RPCs era "=X/postgres" (PUBLIC has EXECUTE granted by postgres).
-- REVOKE FROM anon, authenticated NÃO afeta — anon e authenticated herdam EXECUTE
-- via PUBLIC role membership.
-- Solução: REVOKE FROM PUBLIC. service_role já tem grant explícito (preservado).
--
-- ACL pós-fix:
--   postgres=X/postgres    (owner, mantém)
--   service_role=X/postgres (callers usam service_role, mantém)

BEGIN;

REVOKE EXECUTE ON FUNCTION public.expire_trials() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.merge_conversa_jsonb(uuid, text, jsonb, text, boolean) FROM PUBLIC;

COMMIT;
