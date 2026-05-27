// Regressao: callbacks fechar/recusar do bot Telegram citam o NOME do cliente
// em vez do orcid tecnico. O orcid permanece no prompt do fechar (footer "ref:")
// porque handleText() correlaciona o reply de valor via regex orc_... no texto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/telegram/webhook.js';

const ENV = {
  INKFLOW_TELEGRAM_WEBHOOK_SECRET: 'whsec',
  INKFLOW_TELEGRAM_BOT_TOKEN: 'tok',
  SUPABASE_SERVICE_ROLE_KEY: 'sk',
  // INKFLOW_TOOL_SECRET omitido de proposito → disparaReentrada curto-circuita.
};

function makeReq(body) {
  return new Request('https://x/api/telegram/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'whsec' },
    body: JSON.stringify(body),
  });
}

function installMock({ conversa }) {
  const tg = []; const supa = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url); const method = init.method || 'GET';
    if (u.includes('api.telegram.org')) {
      tg.push({ method: u.split('/').pop(), body: init.body });
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    }
    supa.push({ url: u, method, body: init.body });
    if (u.includes('/rest/v1/conversas?') && method === 'GET') {
      return new Response(JSON.stringify([conversa]), { status: 200 });
    }
    return new Response(null, { status: 204 });
  };
  return { tg, supa, restore: () => { globalThis.fetch = orig; } };
}

const CONV = {
  id: 'c1', estado_agente: 'aguardando_tatuador', valor_proposto: null,
  dados_coletados: {}, dados_cadastro: { nome: 'Maria' },
};

test('callback "fechar": pergunta valor citando NOME do cliente', async () => {
  const mock = installMock({ conversa: CONV });
  try {
    const res = await onRequest({
      request: makeReq({ callback_query: { id: 'cb1', data: 'fechar:orc_abc123', from: { id: 555 } } }),
      env: ENV,
    });
    assert.equal(res.status, 200);
    const sm = mock.tg.find(c => c.method === 'sendMessage');
    assert.ok(sm, 'sendMessage enviado');
    const text = JSON.parse(sm.body).text;
    assert.match(text, /Maria/);
    // orcid permanece (footer "ref:") pra handleText correlacionar o reply de valor
    assert.match(text, /orc_abc123/);
  } finally {
    mock.restore();
  }
});

test('callback "fechar" multi-budget: pede valores por item no mesmo ORCID', async () => {
  const mock = installMock({
    conversa: {
      ...CONV,
      orcid: 'orc_abc123',
      dados_coletados: {
        budget_items: [
          { item_id: 'item_1', descricao_curta: 'borboleta', local_corpo: 'perna', status: 'sent_to_artist' },
          { item_id: 'item_2', descricao_curta: 'caveira', local_corpo: 'perna', status: 'sent_to_artist' },
        ],
      },
    },
  });
  try {
    const res = await onRequest({
      request: makeReq({ callback_query: { id: 'cbm1', data: 'fechar:orc_abc123', from: { id: 555 } } }),
      env: ENV,
    });
    assert.equal(res.status, 200);
    const sm = mock.tg.find(c => c.method === 'sendMessage');
    assert.ok(sm, 'sendMessage enviado');
    const text = JSON.parse(sm.body).text;
    assert.match(text, /Manda os valores por item/);
    assert.match(text, /1\. borboleta na perna/);
    assert.match(text, /2\. caveira na perna/);
    assert.match(text, /1 200/);
    assert.match(text, /orc_abc123/);
  } finally {
    mock.restore();
  }
});

test('callback "recusar": cita NOME do cliente, nao o orcid', async () => {
  const mock = installMock({ conversa: CONV });
  try {
    const res = await onRequest({
      request: makeReq({ callback_query: { id: 'cb2', data: 'recusar:orc_abc123', from: { id: 555 } } }),
      env: ENV,
    });
    assert.equal(res.status, 200);
    const sm = mock.tg.find(c => c.method === 'sendMessage');
    assert.ok(sm, 'sendMessage enviado');
    const text = JSON.parse(sm.body).text;
    assert.match(text, /Maria/);
    assert.doesNotMatch(text, /orc_/);
  } finally {
    mock.restore();
  }
});

test('regressao handleText: reply ao prompt do fechar (com ref orcid) captura valor', async () => {
  const mock = installMock({ conversa: { id: 'c1', estado_agente: 'aguardando_tatuador' } });
  try {
    const res = await onRequest({
      request: makeReq({
        message: {
          text: '550', chat: { id: 555 }, from: { id: 555 },
          reply_to_message: { text: 'Qual valor pra *Maria*? Manda so o numero (ex: 750)\n\nref: `orc_abc123`' },
        },
      }),
      env: ENV,
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.valor, 550);
    const patch = mock.supa.find(c => c.method === 'PATCH' && c.body?.includes('valor_proposto'));
    assert.ok(patch, 'PATCH valor_proposto aconteceu');
    assert.equal(JSON.parse(patch.body).valor_proposto, 550);
  } finally {
    mock.restore();
  }
});

test('handleText multi-budget: salva valores por item e dispara uma reentrada consolidada', async () => {
  const mock = installMock({
    conversa: {
      id: 'c1',
      estado_agente: 'aguardando_tatuador',
      valor_proposto: null,
      dados_coletados: {
        budget_items: [
          { item_id: 'item_1', descricao_curta: 'borboleta', local_corpo: 'perna', status: 'sent_to_artist' },
          { item_id: 'item_2', descricao_curta: 'caveira', local_corpo: 'perna', status: 'sent_to_artist' },
        ],
      },
    },
  });
  try {
    const env = { ...ENV, INKFLOW_TOOL_SECRET: 'toolsec' };
    const res = await onRequest({
      request: makeReq({
        message: {
          text: '1 200\n2 400', chat: { id: 555 }, from: { id: 555 },
          reply_to_message: { text: 'Manda os valores por item:\n\n1. borboleta na perna\n2. caveira na perna\n\nref: `orc_abc123`' },
        },
      }),
      env,
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.multi_budget, true);
    assert.equal(data.valor, 600);
    const patch = mock.supa.find(c => c.method === 'PATCH' && c.body?.includes('proposal_summary'));
    assert.ok(patch, 'PATCH multi-budget aconteceu');
    const body = JSON.parse(patch.body);
    assert.equal(body.estado_agente, 'propondo_valor');
    assert.equal(body.valor_proposto, 600);
    assert.equal(body.dados_coletados.budget_items[0].proposal.valor, 200);
    assert.equal(body.dados_coletados.budget_items[1].proposal.valor, 400);
    const reentrada = mock.supa.find(c => c.url.includes('/api/telegram/reentrada'));
    assert.ok(reentrada, 'reentrada disparada');
    assert.equal(JSON.parse(reentrada.body).evento, 'fechar_multi');
  } finally {
    mock.restore();
  }
});
