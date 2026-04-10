export async function onRequest(context) {
  // [FIX Bug #10] Hardcoded para consistencia com demais endpoints
  const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
  const SUPABASE_SERVICE_KEY = context.env.SUPABASE_SERVICE_KEY;
  const ALLOWED_ORIGIN = 'https://inkflowbrasil.com';

  const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Validar que o request vem de um admin autenticado
    const authHeader = context.request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verificar token do usuario no Supabase
    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': authHeader }
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const user = await userRes.json();

    // Checar se e admin (ajuste o email conforme necessario)
    const ADMIN_EMAILS = ['lmf4200@gmail.com'];
    if (!ADMIN_EMAILS.includes(user.email)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await context.request.json();
    const key = body.key;
    const plano = body.plano || 'basic';

    // FIX AUDIT #3: Unificado min 8 (era 6) — consistente com validate-onboarding-key.js
    if (!key || typeof key !== 'string' || key.length < 8) {
      return new Response(JSON.stringify({ error: 'Key invalida (min 8 caracteres)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // FIX AUDIT #7: Adicionado 'teste' para permitir links de onboarding no plano teste (R$1)
    const validPlans = ['teste', 'basic', 'pro', 'enterprise'];
    if (!validPlans.includes(plano)) {
      return new Response(JSON.stringify({ error: 'Plano invalido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Inserir na tabela usando service_role
    const insertRes = await fetch(
      SUPABASE_URL + '/rest/v1/onboarding_links',
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          key: key,
          plano: plano,
          used: false
          // expires_at usa o default da tabela: now() + 30 days
        })
      }
    );

    if (!insertRes.ok) {
      const err = await insertRes.text();
      // FIX AUDIT-2 #5: Log interno apenas — não expor detalhes do Supabase na resposta
      console.error('create-onboarding-link: insert error:', err);
      return new Response(JSON.stringify({ error: 'Erro ao criar link' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const created = await insertRes.json();

    return new Response(JSON.stringify({
      success: true,
      key: key,
      plano: plano,
      expires_at: created[0]?.expires_at
    }), {
      status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}