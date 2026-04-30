// functions/api/cron/audit-rls-drift.js
// ── InkFlow — Cron: audit rls-drift (§5.4) ─────────────────────────────────
// Auditor #4. Endpoint CF Pages como FALLBACK da Routine Anthropic primary.
// Routine genuína via /schedule (caminho A) faz reasoning Claude por cima
// deste detect determinístico. Se Routine quebrar (CCR allowlist mudar),
// pivot path: descomentar trigger no cron-worker/wrangler.toml + redeploy
// (~30min). Detalhes: docs/canonical/decisions/2026-04-30-rls-drift-architecture.md
//
// DEVIATION (2026-04-30): spec §5.4 cravou /v1/.../advisors REST que NÃO
// existe (404). Pivotamos pra 2 SQL queries paralelas via /database/query
// (validado funciona com SUPABASE_PAT).

import { detect } from '../../_lib/auditors/rls-drift.js';
import {
  startRun,
  endRun,
  getCurrentState,
  insertEvent,
  dedupePolicy,
  sendTelegram,
} from '../../_lib/audit-state.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const SUPABASE_MGMT_BASE = 'https://api.supabase.com';
const SUPABASE_PROJECT_REF = 'bfzuxxuscyplfoimvomh';

const SQL_TABLES_NO_RLS = `SELECT n.nspname AS schema, c.relname AS table_name FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE c.relkind = 'r' AND n.nspname = 'public' AND NOT c.relrowsecurity ORDER BY c.relname`;

const SQL_FUNCTIONS_NO_SEARCH_PATH = `SELECT n.nspname AS schema, p.proname AS function_name FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.prokind = 'f' AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=%')) ORDER BY p.proname`;

function timeoutSignal(ms) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function severityRank(s) {
  return s === 'critical' ? 3 : s === 'warn' ? 2 : s === 'clean' ? 1 : 0;
}

// Collapse múltiplos eventos do auditor em um único top-event (severity max).
// Empty array → state limpo (zero drift detectado) — sinaliza pra dedupePolicy
// disparar resolve se houver evento crítico aberto. Diferente dos outros
// auditores (vps-limits, billing-flow) que sempre emitem ≥1 event com severity
// clean por sintoma, rls-drift retorna empty quando schema tá limpo (cada row
// das SQL queries representa um issue, não um check OK).
function collapseEvents(events) {
  if (events.length === 0) {
    return { severity: 'clean', payload: { symptom: 'aggregate', summary: 'no rls drift detected' }, evidence: {} };
  }
  const sorted = [...events].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  const top = sorted[0];
  if (top.severity === 'clean') {
    return { severity: 'clean', payload: { symptom: 'aggregate', summary: 'no rls drift detected' }, evidence: {} };
  }
  const otherCount = sorted.filter((e) => e.severity !== 'clean' && e !== top).length;
  const allFailingSymptoms = sorted
    .filter((e) => e.severity !== 'clean' && e.payload?.symptom)
    .map((e) => ({ symptom: e.payload.symptom, severity: e.severity, object: e.payload.object }));
  return {
    severity: top.severity,
    payload: {
      ...top.payload,
      affected_count: allFailingSymptoms.length,
      affected_findings: allFailingSymptoms,
      summary: otherCount > 0
        ? `${top.payload.summary} (+${otherCount} findings)`
        : top.payload.summary,
    },
    evidence: {
      top: top.evidence,
      all: sorted.map((e) => ({ severity: e.severity, symptom: e.payload?.symptom, object: e.payload?.object })),
    },
  };
}

