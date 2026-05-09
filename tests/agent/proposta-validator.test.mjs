import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PropostaOutputSchema,
  validatePropostaOutputInvariant,
  PROXIMA_ACAO_VALUES,
} from '../../functions/api/agent/agents/proposta.js';

// ── Schema tests ─────────────────────────────────────────────────────────

test('PropostaOutputSchema: aceita output minimo (proxima_acao=pergunta, payloads null)', () => {
  const r = PropostaOutputSchema.parse({
    resposta_cliente: 'oi',
    proxima_acao: 'pergunta',
  });
  assert.equal(r.slot_inicio, null);
  assert.equal(r.slot_fim, null);
  assert.equal(r.valor_pedido_cliente, null);
});

test('PropostaOutputSchema: rejeita resposta_cliente vazia', () => {
  assert.throws(() => PropostaOutputSchema.parse({ resposta_cliente: '', proxima_acao: 'pergunta' }));
});

test('PropostaOutputSchema: rejeita proxima_acao desconhecida', () => {
  assert.throws(() => PropostaOutputSchema.parse({ resposta_cliente: 'a', proxima_acao: 'foo' }));
});

test('PROXIMA_ACAO_VALUES: tem 8 entries inclusive reservar_horario, pediu_desconto, cliente_agressivo, enviar_portfolio', () => {
  assert.equal(PROXIMA_ACAO_VALUES.length, 8);
  assert.ok(PROXIMA_ACAO_VALUES.includes('reservar_horario'));
  assert.ok(PROXIMA_ACAO_VALUES.includes('pediu_desconto'));
  assert.ok(PROXIMA_ACAO_VALUES.includes('cliente_agressivo'));
  assert.ok(PROXIMA_ACAO_VALUES.includes('enviar_portfolio'));
});

// ── Validator tests ──────────────────────────────────────────────────────

const ctx = {
  valor_proposto: 750,
  horarios_livres: [
    { inicio: '2026-05-12T17:00:00Z', fim: '2026-05-12T20:00:00Z', legenda: 'a' },
  ],
};

test('validator: rejeita proxima_acao nao permitida pro estado', () => {
  const r = validatePropostaOutputInvariant(
    { resposta_cliente: 'x', proxima_acao: 'reservar_horario' },
    ctx, 'propondo_valor'
  );
  assert.equal(r.valid, false);
  assert.match(r.reason, /nao permitido/);
});

test('validator: aceita oferecendo_horario em propondo_valor', () => {
  const r = validatePropostaOutputInvariant(
    { resposta_cliente: 'x', proxima_acao: 'oferecendo_horario' },
    ctx, 'propondo_valor'
  );
  assert.equal(r.valid, true);
});

test('validator: rejeita reservar_horario sem slot_inicio/slot_fim', () => {
  const r = validatePropostaOutputInvariant(
    { resposta_cliente: 'x', proxima_acao: 'reservar_horario' },
    ctx, 'escolhendo_horario'
  );
  assert.equal(r.valid, false);
  assert.match(r.reason, /slot_inicio/);
});

test('validator: reservar_horario com slot nao-ISO = reason nao-ISO', () => {
  const r = validatePropostaOutputInvariant(
    { resposta_cliente: 'x', proxima_acao: 'reservar_horario', slot_inicio: 'amanha 14h', slot_fim: 'amanha 17h' },
    ctx, 'escolhendo_horario'
  );
  assert.equal(r.valid, false);
  assert.match(r.reason, /nao-ISO/);
});

test('validator: reservar_horario com slot fora da lista = reason slot fora', () => {
  const r = validatePropostaOutputInvariant(
    { resposta_cliente: 'x', proxima_acao: 'reservar_horario',
      slot_inicio: '2026-05-15T10:00:00Z', slot_fim: '2026-05-15T13:00:00Z' },
    ctx, 'escolhendo_horario'
  );
  assert.equal(r.valid, false);
  assert.match(r.reason, /fora da lista/);
});

