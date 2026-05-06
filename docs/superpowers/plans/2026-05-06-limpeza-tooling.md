# Limpeza Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir contexto carregado por padrão (24→13 MCPs, 346→~120 permissions, 4531→~2500 linhas memory) sem perder funcionalidade que Leandro usa de verdade. Pré-requisito pra frente C (rotina diária).

**Architecture:** 6 ondas em ordem crescente de risco — backup → memory hygiene → commands → MCPs → plugins → permissions → verificação. Cada onda é committable independente. Reversibilidade via backup local + git history. Espírito TDD adaptado: medir baseline → executar → medir pós (não há código de produto pra testar).

**Tech Stack:** Bash, Claude Code CLI (`claude mcp`), git (3 repos: `inkflow-saas`, `memory`, `vault`), Edit/Write tools, skill nativa `fewer-permission-prompts`.

**Spec:** `docs/superpowers/specs/2026-05-06-limpeza-tooling-design.md`

---

## File Structure

Esse plano não modifica produto (`inkflow-saas/functions/*` intocado). Modifica config/memory do Claude Code:

**Modify:**
- `~/.claude/settings.json` — desabilitar plugins (`code-review`, `sentry`)
- `~/.claude/settings.local.json` — permissions slim via skill
- `~/.claude/projects/-Users-brazilianhustler/memory/MEMORY.md` — remover 7-8 entries arquivadas

**Delete:**
- `~/.claude/commands/fix-rapido.md`
- (condicional) `~/.claude/commands/mentalidade.md`
- (condicional) `~/.claude/commands/plan.md`

**Move:**
- 12 daily notes (`memory/2026-04-XX.md`, `memory/2026-05-0X.md`) → `vault/Daily Notes/`
- 7-8 specs resolvidas → `memory/archive/`

**Create:**
- `~/.claude/backups/settings.json.pre-limpeza-2026-05-06`
- `~/.claude/backups/settings.local.json.pre-limpeza-2026-05-06`
- `~/.claude/backups/mcp-list.pre-limpeza-2026-05-06.txt` (snapshot configs)
- `~/.claude/projects/-Users-brazilianhustler/memory/archive/` (dir)
- `vault/Daily Notes/` (dir, se não existir)
- `vault/Inkflow_plan/InkFlow — Limpeza Tooling 2026-05-06.md` (nota âncora)

**MCP removals (12 via `claude mcp remove`):**
1. `claude.ai Bitly`
2. `claude.ai Intercom`
3. `claude.ai Netlify`
4. `claude.ai PostHog`
5. `claude.ai Sentry`
6. `claude.ai Supabase`
7. `claude.ai Cloudflare Developer Platform`
8. `chrome-devtools`
9. `plugin:cloudflare:cloudflare-bindings`
10. `plugin:cloudflare:cloudflare-builds`
11. `plugin:cloudflare:cloudflare-observability`
12. `plugin:sentry:sentry`

---

## Task 1: Backup completo + métricas baseline

**Files:**
- Create: `~/.claude/backups/settings.json.pre-limpeza-2026-05-06`
- Create: `~/.claude/backups/settings.local.json.pre-limpeza-2026-05-06`
- Create: `~/.claude/backups/mcp-list.pre-limpeza-2026-05-06.txt`
- Create: `~/.claude/backups/baseline-metrics.pre-limpeza-2026-05-06.txt`

- [ ] **Step 1: Backup settings + permissions**

```bash
cp ~/.claude/settings.json ~/.claude/backups/settings.json.pre-limpeza-2026-05-06
cp ~/.claude/settings.local.json ~/.claude/backups/settings.local.json.pre-limpeza-2026-05-06
ls -la ~/.claude/backups/*.pre-limpeza-2026-05-06
```

Expected: 2 arquivos listados com tamanho > 0 bytes.

- [ ] **Step 2: Snapshot dos MCPs configurados (pra reativação se errar)**

```bash
claude mcp list > ~/.claude/backups/mcp-list.pre-limpeza-2026-05-06.txt 2>&1
wc -l ~/.claude/backups/mcp-list.pre-limpeza-2026-05-06.txt
```

Expected: arquivo com ~24-30 linhas listando todos os MCPs ativos.

- [ ] **Step 3: Capturar métricas baseline objetivas**

