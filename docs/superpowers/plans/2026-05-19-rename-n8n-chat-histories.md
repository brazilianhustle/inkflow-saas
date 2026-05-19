# PR-A: Rename `n8n_chat_histories` → `conversa_mensagens`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renomear a tabela legacy `n8n_chat_histories` (resíduo do n8n decommission de 13/05) para `conversa_mensagens` em DB + código + tests + docs. Pré-requisito hard pro PR-B (feat coleta fotos Telegram).

**Architecture:** Migration `ALTER TABLE RENAME` atomic dentro de transação (segundos de lock) + rename de índices, PK, trigger e policies que carregam o nome antigo. Code change refatorado em commits separados, deploy junto com a migration apply pra minimizar janela em que código aponta pra tabela que não existe.

**Tech Stack:** Postgres (Supabase), Cloudflare Pages Functions, vitest (node:test). Sem deps novas. Risco baixo: rename é metadata-only no Postgres, dados intactos.

---

## Pré-deploy: checks ambientais

```bash
# Branch limpa
git checkout main && git pull
git checkout -b feat/rename-n8n-chat-histories

# Suite verde de base (antes de qualquer mudança)
npm test 2>&1 | tail -5
# Esperado: tests pass, 0 fail

# Contagem inicial de refs (para diff)
grep -rn "n8n_chat_histories" functions/ tests/ supabase/baseline-schema.sql studio.html 2>/dev/null | wc -l
# Esperado: 37
```

---

## Inventário do que existe (do baseline-schema.sql + grep)

**Objetos DB que carregam o nome antigo:**

| Objeto | Tipo | Nome atual | Nome novo |
|--------|------|------------|-----------|
| Tabela | base | `n8n_chat_histories` | `conversa_mensagens` |
| PK | constraint | `n8n_chat_histories_pkey` | `conversa_mensagens_pkey` |
| Index | btree | `idx_chat_histories_session` | `idx_conversa_mensagens_session` |
| Trigger | AFTER INSERT | `trg_n8n_chat_histories_update_conversa` | `trg_conversa_mensagens_update_conversa` |
| Policy | RLS | `anon_no_access_chat_histories` | `anon_no_access_conversa_mensagens` |
| Policy | RLS | `service_role_chat_histories` | `service_role_conversa_mensagens` |

**Trigger function `update_conversa_last_msg_at()`** — só código, não nome de tabela. Não precisa renomear.

**Arquivos com refs ao nome antigo (37 total):**

| Categoria | Arquivos | Refs |
|-----------|----------|------|
| Produção | `functions/_lib/whatsapp-pipeline.js` (6), `functions/api/whatsapp/inbound.js` (1), `functions/api/conversas/list.js` (1), `functions/api/conversas/thread.js` (2) | 10 |
| Tests | `tests/_lib/whatsapp-pipeline.test.mjs` (5), `tests/api/conversas-thread.test.mjs` (3), `tests/api/conversas-list.test.mjs` (~10), `tests/api/whatsapp/inbound.test.mjs` (2) | ~20 |
| Docs/schema | `supabase/baseline-schema.sql` (6), `studio.html` (3 comments) | 9 |

**Arquivos NÃO modificados:** `docs/workflows/*.json` (snapshots arquivados), `docs/superpowers/plans/*.md` (history imutável), `docs/superpowers/specs/*.md` (history imutável), `supabase/migrations/2026-05-*.sql` (migrations aplicadas são imutáveis), `docs/auditoria/*.md` (history).

---

## Task 1: Criar migration SQL (sem aplicar ainda)

**Files:**
- Create: `supabase/migrations/2026-05-19-rename-n8n-chat-histories-to-conversa-mensagens.sql`

**Por quê primeiro:** o SQL é a fonte de verdade do nome novo. Cada step de rename de código aponta pra este nome.

- [ ] **Step 1: Escrever arquivo de migration**

