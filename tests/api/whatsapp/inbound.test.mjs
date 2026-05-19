// tests/api/whatsapp/inbound.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../../functions/api/whatsapp/inbound.js';

const ENV = {
  WEBHOOK_SECRET: 'shh',
  SUPABASE_SERVICE_ROLE_KEY: 'svc-key',
};

function buildContext({ method = 'POST', body, secret = 'shh', waitUntilSpy } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (secret !== null) headers['x-webhook-secret'] = secret;
  return {
    request: new Request('https://x/api/whatsapp/inbound', {
      method,
      headers,
      body: method === 'POST' && body !== undefined ? JSON.stringify(body) : undefined,
    }),
    env: ENV,
    waitUntil: waitUntilSpy || (() => {}),
  };
}

const VALID_PAYLOAD = {
  event: 'messages.upsert',
  instance: 'inkflow_test',
  data: {
    key: { id: 'ABC', remoteJid: '5511999@s.whatsapp.net', fromMe: false },
    message: { conversation: 'oi' },
    pushName: 'Joao',
  },
};

test('inbound: 401 sem x-webhook-secret', async () => {
  const res = await onRequest(buildContext({ secret: null, body: VALID_PAYLOAD }));
  assert.equal(res.status, 401);
});

test('inbound: 405 GET', async () => {
  const res = await onRequest(buildContext({ method: 'GET' }));
  assert.equal(res.status, 405);
});

test('inbound: 400 body invalido', async () => {
  const ctx = buildContext({});
  ctx.request = new Request('https://x/api/whatsapp/inbound', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': 'shh' },
    body: 'not-json',
  });
  const res = await onRequest(ctx);
  assert.equal(res.status, 400);
});

test('inbound: skip parser → 200 + skipped, nao chama waitUntil', async () => {
  const orig = globalThis.fetch;
  const waitSpy = mock.fn();
  globalThis.fetch = async () => new Response('[]', { status: 200 });
  try {
    const ctx = buildContext({ body: { event: 'connection.update' }, waitUntilSpy: waitSpy });
    const res = await onRequest(ctx);
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.skipped, 'wrong-event');
    assert.equal(waitSpy.mock.callCount(), 0);
  } finally { globalThis.fetch = orig; }
});

test('inbound: idempotente (INSERT retorna []) → 200 idempotent:true, NAO dispatch waitUntil', async () => {
  const orig = globalThis.fetch;
  const waitSpy = mock.fn();
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/tenants?')) {
      return new Response(JSON.stringify([{ id: 'tid', evo_instance: 'inkflow_test', tatuador_telegram_chat_id: '99' }]), { status: 200 });
    }
    if (url.includes('/rest/v1/conversa_mensagens') && opts?.method === 'POST') {
      return new Response('[]', { status: 201 });  // ignore-duplicates hit
    }
    return new Response('[]', { status: 200 });
  };
  try {
    const res = await onRequest(buildContext({ body: VALID_PAYLOAD, waitUntilSpy: waitSpy }));
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.idempotent, true);
    assert.equal(waitSpy.mock.callCount(), 0);
  } finally { globalThis.fetch = orig; }
});

test('inbound: INSERT OK (row populada) → 200 accepted:<id> + waitUntil chamado', async () => {
  const orig = globalThis.fetch;
  const waitSpy = mock.fn();
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/tenants?')) {
      return new Response(JSON.stringify([{ id: 'tid', evo_instance: 'inkflow_test', tatuador_telegram_chat_id: '99' }]), { status: 200 });
    }
    if (url.includes('/rest/v1/conversa_mensagens') && opts?.method === 'POST') {
      return new Response(JSON.stringify([{ id: 12345 }]), { status: 201 });
    }
    return new Response('[]', { status: 200 });
  };
  try {
    const res = await onRequest(buildContext({ body: VALID_PAYLOAD, waitUntilSpy: waitSpy }));
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.accepted, 12345);
    assert.equal(waitSpy.mock.callCount(), 1);
  } finally { globalThis.fetch = orig; }
});
