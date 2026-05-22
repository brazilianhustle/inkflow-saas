#!/usr/bin/env bash
# scripts/smoke/lib.sh
# Biblioteca compartilhada do harness de smoke. NAO executar direto — usar `source`.
# Helpers PostgREST + descoberta de schema via OpenAPI. Bash puro + curl + jq.
#
# Fonte de verdade do schema: GET ${SUPABASE_URL}/rest/v1/ (OpenAPI, .definitions).
# Seguranca: carrega .dev.vars por nome de chave; nunca ecoa valores de secret.

TENANT_TESTE="db686ef2-ca42-43e4-a831-808984d8d6c6"   # InkFlow Sub4 Test (default seguro)
PHONE_TESTE_DEFAULT="5521970789797"                   # numero de teste decidido
SMOKE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_DIR="${SMOKE_DIR}/.cache"
MANIFEST="${SMOKE_DIR}/manifest.tsv"

smoke_load_env() {
  local devvars; devvars="$(cd "$SMOKE_DIR/../.." && pwd)/.dev.vars"
  [ -f "$devvars" ] || { echo "ERRO: .dev.vars nao encontrado em $devvars (rode da raiz do repo)." >&2; return 1; }
  command -v jq   >/dev/null 2>&1 || { echo "ERRO: jq nao instalado." >&2; return 1; }
  command -v curl >/dev/null 2>&1 || { echo "ERRO: curl nao instalado." >&2; return 1; }
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[A-Z_]+$ ]] || continue
    value="${value%\"}"; value="${value#\"}"
    export "$key=$value"
  done < "$devvars"
  SUPA_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_KEY:-}}"
  [ -n "${SUPABASE_URL:-}" ] && [ -n "$SUPA_KEY" ] || {
    echo "ERRO: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no .dev.vars." >&2; return 1; }
}

# Baixa e cacheia o OpenAPI; ecoa o caminho do arquivo. Cache por execucao (SWAGGER_FILE).
smoke_swagger() {
  if [ -z "${SWAGGER_FILE:-}" ] || [ ! -s "${SWAGGER_FILE:-/nonexistent}" ]; then
    mkdir -p "$CACHE_DIR"
    SWAGGER_FILE="${CACHE_DIR}/swagger.json"
    curl -sS "${SUPABASE_URL}/rest/v1/" \
      -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" > "$SWAGGER_FILE"
    jq -e '.definitions' "$SWAGGER_FILE" >/dev/null 2>&1 || {
      echo "ERRO: swagger invalido (sem .definitions) — checar SUPABASE_URL/key." >&2; return 1; }
  fi
  echo "$SWAGGER_FILE"
}

smoke_table_exists() { # $1=tabela -> 0 se existe
  jq -e --arg t "$1" '.definitions[$t] != null' "$(smoke_swagger)" >/dev/null 2>&1
}

smoke_col_exists() { # $1=tabela $2=coluna -> 0 se existe
  jq -e --arg t "$1" --arg c "$2" '.definitions[$t].properties[$c] != null' "$(smoke_swagger)" >/dev/null 2>&1
}

# Conta exata via Content-Range (Prefer: count=exact). Nunca confunde corpo de erro com count.
smoke_count() { # $1="tabela?filtros" -> nº de linhas (ou "ERR")
  local hdr
  hdr=$(curl -sS -o /dev/null -D - \
    -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
    -H "Range: 0-0" -H "Prefer: count=exact" \
    "${SUPABASE_URL}/rest/v1/$1&select=id") || { echo "ERR"; return 1; }
  echo "$hdr" | tr -d '\r' | awk -F'/' 'tolower($1) ~ /content-range/ {print $2; f=1} END{if(!f) print "ERR"}'
}

# DELETE com checagem de tipo: array => nº deletado; objeto de erro => stderr + return 1.
smoke_del_count() { # $1="tabela?filtros" -> nº deletado
  local resp
  resp=$(curl -sS -X DELETE \
    -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
    -H "Prefer: return=representation" \
    "${SUPABASE_URL}/rest/v1/$1&select=id")
  if echo "$resp" | jq -e 'type == "array"' >/dev/null 2>&1; then
    echo "$resp" | jq 'length'
  else
    echo "ERRO PostgREST no DELETE $1: $(echo "$resp" | jq -rc '.message // .' 2>/dev/null || echo "$resp")" >&2
    return 1
  fi
}

# Resolve ids (coluna id) como lista separada por virgula (pra filtro in.(...)).
smoke_get_ids() { # $1="tabela?...&select=id"
  curl -sS -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
    "${SUPABASE_URL}/rest/v1/$1" | jq -r 'if type=="array" then ([.[].id] | join(",")) else "" end'
}

# Linhas do manifest sem comentarios/vazias -> "tabela<TAB>estrategia".
smoke_manifest_rows() {
  grep -v '^[[:space:]]*#' "$MANIFEST" | grep -v '^[[:space:]]*$' | cut -f1,2
}

# Colunas obrigatorias por estrategia (usado por preflight e clean).
cols_for_strategy() { # $1=estrategia
  case "$1" in
    tenant_telefone)         echo "tenant_id telefone" ;;
    tenant_cliente_telefone) echo "tenant_id cliente_telefone" ;;
    session_id)              echo "session_id" ;;
    via_conversa)            echo "conversa_id" ;;
    *)                       echo "" ;;
  esac
}
