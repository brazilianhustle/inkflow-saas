#!/usr/bin/env bash
# scripts/smoke/run-real-whatsapp.sh
# Smoke WhatsApp real: envia pela Evolution usando a instancia central, aguarda
# o webhook real do bot processar, e salva evidencias com tail + Supabase.

set -euo pipefail
cd "$(dirname "$0")/../.."

TEXT="${1:?uso: run-real-whatsapp.sh \"mensagem\" [sender_phone] [bot_number]}"
SENDER_PHONE="${2:-${SMOKE_SENDER_PHONE:-5521970789797}}"
BOT_NUMBER="${3:-${SMOKE_BOT_NUMBER:-}}"
BASE_URL="${BASE_URL:-https://inkflowbrasil.com}"
EXPECTED_STATE="${EXPECTED_STATE:-}"
if [[ ",${EXPECTED_STATE}," == *",aguardando_tatuador,"* ]] && [ -z "${SMOKE_REQUIRE_ORCID:-}" ]; then
  export SMOKE_REQUIRE_ORCID=1
fi

RUN_ID="${SMOKE_RUN_ID:-smoke-wa-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM}"
EVIDENCE_ROOT="${SMOKE_EVIDENCE_ROOT:-.smoke-evidence}"
EVIDENCE_DIR="${EVIDENCE_ROOT}/${RUN_ID}"
TAIL_LOG="${SMOKE_TAIL_LOG:-/tmp/inkflow-smoke-tail.log}"
SINCE_ISO="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

[ -n "$BOT_NUMBER" ] || { echo "ERRO: informe SMOKE_BOT_NUMBER ou passe <bot_number>." >&2; exit 1; }
[[ "$SENDER_PHONE" =~ ^[0-9]{10,15}$ ]] || { echo "ERRO: sender_phone invalido: $SENDER_PHONE" >&2; exit 1; }
[[ "$BOT_NUMBER" =~ ^[0-9]{10,15}$ ]] || { echo "ERRO: bot_number invalido: $BOT_NUMBER" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "ERRO: jq nao instalado." >&2; exit 1; }

mkdir -p "$EVIDENCE_DIR"

write_summary() {
  local status="$1"
  cat > "$EVIDENCE_DIR/summary.md" <<EOF
# Real WhatsApp Smoke Evidence

- status: ${status}
- run_id: ${RUN_ID}
- base_url: ${BASE_URL}
- sender_phone: ${SENDER_PHONE}
- bot_number: ${BOT_NUMBER}
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
    tail -240 "$TAIL_LOG" > "$EVIDENCE_DIR/tail-excerpt.log" || true
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
    echo "Smoke WhatsApp real falhou. Evidencias: $EVIDENCE_DIR" >&2
    echo "Tail excerpt:" >&2
    tail -40 "$EVIDENCE_DIR/tail-excerpt.log" >&2 || true
  fi
}
trap on_exit EXIT

jq -nc \
  --arg run_id "$RUN_ID" \
  --arg base_url "$BASE_URL" \
  --arg sender_phone "$SENDER_PHONE" \
  --arg bot_number "$BOT_NUMBER" \
  --arg text "$TEXT" \
  --arg since "$SINCE_ISO" \
  --arg expected_state "$EXPECTED_STATE" \
  '{run_id:$run_id,base_url:$base_url,sender_phone:$sender_phone,bot_number:$bot_number,text:$text,since:$since,expected_state:$expected_state}' \
  > "$EVIDENCE_DIR/request.json"

echo "=== Smoke WhatsApp real ==="
echo "run_id       : $RUN_ID"
echo "sender_phone : $SENDER_PHONE"
echo "bot_number   : $BOT_NUMBER"
echo "evidence_dir : $EVIDENCE_DIR"
echo ""

SMOKE_TAIL_LOG="$TAIL_LOG" bash scripts/smoke/tail.sh | tee "$EVIDENCE_DIR/tail-start.txt"

echo ""
echo "[1/4] Snapshot before"
bash scripts/smoke-verify.sh "$SENDER_PHONE" 20 | tee "$EVIDENCE_DIR/verify-before.txt"

echo ""
echo "[2/4] Enviando WhatsApp real via Evolution"
SMOKE_RUN_ID="$RUN_ID" bash scripts/smoke/send-real-whatsapp.sh "$TEXT" "$BOT_NUMBER" \
  | tee "$EVIDENCE_DIR/evolution-send.json"

echo ""
echo "[3/4] Polling de processamento do webhook real"
SMOKE_EXPECT_HUMAN_TEXT="$TEXT" bash scripts/smoke/poll.sh "$SENDER_PHONE" "$SINCE_ISO" "$EXPECTED_STATE" \
  | tee "$EVIDENCE_DIR/poll.json"

echo ""
echo "[4/4] Snapshot after"
bash scripts/smoke-verify.sh "$SENDER_PHONE" 30 | tee "$EVIDENCE_DIR/verify-after.txt"

capture_tail_excerpt
write_summary "pass"

echo ""
echo "Smoke WhatsApp real concluido. Evidencias: $EVIDENCE_DIR"
