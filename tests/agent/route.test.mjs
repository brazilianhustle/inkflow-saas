// Tests pro endpoint POST /api/agent/route — request/response shape e status codes.
// NAO testa agent loop real (esse e eval suite Task 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/agent/route.js';

const ENV = {
  OPENAI_API_KEY: 'sk-test',
  INKFLOW_TOOL_SECRET: 'tool-sec',
};

function buildContext(body, method = 'POST') {
  return {
    request: new Request('https://example.com/api/agent/route', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    }),
    env: ENV,
    waitUntil: () => {},
  };
}

test('route rejeita non-POST com 405', async () => {
  const res = await onRequest(buildContext({}, 'GET'));
  assert.equal(res.status, 405);
});

test('route OPTIONS preflight retorna 204 + CORS headers', async () => {
  const res = await onRequest(buildContext({}, 'OPTIONS'));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  assert.equal(res.headers.get('access-control-allow-headers'), 'Content-Type');
});

test('route rejeita body sem tenant_id/telefone com 400', async () => {
  const res = await onRequest(buildContext({ mensagem: 'oi' }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /tenant_id|telefone/);
});

test('route retorna 501 pra estado_atual nao-implementado (Sub-3)', async () => {
  const res = await onRequest(buildContext({
    tenant_id: 't1',
    telefone: '+5511999999999',
    mensagem: 'oi',
    estado_atual: 'proposta',
    dados_acumulados: {},
    historico: [],
  }));
  assert.equal(res.status, 501);
  const body = await res.json();
  assert.match(body.error, /nao implementado|proposta/);
});

test('route retorna 503 quando OPENAI_API_KEY ausente', async () => {
  const ctx = buildContext({
    tenant_id: 't1',
    telefone: '+5511999999999',
    mensagem: 'oi',
    estado_atual: 'tattoo',
    dados_acumulados: {},
    historico: [],
  });
  ctx.env = { INKFLOW_TOOL_SECRET: 'x' }; // sem OPENAI_API_KEY
  const res = await onRequest(ctx);
  assert.equal(res.status, 503);
});
