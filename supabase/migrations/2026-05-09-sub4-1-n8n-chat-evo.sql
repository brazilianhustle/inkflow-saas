-- Sub-4.1: Habilita endpoint /api/whatsapp/inbound com persist-first +
-- idempotencia via Evolution message.id + observability via status.
-- Tabela alvo: n8n_chat_histories (canon de historico hoje, lida por
-- functions/api/conversas/{list,thread}.js).
BEGIN;

-- 1. Coluna evo_message_id (nullable - linhas legacy do n8n nao tem).
ALTER TABLE n8n_chat_histories
  ADD COLUMN IF NOT EXISTS evo_message_id TEXT;

-- 2. Status enum-as-text com CHECK.
ALTER TABLE n8n_chat_histories
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'processed';

ALTER TABLE n8n_chat_histories
  DROP CONSTRAINT IF EXISTS n8n_chat_histories_status_check;
ALTER TABLE n8n_chat_histories
  ADD CONSTRAINT n8n_chat_histories_status_check
  CHECK (status IN ('received', 'processed', 'failed'));

-- 3. UNIQUE partial: previne INSERT duplo por retry Evolution.
--    Partial WHERE evo_message_id IS NOT NULL - nao bloqueia linhas legacy.
CREATE UNIQUE INDEX IF NOT EXISTS n8n_chat_histories_session_evo_msg_idx
  ON n8n_chat_histories (session_id, evo_message_id)
  WHERE evo_message_id IS NOT NULL;

COMMIT;
