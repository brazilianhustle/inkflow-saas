# Vault Arquitetura InkFlow — Design

**Status:** Aprovado em design, pendente revisão final pelo usuário
**Autor:** Leandro + Claude (sessão 2026-05-07)
**Tipo:** Documentação operacional + tooling local

## Problema

Hoje a arquitetura do InkFlow vive em três lugares sem fonte única:

1. **Memory do Claude Code** (`~/.claude/projects/.../memory/`) — point-in-time, não pra leitura humana
2. **Código no repo** (`functions/`, `cron-worker/`, `package.json`) — fonte de verdade técnica mas espalhada
3. **Cabeça do Leandro** — modelo mental que não está escrito em lugar nenhum legível

Quando bater dúvida "como funciona o fluxo X?" ou "qual o stack?", não existe um lugar único e atualizado pra responder. Memory está desatualizada (23 dias). Código exige caçar. Caderno físico não tem.

## Objetivos

- Pasta no Obsidian vault (`~/Documents/vault/InkFlow — Arquitetura/`) como **manual mental do produto**
- Atualização **semi-automática** quando código relevante muda
- Sem inflação de contexto do Claude Code (zero novas skills)
- Suporte a edição manual coexistindo com sync automático
- Rastreabilidade: cada arquivo declara fontes e última atualização

## Não-objetivos

- Substituir documentação técnica detalhada (continua em `docs/` no repo)
- Substituir o `Painel` ou `Pendências` (esses ficam em memory via symlink)
- Documentar features individuais (isso vai em `Inkflow_plan/`)
- Gerar diagramas automáticos (escopo futuro, não MVP)

## Arquitetura — Pasta no Vault

**Localização:** `~/Documents/vault/InkFlow — Arquitetura/`

**Estrutura (11 arquivos):**

```
InkFlow — Arquitetura/
├── README.md                              ← MOC index
├── InkFlow — Stack.md                     ← tecnologias por categoria + status
├── InkFlow — Andar 1 Vitrine.md           ← HTML estático (5 páginas)
├── InkFlow — Andar 2 Recepção.md          ← Pages Functions (~30 endpoints)
├── InkFlow — Andar 3 Cérebro.md           ← Supabase + Evolution + MP + GCal
├── InkFlow — Andar 4 Agente.md            ← migração n8n → OpenAI Agents SDK
├── InkFlow — Fluxo WhatsApp.md            ← mensagem chega → resposta
├── InkFlow — Fluxo Billing.md             ← caminho do dinheiro
├── InkFlow — Fluxo Tenant Lifecycle.md    ← nasce → ativo → paga → inadimplente
├── InkFlow — Subagentes e Skills.md       ← "ofícios" disponíveis
└── InkFlow — Glossário.md                 ← tenant, conversa, FSM, handoff, etc
```

**Convenções:**

- Prefixo `InkFlow — ` em todos arquivos (segue padrão de `Mentalidade/`, `Inkflow_plan/`)
- Links internos `[[wiki-style]]` pra Obsidian fazer graph view
- Cada arquivo termina com bloco "Rastreabilidade" (data, fontes monitoradas, commit-base)
- Tamanho-alvo: 100–300 linhas por arquivo

**Configuração de sincronização:** `.sync-rules.json` na pasta — declara patterns rastreados e qual arquivo do vault eles atualizam. Editável manualmente.

## Arquitetura — Sync Mechanism

### Trigger semi-automático (via slash commands existentes)

Modificações em `~/.claude/commands/session-end.md` e `~/.claude/commands/daily-end.md` adicionam um passo:

> "Antes de fechar, verifica se houve mudança arquitetural via `/vault status`. Se sim, sugere `/vault sync` ao usuário."

### Tabela de regras (rastreado vs ignorado)

**Rastreado (dispara update):**

