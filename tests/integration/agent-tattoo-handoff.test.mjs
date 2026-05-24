// Integration test ponta-a-ponta do path novo (Caminho C Fase 1) pra
// estado_atual='tattoo'. Mocka openai client; valida que:
// - runAgent retorna ok:true com proxima_acao='handoff' valido
// - payload de handoff e validavel pelo TattooHandoffPayload contract
// - estado proximo via router.getNextState === 'cadastro'
//
// NAO chama OpenAI real. Stub prefetchPortfolio via tenant.portfolio_urls=[].
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
  estado_agente: 'coletando_tattoo',
  dados_coletados: { tentativas_foto_local: 1 }, dados_cadastro: {},
};
const FAKE_ENV = {
  OPENAI_API_KEY: 'sk-test',
  AGENT_VERSION: 'test',
  OPENAI_MODEL_AGENT: 'gpt-4o-mini',
  // Telemetria fire-and-forget — sem Supabase real, logAgentTurn falha silently.
};

function makeFakeClient(parsed) {
  return {
    responses: {
      parse: async () => ({
        status: 'completed',
        output_parsed: { output: parsed },
        id: 'resp_fake',
      }),
    },
  };
}

function tattooPerguntaOut(overrides = {}) {
  const { dados_persistidos: dadosOverride, ...rest } = overrides;
  return {
    proxima_acao: 'pergunta',
    resposta_cliente: 'E de estilo, tu curte mais fineline, realismo, blackwork ou tradicional?',
    dados_persistidos: {
      descricao_curta: null,
      local_corpo: null,
      altura_cm: null,
      estilo: null,
      tamanho_cm: null,
      cor_preferencia: null,
      foto_local: null,
      ...(dadosOverride || {}),
    },
    dados_completos: false,
    campos_faltando: ['estilo'],
    campos_conflitantes: [],
    payload_portfolio: null,
    analise_imagens: null,
    cobertura_suspeita: null,
    ...rest,
  };
}

test('runAgent estado=tattoo handoff valido: ok + estado proximo cadastro', async () => {
  const fakeOut = {
    proxima_acao: 'handoff',
    resposta_cliente: 'Show, ja anotei tudo. Vou te passar pra cadastro.',
    dados_persistidos: {
      descricao_curta: 'rosa pequena traco fino',
      local_corpo: 'braco direito',
      altura_cm: 170,
      estilo: 'fineline',
      tamanho_cm: 5,
      cor_preferencia: 'preto',
      foto_local: null,
    },
    dados_completos: true,
    campos_faltando: [],
    campos_conflitantes: [],
    payload_portfolio: null,
  };
  const result = await runAgent({
    env: FAKE_ENV,
    tenant_id: FAKE_TENANT.id,
    mensagem: 'Quero uma rosa pequena no braco direito, sou 1.70m, traco fino',
    telefone: '+5511999999999',
    historico: [],
    tenant: FAKE_TENANT,
    estado_atual: 'tattoo',
    conversa: FAKE_CONVERSA,
    clientContext: {},
    openaiClient: makeFakeClient(fakeOut),
  });

  assert.equal(result.ok, true, `runAgent retornou ok=false: ${result.error}`);
  assert.equal(result.proxima_acao, 'handoff');
  assert.equal(result.dados_persistidos.altura_cm, 170);
  assert.equal(result.estado_novo, 'cadastro');

  // Contrato extraivel
  const payload = validateAction('tattoo', fakeOut, {});
  assert.equal(payload.descricao_curta, 'rosa pequena traco fino');

  // Estado proximo via router (paridade com result.estado_novo)
  const proximo = getNextState('tattoo', fakeOut);
  assert.equal(proximo, 'cadastro');
});

test('runAgent estado=tattoo pergunta: ok + estado proximo permanece tattoo', async () => {
  const fakeOut = {
    proxima_acao: 'pergunta',
    resposta_cliente: 'Em qual parte do corpo voce quer?',
    dados_persistidos: {
      estilo: 'fineline', tamanho_cm: null, altura_cm: 170,
      local_corpo: null, cor_preferencia: null, descricao_curta: 'rosa',
      foto_local: null,
    },
    dados_completos: false,
    campos_faltando: ['local_corpo'],
    campos_conflitantes: [],
    payload_portfolio: null,
  };
  const result = await runAgent({
    env: FAKE_ENV,
    tenant_id: FAKE_TENANT.id,
    mensagem: 'quero rosa',
    telefone: '+5511999999999',
    historico: [],
    tenant: FAKE_TENANT,
    estado_atual: 'tattoo',
    conversa: FAKE_CONVERSA,
    clientContext: {},
    openaiClient: makeFakeClient(fakeOut),
  });
  assert.equal(result.ok, true);
  assert.equal(result.proxima_acao, 'pergunta');
  assert.equal(result.estado_novo, 'tattoo');
  assert.deepEqual(result.campos_faltando, ['local_corpo']);
});

