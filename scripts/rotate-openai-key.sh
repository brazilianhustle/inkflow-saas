#!/bin/bash
# Rotaciona OPENAI_API_KEY: keychain local + CF Pages prod.
# Uso: bash scripts/rotate-openai-key.sh
# (apos rodar, abrir nova shell OU rodar o export que ele imprime no fim)

set -e

echo ""
echo "=== Rotacao OPENAI_API_KEY ==="
echo ""

read -rs -p "Cola a nova key e Enter: " NEW_KEY
echo ""

if [ -z "$NEW_KEY" ]; then
  echo "ERRO: key vazia. Aborta."
  exit 1
fi

if [ ${#NEW_KEY} -lt 50 ]; then
  echo "ERRO: key tem ${#NEW_KEY} chars (minimo esperado 50). Aborta."
  exit 1
fi

echo "Key recebida (${#NEW_KEY} chars). Validando contra OpenAI antes de salvar..."
HTTP_CHECK=$(curl -s -o /dev/null -w "%{http_code}" https://api.openai.com/v1/models -H "Authorization: Bearer $NEW_KEY")
if [ "$HTTP_CHECK" != "200" ]; then
  echo "ERRO: OpenAI retornou HTTP $HTTP_CHECK pra essa key. Aborta — nada foi alterado."
  exit 1
fi
echo "OK (HTTP 200)."
echo ""

echo "[1/3] Atualizando keychain local..."
security delete-generic-password -a "$USER" -s "OPENAI_API_KEY" >/dev/null 2>&1 || true
security add-generic-password -a "$USER" -s "OPENAI_API_KEY" -w "$NEW_KEY" >/dev/null
echo "  OK."

echo "[2/3] Confirmando keychain..."
KC_KEY=$(security find-generic-password -a "$USER" -s "OPENAI_API_KEY" -w)
if [ "$KC_KEY" != "$NEW_KEY" ]; then
  echo "ERRO: keychain nao casa com input. Aborta antes de tocar prod."
  exit 1
fi
echo "  OK."

echo "[3/3] Atualizando CF Pages prod (inkflow-saas)..."
printf '%s' "$NEW_KEY" | npx --yes wrangler pages secret put OPENAI_API_KEY --project-name=inkflow-saas
echo ""

echo "=== Done ==="
echo ""
echo "Pra usar nesta shell ja, roda:"
echo "  export OPENAI_API_KEY=\$(security find-generic-password -a \"\$USER\" -s \"OPENAI_API_KEY\" -w)"
echo ""
echo "Ou abre nova shell."

unset NEW_KEY
