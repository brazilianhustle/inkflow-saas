import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../functions/_lib/auditors/deploy-health.js';

test('detect is exported as async function', () => {
  assert.equal(typeof detect, 'function');
});

test('detect with empty env returns empty array', async () => {
  const events = await detect({
    env: {},
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  });
  assert.deepEqual(events, []);
});

// Sintoma A — GHA failures ──────────────────────────────────────────────────

const NOW = new Date('2026-04-29T12:00:00Z').getTime();

function makeFetchImpl(routes) {
  return async (url, opts) => {
    for (const [pattern, response] of routes) {
      if (url.includes(pattern)) {
        if (response instanceof Error) throw response;
        return response;
      }
    }
    return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
  };
}

function ghaRun({ id, conclusion, hoursAgo, name = 'Deploy to Cloudflare Pages' }) {
  return {
    id,
    name,
    path: '.github/workflows/deploy.yml',
    conclusion,
    created_at: new Date(NOW - hoursAgo * 3600 * 1000).toISOString(),
    html_url: `https://github.com/brazilianhustle/inkflow-saas/actions/runs/${id}`,
  };
}

const ghaEnv = {
  GITHUB_API_TOKEN: 'ghp_test',
};

test('symptomA: env missing GITHUB_API_TOKEN → skip silently', async () => {
  const fetchImpl = makeFetchImpl([]);
  const events = await detect({ env: {}, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'gha-failures');
  assert.equal(a, undefined);
});

test('symptomA: 0 failures in window → no event (clean)', async () => {
  const fetchImpl = makeFetchImpl([
    ['api.github.com/repos/', {
      ok: true, status: 200,
      json: async () => ({
        workflow_runs: [
          ghaRun({ id: 1, conclusion: 'success', hoursAgo: 1 }),
          ghaRun({ id: 2, conclusion: 'success', hoursAgo: 7 }),
        ],
      }),
    }],
  ]);
  const events = await detect({ env: ghaEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'gha-failures' && e.severity !== 'clean');
  assert.equal(a, undefined);
});

test('symptomA: 1 failure in 6h window → warn', async () => {
  const fetchImpl = makeFetchImpl([
    ['api.github.com/repos/', {
      ok: true, status: 200,
      json: async () => ({
        workflow_runs: [
          ghaRun({ id: 1, conclusion: 'failure', hoursAgo: 2 }),
          ghaRun({ id: 2, conclusion: 'success', hoursAgo: 8 }),
        ],
      }),
    }],
  ]);
  const events = await detect({ env: ghaEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'gha-failures');
  assert.ok(a, 'Sintoma A event should exist');
  assert.equal(a.severity, 'warn');
  assert.equal(a.payload.failed_count, 1);
  assert.equal(a.payload.suggested_subagent, 'deploy-engineer');
  assert.equal(a.payload.runbook_path, 'docs/canonical/runbooks/rollback.md');
});

test('symptomA: 2 failures in 6h window → critical', async () => {
  const fetchImpl = makeFetchImpl([
    ['api.github.com/repos/', {
      ok: true, status: 200,
      json: async () => ({
        workflow_runs: [
          ghaRun({ id: 1, conclusion: 'failure', hoursAgo: 1 }),
          ghaRun({ id: 2, conclusion: 'failure', hoursAgo: 3 }),
          ghaRun({ id: 3, conclusion: 'success', hoursAgo: 24 }),
        ],
      }),
    }],
  ]);
  const events = await detect({ env: ghaEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'gha-failures');
  assert.equal(a.severity, 'critical');
  assert.equal(a.payload.failed_count, 2);
  assert.ok(Array.isArray(a.payload.failed_runs));
  assert.equal(a.payload.failed_runs.length, 2);
});

test('symptomA: ignora runs de outros workflows (filtra por name)', async () => {
  const fetchImpl = makeFetchImpl([
    ['api.github.com/repos/', {
      ok: true, status: 200,
      json: async () => ({
        workflow_runs: [
          ghaRun({ id: 1, conclusion: 'failure', hoursAgo: 1, name: 'Lint' }),
          ghaRun({ id: 2, conclusion: 'failure', hoursAgo: 2, name: 'CI Tests' }),
        ],
      }),
    }],
  ]);
  const events = await detect({ env: ghaEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'gha-failures' && e.severity !== 'clean');
  assert.equal(a, undefined);
});

test('symptomA: ignora failures fora da janela (>6h)', async () => {
  const fetchImpl = makeFetchImpl([
    ['api.github.com/repos/', {
      ok: true, status: 200,
      json: async () => ({
        workflow_runs: [
          ghaRun({ id: 1, conclusion: 'failure', hoursAgo: 10 }),
          ghaRun({ id: 2, conclusion: 'failure', hoursAgo: 20 }),
        ],
      }),
    }],
  ]);
  const events = await detect({ env: ghaEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'gha-failures' && e.severity !== 'clean');
  assert.equal(a, undefined);
});

test('symptomA: failure → success → failure (não-consecutivo) → warn', async () => {
  const fetchImpl = makeFetchImpl([
    ['api.github.com/repos/', {
      ok: true, status: 200,
      json: async () => ({
        workflow_runs: [
          ghaRun({ id: 1, conclusion: 'failure', hoursAgo: 1 }),
          ghaRun({ id: 2, conclusion: 'success', hoursAgo: 2 }),
          ghaRun({ id: 3, conclusion: 'failure', hoursAgo: 3 }),
        ],
      }),
    }],
  ]);
  const events = await detect({ env: ghaEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'gha-failures');
  assert.equal(a.severity, 'warn', 'Não-consecutivo deve ser warn (1 falha mais recente)');
  assert.equal(a.payload.failed_count, 1);
});

test('symptomA: GHA API 500 → warn (transient HTTP error)', async () => {
  const fetchImpl = makeFetchImpl([
    ['api.github.com/repos/', { ok: false, status: 500, text: async () => 'Internal Server Error' }],
  ]);
  const events = await detect({ env: ghaEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'gha-failures');
  assert.ok(a);
  assert.equal(a.severity, 'warn');
  assert.equal(a.payload.status, 500);
  assert.match(a.payload.summary, /500/);
});

test('symptomA: network error → warn (network_error status)', async () => {
  const fetchImpl = makeFetchImpl([
    ['api.github.com/repos/', new Error('ECONNRESET')],
  ]);
  const events = await detect({ env: ghaEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'gha-failures');
  assert.ok(a);
  assert.equal(a.severity, 'warn');
  assert.equal(a.payload.status, 'network_error');
  assert.match(a.payload.summary, /transient|ECONNRESET|error/i);
});

// Sintoma B — CF Pages build failures ───────────────────────────────────────

const cfEnv = {
  CLOUDFLARE_API_TOKEN: 'cf-tok',
  CLOUDFLARE_ACCOUNT_ID: 'acc-123',
};

function pagesDeployment({ id, status, hoursAgo }) {
  return {
    id,
    created_on: new Date(NOW - hoursAgo * 3600 * 1000).toISOString(),
    latest_stage: { name: 'deploy', status },
    url: `https://${id}.inkflow-saas.pages.dev`,
  };
}

test('symptomB: env missing CLOUDFLARE_API_TOKEN → skip', async () => {
  const fetchImpl = makeFetchImpl([]);
  const events = await detect({ env: {}, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'pages-failures');
  assert.equal(b, undefined);
});

test('symptomB: env missing CLOUDFLARE_ACCOUNT_ID → skip', async () => {
  const fetchImpl = makeFetchImpl([]);
  const events = await detect({
    env: { CLOUDFLARE_API_TOKEN: 'cf' },
    fetchImpl, now: NOW,
  });
  const b = events.find((e) => e.payload?.symptom === 'pages-failures');
  assert.equal(b, undefined);
});

test('symptomB: 0 failures → clean (no warn/critical)', async () => {
  const fetchImpl = makeFetchImpl([
    ['/pages/projects/', {
      ok: true, status: 200,
      json: async () => ({
        result: [
          pagesDeployment({ id: 'a', status: 'success', hoursAgo: 1 }),
          pagesDeployment({ id: 'b', status: 'success', hoursAgo: 4 }),
        ],
      }),
    }],
  ]);
  const events = await detect({ env: cfEnv, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'pages-failures' && e.severity !== 'clean');
  assert.equal(b, undefined);
});

test('symptomB: 1 failure consecutive → warn', async () => {
  const fetchImpl = makeFetchImpl([
    ['/pages/projects/', {
      ok: true, status: 200,
      json: async () => ({
        result: [
          pagesDeployment({ id: 'a', status: 'failure', hoursAgo: 2 }),
          pagesDeployment({ id: 'b', status: 'success', hoursAgo: 8 }),
        ],
      }),
    }],
  ]);
  const events = await detect({ env: cfEnv, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'pages-failures');
  assert.ok(b);
  assert.equal(b.severity, 'warn');
  assert.equal(b.payload.failed_count, 1);
});

test('symptomB: 2 failures consecutive → critical', async () => {
  const fetchImpl = makeFetchImpl([
    ['/pages/projects/', {
      ok: true, status: 200,
      json: async () => ({
        result: [
          pagesDeployment({ id: 'a', status: 'failure', hoursAgo: 1 }),
          pagesDeployment({ id: 'b', status: 'failure', hoursAgo: 4 }),
        ],
      }),
    }],
  ]);
  const events = await detect({ env: cfEnv, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'pages-failures');
  assert.equal(b.severity, 'critical');
  assert.equal(b.payload.failed_count, 2);
});

test('symptomB: failures fora da janela ignorados', async () => {
  const fetchImpl = makeFetchImpl([
    ['/pages/projects/', {
      ok: true, status: 200,
      json: async () => ({
        result: [
          pagesDeployment({ id: 'a', status: 'failure', hoursAgo: 12 }),
        ],
      }),
    }],
  ]);
  const events = await detect({ env: cfEnv, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'pages-failures' && e.severity !== 'clean');
  assert.equal(b, undefined);
});
