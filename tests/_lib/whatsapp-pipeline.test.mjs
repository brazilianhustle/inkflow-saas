import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { processMessage, TERMINAL_STATES, TYPING_DELAY_MS } from '../../functions/_lib/whatsapp-pipeline.js';

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

function baseMsg(overrides = {}) {
  return {
    tenantId: TENANT.id, telefone: TELEFONE,
    evoMessageId: 'EVO_1', texto: 'oi', mediaBase64: null, mediaMimetype: null,
    pushName: 'Joao', msgRowId: MSG_ROW_ID, tenant: TENANT,
    ...overrides,
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
    ...overrides,
  };
}

test('TERMINAL_STATES export', () => {
  assert.ok(TERMINAL_STATES instanceof Set);
  assert.equal(TERMINAL_STATES.has('aguardando_tatuador'), true);
  assert.equal(TERMINAL_STATES.has('lead_frio'), true);
  assert.equal(TERMINAL_STATES.has('aguardando_decisao_desconto'), true);
});

test('1. golden path tattoo — Task 9 implementa', async () => {
  let conversaPatch = null;
  let n8nInserts = [];
  const runAgentSpy = mock.fn(async () => ({
    ok: true, resposta_cliente: 'me conta o tamanho?',
    estado_novo: 'tattoo', dados_persistidos: { ideia: 'rosa' },
    proxima_acao: 'pergunta', agent_usado: 'tattoo',
  }));
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: { x: 1 }, dados_cadastro: {} }]), { status: 200 });
      }
      if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && init?.method === 'PATCH') {
        conversaPatch = JSON.parse(init.body);
        return new Response('[]', { status: 200 });
      }
      if (path === '/rest/v1/n8n_chat_histories' && init?.method === 'POST') {
        n8nInserts.push(JSON.parse(init.body));
        return new Response('[]', { status: 201 });
      }
      return new Response('[]', { status: 200 });
    },
    runAgent: runAgentSpy,
  });
  await processMessage({}, baseMsg(), deps);
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
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      supaCalls.push({ path, method: init?.method || 'GET' });
      if (path.startsWith('/rest/v1/conversas?tenant_id=')) {
        return new Response(JSON.stringify([{
          id: CONVERSA_ID, estado_agente: 'aguardando_tatuador',
          dados_coletados: {}, dados_cadastro: {},
        }]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
    sendTelegram: sendTelegramSpy,
    runAgent: runAgentSpy,
  });
  await processMessage({}, baseMsg(), deps);
  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(sendTelegramSpy.mock.callCount(), 1);
  assert.equal(sendTelegramSpy.mock.calls[0].arguments[0], '99999');
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /Cliente Joao/);
  const patchCall = supaCalls.find(c => c.method === 'PATCH' && c.path.includes('n8n_chat_histories'));
  assert.ok(patchCall, 'PATCH status=processed deve ter sido chamado');
});

test('3. terminal sem tatuador_telegram_chat_id — Task 8 implementa', async () => {
  const adminSpy = mock.fn(async () => ({ ok: true }));
  const tenantSemTatuador = { ...TENANT, tatuador_telegram_chat_id: null };
  const deps = mockDeps({
    supaFetch: async (path) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=')) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'lead_frio', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
    sendTelegramAdmin: adminSpy,
  });
  await processMessage({}, baseMsg({ tenant: tenantSemTatuador }), deps);
  assert.equal(adminSpy.mock.callCount(), 1);
});

test('4. handoff cadastro→orcamento — Task 10 implementa', async () => {
  const callToolSpy = mock.fn(async () => ({ ok: true }));
  const deps = mockDeps({
    supaFetch: async (path) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=')) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'cadastro', dados_coletados: {}, dados_cadastro: { nome: 'J' } }]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => ({
      ok: true, resposta_cliente: 'tudo certo, falo com ela',
      estado_novo: 'aguardando_tatuador', dados_persistidos: { email: 'a@b.com' },
      proxima_acao: 'handoff', agent_usado: 'cadastro',
    }),
    callTool: callToolSpy,
  });
  await processMessage({}, baseMsg(), deps);
  assert.equal(callToolSpy.mock.callCount(), 1);
  assert.equal(callToolSpy.mock.calls[0].arguments[0], 'enviar-orcamento-tatuador');
  assert.equal(callToolSpy.mock.calls[0].arguments[1].tenant_id, TENANT.id);
});