```bash
{
  echo "=== BASELINE 2026-05-06 ==="
  echo ""
  echo "## MCPs (com health check)"
  claude mcp list 2>/dev/null | grep -cE "✓|!"
  echo ""
  echo "## Permissions allow (entries)"
  grep -cE '^\s+"(mcp__|Skill|Bash)' ~/.claude/settings.local.json
  echo ""
  echo "## Memory total (linhas)"
  wc -l ~/.claude/projects/-Users-brazilianhustler/memory/*.md | tail -1
  echo ""
  echo "## Memory file count"
  ls ~/.claude/projects/-Users-brazilianhustler/memory/*.md | wc -l
  echo ""
  echo "## MEMORY.md (linhas)"
  wc -l ~/.claude/projects/-Users-brazilianhustler/memory/MEMORY.md
  echo ""
  echo "## Custom commands"
  ls ~/.claude/commands/*.md | wc -l
} > ~/.claude/backups/baseline-metrics.pre-limpeza-2026-05-06.txt
cat ~/.claude/backups/baseline-metrics.pre-limpeza-2026-05-06.txt
```

Expected: arquivo com ~16 linhas mostrando contagens (MCPs ~24, permissions ~346, memory ~4531 linhas, ~54 files, MEMORY.md ~40 linhas, commands 13).

- [ ] **Step 4: Commit memory atual como ponto de retorno**

```bash
cd /Users/brazilianhustler/.claude/projects/-Users-brazilianhustler/memory
git add -A
git commit -m "snapshot pre-limpeza-tooling 2026-05-06" --allow-empty
git log --oneline -3
```

Expected: commit criado (mesmo se sem mudanças, `--allow-empty` garante marcador).

---

## Task 2: Teste empírico baseline (`/daily-start` ANTES)

**Files:**
- Create: `~/.claude/backups/empirico-baseline.pre-limpeza-2026-05-06.md`

- [ ] **Step 1: Iniciar nova sessão Claude Code (Cmd+K ou nova janela do terminal com `claude`)**

Em sessão NOVA e LIMPA, rodar:

```
/daily-start
```

- [ ] **Step 2: Anotar resultado em arquivo**

Criar `~/.claude/backups/empirico-baseline.pre-limpeza-2026-05-06.md` com:

```markdown
# Empírico baseline — /daily-start ANTES da limpeza

Data: 2026-05-06
Sessão: nova/limpa

## Tempo até primeira resposta
- Aproximado: ___ segundos (cronometrar do Enter ao primeiro token)

## Qualidade subjetiva (1-5)
- Foco da resposta (1=disperso, 5=focado direto no que importa): ___
- Sensação de "ruído de fundo" (1=muito, 5=zero): ___

## Observações livres
- O Claude pegou contexto correto?
- Mencionou alguma coisa irrelevante?
- Algum comportamento estranho?

[anotar aqui]
```

- [ ] **Step 3: Voltar pra sessão de execução do plano (a atual)**

Não fechar a sessão de teste — só voltar pra essa pra continuar tasks.

---

## Task 3: Memory — criar `archive/` e `Daily Notes/`

**Files:**
- Create: `~/.claude/projects/-Users-brazilianhustler/memory/archive/` (dir)
- Create: `/Users/brazilianhustler/Documents/vault/Daily Notes/` (dir, se não existir)

- [ ] **Step 1: Verificar se Daily Notes já existe no vault**

```bash
ls -la "/Users/brazilianhustler/Documents/vault/Daily Notes" 2>&1 | head -5
```

Expected: ou `No such file or directory` ou listagem de arquivos existentes.

- [ ] **Step 2: Criar diretórios**

```bash
mkdir -p ~/.claude/projects/-Users-brazilianhustler/memory/archive
mkdir -p "/Users/brazilianhustler/Documents/vault/Daily Notes"
ls -la ~/.claude/projects/-Users-brazilianhustler/memory/archive
ls -la "/Users/brazilianhustler/Documents/vault/Daily Notes"
```

Expected: ambos diretórios listados (vazios se novos).

---

## Task 4: Memory — mover 12 daily notes pro vault

**Files:**
- Move: `~/.claude/projects/-Users-brazilianhustler/memory/2026-{04,05}-*.md` → `vault/Daily Notes/`

- [ ] **Step 1: Listar daily notes a mover**

```bash
ls ~/.claude/projects/-Users-brazilianhustler/memory/2026-*.md
```

Expected: 12 arquivos listados (`2026-04-24.md` a `2026-05-06.md`).

- [ ] **Step 2: Verificar wiki-links que referenciam daily notes**

```bash
grep -rn '\[\[2026-0' ~/.claude/projects/-Users-brazilianhustler/memory/ /Users/brazilianhustler/Documents/vault/ 2>/dev/null | head -20
```

Expected: lista de referências (se houver). Se 0, prosseguir. Se houver, anotar pra correção pós-move.

- [ ] **Step 3: Mover arquivos**

