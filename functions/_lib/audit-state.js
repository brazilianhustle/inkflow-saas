// ── InkFlow — audit-state lib ────────────────────────────────────────────────
// Helpers compartilhados pelos auditores. Spec: docs/superpowers/specs/
// 2026-04-27-auditores-mvp-design.md §6.1.
//
// Todas as funções que tocam Supabase recebem `supabase = { url, key }` (URL
// + service_role key). Fail-open onde aplicável (Telegram/Pushover): logam
// e retornam {ok:false}, nunca throw.

export const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

function timeoutSignal(ms) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

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

function eventIdShort(uuid) {
  return uuid.slice(0, 8);
}

function basenameOf(p) {
  if (!p) return 'none';
  const idx = p.lastIndexOf('/');
  return idx === -1 ? p : p.slice(idx + 1);
}

function formatTelegramText(event) {
  const p = event.payload || {};
  const idShort = eventIdShort(event.id);
  const runbookFile = basenameOf(p.runbook_path);
  const evidenceShort = event.evidence
    ? JSON.stringify(event.evidence).slice(0, 120)
    : 'n/a';

  const lines = [
    `[${event.severity}] [${event.auditor}] ${p.summary || '(sem summary)'}`,
    `ID: ${idShort} | Runbook: ${runbookFile}`,
  ];
  if (p.suggested_subagent) {
    lines.push(`Suggested: @${p.suggested_subagent}`);
  }
  lines.push(`Evidence: ${evidenceShort}`);
  lines.push(`Reply "ack ${idShort}" pra acknowledge.`);

  return lines.join('\n');
}

export async function sendTelegram(env, event) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('audit: TELEGRAM_* ausente, alerta não enviado');
    return { ok: false, skipped: true };
  }
  try {
    const text = formatTelegramText(event);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: timeoutSignal(5000),
    });
    return { ok: res.ok };
  } catch (e) {
    console.error('audit: Telegram send failed:', e.message);
    return { ok: false, error: e.message };
  }
}

export async function sendPushover(env, event) {
  const token = env.PUSHOVER_APP_TOKEN;
  const user = env.PUSHOVER_USER_KEY;
  if (!token || !user) {
    console.warn('audit: PUSHOVER_* ausente, escalation não enviado');
    return { ok: false, skipped: true };
  }
  try {
    const p = event.payload || {};
    const idShort = eventIdShort(event.id);
    const params = new URLSearchParams({
      token, user,
      title: `[CRITICAL ESCALATION] ${event.auditor}`,
      message: `${p.summary || ''} (id: ${idShort}). Sem ack >2h.`,
      priority: '2',
      retry: '60',
      expire: '1800',
    });
    const res = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: timeoutSignal(5000),
    });
    return { ok: res.ok };
  } catch (e) {
    console.error('audit: Pushover send failed:', e.message);
    return { ok: false, error: e.message };
  }
}
