#!/usr/bin/env bash
set -euo pipefail

SECRET_ENV_FILE="${INKFLOW_SUPABASE_STAGING_ENV_FILE:-$HOME/.inkflow-secrets/supabase-staging.env}"
ALLOWED_NAMES="SUPABASE_STAGING_URL SUPABASE_STAGING_ANON_KEY SUPABASE_STAGING_SERVICE_ROLE_KEY SUPABASE_STAGING_DB_URL SUPABASE_STAGING_MIGRATION_EXECUTION_APPROVAL"

if [ -f "$SECRET_ENV_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ""|\#*) continue ;;
    esac

    if [[ ! "$line" =~ ^export[[:space:]]+([A-Z0-9_]+)=\"([^\"]*)\"[[:space:]]*$ ]]; then
      echo "Linha invalida em $SECRET_ENV_FILE. Use apenas: export NOME=\"valor\"." >&2
      exit 1
    fi

    name="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"

    case " $ALLOWED_NAMES " in
      *" $name "*) ;;
      *)
        echo "Variavel nao permitida em $SECRET_ENV_FILE: $name" >&2
        exit 1
        ;;
    esac

    if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
      echo "Valor invalido em $SECRET_ENV_FILE: $name nao pode ter quebra de linha." >&2
      exit 1
    fi

    export "$name=$value"
  done < "$SECRET_ENV_FILE"
fi
