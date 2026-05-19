import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPropostaAgent } from '../../functions/api/agent/agents/proposta.js';

const FAKE_TENANT = {
  id: 't1', nome_estudio: 'Estudio X', nome_agente: 'Bot',
  config_agente: {}, config_precificacao: { sinal_percentual: 30 },
  gatilhos_handoff: [], faqs: [], fewshots: [], fewshots_por_modo: {},
  plano: 'individual',
};
const FAKE_CONVERSA = {
  id: 'c1', telefone: '+5511', estado_agente: 'propondo_valor',
  dados_coletados: { decisao_desconto: null }, dados_cadastro: { nome: 'Cli' },
  valor_proposto: 750,
};

function makeFakeClient(parsed) {
  let captured;
  return {
    _captured: () => captured,
    responses: {
      parse: async (params) => {
        captured = params;
        return { status: 'completed', output_parsed: { output: parsed }, id: 'resp_fake' };
      },
    },
  };
}

test('runPropostaAgent: propondo_valor retorna output parseado', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta',
    resposta_cliente: 'me explica mais',
    slot_inicio: null, slot_fim: null,
    valor_pedido_cliente: null, payload_portfolio: null,
  });
  const out = await runPropostaAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA,
    clientContext: { valor_proposto: 750, horarios_livres: [] },
    mensagem: 'que valor?', historico: [],
    estado_atual: 'propondo_valor',
    openaiClient: fake,
  });
  assert.equal(out.proxima_acao, 'pergunta');
});

test('runPropostaAgent: escolhendo_horario despacha schema correto', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'reservar_horario',
    resposta_cliente: 'reservei',
    slot_inicio: '2026-05-12T17:00:00Z',
    slot_fim: '2026-05-12T20:00:00Z',
    valor_pedido_cliente: null, payload_portfolio: null,
  });
  await runPropostaAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA,
    clientContext: {}, mensagem: 'terca 14h', historico: [],
    estado_atual: 'escolhendo_horario',
    openaiClient: fake,
  });
  const captured = fake._captured();
  assert.equal(captured.text.format.name, 'proposta_escolhendo_horario');
});

test('runPropostaAgent: aguardando_sinal usa schema AS', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'ainda nao recebi',
    slot_inicio: null, slot_fim: null, valor_pedido_cliente: null, payload_portfolio: null,
  });
  await runPropostaAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA,
    clientContext: {}, mensagem: 'paguei', historico: [],
    estado_atual: 'aguardando_sinal',
    openaiClient: fake,
  });
  const captured = fake._captured();
  assert.equal(captured.text.format.name, 'proposta_aguardando_sinal');
});

test('runPropostaAgent: estado desconhecido lanca', async () => {
  await assert.rejects(
    runPropostaAgent({
      env: { OPENAI_API_KEY: 'sk-test' },
      tenant: FAKE_TENANT, conversa: FAKE_CONVERSA,
      clientContext: {}, mensagem: 'x', historico: [],
      estado_atual: 'estado_inexistente',
      openaiClient: makeFakeClient({}),
    }),
    /Estado proposta desconhecido/
  );
});

test('runPropostaAgent: monta input com historico + mensagem', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'x',
    slot_inicio: null, slot_fim: null, valor_pedido_cliente: null, payload_portfolio: null,
  });
  await runPropostaAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    mensagem: 'mensagem nova',
    historico: [{ autor: 'cliente', texto: 'oi' }, { autor: 'bot', texto: 'opa' }],
    estado_atual: 'propondo_valor',
    openaiClient: fake,
  });
  const captured = fake._captured();
  assert.equal(captured.input.length, 3);
  assert.deepEqual(captured.input[0], { role: 'user', content: 'oi' });
  assert.deepEqual(captured.input[1], { role: 'assistant', content: 'opa' });
  assert.equal(captured.input[2].content, 'mensagem nova');
});
