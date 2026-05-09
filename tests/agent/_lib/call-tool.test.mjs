// tests/agent/_lib/call-tool.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { callTool } from '../../../functions/api/agent/_lib/call-tool.js';

test('callTool: envia header X-Inkflow-Tool-Secret + body JSON', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const fetchMock = mock.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, slots: [] }),
  }));
  globalThis.fetch = fetchMock;

  const env = { INKFLOW_TOOL_SECRET: 'sek', AGENT_INTERNAL_BASE_URL: 'http://localhost:8788' };
  const r = await callTool(env, 'consultar-horarios', { tenant_id: 't1' });

  assert.equal(fetchMock.mock.callCount(), 1);
  const [url, opts] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, 'http://localhost:8788/api/tools/consultar-horarios');
  assert.equal(opts.method, 'POST');
  assert.equal(opts.headers['X-Inkflow-Tool-Secret'], 'sek');
  assert.equal(opts.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(opts.body), { tenant_id: 't1' });
  assert.equal(r.ok, true);
  assert.equal(r.status, 200);
  assert.deepEqual(r.slots, []);
});

test('callTool: retorna ok:false se INKFLOW_TOOL_SECRET ausente (sem chamar fetch)', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const fetchMock = mock.fn();
  globalThis.fetch = fetchMock;

  const r = await callTool({}, 'consultar-horarios', { tenant_id: 't1' });
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.deepEqual(r, { ok: false, status: 0, error: 'env-tool-secret-missing' });
});

test('callTool: retorna ok:false se fetch lanca', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async () => { throw new Error('econnreset'); });

  const env = { INKFLOW_TOOL_SECRET: 'sek' };
  const r = await callTool(env, 'reservar-horario', { tenant_id: 't1' });
  assert.deepEqual(r, { ok: false, status: 0, error: 'fetch-failed' });
});

test('callTool: default base URL = localhost:8788', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const fetchMock = mock.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
  globalThis.fetch = fetchMock;

  const env = { INKFLOW_TOOL_SECRET: 'sek' };
  await callTool(env, 'acionar-handoff', { tenant_id: 't1' });
  assert.equal(fetchMock.mock.calls[0].arguments[0], 'http://localhost:8788/api/tools/acionar-handoff');
});
