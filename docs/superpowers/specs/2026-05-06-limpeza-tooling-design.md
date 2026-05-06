---
title: Limpeza Tooling — auditoria e enxugamento de MCPs, plugins, commands, memory, permissions
slug: limpeza-tooling
date: 2026-05-06
status: implementado-parcialmente
branch: chore/limpeza-tooling-2026-05-06
type: meta-tooling
related:
  - 2026-05-06-refator-prompts-coleta-v2-design.md
---

# Limpeza Tooling — auditoria e enxugamento

## Contexto

Auditoria do setup Claude Code (sessão 06/05) revelou inventário inflado, com sobreposições, duplicações e itens quebrados ocupando contexto sem entregar valor proporcional. A limpeza é **pré-requisito** pra frente C (rotina diária), porque construir automações novas em cima de um inventário inflado herda o mesmo problema — qualquer ganho de performance é comido pelo custo de carregamento dos itens órfãos.

### Inventário atual (06/05/2026)

| Categoria | Quantidade | Sintomas |
|---|---|---|
| MCP servers conectados | **24** | 5+ duplicados, 6+ sem auth e quebrados, 4+ sem uso real |
| Plugins ativos | 10 + 1 skill | 2-3 com sobreposição (code-review × pr-review-toolkit) |
| Sub-agents pr-review-toolkit | 6 | Provavelmente só 2 usados de fato |
| Custom commands | 13 (659 linhas) | 1-2 redundantes, 1 raramente usado |
| Memory files | 54 (4531 linhas) | 12 daily notes que pertencem ao vault + 5-7 specs frias |
| Permissions allow | **346 entries** | Várias redundâncias resolvíveis com `*` matchers |

### Sintomas observados

- **Telegram MCP caiu durante a sessão de auditoria** (system-reminder 06/05) — ilustra fragilidade: MCPs caem, deixam fantasmas no contexto
- **5 servidores Cloudflare** ativos (`cloudflare-api`, `cloudflare-docs`, `cloudflare-bindings`, `cloudflare-builds`, `cloudflare-observability`, + `claude_ai_Cloudflare_Developer_Platform`) — só 2 têm auth válida
- **Sentry duplicado** (`claude_ai_Sentry` + `plugin:sentry:sentry`) — ambos pedem auth, ambos não usados
- **Supabase duplicado** (`claude_ai_Supabase` + `plugin:supabase:supabase`) — mesma função, contexto dobrado
- **`/fix-rapido` e `/hotfix`** — Leandro não escolhe conscientemente, Claude que decide; alta chance de inconsistência

## Objetivo

Reduzir contexto carregado por padrão **sem perder funcionalidade que o user usa de verdade**. Prepara o terreno pra frente C (rotina) render de verdade.

## Não-objetivos

- Não fazer corte cego ("limpar por limpar")
- Não introduzir features novas (isso é frente C)
- Não tocar em produto (`inkflow-saas/functions/*`, schema Supabase, workflows n8n)
- Não decidir Sentry vs alternativas agora (decisão diferida pra frente B)

## Decisões já tomadas

### D1. Ordem das frentes (limpeza → C → B → A → D)
- **Por quê**: limpeza é multiplicador. Cada watt de contexto economizado vira watt disponível pra trabalho real nas frentes seguintes.
- **Alternativa rejeitada**: limpeza embutida nas frentes (incremental). Risco: débito técnico permanente, sem nunca pagar a auditoria completa.

### D2. Sentry diferido pra frente B
- **Por quê**: Sentry **não é crítico** pro funcionamento do InkFlow. Mas tem caso de uso forte (visibilidade frontend) que merece análise estratégica junto com alternativas (PostHog, Workers Logs aprimorado, Logflare). Decisão prematura agora vira lock-in.
- **Ação**: kill MCPs Sentry + plugin desabilitado AGORA. Adicionar item P1 ao backlog (`InkFlow — Pendências`) com link pra análise feita nessa sessão.

### D3. `/fix-rapido` morre, `/hotfix` mantém
- **Por quê**: bug trivial 1 linha = `git commit` normal, não precisa ritual. `/hotfix` cobre o caso crítico (bug em prod, emergencial mas disciplinado). Manter 1 comando claro > 2 sobrepostos que confundem o próprio Claude.

