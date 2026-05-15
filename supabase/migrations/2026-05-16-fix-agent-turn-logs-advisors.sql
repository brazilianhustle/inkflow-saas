-- Migration: fix 2 advisor warnings introduzidos por 2026-05-16-create-agent-turn-logs.sql
--   1. auth_rls_initplan em atl_admin_select — per-row auth.jwt() re-eval
--   2. unindexed_foreign_keys em agent_turn_logs_tenant_id_fkey
-- Aplicada apos discoverry via get_advisors pos-migration original.
-- Policy "zero novos warnings" (plan Step 11.6) exige correcao.

-- Fix 1: recreate policy com (select auth.jwt()) pattern (init-plan-friendly)
DROP POLICY IF EXISTS atl_admin_select ON public.agent_turn_logs;
CREATE POLICY atl_admin_select ON public.agent_turn_logs
  FOR SELECT TO authenticated
  USING (
    ((select auth.jwt()) ->> 'email') = 'lmf4200@gmail.com'
  );

-- Fix 2: covering index para tenant_id FK
CREATE INDEX IF NOT EXISTS idx_atl_tenant ON public.agent_turn_logs(tenant_id);
