#!/usr/bin/env bash
# scripts/smoke/evidence-index.sh
# Lista curta das evidencias de smoke mais recentes, com foco em WhatsApp real.

set -euo pipefail
cd "$(dirname "$0")/../.."

SMOKE_RUNS_FILE="${SMOKE_RUNS_FILE:-docs/atendimento-premium/smoke-runs.md}"
LIMIT="${LIMIT:-8}"

[ -f "$SMOKE_RUNS_FILE" ] || { echo "ERRO: smoke-runs nao encontrado: $SMOKE_RUNS_FILE" >&2; exit 1; }

print_table() {
  local mode="$1"
  local title="$2"

  echo
  echo "## ${title}"
  echo
  echo "| Data UTC | Run ID | Tipo | Evidencia | Decisao curta |"
  echo "|---|---|---|---|---|"

  awk -F'|' -v limit="$LIMIT" -v mode="$mode" '
    function trim(s) {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", s)
      gsub(/`/, "", s)
      return s
    }
    function short(s) {
      s = trim(s)
      if (length(s) > 180) return substr(s, 1, 177) "..."
      return s
    }
    $0 ~ /^\|/ && $7 ~ /PASS/ {
      tipo = trim($4)
      if (mode == "real" && tipo !~ /WhatsApp real/) next
      data = trim($2)
      run_id = trim($3)
      evidence = trim($8)
      decision = short($9)
      if (run_id == "Run ID" || data == "---") next
      print "| " data " | `" run_id "` | " tipo " | `" evidence "` | " decision " |"
      count++
      if (count >= limit) exit
    }
  ' "$SMOKE_RUNS_FILE"
}

echo "# Smoke Evidence Index"
echo
echo "- smoke_runs_file: ${SMOKE_RUNS_FILE}"
echo "- limit: ${LIMIT}"

print_table "real" "WhatsApp Real PASS Recentes"
print_table "all" "Todos PASS Recentes"

echo
echo "## Decision"
echo
cat <<REPORT
\`\`\`text
status: PASS
decision: evidence_index_rendered
\`\`\`
REPORT
