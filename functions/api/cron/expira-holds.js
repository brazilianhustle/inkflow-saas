// ── Cron — expira-holds ────────────────────────────────────────────────────
// GET /api/cron/expira-holds
// Header: X-Cron-Secret (env CLEANUP_SECRET)
// Roda periodicamente (5min) — cancela agendamentos em tentative cujo slot
// venceu o TTL (48h) sem receber sinal, e volta a conversa pra expirado.

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function supaFetch(env, path, init = {}) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  // Auth: aceita X-Cron-Secret ou mesmo segredo do cleanup existente
  const secret = env.CLEANUP_SECRET || env.CRON_SECRET;
  if (!secret) return json({ error: 'cron-secret-missing' }, 503);
  const got = request.headers.get('X-Cron-Secret');
  if (got !== secret) return json({ error: 'unauthorized' }, 401);

  const nowIso = new Date().toISOString();

  // 1. Busca conversas com slot expirado e status aguardando_sinal
  const cRes = await supaFetch(
    env,
    `/rest/v1/conversas?estado=eq.aguardando_sinal&slot_expira_em=lt.${encodeURIComponent(nowIso)}&select=id,tenant_id,telefone,slot_tentative_id`
  );
  if (!cRes.ok) return json({ error: 'db-conversas-error' }, 500);
  const conversas = await cRes.json();
  if (!Array.isArray(conversas) || conversas.length === 0) {
    return json({ ok: true, processadas: 0 });
  }

  const agIds = conversas.map(c => c.slot_tentative_id).filter(Boolean);
  let canceladas = 0;

  // 2. Cancela agendamentos tentative associados
  if (agIds.length > 0) {
    const list = agIds.map(i => `"${i}"`).join(',');
    const upA = await supaFetch(
      env,
      `/rest/v1/agendamentos?id=in.(${list})&status=eq.tentative`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'cancelled' }),
      }
    );
    if (upA.ok) {
      const rows = await upA.json();
      canceladas = Array.isArray(rows) ? rows.length : 0;
    }
  }

  // 3. Atualiza conversas pra expirado
  const convIds = conversas.map(c => `"${c.id}"`).join(',');
  if (convIds) {
    await supaFetch(
      env,
      `/rest/v1/conversas?id=in.(${convIds})`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          estado: 'expirado',
          slot_expira_em: null,
          slot_tentative_id: null,
          updated_at: nowIso,
        }),
      }
    );
  }

  return json({ ok: true, processadas: conversas.length, canceladas });
}
