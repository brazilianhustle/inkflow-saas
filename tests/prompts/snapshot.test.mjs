import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSystemPrompt } from '../../functions/_lib/prompts/index.js';
import {
  TENANT_CANONICO,
  TENANT_CANONICO_EXATO,
  CONVERSA_CANONICA,
  CONVERSA_COLETA_TATTOO,
  CONVERSA_COLETA_CADASTRO,
  CONVERSA_COLETA_PROPOSTA,
  CLIENT_CONTEXT_CANONICO,
} from './fixtures/tenant-canonico.mjs';
import { readSnapshot } from './helpers.mjs';

// Modo Coleta v2 — 3 snapshots por fase do state-machine
test('snapshot coleta-tattoo: output bate com baseline', () => {
  const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_TATTOO, CLIENT_CONTEXT_CANONICO);
  const expected = readSnapshot('coleta-tattoo');
  assert.strictEqual(out, expected,
    'Prompt Coleta-Tattoo divergiu do snapshot. Se intencional, rode scripts/update-prompt-snapshots.sh');
});

test('snapshot coleta-cadastro: output bate com baseline', () => {
  const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_CADASTRO, CLIENT_CONTEXT_CANONICO);
  const expected = readSnapshot('coleta-cadastro');
  assert.strictEqual(out, expected,
    'Prompt Coleta-Cadastro divergiu do snapshot. Se intencional, rode scripts/update-prompt-snapshots.sh');
});

test('snapshot coleta-proposta: output bate com baseline', () => {
  const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_PROPOSTA, CLIENT_CONTEXT_CANONICO);
  const expected = readSnapshot('coleta-proposta');
  assert.strictEqual(out, expected,
    'Prompt Coleta-Proposta divergiu do snapshot. Se intencional, rode scripts/update-prompt-snapshots.sh');
});

// Modo Exato — beta secundario, mesma fixture/conversa simples
test('snapshot exato: output bate com baseline', () => {
  const out = generateSystemPrompt(TENANT_CANONICO_EXATO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
  const expected = readSnapshot('exato');
  assert.strictEqual(out, expected,
    'Prompt Exato divergiu do snapshot. Se intencional, rode scripts/update-prompt-snapshots.sh');
});
