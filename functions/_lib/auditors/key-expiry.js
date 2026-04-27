// ── InkFlow — Auditor #1: key-expiry ──────────────────────────────────────
// Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §5.1

const RUNBOOK_PATH = 'docs/canonical/runbooks/secrets-expired.md';
const SUGGESTED_SUBAGENT = 'deploy-engineer';

// Layer 1: TTL ───────────────────────────────────────────────────────────────

function ttlSeverity(days) {
  if (days > 14) return 'clean';
  if (days >= 7) return 'warn';
  return 'critical';
}

function detectLayer1(env, now) {
  const expiresAtIso = env.CLOUDFLARE_API_TOKEN_EXPIRES_AT;
  if (!expiresAtIso) return [];
  const expiresAt = new Date(expiresAtIso).getTime();
  if (Number.isNaN(expiresAt)) return [];
  const daysUntil = Math.floor((expiresAt - now) / (24 * 3600 * 1000));
  const severity = ttlSeverity(daysUntil);
  return [{
    severity,
    payload: {
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: severity === 'clean'
        ? `CLOUDFLARE_API_TOKEN OK (expira em ${daysUntil}d)`
        : `CLOUDFLARE_API_TOKEN expira em ${daysUntil}d`,
      secret_name: 'CLOUDFLARE_API_TOKEN',
      layer: 'ttl',
      days_until_expiry: daysUntil,
      expires_at: expiresAtIso,
    },
    evidence: { source: 'env.CLOUDFLARE_API_TOKEN_EXPIRES_AT', value: expiresAtIso },
  }];
}

// detect ────────────────────────────────────────────────────────────────────

export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  const events = [];
  events.push(...detectLayer1(env, now));
  return events;
}
