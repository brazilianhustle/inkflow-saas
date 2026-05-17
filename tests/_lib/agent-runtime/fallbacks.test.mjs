import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackOutput, FALLBACK_MESSAGE } from '../../../functions/_lib/agent-runtime/fallbacks.js';

test('buildFallbackOutput: retorna shape compativel com TattooOutput pergunta', () => {
  const out = buildFallbackOutput('tattoo');
  assert.equal(out.proxima_acao, 'pergunta');
  assert.equal(out.resposta_cliente, FALLBACK_MESSAGE);
  assert.equal(out.dados_completos, false);
  assert.ok(Array.isArray(out.campos_faltando));
  assert.ok(Array.isArray(out.campos_conflitantes));
  assert.equal(out.payload_portfolio, null);
});

test('FALLBACK_MESSAGE: nao expoe stack/error interno', () => {
  assert.ok(typeof FALLBACK_MESSAGE === 'string');
  assert.ok(FALLBACK_MESSAGE.length > 0);
  assert.ok(!/error|exception|stack|null|undefined/i.test(FALLBACK_MESSAGE));
});
