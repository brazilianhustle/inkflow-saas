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

export function dedupePolicy(current, next, { now = Date.now() } = {}) {
  throw new Error('not implemented');
}

// ── Outbound alerts ─────────────────────────────────────────────────────────

export async function sendTelegram(env, event) {
  throw new Error('not implemented');
}

export async function sendPushover(env, event) {
  throw new Error('not implemented');
}
