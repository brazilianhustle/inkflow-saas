import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { lintPersona, lintFailure, lintAll } from '../../scripts/inkflow-agent/failure-catalog-lint.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX_DIR = path.join(__dirname, '_fixtures');

test('lintPersona aceita persona valida com dimensoes corretas', () => {
  const result = lintPersona(path.join(FIX_DIR, 'personas-valid', 'PER-999-test-valid.md'));
  assert.equal(result.errors.length, 0, JSON.stringify(result));
});

test('lintPersona rejeita dimensao com valor fora do enum', () => {
  const result = lintPersona(path.join(FIX_DIR, 'personas-invalid', 'PER-998-bad-dimension.md'));
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.some(e => /postura.*INVALID_VALUE/.test(e)));
});

test('lintPersona detecta link broken pra FM-NNNN inexistente', () => {
  const result = lintPersona(path.join(FIX_DIR, 'personas-valid', 'PER-999-test-valid.md'));
  assert.ok(result.warnings.some(w => /FM-9999/.test(w)), JSON.stringify(result));
});

test('lintAll roda contra docs/inkflow-agent/ real e nao falha', () => {
  const result = lintAll(path.resolve(__dirname, '../..', 'docs/inkflow-agent'));
  assert.ok(Array.isArray(result.personas));
  assert.ok(Array.isArray(result.failures));
});
