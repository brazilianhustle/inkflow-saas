import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PropostaPropondoValorSchema } from '../../functions/api/agent/agents/proposta-schema.js';

const baseSentinel = {
  resposta_cliente: 'oi',
  slot_inicio: null,
  slot_fim: null,
  valor_pedido_cliente: null,
  payload_portfolio: null,
};

// — Branch pergunta —
test('propondo_valor: pergunta aceita sentinels nulls', () => {
  const r = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'pergunta',
    ...baseSentinel,
  });
  assert.equal(r.success, true);
});

test('propondo_valor: pergunta com resposta_cliente vazio REJEITADO', () => {
  const r = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'pergunta',
    ...baseSentinel,
    resposta_cliente: '',
  });
  assert.equal(r.success, false);
});

// — Branch oferecendo_horario —
test('propondo_valor: oferecendo_horario aceita', () => {
  const r = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'oferecendo_horario',
    ...baseSentinel,
    resposta_cliente: 'tem ter 12/05 14h-17h ou qui 14/05 10h-13h?',
  });
  assert.equal(r.success, true);
});

// — Branch pediu_desconto —
test('propondo_valor: pediu_desconto exige valor_pedido_cliente positive', () => {
  const ok = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'pediu_desconto',
    ...baseSentinel,
    resposta_cliente: 'vou consultar',
    valor_pedido_cliente: 600,
  });
  assert.equal(ok.success, true);
});

test('propondo_valor: pediu_desconto sem valor_pedido_cliente REJEITADO', () => {
  const r = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'pediu_desconto',
    ...baseSentinel,
    resposta_cliente: 'x',
  });
  assert.equal(r.success, false);
});

test('propondo_valor: pediu_desconto com valor_pedido_cliente <= 0 REJEITADO', () => {
  const r = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'pediu_desconto',
    ...baseSentinel,
    resposta_cliente: 'x',
    valor_pedido_cliente: 0,
  });
  assert.equal(r.success, false);
});

// — Branch enviar_portfolio —
test('propondo_valor: enviar_portfolio exige payload_portfolio non-null', () => {
  const ok = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'enviar_portfolio',
    ...baseSentinel,
    resposta_cliente: 'te mando referencia',
    payload_portfolio: { estilo: 'blackwork', max: 3, motivo: 'cliente pediu' },
  });
  assert.equal(ok.success, true);
});

test('propondo_valor: enviar_portfolio com payload null REJEITADO', () => {
  const r = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'enviar_portfolio',
    ...baseSentinel,
    resposta_cliente: 'x',
  });
  assert.equal(r.success, false);
});

// — Branches adiou/reagendamento/cliente_agressivo —
for (const acao of ['adiou', 'reagendamento', 'cliente_agressivo']) {
  test(`propondo_valor: ${acao} aceita sentinels`, () => {
    const r = PropostaPropondoValorSchema.safeParse({
      proxima_acao: acao,
      ...baseSentinel,
      resposta_cliente: 'ok',
    });
    assert.equal(r.success, true);
  });
}

// — Branch erro —
test('propondo_valor: erro aceita mensagem amigavel', () => {
  const r = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'erro',
    ...baseSentinel,
    resposta_cliente: 'Tive um problema, podes mandar de novo?',
  });
  assert.equal(r.success, true);
});

// — Actions PROIBIDAS em propondo_valor (reservar_horario) —
test('propondo_valor: reservar_horario REJEITADO (action fora do substate)', () => {
  const r = PropostaPropondoValorSchema.safeParse({
    proxima_acao: 'reservar_horario',
    ...baseSentinel,
    resposta_cliente: 'reservei',
    slot_inicio: '2026-05-12T17:00:00Z',
    slot_fim: '2026-05-12T20:00:00Z',
  });
  assert.equal(r.success, false);
});

// ─── ESCOLHENDO_HORARIO ────────────────────────────────────────────────────
import { PropostaEscolhendoHorarioSchema } from '../../functions/api/agent/agents/proposta-schema.js';

const baseSentinelEH = {
  resposta_cliente: 'oi',
  slot_inicio: null,
  slot_fim: null,
  valor_pedido_cliente: null,
  payload_portfolio: null,
};

test('escolhendo_horario: pergunta aceita', () => {
  const r = PropostaEscolhendoHorarioSchema.safeParse({ proxima_acao: 'pergunta', ...baseSentinelEH });
  assert.equal(r.success, true);
});

test('escolhendo_horario: reservar_horario com slots ISO aceita', () => {
  const r = PropostaEscolhendoHorarioSchema.safeParse({
    proxima_acao: 'reservar_horario',
    ...baseSentinelEH,
    resposta_cliente: 'reservado',
    slot_inicio: '2026-05-12T17:00:00Z',
    slot_fim: '2026-05-12T20:00:00Z',
  });
  assert.equal(r.success, true);
});

test('escolhendo_horario: reservar_horario com slot non-ISO REJEITADO', () => {
  const r = PropostaEscolhendoHorarioSchema.safeParse({
    proxima_acao: 'reservar_horario',
    ...baseSentinelEH,
    resposta_cliente: 'x',
    slot_inicio: 'amanha 14h',
    slot_fim: 'amanha 17h',
  });
  assert.equal(r.success, false);
});

test('escolhendo_horario: reservar_horario com slot_inicio null REJEITADO', () => {
  const r = PropostaEscolhendoHorarioSchema.safeParse({
    proxima_acao: 'reservar_horario',
    ...baseSentinelEH,
    resposta_cliente: 'x',
    slot_inicio: null,
    slot_fim: '2026-05-12T20:00:00Z',
  });
  assert.equal(r.success, false);
});

test('escolhendo_horario: enviar_portfolio com payload aceita', () => {
  const r = PropostaEscolhendoHorarioSchema.safeParse({
    proxima_acao: 'enviar_portfolio',
    ...baseSentinelEH,
    resposta_cliente: 'te mando',
    payload_portfolio: { estilo: 'fineline', max: 3, motivo: 'pediu' },
  });
  assert.equal(r.success, true);
});

test('escolhendo_horario: reagendamento/cliente_agressivo aceitos', () => {
  for (const acao of ['reagendamento', 'cliente_agressivo']) {
    const r = PropostaEscolhendoHorarioSchema.safeParse({
      proxima_acao: acao, ...baseSentinelEH, resposta_cliente: 'ok',
    });
    assert.equal(r.success, true);
  }
});

test('escolhendo_horario: oferecendo_horario REJEITADO (action fora do substate)', () => {
  const r = PropostaEscolhendoHorarioSchema.safeParse({
    proxima_acao: 'oferecendo_horario', ...baseSentinelEH, resposta_cliente: 'x',
  });
  assert.equal(r.success, false);
});

test('escolhendo_horario: pediu_desconto REJEITADO (action fora do substate)', () => {
  const r = PropostaEscolhendoHorarioSchema.safeParse({
    proxima_acao: 'pediu_desconto', ...baseSentinelEH,
    resposta_cliente: 'x', valor_pedido_cliente: 500,
  });
  assert.equal(r.success, false);
});

test('escolhendo_horario: erro aceita', () => {
  const r = PropostaEscolhendoHorarioSchema.safeParse({
    proxima_acao: 'erro', ...baseSentinelEH, resposta_cliente: 'tive um problema',
  });
  assert.equal(r.success, true);
});
