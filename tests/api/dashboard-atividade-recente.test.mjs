// tests/api/dashboard-atividade-recente.test.mjs
// TDD — escrito ANTES da implementação.
// Auth: usa HMAC tokens reais gerados no setup (sem fetch na auth — 100% determinístico).
// Fetch mocking: globalThis.fetch (padrão do codebase).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const TENANT_ID = '00000000-0000-0000-0000-000000000010';
const STUDIO_TOKEN_SECRET = 'secret-at-least-32-chars-padding-xx';

// Gera token HMAC real (sem fetch) — mesmo padrão de dashboard-kpis.test.mjs
async function makeStudioToken(tenantId, secret) {
  const { generateStudioToken } = await import('../../functions/api/_auth-helpers.js');
  return generateStudioToken(tenantId, secret);
}

function mockEnv(extra = {}) {
  return {
    SUPABASE_SERVICE_KEY: 'sb_test_key',
    STUDIO_TOKEN_SECRET,
    ...extra,
  };
}

// ── Test 1: missing token → 401 ───────────────────────────────────────────────
test('atividade-recente — sem studio_token retorna 401', async () => {
  const { onRequest } = await import('../../functions/api/dashboard/atividade-recente.js');
  const req = new Request('https://x.com/api/dashboard/atividade-recente', { method: 'GET' });
  const res = await onRequest({ request: req, env: mockEnv() });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.match(body.error, /studio_token/i);
});

// ── Test 2: happy path — 3 atividades com nome extraction ────────────────────
test('atividade-recente — happy path retorna 3 atividades', async () => {
  const { onRequest } = await import('../../functions/api/dashboard/atividade-recente.js');
  const token = await makeStudioToken(TENANT_ID, STUDIO_TOKEN_SECRET);

  const conversas = [
    {
      id: 'uuid-1',
      telefone: '5521988888888',
      dados_cadastro: { nome: 'Maria' },
      estado_agente: 'propondo_valor',
      last_msg_at: '2026-05-05T15:00:00Z',
      updated_at: '2026-05-05T14:00:00Z',
    },
    {
      id: 'uuid-2',
      telefone: '5521977777777',
      dados_cadastro: null,
      estado_agente: 'aguardando_sinal',
      last_msg_at: null,
      updated_at: '2026-05-05T13:00:00Z',
    },
    {
      id: 'uuid-3',
      telefone: null,
      dados_cadastro: {},
      estado_agente: 'novo_contato',
      last_msg_at: '2026-05-05T12:00:00Z',
      updated_at: '2026-05-05T11:00:00Z',
    },
  ];

  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(conversas), { status: 200 });

  try {
    const req = new Request(`https://x.com/api/dashboard/atividade-recente?studio_token=${token}`, { method: 'GET' });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.atividades.length, 3);

    // conversa 1: dados_cadastro.nome preferido
    assert.equal(body.atividades[0].nome, 'Maria');
    assert.equal(body.atividades[0].id, 'uuid-1');
    assert.equal(body.atividades[0].estado_agente, 'propondo_valor');
    assert.equal(body.atividades[0].last_msg_at, '2026-05-05T15:00:00Z');

    // conversa 2: sem dados_cadastro.nome → fallback telefone; last_msg_at null → updated_at
    assert.equal(body.atividades[1].nome, '5521977777777');
    assert.equal(body.atividades[1].last_msg_at, '2026-05-05T13:00:00Z');

    // conversa 3: sem nome e sem telefone → 'sem nome'
    assert.equal(body.atividades[2].nome, 'sem nome');
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ── Test 3: query usa LIMIT 3 + ORDER BY last_msg_at DESC + tenant guard ──────
test('atividade-recente — query usa LIMIT 3 + ORDER BY last_msg_at DESC + tenant guard', async () => {
  const { onRequest } = await import('../../functions/api/dashboard/atividade-recente.js');
  const token = await makeStudioToken(TENANT_ID, STUDIO_TOKEN_SECRET);

  const origFetch = globalThis.fetch;
  const fetchedUrls = [];
  globalThis.fetch = async (url) => {
    fetchedUrls.push(typeof url === 'string' ? url : url.toString());
    return new Response(JSON.stringify([]), { status: 200 });
  };

  try {
    const req = new Request(`https://x.com/api/dashboard/atividade-recente?studio_token=${token}`, { method: 'GET' });
    await onRequest({ request: req, env: mockEnv() });

    // Deve haver exatamente 1 chamada fetch (a query de conversas)
    assert.equal(fetchedUrls.length, 1, `esperava 1 fetch, recebeu ${fetchedUrls.length}: ${fetchedUrls.join(', ')}`);
    const url = fetchedUrls[0];

    assert.match(url, new RegExp(`tenant_id=eq\\.${TENANT_ID}`), `URL deve conter tenant guard: ${url}`);
    assert.match(url, /order=last_msg_at\.desc\.nullslast/, `URL deve ter order correto: ${url}`);
    assert.match(url, /limit=3/, `URL deve ter LIMIT 3: ${url}`);
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ── Test 4: 0 conversas retorna array vazio ───────────────────────────────────
test('atividade-recente — 0 conversas retorna array vazio', async () => {
  const { onRequest } = await import('../../functions/api/dashboard/atividade-recente.js');
  const token = await makeStudioToken(TENANT_ID, STUDIO_TOKEN_SECRET);

  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([]), { status: 200 });

  try {
    const req = new Request(`https://x.com/api/dashboard/atividade-recente?studio_token=${token}`, { method: 'GET' });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.atividades, []);
  } finally {
    globalThis.fetch = origFetch;
  }
});
