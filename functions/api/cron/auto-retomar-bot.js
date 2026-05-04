// ── InkFlow — Cron: auto-retomar bot pausado ──
// GET /api/cron/auto-retomar-bot (chamado pelo cron-worker a cada 15min, Task 7)
// Auth: Bearer CRON_SECRET
// Comportamento:
//   1. Busca conversas em estado 'pausada_tatuador' (com config_agente do tenant via embedded resource).
//   2. Pra cada uma, lê config_agente.auto_retomar_horas (null=nunca, undefined=default 6h).
//   3. Se passou o tempo configurado: applyTransition('resume') + Evolution sendMessage com mensagem_ao_retomar.

import { applyTransition } from '../conversas/_transition.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

/**
 * Função pura — filtra conversas que devem retomar baseado no tempo + config.
 * Exportada pra teste unitário sem fetch.
 *
 * Regras:
 * - estado_agente !== 'pausada_tatuador' → ignora
 * - sem pausada_em → ignora
 * - config.auto_retomar_horas === null → ignora (nunca retomar)
 * - config.auto_retomar_horas undefined → default 6h
 * - now - pausada_em > horas → retoma
 */
export function pickConversasToResume(conversas, now = new Date()) {
  const result = [];
  for (const c of conversas) {
    if (c.estado_agente !== 'pausada_tatuador') continue;
    if (!c.pausada_em) continue;
    const config = c.tenant_config_agente || {};
    if (config.auto_retomar_horas === null) continue; // explícito null = nunca
    const horas = (config.auto_retomar_horas === undefined) ? 6 : config.auto_retomar_horas;
    const cutoff = new Date(now.getTime() - horas * 3600 * 1000);
    const pausada = new Date(c.pausada_em);
    if (pausada <= cutoff) result.push(c);
  }
  return result;
}

async function fetchConversasPausadas(env) {
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  // Embedded join via select pra puxar config_agente + evo creds do tenant junto.
  const url = `${SUPABASE_URL}/rest/v1/conversas?estado_agente=eq.pausada_tatuador&select=id,tenant_id,estado_agente,estado_agente_anterior,pausada_em,telefone,tenants(config_agente,evo_instance,evo_apikey,evo_base_url)`;
  const r = await fetch(url, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  });
  if (!r.ok) {
    console.error('auto-retomar: erro ao buscar conversas pausadas', r.status);
    return [];
  }
  const rows = await r.json();
  // Achata embedded fields pra forma esperada pelo pickConversasToResume + applyResume
  return rows.map(row => ({
    ...row,
    tenant_config_agente: row.tenants?.config_agente,
    tenant_evo_instance: row.tenants?.evo_instance,
    tenant_evo_apikey: row.tenants?.evo_apikey,
    tenant_evo_base_url: row.tenants?.evo_base_url,
  }));
}

async function applyResume(env, conversa) {
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  const transition = applyTransition({
    estado_atual: conversa.estado_agente,
    action: 'resume',
    estado_agente_anterior: conversa.estado_agente_anterior,
  });
  if (transition.action === 'noop') return { ok: true, noop: true };

  // Update DB
  const upd = await fetch(`${SUPABASE_URL}/rest/v1/conversas?id=eq.${encodeURIComponent(conversa.id)}`, {
    method: 'PATCH',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      estado_agente: transition.new_state,
      estado_agente_anterior: transition.estado_agente_anterior,
      pausada_em: transition.pausada_em,
    }),
  });
  if (!upd.ok) {
    console.error(`auto-retomar: PATCH falhou conversa=${conversa.id} status=${upd.status}`);
    return { ok: false, error: 'patch_failed' };
  }

  // Send mensagem_ao_retomar via Evolution (best-effort — não falha o resume se Evolution cair)
  const config = conversa.tenant_config_agente || {};
  const mensagem = config.mensagem_ao_retomar || 'Voltei! Alguma dúvida sobre o orçamento?';
  if (conversa.telefone && conversa.tenant_evo_instance && conversa.tenant_evo_base_url && conversa.tenant_evo_apikey) {
    try {
      await fetch(`${conversa.tenant_evo_base_url}/message/sendText/${conversa.tenant_evo_instance}`, {
        method: 'POST',
        headers: {
          apikey: conversa.tenant_evo_apikey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number: conversa.telefone,
          text: mensagem,
        }),
      });
    } catch (e) {
      console.warn(`auto-retomar: Evolution sendText falhou conversa=${conversa.id}`, e?.message);
    }
  }

  return { ok: true, conversa_id: conversa.id };
}

export async function onRequest(context) {
  const { request, env } = context;
  const auth = request.headers.get('Authorization') || '';
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) {
    return new Response(JSON.stringify({ error: 'Configuração interna ausente (SUPABASE_SERVICE_KEY)' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  const conversas = await fetchConversasPausadas(env);
  const toResume = pickConversasToResume(conversas);

  console.log(`auto-retomar: ${conversas.length} pausadas total, ${toResume.length} pra retomar`);

  const results = [];
  for (const c of toResume) {
    const r = await applyResume(env, c);
    results.push({ id: c.id, ...r });
  }

  return new Response(JSON.stringify({
    ok: true,
    total_pausadas: conversas.length,
    retomadas: results.filter(r => r.ok && !r.noop).length,
    failed: results.filter(r => !r.ok).length,
    results,
  }), { headers: { 'Content-Type': 'application/json' } });
}
