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

// Setup mock de fetch que simula INSERT bem-sucedido + RPC merge_conversa_jsonb.
// HOTFIX 2026-05-06: tool agora usa RPC pra merge atomico em vez de PATCH.
// Mock simula a RPC retornando {merged_field, new_estado} computados a partir
// do estado inicial + patch do request.
function mockSuccessFlow(initialRow = null) {
  const baseRow = initialRow || {
    id: CONVERSA_ID,
    tenant_id: TENANT_ID,
    telefone: TELEFONE,
    estado_agente: 'coletando_tattoo',
    estado: 'qualificando',
    dados_coletados: {},
    dados_cadastro: {},
  };
  // Estado mutavel — atualizado a cada chamada de RPC pra simular persistencia.
  let currentRow = { ...baseRow };
  const rows = [baseRow];
  const calls = [];

  function simulateMergeRpc(rpcInput) {
    const { p_field_name, p_patch, p_set_estado_agente, p_auto_transition_to_cadastro } = rpcInput;
    const currentField = currentRow[p_field_name] || {};
    const merged = { ...currentField, ...p_patch };
    let newEstado = currentRow.estado_agente;
    if (p_set_estado_agente !== null && p_set_estado_agente !== undefined) {
      newEstado = p_set_estado_agente;
    } else if (p_auto_transition_to_cadastro
        && currentRow.estado_agente === 'coletando_tattoo'
        && Object.prototype.hasOwnProperty.call(merged, 'descricao_tattoo')
        && Object.prototype.hasOwnProperty.call(merged, 'tamanho_cm')
        && Object.prototype.hasOwnProperty.call(merged, 'local_corpo')) {
      newEstado = 'coletando_cadastro';
    }
    currentRow = { ...currentRow, [p_field_name]: merged, estado_agente: newEstado };
    return [{ merged_field: merged, new_estado: newEstado }];
  }

  globalThis.fetch = async (url, opts) => {
    calls.push({ url, method: opts?.method, body: opts?.body });
    // tool_calls_log (observability) — sempre 201
    if (opts?.method === 'POST' && url.includes('tool_calls_log')) {
      return new Response('', { status: 201 });
    }
    // RPC merge_conversa_jsonb (HOTFIX 2026-05-06)
    if (opts?.method === 'POST' && url.includes('/rpc/merge_conversa_jsonb')) {
      const rpcInput = JSON.parse(opts.body);
      const result = simulateMergeRpc(rpcInput);
      return new Response(JSON.stringify(result), { status: 200 });
    }
    // ensureConversa upsert (POST com on_conflict)
    if (opts?.method === 'POST' && url.includes('on_conflict')) {
      return new Response(JSON.stringify(rows), { status: 201 });
    }
    // SELECT fallback (ensureConversa quando upsert retorna [] por conflito)
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
    // HOTFIX 2026-05-06: tool usa RPC, nao PATCH inline.
    const rpcCall = calls.find(c => c.url.includes('/rpc/merge_conversa_jsonb'));
    assert.ok(rpcCall, 'RPC merge_conversa_jsonb foi chamada');
    const rpcBody = JSON.parse(rpcCall.body);
    assert.equal(rpcBody.p_field_name, 'dados_coletados');
    assert.equal(rpcBody.p_auto_transition_to_cadastro, true);
    assert.deepEqual(rpcBody.p_patch, { local_corpo: 'antebraço' });
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
