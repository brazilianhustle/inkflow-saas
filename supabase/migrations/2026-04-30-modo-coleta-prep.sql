-- ── Modo Coleta — Schema preparation (PR 1) ─────────────────────────────────
-- Adiciona colunas pra suportar modo Coleta no PR 2. Defaults garantem
-- zero breaking pros tenants existentes. As colunas são populadas só quando
-- o tenant migrar pra modo='coleta' (não aceito ainda em PR 1).

-- 1. Few-shots escopadas por modo (top-level, fora de config_precificacao
--    — separação: config = regras de preço, fewshots = conteúdo de treino)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS fewshots_por_modo JSONB
  NOT NULL DEFAULT '{"faixa":[],"exato":[],"coleta_info":[],"coleta_agendamento":[]}'::jsonb;

-- 2. Estado da máquina de conversa (Coleta-Reentrada usa transições;
--    Faixa/Exato ignoram esse campo no MVP — continua 'ativo' default)
ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS estado_agente TEXT
  NOT NULL DEFAULT 'ativo';

-- 3. Index parcial pros estados não-ativos (queries futuras tipo
--    "todas conversas em handoff" não precisam scan completo)
CREATE INDEX IF NOT EXISTS idx_conversas_estado_agente
  ON conversas(estado_agente)
  WHERE estado_agente != 'ativo';

-- NOTA: campos `modo`, `coleta_submode`, `trigger_handoff` ficam dentro
-- do JSONB tenants.config_precificacao (sem ALTER, só código). Validação
-- desses campos é feita em functions/api/update-tenant.js (Task 2).
