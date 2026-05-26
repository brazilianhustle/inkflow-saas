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
STEP_COUNT="0"
STEP_WAIT_SECONDS="${STEP_WAIT_SECONDS:-2}"
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
EXPECTED_BOT_REGEX=""
FORBIDDEN_BOT_REGEX=""
EXPECTED_TAIL_REGEX=""
FORBIDDEN_TAIL_REGEX=""
EXPECTED_POLL_JQ_TRUE=""
EXPECTED_AGENT_LOG_JQ_TRUE=""
EXPECTED_AGENT_LOG_TIMEOUT_SECONDS="${EXPECTED_AGENT_LOG_TIMEOUT_SECONDS:-20}"
EXPECTED_SIDE_EFFECT_TIMEOUT_SECONDS="${EXPECTED_SIDE_EFFECT_TIMEOUT_SECONDS:-20}"
SMOKE_MEDIA_BASE64="${SMOKE_MEDIA_BASE64:-}"
SMOKE_MEDIA_FILE="${SMOKE_MEDIA_FILE:-}"
SMOKE_MEDIA_MIMETYPE="${SMOKE_MEDIA_MIMETYPE:-}"
SMOKE_REQUIRE_AI_RESPONSE="${SMOKE_REQUIRE_AI_RESPONSE:-1}"
SMOKE_SUPABASE_CONNECT_TIMEOUT_SECONDS="${SMOKE_SUPABASE_CONNECT_TIMEOUT_SECONDS:-5}"
SMOKE_SUPABASE_MAX_TIME_SECONDS="${SMOKE_SUPABASE_MAX_TIME_SECONDS:-20}"
SMOKE_SUPABASE_PREFLIGHT_DISABLED="${SMOKE_SUPABASE_PREFLIGHT_DISABLED:-0}"

# shellcheck source=/dev/null
source "$SCENARIO_FILE"

is_multiturn_type() {
  case "$SCENARIO_TYPE" in
    http_multiturn|whatsapp_real_multiturn) return 0 ;;
    *) return 1 ;;
  esac
}

if is_multiturn_type; then
  [[ "$STEP_COUNT" =~ ^[0-9]+$ ]] && [ "$STEP_COUNT" -ge 2 ] || {
    echo "ERRO: scenario multi-turn exige STEP_COUNT >= 2." >&2
    exit 1
  }
else
  [ -n "$MESSAGE" ] || [ -n "${SMOKE_MEDIA_FILE:-}" ] || [ -n "${SMOKE_MEDIA_BASE64:-}" ] || {
    echo "ERRO: scenario sem MESSAGE ou midia." >&2
    exit 1
  }
fi
[[ "$PHONE" =~ ^[0-9]{10,15}$ ]] || { echo "ERRO: PHONE invalido: $PHONE" >&2; exit 1; }
case "$SCENARIO_TYPE" in
  http|whatsapp_real|http_multiturn|whatsapp_real_multiturn) ;;
  *) echo "ERRO: SCENARIO_TYPE invalido: $SCENARIO_TYPE" >&2; exit 1 ;;
esac

RUN_ID="${SMOKE_RUN_ID:-scenario-${SCENARIO_ID}-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM}"
RUN_STARTED_ISO="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
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
bot_regex     : ${EXPECTED_BOT_REGEX:-"(none)"}
forbid_regex  : ${FORBIDDEN_BOT_REGEX:-"(none)"}
tail_regex    : ${EXPECTED_TAIL_REGEX:-"(none)"}
agent_log_jq  : ${EXPECTED_AGENT_LOG_JQ_TRUE:-"(none)"}
agent_log_wait: ${EXPECTED_AGENT_LOG_TIMEOUT_SECONDS}s
media         : ${SMOKE_MEDIA_MIMETYPE:-"(none)"}
run_id        : $RUN_ID
evidence_dir  : $EVIDENCE_DIR
EOF

  if is_multiturn_type; then
    echo ""
    echo "steps:"
    local i msg state bot_regex poll_jq
    for i in $(seq 1 "$STEP_COUNT"); do
      msg="$(step_value MESSAGE "$i")"
      state="$(step_value EXPECTED_STATE "$i")"
      bot_regex="$(step_value EXPECTED_BOT_REGEX "$i")"
      poll_jq="$(step_value EXPECTED_POLL_JQ_TRUE "$i")"
      cat <<EOF
  [$i]
    message: ${msg:-"(empty)"}
    expected_state: ${state:-"(none)"}
    bot_regex: ${bot_regex:-"(none)"}
    poll_jq: ${poll_jq:-"(none)"}
EOF
    done
    return
  fi

  cat <<EOF
message:
---
$MESSAGE
---
EOF
}

step_value() {
  local base="$1"
  local step="$2"
  local name="${base}_${step}"
  printf '%s' "${!name:-}"
}

