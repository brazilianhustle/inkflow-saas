// ── InkFlow — Self-checkout público (gera onboarding_key sem auth admin) ──
// POST /api/public-start
// Body: { plano: "individual"|"estudio"|"premium"|"teste" }
// Resposta: { key, url }
//
// Diferente de /api/create-onboarding-link (requer admin), este endpoint é
// PÚBLICO — qualquer visitante do site pode clicar "Começar" e ganhar uma
// key válida por 24h. Proteção: Cloudflare WAF rate limit (3 req/10s/IP).
//
// Segurança:
// - Key gerada com crypto.randomUUID() (36 chars, impossível adivinhar)
// - TTL curto (24h) — se cliente não completar, key expira
// - NÃO envia email, não coleta dados nesta etapa
// - Validate-onboarding-key já valida used/expired/retry

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON invalido' }, 400); }

  const plano = body?.plano;
  const VALID_PLANS = ['teste', 'individual', 'estudio', 'premium'];
  if (!VALID_PLANS.includes(plano)) {
    return json({ error: 'Plano invalido' }, 400);
  }

  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return json({ error: 'Configuracao interna ausente' }, 503);

  // Gera key aleatória (36 chars — mais forte que 8 chars manual do admin)
  const key = crypto.randomUUID();
  // TTL 24h
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/onboarding_links`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        key,
        plano,
        used: false,
        expires_at: expiresAt,
        // email fica null — cliente preenche no form de onboarding
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('public-start: insert error:', err);
      return json({ error: 'Erro ao criar link' }, 500);
    }

    const url = `https://inkflowbrasil.com/onboarding?token=${key}`;
    return json({ ok: true, key, url, plano, expires_at: expiresAt });
  } catch (e) {
    console.error('public-start exception:', e?.message);
    return json({ error: 'Erro interno' }, 500);
  }
}
