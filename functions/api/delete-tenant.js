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

    // ── Helper: deletar de uma tabela com filtro ──
    async function del(table, filter) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { method: 'DELETE', headers });
      if (!res.ok) {
        const err = await res.text();
        console.error(`delete-tenant: falha ao deletar ${table} (${filter}):`, err);
        // Não bloqueia — loga e continua (dados órfãos são menores que falha total)
      }
    }

    // ── 1. Buscar IDs dos tenants filhos (artistas) ──
    const childRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?parent_tenant_id=eq.${encodeURIComponent(tenant_id)}&select=id`,
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
    );
    const childTenants = childRes.ok ? await childRes.json() : [];
    const childIds = childTenants.map(c => c.id);

    // ── 2. Deletar dados dos filhos (se existirem) ──
    for (const childId of childIds) {
      await del('chat_messages', 'tenant_id=eq.' + childId);
      await del('chats', 'tenant_id=eq.' + childId);
      await del('dados_cliente', 'tenant_id=eq.' + childId);
      await del('logs', 'tenant_id=eq.' + childId);
      await del('signups_log', 'tenant_id=eq.' + childId);
      await del('payment_logs', 'tenant_id=eq.' + childId);
    }

    // ── 3. Limpar onboarding_links e tenants filhos ──
    await del('onboarding_links', 'parent_tenant_id=eq.' + tenant_id);
    if (childIds.length > 0) {
      await del('tenants', 'parent_tenant_id=eq.' + tenant_id);
    }

    // ── 4. Deletar dados do tenant pai ──
    await del('chat_messages', 'tenant_id=eq.' + tenant_id);
    await del('chats', 'tenant_id=eq.' + tenant_id);
    await del('dados_cliente', 'tenant_id=eq.' + tenant_id);
    await del('logs', 'tenant_id=eq.' + tenant_id);
    await del('signups_log', 'tenant_id=eq.' + tenant_id);
    await del('payment_logs', 'tenant_id=eq.' + tenant_id);

    // ── 5. Deletar o tenant pai ──
    const finalRes = await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${tenant_id}`, { method: 'DELETE', headers });
    if (!finalRes.ok) {
      const err = await finalRes.text();
      console.error('delete-tenant: falha ao deletar tenant principal:', err);
      return json({ error: 'Erro ao excluir tenant' }, 500);
    }

    console.log('delete-tenant: tenant', tenant_id, 'excluido com sucesso');
    return json({ ok: true });

  } catch (err) {
    console.error('delete-tenant exception:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}