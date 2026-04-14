// ── InkFlow — Helpers compartilhados das tools do agente IA ────────────────
// Auth: header X-Inkflow-Tool-Secret contra env.INKFLOW_TOOL_SECRET
// Todas as tools devem logar em tool_calls_log (observability).

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

export const TOOL_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Inkflow-Tool-Secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function toolJson(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: TOOL_HEADERS });
}

export function authTool(request, env) {
  const secret = env.INKFLOW_TOOL_SECRET;
  if (!secret) return { ok: false, reason: 'secret-missing' };
  const got = request.headers.get('X-Inkflow-Tool-Secret');
  if (!got || got !== secret) return { ok: false, reason: 'bad-secret' };
  return { ok: true };
}

function supaKey(env) {
  return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
}

export async function supaFetch(env, path, init = {}) {
  const key = supaKey(env);
  if (!key) throw new Error('SUPABASE_SERVICE_KEY ausente');
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

export async function logToolCall(env, row) {
  try {
    await supaFetch(env, '/rest/v1/tool_calls_log', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        tenant_id: row.tenant_id || null,
        telefone: row.telefone || null,
        tool: row.tool,
        input: row.input || null,
        output: row.output || null,
        sucesso: row.sucesso,
        latency_ms: row.latency_ms,
        erro: row.erro || null,
      }),
    });
  } catch (e) {
    console.error('logToolCall falhou:', e);
  }
}

// Wrapper: gerencia OPTIONS, auth, parse, timing, log, erros.
// handler recebe { env, input, context } e retorna { status?, body }.
export function withTool(toolName, handler) {
  return async (context) => {
    const { request, env } = context;
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: TOOL_HEADERS });
    }
    if (request.method !== 'POST') {
      return toolJson({ ok: false, error: 'method-not-allowed' }, 405);
    }
    const auth = authTool(request, env);
    if (!auth.ok) return toolJson({ ok: false, error: auth.reason }, 401);

    let input;
    try { input = await request.json(); }
    catch { return toolJson({ ok: false, error: 'invalid-json' }, 400); }

    const t0 = Date.now();
    let res, erro = null, sucesso = false;
    try {
      res = await handler({ env, input, context });
      sucesso = (res?.status ?? 200) < 400;
    } catch (e) {
      erro = String(e?.message || e);
      res = { status: 500, body: { ok: false, error: 'internal', detail: erro } };
    }
    const latency_ms = Date.now() - t0;

    context.waitUntil(logToolCall(env, {
      tenant_id: input?.tenant_id,
      telefone: input?.telefone,
      tool: toolName,
      input,
      output: res.body,
      sucesso,
      latency_ms,
      erro,
    }));

    return toolJson(res.body, res.status || 200);
  };
}
