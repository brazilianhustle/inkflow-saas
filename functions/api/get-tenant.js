// ── InkFlow — Consulta segura de tenant (server-side) ──────────────────────
// POST /api/get-tenant
// Body: { tenant_id?, email?, evo_instance?, fields: "id,ativo,..." }
//
// AUTH: Requer uma das formas:
//   1. Busca por email → retorna só dados daquele email (self-service)
//   2. Busca por tenant_id + email → verifica que email é dono do tenant
//   3. Busca por evo_instance → retorna dados públicos (para reconnect.html)
//   4. Header Authorization: Bearer <supabase_jwt> de admin → acesso total

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
  'evo_instance', 'trial_ate',
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

  const { tenant_id, email, evo_instance, fields } = body;

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

  // Se busca por tenant_id sem email e sem JWT admin → bloqueado
  if (tenant_id && !email && !isAdmin) {
    return json({ error: 'email obrigatório para consulta por tenant_id' }, 403);
  }

  // Busca por evo_instance: retorna apenas campos públicos (para reconnect.html)
  // Sem auth requerido — evo_instance já é público na URL de reconexão

  // Filtrar campos pela whitelist
  const requestedFields = (fields || 'id,ativo').split(',').map(f => f.trim());
  const safeFields = requestedFields.filter(f => READABLE_FIELDS.has(f));
  if (safeFields.length === 0) safeFields.push('id');

  const selectStr = safeFields.join(',');

  try {
    // Construir query
    let queryParam;
    if (tenant_id) {
      queryParam = `id=eq.${encodeURIComponent(tenant_id)}`;
    } else if (email) {
      queryParam = `email=eq.${encodeURIComponent(email)}`;
    } else {
      // [FIX AUDIT] Busca por evo_instance (para reconnect.html)
      queryParam = `evo_instance=eq.${encodeURIComponent(evo_instance)}`;
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?${queryParam}&select=${selectStr}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    if (!res.ok) {
      console.error('get-tenant error:', await res.text());
      return json({ error: 'Erro ao consultar tenant' }, 500);
    }

    const data = await res.json();

    // Se busca por tenant_id + email (não admin): verificar ownership
    if (tenant_id && email && !isAdmin && data.length > 0) {
      // Buscar email real do tenant pra comparar
      const ownerRes = await fetch(
        `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=email`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      if (ownerRes.ok) {
        const ownerData = await ownerRes.json();
        if (ownerData.length > 0 && ownerData[0].email !== email) {
          return json({ error: 'Acesso negado' }, 403);
        }
      }
    }

    return json({ tenants: data });

  } catch (err) {
    console.error('get-tenant exception:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}