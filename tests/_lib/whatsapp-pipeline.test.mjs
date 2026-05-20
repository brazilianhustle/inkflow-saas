import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { processBatch, TERMINAL_STATES, TYPING_DELAY_MS } from '../../functions/_lib/whatsapp-pipeline.js';
import { classificarFoto as classificarFotoReal } from '../../functions/_lib/foto-classifier.js';

const TENANT = {
  id: '00000000-0000-0000-0000-000000000001',
  nome_estudio: 'Estudio Teste',
  evo_instance: 'inkflow_test',
  evo_apikey: 'evo-key',
  tatuador_telegram_chat_id: '99999',
  config_agente: {},
  config_precificacao: { sinal_percentual: 30 },
  gatilhos_handoff: [], faqs: [], fewshots_por_modo: {},
};
const CONVERSA_ID = '11111111-1111-1111-1111-111111111111';
const TELEFONE = '5511999998888';
const MSG_ROW_ID = 12345;
const SESSION_ID = `${TENANT.id}_${TELEFONE}`;

// Constrói o resultado da Etapa 0 SELECT (linhas conversa_mensagens do lote).
function rowsFor(specs) {
  // specs: [{ id, content, media_base64, media_mimetype }]
  return specs.map(s => ({
    id: s.id,
    message: {
      type: 'human',
      content: s.content ?? '',
      media_base64: s.media_base64 ?? null,
      media_mimetype: s.media_mimetype ?? null,
    },
    created_at: '2026-05-20T00:00:00.000Z',
  }));
}

function baseBatch(overrides = {}) {
  return {
    session_id: SESSION_ID, tenantId: TENANT.id, telefone: TELEFONE,
    msgRowIds: [MSG_ROW_ID],
    ...overrides,
  };
}

// mockDeps já existente ganha resposta da Etapa 0 (tenant + rows) configurável.
// Helper que monta um supaFetch cobrindo tenant lookup, SELECT do lote, conversa, histórico.
function batchSupaFetch({ conversa, rows, onPatch, onPost, hist = [] }) {
  return async (path, init) => {
    // Etapa 0a: tenant lookup por id
    if (path.startsWith('/rest/v1/tenants?id=eq.') && !init?.method) {
      return new Response(JSON.stringify([TENANT]), { status: 200 });
    }
    // Etapa 0b: SELECT linhas do lote
    if (path.startsWith('/rest/v1/conversa_mensagens?id=in.') && !init?.method) {
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    // Etapa 1: LOAD conversa
    if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
      return new Response(JSON.stringify(conversa ? [conversa] : []), { status: 200 });
    }
    // Etapa 3: histórico
    if (path.startsWith('/rest/v1/conversa_mensagens?session_id=') && !init?.method) {
      return new Response(JSON.stringify(hist), { status: 200 });
    }
    if (init?.method === 'PATCH') { onPatch?.(path, JSON.parse(init.body)); return new Response('[]', { status: 200 }); }
    if (init?.method === 'POST') { onPost?.(path, JSON.parse(init.body)); return new Response('[]', { status: 201 }); }
    return new Response('[]', { status: 200 });
  };
}

function mockDeps(overrides = {}) {
  return {
    supaFetch: async () => new Response('[]', { status: 200 }),
    evoSend: async () => ({ ok: true }),
    sendTelegram: async () => ({ ok: true }),
    sendTelegramAdmin: async () => ({ ok: true }),
    runAgent: async () => ({ ok: true, resposta_cliente: 'oi de volta', estado_novo: 'tattoo',
                            dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }),
    callTool: async () => ({ ok: true }),
    now: () => '2026-05-09T12:00:00.000Z',
    sleep: async () => {},
    classificarFoto: () => 'referencia',
    ...overrides,
  };
}

test('TERMINAL_STATES export', () => {
  assert.ok(TERMINAL_STATES instanceof Set);
  assert.equal(TERMINAL_STATES.has('aguardando_tatuador'), true);
  assert.equal(TERMINAL_STATES.has('lead_frio'), true);
  assert.equal(TERMINAL_STATES.has('aguardando_decisao_desconto'), true);
});

