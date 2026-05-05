import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/tools/enviar-objecao-tatuador.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TELEFONE = '+5511999999999';
const CONVERSA_ID = '11111111-1111-1111-1111-111111111111';
const SECRET = 'test-secret';
const TG_CHAT_ID = '-100123456';

const ENV = {
  INKFLOW_TOOL_SECRET: SECRET,
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  INKFLOW_TELEGRAM_BOT_TOKEN: 'fake-bot-token',
};

function buildContext(body, secret = SECRET) {
  return {
    request: new Request('https://example.com/api/tools/enviar-objecao-tatuador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Inkflow-Tool-Secret': secret },
      body: JSON.stringify(body),
    }),
    env: ENV,
    waitUntil: () => {},
  };
}

const CONVERSA_PROPONDO = {
  id: CONVERSA_ID,
  estado_agente: 'propondo_valor',
  valor_proposto: 800,
  valor_pedido_cliente: null,
  orcid: 'orc_abc123',
  dados_cadastro: { nome: 'Maria Silva' },
  tenants: { id: TENANT_ID, tatuador_telegram_chat_id: TG_CHAT_ID },
};

test('enviar-objecao: happy path envia Telegram e estado vira aguardando_decisao', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([CONVERSA_PROPONDO]), { status: 200 });
    }
    if (url.includes('telegram.org/bot')) {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }), { status: 200 });
    }
    if (opts?.method === 'PATCH') return new Response(null, { status: 204 });
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, valor_pedido_cliente: 600 });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.estado_agente, 'aguardando_decisao_desconto');
    assert.equal(body.valor_pedido_cliente, 600);
    assert.equal(body.valor_proposto, 800);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-objecao: tenant_id ou telefone ausentes retornam 400', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 200 });
  try {
    const r1 = await onRequest(buildContext({ telefone: TELEFONE, valor_pedido_cliente: 600 }));
    assert.equal((await r1.json()).error, 'tenant_id obrigatorio');
    const r2 = await onRequest(buildContext({ tenant_id: TENANT_ID, valor_pedido_cliente: 600 }));
    assert.equal((await r2.json()).error, 'telefone obrigatorio');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-objecao: conversa não existe retorna 404', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    const res = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, valor_pedido_cliente: 600 }));
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, 'conversa-nao-encontrada');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-objecao: sem valor_proposto retorna 400', async () => {
  const origFetch = globalThis.fetch;
  const semValor = { ...CONVERSA_PROPONDO, valor_proposto: null };
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([semValor]), { status: 200 });
    }
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    const res = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, valor_pedido_cliente: 600 }));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'valor_proposto-ausente');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-objecao: valor_pedido_cliente inválido retorna 400', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    const r1 = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, valor_pedido_cliente: -100 }));
    assert.equal(r1.status, 400);
    const r2 = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, valor_pedido_cliente: 0 }));
    assert.equal(r2.status, 400);
    const r3 = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, valor_pedido_cliente: 'abc' }));
    assert.equal(r3.status, 400);
  } finally {
    globalThis.fetch = origFetch;
  }
});
