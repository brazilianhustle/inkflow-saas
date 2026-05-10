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
  await assert.rejects(() => processMessage({}, baseMsg(), mockDeps()), /not-implemented/);
});

test('2. terminal aguardando_tatuador — Task 8 implementa', async () => {
  await assert.rejects(() => processMessage({}, baseMsg(), mockDeps()), /not-implemented/);
});

test('3. terminal sem tatuador_telegram_chat_id — Task 8 implementa', async () => {
  await assert.rejects(() => processMessage({}, baseMsg(), mockDeps()), /not-implemented/);
});

test('4. handoff cadastro→orcamento — Task 10 implementa', async () => {
  await assert.rejects(() => processMessage({}, baseMsg(), mockDeps()), /not-implemented/);
});

test('5. portfolio intent — Task 10 implementa', async () => {
  await assert.rejects(() => processMessage({}, baseMsg(), mockDeps()), /not-implemented/);
});

test('6. conversa nova — Task 8 implementa', async () => {
  await assert.rejects(() => processMessage({}, baseMsg(), mockDeps()), /not-implemented/);
});

test('7. runAgent throws — Task 9 implementa', async () => {
  await assert.rejects(() => processMessage({}, baseMsg(), mockDeps()), /not-implemented/);
});

test('8. evoSend text falha — Task 10 implementa', async () => {
  await assert.rejects(() => processMessage({}, baseMsg(), mockDeps()), /not-implemented/);
});

test('9. midia base64 in nao duplica — Task 10 implementa', async () => {
  await assert.rejects(() => processMessage({}, baseMsg(), mockDeps()), /not-implemented/);
});

test('10. historico mapeado — Task 9 implementa', async () => {
  await assert.rejects(() => processMessage({}, baseMsg(), mockDeps()), /not-implemented/);
});

test('11. agent_usado=cadastro merge dados_cadastro — Task 9 implementa', async () => {
  await assert.rejects(() => processMessage({}, baseMsg(), mockDeps()), /not-implemented/);
});