test('RACE GUARD: 2 balões no mesmo lote → runAgent 1× e considera ambos os textos', async () => {
  // Pré-fix (processMessage fire-and-forget): 2 msgs = 2 invocações = 2 runAgent + histórico
  // incompleto. processBatch colapsa o lote num turno só.
  const runAgentSpy = mock.fn(async () => ({
    ok: true, resposta_cliente: 'beleza, recebi tudo', estado_novo: 'tattoo',
    dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo',
  }));
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    runAgent: runAgentSpy,
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 101, content: 'quero uma tattoo' },
        { id: 102, content: 'no antebraço' },
      ]),
    }),
  });
  await processBatch({}, baseBatch({ msgRowIds: [101, 102] }), deps);
  assert.equal(runAgentSpy.mock.callCount(), 1, 'runAgent deve rodar 1× pro lote inteiro');
  assert.match(runAgentSpy.mock.calls[0].arguments[0].mensagem, /quero uma tattoo/);
  assert.match(runAgentSpy.mock.calls[0].arguments[0].mensagem, /no antebraço/);
});

test('1. golden path tattoo — Task 9 implementa', async () => {
  let conversaPatch = null;
  let n8nInserts = [];
  const runAgentSpy = mock.fn(async () => ({
    ok: true, resposta_cliente: 'me conta o tamanho?',
    estado_novo: 'tattoo', dados_persistidos: { ideia: 'rosa' },
    proxima_acao: 'pergunta', agent_usado: 'tattoo',
  }));
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: { x: 1 }, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'oi' }]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.estado_agente) {
          conversaPatch = body;
        }
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') n8nInserts.push(body);
      },
    }),
    runAgent: runAgentSpy,
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(runAgentSpy.mock.callCount(), 1);
  assert.equal(conversaPatch.estado_agente, 'coletando_tattoo');
  assert.deepEqual(conversaPatch.dados_coletados, { x: 1, ideia: 'rosa' });
  assert.equal(n8nInserts.length, 1);
  assert.equal(n8nInserts[0].message.type, 'ai');
  assert.equal(n8nInserts[0].message.content, 'me conta o tamanho?');
});

test('2. terminal aguardando_tatuador — Task 8 implementa', async () => {
  let supaCalls = [];
  const sendTelegramSpy = mock.fn(async () => ({ ok: true }));
  const runAgentSpy = mock.fn();
  const conversa = { id: CONVERSA_ID, estado_agente: 'aguardando_tatuador', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      supaCalls.push({ path, method: init?.method || 'GET' });
      // Etapa 0a: tenant lookup por id
      if (path.startsWith('/rest/v1/tenants?id=eq.') && !init?.method) {
        return new Response(JSON.stringify([TENANT]), { status: 200 });
      }
      // Etapa 0b: SELECT linhas do lote
      if (path.startsWith('/rest/v1/conversa_mensagens?id=in.') && !init?.method) {
        return new Response(JSON.stringify(rowsFor([{ id: MSG_ROW_ID, content: 'oi' }])), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversas?tenant_id=')) {
        return new Response(JSON.stringify([conversa]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
    sendTelegram: sendTelegramSpy,
    runAgent: runAgentSpy,
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(sendTelegramSpy.mock.callCount(), 1);
  assert.equal(sendTelegramSpy.mock.calls[0].arguments[0], '99999');
  // pushName nao chega no batch → mensagem usa telefone (fallback). Confirma o wiring.
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /Cliente 5511999998888/);
  const patchCall = supaCalls.find(c => c.method === 'PATCH' && c.path.includes('conversa_mensagens'));
  assert.ok(patchCall, 'PATCH status=processed deve ter sido chamado');
});

test('3. terminal sem tatuador_telegram_chat_id — Task 8 implementa', async () => {
  const adminSpy = mock.fn(async () => ({ ok: true }));
  const tenantSemTatuador = { ...TENANT, tatuador_telegram_chat_id: null };
  const conversa = { id: CONVERSA_ID, estado_agente: 'lead_frio', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/tenants?id=eq.') && !init?.method) {
        return new Response(JSON.stringify([tenantSemTatuador]), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversa_mensagens?id=in.') && !init?.method) {
        return new Response(JSON.stringify(rowsFor([{ id: MSG_ROW_ID, content: 'oi' }])), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversas?tenant_id=')) {
        return new Response(JSON.stringify([conversa]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
    sendTelegramAdmin: adminSpy,
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(adminSpy.mock.callCount(), 1);
});

test('4. handoff cadastro→orcamento — Task 10 implementa', async () => {
  const callToolSpy = mock.fn(async () => ({ ok: true }));
  const conversa = { id: CONVERSA_ID, estado_agente: 'cadastro', dados_coletados: {}, dados_cadastro: { nome: 'J' } };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'oi' }]),
    }),
    runAgent: async () => ({
      ok: true, resposta_cliente: 'tudo certo, falo com ela',
      estado_novo: 'aguardando_tatuador', dados_persistidos: { email: 'a@b.com' },
      proxima_acao: 'handoff', agent_usado: 'cadastro',
    }),
    callTool: callToolSpy,
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(callToolSpy.mock.callCount(), 1);
  assert.equal(callToolSpy.mock.calls[0].arguments[0], 'enviar-orcamento-tatuador');
  assert.equal(callToolSpy.mock.calls[0].arguments[1].tenant_id, TENANT.id);
});

test('5. portfolio intent — Task 10 implementa', async () => {
  const evoSpy = mock.fn(async () => ({ ok: true }));
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'oi' }]),
    }),
    runAgent: async () => ({
      ok: true, resposta_cliente: 'olha esses estilos:',
      estado_novo: 'tattoo', dados_persistidos: {},
      proxima_acao: 'enviar_portfolio', agent_usado: 'tattoo',
      urls_portfolio: ['https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg'],
    }),
    evoSend: evoSpy,
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(evoSpy.mock.callCount(), 4); // 1 text + 3 media
  assert.equal(evoSpy.mock.calls[0].arguments[1].type, 'text');
  assert.equal(evoSpy.mock.calls[1].arguments[1].type, 'media');
  assert.equal(evoSpy.mock.calls[1].arguments[1].url, 'https://x/1.jpg');
});

test('6. conversa nova — Task 8 implementa', async () => {
  let postBody = null;
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/tenants?id=eq.') && !init?.method) {
        return new Response(JSON.stringify([TENANT]), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversa_mensagens?id=in.') && !init?.method) {
        return new Response(JSON.stringify(rowsFor([{ id: MSG_ROW_ID, content: 'oi' }])), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && init?.method !== 'POST') {
        return new Response('[]', { status: 200 });
      }
      if (path === '/rest/v1/conversas' && init?.method === 'POST') {
        postBody = JSON.parse(init.body);
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 201 });
      }
      // Histórico + outros
      return new Response('[]', { status: 200 });
    },
  });
  // runAgent stub (mockDeps) retorna ok → pipeline roda ate o fim. Asserimos o POST
  // de CREATE conversa (Etapa 1), que e o foco deste teste.
  await processBatch({}, baseBatch(), deps);
  assert.equal(postBody?.estado_agente, 'coletando_tattoo');
  assert.deepEqual(postBody?.dados_coletados, {});
});

test('7. runAgent throws — Task 9 implementa', async () => {
  const adminSpy = mock.fn(async () => ({ ok: true }));
  const evoSpy = mock.fn(async () => ({ ok: true }));
  let lastPatch = null;
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/tenants?id=eq.') && !init?.method) {
        return new Response(JSON.stringify([TENANT]), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversa_mensagens?id=in.') && !init?.method) {
        return new Response(JSON.stringify(rowsFor([{ id: MSG_ROW_ID, content: 'oi' }])), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
        return new Response(JSON.stringify([conversa]), { status: 200 });
      }
      if (init?.method === 'PATCH') lastPatch = JSON.parse(init.body);
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => { throw new Error('SDK timeout'); },
    sendTelegramAdmin: adminSpy,
    evoSend: evoSpy,
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(adminSpy.mock.callCount(), 1);
  assert.equal(evoSpy.mock.callCount(), 0);
  assert.equal(lastPatch.status, 'failed');
});

test('8. evoSend(text) ok:false — Task 10 implementa', async () => {
  const adminSpy = mock.fn(async () => ({ ok: true }));
  let lastPatch = null;
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/tenants?id=eq.') && !init?.method) {
        return new Response(JSON.stringify([TENANT]), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversa_mensagens?id=in.') && !init?.method) {
        return new Response(JSON.stringify(rowsFor([{ id: MSG_ROW_ID, content: 'oi' }])), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversas?tenant_id=')) {
        return new Response(JSON.stringify([conversa]), { status: 200 });
      }
      if (init?.method === 'PATCH') lastPatch = JSON.parse(init.body);
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => ({ ok: true, resposta_cliente: 'r', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }),
    evoSend: async () => ({ ok: false, error: 'connection-refused' }),
    sendTelegramAdmin: adminSpy,
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(adminSpy.mock.callCount(), 1);
  assert.match(adminSpy.mock.calls[0].arguments[0], /sendText falhou/);
  assert.equal(lastPatch.status, 'failed');
});

test('9. midia base64 in nao duplica insert AI', async () => {
  let aiInserts = 0;
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: '', media_base64: 'data', media_mimetype: 'image/jpeg' }]),
      onPost: (path, body) => { if (path === '/rest/v1/conversa_mensagens') { aiInserts++; assert.equal(body.message.type, 'ai'); } },
    }),
    runAgent: async () => ({ ok: true, resposta_cliente: 'r', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }),
    classificarFoto: () => 'referencia',
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(aiInserts, 1);
});

