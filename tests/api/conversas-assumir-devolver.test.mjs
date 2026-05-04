import { test } from 'node:test';
import assert from 'node:assert/strict';

test('applyTransition — pause de estado coletando_tattoo → pausada_tatuador, salva anterior=coletando_tattoo', async () => {
  const { applyTransition } = await import('../../functions/api/conversas/_transition.js');
  const r = applyTransition({ estado_atual: 'coletando_tattoo', action: 'pause' });
  assert.equal(r.action, 'apply');
  assert.equal(r.new_state, 'pausada_tatuador');
  assert.equal(r.estado_agente_anterior, 'coletando_tattoo');
  assert.ok(r.pausada_em);
});

test('applyTransition — pause de estado já pausada_tatuador → noop (idempotente)', async () => {
  const { applyTransition } = await import('../../functions/api/conversas/_transition.js');
  const r = applyTransition({ estado_atual: 'pausada_tatuador', action: 'pause' });
  assert.equal(r.action, 'noop');
});

test('applyTransition — resume com estado_agente_anterior preservado → restore preciso', async () => {
  const { applyTransition } = await import('../../functions/api/conversas/_transition.js');
  const r = applyTransition({ estado_atual: 'pausada_tatuador', action: 'resume', estado_agente_anterior: 'aguardando_tatuador' });
  assert.equal(r.action, 'apply');
  assert.equal(r.new_state, 'aguardando_tatuador');
  assert.equal(r.estado_agente_anterior, null);
  assert.equal(r.pausada_em, null);
});

test('applyTransition — resume sem anterior → fallback ativo', async () => {
  const { applyTransition } = await import('../../functions/api/conversas/_transition.js');
  const r = applyTransition({ estado_atual: 'pausada_tatuador', action: 'resume', estado_agente_anterior: null });
  assert.equal(r.action, 'apply');
  assert.equal(r.new_state, 'ativo');
});

test('applyTransition — resume mas estado não estava pausado → noop', async () => {
  const { applyTransition } = await import('../../functions/api/conversas/_transition.js');
  const r = applyTransition({ estado_atual: 'ativo', action: 'resume' });
  assert.equal(r.action, 'noop');
});
