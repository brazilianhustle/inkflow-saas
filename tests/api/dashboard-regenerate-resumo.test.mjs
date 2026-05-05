// tests/api/dashboard-regenerate-resumo.test.mjs
// TDD — escrito ANTES da implementação.
// Auth: usa HMAC tokens reais gerados via generateStudioToken (sem fetch — 100% determinístico).
// Fetch mocking: globalThis.fetch (padrão do codebase).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const TENANT_ID = '00000000-0000-0000-0000-000000000010';
const STUDIO_TOKEN_SECRET = 'secret-at-least-32-chars-padding-xx';

// Gera token HMAC real (sem fetch) — mesmo padrão dos outros tests
async function mintStudioToken(tenantId, secret) {
  const { generateStudioToken } = await import('../../functions/api/_auth-helpers.js');
  return generateStudioToken(tenantId, secret);
}

function mockEnv(extra = {}) {
  return {
    SUPABASE_SERVICE_KEY: 'sb_test_key',
    STUDIO_TOKEN_SECRET,
    OPENAI_API_KEY: 'sk-test-openai-key',
    ...extra,
  };
}

// Helper: tenant row (sem rate-limit)
function tenantRow(overrides = {}) {
  return {
    resumo_semanal_ultima_geracao_manual: null,
    nome: 'Hustle Ink',
    sinal_percentual: 30,
    ...overrides,
  };
}

// ── Test 1: método != POST retorna 405 ───────────────────────────────────────
test('regenerate — método != POST retorna 405', async () => {
  const { onRequest } = await import('../../functions/api/dashboard/regenerate-resumo-semanal.js');
  const req = new Request(
    `https://x.com/api/dashboard/regenerate-resumo-semanal?studio_token=qualquer`,
    { method: 'GET' }
  );
  const res = await onRequest({ request: req, env: mockEnv() });
  assert.equal(res.status, 405);
  const body = await res.json();
  assert.ok(body.error, 'deve ter campo error');
});

// ── Test 2: sem studio_token retorna 401 ─────────────────────────────────────
test('regenerate — sem studio_token retorna 401', async () => {
  const { onRequest } = await import('../../functions/api/dashboard/regenerate-resumo-semanal.js');
  const req = new Request(
    'https://x.com/api/dashboard/regenerate-resumo-semanal',
    { method: 'POST' }
  );
  const res = await onRequest({ request: req, env: mockEnv() });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.match(body.error, /studio_token/i);
});

