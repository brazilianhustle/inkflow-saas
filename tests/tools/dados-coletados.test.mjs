// Testes do handler completo da tool dados_coletados.
// Cobertura: input validation, upsert path, transição de estado, edge cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/tools/dados-coletados.js';

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
    request: new Request('https://example.com/api/tools/dados-coletados', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Inkflow-Tool-Secret': secret,
      },
      body: JSON.stringify(body),
    }),
    env: ENV,
    waitUntil: () => {},
  };
}

// Setup mock de fetch que simula INSERT bem-sucedido + PATCH
function mockSuccessFlow(initialRow = null) {
  const rows = initialRow ? [initialRow] : [{
    id: CONVERSA_ID,
    tenant_id: TENANT_ID,
    telefone: TELEFONE,
    estado_agente: 'coletando_tattoo',
    estado: 'qualificando',
    dados_coletados: {},
    dados_cadastro: {},
  }];
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, method: opts?.method, body: opts?.body });
    if (opts?.method === 'POST' && url.includes('on_conflict')) {
      return new Response(JSON.stringify(rows), { status: 201 });
    }
    if (opts?.method === 'PATCH') {
      return new Response(null, { status: 204 });
    }
    if (opts?.method === 'POST' && url.includes('tool_calls_log')) {
      return new Response('', { status: 201 });
    }
    return new Response(JSON.stringify(rows), { status: 200 });
  };
  return calls;
}

test('dados_coletados: conversa nova com campo tattoo cria row + persiste campo', async () => {
  const origFetch = globalThis.fetch;
  const calls = mockSuccessFlow();
  try {
    const ctx = buildContext({
      tenant_id: TENANT_ID,
      telefone: TELEFONE,
      campo: 'descricao_tattoo',
      valor: 'rosa',
    });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.campo, 'descricao_tattoo');
    assert.equal(body.valor, 'rosa');
    assert.equal(body.conversa_id, CONVERSA_ID);
    const upsertCall = calls.find(c => c.url.includes('on_conflict'));
    assert.ok(upsertCall, 'upsert foi chamado');
    const upsertBody = JSON.parse(upsertCall.body);
    assert.equal(upsertBody.tenant_id, TENANT_ID);
    assert.equal(upsertBody.estado_agente, 'coletando_tattoo');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: tenant_id ausente retorna 400', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 200 });
  try {
    const ctx = buildContext({ telefone: TELEFONE, campo: 'descricao_tattoo', valor: 'x' });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, 'tenant_id obrigatorio');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: telefone ausente retorna 400', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 200 });
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, campo: 'descricao_tattoo', valor: 'x' });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, 'telefone obrigatorio');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: campo inválido retorna 400 sem chamar upsert', async () => {
  const origFetch = globalThis.fetch;
  let upsertChamado = false;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('on_conflict')) upsertChamado = true;
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response(JSON.stringify([]), { status: 200 });
  };
  try {
    const ctx = buildContext({
      tenant_id: TENANT_ID,
      telefone: TELEFONE,
      campo: 'campo_inexistente',
      valor: 'x',
    });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.match(body.error, /campo invalido/);
    assert.equal(upsertChamado, false, 'upsert NÃO deve ter sido chamado');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: 3 OBR completos transiciona estado pra coletando_cadastro', async () => {
  const origFetch = globalThis.fetch;
  const calls = mockSuccessFlow({
    id: CONVERSA_ID,
    tenant_id: TENANT_ID,
    telefone: TELEFONE,
    estado_agente: 'coletando_tattoo',
    dados_coletados: { descricao_tattoo: 'rosa', tamanho_cm: 10 },
    dados_cadastro: {},
  });
  try {
    const ctx = buildContext({
      tenant_id: TENANT_ID,
      telefone: TELEFONE,
      campo: 'local_corpo',
      valor: 'antebraço',
    });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.proxima_fase, 'cadastro');
    assert.equal(body.estado_agente, 'coletando_cadastro');
    const patchCall = calls.find(c => c.method === 'PATCH');
    assert.ok(patchCall);
    const patchBody = JSON.parse(patchCall.body);
    assert.equal(patchBody.estado_agente, 'coletando_cadastro');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: data_nascimento idade<18 retorna gatilho menor_idade', async () => {
  const origFetch = globalThis.fetch;
  mockSuccessFlow({
    id: CONVERSA_ID, tenant_id: TENANT_ID, telefone: TELEFONE,
    estado_agente: 'coletando_cadastro',
    dados_coletados: {}, dados_cadastro: {},
  });
  try {
    const ctx = buildContext({
      tenant_id: TENANT_ID, telefone: TELEFONE,
      campo: 'data_nascimento', valor: '01/01/2015',
    });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.gatilho, 'menor_idade');
    assert.equal(body.estado_agente, 'aguardando_tatuador');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: data_nascimento formato inválido retorna gatilho data_invalida', async () => {
  const origFetch = globalThis.fetch;
  mockSuccessFlow();
  try {
    const ctx = buildContext({
      tenant_id: TENANT_ID, telefone: TELEFONE,
      campo: 'data_nascimento', valor: 'amanha',
    });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, false);
    assert.equal(body.gatilho, 'data_invalida');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: ensureConversa falha → tool retorna 500', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('Server error', { status: 500 });
  };
  try {
    const ctx = buildContext({
      tenant_id: TENANT_ID, telefone: TELEFONE,
      campo: 'descricao_tattoo', valor: 'rosa',
    });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 500);
    assert.equal(body.error, 'upsert-falhou');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: auth falha retorna 401', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 200 });
  try {
    const ctx = buildContext({
      tenant_id: TENANT_ID, telefone: TELEFONE,
      campo: 'descricao_tattoo', valor: 'rosa',
    }, 'wrong-secret');
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.error, 'bad-secret');
  } finally {
    globalThis.fetch = origFetch;
  }
});