shell_quote() {
  printf '%q' "$1"
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

supabase_curl() {
  curl -sS \
    --connect-timeout "$SMOKE_SUPABASE_CONNECT_TIMEOUT_SECONDS" \
    --max-time "$SMOKE_SUPABASE_MAX_TIME_SECONDS" \
    "$@"
}

supabase_preflight() {
  [ "$SMOKE_SUPABASE_PREFLIGHT_DISABLED" = "1" ] && return 0
  load_devvars
  local tmp status curl_status
  tmp="$(mktemp)"
  set +e
  status="$(
    supabase_curl -o "$tmp" -w "%{http_code}" \
      "${SUPABASE_URL}/rest/v1/conversas?select=id&limit=1" \
      -H "apikey: $SUPA_KEY" \
      -H "Authorization: Bearer $SUPA_KEY"
  )"
  curl_status=$?
  set -e
  {
    echo "supabase_url=${SUPABASE_URL}"
    echo "curl_status=${curl_status}"
    echo "http_status=${status:-000}"
    echo "connect_timeout_seconds=${SMOKE_SUPABASE_CONNECT_TIMEOUT_SECONDS}"
    echo "max_time_seconds=${SMOKE_SUPABASE_MAX_TIME_SECONDS}"
  } > "$EVIDENCE_DIR/supabase-preflight.txt"
  if [ "$curl_status" -ne 0 ] || [[ ! "$status" =~ ^2 ]]; then
    echo "ERRO: Supabase preflight falhou (curl_status=${curl_status}, http_status=${status:-000})." >&2
    echo "Classe operacional: infra_supabase_connectivity. Nao rodar smoke/WhatsApp real ate resolver." >&2
    cat "$tmp" >> "$EVIDENCE_DIR/supabase-preflight.txt" || true
    rm -f "$tmp"
    exit 1
  fi
  rm -f "$tmp"
}

supa_post() {
  local path="$1"
  local body="$2"
  local tmp status
  tmp="$(mktemp)"
  status="$(
    supabase_curl -o "$tmp" -w "%{http_code}" \
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

supa_get_agent_turn_logs_since_run() {
  load_devvars
  supabase_curl --get "${SUPABASE_URL}/rest/v1/agent_turn_logs" \
    --data-urlencode "tenant_id=eq.${TENANT_ID}" \
    --data-urlencode "created_at=gte.${RUN_STARTED_ISO}" \
    --data-urlencode "select=created_at,agent_name,client_input_text,context_metadata,llm_output_parsed" \
    --data-urlencode "order=created_at.desc" \
    --data-urlencode "limit=30" \
    -H "apikey: $SUPA_KEY" \
    -H "Authorization: Bearer $SUPA_KEY"
}

refresh_poll_snapshot() {
  load_devvars
  local sid conv msgs msgs_snapshot
  sid="${TENANT_ID}_${PHONE}"
  conv="$(
    supabase_curl --get "${SUPABASE_URL}/rest/v1/conversas" \
      --data-urlencode "tenant_id=eq.${TENANT_ID}" \
      --data-urlencode "telefone=eq.${PHONE}" \
      --data-urlencode "select=estado_agente,orcid,updated_at,dados_coletados,dados_cadastro" \
      --data-urlencode "limit=1" \
      -H "apikey: $SUPA_KEY" \
      -H "Authorization: Bearer $SUPA_KEY"
  )"
  msgs="$(
    supabase_curl --get "${SUPABASE_URL}/rest/v1/conversa_mensagens" \
      --data-urlencode "session_id=eq.${sid}" \
      --data-urlencode "created_at=gte.${RUN_STARTED_ISO}" \
      --data-urlencode "select=created_at,status,message" \
      --data-urlencode "order=created_at.asc" \
      -H "apikey: $SUPA_KEY" \
      -H "Authorization: Bearer $SUPA_KEY"
  )"
  msgs_snapshot="$(printf '%s' "$msgs" | jq '[.[] | del(.message.media_base64)]')"
  jq -nc --argjson conv "$conv" --argjson msgs "$msgs_snapshot" '{conversas:$conv,mensagens:$msgs}' \
    > "$EVIDENCE_DIR/poll.json"
}

refresh_tail_excerpt() {
  local tail_log="${SMOKE_TAIL_LOG:-/tmp/inkflow-smoke-tail.log}"
  if [ -f "$tail_log" ]; then
    tail -240 "$tail_log" > "$EVIDENCE_DIR/tail-excerpt.log" || true
  fi
}

