// -- InkFlow -- Atualiza dados do tenant durante onboarding (server-side)
// Substitui updates diretos ao Supabase no front-end.
// POST /api/update-tenant

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const ALLOWED_FIELDS = new Set([
  'evo_instance', 'evo_apikey', 'evo_base_url', 'webhook_path',
  'grupo_notificacao', 'grupo_orcamento',
  'google_calendar_id', 'google_drive_folder',
  'nome_agente', 'nome_estudio', 'ativo', 'plano',
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
  catch { return json({ error: 'JSON invalido' }, 400); }
  const { tenant_id, ...fields } = body;
  if (!tenant_id) return json({ error: 'tenant_id obrigatorio' }, 400);
  const safeFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (ALLOWED_FIELDS.has(k)) safeFields[k] = v;
  }
  if (Object.keys(safeFields).length === 0) {
    return json({ error: 'Nenhum campo valido para atualizar' }, 400);
  }
  const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return json({ error: 'Configuracao interna ausente' }, 503);
  try {
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/tenants?id=eq.' + encodeURIComponent(tenant_id),
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: 'Bearer ' + SUPABASE_KEY,
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