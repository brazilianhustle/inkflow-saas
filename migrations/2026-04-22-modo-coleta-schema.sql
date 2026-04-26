-- Migration: 2026-04-22 Modo Coleta — schema changes
-- Adiciona colunas novas em tenants e conversas pra suportar modo Coleta.
-- Zero breaking change: colunas têm defaults, código antigo continua funcionando.

-- 1. tenants.fewshots_por_modo — few-shots escopadas por modo
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS fewshots_por_modo JSONB
  NOT NULL DEFAULT '{"faixa":[],"exato":[],"coleta_info":[],"coleta_agendamento":[]}'::jsonb;

-- 2. conversas.estado_agente — máquina de estados do agente
--    (Faixa/Exato ignoram hoje; Coleta usa no PR 2)
ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS estado_agente TEXT
  NOT NULL DEFAULT 'ativo';

-- 3. Índice parcial em estados não-ativos (queries filtram por "conversas pendentes")
CREATE INDEX IF NOT EXISTS idx_conversas_estado_agente
  ON conversas(estado_agente)
  WHERE estado_agente != 'ativo';

-- NOTA: Backfill de tenants.fewshots (se existir essa coluna legada) fica pra decidir
-- manualmente com o user. Tabelas de produção não têm a coluna atualmente — este
-- bloco é só documentação:
--
-- UPDATE tenants SET fewshots_por_modo = jsonb_set(
--   fewshots_por_modo,
--   ARRAY[config_precificacao->>'modo'],
--   COALESCE(fewshots, '[]'::jsonb)
-- ) WHERE fewshots IS NOT NULL;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS fewshots;
