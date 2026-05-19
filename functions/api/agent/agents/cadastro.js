// functions/api/agent/agents/cadastro.js
// CadastroAgent — Caminho C Fase 2A (cleanup completo Fase 2B).
//
// Funcao pura sem classe Agent. Schema strict (discriminated union 4 branches)
// + Responses API + constrained decoding token-level. Handoff sem invariantes
// (nome+ISO+email-or-recusado) estruturalmente impossivel.
//
// Validador residual cross-field (handoff sem email exige email_recusado=true)
// vive em route.js (validateCadastroHandoffEmail).
//
// Cleanup Fase 2B: removidos LegacyCadastroOutputSchema, buildCadastroAgent,
// validateCadastroOutputInvariant (path antigo @openai/agents) — todos os
// callers migrados. Spec section 2.5 + decisao cravada 19/05 parte 2.
import { runtime } from '../../../_lib/agent-runtime/runtime.js';
import { generatePromptColetaCadastro } from '../../../_lib/prompts/coleta/cadastro/generate.js';
import { CadastroOutputSchema as _Schema } from './cadastro-schema.js';

export const CadastroOutputSchema = _Schema;

function normalizeHistoryItem(item) {
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
