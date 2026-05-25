#!/usr/bin/env bash
# scripts/smoke/run-scenario.sh
# Executa um smoke scenario versionado em docs/atendimento-premium/smoke-scenarios.

set -euo pipefail
cd "$(dirname "$0")/../.."

SCENARIO_NAME="${1:?uso: run-scenario.sh <scenario-name>}"
SCENARIO_FILE="${SMOKE_SCENARIO_FILE:-docs/atendimento-premium/smoke-scenarios/${SCENARIO_NAME}.env}"

[ -f "$SCENARIO_FILE" ] || { echo "ERRO: scenario nao encontrado: $SCENARIO_FILE" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "ERRO: jq nao instalado." >&2; exit 1; }

# Defaults seguros antes do source.
SCENARIO_ID="$SCENARIO_NAME"
SCENARIO_TITLE="$SCENARIO_NAME"
SCENARIO_TYPE="http"
BASE_URL="${BASE_URL:-https://inkflowbrasil.com}"
TENANT_ID="${SMOKE_TENANT_ID:-db686ef2-ca42-43e4-a831-808984d8d6c6}"
PHONE="5521970789797"
INSTANCE="inkflow_test_sub4"
SETUP="none"
CLEANUP_BEFORE="0"
MESSAGE=""
EXPECTED_STATE=""
EXPECTED_HUMAN_TEXT=""
EXPECTED_COPY_RISK_MAX=""

# shellcheck source=/dev/null
source "$SCENARIO_FILE"

[ -n "$MESSAGE" ] || { echo "ERRO: scenario sem MESSAGE." >&2; exit 1; }
[[ "$PHONE" =~ ^[0-9]{10,15}$ ]] || { echo "ERRO: PHONE invalido: $PHONE" >&2; exit 1; }
case "$SCENARIO_TYPE" in
  http|whatsapp_real) ;;
  *) echo "ERRO: SCENARIO_TYPE invalido: $SCENARIO_TYPE" >&2; exit 1 ;;
esac

RUN_ID="${SMOKE_RUN_ID:-scenario-${SCENARIO_ID}-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM}"
EVIDENCE_ROOT="${SMOKE_EVIDENCE_ROOT:-.smoke-evidence}"
EVIDENCE_DIR="${EVIDENCE_ROOT}/${RUN_ID}"
TRIAGE_RENDERED=0

print_plan() {
  cat <<EOF
=== Smoke Scenario ===
scenario_id   : $SCENARIO_ID
title         : $SCENARIO_TITLE
type          : $SCENARIO_TYPE
base_url      : $BASE_URL
tenant_id     : $TENANT_ID
phone         : $PHONE
instance      : ${INSTANCE:-"(none)"}
setup         : $SETUP
cleanup_before: $CLEANUP_BEFORE
expected_state: ${EXPECTED_STATE:-"(none)"}
require_orcid : ${SMOKE_REQUIRE_ORCID:-0}
run_id        : $RUN_ID
evidence_dir  : $EVIDENCE_DIR

message:
---
$MESSAGE
---
EOF
}

load_devvars() {
  local devvars=".dev.vars"
  [ -f "$devvars" ] || { echo "ERRO: $devvars nao existe." >&2; exit 1; }
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[A-Z_]+$ ]] || continue
    value="${value%\"}"; value="${value#\"}"
    export "$key=$value"
  done < "$devvars"
  SUPA_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_KEY:-}}"
  [ -n "${SUPABASE_URL:-}" ] && [ -n "$SUPA_KEY" ] || {
    echo "ERRO: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no .dev.vars." >&2
    exit 1
  }
}

supa_post() {
  local path="$1"
  local body="$2"
  local tmp status
  tmp="$(mktemp)"
  status="$(
    curl -sS -o "$tmp" -w "%{http_code}" \
      -X POST "${SUPABASE_URL}/rest/v1/${path}" \
      -H "apikey: $SUPA_KEY" \
      -H "Authorization: Bearer $SUPA_KEY" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=representation" \
      --data "$body"
  )"
  if [[ ! "$status" =~ ^2 ]]; then
    echo "ERRO: Supabase POST $path falhou HTTP $status" >&2
    cat "$tmp" >&2
    rm -f "$tmp"
    exit 1
  fi
  cat "$tmp"
  rm -f "$tmp"
}

seed_cadastro_handoff_email_recusado() {
  load_devvars
  local sid now conv_body msg_body conv_id
  sid="${TENANT_ID}_${PHONE}"
  now="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

  conv_body="$(
    jq -nc \
      --arg tenant "$TENANT_ID" \
      --arg phone "$PHONE" \
      --arg now "$now" \
      '{
        tenant_id:$tenant,
        telefone:$phone,
        estado_agente:"coletando_cadastro",
        dados_coletados:{
          descricao_curta:"leao",
          local_corpo:"antebraco",
          altura_cm:170,
          estilo:"fineline"
        },
        dados_cadastro:{
          nome:"Joao Silva",
          data_nascimento:"1995-03-12"
        },
        last_msg_at:$now
      }'
  )"
  conv_id="$(supa_post "conversas" "$conv_body" | jq -r '.[0].id // empty')"
  [ -n "$conv_id" ] || { echo "ERRO: seed nao retornou conversa id." >&2; exit 1; }

  msg_body="$(
    jq -nc \
      --arg sid "$sid" \
      '{
        session_id:$sid,
        status:"processed",
        message:{
          type:"ai",
          content:"E o e-mail? Se preferir seguir sem, me avisa"
        }
      }'
  )"
  supa_post "conversa_mensagens" "$msg_body" >/dev/null
  echo "seed ok: conversa=$conv_id session_id=$sid"
}

