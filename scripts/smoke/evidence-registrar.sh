#!/usr/bin/env bash
# scripts/smoke/evidence-registrar.sh
# Gera uma linha sugerida para docs/atendimento-premium/smoke-runs.md.
#
# Este script nao edita smoke-runs.md. Ele apenas transforma artifacts de
# .smoke-evidence/<run_id> em uma linha revisavel pelo Commander.

set -euo pipefail
cd "$(dirname "$0")/../.."

usage() {
  cat <<USAGE
Uso:
  bash scripts/smoke/evidence-registrar.sh .smoke-evidence/<run_id>

Saida:
  Linha Markdown sugerida para colar em docs/atendimento-premium/smoke-runs.md

Garantias:
  - nao edita arquivos
  - falha se artifacts obrigatorios estiverem ausentes
  - preserva decisao final humana: a linha e apenas sugestao
USAGE
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

EVIDENCE_DIR="${1:?uso: evidence-registrar.sh .smoke-evidence/<run_id>}"
[ -d "$EVIDENCE_DIR" ] || { echo "ERRO: evidence dir nao encontrado: $EVIDENCE_DIR" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "ERRO: jq nao instalado." >&2; exit 1; }

summary="$EVIDENCE_DIR/summary.md"
judgment="$EVIDENCE_DIR/judgment.md"
request="$EVIDENCE_DIR/request.json"
poll="$EVIDENCE_DIR/poll.json"
scenario_env="$EVIDENCE_DIR/scenario.env"

[ -f "$summary" ] || { echo "ERRO: summary.md ausente em $EVIDENCE_DIR" >&2; exit 1; }
[ -f "$judgment" ] || { echo "ERRO: judgment.md ausente em $EVIDENCE_DIR" >&2; exit 1; }
[ -f "$request" ] || { echo "ERRO: request.json ausente em $EVIDENCE_DIR" >&2; exit 1; }
[ -f "$poll" ] || { echo "ERRO: poll.json ausente em $EVIDENCE_DIR" >&2; exit 1; }
[ -f "$scenario_env" ] || { echo "ERRO: scenario.env ausente em $EVIDENCE_DIR" >&2; exit 1; }

SCENARIO_ID=""
SCENARIO_TITLE=""
SCENARIO_TYPE=""
BASE_URL=""
PHONE=""
INSTANCE=""

# shellcheck source=/dev/null
source "$scenario_env"

md_escape() {
  printf '%s' "$1" | tr '\n' ' ' | sed 's/[[:space:]][[:space:]]*/ /g; s/|/\\|/g; s/^ //; s/ $//'
}

shorten() {
  local text="$1"
  local max="${2:-420}"
  if [ "${#text}" -le "$max" ]; then
    printf '%s' "$text"
  else
    printf '%s...' "${text:0:max}"
  fi
}

extract_summary_value() {
  local key="$1"
  awk -F': ' -v key="$key" '$0 ~ "^- " key ": " { print $2; exit }' "$summary"
}

extract_judgment_value() {
  local key="$1"
  awk -F': ' -v key="$key" '$0 ~ "^- " key ": " { print $2; exit }' "$judgment"
}

if [ -f "$EVIDENCE_DIR/multiturn-summary.md" ]; then
  run_id="$(basename "$EVIDENCE_DIR")"
else
  run_id="$(jq -r '.run_id // empty' "$request")"
fi
[ -n "$run_id" ] || run_id="$(basename "$EVIDENCE_DIR")"

since="$(jq -r '.since // empty' "$request")"
if [ -n "$since" ]; then
  data_utc="${since:0:10} ${since:11:5}"
else
  data_utc="$(date -u '+%Y-%m-%d %H:%M')"
fi

status_raw="$(extract_summary_value "status")"
case "$status_raw" in
  pass|PASS) resultado="PASS" ;;
  fail|FAIL) resultado="FAIL" ;;
  *) resultado="$(printf '%s' "${status_raw:-UNKNOWN}" | tr '[:lower:]' '[:upper:]')" ;;
