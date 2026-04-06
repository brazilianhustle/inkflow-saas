// ── InkFlow — Cria assinatura Mercado Pago (Cloudflare Pages Function) ────────
// Variáveis de ambiente no Cloudflare Pages (Settings → Environment variables):
//   MP_ACCESS_TOKEN      → chave de acesso de produção do Mercado Pago
//   SITE_URL             → https://inkflowbrasil.com
//   SUPABASE_SERVICE_KEY → service_role key do Supabase
//
// Suporta dois fluxos:
//   1. COM card_token  → cria assinatura direto com cartão (sem redirecionar)
//   2. SEM card_token  → retorna init_point para redirect MP (Pix / boleto)

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const PLANOS =  {
    teste:      { nome: 'InkFlow Teste',      valor: 1.00 },   // TEMPORARIO: remover apos teste
  basic:      { nome: 'InkFlow Essencial',  valor: 199.00 },
  pro:        { nome: 'InkFlow Growth',     valor: 399.00 },
  enterprise: { nome: 'InkFlow Enterprise', valor: 999.00 },
};

// ── [FIX #11] SUPABASE_URL centralizado (antes era duplicado) ────────────────
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

// ── MailerLite: adiciona subscriber ao grupo de clientes ativos ───────────────
async function addToMailerLite(env, email, plano, tenantId) {
  const ML_KEY   = env.MAILERLITE_API_KEY;
  const ML_GROUP = env.MAILERLITE_GROUP_ID;
  if (!ML_KEY || !ML_GROUP || !email) return;
  try {
    const res = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${ML_KEY}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify({
        email,
        groups: [ML_GROUP],
        fields: { plano, tenant_id: String(tenantId) },
        status: 'active',
      }),
    });
    if (!res.ok) console.error('MailerLite add error:', await res.text());
  } catch (e) {
    console.error('MailerLite error:', e);
  }
}

// ── [FIX #14] Log de pagamento no Supabase ───────────────────────────────────
async function logPaymentEvent(env, tenantId, eventType, data = {}) {
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/payment_logs`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        event_type: eventType,
        mp_subscription_id: data.subscriptionId || null,
        status: data.status || null,
        error_message: data.error || null,
        raw_response: data.raw || null,
      }),
    });
  } catch (e) {
    console.error('logPaymentEvent error:', e);
  }
}

// ── Atualiza tenant no Supabase ──────────────────────────────────────────────
async function updateTenant(env, tenantId, fields) {
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return;
  try {
    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(fields),
      }
    );
    if (!patchRes.ok) {
      console.error('create-subscription: falha ao atualizar tenant:', await patchRes.text());
    }
  } catch (e) {
    console.error('create-subscription: erro ao atualizar tenant:', e);
  }
}

// ── [FIX #5] Verifica se tenant já tem assinatura ativa ──────────────────────
async function checkExistingSubscription(env, tenantId) {
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}&select=mp_subscription_id,status_pagamento`,
      {
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
        },
      }
    );
    const tenants = await res.json();
    if (tenants[0]?.mp_subscription_id && tenants[0]?.status_pagamento === 'authorized') {
      return tenants[0];
    }
  } catch (e) {
    console.error('checkExistingSubscription error:', e);
  }
  return null;
}

