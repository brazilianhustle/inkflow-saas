// tests/agent/route-runagent.test.mjs
// Sub-4.1: smoke tests pra runAgent({...}) — funcao pura-ish exportavel
// que pipeline.js chama sem HTTP. Garante existencia + shape de erro
// previsivel em estado nao-implementado (sem precisar mockar @openai/agents).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ENV = { OPENAI_API_KEY: 'sk-test', INKFLOW_TOOL_SECRET: 'sec' };

test('runAgent: estado nao implementado → ok:false status:501', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'oi',
    estado_atual: 'estado_inexistente', dados_acumulados: {}, historico: [],
    tenant: { id: 't' }, conversa: { id: 'c', estado_agente: 'estado_inexistente' },
    clientContext: {},
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, 501);
});

test('runAgent: existe e e AsyncFunction', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  assert.ok(typeof runAgent === 'function');
  assert.equal(runAgent.constructor.name, 'AsyncFunction');
});

test('runAgent: aceita historico vazio sem throw quando estado nao implementado', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'oi',
    estado_atual: 'unimpl', dados_acumulados: {}, historico: [],
    tenant: { id: 't' }, conversa: { id: 'c', estado_agente: 'unimpl' },
    clientContext: {},
  });
  assert.ok(r);
  assert.equal(r.ok, false);
});

const PERGUNTA_OUT_VISAO = {
  proxima_acao: 'pergunta',
  resposta_cliente: 'Vi a foto — rosa fineline!',
  dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
  dados_completos: false,
  campos_faltando: ['local_corpo'],
  campos_conflitantes: [],
  payload_portfolio: null,
  analise_imagens: [{ tipo: 'referencia', descricao: 'rosa fineline', corpo_tem_tattoo: false, corpo_tem_marcacao: false }],
  cobertura_suspeita: null,
};

function fakeOpenAI(captureRef) {
  return {
    responses: {
      parse: async (params) => {
        captureRef.params = params;
        return { status: 'completed', id: 'resp_fake', output_parsed: { output: PERGUNTA_OUT_VISAO } };
      },
    },
  };
}

const TENANT_STUB = { id: 't', nome_estudio: 'Stub', config_agente: {}, gatilhos_handoff: [], faqs: [], fewshots: [], portfolio_urls: [] };
const CONVERSA_STUB = { id: 'c', telefone: '5511', estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} };

test('runAgent (tattoo): repassa imagens como content multimodal ao TattooAgent', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const cap = {};
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'olha',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa: CONVERSA_STUB, clientContext: {},
    imagens: [{ base64: 'ZZ', mimetype: 'image/png', msgRowId: 1 }],
    openaiClient: fakeOpenAI(cap),
  });
  assert.equal(r.ok, true);
  const last = cap.params.input[cap.params.input.length - 1];
  assert.ok(Array.isArray(last.content));
  assert.equal(last.content[1].type, 'input_image');
});

test('runAgent (tattoo): surfacia analise_imagens no retorno', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const cap = {};
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'olha',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa: CONVERSA_STUB, clientContext: {},
    imagens: [{ base64: 'ZZ', mimetype: 'image/png', msgRowId: 1 }],
    openaiClient: fakeOpenAI(cap),
  });
  assert.equal(r.ok, true);
  assert.equal(r.analise_imagens[0].tipo, 'referencia');
  assert.equal(r.cobertura_suspeita, null);
});;
