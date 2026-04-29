// ── InkFlow — Auditor #5: billing-flow ─────────────────────────────────────
// Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §5.5
// Sintomas:
//   A — webhook MP delay (>6h sem payment_logs row → warn)
//   B — webhook MP silent (>24h + MP confirma sub ativa → critical)
//   C — MailerLite group drift (tenant ativo não no CLIENTES_ATIVOS → warn)
//   D — DB consistency (trial_expirado + ativo=true → critical)

const RUNBOOK_PATH = 'docs/canonical/runbooks/mp-webhook-down.md';
const SUGGESTED_SUBAGENT = null; // MP é manual no MVP, sem agent dedicado

function timeoutSignal(ms) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const DEFAULT_WEBHOOK_DELAY_HOURS = 6;

function webhookDelayThresholdMs(env) {
  const raw = env.AUDIT_BILLING_FLOW_WEBHOOK_DELAY_HOURS;
  const h = parseInt(raw || `${DEFAULT_WEBHOOK_DELAY_HOURS}`, 10);
  return Number.isFinite(h) && h > 0 ? h * 3600 * 1000 : DEFAULT_WEBHOOK_DELAY_HOURS * 3600 * 1000;
}

function sbHeaders(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function fetchMostRecentWebhookAt(env, fetchImpl) {
  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return null;
  // Latest payment_logs row with non-null tenant_id (filters out signup attempts)
  const url = `${SUPABASE_URL}/rest/v1/payment_logs?tenant_id=not.is.null&select=created_at&order=created_at.desc&limit=1`;
  try {
    const res = await fetchImpl(url, { headers: sbHeaders(sbKey), signal: timeoutSignal(5000) });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return new Date(rows[0].created_at).getTime();
  } catch {
    return null;
  }
}

async function fetchActiveSubscriptionsCount(env, fetchImpl) {
  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return 0;
  // Count tenants with active paid plan + mp_subscription_id present
  const url = `${SUPABASE_URL}/rest/v1/tenants?select=count&plano=neq.trial&ativo=eq.true&mp_subscription_id=not.is.null`;
  try {
    const res = await fetchImpl(url, {
      headers: sbHeaders(sbKey, { Prefer: 'count=exact' }),
      signal: timeoutSignal(5000),
    });
    if (!res.ok) return 0;
    const rows = await res.json();
    if (Array.isArray(rows) && rows[0]?.count !== undefined) return rows[0].count;
    return 0;
  } catch {
    return 0;
  }
}

async function detectSymptomA(env, fetchImpl, now) {
  if (!env.SUPABASE_SERVICE_KEY) return [];

  const lastWebhookMs = await fetchMostRecentWebhookAt(env, fetchImpl);
  const activeSubs = await fetchActiveSubscriptionsCount(env, fetchImpl);

  // No payment_logs at all → no signal (could be pre-MVP state, no real customers yet)
  if (lastWebhookMs === null) return [];
  // Active subs absent → no signal (webhook silence is expected)
  if (activeSubs === 0) {
    return [{
      severity: 'clean',
      payload: { symptom: 'webhook-delay', active_subscriptions_count: 0 },
      evidence: { source: 'supabase/payment_logs+tenants' },
    }];
  }

  const elapsedMs = now - lastWebhookMs;
  const thresholdMs = webhookDelayThresholdMs(env);
  if (elapsedMs <= thresholdMs) {
    return [{
      severity: 'clean',
      payload: { symptom: 'webhook-delay', hours_since_last_webhook: Math.round(elapsedMs / 3600000) },
      evidence: { source: 'supabase/payment_logs' },
    }];
  }

  const hoursSince = Math.round(elapsedMs / 3600000);
  return [{
    severity: 'warn',
    payload: {
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: `Último webhook MP recebido há ${hoursSince}h (esperado <${Math.round(thresholdMs / 3600000)}h)`,
      symptom: 'webhook-delay',
      hours_since_last_webhook: hoursSince,
      last_webhook_at: new Date(lastWebhookMs).toISOString(),
      active_subscriptions_count: activeSubs,
      drift_type: 'webhook_delay',
    },
    evidence: { source: 'supabase/payment_logs+tenants' },
  }];
}

export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  const events = [];
  if (!fetchImpl) return events;
  events.push(...await detectSymptomA(env, fetchImpl, now));
  return events;
}
