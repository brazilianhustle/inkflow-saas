import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startRun,
  endRun,
  getCurrentState,
  insertEvent,
  dedupePolicy,
  sendTelegram,
  sendPushover,
} from '../functions/_lib/audit-state.js';

// Fixtures —————————————————————————————————————————————————————————————————

export const FIXTURE_SUPABASE = { url: 'https://test.supabase.co', key: 'service-key' };

export const FIXTURE_EVENT_WARN = {
  id: 'a3f1b9c2-1111-2222-3333-444455556666',
  run_id: 'r1',
  auditor: 'key-expiry',
  severity: 'warn',
  payload: { runbook_path: 'docs/canonical/runbooks/secrets-expired.md', summary: 'CF token expira em 10d' },
  evidence: { source: 'ttl' },
  detected_at: '2026-04-27T03:00:00Z',
  last_seen_at: '2026-04-27T03:00:00Z',
  last_alerted_at: '2026-04-27T03:00:00Z',
  alert_count: 1,
  acknowledged_at: null,
  escalated_at: null,
  resolved_at: null,
};

export const FIXTURE_EVENT_CRITICAL = {
  ...FIXTURE_EVENT_WARN,
  id: 'b4e2cad3-aaaa-bbbb-cccc-dddd11112222',
  severity: 'critical',
  payload: { ...FIXTURE_EVENT_WARN.payload, summary: 'CF token expirou' },
};

export const FIXTURE_ENV = {
  TELEGRAM_BOT_TOKEN: 'tg-token',
  TELEGRAM_CHAT_ID: '999',
  PUSHOVER_APP_TOKEN: 'po-app',
  PUSHOVER_USER_KEY: 'po-user',
};

// Smoke: módulo importa sem crashar
test('module exports 7 named functions', () => {
  assert.equal(typeof startRun, 'function');
  assert.equal(typeof endRun, 'function');
  assert.equal(typeof getCurrentState, 'function');
  assert.equal(typeof insertEvent, 'function');
  assert.equal(typeof dedupePolicy, 'function');
  assert.equal(typeof sendTelegram, 'function');
  assert.equal(typeof sendPushover, 'function');
});

// dedupePolicy — 8 cases da tabela §6.2 do spec ——————————————————————————————

const HOUR = 3600 * 1000;
const NOW = new Date('2026-04-27T12:00:00Z').getTime();

test('dedupe: current vazio + new warn → fire', () => {
  const action = dedupePolicy(null, { severity: 'warn' }, { now: NOW });
  assert.equal(action, 'fire');
});

test('dedupe: current vazio + new critical → fire', () => {
  const action = dedupePolicy(null, { severity: 'critical' }, { now: NOW });
  assert.equal(action, 'fire');
});

test('dedupe: same severity + last_alerted_at <24h → silent', () => {
  const current = { severity: 'warn', last_alerted_at: new Date(NOW - 5 * HOUR).toISOString() };
  const action = dedupePolicy(current, { severity: 'warn' }, { now: NOW });
  assert.equal(action, 'silent');
});

test('dedupe: same severity + last_alerted_at >=24h → fire (lembrete)', () => {
  const current = { severity: 'warn', last_alerted_at: new Date(NOW - 25 * HOUR).toISOString() };
  const action = dedupePolicy(current, { severity: 'warn' }, { now: NOW });
  assert.equal(action, 'fire');
});

test('dedupe: warn → critical → supersede', () => {
  const current = { severity: 'warn', last_alerted_at: new Date(NOW - HOUR).toISOString() };
  const action = dedupePolicy(current, { severity: 'critical' }, { now: NOW });
  assert.equal(action, 'supersede');
});

test('dedupe: critical → warn → silent (não rebaixa)', () => {
  const current = { severity: 'critical', last_alerted_at: new Date(NOW - HOUR).toISOString() };
  const action = dedupePolicy(current, { severity: 'warn' }, { now: NOW });
  assert.equal(action, 'silent');
});

