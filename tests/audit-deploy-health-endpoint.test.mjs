import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/cron/audit-deploy-health.js';

const baseEnv = {
  CRON_SECRET: 'test-cron-secret',
  SUPABASE_SERVICE_KEY: 'sb-key',
};

function makeRequest(authHeader = 'Bearer test-cron-secret') {
  return new Request('https://inkflowbrasil.com/api/cron/audit-deploy-health', {
    method: 'POST',
    headers: { Authorization: authHeader },
  });
}

test('endpoint: missing auth → 401', async () => {
  const res = await onRequest({ request: makeRequest('Bearer wrong'), env: baseEnv });
  assert.equal(res.status, 401);
});

test('endpoint: GET → 405', async () => {
  const req = new Request('https://inkflowbrasil.com/api/cron/audit-deploy-health', { method: 'GET' });
  const res = await onRequest({ request: req, env: baseEnv });
  assert.equal(res.status, 405);
});

test('endpoint: missing SUPABASE_SERVICE_KEY → 503', async () => {
  const env = { CRON_SECRET: 'test-cron-secret' };
  const res = await onRequest({ request: makeRequest(), env });
  assert.equal(res.status, 503);
});

test('endpoint: empty detect (no env triggers) → ok=true with zero events', async () => {
  const env = { ...baseEnv };
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
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const res = await onRequest({ request: makeRequest(), env, fetchImpl: fetchSpy });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.events_count, 0);
});

test('endpoint: critical event detected → fire path (insert + telegram)', async () => {
  const env = {
    ...baseEnv,
    GITHUB_API_TOKEN: 'gh',
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
    if (u.includes('api.github.com/repos/') && u.includes('/actions/runs')) {
      return {
        ok: true, status: 200,
        json: async () => ({
          workflow_runs: [
            { id: 1, name: 'Deploy to Cloudflare Pages', path: '.github/workflows/deploy.yml',
              conclusion: 'failure', created_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
              html_url: 'https://x' },
            { id: 2, name: 'Deploy to Cloudflare Pages', path: '.github/workflows/deploy.yml',
              conclusion: 'failure', created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
              html_url: 'https://y' },
          ],
        }),
      };
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
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const res = await onRequest({ request: makeRequest(), env, fetchImpl: fetchSpy });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(body.actions.fire >= 1);
  assert.equal(calls.events_post, 1, 'INSERT audit_events called once');
  assert.equal(calls.telegram, 1, 'sendTelegram called once');
});

test('endpoint: warn → critical transition → supersede path (insert + PATCH old + telegram)', async () => {
  const env = {
    ...baseEnv,
    GITHUB_API_TOKEN: 'gh',
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
      // Existing OPEN warn event from a previous run
      return {
        ok: true, status: 200,
        json: async () => [{
          auditor: 'deploy-health',
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
    if (u.includes('api.github.com/repos/') && u.includes('/actions/runs')) {
      // 2 GHA failures → critical (will supersede the warn)
      return {
        ok: true, status: 200,
        json: async () => ({
          workflow_runs: [
            { id: 1, name: 'Deploy to Cloudflare Pages', conclusion: 'failure',
              created_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(), html_url: 'https://x' },
            { id: 2, name: 'Deploy to Cloudflare Pages', conclusion: 'failure',
              created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), html_url: 'https://y' },
          ],
        }),
      };
    }
    if (u.includes('audit_events') && opts?.method === 'POST') {
      calls.events_post += 1;
      return { ok: true, status: 201, json: async () => [{ id: 'evt-new-1234-5678-9abc-def012345678' }] };
    }
    if (u.includes('audit_events') && opts?.method === 'PATCH') {
      calls.events_patch += 1;
      // Verify PATCH targets the OLD event_id, not 'undefined'
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
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const res = await onRequest({ request: makeRequest(), env, fetchImpl: fetchSpy });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.actions.supersede >= 1, 'supersede action should fire');
  assert.equal(calls.events_post, 1, 'INSERT new critical event');
  assert.equal(calls.events_patch, 1, 'PATCH old event with resolved_at + superseded_by');
  assert.equal(calls.telegram, 1, 'sendTelegram called once for new critical');
});

test('endpoint: open critical → next run clean → resolve path (PATCH + telegram resolved)', async () => {
  const env = {
    ...baseEnv,
    GITHUB_API_TOKEN: 'gh',
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
          auditor: 'deploy-health',
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
    if (u.includes('api.github.com/repos/') && u.includes('/actions/runs')) {
      // No failures → clean
      return {
        ok: true, status: 200,
        json: async () => ({ workflow_runs: [] }),
      };
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
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const res = await onRequest({ request: makeRequest(), env, fetchImpl: fetchSpy });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.actions.resolve >= 1, 'resolve action should fire');
  assert.equal(calls.events_patch, 1, 'PATCH old event with resolved_at=now, resolved_reason=next_run_clean');
  assert.equal(calls.telegram, 1, 'sendTelegram [resolved] message');
});
