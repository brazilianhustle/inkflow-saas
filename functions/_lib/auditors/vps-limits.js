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

function detectSymptomB(metrics) {
  const pct = metrics.disk_used_pct;
  if (typeof pct !== 'number') return null;

  let severity = 'clean';
  if (pct >= THRESHOLDS.disk.critical) severity = 'critical';
  else if (pct >= THRESHOLDS.disk.warn) severity = 'warn';

  const pctStr = `${Math.round(pct * 100)}%`;
  return {
    severity,
    payload: {
      symptom: 'disk',
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: severity === 'clean'
        ? `Disco em ${pctStr} (saudável)`
        : `Disco em ${pctStr}`,
      resource: 'disk',
      live_value: pct,
      threshold_warn: THRESHOLDS.disk.warn,
      threshold_critical: THRESHOLDS.disk.critical,
      source: 'custom_endpoint',
    },
    evidence: {
      disk_used_pct: pct,
      disk_total_gb: metrics.disk_total_gb,
      disk_used_gb: metrics.disk_used_gb,
      ts: metrics.ts,
    },
  };
}

function detectSymptomC(metrics) {
  const load = metrics.load_avg_5m;
  const vcpu = metrics.vcpu_count;
  if (typeof load !== 'number' || typeof vcpu !== 'number' || vcpu <= 0) return null;

  const warn = THRESHOLDS.load_multiplier.warn * vcpu;
  const critical = THRESHOLDS.load_multiplier.critical * vcpu;

  let severity = 'clean';
  if (load >= critical) severity = 'critical';
  else if (load >= warn) severity = 'warn';

  return {
    severity,
    payload: {
      symptom: 'load_avg',
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: severity === 'clean'
        ? `Load avg 5m em ${load.toFixed(2)} (vCPU ${vcpu}, saudável)`
        : `Load avg 5m em ${load.toFixed(2)} (vCPU ${vcpu})`,
      resource: 'load_avg_5m',
      live_value: load,
      threshold_warn: warn,
      threshold_critical: critical,
      source: 'custom_endpoint',
    },
    evidence: {
      load_avg_5m: load,
      vcpu_count: vcpu,
      ts: metrics.ts,
    },
  };
}

function detectSymptomD(env, metrics) {
  const quotaStr = env.AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB;
  if (!quotaStr) return null;

  const quota = parseFloat(quotaStr);
  if (!Number.isFinite(quota) || quota <= 0) return null;

  const usedGb = metrics.egress_month_gb;
  if (typeof usedGb !== 'number') return null;

  const pct = usedGb / quota;
  let severity = 'clean';
  if (pct >= THRESHOLDS.egress.critical) severity = 'critical';
  else if (pct >= THRESHOLDS.egress.warn) severity = 'warn';

  const pctStr = `${Math.round(pct * 100)}%`;
  return {
    severity,
    payload: {
      symptom: 'egress',
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: severity === 'clean'
        ? `Egress mensal em ${pctStr} (${usedGb}/${quota} GB, saudável)`
        : `Egress mensal em ${pctStr} (${usedGb}/${quota} GB)`,
      resource: 'egress_monthly',
      live_value: pct,
      threshold_warn: THRESHOLDS.egress.warn,
      threshold_critical: THRESHOLDS.egress.critical,
      source: 'custom_endpoint',
    },
    evidence: {
      egress_used_gb: usedGb,
      egress_quota_gb: quota,
      egress_used_pct: pct,
      ts: metrics.ts,
    },
  };
}

export async function detect({ env = {}, metrics = null, now = Date.now() } = {}) {
  const events = [];
  if (!metrics) return events;

  const symA = detectSymptomA(metrics);
  if (symA) events.push(symA);

  const symB = detectSymptomB(metrics);
  if (symB) events.push(symB);

  const symC = detectSymptomC(metrics);
  if (symC) events.push(symC);

  const symD = detectSymptomD(env, metrics);
  if (symD) events.push(symD);

  return events;
}
