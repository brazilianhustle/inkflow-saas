// ── InkFlow — audit-state lib ────────────────────────────────────────────────
// Helpers compartilhados pelos auditores. Spec: docs/superpowers/specs/
// 2026-04-27-auditores-mvp-design.md §6.1.
//
// Todas as funções que tocam Supabase recebem `supabase = { url, key }` (URL
// + service_role key). Fail-open onde aplicável (Telegram/Pushover): logam
// e retornam {ok:false}, nunca throw.

export const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

function sbHeaders(supabase, extra = {}) {
  return {
    apikey: supabase.key,
    Authorization: `Bearer ${supabase.key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

// ── Run lifecycle ───────────────────────────────────────────────────────────

export async function startRun(supabase, auditor) {
  const res = await fetch(`${supabase.url}/rest/v1/audit_runs`, {
    method: 'POST',
    headers: sbHeaders(supabase, { Prefer: 'return=representation' }),
    body: JSON.stringify({ auditor, status: 'running' }),
  });
  if (!res.ok) throw new Error(`startRun failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows[0].id;
}

export async function endRun(supabase, runId, { status, eventsEmitted = 0, errorMessage = null }) {
  const patch = { status, completed_at: new Date().toISOString(), events_emitted: eventsEmitted };
  if (errorMessage) patch.error_message = errorMessage;
  const res = await fetch(`${supabase.url}/rest/v1/audit_runs?id=eq.${runId}`, {
    method: 'PATCH',
    headers: sbHeaders(supabase),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`endRun failed: ${res.status} ${await res.text()}`);
}

// ── Event state ─────────────────────────────────────────────────────────────

export async function getCurrentState(supabase, auditor) {
  const url = `${supabase.url}/rest/v1/audit_current_state?auditor=eq.${encodeURIComponent(auditor)}&limit=1`;
  const res = await fetch(url, { headers: sbHeaders(supabase) });
  if (!res.ok) throw new Error(`getCurrentState failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows.length === 0 ? null : rows[0];
}

export async function insertEvent(supabase, evt) {
  const res = await fetch(`${supabase.url}/rest/v1/audit_events`, {
    method: 'POST',
    headers: sbHeaders(supabase, { Prefer: 'return=representation' }),
    body: JSON.stringify(evt),
  });
  if (!res.ok) throw new Error(`insertEvent failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows[0];
}

// ── Dedupe policy (pure) ────────────────────────────────────────────────────

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function dedupePolicy(current, next, { now = Date.now() } = {}) {
  const isOpen = (s) => s === 'warn' || s === 'critical';
  const isClean = (s) => s === 'clean';

  if (!current) {
    if (isOpen(next.severity)) return 'fire';
    return 'no-op';
  }

  if (isClean(next.severity)) return 'resolve';

  if (current.severity === 'warn' && next.severity === 'critical') return 'supersede';

  if (current.severity === 'critical' && next.severity === 'warn') return 'silent';

  if (current.severity === next.severity) {
    const lastAlert = current.last_alerted_at ? new Date(current.last_alerted_at).getTime() : 0;
    const elapsed = now - lastAlert;
    return elapsed >= TWENTY_FOUR_HOURS_MS ? 'fire' : 'silent';
  }

  return 'silent';
}

// ── Outbound alerts ─────────────────────────────────────────────────────────

export async function sendTelegram(env, event) {
  throw new Error('not implemented');
}

export async function sendPushover(env, event) {
  throw new Error('not implemented');
}