test('10. historico mapeado — Task 9 implementa', async () => {
  let runAgentCallArg = null;
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'oi' }]),
      // Query usa order=created_at.desc → mock devolve newest-first; pipeline da reverse()
      // pra cronológico. Por isso a ordem aqui e do mais novo pro mais antigo.
      hist: [
        { id: MSG_ROW_ID, message: { type: 'human', content: 'oi' } },
        { id: 2, message: { type: 'ai', content: 'resp1' } },
        { id: 1, message: { type: 'human', content: 'msg1' } },
      ],
    }),
    runAgent: async (args) => { runAgentCallArg = args; return { ok: true, resposta_cliente: 'r', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }; },
  });
  await processBatch({}, baseBatch(), deps);
  // historico em ordem cronológica (apos reverse), lote atual excluido.
  assert.deepEqual(runAgentCallArg.historico, [
    { role: 'user', content: 'msg1' },
    { role: 'assistant', content: 'resp1' },
  ]);
});

test('12. typing delay aplicado antes do evoSend (UX: bot nao parece robo)', async () => {
  const order = [];
  const sleepSpy = mock.fn(async (ms) => { order.push({ event: 'sleep', ms }); });
  const evoSpy = mock.fn(async () => { order.push({ event: 'evoSend' }); return { ok: true }; });
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'oi' }]),
    }),
    runAgent: async () => ({ ok: true, resposta_cliente: 'oi', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }),
    sleep: sleepSpy,
    evoSend: evoSpy,
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(sleepSpy.mock.callCount(), 1, 'sleep chamado 1x (resposta sem \\n\\n → 1 balão)');
  assert.equal(sleepSpy.mock.calls[0].arguments[0], TYPING_DELAY_MS, `sleep com TYPING_DELAY_MS (${TYPING_DELAY_MS})`);
  assert.equal(order[0]?.event, 'sleep', 'sleep ANTES do evoSend');
  assert.equal(order[1]?.event, 'evoSend', 'evoSend DEPOIS do sleep');
});

