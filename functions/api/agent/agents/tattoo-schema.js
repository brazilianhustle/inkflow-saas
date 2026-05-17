// functions/api/agent/agents/tattoo-schema.js
// TattooOutputSchema — discriminated union de 4 branches.
//
// Antes (commit pre-fase1): schema era ZodObject puro permissivo,
// invariantes (handoff exige 4 OBR, dados_completos=true, etc) eram
// validadas POS-parse via validateTattooOutputInvariant. Output podia
// nascer invalido — virava HTTP 500 em 33% dos turnos criticos.
//
// Agora (Fase 1 Caminho C): discriminator='proxima_acao'. Cada branch
// forca shape consistente via z.literal() + min/max/nullable conditional.
// Schema strict no Responses API (constrained decoding token-level)
// torna output invalido estruturalmente impossivel.
//
// Nota: o schema e a discriminated union NUA. O runtime.js wrappa em
// z.object({ output: schema }) antes de enviar pro OpenAI (strict mode
// exige root type=object). Caller recebe shape identico a este.
import { z } from 'zod';

// Sub-shape: dados quando handoff NAO foi atingido (todos nullable)
const DadosParciais = z.object({
  descricao_curta: z.string().nullable(),
  local_corpo: z.string().nullable(),
  altura_cm: z.number().positive().max(250).nullable(),
  estilo: z.string().nullable(),
  tamanho_cm: z.number().positive().max(200).nullable(),
  cor_preferencia: z.string().nullable(),
  foto_local: z.string().nullable(),
});

// Sub-shape: dados no handoff (4 OBR obrigatorios non-nullable)
const DadosHandoff = z.object({
  descricao_curta: z.string().min(1),
  local_corpo: z.string().min(1),
  altura_cm: z.number().positive().max(250),
  estilo: z.string().min(1),
  tamanho_cm: z.number().positive().max(200).nullable(),
  cor_preferencia: z.string().nullable(),
  foto_local: z.string().nullable(),
});

// Sub-shape: payload portfolio
const PayloadPortfolio = z.object({
  estilo: z.string().nullable(),
  max: z.number().int().min(1).max(10),
  motivo: z.string().min(1),
});

// ─── Branch 1: pergunta ────────────────────────────────────────────────
const PerguntaOutput = z.object({
  proxima_acao: z.literal('pergunta'),
  resposta_cliente: z.string().min(1),
  dados_persistidos: DadosParciais,
  dados_completos: z.literal(false),
  campos_faltando: z.array(z.string()).min(1),
  campos_conflitantes: z.array(z.string()),
  payload_portfolio: z.null(),
});

// ─── Branch 2: handoff ─────────────────────────────────────────────────
const HandoffOutput = z.object({
  proxima_acao: z.literal('handoff'),
  resposta_cliente: z.string().min(1),
  dados_persistidos: DadosHandoff,
  dados_completos: z.literal(true),
  campos_faltando: z.array(z.string()).length(0),
  campos_conflitantes: z.array(z.string()).length(0),
  payload_portfolio: z.null(),
});

// ─── Branch 3: enviar_portfolio ────────────────────────────────────────
const EnviarPortfolioOutput = z.object({
  proxima_acao: z.literal('enviar_portfolio'),
  resposta_cliente: z.string().min(1),
  dados_persistidos: DadosParciais,
  dados_completos: z.boolean(),
  campos_faltando: z.array(z.string()),
  campos_conflitantes: z.array(z.string()),
  payload_portfolio: PayloadPortfolio,
});

// ─── Branch 4: erro ────────────────────────────────────────────────────
const ErroOutput = z.object({
  proxima_acao: z.literal('erro'),
  resposta_cliente: z.string().min(1),
  dados_persistidos: DadosParciais,
  dados_completos: z.literal(false),
  campos_faltando: z.array(z.string()),
  campos_conflitantes: z.array(z.string()),
  payload_portfolio: z.null(),
});

export const TattooOutputSchema = z.discriminatedUnion('proxima_acao', [
  PerguntaOutput,
  HandoffOutput,
  EnviarPortfolioOutput,
  ErroOutput,
]);
