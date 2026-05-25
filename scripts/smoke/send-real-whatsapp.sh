#!/usr/bin/env bash
# scripts/smoke/send-real-whatsapp.sh
# Envia uma mensagem real de WhatsApp pela Evolution API usando a instancia
# remetente configurada para QA. Default: instancia central.

set -euo pipefail
cd "$(dirname "$0")/../.."

TEXT="${1:?uso: send-real-whatsapp.sh \"mensagem\" <bot_number>}"
BOT_NUMBER="${2:-${SMOKE_BOT_NUMBER:-}}"

DEVVARS=".dev.vars"
[ -f "$DEVVARS" ] || { echo "ERRO: $DEVVARS nao existe." >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "ERRO: jq nao instalado." >&2; exit 1; }

while IFS='=' read -r key value; do
  [[ "$key" =~ ^[A-Z_]+$ ]] || continue
  value="${value%\"}"; value="${value#\"}"
  export "$key=$value"
done < "$DEVVARS"

EVO_BASE="${SMOKE_EVO_BASE_URL:-${EVO_BASE_URL:-https://evo.inkflowbrasil.com}}"
SENDER_INSTANCE="${SMOKE_EVO_SENDER_INSTANCE:-${EVO_CENTRAL_INSTANCE:-central}}"
SENDER_APIKEY="${SMOKE_EVO_SENDER_APIKEY:-${EVO_CENTRAL_APIKEY:-${EVO_GLOBAL_KEY:-}}}"
STATE_APIKEY="${SMOKE_EVO_STATE_APIKEY:-${EVO_GLOBAL_KEY:-$SENDER_APIKEY}}"

[ -n "$BOT_NUMBER" ] || { echo "ERRO: informe SMOKE_BOT_NUMBER ou passe <bot_number>." >&2; exit 1; }
[[ "$BOT_NUMBER" =~ ^[0-9]{10,15}$ ]] || { echo "ERRO: bot_number invalido: $BOT_NUMBER" >&2; exit 1; }
[ -n "$SENDER_INSTANCE" ] || { echo "ERRO: instancia remetente ausente." >&2; exit 1; }
[ -n "$SENDER_APIKEY" ] || { echo "ERRO: apikey da instancia remetente ausente." >&2; exit 1; }

state_json="$(
  curl -sS "$EVO_BASE/instance/connectionState/$SENDER_INSTANCE" \
    -H "apikey: $STATE_APIKEY"
)"
state="$(printf '%s' "$state_json" | jq -r '.instance.state // .state // .connectionState // ""')"
if [ "$state" != "open" ]; then
  echo "ERRO: instancia remetente nao esta open: instance=$SENDER_INSTANCE state=${state:-unknown}" >&2
  printf '%s\n' "$state_json" | jq . >&2
  exit 1
fi

body="$(jq -nc --arg number "$BOT_NUMBER" --arg text "$TEXT" '{number:$number,text:$text}')"

echo "POST $EVO_BASE/message/sendText/$SENDER_INSTANCE  (to=$BOT_NUMBER)"
tmp="$(mktemp)"
status="$(
  curl -sS -o "$tmp" -w "%{http_code}" \
    -X POST "$EVO_BASE/message/sendText/$SENDER_INSTANCE" \
    -H "apikey: $SENDER_APIKEY" \
    -H "Content-Type: application/json" \
    --data "$body"
)"

if [[ ! "$status" =~ ^2 ]]; then
  echo "ERRO: Evolution sendText falhou HTTP $status" >&2
  cat "$tmp" >&2
  rm -f "$tmp"
  exit 1
fi

response_raw="$(cat "$tmp")"
jq -nc \
  --arg status "$status" \
  --arg instance "$SENDER_INSTANCE" \
  --arg to "$BOT_NUMBER" \
  --arg response_raw "$response_raw" \
  '{ok:true,http_status:$status,instance:$instance,to:$to,response_raw:$response_raw}'
rm -f "$tmp"
