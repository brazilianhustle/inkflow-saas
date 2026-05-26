#!/usr/bin/env bash
# scripts/smoke/check-security-gate.sh
# Gate de seguranca para ondas Level 4A: npm audit limpo e Dependabot sem alerta aberto.

set -euo pipefail
cd "$(dirname "$0")/../.."

NPM_AUDIT_CACHE="${NPM_AUDIT_CACHE:-/tmp/inkflow-npm-cache}"
DEPENDABOT_REPO="${DEPENDABOT_REPO:-brazilianhustle/inkflow-saas}"
SKIP_DEPENDABOT="${SKIP_DEPENDABOT:-0}"

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/inkflow-security-gate.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT

status="PASS"
failures=()

audit_package() {
  local dir="$1"
  local label="$2"
  local out="$tmp_dir/${label}.audit.json"

  if [ ! -f "$dir/package-lock.json" ]; then
    return 0
  fi

  if ! npm audit --json --cache "$NPM_AUDIT_CACHE" --prefix "$dir" >"$out"; then
    :
  fi

  local total
  total="$(node -e 'const fs=require("fs"); const p=process.argv[1]; const data=JSON.parse(fs.readFileSync(p,"utf8")); console.log(data.metadata?.vulnerabilities?.total ?? 0);' "$out")"

  if [ "$total" != "0" ]; then
    status="FAIL"
    failures+=("npm_audit_${label}:${total}")
  fi

  printf '| `%s` | %s | %s |\n' "$label" "$(if [ "$total" = "0" ]; then echo PASS; else echo FAIL; fi)" "$total"
}

dependabot_open_count="skipped"

cat <<REPORT
# Security Gate

- repo: ${DEPENDABOT_REPO}
- npm_audit_cache: ${NPM_AUDIT_CACHE}

## NPM Audit

| Package | Result | Vulnerabilities |
|---|---|---:|
REPORT

audit_package "." "root"
audit_package "web" "web"

if [ "$SKIP_DEPENDABOT" != "1" ]; then
  if ! command -v gh >/dev/null 2>&1; then
    status="FAIL"
    failures+=("dependabot_gh_missing")
    dependabot_open_count="unknown"
  else
    if ! dependabot_open_count="$(gh api "repos/${DEPENDABOT_REPO}/dependabot/alerts" --paginate --jq '[.[] | select(.state=="open")] | length')"; then
      status="FAIL"
      failures+=("dependabot_api_failed")
      dependabot_open_count="unknown"
    elif [ "$dependabot_open_count" != "0" ]; then
      status="FAIL"
      failures+=("dependabot_open_alerts:${dependabot_open_count}")
    fi
  fi
fi

cat <<REPORT

## Dependabot

| Source | Result | Open Alerts |
|---|---|---:|
| \`${DEPENDABOT_REPO}\` | $(if [ "$dependabot_open_count" = "0" ] || [ "$dependabot_open_count" = "skipped" ]; then echo PASS; else echo FAIL; fi) | ${dependabot_open_count} |

## Decision

\`\`\`text
status: ${status}
decision: $(if [ "$status" = "PASS" ]; then echo security_gate_pass; else echo security_gate_blocked; fi)
failures: $(if [ "${#failures[@]}" -eq 0 ]; then echo none; else IFS=,; echo "${failures[*]}"; fi)
\`\`\`
REPORT

[ "$status" = "PASS" ]
