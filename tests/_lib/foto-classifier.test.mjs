// tests/_lib/foto-classifier.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classificarFoto, KEYWORDS_LOCAL } from '../../functions/_lib/foto-classifier.js';

test('L1: agent pediu foto local E ainda nao tem → local', () => {
  assert.equal(
    classificarFoto({ tentativas_foto_local: 1, foto_local_atual: null, texto_turno: '' }),
    'local',
  );
});

test('L1 fail: agent pediu MAS foto_local ja presente → cai pra L2/L3', () => {
  // sem texto → cai pra L3 default
  assert.equal(
    classificarFoto({ tentativas_foto_local: 1, foto_local_atual: 'presente', texto_turno: '' }),
    'ref',
  );
});

test('L2: texto contem keyword body (pulso) → local', () => {
  assert.equal(
    classificarFoto({ tentativas_foto_local: 0, foto_local_atual: null, texto_turno: 'aqui o, no pulso' }),
    'local',
  );
});

test('L2: texto contem keyword body (antebraco com acento) → local', () => {
  assert.equal(
    classificarFoto({ tentativas_foto_local: 0, foto_local_atual: null, texto_turno: 'no antebraço esquerdo' }),
    'local',
  );
});

test('L2: texto contem keyword body (braco sem acento) → local', () => {
  assert.equal(
    classificarFoto({ tentativas_foto_local: 0, foto_local_atual: null, texto_turno: 'queria no braco' }),
    'local',
  );
});

test('L2 fail: texto sem keyword body ("tipo essa daqui") → L3 default ref', () => {
  assert.equal(
    classificarFoto({ tentativas_foto_local: 0, foto_local_atual: null, texto_turno: 'tipo essa daqui' }),
    'ref',
  );
});

test('L3 default: texto null → ref', () => {
  assert.equal(
    classificarFoto({ tentativas_foto_local: 0, foto_local_atual: null, texto_turno: null }),
    'ref',
  );
});

test('L3 default: texto undefined → ref', () => {
  assert.equal(
    classificarFoto({ tentativas_foto_local: 0, foto_local_atual: null, texto_turno: undefined }),
    'ref',
  );
});

test('L3 default: foto_local ja presente, sem keyword → ref', () => {
  assert.equal(
    classificarFoto({ tentativas_foto_local: 0, foto_local_atual: 'presente', texto_turno: 'tipo essa' }),
    'ref',
  );
});

test('regex KEYWORDS_LOCAL: case insensitive', () => {
  assert.ok(KEYWORDS_LOCAL.test('PULSO'));
  assert.ok(KEYWORDS_LOCAL.test('Pulso'));
});
