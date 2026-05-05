// Testes do handler enviar-orcamento-tatuador (refator pra contrato tenant_id+telefone).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/tools/enviar-orcamento-tatuador.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TELEFONE = '+5511999999999';
const CONVERSA_ID = '11111111-1111-1111-1111-111111111111';
const SECRET = 'test-secret';
const TG_CHAT_ID = '-100123456';

const ENV = {
  INKFLOW_TOOL_SECRET: SECRET,
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  INKFLOW_TELEGRAM_BOT_TOKEN: 'fake-bot-token',
};

function buildContext(body, secret = SECRET) {
  return {
    request: new Request('https://example.com/api/tools/enviar-orcamento-tatuador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Inkflow-Tool-Secret': secret },
      body: JSON.stringify(body),
    }),
    env: ENV,
    waitUntil: () => {},
  };
}

const CONVERSA_COMPLETA = {
  id: CONVERSA_ID,
  tenant_id: TENANT_ID,
  estado_agente: 'coletando_cadastro',
  orcid: null,
  dados_coletados: { descricao_tattoo: 'rosa', tamanho_cm: 10, local_corpo: 'antebraço' },
  dados_cadastro: { nome: 'Maria Silva', data_nascimento: '1995-03-12', idade_anos: 31 },
  tenants: { id: TENANT_ID, nome_estudio: 'Hustle Ink', tatuador_telegram_chat_id: TG_CHAT_ID, tatuador_telegram_username: 'leo' },
};

test('enviar-orcamento: happy path envia Telegram e retorna 200 com orcid', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([CONVERSA_COMPLETA]), { status: 200 });
    }
    if (url.includes('telegram.org/bot') && url.includes('sendMessage')) {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 });
    }
    if (opts?.method === 'PATCH') return new Response(null, { status: 204 });
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response(JSON.stringify([]), { status: 200 });
  };
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.match(body.orcid, /^orc_/);
    assert.equal(body.telegram_message_id, 42);
    assert.equal(body.estado_agente, 'aguardando_tatuador');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-orcamento: tenant_id ausente retorna 400', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 200 });
  try {
    const ctx = buildContext({ telefone: TELEFONE });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, 'tenant_id obrigatorio');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-orcamento: telefone ausente retorna 400', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 200 });
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, 'telefone obrigatorio');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-orcamento: conversa não existe retorna 404', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 404);
    assert.equal(body.error, 'conversa-nao-encontrada');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-orcamento: idempotência via orcid existente', async () => {
  const origFetch = globalThis.fetch;
  const convComOrcid = { ...CONVERSA_COMPLETA, orcid: 'orc_abc123', estado_agente: 'aguardando_tatuador' };
  let telegramCalls = 0;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([convComOrcid]), { status: 200 });
    }
    if (url.includes('telegram.org')) {
      telegramCalls++;
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.orcid, 'orc_abc123');
    assert.equal(body.idempotente, true);
    assert.equal(telegramCalls, 0, 'Telegram NÃO deve ser chamado em idempotência');
  } finally {
    globalThis.fetch = origFetch;
  }
});
