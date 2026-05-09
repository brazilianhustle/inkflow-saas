// PropostaAgent — fase Proposta do fluxo Coleta v2 (Sub-3.2).
// Pure structured-output (tools=[]); side-effects orquestrados em route.js
// via switch por proxima_acao.
//
// 3 sub-estados ativos:
// - propondo_valor: bot apresenta valor + lida com aceita/desconto/adia
// - escolhendo_horario: bot recebe slot escolhido, emite reservar
// - aguardando_sinal: bot lida com link expirado / mudancas
//
// Builder retorna { agent, validator } com validator pre-vinculado a
// clientContext + estado_atual via closure (cross-agent pattern Sub-3.2).
import { Agent } from '@openai/agents';
import { z } from 'zod';
import { generatePromptColetaProposta } from '../../../_lib/prompts/coleta/proposta/generate.js';
import { lookupHorario, isValidIso } from '../_lib/lookup-horario.js';

export const PROXIMA_ACAO_VALUES = [
  'pergunta',
  'oferecendo_horario',
  'reservar_horario',
  'pediu_desconto',
  'adiou',
  'reagendamento',
  'cliente_agressivo',
];

export const PropostaOutputSchema = z.object({
  resposta_cliente: z.string().min(1).max(500),
  proxima_acao: z.enum(PROXIMA_ACAO_VALUES),
  slot_inicio: z.string().nullable().default(null),
  slot_fim: z.string().nullable().default(null),
  valor_pedido_cliente: z.number().nullable().default(null),
});

const ALLOWED_BY_STATE = {
  propondo_valor:     ['pergunta', 'oferecendo_horario', 'pediu_desconto', 'adiou', 'reagendamento', 'cliente_agressivo'],
  escolhendo_horario: ['pergunta', 'reservar_horario', 'reagendamento', 'cliente_agressivo'],
  aguardando_sinal:   ['pergunta', 'reservar_horario', 'reagendamento', 'cliente_agressivo'],
};

export function validatePropostaOutputInvariant(out, ctx, estado_atual) {
  if (!out || typeof out !== 'object') {
    return { valid: false, reason: 'output ausente ou nao-objeto' };
  }
  const allowed = ALLOWED_BY_STATE[estado_atual] || [];
  if (!allowed.includes(out.proxima_acao)) {
    return { valid: false, reason: `proxima_acao='${out.proxima_acao}' nao permitido em estado='${estado_atual}'` };
  }
  if (out.proxima_acao === 'reservar_horario') {
    if (!out.slot_inicio || !out.slot_fim) {
      return { valid: false, reason: 'reservar_horario requer slot_inicio e slot_fim' };
    }
    if (!isValidIso(out.slot_inicio) || !isValidIso(out.slot_fim)) {
      return { valid: false, reason: `slot_inicio/slot_fim nao-ISO: ${out.slot_inicio}/${out.slot_fim}` };
    }
    if (!lookupHorario(ctx?.horarios_livres || [], out.slot_inicio, out.slot_fim)) {
      return { valid: false, reason: 'slot fora da lista pre-fetched' };
    }
  }
  if (out.proxima_acao === 'pediu_desconto') {
    if (typeof out.valor_pedido_cliente !== 'number' || out.valor_pedido_cliente <= 0) {
      return { valid: false, reason: 'pediu_desconto requer valor_pedido_cliente number > 0' };
    }
    if (typeof ctx?.valor_proposto === 'number' && out.valor_pedido_cliente > ctx.valor_proposto) {
      return { valid: false, reason: `valor_pedido_cliente=${out.valor_pedido_cliente} > valor_proposto=${ctx.valor_proposto}` };
    }
  }
  return { valid: true };
}

export function buildPropostaAgent({ env, tenant, conversa, clientContext, estado_atual }) {
  const ctx = clientContext || {};
  const instructions = generatePromptColetaProposta(tenant, conversa, ctx);
  const agent = new Agent({
    name: 'proposta-agent',
    model: 'gpt-4o-mini',
    instructions,
    tools: [],
    outputType: PropostaOutputSchema,
  });
  // Closure-bound validator: route.js chama validator(out) com 1 arg
  // (paridade Sub-3.1), mas closure carrega ctx + estado_atual.
  const validator = (out) => validatePropostaOutputInvariant(out, ctx, estado_atual);
  return { agent, validator };
}