test('14. historico query usa whitelist status=eq.processed (anti history poisoning)', async () => {
  let histQuery = null;
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/tenants?id=eq.') && !init?.method) {
        return new Response(JSON.stringify([TENANT]), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversa_mensagens?id=in.') && !init?.method) {
        return new Response(JSON.stringify(rowsFor([{ id: MSG_ROW_ID, content: 'oi' }])), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
        return new Response(JSON.stringify([conversa]), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversa_mensagens?session_id=')) {
        histQuery = path;
        return new Response('[]', { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => ({ ok: true, resposta_cliente: 'r', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }),
  });
  await processBatch({}, baseBatch(), deps);
  assert.match(histQuery, /status=eq\.processed/, 'whitelist (only processed)');
  assert.doesNotMatch(histQuery, /status=neq\.failed/, 'nao usa mais blacklist');
});

test('13. typing delay NAO aplicado em estado terminal (caminho early-return)', async () => {
  const sleepSpy = mock.fn(async () => {});
  const conversa = { id: CONVERSA_ID, estado_agente: 'aguardando_tatuador', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/tenants?id=eq.') && !init?.method) {
        return new Response(JSON.stringify([TENANT]), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversa_mensagens?id=in.') && !init?.method) {
        return new Response(JSON.stringify(rowsFor([{ id: MSG_ROW_ID, content: 'oi' }])), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversas?tenant_id=')) {
        return new Response(JSON.stringify([conversa]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
    sleep: sleepSpy,
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(sleepSpy.mock.callCount(), 0, 'terminal early-return pula typing delay');
});

test('11. agent_usado=cadastro merge dados_cadastro — Task 9 implementa', async () => {
  let conversaPatch = null;
  const conversa = { id: CONVERSA_ID, estado_agente: 'cadastro', dados_coletados: { ideia: 'rosa' }, dados_cadastro: { nome: 'Joao' } };
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/tenants?id=eq.') && !init?.method) {
        return new Response(JSON.stringify([TENANT]), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversa_mensagens?id=in.') && !init?.method) {
        return new Response(JSON.stringify(rowsFor([{ id: MSG_ROW_ID, content: 'oi' }])), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
        return new Response(JSON.stringify([conversa]), { status: 200 });
      }
      if (init?.method === 'PATCH' && path.startsWith(`/rest/v1/conversas?id=eq.`) && JSON.parse(init.body).estado_agente) {
        conversaPatch = JSON.parse(init.body);
      }
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => ({
      ok: true, resposta_cliente: 'r', estado_novo: 'aguardando_tatuador',
      dados_persistidos: { email: 'a@b.com' }, proxima_acao: 'handoff', agent_usado: 'cadastro',
    }),
  });
  await processBatch({}, baseBatch(), deps);
  assert.deepEqual(conversaPatch.dados_cadastro, { nome: 'Joao', email: 'a@b.com' });
  assert.deepEqual(conversaPatch.dados_coletados, { ideia: 'rosa' });
});

test('15. multi-message: resposta com \\n\\n envia 2 balões com typing delay antes de cada', async () => {
  let evoCalls = [];
  let sleepCalls = 0;
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_cadastro', dados_coletados: { descricao_curta: 'leão', altura_cm: 170, estilo: 'fineline', local_corpo: 'antebraço' }, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'oi' }]),
    }),
    runAgent: async () => ({
      ok: true,
      resposta_cliente: 'Massa, fineline fica top!\n\nPra liberar teu orçamento, me passa nome completo e data de nascimento.',
      estado_novo: 'cadastro',
      dados_persistidos: { descricao_curta: 'leão', altura_cm: 170, estilo: 'fineline', local_corpo: 'antebraço' },
      proxima_acao: 'handoff',
      agent_usado: 'tattoo',
    }),
    evoSend: async (_tenant, payload) => { evoCalls.push(payload); return { ok: true }; },
    sleep: async () => { sleepCalls += 1; },
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(evoCalls.length, 2, 'deve enviar 2 mensagens separadas');
  assert.equal(evoCalls[0].text, 'Massa, fineline fica top!');
  assert.equal(evoCalls[1].text, 'Pra liberar teu orçamento, me passa nome completo e data de nascimento.');
  assert.equal(sleepCalls, 2, 'deve chamar sleep exatamente 2x (1 por balão)');
});

test('16. multi-message: resposta sem \\n\\n envia 1 mensagem (comportamento atual preservado)', async () => {
  let evoCalls = [];
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'oi' }]),
    }),
    runAgent: async () => ({
      ok: true,
      resposta_cliente: 'Massa, fineline fica top!',
      estado_novo: 'tattoo',
      dados_persistidos: {},
      proxima_acao: 'pergunta',
      agent_usado: 'tattoo',
    }),
    evoSend: async (_tenant, payload) => { evoCalls.push(payload); return { ok: true }; },
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(evoCalls.length, 1);
  assert.equal(evoCalls[0].text, 'Massa, fineline fica top!');
});

test('17. multi-message: \\n\\n\\n\\n (3+ newlines) trata como 1 separador (filter Boolean)', async () => {
  let evoCalls = [];
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'oi' }]),
    }),
    runAgent: async () => ({
      ok: true,
      resposta_cliente: 'Primeira frase.\n\n\n\nSegunda frase.',
      estado_novo: 'tattoo',
      dados_persistidos: {},
      proxima_acao: 'pergunta',
      agent_usado: 'tattoo',
    }),
    evoSend: async (_tenant, payload) => { evoCalls.push(payload); return { ok: true }; },
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(evoCalls.length, 2, 'deve enviar 2 balões (newlines extras tratadas como 1 separador)');
});

