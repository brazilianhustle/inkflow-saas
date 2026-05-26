import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveBirthDate,
  resolveBodyLocation,
  resolveEmail,
  resolveFullName,
  resolveHeightCm,
  resolvePendingFormQuestion,
  resolveShortName,
  resolveTattooSizeCm,
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

test('ConversationPolicy: separa tamanho da tattoo de altura da pessoa', () => {
  assert.deepEqual(resolveTattooSizeCm('quero uma rosa de 5cm, tenho 1,81'), {
    answered: true,
    value: 5,
    confidence: 0.9,
    reason: 'tattoo_size_cm',
  });
  assert.equal(resolveTattooSizeCm('tenho 1,81').answered, false);
  assert.equal(resolveHeightCm('quero uma rosa de 5cm, tenho 1,81').value, 181);
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

test('ConversationPolicy: resolve cadastro por pergunta pendente tipada', () => {
  assert.equal(resolveFullName('Joao Silva').value, 'Joao Silva');
  assert.deepEqual(resolveBirthDate('nasci em 12/03/1995'), {
    answered: true,
    value: '1995-03-12',
    confidence: 0.9,
    reason: 'birthdate_br_numeric',
  });
  assert.equal(resolveEmail('meu email é JOAO@EXAMPLE.COM').value, 'joao@example.com');
  assert.deepEqual(resolveEmail('pode seguir sem email').extracted, { email: null, email_recusado: true });

  const out = resolvePendingFormQuestion({
    mensagem: 'Joao Silva\n12/03/1995\ncomo funciona o orçamento?',
    historico: [
      { role: 'assistant', content: 'Pra liberar teu orçamento, me passa nome completo e data de nascimento?' },
    ],
  });
  assert.equal(out.pending, true);
  assert.equal(out.answered, true);
  assert.deepEqual(out.extracted, {
    nome: 'Joao Silva',
    data_nascimento: '1995-03-12',
  });
});

test('ConversationPolicy: nome completo vence menção anterior a foto do local', () => {
  const out = resolvePendingFormQuestion({
    mensagem: 'Joao Silva',
    historico: [
      { role: 'assistant', content: 'Recebi a foto do local. Pra liberar teu orçamento, preciso do teu nome completo.' },
    ],
  });
  assert.equal(out.pending, true);
  assert.equal(out.answered, true);
  assert.equal(out.field, 'nome_completo');
  assert.deepEqual(out.extracted, { nome: 'Joao Silva' });
});
