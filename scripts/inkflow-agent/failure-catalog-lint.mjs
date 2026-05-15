#!/usr/bin/env node
// failure-catalog-lint.mjs — valida links cruzados Persona <-> Failure <-> Eval
// e enum-values de dimensoes.
//
// Uso CLI: node scripts/inkflow-agent/failure-catalog-lint.mjs
// Exit 0 se OK, 1 se errors, 0 com warning se so warnings.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DIM_ENUM = {
  postura: ['decidido', 'indeciso', 'pesquisando', 'resistente', 'adversarial', 'qualquer'],
  familiaridade: ['primeira_vez', 'experiente', 'veterano_recorrente', 'qualquer', 'n/a'],
  atitude: ['ansioso', 'casual', 'agressivo', 'exigente', 'distante', 'deslumbrado', 'emocional', 'qualquer', 'n/a'],
  complexidade: ['simples', 'medio', 'complexo'],
  sensibilidade_preco: ['aberto', 'sensivel', 'negociador', 'queima_preco', 'n/a'],
};

const FAILURE_TYPES = ['hallucination', 'policy_violation', 'drift_persona', 'format_error', 'state_error', 'data_error', 'tool_error', 'invariant_violation', 'latency', 'cost'];
const LAYERS = ['prompt', 'schema_invariant', 'pipeline', 'tool', 'provider', 'data'];
const STATUS_PERSONAS = ['draft', 'active', 'archived'];
const STATUS_FAILURES = ['open', 'mitigated', 'fixed', 'archived'];

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  const lines = m[1].split('\n');
  let currentKey = null;
  for (const line of lines) {
    const indented = line.match(/^  (\w+):\s*(.+)$/);
    if (indented && currentKey === 'dimensoes') {
      fm.dimensoes = fm.dimensoes || {};
      fm.dimensoes[indented[1]] = indented[2].trim();
      continue;
    }
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) {
      const key = kv[1];
      const val = kv[2].trim();
      currentKey = key;
      if (val === '') continue;
      if (val.startsWith('[')) {
        fm[key] = val.replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);
      } else {
        fm[key] = val;
      }
    }
  }
  return fm;
}

function extractLinks(content, prefix) {
  // Aceita [[FM-NNNN]] e [[FM-NNNN-slug-qualquer]] — extrai só o ID (FM-NNNN)
  const digits = prefix === 'FM' ? '\\d{4}' : '\\d{3}';
  const re = new RegExp(`\\[\\[${prefix}-(${digits})(?:-[\\w-]+)?\\]\\]`, 'g');
  const matches = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    matches.push(`${prefix}-${m[1]}`);
  }
  return matches;
}

export function lintPersona(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const fm = parseFrontmatter(content);
  const errors = [];
  const warnings = [];

  if (!fm) {
    errors.push(`${path.basename(filePath)}: frontmatter ausente ou malformado`);
    return { errors, warnings };
  }

  if (!fm.id || !/^PER-\d{3}$/.test(fm.id)) errors.push(`${filePath}: id invalido (${fm.id})`);
  if (!STATUS_PERSONAS.includes(fm.status)) errors.push(`${filePath}: status invalido (${fm.status})`);
  if (!fm.dimensoes) errors.push(`${filePath}: dimensoes ausentes`);
  else {
    for (const [dim, validVals] of Object.entries(DIM_ENUM)) {
      const v = fm.dimensoes[dim];
      if (!v) errors.push(`${filePath}: dimensao ${dim} ausente`);
      else if (!validVals.includes(v)) errors.push(`${filePath}: dimensao ${dim}=${v} fora do enum`);
    }
  }

  const fmLinks = extractLinks(content, 'FM');
  for (const link of fmLinks) {
    warnings.push(`${path.basename(filePath)}: link ${link} (verificar se existe em failures/)`);
  }

  return { errors, warnings, frontmatter: fm, fmLinks };
}

export function lintFailure(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const fm = parseFrontmatter(content);
  const errors = [];
  const warnings = [];

  if (!fm) {
    errors.push(`${path.basename(filePath)}: frontmatter ausente ou malformado`);
    return { errors, warnings };
  }

  if (!fm.id || !/^FM-\d{4}$/.test(fm.id)) errors.push(`${filePath}: id invalido (${fm.id})`);
  if (!STATUS_FAILURES.includes(fm.status)) errors.push(`${filePath}: status invalido (${fm.status})`);
  if (!FAILURE_TYPES.includes(fm.type)) errors.push(`${filePath}: type invalido (${fm.type})`);
  if (!Array.isArray(fm.layers) || fm.layers.length === 0) errors.push(`${filePath}: layers ausente/vazio`);
  else for (const layer of fm.layers) {
    if (!LAYERS.includes(layer)) errors.push(`${filePath}: layer ${layer} fora do enum`);
  }

  return { errors, warnings, frontmatter: fm };
}

export function lintAll(rootDir) {
  const personasDir = path.join(rootDir, 'personas');
  const failuresDir = path.join(rootDir, 'failures');

  const personas = [];
  const failures = [];

  if (existsSync(personasDir)) {
    const files = readdirSync(personasDir).filter(f => /^PER-\d{3}-/.test(f));
    for (const f of files) personas.push(lintPersona(path.join(personasDir, f)));
  }
  if (existsSync(failuresDir)) {
    const files = readdirSync(failuresDir).filter(f => /^FM-\d{4}-/.test(f));
    for (const f of files) failures.push(lintFailure(path.join(failuresDir, f)));
  }

  const failureIds = new Set(failures.map(f => f.frontmatter?.id).filter(Boolean));
  const crossRefErrors = [];
  for (const p of personas) {
    for (const link of (p.fmLinks || [])) {
      if (!failureIds.has(link)) {
        crossRefErrors.push(`persona ${p.frontmatter?.id} linka ${link} (inexistente)`);
      }
    }
  }

  return { personas, failures, crossRefErrors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(__dirname, '../..', 'docs/inkflow-agent');
  const { personas, failures, crossRefErrors } = lintAll(root);

  let totalErr = crossRefErrors.length;
  for (const r of [...personas, ...failures]) totalErr += r.errors.length;

  for (const r of [...personas, ...failures]) {
    for (const e of r.errors) console.error('ERR  ' + e);
    for (const w of r.warnings || []) console.warn('WARN ' + w);
  }
  for (const e of crossRefErrors) console.error('ERR  ' + e);

  console.log(`\nPersonas: ${personas.length} | Failures: ${failures.length} | Errors: ${totalErr}`);
  process.exit(totalErr > 0 ? 1 : 0);
}
