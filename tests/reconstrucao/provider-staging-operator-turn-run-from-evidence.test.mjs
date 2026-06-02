import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildOperationalEventRecords,
  normalizeProviderRoundtripPackage,
  parseArgs,
  runProviderStagingOperatorTurnRunFromEvidence,
} from '../../scripts/reconstrucao/provider-staging-real-smoke-store-source-runtime-real-operational-adapters-operator-turn-run-from-evidence.mjs';

const executeEnv = Object.freeze({
  PROVIDER_STAGING_SMOKE_APPROVAL: 'APPROVE_PROVIDER_STAGING_SMOKE_ONLY',
  PROVIDER_STAGING_REAL_SMOKE_EXECUTION_APPROVAL: 'APPROVE_PROVIDER_STAGING_REAL_SMOKE_EXECUTION',
  PROVIDER_STAGING_STORE_SOURCE_OPERATOR_EXECUTION_APPROVAL: 'APPROVE_PROVIDER_STAGING_STORE_SOURCE_OPERATOR_EXECUTION',
  EVOLUTION_STAGING_SECRET_SOURCE: 'bitwarden_evolution_staging',
  TELEGRAM_STAGING_SECRET_SOURCE: 'bitwarden_telegram_staging',
  CLOUDFLARE_WORKER_STAGING_SECRET_SOURCE: 'cloudflare_worker_staging_bindings',
  EVOLUTION_STAGING_INSTANCE_LABEL: 'fake_staging_evolution_instance',
  TELEGRAM_STAGING_BOT_LABEL: 'fake_staging_telegram_bot',
  TELEGRAM_STAGING_CHAT_LABEL: 'fake_staging_telegram_chat',
});

test('operator turn run from evidence blocks execute without provider roundtrip package', () => {
  const parsed = parseArgs(['--execute']);

  assert.equal(parsed.ok, false);
  assert.ok(parsed.errors.some((item) => item.code === 'provider_roundtrip_package_required'));
});

test('provider roundtrip package requires all real roundtrip milestones redacted', () => {
  const normalized = normalizeProviderRoundtripPackage({
    ok: true,
    quote_request_ref: 'fake_quote_ref_missing',
    observed_at: '2026-06-01T10:00:00.000Z',
    milestones: {
      'fake-client-inbound': 'fake client inbound redacted proof',
    },
  });

  assert.equal(normalized.errors.some((item) => item.code === 'milestone_proof_required'), true);
});

test('provider roundtrip package becomes canonical provider operational events', () => {
  const normalized = normalizeProviderRoundtripPackage(validPackage());
  const records = buildOperationalEventRecords(normalized.package);

  assert.equal(normalized.errors.length, 0);
  assert.equal(records.length, 6);
  assert.equal(records.every((item) => item.record_type === 'provider_operational_event'), true);
  assert.equal(records.every((item) => item.payload.quote_request_ref === 'fake_quote_ref_operator_evidence'), true);
  assert.equal(records.every((item) => item.payload.redacted === true), true);
});

test('operator turn run from evidence writes formal evidence only from complete redacted package', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'inkflow-provider-evidence-'));
  const packageDir = join(cwd, '.smoke-evidence', 'provider-roundtrip');
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, 'provider-roundtrip.json'), JSON.stringify(validPackage(), null, 2));

  const result = await runProviderStagingOperatorTurnRunFromEvidence({
    argv: [
      '--execute',
      '--package',
      '.smoke-evidence/provider-roundtrip/provider-roundtrip.json',
      '--evidence-file',
      'docs/evidence/provider-staging/provider-roundtrip-formal.md',
    ],
    env: executeEnv,
    cwd,
    platformModules: createPlatformModulesStub(),
    now: () => new Date('2026-06-01T10:00:00.000Z'),
  });

  assert.equal(result.ok, true);
  assert.equal(result.executed, true);
  assert.equal(result.evidence_written, true);
  assert.equal(result.provider_staging_smoke_executed, true);

  const evidence = readFileSync(join(cwd, 'docs/evidence/provider-staging/provider-roundtrip-formal.md'), 'utf8');
  assert.match(evidence, /PROVIDER_STAGING_SMOKE_EXECUTED=true/);
  assert.match(evidence, /quote request reference: fake_quote_ref_transport_runner/);
  const evidenceWithoutFalseFlags = evidence
    .replaceAll('PROVIDER_SECRET_SYNC_AUTHORIZED=false', '')
    .replaceAll('PROVIDER_WEBHOOK_UPDATE_AUTHORIZED=false', '');
  assert.doesNotMatch(evidenceWithoutFalseFlags, /https?:\/\/|token|secret|password|api[_-]?key|webhook|runtime_handle_|secbind_/i);
});

function validPackage() {
  return {
    ok: true,
    quote_request_ref: 'fake_quote_ref_operator_evidence',
    observed_at: '2026-06-01T10:00:00.000Z',
    milestones: {
      'fake-client-inbound': 'fake client inbound redacted provider proof captured',
      'bot-whatsapp-response': 'bot WhatsApp response redacted provider proof captured',
      'telegram-quote-request': 'Telegram quote request redacted provider proof captured',
      'artist-quote-reply': 'artist quote reply redacted provider proof captured',
      'client-quote-response': 'final WhatsApp quote response redacted provider proof captured',
      'rollback-disable-check': 'rollback disable redacted provider proof passed',
    },
  };
}

function createPlatformModulesStub() {
  return {
    createProviderStagingRuntimeRealOperationalAdapterExecutionBindings({
      listOperationalEventRecords,
      writeEvidenceFile,
    }) {
      return {
        validate: () => ({ ok: true, errors: [] }),
        toOperationalRuntimeBindings: () => ({
          listOperationalEventRecords,
          writeEvidenceFile,
        }),
      };
    },
    async runProviderStagingStoreSourceRuntimeRealOperationalAdaptersOperatorTurnRun({
      operationalRuntimeBindings,
      evidencePath,
    }) {
      const records = await operationalRuntimeBindings.listOperationalEventRecords({
        quote_request_ref: 'fake_quote_ref_transport_runner',
      });
      operationalRuntimeBindings.writeEvidenceFile(evidencePath, [
        'PROVIDER_STAGING_SMOKE_EXECUTED=true',
        'PROVIDER_STAGING_SMOKE_EVIDENCE_CAPTURED=true',
        'PROVIDER_SECRET_SYNC_AUTHORIZED=false',
        'PROVIDER_WEBHOOK_UPDATE_AUTHORIZED=false',
        'quote request reference: fake_quote_ref_transport_runner',
        `records captured: ${records.length}`,
      ].join('\n'));
      return {
        ok: true,
        executed: true,
        evidence_written: true,
        evidence_validated: true,
        provider_staging_smoke_executed: true,
        provider_staging_smoke_evidence_captured: true,
        connects_to_provider: false,
        errors: [],
      };
    },
  };
}
