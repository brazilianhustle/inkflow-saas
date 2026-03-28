// ── InkFlow — Cria assinatura recorrente no Mercado Pago (Cloudflare Pages) ──
// MP_ACCESS_TOKEN → sua chave de acesso de produção do Mercado Pago
// SITE_URL → https://inkflowbrasil.com

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PLANOS = {
  basic: { nome: 'InkFlow Essencial', valor: 199.00 },
  pro: { nome: 'InkFlow Growth', valor: 399.00 },
  enterprise: { nome: 'InkFlow Enterprise', valor: 999.00 },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const { tenant_id, plano, email } = body;

  if (!tenant_id || !plano) {
    return jsonResponse({ error: 'tenant_id e plano sao obrigatorios' }, 400);
  }

  if (plano === 'free') {
    return jsonResponse({ trial: true });
  }

  const planoConfig = PLANOS[plano];
  if (!planoConfig) {
    return jsonResponse({ error: 'Plano invalido: ' + plano }, 400);
  }

  const SITE_URL = env.SITE_URL || 'https://inkflowbrasil.com';
  const ACCESS_TOKEN = env.MP_ACCESS_TOKEN;

  if (!ACCESS_TOKEN) {
    return jsonResponse({ error: 'Gateway de pagamento nao configurado. Contate o suporte.' }, 503);
  }

  const payload = {
    reason: planoConfig.nome,
    external_reference: tenant_id,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: planoConfig.valor,
      currency_id: 'BRL',
    },
    back_url: SITE_URL + '/onboarding.html',
    status: 'pending',
  };

  if (email) payload.payer_email = email;

  try {
    const mpRes = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await mpRes.json();

    if (!mpRes.ok) {
      console.error('MP API error:', data);
      return jsonResponse({ error: data.message || 'Erro na API do Mercado Pago' }, mpRes.status);
    }

    return jsonResponse({ init_point: data.init_point, subscription_id: data.id });
  } catch (err) {
    console.error('create-subscription error:', err);
    return jsonResponse({ error: 'Erro interno ao criar assinatura' }, 500);
  }
}
