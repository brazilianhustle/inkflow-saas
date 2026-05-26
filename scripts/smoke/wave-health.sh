#!/usr/bin/env bash
# scripts/smoke/wave-health.sh
# Resumo unico de saude para ondas Level 4A.

set -euo pipefail
cd "$(dirname "$0")/../.."

run_section() {
  local title="$1"
  shift

  echo
  echo "## ${title}"
  echo
  "$@"
}

status="PASS"
allow_dirty="${WAVE_HEALTH_ALLOW_DIRTY:-0}"

echo "# Wave Health"
echo
echo "- generated_at_utc: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "- branch: $(git rev-parse --abbrev-ref HEAD)"
echo "- head: $(git rev-parse --short HEAD)"

if [ -n "$(git status --porcelain)" ] && [ "$allow_dirty" != "1" ]; then
  status="DIRTY"
  echo "- worktree: dirty"
elif [ -n "$(git status --porcelain)" ]; then
  echo "- worktree: dirty_allowed"
else
  echo "- worktree: clean"
fi

run_section "Autonomy Gate" bash scripts/smoke/check-autonomy-gate.sh
run_section "Security Gate" bash scripts/smoke/check-security-gate.sh
run_section "Evidence Orphan Gate" bash scripts/smoke/evidence-orphan-gate.sh

echo
echo "## Git"
echo
git status --short --branch

echo
echo "## Decision"
echo
cat <<REPORT
\`\`\`text
status: ${status}
decision: $(if [ "$status" = "PASS" ]; then echo wave_health_pass; else echo wave_health_attention; fi)
\`\`\`
REPORT

[ "$status" = "PASS" ]