```bash
mv ~/.claude/projects/-Users-brazilianhustler/memory/2026-04-{24,25,26,27,28,29,30}.md "/Users/brazilianhustler/Documents/vault/Daily Notes/"
mv ~/.claude/projects/-Users-brazilianhustler/memory/2026-05-0{2,3,4,5,6}.md "/Users/brazilianhustler/Documents/vault/Daily Notes/"
ls "/Users/brazilianhustler/Documents/vault/Daily Notes/" | wc -l
ls ~/.claude/projects/-Users-brazilianhustler/memory/2026-*.md 2>&1 | head -3
```

Expected:
- `Daily Notes/` com 12+ arquivos (mais se já tinha algum)
- `ls 2026-*.md` retorna `No such file or directory`

- [ ] **Step 4: Commit memory**

```bash
cd ~/.claude/projects/-Users-brazilianhustler/memory
git add -A
git commit -m "chore(memory): mover 12 daily notes pro vault Daily Notes/"
```

- [ ] **Step 5: Commit vault**

```bash
cd /Users/brazilianhustler/Documents/vault
git add -A
git commit -m "chore: receber 12 daily notes da memory (limpeza tooling)"
```

---

## Task 5: Memory — arquivar specs resolvidas

**Files:**
- Move: 8 specs em `memory/` → `memory/archive/`

- [ ] **Step 1: Listar specs candidatas + verificar referências**

```bash
cd ~/.claude/projects/-Users-brazilianhustler/memory

for f in \
  "InkFlow — Sub-spec Mapa Canônico (2026-04-26).md" \
  "InkFlow — Sub-spec Auditores MVP (2026-04-27).md" \
  "InkFlow — Auditor key-expiry (2026-04-27).md" \
  "InkFlow — Auditor deploy-health (2026-04-29).md" \
  "InkFlow — Design Modo Coleta (2026-04-22).md" \
  "InkFlow — Modo Coleta v2 principal (2026-05-02).md" \
  "InkFlow — Refator página tatuador (2026-05-03).md" \
  "InkFlow — Plano-mestre Fábrica (2026-04-25).md"
do
  if [ -f "$f" ]; then
    echo "✓ EXISTE: $f"
  else
    echo "✗ FALTA: $f"
  fi
done
```

Expected: 8 linhas `✓ EXISTE`.

- [ ] **Step 2: Verificar wiki-links que referenciam essas specs**

```bash
cd ~/.claude/projects/-Users-brazilianhustler/memory
grep -l "Sub-spec Mapa Canônico\|Sub-spec Auditores MVP\|Auditor key-expiry\|Auditor deploy-health\|Design Modo Coleta (2026-04-22)\|Modo Coleta v2 principal\|Refator página tatuador\|Plano-mestre Fábrica" *.md 2>/dev/null | grep -v "MEMORY.md"
```

Expected: lista de arquivos memory que linkam pras specs. Se aparecer só `Painel.md` ou `Painel histórico.md`, isso é esperado (vai ser tratado em Task 7). Se aparecer outro, pausar e revisar.

- [ ] **Step 3: Mover specs pra archive**

```bash
cd ~/.claude/projects/-Users-brazilianhustler/memory

mv "InkFlow — Sub-spec Mapa Canônico (2026-04-26).md" archive/
mv "InkFlow — Sub-spec Auditores MVP (2026-04-27).md" archive/
mv "InkFlow — Auditor key-expiry (2026-04-27).md" archive/
mv "InkFlow — Auditor deploy-health (2026-04-29).md" archive/
mv "InkFlow — Design Modo Coleta (2026-04-22).md" archive/
mv "InkFlow — Modo Coleta v2 principal (2026-05-02).md" archive/
mv "InkFlow — Refator página tatuador (2026-05-03).md" archive/
mv "InkFlow — Plano-mestre Fábrica (2026-04-25).md" archive/

ls archive/ | wc -l
```

Expected: `8`.

- [ ] **Step 4: Commit**

```bash
cd ~/.claude/projects/-Users-brazilianhustler/memory
git add -A
git commit -m "chore(memory): arquivar 8 specs resolvidas em archive/"
```

---

## Task 6: Memory — atualizar `MEMORY.md` index

**Files:**
- Modify: `~/.claude/projects/-Users-brazilianhustler/memory/MEMORY.md`

- [ ] **Step 1: Ler MEMORY.md atual pra identificar entries a remover**

```bash
cat ~/.claude/projects/-Users-brazilianhustler/memory/MEMORY.md | grep -nE "Sub-spec Mapa Canônico|Sub-spec Auditores MVP|Auditor key-expiry|Auditor deploy-health|Design Modo Coleta \(2026-04-22\)|Modo Coleta v2 principal|Refator página tatuador|Plano-mestre Fábrica"
```

Expected: 8 linhas com números, identificando as entries a remover.

- [ ] **Step 2: Remover as 8 entries arquivadas via Edit tool**

