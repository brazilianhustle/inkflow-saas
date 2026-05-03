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
import { CONTRACT_COLETA_TATTOO } from './contracts/coleta-tattoo.mjs';
import { CONTRACT_COLETA_CADASTRO } from './contracts/coleta-cadastro.mjs';
import { CONTRACT_COLETA_PROPOSTA } from './contracts/coleta-proposta.mjs';
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

test('contract Coleta-Tattoo: must_contain + must_not_contain + max_tokens', () => {
  const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_TATTOO, CLIENT_CONTEXT_CANONICO);
  checkContract('coleta-tattoo', out, CONTRACT_COLETA_TATTOO);
});

test('contract Coleta-Cadastro: must_contain + must_not_contain + max_tokens', () => {
  const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_CADASTRO, CLIENT_CONTEXT_CANONICO);
  checkContract('coleta-cadastro', out, CONTRACT_COLETA_CADASTRO);
});

test('contract Coleta-Proposta: must_contain + must_not_contain + max_tokens', () => {
  const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_PROPOSTA, CLIENT_CONTEXT_CANONICO);
  checkContract('coleta-proposta', out, CONTRACT_COLETA_PROPOSTA);
});

test('contract Exato: must_contain + must_not_contain + max_tokens', () => {
  const out = generateSystemPrompt(TENANT_CANONICO_EXATO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
  checkContract('exato', out, CONTRACT_EXATO);
});
