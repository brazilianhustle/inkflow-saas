# Harness de Smoke Universal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um processo de smoke universal e determinístico (bash puro) que limpa todo o rastro de conversa de um número de teste com validação de schema, liga o tail de Pages+cron, e documenta um runbook com template de roteiro — resolvendo de passagem o dead code de `chat_messages` e a divergência `estado_atual`→`estado_agente`.

**Architecture:** Diretório `scripts/smoke/` com `lib.sh` (helpers PostgREST + descoberta de schema via OpenAPI), `manifest.tsv` (tabelas de rastro curadas), `preflight.sh` (valida manifest vs schema real antes de tocar em dados), `clean.sh` (preview→delete ordenado→verify), `tail.sh` (Pages+cron paralelo) e `verify.sh` (snapshot read-only). Runbook em `docs/runbooks/smoke-coleta.md`. Os scripts antigos `cleanup-conversa-teste.sh` e `smoke-verify.sh` são substituídos e removidos.

**Tech Stack:** bash, curl, jq, PostgREST OpenAPI (`/rest/v1/`), Cloudflare wrangler (tail), Node `node --test` (testes JS existentes).

**Spec:** `docs/superpowers/specs/2026-05-22-smoke-harness-design.md`

---

## File Structure

- Create: `scripts/smoke/lib.sh` — biblioteca compartilhada (config, load env, helpers REST, swagger).
- Create: `scripts/smoke/manifest.tsv` — tabela→estratégia→descrição (fonte única das tabelas a limpar).
- Create: `scripts/smoke/preflight.sh` — valida manifest vs schema real; avisa órfãs.
- Create: `scripts/smoke/clean.sh` — limpeza por telefone (preflight→preview→delete→verify).
- Create: `scripts/smoke/tail.sh` — tail paralelo Pages+cron.
- Create: `scripts/smoke/verify.sh` — snapshot read-only schema-aware.
- Create: `docs/runbooks/smoke-coleta.md` — runbook + template de roteiro + R1–R5.
- Modify: `functions/api/telegram/reentrada.js` — remover writer dead `logChatMessage`.
- Modify: `tests/tools/reentrada-helpers.test.mjs` — limpar branch de mock `chat_messages`.
- Modify: `docs/backlog/2026-05-22-smoke-refactor-anchor.md` — `estado_atual`→`estado_agente`.
- Modify: memória `project_chat_messages_vestigial.md` — marcar dead code resolvido.
- Modify: `.gitignore` — ignorar `scripts/smoke/.cache/`.
- Delete: `scripts/cleanup-conversa-teste.sh`, `scripts/smoke-verify.sh`.

**Nota sobre `chat_messages`:** removemos apenas o **writer** (`logChatMessage`). Ficam intactos: `delete-tenant.js` (apaga por `tenant_id` — limpeza legítima de tenant) e `scripts/inkflow-agent/promote-logs-to-evals.mjs` (lê `chat_messages` por `conversa_id`, mas a tabela é globalmente vazia, então já não retorna nada — utilitário de eval, fora deste escopo).

---

## Task 1: Remover dead code `chat_messages` (writer da reentrada)

**Files:**
- Modify: `functions/api/telegram/reentrada.js` (def `logChatMessage` linhas 86-100; chamada no `Promise.all` linhas 164-177; comentário de cabeçalho linha 8)
- Test: `tests/tools/reentrada-helpers.test.mjs` (mock branch linha ~96)

- [ ] **Step 1: Rodar o teste existente da reentrada pra confirmar baseline verde**

Run: `node --test tests/tools/reentrada-helpers.test.mjs`
Expected: PASS (incluindo `S2 reentrada: registra mensagem automatica em conversa_mensagens...`).

- [ ] **Step 2: Remover a função `logChatMessage`**

Em `functions/api/telegram/reentrada.js`, apagar o bloco inteiro (linhas 86-100):

```javascript
async function logChatMessage(env, { tenant_id, conversa_id, telefone, conteudo, direcao = 'out' }) {
  try {
    await supaFetch(env, '/rest/v1/chat_messages', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        tenant_id, conversa_id, telefone,
        direcao, tipo: 'texto',
        conteudo,
      }),
    });
  } catch (e) {
    console.warn('reentrada: log chat_messages falhou:', e.message);
  }
}
```

