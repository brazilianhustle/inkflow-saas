-- Onda 1 — Cleanup zero-risk (refs F1.4.12, F1.4.8, F1.4.10)
-- Applied: 2026-05-07 (version 20260507055043 in supabase_migrations)
-- Plan: docs/superpowers/plans/2026-05-07-auditoria-sprint-1-quick-wins.md (Onda 1)

BEGIN;

-- F1.4.12 — Drop RPC dead (não referenciada em nenhum trigger ou código)
DROP FUNCTION IF EXISTS public.atualizar_timestamp_campanha();

-- F1.4.8 — Drop constraint UNIQUE duplicada.
-- Nota: dados_cliente_tenant_id_telefone_key é UNIQUE CONSTRAINT (não índice standalone).
-- O índice de mesmo nome é gerado automaticamente pra suportar a constraint.
-- DROP CONSTRAINT remove ambos. unique_tenant_telefone permanece como definitivo.
ALTER TABLE public.dados_cliente DROP CONSTRAINT IF EXISTS dados_cliente_tenant_id_telefone_key;

-- F1.4.10 — Drop 4 índices unused (idx_scan = 0 confirmado pré-apply)
DROP INDEX IF EXISTS public.approvals_status_idx;
DROP INDEX IF EXISTS public.approvals_expires_at_idx;
DROP INDEX IF EXISTS public.idx_conversas_orcid;
DROP INDEX IF EXISTS public.idx_chats_tenant_id;

COMMIT;
