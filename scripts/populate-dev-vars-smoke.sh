#!/bin/bash
# scripts/populate-dev-vars-smoke.sh
# Popula .dev.vars com secrets necessarios pra Task 14 smoke (Sub-3.2).
# INTERATIVO: pergunta cada secret via read -s (input nao aparece na tela
# nem no historico do shell). Append-only — preserva OPENAI_API_KEY existente.
#
# Uso:
#   bash scripts/populate-dev-vars-smoke.sh
#
# SUPABASE_URL ja cravada (publica, nao e secret).
# AGENT_INTERNAL_BASE_URL nao seteado (helper usa default http://localhost:8788).

set -euo pipefail

DEVVARS="/Users/brazilianhustler/Documents/inkflow-saas/.dev.vars"
SUPA_URL="https://bfzuxxuscyplfoimvomh.supabase.co"

# 0. .dev.vars deve existir
if [ ! -f "$DEVVARS" ]; then
  echo "ERRO: $DEVVARS nao existe. Crie primeiro com OPENAI_API_KEY." >&2
  exit 1
fi

# 0.5 Migracao: renomeia MERCADO_PAGO_ACCESS_TOKEN -> MP_ACCESS_TOKEN
# (codigo das tools usa MP_ACCESS_TOKEN, nao MERCADO_PAGO_ACCESS_TOKEN)
if grep -q '^MERCADO_PAGO_ACCESS_TOKEN=' "$DEVVARS" && ! grep -q '^MP_ACCESS_TOKEN=' "$DEVVARS"; then
  echo "[migracao] Renomeando MERCADO_PAGO_ACCESS_TOKEN -> MP_ACCESS_TOKEN (codigo das tools usa esse nome)"
  TS_PRE=$(date +%Y%m%d-%H%M%S)
  cp "$DEVVARS" "${DEVVARS}.bak.${TS_PRE}-pre-rename"
  sed -i '' 's/^MERCADO_PAGO_ACCESS_TOKEN=/MP_ACCESS_TOKEN=/' "$DEVVARS"
  echo "  Backup pre-rename: ${DEVVARS}.bak.${TS_PRE}-pre-rename"
fi

# 1. Detecta keys ja presentes — vamos pular essas no append
EXISTING_KEYS=$(grep -E '^[A-Z_]+=' "$DEVVARS" | cut -d= -f1 || true)
key_exists() { echo "$EXISTING_KEYS" | grep -qx "$1"; }

echo "=== Populate .dev.vars pra smoke Sub-3.2 ==="
echo "Vou pedir os secrets que faltam. O input nao aparece na tela (read -s)."
echo "Se uma key ja existe em .dev.vars, vou pular automaticamente."
echo ""

# 2. INKFLOW_TOOL_SECRET
if key_exists INKFLOW_TOOL_SECRET; then
  echo "[skip] INKFLOW_TOOL_SECRET ja existe"
  INKFLOW_TOOL_SECRET=""
else
  printf "Cole INKFLOW_TOOL_SECRET e ENTER: "
  read -rs INKFLOW_TOOL_SECRET
  echo ""
  if [ -z "$INKFLOW_TOOL_SECRET" ]; then
    echo "ERRO: INKFLOW_TOOL_SECRET vazio." >&2
    exit 1
  fi
  echo "  -> ${INKFLOW_TOOL_SECRET:0:4}... (${#INKFLOW_TOOL_SECRET} chars)"
fi

# 3. MP_ACCESS_TOKEN — valida prefix TEST-
if key_exists MP_ACCESS_TOKEN; then
  echo "[skip] MP_ACCESS_TOKEN ja existe"
  MP_ACCESS_TOKEN=""
else
  printf "Cole MP_ACCESS_TOKEN (deve comecar com TEST-) e ENTER: "
  read -rs MP_ACCESS_TOKEN
  echo ""
  if [ -z "$MP_ACCESS_TOKEN" ]; then
    echo "ERRO: MP_ACCESS_TOKEN vazio." >&2
    exit 1
  fi
  if [[ ! "$MP_ACCESS_TOKEN" =~ ^TEST- ]]; then
    echo "ERRO: token nao comeca com 'TEST-' — parece prod." >&2
    exit 1
  fi
  echo "  -> TEST-${MP_ACCESS_TOKEN:5:4}... (${#MP_ACCESS_TOKEN} chars)"
fi

# 4. SUPABASE_SERVICE_ROLE_KEY
if key_exists SUPABASE_SERVICE_ROLE_KEY; then
  echo "[skip] SUPABASE_SERVICE_ROLE_KEY ja existe"
  SUPABASE_SERVICE_ROLE_KEY=""
