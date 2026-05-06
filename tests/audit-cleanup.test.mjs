import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/cron/audit-cleanup.js';

const ENV = { CRON_SECRET: 'cs', SUPABASE_SERVICE_KEY: 'sb' };

function reqAuthed() {
  return new Request('https://x/api/cron/audit-cleanup', {
    method: 'POST', headers: { Authorization: 'Bearer cs' },
  });
}

test('401 sem CRON_SECRET', async () => {
  const req = new Request('https://x/api/cron/audit-cleanup', {
    method: 'POST', headers: { Authorization: 'Bearer wrong' },
  });
  const res = await onRequest({ request: req, env: ENV });
  assert.equal(res.status, 401);
});

test('DELETEs audit_events resolved >90d e audit_runs >30d', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: opts.method || 'GET' });
    return { ok: true, status: 204 };
  };
  const res = await onRequest({ request: reqAuthed(), env: ENV });
  assert.equal(res.status, 200);
  const deletes = calls.filter((c) => c.method === 'DELETE');
  assert.equal(deletes.length, 2);
  assert.ok(deletes.some((c) => c.url.includes('audit_events')));
  assert.ok(deletes.some((c) => c.url.includes('audit_runs')));
});

test('AbortError (transient timeout) returns 504 grácil — não vaza 500-default', async () => {
  globalThis.fetch = async () => {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    throw err;
  };
  const res = await onRequest({ request: reqAuthed(), env: ENV });
  assert.equal(res.status, 504);
  const data = await res.json();
  assert.equal(data.error, 'transient_timeout');
  assert.equal(data.error_name, 'AbortError');
});

test('Unhandled exception returns 500 grácil com shape JSON debuggable', async () => {
  globalThis.fetch = async () => {
    throw new Error('supabase REST 503');
  };
  const res = await onRequest({ request: reqAuthed(), env: ENV });
  assert.equal(res.status, 500);
  const data = await res.json();
  assert.equal(data.error, 'internal_error');
  assert.match(data.message, /supabase REST 503/);
});
