// ── InkFlow — POST /api/cron/resumo-semanal ──────────────────────────────────
// Cron endpoint chamado toda segunda-feira 09:00 BRT pelo cron-worker.
// Itera por todos os tenants ativos e regenera o resumo semanal de cada um.
//
// Auth: Bearer CRON_SECRET (sem studio_token — chamado machine-to-machine).
//
// Comportamento:
//   1. Verifica Bearer CRON_SECRET — 401 se ausente ou errado.
//   2. Aceita apenas POST — 405 caso contrário.
//   3. Lista todos os tenants ativos (ativo=eq.true).
//   4. Se nenhum tenant → retorna { ok: true, processados: 0, falhas: 0, detalhes: [] }.
//   5. Para cada tenant, em loop sequencial:
//      - Busca stats das duas semanas em paralelo (Promise.all).
//      - Constrói prompt e chama LLM.
//      - PATCH tenants SET resumo_semanal_atual=resumo.
//      - Try/catch ISOLADO: falha de 1 tenant não aborta o batch.
//   6. Retorna { ok: true, processados, falhas, detalhes } com status 200
//      mesmo que alguns tenants tenham falhado.
//
// IMPORTANTE:
//   - Só atualiza `resumo_semanal_atual` — NÃO toca em `resumo_semanal_ultima_geracao_manual`.
//     Aquele campo é exclusivo do botão manual (rate-limit 1×/24h).

import { weekStartBrt } from '../../_lib/dashboard-time.js';
import { buildPrompt, callLlm } from '../../_lib/resumo-semanal-prompt.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Busca estatísticas de conversas, orçamentos, fechados e sinal_recebido
 * para um período [since, until).
 * Idêntico ao fetchStats de regenerate-resumo-semanal.js.
 */
async function fetchStats(env, fetchFn, tenantId, sinceIso, untilIso) {
  const sbKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
  };

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

/**
 * Processa um único tenant: busca stats, gera resumo via LLM, persiste via PATCH.
 * Não lança — todos os erros ficam encapsulados no retorno { ok, error }.
 */
async function processTenant(env, fetchFn, tenant, semanaAtualInicio, semanaAtualFim, semanaAnteriorInicio, semanaAnteriorFim) {
  const sbKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  // Stats das duas semanas em paralelo (OK dentro de 1 tenant)
  const [semanaAtualStats, semanaAnteriorStats] = await Promise.all([
    fetchStats(env, fetchFn, tenant.id, semanaAtualInicio.toISOString(), semanaAtualFim.toISOString()),
    fetchStats(env, fetchFn, tenant.id, semanaAnteriorInicio.toISOString(), semanaAnteriorFim.toISOString()),
  ]);

  // Chama LLM
  const prompt = buildPrompt({
    semana_atual: semanaAtualStats,
    semana_anterior: semanaAnteriorStats,
    nome_estudio: tenant.nome,
  });
  const texto = await callLlm({
    prompt,
    apiKey: env.OPENAI_API_KEY,
    fetchFn,
  });

  // Monta objeto resumo
  const agora = new Date().toISOString();
  const resumo = {
    texto,
    gerado_em: agora,
    periodo_inicio: semanaAtualInicio.toISOString(),
    periodo_fim: semanaAtualFim.toISOString(),
    modelo: 'gpt-4o-mini',
  };

  // PATCH tenants — APENAS resumo_semanal_atual.
  // NÃO toca em resumo_semanal_ultima_geracao_manual (exclusivo do botão manual).
  const patchRes = await fetchFn(
    `${SUPABASE_URL}/rest/v1/tenants?id=eq.${tenant.id}`,
    {
      method: 'PATCH',
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ resumo_semanal_atual: resumo }),
    }
  );
  if (!patchRes.ok) {
    const detail = await patchRes.text().catch(() => '');
    throw new Error(`supabase-patch ${patchRes.status}: ${detail.slice(0, 200)}`);
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  // ── Auth guard — ANTES de qualquer acesso ao DB ───────────────────────────
  const auth = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // ── Método check ──────────────────────────────────────────────────────────
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const fetchFn = globalThis.fetch.bind(globalThis);
  const sbKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  // ── 1. Lista tenants ativos ───────────────────────────────────────────────
  const tenantsRes = await fetchFn(
    `${SUPABASE_URL}/rest/v1/tenants?select=id,nome,sinal_percentual&ativo=eq.true`,
    {
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
      },
    }
  );
  if (!tenantsRes.ok) {
    const detail = await tenantsRes.text().catch(() => '');
    console.error(`cron-resumo-semanal: erro ao listar tenants ${tenantsRes.status}: ${detail.slice(0, 200)}`);
    return json({ error: 'Erro ao listar tenants' }, 500);
  }
  const tenants = await tenantsRes.json();

  // ── 0 tenants — retorno antecipado ───────────────────────────────────────
  if (!Array.isArray(tenants) || tenants.length === 0) {
    return json({ ok: true, processados: 0, falhas: 0, detalhes: [] });
  }

  // ── 2. Computa janelas de tempo BRT ──────────────────────────────────────
  const semanaAtualInicio = weekStartBrt();
  const semanaAtualFim = new Date();
  const semanaAnteriorInicio = new Date(semanaAtualInicio.getTime() - 7 * 86400_000);
  const semanaAnteriorFim = semanaAtualInicio;

  // ── 3. Loop sequencial pelos tenants ─────────────────────────────────────
  // Sequencial (não Promise.all) para evitar rate-limit pile-ups no LLM.
  let processados = 0;
  let falhas = 0;
  const detalhes = [];

  for (const tenant of tenants) {
    try {
      await processTenant(
        env,
        fetchFn,
        tenant,
        semanaAtualInicio,
        semanaAtualFim,
        semanaAnteriorInicio,
        semanaAnteriorFim
      );
      processados++;
      detalhes.push({ tenant_id: tenant.id, ok: true });
    } catch (err) {
      console.error(`cron-resumo-semanal: tenant=${tenant.id} falhou: ${err.message}`);
      falhas++;
      detalhes.push({ tenant_id: tenant.id, ok: false, error: err.message });
    }
  }

  // ── 4. Retorna 200 mesmo com falhas parciais ──────────────────────────────
  return json({ ok: true, processados, falhas, detalhes });
}
