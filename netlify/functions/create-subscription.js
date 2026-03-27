// ── InkFlow — Cria assinatura recorrente no Mercado Pago ──────────────────────
// Variáveis de ambiente necessárias no Netlify:
//   MP_ACCESS_TOKEN    → sua chave de acesso de produção do Mercado Pago
//   SITE_URL           → https://preeminent-gaufre-539d5e.netlify.app

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PLANOS = {
  basic:      { nome: 'InkFlow Essencial', valor: 199.00 },
  pro:        { nome: 'InkFlow Growth',    valor: 399.00 },
  enterprise: { nome: 'InkFlow Enterprise',valor: 999.00 },
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { tenant_id, plano, nome, email } = body;

  if (!tenant_id || !plano) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'tenant_id e plano são obrigatórios' }),
    };
  }

  if (plano === 'free') {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ trial: true }) };
  }

  const planoConfig = PLANOS[plano];
  if (!planoConfig) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: `Plano inválido: ${plano}` }),
    };
  }

  const SITE_URL = process.env.SITE_URL || 'https://preeminent-gaufre-539d5e.netlify.app';
  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

  if (!ACCESS_TOKEN) {
    return {
      statusCode: 503,
      headers: CORS,
      body: JSON.stringify({ error: 'Gateway de pagamento não configurado. Contate o suporte.' }),
    };
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
    back_url: `${SITE_URL}/onboarding.html`,
    status: 'pending',
  };

  if (email) payload.payer_email = email;

  try {
    const mpRes = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await mpRes.json();

    if (!mpRes.ok) {
      console.error('MP API error:', data);
      return {
        statusCode: mpRes.status,
        headers: CORS,
        body: JSON.stringify({ error: data.message || 'Erro na API do Mercado Pago' }),
      };
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ init_point: data.init_point, subscription_id: data.id }),
    };
  } catch (err) {
    console.error('create-subscription error:', err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'Erro interno ao criar assinatura' }),
    };
  }
};
