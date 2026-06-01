#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import {
  createProviderRoundtripSourceTemplate,
} from './provider-staging-build-roundtrip-package.mjs';

const SOURCE_NAME = 'provider-roundtrip-source.json';

const ARTIFACTS = Object.freeze([
  {
    path: 'redacted-whatsapp-client.txt',
    title: 'Redacted WhatsApp client observation',
    milestones: ['fake-client-inbound', 'bot-whatsapp-response', 'client-quote-response'],
  },
  {
    path: 'redacted-telegram-artist.txt',
    title: 'Redacted Telegram artist observation',
    milestones: ['telegram-quote-request', 'artist-quote-reply'],
  },
  {
    path: 'redacted-rollback-check.txt',
    title: 'Redacted rollback disable check',
    milestones: ['rollback-disable-check'],
  },
  {
    path: 'operator-checklist.md',
    title: 'Operator checklist',
    milestones: [],
  },
]);

export function parseArgs(argv = []) {
  const args = Array.from(argv);
  const errors = [];
  let runId = '';
  let force = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--force') {
      force = true;
      continue;
    }
    if (arg === '--run-id') {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) {
        errors.push(error('argv', 'run_id_arg_required'));
        continue;
      }
      runId = next;
      index += 1;
      continue;
    }
    errors.push(error('argv', `unknown_arg:${arg}`));
  }

  if (runId && !isSafeRunId(runId)) errors.push(error('argv', 'invalid_run_id'));

  return freeze({
    ok: errors.length === 0,
    runId,
    force,
    evidenceDir: runId ? `.smoke-evidence/${runId}` : '',
    errors,
  });
}

export function prepareProviderRoundtripSource({
  argv = [],
  cwd = process.cwd(),
  now = () => new Date(),
} = {}) {
  const parsed = parseArgs(argv);
  const errors = [...parsed.errors];
  if (!parsed.ok) return result({ parsed, errors });
  if (!parsed.runId) return result({ parsed, errors });

  const evidenceDir = parsed.evidenceDir;
  const sourcePath = `${evidenceDir}/${SOURCE_NAME}`;
  const existing = existsSync(resolveInsideCwd(cwd, sourcePath));
  if (existing && !parsed.force) {
    errors.push(error('source', 'provider_roundtrip_source_already_exists'));
    return result({ parsed, errors });
  }

  const source = createPreparedSource({
    evidenceDir,
    now,
  });

  writeJsonSafe({ cwd, path: sourcePath, value: source });
  const artifacts = [];
  for (const artifact of ARTIFACTS) {
    const artifactPath = `${evidenceDir}/${artifact.path}`;
    writeTextSafe({
      cwd,
      path: artifactPath,
      text: artifact.path === 'operator-checklist.md'
        ? buildChecklist({ evidenceDir })
        : buildArtifactPlaceholder(artifact),
    });
    artifacts.push(artifactPath);
  }

  return result({
    parsed,
    errors,
    prepared: true,
    sourcePath,
    artifacts,
  });
}

function createPreparedSource({ evidenceDir, now }) {
  const source = structuredClone(createProviderRoundtripSourceTemplate({ now }));
  source.quote_request_ref = `fake_quote_ref_${evidenceDir.replace(/^\.smoke-evidence\//, '').replace(/[^a-z0-9_-]/gi, '_')}`;
  source.observed_at = now().toISOString();

  source.milestones['fake-client-inbound'].evidence_path = `${evidenceDir}/redacted-whatsapp-client.txt`;
  source.milestones['bot-whatsapp-response'].evidence_path = `${evidenceDir}/redacted-whatsapp-client.txt`;
  source.milestones['client-quote-response'].evidence_path = `${evidenceDir}/redacted-whatsapp-client.txt`;
  source.milestones['telegram-quote-request'].evidence_path = `${evidenceDir}/redacted-telegram-artist.txt`;
  source.milestones['artist-quote-reply'].evidence_path = `${evidenceDir}/redacted-telegram-artist.txt`;
  source.milestones['rollback-disable-check'].evidence_path = `${evidenceDir}/redacted-rollback-check.txt`;

  return source;
}

