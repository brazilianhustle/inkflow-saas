// tests/integration/pipeline-classifier.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { processBatch } from '../../functions/_lib/whatsapp-pipeline.js';

const TENANT = {
  id: '00000000-0000-0000-0000-000000000001',
  nome_estudio: 'Estudio Teste',
  evo_instance: 'inkflow_test', evo_apikey: 'k',
  tatuador_telegram_chat_id: '99999',
  config_agente: {}, config_precificacao: { sinal_percentual: 30 },
  gatilhos_handoff: [], faqs: [], fewshots_por_modo: {},
};

const TELEFONE = '5511999998888';
const MSG_ROW_ID = 42;

// Batch-de-1 padrão para todos os cenários deste arquivo.
function makeBatch(overrides = {}) {
  return {
    session_id: `${TENANT.id}_${TELEFONE}`,
    tenantId: TENANT.id,
    telefone: TELEFONE,
    msgRowIds: [MSG_ROW_ID],
    ...overrides,
  };
}

function makeDeps({ conversaInicial, runAgentOut, capturedPatches, mediaBase64 = 'BASE64BLOB', mediaMimetype = 'image/jpeg', texto = '' }) {
  return {
    now: () => '2026-05-19T00:00:00Z',
    runAgent: async () => runAgentOut,
    evoSend: async () => ({ ok: true }),
    callTool: async () => ({ ok: true }),
    sendTelegram: async () => {},
    sendTelegramAdmin: async () => {},
    supaFetch: async (path, init = {}) => {
      // Etapa 0a: tenant lookup by id
      if (init.method === undefined && path.startsWith('/rest/v1/tenants?id=eq.')) {
        return new Response(JSON.stringify([TENANT]), { status: 200 });
      }
      // Etapa 0b: SELECT lote de linhas
      if (init.method === undefined && path.startsWith('/rest/v1/conversa_mensagens?id=in.')) {
        return new Response(JSON.stringify([
          { id: MSG_ROW_ID, message: { type: 'human', content: texto, media_base64: mediaBase64, media_mimetype: mediaMimetype }, created_at: '2026-05-19T00:00:00Z' },
        ]), { status: 200 });
      }
      // GET conversa
      if (init.method === undefined && path.includes('/conversas?')) {
        return new Response(JSON.stringify([conversaInicial]), { status: 200 });
      }
      // GET historico (cai aqui: ?session_id=... nao casa o ?id=in. da Etapa 0b acima.
      // markStatus PATCH tambem casa este includes(), mas o guard method===undefined o exclui.)
      if (init.method === undefined && path.includes('/conversa_mensagens?')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      // PATCH conversa
      if (init.method === 'PATCH' && path.includes('/conversas?id=eq.')) {
        const body = JSON.parse(init.body);
        capturedPatches.push({ path, body });
      }
      // RPC set_descricao_visual (memoria da arte de referencia)
      if (init.method === 'POST' && path.includes('/rpc/set_descricao_visual')) {
        capturedPatches.push({ path, body: JSON.parse(init.body) });
        return new Response(null, { status: 204 });
      }
      // PATCH msg row (status processed)
      // Note: Node 25 undici rejects new Response('', { status: 204 }) — must use null body
      return new Response(null, { status: 204 });
    },
  };
}

test('Cenario A: foto proativa LOCAL via L2 (keyword "pulso")', async () => {
  const conversaInicial = {
    id: 'c1', estado_agente: 'coletando_tattoo',
    dados_coletados: {}, dados_cadastro: {}, estado_extra: {},
  };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: { ok: true, agent_usado: 'tattoo', dados_persistidos: { local_corpo: 'pulso', foto_local: 'presente' } },
    capturedPatches: patches,
    texto: 'aqui o, no pulso',
  });
  await processBatch({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, makeBatch(), deps);
  // Procura PATCH com foto_local_msg_id
  const fotoPatch = patches.find(p => p.body?.dados_coletados?.foto_local_msg_id === MSG_ROW_ID);
  assert.ok(fotoPatch, `esperado PATCH com foto_local_msg_id=${MSG_ROW_ID}`);
});

