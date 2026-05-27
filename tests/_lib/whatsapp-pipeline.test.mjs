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
function batchSupaFetch({ conversa, rows, onPatch, onPost, hist = [], newerReceived = [], tenant = TENANT }) {
  return async (path, init) => {
    // Etapa 0a: tenant lookup por id
    if (path.startsWith('/rest/v1/tenants?id=eq.') && !init?.method) {
      return new Response(JSON.stringify([tenant]), { status: 200 });
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
    if (path.startsWith('/rest/v1/conversa_mensagens?session_id=') && path.includes('status=eq.received') && !init?.method) {
      return new Response(JSON.stringify(newerReceived), { status: 200 });
    }
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
  assert.equal(runAgentSpy.mock.calls[0].arguments[0].clientContext.is_first_contact, true);
  assert.equal(runAgentSpy.mock.calls[0].arguments[0].clientContext.batch_message_count, 2);
  assert.equal(runAgentSpy.mock.calls[0].arguments[0].clientContext.batch_joined_by, 'newline');
});

test('HOTFIX: Etapa 1 select NÃO pede coluna fantasma estado_extra (mismatch schema→query)', async () => {
  // Regressão: estado_extra não existe na tabela conversas (nenhuma migration cria).
  // Pedi-la no select → PostgREST 400 → código tratava como "conversa não existe" → INSERT → 409.
  let convSelectPath = null;
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/tenants?id=eq.') && !init?.method)
        return new Response(JSON.stringify([TENANT]), { status: 200 });
      if (path.startsWith('/rest/v1/conversa_mensagens?id=in.') && !init?.method)
        return new Response(JSON.stringify(rowsFor([{ id: MSG_ROW_ID, content: 'oi' }])), { status: 200 });
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
        convSelectPath = path;
        return new Response(JSON.stringify([conversa]), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversa_mensagens?session_id=') && !init?.method)
        return new Response(JSON.stringify([]), { status: 200 });
      return new Response('[]', { status: 200 });
    },
  });
  await processBatch({}, baseBatch(), deps);
  assert.ok(convSelectPath, 'select da conversa deve ter rodado');
  assert.ok(!convSelectPath.includes('estado_extra'),
    `select não deve pedir coluna inexistente estado_extra (path: ${convSelectPath})`);
});

test('HOTFIX: SELECT da conversa com erro 4xx → NÃO tenta INSERT cego (evita 409 mascarado)', async () => {
  // Guard defensivo: "convArr[0] undefined" significava tanto "não existe" quanto "select falhou".
  // Um select que falha (não-array / status>=400) deve THROW (transiente, DO re-tenta), nunca virar
  // INSERT cego que mascara a causa real como 409 duplicate key.
  let insertTentado = false;
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/tenants?id=eq.') && !init?.method)
        return new Response(JSON.stringify([TENANT]), { status: 200 });
      if (path.startsWith('/rest/v1/conversa_mensagens?id=in.') && !init?.method)
        return new Response(JSON.stringify(rowsFor([{ id: MSG_ROW_ID, content: 'oi' }])), { status: 200 });
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method)
        return new Response(JSON.stringify({ code: '42703', message: 'column conversas.estado_extra does not exist' }), { status: 400 });
      if (path === '/rest/v1/conversas' && init?.method === 'POST') {
        insertTentado = true;
        return new Response(JSON.stringify({ code: '23505', message: 'duplicate key' }), { status: 409 });
      }
      return new Response('[]', { status: 200 });
    },
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(insertTentado, false, 'SELECT falho não deve disparar INSERT cego (que vira 409)');
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

test('ConversationRouter Slice 1: preço genérico responde sem chamar runAgent nem mudar estado', async () => {
  const runAgentSpy = mock.fn(async () => {
    throw new Error('runAgent nao deveria ser chamado');
  });
  let conversaPatch = null;
  let aiInsert = null;
  const evoCalls = [];
  const logAgentTurnSpy = mock.fn();
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: { descricao_curta: 'rosa' },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'quanto fica?' }]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.estado_agente) {
          conversaPatch = body;
        }
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
    evoSend: async (_tenant, payload) => { evoCalls.push(payload); return { ok: true }; },
    logAgentTurn: logAgentTurnSpy,
  });

  await processBatch({}, baseBatch(), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(logAgentTurnSpy.mock.callCount(), 2);
  const routerLog = logAgentTurnSpy.mock.calls
    .map(call => call.arguments[0])
    .find(entry => entry.agent_name === 'conversation_router');
  assert.ok(routerLog, 'ConversationRouter deve registrar a decisao de intent');
  assert.equal(routerLog.context_metadata.router_intent, 'preco_generico');
  assert.equal(routerLog.context_metadata.router_reason, 'generic_price_question_without_negotiation');
  assert.equal(routerLog.context_metadata.router_can_mutate_state, false);
  assert.equal(routerLog.context_metadata.tenant_context_layer, 'tenant_context_manager');
  assert.equal(routerLog.context_metadata.tenant_context_aceita_cobertura, true);
  const workflowLog = logAgentTurnSpy.mock.calls
    .map(call => call.arguments[0])
    .find(entry => entry.agent_name === 'workflow_manager');
  assert.ok(workflowLog, 'Workflow Manager deve registrar preservacao de estado');
  assert.equal(workflowLog.context_metadata.workflow_layer, 'workflow_manager');
  assert.equal(workflowLog.context_metadata.workflow_from_state, 'tattoo');
  assert.equal(workflowLog.context_metadata.workflow_to_state, 'tattoo');
  assert.equal(workflowLog.context_metadata.workflow_transition_allowed, false);
  assert.equal(workflowLog.context_metadata.workflow_reason, 'state_preserved_by_router_policy');
  assert.equal(workflowLog.context_metadata.workflow_can_mutate_state, false);
  assert.equal(workflowLog.context_metadata.workflow_blocked_mutation, false);
  assert.equal(conversaPatch.estado_agente, 'coletando_tattoo');
  assert.deepEqual(conversaPatch.dados_coletados, { descricao_curta: 'rosa' });
  assert.match(aiInsert.message.content, /O valor depende/);
  assert.match(aiInsert.message.content, /parte do corpo\?/);
  assert.equal(evoCalls.length, 2, 'resposta em 2 balões');
});

test('ConversationRouter Slice 1: kill switch cai no runAgent atual', async () => {
  const runAgentSpy = mock.fn(async () => ({
    ok: true, resposta_cliente: 'agent respondeu', estado_novo: 'tattoo',
    dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo',
  }));
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: {},
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'quanto fica?' }]),
    }),
    runAgent: runAgentSpy,
  });

  await processBatch({ DISABLE_CONVERSATION_ROUTER: 'true' }, baseBatch(), deps);

  assert.equal(runAgentSpy.mock.callCount(), 1);
});

test('ConversationRouter Slice 1: foto com legenda passa pelo runAgent para preservar visão', async () => {
  const runAgentSpy = mock.fn(async (args) => {
    assert.equal(args.imagens.length, 1, 'runAgent deve receber a imagem do turno');
    return {
      ok: true,
      resposta_cliente: 'recebi tua foto',
      estado_novo: 'tattoo',
      dados_persistidos: {},
      proxima_acao: 'pergunta',
      agent_usado: 'tattoo',
      analise_imagens: [
        { tipo: 'corpo', descricao: 'antebraco', corpo_tem_tattoo: false, corpo_tem_marcacao: false },
      ],
    };
  });
  let conversaPatches = [];
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: { descricao_curta: 'rosa' },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'quanto fica?', media_base64: 'img', media_mimetype: 'image/jpeg' }]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.dados_coletados) {
          conversaPatches.push(body.dados_coletados);
        }
      },
    }),
    runAgent: runAgentSpy,
    classificarFoto: () => { throw new Error('classificarFoto nao devia rodar quando analise_imagens existe'); },
  });

  await processBatch({}, baseBatch(), deps);

  assert.equal(runAgentSpy.mock.callCount(), 1);
  const fotoPatch = conversaPatches.find(p => p.foto_local_msg_id || p.refs_imagens_msg_ids);
  assert.equal(fotoPatch.foto_local_msg_id, MSG_ROW_ID);
});

test('ConversationRouter Slice 1: primeiro contato com saudacao pura cai no runAgent para preservar apresentação', async () => {
  const runAgentSpy = mock.fn(async (args) => {
    assert.equal(args.clientContext.is_first_contact, true);
    return {
      ok: true,
      resposta_cliente: 'Atendente:\nOi, eu te ajudo por aqui',
      estado_novo: 'tattoo',
      dados_persistidos: {},
      proxima_acao: 'pergunta',
      agent_usado: 'tattoo',
    };
  });
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: {},
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'oi' }]),
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
  });

  await processBatch({}, baseBatch(), deps);

  assert.equal(runAgentSpy.mock.callCount(), 1);
  assert.equal(aiInsert.message.content, 'Atendente:\nOi, eu te ajudo por aqui');
});

