// tests/api/cron-resumo-semanal.test.mjs
// TDD — escrito ANTES da implementação.
// Auth: Bearer CRON_SECRET (sem studio_token).
// Fetch mocking: globalThis.fetch (padrão do codebase).

import { test } from 'node:test';
import assert from 'node:assert/strict';

function mkContext({ method = 'POST', authHeader = 'Bearer cron-secret' } = {}) {
  const headers = new Map();
  if (authHeader !== null) headers.set('authorization', authHeader);
  return {
    request: {
      url: 'https://x/api/cron/resumo-semanal',
      method,
      headers: { get: (k) => headers.get(k.toLowerCase()) ?? null },
    },
    env: {
      SUPABASE_SERVICE_KEY: 'sb_test',
      CRON_SECRET: 'cron-secret',
      OPENAI_API_KEY: 'sk-test',
    },
  };
}

// Helper para stats mock de uma semana (3 fetches: conversas, orcamentos, rpc)
function statsResponses({ conversas = 0, orcamentos = 0, fechados = 0, sum_sinal = 0 } = {}) {
  return [
    new Response(JSON.stringify([{ count: conversas }]), { status: 200 }),
    new Response(JSON.stringify([{ count: orcamentos }]), { status: 200 }),
    new Response(JSON.stringify([{ fechados, sum_sinal }]), { status: 200 }),
  ];
}

// Fetch sequence por tenant (happy path):
//   3 (statsAtual) + 3 (statsAnterior) + 1 (LLM) + 1 (PATCH) = 8 fetches
function tenantResponses({ llmText = 'Resumo do estúdio.' } = {}) {
  return [
    ...statsResponses({ conversas: 10, orcamentos: 4, fechados: 2, sum_sinal: 300 }),
    ...statsResponses({ conversas: 8, orcamentos: 3, fechados: 1, sum_sinal: 200 }),
    new Response(
      JSON.stringify({ choices: [{ message: { content: llmText } }] }),
      { status: 200 }
    ),
    new Response(null, { status: 204 }),
  ];
}

// ── Test 1: sem Authorization Bearer retorna 401 ─────────────────────────────
test('cron — sem Authorization Bearer retorna 401', async () => {
  const { onRequest } = await import('../../functions/api/cron/resumo-semanal.js');
  const ctx = mkContext({ authHeader: null });
  const res = await onRequest(ctx);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.ok(body.error, 'deve ter campo error');
});

// ── Test 2: Bearer errado retorna 401 ────────────────────────────────────────
test('cron — Bearer errado retorna 401', async () => {
  const { onRequest } = await import('../../functions/api/cron/resumo-semanal.js');
  const ctx = mkContext({ authHeader: 'Bearer wrong-secret' });
  const res = await onRequest(ctx);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.ok(body.error, 'deve ter campo error');
});

// ── Test 3: método != POST retorna 405 ───────────────────────────────────────
test('cron — método != POST retorna 405', async () => {
  const { onRequest } = await import('../../functions/api/cron/resumo-semanal.js');
  const ctx = mkContext({ method: 'GET' });
  const res = await onRequest(ctx);
  assert.equal(res.status, 405);
  const body = await res.json();
  assert.ok(body.error, 'deve ter campo error');
});

