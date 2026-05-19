// tests/integration/pipeline-classifier.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { processMessage } from '../../functions/_lib/whatsapp-pipeline.js';

const TENANT = {
  id: '00000000-0000-0000-0000-000000000001',
  nome_estudio: 'Estudio Teste',
  evo_instance: 'inkflow_test', evo_apikey: 'k',
  tatuador_telegram_chat_id: '99999',
  config_agente: {}, config_precificacao: { sinal_percentual: 30 },
  gatilhos_handoff: [], faqs: [], fewshots_por_modo: {},
};

function buildMsg(overrides = {}) {
  return {
    tenantId: TENANT.id, telefone: '5511999998888',
    evoMessageId: 'EVO_1', texto: '', mediaBase64: 'BASE64BLOB', mediaMimetype: 'image/jpeg',
    pushName: 'Maria', msgRowId: 42, tenant: TENANT,
    ...overrides,
  };
}

function makeDeps({ conversaInicial, runAgentOut, capturedPatches }) {
  return {
    now: () => '2026-05-19T00:00:00Z',
    runAgent: async () => runAgentOut,
    evoSend: async () => ({ ok: true }),
    callTool: async () => ({ ok: true }),
    sendTelegram: async () => {},
    sendTelegramAdmin: async () => {},
    supaFetch: async (path, init = {}) => {
      // GET conversa
      if (init.method === undefined && path.includes('/conversas?')) {
        return new Response(JSON.stringify([conversaInicial]), { status: 200 });
      }
      // GET historico
      if (init.method === undefined && path.includes('/conversa_mensagens?')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      // PATCH conversa
      if (init.method === 'PATCH' && path.includes('/conversas?id=eq.')) {
        const body = JSON.parse(init.body);
        capturedPatches.push({ path, body });
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
  });
  await processMessage({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, buildMsg({ texto: 'aqui o, no pulso' }), deps);
  // Procura PATCH com foto_local_msg_id
  const fotoPatch = patches.find(p => p.body?.dados_coletados?.foto_local_msg_id === 42);
  assert.ok(fotoPatch, 'esperado PATCH com foto_local_msg_id=42');
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
  });
  await processMessage({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, buildMsg({ texto: '' }), deps);
  const fotoPatch = patches.find(p => p.body?.dados_coletados?.foto_local_msg_id === 42);
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
  });
  await processMessage({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, buildMsg({ texto: 'mais essa' }), deps);
  const refPatch = patches.find(p => Array.isArray(p.body?.dados_coletados?.refs_imagens_msg_ids));
  assert.ok(refPatch);
  assert.deepEqual(refPatch.body.dados_coletados.refs_imagens_msg_ids, [42]);
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
  });
  await processMessage({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, buildMsg({ texto: 'tipo essa daqui' }), deps);
  const refPatch = patches.find(p => Array.isArray(p.body?.dados_coletados?.refs_imagens_msg_ids));
  assert.ok(refPatch);
  assert.deepEqual(refPatch.body.dados_coletados.refs_imagens_msg_ids, [42]);
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
  });
  await processMessage(
    { INKFLOW_TELEGRAM_BOT_TOKEN: 't' },
    buildMsg({ texto: 'oi', mediaBase64: null, mediaMimetype: null }),
    deps,
  );
  const fotoPatch = patches.find(p =>
    p.body?.dados_coletados?.foto_local_msg_id !== undefined
    || p.body?.dados_coletados?.refs_imagens_msg_ids !== undefined
  );
  assert.equal(fotoPatch, undefined);
});
