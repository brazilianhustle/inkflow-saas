// Tests do TattooAgent pos-Caminho-C-Fase-1.
//
// buildTattooAgent foi removido. Tests de schema completos vivem em
// tests/agent/tattoo-schema.test.mjs. Tests de runtime vivem em
// tests/agent/run-tattoo-agent.test.mjs. Aqui ficam tests de smoke do
// modulo (re-exports de compat) — eventual remocao quando o codigo
// callsite dos re-exports for limpo (Fase 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TattooOutputSchema,
  runTattooAgent,
  validateTattooOutputInvariant,
} from '../../functions/api/agent/agents/tattoo.js';

test('TattooOutputSchema esta exportado (compat)', () => {
  assert.ok(TattooOutputSchema && typeof TattooOutputSchema.safeParse === 'function');
});

test('runTattooAgent esta exportado', () => {
  assert.equal(typeof runTattooAgent, 'function');
});

test('validateTattooOutputInvariant compat retorna valid:true quando shape ok', () => {
  const r = validateTattooOutputInvariant({ proxima_acao: 'pergunta' });
  assert.equal(r.valid, true);
});

test('validateTattooOutputInvariant compat retorna valid:false quando out ausente', () => {
  const r = validateTattooOutputInvariant(null);
  assert.equal(r.valid, false);
});
