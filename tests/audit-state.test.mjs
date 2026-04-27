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
