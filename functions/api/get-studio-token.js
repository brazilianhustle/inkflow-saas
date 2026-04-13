// ── InkFlow — Gera studio_token HMAC para dono do estúdio (pós-onboarding) ──
// POST /api/get-studio-token
// Body: { tenant_id, onboarding_key }
// Resposta: { token, link, expires_at }
//
// Auth: onboarding_key DEVE bater com tenants.onboarding_key (prova de posse).
// Uso: frontend do onboarding chama este endpoint após ativacao para redirecionar
// o dono do estudio para /studio.html?token=... sem depender de email.

import { generateStudioToken, verifyOnboardingKey } from './_auth-helpers.js';

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
  catch { return json({ error: 'JSON inválido' }, 400); }

  const { tenant_id, onboarding_key } = body;
  if (!tenant_id || !onboarding_key) {
    return json({ error: 'tenant_id e onboarding_key obrigatórios' }, 400);
  }

  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  const TOKEN_SECRET = env.STUDIO_TOKEN_SECRET;
  if (!SB_KEY || !TOKEN_SECRET) return json({ error: 'Configuração interna ausente' }, 503);

  // Verifica posse do link de onboarding
  const ownership = await verifyOnboardingKey({
    tenantId: tenant_id,
    onboardingKey: onboarding_key,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SB_KEY,
  });
  if (!ownership.ok) {
    console.warn(`get-studio-token: auth rejeitada tenant_id=${tenant_id} reason=${ownership.reason}`);
    return json({ error: 'Autenticação falhou' }, 403);
  }

  // Verifica que o plano elegivel e que esta ativo
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=plano,ativo`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!r.ok) return json({ error: 'Erro ao verificar tenant' }, 500);
    const rows = await r.json();
    if (!rows?.[0]) return json({ error: 'Tenant não encontrado' }, 404);
    const t = rows[0];
    if (!['estudio', 'premium'].includes(t.plano)) {
      return json({ error: 'Plano não elegível para painel de estúdio' }, 400);
    }
    if (!t.ativo) {
      return json({ error: 'Tenant ainda não ativo — conclua o onboarding' }, 403);
    }
  } catch (e) {
    console.error('get-studio-token: erro ao verificar tenant:', e?.message);
    return json({ error: 'Erro interno' }, 500);
  }

  // Gera token HMAC (TTL 30d)
  let token;
  try {
    token = await generateStudioToken(tenant_id, TOKEN_SECRET);
  } catch (e) {
    console.error('get-studio-token: falha ao gerar:', e?.message);
    return json({ error: 'Falha ao gerar token' }, 500);
  }

  const link = `https://inkflowbrasil.com/studio.html?token=${token}&welcome=true`;
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 86400;
  return json({ token, link, expires_at: expiresAt });
}
