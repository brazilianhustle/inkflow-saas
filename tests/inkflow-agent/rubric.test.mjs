import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { scoreNaturalidade, scoreManifesto, scoreState, computePass } from '../../evals/inkflow-agent/_harness/rubric.mjs';

test('scoreNaturalidade media simples de n1..n5', () => {
  const r = scoreNaturalidade({ n1_wpp_br: 5, n2_robot_tells: 4, n3_tom_consistente: 5, n4_comprimento: 4, n5_pontuacao: 5 });
  assert.equal(r.media, 4.6);
});

test('scoreManifesto agrega per_principle ignorando null', () => {
  const r = scoreManifesto({
    per_principle: { P1: 1.0, P2: 1.0, P3: null, P4: 0.5, P5: 1.0, P6: null },
    m2_validacao_substantiva: 1, m3_multi_balao_apropriado: 1,
  });
  assert.equal(r.m1_manifesto_adherence.toFixed(2), '0.88');
  assert.equal(r.m2, 1);
  assert.equal(r.m3, 1);
});

test('scoreState retorna binario', () => {
  assert.equal(scoreState({ s1_state_transition_ok: 1 }).s1, 1);
  assert.equal(scoreState({ s1_state_transition_ok: 0 }).s1, 0);
});

test('computePass aplica thresholds defaults', () => {
  const r = computePass({
    naturalidade: { media: 4.2 },
    manifesto: { m1_manifesto_adherence: 0.9, m2: 1, m3: 1 },
    state: { s1: 1 },
    funcionalidade: 0.9,
  });
  assert.equal(r.pass, true);
  assert.deepEqual(r.fails, []);
});

test('computePass detecta naturalidade abaixo de threshold', () => {
  const r = computePass({
    naturalidade: { media: 3.5 },
    manifesto: { m1_manifesto_adherence: 0.9, m2: 1, m3: 1 },
    state: { s1: 1 },
    funcionalidade: 0.9,
  });
  assert.equal(r.pass, false);
  assert.ok(r.fails.includes('naturalidade'));
});

test('computePass detecta manifesto abaixo de threshold', () => {
  const r = computePass({
    naturalidade: { media: 4.5 },
    manifesto: { m1_manifesto_adherence: 0.7, m2: 1, m3: 1 },
    state: { s1: 1 },
    funcionalidade: 0.9,
  });
  assert.equal(r.pass, false);
  assert.ok(r.fails.includes('manifesto'));
});

test('computePass aceita thresholds custom', () => {
  const r = computePass({
    naturalidade: { media: 4.2 },
    manifesto: { m1_manifesto_adherence: 0.9, m2: 1, m3: 1 },
    state: { s1: 1 },
    funcionalidade: 0.9,
  }, { naturalidade_min: 4.5 });
  assert.equal(r.pass, false);
});
