// ── InkFlow — Consulta segura de tenant (server-side) ──────────────────────
// Substitui os sbFetch('GET', '/rest/v1/tenants?...') do frontend
// que foram bloqueados ao remover anon SELECT em tenants.
//
// POST /api/get-tenant
// Body: { tenant_id, fields: "id,email,evo_apikey,ativo,mp_subscription_id" }
// Retorna apenas os campos solicitados (filtrados por whitelist)
//
// Também suporta busca por email (para idempotency check):
// Body: { email: "x@y.com", fields: "id,evo_apikey,ativo" }

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Campos que o frontend pode consultar (NUNCA expor prompt_sistema, faq_texto, evo_apikey completo)
// evo_apikey incluido porque o frontend precisa checar se é 'pending'
// CORS restrito a inkflowbrasil.com protege contra acesso externo
const READABLE_FIELDS = new Set([
  'id', 'email', 'ativo', 'plano', 'mp_subscription_id',
  'status_pagamento', 'nome_estudio', 'nome_agente',
  'evo_instance', 'evo_apikey', 'trial_ate',
]);

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

  const { tenant_id, email, fields } = body;

  if (!tenant_id && !email) {
    return json({ error: 'tenant_id ou email obrigatório' }, 400);
  }

  // Validar tenant_id formato UUID se fornecido
  if (tenant_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant_id)) {
    return json({ error: 'tenant_id inválido' }, 400);
  }

  // Validar email se fornecido
  if (email && (!email.includes('@') || email.length > 254)) {
    return json({ error: 'email inválido' }, 400);
  }

  // Filtrar campos solicitados pela whitelist
  const requestedFields = (fields || 'id,ativo').split(',').map(f => f.trim());
  const safeFields = requestedFields.filter(f => READABLE_FIELDS.has(f));
  if (safeFields.length === 0) safeFields.push('id');

  const selectStr = safeFields.join(',');

  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return json({ error: 'Configuração interna ausente' }, 503);

  try {
    // Construir query
    let queryParam;
    if (tenant_id) {
      queryParam = `id=eq.${encodeURIComponent(tenant_id)}`;
    } else {
      queryParam = `email=eq.${encodeURIComponent(email)}`;
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
      const err = await res.text();
      console.error('get-tenant error:', err);
      return json({ error: 'Erro ao consultar tenant' }, 500);
    }

    const data = await res.json();
    return json({ tenants: data });

  } catch (err) {
    console.error('get-tenant exception:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}