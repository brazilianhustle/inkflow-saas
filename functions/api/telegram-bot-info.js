// ── Telegram Bot Info (publico, leve) ──────────────────────────────────────
// GET /api/telegram-bot-info
//
// Retorna { username } do bot configurado. Permite que o frontend (onboarding,
// studio) construa deep link `t.me/<username>?start=<key>` sem hardcode.
//
// Cache 1h pra reduzir chamadas a api.telegram.org/getMe.

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=3600',  // 1h CDN cache
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'GET') {
    return json({ error: 'method-not-allowed' }, 405);
  }

  const token = env.INKFLOW_TELEGRAM_BOT_TOKEN;
  if (!token) {
    return json({ error: 'bot-nao-configurado' }, 503);
  }

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    if (!r.ok) return json({ error: 'telegram-api-error' }, 502);
    const body = await r.json();
    if (!body.ok) return json({ error: 'telegram-resposta-invalida', detail: body.description }, 502);

    return json({
      username: body.result.username,
      first_name: body.result.first_name,
      can_join_groups: body.result.can_join_groups,
    });
  } catch (e) {
    return json({ error: 'fetch-failed', detail: String(e?.message || e) }, 500);
  }
}
