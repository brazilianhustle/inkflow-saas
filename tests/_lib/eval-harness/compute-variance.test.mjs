import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { computeAggregate } from '../../../evals/inkflow-agent/_harness/compute-variance.mjs';

async function makeTmpDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'eval-variance-test-'));
}

async function writeReport(dir, name, results) {
  await fs.writeFile(
    path.join(dir, name),
    JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2),
  );
}

test('computeAggregate: agrupa por persona e calcula min/max/range/média de nat', async () => {
  const dir = await makeTmpDir();
  try {
    await writeReport(dir, 'per-001-r1.json', [{
      id: 'per-001',
      status: 'pass',
      scores: { naturalidade: { media: 4.2 }, manifesto: { m1_manifesto_adherence: 0.95 }, state: { pass: true } },
    }]);
    await writeReport(dir, 'per-001-r2.json', [{
      id: 'per-001',
      status: 'pass',
      scores: { naturalidade: { media: 4.8 }, manifesto: { m1_manifesto_adherence: 0.9 }, state: { pass: true } },
    }]);
    const agg = await computeAggregate(dir);
    assert.equal(agg['per-001'].nat.min, 4.2);
    assert.equal(agg['per-001'].nat.max, 4.8);
    assert.equal(Number(agg['per-001'].nat.range.toFixed(4)), 0.6);
    assert.equal(Number(agg['per-001'].nat.media.toFixed(4)), 4.5);
    assert.equal(agg['per-001'].state_pass_rate, 1);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});

test('computeAggregate: conta violations citando tamanho_cm', async () => {
  const dir = await makeTmpDir();
  try {
    await writeReport(dir, 'per-010-r1.json', [{
      id: 'per-010',
      status: 'fail',
      scores: {
        naturalidade: { media: 4.0 },
        manifesto: { m1_manifesto_adherence: 0.7, violations: ['faltou tamanho_cm', 'P5 jargao'] },
        state: { pass: false },
      },
    }]);
    await writeReport(dir, 'per-010-r2.json', [{
      id: 'per-010',
      status: 'fail',
      scores: {
        naturalidade: { media: 4.1 },
        manifesto: { m1_manifesto_adherence: 0.75, violations: ['bot pediu tamanho_cm proativo'] },
        state: { pass: true },
      },
    }]);
    const agg = await computeAggregate(dir);
    assert.equal(agg['per-010'].tamanho_cm_violations.length, 2);
    assert.ok(agg['per-010'].tamanho_cm_violations[0].includes('tamanho_cm'));
    assert.equal(agg['per-010'].state_pass_rate, 0.5);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});

test('computeAggregate: ignora reports com status error', async () => {
  const dir = await makeTmpDir();
  try {
    await writeReport(dir, 'per-009-r1.json', [{ id: 'per-009', status: 'error', error: 'http 502' }]);
    await writeReport(dir, 'per-009-r2.json', [{
      id: 'per-009',
      status: 'pass',
      scores: { naturalidade: { media: 4.5 }, manifesto: { m1_manifesto_adherence: 1 }, state: { pass: true } },
    }]);
    const agg = await computeAggregate(dir);
    assert.equal(agg['per-009'].nat.n, 1);
    assert.equal(agg['per-009'].nat.min, 4.5);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});

test('computeAggregate: grava aggregate.json no dir', async () => {
  const dir = await makeTmpDir();
  try {
    await writeReport(dir, 'per-001-r1.json', [{
      id: 'per-001',
      status: 'pass',
      scores: { naturalidade: { media: 4.0 }, manifesto: { m1_manifesto_adherence: 1 }, state: { pass: true } },
    }]);
    await computeAggregate(dir);
    const written = JSON.parse(await fs.readFile(path.join(dir, 'aggregate.json'), 'utf-8'));
    assert.ok(written['per-001']);
    assert.equal(written['per-001'].nat.media, 4.0);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});