### D4. `pr-review-toolkit` reduzido a 2 sub-agents
- **Por quê**: dos 6 agents (code-reviewer, code-simplifier, comment-analyzer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer), o que cobre o `/dod` real é **code-reviewer + silent-failure-hunter**. Os outros 4 podem voltar se aparecer dor real — mas hoje pagam custo de carregamento sem entrega.

### D5. Daily notes saem da memory pro vault
- **Por quê**: daily notes (`2026-04-XX.md`) são notas operacionais do vault Obsidian, não memory persistente do Claude. Estão na pasta errada — dobram custo (memory carrega no contexto, vault tem indexação própria via `obsidian-memory` MCP).

## Escopo (full sweep)

### 1. MCPs (24 → ~12)

#### KILL (matar)

| MCP | Razão |
|---|---|
| `claude_ai_Supabase` | Duplicado de `plugin:supabase:supabase` (mantido) |
| `claude_ai_Sentry` | Sem auth + duplicado + diferido pra B |
| `plugin:sentry:sentry` | Sem auth + diferido pra B (plugin desabilitado em 2.) |
| `claude_ai_Cloudflare_Developer_Platform` | Duplicado de `plugin:cloudflare:cloudflare-api` |
| `plugin:cloudflare:cloudflare-bindings` | Sem auth, raramente necessário |
| `plugin:cloudflare:cloudflare-builds` | Sem auth, raramente necessário |
| `plugin:cloudflare:cloudflare-observability` | Sem auth, frente B vai decidir |
| `claude.ai Bitly` | Sem uso real comprovado |
| `claude.ai Intercom` | Sem uso real comprovado |
| `claude.ai Netlify` | Sem auth, InkFlow não usa Netlify (Cloudflare) |
| `claude.ai PostHog` | Sem auth, sem uso atual |
| `chrome-devtools` | Sobreposição com Playwright (manter Playwright) |

**Resultado**: 12 MCPs removidos.

#### KEEP (manter)

| MCP | Justificativa de uso |
|---|---|
| `github` | PRs, issues, releases — uso diário no fluxo |
| `n8n` | Workflows Coleta v2 — uso ativo |
| `plugin:supabase:supabase` | DB, RLS, advisors, migrations — uso diário |
| `plugin:telegram:telegram` | @inkflow_studio_bot ativo (reconectar quando cair) |
| `plugin:cloudflare:cloudflare-api` | Workers/Pages — uso ativo |
| `plugin:cloudflare:cloudflare-docs` | Referência docs Cloudflare durante dev |
| `obsidian-memory` | Memory persistente — base do workflow |
| `obsidian-vault` | Vault Obsidian — base do workflow |
| `playwright` | Smoke E2E (browser automation) |
| `claude.ai Gmail` | Lifestyle/business (uso pessoal) |
| `claude.ai Google Calendar` | Lifestyle/business |
| `claude.ai Google Drive` | Lifestyle/business |
| `claude.ai MailerLite` | Plano Premium (frente D) — manter, vai usar |

**Resultado**: 13 MCPs mantidos.

### 2. Plugins (10 ativos → ~7)

#### Desabilitar via `~/.claude/settings.json`

| Plugin | Razão |
|---|---|
| `code-review` | Sobreposição com `pr-review-toolkit` (mantido) |
| `sentry` | Diferido pra frente B (decisão D2) |

#### Revisar caso a caso

| Plugin | Ação |
|---|---|
| `typescript-lsp` | Verificar se há `.ts` no `inkflow-saas`. Se ratio JS:TS for >90:10, desabilitar. |
| `pr-review-toolkit` | Manter ATIVO mas configurar pra usar só `code-reviewer` + `silent-failure-hunter` (decisão D4). Investigar se há mecanismo de filtro de sub-agents. |

#### KEEP (sem mudança)

- `superpowers` (essencial — brainstorming, plans, TDD, debugging)
- `supabase` (essencial)
- `cloudflare` (essencial)
- `telegram` (essencial — bot ativo)
- `frontend-design` (uso em páginas HTML do InkFlow)
- `commit-commands` (validar uso real — se Leandro usa `/commit`)
- `github` (já desabilitado nas settings — mantém como está)

### 3. Custom commands (13 → 11)

#### KILL

| Command | Razão |
|---|---|
| `/fix-rapido` | Decisão D3 — caso trivial é `git commit` normal |

#### Revisar

