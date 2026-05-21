// tests/agent/route-orchestrator.test.mjs
// Unit tests pros failure branches do executeOrchestration.
// Eval real (Task 13) + smoke (Task 14) cobrem happy path; este arquivo
// fecha o gap dos branches !ok que tools reais nao retornam.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { executeOrchestration, forcePergunta } from '../../functions/api/agent/route.js';

const baseEnv = { INKFLOW_TOOL_SECRET: 'sek', AGENT_INTERNAL_BASE_URL: 'http://localhost:8788' };
const baseTenant = { id: 't1', config_precificacao: { sinal_percentual: 30 } };
const baseConversa = { dados_cadastro: { nome: 'X' }, valor_proposto: 750 };

test('forcePergunta: muda proxima_acao + resposta_cliente preservando o resto', () => {
  const out = { resposta_cliente: 'orig', proxima_acao: 'reservar_horario', slot_inicio: 'a', slot_fim: 'b' };
  const r = forcePergunta(out, 'tente outro');
  assert.equal(r.proxima_acao, 'pergunta');
  assert.equal(r.resposta_cliente, 'tente outro');
  assert.equal(r.slot_inicio, 'a');  // payload preservado pra log
});

test('executeOrchestration reservar_horario: !ok de reservar-horario vira pergunta', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async (url) => {
    if (url.includes('reservar-horario')) {
      return { ok: false, status: 409, json: async () => ({ ok: false, error: 'slot-taken' }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  const sideEffects = [];
  const r = await executeOrchestration(
    { resposta_cliente: 'Bora!', proxima_acao: 'reservar_horario', slot_inicio: '2026-05-12T17:00:00Z', slot_fim: '2026-05-12T20:00:00Z' },
    { env: baseEnv, tenant: baseTenant, conversa: baseConversa, telefone: '5511', sideEffects }
  );

  assert.equal(r.proxima_acao, 'pergunta');
  assert.match(r.resposta_cliente, /escolher outro/);
  assert.equal(sideEffects.length, 1);
  assert.equal(sideEffects[0].tool, 'reservar-horario');
  assert.equal(sideEffects[0].ok, false);
});

test('executeOrchestration reservar_horario: !ok de gerar-link-sinal vira pergunta + 2 side effects', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async (url) => {
    if (url.includes('reservar-horario')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, agendamento_id: 'ag-1' }) };
    }
    if (url.includes('gerar-link-sinal')) {
      return { ok: false, status: 502, json: async () => ({ ok: false, error: 'mp-timeout' }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  const sideEffects = [];
  const r = await executeOrchestration(
    { resposta_cliente: 'Bora!', proxima_acao: 'reservar_horario', slot_inicio: '2026-05-12T17:00:00Z', slot_fim: '2026-05-12T20:00:00Z' },
    { env: baseEnv, tenant: baseTenant, conversa: baseConversa, telefone: '5511', sideEffects }
  );

  assert.equal(r.proxima_acao, 'pergunta');
  assert.match(r.resposta_cliente, /problema gerando o link/);
  assert.equal(sideEffects.length, 2);
  assert.equal(sideEffects[0].ok, true);
  assert.equal(sideEffects[1].ok, false);
});

test('executeOrchestration reservar_horario: happy path concatena link MP no resposta_cliente', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async (url) => {
    if (url.includes('reservar-horario')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, agendamento_id: 'ag-1' }) };
    }
    if (url.includes('gerar-link-sinal')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, link_pagamento: 'https://mpago.la/x', hold_horas: 24 }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  const sideEffects = [];
  const r = await executeOrchestration(
    { resposta_cliente: 'Bora!', proxima_acao: 'reservar_horario', slot_inicio: '2026-05-12T17:00:00Z', slot_fim: '2026-05-12T20:00:00Z' },
    { env: baseEnv, tenant: baseTenant, conversa: baseConversa, telefone: '5511', sideEffects }
  );

  assert.equal(r.proxima_acao, 'reservar_horario');  // mantem
  assert.match(r.resposta_cliente, /Bora!/);  // prefix preservado
  assert.match(r.resposta_cliente, /R\$ 225,00/);  // 30% de 750
  assert.match(r.resposta_cliente, /https:\/\/mpago\.la\/x/);  // URL crua
  assert.match(r.resposta_cliente, /24 horas/);
  assert.equal(sideEffects.length, 2);
});

