// tests/integration/pos-handoff-foto.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { processMessage } from '../../functions/_lib/whatsapp-pipeline.js';

const TENANT = {
  id: '00000000-0000-0000-0000-000000000001',
  nome_estudio: 'Estudio', evo_instance: 'i', evo_apikey: 'k',
  tatuador_telegram_chat_id: '99999',
  config_agente: {}, config_precificacao: {}, gatilhos_handoff: [], faqs: [], fewshots_por_modo: {},
};

function makeDeps({ conversaTerminal, capturedTg, capturedRpc, capturedFetchUrls }) {
  return {
    now: () => '2026-05-19T00:00:00Z',
    runAgent: async () => ({ ok: true }),
    sendTelegram: async (chat, text, opts) => { capturedTg.push({ chat, text, opts }); },
    sendTelegramAdmin: async () => {},
    enviarMidia: async (env, chat, b64, mt, caption) => {
      capturedTg.push({ chat, midia: true, caption, mimetype: mt });
      return { file_id: 'FID_POS', modo: mt === 'image/jpeg' ? 'photo' : 'document' };
    },
    supaFetch: async (path, init = {}) => {
      capturedFetchUrls.push({ path, method: init.method || 'GET' });
      if (init.method === undefined && path.includes('/conversas?')) {
        return new Response(JSON.stringify([conversaTerminal]), { status: 200 });
      }
      if (path.includes('/rpc/zerar_media_base64') && init.method === 'POST') {
        capturedRpc.push(JSON.parse(init.body));
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 204 });
    },
  };
}

test('Estado terminal + foto JPEG: re-encaminha como photo + RPC zerar', async () => {
  const conversaTerminal = {
    id: 'c1', estado_agente: 'aguardando_tatuador',
    dados_coletados: {}, dados_cadastro: { nome: 'Maria' },
  };
  const tg = []; const rpc = []; const urls = [];
  const deps = makeDeps({ conversaTerminal, capturedTg: tg, capturedRpc: rpc, capturedFetchUrls: urls });
  await processMessage(
    { INKFLOW_TELEGRAM_BOT_TOKEN: 't' },
    {
      tenantId: TENANT.id, telefone: '5511999', evoMessageId: 'E', texto: 'achei mais essa',
      mediaBase64: 'BLOB', mediaMimetype: 'image/jpeg', pushName: 'Maria', msgRowId: 99, tenant: TENANT,
    },
    deps,
  );
  // 1) sendTelegram texto preview (existente)
  assert.ok(tg.some(x => x.text?.includes('Cliente Maria')), 'texto preview enviado');
  // 2) enviarMidia chamado com caption nome
  assert.ok(tg.some(x => x.midia && x.caption?.includes('Maria mandou +1 foto')));
  // 3) RPC zerar_media_base64 chamado com msg_id=99
  assert.ok(rpc.some(r => r.p_msg_id === 99));
});

test('Estado terminal SEM foto: comportamento atual (so texto preview)', async () => {
  const conversaTerminal = {
    id: 'c1', estado_agente: 'aguardando_tatuador',
    dados_coletados: {}, dados_cadastro: { nome: 'Maria' },
  };
  const tg = []; const rpc = []; const urls = [];
  const deps = makeDeps({ conversaTerminal, capturedTg: tg, capturedRpc: rpc, capturedFetchUrls: urls });
  await processMessage(
    { INKFLOW_TELEGRAM_BOT_TOKEN: 't' },
    {
      tenantId: TENANT.id, telefone: '5511999', evoMessageId: 'E', texto: 'oi',
      mediaBase64: null, mediaMimetype: null, pushName: 'Maria', msgRowId: 100, tenant: TENANT,
    },
    deps,
  );
  assert.ok(tg.some(x => x.text), 'texto preview enviado');
  assert.equal(tg.filter(x => x.midia).length, 0);
  assert.equal(rpc.length, 0);
});

test('Estado terminal + foto HEIC: re-encaminha como document', async () => {
  const conversaTerminal = {
    id: 'c1', estado_agente: 'aguardando_tatuador',
    dados_coletados: {}, dados_cadastro: { nome: 'Maria' },
  };
  const tg = []; const rpc = []; const urls = [];
  const deps = makeDeps({ conversaTerminal, capturedTg: tg, capturedRpc: rpc, capturedFetchUrls: urls });
  await processMessage(
    { INKFLOW_TELEGRAM_BOT_TOKEN: 't' },
    {
      tenantId: TENANT.id, telefone: '5511999', evoMessageId: 'E', texto: '',
      mediaBase64: 'BLOB', mediaMimetype: 'image/heic', pushName: 'Maria', msgRowId: 101, tenant: TENANT,
    },
    deps,
  );
  assert.ok(tg.some(x => x.midia && x.mimetype === 'image/heic'));
});

test('Estado terminal + foto upload throw: NAO chama RPC (cleanup so se OK)', async () => {
  const conversaTerminal = {
    id: 'c1', estado_agente: 'aguardando_tatuador',
    dados_coletados: {}, dados_cadastro: { nome: 'Maria' },
  };
  const tg = []; const rpc = []; const urls = [];
  const deps = makeDeps({ conversaTerminal, capturedTg: tg, capturedRpc: rpc, capturedFetchUrls: urls });
  deps.enviarMidia = async () => { throw new Error('telegram-413: too large'); };
  await processMessage(
    { INKFLOW_TELEGRAM_BOT_TOKEN: 't' },
    {
      tenantId: TENANT.id, telefone: '5511999', evoMessageId: 'E', texto: '',
      mediaBase64: 'BLOB', mediaMimetype: 'image/jpeg', pushName: 'Maria', msgRowId: 102, tenant: TENANT,
    },
    deps,
  );
  // Pipeline NAO deve crashar; RPC NAO chamado
  assert.equal(rpc.length, 0);
});
