import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../functions/_lib/auditors/billing-flow.js';

test('detect is exported as async function', () => {
  assert.equal(typeof detect, 'function');
});

test('detect with empty env returns empty array', async () => {
  const events = await detect({
    env: {},
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  });
  assert.deepEqual(events, []);
});

const NOW = new Date('2026-04-29T12:00:00Z').getTime();
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const baseEnv = {
  SUPABASE_SERVICE_KEY: 'sb-key-test',
  MP_ACCESS_TOKEN: 'mp-tok',
  MAILERLITE_API_KEY: 'ml-tok',
  MAILERLITE_GROUP_CLIENTES_ATIVOS: '184387920768009398',
};

function paymentLogRow(hoursAgo) {
  return { created_at: new Date(NOW - hoursAgo * 3600 * 1000).toISOString() };
}

function makeFetchImpl(routes) {
  return async (url, opts) => {
    for (const [pattern, response] of routes) {
      if (String(url).includes(pattern)) {
        if (response instanceof Error) throw response;
        return typeof response === 'function' ? response(url, opts) : response;
      }
    }
    return { ok: true, status: 200, text: async () => '[]', json: async () => [] };
  };
}

// ── Sintoma A: webhook delay ────────────────────────────────────────────────

test('symptomA: env missing SUPABASE_SERVICE_KEY → skip silently', async () => {
  const fetchImpl = makeFetchImpl([]);
  const events = await detect({ env: {}, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'webhook-delay');
  assert.equal(a, undefined);
});

test('symptomA: payment_logs empty + zero active subs → skip silently', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [] }],
    ['tenants?', { ok: true, status: 200, json: async () => [{ count: 0 }] }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'webhook-delay');
  assert.equal(a, undefined);
});

test('symptomA: last webhook 2h ago → clean (under 6h threshold)', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(2)] }],
    ['tenants?', { ok: true, status: 200, json: async () => [{ count: 3 }] }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'webhook-delay');
  assert.equal(a?.severity, 'clean');
});

test('symptomA: last webhook 8h ago + 2 active subs → warn', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(8)] }],
    ['tenants?', { ok: true, status: 200, json: async () => [{ count: 2 }] }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'webhook-delay');
  assert.equal(a.severity, 'warn');
  assert.equal(a.payload.hours_since_last_webhook, 8);
  assert.equal(a.payload.active_subscriptions_count, 2);
  assert.equal(a.payload.runbook_path, 'docs/canonical/runbooks/mp-webhook-down.md');
});

test('symptomA: last webhook 8h ago + 0 active subs → clean (no subs explains absence)', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(8)] }],
    ['tenants?', { ok: true, status: 200, json: async () => [{ count: 0 }] }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'webhook-delay');
  assert.equal(a?.severity, 'clean');
});

test('symptomA: respects AUDIT_BILLING_FLOW_WEBHOOK_DELAY_HOURS env override', async () => {
  const env = { ...baseEnv, AUDIT_BILLING_FLOW_WEBHOOK_DELAY_HOURS: '12' };
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(8)] }],
    ['tenants?', { ok: true, status: 200, json: async () => [{ count: 2 }] }],
  ]);
  const events = await detect({ env, fetchImpl, now: NOW });
  const a = events.find((e) => e.payload?.symptom === 'webhook-delay');
  assert.equal(a?.severity, 'clean'); // 8h < 12h threshold → clean
});

// ── Sintoma B: webhook silent + MP confirm ──────────────────────────────────

function tenantRow(id, mpSubId) {
  return { id, mp_subscription_id: mpSubId, plano: 'estudio', ativo: true };
}

test('symptomB: last webhook 30h + 1 MP sub authorized → critical', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(30)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 2 }] }],
    ['tenants?select=id', { ok: true, status: 200, json: async () => [
      tenantRow('t1', 'mp-sub-1'),
      tenantRow('t2', 'mp-sub-2'),
    ] }],
    ['preapproval/mp-sub-1', { ok: true, status: 200, json: async () => ({ status: 'authorized' }) }],
    ['preapproval/mp-sub-2', { ok: true, status: 200, json: async () => ({ status: 'paused' }) }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'webhook-silent');
  assert.equal(b?.severity, 'critical');
  assert.equal(b.payload.confirmed_active_in_mp, 1);
  assert.equal(b.payload.runbook_path, 'docs/canonical/runbooks/mp-webhook-down.md');
});

test('symptomB: last webhook 30h + 0 MP subs authorized → demote to warn', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(30)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 1 }] }],
    ['tenants?select=id', { ok: true, status: 200, json: async () => [tenantRow('t1', 'mp-sub-1')] }],
    ['preapproval/mp-sub-1', { ok: true, status: 200, json: async () => ({ status: 'cancelled' }) }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'webhook-silent');
  assert.equal(b?.severity, 'warn');
  assert.equal(b.payload.confirmed_active_in_mp, 0);
});

