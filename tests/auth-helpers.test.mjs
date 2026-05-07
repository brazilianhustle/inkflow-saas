// ── InkFlow — unit tests pra functions/api/_auth-helpers.js ──────────────
// Spec: docs/superpowers/specs/2026-05-07-auth-tests-helpers-design.md
// Auditoria: F2.4.1 (auth bypass = leak entre tenants)
//
// IMPORTANTE: tests cobrem código existente em prod desde abril/2026.
// Se um teste falhar, investigar se é bug na lib OU no teste — NUNCA
// ajustar teste pra mascarar bug.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Fixtures ────────────────────────────────────────────────────────────
const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const STUDIO_SECRET = 'test-secret-min-32-chars-padding-padding';
const SUPABASE_URL = 'https://test.supabase.co';
const SUPABASE_KEY = 'test-service-key';

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Substitui globalThis.fetch e retorna função pra restaurar.
 * Use em try/finally pra garantir cleanup.
 */
function withMockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}

/**
 * Monta Response JSON consistente com Supabase REST output.
 */
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Multi-rota — match por substring na URL.
 * Uso: fetchMatcher([['/rest/v1/tenants?', () => jsonResponse([...])]])
 */
function fetchMatcher(routes) {
  return async (url) => {
    for (const [pattern, response] of routes) {
      if (url.includes(pattern)) return response();
    }
    throw new Error(`unmocked fetch: ${url}`);
  };
}

/**
 * Constrói token v1.<tidB64>.<expStr>.<sig> com HMAC válido sobre payload custom.
 * Pra cenários onde precisa de payload deliberadamente malformado mas com sig
 * assinada (T11: exp=NaN, T13: tenantId não-UUID).
 */
async function forgeToken({ tidB64, expStr, secret = STUDIO_SECRET }) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const payload = `${tidB64}.${expStr}`;
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const sig = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return `v1.${payload}.${sig}`;
}

/**
 * Pega token gerado e modifica só a sig (parte 4).
 * Pra T9 (sig trocada mesma length) e T10 (sig length diferente).
 */
function mutateSig(token, mutator) {
  const parts = token.split('.');
  parts[3] = mutator(parts[3]);
  return parts.join('.');
}

/**
 * DRY wrapper sobre generateStudioToken. Aceita ttlDays arbitrário (default 30).
 * - ttlDays = -1 → token expirado
 * - ttlDays = 6.5 → shouldRefresh = true (< 7d)
 * - ttlDays = 30 → válido (default)
 */
async function makeToken(tenantId, ttlDays = 30) {
  const { generateStudioToken } = await import('../functions/api/_auth-helpers.js');
  return generateStudioToken(tenantId, STUDIO_SECRET, ttlDays);
}

// ─── Tests below ─────────────────────────────────────────────────────────
// (próximas tasks adicionam testes aqui)

// ─── b64url ───
test('b64url — round-trip', async () => {
  const { b64url, b64urlDecode } = await import('../functions/api/_auth-helpers.js');
  assert.equal(b64urlDecode(b64url('hello world')), 'hello world');
});
