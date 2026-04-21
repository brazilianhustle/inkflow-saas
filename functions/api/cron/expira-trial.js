// ── InkFlow — Cron: expira trials de 7 dias ──────────────────────────────────
// Roda diariamente via trigger externo (UptimeRobot / n8n schedule).
// Auth: Authorization: Bearer <CRON_SECRET>
//
// Logica:
//   1. SELECT tenants WHERE status_pagamento='trial' AND trial_ate < NOW() AND ativo = true
//   2. Pra cada um: PATCH ativo=false, status_pagamento='trial_expirado'
//   3. Move do grupo MailerLite "Trial Ativo" -> "Trial Expirou" (dispara email)
//
// Rollback: env ENABLE_TRIAL_V2=false faz endpoint retornar 503.

import { moveToMailerLiteGroup } from '../../_lib/trial-helpers.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

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

  // Feature flag — rollback sem revert
  if (env.ENABLE_TRIAL_V2 === 'false') {
    return json({ disabled: true, reason: 'ENABLE_TRIAL_V2=false' }, 503);
  }

  // Auth via CRON_SECRET
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!env.CRON_SECRET || token !== env.CRON_SECRET) {
    return json({ error: 'Não autorizado' }, 401);
  }

  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return json({ error: 'Configuração ausente' }, 503);

  const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
  const now = new Date().toISOString();

  try {
    // 1. Buscar trials vencidos ainda ativos
    const qRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?status_pagamento=eq.trial&ativo=eq.true&trial_ate=lt.${encodeURIComponent(now)}&select=id,email,nome_estudio,trial_ate`,
      { headers: sbHeaders }
    );
    if (!qRes.ok) {
      const text = await qRes.text();
      console.error('expira-trial: query error', qRes.status, text);
      return json({ error: 'Erro ao buscar trials' }, 500);
    }
    const expirados = await qRes.json();
    if (!Array.isArray(expirados) || expirados.length === 0) {
      return json({ expired: 0, message: 'Nenhum trial expirado' });
    }

    // 2. PATCH cada um + mover MailerLite
    const results = [];
    for (const t of expirados) {
      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(t.id)}`,
        {
          method: 'PATCH',
          headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ ativo: false, status_pagamento: 'trial_expirado' }),
        }
      );

      let mlOk = false;
      if (t.email) {
        const mlRes = await moveToMailerLiteGroup(env, t.email, {
          from: env.MAILERLITE_GROUP_TRIAL_ATIVO,
          to: env.MAILERLITE_GROUP_TRIAL_EXPIROU,
        });
        mlOk = mlRes.ok;
      }

      results.push({
        id: t.id,
        nome_estudio: t.nome_estudio,
        email: t.email,
        trial_ate: t.trial_ate,
        db_patched: patchRes.ok,
        mailerlite_moved: mlOk,
      });

      if (patchRes.ok) {
        console.log(`expira-trial: expirou ${t.id} (${t.nome_estudio || 'sem nome'})`);
      } else {
        console.error(`expira-trial: patch falhou ${t.id}:`, await patchRes.text());
      }
    }

    const expiredCount = results.filter(r => r.db_patched).length;
    return json({
      expired: expiredCount,
      total_found: expirados.length,
      details: results,
    });
  } catch (err) {
    console.error('expira-trial exception:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}
