// ── InkFlow — POST /api/dashboard/regenerate-resumo-semanal ──────────────────
// Regenera o resumo semanal do estúdio sob demanda com rate-limit 1×/24h.
//
// Auth: studio_token HMAC v1 → tenant_id derivado SEMPRE do token (nunca query param).
//
// Query params:
//   studio_token (obrigatório)
//
// Rate-limit: 1 geração por 24h via tenants.resumo_semanal_ultima_geracao_manual.
//   - 429 se chamado dentro de 24h da última geração manual.
//
// Sequência (em caso de sucesso):
//   1. Valida auth (verifyStudioTokenOrLegacy)
//   2. Carrega tenant: nome, sinal_percentual, ultima_geracao_manual
//   3. Checa rate-limit (antes das operações caras)
//   4. Computa janelas BRT: semanaAtual + semanaAnterior
//   5. Busca stats para ambas janelas em paralelo (Promise.all)
//   6. Constrói prompt e chama LLM
//   7. Salva resumo via PATCH em tenants
//   8. Retorna { ok: true, resumo }
//
// Erros:
//   401 — token ausente ou inválido
//   404 — tenant não encontrado
//   429 — rate-limit 1×/24h
//   502 — erro no LLM upstream (distingue de 500 interno)
//   500 — erro interno (Supabase PATCH falhou, etc.)

import { verifyStudioTokenOrLegacy } from '../_auth-helpers.js';
import { weekStartBrt } from '../../_lib/dashboard-time.js';
import { buildPrompt, callLlm } from '../../_lib/resumo-semanal-prompt.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const RATE_LIMIT_MS = 24 * 3600_000; // 24 horas

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

/**
 * Busca estatísticas de conversas, orçamentos, fechados e sinal_recebido
 * para um período [since, until).
 *
 * @param {object} env - env bindings (SUPABASE_SERVICE_KEY)
 * @param {Function} fetchFn - fetch impl (permite mock em testes)
 * @param {string} tenantId - UUID do tenant
 * @param {string} sinceIso - ISO 8601 início do período (inclusive)
 * @param {string} untilIso - ISO 8601 fim do período (exclusive)
 * @returns {Promise<{ conversas: number, orcamentos: number, fechados: number, sinal_recebido: number }>}
 */
