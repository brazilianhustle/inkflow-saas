#!/usr/bin/env bash
# scripts/smoke-portfolio-direcionado.sh
# Smoke E2E direcionado pra Sub-3.3 PortfolioAgent v2 (intent transversal).
#
# Valida o que a eval suite NAO cobre:
#   - tool /api/tools/enviar-portfolio contra Supabase real (filter substring/empty/limit)
#   - branch transversal executePortfolioIntent em /api/agent/route com tenant valido
#
# Cenarios:
#   A) tool-direct estilo=blackwork  -> 2 URLs filtradas
#   B) tool-direct sem estilo        -> 4 URLs (todas)
#   C) tool-direct estilo inexistente -> fallback pra 4 URLs (filtro vazio)
#   D) tool-direct portfolio_urls=[] -> motivo=portfolio_vazio, urls=[]
#   E) E2E TC-PORT-04 via /api/agent/route (cadastro) -> urls_portfolio populado
#
# Pre-requisito:
#   1. .dev.vars populado com OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INKFLOW_TOOL_SECRET
#   2. wrangler local rodando: npx wrangler pages dev . --port 8788
#   3. Tenant "Hustle Ink" existe no Supabase
#
# Uso:
#   bash scripts/smoke-portfolio-direcionado.sh
#
# Cleanup automatico: PATCH portfolio_urls de volta pro estado original (trap EXIT).

set -euo pipefail

DEVVARS=".dev.vars"
[ -f "$DEVVARS" ] || { echo "ERRO: $DEVVARS nao existe."; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "ERRO: jq nao instalado."; exit 1; }

# Carrega secrets do .dev.vars linha-a-linha (sem eval, robusto a special chars)
while IFS='=' read -r key value; do
  [[ "$key" =~ ^[A-Z_]+$ ]] || continue
  value="${value%\"}"
  value="${value#\"}"
  export "$key=$value"
done < "$DEVVARS"

WRANGLER_BASE="${WRANGLER_BASE:-http://localhost:8788}"
TELEFONE_TESTE="5511999990002"

URL_BW1="https://example.com/portfolio/blackwork/1.jpg"
URL_BW2="https://example.com/portfolio/blackwork/2.jpg"
URL_FL1="https://example.com/portfolio/fineline/1.jpg"
URL_FL2="https://example.com/portfolio/fineline/2.jpg"

TENANT_ID=""
ORIGINAL_PORTFOLIO_JSON=""

cleanup() {
  echo ""
  echo "[cleanup]"
  if [ -n "$TENANT_ID" ] && [ -n "$ORIGINAL_PORTFOLIO_JSON" ]; then
    curl -sS -X PATCH \
      "${SUPABASE_URL}/rest/v1/tenants?id=eq.${TENANT_ID}" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=minimal" \
      -d "{\"portfolio_urls\": ${ORIGINAL_PORTFOLIO_JSON}}" \
      -o /dev/null -w "  RESTORE portfolio_urls %{http_code}\n" || true
  fi
}
trap cleanup EXIT INT TERM

# Counters
PASS=0; FAIL=0

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  OK   $label: $actual"
    PASS=$((PASS+1))
  else
    echo "  FAIL $label: esperado='$expected' got='$actual'"
    FAIL=$((FAIL+1))
  fi
}

assert_eq_int() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  OK   $label: $actual"
    PASS=$((PASS+1))
  else
    echo "  FAIL $label: esperado=$expected got=$actual"
    FAIL=$((FAIL+1))
  fi
}

assert_gt0() {
  local label="$1" actual="$2"
  if [ "$actual" -gt 0 ] 2>/dev/null; then
    echo "  OK   $label: $actual (>0)"
    PASS=$((PASS+1))
  else
    echo "  FAIL $label: esperado>0 got=$actual"
    FAIL=$((FAIL+1))
  fi
}

echo "=== Smoke E2E Portfolio (Sub-3.3 gate-pre-Sub-4) ==="
echo ""

# 1. Wrangler health
echo "[1/8] Wrangler health-check em $WRANGLER_BASE..."
if ! curl -sSf -o /dev/null "$WRANGLER_BASE" 2>&1; then
  echo "ERRO: wrangler nao responde em $WRANGLER_BASE." >&2
  echo "      Rode em outra aba: npx wrangler pages dev . --port 8788" >&2
  exit 1
