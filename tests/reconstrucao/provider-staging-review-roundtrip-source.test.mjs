import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  parseArgs,
  reviewProviderRoundtripSource,
} from '../../scripts/reconstrucao/provider-staging-review-roundtrip-source.mjs';

test('review roundtrip source without args stays blocked without failing', () => {
  const parsed = parseArgs([]);
  const result = reviewProviderRoundtripSource();

  assert.equal(parsed.ok, true);
  assert.equal(result.ok, true);
  assert.equal(result.source_loaded, false);
  assert.equal(result.direct_evidence_ready, false);
  assert.equal(result.next_checkpoint, 'provide_smoke_evidence_dir_or_provider_roundtrip_source');
});

test('review roundtrip source blocks missing source file', () => {
  const cwd = mkdtemp();
  mkdirSync(join(cwd, '.smoke-evidence', 'run_missing'), { recursive: true });

  const result = reviewProviderRoundtripSource({
    argv: ['--evidence-dir', '.smoke-evidence/run_missing'],
    cwd,
  });

  assert.equal(result.ok, false);
  assert.equal(result.source_loaded, false);
  assert.ok(result.errors.some((item) => item.code === 'provider_roundtrip_source_unreadable'));
});

test('review roundtrip source blocks documentation-only source', () => {
  const cwd = mkdtemp();
  const evidenceDir = join(cwd, '.smoke-evidence', 'run_docs_only');
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, 'provider-roundtrip-source.json'), JSON.stringify({
    ...validSource(),
    source_review: {
      real_whatsapp_telegram_roundtrip: true,
      direct_evidence_only: false,
      documentation_only: true,
    },
  }, null, 2));

  const result = reviewProviderRoundtripSource({
    argv: ['--evidence-dir', '.smoke-evidence/run_docs_only'],
    cwd,
  });

  assert.equal(result.ok, false);
  assert.equal(result.source_loaded, true);
  assert.ok(result.errors.some((item) => item.code === 'direct_evidence_only_required'));
  assert.ok(result.errors.some((item) => item.code === 'documentation_only_forbidden'));
});

test('review roundtrip source blocks string milestones without direct evidence origin', () => {
  const cwd = mkdtemp();
  const evidenceDir = join(cwd, '.smoke-evidence', 'run_string_milestones');
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, 'provider-roundtrip-source.json'), JSON.stringify({
    ...validSource(),
    milestones: {
      'fake-client-inbound': 'client inbound redacted proof captured',
      'bot-whatsapp-response': 'bot response redacted proof captured',
      'telegram-quote-request': 'telegram request redacted proof captured',
      'artist-quote-reply': 'artist reply redacted proof captured',
      'client-quote-response': 'client quote response redacted proof captured',
      'rollback-disable-check': 'rollback disable redacted proof passed',
    },
  }, null, 2));

  const result = reviewProviderRoundtripSource({
    argv: ['--evidence-dir', '.smoke-evidence/run_string_milestones'],
    cwd,
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === 'milestone_evidence_origin_required'));
  assert.ok(result.errors.some((item) => item.code === 'milestone_evidence_path_required'));
});

test('review roundtrip source blocks unsafe values', () => {
  const cwd = mkdtemp();
  const evidenceDir = join(cwd, '.smoke-evidence', 'run_unsafe');
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, 'provider-roundtrip-source.json'), JSON.stringify({
    ...validSource(),
    milestones: {
      ...validSource().milestones,
      'fake-client-inbound': {
        ...validSource().milestones['fake-client-inbound'],
        proof: 'client inbound redacted proof captured for 5521970789797',
      },
    },
  }, null, 2));

  const result = reviewProviderRoundtripSource({
    argv: ['--evidence-dir', '.smoke-evidence/run_unsafe'],
    cwd,
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === 'unsafe_provider_roundtrip_source_content'));
});

test('review roundtrip source accepts complete direct redacted evidence', () => {
  const cwd = mkdtemp();
  const evidenceDir = join(cwd, '.smoke-evidence', 'run_complete');
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, 'provider-roundtrip-source.json'), JSON.stringify(validSource(), null, 2));

  const result = reviewProviderRoundtripSource({
    argv: ['--evidence-dir', '.smoke-evidence/run_complete'],
    cwd,
  });

  assert.equal(result.ok, true);
  assert.equal(result.source_loaded, true);
  assert.equal(result.direct_evidence_ready, true);
  assert.equal(result.next_checkpoint, 'build_provider_roundtrip_package_from_reviewed_source');
  assert.equal(result.connects_to_provider, false);
});

function validSource() {
  return {
    ok: true,
    operator_confirmation: 'redacted_provider_roundtrip_observed',
    raw_values_included: false,
    secrets_included: false,
    source_review: {
      real_whatsapp_telegram_roundtrip: true,
      direct_evidence_only: true,
      documentation_only: false,
    },
    quote_request_ref: 'fake_quote_ref_review_test',
    observed_at: '2026-06-01T10:00:00.000Z',
    milestones: {
      'fake-client-inbound': milestone('client inbound redacted proof captured', 'whatsapp-client-observation', 'redacted-whatsapp-client.txt'),
      'bot-whatsapp-response': milestone('bot response redacted proof captured', 'whatsapp-client-observation', 'redacted-whatsapp-client.txt'),
      'telegram-quote-request': milestone('telegram quote request redacted proof captured', 'telegram-artist-observation', 'redacted-telegram-artist.txt'),
      'artist-quote-reply': milestone('artist quote reply redacted proof captured', 'telegram-artist-observation', 'redacted-telegram-artist.txt'),
      'client-quote-response': milestone('final client quote response redacted proof captured', 'whatsapp-client-observation', 'redacted-whatsapp-client.txt'),
      'rollback-disable-check': milestone('rollback disable redacted proof passed', 'operator-rollback-check', 'redacted-rollback-check.txt'),
    },
  };
}

function milestone(proof, evidenceOrigin, fileName) {
  return {
    proof,
    evidence_origin: evidenceOrigin,
    evidence_path: `.smoke-evidence/run_complete/${fileName}`,
    observed_at: '2026-06-01T10:00:00.000Z',
  };
}

function mkdtemp() {
  return mkdtempSync(join(tmpdir(), 'inkflow-roundtrip-review-'));
}
