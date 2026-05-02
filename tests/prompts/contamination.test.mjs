import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSystemPrompt } from '../../functions/_lib/prompts/index.js';
import { TENANT_CONTAMINADO } from './fixtures/tenant-contaminado.mjs';
import { CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO } from './fixtures/tenant-canonico.mjs';

// PR 1: Faixa/Exato PODEM falar valor — fixture suja vai vazar nos prompts
// e isso e ESPERADO (sao modos que orcam). Test garante que o pipeline NAO
// crasha com FAQ/few-shots contaminados.
//
// PR 2: vai expandir pra Coleta-Info (modo onde R3 deve suprimir R$/valor)
// e adicionar assertion que /R\$|reais|sinal/ NUNCA aparece em Coleta.

test('contaminacao Faixa: tenant sujo nao quebra geracao', () => {
  const tenantFaixa = { ...TENANT_CONTAMINADO, config_precificacao: { ...TENANT_CONTAMINADO.config_precificacao, modo: 'faixa' } };
  const out = generateSystemPrompt(tenantFaixa, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
  assert.ok(out.length > 1000, 'output suspeitamente curto');
  // Faixa PODE falar valor, entao R$ na FAQ EH esperado aparecer no prompt.
  assert.match(out, /R\$/, 'esperava R$ no prompt Faixa contaminado');
});

test('contaminacao Exato: tenant sujo nao quebra geracao', () => {
  const tenantExato = { ...TENANT_CONTAMINADO, config_precificacao: { ...TENANT_CONTAMINADO.config_precificacao, modo: 'exato' } };
  const out = generateSystemPrompt(tenantExato, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
  assert.ok(out.length > 1000, 'output suspeitamente curto');
  assert.match(out, /R\$/, 'esperava R$ no prompt Exato contaminado');
});
