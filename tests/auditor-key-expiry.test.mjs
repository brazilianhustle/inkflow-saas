import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../functions/_lib/auditors/key-expiry.js';

test('detect is exported as async function', () => {
  assert.equal(typeof detect, 'function');
});

test('detect with empty env returns empty array', async () => {
  const events = await detect({ env: {}, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
  assert.deepEqual(events, []);
});

// Layer 1 — TTL ─────────────────────────────────────────────────────────────

const NOW = new Date('2026-04-27T12:00:00Z').getTime();
const noopFetch = async () => ({ ok: true, json: async () => ({}) });

function envWithTTL(daysFromNow) {
  const expiresAt = new Date(NOW + daysFromNow * 24 * 3600 * 1000).toISOString();
  return { CLOUDFLARE_API_TOKEN_EXPIRES_AT: expiresAt };
}

test('layer1: TTL > 14d → clean event (or no event)', async () => {
  const events = await detect({ env: envWithTTL(20), fetchImpl: noopFetch, now: NOW });
  const ttlEvents = events.filter((e) => e.payload?.layer === 'ttl');
  assert.ok(ttlEvents.length === 0 || ttlEvents[0].severity === 'clean',
    'Should emit no event or clean for >14d TTL');
});

test('layer1: TTL 7-14d → warn event', async () => {
  const events = await detect({ env: envWithTTL(10), fetchImpl: noopFetch, now: NOW });
  const ttl = events.find((e) => e.payload?.layer === 'ttl');
  assert.ok(ttl, 'Layer 1 event should exist');
  assert.equal(ttl.severity, 'warn');
  assert.equal(ttl.payload.secret_name, 'CLOUDFLARE_API_TOKEN');
  assert.equal(ttl.payload.days_until_expiry, 10);
});

test('layer1: TTL 1-6d → critical event', async () => {
  const events = await detect({ env: envWithTTL(5), fetchImpl: noopFetch, now: NOW });
  const ttl = events.find((e) => e.payload?.layer === 'ttl');
  assert.equal(ttl.severity, 'critical');
  assert.equal(ttl.payload.days_until_expiry, 5);
});

test('layer1: TTL <=0 → critical event', async () => {
  const events = await detect({ env: envWithTTL(-2), fetchImpl: noopFetch, now: NOW });
  const ttl = events.find((e) => e.payload?.layer === 'ttl');
  assert.equal(ttl.severity, 'critical');
  assert.ok(ttl.payload.days_until_expiry <= 0);
});

test('layer1: env missing → skip (no TTL event)', async () => {
  const events = await detect({ env: {}, fetchImpl: noopFetch, now: NOW });
  const ttl = events.find((e) => e.payload?.layer === 'ttl');
  assert.equal(ttl, undefined);
});

// Layer 2 — self-check ──────────────────────────────────────────────────────

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

const fullEnv = {
  CLOUDFLARE_API_TOKEN: 'cf-tok',
  CF_API_TOKEN: 'cf-gha-tok',
  MP_ACCESS_TOKEN: 'mp-tok',
  TELEGRAM_BOT_TOKEN: 'tg-tok',
  OPENAI_API_KEY: 'oa-key',
  PUSHOVER_APP_TOKEN: 'po-app',
  PUSHOVER_USER_KEY: 'po-user',
  SUPABASE_SERVICE_KEY: 'sb-key',
  EVO_GLOBAL_KEY: 'evo-key',
};

test('layer2: all 8 self-checks return 200 → no critical events', async () => {
  const fetchImpl = makeFetchImpl([
    ['cloudflare.com', { ok: true, status: 200, text: async () => '{"result":{"status":"active"}}' }],
    ['mercadopago.com', { ok: true, status: 200, text: async () => '{"id":1}' }],
    ['api.telegram.org', { ok: true, status: 200, text: async () => '{"ok":true}' }],
    ['api.openai.com', { ok: true, status: 200, text: async () => '{"data":[]}' }],
    ['api.pushover.net', { ok: true, status: 200, text: async () => '{"status":1}' }],
    ['supabase.co', { ok: true, status: 200, text: async () => '[]' }],
    ['evo.inkflowbrasil.com', { ok: true, status: 200, text: async () => '[]' }],
  ]);
  const events = await detect({ env: fullEnv, fetchImpl, now: NOW });
  const layer2Critical = events.filter((e) => e.payload?.layer === 'self-check' && e.severity === 'critical');
  assert.equal(layer2Critical.length, 0);
});

test('layer2: 401 from CLOUDFLARE → critical event with correct payload', async () => {
  const fetchImpl = makeFetchImpl([
    ['cloudflare.com', { ok: false, status: 401, text: async () => '{"errors":[{"code":1000}]}' }],
  ]);
  const events = await detect({ env: { CLOUDFLARE_API_TOKEN: 'invalid' }, fetchImpl, now: NOW });
  const evt = events.find((e) => e.payload?.layer === 'self-check' && e.payload?.secret_name === 'CLOUDFLARE_API_TOKEN');
  assert.ok(evt, 'Critical event for CF should exist');
  assert.equal(evt.severity, 'critical');
  assert.equal(evt.payload.suggested_subagent, 'deploy-engineer');
  assert.equal(evt.payload.runbook_path, 'docs/canonical/runbooks/secrets-expired.md');
});

test('layer2: missing env var → skip that secret silently', async () => {
  const fetchImpl = makeFetchImpl([]);
  const events = await detect({ env: {}, fetchImpl, now: NOW });
  const layer2 = events.filter((e) => e.payload?.layer === 'self-check');
  assert.equal(layer2.length, 0);
});

test('layer2: network error → warn (transient)', async () => {
  const fetchImpl = makeFetchImpl([
    ['mercadopago.com', new Error('ECONNRESET')],
  ]);
  const events = await detect({ env: { MP_ACCESS_TOKEN: 'mp-tok' }, fetchImpl, now: NOW });
  const evt = events.find((e) => e.payload?.layer === 'self-check' && e.payload?.secret_name === 'MP_ACCESS_TOKEN');
  assert.equal(evt.severity, 'warn');
  assert.match(evt.payload.summary, /transient|network|error/i);
});

test('layer2: 401 in two secrets → two critical events', async () => {
  const fetchImpl = makeFetchImpl([
    ['cloudflare.com', { ok: false, status: 401, text: async () => '{}' }],
    ['mercadopago.com', { ok: false, status: 401, text: async () => '{}' }],
  ]);
  const events = await detect({
    env: { CLOUDFLARE_API_TOKEN: 'x', MP_ACCESS_TOKEN: 'y' },
    fetchImpl, now: NOW,
  });
  const criticals = events.filter((e) => e.payload?.layer === 'self-check' && e.severity === 'critical');
  assert.equal(criticals.length, 2);
});

test('layer2: PUSHOVER without USER_KEY → skip (incomplete config)', async () => {
  const fetchImpl = makeFetchImpl([]);
  const events = await detect({
    env: { PUSHOVER_APP_TOKEN: 'po-app' },
    fetchImpl, now: NOW,
  });
  const evt = events.find((e) => e.payload?.secret_name === 'PUSHOVER_APP_TOKEN');
  assert.equal(evt, undefined);
});

test('layer2: 403 from CLOUDFLARE → critical event (same as 401)', async () => {
  const fetchImpl = makeFetchImpl([
    ['cloudflare.com', { ok: false, status: 403, text: async () => '{"errors":[{"code":1006}]}' }],
  ]);
  const events = await detect({ env: { CLOUDFLARE_API_TOKEN: 'forbidden' }, fetchImpl, now: NOW });
  const evt = events.find((e) => e.payload?.layer === 'self-check' && e.payload?.secret_name === 'CLOUDFLARE_API_TOKEN');
  assert.ok(evt, 'Critical event for 403 should exist');
  assert.equal(evt.severity, 'critical');
  assert.equal(evt.payload.status, 403);
});

test('layer2: 500 from MERCADOPAGO → warn (transient, not critical)', async () => {
  const fetchImpl = makeFetchImpl([
    ['mercadopago.com', { ok: false, status: 500, text: async () => 'Internal Server Error' }],
  ]);
  const events = await detect({ env: { MP_ACCESS_TOKEN: 'mp-tok' }, fetchImpl, now: NOW });
  const evt = events.find((e) => e.payload?.layer === 'self-check' && e.payload?.secret_name === 'MP_ACCESS_TOKEN');
  assert.ok(evt, 'Warn event for 500 should exist');
  assert.equal(evt.severity, 'warn');
  assert.equal(evt.payload.status, 500);
});

// Layer 3 — drift (opt-in) ──────────────────────────────────────────────────

const layer3Env = (extras = {}) => ({
  CLOUDFLARE_API_TOKEN: 'cf-tok',
  CLOUDFLARE_ACCOUNT_ID: 'acc-123',
  AUDIT_KEY_EXPIRY_LAYER3: 'true',
  ...extras,
});

function makeLayer3Fetch({ pagesModifiedAt, workerModifiedAt }) {
  return makeFetchImpl([
    ['/pages/projects/', {
      ok: true, status: 200,
      text: async () => JSON.stringify({ result: { latest_deployment: { modified_on: pagesModifiedAt } } }),
      json: async () => ({ result: { latest_deployment: { modified_on: pagesModifiedAt } } }),
    }],
    ['/workers/scripts/', {
      ok: true, status: 200,
      text: async () => JSON.stringify({ result: { modified_on: workerModifiedAt } }),
      json: async () => ({ result: { modified_on: workerModifiedAt } }),
    }],
    ['/user/tokens/verify', { ok: true, status: 200, text: async () => '{}' }],
  ]);
}

test('layer3: flag missing → skip (no drift event)', async () => {
  const fetchImpl = makeLayer3Fetch({
    pagesModifiedAt: '2026-04-25T10:00:00Z',
    workerModifiedAt: '2026-04-20T10:00:00Z',
  });
  const events = await detect({
    env: { CLOUDFLARE_API_TOKEN: 'x', CLOUDFLARE_ACCOUNT_ID: 'acc' },
    fetchImpl, now: NOW,
  });
  const drift = events.find((e) => e.payload?.layer === 'drift');
  assert.equal(drift, undefined);
});

test('layer3: flag on + diff < 24h → no event', async () => {
  const fetchImpl = makeLayer3Fetch({
    pagesModifiedAt: '2026-04-27T08:00:00Z',
    workerModifiedAt: '2026-04-27T06:00:00Z',
  });
  const events = await detect({ env: layer3Env(), fetchImpl, now: NOW });
  const drift = events.find((e) => e.payload?.layer === 'drift');
  assert.equal(drift, undefined);
});

test('layer3: flag on + diff > 24h → warn event', async () => {
  const fetchImpl = makeLayer3Fetch({
    pagesModifiedAt: '2026-04-27T08:00:00Z',
    workerModifiedAt: '2026-04-25T08:00:00Z',
  });
  const events = await detect({ env: layer3Env(), fetchImpl, now: NOW });
  const drift = events.find((e) => e.payload?.layer === 'drift');
  assert.ok(drift, 'Drift event should exist');
  assert.equal(drift.severity, 'warn');
  assert.match(drift.payload.summary, /drift/i);
  assert.ok(drift.payload.diff_hours);
});

test('layer3: flag on + token missing → skip silently (no crash)', async () => {
  const fetchImpl = makeLayer3Fetch({ pagesModifiedAt: 'x', workerModifiedAt: 'y' });
  const events = await detect({
    env: { AUDIT_KEY_EXPIRY_LAYER3: 'true' },
    fetchImpl, now: NOW,
  });
  const drift = events.find((e) => e.payload?.layer === 'drift');
  assert.equal(drift, undefined);
});
