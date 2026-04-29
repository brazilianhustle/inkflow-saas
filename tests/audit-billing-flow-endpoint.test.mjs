// tests/audit-billing-flow-endpoint.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/cron/audit-billing-flow.js';

const baseEnv = {
  CRON_SECRET: 'test-cron-secret',
  SUPABASE_SERVICE_KEY: 'sb-key',
};

function makeRequest(authHeader = 'Bearer test-cron-secret') {
  return new Request('https://inkflowbrasil.com/api/cron/audit-billing-flow', {
    method: 'POST',
    headers: { Authorization: authHeader },
  });
}

test('endpoint: missing auth → 401', async () => {
  const res = await onRequest({ request: makeRequest('Bearer wrong'), env: baseEnv });
  assert.equal(res.status, 401);
});

test('endpoint: GET → 405', async () => {
  const req = new Request('https://inkflowbrasil.com/api/cron/audit-billing-flow', { method: 'GET' });
  const res = await onRequest({ request: req, env: baseEnv });
  assert.equal(res.status, 405);
});

test('endpoint: missing SUPABASE_SERVICE_KEY → 503', async () => {
  const env = { CRON_SECRET: 'test-cron-secret' };
  const res = await onRequest({ request: makeRequest(), env });
  assert.equal(res.status, 503);
});

test('endpoint: empty detect (no triggers) → ok=true with zero events', async () => {
  const fetchSpy = async (url, opts) => {
    const u = String(url);
    if (u.includes('audit_runs') && opts?.method === 'POST') {
      return { ok: true, status: 201, json: async () => [{ id: 'run-1' }] };
    }
    if (u.includes('audit_current_state')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (u.includes('audit_runs') && opts?.method === 'PATCH') {
      return { ok: true, status: 204, text: async () => '' };
    }
    // payment_logs empty + tenant counts 0 → no events
    return { ok: true, status: 200, json: async () => [] };
  };
  const res = await onRequest({ request: makeRequest(), env: baseEnv, fetchImpl: fetchSpy });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.events_count, 0);
});

