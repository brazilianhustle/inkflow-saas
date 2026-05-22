// Testes dos helpers puros do endpoint de reentrada (formatador de mensagem
// + formatador BRL). Integration tests com mock Supabase/Evolution ficam pra
// fase de testes de tool full.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarMensagem, fmtBRL, handle } from '../../functions/api/telegram/reentrada.js';

// ── fmtBRL ────────────────────────────────────────────────────────────────

test('fmtBRL: valor inteiro fica sem decimais', () => {
  assert.equal(fmtBRL(750), '750');
  assert.equal(fmtBRL(1000), '1000');
});

test('fmtBRL: valor com decimais usa virgula', () => {
  assert.equal(fmtBRL(750.50), '750,50');
  assert.equal(fmtBRL(99.99), '99,99');
});

test('fmtBRL: null/undefined retorna "?"', () => {
  assert.equal(fmtBRL(null), '?');
  assert.equal(fmtBRL(undefined), '?');
});

test('fmtBRL: string numerica converte', () => {
  assert.equal(fmtBRL('750'), '750');
});

test('fmtBRL: string nao numerica retorna como veio', () => {
  assert.equal(fmtBRL('abc'), 'abc');
});

// ── montarMensagem ─────────────────────────────────────────────────────────

test('montarMensagem: evento "fechar"', () => {
  assert.equal(
    montarMensagem('fechar', 750),
    'Show! Pelo trabalho ficou em R$ 750. Bora marcar?'
  );
});

test('montarMensagem: evento "aceitar_desconto"', () => {
  assert.equal(
    montarMensagem('aceitar_desconto', 600),
    'Show! Ele topou em R$ 600. Bora marcar?'
  );
});

test('montarMensagem: evento "manter_valor" usa valor_proposto', () => {
  // valor_pedido_cliente seria 600, mas tatuador manteve 750
  assert.equal(
    montarMensagem('manter_valor', null, 750),
    'Ele preferiu manter R$ 750. Tá fechado pra ti? Bora marcar?'
  );
});

test('montarMensagem: evento "recusar"', () => {
  assert.equal(
    montarMensagem('recusar'),
    'Infelizmente o tatuador não vai poder fazer essa peça. Posso te ajudar com outra ideia?'
  );
});

test('montarMensagem: evento desconhecido retorna null', () => {
  assert.equal(montarMensagem('inventado', 100), null);
  assert.equal(montarMensagem('', 100), null);
  assert.equal(montarMensagem(undefined, 100), null);
});

test('montarMensagem: valores com decimais sao formatados', () => {
  assert.equal(
    montarMensagem('fechar', 750.50),
    'Show! Pelo trabalho ficou em R$ 750,50. Bora marcar?'
  );
});

test('S2 reentrada: registra mensagem automatica em conversa_mensagens para entrar no historico do agente', async () => {
  const orig = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    const u = String(url);
    if (u.includes('/rest/v1/conversas?id=eq.')) {
      return new Response(JSON.stringify([{
        id: 'conv-1',
        telefone: '5511999',
        valor_proposto: 750,
        orcid: 'orc_123',
        tenant_id: 'tenant-1',
        tenants: { id: 'tenant-1', evo_instance: 'inst', evo_apikey: 'k', evo_base_url: 'https://evo.test' },
      }]), { status: 200 });
    }
    if (u.includes('evo.test/message/sendText')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (u.includes('/rest/v1/conversa_mensagens')) {
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  try {
    const r = await handle(
      { SUPABASE_SERVICE_KEY: 's', EVO_BASE_URL: 'https://evo.test' },
      { conversa_id: 'conv-1', evento: 'fechar', orcid: 'orc_123', valor: 750 },
    );
    assert.equal(r.status, 200);
    const hist = calls.find(c => c.url.includes('/rest/v1/conversa_mensagens'));
    assert.ok(hist, 'deve inserir conversa_mensagens');
    assert.equal(hist.body.session_id, 'tenant-1_5511999');
    assert.equal(hist.body.message.type, 'ai');
    assert.match(hist.body.message.content, /R\$ 750/);
    assert.equal(hist.body.status, 'processed');
  } finally {
    globalThis.fetch = orig;
  }
});
