import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCadastroOutputInvariant as _vc } from '../../functions/api/agent/agents/cadastro.js';

test('Cadastro invariant: enviar_portfolio com portfolio_disponivel=true -> valid', () => {
  const out = {
    resposta_cliente: 'te mando',
    dados_persistidos: { nome: null, data_nascimento: null, email: null },
    dados_completos: false,
    campos_faltando: ['nome', 'data_nascimento'],
    campos_conflitantes: [],
    email_recusado: false,
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: null, max: null, motivo: null },
  };
  const r = _vc(out, { portfolio_disponivel: true });
  assert.equal(r.valid, true);
});

test('Cadastro invariant: enviar_portfolio com portfolio_disponivel=false -> invalid', () => {
  const out = {
    resposta_cliente: 'te mando',
    dados_persistidos: { nome: null, data_nascimento: null, email: null },
    dados_completos: false,
    campos_faltando: [],
    campos_conflitantes: [],
    email_recusado: false,
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: null, max: null, motivo: null },
  };
  const r = _vc(out, { portfolio_disponivel: false });
  assert.equal(r.valid, false);
  assert.match(r.reason, /portfolio_disponivel=false/);
});

test('Cadastro invariant: enviar_portfolio sem payload_portfolio -> invalid', () => {
  const out = {
    resposta_cliente: 'te mando',
    dados_persistidos: {},
    dados_completos: false,
    campos_faltando: [],
    campos_conflitantes: [],
    email_recusado: false,
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: null,
  };
  const r = _vc(out, { portfolio_disponivel: true });
  assert.equal(r.valid, false);
  assert.match(r.reason, /payload_portfolio/);
});

test('Cadastro invariant: handoff existente continua passando (regression)', () => {
  const out = {
    resposta_cliente: 'fim',
    dados_persistidos: { nome: 'Joao', data_nascimento: '1995-03-12', email: null },
    dados_completos: true,
    campos_faltando: [],
    campos_conflitantes: [],
    email_recusado: true,
    proxima_acao: 'handoff',
    payload_portfolio: null,
  };
  const r = _vc(out, { portfolio_disponivel: false });
  assert.equal(r.valid, true);
});
