// ── InkFlow — Proxy seguro para lookup de tenant por evo_instance ───────────
// Usado pelo reconnect.html sem expor SUPABASE anon key ao front.
// GET /api/get-tenant?slug=<evo_instance>

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url  = new URL(request.url);
  const slug = url.searchParams.get('slug')?.trim();
  if (!slug) return json({ error: 'slug obrigatório' }, 400);

  const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return json({ error: 'Configuração interna ausente' }, 503);

  try {
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/tenants?evo_instance=eq.' + encodeURIComponent(slug) + '&select=nome_estudio,nome_agente,evo_instance,evo_base_url,evo_apikey&limit=1',
      { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } }
    );
    const data = await res.json();
    if (!res.ok) return json({ error: 'Erro ao consultar banco de dados' }, 500);
    if (!Array.isArray(data) || data.length === 0) return json({ error: 'Estúdio não encontrado' }, 404);
    return json(data[0]);
  } catch (err) {
    console.error('get-tenant error:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}
