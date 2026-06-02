#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';

const SOURCE_NAME = 'provider-roundtrip-source.json';

const MILESTONES = Object.freeze([
  ['fake-client-inbound', 'whatsapp-client-observation', 'redacted-whatsapp-client.txt', 'Cliente staging enviou mensagem no WhatsApp?'],
  ['bot-whatsapp-response', 'whatsapp-client-observation', 'redacted-whatsapp-client.txt', 'Bot respondeu no WhatsApp staging?'],
  ['telegram-quote-request', 'telegram-artist-observation', 'redacted-telegram-artist.txt', 'Pedido de orçamento chegou no Telegram staging?'],
  ['artist-quote-reply', 'telegram-artist-observation', 'redacted-telegram-artist.txt', 'Tatuador respondeu no Telegram staging?'],
  ['client-quote-response', 'whatsapp-client-observation', 'redacted-whatsapp-client.txt', 'Cliente recebeu a proposta final no WhatsApp staging?'],
  ['rollback-disable-check', 'operator-rollback-check', 'redacted-rollback-check.txt', 'Rollback/disable check passou depois do roundtrip?'],
]);

export function parseArgs(argv = []) {
  const args = Array.from(argv);
  const errors = [];
  let evidenceDir = '';
  let answersFile = '';
  let write = false;
  let nonInteractive = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--write') {
      write = true;
      continue;
    }
    if (arg === '--non-interactive') {
      nonInteractive = true;
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
    if (arg === '--answers-file') {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) {
        errors.push(error('argv', 'answers_file_arg_required'));
        continue;
      }
      answersFile = next;
      index += 1;
      continue;
    }
    errors.push(error('argv', `unknown_arg:${arg}`));
  }

  if (evidenceDir && !isSafeSmokeEvidenceDir(evidenceDir)) errors.push(error('argv', 'invalid_smoke_evidence_dir'));
  if (answersFile && !isSafeSmokeEvidenceJsonPath(answersFile)) errors.push(error('argv', 'invalid_answers_file_path'));
  if (nonInteractive && !answersFile) errors.push(error('argv', 'answers_file_required_for_non_interactive'));

  return freeze({
    ok: errors.length === 0,
    evidenceDir,
    sourcePath: evidenceDir ? `${evidenceDir}/${SOURCE_NAME}` : '',
    answersFile,
    write,
    nonInteractive,
    errors,
  });
}

export async function captureProviderRoundtripWizard({
  argv = [],
  cwd = process.cwd(),
  now = () => new Date(),
  prompt = null,
} = {}) {
  const parsed = parseArgs(argv);
  const errors = [...parsed.errors];
  if (!parsed.ok) return result({ parsed, errors });
  if (!parsed.evidenceDir) return result({ parsed, errors });
  if (!parsed.write) {
    errors.push(error('argv', 'write_flag_required'));
    return result({ parsed, errors });
  }

  const source = readJsonSafe({ cwd, path: parsed.sourcePath });
  if (!source.ok) {
    errors.push(error('source', 'provider_roundtrip_source_unreadable'));
    return result({ parsed, errors });
  }

  const answers = parsed.answersFile
    ? readJsonSafe({ cwd, path: parsed.answersFile })
    : { ok: true, value: await promptForAnswers({ prompt }) };
  if (!answers.ok) {
    errors.push(error('answers', 'answers_unreadable'));
    return result({ parsed, errors });
  }

  const capture = buildCapturedSource({
    source: source.value,
    answers: answers.value,
    evidenceDir: parsed.evidenceDir,
    now,
  });
  errors.push(...capture.errors);
  if (errors.length > 0) return result({ parsed, errors, sourceLoaded: true });

  writeJsonSafe({ cwd, path: parsed.sourcePath, value: capture.source });
  for (const [fileName, text] of Object.entries(capture.artifacts)) {
    writeTextSafe({ cwd, path: `${parsed.evidenceDir}/${fileName}`, text });
  }

  return result({
    parsed,
    errors,
    sourceLoaded: true,
    captured: true,
    artifactsWritten: Object.keys(capture.artifacts).map((fileName) => `${parsed.evidenceDir}/${fileName}`),
  });
}

