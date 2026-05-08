// Unit tests pro router.js (Sub-3.1 generaliza getNextState + selectAgentValidator).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectAgentBuilder,
  selectAgentValidator,
  isStateImplemented,
  getNextState,
} from '../../functions/api/agent/router.js';

test('selectAgentBuilder — tattoo + cadastro resolvidos, outros null', () => {
  assert.equal(typeof selectAgentBuilder('tattoo'), 'function');
  assert.equal(typeof selectAgentBuilder('cadastro'), 'function');
  assert.equal(selectAgentBuilder('proposta'), null);
  assert.equal(selectAgentBuilder('portfolio'), null);
});

test('selectAgentValidator — tattoo + cadastro resolvidos', () => {
  assert.equal(typeof selectAgentValidator('tattoo'), 'function');
  assert.equal(typeof selectAgentValidator('cadastro'), 'function');
  assert.equal(selectAgentValidator('proposta'), null);
});

test('isStateImplemented — tattoo + cadastro=true, outros=false', () => {
  assert.equal(isStateImplemented('tattoo'), true);
  assert.equal(isStateImplemented('cadastro'), true);
  assert.equal(isStateImplemented('proposta'), false);
});

test('getNextState — tattoo+handoff -> cadastro', () => {
  assert.equal(getNextState('tattoo', { proxima_acao: 'handoff' }), 'cadastro');
});

test('getNextState — tattoo+pergunta -> tattoo (stay)', () => {
  assert.equal(getNextState('tattoo', { proxima_acao: 'pergunta' }), 'tattoo');
});

test('getNextState — tattoo+erro -> tattoo (stay)', () => {
  assert.equal(getNextState('tattoo', { proxima_acao: 'erro' }), 'tattoo');
});

test('getNextState — cadastro+handoff -> aguardando_tatuador', () => {
  assert.equal(getNextState('cadastro', { proxima_acao: 'handoff' }), 'aguardando_tatuador');
});

test('getNextState — cadastro+erro -> aguardando_tatuador (trigger sai)', () => {
  assert.equal(getNextState('cadastro', { proxima_acao: 'erro' }), 'aguardando_tatuador');
});

test('getNextState — cadastro+pergunta -> cadastro (stay)', () => {
  assert.equal(getNextState('cadastro', { proxima_acao: 'pergunta' }), 'cadastro');
});

test('getNextState — out null/undefined -> stay', () => {
  assert.equal(getNextState('tattoo', null), 'tattoo');
  assert.equal(getNextState('cadastro', undefined), 'cadastro');
});