fi
echo "  OK"
echo ""

# 2. Discovery + backup
echo "[2/8] Discovery Hustle Ink + backup portfolio_urls atual..."
TENANT_RESP=$(curl -sSf \
  "${SUPABASE_URL}/rest/v1/tenants?nome_estudio=ilike.*hustle*&select=id,nome_estudio,portfolio_urls" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
TENANT_ID=$(printf '%s' "$TENANT_RESP" | jq -r '.[0].id')
ORIGINAL_PORTFOLIO_JSON=$(printf '%s' "$TENANT_RESP" | jq -c '.[0].portfolio_urls // []')
[ -n "$TENANT_ID" ] && [ "$TENANT_ID" != "null" ] || { echo "ERRO: tenant Hustle Ink nao encontrado"; exit 1; }
echo "  tenant_id=$TENANT_ID"
echo "  backup portfolio_urls=$ORIGINAL_PORTFOLIO_JSON"
echo ""

# 3. UPDATE com 4 URLs (2 blackwork + 2 fineline)
echo "[3/8] UPDATE portfolio_urls com 4 URLs (2 blackwork + 2 fineline)..."
NEW_URLS=$(jq -nc --arg a "$URL_BW1" --arg b "$URL_BW2" --arg c "$URL_FL1" --arg d "$URL_FL2" '[$a,$b,$c,$d]')
curl -sSf -X PATCH \
  "${SUPABASE_URL}/rest/v1/tenants?id=eq.${TENANT_ID}" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"portfolio_urls\": $NEW_URLS}" \
  -o /dev/null -w "  PATCH portfolio_urls %{http_code}\n"
echo ""

# 4. Cenario A — tool-direct, estilo='blackwork'
echo "[4/8] Cenario A: tool-direct estilo=blackwork (esperado: 2 URLs blackwork)"
RESP_A=$(curl -sSf -X POST \
  "${WRANGLER_BASE}/api/tools/enviar-portfolio" \
  -H "Content-Type: application/json" \
  -H "X-Inkflow-Tool-Secret: $INKFLOW_TOOL_SECRET" \
  -d "{\"tenant_id\": \"$TENANT_ID\", \"estilo\": \"blackwork\"}")
echo "  resp: $RESP_A"
assert_eq     "[A] ok"            "true"        "$(printf '%s' "$RESP_A" | jq -r .ok)"
assert_eq_int "[A] urls.length"   "2"           "$(printf '%s' "$RESP_A" | jq -r '.urls | length')"
assert_eq     "[A] estudio"       "Hustle Ink"  "$(printf '%s' "$RESP_A" | jq -r .estudio)"
echo ""

# 5. Cenario B — tool-direct, sem estilo
echo "[5/8] Cenario B: tool-direct sem estilo (esperado: 4 URLs todas, total=4)"
RESP_B=$(curl -sSf -X POST \
  "${WRANGLER_BASE}/api/tools/enviar-portfolio" \
  -H "Content-Type: application/json" \
  -H "X-Inkflow-Tool-Secret: $INKFLOW_TOOL_SECRET" \
  -d "{\"tenant_id\": \"$TENANT_ID\"}")
echo "  resp: $RESP_B"
assert_eq_int "[B] urls.length"   "4"           "$(printf '%s' "$RESP_B" | jq -r '.urls | length')"
assert_eq_int "[B] total"         "4"           "$(printf '%s' "$RESP_B" | jq -r .total)"
echo ""

# 6. Cenario C — tool-direct, estilo inexistente
echo "[6/8] Cenario C: tool-direct estilo=zzz_inexistente (fallback: 4 URLs)"
RESP_C=$(curl -sSf -X POST \
  "${WRANGLER_BASE}/api/tools/enviar-portfolio" \
  -H "Content-Type: application/json" \
  -H "X-Inkflow-Tool-Secret: $INKFLOW_TOOL_SECRET" \
  -d "{\"tenant_id\": \"$TENANT_ID\", \"estilo\": \"zzz_inexistente\"}")
echo "  resp: $RESP_C"
# Filtro vazio -> fallback pras URLs originais (urls.length === 4)
assert_eq_int "[C] urls.length"   "4"           "$(printf '%s' "$RESP_C" | jq -r '.urls | length')"
echo ""

# 7. Cenario D — vazio
echo "[7/8] Cenario D: portfolio_urls=[] (esperado: motivo=portfolio_vazio, urls=[])"
curl -sSf -X PATCH \
  "${SUPABASE_URL}/rest/v1/tenants?id=eq.${TENANT_ID}" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{"portfolio_urls": []}' -o /dev/null

RESP_D=$(curl -sSf -X POST \
  "${WRANGLER_BASE}/api/tools/enviar-portfolio" \
  -H "Content-Type: application/json" \
  -H "X-Inkflow-Tool-Secret: $INKFLOW_TOOL_SECRET" \
  -d "{\"tenant_id\": \"$TENANT_ID\"}")
echo "  resp: $RESP_D"
assert_eq     "[D] ok"            "true"             "$(printf '%s' "$RESP_D" | jq -r .ok)"
assert_eq_int "[D] urls.length"   "0"                "$(printf '%s' "$RESP_D" | jq -r '.urls | length')"
assert_eq     "[D] motivo"        "portfolio_vazio"  "$(printf '%s' "$RESP_D" | jq -r .motivo)"

# Restore as 4 URLs pro cenario E
curl -sSf -X PATCH \
  "${SUPABASE_URL}/rest/v1/tenants?id=eq.${TENANT_ID}" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"portfolio_urls\": $NEW_URLS}" -o /dev/null
echo ""

# 8. Cenario E — E2E TC-PORT-04 via /api/agent/route
echo "[8/8] Cenario E (E2E LLM): TC-PORT-04 cadastro + cliente pede portfolio"
echo "       (gpt-4o-mini, ~\$0.005, deterministic se context built)"
BODY_E=$(jq -nc \
  --arg tenant_id "$TENANT_ID" \
  --arg telefone "$TELEFONE_TESTE" \
  --arg estado "cadastro" \
  --arg msg "antes me mostra trabalhos" \
  --arg bw1 "$URL_BW1" \
  --arg bw2 "$URL_BW2" \
  --arg fl1 "$URL_FL1" \
  --arg fl2 "$URL_FL2" \
  '{
    tenant_id: $tenant_id,
    telefone: $telefone,
    mensagem: $msg,
    estado_atual: $estado,
    dados_acumulados: { descricao_curta: "rosa", tamanho_cm: 8, local_corpo: "antebraco" },
    historico: [{ role: "assistant", content: "Pra liberar teu orcamento, me passa nome completo e data de nascimento." }],
    tenant: {
      id: $tenant_id,
      nome_estudio: "Hustle Ink",
      config_agente: {},
      config_precificacao: { sinal_percentual: 30 },
      gatilhos_handoff: [],
      faqs: [],
      fewshots: [],
      fewshots_por_modo: {},
      portfolio_urls: [$bw1, $bw2, $fl1, $fl2]
    }
  }')

RESP_E=$(curl -sSf -X POST \
  "${WRANGLER_BASE}/api/agent/route" \
  -H "Content-Type: application/json" \
  -d "$BODY_E")
echo "  resp keys: $(printf '%s' "$RESP_E" | jq -r 'keys | join(",")')"
echo "  proxima_acao: $(printf '%s' "$RESP_E" | jq -r .proxima_acao)"
echo "  urls_portfolio: $(printf '%s' "$RESP_E" | jq -c .urls_portfolio)"
assert_eq     "[E] ok"                "true"  "$(printf '%s' "$RESP_E" | jq -r .ok)"
assert_eq     "[E] proxima_acao"      "enviar_portfolio" "$(printf '%s' "$RESP_E" | jq -r .proxima_acao)"
assert_gt0    "[E] urls_portfolio.length" "$(printf '%s' "$RESP_E" | jq -r '.urls_portfolio | length')"
echo ""

# Summary
echo "=== Resultado smoke Sub-3.3 ==="
echo "PASS=$PASS  FAIL=$FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "GATE: BLOCK (smoke vermelho — investigar antes de Sub-4)"
  exit 1
else
  echo "GATE: PASS (Sub-3.3 ready pra Sub-4 cutover)"
fi