wait_side_effect_gates() {
  [ -n "${EXPECTED_TAIL_REGEX:-}" ] || [ -n "${EXPECTED_POLL_JQ_TRUE:-}" ] || return 0

  echo ""
  echo "[scenario] side-effect wait"
  local deadline tail_ok poll_ok
  deadline=$((SECONDS + EXPECTED_SIDE_EFFECT_TIMEOUT_SECONDS))
  while true; do
    tail_ok=1
    poll_ok=1
    if [ -n "${EXPECTED_TAIL_REGEX:-}" ]; then
      refresh_tail_excerpt
      if [ ! -f "$EVIDENCE_DIR/tail-excerpt.log" ] || ! grep -Eiq "$EXPECTED_TAIL_REGEX" "$EVIDENCE_DIR/tail-excerpt.log"; then
        tail_ok=0
      fi
    fi
    if [ -n "${FORBIDDEN_TAIL_REGEX:-}" ] && [ -f "$EVIDENCE_DIR/tail-excerpt.log" ] && grep -Eiq "$FORBIDDEN_TAIL_REGEX" "$EVIDENCE_DIR/tail-excerpt.log"; then
      echo "side-effect wait: tail contem padrao proibido" >&2
      return 1
    fi
    if [ -n "${EXPECTED_POLL_JQ_TRUE:-}" ]; then
      refresh_poll_snapshot
      if ! jq -e "$EXPECTED_POLL_JQ_TRUE" "$EVIDENCE_DIR/poll.json" >/dev/null; then
        poll_ok=0
      fi
    fi
    if [ "$tail_ok" -eq 1 ] && [ "$poll_ok" -eq 1 ]; then
      echo "side-effect wait: ok"
      return 0
    fi
    [ "$SECONDS" -lt "$deadline" ] || break
    sleep 2
  done
  echo "side-effect wait: timeout aguardando tail/poll side-effects" >&2
  return 0
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

seed_cadastro_aguardando_data() {
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
          nome:"Joao Silva"
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
          content:"Boa, Joao. Me passa tua data de nascimento completa?"
        }
      }'
  )"
  supa_post "conversa_mensagens" "$msg_body" >/dev/null
  echo "seed ok: conversa=$conv_id session_id=$sid"
}

seed_cadastro_aguardando_nome() {
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
        dados_cadastro:{},
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
          content:"Me passa teu nome completo?"
        }
      }'
  )"
  supa_post "conversa_mensagens" "$msg_body" >/dev/null
  echo "seed ok: conversa=$conv_id session_id=$sid"
}

seed_tattoo_aguardando_foto_local() {
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
        estado_agente:"coletando_tattoo",
        dados_coletados:{
          descricao_curta:"rosa",
          local_corpo:"antebraco",
          altura_cm:170,
          estilo:"fineline",
          tentativas_foto_local:1
        },
        dados_cadastro:{},
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
          content:"Boa, ja peguei a ideia principal. Consegue mandar uma foto do local onde tu quer tatuar?"
        }
      }'
  )"
  supa_post "conversa_mensagens" "$msg_body" >/dev/null
  echo "seed ok: conversa=$conv_id session_id=$sid"
}

seed_tattoo_com_foto_local_aguardando_nome() {
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
          descricao_curta:"rosa",
          local_corpo:"antebraco",
          altura_cm:170,
          estilo:"fineline",
          tentativas_foto_local:1,
          foto_local_msg_id:599
        },
        dados_cadastro:{},
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
          content:"Recebi a foto do local. Pra liberar teu orçamento, preciso do teu nome completo."
        }
      }'
  )"
  supa_post "conversa_mensagens" "$msg_body" >/dev/null
  echo "seed ok: conversa=$conv_id session_id=$sid"
}

seed_tattoo_parcial_foto_ambigua() {
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
        estado_agente:"coletando_tattoo",
        dados_coletados:{
          descricao_curta:"rosa",
          local_corpo:"antebraco",
          altura_cm:170
        },
        dados_cadastro:{},
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
          content:"Tu prefere qual estilo pra essa tattoo?"
        }
      }'
  )"
  supa_post "conversa_mensagens" "$msg_body" >/dev/null
  echo "seed ok: conversa=$conv_id session_id=$sid"
}

seed_tattoo_foto_ambigua_aguardando_confirmacao() {
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
        estado_agente:"coletando_tattoo",
        dados_coletados:{
          descricao_curta:"rosa",
          local_corpo:"antebraco",
          altura_cm:170,
          estilo:"fineline",
          refs_imagens_msg_ids:[11951]
        },
        dados_cadastro:{},
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
          content:"Vi a imagem, mas fiquei em dúvida se ela é referência do desenho ou o local do corpo. Qual dos dois fica valendo?"
        }
      }'
  )"
  supa_post "conversa_mensagens" "$msg_body" >/dev/null
  echo "seed ok: conversa=$conv_id session_id=$sid"
}

