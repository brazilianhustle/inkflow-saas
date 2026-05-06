#!/bin/bash
# Deploy cron-worker pra Cloudflare Workers usando credenciais do Bitwarden Secrets Manager.
# Sem precisar de `wrangler login` interativo — bom pra Claude Code rodar end-to-end.
#
# Pré-requisitos:
#   - bws CLI instalada (~/.local/bin/bws ou no PATH) + BWS_ACCESS_TOKEN no env
#   - Secrets CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID no project bws inkflow
#   - wrangler instalada (npx wrangler funciona OK, ou global install)
#
# Uso:
#   cd cron-worker && ./scripts/deploy.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKER_DIR="$REPO_ROOT/cron-worker"

cd "$WORKER_DIR"

echo "→ Carregando credenciais Cloudflare via bws (project inkflow)..."

# Buscar por key name (não por ID — ID pode mudar se secret for re-criado)
CLOUDFLARE_API_TOKEN=$(bws secret list | jq -r '.[] | select(.key=="CLOUDFLARE_API_TOKEN") | .value' | head -1)
CLOUDFLARE_ACCOUNT_ID=$(bws secret list | jq -r '.[] | select(.key=="CLOUDFLARE_ACCOUNT_ID") | .value' | head -1)

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "✗ CLOUDFLARE_API_TOKEN não encontrado no bws. Setup com /tmp/setup-cloudflare-bws.sh ou bws secret create manual."
  exit 1
fi

if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
  echo "✗ CLOUDFLARE_ACCOUNT_ID não encontrado no bws."
  exit 1
fi

export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID

echo "→ Deployando inkflow-cron via wrangler..."
echo ""

npx wrangler deploy

echo ""
echo "✓ Deploy concluído."
echo "  Logs: https://dash.cloudflare.com/$CLOUDFLARE_ACCOUNT_ID/workers/services/view/inkflow-cron/production/logs"