```sql
-- supabase/migrations/2026-05-19-rename-n8n-chat-histories-to-conversa-mensagens.sql
-- Rename tabela legacy n8n_chat_histories → conversa_mensagens
-- (residuo do n8n decommission Cutover Sub-4.1, 13/05)
--
-- Risco: baixo. ALTER TABLE RENAME no Postgres eh metadata-only,
-- dados intactos. Inclui rename de PK, indexes, trigger e RLS policies
-- pra remover "chat_histories" do nome de tudo.
--
-- Janela de quebra: entre apply migration e deploy CF Pages com codigo
-- refatorado. Mitigacao: aplicar em janela de baixo trafego + deploy
-- imediato depois.

BEGIN;

-- 1) Rename tabela
ALTER TABLE public.n8n_chat_histories RENAME TO conversa_mensagens;

-- 2) Rename primary key constraint
ALTER INDEX public.n8n_chat_histories_pkey RENAME TO conversa_mensagens_pkey;

-- 3) Rename index session_id
ALTER INDEX public.idx_chat_histories_session RENAME TO idx_conversa_mensagens_session;

-- 4) Rename trigger
ALTER TRIGGER trg_n8n_chat_histories_update_conversa
  ON public.conversa_mensagens
  RENAME TO trg_conversa_mensagens_update_conversa;

-- 5) Rename RLS policies (drop+create — Postgres nao tem ALTER POLICY ... RENAME pre-15)
-- (Se o projeto ja estiver no PG 15+, pode usar ALTER POLICY ... RENAME TO ...
--  mas drop+create eh portavel)
DROP POLICY IF EXISTS anon_no_access_chat_histories ON public.conversa_mensagens;
DROP POLICY IF EXISTS service_role_chat_histories   ON public.conversa_mensagens;

CREATE POLICY anon_no_access_conversa_mensagens
  ON public.conversa_mensagens
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY service_role_conversa_mensagens
  ON public.conversa_mensagens
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
```

- [ ] **Step 2: Verificar sintaxe SQL (sem aplicar)**

```bash
# Validacao sintatica via psql --dry-run (se tiver) ou usando pglint local;
# alternativa: passar o arquivo pelo Supabase SQL editor com EXPLAIN.
# Para validar localmente:
cat supabase/migrations/2026-05-19-rename-n8n-chat-histories-to-conversa-mensagens.sql | head -5
# Confirma que o BEGIN/COMMIT estao presentes
```

- [ ] **Step 3: Validar com agente Supabase** (recomendado)

Antes de aplicar, perguntar ao agente Supabase via MCP:

```
mcp__plugin_supabase_supabase__execute_sql:
  query: |
    SELECT 'objects-referencing-old-name' AS scope, COUNT(*) AS n
    FROM pg_policy
    WHERE polname IN ('anon_no_access_chat_histories', 'service_role_chat_histories')
    UNION ALL
    SELECT 'indexes-old-name', COUNT(*)
    FROM pg_indexes
    WHERE indexname IN ('idx_chat_histories_session', 'n8n_chat_histories_pkey')
    UNION ALL
    SELECT 'triggers-old-name', COUNT(*)
    FROM information_schema.triggers
    WHERE trigger_name = 'trg_n8n_chat_histories_update_conversa'
    UNION ALL
    SELECT 'table-old-name', COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'n8n_chat_histories';
```

Esperado: cada linha com `n=1` ou `n=2` (políticas). Se algum vier 0, **PARAR**: o baseline está fora de sync com prod e a migration vai falhar.

- [ ] **Step 4: Commit (sem deploy)**

```bash
git add supabase/migrations/2026-05-19-rename-n8n-chat-histories-to-conversa-mensagens.sql
git commit -m "feat(db): migration rename n8n_chat_histories para conversa_mensagens (sem apply)"
```

---

## Task 2: Refator código produção (functions/)

**Files:**
- Modify: `functions/_lib/whatsapp-pipeline.js` (linhas 104, 119, 173, 174, 233, 240)
- Modify: `functions/api/whatsapp/inbound.js` (linha 60)
- Modify: `functions/api/conversas/list.js` (linha 125)
- Modify: `functions/api/conversas/thread.js` (linhas 100, 105 — incluindo log message)

**Por quê separado dos tests:** se rolar regressão, queremos isolar entre "código quebrou" vs "test quebrou". Mantém git blame limpo.

- [ ] **Step 1: Baseline grep antes do rename**