// ── Test 4: happy path — 2 tenants ativos, gera 2 resumos ───────────────────
// Sequência de fetch:
//   1 (list tenants) + 2 * 8 (por tenant) = 17 fetches no total
test('cron — happy path: 2 tenants ativos, gera 2 resumos', async () => {
  const { onRequest } = await import('../../functions/api/cron/resumo-semanal.js');

  const origFetch = globalThis.fetch;
  let callIdx = 0;

  const responses = [
    // 0: list tenants ativos
    new Response(
      JSON.stringify([
        { id: 'tenant-1', nome: 'Estudio A', sinal_percentual: 30 },
        { id: 'tenant-2', nome: 'Estudio B', sinal_percentual: 25 },
      ]),
      { status: 200 }
    ),
    // 1-8: tenant-1 (3 stats atual + 3 stats anterior + 1 LLM + 1 PATCH)
    ...tenantResponses({ llmText: 'Resumo estudio A.' }),
    // 9-16: tenant-2
    ...tenantResponses({ llmText: 'Resumo estudio B.' }),
  ];

  globalThis.fetch = async () => responses[callIdx++];

  try {
    const ctx = mkContext();
    const res = await onRequest(ctx);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.processados, 2, 'deve ter 2 processados');
    assert.equal(body.falhas, 0, 'deve ter 0 falhas');
    assert.equal(body.detalhes.length, 2, 'detalhes deve ter 2 entradas');
    assert.equal(body.detalhes[0].ok, true);
    assert.equal(body.detalhes[1].ok, true);
    assert.equal(callIdx, 17, `esperado 17 fetch calls, ocorreu ${callIdx}`);
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ── Test 5: 1 tenant falha LLM, outro continua (try/catch isolado) ──────────
// Sequência:
//   1 (list) + tenant-1: 6 stats + LLM 500 + (sem PATCH) = 8
//                       + tenant-2: 6 stats + LLM 200 + PATCH 204 = 8
//   Total: 1 + 8 + 8 = 17 fetches
test('cron — 1 tenant falha LLM, outros continuam (try/catch isolado)', async () => {
  const { onRequest } = await import('../../functions/api/cron/resumo-semanal.js');

  const origFetch = globalThis.fetch;
  let callIdx = 0;

  const responses = [
    // 0: list tenants ativos
    new Response(
      JSON.stringify([
        { id: 'tenant-1', nome: 'Estudio Falha', sinal_percentual: 30 },
        { id: 'tenant-2', nome: 'Estudio OK', sinal_percentual: 25 },
      ]),
      { status: 200 }
    ),
    // 1-6: tenant-1 stats (atual 3 + anterior 3)
    ...statsResponses({ conversas: 5 }),
    ...statsResponses({ conversas: 3 }),
    // 7: tenant-1 LLM → 500 (falha)
    new Response('openai error', { status: 500 }),
    // 8-13: tenant-2 stats
    ...statsResponses({ conversas: 7 }),
    ...statsResponses({ conversas: 4 }),
    // 14: tenant-2 LLM → sucesso
    new Response(
      JSON.stringify({ choices: [{ message: { content: 'Resumo estudio OK.' } }] }),
      { status: 200 }
    ),
    // 15: tenant-2 PATCH → 204
    new Response(null, { status: 204 }),
  ];

  globalThis.fetch = async () => responses[callIdx++];

  try {
    const ctx = mkContext();
    const res = await onRequest(ctx);
    assert.equal(res.status, 200, 'status deve ser 200 mesmo com falha parcial');
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.processados, 1, 'apenas 1 processado com sucesso');
    assert.equal(body.falhas, 1, '1 falha');
    assert.equal(body.detalhes.length, 2, 'detalhes deve ter 2 entradas');
    const falha = body.detalhes.find((d) => d.tenant_id === 'tenant-1');
    const sucesso = body.detalhes.find((d) => d.tenant_id === 'tenant-2');
    assert.ok(falha, 'deve ter entry para tenant-1');
    assert.equal(falha.ok, false, 'tenant-1 deve ser marcado como falha');
    assert.ok(falha.error, 'tenant-1 deve ter campo error');
    assert.match(falha.error, /openai/i, 'error deve mencionar openai');
    assert.ok(sucesso, 'deve ter entry para tenant-2');
    assert.equal(sucesso.ok, true, 'tenant-2 deve ser marcado como sucesso');
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ── Test 6: 0 tenants ativos retorna { processados: 0 } ─────────────────────
test('cron — 0 tenants ativos retorna { processados: 0 }', async () => {
  const { onRequest } = await import('../../functions/api/cron/resumo-semanal.js');

  const origFetch = globalThis.fetch;
  let callIdx = 0;

  globalThis.fetch = async () => {
    callIdx++;
    return new Response(JSON.stringify([]), { status: 200 });
  };

  try {
    const ctx = mkContext();
    const res = await onRequest(ctx);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.processados, 0);
    assert.equal(body.falhas, 0);
    assert.deepEqual(body.detalhes, []);
    // Apenas 1 fetch: o list de tenants
    assert.equal(callIdx, 1, 'apenas 1 fetch call para listar tenants');
  } finally {
    globalThis.fetch = origFetch;
  }
});
