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

set -euo pipefail
cd "$(dirname "$0")/.."

TEXT="${1:?uso: smoke-inbound.sh \"mensagem\" [telefone]}"
PHONE="${2:-5521970789797}"
BASE_URL="${BASE_URL:-http://localhost:8788}"
INSTANCE="${INSTANCE:-inkflow_test_sub4}"   # evo_instance do tenant "InkFlow Sub4 Test"

command -v jq >/dev/null 2>&1 || { echo "ERRO: jq nao instalado." >&2; exit 1; }
[ -f .dev.vars ] || { echo "ERRO: .dev.vars nao existe (rode da raiz do repo)." >&2; exit 1; }

if ! [[ "$BASE_URL" =~ ^https?://(localhost|127\.0\.0\.1)(:|/|$) ]]; then
  bash scripts/smoke/tail.sh
fi

# Le o secret do mesmo arquivo que o `wrangler pages dev` carrega.
SECRET="$(grep -E '^WEBHOOK_SECRET=' .dev.vars | head -1 | cut -d= -f2- | tr -d '"\r')"
[ -n "$SECRET" ] || { echo "ERRO: WEBHOOK_SECRET ausente no .dev.vars — rode scripts/set-devvars-webhook-secret.sh" >&2; exit 1; }

RUN_ID="${SMOKE_RUN_ID:-smoke-$(date +%s)-$RANDOM}"
MSG_ID="${RUN_ID}-${RANDOM}"

# Body no shape Evolution v2 esperado por parseEvolutionPayload:
#   event=messages.upsert, instance=<evo_instance>, data.key.{id,remoteJid,fromMe},
#   data.message.conversation = texto
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

echo "POST ${BASE_URL}/api/whatsapp/inbound  (instance=${INSTANCE} phone=${PHONE} run_id=${RUN_ID} msg_id=${MSG_ID})"
curl -sS -X POST "${BASE_URL}/api/whatsapp/inbound" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: ${SECRET}" \
  --data "${BODY}" -w "\nHTTP %{http_code}\n"