Para cada entry identificada no Step 1, usar Edit tool pra remover a linha inteira. Exemplo:

```
old_string: "- [[InkFlow — Sub-spec Mapa Canônico (2026-04-26)]] — Sub-projeto 1 ✅ implementado v1 (PR #4 + #5 mergeadas, 13 arquivos canonical em main)\n"
new_string: ""
```

Repetir pras 8 entries. (Edit tool tem `replace_all: false` por padrão, então cada entry precisa de match único — o conteúdo único de cada linha garante isso.)

**Alternativa**: adicionar uma linha pointer ao archive em vez de remover:
```
- [archive/InkFlow — Sub-spec Mapa Canônico (2026-04-26)](archive/InkFlow%20—%20Sub-spec%20Mapa%20Canônico%20%282026-04-26%29.md) — arquivado
```

**Decisão preferida pelo simpler**: REMOVER as entries. Quem precisar olha no `archive/`.

- [ ] **Step 3: Verificar tamanho final**

```bash
wc -l ~/.claude/projects/-Users-brazilianhustler/memory/MEMORY.md
```

Expected: ~30-32 linhas (de 40 originais — 8 removidas).

- [ ] **Step 4: Commit**

```bash
cd ~/.claude/projects/-Users-brazilianhustler/memory
git add MEMORY.md
git commit -m "chore(memory): MEMORY.md index — remover 8 entries arquivadas"
```

---

## Task 7: Memory — validar wiki-links órfãos

**Files:**
- Modify (condicional): `memory/InkFlow — Painel.md` ou outros se quebraram

- [ ] **Step 1: Buscar referências quebradas pras specs arquivadas**

```bash
cd ~/.claude/projects/-Users-brazilianhustler/memory
grep -rln "\[\[InkFlow — Sub-spec Mapa Canônico\|\[\[InkFlow — Sub-spec Auditores MVP\|\[\[InkFlow — Auditor key-expiry\|\[\[InkFlow — Auditor deploy-health\|\[\[InkFlow — Design Modo Coleta\|\[\[InkFlow — Modo Coleta v2 principal\|\[\[InkFlow — Refator página tatuador\|\[\[InkFlow — Plano-mestre Fábrica" 2>/dev/null
```

Expected: lista de arquivos com referências (pode incluir `Painel.md`, `Painel histórico.md`, `Mapa geral.md`).

- [ ] **Step 2: Pra cada arquivo encontrado, atualizar wiki-link**

Decisão: trocar `[[InkFlow — X]]` por `[[archive/InkFlow — X]]` ou simplesmente deixar (Obsidian lida com referência quebrada exibindo em vermelho — não quebra nada técnico).

**Decisão preferida**: trocar pra `[[archive/InkFlow — X]]` em **2 arquivos críticos**: `Painel.md` e `Mapa geral.md`. Demais ficam como referências quebradas (sinal visual de "histórico").

Para cada match, usar Edit tool.

- [ ] **Step 3: Buscar mesma coisa no vault**

```bash
grep -rln "\[\[InkFlow — Sub-spec Mapa Canônico\|\[\[InkFlow — Sub-spec Auditores MVP\|\[\[InkFlow — Auditor key-expiry\|\[\[InkFlow — Auditor deploy-health\|\[\[InkFlow — Design Modo Coleta\|\[\[InkFlow — Modo Coleta v2 principal\|\[\[InkFlow — Refator página tatuador\|\[\[InkFlow — Plano-mestre Fábrica" /Users/brazilianhustler/Documents/vault/ 2>/dev/null
```

Expected: lista (provavelmente `Inkflow_plan/README.md` ou similar). Atualizar conforme decisão do Step 2.

- [ ] **Step 4: Commit memory + vault**

```bash
cd ~/.claude/projects/-Users-brazilianhustler/memory
git add -A && git diff --cached --quiet || git commit -m "chore(memory): atualizar wiki-links pra archive/"

cd /Users/brazilianhustler/Documents/vault
git add -A && git diff --cached --quiet || git commit -m "chore: atualizar wiki-links pra archive/ pos-limpeza"
```

---

## Task 8: Commands — deletar `/fix-rapido`

**Files:**
- Delete: `~/.claude/commands/fix-rapido.md`

- [ ] **Step 1: Confirmar arquivo existe**

```bash
ls -la ~/.claude/commands/fix-rapido.md
```

Expected: 1 linha com tamanho > 0.

- [ ] **Step 2: Deletar**

```bash
rm ~/.claude/commands/fix-rapido.md
ls ~/.claude/commands/ | grep fix-rapido && echo "AINDA EXISTE — FALHOU" || echo "OK — deletado"
```

Expected: `OK — deletado`.

- [ ] **Step 3: Verificar contagem**

