import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSystemPrompt } from '../../functions/_lib/prompts/index.js';
import { TENANT_CANONICO, TENANT_CANONICO_EXATO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO } from './fixtures/tenant-canonico.mjs';

const MODOS = [
  { nome: 'faixa', tenant: TENANT_CANONICO },
  { nome: 'exato', tenant: TENANT_CANONICO_EXATO },
];

test('invariante: todos modos contem IDENTIDADE', () => {
  for (const { nome, tenant } of MODOS) {
    const out = generateSystemPrompt(tenant, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /# §1 IDENTIDADE/, `[${nome}] sem secao IDENTIDADE`);
  }
});

test('invariante: todos modos contem CHECKLIST CRITICO', () => {
  for (const { nome, tenant } of MODOS) {
    const out = generateSystemPrompt(tenant, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /# §0 CHECKLIST/, `[${nome}] sem CHECKLIST`);
  }
});

test('invariante: todos modos contem CONTEXTO', () => {
  for (const { nome, tenant } of MODOS) {
    const out = generateSystemPrompt(tenant, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /# §5 CONTEXTO/, `[${nome}] sem CONTEXTO`);
  }
});

test('invariante: todos modos contem REGRAS INVIOLAVEIS', () => {
  for (const { nome, tenant } of MODOS) {
    const out = generateSystemPrompt(tenant, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /# §4 REGRAS INVIOLAVEIS/, `[${nome}] sem REGRAS`);
  }
});

test('invariante: nenhum modo vaza meta-instrucao "system prompt"', () => {
  for (const { nome, tenant } of MODOS) {
    const out = generateSystemPrompt(tenant, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
    assert.doesNotMatch(out, /system prompt|meta-instrucao|prompt engineering/i,
      `[${nome}] vazou meta-instrucao`);
  }
});

test('invariante: separator "---" presente entre blocos', () => {
  for (const { nome, tenant } of MODOS) {
    const out = generateSystemPrompt(tenant, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /\n---\n/, `[${nome}] sem separadores`);
  }
});
