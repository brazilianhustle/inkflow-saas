#!/usr/bin/env bash
# Verifica o webhook atual do tenant de teste inkflow_test_sub4 na Evolution API.
# Spec C5: cutover total do n8n.
#
# Uso: definir EVO_BASE_URL e EVO_GLOBAL_KEY no ambiente (ou exportar antes),
#   depois rodar:  ./scripts/check-evo-webhook.sh
set -euo pipefail

: "${EVO_BASE_URL:?defina EVO_BASE_URL}"
: "${EVO_GLOBAL_KEY:?defina EVO_GLOBAL_KEY}"
INSTANCE="${1:-inkflow_test_sub4}"

echo "→ GET ${EVO_BASE_URL}/webhook/find/${INSTANCE}"
curl -sS -H "apikey: ${EVO_GLOBAL_KEY}" \
  "${EVO_BASE_URL}/webhook/find/${INSTANCE}" | python3 -m json.tool
