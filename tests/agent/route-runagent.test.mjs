// tests/agent/route-runagent.test.mjs
// Sub-4.1: smoke tests pra runAgent({...}) — funcao pura-ish exportavel
// que pipeline.js chama sem HTTP. Garante existencia + shape de erro
// previsivel em estado nao-implementado (sem precisar mockar @openai/agents).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ENV = { OPENAI_API_KEY: 'sk-test', INKFLOW_TOOL_SECRET: 'sec' };

test('runAgent: estado nao implementado → ok:false status:501', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'oi',
    estado_atual: 'estado_inexistente', dados_acumulados: {}, historico: [],
    tenant: { id: 't' }, conversa: { id: 'c', estado_agente: 'estado_inexistente' },
    clientContext: {},
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, 501);
});

test('runAgent: existe e e AsyncFunction', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  assert.ok(typeof runAgent === 'function');
  assert.equal(runAgent.constructor.name, 'AsyncFunction');
});

test('runAgent: aceita historico vazio sem throw quando estado nao implementado', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'oi',
    estado_atual: 'unimpl', dados_acumulados: {}, historico: [],
    tenant: { id: 't' }, conversa: { id: 'c', estado_agente: 'unimpl' },
    clientContext: {},
  });
  assert.ok(r);
  assert.equal(r.ok, false);
});