run_setup() {
  case "$SETUP" in
    none|"") echo "setup: none" ;;
    seed_cadastro_handoff_email_recusado) seed_cadastro_handoff_email_recusado ;;
    *) echo "ERRO: setup desconhecido: $SETUP" >&2; exit 1 ;;
  esac
}

run_scenario() {
  mkdir -p "$EVIDENCE_DIR"
  print_plan | tee "$EVIDENCE_DIR/scenario-plan.txt"
  cp "$SCENARIO_FILE" "$EVIDENCE_DIR/scenario.env"

  if [ "${CLEANUP_BEFORE:-0}" = "1" ]; then
    echo ""
    echo "[scenario] cleanup before"
    bash scripts/cleanup-conversa-teste.sh --tenant "$TENANT_ID" "$PHONE" --yes \
      | tee "$EVIDENCE_DIR/scenario-cleanup.txt"
  fi

  echo ""
  echo "[scenario] setup"
  run_setup | tee "$EVIDENCE_DIR/scenario-setup.txt"

  echo ""
  echo "[scenario] run"
  case "$SCENARIO_TYPE" in
    http)
      SMOKE_RUN_ID="$RUN_ID" \
      SMOKE_EVIDENCE_ROOT="$EVIDENCE_ROOT" \
      SMOKE_TENANT_ID="$TENANT_ID" \
      SMOKE_REQUIRE_ORCID="${SMOKE_REQUIRE_ORCID:-}" \
      SMOKE_EXPECT_HUMAN_TEXT="${EXPECTED_HUMAN_TEXT:-}" \
      BASE_URL="$BASE_URL" \
      INSTANCE="${INSTANCE:-}" \
      EXPECTED_STATE="$EXPECTED_STATE" \
        bash scripts/smoke/run-inbound.sh "$MESSAGE" "$PHONE"
      ;;
    whatsapp_real)
      load_devvars
      SMOKE_RUN_ID="$RUN_ID" \
      SMOKE_EVIDENCE_ROOT="$EVIDENCE_ROOT" \
      SMOKE_TENANT_ID="$TENANT_ID" \
      SMOKE_REQUIRE_ORCID="${SMOKE_REQUIRE_ORCID:-}" \
      BASE_URL="$BASE_URL" \
      EXPECTED_STATE="$EXPECTED_STATE" \
        bash scripts/smoke/run-real-whatsapp.sh "$MESSAGE" "$PHONE" "${SMOKE_BOT_NUMBER:-}"
      ;;
  esac

  if [ -n "${EXPECTED_COPY_RISK_MAX:-}" ]; then
    echo ""
    echo "[scenario] copy risk gate"
    [ -f "$EVIDENCE_DIR/judgment.md" ] || { echo "ERRO: judgment.md ausente." >&2; exit 1; }
    actual_risk="$(awk -F': ' '/copy_risk:/ {print $2; exit}' "$EVIDENCE_DIR/judgment.md")"
    risk_rank() {
      case "$1" in
        baixo) echo 1 ;;
        medio) echo 2 ;;
        alto) echo 3 ;;
        *) echo 99 ;;
      esac
    }
    actual_rank="$(risk_rank "$actual_risk")"
    max_rank="$(risk_rank "$EXPECTED_COPY_RISK_MAX")"
    if [ "$actual_rank" -gt "$max_rank" ]; then
      echo "ERRO: copy_risk acima do esperado: actual=$actual_risk max=$EXPECTED_COPY_RISK_MAX" >&2
      exit 1
    fi
    echo "copy_risk ok: actual=$actual_risk max=$EXPECTED_COPY_RISK_MAX" | tee "$EVIDENCE_DIR/scenario-copy-risk.txt"
  fi
}

on_exit() {
  local status=$?
  if [ "$status" -ne 0 ] && [ -d "$EVIDENCE_DIR" ] && [ "$TRIAGE_RENDERED" = "0" ]; then
    TRIAGE_RENDERED=1
    bash scripts/smoke/render-triage.sh "$EVIDENCE_DIR" "$status" || true
    if [ -f "$EVIDENCE_DIR/triage.md" ] && grep -Eq '^- failure_class: contract_' "$EVIDENCE_DIR/triage.md"; then
      bash scripts/smoke/render-plan-review.sh "$EVIDENCE_DIR" || true
    fi
  fi
  exit "$status"
}

if [ "${SMOKE_SCENARIO_DRY_RUN:-0}" = "1" ]; then
  print_plan
  exit 0
fi

trap on_exit EXIT
run_scenario
