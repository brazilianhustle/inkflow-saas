#!/usr/bin/env bash
# scripts/smoke/preflight.sh
# Valida o manifest contra o schema real (OpenAPI do PostgREST) ANTES de qualquer delete.
# Exit 0 = seguro pra limpar. Exit 1 = schema divergiu (NAO limpar).
# --strict: avisos (tabelas orfas nao cobertas) viram erro.
set -euo pipefail
SMOKE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SMOKE_DIR}/lib.sh"

STRICT=0; [ "${1:-}" = "--strict" ] && STRICT=1
smoke_load_env

errors=0; warns=0; covered=""
echo "=== preflight: manifest vs schema real ==="

# 1. Cada linha do manifest: tabela existe? colunas da estrategia existem?
while IFS=$'\t' read -r table strat; do
  covered="$covered $table"
  if ! smoke_table_exists "$table"; then
    echo "  ERRO: tabela '$table' nao existe no schema." >&2
    errors=$((errors+1)); continue
  fi
  req="$(cols_for_strategy "$strat")"
  if [ -z "$req" ]; then
    echo "  ERRO: $table: estrategia desconhecida '$strat'." >&2
    errors=$((errors+1)); continue
  fi
  for col in $req; do
    if ! smoke_col_exists "$table" "$col"; then
      have=$(jq -r --arg t "$table" '.definitions[$t].properties | keys | join(", ")' "$(smoke_swagger)")
      echo "  ERRO: $table: coluna '$col' ausente (estrategia $strat)." >&2
      echo "        schema tem: $have" >&2
      echo "        FIX: ajuste a estrategia no manifest ou as colunas em cols_for_strategy()." >&2
      errors=$((errors+1))
    fi
  done
done < <(smoke_manifest_rows)

# 2. Coverage: tabelas com marcador de conversa que NAO estao no manifest.
markers='["telefone","phone","cliente_telefone","session_id","conversa_id"]'
while read -r t; do
  case " $covered " in *" $t "*) continue ;; esac
  echo "  AVISO: tabela '$t' tem marcador de conversa e NAO esta no manifest (revisar se deve limpar)." >&2
  warns=$((warns+1))
done < <(jq -r --argjson m "$markers" \
  '.definitions | to_entries[] | select(.value.properties as $p | ($m | any($p[.] != null))) | .key' \
  "$(smoke_swagger)" | sort -u)

echo "  ----"
echo "  manifest: $(smoke_manifest_rows | wc -l | tr -d ' ') tabelas | erros: $errors | avisos: $warns"
if [ "$errors" -gt 0 ]; then echo "FALHOU: schema divergiu. NAO limpar." >&2; exit 1; fi
if [ "$STRICT" -eq 1 ] && [ "$warns" -gt 0 ]; then echo "FALHOU (--strict): avisos presentes." >&2; exit 1; fi
echo "OK: schema valido pro manifest."