else
  printf "Cole SUPABASE_SERVICE_ROLE_KEY (eyJ...) e ENTER: "
  read -rs SUPABASE_SERVICE_ROLE_KEY
  echo ""
  if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "ERRO: SUPABASE_SERVICE_ROLE_KEY vazio." >&2
    exit 1
  fi
  if [[ ! "$SUPABASE_SERVICE_ROLE_KEY" =~ ^eyJ ]]; then
    echo "AVISO: key nao comeca com 'eyJ' (Supabase service role keys sao JWTs)." >&2
  fi
  echo "  -> ${SUPABASE_SERVICE_ROLE_KEY:0:4}... (${#SUPABASE_SERVICE_ROLE_KEY} chars)"
fi

# 5. INKFLOW_TELEGRAM_BOT_TOKEN — valida formato \d+:[A-Za-z0-9_-]+ (Telegram bot)
if key_exists INKFLOW_TELEGRAM_BOT_TOKEN; then
  echo "[skip] INKFLOW_TELEGRAM_BOT_TOKEN ja existe"
  INKFLOW_TELEGRAM_BOT_TOKEN=""
else
  printf "Cole INKFLOW_TELEGRAM_BOT_TOKEN (formato 123456:ABC-...) e ENTER: "
  read -rs INKFLOW_TELEGRAM_BOT_TOKEN
  echo ""
  if [ -z "$INKFLOW_TELEGRAM_BOT_TOKEN" ]; then
    echo "ERRO: INKFLOW_TELEGRAM_BOT_TOKEN vazio." >&2
    exit 1
  fi
  if [[ ! "$INKFLOW_TELEGRAM_BOT_TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
    echo "AVISO: token nao bate com formato Telegram <bot_id>:<hash>. Confere se colou certo." >&2
  fi
  TG_BOT_ID="${INKFLOW_TELEGRAM_BOT_TOKEN%%:*}"
  echo "  -> bot_id=${TG_BOT_ID} (${#INKFLOW_TELEGRAM_BOT_TOKEN} chars total)"
fi

# 6. Verifica se algo a adicionar
PENDING=()
[ -n "$INKFLOW_TOOL_SECRET" ] && PENDING+=("INKFLOW_TOOL_SECRET")
[ -n "$MP_ACCESS_TOKEN" ] && PENDING+=("MP_ACCESS_TOKEN")
[ -n "$SUPABASE_SERVICE_ROLE_KEY" ] && PENDING+=("SUPABASE_SERVICE_ROLE_KEY")
[ -n "$INKFLOW_TELEGRAM_BOT_TOKEN" ] && PENDING+=("INKFLOW_TELEGRAM_BOT_TOKEN")
if ! key_exists SUPABASE_URL; then
  PENDING+=("SUPABASE_URL")
fi

if [ ${#PENDING[@]} -eq 0 ]; then
  echo ""
  echo "Nada novo pra adicionar — todas as keys ja estavam em .dev.vars."
  echo ""
  echo "=== .dev.vars (keys mascaradas) ==="
  grep -E '^[A-Z_]+=' "$DEVVARS" | sed -E 's/=(.{0,4}).*/=\1.../'
  exit 0
fi

# 7. Backup
TS=$(date +%Y%m%d-%H%M%S)
cp "$DEVVARS" "${DEVVARS}.bak.${TS}"
echo ""
echo "Backup: ${DEVVARS}.bak.${TS}"

# 8. Garante newline final
if [ -s "$DEVVARS" ] && [ "$(tail -c 1 "$DEVVARS")" != "" ]; then
  echo "" >> "$DEVVARS"
fi

# 9. Append apenas o que falta
{
  echo "# Sub-3.2 smoke secrets (Task 14) — populado em $(date +%Y-%m-%d)"
  [ -n "$INKFLOW_TOOL_SECRET" ] && echo "INKFLOW_TOOL_SECRET=$INKFLOW_TOOL_SECRET"
  [ -n "$MP_ACCESS_TOKEN" ] && echo "MP_ACCESS_TOKEN=$MP_ACCESS_TOKEN"
  if ! key_exists SUPABASE_URL; then
    echo "SUPABASE_URL=$SUPA_URL"
  fi
  [ -n "$SUPABASE_SERVICE_ROLE_KEY" ] && echo "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY"
  [ -n "$INKFLOW_TELEGRAM_BOT_TOKEN" ] && echo "INKFLOW_TELEGRAM_BOT_TOKEN=$INKFLOW_TELEGRAM_BOT_TOKEN"
} >> "$DEVVARS"

echo ""
echo "=== .dev.vars apos populate (keys mascaradas) ==="
grep -E '^[A-Z_]+=' "$DEVVARS" | sed -E 's/=(.{0,4}).*/=\1.../'
echo ""
echo "OK. Adicionadas: ${PENDING[*]}"
echo "Pronto pra rodar Task 14 smoke."
