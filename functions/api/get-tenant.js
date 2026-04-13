// ── InkFlow — Consulta segura de tenant (server-side) ──────────────────────
// POST /api/get-tenant
// Body: { tenant_id?, email?, evo_instance?, fields: "id,ativo,..." }
//
// AUTH: Requer uma das formas:
//   1. Busca por email → retorna só dados daquele email (self-service)
//   2. Busca por tenant_id + email → verifica que email é dono do tenant
//   3. Busca por evo_instance → retorna dados públicos (para reconnect.html)
//   4. Header Authorization: Bearer <supabase_jwt> de admin → acesso total

import { verifyOnboardingKey, verifyStudioTokenOrLegacy } from './_auth-helpers.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const ADMIN_EMAIL  = 'lmf4200@gmail.com';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Campos que o frontend pode consultar (evo_apikey REMOVIDO — passo 4)
const READABLE_FIELDS = new Set([
  'id', 'email', 'ativo', 'plano', 'mp_subscription_id',
  'status_pagamento', 'nome_estudio', 'nome_agente',
  'evo_instance', 'trial_ate', 'welcome_shown',
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

// [FIX AUDIT4 #1] Verifica JWT via Supabase Auth API (antes apenas decodificava sem verificar assinatura)
async function verifyAdmin(authHeader, supabaseKey) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  try {
    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: supabaseKey, Authorization: authHeader }
    });
    if (!userRes.ok) return false;
    const user = await userRes.json();
    return user.email === ADMIN_EMAIL;
  } catch { return false; }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const { tenant_id, email, evo_instance, fields, onboarding_key, studio_token } = body;

  if (!tenant_id && !email && !evo_instance) {
    return json({ error: 'tenant_id, email ou evo_instance obrigatório' }, 400);
  }

  // Validar tenant_id formato UUID
  if (tenant_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant_id)) {
    return json({ error: 'tenant_id inválido' }, 400);
  }

  // Validar email
  if (email && (!email.includes('@') || email.length > 254)) {
    return json({ error: 'email inválido' }, 400);
  }

  // [FIX AUDIT] Validar evo_instance (alfanumerico + hifen, max 64)
  if (evo_instance && !/^[a-zA-Z0-9_-]{1,64}$/.test(evo_instance)) {
    return json({ error: 'evo_instance inválido' }, 400);
  }

  // ── AUTH: verificar identidade ────────────────────────────────────────────
  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return json({ error: 'Configuração interna ausente' }, 503);

  const isAdmin = await verifyAdmin(request.headers.get('Authorization'), SUPABASE_KEY);

  // ── AUTH em camadas ──────────────────────────────────────────────────────
  // (1) Admin Bearer → acesso total a qualquer lookup
  // (2) onboarding_key + tenant_id → campos whitelist daquele tenant
  // (3) studio_token → campos whitelist daquele tenant
  // (4) evo_instance (sem auth) → campos publicos pra reconnect.html (legacy)
  // (5) email sozinho → apenas existence check: retorna id + ativo, nada mais
  let authorizedTenantId = null;
  if (isAdmin) authorizedTenantId = tenant_id || null;

  if (!authorizedTenantId && tenant_id && onboarding_key) {
    const ok = await verifyOnboardingKey({
      tenantId: tenant_id, onboardingKey: onboarding_key,
      supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY,
    });
    if (ok.ok) authorizedTenantId = tenant_id;
  }

  if (!authorizedTenantId && studio_token) {
    const verified = await verifyStudioTokenOrLegacy({
      token: studio_token,
      secret: env.STUDIO_TOKEN_SECRET,
      supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY,
    });
    if (verified && (!tenant_id || verified.tenantId === tenant_id)) {
      authorizedTenantId = verified.tenantId;
    }
  }

  // Filtrar campos pela whitelist
  const requestedFields = (fields || 'id,ativo').split(',').map(f => f.trim());
  const safeFields = requestedFields.filter(f => READABLE_FIELDS.has(f));
  if (safeFields.length === 0) safeFields.push('id');

  // Email-only: downgrade para existence check (id, ativo apenas)
  const EMAIL_ONLY_FIELDS = ['id', 'ativo'];
  const isEmailOnlyLookup = !authorizedTenantId && !evo_instance && email && !tenant_id;
  const isTenantIdOnlyLookup = !authorizedTenantId && !isAdmin && tenant_id && !email && !evo_instance;

  if (isTenantIdOnlyLookup) {
    return json({ error: 'autenticação requerida (onboarding_key ou studio_token)' }, 403);
  }

  let queryParam;
  let selectStr;
  if (authorizedTenantId) {
    queryParam = `id=eq.${encodeURIComponent(authorizedTenantId)}`;
    selectStr = safeFields.join(',');
  } else if (isEmailOnlyLookup) {
    queryParam = `email=eq.${encodeURIComponent(email)}`;
    selectStr = EMAIL_ONLY_FIELDS.join(',');
  } else if (evo_instance) {
    queryParam = `evo_instance=eq.${encodeURIComponent(evo_instance)}`;
    selectStr = safeFields.join(',');
  } else {
    return json({ error: 'parâmetros insuficientes ou não autorizados' }, 400);
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?${queryParam}&select=${selectStr}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!res.ok) {
      console.error('get-tenant error:', await res.text());
      return json({ error: 'Erro ao consultar tenant' }, 500);
    }
    const data = await res.json();
    return json({ tenants: data });
  } catch (err) {
    console.error('get-tenant exception:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}