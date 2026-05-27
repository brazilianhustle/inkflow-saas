#!/usr/bin/env bash
# scripts/smoke/naturalness-audit-v2.sh
# Aplica a Naturalness Rubric V2 em evidencias existentes, em modo read-only.

set -euo pipefail
cd "$(dirname "$0")/../.."

usage() {
  cat <<'USAGE'
Uso:
  bash scripts/smoke/naturalness-audit-v2.sh <evidence-dir> [<evidence-dir> ...]

Objetivo:
  Auditar naturalidade premium por eixos da Rubrica V2 sem executar smoke,
  sem enviar WhatsApp real e sem editar evidencias.

Saida:
  Markdown com scores por evidencia, tags, decisao e recomendacao.
USAGE
}

if [ "$#" -lt 1 ]; then
  usage >&2
  exit 1
fi

command -v jq >/dev/null 2>&1 || { echo "ERRO: jq nao encontrado" >&2; exit 1; }

tmp_rows="$(mktemp -t inkflow-naturalness-v2-rows.XXXXXX)"
trap 'rm -f "$tmp_rows"' EXIT

normalize_line() {
  tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g; s/^[[:space:]]+//; s/[[:space:]]+$//'
}

shorten() {
  local text="$1"
  local limit="${2:-150}"
  if [ "${#text}" -gt "$limit" ]; then
    printf '%s...' "${text:0:$((limit - 3))}"
  else
    printf '%s' "$text"
  fi
}

append_tag() {
  local current="$1"
  local tag="$2"
  if [ -z "$current" ]; then
    printf '%s' "$tag"
  else
    printf '%s,%s' "$current" "$tag"
  fi
}

has_any() {
  local text="$1"
  local pattern="$2"
  printf '%s' "$text" | grep -Eiq "$pattern"
}

score_min() {
  local current="$1"
  local candidate="$2"
  if [ "$candidate" -lt "$current" ]; then
    printf '%s' "$candidate"
  else
    printf '%s' "$current"
  fi
}

