-- ─────────────────────────────────────────────────────────────────────────
-- Hotfix do hotfix: PR #31 (rls-drift) adicionou SET search_path='' em 4
-- functions mas deixou refs nao-qualificadas. Com search_path vazio, refs
-- sem `public.` viram "relation does not exist" em runtime.
--
-- Bug descoberto durante smoke E2E PR #33 (refator coleta-tattoo
-- OBR_RECOMENDADO): toda mensagem WhatsApp dispara INSERT em
-- n8n_chat_histories -> trigger update_conversa_last_msg_at -> UPDATE
-- conversas (nao-qualificado) -> ERROR "relation conversas does not exist".
-- Bot quebrado em prod desde merge do PR #31 (~10:00 BRT 2026-05-06)
-- ate descoberta do bug (~17:39 BRT mesmo dia). Janela ~7h.
--
-- Esta migration QUALIFICA todas as refs como public.X mantendo o
-- SET search_path='' (protecao contra search_path injection preservada).
--
-- Migration ja foi APLICADA via Supabase MCP em prod durante a sessao
-- (timestamp 2026-05-06 17:42 BRT). Este arquivo formaliza no repo.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. update_conversa_last_msg_at (trigger AFTER INSERT em n8n_chat_histories)
CREATE OR REPLACE FUNCTION public.update_conversa_last_msg_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_telefone text;
BEGIN
  IF NEW.session_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_' THEN
    RETURN NEW;
  END IF;

  v_tenant_id := SPLIT_PART(NEW.session_id, '_', 1)::uuid;
  v_telefone := SUBSTRING(NEW.session_id FROM POSITION('_' IN NEW.session_id) + 1);

  UPDATE public.conversas
    SET last_msg_at = NEW.created_at
    WHERE tenant_id = v_tenant_id
      AND telefone = v_telefone
      AND (last_msg_at IS NULL OR last_msg_at < NEW.created_at);

  RETURN NEW;
END;
$function$;

-- 2. dashboard_resumo_periodo
CREATE OR REPLACE FUNCTION public.dashboard_resumo_periodo(p_tenant_id uuid, p_since timestamp with time zone, p_until timestamp with time zone)
RETURNS TABLE(fechados bigint, sum_sinal numeric)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT
    count(*) FILTER (WHERE o.status = 'fechado' AND o.pago_em >= p_since AND o.pago_em < p_until) AS fechados,
    COALESCE(sum(o.valor * t.sinal_percentual / 100.0) FILTER (WHERE o.status = 'fechado' AND o.pago_em >= p_since AND o.pago_em < p_until), 0) AS sum_sinal
  FROM public.orcamentos o
  JOIN public.tenants t ON t.id = o.tenant_id
  WHERE o.tenant_id = p_tenant_id;
$function$;

-- 3. dashboard_sinal_recebido
CREATE OR REPLACE FUNCTION public.dashboard_sinal_recebido(p_tenant_id uuid, p_since timestamp with time zone)
RETURNS TABLE(sum_sinal numeric)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT
    COALESCE(sum(o.valor * t.sinal_percentual / 100.0), 0) AS sum_sinal
  FROM public.orcamentos o
  JOIN public.tenants t ON t.id = o.tenant_id
  WHERE o.tenant_id = p_tenant_id
    AND o.status = 'fechado'
    AND o.pago_em >= p_since;
$function$;

-- 4. dashboard_taxa_conversao
CREATE OR REPLACE FUNCTION public.dashboard_taxa_conversao(p_tenant_id uuid, p_since timestamp with time zone)
RETURNS TABLE(fechados bigint, total bigint)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT
    count(*) FILTER (WHERE status = 'fechado') AS fechados,
    count(*) AS total
  FROM public.orcamentos
  WHERE tenant_id = p_tenant_id AND created_at >= p_since;
$function$;