test('Pipeline: primeiro contato misto de coleta passa contexto de apresentação ao runAgent', async () => {
  const runAgentSpy = mock.fn(async (args) => {
    assert.equal(args.clientContext.is_first_contact, true);
    assert.equal(args.clientContext.batch_message_count, 2);
    assert.match(args.mensagem, /oi/);
    assert.match(args.mensagem, /quero fazer uma tatuagem no braço/);
    return {
      ok: true,
      resposta_cliente: 'Oii, tudo bem?\n\nMe chamo Assistente, muito prazer!\n\nE qual o tema ou ideia da tatuagem?',
      estado_novo: 'tattoo',
      dados_persistidos: { local_corpo: 'braço' },
      proxima_acao: 'pergunta',
      agent_usado: 'tattoo',
    };
  });
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: {},
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 101, content: 'oi' },
        { id: 102, content: 'quero fazer uma tatuagem no braço' },
      ]),
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
  });

  await processBatch({}, baseBatch({ msgRowIds: [101, 102] }), deps);

  assert.equal(runAgentSpy.mock.callCount(), 1);
  assert.match(aiInsert.message.content, /^Oii, tudo bem\?\n\nMe chamo Assistente/);
  assert.match(aiInsert.message.content, /qual o tema ou ideia da tatuagem\?/i);
});

test('ConversationRouter Slice 1: primeiro contato misto com preço usa router e não fica só na saudação', async () => {
  const runAgentSpy = mock.fn();
  let conversaPatch = null;
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: {},
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 101, content: 'opa' },
        { id: 102, content: 'eu quero fazer um anjo na perna' },
        { id: 103, content: 'quanto fica' },
      ]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`)) conversaPatch = body;
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
  });

  await processBatch({}, baseBatch({ msgRowIds: [101, 102, 103] }), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(conversaPatch.dados_coletados.descricao_curta, 'anjo');
  assert.equal(conversaPatch.dados_coletados.local_corpo, 'perna');
  assert.match(aiInsert.message.content, /^Oii, tudo bem\./);
  assert.doesNotMatch(aiInsert.message.content, /Me chamo atendente|muito prazer/);
  assert.match(aiInsert.message.content, /O valor depende/);
  assert.match(aiInsert.message.content, /Pra montar tua proposta certinho/);
  assert.match(aiInsert.message.content, /como posso te chamar\?$/i);
  assert.equal((aiInsert.message.content.match(/\?/g) || []).length, 1);
  assert.doesNotMatch(aiInsert.message.content, /Qual tua altura\?/);
  assert.doesNotMatch(aiInsert.message.content, /^Oii, tudo bem\??$/);
});

test('ConversationRouter Slice 1: primeiro contato misto com "quanto que é" não cai no agent seco', async () => {
  const runAgentSpy = mock.fn();
  let conversaPatch = null;
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: {},
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 101, content: 'opa' },
        { id: 102, content: 'quero fazer um foguinho na virilha' },
        { id: 103, content: 'quanto que é' },
      ]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`)) conversaPatch = body;
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
  });

  await processBatch({}, baseBatch({ msgRowIds: [101, 102, 103] }), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(conversaPatch.dados_coletados.descricao_curta, 'foguinho');
  assert.equal(conversaPatch.dados_coletados.local_corpo, 'virilha');
  assert.match(aiInsert.message.content, /^Oii, tudo bem\./);
  assert.doesNotMatch(aiInsert.message.content, /Me chamo atendente|muito prazer/);
  assert.match(aiInsert.message.content, /O valor depende/);
  assert.match(aiInsert.message.content, /como posso te chamar\?$/i);
  assert.equal((aiInsert.message.content.match(/\?/g) || []).length, 1);
  assert.doesNotMatch(aiInsert.message.content, /Qual a sua altura\?|Qual tua altura\?|sua altura/i);
});

test('ConversationRouter Slice 1.1: preço em lote misto persiste dados explícitos e retoma próximo campo', async () => {
  const runAgentSpy = mock.fn();
  let conversaPatch = null;
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: {},
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 101, content: 'quero fazer uma tauagem de um leao no braço' },
        { id: 102, content: 'quanto fica?' },
      ]),
      hist: [{ id: 1, message: { type: 'ai', content: 'Oii, tudo bem?' } }],
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`)) conversaPatch = body;
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
  });

  await processBatch({}, baseBatch({ msgRowIds: [101, 102] }), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(conversaPatch.dados_coletados.descricao_curta, 'leao');
  assert.equal(conversaPatch.dados_coletados.local_corpo, 'braço');
  assert.match(aiInsert.message.content, /Qual tua altura\?/);
  assert.doesNotMatch(aiInsert.message.content, /Me conta o que tu pensa em tatuar\?/);
});

test('ConversationRouter Slice 1.1: se nome foi perguntado, não continua formulário técnico', async () => {
  const runAgentSpy = mock.fn();
  let conversaPatch = null;
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: {},
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 101, content: 'quero fazer uma baleia na barriga' },
        { id: 102, content: 'quanto fica' },
      ]),
      hist: [
        { id: 1, message: { type: 'human', content: 'opa' } },
        { id: 2, message: { type: 'ai', content: 'Oii, tudo bem?\n\nMe chamo Assistente, muito prazer! Como posso te chamar?' } },
      ],
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`)) conversaPatch = body;
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
  });

  await processBatch({}, baseBatch({ msgRowIds: [101, 102] }), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(conversaPatch.dados_coletados.descricao_curta, 'baleia');
  assert.equal(conversaPatch.dados_coletados.local_corpo, 'barriga');
  assert.equal(aiInsert.message.content, 'O valor depende do tamanho, detalhe e local do corpo. O tatuador confirma certinho depois de avaliar tua ideia.');
  assert.doesNotMatch(aiInsert.message.content, /Qual tua altura\?/);
  assert.doesNotMatch(aiInsert.message.content, /como posso te chamar/i);
});

test('ConversationRouter Slice 1.1: pergunta pendente de altura bloqueia próxima pergunta de coleta', async () => {
  const runAgentSpy = mock.fn();
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: { descricao_curta: 'baleia', local_corpo: 'barriga' },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: 101, content: 'quanto tempo demora?' }]),
      hist: [
        { id: 1, message: { type: 'ai', content: 'Pra montar tua proposta certinho, preciso só de algumas infos. Qual tua altura?' } },
      ],
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
  });

  await processBatch({}, baseBatch({ msgRowIds: [101] }), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.match(aiInsert.message.content, /O tempo de sessão depende/);
  assert.doesNotMatch(aiInsert.message.content, /estilo/i);
  assert.doesNotMatch(aiInsert.message.content, /Pra montar tua proposta/);
});

test('ConversationRouter Slice 1.2: resposta ao nome + lateral retoma coleta', async () => {
  const runAgentSpy = mock.fn();
  let conversaPatch = null;
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: { descricao_curta: 'aguia', local_corpo: 'costas' },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 101, content: 'sou Leandro' },
        { id: 102, content: 'como funciona o orçamento' },
      ]),
      hist: [
        { id: 1, message: { type: 'ai', content: 'Pra montar tua proposta certinho, como posso te chamar?' } },
      ],
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`)) conversaPatch = body;
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
  });

  await processBatch({}, baseBatch({ msgRowIds: [101, 102] }), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(conversaPatch.dados_coletados.descricao_curta, 'aguia');
  assert.equal(conversaPatch.dados_coletados.local_corpo, 'costas');
  assert.match(aiInsert.message.content, /Funciona assim/);
  assert.match(aiInsert.message.content, /Boa, Leandro\. Me diz tua altura\?/);
  assert.doesNotMatch(aiInsert.message.content, /Boa, Leandro\. Pra montar tua proposta certinho/);
});

test('ConversationRouter Slice 1.2: nome puro + lateral retoma coleta', async () => {
  const runAgentSpy = mock.fn();
  let conversaPatch = null;
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: { descricao_curta: 'batman', local_corpo: 'braço' },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 101, content: 'Joao' },
        { id: 102, content: 'como funciona o orçamento?' },
      ]),
      hist: [
        { id: 1, message: { type: 'ai', content: 'Pra montar tua proposta certinho, como posso te chamar?' } },
      ],
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`)) conversaPatch = body;
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
  });

  await processBatch({}, baseBatch({ msgRowIds: [101, 102] }), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(conversaPatch.dados_coletados.descricao_curta, 'batman');
  assert.equal(conversaPatch.dados_coletados.local_corpo, 'braço');
  assert.match(aiInsert.message.content, /Funciona assim/);
  assert.match(aiInsert.message.content, /Boa, Joao\. Me diz tua altura\?/);
});

test('ConversationRouter Slice 1.2: me chama de + lateral retoma coleta', async () => {
  const runAgentSpy = mock.fn();
  let conversaPatch = null;
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: { descricao_curta: 'foguinho', local_corpo: 'virilha' },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 101, content: 'me chama de Paola' },
        { id: 102, content: 'como funciona o orçamento' },
      ]),
      hist: [
        { id: 1, message: { type: 'ai', content: 'Pra montar tua proposta certinho, como posso te chamar?' } },
      ],
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`)) conversaPatch = body;
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
  });

  await processBatch({}, baseBatch({ msgRowIds: [101, 102] }), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(conversaPatch.dados_coletados.local_corpo, 'virilha');
  assert.match(aiInsert.message.content, /Funciona assim/);
  assert.match(aiInsert.message.content, /Boa, Paola\. Me diz tua altura\?/);
});

test('ConversationRouter Slice 1.2: resposta à altura + lateral persiste altura e avança', async () => {
  const runAgentSpy = mock.fn();
  let conversaPatch = null;
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: { descricao_curta: 'baleia', local_corpo: 'barriga' },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 101, content: 'tenho 1.70' },
        { id: 102, content: 'quanto tempo demora?' },
      ]),
      hist: [
        { id: 1, message: { type: 'ai', content: 'Pra montar tua proposta certinho, preciso só de algumas infos. Qual tua altura?' } },
      ],
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`)) conversaPatch = body;
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
  });

  await processBatch({}, baseBatch({ msgRowIds: [101, 102] }), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(conversaPatch.dados_coletados.altura_cm, 170);
  assert.match(aiInsert.message.content, /O tempo de sessão depende/);
  assert.match(aiInsert.message.content, /Tu prefere qual estilo/);
});