score_evidence() {
  local evidence_dir="$1"
  local poll_json="$evidence_dir/poll.json"
  local request_json="$evidence_dir/request.json"
  local run_id final_state copy_risk require_ai_response last_human last_bot bot_count human_count
  local dados_coletados dados_cadastro media_last_human
  local contexto=3 timing=3 resposta_lateral=3 progressao=3 voz=3 densidade=3 seguranca=3 personalizacao=2
  local tags="" action="nenhuma"

  run_id="$(basename "$evidence_dir")"
  if [ "$(basename "$(dirname "$evidence_dir")")" = "steps" ]; then
    run_id="$(basename "$(dirname "$(dirname "$evidence_dir")")")/step-${run_id}"
  fi
  final_state="$(jq -r '(.estado_agente // .conversas[0].estado_agente // "n/a")' "$poll_json")"
  require_ai_response="1"
  if [ -f "$request_json" ]; then
    require_ai_response="$(jq -r '.require_ai_response // "1"' "$request_json")"
  fi
  last_human="$(jq -r '[.mensagens[]? | select(.message.type=="human") | .message.content] | last // ""' "$poll_json" | normalize_line)"
  last_bot="$(jq -r '[.mensagens[]? | select(.message.type=="ai") | .message.content] | last // ""' "$poll_json" | normalize_line)"
  bot_count="$(jq -r '[.mensagens[]? | select(.message.type=="ai")] | length' "$poll_json")"
  human_count="$(jq -r '[.mensagens[]? | select(.message.type=="human")] | length' "$poll_json")"
  media_last_human="$(jq -r '[.mensagens[]? | select(.message.type=="human") | .message.media_mimetype] | last // ""' "$poll_json")"
  dados_coletados="$(jq -c '.conversas[0].dados_coletados // {}' "$poll_json")"
  dados_cadastro="$(jq -c '.conversas[0].dados_cadastro // {}' "$poll_json")"

  copy_risk="n/a"
  if [ -f "$evidence_dir/judgment.md" ]; then
    copy_risk="$(awk -F': ' '/copy_risk:/ { print $2; exit }' "$evidence_dir/judgment.md" | normalize_line)"
    [ -n "$copy_risk" ] || copy_risk="n/a"
  fi

  if [ -z "$last_bot" ]; then
    if [ "$final_state" = "aguardando_tatuador" ] && [ "$require_ai_response" = "0" ]; then
      tags="$(append_tag "$tags" "pos_handoff_sem_ia_ok")"
      voz=3
      densidade=3
      personalizacao=2
      action="manter; sucesso operacional terminal"
    else
      contexto=0
      timing=0
      resposta_lateral=0
      progressao=0
      voz=0
      densidade=0
      seguranca=3
      personalizacao=0
      tags="$(append_tag "$tags" "sem_resposta_ai")"
      action="investigar ausencia de resposta"
    fi
  else
    local len question_count repeated_in_run
    len="${#last_bot}"
    question_count="$(printf '%s' "$last_bot" | awk -F'?' '{print NF-1}')"
    repeated_in_run="$(jq -r '
      [.mensagens[]? | select(.message.type=="ai") | .message.content]
      | group_by(.)
      | map(select(length > 1))
      | length
    ' "$poll_json")"

    if [ "$len" -gt 700 ]; then
      densidade="$(score_min "$densidade" 1)"
      voz="$(score_min "$voz" 2)"
      tags="$(append_tag "$tags" "excesso_de_texto")"
    elif [ "$len" -gt 360 ]; then
      densidade="$(score_min "$densidade" 2)"
      tags="$(append_tag "$tags" "excesso_de_texto")"
    fi

    if [ "$question_count" -gt 2 ]; then
      densidade="$(score_min "$densidade" 1)"
      progressao="$(score_min "$progressao" 2)"
      tags="$(append_tag "$tags" "excesso_de_perguntas")"
    elif [ "$question_count" -gt 1 ]; then
      densidade="$(score_min "$densidade" 2)"
      tags="$(append_tag "$tags" "excesso_de_perguntas")"
    fi

    if [ "${repeated_in_run:-0}" -gt 0 ]; then
      voz="$(score_min "$voz" 1)"
      contexto="$(score_min "$contexto" 2)"
      tags="$(append_tag "$tags" "pergunta_repetida")"
    fi

    if has_any "$last_bot" 'sou uma ia|inteligencia artificial|sistema|erro|falha|webhook|orcid|pipeline|router|guardrail|prompt'; then
      seguranca=0
      voz="$(score_min "$voz" 0)"
      tags="$(append_tag "$tags" "risco_operacional")"
    fi

    if has_any "$last_bot" 'R\$|pix|sinal|agenda fechada|horario confirmado|valor fechado|preco fechado'; then
      seguranca=0
      tags="$(append_tag "$tags" "risco_operacional")"
    fi

    if has_any "$last_bot" 'me chamo|muito prazer'; then
      voz="$(score_min "$voz" 1)"
      tags="$(append_tag "$tags" "natural_robotizado")"
    fi

    if has_any "$last_bot" 'pra liberar teu orçamento|orçamento personalizado|valor certinho|acionar o tatuador|orientar com segurança|responsável legal|avaliar com calma'; then
      voz="$(score_min "$voz" 2)"
      tags="$(append_tag "$tags" "copy_rigida")"
    fi

    if has_any "$last_bot" 'entendi tudo|perfeito, ent[aã]o|fechado,'; then
      voz="$(score_min "$voz" 2)"
      tags="$(append_tag "$tags" "natural_robotizado")"
    fi

    if [ "$media_last_human" != "null" ] && [ -n "$media_last_human" ] && has_any "$last_bot" 'reenvia|manda a foto|nao recebi|não recebi'; then
      contexto="$(score_min "$contexto" 1)"
      resposta_lateral="$(score_min "$resposta_lateral" 1)"
      tags="$(append_tag "$tags" "ignora_midia")"
    fi

    if has_any "$last_human" 'quanto|valor|pre[cç]o|fica|or[cç]amento' && ! has_any "$last_bot" 'depende|avaliar|tatuador|tamanho|local|detalhe|foto|refer[eê]ncia|valor'; then
      resposta_lateral="$(score_min "$resposta_lateral" 1)"
      tags="$(append_tag "$tags" "avanca_sem_responder")"
    fi

    if has_any "$last_human" 'tempo|demora|sess[aã]o|sessoes|sessões' && ! has_any "$last_bot" 'tempo|sess[aã]o|sessoes|sessões|depende|avaliar|tatuador'; then
      resposta_lateral="$(score_min "$resposta_lateral" 1)"
      tags="$(append_tag "$tags" "avanca_sem_responder")"
    fi

    if has_any "$last_human" 'portfolio|portf[oó]lio|trabalho|fotos' && ! has_any "$last_bot" 'portfolio|portf[oó]lio|refer[eê]ncia|trabalhos|enviar'; then
      resposta_lateral="$(score_min "$resposta_lateral" 1)"
      tags="$(append_tag "$tags" "avanca_sem_responder")"
    fi

    if jq -e '.descricao_curta != null and .descricao_curta != ""' >/dev/null <<<"$dados_coletados" && has_any "$last_bot" 'qual desenho|o que tu quer tatuar|ideia da tattoo|qual a ideia'; then
      contexto="$(score_min "$contexto" 1)"
      progressao="$(score_min "$progressao" 1)"
      tags="$(append_tag "$tags" "pergunta_repetida")"
    fi

    if jq -e '.estilo != null and .estilo != ""' >/dev/null <<<"$dados_coletados" && has_any "$last_bot" 'qual estilo|estilo tu quer|estilo da tattoo'; then
      contexto="$(score_min "$contexto" 1)"
      progressao="$(score_min "$progressao" 1)"
      tags="$(append_tag "$tags" "pergunta_repetida")"
    fi

    if jq -e '.local_corpo != null and .local_corpo != ""' >/dev/null <<<"$dados_coletados" && ! has_any "$last_bot" 'foto' && has_any "$last_bot" 'qual local|onde no corpo|onde tu quer tatuar|em que parte do corpo'; then
      contexto="$(score_min "$contexto" 1)"
      progressao="$(score_min "$progressao" 1)"
      tags="$(append_tag "$tags" "pergunta_repetida")"
    fi

    if jq -e '.altura_cm != null' >/dev/null <<<"$dados_coletados" && has_any "$last_bot" 'tua altura|sua altura|qual altura'; then
      contexto="$(score_min "$contexto" 1)"
      progressao="$(score_min "$progressao" 1)"
      tags="$(append_tag "$tags" "pergunta_repetida")"
    fi

    if jq -e '.foto_local_msg_id != null or .foto_local_file_id != null' >/dev/null <<<"$dados_coletados" && has_any "$last_bot" 'manda .*foto do local|envia .*foto do local|preciso .*foto do local|consegue mandar .*foto do local'; then
      contexto="$(score_min "$contexto" 1)"
      progressao="$(score_min "$progressao" 1)"
      tags="$(append_tag "$tags" "pergunta_repetida")"
    fi

    if jq -e '.nome != null and .nome != ""' >/dev/null <<<"$dados_cadastro" && has_any "$last_bot" 'nome completo|como posso te chamar'; then
      contexto="$(score_min "$contexto" 1)"
      progressao="$(score_min "$progressao" 1)"
      tags="$(append_tag "$tags" "pergunta_repetida")"
    fi

    if jq -e '.data_nascimento != null and .data_nascimento != ""' >/dev/null <<<"$dados_cadastro" && has_any "$last_bot" 'data de nascimento|nascimento completa'; then
      contexto="$(score_min "$contexto" 1)"
      progressao="$(score_min "$progressao" 1)"
      tags="$(append_tag "$tags" "pergunta_repetida")"
    fi

    if [ "$final_state" = "coletando_tattoo" ] && has_any "$last_bot" 'nome completo|data de nascimento|e-?mail'; then
      local missing_tattoo
      missing_tattoo="$(jq -r '
        [
          (.descricao_curta == null or .descricao_curta == ""),
          (.estilo == null or .estilo == ""),
          (.local_corpo == null or .local_corpo == ""),
          (.altura_cm == null),
          ((.foto_local_msg_id == null) and (.foto_local_file_id == null))
        ] | map(select(. == true)) | length
      ' <<<"$dados_coletados")"
      if [ "${missing_tattoo:-0}" -gt 1 ]; then
        timing="$(score_min "$timing" 1)"
        progressao="$(score_min "$progressao" 1)"
        tags="$(append_tag "$tags" "pergunta_precoce")"
      fi
    fi

    if [ "$copy_risk" = "medio" ]; then
      voz="$(score_min "$voz" 2)"
      tags="$(append_tag "$tags" "copy_risk_medio")"
    elif [ "$copy_risk" = "alto" ]; then
      voz="$(score_min "$voz" 1)"
      seguranca="$(score_min "$seguranca" 1)"
      tags="$(append_tag "$tags" "copy_risk_alto")"
    fi
  fi

  [ -n "$tags" ] || tags="ok"

  local avg decision
  avg="$(awk -v a="$contexto" -v b="$timing" -v c="$resposta_lateral" -v d="$progressao" -v e="$voz" -v f="$densidade" -v g="$seguranca" -v h="$personalizacao" 'BEGIN { printf "%.2f", (a+b+c+d+e+f+g+h)/8 }')"
  decision="$(awk \
    -v avg="$avg" \
    -v contexto="$contexto" \
    -v resposta_lateral="$resposta_lateral" \
    -v progressao="$progressao" \
    -v seguranca="$seguranca" \
    -v timing="$timing" \
    -v voz="$voz" \
    -v densidade="$densidade" \
    -v personalizacao="$personalizacao" '
      BEGIN {
        if (seguranca < 3) { print "STOP"; exit }
        if (contexto == 0 || resposta_lateral == 0 || progressao == 0) { print "REWORK"; exit }
        if (avg < 2.4) { print "REWORK"; exit }
        if (contexto == 1 || timing == 1 || resposta_lateral == 1 || progressao == 1 || voz == 1 || densidade == 1 || personalizacao == 1) { print "WATCHLIST"; exit }
        print "PASS"
      }
    ')"

  if [ "$decision" = "WATCHLIST" ] && [ "$action" = "nenhuma" ]; then
    action="priorizar leitura humana e possivel familia de copy"
  elif [ "$decision" = "REWORK" ] && [ "$action" = "nenhuma" ]; then
    action="abrir slice corretivo pequeno antes de nova expansao"
  elif [ "$decision" = "STOP" ] && [ "$action" = "nenhuma" ]; then
    action="travar plano e corrigir risco operacional"
  elif [ "$action" = "nenhuma" ]; then
    action="manter como referencia positiva"
  fi

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$decision" "$avg" "$contexto" "$timing" "$resposta_lateral" "$progressao" "$voz" "$densidade" "$seguranca" "$personalizacao" \
    "$tags" "$run_id" "$final_state" "$copy_risk" "$human_count/$bot_count" "$(shorten "$last_human" 110)" "$(shorten "$last_bot" 150)"

  printf '%s\t%s\n' "$decision" "$action" >> "$tmp_rows.actions"
}