- [ ] **Step 3: Substituir o `Promise.all` por await direto do log que funciona**

Trocar o bloco (linhas ~162-177):

```javascript
  // Logs fail-open, mas aguardados: se a resposta voltar antes, o runtime pode
  // encerrar a promise e a fala automatica nao entrar no historico do agente.
  await Promise.all([
    logChatMessage(env, {
      tenant_id: conv.tenant_id,
      conversa_id: conv.id,
      telefone: conv.telefone,
      conteudo: msg,
      direcao: 'out',
    }),
    logConversaMensagem(env, {
      tenant_id: conv.tenant_id,
      telefone: conv.telefone,
      conteudo: msg,
    }),
  ]);
```

por:

```javascript
  // Log fail-open, mas aguardado: se a resposta voltar antes, o runtime pode
  // encerrar a promise e a fala automatica nao entrar no historico do agente.
  await logConversaMensagem(env, {
    tenant_id: conv.tenant_id,
    telefone: conv.telefone,
    conteudo: msg,
  });
```

- [ ] **Step 4: Corrigir o comentário de cabeçalho**

Linha 8: trocar
```javascript
// no evento, envia via Evolution sendText, loga em chat_messages.
```
por
```javascript
// no evento, envia via Evolution sendText, loga em conversa_mensagens.
```

- [ ] **Step 5: Limpar o branch morto do mock no teste**

Em `tests/tools/reentrada-helpers.test.mjs`, trocar (linha ~96):
```javascript
    if (u.includes('/rest/v1/chat_messages') || u.includes('/rest/v1/conversa_mensagens')) {
```
por:
```javascript
    if (u.includes('/rest/v1/conversa_mensagens')) {
```

- [ ] **Step 6: Rodar o teste da reentrada (deve continuar verde)**

Run: `node --test tests/tools/reentrada-helpers.test.mjs`
Expected: PASS. O teste S2 só asserta `conversa_mensagens`, que segue funcionando.

- [ ] **Step 7: Garantir que não restou referência ao writer**

Run: `grep -rn "logChatMessage" functions/ tests/`
Expected: nenhuma saída (exit 1).

- [ ] **Step 8: Rodar a suíte completa**

Run: `npm test`
Expected: todos passam, 0 falhas.

- [ ] **Step 9: Commit**

```bash
git add functions/api/telegram/reentrada.js tests/tools/reentrada-helpers.test.mjs
git commit -m "refactor(reentrada): remove writer dead chat_messages (tabela vestigial vazia)"
```

---

## Task 2: Corrigir divergência de schema nos docs/memória

**Files:**
- Modify: `docs/backlog/2026-05-22-smoke-refactor-anchor.md` (linha 64)
- Modify: `/Users/brazilianhustler/.claude/projects/-Users-brazilianhustler-Documents-inkflow-saas/memory/project_chat_messages_vestigial.md`

- [ ] **Step 1: Corrigir o anchor**

Em `docs/backlog/2026-05-22-smoke-refactor-anchor.md`, linha 64, trocar:
```
- Nao gera Pix/sinal antes de `estado_atual=escolhendo_horario` com slot valido.
```
por:
```
- Nao gera Pix/sinal antes de `estado_agente=escolhendo_horario` com slot valido.
```

- [ ] **Step 2: Confirmar que não há outras ocorrências de `estado_atual` no anchor**

Run: `grep -n "estado_atual" docs/backlog/2026-05-22-smoke-refactor-anchor.md`
Expected: nenhuma saída.

- [ ] **Step 3: Atualizar a memória (decisão resolvida)**

Em `project_chat_messages_vestigial.md`, na seção "Decisão pendente", trocar o trecho final
```
Padrão de mercado ([[feedback_padrao_mercado]]) sugere remover se ninguém consome. NÃO corrigido ainda — fora do escopo "preparar terreno".
```
por
```
Padrão de mercado ([[feedback_padrao_mercado]]) sugere remover se ninguém consome. RESOLVIDO em feat/smoke-harness: writer `logChatMessage` removido da reentrada. `delete-tenant.js` (apaga por tenant_id) e `promote-logs-to-evals.mjs` (lê por conversa_id, tabela vazia) ficam como estão. Schema correto é `estado_agente`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/backlog/2026-05-22-smoke-refactor-anchor.md
git commit -m "docs(smoke): corrige estado_atual->estado_agente no anchor"
```

