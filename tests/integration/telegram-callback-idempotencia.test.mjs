// Idempotência dos callbacks inline do bot Telegram (bug smoke 20/05 + 21/05):
// tatuador clica no MESMO botão N× → cliente recebe N notificações (preços/decisões
// contraditórios empilhados). Cada clique gera um callback_query novo (update_id
// distinto), então a "idempotência por update_id" não cobre — o fix é:
//   (1) remover os botões após o 1º clique (editMessageReplyMarkup), e
//   (2) guard de estado: se a ação já está aplicada, vira no-op (sem re-notificar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/telegram/webhook.js';

const ENV = {
  INKFLOW_TELEGRAM_WEBHOOK_SECRET: 'whsec',
  INKFLOW_TELEGRAM_BOT_TOKEN: 'tok',
  SUPABASE_SERVICE_ROLE_KEY: 'sk',
  INKFLOW_TOOL_SECRET: 'toolsec', // presente → disparaReentrada faz fetch (conta notificação)
};

function makeReq(body) {
  return new Request('https://x/api/telegram/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'whsec' },
    body: JSON.stringify(body),
  });
}

// Mock STATEFUL: o GET de conversas reflete o último PATCH (simula o estado mudando
// entre cliques). Captura chamadas Telegram e reentradas (notificação ao cliente).
function installStatefulMock(initialConv) {
  let conv = structuredClone(initialConv);
  const tg = []; const reentradas = []; const patches = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url); const method = init.method || 'GET';
    if (u.includes('api.telegram.org')) {
      tg.push({ method: u.split('/').pop(), body: init.body });
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    }
    if (u.includes('/api/telegram/reentrada')) {
      reentradas.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (u.includes('/rest/v1/conversas?') && method === 'GET') {
      return new Response(JSON.stringify([conv]), { status: 200 });
    }
    if (u.includes('/rest/v1/conversas?') && method === 'PATCH') {
      const body = JSON.parse(init.body);
      patches.push(body);
      conv = { ...conv, ...body };
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 204 });
  };
  return { tg, reentradas, patches, restore: () => { globalThis.fetch = orig; } };
}

const CONV_NOVA = {
  id: 'c1', orcid: 'orc_abc123', estado_agente: 'aguardando_tatuador',
  valor_proposto: null, dados_coletados: {}, dados_cadastro: { nome: 'Maria' },
};

const cbAceitar = (id) => ({
  id, data: 'aceitar:orc_abc123:500', from: { id: 555 },
  message: { message_id: 999, chat: { id: 555 } },
});
const cbRecusar = (id) => ({
  id, data: 'recusar:orc_abc123', from: { id: 555 },
  message: { message_id: 999, chat: { id: 555 } },
});

// ── Camada 1: remover botões após o clique ─────────────────────────────────
test('callback aceitar: remove os botões inline após processar (editMessageReplyMarkup)', async () => {
  const mock = installStatefulMock(CONV_NOVA);
  try {
    const res = await onRequest({ request: makeReq({ callback_query: cbAceitar('cb1') }), env: ENV });
    assert.equal(res.status, 200);
    const edit = mock.tg.find(c => c.method === 'editMessageReplyMarkup');
    assert.ok(edit, 'editMessageReplyMarkup deve ser chamado pra remover os botões');
    const body = JSON.parse(edit.body);
    assert.equal(body.message_id, 999);
    assert.equal(body.chat_id, 555);
    assert.deepEqual(body.reply_markup.inline_keyboard, [], 'teclado deve ficar vazio');
  } finally {
    mock.restore();
  }
});

// ── Camada 2: guard de estado (no-op no clique repetido) ───────────────────
test('callback aceitar repetido: 2º clique não re-notifica o cliente', async () => {
  const mock = installStatefulMock(CONV_NOVA);
  try {
    await onRequest({ request: makeReq({ callback_query: cbAceitar('cb1') }), env: ENV });
    await onRequest({ request: makeReq({ callback_query: cbAceitar('cb2') }), env: ENV });
    assert.equal(mock.reentradas.length, 1, 'cliente notificado só 1× apesar de 2 cliques iguais');
    const aceiteMsgs = mock.tg.filter(c =>
      c.method === 'sendMessage' && JSON.parse(c.body).text.includes('Desconto aceito'));
    assert.equal(aceiteMsgs.length, 1, 'tatuador recebe "Desconto aceito" só 1×');
  } finally {
    mock.restore();
  }
});

test('callback recusar repetido: 2º clique não re-notifica o cliente', async () => {
  const mock = installStatefulMock(CONV_NOVA);
  try {
    await onRequest({ request: makeReq({ callback_query: cbRecusar('cb1') }), env: ENV });
    await onRequest({ request: makeReq({ callback_query: cbRecusar('cb2') }), env: ENV });
    assert.equal(mock.reentradas.length, 1, 'cliente notificado só 1× apesar de 2 recusas');
  } finally {
    mock.restore();
  }
});

// Mudança de ideia legítima (ação diferente) NÃO é bloqueada pelo guard
test('mudança legítima: aceitar depois manter dispara as duas notificações', async () => {
  const mock = installStatefulMock(CONV_NOVA);
  try {
    await onRequest({ request: makeReq({ callback_query: cbAceitar('cb1') }), env: ENV });
    await onRequest({ request: makeReq({ callback_query: { id: 'cb2', data: 'manter:orc_abc123', from: { id: 555 }, message: { message_id: 999, chat: { id: 555 } } } }), env: ENV });
    assert.equal(mock.reentradas.length, 2, 'aceitar + manter = 2 notificações (ações distintas)');
  } finally {
    mock.restore();
  }
});
