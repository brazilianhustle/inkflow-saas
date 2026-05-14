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
    // tamanho_cm: paridade com validacao server-side (dados-coletados.js:235 rejeita <=0 ou >200).
    // altura_cm: max(250) = altura corporal humana max razoavel (refator 2026-05-13).
    tamanho_cm: z.number().positive().max(200).nullable().optional(),
    altura_cm: z.number().positive().max(250).nullable().optional(),
    local_corpo: z.string().nullable().optional(),
    cor_preferencia: z.string().nullable().optional(),
    descricao_curta: z.string().nullable().optional(),
    foto_local: z.string().nullable().optional(),
  }),
  dados_completos: z.boolean(),
  campos_faltando: z.array(z.string()),
  campos_conflitantes: z.array(z.string()),
  proxima_acao: z.enum(['pergunta', 'handoff', 'enviar_portfolio', 'erro']),
  // Sub-3.3: payload do envio de portfolio. Null em todas as ações exceto
  // 'enviar_portfolio'. Validado pos-parse via validateTattooOutputInvariant.
  payload_portfolio: z.object({
    estilo: z.string().nullable().default(null),
    max: z.number().int().min(1).max(10).nullable().default(null),
    motivo: z.string().nullable().default(null),
  }).nullable().default(null),
});

// Valida invariante handoff pos-parse. Retorna { valid: true } ou
// { valid: false, reason: string } pra route.js converter em HTTP 500.
//
// Sub-3.3: aceita 2o arg clientContext pra validar invariante
// 'enviar_portfolio' (requer portfolio_disponivel=true E payload_portfolio
// nao-null). Default {} mantem retrocompatibilidade com chamadas 1-arg.
export function validateTattooOutputInvariant(out, clientContext = {}) {
  if (!out || typeof out !== 'object') {
    return { valid: false, reason: 'output ausente ou nao-objeto' };
  }
  // Bloco handoff — 4 OBR completos (refator 2026-05-13 + manifesto tatuador-bot)
  if (out.proxima_acao === 'handoff') {
    const dat = out.dados_persistidos || {};
    const obrFaltando = [];
    if (!dat.descricao_curta?.trim()) obrFaltando.push('descricao_curta');
    if (!dat.local_corpo?.trim())     obrFaltando.push('local_corpo');
    if (!dat.estilo?.trim())          obrFaltando.push('estilo');
    if (dat.altura_cm == null)        obrFaltando.push('altura_cm');
    if (obrFaltando.length > 0) {
      return {
        valid: false,
        reason: 'handoff-sem-OBR-completos',
        details: `handoff bloqueado: OBR faltando=${obrFaltando.join(', ')}`,
      };
    }
    if (Array.isArray(out.campos_conflitantes) && out.campos_conflitantes.length > 0) {
      return { valid: false, reason: `handoff com campos_conflitantes nao-vazio: ${out.campos_conflitantes.join(',')}` };
    }
  }
  if (out.proxima_acao === 'enviar_portfolio') {
    if (!clientContext?.portfolio_disponivel) {
      return { valid: false, reason: 'enviar_portfolio com portfolio_disponivel=false' };
    }
    if (!out.payload_portfolio) {
      return { valid: false, reason: 'enviar_portfolio sem payload_portfolio' };
    }
  }
  // Sub-4.1 Bug #2: pergunta com campos faltando DEVE incluir '?' na resposta.
  // Camada 2 (safety net) — bug observado em smoke 09/05 nao reproduz mais
  // (10/10 runs eval pos refator history whitelist 19d9c17), validator
  // protege contra escapes futuros do modelo. Excecao: pergunta com
  // campos_faltando=[] (conflito puro, linhas 6/10/11) aceita resposta
  // declarativa sem '?'.
  if (out.proxima_acao === 'pergunta') {
    const faltando = Array.isArray(out.campos_faltando) ? out.campos_faltando : [];
    if (faltando.length > 0 && typeof out.resposta_cliente === 'string' && !out.resposta_cliente.includes('?')) {
      return {
        valid: false,
        reason: `pergunta com campos_faltando=[${faltando.join(',')}] mas resposta sem '?' — fragment="${out.resposta_cliente.slice(0, 80)}"`,
      };
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
  const ctx = clientContext || {};
  const instructions = generatePromptColetaTattoo(tenant, conversa, ctx);

  const agent = new Agent({
    name: 'tattoo-agent',
    model: 'gpt-4o-mini',
    instructions,
    tools: [],
    outputType: TattooOutputSchema,
  });
  // Closure-bound validator (paridade Sub-3.2): route.js chama validator(out)
  // com 1 arg, closure carrega clientContext pra invariant enviar_portfolio.
  const validator = (out) => validateTattooOutputInvariant(out, ctx);
  return { agent, validator };
}
