#!/usr/bin/env bash
# scripts/smoke/render-report.sh
# Gera transcript.md e judgment.md a partir do pacote de evidencia do smoke.

set -euo pipefail
cd "$(dirname "$0")/../.."

EVIDENCE_DIR="${1:?uso: render-report.sh <evidence_dir>}"
POLL_JSON="$EVIDENCE_DIR/poll.json"
REQUEST_JSON="$EVIDENCE_DIR/request.json"
TRANSCRIPT_MD="$EVIDENCE_DIR/transcript.md"
JUDGMENT_MD="$EVIDENCE_DIR/judgment.md"
SUMMARY_MD="$EVIDENCE_DIR/summary.md"
AGENT_LOGS_JSON="$EVIDENCE_DIR/agent-turn-logs.json"

[ -d "$EVIDENCE_DIR" ] || { echo "ERRO: evidence_dir nao existe: $EVIDENCE_DIR" >&2; exit 1; }
[ -f "$POLL_JSON" ] || { echo "ERRO: poll.json nao encontrado em $EVIDENCE_DIR" >&2; exit 1; }
[ -f "$REQUEST_JSON" ] || { echo "ERRO: request.json nao encontrado em $EVIDENCE_DIR" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "ERRO: jq nao instalado." >&2; exit 1; }

