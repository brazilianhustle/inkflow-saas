#!/usr/bin/env bash
# scripts/cleanup-conversa-teste.sh
# Zera o estado de conversa(s) de TESTE no Supabase pra rodar smokes do zero.
#
# Limpa, pra cada telefone alvo dentro do tenant de teste:
#   - conversa_mensagens (por session_id = "<tenant>_<telefone>")  -> histórico
#   - agendamentos       (por tenant_id + cliente_telefone)        -> slots/sinais
#   - conversas          (por tenant_id + telefone)                -> estado/orçamento
# Resultado: o próximo contato daquele número vira lead 100% novo (sem histórico,
# sem orcid, sem estado_agente herdado) — destrava o smoke E2E sem contaminação.
#
# SEGURANÇA: por padrão só mexe no tenant de teste (TENANT_TESTE abaixo). Pra operar
# em outro tenant é preciso passar --tenant <uuid> explicitamente (sem isso, recusa).
# NUNCA aponta pra tenant de cliente real por acidente.
#
# Pré-requisito: .dev.vars com SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (mesmo dos smokes) + jq.
#
# Uso:
#   bash scripts/cleanup-conversa-teste.sh 5521970789797            # um telefone
#   bash scripts/cleanup-conversa-teste.sh 5521970789797 553140427299
#   bash scripts/cleanup-conversa-teste.sh --all                   # todas as conversas do tenant teste
#   bash scripts/cleanup-conversa-teste.sh --all --yes             # sem confirmação (CI/automação)
#   bash scripts/cleanup-conversa-teste.sh --tenant <uuid> 5599...  # outro tenant (explícito)

set -euo pipefail

# Tenant de teste InkFlow Sub4 Test (db686ef2). Default seguro.
TENANT_TESTE="db686ef2-ca42-43e4-a831-808984d8d6c6"

DEVVARS=".dev.vars"
[ -f "$DEVVARS" ] || { echo "ERRO: $DEVVARS nao existe (rode da raiz do repo)." >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "ERRO: jq nao instalado." >&2; exit 1; }

# Carrega secrets do .dev.vars (linha-a-linha, robusto a special chars — igual aos smokes)
while IFS='=' read -r key value; do
  [[ "$key" =~ ^[A-Z_]+$ ]] || continue
  value="${value%\"}"; value="${value#\"}"
  export "$key=$value"
done < "$DEVVARS"

SUPA_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_KEY:-}}"
[ -n "${SUPABASE_URL:-}" ] && [ -n "$SUPA_KEY" ] || {
  echo "ERRO: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no $DEVVARS." >&2; exit 1; }
SMOKE_SUPABASE_CONNECT_TIMEOUT_SECONDS="${SMOKE_SUPABASE_CONNECT_TIMEOUT_SECONDS:-5}"
SMOKE_SUPABASE_MAX_TIME_SECONDS="${SMOKE_SUPABASE_MAX_TIME_SECONDS:-20}"

# --- args ---
TENANT="$TENANT_TESTE"
ALL=0; YES=0
PHONES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --all)    ALL=1 ;;
    --yes|-y) YES=1 ;;
    --tenant) shift; TENANT="${1:-}"; [ -n "$TENANT" ] || { echo "ERRO: --tenant exige um uuid." >&2; exit 1; } ;;
    --help|-h)
      sed -n '2,30p' "$0"; exit 0 ;;
    -*)       echo "ERRO: flag desconhecida: $1" >&2; exit 1 ;;
    *)        PHONES+=("$1") ;;
  esac
  shift
done

if [ "$TENANT" != "$TENANT_TESTE" ]; then
  echo "⚠️  Tenant NÃO-teste informado: $TENANT"
  echo "    Este script é pra dados de teste. Confirme que NÃO é tenant de cliente real."
  read -r -p "    Digite EXATAMENTE 'sei o que faço' pra continuar: " ack
  [ "$ack" = "sei o que faço" ] || { echo "Abortado."; exit 1; }
fi

# helpers REST (PostgREST). select=id evita puxar o jsonb pesado (base64 das fotos).
supabase_curl() {
  curl -sS \
    --connect-timeout "$SMOKE_SUPABASE_CONNECT_TIMEOUT_SECONDS" \
    --max-time "$SMOKE_SUPABASE_MAX_TIME_SECONDS" \
    "$@"
}

