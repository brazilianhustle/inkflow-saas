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

if [ "$#" -ne 1 ]; then
  echo "Uso: npm run supabase:staging:validate-backup-evidence -- docs/evidence/supabase-staging/<record>.md" >&2
  exit 1
fi

cd "$PLATFORM_DIR"
npm run supabase:staging:validate-backup-evidence -- "$1"
