// ── InkFlow — Cron: audit cleanup (§6.6) ────────────────────────────────────
// Cron 0 4 * * 1 (segunda 01:00 BRT) — DELETE audit_events resolved >90d e
// audit_runs >30d.
//
// Hardening 2026-05-06: timeout 8s→15s + try/catch externo grácil. Mesma
// motivação que audit-escalate.js — evita 500-default CF Pages quando
// Supabase REST der hiccup.

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const FETCH_TIMEOUT_MS = 15000;

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

  try {
    const eventsCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const runsCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const eventsUrl = `${SUPABASE_URL}/rest/v1/audit_events`
      + `?resolved_at=not.is.null&resolved_at=lt.${eventsCutoff}`;
    const runsUrl = `${SUPABASE_URL}/rest/v1/audit_runs?started_at=lt.${runsCutoff}`;

    const [eventsRes, runsRes] = await Promise.all([
      fetch(eventsUrl, {
        method: 'DELETE',
        headers: sbHeaders,
        signal: timeoutSignal(FETCH_TIMEOUT_MS),
      }),
      fetch(runsUrl, {
        method: 'DELETE',
        headers: sbHeaders,
        signal: timeoutSignal(FETCH_TIMEOUT_MS),
      }),
    ]);

    return json({
      ok: true,
      events_deleted: eventsRes.ok,
      runs_deleted: runsRes.ok,
      events_status: eventsRes.status,
      runs_status: runsRes.status,
    });
  } catch (err) {
    const isTransient = err.name === 'AbortError' || err.name === 'TimeoutError';
    console.error(`audit-cleanup: ${isTransient ? 'transient' : 'unhandled'} exception:`, err.name, err.message);
    return json({
      error: isTransient ? 'transient_timeout' : 'internal_error',
      error_name: err.name,
      message: err.message,
    }, isTransient ? 504 : 500);
  }
}
