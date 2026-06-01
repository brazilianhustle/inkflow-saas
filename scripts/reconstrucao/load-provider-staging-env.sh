#!/usr/bin/env bash
set -euo pipefail

SECRET_ENV_FILE="${INKFLOW_PROVIDER_STAGING_ENV_FILE:-$HOME/.inkflow-secrets/provider-staging.env}"
ALLOWED_NAMES="EVOLUTION_STAGING_SECRET_SOURCE TELEGRAM_STAGING_SECRET_SOURCE CLOUDFLARE_WORKER_STAGING_SECRET_SOURCE EVOLUTION_STAGING_INSTANCE_LABEL TELEGRAM_STAGING_BOT_LABEL TELEGRAM_STAGING_CHAT_LABEL PROVIDER_STAGING_SMOKE_APPROVAL PROVIDER_STAGING_REAL_SMOKE_EXECUTION_APPROVAL PROVIDER_STAGING_STORE_SOURCE_OPERATOR_EXECUTION_APPROVAL PROVIDER_STAGING_SMOKE_EXECUTE"

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
