import { test } from 'node:test';
import assert from 'node:assert/strict';

const SUPABASE_URL = 'https://example.supabase.co';
const SUPABASE_KEY = 'test-service-key';
const CONVERSA_ID = '00000000-0000-0000-0000-000000000001';

test('markConversaFechada — motivo sinal_pago: grava estado_agente=fechado + dados_coletados merged', async () => {
  const { markConversaFechada } = await import('../../functions/_lib/conversas-lifecycle.js');

  const origFetch = globalThis.fetch;
  let getUrl = null, patchUrl = null, patchBody = null;
  globalThis.fetch = async (url, opts) => {
    if (opts?.method === 'PATCH') {
      patchUrl = url;
      patchBody = JSON.parse(opts.body);
      return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'fechado' }]), { status: 200 });
    }
    getUrl = url;
    return new Response(JSON.stringify([
      { dados_coletados: { nome: 'Ana', tattoo: 'leão' }, estado_agente: 'aguardando_sinal' }
    ]), { status: 200 });
  };

  try {
    const result = await markConversaFechada({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
      conversa_id: CONVERSA_ID,
      motivo: 'sinal_pago',
    });

    assert.deepEqual(result, { fechada: true, ja_estava_fechada: false });
    assert.match(getUrl, /id=eq\.00000000/);
    assert.match(patchUrl, /id=eq\.00000000/);
    assert.match(patchUrl, /estado_agente=neq\.fechado/);
    assert.equal(patchBody.estado_agente, 'fechado');
    assert.equal(patchBody.dados_coletados.fechado_motivo, 'sinal_pago');
    assert.match(patchBody.dados_coletados.fechado_em, /^\d{4}-\d{2}-\d{2}T/);
    // Preserva keys existentes
    assert.equal(patchBody.dados_coletados.nome, 'Ana');
    assert.equal(patchBody.dados_coletados.tattoo, 'leão');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('markConversaFechada — motivo hold_expirado: grava motivo correto', async () => {
  const { markConversaFechada } = await import('../../functions/_lib/conversas-lifecycle.js');

  const origFetch = globalThis.fetch;
  let patchBody = null;
  globalThis.fetch = async (url, opts) => {
    if (opts?.method === 'PATCH') {
      patchBody = JSON.parse(opts.body);
      return new Response(JSON.stringify([{ id: CONVERSA_ID }]), { status: 200 });
    }
    return new Response(JSON.stringify([{ dados_coletados: {}, estado_agente: 'aguardando_sinal' }]), { status: 200 });
  };

  try {
    const result = await markConversaFechada({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
      conversa_id: CONVERSA_ID,
      motivo: 'hold_expirado',
    });

    assert.equal(result.fechada, true);
    assert.equal(patchBody.dados_coletados.fechado_motivo, 'hold_expirado');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('markConversaFechada — idempotente: 2ª chamada na mesma conversa retorna ja_estava_fechada=true', async () => {
  const { markConversaFechada } = await import('../../functions/_lib/conversas-lifecycle.js');

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (opts?.method === 'PATCH') {
      // Simula: row já está fechada, filtro estado_agente=neq.fechado retorna 0 rows
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify([{ dados_coletados: {}, estado_agente: 'fechado' }]), { status: 200 });
  };

  try {
    const result = await markConversaFechada({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
      conversa_id: CONVERSA_ID,
      motivo: 'sinal_pago',
    });

    // Helper detecta estado_agente='fechado' no GET inicial e retorna sem PATCH
    assert.deepEqual(result, { fechada: false, ja_estava_fechada: true });
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('markConversaFechada — motivo inválido lança Error com lista de válidos', async () => {
  const { markConversaFechada, MOTIVOS_FECHAR_VALIDOS } = await import('../../functions/_lib/conversas-lifecycle.js');

  await assert.rejects(
    () => markConversaFechada({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
      conversa_id: CONVERSA_ID,
      motivo: 'foo_invalido',
    }),
    /motivo inválido.*foo_invalido/
  );

  assert.deepEqual(MOTIVOS_FECHAR_VALIDOS, ['sinal_pago', 'hold_expirado', 'tatuador_descartou']);
});

test('markConversaFechada — race window: GET retorna aguardando_sinal, PATCH retorna [] → ja_estava_fechada=true', async () => {
  const { markConversaFechada } = await import('../../functions/_lib/conversas-lifecycle.js');

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (opts?.method === 'PATCH') {
      // Simula: outro processo fechou a conversa entre nosso GET e PATCH.
      // Filtro estado_agente=neq.fechado exclui a row, retorna [] (zero rows updated).
      return new Response(JSON.stringify([]), { status: 200 });
    }
    // GET vê estado ainda como aguardando_sinal (pré-race)
    return new Response(JSON.stringify([
      { dados_coletados: {}, estado_agente: 'aguardando_sinal' }
    ]), { status: 200 });
  };

  try {
    const result = await markConversaFechada({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
      conversa_id: CONVERSA_ID,
      motivo: 'sinal_pago',
    });

    // Mesmo retorno do short-circuit GET (semântica consistente)
    assert.deepEqual(result, { fechada: false, ja_estava_fechada: true });
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('markConversaFechada — conversa inexistente lança Error informativo', async () => {
  const { markConversaFechada } = await import('../../functions/_lib/conversas-lifecycle.js');

  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([]), { status: 200 });

  try {
    await assert.rejects(
      () => markConversaFechada({
        supabaseUrl: SUPABASE_URL,
        supabaseKey: SUPABASE_KEY,
        conversa_id: CONVERSA_ID,
        motivo: 'sinal_pago',
      }),
      /não encontrada/
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});