seed_tattoo_ref_confirmada_aguardando_foto_local() {
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
        estado_agente:"coletando_tattoo",
        dados_coletados:{
          descricao_curta:"rosa",
          local_corpo:"antebraco",
          altura_cm:170,
          estilo:"fineline",
          refs_imagens_msg_ids:[11951],
          tentativas_foto_local:1
        },
        dados_cadastro:{},
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
          content:"Perfeito, deixei essa imagem como referência do desenho. Agora preciso da foto do local do corpo onde tu quer tatuar."
        }
      }'
  )"
  supa_post "conversa_mensagens" "$msg_body" >/dev/null
  echo "seed ok: conversa=$conv_id session_id=$sid"
}

seed_cadastro_pos_midia_aguardando_nome() {
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
          descricao_curta:"rosa",
          local_corpo:"antebraco",
          altura_cm:170,
          estilo:"fineline",
          foto_local_msg_id:12632,
          refs_imagens_msg_ids:[11951],
          tentativas_foto_local:1
        },
        dados_cadastro:{},
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
          content:"Recebi a foto do local. Pra liberar teu orçamento, preciso do teu nome completo."
        }
      }'
  )"
  supa_post "conversa_mensagens" "$msg_body" >/dev/null
  echo "seed ok: conversa=$conv_id session_id=$sid"
}

seed_cadastro_pos_midia_aguardando_email() {
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
          descricao_curta:"rosa",
          local_corpo:"antebraco",
          altura_cm:170,
          estilo:"fineline",
          foto_local_msg_id:12632,
          refs_imagens_msg_ids:[11951],
          tentativas_foto_local:1
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

seed_cadastro_pos_midia_aguardando_email_media_fresca() {
  load_devvars
  local sid now media_body media_rows local_msg_id ref_msg_id conv_body msg_body conv_id local_png ref_png local_b64 ref_b64
  sid="${TENANT_ID}_${PHONE}"
  now="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  local_png="docs/superpowers/specs/assets/2026-05-04-home-refator-ref/symbols/logo-white-header-240h.png"
  ref_png="docs/superpowers/specs/assets/2026-05-04-home-refator-ref/mobile-375-hero.png"
  [ -f "$local_png" ] || { echo "ERRO: seed media ausente: $local_png" >&2; exit 1; }
  [ -f "$ref_png" ] || { echo "ERRO: seed media ausente: $ref_png" >&2; exit 1; }
  local_b64="$(base64 < "$local_png" | tr -d '\n')"
  ref_b64="$(base64 < "$ref_png" | tr -d '\n')"

  media_body="$(
    jq -nc \
      --arg sid "$sid" \
      --arg local_b64 "$local_b64" \
      --arg ref_b64 "$ref_b64" \
      '[
        {
          session_id:$sid,
          status:"processed",
          message:{
            type:"human",
            content:"foto local seed auditoria",
            media_base64:$local_b64,
            media_mimetype:"image/png"
          }
        },
        {
          session_id:$sid,
          status:"processed",
          message:{
            type:"human",
            content:"referencia seed auditoria",
            media_base64:$ref_b64,
            media_mimetype:"image/png"
          }
        }
      ]'
  )"
  media_rows="$(supa_post "conversa_mensagens" "$media_body")"
  local_msg_id="$(printf '%s' "$media_rows" | jq -r '.[0].id // empty')"
  ref_msg_id="$(printf '%s' "$media_rows" | jq -r '.[1].id // empty')"
  if [ -z "$local_msg_id" ] || [ -z "$ref_msg_id" ] || [ "$local_msg_id" = "null" ] || [ "$ref_msg_id" = "null" ]; then
    echo "ERRO: seed nao retornou ids de midia fresca." >&2
    exit 1
  fi

  conv_body="$(
    jq -nc \
      --arg tenant "$TENANT_ID" \
      --arg phone "$PHONE" \
      --arg now "$now" \
      --argjson local_id "$local_msg_id" \
      --argjson ref_id "$ref_msg_id" \
      '{
        tenant_id:$tenant,
        telefone:$phone,
        estado_agente:"coletando_cadastro",
        dados_coletados:{
          descricao_curta:"rosa",
          local_corpo:"antebraco",
          altura_cm:170,
          estilo:"fineline",
          foto_local_msg_id:$local_id,
          refs_imagens_msg_ids:[$ref_id],
          tentativas_foto_local:1
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
  echo "seed ok: conversa=$conv_id session_id=$sid foto_local_msg_id=$local_msg_id ref_msg_id=$ref_msg_id"
}

