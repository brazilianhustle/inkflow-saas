#!/usr/bin/env bash
# scripts/smoke/wave-runner.sh
# Orquestrador seguro de preflight para ondas Level 4.
#
# V1 e deliberadamente conservador: nao roda HTTP real, nao roda WhatsApp real,
# nao commita, nao faz push e nao edita evidencias. Ele apenas prova que a onda
# cabe na janela atual e que os scenarios declarados conseguem passar em dry-run.

set -euo pipefail
cd "$(dirname "$0")/../.."

GATE_FILE="${AUTONOMY_GATE_FILE:-docs/atendimento-premium/autonomy-gate.env}"
ALLOW_DIRTY="${WAVE_RUNNER_ALLOW_DIRTY:-0}"

[ -f "$GATE_FILE" ] || { echo "ERRO: autonomy gate nao encontrado: $GATE_FILE" >&2; exit 1; }

AUTONOMY_ID="atendimento-premium"
CURRENT_LEVEL="1"
CURRENT_LEVEL_LABEL="1 micro-slice por rodada"
MAX_BATCH_SIZE="1"
BLOCKED_REASONS=""

# shellcheck source=/dev/null
source "$GATE_FILE"

usage() {
  cat <<USAGE
Uso:
  bash scripts/smoke/wave-runner.sh <scenario> [scenario...]

V1 executa somente:
  - leitura do Autonomy Gate
  - limite por MAX_BATCH_SIZE
  - git status / git diff --check
  - bash -n dos scripts de smoke
  - dry-run dos scenarios informados
  - wave-health

Variaveis:
  WAVE_RUNNER_ALLOW_DIRTY=1  permite worktree sujo no preflight
USAGE
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

SCENARIOS=("$@")

section() {
  echo
  echo "## $1"
  echo
}

fail() {
  echo "ERRO: $*" >&2
  exit 1
}

run() {
  echo "+ $*"
  "$@"
}

scenario_count="${#SCENARIOS[@]}"
[[ "$MAX_BATCH_SIZE" =~ ^[0-9]+$ ]] || fail "MAX_BATCH_SIZE invalido: $MAX_BATCH_SIZE"

if [ "$scenario_count" -eq 0 ]; then
  fail "informe pelo menos um scenario. Use --help para exemplos."
fi

if [ "$scenario_count" -gt "$MAX_BATCH_SIZE" ]; then
  fail "scenario_count=$scenario_count excede MAX_BATCH_SIZE=$MAX_BATCH_SIZE"
fi

if [ -n "$BLOCKED_REASONS" ]; then
  fail "Autonomy Gate possui BLOCKED_REASONS=$BLOCKED_REASONS"
fi

echo "# Wave Runner"
echo
echo "- generated_at_utc: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "- autonomy_id: $AUTONOMY_ID"
echo "- current_level: $CURRENT_LEVEL"
echo "- current_level_label: $CURRENT_LEVEL_LABEL"
echo "- max_batch_size: $MAX_BATCH_SIZE"
echo "- scenario_count: $scenario_count"
echo "- allow_dirty: $ALLOW_DIRTY"
echo "- head: $(git rev-parse --short HEAD)"

section "Scenarios"
for scenario in "${SCENARIOS[@]}"; do
  scenario_file="docs/atendimento-premium/smoke-scenarios/${scenario}.env"
  [ -f "$scenario_file" ] || fail "scenario nao encontrado: $scenario_file"
  echo "- $scenario"
done

section "Git Preflight"
if [ -n "$(git status --porcelain)" ] && [ "$ALLOW_DIRTY" != "1" ]; then
  git status --short
  fail "worktree sujo. Use WAVE_RUNNER_ALLOW_DIRTY=1 apenas para preflight durante desenvolvimento."
fi
run git status --short
run git diff --check

section "Shell Syntax"
run bash -n scripts/smoke/*.sh

section "Autonomy Gate"
run bash scripts/smoke/check-autonomy-gate.sh

section "Scenario Dry Runs"
for scenario in "${SCENARIOS[@]}"; do
  echo
  echo "### $scenario"
  SMOKE_SCENARIO_DRY_RUN=1 bash scripts/smoke/run-scenario.sh "$scenario"
done

section "Wave Health"
if [ "$ALLOW_DIRTY" = "1" ]; then
  WAVE_HEALTH_ALLOW_DIRTY=1 bash scripts/smoke/wave-health.sh
else
  bash scripts/smoke/wave-health.sh
fi

section "Decision"
cat <<REPORT
\`\`\`text
status: PASS
decision: wave_runner_preflight_pass
scenarios_checked: ${scenario_count}
next_allowed_action: implementar ou executar radar HTTP pelo Commander, respeitando o protocolo da onda
\`\`\`
REPORT
