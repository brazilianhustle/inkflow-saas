// ── Check Telegram Connected (polling endpoint do onboarding) ──────────────
// GET /api/check-telegram-connected?onboarding_key=<key>
//
// Onboarding UI faz polling neste endpoint enquanto mostra o QR. Quando o
// tatuador escaneia o QR + clica /start, o webhook /api/telegram/webhook
// salva chat_id em tenants.tatuador_telegram_chat_id. Este endpoint
// retorna { connected: true, username } assim que isso acontece.
//
// Resposta:
// - { connected: true, username: '@lina_tat' }   — conectado
// - { connected: false }                          — ainda nao conectado
// - 400 se onboarding_key ausente/invalida
// - 404 se tenant nao encontrado pra essa key

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
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

  const url = new URL(request.url);
  const key = url.searchParams.get('onboarding_key');
  if (!key) return json({ error: 'onboarding_key obrigatorio' }, 400);
  if (key.length < 10 || key.length > 200) return json({ error: 'onboarding_key invalido' }, 400);

  const supaKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return json({ error: 'config-ausente' }, 503);

  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/tenants?onboarding_key=eq.${encodeURIComponent(key)}` +
    '&select=tatuador_telegram_chat_id,tatuador_telegram_username',
    { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } }
  );

  if (!r.ok) return json({ error: 'db-error' }, 500);
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return json({ error: 'tenant-nao-encontrado' }, 404);
  }

  const tenant = rows[0];
  const connected = !!tenant.tatuador_telegram_chat_id;
  return json({
    connected,
    username: connected ? tenant.tatuador_telegram_username : null,
  });
}
