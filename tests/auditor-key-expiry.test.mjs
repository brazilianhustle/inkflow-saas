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
