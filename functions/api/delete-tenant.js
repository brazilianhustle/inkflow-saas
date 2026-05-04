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

    // ── Helper: deleta instancia na Evolution API com fallback robusto ─────
    // v2.3.7 tem bug: se connectionStatus='open' mas Baileys rejeitou (401),
    // o state machine fica travado e logout/delete retornam 500/400.
    //
    // Estrategia (4 niveis):
    //   1. logout(DELETE) + delete(DELETE)  -> 'success'
    //   2. sleep 2s + logout(POST) + delete(DELETE)  -> 'retry_success'
    //   3. HTTP POST para EVO_DB_CLEANUP_URL (bridge no VPS que roda SQL)  -> 'db_fallback'
    //   4. Retorna 'failed' + manual_sql para admin rodar via SSH
    async function tryApiDelete(evoKey, base, instanceName, logoutMethod) {
      // logout — erros nao fatais
      try {
        const r = await fetch(`${base}/instance/logout/${encodeURIComponent(instanceName)}`, {
          method: logoutMethod,
          headers: { apikey: evoKey },
        });
        const t = await r.text().catch(() => '');
        console.log(`[evo-delete] logout[${logoutMethod}] ${instanceName} status=${r.status} resp=${t.slice(0, 200)}`);
      } catch (e) {
        console.warn(`[evo-delete] logout[${logoutMethod}] ${instanceName} threw:`, e?.message || e);
      }
      // delete
      try {
        const r = await fetch(`${base}/instance/delete/${encodeURIComponent(instanceName)}`, {
          method: 'DELETE',
          headers: { apikey: evoKey },
        });
        const t = await r.text().catch(() => '');
        console.log(`[evo-delete] delete ${instanceName} (via ${logoutMethod}-logout) status=${r.status} resp=${t.slice(0, 200)}`);
        if (r.ok) return { ok: true };
        return { ok: false, status: r.status, body: t.slice(0, 200) };
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
    }

    async function deleteEvoInstance(instanceName, baseUrl) {
      const evoKey = env.EVO_GLOBAL_KEY || env.EVOLUTION_GLOBAL_KEY;
      const base = baseUrl || env.EVO_BASE_URL || 'https://evo.inkflowbrasil.com';
      if (!instanceName) return { ok: false, cleanup: 'failed', reason: 'missing instance' };
      if (!evoKey) return { ok: false, cleanup: 'failed', instance: instanceName, reason: 'missing EVO_GLOBAL_KEY' };

      // Nivel 1: tentativa padrao
      const a1 = await tryApiDelete(evoKey, base, instanceName, 'DELETE');
      if (a1.ok) return { ok: true, cleanup: 'success', instance: instanceName };

      // Nivel 2: aguarda 2s, tenta logout via POST (Evolution v2.3.7 as vezes aceita)
      await new Promise(r => setTimeout(r, 2000));
      const a2 = await tryApiDelete(evoKey, base, instanceName, 'POST');
      if (a2.ok) return { ok: true, cleanup: 'retry_success', instance: instanceName };

      // Nivel 3: fallback DB via endpoint HTTP no VPS (bridge que executa SQL)
      // Requer env vars EVO_DB_CLEANUP_URL + EVO_DB_CLEANUP_SECRET configuradas no Cloudflare Pages.
      // O endpoint deve receber POST {instance_name} com header x-admin-secret e executar:
      //   DELETE FROM "Instance" WHERE name = $1
      const dbUrl = env.EVO_DB_CLEANUP_URL;
      const dbSecret = env.EVO_DB_CLEANUP_SECRET;
      if (dbUrl && dbSecret) {
        try {
          const dbRes = await fetch(dbUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-secret': dbSecret },
            body: JSON.stringify({ instance_name: instanceName }),
          });
          const dbTxt = await dbRes.text().catch(() => '');
          console.log(`[evo-delete] db-fallback ${instanceName} status=${dbRes.status} resp=${dbTxt.slice(0, 200)}`);
          if (dbRes.ok) return { ok: true, cleanup: 'db_fallback', instance: instanceName };
        } catch (e) {
          console.warn(`[evo-delete] db-fallback threw:`, e?.message || e);
        }
      } else {
        console.warn('[evo-delete] EVO_DB_CLEANUP_URL/SECRET nao configuradas — pulando nivel 3');
      }

      // Nivel 4: falhou tudo — retorna SQL manual para admin rodar via SSH
      console.error(`[evo-delete] FALHA TOTAL para ${instanceName}. Admin precisa rodar SQL manualmente.`);
      return {
        ok: false,
        cleanup: 'failed',
        instance: instanceName,
        last_status: a2.status || a1.status,
        last_body: (a2.body || a1.body || '').slice(0, 200),
        manual_sql: `DELETE FROM "Instance" WHERE name = '${instanceName.replace(/'/g, "''")}';`,
      };
    }

    const evoDeleted = [];
    const evoErrors = [];

    // Deletar instancia do tenant pai (se existir)
    if (tenantInfo?.evo_instance) {
      const r = await deleteEvoInstance(tenantInfo.evo_instance, tenantInfo.evo_base_url);
      if (r.ok) evoDeleted.push({ instance: r.instance, cleanup: r.cleanup });
      else evoErrors.push(r);
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

    // ── 1. Deletar dados do tenant ──
    await del('chat_messages', 'tenant_id=eq.' + tenant_id);
    await del('chats', 'tenant_id=eq.' + tenant_id);
    await del('dados_cliente', 'tenant_id=eq.' + tenant_id);
    await del('logs', 'tenant_id=eq.' + tenant_id);
    await del('signups_log', 'tenant_id=eq.' + tenant_id);
    await del('payment_logs', 'tenant_id=eq.' + tenant_id);

    // ── 2. Deletar o tenant ──
    const finalRes = await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${tenant_id}`, { method: 'DELETE', headers });
    if (!finalRes.ok) {
      const err = await finalRes.text();
      console.error('delete-tenant: falha ao deletar tenant principal:', err);
      return json({ error: 'Erro ao excluir tenant' }, 500);
    }

    // Agregar status geral de cleanup EVO: "success" | "retry_success" | "db_fallback" | "failed"
    // Prioridade do pior para o melhor — se qualquer instancia falhou, status geral eh 'failed'
    let evoCleanup = 'success';
    if (evoErrors.length > 0) evoCleanup = 'failed';
    else if (evoDeleted.some(x => typeof x === 'object' && x.cleanup === 'db_fallback')) evoCleanup = 'db_fallback';
    else if (evoDeleted.some(x => typeof x === 'object' && x.cleanup === 'retry_success')) evoCleanup = 'retry_success';

    console.log('delete-tenant: tenant', tenant_id, 'excluido. EVO cleanup:', evoCleanup, 'deletadas:', evoDeleted.length, 'erros:', evoErrors.length);
    return json({
      ok: true,
      evo_cleanup: evoCleanup,
      evo_deleted: evoDeleted,
      evo_errors: evoErrors,
    });

  } catch (err) {
    console.error('delete-tenant exception:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}