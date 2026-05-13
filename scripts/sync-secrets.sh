#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# InkFlow — sync .env.production → CF Pages (production + preview)
# ─────────────────────────────────────────────────────────────────────────────
#
# Uso:
#   bash scripts/sync-secrets.sh                # sincroniza prod + preview
#   bash scripts/sync-secrets.sh --only=preview # so preview
#   bash scripts/sync-secrets.sh --only=prod    # so production
#   bash scripts/sync-secrets.sh --dry-run      # mostra o que vai fazer, nao executa
#
# Pre-requisito: .env.production no root (gitignored), preenchido com os valores.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ENV_FILE=".env.production"
PROJECT="inkflow-saas"
TARGETS=("production" "preview")
DRY_RUN=false

# Parse args
for arg in "$@"; do
  case "$arg" in
    --only=preview) TARGETS=("preview") ;;
    --only=prod|--only=production) TARGETS=("production") ;;
    --dry-run) DRY_RUN=true ;;
    *) echo "Arg desconhecida: $arg" >&2; exit 1 ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✘ $ENV_FILE nao encontrado." >&2
  echo "  Copie .env.production.example pra .env.production e preencha os valores." >&2
  exit 1
fi

cd "$(dirname "$0")/.."

# Conta as secrets pra preencher
TOTAL=0
EMPTY=0
while IFS='=' read -r key value || [[ -n "$key" ]]; do
  [[ "$key" =~ ^#.*$ ]] && continue
  [[ -z "$key" ]] && continue
  TOTAL=$((TOTAL+1))
  [[ -z "$value" ]] && EMPTY=$((EMPTY+1))
done < "$ENV_FILE"

echo "─────────────────────────────────────────────────────"
echo "InkFlow — sync secrets"
echo "─────────────────────────────────────────────────────"
echo "Arquivo:   $ENV_FILE"
echo "Projeto:   $PROJECT"
echo "Targets:   ${TARGETS[*]}"
echo "Total:     $TOTAL secrets"
echo "Vazias:    $EMPTY (skip)"
echo "Dry-run:   $DRY_RUN"
echo "─────────────────────────────────────────────────────"
echo ""

if [[ "$EMPTY" -gt 0 && "$DRY_RUN" == "false" ]]; then
  echo "⚠️  $EMPTY secrets sem valor — vao ser puladas."
  echo "    Preencha antes de rodar pra producao."
  echo ""
fi

# Itera sobre cada linha do .env
PUSHED=0
SKIPPED=0
FAILED=0

while IFS='=' read -r key value || [[ -n "$key" ]]; do
  # Skip comments + blank lines
  [[ "$key" =~ ^#.*$ ]] && continue
  [[ -z "$key" ]] && continue

  # Trim whitespace from key
  key="${key// /}"

  # Skip empty values (deixa pra commit explicito)
  if [[ -z "$value" ]]; then
    echo "⊘  $key — vazio, skip"
    SKIPPED=$((SKIPPED+1))
    continue
  fi

  for target in "${TARGETS[@]}"; do
    if [[ "$DRY_RUN" == "true" ]]; then
      echo "↻  [DRY] $key → $target"
    else
      target_flag=""
      if [[ "$target" == "preview" ]]; then
        target_flag="--env=preview"
      fi
      # echo via printf (handles special chars) + pipe to wrangler
      if printf '%s' "$value" | npx wrangler pages secret put "$key" --project-name="$PROJECT" $target_flag >/dev/null 2>&1; then
        echo "✓  $key → $target"
        PUSHED=$((PUSHED+1))
      else
        echo "✘  $key → $target (FAIL)"
        FAILED=$((FAILED+1))
      fi
    fi
  done
done < "$ENV_FILE"

echo ""
echo "─────────────────────────────────────────────────────"
echo "Resumo: pushed=$PUSHED skipped=$SKIPPED failed=$FAILED"
echo "─────────────────────────────────────────────────────"

if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi
