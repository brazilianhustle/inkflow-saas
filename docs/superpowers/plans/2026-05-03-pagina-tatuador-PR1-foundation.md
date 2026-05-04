# PR 1 Foundation — Sidebar de 8 painéis + eliminação de "Artistas do estúdio" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar `studio.html` da página do tatuador de 4 abas pra 8 painéis (9 no Modo Exato com Calculadora InkFlow placeholder), eliminar a feature "Artistas do estúdio" por completo do SaaS (schema, prompts, planos, UI, endpoints), criar componente toggle pill reutilizável, adicionar header com 2 indicadores discretos (WhatsApp + Telegram), e deixar 4 painéis novos como placeholders prontos pros PRs subsequentes (Portfólio, Sugestões, Suporte, Settings).

**Architecture:** Foundation puro — nenhum painel novo ganha funcionalidade real neste PR. A sidebar passa a ter 8 ícones (9 no Exato). 4 painéis ainda vazios (`<div>` com `Em breve — feature do PR N`). Schema migration drop colunas `is_artist_slot`, `parent_tenant_id`, `max_artists` em `tenants` + drop colunas `is_artist_invite`, `parent_tenant_id` em `onboarding_links`; add colunas `ativo_ate`, `deletado_em`, `config_notificacoes` em `tenants`; add colunas `estado_agente_anterior`, `pausada_em` em `conversas` e estende CHECK constraint pra incluir `pausada_tatuador`. Endpoint `create-artist-invite.js` deletado. `update-tenant.js` rejeita campos de Artistas e aceita os novos.

**Tech Stack:** HTML+CSS+JS vanilla (sem framework), Cloudflare Pages Functions (Node 20+ runtime), Supabase Postgres, `node --test` pra validação de update-tenant. Sem dependências novas.

**Branch:** `feat/pagina-tatuador-pr1-foundation` saindo de `main`.

**Spec mestre:** [`docs/superpowers/specs/2026-05-03-pagina-tatuador-refactor-design.md`](../specs/2026-05-03-pagina-tatuador-refactor-design.md)
**Plano-mestre:** [`docs/superpowers/plans/2026-05-03-pagina-tatuador-MASTER.md`](./2026-05-03-pagina-tatuador-MASTER.md)

---

## Pre-conditions

