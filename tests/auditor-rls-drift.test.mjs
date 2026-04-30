// tests/auditor-rls-drift.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../functions/_lib/auditors/rls-drift.js';

test('detect is exported as async function', () => {
  assert.equal(typeof detect, 'function');
});

test('detect with empty schemaState returns empty array', async () => {
  const events = await detect({
    env: {},
    schemaState: { tables_no_rls: [], functions_no_search_path: [] },
    now: Date.now(),
  });
  assert.deepEqual(events, []);
});
