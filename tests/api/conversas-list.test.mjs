import { test } from 'node:test';
import assert from 'node:assert/strict';

function mockEnv() {
  return {
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    STUDIO_TOKEN_SECRET: 'test-secret-min-32-chars-padding-padding',
  };
}

async function makeStudioToken(tenantId, env) {
  const { generateStudioToken } = await import('../../functions/api/_auth-helpers.js');
  return generateStudioToken(tenantId, env.STUDIO_TOKEN_SECRET);
}

test('list — falta studio_token → 400', async () => {
  const { onRequest } = await import('../../functions/api/conversas/list.js');
  const req = new Request('https://x.com/api/conversas/list?grupo=hoje', { method: 'GET' });
  const res = await onRequest({ request: req, env: mockEnv() });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /studio_token/i);
});

test('list — studio_token inválido → 401', async () => {
  const { onRequest } = await import('../../functions/api/conversas/list.js');
  const req = new Request('https://x.com/api/conversas/list?studio_token=invalid&grupo=hoje', { method: 'GET' });
  const res = await onRequest({ request: req, env: mockEnv() });
  assert.equal(res.status, 401);
});

test('list — grupo inválido → 400 com lista de válidos', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('[]', { status: 200 });

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=invalido`, { method: 'GET' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /grupo/i);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('list — happy path: stub Supabase, retorna conversas + previews', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push(url);
    if (url.includes('/rest/v1/conversas?')) {
      return new Response(JSON.stringify([
        { id: 'c1', telefone: '5511999999999', estado_agente: 'coletando_tattoo', last_msg_at: '2026-05-04T12:00:00Z', valor_proposto: null, dados_coletados: { nome: 'Ana' }, dados_cadastro: null },
        { id: 'c2', telefone: '5511888888888', estado_agente: 'aguardando_sinal', last_msg_at: '2026-05-04T11:00:00Z', valor_proposto: 500, dados_coletados: {}, dados_cadastro: null },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/rest/v1/n8n_chat_histories?')) {
      return new Response(JSON.stringify([
        { message: { content: 'Oi! Quero fazer uma tattoo de leão no antebraço.' } }
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=hoje&limit=30`, { method: 'GET' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(Array.isArray(body.conversas), true);
    assert.equal(body.conversas.length, 2);
    assert.equal(body.conversas[0].id, 'c1');
    assert.ok(body.conversas[0].last_msg_preview, 'deve trazer preview da última msg');
    const conversaCalls = calls.filter(u => u.includes('/rest/v1/conversas?'));
    for (const url of conversaCalls) {
      assert.ok(url.includes(`tenant_id=eq.${tenantId}`), `Esperava tenant_id=eq.${tenantId} em ${url}`);
    }
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('list — limit fora de range → clamped pra 100', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let lastUrl = '';
  globalThis.fetch = async (url) => {
    lastUrl = url;
    if (url.includes('conversas?')) return new Response('[]', { status: 200 });
    if (url.includes('n8n_chat_histories?')) return new Response('[]', { status: 200 });
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=hoje&limit=999`, { method: 'GET' });
    await onRequest({ request: req, env });
    assert.match(lastUrl, /limit=100/, `Esperava limit=100 em ${lastUrl}`);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('list — before_ts cursor → adiciona last_msg_at=lt na query', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let lastConvUrl = '';
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?')) {
      lastConvUrl = url;
      return new Response('[]', { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=negociacao&before_ts=2026-05-03T00:00:00Z`, { method: 'GET' });
    await onRequest({ request: req, env });
    assert.match(lastConvUrl, /last_msg_at=lt\.2026-05-03T00%3A00%3A00Z/);
  } finally {
    globalThis.fetch = origFetch;
  }
});