echo "# Naturalness Audit V2"
echo
echo "- rubric: docs/atendimento-premium/naturalness-rubric-v2.md"
echo "- mode: read-only"
echo "- smoke_executed: no"
echo "- whatsapp_sent: no"
echo
echo "## Runs"
echo
echo "| Decisao | Media | Ctx | Timing | Lateral | Prog | Voz | Dens | Seg | Pers | Tags | Run ID | Estado | Copy risk | Turns | Cliente final | Bot final |"
echo "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---:|---|---|"

rows_count=0
rm -f "$tmp_rows.actions"
for evidence_dir in "$@"; do
  if [ ! -d "$evidence_dir" ]; then
    printf 'WARN: evidence dir nao existe: %s\n' "$evidence_dir" >&2
    continue
  fi
  if [ ! -f "$evidence_dir/poll.json" ]; then
    printf 'WARN: poll.json nao existe: %s\n' "$evidence_dir/poll.json" >&2
    continue
  fi
  score_evidence "$evidence_dir" >> "$tmp_rows"
  rows_count=$((rows_count + 1))
done

sort -t $'\t' -k1,1 -k2,2n "$tmp_rows" | while IFS=$'\t' read -r decision avg contexto timing resposta_lateral progressao voz densidade seguranca personalizacao tags run_id final_state copy_risk turns last_human last_bot; do
  printf '| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | `%s` | `%s` | `%s` | `%s` | %s | %s | %s |\n' \
    "$decision" "$avg" "$contexto" "$timing" "$resposta_lateral" "$progressao" "$voz" "$densidade" "$seguranca" "$personalizacao" \
    "$tags" "$run_id" "$final_state" "$copy_risk" "$turns" "$last_human" "$last_bot"
