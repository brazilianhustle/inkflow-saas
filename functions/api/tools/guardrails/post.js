// ── Endpoint — guardrails POST (pós-LLM) ────────────────────────────────────
// POST /api/tools/guardrails/post
// Chamado pelo n8n DEPOIS do agente gerar a resposta.
//
// Auth: X-Eval-Secret OU X-Inkflow-Tool-Secret.
//
// Body:
//   {
//     "reply": "string — resposta crua do agente",
//     "toolResult": { ... } | null,  // resultado da última chamada de calcular_orcamento
//                                    // (se o agente chamou a tool neste turno)
//     "messages": [...]              // histórico pra validar preços anteriores
//   }
//
// Retorna:
//   {
//     "ok": true,
//     "reply": "string",            // reply FINAL (possivelmente substituída se inválida)
//     "changed": bool,               // true se a reply foi alterada pelo guardrail
//     "guardrail": "string"          // tipo do guardrail que disparou (p/ logs)
//   }

import { toolJson, TOOL_HEADERS } from '../_tool-helpers.js';
import { runPostGuardrails } from '../../../_lib/guardrails.js';

function authorized(request, env) {
  const evalSecret = request.headers.get('X-Eval-Secret');
  if (evalSecret && env.EVAL_SECRET && evalSecret === env.EVAL_SECRET) return true;
  const toolSecret = request.headers.get('X-Inkflow-Tool-Secret');
  if (toolSecret && env.INKFLOW_TOOL_SECRET && toolSecret === env.INKFLOW_TOOL_SECRET) return true;
  return false;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: TOOL_HEADERS });
  if (request.method !== 'POST') return toolJson({ ok: false, error: 'method-not-allowed' }, 405);

  if (!authorized(request, env)) return toolJson({ ok: false, error: 'unauthorized' }, 401);

  let input;
  try { input = await request.json(); }
  catch { return toolJson({ ok: false, error: 'invalid-json' }, 400); }

  const { reply, toolResult, messages } = input || {};
  if (typeof reply !== 'string') {
    return toolJson({ ok: false, error: 'reply (string) obrigatorio' }, 400);
  }

  const result = runPostGuardrails({
    reply,
    toolResult: toolResult || null,
    messages: Array.isArray(messages) ? messages : [],
  });

  return toolJson({
    ok: true,
    reply: result.reply,
    changed: result.reply !== reply,
    ...(result.guardrail ? { guardrail: result.guardrail } : {}),
  });
}