test('Cenario B: cliente ignorou pedido foto, manda turno depois (L1 hit)', async () => {
  const conversaInicial = {
    id: 'c1', estado_agente: 'coletando_tattoo',
    dados_coletados: { tentativas_foto_local: 1 },
    dados_cadastro: {},
    estado_extra: { tentativas_foto_local: 1 },
  };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: { ok: true, agent_usado: 'tattoo', dados_persistidos: { foto_local: 'presente' } },
    capturedPatches: patches,
    texto: '',
  });
  await processBatch({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, makeBatch(), deps);
  const fotoPatch = patches.find(p => p.body?.dados_coletados?.foto_local_msg_id === MSG_ROW_ID);
  assert.ok(fotoPatch);
});

test('Cenario C: foto 2 (foto_local ja presente) → classifica como ref', async () => {
  const conversaInicial = {
    id: 'c1', estado_agente: 'coletando_tattoo',
    dados_coletados: { foto_local: 'presente', foto_local_msg_id: 41 },
    dados_cadastro: {},
    estado_extra: {},
  };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: { ok: true, agent_usado: 'tattoo', dados_persistidos: { refs_imagens: ['ref1'] } },
    capturedPatches: patches,
    texto: 'mais essa',
  });
  await processBatch({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, makeBatch(), deps);
  const refPatch = patches.find(p => Array.isArray(p.body?.dados_coletados?.refs_imagens_msg_ids));
  assert.ok(refPatch);
  assert.deepEqual(refPatch.body.dados_coletados.refs_imagens_msg_ids, [MSG_ROW_ID]);
});

test('Cenario D: ref proativa sem keyword body → L3 default ref', async () => {
  const conversaInicial = {
    id: 'c1', estado_agente: 'coletando_tattoo',
    dados_coletados: {}, dados_cadastro: {}, estado_extra: {},
  };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: { ok: true, agent_usado: 'tattoo', dados_persistidos: { refs_imagens: ['x'] } },
    capturedPatches: patches,
    texto: 'tipo essa daqui',
  });
  await processBatch({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, makeBatch(), deps);
  const refPatch = patches.find(p => Array.isArray(p.body?.dados_coletados?.refs_imagens_msg_ids));
  assert.ok(refPatch);
  assert.deepEqual(refPatch.body.dados_coletados.refs_imagens_msg_ids, [MSG_ROW_ID]);
});

test('mediaBase64 null → skip classifier (nenhum PATCH com _msg_id)', async () => {
  const conversaInicial = {
    id: 'c1', estado_agente: 'coletando_tattoo',
    dados_coletados: {}, dados_cadastro: {}, estado_extra: {},
  };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: { ok: true, agent_usado: 'tattoo', dados_persistidos: {} },
    capturedPatches: patches,
    texto: 'oi',
    mediaBase64: null,
    mediaMimetype: null,
  });
  await processBatch(
    { INKFLOW_TELEGRAM_BOT_TOKEN: 't' },
    makeBatch(),
    deps,
  );
  const fotoPatch = patches.find(p =>
    p.body?.dados_coletados?.foto_local_msg_id !== undefined
    || p.body?.dados_coletados?.refs_imagens_msg_ids !== undefined
  );
  assert.equal(fotoPatch, undefined);
});

test('Cenario E: analise_imagens tipo=corpo → foto_local_msg_id', async () => {
  const conversaInicial = { id: 'c1', estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {}, estado_extra: {} };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: {
      ok: true, agent_usado: 'tattoo', dados_persistidos: {},
      analise_imagens: [{ tipo: 'corpo', descricao: 'antebraco pele limpa', corpo_tem_tattoo: false, corpo_tem_marcacao: false }],
    },
    capturedPatches: patches,
    texto: 'aqui o local',
  });
  await processBatch({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, makeBatch(), deps);
  const fotoPatch = patches.find(p => p.body?.dados_coletados?.foto_local_msg_id === MSG_ROW_ID);
  assert.ok(fotoPatch, 'tipo=corpo deve virar foto_local');
});

