// ── InkFlow — helpers de autenticação (HMAC + verify) ──────────────────────
// Módulo interno (prefixo _ evita exposição como rota do Pages Functions).
// Usado por validate-studio-token, send-studio-email, update-tenant, get-tenant.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── base64url ────────────────────────────────────────────────────────────────
export function b64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
export function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

// ── HMAC-SHA256 (Web Crypto) ────────────────────────────────────────────────
async function hmacSign(data, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Studio tokens: formato v1.<tenantIdB64>.<expUnix>.<hmacHex> ─────────────
// TTL padrão: 30 dias. Renovação (sliding) se <7 dias até expirar.
const DEFAULT_TTL_DAYS = 30;
const REFRESH_THRESHOLD_DAYS = 7;

export async function generateStudioToken(tenantId, secret, ttlDays = DEFAULT_TTL_DAYS) {
  if (!UUID_RE.test(tenantId)) throw new Error('tenant_id inválido');
  if (!secret) throw new Error('STUDIO_TOKEN_SECRET ausente');
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 86400;
  const payload = `${b64url(tenantId)}.${exp}`;
  const sig = await hmacSign(payload, secret);
  return `v1.${payload}.${sig}`;
}

// Retorna { valid: true, tenantId, exp, shouldRefresh } ou { valid: false, reason }
// ou null se não for um token HMAC (frontend deve tentar o caminho legacy).
export async function verifyStudioToken(token, secret) {
  if (typeof token !== 'string' || !token.startsWith('v1.')) return null;
  if (!secret) return { valid: false, reason: 'secret-missing' };
  const parts = token.split('.');
  if (parts.length !== 4) return { valid: false, reason: 'malformed' };
  const [, tidB64, expStr, sig] = parts;
  const payload = `${tidB64}.${expStr}`;
  let expectedSig;
  try { expectedSig = await hmacSign(payload, secret); }
  catch { return { valid: false, reason: 'hmac-error' }; }
  // timing-safe compare
  if (sig.length !== expectedSig.length) return { valid: false, reason: 'bad-signature' };
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  if (diff !== 0) return { valid: false, reason: 'bad-signature' };
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp)) return { valid: false, reason: 'malformed-exp' };
  const now = Math.floor(Date.now() / 1000);
  if (exp < now) return { valid: false, reason: 'expired', exp };
  let tenantId;
  try { tenantId = b64urlDecode(tidB64); }
  catch { return { valid: false, reason: 'malformed-tenant' }; }
  if (!UUID_RE.test(tenantId)) return { valid: false, reason: 'malformed-tenant' };
  const shouldRefresh = (exp - now) < (REFRESH_THRESHOLD_DAYS * 86400);
  return { valid: true, tenantId, exp, shouldRefresh };
}

// ── Verifica onboarding_key contra tenants.onboarding_key no Supabase ───────
// Uso: durante onboarding, o frontend guarda a key em localStorage e envia
// junto com tenant_id. Endpoint valida match antes de permitir mutação.
// Também verifica TTL contra onboarding_links.expires_at — keys expiradas não
// autorizam mais, mesmo se persistidas em tenants.onboarding_key.
export async function verifyOnboardingKey({ tenantId, onboardingKey, supabaseUrl, supabaseKey }) {
  if (!tenantId || !onboardingKey || typeof onboardingKey !== 'string' || onboardingKey.length < 8) {
    return { ok: false, reason: 'missing' };
  }
  if (!UUID_RE.test(tenantId)) return { ok: false, reason: 'invalid-tenant-id' };
  try {
    // 1. Match tenant.onboarding_key == key recebida
    const r = await fetch(
      `${supabaseUrl}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}&select=onboarding_key`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    if (!r.ok) return { ok: false, reason: 'db-error' };
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) return { ok: false, reason: 'not-found' };
    const stored = rows[0].onboarding_key;
    if (!stored || stored !== onboardingKey) return { ok: false, reason: 'mismatch' };

    // 2. Verifica TTL via onboarding_links.expires_at (fail-open se link nao encontrado)
    try {
      const linkRes = await fetch(
        `${supabaseUrl}/rest/v1/onboarding_links?key=eq.${encodeURIComponent(onboardingKey)}&select=expires_at`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
      );
      if (linkRes.ok) {
        const linkRows = await linkRes.json();
        if (Array.isArray(linkRows) && linkRows.length > 0) {
          const expiresAt = linkRows[0].expires_at;
          if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
            return { ok: false, reason: 'expired', expires_at: expiresAt };
          }
        }
      }
    } catch (e) {
      console.warn('verifyOnboardingKey: TTL check falhou (fail-open):', e?.message);
    }

    return { ok: true };
  } catch (e) {
    console.error('verifyOnboardingKey exception:', e);
    return { ok: false, reason: 'exception' };
  }
}

// ── Verifica studio_token contra tenants.studio_token no Supabase (legacy) ──
// Aceita token UUID legacy OU HMAC v1.*. Retorna tenantId validado ou null.
export async function verifyStudioTokenOrLegacy({ token, secret, supabaseUrl, supabaseKey }) {
  if (!token || typeof token !== 'string') return null;
  // Caminho 1: HMAC
  const hmac = await verifyStudioToken(token, secret);
  if (hmac?.valid) return { tenantId: hmac.tenantId, exp: hmac.exp, shouldRefresh: hmac.shouldRefresh, source: 'hmac' };
  if (hmac && !hmac.valid && hmac.reason === 'expired') return null; // expirado → não tenta fallback
  // Caminho 2: UUID legacy (busca no DB)
  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/tenants?studio_token=eq.${encodeURIComponent(token)}&select=id`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return { tenantId: rows[0].id, source: 'legacy-uuid' };
  } catch {
    return null;
  }
}
