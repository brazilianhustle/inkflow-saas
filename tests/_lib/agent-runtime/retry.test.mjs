import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWithRetry, isRetryable } from '../../../functions/_lib/agent-runtime/retry.js';

test('runWithRetry: retorna o valor na primeira tentativa', async () => {
  const result = await runWithRetry(async () => 'ok', { maxRetries: 3, baseMs: 1 });
  assert.equal(result, 'ok');
});

test('runWithRetry: retry em 503 e converge depois de 2 falhas', async () => {
  let calls = 0;
  const fn = async () => {
    calls++;
    if (calls < 3) { const e = new Error('503'); e.status = 503; throw e; }
    return 'ok';
  };
  const result = await runWithRetry(fn, { maxRetries: 3, baseMs: 1 });
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});

test('runWithRetry: nao faz retry em 401', async () => {
  let calls = 0;
  const fn = async () => { calls++; const e = new Error('401'); e.status = 401; throw e; };
  await assert.rejects(runWithRetry(fn, { maxRetries: 3, baseMs: 1 }), /401/);
  assert.equal(calls, 1);
});

test('runWithRetry: nao faz retry em context_length_exceeded', async () => {
  let calls = 0;
  const fn = async () => { calls++; const e = new Error('too big'); e.code = 'context_length_exceeded'; throw e; };
  await assert.rejects(runWithRetry(fn, { maxRetries: 3, baseMs: 1 }), /too big/);
  assert.equal(calls, 1);
});

test('runWithRetry: respeita Retry-After em 429 (header presente)', async () => {
  let calls = 0;
  const t0 = Date.now();
  const fn = async () => {
    calls++;
    if (calls === 1) {
      const e = new Error('429'); e.status = 429;
      e.headers = { 'retry-after': '0' };
      throw e;
    }
    return 'ok';
  };
  const result = await runWithRetry(fn, { maxRetries: 1, baseMs: 1 });
  assert.equal(result, 'ok');
  assert.ok(Date.now() - t0 < 100, 'respeitou retry-after=0');
});

test('runWithRetry: estoura maxRetries e re-lanca o ultimo erro', async () => {
  let calls = 0;
  const fn = async () => { calls++; const e = new Error('flap'); e.status = 502; throw e; };
  await assert.rejects(runWithRetry(fn, { maxRetries: 2, baseMs: 1 }), /flap/);
  assert.equal(calls, 3);
});

test('isRetryable: 500/502/503/504 sao retryaveis', () => {
  for (const s of [500, 502, 503, 504]) {
    assert.equal(isRetryable({ status: s }), true, `status ${s}`);
  }
});

test('isRetryable: ECONNRESET/ETIMEDOUT/EAI_AGAIN sao retryaveis', () => {
  for (const c of ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']) {
    assert.equal(isRetryable({ code: c }), true, `code ${c}`);
  }
});

test('isRetryable: 401/403 nao sao retryaveis', () => {
  assert.equal(isRetryable({ status: 401 }), false);
  assert.equal(isRetryable({ status: 403 }), false);
});
