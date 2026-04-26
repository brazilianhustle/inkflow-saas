import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validarConfigPrecificacao,
  validarFewshotsPorModo,
} from '../functions/api/_validate-config-precificacao.js';

// ── validarConfigPrecificacao ──────────────────────────────────────────────

test('aceita undefined/null sem erro', () => {
  assert.deepEqual(validarConfigPrecificacao(undefined), { ok: true, cleanedCfg: undefined });
  assert.deepEqual(validarConfigPrecificacao(null), { ok: true, cleanedCfg: null });
});

test('rejeita tipo não-objeto', () => {
  const r = validarConfigPrecificacao('string');
  assert.equal(r.ok, false);
  assert.match(r.erro, /objeto JSON/);
});

test('aceita modo=faixa sem campos coleta', () => {
  const r = validarConfigPrecificacao({ modo: 'faixa', sinal_percentual: 30 });
  assert.equal(r.ok, true);
  assert.equal(r.cleanedCfg.modo, 'faixa');
});

test('aceita modo=exato sem campos coleta', () => {
  const r = validarConfigPrecificacao({ modo: 'exato' });
  assert.equal(r.ok, true);
});

test('rejeita modo=coleta quando feature flag OFF (default)', () => {
  const r = validarConfigPrecificacao({ modo: 'coleta', coleta_submode: 'puro' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /feature flag OFF/);
});

test('aceita modo=coleta + submode=puro com feature flag ON', () => {
  const r = validarConfigPrecificacao(
    { modo: 'coleta', coleta_submode: 'puro' },
    { enableColetaMode: true },
  );
  assert.equal(r.ok, true);
  assert.equal(r.cleanedCfg.coleta_submode, 'puro');
});

test('rejeita modo=coleta sem coleta_submode', () => {
  const r = validarConfigPrecificacao({ modo: 'coleta' }, { enableColetaMode: true });
  assert.equal(r.ok, false);
  assert.match(r.erro, /coleta_submode obrigatório/);
});

test('rejeita coleta_submode inválido', () => {
  const r = validarConfigPrecificacao(
    { modo: 'coleta', coleta_submode: 'xxx' },
    { enableColetaMode: true },
  );
  assert.equal(r.ok, false);
  assert.match(r.erro, /coleta_submode deve ser/);
});

test('aceita submode=reentrada com trigger_handoff válido', () => {
  const r = validarConfigPrecificacao(
    { modo: 'coleta', coleta_submode: 'reentrada', trigger_handoff: 'Lina, assume' },
    { enableColetaMode: true },
  );
  assert.equal(r.ok, true);
  assert.equal(r.cleanedCfg.trigger_handoff, 'Lina, assume');
});

test('rejeita submode=reentrada sem trigger_handoff', () => {
  const r = validarConfigPrecificacao(
    { modo: 'coleta', coleta_submode: 'reentrada' },
    { enableColetaMode: true },
  );
  assert.equal(r.ok, false);
  assert.match(r.erro, /trigger_handoff deve ser string/);
});

test('rejeita trigger_handoff curto (< 2 chars)', () => {
  const r = validarConfigPrecificacao(
    { modo: 'coleta', coleta_submode: 'reentrada', trigger_handoff: 'x' },
    { enableColetaMode: true },
  );
  assert.equal(r.ok, false);
});

test('rejeita trigger_handoff longo (> 50 chars)', () => {
  const r = validarConfigPrecificacao(
    { modo: 'coleta', coleta_submode: 'reentrada', trigger_handoff: 'x'.repeat(51) },
    { enableColetaMode: true },
  );
  assert.equal(r.ok, false);
});

test('limpa campos coleta quando modo muda pra faixa', () => {
  const r = validarConfigPrecificacao({
    modo: 'faixa',
    coleta_submode: 'reentrada',
    trigger_handoff: 'Lina, assume',
  });
  assert.equal(r.ok, true);
  assert.equal(r.cleanedCfg.coleta_submode, undefined);
  assert.equal(r.cleanedCfg.trigger_handoff, undefined);
});

test('limpa trigger_handoff quando submode=puro', () => {
  const r = validarConfigPrecificacao(
    { modo: 'coleta', coleta_submode: 'puro', trigger_handoff: 'lixo' },
    { enableColetaMode: true },
  );
  assert.equal(r.ok, true);
  assert.equal(r.cleanedCfg.coleta_submode, 'puro');
  assert.equal(r.cleanedCfg.trigger_handoff, undefined);
});

// ── validarFewshotsPorModo ─────────────────────────────────────────────────

test('fewshots: aceita undefined/null', () => {
  assert.deepEqual(validarFewshotsPorModo(undefined), { ok: true });
  assert.deepEqual(validarFewshotsPorModo(null), { ok: true });
});

test('fewshots: rejeita array', () => {
  const r = validarFewshotsPorModo([]);
  assert.equal(r.ok, false);
});

test('fewshots: aceita objeto vazio', () => {
  assert.deepEqual(validarFewshotsPorModo({}), { ok: true });
});

test('fewshots: aceita as 4 keys com arrays', () => {
  const r = validarFewshotsPorModo({
    faixa: [],
    exato: [],
    coleta_info: [{ cliente: 'oi', agente: 'oii' }],
    coleta_agendamento: [],
  });
  assert.equal(r.ok, true);
});

test('fewshots: rejeita key com não-array', () => {
  const r = validarFewshotsPorModo({ faixa: 'oops' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /faixa deve ser array/);
});
