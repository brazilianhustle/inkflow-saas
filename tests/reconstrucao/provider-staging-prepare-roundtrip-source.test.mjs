import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  parseArgs,
  prepareProviderRoundtripSource,
} from '../../scripts/reconstrucao/provider-staging-prepare-roundtrip-source.mjs';
import {
  reviewProviderRoundtripSource,
} from '../../scripts/reconstrucao/provider-staging-review-roundtrip-source.mjs';

test('prepare roundtrip source without run id stays blocked without failing', () => {
  const parsed = parseArgs([]);
  const result = prepareProviderRoundtripSource();

  assert.equal(parsed.ok, true);
  assert.equal(result.ok, true);
  assert.equal(result.prepared, false);
  assert.equal(result.next_checkpoint, 'provide_roundtrip_run_id');
});

test('prepare roundtrip source validates run id safety', () => {
  const parsed = parseArgs(['--run-id', '../unsafe']);

  assert.equal(parsed.ok, false);
  assert.ok(parsed.errors.some((item) => item.code === 'invalid_run_id'));
});

test('prepare roundtrip source creates blocked source and redacted artifact placeholders', () => {
  const cwd = mkdtemp();

  const result = prepareProviderRoundtripSource({
    argv: ['--run-id', 'provider-roundtrip-real-20260601'],
    cwd,
    now: () => new Date('2026-06-01T10:00:00.000Z'),
  });

  const evidenceDir = join(cwd, '.smoke-evidence', 'provider-roundtrip-real-20260601');
  const sourcePath = join(evidenceDir, 'provider-roundtrip-source.json');
  const source = JSON.parse(readFileSync(sourcePath, 'utf8'));

  assert.equal(result.ok, true);
  assert.equal(result.prepared, true);
  assert.equal(result.connects_to_provider, false);
  assert.equal(result.executable_provider_commands, false);
  assert.equal(source.ok, false);
  assert.equal(source.operator_confirmation, 'fill_after_real_whatsapp_telegram_roundtrip');
  assert.equal(source.source_review.documentation_only, true);
  assert.equal(source.quote_request_ref, 'fake_quote_ref_provider-roundtrip-real-20260601');
  assert.equal(source.milestones['fake-client-inbound'].evidence_path, '.smoke-evidence/provider-roundtrip-real-20260601/redacted-whatsapp-client.txt');
  assert.equal(source.milestones['telegram-quote-request'].evidence_path, '.smoke-evidence/provider-roundtrip-real-20260601/redacted-telegram-artist.txt');
  assert.equal(source.milestones['rollback-disable-check'].evidence_path, '.smoke-evidence/provider-roundtrip-real-20260601/redacted-rollback-check.txt');
  assert.equal(existsSync(join(evidenceDir, 'redacted-whatsapp-client.txt')), true);
  assert.equal(existsSync(join(evidenceDir, 'redacted-telegram-artist.txt')), true);
  assert.equal(existsSync(join(evidenceDir, 'redacted-rollback-check.txt')), true);
  assert.equal(existsSync(join(evidenceDir, 'operator-checklist.md')), true);
});

test('prepared source remains blocked by source reviewer until real proof fields are filled', () => {
  const cwd = mkdtemp();
  prepareProviderRoundtripSource({
    argv: ['--run-id', 'provider-roundtrip-blocked-20260601'],
    cwd,
    now: () => new Date('2026-06-01T10:00:00.000Z'),
  });

  const result = reviewProviderRoundtripSource({
    argv: ['--evidence-dir', '.smoke-evidence/provider-roundtrip-blocked-20260601'],
    cwd,
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === 'source_ok_true_required'));
  assert.ok(result.errors.some((item) => item.code === 'documentation_only_forbidden'));
});

test('prepare roundtrip source refuses overwrite unless force is explicit', () => {
  const cwd = mkdtemp();
  prepareProviderRoundtripSource({
    argv: ['--run-id', 'provider-roundtrip-existing-20260601'],
    cwd,
    now: () => new Date('2026-06-01T10:00:00.000Z'),
  });

  const blocked = prepareProviderRoundtripSource({
    argv: ['--run-id', 'provider-roundtrip-existing-20260601'],
    cwd,
  });
  const forced = prepareProviderRoundtripSource({
    argv: ['--run-id', 'provider-roundtrip-existing-20260601', '--force'],
    cwd,
    now: () => new Date('2026-06-01T11:00:00.000Z'),
  });

  assert.equal(blocked.ok, false);
  assert.ok(blocked.errors.some((item) => item.code === 'provider_roundtrip_source_already_exists'));
  assert.equal(forced.ok, true);
  assert.equal(forced.force_requested, true);
});

function mkdtemp() {
  return mkdtempSync(join(tmpdir(), 'inkflow-roundtrip-prepare-'));
}
