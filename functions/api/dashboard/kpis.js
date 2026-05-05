// ── InkFlow — GET /api/dashboard/kpis ──────────────────────────────────────
// Retorna 5 KPIs do painel Dashboard do estúdio.
//
// Auth: studio_token HMAC v1 → tenant_id derivado SEMPRE do token (nunca query param).
//
// Query params:
//   studio_token (obrigatório)
//
// Response 200: {
//   ok: true,
//   kpis: {
//     conversas_hoje: <int>,
//     orcamentos_esta_semana: <int>,
//     aguardando_sinal: <int>,
//     taxa_conversao_30d: <int 0-100>,
//     sinal_recebido_semana: <number>
//   }
// }

import { verifyStudioTokenOrLegacy } from '../_auth-helpers.js';
import { todayStartBrt, weekStartBrt, daysAgoBrt } from '../../_lib/dashboard-time.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

/**
 * Consulta PostgREST com `select=count` e retorna o valor inteiro.
 * PostgREST retorna [{ count: N }] quando select=count e há RLS/data.
 * @param {string} sbKey — SUPABASE_SERVICE_KEY
 * @param {string} path — path + query string relativo ao SUPABASE_URL
 * @returns {Promise<number>}
 */
async function supaCount(sbKey, path) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`supabase-count ${res.status}: ${detail.slice(0, 200)}`);
  }
  const rows = await res.json();
  return Number(rows?.[0]?.count ?? 0);
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(request.url);
  const studio_token = url.searchParams.get('studio_token');

  // Auth guard — antes de qualquer acesso ao DB
  if (!studio_token) return json({ error: 'studio_token obrigatório' }, 401);

  const sbKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbKey) return json({ error: 'Configuração interna ausente' }, 503);

  const verified = await verifyStudioTokenOrLegacy({
    token: studio_token,
    secret: env.STUDIO_TOKEN_SECRET,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: sbKey,
  });
  if (!verified) return json({ error: 'studio_token inválido' }, 401);

  // SECURITY: tenant_id SEMPRE derivado do token verificado — NUNCA da query.
  const tenantId = verified.tenantId;

  // Janelas de tempo BRT (UTC-3 ano-redondo, sem DST)
  const todayBrt = todayStartBrt().toISOString();
  const weekBrt = weekStartBrt().toISOString();
  const days30Brt = daysAgoBrt(30).toISOString();

  try {
    // ── K1: Conversas hoje ──────────────────────────────────────────────────
    const conversasHoje = await supaCount(
      sbKey,
      `/rest/v1/conversas?select=count&tenant_id=eq.${tenantId}&last_msg_at=gte.${encodeURIComponent(todayBrt)}`
    );

    // ── K2: Orçamentos esta semana (via view orcamentos) ────────────────────
    const orcamentosSemana = await supaCount(
      sbKey,
      `/rest/v1/orcamentos?select=count&tenant_id=eq.${tenantId}&created_at=gte.${encodeURIComponent(weekBrt)}`
    );

    // ── K3: Aguardando sinal ────────────────────────────────────────────────
    const aguardandoSinal = await supaCount(
      sbKey,
      `/rest/v1/conversas?select=count&tenant_id=eq.${tenantId}&estado_agente=eq.aguardando_sinal`
    );

    // ── K4: Taxa conversão últimos 30d (RPC Postgres) ───────────────────────
    // RPC retorna TABLE(fechados BIGINT, total BIGINT) → array de 1 row
    const k4Res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/dashboard_taxa_conversao`, {
      method: 'POST',
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_tenant_id: tenantId, p_since: days30Brt }),
    });

    let taxaConversao = 0;
    if (k4Res.ok) {
      const k4Data = await k4Res.json();
      const row = Array.isArray(k4Data) ? k4Data[0] : k4Data;
      const fechados = Number(row?.fechados ?? 0);
      const total = Number(row?.total ?? 0);
      // GUARD: divisão por zero → 0
      taxaConversao = total > 0 ? Math.round((fechados / total) * 100) : 0;
    } else {
      const errText = await k4Res.text().catch(() => '');
      console.error('kpis: dashboard_taxa_conversao RPC falhou', k4Res.status, errText.slice(0, 200));
      throw new Error(`rpc-taxa-conversao ${k4Res.status}`);
    }

    // ── K5: Sinal recebido na semana (RPC Postgres) ─────────────────────────
    // RPC retorna TABLE(sum_sinal NUMERIC) → array de 1 row
    const k5Res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/dashboard_sinal_recebido`, {
      method: 'POST',
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_tenant_id: tenantId, p_since: weekBrt }),
    });

    let sinalRecebido = 0;
    if (k5Res.ok) {
      const k5Data = await k5Res.json();
      const row = Array.isArray(k5Data) ? k5Data[0] : k5Data;
      sinalRecebido = parseFloat(row?.sum_sinal ?? 0);
      if (!Number.isFinite(sinalRecebido)) sinalRecebido = 0;
    } else {
      const errText = await k5Res.text().catch(() => '');
      console.error('kpis: dashboard_sinal_recebido RPC falhou', k5Res.status, errText.slice(0, 200));
      throw new Error(`rpc-sinal-recebido ${k5Res.status}`);
    }

    return json({
      ok: true,
      kpis: {
        conversas_hoje: conversasHoje,
        orcamentos_esta_semana: orcamentosSemana,
        aguardando_sinal: aguardandoSinal,
        taxa_conversao_30d: taxaConversao,
        sinal_recebido_semana: sinalRecebido,
      },
    });
  } catch (err) {
    console.error('kpis: erro ao calcular KPIs:', err.message);
    return json({ error: 'Erro ao calcular KPIs' }, 500);
  }
}
