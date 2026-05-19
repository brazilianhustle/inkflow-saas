-- Rename da sequence orfa que sobrou do rename n8n_chat_histories -> conversa_mensagens.
-- ALTER TABLE ... RENAME nao renomeia a sequence dona de coluna SERIAL/identity,
-- entao a sequence do id continuou com o nome legado apos a migration principal
-- (2026-05-19-rename-n8n-chat-histories-to-conversa-mensagens.sql).
-- Achado no ultrareview do PR #77. Rename metadata-only: sem impacto em dados nem
-- inserts (o default da coluna resolve a sequence por OID, nao por nome).

ALTER SEQUENCE IF EXISTS public.n8n_chat_histories_id_seq
  RENAME TO conversa_mensagens_id_seq;
