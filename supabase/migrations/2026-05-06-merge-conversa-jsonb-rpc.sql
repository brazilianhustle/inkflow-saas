-- ─── 2026-05-06 — RPC `merge_conversa_jsonb` ───────────────────────────────
-- Hotfix race condition em `dados-coletados.js`. Tool fazia read-modify-write
-- inseguro: lia `dados_cadastro`/`dados_coletados`, fazia spread + override
-- em JS, e PATCHa o objeto inteiro. Quando LLM disparava N chamadas paralelas
-- no mesmo turn (ex: cliente manda "Maria Silva, 12/03/1995, email" tudo
-- junto = 3 calls), última PATCH sobrescrevia campos persistidos pelas
-- anteriores.
--
-- Esta RPC faz merge ATÔMICO via operador `||` do Postgres dentro de UPDATE
-- single-statement. Postgres garante row lock implícita — N chamadas paralelas
-- ao MESMO row sequenciam corretamente, cada uma vendo o estado pós-merge da
-- anterior.
--
-- Bonus: também cobre auto-transição estado_agente=coletando_tattoo →
-- coletando_cadastro quando 3 OBR ficam completos (idempotente, atômico).

CREATE OR REPLACE FUNCTION public.merge_conversa_jsonb(
  p_conversa_id uuid,
  p_field_name text,                         -- 'dados_coletados' OR 'dados_cadastro'
  p_patch jsonb,                             -- {"campo": valor, ...}
  p_set_estado_agente text DEFAULT NULL,     -- forca novo estado (ex: menor_idade)
  p_auto_transition_to_cadastro boolean DEFAULT false  -- transiciona se 3 OBR completos
)
RETURNS TABLE(merged_field jsonb, new_estado text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Whitelist field name pra prevenir SQL injection via dynamic SQL
  IF p_field_name NOT IN ('dados_coletados', 'dados_cadastro') THEN
    RAISE EXCEPTION 'invalid field_name: %', p_field_name;
  END IF;

  IF p_field_name = 'dados_coletados' THEN
    RETURN QUERY
    UPDATE conversas c
    SET
      dados_coletados = COALESCE(c.dados_coletados, '{}'::jsonb) || p_patch,
      estado_agente = CASE
        WHEN p_set_estado_agente IS NOT NULL
          THEN p_set_estado_agente
        WHEN p_auto_transition_to_cadastro
          AND c.estado_agente = 'coletando_tattoo'
          AND (COALESCE(c.dados_coletados, '{}'::jsonb) || p_patch) ? 'descricao_tattoo'
          AND (COALESCE(c.dados_coletados, '{}'::jsonb) || p_patch) ? 'tamanho_cm'
          AND (COALESCE(c.dados_coletados, '{}'::jsonb) || p_patch) ? 'local_corpo'
          THEN 'coletando_cadastro'
        ELSE c.estado_agente
      END,
      updated_at = NOW()
    WHERE c.id = p_conversa_id
    RETURNING c.dados_coletados, c.estado_agente;
  ELSE
    RETURN QUERY
    UPDATE conversas c
    SET
      dados_cadastro = COALESCE(c.dados_cadastro, '{}'::jsonb) || p_patch,
      estado_agente = COALESCE(p_set_estado_agente, c.estado_agente),
      updated_at = NOW()
    WHERE c.id = p_conversa_id
    RETURNING c.dados_cadastro, c.estado_agente;
  END IF;
END;
$$;

-- Grant pra service_role (CF Pages Functions usam SUPABASE_SERVICE_KEY)
-- e anon (defesa em profundidade — RLS continua restringindo conversas)
GRANT EXECUTE ON FUNCTION public.merge_conversa_jsonb(uuid, text, jsonb, text, boolean) TO authenticated, anon, service_role;