seed_pos_handoff_aguardando_tatuador() {
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
        estado_agente:"aguardando_tatuador",
        orcid:"orc_poshandoff",
        dados_coletados:{
          descricao_curta:"rosa",
          local_corpo:"antebraco",
          altura_cm:170,
          estilo:"fineline",
          foto_local_msg_id:12632,
          refs_imagens_msg_ids:[11951],
          foto_local_file_id:"SMOKE_LOCAL_FILE_ID",
          refs_imagens_file_ids:["SMOKE_REF_FILE_ID"],
          tentativas_foto_local:1
        },
        dados_cadastro:{
          nome:"Joao Silva",
          data_nascimento:"1995-03-12",
          email:"joao@example.com"
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
          content:"Fechado, Joao! O tatuador vai avaliar com calma e eu te retorno em breve com o valor certinho."
        }
      }'
  )"
  supa_post "conversa_mensagens" "$msg_body" >/dev/null
  echo "seed ok: conversa=$conv_id session_id=$sid estado=aguardando_tatuador orcid=orc_poshandoff"
}

run_setup() {
  case "$SETUP" in
    none|"") echo "setup: none" ;;
    seed_cadastro_handoff_email_recusado) seed_cadastro_handoff_email_recusado ;;
    seed_cadastro_aguardando_data) seed_cadastro_aguardando_data ;;
    seed_cadastro_aguardando_nome) seed_cadastro_aguardando_nome ;;
    seed_tattoo_aguardando_foto_local) seed_tattoo_aguardando_foto_local ;;
    seed_tattoo_com_foto_local_aguardando_nome) seed_tattoo_com_foto_local_aguardando_nome ;;
    seed_tattoo_parcial_foto_ambigua) seed_tattoo_parcial_foto_ambigua ;;
    seed_tattoo_foto_ambigua_aguardando_confirmacao) seed_tattoo_foto_ambigua_aguardando_confirmacao ;;
    seed_tattoo_ref_confirmada_aguardando_foto_local) seed_tattoo_ref_confirmada_aguardando_foto_local ;;
    seed_cadastro_pos_midia_aguardando_nome) seed_cadastro_pos_midia_aguardando_nome ;;
    seed_cadastro_pos_midia_aguardando_email) seed_cadastro_pos_midia_aguardando_email ;;
    seed_cadastro_pos_midia_aguardando_email_media_fresca) seed_cadastro_pos_midia_aguardando_email_media_fresca ;;
    seed_pos_handoff_aguardando_tatuador) seed_pos_handoff_aguardando_tatuador ;;
    *) echo "ERRO: setup desconhecido: $SETUP" >&2; exit 1 ;;
  esac
}

write_single_turn_step_env() {
  local step="$1"
  local path="$2"
  local scenario_type="${3:-http}"
  local message expected_state expected_human expected_copy bot_regex forbidden_bot poll_jq agent_jq
  message="$(step_value MESSAGE "$step")"
  expected_state="$(step_value EXPECTED_STATE "$step")"
  expected_human="$(step_value EXPECTED_HUMAN_TEXT "$step")"
  expected_copy="$(step_value EXPECTED_COPY_RISK_MAX "$step")"
  bot_regex="$(step_value EXPECTED_BOT_REGEX "$step")"
  forbidden_bot="$(step_value FORBIDDEN_BOT_REGEX "$step")"
  poll_jq="$(step_value EXPECTED_POLL_JQ_TRUE "$step")"
  agent_jq="$(step_value EXPECTED_AGENT_LOG_JQ_TRUE "$step")"

  [ -n "$message" ] || { echo "ERRO: MESSAGE_${step} vazio." >&2; exit 1; }
  [ -n "$expected_state" ] || expected_state="$EXPECTED_STATE"
  [ -n "$expected_human" ] || expected_human="$message"
  [ -n "$expected_copy" ] || expected_copy="$EXPECTED_COPY_RISK_MAX"

  {
    printf 'SCENARIO_ID=%s\n' "$(shell_quote "${SCENARIO_ID}-step${step}")"
    printf 'SCENARIO_TITLE=%s\n' "$(shell_quote "${SCENARIO_TITLE} step ${step}")"
    printf 'SCENARIO_TYPE=%s\n' "$(shell_quote "$scenario_type")"
    printf 'BASE_URL=%s\n' "$(shell_quote "$BASE_URL")"
    printf 'TENANT_ID=%s\n' "$(shell_quote "$TENANT_ID")"
    printf 'PHONE=%s\n' "$(shell_quote "$PHONE")"
    printf 'INSTANCE=%s\n' "$(shell_quote "${INSTANCE:-}")"
    [ -n "${SMOKE_BOT_NUMBER:-}" ] && printf 'SMOKE_BOT_NUMBER=%s\n' "$(shell_quote "$SMOKE_BOT_NUMBER")"
    printf 'SETUP="none"\n'
    printf 'CLEANUP_BEFORE="0"\n'
    printf 'MESSAGE=%s\n' "$(shell_quote "$message")"
    printf 'EXPECTED_STATE=%s\n' "$(shell_quote "$expected_state")"
    printf 'EXPECTED_HUMAN_TEXT=%s\n' "$(shell_quote "$expected_human")"
    [ -n "$expected_copy" ] && printf 'EXPECTED_COPY_RISK_MAX=%s\n' "$(shell_quote "$expected_copy")"
    printf 'SMOKE_REQUIRE_AI_RESPONSE=%s\n' "$(shell_quote "${SMOKE_REQUIRE_AI_RESPONSE:-1}")"
    [ -n "$bot_regex" ] && printf 'EXPECTED_BOT_REGEX=%s\n' "$(shell_quote "$bot_regex")"
    [ -n "$forbidden_bot" ] && printf 'FORBIDDEN_BOT_REGEX=%s\n' "$(shell_quote "$forbidden_bot")"
    [ -n "$poll_jq" ] && printf 'EXPECTED_POLL_JQ_TRUE=%s\n' "$(shell_quote "$poll_jq")"
    [ -n "$agent_jq" ] && printf 'EXPECTED_AGENT_LOG_JQ_TRUE=%s\n' "$(shell_quote "$agent_jq")"
    true
  } > "$path"
}

