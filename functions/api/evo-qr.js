// -- InkFlow -- Proxy QR Code Evolution API (server-side)
// GET /api/evo-qr?instance=<evo_instance>
// Busca o QR code da Evolution API mantendo evo_apikey no servidor.
// O browser nunca ve as credenciais do tenant.
// [FIX Bug #6] CORS trancado para inkflowbrasil.com

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
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

  // [FIX AUDIT] Validar formato do parametro instance
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(instance)) {
    return json({ error: 'instance invalido' }, 400);
  }

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

    const { evo_base_url, evo_apikey } = tenants[0];
    // Bug 1 fix: removido check de 'ativo' — durante o onboarding o tenant ainda nao esta ativo,
    // mas precisa gerar QR para conectar o WhatsApp. Verificamos apenas se a apikey e valida.
    if (!evo_apikey || evo_apikey === 'pending') {
      return json({ error: 'Instancia ainda nao configurada. Aguarde alguns segundos e tente novamente.' }, 425);
    }

    const evoRes = await fetch(
      evo_base_url + '/instance/connect/' + instance,
      { headers: { apikey: evo_apikey } }
    );
    if (!evoRes.ok) {
      console.error('evo-qr: Evolution API error', evoRes.status);
      return json({ error: 'Erro ao gerar QR code' }, 502);
    }
    const evoData = await evoRes.json();

    const base64 = evoData.base64 || evoData.qrcode?.base64 || evoData.code;
    if (!base64) return json({ error: 'QR code nao disponivel' }, 404);

    return json({ base64 });
  } catch (err) {
    console.error('evo-qr error:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}