esac

phone="$(jq -r '.sender_phone // .phone // empty' "$request")"
[ -n "$phone" ] || phone="${PHONE:-}"

base_url="$(jq -r '.base_url // empty' "$request")"
[ -n "$base_url" ] || base_url="${BASE_URL:-}"

bot_number="$(jq -r '.bot_number // empty' "$request")"
bot_suffix=""
if [ -n "$bot_number" ] && [ "${#bot_number}" -ge 4 ]; then
  bot_suffix="(*${bot_number: -4})"
fi

case "${SCENARIO_TYPE:-}" in
  whatsapp_real) tipo="Scenario WhatsApp real"; alvo="${INSTANCE:-central} -> bot ${bot_suffix}" ;;
  whatsapp_real_multiturn) tipo="Scenario WhatsApp real multi-turn"; alvo="${INSTANCE:-central} -> bot ${bot_suffix}" ;;
  http_multiturn) tipo="Scenario HTTP multi-turn"; alvo="$base_url" ;;
  http|"") tipo="Scenario HTTP monitorado"; alvo="$base_url" ;;
  *) tipo="Scenario ${SCENARIO_TYPE}"; alvo="${base_url:-${INSTANCE:-unknown}}" ;;
esac
alvo="$(md_escape "$alvo")"

final_state="$(extract_judgment_value "final_state")"
orcid="$(extract_judgment_value "orcid")"
[ "$orcid" = "(none)" ] && orcid="null"
copy_risk="$(extract_judgment_value "copy_risk")"
last_human="$(jq -r '[.mensagens[]? | select(.message.type=="human") | .message.content] | last // empty' "$poll")"
last_bot="$(jq -r '[.mensagens[]? | select(.message.type=="ai") | .message.content] | last // empty' "$poll")"

dados_coletados="$(jq -cr '.conversas[0].dados_coletados // {}' "$poll")"
dados_cadastro="$(jq -cr '.conversas[0].dados_cadastro // {}' "$poll")"

decision_parts=()
if [ "$resultado" = "PASS" ]; then
  decision_parts+=("${SCENARIO_TITLE:-$SCENARIO_ID} validado")
else
  decision_parts+=("${SCENARIO_TITLE:-$SCENARIO_ID} falhou")
fi

case "${SCENARIO_TYPE:-}" in
  whatsapp_real|whatsapp_real_multiturn)
    decision_parts+=("cadeia real ${INSTANCE:-central} -> bot")
    ;;
  http|http_multiturn|"")
    decision_parts+=("radar HTTP")
    ;;
esac

[ -n "$last_human" ] && decision_parts+=("cliente \`$(md_escape "$last_human")\`")
[ -n "$final_state" ] && decision_parts+=("estado=${final_state}")
[ -n "$orcid" ] && decision_parts+=("orcid=${orcid}")
[ -n "$copy_risk" ] && decision_parts+=("copy_risk=${copy_risk}")

if [ "$dados_coletados" != "{}" ]; then
  decision_parts+=("dados_coletados=\`$(md_escape "$dados_coletados")\`")
fi
if [ "$dados_cadastro" != "{}" ]; then
  decision_parts+=("dados_cadastro=\`$(md_escape "$dados_cadastro")\`")
fi
[ -n "$last_bot" ] && decision_parts+=("bot \`$(md_escape "$last_bot")\`")

decision=""
for part in "${decision_parts[@]}"; do
  if [ -z "$decision" ]; then
    decision="$part"
  else
    decision="${decision}; ${part}"
  fi
done
decision="$(shorten "$decision" 900)"
decision="$(md_escape "$decision")"

cat <<EOF
| ${data_utc} | \`${run_id}\` | ${tipo} | \`${alvo}\` | \`${phone}\` | ${resultado} | \`${EVIDENCE_DIR%/}/\` | ${decision}. |
EOF
