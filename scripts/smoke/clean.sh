#!/usr/bin/env bash
# scripts/smoke/clean.sh
# Limpa TODO o rastro de conversa de UM telefone de teste (manifest-driven).
# Fluxo: preflight -> resolve conversa_ids -> preview -> (confirma) -> delete ordenado -> verify.
# Uso:
#   bash scripts/smoke/clean.sh                       # telefone padrao, com confirmacao
#   bash scripts/smoke/clean.sh 5521970789797 --yes   # sem confirmacao
#   bash scripts/smoke/clean.sh --tenant <uuid> 55... # outro tenant (exige confirmacao explicita)
set -euo pipefail
SMOKE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SMOKE_DIR}/lib.sh"

TENANT="$TENANT_TESTE"; YES=0; PHONE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y) YES=1 ;;
    --tenant) shift; TENANT="${1:-}"; [ -n "$TENANT" ] || { echo "ERRO: --tenant exige uuid." >&2; exit 1; } ;;
    -*) echo "ERRO: flag desconhecida: $1" >&2; exit 1 ;;
    *)  PHONE="$1" ;;
  esac
  shift
done
PHONE="${PHONE:-$PHONE_TESTE_DEFAULT}"
[[ "$PHONE" =~ ^[0-9]+$ ]] || { echo "ERRO: telefone invalido '$PHONE' (so digitos)." >&2; exit 1; }

smoke_load_env

if [ "$TENANT" != "$TENANT_TESTE" ]; then
  echo "ATENCAO: tenant NAO-teste: $TENANT — confirme que NAO e cliente real."
  read -r -p "    Digite EXATAMENTE 'sei o que faço' pra continuar: " ack
  [ "$ack" = "sei o que faço" ] || { echo "Abortado."; exit 1; }
fi

# 1. preflight obrigatorio (aborta se schema divergiu)
"${SMOKE_DIR}/preflight.sh" >/dev/null || { echo "Abortado: preflight falhou (rode 'bash scripts/smoke/preflight.sh')." >&2; exit 1; }

echo "=== clean — tenant $TENANT / telefone $PHONE ==="

# 2. resolve conversa_ids ANTES de deletar conversas (estrategia via_conversa)
CONV_IDS=$(smoke_get_ids "conversas?tenant_id=eq.${TENANT}&telefone=eq.${PHONE}&select=id")

filter_for() { # $1=tabela $2=estrategia -> "tabela?filtros"
  case "$2" in
    tenant_telefone)         echo "${1}?tenant_id=eq.${TENANT}&telefone=eq.${PHONE}" ;;
    tenant_cliente_telefone) echo "${1}?tenant_id=eq.${TENANT}&cliente_telefone=eq.${PHONE}" ;;
    session_id)              echo "${1}?session_id=eq.${TENANT}_${PHONE}" ;;
    via_conversa)            echo "${1}?conversa_id=in.(${CONV_IDS})" ;;
  esac
}

# 3. preview (counts). Guarda as linhas em ROWS (delim '|') pra reusar no delete.
echo "[preview] linhas a deletar:"
total=0; ROWS=()
while IFS=$'\t' read -r table strat; do
  ROWS+=("${table}|${strat}")
  if [ "$strat" = "via_conversa" ] && [ -z "$CONV_IDS" ]; then n=0; else n=$(smoke_count "$(filter_for "$table" "$strat")"); fi
  printf "  %-20s %s\n" "$table" "$n"
  total=$((total + n))
done < <(smoke_manifest_rows)
echo "  ---- total: $total"
[ "$total" -eq 0 ] && { echo "Ja esta limpo. Nada a fazer."; exit 0; }

# 4. confirma
if [ "$YES" -ne 1 ]; then
  read -r -p "Confirma o DELETE acima? [y/N] " a
  case "$a" in y|Y|yes|sim) ;; *) echo "Abortado."; exit 1 ;; esac
fi

# 5. delete: filhos primeiro, conversas por ULTIMO
echo "[delete]"
for row in "${ROWS[@]}"; do
  table="${row%%|*}"; strat="${row##*|}"
  [ "$table" = "conversas" ] && continue
  if [ "$strat" = "via_conversa" ] && [ -z "$CONV_IDS" ]; then printf "  %-20s del=0 (sem conversa)\n" "$table"; continue; fi
  d=$(smoke_del_count "$(filter_for "$table" "$strat")")
  printf "  %-20s del=%s\n" "$table" "$d"
done
dc=$(smoke_del_count "conversas?tenant_id=eq.${TENANT}&telefone=eq.${PHONE}")
printf "  %-20s del=%s\n" "conversas" "$dc"

# 6. verify (residuo deve ser 0)
echo "[verify] residuo (esperado 0):"
res=0
while IFS=$'\t' read -r table strat; do
  if [ "$strat" = "via_conversa" ] && [ -z "$CONV_IDS" ]; then n=0; else n=$(smoke_count "$(filter_for "$table" "$strat")"); fi
  res=$((res + n))
done < <(smoke_manifest_rows)
echo "  total residuo: $res"
if [ "$res" -eq 0 ]; then echo "Limpo. Pode rodar o smoke do zero."; else echo "ATENCAO: sobrou residuo ($res linhas)." >&2; exit 1; fi
