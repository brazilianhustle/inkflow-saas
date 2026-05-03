-- ── Modo Coleta v2 — Modo principal ─────────────────────────────────────────
-- Adiciona colunas pra Telegram tatuador, cadastro do cliente, valor proposto
-- e identificador curto do orçamento. Migra default modo de 'faixa' pra
-- 'coleta'. Faixa será rejeitado pelo validador em update-tenant.js após esta
-- migration rodar.
--
-- Pré-requisito: zero tenants pagantes em produção (confirmado 2026-05-02).
-- Por isso é seguro mudar default e migrar tudo que ainda tinha 'faixa'.

BEGIN;

-- 1. Canal Telegram do tatuador (1 tatuador por tenant na v1)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tatuador_telegram_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS tatuador_telegram_username TEXT;

-- Index pra lookup reverso (callback Telegram → tenant)
CREATE INDEX IF NOT EXISTS idx_tenants_telegram_chat_id
  ON tenants(tatuador_telegram_chat_id)
  WHERE tatuador_telegram_chat_id IS NOT NULL;

-- 2. Estado de orçamento na conversa (Coleta v2 fluxo)
ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS valor_proposto NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS valor_pedido_cliente NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS orcid TEXT,
  ADD COLUMN IF NOT EXISTS dados_cadastro JSONB NOT NULL DEFAULT '{}'::jsonb;

-- orcid é único globalmente pra lookup direto via callback Telegram
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversas_orcid_unique'
  ) THEN
    ALTER TABLE conversas ADD CONSTRAINT conversas_orcid_unique UNIQUE (orcid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversas_orcid
  ON conversas(orcid)
  WHERE orcid IS NOT NULL;

-- 3. fewshots_por_modo: trocar chaves antigas (faixa, coleta_info,
--    coleta_agendamento) pelas chaves v2 (coleta_tattoo, coleta_cadastro,
--    coleta_proposta). Exato mantido. Valores antigos descartados (zero
--    tenants pagantes — sem perda real).
UPDATE tenants
SET fewshots_por_modo = jsonb_build_object(
  'coleta_tattoo',     COALESCE(fewshots_por_modo->'coleta_tattoo', '[]'::jsonb),
  'coleta_cadastro',   COALESCE(fewshots_por_modo->'coleta_cadastro', '[]'::jsonb),
  'coleta_proposta',   COALESCE(fewshots_por_modo->'coleta_proposta', '[]'::jsonb),
  'exato',             COALESCE(fewshots_por_modo->'exato', '[]'::jsonb)
)
WHERE fewshots_por_modo IS NOT NULL;

-- Atualiza default da coluna pra refletir v2
ALTER TABLE tenants
  ALTER COLUMN fewshots_por_modo
  SET DEFAULT '{"coleta_tattoo":[],"coleta_cadastro":[],"coleta_proposta":[],"exato":[]}'::jsonb;

-- 4. Migrar tenants em modo='faixa' (ou null) pra 'coleta'
UPDATE tenants
SET config_precificacao = jsonb_set(
  COALESCE(config_precificacao, '{}'::jsonb),
  '{modo}',
  '"coleta"'::jsonb,
  true
)
WHERE config_precificacao->>'modo' = 'faixa'
   OR config_precificacao->>'modo' IS NULL;

-- 5. Limpar campos legacy de Faixa em config_precificacao (se algum tenant
--    teve algum dia)
UPDATE tenants
SET config_precificacao = config_precificacao
  - 'tabela_faixas'
  - 'multiplicadores_faixa'
  - 'coleta_submode'         -- v1 tinha puro/reentrada; v2 só reentrada
  - 'trigger_handoff'        -- v1 trigger por texto; v2 callback Telegram
WHERE config_precificacao IS NOT NULL;

COMMIT;

-- Verificações pós-migration (rodar manualmente no SQL Editor):
--
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name='tenants' AND column_name LIKE 'tatuador_telegram%';
--   -- esperado: 2 rows (chat_id text, username text)
--
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name='conversas'
--     AND column_name IN ('valor_proposto','valor_pedido_cliente','orcid','dados_cadastro');
--   -- esperado: 4 rows
--
--   SELECT DISTINCT config_precificacao->>'modo' FROM tenants;
--   -- esperado: 'coleta' e/ou 'exato' (sem 'faixa', sem null)
--
--   SELECT jsonb_object_keys(fewshots_por_modo) FROM tenants LIMIT 1;
--   -- esperado: coleta_tattoo, coleta_cadastro, coleta_proposta, exato
