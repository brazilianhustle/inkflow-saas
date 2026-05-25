#!/usr/bin/env bash
# scripts/smoke/check-autonomy-gate.sh
# Decide a janela maxima segura de execucao autonoma para atendimento premium.

set -euo pipefail
cd "$(dirname "$0")/../.."

GATE_FILE="${AUTONOMY_GATE_FILE:-docs/atendimento-premium/autonomy-gate.env}"
SMOKE_RUNS_FILE="${SMOKE_RUNS_FILE:-docs/atendimento-premium/smoke-runs.md}"

[ -f "$GATE_FILE" ] || { echo "ERRO: autonomy gate nao encontrado: $GATE_FILE" >&2; exit 1; }
[ -f "$SMOKE_RUNS_FILE" ] || { echo "ERRO: smoke-runs nao encontrado: $SMOKE_RUNS_FILE" >&2; exit 1; }

AUTONOMY_ID="atendimento-premium"
CURRENT_LEVEL="1"
CURRENT_LEVEL_LABEL="1 micro-slice por rodada"
MAX_BATCH_SIZE="1"
MIN_PASS_UTC=""
LEVEL_2_MIN_PASS_SCENARIOS="5"
LEVEL_2_MIN_REAL_WHATSAPP_PASS="2"
LEVEL_2_REQUIRED_SLICE_GATES=""
LEVEL_3_MIN_PASS_SCENARIOS=""
LEVEL_3_MIN_REAL_WHATSAPP_PASS=""
LEVEL_3_REQUIRED_SLICE_GATES=""
LEVEL_4_MIN_PASS_SCENARIOS=""
LEVEL_4_MIN_REAL_WHATSAPP_PASS=""
LEVEL_4_REQUIRED_SLICE_GATES=""
LEVEL_4_REQUIRED_DOCS=""
REQUIRED_DOCS=""
BLOCKED_REASONS=""

# shellcheck source=/dev/null
source "$GATE_FILE"

count_pass_scenarios() {
  awk -F'|' -v min_utc="$MIN_PASS_UTC" '
    $0 ~ /^\|/ &&
    $7 ~ /PASS/ {
      run_utc=$2
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", run_utc)
      if (min_utc == "" || run_utc >= min_utc) count++
    }
    END { print count + 0 }
  ' "$SMOKE_RUNS_FILE"
}

count_real_whatsapp_pass() {
  awk -F'|' -v min_utc="$MIN_PASS_UTC" '
    $0 ~ /^\|/ &&
    $4 ~ /WhatsApp real/ &&
    $7 ~ /PASS/ {
      run_utc=$2
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", run_utc)
      if (min_utc == "" || run_utc >= min_utc) count++
    }
    END { print count + 0 }
  ' "$SMOKE_RUNS_FILE"
}

missing_docs=()
while IFS= read -r doc; do
  [ -n "$doc" ] || continue
  [ -f "$doc" ] || missing_docs+=("$doc")
done <<< "$REQUIRED_DOCS"

check_slice_gate_list() {
  local list="$1"
  local failures=()
  while IFS= read -r slice_gate; do
  [ -n "$slice_gate" ] || continue
  if ! bash scripts/smoke/check-slice-gate.sh "$slice_gate" >/tmp/inkflow-autonomy-slice-gate.log 2>&1; then
      failures+=("$slice_gate")
  fi
  done <<< "$list"
  printf '%s\n' "${failures[@]:-}"
}

slice_gate_failures=()
while IFS= read -r failure; do
  [ -n "$failure" ] || continue
  slice_gate_failures+=("$failure")
done < <(check_slice_gate_list "$LEVEL_2_REQUIRED_SLICE_GATES")

level_3_slice_gate_failures=()
while IFS= read -r failure; do
  [ -n "$failure" ] || continue
  level_3_slice_gate_failures+=("$failure")
done < <(check_slice_gate_list "${LEVEL_3_REQUIRED_SLICE_GATES:-}")

level_4_slice_gate_failures=()
while IFS= read -r failure; do
  [ -n "$failure" ] || continue
  level_4_slice_gate_failures+=("$failure")
done < <(check_slice_gate_list "${LEVEL_4_REQUIRED_SLICE_GATES:-}")

level_4_missing_docs=()
while IFS= read -r doc; do
  [ -n "$doc" ] || continue
  [ -f "$doc" ] || level_4_missing_docs+=("$doc")
done <<< "${LEVEL_4_REQUIRED_DOCS:-}"

pass_count="$(count_pass_scenarios)"
real_whatsapp_count="$(count_real_whatsapp_pass)"

required_scenarios_for_current_promotion() {
  if [ "$CURRENT_LEVEL" = "3" ] && [ -n "${LEVEL_4_MIN_PASS_SCENARIOS:-}" ]; then
    echo "$LEVEL_4_MIN_PASS_SCENARIOS"
  elif [ "$CURRENT_LEVEL" = "2" ] && [ -n "${LEVEL_3_MIN_PASS_SCENARIOS:-}" ]; then
    echo "$LEVEL_3_MIN_PASS_SCENARIOS"
  elif [ "$CURRENT_LEVEL" = "1" ]; then
    echo "$LEVEL_2_MIN_PASS_SCENARIOS"
  else
    echo "n/a"
  fi
}

