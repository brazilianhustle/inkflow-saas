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
  dados_coletados: {}, dados_cadastro: {},
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
  assert.match(result.resposta_cliente, /segundinho|respondo/i);
});
