-- supabase/migrations/2026-05-05-pr2-dashboard-rpc.sql
-- PR 2 Dashboard: 2 funções RPC Postgres para KPIs agregados.
--
-- dashboard_taxa_conversao: conta fechados vs total na view orcamentos (últimos N dias)
-- dashboard_sinal_recebido: soma sinal pago (valor * sinal_percentual / 100) na semana
--
-- Aplicar via Supabase MCP apply_migration (name: 2026_05_05_pr2_dashboard_rpc)
-- NÃO inclui BEGIN/COMMIT — MCP envolve em transação automaticamente.

CREATE OR REPLACE FUNCTION dashboard_taxa_conversao(p_tenant_id UUID, p_since TIMESTAMPTZ)
RETURNS TABLE(fechados BIGINT, total BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    count(*) FILTER (WHERE status = 'fechado') AS fechados,
    count(*) AS total
  FROM orcamentos
  WHERE tenant_id = p_tenant_id AND created_at >= p_since;
$$;

CREATE OR REPLACE FUNCTION dashboard_sinal_recebido(p_tenant_id UUID, p_since TIMESTAMPTZ)
RETURNS TABLE(sum_sinal NUMERIC)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(sum(o.valor * t.sinal_percentual / 100.0), 0) AS sum_sinal
  FROM orcamentos o
  JOIN tenants t ON t.id = o.tenant_id
  WHERE o.tenant_id = p_tenant_id
    AND o.status = 'fechado'
    AND o.pago_em >= p_since;
$$;