1. Coleta v2 backend já em produção (PRs #19 + #20 mergeados em main 03/05) ✅
2. Branch `main` atualizada e clean (sem mudanças não-commitadas)
3. Bateria de testes existente em `main` verde — `npm test` retorna 0 falhas
4. Acesso ao Supabase Dashboard pra aplicar migration SQL após merge

---

## File Structure

**Novos arquivos:**

```
supabase/migrations/
└── 2026-05-03-pagina-tatuador-foundation.sql       ← schema deltas Artistas + novos campos

scripts/
└── audit-artistas-refs.sh                          ← (opcional, descartável após Task 1) — gera inventário
```

**Arquivos modificados:**

```
studio.html                                          ← sidebar 8 painéis, toggle component, header indicadores, 4 placeholders, remoção total Artistas
onboarding.html                                      ← remoção da invite-section CSS+HTML+JS + correção copy planos (sem "tatuadores")
admin.html                                           ← remoção da visualização de Artistas (linhas 664, 692, 779-826)
functions/api/update-tenant.js                       ← remove campos Artistas de SETTABLE_FIELDS + remove valor 'artista_slot' de MODOS_ATENDIMENTO + accept ativo_ate, deletado_em, config_notificacoes, estado_agente_anterior, pausada_em
functions/api/validate-onboarding-key.js             ← remove lógica is_artist_invite + parent_tenant_id no select e response
tests/update-tenant-validation.test.mjs              ← adiciona testes pros campos novos + remove testes que usam parent_tenant_id/is_artist_slot
```

**Arquivos deletados:**

```
functions/api/create-artist-invite.js                ← endpoint completo
```

**Sem mudança (verificar):**

```
functions/_lib/plans.js                              ← já está limpo (sem max_artists/slots) — só verificar
functions/_lib/prompts/_shared/                      ← audit em busca de "artistas do estúdio", "outros tatuadores", "artista vinculado"
functions/_lib/prompts/coleta/{tattoo,cadastro,proposta}/  ← idem audit
functions/_lib/prompts/exato/                        ← idem audit
```

---

## Task 0: Pre-flight — branch, baseline, sanity

**Files:** nenhum

- [ ] **Step 1: Atualizar `main` local e criar branch**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git checkout main
git pull origin main
git checkout -b feat/pagina-tatuador-pr1-foundation
```

Expected: branch nova criada, working tree clean.

- [ ] **Step 2: Rodar baseline de testes — capturar resultado pra comparação no fim**

```bash
npm test 2>&1 | tee /tmp/baseline-pr1.log | tail -10
```

Expected: todos os tests passam (`pass` count > 0, `fail` count = 0). Se algum falha aqui, **NÃO seguir** — corrigir baseline antes de começar refactor.

- [ ] **Step 3: Verificar branch limpa e tests verdes**

```bash
git status
grep -E "^# (pass|fail|tests)" /tmp/baseline-pr1.log
```

Expected: `git status` mostra `nothing to commit, working tree clean`. Log mostra `# fail 0`.

- [ ] **Step 4: Commit empty pre-flight marker (opcional, ajuda tracking)**

Pular este step — pre-flight não merece commit.

---

## Task 1: Audit completo de referências a "Artistas do estúdio"

**Files:**
- Create: `scripts/audit-artistas-refs.sh` (descartável após Task 1)

- [ ] **Step 1: Criar script de audit**

Conteúdo de `scripts/audit-artistas-refs.sh`:

```bash
#!/bin/bash
# Audit: lista todas as referências a "Artistas do estúdio" no codebase
# Saída: stdout com 4 seções (schema, frontend, backend, prompts)
# Uso: bash scripts/audit-artistas-refs.sh
# Descartável: deletar após PR 1 merged.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "═══ 1. Schema (colunas tenants/onboarding_links) ═══"
grep -rn "is_artist_slot\|parent_tenant_id\|max_artists\|artista_slot\|is_artist_invite" \
  --include="*.js" --include="*.sql" --include="*.html" \
  --exclude-dir=node_modules --exclude-dir=.superpowers --exclude-dir=docs \
  | sort -u || true

echo ""
echo "═══ 2. Frontend (texto visível ao tatuador) ═══"
grep -rn "Artista\|artistas\|Convidar\|invite-" \
  --include="*.html" \
  --exclude-dir=node_modules --exclude-dir=.superpowers --exclude-dir=docs \
  | grep -iE "estudio|tatuador|estud|artist" \
  | sort -u || true

echo ""
echo "═══ 3. Backend (endpoints e lib) ═══"
ls functions/api/*invite* functions/api/*artist* 2>/dev/null || echo "(nenhum)"

echo ""
echo "═══ 4. Prompts (refs a multi-tatuador) ═══"
grep -rn "tatuadores do estudio\|tatuadores do estúdio\|artistas do estudio\|artistas do estúdio\|outros tatuadores\|outros artistas" \
  functions/_lib/prompts/ 2>/dev/null || echo "(nenhum)"

echo ""
echo "═══ Audit concluído ═══"
```

- [ ] **Step 2: Tornar script executável e rodar**

```bash
chmod +x scripts/audit-artistas-refs.sh
bash scripts/audit-artistas-refs.sh > /tmp/audit-artistas.txt
cat /tmp/audit-artistas.txt
```

Expected: lista com refs em:
- `studio.html` (sidebar antiga, slots-section, invite-section, modal welcome)
- `onboarding.html` (invite-section CSS, "tatuadores" no copy dos planos linhas ~525/538)
- `admin.html` (linhas ~664, 692, 779-826)
- `functions/api/update-tenant.js` (linhas ~30, 41, 56)
- `functions/api/validate-onboarding-key.js` (linhas ~9, 68, 123, 127-133)
- `functions/api/create-artist-invite.js` (arquivo inteiro)
- Schema: nenhuma migration tem essas colunas (foram criadas direto no Dashboard)
- Prompts: idealmente vazio (mas confirmar)

- [ ] **Step 3: Validar manualmente que cobertura está completa**

Comparar saída do audit com a tabela de "Arquivos modificados" da seção File Structure deste plano. Se tiver algum arquivo no audit que NÃO está listado na File Structure, atualizar este plano antes de seguir.

- [ ] **Step 4: Commit do script de audit**

```bash
git add scripts/audit-artistas-refs.sh
git commit -m "chore(pr1): script de audit de referências a Artistas do estúdio"
```

---

## Task 2: Migration SQL — drop colunas Artistas + add novos campos

**Files:**
- Create: `supabase/migrations/2026-05-03-pagina-tatuador-foundation.sql`

- [ ] **Step 1: Escrever migration SQL**

Conteúdo de `supabase/migrations/2026-05-03-pagina-tatuador-foundation.sql`:

```sql
-- ═════════════════════════════════════════════════════════════════════════
-- Migration: Página do Tatuador Refactor — PR 1 Foundation
-- Data: 2026-05-03
-- Spec: docs/superpowers/specs/2026-05-03-pagina-tatuador-refactor-design.md
--
-- Objetivos:
-- 1. Drop colunas/valores relacionados a "Artistas do estúdio" (feature removida)
-- 2. Add colunas pra novos fluxos (cancelar plano, deletar conta, notificações)
-- 3. Add suporte ao kill-switch da IA (estado_agente_anterior, pausada_em + CHECK)
--
-- Idempotente: pode rodar múltiplas vezes sem erro.
-- Defaults seguros: zero breaking pra tenants existentes.
-- ═════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Drop colunas de Artistas em tenants ──────────────────────────────
-- Zero tenants com is_artist_slot=true em prod (validado 03/05). Sem migração de dados.
ALTER TABLE tenants DROP COLUMN IF EXISTS is_artist_slot;
ALTER TABLE tenants DROP COLUMN IF EXISTS parent_tenant_id;
ALTER TABLE tenants DROP COLUMN IF EXISTS max_artists;

-- ─── 2. Drop colunas de invite de Artistas em onboarding_links ───────────
ALTER TABLE onboarding_links DROP COLUMN IF EXISTS is_artist_invite;
ALTER TABLE onboarding_links DROP COLUMN IF EXISTS parent_tenant_id;

-- ─── 3. Add colunas novas em tenants ─────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ativo_ate timestamptz;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deletado_em timestamptz;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS config_notificacoes jsonb
  DEFAULT '{"email_enabled": true, "push_enabled": false}'::jsonb;

-- Garantir que tenants existentes ganhem o default em config_notificacoes
UPDATE tenants
  SET config_notificacoes = '{"email_enabled": true, "push_enabled": false}'::jsonb
  WHERE config_notificacoes IS NULL;

-- ─── 4. Add colunas + CHECK constraint estendida em conversas ────────────
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS estado_agente_anterior text;
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS pausada_em timestamptz;

-- Estende CHECK constraint de conversas.estado_agente pra aceitar 'pausada_tatuador'
-- (adicionado no PR 3, mas a constraint precisa ser tolerante já no PR 1).
ALTER TABLE conversas DROP CONSTRAINT IF EXISTS conversas_estado_agente_check;
ALTER TABLE conversas ADD CONSTRAINT conversas_estado_agente_check
  CHECK (estado_agente IN (
    'ativo',
    'coletando_tattoo',
    'coletando_cadastro',
    'aguardando_tatuador',
    'propondo_valor',
    'aguardando_decisao_desconto',
    'escolhendo_horario',
    'aguardando_sinal',
    'lead_frio',
    'fechado',
    'pausada_tatuador'
  ));

-- ─── 5. Limpar valor obsoleto modo_atendimento='artista_slot' ────────────
-- Reassign pra 'individual' (default razoável pra qualquer tenant órfão).
UPDATE tenants SET modo_atendimento = 'individual'
  WHERE modo_atendimento = 'artista_slot';

COMMIT;

-- ─── Verificação pós-migration (rodar manualmente no Dashboard) ──────────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'tenants' AND column_name IN
--   ('is_artist_slot','parent_tenant_id','max_artists','ativo_ate','deletado_em','config_notificacoes');
-- Deve retornar 3 linhas: ativo_ate, deletado_em, config_notificacoes (sem as 3 primeiras).
--
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'onboarding_links' AND column_name IN
--   ('is_artist_invite','parent_tenant_id');
-- Deve retornar 0 linhas.
--
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'conversas' AND column_name IN ('estado_agente_anterior','pausada_em');
-- Deve retornar 2 linhas.
--
-- SELECT modo_atendimento, count(*) FROM tenants GROUP BY 1;
-- Não deve mostrar 'artista_slot'.
```

- [ ] **Step 2: Validar SQL syntactically (sem aplicar)**

```bash
# psql não está instalado por default — fazer dry-run com checagem básica
test -f supabase/migrations/2026-05-03-pagina-tatuador-foundation.sql && echo "OK file exists"
grep -c "^ALTER\|^DROP\|^UPDATE\|^CREATE\|^BEGIN\|^COMMIT" supabase/migrations/2026-05-03-pagina-tatuador-foundation.sql
```

Expected: `OK file exists`. Contagem de comandos = ~14 linhas SQL (BEGIN, ALTER×8, UPDATE×2, COMMIT). Variação de ±2 aceitável.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026-05-03-pagina-tatuador-foundation.sql
git commit -m "feat(schema): migration PR1 — drop colunas Artistas + add ativo_ate/deletado_em/config_notificacoes/estado_agente_anterior/pausada_em"
```

**Note pro reviewer:** migration será aplicada manualmente no Supabase Dashboard após PR mergeado (Leandro). Não é aplicada por este PR diretamente.

---

## Task 3: Patch `update-tenant.js` — remover campos Artistas + aceitar novos

**Files:**
- Modify: `functions/api/update-tenant.js`

- [ ] **Step 1: Ler arquivo atual e localizar pontos de mudança**

```bash
grep -n "parent_tenant_id\|is_artist_slot\|max_artists\|artista_slot\|MODOS_ATENDIMENTO\|SETTABLE_FIELDS" functions/api/update-tenant.js
```

Expected: linhas ~30 (`parent_tenant_id`, `is_artist_slot` em SETTABLE_FIELDS), ~41 (comment de modo_atendimento), ~56 (`MODOS_ATENDIMENTO`).

- [ ] **Step 2: Remover `parent_tenant_id` e `is_artist_slot` de SETTABLE_FIELDS**

Editar `functions/api/update-tenant.js` linha ~30. Buscar:

```javascript
  'parent_tenant_id', 'is_artist_slot',
```

Remover essa linha completamente.

- [ ] **Step 3: Adicionar campos novos a SETTABLE_FIELDS**

No mesmo array `SETTABLE_FIELDS`, adicionar (em ordem alfabética se o array for ordenado, senão ao fim):

```javascript
  'ativo_ate', 'deletado_em', 'config_notificacoes',
  'estado_agente_anterior', 'pausada_em',
```

Nota: `estado_agente_anterior` e `pausada_em` são colunas de `conversas`, não `tenants`. Se `update-tenant.js` só atualiza `tenants`, NÃO incluir essas duas — vão pro endpoint de conversas no PR 3. Validar olhando o código: se há lógica `UPDATE tenants SET ... WHERE id = ?`, então só `ativo_ate`, `deletado_em`, `config_notificacoes` entram aqui.

- [ ] **Step 4: Remover `'artista_slot'` de `MODOS_ATENDIMENTO`**

Linha ~56:

```javascript
const MODOS_ATENDIMENTO = ['individual', 'tatuador_dono', 'recepcionista', 'artista_slot'];
```

Trocar por:

```javascript
const MODOS_ATENDIMENTO = ['individual', 'tatuador_dono', 'recepcionista'];
```

- [ ] **Step 5: Atualizar comment perto de `modo_atendimento`**

Linha ~41 atual:

```javascript
'modo_atendimento',       // TEXT: individual | tatuador_dono | recepcionista | artista_slot
```

Trocar por:

```javascript
'modo_atendimento',       // TEXT: individual | tatuador_dono | recepcionista
```

- [ ] **Step 6: Validar JS syntactically**

```bash
node --check functions/api/update-tenant.js
```

Expected: zero output (silent = OK).

- [ ] **Step 7: Commit**

```bash
git add functions/api/update-tenant.js
git commit -m "feat(api): update-tenant rejeita campos Artistas + aceita ativo_ate/deletado_em/config_notificacoes"
```

---

## Task 4: Patch `validate-onboarding-key.js` — remover lógica is_artist_invite

**Files:**
- Modify: `functions/api/validate-onboarding-key.js`

- [ ] **Step 1: Ler trechos relevantes**

```bash
grep -n "is_artist_invite\|parent_tenant_id\|is_artist_slot" functions/api/validate-onboarding-key.js
```

Expected: linhas ~9 (TENANT_SELECT inclui `is_artist_slot`), ~68 (SELECT inclui `parent_tenant_id, is_artist_invite`), ~123-133 (lógica especial pra artist invite).

- [ ] **Step 2: Remover `is_artist_slot` do TENANT_SELECT (linha ~9)**

Buscar:

```javascript
const TENANT_SELECT = 'id,ativo,welcome_shown,config_precificacao,config_agente,evo_instance,nome,nome_estudio,nome_agente,email,cidade,plano,is_artist_slot';
```

Trocar por:

```javascript
const TENANT_SELECT = 'id,ativo,welcome_shown,config_precificacao,config_agente,evo_instance,nome,nome_estudio,nome_agente,email,cidade,plano';
```

- [ ] **Step 3: Remover `parent_tenant_id, is_artist_invite` do SELECT de onboarding_links (linha ~68)**

Buscar:

```javascript
      `${SUPABASE_URL}/rest/v1/onboarding_links?key=eq.${encodeURIComponent(key)}&select=id,key,plano,email,used,expires_at,parent_tenant_id,is_artist_invite`,
```

Trocar por:

```javascript
      `${SUPABASE_URL}/rest/v1/onboarding_links?key=eq.${encodeURIComponent(key)}&select=id,key,plano,email,used,expires_at`,
```

- [ ] **Step 4: Remover `is_artist_slot` do response do tenant existente (linha ~123)**

Buscar:

```javascript
        is_artist_slot: !!existingTenant.is_artist_slot,
```

Remover essa linha completamente.

- [ ] **Step 5: Remover bloco completo de lógica artist invite (linhas ~127-140)**

Buscar bloco que começa com:

```javascript
    if (link.is_artist_invite && link.parent_tenant_id) {
      response.is_artist_invite = true;
      response.parent_tenant_id = link.parent_tenant_id;
      // ... possível fetch do parent_tenant
    }
```

Remover o bloco `if` inteiro (até o `}` correspondente).

- [ ] **Step 6: Validar JS**

```bash
node --check functions/api/validate-onboarding-key.js
```

Expected: silent.

- [ ] **Step 7: Commit**

```bash
git add functions/api/validate-onboarding-key.js
git commit -m "refactor(api): validate-onboarding-key sem lógica is_artist_invite"
```

---

## Task 5: Deletar `create-artist-invite.js`

**Files:**
- Delete: `functions/api/create-artist-invite.js`

- [ ] **Step 1: Confirmar zero callers em código de produção**

```bash
grep -rn "create-artist-invite" --include="*.js" --include="*.html" --exclude-dir=node_modules --exclude-dir=.superpowers . 2>/dev/null
```

Expected: refs apenas em `studio.html` (botão "Gerar link de convite" — esse btnvai ser removido na Task 11) e talvez `admin.html`. Após Task 11+13, refs ficam zero.

Se aparecer ref em arquivo NÃO listado pra mudança neste plano, parar e atualizar plano.

- [ ] **Step 2: Deletar arquivo**

```bash
rm functions/api/create-artist-invite.js
```

- [ ] **Step 3: Verificar deleção**

```bash
test ! -f functions/api/create-artist-invite.js && echo "DELETED"
```

Expected: `DELETED`.

- [ ] **Step 4: Commit**

```bash
git add -A functions/api/create-artist-invite.js
git commit -m "feat(api): remove endpoint create-artist-invite (feature Artistas eliminada)"
```

---

## Task 6: Audit prompts pra refs a multi-tatuador

**Files:** apenas leitura nesta task; edições só se audit retornar matches

- [ ] **Step 1: Rodar audit dirigido aos prompts**

```bash
grep -rn "tatuadores do estúdio\|tatuadores do estudio\|artistas do estúdio\|artistas do estudio\|outros tatuadores\|outros artistas\|equipe de tatuadores\|nossos artistas" \
  functions/_lib/prompts/ 2>/dev/null > /tmp/audit-prompts-multi.txt