(A memória fica fora do git do repo — é arquivo de `.claude/`.)

---

## Task 3: `scripts/smoke/lib.sh` + `.gitignore`

**Files:**
- Create: `scripts/smoke/lib.sh`
- Modify: `.gitignore`

- [ ] **Step 1: Criar `scripts/smoke/lib.sh`**

```bash
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
```

- [ ] **Step 2: Adicionar `.cache/` ao `.gitignore`**

Acrescentar ao final de `.gitignore`:
```
# cache do harness de smoke (swagger do PostgREST)
scripts/smoke/.cache/
```

- [ ] **Step 3: Verificar que `lib.sh` carrega o ambiente e baixa o swagger**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
bash -c 'source scripts/smoke/lib.sh && smoke_load_env && echo "swagger: $(smoke_swagger)" && smoke_table_exists conversas && echo "conversas OK" && smoke_col_exists conversas estado_agente && echo "estado_agente OK"'
```
Expected:
```
swagger: .../scripts/smoke/.cache/swagger.json
conversas OK
estado_agente OK
```

- [ ] **Step 4: Verificar count e detecção de coluna inexistente**

Run:
```bash
bash -c 'source scripts/smoke/lib.sh && smoke_load_env >/dev/null && echo "count conversas teste: $(smoke_count "conversas?tenant_id=eq.${TENANT_TESTE}")" && (smoke_col_exists conversas estado_atual && echo BUG || echo "estado_atual ausente OK")'
```
Expected: imprime um número (0 ou mais) e `estado_atual ausente OK`.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke/lib.sh .gitignore
git commit -m "feat(smoke): lib.sh — helpers PostgREST + descoberta de schema via OpenAPI"
```

---

## Task 4: `scripts/smoke/manifest.tsv`

**Files:**
- Create: `scripts/smoke/manifest.tsv`

- [ ] **Step 1: Criar o manifest com tabs reais (via printf)**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
{
  printf '# scripts/smoke/manifest.tsv\n'
  printf '# Tabelas de rastro de conversa a limpar no smoke.\n'
  printf '# Formato (TSV): tabela<TAB>estrategia<TAB>descricao\n'
  printf '# Estrategias: tenant_telefone | tenant_cliente_telefone | session_id | via_conversa\n'
  printf '# Colunas validadas contra o schema real por preflight.sh.\n'
  printf 'conversas\ttenant_telefone\testado/orcamento da conversa\n'
  printf 'conversa_mensagens\tsession_id\thistorico do agente (type ai/human)\n'
  printf 'agendamentos\ttenant_cliente_telefone\tslots/sinais\n'
  printf 'orcamentos\ttenant_telefone\torcamentos gerados\n'
  printf 'tool_calls_log\ttenant_telefone\tlog de tool calls\n'
  printf 'logs\ttenant_telefone\tlogs gerais por telefone\n'
  printf 'agent_turn_logs\tvia_conversa\ttelemetria por turno (so tem conversa_id)\n'
} > scripts/smoke/manifest.tsv
```

- [ ] **Step 2: Verificar que tem 7 linhas de dados e tabs corretos**

Run: `bash -c 'source scripts/smoke/lib.sh && smoke_manifest_rows | cat -A | head'`
Expected: 7 linhas, cada uma `tabela^Iestrategia$` (`^I` = tab).

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke/manifest.tsv
git commit -m "feat(smoke): manifest.tsv — 7 tabelas de rastro de conversa"
```

---

## Task 5: `scripts/smoke/preflight.sh`

**Files:**
- Create: `scripts/smoke/preflight.sh`

- [ ] **Step 1: Criar `scripts/smoke/preflight.sh`**

```bash
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
```

- [ ] **Step 2: Rodar o preflight no schema real (deve passar com 3 avisos)**

Run: `bash scripts/smoke/preflight.sh; echo "exit=$?"`
Expected: `OK: schema valido pro manifest.` e `exit=0`. Os avisos esperados são `chat_messages`, `chats`, `dados_cliente` (vestigiais n8n, fora do manifest de propósito).

- [ ] **Step 3: Testar detecção de drift (injetar coluna falsa) — DEVE falhar**

