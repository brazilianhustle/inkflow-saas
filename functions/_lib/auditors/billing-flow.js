// ── InkFlow — Auditor #5: billing-flow ─────────────────────────────────────
// Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §5.5
// Sintomas:
//   A — webhook MP delay (>6h sem payment_logs row → warn)
//   B — webhook MP silent (>24h + MP confirma sub ativa → critical)
//   C — MailerLite group drift (tenant ativo não no CLIENTES_ATIVOS → warn)
//   D — DB consistency (trial_expirado + ativo=true → critical)

const RUNBOOK_PATH = 'docs/canonical/runbooks/mp-webhook-down.md';
const SUGGESTED_SUBAGENT = null; // MP é manual no MVP, sem agent dedicado

function timeoutSignal(ms) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

export async function detect({ env = {}, fetchImpl, now = Date.now() } = {}) {
  const events = [];
  if (!fetchImpl) return events;
  // Sintomas serão adicionados nas tasks 2-5
  return events;
}