| Command | Ação |
|---|---|
| `/mentalidade` | Medir uso real (grep no `~/.claude/history.jsonl` do último mês). Se <2 invocações, kill. |
| `/plan` | Comparar com `superpowers:writing-plans`. Se o custom não traz instruções específicas pro InkFlow (Mentalidade pilar 2, vault, Painel), kill. Se traz, manter. |

#### KEEP (sem mudança)

`/daily-start`, `/daily-end`, `/session-end`, `/incidente`, `/backlog-add`, `/backlog-review`, `/nova-feature`, `/dod`, `/deploy-check`, `/hotfix`

### 4. Memory hygiene (54 files / 4531 linhas → ~30 files / ~2500 linhas)

#### Mover daily notes pro vault

12 arquivos `2026-04-XX.md` e `2026-05-0X.md` → `vault/Daily Notes/`

**Cautela**: verificar se `MEMORY.md` ou outros memory files referenciam wiki-link `[[YYYY-MM-DD]]`. Se sim, atualizar caminho relativo ou remover referência.

#### Arquivar specs resolvidas em `memory/archive/`

Critério: spec de feature **mergeada e estabilizada**, sem decisão pendente atrelada.

| Arquivo | Status |
|---|---|
| `InkFlow — Sub-spec Mapa Canônico (2026-04-26).md` | Mergeado (PRs #4+#5) |
| `InkFlow — Sub-spec Auditores MVP (2026-04-27).md` | Sub-projeto fechado 5/5 |
| `InkFlow — Auditor key-expiry (2026-04-27).md` | Mergeado (PR #11) + smoke fechado |
| `InkFlow — Auditor deploy-health (2026-04-29).md` | Mergeado (PR #12) + smoke fechado |
| `InkFlow — Design Modo Coleta (2026-04-22).md` | SUPERSEDED por v2 |
| `InkFlow — Modo Coleta v2 principal (2026-05-02).md` | Em prod (10 fases) — pode arquivar (referência histórica) |
| `InkFlow — Refator página tatuador (2026-05-03).md` | Inativo agora (4/9 PRs); manter mas marcar como pausa |
| `InkFlow — Plano-mestre Fábrica (2026-04-25).md` | Sub-projetos 1+3 fechados; resto distante |

**Total**: 7-8 arquivos movidos pro archive.

#### Atualizar `MEMORY.md`

- Remover entries dos arquivos arquivados (ou substituir por linha "→ archive/")
- Manter entries de itens ATIVOS: Painel, Brainstorm refator-prompts, Plano Premium, Backlog, Anomalias
- Manter entries META: 7 feedbacks + 5 user/preferências + Mentalidade + bws_setup + setup_vps_mirror + automation_git_sync

**Resultado esperado**: MEMORY.md de 40 linhas → ~22 linhas (mais focado, menos ruído).

### 5. Permissions (346 → ~120)

Rodar skill **`fewer-permission-prompts`** (já disponível no system).

A skill scaneia o transcript histórico, identifica padrões repetitivos e propõe consolidação com `*` matchers. **Modo dry-run primeiro** (skill suporta), revisar proposta, aplicar.

**Cautela**: skill pode propor `Bash(*)` muito amplo — revisar antes de aprovar pra não conceder permissão genérica indevida.

## Estratégia de execução (5 ondas, menor → maior risco)

### Onda 0 — Backup e baseline (~5 min)

```bash
# Backup settings
cp ~/.claude/settings.json ~/.claude/backups/settings.json.pre-limpeza-2026-05-06
cp ~/.claude/settings.local.json ~/.claude/backups/settings.local.json.pre-limpeza-2026-05-06

# Backup memory (já em git, mas commit dedicado pra ponto de retorno limpo)
cd /Users/brazilianhustler/.claude/projects/-Users-brazilianhustler/memory
git add -A && git commit -m "snapshot pre-limpeza-tooling 2026-05-06"

# Métricas baseline
echo "=== BASELINE 2026-05-06 ==="
claude mcp list 2>/dev/null | grep -E "✓|!" | wc -l                    # MCPs ativos
grep -cE "^\s+\"(mcp__|Skill|Bash)" ~/.claude/settings.local.json       # permissions
wc -l ~/.claude/projects/-Users-brazilianhustler/memory/*.md | tail -1  # memory total
```

**Teste empírico baseline**: rodar `/daily-start` sem nada novo no contexto, anotar (1) tempo até primeira resposta, (2) qualidade subjetiva da resposta inicial.

### Onda 1 — Memory hygiene (risco baixo)

1. Criar `vault/Daily Notes/` se não existir
2. Mover 12 daily notes (`mv` ou `cp + rm`) com verificação de wiki-links antes
3. Criar `memory/archive/` 
4. Mover 7-8 specs resolvidas
5. Atualizar `MEMORY.md` (Edit tool, linha por linha)
6. Verificar wiki-links quebrados: `grep -r "\[\[InkFlow — Sub-spec Mapa Canônico\]\]" memory/ vault/`

**Reversível**: `git checkout` no estado anterior.

### Onda 2 — Commands (risco baixo)

1. `rm ~/.claude/commands/fix-rapido.md`
2. Medir uso de `/mentalidade` (`grep -c "/mentalidade" ~/.claude/history.jsonl` do último mês)
3. Decidir kill ou manter
4. Comparar `/plan` custom × `superpowers:writing-plans` (Read no custom, decidir)

### Onda 3 — MCPs (risco médio)

Para cada MCP a remover:

```bash
claude mcp remove <nome>
```

Lista (12 removals):
1. `claude_ai_Supabase`
2. `claude_ai_Sentry`
3. `plugin:sentry:sentry` (após desabilitar plugin)
4. `claude_ai_Cloudflare_Developer_Platform`
5. `plugin:cloudflare:cloudflare-bindings`
6. `plugin:cloudflare:cloudflare-builds`
7. `plugin:cloudflare:cloudflare-observability`
8. `claude.ai Bitly`
9. `claude.ai Intercom`
10. `claude.ai Netlify`
11. `claude.ai PostHog`
12. `chrome-devtools`

**Reversível**: `claude mcp add <nome> <config>` — guardar configs originais antes de remover (snapshot do `claude mcp list` em arquivo).

### Onda 4 — Plugins (risco médio)

1. Editar `~/.claude/settings.json` → mudar `code-review` e `sentry` pra `false`
2. Verificar TypeScript no `inkflow-saas`:
   ```bash
   cd /Users/brazilianhustler/Documents/inkflow-saas
   find . -name "*.ts" -not -path "*/node_modules/*" | wc -l
   find . -name "*.js" -not -path "*/node_modules/*" | wc -l
   ```
   Se ratio JS:TS for >90:10, desabilitar `typescript-lsp`.
3. Investigar se `pr-review-toolkit` tem config de filtro de sub-agents. Se não tiver, registrar como limitação aceita (não desabilita o plugin todo, mas anota que só 2 dos 6 são úteis).

**Reversível**: revert `settings.json`.

### Onda 5 — Permissions (risco baixo)

1. Invocar `fewer-permission-prompts` skill em modo dry-run
2. Revisar proposta de consolidação (rejeitar `Bash(*)` amplo demais se aparecer)
3. Aplicar
4. Verificar `wc -l ~/.claude/settings.local.json` antes/depois

**Reversível**: backup já feito na Onda 0.

### Onda 6 — Verificação final (~10 min)

```bash
echo "=== POS-LIMPEZA 2026-05-06 ==="
claude mcp list 2>/dev/null | grep -E "✓|!" | wc -l
grep -cE "^\s+\"(mcp__|Skill|Bash)" ~/.claude/settings.local.json
wc -l ~/.claude/projects/-Users-brazilianhustler/memory/*.md | tail -1
```

**Teste empírico pós**: rodar `/daily-start` em sessão NOVA (Cmd+K ou nova janela) com mesmo contexto neutro. Comparar (1) tempo até primeira resposta, (2) qualidade subjetiva.

## Critério de sucesso (DoD)

### Métricas objetivas

- [ ] **MCPs**: 24 → ≤14 (alvo: 13)
- [ ] **Permissions**: 346 → ≤150 (alvo: ~120)
- [ ] **Memory total**: 4531 linhas → ≤2700 linhas (alvo: ~2500)
- [ ] **MEMORY.md index**: 40 linhas → ≤25 linhas

### Empírico

- [ ] Teste `/daily-start` antes vs depois: Leandro confirma melhora subjetiva (resposta mais focada / sensação de "menos ruído de fundo")
- [ ] Nenhum command/skill que Leandro usa de verdade foi removido (validação: 1 dia de uso normal pós-limpeza sem queixa)

### Reversibilidade

- [ ] Backup de `settings.json` + `settings.local.json` em `~/.claude/backups/`
- [ ] Memory commit dedicado "snapshot pre-limpeza" antes da Onda 1
- [ ] Snapshot de `claude mcp list` em arquivo antes da Onda 3 (pra reativar com config original se necessário)

### Documentação

- [ ] `Painel` atualizado com seção "Limpeza tooling 2026-05-06 — resultados"
- [ ] Nota âncora no vault: `vault/Inkflow_plan/InkFlow — Limpeza Tooling 2026-05-06.md` apontando pra esse spec
- [ ] Item adicionado a `InkFlow — Pendências (backlog)`: P1 frente B "Avaliar Sentry vs PostHog vs Workers Logs aprimorado" com link pra análise

## Riscos e mitigação

| ID | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | Matar MCP que Leandro usa indireto via comando | Média | Médio | Backup `claude mcp list` snapshot antes da Onda 3; restauração em <2min |
| R2 | Mover memory referenciada em wiki-link no vault | Média | Baixo | `grep -r "[[Spec X]]"` em memory + vault antes de mover; atualizar referencias |
| R3 | `fewer-permission-prompts` agrupa errado (`Bash(*)` amplo) | Baixa | Alto | Modo dry-run obrigatório, revisar proposta antes de aplicar |
| R4 | Desabilitar plugin que tem skill que Leandro usa | Média | Médio | Revisar skills do plugin antes de desabilitar (`ls ~/.claude/plugins/cache/.../skills/`) |
| R5 | Telegram MCP cair durante execução (já caiu na auditoria) | Alta | Baixo | Reconectar via `claude mcp` no fim; se persistir, investigar config |

## Documentação pós-limpeza

### Painel — seção a adicionar

```markdown
## 🧹 Limpeza tooling (2026-05-06)

**Resultados:**
- MCPs: 24 → 13 (-46%)
- Permissions: 346 → ~120 (-65%)
- Memory: 4531 → ~2500 linhas (-45%)
- Commands: 13 → 11

**Ganhos qualitativos:**
- [Leandro: confirma sensação subjetiva pós-teste empírico]

**Decisões diferidas:**
- Sentry vs PostHog vs Workers Logs → frente B (P1 backlog)
- pr-review-toolkit filtro de sub-agents → investigar API

**Próximo passo:** frente C (rotina) — escolher sub-camada C1/C2/C3/C4
```

### Nota âncora vault

```markdown
---
tags: [inkflow, meta-tooling, claude-code, limpeza]
---
# InkFlow — Limpeza Tooling 2026-05-06

**Spec**: `inkflow-saas/docs/superpowers/specs/2026-05-06-limpeza-tooling-design.md` (commit TBD)

**Resumo**: auditoria + enxugamento de 24 MCPs / 346 permissions / 4531 linhas memory antes da frente C (rotina). Decisão Sentry diferida pra frente B.

**Resultados**: ver Painel.
```

## Gancho pra próxima frente (C — rotina)

Após limpeza concluída e validada (DoD verde), próximo `/nova-feature` é **rotina diária**. Decomposição já mapeada na sessão de auditoria:

- **C1. Captura** — inputs do dia (sessões, incidentes, ideias) — comandos existem, manual mas funciona
- **C2. Síntese** — Painel + Mapa + Backlog organizados (manual hoje, alvo: auto-update)
- **C3. Decisão** — priorização P0/P1, escolha próximo passo (manual hoje, alvo: skill que sugere)
- **C4. Loop** — `/daily-start` ↔ `/daily-end` fechando ciclo com diff inteligente entre sessões

**Pergunta a fazer no kickoff de C**: qual sub-camada queima mais hoje (tempo perdido OU qualidade da decisão)?

## Checklist de execução (pra task list do plano)

Quando esse spec for aprovado, o plano de implementação vai gerar tasks granulares. Resumo:

- [ ] Onda 0 — Backup + baseline (5min)
- [ ] Onda 1 — Memory hygiene (~30min)
- [ ] Onda 2 — Commands (~10min)
- [ ] Onda 3 — MCPs (~20min)
- [ ] Onda 4 — Plugins (~15min)
- [ ] Onda 5 — Permissions skill (~15min)
- [ ] Onda 6 — Verificação final + teste empírico (~10min)
- [ ] Documentação pós (Painel + nota âncora + backlog item) (~15min)

**Estimativa total**: 2h-2h30 de sessão focada.
