import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../functions/_lib/auditors/vps-limits.js';

test('detect is exported as async function', () => {
  assert.equal(typeof detect, 'function');
});

test('detect with no metrics returns empty array', async () => {
  const events = await detect({
    env: {},
    metrics: null,
    now: Date.now(),
  });
  assert.deepEqual(events, []);
});