test('Cenario F: analise_imagens tipo=referencia → refs (nao local)', async () => {
  const conversaInicial = { id: 'c1', estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {}, estado_extra: {} };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: {
      ok: true, agent_usado: 'tattoo', dados_persistidos: {},
      analise_imagens: [{ tipo: 'referencia', descricao: 'rosa fineline', corpo_tem_tattoo: false, corpo_tem_marcacao: false }],
    },
    capturedPatches: patches,
    texto: 'no braço',
  });
  await processBatch({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, makeBatch(), deps);
  const refPatch = patches.find(p => Array.isArray(p.body?.dados_coletados?.refs_imagens_msg_ids));
  assert.ok(refPatch);
  assert.deepEqual(refPatch.body.dados_coletados.refs_imagens_msg_ids, [MSG_ROW_ID]);
  const fotoPatch = patches.find(p => p.body?.dados_coletados?.foto_local_msg_id === MSG_ROW_ID);
  assert.equal(fotoPatch, undefined, 'referencia nunca vira foto_local');
});

test('Cenario G: analise_imagens tipo=incerto → refs (nunca dropa)', async () => {
  const conversaInicial = { id: 'c1', estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {}, estado_extra: {} };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: {
      ok: true, agent_usado: 'tattoo', dados_persistidos: {},
      analise_imagens: [{ tipo: 'incerto', descricao: 'foto ambigua', corpo_tem_tattoo: false, corpo_tem_marcacao: false }],
    },
    capturedPatches: patches,
    texto: 'olha',
  });
  await processBatch({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, makeBatch(), deps);
  const refPatch = patches.find(p => Array.isArray(p.body?.dados_coletados?.refs_imagens_msg_ids));
  assert.ok(refPatch, 'incerto roteia como ref por padrao');
  const rpcG = patches.find(p => p.path?.includes('/rpc/set_descricao_visual'));
  assert.equal(rpcG, undefined, 'incerto (mesmo com descricao) nao gera memoria de recall');
});

test('Cenario H (fallback): sem analise_imagens → heuristico (L2 keyword)', async () => {
  const conversaInicial = { id: 'c1', estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {}, estado_extra: {} };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: { ok: true, agent_usado: 'tattoo', dados_persistidos: { local_corpo: 'pulso' } },
    capturedPatches: patches,
    texto: 'aqui no pulso',
  });
  await processBatch({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, makeBatch(), deps);
  const fotoPatch = patches.find(p => p.body?.dados_coletados?.foto_local_msg_id === MSG_ROW_ID);
  assert.ok(fotoPatch, 'fallback heuristico L2 classifica pulso como local');
});

test('Cenario I: referencia com descricao → grava descricao_visual via RPC', async () => {
  const conversaInicial = { id: 'c1', estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {}, estado_extra: {} };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: {
      ok: true, agent_usado: 'tattoo', dados_persistidos: {},
      analise_imagens: [{ tipo: 'referencia', descricao: 'rosa fineline delicada', corpo_tem_tattoo: false, corpo_tem_marcacao: false }],
    },
    capturedPatches: patches,
    texto: 'olha essa',
  });
  await processBatch({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, makeBatch(), deps);
  const rpc = patches.find(p => p.path.includes('/rpc/set_descricao_visual'));
  assert.ok(rpc, 'esperava chamada RPC set_descricao_visual');
  assert.equal(rpc.body.p_msg_id, MSG_ROW_ID);
  assert.equal(rpc.body.p_descricao, 'rosa fineline delicada');
});

test('Cenario J: corpo NAO gera descricao_visual (recall e so da arte)', async () => {
  const conversaInicial = { id: 'c1', estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {}, estado_extra: {} };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: {
      ok: true, agent_usado: 'tattoo', dados_persistidos: {},
      analise_imagens: [{ tipo: 'corpo', descricao: 'antebraco com tattoo', corpo_tem_tattoo: true, corpo_tem_marcacao: false }],
    },
    capturedPatches: patches,
    texto: 'meu braço',
  });
  await processBatch({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, makeBatch(), deps);
  const rpc = patches.find(p => p.path.includes('/rpc/set_descricao_visual'));
  assert.equal(rpc, undefined, 'foto de corpo nao gera memoria de recall');
});
