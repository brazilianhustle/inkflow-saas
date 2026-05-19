import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../../functions/api/agent/route.js';

const FAKE_TENANT = {
  id: 't1', nome_estudio: 'Estudio X', nome_agente: 'Bot',
  config_agente: {}, config_precificacao: { sinal_percentual: 30 },
  gatilhos_handoff: [], faqs: [], fewshots: [], fewshots_por_modo: {},
  plano: 'individual',
};
const FAKE_CONVERSA = {
  id: 'c1', telefone: '+5511', valor_proposto: 750,
  dados_coletados: {}, dados_cadastro: { nome: 'Cli' },
};

// Fake fetch pra mockar todos os callTool (prefetch + side-effects)
function setupFakeFetch(handlers) {
  globalThis.fetch = async (url) => {
    const u = typeof url === 'string' ? url : url.toString();
    const matched = Object.keys(handlers).find(k => u.includes(k));
    if (!matched) return new Response('{"ok":true,"slots":[]}', { status: 200 });
    return new Response(JSON.stringify(handlers[matched]), { status: 200 });
  };
}

function makeFakeOpenAI(parsed) {
  return {
    responses: {
      parse: async () => ({ status: 'completed', output_parsed: { output: parsed }, id: 'r' }),
    },
  };
}

const FAKE_ENV = {
  OPENAI_API_KEY: 'sk-test',
  INKFLOW_TOOL_SECRET: 'test-secret',
  AGENT_INTERNAL_BASE_URL: 'https://stub',
};

test('runAgent: propondo_valor + pediu_desconto valido', async () => {
  setupFakeFetch({
    'consultar-horarios': { ok: true, slots: [] },
    'consultar-portfolio-disponivel': { ok: true, portfolio_disponivel: false },
    'enviar-objecao-tatuador': { ok: true },
  });
  const r = await runAgent({
    env: FAKE_ENV,
    tenant_id: 't1', telefone: '+5511', mensagem: 'consegue 600?',
    estado_atual: 'propondo_valor', dados_acumulados: {}, historico: [],
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    openaiClient: makeFakeOpenAI({
      proxima_acao: 'pediu_desconto', resposta_cliente: 'vou consultar',
      slot_inicio: null, slot_fim: null, valor_pedido_cliente: 600, payload_portfolio: null,
    }),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'pediu_desconto');
  assert.equal(r.estado_novo, 'aguardando_decisao_desconto');
});

test('runAgent: escolhendo_horario + reservar_horario slot em horarios_livres', async () => {
  setupFakeFetch({
    'consultar-horarios': { ok: true, slots: [{ inicio: '2026-05-12T17:00:00Z', fim: '2026-05-12T20:00:00Z', legenda: 'ter' }] },
    'consultar-portfolio-disponivel': { ok: true, portfolio_disponivel: false },
    'reservar-horario': { ok: true, agendamento_id: 'agd-1' },
    'gerar-link-sinal': { ok: true, link_pagamento: 'https://pay', hold_horas: 24 },
  });
  const r = await runAgent({
    env: FAKE_ENV,
    tenant_id: 't1', telefone: '+5511', mensagem: 'terca 14h',
    estado_atual: 'escolhendo_horario', dados_acumulados: {}, historico: [],
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    openaiClient: makeFakeOpenAI({
      proxima_acao: 'reservar_horario', resposta_cliente: 'reservado',
      slot_inicio: '2026-05-12T17:00:00Z', slot_fim: '2026-05-12T20:00:00Z',
      valor_pedido_cliente: null, payload_portfolio: null,
    }),
  });
  assert.equal(r.ok, true);
  assert.equal(r.estado_novo, 'aguardando_sinal');
});

test('runAgent: aguardando_sinal + reservar_horario slot em slots_reservados (TC-P09)', async () => {
  setupFakeFetch({
    'consultar-proposta-tatuador': {
      ok: true, status: 'aguardando_sinal',
      slots_reservados: [{ inicio: '2026-05-14T13:00:00Z', fim: '2026-05-14T16:00:00Z' }],
    },
    'consultar-portfolio-disponivel': { ok: true, portfolio_disponivel: false },
    'reservar-horario': { ok: true, agendamento_id: 'agd-1' },
    'gerar-link-sinal': { ok: true, link_pagamento: 'https://pay', hold_horas: 24 },
  });
  const r = await runAgent({
    env: FAKE_ENV,
    tenant_id: 't1', telefone: '+5511', mensagem: 'meu link expirou',
    estado_atual: 'aguardando_sinal', dados_acumulados: {}, historico: [],
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    openaiClient: makeFakeOpenAI({
      proxima_acao: 'reservar_horario', resposta_cliente: 'reservei',
      slot_inicio: '2026-05-14T13:00:00Z', slot_fim: '2026-05-14T16:00:00Z',
      valor_pedido_cliente: null, payload_portfolio: null,
    }),
  });
  assert.equal(r.ok, true);
});

test('runAgent: silent force pergunta quando slot fora da lista', async () => {
  setupFakeFetch({
    'consultar-horarios': { ok: true, slots: [{ inicio: '2026-05-12T17:00:00Z', fim: '2026-05-12T20:00:00Z', legenda: 'ter' }] },
    'consultar-portfolio-disponivel': { ok: true, portfolio_disponivel: false },
  });
  const r = await runAgent({
    env: FAKE_ENV,
    tenant_id: 't1', telefone: '+5511', mensagem: 'qua',
    estado_atual: 'escolhendo_horario', dados_acumulados: {}, historico: [],
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    openaiClient: makeFakeOpenAI({
      proxima_acao: 'reservar_horario', resposta_cliente: 'reservado',
      slot_inicio: '2026-05-99T99:99:99Z', slot_fim: '2026-05-99T99:99:99Z',
      valor_pedido_cliente: null, payload_portfolio: null,
    }),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'pergunta'); // silent force
  assert.match(r.resposta_cliente, /nao esta na lista|escolhe/i);
});
