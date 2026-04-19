// ── Endpoint — guardrails PRE (pré-LLM) ─────────────────────────────────────
// POST /api/tools/guardrails/pre
// Chamado pelo n8n ANTES de enviar mensagem pro agente LLM.
//
// Auth: X-Eval-Secret (mesmo do simular-conversa) OU X-Inkflow-Tool-Secret.
//
// Body:
//   {
//     "messages": [ {role:'user'|'assistant', content:'...'}, ... ],
//     "userMsg": "string (opcional — se não passar, pega última 'user' em messages)"
//   }
//
// Retorna:
//   {
//     "ok": true,
//     "bypass": bool,        // se true, n8n deve pular o agente e mandar reply direto
//     "reply": "string",      // resposta fixa pra enviar direto (presente só se bypass=true)
//     "nudge": "string",      // system msg pra injetar no prompt do agente (se bypass=false)
//     "guardrail": "string"   // tipo do guardrail que disparou (p/ logs)
//   }

import { toolJson, TOOL_HEADERS } from '../_tool-helpers.js';
import { runPreGuardrails } from '../../../_lib/guardrails.js';

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

  const { messages, userMsg } = input || {};
  if (!Array.isArray(messages) && !userMsg) {
    return toolJson({ ok: false, error: 'messages (array) ou userMsg (string) obrigatorio' }, 400);
  }

  const result = runPreGuardrails({ messages: messages || [], userMsg });
  return toolJson({ ok: true, ...result });
}
