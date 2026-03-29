// -- InkFlow -- Proxy Status WhatsApp Evolution API (server-side)
// GET /api/evo-status?instance=<evo_instance>
// Verifica status da conexao WhatsApp mantendo evo_apikey no servidor.
// Retorna apenas o estado: open / connecting / close / unknown.

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

  const url = new URL(request.url);
  const instance = url.searchParams.get('instance')?.trim();
  if (!instance) return json({ error: 'instance obrigatorio' }, 400);

  const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return json({ error: 'Configuracao interna ausente' }, 503);

  try {
    const tenantRes = await fetch(
      SUPABASE_URL + '/rest/v1/tenants?evo_instance=eq.' + encodeURIComponent(instance) +
      '&select=evo_base_url,evo_apikey,ativo&limit=1',
      { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } }
    );
    const tenants = await tenantRes.json();
    if (!Array.isArray(tenants) || tenants.length === 0) {
      return json({ error: 'Instancia nao encontrada' }, 404);
    }

    const { evo_base_url, evo_apikey, ativo } = tenants[0];
    if (!ativo) return json({ error: 'Tenant inativo' }, 403);

    const evoRes = await fetch(
      evo_base_url + '/instance/fetchInstances',
      { headers: { apikey: evo_apikey } }
    );
    const evoData = await evoRes.json();
    if (!evoRes.ok) {
      console.error('evo-status: Evolution API error', evoRes.status);
      return json({ error: 'Erro ao verificar status' }, 502);
    }

    const instances = Array.isArray(evoData) ? evoData : (evoData.data || []);
    const inst = instances.find(i =>
      (i.instance?.instanceName || i.instanceName) === instance
    );
    const state = inst
      ? (inst.instance?.state || inst.state || inst.connectionStatus || 'unknown')
      : 'unknown';

    return json({ state });
  } catch (err) {
    console.error('evo-status error:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}