test('18. multi-message: resposta_cliente só whitespace → guard throw → status=failed', async () => {
  let lastPatch = null;
  let evoCalls = 0;
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/tenants?id=eq.') && !init?.method) {
        return new Response(JSON.stringify([TENANT]), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversa_mensagens?id=in.') && !init?.method) {
        return new Response(JSON.stringify(rowsFor([{ id: MSG_ROW_ID, content: 'oi' }])), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
        return new Response(JSON.stringify([conversa]), { status: 200 });
      }
      if (init?.method === 'PATCH') lastPatch = JSON.parse(init.body);
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => ({
      ok: true,
      resposta_cliente: '   \n\n   ',
      estado_novo: 'tattoo',
      dados_persistidos: {},
      proxima_acao: 'pergunta',
      agent_usado: 'tattoo',
    }),
    evoSend: async () => { evoCalls += 1; return { ok: true }; },
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(evoCalls, 0, 'resposta vazia após split não envia nenhum balão');
  assert.equal(lastPatch?.status, 'failed', 'guard throw é capturado → status=failed');
});

test('Etapa 4.5: 2 fotos no lote → 1ª foto_local, 2ª vai pra refs', async () => {
  let conversaPatches = [];
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const classifySpy = mock.fn();
  classifySpy.mock.mockImplementationOnce(() => 'local');
  classifySpy.mock.mockImplementation(() => 'referencia');
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 201, content: 'essa é minha', media_base64: 'a', media_mimetype: 'image/jpeg' },
        { id: 202, content: 'essa é referência', media_base64: 'b', media_mimetype: 'image/jpeg' },
      ]),
      onPatch: (path, body) => { if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.dados_coletados) conversaPatches.push(body.dados_coletados); },
    }),
    runAgent: async () => ({ ok: true, resposta_cliente: 'recebi', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }),
    classificarFoto: classifySpy,
  });
  await processBatch({}, baseBatch({ msgRowIds: [201, 202] }), deps);
  const fotoPatch = conversaPatches.find(p => p.foto_local_msg_id || p.refs_imagens_msg_ids);
  assert.equal(fotoPatch.foto_local_msg_id, 201);
  assert.deepEqual(fotoPatch.refs_imagens_msg_ids, [202]);
});

test('Etapa 4.5: classificador REAL — keyword na caption de UMA foto nao vaza pras outras', async () => {
  // Regressao: com texto concatenado do lote, o keyword "braço" da foto 201 vazava pra foto 202
  // (KEYWORDS_LOCAL/L2 olha so o texto) → ambas viravam 'local' → foto_local sobrescrita pra 202,
  // foto 201 (o corpo real) sumia. Fix: classifica cada foto pela caption DELA + 1 local por lote.
  let conversaPatches = [];
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 201, content: 'aqui no meu braço', media_base64: 'a', media_mimetype: 'image/jpeg' }, // local (keyword)
        { id: 202, content: 'tipo essa daqui', media_base64: 'b', media_mimetype: 'image/jpeg' },     // ref (sem keyword)
      ]),
      onPatch: (path, body) => { if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.dados_coletados) conversaPatches.push(body.dados_coletados); },
    }),
    runAgent: async () => ({ ok: true, resposta_cliente: 'recebi', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }),
    classificarFoto: classificarFotoReal, // classificador de verdade (sem stub)
  });
  await processBatch({}, baseBatch({ msgRowIds: [201, 202] }), deps);
  const fotoPatch = conversaPatches.find(p => p.foto_local_msg_id || p.refs_imagens_msg_ids);
  assert.equal(fotoPatch.foto_local_msg_id, 201, 'a foto cuja caption tem keyword e a local');
  assert.deepEqual(fotoPatch.refs_imagens_msg_ids, [202], 'a outra vira ref, nao e dropada');
});

test('Etapa 4.5: classificador REAL — 2 fotos ambas com keyword → 1ª local, 2ª ref (nao dropa)', async () => {
  let conversaPatches = [];
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 301, content: 'no meu braço', media_base64: 'a', media_mimetype: 'image/jpeg' },
        { id: 302, content: 'e na minha perna tambem', media_base64: 'b', media_mimetype: 'image/jpeg' },
      ]),
      onPatch: (path, body) => { if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.dados_coletados) conversaPatches.push(body.dados_coletados); },
    }),
    runAgent: async () => ({ ok: true, resposta_cliente: 'recebi', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }),
    classificarFoto: classificarFotoReal,
  });
  await processBatch({}, baseBatch({ msgRowIds: [301, 302] }), deps);
  const fotoPatch = conversaPatches.find(p => p.foto_local_msg_id || p.refs_imagens_msg_ids);
  assert.equal(fotoPatch.foto_local_msg_id, 301, 'so a 1ª local vence');
  assert.deepEqual(fotoPatch.refs_imagens_msg_ids, [302], '2ª local vai pra refs em vez de sobrescrever (sem drop)');
});
