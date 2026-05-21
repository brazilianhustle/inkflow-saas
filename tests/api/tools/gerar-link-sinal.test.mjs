import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../../functions/api/tools/gerar-link-sinal.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const AG_ID = '00000000-0000-0000-0000-000000000aaa';
const SECRET = 'test-secret';

function buildContext(body, env) {
  return {
    request: new Request('https://example.com/api/tools/gerar-link-sinal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Inkflow-Tool-Secret': SECRET },
      body: JSON.stringify(body),
    }),
    env,
    waitUntil: () => {},
  };
}

function baseEnv(overrides = {}) {
  return {
    INKFLOW_TOOL_SECRET: SECRET,
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    MP_ACCESS_TOKEN: 'TEST-mp-token',
    SITE_URL: 'https://inkflowbrasil.com',
    ENABLE_PIX_SINAL: 'true',
    ...overrides,
  };
}

// Mock fetch que captura o POST ao MP e devolve um payment Pix.
function mockFetch({ capture }) {
  return async (url, init = {}) => {
    const u = String(url);
    if (u.includes('/rest/v1/agendamentos') && (init.method || 'GET') === 'GET') {
      return new Response(JSON.stringify([{
        id: AG_ID, status: 'tentative', inicio: '2026-05-23T13:00:00Z', fim: '2026-05-23T16:00:00Z',
        cliente_nome: 'Ana', cliente_telefone: '+5511988887777',
      }]), { status: 200 });
    }
    if (u.includes('/rest/v1/tenants')) {
      return new Response(JSON.stringify([{ nome_estudio: 'Estudio X', sinal_percentual: 30 }]), { status: 200 });
    }
    if (u.includes('api.mercadopago.com/v1/payments')) {
      capture.mpUrl = u; capture.mpInit = init;
      return new Response(JSON.stringify({
        id: 12345678,
        point_of_interaction: { transaction_data: { qr_code: '00020126-COPIA-E-COLA', qr_code_base64: 'iVBORw0KGgo=' } },
      }), { status: 201 });
    }
    if (u.includes('api.mercadopago.com/checkout/preferences')) {
      capture.prefCalled = true;
      return new Response(JSON.stringify({ id: 'pref-1', init_point: 'https://mpago.la/checkout' }), { status: 201 });
    }
    if (u.includes('/rest/v1/agendamentos') || u.includes('/rest/v1/conversas') || u.includes('tool_calls_log')) {
      return new Response('', { status: 200 });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
}

test('gerar-link-sinal metodo=pix: POST /v1/payments com payload correto + persiste mp_payment_id', async () => {
  const orig = globalThis.fetch;
  const capture = {};
  globalThis.fetch = mockFetch({ capture });
  try {
    const res = await onRequest(buildContext({ tenant_id: TENANT_ID, agendamento_id: AG_ID, valor_sinal: 225, metodo: 'pix' }, baseEnv()));
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.metodo_usado, 'pix');
    assert.equal(body.copia_e_cola, '00020126-COPIA-E-COLA');
    assert.equal(body.qr_code_base64, 'iVBORw0KGgo=');
    assert.equal(body.mp_payment_id, '12345678');
    // payload do POST ao MP
    const sent = JSON.parse(capture.mpInit.body);
    assert.equal(sent.payment_method_id, 'pix');
    assert.equal(sent.external_reference, `sinal:${AG_ID}`);
    assert.equal(sent.transaction_amount, 225);
    assert.equal(sent.notification_url, 'https://inkflowbrasil.com/api/webhooks/mp-sinal');
    assert.equal(sent.payer.email, 'cli5511988887777@inkflowbrasil.com');
    assert.equal(sent.payer.first_name, 'Ana');
    assert.match(sent.date_of_expiration, /-03:00$/);
    // idempotency key presente e específica do agendamento
    assert.match(capture.mpInit.headers['X-Idempotency-Key'], new RegExp(`^sinal-${AG_ID}-`));
    assert.equal(capture.prefCalled, undefined); // NÃO chamou Preference
  } finally { globalThis.fetch = orig; }
});

test('gerar-link-sinal metodo=cartao: mantém a Preference atual (regressão)', async () => {
  const orig = globalThis.fetch;
  const capture = {};
  globalThis.fetch = mockFetch({ capture });
  try {
    const res = await onRequest(buildContext({ tenant_id: TENANT_ID, agendamento_id: AG_ID, valor_sinal: 225, metodo: 'cartao' }, baseEnv()));
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.metodo_usado, 'cartao');
    assert.equal(body.link_pagamento, 'https://mpago.la/checkout');
    assert.equal(capture.prefCalled, true);
    assert.equal(capture.mpUrl, undefined); // NÃO chamou /v1/payments
  } finally { globalThis.fetch = orig; }
});

test('gerar-link-sinal ENABLE_PIX_SINAL=false: metodo=pix cai pro cartão/Preference', async () => {
  const orig = globalThis.fetch;
  const capture = {};
  globalThis.fetch = mockFetch({ capture });
  try {
    const res = await onRequest(buildContext({ tenant_id: TENANT_ID, agendamento_id: AG_ID, valor_sinal: 225, metodo: 'pix' }, baseEnv({ ENABLE_PIX_SINAL: 'false' })));
    const body = await res.json();
    assert.equal(body.metodo_usado, 'cartao');
    assert.equal(capture.prefCalled, true);
  } finally { globalThis.fetch = orig; }
});

test('gerar-link-sinal metodo default = pix quando omitido', async () => {
  const orig = globalThis.fetch;
  const capture = {};
  globalThis.fetch = mockFetch({ capture });
  try {
    const res = await onRequest(buildContext({ tenant_id: TENANT_ID, agendamento_id: AG_ID, valor_sinal: 225 }, baseEnv()));
    const body = await res.json();
    assert.equal(body.metodo_usado, 'pix');
  } finally { globalThis.fetch = orig; }
});

test('gerar-link-sinal metodo=pix: MP responde sem qr_code → 502 mp-sem-qr', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('/rest/v1/agendamentos') && (init.method || 'GET') === 'GET') {
      return new Response(JSON.stringify([{ id: AG_ID, status: 'tentative', inicio: '2026-05-23T13:00:00Z', fim: '2026-05-23T16:00:00Z', cliente_nome: 'Ana', cliente_telefone: '+5511988887777' }]), { status: 200 });
    }
    if (u.includes('/rest/v1/tenants')) {
      return new Response(JSON.stringify([{ nome_estudio: 'Estudio X', sinal_percentual: 30 }]), { status: 200 });
    }
    if (u.includes('api.mercadopago.com/v1/payments')) {
      return new Response(JSON.stringify({ id: 999, point_of_interaction: { transaction_data: {} } }), { status: 201 });
    }
    if (u.includes('/rest/v1/agendamentos') || u.includes('/rest/v1/conversas') || u.includes('tool_calls_log')) {
      return new Response('', { status: 200 });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  try {
    const res = await onRequest(buildContext({ tenant_id: TENANT_ID, agendamento_id: AG_ID, valor_sinal: 225, metodo: 'pix' }, baseEnv()));
    const body = await res.json();
    assert.equal(res.status, 502);
    assert.equal(body.error, 'mp-sem-qr');
  } finally { globalThis.fetch = orig; }
});