Run:
```bash
cp scripts/smoke/manifest.tsv /tmp/manifest.bak
printf 'fake_table\ttenant_telefone\tlinha falsa de teste\n' >> scripts/smoke/manifest.tsv
bash scripts/smoke/preflight.sh; echo "exit=$?"
cp /tmp/manifest.bak scripts/smoke/manifest.tsv
```
Expected: `ERRO: tabela 'fake_table' nao existe no schema.`, `FALHOU: schema divergiu...`, `exit=1`. Depois o manifest volta ao original.

- [ ] **Step 4: Confirmar que o manifest voltou ao original (7 linhas)**

Run: `bash -c 'source scripts/smoke/lib.sh && smoke_manifest_rows | wc -l'`
Expected: `7`.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke/preflight.sh
git commit -m "feat(smoke): preflight.sh — valida manifest vs schema, aborta com fix"
```

---

## Task 6: `scripts/smoke/clean.sh`

**Files:**
- Create: `scripts/smoke/clean.sh`

- [ ] **Step 1: Criar `scripts/smoke/clean.sh`**

```bash
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
```

- [ ] **Step 2: Rodar clean no telefone de teste (idempotência — pode já estar limpo)**

Run: `bash scripts/smoke/clean.sh 5521970789797 --yes; echo "exit=$?"`
Expected: ou `Ja esta limpo. Nada a fazer.` (`exit=0`), ou o ciclo preview→delete→`total residuo: 0` + `Limpo...` (`exit=0`).

- [ ] **Step 3: Rodar de novo pra confirmar idempotência**

Run: `bash scripts/smoke/clean.sh 5521970789797 --yes; echo "exit=$?"`
Expected: `Ja esta limpo. Nada a fazer.` e `exit=0`.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke/clean.sh
git commit -m "feat(smoke): clean.sh — limpeza manifest-driven com preflight+verify"
```

---

## Task 7: `scripts/smoke/tail.sh`

**Files:**
- Create: `scripts/smoke/tail.sh`

- [ ] **Step 1: Criar `scripts/smoke/tail.sh`**

```bash
#!/usr/bin/env bash
# scripts/smoke/tail.sh
# Tail paralelo de Pages (inkflow-saas) + cron Worker (inkflow-cron), prefixado.
# Assume `wrangler login` feito (ou CLOUDFLARE_API_TOKEN no ambiente).
# Uso: bash scripts/smoke/tail.sh [--pages-only|--cron-only]
set -euo pipefail
MODE="both"
case "${1:-}" in
  --pages-only) MODE="pages" ;;
  --cron-only)  MODE="cron" ;;
  "" ) ;;
  *) echo "ERRO: flag desconhecida: $1 (use --pages-only|--cron-only)" >&2; exit 1 ;;
esac
command -v npx >/dev/null 2>&1 || { echo "ERRO: npx/wrangler nao encontrado." >&2; exit 1; }

pids=()
cleanup() { for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

# awk fflush() => prefixo line-buffered portavel (macOS BSD sed nao tem -u).
if [ "$MODE" != "cron" ]; then
  ( npx wrangler pages deployment tail --project-name inkflow-saas --format pretty 2>&1 \
      | awk '{ print "[pages] " $0; fflush() }' ) &
  pids+=($!)
fi
if [ "$MODE" != "pages" ]; then
  ( npx wrangler tail inkflow-cron --format pretty 2>&1 \
      | awk '{ print "[cron]  " $0; fflush() }' ) &
  pids+=($!)
fi

echo "Tailing (${MODE}). Ctrl-C pra parar."
wait
```

- [ ] **Step 2: Smoke-check de sintaxe (sem conectar)**

Run: `bash -n scripts/smoke/tail.sh && echo "sintaxe OK"`
Expected: `sintaxe OK`.

- [ ] **Step 3: Validar que flag inválida é rejeitada**

Run: `bash scripts/smoke/tail.sh --xpto; echo "exit=$?"`
Expected: mensagem de erro + `exit=1`.

- [ ] **Step 4: (Manual, opcional) Validar tail real em ambiente com wrangler logado**

