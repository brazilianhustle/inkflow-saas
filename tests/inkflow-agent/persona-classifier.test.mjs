// persona-classifier.test.mjs — unit tests da lib pura. Mocka fetch Anthropic.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { classifyConversation, buildClassifierPrompt } from '../../functions/_lib/inkflow-agent/persona-classifier.js';

function mockAnthropic(jsonOut) {
  return async () => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({ content: [{ type: 'text', text: JSON.stringify(jsonOut) }] }),
  });
}

function mockAnthropicRaw(rawText) {
  return async () => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({ content: [{ type: 'text', text: rawText }] }),
  });
}

const SAMPLE_TRANSCRIPT = [
  { turn_index: 1, role: 'user', content: 'oi queria uma rosa pequena de 25cm' },
  { turn_index: 2, role: 'agent', content: 'Oii, tu tem foto de referencia desse desenho?' },
];

test('buildClassifierPrompt inclui transcript renderizado e lista de personas', () => {
  const prompt = buildClassifierPrompt(SAMPLE_TRANSCRIPT);
  assert.match(prompt, /turn 1.*user/);
  assert.match(prompt, /rosa pequena de 25cm/);
  assert.match(prompt, /PER-010 contraditorio/);
});

test('classifyConversation retorna persona quando confianca >= 0.6', async () => {
  const fetchImpl = mockAnthropic({ persona_id: 'PER-010', confianca: 0.82, razao: 'rosa pequena de 25cm e contradicao' });
  const result = await classifyConversation({
    transcript: SAMPLE_TRANSCRIPT,
    env: { ANTHROPIC_API_KEY: 'sk-test' },
    fetchImpl,
  });
  assert.equal(result.persona_id, 'PER-010');
  assert.equal(result.confianca, 0.82);
});

test('classifyConversation retorna null quando confianca < 0.6', async () => {
  const fetchImpl = mockAnthropic({ persona_id: 'PER-010', confianca: 0.4, razao: 'ambiguo' });
  const result = await classifyConversation({
    transcript: SAMPLE_TRANSCRIPT,
    env: { ANTHROPIC_API_KEY: 'sk-test' },
    fetchImpl,
  });
  assert.equal(result, null);
});

test('classifyConversation retorna null em conversa sem turns do agent', async () => {
  const onlyUser = [{ turn_index: 1, role: 'user', content: 'oi' }];
  const fetchImpl = mockAnthropic({ persona_id: 'PER-001', confianca: 0.9, razao: 'x' });
  const result = await classifyConversation({
    transcript: onlyUser,
    env: { ANTHROPIC_API_KEY: 'sk-test' },
    fetchImpl,
  });
  assert.equal(result, null);
});

test('classifyConversation parse JSON mesmo com markdown wrapper', async () => {
  const wrapped = '```json\n{"persona_id":"PER-001","confianca":0.75,"razao":"x"}\n```';
  const fetchImpl = mockAnthropicRaw(wrapped);
  const result = await classifyConversation({
    transcript: SAMPLE_TRANSCRIPT,
    env: { ANTHROPIC_API_KEY: 'sk-test' },
    fetchImpl,
  });
  assert.equal(result.persona_id, 'PER-001');
});

test('classifyConversation rejeita persona_id fora da taxonomia', async () => {
  const fetchImpl = mockAnthropic({ persona_id: 'PER-999', confianca: 0.9, razao: 'invalido' });
  const result = await classifyConversation({
    transcript: SAMPLE_TRANSCRIPT,
    env: { ANTHROPIC_API_KEY: 'sk-test' },
    fetchImpl,
  });
  assert.equal(result, null);
});

test('classifyConversation tolera Anthropic 5xx (retorna null)', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => 'fail', json: async () => ({}) });
  const result = await classifyConversation({
    transcript: SAMPLE_TRANSCRIPT,
    env: { ANTHROPIC_API_KEY: 'sk-test' },
    fetchImpl,
  });
  assert.equal(result, null);
});
