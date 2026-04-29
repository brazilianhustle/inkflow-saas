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