test('runAgent tattoo: resposta curta de estilo preenche estilo e avanca para cadastro', async () => {
  const conversa = {
    ...FAKE_CONVERSA,
    dados_coletados: {
      descricao_curta: 'anjo',
      local_corpo: 'braco',
      altura_cm: 181,
      tentativas_foto_local: 1,
      foto_local: 'presente',
    },
  };
  const result = await runAgent({
    env: FAKE_ENV,
    tenant_id: FAKE_TENANT.id,
    mensagem: 'realismo',
    telefone: '+5511999999999',
    historico: [{ role: 'assistant', content: 'Me diz o estilo que tu prefere?' }],
    tenant: FAKE_TENANT,
    estado_atual: 'tattoo',
    conversa,
    clientContext: {},
    openaiClient: makeFakeClient(tattooPerguntaOut({ resposta_cliente: 'realismo' })),
  });

  assert.equal(result.ok, true);
  assert.equal(result.dados_persistidos.estilo, 'realismo');
  assert.equal(result.proxima_acao, 'handoff');
  assert.equal(result.estado_novo, 'cadastro');
});

test('runAgent tattoo: foto de local contradiz texto salvo e pede confirmacao', async () => {
  const conversa = {
    ...FAKE_CONVERSA,
    dados_coletados: {
      descricao_curta: 'anjo',
      local_corpo: 'braco',
      altura_cm: 181,
      estilo: 'realismo',
      tentativas_foto_local: 1,
    },
  };
  const result = await runAgent({
    env: FAKE_ENV,
    tenant_id: FAKE_TENANT.id,
    mensagem: '',
    telefone: '+5511999999999',
    historico: [],
    tenant: FAKE_TENANT,
    estado_atual: 'tattoo',
    conversa,
    clientContext: {},
    imagens: [{ mimetype: 'image/jpeg', base64: 'AAA' }],
    openaiClient: makeFakeClient(tattooPerguntaOut({
      resposta_cliente: 'Anjo em realismo no braco vai ficar incrivel.',
      dados_persistidos: { foto_local: 'presente' },
      campos_faltando: ['local_corpo'],
      analise_imagens: [{ tipo: 'corpo', descricao: 'foto de uma perna com pele limpa', corpo_tem_tattoo: false, corpo_tem_marcacao: false }],
    })),
  });

  assert.equal(result.ok, true);
  assert.equal(result.proxima_acao, 'pergunta');
  assert.equal(result.estado_novo, 'tattoo');
  assert.match(result.resposta_cliente, /parece perna.*falado braco/i);
  assert.deepEqual(result.campos_conflitantes, ['local_corpo']);
});

test('runAgent tattoo: esclarecimento textual reaproveita foto recente do local', async () => {
  const conversa = {
    ...FAKE_CONVERSA,
    dados_coletados: {
      descricao_curta: 'anjo',
      local_corpo: 'braco',
      altura_cm: 181,
      estilo: 'realismo',
      tentativas_foto_local: 1,
      refs_imagens_msg_ids: [77],
    },
  };
  const result = await runAgent({
    env: FAKE_ENV,
    tenant_id: FAKE_TENANT.id,
    mensagem: 'do outro lado, pele limpa',
    telefone: '+5511999999999',
    historico: [{ role: 'assistant', content: 'Vi que já tem tattoo nesse local. Seria pra cobertura?' }],
    tenant: FAKE_TENANT,
    estado_atual: 'tattoo',
    conversa,
    clientContext: {},
    openaiClient: makeFakeClient(tattooPerguntaOut({
      resposta_cliente: 'Consegue mandar uma foto do local?',
      campos_faltando: ['foto_local'],
    })),
  });

  assert.equal(result.ok, true);
  assert.equal(result.dados_persistidos.foto_local_msg_id, 77);
  assert.equal(result.proxima_acao, 'handoff');
  assert.equal(result.estado_novo, 'cadastro');
});


test('runAgent estado=tattoo: runtime exhausts retries -> buildFallbackOutput', async () => {
  const fakeClient = {
    responses: {
      parse: async () => {
        const e = new Error('401 invalid_api_key');
        e.status = 401;
        throw e;
      },
    },
  };
  const result = await runAgent({
    env: FAKE_ENV,
    tenant_id: FAKE_TENANT.id,
    mensagem: 'oi',
    telefone: '+5511999999999',
    historico: [],
    tenant: FAKE_TENANT,
    estado_atual: 'tattoo',
    conversa: FAKE_CONVERSA,
    clientContext: {},
    openaiClient: fakeClient,
  });
  // Fallback nao quebra UX: cliente recebe mensagem amigavel, estado=tattoo.
  assert.equal(result.ok, true);
  assert.equal(result.proxima_acao, 'pergunta');
  assert.equal(result.estado_novo, 'tattoo');
  assert.match(result.resposta_cliente, /segundinho|respondo|quer tatuar/i);
});
