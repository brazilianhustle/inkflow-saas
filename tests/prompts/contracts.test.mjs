// Valida cada contrato contra o prompt gerado pro modo correspondente.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSystemPrompt } from '../../functions/_lib/prompts/index.js';
import { contratoFaixa } from './contracts/faixa.js';
import { contratoExato } from './contracts/exato.js';
import {
  tenantCanonicoFaixa,
  tenantCanonicoExato,
  conversaVazia,
  clientContextPrimeiroContato,
} from './fixtures/tenant-canonico.js';
import { containsBannedToken } from './_helpers.js';

// Aproximação simples: ~4 chars por token (OpenAI BPE pt-br fica em 3-4).
// Só usamos pra teto, não pra métrica fina.
function estimarTokens(str) {
  return Math.ceil(str.length / 4);
}

function validarContrato(prompt, contrato) {
  for (const token of contrato.must_contain) {
    assert.ok(
      prompt.includes(token),
      `prompt modo ${contrato.modo} deveria conter "${token}" mas não contém`,
    );
  }
  for (const token of contrato.must_not_contain) {
    assert.ok(
      !containsBannedToken(prompt, token),
      `prompt modo ${contrato.modo} contém "${token}" mas deveria não conter`,
    );
  }
  const tokens = estimarTokens(prompt);
  assert.ok(
    tokens <= contrato.max_tokens,
    `prompt modo ${contrato.modo} excedeu max_tokens: ${tokens} > ${contrato.max_tokens}`,
  );
}

test('contrato modo faixa — tenant canônico', () => {
  const prompt = generateSystemPrompt(tenantCanonicoFaixa, conversaVazia, clientContextPrimeiroContato);
  validarContrato(prompt, contratoFaixa);
});

test('contrato modo exato — tenant canônico', () => {
  const prompt = generateSystemPrompt(tenantCanonicoExato, conversaVazia, clientContextPrimeiroContato);
  validarContrato(prompt, contratoExato);
});
