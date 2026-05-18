#!/usr/bin/env node
// compute-variance.mjs — agrega N reports de baseline runs (por persona)
// → JSON com min/max/range/média/std + tamanho_cm violation list + invariants section.
//
// API:
//   computeAggregate(dirPath) → object keyed by personaId
//   CLI: node compute-variance.mjs <dirPath>  → stdout JSON + grava aggregate.json

import fs from 'node:fs/promises';
import path from 'node:path';
import { INVARIANTS, checkInvariant } from './invariants.mjs';

function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
  return Math.sqrt(v);
}

function statBlock(xs) {
  if (!xs.length) return { n: 0, min: null, max: null, range: null, media: null, std: null };
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  return { n: xs.length, min, max, range: max - min, media: mean(xs), std: std(xs) };
}

export async function computeAggregate(dirPath) {
  const files = (await fs.readdir(dirPath))
    .filter(f => f.endsWith('.json') && f !== 'aggregate.json');

  const byPersona = {};
  for (const f of files) {
    const raw = await fs.readFile(path.join(dirPath, f), 'utf-8');
    const doc = JSON.parse(raw);
    const results = Array.isArray(doc.results) ? doc.results : [doc];
    for (const r of results) {
      const id = r.id || 'unknown';
      if (!byPersona[id]) {
        byPersona[id] = {
          nats: [], manifestos: [], states: [], violations: [],
          // per-run tamanho_cm pass/fail for I-tamanho_cm synthesis
          tamanho_cm_per_run: [],
          // per-invariant outcome arrays: { 'I-P1': [true, false, null, ...], ... }
          invariantOutcomes: Object.fromEntries(Object.keys(INVARIANTS).map(k => [k, []])),
        };
      }
      if (r.status === 'error') continue;
      const nat = r.scores?.naturalidade?.media;
      const man = r.scores?.manifesto?.m1_manifesto_adherence;
      const statePass = r.scores?.state?.pass;
      if (typeof nat === 'number') byPersona[id].nats.push(nat);
      if (typeof man === 'number') byPersona[id].manifestos.push(man);
      if (typeof statePass === 'boolean') byPersona[id].states.push(statePass);

      // tamanho_cm violations (backward-compat list + per-run flag)
      const vs = r.scores?.manifesto?.violations || [];
      let hasViolation = false;
      for (const v of vs) {
        if (typeof v === 'string' && v.toLowerCase().includes('tamanho_cm')) {
          byPersona[id].violations.push(v);
          hasViolation = true;
        }
      }
      byPersona[id].tamanho_cm_per_run.push(!hasViolation); // true = no violation = pass

      // INVARIANT checkers — only runs that have a transcript (post-Task-2.5 reports)
      if (Array.isArray(r.transcript)) {
        for (const invId of Object.keys(INVARIANTS)) {
          let outcome = null;
          try {
            outcome = checkInvariant(invId, r.transcript, r.final_dados_persistidos ?? {});
          } catch (e) {
            console.error(`[compute-variance] invariant ${invId} checker threw on result "${r.id}":`, e.message);
            // treat as not-applicable (null) — don't propagate
          }
          byPersona[id].invariantOutcomes[invId].push(outcome);
        }
      }
    }
  }

  const agg = {};
  for (const [id, b] of Object.entries(byPersona)) {
    // Build invariants section from INVARIANTS registry + I-tamanho_cm synthesis
    const invariants = {};
    for (const invId of Object.keys(INVARIANTS)) {
      const outcomes = b.invariantOutcomes[invId];
      const applicable = outcomes.filter(o => o !== null);
      const passCount = applicable.filter(Boolean).length;
      invariants[invId] = {
        n: applicable.length,
        pass: passCount,
        pass_rate: applicable.length > 0 ? passCount / applicable.length : null,
      };
    }
    // I-tamanho_cm: synthesized from per-run violation data (retrocompat alias)
    const tmRuns = b.tamanho_cm_per_run;
    const tmPass = tmRuns.filter(Boolean).length;
    invariants['I-tamanho_cm'] = {
      n: tmRuns.length,
      pass: tmPass,
      pass_rate: tmRuns.length > 0 ? tmPass / tmRuns.length : null,
    };

    agg[id] = {
      nat: statBlock(b.nats),
      manifesto: statBlock(b.manifestos),
      state_pass_rate: b.states.length ? b.states.filter(Boolean).length / b.states.length : null,
      tamanho_cm_violations: b.violations,  // backward-compat alias preserved
      invariants,
    };
  }

  await fs.writeFile(path.join(dirPath, 'aggregate.json'), JSON.stringify(agg, null, 2));
  return agg;
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Uso: compute-variance.mjs <dirPath>');
    process.exit(2);
  }
  computeAggregate(dir).then(agg => {
    console.log(JSON.stringify(agg, null, 2));
  }).catch(e => {
    console.error('FATAL', e);
    process.exit(2);
  });
}
