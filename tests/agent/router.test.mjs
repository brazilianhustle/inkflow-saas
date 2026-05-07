// Tests pro router — dispatch por estado_atual.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectAgentBuilder, isStateImplemented } from '../../functions/api/agent/router.js';

test('selectAgentBuilder retorna builder pra estado=tattoo', () => {
  const builder = selectAgentBuilder('tattoo');
  assert.equal(typeof builder, 'function');
});

test('selectAgentBuilder retorna null pra estados nao-implementados (Sub-2/3)', () => {
  assert.equal(selectAgentBuilder('cadastro'), null);
  assert.equal(selectAgentBuilder('proposta'), null);
  assert.equal(selectAgentBuilder('portfolio'), null);
});

test('isStateImplemented true pra tattoo, false pros outros', () => {
  assert.equal(isStateImplemented('tattoo'), true);
  assert.equal(isStateImplemented('cadastro'), false);
  assert.equal(isStateImplemented('proposta'), false);
  assert.equal(isStateImplemented('portfolio'), false);
  assert.equal(isStateImplemented('estado-inexistente'), false);
});
