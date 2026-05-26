#!/usr/bin/env bash
# scripts/smoke/wave-closeout-summarizer.sh
# Gera um bloco revisavel de closeout de onda a partir de evidencias existentes.
#
# Este script nao executa smoke, nao edita docs, nao commita e nao promove nivel.
# Ele apenas reduz trabalho manual de consolidacao para revisao do Commander.

set -euo pipefail
cd "$(dirname "$0")/../.."

usage() {
  cat <<USAGE
Uso:
  bash scripts/smoke/wave-closeout-summarizer.sh .smoke-evidence/<run_id> [...]

Saida:
  Markdown revisavel com Evidence Summary, provas reais e decisao sugerida.

Garantias:
  - nao edita arquivos
  - nao roda HTTP smoke nem WhatsApp real
  - falha se artifacts essenciais estiverem ausentes
  - mantem a decisao final com o Commander
USAGE
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

[ "$#" -ge 1 ] || { usage >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "ERRO: jq nao instalado." >&2; exit 1; }

md_inline() {
  printf '%s' "$1" \
    | tr '\n' '\r' \
    | sed 's/\r/\\n/g; s/[[:space:]][[:space:]]*/ /g; s/|/\\|/g; s/^ //; s/ $//'
}

shorten() {
  local text="$1"
  local max="${2:-280}"
  if [ "${#text}" -le "$max" ]; then
    printf '%s' "$text"
  else
    printf '%s...' "${text:0:max}"
  fi
}

summary_value() {
  local file="$1"
  local key="$2"
  [ -f "$file" ] || return 0
  awk -F': ' -v key="$key" '$0 ~ "^- " key ": " { print $2; exit }' "$file"
}

judgment_value() {
  local file="$1"
  local key="$2"
  [ -f "$file" ] || return 0
  awk -F': ' -v key="$key" '$0 ~ "^- " key ": " { print $2; exit }' "$file"
}

scenario_type_label() {
  local scenario_type="$1"
  case "$scenario_type" in
    whatsapp_real) printf 'WhatsApp real' ;;
    whatsapp_real_multiturn) printf 'WhatsApp real multi-turn' ;;
    http_multiturn) printf 'HTTP multi-turn' ;;
    http|"") printf 'HTTP monitorado' ;;
    *) printf '%s' "$scenario_type" ;;
  esac
}

evidence_step_dirs() {
  local evidence_dir="$1"
  if [ -d "$evidence_dir/steps" ]; then
    find "$evidence_dir/steps" -mindepth 1 -maxdepth 1 -type d | sort -V
  else
    printf '%s\n' "$evidence_dir"
  fi
}

last_message() {
  local poll_file="$1"
  local msg_type="$2"
  jq -r --arg type "$msg_type" '[.mensagens[]? | select(.message.type == $type) | .message.content] | last // empty' "$poll_file"
}

