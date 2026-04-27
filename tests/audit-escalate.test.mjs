import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/cron/audit-escalate.js';

const ENV = {
  CRON_SECRET: 'cron-secret',
  SUPABASE_SERVICE_KEY: 'sb-key',
  PUSHOVER_APP_TOKEN: 'po-app',
  PUSHOVER_USER_KEY: 'po-user',
};

function reqAuthed(body) {
  return new Request('https://x/api/cron/audit-escalate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cron-secret' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test('401 sem CRON_SECRET match', async () => {
  const req = new Request('https://x/api/cron/audit-escalate', {
    method: 'POST', headers: { Authorization: 'Bearer wrong' },
  });
  const res = await onRequest({ request: req, env: ENV });
  assert.equal(res.status, 401);
});

test('escalates each row: Pushover send + PATCH escalated_at', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body });
    if (String(url).includes('/rest/v1/audit_events') && (opts.method || 'GET') === 'GET') {
      return { ok: true, status: 200, json: async () => [
        { id: 'evt1', auditor: 'key-expiry', payload: { summary: 's1' } },
        { id: 'evt2', auditor: 'deploy-health', payload: { summary: 's2' } },
      ]};
    }
    if (String(url).includes('api.pushover.net')) return { ok: true, status: 200 };
    if (String(url).includes('/rest/v1/audit_events') && opts.method === 'PATCH') {
      return { ok: true, status: 204 };
    }
    throw new Error(`unmocked: ${url}`);
  };
  const res = await onRequest({ request: reqAuthed(), env: ENV });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.escalated_count, 2);
  const patches = calls.filter((c) => c.method === 'PATCH');
  assert.equal(patches.length, 2);
  patches.forEach((p) => assert.match(p.body, /escalated_at/));
});

test('returns 0 when no critical sem ack >2h', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('/rest/v1/audit_events')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    throw new Error('unmocked');
  };
  const res = await onRequest({ request: reqAuthed(), env: ENV });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.escalated_count, 0);
});