test('5. portfolio intent — Task 10 implementa', async () => {
  const evoSpy = mock.fn(async () => ({ ok: true }));
  const deps = mockDeps({
    supaFetch: async (path) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=')) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => ({
      ok: true, resposta_cliente: 'olha esses estilos:',
      estado_novo: 'tattoo', dados_persistidos: {},
      proxima_acao: 'enviar_portfolio', agent_usado: 'tattoo',
      urls_portfolio: ['https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg'],
    }),
    evoSend: evoSpy,
  });
  await processMessage({}, baseMsg(), deps);
  assert.equal(evoSpy.mock.callCount(), 4); // 1 text + 3 media
  assert.equal(evoSpy.mock.calls[0].arguments[1].type, 'text');
  assert.equal(evoSpy.mock.calls[1].arguments[1].type, 'media');
  assert.equal(evoSpy.mock.calls[1].arguments[1].url, 'https://x/1.jpg');
});

test('6. conversa nova — Task 8 implementa', async () => {
  let postBody = null;
  const deps = mockDeps({
    supaFetch: async (path, init) => {
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
  // Etapas 4-9 ainda lançam (placeholder), mas após a Etapa 1 CREATE que é o que estamos testando.
  // O catch path engole o throw + chama PATCH failed + sendTelegramAdmin. POST conversas já aconteceu.
  await processMessage({}, baseMsg(), deps);
  assert.equal(postBody?.estado_agente, 'coletando_tattoo');
  assert.deepEqual(postBody?.dados_coletados, {});
});

test('7. runAgent throws — Task 9 implementa', async () => {
  const adminSpy = mock.fn(async () => ({ ok: true }));
  const evoSpy = mock.fn(async () => ({ ok: true }));
  let lastPatch = null;
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
      }
      if (init?.method === 'PATCH') lastPatch = JSON.parse(init.body);
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => { throw new Error('SDK timeout'); },
    sendTelegramAdmin: adminSpy,
    evoSend: evoSpy,
  });
  await processMessage({}, baseMsg(), deps);
  assert.equal(adminSpy.mock.callCount(), 1);
  assert.equal(evoSpy.mock.callCount(), 0);
  assert.equal(lastPatch.status, 'failed');
});

test('8. evoSend(text) ok:false — Task 10 implementa', async () => {
  const adminSpy = mock.fn(async () => ({ ok: true }));
  let lastPatch = null;
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=')) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
      }
      if (init?.method === 'PATCH') lastPatch = JSON.parse(init.body);
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => ({ ok: true, resposta_cliente: 'r', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }),
    evoSend: async () => ({ ok: false, error: 'connection-refused' }),
    sendTelegramAdmin: adminSpy,
  });
  await processMessage({}, baseMsg(), deps);
  assert.equal(adminSpy.mock.callCount(), 1);
  assert.match(adminSpy.mock.calls[0].arguments[0], /sendText falhou/);
  assert.equal(lastPatch.status, 'failed');
});

test('9. midia base64 in nao duplica — Task 10 implementa', async () => {
  let n8nInsertCount = 0;
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=')) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
      }
      if (path === '/rest/v1/n8n_chat_histories' && init?.method === 'POST') {
        n8nInsertCount++;
        const body = JSON.parse(init.body);
        assert.equal(body.message.type, 'ai', 'pipeline so insere msg ai/out');
        return new Response('[]', { status: 201 });
      }
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => ({ ok: true, resposta_cliente: 'r', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }),
  });
  await processMessage({}, baseMsg({ mediaBase64: 'data', mediaMimetype: 'image/jpeg' }), deps);
  assert.equal(n8nInsertCount, 1);
});

