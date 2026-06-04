#!/usr/bin/env bash
# Observa um teste manual de WhatsApp real para o Premium Runtime Parity Gate.
# Nao envia mensagens. Rode, envie as bolhas manualmente no WhatsApp e aguarde o PASS/FAIL.

set -euo pipefail
cd "$(dirname "$0")/../.."

command -v jq >/dev/null 2>&1 || { echo "ERRO: jq nao instalado." >&2; exit 1; }

TENANT_ID="${SMOKE_TENANT_ID:-db686ef2-ca42-43e4-a831-808984d8d6c6}"
PHONE="${SMOKE_SENDER_PHONE:-5521970789797}"
EXPECTED_STATE="${EXPECTED_STATE:-coletando_tattoo}"
MIN_BUBBLES="${MIN_BUBBLES:-2}"
TIMEOUT_SECONDS="${SMOKE_POLL_TIMEOUT_SECONDS:-120}"
INTERVAL_SECONDS="${SMOKE_POLL_INTERVAL_SECONDS:-3}"
EXPECTED_AGENT_LOG_TIMEOUT_SECONDS="${EXPECTED_AGENT_LOG_TIMEOUT_SECONDS:-30}"
SMOKE_SUPABASE_CONNECT_TIMEOUT_SECONDS="${SMOKE_SUPABASE_CONNECT_TIMEOUT_SECONDS:-5}"
SMOKE_SUPABASE_MAX_TIME_SECONDS="${SMOKE_SUPABASE_MAX_TIME_SECONDS:-20}"
EVIDENCE_ROOT="${SMOKE_EVIDENCE_ROOT:-.smoke-evidence}"
RUN_ID="${SMOKE_RUN_ID:-manual-premium-runtime-gate-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM}"
RUN_STARTED_ISO="${RUN_STARTED_ISO:-$(date -u '+%Y-%m-%dT%H:%M:%SZ')}"
EVIDENCE_DIR="${EVIDENCE_ROOT}/${RUN_ID}"
SID="${TENANT_ID}_${PHONE}"

