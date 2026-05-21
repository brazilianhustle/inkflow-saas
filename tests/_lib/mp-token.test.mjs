import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getMpAccessToken } from '../../functions/_lib/mp-token.js';

test('getMpAccessToken: devolve o token global quando não há tenant', () => {
  assert.equal(getMpAccessToken({ MP_ACCESS_TOKEN: 'GLOBAL-tok' }), 'GLOBAL-tok');
});

test('getMpAccessToken: devolve global mesmo com tenant (MP Connect ainda não existe)', () => {
  // Hoje o tenant NÃO tem credencial própria — confirma que a costura existe
  // mas o comportamento atual é sempre global. Plano MP Connect muda este teste.
  assert.equal(getMpAccessToken({ MP_ACCESS_TOKEN: 'GLOBAL-tok' }, { id: 't1' }), 'GLOBAL-tok');
});

test('getMpAccessToken: undefined quando env não tem token', () => {
  assert.equal(getMpAccessToken({}), undefined);
});
