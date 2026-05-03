// ── DEBUG: lista chaves de env vars visíveis (NUNCA expõe valores) ─────────
// Endpoint TEMPORÁRIO pra debug de env vars. DELETAR APÓS USO.
// Auth: query string `?key=...` que bate com INKFLOW_TOOL_SECRET
// (sabemos que esse env var funciona, então usamos ele como gate).

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const providedKey = url.searchParams.get('key') || '';
  if (providedKey !== env.INKFLOW_TOOL_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const allKeys = Object.keys(env || {}).sort();
  const telegramKeys = allKeys.filter(k => k.toLowerCase().includes('telegram'));

  // Pega APENAS metadados — nunca o valor real
  const summary = {};
  for (const k of telegramKeys) {
    const v = env[k];
    summary[k] = {
      type: typeof v,
      length: typeof v === 'string' ? v.length : null,
      first_3_chars: typeof v === 'string' && v.length > 0 ? v.substring(0, 3) : null,
      is_empty: typeof v === 'string' ? v.length === 0 : v === null || v === undefined,
    };
  }

  return new Response(JSON.stringify({
    total_env_keys: allKeys.length,
    telegram_keys_found: telegramKeys,
    telegram_summary: summary,
    all_keys: allKeys,  // Só os NOMES, nunca os valores
  }, null, 2), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