function buildArtifactPlaceholder(artifact) {
  return [
    artifact.title,
    '',
    'Status: pending redacted operational evidence.',
    '',
    'Fill only short proof excerpts after observing the real staging roundtrip.',
    'Do not paste credentials, full phone numbers, full customer data, raw provider payloads, or external links.',
    '',
    'Milestones covered:',
    ...artifact.milestones.map((milestone) => `- ${milestone}: pending`),
    '',
  ].join('\n');
}

function buildChecklist({ evidenceDir }) {
  return [
    '# Provider Staging Roundtrip Checklist',
    '',
    'Use this folder only for redacted staging evidence.',
    '',
    'Required order:',
    '',
    '1. Observe client inbound in WhatsApp.',
    '2. Observe bot WhatsApp response.',
    '3. Observe quote request in Telegram.',
    '4. Observe artist reply in Telegram.',
    '5. Observe final quote response in WhatsApp.',
    '6. Record rollback or disable check.',
    '7. Fill `provider-roundtrip-source.json` with redacted proofs and set review flags only after all six observations exist.',
    '8. Run `npm run provider:staging:review-roundtrip-source -- --evidence-dir ' + evidenceDir + '`.',
    '',
    'PASS is forbidden until the reviewer accepts this source.',
    '',
  ].join('\n');
}

function writeJsonSafe({ cwd, path, value }) {
  writeTextSafe({
    cwd,
    path,
    text: `${JSON.stringify(value, null, 2)}\n`,
  });
}

function writeTextSafe({ cwd, path, text }) {
  const target = resolveInsideCwd(cwd, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text, 'utf8');
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
  prepared = false,
  sourcePath = parsed.runId ? `${parsed.evidenceDir}/${SOURCE_NAME}` : '',
  artifacts = [],
}) {
  return freeze({
    ok: errors.length === 0,
    mode: 'provider-staging-prepare-roundtrip-source',
    run_id: parsed.runId,
    evidence_dir: parsed.evidenceDir,
    source_path: sourcePath,
    force_requested: parsed.force,
    prepared,
    artifacts,
    provider_staging_smoke_executed: false,
    provider_staging_smoke_evidence_captured: false,
    connects_to_provider: false,
    executable_provider_commands: false,
    next_checkpoint: !parsed.runId
      ? 'provide_roundtrip_run_id'
      : errors.length === 0
      ? 'fill_provider_roundtrip_source_with_direct_redacted_evidence'
      : 'fix_provider_roundtrip_prepare_request',
    errors,
  });
}

function printResult(resultValue) {
  if (!resultValue.ok) {
    console.error('Provider staging roundtrip source preparation failed.');
    console.error(inspect(resultValue.errors, { depth: null, colors: false }));
    return 1;
  }
  console.log(resultValue.prepared
    ? 'Provider staging roundtrip source folder prepared.'
    : 'Provider staging roundtrip source preparation is blocked until a run id is provided.');
  console.log(JSON.stringify({
    mode: resultValue.mode,
    run_id: resultValue.run_id,
    evidence_dir: resultValue.evidence_dir,
    source_path: resultValue.source_path,
    force_requested: resultValue.force_requested,
    prepared: resultValue.prepared,
    artifacts: resultValue.artifacts,
    provider_staging_smoke_executed: resultValue.provider_staging_smoke_executed,
    provider_staging_smoke_evidence_captured: resultValue.provider_staging_smoke_evidence_captured,
    connects_to_provider: resultValue.connects_to_provider,
    executable_provider_commands: resultValue.executable_provider_commands,
    next_checkpoint: resultValue.next_checkpoint,
  }, null, 2));
  return 0;
}

function isSafeRunId(value = '') {
  const text = String(value || '');
  return /^[a-z0-9][a-z0-9._-]{2,80}$/i.test(text)
    && !text.includes('..')
    && !text.includes('\\')
    && !text.includes('/');
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
  const resultValue = prepareProviderRoundtripSource({
    argv: process.argv.slice(2),
  });
  process.exitCode = printResult(resultValue);
}
