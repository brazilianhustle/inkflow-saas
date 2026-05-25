#!/usr/bin/env bash
# scripts/smoke/poll.sh
# Aguarda o processamento assincrono do smoke no Supabase.
#
# Sucesso quando aparece resposta AI nova apos o inicio OU o estado muda para
# um estado esperado. Falha por timeout com snapshot JSON para debug.

set -euo pipefail
cd "$(dirname "$0")/../.."

TENANT="${SMOKE_TENANT_ID:-db686ef2-ca42-43e4-a831-808984d8d6c6}"
PHONE="${1:-5521970789797}"
SINCE_ISO="${2:?uso: poll.sh <telefone> <since_iso> [expected_state_csv]}"
EXPECTED_STATES="${3:-}"
TIMEOUT_SECONDS="${SMOKE_POLL_TIMEOUT_SECONDS:-60}"
INTERVAL_SECONDS="${SMOKE_POLL_INTERVAL_SECONDS:-3}"
REQUIRE_ORCID="${SMOKE_REQUIRE_ORCID:-0}"
SID="${TENANT}_${PHONE}"

DEVVARS=".dev.vars"
[ -f "$DEVVARS" ] || { echo "ERRO: $DEVVARS nao existe." >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "ERRO: jq nao instalado." >&2; exit 1; }

while IFS='=' read -r key value; do
  [[ "$key" =~ ^[A-Z_]+$ ]] || continue
  value="${value%\"}"; value="${value#\"}"
  export "$key=$value"
done < "$DEVVARS"

SUPA_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_KEY:-}}"
[ -n "${SUPABASE_URL:-}" ] && [ -n "$SUPA_KEY" ] || {
  echo "ERRO: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no $DEVVARS." >&2
  exit 1
}

get() {
  curl -sS "${SUPABASE_URL}/rest/v1/$1" \
    -H "apikey: $SUPA_KEY" \
    -H "Authorization: Bearer $SUPA_KEY"
}

expected_state_hit() {
  local state="$1"
  [ -n "$EXPECTED_STATES" ] || return 1
  IFS=',' read -ra STATES <<< "$EXPECTED_STATES"
  for expected in "${STATES[@]}"; do
    [ "$state" = "$expected" ] && return 0
  done
  return 1
}

deadline=$((SECONDS + TIMEOUT_SECONDS))
last_snapshot="{}"

echo "poll: aguardando processamento phone=$PHONE timeout=${TIMEOUT_SECONDS}s" >&2

while [ "$SECONDS" -lt "$deadline" ]; do
  conv="$(get "conversas?tenant_id=eq.${TENANT}&telefone=eq.${PHONE}&select=estado_agente,orcid,updated_at,dados_cadastro&limit=1")"
  msgs="$(get "conversa_mensagens?session_id=eq.${SID}&created_at=gte.${SINCE_ISO}&select=created_at,status,message&order=created_at.asc")"
  last_snapshot="$(jq -nc --argjson conv "$conv" --argjson msgs "$msgs" '{conversas:$conv,mensagens:$msgs}')"

  state="$(printf '%s' "$conv" | jq -r '.[0].estado_agente // ""')"
  orcid="$(printf '%s' "$conv" | jq -r '.[0].orcid // ""')"
  ai_count="$(printf '%s' "$msgs" | jq '[.[] | select(.message.type=="ai")] | length')"
  failed_count="$(printf '%s' "$msgs" | jq '[.[] | select(.status=="failed")] | length')"

  if [ "$failed_count" != "0" ]; then
    echo "poll: falha detectada em conversa_mensagens" >&2
    printf '%s\n' "$last_snapshot" | jq .
    exit 1
  fi

  if expected_state_hit "$state"; then
    if [ "$REQUIRE_ORCID" = "1" ] && [ -z "$orcid" ]; then
      sleep "$INTERVAL_SECONDS"
      continue
    fi
    echo "poll: estado esperado atingido: $state" >&2
    printf '%s\n' "$last_snapshot" | jq .
    exit 0
  fi

  if [ "$ai_count" -gt 0 ]; then
    echo "poll: resposta AI detectada" >&2
    printf '%s\n' "$last_snapshot" | jq .
    exit 0
  fi

  sleep "$INTERVAL_SECONDS"
done

echo "poll: timeout aguardando smoke" >&2
printf '%s\n' "$last_snapshot" | jq .
exit 1