cat /tmp/audit-prompts-multi.txt
wc -l /tmp/audit-prompts-multi.txt
```

Expected (após Coleta v2): provavelmente 0 linhas (Coleta v2 não menciona multi-tatuador). Se 0 linhas, **pular tasks 6.2-6.5** e ir direto pro commit.

- [ ] **Step 2 (condicional): Listar arquivos com matches**

Se `wc -l` > 0:

```bash
cut -d: -f1 /tmp/audit-prompts-multi.txt | sort -u
```

- [ ] **Step 3 (condicional): Editar cada arquivo manualmente**

Pra cada arquivo listado, abrir, localizar a string ofensiva (case-insensitive), e:
- Substituir "tatuadores do estúdio" → "tatuador" ou remover frase inteira (depende de contexto)
- Substituir "outros artistas" → "" ou refatorar
- Manter coerência: estúdio = local físico, tatuador = pessoa, agente = bot. Sem multi-tatuador.

- [ ] **Step 4 (condicional): Rodar snapshot tests pra confirmar zero regressão**

```bash
npm test -- tests/prompts/snapshot.test.mjs 2>&1 | tail -5
```

Expected: tests passam. Se quebra, mandar `UPDATE_SNAPSHOTS=1 npm test -- tests/prompts/snapshot.test.mjs` pra atualizar baseline e revisar diff manualmente:

```bash
git diff tests/prompts/snapshots/
```

Confirmar que o diff só remove menções a multi-tatuador, sem alterações inesperadas.

- [ ] **Step 5: Commit (sempre, mesmo se sem mudanças — pra registrar audit feito)**

Se houve edits:
```bash
git add functions/_lib/prompts/ tests/prompts/snapshots/
git commit -m "refactor(prompts): remove menções a multi-tatuador (Artistas eliminado)"
```

Se sem edits, criar commit vazio de audit:
```bash
git commit --allow-empty -m "chore(prompts): audit confirmou zero refs a multi-tatuador"
```

---

## Task 7: `studio.html` — sidebar de 4 → 8 painéis (HTML estrutural)

**Files:**
- Modify: `studio.html` (linhas ~258-286 — bloco `<nav class="sidebar">`)

- [ ] **Step 1: Localizar sidebar atual**

```bash
grep -n "class=\"sidebar\"\|class=\"nav-btn\"" studio.html | head -10
```

Expected: `<nav class="sidebar">` em ~258, 4 botões `nav-btn` (Dashboard, Agente, Conversas, Agendamentos), botão Suporte em sidebar-bottom.

- [ ] **Step 2: Substituir sidebar inteira**

Localizar bloco que vai de `<nav class="sidebar">` (linha ~258) até `</nav>` (linha ~286). Substituir por:

```html
<!-- ── Sidebar (desktop) / Bottom bar (mobile) ── -->
<nav class="sidebar">
  <div class="sidebar-logo">IF</div>

  <button class="nav-btn active" onclick="switchTab('dashboard')" data-tab="dashboard">
    <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
    <span class="nav-label">Dashboard</span>
    <span class="nav-tooltip">Dashboard</span>
  </button>

  <button class="nav-btn" onclick="switchTab('agente')" data-tab="agente">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4l2 2-2 2"/></svg>
    <span class="nav-label">Agente</span>
    <span class="nav-tooltip">Agente</span>
  </button>

  <button class="nav-btn" onclick="switchTab('conversas')" data-tab="conversas">
    <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    <span class="nav-label">Conversas</span>
    <span class="nav-tooltip">Conversas</span>
  </button>

  <button class="nav-btn" onclick="switchTab('agenda')" data-tab="agenda">
    <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
    <span class="nav-label">Agenda</span>
    <span class="nav-tooltip">Agenda</span>
  </button>

  <button class="nav-btn" onclick="switchTab('portfolio')" data-tab="portfolio">
    <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.5-3.5L13 16"/></svg>
    <span class="nav-label">Portfólio</span>
    <span class="nav-tooltip">Portfólio</span>
  </button>

  <button class="nav-btn" onclick="switchTab('sugestoes')" data-tab="sugestoes">
    <svg viewBox="0 0 24 24"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.6 1 1.5 1 2.3v1h6v-1c0-.8.4-1.7 1-2.3A7 7 0 0 0 12 2z"/></svg>
    <span class="nav-label">Ideias</span>
    <span class="nav-tooltip">Ideias &amp; Sugestões</span>
  </button>

  <button class="nav-btn" onclick="switchTab('suporte')" data-tab="suporte">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <span class="nav-label">Suporte</span>
    <span class="nav-tooltip">Suporte e dúvidas</span>
  </button>

  <button class="nav-btn" onclick="switchTab('settings')" data-tab="settings">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    <span class="nav-label">Settings</span>
    <span class="nav-tooltip">Configurações</span>
  </button>

  <!-- Painel 9 (Modo Exato only) — exibido condicionalmente via JS -->
  <button class="nav-btn nav-btn-exato" onclick="switchTab('calculadora')" data-tab="calculadora" style="display:none">
    <svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/><line x1="14" y1="18" x2="16" y2="18"/></svg>
    <span class="nav-label">Calc</span>
    <span class="nav-tooltip">Calculadora InkFlow</span>
  </button>
