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
});

// ─── Bug 1: gate handoff só após foto pedida >=1x ──────────────────────
const HANDOFF_OUT = {
  proxima_acao: 'handoff',
  resposta_cliente: 'Show, anotei tudo!',
  dados_persistidos: {
    descricao_curta: 'rosa', local_corpo: 'antebraco', altura_cm: 170,
    estilo: 'fineline', tamanho_cm: null, cor_preferencia: null, foto_local: null,
  },
  dados_completos: true,
  campos_faltando: [],
  campos_conflitantes: [],
  payload_portfolio: null,
  analise_imagens: null,
  cobertura_suspeita: null,
};

function fakeHandoff() {
  return {
    responses: {
      parse: async () => ({ status: 'completed', id: 'r', output_parsed: { output: HANDOFF_OUT } }),
    },
  };
}

test('Bug1 gate: handoff sem foto pedida (contador 0, sem foto) → força pergunta + pediu_foto_local', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = { id: 'c', telefone: '5511', estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'isso, pode ser',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: fakeHandoff(),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'pergunta', 'gate deve rebaixar handoff→pergunta');
  assert.equal(r.estado_novo, 'tattoo', 'estado permanece tattoo (sem handoff)');
  assert.equal(r.pediu_foto_local, true);
  assert.match(r.resposta_cliente, /foto/i);
});

test('Bug1 gate: handoff com contador=1 → handoff passa', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = { id: 'c', telefone: '5511', estado_agente: 'tattoo',
    dados_coletados: { tentativas_foto_local: 1 }, dados_cadastro: {} };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'isso',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: fakeHandoff(),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'handoff');
  assert.equal(r.estado_novo, 'cadastro');
  assert.ok(!r.pediu_foto_local);
});

test('Bug1 gate: handoff com foto_local presente → handoff passa mesmo sem contador', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = { id: 'c', telefone: '5511', estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} };
  const comFoto = {
    responses: { parse: async () => ({ status: 'completed', id: 'r',
      output_parsed: { output: { ...HANDOFF_OUT, dados_persistidos: { ...HANDOFF_OUT.dados_persistidos, foto_local: 'msg-123' } } } }) },
  };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'mandei a foto',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: comFoto,
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'handoff');
});

// Output 'pergunta' com os 4 OBR completos (reusado nos testes do else-if do gate).
const PERGUNTA_OBR_COMPLETO = {
  proxima_acao: 'pergunta',
  resposta_cliente: '<override>',
  dados_persistidos: {
    descricao_curta: 'rosa', local_corpo: 'antebraco', altura_cm: 170,
    estilo: 'fineline', tamanho_cm: null, cor_preferencia: null, foto_local: null,
  },
  dados_completos: false,
  campos_faltando: [],
  campos_conflitantes: [],
  payload_portfolio: null,
  analise_imagens: null,
  cobertura_suspeita: null,
};
function fakePergunta(resposta) {
  return {
    responses: {
      parse: async () => ({ status: 'completed', id: 'r',
        output_parsed: { output: { ...PERGUNTA_OBR_COMPLETO, resposta_cliente: resposta } } }),
    },
  };
}

test('Bug1 gate: pergunta com OBR completos mas resposta NAO sobre foto → NAO marca pediu_foto_local', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = { id: 'c', telefone: '5511', estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'confirma',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: fakePergunta('Beleza! Confirma que e no antebraco direito mesmo?'),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'pergunta');
  assert.ok(!r.pediu_foto_local, 'contador nao deve subir quando a pergunta nao e sobre foto');
});

test('Bug1 gate: pergunta com OBR completos E resposta sobre foto → marca pediu_foto_local', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = { id: 'c', telefone: '5511', estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'fechou',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: fakePergunta('Show! Consegue mandar uma foto do local?'),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'pergunta');
  assert.equal(r.pediu_foto_local, true);
});

test('Bug1 gate: fallback de rede (sem foto na resposta) NAO marca pediu_foto_local mesmo com OBR completos no DB', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  // 4 OBR ja completos no DB, foto nunca pedida; rede cai → buildFallbackOutput.
  const conversa = { id: 'c', telefone: '5511', estado_agente: 'tattoo',
    dados_coletados: { descricao_curta: 'rosa', local_corpo: 'antebraco', altura_cm: 170, estilo: 'fineline' },
    dados_cadastro: {} };
  const throwingClient = {
    responses: { parse: async () => { const e = new Error('network down'); e.status = 503; throw e; } },
  };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'oi',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: throwingClient,
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'pergunta');
  assert.ok(!r.pediu_foto_local, 'fallback de rede nao pode contar como foto pedida');
});