test('ConversationRouter Slice 1.2: altura após retomada compacta persiste e avança', async () => {
  const runAgentSpy = mock.fn();
  let conversaPatch = null;
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: { descricao_curta: 'rosa', local_corpo: 'braço' },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 101, content: 'tenho 160' },
        { id: 102, content: 'quantas sessoes seria?' },
      ]),
      hist: [
        { id: 1, message: { type: 'ai', content: 'O valor depende do tamanho, detalhe e local do corpo. O tatuador confirma certinho depois de avaliar tua ideia.\n\nBoa, Joane. Me diz tua altura?' } },
      ],
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`)) conversaPatch = body;
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
  });

  await processBatch({}, baseBatch({ msgRowIds: [101, 102] }), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(conversaPatch.dados_coletados.altura_cm, 160);
  assert.match(aiInsert.message.content, /O tempo de sessão depende/);
  assert.match(aiInsert.message.content, /Tu prefere qual estilo/);
  assert.doesNotMatch(aiInsert.message.content, /Me diz tua altura\?/);
});

test('ConversationRouter Slice 1.2: resposta ao estilo + lateral persiste estilo e pede foto', async () => {
  const runAgentSpy = mock.fn();
  let conversaPatch = null;
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: { descricao_curta: 'hiena', local_corpo: 'panturrilha', altura_cm: 170 },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 101, content: 'realismo' },
        { id: 102, content: 'em quantas sessoes seria' },
      ]),
      hist: [
        { id: 1, message: { type: 'ai', content: 'Me diz o estilo que tu prefere?' } },
      ],
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`)) conversaPatch = body;
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
  });

  await processBatch({}, baseBatch({ msgRowIds: [101, 102] }), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(conversaPatch.dados_coletados.estilo, 'realismo');
  assert.match(aiInsert.message.content, /O tempo de sessão depende/);
  assert.match(aiInsert.message.content, /foto do local/);
});

test('ConversationRouter Slice 1.3: preço repetido usa resposta curta e preserva coleta', async () => {
  const runAgentSpy = mock.fn();
  let conversaPatch = null;
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: { descricao_curta: 'hiena', local_corpo: 'perna', altura_cm: 180 },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: 101, content: 'quanto é?' }]),
      hist: [
        { id: 1, message: { type: 'ai', content: 'O valor depende do tamanho, detalhe e local do corpo. O tatuador confirma certinho depois de avaliar tua ideia.' } },
      ],
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`)) conversaPatch = body;
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
  });

  await processBatch({}, baseBatch({ msgRowIds: [101] }), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(conversaPatch.dados_coletados.altura_cm, 180);
  assert.match(aiInsert.message.content, /^Isso, o valor fecha depois da avaliação do tatuador\./);
  assert.doesNotMatch(aiInsert.message.content, /O valor depende do tamanho/);
});

test('ConversationRouter Slice 1.3: resposta ao estilo + lateral não repete retomada longa', async () => {
  const runAgentSpy = mock.fn();
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: { descricao_curta: 'hiena', local_corpo: 'perna', altura_cm: 180 },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 101, content: 'realismo' },
        { id: 102, content: 'quanto é?' },
      ]),
      hist: [
        { id: 1, message: { type: 'ai', content: 'Pra montar tua proposta certinho, preciso só de algumas infos. Me diz o estilo que tu prefere?' } },
      ],
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
  });

  await processBatch({}, baseBatch({ msgRowIds: [101, 102] }), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.doesNotMatch(aiInsert.message.content, /Pra montar tua proposta certinho, preciso só de algumas infos/);
  assert.match(aiInsert.message.content, /Com isso já ajuda bastante\. Consegue mandar uma foto do local\?/);
});

test('Pipeline: se chega mensagem humana mais nova durante processamento, difere resposta stale', async () => {
  const runAgentSpy = mock.fn(async () => ({
    ok: true,
    resposta_cliente: 'Fechou, Joane! E qual a sua altura?',
    estado_novo: 'tattoo',
    dados_persistidos: {},
    proxima_acao: 'pergunta',
    agent_usado: 'tattoo',
  }));
  let conversaPatch = null;
  let aiInsert = null;
  let processedPatch = null;
  const evoCalls = [];
  const adminCalls = [];
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: { descricao_curta: 'foguinho', local_corpo: 'bunda' },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: 101, content: 'Joane' }]),
      hist: [
        { id: 1, message: { type: 'ai', content: 'Pra montar tua proposta certinho, como posso te chamar?' } },
      ],
      newerReceived: [
        { id: 102, message: { type: 'human', content: 'como funciona o orçamento' } },
      ],
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`)) conversaPatch = body;
        if (path.startsWith('/rest/v1/conversa_mensagens?id=in.')) processedPatch = body;
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
    evoSend: async (_tenant, payload) => { evoCalls.push(payload); return { ok: true }; },
    sendTelegramAdmin: async (text) => { adminCalls.push(text); return { ok: true }; },
  });

  await assert.rejects(
    () => processBatch({ DISABLE_CONVERSATION_ROUTER: 'true' }, baseBatch({ msgRowIds: [101] }), deps),
    /stale-batch/,
  );

  assert.equal(runAgentSpy.mock.callCount(), 1);
  assert.equal(conversaPatch, null, 'não deve atualizar conversa com resposta stale');
  assert.equal(aiInsert, null, 'não deve inserir AI que não foi enviada');
  assert.equal(processedPatch, null, 'não deve marcar o lote como processed/failed');
  assert.equal(evoCalls.length, 0, 'não deve enviar pergunta antiga no WhatsApp');
  assert.equal(adminCalls.length, 0, 'stale batch é retry controlado, sem alerta de falha');
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

test('2b. aguardando_tatuador com mudanca de ideia pergunta se substitui ou adiciona e notifica Telegram', async () => {
  let conversaPatch = null;
  let aiInsert = null;
  let processedPatch = null;
  const evoCalls = [];
  const sendTelegramSpy = mock.fn(async () => ({ ok: true }));
  const runAgentSpy = mock.fn();
  const callToolSpy = mock.fn();
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'aguardando_tatuador',
    orcid: 'orc_old',
    dados_coletados: {
      descricao_curta: 'dragao',
      local_corpo: 'perna',
      altura_cm: 170,
      estilo: 'realismo',
    },
    dados_cadastro: { nome: 'Leandro' },
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'mudei de ideia, queria uma caveira na perna' }]),
      onPatch: (path, body) => {
        if (path.startsWith('/rest/v1/conversas?id=')) conversaPatch = body;
        if (path.startsWith('/rest/v1/conversa_mensagens?id=in.')) processedPatch = body;
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    sendTelegram: sendTelegramSpy,
    runAgent: runAgentSpy,
    callTool: callToolSpy,
    evoSend: async (_tenant, payload) => { evoCalls.push(payload); return { ok: true }; },
  });

  await processBatch({}, baseBatch(), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(callToolSpy.mock.callCount(), 0);
  assert.equal(sendTelegramSpy.mock.callCount(), 1);
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /mudanca\/novo orcamento/);
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /Anterior: dragao na perna/);
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /Nova ideia: caveira na perna/);
  assert.match(aiInsert.message.content, /somente essa ou a anterior tambem/);
  assert.equal(evoCalls.length, 1);
  assert.match(evoCalls[0].text, /somente essa ou a anterior tambem/);
  assert.equal(conversaPatch.dados_coletados.descricao_curta, 'dragao');
  assert.equal(conversaPatch.dados_coletados.budget_change_pending.status, 'awaiting_replace_or_add');
  assert.equal(conversaPatch.dados_coletados.budget_change_pending.proposed_item.descricao_curta, 'caveira');
  assert.deepEqual(processedPatch, { status: 'processed' });
});

