// ── InkFlow — Cleanup de tenants orfaos (Cloudflare Pages Function) ──────────
// Deleta tenants abandonados em 3 categorias:
//   1. rascunho (>48h) — criou perfil mas nunca foi ao pagamento
//   2. pendente (>72h, inativo, sem assinatura) — foi ao pagamento mas nao pagou
//   3. artist_slot (>7d, inativo) — convite de artista nao aceito
// Tambem deleta a instancia correspondente na Evolution API para evitar orfas.
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
    const sbHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

    // ── 1. Buscar tenants orfaos em 3 categorias ─────────────────────────
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const cutoff72h = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const cutoff7d  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Cat 1: rascunho sem pagamento (>48h) — fluxo original
    const q1 = fetch(
      `${SUPABASE_URL}/rest/v1/tenants?status_pagamento=eq.rascunho&mp_subscription_id=is.null&created_at=lt.${encodeURIComponent(cutoff48h)}&select=id,nome_estudio,email,created_at,evo_instance,status_pagamento`,
      { headers: sbHeaders }
    );

    // Cat 2: pendente, inativo, sem assinatura (>72h) — abandonou pagamento
    const q2 = fetch(
      `${SUPABASE_URL}/rest/v1/tenants?status_pagamento=eq.pendente&ativo=eq.false&mp_subscription_id=is.null&created_at=lt.${encodeURIComponent(cutoff72h)}&select=id,nome_estudio,email,created_at,evo_instance,status_pagamento`,
      { headers: sbHeaders }
    );

    // Cat 3: artist_slot inativo sem WhatsApp conectado (>7d) — convite nao aceito
    const q3 = fetch(
      `${SUPABASE_URL}/rest/v1/tenants?status_pagamento=eq.artist_slot&ativo=eq.false&created_at=lt.${encodeURIComponent(cutoff7d)}&select=id,nome_estudio,email,created_at,evo_instance,status_pagamento`,
      { headers: sbHeaders }
    );

    const [res1, res2, res3] = await Promise.all([q1, q2, q3]);

    if (!res1.ok || !res2.ok || !res3.ok) {
      const errText = (!res1.ok ? await res1.text() : '') || (!res2.ok ? await res2.text() : '') || await res3.text();
      console.error('cleanup-tenants: search error:', errText);
      return json({ error: 'Erro ao buscar tenants' }, 500);
    }

    const [list1, list2, list3] = await Promise.all([res1.json(), res2.json(), res3.json()]);

    // Deduplicar por id (caso raro de overlap)
    const seen = new Set();
    const staleTeams = [];
    for (const t of [...list1, ...list2, ...list3]) {
      if (!seen.has(t.id)) { seen.add(t.id); staleTeams.push(t); }
    }

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
        evo_instance: tenant.evo_instance,
        categoria: tenant.status_pagamento,
        evo_deleted: evoDeleted,
        db_deleted: delRes.ok,
      });

      if (delRes.ok) {
        console.log(`cleanup-tenants: deleted orphan tenant ${tenant.id} (${tenant.nome_estudio}, status=${tenant.status_pagamento})`);
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
      by_category: {
        rascunho: results.filter(r => r.categoria === 'rascunho').length,
        pendente: results.filter(r => r.categoria === 'pendente').length,
        artist_slot: results.filter(r => r.categoria === 'artist_slot').length,
      },
      details: results,
    });

  } catch (err) {
    console.error('cleanup-tenants exception:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}
