// Testes dos helpers puros do endpoint de reentrada (formatador de mensagem
// + formatador BRL). Integration tests com mock Supabase/Evolution ficam pra
// fase de testes de tool full.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarMensagem, fmtBRL } from '../../functions/api/telegram/reentrada.js';

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
