// tests/agent/route-portfolio-orchestrator.test.mjs
// Unit do branch transversal enviar_portfolio em route.js.
// Eval real (Task 12) cobre happy path; este arquivo fecha branches !ok.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { executePortfolioIntent } from '../../functions/api/agent/route.js';

const baseEnv = { INKFLOW_TOOL_SECRET: 'sek', AGENT_INTERNAL_BASE_URL: 'http://localhost:8788' };
const baseTenant = { id: 't1' };

test('executePortfolioIntent: happy path -> urls populadas', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async (url) => {
    assert.match(url, /\/api\/tools\/enviar-portfolio$/);
    return { ok: true, status: 200, json: async () => ({ ok: true, urls: ['https://a.jpg', 'https://b.jpg'], total: 2 }) };
  });

  const r = await executePortfolioIntent(
    { resposta_cliente: 'show!', proxima_acao: 'enviar_portfolio', payload_portfolio: { estilo: 'fineline', max: null, motivo: 'pediu fineline' } },
    { env: baseEnv, tenant: baseTenant }
  );

  assert.deepEqual(r.urls_portfolio, ['https://a.jpg', 'https://b.jpg']);
});

test('executePortfolioIntent: tool !ok -> urls_portfolio vazio (degrade graceful)', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async () => ({ ok: false, status: 500, json: async () => ({ ok: false, error: 'db-error' }) }));

  const r = await executePortfolioIntent(
    { resposta_cliente: 'show!', proxima_acao: 'enviar_portfolio', payload_portfolio: { estilo: null, max: null, motivo: null } },
    { env: baseEnv, tenant: baseTenant }
  );

  assert.deepEqual(r.urls_portfolio, []);
});

test('executePortfolioIntent: portfolio_vazio (urls=[]) -> urls_portfolio vazio', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, urls: [], motivo: 'portfolio_vazio' }) }));

  const r = await executePortfolioIntent(
    { resposta_cliente: 'show!', proxima_acao: 'enviar_portfolio', payload_portfolio: { estilo: null, max: null, motivo: null } },
    { env: baseEnv, tenant: baseTenant }
  );

  assert.deepEqual(r.urls_portfolio, []);
});

test('executePortfolioIntent: usa estilo do payload_portfolio + max default 5', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  let capturedBody = null;
  globalThis.fetch = mock.fn(async (_url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ ok: true, urls: ['x'], total: 1 }) };
  });

  await executePortfolioIntent(
    { resposta_cliente: 'show!', proxima_acao: 'enviar_portfolio', payload_portfolio: { estilo: 'blackwork', max: null, motivo: null } },
    { env: baseEnv, tenant: baseTenant }
  );

  assert.equal(capturedBody.tenant_id, 't1');
  assert.equal(capturedBody.estilo, 'blackwork');
  assert.equal(capturedBody.max, 5);
});

test('executePortfolioIntent: proxima_acao != enviar_portfolio -> urls_portfolio=[]', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const fetchMock = mock.fn();
  globalThis.fetch = fetchMock;

  const r = await executePortfolioIntent(
    { resposta_cliente: 'show!', proxima_acao: 'pergunta', payload_portfolio: null },
    { env: baseEnv, tenant: baseTenant }
  );

  assert.deepEqual(r.urls_portfolio, []);
  assert.equal(fetchMock.mock.callCount(), 0);
});
