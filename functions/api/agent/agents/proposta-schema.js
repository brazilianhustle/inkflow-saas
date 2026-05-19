// functions/api/agent/agents/proposta-schema.js
// 3 schemas (1 por substate ativo do PropostaAgent). Cada um e discriminated
// union de actions permitidas no substate + erro. ALLOWED_BY_STATE injetado
// como discriminator literals — LLM NAO consegue emitir action fora do
// permitido (constrained decoding token-level).
//
// Antes (pre-fase2b): 1 schema flat com enum PROXIMA_ACAO_VALUES (8 valores)
// pra todos os substates + validator pos-parse ALLOWED_BY_STATE rejeitando
// action invalida. Violava principio "estruturalmente impossivel errar".
//
// Spec Caminho C Fase 2 section 2.2.
import { z } from 'zod';

const PayloadPortfolio = z.object({
  estilo: z.string().nullable(),
  max: z.number().int().min(1).max(10),
  motivo: z.string().min(1),
});

// — Shape sentinel (campos null quando action nao usa o campo) —
function sentinelBranch(acao) {
  return z.object({
    proxima_acao: z.literal(acao),
    resposta_cliente: z.string().min(1),
    slot_inicio: z.null(),
    slot_fim: z.null(),
    valor_pedido_cliente: z.null(),
    payload_portfolio: z.null(),
  });
}

// ISO datetime prefix regex — usado em Tasks 3+4 para branches com slots
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// ─── PROPONDO_VALOR ────────────────────────────────────────────────────
const PV_Pergunta           = sentinelBranch('pergunta');
const PV_OferecendoHorario  = sentinelBranch('oferecendo_horario');
const PV_Adiou              = sentinelBranch('adiou');
const PV_Reagendamento      = sentinelBranch('reagendamento');
const PV_ClienteAgressivo   = sentinelBranch('cliente_agressivo');
const PV_Erro               = sentinelBranch('erro');

const PV_PediuDesconto = z.object({
  proxima_acao: z.literal('pediu_desconto'),
  resposta_cliente: z.string().min(1),
  slot_inicio: z.null(),
  slot_fim: z.null(),
  valor_pedido_cliente: z.number().positive(),
  payload_portfolio: z.null(),
});

const PV_EnviarPortfolio = z.object({
  proxima_acao: z.literal('enviar_portfolio'),
  resposta_cliente: z.string().min(1),
  slot_inicio: z.null(),
  slot_fim: z.null(),
  valor_pedido_cliente: z.null(),
  payload_portfolio: PayloadPortfolio,
});

export const PropostaPropondoValorSchema = z.discriminatedUnion('proxima_acao', [
  PV_Pergunta,
  PV_OferecendoHorario,
  PV_PediuDesconto,
  PV_Adiou,
  PV_Reagendamento,
  PV_ClienteAgressivo,
  PV_EnviarPortfolio,
  PV_Erro,
]);