run_id="$(jq -r '.run_id // "(unknown)"' "$REQUEST_JSON")"
expected_state="$(jq -r '.expected_state // ""' "$REQUEST_JSON")"
require_orcid="$(jq -r '.require_orcid // "0"' "$REQUEST_JSON")"
require_ai_response="$(jq -r '.require_ai_response // "1"' "$REQUEST_JSON")"
target_phone="$(jq -r '.phone // .sender_phone // "(unknown)"' "$REQUEST_JSON")"
base_url="$(jq -r '.base_url // "(unknown)"' "$REQUEST_JSON")"
state="$(jq -r '.conversas[0].estado_agente // ""' "$POLL_JSON")"
orcid="$(jq -r '.conversas[0].orcid // ""' "$POLL_JSON")"
human_count="$(jq '[.mensagens[]? | select(.message.type=="human")] | length' "$POLL_JSON")"
ai_count="$(jq '[.mensagens[]? | select(.message.type=="ai")] | length' "$POLL_JSON")"
failed_count="$(jq '[.mensagens[]? | select(.status=="failed")] | length' "$POLL_JSON")"
last_ai="$(jq -r '[.mensagens[]? | select(.message.type=="ai")][-1].message.content // ""' "$POLL_JSON")"
last_human="$(jq -r '[.mensagens[]? | select(.message.type=="human")][-1].message.content // ""' "$POLL_JSON")"
decision_observability=""
if [ -f "$AGENT_LOGS_JSON" ]; then
  decision_observability="$(jq -r '
    [
      .[]?
      | .context_metadata as $m
      | {
          agent_name: (.agent_name // "unknown"),
          trace_id: ($m.workflow_handoff_package_trace_id // $m.handoff_package_trace_id // null),
          package_version: ($m.workflow_handoff_package_version // $m.handoff_package_version // null),
          workflow_reason: ($m.workflow_reason // null),
          escalation_reason_code: ($m.escalation_reason_code // null)
        }
      | select(.trace_id != null or .package_version != null or .workflow_reason != null or .escalation_reason_code != null)
    ]
    | unique
    | map(
        "- " + .agent_name
        + (if .trace_id then ": trace=" + .trace_id else "" end)
        + (if .package_version then " package=" + .package_version else "" end)
        + (if .workflow_reason then " workflow_reason=" + .workflow_reason else "" end)
        + (if .escalation_reason_code then " escalation_reason=" + .escalation_reason_code else "" end)
      )
    | join("\n")
  ' "$AGENT_LOGS_JSON")"
fi

cat > "$TRANSCRIPT_MD" <<EOF
# Smoke Transcript

- run_id: ${run_id}
- base_url: ${base_url}
- phone: ${target_phone}
- state: ${state:-"(none)"}
- orcid: ${orcid:-"(none)"}

EOF

if [ -n "$decision_observability" ]; then
  cat >> "$TRANSCRIPT_MD" <<EOF
## Decision Observability

${decision_observability}

EOF
fi

cat >> "$TRANSCRIPT_MD" <<EOF
## Turns

EOF

jq -r '
  .mensagens[]?
  | "- [" + (.created_at // "") + "] "
    + (if .message.type == "human" then "HUMANO" elif .message.type == "ai" then "BOT" else (.message.type // "unknown" | ascii_upcase) end)
    + " (" + (.status // "unknown") + ")\n\n"
    + "```text\n"
    + ((.message.content // "") | tostring)
    + "\n```\n"
' "$POLL_JSON" >> "$TRANSCRIPT_MD"

state_ok=false
if [ -z "$expected_state" ] || [ "$expected_state" = "$state" ]; then
  state_ok=true
fi

orcid_ok=true
if [ "$require_orcid" = "1" ] && [[ ",${expected_state}," == *",aguardando_tatuador,"* ]] && [ -z "$orcid" ]; then
  orcid_ok=false
fi

failed_ok=true
if [ "$failed_count" != "0" ]; then
  failed_ok=false
fi

ai_ok=true
if [ "$require_ai_response" = "1" ] && [ "$ai_count" -lt 1 ]; then
  ai_ok=false
fi

copy_risk="baixo"
notes=()

if [ -z "$last_ai" ]; then
  if [ "$require_ai_response" = "1" ]; then
    copy_risk="alto"
    notes+=("sem resposta AI no snapshot")
  else
    notes+=("sem resposta AI esperada para fluxo terminal/handoff")
  fi
else
  ai_chars="${#last_ai}"
  if [ "$ai_chars" -lt 25 ]; then
    copy_risk="medio"
    notes+=("resposta AI muito curta para avaliacao de atendimento")
  fi
  if [ "$ai_chars" -gt 900 ]; then
    copy_risk="medio"
    notes+=("resposta AI longa demais para WhatsApp")
  fi
  if printf '%s' "$last_ai" | grep -Eiq 'desculpe|sou uma ia|nao posso|não posso|erro|falha|sistema|prompt'; then
    copy_risk="alto"
    notes+=("resposta possivelmente expoe limitacao interna ou erro")
  fi
  if printf '%s' "$last_ai" | grep -Eiq 'confirmo por aqui'; then
    copy_risk="medio"
    notes+=("fechamento operacional funciona, mas pode soar seco para padrao premium")
  elif printf '%s' "$last_ai" | grep -Eiq 'sigo com teu or[cç]amento|vou encaminhar'; then
    notes+=("confirma andamento operacional")
  fi
  if printf '%s' "$last_ai" | grep -Eiq 'depende|sess[aã]o|tatuador|avaliar'; then
    notes+=("respondeu a duvida lateral sobre tempo/avaliacao")
  fi
  if printf '%s' "$last_ai" | grep -Eiq 'email|e-mail'; then
    copy_risk="medio"
    notes+=("menciona email; verificar se nao insistiu apos recusa")
  fi
fi

if [ "$state_ok" != "true" ] || [ "$orcid_ok" != "true" ] || [ "$failed_ok" != "true" ] || [ "$ai_ok" != "true" ]; then
  copy_risk="alto"
fi

if [ "${#notes[@]}" -eq 0 ]; then
  notes+=("nenhum risco textual automatico detectado")
fi

cat > "$JUDGMENT_MD" <<EOF
# Smoke Judgment

- run_id: ${run_id}
- base_url: ${base_url}
- phone: ${target_phone}
- expected_state: ${expected_state:-"(none)"}
- final_state: ${state:-"(none)"}
- orcid: ${orcid:-"(none)"}

## Technical Verdict

| Check | Result |
|---|---|
| expected_state | ${state_ok} |
| require_orcid_for_handoff | ${orcid_ok} |
| no_failed_messages | ${failed_ok} |
| ai_response_required | ${require_ai_response} |
| ai_response_present_when_required | ${ai_ok} |
| human_messages | ${human_count} |
| ai_messages | ${ai_count} |

EOF

if [ -n "$decision_observability" ]; then
  cat >> "$JUDGMENT_MD" <<EOF
## Decision Observability

${decision_observability}

EOF
fi

cat >> "$JUDGMENT_MD" <<EOF
## Conversation Judgment

- copy_risk: ${copy_risk}

### Last Human Message

\`\`\`text
${last_human}
\`\`\`

### Last Bot Message

\`\`\`text
${last_ai}
\`\`\`

### Notes

EOF

for note in "${notes[@]}"; do
  printf -- '- %s\n' "$note" >> "$JUDGMENT_MD"
done

cat >> "$JUDGMENT_MD" <<EOF

## Limite

Este julgamento e deterministico e serve como triagem operacional. Ele nao substitui a validacao humana de naturalidade, confianca e percepcao premium.
EOF

if [ -n "$decision_observability" ] && [ -f "$SUMMARY_MD" ] && ! grep -q '^## Decision Observability$' "$SUMMARY_MD"; then
  cat >> "$SUMMARY_MD" <<EOF

## Decision Observability

${decision_observability}
EOF
fi

echo "reports generated: $TRANSCRIPT_MD $JUDGMENT_MD"