test('10. historico mapeado — Task 9 implementa', async () => {
  let runAgentCallArg = null;
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
      }
      if (path.startsWith('/rest/v1/n8n_chat_histories?session_id=')) {
        return new Response(JSON.stringify([
          { id: 1, message: { type: 'human', content: 'msg1' } },
          { id: 2, message: { type: 'ai', content: 'resp1' } },
          { id: MSG_ROW_ID, message: { type: 'human', content: 'oi' } },
        ]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
    runAgent: async (args) => {
      runAgentCallArg = args;
      return { ok: true, resposta_cliente: 'r', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' };
    },
  });
  await processMessage({}, baseMsg(), deps);
  assert.deepEqual(runAgentCallArg.historico, [
    { role: 'user', content: 'msg1' },
    { role: 'assistant', content: 'resp1' },
  ]);
});

test('12. typing delay aplicado antes do evoSend (UX: bot nao parece robo)', async () => {
  const order = [];
  const sleepSpy = mock.fn(async (ms) => { order.push({ event: 'sleep', ms }); });
  const evoSpy = mock.fn(async () => { order.push({ event: 'evoSend' }); return { ok: true }; });
  const deps = mockDeps({
    supaFetch: async (path) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=')) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => ({ ok: true, resposta_cliente: 'oi', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }),
    sleep: sleepSpy,
    evoSend: evoSpy,
  });
  await processMessage({}, baseMsg(), deps);
  assert.equal(sleepSpy.mock.callCount(), 1, 'sleep chamado 1x');
  assert.equal(sleepSpy.mock.calls[0].arguments[0], TYPING_DELAY_MS, `sleep com TYPING_DELAY_MS (${TYPING_DELAY_MS})`);
  assert.equal(order[0]?.event, 'sleep', 'sleep ANTES do evoSend');
  assert.equal(order[1]?.event, 'evoSend', 'evoSend DEPOIS do sleep');
});

test('14. historico query usa whitelist status=eq.processed (anti history poisoning)', async () => {
  let histQuery = null;
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
      }
      if (path.startsWith('/rest/v1/n8n_chat_histories?session_id=')) {
        histQuery = path;
        return new Response('[]', { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => ({ ok: true, resposta_cliente: 'r', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }),
  });
  await processMessage({}, baseMsg(), deps);
  assert.match(histQuery, /status=eq\.processed/, 'whitelist (only processed)');
  assert.doesNotMatch(histQuery, /status=neq\.failed/, 'nao usa mais blacklist');
});

test('13. typing delay NAO aplicado em estado terminal (caminho early-return)', async () => {
  const sleepSpy = mock.fn(async () => {});
  const deps = mockDeps({
    supaFetch: async (path) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=')) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'aguardando_tatuador', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
    sleep: sleepSpy,
  });
  await processMessage({}, baseMsg(), deps);
  assert.equal(sleepSpy.mock.callCount(), 0, 'terminal early-return pula typing delay');
});

test('11. agent_usado=cadastro merge dados_cadastro — Task 9 implementa', async () => {
  let conversaPatch = null;
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'cadastro', dados_coletados: { ideia: 'rosa' }, dados_cadastro: { nome: 'Joao' } }]), { status: 200 });
      }
      if (init?.method === 'PATCH' && path.startsWith(`/rest/v1/conversas?id=eq.`)) {
        conversaPatch = JSON.parse(init.body);
      }
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => ({
      ok: true, resposta_cliente: 'r', estado_novo: 'aguardando_tatuador',
      dados_persistidos: { email: 'a@b.com' }, proxima_acao: 'handoff', agent_usado: 'cadastro',
    }),
  });
  await processMessage({}, baseMsg(), deps);
  assert.deepEqual(conversaPatch.dados_cadastro, { nome: 'Joao', email: 'a@b.com' });
  assert.deepEqual(conversaPatch.dados_coletados, { ideia: 'rosa' });
});

test('15. multi-message: resposta com \\n\\n envia 2 balões com typing delay antes de cada', async () => {
  let evoCalls = [];
  let sleepCalls = 0;
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'coletando_cadastro', dados_coletados: { descricao_curta: 'leão', altura_cm: 170, estilo: 'fineline', local_corpo: 'antebraço' }, dados_cadastro: {} }]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
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
  await processMessage({}, baseMsg(), deps);
  assert.equal(evoCalls.length, 2, 'deve enviar 2 mensagens separadas');
  assert.equal(evoCalls[0].text, 'Massa, fineline fica top!');
  assert.equal(evoCalls[1].text, 'Pra liberar teu orçamento, me passa nome completo e data de nascimento.');
  assert.ok(sleepCalls >= 2, 'deve chamar sleep antes de cada balão');
});

test('16. multi-message: resposta sem \\n\\n envia 1 mensagem (comportamento atual preservado)', async () => {
  let evoCalls = [];
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
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
  await processMessage({}, baseMsg(), deps);
  assert.equal(evoCalls.length, 1);
  assert.equal(evoCalls[0].text, 'Massa, fineline fica top!');
});

test('17. multi-message: \\n\\n\\n\\n (3+ newlines) trata como 1 separador (filter Boolean)', async () => {
  let evoCalls = [];
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
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
  await processMessage({}, baseMsg(), deps);
  assert.equal(evoCalls.length, 2, 'deve enviar 2 balões (newlines extras tratadas como 1 separador)');
});
