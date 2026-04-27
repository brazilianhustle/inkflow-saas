# Sub-projeto 2 — Time de Subagents MVP

**Data:** 2026-04-26
**Autor:** Leandro Marques (founder) + Claude (assistente)
**Status:** Spec aprovado — aguarda `/plan`
**Tipo:** Sub-spec do plano-mestre Fábrica InkFlow (`docs/superpowers/specs/2026-04-25-fabrica-inkflow-design.md` §3 — Sub-projeto 2)
**Gate de ativação:** Sub-projeto 1 (Mapa Canônico v1) ✅ + Sub-projeto 5 (Metodologia formalizada) ✅ — ambos cumpridos em 26/04.
**Branch:** `feat/subagentes-mvp`

---

## Sumário executivo

Implementa o MVP do **Time de Subagents** — 3 agents Claude Code especializados em domínios críticos do InkFlow (`deploy-engineer`, `supabase-dba`, `vps-ops`) que aceleram trabalho repetitivo e isolam contexto técnico do principal sem virar gargalo decisório. Os agents propõem com diff/plano e param na fronteira de write-em-prod — Claude principal continua sendo o orquestrador no MVP, alinhado com "autonomia média (b)" do plano-mestre §2.1.

**Decisão estrutural:** greenfield com fase prévia de extração. Os 6 agents legacy em `.claude/agents/` (não-versionados) são triados — conhecimento operacional útil migra pro Mapa Canônico (`docs/canonical/runbooks/`), originais arquivados em `.claude/agents/_legacy/` com README explicativo.

**Definition of Done:** 3 agents criados e versionados + 6 legacy arquivados + matriz operacional em `.claude/agents/README.md` + cross-links bidirecionais com `matrix.md` e runbooks + 1 tarefa real do backlog resolvida por cada agent.

---

## §1. Escopo e não-objetivos

### Em escopo (MVP)

- **3 agents core** em `.claude/agents/<nome>.md` (versionados no git):
  - `deploy-engineer` (Sonnet) — CF Pages/Workers, GHA, rollback, secret rotation
  - `supabase-dba` (Sonnet) — migrations, RLS, advisor follow-ups, query optimization
  - `vps-ops` (Haiku) — Vultr resources, uptime, restart de containers (pure infra)
- **Fase de extração** dos 6 legacy: triagem, conhecimento útil migrado pro Mapa Canônico, originais movidos pra `.claude/agents/_legacy/`.
- **`.claude/agents/README.md`** — matriz operacional dos agents ativos (tools, gates, modelo, runbooks referenciados, DoD test, status).
- **Cross-link** entre `docs/canonical/methodology/matrix.md` §5.2 e o README — doctrine aponta pra instâncias.
- **Cross-link** entre cada agent e seus runbooks específicos (`outage-wa.md`, `deploy.md`, `rollback.md`, `secrets-expired.md`, `db-indisponivel.md`, `restore-backup.md`).
- **DoD por agent**: cada um testado em 1 tarefa real do backlog (não synthetic) com aprovação Telegram + Claude Code.
- **PR único** englobando extração + arquivamento legacy + criação dos 3 agents + matriz + cross-links + DoD tests.

### Fora de escopo (registrado, postponed)

- **`prompt-engineer`** — entra com Sub-projeto 4 (gate ≥5 trials reais ou ≥50 conversas-cliente capturadas). Sem demanda real no MVP (MRR R$ 0).
- **`marcelo-pago` / `billing-watcher`** — entra como Sub-projeto 2 v2 quando MRR > 0. Prompt legacy preservado em `_legacy/`.
- **`hunter`, `o-confere`, `estagiario`** — sobrepõem built-ins (`pr-review-toolkit:silent-failure-hunter`, `pr-review-toolkit:code-reviewer`, `superpowers:writing-plans`). Aposentados sem substituição.
- **`doutor-evo` (agent dedicado)** — conhecimento absorvido por `runbooks/outage-wa.md`. Doctrine matrix.md heurística #6: trabalho raro + profundo + isolado é melhor servido por runbook que por agent.
- **Mecanismo automatizado de approval via tabela `approvals` em fluxo cotidiano.** Tabela permanece reservada pro cenário `runbooks/telegram-bot-down.md` (canal alt quando Telegram cai).
- **Promoção pra autonomia (a)** — evento futuro consciente após >30d sem incidentes operando agent específico.
- **Auditores periódicos (Sub-projeto 3)** — escopo separado, mesmo cronograma (semana 2) mas spec dedicado.