test('symptomB: last webhook 12h (under 24h threshold) → no symptomB event', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(12)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 1 }] }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'webhook-silent');
  assert.equal(b, undefined); // Only Sintoma A applies (warn)
});

test('symptomB: MP API transient error → silent skip (no critical from network blip)', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(30)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 1 }] }],
    ['tenants?select=id', { ok: true, status: 200, json: async () => [tenantRow('t1', 'mp-sub-1')] }],
    ['preapproval/mp-sub-1', new Error('ECONNRESET')],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'webhook-silent');
  // Network error = 0 confirmed → demote to warn (not critical from blip)
  assert.equal(b?.severity, 'warn');
  assert.equal(b.payload.confirmed_active_in_mp, 0);
});

test('symptomB: missing MP_ACCESS_TOKEN → skip Sintoma B silently', async () => {
  const env = { ...baseEnv };
  delete env.MP_ACCESS_TOKEN;
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(30)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 1 }] }],
  ]);
  const events = await detect({ env, fetchImpl, now: NOW });
  const b = events.find((e) => e.payload?.symptom === 'webhook-silent');
  assert.equal(b, undefined);
});

// ── Sintoma C: MailerLite group drift ───────────────────────────────────────

function tenantWithEmail(id, email) {
  return { id, email, mp_subscription_id: `mp-${id}`, plano: 'estudio', ativo: true };
}

test('symptomC: all 3 active tenants in MailerLite group → clean', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(1)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 3 }] }],
    ['tenants?select=id,email', { ok: true, status: 200, json: async () => [
      tenantWithEmail('t1', 'a@test.com'),
      tenantWithEmail('t2', 'b@test.com'),
      tenantWithEmail('t3', 'c@test.com'),
    ] }],
    ['/api/subscribers/a@test.com', { ok: true, status: 200, json: async () => ({ data: { groups: [{ id: '184387920768009398' }] } }) }],
    ['/api/subscribers/b@test.com', { ok: true, status: 200, json: async () => ({ data: { groups: [{ id: '184387920768009398' }] } }) }],
    ['/api/subscribers/c@test.com', { ok: true, status: 200, json: async () => ({ data: { groups: [{ id: '184387920768009398' }] } }) }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const c = events.find((e) => e.payload?.symptom === 'mailerlite-drift');
  assert.equal(c?.severity, 'clean');
});

test('symptomC: 2 of 3 tenants missing in group → warn with emails', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(1)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 3 }] }],
    ['tenants?select=id,email', { ok: true, status: 200, json: async () => [
      tenantWithEmail('t1', 'a@test.com'),
      tenantWithEmail('t2', 'b@test.com'),
      tenantWithEmail('t3', 'c@test.com'),
    ] }],
    ['/api/subscribers/a@test.com', { ok: true, status: 200, json: async () => ({ data: { groups: [{ id: '184387920768009398' }] } }) }],
    ['/api/subscribers/b@test.com', { ok: true, status: 200, json: async () => ({ data: { groups: [] } }) }],
    ['/api/subscribers/c@test.com', { ok: false, status: 404, json: async () => ({ message: 'not found' }) }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const c = events.find((e) => e.payload?.symptom === 'mailerlite-drift');
  assert.equal(c?.severity, 'warn');
  assert.equal(c.payload.missing_count, 2);
  assert.deepEqual(c.payload.missing_emails.sort(), ['b@test.com', 'c@test.com']);
});

test('symptomC: missing MAILERLITE_API_KEY → skip silently', async () => {
  const env = { ...baseEnv };
  delete env.MAILERLITE_API_KEY;
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(1)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 1 }] }],
  ]);
  const events = await detect({ env, fetchImpl, now: NOW });
  const c = events.find((e) => e.payload?.symptom === 'mailerlite-drift');
  assert.equal(c, undefined);
});

test('symptomC: zero active tenants → skip silently', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(1)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 0 }] }],
    ['tenants?select=id,email', { ok: true, status: 200, json: async () => [] }],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const c = events.find((e) => e.payload?.symptom === 'mailerlite-drift');
  assert.equal(c, undefined);
});

test('symptomC: ML API transient error on all calls → skip silently (no false warn)', async () => {
  const fetchImpl = makeFetchImpl([
    ['payment_logs?', { ok: true, status: 200, json: async () => [paymentLogRow(1)] }],
    ['tenants?select=count', { ok: true, status: 200, json: async () => [{ count: 2 }] }],
    ['tenants?select=id,email', { ok: true, status: 200, json: async () => [
      tenantWithEmail('t1', 'a@test.com'),
      tenantWithEmail('t2', 'b@test.com'),
    ] }],
    ['/api/subscribers/', new Error('ETIMEDOUT')],
  ]);
  const events = await detect({ env: baseEnv, fetchImpl, now: NOW });
  const c = events.find((e) => e.payload?.symptom === 'mailerlite-drift');
  // All ML calls failed → skip Sintoma C (don't false-positive on network blip)
  assert.equal(c, undefined);
});
