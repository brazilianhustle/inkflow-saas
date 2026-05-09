// Unit tests pro helper enforceMenorIdade (Sub-3.1).
// Roda em CI via npm test (glob *.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcIdade, enforceMenorIdade } from '../../functions/api/agent/_lib/enforce-menor-idade.js';

test('calcIdade — data ISO valida retorna idade correta', () => {
  // Cliente nasceu em 2000-01-01, hoje 2026-05-08 → 26 anos.
  assert.equal(calcIdade('2000-01-01'), 26);
});

test('calcIdade — data nao-ISO retorna null', () => {
  assert.equal(calcIdade('12/03/1995'), null);
  assert.equal(calcIdade(''), null);
  assert.equal(calcIdade(null), null);
  assert.equal(calcIdade(undefined), null);
});

test('enforceMenorIdade — maior de idade: out unchanged', () => {
  const out = {
    resposta_cliente: 'Anotei tudo!',
    dados_persistidos: { nome: 'Maria', data_nascimento: '2000-03-12', email: null },
    dados_completos: true,
    campos_faltando: [],
    campos_conflitantes: [],
    email_recusado: true,
    proxima_acao: 'handoff',
  };
  const result = enforceMenorIdade(out);
  assert.equal(result, out, 'out deve ser retornado sem alteracao (mesma referencia OK)');
  assert.equal(result.proxima_acao, 'handoff');
});

test('enforceMenorIdade — menor de idade: forca proxima_acao=erro + resposta padronizada', () => {
  const out = {
    resposta_cliente: 'Anotei tudo!',
    dados_persistidos: { nome: 'Junior', data_nascimento: '2015-03-12', email: null },
    dados_completos: true,
    campos_faltando: [],
    campos_conflitantes: [],
    email_recusado: true,
    proxima_acao: 'handoff',
  };
  const result = enforceMenorIdade(out);
  assert.equal(result.proxima_acao, 'erro');
  assert.match(result.resposta_cliente, /18 anos/);
  assert.ok(result.campos_faltando.includes('menor_idade_trigger'));
});

test('enforceMenorIdade — data ausente ou nao-ISO: out unchanged', () => {
  const outNull = {
    dados_persistidos: { data_nascimento: null },
    proxima_acao: 'pergunta',
    campos_faltando: [],
  };
  assert.equal(enforceMenorIdade(outNull).proxima_acao, 'pergunta');

  const outInvalid = {
    dados_persistidos: { data_nascimento: '12/03/1995' },
    proxima_acao: 'pergunta',
    campos_faltando: [],
  };
  assert.equal(enforceMenorIdade(outInvalid).proxima_acao, 'pergunta');
});
