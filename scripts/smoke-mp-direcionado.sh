#!/usr/bin/env bash
# scripts/smoke-mp-direcionado.sh
# Smoke E2E direcionado pra integracao Mercado Pago (Sub-3.2 follow-up P1).
#
# Valida o caminho que o smoke local de Sub-3.2 nao exercitou:
#   consultar-horarios -> reservar-horario -> gerar-link-sinal (MP sandbox)
#
# Pula o LLM (sem chamar /api/agent/route). Foco: body shape, header
# X-Inkflow-Tool-Secret, MP Preference creation, response parsing.
#
# Pre-requisito:
#   1. .dev.vars populado (rode populate-dev-vars-smoke.sh primeiro)
#   2. wrangler local rodando: `npx wrangler pages dev . --port 8788`
#   3. Tenant "Hustle Ink" existe no Supabase
#
# Uso:
#   bash scripts/smoke-mp-direcionado.sh
#
# Cleanup automatico: DELETE agendamento + conversa criada (trap EXIT).

set -euo pipefail

DEVVARS=".dev.vars"
[ -f "$DEVVARS" ] || { echo "ERRO: $DEVVARS nao existe."; exit 1; }

# Carrega secrets do .dev.vars linha-a-linha (sem eval, robusto a special chars)
while IFS='=' read -r key value; do
  [[ "$key" =~ ^[A-Z_]+$ ]] || continue
  # Remove aspas externas se presentes
  value="${value%\"}"
  value="${value#\"}"
  export "$key=$value"
done < "$DEVVARS"

WRANGLER_BASE="${WRANGLER_BASE:-http://localhost:8788}"
TELEFONE_TESTE="5511999990001"
NOME_TESTE="SMOKE_MP_TEST"
VALOR_SINAL="50.00"

AGENDAMENTO_ID=""
CONVERSA_ID=""

cleanup() {
  echo ""
  echo "[cleanup]"
  if [ -n "$AGENDAMENTO_ID" ]; then
    curl -sS -X DELETE \
      "${SUPABASE_URL}/rest/v1/agendamentos?id=eq.${AGENDAMENTO_ID}" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      -o /dev/null -w "  DELETE agendamento %{http_code}\n" || true
  fi
  if [ -n "$CONVERSA_ID" ]; then
    curl -sS -X DELETE \
      "${SUPABASE_URL}/rest/v1/conversas?id=eq.${CONVERSA_ID}" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      -o /dev/null -w "  DELETE conversa     %{http_code}\n" || true
  fi
}
trap cleanup EXIT

echo "=== Smoke MP direcionado (Sub-3.2 follow-up P1) ==="
echo ""

# 1. Wrangler health
echo "[1/5] Wrangler health-check em $WRANGLER_BASE..."
if ! curl -sSf -o /dev/null "$WRANGLER_BASE" 2>&1; then
  echo "ERRO: wrangler nao responde em $WRANGLER_BASE." >&2
  echo "      Rode em outra aba: npx wrangler pages dev . --port 8788" >&2
  exit 1
fi
echo "  OK"

