import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSystemPrompt } from '../../functions/_lib/prompts/index.js';
import { TENANT_CANONICO, TENANT_CANONICO_EXATO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO } from './fixtures/tenant-canonico.mjs';
import { CONTRACT_FAIXA } from './contracts/faixa.mjs';
import { CONTRACT_EXATO } from './contracts/exato.mjs';
import { approxTokens } from './helpers.mjs';

function checkContract(name, output, contract) {
  for (const needle of contract.must_contain) {
    assert.match(output, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `[${name}] must_contain falhou: "${needle}" ausente`);
  }
  for (const forbidden of contract.must_not_contain) {
    assert.doesNotMatch(output, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `[${name}] must_not_contain falhou: "${forbidden}" presente`);
  }
  const tokens = approxTokens(output);
  assert.ok(tokens <= contract.max_tokens,
    `[${name}] max_tokens excedido: ${tokens} > ${contract.max_tokens}`);
}

test('contract Faixa: must_contain + must_not_contain + max_tokens', () => {
  const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
  checkContract('faixa', out, CONTRACT_FAIXA);
});

test('contract Exato: must_contain + must_not_contain + max_tokens', () => {
  const out = generateSystemPrompt(TENANT_CANONICO_EXATO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
  checkContract('exato', out, CONTRACT_EXATO);
});
