// tests/audit-vps-limits-endpoint.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/cron/audit-vps-limits.js';

const baseEnv = {
  CRON_SECRET: 'test-cron-secret',
  SUPABASE_SERVICE_KEY: 'test-supabase-key',
  VPS_HEALTH_URL: 'https://n8n.inkflowbrasil.com/_health/metrics',
  VPS_HEALTH_TOKEN: 'test-vps-token',
  TELEGRAM_BOT_TOKEN: 'test-tg-token',
  TELEGRAM_CHAT_ID: '123',
};

function makeReq(method = 'POST', authHeader = 'Bearer test-cron-secret') {
  return new Request('https://example.com/api/cron/audit-vps-limits', {
    method,
    headers: { Authorization: authHeader },
  });
}

function makeFetch(handlers) {
  return async (url, init) => {
    for (const h of handlers) {
      if (h.match(url, init)) return h.respond(url, init);
    }
    throw new Error(`Unhandled fetch: ${url}`);
  };
}

test('endpoint rejects GET with 405', async () => {
  const res = await onRequest({ request: makeReq('GET'), env: baseEnv });
  assert.equal(res.status, 405);
});

test('endpoint rejects missing Bearer with 401', async () => {
  const res = await onRequest({ request: makeReq('POST', ''), env: baseEnv });
  assert.equal(res.status, 401);
});

test('endpoint rejects wrong Bearer with 401', async () => {
  const res = await onRequest({ request: makeReq('POST', 'Bearer wrong'), env: baseEnv });
  assert.equal(res.status, 401);
});

test('endpoint returns 503 when SUPABASE_SERVICE_KEY missing', async () => {
  const env = { ...baseEnv, SUPABASE_SERVICE_KEY: '' };
  const res = await onRequest({ request: makeReq(), env });
  assert.equal(res.status, 503);
});

test('endpoint returns 503 when VPS_HEALTH_URL missing', async () => {
  const env = { ...baseEnv, VPS_HEALTH_URL: '' };
  const res = await onRequest({ request: makeReq(), env });
  assert.equal(res.status, 503);
});

test('endpoint returns 503 when VPS_HEALTH_TOKEN missing', async () => {
  const env = { ...baseEnv, VPS_HEALTH_TOKEN: '' };
  const res = await onRequest({ request: makeReq(), env });
  assert.equal(res.status, 503);
});

test('endpoint handles VPS fetch failure (5xx) gracefully — endRun error', async () => {
  let runStarted = false;
  let runEnded = false;
  let runEndStatus = null;
  const fetchImpl = makeFetch([
    {
      match: (url) => url.includes('audit_runs') && !url.includes('?id='),
      respond: async () => {
        runStarted = true;
        return new Response(JSON.stringify([{ id: 'run-uuid' }]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
    {
      match: (url) => url.includes('audit_runs') && url.includes('?id='),
      respond: async (url, init) => {
        runEnded = true;
        runEndStatus = JSON.parse(init.body).status;
        return new Response('', { status: 204 });
      },
    },
    {
      match: (url) => url.includes('_health/metrics'),
      respond: async () => new Response('Service Unavailable', { status: 503 }),
    },
  ]);
  const res = await onRequest({ request: makeReq(), env: baseEnv, fetchImpl });
  const body = await res.json();
  assert.equal(res.status, 500);
  assert.equal(runStarted, true);
  assert.equal(runEnded, true);
  assert.equal(runEndStatus, 'error');
});

test('endpoint clean run (all metrics healthy) returns ok with 0 events', async () => {
  const fetchImpl = makeFetch([
    {
      match: (url) => url.includes('audit_runs') && !url.includes('?id='),
      respond: async () => new Response(JSON.stringify([{ id: 'run-uuid' }]), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_runs') && url.includes('?id='),
      respond: async () => new Response('', { status: 204 }),
    },
    {
      match: (url) => url.includes('_health/metrics'),
      respond: async () => new Response(JSON.stringify({
        ram_used_pct: 0.30, ram_total_mb: 8000, ram_used_mb: 2400,
        disk_used_pct: 0.25, disk_total_gb: 150, disk_used_gb: 37,
        load_avg_5m: 0.5, vcpu_count: 4,
        ts: '2026-04-29T22:53:00Z',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_current_state'),
      respond: async () => new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
  ]);
  const res = await onRequest({ request: makeReq(), env: baseEnv, fetchImpl });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.events_count, 0);
});

test('endpoint critical run (disk 92%) fires + sends Telegram', async () => {
  let telegramCalled = false;
  let insertedEvent = null;
  const fetchImpl = makeFetch([
    {
      match: (url) => url.includes('audit_runs') && !url.includes('?id='),
      respond: async () => new Response(JSON.stringify([{ id: 'run-uuid' }]), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_runs') && url.includes('?id='),
      respond: async () => new Response('', { status: 204 }),
    },
    {
      match: (url) => url.includes('_health/metrics'),
      respond: async () => new Response(JSON.stringify({
        ram_used_pct: 0.30, ram_total_mb: 8000,
        disk_used_pct: 0.92, disk_total_gb: 150, disk_used_gb: 138,
        load_avg_5m: 0.5, vcpu_count: 4,
        ts: '2026-04-29T22:53:00Z',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_current_state'),
      respond: async () => new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_events') && !url.includes('?id='),
      respond: async (url, init) => {
        insertedEvent = JSON.parse(init.body);
        return new Response(JSON.stringify([{ id: 'event-uuid', ...insertedEvent }]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
    {
      match: (url) => url.includes('api.telegram.org'),
      respond: async () => { telegramCalled = true; return new Response('{"ok":true}', { status: 200 }); },
    },
  ]);
  const res = await onRequest({ request: makeReq(), env: baseEnv, fetchImpl });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.events_count, 1);
  assert.equal(body.actions.fire, 1);
  assert.equal(insertedEvent?.severity, 'critical');
  assert.equal(telegramCalled, true);
});
