import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAction, isStateImplemented } from '../../functions/api/agent/router.js';

// — Tattoo handoff (Fase 1) —
test('validateAction: tattoo + handoff valido retorna payload extraido', () => {
  const out = {
    proxima_acao: 'handoff',
    resposta_cliente: 'beleza',
    dados_persistidos: {
      descricao_curta: 'rosa', local_corpo: 'braco', altura_cm: 170, estilo: 'fineline',
      tamanho_cm: null, cor_preferencia: null, foto_local: null,
    },
    dados_completos: true, campos_faltando: [], campos_conflitantes: [],
    payload_portfolio: null,
  };
  const payload = validateAction('tattoo', out, {});
  assert.equal(payload.descricao_curta, 'rosa');
});

test('validateAction: tattoo + pergunta retorna null', () => {
  const payload = validateAction('tattoo', { proxima_acao: 'pergunta' }, {});
  assert.equal(payload, null);
});

// — Cadastro handoff (Fase 2A) —
test('validateAction: cadastro + handoff valido retorna payload', () => {
  const out = {
    proxima_acao: 'handoff',
    dados_persistidos: { nome: 'Joao', data_nascimento: '1995-03-12', email: 'j@e.com' },
    email_recusado: false,
  };
  const payload = validateAction('cadastro', out, {});
  assert.equal(payload.nome, 'Joao');
});

// — Proposta actions (Fase 2B) —
test('validateAction: propondo_valor + pediu_desconto valido', () => {
  const out = { proxima_acao: 'pediu_desconto', valor_pedido_cliente: 600 };
  const payload = validateAction('propondo_valor', out, { valor_proposto: 750 });
  assert.equal(payload.valor_pedido_cliente, 600);
});

test('validateAction: propondo_valor + pediu_desconto valor > proposto throw', () => {
  const out = { proxima_acao: 'pediu_desconto', valor_pedido_cliente: 800 };
  assert.throws(() => validateAction('propondo_valor', out, { valor_proposto: 750 }), /> valor_proposto/);
});

test('validateAction: escolhendo_horario + reservar_horario slot em horarios_livres', () => {
  const out = {
    proxima_acao: 'reservar_horario',
    slot_inicio: '2026-05-12T17:00:00Z', slot_fim: '2026-05-12T20:00:00Z',
  };
  const payload = validateAction('escolhendo_horario', out, {
    horarios_livres: [{ inicio: '2026-05-12T17:00:00Z', fim: '2026-05-12T20:00:00Z' }],
    slots_reservados: [],
  });
  assert.equal(payload.slot_inicio, '2026-05-12T17:00:00Z');
});

test('validateAction: aguardando_sinal + reservar_horario slot em slots_reservados (TC-P09)', () => {
  const out = {
    proxima_acao: 'reservar_horario',
    slot_inicio: '2026-05-14T13:00:00Z', slot_fim: '2026-05-14T16:00:00Z',
  };
  const payload = validateAction('aguardando_sinal', out, {
    horarios_livres: [],
    slots_reservados: [{ inicio: '2026-05-14T13:00:00Z', fim: '2026-05-14T16:00:00Z' }],
  });
  assert.equal(payload.slot_inicio, '2026-05-14T13:00:00Z');
});

test('validateAction: enviar_portfolio em qualquer substate', () => {
  const out = {
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: 'fineline', max: 3, motivo: 'pediu' },
  };
  for (const estado of ['propondo_valor', 'escolhendo_horario', 'aguardando_sinal']) {
    const payload = validateAction(estado, out, { portfolio_disponivel: true });
    assert.equal(payload.estilo, 'fineline');
  }
});

test('validateAction: propondo_valor + pergunta retorna null', () => {
  const payload = validateAction('propondo_valor', { proxima_acao: 'pergunta' }, {});
  assert.equal(payload, null);
});

test('validateAction: estado sem contrato retorna null', () => {
  const payload = validateAction('estado_inexistente', { proxima_acao: 'handoff' }, {});
  assert.equal(payload, null);
});

test('validateAction: out null retorna null', () => {
  assert.equal(validateAction('tattoo', null, {}), null);
});

test('isStateImplemented: cobre tattoo + cadastro + 3 substates proposta', () => {
  for (const e of ['tattoo', 'cadastro', 'propondo_valor', 'escolhendo_horario', 'aguardando_sinal']) {
    assert.equal(isStateImplemented(e), true);
  }
  assert.equal(isStateImplemented('inexistente'), false);
});
