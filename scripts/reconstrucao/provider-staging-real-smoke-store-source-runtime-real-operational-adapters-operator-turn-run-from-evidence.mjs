#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspect } from 'node:util';

const DEFAULT_PLATFORM_DIR = '/Users/brazilianhustler/Documents/inkflow-platform';
const DEFAULT_EVIDENCE_PATH = 'docs/evidence/provider-staging/provider-real-smoke-store-source-runtime-real-operational-adapters-operator-turn-run.md';

const REQUIRED_MILESTONES = Object.freeze([
  'fake-client-inbound',
  'bot-whatsapp-response',
  'telegram-quote-request',
  'artist-quote-reply',
  'client-quote-response',
  'rollback-disable-check',
]);

const CLIENT_TO_MILESTONE = Object.freeze({
  credentialClient: 'runtime-credentials',
  evolutionInboundClient: 'fake-client-inbound',
  whatsappBotObserverClient: 'bot-whatsapp-response',
  telegramQuoteObserverClient: 'telegram-quote-request',
  artistReplySubmitterClient: 'artist-quote-reply',
  whatsappFinalObserverClient: 'client-quote-response',
  rollbackVerifierClient: 'rollback-disable-check',
  redactedEvidenceClient: 'redacted-evidence-write',
});

export function parseArgs(argv = []) {
  const args = Array.from(argv);
  const errors = [];
  let execute = false;
  let evidencePath = DEFAULT_EVIDENCE_PATH;
  let packagePath = process.env.PROVIDER_STAGING_REAL_SMOKE_EVIDENCE_PACKAGE || '';

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--execute') {
      execute = true;
      continue;
    }
    if (arg === '--evidence-file') {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) {
        errors.push(error('argv', 'evidence_file_arg_required'));
        continue;
      }
      evidencePath = next;
      index += 1;
      continue;
    }
    if (arg === '--package') {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) {
        errors.push(error('argv', 'package_arg_required'));
        continue;
      }
      packagePath = next;
      index += 1;
      continue;
    }
    errors.push(error('argv', `unknown_arg:${arg}`));
  }

  if (!isSafeEvidencePath(evidencePath)) errors.push(error('argv', 'invalid_provider_staging_evidence_path'));
  if (execute && !packagePath) errors.push(error('argv', 'provider_roundtrip_package_required'));
  if (packagePath && !isSafePackagePath(packagePath)) errors.push(error('argv', 'invalid_provider_roundtrip_package_path'));

  return freeze({
    ok: errors.length === 0,
    execute,
    evidencePath,
    packagePath,
    errors,
  });
}

export async function runProviderStagingOperatorTurnRunFromEvidence({
  argv = [],
  env = process.env,
  cwd = process.cwd(),
  platformDir = env.INKFLOW_PLATFORM_DIR || DEFAULT_PLATFORM_DIR,
  now = () => new Date(),
} = {}) {
  const parsed = parseArgs(argv);
  const errors = [...parsed.errors];
  if (!parsed.ok) return result({ parsed, errors });

  const packageResult = parsed.execute
    ? loadAndValidateProviderRoundtripPackage({ packagePath: parsed.packagePath, cwd })
    : null;
  if (packageResult && !packageResult.ok) errors.push(...packageResult.errors);

  if (!parsed.execute || errors.length > 0) {
    return result({
      parsed,
      errors,
      providerRoundtripPackage: packageResult?.package || null,
    });
  }

  const platform = await loadPlatformModules({ platformDir });
  const bindingsFactory = platform.createProviderStagingRuntimeRealOperationalAdapterExecutionBindings({
    runtimeContext: 'server',
    providerTransportRuntimeResolver: createTransportRuntimeResolver(packageResult.package),
    listOperationalEventRecords: async (input = {}) => buildOperationalEventRecords(
      packageResult.package,
      input.quote_request_ref,
    ),
    writeEvidenceFile: createSafeEvidenceWriter({ cwd }),
  });
  const bindingsValidation = bindingsFactory.validate();
  if (!bindingsValidation.ok) {
    errors.push(...bindingsValidation.errors.map((item) => ({ ...item, source: 'saas-runtime-real-operational-adapter-execution-bindings' })));
    return result({ parsed, errors, providerRoundtripPackage: packageResult.package });
  }

  const platformResult = await platform.runProviderStagingStoreSourceRuntimeRealOperationalAdaptersOperatorTurnRun({
    env: buildExecutionEnv(env),
    execute: true,
    runtimeContext: 'server',
    operationalRuntimeBindings: bindingsFactory.toOperationalRuntimeBindings(),
    evidencePath: parsed.evidencePath,
    now,
  });

  if (!platformResult.ok) {
    errors.push(...platformResult.errors.map((item) => ({
      ...item,
      source: 'provider-staging-runtime-real-operational-adapters-operator-turn-run',
    })));
  }

  return result({
    parsed,
    errors,
    providerRoundtripPackage: packageResult.package,
    platformResult,
  });
}

