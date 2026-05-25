import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHandoffPackageTraceId } from '../../functions/_lib/handoff-package.js';

test('buildHandoffPackageTraceId: gera id curto e estavel a partir da conversa', () => {
  assert.equal(
    buildHandoffPackageTraceId({ conversa: { id: 'DB686EF2-ca42-43e4-a831-808984d8d6c6' } }),
    'hp_db686ef2ca'
  );
});

test('buildHandoffPackageTraceId: usa fallback seguro quando nao ha conversa', () => {
  assert.equal(buildHandoffPackageTraceId(), 'hp_unknown');
});
