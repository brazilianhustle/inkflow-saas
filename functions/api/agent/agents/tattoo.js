// TattooAgent — fase tattoo do fluxo Coleta v2.
// Importa prompt LITERAL de functions/_lib/prompts/coleta/tattoo/ (sem
// modificacao). Pure structured-output agent — sem tools.
//
// Decisoes cravadas (ver spec):
// - Modelo: gpt-4o-mini (paridade com baseline n8n)
// - Sem tools: estado e dados via dados_persistidos + proxima_acao no
//   structured output. Caller (route.js) le proxima_acao pra transicao
//   de estado (linha 128). Tools dados_coletados e handoff_to_cadastro
//   removidas (eram dual-via, causavam hallucination/loop em mini —
//   audit Fase 9, 2026-05-08).
// - Structured output via Zod com invariante handoff (validateTattooOutputInvariant)
// - Prompt portado SEM modificacao do PR #28 (R9, T7, altura_cm, foto_local)

import { Agent } from '@openai/agents';
import { z } from 'zod';
import { generatePromptColetaTattoo } from '../../../_lib/prompts/coleta/tattoo/generate.js';

// ── Schema do structured output ──────────────────────────────────────────
// IMPORTANTE: schema e ZodObject puro (sem .refine()). SDK @openai/agents
// detecta outputType via typeName==='ZodObject' (typeGuards.mjs:14) — qualquer
// .refine() vira ZodEffects e cai no fallback raw JSON Schema, que e rejeitado
// pelo Responses API com 400 'Missing required parameter: text.format.type'.
// Eval suite Task 5 (commit 617b9fc) capturou exatamente esse bug em produção.
//
// Invariante (handoff exige dados_completos=true E campos_conflitantes=[]) e
// validada pos-parse via validateTattooOutputInvariant — chamada por route.js
// depois de result.finalOutput.
export const TattooOutputSchema = z.object({
  resposta_cliente: z.string().min(1),
  // OpenAI Responses API exige fields nullable + optional juntos (ver
  // https://platform.openai.com/docs/guides/structured-outputs).
  // `.optional()` sozinho falha com "uses .optional() without .nullable()".
  dados_persistidos: z.object({
    estilo: z.string().nullable().optional(),
    // tamanho_cm/altura_cm: paridade com validacao server-side (dados-coletados.js:235 rejeita <=0 ou >200).
    tamanho_cm: z.number().positive().max(200).nullable().optional(),
    altura_cm: z.number().positive().max(200).nullable().optional(),
    local_corpo: z.string().nullable().optional(),
    cor_preferencia: z.string().nullable().optional(),
    descricao_curta: z.string().nullable().optional(),
    foto_local: z.string().nullable().optional(),
  }),
  dados_completos: z.boolean(),
  campos_faltando: z.array(z.string()),
  campos_conflitantes: z.array(z.string()),
  proxima_acao: z.enum(['pergunta', 'handoff', 'erro']),
});

// Valida invariante handoff pos-parse. Retorna { valid: true } ou
// { valid: false, reason: string } pra route.js converter em HTTP 500.
export function validateTattooOutputInvariant(out) {
  if (!out || typeof out !== 'object') {
    return { valid: false, reason: 'output ausente ou nao-objeto' };
  }
  if (out.proxima_acao === 'handoff') {
    if (out.dados_completos !== true) {
      return { valid: false, reason: 'handoff com dados_completos=false' };
    }
    if (Array.isArray(out.campos_conflitantes) && out.campos_conflitantes.length > 0) {
      return { valid: false, reason: `handoff com campos_conflitantes nao-vazio: ${out.campos_conflitantes.join(',')}` };
    }
  }
  return { valid: true };
}

// ── Builder ──────────────────────────────────────────────────────────────
// Pure structured-output agent (sem tools). Estado de handoff sai via
// proxima_acao='handoff' no output. route.js le e transiciona estado.
// Validacao de invariante (dados_completos+campos_conflitantes) feita
// em validateTattooOutputInvariant pos-finalOutput.
export function buildTattooAgent({ env, tenant, conversa, clientContext, baseUrl = 'http://localhost:8788' }) {
  const instructions = generatePromptColetaTattoo(tenant, conversa, clientContext || {});

  return new Agent({
    name: 'tattoo-agent',
    model: 'gpt-4o-mini',
    instructions,
    tools: [],
    outputType: TattooOutputSchema,
  });
}
