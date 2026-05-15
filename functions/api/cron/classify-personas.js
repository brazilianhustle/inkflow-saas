// classify-personas.js — Sub 1.A cron endpoint. Classifica conversas do TattooAgent
// sem persona_inferred via Claude Haiku 4.5.
//
// Auth: header Authorization: Bearer ${CRON_SECRET}.
// Trigger: cron-worker dispatcher (cron expression 0 3 * * * → /api/cron/classify-personas).
// Lookback: 7 dias. Batch: 10 paralelas, sleep 1s entre batches.
// Idempotente: SELECT WHERE persona_inferred IS NULL.

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

import { classifyConversation } from '../../_lib/inkflow-agent/persona-classifier.js';

const LOOKBACK_DAYS = 7;
const BATCH_SIZE = 10;
const INTER_BATCH_SLEEP_MS = 1000;
const AGENT_NAME_SCOPE = 'tattoo';

function unauthorized() {
  return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
    status: 401, headers: { 'Content-Type': 'application/json' },
  });
}

async function selectPendingConversas(env, sbKey) {
  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString();
  const url = new URL(`${SUPABASE_URL}/rest/v1/agent_turn_logs`);
  url.searchParams.set('select', 'conversa_id,tenant_id,turn_index,client_input_text,llm_output_parsed,created_at');
  url.searchParams.set('persona_inferred', 'is.null');
  url.searchParams.set('agent_name', `eq.${AGENT_NAME_SCOPE}`);
  url.searchParams.set('created_at', `gte.${sinceIso}`);
  url.searchParams.set('order', 'conversa_id.asc,turn_index.asc');
  url.searchParams.set('limit', '5000');

  const res = await fetch(url, {
    headers: {
      'apikey': sbKey,
      'Authorization': `Bearer ${sbKey}`,
    },
  });
  if (!res.ok) throw new Error(`supabase select ${res.status}: ${await res.text()}`);
  return res.json();
}

function groupByConversa(rows) {
  const byConv = new Map();
  for (const r of rows) {
    if (!byConv.has(r.conversa_id)) byConv.set(r.conversa_id, { tenant_id: r.tenant_id, turns: [] });
    const conv = byConv.get(r.conversa_id);
    conv.turns.push({
      turn_index: r.turn_index,
      role: 'user',
      content: r.client_input_text || '',
    });
    const assistantText = r.llm_output_parsed?.resposta_cliente || '';
    if (assistantText) {
      conv.turns.push({
        turn_index: r.turn_index,
        role: 'agent',
        content: assistantText,
      });
    }
  }
  return byConv;
}

async function updatePersona(env, sbKey, conversa_id, persona_id) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/agent_turn_logs`);
  url.searchParams.set('conversa_id', `eq.${conversa_id}`);
  url.searchParams.set('persona_inferred', 'is.null');
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': sbKey,
      'Authorization': `Bearer ${sbKey}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ persona_inferred: persona_id }),
  });
  if (!res.ok) throw new Error(`supabase patch ${res.status}: ${await res.text()}`);
}

async function processBatch(env, sbKey, batch, dryRun, stats) {
  await Promise.all(batch.map(async ([conversa_id, { turns }]) => {
    const result = await classifyConversation({ transcript: turns, env });
    if (!result) {
      stats.skipped_low_conf_or_error++;
      return;
    }
    stats.classified++;
    if (dryRun) {
      console.log(`[dry-run] conv=${conversa_id} -> ${result.persona_id} (conf=${result.confianca.toFixed(2)}) razao=${result.razao}`);
      return;
    }
    try {
      await updatePersona(env, sbKey, conversa_id, result.persona_id);
      console.log(`[ok] conv=${conversa_id} -> ${result.persona_id} conf=${result.confianca.toFixed(2)}`);
    } catch (err) {
      console.warn(`[update-fail] conv=${conversa_id}:`, err.message);
      stats.update_errors++;
    }
  }));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function onRequestPost({ request, env }) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!env.CRON_SECRET || token !== env.CRON_SECRET) return unauthorized();

  const sbKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbKey) {
    return new Response(JSON.stringify({ ok: false, error: 'config_missing' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dry_run') === 'true';

  const t0 = Date.now();
  const stats = { rows_read: 0, conversas_total: 0, conversas_processed: 0, classified: 0, skipped_low_conf_or_error: 0, update_errors: 0, truncated_by_time_budget: false };

  let rows;
  try { rows = await selectPendingConversas(env, sbKey); }
  catch (err) {
    console.error('[classify-personas] select failed:', err.message);
    return new Response(JSON.stringify({ ok: false, error: 'select_failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  stats.rows_read = rows.length;

  const byConv = groupByConversa(rows);
  stats.conversas_total = byConv.size;

  const entries = [...byConv.entries()];
  const WALL_CLOCK_BUDGET_MS = 25000;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    if (Date.now() - t0 > WALL_CLOCK_BUDGET_MS) {
      stats.truncated_by_time_budget = true;
      console.warn(`[classify-personas] wall-clock budget hit at conv ${i}/${entries.length}`);
      break;
    }
    const batch = entries.slice(i, i + BATCH_SIZE);
    await processBatch(env, sbKey, batch, dryRun, stats);
    stats.conversas_processed += batch.length;
    if (i + BATCH_SIZE < entries.length) await sleep(INTER_BATCH_SLEEP_MS);
  }

  const summary = { ok: true, dry_run: dryRun, latency_ms: Date.now() - t0, ...stats };
  console.log('[classify-personas] summary:', JSON.stringify(summary));
  return new Response(JSON.stringify(summary), { headers: { 'Content-Type': 'application/json' } });
}