required_real_whatsapp_for_current_promotion() {
  if [ "$CURRENT_LEVEL" = "3" ] && [ -n "${LEVEL_4_MIN_REAL_WHATSAPP_PASS:-}" ]; then
    echo "$LEVEL_4_MIN_REAL_WHATSAPP_PASS"
  elif [ "$CURRENT_LEVEL" = "2" ] && [ -n "${LEVEL_3_MIN_REAL_WHATSAPP_PASS:-}" ]; then
    echo "$LEVEL_3_MIN_REAL_WHATSAPP_PASS"
  elif [ "$CURRENT_LEVEL" = "1" ]; then
    echo "$LEVEL_2_MIN_REAL_WHATSAPP_PASS"
  else
    echo "n/a"
  fi
}

decision="keep"
reason="nivel atual mantido"
allowed_batch_size="$MAX_BATCH_SIZE"
status="PASS"

if [ -n "$BLOCKED_REASONS" ]; then
  status="BLOCKED"
  decision="blocked"
  reason="ha bloqueadores manuais registrados"
  allowed_batch_size="0"
elif [ "${#missing_docs[@]}" -gt 0 ]; then
  status="BLOCKED"
  decision="blocked"
  reason="faltam documentos obrigatorios"
  allowed_batch_size="0"
elif [ "${#slice_gate_failures[@]}" -gt 0 ]; then
  status="BLOCKED"
  decision="blocked"
  reason="um ou mais slice gates obrigatorios falharam"
  allowed_batch_size="0"
elif [ "$CURRENT_LEVEL" = "4" ] && [ "${#level_4_slice_gate_failures[@]}" -gt 0 ]; then
  status="BLOCKED"
  decision="blocked"
  reason="um ou mais slice gates ativos de Level 4 falharam"
  allowed_batch_size="0"
elif [ "$CURRENT_LEVEL" = "4" ] && [ "${#level_4_missing_docs[@]}" -gt 0 ]; then
  status="BLOCKED"
  decision="blocked"
  reason="faltam documentos ativos de Level 4"
  allowed_batch_size="0"
elif [ "$CURRENT_LEVEL" = "1" ] &&
  [ "$pass_count" -ge "$LEVEL_2_MIN_PASS_SCENARIOS" ] &&
  [ "$real_whatsapp_count" -ge "$LEVEL_2_MIN_REAL_WHATSAPP_PASS" ]; then
  decision="promote_available"
  reason="evidencia minima para discutir Level 2 atingida; promocao exige alteracao deliberada do gate"
elif [ "$CURRENT_LEVEL" = "2" ] &&
  [ -n "${LEVEL_3_MIN_PASS_SCENARIOS:-}" ] &&
  [ -n "${LEVEL_3_MIN_REAL_WHATSAPP_PASS:-}" ] &&
  [ "$pass_count" -ge "$LEVEL_3_MIN_PASS_SCENARIOS" ] &&
  [ "$real_whatsapp_count" -ge "$LEVEL_3_MIN_REAL_WHATSAPP_PASS" ] &&
  [ "${#level_3_slice_gate_failures[@]}" -eq 0 ]; then
  decision="promote_available"
  reason="evidencia minima para discutir Level 3 atingida; promocao exige alteracao deliberada do gate"
elif [ "$CURRENT_LEVEL" = "3" ] &&
  [ -n "${LEVEL_4_MIN_PASS_SCENARIOS:-}" ] &&
  [ -n "${LEVEL_4_MIN_REAL_WHATSAPP_PASS:-}" ] &&
  [ "$pass_count" -ge "$LEVEL_4_MIN_PASS_SCENARIOS" ] &&
  [ "$real_whatsapp_count" -ge "$LEVEL_4_MIN_REAL_WHATSAPP_PASS" ] &&
  [ "${#level_4_slice_gate_failures[@]}" -eq 0 ] &&
  [ "${#level_4_missing_docs[@]}" -eq 0 ]; then
  decision="promote_available"
  reason="evidencia minima para discutir Level 4 atingida; promocao exige alteracao deliberada do gate"
fi

cat <<REPORT
# Autonomy Gate

- autonomy_id: ${AUTONOMY_ID}
- gate_file: ${GATE_FILE}
- smoke_runs_file: ${SMOKE_RUNS_FILE}
- current_level: ${CURRENT_LEVEL}
- current_level_label: ${CURRENT_LEVEL_LABEL}
- allowed_batch_size: ${allowed_batch_size}
- min_pass_utc: ${MIN_PASS_UTC:-"(none)"}

## Evidence

| Metric | Actual | Required For Current Promotion |
|---|---:|---:|
| scenario_pass_count | ${pass_count} | $(required_scenarios_for_current_promotion) |
| real_whatsapp_pass_count | ${real_whatsapp_count} | $(required_real_whatsapp_for_current_promotion) |

