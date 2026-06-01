#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';

const DEFAULT_SOURCE_NAME = 'provider-roundtrip-source.json';

const REQUIRED_MILESTONES = Object.freeze([
  'fake-client-inbound',
  'bot-whatsapp-response',
  'telegram-quote-request',
  'artist-quote-reply',
  'client-quote-response',
  'rollback-disable-check',
]);

const ALLOWED_ORIGINS = Object.freeze({
  'fake-client-inbound': new Set(['whatsapp-client-observation', 'provider-operational-log']),
  'bot-whatsapp-response': new Set(['whatsapp-client-observation', 'provider-operational-log']),
  'telegram-quote-request': new Set(['telegram-artist-observation', 'provider-operational-log']),
  'artist-quote-reply': new Set(['telegram-artist-observation', 'provider-operational-log']),
  'client-quote-response': new Set(['whatsapp-client-observation', 'provider-operational-log']),
  'rollback-disable-check': new Set(['operator-rollback-check', 'provider-operational-log']),
});

export function parseArgs(argv = []) {
  const args = Array.from(argv);
  const errors = [];
  let evidenceDir = '';
  let sourcePath = '';

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--evidence-dir') {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) {
        errors.push(error('argv', 'evidence_dir_arg_required'));
        continue;
      }
      evidenceDir = next;
      index += 1;
      continue;
    }
    if (arg === '--source') {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) {
        errors.push(error('argv', 'source_arg_required'));
        continue;
      }
      sourcePath = next;
      index += 1;
      continue;
    }
    errors.push(error('argv', `unknown_arg:${arg}`));
  }

  if (evidenceDir && !isSafeSmokeEvidenceDir(evidenceDir)) {
    errors.push(error('argv', 'invalid_smoke_evidence_dir'));
  }

  sourcePath = sourcePath || (evidenceDir ? `${evidenceDir}/${DEFAULT_SOURCE_NAME}` : '');

  if (sourcePath && !isSafeSmokeEvidenceJsonPath(sourcePath)) {
    errors.push(error('argv', 'invalid_provider_roundtrip_source_path'));
  }
  if (evidenceDir && sourcePath && !sourcePath.startsWith(`${evidenceDir}/`)) {
    errors.push(error('argv', 'source_must_be_inside_evidence_dir'));
  }

  return freeze({
    ok: errors.length === 0,
    evidenceDir,
    sourcePath,
    errors,
  });
}

export function reviewProviderRoundtripSource({
  argv = [],
  cwd = process.cwd(),
} = {}) {
  const parsed = parseArgs(argv);
  const errors = [...parsed.errors];
  if (!parsed.ok) return result({ parsed, errors });
  if (!parsed.sourcePath) return result({ parsed, errors });

  const source = readJsonSafe({ cwd, path: parsed.sourcePath });
  if (!source.ok) {
    errors.push(error('source', 'provider_roundtrip_source_unreadable'));
    return result({ parsed, errors });
  }

  errors.push(...validateSource(source.value).errors);

  return result({
    parsed,
    errors,
    sourceLoaded: true,
    directEvidenceReady: errors.length === 0,
  });
}

function validateSource(source = {}) {
  const errors = [];

  if (source.ok !== true) errors.push(error('source.ok', 'source_ok_true_required'));
  if (source.operator_confirmation !== 'redacted_provider_roundtrip_observed') {
    errors.push(error('source.operator_confirmation', 'redacted_provider_roundtrip_observed_required'));
  }
  if (source.raw_values_included !== false) errors.push(error('source.raw_values_included', 'raw_values_must_be_false'));
  if (source.secrets_included !== false) errors.push(error('source.secrets_included', 'secrets_must_be_false'));
  if (!/^fake_quote_ref_[a-z0-9_-]+$/i.test(String(source.quote_request_ref || ''))) {
    errors.push(error('source.quote_request_ref', 'fake_quote_ref_required'));
  }
  if (!isSafeTimestamp(source.observed_at)) errors.push(error('source.observed_at', 'safe_timestamp_required'));
  if (looksUnsafe(source)) errors.push(error('source', 'unsafe_provider_roundtrip_source_content'));

  const sourceReview = source.source_review || {};
  if (sourceReview.real_whatsapp_telegram_roundtrip !== true) {
    errors.push(error('source.source_review.real_whatsapp_telegram_roundtrip', 'real_roundtrip_confirmation_required'));
  }
  if (sourceReview.direct_evidence_only !== true) {
    errors.push(error('source.source_review.direct_evidence_only', 'direct_evidence_only_required'));
  }
  if (sourceReview.documentation_only === true) {
    errors.push(error('source.source_review.documentation_only', 'documentation_only_forbidden'));
  }

  const milestones = source.milestones && typeof source.milestones === 'object' ? source.milestones : {};
  for (const milestone of REQUIRED_MILESTONES) {
    const item = normalizeMilestone(milestones[milestone]);
    if (!item.proof) errors.push(error(`source.milestones.${milestone}.proof`, 'milestone_proof_required'));
    if (!item.evidence_origin) errors.push(error(`source.milestones.${milestone}.evidence_origin`, 'milestone_evidence_origin_required'));
    if (item.evidence_origin && !ALLOWED_ORIGINS[milestone].has(item.evidence_origin)) {
      errors.push(error(`source.milestones.${milestone}.evidence_origin`, 'milestone_evidence_origin_invalid'));
    }
    if (!isSafeTimestamp(item.observed_at || source.observed_at)) {
      errors.push(error(`source.milestones.${milestone}.observed_at`, 'safe_timestamp_required'));
    }
    if (!item.evidence_path) errors.push(error(`source.milestones.${milestone}.evidence_path`, 'milestone_evidence_path_required'));
    if (item.evidence_path && !isSafeSmokeEvidenceArtifactPath(item.evidence_path)) {
      errors.push(error(`source.milestones.${milestone}.evidence_path`, 'milestone_evidence_path_invalid'));
    }
  }

  return freeze({ ok: errors.length === 0, errors });
}

