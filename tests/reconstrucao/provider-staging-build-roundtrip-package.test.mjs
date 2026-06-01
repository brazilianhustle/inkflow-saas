import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildProviderRoundtripPackage,
  parseArgs,
} from '../../scripts/reconstrucao/provider-staging-build-roundtrip-package.mjs';

test('build roundtrip package without args stays blocked without failing', () => {
  const parsed = parseArgs([]);
  const result = buildProviderRoundtripPackage();

  assert.equal(parsed.ok, true);
  assert.equal(result.ok, true);
  assert.equal(result.source_loaded, false);
  assert.equal(result.package_validated, false);
  assert.equal(result.next_checkpoint, 'provide_smoke_evidence_dir');
});

test('build roundtrip package blocks missing source file', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'inkflow-roundtrip-builder-'));
  mkdirSync(join(cwd, '.smoke-evidence', 'run_1'), { recursive: true });

  const result = buildProviderRoundtripPackage({
    argv: ['--evidence-dir', '.smoke-evidence/run_1'],
    cwd,
  });

  assert.equal(result.ok, false);
  assert.equal(result.source_loaded, false);
  assert.ok(result.errors.some((item) => item.code === 'provider_roundtrip_source_unreadable'));
});

test('build roundtrip package blocks source without operator confirmation', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'inkflow-roundtrip-builder-'));
  const evidenceDir = join(cwd, '.smoke-evidence', 'run_2');
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, 'provider-roundtrip-source.json'), JSON.stringify({
    ...validSource(),
    operator_confirmation: 'not_confirmed',
  }, null, 2));

  const result = buildProviderRoundtripPackage({
    argv: ['--evidence-dir', '.smoke-evidence/run_2'],
    cwd,
  });

  assert.equal(result.ok, false);
  assert.equal(result.source_loaded, true);
  assert.ok(result.errors.some((item) => item.code === 'redacted_provider_roundtrip_observed_required'));
});

test('build roundtrip package validates complete redacted source without writing by default', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'inkflow-roundtrip-builder-'));
  const evidenceDir = join(cwd, '.smoke-evidence', 'run_3');
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, 'provider-roundtrip-source.json'), JSON.stringify(validSource(), null, 2));

  const result = buildProviderRoundtripPackage({
    argv: ['--evidence-dir', '.smoke-evidence/run_3'],
    cwd,
  });

  assert.equal(result.ok, true);
  assert.equal(result.package_validated, true);
  assert.equal(result.package_written, false);
  assert.equal(result.provider_staging_smoke_executed, false);
  assert.equal(existsSync(join(evidenceDir, 'provider-roundtrip.json')), false);
});

test('build roundtrip package writes canonical package only with --write', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'inkflow-roundtrip-builder-'));
  const evidenceDir = join(cwd, '.smoke-evidence', 'run_4');
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, 'provider-roundtrip-source.json'), JSON.stringify(validSource(), null, 2));

  const result = buildProviderRoundtripPackage({
    argv: ['--evidence-dir', '.smoke-evidence/run_4', '--write'],
    cwd,
  });

  const packageText = readFileSync(join(evidenceDir, 'provider-roundtrip.json'), 'utf8');
  const packageValue = JSON.parse(packageText);

  assert.equal(result.ok, true);
  assert.equal(result.package_written, true);
  assert.equal(packageValue.ok, true);
  assert.equal(packageValue.quote_request_ref, 'fake_quote_ref_builder_test');
  assert.equal(Object.keys(packageValue.milestones).length, 8);
  assert.doesNotMatch(packageText, /https?:\/\/|token|secret|password|api[_-]?key|webhook|runtime_handle_|secbind_/i);
});

function validSource() {
  return {
    ok: true,
    operator_confirmation: 'redacted_provider_roundtrip_observed',
    raw_values_included: false,
    secrets_included: false,
    quote_request_ref: 'fake_quote_ref_builder_test',
    observed_at: '2026-06-01T10:00:00.000Z',
    milestones: {
      'fake-client-inbound': 'fake client inbound redacted proof captured',
      'bot-whatsapp-response': 'bot WhatsApp response redacted proof captured',
      'telegram-quote-request': 'Telegram quote request redacted proof captured',
      'artist-quote-reply': 'artist quote reply redacted proof captured',
      'client-quote-response': 'final WhatsApp quote response redacted proof captured',
      'rollback-disable-check': 'rollback disable redacted proof passed',
    },
  };
}
