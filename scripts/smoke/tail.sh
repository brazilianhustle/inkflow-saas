#!/usr/bin/env bash
# scripts/smoke/tail.sh
# Garante uma tail de logs do Cloudflare Pages ativa antes de smoke real.
# Idempotente: se ja houver uma tail deste projeto rodando, nao abre outra.
#
# Uso:
#   bash scripts/smoke/tail.sh
#   SMOKE_TAIL_FOLLOW=1 bash scripts/smoke/tail.sh   # foreground
#
# Variaveis:
#   CF_PAGES_PROJECT_NAME  default: inkflow-saas
#   SMOKE_TAIL_ENVIRONMENT default: production
#   SMOKE_TAIL_LOG         default: /tmp/inkflow-smoke-tail.log

set -euo pipefail

PROJECT="${CF_PAGES_PROJECT_NAME:-inkflow-saas}"
ENVIRONMENT="${SMOKE_TAIL_ENVIRONMENT:-production}"
LOG_FILE="${SMOKE_TAIL_LOG:-/tmp/inkflow-smoke-tail.log}"
PID_FILE="/tmp/inkflow-smoke-tail-${PROJECT}-${ENVIRONMENT}.pid"
PATTERN="wrangler pages deployment tail.*project-name[= ]${PROJECT}.*environment[= ]${ENVIRONMENT}"

if [ "${SMOKE_TAIL_DISABLED:-}" = "1" ]; then
  echo "smoke tail desativada via SMOKE_TAIL_DISABLED=1"
  exit 0
fi

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    echo "smoke tail ja ativa pid=$PID log=$LOG_FILE"
    exit 0
  fi
fi

if pgrep -fl "$PATTERN" >/dev/null 2>&1; then
  PID="$(pgrep -fl "$PATTERN" | head -1 | awk '{print $1}')"
  echo "$PID" > "$PID_FILE"
  echo "smoke tail ja ativa pid=$PID log=$LOG_FILE"
  exit 0
fi

command -v npx >/dev/null 2>&1 || {
  echo "ERRO: npx nao encontrado; nao consigo iniciar wrangler tail." >&2
  exit 1
}
command -v jq >/dev/null 2>&1 || {
  echo "ERRO: jq nao encontrado; nao consigo resolver deployment id." >&2
  exit 1
}

DEPLOYMENT_ID="${SMOKE_TAIL_DEPLOYMENT_ID:-}"
if [ -z "$DEPLOYMENT_ID" ]; then
  DEPLOYMENT_ID="$(
    npx wrangler pages deployment list \
      --project-name="$PROJECT" \
      --environment="$ENVIRONMENT" \
      --json \
      | jq -r '.[0].Id // empty'
  )"
fi
[ -n "$DEPLOYMENT_ID" ] || {
  echo "ERRO: nenhuma deployment encontrada para project=$PROJECT environment=$ENVIRONMENT." >&2
  exit 1
}

mkdir -p "$(dirname "$LOG_FILE")"
: > "$LOG_FILE"

if [ "${SMOKE_TAIL_FOLLOW:-}" = "1" ]; then
  echo "iniciando smoke tail em foreground para project=$PROJECT environment=$ENVIRONMENT deployment=$DEPLOYMENT_ID"
  exec npx wrangler pages deployment tail "$DEPLOYMENT_ID" --project-name="$PROJECT" --environment="$ENVIRONMENT"
fi

nohup npx wrangler pages deployment tail "$DEPLOYMENT_ID" --project-name="$PROJECT" --environment="$ENVIRONMENT" >> "$LOG_FILE" 2>&1 &
PID="$!"
echo "$PID" > "$PID_FILE"
sleep 2

if kill -0 "$PID" 2>/dev/null; then
  echo "smoke tail iniciada pid=$PID deployment=$DEPLOYMENT_ID log=$LOG_FILE"
else
  echo "ERRO: smoke tail falhou ao iniciar. Ultimas linhas:" >&2
  tail -20 "$LOG_FILE" >&2 || true
  exit 1
fi
