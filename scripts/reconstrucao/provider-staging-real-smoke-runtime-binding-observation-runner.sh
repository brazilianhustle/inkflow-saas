#!/usr/bin/env bash
set -euo pipefail

PLATFORM_DIR="${INKFLOW_PLATFORM_DIR:-/Users/brazilianhustler/Documents/inkflow-platform}"

if [ ! -d "$PLATFORM_DIR" ]; then
  echo "inkflow-platform nao encontrado em: $PLATFORM_DIR" >&2
  echo "Defina INKFLOW_PLATFORM_DIR para o caminho correto e rode novamente." >&2
  exit 1
fi

if [ ! -f "$PLATFORM_DIR/package.json" ]; then
  echo "package.json nao encontrado em: $PLATFORM_DIR" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/load-provider-staging-env.sh"

cd "$PLATFORM_DIR"
export INKFLOW_ENV="${INKFLOW_ENV:-local}"
export PROVIDER_ENV="${PROVIDER_ENV:-local}"
npm run provider:staging:real-smoke-runtime-binding-observation-runner -- "$@"
