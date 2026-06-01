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

test('build roundtrip package init-source requires evidence dir', () => {
  const parsed = parseArgs(['--init-source']);

  assert.equal(parsed.ok, false);
  assert.ok(parsed.errors.some((item) => item.code === 'evidence_dir_required_for_init_source'));
});

test('build roundtrip package initializes editable source template only when requested', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'inkflow-roundtrip-builder-'));

  const result = buildProviderRoundtripPackage({
    argv: ['--evidence-dir', '.smoke-evidence/run_template', '--init-source'],
    cwd,
    now: () => new Date('2026-06-01T10:00:00.000Z'),
  });

  const templateText = readFileSync(
    join(cwd, '.smoke-evidence', 'run_template', 'provider-roundtrip-source.json'),
    'utf8',
  );
  const template = JSON.parse(templateText);

  assert.equal(result.ok, true);
  assert.equal(result.source_initialized, true);
  assert.equal(result.package_validated, false);
  assert.equal(result.next_checkpoint, 'fill_provider_roundtrip_source_with_redacted_real_proofs');
  assert.equal(template.ok, false);
  assert.equal(template.operator_confirmation, 'fill_after_real_whatsapp_telegram_roundtrip');
  assert.equal(template.source_review.real_whatsapp_telegram_roundtrip, false);
  assert.equal(template.source_review.direct_evidence_only, false);
  assert.equal(template.source_review.documentation_only, true);
  assert.equal(Object.keys(template.milestones).length, 6);
  assert.equal(template.milestones['fake-client-inbound'].evidence_origin, 'whatsapp-client-observation');
  assert.doesNotMatch(templateText.replaceAll('"secrets_included": false', ''), /https?:\/\/|token|secret|password|api[_-]?key|webhook|runtime_handle_|secbind_/i);
});

test('build roundtrip package does not accept raw initialized template as pass', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'inkflow-roundtrip-builder-'));

  buildProviderRoundtripPackage({
    argv: ['--evidence-dir', '.smoke-evidence/run_template_blocked', '--init-source'],
    cwd,
    now: () => new Date('2026-06-01T10:00:00.000Z'),
  });

  const result = buildProviderRoundtripPackage({
    argv: ['--evidence-dir', '.smoke-evidence/run_template_blocked'],
    cwd,
  });

  assert.equal(result.ok, false);
  assert.equal(result.source_loaded, true);
  assert.ok(result.errors.some((item) => item.code === 'source_ok_true_required'));
  assert.ok(result.errors.some((item) => item.code === 'redacted_provider_roundtrip_observed_required'));
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
