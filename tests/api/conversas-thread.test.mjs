import { test } from 'node:test';
import assert from 'node:assert/strict';

function mockEnv() {
  return {
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    STUDIO_TOKEN_SECRET: 'test-secret-min-32-chars-padding-padding',
  };
}

async function makeStudioToken(tenantId, env) {
  const { generateStudioToken } = await import('../../functions/api/_auth-helpers.js');
  return generateStudioToken(tenantId, env.STUDIO_TOKEN_SECRET);
}

test('thread — falta conversa_id → 400', async () => {
  const env = mockEnv();
  const token = await makeStudioToken('00000000-0000-0000-0000-000000000001', env);
  const { onRequest } = await import('../../functions/api/conversas/thread.js');
  const req = new Request(`https://x.com/api/conversas/thread?studio_token=${token}`, { method: 'GET' });
  const res = await onRequest({ request: req, env });
  assert.equal(res.status, 400);
});

test('thread — conversa de outro tenant → 404 (tenant guard)', async () => {
  const env = mockEnv();
  const tenantA = '00000000-0000-0000-0000-000000000001';
  const tokenA = await makeStudioToken(tenantA, env);

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?')) {
      assert.match(url, /tenant_id=eq\.00000000-0000-0000-0000-000000000001/);
      return new Response('[]', { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/thread.js');
    const req = new Request(`https://x.com/api/conversas/thread?studio_token=${tokenA}&conversa_id=11111111-1111-1111-1111-111111111111`, { method: 'GET' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 404);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('thread — happy path: retorna mensagens com role mapeado e session_id server-side', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let mensagensUrl = '';
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?')) {
      return new Response(JSON.stringify([
        { id: 'cv1', telefone: '5511999999999', estado_agente: 'coletando_tattoo', estado_agente_anterior: null, pausada_em: null, dados_coletados: {}, dados_cadastro: null, valor_proposto: null }
      ]), { status: 200 });
    }
    if (url.includes('/rest/v1/n8n_chat_histories?')) {
      mensagensUrl = url;
      return new Response(JSON.stringify([
        { id: 3, message: { type: 'human', content: 'Oi quero tattoo' }, created_at: '2026-05-04T12:00:00Z' },
        { id: 4, message: { type: 'ai', content: 'Show! Conta mais.' }, created_at: '2026-05-04T12:00:30Z' },
        { id: 5, message: { type: 'tool', content: 'tool_call' }, created_at: '2026-05-04T12:00:31Z' },
      ]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/thread.js');
    const req = new Request(`https://x.com/api/conversas/thread?studio_token=${token}&conversa_id=cv1`, { method: 'GET' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.conversa.id, 'cv1');
    // skipou tool/system → só human + ai
    assert.equal(body.mensagens.length, 2);
    assert.equal(body.mensagens[0].role, 'human');
    assert.equal(body.mensagens[1].role, 'ai');
    // session_id construído server-side, igualdade exata
    assert.match(mensagensUrl, /session_id=eq\.00000000-0000-0000-0000-000000000001_5511999999999/);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('thread — before_ts cursor → adiciona created_at=lt', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let mensagensUrl = '';
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?')) {
      return new Response(JSON.stringify([{ id: 'cv1', telefone: '5511999999999' }]), { status: 200 });
    }
    if (url.includes('/rest/v1/n8n_chat_histories?')) {
      mensagensUrl = url;
      return new Response('[]', { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/thread.js');
    const req = new Request(`https://x.com/api/conversas/thread?studio_token=${token}&conversa_id=cv1&before_ts=2026-05-04T10:00:00Z`, { method: 'GET' });
    await onRequest({ request: req, env });
    assert.match(mensagensUrl, /created_at=lt\.2026-05-04T10%3A00%3A00Z/);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('thread — limit clamped pra 200 max', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let mensagensUrl = '';
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?')) {
      return new Response(JSON.stringify([{ id: 'cv1', telefone: '5511999999999' }]), { status: 200 });
    }
    if (url.includes('/rest/v1/n8n_chat_histories?')) {
      mensagensUrl = url;
      return new Response('[]', { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/thread.js');
    const req = new Request(`https://x.com/api/conversas/thread?studio_token=${token}&conversa_id=cv1&limit=999`, { method: 'GET' });
    await onRequest({ request: req, env });
    assert.match(mensagensUrl, /limit=200/);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('thread — before_ts inválido (não-ISO) → 400', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);
  const { onRequest } = await import('../../functions/api/conversas/thread.js');
  const req = new Request(`https://x.com/api/conversas/thread?studio_token=${token}&conversa_id=cv1&before_ts=not-a-date`, { method: 'GET' });
  const res = await onRequest({ request: req, env });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /before_ts/i);
});