test('2c. aguardando_tatuador com budget_change_pending e "as duas" reabre coleta do segundo item', async () => {
  let conversaPatch = null;
  let aiInsert = null;
  let processedPatch = null;
  const evoCalls = [];
  const sendTelegramSpy = mock.fn(async () => ({ ok: true }));
  const runAgentSpy = mock.fn();
  const callToolSpy = mock.fn();
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'aguardando_tatuador',
    orcid: 'orc_old',
    dados_coletados: {
      descricao_curta: 'dragao',
      local_corpo: 'braco',
      altura_cm: 170,
      estilo: 'realismo',
      budget_change_pending: {
        status: 'awaiting_replace_or_add',
        source: 'budget_items_manager',
        previous_item_snapshot: { descricao_curta: 'dragao', local_corpo: 'braco', altura_cm: 170, estilo: 'realismo' },
        proposed_item: { descricao_curta: 'caveira', local_corpo: 'perna' },
        client_text: 'mudei de ideia, queria uma caveira na perna',
      },
    },
    dados_cadastro: { nome: 'Leandro' },
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'as duas' }]),
      onPatch: (path, body) => {
        if (path.startsWith('/rest/v1/conversas?id=')) conversaPatch = body;
        if (path.startsWith('/rest/v1/conversa_mensagens?id=in.')) processedPatch = body;
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    sendTelegram: sendTelegramSpy,
    runAgent: runAgentSpy,
    callTool: callToolSpy,
    evoSend: async (_tenant, payload) => { evoCalls.push(payload); return { ok: true }; },
  });

  await processBatch({}, baseBatch(), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(callToolSpy.mock.callCount(), 0);
  assert.equal(sendTelegramSpy.mock.callCount(), 1);
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /adicionar nova tattoo/);
  assert.equal(conversaPatch.estado_agente, 'coletando_tattoo');
  assert.equal(conversaPatch.dados_coletados.budget_items.length, 2);
  assert.equal(conversaPatch.dados_coletados.budget_items[0].status, 'sent_to_artist');
  assert.equal(conversaPatch.dados_coletados.budget_items[1].descricao_curta, 'caveira');
  assert.equal(conversaPatch.dados_coletados.active_budget_item_id, 'item_2');
  assert.equal(conversaPatch.dados_coletados.descricao_curta, 'caveira');
  assert.match(aiInsert.message.content, /considerar as duas/);
  assert.match(evoCalls[0].text, /qual estilo/);
  assert.deepEqual(processedPatch, { status: 'processed' });
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

test('4b. cadastro erro por menoridade aciona humano sem criar orçamento', async () => {
  const callToolSpy = mock.fn(async () => ({ ok: true }));
  const sendTelegramSpy = mock.fn(async () => ({ ok: true }));
  let conversaPatch = null;
  const conversa = { id: CONVERSA_ID, estado_agente: 'cadastro', dados_coletados: {}, dados_cadastro: { nome: 'J' } };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'nasci em 12/03/2010' }]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`)) conversaPatch = body;
      },
    }),
    runAgent: async () => ({
      ok: true,
      resposta_cliente: 'Como a pessoa que vai tatuar tem menos de 18 anos, vou acionar o tatuador para orientar com segurança.',
      estado_novo: 'aguardando_tatuador',
      dados_persistidos: { data_nascimento: '2010-03-12' },
      proxima_acao: 'erro',
      campos_faltando: ['menor_idade_trigger'],
      agent_usado: 'cadastro',
    }),
    callTool: callToolSpy,
    sendTelegram: sendTelegramSpy,
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(callToolSpy.mock.callCount(), 0);
  assert.equal(sendTelegramSpy.mock.callCount(), 1);
  assert.equal(sendTelegramSpy.mock.calls[0].arguments[0], '99999');
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /\[escalation:minor_age\]/);
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /menoridade|responsavel legal/i);
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /5511999998888/);
  assert.equal(conversaPatch.estado_agente, 'aguardando_tatuador');
  assert.equal(conversaPatch.dados_cadastro.data_nascimento, '2010-03-12');
});

test('4c. tattoo cobertura aciona humano sem orçamento e sai para aguardando_tatuador', async () => {
  const callToolSpy = mock.fn(async () => ({ ok: true }));
  const sendTelegramSpy = mock.fn(async () => ({ ok: true }));
  let conversaPatch = null;
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'quero cobrir uma tattoo antiga no braço' }]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`)) conversaPatch = body;
      },
    }),
    runAgent: async () => {
      throw new Error('router deveria interceptar cobertura textual');
    },
    callTool: callToolSpy,
    sendTelegram: sendTelegramSpy,
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(callToolSpy.mock.callCount(), 0);
  assert.equal(sendTelegramSpy.mock.callCount(), 1);
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /\[escalation:cover_up\]/);
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /cobertura|cover-up/i);
  assert.equal(conversaPatch.estado_agente, 'aguardando_tatuador');
});

test('4d. tattoo pedido humano aciona tatuador sem orçamento', async () => {
  const callToolSpy = mock.fn(async () => ({ ok: true }));
  const sendTelegramSpy = mock.fn(async () => ({ ok: true }));
  let conversaPatch = null;
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: { descricao_curta: 'rosa' }, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'quero falar com o tatuador' }]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`)) conversaPatch = body;
      },
    }),
    runAgent: async () => {
      throw new Error('router deveria interceptar pedido humano');
    },
    callTool: callToolSpy,
    sendTelegram: sendTelegramSpy,
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(callToolSpy.mock.callCount(), 0);
  assert.equal(sendTelegramSpy.mock.callCount(), 1);
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /\[escalation:human_requested\]/);
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /cliente pediu humano/i);
  assert.equal(conversaPatch.estado_agente, 'aguardando_tatuador');
});

test('4e. tattoo cliente irritado aciona humano com marcador rastreavel', async () => {
  const callToolSpy = mock.fn(async () => ({ ok: true }));
  const sendTelegramSpy = mock.fn(async () => ({ ok: true }));
  const logAgentTurnSpy = mock.fn();
  let conversaPatch = null;
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: { descricao_curta: 'rosa' }, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'vocês demoram demais, ninguém responde' }]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`)) conversaPatch = body;
      },
    }),
    runAgent: async () => {
      throw new Error('router deveria interceptar cliente irritado');
    },
    callTool: callToolSpy,
    sendTelegram: sendTelegramSpy,
    logAgentTurn: logAgentTurnSpy,
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(callToolSpy.mock.callCount(), 0);
  assert.equal(sendTelegramSpy.mock.callCount(), 1);
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /\[escalation:client_upset\]/);
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /cliente irritado/i);
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /Pacote: handoff_package_v1/);
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /Trace: hp_1111111111/);
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /Tattoo: descricao_curta=rosa/);
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /Campos\/flags: client_upset_trigger/);
  assert.equal(conversaPatch.estado_agente, 'aguardando_tatuador');
  const escalationLog = logAgentTurnSpy.mock.calls
    .map(call => call.arguments[0])
    .find(payload => payload.agent_name === 'escalation_manager');
  assert.ok(escalationLog, 'deve logar decisao explicita do EscalationManager');
  assert.equal(escalationLog.context_metadata.escalation_reason_code, 'client_upset');
  assert.equal(escalationLog.context_metadata.escalation_severity, 'high');
  assert.equal(escalationLog.context_metadata.escalation_requires_orcid, false);
  assert.equal(escalationLog.context_metadata.handoff_package_version, 'handoff_package_v1');
  assert.equal(escalationLog.context_metadata.handoff_package_trace_id, 'hp_1111111111');
  assert.equal(escalationLog.context_metadata.handoff_package_has_summary, true);
  assert.equal(escalationLog.context_metadata.handoff_package_tattoo_fields_count, 1);
  assert.equal(escalationLog.context_metadata.handoff_package_cadastro_fields_count, 0);
  assert.equal(escalationLog.context_metadata.handoff_package_missing_fields_count, 1);
  const workflowLog = logAgentTurnSpy.mock.calls
    .map(call => call.arguments[0])
    .find(payload => payload.agent_name === 'workflow_manager');
  assert.ok(workflowLog, 'Workflow Manager deve oficializar transicao de escalation');
  assert.equal(workflowLog.context_metadata.workflow_reason, 'escalation_required');
  assert.equal(workflowLog.context_metadata.workflow_from_state, 'tattoo');
  assert.equal(workflowLog.context_metadata.workflow_to_state, 'aguardando_tatuador');
  assert.equal(workflowLog.context_metadata.workflow_transition_allowed, true);
  assert.equal(workflowLog.context_metadata.workflow_escalation_reason_code, 'client_upset');
  assert.equal(workflowLog.context_metadata.workflow_escalation_requires_orcid, false);
});

