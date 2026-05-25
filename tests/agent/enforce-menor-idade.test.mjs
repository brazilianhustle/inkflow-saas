// Unit tests pro helper enforceMenorIdade (Sub-3.1).
// Roda em CI via npm test (glob *.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcIdade, enforceMenorIdade, extractIsoDateFromText } from '../../functions/api/agent/_lib/enforce-menor-idade.js';

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

test('extractIsoDateFromText — formatos comuns viram ISO', () => {
  assert.equal(extractIsoDateFromText('nasci em 12/03/2015'), '2015-03-12');
  assert.equal(extractIsoDateFromText('2015-03-12'), '2015-03-12');
  assert.equal(extractIsoDateFromText('tenho 16 anos'), null);
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
  assert.match(result.resposta_cliente, /menos de 18 anos/);
  assert.match(result.resposta_cliente, /respons[aá]vel legal/);
  assert.doesNotMatch(result.resposta_cliente, /ja sinalizei|já sinalizei/i);
  assert.equal(result.escalation.reason_code, 'minor_age');
  assert.equal(result.escalation.requires_orcid, false);
  assert.ok(result.campos_faltando.includes('menor_idade_trigger'));
});

test('enforceMenorIdade — menoridade explicita na mensagem corrige LLM que nao persistiu data', () => {
  const out = {
    resposta_cliente: 'Pode mandar a data em outro formato?',
    dados_persistidos: { nome: 'Junior' },
    dados_completos: false,
    campos_faltando: ['data_nascimento'],
    campos_conflitantes: [],
    proxima_acao: 'pergunta',
  };
  const result = enforceMenorIdade(out, 'nasci em 12/03/2015');
  assert.equal(result.proxima_acao, 'erro');
  assert.equal(result.dados_persistidos.data_nascimento, '2015-03-12');
  assert.equal(result.escalation.source, 'mensagem');
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
