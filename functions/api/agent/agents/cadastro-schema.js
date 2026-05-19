// functions/api/agent/agents/cadastro-schema.js
// CadastroOutputSchema — discriminated union de 4 branches espelhando
// TattooOutputSchema da Fase 1 (proxima_acao=pergunta/handoff/enviar_portfolio/erro).
//
// Antes (pre-fase2a): ZodObject puro permissivo, invariantes validadas
// POS-parse via validateCadastroOutputInvariant.
//
// Agora: shape invalido estruturalmente impossivel via discriminator +
// z.literal() + .min/.max/regex/.length. Validador residual unico permanece
// pra invariante cross-field 'handoff sem email exige email_recusado=true'
// (codificada via 5 branches seria custo alto — spec section 2.1).
import { z } from 'zod';

const DadosParciais = z.object({
  nome: z.string().nullable(),
  data_nascimento: z.string().nullable(),
  email: z.string().nullable(),
});

const DadosHandoff = z.object({
  nome: z.string().min(1),
  data_nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  email: z.string().email().nullable(),
});

const PayloadPortfolio = z.object({
  estilo: z.string().nullable(),
  max: z.number().int().min(1).max(10),
  motivo: z.string().min(1),
});

const PerguntaOutput = z.object({
  proxima_acao: z.literal('pergunta'),
  resposta_cliente: z.string().min(1),
  dados_persistidos: DadosParciais,
  dados_completos: z.literal(false),
  campos_faltando: z.array(z.string()).min(1),
  campos_conflitantes: z.array(z.string()),
  email_recusado: z.boolean(),
  payload_portfolio: z.null(),
});

const HandoffOutput = z.object({
  proxima_acao: z.literal('handoff'),
  resposta_cliente: z.string().min(1),
  dados_persistidos: DadosHandoff,
  dados_completos: z.literal(true),
  campos_faltando: z.array(z.string()).length(0),
  campos_conflitantes: z.array(z.string()).length(0),
  email_recusado: z.boolean(),
  payload_portfolio: z.null(),
});

const EnviarPortfolioOutput = z.object({
  proxima_acao: z.literal('enviar_portfolio'),
  resposta_cliente: z.string().min(1),
  dados_persistidos: DadosParciais,
  dados_completos: z.boolean(),
  campos_faltando: z.array(z.string()),
  campos_conflitantes: z.array(z.string()),
  email_recusado: z.boolean(),
  payload_portfolio: PayloadPortfolio,
});

const ErroOutput = z.object({
  proxima_acao: z.literal('erro'),
  resposta_cliente: z.string().min(1),
  dados_persistidos: DadosParciais,
  dados_completos: z.literal(false),
  campos_faltando: z.array(z.string()),
  campos_conflitantes: z.array(z.string()),
  email_recusado: z.boolean(),
  payload_portfolio: z.null(),
});

export const CadastroOutputSchema = z.discriminatedUnion('proxima_acao', [
  PerguntaOutput,
  HandoffOutput,
  EnviarPortfolioOutput,
  ErroOutput,
]);
