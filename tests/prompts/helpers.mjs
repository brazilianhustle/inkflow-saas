import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function snapshotPath(name) {
  return path.join(__dirname, 'snapshots', `${name}.txt`);
}

export function readSnapshot(name) {
  return fs.readFileSync(snapshotPath(name), 'utf8');
}

export function writeSnapshot(name, content) {
  fs.mkdirSync(path.dirname(snapshotPath(name)), { recursive: true });
  fs.writeFileSync(snapshotPath(name), content, 'utf8');
}

// Estimativa simples de tokens: 1 token ≈ 4 chars em pt-BR (suficiente
// pra contratos max_tokens — não precisa do tokenizer real).
export function approxTokens(text) {
  return Math.ceil(text.length / 4);
}