copy_final_step_evidence() {
  local final_dir="$1"
  local file
  for file in request.json poll.json summary.md transcript.md judgment.md agent-turn-logs.json evolution-send.json tail-start.txt tail-excerpt.log scenario-bot-text.txt scenario-poll-jq.txt scenario-agent-log-jq.txt report-render.txt; do
    [ -f "$final_dir/$file" ] && cp "$final_dir/$file" "$EVIDENCE_DIR/$file"
  done
}

run_http_multiturn() {
  local steps_root step step_dir step_env step_run_id generated_dir final_dir
  steps_root="$EVIDENCE_DIR/steps"
  mkdir -p "$steps_root"

  {
    printf '# Multi-turn steps\n\n'
    printf -- '- step_count: %s\n' "$STEP_COUNT"
    printf -- '- step_wait_seconds: %s\n' "$STEP_WAIT_SECONDS"
  } > "$EVIDENCE_DIR/multiturn-summary.md"

  for step in $(seq 1 "$STEP_COUNT"); do
    step_dir="$steps_root/$step"
    mkdir -p "$step_dir"
    step_env="$step_dir/scenario.env"
    step_run_id="${RUN_ID}-step${step}"
    write_single_turn_step_env "$step" "$step_env"

    echo ""
    echo "[scenario] multiturn step $step/$STEP_COUNT"
    SMOKE_SCENARIO_FILE="$step_env" \
    SMOKE_RUN_ID="$step_run_id" \
    SMOKE_EVIDENCE_ROOT="$steps_root" \
      bash scripts/smoke/run-scenario.sh "${SCENARIO_ID}-step${step}" \
        | tee "$step_dir/run.log"

    generated_dir="$steps_root/$step_run_id"
    if [ -d "$generated_dir" ]; then
      cp -R "$generated_dir/." "$step_dir/"
      rm -rf "$generated_dir"
    fi
    {
      printf '\n## Step %s\n\n' "$step"
      printf -- '- run_id: %s\n' "$step_run_id"
      printf -- '- evidence: steps/%s/\n' "$step"
      printf -- '- message: %s\n' "$(step_value MESSAGE "$step")"
    } >> "$EVIDENCE_DIR/multiturn-summary.md"

    final_dir="$step_dir"
    if [ "$step" -lt "$STEP_COUNT" ] && [ "${STEP_WAIT_SECONDS:-0}" -gt 0 ]; then
      sleep "$STEP_WAIT_SECONDS"
    fi
  done

  copy_final_step_evidence "$final_dir"
  bash scripts/smoke/render-report.sh "$EVIDENCE_DIR" | tee -a "$EVIDENCE_DIR/report-render.txt"
}

