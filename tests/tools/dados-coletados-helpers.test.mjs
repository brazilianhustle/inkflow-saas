// Testes dos helpers puros da tool dados_coletados (parser de data + idade).
// Integration tests com mock Supabase ficam pra fase de testes de tool full.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarData, calcularIdade } from '../../functions/api/tools/dados-coletados.js';

// ── normalizarData ─────────────────────────────────────────────────────────

test('normalizarData: ISO direto passa', () => {
  assert.equal(normalizarData('1995-03-12'), '1995-03-12');
});

test('normalizarData: DD/MM/YYYY converte', () => {
  assert.equal(normalizarData('12/03/1995'), '1995-03-12');
  assert.equal(normalizarData('1/1/2000'), '2000-01-01');
  assert.equal(normalizarData('31/12/1990'), '1990-12-31');
});

test('normalizarData: DD-MM-YYYY converte', () => {
  assert.equal(normalizarData('12-03-1995'), '1995-03-12');
});

test('normalizarData: "DD de MES de YYYY" pt-BR converte', () => {
  assert.equal(normalizarData('12 de marco de 1995'), '1995-03-12');
  assert.equal(normalizarData('1 de janeiro de 2000'), '2000-01-01');
  assert.equal(normalizarData('15 de novembro de 1985'), '1985-11-15');
});

test('normalizarData: aceita abreviacoes de mes', () => {
  assert.equal(normalizarData('12 de mar de 1995'), '1995-03-12');
  assert.equal(normalizarData('15 de nov de 1985'), '1985-11-15');
});

test('normalizarData: case insensitive', () => {
  assert.equal(normalizarData('12 DE MARCO DE 1995'), '1995-03-12');
  assert.equal(normalizarData('12 De Janeiro De 2000'), '2000-01-12');
});

test('normalizarData: rejeita formato so com ano', () => {
  assert.equal(normalizarData('1995'), null);
});

test('normalizarData: rejeita ano fora de range', () => {
  assert.equal(normalizarData('12/03/1899'), null);
  assert.equal(normalizarData('12/03/2101'), null);
});

test('normalizarData: rejeita mes invalido', () => {
  assert.equal(normalizarData('12/13/1995'), null);
  assert.equal(normalizarData('12 de invalido de 1995'), null);
});

test('normalizarData: rejeita dia invalido (31/02)', () => {
  assert.equal(normalizarData('31/02/1995'), null);
});

test('normalizarData: rejeita string vazia/null/undefined', () => {
  assert.equal(normalizarData(''), null);
  assert.equal(normalizarData(null), null);
  assert.equal(normalizarData(undefined), null);
  assert.equal(normalizarData('   '), null);
});

test('normalizarData: rejeita formato lixo', () => {
  assert.equal(normalizarData('blablabla'), null);
  assert.equal(normalizarData('12345'), null);
});

// ── calcularIdade ──────────────────────────────────────────────────────────

test('calcularIdade: pessoa maior de idade', () => {
  // 1980-06-15 — em 2026-05-03 tem 45 anos
  const idade = calcularIdade('1980-06-15');
  assert.ok(idade >= 44 && idade <= 46, `esperado ~45, recebeu ${idade}`);
});

test('calcularIdade: pessoa menor de idade', () => {
  // Data 5 anos atras = 5 anos. Data NoVo = 0 anos.
  const cincoAnos = new Date();
  cincoAnos.setFullYear(cincoAnos.getFullYear() - 5);
  const iso = cincoAnos.toISOString().slice(0, 10);
  const idade = calcularIdade(iso);
  assert.ok(idade >= 4 && idade <= 5, `esperado 4-5, recebeu ${idade}`);
  assert.ok(idade < 18, 'menor de idade nao deveria passar 18');
});

test('calcularIdade: aniversario hoje', () => {
  const hoje = new Date();
  const dataNasc = new Date(hoje);
  dataNasc.setFullYear(hoje.getFullYear() - 30);
  const iso = dataNasc.toISOString().slice(0, 10);
  const idade = calcularIdade(iso);
  assert.equal(idade, 30, 'aniversario hoje, idade exata');
});

test('calcularIdade: data invalida retorna null', () => {
  assert.equal(calcularIdade('xxxx-xx-xx'), null);
  assert.equal(calcularIdade(null), null);
  assert.equal(calcularIdade(''), null);
});