done

pass_count="$(awk -F'\t' '$1 == "PASS" { count++ } END { print count + 0 }' "$tmp_rows")"
watch_count="$(awk -F'\t' '$1 == "WATCHLIST" { count++ } END { print count + 0 }' "$tmp_rows")"
rework_count="$(awk -F'\t' '$1 == "REWORK" { count++ } END { print count + 0 }' "$tmp_rows")"
stop_count="$(awk -F'\t' '$1 == "STOP" { count++ } END { print count + 0 }' "$tmp_rows")"
avg_all="$(awk -F'\t' '{ sum += $2; count++ } END { if (count == 0) print "0.00"; else printf "%.2f", sum/count }' "$tmp_rows")"

decision="PASS"
if [ "$stop_count" -gt 0 ]; then
  decision="STOP"
elif [ "$rework_count" -gt 0 ]; then
  decision="REWORK"
elif [ "$watch_count" -gt 0 ]; then
  decision="WATCHLIST"
fi

echo
echo "## Summary"
echo
echo "- evidencias_analisadas: ${rows_count}"
echo "- pass: ${pass_count}"
echo "- watchlist: ${watch_count}"
echo "- rework: ${rework_count}"
echo "- stop: ${stop_count}"
echo "- media_geral: ${avg_all}"
echo "- decisao: ${decision}"

echo
echo "## Action Hints"
echo
if [ -f "$tmp_rows.actions" ]; then
  sort "$tmp_rows.actions" | uniq -c | while read -r count decision_action action; do
    printf -- '- %s x %s: %s\n' "$count" "$decision_action" "$action"
  done
fi

echo
echo "## Decision"
echo
cat <<REPORT
\`\`\`text
status: PASS
decision: ${decision}
note: auditoria V2 read-only; STOP/REWORK/WATCHLIST orientam priorizacao, nao substituem smoke definitivo.
\`\`\`
REPORT
