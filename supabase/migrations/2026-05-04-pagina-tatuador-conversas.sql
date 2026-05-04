-- ═════════════════════════════════════════════════════════════════════════
-- Migration: Página do Tatuador Refactor — PR 4 Conversas
-- Data: 2026-05-04
-- Spec: docs/superpowers/specs/2026-05-03-pagina-tatuador-refactor-design.md §"Painel 3 — Conversas"
--
-- Objetivos:
-- 1. Add `conversas.last_msg_at timestamptz` (necessário pra filtro "Conversas de hoje").
-- 2. Backfill `last_msg_at` a partir de max(n8n_chat_histories.created_at) por session_id.
-- 3. Trigger ON INSERT em `n8n_chat_histories` que UPDATE conversas.last_msg_at em real-time.
-- 4. Index pra ordenação DESC.
--
-- Idempotente (IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE). Defaults seguros.
-- ═════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Add coluna last_msg_at em conversas ──────────────────────────────
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS last_msg_at timestamptz;

-- ─── 2. Backfill: pra cada conversa, setar last_msg_at = max(n8n_chat_histories.created_at) ──
-- session_id format: '<tenant_uuid>_<telefone>'.
-- Match via concat(tenant_id::text, '_', telefone). Usa CTE pra performance.
WITH max_msg AS (
  SELECT
    SPLIT_PART(session_id, '_', 1)::uuid AS tenant_id,
    SUBSTRING(session_id FROM POSITION('_' IN session_id) + 1) AS telefone,
    MAX(created_at) AS last_at
  FROM n8n_chat_histories
  WHERE session_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_'
  GROUP BY 1, 2
)
UPDATE conversas c
SET last_msg_at = m.last_at
FROM max_msg m
WHERE c.tenant_id = m.tenant_id
  AND c.telefone = m.telefone
  AND c.last_msg_at IS NULL;

-- Pra conversas SEM mensagens em n8n_chat_histories (raras), usar created_at da própria conversa.
UPDATE conversas SET last_msg_at = created_at WHERE last_msg_at IS NULL;

-- ─── 3. Index pra ordenação DESC ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conversas_tenant_last_msg
  ON conversas(tenant_id, last_msg_at DESC);

-- ─── 4. Trigger function: atualiza last_msg_at quando msg nova chega ─────
CREATE OR REPLACE FUNCTION update_conversa_last_msg_at()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id uuid;
  v_telefone text;
BEGIN
  -- Parse session_id format '<tenant_uuid>_<telefone>'.
  IF NEW.session_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_' THEN
    RETURN NEW;
  END IF;

  v_tenant_id := SPLIT_PART(NEW.session_id, '_', 1)::uuid;
  v_telefone := SUBSTRING(NEW.session_id FROM POSITION('_' IN NEW.session_id) + 1);

  UPDATE conversas
    SET last_msg_at = NEW.created_at
    WHERE tenant_id = v_tenant_id
      AND telefone = v_telefone
      AND (last_msg_at IS NULL OR last_msg_at < NEW.created_at);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_n8n_chat_histories_update_conversa ON n8n_chat_histories;
CREATE TRIGGER trg_n8n_chat_histories_update_conversa
  AFTER INSERT ON n8n_chat_histories
  FOR EACH ROW
  EXECUTE FUNCTION update_conversa_last_msg_at();

COMMIT;

-- ─── Verificação pós-migration (rodar manualmente no Dashboard) ─────────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'conversas' AND column_name = 'last_msg_at';
-- Deve retornar 1 linha.
--
-- SELECT count(*) FROM conversas WHERE last_msg_at IS NULL;
-- Deve retornar 0.
--
-- SELECT trigger_name FROM information_schema.triggers
--   WHERE event_object_table = 'n8n_chat_histories';
-- Deve listar `trg_n8n_chat_histories_update_conversa`.
