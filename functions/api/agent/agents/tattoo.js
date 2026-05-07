// TattooAgent — fase tattoo do fluxo Coleta v2.
// Importa prompt LITERAL de functions/_lib/prompts/coleta/tattoo/ (sem
// modificacao). Tools whitelist: dados_coletados (existente) +
// handoff_to_cadastro (nova em Sub-1).
//
// Decisoes cravadas (ver spec):
// - Modelo: gpt-4o-mini (paridade com baseline n8n)
// - Tools restritas: 2 tools whitelist, outras 12 ficam pros agents Cadastro/Proposta/Portfolio em Sub-2
// - Structured output via Zod com invariante handoff
// - Prompt portado SEM modificacao do PR #28 (R9, T7, altura_cm, foto_local)

import { Agent, tool } from '@openai/agents';
import { z } from 'zod';
import { generatePromptColetaTattoo } from '../../../_lib/prompts/coleta/tattoo/generate.js';

const REFORCO_HANDOFF = `

# §HANDOFF — INVARIANTE CRITICO
JAMAIS chame \`handoff_to_cadastro\` quando \`dados_completos=false\` ou quando houver \`campos_conflitantes\` nao-vazio. O schema validara e rejeitara — voce voltara a perguntar. Resolva conflitos primeiro (R9: devolva contradicao ao cliente, NUNCA decida por ele).`;

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

// ── Tools (HTTP proxies) ──────────────────────────────────────────────────
// As tools no SDK chamam o endpoint HTTP existente. Sub-1 usa fetch direto
// pra functions internas. INKFLOW_TOOL_SECRET no env autentica.
function buildToolDadosColetados({ env, tenant_id, telefone, baseUrl }) {
  return tool({
    name: 'dados_coletados',
    description: 'Persiste 1 campo coletado da tattoo. Chame uma vez por campo (descricao_tattoo, tamanho_cm, local_corpo, estilo, foto_local, refs_imagens).',
    parameters: z.object({
      campo: z.enum(['descricao_tattoo', 'tamanho_cm', 'local_corpo', 'estilo', 'foto_local', 'refs_imagens']),
      valor: z.union([z.string(), z.number(), z.array(z.string())]),
    }),
    execute: async ({ campo, valor }) => {
      let res;
      try {
        res = await fetch(`${baseUrl}/api/tools/dados-coletados`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Inkflow-Tool-Secret': env.INKFLOW_TOOL_SECRET,
          },
          body: JSON.stringify({ tenant_id, telefone, campo, valor }),
        });
      } catch (e) {
        return { ok: false, error: `tool-network-error: ${e?.message || e}` };
      }
      if (!res.ok) return { ok: false, error: `tool-http-${res.status}` };
      try {
        return await res.json();
      } catch {
        return { ok: false, error: 'tool-bad-json' };
      }
    },
  });
}

function buildToolHandoffToCadastro({ env, tenant_id, telefone, baseUrl }) {
  return tool({
    name: 'handoff_to_cadastro',
    description: 'Sinaliza fim da fase tattoo e transicao pra fase cadastro. Chame APENAS quando dados_completos=true E campos_conflitantes=[].',
    parameters: z.object({
      dados_completos: z.boolean(),
      campos_conflitantes: z.array(z.string()),
    }),
    execute: async ({ dados_completos, campos_conflitantes }) => {
      let res;
      try {
        res = await fetch(`${baseUrl}/api/tools/handoff-to-cadastro`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Inkflow-Tool-Secret': env.INKFLOW_TOOL_SECRET,
          },
          body: JSON.stringify({ tenant_id, telefone, dados_completos, campos_conflitantes }),
        });
      } catch (e) {
        return { ok: false, error: `tool-network-error: ${e?.message || e}` };
      }
      if (!res.ok) return { ok: false, error: `tool-http-${res.status}` };
      try {
        return await res.json();
      } catch {
        return { ok: false, error: 'tool-bad-json' };
      }
    },
  });
}

// ── Builder ──────────────────────────────────────────────────────────────
export function buildTattooAgent({ env, tenant, conversa, clientContext, baseUrl = 'http://localhost:8788' }) {
  const promptBase = generatePromptColetaTattoo(tenant, conversa, clientContext || {});
  const instructions = promptBase + REFORCO_HANDOFF;

  const tenant_id = tenant.id;
  const telefone = conversa.telefone || conversa.cliente_telefone || '';

  const tools = [
    buildToolDadosColetados({ env, tenant_id, telefone, baseUrl }),
    buildToolHandoffToCadastro({ env, tenant_id, telefone, baseUrl }),
  ];

  return new Agent({
    name: 'tattoo-agent',
    model: 'gpt-4o-mini',
    instructions,
    tools,
    outputType: TattooOutputSchema,
  });
}
