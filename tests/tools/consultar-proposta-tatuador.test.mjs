import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/tools/consultar-proposta-tatuador.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TELEFONE = '+5511999999999';
const CONVERSA_ID = '11111111-1111-1111-1111-111111111111';
const SECRET = 'test-secret';

const ENV = {
  INKFLOW_TOOL_SECRET: SECRET,
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
};

function buildContext(body, secret = SECRET) {
  return {
    request: new Request('https://example.com/api/tools/consultar-proposta-tatuador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Inkflow-Tool-Secret': secret },
      body: JSON.stringify(body),
    }),
    env: ENV,
    waitUntil: () => {},
  };
}

test('consultar-proposta: retorna estado completo da conversa', async () => {
  const origFetch = globalThis.fetch;
  const conv = {
    id: CONVERSA_ID,
    estado_agente: 'aguardando_decisao_desconto',
    valor_proposto: 800,
    valor_pedido_cliente: 600,
    orcid: 'orc_abc123',
    dados_coletados: { decisao_desconto: 'aceito', mensagem_tatuador: null },
  };
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([conv]), { status: 200 });
    }
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    const res = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE }));
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.estado_agente, 'aguardando_decisao_desconto');
    assert.equal(body.valor_proposto, 800);
    assert.equal(body.valor_pedido_cliente, 600);
    assert.equal(body.decisao_desconto, 'aceito');
    assert.equal(body.orcid, 'orc_abc123');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('consultar-proposta: tenant_id ou telefone ausentes retornam 400', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    const r1 = await onRequest(buildContext({ telefone: TELEFONE }));
    assert.equal(r1.status, 400);
    assert.equal((await r1.json()).error, 'tenant_id obrigatorio');
    const r2 = await onRequest(buildContext({ tenant_id: TENANT_ID }));
    assert.equal(r2.status, 400);
    assert.equal((await r2.json()).error, 'telefone obrigatorio');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('consultar-proposta: conversa não existe retorna 404', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    const res = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE }));
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, 'conversa-nao-encontrada');
  } finally {
    globalThis.fetch = origFetch;
  }
});