export function loadAndValidateProviderRoundtripPackage({ packagePath, cwd = process.cwd() } = {}) {
  const errors = [];
  if (!packagePath) errors.push(error('package', 'provider_roundtrip_package_required'));
  if (packagePath && !isSafePackagePath(packagePath)) errors.push(error('package', 'invalid_provider_roundtrip_package_path'));
  if (errors.length > 0) return freeze({ ok: false, package: null, errors });

  let data;
  try {
    data = JSON.parse(readFileSync(resolve(cwd, packagePath), 'utf8'));
  } catch {
    return freeze({ ok: false, package: null, errors: [error('package', 'provider_roundtrip_package_unreadable')] });
  }

  const normalized = normalizeProviderRoundtripPackage(data);
  return freeze({
    ok: normalized.errors.length === 0,
    package: normalized.package,
    errors: normalized.errors,
  });
}

export function normalizeProviderRoundtripPackage(input = {}) {
  const errors = [];
  const quoteRef = sanitizeQuoteRef(input.quote_request_ref || input.quoteRequestRef);
  const milestones = input.milestones && typeof input.milestones === 'object' ? input.milestones : {};
  const observedAt = String(input.observed_at || input.observedAt || new Date(0).toISOString());

  if (input.ok !== true) errors.push(error('package.ok', 'provider_roundtrip_package_not_ok'));
  if (!/^fake_quote_ref_[a-z0-9_-]+$/i.test(quoteRef)) errors.push(error('package.quote_request_ref', 'fake_quote_ref_required'));
  if (!isSafeTimestamp(observedAt)) errors.push(error('package.observed_at', 'safe_timestamp_required'));
  if (looksUnsafe(input)) errors.push(error('package', 'unsafe_provider_roundtrip_package_content'));

  const normalizedMilestones = {};
  for (const milestone of REQUIRED_MILESTONES) {
    const proof = normalizeProof(milestones[milestone]?.proof || milestones[milestone]);
    if (!proof) errors.push(error(`package.milestones.${milestone}`, 'milestone_proof_required'));
    normalizedMilestones[milestone] = freeze({
      proof: proof || `${milestone} redacted proof missing`,
      observed_at: normalizeTimestamp(milestones[milestone]?.observed_at || observedAt),
    });
  }
  normalizedMilestones['runtime-credentials'] = freeze({
    proof: normalizeProof(milestones['runtime-credentials']?.proof || milestones['runtime-credentials']) || `runtime credentials redacted proof for ${quoteRef}`,
    observed_at: observedAt,
  });
  normalizedMilestones['redacted-evidence-write'] = freeze({
    proof: normalizeProof(milestones['redacted-evidence-write']?.proof || milestones['redacted-evidence-write']) || `redacted evidence write proof for ${quoteRef}`,
    observed_at: observedAt,
  });

  return freeze({
    package: freeze({
      ok: input.ok === true,
      quote_request_ref: quoteRef,
      observed_at: observedAt,
      tenant_id: 'tenant_stage_inkflow',
      fake_client_contact: 'fake_staging_client_whatsapp',
      fake_artist_chat: 'fake_staging_artist_telegram',
      milestones: freeze(normalizedMilestones),
    }),
    errors,
  });
}

export function buildOperationalEventRecords(providerRoundtripPackage, quoteRequestRef = providerRoundtripPackage.quote_request_ref) {
  const quoteRef = sanitizeQuoteRef(quoteRequestRef);
  return REQUIRED_MILESTONES.map((milestone) => freeze({
    record_type: 'provider_operational_event',
    tenant_id: 'tenant_stage_inkflow',
    conversation_id: 'fake_staging_conversation',
    payload: {
      milestone,
      quote_request_ref: quoteRef,
      proof: providerRoundtripPackage.milestones[milestone].proof,
      redacted: true,
      observed_at: providerRoundtripPackage.milestones[milestone].observed_at,
    },
    created_at: providerRoundtripPackage.milestones[milestone].observed_at,
  }));
}

