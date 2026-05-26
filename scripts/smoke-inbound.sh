#!/usr/bin/env bash
# scripts/smoke-inbound.sh
# Simula "cliente mandando mensagem" via POST /api/whatsapp/inbound (HTTP),
# autenticando com o WEBHOOK_SECRET lido do MESMO .dev.vars que o wrangler usa
# -> caller e servidor nunca desalinham.
#
# Pre-requisitos:
#   - tail CF ativa automaticamente para smoke remoto
#   - `npx wrangler pages dev` rodando para smoke local (default http://localhost:8788)
#   - WEBHOOK_SECRET em .dev.vars  (rode scripts/set-devvars-webhook-secret.sh)
#   - jq instalado
#
# Uso:
#   bash scripts/smoke-inbound.sh "oi, quero fazer uma tattoo"
#   bash scripts/smoke-inbound.sh "texto" 5521970789797
#   BASE_URL=http://localhost:8788 INSTANCE=inkflow_test_sub4 \
#     bash scripts/smoke-inbound.sh "texto"
#
# Midia opcional:
#   SMOKE_MEDIA_FILE=path/to/image.png bash scripts/smoke-inbound.sh "caption"
#   SMOKE_MEDIA_BASE64=... SMOKE_MEDIA_MIMETYPE=image/png bash scripts/smoke-inbound.sh "caption"

set -euo pipefail
cd "$(dirname "$0")/.."

TEXT="${1-}"
PHONE="${2:-5521970789797}"
BASE_URL="${BASE_URL:-http://localhost:8788}"
INSTANCE="${INSTANCE:-inkflow_test_sub4}"   # evo_instance do tenant "InkFlow Sub4 Test"
SMOKE_MEDIA_MIMETYPE="${SMOKE_MEDIA_MIMETYPE:-image/png}"

command -v jq >/dev/null 2>&1 || { echo "ERRO: jq nao instalado." >&2; exit 1; }
[ -f .dev.vars ] || { echo "ERRO: .dev.vars nao existe (rode da raiz do repo)." >&2; exit 1; }
[ -n "$TEXT" ] || [ -n "${SMOKE_MEDIA_FILE:-}" ] || [ -n "${SMOKE_MEDIA_BASE64:-}" ] || {
  echo 'ERRO: smoke-inbound.sh exige mensagem ou midia.' >&2
  exit 1
}

if ! [[ "$BASE_URL" =~ ^https?://(localhost|127\.0\.0\.1)(:|/|$) ]]; then
  bash scripts/smoke/tail.sh
fi

# Le o secret do mesmo arquivo que o `wrangler pages dev` carrega.
SECRET="$(grep -E '^WEBHOOK_SECRET=' .dev.vars | head -1 | cut -d= -f2- | tr -d '"\r')"
[ -n "$SECRET" ] || { echo "ERRO: WEBHOOK_SECRET ausente no .dev.vars — rode scripts/set-devvars-webhook-secret.sh" >&2; exit 1; }

RUN_ID="${SMOKE_RUN_ID:-smoke-$(date +%s)-$RANDOM}"
MSG_ID="${RUN_ID}-${RANDOM}"
MEDIA_BASE64="${SMOKE_MEDIA_BASE64:-}"
if [ -z "$MEDIA_BASE64" ] && [ -n "${SMOKE_MEDIA_FILE:-}" ]; then
  [ -f "$SMOKE_MEDIA_FILE" ] || { echo "ERRO: SMOKE_MEDIA_FILE nao encontrado: $SMOKE_MEDIA_FILE" >&2; exit 1; }
  MEDIA_BASE64="$(base64 < "$SMOKE_MEDIA_FILE" | tr -d '\n\r')"
fi

# Body no shape Evolution v2 esperado por parseEvolutionPayload:
#   event=messages.upsert, instance=<evo_instance>, data.key.{id,remoteJid,fromMe},
#   texto puro: data.message.conversation = texto
#   imagem: data.message.imageMessage.caption + data.message.base64
if [ -n "$MEDIA_BASE64" ]; then
  BODY="$(jq -nc \
    --arg inst "$INSTANCE" \
    --arg id "$MSG_ID" \
    --arg jid "${PHONE}@s.whatsapp.net" \
    --arg txt "$TEXT" \
    --arg run "$RUN_ID" \
    --arg b64 "$MEDIA_BASE64" \
    --arg mt "$SMOKE_MEDIA_MIMETYPE" \
    '{event:"messages.upsert", instance:$inst,
      data:{ key:{id:$id, remoteJid:$jid, fromMe:false},
             pushName:("Smoke Test " + $run),
             message:{imageMessage:{caption:$txt,mimetype:$mt},base64:$b64} }}')"
else
  BODY="$(jq -nc \
    --arg inst "$INSTANCE" \
    --arg id "$MSG_ID" \
    --arg jid "${PHONE}@s.whatsapp.net" \
    --arg txt "$TEXT" \
    --arg run "$RUN_ID" \
    '{event:"messages.upsert", instance:$inst,
      data:{ key:{id:$id, remoteJid:$jid, fromMe:false},
             pushName:("Smoke Test " + $run),
             message:{conversation:$txt} }}')"
fi

if [ -n "$MEDIA_BASE64" ]; then
  echo "POST ${BASE_URL}/api/whatsapp/inbound  (instance=${INSTANCE} phone=${PHONE} run_id=${RUN_ID} msg_id=${MSG_ID} media=${SMOKE_MEDIA_MIMETYPE})"
else
  echo "POST ${BASE_URL}/api/whatsapp/inbound  (instance=${INSTANCE} phone=${PHONE} run_id=${RUN_ID} msg_id=${MSG_ID})"
fi
curl -sS -X POST "${BASE_URL}/api/whatsapp/inbound" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: ${SECRET}" \
  --data "${BODY}" -w "\nHTTP %{http_code}\n"
