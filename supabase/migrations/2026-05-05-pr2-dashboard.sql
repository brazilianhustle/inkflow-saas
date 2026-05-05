-- ── PR 2 Dashboard — Schema preparation ─────────────────────────────────────
-- Adiciona colunas pra resumo semanal IA (cron seg 9h BRT + botão regenerate
-- com rate-limit 1×/24h).
--
-- - resumo_semanal_atual: JSONB { texto, gerado_em, periodo_inicio, periodo_fim, modelo }
-- - resumo_semanal_ultima_geracao_manual: TIMESTAMPTZ pra rate-limit do botão
--
-- Index parcial idx_tenants_ativo_resumo acelera scan do cron worker quando
-- houver muitos tenants (hoje 1, futuro 100+).

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS resumo_semanal_atual JSONB,
  ADD COLUMN IF NOT EXISTS resumo_semanal_ultima_geracao_manual TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tenants_ativo_resumo
  ON tenants(ativo)
  WHERE ativo = true;

-- Verificacoes pos-migration:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name='tenants' AND column_name LIKE 'resumo_semanal%';
--   -- esperado: 2 rows (jsonb + timestamptz)