| Padrão | Arquivo do vault atualizado |
|---|---|
| `package.json` (dependências) | `Stack.md`, `Andar 4 Agente.md` |
| `wrangler.toml` (root + cron-worker) | `Stack.md`, `Andares 2 e 3` |
| `functions/api/**/*.js` (arquivo NOVO) | `Andar 2 Recepção.md` |
| `supabase/migrations/**/*.sql` (NOVO) | `Andar 3 Cérebro.md`, `Glossário.md` |
| `cron-worker/wrangler.toml` (mudança em `[triggers]`) | `Andar 3 Cérebro.md` |
| `.claude/agents/**/*.md` (NOVO) | `Subagentes e Skills.md` |
| `~/.claude/skills/**/SKILL.md` (NOVO) | `Subagentes e Skills.md` |
| `~/.claude/commands/*.md` (NOVO) | `Subagentes e Skills.md` |
| Arquivo `*.html` NOVO na raiz | `Andar 1 Vitrine.md` |

**Ignorado (não dispara):**

- Mudanças em `tests/`, `evals/`, `docs/`
- Mudanças no conteúdo (CSS, copy, JS interno) de HTMLs existentes
- Refactor que não muda interface pública
- Lint/format
- `.github/` workflows (a menos que substituição completa de CI/CD)

### Janela do diff

`HEAD~5..HEAD` + uncommitted changes (`git status --porcelain`). Janela suficiente pra capturar trabalho de uma sessão típica sem ser ruidosa.

## Implementação — Slash Command `/vault`

**Arquivo:** `~/.claude/commands/vault.md`

**Sub-comandos:**

### `/vault bootstrap`

Roda **uma vez** no setup inicial.

1. Cria a pasta `~/Documents/vault/InkFlow — Arquitetura/`
2. Cria `.sync-rules.json` com a tabela de regras
3. Lê o repo (estado atual em `feat/coleta-multi-agent-handoff`)
4. Gera os 11 arquivos a partir de:
   - `package.json` + `wrangler.toml` + `cron-worker/package.json` → `Stack.md`
   - HTMLs da raiz → `Andar 1 Vitrine.md`
   - `functions/api/**` → `Andar 2 Recepção.md`
   - Memory (Supabase schema) + `cron-worker/wrangler.toml` (crons) + integrações externas → `Andar 3 Cérebro.md`
   - Branch atual + commits + memory `project_agente_autonomo` → `Andar 4 Agente.md`
   - Endpoints de webhook + memory `project_inkflow` → `Fluxo WhatsApp.md`
   - Endpoints `mp-ipn`, `create-subscription`, `cleanup-tenants` + memory → `Fluxo Billing.md`
   - Endpoints `public-start`, `create-tenant`, `update-tenant`, `delete-tenant` → `Fluxo Tenant Lifecycle.md`
   - `.claude/agents/` + `~/.claude/commands/` + `~/.claude/skills/` → `Subagentes e Skills.md`
   - Memory + schema → `Glossário.md`
   - Lista de tudo → `README.md` (MOC)
5. Cada arquivo entra com rodapé de rastreabilidade preenchido
6. Mostra resumo final: "11 arquivos criados, X linhas total"

### `/vault sync`

Roda on-demand ou via session-end/daily-end.

1. `git diff --name-only HEAD~5..HEAD` + `git status --porcelain`
2. Filtra arquivos contra a tabela `.sync-rules.json`
3. Se zero match → mensagem "Sem drift arquitetural detectado." e termina
4. Se 1+ match:
   - Mostra lista: `Mudanças arquiteturais detectadas: [arquivos]`
   - Pergunta: `Atualiza vault? [Y / n / preview]`
5. **Resposta `preview`:** mostra diff que seria aplicado nos arquivos do vault, sem salvar
6. **Resposta `Y`:** mostra diff e exige `aplicar?` antes de gravar nos arquivos. (Nota: o vault tem git próprio em `~/Documents/vault/.git` — sync nunca faz `git commit` automático no vault, só edita arquivos. Commit no vault é decisão manual do usuário.)
7. **Resposta `n`:** grava commit hashes do repo InkFlow em `.sync-ignore` (não pergunta de novo até nova mudança no repo)

### `/vault status`

Read-only. Mostra:

- Última sync: data + commit-base
- Drift detectado vs HEAD atual: lista de arquivos rastreados que mudaram
- Edits manuais detectados: arquivos do vault com hash diferente do esperado
- Conflitos pendentes (se houver)

Não modifica nada. Útil antes de fechar sessão.

### Edits em commands existentes

**`~/.claude/commands/session-end.md`** — adicionar bloco final:

```markdown
## Verificação de drift arquitetural
Roda `/vault status`. Se houver drift, sugere ao usuário rodar `/vault sync`.
Se usuário recusar, registra a recusa e segue.
```

