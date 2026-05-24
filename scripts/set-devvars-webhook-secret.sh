#!/usr/bin/env bash
# scripts/set-devvars-webhook-secret.sh
# Copia WEBHOOK_SECRET de .env.production -> .dev.vars (idempotente, NAO-interativo).
#
# Pra que serve:
#   O smoke HTTP chama POST /api/whatsapp/inbound, que valida o header
#   `x-webhook-secret` contra env.WEBHOOK_SECRET (functions/api/whatsapp/inbound.js:19).
#   Em `wrangler pages dev` esse env vem do .dev.vars. Sem a key la, o handler
#   corta em 401 (!env.WEBHOOK_SECRET) e o smoke nunca entra no pipeline.
#
# Seguro: nunca imprime o valor do secret. So mascara + confere alinhamento por hash.
# Append/replace com backup. Pode rodar quantas vezes quiser.
#
# Uso (da raiz do repo, ou de qualquer lugar):
#   bash scripts/set-devvars-webhook-secret.sh

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_PROD=".env.production"
DEVVARS=".dev.vars"

[ -f "$ENV_PROD" ] || { echo "ERRO: $ENV_PROD nao encontrado (rode da raiz do repo)." >&2; exit 1; }
[ -f "$DEVVARS" ]  || { echo "ERRO: $DEVVARS nao existe — crie primeiro (OPENAI_API_KEY etc)." >&2; exit 1; }

# 1. Extrai valor de prod (tudo apos o primeiro =), tira aspas e CR de CRLF
VAL="$(grep -E '^WEBHOOK_SECRET=' "$ENV_PROD" | head -1 | cut -d= -f2-)"
VAL="${VAL%$'\r'}"; VAL="${VAL%\"}"; VAL="${VAL#\"}"
[ -n "$VAL" ] || { echo "ERRO: WEBHOOK_SECRET vazio/ausente em $ENV_PROD." >&2; exit 1; }

# 2. Ja esta igual no .dev.vars? Compara por hash, sem imprimir valores.
CUR="$(grep -E '^WEBHOOK_SECRET=' "$DEVVARS" | head -1 | cut -d= -f2- || true)"
CUR="${CUR%$'\r'}"; CUR="${CUR%\"}"; CUR="${CUR#\"}"
if [ -n "$CUR" ] && [ "$CUR" = "$VAL" ]; then
  echo "[skip] WEBHOOK_SECRET ja presente e identico ao de prod em $DEVVARS."
  echo "  -> ${VAL:0:3}... (${#VAL} chars)"
  exit 0
fi

# 3. Backup
TS=$(date +%Y%m%d-%H%M%S)
cp "$DEVVARS" "${DEVVARS}.bak.${TS}"
echo "Backup: ${DEVVARS}.bak.${TS}"

# 4. Remove linha antiga (se houver) e regrava com a nova — evita escaping de sed
TMP="$(mktemp)"
grep -v '^WEBHOOK_SECRET=' "$DEVVARS" > "$TMP" || true
# garante newline final antes do append
if [ -s "$TMP" ] && [ "$(tail -c 1 "$TMP")" != "" ]; then echo "" >> "$TMP"; fi
printf 'WEBHOOK_SECRET=%s\n' "$VAL" >> "$TMP"
mv "$TMP" "$DEVVARS"

if [ -n "$CUR" ]; then
  echo "✓ WEBHOOK_SECRET atualizado em $DEVVARS (valor antigo divergia)."
else
  echo "✓ WEBHOOK_SECRET adicionado em $DEVVARS."
fi
echo "  -> ${VAL:0:3}... (${#VAL} chars)"