test('validator: reservar_horario com slot da lista = valid', () => {
  const r = validatePropostaOutputInvariant(
    { resposta_cliente: 'x', proxima_acao: 'reservar_horario',
      slot_inicio: '2026-05-12T17:00:00Z', slot_fim: '2026-05-12T20:00:00Z' },
    ctx, 'escolhendo_horario'
  );
  assert.equal(r.valid, true);
});

test('validator: pediu_desconto sem valor_pedido_cliente = invalid', () => {
  const r = validatePropostaOutputInvariant(
    { resposta_cliente: 'x', proxima_acao: 'pediu_desconto' },
    ctx, 'propondo_valor'
  );
  assert.equal(r.valid, false);
});

test('validator: pediu_desconto com valor > valor_proposto = invalid', () => {
  const r = validatePropostaOutputInvariant(
    { resposta_cliente: 'x', proxima_acao: 'pediu_desconto', valor_pedido_cliente: 800 },
    ctx, 'propondo_valor'
  );
  assert.equal(r.valid, false);
  assert.match(r.reason, /> valor_proposto/);
});

test('validator: cliente_agressivo + reagendamento permitidos em todos os 3 estados', () => {
  for (const estado of ['propondo_valor', 'escolhendo_horario', 'aguardando_sinal']) {
    for (const acao of ['cliente_agressivo', 'reagendamento']) {
      const r = validatePropostaOutputInvariant(
        { resposta_cliente: 'x', proxima_acao: acao }, ctx, estado
      );
      assert.equal(r.valid, true, `falhou em ${estado}/${acao}: ${r.reason || ''}`);
    }
  }
});

// — Sub-3.3: invariant enviar_portfolio —————————————————————————————
test('Proposta invariant: enviar_portfolio em propondo_valor com portfolio=true -> valid', () => {
  const out = {
    resposta_cliente: 'te mando',
    proxima_acao: 'enviar_portfolio',
    slot_inicio: null,
    slot_fim: null,
    valor_pedido_cliente: null,
    payload_portfolio: { estilo: 'blackwork', max: null, motivo: null },
  };
  const r = validatePropostaOutputInvariant(out, { portfolio_disponivel: true, valor_proposto: 750 }, 'propondo_valor');
  assert.equal(r.valid, true);
});

test('Proposta invariant: enviar_portfolio em escolhendo_horario com portfolio=true -> valid', () => {
  const out = {
    resposta_cliente: 'te mando',
    proxima_acao: 'enviar_portfolio',
    slot_inicio: null,
    slot_fim: null,
    valor_pedido_cliente: null,
    payload_portfolio: { estilo: null, max: null, motivo: null },
  };
  const r = validatePropostaOutputInvariant(out, { portfolio_disponivel: true, horarios_livres: [] }, 'escolhendo_horario');
  assert.equal(r.valid, true);
});

test('Proposta invariant: enviar_portfolio com portfolio=false -> invalid', () => {
  const out = {
    resposta_cliente: 'te mando',
    proxima_acao: 'enviar_portfolio',
    slot_inicio: null, slot_fim: null, valor_pedido_cliente: null,
    payload_portfolio: { estilo: null, max: null, motivo: null },
  };
  const r = validatePropostaOutputInvariant(out, { portfolio_disponivel: false }, 'aguardando_sinal');
  assert.equal(r.valid, false);
  assert.match(r.reason, /portfolio_disponivel=false/);
});

test('Proposta invariant: enviar_portfolio sem payload_portfolio -> invalid', () => {
  const out = {
    resposta_cliente: 'te mando',
    proxima_acao: 'enviar_portfolio',
    slot_inicio: null, slot_fim: null, valor_pedido_cliente: null,
    payload_portfolio: null,
  };
  const r = validatePropostaOutputInvariant(out, { portfolio_disponivel: true }, 'propondo_valor');
  assert.equal(r.valid, false);
  assert.match(r.reason, /payload_portfolio/);
});
