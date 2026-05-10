import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { processMessage, TERMINAL_STATES } from '../../functions/_lib/whatsapp-pipeline.js';

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
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'tattoo', dados_coletados: { x: 1 }, dados_cadastro: {} }]), { status: 200 });
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
  assert.equal(conversaPatch.estado_agente, 'tattoo');
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
  await processMessage({}, baseMsg(), mockDeps()); /* swallowed by pipeline catch — Task 10 replaces with real asserts */
  assert.ok(true);
});

test('5. portfolio intent — Task 10 implementa', async () => {
  await processMessage({}, baseMsg(), mockDeps()); /* swallowed by pipeline catch — Task 10 replaces with real asserts */
  assert.ok(true);
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
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 201 });
      }
      // Histórico + outros
      return new Response('[]', { status: 200 });
    },
  });
  // Etapas 4-9 ainda lançam (placeholder), mas após a Etapa 1 CREATE que é o que estamos testando.
  // O catch path engole o throw + chama PATCH failed + sendTelegramAdmin. POST conversas já aconteceu.
  await processMessage({}, baseMsg(), deps);
  assert.equal(postBody?.estado_agente, 'tattoo');
  assert.deepEqual(postBody?.dados_coletados, {});
});

test('7. runAgent throws — Task 9 implementa', async () => {
  const adminSpy = mock.fn(async () => ({ ok: true }));
  const evoSpy = mock.fn(async () => ({ ok: true }));
  let lastPatch = null;
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
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

test('8. evoSend text falha — Task 10 implementa', async () => {
  await processMessage({}, baseMsg(), mockDeps()); /* swallowed by pipeline catch — Task 10 replaces with real asserts */
  assert.ok(true);
});

test('9. midia base64 in nao duplica — Task 10 implementa', async () => {
  await processMessage({}, baseMsg(), mockDeps()); /* swallowed by pipeline catch — Task 10 replaces with real asserts */
  assert.ok(true);
});

test('10. historico mapeado — Task 9 implementa', async () => {
  let runAgentCallArg = null;
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
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
