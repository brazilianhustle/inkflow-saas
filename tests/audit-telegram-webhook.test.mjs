import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/audit/telegram-webhook.js';

function makeRequest({ method = 'POST', secretHeader, body }) {
  const headers = { 'Content-Type': 'application/json' };
  if (secretHeader !== undefined) headers['X-Telegram-Bot-Api-Secret-Token'] = secretHeader;
  return new Request('https://example.com/api/audit/telegram-webhook', {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
}

const ENV = {
  SUPABASE_SERVICE_KEY: 'service-key',
  TELEGRAM_WEBHOOK_SECRET: 'whsec',
  TELEGRAM_ADMIN_USER_ID: '12345',
  TELEGRAM_BOT_TOKEN: 'tg-token',
  TELEGRAM_CHAT_ID: '12345',
};

test('returns 405 on GET', async () => {
  const res = await onRequest({ request: makeRequest({ method: 'GET' }), env: ENV });
  assert.equal(res.status, 405);
});

test('returns 401 when X-Telegram-Bot-Api-Secret-Token mismatch', async () => {
  const req = makeRequest({ secretHeader: 'wrong', body: { message: {} } });
  const res = await onRequest({ request: req, env: ENV });
  assert.equal(res.status, 401);
});

test('returns 200 noop when message.from.id is not admin', async () => {
  globalThis.fetch = async () => { throw new Error('should not be called'); };
  const req = makeRequest({
    secretHeader: 'whsec',
    body: { message: { from: { id: 99999 }, text: 'ack a3f1b9c2' } },
  });
  const res = await onRequest({ request: req, env: ENV });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.skipped, 'not_admin');
});

test('returns 200 noop when text does not start with "ack "', async () => {
  globalThis.fetch = async () => { throw new Error('should not be called'); };
  const req = makeRequest({
    secretHeader: 'whsec',
    body: { message: { from: { id: 12345 }, text: 'oi' } },
  });
  const res = await onRequest({ request: req, env: ENV });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.skipped, 'not_ack');
});

test('ack <id_short> resolves UUID, PATCHes acknowledged_*, sends confirmation', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body });
    if (String(url).includes('/rest/v1/audit_events') && (opts.method || 'GET') === 'GET') {
      return { ok: true, status: 200, json: async () => [{
        id: 'a3f1b9c2-1111-2222-3333-444455556666',
        auditor: 'key-expiry', severity: 'warn',
      }] };
    }
    if (String(url).includes('/rest/v1/audit_events') && opts.method === 'PATCH') {
      return { ok: true, status: 204 };
    }
    if (String(url).includes('api.telegram.org')) {
      return { ok: true, status: 200 };
    }
    throw new Error(`unmocked: ${url}`);
  };
  const req = makeRequest({
    secretHeader: 'whsec',
    body: { message: { from: { id: 12345 }, text: 'ack a3f1b9c2' } },
  });
  const res = await onRequest({ request: req, env: ENV });
  assert.equal(res.status, 200);
  const patchCall = calls.find((c) => c.method === 'PATCH');
  assert.ok(patchCall, 'PATCH happened');
  const patchBody = JSON.parse(patchCall.body);
  assert.ok(patchBody.acknowledged_at);
  assert.equal(patchBody.acknowledged_by, '12345');
});

test('ack with unknown id_short returns 200 with not_found', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('/rest/v1/audit_events')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (String(url).includes('api.telegram.org')) return { ok: true };
    throw new Error('unmocked');
  };
  const req = makeRequest({
    secretHeader: 'whsec',
    body: { message: { from: { id: 12345 }, text: 'ack deadbeef' } },
  });
  const res = await onRequest({ request: req, env: ENV });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.skipped, 'not_found');
});

test('returns 503 when TELEGRAM_ADMIN_USER_ID is empty', async () => {
  globalThis.fetch = async () => { throw new Error('should not be called'); };
  const envEmpty = { ...ENV, TELEGRAM_ADMIN_USER_ID: '' };
  const req = makeRequest({
    secretHeader: 'whsec',
    body: { message: { from: { id: 12345 }, text: 'ack a3f1b9c2' } },
  });
  const res = await onRequest({ request: req, env: envEmpty });
  assert.equal(res.status, 503);
  const data = await res.json();
  assert.equal(data.error, 'config_missing');
});

test('returns 200 noop when from.id is 0 even if TELEGRAM_ADMIN_USER_ID matches', async () => {
  globalThis.fetch = async () => { throw new Error('should not be called'); };
  const envZero = { ...ENV, TELEGRAM_ADMIN_USER_ID: '0' };
  const req = makeRequest({
    secretHeader: 'whsec',
    body: { message: { from: { id: 0 }, text: 'ack a3f1b9c2' } },
  });
  const res = await onRequest({ request: req, env: envZero });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.skipped, 'not_admin');
});
