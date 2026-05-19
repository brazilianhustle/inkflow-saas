import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CadastroHandoffPayload,
  extractCadastroHandoff,
} from '../../../../functions/_lib/agent-runtime/contracts/cadastro-handoff.js';

test('CadastroHandoffPayload aceita nome + ISO + email valido', () => {
  const ok = CadastroHandoffPayload.safeParse({
    nome: 'Joao Silva',
    data_nascimento: '1995-03-12',
    email: 'joao@example.com',
    email_recusado: false,
  });
  assert.equal(ok.success, true);
});

test('CadastroHandoffPayload aceita email null + email_recusado=true', () => {
  const ok = CadastroHandoffPayload.safeParse({
    nome: 'Joao',
    data_nascimento: '1995-03-12',
    email: null,
    email_recusado: true,
  });
  assert.equal(ok.success, true);
});

test('CadastroHandoffPayload rejeita nome vazio', () => {
  const r = CadastroHandoffPayload.safeParse({
    nome: '', data_nascimento: '1995-03-12', email: null, email_recusado: true,
  });
  assert.equal(r.success, false);
});

test('CadastroHandoffPayload rejeita data_nascimento nao-ISO', () => {
  const r = CadastroHandoffPayload.safeParse({
    nome: 'Joao', data_nascimento: '12/03/1995', email: null, email_recusado: true,
  });
  assert.equal(r.success, false);
});

test('CadastroHandoffPayload rejeita email malformado', () => {
  const r = CadastroHandoffPayload.safeParse({
    nome: 'Joao', data_nascimento: '1995-03-12',
    email: 'nao-eh-email', email_recusado: false,
  });
  assert.equal(r.success, false);
});

test('extractCadastroHandoff: proxima_acao !== handoff retorna null', () => {
  const out = { proxima_acao: 'pergunta', dados_persistidos: {} };
  assert.equal(extractCadastroHandoff(out), null);
});

test('extractCadastroHandoff: handoff valido extrai payload', () => {
  const out = {
    proxima_acao: 'handoff',
    resposta_cliente: 'show!',
    dados_persistidos: { nome: 'Joao', data_nascimento: '1995-03-12', email: null },
    email_recusado: true,
    dados_completos: true,
    campos_faltando: [], campos_conflitantes: [],
    payload_portfolio: null,
  };
  const payload = extractCadastroHandoff(out);
  assert.equal(payload.nome, 'Joao');
  assert.equal(payload.email_recusado, true);
  assert.equal(payload.email, null);
});

test('extractCadastroHandoff: shape invalido lanca ZodError', () => {
  const out = {
    proxima_acao: 'handoff',
    dados_persistidos: { nome: '', data_nascimento: 'nao-iso', email: 'invalido' },
    email_recusado: false,
  };
  assert.throws(() => extractCadastroHandoff(out));
});