test('4f. tattoo gatilho de handoff do tenant aciona humano com observabilidade completa', async () => {
  const callToolSpy = mock.fn(async () => ({ ok: true }));
  const sendTelegramSpy = mock.fn(async () => ({ ok: true }));
  const logAgentTurnSpy = mock.fn();
  let conversaPatch = null;
  let aiInsert = null;
  const tenant = {
    ...TENANT,
    gatilhos_handoff: ['rosto', 'mao', 'pescoco'],
  };
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      tenant,
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'quero tatuar no rosto quanto fica?' }]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`)) conversaPatch = body;
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: async () => {
      throw new Error('router deveria interceptar gatilho de tenant');
    },
    callTool: callToolSpy,
    sendTelegram: sendTelegramSpy,
    logAgentTurn: logAgentTurnSpy,
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(callToolSpy.mock.callCount(), 0);
  assert.equal(sendTelegramSpy.mock.callCount(), 1);
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /\[escalation:tenant_handoff_trigger\]/);
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /gatilho de handoff do estúdio/i);
  assert.equal(conversaPatch.estado_agente, 'aguardando_tatuador');
  assert.equal(aiInsert.message.content, 'Pra essa região ou caso, o tatuador precisa avaliar direto com segurança. Vou acionar uma pessoa do estúdio para assumir por aqui.');

  const logs = logAgentTurnSpy.mock.calls.map(call => call.arguments[0]);
  const routerLog = logs.find(payload => payload.agent_name === 'conversation_router');
  assert.ok(routerLog, 'ConversationRouter deve registrar gatilho de tenant');
  assert.equal(routerLog.context_metadata.router_intent, 'tenant_handoff_trigger');
  assert.equal(routerLog.context_metadata.router_reason, 'tenant_configured_handoff_trigger_detected');
  assert.equal(routerLog.context_metadata.router_can_mutate_state, true);
  assert.equal(routerLog.context_metadata.router_has_matched_tenant_trigger, true);
  assert.equal(routerLog.context_metadata.router_matched_tenant_trigger, 'rosto');
  assert.equal(routerLog.context_metadata.tenant_context_layer, 'tenant_context_manager');
  assert.equal(routerLog.context_metadata.tenant_context_handoff_triggers_source, 'custom');
  assert.equal(routerLog.context_metadata.tenant_context_has_handoff_triggers, true);
  assert.equal(routerLog.context_metadata.tenant_context_gatilhos_handoff_count, 3);

  const workflowLog = logs.find(payload => payload.agent_name === 'workflow_manager');
  assert.ok(workflowLog, 'Workflow Manager deve oficializar transicao de gatilho tenant');
  assert.equal(workflowLog.context_metadata.workflow_reason, 'escalation_required');
  assert.equal(workflowLog.context_metadata.workflow_from_state, 'tattoo');
  assert.equal(workflowLog.context_metadata.workflow_to_state, 'aguardando_tatuador');
  assert.equal(workflowLog.context_metadata.workflow_transition_allowed, true);
  assert.equal(workflowLog.context_metadata.workflow_escalation_reason_code, 'tenant_handoff_trigger');
  assert.equal(workflowLog.context_metadata.workflow_escalation_requires_orcid, false);

  const escalationLog = logs.find(payload => payload.agent_name === 'escalation_manager');
  assert.ok(escalationLog, 'Escalation Manager deve registrar gatilho tenant');
  assert.equal(escalationLog.context_metadata.escalation_reason_code, 'tenant_handoff_trigger');
  assert.equal(escalationLog.context_metadata.escalation_severity, 'high');
  assert.equal(escalationLog.context_metadata.escalation_source, 'tenant_rules');
  assert.equal(escalationLog.context_metadata.escalation_requires_orcid, false);
  assert.equal(escalationLog.context_metadata.escalation_matched_tenant_trigger, 'rosto');
  assert.equal(escalationLog.context_metadata.handoff_package_version, 'handoff_package_v1');
  assert.equal(escalationLog.context_metadata.handoff_package_trace_id, 'hp_1111111111');
  assert.equal(escalationLog.context_metadata.handoff_package_has_summary, true);
  assert.equal(escalationLog.context_metadata.handoff_package_tattoo_fields_count, 0);
  assert.equal(escalationLog.context_metadata.handoff_package_cadastro_fields_count, 0);
  assert.equal(escalationLog.context_metadata.handoff_package_missing_fields_count, 1);
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

test('5b. portfolio intent do router executa ferramenta e envia midias', async () => {
  const evoSpy = mock.fn(async () => ({ ok: true }));
  const toolSpy = mock.fn(async () => ({ ok: true, urls: ['https://x/fineline-1.jpg', 'https://x/fineline-2.jpg'] }));
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'tem exemplos de fineline?' }]),
      tenant: { ...TENANT, portfolio_urls: ['https://x/fineline-1.jpg', 'https://x/fineline-2.jpg'] },
    }),
    runAgent: async () => { throw new Error('runAgent nao deve ser chamado para portfolio deterministico'); },
    callTool: toolSpy,
    evoSend: evoSpy,
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(toolSpy.mock.callCount(), 1);
  assert.equal(toolSpy.mock.calls[0].arguments[0], 'enviar-portfolio');
  assert.deepEqual(toolSpy.mock.calls[0].arguments[1], {
    tenant_id: TENANT.id,
    estilo: 'fineline',
    max: 5,
  });
  assert.equal(evoSpy.mock.callCount(), 3);
  assert.equal(evoSpy.mock.calls[0].arguments[1].type, 'text');
  assert.equal(evoSpy.mock.calls[1].arguments[1].type, 'media');
  assert.equal(evoSpy.mock.calls[1].arguments[1].url, 'https://x/fineline-1.jpg');
});

test('5c. portfolio indisponivel do tenant responde sem LLM e sem ferramenta', async () => {
  const evoSpy = mock.fn(async () => ({ ok: true }));
  const toolSpy = mock.fn(async () => ({ ok: true, urls: ['https://x/nao-deve.jpg'] }));
  const runAgentSpy = mock.fn(async () => { throw new Error('runAgent nao deve ser chamado para portfolio indisponivel'); });
  let aiInsert = null;
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'tem exemplos de fineline?' }]),
      tenant: { ...TENANT, portfolio_urls: [] },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
    callTool: toolSpy,
    evoSend: evoSpy,
  });

  await processBatch({}, baseBatch(), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(toolSpy.mock.callCount(), 0);
  assert.equal(evoSpy.mock.callCount(), 1);
  assert.match(evoSpy.mock.calls[0].arguments[1].text, /portfolio cadastrado/i);
  assert.equal(aiInsert.message.type, 'ai');
  assert.match(aiInsert.message.content, /portfolio cadastrado/i);
});

test('5d. estilo fora do catalogo do tenant responde sem LLM e preserva estado', async () => {
  const evoSpy = mock.fn(async () => ({ ok: true }));
  const runAgentSpy = mock.fn(async () => { throw new Error('runAgent nao deve ser chamado para estilo fora do catalogo'); });
  const logAgentTurnSpy = mock.fn();
  let conversaPatch = null;
  let aiInsert = null;
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const tenant = {
    ...TENANT,
    config_agente: { estilos_aceitos: ['fineline', 'blackwork'], estilos_recusados: [] },
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      tenant,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'voces fazem old school?' }]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.estado_agente) {
          conversaPatch = body;
        }
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
    evoSend: evoSpy,
    logAgentTurn: logAgentTurnSpy,
  });

  await processBatch({}, baseBatch(), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(evoSpy.mock.callCount(), 1);
  assert.equal(conversaPatch.estado_agente, 'coletando_tattoo');
  assert.deepEqual(conversaPatch.dados_coletados, {});
  assert.match(aiInsert.message.content, /nao esta no foco do estudio/i);
  const logs = logAgentTurnSpy.mock.calls.map(call => call.arguments[0]);
  const routerLog = logs.find(payload => payload.agent_name === 'conversation_router');
  assert.ok(routerLog, 'ConversationRouter deve registrar estilo fora do catalogo');
  assert.equal(routerLog.context_metadata.router_intent, 'tenant_unsupported_style');
  assert.equal(routerLog.context_metadata.router_reason, 'tenant_style_not_accepted');
  assert.equal(routerLog.context_metadata.router_can_mutate_state, false);
  assert.equal(routerLog.context_metadata.tenant_context_has_style_catalog, true);
  assert.equal(routerLog.context_metadata.tenant_context_has_accepted_styles, true);
  const workflowLog = logs.find(payload => payload.agent_name === 'workflow_manager');
  assert.ok(workflowLog, 'Workflow Manager deve registrar preservacao de estado');
  assert.equal(workflowLog.context_metadata.workflow_reason, 'state_preserved_by_router_policy');
});

test('5e. tenant que nao aceita cobertura recusa sem LLM e sem handoff', async () => {
  const evoSpy = mock.fn(async () => ({ ok: true }));
  const sendTelegramSpy = mock.fn(async () => ({ ok: true }));
  const runAgentSpy = mock.fn(async () => { throw new Error('runAgent nao deve ser chamado para cobertura recusada por tenant'); });
  const logAgentTurnSpy = mock.fn();
  let conversaPatch = null;
  let aiInsert = null;
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const tenant = {
    ...TENANT,
    config_agente: { aceita_cobertura: false },
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      tenant,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'quero cobrir uma tattoo antiga no braço' }]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.estado_agente) {
          conversaPatch = body;
        }
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: runAgentSpy,
    evoSend: evoSpy,
    sendTelegram: sendTelegramSpy,
    logAgentTurn: logAgentTurnSpy,
  });

  await processBatch({}, baseBatch(), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(sendTelegramSpy.mock.callCount(), 0);
  assert.equal(evoSpy.mock.callCount(), 1);
  assert.equal(conversaPatch.estado_agente, 'coletando_tattoo');
  assert.deepEqual(conversaPatch.dados_coletados, {});
  assert.match(aiInsert.message.content, /nao faz cobertura/i);
  assert.doesNotMatch(aiInsert.message.content, /acionar|tatuador precisa avaliar|or[cç]amento|R\$|sinal/i);
  const logs = logAgentTurnSpy.mock.calls.map(call => call.arguments[0]);
  const routerLog = logs.find(payload => payload.agent_name === 'conversation_router');
  assert.ok(routerLog, 'ConversationRouter deve registrar cobertura recusada por tenant');
  assert.equal(routerLog.context_metadata.router_intent, 'tenant_cover_up_not_accepted');
  assert.equal(routerLog.context_metadata.router_reason, 'tenant_cover_up_not_accepted');
  assert.equal(routerLog.context_metadata.router_can_mutate_state, false);
  assert.equal(routerLog.context_metadata.tenant_context_aceita_cobertura, false);
  const workflowLog = logs.find(payload => payload.agent_name === 'workflow_manager');
  assert.ok(workflowLog, 'Workflow Manager deve registrar preservacao de estado');
  assert.equal(workflowLog.context_metadata.workflow_reason, 'state_preserved_by_router_policy');
  const escalationLog = logs.find(payload => payload.agent_name === 'escalation_manager');
  assert.equal(escalationLog, undefined);
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
  const histQueries = [];
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
        histQueries.push(path);
        return new Response('[]', { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => ({ ok: true, resposta_cliente: 'r', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }),
  });
  await processBatch({}, baseBatch(), deps);
  const histQuery = histQueries.find(path => path.includes('status=eq.processed'));
  assert.ok(histQuery, `deve consultar historico processed (queries: ${histQueries.join(' | ')})`);
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

test('ConversationRouter cadastro: lateral com nome/data pendentes grava em dados_cadastro', async () => {
  const runAgentSpy = mock.fn(async () => {
    throw new Error('runAgent nao deveria ser chamado');
  });
  let conversaPatch = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_cadastro',
    dados_coletados: { descricao_curta: 'rosa' },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'Joao Silva\n12/03/1995\ncomo funciona o orçamento?' }]),
      hist: [
        {
          id: 1,
          message: {
            type: 'ai',
            content: 'Pra liberar teu orçamento, me passa nome completo e data de nascimento?',
          },
        },
      ],
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.estado_agente) {
          conversaPatch = body;
        }
      },
    }),
    runAgent: runAgentSpy,
  });

  await processBatch({}, baseBatch(), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(conversaPatch.estado_agente, 'coletando_cadastro');
  assert.deepEqual(conversaPatch.dados_coletados, { descricao_curta: 'rosa' });
  assert.deepEqual(conversaPatch.dados_cadastro, {
    nome: 'Joao Silva',
    data_nascimento: '1995-03-12',
  });
});

test('ConversationRouter tattoo: nome curto pendente e puro nao chama LLM e salva nome_preferido', async () => {
  const runAgentSpy = mock.fn(async () => {
    throw new Error('runAgent nao deveria ser chamado');
  });
  let conversaPatch = null;
  let aiPost = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: { descricao_curta: 'fechamento' },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'Macus' }]),
      hist: [
        {
          id: 1,
          message: {
            type: 'ai',
            content: 'Oii, tudo bem.\n\nComo posso te chamar?',
          },
        },
      ],
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.estado_agente) {
          conversaPatch = body;
        }
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiPost = body;
      },
    }),
    runAgent: runAgentSpy,
  });

  await processBatch({}, baseBatch(), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(conversaPatch.estado_agente, 'coletando_tattoo');
  assert.deepEqual(conversaPatch.dados_coletados, {
    descricao_curta: 'fechamento',
    nome_preferido: 'Macus',
  });
  assert.deepEqual(conversaPatch.dados_cadastro, {});
  assert.equal(aiPost.message.content, 'Boa, Macus. Tu imagina fazer em qual parte do corpo?');
});

test('ConversationRouter cadastro pos-midia preserva foto local e referencias ao preencher nome', async () => {
  const runAgentSpy = mock.fn(async () => {
    throw new Error('runAgent nao deveria ser chamado');
  });
  let conversaPatch = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_cadastro',
    dados_coletados: {
      descricao_curta: 'rosa',
      local_corpo: 'antebraco',
      altura_cm: 170,
      estilo: 'fineline',
      foto_local_msg_id: 606,
      refs_imagens_msg_ids: [603],
      tentativas_foto_local: 1,
    },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'Joao Silva' }]),
      hist: [
        {
          id: 1,
          message: {
            type: 'ai',
            content: 'Recebi a foto do local. Pra liberar teu orçamento, preciso do teu nome completo.',
          },
        },
      ],
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.estado_agente) {
          conversaPatch = body;
        }
      },
    }),
    runAgent: runAgentSpy,
  });

  await processBatch({}, baseBatch(), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(conversaPatch.estado_agente, 'coletando_cadastro');
  assert.deepEqual(conversaPatch.dados_coletados, conversa.dados_coletados);
  assert.deepEqual(conversaPatch.dados_cadastro, {
    nome: 'Joao Silva',
  });
});

test('Workflow: ConversationRouter completa cadastro com recusa de email e dispara orcamento', async () => {
  const runAgentSpy = mock.fn(async () => {
    throw new Error('runAgent nao deveria ser chamado');
  });
  const callToolSpy = mock.fn(async () => ({ ok: true }));
  const logAgentTurnSpy = mock.fn();
  let conversaPatch = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_cadastro',
    dados_coletados: {
      descricao_curta: 'leão',
      local_corpo: 'antebraço',
      altura_cm: 170,
      estilo: 'fineline',
    },
    dados_cadastro: {
      nome: 'Joao Silva',
      data_nascimento: '1995-03-12',
    },
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'pode seguir sem email\nquanto tempo demora?' }]),
      hist: [
        {
          id: 1,
          message: {
            type: 'ai',
            content: 'E o e-mail? Se preferir seguir sem, me avisa',
          },
        },
      ],
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.estado_agente) {
          conversaPatch = body;
        }
      },
    }),
    runAgent: runAgentSpy,
    callTool: callToolSpy,
    logAgentTurn: logAgentTurnSpy,
  });

  await processBatch({}, baseBatch(), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(conversaPatch.estado_agente, 'aguardando_tatuador');
  assert.deepEqual(conversaPatch.dados_cadastro, {
    nome: 'Joao Silva',
    data_nascimento: '1995-03-12',
    email: null,
    email_recusado: true,
  });
  assert.equal(callToolSpy.mock.callCount(), 1);
  assert.equal(callToolSpy.mock.calls[0].arguments[0], 'enviar-orcamento-tatuador');
  assert.equal(callToolSpy.mock.calls[0].arguments[1].tenant_id, TENANT.id);
  assert.equal(callToolSpy.mock.calls[0].arguments[1].telefone, TELEFONE);
  const workflowLog = logAgentTurnSpy.mock.calls
    .map(call => call.arguments[0])
    .find(entry => entry.agent_name === 'workflow_manager');
  assert.ok(workflowLog, 'Workflow Manager deve registrar a decisao de transicao');
  assert.equal(workflowLog.context_metadata.workflow_layer, 'workflow_manager');
  assert.equal(workflowLog.context_metadata.workflow_from_state, 'cadastro');
  assert.equal(workflowLog.context_metadata.workflow_to_state, 'aguardando_tatuador');
  assert.equal(workflowLog.context_metadata.workflow_transition_allowed, true);
  assert.equal(workflowLog.context_metadata.workflow_reason, 'cadastro_and_tattoo_complete');
  assert.equal(workflowLog.context_metadata.workflow_handoff_package_trace_id, 'hp_1111111111');
});

test('Workflow: cadastro pos-midia com recusa de email preserva pacote de midia no handoff', async () => {
  const runAgentSpy = mock.fn(async () => {
    throw new Error('runAgent nao deveria ser chamado');
  });
  const callToolSpy = mock.fn(async () => ({ ok: true }));
  let conversaPatch = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_cadastro',
    dados_coletados: {
      descricao_curta: 'rosa',
      local_corpo: 'antebraço',
      altura_cm: 170,
      estilo: 'fineline',
      foto_local_msg_id: 12632,
      refs_imagens_msg_ids: [11951],
      tentativas_foto_local: 1,
    },
    dados_cadastro: {
      nome: 'Joao Silva',
      data_nascimento: '1995-03-12',
    },
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'pode seguir sem email\nquanto tempo demora?' }]),
      hist: [
        {
          id: 1,
          message: {
            type: 'ai',
            content: 'E o e-mail? Se preferir seguir sem, me avisa',
          },
        },
      ],
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.estado_agente) {
          conversaPatch = body;
        }
      },
    }),
    runAgent: runAgentSpy,
    callTool: callToolSpy,
  });

  await processBatch({}, baseBatch(), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(conversaPatch.estado_agente, 'aguardando_tatuador');
  assert.deepEqual(conversaPatch.dados_coletados, conversa.dados_coletados);
  assert.deepEqual(conversaPatch.dados_cadastro, {
    nome: 'Joao Silva',
    data_nascimento: '1995-03-12',
    email: null,
    email_recusado: true,
  });
  assert.equal(callToolSpy.mock.callCount(), 1);
  assert.equal(callToolSpy.mock.calls[0].arguments[0], 'enviar-orcamento-tatuador');
});

test('Workflow: cadastro pos-midia com email valido preserva pacote de midia no handoff', async () => {
  const runAgentSpy = mock.fn(async () => {
    throw new Error('runAgent nao deveria ser chamado');
  });
  const callToolSpy = mock.fn(async () => ({ ok: true }));
  let conversaPatch = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_cadastro',
    dados_coletados: {
      descricao_curta: 'rosa',
      local_corpo: 'antebraço',
      altura_cm: 170,
      estilo: 'fineline',
      foto_local_msg_id: 12632,
      refs_imagens_msg_ids: [11951],
      tentativas_foto_local: 1,
    },
    dados_cadastro: {
      nome: 'Joao Silva',
      data_nascimento: '1995-03-12',
    },
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'joao@example.com' }]),
      hist: [
        {
          id: 1,
          message: {
            type: 'ai',
            content: 'E o e-mail? Se preferir seguir sem, me avisa',
          },
        },
      ],
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.estado_agente) {
          conversaPatch = body;
        }
      },
    }),
    runAgent: runAgentSpy,
    callTool: callToolSpy,
  });

  await processBatch({}, baseBatch(), deps);

  assert.equal(runAgentSpy.mock.callCount(), 0);
  assert.equal(conversaPatch.estado_agente, 'aguardando_tatuador');
  assert.deepEqual(conversaPatch.dados_coletados, conversa.dados_coletados);
  assert.deepEqual(conversaPatch.dados_cadastro, {
    nome: 'Joao Silva',
    data_nascimento: '1995-03-12',
    email: 'joao@example.com',
  });
  assert.equal(callToolSpy.mock.callCount(), 1);
  assert.equal(callToolSpy.mock.calls[0].arguments[0], 'enviar-orcamento-tatuador');
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

test('Etapa 4.5 model-driven: 2 corpos → 1ª vira foto_local, 2ª demovida pra ref (first-local-wins via analise_imagens)', async () => {
  // Test A: garante que analise_imagens=[corpo, corpo] → 1ª local vence, 2ª corpo NÃO sobrescreve
  // (invariante "no máximo 1 foto_local por lote" sob roteamento model-driven, sem heurística).
  let conversaPatches = [];
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 401, content: '', media_base64: 'c1', media_mimetype: 'image/jpeg' },
        { id: 402, content: '', media_base64: 'c2', media_mimetype: 'image/jpeg' },
      ]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.dados_coletados)
          conversaPatches.push(body.dados_coletados);
      },
    }),
    runAgent: async () => ({
      ok: true, resposta_cliente: 'recebi', estado_novo: 'tattoo',
      dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo',
      analise_imagens: [
        { tipo: 'corpo', descricao: 'antebraco', corpo_tem_tattoo: false, corpo_tem_marcacao: false },
        { tipo: 'corpo', descricao: 'outra parte', corpo_tem_tattoo: false, corpo_tem_marcacao: false },
      ],
    }),
    // classificarFoto NÃO deve ser chamado (analise_imagens presente para ambas as fotos)
    classificarFoto: () => { throw new Error('classificarFoto nao devia ser chamado: analise_imagens presente'); },
  });
  await processBatch({}, baseBatch({ msgRowIds: [401, 402] }), deps);
  const fotoPatch = conversaPatches.find(p => p.foto_local_msg_id || p.refs_imagens_msg_ids);
  assert.ok(fotoPatch, 'deve existir PATCH com roteamento de fotos');
  assert.equal(fotoPatch.foto_local_msg_id, 401, '1ª corpo (id=401) vence como foto_local');
  assert.ok(Array.isArray(fotoPatch.refs_imagens_msg_ids) && fotoPatch.refs_imagens_msg_ids.includes(402),
    '2ª corpo (id=402) demovida para refs_imagens_msg_ids');
  assert.ok(!fotoPatch.refs_imagens_msg_ids?.includes(401),
    'id=401 (foto_local) nao aparece em refs_imagens_msg_ids');
});

test('Etapa 4.5 model-driven: corpo + referencia → local + ref (roteamento misto via analise_imagens)', async () => {
  // Test B: analise_imagens=[corpo, referencia] → 401 vira foto_local, 402 vira ref.
  let conversaPatches = [];
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 401, content: '', media_base64: 'c1', media_mimetype: 'image/jpeg' },
        { id: 402, content: '', media_base64: 'c2', media_mimetype: 'image/jpeg' },
      ]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.dados_coletados)
          conversaPatches.push(body.dados_coletados);
      },
    }),
    runAgent: async () => ({
      ok: true, resposta_cliente: 'recebi', estado_novo: 'tattoo',
      dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo',
      analise_imagens: [
        { tipo: 'corpo', descricao: 'antebraco pele limpa', corpo_tem_tattoo: false, corpo_tem_marcacao: false },
        { tipo: 'referencia', descricao: 'rosa fineline', corpo_tem_tattoo: false, corpo_tem_marcacao: false },
      ],
    }),
    classificarFoto: () => { throw new Error('classificarFoto nao devia ser chamado: analise_imagens presente'); },
  });
  await processBatch({}, baseBatch({ msgRowIds: [401, 402] }), deps);
  const fotoPatch = conversaPatches.find(p => p.foto_local_msg_id || p.refs_imagens_msg_ids);
  assert.ok(fotoPatch, 'deve existir PATCH com roteamento de fotos');
  assert.equal(fotoPatch.foto_local_msg_id, 401, 'corpo (id=401) vira foto_local');
  assert.ok(Array.isArray(fotoPatch.refs_imagens_msg_ids) && fotoPatch.refs_imagens_msg_ids.includes(402),
    'referencia (id=402) vai para refs_imagens_msg_ids');
  assert.ok(!fotoPatch.refs_imagens_msg_ids?.includes(401),
    'id=401 (foto_local) nao aparece em refs_imagens_msg_ids');
});

test('Etapa 4.5: foto local aguardada com core completo avanca sem chamar LLM', async () => {
  let conversaPatches = [];
  let runAgentCalled = false;
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: {
      descricao_curta: 'rosa',
      local_corpo: 'antebraco',
      altura_cm: 170,
      estilo: 'fineline',
      tentativas_foto_local: 1,
    },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 601, content: 'segue foto do local', media_base64: 'img', media_mimetype: 'image/png' },
      ]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.dados_coletados) {
          conversaPatches.push(body.dados_coletados);
        }
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: async () => { runAgentCalled = true; throw new Error('nao deveria chamar LLM'); },
    classificarFoto: () => 'referencia',
  });

  await processBatch({}, baseBatch({ msgRowIds: [601] }), deps);

  assert.equal(runAgentCalled, false, 'foto local aguardada com core completo nao deve chamar LLM');
  const fotoPatch = conversaPatches.find(p => p.foto_local_msg_id === 601);
  assert.ok(fotoPatch, 'foto local aguardada deve ficar persistida no patch principal');
  assert.equal(fotoPatch.refs_imagens_msg_ids, undefined, 'a mesma foto nao deve ser duplicada como referencia');
  assert.match(aiInsert.message.content, /nome completo/i);
});

test('Etapa 6.1: foto local apos referencia confirmada preserva refs sem chamar LLM', async () => {
  let conversaPatches = [];
  let runAgentCalled = false;
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: {
      descricao_curta: 'rosa',
      local_corpo: 'antebraco',
      altura_cm: 170,
      estilo: 'fineline',
      refs_imagens_msg_ids: [603],
      tentativas_foto_local: 1,
    },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 606, content: 'segue foto do local', media_base64: 'img-local', media_mimetype: 'image/png' },
      ]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.dados_coletados) {
          conversaPatches.push(body.dados_coletados);
        }
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: async () => { runAgentCalled = true; throw new Error('nao deveria chamar LLM'); },
    classificarFoto: () => 'referencia',
  });

  await processBatch({}, baseBatch({ msgRowIds: [606] }), deps);

  assert.equal(runAgentCalled, false, 'foto local aguardada apos ref confirmada nao deve chamar LLM');
  const fotoPatch = conversaPatches.find(p => p.foto_local_msg_id === 606);
  assert.ok(fotoPatch, 'nova imagem deve virar foto_local_msg_id');
  assert.deepEqual(fotoPatch.refs_imagens_msg_ids, [603], 'referencia confirmada deve permanecer rastreavel');
  assert.equal(fotoPatch.descricao_curta, 'rosa');
  assert.equal(fotoPatch.estilo, 'fineline');
  assert.match(aiInsert.message.content, /nome completo/i);
  assert.doesNotMatch(aiInsert.message.content, /refer[eê]ncia do desenho/i);
});

test('Etapa 4.5: foto posterior com foto local existente vira referencia sem chamar LLM', async () => {
  let conversaPatches = [];
  let runAgentCalled = false;
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_cadastro',
    dados_coletados: {
      descricao_curta: 'rosa',
      local_corpo: 'antebraco',
      altura_cm: 170,
      estilo: 'fineline',
      foto_local_msg_id: 600,
      tentativas_foto_local: 1,
    },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 602, content: 'essa é referência do desenho', media_base64: 'img-ref', media_mimetype: 'image/png' },
      ]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.dados_coletados) {
          conversaPatches.push(body.dados_coletados);
        }
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: async () => { runAgentCalled = true; throw new Error('nao deveria chamar LLM'); },
    classificarFoto: classificarFotoReal,
  });

  await processBatch({}, baseBatch({ msgRowIds: [602] }), deps);

  assert.equal(runAgentCalled, false, 'foto posterior com foto local existente nao deve chamar LLM');
  const refPatch = conversaPatches.find(p => Array.isArray(p.refs_imagens_msg_ids));
  assert.ok(refPatch, 'foto posterior deve gerar patch de referencia');
  assert.equal(refPatch.foto_local_msg_id, 600, 'foto local original deve permanecer');
  assert.deepEqual(refPatch.refs_imagens_msg_ids, [602]);
  assert.match(aiInsert.message.content, /refer[eê]ncia/i);
  assert.match(aiInsert.message.content, /nome completo/i);
});

test('Etapa 4.5: foto ambigua sem legenda pergunta classificacao sem chamar LLM', async () => {
  let conversaPatches = [];
  let runAgentCalled = false;
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: {
      descricao_curta: 'rosa',
      local_corpo: 'antebraco',
      altura_cm: 170,
    },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 603, content: '', media_base64: 'img-ambigua', media_mimetype: 'image/png' },
      ]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.dados_coletados) {
          conversaPatches.push(body.dados_coletados);
        }
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: async () => { runAgentCalled = true; throw new Error('nao deveria chamar LLM'); },
    classificarFoto: classificarFotoReal,
  });

  await processBatch({}, baseBatch({ msgRowIds: [603] }), deps);

  assert.equal(runAgentCalled, false, 'foto ambigua sem legenda nao deve chamar LLM');
  const refPatch = conversaPatches.find(p => Array.isArray(p.refs_imagens_msg_ids));
  assert.ok(refPatch, 'foto ambigua fica rastreavel para confirmacao posterior');
  assert.equal(refPatch.foto_local_msg_id, undefined);
  assert.deepEqual(refPatch.refs_imagens_msg_ids, [603]);
  assert.equal(refPatch.descricao_curta, 'rosa');
  assert.equal(refPatch.local_corpo, 'antebraco');
  assert.equal(refPatch.altura_cm, 170);
  assert.match(aiInsert.message.content, /refer[eê]ncia/i);
  assert.match(aiInsert.message.content, /local do corpo/i);
});

test('Etapa 5.1: confirmacao de foto ambigua como local promove ref sem chamar LLM', async () => {
  let conversaPatches = [];
  let runAgentCalled = false;
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: {
      descricao_curta: 'rosa',
      local_corpo: 'antebraco',
      altura_cm: 170,
      estilo: 'fineline',
      refs_imagens_msg_ids: [603],
    },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: 604, content: 'é local do corpo' }]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.dados_coletados) {
          conversaPatches.push(body.dados_coletados);
        }
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: async () => { runAgentCalled = true; throw new Error('nao deveria chamar LLM'); },
    classificarFoto: classificarFotoReal,
  });

  await processBatch({}, baseBatch({ msgRowIds: [604] }), deps);

  assert.equal(runAgentCalled, false, 'confirmacao simples como local nao deve chamar LLM');
  const patch = conversaPatches.find(p => p.foto_local_msg_id === 603);
  assert.ok(patch, 'ultima ref ambigua deve virar foto_local_msg_id');
  assert.deepEqual(patch.refs_imagens_msg_ids, [603], 'historico da ref permanece rastreavel');
  assert.equal(patch.descricao_curta, 'rosa');
  assert.equal(patch.estilo, 'fineline');
  assert.match(aiInsert.message.content, /nome completo/i);
  assert.match(aiInsert.message.content, /data de nascimento/i);
});

test('Etapa 5.1: confirmacao de foto ambigua como referencia pede foto local sem chamar LLM', async () => {
  let conversaPatches = [];
  let runAgentCalled = false;
  let aiInsert = null;
  const conversa = {
    id: CONVERSA_ID,
    estado_agente: 'coletando_tattoo',
    dados_coletados: {
      descricao_curta: 'rosa',
      local_corpo: 'antebraco',
      altura_cm: 170,
      estilo: 'fineline',
      refs_imagens_msg_ids: [603],
    },
    dados_cadastro: {},
  };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: 605, content: 'é referência do desenho' }]),
      onPatch: (path, body) => {
        if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.dados_coletados) {
          conversaPatches.push(body.dados_coletados);
        }
      },
      onPost: (path, body) => {
        if (path === '/rest/v1/conversa_mensagens') aiInsert = body;
      },
    }),
    runAgent: async () => { runAgentCalled = true; throw new Error('nao deveria chamar LLM'); },
    classificarFoto: classificarFotoReal,
  });

  await processBatch({}, baseBatch({ msgRowIds: [605] }), deps);

  assert.equal(runAgentCalled, false, 'confirmacao simples como referencia nao deve chamar LLM');
  const patch = conversaPatches.find(p => Array.isArray(p.refs_imagens_msg_ids));
  assert.ok(patch, 'dados existentes devem ser preservados');
  assert.equal(patch.foto_local_msg_id, undefined);
  assert.deepEqual(patch.refs_imagens_msg_ids, [603]);
  assert.equal(patch.tentativas_foto_local, 1);
  assert.match(aiInsert.message.content, /refer[eê]ncia/i);
  assert.match(aiInsert.message.content, /foto do local|local do corpo/i);
});

test('Etapa 4.5 multi-ref: 2 fotos referencia → RPC set_descricao_visual dispara 2x com payloads pareados', async () => {
  // Fan-out: cada foto 'referencia' com descricao deve gerar 1 chamada RPC com seu proprio
  // p_msg_id + p_descricao. Verifica pareamento correto (501→'arte A', 502→'arte B').
  const rpcCalls = [];
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 501, content: '', media_base64: 'ref1', media_mimetype: 'image/jpeg' },
        { id: 502, content: '', media_base64: 'ref2', media_mimetype: 'image/jpeg' },
      ]),
      onPost: (path, body) => {
        if (path.includes('/rpc/set_descricao_visual')) {
          rpcCalls.push({ path, body });
        }
      },
    }),
    runAgent: async () => ({
      ok: true, resposta_cliente: 'recebi as refs', estado_novo: 'tattoo',
      dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo',
      analise_imagens: [
        { tipo: 'referencia', descricao: 'arte A', corpo_tem_tattoo: false, corpo_tem_marcacao: false },
        { tipo: 'referencia', descricao: 'arte B', corpo_tem_tattoo: false, corpo_tem_marcacao: false },
      ],
    }),
  });
  await processBatch({}, baseBatch({ msgRowIds: [501, 502] }), deps);
  assert.equal(rpcCalls.length, 2, 'exatamente 2 chamadas RPC (1 por foto referencia)');
  const rpcA = rpcCalls.find(c => c.body.p_msg_id === 501);
  const rpcB = rpcCalls.find(c => c.body.p_msg_id === 502);
  assert.ok(rpcA, 'RPC para msg_id=501 deve existir');
  assert.equal(rpcA.body.p_descricao, 'arte A', 'payload de 501 deve ter descricao "arte A"');
  assert.ok(rpcB, 'RPC para msg_id=502 deve existir');
  assert.equal(rpcB.body.p_descricao, 'arte B', 'payload de 502 deve ter descricao "arte B"');
});

test('pipeline: passa imagens (base64+mimetype+msgRowId) ao runAgent, cap 4', async () => {
  let capturedRunAgent;
  const rows = rowsFor([
    { id: 1, content: 'olha essas', media_base64: 'A0', media_mimetype: 'image/jpeg' },
    { id: 2, content: '', media_base64: 'A1', media_mimetype: 'image/jpeg' },
    { id: 3, content: '', media_base64: 'A2', media_mimetype: 'image/png' },
    { id: 4, content: '', media_base64: 'A3', media_mimetype: 'image/jpeg' },
    { id: 5, content: '', media_base64: 'A4', media_mimetype: 'image/jpeg' },
    { id: 6, content: '', media_base64: 'A5', media_mimetype: 'image/jpeg' },
  ]);
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {}, estado_extra: {} };
  const deps = mockDeps({
    runAgent: async (args) => {
      capturedRunAgent = args;
      return { ok: true, resposta_cliente: 'oi', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' };
    },
    supaFetch: batchSupaFetch({ conversa, rows }),
  });
  await processBatch({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, baseBatch({ msgRowIds: [1, 2, 3, 4, 5, 6] }), deps);
  assert.equal(capturedRunAgent.imagens.length, 4, 'cap de 4 imagens');
  assert.deepEqual(capturedRunAgent.imagens[0], { base64: 'A0', mimetype: 'image/jpeg', msgRowId: 1 });
  assert.equal(capturedRunAgent.imagens[3].base64, 'A3', 'a 4a imagem incluida e a do indice 3 (A3); A4/A5 ficam de fora');
});

test('Bug1: pediu_foto_local incrementa dados_coletados.tentativas_foto_local', async () => {
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  let patchBody = null;
  const deps = mockDeps({
    runAgent: async () => ({
      ok: true, resposta_cliente: 'manda a foto do local?', estado_novo: 'tattoo',
      dados_persistidos: { descricao_curta: 'rosa', local_corpo: 'perna', altura_cm: 170, estilo: 'fineline' },
      proxima_acao: 'pergunta', agent_usado: 'tattoo', pediu_foto_local: true,
    }),
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: 201, content: 'rosa fineline na perna, sou 1.70' }]),
      onPatch: (path, body) => { if (body.dados_coletados) patchBody = body; },
    }),
  });
  await processBatch({ DISABLE_CONVERSATION_ROUTER: 'true' }, baseBatch({ msgRowIds: [201] }), deps);
  assert.ok(patchBody, 'deve ter PATCH com dados_coletados');
  assert.equal(patchBody.dados_coletados.tentativas_foto_local, 1);
});

test('Bug1: sem pediu_foto_local NAO escreve contador', async () => {
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  let patchBody = null;
  const deps = mockDeps({
    runAgent: async () => ({
      ok: true, resposta_cliente: 'qual o local?', estado_novo: 'tattoo',
      dados_persistidos: { descricao_curta: 'rosa' },
      proxima_acao: 'pergunta', agent_usado: 'tattoo',
    }),
    supaFetch: batchSupaFetch({
      conversa, rows: rowsFor([{ id: 202, content: 'quero uma rosa' }]),
      onPatch: (path, body) => { if (body.dados_coletados) patchBody = body; },
    }),
  });
  await processBatch({}, baseBatch({ msgRowIds: [202] }), deps);
  assert.ok(patchBody);
  assert.equal(patchBody.dados_coletados.tentativas_foto_local, undefined);
});
