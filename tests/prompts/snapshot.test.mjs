// Snapshot tests — comparam prompt gerado contra baseline comitado.
// Pra regerar: UPDATE_SNAPSHOTS=1 node --test tests/prompts/snapshot.test.mjs
//
// Este arquivo importa do dispatcher novo em functions/_lib/prompts/index.js.
// Na primeira execução (Task 3) o dispatcher ainda não existe — ajustamos o
// import em Task 8 pra apontar pro dispatcher. Por enquanto, importa direto do
// legado pra capturar baseline.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// IMPORT PROVISÓRIO — Task 8 muda pra ../../functions/_lib/prompts/index.js
import { generateSystemPrompt } from '../../functions/_lib/generate-prompt.js';

import {
  tenantCanonicoFaixa,
  tenantCanonicoExato,
  conversaVazia,
  clientContextPrimeiroContato,
} from './fixtures/tenant-canonico.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = resolve(__dirname, 'snapshots');
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';

function ensureDir() {
  if (!existsSync(SNAP_DIR)) mkdirSync(SNAP_DIR, { recursive: true });
}

function compareOrWrite(name, actual) {
  ensureDir();
  const path = resolve(SNAP_DIR, `${name}.txt`);
  if (UPDATE || !existsSync(path)) {
    writeFileSync(path, actual, 'utf8');
    return { wrote: true };
  }
  const expected = readFileSync(path, 'utf8');
  assert.equal(
    actual,
    expected,
    `Snapshot ${name} divergiu. Rode UPDATE_SNAPSHOTS=1 pra regerar se a mudança for intencional.`,
  );
  return { wrote: false };
}

test('snapshot: modo faixa — primeiro contato', () => {
  const prompt = generateSystemPrompt(
    tenantCanonicoFaixa,
    conversaVazia,
    clientContextPrimeiroContato,
  );
  compareOrWrite('faixa', prompt);
});

test('snapshot: modo exato — primeiro contato', () => {
  const prompt = generateSystemPrompt(
    tenantCanonicoExato,
    conversaVazia,
    clientContextPrimeiroContato,
  );
  compareOrWrite('exato', prompt);
});

test('invariante inicial: faixa e exato têm mesmo prompt (não diferenciados no PR 1)', () => {
  const pFaixa = generateSystemPrompt(tenantCanonicoFaixa, conversaVazia, clientContextPrimeiroContato);
  const pExato = generateSystemPrompt(tenantCanonicoExato, conversaVazia, clientContextPrimeiroContato);
  // No código atual (antes do PR 1) o prompt não depende de config_precificacao.modo.
  // Capturamos isso pra garantir que o refactor preserva a propriedade.
  assert.equal(pFaixa, pExato, 'fixtures diferem só em modo; prompts devem ser idênticos no PR 1');
});
