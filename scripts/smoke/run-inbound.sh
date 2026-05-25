#!/usr/bin/env bash
# scripts/smoke/run-inbound.sh
# Processo padrao de smoke inbound com monitoramento completo:
# tail CF, correlation id, snapshot before/after, polling e evidencias.
#
# Uso:
#   bash scripts/smoke/run-inbound.sh "mensagem"
#   bash scripts/smoke/run-inbound.sh "mensagem" 5521970789797
#   BASE_URL=https://inkflowbrasil.com EXPECTED_STATE=aguardando_tatuador \
#     bash scripts/smoke/run-inbound.sh $'pode seguir sem email\nquanto tempo demora?'

set -euo pipefail
cd "$(dirname "$0")/../.."

TEXT="${1:?uso: run-inbound.sh \"mensagem\" [telefone]}"
PHONE="${2:-5521970789797}"
BASE_URL="${BASE_URL:-http://localhost:8788}"
EXPECTED_STATE="${EXPECTED_STATE:-}"
if [[ ",${EXPECTED_STATE}," == *",aguardando_tatuador,"* ]] && [ -z "${SMOKE_REQUIRE_ORCID:-}" ]; then
  export SMOKE_REQUIRE_ORCID=1
fi
RUN_ID="${SMOKE_RUN_ID:-smoke-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM}"
EVIDENCE_ROOT="${SMOKE_EVIDENCE_ROOT:-.smoke-evidence}"
EVIDENCE_DIR="${EVIDENCE_ROOT}/${RUN_ID}"
TAIL_LOG="${SMOKE_TAIL_LOG:-/tmp/inkflow-smoke-tail.log}"
SINCE_ISO="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

mkdir -p "$EVIDENCE_DIR"

is_local_base() {
  [[ "$BASE_URL" =~ ^https?://(localhost|127\.0\.0\.1)(:|/|$) ]]
}

write_summary() {
  local status="$1"
  cat > "$EVIDENCE_DIR/summary.md" <<EOF
# Smoke Evidence

- status: ${status}
- run_id: ${RUN_ID}
- base_url: ${BASE_URL}
- phone: ${PHONE}
- since: ${SINCE_ISO}
- expected_state: ${EXPECTED_STATE:-"(none)"}
- require_orcid: ${SMOKE_REQUIRE_ORCID:-0}

## Message

\`\`\`text
${TEXT}
\`\`\`

## Files Generated
EOF
  find "$EVIDENCE_DIR" -maxdepth 1 -type f -exec basename {} \; \
    | sort \
    | sed 's/^/- /' >> "$EVIDENCE_DIR/summary.md"
}

capture_tail_excerpt() {
  if [ -f "$TAIL_LOG" ]; then
    tail -200 "$TAIL_LOG" > "$EVIDENCE_DIR/tail-excerpt.log" || true
  else
    printf 'tail log not found: %s\n' "$TAIL_LOG" > "$EVIDENCE_DIR/tail-excerpt.log"
  fi
}

on_exit() {
  status=$?
  capture_tail_excerpt
  if [ "$status" -eq 0 ]; then
    write_summary "pass"
  else
    write_summary "fail"
    echo ""
    echo "Smoke falhou. Evidencias: $EVIDENCE_DIR" >&2
    echo "Tail excerpt:" >&2
    tail -40 "$EVIDENCE_DIR/tail-excerpt.log" >&2 || true
  fi
}
trap on_exit EXIT

command -v jq >/dev/null 2>&1 || { echo "ERRO: jq nao instalado." >&2; exit 1; }

jq -nc \
  --arg run_id "$RUN_ID" \
  --arg base_url "$BASE_URL" \
  --arg phone "$PHONE" \
  --arg text "$TEXT" \
  --arg since "$SINCE_ISO" \
  --arg expected_state "$EXPECTED_STATE" \
  '{run_id:$run_id,base_url:$base_url,phone:$phone,text:$text,since:$since,expected_state:$expected_state}' \
  > "$EVIDENCE_DIR/request.json"

echo "=== Smoke inbound padrao ==="
echo "run_id       : $RUN_ID"
echo "base_url     : $BASE_URL"
echo "phone        : $PHONE"
echo "evidence_dir : $EVIDENCE_DIR"
echo ""

if ! is_local_base; then
  SMOKE_TAIL_LOG="$TAIL_LOG" bash scripts/smoke/tail.sh | tee "$EVIDENCE_DIR/tail-start.txt"
else
  echo "tail CF pulada: BASE_URL local ($BASE_URL)" | tee "$EVIDENCE_DIR/tail-start.txt"
fi

echo ""
echo "[1/4] Snapshot before"
bash scripts/smoke-verify.sh "$PHONE" 20 | tee "$EVIDENCE_DIR/verify-before.txt"

echo ""
echo "[2/4] Enviando inbound com correlation id"
SMOKE_RUN_ID="$RUN_ID" SMOKE_TAIL_DISABLED=1 BASE_URL="$BASE_URL" bash scripts/smoke-inbound.sh "$TEXT" "$PHONE" \
  | tee "$EVIDENCE_DIR/inbound-response.txt"

echo ""
echo "[3/4] Polling de processamento"
bash scripts/smoke/poll.sh "$PHONE" "$SINCE_ISO" "$EXPECTED_STATE" \
  | tee "$EVIDENCE_DIR/poll.json"

echo ""
echo "[4/4] Snapshot after"
bash scripts/smoke-verify.sh "$PHONE" 30 | tee "$EVIDENCE_DIR/verify-after.txt"

capture_tail_excerpt
write_summary "pass"

echo ""
echo "Smoke concluido. Evidencias: $EVIDENCE_DIR"
