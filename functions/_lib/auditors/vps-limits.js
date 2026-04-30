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

const THRESHOLDS = {
  ram: { warn: 0.75, critical: 0.90 },
  disk: { warn: 0.75, critical: 0.90 },
  load_multiplier: { warn: 1.0, critical: 1.5 },
  egress: { warn: 0.70, critical: 0.90 },
};

function detectSymptomA(metrics) {
  const pct = metrics.ram_used_pct;
  if (typeof pct !== 'number') return null;

  let severity = 'clean';
  let threshold_warn = THRESHOLDS.ram.warn;
  let threshold_critical = THRESHOLDS.ram.critical;
  if (pct >= threshold_critical) severity = 'critical';
  else if (pct >= threshold_warn) severity = 'warn';

  const pctStr = `${Math.round(pct * 100)}%`;
  return {
    severity,
    payload: {
      symptom: 'ram',
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: severity === 'clean'
        ? `RAM em ${pctStr} (saudável)`
        : `RAM em ${pctStr}`,
      resource: 'ram',
      live_value: pct,
      threshold_warn,
      threshold_critical,
      source: 'custom_endpoint',
    },
    evidence: {
      ram_used_pct: pct,
      ram_total_mb: metrics.ram_total_mb,
      ram_used_mb: metrics.ram_used_mb,
      ts: metrics.ts,
    },
  };
}

export async function detect({ env = {}, metrics = null, now = Date.now() } = {}) {
  const events = [];
  if (!metrics) return events;

  const symA = detectSymptomA(metrics);
  if (symA) events.push(symA);

  return events;
}
