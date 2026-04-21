import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateTrialEnd, moveToMailerLiteGroup } from '../functions/_lib/trial-helpers.js';

test('calculateTrialEnd returns ISO string 7 days in the future', () => {
  const now = new Date('2026-04-21T12:00:00.000Z');
  const end = calculateTrialEnd(now);
  assert.equal(end, '2026-04-28T12:00:00.000Z');
});

test('calculateTrialEnd defaults to current time if no arg', () => {
  const end = calculateTrialEnd();
  const delta = new Date(end).getTime() - Date.now();
  const expected = 7 * 24 * 60 * 60 * 1000;
  assert.ok(Math.abs(delta - expected) < 5000, 'should be ~7 days ahead');
});

test('moveToMailerLiteGroup unassigns from old and assigns to new', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, method: opts?.method || 'GET' });
    return { ok: true, json: async () => ({}) };
  };
  const env = { MAILERLITE_API_KEY: 'k' };
  const res = await moveToMailerLiteGroup(env, 'sub@test.com', { from: 'G1', to: 'G2' });

  assert.equal(res.ok, true);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /groups\/G1\/subscribers\/sub%40test\.com/);
  assert.equal(calls[0].method, 'DELETE');
  assert.match(calls[1].url, /subscribers/);
  assert.equal(calls[1].method, 'POST');
});

test('moveToMailerLiteGroup skips when MAILERLITE_API_KEY missing', async () => {
  const res = await moveToMailerLiteGroup({}, 'x@y.com', { from: 'A', to: 'B' });
  assert.equal(res.ok, false);
  assert.equal(res.skipped, true);
});
