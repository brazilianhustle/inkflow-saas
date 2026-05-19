// Integration test ponta-a-ponta do path novo Cadastro (Fase 2A).
// Mocka openai client; valida que:
// - runAgent retorna ok:true com proxima_acao='handoff' valido
// - payload extraivel via extractCadastroHandoff
// - estado proximo = 'aguardando_tatuador'
// - validador residual force pergunta quando handoff sem email + sem recusa
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../../functions/api/agent/route.js';
import { getNextState, validateAction } from '../../functions/api/agent/router.js';

const FAKE_TENANT = {
  id: 't1', nome_estudio: 'Estudio X', nome_agente: 'Bot',
  plano: 'individual',
  config_agente: { aceita_cobertura: true },
  config_precificacao: {},
  gatilhos_handoff: [], faqs: [], fewshots: [],
  portfolio_urls: [],
};
const FAKE_CONVERSA = {
  id: 'c1', telefone: '+5511999999999',
  estado_agente: 'cadastro',
  dados_coletados: {}, dados_cadastro: {},
};
const FAKE_ENV = {
  OPENAI_API_KEY: 'sk-test',
  AGENT_VERSION: 'test',
  OPENAI_MODEL_AGENT: 'gpt-4o-mini',
};

function makeFakeClient(parsed) {
  return {
    responses: {
      parse: async () => ({ status: 'completed', output_parsed: { output: parsed }, id: 'resp_fake' }),
    },
  };
}

test('runAgent estado=cadastro handoff valido: ok + estado proximo aguardando_tatuador', async () => {
  const fakeOut = {
    proxima_acao: 'handoff',
    resposta_cliente: 'Show, anotei tudo!',
    dados_persistidos: { nome: 'Joao Silva', data_nascimento: '1995-03-12', email: 'joao@example.com' },
    dados_completos: true,
    campos_faltando: [], campos_conflitantes: [],
    email_recusado: false,
    payload_portfolio: null,
  };
  const result = await runAgent({
    env: FAKE_ENV, tenant_id: FAKE_TENANT.id,
    mensagem: 'meu nome eh Joao Silva, nasci em 12/03/1995, email joao@example.com',
    telefone: '+5511999999999',
    historico: [], tenant: FAKE_TENANT,
    estado_atual: 'cadastro', conversa: FAKE_CONVERSA,
    clientContext: {},
    openaiClient: makeFakeClient(fakeOut),
  });
  assert.equal(result.ok, true, `error: ${result.error}`);
  assert.equal(result.proxima_acao, 'handoff');
  assert.equal(result.estado_novo, 'aguardando_tatuador');

  const payload = validateAction('cadastro', fakeOut, {});
  assert.equal(payload.nome, 'Joao Silva');
  assert.equal(payload.data_nascimento, '1995-03-12');

  assert.equal(getNextState('cadastro', fakeOut), 'aguardando_tatuador');
});

test('runAgent estado=cadastro handoff sem email + email_recusado=true: passa', async () => {
  const fakeOut = {
    proxima_acao: 'handoff',
    resposta_cliente: 'tranquilo, anotei sem email',
    dados_persistidos: { nome: 'Maria', data_nascimento: '1990-05-20', email: null },
    dados_completos: true,
    campos_faltando: [], campos_conflitantes: [],
    email_recusado: true,
    payload_portfolio: null,
  };
  const result = await runAgent({
    env: FAKE_ENV, tenant_id: FAKE_TENANT.id,
    mensagem: 'nao quero email',
    telefone: '+5511999999999',
    historico: [], tenant: FAKE_TENANT,
    estado_atual: 'cadastro', conversa: FAKE_CONVERSA,
    clientContext: {},
    openaiClient: makeFakeClient(fakeOut),
  });
  assert.equal(result.ok, true);
  assert.equal(result.proxima_acao, 'handoff');
});