## Required Slice Gates

$(if [ -z "$LEVEL_2_REQUIRED_SLICE_GATES" ]; then
  echo "- none"
else
  while IFS= read -r slice_gate; do
    [ -n "$slice_gate" ] || continue
    if printf '%s\n' "${slice_gate_failures[@]:-}" | grep -qx "$slice_gate"; then
      echo "- ${slice_gate}: FAIL"
    else
      echo "- ${slice_gate}: PASS"
    fi
  done <<< "$LEVEL_2_REQUIRED_SLICE_GATES"
fi)

$(if [ "$CURRENT_LEVEL" = "2" ] && [ -n "${LEVEL_3_REQUIRED_SLICE_GATES:-}" ]; then
  echo
  echo "## Level 3 Candidate Slice Gates"
  echo
  while IFS= read -r slice_gate; do
    [ -n "$slice_gate" ] || continue
    if printf '%s\n' "${level_3_slice_gate_failures[@]:-}" | grep -qx "$slice_gate"; then
      echo "- ${slice_gate}: FAIL"
    else
      echo "- ${slice_gate}: PASS"
    fi
  done <<< "$LEVEL_3_REQUIRED_SLICE_GATES"
fi)

$(if [ "$CURRENT_LEVEL" = "3" ] && [ -n "${LEVEL_4_REQUIRED_SLICE_GATES:-}" ]; then
  echo
  echo "## Level 4 Candidate Slice Gates"
  echo
  while IFS= read -r slice_gate; do
    [ -n "$slice_gate" ] || continue
    if printf '%s\n' "${level_4_slice_gate_failures[@]:-}" | grep -qx "$slice_gate"; then
      echo "- ${slice_gate}: FAIL"
    else
      echo "- ${slice_gate}: PASS"
    fi
  done <<< "$LEVEL_4_REQUIRED_SLICE_GATES"
fi)

$(if [ "$CURRENT_LEVEL" = "4" ] && [ -n "${LEVEL_4_REQUIRED_SLICE_GATES:-}" ]; then
  echo
  echo "## Active Level 4 Slice Gates"
  echo
  while IFS= read -r slice_gate; do
    [ -n "$slice_gate" ] || continue
    if printf '%s\n' "${level_4_slice_gate_failures[@]:-}" | grep -qx "$slice_gate"; then
      echo "- ${slice_gate}: FAIL"
    else
      echo "- ${slice_gate}: PASS"
    fi
  done <<< "$LEVEL_4_REQUIRED_SLICE_GATES"
fi)

$(if [ "$CURRENT_LEVEL" = "3" ] && [ -n "${LEVEL_4_REQUIRED_DOCS:-}" ]; then
  echo
  echo "## Level 4 Candidate Docs"
  echo
  while IFS= read -r doc; do
    [ -n "$doc" ] || continue
    if printf '%s\n' "${level_4_missing_docs[@]:-}" | grep -qx "$doc"; then
      echo "- ${doc}: MISSING"
    else
      echo "- ${doc}: PASS"
    fi
  done <<< "$LEVEL_4_REQUIRED_DOCS"
fi)

$(if [ "$CURRENT_LEVEL" = "4" ] && [ -n "${LEVEL_4_REQUIRED_DOCS:-}" ]; then
  echo
  echo "## Active Level 4 Docs"
  echo
  while IFS= read -r doc; do
    [ -n "$doc" ] || continue
    if printf '%s\n' "${level_4_missing_docs[@]:-}" | grep -qx "$doc"; then
      echo "- ${doc}: MISSING"
    else
      echo "- ${doc}: PASS"
    fi
  done <<< "$LEVEL_4_REQUIRED_DOCS"
fi)

## Blockers

$(if [ -n "$BLOCKED_REASONS" ]; then
  echo "$BLOCKED_REASONS" | sed 's/^/- /'
elif [ "${#missing_docs[@]}" -gt 0 ]; then
  printf '%s\n' "${missing_docs[@]}" | sed 's/^/- missing_doc: /'
elif [ "${#slice_gate_failures[@]}" -gt 0 ]; then
  printf '%s\n' "${slice_gate_failures[@]}" | sed 's/^/- slice_gate_failed: /'
elif [ "$CURRENT_LEVEL" = "4" ] && [ "${#level_4_slice_gate_failures[@]}" -gt 0 ]; then
  printf '%s\n' "${level_4_slice_gate_failures[@]}" | sed 's/^/- level_4_slice_gate_failed: /'
elif [ "$CURRENT_LEVEL" = "4" ] && [ "${#level_4_missing_docs[@]}" -gt 0 ]; then
  printf '%s\n' "${level_4_missing_docs[@]}" | sed 's/^/- level_4_missing_doc: /'
else
  echo "- none"
fi)

## Decision

\`\`\`text
status: ${status}
decision: ${decision}
reason: ${reason}
\`\`\`
REPORT

[ "$status" != "BLOCKED" ]
