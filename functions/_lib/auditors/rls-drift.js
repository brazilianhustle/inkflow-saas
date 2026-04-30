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

export async function detect({ env = {}, schemaState = { tables_no_rls: [], functions_no_search_path: [] }, now = Date.now() } = {}) {
  const events = [];
  const tables = schemaState?.tables_no_rls || [];
  const functions = schemaState?.functions_no_search_path || [];
  if (tables.length === 0 && functions.length === 0) return events;
  // Sintomas serão adicionados nas tasks 3-4
  return events;
}
