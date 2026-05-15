-- Migration: agent_turn_logs — telemetria turn-level dos agents customer-facing
-- Pilar 3 do programa InkFlow Agent (Phase 0 Foundation)
-- Captura prompt + output + contexto + custo + latencia por turn.
-- Fire-and-forget via ctx.waitUntil — nunca bloqueia hot path do bot.

CREATE TABLE IF NOT EXISTS public.agent_turn_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  turn_index INT NOT NULL,

  -- WHO
  agent_name TEXT NOT NULL,
  agent_version TEXT NOT NULL,
  estado_agente TEXT NOT NULL,
  model TEXT NOT NULL,

  -- INPUT
  client_input_text TEXT,
  client_input_type TEXT,
  client_input_metadata JSONB,

  -- PROMPT/CONTEXT
  prompt_hash TEXT NOT NULL,
  prompt_full TEXT,
  context_metadata JSONB,

  -- OUTPUT
  llm_output_raw TEXT,
  llm_output_parsed JSONB,
  baloes_count INT,
  tool_calls JSONB,

  -- QUALITY SIGNALS
  invariant_passed BOOLEAN,
  invariant_failure_reason TEXT,
  persona_inferred TEXT,
  cliente_respondeu BOOLEAN,
  cliente_respondeu_dentro_de_segundos INT,
  tatuador_interviu BOOLEAN,

  -- COST/PERF
  tokens_input INT,
  tokens_output INT,
  cost_usd NUMERIC(10,6),
  latency_total_ms INT,
  latency_llm_ms INT,
  latency_tools_ms INT,

  -- META
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retention_policy TEXT NOT NULL DEFAULT 'full_90d'
);

CREATE INDEX IF NOT EXISTS idx_atl_conversa     ON public.agent_turn_logs(conversa_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_atl_agent_time   ON public.agent_turn_logs(agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atl_prompt_hash  ON public.agent_turn_logs(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_atl_estado       ON public.agent_turn_logs(estado_agente);
CREATE INDEX IF NOT EXISTS idx_atl_persona      ON public.agent_turn_logs(persona_inferred) WHERE persona_inferred IS NOT NULL;

ALTER TABLE public.agent_turn_logs ENABLE ROW LEVEL SECURITY;

-- Pattern InkFlow: service_role escreve, admin lê via JWT
-- Tatuador NAO le agent_turn_logs (PII na fase full_90d)
DROP POLICY IF EXISTS atl_service_role_insert ON public.agent_turn_logs;
CREATE POLICY atl_service_role_insert ON public.agent_turn_logs
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS atl_admin_select ON public.agent_turn_logs;
CREATE POLICY atl_admin_select ON public.agent_turn_logs
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'lmf4200@gmail.com'
  );

COMMENT ON TABLE public.agent_turn_logs IS
  'Telemetria turn-level dos agents customer-facing. Phase 0 InkFlow Agent.';
COMMENT ON COLUMN public.agent_turn_logs.retention_policy IS
  'full_90d (default 0-90d) | metadata_only (91-365d) | archived (365d+)';
COMMENT ON COLUMN public.agent_turn_logs.prompt_hash IS
  'SHA-256 do prompt completo — drift detection sem custo de armazenar prompt N vezes';
