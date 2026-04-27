// ── InkFlow — audit-state lib ────────────────────────────────────────────────
// Helpers compartilhados pelos auditores. Spec: docs/superpowers/specs/
// 2026-04-27-auditores-mvp-design.md §6.1.
//
// Todas as funções que tocam Supabase recebem `supabase = { url, key }` (URL
// + service_role key). Fail-open onde aplicável (Telegram/Pushover): logam
// e retornam {ok:false}, nunca throw.

export const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

// ── Run lifecycle ───────────────────────────────────────────────────────────

export async function startRun(supabase, auditor) {
  throw new Error('not implemented');
}

export async function endRun(supabase, runId, { status, eventsEmitted, errorMessage }) {
  throw new Error('not implemented');
}

// ── Event state ─────────────────────────────────────────────────────────────

export async function getCurrentState(supabase, auditor) {
  throw new Error('not implemented');
}

export async function insertEvent(supabase, evt) {
  throw new Error('not implemented');
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
