// ── InkFlow — Cron: audit escalation (§6.5) ─────────────────────────────────
// Cron */5 * * * * → SELECT critical sem ack >2h → Pushover priority=2 +
// PATCH escalated_at. Coluna dedicada (não confunde com ack humano em
// acknowledged_*).

import { sendPushover } from '../../_lib/audit-state.js';

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

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!env.CRON_SECRET || token !== env.CRON_SECRET) return json({ error: 'unauthorized' }, 401);

  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return json({ error: 'config_missing' }, 503);

  const sbHeaders = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
  };

  // detected_at < now() - 2h, severity=critical, sem ack, sem escalation, sem resolved
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const url = `${SUPABASE_URL}/rest/v1/audit_events`
    + `?severity=eq.critical`
    + `&resolved_at=is.null`
    + `&acknowledged_at=is.null`
    + `&escalated_at=is.null`
    + `&detected_at=lt.${cutoff}`
    + `&select=id,auditor,payload,evidence,severity,detected_at`;

  const queryRes = await fetch(url, {
    headers: sbHeaders,
    signal: timeoutSignal(8000),
  });
  if (!queryRes.ok) {
    console.error('audit-escalate: query failed:', queryRes.status);
    return json({ error: 'query_failed' }, 502);
  }
  const rows = await queryRes.json();

  let escalated = 0;
  let skippedConfig = 0;
  let errored = 0;
  for (const evt of rows) {
    const result = await sendPushover(env, evt);
    if (result.skipped) {
      skippedConfig += 1;
      console.warn(`audit-escalate: pushover skipped for ${evt.id} — PUSHOVER_* env ausente`);
      continue;
    }
    if (!result.ok) {
      errored += 1;
      console.error(`audit-escalate: pushover error for ${evt.id}:`, result.error);
      continue;
    }
    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/audit_events?id=eq.${evt.id}`, {
      method: 'PATCH',
      headers: sbHeaders,
      body: JSON.stringify({ escalated_at: new Date().toISOString() }),
      signal: timeoutSignal(8000),
    });
    if (patchRes.ok) escalated += 1;
    else {
      errored += 1;
      console.error(`audit-escalate: patch failed for ${evt.id}:`, patchRes.status);
    }
  }

  return json({
    ok: true,
    escalated_count: escalated,
    skipped_count: skippedConfig,
    error_count: errored,
    candidates: rows.length,
  });
}
