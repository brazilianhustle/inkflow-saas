#!/usr/bin/env bash
# scripts/smoke/render-triage.sh
# Gera triage.md a partir dos artefatos disponiveis de um smoke scenario.

set -euo pipefail
cd "$(dirname "$0")/../.."

EVIDENCE_DIR="${1:?uso: render-triage.sh <evidence_dir> [exit_code]}"
EXIT_CODE="${2:-1}"
TRIAGE_MD="$EVIDENCE_DIR/triage.md"

[ -d "$EVIDENCE_DIR" ] || { echo "ERRO: evidence_dir nao existe: $EVIDENCE_DIR" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "ERRO: jq nao instalado." >&2; exit 1; }

read_json() {
  local file="$1"
  if [ -f "$file" ]; then
    cat "$file"
  else
    printf '{}'
  fi
}

request_json="$(read_json "$EVIDENCE_DIR/request.json")"
poll_json="$(read_json "$EVIDENCE_DIR/poll.json")"

run_id="$(printf '%s' "$request_json" | jq -r '.run_id // "(unknown)"')"
scenario_id="$(awk -F': ' '/scenario_id/ {print $2; exit}' "$EVIDENCE_DIR/scenario-plan.txt" 2>/dev/null || true)"
scenario_type="$(awk -F': ' '/type/ {print $2; exit}' "$EVIDENCE_DIR/scenario-plan.txt" 2>/dev/null || true)"
expected_state="$(printf '%s' "$request_json" | jq -r '.expected_state // ""')"
target_phone="$(printf '%s' "$request_json" | jq -r '.phone // .sender_phone // "(unknown)"')"
base_url="$(printf '%s' "$request_json" | jq -r '.base_url // "(unknown)"')"
final_state="$(printf '%s' "$poll_json" | jq -r '.conversas[0].estado_agente // ""')"
orcid="$(printf '%s' "$poll_json" | jq -r '.conversas[0].orcid // ""')"
failed_count="$(printf '%s' "$poll_json" | jq '[.mensagens[]? | select(.status=="failed")] | length')"
human_count="$(printf '%s' "$poll_json" | jq '[.mensagens[]? | select(.message.type=="human")] | length')"
ai_count="$(printf '%s' "$poll_json" | jq '[.mensagens[]? | select(.message.type=="ai")] | length')"
last_human="$(printf '%s' "$poll_json" | jq -r '[.mensagens[]? | select(.message.type=="human")][-1].message.content // ""')"
last_ai="$(printf '%s' "$poll_json" | jq -r '[.mensagens[]? | select(.message.type=="ai")][-1].message.content // ""')"
copy_risk="$(awk -F': ' '/copy_risk:/ {print $2; exit}' "$EVIDENCE_DIR/judgment.md" 2>/dev/null || true)"

failure_class="unknown"
next_action="Abrir os artefatos do evidence dir e classificar manualmente."

if [ "$EXIT_CODE" = "0" ]; then
  failure_class="pass_triage"
  next_action="Nenhuma acao corretiva obrigatoria. Usar como baseline."
elif [ -f "$EVIDENCE_DIR/evolution-send.json" ] \
  && ! jq -e '.ok == true' "$EVIDENCE_DIR/evolution-send.json" >/dev/null 2>&1 \
  && ! grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "$EVIDENCE_DIR/evolution-send.json"; then
  failure_class="infra_evolution_send"
  next_action="Verificar instancia remetente, API key, estado open e resposta do endpoint sendText."
elif [ -f "$EVIDENCE_DIR/inbound-response.txt" ] && grep -Eiq 'HTTP [45][0-9][0-9]|ERRO|error' "$EVIDENCE_DIR/inbound-response.txt"; then
  failure_class="infra_inbound_http"
  next_action="Inspecionar inbound-response.txt e tail-excerpt.log antes de alterar prompt ou policy."
elif [ "$failed_count" != "0" ]; then
  failure_class="pipeline_failed_message"
  next_action="Abrir poll.json e tail-excerpt.log; corrigir erro runtime antes de reavaliar plano conversacional."
elif [ -n "$expected_state" ] && [ "$final_state" != "$expected_state" ]; then
  failure_class="contract_state_not_reached"
  next_action="Reanalisar Workflow Manager, Policy e dados seedados; o contrato do scenario nao foi cumprido."
elif [[ ",${expected_state}," == *",aguardando_tatuador,"* ]] && [ -z "$orcid" ]; then
  failure_class="contract_handoff_without_orcid"
  next_action="Inspecionar geracao de orcamento/handoff; estado final sem orcid nao e checkpoint valido."
elif [ "$human_count" = "0" ]; then
  failure_class="webhook_human_not_recorded"
  next_action="Validar Evolution do bot, webhook e normalizacao do telefone remetente."
elif [ "$ai_count" = "0" ]; then
  failure_class="agent_no_response"
  next_action="Validar fila/session queue, processamento async e logs do agent."
elif [ "$copy_risk" = "alto" ]; then
  failure_class="copy_risk_high"
  next_action="Revisar ResponseComposer/prompt; problema e qualidade de resposta, nao infraestrutura."
else
  failure_class="scenario_gate_failed"
  next_action="Abrir judgment.md e scenario-copy-risk.txt; identificar qual gate final bloqueou."
fi

runtime_signal="sem tail-excerpt.log"
if [ "$EXIT_CODE" = "0" ]; then
  runtime_signal="scenario PASS; tail sem acao corretiva obrigatoria"
elif [ -f "$EVIDENCE_DIR/tail-excerpt.log" ]; then
  if grep -Eiq 'exception[^s]|error|erro|failed|unhandled|timeout' "$EVIDENCE_DIR/tail-excerpt.log"; then
    runtime_signal="tail contem sinal de erro; revisar tail-excerpt.log"
  else
    runtime_signal="tail sem erro runtime evidente"
  fi
fi

cat > "$TRIAGE_MD" <<EOF
# Smoke Triage

- run_id: ${run_id}
- scenario_id: ${scenario_id:-"(unknown)"}
- scenario_type: ${scenario_type:-"(unknown)"}
- exit_code: ${EXIT_CODE}
- failure_class: ${failure_class}
- base_url: ${base_url}
- phone: ${target_phone}
- expected_state: ${expected_state:-"(none)"}
- final_state: ${final_state:-"(none)"}
- orcid: ${orcid:-"(none)"}
- copy_risk: ${copy_risk:-"(none)"}
- runtime_signal: ${runtime_signal}

## Counters

| Signal | Value |
|---|---:|
| human_messages | ${human_count} |
| ai_messages | ${ai_count} |
| failed_messages | ${failed_count} |

## Last Human

\`\`\`text
${last_human}
\`\`\`

## Last Bot

\`\`\`text
${last_ai}
\`\`\`

## Next Action

${next_action}

## Decision Rule

- \`infra_*\`: corrigir ambiente/webhook/Evolution antes de mexer no plano do bot.
- \`contract_*\`: reabrir plano do slice; o comportamento esperado nao foi cumprido.
- \`copy_risk_*\`: manter fluxo tecnico e atacar linguagem/ResponseComposer.
- \`pass_triage\`: registrar baseline e seguir para o proximo scenario.
EOF

echo "triage generated: $TRIAGE_MD"
