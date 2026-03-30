// ── InkFlow — Cria assinatura Mercado Pago (Cloudflare Pages Function) ────────
// Variáveis de ambiente no Cloudflare Pages (Settings → Environment variables):
//   MP_ACCESS_TOKEN  → chave de acesso de produção do Mercado Pago
//   SITE_URL         → https://inkflowbrasil.com
//
// Suporta dois fluxos:
//   1. COM card_token  → cria assinatura direto com cartão (sem redirecionar)
//   2. SEM card_token  → retorna init_point para redirect MP (Pix / boleto)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const PLANOS = {
  basic:      { nome: 'InkFlow Essencial',  valor: 199.00 },
  pro:        { nome: 'InkFlow Growth',     valor: 399.00 },
  enterprise: { nome: 'InkFlow Enterprise', valor: 999.00 },
};

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

  // ── FLUXO 1: Cartão direto (CardPayment Brick) ────────────────────────────
  if (card_token) {
    const payload = {
      reason:             planoConfig.nome,
      external_reference: tenant_id,
      payer_email:        email || `tenant_${tenant_id}@inkflow.temp`,
      card_token_id:      card_token,
      back_url:           `${SITE_URL}/onboarding`,
      auto_recurring: {
        frequency:          1,
        frequency_type:     'months',
        transaction_amount: planoConfig.valor,
        currency_id:        'BRL',
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
        return json({ error: msg }, mpRes.status);
      }

      // Adiciona cliente ao MailerLite
      await addToMailerLite(env, email, plano, tenant_id);

      // ── Opção C: atualiza tenant com dados da assinatura (server-side) ──
    const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
    const SB_KEY = env.SUPABASE_SERVICE_KEY;
    if (SB_KEY) {
      try {
        const patchRes = await fetch(
          `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}`,
          {
            method: 'PATCH',
            headers: {
              apikey: SB_KEY,
              Authorization: `Bearer ${SB_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({
              mp_subscription_id: data.id,
              status_pagamento: data.status,
            }),
          }
        );
        if (!patchRes.ok) {
          console.error('create-subscription: falha ao atualizar tenant (card):', await patchRes.text());
        }
      } catch (e) {
        console.error('create-subscription: erro ao atualizar tenant (card):', e);
      }
    }

      return json({ subscription_id: data.id, status: data.status });

    } catch (err) {
      console.error('create-subscription (card) error:', err);
      return json({ error: 'Erro interno ao processar cartão' }, 500);
    }
  }

  // ── FLUXO 2: Redirect MP (Pix / Boleto / Saldo MP) ───────────────────────
  const payload = {
    reason:             planoConfig.nome,
    external_reference: tenant_id,
    auto_recurring: {
      frequency:          1,
      frequency_type:     'months',
      transaction_amount: planoConfig.valor,
      currency_id:        'BRL',
    },
    back_url: `${SITE_URL}/onboarding.html`,
    status:   'pending',
  };

  if (email) payload.payer_email = email;

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
      return json({ error: data.message || 'Erro na API do Mercado Pago' }, mpRes.status);
    }

    // Adiciona cliente ao MailerLite (cadastro antecipado; confirmação vem pelo IPN)
    await addToMailerLite(env, email, plano, tenant_id);

    // -- Opcao C: atualiza tenant com dados da assinatura (server-side) --
    const SUPABASE_URL2 = 'https://bfzuxxuscyplfoimvomh.supabase.co';
    const SB_KEY2 = env.SUPABASE_SERVICE_KEY;
    if (SB_KEY2) {
      try {
        const patchRes = await fetch(
          `${SUPABASE_URL2}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}`,
          {
            method: 'PATCH',
            headers: {
              apikey: SB_KEY2,
              Authorization: `Bearer ${SB_KEY2}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({
              mp_subscription_id: data.id,
              status_pagamento: 'pendente',
            }),
          }
        );
        if (!patchRes.ok) {
          console.error('create-subscription: falha ao atualizar tenant (redirect):', await patchRes.text());
        }
      } catch (e) {
        console.error('create-subscription: erro ao atualizar tenant (redirect):', e);
      }
    }
    return json({ init_point: data.init_point, subscription_id: data.id });

  } catch (err) {
    console.error('create-subscription (redirect) error:', err);
    return json({ error: 'Erro interno ao criar assinatura' }, 500);
  }
}
