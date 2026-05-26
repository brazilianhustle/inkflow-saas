#!/usr/bin/env bash
# scripts/smoke/naturalness-audit.sh
# Audita naturalidade de respostas AI a partir de evidencias de smoke ja coletadas.

set -euo pipefail
cd "$(dirname "$0")/../.."

usage() {
  cat <<'USAGE'
Uso:
  bash scripts/smoke/naturalness-audit.sh <evidence-dir> [<evidence-dir> ...]

Objetivo:
  Gerar uma auditoria read-only de naturalidade, repeticao e risco de copy.

Notas:
  - Nao executa smoke.
  - Nao envia WhatsApp real.
  - Nao edita docs.
  - Usa poll.json das evidencias existentes.
USAGE
}

if [ "$#" -lt 1 ]; then
  usage >&2
  exit 1
fi

command -v jq >/dev/null 2>&1 || { echo "ERRO: jq nao encontrado" >&2; exit 1; }

tmp_all_bot="$(mktemp -t inkflow-naturalness-all-bot.XXXXXX)"
tmp_rows="$(mktemp -t inkflow-naturalness-rows.XXXXXX)"
trap 'rm -f "$tmp_all_bot" "$tmp_rows"' EXIT

normalize_line() {
  tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g; s/^[[:space:]]+//; s/[[:space:]]+$//'
}

shorten() {
  local text="$1"
  local limit="${2:-180}"
  if [ "${#text}" -gt "$limit" ]; then
    printf '%s...' "${text:0:$((limit - 3))}"
  else
    printf '%s' "$text"
  fi
}

append_flag() {
  local current="$1"
  local flag="$2"
  if [ -z "$current" ]; then
    printf '%s' "$flag"
  else
    printf '%s,%s' "$current" "$flag"
  fi
}

classify_bot_text() {
  local text="$1"
  local flags=""
  local risk="baixo"
  local len="${#text}"
  local question_count
  question_count="$(printf '%s' "$text" | awk -F'?' '{print NF-1}')"

  if [ "$len" -gt 700 ]; then
    flags="$(append_flag "$flags" "too_long_high")"
    risk="alto"
  elif [ "$len" -gt 360 ]; then
    flags="$(append_flag "$flags" "long_whatsapp_bubble")"
    [ "$risk" = "baixo" ] && risk="medio"
  fi

  if [ "$question_count" -gt 2 ]; then
    flags="$(append_flag "$flags" "too_many_questions")"
    risk="alto"
  elif [ "$question_count" -gt 1 ]; then
    flags="$(append_flag "$flags" "multi_question_bubble")"
    [ "$risk" = "baixo" ] && risk="medio"
  fi

  if printf '%s' "$text" | grep -Eiq 'sou uma ia|inteligencia artificial|sistema|erro|falha|webhook|orcid|pipeline|router|guardrail'; then
    flags="$(append_flag "$flags" "internal_language")"
    risk="alto"
  fi

  if printf '%s' "$text" | grep -Eiq 'pra liberar teu orçamento|orçamento personalizado|valor certinho|acionar o tatuador|orientar com segurança|responsável legal|avaliar com calma'; then
    flags="$(append_flag "$flags" "rigid_template_terms")"
    [ "$risk" = "baixo" ] && risk="medio"
  fi

  if printf '%s' "$text" | grep -Eiq 'entendi tudo|perfeito, entao|fechado,'; then
    flags="$(append_flag "$flags" "formulaic_opening")"
    [ "$risk" = "baixo" ] && risk="medio"
  fi

  [ -n "$flags" ] || flags="ok"
  printf '%s\t%s' "$risk" "$flags"
}

