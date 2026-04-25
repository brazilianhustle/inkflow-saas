# Fábrica InkFlow — Plano-Mestre de Governance

**Data:** 2026-04-25
**Autor:** Leandro Marques (founder) + Claude (assistente)
**Status:** Spec aprovado — aguarda decomposição em sub-specs
**Tipo:** Meta-spec (decompõe em 6 sub-projetos, cada um vira spec próprio)

---

## Sumário executivo

Plano-mestre que estrutura a infraestrutura de governance, automação e captação do InkFlow até o MVP comercial e além. Decompõe o trabalho em **6 sub-projetos sequenciados**, com gates explícitos entre eles. O objetivo final é evitar que o founder (Leandro) vire gargalo do próprio negócio, preservando a regra "qualidade nunca pressa". Cada sub-projeto será brainstormado individualmente em sessão dedicada antes da implementação.

**Definition of Done deste plano-mestre:** todos os 6 sub-projetos com sub-specs aprovados e implementados, com gates da Fase 6.3 cumpridos (tráfego pago rodando com CAC vs LTV monitorado).

---

## §1. Visão e problema

InkFlow está em pre-launch há semanas. A infra técnica está madura (billing v1 shipado, smoke test passou em 25/04, security hardening aplicado, instância Evo recriada). Mas o produto depende de sessões manuais Leandro+Claude pra mover qualquer agulha — descobrir o que fazer, redigir migrations, deployar, monitorar, investigar incidentes.

Pra atingir o DoD-MVP (1 trial real ponta-a-ponta + auditores básicos rodando) **e sustentar produção sem virar dependente disso pelos próximos meses**, precisamos construir uma infraestrutura de governance que:

- **(a)** automatiza descoberta+redação das tarefas técnicas (subagents especializados)
- **(b)** preserva controle humano via aprovações pontuais (autonomia média, gates explícitos)
- **(c)** audita produção continuamente (cron + Routines)
- **(d)** mantém uma fonte-da-verdade compartilhada (Mapa Canônico) que evita alucinação dos agents
- **(e)** prepara captação de cliente de forma faseada (validação manual → instrumentação → otimização orgânica → tráfego pago)
- **(f)** escala junto com o produto sem retrabalho de fundação

**Não é** sobre ir mais rápido — é sobre evitar que o founder solo seja o único nó capaz de mover qualquer parte do sistema.

---

## §2. Decisões transversais validadas

Estas decisões aplicam-se a **todos os 6 sub-projetos** e foram acordadas durante o brainstorm de 2026-04-25:

### 2.1. Modelo de autonomia dos subagents

**Escolha: Autonomia média (b)** — agents propõem, founder aprova, agents executam.

- Subagent faz toda a análise, gera diff/plano de execução, apresenta resumo curto.
- Aprovação humana acontece em **dois canais simultâneos**:
  - **Telegram** — pra decisões rápidas e reversíveis (ex: rotacionar key, applicar fix de 1 linha, deploy de doc).
  - **Claude Code principal** — pra decisões densas (review de migration, refactor, schema change, qualquer coisa irreversível).
- Nada toca produção sem ✅ humano explícito.
- **Promoção de autonomia:** após 30d operando sem incidentes, agent específico (ex: `deploy-engineer`) pode ser promovido a autonomia (a) — execução sem aprovação prévia em ações classificadas como reversíveis e de baixo blast radius. Promoção é ato deliberado, registrado em decisão arquitetural.

### 2.2. Definition of Done — escopo do MVP

**Escolha: (a) MVP-pronto-pra-vender** — escopo enxuto.

Critérios objetivos:
- Bug P0 `startFreeTrial()` corrigido (chamada `/api/create-subscription` em vez de `/api/update-tenant`)
- Smoke test billing v1 passa **sem workaround manual** (ponta-a-ponta automático)
- 1 trial real validado: signup com email fresh → 7d completos → ou virou pago ou status_pagamento=trial_expirado correto
- 4 agents core (Sub-projeto 2 MVP) operando
- 5 auditores básicos (Sub-projeto 3 MVP) rodando em produção com alertas Telegram