```bash
grep -rn "n8n_chat_histories" functions/ 2>/dev/null | wc -l
# Esperado: 10
```

- [ ] **Step 2: Bulk replace via sed (in-place, BSD sed do macOS)**

```bash
# macOS sed precisa do '' apos -i
for f in \
  functions/_lib/whatsapp-pipeline.js \
  functions/api/whatsapp/inbound.js \
  functions/api/conversas/list.js \
  functions/api/conversas/thread.js
do
  sed -i '' 's|/rest/v1/n8n_chat_histories|/rest/v1/conversa_mensagens|g' "$f"
done

# Comentarios e log messages: rename literal n8n_chat_histories → conversa_mensagens
for f in functions/_lib/whatsapp-pipeline.js functions/api/conversas/thread.js
do
  sed -i '' 's|n8n_chat_histories|conversa_mensagens|g' "$f"
done
```

- [ ] **Step 3: Verificar 0 refs residuais em produção**

```bash
grep -rn "n8n_chat_histories" functions/ 2>/dev/null
# Esperado: (vazio)
```

Se sobrar alguma ref, ler o arquivo e ajustar manualmente — talvez seja interpolação dinâmica que escapou do sed.

- [ ] **Step 4: Validar visualmente os arquivos modificados**

```bash
git diff functions/
```

Esperado: cada substituição faz sentido, nada quebrado por replace overzealous.

Atenção especial às linhas:
- `functions/_lib/whatsapp-pipeline.js:173` — comment `// Etapa 6: INSERT n8n_chat_histories OUT` → `// Etapa 6: INSERT conversa_mensagens OUT`
- `functions/api/conversas/thread.js:105` — log message `'thread: GET n8n_chat_histories falhou'` → `'thread: GET conversa_mensagens falhou'`

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/whatsapp-pipeline.js functions/api/whatsapp/inbound.js functions/api/conversas/list.js functions/api/conversas/thread.js
git commit -m "refactor(functions): rename refs n8n_chat_histories para conversa_mensagens"
```

---

## Task 3: Refator tests + baseline-schema + studio.html

**Files:**
- Modify: `tests/_lib/whatsapp-pipeline.test.mjs` (5 refs)
- Modify: `tests/api/conversas-thread.test.mjs` (3 refs)
- Modify: `tests/api/conversas-list.test.mjs` (~10 refs)
- Modify: `tests/api/whatsapp/inbound.test.mjs` (2 refs)
- Modify: `supabase/baseline-schema.sql` (6 refs em comments + objetos renomeados)
- Modify: `studio.html` (3 comments)

- [ ] **Step 1: Baseline grep antes do rename**

```bash
grep -rn "n8n_chat_histories" tests/ supabase/baseline-schema.sql studio.html 2>/dev/null | wc -l
# Esperado: ~30 (varia exato)
```

- [ ] **Step 2: Bulk replace nos tests**

```bash
for f in \
  tests/_lib/whatsapp-pipeline.test.mjs \
  tests/api/conversas-thread.test.mjs \
  tests/api/conversas-list.test.mjs \
  tests/api/whatsapp/inbound.test.mjs
do
  sed -i '' 's|n8n_chat_histories|conversa_mensagens|g' "$f"
done
```

- [ ] **Step 3: Rodar a suite — DEVE PASSAR (rename é puro)**

```bash
npm test 2>&1 | tail -10
# Esperado: 888 (ou contagem atual) passing, 0 failing
# Se algum falhar, ler erro: provavelmente teste tinha uma string literal
# diferente que precisa de manual fix
```

- [ ] **Step 4: Update baseline-schema.sql**

```bash
sed -i '' 's|n8n_chat_histories|conversa_mensagens|g' supabase/baseline-schema.sql
sed -i '' 's|idx_chat_histories_session|idx_conversa_mensagens_session|g' supabase/baseline-schema.sql
sed -i '' 's|anon_no_access_chat_histories|anon_no_access_conversa_mensagens|g' supabase/baseline-schema.sql
sed -i '' 's|service_role_chat_histories|service_role_conversa_mensagens|g' supabase/baseline-schema.sql
sed -i '' 's|trg_n8n_chat_histories_update_conversa|trg_conversa_mensagens_update_conversa|g' supabase/baseline-schema.sql
```

Note: o nome do PK `n8n_chat_histories_pkey` já cai no primeiro sed `n8n_chat_histories → conversa_mensagens` resultando em `conversa_mensagens_pkey` — correto.

Verificar:

```bash
grep -n "n8n_chat_histories\|chat_histories" supabase/baseline-schema.sql
# Esperado: (vazio)
```

- [ ] **Step 5: Update studio.html comments**

```bash
sed -i '' 's|n8n_chat_histories|conversa_mensagens|g' studio.html
grep -n "n8n_chat_histories" studio.html
# Esperado: (vazio)
```

- [ ] **Step 6: Verificar zero refs no projeto (exceto arquivos imutáveis)**

```bash
grep -rn "n8n_chat_histories" functions/ tests/ supabase/baseline-schema.sql studio.html 2>/dev/null
# Esperado: (vazio)

