// tests/audit-rls-drift-endpoint.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/cron/audit-rls-drift.js';

const baseEnv = {
  CRON_SECRET: 'test-cron-secret',
  SUPABASE_SERVICE_KEY: 'test-supabase-key',
  SUPABASE_PAT: 'sbp_test',
  RLS_INTENTIONAL_NO_PUBLIC: 'audit_events,audit_runs,audit_reports,approvals,tool_calls_log,signups_log',
  TELEGRAM_BOT_TOKEN: 'test-tg-token',
  TELEGRAM_CHAT_ID: '123',
};

function makeReq(method = 'POST', authHeader = 'Bearer test-cron-secret') {
  return new Request('https://example.com/api/cron/audit-rls-drift', {
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

test('endpoint returns 503 when SUPABASE_PAT missing', async () => {
  const env = { ...baseEnv, SUPABASE_PAT: '' };
  const res = await onRequest({ request: makeReq(), env });
  assert.equal(res.status, 503);
});

test('endpoint handles SQL query failure (5xx) gracefully — endRun error', async () => {
  let runEnded = false;
  let runEndStatus = null;
  const fetchImpl = makeFetch([
    {
      match: (url) => url.includes('audit_runs') && !url.includes('?id='),
      respond: async () => new Response(JSON.stringify([{ id: 'run-uuid' }]), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_runs') && url.includes('?id='),
      respond: async (url, init) => {
        runEnded = true;
        runEndStatus = JSON.parse(init.body).status;
        return { ok: true, status: 204, text: async () => '' };
      },
    },
    {
      match: (url) => url.includes('api.supabase.com/v1/projects') && url.includes('database/query'),
      respond: async () => new Response('Service Unavailable', { status: 503 }),
    },
  ]);
  const res = await onRequest({ request: makeReq(), env: baseEnv, fetchImpl });
  assert.equal(res.status, 500);
  assert.equal(runEnded, true);
  assert.equal(runEndStatus, 'error');
});

test('endpoint clean run (zero rows from both queries) returns ok with 0 events', async () => {
  let queryCalls = 0;
  const fetchImpl = makeFetch([
    {
      match: (url) => url.includes('audit_runs') && !url.includes('?id='),
      respond: async () => new Response(JSON.stringify([{ id: 'run-uuid' }]), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_runs') && url.includes('?id='),
      respond: async () => ({ ok: true, status: 204, text: async () => '' }),
    },
    {
      // Both SQL queries (RLS + search_path) return empty array
      match: (url) => url.includes('api.supabase.com/v1/projects') && url.includes('database/query'),
      respond: async () => {
        queryCalls++;
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
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
  assert.equal(queryCalls, 2); // 2 SQL queries (RLS + search_path)
});

test('endpoint critical run (function without search_path) fires + Telegram', async () => {
  let telegramCalled = false;
  let insertedEvent = null;
  const fetchImpl = makeFetch([
    {
      match: (url) => url.includes('audit_runs') && !url.includes('?id='),
      respond: async () => new Response(JSON.stringify([{ id: 'run-uuid' }]), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_runs') && url.includes('?id='),
      respond: async () => ({ ok: true, status: 204, text: async () => '' }),
    },
    {
      // 1ª query: RLS check returns empty (all tables have RLS)
      match: (url, init) => url.includes('api.supabase.com/v1/projects') && url.includes('database/query') && init?.body?.includes('relrowsecurity'),
      respond: async () => new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      // 2ª query: search_path check returns 1 function
      match: (url, init) => url.includes('api.supabase.com/v1/projects') && url.includes('database/query') && init?.body?.includes('search_path='),
      respond: async () => new Response(JSON.stringify([
        { schema: 'public', function_name: 'compute_billing' },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_current_state'),
      respond: async () => new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_events') && !url.includes('?id='),
      respond: async (url, init) => {
        insertedEvent = JSON.parse(init.body);
        return new Response(JSON.stringify([{ id: 'event-uuid', ...insertedEvent }]), { status: 201, headers: { 'Content-Type': 'application/json' } });
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

test('endpoint with allowlisted table skips warn (silent skip)', async () => {
  const fetchImpl = makeFetch([
    {
      match: (url) => url.includes('audit_runs') && !url.includes('?id='),
      respond: async () => new Response(JSON.stringify([{ id: 'run-uuid' }]), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_runs') && url.includes('?id='),
      respond: async () => ({ ok: true, status: 204, text: async () => '' }),
    },
    {
      // RLS query: returns audit_events (which is allowlisted)
      match: (url, init) => url.includes('api.supabase.com/v1/projects') && url.includes('database/query') && init?.body?.includes('relrowsecurity'),
      respond: async () => new Response(JSON.stringify([
        { schema: 'public', table_name: 'audit_events' },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      // search_path query: empty
      match: (url, init) => url.includes('api.supabase.com/v1/projects') && url.includes('database/query') && init?.body?.includes('search_path='),
      respond: async () => new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
    {
      match: (url) => url.includes('audit_current_state'),
      respond: async () => new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    },
  ]);
  const res = await onRequest({ request: makeReq(), env: baseEnv, fetchImpl });
  const body = await res.json();
  assert.equal(res.status, 200);
  // audit_events está allowlisted → silent skip → 0 events
  assert.equal(body.events_count, 0);
});
