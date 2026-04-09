// ── InkFlow — Cleanup de tenants rascunho (Cloudflare Pages Function) ────────
// Deleta tenants com status_pagamento='rascunho' e sem mp_subscription_id
// que foram criados há mais de 48 horas.
// Também deleta a instância correspondente na Evolution API para evitar órfãs.
//
// POST /api/cleanup-tenants
// Header: Authorization: Bearer <CLEANUP_SECRET>
//
// Env vars necessárias:
//   - SUPABASE_SERVICE_KEY
//   - CLEANUP_SECRET
//   - EVO_BASE_URL (opcional, default: https://evo.inkflowbrasil.com)
//   - EVO_GLOBAL_KEY (API key global da Evolution API)
//
// Pode ser chamado por:
//   - Cron job externo (ex: n8n scheduled workflow, UptimeRobot, etc.)
//   - Manualmente pelo admin
//
// Bug 3 fix: evita acúmulo de tenants órfãos criados antes do pagamento.
// Bug 2 fix: agora também deleta instância na Evolution API.

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

  // ── Autenticação simples via secret ──────────────────────────────────────
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  const CLEANUP_SECRET = env.CLEANUP_SECRET;

  if (!CLEANUP_SECRET || token !== CLEANUP_SECRET) {
    return json({ error: 'Não autorizado' }, 401);
  }

  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return json({ error: 'Configuração interna ausente' }, 503);

  try {
    // ── 1. Buscar tenants rascunho com mais de 48h ─────────────────────────
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const searchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?status_pagamento=eq.rascunho&mp_subscription_id=is.null&created_at=lt.${encodeURIComponent(cutoff)}&select=id,nome_estudio,email,created_at,evo_instance`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      console.error('cleanup-tenants: search error:', errText);
      return json({ error: 'Erro ao buscar tenants' }, 500);
    }

    const staleTeams = await searchRes.json();

    if (!staleTeams || staleTeams.length === 0) {
      return json({ cleaned: 0, message: 'Nenhum rascunho antigo encontrado' });
    }

    // ── 2. Deletar cada tenant rascunho ────────────────────────────────────
    const results = [];

    const EVO_BASE_URL = env.EVO_BASE_URL || 'https://evo.inkflowbrasil.com';
    const EVO_GLOBAL_KEY = env.EVO_GLOBAL_KEY || '';

    for (const tenant of staleTeams) {
      let evoDeleted = false;

      // ── 2a. Deletar instância na Evolution API (se existir) ──────────────
      if (tenant.evo_instance) {
        try {
          const evoRes = await fetch(
            `${EVO_BASE_URL}/instance/delete/${encodeURIComponent(tenant.evo_instance)}`,
            {
              method: 'DELETE',
              headers: { apikey: EVO_GLOBAL_KEY },
            }
          );
          evoDeleted = evoRes.ok;
          if (evoRes.ok) {
            console.log(`cleanup-tenants: deleted EVO instance '${tenant.evo_instance}'`);
          } else {
            console.warn(`cleanup-tenants: EVO delete failed for '${tenant.evo_instance}':`, await evoRes.text());
          }
        } catch (evoErr) {
          console.warn(`cleanup-tenants: EVO delete error for '${tenant.evo_instance}':`, evoErr.message);
        }
      }

      // ── 2b. Deletar do Supabase ──────────────────────────────────────────
      const delRes = await fetch(
        `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant.id)}`,
        {
          method: 'DELETE',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            Prefer: 'return=minimal',
          },
        }
      );

      results.push({
        id: tenant.id,
        estudio: tenant.nome_estudio,
        email: tenant.email,
        created_at: tenant.created_at,
        evo_instance: tenant.evo_instance,
        evo_deleted: evoDeleted,
        db_deleted: delRes.ok,
      });

      if (delRes.ok) {
        console.log(`cleanup-tenants: deleted stale draft tenant ${tenant.id} (${tenant.nome_estudio})`);
      } else {
        console.error(`cleanup-tenants: failed to delete ${tenant.id}:`, await delRes.text());
      }
    }

    const cleaned = results.filter(r => r.db_deleted).length;
    const evoCleanedCount = results.filter(r => r.evo_deleted).length;

    return json({
      cleaned,
      evo_cleaned: evoCleanedCount,
      total_found: staleTeams.length,
      details: results,
    });

  } catch (err) {
    console.error('cleanup-tenants exception:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}
