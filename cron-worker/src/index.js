// ── InkFlow — Cron Worker (dispatcher) ───────────────────────────────────────
// Cada cron do wrangler.toml dispara scheduled(event, env, ctx). Escolhemos
// o endpoint por event.cron e fazemos um POST com header Bearer para o secret
// correto (CRON_SECRET ou CLEANUP_SECRET, conforme o endpoint).
//
// Setup:
//   wrangler deploy
//   wrangler secret put CRON_SECRET     (mesmo valor que CF Pages — UNICO secret necessario)
//   wrangler secret put TELEGRAM_BOT_TOKEN  (opcional, pra alerta de falha)
//   wrangler secret put TELEGRAM_CHAT_ID    (opcional)

const BASE_URL = 'https://inkflowbrasil.com';

// Mapa: cron expression → { path, secretEnv }
// Mantem em sync com triggers em wrangler.toml.
// Todos os endpoints aceitam CRON_SECRET (cleanup-tenants tambem aceita
// CLEANUP_SECRET como legacy, mas aqui usamos CRON_SECRET pra unificar).
const SCHEDULE_MAP = {
  '0 12 * * *':   { path: '/api/cron/expira-trial',       secretEnv: 'CRON_SECRET', label: 'expira-trial' },
  '0 2 * * *':    { path: '/api/cleanup-tenants',         secretEnv: 'CRON_SECRET', label: 'cleanup-tenants' },
  '0 9 * * *':    { path: '/api/cron/reset-agendamentos', secretEnv: 'CRON_SECRET', label: 'reset-agendamentos' },
  '*/30 * * * *': { path: '/api/cron/monitor-whatsapp',   secretEnv: 'CRON_SECRET', label: 'monitor-whatsapp' },
  '*/15 * * * *': { path: '/api/cron/auto-retomar-bot',   secretEnv: 'CRON_SECRET', label: 'auto-retomar-bot' },
  '*/5 * * * *':  { path: '/api/cron/audit-escalate',     secretEnv: 'CRON_SECRET', label: 'audit-escalate' },
  '0 4 * * 1':    { path: '/api/cron/audit-cleanup',      secretEnv: 'CRON_SECRET', label: 'audit-cleanup' },
  '0 6 * * *':    { path: '/api/cron/audit-key-expiry',   secretEnv: 'CRON_SECRET', label: 'audit-key-expiry' },
  '0 */6 * * *':  { path: '/api/cron/audit-deploy-health', secretEnv: 'CRON_SECRET', label: 'audit-deploy-health' },
  '30 */6 * * *': { path: '/api/cron/audit-billing-flow', secretEnv: 'CRON_SECRET', label: 'audit-billing-flow' },
  '15 */6 * * *': { path: '/api/cron/audit-vps-limits',   secretEnv: 'CRON_SECRET', label: 'audit-vps-limits' },
  '0 7 * * *':    { path: '/api/cron/audit-rls-drift',    secretEnv: 'CRON_SECRET', label: 'audit-rls-drift' }, // pivot-ready (trigger comentado em wrangler.toml)
  '0 12 * * 1':   { path: '/api/cron/resumo-semanal',     secretEnv: 'CRON_SECRET', label: 'resumo-semanal' }, // PR 2 Dashboard
  '0 3 * * *':    { path: '/api/cron/classify-personas',  secretEnv: 'CRON_SECRET', label: 'classify-personas' }, // InkFlow Agent Sub 1.A
};

async function notifyFailure(env, label, detail) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const text = `⚠️ Cron Worker: ${label} falhou\n\n${detail}`;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    });
  } catch {
    // fail-open: se Telegram tambem falhar, pelo menos tem log no CF
  }
}

const RETRY_BACKOFF_MS = 3000;

async function tryFetch(url, secret) {
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
    });
    const bodyText = await res.text();
    return { ok: res.ok, status: res.status, bodyText, elapsedMs: Date.now() - startedAt };
  } catch (err) {
    return { ok: false, exception: err, elapsedMs: Date.now() - startedAt };
  }
}

// Retry classifier: 504 (transient_timeout — endpoint sinaliza explicit), 502 (bad gateway
// upstream Supabase REST), 5xx unhandled, ou exception. NÃO faz retry em 4xx (auth/config
// fail) — fail-fast com alerta imediato.
function isRetryable(result) {
  if (result.exception) return true;
  if (result.status >= 500) return true;
  return false;
}

async function dispatch(event, env) {
  const cfg = SCHEDULE_MAP[event.cron];
  if (!cfg) {
    console.warn(`Unknown cron expression: ${event.cron}. Ignorando.`);
    return { skipped: true, cron: event.cron };
  }

  const secret = env[cfg.secretEnv];
  if (!secret) {
    const msg = `Secret ${cfg.secretEnv} ausente — nao chamando ${cfg.label}`;
    console.error(msg);
    await notifyFailure(env, cfg.label, msg);
    return { error: 'missing_secret', label: cfg.label };
  }

  const url = `${BASE_URL}${cfg.path}`;

  // Try 1: primeiro attempt
  let result = await tryFetch(url, secret);
  let attempts = 1;

  // Retry 1× se retryable (transient ou 5xx) — absorve hiccups Supabase REST + cold start CF
  if (isRetryable(result)) {
    console.warn(`[${cfg.label}] try 1 failed (${result.status || result.exception?.message}), retrying after ${RETRY_BACKOFF_MS}ms...`);
    await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
    result = await tryFetch(url, secret);
    attempts = 2;
  }

  // Resultado final do retry (ou primeira tentativa se !retryable)
  if (result.exception) {
    console.error(`[${cfg.label}] exception após ${attempts} tentativas:`, result.exception.message);
    await notifyFailure(env, cfg.label, `Exception após ${attempts} tentativas: ${result.exception.message}`);
    return { ok: false, error: result.exception.message, label: cfg.label, attempts };
  }

  if (!result.ok) {
    console.error(`[${cfg.label}] HTTP ${result.status} após ${attempts} tentativas em ${result.elapsedMs}ms: ${result.bodyText?.slice(0, 500)}`);
    await notifyFailure(env, cfg.label, `HTTP ${result.status} (após ${attempts} tentativas)\nElapsed: ${result.elapsedMs}ms\nBody: ${result.bodyText?.slice(0, 200)}`);
    return { ok: false, status: result.status, label: cfg.label, elapsedMs: result.elapsedMs, attempts };
  }

  console.log(`[${cfg.label}] OK em ${result.elapsedMs}ms (try ${attempts}): ${result.bodyText?.slice(0, 300)}`);
  return { ok: true, label: cfg.label, elapsedMs: result.elapsedMs, attempts, response: result.bodyText?.slice(0, 300) };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(dispatch(event, env));
  },

  // Handler HTTP opcional: permite disparar um cron manualmente via
  //   POST https://inkflow-cron.<account>.workers.dev/?cron=<expression>
  //   Header: Authorization: Bearer <CRON_SECRET>
  // Util pra debug / rerun manual sem abrir o CF dashboard.
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!env.CRON_SECRET || token !== env.CRON_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }
    const url = new URL(request.url);
    const cron = url.searchParams.get('cron');
    if (!cron || !SCHEDULE_MAP[cron]) {
      return new Response(JSON.stringify({ error: 'cron invalido', valid: Object.keys(SCHEDULE_MAP) }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    const result = await dispatch({ cron }, env);
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
