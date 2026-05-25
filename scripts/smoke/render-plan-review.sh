#!/usr/bin/env bash
# scripts/smoke/render-plan-review.sh
# Gera plan-review.md para falhas de contrato em smoke scenario.

set -euo pipefail
cd "$(dirname "$0")/../.."

EVIDENCE_DIR="${1:?uso: render-plan-review.sh <evidence_dir>}"
TRIAGE_MD="$EVIDENCE_DIR/triage.md"
PLAN_REVIEW_MD="$EVIDENCE_DIR/plan-review.md"

[ -d "$EVIDENCE_DIR" ] || { echo "ERRO: evidence_dir nao existe: $EVIDENCE_DIR" >&2; exit 1; }
[ -f "$TRIAGE_MD" ] || { echo "ERRO: triage.md ausente em: $EVIDENCE_DIR" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "ERRO: jq nao instalado." >&2; exit 1; }

read_json() {
  local file="$1"
  if [ -f "$file" ]; then
    cat "$file"
  else
    printf '{}'
  fi
}

field_from_triage() {
  local key="$1"
  awk -F': ' -v key="$key" '$0 ~ "^- " key ":" {print $2; exit}' "$TRIAGE_MD"
}

request_json="$(read_json "$EVIDENCE_DIR/request.json")"
poll_json="$(read_json "$EVIDENCE_DIR/poll.json")"

run_id="$(field_from_triage "run_id")"
scenario_id="$(field_from_triage "scenario_id")"
scenario_type="$(field_from_triage "scenario_type")"
failure_class="$(field_from_triage "failure_class")"
expected_state="$(field_from_triage "expected_state")"
final_state="$(field_from_triage "final_state")"
orcid="$(field_from_triage "orcid")"
copy_risk="$(field_from_triage "copy_risk")"
phone="$(field_from_triage "phone")"
base_url="$(field_from_triage "base_url")"

expected_state_request="$(printf '%s' "$request_json" | jq -r '.expected_state // ""')"
final_state_poll="$(printf '%s' "$poll_json" | jq -r '.conversas[0].estado_agente // ""')"
conversation_id="$(printf '%s' "$poll_json" | jq -r '.conversas[0].id // ""')"
dados_cadastro="$(printf '%s' "$poll_json" | jq -c '.conversas[0].dados_cadastro // {}')"
dados_coletados="$(printf '%s' "$poll_json" | jq -c '.conversas[0].dados_coletados // {}')"
last_human="$(printf '%s' "$poll_json" | jq -r '[.mensagens[]? | select(.message.type=="human")][-1].message.content // ""')"
last_ai="$(printf '%s' "$poll_json" | jq -r '[.mensagens[]? | select(.message.type=="ai")][-1].message.content // ""')"

case "$failure_class" in
  contract_state_not_reached)
    likely_layer="Workflow Manager / ConversationPolicy / seed do scenario"
    contract_gap="Estado esperado nao foi atingido."
    minimum_correction="Identificar por que os criterios de saida da fase nao promoveram o estado. Corrigir a menor camada responsavel e rerodar o mesmo scenario."
    plan_decision="reopen_slice_plan"
    ;;
  contract_handoff_without_orcid)
    likely_layer="Workflow Manager / handoff operacional / persistencia de orcamento"
    contract_gap="Estado de handoff foi atingido sem gerar orcid obrigatorio."
    minimum_correction="Garantir que a transicao para aguardando_tatuador seja atomica com a criacao do orcamento ou bloqueada quando o orcamento falhar."
    plan_decision="reopen_slice_plan"
    ;;
  contract_*)
    likely_layer="Router / Policy / Workflow Manager"
    contract_gap="Contrato do scenario falhou."
    minimum_correction="Revisar hipotese do slice contra os artefatos e corrigir em mini-passo antes de ampliar escopo."
    plan_decision="reopen_slice_plan"
    ;;
  *)
    likely_layer="nao aplicavel"
    contract_gap="Falha nao classificada como contrato."
    minimum_correction="Usar triage.md como fonte primaria; plan-review nao e gate obrigatorio para esta classe."
    plan_decision="plan_review_not_required"
    ;;
esac

cat > "$PLAN_REVIEW_MD" <<EOF
# Smoke Plan Review

- run_id: ${run_id:-"(unknown)"}
- scenario_id: ${scenario_id:-"(unknown)"}
- scenario_type: ${scenario_type:-"(unknown)"}
- failure_class: ${failure_class:-"(unknown)"}
- plan_decision: ${plan_decision}
- likely_layer: ${likely_layer}
- base_url: ${base_url:-"(unknown)"}
- phone: ${phone:-"(unknown)"}
- conversation_id: ${conversation_id:-"(unknown)"}

## Contract Gap

${contract_gap}

| Contract | Value |
|---|---|
| expected_state_triage | ${expected_state:-"(none)"} |
| expected_state_request | ${expected_state_request:-"(none)"} |
| final_state_triage | ${final_state:-"(none)"} |
| final_state_poll | ${final_state_poll:-"(none)"} |
| orcid | ${orcid:-"(none)"} |
| copy_risk | ${copy_risk:-"(none)"} |

## Evidence Snapshot

### dados_cadastro

\`\`\`json
${dados_cadastro}
\`\`\`

### dados_coletados

\`\`\`json
${dados_coletados}
\`\`\`

### Last Human

\`\`\`text
${last_human}
\`\`\`

### Last Bot

\`\`\`text
${last_ai}
\`\`\`

## Strategic Read

- A falha contradiz o contrato do scenario, nao apenas a qualidade textual.
- Nao concluir o slice enquanto este mesmo scenario nao gerar PASS limpo.
- Corrigir a menor camada provavel: ${likely_layer}.
- Se o seed estiver errado, corrigir o scenario antes de mexer no produto.

## Minimum Correction

${minimum_correction}

## Validation Command

\`\`\`bash
bash scripts/smoke/run-scenario.sh ${scenario_id:-"<scenario-id>"}
\`\`\`

## Gate

\`\`\`text
slice_completion: blocked_until_same_scenario_passes
failure_artifacts: triage.md, plan-review.md
pass_required_artifacts: summary.md, poll.json, transcript.md, judgment.md
decision: ${plan_decision}
\`\`\`
EOF

echo "plan review generated: $PLAN_REVIEW_MD"
