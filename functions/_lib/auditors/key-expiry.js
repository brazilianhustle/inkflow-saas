// ── InkFlow — Auditor #1: key-expiry ──────────────────────────────────────
// Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §5.1
//
// detect({ env, fetchImpl, now }) → Array<event>
//   event = { severity, payload, evidence }
//   - severity ∈ {'clean', 'warn', 'critical'}
//   - payload preenchido por camada (campos por layer abaixo)
//   - evidence = response bruto da camada que disparou
//
// 3 camadas:
//   Layer 1 (TTL):    env.CLOUDFLARE_API_TOKEN_EXPIRES_AT (ISO date)
//   Layer 2 (check):  GET self-check em 8 secrets críticos
//   Layer 3 (drift):  env.AUDIT_KEY_EXPIRY_LAYER3 === 'true' (opt-in)

export async function detect({ env, fetchImpl, now = Date.now() } = {}) {
  return [];
}
