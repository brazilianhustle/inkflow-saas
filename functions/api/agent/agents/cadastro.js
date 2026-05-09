// functions/api/agent/agents/cadastro.js
// CadastroAgent — fase cadastro do fluxo Coleta v2 (Sub-3.1).
// Importa prompt LITERAL de functions/_lib/prompts/coleta/cadastro/ via
// generatePromptColetaCadastro. Pure structured-output agent — sem tools.
//
// Decisoes cravadas (ver spec 2026-05-08-sub3-cadastro-prompt-v2-design.md):
// - Modelo: gpt-4o-mini (paridade Sub-2)
// - Sem tools: estado e dados via dados_persistidos + proxima_acao no
//   structured output. Tools dados_coletados, enviar_orcamento_tatuador,
//   acionar_handoff removidas (eram dual-via, audit Fase 9 2026-05-08).
// - Validacao idade pos-output em route.js (helper enforceMenorIdade) —
//   agent NAO calcula idade (pattern Sub-2: agent decide intent + estrutura).
// - Schema ZodObject puro (sem .refine()/.transform() — viram ZodEffects
//   e Responses API rejeita 400). Bug confirmado em Sub-2.

import { Agent } from '@openai/agents';
import { z } from 'zod';
import { generatePromptColetaCadastro } from '../../../_lib/prompts/coleta/cadastro/generate.js';

// ── Schema do structured output ──────────────────────────────────────────
// Diff vs TattooOutputSchema:
// - 3 campos em dados_persistidos (nome/data_nascimento/email) vs 7 do Tattoo
// - email_recusado: boolean — flag nova (sempre setada). Sinaliza opt-out.
// - dados_completos=true exige nome E data_nascimento populados E
//   (email populado OU email_recusado=true).
//
// SEM regex em data_nascimento: schema fica ZodObject puro. Formato ISO
// validado pos-output em validateCadastroOutputInvariant. Se mini emitir
// formato errado, route.js silently force proxima_acao='pergunta'.
export const CadastroOutputSchema = z.object({
  resposta_cliente: z.string().min(1),
  dados_persistidos: z.object({
    nome: z.string().nullable().optional(),
    data_nascimento: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
  }),
  dados_completos: z.boolean(),
  campos_faltando: z.array(z.string()),
  campos_conflitantes: z.array(z.string()),
  email_recusado: z.boolean(),
  proxima_acao: z.enum(['pergunta', 'handoff', 'erro']),
});

// Valida invariante pos-parse. Retorna { valid: true } ou
// { valid: false, reason: string } pra route.js converter em HTTP 500
// OU silently force pergunta (caso especial: data_nascimento nao-ISO).
export function validateCadastroOutputInvariant(out) {
  if (!out || typeof out !== 'object') {
    return { valid: false, reason: 'output ausente ou nao-objeto' };
  }

  // Validacao pos-output do formato ISO de data_nascimento.
  // Se mini emitir formato errado (ex: "12/03/1995"), route.js silently
  // force pergunta — fluxo continua sem 500.
  const dn = out.dados_persistidos?.data_nascimento;
  if (dn && !/^\d{4}-\d{2}-\d{2}$/.test(dn)) {
    return { valid: false, reason: `data_nascimento nao-ISO: ${dn}` };
  }

  if (out.proxima_acao === 'handoff') {
    if (out.dados_completos !== true) {
      return { valid: false, reason: 'handoff com dados_completos=false' };
    }
    if (!out.dados_persistidos?.nome) {
      return { valid: false, reason: 'handoff sem nome' };
    }
    if (!out.dados_persistidos?.data_nascimento) {
      return { valid: false, reason: 'handoff sem data_nascimento' };
    }
    if (!out.dados_persistidos?.email && out.email_recusado !== true) {
      return { valid: false, reason: 'handoff sem email nem email_recusado=true' };
    }
    if (Array.isArray(out.campos_conflitantes) && out.campos_conflitantes.length > 0) {
      return { valid: false, reason: `handoff com campos_conflitantes: ${out.campos_conflitantes.join(',')}` };
    }
  }

  return { valid: true };
}

// ── Builder ──────────────────────────────────────────────────────────────
export function buildCadastroAgent({ env, tenant, conversa, clientContext, baseUrl = 'http://localhost:8788' }) {
  const instructions = generatePromptColetaCadastro(tenant, conversa, clientContext || {});

  const agent = new Agent({
    name: 'cadastro-agent',
    model: 'gpt-4o-mini',
    instructions,
    tools: [],
    outputType: CadastroOutputSchema,
  });
  const validator = (out) => validateCadastroOutputInvariant(out);
  return { agent, validator };
}