**Tempo estimado:** 1-2 semanas de trabalho focado (semanas 1-3 do cronograma agregado).

### 2.3. Marketing e captação

**Escolha: dentro do plano-mestre, faseado, fora do MVP.**

- **Sistêmico** (visão completa, instrumentação, otimização) → dentro, faseado em Sub-projeto 6.
- **Tráfego pago** (Meta Ads, Google Ads, captação remunerada) → explicitamente fora até cumprir gates da Fase 6.3.
- **Founder vende manual primeiro** (Fase 6.0) é princípio cravado — não é cronograma, é contrato.

### 2.4. Onde os subagents vivem tecnicamente

- **Subagents de trabalho on-demand** (deploy-engineer, supabase-dba, vps-ops, prompt-engineer, growth-engineer, etc.) → arquivos `.claude/agents/<nome>.md` no repo `inkflow-saas`. Chamáveis via `Agent` tool em sessões interativas com Claude Code.
- **Auditores periódicos com lógica simples** → `inkflow-cron` Worker (Cloudflare) — extensão do que já existe.
- **Auditores que precisam reasoning Claude** (ex: analisar logs e decidir severity, redigir incident report) → Routines (Anthropic-managed cron, skill `/schedule`).
- **Watchers event-driven** (ex: novo webhook MP, conversa terminou no n8n) → workflows n8n com chamadas Claude API.

Distribuição revisitada por sub-projeto.

---

## §3. Os 6 sub-projetos

### Sub-projeto 1 — Mapa Canônico do SaaS

**Status:** primeiro a ser brainstormado (próxima sessão dedicada)
**Cronograma:** semana 1 (paralelo com Sub-projeto 5)

#### Objetivo
Única fonte-da-verdade do que é o InkFlow. Sem isso, qualquer subagent ou auditor opera cego — vai alucinar referências, errar IDs, propor mudanças baseadas em premissas falsas.

#### Escopo proposto
- **Stack completa** — cada serviço (Cloudflare Pages, Workers, Supabase, Evolution API, Mercado Pago, MailerLite, n8n, Telegram), versão, localização, owner, propósito.
- **Fluxos críticos** — diagramas + texto para: signup→trial, trial→pago, payment recorrente, webhook Evo→n8n, expira-trial cron, cleanup-tenants cron, monitor-wa cron, delete-tenant cascata.
- **IDs e referências** — formatos (tenant_id UUID v4, mp_subscription_id, evo instance ID), tabelas Supabase, group IDs MailerLite, env vars críticas.
- **Mapa de secrets** — onde cada secret mora (Keychain macOS, Bitwarden, Cloudflare Pages env, GitHub Secrets, ~/.zshrc), TTL, owner, procedure de rotação.
- **Limites e quotas** — Vultr (RAM/disk/CPU/network do Evolution + n8n), Cloudflare (Worker CPU time, KV reads, Pages builds), Supabase (rows, storage, egress), Mercado Pago (rate limits, valor mínimo subscription).
- **Runbooks** — incident response (outage WA, MP webhook parado, deploy quebrado, DB indisponível), rollback procedures, restore from backup.

#### Onde mora
- `inkflow-saas/docs/canonical/*.md` — fonte-da-verdade versionada no git, dividida em arquivos temáticos (`stack.md`, `flows.md`, `secrets.md`, `limits.md`, `runbooks/*.md`).
- Sync seletivo pro vault Obsidian (`InkFlow — Mapa geral`, `InkFlow — Arquitetura`, etc.) — visão Leandro com wiki-links.

