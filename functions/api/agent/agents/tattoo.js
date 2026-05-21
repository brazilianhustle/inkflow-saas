// functions/api/agent/agents/tattoo.js
// TattooAgent — Caminho C Fase 1. Funcao pura sem classe Agent.
//
// Antes (pre-fase1): builder pattern com @openai/agents SDK, validator
// pos-parse pra invariante handoff (4 OBR). HTTP 500 em 33% dos turnos
// criticos R9 (eval Sub 1.B/1.C falsificou que prompt ou modelo maior
// resolviam). Spike Sub 1.D falsificou @openai/agents SDK (rejeita
// discriminatedUnion via typeGuards.mjs:14).
//
// Agora: openai SDK puro + Responses API + schema strict discriminated
// union (constrained decoding token-level). Handoff sem 4 OBR e
// estruturalmente impossivel.
//
// Padrao spec Caminho C Fase 1 secao 4 — replicavel pros 2 agents
// restantes na Fase 2.
import { runtime } from '../../../_lib/agent-runtime/runtime.js';
import { generatePromptColetaTattoo } from '../../../_lib/prompts/coleta/tattoo/generate.js';
import { TattooOutputSchema as _Schema } from './tattoo-schema.js';

// Re-export pra compat com tests existentes (removido apos limpeza de callers
// na Fase 2). tests/agent/tattoo-agent.test.mjs ainda importa o schema legado.
export const TattooOutputSchema = _Schema;

// Re-export do validator antigo durante a transicao. Pos Caminho C Fase 1
// route.js NAO chama mais validator pro estado tattoo (schema strict garante
// invariantes). Mantemos exportado pra nao quebrar imports legados.
// CLEANUP: remover na Fase 2 quando todos os 3 agents estiverem migrados.
export function validateTattooOutputInvariant(out, _clientContext = {}) {
  if (!out || typeof out !== 'object') return { valid: false, reason: 'output ausente' };
  return { valid: true };
}

function normalizeHistoryItem(item) {
  // historico de conversa: pode vir com role+content ja shapeado, ou com
  // shape do Supabase (autor='cliente'|'bot' + texto). Normaliza pra OpenAI.
  if (item.role && item.content != null) return { role: item.role, content: item.content };
  if (item.autor && item.texto != null) {
    return { role: item.autor === 'cliente' ? 'user' : 'assistant', content: item.texto };
  }
  return item;
}

// Cap de imagens enviadas ao modelo por turno (custo). A pipeline tambem capa
// no envio; este cap e defesa-em-profundidade no render do content.
const MAX_IMAGENS_VISAO = 4;

export async function runTattooAgent({
  env,
  tenant,
  conversa,
  clientContext,
  mensagem,
  historico,
  imagens,
  openaiClient,
}) {
  const ctx = clientContext || {};
  const instructions = generatePromptColetaTattoo(tenant, conversa, ctx);

  // Content do turno ATUAL: array multimodal so quando ha imagens neste turno.
  // Turnos seguintes nao re-enviam imagem (historico carrega comentario + descricao).
  const imgs = Array.isArray(imagens) ? imagens.slice(0, MAX_IMAGENS_VISAO) : [];
  const turnoContent = imgs.length > 0
    ? [
        { type: 'input_text', text: mensagem },
        ...imgs.map((img) => ({
          type: 'input_image',
          image_url: `data:${img.mimetype};base64,${img.base64}`,
          detail: 'low',
        })),
      ]
    : mensagem;

  const input = [
    ...((historico || []).map(normalizeHistoryItem)),
    { role: 'user', content: turnoContent },
  ];

  return await runtime.run({
    apiKey: env.OPENAI_API_KEY,
    openaiClient,
    model: 'gpt-4o-mini',
    instructions,
    input,
    outputSchema: TattooOutputSchema,
    schemaName: 'tattoo_output',
  });
}