```bash
ls ~/.claude/commands/*.md | wc -l
```

Expected: `12` (de 13 originais).

---

## Task 9: Commands — medir uso de `/mentalidade` e `/plan`, decidir

**Files:**
- (condicional) Delete: `~/.claude/commands/mentalidade.md`
- (condicional) Delete: `~/.claude/commands/plan.md`

- [ ] **Step 1: Medir uso de `/mentalidade` no histórico**

```bash
grep -c "/mentalidade" ~/.claude/history.jsonl 2>/dev/null || echo "0"
```

Expected: número.

**Decisão**:
- Se ≤2 invocações no histórico todo → kill (rm)
- Se ≥3 → manter

- [ ] **Step 2: Medir uso de `/plan`**

```bash
grep -c '"/plan"\|"/plan "' ~/.claude/history.jsonl 2>/dev/null || echo "0"
```

Expected: número. Cuidado: o regex `/plan` casaria com `/plan-X` também — por isso o quote duplo.

- [ ] **Step 3: Comparar `/plan` custom com `superpowers:writing-plans`**

```bash
cat ~/.claude/commands/plan.md
```

Critério de decisão:
- Se o `/plan` custom traz instruções específicas pro InkFlow (Mentalidade pilar 2, vault, Painel, padrão de spec→plan→exec) que `superpowers:writing-plans` não cobre → **manter**
- Se é só wrapper que invoca writing-plans sem agregar nada → **kill**

- [ ] **Step 4: Aplicar decisões**

Pra cada arquivo a deletar:

```bash
rm ~/.claude/commands/mentalidade.md  # SE Step 1 decidiu kill
rm ~/.claude/commands/plan.md         # SE Step 3 decidiu kill
ls ~/.claude/commands/*.md | wc -l
```

Expected: 10-12 (depende das decisões).

---

## Task 10: MCPs — remover 12 servidores duplicados/sem uso

**Files:**
- (não modifica arquivos diretamente — `claude mcp remove` mexe na config interna)

- [ ] **Step 1: Confirmar lista a remover**

```bash
cat <<'EOF'
Vou remover (12):
1. claude.ai Bitly
2. claude.ai Intercom
3. claude.ai Netlify
4. claude.ai PostHog
5. claude.ai Sentry
6. claude.ai Supabase
7. claude.ai Cloudflare Developer Platform
8. chrome-devtools
9. plugin:cloudflare:cloudflare-bindings
10. plugin:cloudflare:cloudflare-builds
11. plugin:cloudflare:cloudflare-observability
12. plugin:sentry:sentry
EOF
```

- [ ] **Step 2: Remover MCPs locais (não-managed)**

```bash
claude mcp remove chrome-devtools 2>&1
```

Expected: confirmação de remoção.

- [ ] **Step 3: Remover MCPs `plugin:*` (sub-servidores Cloudflare/Sentry)**

```bash
claude mcp remove "plugin:cloudflare:cloudflare-bindings" 2>&1
claude mcp remove "plugin:cloudflare:cloudflare-builds" 2>&1
claude mcp remove "plugin:cloudflare:cloudflare-observability" 2>&1
claude mcp remove "plugin:sentry:sentry" 2>&1
```

Expected: 4 confirmações. Se `plugin:*` não puder ser removido via `claude mcp remove` (porque vem do plugin enabled), **anotar e tratar via Task 11** (desabilitar plugin parcial não é trivial — manter plugin habilitado mas anotar como "carregado mas não usado" é a saída).

- [ ] **Step 4: Remover MCPs `claude.ai *` (managed)**

```bash
claude mcp remove "claude.ai Bitly" 2>&1
claude mcp remove "claude.ai Intercom" 2>&1
claude mcp remove "claude.ai Netlify" 2>&1
claude mcp remove "claude.ai PostHog" 2>&1
claude mcp remove "claude.ai Sentry" 2>&1
claude mcp remove "claude.ai Supabase" 2>&1
claude mcp remove "claude.ai Cloudflare Developer Platform" 2>&1
```

Expected: 7 confirmações. Se algum falhar com "managed via claude.ai", anotar — provavelmente precisa desconectar via UI claude.ai (web). **Não bloqueia o resto** — registrar como pendência manual e seguir.

- [ ] **Step 5: Verificar contagem final**

```bash
claude mcp list 2>/dev/null | grep -cE "✓|!"
```

Expected: ≤14 (de 24 originais). Se > 14, listar quais sobraram e investigar.

- [ ] **Step 6: Snapshot do estado final**

```bash
claude mcp list > ~/.claude/backups/mcp-list.pos-task10-2026-05-06.txt 2>&1
diff ~/.claude/backups/mcp-list.pre-limpeza-2026-05-06.txt ~/.claude/backups/mcp-list.pos-task10-2026-05-06.txt | head -30
```

