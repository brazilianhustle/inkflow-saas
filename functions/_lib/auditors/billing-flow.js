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

const DEFAULT_WEBHOOK_SILENT_HOURS = 24;
const ACTIVE_TENANTS_SAMPLE_LIMIT = 5;

function webhookSilentThresholdMs(env) {
  const h = parseInt(env.AUDIT_BILLING_FLOW_WEBHOOK_SILENT_HOURS || `${DEFAULT_WEBHOOK_SILENT_HOURS}`, 10);
  return Number.isFinite(h) && h > 0 ? h * 3600 * 1000 : DEFAULT_WEBHOOK_SILENT_HOURS * 3600 * 1000;
}

async function fetchActiveTenantsSample(env, fetchImpl) {
  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return [];
  const url = `${SUPABASE_URL}/rest/v1/tenants?select=id,mp_subscription_id&plano=neq.trial&ativo=eq.true&mp_subscription_id=not.is.null&order=created_at.asc&limit=${ACTIVE_TENANTS_SAMPLE_LIMIT}`;
  try {
    const res = await fetchImpl(url, { headers: sbHeaders(sbKey), signal: timeoutSignal(5000) });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function confirmActiveInMP(mpSubId, env, fetchImpl) {
  const token = env.MP_ACCESS_TOKEN;
  if (!token) return false;
  try {
    const res = await fetchImpl(`https://api.mercadopago.com/preapproval/${encodeURIComponent(mpSubId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: timeoutSignal(5000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.status === 'authorized';
  } catch {
    return false;
  }
}

async function detectSymptomB(env, fetchImpl, now) {
  if (!env.SUPABASE_SERVICE_KEY || !env.MP_ACCESS_TOKEN) return [];

  const lastWebhookMs = await fetchMostRecentWebhookAt(env, fetchImpl);
  if (lastWebhookMs === null) return []; // No payment_logs → no signal

  const elapsedMs = now - lastWebhookMs;
  const thresholdMs = webhookSilentThresholdMs(env);
  if (elapsedMs <= thresholdMs) return []; // Under 24h → only Sintoma A applies

  const sample = await fetchActiveTenantsSample(env, fetchImpl);
  if (sample.length === 0) return []; // No active subs → no signal

  // Confirm via MP API in parallel (≤5 calls, 5s timeout each)
  const confirmations = await Promise.all(
    sample.map((t) => confirmActiveInMP(t.mp_subscription_id, env, fetchImpl))
  );
  const confirmedActive = confirmations.filter(Boolean).length;

  const hoursSince = Math.round(elapsedMs / 3600000);
  const severity = confirmedActive >= 1 ? 'critical' : 'warn';

  return [{
    severity,
    payload: {
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: confirmedActive >= 1
        ? `Webhook MP silente há ${hoursSince}h com ${confirmedActive} subs ativas confirmadas no MP`
        : `Webhook MP silente há ${hoursSince}h mas zero subs ativas confirmadas (demoted)`,
      symptom: 'webhook-silent',
      hours_since_last_webhook: hoursSince,
      last_webhook_at: new Date(lastWebhookMs).toISOString(),
      sample_size: sample.length,
      confirmed_active_in_mp: confirmedActive,
      drift_type: 'webhook_silent',
    },
    evidence: {
      source: 'supabase/payment_logs+tenants + mercadopago/preapproval',
      sampled_subscription_ids: sample.map((t) => t.mp_subscription_id),
    },
  }];
}

export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  const events = [];
  if (!fetchImpl) return events;
  events.push(...await detectSymptomA(env, fetchImpl, now));
  events.push(...await detectSymptomB(env, fetchImpl, now));
  return events;
}