api() { # $1=method $2=path-com-query  -> stdout = body
  supabase_curl -X "$1" "${SUPABASE_URL}/rest/v1/${2}" \
    -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
    -H "Content-Type: application/json" -H "Prefer: return=representation"
}
count() { # $1=path-com-query (sem select) -> stdout = nº de linhas
  supabase_curl "${SUPABASE_URL}/rest/v1/${1}&select=id" \
    -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" | jq 'length'
}

# Resolve telefones alvo
if [ "$ALL" -eq 1 ]; then
  mapfile -t PHONES < <(supabase_curl "${SUPABASE_URL}/rest/v1/conversas?tenant_id=eq.${TENANT}&select=telefone" \
    -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" | jq -r '.[].telefone' | sort -u)
fi
[ "${#PHONES[@]}" -gt 0 ] || { echo "Nada pra limpar (sem telefones alvo / tenant vazio). Passe um telefone ou use --all."; exit 0; }

# Valida formato (só dígitos) — evita query maligna e erros bobos
for p in "${PHONES[@]}"; do
  [[ "$p" =~ ^[0-9]+$ ]] || { echo "ERRO: telefone inválido '$p' (só dígitos)." >&2; exit 1; }
done

echo "=== Cleanup conversa de teste ==="
echo "tenant: $TENANT"
echo "telefones: ${PHONES[*]}"
echo ""
echo "[preview] o que será DELETADO:"
TOTAL_MSG=0; TOTAL_CONV=0; TOTAL_AGD=0
for p in "${PHONES[@]}"; do
  sid="${TENANT}_${p}"
  m=$(count "conversa_mensagens?session_id=eq.${sid}")
  c=$(count "conversas?tenant_id=eq.${TENANT}&telefone=eq.${p}")
  a=$(count "agendamentos?tenant_id=eq.${TENANT}&cliente_telefone=eq.${p}")
  printf "  %-15s  msgs=%-4s conversas=%-3s agendamentos=%-3s\n" "$p" "$m" "$c" "$a"
  TOTAL_MSG=$((TOTAL_MSG+m)); TOTAL_CONV=$((TOTAL_CONV+c)); TOTAL_AGD=$((TOTAL_AGD+a))
done
echo "  ----"
printf "  TOTAL            msgs=%-4s conversas=%-3s agendamentos=%-3s\n" "$TOTAL_MSG" "$TOTAL_CONV" "$TOTAL_AGD"
echo ""

if [ $((TOTAL_MSG+TOTAL_CONV+TOTAL_AGD)) -eq 0 ]; then
  echo "Já está limpo. Nada a fazer."; exit 0
fi

if [ "$YES" -ne 1 ]; then
  read -r -p "Confirma o DELETE acima? [y/N] " ans
  case "$ans" in y|Y|yes|sim) ;; *) echo "Abortado."; exit 1 ;; esac
fi

echo ""
echo "[delete]"
for p in "${PHONES[@]}"; do
  sid="${TENANT}_${p}"
  dm=$(api DELETE "conversa_mensagens?session_id=eq.${sid}&select=id" | jq 'length')
  da=$(api DELETE "agendamentos?tenant_id=eq.${TENANT}&cliente_telefone=eq.${p}&select=id" | jq 'length')
  dc=$(api DELETE "conversas?tenant_id=eq.${TENANT}&telefone=eq.${p}&select=id" | jq 'length')
  printf "  %-15s  msgs-del=%-4s agendamentos-del=%-3s conversas-del=%-3s\n" "$p" "$dm" "$da" "$dc"
done

echo ""
echo "[verify] resíduo pós-cleanup (esperado tudo 0):"
RESIDUO=0
for p in "${PHONES[@]}"; do
  sid="${TENANT}_${p}"
  m=$(count "conversa_mensagens?session_id=eq.${sid}")
  c=$(count "conversas?tenant_id=eq.${TENANT}&telefone=eq.${p}")
  a=$(count "agendamentos?tenant_id=eq.${TENANT}&cliente_telefone=eq.${p}")
  printf "  %-15s  msgs=%-4s conversas=%-3s agendamentos=%-3s\n" "$p" "$m" "$c" "$a"
  RESIDUO=$((RESIDUO+m+c+a))
done
echo ""
if [ "$RESIDUO" -eq 0 ]; then
  echo "✅ Limpo. Pode rodar o smoke do zero."
else
  echo "⚠️  Sobrou resíduo ($RESIDUO linhas) — confira manualmente."; exit 1
fi
