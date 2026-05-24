#!/usr/bin/env bash
# scripts/smoke-verify.sh
# Snapshot do estado de uma conversa de TESTE pra validar o smoke pós-refator
# (docs/backlog/2026-05-22-smoke-refactor-anchor.md). Read-only: NÃO altera nada.
#
# Mostra, pro telefone alvo no tenant de teste:
#   [conversas]          estado_agente, dados_cadastro (data_nascimento!), valor_proposto, orcid
#   [conversa_mensagens] últimas N (type ai/human + content com \n\n visível) + contagem
#   [chat_messages]      count (esperado 0 — BUG conhecido: reentrada.js insere col `telefone`,
#                        coluna real é `phone` → insert falha silencioso)
#   [agendamentos]       inicio/fim/status/mp_payment_id (Pix gerado?)
#
# Mapa roteiro -> o que olhar:
#   R1 cadastro:   dados_cadastro.data_nascimento deve ficar null após "tenho 30 anos"
#   R2 reentrada:  conversa_mensagens ganha msg type=ai da retomada (chat_messages segue 0 = bug)
#   R3 sem Pix:    estado_agente != escolhendo_horario => SEM agendamento/mp_payment_id
#   R4 balões:     content das msgs ai deve conter \n\n nos pontos de quebra
#   R5 desconto:   valor_proposto NÃO muda no pedido de desconto; muda só após decisão
#
# Pré-requisito: .dev.vars com SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + jq.
# Uso:
#   bash scripts/smoke-verify.sh                 # telefone padrão 5521970789797
#   bash scripts/smoke-verify.sh 5521970789797
#   bash scripts/smoke-verify.sh 5599999999 30   # telefone + nº de mensagens a listar

set -euo pipefail

TENANT="db686ef2-ca42-43e4-a831-808984d8d6c6"   # InkFlow Sub4 Test
PHONE="${1:-5521970789797}"
LIMIT="${2:-15}"
SID="${TENANT}_${PHONE}"

DEVVARS=".dev.vars"
[ -f "$DEVVARS" ] || { echo "ERRO: $DEVVARS nao existe (rode da raiz do repo)." >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "ERRO: jq nao instalado." >&2; exit 1; }
[[ "$PHONE" =~ ^[0-9]+$ ]] || { echo "ERRO: telefone invalido '$PHONE' (so digitos)." >&2; exit 1; }

while IFS='=' read -r key value; do
  [[ "$key" =~ ^[A-Z_]+$ ]] || continue
  value="${value%\"}"; value="${value#\"}"
  export "$key=$value"
done < "$DEVVARS"

SUPA_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_KEY:-}}"
[ -n "${SUPABASE_URL:-}" ] && [ -n "$SUPA_KEY" ] || {
  echo "ERRO: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no $DEVVARS." >&2; exit 1; }

get() { curl -sS "${SUPABASE_URL}/rest/v1/$1" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY"; }

echo "=== SNAPSHOT smoke — tenant teste / telefone $PHONE ==="
echo "($(date '+%H:%M:%S'))"
echo ""

echo "[conversas]"
get "conversas?tenant_id=eq.${TENANT}&telefone=eq.${PHONE}&select=estado_agente,valor_proposto,orcid,dados_cadastro" \
  | jq -r 'if length==0 then "  (sem conversa — lead novo)" else .[] |
      "  estado_agente : \(.estado_agente)\n  valor_proposto: \(.valor_proposto)\n  orcid         : \(.orcid)\n  data_nasc     : \(.dados_cadastro.data_nascimento // "null")\n  nome          : \(.dados_cadastro.nome // "null")\n  dados_cadastro: \(.dados_cadastro)" end'
echo ""

echo "[conversa_mensagens] últimas $LIMIT (mais recente embaixo)"
get "conversa_mensagens?session_id=eq.${SID}&select=created_at,message&order=created_at.asc&limit=200" \
  | jq -r --argjson n "$LIMIT" '
      (if length==0 then "  (vazio)" else
        ([.[].message.type] | group_by(.) | map("\(.[0])=\(length)") | join("  ")) as $tot
        | "  totais: \($tot)\n  ----\n" +
          ( (.[-$n:]) | map("  [\(.message.type)] \(.message.content | gsub("\n";"⏎"))" | .[0:160]) | join("\n") )
       end)'
echo ""

echo "[chat_messages] (esperado 0 — bug conhecido reentrada.js col telefone vs phone)"
get "chat_messages?tenant_id=eq.${TENANT}&phone=eq.${PHONE}&select=id" | jq -r '"  count: \(length)"'
echo ""

echo "[agendamentos]"
get "agendamentos?tenant_id=eq.${TENANT}&cliente_telefone=eq.${PHONE}&select=status,inicio,fim,mp_payment_id,created_at&order=created_at.desc" \
  | jq -r 'if length==0 then "  (nenhum — esperado ANTES de escolher horário)" else .[] |
      "  status=\(.status)  inicio=\(.inicio)  pix(mp_payment_id)=\(.mp_payment_id // "—")" end'