test('executeOrchestration pediu_desconto: !ok de enviar-objecao-tatuador vira pergunta', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async () => ({
    ok: false, status: 502, json: async () => ({ ok: false, error: 'telegram-down' }),
  }));

  const sideEffects = [];
  const r = await executeOrchestration(
    { resposta_cliente: 'Anotado!', proxima_acao: 'pediu_desconto', valor_pedido_cliente: 600 },
    { env: baseEnv, tenant: baseTenant, conversa: baseConversa, telefone: '5511', sideEffects }
  );

  assert.equal(r.proxima_acao, 'pergunta');
  assert.match(r.resposta_cliente, /Anota ai/);
  assert.equal(sideEffects.length, 1);
  assert.equal(sideEffects[0].tool, 'enviar-objecao-tatuador');
  assert.equal(sideEffects[0].ok, false);
});

test('executeOrchestration cliente_agressivo: chama acionar-handoff com motivo correto', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const fetchMock = mock.fn(async () => ({
    ok: true, status: 200, json: async () => ({ ok: true }),
  }));
  globalThis.fetch = fetchMock;

  const sideEffects = [];
  await executeOrchestration(
    { resposta_cliente: 'Vou pedir ajuda', proxima_acao: 'cliente_agressivo' },
    { env: baseEnv, tenant: baseTenant, conversa: baseConversa, telefone: '5511', sideEffects }
  );

  assert.equal(fetchMock.mock.callCount(), 1);
  const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
  assert.equal(body.motivo, 'cliente_agressivo');
  assert.equal(sideEffects[0].tool, 'acionar-handoff');
  assert.equal(sideEffects[0].motivo, 'cliente_agressivo');
});

test('executeOrchestration reservar_horario: Pix → resposta com copia-e-cola em balão', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async (url, init) => {
    if (url.includes('reservar-horario')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, agendamento_id: 'ag-1' }) };
    }
    if (url.includes('gerar-link-sinal')) {
      const body = JSON.parse(init.body);
      assert.equal(body.metodo, 'pix'); // orquestrador pede Pix
      return { ok: true, status: 200, json: async () => ({
        ok: true, metodo_usado: 'pix', copia_e_cola: 'PIX-COPIA-COLA', hold_horas: 48,
      }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  const sideEffects = [];
  const r = await executeOrchestration(
    { resposta_cliente: 'Bora!', proxima_acao: 'reservar_horario', slot_inicio: '2026-05-23T13:00:00Z', slot_fim: '2026-05-23T16:00:00Z' },
    { env: baseEnv, tenant: baseTenant, conversa: baseConversa, telefone: '5511', sideEffects, clientContext: {} }
  );

  assert.match(r.resposta_cliente, /PIX-COPIA-COLA/);
  const baloes = r.resposta_cliente.split(/\n\s*\n/);
  assert.equal(baloes[baloes.length - 1], 'PIX-COPIA-COLA'); // código no último balão
  assert.equal(sideEffects.find(s => s.tool === 'gerar-link-sinal').metodo, 'pix');
});

test('executeOrchestration noop cases: pergunta/oferecendo_horario/adiou retornam out sem fetch', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const fetchMock = mock.fn();
  globalThis.fetch = fetchMock;

  const sideEffects = [];
  for (const acao of ['pergunta', 'oferecendo_horario', 'adiou']) {
    const r = await executeOrchestration(
      { resposta_cliente: 'x', proxima_acao: acao },
      { env: baseEnv, tenant: baseTenant, conversa: baseConversa, telefone: '5511', sideEffects }
    );
    assert.equal(r.proxima_acao, acao);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(sideEffects.length, 0);
});
