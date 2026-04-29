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
  const url = `https://api.github.com/repos/${repo}/actions/runs?per_page=20`;
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

  const sortedTargetRuns = runs
    .filter((r) => r.name === GHA_WORKFLOW_NAME)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const cutoff = now - windowMs(env);
  const inWindow = sortedTargetRuns.filter((r) => new Date(r.created_at).getTime() >= cutoff);

  const consecutiveFailures = [];
  for (const r of inWindow) {
    if (r.conclusion === 'failure') {
      consecutiveFailures.push(r);
    } else {
      break;
    }
  }

  if (consecutiveFailures.length === 0) {
    return [{
      severity: 'clean',
      payload: { symptom: 'gha-failures', failed_count: 0 },
      evidence: { source: 'github.com/actions/runs' },
    }];
  }

  const severity = consecutiveFailures.length >= 2 ? 'critical' : 'warn';
  const lastSuccess = sortedTargetRuns.find((r) => r.conclusion === 'success');

  return [{
    severity,
    payload: {
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: consecutiveFailures.length >= 2
        ? `${consecutiveFailures.length} GHA deploys consecutivos falharam`
        : `1 GHA deploy falhou`,
      symptom: 'gha-failures',
      failed_count: consecutiveFailures.length,
      failed_runs: consecutiveFailures.map((r) => ({
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

// Sintoma B: CF Pages build failures ────────────────────────────────────────

async function detectSymptomB(env, fetchImpl, now) {
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) return [];

  const projectName = env.CF_PAGES_PROJECT_NAME || 'inkflow-saas';
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments?per_page=20`;
  const headers = { Authorization: `Bearer ${token}` };

  let data;
  try {
    const res = await fetchImpl(url, { headers, signal: timeoutSignal(5000) });
    if (!res.ok) {
      return [{
        severity: 'warn',
        payload: {
          runbook_path: RUNBOOK_PATH,
          suggested_subagent: SUGGESTED_SUBAGENT,
          summary: `CF Pages API self-check returned ${res.status}`,
          symptom: 'pages-failures',
          status: res.status,
        },
        evidence: { status: res.status, source: 'cloudflare/pages/deployments' },
      }];
    }
    data = await res.json();
  } catch (err) {
    return [{
      severity: 'warn',
      payload: {
        runbook_path: RUNBOOK_PATH,
        suggested_subagent: SUGGESTED_SUBAGENT,
        summary: `CF Pages API transient error: ${err.message}`,
        symptom: 'pages-failures',
        status: 'network_error',
      },
      evidence: { error: err.message, source: 'cloudflare/pages/deployments' },
    }];
  }

  const deployments = Array.isArray(data?.result) ? data.result : [];

  // Sort by created_on descending (don't trust API order)
  const sorted = deployments
    .slice()
    .sort((a, b) => new Date(b.created_on).getTime() - new Date(a.created_on).getTime());

  const cutoff = now - windowMs(env);
  const inWindow = sorted.filter((d) => new Date(d.created_on).getTime() >= cutoff);

  // Count CONSECUTIVE failures from most recent (same pattern as Sintoma A)
  const consecutiveFailures = [];
  for (const d of inWindow) {
    if (d.latest_stage?.status === 'failure') {
      consecutiveFailures.push(d);
    } else {
      break;
    }
  }

  if (consecutiveFailures.length === 0) {
    return [{
      severity: 'clean',
      payload: { symptom: 'pages-failures', failed_count: 0 },
      evidence: { source: 'cloudflare/pages/deployments' },
    }];
  }

  const severity = consecutiveFailures.length >= 2 ? 'critical' : 'warn';
  const lastSuccess = sorted.find((d) => d.latest_stage?.status === 'success');

  return [{
    severity,
    payload: {
      runbook_path: RUNBOOK_PATH,
      suggested_subagent: SUGGESTED_SUBAGENT,
      summary: consecutiveFailures.length >= 2
        ? `${consecutiveFailures.length} CF Pages builds consecutivos falharam`
        : `1 CF Pages build falhou`,
      symptom: 'pages-failures',
      failed_count: consecutiveFailures.length,
      failed_deployments: consecutiveFailures.map((d) => ({
        id: d.id,
        created_on: d.created_on,
        url: d.url,
      })),
      last_successful_deploy: lastSuccess?.created_on || null,
    },
    evidence: { source: 'cloudflare/pages/deployments', total_inspected: deployments.length },
  }];
}

// detect ────────────────────────────────────────────────────────────────────

export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  const events = [];
  if (fetchImpl) {
    events.push(...await detectSymptomA(env, fetchImpl, now));
    events.push(...await detectSymptomB(env, fetchImpl, now));
  }
  return events;
}
