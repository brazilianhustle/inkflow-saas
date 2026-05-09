// tests/agent/_lib/calcular-sinal.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularValorSinal } from '../../../functions/api/agent/_lib/calcular-sinal.js';

test('calcularValorSinal: 30% de 750 = 225', () => {
  assert.equal(calcularValorSinal(750, 30), 225);
});

test('calcularValorSinal: arredonda 2 casas (1000 * 33.33% = 333.3)', () => {
  assert.equal(calcularValorSinal(1000, 33.33), 333.3);
});

test('calcularValorSinal: retorna 0 se valor invalido', () => {
  assert.equal(calcularValorSinal(0, 30), 0);
  assert.equal(calcularValorSinal(-100, 30), 0);
  assert.equal(calcularValorSinal('foo', 30), 0);
  assert.equal(calcularValorSinal(null, 30), 0);
});

test('calcularValorSinal: retorna 0 se pct invalido', () => {
  assert.equal(calcularValorSinal(750, 0), 0);
  assert.equal(calcularValorSinal(750, null), 0);
  assert.equal(calcularValorSinal(750, -10), 0);
});
