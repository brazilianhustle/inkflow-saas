#!/bin/bash
# Preflight: scan functions/ for env.X references, compare with CF Pages project env_vars.
# Blocks deploy if any referenced env var is missing in the CF project.
#
# Why: avoids "Configuração interna ausente" type bugs where code references env.FOO
# but FOO was never set in the CF dashboard.
#
# Requires: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in env (from ~/.zshrc).
# Get token at https://dash.cloudflare.com/profile/api-tokens (template: Cloudflare Pages:Edit).

set -euo pipefail

PROJECT_NAME="${1:-inkflow-saas}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FUNCTIONS_DIR="$ROOT/functions"

if [ ! -d "$FUNCTIONS_DIR" ]; then
  echo "❌ functions/ not found at $FUNCTIONS_DIR"
  exit 1
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "⚠️  CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID not set — skipping preflight"
  echo "    Add to ~/.zshrc:"
  echo "      export CLOUDFLARE_ACCOUNT_ID=\"1bea7a6f2e41f53d5687b29ec0bd6fec\""
  echo "      export CLOUDFLARE_API_TOKEN=\"<token from dash.cloudflare.com/profile/api-tokens>\""
  exit 0
fi

echo "🔍 Scanning $FUNCTIONS_DIR for env.X references..."

# Collect referenced env vars from code (exclude vars used only as context.env reads with fallbacks
# that don't go through the code path — we want anything that might be read).
REFERENCED=$(grep -rEho "env\.[A-Z][A-Z0-9_]+" "$FUNCTIONS_DIR" \
  | sed 's/^env\.//' \
  | sort -u)

if [ -z "$REFERENCED" ]; then
  echo "ℹ️  No env.X references found — nothing to check"
  exit 0
fi

ref_count=$(echo "$REFERENCED" | wc -l | tr -d ' ')
echo "   Found $ref_count unique env vars referenced in code"

echo "📡 Fetching CF Pages project env_vars via API..."
API_URL="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT_NAME}"
RESPONSE=$(curl -s -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" "$API_URL")

if ! echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('success') else 1)" 2>/dev/null; then
  echo "❌ CF API call failed:"
  echo "$RESPONSE" | python3 -m json.tool 2>&1 | head -20
  exit 1
fi

CONFIGURED=$(echo "$RESPONSE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
envs = d['result'].get('deployment_configs',{}).get('production',{}).get('env_vars',{}) or {}
for k in sorted(envs.keys()): print(k)
")

cfg_count=$(echo "$CONFIGURED" | wc -l | tr -d ' ')
echo "   Found $cfg_count env vars configured in CF Pages (production)"

# Ignore vars that are obviously not CF Pages env vars:
# - Standard Node/JS globals (NODE_ENV, PATH, etc) — these aren't set via CF but inherited
IGNORE_PATTERNS="^(NODE_ENV|PATH|HOME|USER|PWD|LANG|TZ)$"

MISSING=""
for var in $REFERENCED; do
  if echo "$var" | grep -qE "$IGNORE_PATTERNS"; then continue; fi
  if ! echo "$CONFIGURED" | grep -qxF "$var"; then
    MISSING="$MISSING $var"
  fi
done

if [ -n "$MISSING" ]; then
  echo ""
  echo "❌ DEPLOY BLOCKED — env vars referenced in code but not set in CF Pages:"
  for var in $MISSING; do
    echo "   - $var"
    grep -rn "env\.$var\b" "$FUNCTIONS_DIR" | head -2 | sed 's/^/       /'
  done
  echo ""
  echo "Fix: https://dash.cloudflare.com/${CLOUDFLARE_ACCOUNT_ID}/pages/view/${PROJECT_NAME}/settings/environment-variables"
  exit 2
fi

echo "✅ All $ref_count referenced env vars are configured in CF Pages"