async function fetchStats(env, fetchFn, tenantId, sinceIso, untilIso) {
  const sbKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
  };

  // Conversas no período (usando created_at para consistência com KPIs)
  const conversasRes = await fetchFn(
    `${SUPABASE_URL}/rest/v1/conversas` +
      `?select=count` +
      `&tenant_id=eq.${tenantId}` +
      `&created_at=gte.${encodeURIComponent(sinceIso)}` +
      `&created_at=lt.${encodeURIComponent(untilIso)}`,
    { headers }
  );
  if (!conversasRes.ok) {
    const detail = await conversasRes.text().catch(() => '');
    throw new Error(`supabase-conversas ${conversasRes.status}: ${detail.slice(0, 200)}`);
  }
  const conversasRows = await conversasRes.json();
  const conversas = Number(conversasRows?.[0]?.count ?? 0);

  // Orçamentos no período (via view orcamentos)
  const orcamentosRes = await fetchFn(
    `${SUPABASE_URL}/rest/v1/orcamentos` +
      `?select=count` +
      `&tenant_id=eq.${tenantId}` +
      `&created_at=gte.${encodeURIComponent(sinceIso)}` +
      `&created_at=lt.${encodeURIComponent(untilIso)}`,
    { headers }
  );
  if (!orcamentosRes.ok) {
    const detail = await orcamentosRes.text().catch(() => '');
    throw new Error(`supabase-orcamentos ${orcamentosRes.status}: ${detail.slice(0, 200)}`);
  }
  const orcamentosRows = await orcamentosRes.json();
  const orcamentos = Number(orcamentosRows?.[0]?.count ?? 0);

  // RPC: fechados + sum_sinal por período
  const rpcRes = await fetchFn(`${SUPABASE_URL}/rest/v1/rpc/dashboard_resumo_periodo`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_since: sinceIso,
      p_until: untilIso,
    }),
  });
  if (!rpcRes.ok) {
    const detail = await rpcRes.text().catch(() => '');
    throw new Error(`rpc-resumo-periodo ${rpcRes.status}: ${detail.slice(0, 200)}`);
  }
  const rpcData = await rpcRes.json();
  const rpcRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  const fechados = Number(rpcRow?.fechados ?? 0);
  const sinal_recebido = parseFloat(rpcRow?.sum_sinal ?? 0);

  return {
    conversas,
    orcamentos,
    fechados,
    sinal_recebido: Number.isFinite(sinal_recebido) ? sinal_recebido : 0,
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  // ── Preflight ──────────────────────────────────────────────────────────────
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  // ── Método check ANTES de auth ─────────────────────────────────────────────
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(request.url);
  const studio_token = url.searchParams.get('studio_token');

  // ── Auth guard — antes de qualquer acesso ao DB ────────────────────────────
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

  // Usa globalThis.fetch diretamente para que os testes possam fazer mock.
  // callLlm aceita fetchFn como parâmetro — passamos a mesma referência.
  const fetchFn = globalThis.fetch.bind(globalThis);

  try {
    // ── 1. Carrega tenant ──────────────────────────────────────────────────
    const tenantRes = await fetchFn(
      `${SUPABASE_URL}/rest/v1/tenants` +
        `?id=eq.${tenantId}` +
        `&select=resumo_semanal_ultima_geracao_manual,nome,sinal_percentual`,
      {
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
        },
      }
    );
    if (!tenantRes.ok) {
      const detail = await tenantRes.text().catch(() => '');
      throw new Error(`supabase-tenant ${tenantRes.status}: ${detail.slice(0, 200)}`);
    }
    const tenantRows = await tenantRes.json();
    if (!Array.isArray(tenantRows) || tenantRows.length === 0) {
      return json({ error: 'Tenant não encontrado' }, 404);
    }
    const tenant = tenantRows[0];

    // ── 2. Rate-limit — ANTES das operações caras (stats + LLM) ───────────
    const ultima = tenant.resumo_semanal_ultima_geracao_manual;
    if (ultima) {
      const elapsed = Date.now() - new Date(ultima).getTime();
      if (elapsed < RATE_LIMIT_MS) {
        return json({ error: 'Já atualizado hoje, volta amanhã' }, 429);
      }
    }

    // ── 3. Janelas de tempo BRT ────────────────────────────────────────────
    const semanaAtualInicio = weekStartBrt();
    const semanaAtualFim = new Date();
    const semanaAnteriorInicio = new Date(semanaAtualInicio.getTime() - 7 * 86400_000);
    const semanaAnteriorFim = semanaAtualInicio;

    // ── 4. Stats das duas semanas em paralelo ──────────────────────────────
    const [semanaAtualStats, semanaAnteriorStats] = await Promise.all([
      fetchStats(
        env,
        fetchFn,
        tenantId,
        semanaAtualInicio.toISOString(),
        semanaAtualFim.toISOString()
      ),
      fetchStats(
        env,
        fetchFn,
        tenantId,
        semanaAnteriorInicio.toISOString(),
        semanaAnteriorFim.toISOString()
      ),
    ]);

    // ── 5. Chama LLM ───────────────────────────────────────────────────────
    // 502 se o upstream falhar (distingue de 500 interno)
    let texto;
    try {
      const prompt = buildPrompt({
        semana_atual: semanaAtualStats,
        semana_anterior: semanaAnteriorStats,
        nome_estudio: tenant.nome,
      });
      texto = await callLlm({
        prompt,
        apiKey: env.OPENAI_API_KEY,
        fetchFn,
      });
    } catch (llmErr) {
      console.error('regenerate-resumo: LLM falhou:', llmErr.message);
      return json({ error: 'Erro ao gerar resumo (LLM indisponível)' }, 502);
    }

    // ── 6. Monta objeto resumo ─────────────────────────────────────────────
    const agora = new Date().toISOString();
    const resumo = {
      texto,
      gerado_em: agora,
      periodo_inicio: semanaAtualInicio.toISOString(),
      periodo_fim: semanaAtualFim.toISOString(),
      modelo: 'gpt-4o-mini',
    };

    // ── 7. Persiste via PATCH ──────────────────────────────────────────────
    const patchRes = await fetchFn(
      `${SUPABASE_URL}/rest/v1/tenants?id=eq.${tenantId}`,
      {
        method: 'PATCH',
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          resumo_semanal_atual: resumo,
          resumo_semanal_ultima_geracao_manual: agora,
        }),
      }
    );
    if (!patchRes.ok) {
      const detail = await patchRes.text().catch(() => '');
      throw new Error(`supabase-patch ${patchRes.status}: ${detail.slice(0, 200)}`);
    }

    // ── 8. Retorna sucesso ─────────────────────────────────────────────────
    return json({ ok: true, resumo });
  } catch (err) {
    console.error('regenerate-resumo: erro interno:', err.message);
    return json({ error: 'Erro interno ao regenerar resumo' }, 500);
  }
}
