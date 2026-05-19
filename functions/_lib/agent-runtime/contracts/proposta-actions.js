// functions/_lib/agent-runtime/contracts/proposta-actions.js
// Contratos cross-action do PropostaAgent. Espelha cadastro-handoff.js da
// Fase 2A (1 arquivo por agent, 1 schema discriminated union, 1 funcao
// extract) — NAO sao 3 contratos separados (decisao cravada 19/05).
//
// Schema strict (Task 2-4) ja garante shape estrutural (slot ISO, valor>0).
// Este contract valida invariantes CONTEXT-DEPENDENT que schema nao cobre:
//   - reservar_horario: slot em ctx.horarios_livres OR ctx.slots_reservados (TC-P09)
//   - pediu_desconto: valor_pedido_cliente <= ctx.valor_proposto
//   - enviar_portfolio: ctx.portfolio_disponivel === true
//
// enviar_portfolio delega pra PortfolioIntentSchema/extractPortfolioIntent
// (compartilhado com Cadastro Fase 2A) — sem duplicar.
//
// Spec Fase 2 section 2.3 + 2.4.
import { z } from 'zod';
import { PortfolioIntentSchema, extractPortfolioIntent } from './portfolio-intent.js';

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

const ReservarHorarioBranch = z.object({
  proxima_acao: z.literal('reservar_horario'),
  slot_inicio: z.string().regex(ISO_RE),
  slot_fim: z.string().regex(ISO_RE),
});

const PediuDescontoBranch = z.object({
  proxima_acao: z.literal('pediu_desconto'),
  valor_pedido_cliente: z.number().positive(),
});

const EnviarPortfolioBranch = z.object({
  proxima_acao: z.literal('enviar_portfolio'),
  payload_portfolio: PortfolioIntentSchema,
});

export const PropostaActionPayloadSchema = z.discriminatedUnion('proxima_acao', [
  ReservarHorarioBranch,
  PediuDescontoBranch,
  EnviarPortfolioBranch,
]);

function slotMatches(slot, slot_inicio, slot_fim) {
  return slot.inicio === slot_inicio && slot.fim === slot_fim;
}

export function extractPropostaAction(out, ctx) {
  if (!out) return null;
  const acao = out.proxima_acao;
  if (acao !== 'reservar_horario' && acao !== 'pediu_desconto' && acao !== 'enviar_portfolio') {
    return null;
  }

  if (acao === 'reservar_horario') {
    const payload = PropostaActionPayloadSchema.parse({
      proxima_acao: 'reservar_horario',
      slot_inicio: out.slot_inicio,
      slot_fim: out.slot_fim,
    });
    const livres = ctx?.horarios_livres || [];
    const reservados = ctx?.slots_reservados || [];
    const hit = livres.some(s => slotMatches(s, payload.slot_inicio, payload.slot_fim))
             || reservados.some(s => slotMatches(s, payload.slot_inicio, payload.slot_fim));
    if (!hit) throw new Error('slot fora da lista pre-fetched');
    return payload;
  }

  if (acao === 'pediu_desconto') {
    const payload = PropostaActionPayloadSchema.parse({
      proxima_acao: 'pediu_desconto',
      valor_pedido_cliente: out.valor_pedido_cliente,
    });
    if (typeof ctx?.valor_proposto === 'number' && payload.valor_pedido_cliente > ctx.valor_proposto) {
      throw new Error(`valor_pedido_cliente=${payload.valor_pedido_cliente} > valor_proposto=${ctx.valor_proposto}`);
    }
    return payload;
  }

  // enviar_portfolio: delega pra extractPortfolioIntent (compartilhado).
  return extractPortfolioIntent(out, ctx);
}
