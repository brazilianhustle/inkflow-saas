-- Onda 1 — Storage tattoo_bucket fix (ref F1.4.5)
-- Applied: 2026-05-07 (version 20260507055051 in supabase_migrations)
-- Plan: docs/superpowers/plans/2026-05-07-auditoria-sprint-1-quick-wins.md (Onda 1, Task 1.3)

BEGIN;

-- F1.4.5 — Bloquear LIST mantendo GET de objeto direto.
-- A policy antiga `public_read_all_images 1k3l0rg_0` permitia LIST de todos os
-- arquivos do bucket. URL pública de objeto não precisa de LIST — só GET por path.
DROP POLICY IF EXISTS "public_read_all_images 1k3l0rg_0" ON storage.objects;

CREATE POLICY "tattoo_bucket_public_object_read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'tattoo_bucket' AND name IS NOT NULL);

COMMIT;
