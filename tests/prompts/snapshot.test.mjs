import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSystemPrompt } from '../../functions/_lib/prompts/index.js';
import { TENANT_CANONICO, TENANT_CANONICO_EXATO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO } from './fixtures/tenant-canonico.mjs';
import { readSnapshot } from './helpers.mjs';

test('snapshot faixa: output bate com baseline (zero mudanca)', () => {
  const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
  const expected = readSnapshot('faixa');
  assert.strictEqual(out, expected,
    'Prompt Faixa divergiu do snapshot. Se intencional, rode scripts/update-prompt-snapshots.sh');
});

test('snapshot exato: output bate com baseline (zero mudanca)', () => {
  const out = generateSystemPrompt(TENANT_CANONICO_EXATO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
  const expected = readSnapshot('exato');
  assert.strictEqual(out, expected,
    'Prompt Exato divergiu do snapshot. Se intencional, rode scripts/update-prompt-snapshots.sh');
});
