-- Onda 1 — Archive smokes históricos (ref F1.6.8)
-- Applied: 2026-05-07 (version 20260507055058 in supabase_migrations)
-- Plan: docs/superpowers/plans/2026-05-07-auditoria-sprint-1-quick-wins.md (Onda 1, Task 1.5)
--
-- Smokes do framework setup do Sub-projeto 3 (auditores) em 2026-04-27.
-- 5 audit_runs (3 smoke-test + 2 smoke-escalation) + 5 audit_events.
-- Não são execuções de produção — só smoke pré-MVP.

BEGIN;

DELETE FROM public.audit_events
  WHERE auditor IN ('smoke-test', 'smoke-escalation');

DELETE FROM public.audit_runs
  WHERE auditor IN ('smoke-test', 'smoke-escalation');

COMMIT;
