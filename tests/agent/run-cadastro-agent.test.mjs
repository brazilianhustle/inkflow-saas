import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCadastroAgent } from '../../functions/api/agent/agents/cadastro.js';

const FAKE_TENANT = {
  id: 't1', nome_estudio: 'Estudio X', nome_agente: 'Bot',
  config_agente: {}, gatilhos_handoff: [], faqs: [], fewshots: [],
  plano: 'individual',
};
const FAKE_CONVERSA = {
  id: 'c1', telefone: '+5511', estado_agente: 'cadastro',
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
        return { status: 'completed', output_parsed: { output: parsed }, id: 'resp_fake' };
      },
    },
  };
}

test('runCadastroAgent: retorna output parseado quando OpenAI responde', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta',
    resposta_cliente: 'qual seu nome?',
    dados_persistidos: { nome: null, data_nascimento: null, email: null },
    dados_completos: false,
    campos_faltando: ['nome'],
    campos_conflitantes: [],
    email_recusado: false,
    payload_portfolio: null,
  });
  const out = await runCadastroAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    mensagem: 'oi', historico: [],
    openaiClient: fake,
  });
  assert.equal(out.proxima_acao, 'pergunta');
  assert.deepEqual(out.campos_faltando, ['nome']);
});

test('runCadastroAgent: monta input com historico + mensagem', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'x',
    dados_persistidos: { nome: null, data_nascimento: null, email: null },
    dados_completos: false, campos_faltando: ['nome'], campos_conflitantes: [],
    email_recusado: false, payload_portfolio: null,
  });
  await runCadastroAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    mensagem: 'mensagem nova',
    historico: [
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'oi, qual seu nome?' },
    ],
    openaiClient: fake,
  });
  const captured = fake._captured();
  assert.equal(captured.input.length, 3);
  assert.equal(captured.input[2].content, 'mensagem nova');
  assert.equal(captured.model, 'gpt-4o-mini');
  assert.ok(captured.instructions && captured.instructions.length > 100);
});

test('runCadastroAgent: normaliza historico shape Supabase (autor+texto)', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'x',
    dados_persistidos: { nome: null, data_nascimento: null, email: null },
    dados_completos: false, campos_faltando: ['nome'], campos_conflitantes: [],
    email_recusado: false, payload_portfolio: null,
  });
  await runCadastroAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    mensagem: 'nova',
    historico: [
      { autor: 'cliente', texto: 'oi' },
      { autor: 'bot', texto: 'pode falar' },
    ],
    openaiClient: fake,
  });
  const captured = fake._captured();
  assert.deepEqual(captured.input[0], { role: 'user', content: 'oi' });
  assert.deepEqual(captured.input[1], { role: 'assistant', content: 'pode falar' });
});

test('runCadastroAgent: schema strict aplicado em text.format (cadastro_output + strict)', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'x',
    dados_persistidos: { nome: null, data_nascimento: null, email: null },
    dados_completos: false, campos_faltando: ['nome'], campos_conflitantes: [],
    email_recusado: false, payload_portfolio: null,
  });
  await runCadastroAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    mensagem: 'oi', historico: [], openaiClient: fake,
  });
  const captured = fake._captured();
  assert.equal(captured.text.format.type, 'json_schema');
  assert.equal(captured.text.format.strict, true);
  assert.equal(captured.text.format.name, 'cadastro_output');
  assert.ok(captured.text.format.schema.properties.output);
});
