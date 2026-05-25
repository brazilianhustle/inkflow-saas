#!/usr/bin/env bash
# scripts/smoke/check-slice-gate.sh
# Valida se um slice tem PASS recente nos scenarios obrigatorios.

set -euo pipefail
cd "$(dirname "$0")/../.."

SLICE_NAME="${1:?uso: check-slice-gate.sh <slice-name>}"
GATE_FILE="${SMOKE_SLICE_GATE_FILE:-docs/atendimento-premium/slice-gates/${SLICE_NAME}.env}"
SMOKE_RUNS_FILE="${SMOKE_RUNS_FILE:-docs/atendimento-premium/smoke-runs.md}"

[ -f "$GATE_FILE" ] || { echo "ERRO: gate nao encontrado: $GATE_FILE" >&2; exit 1; }
[ -f "$SMOKE_RUNS_FILE" ] || { echo "ERRO: smoke-runs nao encontrado: $SMOKE_RUNS_FILE" >&2; exit 1; }

SLICE_ID="$SLICE_NAME"
SLICE_TITLE="$SLICE_NAME"
MIN_PASS_UTC=""
REQUIRED_SCENARIOS=""
FINAL_REHEARSAL_SCENARIO=""
REQUIRED_ARTIFACTS=$'summary.md\npoll.json\ntranscript.md\njudgment.md'

# shellcheck source=/dev/null
source "$GATE_FILE"

[ -n "$REQUIRED_SCENARIOS" ] || { echo "ERRO: gate sem REQUIRED_SCENARIOS." >&2; exit 1; }

trim_cell() {
  sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/`//g'
}

cell_at() {
  local line="$1"
  local index="$2"
  printf '%s\n' "$line" | awk -F'|' -v index="$index" '{print $index}' | trim_cell
}

latest_pass_line_for() {
  local scenario="$1"
  awk -F'|' -v scenario="$scenario" '
    $0 ~ /^\|/ &&
    $3 ~ "`scenario-" scenario "-" &&
    $7 ~ /PASS/ {
      print
      exit
    }
  ' "$SMOKE_RUNS_FILE"
}

status="PASS"
report_lines=()

add_report() {
  report_lines+=("$1")
}

add_report "# Slice Completion Gate"
add_report ""
add_report "- slice_id: ${SLICE_ID}"
add_report "- slice_title: ${SLICE_TITLE}"
add_report "- gate_file: ${GATE_FILE}"
add_report "- smoke_runs_file: ${SMOKE_RUNS_FILE}"
add_report "- min_pass_utc: ${MIN_PASS_UTC:-"(none)"}"
add_report "- final_rehearsal_scenario: ${FINAL_REHEARSAL_SCENARIO:-"(none)"}"
add_report ""
add_report "| Scenario | Result | Run UTC | Run ID | Evidence | Notes |"
add_report "|---|---|---|---|---|---|"

while IFS= read -r scenario; do
  [ -n "$scenario" ] || continue

  line="$(latest_pass_line_for "$scenario")"
  if [ -z "$line" ]; then
    status="FAIL"
    add_report "| \`${scenario}\` | FAIL | - | - | - | Nenhum PASS registrado em smoke-runs.md. |"
    continue
  fi

  run_utc="$(cell_at "$line" 2)"
  run_id="$(cell_at "$line" 3)"
  evidence="$(cell_at "$line" 8)"
  notes=()
  scenario_result="PASS"

  if [ -n "$MIN_PASS_UTC" ] && [[ "$run_utc" < "$MIN_PASS_UTC" ]]; then
    status="FAIL"
    scenario_result="FAIL"
    notes+=("PASS anterior ao corte ${MIN_PASS_UTC}")
  fi

  if [ ! -d "$evidence" ]; then
    status="FAIL"
    scenario_result="FAIL"
    notes+=("evidence_dir ausente")
  else
    while IFS= read -r artifact; do
      [ -n "$artifact" ] || continue
      if [ ! -f "$evidence/$artifact" ]; then
        status="FAIL"
        scenario_result="FAIL"
        notes+=("${artifact} ausente")
      fi
    done <<< "$REQUIRED_ARTIFACTS"
  fi

  if [ -n "$FINAL_REHEARSAL_SCENARIO" ] && [ "$scenario" = "$FINAL_REHEARSAL_SCENARIO" ]; then
    notes+=("ensaio final")
  fi

  if [ "${#notes[@]}" -eq 0 ]; then
    notes+=("ok")
  fi

  note_text="$(IFS='; '; printf '%s' "${notes[*]}")"
  add_report "| \`${scenario}\` | ${scenario_result} | ${run_utc} | \`${run_id}\` | \`${evidence}\` | ${note_text}. |"
done <<< "$REQUIRED_SCENARIOS"

add_report ""
add_report "## Decision"
add_report ""
if [ "$status" = "PASS" ]; then
  add_report "\`\`\`text"
  add_report "slice_completion: pass"
  add_report "decision: required scenarios have recent PASS and required artifacts"
  add_report "\`\`\`"
else
  add_report "\`\`\`text"
  add_report "slice_completion: blocked"
  add_report "decision: rerun missing or stale scenarios before closing the slice"
  add_report "\`\`\`"
fi

printf '%s\n' "${report_lines[@]}"

[ "$status" = "PASS" ]
