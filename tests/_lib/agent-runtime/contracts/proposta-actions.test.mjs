import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PropostaActionPayloadSchema,
  extractPropostaAction,
} from '../../../../functions/_lib/agent-runtime/contracts/proposta-actions.js';

const ctxComSlots = {
  valor_proposto: 750,
  horarios_livres: [
    { inicio: '2026-05-12T17:00:00Z', fim: '2026-05-12T20:00:00Z', legenda: 'ter 12/05 14h-17h' },
  ],
  slots_reservados: [
    { inicio: '2026-05-14T13:00:00Z', fim: '2026-05-14T16:00:00Z', agendamento_id: 'agd-001' },
  ],
  portfolio_disponivel: true,
};

// — Schema —
test('PropostaActionPayloadSchema: reservar_horario aceita slots ISO', () => {
  const r = PropostaActionPayloadSchema.safeParse({
    proxima_acao: 'reservar_horario',
    slot_inicio: '2026-05-12T17:00:00Z',
    slot_fim: '2026-05-12T20:00:00Z',
  });
  assert.equal(r.success, true);
});

test('PropostaActionPayloadSchema: pediu_desconto aceita valor positive', () => {
  const r = PropostaActionPayloadSchema.safeParse({
    proxima_acao: 'pediu_desconto',
    valor_pedido_cliente: 600,
  });
  assert.equal(r.success, true);
});

test('PropostaActionPayloadSchema: enviar_portfolio aceita payload_portfolio', () => {
  const r = PropostaActionPayloadSchema.safeParse({
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: 'blackwork', max: 5, motivo: 'pediu' },
  });
  assert.equal(r.success, true);
});

// — Extract: ações sem payload retornam null —
test('extractPropostaAction: pergunta retorna null', () => {
  const r = extractPropostaAction({ proxima_acao: 'pergunta' }, ctxComSlots);
  assert.equal(r, null);
});

// — Extract: reservar_horario com slot em horarios_livres —
test('extractPropostaAction: reservar_horario com slot em horarios_livres valido', () => {
  const out = {
    proxima_acao: 'reservar_horario',
    slot_inicio: '2026-05-12T17:00:00Z',
    slot_fim: '2026-05-12T20:00:00Z',
  };
  const r = extractPropostaAction(out, ctxComSlots);
  assert.equal(r.slot_inicio, '2026-05-12T17:00:00Z');
});

// — Extract: TC-P09 — reservar_horario com slot em slots_reservados valido —
test('extractPropostaAction: reservar_horario com slot em slots_reservados valido (TC-P09)', () => {
  const out = {
    proxima_acao: 'reservar_horario',
    slot_inicio: '2026-05-14T13:00:00Z',
    slot_fim: '2026-05-14T16:00:00Z',
  };
  const r = extractPropostaAction(out, ctxComSlots);
  assert.equal(r.slot_inicio, '2026-05-14T13:00:00Z');
});

// — Extract: reservar_horario com slot fora das listas throws —
test('extractPropostaAction: reservar_horario com slot fora das listas throw', () => {
  const out = {
    proxima_acao: 'reservar_horario',
    slot_inicio: '2026-05-99T99:99:99Z',
    slot_fim: '2026-05-99T99:99:99Z',
  };
  assert.throws(() => extractPropostaAction(out, ctxComSlots), /fora da lista/);
});

// — Extract: pediu_desconto valor > valor_proposto throws —
test('extractPropostaAction: pediu_desconto valor > valor_proposto throw', () => {
  const out = { proxima_acao: 'pediu_desconto', valor_pedido_cliente: 800 };
  assert.throws(() => extractPropostaAction(out, ctxComSlots), /> valor_proposto/);
});

test('extractPropostaAction: pediu_desconto valor <= valor_proposto valido', () => {
  const out = { proxima_acao: 'pediu_desconto', valor_pedido_cliente: 600 };
  const r = extractPropostaAction(out, ctxComSlots);
  assert.equal(r.valor_pedido_cliente, 600);
});

// — Extract: enviar_portfolio delega pra PortfolioIntentSchema —
test('extractPropostaAction: enviar_portfolio com portfolio_disponivel=true valido', () => {
  const out = {
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: 'fineline', max: 3, motivo: 'pediu' },
  };
  const r = extractPropostaAction(out, ctxComSlots);
  assert.equal(r.estilo, 'fineline');
});

test('extractPropostaAction: enviar_portfolio com portfolio_disponivel=false throw', () => {
  const out = {
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: null, max: 5, motivo: 'pediu' },
  };
  assert.throws(() => extractPropostaAction(out, { ...ctxComSlots, portfolio_disponivel: false }), /portfolio_disponivel/);
});

// — Extract: shape invalido lanca ZodError —
test('extractPropostaAction: reservar_horario sem slot_fim ZodError', () => {
  const out = { proxima_acao: 'reservar_horario', slot_inicio: '2026-05-12T17:00:00Z' };
  assert.throws(() => extractPropostaAction(out, ctxComSlots));
});

// — Extract: out null retorna null —
test('extractPropostaAction: out null retorna null', () => {
  assert.equal(extractPropostaAction(null, ctxComSlots), null);
});