function normalizeMilestone(value) {
  if (typeof value === 'string') {
    return {
      proof: normalizeProof(value),
      observed_at: '',
      evidence_origin: '',
      evidence_path: '',
    };
  }
  const item = value && typeof value === 'object' ? value : {};
  return {
    proof: normalizeProof(item.proof),
    observed_at: String(item.observed_at || ''),
    evidence_origin: String(item.evidence_origin || ''),
    evidence_path: String(item.evidence_path || ''),
  };
}

function readJsonSafe({ cwd, path }) {
  try {
    const target = resolveInsideCwd(cwd, path);
    return freeze({ ok: true, value: JSON.parse(readFileSync(target, 'utf8')) });
  } catch {
    return freeze({ ok: false, value: null });
  }
}

function resolveInsideCwd(cwd, path) {
  const root = resolve(cwd);
  const target = resolve(cwd, path);
  if (!target.startsWith(`${root}${sep}`)) throw new Error('path_escape');
  return target;
}

function result({
  parsed,
  errors,
  sourceLoaded = false,
  directEvidenceReady = false,
}) {
  return freeze({
    ok: errors.length === 0,
    mode: 'provider-staging-review-roundtrip-source',
    evidence_dir: parsed.evidenceDir,
    source_path: parsed.sourcePath,
    source_loaded: sourceLoaded,
    direct_evidence_ready: directEvidenceReady,
    provider_staging_smoke_executed: false,
    provider_staging_smoke_evidence_captured: false,
    connects_to_provider: false,
    executable_provider_commands: false,
    next_checkpoint: !parsed.sourcePath
      ? 'provide_smoke_evidence_dir_or_provider_roundtrip_source'
      : errors.length === 0
      ? 'build_provider_roundtrip_package_from_reviewed_source'
      : 'fix_provider_roundtrip_source_with_direct_redacted_evidence',
    errors,
  });
}

function printResult(resultValue) {
  if (!resultValue.ok) {
    console.error('Provider staging roundtrip source review failed.');
    console.error(inspect(resultValue.errors, { depth: null, colors: false }));
    return 1;
  }
  console.log(resultValue.direct_evidence_ready
    ? 'Provider staging roundtrip source reviewed and ready for package build.'
    : 'Provider staging roundtrip source review is blocked until a redacted source is provided.');
  console.log(JSON.stringify({
    mode: resultValue.mode,
    evidence_dir: resultValue.evidence_dir,
    source_path: resultValue.source_path,
    source_loaded: resultValue.source_loaded,
    direct_evidence_ready: resultValue.direct_evidence_ready,
    provider_staging_smoke_executed: resultValue.provider_staging_smoke_executed,
    provider_staging_smoke_evidence_captured: resultValue.provider_staging_smoke_evidence_captured,
    connects_to_provider: resultValue.connects_to_provider,
    executable_provider_commands: resultValue.executable_provider_commands,
    next_checkpoint: resultValue.next_checkpoint,
  }, null, 2));
  return 0;
}

function normalizeProof(value = '') {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (text.length < 24 || looksUnsafe(text)) return '';
  return text.slice(0, 240);
}

function isSafeTimestamp(value = '') {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(String(value || ''));
}

function isSafeSmokeEvidenceDir(value = '') {
  const text = String(value || '');
  return /^\.smoke-evidence\/[a-z0-9._-]+$/i.test(text)
    && !text.includes('..')
    && !text.includes('\\');
}

function isSafeSmokeEvidenceJsonPath(value = '') {
  const text = String(value || '');
  return /^\.smoke-evidence\/[a-z0-9._/-]+\.json$/i.test(text)
    && !text.includes('..')
    && !isAbsolute(text)
    && !text.includes('\\');
}

function isSafeSmokeEvidenceArtifactPath(value = '') {
  const text = String(value || '');
  return /^\.smoke-evidence\/[a-z0-9._/-]+\.(?:md|txt|log|json)$/i.test(text)
    && !text.includes('..')
    && !isAbsolute(text)
    && !text.includes('\\');
}

function looksUnsafe(value = '') {
  const text = (typeof value === 'string' ? value : JSON.stringify(value))
    .replace(/"secrets_included"\s*:\s*false/gi, '')
    .replace(/"raw_values_included"\s*:\s*false/gi, '')
    .replaceAll('PROVIDER_PRODUCTION_EXECUTION_AUTHORIZED=false', '')
    .replaceAll('PROVIDER_SECRET_SYNC_AUTHORIZED=false', '')
    .replaceAll('PROVIDER_WEBHOOK_UPDATE_AUTHORIZED=false', '')
    .replaceAll('DEPLOY_EXECUTION_AUTHORIZED=false', '')
    .replaceAll('BILLING_ACTIVATION_AUTHORIZED=false', '')
    .replaceAll('CUSTOMER_DATA_MIGRATION_AUTHORIZED=false', '');
  return /https?:\/\/|token|secret|password|api[_-]?key|service[_-]?role|access[_-]?token|refresh[_-]?token|bot[_-]?token|webhook|runtime_handle_|secret_binding_id|secbind_|eyJ|inkflowbrasil\.com|official|production|real_customer|live_customer|\b55\d{10,13}\b/i
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
  const resultValue = reviewProviderRoundtripSource({
    argv: process.argv.slice(2),
  });
  process.exitCode = printResult(resultValue);
}
