// ── InkFlow — Auditor #2: deploy-health ───────────────────────────────────
// Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §5.2

const RUNBOOK_PATH = 'docs/canonical/runbooks/rollback.md';
const SUGGESTED_SUBAGENT = 'deploy-engineer';
const DEFAULT_REPO = 'brazilianhustle/inkflow-saas';
const DEFAULT_WINDOW_HOURS = 6;
const GHA_WORKFLOW_NAME = 'Deploy to Cloudflare Pages';

function timeoutSignal(ms) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

function windowMs(env) {
  const h = parseInt(env.AUDIT_DEPLOY_HEALTH_WINDOW_HOURS || `${DEFAULT_WINDOW_HOURS}`, 10);
  return Number.isFinite(h) && h > 0 ? h * 3600 * 1000 : DEFAULT_WINDOW_HOURS * 3600 * 1000;
}

// Sintoma A: GHA failures ────────────────────────────────────────────────────

async function detectSymptomA(env, fetchImpl, now) {
  const token = env.GITHUB_API_TOKEN;
  if (!token) return [];

  const repo = env.GITHUB_REPO_FULL_NAME || DEFAULT_REPO;
  const url = `https://api.github.com/repos/${repo}/actions/runs?per_page=10`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'inkflow-audit-deploy-health',
  };

  let data;
  try {
    const res = await fetchImpl(url, { headers, signal: timeoutSignal(5000) });
    if (!res.ok) {
      return [{
        severity: 'warn',
        payload: {
          runbook_path: RUNBOOK_PATH,
          suggested_subagent: SUGGESTED_SUBAGENT,
          summary: `GHA API self-check returned ${res.status}`,
          symptom: 'gha-failures',
          status: res.status,
        },
        evidence: { status: res.status, source: 'github.com/actions/runs' },
      }];
    }
    data = await res.json();
  } catch (err) {
    return [{
      severity: 'warn',
      payload: {
        runbook_path: RUNBOOK_PATH,
        suggested_subagent: SUGGESTED_SUBAGENT,
        summary: `GHA API transient error: ${err.message}`,
        symptom: 'gha-failures',
        status: 'network_error',
      },
      evidence: { error: err.message, source: 'github.com/actions/runs' },
    }];
  }

  const runs = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
  const cutoff = now - windowMs(env);
  const failed = runs.filter((r) =>
    r.name === GHA_WORKFLOW_NAME &&
    r.conclusion === 'failure' &&
    new Date(r.created_at).getTime() >= cutoff
  );

  if (failed.length === 0) {
    return [{
      severity: 'clean',
      payload: { symptom: 'gha-failures', failed_count: 0 },
      evidence: { source: 'github.com/actions/runs' },
    }];
  }

  const severity = failed.length >= 2 ? 'critical' : 'warn';
  const lastSuccess = runs.find((r) =>
    r.name === GHA_WORKFLOW_NAME && r.conclusion === 'success'
  );

  return [{
    severity,
    payload: {
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: failed.length >= 2
        ? `${failed.length} GHA deploys consecutivos falharam`
        : `1 GHA deploy falhou`,
      symptom: 'gha-failures',
      failed_count: failed.length,
      failed_runs: failed.map((r) => ({
        id: r.id,
        conclusion: r.conclusion,
        created_at: r.created_at,
        html_url: r.html_url,
      })),
      last_successful_deploy: lastSuccess?.created_at || null,
    },
    evidence: { source: 'github.com/actions/runs', total_runs_inspected: runs.length },
  }];
}

// detect ────────────────────────────────────────────────────────────────────

export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  const events = [];
  if (fetchImpl) {
    events.push(...await detectSymptomA(env, fetchImpl, now));
  }
  return events;
}
