import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildCapturedSource,
  captureProviderRoundtripWizard,
  parseArgs,
} from '../../scripts/reconstrucao/provider-staging-capture-roundtrip-wizard.mjs';
import {
  prepareProviderRoundtripSource,
} from '../../scripts/reconstrucao/provider-staging-prepare-roundtrip-source.mjs';
import {
  reviewProviderRoundtripSource,
} from '../../scripts/reconstrucao/provider-staging-review-roundtrip-source.mjs';

test('capture wizard without evidence dir stays blocked without provider traffic', async () => {
  const parsed = parseArgs([]);
  const result = await captureProviderRoundtripWizard();

  assert.equal(parsed.ok, true);
  assert.equal(result.ok, true);
  assert.equal(result.captured, false);
  assert.equal(result.connects_to_provider, false);
  assert.equal(result.executable_provider_commands, false);
  assert.equal(result.next_checkpoint, 'provide_smoke_evidence_dir');
});

test('capture wizard requires explicit write flag', async () => {
  const cwd = prepareFixture();

  const result = await captureProviderRoundtripWizard({
    argv: ['--evidence-dir', '.smoke-evidence/provider-roundtrip-wizard'],
    cwd,
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === 'write_flag_required'));
});

test('capture wizard blocks unsafe answers before writing', async () => {
  const cwd = prepareFixture();
  writeAnswers(cwd, {
    ...validAnswers(),
    proofs: {
      ...validAnswers().proofs,
      'fake-client-inbound': 'staging client inbound observed for 5521970789797',
    },
  });

  const result = await captureProviderRoundtripWizard({
    argv: [
      '--evidence-dir', '.smoke-evidence/provider-roundtrip-wizard',
      '--answers-file', '.smoke-evidence/provider-roundtrip-wizard/answers.json',
      '--write',
      '--non-interactive',
    ],
    cwd,
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === 'unsafe_roundtrip_answers_content'));
});

test('capture wizard writes reviewed redacted source and artifacts', async () => {
  const cwd = prepareFixture();
  writeAnswers(cwd, validAnswers());

  const result = await captureProviderRoundtripWizard({
    argv: [
      '--evidence-dir', '.smoke-evidence/provider-roundtrip-wizard',
      '--answers-file', '.smoke-evidence/provider-roundtrip-wizard/answers.json',
      '--write',
      '--non-interactive',
    ],
    cwd,
    now: () => new Date('2026-06-02T12:00:00.000Z'),
  });
  const review = reviewProviderRoundtripSource({
    argv: ['--evidence-dir', '.smoke-evidence/provider-roundtrip-wizard'],
    cwd,
  });
  const source = JSON.parse(readFileSync(join(cwd, '.smoke-evidence/provider-roundtrip-wizard/provider-roundtrip-source.json'), 'utf8'));

  assert.equal(result.ok, true);
  assert.equal(result.captured, true);
  assert.equal(result.provider_staging_smoke_executed, false);
  assert.equal(source.ok, true);
  assert.equal(source.operator_confirmation, 'redacted_provider_roundtrip_observed');
  assert.equal(source.source_review.documentation_only, false);
  assert.equal(review.ok, true);
  assert.equal(review.direct_evidence_ready, true);
  assert.equal(existsSync(join(cwd, '.smoke-evidence/provider-roundtrip-wizard/redacted-whatsapp-client.txt')), true);
  assert.match(
    readFileSync(join(cwd, '.smoke-evidence/provider-roundtrip-wizard/redacted-telegram-artist.txt'), 'utf8'),
    /telegram-quote-request: telegram quote request observed in staging artist chat/,
  );
});

test('buildCapturedSource requires all confirmations', () => {
  const source = {
    raw_values_included: false,
    secrets_included: false,
    quote_request_ref: 'fake_quote_ref_wizard',
  };
  const answers = validAnswers();
  answers.confirmations['artist-quote-reply'] = false;

  const result = buildCapturedSource({
    source,
    answers,
    evidenceDir: '.smoke-evidence/provider-roundtrip-wizard',
    now: () => new Date('2026-06-02T12:00:00.000Z'),
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === 'milestone_confirmation_required'));
});

function prepareFixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'inkflow-roundtrip-wizard-'));
  prepareProviderRoundtripSource({
    argv: ['--run-id', 'provider-roundtrip-wizard'],
    cwd,
    now: () => new Date('2026-06-02T10:00:00.000Z'),
  });
  return cwd;
}

function writeAnswers(cwd, answers) {
  writeFileSync(
    join(cwd, '.smoke-evidence/provider-roundtrip-wizard/answers.json'),
    JSON.stringify(answers, null, 2),
  );
}

function validAnswers() {
  return {
    observed_at: '2026-06-02T12:00:00.000Z',
    confirmations: {
      'fake-client-inbound': true,
      'bot-whatsapp-response': true,
      'telegram-quote-request': true,
      'artist-quote-reply': true,
      'client-quote-response': true,
      'rollback-disable-check': true,
    },
    proofs: {
      'fake-client-inbound': 'staging client inbound observed with fake quote reference',
      'bot-whatsapp-response': 'bot whatsapp response observed after staging inbound',
      'telegram-quote-request': 'telegram quote request observed in staging artist chat',
      'artist-quote-reply': 'artist quote reply observed in staging telegram chat',
      'client-quote-response': 'final client quote response observed in staging whatsapp',
      'rollback-disable-check': 'rollback disable check passed after staging roundtrip',
    },
  };
}
