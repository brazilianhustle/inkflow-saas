// ── InkFlow — Auditor #3: vps-limits ───────────────────────────────────────
// Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §5.3
// Sintomas:
//   A — RAM (warn 75% / critical 90%)
//   B — Disk (warn 75% / critical 90%)
//   C — CPU load avg 5m (warn > vcpu_count / critical > 1.5×vcpu_count)
//   D — Egress mensal (opt-in via AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB; warn 70% / critical 90%)
//
// Input: { env, metrics: { ram_used_pct, ram_total_mb, disk_used_pct, disk_total_gb,
//                          load_avg_5m, vcpu_count, ts, ... }, now }
// Output: array de events { severity, payload, evidence } — sem efeitos.

const RUNBOOK_PATH = null; // gap consciente — spec §5.3
const SUGGESTED_SUBAGENT = 'vps-ops'; // hint pro futuro Sub-projeto 2

export async function detect({ env = {}, metrics = null, now = Date.now() } = {}) {
  const events = [];
  if (!metrics) return events;
  // Sintomas serão adicionados nas tasks 5-8
  return events;
}