test('endpoint: critical event detected → fire path (insert + telegram)', async () => {
  const env = {
    ...baseEnv,
    MP_ACCESS_TOKEN: 'mp',
    TELEGRAM_BOT_TOKEN: 'tg-tok',
    TELEGRAM_CHAT_ID: '999',
  };
  const calls = { events_post: 0, telegram: 0 };
  const fetchSpy = async (url, opts) => {
    const u = String(url);
    if (u.includes('audit_runs') && opts?.method === 'POST') {
      return { ok: true, status: 201, json: async () => [{ id: 'run-1' }] };
    }
    if (u.includes('audit_current_state')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (u.includes('payment_logs?')) {
      return { ok: true, status: 200, json: async () => [{ created_at: new Date(Date.now() - 30 * 3600 * 1000).toISOString() }] };
    }
    if (u.includes('tenants?select=count&plano=neq.trial&ativo=eq.true&mp_subscription_id')) {
      return { ok: true, status: 200, json: async () => [{ count: 1 }] };
    }
    if (u.includes('tenants?select=id,mp_subscription_id')) {
      return { ok: true, status: 200, json: async () => [{ id: 't1', mp_subscription_id: 'mp-1' }] };
    }
    if (u.includes('preapproval/mp-1')) {
      return { ok: true, status: 200, json: async () => ({ status: 'authorized' }) };
    }
    if (u.includes('tenants?select=count&status_pagamento=eq.trial_expirado')) {
      return { ok: true, status: 200, json: async () => [{ count: 0 }] };
    }
    if (u.includes('audit_events') && opts?.method === 'POST') {
      calls.events_post += 1;
      return { ok: true, status: 201, json: async () => [{ id: 'evt-1234-5678-9abc-def012345678' }] };
    }
    if (u.includes('api.telegram.org')) {
      calls.telegram += 1;
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    if (u.includes('audit_runs') && opts?.method === 'PATCH') {
      return { ok: true, status: 204, text: async () => '' };
    }
    return { ok: true, status: 200, json: async () => [] };
  };
  const res = await onRequest({ request: makeRequest(), env, fetchImpl: fetchSpy });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(body.actions.fire >= 1, 'fire action should fire');
  assert.equal(calls.events_post, 1, 'INSERT audit_events called once');
  assert.equal(calls.telegram, 1, 'sendTelegram called once');
});

test('endpoint: warn → critical transition → supersede path', async () => {
  const env = {
    ...baseEnv,
    MP_ACCESS_TOKEN: 'mp',
    TELEGRAM_BOT_TOKEN: 'tg-tok',
    TELEGRAM_CHAT_ID: '999',
  };
  const calls = { events_post: 0, events_patch: 0, telegram: 0 };
  const fetchSpy = async (url, opts) => {
    const u = String(url);
    if (u.includes('audit_runs') && opts?.method === 'POST') {
      return { ok: true, status: 201, json: async () => [{ id: 'run-2' }] };
    }
    if (u.includes('audit_current_state')) {
      return {
        ok: true, status: 200,
        json: async () => [{
          auditor: 'billing-flow',
          event_id: 'old-uuid-aaaa-bbbb-cccc-dddddddddddd',
          severity: 'warn',
          payload: {},
          evidence: {},
          detected_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
          last_seen_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
          last_alerted_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
          alert_count: 1,
          acknowledged_at: null,
        }],
      };
    }
    // Symptom D = critical (1 inconsistent tenant) — will supersede the warn
    if (u.includes('tenants?select=count&status_pagamento=eq.trial_expirado')) {
      return { ok: true, status: 200, json: async () => [{ count: 1 }] };
    }
    if (u.includes('tenants?select=id,email&status_pagamento=eq.trial_expirado')) {
      return { ok: true, status: 200, json: async () => [{ id: 'bad', email: 'b@t.com' }] };
    }
    if (u.includes('audit_events') && opts?.method === 'POST') {
      calls.events_post += 1;
      return { ok: true, status: 201, json: async () => [{ id: 'evt-new-1234-5678-9abc-def012345678' }] };
    }
    if (u.includes('audit_events') && opts?.method === 'PATCH') {
      calls.events_patch += 1;
      assert.match(u, /id=eq\.old-uuid-aaaa-bbbb-cccc-dddddddddddd/);
      return { ok: true, status: 204, text: async () => '' };
    }
    if (u.includes('api.telegram.org')) {
      calls.telegram += 1;
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    if (u.includes('audit_runs') && opts?.method === 'PATCH') {
      return { ok: true, status: 204, text: async () => '' };
    }
    return { ok: true, status: 200, json: async () => [] };
  };
  const res = await onRequest({ request: makeRequest(), env, fetchImpl: fetchSpy });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.actions.supersede >= 1, 'supersede action should fire');
  assert.equal(calls.events_post, 1, 'INSERT new critical event');
  assert.equal(calls.events_patch, 1, 'PATCH old event with resolved_at + superseded_by');
  assert.equal(calls.telegram, 1, 'sendTelegram called once for new critical');
});

test('endpoint: open critical → next run clean → resolve path', async () => {
  const env = {
    ...baseEnv,
    TELEGRAM_BOT_TOKEN: 'tg-tok',
    TELEGRAM_CHAT_ID: '999',
  };
  const calls = { events_patch: 0, telegram: 0 };
  const fetchSpy = async (url, opts) => {
    const u = String(url);
    if (u.includes('audit_runs') && opts?.method === 'POST') {
      return { ok: true, status: 201, json: async () => [{ id: 'run-3' }] };
    }
    if (u.includes('audit_current_state')) {
      return {
        ok: true, status: 200,
        json: async () => [{
          auditor: 'billing-flow',
          event_id: 'open-critical-1234-5678-9abc-def012345678',
          severity: 'critical',
          payload: {},
          evidence: {},
          detected_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
          last_seen_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
          last_alerted_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
          alert_count: 1,
          acknowledged_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
        }],
      };
    }
    // All checks clean
    if (u.includes('tenants?select=count&status_pagamento=eq.trial_expirado')) {
      return { ok: true, status: 200, json: async () => [{ count: 0 }] };
    }
    if (u.includes('audit_events') && opts?.method === 'PATCH') {
      calls.events_patch += 1;
      assert.match(u, /id=eq\.open-critical-1234-5678-9abc-def012345678/);
      return { ok: true, status: 204, text: async () => '' };
    }
    if (u.includes('api.telegram.org')) {
      calls.telegram += 1;
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    if (u.includes('audit_runs') && opts?.method === 'PATCH') {
      return { ok: true, status: 204, text: async () => '' };
    }
    return { ok: true, status: 200, json: async () => [] };
  };
  const res = await onRequest({ request: makeRequest(), env, fetchImpl: fetchSpy });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.actions.resolve >= 1, 'resolve action should fire');
  assert.equal(calls.events_patch, 1, 'PATCH old event with resolved_at=now, resolved_reason=next_run_clean');
  assert.equal(calls.telegram, 1, 'sendTelegram [resolved] message');
});
