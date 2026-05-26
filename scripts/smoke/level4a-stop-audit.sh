#!/usr/bin/env bash
# scripts/smoke/level4a-stop-audit.sh
# Confirma que as stop conditions criticas do Level 4A seguem documentadas.

set -euo pipefail
cd "$(dirname "$0")/../.."

DOCS=(
  "docs/atendimento-premium/19-level-4-loop-policy.md"
  "docs/atendimento-premium/21-level-4a-wave-1.md"
  "docs/atendimento-premium/current-objective.md"
)

declare -a REQUIRED_PATTERNS=(
  "CI FAIL|CI PASS"
  "deploy FAIL|deploy PASS"
  "HTTP radar FAIL|HTTP radar PASS"
  "WhatsApp real FAIL|WhatsApp real PASS|WhatsApp real definitivo"
  "copy_risk=alto"
  "estado final errado|estado"
  "cleanup inseguro|cleanup limpo"
  "agent_turn_logs"
  "preco|sinal|pagamento|agenda"
  "secrets"
  "zona vermelha|vermelho"
  "triage"
)

status="PASS"
missing=()

combined="$(mktemp "${TMPDIR:-/tmp}/inkflow-stop-audit.XXXXXX")"
trap 'rm -f "$combined"' EXIT

for doc in "${DOCS[@]}"; do
  [ -f "$doc" ] || { status="FAIL"; missing+=("missing_doc:${doc}"); continue; }
  printf '\n# %s\n' "$doc" >> "$combined"
  cat "$doc" >> "$combined"
done

echo "# Level 4A Stop Audit"
echo
echo "| Pattern | Result |"
echo "|---|---|"

for pattern in "${REQUIRED_PATTERNS[@]}"; do
  if grep -Eiq "$pattern" "$combined"; then
    echo "| \`${pattern}\` | PASS |"
  else
    status="FAIL"
    missing+=("missing_pattern:${pattern}")
    echo "| \`${pattern}\` | FAIL |"
  fi
done

echo
echo "## Decision"
echo
cat <<REPORT
\`\`\`text
status: ${status}
decision: $(if [ "$status" = "PASS" ]; then echo stop_audit_pass; else echo stop_audit_blocked; fi)
missing: $(if [ "${#missing[@]}" -eq 0 ]; then echo none; else IFS=,; echo "${missing[*]}"; fi)
\`\`\`
REPORT

[ "$status" = "PASS" ]