</nav>
```

Note: o botão Suporte saiu de `sidebar-bottom` (rodapé) e virou painel #7. O botão Settings é o último da sidebar. O 9º (Calculadora) é hidden por default — JS exibe só pra Modo Exato.

- [ ] **Step 3: Atualizar JS pra exibir/esconder painel Calculadora baseado em modo**

Localizar função `restoreTab()` (~linha 712) ou após `switchTab()`. Adicionar:

```javascript
function updateModoExatoUI(tenant) {
  const isExato = tenant?.config_precificacao?.modo === 'exato';
  const calcBtn = document.querySelector('.nav-btn-exato');
  if (calcBtn) calcBtn.style.display = isExato ? '' : 'none';
}
```

E chamar dentro de `renderStudio(data)` (~linha 826) após `loadAgentConfig(t)`:

```javascript
  updateModoExatoUI(t);
```

- [ ] **Step 4: Validar HTML**

Abrir `studio.html?token=<token-test>` localmente (ou via Cloudflare Pages preview build) e confirmar que sidebar mostra 8 ícones desktop. Se modo='coleta', botão Calculadora não aparece. Se modo='exato', aparece.

- [ ] **Step 5: Commit**

```bash
git add studio.html
git commit -m "feat(studio): sidebar 4 → 8 painéis (+9º Calculadora exclusivo Modo Exato)"
```

---

## Task 8: `studio.html` — componente Toggle pill reutilizável (CSS+JS)

**Files:**
- Modify: `studio.html` (adicionar CSS no bloco `<style>` e função JS no bloco `<script>`)

- [ ] **Step 1: Adicionar CSS do toggle pill**

Localizar o final do bloco `<style>` (antes de `</style>`, ~linha 252). Adicionar:

```css
/* ── Toggle pill (substitui checkbox em todo o site) ── */
.toggle-pill{position:relative;display:inline-flex;align-items:center;gap:10px;cursor:pointer;user-select:none;font-family:inherit}
.toggle-pill input[type="checkbox"]{position:absolute;opacity:0;width:0;height:0;pointer-events:none}
.toggle-pill .toggle-track{width:36px;height:20px;background:rgba(255,255,255,.12);border-radius:10px;position:relative;transition:background .15s ease;flex-shrink:0}
.toggle-pill .toggle-thumb{position:absolute;left:2px;top:2px;width:16px;height:16px;background:#888;border-radius:50%;transition:left .15s ease,background .15s ease}
.toggle-pill input:checked + .toggle-track{background:rgba(0,212,170,.3)}
.toggle-pill input:checked + .toggle-track .toggle-thumb{left:18px;background:var(--teal)}
.toggle-pill .toggle-label{font-size:12px;color:var(--t1);line-height:1.3}
.toggle-pill .toggle-label small{display:block;color:var(--t3);font-size:10px;margin-top:2px;line-height:1.3}
.toggle-pill:hover .toggle-track{background:rgba(255,255,255,.18)}
.toggle-pill:hover input:checked + .toggle-track{background:rgba(0,212,170,.4)}
```

- [ ] **Step 2: Adicionar helper JS pra criar toggle programaticamente**

Localizar bloco `<script>` (~linha 697) — adicionar logo no início (após `// ── Tab switching ──`):

```javascript
// ── Toggle pill component (substitui <input type=checkbox>) ──
// Uso:
//   HTML: <label class="toggle-pill"><input type="checkbox" id="X"/><span class="toggle-track"><span class="toggle-thumb"></span></span><span class="toggle-label">Texto<small>Subtexto opcional</small></span></label>
//   JS reads: document.getElementById('X').checked
//   JS writes: document.getElementById('X').checked = true
function makeTogglePillHTML(id, labelText, smallText, checked) {
  const checkAttr = checked ? 'checked' : '';
  const small = smallText ? `<small>${smallText}</small>` : '';
  return `<label class="toggle-pill">
    <input type="checkbox" id="${id}" ${checkAttr}/>
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    <span class="toggle-label">${labelText}${small}</span>
  </label>`;
}
```

- [ ] **Step 3: Migrar checkboxes existentes em studio.html (3 lugares)**

Localizar linhas com `class="ag-checkbox"` (~linhas 491-496, 549-554, 510-515). Cada uma vira toggle pill. Exemplo para `ag-identificador` (linha ~492):

Substituir:

```html
<label class="ag-checkbox">
  <input type="checkbox" id="ag-identificador"/>
  <span class="ag-checkbox-label">Usar nome do agente como prefixo na 1ª msg<br><span style="color:var(--t3);font-size:10px">Ex: "Isabela: Oi tudo bem?" — senão texto direto sem prefixo</span></span>
</label>
```

Por:

```html
<label class="toggle-pill">
  <input type="checkbox" id="ag-identificador"/>
  <span class="toggle-track"><span class="toggle-thumb"></span></span>
  <span class="toggle-label">Usar nome do agente como prefixo na 1ª msg<small>Ex: "Isabela: Oi tudo bem?" — senão texto direto sem prefixo</small></span>
</label>
```

Repetir pra `ag-cobertura` (linha ~550) e qualquer outro `<label class="ag-checkbox">` ainda existente. **NÃO migrar `ag-giria`** — esse vai ser deletado completamente no PR 3 (mas pode adiantar a remoção aqui se preferir; a spec deletou `usa_giria` do schema). Decisão: **manter `ag-giria` no PR 1** pra escopo apertado, deletar no PR 3 junto com refatoração completa do painel Agente.

- [ ] **Step 4: Validar visualmente**

Abrir studio.html no browser (preview Cloudflare Pages ou local). Confirmar que toggles renderizam: ON = teal slide direita, OFF = cinza slide esquerda. Click alterna. Texto e small text aparecem ao lado.

- [ ] **Step 5: Commit**

```bash
git add studio.html
git commit -m "feat(studio): componente Toggle pill reutilizável + migra ag-identificador/ag-cobertura de checkbox"
```

---

## Task 9: `studio.html` — placeholders dos 4 painéis novos + Calculadora

**Files:**
- Modify: `studio.html` (adicionar 5 `<div class="tab-panel">` no bloco `state-main` antes do fechamento `</div>` em `state-main`)

- [ ] **Step 1: Localizar fim do bloco `state-main`**

```bash
grep -n "tab-agendamentos\|/state-main" studio.html
```

Expected: `<div class="tab-panel" id="tab-agendamentos">` ~linha 661, `</div><!-- /state-main -->` ~linha 670.

- [ ] **Step 2: Renomear `tab-agendamentos` → `tab-agenda` (consistência com sidebar)**

Buscar `id="tab-agendamentos"` e trocar por `id="tab-agenda"`. Atualizar também o conteúdo placeholder:

```html
<!-- ═══ TAB: Agenda ═══ -->
<div class="tab-panel" id="tab-agenda">
  <div class="empty-state">
    <div class="empty-state-icon">&#128197;</div>
    <div class="empty-state-title">Agenda</div>
    Em breve — Integração com Google Calendar (PR 6)
  </div>
</div>
```

- [ ] **Step 3: Adicionar placeholder de Portfólio (após `tab-agenda`)**

```html
<!-- ═══ TAB: Portfólio (NEW PR 5) ═══ -->
<div class="tab-panel" id="tab-portfolio">
  <div class="empty-state">
    <div class="empty-state-icon">&#127912;</div>
    <div class="empty-state-title">Portfólio</div>
    Em breve — Galeria com favoritas, filtro por estilo, upload e migração das fotos atuais (PR 5)
  </div>
</div>
```

- [ ] **Step 4: Adicionar placeholder de Sugestões**

```html
<!-- ═══ TAB: Ideias & Sugestões (NEW PR 7) ═══ -->
<div class="tab-panel" id="tab-sugestoes">
  <div class="empty-state">
    <div class="empty-state-icon">&#128161;</div>
    <div class="empty-state-title">Ideias &amp; Sugestões</div>
    Em breve — Canal direto pra mandar ideias e ver status (PR 7)
  </div>
</div>
```

- [ ] **Step 5: Adicionar placeholder de Suporte e dúvidas (era botão na bottom)**

```html
<!-- ═══ TAB: Suporte e dúvidas (NEW PR 8) ═══ -->
<div class="tab-panel" id="tab-suporte">
  <div class="empty-state">
    <div class="empty-state-icon">&#10067;</div>
    <div class="empty-state-title">Suporte e dúvidas</div>
    <div style="margin-top:16px">
      <button class="ag-save-btn" onclick="openSupport()" style="max-width:240px;margin:0 auto">Falar com Leandro no WhatsApp</button>
    </div>
    <div style="margin-top:12px;font-size:12px;color:var(--t3)">FAQ completo + tutoriais virão em breve (PR 8)</div>
  </div>
</div>
```

- [ ] **Step 6: Adicionar placeholder de Settings**

```html
<!-- ═══ TAB: Settings (NEW PR 9) ═══ -->
<div class="tab-panel" id="tab-settings">
  <div class="empty-state">
    <div class="empty-state-icon">&#9881;</div>
    <div class="empty-state-title">Configurações</div>
    Em breve — Estúdio, Conta, Plano, Notificações, Integrações, Zona de perigo (PR 9)
  </div>
</div>
```

- [ ] **Step 7: Adicionar placeholder de Calculadora InkFlow (Modo Exato only)**

```html
<!-- ═══ TAB: Calculadora InkFlow (Modo Exato only) ═══ -->
<div class="tab-panel" id="tab-calculadora">
  <div class="empty-state">
    <div class="empty-state-icon">&#129518;</div>
    <div class="empty-state-title">Calculadora InkFlow</div>
    Em refatoração — UI atual preservada até spec do Modo Exato sair
  </div>
</div>
```

- [ ] **Step 8: Validar navegação**

Abrir studio.html no browser, clicar cada um dos 8 ícones da sidebar (+9º se Modo Exato). Cada click deve trocar pra painel correto. Hash da URL atualiza (`#dashboard`, `#agente`, ..., `#settings`).

- [ ] **Step 9: Commit**

```bash
git add studio.html
git commit -m "feat(studio): placeholders dos 4 painéis novos (Portfólio/Sugestões/Suporte/Settings) + 9º Calculadora condicional"
```

---

## Task 10: `studio.html` — header com 2 indicadores discretos (WhatsApp + Telegram)

**Files:**
- Modify: `studio.html` (bloco `<header class="top-header">` ~linha 292)

- [ ] **Step 1: Localizar header atual**

```bash
grep -n "header-status\|top-header\|status-dot" studio.html | head -10
```

Expected: linhas ~292 (`<header class="top-header">`), ~295 (`<div class="top-header-status" id="header-status">`), ~50-53 (CSS de `.status-dot`).

- [ ] **Step 2: Trocar bloco `header-status` por 2 indicadores**

Localizar:

```html
<div class="top-header-status" id="header-status">
  <span class="status-dot pending"></span>
  <span>verificando...</span>
</div>
```

Trocar por:

```html
<div class="top-header-status" id="header-status">
  <span class="status-pill" id="status-whatsapp" title="WhatsApp">
    <span class="status-dot pending"></span>
    <span class="status-label">WhatsApp</span>
  </span>
  <span class="status-pill" id="status-telegram" title="Telegram do tatuador" style="display:none">
    <span class="status-dot pending"></span>
    <span class="status-label">Telegram</span>
  </span>
</div>
```

- [ ] **Step 3: Adicionar CSS pra `.status-pill`**

No bloco `<style>` perto de `.status-dot` (~linha 50), adicionar:

```css
.status-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:border-color .15s}
.status-pill:hover{border-color:var(--border2)}
.status-pill .status-label{font-size:10px;color:var(--t3);font-weight:600}
.status-pill.connected .status-label{color:var(--green)}
.status-pill.disconnected .status-label{color:var(--red)}
.status-pill.pending .status-label{color:var(--amber)}
```

- [ ] **Step 4: Atualizar função `updateHeaderStatus`**

Localizar função `updateHeaderStatus(state, label)` (~linha 813) que aceita um único state. Substituir por:

```javascript
function updateHeaderStatus(target, state) {
  // target: 'whatsapp' | 'telegram'
  // state: 'online'|'connected' | 'offline'|'disconnected' | 'pending'|'unknown'
  const el = document.getElementById('status-' + target);
  if (!el) return;
  const dot = el.querySelector('.status-dot');
  const cssState = (state === 'online' || state === 'connected') ? 'online'
                 : (state === 'offline' || state === 'disconnected') ? 'offline'
                 : 'pending';
  const pillState = (state === 'online' || state === 'connected') ? 'connected'
                 : (state === 'offline' || state === 'disconnected') ? 'disconnected'
                 : 'pending';
  dot.className = 'status-dot ' + cssState;
  el.classList.remove('connected', 'disconnected', 'pending');
  el.classList.add(pillState);
}
```

- [ ] **Step 5: Atualizar callers de `updateHeaderStatus`**

Buscar todos os calls com `grep -n "updateHeaderStatus(" studio.html`. Substituir cada um:

- `updateHeaderStatus('online', 'WhatsApp conectado')` → `updateHeaderStatus('whatsapp', 'connected')`
- `updateHeaderStatus('pending', 'WhatsApp desconectado')` → `updateHeaderStatus('whatsapp', 'disconnected')`
- (idem outros casos)

Adicionar logo após o init do tenant (na função `init()` ~linha 728), uma checagem do Telegram pra Modo Coleta:

```javascript
    // Telegram status pill (só Modo Coleta)
    const isColeta = (tenant.config_precificacao?.modo || 'coleta') === 'coleta';
    if (isColeta) {
      document.getElementById('status-telegram').style.display = '';
      const telegramConnected = !!tenant.tatuador_telegram_chat_id;
      updateHeaderStatus('telegram', telegramConnected ? 'connected' : 'disconnected');
    }
```

- [ ] **Step 6: Click no pill abre Settings → Notificações (atalho)**

Adicionar handlers (no bloco JS após init):

```javascript
document.getElementById('status-whatsapp').addEventListener('click', () => {
  switchTab('settings');
  // PR 9 vai abrir seção "Integrações" automaticamente — placeholder por enquanto
});
document.getElementById('status-telegram').addEventListener('click', () => {
  switchTab('settings');
  // PR 9 vai abrir seção "Notificações" automaticamente
});
```

- [ ] **Step 7: Validar visualmente**

Abrir studio.html. Header mostra 2 pills discretos (WhatsApp + Telegram), cada um com bolinha colorida + label minúsculo. Cores: verde/amarelo/vermelho conforme conexão. Click navega pra Settings.

- [ ] **Step 8: Commit**

```bash
git add studio.html
git commit -m "feat(studio): header com 2 indicadores discretos (WhatsApp + Telegram) + click navega pra Settings"
```

---

## Task 11: `studio.html` — remover seção Artistas, invite, modal welcome

**Files:**
- Modify: `studio.html`

- [ ] **Step 1: Identificar todas as seções a remover**

```bash
grep -n "slots-section\|invite-section\|wc-overlay\|sidebar-bottom\|generateInvite\|generateWelcomeInvite\|copyWelcomeLink\|copyLink\|shareLink\|maybeShowWelcome\|closeWelcome" studio.html | head -30
```

Expected linhas:
- `slots-section` ~linha 416 (HTML) + ~linha 90-96 (CSS)
- `invite-section` ~linha 426 (HTML) + ~linha 110-126 (CSS)
- `wc-overlay` modal welcome ~linha 679 (HTML) + ~linha 147-164 (CSS)
- `sidebar-bottom` div já saiu na Task 7 (suporte virou painel)
- Funções JS `generateInvite()`, `copyLink()`, `shareLink()`, `generateWelcomeInvite()`, `copyWelcomeLink()`, `closeWelcome()`, `maybeShowWelcome()` — várias linhas no bloco `<script>`

- [ ] **Step 2: Remover bloco HTML `slots-section`**

Localizar `<div class="slots-section">` (~linha 416) e seu fechamento `</div>` correspondente (~linha 425). Remover bloco completo.

- [ ] **Step 3: Remover bloco HTML `invite-section`**

Localizar `<div class="invite-section" id="invite-section">` (~linha 427) até `</div>` correspondente (~linha 439). Remover.

- [ ] **Step 4: Remover modal welcome `wc-overlay`**

Localizar `<div class="wc-overlay" id="wc-overlay">` (~linha 679) até `</div>` final (~linha 695). Remover.

- [ ] **Step 5: Remover CSS órfão**

No bloco `<style>`, deletar:
- `.slots-section`, `.slots-title`, `.slots-bar`, `.slots-fill`, `.slots-fill.full`, `.slots-label`, `.slots-label span` (~linhas 90-96)
- `.artists-list`, `.artist-item`, `.artist-avatar`, `.artist-info`, `.artist-name`, `.artist-status`, `.artist-badge`, `.badge-active`, `.badge-pending` (~linhas 99-107)
- `.invite-section`, `.invite-title`, `.invite-sub`, `.invite-btn`, `.invite-btn:hover`, `.invite-btn:disabled` (~linhas 110-115)
- `.link-box`, `.link-box.show`, `.link-label`, `.link-url`, `.link-actions`, `.link-copy`, `.link-copy:hover`, `.link-share`, `.link-share:hover` (~linhas 117-126)
- `.wc-overlay`, `.wc-overlay.show`, `.wc-card`, `.wc-emoji`, `.wc-title`, `.wc-sub`, `.wc-invite`, `.wc-invite-label`, `.wc-invite-link`, `.wc-slots`, `.wc-slots span`, `.wc-actions`, `.wc-btn`, `.wc-btn.primary`, `.wc-btn.primary:hover`, `.wc-btn.secondary`, `.wc-btn.secondary:hover` (~linhas 147-164)

- [ ] **Step 6: Remover funções JS órfãs**

No bloco `<script>`, deletar:
- `generateInvite()`
- `copyLink()`
- `shareLink()`
- `generateWelcomeInvite()`
- `copyWelcomeLink()`
- `closeWelcome()`
- `maybeShowWelcome()` — chamada em `init()` ~linha 805; remover essa chamada também

Buscar com `grep -n "function generateInvite\|function copyLink\|function shareLink\|function generateWelcomeInvite\|function copyWelcomeLink\|function closeWelcome\|function maybeShowWelcome" studio.html` pra localizar precisamente.

- [ ] **Step 7: Remover trechos em `renderStudio()` que mexem com slots/artistas**

Localizar `renderStudio(data)` (~linha 826). Remover bloco que começa em `// Slots bar` até `// Hide invite if no slots remaining ... }`. Aproximadamente linhas 848-886.

- [ ] **Step 8: Remover variável `lastGeneratedLink`**

Buscar `let lastGeneratedLink` e `lastGeneratedLink =` — deletar declaração e usos.

- [ ] **Step 9: Validar JS sem erros sintáticos**

```bash
node --check <(cat studio.html | sed -n '/<script>/,/<\/script>/p' | grep -v '<script>' | grep -v '</script>')
```

(Esse comando extrai o JS do HTML pra checar sintaxe. Se der erro, abrir browser DevTools.)

Alternativa simples: abrir studio.html no browser e ver console — zero erros.

- [ ] **Step 10: Validar que studio.html ainda renderiza**

Abrir local ou Cloudflare preview. Esperado:
- Sidebar mostra 8 ícones
- Dashboard mostra KPIs (sem Artistas)
- Sem modal de welcome aparecendo
- Console limpo

- [ ] **Step 11: Commit**

```bash
git add studio.html
git commit -m "refactor(studio): remove slots-section, invite-section, modal welcome e funções JS de Artistas"
```

---

## Task 12: `onboarding.html` — remover invite-section + atualizar copy planos

**Files:**
- Modify: `onboarding.html`

- [ ] **Step 1: Localizar invite-section CSS, HTML, JS**

```bash
grep -n "invite-section\|invite-title\|invite-sub\|invite-slots\|invite-btn\|invite-link-box\|invite-link-url\|invite-copy-btn\|generateInvite\|create-artist-invite" onboarding.html | head -20
```

Expected:
- CSS: linhas ~239-251
- HTML invite block (success screen): localizar dentro de step `s6` (sucesso), provavelmente perto de "Convidar artistas" (verificar com grep "Convidar")
- JS: chamada de `/api/create-artist-invite`
- Plan copy: linha 525 ("Suporte para até 5 tatuadores"), 538 ("Suporte para até 10 tatuadores"), 525 ("Assistente virtual individual para cada artista"), 538 ("Atendimento personalizado com IA por artista")

- [ ] **Step 2: Remover CSS de invite-section (linhas ~239-251)**

Buscar comentário `/* ── Invite artists (success screen) ── */` (linha 239) e remover bloco até antes da próxima seção.

- [ ] **Step 3: Remover bloco HTML invite no step s6**

Localizar elemento `<div class="invite-section">` no step s6 (provavelmente após o botão de "Acessar painel"). Remover bloco completo.

- [ ] **Step 4: Remover JS que chama `/api/create-artist-invite`**

Buscar `create-artist-invite` em onboarding.html. Remover function que chama esse endpoint + listeners associados.

- [ ] **Step 5: Atualizar copy dos planos (sem mention de "tatuadores" / "artistas")**

Linha ~523 (Plano Estúdio), atual:
```html
<li class="po-feat">Suporte para até 5 tatuadores no mesmo plano</li>
<li class="po-feat">Até 2.000 conversas mensais gerenciadas pela IA</li>
<li class="po-feat">Assistente virtual individual para cada artista</li>
<li class="po-feat">Agenda separada e autônoma por tatuador</li>
```

Trocar por:
```html
<li class="po-feat">Até 2.000 conversas mensais gerenciadas pela IA</li>
<li class="po-feat">Integração avançada com Google Calendar</li>
<li class="po-feat">Portfólio com galeria personalizada</li>
<li class="po-feat">Resumo semanal com análise de desempenho por IA</li>
```

Linha ~538 (Plano Estúdio VIP), atual:
```html
<li class="po-feat">Suporte para até 10 tatuadores</li>
<li class="po-feat">Até 4.000 conversas mensais gerenciadas pela IA</li>
<li class="po-feat">Atendimento personalizado com IA por artista</li>
<li class="po-feat">Roteamento inteligente por estilo de tatuagem</li>
```

Trocar por:
```html
<li class="po-feat">Até 4.000 conversas mensais gerenciadas pela IA</li>
<li class="po-feat">Atendimento prioritário e onboarding personalizado</li>
<li class="po-feat">Acesso antecipado a todas as novas funcionalidades</li>
<li class="po-feat">Roteamento inteligente por estilo de tatuagem</li>
```

**Note:** copy nova é placeholder até decisão de produto sobre features finais por plano. Pode ser ajustada em PR de copy separado.

- [ ] **Step 6: Validar onboarding renderiza corretamente**

Abrir onboarding.html local ou preview. Confirmar:
- Step s2 (form): 3 cards de plano, sem mention de "tatuadores"
- Step s6 (sucesso): sem invite-section
- Console limpo

- [ ] **Step 7: Commit**

```bash
git add onboarding.html
git commit -m "refactor(onboarding): remove invite-section + atualiza copy dos planos sem 'tatuadores'"
```

---

## Task 13: `admin.html` — remover visualização de Artistas

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Localizar refs**

```bash
grep -n "is_artist_slot\|parent_tenant_id\|max_artists\|artistas\|Artista" admin.html | head -20
```

Expected: linha 664 (SELECT), 692 (`isArt = t.is_artist_slot`), 779-780 (UI condicional), 783-784 (load artists), 792-793 (MRR), 809-826 (carregamento de filhos).

- [ ] **Step 2: Atualizar SELECT do admin (linha ~664)**

Buscar:
```javascript
const list = await api('GET', '/rest/v1/tenants?select=id,nome,nome_estudio,email,cidade,endereco,evo_instance,evo_base_url,plano,status_pagamento,ativo,nome_agente,prompt_sistema,faq_texto,webhook_path,mp_subscription_id,trial_ate,grupo_notificacao,grupo_orcamento,google_calendar_id,google_drive_folder,created_at,parent_tenant_id,max_artists,is_artist_slot,onboarding_key&order=created_at.desc');
```

Trocar por:
```javascript
const list = await api('GET', '/rest/v1/tenants?select=id,nome,nome_estudio,email,cidade,endereco,evo_instance,evo_base_url,plano,status_pagamento,ativo,nome_agente,prompt_sistema,faq_texto,webhook_path,mp_subscription_id,trial_ate,grupo_notificacao,grupo_orcamento,google_calendar_id,google_drive_folder,created_at,onboarding_key&order=created_at.desc');
```

- [ ] **Step 3: Remover variável `isArt` (linha ~692)**

Buscar:
```javascript
const isArt = t.is_artist_slot === true;
```

Remover. Buscar também usos de `isArt` em `admin.html` e remover/refatorar.

- [ ] **Step 4: Remover blocos HTML condicionais de Artistas (linhas ~779-780)**

Buscar:
```javascript
${t.is_artist_slot?`<div ...>... Artista vinculado ...</div>`:''}
${(!t.is_artist_slot && ['estudio','premium'].includes(t.plano))?`<div ...>... Artistas do Estúdio ...</div>`:''}
```

Remover ambos (deletar a expressão completa de cada `${...}`).

- [ ] **Step 5: Remover bloco de carregamento de artistas filhos (linhas ~783-826)**

Buscar `// Se for estudio/premium (dono), carregar artistas filhos` e bloco abaixo até final dele. Remover bloco completo.

- [ ] **Step 6: Atualizar cálculo de MRR (linhas ~792-793)**

Buscar:
```javascript
// MRR exclui artistas filhos (is_artist_slot) para evitar contagem dupla
const mrr = allT.filter(t => t.ativo && t.status_pagamento === 'authorized' && !t.is_artist_slot)
```

Trocar por (sem filter de artistas):
```javascript
// MRR: tenants ativos e pagantes
const mrr = allT.filter(t => t.ativo && t.status_pagamento === 'authorized')
```

- [ ] **Step 7: Remover qualquer outra ref restante**

```bash
grep -n "is_artist_slot\|parent_tenant_id\|max_artists\|artistas\|Artista" admin.html
```

Expected: zero linhas. Se sobrar, editar manualmente.

- [ ] **Step 8: Validar admin.html renderiza sem erro JS**

Abrir admin.html no browser. Console limpo. Lista de tenants carrega sem campos extras.

- [ ] **Step 9: Commit**

```bash
git add admin.html
git commit -m "refactor(admin): remove visualização de Artistas (feature eliminada)"
```

---

## Task 14: Atualizar `tests/update-tenant-validation.test.mjs`

**Files:**
- Modify: `tests/update-tenant-validation.test.mjs`

- [ ] **Step 1: Localizar tests existentes**

```bash
wc -l tests/update-tenant-validation.test.mjs
grep -n "parent_tenant_id\|is_artist_slot\|artista_slot" tests/update-tenant-validation.test.mjs
```

- [ ] **Step 2: Remover tests que usam campos Artistas**

Se o grep do step 1 retornar matches, abrir o arquivo e deletar os blocos `test('...', ...)` que usam esses campos. Cada bloco vai de `test(` até o `});` correspondente.

- [ ] **Step 3: Adicionar tests pros campos novos**

Localizar bloco de tests existentes (procurar `import { test } from 'node:test';`). Adicionar ao fim do arquivo:

```javascript
test('aceita ativo_ate como timestamptz ISO', () => {
  const body = { ativo_ate: '2026-06-15T23:59:59Z' };
  const result = validateTenantUpdate(body);
  assert.equal(result.valid, true, 'ativo_ate deve ser aceito');
});

test('aceita deletado_em como timestamptz ISO', () => {
  const body = { deletado_em: '2026-05-15T10:00:00Z' };
  const result = validateTenantUpdate(body);
  assert.equal(result.valid, true, 'deletado_em deve ser aceito');
});

test('aceita config_notificacoes como objeto JSON', () => {
  const body = { config_notificacoes: { email_enabled: true, push_enabled: false } };
  const result = validateTenantUpdate(body);
  assert.equal(result.valid, true, 'config_notificacoes deve ser aceito');
});

test('rejeita parent_tenant_id (campo Artistas removido)', () => {
  const body = { parent_tenant_id: '00000000-0000-0000-0000-000000000001' };
  const result = validateTenantUpdate(body);
  assert.equal(result.valid, false, 'parent_tenant_id deve ser rejeitado');
});

test('rejeita is_artist_slot (campo Artistas removido)', () => {
  const body = { is_artist_slot: true };
  const result = validateTenantUpdate(body);
  assert.equal(result.valid, false, 'is_artist_slot deve ser rejeitado');
});

test('rejeita modo_atendimento=artista_slot (valor removido)', () => {
  const body = { modo_atendimento: 'artista_slot' };
  const result = validateTenantUpdate(body);
  assert.equal(result.valid, false, 'modo_atendimento=artista_slot deve ser rejeitado');
});

test('aceita modo_atendimento valores remanescentes', () => {
  for (const v of ['individual', 'tatuador_dono', 'recepcionista']) {
    const result = validateTenantUpdate({ modo_atendimento: v });
    assert.equal(result.valid, true, `modo_atendimento=${v} deve ser aceito`);
  }
});
```

**Note:** o nome exato da função (`validateTenantUpdate`) e API de retorno (`{ valid, errors }`) precisa ser confirmado lendo o arquivo. Adapte se for diferente — se houver helper de teste em `tests/helpers/`, importar de lá.

- [ ] **Step 4: Rodar tests**

```bash
node --test tests/update-tenant-validation.test.mjs 2>&1 | tail -15
```

Expected: tests passam (count `# pass` aumentou pelos 7 novos). Se quebra, depurar — provavelmente API do validator é diferente do template acima.

- [ ] **Step 5: Rodar bateria completa pra zero regressão**

```bash
npm test 2>&1 | tail -10
```

Expected: `# fail 0`. Comparar com `/tmp/baseline-pr1.log`: count de `pass` deve ter aumentado pelos 7 novos.

- [ ] **Step 6: Commit**

```bash
git add tests/update-tenant-validation.test.mjs
git commit -m "test(update-tenant): valida campos novos + rejeita campos Artistas removidos"
```

---

## Task 15: Smoke E2E manual + auditoria final

**Files:** nenhum (validação manual)

- [ ] **Step 1: Confirmar audit de Artistas zerado**

```bash
bash scripts/audit-artistas-refs.sh > /tmp/audit-final.txt
diff /tmp/audit-artistas.txt /tmp/audit-final.txt
```

Expected: diff mostra todas as refs antigas como removidas (linhas com `<` mas não `>`). Seções "Frontend", "Backend", "Schema" devem aparecer vazias na nova saída. Apenas `docs/` e `tests/update-tenant-validation.test.mjs` (que ainda referencia os campos pra validar rejeição) podem aparecer.

- [ ] **Step 2: Deletar script de audit (foi descartável)**

```bash
rm scripts/audit-artistas-refs.sh
git add -A scripts/audit-artistas-refs.sh
git commit -m "chore: remove script de audit (descartável após PR1)"
```

- [ ] **Step 3: Bateria completa de tests**

```bash
npm test 2>&1 | tee /tmp/final-pr1.log | tail -15
```

Expected: `# fail 0`. Comparar com baseline `/tmp/baseline-pr1.log` — deve ter mais tests (pelos novos em update-tenant-validation), zero regressões.

- [ ] **Step 4: Smoke local — abrir studio.html**

```bash
# Inicia preview local Cloudflare Pages
npx wrangler pages dev . --port 8788 &
WRANGLER_PID=$!
sleep 3
echo "Open http://localhost:8788/studio.html?token=<get_a_test_token_from_DB> in browser"
```

Validações manuais (checklist):
- [ ] Sidebar mostra 8 ícones (9 se modo='exato')
- [ ] Click em cada ícone navega pro painel correto + URL hash atualiza
- [ ] Header mostra 2 pills (WhatsApp + Telegram); cores corretas conforme conexão
- [ ] Painel Dashboard renderiza sem seção "Artistas do Estúdio"
- [ ] Console DevTools sem erros JS
- [ ] Modal welcome NÃO aparece (foi removido)
- [ ] Toggle pill substituiu checkbox em ag-identificador e ag-cobertura

```bash
kill $WRANGLER_PID
```

- [ ] **Step 5: Smoke local — abrir onboarding.html**

Validações:
- [ ] Step s2 mostra 3 planos sem "tatuadores" no copy
- [ ] Step s6 (success) sem invite-section
- [ ] Fluxo completo trial: form → sucesso → studio.html (sem modal welcome de invite)

- [ ] **Step 6: Smoke local — abrir admin.html**

Validações:
- [ ] Lista de tenants carrega sem coluna/badge de Artistas
- [ ] Detalhe de tenant não mostra "Artistas do Estúdio" nem "Artista vinculado"
- [ ] MRR calculado corretamente (sem filter de is_artist_slot)
- [ ] Console limpo

- [ ] **Step 7: Commit do checklist concluído (opcional)**

Se algum smoke falhar, voltar pra task da seção respectiva e corrigir. Senão:

```bash
git commit --allow-empty -m "test(pr1): smoke E2E manual concluído — sidebar 8 painéis, sem refs Artistas, console limpo"
```

---

## Task 16: PR open + checklist de DoD

**Files:** nenhum

- [ ] **Step 1: Push da branch**

```bash
git push -u origin feat/pagina-tatuador-pr1-foundation
```

- [ ] **Step 2: Abrir PR via gh CLI**

```bash
gh pr create --base main --head feat/pagina-tatuador-pr1-foundation \
  --title "PR 1 Foundation: sidebar 8 painéis + eliminação Artistas do estúdio" \
  --body "$(cat <<'EOF'
## Summary

PR 1 da refatoração estrutural da página do tatuador (Modo Coleta principal).

- Sidebar reformulada de 4 → 8 painéis (9 se Modo Exato), preparando estrutura pros PRs 2-9.
- Feature "Artistas do estúdio" eliminada por completo do SaaS: schema, prompts, planos, UI, endpoint.
- Componente Toggle pill reutilizável criado (substitui checkbox em todo o site daqui em diante).
- Header ganha 2 indicadores discretos (WhatsApp + Telegram, Coleta v2).
- 4 painéis novos como placeholders (Portfólio, Sugestões, Suporte, Settings) prontos pros próximos PRs.

## Spec
- [`docs/superpowers/specs/2026-05-03-pagina-tatuador-refactor-design.md`](docs/superpowers/specs/2026-05-03-pagina-tatuador-refactor-design.md)
- [`docs/superpowers/plans/2026-05-03-pagina-tatuador-MASTER.md`](docs/superpowers/plans/2026-05-03-pagina-tatuador-MASTER.md)
- [`docs/superpowers/plans/2026-05-03-pagina-tatuador-PR1-foundation.md`](docs/superpowers/plans/2026-05-03-pagina-tatuador-PR1-foundation.md)

## Schema migration

Aplicar manualmente no Supabase Dashboard após merge:
[`supabase/migrations/2026-05-03-pagina-tatuador-foundation.sql`](supabase/migrations/2026-05-03-pagina-tatuador-foundation.sql)

DROP em `tenants`: `is_artist_slot`, `parent_tenant_id`, `max_artists`.
DROP em `onboarding_links`: `is_artist_invite`, `parent_tenant_id`.
ADD em `tenants`: `ativo_ate`, `deletado_em`, `config_notificacoes`.
ADD em `conversas`: `estado_agente_anterior`, `pausada_em`. CHECK constraint estendida.

## Test plan

- [x] Bateria local `npm test` verde (zero regressões + 7 tests novos em update-tenant-validation)
- [x] Smoke E2E manual: studio.html, onboarding.html, admin.html (checklist no plano §Task 15)
- [ ] Aplicar migration SQL no Supabase Dashboard pós-merge
- [ ] Verificar Cloudflare Pages preview (deploy automático após PR open) renderiza sem erros JS

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Verificar checks do CI**

```bash
gh pr checks
```

Expected: workflow `prompts-ci.yml` (se existir trigger pra mudanças tocadas) passa. Outros workflows passam.

- [ ] **Step 4: Marcar checklist do plano-mestre**

Editar `docs/superpowers/plans/2026-05-03-pagina-tatuador-MASTER.md` e marcar checklist:

```markdown
- [x] Sub-plan escrito? **SIM** — `docs/superpowers/plans/2026-05-03-pagina-tatuador-PR1-foundation.md`
```

(Quando PR mergeado, marcar `[x] PR criado e mergeado` no master + `[x] PR 1 — Foundation` no checklist mestre.)

- [ ] **Step 5: Aguardar review/merge**

PR aguarda decisão de Leandro. Pós-merge, **antes** de começar PRs 2-9, **aplicar migration SQL** no Supabase Dashboard:

1. Abrir https://supabase.com/dashboard → projeto InkFlow
2. SQL Editor → New Query
3. Colar conteúdo de `supabase/migrations/2026-05-03-pagina-tatuador-foundation.sql`
4. Run → confirmar zero erros
5. Validar via queries de verificação no fim do arquivo SQL

---

## Self-review (rodada após escrever o plano)

### Spec coverage

Skim do spec mestre §Painel/Schema/Critérios de aceitação contra tasks deste plano:

- ✅ Sidebar 8 painéis Coleta + 9º Exato → Task 7 + 9
- ✅ Hash-routing → Task 9 (já existia o helper, só usa)
- ✅ Mobile bottom tab bar → herdado do CSS existente (sem mudanças neste PR)
- ✅ Eliminação Artistas (schema, prompts, planos, UI, endpoints) → Tasks 2, 3, 4, 5, 6, 11, 12, 13
- ✅ Toggle pill substituindo checkboxes → Task 8
- ✅ Header com 2 indicadores (WhatsApp + Telegram) → Task 10
- ✅ Placeholders dos painéis novos (Portfólio, Sugestões, Suporte, Settings, Calculadora) → Task 9
- ✅ Schema deltas ADD ativo_ate, deletado_em, config_notificacoes → Task 2
- ✅ Schema deltas conversas (estado_agente_anterior, pausada_em, CHECK) → Task 2
- ✅ Critérios DoD do PR 1 (audit zero, migration ready, studio.html abre sem erro JS, onboarding sem mention de artistas) → Task 15

**Não cobertos neste PR (corretamente — são responsabilidade dos PRs 2-9):**
- ⏭ Conteúdo real dos 4 painéis novos (Portfólio/Sugestões/Suporte/Settings) — placeholders apenas
- ⏭ Refator do Painel Agente (6 grupos, kill-switch, FAQ "Meus FAQs") — PR 3
- ⏭ Refator do Painel Conversas (3 grupos + thread) — PR 4
- ⏭ Refator do Dashboard (KPIs nova ordem, Resumo IA, slot Telegram, Atividade recente real) — PR 2

### Placeholder scan

Buscando padrões proibidos no plano:

- "TBD" → 0 ✅
- "TODO" → 0 ✅
- "implement later" → 0 ✅
- "fill in details" → 0 ✅
- "appropriate error handling" → 0 ✅
- "handle edge cases" → 0 ✅
- "Similar to Task N" → 0 ✅
- Steps de código sem código → 0 (todas as edits têm `Buscar / Trocar por` com código completo) ✅

Aviso: Step 6 da Task 14 menciona "API do validator é diferente do template acima" — é instrução condicional pra adaptação, não placeholder. Aceitável.

### Type consistency

- `validateTenantUpdate` em Task 14 — função consumida; nome exato a confirmar abrindo o arquivo. Documentado como adaptável. OK.
- `updateHeaderStatus(target, state)` em Task 10 — assinatura nova; callers atualizados no mesmo step (5). OK.
- `tenant.tatuador_telegram_chat_id` em Task 10 — campo já existe (Coleta v2 schema). OK.
- `tenant.config_precificacao?.modo` em Tasks 7 e 10 — campo já existe (Coleta v2). OK.
- `makeTogglePillHTML(id, labelText, smallText, checked)` em Task 8 — definida e usada (helper opcional, não obrigatório nas migrations da Task 8 step 3 que usa HTML direto). OK.

Sem inconsistências detectadas.

---

## Estimativa de execução

- Tasks 0-5 (preparação + schema + backend cleanup): ~2h
- Tasks 6-11 (audit prompts + studio.html refactor): ~3h
- Tasks 12-14 (onboarding + admin + tests): ~1.5h
- Task 15-16 (smoke + PR): ~1h

**Total: ~7-8h** (1 dia útil com buffer pra debug). Bate com a estimativa do plano-mestre (1d).

---

## Próximo passo após PR 1 mergeado

1. Aplicar migration SQL no Supabase Dashboard manualmente (queries de validação no fim do arquivo SQL).
2. Atualizar plano-mestre marcando `[x] PR 1 — Foundation`.
3. Decidir qual PR atacar a seguir entre os paralelizáveis (2, 3, 5, 6, 7, 8). Recomendação: PR 3 (Agente + kill-switch backend) porque desbloqueia PR 4 (Conversas), e PRs 5, 6, 7, 8 podem rodar em background paralelo.
4. Invocar `superpowers:writing-plans` apontando pra próxima seção do master plan.
