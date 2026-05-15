// eval-schema-lint.test.mjs — valida schema dos directed evals do TattooAgent
// pra programa InkFlow Agent (Sub 1.A). Campos obrigatórios incluem extensões
// novas: persona, manifesto_principles_aplicaveis.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TATTOO_DIR = path.resolve(__dirname, '../../evals/inkflow-agent/directed/tattoo');

const REQUIRED_TOP = ['id', 'titulo', 'descricao', 'estado_atual', 'persona', 'turns_cliente', 'expected', 'thresholds'];
const REQUIRED_EXPECTED = ['proxima_acao_esperada', 'manifesto_principles_aplicaveis'];
const VALID_PRINCIPLES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
const VALID_PERSONAS = /^PER-0(0[1-9]|1[0-5])$/;

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile() && p.endsWith('.json')) yield p;
  }
}

test('eval-schema-lint: directory contains at least 3 JSONs (PER-001/009/010)', () => {
  const files = [...walk(TATTOO_DIR)];
  assert.ok(files.length >= 3, `esperava >=3 evals em ${TATTOO_DIR}, achei ${files.length}`);
});

test('eval-schema-lint: cada JSON tem campos obrigatórios top-level', () => {
  for (const file of walk(TATTOO_DIR)) {
    const data = JSON.parse(readFileSync(file, 'utf-8'));
    for (const k of REQUIRED_TOP) {
      assert.ok(k in data, `${file}: missing top-level "${k}"`);
    }
    assert.ok(Array.isArray(data.turns_cliente) && data.turns_cliente.length > 0, `${file}: turns_cliente vazio`);
    assert.match(data.persona, VALID_PERSONAS, `${file}: persona "${data.persona}" inválida`);
  }
});

test('eval-schema-lint: expected.manifesto_principles_aplicaveis válido', () => {
  for (const file of walk(TATTOO_DIR)) {
    const data = JSON.parse(readFileSync(file, 'utf-8'));
    for (const k of REQUIRED_EXPECTED) {
      assert.ok(k in data.expected, `${file}: missing expected.${k}`);
    }
    assert.ok(
      Array.isArray(data.expected.manifesto_principles_aplicaveis) && data.expected.manifesto_principles_aplicaveis.length > 0,
      `${file}: manifesto_principles_aplicaveis vazio`,
    );
    for (const p of data.expected.manifesto_principles_aplicaveis) {
      assert.ok(VALID_PRINCIPLES.includes(p), `${file}: principle "${p}" inválido`);
    }
  }
});

test('eval-schema-lint: thresholds têm naturalidade_min e manifesto_adherence_min', () => {
  for (const file of walk(TATTOO_DIR)) {
    const data = JSON.parse(readFileSync(file, 'utf-8'));
    assert.equal(typeof data.thresholds.naturalidade_min, 'number', `${file}: thresholds.naturalidade_min ausente/inválido`);
    assert.equal(typeof data.thresholds.manifesto_adherence_min, 'number', `${file}: thresholds.manifesto_adherence_min ausente/inválido`);
  }
});