**`~/.claude/commands/daily-end.md`** — adicionar mesmo bloco.

## Edge Cases

### Caso 1: Edit manual no Obsidian conflita com sync

Sync detecta hash diferente do esperado. Pergunta:

```
arquivo Stack.md tem edits manuais — preservar (m), sobrescrever (s), merge (M)?
```

- `m` — pula esse arquivo dessa vez
- `s` — sobrescreve perdendo edits (mostra diff antes)
- `M` — merge inteligente preservando seções entre marcadores `<!-- custom:start --> ... <!-- custom:end -->`

### Caso 2: Repo mudou mas usuário não quer atualizar

Resposta `n` no trigger → grava commit hashes em `.sync-ignore`. Próxima sync só pergunta se houver **novas** mudanças além das ignoradas.

### Caso 3: Arquivo do vault deletado de propósito

Sync detecta missing. Pergunta:

```
Stack.md foi deletado do vault — recriar (r) ou marcar como removido permanentemente (p)?
```

- `r` — recria com conteúdo atual
- `p` — adiciona ao `.sync-ignore` permanente, nunca recria

### Caso 4: Conflito entre fontes (memory vs repo)

Regra: **repo sempre vence**. Memory é point-in-time, código é fonte de verdade.

Se memory diz X e código diz Y, sync usa Y e adiciona TODO em `Glossário.md` sugerindo atualização da memory.

### Caso 5: Sync rodado em branch de feature

Se branch atual ≠ `main`, sync mostra alerta:

```
Você está em branch feat/X. Mudanças desta branch ainda podem ser revertidas
antes de virar main. Sync mesmo assim? [Y / n]
```

Default `n` (cauteloso). Usuário responde `Y` quando confiar que a feature vai pra main em breve.

## Bootstrap inicial — sequência operacional

1. Usuário valida design (este doc)
2. Plano detalhado é gerado via `writing-plans`
3. Implementação cria:
   - `~/.claude/commands/vault.md` (com lógica dos 3 sub-comandos)
   - Edits em `~/.claude/commands/session-end.md` e `daily-end.md`
4. Usuário roda `/vault bootstrap` manualmente
5. Pasta `InkFlow — Arquitetura/` é criada e populada
6. Usuário abre no Obsidian e valida conteúdo
7. Daí em diante, sync automático via session-end/daily-end + `/vault sync` on-demand

## Trade-offs e riscos

**Risco 1 — Burocracia.** Pode virar passo chato no fim da sessão.
*Mitigação:* trigger só pergunta se há drift real. Sem drift = silencioso. `/vault status` é read-only e rápido.

**Risco 2 — Drift "fora do radar".** Decisões arquiteturais conversadas mas não commitadas (ex: "vamos sair do n8n" antes de qualquer commit).
*Mitigação:* `/vault sync` é re-invocável on-demand. Tu chama quando lembrar. Zero penalidade por chamar repetido (idempotente).

**Risco 3 — Sub-agentes mexem no repo sem chamar sync.**
*Mitigação:* o trigger captura a janela `HEAD~5..HEAD`, então mudanças de sub-agentes que viraram commits aparecem na próxima session-end.

**Risco 4 — Tabela de regras desatualizada conforme produto evolui.**
*Mitigação:* `.sync-rules.json` é versionado dentro do vault. Editável manualmente. Skill `/vault status` pode sugerir novas regras baseado em mudanças não-classificadas.

## Custo de implementação

- **1 arquivo novo:** `~/.claude/commands/vault.md`
- **2 edits leves:** `session-end.md`, `daily-end.md` (≈3 linhas cada)
- **0 skills novas** — zero inflação de contexto
- **Bootstrap inicial:** 1 invocação, gera 11 arquivos a partir do estado atual do repo + memory

## Métricas de sucesso

- Usuário abre o Obsidian e consegue responder "como funciona X?" sem ler código
- Após 1 mês de uso, `/vault status` reporta drift médio < 3 arquivos por session-end
- Onboarding de qualquer pessoa nova (real ou IA) começa pela pasta, não pela memory

---

**Próximo passo:** após aprovação deste doc, invocar `writing-plans` pra gerar plano de implementação detalhado com tasks ordenadas.