test('runAgent estado=cadastro handoff sem email + email_recusado=false: silently force pergunta', async () => {
  const fakeOut = {
    proxima_acao: 'handoff',
    resposta_cliente: 'beleza',
    dados_persistidos: { nome: 'Pedro', data_nascimento: '1988-01-15', email: null },
    dados_completos: true,
    campos_faltando: [], campos_conflitantes: [],
    email_recusado: false,
    payload_portfolio: null,
  };
  const result = await runAgent({
    env: FAKE_ENV, tenant_id: FAKE_TENANT.id,
    mensagem: 'oi',
    telefone: '+5511999999999',
    historico: [], tenant: FAKE_TENANT,
    estado_atual: 'cadastro', conversa: FAKE_CONVERSA,
    clientContext: {},
    openaiClient: makeFakeClient(fakeOut),
  });
  assert.equal(result.ok, true);
  assert.equal(result.proxima_acao, 'pergunta');
  assert.match(result.resposta_cliente, /email/i);
});

test('runAgent estado=cadastro pergunta: estado proximo permanece cadastro', async () => {
  const fakeOut = {
    proxima_acao: 'pergunta',
    resposta_cliente: 'Qual seu nome?',
    dados_persistidos: { nome: null, data_nascimento: null, email: null },
    dados_completos: false, campos_faltando: ['nome'], campos_conflitantes: [],
    email_recusado: false, payload_portfolio: null,
  };
  const result = await runAgent({
    env: FAKE_ENV, tenant_id: FAKE_TENANT.id,
    mensagem: 'oi',
    telefone: '+5511999999999',
    historico: [], tenant: FAKE_TENANT,
    estado_atual: 'cadastro', conversa: FAKE_CONVERSA,
    clientContext: {},
    openaiClient: makeFakeClient(fakeOut),
  });
  assert.equal(result.ok, true);
  assert.equal(result.proxima_acao, 'pergunta');
  assert.equal(result.estado_novo, 'cadastro');
});

test('runAgent estado=cadastro fallback: retries exhausted -> mensagem amigavel', async () => {
  const fakeClient = {
    responses: {
      parse: async () => { const e = new Error('401'); e.status = 401; throw e; },
    },
  };
  const result = await runAgent({
    env: FAKE_ENV, tenant_id: FAKE_TENANT.id,
    mensagem: 'oi', telefone: '+5511999999999',
    historico: [], tenant: FAKE_TENANT, estado_atual: 'cadastro',
    conversa: FAKE_CONVERSA, clientContext: {},
    openaiClient: fakeClient,
  });
  assert.equal(result.ok, true);
  assert.equal(result.proxima_acao, 'pergunta');
  assert.match(result.resposta_cliente, /segundinho|respondo/i);
});

test('runAgent estado=cadastro handoff com payload bypass schema: hard-fail invariant', async () => {
  // Injeta direto via fake client um output que o schema strict normalmente
  // rejeitaria (data_nascimento nao-ISO). Schema seria barrado em runtime.run real,
  // mas o fake client retorna direto — exercise defesa em profundidade
  // validateAction('cadastro') no route.js.
  const fakeOut = {
    proxima_acao: 'handoff',
    resposta_cliente: 'show',
    dados_persistidos: { nome: 'X', data_nascimento: '99-99-99', email: 'a@b.com' },
    dados_completos: true,
    campos_faltando: [], campos_conflitantes: [],
    email_recusado: false,
    payload_portfolio: null,
  };
  const result = await runAgent({
    env: FAKE_ENV, tenant_id: FAKE_TENANT.id,
    mensagem: 'x',
    telefone: '+5511999999999',
    historico: [], tenant: FAKE_TENANT,
    estado_atual: 'cadastro', conversa: FAKE_CONVERSA,
    clientContext: {},
    openaiClient: makeFakeClient(fakeOut),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'invariant-violation');
  assert.equal(result.status, 500);
  assert.match(result.reason || '', /data_nascimento|invalid_string|regex/i);
});
