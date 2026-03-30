// POST /api/evo-create-instance
// Cria instancia na Evolution API usando a chave global (server-side)
// Body: { instanceName: string, tenant_id: string }

export async function onRequestPost(context) {
  const { request, env } = context;

  const EVO_BASE_URL = 'https://evolutionapi.vps1170.panel.speedfy.host';
  const GLOBAL_KEY = env.EVO_GLOBAL_KEY;

  if (!GLOBAL_KEY) {
    return new Response(
      JSON.stringify({ error: 'EVO_GLOBAL_KEY nao configurada no servidor' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Body invalido' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { instanceName, tenant_id } = body;

  if (!instanceName || !tenant_id) {
    return new Response(
      JSON.stringify({ error: 'instanceName e tenant_id sao obrigatorios' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

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
        const apikey = existing.instance?.apikey || existing.apikey || null;
        return new Response(
          JSON.stringify({ apikey, instanceName, already_existed: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
  } catch (e) {
    console.error('evo-create-instance: erro ao verificar instancia existente:', e);
  }

  // Cria nova instancia
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
    return new Response(
      JSON.stringify({ error: 'Falha ao criar instancia na Evolution API', details: createData }),
      { status: createRes.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const apikey = createData.hash?.apikey || createData.instance?.apikey || createData.apikey || null;

  // Debug: se apikey ainda for null, retornar resposta completa
  if (!apikey) {
    return new Response(
      JSON.stringify({ error: 'apikey nao encontrada na resposta', raw: createData }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ apikey, instanceName, already_existed: false }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}