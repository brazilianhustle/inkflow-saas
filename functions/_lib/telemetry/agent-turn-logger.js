// agent-turn-logger.js — Pilar 3 InkFlow Agent.
// Fire-and-forget: insere em agent_turn_logs via Supabase REST,
// nao bloqueia hot path do bot. Erros loggados como warn.
//
// Single source of truth: chamado de functions/api/agent/route.js apos
// runAgent retornar. Cobre TODOS os agents (tattoo/cadastro/proposta/portfolio)
// pq todos passam por route.js.

import crypto from 'node:crypto';

const DEFAULT_SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

export function buildTurnLogPayload({
  conversa_id,
  tenant_id,
  turn_index,
  agent_name,
  agent_version,
  estado_agente,
  model,
  client_input_text = null,
  client_input_type = 'text',
  client_input_metadata = null,
  prompt_full,
  context_metadata = null,
  llm_output_raw = null,
  llm_output_parsed = null,
  tool_calls = null,
  invariant_passed = null,
  invariant_failure_reason = null,
  persona_inferred = null,
  tokens_input = null,
  tokens_output = null,
  cost_usd = null,
  latency_total_ms = null,
  latency_llm_ms = null,
  latency_tools_ms = null,
}) {
  const prompt_hash = crypto.createHash('sha256').update(String(prompt_full || '')).digest('hex');
  const resposta = llm_output_parsed?.resposta_cliente || '';
  const baloes_count = resposta ? resposta.split(/\n\n+/).filter(s => s.trim().length).length : 0;

  return {
    conversa_id,
    tenant_id,
    turn_index,
    agent_name,
    agent_version,
    estado_agente,
    model,
    client_input_text,
    client_input_type,
    client_input_metadata,
    prompt_hash,
    prompt_full,
    context_metadata,
    llm_output_raw,
    llm_output_parsed,
    baloes_count,
    tool_calls,
    invariant_passed,
    invariant_failure_reason,
    persona_inferred,
    tokens_input,
    tokens_output,
    cost_usd,
    latency_total_ms,
    latency_llm_ms,
    latency_tools_ms,
    retention_policy: 'full_90d',
  };
}

export function logAgentTurn(ctx, env, fields) {
  const url = env?.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SERVICE_KEY;
  if (!url || !key) return;

  if (!ctx || typeof ctx.waitUntil !== 'function') {
    _doInsert(env, fields).catch(e => console.warn('[telemetry] insert failed:', e.message));
    return;
  }

  ctx.waitUntil(
    _doInsert(env, fields).catch(e => {
      console.warn('[telemetry] insert failed:', e?.message || e);
    })
  );
}

async function _doInsert(env, fields) {
  const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  const payload = buildTurnLogPayload(fields);
  const url = `${supabaseUrl}/rest/v1/agent_turn_logs`;
  const doFetch = env._fetch || fetch;
  const res = await doFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = typeof res.text === 'function' ? await res.text() : '';
    throw new Error(`insert ${res.status}: ${String(txt).slice(0, 200)}`);
  }
}