#### Manutenção
- Subagent `doc-keeper` (pós-MVP) detecta mudanças relevantes (PR mergeado, env nova adicionada via wrangler, migration nova) e propõe update no Mapa Canônico.
- Auditor `doc-freshness` (auditor #7, pós-MVP) valida ≥ semanal que cada doc temático foi revisado nos últimos 30d.

#### DoD próprio
- Todas as 6 áreas de escopo cobertas com conteúdo (não placeholder).
- Pelo menos 3 sessões de Claude diferentes conseguem responder perguntas técnicas sobre o InkFlow consultando **só** o Mapa Canônico.
- Estrutura aprovada pra ser consumida pelos agents do Sub-projeto 2.

---

### Sub-projeto 5 — Metodologia formalizada

**Status:** segundo a ser brainstormado (paralelo com Sub-projeto 1)
**Cronograma:** semana 1

#### Objetivo
Doctrine que define como agents+humano operam. Sem isso, time de subagents fica anárquico — cada um decide quando escalar, quando autonomamente executar, quando pedir aprovação.

#### Base existente
- **5 pilares da Mentalidade** — `Mentalidade — 1. Brainstorm antes de código`, `2. Plano vivo`, `3. Definition of Done`, `4. Deploy controlado`, `5. Rotina diária`.
- **10 slash commands** — `/nova-feature`, `/plan`, `/dod`, `/daily-start`, `/daily-end`, `/fix-rapido`, `/hotfix`, `/backlog-add`, `/deploy-check`, `/mentalidade`.

#### Gaps identificados (visão do assistente)
1. **Matriz "principal vs. subagent"** — falta protocolo claro: quando o trabalho fica na sessão principal com Claude vs. quando vira tarefa pra subagent dedicado. Critérios sugeridos: blast radius, domínio de expertise, tempo estimado, dependências cruzadas.
2. **Runbook de incident response** — alerta crítico chega no Telegram, founder está dormindo / em sessão de tatuagem. Qual o protocolo? Que agent ativa automaticamente, que ações pré-aprovadas tem?
3. **Protocolo de release** — quando criar git tag, gerar changelog, comunicar mudança pra clientes ativos. Hoje commits vão direto pra `main` sem ritual.
4. **Rotina "prompt-iteration day"** — quando ativar Sub-projeto 4 (pipeline prompt), precisa de cadência semanal estruturada: que conversas revisar, como decidir patches, quem aprova.

#### Output
- Expansão dos arquivos `Mentalidade — *.md` no vault Obsidian (cobrir os 4 gaps).
- `inkflow-saas/docs/methodology.md` no repo (resumo executivo + links pros docs canônicos).

#### DoD próprio
- 4 gaps acima preenchidos com texto concreto (não TBD).
- Teste real: simular incidente (ex: "MP webhook parou de chegar") → seguir runbook → tempo até resolução documentado.
- Matriz "principal vs. subagent" referenciada no prompt de cada agent do Sub-projeto 2.

---

### Sub-projeto 2 — Time de Subagents MVP

**Status:** terceiro a ser brainstormado
**Cronograma:** semana 2 (após Mapa Canônico + Metodologia disponíveis)

#### Objetivo
4 agents core com escopo claro, tools whitelist, prompts profissionais, gates de aprovação documentados.

#### MVP — 4 agents core

| Agent | Domínio | Tools whitelist | Modelo |
|---|---|---|---|
| `deploy-engineer` | CF Pages/Worker deploys, GHA CI, rollback procedures, wrangler health | Bash (wrangler, gh, git), Read, Edit, mcp__github__*, mcp__plugin_cloudflare_*. **Sem** Write em prod sem ✅ | Sonnet |
| `supabase-dba` | Migrations, RLS audits, query optimization, advisor follow-ups | Bash (psql, supabase CLI), Read, mcp__plugin_supabase_supabase__*. Migration apply só via Telegram ✅ | Sonnet |
| `vps-ops` | Vultr Evolution + n8n health, recursos (disk/mem/cpu), uptime, restart procedures | Bash (ssh — escopo restrito a 1 host), Read. **Sem** mexer em config sem ✅ | Haiku |
| `prompt-engineer` | Editar prompts do produto (`generate-prompt.js` ou seus 4 sucessores pós-Modo Coleta), validar via golden set, propor patches | Read, Edit, Bash (npm test). PR open via mcp__github só após golden set passar | Sonnet |

#### Pós-MVP — 4 agents adicionais (referência, não escopo)

- `billing-watcher` — monitora MP webhooks, status_pagamento drift, MailerLite sync.
- `mailerlite-curator` — gerencia grupos, automations, segmentação.
- `security-officer` — secret rotation, 2FA audit, exposed credentials scan.
- `doc-keeper` — mantém Mapa Canônico atualizado.

#### Pós Sub-projeto 6 — agents de growth

- `analytics-ops` — instrumentação PostHog/Plausible, eventos de funil (Fase 6.1+).
- `growth-engineer` — A/B testing, copy iterations, otimização orgânica (Fase 6.2+).
- `paid-traffic-watcher` — campanhas Meta/Google, CAC vs LTV monitoring (Fase 6.3+).

#### Onde vivem
- `.claude/agents/<nome>.md` no repo `inkflow-saas` (frontmatter padrão Claude Code subagents).
- Tools whitelist explícita por agent — nada de catch-all `*`.
- Prompt de cada agent referencia obrigatoriamente o Mapa Canônico (Sub-projeto 1) e a Metodologia (Sub-projeto 5).

#### DoD próprio
- 4 agents criados, prompts revisados.
- Cada agent testado em **uma tarefa real** (não synthetic) com aprovação Telegram + Claude Code.
- Matriz de tools/gates documentada em `docs/agents/matrix.md`.
- Pelo menos 1 incidente real resolvido com agent (não direto pelo founder).

---

### Sub-projeto 3 — Auditores em produção MVP

**Status:** quarto a ser brainstormado (paralelo com Sub-projeto 2 quando possível)
**Cronograma:** semana 2

#### Objetivo
5 auditores básicos rodando no DoD-MVP + 1 auditor de funil ativado na Fase 6.1. Total final: 6 auditores contínuos, alertando Telegram com severity (info/warn/critical). Garantem que produção não degrada sem aviso.

#### MVP (5 auditores básicos) + 1 auditor pós-MVP

| # | Auditor | Frequência | Severity rules | Onde roda |
|---|---|---|---|---|
| 1 | **Key expiry watcher** | 24h | warn 14d antes / warn 7d / critical 1d | `inkflow-cron` extensão |
| 2 | **Deploy health** | 6h | warn 1 deploy falhado / critical 2 consecutivos / critical drift de wrangler version | `inkflow-cron` |
| 3 | **VPS limits (Vultr)** | 6h | warn >75% / critical >90% em qualquer recurso | Routine (precisa SSH ou API Vultr) |
| 4 | **RLS + security drift** | 24h | warn nova tabela sem RLS / critical function sem search_path / critical policy `WITH CHECK true` em endpoint anon | Routine (precisa Supabase advisor + reasoning) |
| 5 | **Billing flow health** | 6h | warn webhook MP atrasado / critical webhook ausente >24h / critical MailerLite sync drift | `inkflow-cron` |
| 6 | **Funil health** (ativa Fase 6.1) | 24h | warn drop por etapa >20% week-over-week / critical conversão landing→trial <5% | Routine + analytics API |

#### Output dos alertas
- Telegram com formato: `[SEV] [Auditor] mensagem curta + link pro detalhe`.
- Severity `critical` requer ✅ explícito em <2h ou escala (ex: SMS).
- Severity `warn` é informativo, log no daily note.
- Severity `info` é silencioso, só agrega no relatório semanal.

#### DoD próprio
- 6 auditores rodando em produção real (não staging).
- Alerta `critical` simulado chegou no Telegram, foi reconhecido, runbook foi seguido.
- Relatório semanal automático rodando (resumo da semana, incidentes, tendências).

---

### Sub-projeto 4 — Pipeline de evolução do prompt (FORA do MVP)

**Status:** brainstorm adiado para fase pós-MVP
**Cronograma:** semana +5 do MVP completo (estimativa)

#### Objetivo
Loop contínuo coleta → análise → patch → regression → deploy do prompt do agente do produto.

#### Por que sai do MVP
Sem volume de conversas reais (≥50 conversas-cliente capturadas, ≥5 trials reais), é otimização prematura. Os 10 evals existentes em `evals/convs/` são suficientes pra golden set inicial — vão crescer organicamente conforme produção rodar.

#### Trigger pra ativar (gate)
- ≥5 trials reais ou ≥50 conversas-cliente capturadas no Supabase.
- Sub-projeto 1 (Mapa Canônico) cobre o domínio do prompt (qual generator, qual modo, qual fewshot).

#### Escopo planejado (será detalhado no sub-spec dedicado)
- Coleta automatizada (n8n → Supabase storage ou tabela dedicada).
- `prompt-engineer` agent analisa amostra semanal, identifica padrões de erro.
- Patches propostos rodam contra golden set (regression check obrigatório).
- PR aberto, Leandro aprova, deploy.
- Frequência: ad-hoc quando bug reportado + cadência semanal "prompt-iteration day".

---

### Sub-projeto 6 — Funil de Aquisição (faseado, FORA do MVP)

**Status:** brainstorm adiado para fase pós-MVP
**Cronograma:** Fase 6.0 começa logo após DoD-MVP cumprido (semana 3+)

#### Objetivo
Construir capability de aquisição de cliente com profundidade real, não plano amador. Estrutura faseada com gates explícitos pra evitar gastar dinheiro em tráfego pago sem dados que justifiquem.

#### Princípio cravado
**Founder vende manual primeiro.** Doctrine de growth maduro: founders que automatizam captação antes de validar canal manualmente perdem dinheiro. Sem dados claros do que converte, otimização automatizada amplifica desperdício.

#### Fases sequenciais com gates

##### Fase 6.0 — Validação manual
**Gate de ativação:** DoD-MVP completo (1 trial real validado).
**Trabalho:** Leandro vende manualmente pra 5-10 tatuadores conhecidos pessoalmente. Pitch refinado em sessão Claude+Leandro. Captura estruturada (Notion/Obsidian) de:
- Objeções reais ouvidas
- Tempo até "sim" / razões de "não"
- Willingness-to-pay observada (acima/abaixo dos preços atuais R$ 197/497/997)
- Features pedidas
- Comparação com concorrentes mencionados

**Subagent:** nenhum (trabalho manual humano).
**Output:** documento `docs/growth/6.0-validacao-manual.md` com aprendizados consolidados.
**DoD:** ≥5 vendas fechadas + documento entregue.

##### Fase 6.1 — Instrumentação
**Gate de ativação:** ≥5 vendas manuais fechadas + Fase 6.0 documento entregue.
**Trabalho:** setup analytics, UTM scheme, eventos de funil completo, dashboards.
- PostHog ou Plausible (decisão no sub-spec).
- UTM scheme padronizado (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`).
- Eventos: `landing_view`, `cta_click`, `onboarding_step_X`, `trial_started`, `whatsapp_connected`, `payment_completed`, `subscription_active`.
- Dashboard semanal com funil completo + drop rates.

**Subagent:** `analytics-ops` (criado neste sub-projeto).
**Output:** instrumentação rodando + dashboard acessível.
**DoD:** 14d consecutivos de dados consistentes + 6º auditor (Funil health) ativo.

##### Fase 6.2 — Otimização orgânica
**Gate de ativação:** Fase 6.1 rodando ≥14d com dados consistentes.
**Trabalho:** A/B testing, iterações de copy, melhoria nos drops detectados, SEO básico.
- Variantes de landing (headline, hero, social proof).
- Copy iterations no onboarding.
- Fix nos drops específicos detectados (ex: drop de 60% no step 3 do onboarding).
- SEO básico (meta tags, schema.org, sitemap, robots.txt).
- **Ainda zero ads pagos.**

**Subagent:** `growth-engineer` (criado neste sub-projeto).
**Output:** taxa conversão landing→trial e trial→pago melhoradas vs. baseline da Fase 6.1.
**DoD:** conversão **orgânica** sustentada ≥10% landing→trial e ≥15% trial→pago por 14d.

##### Fase 6.3 — Tráfego pago
**Gate de ativação:** Fase 6.2 com conversão orgânica nos thresholds acima.
**Trabalho:** campanhas Meta/Google com tracking ponta-a-ponta, CAC vs LTV monitorado diariamente.
- Setup contas Meta Ads + Google Ads + Pixel/Conversion API.
- Hipóteses de público validadas na Fase 6.0 (não chute).
- Budget inicial limitado (definição no sub-spec).
- Kill-switch: agent pausa campanha se CAC excede threshold definido.

**Subagent:** `growth-engineer` + `paid-traffic-watcher` (novo, criado nesta fase).
**Output:** captação remunerada com unit economics positivos.
**DoD:** 30d de tráfego pago com CAC < LTV/3 e volume ≥10 trials/semana.

#### Regra cravada
**Cada fase só inicia quando o gate da anterior é cumprido.** Gates são contrato, não sugestão. Skip de fase é explicitamente proibido neste plano-mestre — qualquer skip requer revisão deste documento + aprovação consciente, não atalho.

---

## §4. Cronograma agregado

| Semana | Foco | Output esperado |
|---|---|---|
| **1** | Sub-projetos 1 + 5 (paralelo) | Mapa Canônico v1 com 6 áreas cobertas + Metodologia formalizada com 4 gaps preenchidos |
| **2** | Sub-projetos 2 + 3 | 4 agents core operacionais + 5 auditores rodando em produção |
| **3** | Buffer + DoD-MVP | Bug P0 fixed, smoke test 100% sem workaround, 1 trial real ponta-a-ponta validado |
| **3-5** | Fase 6.0 — venda manual | 5+ vendas fechadas + documento de aprendizados |
| **5-6** | Fase 6.1 — instrumentação | Analytics + UTM + funil + dashboard + 6º auditor (Funil health) |
| **6-9** | Fase 6.2 — otimização orgânica | Conversão orgânica nos thresholds (10% / 15%) |
| **9+** | Fase 6.3 — tráfego pago | Campanhas com CAC < LTV/3 |
| **+30d MVP** | Sub-projeto 4 — pipeline prompt | Quando ≥5 trials ou ≥50 conversas reais |

**Janela total estimada até Fase 6.3 ativa: ~9 semanas** (depende dos gates orgânicos — pode acelerar ou atrasar).

---

## §5. Não-objetivos (escopo NÃO coberto)

- ❌ **Modo Coleta** — feature do produto (3º modo de precificação). Spec existente em `2026-04-22-modo-coleta-design.md`. Implementação volta após DoD-MVP.
- ❌ **Pipeline prompt no MVP** — Sub-projeto 4 explicitamente fora até gate cumprido (≥5 trials ou ≥50 conversas).
- ❌ **Tráfego pago antes da Fase 6.3** — proibido até gate cumprido. Skip de fase é violação de contrato.
- ❌ **Multi-tenant queries em escala** — não é gargalo agora (0 tenants pagantes). Volta quando justificado por dados.
- ❌ **Feature flagging avançado** — `ENABLE_TRIAL_V2` atual é suficiente. Sistema completo de flags é prematuro.
- ❌ **Multi-region / i18n / mobile native** — fora de escopo total deste plano-mestre.
- ❌ **Skip de fases do Sub-projeto 6** — gates são contrato, qualquer skip requer revisão consciente deste spec.
- ❌ **Promoção automática de autonomia (a)** — agents promovidos só por decisão deliberada após 30d sem incidentes.

---

## §6. Próximos passos

1. **✅ Spec-mestre escrito e committed** (este documento).
2. **Self-review do spec** — placeholder scan, internal consistency, scope check, ambiguity check (executado inline pelo assistente).
3. **Founder revisa o arquivo** — Leandro lê, aponta ajustes ou aprova.
4. **Decisão sobre `/plan` no spec-mestre vs. brainstorm direto do Sub-projeto 1:**
   - **Recomendação:** pular `/plan` deste meta-spec (seria literalmente "decompor em sub-specs" — informação que já está aqui no §3) e ir direto pra **brainstorm dedicado do Sub-projeto 1** em sessão nova.
   - Nova sessão: `/nova-feature mapa-canonico` no repo `inkflow-saas`.
5. **Sequência de sessões esperadas:**
   - Sessão 2 (próxima): brainstorm Sub-projeto 1 → sub-spec `2026-04-26-mapa-canonico-design.md`.
   - Sessão 3: `/plan` no sub-spec do Sub-projeto 1 → executar.
   - Sessão 4: brainstorm Sub-projeto 5 → sub-spec.
   - Sessão 5: `/plan` no Sub-projeto 5 → executar.
   - ... e assim por diante até Sub-projeto 4.

---

## §7. Glossário

- **DoD-MVP** — Definition of Done do MVP (escolha 2.2 acima).
- **Subagent** — agent Claude Code com escopo, tools, prompt e modelo definidos em `.claude/agents/<nome>.md`. Chamado via `Agent` tool.
- **Auditor** — processo periódico (cron Worker ou Routine) que verifica saúde de uma área e alerta Telegram.
- **Routine** — scheduled agent Anthropic-managed (skill `/schedule`). Roda em cron na cloud, sem sessão local.
- **Sub-projeto** — uma das 6 áreas de trabalho deste plano-mestre. Cada um vira spec próprio antes de implementar.
- **Sub-spec** — spec detalhado de um sub-projeto, escrito em sessão dedicada antes da implementação.
- **Gate** — condição obrigatória pra iniciar próxima fase ou sub-projeto. Não é sugestão.

---

## §8. Referências cruzadas

### Documentos existentes no repo
- `docs/superpowers/specs/2026-04-21-billing-lifecycle-v1-design.md` — billing v1 (já implementado).
- `docs/superpowers/specs/2026-04-22-modo-coleta-design.md` — Modo Coleta (próximo grande, fora deste plano).
- `docs/superpowers/plans/2026-04-23-modo-coleta-pr2-*.md` — planos do Modo Coleta PR2 (untracked, aguardam commit).

### Notas vault Obsidian (memory)
- `InkFlow — Painel` — dashboard estado atual.
- `InkFlow — Mapa geral` — hub visual.
- `InkFlow — Arquitetura` — stack atual (será absorvida pelo Mapa Canônico do Sub-projeto 1).
- `InkFlow — Decisões arquiteturais` — histórico.
- `InkFlow — Pendências (backlog)` — backlog priorizado.
- `Mentalidade — Visão geral` — 5 pilares (será expandida pelo Sub-projeto 5).
- `Modo de execução autônoma` — preferência founder.
- `Padrão de anotações` — wiki-links + tags YAML.

### Comandos slash relacionados
- `/nova-feature` — fluxo de Pilar 1 (usado pra abrir este brainstorm).
- `/plan` — geração de plano de implementação a partir de spec.
- `/dod` — checklist de Definition of Done.
- `/daily-start`, `/daily-end` — rotinas diárias (Pilar 5).

---

## §9. Histórico de revisões

| Data | Versão | Mudança |
|---|---|---|
| 2026-04-25 | v1.0 | Spec inicial criado em sessão de brainstorm com Leandro. Decomposição em 6 sub-projetos validada. Decisões transversais (autonomia, DoD, marketing, onde agents vivem) acordadas. |
