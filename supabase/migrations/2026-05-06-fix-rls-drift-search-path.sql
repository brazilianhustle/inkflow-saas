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