Run: `bash scripts/smoke/tail.sh --cron-only` (Ctrl-C pra sair)
Expected: linhas prefixadas `[cron] ...` ou prompt de auth do wrangler se não logado.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke/tail.sh
git commit -m "feat(smoke): tail.sh — tail paralelo Pages+cron com prefixo"
```

---

## Task 8: `scripts/smoke/verify.sh`

**Files:**
- Create: `scripts/smoke/verify.sh`

- [ ] **Step 1: Criar `scripts/smoke/verify.sh`**

```bash
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
```

- [ ] **Step 2: Rodar o verify (lead novo após o clean)**

Run: `bash scripts/smoke/verify.sh 5521970789797`
Expected: `[conversas] (sem conversa — lead novo)`, `[conversa_mensagens] (vazio)`, `[agendamentos] (nenhum...)`, e counts 0 em orcamentos/tool_calls_log/logs.

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke/verify.sh
git commit -m "feat(smoke): verify.sh — snapshot read-only schema-aware (estado_agente)"
```

---

## Task 9: Runbook `docs/runbooks/smoke-coleta.md`

**Files:**
- Create: `docs/runbooks/smoke-coleta.md`

- [ ] **Step 1: Criar o runbook**

````markdown
# Runbook — Smoke da coleta (InkFlow)

Processo padrao pra rodar um smoke E2E da coleta/proposta num tenant de teste,
do zero, sem contaminacao. Tudo bash puro (curl + jq) + wrangler pro tail.

Spec/design: `docs/superpowers/specs/2026-05-22-smoke-harness-design.md`.

## Pre-requisitos

- `.dev.vars` na raiz com `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- `jq` e `curl` instalados.
- `wrangler login` feito (ou `CLOUDFLARE_API_TOKEN` no ambiente) — so pro tail.
- Tenant de teste: `db686ef2-...` (InkFlow Sub4 Test). Telefone: `5521970789797`.

## Fluxo

1. **Validar schema** (nunca limpa com schema divergente):
   ```bash
   bash scripts/smoke/preflight.sh
   ```
   Espera `OK: schema valido`. Avisos sobre `chat_messages`/`chats`/`dados_cliente`
   sao esperados (vestigiais n8n, fora do manifest).

2. **Limpar o terreno** (rastro de conversa do telefone de teste):
   ```bash
   bash scripts/smoke/clean.sh 5521970789797
   ```
   Confirma o DELETE; ao final `total residuo: 0`.

3. **Ligar o tail** (noutro terminal, deixa rodando):
   ```bash
   bash scripts/smoke/tail.sh
   ```
   Linhas prefixadas `[pages]` / `[cron]`.

4. **Executar os roteiros** pelo WhatsApp (tabela abaixo).

5. **Inspecionar entre passos**:
   ```bash
   bash scripts/smoke/verify.sh 5521970789797
   ```

## Template de roteiro

| # | Roteiro (passos) | O que testamos | Resposta esperada | Como verificar |
|---|---|---|---|---|
| - | (passos numerados do que digitar no WhatsApp) | (a regra/comportamento sob teste) | (o que o bot/estado deve fazer) | (campo no `verify.sh` ou linha no tail) |

## Roteiros atuais (pos-refator coleta/proposta — commit 82726de)

| # | Roteiro | O que testamos | Resposta esperada | Como verificar |
|---|---|---|---|---|
| R1 | Ir ate cadastro; dizer "tenho 30 anos"; depois "nasci em 15/03/1996" | S1: idade solta nao vira data_nascimento | `data_nascimento` segue null apos idade; bot pede a data; persiste so apos data explicita | `verify.sh` -> `[conversas] data_nasc` |
| R2 | Acionar reentrada automatica; cliente responde depois | S2: reentrada entra no historico do agente | Fala automatica aparece em `conversa_mensagens` (type=ai); bot nao age como se nada tivesse acontecido | `verify.sh` -> `[conversa_mensagens]` |
| R3 | Em proposta, aceitar valor; antes de escolher slot, "manda o pix" | S3: sem Pix antes do horario | Bot pede pra escolher horario; sem agendamento/mp_payment_id | `verify.sh` -> `[agendamentos]` vazio; tail `[cron]` sem reservar-horario |
| R4 | Resposta com confirmacao+pergunta; reentrada; confirmacao pos-pagamento | S4/S5: baloes por `\n\n` | Textos separados por linha em branco saem como mensagens separadas | `verify.sh` -> content com ⏎; tail Evolution |
| R5 | Briefing com local "perna"; pedir desconto; escolher horario | Proposta + briefing | Briefing "na perna"; bot nao confirma desconto sozinho; confirma dia/horario ao escolher | `verify.sh` -> `[conversas] valor_proposto`; tail briefing |

## Sinais de regressao (abrir item se aparecer)

- `data_nascimento` nasce de idade solta.
- Reentrada aparece no WhatsApp mas nao entra no historico do agente.
- Pix/sinal gerado antes do slot escolhido.
- Texto com `\n\n` chega em um unico balao.
- Bot confirma desconto sem decisao do tatuador.
- Briefing volta a escrever "no perna".
````

- [ ] **Step 2: Verificar que o runbook referencia os scripts certos**

Run: `grep -c "scripts/smoke/" docs/runbooks/smoke-coleta.md`
Expected: `>= 4` (preflight, clean, tail, verify).

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/smoke-coleta.md
git commit -m "docs(smoke): runbook smoke-coleta com template de roteiro + R1-R5"
```