run_whatsapp_real_multiturn() {
  local steps_root step step_dir step_env step_run_id generated_dir final_dir
  load_devvars
  [ -n "${SMOKE_BOT_NUMBER:-}" ] || { echo "ERRO: whatsapp_real_multiturn exige SMOKE_BOT_NUMBER." >&2; exit 1; }
  steps_root="$EVIDENCE_DIR/steps"
  mkdir -p "$steps_root"

  {
    printf '# Multi-turn WhatsApp real steps\n\n'
    printf -- '- step_count: %s\n' "$STEP_COUNT"
    printf -- '- step_wait_seconds: %s\n' "$STEP_WAIT_SECONDS"
    printf -- '- sender_instance: %s\n' "${INSTANCE:-central}"
    printf -- '- bot_number: %s\n' "$SMOKE_BOT_NUMBER"
  } > "$EVIDENCE_DIR/multiturn-summary.md"

  for step in $(seq 1 "$STEP_COUNT"); do
    step_dir="$steps_root/$step"
    mkdir -p "$step_dir"
    step_env="$step_dir/scenario.env"
    step_run_id="${RUN_ID}-step${step}"
    write_single_turn_step_env "$step" "$step_env" "whatsapp_real"

    echo ""
    echo "[scenario] whatsapp real multiturn step $step/$STEP_COUNT"
    SMOKE_SCENARIO_FILE="$step_env" \
    SMOKE_RUN_ID="$step_run_id" \
    SMOKE_EVIDENCE_ROOT="$steps_root" \
      bash scripts/smoke/run-scenario.sh "${SCENARIO_ID}-step${step}" \
        | tee "$step_dir/run.log"

    generated_dir="$steps_root/$step_run_id"
    if [ -d "$generated_dir" ]; then
      cp -R "$generated_dir/." "$step_dir/"
      rm -rf "$generated_dir"
    fi
    {
      printf '\n## Step %s\n\n' "$step"
      printf -- '- run_id: %s\n' "$step_run_id"
      printf -- '- evidence: steps/%s/\n' "$step"
      printf -- '- message: %s\n' "$(step_value MESSAGE "$step")"
    } >> "$EVIDENCE_DIR/multiturn-summary.md"

    final_dir="$step_dir"
    if [ "$step" -lt "$STEP_COUNT" ] && [ "${STEP_WAIT_SECONDS:-0}" -gt 0 ]; then
      sleep "$STEP_WAIT_SECONDS"
    fi
  done

  copy_final_step_evidence "$final_dir"
  bash scripts/smoke/render-report.sh "$EVIDENCE_DIR" | tee -a "$EVIDENCE_DIR/report-render.txt"
}

