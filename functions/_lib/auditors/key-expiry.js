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

// Layer 2: self-check ───────────────────────────────────────────────────────

const SELF_CHECK_TARGETS = [
  {
    name: 'CLOUDFLARE_API_TOKEN',
    url: 'https://api.cloudflare.com/client/v4/user/tokens/verify',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: 'CF_API_TOKEN',
    url: 'https://api.cloudflare.com/client/v4/user/tokens/verify',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: 'MP_ACCESS_TOKEN',
    url: 'https://api.mercadopago.com/users/me',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: 'TELEGRAM_BOT_TOKEN',
    url: (key) => `https://api.telegram.org/bot${key}/getMe`,
    headers: () => ({}),
  },
  {
    name: 'OPENAI_API_KEY',
    url: 'https://api.openai.com/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: 'PUSHOVER_APP_TOKEN',
    url: 'https://api.pushover.net/1/users/validate.json',
    method: 'POST',
    body: (key, env) => `token=${encodeURIComponent(key)}&user=${encodeURIComponent(env.PUSHOVER_USER_KEY)}`,
    contentType: 'application/x-www-form-urlencoded',
    requires: ['PUSHOVER_USER_KEY'],
  },
  {
    name: 'SUPABASE_SERVICE_KEY',
    url: 'https://bfzuxxuscyplfoimvomh.supabase.co/rest/v1/?limit=1',
    headers: (key) => ({ apikey: key, Authorization: `Bearer ${key}` }),
  },
  {
    name: 'EVO_GLOBAL_KEY',
    url: 'https://evo.inkflowbrasil.com/instance/fetchInstances',
    headers: (key) => ({ apikey: key }),
  },
];

async function selfCheckOne(target, env, fetchImpl) {
  const key = env[target.name];
  if (!key) return null;
  if (target.requires) {
    for (const r of target.requires) {
      if (!env[r]) return null;
    }
  }
  const url = typeof target.url === 'function' ? target.url(key) : target.url;
  const opts = {
    method: target.method || 'GET',
    headers: typeof target.headers === 'function' ? target.headers(key) : (target.headers || {}),
    signal: AbortSignal.timeout(5000),
  };
  if (target.body) {
    opts.body = target.body(key, env);
    opts.headers = { ...opts.headers, 'Content-Type': target.contentType };
  }

  let res;
  try {
    res = await fetchImpl(url, opts);
  } catch (err) {
    return {
      severity: 'warn',
      payload: {
        runbook_path: RUNBOOK_PATH,
        suggested_subagent: SUGGESTED_SUBAGENT,
        summary: `${target.name} self-check transient network error: ${err.message}`,
        secret_name: target.name,
        layer: 'self-check',
        status: 'network_error',
      },
      evidence: { error: err.message, url },
    };
  }

  if (res.status === 401 || res.status === 403) {
    let bodyShort = '';
    try { bodyShort = (await res.text()).slice(0, 200); } catch { /* ignore */ }
    return {
      severity: 'critical',
      payload: {
        runbook_path: RUNBOOK_PATH,
        suggested_subagent: SUGGESTED_SUBAGENT,
        summary: `${target.name} self-check returned ${res.status} (key inválida)`,
        secret_name: target.name,
        layer: 'self-check',
        status: res.status,
      },
      evidence: { status: res.status, body_short: bodyShort, url },
    };
  }

  if (!res.ok) {
    let bodyShort = '';
    try { bodyShort = (await res.text()).slice(0, 200); } catch { /* ignore */ }
    return {
      severity: 'warn',
      payload: {
        runbook_path: RUNBOOK_PATH,
        suggested_subagent: SUGGESTED_SUBAGENT,
        summary: `${target.name} self-check returned ${res.status} (transient)`,
        secret_name: target.name,
        layer: 'self-check',
        status: res.status,
      },
      evidence: { status: res.status, body_short: bodyShort, url },
    };
  }

  // Free CF Workers connection pool — body unused on success
  try { res.body?.cancel?.(); } catch { /* ignore */ }
  return null;
}

async function detectLayer2(env, fetchImpl) {
  const events = [];
  for (const target of SELF_CHECK_TARGETS) {
    const evt = await selfCheckOne(target, env, fetchImpl);
    if (evt) events.push(evt);
  }
  return events;
}

// detect ────────────────────────────────────────────────────────────────────

export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  const events = [];
  events.push(...detectLayer1(env, now));
  if (fetchImpl) {
    events.push(...await detectLayer2(env, fetchImpl));
  }
  return events;
}
