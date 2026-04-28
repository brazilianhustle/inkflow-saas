// ── InkFlow — Cron: audit key-expiry (§5.1) ─────────────────────────────────
// Auditor #1. Cron 0 6 * * * (03:00 BRT). Detecta secrets expirando ou
// inválidos via 3 camadas (TTL, self-check, drift opt-in). Emite eventos
// via audit-state lib seguindo dedupe policy §6.2.

import { detect } from '../../_lib/auditors/key-expiry.js';
import {
  startRun,
  endRun,
  getCurrentState,
  insertEvent,
  dedupePolicy,
  sendTelegram,
} from '../../_lib/audit-state.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

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
// alta). Outros eventos viram detalhe no payload.affected_secrets.
function collapseEvents(events) {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  const top = sorted[0];
  if (top.severity === 'clean') {
    // Run clean → não emite event aberto. Sinaliza com severity 'clean'.
    return { severity: 'clean', payload: { layer: 'aggregate', summary: 'all checks ok' }, evidence: {} };
  }
  const otherCount = sorted.length - 1;
  const allFailingNames = sorted
    .filter((e) => e.severity !== 'clean' && e.payload?.secret_name)
    .map((e) => e.payload.secret_name);
  return {
    severity: top.severity,
    payload: {
      ...top.payload,
      affected_count: sorted.filter((e) => e.severity !== 'clean').length,
      affected_secrets: allFailingNames,
      summary: otherCount > 0
        ? `${top.payload.summary} (+${otherCount} mais)`
        : top.payload.summary,
    },
    evidence: { top: top.evidence, all: sorted.map((e) => ({ severity: e.severity, secret: e.payload?.secret_name, layer: e.payload?.layer })) },
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const fetchImpl = context.fetchImpl || globalThis.fetch.bind(globalThis);

  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!env.CRON_SECRET || token !== env.CRON_SECRET) return json({ error: 'unauthorized' }, 401);

  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return json({ error: 'config_missing' }, 503);

  const supabase = { url: SUPABASE_URL, key: sbKey, fetchImpl };
  const sbHeaders = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
  };

  // Wrap audit-state fetch calls so tests can inject fetchImpl. Real prod
  // uses globalThis.fetch (audit-state imports nothing — uses global).
  const originalFetch = globalThis.fetch;
  if (context.fetchImpl) globalThis.fetch = context.fetchImpl;

  let runId;
  const actions = { fire: 0, silent: 0, supersede: 0, resolve: 0, no_op: 0 };
  let collapsed = null;
  try {
    runId = await startRun(supabase, 'key-expiry');

    // In production (no fetchImpl injected), pass globalThis.fetch so Layer 2
    // self-checks and Layer 3 drift run. In test mode (fetchImpl injected for
    // Supabase spying), skip Layer 2/3 to avoid self-check side effects.
    const detectFetchImpl = context.fetchImpl ? undefined : globalThis.fetch.bind(globalThis);
    const rawEvents = await detect({ env, fetchImpl: detectFetchImpl, now: Date.now() });
    collapsed = collapseEvents(rawEvents);

    if (collapsed) {
      const current = await getCurrentState(supabase, 'key-expiry');
      const action = dedupePolicy(current, collapsed);
      actions[action.replace('-', '_')] = (actions[action.replace('-', '_')] || 0) + 1;

      if (action === 'fire' || action === 'supersede') {
        const inserted = await insertEvent(supabase, {
          run_id: runId,
          auditor: 'key-expiry',
          severity: collapsed.severity,
          payload: collapsed.payload,
          evidence: collapsed.evidence,
        });
        await sendTelegram(env, inserted);

        if (action === 'supersede' && current) {
          await fetchImpl(`${SUPABASE_URL}/rest/v1/audit_events?id=eq.${current.id}`, {
            method: 'PATCH',
            headers: sbHeaders,
            body: JSON.stringify({
              resolved_at: new Date().toISOString(),
              resolved_reason: 'superseded',
              superseded_by: inserted.id,
            }),
            signal: AbortSignal.timeout(5000),
          });
        }
      } else if (action === 'resolve' && current) {
        await fetchImpl(`${SUPABASE_URL}/rest/v1/audit_events?id=eq.${current.id}`, {
          method: 'PATCH',
          headers: sbHeaders,
          body: JSON.stringify({
            resolved_at: new Date().toISOString(),
            resolved_reason: 'next_run_clean',
          }),
          signal: AbortSignal.timeout(5000),
        });
        await sendTelegram(env, {
          id: current.id,
          severity: 'resolved',
          auditor: 'key-expiry',
          payload: { runbook_path: 'docs/canonical/runbooks/secrets-expired.md', summary: 'key-expiry: resolved (next run clean)' },
          evidence: {},
        });
      }
      // 'silent' e 'no-op' → nada.
    }

    await endRun(supabase, runId, {
      status: 'success',
      eventsEmitted: actions.fire + actions.supersede,
    });
    return json({ ok: true, run_id: runId, events_count: collapsed ? 1 : 0, actions });
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