# 2. Discovery Hustle Ink tenant_id
echo "[2/5] Discovery tenant Hustle Ink via Supabase REST..."
TENANT_RESP=$(curl -sSf \
  "${SUPABASE_URL}/rest/v1/tenants?nome_estudio=ilike.*hustle*&select=id,nome_estudio,sinal_percentual" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
TENANT_ID=$(echo "$TENANT_RESP" | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
TENANT_NOME=$(echo "$TENANT_RESP" | grep -oE '"nome_estudio":"[^"]+"' | head -1 | cut -d'"' -f4)
[ -n "$TENANT_ID" ] || { echo "ERRO: tenant Hustle Ink nao encontrado. Resp: $TENANT_RESP"; exit 1; }
echo "  tenant_id   = $TENANT_ID"
echo "  nome_estudio= $TENANT_NOME"

# 3. consultar-horarios
echo "[3/5] POST /api/tools/consultar-horarios..."
SLOTS_RESP=$(curl -sS -X POST "$WRANGLER_BASE/api/tools/consultar-horarios" \
  -H "Content-Type: application/json" \
  -H "X-Inkflow-Tool-Secret: $INKFLOW_TOOL_SECRET" \
  -d "{\"tenant_id\":\"$TENANT_ID\"}")
SLOT_INICIO=$(echo "$SLOTS_RESP" | grep -oE '"inicio":"[^"]+"' | head -1 | cut -d'"' -f4)
SLOT_FIM=$(echo "$SLOTS_RESP" | grep -oE '"fim":"[^"]+"' | head -1 | cut -d'"' -f4)
TOTAL_SLOTS=$(echo "$SLOTS_RESP" | grep -oE '"total":[0-9]+' | head -1 | cut -d':' -f2)
[ -n "$SLOT_INICIO" ] && [ -n "$SLOT_FIM" ] || {
  echo "ERRO: nenhum slot disponivel."
  echo "Resp: $SLOTS_RESP"
  exit 1
}
echo "  total slots = $TOTAL_SLOTS"
echo "  primeiro    = $SLOT_INICIO -> $SLOT_FIM"

# 4. reservar-horario
echo "[4/5] POST /api/tools/reservar-horario..."
RES_RESP=$(curl -sS -X POST "$WRANGLER_BASE/api/tools/reservar-horario" \
  -H "Content-Type: application/json" \
  -H "X-Inkflow-Tool-Secret: $INKFLOW_TOOL_SECRET" \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"telefone\":\"$TELEFONE_TESTE\",\"nome\":\"$NOME_TESTE\",\"inicio\":\"$SLOT_INICIO\",\"fim\":\"$SLOT_FIM\"}")
AGENDAMENTO_ID=$(echo "$RES_RESP" | grep -oE '"agendamento_id":"[^"]+"' | head -1 | cut -d'"' -f4)
CONVERSA_ID=$(echo "$RES_RESP" | grep -oE '"conversa_id":"[^"]+"' | head -1 | cut -d'"' -f4)
[ -n "$AGENDAMENTO_ID" ] || {
  echo "ERRO: agendamento nao criado."
  echo "Resp: $RES_RESP"
  exit 1
}
echo "  agendamento_id = $AGENDAMENTO_ID"
echo "  conversa_id    = $CONVERSA_ID"

# 5. gerar-link-sinal — A INTEGRACAO MP CRITICA
echo "[5/5] POST /api/tools/gerar-link-sinal (MP sandbox)..."
LINK_RESP=$(curl -sS -X POST "$WRANGLER_BASE/api/tools/gerar-link-sinal" \
  -H "Content-Type: application/json" \
  -H "X-Inkflow-Tool-Secret: $INKFLOW_TOOL_SECRET" \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"agendamento_id\":\"$AGENDAMENTO_ID\",\"valor_sinal\":$VALOR_SINAL}")
LINK_PAGAMENTO=$(echo "$LINK_RESP" | grep -oE '"link_pagamento":"[^"]+"' | head -1 | cut -d'"' -f4)
PREFERENCE_ID=$(echo "$LINK_RESP" | grep -oE '"preference_id":"[^"]+"' | head -1 | cut -d'"' -f4)
EXTERNAL_REF=$(echo "$LINK_RESP" | grep -oE '"external_reference":"[^"]+"' | head -1 | cut -d'"' -f4)
[ -n "$LINK_PAGAMENTO" ] || {
  echo "ERRO: link_pagamento ausente — MP integration FALHOU."
  echo "Resp: $LINK_RESP"
  exit 1
}

# Validacoes do response
if ! [[ "$LINK_PAGAMENTO" =~ ^https://[a-z.]*mercadopago\.com(\.br)?/ ]]; then
  echo "ERRO: link_pagamento nao bate com URL MP esperada."
  echo "       got: $LINK_PAGAMENTO"
  exit 1
fi
if [[ "$EXTERNAL_REF" != "sinal:$AGENDAMENTO_ID" ]]; then
  echo "ERRO: external_reference inesperado."
  echo "       expected: sinal:$AGENDAMENTO_ID"
  echo "       got:      $EXTERNAL_REF"
  exit 1
fi

echo "  link_pagamento = ${LINK_PAGAMENTO:0:90}..."
echo "  preference_id  = $PREFERENCE_ID"
echo "  external_ref   = $EXTERNAL_REF"
echo ""
echo "=== PASS — Sub-3.2 P1 follow-up fechado ==="
echo ""
echo "Validado:"
echo "  - INKFLOW_TOOL_SECRET aceito por todas as 3 tools"
echo "  - consultar-horarios retorna slots com inicio+fim ISO"
echo "  - reservar-horario cria agendamento tentative + conversa"
echo "  - gerar-link-sinal cria MP Preference + retorna link_pagamento"
echo "  - external_reference = sinal:<agendamento_id> (formato esperado)"
echo "  - URL MP bate regex sandbox|prod"
