// ── InkFlow — Atualiza dados do tenant durante onboarding (server-side) ────────
// Substitui updates diretos ao Supabase no front-end.
// POST /api/update-tenant
//
// Body aceito (campos permitidos para onboarding):
// { tenant_id, evo_instance, evo_apikey, evo_base_url, webhook_path,
//   grupo_notificacao, grupo_orcamento, google_calendar_id, google_drive_folder,
//   ativo, plano, nome_agente, nome_estudio, trial_ate }
//
// Campos BLOQUEADOS (nunca aceitos por este endpoint):
// status_pagamento, mp_subscription_id, prompt_sistema, faq_texto
// (esses só são alterados via IPN ou pelo painel admin)

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Campos que o onboarding pode atualizar
const ALLOWED_FIELDS = new Set([
  'evo_instance', 'evo_apikey', 'evo_base_url', 'webhook_path',
  'grupo_notificacao', 'grupo_orcamento',
  'google_calendar_id', 'google_drive_folder',
  'nome_agente', 'nome_estudio', 'ativo', 'plano', 'trial_ate',
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

  const { tenant_id, ...fields } = body;

  if (!tenant_id) return json({ error: 'tenant_id obrigatório' }, 400);

  // Validar formato UUID para prevenir injection
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant_id)) {
    return json({ error: 'tenant_id inválido' }, 400);
  }

  // Filtra apenas campos permitidos
  const safeFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (ALLOWED_FIELDS.has(k)) safeFields[k] = v;
  }

  if (Object.keys(safeFields).length === 0) {
    return json({ error: 'Nenhum campo válido para atualizar' }, 400);
  }

  const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_KEY) return json({ error: 'Configuração interna ausente' }, 503);

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(safeFields),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error('update-tenant error:', err);
      return json({ error: 'Erro ao atualizar tenant' }, 500);
    }

    console.log('update-tenant: tenant', tenant_id, 'updated fields:', Object.keys(safeFields).join(', '));
    return json({ ok: true, updated: Object.keys(safeFields) });

  } catch (err) {
    console.error('update-tenant exception:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}