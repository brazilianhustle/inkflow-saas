// Testes da função ensureConversa (helper de upsert idempotente em conversas).
// Mocks fetch globalmente; cada test restaura no finally.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureConversa } from '../../functions/_lib/conversas-upsert.js';

const ENV = { SUPABASE_SERVICE_ROLE_KEY: 'test-key' };
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TELEFONE = '+5511999999999';
const CONVERSA_ID = '11111111-1111-1111-1111-111111111111';

test('ensureConversa: INSERT primeira vez retorna criado=true com row populada', async () => {
  const origFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, opts) => {
    captured = { url, opts };
    return new Response(JSON.stringify([{
      id: CONVERSA_ID,
      tenant_id: TENANT_ID,
      telefone: TELEFONE,
      estado_agente: 'coletando_tattoo',
      estado: 'qualificando',
      dados_coletados: {},
      dados_cadastro: {},
    }]), { status: 201 });
  };

  try {
    const result = await ensureConversa(ENV, {
      tenant_id: TENANT_ID,
      telefone: TELEFONE,
      defaultsOnInsert: { estado_agente: 'coletando_tattoo' },
    });
    assert.equal(result.ok, true);
    assert.equal(result.id, CONVERSA_ID);
    assert.equal(result.criado, true);
    assert.equal(result.row.estado_agente, 'coletando_tattoo');
    assert.match(captured.url, /\/rest\/v1\/conversas\?on_conflict=tenant_id,telefone/);
    assert.equal(captured.opts.method, 'POST');
    assert.match(captured.opts.headers.Prefer, /resolution=ignore-duplicates/);
    const body = JSON.parse(captured.opts.body);
    assert.equal(body.tenant_id, TENANT_ID);
    assert.equal(body.estado_agente, 'coletando_tattoo');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('ensureConversa: conflito retorna criado=false + row existente intacta', async () => {
  const origFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, opts) => {
    calls++;
    if (calls === 1) {
      return new Response(JSON.stringify([]), { status: 201 });
    }
    return new Response(JSON.stringify([{
      id: CONVERSA_ID,
      tenant_id: TENANT_ID,
      telefone: TELEFONE,
      estado_agente: 'aguardando_tatuador',
      dados_coletados: { descricao_tattoo: 'rosa' },
    }]), { status: 200 });
  };

  try {
    const result = await ensureConversa(ENV, {
      tenant_id: TENANT_ID,
      telefone: TELEFONE,
      defaultsOnInsert: { estado_agente: 'coletando_tattoo' },
    });
    assert.equal(result.ok, true);
    assert.equal(result.id, CONVERSA_ID);
    assert.equal(result.criado, false);
    assert.equal(result.row.estado_agente, 'aguardando_tatuador');
    assert.deepEqual(result.row.dados_coletados, { descricao_tattoo: 'rosa' });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('ensureConversa: tenant_id ausente retorna ok=false', async () => {
  const result = await ensureConversa(ENV, { telefone: TELEFONE });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'tenant_id-obrigatorio');
});

test('ensureConversa: telefone ausente retorna ok=false', async () => {
  const result = await ensureConversa(ENV, { tenant_id: TENANT_ID });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'telefone-obrigatorio');
});

test('ensureConversa: Supabase 500 no INSERT retorna insert-falhou', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('Internal error', { status: 500 });

  try {
    const result = await ensureConversa(ENV, { tenant_id: TENANT_ID, telefone: TELEFONE });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'insert-falhou');
    assert.equal(result.status, 500);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('ensureConversa: SELECT pós-conflito 500 retorna select-pos-conflito-falhou', async () => {
  const origFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Response(JSON.stringify([]), { status: 201 });
    return new Response('Server error', { status: 500 });
  };

  try {
    const result = await ensureConversa(ENV, { tenant_id: TENANT_ID, telefone: TELEFONE });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'select-pos-conflito-falhou');
    assert.equal(result.status, 500);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('ensureConversa: SELECT pós-conflito vazio retorna row-nao-encontrada', async () => {
  const origFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Response(JSON.stringify([]), { status: 201 });
    return new Response(JSON.stringify([]), { status: 200 });
  };

  try {
    const result = await ensureConversa(ENV, { tenant_id: TENANT_ID, telefone: TELEFONE });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'row-nao-encontrada-pos-conflito');
  } finally {
    globalThis.fetch = origFetch;
  }
});