export function buildCapturedSource({
  source = {},
  answers = {},
  evidenceDir = '',
  now = () => new Date(),
} = {}) {
  const errors = [];
  if (!isSafeSmokeEvidenceDir(evidenceDir)) errors.push(error('evidence_dir', 'invalid_smoke_evidence_dir'));
  if (source.raw_values_included === true) errors.push(error('source.raw_values_included', 'raw_values_forbidden'));
  if (source.secrets_included === true) errors.push(error('source.secrets_included', 'secrets_forbidden'));
  if (looksUnsafe(answers)) errors.push(error('answers', 'unsafe_roundtrip_answers_content'));

  const observedAt = normalizeTimestamp(answers.observed_at || answers.observedAt || now().toISOString());
  if (!observedAt) errors.push(error('answers.observed_at', 'safe_timestamp_required'));

  const confirmations = answers.confirmations && typeof answers.confirmations === 'object' ? answers.confirmations : {};
  const proofs = answers.proofs && typeof answers.proofs === 'object' ? answers.proofs : {};
  const milestones = {};
  const artifacts = {
    'redacted-whatsapp-client.txt': '',
    'redacted-telegram-artist.txt': '',
    'redacted-rollback-check.txt': '',
  };

  for (const [milestone, evidenceOrigin, artifactFile] of MILESTONES) {
    if (confirmations[milestone] !== true) {
      errors.push(error(`answers.confirmations.${milestone}`, 'milestone_confirmation_required'));
    }
    const proof = normalizeProof(proofs[milestone]);
    if (!proof) errors.push(error(`answers.proofs.${milestone}`, 'safe_milestone_proof_required'));
    milestones[milestone] = {
      proof: proof || `${milestone} redacted proof missing`,
      evidence_origin: evidenceOrigin,
      evidence_path: `${evidenceDir}/${artifactFile}`,
      observed_at: observedAt || new Date(0).toISOString(),
    };
    artifacts[artifactFile] += `${milestone}: ${proof || 'missing'}\n`;
  }

  const quoteRequestRef = String(source.quote_request_ref || '').trim();
  if (!/^fake_quote_ref_[a-z0-9_-]+$/i.test(quoteRequestRef)) {
    errors.push(error('source.quote_request_ref', 'fake_quote_ref_required'));
  }

  if (errors.length > 0) return freeze({ ok: false, source: null, artifacts, errors });

  return freeze({
    ok: true,
    source: {
      ...source,
      ok: true,
      operator_confirmation: 'redacted_provider_roundtrip_observed',
      raw_values_included: false,
      secrets_included: false,
      source_review: {
        real_whatsapp_telegram_roundtrip: true,
        direct_evidence_only: true,
        documentation_only: false,
      },
      observed_at: observedAt,
      milestones,
    },
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([fileName, text]) => [
      fileName,
      `${text}Operator note: all entries are redacted staging observations only.\n`,
    ])),
    errors: [],
  });
}

async function promptForAnswers({ prompt }) {
  const rl = prompt ? null : createInterface({ input, output });
  const ask = prompt || ((question) => rl.question(question));
  const confirmations = {};
  const proofs = {};
  try {
    for (const [milestone,, , question] of MILESTONES) {
      const confirmed = await ask(`${question} Digite "sim" para confirmar: `);
      confirmations[milestone] = /^s(?:im)?$/i.test(String(confirmed || '').trim());
      proofs[milestone] = await ask(`Frase redigida para ${milestone}: `);
    }
  } finally {
    if (rl) rl.close();
  }
  return { confirmations, proofs };
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
  writeTextSafe({ cwd, path, text: `${JSON.stringify(value, null, 2)}\n` });
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
  sourceLoaded = false,
  captured = false,
  artifactsWritten = [],
}) {
  return freeze({
    ok: errors.length === 0,
    mode: 'provider-staging-capture-roundtrip-wizard',
    evidence_dir: parsed.evidenceDir,
    source_path: parsed.sourcePath,
    answers_file: parsed.answersFile,
    write_requested: parsed.write,
    source_loaded: sourceLoaded,
    captured,
    artifacts_written: artifactsWritten,
    provider_staging_smoke_executed: false,
    provider_staging_smoke_evidence_captured: false,
    connects_to_provider: false,
    executable_provider_commands: false,
    next_checkpoint: !parsed.evidenceDir
      ? 'provide_smoke_evidence_dir'
      : errors.length === 0
      ? 'run_provider_roundtrip_source_review'
      : 'fix_redacted_roundtrip_answers',
    errors,
  });
}

function printResult(resultValue) {
  if (!resultValue.ok) {
    console.error('Provider staging capture roundtrip wizard failed.');
    console.error(inspect(resultValue.errors, { depth: null, colors: false }));
    return 1;
  }
  console.log(resultValue.captured
    ? 'Provider staging redacted roundtrip source captured locally.'
    : 'Provider staging capture roundtrip wizard is blocked until evidence dir and --write are provided.');
  console.log(JSON.stringify({
    mode: resultValue.mode,
    evidence_dir: resultValue.evidence_dir,
    source_path: resultValue.source_path,
    answers_file: resultValue.answers_file,
    write_requested: resultValue.write_requested,
    source_loaded: resultValue.source_loaded,
    captured: resultValue.captured,
    artifacts_written: resultValue.artifacts_written,
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

function normalizeTimestamp(value = '') {
  const text = String(value || '');
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text) ? text : '';
}

function looksUnsafe(value = '') {
  const text = (typeof value === 'string' ? value : JSON.stringify(value))
    .replace(/"secrets_included"\s*:\s*false/gi, '')
    .replace(/"raw_values_included"\s*:\s*false/gi, '');
  return /https?:\/\/|token|secret|password|api[_-]?key|service[_-]?role|access[_-]?token|refresh[_-]?token|bot[_-]?token|webhook|runtime_handle_|secret_binding_id|secbind_|eyJ|inkflowbrasil\.com|official|production|real_customer|live_customer|\b55\d{10,13}\b/i
    .test(text);
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
  const resultValue = await captureProviderRoundtripWizard({
    argv: process.argv.slice(2),
  });
  process.exitCode = printResult(resultValue);
}
