import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/approvals/decide.js';

// Mock environment + helpers
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const ADMIN_EMAIL = 'lmf4200@gmail.com';

function makeRequest({ method = 'POST', authHeader, body }) {
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;
  return new Request('https://example.com/api/approvals/decide', {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeContext({ request, fetchMock, env = {} }) {
  globalThis.fetch = fetchMock;
  return {
    request,
    env: {
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      ...env,
    },
  };
}

test('returns 405 on GET', async () => {
  const req = makeRequest({ method: 'GET' });
  const ctx = makeContext({ request: req, fetchMock: async () => ({ ok: true }) });
  const res = await onRequest(ctx);
  assert.equal(res.status, 405);
});

test('returns 401 without Authorization header', async () => {
  const req = makeRequest({ body: { id: 'abc', action: 'approve' } });
  const ctx = makeContext({ request: req, fetchMock: async () => ({ ok: true }) });
  const res = await onRequest(ctx);
  assert.equal(res.status, 401);
});

test('returns 401 when JWT user email does not match ADMIN_EMAIL', async () => {
  const req = makeRequest({
    authHeader: 'Bearer fake-jwt',
    body: { id: 'abc', action: 'approve' },
  });
  const ctx = makeContext({
    request: req,
    fetchMock: async (url) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, json: async () => ({ email: 'random@example.com' }) };
      }
      return { ok: true };
    },
  });
  const res = await onRequest(ctx);
  assert.equal(res.status, 401);
});

test('returns 400 on invalid action', async () => {
  const req = makeRequest({
    authHeader: 'Bearer admin-jwt',
    body: { id: 'some-uuid', action: 'maybe' },
  });
  const ctx = makeContext({
    request: req,
    fetchMock: async (url) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, json: async () => ({ email: ADMIN_EMAIL }) };
      }
      return { ok: true };
    },
  });
  const res = await onRequest(ctx);
  assert.equal(res.status, 400);
});

test('returns 400 on missing id', async () => {
  const req = makeRequest({
    authHeader: 'Bearer admin-jwt',
    body: { action: 'approve' },
  });
  const ctx = makeContext({
    request: req,
    fetchMock: async (url) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, json: async () => ({ email: ADMIN_EMAIL }) };
      }
      return { ok: true };
    },
  });
  const res = await onRequest(ctx);
  assert.equal(res.status, 400);
});

test('returns 200 + approved row on successful approve', async () => {
  const req = makeRequest({
    authHeader: 'Bearer admin-jwt',
    body: { id: 'fake-uuid', action: 'approve', notes: 'looks good' },
  });
  let patchedBody = null;
  const ctx = makeContext({
    request: req,
    fetchMock: async (url, opts) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, json: async () => ({ email: ADMIN_EMAIL }) };
      }
      if (url.includes('/rest/v1/approvals') && opts?.method === 'PATCH') {
        patchedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ([{
            id: 'fake-uuid',
            status: 'approved',
            approved_at: '2026-04-26T12:00:00Z',
            approved_by: ADMIN_EMAIL,
            notes: 'looks good',
          }]),
        };
      }
      return { ok: true };
    },
  });
  const res = await onRequest(ctx);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'approved');
  assert.equal(data.approved_by, ADMIN_EMAIL);
  assert.equal(patchedBody.status, 'approved');
  assert.equal(patchedBody.notes, 'looks good');
});

test('returns 409 when row already decided (PATCH returns empty array)', async () => {
  const req = makeRequest({
    authHeader: 'Bearer admin-jwt',
    body: { id: 'fake-uuid', action: 'approve' },
  });
  let capturedUrl = null;
  const ctx = makeContext({
    request: req,
    fetchMock: async (url, opts) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, json: async () => ({ email: ADMIN_EMAIL }) };
      }
      if (url.includes('/rest/v1/approvals') && opts?.method === 'PATCH') {
        capturedUrl = url;
        return { ok: true, status: 200, json: async () => ([]) };  // 0 rows updated → conflict
      }
      return { ok: true };
    },
  });
  const res = await onRequest(ctx);
  assert.equal(res.status, 409);
  assert.match(capturedUrl, /status=eq\.pending/);  // pinpoints atomic guard against double-decide race
});

test('returns 200 + rejected status on action=reject', async () => {
  const req = makeRequest({
    authHeader: 'Bearer admin-jwt',
    body: { id: 'fake-uuid', action: 'reject', notes: 'too risky' },
  });
  let patchedBody = null;
  const ctx = makeContext({
    request: req,
    fetchMock: async (url, opts) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, json: async () => ({ email: ADMIN_EMAIL }) };
      }
      if (url.includes('/rest/v1/approvals') && opts?.method === 'PATCH') {
        patchedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'fake-uuid', status: 'rejected', approved_by: ADMIN_EMAIL, notes: 'too risky' }]),
        };
      }
      return { ok: true };
    },
  });
  const res = await onRequest(ctx);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'rejected');
  assert.equal(patchedBody.status, 'rejected');
});