---

## Task 10: Remover scripts antigos + checagem final

**Files:**
- Delete: `scripts/cleanup-conversa-teste.sh`, `scripts/smoke-verify.sh`

- [ ] **Step 1: Confirmar que nada referencia os scripts antigos**

Run: `grep -rn "cleanup-conversa-teste\|smoke-verify" --include='*.md' --include='*.sh' --include='*.mjs' --include='*.js' . | grep -v node_modules | grep -v docs/superpowers/specs/2026-05-22-smoke-harness`
Expected: nenhuma saída relevante (se houver, atualizar a referência pro novo caminho `scripts/smoke/`).

- [ ] **Step 2: Remover os scripts antigos**

Run:
```bash
git rm scripts/cleanup-conversa-teste.sh scripts/smoke-verify.sh
```

- [ ] **Step 3: Conferir que o novo harness está completo**

Run: `ls scripts/smoke/`
Expected: `clean.sh  lib.sh  manifest.tsv  preflight.sh  tail.sh  verify.sh`.

- [ ] **Step 4: Suíte de testes completa (garante que nada quebrou)**

Run: `npm test`
Expected: todos passam, 0 falhas.

- [ ] **Step 5: Dry-run completo do harness (preflight → clean idempotente → verify)**

Run:
```bash
bash scripts/smoke/preflight.sh && \
bash scripts/smoke/clean.sh 5521970789797 --yes && \
bash scripts/smoke/verify.sh 5521970789797
```
Expected: preflight `OK`, clean `Ja esta limpo` (ou residuo 0), verify mostra lead novo.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(smoke): remove scripts antigos (substituidos por scripts/smoke/)"
```

---

## Self-Review (preenchido)

**Spec coverage:**
- §4 estrutura `scripts/smoke/` → Tasks 3–8. ✓
- §5 manifest com colunas verificadas → Task 4 (+ validado em Task 5). ✓
- §6.2 preflight (valida + aborta + avisa órfãs) → Task 5. ✓
- §6.3 clean (preflight→preview→delete ordenado→verify, via_conversa) → Task 6. ✓
- §6.4 tail Pages+cron → Task 7. ✓
- §6.5 verify schema-aware com estado_agente → Task 8. ✓
- §7 runbook + template + R1–R5 → Task 9. ✓
- §8.1 remove dead code chat_messages → Task 1. ✓
- §8.2 corrige estado_atual→estado_agente → Task 2. ✓
- §4 substituir scripts antigos → Task 10. ✓
- §9 testes do harness (drift, idempotência) → Task 5 step 3, Task 6 steps 2-3. ✓

**Placeholder scan:** sem TBD/TODO; todo script tem conteúdo completo; o `<commit>` da memória (Task 2) é preenchido com o nome da branch, não um placeholder de código.

**Type consistency:** funções de `lib.sh` (`smoke_load_env`, `smoke_swagger`, `smoke_table_exists`, `smoke_col_exists`, `smoke_count`, `smoke_del_count`, `smoke_get_ids`, `smoke_manifest_rows`, `cols_for_strategy`) usadas com os mesmos nomes/assinaturas em preflight.sh, clean.sh e verify.sh. Estratégias do manifest (`tenant_telefone`, `tenant_cliente_telefone`, `session_id`, `via_conversa`) batem entre `cols_for_strategy()` e `filter_for()`. ✓