[[ "$PHONE" =~ ^[0-9]{10,15}$ ]] || { echo "ERRO: PHONE invalido: $PHONE" >&2; exit 1; }
[[ "$MIN_BUBBLES" =~ ^[0-9]+$ ]] && [ "$MIN_BUBBLES" -ge 2 ] || {
  echo "ERRO: MIN_BUBBLES deve ser >= 2." >&2
  exit 1
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

supa_get() {
  local path="$1"
  supabase_curl "${SUPABASE_URL}/rest/v1/${path}" \
    -H "apikey: $SUPA_KEY" \
    -H "Authorization: Bearer $SUPA_KEY"
}

supa_get_agent_turn_logs() {
  supabase_curl --get "${SUPABASE_URL}/rest/v1/agent_turn_logs" \
    --data-urlencode "tenant_id=eq.${TENANT_ID}" \
    --data-urlencode "created_at=gte.${RUN_STARTED_ISO}" \
    --data-urlencode "select=created_at,agent_name,client_input_text,context_metadata,llm_output_parsed" \
    --data-urlencode "order=created_at.desc" \
    --data-urlencode "limit=30" \
    -H "apikey: $SUPA_KEY" \
    -H "Authorization: Bearer $SUPA_KEY"
}

write_summary() {
  local status="$1"
  cat > "$EVIDENCE_DIR/summary.md" <<EOF
# Premium Runtime Parity Gate - Manual WhatsApp Observer

- status: ${status}
- run_id: ${RUN_ID}
- started_at: ${RUN_STARTED_ISO}
- tenant_id: ${TENANT_ID}
- phone: ${PHONE}
- expected_state: ${EXPECTED_STATE}
- min_bubbles: ${MIN_BUBBLES}
- sends_whatsapp: no

## Manual Step

Send ${MIN_BUBBLES}+ WhatsApp bubbles from the configured phone after \`started_at\`.
EOF
}

write_poll_snapshot() {
  local conv msgs msgs_snapshot
  conv="$(supa_get "conversas?tenant_id=eq.${TENANT_ID}&telefone=eq.${PHONE}&select=estado_agente,orcid,updated_at,dados_coletados,dados_cadastro&limit=1")"
  msgs="$(supa_get "conversa_mensagens?session_id=eq.${SID}&created_at=gte.${RUN_STARTED_ISO}&select=created_at,status,message&order=created_at.asc")"
  msgs_snapshot="$(printf '%s' "$msgs" | jq '[.[] | del(.message.media_base64)]')"
  jq -nc --argjson conv "$conv" --argjson msgs "$msgs_snapshot" '{conversas:$conv,mensagens:$msgs}' \
    > "$EVIDENCE_DIR/poll.json"
}

poll_runtime_gate() {
  local deadline state human_count ai_count failed_count ai_after_last_human_count
  deadline=$((SECONDS + TIMEOUT_SECONDS))
  while [ "$SECONDS" -lt "$deadline" ]; do
    write_poll_snapshot
    state="$(jq -r '.conversas[0].estado_agente // ""' "$EVIDENCE_DIR/poll.json")"
    human_count="$(jq '[.mensagens[]? | select(.message.type=="human")] | length' "$EVIDENCE_DIR/poll.json")"
    ai_count="$(jq '[.mensagens[]? | select(.message.type=="ai")] | length' "$EVIDENCE_DIR/poll.json")"
    failed_count="$(jq '[.mensagens[]? | select(.status=="failed")] | length' "$EVIDENCE_DIR/poll.json")"
    ai_after_last_human_count="$(jq '
      ([.mensagens[]? | select(.message.type=="human") | .created_at] | max // "") as $human_at
      | if $human_at == "" then 0 else
          [.mensagens[]? | select(.message.type=="ai" and .created_at > $human_at)] | length
        end
    ' "$EVIDENCE_DIR/poll.json")"

    if [ "$failed_count" != "0" ]; then
      echo "ERRO: mensagem failed detectada." >&2
      jq . "$EVIDENCE_DIR/poll.json" >&2
      exit 1
    fi

    if [ "$human_count" -ge "$MIN_BUBBLES" ] && [ "$ai_after_last_human_count" -ge 1 ]; then
      break
    fi
    printf 'observando: human=%s ai=%s ai_after_last_human=%s state=%s\n' \
      "$human_count" "$ai_count" "$ai_after_last_human_count" "${state:-none}" >&2
    sleep "$INTERVAL_SECONDS"
  done

  jq -e --arg expected_state "$EXPECTED_STATE" --argjson min_bubbles "$MIN_BUBBLES" '
    ([.mensagens[]? | select(.message.type=="human")] | length) >= $min_bubbles
    and ([.mensagens[]? | select(.message.type=="ai")] | length) == 1
    and (.conversas[0].estado_agente == $expected_state)
  ' "$EVIDENCE_DIR/poll.json" >/dev/null || {
    echo "ERRO: poll.json nao prova burst manual agrupado em uma unica resposta AI." >&2
    jq . "$EVIDENCE_DIR/poll.json" >&2
    exit 1
  }
}

poll_agent_logs_gate() {
  local deadline agent_log_ok jq_filter
  jq_filter='.[] | select(
    .agent_name == "conversation_router"
    and .context_metadata.session_queue_observed == true
    and .context_metadata.session_queue_version == "session_queue_v1"
    and .context_metadata.session_queue_batch_message_count >= '"$MIN_BUBBLES"'
    and .context_metadata.session_queue_silence_wait_ms >= 10000
  )'

  deadline=$((SECONDS + EXPECTED_AGENT_LOG_TIMEOUT_SECONDS))
  agent_log_ok=0
  while true; do
    supa_get_agent_turn_logs | tee "$EVIDENCE_DIR/agent-turn-logs.json" >/dev/null
    if jq -e "$jq_filter" "$EVIDENCE_DIR/agent-turn-logs.json" >/dev/null; then
      agent_log_ok=1
      break
    fi
    [ "$SECONDS" -ge "$deadline" ] && break
    sleep 2
  done

  if [ "$agent_log_ok" != "1" ]; then
    echo "ERRO: agent-turn-logs.json nao prova SessionQueue no runtime real." >&2
    echo "$jq_filter" > "$EVIDENCE_DIR/scenario-agent-log-jq.txt"
    jq . "$EVIDENCE_DIR/agent-turn-logs.json" >&2
    exit 1
  fi
  {
    printf 'expected_agent_log_jq_true: %s\n' "$jq_filter"
    printf 'status: ok\n'
  } > "$EVIDENCE_DIR/scenario-agent-log-jq.txt"
}

mkdir -p "$EVIDENCE_DIR"
load_devvars
write_summary "running"

cat >&2 <<EOF
observer: started_at=${RUN_STARTED_ISO}
observer: evidence_dir=${EVIDENCE_DIR}
observer: envie agora ${MIN_BUBBLES}+ bolhas no WhatsApp para phone=${PHONE}; este script nao envia mensagens.
EOF

poll_runtime_gate
poll_agent_logs_gate
bash scripts/smoke/render-report.sh "$EVIDENCE_DIR" > "$EVIDENCE_DIR/report-render.txt"
write_summary "pass"

echo "PASS: Premium Runtime Parity Gate manual observado em ${EVIDENCE_DIR}"
