// Tests pra tool handoff_to_cadastro — sinaliza fim da fase tattoo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/tools/handoff-to-cadastro.js';

const SECRET = 'test-secret';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TELEFONE = '+5511999999999';

function buildContext(body, secret = SECRET) {
  return {
    request: new Request('https://example.com/api/tools/handoff-to-cadastro', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Inkflow-Tool-Secret': secret,
      },
      body: JSON.stringify(body),
    }),
    env: { INKFLOW_TOOL_SECRET: SECRET, SUPABASE_SERVICE_ROLE_KEY: 'test-key' },
    waitUntil: () => {},
  };
}

test('handoff_to_cadastro retorna 200 + payload esperado quando dados_completos=true', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 201 });
  try {
    const ctx = buildContext({
      tenant_id: TENANT_ID,
      telefone: TELEFONE,
      dados_completos: true,
      campos_conflitantes: [],
    });
    const res = await onRequest(ctx);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.handoff, true);
    assert.equal(body.proximo_estado, 'cadastro');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('handoff_to_cadastro rejeita quando dados_completos=false', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 201 });
  try {
    const ctx = buildContext({
      tenant_id: TENANT_ID,
      telefone: TELEFONE,
      dados_completos: false,
      campos_conflitantes: [],
    });
    const res = await onRequest(ctx);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /dados_completos/);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('handoff_to_cadastro rejeita quando campos_conflitantes nao-vazio', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 201 });
  try {
    const ctx = buildContext({
      tenant_id: TENANT_ID,
      telefone: TELEFONE,
      dados_completos: true,
      campos_conflitantes: ['tamanho_cm'],
    });
    const res = await onRequest(ctx);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /conflit/);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('handoff_to_cadastro rejeita sem secret valido', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 201 });
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, dados_completos: true, campos_conflitantes: [] }, 'wrong');
    const res = await onRequest(ctx);
    assert.equal(res.status, 401);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('handoff_to_cadastro rejeita sem tenant_id', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 201 });
  try {
    const ctx = buildContext({ tenant_id: '', telefone: TELEFONE, dados_completos: true, campos_conflitantes: [] });
    const res = await onRequest(ctx);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /tenant_id|telefone/);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('handoff_to_cadastro rejeita dados_completos como string (LLM serializou bool como str)', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 201 });
  try {
    // String "true" nao deve passar — strict equality === true e o gate.
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, dados_completos: 'true', campos_conflitantes: [] });
    const res = await onRequest(ctx);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /dados_completos/);
  } finally {
    globalThis.fetch = origFetch;
  }
});
