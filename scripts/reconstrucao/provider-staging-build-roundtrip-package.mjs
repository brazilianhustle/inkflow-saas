#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import {
  normalizeProviderRoundtripPackage,
} from './provider-staging-real-smoke-store-source-runtime-real-operational-adapters-operator-turn-run-from-evidence.mjs';

const DEFAULT_SOURCE_NAME = 'provider-roundtrip-source.json';
const DEFAULT_OUTPUT_NAME = 'provider-roundtrip.json';

export function parseArgs(argv = []) {
  const args = Array.from(argv);
  const errors = [];
  let evidenceDir = '';
  let sourcePath = '';
  let outputPath = '';
  let write = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--write') {
      write = true;
      continue;
    }
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
    if (arg === '--output') {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) {
        errors.push(error('argv', 'output_arg_required'));
        continue;
      }
      outputPath = next;
      index += 1;
      continue;
    }
    errors.push(error('argv', `unknown_arg:${arg}`));
  }

  if (evidenceDir && !isSafeSmokeEvidenceDir(evidenceDir)) {
    errors.push(error('argv', 'invalid_smoke_evidence_dir'));
  }
  if (write && !evidenceDir) errors.push(error('argv', 'evidence_dir_required_for_write'));

  sourcePath = sourcePath || (evidenceDir ? `${evidenceDir}/${DEFAULT_SOURCE_NAME}` : '');
  outputPath = outputPath || (evidenceDir ? `${evidenceDir}/${DEFAULT_OUTPUT_NAME}` : '');

  if (sourcePath && !isSafeSmokeEvidenceJsonPath(sourcePath)) {
    errors.push(error('argv', 'invalid_provider_roundtrip_source_path'));
  }
  if (outputPath && !isSafeSmokeEvidenceJsonPath(outputPath)) {
    errors.push(error('argv', 'invalid_provider_roundtrip_output_path'));
  }
  if (evidenceDir && sourcePath && !sourcePath.startsWith(`${evidenceDir}/`)) {
    errors.push(error('argv', 'source_must_be_inside_evidence_dir'));
  }
  if (evidenceDir && outputPath && !outputPath.startsWith(`${evidenceDir}/`)) {
    errors.push(error('argv', 'output_must_be_inside_evidence_dir'));
  }

  return freeze({
    ok: errors.length === 0,
    evidenceDir,
    sourcePath,
    outputPath,
    write,
    errors,
  });
}

export function buildProviderRoundtripPackage({
  argv = [],
  cwd = process.cwd(),
  now = () => new Date(),
} = {}) {
  const parsed = parseArgs(argv);
  const errors = [...parsed.errors];
  if (!parsed.ok) return result({ parsed, errors });
  if (!parsed.evidenceDir) return result({ parsed, errors });

  const source = readJsonSafe({ cwd, path: parsed.sourcePath });
  if (!source.ok) {
    errors.push(error('source', 'provider_roundtrip_source_unreadable'));
    return result({ parsed, errors });
  }

  const sourceValidation = validateSourceShape(source.value);
  errors.push(...sourceValidation.errors);

  const normalized = normalizeProviderRoundtripPackage({
    ok: source.value.ok,
    quote_request_ref: source.value.quote_request_ref,
    quoteRequestRef: source.value.quoteRequestRef,
    observed_at: source.value.observed_at || now().toISOString(),
    observedAt: source.value.observedAt,
    milestones: source.value.milestones,
  });
  errors.push(...normalized.errors);

  const packageValue = normalized.package;
  if (errors.length > 0) {
    return result({
      parsed,
      errors,
      packageValue,
      sourceLoaded: true,
    });
  }

  if (parsed.write) {
    writeJsonSafe({ cwd, path: parsed.outputPath, value: packageValue });
  }

  return result({
    parsed,
    errors,
    packageValue,
    sourceLoaded: true,
    packageWritten: parsed.write,
  });
}

function validateSourceShape(source = {}) {
  const errors = [];
  if (source.ok !== true) errors.push(error('source.ok', 'source_ok_true_required'));
  if (!source.operator_confirmation || source.operator_confirmation !== 'redacted_provider_roundtrip_observed') {
    errors.push(error('source.operator_confirmation', 'redacted_provider_roundtrip_observed_required'));
  }
  if (source.raw_values_included === true) {
    errors.push(error('source.raw_values_included', 'raw_values_forbidden'));
  }
  if (source.secrets_included === true) {
    errors.push(error('source.secrets_included', 'secrets_forbidden'));
  }
  return freeze({ ok: errors.length === 0, errors });
}

function readJsonSafe({ cwd, path }) {
  try {
    const target = resolveInsideCwd(cwd, path);
    return freeze({ ok: true, value: JSON.parse(readFileSync(target, 'utf8')) });
  } catch {
    return freeze({ ok: false, value: null });
  }
}

function writeJsonSafe({ cwd, path, value }) {
  const target = resolveInsideCwd(cwd, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
  packageValue = null,
  sourceLoaded = false,
  packageWritten = false,
}) {
  return freeze({
    ok: errors.length === 0,
    mode: 'provider-staging-build-roundtrip-package',
    evidence_dir: parsed.evidenceDir,
    source_path: parsed.sourcePath,
    output_path: parsed.outputPath,
    write_requested: parsed.write,
    source_loaded: sourceLoaded,
    package_validated: packageValue !== null && errors.length === 0,
    package_written: packageWritten,
    provider_staging_smoke_executed: false,
    provider_staging_smoke_evidence_captured: false,
    connects_to_provider: false,
    executable_provider_commands: false,
    next_checkpoint: errors.length === 0
      ? nextCheckpoint({ parsed, packageWritten })
      : 'fix_provider_roundtrip_source',
    errors,
  });
}

function nextCheckpoint({ parsed, packageWritten }) {
  if (!parsed.evidenceDir) return 'provide_smoke_evidence_dir';
  if (!packageWritten) return 'write_provider_roundtrip_package';
  return 'run_operator_turn_from_provider_roundtrip_package';
}

function printResult(resultValue) {
  if (!resultValue.ok) {
    console.error('Provider staging roundtrip package build failed.');
    console.error(inspect(resultValue.errors, { depth: null, colors: false }));
    return 1;
  }
  console.log(resultValue.package_written
    ? 'Provider staging roundtrip package written.'
    : 'Provider staging roundtrip package validated; write remains blocked.');
  console.log(JSON.stringify({
    mode: resultValue.mode,
    evidence_dir: resultValue.evidence_dir,
    source_path: resultValue.source_path,
    output_path: resultValue.output_path,
    write_requested: resultValue.write_requested,
    source_loaded: resultValue.source_loaded,
    package_validated: resultValue.package_validated,
    package_written: resultValue.package_written,
    provider_staging_smoke_executed: resultValue.provider_staging_smoke_executed,
    provider_staging_smoke_evidence_captured: resultValue.provider_staging_smoke_evidence_captured,
    connects_to_provider: resultValue.connects_to_provider,
    executable_provider_commands: resultValue.executable_provider_commands,
    next_checkpoint: resultValue.next_checkpoint,
  }, null, 2));
  return 0;
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
    && !text.includes('\\');
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
  const resultValue = buildProviderRoundtripPackage({
    argv: process.argv.slice(2),
  });
  process.exitCode = printResult(resultValue);
}
