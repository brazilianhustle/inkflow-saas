// tests/api/dashboard-kpis.test.mjs
// TDD — escrito ANTES da implementação.
// Auth: usa HMAC tokens reais gerados no setup (evita fetch na auth, 100% determinístico).
// Fetch mocking: globalThis.fetch (igual conversas-list.test.mjs — padrão do codebase).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const TENANT_ID = '00000000-0000-0000-0000-000000000010';
const STUDIO_TOKEN_SECRET = 'secret-at-least-32-chars-padding-xx';

// Gera token HMAC real (sem fetch) — padrão de conversas-list.test.mjs
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
test('kpis — sem studio_token retorna 401', async () => {
  const { onRequest } = await import('../../functions/api/dashboard/kpis.js');
  const req = new Request('https://x.com/api/dashboard/kpis', { method: 'GET' });
  const res = await onRequest({ request: req, env: mockEnv() });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.match(body.error, /studio_token/i);
});

// ── Test 2: token inválido → 401 ──────────────────────────────────────────────
test('kpis — studio_token inválido retorna 401', async () => {
  const { onRequest } = await import('../../functions/api/dashboard/kpis.js');

  const origFetch = globalThis.fetch;
  // Legacy UUID lookup retorna array vazio → não autenticado
  globalThis.fetch = async () => new Response('[]', { status: 200 });
  try {
    const req = new Request('https://x.com/api/dashboard/kpis?studio_token=token-invalido', { method: 'GET' });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 401);
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ── Test 3: happy path — 5 KPIs corretos ─────────────────────────────────────
test('kpis — happy path retorna 5 KPIs com valores corretos', async () => {
  const { onRequest } = await import('../../functions/api/dashboard/kpis.js');
  const token = await makeStudioToken(TENANT_ID, STUDIO_TOKEN_SECRET);

  const origFetch = globalThis.fetch;
  let callIdx = 0;
  // Fetch call order:
  //   0: K1 conversas hoje → [{ count: 7 }]
  //   1: K2 orcamentos esta semana → [{ count: 3 }]
  //   2: K3 aguardando sinal → [{ count: 1 }]
  //   3: K4 RPC dashboard_taxa_conversao → [{ fechados: 2, total: 5 }]
  //   4: K5 RPC dashboard_sinal_recebido → [{ sum_sinal: 450.50 }]
  // NOTE: auth call (verifyStudioTokenOrLegacy) uses globalThis.fetch too but
  // HMAC tokens resolve entirely locally (no fetch). So fetch calls 0-4 are all KPI.
  const kpiResponses = [
    new Response(JSON.stringify([{ count: 7 }]), { status: 200 }),
    new Response(JSON.stringify([{ count: 3 }]), { status: 200 }),
    new Response(JSON.stringify([{ count: 1 }]), { status: 200 }),
    new Response(JSON.stringify([{ fechados: 2, total: 5 }]), { status: 200 }),
    new Response(JSON.stringify([{ sum_sinal: 450.50 }]), { status: 200 }),
  ];
  globalThis.fetch = async () => kpiResponses[callIdx++];

  try {
    const req = new Request(`https://x.com/api/dashboard/kpis?studio_token=${token}`, { method: 'GET' });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.kpis, {
      conversas_hoje: 7,
      orcamentos_esta_semana: 3,
      aguardando_sinal: 1,
      taxa_conversao_30d: 40, // Math.round(2/5 * 100)
      sinal_recebido_semana: 450.50,
    });
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ── Test 4: divisão por zero — taxa_conversao → 0 ────────────────────────────
test('kpis — taxa_conversao com total=0 retorna 0 (sem divisão por zero)', async () => {
  const { onRequest } = await import('../../functions/api/dashboard/kpis.js');
  const token = await makeStudioToken(TENANT_ID, STUDIO_TOKEN_SECRET);

  const origFetch = globalThis.fetch;
  let callIdx = 0;
  const kpiResponses = [
    new Response(JSON.stringify([{ count: 0 }]), { status: 200 }),
    new Response(JSON.stringify([{ count: 0 }]), { status: 200 }),
    new Response(JSON.stringify([{ count: 0 }]), { status: 200 }),
    new Response(JSON.stringify([{ fechados: 0, total: 0 }]), { status: 200 }), // denom=0
    new Response(JSON.stringify([{ sum_sinal: 0 }]), { status: 200 }),
  ];
  globalThis.fetch = async () => kpiResponses[callIdx++];

  try {
    const req = new Request(`https://x.com/api/dashboard/kpis?studio_token=${token}`, { method: 'GET' });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.kpis.taxa_conversao_30d, 0);
    assert.equal(body.kpis.sinal_recebido_semana, 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ── Test 5: Supabase 500 → endpoint retorna 500 ───────────────────────────────
test('kpis — Supabase 500 em KPI retorna 500', async () => {
  const { onRequest } = await import('../../functions/api/dashboard/kpis.js');
  const token = await makeStudioToken(TENANT_ID, STUDIO_TOKEN_SECRET);

  const origFetch = globalThis.fetch;
  let callIdx = 0;
  const kpiResponses = [
    new Response('internal error', { status: 500 }), // K1 falha imediatamente
  ];
  globalThis.fetch = async () => kpiResponses[callIdx++] || new Response('[]', { status: 500 });

  try {
    const req = new Request(`https://x.com/api/dashboard/kpis?studio_token=${token}`, { method: 'GET' });
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.ok(body.error, 'deve ter campo error');
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ── Test 6: tenant_id de query param IGNORADO (security) ─────────────────────
test('kpis — tenant_id de query param é IGNORADO, todas queries usam tenant do token', async () => {
  const { onRequest } = await import('../../functions/api/dashboard/kpis.js');
  const token = await makeStudioToken(TENANT_ID, STUDIO_TOKEN_SECRET);
  const SPOOFED_TENANT = '11111111-1111-1111-1111-111111111111';

  const origFetch = globalThis.fetch;
  const fetchedUrls = [];
  let callIdx = 0;
  const kpiResponses = [
    new Response(JSON.stringify([{ count: 0 }]), { status: 200 }),
    new Response(JSON.stringify([{ count: 0 }]), { status: 200 }),
    new Response(JSON.stringify([{ count: 0 }]), { status: 200 }),
    new Response(JSON.stringify([{ fechados: 0, total: 0 }]), { status: 200 }),
    new Response(JSON.stringify([{ sum_sinal: 0 }]), { status: 200 }),
  ];
  globalThis.fetch = async (url, opts) => {
    fetchedUrls.push({ url: typeof url === 'string' ? url : url, body: opts?.body });
    return kpiResponses[callIdx++] || new Response('[]', { status: 200 });
  };

  try {
    const req = new Request(
      `https://x.com/api/dashboard/kpis?studio_token=${token}&tenant_id=${SPOOFED_TENANT}`,
      { method: 'GET' }
    );
    const res = await onRequest({ request: req, env: mockEnv() });
    assert.equal(res.status, 200);

    // Todas as URLs de KPI (GET queries) devem usar TENANT_ID (do token)
    const getUrls = fetchedUrls.filter(({ body }) => !body).map(({ url }) => url);
    for (const url of getUrls) {
      assert.match(url, new RegExp(`tenant_id=eq\\.${TENANT_ID}`), `URL deve usar tenant do token: ${url}`);
      assert.doesNotMatch(url, new RegExp(SPOOFED_TENANT), `URL NÃO deve usar tenant spoofado: ${url}`);
    }

    // RPC calls (POST bodies) devem usar TENANT_ID
    const postCalls = fetchedUrls.filter(({ body }) => body);
    for (const call of postCalls) {
      const bodyParsed = JSON.parse(call.body);
      assert.equal(bodyParsed.p_tenant_id, TENANT_ID, 'RPC deve usar p_tenant_id do token');
      assert.notEqual(bodyParsed.p_tenant_id, SPOOFED_TENANT, 'RPC NÃO deve usar tenant spoofado');
    }
  } finally {
    globalThis.fetch = origFetch;
  }
});
