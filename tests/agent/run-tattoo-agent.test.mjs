import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTattooAgent } from '../../functions/api/agent/agents/tattoo.js';

const FAKE_TENANT = {
  id: 't1', nome_estudio: 'Estudio X', nome_agente: 'Bot',
  config_agente: {}, gatilhos_handoff: [], faqs: [], fewshots: [],
  plano: 'individual',
};
const FAKE_CONVERSA = {
  id: 'c1', telefone: '+5511', estado_agente: 'coletando_tattoo',
  dados_coletados: {}, dados_cadastro: {},
};

// Mock simula Responses API com envelope { output: ... } porque runtime.run
// wrappa internamente em z.object({ output: schema }).
function makeFakeClient(parsed) {
  let captured;
  return {
    _captured: () => captured,
    responses: {
      parse: async (params) => {
        captured = params;
        return {
          status: 'completed',
          output_parsed: { output: parsed },
          id: 'resp_fake',
        };
      },
    },
  };
}

test('runTattooAgent: retorna output parseado quando OpenAI responde', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta',
    resposta_cliente: 'qual o local?',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false,
    campos_faltando: ['local_corpo'],
    campos_conflitantes: [],
    payload_portfolio: null,
  });
  const out = await runTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT,
    conversa: FAKE_CONVERSA,
    clientContext: {},
    mensagem: 'quero uma tattoo',
    historico: [],
    openaiClient: fake,
  });
  assert.equal(out.proxima_acao, 'pergunta');
  assert.deepEqual(out.campos_faltando, ['local_corpo']);
});

test('runTattooAgent: monta input com historico + mensagem', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'x',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false, campos_faltando: ['local_corpo'], campos_conflitantes: [],
    payload_portfolio: null,
  });
  await runTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    mensagem: 'mensagem nova',
    historico: [
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'oi, em que posso ajudar?' },
    ],
    openaiClient: fake,
  });
  const captured = fake._captured();
  const last = captured.input[captured.input.length - 1];
  assert.equal(last.role, 'user');
  assert.equal(last.content, 'mensagem nova');
  assert.equal(captured.input.length, 3);
  assert.ok(captured.instructions && captured.instructions.length > 100, 'instructions deve conter prompt nao-vazio');
  assert.equal(captured.model, 'gpt-4o-mini');
});

test('runTattooAgent: normaliza historico shape Supabase (autor+texto)', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'x',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false, campos_faltando: ['local_corpo'], campos_conflitantes: [],
    payload_portfolio: null,
  });
  await runTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    mensagem: 'nova', historico: [
      { autor: 'cliente', texto: 'oi' },
      { autor: 'bot', texto: 'pode falar' },
    ],
    openaiClient: fake,
  });
  const captured = fake._captured();
  assert.deepEqual(captured.input[0], { role: 'user', content: 'oi' });
  assert.deepEqual(captured.input[1], { role: 'assistant', content: 'pode falar' });
});

test('runTattooAgent: schema strict aplicado em text.format (json_schema + strict + nome)', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'x',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false, campos_faltando: ['local_corpo'], campos_conflitantes: [],
    payload_portfolio: null,
  });
  await runTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    mensagem: 'oi', historico: [], openaiClient: fake,
  });
  const captured = fake._captured();
  assert.equal(captured.text.format.type, 'json_schema');
  assert.equal(captured.text.format.strict, true);
  assert.equal(captured.text.format.name, 'tattoo_output');
  assert.equal(captured.text.format.schema.type, 'object');
  assert.ok(captured.text.format.schema.properties.output, 'wrap envelope com property output');
});
