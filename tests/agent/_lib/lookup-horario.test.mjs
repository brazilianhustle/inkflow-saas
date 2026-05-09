// tests/agent/_lib/lookup-horario.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupHorario, isValidIso } from '../../../functions/api/agent/_lib/lookup-horario.js';

const slots = [
  { inicio: '2026-05-12T17:00:00Z', fim: '2026-05-12T20:00:00Z', legenda: 'ter 12/05 14h-17h' },
  { inicio: '2026-05-14T13:00:00Z', fim: '2026-05-14T16:00:00Z', legenda: 'qui 14/05 10h-13h' },
];

test('lookupHorario: encontra slot exato pelo par inicio/fim', () => {
  const r = lookupHorario(slots, '2026-05-12T17:00:00Z', '2026-05-12T20:00:00Z');
  assert.deepEqual(r, slots[0]);
});

test('lookupHorario: retorna null se inicio nao bate', () => {
  assert.equal(lookupHorario(slots, '2026-05-12T18:00:00Z', '2026-05-12T20:00:00Z'), null);
});

test('lookupHorario: retorna null se slots nao for array', () => {
  assert.equal(lookupHorario(null, 'x', 'y'), null);
  assert.equal(lookupHorario(undefined, 'x', 'y'), null);
});

test('lookupHorario: retorna null se lista vazia', () => {
  assert.equal(lookupHorario([], 'x', 'y'), null);
});

test('isValidIso: aceita ISO com T', () => {
  assert.equal(isValidIso('2026-05-12T17:00:00Z'), true);
  assert.equal(isValidIso('2026-05-12T17:00:00-03:00'), true);
});

test('isValidIso: rejeita string sem T', () => {
  assert.equal(isValidIso('2026-05-12 17:00:00'), false);
  assert.equal(isValidIso('2026-05-12'), false);
});

test('isValidIso: rejeita non-string e date invalido', () => {
  assert.equal(isValidIso(null), false);
  assert.equal(isValidIso(123), false);
  assert.equal(isValidIso('foo-T-bar'), false);
});
