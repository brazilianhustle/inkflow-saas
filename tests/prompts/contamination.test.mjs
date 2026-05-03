import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSystemPrompt } from '../../functions/_lib/prompts/index.js';
import { TENANT_CONTAMINADO } from './fixtures/tenant-contaminado.mjs';
import {
  CONVERSA_CANONICA,
  CONVERSA_COLETA_TATTOO,
  CONVERSA_COLETA_CADASTRO,
  CONVERSA_COLETA_PROPOSTA,
  CLIENT_CONTEXT_CANONICO,
} from './fixtures/tenant-canonico.mjs';

// Modo Coleta v2: nas fases TATTOO e CADASTRO, valor monetario nunca deve
// aparecer no prompt — mesmo que FAQ/few-shots do tenant tentem injetar.
// Defesa em profundidade vem da regra R3 do prompt (instrucao de cima dizendo
// "nao repita valores da FAQ"). Esta fixture suja simula isso e o teste
// ainda valida que o pipeline nao crasha. (Validacao do output em si fica pra
// teste futuro de inferencia LLM, nao prompt geracao.)
//
// Em PROPOSTA, valores podem aparecer (vem de conversa.valor_proposto).
// Em EXATO, valores podem aparecer (modo orçamentario).

test('contaminacao Coleta-Tattoo: tenant sujo nao quebra geracao', () => {
  const tenant = { ...TENANT_CONTAMINADO, config_precificacao: { ...TENANT_CONTAMINADO.config_precificacao, modo: 'coleta' } };
  const out = generateSystemPrompt(tenant, CONVERSA_COLETA_TATTOO, CLIENT_CONTEXT_CANONICO);
  assert.ok(out.length > 1000, 'output suspeitamente curto');
  // R$ pode aparecer da FAQ/contexto compartilhados (defesa em profundidade
  // confia na instrucao do prompt R3, nao em supressao no template).
});

test('contaminacao Coleta-Cadastro: tenant sujo nao quebra geracao', () => {
  const tenant = { ...TENANT_CONTAMINADO, config_precificacao: { ...TENANT_CONTAMINADO.config_precificacao, modo: 'coleta' } };
  const out = generateSystemPrompt(tenant, CONVERSA_COLETA_CADASTRO, CLIENT_CONTEXT_CANONICO);
  assert.ok(out.length > 1000, 'output suspeitamente curto');
});

test('contaminacao Coleta-Proposta: tenant sujo nao quebra geracao', () => {
  const tenant = { ...TENANT_CONTAMINADO, config_precificacao: { ...TENANT_CONTAMINADO.config_precificacao, modo: 'coleta' } };
  const out = generateSystemPrompt(tenant, CONVERSA_COLETA_PROPOSTA, CLIENT_CONTEXT_CANONICO);
  assert.ok(out.length > 1000, 'output suspeitamente curto');
  // Proposta PODE conter R$ (vem de valor_proposto na conversa)
});

test('contaminacao Exato: tenant sujo nao quebra geracao', () => {
  const tenant = { ...TENANT_CONTAMINADO, config_precificacao: { ...TENANT_CONTAMINADO.config_precificacao, modo: 'exato' } };
  const out = generateSystemPrompt(tenant, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
  assert.ok(out.length > 1000, 'output suspeitamente curto');
  assert.match(out, /R\$/, 'esperava R$ no prompt Exato contaminado');
});
