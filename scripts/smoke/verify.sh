#!/usr/bin/env bash
# scripts/smoke/verify.sh
# Snapshot read-only do estado da conversa de teste (NAO altera nada).
# Uso: bash scripts/smoke/verify.sh [telefone] [N-mensagens]
set -euo pipefail
SMOKE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SMOKE_DIR}/lib.sh"

PHONE="${1:-$PHONE_TESTE_DEFAULT}"
LIMIT="${2:-15}"
[[ "$PHONE" =~ ^[0-9]+$ ]] || { echo "ERRO: telefone invalido '$PHONE' (so digitos)." >&2; exit 1; }
smoke_load_env
TENANT="$TENANT_TESTE"; SID="${TENANT}_${PHONE}"

g() { curl -sS "${SUPABASE_URL}/rest/v1/$1" -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY"; }

echo "=== SNAPSHOT smoke — tenant teste / telefone $PHONE ($(date '+%H:%M:%S')) ==="
echo ""
echo "[conversas]"
g "conversas?tenant_id=eq.${TENANT}&telefone=eq.${PHONE}&select=estado_agente,valor_proposto,orcid,dados_cadastro" \
  | jq -r 'if length==0 then "  (sem conversa — lead novo)" else .[] |
      "  estado_agente : \(.estado_agente)\n  valor_proposto: \(.valor_proposto)\n  orcid         : \(.orcid)\n  data_nasc     : \(.dados_cadastro.data_nascimento // "null")\n  nome          : \(.dados_cadastro.nome // "null")" end'
echo ""
echo "[conversa_mensagens] ultimas $LIMIT (mais recente embaixo)"
g "conversa_mensagens?session_id=eq.${SID}&select=created_at,message&order=created_at.asc&limit=200" \
  | jq -r --argjson n "$LIMIT" '
      (if length==0 then "  (vazio)" else
        ([.[].message.type] | group_by(.) | map("\(.[0])=\(length)") | join("  ")) as $tot
        | "  totais: \($tot)\n  ----\n" +
          ((.[-$n:]) | map("  [\(.message.type)] \(.message.content | gsub("\n";"⏎"))" | .[0:160]) | join("\n"))
       end)'
echo ""
echo "[agendamentos]"
g "agendamentos?tenant_id=eq.${TENANT}&cliente_telefone=eq.${PHONE}&select=status,inicio,fim,mp_payment_id,created_at&order=created_at.desc" \
  | jq -r 'if length==0 then "  (nenhum — esperado ANTES de escolher horario)" else .[] |
      "  status=\(.status)  inicio=\(.inicio)  pix(mp_payment_id)=\(.mp_payment_id // "—")" end'
echo ""
echo "[outras tabelas de rastro] (counts)"
for tf in "orcamentos?tenant_id=eq.${TENANT}&telefone=eq.${PHONE}" \
          "tool_calls_log?tenant_id=eq.${TENANT}&telefone=eq.${PHONE}" \
          "logs?tenant_id=eq.${TENANT}&telefone=eq.${PHONE}"; do
  printf "  %-16s %s\n" "${tf%%\?*}" "$(smoke_count "$tf")"
done
echo ""
echo "Mapa roteiros: R1 data_nasc(null apos idade solta) | R2 conversa_mensagens(type=ai da retomada) |"
echo "               R3 agendamentos(vazio antes do slot) | R4 content com ⏎ (baloes) | R5 valor_proposto(estavel no desconto)"
