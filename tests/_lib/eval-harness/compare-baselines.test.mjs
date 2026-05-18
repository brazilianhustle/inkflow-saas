import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { compareBaselines, formatMarkdown } from '../../../evals/inkflow-agent/_harness/compare-baselines.mjs';

async function makeTmpDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'eval-compare-test-'));
}

/**
 * Escreve um aggregate.json sintético num dir temporário.
 * personas: { [id]: { n, media, std } }
 */
async function writeAggregate(dir, personas) {
  const agg = {};
  for (const [id, { n, media, std }] of Object.entries(personas)) {
    agg[id] = {
      nat: { n, min: media - std, max: media + std, range: 2 * std, media, std },
      manifesto: { n, min: 0.8, max: 0.9, range: 0.1, media: 0.85, std: 0.05 },
      state_pass_rate: 1,
      tamanho_cm_violations: [],
      invariants: {},
    };
  }
  await fs.writeFile(path.join(dir, 'aggregate.json'), JSON.stringify(agg, null, 2));
}

// ─── Test 1: diff grande → significant ───────────────────────────────────────
test('compareBaselines: diff grande → significant', async () => {
  const before = await makeTmpDir();
  const after  = await makeTmpDir();
  try {
    // means 4.0 vs 4.8, std 0.1, n=5 → diff=0.8, pooled_var=0.01, pooled_std=0.1
    // se_diff = 0.1 * sqrt(1/5 + 1/5) = 0.1 * 0.6325 ≈ 0.06325
    // diff_sigma = 0.8 / 0.06325 ≈ 12.65 → significant
    await writeAggregate(before, { 'per-001': { n: 5, media: 4.0, std: 0.1 } });
    await writeAggregate(after,  { 'per-001': { n: 5, media: 4.8, std: 0.1 } });

    const { rows, summary } = await compareBaselines(before, after);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].conclusion, 'significant');
    assert.ok(Math.abs(rows[0].diff_sigma) > 10, `diff_sigma deve ser > 10, foi ${rows[0].diff_sigma}`);
    assert.equal(summary.significant, 1);
    assert.equal(summary.noise, 0);
    assert.equal(summary.insufficient_data, 0);
  } finally {
    await Promise.all([fs.rm(before, { recursive: true }), fs.rm(after, { recursive: true })]);
  }
});

// ─── Test 2: diff pequeno → noise ────────────────────────────────────────────
test('compareBaselines: diff pequeno → noise', async () => {
  const before = await makeTmpDir();
  const after  = await makeTmpDir();
  try {
    // means 4.0 vs 4.1, std 0.4, n=5 → diff=0.1, pooled_var=0.16, pooled_std=0.4
    // se_diff = 0.4 * sqrt(0.4) ≈ 0.253 → diff_sigma ≈ 0.395 → noise
    await writeAggregate(before, { 'per-009': { n: 5, media: 4.0, std: 0.4 } });
    await writeAggregate(after,  { 'per-009': { n: 5, media: 4.1, std: 0.4 } });

    const { rows, summary } = await compareBaselines(before, after);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].conclusion, 'noise');
    assert.ok(Math.abs(rows[0].diff_sigma) < 1.96, `diff_sigma deve ser < 1.96, foi ${rows[0].diff_sigma}`);
    assert.equal(summary.noise, 1);
    assert.equal(summary.significant, 0);
  } finally {
    await Promise.all([fs.rm(before, { recursive: true }), fs.rm(after, { recursive: true })]);
  }
});

// ─── Test 3: N=1 em cada lado → insufficient_data ────────────────────────────
test('compareBaselines: N=1 em cada lado → insufficient_data', async () => {
  const before = await makeTmpDir();
  const after  = await makeTmpDir();
  try {
    // n=1 + n=1 → df = 0 → pooled_std=null → insufficient_data
    await writeAggregate(before, { 'per-010': { n: 1, media: 4.0, std: 0.0 } });
    await writeAggregate(after,  { 'per-010': { n: 1, media: 4.5, std: 0.0 } });

    const { rows, summary } = await compareBaselines(before, after);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].conclusion, 'insufficient_data');
    assert.equal(rows[0].diff_sigma, null);
    assert.equal(summary.insufficient_data, 1);
    assert.equal(summary.significant, 0);
  } finally {
    await Promise.all([fs.rm(before, { recursive: true }), fs.rm(after, { recursive: true })]);
  }
});

// ─── Test 4: persona só num lado → pulada; output só com interseção ──────────
test('compareBaselines: persona só num lado é pulada', async () => {
  const before = await makeTmpDir();
  const after  = await makeTmpDir();
  try {
    // 'per-001' em ambos, 'per-002' só no before, 'per-003' só no after
    await writeAggregate(before, {
      'per-001': { n: 5, media: 4.0, std: 0.2 },
      'per-002': { n: 5, media: 3.8, std: 0.3 },
    });
    await writeAggregate(after, {
      'per-001': { n: 5, media: 4.2, std: 0.2 },
      'per-003': { n: 5, media: 4.0, std: 0.1 },
    });

    const { rows } = await compareBaselines(before, after);
    // Só per-001 na interseção
    assert.equal(rows.length, 1);
    assert.equal(rows[0].persona, 'per-001');
  } finally {
    await Promise.all([fs.rm(before, { recursive: true }), fs.rm(after, { recursive: true })]);
  }
});

