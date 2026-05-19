// functions/api/agent/agents/cadastro.js
// CadastroAgent — Caminho C Fase 2A. Funcao pura sem classe Agent.
// Espelha runTattooAgent da Fase 1 (Caminho C).
//
// Antes (pre-fase2a): builder pattern com @openai/agents SDK + validator
// pos-parse pra invariantes (handoff exige nome+data+email-or-recusado,
// formato ISO em data_nascimento). Mesmo padrao do TattooAgent pre-fase1
// que falsificou em 33% dos turnos criticos.
//
// Agora: openai SDK puro + Responses API + schema strict discriminated
// union (constrained decoding token-level). Handoff sem invariantes e
// estruturalmente impossivel. Validador residual unico (cross-field
// 'handoff sem email exige email_recusado=true') sera adicionado em
// route.js na Task 8. Contract extractCadastroHandoff
// (functions/_lib/agent-runtime/contracts/cadastro-handoff.js) valida
// shape do payload pos-extracao.
//
// LEGADO TRANSITORIO ATE TASK 8 (route.js migration):
// - buildCadastroAgent + LegacyCadastroOutputSchema continuam exportados
//   pq route.js linha 158 ainda chama builder({...}) pra estado='cadastro'.
//   Task 8 vai bifurcar route.js (espelhando o que Fase 1 fez pra tattoo)
//   e remover esses dois exports. NAO modifique buildCadastroAgent aqui —
//   spec do plan diz Task 7 nao toca route.js.
// - validateCadastroOutputInvariant idem: route.js consome via closure
//   retornada pelo builder. Removido na Task 8.
import { Agent } from '@openai/agents';
import { z } from 'zod';
import { runtime } from '../../../_lib/agent-runtime/runtime.js';
import { generatePromptColetaCadastro } from '../../../_lib/prompts/coleta/cadastro/generate.js';
import { CadastroOutputSchema as _StrictSchema } from './cadastro-schema.js';

// Re-export do schema strict novo (discriminated union 4 branches). Este
// e o schema PRIMARIO pos-Fase 2A — usado por runCadastroAgent abaixo.
// Tests/evals novos devem importar este (ou diretamente cadastro-schema.js).
export const CadastroOutputSchema = _StrictSchema;

// ── LEGACY: schema permissivo do path antigo (@openai/agents SDK) ──────
// Mantemos local porque buildCadastroAgent precisa de um ZodObject puro
// (sem discriminator) — @openai/agents rejeita discriminatedUnion via
// typeGuards.mjs:14 (vide spike Sub 1.D). Schema identico ao pre-Fase 2A
// — NAO mexer ate Task 8 deletar buildCadastroAgent.
//
// Eval-only fallback: @openai/agents SDK rejeita discriminatedUnion
// (typeGuards.mjs:14). Evals legados usam este permissivo até serem
// reescritos pra runCadastroAgent + runtime.run.
// CLEANUP: deletar quando evals migrarem.
export const LegacyCadastroOutputSchema = z.object({
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
  proxima_acao: z.enum(['pergunta', 'handoff', 'enviar_portfolio', 'erro']),
  payload_portfolio: z.object({
    estilo: z.string().nullable().default(null),
    max: z.number().int().min(1).max(10).nullable().default(null),
    motivo: z.string().nullable().default(null),
  }).nullable().default(null),
});

// LEGACY validator — chamado por route.js via closure do builder. Identico
// ao pre-Fase 2A. Sera deletado em Task 8 (schema strict + helper cross-field
// substituem todas as invariantes daqui).
export function validateCadastroOutputInvariant(out, clientContext = {}) {
  if (!out || typeof out !== 'object') {
    return { valid: false, reason: 'output ausente ou nao-objeto' };
  }

  const dn = out.dados_persistidos?.data_nascimento;
  if (out.proxima_acao !== 'enviar_portfolio' && dn && !/^\d{4}-\d{2}-\d{2}$/.test(dn)) {
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

  if (out.proxima_acao === 'enviar_portfolio') {
    if (!clientContext?.portfolio_disponivel) {
      return { valid: false, reason: 'enviar_portfolio com portfolio_disponivel=false' };
    }
    if (!out.payload_portfolio) {
      return { valid: false, reason: 'enviar_portfolio sem payload_portfolio' };
    }
  }

  return { valid: true };
}

// LEGACY builder — usado por router.js linha 12+21 e route.js linha 158.
// CLEANUP: deletar quando Task 8 migrar route.js pra runCadastroAgent.
export function buildCadastroAgent({ env, tenant, conversa, clientContext, baseUrl = 'http://localhost:8788' }) {
  const ctx = clientContext || {};
  const instructions = generatePromptColetaCadastro(tenant, conversa, ctx);

  const agent = new Agent({
    name: 'cadastro-agent',
    model: 'gpt-4o-mini',
    instructions,
    tools: [],
    outputType: LegacyCadastroOutputSchema,
  });
  const validator = (out) => validateCadastroOutputInvariant(out, ctx);
  return { agent, validator };
}

// ── NOVO (Fase 2A): runCadastroAgent — funcao pura sem classe Agent ────

function normalizeHistoryItem(item) {
  // historico de conversa: pode vir com role+content ja shapeado, ou com
  // shape do Supabase (autor='cliente'|'bot' + texto). Normaliza pra OpenAI.
  if (item.role && item.content != null) return { role: item.role, content: item.content };
  if (item.autor && item.texto != null) {
    return { role: item.autor === 'cliente' ? 'user' : 'assistant', content: item.texto };
  }
  return item;
}

export async function runCadastroAgent({
  env,
  tenant,
  conversa,
  clientContext,
  mensagem,
  historico,
  openaiClient,
}) {
  const ctx = clientContext || {};
  const instructions = generatePromptColetaCadastro(tenant, conversa, ctx);

  const input = [
    ...((historico || []).map(normalizeHistoryItem)),
    { role: 'user', content: mensagem },
  ];

  return await runtime.run({
    apiKey: env.OPENAI_API_KEY,
    openaiClient,
    model: 'gpt-4o-mini',
    instructions,
    input,
    outputSchema: CadastroOutputSchema,
    schemaName: 'cadastro_output',
  });
}