# Sanity: confirma que historico arquivado nao foi tocado
grep -rln "n8n_chat_histories" docs/superpowers/plans/ docs/superpowers/specs/ docs/workflows/ docs/auditoria/ supabase/migrations/ 2>/dev/null | head -5
# Esperado: lista de arquivos historicos (NAO devem ser tocados — sao imutaveis)
```

- [ ] **Step 7: Rodar suite final + lint**

```bash
npm test 2>&1 | tail -10
# Esperado: 0 failing

# Lint se houver
npm run lint 2>&1 | tail -10 || echo "(no lint script)"
```

- [ ] **Step 8: Commit**

```bash
git add tests/ supabase/baseline-schema.sql studio.html
git commit -m "refactor(tests+docs): rename refs n8n_chat_histories para conversa_mensagens"
```

---

## Task 4: Push + CI + abrir PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/rename-n8n-chat-histories
```

- [ ] **Step 2: Abrir PR**

```bash
gh pr create --title "refactor(db): rename n8n_chat_histories para conversa_mensagens (PR-A)" --body "$(cat <<'EOF'
## Summary
- Migration ALTER TABLE rename atomica + rename de PK, index, trigger e RLS policies
- Refator de 37 refs no codigo (functions/), tests/, baseline-schema.sql, studio.html
- Pre-requisito hard para PR-B (feat coleta fotos Telegram)

## Por que
Residuo do n8n decommission de 13/05. Mantemos o nome `n8n_chat_histories` em DB ate hoje so por preguica. Antes de adicionar novos campos (foto file_ids, msg_ids), limpamos o nome.

## Risco
- Rename ALTER TABLE: metadata-only, segundos de lock. Dados intactos.
- Janela curta entre apply migration e deploy CF Pages — mitigar com cutover em janela de baixo trafego.
- Rollback: revert do PR + migration inversa (`ALTER TABLE conversa_mensagens RENAME TO n8n_chat_histories` + reverter rename de indexes/policies/trigger).

## Test plan
- [x] Suite local verde apos rename (puro rename, zero mudanca de comportamento)
- [ ] CI 7/7 verde
- [ ] Apply migration via Supabase MCP em janela combinada
- [ ] Smoke pos-deploy: webhook inbound real + leitura via /api/conversas/thread
- [ ] Verify no DB: SELECT to_regclass('public.conversa_mensagens') retorna nome novo

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Aguardar CI**

```bash
gh pr checks --watch
```

Expected: todos os checks verde. **NÃO MERGEAR AINDA** — precisa coordenar com apply da migration.

- [ ] **Step 4: Code review humano (opcional)**

Se quiser revisão extra antes do cutover, peça approve do segundo par de olhos. Rename mecânico é baixo risco, mas a janela de cutover requer atenção.

---

## Task 5: Cutover — apply migration + merge + smoke pós-deploy

**Janela de quebra:** entre apply migration (DB já tem nome novo) e CF Pages pegar o build novo (~2-5min) o código antigo em prod aponta pra tabela que não existe → 500s em `/api/whatsapp/inbound`, `/api/conversas/*`, etc.

**Estratégia:** executar em janela de baixo tráfego (madrugada BRT idealmente, ou pelo menos sem campanha ativa) com `wrangler tail` aberto pra detectar erros.

- [ ] **Step 1: Pré-cutover checks**

```bash
# Confirma branch atualizada com main
git fetch origin
git status -uno
# Esperado: branch ahead, nada behind main que requer rebase

# CI 7/7 verde
gh pr checks
# Esperado: all green

# Snapshot do estado do DB ANTES (pra rollback comparison)
# Via Supabase MCP execute_sql:
# SELECT COUNT(*) FROM n8n_chat_histories;
# Anota o numero como pre_cutover_row_count
```

- [ ] **Step 2: Abrir 2 terminais paralelos**

Terminal A — wrangler tail (vai capturar 500s da janela):

```bash
npx wrangler pages deployment tail --project-name inkflow-saas
```

Terminal B — onde rodar os comandos abaixo.

- [ ] **Step 3: Apply migration via Supabase MCP**

Comando agente Supabase:

```
mcp__plugin_supabase_supabase__apply_migration:
  name: 2026-05-19-rename-n8n-chat-histories-to-conversa-mensagens
  query: <conteudo do arquivo supabase/migrations/2026-05-19-rename-n8n-chat-histories-to-conversa-mensagens.sql>
```

Esperado: success. Janela de lock < 5 segundos.

Imediatamente validar:

```sql
-- Via execute_sql
SELECT to_regclass('public.conversa_mensagens')::text AS nome_novo,
       to_regclass('public.n8n_chat_histories')::text AS nome_antigo,
       (SELECT COUNT(*) FROM public.conversa_mensagens) AS linhas;
```

Esperado: `nome_novo='conversa_mensagens'`, `nome_antigo=NULL`, `linhas=pre_cutover_row_count`.

- [ ] **Step 4: Merge PR imediatamente**

```bash
gh pr merge --squash --delete-branch
```

CF Pages dispara build automático. Acompanhar:

```bash
gh run watch
# OU: npx wrangler pages deployment list --project-name inkflow-saas | head -5
```

Esperado: deploy completo em 2-5min.

- [ ] **Step 5: Monitorar wrangler tail durante a janela**

Esperado em Terminal A:
- Talvez 1-5 erros `n8n_chat_histories does not exist` se webhook chegou ANTES do deploy completar
- Após deploy completar: zero erros desse tipo
- Erros temporários são aceitos — Evolution faz retry e o cliente nem percebe

Se ver volume alto de erros (>10), considerar rollback emergencial (Step 7).

- [ ] **Step 6: Smoke pós-deploy**

```bash
# 1) Health endpoint
curl -sS https://inkflow-saas.pages.dev/api/health | head -5

# 2) Triggerar fluxo real com tenant de teste
# WhatsApp do tenant teste: enviar "ping" → bot responde
# Verificar:
#   - log Cloudflare nao mostra erro de tabela inexistente
#   - SELECT COUNT(*) FROM conversa_mensagens incrementa
```

Via Supabase MCP:

```sql
SELECT id, status, message->>'type' AS tipo, created_at
FROM public.conversa_mensagens
ORDER BY id DESC LIMIT 3;
-- Esperado: linhas novas com status='processed' OU 'received' (em flight)
```

```bash
# 3) Smoke do dashboard
curl -sS -H "Cookie: ..." https://inkflow-saas.pages.dev/api/conversas/list?tenant_id=... | jq '.[] | .telefone' | head -3
# Esperado: lista de conversas (nao 500)
```

- [ ] **Step 7: Rollback (só se Step 5/6 falhar gravemente)**

Se erros catastróficos:

```bash
# Reverter merge
gh pr list --state merged --limit 1
# pegar numero do PR mergeado, ex: 80
git checkout main && git pull
git revert -m 1 <merge-sha>
git push origin main
# CF Pages dispara redeploy com codigo antigo
```

E migration inversa via Supabase MCP:

```sql
BEGIN;
ALTER TABLE public.conversa_mensagens RENAME TO n8n_chat_histories;
ALTER INDEX public.conversa_mensagens_pkey RENAME TO n8n_chat_histories_pkey;
ALTER INDEX public.idx_conversa_mensagens_session RENAME TO idx_chat_histories_session;
ALTER TRIGGER trg_conversa_mensagens_update_conversa
  ON public.n8n_chat_histories
  RENAME TO trg_n8n_chat_histories_update_conversa;
DROP POLICY IF EXISTS anon_no_access_conversa_mensagens ON public.n8n_chat_histories;
DROP POLICY IF EXISTS service_role_conversa_mensagens   ON public.n8n_chat_histories;
CREATE POLICY anon_no_access_chat_histories
  ON public.n8n_chat_histories AS PERMISSIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);
CREATE POLICY service_role_chat_histories
  ON public.n8n_chat_histories AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);
COMMIT;
```

- [ ] **Step 8: DoD checklist**

- [x] Migration aplicada com sucesso (Step 3)
- [x] PR mergeado e CF Pages deploy verde (Step 4)
- [x] `to_regclass('public.conversa_mensagens')` retorna nome novo
- [x] `to_regclass('public.n8n_chat_histories')` retorna NULL
- [x] Row count preservado (zero perda de dados)
- [x] Smoke E2E: webhook real funciona, dashboard lista conversas
- [x] Wrangler tail sem erros de tabela inexistente (após deploy completar)
- [x] Branch `feat/rename-n8n-chat-histories` deletada

- [ ] **Step 9: Atualizar `.claude/active-branch` (opcional, housekeeping)**

```bash
echo "feat/coleta-fotos-telegram-storage" > .claude/active-branch
```

(Próxima feature já está apontada — PR-B fica desbloqueado.)

---

## Self-review checklist

**1. Spec coverage:**

- Migration ALTER TABLE rename → Task 1 ✓
- Rename de PK, index, trigger, policies → Task 1 ✓
- Refator código produção (4 arquivos) → Task 2 ✓
- Refator tests (4 arquivos) → Task 3 ✓
- Update baseline-schema.sql → Task 3 ✓
- Update studio.html comments → Task 3 ✓
- Apply migration coordenada com merge → Task 5 ✓
- Smoke pós-deploy → Task 5 ✓
- Rollback documentado → Task 5 step 7 ✓
- Imutabilidade de arquivos history respeitada (plans/specs/workflows/auditoria) → bloco inventário + Task 3 step 6 sanity check ✓

**2. Naming consistency:**

- `conversa_mensagens` (tabela) usado em todos os SQL e code refs ✓
- `idx_conversa_mensagens_session`, `conversa_mensagens_pkey`, `trg_conversa_mensagens_update_conversa` consistentes entre migration (Task 1), baseline update (Task 3), rollback (Task 5) ✓
- Policy names `anon_no_access_conversa_mensagens`, `service_role_conversa_mensagens` consistentes ✓

**3. Placeholder scan:** clean — cada step tem comando concreto, sem TBD/TODO.

**Riscos do plano:**

- **Risco 1 (alto):** Janela entre apply migration e deploy CF Pages — código antigo em prod aponta pra tabela inexistente. Mitigação: janela de baixo tráfego + wrangler tail aberto + rollback documentado.
- **Risco 2:** Erros temporários em webhooks durante a janela são aceitáveis (Evolution retries + cliente WhatsApp não percebe latência de 2-5min em msgs raras). Se ver volume alto (>10 erros), rollback.
- **Risco 3:** Tests podem falhar se algum tinha string hardcoded fora dos padrões que o sed pega. Task 3 step 3 detecta logo.
- **Risco 4:** Baseline schema é doc, não enforço — se faltou atualizar uma linha, próxima auditoria pega. Task 3 step 4 cobre via greps abrangentes.
- **Risco 5:** Arquivos de migration histórica (em `supabase/migrations/`) continuam referenciando o nome antigo — **isso é correto**, migrations são imutáveis. Não tocar.
- **Risco 6:** Postgres versão pode não suportar `ALTER POLICY ... RENAME` (PG < 15). Migration usa drop+create que é portável — OK.

**Estimativa total:** 1.5-2h de execução (Tasks 1-4 são ~1h de código, Task 5 cutover é ~30min com observação).

**Próximo passo após este PR-A mergeado:** rebase `feat/coleta-fotos-telegram-storage` em main e executar `/superpowers:subagent-driven-development docs/superpowers/plans/2026-05-19-coleta-fotos-telegram-storage.md`.
