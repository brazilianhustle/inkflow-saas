// POST /api/evo-create-instance
// Cria instancia na Evolution API usando a chave global (server-side)
// Body: { instanceName: string, tenant_id: string }
// [FIX] Bug #4: CORS headers + OPTIONS handler
// [FIX] Bug #8: Salva evo_apikey no tenant via Supabase (server-side)
// [FIX] Bug #2A: Configura webhook n8n (server-side, removido do frontend)

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

  const EVO_BASE_URL = env.EVO_BASE_URL;
  const N8N_WEBHOOK  = env.N8N_WEBHOOK_URL;
  const GLOBAL_KEY   = env.EVO_GLOBAL_KEY;

  if (!GLOBAL_KEY || !EVO_BASE_URL || !N8N_WEBHOOK) {
    console.error('evo-create-instance: env vars ausentes', { EVO_BASE_URL: !!EVO_BASE_URL, N8N_WEBHOOK: !!N8N_WEBHOOK, GLOBAL_KEY: !!GLOBAL_KEY });
    return json({ error: 'Configuração interna ausente' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body invalido' }, 400);
  }

  const { instanceName, tenant_id } = body;

  if (!instanceName || !tenant_id) {
    return json({ error: 'instanceName e tenant_id sao obrigatorios' }, 400);
  }

  let apikey = null;
  let already_existed = false;

  // Verifica se instancia ja existe (idempotencia)
  try {
    const checkRes = await fetch(
      `${EVO_BASE_URL}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
      { headers: { apikey: GLOBAL_KEY } }
    );
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      if (Array.isArray(checkData) && checkData.length > 0) {
        const existing = checkData[0];
        apikey = (typeof existing.hash === 'string' ? existing.hash : existing.hash?.apikey) || existing.instance?.apikey || existing.apikey || existing.token || null;
        if (apikey) already_existed = true;
      }
    }
  } catch (e) {
    console.error('evo-create-instance: erro ao verificar instancia existente:', e);
  }

  // Cria nova instancia se nao existir
  if (!apikey) {
    const createRes = await fetch(`${EVO_BASE_URL}/instance/create`, {
      method: 'POST',
      headers: {
        apikey: GLOBAL_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instanceName,
        qrcode: false,
        integration: 'WHATSAPP-BAILEYS',
      }),
    });

    const createData = await createRes.json();

    if (!createRes.ok) {
      console.error('evo-create-instance: falha ao criar instancia:', JSON.stringify(createData));
      return json({ error: 'Falha ao criar instancia na Evolution API', details: createData }, createRes.status);
    }

    apikey = (typeof createData.hash === 'string' ? createData.hash : createData.hash?.apikey) || createData.instance?.apikey || createData.apikey || null;
  }

  if (!apikey) {
    return json({ error: 'apikey nao encontrada na resposta' }, 500);
  }

  // [FIX Bug #2A] Configurar webhook n8n (server-side)
  try {
    await fetch(`${EVO_BASE_URL}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: { apikey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: N8N_WEBHOOK,
          webhookByEvents: false,
          webhookBase64: false,
          events: [
            'MESSAGES_UPSERT',
            'CONNECTION_UPDATE',
            'QRCODE_UPDATED',
            'MESSAGES_UPDATE',
            'CONTACTS_UPSERT'
          ]
        }
      })
    });
  } catch (webhookErr) {
    console.warn('evo-create-instance: webhook setup failed (nao fatal):', webhookErr);
  }

  // [FIX Bug #8] Salvar evo_apikey e evo_instance no tenant via Supabase
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (SB_KEY && tenant_id) {
    try {
      await fetch('https://bfzuxxuscyplfoimvomh.supabase.co/rest/v1/tenants?id=eq.' + encodeURIComponent(tenant_id), {
        method: 'PATCH',
        headers: {
          apikey: SB_KEY,
          Authorization: 'Bearer ' + SB_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ evo_apikey: apikey, evo_instance: instanceName })
      });
    } catch (sbErr) {
      console.error('evo-create-instance: falha ao salvar apikey no tenant:', sbErr);
    }
  }

  return json({ instanceName, already_existed });
}