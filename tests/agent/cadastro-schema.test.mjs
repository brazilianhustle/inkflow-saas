import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CadastroOutputSchema } from '../../functions/api/agent/agents/cadastro-schema.js';

const DADOS_VAZIOS = { nome: null, data_nascimento: null, email: null };

// ─── Branch 'pergunta' ─────────────────────────────────────────────────

test('pergunta valido com campos_faltando nao-vazio passa', () => {
  const ok = CadastroOutputSchema.safeParse({
    proxima_acao: 'pergunta',
    resposta_cliente: 'Qual seu nome?',
    dados_persistidos: DADOS_VAZIOS,
    dados_completos: false,
    campos_faltando: ['nome'],
    campos_conflitantes: [],
    email_recusado: false,
    payload_portfolio: null,
  });
  assert.equal(ok.success, true);
});

test('pergunta com dados_completos=true e REJEITADO (literal:false)', () => {
  const r = CadastroOutputSchema.safeParse({
    proxima_acao: 'pergunta',
    resposta_cliente: 'qual nome?',
    dados_persistidos: DADOS_VAZIOS,
    dados_completos: true,
    campos_faltando: ['nome'], campos_conflitantes: [],
    email_recusado: false, payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

test('pergunta com campos_faltando vazio e REJEITADO (min:1)', () => {
  const r = CadastroOutputSchema.safeParse({
    proxima_acao: 'pergunta',
    resposta_cliente: 'oi',
    dados_persistidos: DADOS_VAZIOS,
    dados_completos: false, campos_faltando: [], campos_conflitantes: [],
    email_recusado: false, payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

// ─── Branch 'handoff' ──────────────────────────────────────────────────

test('handoff com nome + ISO + email passa', () => {
  const ok = CadastroOutputSchema.safeParse({
    proxima_acao: 'handoff',
    resposta_cliente: 'show, vou te passar',
    dados_persistidos: { nome: 'Joao', data_nascimento: '1995-03-12', email: 'j@x.com' },
    dados_completos: true,
    campos_faltando: [], campos_conflitantes: [],
    email_recusado: false, payload_portfolio: null,
  });
  assert.equal(ok.success, true);
});

test('handoff com email null + email_recusado=true passa', () => {
  const ok = CadastroOutputSchema.safeParse({
    proxima_acao: 'handoff',
    resposta_cliente: 'show',
    dados_persistidos: { nome: 'Joao', data_nascimento: '1995-03-12', email: null },
    dados_completos: true,
    campos_faltando: [], campos_conflitantes: [],
    email_recusado: true, payload_portfolio: null,
  });
  assert.equal(ok.success, true);
});

test('handoff sem nome e REJEITADO (non-nullable)', () => {
  const r = CadastroOutputSchema.safeParse({
    proxima_acao: 'handoff',
    resposta_cliente: 'x',
    dados_persistidos: { nome: null, data_nascimento: '1995-03-12', email: null },
    dados_completos: true, campos_faltando: [], campos_conflitantes: [],
    email_recusado: true, payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

test('handoff com data_nascimento nao-ISO e REJEITADO (regex)', () => {
  const r = CadastroOutputSchema.safeParse({
    proxima_acao: 'handoff',
    resposta_cliente: 'x',
    dados_persistidos: { nome: 'Joao', data_nascimento: '12/03/1995', email: null },
    dados_completos: true, campos_faltando: [], campos_conflitantes: [],
    email_recusado: true, payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

test('handoff com dados_completos=false e REJEITADO (literal:true)', () => {
  const r = CadastroOutputSchema.safeParse({
    proxima_acao: 'handoff',
    resposta_cliente: 'x',
    dados_persistidos: { nome: 'Joao', data_nascimento: '1995-03-12', email: null },
    dados_completos: false, campos_faltando: [], campos_conflitantes: [],
    email_recusado: true, payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

test('handoff com campos_conflitantes nao-vazio e REJEITADO (length:0)', () => {
  const r = CadastroOutputSchema.safeParse({
    proxima_acao: 'handoff',
    resposta_cliente: 'x',
    dados_persistidos: { nome: 'Joao', data_nascimento: '1995-03-12', email: null },
    dados_completos: true, campos_faltando: [],
    campos_conflitantes: ['nome'],
    email_recusado: true, payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

// ─── Branch 'enviar_portfolio' ─────────────────────────────────────────

test('enviar_portfolio com payload_portfolio nao-null passa', () => {
  const ok = CadastroOutputSchema.safeParse({
    proxima_acao: 'enviar_portfolio',
    resposta_cliente: 'aqui vai uma referencia',
    dados_persistidos: DADOS_VAZIOS,
    dados_completos: false, campos_faltando: ['nome'], campos_conflitantes: [],
    email_recusado: false,
    payload_portfolio: { estilo: 'fineline', max: 3, motivo: 'cliente pediu' },
  });
  assert.equal(ok.success, true);
});

test('enviar_portfolio com payload_portfolio null e REJEITADO', () => {
  const r = CadastroOutputSchema.safeParse({
    proxima_acao: 'enviar_portfolio',
    resposta_cliente: 'oi',
    dados_persistidos: DADOS_VAZIOS,
    dados_completos: false, campos_faltando: ['nome'], campos_conflitantes: [],
    email_recusado: false, payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

// ─── Branch 'erro' ─────────────────────────────────────────────────────

test('erro com mensagem amigavel passa', () => {
  const ok = CadastroOutputSchema.safeParse({
    proxima_acao: 'erro',
    resposta_cliente: 'Tive um problema, podes mandar de novo?',
    dados_persistidos: DADOS_VAZIOS,
    dados_completos: false, campos_faltando: [], campos_conflitantes: [],
    email_recusado: false, payload_portfolio: null,
  });
  assert.equal(ok.success, true);
});

// ─── Discriminator ──────────────────────────────────────────────────────

test('proxima_acao desconhecido e REJEITADO', () => {
  const r = CadastroOutputSchema.safeParse({
    proxima_acao: 'xyz',
    resposta_cliente: 'oi',
    dados_persistidos: DADOS_VAZIOS,
    dados_completos: false, campos_faltando: [], campos_conflitantes: [],
    email_recusado: false, payload_portfolio: null,
  });
  assert.equal(r.success, false);
});
