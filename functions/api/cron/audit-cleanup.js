// ── InkFlow — Cron: audit cleanup (§6.6) ────────────────────────────────────
// Cron 0 4 * * 1 (segunda 01:00 BRT) — DELETE audit_events resolved >90d e
// audit_runs >30d.

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

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

  const eventsCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const runsCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const eventsUrl = `${SUPABASE_URL}/rest/v1/audit_events`
    + `?resolved_at=not.is.null&resolved_at=lt.${eventsCutoff}`;
  const runsUrl = `${SUPABASE_URL}/rest/v1/audit_runs?started_at=lt.${runsCutoff}`;

  const [eventsRes, runsRes] = await Promise.all([
    fetch(eventsUrl, { method: 'DELETE', headers: sbHeaders }),
    fetch(runsUrl, { method: 'DELETE', headers: sbHeaders }),
  ]);

  return json({
    ok: true,
    events_deleted: eventsRes.ok,
    runs_deleted: runsRes.ok,
    events_status: eventsRes.status,
    runs_status: runsRes.status,
  });
}
