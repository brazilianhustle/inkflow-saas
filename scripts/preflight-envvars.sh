#!/bin/bash
# Preflight: scan functions/ for env.X references, compare with CF Pages project env_vars.
# Blocks deploy if any REQUIRED referenced env var is missing in the CF project.
#
# Why: avoids "Configuração interna ausente" type bugs where code references env.FOO
# but FOO was never set in the CF dashboard.
#
# What it IGNORES (false positives):
#   - Vars with `|| fallback` on the same line (`env.X || 'default'`) — optional
#   - Vars in single-line comments (`// ... env.X ...`)
#   - Vars referenced only inside `functions/_lib/auditors/` — cron-worker runtime, not Pages
#   - Bindings configured via wrangler.jsonc (AI, KV, R2, D1, DURABLE_OBJECT, ASSETS)
#   - Pairs `env.A || env.B` where B is configured (A is the alternative)
#   - Standard runtime globals (NODE_ENV, PATH, HOME, USER, PWD, LANG, TZ)
#
# Requires: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in env.

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

echo "🔍 Scanning $FUNCTIONS_DIR for required env.X references..."

# Per-file, per-line scan with smart filtering.
# Outputs format: VAR_NAME\tFILE:LINE\tCONTEXT
# REQUIRED = referenced without `||` fallback, not in comment, not auditor file, not binding.
REQUIRED=$(python3 - <<PYEOF
import os
import re
import sys

ROOT = "$FUNCTIONS_DIR"
SKIP_DIRS = ("_lib/auditors",)
BINDINGS = {"AI", "KV", "R2", "D1", "DURABLE_OBJECT", "ASSETS", "VECTORIZE"}
GLOBALS = {"NODE_ENV", "PATH", "HOME", "USER", "PWD", "LANG", "TZ"}

ENV_REF = re.compile(r"\benv\.([A-Z][A-Z0-9_]+)")
COMMENT_LINE = re.compile(r"^\s*(//|\*|/\*)")

# Map: VAR -> list of (file, line, context, has_fallback_on_line)
referenced = {}

def is_in_skip_dir(rel_path):
    norm = rel_path.replace(os.sep, "/")
    return any(d in norm for d in SKIP_DIRS)

for dirpath, _, filenames in os.walk(ROOT):
    rel = os.path.relpath(dirpath, ROOT)
    if is_in_skip_dir(rel):
        continue
    for fname in filenames:
        if not (fname.endswith(".js") or fname.endswith(".ts") or fname.endswith(".mjs")):
            continue
        full = os.path.join(dirpath, fname)
        try:
            with open(full, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
        except Exception:
            continue
        for ln_idx, line in enumerate(lines, start=1):
            # Skip comment-only lines
            if COMMENT_LINE.match(line):
                continue
            for m in ENV_REF.finditer(line):
                var = m.group(1)
                if var in BINDINGS or var in GLOBALS:
                    continue
                # Has fallback on same line? (`||` after the env reference)
                tail = line[m.end():]
                has_fallback = "||" in tail
                referenced.setdefault(var, []).append({
                    "file": os.path.relpath(full, ROOT),
                    "line": ln_idx,
                    "fallback": has_fallback,
                })

# A var is REQUIRED if at least one occurrence has NO fallback.
required = {v for v, occs in referenced.items() if any(not o["fallback"] for o in occs)}
optional = set(referenced.keys()) - required

# Output: REQUIRED vars (one per line) + summary on stderr
for v in sorted(required):
    print(v)

print(f"   ({len(required)} required, {len(optional)} optional/fallback-only)", file=sys.stderr)
PYEOF
)

if [ -z "$REQUIRED" ]; then
  echo "ℹ️  No required env.X references found — nothing to check"
  exit 0
fi

req_count=$(echo "$REQUIRED" | wc -l | tr -d ' ')
echo "   Found $req_count unique REQUIRED env vars (after filtering fallbacks/comments/auditors/bindings)"

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

# For each REQUIRED var, check if it's configured. Handle hardcoded alternative pairs:
# if PRIMARY is missing but FALLBACK is configured, treat PRIMARY as OK.
# Pairs in format "PRIMARY:FALLBACK" (separated by spaces).
ALTERNATIVES="SUPABASE_SERVICE_ROLE_KEY:SUPABASE_SERVICE_KEY EVOLUTION_GLOBAL_KEY:EVO_GLOBAL_KEY"

MISSING=""
for var in $REQUIRED; do
  if echo "$CONFIGURED" | grep -qxF "$var"; then continue; fi
  # Check hardcoded alternatives
  alt_ok=""
  for pair in $ALTERNATIVES; do
    primary="${pair%%:*}"
    fallback="${pair##*:}"
    if [ "$var" = "$primary" ] && echo "$CONFIGURED" | grep -qxF "$fallback"; then
      echo "   ℹ️  $var missing but alternative $fallback is configured — skipping"
      alt_ok="yes"
      break
    fi
  done
  [ -n "$alt_ok" ] && continue
  MISSING="$MISSING $var"
done

if [ -n "$MISSING" ]; then
  echo ""
  echo "❌ DEPLOY BLOCKED — REQUIRED env vars referenced in code but not set in CF Pages:"
  for var in $MISSING; do
    echo "   - $var"
    grep -rn "env\\.$var\\b" "$FUNCTIONS_DIR" | head -2 | sed 's/^/       /'
  done
  echo ""
  echo "Fix: https://dash.cloudflare.com/${CLOUDFLARE_ACCOUNT_ID}/pages/view/${PROJECT_NAME}/settings/environment-variables"
  exit 2
fi

echo "✅ All $req_count required env vars are configured in CF Pages"
