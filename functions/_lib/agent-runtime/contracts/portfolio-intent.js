// functions/_lib/agent-runtime/contracts/portfolio-intent.js
// Contrato compartilhado pra intent transversal 'enviar_portfolio'.
// Usado por Cadastro (Fase 2A) e Proposta (Fase 2B).
//
// Valida shape do payload + pre-condicao ctx.portfolio_disponivel===true.
//
// Spec Fase 2 section 2.3.
import { z } from 'zod';

export const PortfolioIntentSchema = z.object({
  estilo: z.string().nullable(),
  max: z.number().int().min(1).max(10),
  motivo: z.string().min(1),
});

export function extractPortfolioIntent(out, ctx) {
  if (!out || out.proxima_acao !== 'enviar_portfolio') return null;
  if (!ctx?.portfolio_disponivel) {
    throw new Error('enviar_portfolio com portfolio_disponivel=false');
  }
  if (!out.payload_portfolio) {
    throw new Error('enviar_portfolio sem payload_portfolio');
  }
  return PortfolioIntentSchema.parse(out.payload_portfolio);
}