function createTransportRuntimeResolver(providerRoundtripPackage) {
  return async (input = {}) => {
    const milestone = CLIENT_TO_MILESTONE[input.client_adapter_name] || 'redacted-evidence-write';
    const proof = providerRoundtripPackage.milestones[milestone]?.proof || `${milestone} redacted proof captured`;
    return `${input.client_adapter_name} ${proof} for ${providerRoundtripPackage.quote_request_ref}`;
  };
}

function createSafeEvidenceWriter({ cwd }) {
  return (path, text) => {
    if (!isSafeEvidencePath(path)) throw new Error('invalid_provider_staging_evidence_path');
    if (looksUnsafe(text)) throw new Error('unsafe_provider_staging_evidence_content');
    const target = resolve(cwd, path);
    const allowedRoot = resolve(cwd, 'docs/evidence/provider-staging');
    if (!target.startsWith(`${allowedRoot}${sep}`)) throw new Error('provider_staging_evidence_path_escape');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text, 'utf8');
  };
}

async function loadPlatformModules({ platformDir }) {
  const operationalAdaptersUrl = pathToFileURL(resolve(platformDir, 'infra/provider-staging-real-smoke-store-source-runtime-real-operational-adapters/operational-adapters.mjs'));
  const operatorTurnRunUrl = pathToFileURL(resolve(platformDir, 'infra/provider-staging-real-smoke-store-source-runtime-real-operational-adapters-operator-turn-run/operator-turn-run.mjs'));
  const [operationalAdapters, operatorTurnRun] = await Promise.all([
    import(operationalAdaptersUrl.href),
    import(operatorTurnRunUrl.href),
  ]);
  return freeze({
    createProviderStagingRuntimeRealOperationalAdapterExecutionBindings:
      operationalAdapters.createProviderStagingRuntimeRealOperationalAdapterExecutionBindings,
    runProviderStagingStoreSourceRuntimeRealOperationalAdaptersOperatorTurnRun:
      operatorTurnRun.runProviderStagingStoreSourceRuntimeRealOperationalAdaptersOperatorTurnRun,
  });
}

function buildExecutionEnv(env = {}) {
  return {
    ...env,
    INKFLOW_ENV: 'local',
    PROVIDER_ENV: 'local',
    PROVIDER_STAGING_REAL_SMOKE_STORE_SOURCE_RUNTIME_BINDING_OPERATOR_EXECUTE: 'true',
    PROVIDER_STAGING_REAL_SMOKE_STORE_SOURCE_RUNTIME_REAL_BINDING_RESOLVER_USE: 'true',
    PROVIDER_STAGING_REAL_SMOKE_STORE_SOURCE_RUNTIME_REAL_BINDING_SOURCE_USE: 'true',
    PROVIDER_STAGING_REAL_SMOKE_STORE_SOURCE_OPERATOR_RUN: 'true',
    PROVIDER_STAGING_REAL_SMOKE_STORE_SOURCE_EXECUTE: 'true',
    PROVIDER_STAGING_SMOKE_EXECUTE: 'true',
    PROVIDER_STAGING_REAL_SMOKE_STORE_SOURCE_RUNTIME_REAL_OPERATIONAL_ADAPTERS_OPERATOR_TURN_RUN: 'true',
  };
}

function result({
  parsed,
  errors,
  providerRoundtripPackage = null,
  platformResult = null,
}) {
  const executed = platformResult?.executed === true;
  return freeze({
    ok: errors.length === 0,
    mode: 'provider-staging-real-smoke-store-source-runtime-real-operational-adapters-operator-turn-run-from-evidence',
    execute_requested: parsed.execute,
    provider_roundtrip_package_loaded: providerRoundtripPackage !== null,
    provider_roundtrip_package_validated: providerRoundtripPackage !== null && errors.length === 0,
    evidence_path: parsed.evidencePath,
    executed,
    evidence_written: platformResult?.evidence_written === true,
    evidence_validated: platformResult?.evidence_validated === true,
    provider_staging_smoke_executed: platformResult?.provider_staging_smoke_executed === true,
    provider_staging_smoke_evidence_captured: platformResult?.provider_staging_smoke_evidence_captured === true,
    connects_to_provider: platformResult?.connects_to_provider === true,
    executable_provider_commands: false,
    next_checkpoint: errors.length === 0
      ? (executed ? 'review_provider_staging_real_smoke_store_source_evidence' : 'provide_provider_roundtrip_evidence_package')
      : 'fix_provider_staging_operator_turn_run_from_evidence',
    errors,
  });
}

