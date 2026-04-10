// ── InkFlow — Excluir tenant e dados relacionados (server-side, admin only) ──
// POST /api/delete-tenant
// Body: { tenant_id: "uuid" }
// [NEW] Bug #5 — substitui DELETE direto ao Supabase no frontend

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

  // Validar auth — somente admin
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return json({ error: 'Configuracao interna ausente' }, 503);

  // Verificar token do usuario no Supabase
  const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SB_KEY, Authorization: authHeader }
  });
  if (!userRes.ok) return json({ error: 'Invalid token' }, 401);
  const user = await userRes.json();

  const ADMIN_EMAILS = ['lmf4200@gmail.com'];
  if (!ADMIN_EMAILS.includes(user.email)) {
    return json({ error: 'Forbidden' }, 403);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON invalido' }, 400); }

  const { tenant_id } = body;
  if (!tenant_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant_id)) {
    return json({ error: 'tenant_id invalido' }, 400);
  }

  const headers = {
    apikey: SB_KEY,
    Authorization: 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  try {
    // [FIX AUDIT5 #3] Buscar dados do tenant para cancelar MP e deletar EVO
    const tenantRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=mp_subscription_id,evo_instance,evo_apikey,evo_base_url`,
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
    );
    let tenantInfo = null;
    if (tenantRes.ok) {
      const tenants = await tenantRes.json();
      if (tenants.length > 0) tenantInfo = tenants[0];
    }

    // Cancelar assinatura no Mercado Pago (se existir)
    if (tenantInfo?.mp_subscription_id && env.MP_ACCESS_TOKEN) {
      try {
        const mpRes = await fetch(
          `https://api.mercadopago.com/preapproval/${encodeURIComponent(tenantInfo.mp_subscription_id)}`,
          {
            method: 'PUT',
            headers: {
              Authorization: 'Bearer ' + env.MP_ACCESS_TOKEN,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'cancelled' }),
          }
        );
        if (!mpRes.ok) console.warn('delete-tenant: falha ao cancelar assinatura MP:', await mpRes.text());
        else console.log('delete-tenant: assinatura MP cancelada:', tenantInfo.mp_subscription_id);
      } catch (mpErr) {
        console.warn('delete-tenant: erro ao cancelar MP (nao fatal):', mpErr);
      }
    }

    // Deletar instancia na Evolution API (se existir)
    if (tenantInfo?.evo_instance) {
      try {
        const evoBase = tenantInfo.evo_base_url || env.EVO_BASE_URL || 'https://evo.inkflowbrasil.com';
        const evoKey = env.EVO_GLOBAL_KEY;
        if (evoKey) {
          const evoRes = await fetch(
            `${evoBase}/instance/delete/${encodeURIComponent(tenantInfo.evo_instance)}`,
            {
              method: 'DELETE',
              headers: { apikey: evoKey },
            }
          );
          if (!evoRes.ok) console.warn('delete-tenant: falha ao deletar instancia EVO:', await evoRes.text());
          else console.log('delete-tenant: instancia EVO deletada:', tenantInfo.evo_instance);
        }
      } catch (evoErr) {
        console.warn('delete-tenant: erro ao deletar EVO (nao fatal):', evoErr);
      }
    }

    // Deletar em cascata: chat_messages → chats → dados_cliente → tenants
    const tables = [
      { table: 'chat_messages', filter: 'tenant_id=eq.' + tenant_id },
      { table: 'chats', filter: 'tenant_id=eq.' + tenant_id },
      { table: 'dados_cliente', filter: 'tenant_id=eq.' + tenant_id },
      { table: 'logs', filter: 'tenant_id=eq.' + tenant_id },
      { table: 'signups_log', filter: 'tenant_id=eq.' + tenant_id },
      { table: 'payment_logs', filter: 'tenant_id=eq.' + tenant_id },
      { table: 'tenants', filter: 'id=eq.' + tenant_id },
    ];

    for (const { table, filter } of tables) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const err = await res.text();
        console.error(`delete-tenant: falha ao deletar ${table}:`, err);
        return json({ error: `Erro ao excluir ${table}` }, 500);
      }
    }

    console.log('delete-tenant: tenant', tenant_id, 'excluido com sucesso');
    return json({ ok: true });

  } catch (err) {
    console.error('delete-tenant exception:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}