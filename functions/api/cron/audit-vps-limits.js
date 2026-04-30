// functions/api/cron/audit-vps-limits.js
// ── InkFlow — Cron: audit vps-limits (§5.3) ────────────────────────────────
// Auditor #3. Routine Anthropic cron 15 */6 * * * UTC. Endpoint:
//   1. Auth Bearer CRON_SECRET
//   2. Fetch metrics ao endpoint VPS (https://n8n.inkflowbrasil.com/_health/metrics)
//   3. detect() puro → events array
//   4. collapseEvents → 1 top event (severidade max)
//   5. dedupePolicy → fire/silent/supersede/resolve
//   6. INSERT audit_events + Telegram quando aplicável

import { detect } from '../../_lib/auditors/vps-limits.js';
import {
  startRun,
  endRun,
  getCurrentState,
  insertEvent,
  dedupePolicy,
  sendTelegram,
} from '../../_lib/audit-state.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

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

// Collapse múltiplos eventos do auditor em um único top-event (severity mais
// alta). Outros eventos viram detalhe no payload.affected_symptoms.
function collapseEvents(events) {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  const top = sorted[0];
  if (top.severity === 'clean') {
    return { severity: 'clean', payload: { symptom: 'aggregate', summary: 'all checks ok' }, evidence: {} };
  }
  const otherCount = sorted.filter((e) => e.severity !== 'clean' && e !== top).length;
  const allFailingSymptoms = sorted
    .filter((e) => e.severity !== 'clean' && e.payload?.symptom)
    .map((e) => ({ symptom: e.payload.symptom, severity: e.severity }));
  return {
    severity: top.severity,
    payload: {
      ...top.payload,
      affected_count: allFailingSymptoms.length,
      affected_symptoms: allFailingSymptoms,
      summary: otherCount > 0
        ? `${top.payload.summary} (+${otherCount} sintomas)`
        : top.payload.summary,
    },
    evidence: {
      top: top.evidence,
      all: sorted.map((e) => ({ severity: e.severity, symptom: e.payload?.symptom })),
    },
  };
}

async function fetchVpsMetrics(env, fetchImpl) {
  const res = await fetchImpl(env.VPS_HEALTH_URL, {
    method: 'GET',
    headers: { 'X-Health-Token': env.VPS_HEALTH_TOKEN, Accept: 'application/json' },
    signal: timeoutSignal(8000),
  });
  if (!res.ok) {
    throw new Error(`vps_health_fetch_failed: ${res.status}`);
  }
  return res.json();
}

export async function onRequest(context) {
  const { request, env } = context;
  const fetchImpl = context.fetchImpl || globalThis.fetch.bind(globalThis);

  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!env.CRON_SECRET || token !== env.CRON_SECRET) return json({ error: 'unauthorized' }, 401);

  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return json({ error: 'config_missing', detail: 'SUPABASE_SERVICE_KEY' }, 503);
  if (!env.VPS_HEALTH_URL) return json({ error: 'config_missing', detail: 'VPS_HEALTH_URL' }, 503);
  if (!env.VPS_HEALTH_TOKEN) return json({ error: 'config_missing', detail: 'VPS_HEALTH_TOKEN' }, 503);

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
    runId = await startRun(supabase, 'vps-limits');

    const metrics = await fetchVpsMetrics(env, fetchImpl);
    const rawEvents = await detect({ env, metrics, now: Date.now() });
    collapsed = collapseEvents(rawEvents);

    if (collapsed) {
      const current = await getCurrentState(supabase, 'vps-limits');
      const action = dedupePolicy(current, collapsed);
      actions[action.replace('-', '_')] = (actions[action.replace('-', '_')] || 0) + 1;

      if (action === 'fire' || action === 'supersede') {
        const inserted = await insertEvent(supabase, {
          run_id: runId,
          auditor: 'vps-limits',
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
          auditor: 'vps-limits',
          payload: { runbook_path: null, summary: 'vps-limits: resolved (next run clean)' },
          evidence: {},
        });
      }
      // 'silent' e 'no-op' → nada.
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
