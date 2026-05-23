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

test('runTattooAgent: inclui contexto de lote sequencial nas instructions', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'x',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false, campos_faltando: ['local_corpo'], campos_conflitantes: [],
    payload_portfolio: null, analise_imagens: null, cobertura_suspeita: null,
  });
  await runTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA,
    clientContext: { batch_message_count: 2, batch_joined_by: 'newline' },
    mensagem: 'Tenho 1.60\nquanto fica',
    historico: [],
    openaiClient: fake,
  });
  const captured = fake._captured();
  assert.match(captured.instructions, /Turno atual: 2 baloes do cliente no mesmo lote/);
  assert.match(captured.instructions, /lote unico/);
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

test('runTattooAgent: monta content multimodal quando imagens presentes', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'vi a ref',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false, campos_faltando: ['local_corpo'], campos_conflitantes: [],
    payload_portfolio: null, analise_imagens: null, cobertura_suspeita: null,
  });
  await runTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    mensagem: 'olha essa ref',
    historico: [],
    imagens: [{ base64: 'AAAA', mimetype: 'image/jpeg', msgRowId: 7 }],
    openaiClient: fake,
  });
  const captured = fake._captured();
  const last = captured.input[captured.input.length - 1];
  assert.equal(last.role, 'user');
  assert.ok(Array.isArray(last.content), 'content deve ser array multimodal');
  assert.equal(last.content[0].type, 'input_text');
  assert.equal(last.content[0].text, 'olha essa ref');
  assert.equal(last.content[1].type, 'input_image');
  assert.equal(last.content[1].image_url, 'data:image/jpeg;base64,AAAA');
  assert.equal(last.content[1].detail, 'low');
});

test('runTattooAgent: content string (texto-only) quando sem imagens', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'x',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false, campos_faltando: ['local_corpo'], campos_conflitantes: [],
    payload_portfolio: null, analise_imagens: null, cobertura_suspeita: null,
  });
  await runTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    mensagem: 'so texto', historico: [], openaiClient: fake,
  });
  const captured = fake._captured();
  const last = captured.input[captured.input.length - 1];
  assert.equal(typeof last.content, 'string');
  assert.equal(last.content, 'so texto');
});

test('runTattooAgent: cap de 4 imagens no content', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'x',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false, campos_faltando: ['local_corpo'], campos_conflitantes: [],
    payload_portfolio: null, analise_imagens: null, cobertura_suspeita: null,
  });
  const seis = Array.from({ length: 6 }, (_, i) => ({ base64: `B${i}`, mimetype: 'image/png', msgRowId: i }));
  await runTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    mensagem: 'varias', historico: [], imagens: seis, openaiClient: fake,
  });
  const captured = fake._captured();
  const last = captured.input[captured.input.length - 1];
  const imgs = last.content.filter(c => c.type === 'input_image');
  assert.equal(imgs.length, 4);
  assert.equal(imgs[0].image_url, 'data:image/png;base64,B0');
  assert.equal(imgs[3].image_url, 'data:image/png;base64,B3');
});

test('runTattooAgent: turno so-foto (mensagem vazia) omite input_text', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'vi a foto',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false, campos_faltando: ['local_corpo'], campos_conflitantes: [],
    payload_portfolio: null, analise_imagens: null, cobertura_suspeita: null,
  });
  await runTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    mensagem: '', historico: [],
    imagens: [{ base64: 'AAAA', mimetype: 'image/jpeg', msgRowId: 7 }],
    openaiClient: fake,
  });
  const captured = fake._captured();
  const last = captured.input[captured.input.length - 1];
  assert.ok(Array.isArray(last.content));
  assert.equal(last.content.filter(c => c.type === 'input_text').length, 0, 'sem input_text vazio');
  assert.equal(last.content.filter(c => c.type === 'input_image').length, 1);
});

test('runTattooAgent: descarta imagens sem mimetype/base64 (data url malformado)', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'x',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false, campos_faltando: ['local_corpo'], campos_conflitantes: [],
    payload_portfolio: null, analise_imagens: null, cobertura_suspeita: null,
  });
  await runTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    mensagem: 'olha', historico: [],
    imagens: [
      { base64: 'GOOD', mimetype: 'image/png', msgRowId: 1 },
      { base64: 'NOPE', msgRowId: 2 },            // sem mimetype → descartada
      { mimetype: 'image/jpeg', msgRowId: 3 },    // sem base64 → descartada
    ],
    openaiClient: fake,
  });
  const captured = fake._captured();
  const last = captured.input[captured.input.length - 1];
  const imgs = last.content.filter(c => c.type === 'input_image');
  assert.equal(imgs.length, 1, 'so a entrada valida vira input_image');
  assert.equal(imgs[0].image_url, 'data:image/png;base64,GOOD');
});
