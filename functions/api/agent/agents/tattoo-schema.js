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

// Sub-shape: uma entrada de analise por imagem (1:1 com imagens[i], na ordem recebida).
const AnaliseImagem = z.object({
  tipo: z.enum(['referencia', 'corpo', 'incerto']),
  descricao: z.string(),
  corpo_tem_tattoo: z.boolean(),   // so relevante se tipo='corpo'
  corpo_tem_marcacao: z.boolean(), // brush/caneta = posicao/tamanho, NAO tattoo existente
});

// Campos de visao compartilhados por TODOS os 4 branches do discriminated union.
// Strict mode (zodTextFormat) exige toda chave em `required`; semantica "opcional"
// vem do .nullable() (mesmo padrao dos opcionais ja existentes em DadosParciais).
const camposVisao = {
  analise_imagens: z.array(AnaliseImagem).nullable(),
  cobertura_suspeita: z.boolean().nullable(),
};

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
  ...camposVisao,
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
  ...camposVisao,
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
  ...camposVisao,
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
  ...camposVisao,
});

export const TattooOutputSchema = z.discriminatedUnion('proxima_acao', [
  PerguntaOutput,
  HandoffOutput,
  EnviarPortfolioOutput,
  ErroOutput,
]);