Expected: diff mostrando os MCPs removidos.

---

## Task 11: Plugins — desabilitar `code-review` e `sentry`

**Files:**
- Modify: `~/.claude/settings.json`

- [ ] **Step 1: Ler settings.json atual pra confirmar estado**

```bash
grep -E "code-review|sentry" ~/.claude/settings.json
```

Expected:
```
"code-review@claude-plugins-official": true,
"sentry@claude-plugins-official": true,
```

- [ ] **Step 2: Editar via Edit tool**

```
file_path: /Users/brazilianhustler/.claude/settings.json
old_string: "code-review@claude-plugins-official": true,
new_string: "code-review@claude-plugins-official": false,
```

```
file_path: /Users/brazilianhustler/.claude/settings.json
old_string: "sentry@claude-plugins-official": true,
new_string: "sentry@claude-plugins-official": false,
```

- [ ] **Step 3: Verificar mudança**

```bash
grep -E "code-review|sentry" ~/.claude/settings.json
```

Expected:
```
"code-review@claude-plugins-official": false,
"sentry@claude-plugins-official": false,
```

---

## Task 12: Plugins — verificar `typescript-lsp`, decidir

**Files:**
- (condicional) Modify: `~/.claude/settings.json`

- [ ] **Step 1: Contar arquivos TS vs JS no inkflow-saas**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
TS=$(find . -type f -name "*.ts" -not -path "*/node_modules/*" -not -path "*/.git/*" | wc -l)
JS=$(find . -type f -name "*.js" -not -path "*/node_modules/*" -not -path "*/.git/*" | wc -l)
echo "TS: $TS, JS: $JS"
echo "Ratio JS:TS = $(echo "scale=2; $JS / ($TS + 0.001)" | bc):1"
```

Expected: imprimir contagens. Se ratio JS:TS > 9 (90:10), prosseguir pra desabilitar.

- [ ] **Step 2 (condicional): Desabilitar typescript-lsp**

Se ratio JS:TS > 9:1:

```
file_path: /Users/brazilianhustler/.claude/settings.json
old_string: "typescript-lsp@claude-plugins-official": true,
new_string: "typescript-lsp@claude-plugins-official": false,
```

Senão: skip (manter ativo).

- [ ] **Step 3: Investigar `pr-review-toolkit` filtro de sub-agents**

```bash
ls ~/.claude/plugins/cache/claude-plugins-official/pr-review-toolkit/ 2>/dev/null
find ~/.claude/plugins/cache/claude-plugins-official/pr-review-toolkit/ -name "*.md" -o -name "config*" 2>/dev/null | head -10
```

Expected: estrutura do plugin. Se houver config de habilitar agents seletivamente, anotar como TODO; se não houver, registrar como "limitação aceita — 6 agents continuam carregados, só os 2 úteis são invocados na prática".

**Não bloqueia** — só investigação. Resultado vira nota no Painel.

---

## Task 13: Permissions — rodar `fewer-permission-prompts`

**Files:**
- Modify: `~/.claude/settings.local.json`

- [ ] **Step 1: Invocar skill em modo dry-run**

Em sessão atual:

```
Skill(skill="fewer-permission-prompts", args="dry-run")
```

(Conferir docs da skill se aceita arg `dry-run` — se não, pedir pra ela mostrar o plano antes de aplicar.)

Expected: skill apresenta lista de consolidações propostas (ex: "agrupar 23 entries `Bash(grep -nE ...)` em `Bash(grep *)`").

- [ ] **Step 2: Revisar proposta**

Critério de rejeição: `Bash(*)` ou `mcp__*` muito amplo. Esses são vetores de risco — exigem aprovação explícita.

Se proposta ok → Step 3.
Se proposta tem matchers amplos demais → recusar e refinar argumentos da skill (rodar de novo com instrução "evitar matchers globais").

- [ ] **Step 3: Aplicar**

Aprovar a proposta (skill aplica).

- [ ] **Step 4: Verificar contagem**

```bash
grep -cE '^\s+"(mcp__|Skill|Bash)' ~/.claude/settings.local.json
```

Expected: ≤150 (de 346 originais).

---

## Task 14: Verificação final + métricas pós + teste empírico DEPOIS

**Files:**
- Create: `~/.claude/backups/pos-metrics.2026-05-06.txt`
- Create: `~/.claude/backups/empirico-pos.2026-05-06.md`

- [ ] **Step 1: Capturar métricas pós**

```bash
{
  echo "=== POS-LIMPEZA 2026-05-06 ==="
  echo ""
  echo "## MCPs (com health check)"
  claude mcp list 2>/dev/null | grep -cE "✓|!"
  echo ""
  echo "## Permissions allow (entries)"
  grep -cE '^\s+"(mcp__|Skill|Bash)' ~/.claude/settings.local.json
  echo ""
  echo "## Memory total (linhas)"
  wc -l ~/.claude/projects/-Users-brazilianhustler/memory/*.md | tail -1
  echo ""
  echo "## Memory file count"
  ls ~/.claude/projects/-Users-brazilianhustler/memory/*.md | wc -l
  echo ""
  echo "## MEMORY.md (linhas)"
  wc -l ~/.claude/projects/-Users-brazilianhustler/memory/MEMORY.md
  echo ""
  echo "## Custom commands"
  ls ~/.claude/commands/*.md | wc -l
} > ~/.claude/backups/pos-metrics.2026-05-06.txt
cat ~/.claude/backups/pos-metrics.2026-05-06.txt
```

- [ ] **Step 2: Comparar com baseline**

```bash
diff ~/.claude/backups/baseline-metrics.pre-limpeza-2026-05-06.txt ~/.claude/backups/pos-metrics.2026-05-06.txt
```

Expected: diff mostrando reduções.

- [ ] **Step 3: Validar DoD numérico**

Critérios (do spec):
- [ ] MCPs ≤14 ✅/❌
- [ ] Permissions ≤150 ✅/❌
- [ ] Memory total ≤2700 linhas ✅/❌
- [ ] MEMORY.md ≤25 linhas ✅/❌

Se algum ❌, investigar e ajustar antes de seguir pra Task 15.

- [ ] **Step 4: Teste empírico DEPOIS**

Iniciar **nova sessão Claude Code** (Cmd+K ou nova janela com `claude`). Rodar:

```
/daily-start
```

Anotar em `~/.claude/backups/empirico-pos.2026-05-06.md`:

```markdown
# Empírico pós — /daily-start DEPOIS da limpeza

Data: 2026-05-06
Sessão: nova/limpa pós-limpeza

## Tempo até primeira resposta
- Aproximado: ___ segundos

## Qualidade subjetiva (1-5)
- Foco da resposta: ___
- Sensação de "ruído de fundo": ___

## Comparação com baseline
- Melhorou? Sim/Não
- O quê especificamente?

[anotar]
```

- [ ] **Step 5: Decisão**

Leandro confirma melhora subjetiva? Se sim → seguir pra Task 15. Se não → investigar (provavelmente faltou onda de mais peso, ou o ganho real está em outra dimensão).

---

## Task 15: Documentação pós-limpeza

**Files:**
- Modify: `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Painel.md`
- Create: `/Users/brazilianhustler/Documents/vault/Inkflow_plan/InkFlow — Limpeza Tooling 2026-05-06.md`
- Modify: `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Pendências (backlog).md`

- [ ] **Step 1: Atualizar Painel com seção "Limpeza tooling"**

Editar `InkFlow — Painel.md` adicionando seção:

```markdown
## 🧹 Limpeza tooling (2026-05-06)

**Resultados:**
- MCPs: [N_baseline] → [N_pos] ([%])
- Permissions: [N_baseline] → [N_pos] ([%])
- Memory: [N_baseline] → [N_pos] linhas ([%])
- Commands: 13 → [N_final]

**Ganhos qualitativos:**
- [colar trecho de empirico-pos.2026-05-06.md]

**Decisões diferidas:**
- Sentry vs PostHog vs Workers Logs → frente B (P1 backlog)
- pr-review-toolkit filtro de sub-agents → [resultado da investigação Task 12]

**Próximo passo:** frente C (rotina) — escolher sub-camada C1/C2/C3/C4
```

Substituir `[N_baseline]`, `[N_pos]` e `[%]` pelos números reais. Se a seção "Onde estamos agora" do Painel deve ser atualizada também, fazer.

- [ ] **Step 2: Criar nota âncora no vault**

```markdown
# /Users/brazilianhustler/Documents/vault/Inkflow_plan/InkFlow — Limpeza Tooling 2026-05-06.md
---
tags: [inkflow, meta-tooling, claude-code, limpeza]
date: 2026-05-06
---

# InkFlow — Limpeza Tooling 2026-05-06

**Spec**: `inkflow-saas/docs/superpowers/specs/2026-05-06-limpeza-tooling-design.md` (commit `bcc98e8`)

**Plano**: `inkflow-saas/docs/superpowers/plans/2026-05-06-limpeza-tooling.md`

**Resumo**: auditoria + enxugamento de 24 MCPs / 346 permissions / 4531 linhas memory antes da frente C (rotina). Decisão Sentry diferida pra frente B.

**Resultados**: ver [[InkFlow — Painel]] seção "Limpeza tooling 2026-05-06".

**Backups locais**:
- `~/.claude/backups/settings.json.pre-limpeza-2026-05-06`
- `~/.claude/backups/settings.local.json.pre-limpeza-2026-05-06`
- `~/.claude/backups/mcp-list.pre-limpeza-2026-05-06.txt`
```

- [ ] **Step 3: Adicionar item ao backlog**

Editar `InkFlow — Pendências (backlog).md` adicionando:

```markdown
- **P1 frente B — Avaliar Sentry vs PostHog vs Workers Logs aprimorado pra error tracking frontend (e backend)**
  - Contexto: Sentry foi desligado em 2026-05-06 durante limpeza tooling porque setup parcial vira ruído. Decisão diferida pra ter análise estratégica completa na frente B (observabilidade).
  - Análise base: ver discussão na sessão 2026-05-06 (spec limpeza-tooling, decisão D2)
  - Critério: avaliar visibilidade frontend real (clientes acessando admin/studio/onboarding.html) vs custo setup
```

- [ ] **Step 4: Commits finais**

```bash
cd ~/.claude/projects/-Users-brazilianhustler/memory
git add Painel.md "InkFlow — Pendências (backlog).md"
git commit -m "docs(painel): registrar resultados limpeza-tooling 2026-05-06 + item P1 backlog frente B"

cd /Users/brazilianhustler/Documents/vault
git add "Inkflow_plan/InkFlow — Limpeza Tooling 2026-05-06.md"
git commit -m "docs: nota âncora limpeza tooling 2026-05-06"
```

- [ ] **Step 5: Atualizar status do spec na branch**

Editar frontmatter de `inkflow-saas/docs/superpowers/specs/2026-05-06-limpeza-tooling-design.md`:

```
old: status: design-pendente-aprovacao
new: status: implementado
```

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add docs/superpowers/specs/2026-05-06-limpeza-tooling-design.md
git commit -m "docs(specs): limpeza-tooling — marcar como implementado"
```

---

## Self-Review (executado durante escrita do plano)

**Spec coverage check** — cada decisão/escopo do spec tem task correspondente:

| Spec | Task |
|---|---|
| D1. Ordem das frentes | (decisão arquitetural — não é task) |
| D2. Sentry diferido | T10 (kill MCPs) + T15 (item backlog) |
| D3. `/fix-rapido` morre | T8 |
| D4. pr-review-toolkit reduzido | T12 (investigação) |
| D5. Daily notes pro vault | T4 |
| MCPs KILL (12) | T10 |
| Plugins desabilitar code-review/sentry | T11 |
| Plugins revisar typescript-lsp | T12 |
| Commands KILL `/fix-rapido` | T8 |
| Commands revisar `/mentalidade`, `/plan` | T9 |
| Memory mover daily notes | T4 |
| Memory archive specs | T5 |
| MEMORY.md update | T6 |
| Wiki-links validation | T7 |
| Permissions slim | T13 |
| Backup + baseline | T1, T2 |
| Verificação final + DoD | T14 |
| Documentação pós | T15 |

✅ Cobertura completa.

**Placeholder check** — nenhum "TBD"/"TODO"/"add appropriate X" no plano. Há decisões condicionais (`if/else`) explícitas, todas com critério mensurável.

**Type/name consistency** — paths e nomes de MCPs verificados contra `claude mcp list` real do dia 06/05.

---

## Notas de execução

- **Cada onda é committable independente** — se algo der errado em Task N, as anteriores já estão em git history (3 repos: inkflow-saas, memory, vault).
- **Reversibilidade**:
  - Settings: `cp ~/.claude/backups/settings.json.pre-limpeza-2026-05-06 ~/.claude/settings.json`
  - MCPs: `claude mcp add` reusando configs do `mcp-list.pre-limpeza-2026-05-06.txt`
  - Memory/vault: `git revert` ou `git checkout`
- **Estimativa total**: 2h-2h30 de execução focada (não inclui leitura/discussão).
- **Sessão limpa pra teste empírico**: importante que Task 2 e Task 14 sejam em sessões NOVAS (não reaproveitar a de execução), porque sessão de execução já tem contexto carregado das tarefas.

---

## Riscos lembrados (do spec)

| ID | Mitigação no plano |
|---|---|
| R1 — kill MCP usado indireto | T1 Step 2 (snapshot) + reversibilidade explícita |
| R2 — wiki-link quebrado | T7 (validação dedicada) |
| R3 — permissions skill muito ampla | T13 Step 2 (revisar antes de aplicar) |
| R4 — desabilitar plugin com skill útil | T11 só desabilita 2 plugins com sobreposição clara |
| R5 — telegram MCP cair | aceito (já caiu uma vez) — reconectar se necessário |
