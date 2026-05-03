// ── DEBUG: lista NOMES de env vars visíveis (NUNCA expõe valores) ─────────
// Endpoint TEMPORÁRIO pra debug. DELETAR APÓS USO.
// Sem auth — só expõe NOMES, e estamos pre-launch (zero tenants).
export async function onRequest(context) {
  const { env } = context;
  const allKeys = Object.keys(env || {}).sort();
  const telegramKeys = allKeys.filter(k => k.toLowerCase().includes('telegram'));

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
    all_keys: allKeys,
  }, null, 2), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