---

## §2. Arquitetura

### Layout no repo

```
inkflow-saas/
├── .claude/
│   └── agents/
│       ├── README.md                    [novo] matriz operacional
│       ├── deploy-engineer.md           [novo] agent core
│       ├── supabase-dba.md              [novo] agent core
│       ├── vps-ops.md                   [novo] agent core
│       └── _legacy/
│           ├── README.md                [novo] explica deprecation
│           ├── doutor-evo.md            [movido] conhecimento → runbooks/outage-wa.md
│           ├── estagiario.md            [movido] superseded by writing-plans skill
│           ├── hunter.md                [movido] superseded by pr-review-toolkit
│           ├── marcelo-pago.md          [movido] retorna pós-MVP como billing-watcher
│           ├── o-confere.md             [movido] checks úteis → runbooks/deploy.md
│           └── supa.md                  [movido] superseded por supabase-dba
└── docs/
    └── canonical/
        ├── methodology/
        │   └── matrix.md                [edit] cross-link §5.2 → .claude/agents/README.md
        └── runbooks/
            ├── outage-wa.md             [edit] absorve comandos curl Evolution de doutor-evo
            └── deploy.md                [edit] absorve checks pré-deploy de o-confere
```

### Fluxo de invocação (autonomia média (b) do plano-mestre §2.1)

```
[Leandro pergunta ou alerta chega]
                ↓
[Claude principal — sessão Claude Code interativa]
                ↓
[Lê matrix.md §5 — decide: principal ou subagent?]
        ↓                                ↓
   se principal                     se subagent
        ↓                                ↓
[Executa direto                  [Agent tool invoca subagent
 read-only ou                     específico (ex: supabase-dba)]
 write-dev]                              ↓
                                  [Subagent:
                                   1. Lê Mapa Canônico + matrix.md
                                   2. Analisa contexto
                                   3. Gera diff/plano
                                   4. PARA na fronteira write-em-prod
                                   5. Retorna resumo + diff + plano de exec]
                                         ↓
                                  [Principal mostra pro Leandro:
                                   "Subagent X propõe: <diff>. Aprovo?"]
                                         ↓
                                ┌────────┴────────┐
                                ↓                 ↓
                         Leandro ✅         Leandro ❌
                                ↓                 ↓
                         [Principal           [Aborta, registra
                          re-invoca agent      no log, fim]
                          com approved=true]
                                ↓
                         [Agent executa via Bash/MCP
                          com whitelist específica]
                                ↓
                         [Retorna resultado + logs]
```

### Doctrine references (heurísticas que cada agent valida no pre-flight)

Cada agent começa com **pre-flight checklist** de 6-12 linhas que cita:
- `docs/canonical/methodology/matrix.md` §5.1 — heurísticas globais (Safety > Scope > Domain)
- `docs/canonical/methodology/incident-response.md` — se severity classification aplica
- `docs/canonical/runbooks/<runbook>.md` específico do domínio

Pre-flight não é leitura inteira da matrix — é checklist enxuto enumerando as heurísticas específicas pro domínio do agent + ponteiro pra fonte completa.

### Edge case — agent em dúvida sobre classificação da ação

Quando o agent não tem certeza se uma ação é "destrutiva" / "write-em-prod" / "reversível":

1. **Default = tratar como destrutiva.** Para na fronteira, pede ✅ explícito. Falso-positivo (pedir aprovação à toa) custa 1 ping; falso-negativo (executar destrutivo sem ✅) custa incidente.
2. **Documenta no resumo de retorno** o motivo da dúvida (ex: "comando `wrangler kv:key delete` é destrutivo mas só afeta cache regenerável — pedi ✅ por precaução").
3. **Se o caso virar repetição** (3+ vezes na mesma classificação ambígua), Claude principal abre PR pequeno expandindo §5.3 da matrix.md com novo exemplo canônico — alimenta a doctrine.

