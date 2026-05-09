// tests/agent/_lib/prefetch-portfolio.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefetchPortfolio } from '../../../functions/api/agent/_lib/prefetch-portfolio.js';

test('prefetchPortfolio: tenant null -> portfolio_disponivel=false', async () => {
  const r = await prefetchPortfolio({}, null);
  assert.deepEqual(r, { portfolio_disponivel: false });
});

test('prefetchPortfolio: tenant.portfolio_urls null -> portfolio_disponivel=false', async () => {
  const r = await prefetchPortfolio({}, { id: 't1', portfolio_urls: null });
  assert.deepEqual(r, { portfolio_disponivel: false });
});

test('prefetchPortfolio: tenant.portfolio_urls=[] -> portfolio_disponivel=false', async () => {
  const r = await prefetchPortfolio({}, { id: 't1', portfolio_urls: [] });
  assert.deepEqual(r, { portfolio_disponivel: false });
});

test('prefetchPortfolio: tenant.portfolio_urls=["a","b"] -> portfolio_disponivel=true', async () => {
  const r = await prefetchPortfolio({}, { id: 't1', portfolio_urls: ['a', 'b'] });
  assert.deepEqual(r, { portfolio_disponivel: true });
});
