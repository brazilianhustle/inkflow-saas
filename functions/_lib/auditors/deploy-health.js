// ── InkFlow — Auditor #2: deploy-health ───────────────────────────────────
// Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §5.2
//
// detect({ env, fetchImpl, now }) → Array<event>
//   event = { severity, payload, evidence }
//   - severity ∈ {'clean', 'warn', 'critical'}
//   - payload preenchido por sintoma (campos por symptom abaixo)
//   - evidence = response bruto do source que disparou
//
// 3 sintomas:
//   Sintoma A (gha-failures):    GitHub Actions API — failures em deploy.yml
//   Sintoma B (pages-failures):  CF Pages API — deployments com latest_stage.status='failure'
//   Sintoma C (wrangler-drift):  env.AUDIT_DEPLOY_HEALTH_WRANGLER_DRIFT === 'true' (opt-in)

export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  return [];
}
