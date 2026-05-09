// functions/api/agent/_lib/call-tool.js
// Wrapper fetch pras tools internas em functions/api/tools/*.js
// Side-effects ficam isoladas aqui (testavel via mock fetch).
// Auth: header X-Inkflow-Tool-Secret e OBRIGATORIO em TODAS as tools
// (validado em _tool-helpers.js contra env.INKFLOW_TOOL_SECRET).
export async function callTool(env, tool_name, body) {
  if (!env || !env.INKFLOW_TOOL_SECRET) {
    console.error(`[call-tool] env.INKFLOW_TOOL_SECRET ausente — ${tool_name} vai 401`);
    return { ok: false, status: 0, error: 'env-tool-secret-missing' };
  }
  const base = env.AGENT_INTERNAL_BASE_URL || 'http://localhost:8788';
  try {
    const r = await fetch(`${base}/api/tools/${tool_name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Inkflow-Tool-Secret': env.INKFLOW_TOOL_SECRET,
      },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, ...data };
  } catch (e) {
    console.error(`[call-tool] ${tool_name} threw:`, e);
    return { ok: false, status: 0, error: 'fetch-failed' };
  }
}