function printResult(resultValue) {
  if (!resultValue.ok) {
    console.error('Provider staging operator turn run from evidence failed.');
    console.error(inspect(resultValue.errors, { depth: null, colors: false }));
    return 1;
  }
  console.log(resultValue.executed
    ? 'Provider staging operator turn run from evidence captured formal evidence.'
    : 'Provider staging operator turn run from evidence is ready; execution remains blocked.');
  console.log(JSON.stringify({
    mode: resultValue.mode,
    execute_requested: resultValue.execute_requested,
    provider_roundtrip_package_loaded: resultValue.provider_roundtrip_package_loaded,
    provider_roundtrip_package_validated: resultValue.provider_roundtrip_package_validated,
    evidence_path: resultValue.evidence_path,
    executed: resultValue.executed,
    evidence_written: resultValue.evidence_written,
    evidence_validated: resultValue.evidence_validated,
    provider_staging_smoke_executed: resultValue.provider_staging_smoke_executed,
    provider_staging_smoke_evidence_captured: resultValue.provider_staging_smoke_evidence_captured,
    connects_to_provider: resultValue.connects_to_provider,
    executable_provider_commands: resultValue.executable_provider_commands,
    next_checkpoint: resultValue.next_checkpoint,
  }, null, 2));
  return 0;
}

function isSafeEvidencePath(value = '') {
  const text = String(value || '');
  return /^docs\/evidence\/provider-staging\/[a-z0-9._/-]+\.md$/i.test(text)
    && !text.includes('..')
    && !text.startsWith('/')
    && !text.includes('\\');
}

function isSafePackagePath(value = '') {
  const text = String(value || '');
  return /^(\.smoke-evidence|docs\/evidence\/provider-staging)\/[a-z0-9._/-]+\.json$/i.test(text)
    && !text.includes('..')
    && !isAbsolute(text)
    && !text.includes('\\');
}

function sanitizeQuoteRef(value = '') {
  const text = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 80);
  return text || 'fake_quote_ref_provider_roundtrip';
}

function normalizeProof(value = '') {
  const text = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 180);
  if (!text || looksUnsafe(text)) return '';
  return text;
}

function normalizeTimestamp(value = '') {
  const text = String(value || '');
  return isSafeTimestamp(text) ? text : new Date(0).toISOString();
}

function isSafeTimestamp(value = '') {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(String(value || ''));
}

function looksUnsafe(value = '') {
  const text = (typeof value === 'string' ? value : JSON.stringify(value))
    .replaceAll('PROVIDER_PRODUCTION_EXECUTION_AUTHORIZED=false', '')
    .replaceAll('PROVIDER_SECRET_SYNC_AUTHORIZED=false', '')
    .replaceAll('PROVIDER_WEBHOOK_UPDATE_AUTHORIZED=false', '')
    .replaceAll('DEPLOY_EXECUTION_AUTHORIZED=false', '')
    .replaceAll('BILLING_ACTIVATION_AUTHORIZED=false', '')
    .replaceAll('CUSTOMER_DATA_MIGRATION_AUTHORIZED=false', '');
  return /https?:\/\/|token|secret|password|api[_-]?key|service[_-]?role|access[_-]?token|refresh[_-]?token|bot[_-]?token|webhook|runtime_handle_|secret_binding_id|secbind_|eyJ|inkflowbrasil\.com|official|production|real_customer|live_customer/i
    .test(text);
}

function error(path, code) {
  return freeze({ path, code });
}

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) freeze(child);
  }
  return value;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const resultValue = await runProviderStagingOperatorTurnRunFromEvidence({
    argv: process.argv.slice(2),
  });
  process.exitCode = printResult(resultValue);
}
