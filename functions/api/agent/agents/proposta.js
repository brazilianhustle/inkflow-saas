// functions/api/agent/agents/proposta.js
// PropostaAgent — Caminho C Fase 2B. Funcao pura sem classe Agent.
//
// Antes (pre-fase2b): builder pattern com @openai/agents SDK + validator
// pos-parse ALLOWED_BY_STATE rejeitando action invalida pro substate. Mesma
// arquitetura que Tattoo/Cadastro pre-Fase 1/2A — falsificada (HTTP 500
// em violacoes, LLM produzindo action fora do permitido).
//
// Agora: openai SDK puro + Responses API + 3 schemas strict (1 por substate)
// onde ALLOWED_BY_STATE vira discriminator literal — LLM nao consegue
// emitir action proibida. SCHEMA_BY_STATE despacha. Sem validator pos-parse:
// invariantes context-dependent (slot em ctx, valor <= proposto, portfolio
// disponivel) extraidas pra contract proposta-actions.js (consumido pelo
// route.js apos parse).
//
// Spec Caminho C Fase 2 section 4.B + decisoes cravadas 19/05.
import { runtime } from '../../../_lib/agent-runtime/runtime.js';
import { generatePromptColetaProposta } from '../../../_lib/prompts/coleta/proposta/generate.js';
import { SCHEMA_BY_STATE } from './proposta-schema.js';

function normalizeHistoryItem(item) {
  // historico de conversa: pode vir com role+content ja shapeado, ou com
  // shape do Supabase (autor='cliente'|'bot' + texto). Normaliza pra OpenAI.
  if (item.role && item.content != null) return { role: item.role, content: item.content };
  if (item.autor && item.texto != null) {
    return { role: item.autor === 'cliente' ? 'user' : 'assistant', content: item.texto };
  }
  return item;
}

const SCHEMA_NAME_BY_STATE = {
  propondo_valor: 'proposta_propondo_valor',
  escolhendo_horario: 'proposta_escolhendo_horario',
  aguardando_sinal: 'proposta_aguardando_sinal',
};

export async function runPropostaAgent({
  env,
  tenant,
  conversa,
  clientContext,
  mensagem,
  historico,
  estado_atual,
  openaiClient,
}) {
  const schema = SCHEMA_BY_STATE[estado_atual];
  if (!schema) {
    throw new Error(`Estado proposta desconhecido: ${estado_atual}`);
  }
  const ctx = clientContext || {};
  const instructions = generatePromptColetaProposta(tenant, conversa, ctx);

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
    outputSchema: schema,
    schemaName: SCHEMA_NAME_BY_STATE[estado_atual],
  });
}
