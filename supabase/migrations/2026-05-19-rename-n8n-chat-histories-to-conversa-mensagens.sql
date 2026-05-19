-- supabase/migrations/2026-05-19-rename-n8n-chat-histories-to-conversa-mensagens.sql
-- Rename tabela legacy n8n_chat_histories → conversa_mensagens
-- (residuo do n8n decommission Cutover Sub-4.1, 13/05)
--
-- Risco: baixo. ALTER TABLE RENAME no Postgres eh metadata-only,
-- dados intactos. Inclui rename de PK, indexes, trigger e RLS policies
-- pra remover "chat_histories" do nome de tudo.
--
-- Janela de quebra: entre apply migration e deploy CF Pages com codigo
-- refatorado. Mitigacao: aplicar em janela de baixo trafego + deploy
-- imediato depois.

BEGIN;

-- 1) Rename tabela
ALTER TABLE public.n8n_chat_histories RENAME TO conversa_mensagens;

-- 2) Rename primary key constraint
ALTER INDEX public.n8n_chat_histories_pkey RENAME TO conversa_mensagens_pkey;

-- 3) Rename index session_id
ALTER INDEX public.idx_chat_histories_session RENAME TO idx_conversa_mensagens_session;

-- 4) Rename trigger
ALTER TRIGGER trg_n8n_chat_histories_update_conversa
  ON public.conversa_mensagens
  RENAME TO trg_conversa_mensagens_update_conversa;

-- 5) Rename RLS policies (drop+create — Postgres nao tem ALTER POLICY ... RENAME pre-15)
-- (Se o projeto ja estiver no PG 15+, pode usar ALTER POLICY ... RENAME TO ...
--  mas drop+create eh portavel)
DROP POLICY IF EXISTS anon_no_access_chat_histories ON public.conversa_mensagens;
DROP POLICY IF EXISTS service_role_chat_histories   ON public.conversa_mensagens;

CREATE POLICY anon_no_access_conversa_mensagens
  ON public.conversa_mensagens
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY service_role_conversa_mensagens
  ON public.conversa_mensagens
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6) Rename CHECK constraint (adicionada na sub-4.1)
ALTER TABLE public.conversa_mensagens
  RENAME CONSTRAINT n8n_chat_histories_status_check TO conversa_mensagens_status_check;

-- 7) Rename UNIQUE partial index (adicionado na sub-4.1)
ALTER INDEX IF EXISTS public.n8n_chat_histories_session_evo_msg_idx
  RENAME TO conversa_mensagens_session_evo_msg_idx;

COMMIT;
