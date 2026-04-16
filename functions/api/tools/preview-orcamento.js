// ── Endpoint — preview_orcamento ───────────────────────────────────────────
// POST /api/tools/preview-orcamento
// Auth: studio_token (via header X-Studio-Token OU body.studio_token)
//       OU admin JWT (Authorization: Bearer ...)
// Body: { tenant_id, tamanho_cm, estilo, regiao, cor_bool, nivel_detalhe }
//
// Clone funcional de calcular-orcamento mas SEM persistir em tool_calls_log.
// Usado pelo Testador A (calculadora no wizard de preços).
// Sem rate limit no backend (frontend impede spam natural).

import { toolJson, TOOL_HEADERS } from './_tool-helpers.js';
import { verifyStudioTokenOrLegacy } from '../_auth-helpers.js';
import { loadConfigPrecificacao, calcularOrcamento } from '../../_lib/pricing.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const ADMIN_EMAIL = 'lmf4200@gmail.com';

async function verifyAdmin(authHeader, supabaseKey) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: authHeader },
    });
    if (!r.ok) return false;
    const u = await r.json();
    return u.email === ADMIN_EMAIL;
  } catch { return false; }
}

async function supaFetch(env, path) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  return fetch(`${SUPABASE_URL}${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: TOOL_HEADERS });
  if (request.method !== 'POST') return toolJson({ ok: false, error: 'method-not-allowed' }, 405);

  let input;
  try { input = await request.json(); }
  catch { return toolJson({ ok: false, error: 'invalid-json' }, 400); }

  const { tenant_id, tamanho_cm, estilo, regiao, cor_bool, nivel_detalhe, studio_token } = input || {};
  if (!tenant_id) return toolJson({ ok: false, error: 'tenant_id obrigatorio' }, 400);

  // Auth: admin JWT OU studio_token (match de tenant)
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  const authHeader = request.headers.get('Authorization') || '';
  const tokenViaBody = studio_token;
  const tokenViaHeader = request.headers.get('X-Studio-Token');
  const studio_tok = tokenViaBody || tokenViaHeader;

  let authorized = false;

  if (await verifyAdmin(authHeader, SB_KEY)) {
    authorized = true;
  } else if (studio_tok) {
    const verified = await verifyStudioTokenOrLegacy({
      token: studio_tok,
      secret: env.STUDIO_TOKEN_SECRET,
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SB_KEY,
    });
    if (verified && verified.tenantId === tenant_id) authorized = true;
  }

  if (!authorized) {
    return toolJson({ ok: false, error: 'unauthorized' }, 401);
  }

  // Carrega config + calcula (reusa motor compartilhado)
  let tenant;
  try {
    tenant = await loadConfigPrecificacao((path) => supaFetch(env, path), tenant_id);
  } catch (e) {
    return toolJson({ ok: false, error: 'db-error', detail: String(e?.message || e) }, 500);
  }
  if (!tenant) return toolJson({ ok: false, error: 'tenant-nao-encontrado' }, 404);

  const result = calcularOrcamento({ tamanho_cm, estilo, regiao, cor_bool, nivel_detalhe }, tenant);

  if (result.ok === false) return toolJson(result, 400);
  return toolJson({ ...result, preview: true }, 200);
}