async function executeSql(query, env, fetchImpl) {
  const res = await fetchImpl(`${SUPABASE_MGMT_BASE}/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
    signal: timeoutSignal(8000),
  });
  if (!res.ok) {
    throw new Error(`supabase_sql_query_failed: ${res.status}`);
  }
  return await res.json();
}

async function fetchSchemaState(env, fetchImpl) {
  // 2 SQL queries paralelas via Supabase Management API /database/query
  const [tables_no_rls, functions_no_search_path] = await Promise.all([
    executeSql(SQL_TABLES_NO_RLS, env, fetchImpl),
    executeSql(SQL_FUNCTIONS_NO_SEARCH_PATH, env, fetchImpl),
  ]);
  return {
    tables_no_rls: Array.isArray(tables_no_rls) ? tables_no_rls : [],
    functions_no_search_path: Array.isArray(functions_no_search_path) ? functions_no_search_path : [],
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const fetchImpl = context.fetchImpl || globalThis.fetch.bind(globalThis);

  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!env.CRON_SECRET || token !== env.CRON_SECRET) return json({ error: 'unauthorized' }, 401);

  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return json({ error: 'config_missing', detail: 'SUPABASE_SERVICE_KEY' }, 503);
  if (!env.SUPABASE_PAT) return json({ error: 'config_missing', detail: 'SUPABASE_PAT' }, 503);

  const supabase = { url: SUPABASE_URL, key: sbKey, fetchImpl };
  const sbHeaders = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
  };

  const originalFetch = globalThis.fetch;
  if (context.fetchImpl) globalThis.fetch = context.fetchImpl;

  let runId;
  const actions = { fire: 0, silent: 0, supersede: 0, resolve: 0, no_op: 0 };
  let collapsed = null;

  try {
    runId = await startRun(supabase, 'rls-drift');

    const schemaState = await fetchSchemaState(env, fetchImpl);
    const rawEvents = await detect({ env, schemaState, now: Date.now() });
    collapsed = collapseEvents(rawEvents);

    if (collapsed) {
      const current = await getCurrentState(supabase, 'rls-drift');
      const action = dedupePolicy(current, collapsed);
      actions[action.replace('-', '_')] = (actions[action.replace('-', '_')] || 0) + 1;

      if (action === 'fire' || action === 'supersede') {
        const inserted = await insertEvent(supabase, {
          run_id: runId,
          auditor: 'rls-drift',
          severity: collapsed.severity,
          payload: collapsed.payload,
          evidence: collapsed.evidence,
        });
        await sendTelegram(env, inserted);

        if (action === 'supersede' && current) {
          await fetchImpl(`${SUPABASE_URL}/rest/v1/audit_events?id=eq.${current.event_id}`, {
            method: 'PATCH',
            headers: sbHeaders,
            body: JSON.stringify({
              resolved_at: new Date().toISOString(),
              resolved_reason: 'superseded',
              superseded_by: inserted.id,
            }),
            signal: timeoutSignal(5000),
          });
        }
      } else if (action === 'resolve' && current) {
        await fetchImpl(`${SUPABASE_URL}/rest/v1/audit_events?id=eq.${current.event_id}`, {
          method: 'PATCH',
          headers: sbHeaders,
          body: JSON.stringify({
            resolved_at: new Date().toISOString(),
            resolved_reason: 'next_run_clean',
          }),
          signal: timeoutSignal(5000),
        });
        await sendTelegram(env, {
          id: current.event_id,
          severity: 'resolved',
          auditor: 'rls-drift',
          payload: { runbook_path: null, summary: 'rls-drift: resolved (next run clean)' },
          evidence: {},
        });
      }
    }

    await endRun(supabase, runId, {
      status: 'success',
      eventsEmitted: actions.fire + actions.supersede,
    });
    return json({ ok: true, run_id: runId, events_count: collapsed && collapsed.severity !== 'clean' ? 1 : 0, actions });
  } catch (err) {
    if (runId) {
      try {
        await endRun(supabase, runId, {
          status: 'error',
          eventsEmitted: 0,
          errorMessage: err.message,
        });
      } catch { /* ignore */ }
    }
    return json({ error: 'internal_error', message: err.message }, 500);
  } finally {
    if (context.fetchImpl) globalThis.fetch = originalFetch;
  }
}