test('dedupe: current existe + next clean → resolve', () => {
  const current = { severity: 'warn', last_alerted_at: new Date(NOW - HOUR).toISOString() };
  const action = dedupePolicy(current, { severity: 'clean' }, { now: NOW });
  assert.equal(action, 'resolve');
});

test('dedupe: current vazio + next clean → no-op', () => {
  const action = dedupePolicy(null, { severity: 'clean' }, { now: NOW });
  assert.equal(action, 'no-op');
});

// Supabase REST helpers — startRun/endRun/getCurrentState/insertEvent ————————

function makeFetchMock(responses) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body });
    const handler = responses.find((r) => r.match(String(url), opts));
    if (!handler) throw new Error(`unmocked fetch: ${url}`);
    return {
      ok: handler.response.status < 400,
      status: handler.response.status,
      json: async () => handler.response.json,
      text: async () => JSON.stringify(handler.response.json),
    };
  };
  return { calls };
}

test('startRun INSERTs row in audit_runs and returns id', async () => {
  const mock = makeFetchMock([
    {
      match: (url, o) => url.includes('/rest/v1/audit_runs') && o.method === 'POST',
      response: { status: 201, json: [{ id: 'run-uuid-1' }] },
    },
  ]);
  const runId = await startRun(FIXTURE_SUPABASE, 'key-expiry');
  assert.equal(runId, 'run-uuid-1');
  assert.equal(mock.calls.length, 1);
  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.auditor, 'key-expiry');
  assert.equal(body.status, 'running');
});

test('endRun PATCHes audit_runs with status=success', async () => {
  const mock = makeFetchMock([
    {
      match: (url, o) => url.includes('/rest/v1/audit_runs') && o.method === 'PATCH',
      response: { status: 204, json: null },
    },
  ]);
  await endRun(FIXTURE_SUPABASE, 'run-uuid-1', { status: 'success', eventsEmitted: 2 });
  assert.equal(mock.calls.length, 1);
  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.status, 'success');
  assert.equal(body.events_emitted, 2);
  assert.ok(body.completed_at, 'completed_at should be set');
});

test('endRun PATCHes audit_runs with status=error and message', async () => {
  const mock = makeFetchMock([
    {
      match: (url, o) => url.includes('/rest/v1/audit_runs') && o.method === 'PATCH',
      response: { status: 204, json: null },
    },
  ]);
  await endRun(FIXTURE_SUPABASE, 'run-uuid-1', { status: 'error', errorMessage: 'boom' });
  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.status, 'error');
  assert.equal(body.error_message, 'boom');
});

test('getCurrentState returns row from audit_current_state view', async () => {
  makeFetchMock([
    {
      match: (url) => url.includes('/rest/v1/audit_current_state'),
      response: { status: 200, json: [{ auditor: 'key-expiry', severity: 'warn', event_id: 'e1' }] },
    },
  ]);
  const state = await getCurrentState(FIXTURE_SUPABASE, 'key-expiry');
  assert.equal(state.severity, 'warn');
  assert.equal(state.event_id, 'e1');
});

test('getCurrentState returns null when no open event', async () => {
  makeFetchMock([
    { match: (url) => url.includes('/rest/v1/audit_current_state'), response: { status: 200, json: [] } },
  ]);
  const state = await getCurrentState(FIXTURE_SUPABASE, 'key-expiry');
  assert.equal(state, null);
});

test('insertEvent POSTs to audit_events and returns inserted row', async () => {
  const mock = makeFetchMock([
    {
      match: (url, o) => url.includes('/rest/v1/audit_events') && o.method === 'POST',
      response: { status: 201, json: [{ ...FIXTURE_EVENT_WARN, id: 'evt-1' }] },
    },
  ]);
  const inserted = await insertEvent(FIXTURE_SUPABASE, {
    run_id: 'r1', auditor: 'key-expiry', severity: 'warn',
    payload: { summary: 'x' }, evidence: null,
  });
  assert.equal(inserted.id, 'evt-1');
  assert.equal(mock.calls.length, 1);
});
