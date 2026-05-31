#!/usr/bin/env bash
set -euo pipefail

SECRET_ENV_FILE="${INKFLOW_SUPABASE_STAGING_ENV_FILE:-$HOME/.inkflow-secrets/supabase-staging.env}"

if [ -f "$SECRET_ENV_FILE" ]; then
  # Local-only operator convenience. The sourced file must export values; wrappers
  # and downstream checks remain responsible for redacting all secret output.
  # shellcheck disable=SC1090
  source "$SECRET_ENV_FILE"
fi