// ─── Test 5: dirs sem personas (aggregate vazio) → rows vazio ─────────────────
test('compareBaselines: dirs vazios → rows vazio, resumo zeros', async () => {
  const before = await makeTmpDir();
  const after  = await makeTmpDir();
  try {
    await writeAggregate(before, {});
    await writeAggregate(after,  {});

    const { rows, summary } = await compareBaselines(before, after);
    assert.equal(rows.length, 0);
    assert.equal(summary.significant, 0);
    assert.equal(summary.noise, 0);
    assert.equal(summary.insufficient_data, 0);
  } finally {
    await Promise.all([fs.rm(before, { recursive: true }), fs.rm(after, { recursive: true })]);
  }
});

// ─── Test 6: pooled_std = 0, diff ≠ 0 → significant (Infinity sigma) ─────────
test('compareBaselines: pooled_std=0 e diff≠0 → significant (Infinity)', async () => {
  const before = await makeTmpDir();
  const after  = await makeTmpDir();
  try {
    // std=0 em ambos os lados → pooled_std=0, se_diff=0, diff_sigma=Infinity
    // diff = 4.5 - 4.0 = 0.5 ≠ 0 → significant
    await writeAggregate(before, { 'per-001': { n: 5, media: 4.0, std: 0.0 } });
    await writeAggregate(after,  { 'per-001': { n: 5, media: 4.5, std: 0.0 } });

    const { rows, summary } = await compareBaselines(before, after);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].conclusion, 'significant');
    assert.ok(!isFinite(rows[0].diff_sigma), `diff_sigma deve ser Infinity, foi ${rows[0].diff_sigma}`);
    assert.equal(summary.significant, 1);
  } finally {
    await Promise.all([fs.rm(before, { recursive: true }), fs.rm(after, { recursive: true })]);
  }
});

// ─── Test 7: pooled_std = 0, diff = 0 → noise ────────────────────────────────
test('compareBaselines: pooled_std=0 e diff=0 → noise (zero sigma)', async () => {
  const before = await makeTmpDir();
  const after  = await makeTmpDir();
  try {
    await writeAggregate(before, { 'per-001': { n: 5, media: 4.0, std: 0.0 } });
    await writeAggregate(after,  { 'per-001': { n: 5, media: 4.0, std: 0.0 } });

    const { rows, summary } = await compareBaselines(before, after);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].conclusion, 'noise');
    assert.equal(rows[0].diff_sigma, 0);
    assert.equal(summary.noise, 1);
  } finally {
    await Promise.all([fs.rm(before, { recursive: true }), fs.rm(after, { recursive: true })]);
  }
});

// ─── Test 8: aggregate.json ausente → exit com erro claro ────────────────────
test('compareBaselines: dir sem aggregate.json → rejeita com mensagem clara', async () => {
  const before = await makeTmpDir();
  const after  = await makeTmpDir();
  try {
    // Só escreve aggregate no before; after fica vazio
    await writeAggregate(before, { 'per-001': { n: 5, media: 4.0, std: 0.2 } });

    await assert.rejects(
      () => compareBaselines(before, after),
      (err) => {
        assert.ok(err.message.includes('aggregate.json'), `mensagem deve mencionar aggregate.json: ${err.message}`);
        assert.ok(err.message.includes('compute-variance'), `mensagem deve mencionar compute-variance: ${err.message}`);
        return true;
      }
    );
  } finally {
    await Promise.all([fs.rm(before, { recursive: true }), fs.rm(after, { recursive: true })]);
  }
});

// ─── Test 9: formatMarkdown — structure snapshot ──────────────────────────────
test('formatMarkdown: tabela tem linhas corretas e linha de resumo', async () => {
  const before = await makeTmpDir();
  const after  = await makeTmpDir();
  try {
    await writeAggregate(before, {
      'per-001': { n: 5, media: 4.0, std: 0.1 },
      'per-009': { n: 5, media: 3.8, std: 0.3 },
    });
    await writeAggregate(after, {
      'per-001': { n: 5, media: 4.8, std: 0.1 },  // significant
      'per-009': { n: 5, media: 3.9, std: 0.3 },  // noise
    });

    const result = await compareBaselines(before, after);
    const md = formatMarkdown(result, before, after);

    // Deve ter cabeçalho
    assert.ok(md.includes('# Comparação BEFORE vs AFTER'), 'falta cabeçalho');
    // Deve ter 2 linhas de dados (uma por persona)
    const dataLines = md.split('\n').filter(l => l.startsWith('| per-'));
    assert.equal(dataLines.length, 2, `esperado 2 linhas de dados, got ${dataLines.length}`);
    // Deve ter linha de resumo
    assert.ok(md.includes('**Resumo:**'), 'falta linha de resumo');
    // 1 significant, 1 noise
    assert.ok(md.includes('1/2 significant'), `resumo errado: ${md}`);
    assert.ok(md.includes('1/2 noise'), `resumo errado: ${md}`);
  } finally {
    await Promise.all([fs.rm(before, { recursive: true }), fs.rm(after, { recursive: true })]);
  }
});
