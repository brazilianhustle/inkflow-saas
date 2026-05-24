import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildTurnLogPayload, logAgentTurn } from '../../functions/_lib/telemetry/agent-turn-logger.js';
import crypto from 'node:crypto';

function mockCtx() {
  const waited = [];
  return {
    waited,
    waitUntil(promise) { waited.push(promise); },
  };
}

function mockEnv({ failInsert = false } = {}) {
  const inserted = [];
  return {
    inserted,
    SUPABASE_URL: 'https://stub.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'stub-key',
    _fetch: async (url, opts) => {
      if (failInsert) return { ok: false, status: 500, text: async () => 'db down' };
      inserted.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
      return { ok: true, status: 201, text: async () => '' };
    },
  };
}

test('buildTurnLogPayload monta payload completo a partir de runAgent input/output', () => {
  const payload = buildTurnLogPayload({
    conversa_id: 'c1',
    tenant_id: 't1',
    turn_index: 3,
    agent_name: 'tattoo',
    agent_version: '2026.05.13',
    estado_agente: 'coletando_tattoo',
    model: 'gpt-4o-mini',
    client_input_text: 'queria uma rosa',
    client_input_type: 'text',
    prompt_full: 'system prompt completo aqui',
    llm_output_raw: '{"resposta_cliente":"fechou"}',
    llm_output_parsed: { resposta_cliente: 'fechou', proxima_acao: 'pergunta' },
    invariant_passed: true,
    tokens_input: 1500,
    tokens_output: 80,
    cost_usd: 0.0042,
    latency_total_ms: 2300,
    latency_llm_ms: 2100,
  });

  assert.equal(payload.conversa_id, 'c1');
  assert.equal(payload.agent_name, 'tattoo');
  assert.equal(payload.turn_index, 3);
  assert.equal(payload.prompt_hash, crypto.createHash('sha256').update('system prompt completo aqui').digest('hex'));
  assert.equal(payload.baloes_count, 1);
  assert.equal(payload.retention_policy, 'full_90d');
});

test('buildTurnLogPayload conta baloes corretamente a partir de \\n\\n', () => {
  const p = buildTurnLogPayload({
    conversa_id: 'c1', tenant_id: 't1', turn_index: 1,
    agent_name: 'tattoo', agent_version: 'v1', estado_agente: 's', model: 'm',
    prompt_full: 'p',
    llm_output_parsed: { resposta_cliente: 'oi\n\ntudo bem?\n\nmanda fotinha' },
  });
  assert.equal(p.baloes_count, 3);
});

test('logAgentTurn insere via fetch + nao bloqueia (fire-and-forget)', async () => {
  const ctx = mockCtx();
  const env = mockEnv();
  const ret = logAgentTurn(ctx, env, {
    conversa_id: 'c1', tenant_id: 't1', turn_index: 1,
    agent_name: 'tattoo', agent_version: 'v1', estado_agente: 's', model: 'm',
    prompt_full: 'p',
  });

  assert.equal(ret, undefined);
  assert.equal(ctx.waited.length, 1);

  await ctx.waited[0];
  assert.equal(env.inserted.length, 1);
  assert.equal(env.inserted[0].body.conversa_id, 'c1');
});

test('logAgentTurn aceita SUPABASE_SERVICE_KEY quando SERVICE_ROLE_KEY nao existe', async () => {
  const ctx = mockCtx();
  const env = mockEnv();
  env.SUPABASE_SERVICE_KEY = 'fallback-key';
  delete env.SUPABASE_SERVICE_ROLE_KEY;

  logAgentTurn(ctx, env, {
    conversa_id: 'c1', tenant_id: 't1', turn_index: 1,
    agent_name: 'conversation_router', agent_version: 'v1', estado_agente: 'tattoo', model: 'rules',
    prompt_full: null,
  });

  assert.equal(ctx.waited.length, 1);
  await ctx.waited[0];
  assert.equal(env.inserted.length, 1);
  assert.equal(env.inserted[0].headers.apikey, 'fallback-key');
  assert.equal(env.inserted[0].headers.Authorization, 'Bearer fallback-key');
  assert.equal(env.inserted[0].body.agent_name, 'conversation_router');
});

test('logAgentTurn nao throw quando insert falha (resiliente)', async () => {
  const ctx = mockCtx();
  const env = mockEnv({ failInsert: true });

  logAgentTurn(ctx, env, {
    conversa_id: 'c1', tenant_id: 't1', turn_index: 1,
    agent_name: 'tattoo', agent_version: 'v1', estado_agente: 's', model: 'm',
    prompt_full: 'p',
  });

  await assert.doesNotReject(ctx.waited[0]);
});

test('logAgentTurn no-op se env vars ausentes', () => {
  const ctx = mockCtx();
  const env = { _fetch: async () => { throw new Error('should not be called'); } };

  logAgentTurn(ctx, env, { conversa_id: 'c1', tenant_id: 't1' });
  assert.equal(ctx.waited.length, 0);
});
