import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveBodyLocation,
  resolveHeightCm,
  resolvePendingFormQuestion,
  resolveShortName,
  resolveTattooStyle,
} from '../../functions/_lib/conversation-policy.js';

test('ConversationPolicy: resolve nome curto por tipo, sem lista infinita de frases', () => {
  assert.deepEqual(resolveShortName('Joane').value, 'Joane');
  assert.deepEqual(resolveShortName('me chama de Paola').value, 'Paola');
  assert.deepEqual(resolveShortName('Paola aqui').value, 'Paola');
  assert.equal(resolveShortName('como funciona o orçamento?').answered, false);
  assert.equal(resolveShortName('quanto fica?').answered, false);
});

test('ConversationPolicy: resolve altura, local e estilo com confiança', () => {
  assert.deepEqual(resolveHeightCm('tenho 1.60'), {
    answered: true,
    value: 160,
    confidence: 0.95,
    reason: 'meters_format',
  });
  assert.equal(resolveBodyLocation('quero fazer na bunda').value, 'glúteo');
  assert.equal(resolveBodyLocation('na virilha').value, 'virilha');
  assert.equal(resolveTattooStyle('quero fineline').value, 'fineline');
});

test('ConversationPolicy: resolve pergunta pendente usando resolver tipado', () => {
  const out = resolvePendingFormQuestion({
    mensagem: 'me chama de Paola\ncomo funciona o orçamento',
    historico: [
      { role: 'assistant', content: 'Pra montar tua proposta certinho, como posso te chamar?' },
    ],
  });
  assert.equal(out.pending, true);
  assert.equal(out.answered, true);
  assert.equal(out.displayName, 'Paola');
  assert.equal(out.confidence > 0.9, true);
  assert.equal(out.reason, 'explicit_name_prefix');
});
