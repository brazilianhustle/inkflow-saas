// Tests pro endpoint POST /api/agent/route — request/response shape e status codes.
// NAO testa agent loop real (esse e eval suite Task 5).
import { test, mock } from 'node:test';
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

// Sub-3.2 Proposta: estados pausados/fechados retornam 501
test('route Proposta: estado pausado lead_frio retorna 501', async () => {
  const res = await onRequest(buildContext({
    tenant_id: 't1', telefone: '5511', mensagem: 'oi', estado_atual: 'lead_frio',
  }));
  assert.equal(res.status, 501);
});

test('route Proposta: estado pausado aguardando_decisao_desconto retorna 501', async () => {
  const res = await onRequest(buildContext({
    tenant_id: 't1', telefone: '5511', mensagem: 'oi', estado_atual: 'aguardando_decisao_desconto',
  }));
  assert.equal(res.status, 501);
});

test('route Proposta: estado fechado retorna 501', async () => {
  const res = await onRequest(buildContext({
    tenant_id: 't1', telefone: '5511', mensagem: 'oi', estado_atual: 'fechado',
  }));
  assert.equal(res.status, 501);
});

test('route Proposta: propondo_valor eh implementado (nao 501)', async (t) => {
  // Sem LLM real: so checa que isStateImplemented retorna true.
  // prefetchPropostaContext faz fetch (consultar-horarios) — stub minimo.
  // run() vai falhar com key fake => 500, mas NAO 501.
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ ok: true, slots: [] }),
  }));

  const res = await onRequest(buildContext({
    tenant_id: 't1', telefone: '5511', mensagem: 'fechou', estado_atual: 'propondo_valor',
    tenant: { id: 't1', nome_estudio: 'X', config_precificacao: { sinal_percentual: 30 } },
    conversa: { telefone: '5511', estado_agente: 'propondo_valor', valor_proposto: 750, dados_cadastro: { nome: 'Y' } },
  }));
  // Pode ser 500 (LLM falha sem key real) — o que importa eh NAO ser 501.
  assert.notEqual(res.status, 501);
});
