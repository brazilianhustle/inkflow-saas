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

test('list — happy path: stub Supabase, retorna conversas + previews (grupo=hoje cross-column)', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push(url);
    if (url.includes('/rest/v1/conversas?')) {
      return new Response(JSON.stringify([
        { id: 'c1', telefone: '5511999999999', estado: 'qualificando', estado_agente: 'coletando_tattoo', last_msg_at: '2026-05-04T12:00:00Z', valor_proposto: null, dados_coletados: { nome: 'Ana' }, dados_cadastro: null },
        { id: 'c2', telefone: '5511888888888', estado: 'aguardando_sinal', estado_agente: 'ativo', last_msg_at: '2026-05-04T11:00:00Z', valor_proposto: 500, dados_coletados: {}, dados_cadastro: null },
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
    assert.equal(body.conversas.length, 2);
    assert.equal(body.conversas[0].last_msg_preview.length > 0, true);
    // Coverage: garante que session_id é construído como ${tenantId}_${telefone}
    const histCalls = calls.filter(u => u.includes('/rest/v1/n8n_chat_histories?'));
    assert.ok(histCalls.length >= 1, 'pelo menos 1 fetch pra n8n_chat_histories');
    assert.ok(
      histCalls.some(u => u.includes(`session_id=eq.${encodeURIComponent(`${tenantId}_5511999999999`)}`)),
      'session_id deve ser ${tenantId}_${telefone} URL-encoded'
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('list — tenant_id sempre derivado do token (não aceita query param)', async () => {
  const env = mockEnv();
  const realTenantId = '00000000-0000-0000-0000-000000000aaa';
  const fakeTenantId = '00000000-0000-0000-0000-000000000bbb';
  const token = await makeStudioToken(realTenantId, env);

  const origFetch = globalThis.fetch;
  let conversasCallUrl = null;
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?') && url.includes('tenant_id')) {
      conversasCallUrl = url;
      return new Response('[]', { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=hoje&tenant_id=${fakeTenantId}`, { method: 'GET' });
    await onRequest({ request: req, env });
    assert.ok(conversasCallUrl, 'fetch foi chamado pra conversas');
    assert.match(conversasCallUrl, new RegExp(`tenant_id=eq\\.${realTenantId}`), 'usa tenant do token');
    assert.ok(!conversasCallUrl.includes(fakeTenantId), 'NÃO usa tenant_id da URL');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('list — limit clamping: valores fora do range (0, -1, "abc", >100) → default 30 ou cap 100', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let limitObservado = null;
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?')) {
      const m = url.match(/limit=(\d+)/);
      limitObservado = m ? parseInt(m[1]) : null;
      return new Response('[]', { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  const cases = [
    { limit: '0', expected: 30 },
    { limit: '-1', expected: 30 },
    { limit: 'abc', expected: 30 },
    { limit: '999', expected: 100 },
    { limit: '50', expected: 50 },
  ];

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    for (const c of cases) {
      limitObservado = null;
      const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=hoje&limit=${c.limit}`, { method: 'GET' });
      await onRequest({ request: req, env });
      assert.notEqual(limitObservado, null, `fetch deveria ter sido chamado pra limit=${c.limit}`);
      assert.equal(limitObservado, c.expected, `limit=${c.limit} deve clampar pra ${c.expected}`);
    }
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('list — before_ts inválido → 400', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const { onRequest } = await import('../../functions/api/conversas/list.js');
  const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=hoje&before_ts=not-a-date`, { method: 'GET' });
  const res = await onRequest({ request: req, env });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /before_ts/i);
});

test('list — preview falha em uma conversa não derruba o batch (silent failure protection)', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let previewCallCount = 0;
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?') && !url.includes('n8n_chat_histories')) {
      return new Response(JSON.stringify([
        { id: 'c1', telefone: '111', estado: 'qualificando', estado_agente: 'coletando_tattoo', last_msg_at: '2026-05-04T12:00:00Z', valor_proposto: null, dados_coletados: {}, dados_cadastro: null },
        { id: 'c2', telefone: '222', estado: 'qualificando', estado_agente: 'coletando_tattoo', last_msg_at: '2026-05-04T11:00:00Z', valor_proposto: null, dados_coletados: {}, dados_cadastro: null },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/rest/v1/n8n_chat_histories?')) {
      previewCallCount++;
      if (previewCallCount === 1) {
        throw new Error('simulated network error');
      }
      return new Response(JSON.stringify([{ message: { content: 'Olá!' } }]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=hoje&limit=30`, { method: 'GET' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200, 'NÃO deve retornar 500 mesmo com 1 preview falhando');
    const body = await res.json();
    assert.equal(body.conversas.length, 2);
    assert.equal(body.conversas[0].last_msg_preview, '');
    assert.equal(body.conversas[1].last_msg_preview, 'Olá!');
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ─── 3 NOVOS TESTS ─────────────────────────────────────────────────────────

test('list — grupo=hoje constrói URL com or=(estado_agente.in,estado.in) + last_msg_at=gte', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let conversasUrl = null;
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?') && !url.includes('n8n_chat_histories')) {
      conversasUrl = url;
      return new Response('[]', { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=hoje&limit=30`, { method: 'GET' });
    await onRequest({ request: req, env });
    assert.ok(conversasUrl, 'conversas foi consultada');
    assert.match(conversasUrl, /or=\(estado_agente\.in\.\([^)]+\),estado\.in\.\([^)]+\)\)/, 'URL deve conter or=(estado_agente.in.(...),estado.in.(...))');
    assert.match(conversasUrl, /coletando_tattoo/, 'inclui coletando_tattoo em estado_agente');
    assert.match(conversasUrl, /escolhendo_horario/, 'inclui escolhendo_horario em estado');
    assert.match(conversasUrl, /last_msg_at=gte\./, 'inclui filtro last_msg_at=gte');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('list — grupo=negociacao constrói URL com estado_agente=in.(...) direto (sem or=)', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let conversasUrl = null;
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?') && !url.includes('n8n_chat_histories')) {
      conversasUrl = url;
      return new Response('[]', { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=negociacao&limit=30`, { method: 'GET' });
    await onRequest({ request: req, env });
    assert.ok(conversasUrl, 'conversas foi consultada');
    assert.ok(!conversasUrl.includes('or='), 'NÃO deve usar or= quando só estados_agente tem itens');
    assert.match(conversasUrl, /estado_agente=in\.\([^)]+\)/, 'usa estado_agente=in.(...) direto');
    assert.match(conversasUrl, /pausada_tatuador/, 'inclui pausada_tatuador');
    assert.ok(!conversasUrl.includes('last_msg_at=gte'), 'negociacao não filtra por hoje');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('list — grupo=hoje + before_ts → URL contém or=(...) + last_msg_at=lt.<ts>', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let conversasUrl = null;
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?') && !url.includes('n8n_chat_histories')) {
      conversasUrl = url;
      return new Response('[]', { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    const beforeTs = '2026-05-04T10:00:00Z';
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=hoje&before_ts=${encodeURIComponent(beforeTs)}`, { method: 'GET' });
    await onRequest({ request: req, env });
    assert.ok(conversasUrl);
    assert.match(conversasUrl, /or=\(/, 'mantém or= mesmo com before_ts');
    assert.match(conversasUrl, /last_msg_at=lt\./, 'adiciona filtro last_msg_at=lt');
  } finally {
    globalThis.fetch = origFetch;
  }
});
