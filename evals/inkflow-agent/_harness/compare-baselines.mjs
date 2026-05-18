#!/usr/bin/env node
// compare-baselines.mjs — compara dois diretórios de baseline (BEFORE vs AFTER)
// e determina se as diferenças em naturalidade são estatisticamente significativas.
//
// Estatística usada: t-statistic de duas amostras com aproximação z (1.96 para IC 95%).
// O pooled std é combinado via weighted average das variâncias amostrais, e o erro
// padrão da diferença de médias (se_diff) é calculado com sqrt(1/n_before + 1/n_after).
// Simplificação: usamos 1.96 (z) em vez de t_crítico(df) pois n ≥ 5 por lado tipicamente.
//
// API:
//   compareBaselines(beforeDir, afterDir) → { rows, summary }
//   formatMarkdown(result, beforeDir, afterDir) → string
//   CLI: node compare-baselines.mjs <BEFORE_DIR> <AFTER_DIR>

import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Lê aggregate.json de um diretório. Lança erro com mensagem clara se não encontrado.
 */
async function readAggregate(dir) {
  const filePath = path.join(dir, 'aggregate.json');
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`aggregate.json não encontrado em "${dir}". Execute compute-variance.mjs primeiro. (${e.message})`);
  }
}

/**
 * Computa estatísticas de comparação para uma persona.
 * Retorna row com conclusão: 'significant' | 'noise' | 'insufficient_data'
 */
function computeRow(persona, beforeEntry, afterEntry) {
  const nat_before = beforeEntry.nat.media;
  const nat_after  = afterEntry.nat.media;
  const n_before   = beforeEntry.nat.n;
  const n_after    = afterEntry.nat.n;
  const std_before = beforeEntry.nat.std;
  const std_after  = afterEntry.nat.std;

  const diff = nat_after - nat_before;

  // Graus de liberdade do pooled: n_before + n_after - 2
  const df = n_before + n_after - 2;

  let pooled_std = null;
  let se_diff    = null;
  let diff_sigma = null;
  let conclusion = 'insufficient_data';

  if (df > 0) {
    const pooled_var = ((n_before - 1) * std_before ** 2 + (n_after - 1) * std_after ** 2) / df;
    pooled_std = Math.sqrt(pooled_var);

    se_diff = pooled_std * Math.sqrt(1 / n_before + 1 / n_after);

    if (se_diff > 0) {
      diff_sigma = diff / se_diff;
    } else {
      // se_diff = 0 quando pooled_std = 0 (todas amostras idênticas)
      // diff ≠ 0 → Infinity sigma → significant; diff = 0 → noise
      diff_sigma = diff !== 0 ? (diff > 0 ? Infinity : -Infinity) : 0;
    }

    // IC 95% com aproximação z (ver comentário no topo)
    if (diff_sigma === null) {
      conclusion = 'insufficient_data';
    } else if (Math.abs(diff_sigma) > 1.96) {
      conclusion = 'significant';
    } else {
      conclusion = 'noise';
    }
  }

  return {
    persona,
    n_before,
    n_after,
    nat_before,
    nat_after,
    diff,
    diff_sigma,
    conclusion,
  };
}

/**
 * Compara dois diretórios de baseline.
 * @param {string} beforeDir
 * @param {string} afterDir
 * @returns {{ rows: object[], summary: { significant: number, noise: number, insufficient_data: number } }}
 */
export async function compareBaselines(beforeDir, afterDir) {
  const [before, after] = await Promise.all([
    readAggregate(beforeDir),
    readAggregate(afterDir),
  ]);

  const beforeKeys = new Set(Object.keys(before));
  const afterKeys  = new Set(Object.keys(after));

  // Personas somente em um lado: avisar e pular
  for (const k of beforeKeys) {
    if (!afterKeys.has(k)) {
      console.warn(`[compare-baselines] persona "${k}" presente só no BEFORE — pulando`);
    }
  }
  for (const k of afterKeys) {
    if (!beforeKeys.has(k)) {
      console.warn(`[compare-baselines] persona "${k}" presente só no AFTER — pulando`);
    }
  }

  // Interseção
  const shared = [...beforeKeys].filter(k => afterKeys.has(k)).sort();

  const rows = shared.map(persona => computeRow(persona, before[persona], after[persona]));

  const summary = { significant: 0, noise: 0, insufficient_data: 0 };
  for (const row of rows) {
    summary[row.conclusion] = (summary[row.conclusion] ?? 0) + 1;
  }

  return { rows, summary };
}

/**
 * Formata resultado como tabela markdown.
 * @param {{ rows: object[], summary: object }} result
 * @param {string} beforeDir
 * @param {string} afterDir
 * @returns {string}
 */
export function formatMarkdown(result, beforeDir, afterDir) {
  const { rows, summary } = result;
  const total = rows.length;

  const fmtNum = (v) => {
    if (v === null || v === undefined) return 'n/a';
    if (!isFinite(v)) return v > 0 ? '+∞' : '-∞';
    return v.toFixed(2);
  };

  const header = [
    '# Comparação BEFORE vs AFTER',
    '',
    `BEFORE: \`${beforeDir}\` (n personas: ${rows.length + /* from warn */ 0})`,
    `AFTER:  \`${afterDir}\` (n personas: ${rows.length + 0})`,
    '',
    '| Persona | n_before | n_after | nat_before | nat_after | diff | diff_σ | conclusão |',
    '|---|---|---|---|---|---|---|---|',
  ];

  const dataRows = rows.map(r =>
    `| ${r.persona} | ${r.n_before} | ${r.n_after} | ${fmtNum(r.nat_before)} | ${fmtNum(r.nat_after)} | ${fmtNum(r.diff)} | ${fmtNum(r.diff_sigma)} | ${r.conclusion} |`
  );

  const resumo = `**Resumo:** ${summary.significant}/${total} significant · ${summary.noise}/${total} noise · ${summary.insufficient_data}/${total} insufficient_data`;

  return [...header, ...dataRows, '', resumo].join('\n');
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const beforeDir = process.argv[2];
  const afterDir  = process.argv[3];

  if (!beforeDir || !afterDir) {
    console.error('Uso: compare-baselines.mjs <BEFORE_DIR> <AFTER_DIR>');
    process.exit(2);
  }

  compareBaselines(beforeDir, afterDir).then(result => {
    console.log(formatMarkdown(result, beforeDir, afterDir));
  }).catch(e => {
    console.error('ERRO:', e.message);
    process.exit(2);
  });
}