Esta regra é cravada no prompt de **todos os 3 agents** como parte do pre-flight checklist.

---

## §3. Especificação dos 3 agents core

### `deploy-engineer` (Sonnet)

**Description (frontmatter):**
> Engenheiro de deploy do InkFlow. Cuida de Cloudflare Pages/Workers deploys, GitHub Actions CI, rollback procedures, wrangler health, env vars (sem ler valores brutos). Use quando há deploy quebrado, mudança em wrangler.jsonc, secrets pra rotacionar, ou GHA workflow pra debugar.

**Tools whitelist:** `Read, Edit, Bash, mcp__github__*, mcp__plugin_cloudflare_*`

**Comandos típicos no prompt:**
- `wrangler tail`, `wrangler deploy`, `wrangler secret list/put` (sem `--text` em get)
- `gh run view`, `gh pr create`, `gh workflow run`
- `git log/diff/status` (read-only)
- MCP Cloudflare: `workers_get_worker`, `query_worker_observability`, `set_active_account`

**Gates ✅ Telegram (matrix.md §5.2):**
- `wrangler deploy` em prod
- `wrangler secret put` (rotação real de secret)
- `git push origin main` direto (raro — normalmente via PR)
- Edit em `.github/workflows/deploy.yml`

**Sem permissão (Safety #4 e #5):**
- `git push --force` em qualquer ref
- Read em `.env`, `~/.zshrc`, arquivos com `secret`/`token`/`key`/`password` no nome (valores via Bitwarden, MCP autenticado preferido)
- Operações destrutivas em GitHub (branch delete remota, repo delete) — sempre ✅ Telegram

**Runbooks referenciados:** `deploy.md`, `rollback.md`, `secrets-expired.md`

**DoD candidato (tarefa real):** rotacionar `OPENAI_API_KEY` (P1 backlog) — propõe plano (gerar key nova no dashboard OpenAI, atualizar via `wrangler secret put`, validar via test endpoint, salvar Bitwarden, atualizar `secrets.md` Histórico de rotação). Principal aprova. Agent executa.

---

### `supabase-dba` (Sonnet)

**Description (frontmatter):**
> DBA do Supabase do InkFlow. Cuida de migrations, RLS audits, query optimization, advisor follow-ups, schema evolution. Use quando tem advisor warning, migration nova, RLS suspeito, query lenta, ou drift de schema. Migration apply só com aprovação explícita.

**Tools whitelist:** `Read, Edit, Bash, mcp__plugin_supabase_supabase__*`

**Comandos típicos no prompt:**
- `mcp__plugin_supabase_supabase__list_migrations` — verificar estado em prod
- `mcp__plugin_supabase_supabase__get_advisors` — security + performance audit
- `mcp__plugin_supabase_supabase__execute_sql` — queries de diagnóstico (read-only)
- `mcp__plugin_supabase_supabase__apply_migration` — somente após ✅
- Bash `supabase` CLI só pra ops locais (lint, format)

**Gates ✅ Telegram (matrix.md §5.2):**
- `apply_migration` em prod
- Operações destrutivas (DROP, TRUNCATE, DELETE sem WHERE específico — Safety #4)
- ALTER TABLE em produção
- Mudanças em RLS policies

**Sem permissão (Safety #5):**
- Conexão psql direta com `SB_PAT` em plaintext (usa MCP em vez — heurística #5 + exceção de §5.1)
- Read em arquivos de credenciais Supabase (.supabase/config.toml com secrets)

**Runbooks referenciados:** `db-indisponivel.md`, `restore-backup.md`

**DoD candidato (tarefa real):** rodar advisor + propor fix dos WARNs restantes (incluindo P2 backlog "Investigar uso do `tattoo_bucket` no n8n"). Read-only diagnóstico, propõe plano de remediation, principal aprova caso a caso.

---

### `vps-ops` (Haiku)

**Description (frontmatter):**
> Operador da VPS Vultr (104.207.145.47) do InkFlow. Cuida de health-check de recursos (disk/mem/cpu), uptime, restart de containers Docker (Evolution + n8n), monitoring básico. NÃO debuga Evolution API quebrada — isso é runbook outage-wa.md + humano. NÃO mexe em config de servidor sem aprovação.

**Tools whitelist:** `Read, Bash`

**Comandos típicos no prompt:**
- `ssh root@104.207.145.47 "df -h && free -h && uptime"` — health snapshot
- `ssh root@104.207.145.47 "docker ps && docker stats --no-stream"` — container status
- `ssh root@104.207.145.47 "tail -n 100 /var/log/syslog"` — log tailing read-only
- `ssh root@104.207.145.47 "docker restart <container>"` — somente após ✅

**Gates ✅ Telegram (matrix.md §5.2):**
- Qualquer comando de restart/stop/start de container Docker
- Edição de `/opt/inkflow/.env`, `docker-compose.yml`, ou config de nginx/systemd
- Reboot do servidor
- `docker system prune` ou similar

**Sem permissão (Safety #4 e #5):**
- SSH em qualquer host que não seja `root@104.207.145.47` (whitelist hard de host)
- Read em `/opt/inkflow/.env` ou arquivos com `key`/`token`/`secret`/`password` no nome (valores via Bitwarden)
- `rm -rf` em qualquer path (Safety #4 destrutivo)
- Modificações em config sem ✅

**Runbooks referenciados:** `outage-wa.md` (cita pro humano seguir, agent não executa diagnóstico Evolution profundo)

**DoD candidato (tarefa real):** rodar health-check completo do VPS + reportar drift (CPU/disk/mem/uptime/containers). Idempotente, read-only.

**Por que Haiku:** comandos determinísticos, output estruturado, decisão simples (acima/abaixo do threshold). Reasoning Sonnet não agrega valor — agrega custo desnecessário. Haiku 4.5 é capaz pra esse domínio.

---

## §4. Fase de extração — triagem dos 6 legacy

### `doutor-evo` → arquivar + extrair

**Conhecimento útil:**
- Comandos curl Evolution API: listar instâncias, validar webhook config, force reconnect, fix de `webhookBase64`/`MESSAGES_UPSERT`
- Detecção de instância órfã (DB ≠ Evolution)
- Endpoints internos: container `inkflow-evolution-1`, IP `172.18.0.4:8080`, central instance `inkflow_central`

**Destino da extração:** `docs/canonical/runbooks/outage-wa.md` ganha 3 seções novas:
- "Diagnóstico de instância órfã" — query SQL + curl Evolution lado a lado
- "Reparação de webhook config" — comandos curl + payload exemplo
- "Force reconnect de instância" — sequência passo a passo

**Descarta:** persona "Você é o Doutor Evo" e instruções de operação como agent — vira referência humana de runbook.

---

### `estagiario` → arquivar sem extração

**Análise:** Sobrepõe **100%** com `superpowers:writing-plans` skill (built-in mantido, atualizado, melhor estruturado).

**Destino da extração:** nenhum. Agent é redundante.

---

### `hunter` → arquivar sem extração

**Análise:** Sobrepõe com `pr-review-toolkit:silent-failure-hunter` (built-in pelo plugin oficial, mantido).

**Destino da extração:** nenhum. Lista de cenários que ele caça (catches silenciosos, race conditions, queries sem error handling) já está coberta pelo prompt do silent-failure-hunter built-in.

---

### `marcelo-pago` → arquivar sem extração agora

**Análise:** Cobre auditoria de billing (drift entre `tenants.status_pagamento` e estado real no Mercado Pago). É exatamente o `billing-watcher` planejado **pós-MVP** no plano-mestre §3 ("Pós-MVP — 4 agents adicionais").

**Destino da extração:** nenhum **agora**. Prompt fica em `_legacy/marcelo-pago.md` como referência. Quando MRR > 0 e Sub-projeto 2 v2 ativar, esse prompt vira ponto de partida (refatorado pra alinhar com matrix.md).

---

### `o-confere` → arquivar + extrair check de migrations

**Conhecimento útil:**
- Validações pré-deploy: sintaxe JS de `functions/api/*.js`, env vars críticas em CF Pages, links quebrados entre páginas, estado das migrations Supabase

**Conhecimento descartado:**
- Check de ASCII encoding — **obsoleto** desde Decisão #7 do Modo Coleta (UTF-8 real cravado)

**Destino da extração:** `docs/canonical/runbooks/deploy.md` ganha seção "Pré-flight checks (manuais)":
- Syntax check via lint ou `node -c functions/**/*.js`
- Diff de `wrangler.jsonc` env vars vs CF Pages dashboard
- `mcp__plugin_supabase_supabase__list_migrations` para confirmar estado em prod
- (Sem ASCII check)

---

### `supa` → arquivar sem extração

**Análise:** Mesmo escopo do `supabase-dba` novo, mas viola Safety #5 (exige `SB_PAT` plaintext no shell). Conhecimento de tabelas listado no prompt já está em `docs/canonical/ids.md`.

**Destino da extração:** nenhum. Substituído integralmente pelo `supabase-dba` novo.

---

### Estrutura do `.claude/agents/_legacy/README.md`

```markdown
# Legacy agents (deprecated)

These prompts predate the Sub-projeto 2 doctrine (cementada via matrix.md em 2026-04-25). Kept here as historical reference. **Não invocar.**

| Agent | Status | Conhecimento extraído pra |
|---|---|---|
| doutor-evo | deprecated | docs/canonical/runbooks/outage-wa.md |
| estagiario | deprecated | superseded by superpowers:writing-plans skill |
| hunter | deprecated | superseded by pr-review-toolkit:silent-failure-hunter |
| marcelo-pago | postponed | retornará como `billing-watcher` em Sub-projeto 2 v2 (gate: MRR > 0) |
| o-confere | deprecated | docs/canonical/runbooks/deploy.md (parcial — ASCII check descartado) |
| supa | deprecated | superseded por supabase-dba (matrix.md-aligned) |

Aposentado em: 2026-04-26 (PR Sub-projeto 2 MVP).
```

---

## §5. Matriz operacional — `.claude/agents/README.md`

Ponto de entrada operacional do diretório `.claude/agents/`. Lista todos os agents ativos, suas tools, gates, modelos e runbooks referenciados. Cross-linkado com `matrix.md` §5.2 (doctrine).

### Estrutura proposta

```markdown
# Time de Subagents — InkFlow

Subagents Claude Code do InkFlow. Cada um é especializado num domínio crítico, com tools whitelist explícita e gates de aprovação humana documentados. Doctrine de delegação está em `docs/canonical/methodology/matrix.md` §5.

## Agents ativos (MVP)

| Agent | Domínio | Modelo | Gate ✅ |
|---|---|---|---|
| `deploy-engineer` | CF Pages/Workers, GHA, secret rotation | Sonnet | Telegram pra write-em-prod |
| `supabase-dba` | Migrations, RLS, advisor, queries | Sonnet | Telegram pra apply_migration / DDL |
| `vps-ops` | Vultr resources, uptime, restart Docker | Haiku | Telegram pra restart / config |

Detalhe completo de tools/gates por agent: ver frontmatter de cada arquivo `.md` e seção "Pre-flight" do prompt.

## Como invocar

Via Agent tool no Claude Code principal:

\`\`\`
Agent({
  description: "<descrição curta da tarefa>",
  subagent_type: "deploy-engineer",  // ou supabase-dba, vps-ops
  prompt: "<task self-contained com contexto>"
})
\`\`\`

**Quando usar (heurísticas):**
- Read-only / write-dev simples → principal direto (não invoca agent)
- Write-em-prod / domínio específico / >15min isolado → subagent (per matrix.md §5.1)
- Decisão de produto / brainstorm → principal com Leandro (não delegar)

## Doctrine

Cada agent valida no pre-flight:
- `docs/canonical/methodology/matrix.md` §5.1 — heurísticas Safety > Scope > Domain
- `docs/canonical/methodology/incident-response.md` — severity classification
- Runbooks específicos do domínio do agent

Agents **propõem com diff/plano** e **param na fronteira de write-em-prod**. Claude principal aprova explicitamente antes de re-invocar pra execução.

## Histórico de promoções de autonomia

(vazio — todos os agents operam em autonomia média (b) per plano-mestre §2.1. Promoção pra autonomia (a) requer >30d sem incidentes do agent específico + decisão consciente registrada em `docs/canonical/decisions/`.)

## Agents postponed / deprecated

Ver `.claude/agents/_legacy/README.md`.
```

---

## §6. Definition of Done

### DoD do PR (merge gate)

- [ ] 3 agents criados em `.claude/agents/<nome>.md` com frontmatter padrão Claude Code (name, description, tools, model)
- [ ] Cada agent tem pre-flight checklist citando matrix.md + runbooks específicos do domínio
- [ ] 6 legacy movidos pra `.claude/agents/_legacy/` com README explicativo
- [ ] Conhecimento extraído committed: `outage-wa.md` (3 seções de Evolution) + `deploy.md` (seção Pré-flight checks)
- [ ] `.claude/agents/README.md` criado com matriz operacional
- [ ] `matrix.md` §5.2 ganha cross-link `→ .claude/agents/README.md`
- [ ] Cada agent passa em **1 tarefa real do backlog** (não synthetic):
  - `deploy-engineer` — rotaciona OPENAI_API_KEY (P1 backlog) com gate ✅ Telegram
  - `supabase-dba` — roda advisor + propõe fix dos WARNs restantes (P2 `tattoo_bucket` + outros)
  - `vps-ops` — roda health-check completo do VPS, reporta drift
- [ ] Cada DoD test documentado em `evals/sub-projeto-2/2026-04-XX-<agent>-dod.md`
- [ ] PR review automatizado via `/code-review` antes do merge

### DoD pós-merge (validação operacional, ≤7 dias)

- [ ] Cada agent invocado em ≥1 tarefa real **em sessão fresca** (não a sessão da implementação)
- [ ] Zero incidentes de agent executando ação destrutiva sem ✅
- [ ] Zero incidentes de agent operando fora do escopo definido
- [ ] Painel atualizado com novo "Como invocar agents" + status do MVP Sub-projeto 2

### Critério de "ready to merge"

- Todas as DoD do PR ✅
- `node --test tests/*.mjs` continua 15/15 passing (sem regressão)
- Deploy em prod funcional (no-op visual — só docs e config, mas valida que GHA + wrangler continuam OK)
- Cross-references bidirecionais íntegros (matrix.md ↔ README, README ↔ runbooks)

---

## §7. Não-objetivos cravados

Reforço explícito do que **não** entra neste sub-spec, mesmo que adjacente:

- ❌ `prompt-engineer` agent — gate de Sub-projeto 4 (≥5 trials reais ou ≥50 conversas).
- ❌ `billing-watcher` / `marcelo-pago` reativado — gate MRR > 0 (Sub-projeto 2 v2).
- ❌ Auditores periódicos do Sub-projeto 3 — escopo separado, mesmo cronograma mas spec dedicado.
- ❌ Mecanismo de approval automatizado em fluxo cotidiano — tabela `approvals` reservada pro cenário `telegram-bot-down`.
- ❌ Agents 24/7 sem supervisão — autonomia (a) requer >30d sem incidentes + decisão consciente.
- ❌ Refactor dos prompts legacy pra adoption — descartado em favor de greenfield + extração seletiva.
- ❌ Tools whitelist granular via `settings.local.json` regex — frontmatter top-level (Read/Bash/Edit) + prompt enumerando comandos típicos é suficiente pro MVP. Granularidade extra entra se houver incidente de scope creep.
- ❌ Multi-agent orquestração entre os 3 (ex: deploy-engineer chama supabase-dba) — agents são independentes no MVP, principal orquestra cross-domain.

---

## §8. Glossário

- **Agent core** — um dos 3 agents do MVP versionados em `.claude/agents/`.
- **Agent legacy** — um dos 6 prompts pré-existentes em `.claude/agents/` (não-versionados antes deste sub-projeto), aposentados em `_legacy/`.
- **Pre-flight checklist** — bloco curto no início do prompt do agent que enumera heurísticas relevantes da matrix.md + runbooks aplicáveis. Não é leitura inteira da matrix.
- **Tools whitelist** — campo `tools:` no frontmatter do agent. Define top-level tools permitidas (Read, Bash, Edit, MCPs específicas).
- **Gate ✅ Telegram** — ação que requer aprovação humana explícita via Telegram antes da execução. Definida em matrix.md §5.2 + reforçada no prompt do agent.
- **Autonomia média (b)** — modo de operação default no MVP: agent propõe, principal aprova, agent executa. Plano-mestre §2.1.
- **Autonomia (a)** — modo aspiracional pós-MVP: agent executa direto em ações reversíveis e baixo blast radius. Requer >30d sem incidentes do agent específico.

---

## §9. Referências cruzadas

### Spec ancestrais
- `docs/superpowers/specs/2026-04-25-fabrica-inkflow-design.md` — plano-mestre Fábrica InkFlow §3 (Sub-projeto 2)
- `docs/superpowers/specs/2026-04-25-metodologia-fabrica-design.md` — Sub-projeto 5 (matrix.md doctrine)
- `docs/superpowers/specs/2026-04-26-mapa-canonico-design.md` — Sub-projeto 1 (Mapa Canônico)
- `docs/superpowers/specs/2026-04-26-telegram-bot-down-design.md` — fallback de approval pra cenário Telegram-down

### Docs canonical referenciados
- `docs/canonical/methodology/matrix.md` — heurísticas globais Safety > Scope > Domain
- `docs/canonical/methodology/incident-response.md` — severity classification
- `docs/canonical/methodology/release-protocol.md` — protocolo de release (linkado pelo deploy-engineer)
- `docs/canonical/runbooks/outage-wa.md` — Evolution / WhatsApp recovery
- `docs/canonical/runbooks/deploy.md` — procedure de deploy
- `docs/canonical/runbooks/rollback.md` — procedure de rollback
- `docs/canonical/runbooks/secrets-expired.md` — rotação e cenários de secrets
- `docs/canonical/runbooks/db-indisponivel.md` — Supabase indisponível
- `docs/canonical/runbooks/restore-backup.md` — restore de backup
- `docs/canonical/runbooks/telegram-bot-down.md` — canal alt de approval (Pushover)
- `docs/canonical/ids.md` — IDs, endpoints, tabelas (referenciado pelos agents em vez de duplicar conhecimento)
- `docs/canonical/secrets.md` — mapa de secrets (referenciado pelo deploy-engineer pra rotação)

### Notas vault Obsidian (memory)
- `[[InkFlow — Painel]]` — dashboard estado atual
- `[[InkFlow — Plano-mestre Fábrica (2026-04-25)]]` — roadmap dos 6 sub-projetos
- `[[Mentalidade — Matriz principal-subagent]]` — TL;DR + ponteiro pra matrix.md
- `[[Mentalidade — Runbook incidentes]]` — TL;DR + ponteiro pros runbooks

### Comandos slash relacionados
- `/nova-feature` — Pilar 1 brainstorm (usado pra abrir este sub-spec)
- `/plan` — geração do plano de implementação a partir deste spec
- `/dod` — checklist de Definition of Done antes do PR

---

## §10. Histórico de revisões

| Data | Versão | Mudança |
|---|---|---|
| 2026-04-26 | v1.0 | Sub-spec inicial criado em sessão de brainstorm com Leandro. 5 perguntas clarificadoras resolvidas (legacy strategy, vps-ops scope, prompt-engineer cut, PR structure, approval orchestration). Decisões cravadas em §1-§7. |