export async function onRequest(context) {
  const { request, env } = context;

  // ── Preflight CORS ────────────────────────────────────────────────────────
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  const {
    tenant_id,
    plano,
    email,
    card_token,
    payment_method_id,
    issuer_id,
  } = body;

  if (!tenant_id || !plano) {
    return json({ error: 'tenant_id e plano são obrigatórios' }, 400);
  }

  // ── Plano free — sem cobrança ─────────────────────────────────────────────
  if (plano === 'free') {
    return json({ trial: true });
  }

  const planoConfig = PLANOS[plano];
  if (!planoConfig) {
    return json({ error: `Plano inválido: ${plano}` }, 400);
  }

  const ACCESS_TOKEN = env.MP_ACCESS_TOKEN;
  const SITE_URL     = env.SITE_URL || 'https://inkflowbrasil.com';

  if (!ACCESS_TOKEN) {
    return json({ error: 'Gateway de pagamento não configurado.' }, 503);
  }

  // ── [FIX #1] Email obrigatório — rejeitar sem email válido ────────────────
  if (!email || !email.includes('@')) {
    return json({ error: 'Email válido é obrigatório para processar o pagamento.' }, 400);
  }

  // ── [FIX #5] Verificar assinatura existente ────────────────────────────────
  const existing = await checkExistingSubscription(env, tenant_id);
  if (existing) {
    return json({ error: 'Este estúdio já possui uma assinatura ativa.' }, 409);
  }

  // ── FLUXO 1: Cartão direto (CardPayment Brick) ────────────────────────────
  if (card_token) {
    const payload = {
      reason:             planoConfig.nome,
      external_reference: tenant_id,
      payer_email:        email,                          // [FIX #1] Sem fallback fake
      card_token_id:      card_token,
      back_url:           `${SITE_URL}/onboarding`,       // [FIX #4] Padronizado
      auto_recurring: {
        frequency:          1,
        frequency_type:     'months',
        transaction_amount: planoConfig.valor,
        currency_id:        'BRL',
        start_date:         new Date(Date.now() + 5 * 60 * 1000).toISOString(), // [FIX] cobrar em 5 min
      },
      status: 'authorized',
    };

    if (payment_method_id) payload.payment_method_id = payment_method_id;
    if (issuer_id)         payload.issuer_id          = String(issuer_id);

    try {
      const mpRes = await fetch('https://api.mercadopago.com/preapproval', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await mpRes.json();

      if (!mpRes.ok) {
        console.error('MP card error:', JSON.stringify(data));
        const msg = data?.cause?.[0]?.description || data.message || 'Erro no Mercado Pago';

        // [FIX #14] Log do erro
        await logPaymentEvent(env, tenant_id, 'subscription_error', {
          error: msg,
          raw: data,
        });

        return json({ error: msg }, mpRes.status);
      }

      // Adiciona cliente ao MailerLite
      await addToMailerLite(env, email, plano, tenant_id);

      // Atualiza tenant com dados da assinatura (server-side)
      await updateTenant(env, tenant_id, {
        mp_subscription_id: data.id,
        status_pagamento: data.status,
      });

      // [FIX #14] Log de sucesso
      await logPaymentEvent(env, tenant_id, 'subscription_created', {
        subscriptionId: data.id,
        status: data.status,
        raw: { id: data.id, status: data.status, payer_email: email, plano },
      });

      // [FIX #3] Retornar status para o frontend decidir o que fazer
      return json({ subscription_id: data.id, status: data.status });

    } catch (err) {
      console.error('create-subscription (card) error:', err);

      await logPaymentEvent(env, tenant_id, 'subscription_error', {
        error: err.message || 'Erro interno',
      });

      return json({ error: 'Erro interno ao processar cartão' }, 500);
    }
  }

  // ── FLUXO 2: Redirect MP (Pix / Boleto / Saldo MP) ───────────────────────
  const payload = {
    reason:             planoConfig.nome,
    external_reference: tenant_id,
    payer_email:        email,                            // [FIX #1] Sem fallback fake
    auto_recurring: {
      frequency:          1,
      frequency_type:     'months',
      transaction_amount: planoConfig.valor,
      currency_id:        'BRL',
      start_date:         new Date(Date.now() + 5 * 60 * 1000).toISOString(), // [FIX] cobrar em 5 min
    },
    back_url: `${SITE_URL}/onboarding`,                   // [FIX #4] Padronizado (era /onboarding.html)
    status:   'pending',
  };

  try {
    const mpRes = await fetch('https://api.mercadopago.com/preapproval', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await mpRes.json();

    if (!mpRes.ok) {
      console.error('MP redirect error:', JSON.stringify(data));

      await logPaymentEvent(env, tenant_id, 'subscription_error', {
        error: data.message || 'Erro na API do Mercado Pago',
        raw: data,
      });

      return json({ error: data.message || 'Erro na API do Mercado Pago' }, mpRes.status);
    }

    // Adiciona cliente ao MailerLite (cadastro antecipado; confirmação vem pelo IPN)
    await addToMailerLite(env, email, plano, tenant_id);

    // Atualiza tenant com dados da assinatura (server-side)
    await updateTenant(env, tenant_id, {
      mp_subscription_id: data.id,
      status_pagamento: 'pendente',
    });

    // [FIX #14] Log
    await logPaymentEvent(env, tenant_id, 'subscription_redirect', {
      subscriptionId: data.id,
      status: 'pendente',
    });

    return json({ init_point: data.init_point, subscription_id: data.id });

  } catch (err) {
    console.error('create-subscription (redirect) error:', err);

    await logPaymentEvent(env, tenant_id, 'subscription_error', {
      error: err.message || 'Erro interno',
    });

    return json({ error: 'Erro interno ao criar assinatura' }, 500);
  }
}
