#!/usr/bin/env bash
# scripts/smoke/tail.sh
# Tail paralelo de Pages (inkflow-saas) + cron Worker (inkflow-cron), prefixado.
# Assume `wrangler login` feito (ou CLOUDFLARE_API_TOKEN no ambiente).
#
# Uso: bash scripts/smoke/tail.sh [--pages-only|--cron-only]
#
# Quem inspeciona costuma ser o proprio Claude (sessao do smoke), nao um humano:
#   - rodar em BACKGROUND (run_in_background), ler a saida capturada conforme o
#     bot processa as mensagens do WhatsApp, e MATAR o processo ao terminar.
#   - humano tambem pode rodar em foreground e parar com Ctrl-C.
#
# Detalhes que o naive "wrangler tail X | awk" erra (e quebram em modo nao-interativo):
#   - cron: `wrangler tail inkflow-cron` da raiz do repo le o wrangler.toml de
#     Pages e aborta ("Workers-specific command in a Pages project"). Fix: rodar
#     com o config do cron-worker/ (que e Worker).
#   - pages: `wrangler pages deployment tail` exige um deployment ID quando nao ha
#     TTY (o `| awk` tira o TTY); --environment nao basta. Fix: resolver o ID do
#     deployment de producao antes e passar explicito.
set -euo pipefail
SMOKE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SMOKE_DIR}/../.." && pwd)"
CRON_DIR="${REPO_ROOT}/cron-worker"

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
if [ "$MODE" != "pages" ]; then
  # Cron Worker: rodar com o config de cron-worker/ (senao le o config Pages da raiz).
  [ -f "${CRON_DIR}/wrangler.toml" ] || { echo "ERRO: ${CRON_DIR}/wrangler.toml nao encontrado." >&2; exit 1; }
  ( cd "$CRON_DIR" && npx wrangler tail --format pretty 2>&1 \
      | awk '{ print "[cron]  " $0; fflush() }' ) &
  pids+=($!)
fi
if [ "$MODE" != "cron" ]; then
  # Pages: resolver o deployment de producao atual (nao-interativo exige ID explicito).
  DEPLOY_ID="$(npx wrangler pages deployment list --project-name inkflow-saas --environment production 2>/dev/null \
      | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)"
  [ -n "$DEPLOY_ID" ] || { echo "ERRO: nao consegui resolver o deployment de producao do inkflow-saas (wrangler login? rede?)." >&2; exit 1; }
  echo "[pages] deployment producao: ${DEPLOY_ID}"
  ( npx wrangler pages deployment tail "$DEPLOY_ID" --project-name inkflow-saas --format pretty 2>&1 \
      | awk '{ print "[pages] " $0; fflush() }' ) &
  pids+=($!)
fi

echo "Tailing (${MODE}). Foreground: Ctrl-C pra parar. Background (Claude): matar o processo."
wait
