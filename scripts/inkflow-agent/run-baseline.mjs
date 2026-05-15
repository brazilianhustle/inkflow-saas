#!/usr/bin/env node
// run-baseline.mjs — Sub 1.A C5. Roda harness contra os 3 evals do tattoo e
// gera baseline-report.md em docs/inkflow-agent/reports/.
//
// Uso (env vars vem de evals/.env como harness atual espera):
//   node --env-file=evals/.env scripts/inkflow-agent/run-baseline.mjs
//
// Falha de eval individual NAO trava o runner — registra no relatorio.

import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const HARNESS = path.join(ROOT, 'evals/inkflow-agent/_harness/run.mjs');
const REPORT_JSON = path.join(ROOT, 'evals/inkflow-agent/report.json');
const OUT_MD = path.join(ROOT, 'docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md');

const PERSONAS = ['per-001', 'per-009', 'per-010'];

function runHarness(persona) {
  return new Promise((resolve) => {
    const proc = spawn('node', [HARNESS, '--category=directed', '--agent=tattoo', `--persona=${persona}`], {
      stdio: 'inherit',
      env: process.env,
    });
    proc.on('close', code => resolve({ persona, exitCode: code }));
  });
}

async function readReportSafely() {
  try {
    const raw = await readFile(REPORT_JSON, 'utf-8');
    return JSON.parse(raw);
  } catch { return null; }
}

function renderResults(allResults) {
  const lines = [];
  lines.push(`# TattooAgent — Baseline Run ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push(`**Eval harness:** evals/inkflow-agent/_harness/run.mjs`);
  lines.push(`**Judge model:** ${process.env.JUDGE_MODEL || 'claude-haiku-4-5-20251001'}`);
  lines.push(`**Base URL:** ${process.env.BASE_URL || 'https://inkflowbrasil.com'}`);
  lines.push(`**Rodado em:** ${new Date().toISOString()}`);
  lines.push('');

  let total = 0, pass = 0, fail = 0, error = 0;
  for (const r of allResults) {
    total++;
    if (r.status === 'pass') pass++;
    else if (r.status === 'fail') fail++;
    else error++;
  }
  lines.push(`**Total:** ${total} evals - ${pass} pass - ${fail} fail - ${error} error`);
  lines.push('');

  for (const r of allResults) {
    const icon = r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'ERROR';
    lines.push(`## ${r.id}`);
    lines.push(`**${icon}**`);
    if (r.scores) {
      lines.push(`- naturalidade: ${r.scores.naturalidade?.media ?? '-'}`);
      lines.push(`- manifesto: ${r.scores.manifesto?.m1_manifesto_adherence?.toFixed(2) ?? '-'}`);
      lines.push(`- state: ${r.scores.state?.s1 ?? '-'}`);
      const violations = r.scores.manifesto?.violations || [];
      if (violations.length) {
        lines.push(`- violations:`);
        for (const v of violations) lines.push(`  - ${v}`);
      } else {
        lines.push(`- violations: (none)`);
      }
    }
    if (r.error) lines.push(`- error: ${r.error}`);
    if (r.pass?.fails?.length) lines.push(`- falhou em: ${r.pass.fails.join(', ')}`);
    lines.push('');
  }

  lines.push('## Próximos passos sugeridos pra Sub 1.B');
  lines.push('');
  lines.push('(Preencher manualmente após review do report — quais FMs reproduziram empiricamente, ordem de prioridade.)');
  return lines.join('\n');
}

async function main() {
  const allResults = [];
  for (const persona of PERSONAS) {
    console.log(`\n=== Rodando ${persona} ===`);
    await runHarness(persona);
    const report = await readReportSafely();
    if (report?.results) {
      for (const r of report.results) allResults.push({ persona, ...r });
    }
  }

  await mkdir(path.dirname(OUT_MD), { recursive: true });
  const md = renderResults(allResults);
  await writeFile(OUT_MD, md);
  console.log(`\nBaseline report -> ${OUT_MD}`);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
