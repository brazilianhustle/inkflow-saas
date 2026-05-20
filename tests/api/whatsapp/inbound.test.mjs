// tests/api/whatsapp/inbound.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../../functions/api/whatsapp/inbound.js';

const ENV = {
  WEBHOOK_SECRET: 'shh',
  SUPABASE_SERVICE_ROLE_KEY: 'svc-key',
};

function mockSessionQueue(enqueueSpy) {
  return {
    idFromName: (name) => ({ name }),
    get: () => ({ fetch: enqueueSpy }),
  };
}

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

test('inbound: INSERT OK → enfileira no DO via waitUntil (nao chama processMessage)', async () => {
  const orig = globalThis.fetch;
  const waitSpy = mock.fn((p) => p); // executa a promise
  const enqueueSpy = mock.fn(async () => new Response('{"accepted":12345}', { status: 200 }));
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/tenants?')) return new Response(JSON.stringify([{ id: 'tid', evo_instance: 'inkflow_test', tatuador_telegram_chat_id: '99' }]), { status: 200 });
    if (url.includes('/rest/v1/conversa_mensagens') && opts?.method === 'POST') return new Response(JSON.stringify([{ id: 12345 }]), { status: 201 });
    return new Response('[]', { status: 200 });
  };
  const env = { WEBHOOK_SECRET: 'shh', SUPABASE_SERVICE_ROLE_KEY: 'svc-key', SESSION_QUEUE: mockSessionQueue(enqueueSpy) };
  try {
    const ctx = buildContext({ body: VALID_PAYLOAD, waitUntilSpy: waitSpy });
    ctx.env = env;
    const res = await onRequest(ctx);
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.accepted, 12345);
    assert.equal(enqueueSpy.mock.callCount(), 1, 'enfileirou no DO 1×');
    const enqReq = enqueueSpy.mock.calls[0].arguments[0];
    const enqBody = JSON.parse(await enqReq.text());
    assert.equal(enqBody.msgRowId, 12345);
    assert.equal(enqBody.session_id, 'tid_5511999');
  } finally { globalThis.fetch = orig; }
});

test('inbound: enqueue rejeita → .catch engole, ainda 200 accepted (persist-first)', async () => {
  const orig = globalThis.fetch;
  const waitSpy = mock.fn((p) => p); // executa a promise (rejeitada) — o .catch interno trata
  const enqueueSpy = mock.fn(async () => { throw new Error('DO unreachable'); });
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/tenants?')) return new Response(JSON.stringify([{ id: 'tid', evo_instance: 'inkflow_test' }]), { status: 200 });
    if (url.includes('/rest/v1/conversa_mensagens') && opts?.method === 'POST') return new Response(JSON.stringify([{ id: 12345 }]), { status: 201 });
    return new Response('[]', { status: 200 });
  };
  try {
    const ctx = buildContext({ body: VALID_PAYLOAD, waitUntilSpy: waitSpy });
    ctx.env = { WEBHOOK_SECRET: 'shh', SUPABASE_SERVICE_ROLE_KEY: 'svc-key', SESSION_QUEUE: mockSessionQueue(enqueueSpy) };
    const res = await onRequest(ctx);
    const json = await res.json();
    // Ack 200 mesmo com enqueue falhando — msg ja persistida (received), recuperavel.
    assert.equal(res.status, 200);
    assert.equal(json.accepted, 12345);
    assert.equal(enqueueSpy.mock.callCount(), 1);
  } finally { globalThis.fetch = orig; }
});

test('inbound: sem binding SESSION_QUEUE → 200 queued:false (nao silencia)', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/tenants?')) return new Response(JSON.stringify([{ id: 'tid', evo_instance: 'inkflow_test' }]), { status: 200 });
    if (url.includes('/rest/v1/conversa_mensagens') && opts?.method === 'POST') return new Response(JSON.stringify([{ id: 12345 }]), { status: 201 });
    return new Response('[]', { status: 200 });
  };
  try {
    const ctx = buildContext({ body: VALID_PAYLOAD });
    ctx.env = { WEBHOOK_SECRET: 'shh', SUPABASE_SERVICE_ROLE_KEY: 'svc-key' }; // sem SESSION_QUEUE
    const res = await onRequest(ctx);
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.queued, false);
  } finally { globalThis.fetch = orig; }
});
