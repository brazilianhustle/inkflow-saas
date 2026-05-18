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

// ─── invariants section tests ────────────────────────────────────────────────

// Helper transcripts
const TRANSCRIPT_CLEAN = [
  { role: 'user', content: 'quero uma rosa no ombro' },
  { role: 'assistant', content: 'Que ideia linda!' },
  { role: 'user', content: 'fineline, uns 10cm' },
  { role: 'assistant', proxima_acao: 'handoff', content: 'Perfeito, vou encaminhar.', dados_persistidos: {
    descricao_curta: 'rosa fineline', local_corpo: 'ombro', altura_cm: 10, estilo: 'fineline',
  }},
];

const TRANSCRIPT_P1_VIOLATION = [
  { role: 'user', content: 'quero uma borboleta' },
  { role: 'assistant', content: 'Que tal um tamanho de 15cm?' },
];

const TRANSCRIPT_NO_HANDOFF = [
  { role: 'user', content: 'só quero saber sobre preços' },
  { role: 'assistant', content: 'Claro!' },
];

test('computeAggregate: transcript presente → seção invariants populada com pass_rate', async () => {
  const dir = await makeTmpDir();
  try {
    await writeReport(dir, 'per-020-r1.json', [{
      id: 'per-020',
      status: 'pass',
      scores: { naturalidade: { media: 4.5 }, manifesto: { m1_manifesto_adherence: 1 }, state: { pass: true } },
      transcript: TRANSCRIPT_CLEAN,
      final_dados_persistidos: { descricao_curta: 'rosa fineline', local_corpo: 'ombro', altura_cm: 10, estilo: 'fineline' },
    }]);
    const agg = await computeAggregate(dir);
    const inv = agg['per-020'].invariants;
    assert.ok(inv, 'invariants section deve existir');
    // I-P1: clean transcript (no cm suggestion) → pass
    assert.equal(inv['I-P1'].n, 1);
    assert.equal(inv['I-P1'].pass, 1);
    assert.equal(inv['I-P1'].pass_rate, 1.0);
    // I-P4: no anti-patterns → pass
    assert.equal(inv['I-P4'].n, 1);
    assert.equal(inv['I-P4'].pass, 1);
    assert.equal(inv['I-P4'].pass_rate, 1.0);
    // I-tamanho_cm: no violation → pass
    assert.equal(inv['I-tamanho_cm'].n, 1);
    assert.equal(inv['I-tamanho_cm'].pass, 1);
    assert.equal(inv['I-tamanho_cm'].pass_rate, 1.0);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});

test('computeAggregate: transcript ausente (legacy report) → n=0 para I-P1/I-P2/I-P4', async () => {
  const dir = await makeTmpDir();
  try {
    await writeReport(dir, 'per-021-r1.json', [{
      id: 'per-021',
      status: 'pass',
      scores: { naturalidade: { media: 4.0 }, manifesto: { m1_manifesto_adherence: 1, violations: [] }, state: { pass: true } },
      // no transcript field
    }]);
    const agg = await computeAggregate(dir);
    const inv = agg['per-021'].invariants;
    assert.ok(inv, 'invariants section deve existir mesmo sem transcript');
    assert.equal(inv['I-P1'].n, 0);
    assert.equal(inv['I-P2'].n, 0);
    assert.equal(inv['I-P4'].n, 0);
    assert.equal(inv['I-P1'].pass_rate, null);
    // I-tamanho_cm still populated from violations data
    assert.equal(inv['I-tamanho_cm'].n, 1);
    assert.equal(inv['I-tamanho_cm'].pass, 1);
    assert.equal(inv['I-tamanho_cm'].pass_rate, 1.0);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});

test('computeAggregate: misto (alguns com transcript, outros sem) → conta só os com transcript', async () => {
  const dir = await makeTmpDir();
  try {
    // r1: has transcript with P1 violation
    await writeReport(dir, 'per-022-r1.json', [{
      id: 'per-022',
      status: 'fail',
      scores: { naturalidade: { media: 3.5 }, manifesto: { m1_manifesto_adherence: 0.6, violations: [] }, state: { pass: false } },
      transcript: TRANSCRIPT_P1_VIOLATION,
      final_dados_persistidos: {},
    }]);
    // r2: legacy, no transcript
    await writeReport(dir, 'per-022-r2.json', [{
      id: 'per-022',
      status: 'pass',
      scores: { naturalidade: { media: 4.5 }, manifesto: { m1_manifesto_adherence: 1, violations: [] }, state: { pass: true } },
      // no transcript
    }]);
    // r3: has transcript, clean
    await writeReport(dir, 'per-022-r3.json', [{
      id: 'per-022',
      status: 'pass',
      scores: { naturalidade: { media: 4.2 }, manifesto: { m1_manifesto_adherence: 1, violations: [] }, state: { pass: true } },
      transcript: TRANSCRIPT_CLEAN,
      final_dados_persistidos: { descricao_curta: 'rosa fineline', local_corpo: 'ombro', altura_cm: 10, estilo: 'fineline' },
    }]);
    const agg = await computeAggregate(dir);
    const inv = agg['per-022'].invariants;
    // Only r1 and r3 have transcripts → n=2 for I-P1
    assert.equal(inv['I-P1'].n, 2);
    // r1 violates I-P1, r3 passes → pass=1
    assert.equal(inv['I-P1'].pass, 1);
    assert.equal(Number(inv['I-P1'].pass_rate.toFixed(4)), 0.5);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});

test('computeAggregate: I-tamanho_cm sintetizado corretamente de violations (2 violações, 3 limpos → 0.6)', async () => {
  const dir = await makeTmpDir();
  try {
    const makeResult = (runId, hasViolation) => ({
      id: 'per-023',
      status: 'pass',
      scores: {
        naturalidade: { media: 4.0 },
        manifesto: {
          m1_manifesto_adherence: 0.9,
          violations: hasViolation ? ['P2 - faltou tamanho_cm no handoff'] : [],
        },
        state: { pass: true },
      },
    });
    await writeReport(dir, 'per-023-r1.json', [makeResult('r1', true)]);
    await writeReport(dir, 'per-023-r2.json', [makeResult('r2', true)]);
    await writeReport(dir, 'per-023-r3.json', [makeResult('r3', false)]);
    await writeReport(dir, 'per-023-r4.json', [makeResult('r4', false)]);
    await writeReport(dir, 'per-023-r5.json', [makeResult('r5', false)]);
    const agg = await computeAggregate(dir);
    const inv = agg['per-023'].invariants;
    assert.equal(inv['I-tamanho_cm'].n, 5);
    assert.equal(inv['I-tamanho_cm'].pass, 3);
    assert.equal(Number(inv['I-tamanho_cm'].pass_rate.toFixed(4)), 0.6);
    // backward-compat: tamanho_cm_violations array preserved with 2 strings
    assert.equal(agg['per-023'].tamanho_cm_violations.length, 2);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});

test('computeAggregate: I-P2 retorna null quando não há handoff → excluído do n', async () => {
  const dir = await makeTmpDir();
  try {
    // r1: transcript with no handoff turn → I-P2 returns null
    await writeReport(dir, 'per-024-r1.json', [{
      id: 'per-024',
      status: 'pass',
      scores: { naturalidade: { media: 4.0 }, manifesto: { m1_manifesto_adherence: 0.9, violations: [] }, state: { pass: true } },
      transcript: TRANSCRIPT_NO_HANDOFF,
      final_dados_persistidos: {},
    }]);
    // r2: transcript with handoff and all required fields
    await writeReport(dir, 'per-024-r2.json', [{
      id: 'per-024',
      status: 'pass',
      scores: { naturalidade: { media: 4.5 }, manifesto: { m1_manifesto_adherence: 1, violations: [] }, state: { pass: true } },
      transcript: TRANSCRIPT_CLEAN,
      final_dados_persistidos: { descricao_curta: 'rosa fineline', local_corpo: 'ombro', altura_cm: 10, estilo: 'fineline' },
    }]);
    const agg = await computeAggregate(dir);
    const inv = agg['per-024'].invariants;
    // r1 I-P2 returns null (no handoff) → excluded; r2 I-P2 returns true → n=1, pass=1
    assert.equal(inv['I-P2'].n, 1);
    assert.equal(inv['I-P2'].pass, 1);
    assert.equal(inv['I-P2'].pass_rate, 1.0);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});
