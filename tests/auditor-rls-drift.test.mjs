// tests/auditor-rls-drift.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../functions/_lib/auditors/rls-drift.js';

test('detect is exported as async function', () => {
  assert.equal(typeof detect, 'function');
});

test('detect with empty schemaState returns empty array', async () => {
  const events = await detect({
    env: {},
    schemaState: { tables_no_rls: [], functions_no_search_path: [] },
    now: Date.now(),
  });
  assert.deepEqual(events, []);
});

test('Sintoma A: 1 table sem RLS produces 1 warn event', async () => {
  const events = await detect({
    env: {},
    schemaState: {
      tables_no_rls: [{ schema: 'public', table_name: 'new_feature_data' }],
      functions_no_search_path: [],
    },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].severity, 'warn');
  assert.equal(events[0].payload.symptom, 'table_no_rls');
  assert.match(events[0].payload.summary, /new_feature_data.*sem RLS/);
});

test('Sintoma A: 3 tables sem RLS produce 3 warn events', async () => {
  const events = await detect({
    env: {},
    schemaState: {
      tables_no_rls: [
        { schema: 'public', table_name: 'a' },
        { schema: 'public', table_name: 'b' },
        { schema: 'public', table_name: 'c' },
      ],
      functions_no_search_path: [],
    },
  });
  assert.equal(events.length, 3);
  assert.ok(events.every((e) => e.severity === 'warn' && e.payload.symptom === 'table_no_rls'));
});

test('Sintoma A: payload + evidence shape correto', async () => {
  const events = await detect({
    env: {},
    schemaState: {
      tables_no_rls: [{ schema: 'public', table_name: 'tenants' }],
      functions_no_search_path: [],
    },
  });
  const e = events[0];
  assert.equal(e.payload.runbook_path, null);
  assert.equal(e.payload.suggested_subagent, 'supabase-dba');
  assert.equal(e.payload.object, 'tenants');
  assert.equal(e.payload.schema, 'public');
  assert.equal(e.payload.source, 'pg_class_introspection');
  assert.equal(e.evidence.schema, 'public');
  assert.equal(e.evidence.table_name, 'tenants');
  assert.equal(e.evidence.check_type, 'rls_disabled');
});

test('Sintoma A: schema diferente de public ainda emite (caso edge)', async () => {
  // SQL query restringe a public, mas se vier outra schema na input, ainda processa
  const events = await detect({
    env: {},
    schemaState: {
      tables_no_rls: [{ schema: 'analytics', table_name: 'events_raw' }],
      functions_no_search_path: [],
    },
  });
  assert.equal(events.length, 1);
  assert.match(events[0].payload.summary, /analytics\.events_raw/);
});

test('Sintoma B: 1 function sem search_path produces 1 critical event', async () => {
  const events = await detect({
    env: {},
    schemaState: {
      tables_no_rls: [],
      functions_no_search_path: [{ schema: 'public', function_name: 'compute_billing' }],
    },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].severity, 'critical');
  assert.equal(events[0].payload.symptom, 'function_no_search_path');
  assert.match(events[0].payload.summary, /compute_billing.*search_path/);
});

test('Sintoma B: payload + evidence shape correto', async () => {
  const events = await detect({
    env: {},
    schemaState: {
      tables_no_rls: [],
      functions_no_search_path: [{ schema: 'public', function_name: 'audit_log' }],
    },
  });
  const e = events[0];
  assert.equal(e.payload.runbook_path, null);
  assert.equal(e.payload.suggested_subagent, 'supabase-dba');
  assert.equal(e.payload.object, 'audit_log');
  assert.equal(e.payload.source, 'pg_proc_introspection');
  assert.equal(e.evidence.function_name, 'audit_log');
  assert.equal(e.evidence.check_type, 'no_search_path');
});

test('Mixed: tables + functions produce mix of warn + critical', async () => {
  const events = await detect({
    env: {},
    schemaState: {
      tables_no_rls: [{ schema: 'public', table_name: 't1' }],
      functions_no_search_path: [{ schema: 'public', function_name: 'f1' }],
    },
  });
  assert.equal(events.length, 2);
  const warnEvent = events.find((e) => e.severity === 'warn');
  const criticalEvent = events.find((e) => e.severity === 'critical');
  assert.equal(warnEvent.payload.symptom, 'table_no_rls');
  assert.equal(criticalEvent.payload.symptom, 'function_no_search_path');
});

test('Empty schemaState fields handled gracefully', async () => {
  // Edge case: undefined arrays in nested shape
  const events = await detect({
    env: {},
    schemaState: {}, // missing both fields
  });
  assert.deepEqual(events, []);
});

test('allowlist: table_no_rls com table_name allowlisted é silent skip', async () => {
  const events = await detect({
    env: { RLS_INTENTIONAL_NO_PUBLIC: 'audit_events,audit_runs,approvals' },
    schemaState: {
      tables_no_rls: [{ schema: 'public', table_name: 'audit_events' }],
      functions_no_search_path: [],
    },
  });
  assert.equal(events.length, 0);
});

test('allowlist: table_no_rls com table_name NÃO allowlisted fires warn', async () => {
  const events = await detect({
    env: { RLS_INTENTIONAL_NO_PUBLIC: 'audit_events,approvals' },
    schemaState: {
      tables_no_rls: [{ schema: 'public', table_name: 'tenants' }],
      functions_no_search_path: [],
    },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].severity, 'warn');
});

test('allowlist: function_no_search_path NÃO é afetado pela allowlist', async () => {
  // Allowlist só aplica a tables_no_rls — functions sempre fire critical
  const events = await detect({
    env: { RLS_INTENTIONAL_NO_PUBLIC: 'audit_events,audit_runs' },
    schemaState: {
      tables_no_rls: [],
      functions_no_search_path: [{ schema: 'public', function_name: 'audit_events' }], // mesmo nome de tabela allowlisted
    },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].severity, 'critical');
});

test('allowlist: empty env var = nothing whitelisted = todas tables fire warn', async () => {
  const events = await detect({
    env: { RLS_INTENTIONAL_NO_PUBLIC: '' },
    schemaState: {
      tables_no_rls: [{ schema: 'public', table_name: 'audit_events' }],
      functions_no_search_path: [],
    },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].severity, 'warn');
});

test('allowlist: missing env var = nothing whitelisted', async () => {
  const events = await detect({
    env: {}, // sem RLS_INTENTIONAL_NO_PUBLIC
    schemaState: {
      tables_no_rls: [{ schema: 'public', table_name: 'audit_events' }],
      functions_no_search_path: [],
    },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].severity, 'warn');
});