// ── Test 3: rate limit 1×/24h — ultima_geracao_manual há 2h → 429 ───────────
test('regenerate — rate limit: ultima_geracao_manual há 2h → 429', async () => {
  const { onRequest } = await import('../../functions/api/dashboard/regenerate-resumo-semanal.js');
  const token = await mintStudioToken(TENANT_ID, STUDIO_TOKEN_SECRET);
  const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();

  const origFetch = globalThis.fetch;
  let callIdx = 0;

  // Fetch sequence:
  //   0: tenant load → row com ultima_geracao_manual há 2h
  globalThis.fetch = async () => {
    const responses = [
      // tenant load
      new Response(
        JSON.stringify([tenantRow({ resumo_semanal_ultima_geracao_manual: twoHoursAgo })]),
        { status: 200 }
      ),
    ];
    return responses[callIdx++];
  };

  try {
    const req = new Request(
      `https://x.com/api/dashboard/regenerate-resumo-semanal?studio_token=${token}`,
      { method: 'POST' }
    );
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 429);
    const body = await res.json();
    assert.match(body.error, /j[áa] atualizado/i);
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ── Test 4: happy path — gera resumo + atualiza tenants ──────────────────────
test('regenerate — happy path: gera resumo + atualiza tenants', async () => {
  const { onRequest } = await import('../../functions/api/dashboard/regenerate-resumo-semanal.js');
  const token = await mintStudioToken(TENANT_ID, STUDIO_TOKEN_SECRET);

  const origFetch = globalThis.fetch;
  let callIdx = 0;

  // Fetch sequence after auth (HMAC token → sem fetch de auth):
  //   0: tenant load → null ultima_geracao_manual
  //   1-3: fetchStats(semanaAtual): conversas count, orcamentos count, RPC periodo
  //   4-6: fetchStats(semanaAnterior): conversas count, orcamentos count, RPC periodo
  //   7: OpenAI completions → texto gerado
  //   8: PATCH tenants → 204
  const responses = [
    // 0: tenant load
    new Response(
      JSON.stringify([tenantRow()]),
      { status: 200 }
    ),
    // 1: conversas semana atual (count)
    new Response(JSON.stringify([{ count: 12 }]), { status: 200 }),
    // 2: orcamentos semana atual (count)
    new Response(JSON.stringify([{ count: 5 }]), { status: 200 }),
    // 3: RPC semana atual
    new Response(JSON.stringify([{ fechados: 3, sum_sinal: 450.00 }]), { status: 200 }),
    // 4: conversas semana anterior (count)
    new Response(JSON.stringify([{ count: 8 }]), { status: 200 }),
    // 5: orcamentos semana anterior (count)
    new Response(JSON.stringify([{ count: 4 }]), { status: 200 }),
    // 6: RPC semana anterior
    new Response(JSON.stringify([{ fechados: 2, sum_sinal: 300.00 }]), { status: 200 }),
    // 7: OpenAI
    new Response(
      JSON.stringify({
        choices: [{ message: { content: 'Hustle Ink teve uma ótima semana com 12 conversas e R$ 450,00 em sinais.' } }],
      }),
      { status: 200 }
    ),
    // 8: PATCH tenants → 204
    new Response(null, { status: 204 }),
  ];

  globalThis.fetch = async () => responses[callIdx++];

  try {
    const req = new Request(
      `https://x.com/api/dashboard/regenerate-resumo-semanal?studio_token=${token}`,
      { method: 'POST' }
    );
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.resumo, 'deve ter campo resumo');
    assert.ok(body.resumo.texto, 'resumo.texto deve estar presente');
    assert.ok(body.resumo.gerado_em, 'resumo.gerado_em deve estar presente');
    // gerado_em deve ser ISO válido
    assert.ok(!isNaN(new Date(body.resumo.gerado_em).getTime()), 'gerado_em deve ser ISO válido');
    assert.equal(body.resumo.modelo, 'gpt-4o-mini');
    assert.ok(body.resumo.periodo_inicio, 'periodo_inicio deve estar presente');
    assert.ok(body.resumo.periodo_fim, 'periodo_fim deve estar presente');
    // Todos os 9 fetch calls foram consumidos
    assert.equal(callIdx, 9, `esperado 9 fetch calls, ocorreu ${callIdx}`);
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ── Test 5: OpenAI error → 502 ───────────────────────────────────────────────
test('regenerate — OpenAI error retorna 502', async () => {
  const { onRequest } = await import('../../functions/api/dashboard/regenerate-resumo-semanal.js');
  const token = await mintStudioToken(TENANT_ID, STUDIO_TOKEN_SECRET);

  const origFetch = globalThis.fetch;
  let callIdx = 0;

  const responses = [
    // 0: tenant load
    new Response(JSON.stringify([tenantRow()]), { status: 200 }),
    // 1-3: fetchStats semana atual
    new Response(JSON.stringify([{ count: 5 }]), { status: 200 }),
    new Response(JSON.stringify([{ count: 2 }]), { status: 200 }),
    new Response(JSON.stringify([{ fechados: 1, sum_sinal: 150.00 }]), { status: 200 }),
    // 4-6: fetchStats semana anterior
    new Response(JSON.stringify([{ count: 3 }]), { status: 200 }),
    new Response(JSON.stringify([{ count: 1 }]), { status: 200 }),
    new Response(JSON.stringify([{ fechados: 0, sum_sinal: 0 }]), { status: 200 }),
    // 7: OpenAI → 500
    new Response('Internal Server Error', { status: 500 }),
  ];

  globalThis.fetch = async () => responses[callIdx++] || new Response('end', { status: 500 });

  try {
    const req = new Request(
      `https://x.com/api/dashboard/regenerate-resumo-semanal?studio_token=${token}`,
      { method: 'POST' }
    );
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.ok(body.error, 'deve ter campo error');
  } finally {
    globalThis.fetch = origFetch;
  }
});