run_scenario() {
  mkdir -p "$EVIDENCE_DIR"
  print_plan | tee "$EVIDENCE_DIR/scenario-plan.txt"
  cp "$SCENARIO_FILE" "$EVIDENCE_DIR/scenario.env"

  echo ""
  echo "[scenario] supabase preflight"
  supabase_preflight
  cat "$EVIDENCE_DIR/supabase-preflight.txt"

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
    http_multiturn)
      run_http_multiturn
      return 0
      ;;
    whatsapp_real_multiturn)
      run_whatsapp_real_multiturn
      return 0
      ;;
    http)
      SMOKE_RUN_ID="$RUN_ID" \
      SMOKE_EVIDENCE_ROOT="$EVIDENCE_ROOT" \
      SMOKE_TENANT_ID="$TENANT_ID" \
      SMOKE_REQUIRE_ORCID="${SMOKE_REQUIRE_ORCID:-}" \
      SMOKE_REQUIRE_AI_RESPONSE="${SMOKE_REQUIRE_AI_RESPONSE:-1}" \
      SMOKE_EXPECT_HUMAN_TEXT="${EXPECTED_HUMAN_TEXT:-}" \
      BASE_URL="$BASE_URL" \
      INSTANCE="${INSTANCE:-}" \
      SMOKE_MEDIA_BASE64="${SMOKE_MEDIA_BASE64:-}" \
      SMOKE_MEDIA_FILE="${SMOKE_MEDIA_FILE:-}" \
      SMOKE_MEDIA_MIMETYPE="${SMOKE_MEDIA_MIMETYPE:-}" \
      EXPECTED_STATE="$EXPECTED_STATE" \
        bash scripts/smoke/run-inbound.sh "$MESSAGE" "$PHONE"
      ;;
    whatsapp_real)
      load_devvars
      SMOKE_RUN_ID="$RUN_ID" \
      SMOKE_EVIDENCE_ROOT="$EVIDENCE_ROOT" \
      SMOKE_TENANT_ID="$TENANT_ID" \
      SMOKE_REQUIRE_ORCID="${SMOKE_REQUIRE_ORCID:-}" \
      SMOKE_REQUIRE_AI_RESPONSE="${SMOKE_REQUIRE_AI_RESPONSE:-1}" \
      SMOKE_MEDIA_BASE64="${SMOKE_MEDIA_BASE64:-}" \
      SMOKE_MEDIA_FILE="${SMOKE_MEDIA_FILE:-}" \
      SMOKE_MEDIA_MIMETYPE="${SMOKE_MEDIA_MIMETYPE:-}" \
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

  if [ -n "${EXPECTED_BOT_REGEX:-}" ] || [ -n "${FORBIDDEN_BOT_REGEX:-}" ]; then
    echo ""
    echo "[scenario] bot text gate"
    [ -f "$EVIDENCE_DIR/poll.json" ] || { echo "ERRO: poll.json ausente." >&2; exit 1; }
    last_ai="$(jq -r '[.mensagens[]? | select(.message.type=="ai")][-1].message.content // ""' "$EVIDENCE_DIR/poll.json")"
    if [ -n "${EXPECTED_BOT_REGEX:-}" ] && ! printf '%s' "$last_ai" | grep -Eiq "$EXPECTED_BOT_REGEX"; then
      echo "ERRO: resposta AI nao contem padrao esperado: $EXPECTED_BOT_REGEX" >&2
      printf '%s\n' "$last_ai" >&2
      exit 1
    fi
    if [ -n "${FORBIDDEN_BOT_REGEX:-}" ] && printf '%s' "$last_ai" | grep -Eiq "$FORBIDDEN_BOT_REGEX"; then
      echo "ERRO: resposta AI contem padrao proibido: $FORBIDDEN_BOT_REGEX" >&2
      printf '%s\n' "$last_ai" >&2
      exit 1
    fi
    {
      printf 'expected_bot_regex: %s\n' "${EXPECTED_BOT_REGEX:-"(none)"}"
      printf 'forbidden_bot_regex: %s\n' "${FORBIDDEN_BOT_REGEX:-"(none)"}"
      printf 'status: ok\n'
    } | tee "$EVIDENCE_DIR/scenario-bot-text.txt"
  fi

  wait_side_effect_gates

  if [ -n "${EXPECTED_TAIL_REGEX:-}" ] || [ -n "${FORBIDDEN_TAIL_REGEX:-}" ]; then
    echo ""
    echo "[scenario] tail text gate"
    [ -f "$EVIDENCE_DIR/tail-excerpt.log" ] || { echo "ERRO: tail-excerpt.log ausente." >&2; exit 1; }
    if [ -n "${EXPECTED_TAIL_REGEX:-}" ] && ! grep -Eiq "$EXPECTED_TAIL_REGEX" "$EVIDENCE_DIR/tail-excerpt.log"; then
      echo "ERRO: tail nao contem padrao esperado: $EXPECTED_TAIL_REGEX" >&2
      exit 1
    fi
    if [ -n "${FORBIDDEN_TAIL_REGEX:-}" ] && grep -Eiq "$FORBIDDEN_TAIL_REGEX" "$EVIDENCE_DIR/tail-excerpt.log"; then
      echo "ERRO: tail contem padrao proibido: $FORBIDDEN_TAIL_REGEX" >&2
      exit 1
    fi
    {
      printf 'expected_tail_regex: %s\n' "${EXPECTED_TAIL_REGEX:-"(none)"}"
      printf 'forbidden_tail_regex: %s\n' "${FORBIDDEN_TAIL_REGEX:-"(none)"}"
      printf 'status: ok\n'
    } | tee "$EVIDENCE_DIR/scenario-tail-text.txt"
  fi

  if [ -n "${EXPECTED_POLL_JQ_TRUE:-}" ]; then
    echo ""
    echo "[scenario] poll jq gate"
    [ -f "$EVIDENCE_DIR/poll.json" ] || { echo "ERRO: poll.json ausente." >&2; exit 1; }
    if ! jq -e "$EXPECTED_POLL_JQ_TRUE" "$EVIDENCE_DIR/poll.json" >/dev/null; then
      echo "ERRO: poll.json nao satisfaz EXPECTED_POLL_JQ_TRUE" >&2
      echo "$EXPECTED_POLL_JQ_TRUE" >&2
      jq . "$EVIDENCE_DIR/poll.json" >&2
      exit 1
    fi
    {
      printf 'expected_poll_jq_true: %s\n' "$EXPECTED_POLL_JQ_TRUE"
      printf 'status: ok\n'
    } | tee "$EVIDENCE_DIR/scenario-poll-jq.txt"
  fi

  if [ -n "${EXPECTED_AGENT_LOG_JQ_TRUE:-}" ]; then
    echo ""
    echo "[scenario] agent log jq gate"
    deadline=$((SECONDS + EXPECTED_AGENT_LOG_TIMEOUT_SECONDS))
    agent_log_ok=0
    while true; do
      supa_get_agent_turn_logs_since_run | tee "$EVIDENCE_DIR/agent-turn-logs.json" >/dev/null
      if jq -e "$EXPECTED_AGENT_LOG_JQ_TRUE" "$EVIDENCE_DIR/agent-turn-logs.json" >/dev/null; then
        agent_log_ok=1
        break
      fi
      [ "$SECONDS" -ge "$deadline" ] && break
      sleep 2
    done
    if [ "$agent_log_ok" != "1" ]; then
      echo "ERRO: agent-turn-logs.json nao satisfaz EXPECTED_AGENT_LOG_JQ_TRUE" >&2
      echo "$EXPECTED_AGENT_LOG_JQ_TRUE" >&2
      jq . "$EVIDENCE_DIR/agent-turn-logs.json" >&2
      exit 1
    fi
    {
      printf 'expected_agent_log_jq_true: %s\n' "$EXPECTED_AGENT_LOG_JQ_TRUE"
      printf 'status: ok\n'
    } | tee "$EVIDENCE_DIR/scenario-agent-log-jq.txt"
    bash scripts/smoke/render-report.sh "$EVIDENCE_DIR" | tee -a "$EVIDENCE_DIR/report-render.txt"
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
