#!/usr/bin/env bash
# scripts/smoke/evidence-orphan-gate.sh
# Detecta divergencia entre .smoke-evidence e smoke-runs.md.

set -euo pipefail
cd "$(dirname "$0")/../.."

SMOKE_RUNS_FILE="${SMOKE_RUNS_FILE:-docs/atendimento-premium/smoke-runs.md}"
EVIDENCE_ROOT="${SMOKE_EVIDENCE_ROOT:-.smoke-evidence}"
LIMIT="${LIMIT:-40}"
STRICT="${EVIDENCE_ORPHAN_STRICT:-0}"

[ -f "$SMOKE_RUNS_FILE" ] || { echo "ERRO: smoke-runs nao encontrado: $SMOKE_RUNS_FILE" >&2; exit 1; }
[ -d "$EVIDENCE_ROOT" ] || { echo "ERRO: evidence root nao encontrado: $EVIDENCE_ROOT" >&2; exit 1; }

command -v find >/dev/null 2>&1 || { echo "ERRO: find nao encontrado." >&2; exit 1; }

usage() {
  cat <<USAGE
Uso:
  bash scripts/smoke/evidence-orphan-gate.sh

Variaveis:
  LIMIT=40                    Quantos evidence dirs recentes verificar.
  EVIDENCE_ORPHAN_STRICT=1    Falha tambem para evidence dirs recentes nao registrados ou incompletos.
  SMOKE_RUNS_FILE=...         Arquivo de indice de smokes.
  SMOKE_EVIDENCE_ROOT=...     Diretorio raiz de evidencias.
USAGE
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

strip_ticks() {
  sed 's/`//g; s#/$##'
}

is_registered_run_id() {
  local run_id="$1"
  awk -F'|' -v run_id="$run_id" '
    $0 ~ /^\|/ {
      col=$3
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", col)
      gsub(/`/, "", col)
      if (col == run_id) found=1
    }
    END { exit(found ? 0 : 1) }
  ' "$SMOKE_RUNS_FILE"
}

has_required_artifacts() {
  local dir="$1"
  [ -f "$dir/summary.md" ] &&
  [ -f "$dir/judgment.md" ] &&
  [ -f "$dir/request.json" ] &&
  [ -f "$dir/poll.json" ] &&
  [ -f "$dir/scenario.env" ]
}

registered_broken=()
while IFS='|' read -r run_id evidence; do
  [ -n "${run_id:-}" ] || continue
  run_id="$(printf '%s' "$run_id" | strip_ticks | xargs)"
  evidence="$(printf '%s' "$evidence" | strip_ticks | xargs)"
  [ "$run_id" = "Run ID" ] && continue
  [ "$run_id" = "---" ] && continue
  [ -z "$run_id" ] && continue
  [ -z "$evidence" ] && continue
  if [ ! -d "$evidence" ]; then
    registered_broken+=("${run_id}: evidence dir ausente (${evidence})")
  fi
done < <(
  awk -F'|' '
    $0 ~ /^\|/ && $3 !~ /Run ID|---/ {
      print $3 "|" $8
    }
  ' "$SMOKE_RUNS_FILE"
)

orphan_complete=()
incomplete_recent=()
while IFS= read -r dir; do
  [ -n "$dir" ] || continue
  run_id="$(basename "$dir")"
  if has_required_artifacts "$dir"; then
    if ! is_registered_run_id "$run_id"; then
      orphan_complete+=("${run_id}: ${dir}")
    fi
  elif [ "$STRICT" = "1" ]; then
    incomplete_recent+=("${run_id}: ${dir}")
  fi
done < <(
  find "$EVIDENCE_ROOT" -mindepth 1 -maxdepth 1 -type d -print0 |
    xargs -0 stat -f '%m %N' 2>/dev/null |
    sort -rn |
    head -n "$LIMIT" |
    sed 's/^[0-9][0-9]* //'
)

status="PASS"
[ "${#registered_broken[@]}" -eq 0 ] || status="FAIL"
if [ "$STRICT" = "1" ]; then
  [ "${#orphan_complete[@]}" -eq 0 ] || status="FAIL"
  [ "${#incomplete_recent[@]}" -eq 0 ] || status="FAIL"
fi

echo "# Evidence Orphan Gate"
echo
echo "- smoke_runs_file: $SMOKE_RUNS_FILE"
echo "- evidence_root: $EVIDENCE_ROOT"
echo "- recent_limit: $LIMIT"
echo "- strict: $STRICT"

echo
echo "## Registered Evidence Paths"
echo
if [ "${#registered_broken[@]}" -eq 0 ]; then
  echo "- PASS"
else
  for item in "${registered_broken[@]}"; do
    echo "- FAIL: $item"
  done
fi

echo
echo "## Recent Complete Evidence Dirs"
echo
if [ "${#orphan_complete[@]}" -eq 0 ]; then
  echo "- PASS"
else
  for item in "${orphan_complete[@]}"; do
    if [ "$STRICT" = "1" ]; then
      echo "- FAIL orphan_complete: $item"
    else
      echo "- WARN orphan_complete: $item"
    fi
  done
fi

echo
echo "## Recent Incomplete Evidence Dirs"
echo
if [ "$STRICT" != "1" ]; then
  echo "- skipped (set EVIDENCE_ORPHAN_STRICT=1 to fail incomplete recent dirs)"
elif [ "${#incomplete_recent[@]}" -eq 0 ]; then
  echo "- PASS"
else
  for item in "${incomplete_recent[@]}"; do
    echo "- FAIL incomplete_recent: $item"
  done
fi

echo
echo "## Decision"
echo
cat <<REPORT
\`\`\`text
status: $status
decision: $(if [ "$status" = "PASS" ]; then echo evidence_orphan_gate_pass; else echo evidence_orphan_gate_blocked; fi)
\`\`\`
REPORT

[ "$status" = "PASS" ]
