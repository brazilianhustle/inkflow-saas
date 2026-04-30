// functions/_lib/auditors/rls-drift.js
// ── InkFlow — Auditor #4: rls-drift ────────────────────────────────────────
// Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §5.4
// (deviation: spec assumiu /v1/.../advisors REST — não existe.
//  Pivotamos pra SQL queries diretas via /database/query API.)
//
// Detecção determinística (sem reasoning Claude — esse vive na Routine):
//   - Tabela em public sem RLS, NÃO allowlisted → warn
//   - Tabela em public sem RLS, ALLOWLISTED    → silent skip (Task 4)
//   - Function em public sem search_path       → critical (allowlist NÃO aplica)
//
// Allowlist via env var RLS_INTENTIONAL_NO_PUBLIC (CSV).
// Inicial: audit_events, audit_runs, audit_reports, approvals, tool_calls_log, signups_log.
//
// Input: { env, schemaState: { tables_no_rls: [{schema, table_name}], functions_no_search_path: [{schema, function_name}] }, now }
// Output: Array<{ severity, payload, evidence }> — sem efeitos.

const RUNBOOK_PATH = null; // gap consciente — spec §5.4
const SUGGESTED_SUBAGENT = 'supabase-dba'; // hint pro futuro Sub-projeto 2

function parseAllowlist(env) {
  const csv = env.RLS_INTENTIONAL_NO_PUBLIC;
  if (!csv || typeof csv !== 'string') return new Set();
  return new Set(
    csv.split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  );
}

function buildTableEvent(row) {
  const schema = row.schema || 'public';
  const tableName = row.table_name || 'unknown';
  const fqn = `${schema}.${tableName}`;
  return {
    severity: 'warn',
    payload: {
      symptom: 'table_no_rls',
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: `Tabela \`${fqn}\` em schema public sem RLS`,
      object: tableName,
      schema,
      source: 'pg_class_introspection',
    },
    evidence: {
      schema,
      table_name: tableName,
      check_type: 'rls_disabled',
    },
  };
}

function buildFunctionEvent(row) {
  const schema = row.schema || 'public';
  const functionName = row.function_name || 'unknown';
  const fqn = `${schema}.${functionName}`;
  return {
    severity: 'critical',
    payload: {
      symptom: 'function_no_search_path',
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: `Function \`${fqn}\` sem search_path setado (security risk)`,
      object: functionName,
      schema,
      source: 'pg_proc_introspection',
    },
    evidence: {
      schema,
      function_name: functionName,
      check_type: 'no_search_path',
    },
  };
}

export async function detect({ env = {}, schemaState = { tables_no_rls: [], functions_no_search_path: [] }, now = Date.now() } = {}) {
  const events = [];
  const tables = schemaState?.tables_no_rls || [];
  const functions = schemaState?.functions_no_search_path || [];

  const allowlist = parseAllowlist(env);

  // Sintoma A — tables sem RLS, com filtro de allowlist
  for (const row of tables) {
    if (allowlist.has(row.table_name)) continue; // silent skip
    events.push(buildTableEvent(row));
  }

  // Sintoma B — functions sem search_path (allowlist NÃO aplica)
  for (const row of functions) {
    events.push(buildFunctionEvent(row));
  }

  return events;
}