evidence_count=0
for evidence_dir in "$@"; do
  if [ ! -d "$evidence_dir" ]; then
    printf 'WARN: evidence dir nao existe: %s\n' "$evidence_dir" >&2
    continue
  fi

  poll_json="$evidence_dir/poll.json"
  if [ ! -f "$poll_json" ]; then
    printf 'WARN: poll.json nao existe: %s\n' "$poll_json" >&2
    continue
  fi

  run_id="$(basename "$evidence_dir")"
  last_human="$(jq -r '[.mensagens[]? | select(.message.type=="human") | .message.content] | last // ""' "$poll_json" | normalize_line)"
  last_bot="$(jq -r '[.mensagens[]? | select(.message.type=="ai") | .message.content] | last // ""' "$poll_json" | normalize_line)"
  bot_count="$(jq -r '[.mensagens[]? | select(.message.type=="ai")] | length' "$poll_json")"
  final_state="$(jq -r '(.estado_agente // .conversas[0].estado_agente // "n/a")' "$poll_json")"
  copy_risk="n/a"
  if [ -f "$evidence_dir/judgment.md" ]; then
    copy_risk="$(awk -F': ' '/copy_risk:/ { print $2; exit }' "$evidence_dir/judgment.md" | normalize_line)"
    [ -n "$copy_risk" ] || copy_risk="n/a"
  fi

  jq -r '.mensagens[]? | select(.message.type=="ai") | .message.content' "$poll_json" |
    while IFS= read -r bot_line; do
      printf '%s\n' "$bot_line" | normalize_line >> "$tmp_all_bot"
    done

  repeated_in_run="$(jq -r '
    [.mensagens[]? | select(.message.type=="ai") | .message.content]
    | group_by(.)
    | map(select(length > 1))
    | length
  ' "$poll_json")"

  if [ -z "$last_bot" ]; then
    risk="baixo"
    flags="sem_resposta_ai"
  else
    classification="$(classify_bot_text "$last_bot")"
    risk="${classification%%	*}"
    flags="${classification#*	}"
  fi

  if [ "${repeated_in_run:-0}" -gt 0 ]; then
    flags="$(append_flag "$flags" "duplicate_bot_in_run")"
    risk="alto"
  fi

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$risk" \
    "$flags" \
    "$run_id" \
    "$final_state" \
    "$copy_risk" \
    "$bot_count" \
    "$(shorten "$last_human" 120)" \
    "$(shorten "$last_bot" 180)" >> "$tmp_rows"

  evidence_count=$((evidence_count + 1))
done

high_count="$(awk -F'\t' '$1 == "alto" { count++ } END { print count + 0 }' "$tmp_rows")"
medium_count="$(awk -F'\t' '$1 == "medio" { count++ } END { print count + 0 }' "$tmp_rows")"
low_count="$(awk -F'\t' '$1 == "baixo" { count++ } END { print count + 0 }' "$tmp_rows")"

decision="pass"
if [ "$high_count" -gt 0 ]; then
  decision="review_required"
elif [ "$medium_count" -gt 0 ]; then
  decision="watchlist"
fi

echo "# Naturalness Audit"
echo
echo "- evidencias_analisadas: ${evidence_count}"
echo "- baixo: ${low_count}"
echo "- medio: ${medium_count}"
echo "- alto: ${high_count}"
echo "- decisao: ${decision}"
echo
echo "## Runs"
echo
echo "| Risco | Flags | Run ID | Estado | Copy risk | AI msgs | Cliente final | Bot final |"
echo "|---|---|---|---|---|---:|---|---|"
sort -t $'\t' -k1,1 "$tmp_rows" | while IFS=$'\t' read -r risk flags run_id final_state copy_risk bot_count last_human last_bot; do
  printf '| %s | `%s` | `%s` | `%s` | `%s` | %s | %s | %s |\n' \
    "$risk" \
    "$flags" \
    "$run_id" \
    "$final_state" \
    "$copy_risk" \
    "$bot_count" \
    "$last_human" \
    "$last_bot"
done

echo
echo "## Repeticoes Globais"
echo
echo "| Ocorrencias | Bot text |"
echo "|---:|---|"
sort "$tmp_all_bot" | uniq -c | sort -nr | awk '
  $1 > 1 {
    count=$1
    $1=""
    sub(/^[[:space:]]+/, "")
    text=$0
    if (length(text) > 220) text=substr(text, 1, 217) "..."
    print "| " count " | " text " |"
    printed++
    if (printed >= 8) exit
  }
  END {
    if (printed == 0) print "| 0 | sem repeticao exata na amostra |"
  }
'

echo
echo "## Decision"
echo
cat <<REPORT
\`\`\`text
status: PASS
decision: ${decision}
note: auditoria read-only; medium/high nao reprova smoke, mas orienta proximo slice de linguagem.
\`\`\`
REPORT
