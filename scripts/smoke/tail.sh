#!/usr/bin/env bash
# scripts/smoke/tail.sh
# Tail paralelo de Pages (inkflow-saas) + cron Worker (inkflow-cron), prefixado.
# Assume `wrangler login` feito (ou CLOUDFLARE_API_TOKEN no ambiente).
# Uso: bash scripts/smoke/tail.sh [--pages-only|--cron-only]
set -euo pipefail
MODE="both"
case "${1:-}" in
  --pages-only) MODE="pages" ;;
  --cron-only)  MODE="cron" ;;
  "" ) ;;
  *) echo "ERRO: flag desconhecida: $1 (use --pages-only|--cron-only)" >&2; exit 1 ;;
esac
command -v npx >/dev/null 2>&1 || { echo "ERRO: npx/wrangler nao encontrado." >&2; exit 1; }

pids=()
cleanup() { for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

# awk fflush() => prefixo line-buffered portavel (macOS BSD sed nao tem -u).
if [ "$MODE" != "cron" ]; then
  ( npx wrangler pages deployment tail --project-name inkflow-saas --format pretty 2>&1 \
      | awk '{ print "[pages] " $0; fflush() }' ) &
  pids+=($!)
fi
if [ "$MODE" != "pages" ]; then
  ( npx wrangler tail inkflow-cron --format pretty 2>&1 \
      | awk '{ print "[cron]  " $0; fflush() }' ) &
  pids+=($!)
fi

echo "Tailing (${MODE}). Ctrl-C pra parar."
wait
