// -- InkFlow -- Pairing Code Evolution API (server-side)
// GET /api/evo-pairing-code?instance=<evo_instance>&number=<phone>
// Gera um Pairing Code para conexao WhatsApp sem QR Code.
// Ideal para onboarding via celular onde o usuario nao consegue escanear QR.
// O browser nunca ve as credenciais do tenant.

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
  const number = url.searchParams.get('number')?.trim();

  if (!instance) return json({ error: 'instance obrigatorio' }, 400);
  if (!number) return json({ error: 'number obrigatorio' }, 400);

  // Validar formato do parametro instance
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(instance)) {
    return json({ error: 'instance invalido' }, 400);
  }

  // Validar formato do numero (apenas digitos, 10-15 chars — codigo pais + DDD + numero)
  const cleanNumber = number.replace(/\D/g, '');
  if (cleanNumber.length < 10 || cleanNumber.length > 15) {
    return json({ error: 'Numero invalido. Use formato: 5511999999999 (codigo do pais + DDD + numero)' }, 400);
  }

  const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return json({ error: 'Configuracao interna ausente' }, 503);

  try {
    // Buscar dados do tenant pelo evo_instance
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
    // Durante onboarding o tenant ainda nao esta ativo, verificamos apenas se a apikey e valida
    if (!evo_apikey || evo_apikey === 'pending') {
      return json({ error: 'Instancia ainda nao configurada. Aguarde alguns segundos e tente novamente.' }, 425);
    }

    // Verificar status atual da instancia
    // Pairing code so funciona quando status e "close" (desconectada)
    // Se estiver em "connecting", fazer logout para resetar antes de pedir o codigo
    try {
      const statusRes = await fetch(
        evo_base_url + '/instance/connectionState/' + instance,
        { headers: { apikey: evo_apikey } }
      );
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        const connState = statusData?.instance?.state || statusData?.state || '';
        console.log('evo-pairing-code: connectionState =', connState);
        if (connState === 'open') {
          return json({ error: 'Este WhatsApp j\u00e1 est\u00e1 conectado. Recarregue a p\u00e1gina.' }, 409);
        }
        if (connState === 'connecting') {
          // Resetar instancia para estado limpo antes de gerar pairing code
          console.log('evo-pairing-code: instancia em connecting — fazendo logout para resetar');
          await fetch(evo_base_url + '/instance/logout/' + instance, {
            method: 'DELETE',
            headers: { apikey: evo_apikey }
          }).catch(() => {});
          // Aguardar breve momento para a instancia resetar
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    } catch (stateErr) {
      console.warn('evo-pairing-code: nao foi possivel checar estado da instancia (nao fatal):', stateErr.message);
    }

    // Chamar Evolution API passando o numero para receber o pairing code
    // O endpoint /instance/connect/{instance} retorna pairingCode quando ?number= e fornecido
    const evoRes = await fetch(
      evo_base_url + '/instance/connect/' + instance + '?number=' + encodeURIComponent(cleanNumber),
      { headers: { apikey: evo_apikey } }
    );
    if (!evoRes.ok) {
      const errBody = await evoRes.text().catch(() => '');
      console.error('evo-pairing-code: Evolution API error', evoRes.status, errBody);
      return json({ error: 'Erro ao gerar codigo de pareamento' }, 502);
    }
    const evoData = await evoRes.json();
    console.log('evo-pairing-code: evo response keys =', Object.keys(evoData).join(','));

    const pairingCode = evoData.pairingCode || null;
    if (!pairingCode) {
      console.error('evo-pairing-code: pairingCode nao retornado. Response:', JSON.stringify(evoData));
      return json({ error: 'Codigo de pareamento nao disponivel. Tente novamente.', debug_keys: Object.keys(evoData) }, 404);
    }

    // Formatar o codigo no padrao XXXX-XXXX para facilitar leitura
    const formatted = pairingCode.length === 8
      ? pairingCode.slice(0, 4) + '-' + pairingCode.slice(4)
      : pairingCode;

    return json({ pairingCode: formatted });
  } catch (err) {
    console.error('evo-pairing-code error:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}
