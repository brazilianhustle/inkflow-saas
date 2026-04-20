// ── Endpoint — guardrails POST (pós-LLM) ────────────────────────────────────
// POST /api/tools/guardrails/post
// Chamado pelo n8n DEPOIS do agente gerar a resposta.
//
// Auth: X-Eval-Secret OU X-Inkflow-Tool-Secret.
//
// Body (todas as opções opcionais exceto reply):
//   {
//     "reply": "string — resposta crua do agente",
//     "toolResult": { ... } | null,  // resultado de calcular_orcamento passado
//                                    //  explicitamente (para simulador/evals)
//     "messages": [...],             // histórico pra validar preços anteriores
//     "tenant_id": "uuid",           // se passado junto com telefone, endpoint
//     "telefone": "5561...",         //  busca último calcular_orcamento sozinho
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

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

function authorized(request, env) {
  const evalSecret = request.headers.get('X-Eval-Secret');
  if (evalSecret && env.EVAL_SECRET && evalSecret === env.EVAL_SECRET) return true;
  const toolSecret = request.headers.get('X-Inkflow-Tool-Secret');
  if (toolSecret && env.INKFLOW_TOOL_SECRET && toolSecret === env.INKFLOW_TOOL_SECRET) return true;
  return false;
}

// Busca o último resultado de calcular_orcamento nos últimos N minutos pra
// este tenant+telefone. Retorna null se nada encontrado ou erro.
async function fetchLatestToolResult(env, tenant_id, telefone, windowMinutes = 5) {
  const sbKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return null;
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const url = `${SUPABASE_URL}/rest/v1/tool_calls_log?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}&tool=eq.calcular_orcamento&created_at=gte.${encodeURIComponent(cutoff)}&select=output&order=created_at.desc&limit=1`;
  try {
    const r = await fetch(url, {
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0]?.output || null;
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: TOOL_HEADERS });
  if (request.method !== 'POST') return toolJson({ ok: false, error: 'method-not-allowed' }, 405);

  if (!authorized(request, env)) return toolJson({ ok: false, error: 'unauthorized' }, 401);

  let input;
  try { input = await request.json(); }
  catch { return toolJson({ ok: false, error: 'invalid-json' }, 400); }

  const { reply, toolResult, messages, tenant_id, telefone } = input || {};
  if (typeof reply !== 'string') {
    return toolJson({ ok: false, error: 'reply (string) obrigatorio' }, 400);
  }

  // Se toolResult nao foi passado mas temos tenant+telefone, busca do log.
  let effectiveToolResult = toolResult || null;
  if (!effectiveToolResult && tenant_id && telefone) {
    effectiveToolResult = await fetchLatestToolResult(env, tenant_id, telefone);
  }

  const result = runPostGuardrails({
    reply,
    toolResult: effectiveToolResult,
    messages: Array.isArray(messages) ? messages : [],
  });

  return toolJson({
    ok: true,
    reply: result.reply,
    changed: result.reply !== reply,
    ...(result.guardrail ? { guardrail: result.guardrail } : {}),
    ...(effectiveToolResult ? { used_tool_result: true } : {}),
  });
}
