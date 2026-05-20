// tests/integration/pos-handoff-foto.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { processBatch } from '../../functions/_lib/whatsapp-pipeline.js';

const TENANT = {
  id: '00000000-0000-0000-0000-000000000001',
  nome_estudio: 'Estudio', evo_instance: 'i', evo_apikey: 'k',
  tatuador_telegram_chat_id: '99999',
  config_agente: {}, config_precificacao: {}, gatilhos_handoff: [], faqs: [], fewshots_por_modo: {},
};

const TELEFONE = '5511999';

function makeBatch({ msgRowId = 42, tenantId = TENANT.id, telefone = TELEFONE } = {}) {
  return {
    session_id: `${tenantId}_${telefone}`,
    tenantId,
    telefone,
    msgRowIds: [msgRowId],
  };
}

function makeDeps({ conversaTerminal, capturedTg, capturedRpc, capturedFetchUrls, msgRowId, mediaBase64, mediaMimetype, texto }) {
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
      // Etapa 0a: tenant lookup by id
      if (init.method === undefined && path.startsWith('/rest/v1/tenants?id=eq.')) {
        return new Response(JSON.stringify([TENANT]), { status: 200 });
      }
      // Etapa 0b: SELECT lote de linhas
      if (init.method === undefined && path.startsWith('/rest/v1/conversa_mensagens?id=in.')) {
        return new Response(JSON.stringify([
          { id: msgRowId, message: { type: 'human', content: texto, media_base64: mediaBase64, media_mimetype: mediaMimetype }, created_at: '2026-05-19T00:00:00Z' },
        ]), { status: 200 });
      }
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
  const deps = makeDeps({ conversaTerminal, capturedTg: tg, capturedRpc: rpc, capturedFetchUrls: urls, msgRowId: 99, mediaBase64: 'BLOB', mediaMimetype: 'image/jpeg', texto: 'achei mais essa' });
  await processBatch(
    { INKFLOW_TELEGRAM_BOT_TOKEN: 't' },
    makeBatch({ msgRowId: 99 }),
    deps,
  );
  // 1) sendTelegram texto preview (existente) — pipeline envia "Cliente ${telefone}"
  //    (pushName nao chega no batch → fallback telefone; assert confirma identidade)
  assert.ok(tg.some(x => x.text?.includes('Cliente ' + TELEFONE)), 'texto preview enviado');
  // 2) enviarMidia chamado com caption nome (nome vem de dados_cadastro.nome)
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
  const deps = makeDeps({ conversaTerminal, capturedTg: tg, capturedRpc: rpc, capturedFetchUrls: urls, msgRowId: 100, mediaBase64: null, mediaMimetype: null, texto: 'oi' });
  await processBatch(
    { INKFLOW_TELEGRAM_BOT_TOKEN: 't' },
    makeBatch({ msgRowId: 100 }),
    deps,
  );
  assert.ok(tg.some(x => x.text?.includes('Cliente ' + TELEFONE)), 'texto preview enviado');
  assert.equal(tg.filter(x => x.midia).length, 0);
  assert.equal(rpc.length, 0);
});

test('Estado terminal + foto HEIC: re-encaminha como document', async () => {
  const conversaTerminal = {
    id: 'c1', estado_agente: 'aguardando_tatuador',
    dados_coletados: {}, dados_cadastro: { nome: 'Maria' },
  };
  const tg = []; const rpc = []; const urls = [];
  const deps = makeDeps({ conversaTerminal, capturedTg: tg, capturedRpc: rpc, capturedFetchUrls: urls, msgRowId: 101, mediaBase64: 'BLOB', mediaMimetype: 'image/heic', texto: '' });
  await processBatch(
    { INKFLOW_TELEGRAM_BOT_TOKEN: 't' },
    makeBatch({ msgRowId: 101 }),
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
  const deps = makeDeps({ conversaTerminal, capturedTg: tg, capturedRpc: rpc, capturedFetchUrls: urls, msgRowId: 102, mediaBase64: 'BLOB', mediaMimetype: 'image/jpeg', texto: '' });
  deps.enviarMidia = async () => { throw new Error('telegram-413: too large'); };
  await processBatch(
    { INKFLOW_TELEGRAM_BOT_TOKEN: 't' },
    makeBatch({ msgRowId: 102 }),
    deps,
  );
  // Pipeline NAO deve crashar; RPC NAO chamado
  assert.equal(rpc.length, 0);
});
