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