collect_run() {
  local evidence_dir="$1"
  [ -d "$evidence_dir" ] || { echo "ERRO: evidence dir nao encontrado: $evidence_dir" >&2; exit 1; }
  [ -f "$evidence_dir/scenario.env" ] || { echo "ERRO: scenario.env ausente em $evidence_dir" >&2; exit 1; }
  [ -f "$evidence_dir/summary.md" ] || { echo "ERRO: summary.md ausente em $evidence_dir" >&2; exit 1; }

  local SCENARIO_ID=""
  local SCENARIO_TITLE=""
  local SCENARIO_TYPE=""
  local INSTANCE=""
  # shellcheck source=/dev/null
  source "$evidence_dir/scenario.env"

  local run_id
  run_id="$(basename "$evidence_dir")"
  local status
  status="$(summary_value "$evidence_dir/summary.md" "status")"
  [ -n "$status" ] || status="unknown"
  status="$(printf '%s' "$status" | tr '[:lower:]' '[:upper:]')"

  local final_step="$evidence_dir"
  if [ -d "$evidence_dir/steps" ]; then
    final_step="$(find "$evidence_dir/steps" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)"
  fi

  local judgment="$final_step/judgment.md"
  [ -f "$judgment" ] || judgment="$evidence_dir/judgment.md"
  [ -f "$judgment" ] || { echo "ERRO: judgment.md ausente em $evidence_dir" >&2; exit 1; }

  local final_state orcid copy_risk
  final_state="$(judgment_value "$judgment" "final_state")"
  orcid="$(judgment_value "$judgment" "orcid")"
  copy_risk="$(judgment_value "$judgment" "copy_risk")"
  [ "$orcid" = "(none)" ] && orcid="null"

  local dados_coletados="{}"
  local dados_cadastro="{}"
  if [ -f "$final_step/poll.json" ]; then
    dados_coletados="$(jq -cr '.conversas[0].dados_coletados // {}' "$final_step/poll.json")"
    dados_cadastro="$(jq -cr '.conversas[0].dados_cadastro // {}' "$final_step/poll.json")"
  fi

  local label
  label="$(scenario_type_label "$SCENARIO_TYPE")"
  printf '| `%s` | %s | %s | `%s` | `%s` | `%s` | `%s` |\n' \
    "$run_id" "$label" "$status" "$(md_inline "${SCENARIO_TITLE:-$SCENARIO_ID}")" \
    "${final_state:-unknown}" "${orcid:-unknown}" "${copy_risk:-unknown}"

  if [[ "$SCENARIO_TYPE" == whatsapp_real* ]]; then
    real_proof_count=$((real_proof_count + 1))
    printf '\n### %s\n\n' "$(md_inline "${SCENARIO_TITLE:-$SCENARIO_ID}")" >> "$proof_tmp"
    printf -- '- run_id: `%s`\n' "$run_id" >> "$proof_tmp"
    printf -- '- canal: `%s -> bot`\n' "${INSTANCE:-central}" >> "$proof_tmp"
    for step_dir in $(evidence_step_dirs "$evidence_dir"); do
      [ -f "$step_dir/poll.json" ] || continue
      local human bot
      human="$(last_message "$step_dir/poll.json" "human")"
      bot="$(last_message "$step_dir/poll.json" "ai")"
      [ -n "$human" ] || continue
      [ -n "$bot" ] || continue
      printf -- '- Cliente: "%s"\n' "$(shorten "$(md_inline "$human")" 220)" >> "$proof_tmp"
      printf -- '- Bot: "%s"\n' "$(shorten "$(md_inline "$bot")" 360)" >> "$proof_tmp"
    done
  fi

  printf -- '- `%s`: %s; estado=%s; orcid=%s; copy_risk=%s; dados_coletados=`%s`; dados_cadastro=`%s`.\n' \
    "$run_id" "$status" "${final_state:-unknown}" "${orcid:-unknown}" "${copy_risk:-unknown}" \
    "$(md_inline "$dados_coletados")" "$(md_inline "$dados_cadastro")" >> "$decision_tmp"
}

proof_tmp="$(mktemp)"
decision_tmp="$(mktemp)"
trap 'rm -f "$proof_tmp" "$decision_tmp"' EXIT
real_proof_count=0

cat <<'HEADER'
# Wave Closeout Summary

## Evidence Summary

| Run ID | Tipo | Resultado | Cenário | Estado Final | ORCID | Copy Risk |
|---|---|---:|---|---|---|---|
HEADER

for evidence_dir in "$@"; do
  collect_run "$evidence_dir"
done

if [ "$real_proof_count" -gt 0 ]; then
  printf '\n## Provas Conclusivas Reais\n\n'
  cat "$proof_tmp"
fi

cat <<'FOOTER'

## Decisao Sugerida Para Revisao

FOOTER
cat "$decision_tmp"

cat <<'FOOTER'

## Limites Operacionais

- Este resumo nao substitui leitura do `summary.md`, `transcript.md`, `judgment.md`, `poll.json` e `agent-turn-logs.json` quando aplicavel.
- Se algum item acima divergir da doc da onda, parar e fazer triage antes de commitar.
- WhatsApp real continua sendo validacao definitiva para comportamento conversacional.
- Manter Level 4B; nenhuma promocao para 4C e feita por esta ferramenta.
FOOTER
