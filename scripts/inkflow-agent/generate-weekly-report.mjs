#!/usr/bin/env node
// generate-weekly-report.mjs — preenche docs/inkflow-agent/reports/YYYY-MM-WX-weekly.md
// a partir de queries em agent_turn_logs + listagem de failures changed.
//
// Uso: node scripts/inkflow-agent/generate-weekly-report.mjs
//
// ENV (em scripts/.env opcional):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (acesso direto às queries)

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(ROOT, 'docs/inkflow-agent/reports');
const TEMPLATE = path.join(ROOT, 'docs/inkflow-agent/ops/weekly-template.md');

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { year: d.getUTCFullYear(), week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7) };
}

async function getMetrics() {
  return {
    invariant_violation_rate: '—',
    latency_p95: '—',
    cost_avg: '—',
    fechamento: '—',
    intervencao: '—',
    turns_handoff: '—',
  };
}

function listChangedFailures() {
  const failuresDir = path.join(ROOT, 'docs/inkflow-agent/failures');
  if (!existsSync(failuresDir)) return [];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  return readdirSync(failuresDir)
    .filter(f => /^FM-\d{4}-/.test(f))
    .map(f => {
      const content = readFileSync(path.join(failuresDir, f), 'utf-8');
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) return null;
      const lastChangeMatch = fmMatch[1].match(/last_change:\s*(\S+)/);
      const statusMatch = fmMatch[1].match(/status:\s*(\S+)/);
      const idMatch = fmMatch[1].match(/id:\s*(\S+)/);
      const slugMatch = f.match(/^FM-\d{4}-(.+)\.md$/);
      if (!lastChangeMatch || !statusMatch || !idMatch) return null;
      const lastChange = new Date(lastChangeMatch[1]);
      if (lastChange < sevenDaysAgo) return null;
      return { id: idMatch[1], slug: slugMatch?.[1] || '?', status: statusMatch[1], date: lastChangeMatch[1] };
    })
    .filter(Boolean);
}

async function main() {
  const now = new Date();
  const { year, week } = isoWeek(now);
  const filename = `${year}-W${String(week).padStart(2, '0')}-weekly.md`;
  const outPath = path.join(REPORTS_DIR, filename);

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  if (existsSync(outPath)) {
    console.error(`Report ja existe: ${outPath}`);
    console.error('Apaga ou move antes de gerar de novo.');
    process.exit(1);
  }

  const template = readFileSync(TEMPLATE, 'utf-8');
  const metrics = await getMetrics();
  const failures = listChangedFailures();

  let content = template
    .replace('# Weekly review — YYYY-MM-WX', `# Weekly review — ${year}-W${String(week).padStart(2, '0')}`)
    .replace('**Data:** YYYY-MM-DD', `**Data:** ${now.toISOString().slice(0, 10)}`)
    .replace('Invariant violation rate: __%', `Invariant violation rate: ${metrics.invariant_violation_rate}%`)
    .replace('Latência p95: __s', `Latência p95: ${metrics.latency_p95}s`)
    .replace('Cost médio/turn: $__', `Cost médio/turn: $${metrics.cost_avg}`)
    .replace('Taxa fechamento (30d): __%', `Taxa fechamento (30d): ${metrics.fechamento}%`)
    .replace('Taxa intervenção humana: __%', `Taxa intervenção humana: ${metrics.intervencao}%`)
    .replace('Turns até handoff (média): __', `Turns até handoff (média): ${metrics.turns_handoff}`);

  if (failures.length) {
    const rows = failures.map(f => `| ${f.id} | ${f.slug} | last_change ${f.date} | ${f.status} |`).join('\n');
    content = content.replace('| — | — | — | — |', rows);
  }

  writeFileSync(outPath, content);
  console.log(`✅ Weekly report criado: ${outPath}`);
  console.log(`   Failures changed: ${failures.length}`);
  console.log(`   Edite e preencha as seções manuais (3, 4, 6, 7).`);
}

main().catch(e => { console.error(e); process.exit(1); });
