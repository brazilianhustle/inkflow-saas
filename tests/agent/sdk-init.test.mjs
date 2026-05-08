// Smoke import + auth helper do SDK init.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getApiKey, validateEnv } from '../../functions/api/agent/_lib/sdk-init.js';

test('getApiKey retorna OPENAI_API_KEY do env', () => {
  const key = getApiKey({ OPENAI_API_KEY: 'sk-test-123' });
  assert.equal(key, 'sk-test-123');
});

test('getApiKey lanca erro quando OPENAI_API_KEY ausente', () => {
  assert.throws(
    () => getApiKey({}),
    /OPENAI_API_KEY/
  );
});

test('validateEnv retorna ok=true quando todas as vars presentes', () => {
  const result = validateEnv({ OPENAI_API_KEY: 'sk-x' });
  assert.equal(result.ok, true);
});

test('validateEnv retorna ok=false + missing[] quando faltam vars', () => {
  const result = validateEnv({});
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['OPENAI_API_KEY']);
});
