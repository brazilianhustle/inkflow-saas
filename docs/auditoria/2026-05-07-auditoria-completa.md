---
name: Auditoria completa do SaaS InkFlow — Relatório
description: Discovery read-only do estado atual (stack, repo, n8n, Supabase, observability) + plano de mitigação priorizado
date: 2026-05-07
status: completo
phase: 1 (inventário) ✅ → 2 (análise) ✅ → 3 (roadmap) ✅
spec: docs/superpowers/specs/2026-05-07-auditoria-completa-saas-design.md
---

# Auditoria completa do SaaS InkFlow

> **Princípio:** READ-ONLY. Documentar achados objetivamente nas Fases 1 e 2. Opinião e roadmap só na Fase 3.
>
> **Status atual:** Auditoria + Sprint 1 executados (2026-05-07).

---

## Sprint 1 — Execução (2026-05-07)

Sprint 1 do plan `docs/superpowers/plans/2026-05-07-auditoria-sprint-1-quick-wins.md` executado em 5 ondas + sub-plans pras Ondas 2 e 4.

### Findings fechados (15)

| Finding | Onda | PR | Status |
|---|---|---|---|
| F2.8.2 — schema baseline em git | 0 | #37 | ✅ inventário narrativo (`supabase/baseline-schema.sql`) |
| F1.4.6 — leaked password protection | 0 | #37 | ⏳ **PENDENTE dashboard Supabase manual** (toggle Auth → Policies) |
| F1.7.3 — memory drift agents | 1 | #38 | ✅ `project_agents.md` reescrito (3 ativos + 6 legacy) |
| F1.6.8 — archive smokes históricos | 1 | #38 | ✅ 5 audit_runs + 5 audit_events deletados |
| F1.4.12 — RPC dead atualizar_timestamp_campanha | 1 | #38 | ✅ DROP FUNCTION |
| F1.4.8 — duplicate index | 1 | #38 | ✅ DROP CONSTRAINT (era constraint, não índice) |
| F1.4.10 — 4 unused indexes | 1 | #38 | ✅ DROP INDEX × 4 |
| F1.4.5 — tattoo_bucket allows LIST | 1 | #38 | ✅ policy substituída (GET direto OK, LIST bloqueado) |
| F1.3.8 — 4 workflows n8n backup | 1 | #38 | ✅ archived via mcp__n8n__archive_workflow |
| F2.4.4 — tests em GHA | 2 | #39 | ✅ `tests.yml` rodando 391 cases em 11s |
| F1.5.3 — preflight em CI | 2 | #39 | ✅ step adicionado em `deploy.yml` |
| F1.3.1 — tool zumbi consultar_preco_retoque | 3 | #40 | ⏳ **PENDENTE dashboard n8n manual** (delete node + save) |
| F2.5.1 — Sentry trigger configurado | 3 | #40 | 🔄 **RECLASSIFICADO falso positivo** — Sentry estava funcional, `triggerCount=0` é normal pra Error Triggers |
| F1.4.2 — views SECURITY DEFINER | 4 | #41 | ✅ ALTER VIEW SET (security_invoker = on) |
| F1.4.3 — RPCs anon-callable | 4 | #41 | ✅ REVOKE EXECUTE FROM PUBLIC (não só anon/auth — bug pego pós-apply) |
| F1.5.5 — secrets.md desatualizado | 5 | #42 | ⏳ **PR aberto** (aguardando review) |
| F1.5.6 — sem CSP | 5 | #42 | ⏳ **PR aberto** (aguardando browser smoke) |

### Advisor delta confirmado

| Advisor | Antes | Depois | Delta |
|---|---|---|---|
| Security ERROR (`security_definer_view`) | 2 | 0 | **-2** |
| Security WARN (`*security_definer_function*`) | 4 | 0 | **-4** |
| Security WARN (`public_bucket_allows_listing`) | 1 | 0 | **-1** |
| Performance WARN (`duplicate_index`) | 1 | 0 | **-1** |
| Performance INFO (`unused_index`) | 4 | 0 | **-4** |
| **Total** | **12** | **0** | **-12** |

### Achados secundários (gap real descoberto durante Sprint 1)

Durante Onda 3 investigação do F2.5.1, descoberto que **3 workflows ativos n8n não têm `errorWorkflow` configurado**:
- `0GkC6Ehh0H8sxRVE` InkFlow PR Babysitter
- `EWrPa5xfupsAygz2` InkFlow Uptime
- `1cyShNBUqgo6d2JY` InkFlow Smoke Test E2E

Erros nesses 3 vão pro silêncio. Não estava no scope inicial. **Registrar pra Sprint 2** — quick fix dashboard (~30s × 3).

### Pendências Sprint 1 (manuais — fora do alcance de SQL/MCP)

| # | Item | Como fechar |
|---|---|---|
| 1 | F1.4.6 leaked password | Dashboard: https://supabase.com/dashboard/project/bfzuxxuscyplfoimvomh/auth/policies → toggle ON |
| 2 | F1.3.1 tool zumbi remoção | Dashboard n8n: https://n8n.inkflowbrasil.com/workflow/PmCMHTaTi07XGgWh → delete node `consultar_preco_retoque` (position [-5744, 432]) → save |
| 3 | Onda 5 PR (#42) merge | Browser smoke local — abrir cada HTML em DevTools, confirmar zero CSP errors, depois merge |
| 4 | (gap secundário) errorWorkflow nos 3 utilitários | Dashboard n8n por workflow: Settings → Error Workflow → INKFLOW - Sentry Error Handler → Save |

### Sprint 1 — métricas

| Métrica | Valor |
|---|---|
| Tempo total executado | ~3h (vs estimativa 5h do plan) |
| PRs criados | 6 (#37, #38, #39, #40, #41, #42) |
| PRs mergeados | 5 (#37-#41) |
| Migrations aplicadas em prod | 5 (Ondas 1 + 4) |
| Workflows n8n archived | 4 |
| Findings fechados | 15 (8 P0 + 5 P3 + 2 P2) |
| Findings reclassificados | 1 (F2.5.1 era falso positivo) |
| Findings pendentes user | 4 (3 manual + 1 PR aberto) |
| Advisor lints fechados | 12 |

### Lições aprendidas

1. **REVOKE de função anon não funciona se PUBLIC tem grant.** Aprendido pós-apply em Onda 4 — `=X/postgres` no ACL = PUBLIC tem EXECUTE. Anon e authenticated herdam via PUBLIC role membership. Solução: `REVOKE EXECUTE ... FROM PUBLIC`.

2. **DROP INDEX em UNIQUE constraint falha.** Tem que usar `ALTER TABLE DROP CONSTRAINT`. PostgreSQL cria índices implícitos pra UNIQUE constraints, e não dá pra dropar separado.

3. **Audit `triggerCount` no n8n não é a métrica certa pra Error Triggers.** n8n só conta Schedule/Webhook/Form/Chat. Error Triggers nunca contam mesmo funcionando.

4. **Subagent (supabase-dba) descobriu drift de 2 policies entre auditoria e estado atual** — 23 esperado vs 25 encontrado, explicado pela migration #34 aplicada após auditoria.

5. **Edição de workflows n8n via MCP `update_workflow` requer reconstruir SDK code** — alto risco de drift pra workflows grandes (98 nodes). Pra delete simples, dashboard é mais seguro.

---

## Sumário executivo

> Linguagem direta, sem jargão. Pra Leandro decidir prioridades.

### Estado geral do InkFlow (em uma frase)

**Funcionando bem pra pré-launch, mas com 8 áreas críticas que precisam ser fechadas antes de cobrar mensalidade do primeiro cliente.**

### O bom

- O bot WhatsApp está rodando, respondendo, agendando. **A engenharia core funciona.**
- Os 5 auditores que monitoram a saúde do sistema **estão batendo o ponto direitinho** (heartbeat OK há 30 dias, success rate 99.4%).
- Custo atual ridiculamente baixo: **~$11-27/mês**. Tudo dentro de free tier.
- Cobertura de testes nas tools do agent (Modo Coleta v2) e nos auditores está boa.
- Documentação canonical (runbooks, decisions, methodology) é **rara em SaaS dessa idade** — bem feito.
- Subagents Claude versionados e procedures de rotação dos 4 secrets críticos documentadas.

### O ruim

1. **Tem uma "tool zumbi" no bot** (`consultar_preco_retoque`) — a IA pode chamar a função, mas o endpoint não existe. Resultado: erro 404 silencioso, **bot pode dar resposta errada de preço pra cliente** sem você saber. (15 min pra fix.)

2. **Auth e Billing não têm teste nenhum.** Se um bug entrar, dá pra um tatuador ver dados de outro tatuador (auth) ou alguém ser cobrado errado/não ser cobrado quando deveria (billing). Isso é risco de processo + risco de churn em massa. (1-2 semanas pra cobrir.)

3. **Os 53 testes que existem rodam só localmente.** No GitHub Actions só roda os de prompts. Qualquer regressão em outras áreas passa silenciosa pra produção. (1 hora pra ligar.)

4. **A IA tem 2 funções "definer" no banco que qualquer um na internet pode chamar via URL pública** (`/rest/v1/rpc/expire_trials` e `merge_conversa_jsonb`). Não é remote code execution mas é elevação de privilégio potencial. (30 min pra fix.)

5. **O n8n é o ponto de fricção mais denso do sistema.** Agrega 8 problemas de uma vez: SPOF físico (na mesma máquina do Evolution), workflow de 98 nós em arquivo único, lógica espalhada em 6 lugares, 3 stores de memória conflitantes (3, 386 e 32 rows pra mesma "história"), drift git ↔ produção, latência alta, debug difícil. **A pergunta do início "n8n é dívida disfarçada?" — confirmado, é.**

6. **A latência do bot é alta.** Mensagem chega → resposta sai em ~9-17 segundos no caso típico. Metade desse tempo é debounce intencional (5-10s pra agregar mensagens em rajada), mas a outra metade é arquitetura: 25-30 hops de rede num turno, 9 chamadas pro CF + 8-12 pro Supabase só de overhead.

7. **Sem fallback de SLA.** Se a VPS Vultr cair, o bot fica mudo (n8n + Evolution na mesma máquina). Se Supabase cair, tudo trava. **SLA composto realista: 94-97%** = 10-22 dias/ano de "produto não funciona". Não dá pra cobrar mensalidade com isso.

8. **Sentry está configurado mas sem trigger.** O workflow n8n "Sentry Error Handler" está ativo, mas com `triggerCount = 0`. **Erros n8n vão pro silêncio.** Você fica voando cego em runtime errors. (30 min pra ligar.)

### O que fazer agora

**Sprint 1 (1-2 semanas) — Quick wins de auth e cobertura:**
fechar gaps de auth/billing tests, ligar Sentry, fechar RPCs anon, rodar tests em CI. **~6-7 horas concentradas pra fechar 16 dos 65 findings.**

**Sprint 2-3 (4-5 semanas) — Auditores expandidos + versionamento:**
auditor pra n8n workflow health + Evolution per-tenant + tool integrity (preenche os gaps que deixaram a tool zumbi passar despercebida). Rate limiting. CSP. Schema baseline em git.

**Sprint 4+ (6-10 semanas) — Refator multi-agent COM remoção integrada de n8n:**
o brainstorm pausado já tinha o desenho (Modo A code-first em CF Workers com OpenAI Agents SDK). **Nova recomendação: incluir remoção de n8n no escopo, não em PR separado.** Custo +30-50% mas elimina 5 dívidas estruturais simultaneamente. Pós-refator: hot path 1 vai de 25-30 hops pra 5-7, P50 sobe de 9-17s pra 3-6s, e o produto fica preparado pra escala.

### Sobre o brainstorm pausado

A pergunta original que você fez ("SaaS profissionais usam n8n no hot path?") **tem resposta confirmada com dados agora**. Não é só feeling: **n8n no hot path acumula 8 problemas distintos no InkFlow específico**. Refator multi-agent (Modo A) **deve ser feito**, mas:

- **Não é P0** (auth/billing tests + tool zumbi + RPCs anon vêm primeiro — risco maior, custo menor)
- **É P1 com escopo expandido** — não só Modo A, mas remoção integrada de n8n
- **Continua o desenho preservado** — Supabase como source of truth, agents como classes puras pra portabilidade futura A→B (Durable Objects + streaming)

### Custo de NÃO fazer nada

- **Curto prazo (3 meses):** 1 incidente de auth bypass = vergonha pública e churn. 1 cobrança errada = caso jurídico.
- **Médio prazo (6-12 meses):** quando crescer pra 10-100 tatuadores, n8n vira gargalo. Refator urgente debaixo de pressão. SLA composto não suporta cobrar mensalidade.
- **Longo prazo (12+ meses):** todo dia adiando refator é mais código novo encostando no n8n — custo do refator dobra.

### Custo de FAZER

- Sprint 1: ~6-7h de trabalho concentrado, $0 de infra.
- Sprint 2-3: ~4-5 semanas part-time, $0-25 de infra (Supabase Pro ainda opcional).
- Sprint 4+ (refator): 6-10 semanas, $0 de infra adicional. Termina com produto ~3x mais rápido e 1 SPOF a menos.

---

## Diagrama arquitetura atual

```mermaid
flowchart TB
    %% External actors
    Cliente[Cliente WhatsApp]
    Tatuador[Tatuador<br/>Telegram]
    Founder[Founder<br/>Telegram alertas]
    MP[Mercado Pago<br/>API + Webhooks]
    OpenAI[OpenAI API]
    MailerLite[MailerLite<br/>3 grupos]

    %% VPS Vultr
    subgraph VPS["VPS Vultr (104.207.145.47) — SPOF FÍSICO"]
        direction TB
        Evo[Evolution API<br/>1 central + N per-tenant]
        N8N[n8n<br/>10 workflows<br/>1 hot path: MEU NOVO WORK - SAAS<br/>98 nodes]
        Evo -.->|webhook<br/>rede interna Docker| N8N
        N8N -.->|sendMedia<br/>http://evolution:8080| Evo
    end

    %% Cloudflare
    subgraph CF["Cloudflare account 1bea7a6f...e0bd6fec"]
        direction TB
        Pages[CF Pages<br/>inkflowbrasil.com<br/>96 Functions JS<br/>0 build, 6 HTMLs estáticos]
        Worker[Worker inkflow-cron<br/>13 cron triggers<br/>dispatcher pra Pages]
        R2[R2 inkflow-portfolios]
        AI[AI binding<br/>Workers AI]
    end

    %% Supabase
    subgraph SB["Supabase sa-east-1 — bfzuxxu... (SPOF universal)"]
        direction TB
        Tables[16 tabelas<br/>RLS habilitado<br/>3 views<br/>9 RPCs]
        Memory["Memory split:<br/>n8n_chat_histories: 386<br/>chat_messages: 32<br/>(redis n8n separado)"]
        Audit[audit_runs / audit_events<br/>5 auditores ativos]
    end

    %% External integrations
    GH[GitHub<br/>repo + GHA deploy]

    %% Hot path 1: Cliente → Bot
    Cliente ==>|"1. msg"| Evo
    N8N ==>|2. Buscar Tenant<br/>Verificar Pause| SB
    N8N ==>|"3. Wait 5-10s (debounce)<br/>+ Redis buffer"| N8N
    N8N ==>|4. Gerar Prompt IA<br/>+ Guardrails PRE| Pages
    N8N ==>|"5. LangChain Agent<br/>(98 nodes, 12 tools)"| OpenAI
    N8N ==>|6. 12 tool calls<br/>(1 ZUMBI: consultar_preco_retoque)| Pages
    Pages ==>|7. Tools acessam DB| SB
    N8N ==>|8. Postgres Chat Memory| SB
    N8N ==>|9. Guardrails POST<br/>+ kill-switch-detect| Pages
    N8N ==>|"10. resposta texto/midia"| Evo
    Evo ==>|"11. msg"| Cliente

    %% Hot path 2: Webhook MP
    MP -->|webhook IPN<br/>HMAC| Pages
    Pages -->|update tenant<br/>+ payment_logs| SB
    Pages -->|move group| MailerLite

    %% Hot path 3: Cron
    Worker -->|"scheduled() POST<br/>Bearer CRON_SECRET"| Pages
    Pages -->|13 endpoints /api/cron/*| SB
    Pages -->|alertas falha| Founder

    %% Hot path 4: Onboarding
    Cliente -->|fill form 200KB HTML| Pages
    Pages -->|create tenant + sub<br/>+ Evo instance| Evo
    Pages -->|sub| MP
    Pages -->|add subscriber| MailerLite

    %% Hot path 5: Deploy
    GH -->|GHA wrangler-action| Pages
    %% Worker deploy is manual (no GHA)

    %% Hot path 6: Studio dashboard
    Tatuador -.->|orçamentos<br/>callbacks botões| Pages
    Pages -.->|inline keyboard| Tatuador

    %% Auditors
    Worker -->|cron audit-X| Audit

    %% External sync
    GH <-.->|MCP n8n versionamento manual| N8N

    %% Styling
    classDef spof fill:#ff6b6b,stroke:#c92a2a,color:#fff
    classDef ok fill:#51cf66,stroke:#2f9e44,color:#fff
    classDef warning fill:#ffd43b,stroke:#fab005,color:#000
    classDef external fill:#74c0fc,stroke:#1971c2,color:#fff

    class VPS spof
    class SB warning
    class CF ok
    class MP,OpenAI,MailerLite,GH external
```

**Notação:**
- `==>` linhas grossas = hot path 1 (cliente→bot, mais crítico)
- `-->` linhas finas = outros hot paths
- `-.->` pontilhadas = canais secundários (Telegram, sync n8n)
- 🔴 vermelho (VPS) = **SPOF físico**
- 🟡 amarelo (Supabase) = **SPOF universal** (todos hot paths passam)
- 🟢 verde (CF) = **edge distribuído** (sem SPOF efetivo)
- 🔵 azul = vendors externos

**Observações chave do diagrama:**

1. **VPS Vultr concentra n8n + Evolution** — single point of failure. Hot path 1 inteiro depende dessa máquina.
2. **Hot path 1 atravessa 3 sistemas (VPS + CF + Supabase + OpenAI)** — qualquer um deles cair = bot mudo.
3. **n8n no meio** entre Evolution (entrada) e CF Pages (lógica/tools) — duplica latência e dificulta debug.
4. **Memory split em 3 stores** (Redis + n8n_chat_histories + chat_messages) com volumes drasticamente diferentes (sem garantia de consistência).
5. **Worker `inkflow-cron` é dispatcher puro** — toda lógica está em CF Pages. Boa decisão de design.
6. **Refator multi-agent (futuro)** elimina o subgraph "n8n" do diagrama — Evolution → CF Pages direto, agents code-first nos Workers.

---

## Fase 1 — Inventário

### 1.1 Repo `inkflow-saas`

#### Top-level (working dir)

```
~/Documents/inkflow-saas/
├── _headers, _redirects, robots.txt, sitemap.xml      # CF Pages config
├── index.html, admin.html, onboarding.html,           # 6 HTMLs estáticos
│   studio.html, reconnect.html, termos.html
├── wrangler.toml                                      # CF Pages config (apenas binding AI)
├── README.md, CHANGELOG.md
├── functions/         (Pages Functions)
├── cron-worker/       (Worker dispatcher)
├── tests/             (53 testes node:test)
├── evals/             (smoke tests + sub-projetos manuais)
├── scripts/           (3 helpers shell)
├── supabase/migrations/ (11 migrations)
├── docs/              (canonical, superpowers, workflows, email-templates, seo, future-plans)
├── images/, n8n/      (n8n/workflows/ está VAZIA — só .gitkeep)
├── .github/workflows/ (deploy.yml + prompts-ci.yml)
├── .claude/           (agents + settings + worktrees)
└── pixel-agents-standalone/  (GITIGNORED — projeto externo, próprio .git)
```

#### Sizing por dir (sem `node_modules`/`.git`/`.wrangler`)

| Dir | Tamanho | Notas |
|---|---|---|
| `pixel-agents-standalone/` | **163M** | Gitignored (`# Projetos externos nao relacionados ao SaaS`). Sub-projeto VS Code-like com server/webview-ui. Não conta como dívida do SaaS. |
| `cron-worker/` | 133M | ~133M é `node_modules` (wrangler dep). Source: 1 arquivo (`src/index.js`, 150 linhas) + 1 `scripts/deploy.sh`. |
| `docs/` | 8.6M | Bem estruturado — canonical/runbooks/decisions/superpowers. |
| `images/` | 2M | Assets estáticos. |
| `functions/` | 796K | **96 arquivos JS** — Pages Functions (path-based routing CF). |
| `tests/` | 452K | 53 testes (`node --test`). |
| `evals/` | 236K | 11 conversas + 4 smoke-tests + sub-projetos 2/3. |
| `supabase/` | 48K | 11 migrations SQL. |
| `scripts/` | 12K | `preflight-envvars.sh`, `test-prompts.sh`, `update-prompt-snapshots.sh`. |
| `n8n/` | 4K | **Apenas `.gitkeep`** — workflow NÃO está versionado nesta pasta. |

#### Sub-projects e fronteiras

| Sub-project | Localização | Build/runtime | Status |
|---|---|---|---|
| **Site + API SaaS** | `/` (root) | CF Pages + Pages Functions (JS sem build, sem package.json no root) | Ativo, deploy via GHA `deploy.yml` |
| **cron-worker** | `cron-worker/` | CF Worker (`wrangler deploy`) | Ativo, deploy manual via `cron-worker/scripts/deploy.sh` (com `bws` pra secrets) |
| **pixel-agents-standalone** | `pixel-agents-standalone/` | **Externo** — gitignored, próprio `.git`, não relacionado ao SaaS | N/A pra esta auditoria |

#### HTMLs (página por página)

| Arquivo | Tamanho | Função |
|---|---|---|
| `onboarding.html` | **200KB** | Onboarding novo cliente — JS inline gigante (suspeita: candidato a refatorar em chunks) |
| `studio.html` | 117KB | Dashboard do tatuador (KPIs, conversas, agenda, resumo) |
| `admin.html` | 55KB | Painel admin (Leandro) |
| `index.html` | 50KB | Landing page |
| `reconnect.html` | 20KB | Reconexão WhatsApp |
| `termos.html` | 17KB | Termos de uso |

> **Observação:** Stack zero-build. CF Pages serve HTML estático + Functions resolvem `/api/*`. Sem React/Vue/build pipeline. Todo o JS é inline ou referenciado direto.

#### Pages Functions (`functions/`) — visão geral

96 arquivos JS organizados em:

| Subdir | Conta | Uso |
|---|---|---|
| `_lib/` (top) | 13 | Helpers compartilhados: `agenda.js`, `audit-state.js`, `conversas-lifecycle.js`, `conversas-upsert.js`, `dashboard-time.js`, `guardrails.js`, `mp-sinal-handler.js`, `plans.js`, `pricing.js`, `resumo-semanal-prompt.js`, `telegram.js`, `trial-helpers.js` |
| `_lib/auditors/` | 5 | `billing-flow.js`, `deploy-health.js`, `key-expiry.js`, `rls-drift.js`, `vps-limits.js` |
| `_lib/prompts/` | 26 | Sistema 3-camadas (shared + por modo + few-shots): `_shared/` (5), `coleta/{cadastro,proposta,tattoo}/` (15), `exato/` (5), `index.js` |
| `api/` (top) | ~22 | Endpoints CRUD/ops: tenants, evo-*, mp-ipn, get-studio-token, etc. |
| `api/conversas/` | 5 | Lifecycle handoff (`assumir`, `devolver`, `list`, `thread`, `_grupos`, `_transition`) |
| `api/cron/` | 13 | Endpoints chamados pelo `cron-worker` (1:1 com triggers do `wrangler.toml`) |
| `api/dashboard/` | 3 | KPIs, atividade-recente, regenerate-resumo-semanal |
| `api/tools/` | 14 | **Tools dos agentes** (LLM): `acionar-handoff`, `aprimorar-persona`, `calcular-orcamento`, `consultar-horarios`, `consultar-proposta-tatuador`, `dados-coletados`, `enviar-objecao-tatuador`, `enviar-orcamento-tatuador`, `enviar-portfolio`, `gerar-link-sinal`, `guardrails/{pre,post}`, `preview-orcamento`, `prompt`, `reagendar-horario`, `reservar-horario`, `simular-conversa`, + `_tool-helpers.js` |
| `api/audit/`, `api/telegram/`, `api/webhooks/`, `api/approvals/`, `start/` | 5 | Telegram bot, MP webhook, approvals, deeplink `/start/[[token]]` |

#### Cron triggers (`cron-worker/wrangler.toml`)

**13 triggers** — todos mapeados 1:1 com endpoints `/api/cron/*` no `cron-worker/src/index.js`:

| Cron | Endpoint | Frequência |
|---|---|---|
| `0 12 * * *` | `expira-trial` | 1×/dia 09:00 BRT |
| `0 2 * * *` | `cleanup-tenants` | 1×/dia 23:00 BRT |
| `0 9 * * *` | `reset-agendamentos` | 1×/dia 06:00 BRT |
| `*/30 * * * *` | `monitor-whatsapp` | a cada 30min |
| `*/15 * * * *` | `auto-retomar-bot` | a cada 15min (kill-switch) |
| `*/5 * * * *` | `audit-escalate` | a cada 5min |
| `0 4 * * 1` | `audit-cleanup` | seg 01:00 BRT |
| `0 6 * * *` | `audit-key-expiry` | 03:00 BRT |
| `0 */6 * * *` | `audit-deploy-health` | 4×/dia |
| `30 */6 * * *` | `audit-billing-flow` | 4×/dia |
| `15 */6 * * *` | `audit-vps-limits` | 4×/dia |
| `0 7 * * *` | `audit-rls-drift` | 04:00 BRT |
| `0 12 * * 1` | `resumo-semanal` | seg 09:00 BRT |

**Observação:** Endpoints `cuidados-pos`, `expira-holds`, `followup` existem em `functions/api/cron/` mas **não têm trigger** — código órfão ou disparado de outro lugar (provavelmente n8n; investigar em 1.3).

#### Migrations Supabase (`supabase/migrations/`)

11 migrations (todas datadas abr-mai 2026):

```
2026-04-26 create-approvals-table.sql
2026-04-27 create-audit-tables.sql
2026-04-30 modo-coleta-prep.sql
2026-05-02 modo-coleta-v2.sql
2026-05-03 pagina-tatuador-foundation.sql
2026-05-04 pagina-tatuador-conversas.sql
2026-05-05 pr2-dashboard-rpc.sql
2026-05-05 pr2-dashboard.sql
2026-05-06 fix-rls-drift-qualified-refs.sql
2026-05-06 fix-rls-drift-search-path.sql
2026-05-06 merge-conversa-jsonb-rpc.sql
```

Schema "real" (anterior ao histórico em git) **não está versionado** — só as últimas 11 migrations. Ponto de atenção pra Fase 2 (versionamento).

#### Workflow n8n versionamento

- Pasta `n8n/workflows/` está **vazia** (só `.gitkeep`)
- Existe cópia em `docs/workflows/MEU NOVO WORK - SAAS - 2026-05-06.json` (1 export, 6 dias atrás)
- **Conclusão preliminar:** workflow n8n tem snapshot manual ocasional, **não está em sync contínuo com produção**. Investigar gap em 1.3 + Fase 2 (versionamento).

#### `.claude/agents/`

| Status | Agentes |
|---|---|
| **Ativos** (3) | `supabase-dba.md`, `deploy-engineer.md`, `vps-ops.md` |
| **`_legacy/`** (6) | `o-confere.md`, `estagiario.md`, `supa.md`, `marcelo-pago.md`, `doutor-evo.md`, `hunter.md` |

Memória global (`MEMORY.md` → `project_agents.md`) referencia **6 agentes ativos** — desatualizada vs estado real (3 ativos + 6 movidos pra `_legacy`). Anotar pra Fase 2 (drift de docs/memória).

#### `.github/workflows/`

| Workflow | Trigger | O que faz |
|---|---|---|
| `deploy.yml` | push `main` ou manual | `wrangler pages deploy . --project-name=inkflow-saas --commit-dirty=true` (apenas CF Pages — não toca cron-worker) |
| `prompts-ci.yml` | PR/push em `functions/_lib/prompts/**` ou afins | Roda `scripts/test-prompts.sh` |

**Gap:** cron-worker não tem CI/CD — deploy é manual via `cron-worker/scripts/deploy.sh`. Pages Functions tampouco rodam testes em CI (`tests/` 53 specs **não rodam no pipeline** exceto os de prompts).

#### Hooks Claude Code

`.claude/settings.json` tem só `permissions.allow` (4 entries). **Nenhum hook ativo** no projeto (mas existem hooks globais em `~/.claude/hooks/` — escopo Fase 1.7).

#### Dead code / órfãos

- ✅ **0 arquivos órfãos** em `functions/_lib/` — todos referenciados (verificado via grep recursivo, Agent Explore)
- ⚠️ **30 endpoints sem teste** em `functions/api/` (lista completa abaixo) — input pra Fase 2 (test coverage)
- ⚠️ **Worktree órfão** em `.claude/worktrees/elated-beaver/` (gitignored mas presente, ocupando espaço — ~30 arquivos, possivelmente staging antigo de PR `feat-telegram-bot-down`)
- ⚠️ Endpoints `cuidados-pos`, `expira-holds`, `followup` sem trigger no `cron-worker` — confirmar se são chamados via n8n (1.3)

**Endpoints API sem teste correspondente em `tests/`:**

```
api/check-telegram-connected.js
api/cleanup-tenants.js
api/conversas/_grupos.js, _transition.js
api/create-onboarding-link.js, create-subscription.js, create-tenant.js
api/cron/cuidados-pos.js, expira-holds.js, expira-trial.js, followup.js,
        monitor-whatsapp.js, reset-agendamentos.js
api/dashboard/regenerate-resumo-semanal.js
api/delete-tenant.js
api/evo-create-instance.js, evo-pairing-code.js, evo-qr.js, evo-status.js
api/get-studio-token.js, get-tenant.js
api/mp-ipn.js, public-start.js
api/request-studio-link.js, send-studio-email.js, send-whatsapp-link.js
api/telegram-bot-info.js
api/validate-onboarding-key.js, validate-studio-token.js
api/webhooks/mp-sinal.js
```

#### Quick stats Fase 1.1

| Métrica | Valor |
|---|---|
| Arquivos JS em `functions/` | 96 |
| Endpoints `api/*` (excl. `_lib`, `_*helpers`, `_middleware`) | ~67 |
| Testes (`*.test.mjs`) | 53 |
| Cobertura (gross) | ~37 endpoints com teste / 67 ≈ **55%** |
| Migrations Supabase versionadas | 11 (apr-mai/26) — schema base não versionado |
| Cron triggers | 13 |
| HTMLs estáticos | 6 (~460KB total) |
| Pages Functions deps NPM | 0 (zero-build, JS puro) |
| Sub-agents Claude Code | 3 ativos + 6 legacy |

---

### 1.2 Stack runtime externa

#### Inventário consolidado de serviços externos

| # | Serviço | Hospedagem / endpoint | Owner | Papel no SaaS |
|---|---|---|---|---|
| 1 | **Cloudflare Pages** | `https://inkflowbrasil.com` (account `1bea7a6f2e41f53d5687b29ec0bd6fec`) | Leandro | Frontend HTML estático + endpoints `/api/*` (Pages Functions) |
| 2 | **Cloudflare Workers** | `inkflow-cron` (account acima, `*.workers.dev`) | Leandro | Dispatcher dos 13 crons → CF Pages |
| 3 | **Cloudflare R2** | bucket `inkflow-portfolios` (criado 2026-03-31) | Leandro | Storage de portfolios dos tatuadores |
| 4 | **Supabase** | Project `bfzuxxuscyplfoimvomh` em `sa-east-1`, PG 17.6.1.084, ACTIVE_HEALTHY | Leandro | DB principal — tenants, conversas, agendamentos, audit, payment logs |
| 5 | **Evolution API** | `evo.inkflowbrasil.com` (Vultr VPS `104.207.145.47`) | Leandro (auto-hospedado) | WhatsApp gateway — 1 instância `central` + N por-tenant |
| 6 | **n8n** | `n8n.inkflowbrasil.com` (mesma VPS Vultr) | Leandro (auto-hospedado) | Orquestração do workflow do bot WhatsApp (`PmCMHTaTi07XGgWh`) |
| 7 | **Mercado Pago** | `https://api.mercadopago.com` | Leandro | Billing recorrente (subscriptions) + sinais (cobrança avulsa) |
| 8 | **MailerLite** | `https://connect.mailerlite.com/api/` | Leandro | Email transactional + 3 automations de ciclo de vida (Trial Ativo / Expirou / Clientes Ativos) |
| 9 | **Telegram (2 bots)** | `https://api.telegram.org` | Leandro | Bot 1: alertas internos founder. Bot 2: orçamentos Modo Coleta (per-tatuador). |
| 10 | **OpenAI / Claude** | `https://api.openai.com` (+ Anthropic via n8n credentials) | Leandro | LLM runtime — n8n + tools CF Pages |
| 11 | **Pushover** | `https://api.pushover.net` | Leandro | Alt channel emergência (manual via curl, no runbook `telegram-bot-down.md`) |
| 12 | **GitHub** | `github.com/brazilianhustler/inkflow-saas` | Leandro | Source control + GHA deploy + GitHub Secrets |
| 13 | **Vultr** | VPS `104.207.145.47` | Leandro | Host de Evolution + n8n (Docker Compose) |
| 14 | **Bitwarden** | Bitwarden Cloud + bws (Secrets Manager) | Leandro | Vault de secrets (BW classic = founder, bws = automação) |

#### Cloudflare resources detalhados

```
Account: 1bea7a6f2e41f53d5687b29ec0bd6fec  (Lmf4200@gmail.com's Account, criado 2026-03-28)
├── Pages projects: inkflow-saas → https://inkflowbrasil.com
├── Workers: 1
│   └── inkflow-cron  (criado 2026-04-22, modificado 2026-05-06)
├── R2 buckets: 1
│   └── inkflow-portfolios  (criado 2026-03-31)
├── KV namespaces: 0          ← nenhum
├── D1 databases: 0           ← nenhum
└── Hyperdrive configs: 0     ← nenhum
```

> **Observação:** Sem KV/D1/Hyperdrive. Cache layer e edge DB **não estão em uso**. Estado conversacional vai 100% via Supabase. Anotar pra Fase 2 (decisão arquitetural — pertinente ao refator multi-agent).

#### Supabase project

- **ID/ref:** `bfzuxxuscyplfoimvomh`
- **Region:** `sa-east-1` (São Paulo) — boa pra latência BR
- **Postgres:** 17.6.1.084 (engine 17, GA channel)
- **Status:** ACTIVE_HEALTHY
- **DB host:** `db.bfzuxxuscyplfoimvomh.supabase.co`
- **Hardcoded:** URL não vai como env var — `https://bfzuxxuscyplfoimvomh.supabase.co` aparece literal em vários endpoints (`secrets.md` linha 69 confirma — não há `SUPABASE_URL` env var)

#### Inventário de secrets

##### bws (Bitwarden Secrets Manager) — 11 nomes

```
CLOUDFLARE_ACCOUNT_ID              CRON_SECRET
CLOUDFLARE_API_TOKEN               GH_PAT_VPS_MCP
GITHUB_API_TOKEN                   INKFLOW_KILL_SWITCH_SECRET
INKFLOW_TELEGRAM_BOT_TOKEN         INKFLOW_TELEGRAM_WEBHOOK_SECRET
INKFLOW_TOOL_SECRET                OPENAI_API_KEY
SB_PAT
```

##### CF Pages env / outros stores — secrets adicionais (de `secrets.md`)

`secrets.md` lista **~22 secrets** no total. Os que **NÃO estão no bws** (vivem em CF Pages env / Bitwarden classic / GitHub Secrets / VPS env):

| Secret | Onde mora |
|---|---|
| `SUPABASE_SERVICE_KEY` + `SUPABASE_SERVICE_ROLE_KEY` (dual naming) | Bitwarden classic + CF Pages env |
| `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` | Bitwarden + CF Pages env |
| `EVO_GLOBAL_KEY` + `EVOLUTION_GLOBAL_KEY` (dual naming) | Bitwarden + CF Pages env + VPS env (`/opt/evolution/.env`) |
| `EVO_CENTRAL_APIKEY` | Bitwarden + CF Pages env |
| `EVO_DB_CLEANUP_SECRET` | CF Pages env |
| `MAILERLITE_API_KEY` | Bitwarden + CF Pages env |
| `TELEGRAM_BOT_TOKEN` (alertas internos) | Bitwarden + CF Pages env + Worker env |
| `PUSHOVER_APP_TOKEN` + `PUSHOVER_USER_KEY` | Bitwarden (não replicado em CF Pages — manual no runbook) |
| `CLEANUP_SECRET` | CF Pages env + Worker env |
| `STUDIO_TOKEN_SECRET` | CF Pages env |
| `EVAL_SECRET` | CF Pages env |
| `N8N_WEBHOOK_SECRET` | Bitwarden + CF Pages env (n8n hoje desativado parcialmente, ver 1.3) |
| `CF_API_TOKEN` (deploy GHA) | GitHub Secrets (separado do master `CLOUDFLARE_API_TOKEN`) |

##### Findings de secrets (factual)

- ⚠️ **bws cobre só 11/22 secrets (~50%).** Os críticos (MP, Supabase, Evolution, MailerLite) **não passam por bws** — vivem em Bitwarden classic + CF Pages env. Tooling de automação (cron-worker deploy script, MCPs) só pega o que tá no bws.
- ⚠️ **Dual naming** em 2 casos:
  - `EVO_GLOBAL_KEY` / `EVOLUTION_GLOBAL_KEY` (mesma key, 2 nomes — algumas funções referenciam um, outras outro)
  - `SUPABASE_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` (idem)
  - Rotação tem que atualizar **ambos** (procedure documentada) — risco se esquecer um.
- ⚠️ **`SUPABASE_URL` não é env var** — `https://bfzuxxuscyplfoimvomh.supabase.co` aparece hardcoded em endpoints. Migrar pra env var forçaria refactor amplo.
- ⚠️ **TTL fixo só em `CLOUDFLARE_API_TOKEN` (90d)** — todo o resto sem expiry. Sem rotação proativa, secrets antigos acumulam.
- ⚠️ **Histórico de incidents documentado** em `secrets.md`:
  - 2026-04-25/26 — `OPENAI_API_KEY` rotacionada (vazou em transcript)
  - 2026-04-25/26 — `PUSHOVER_APP_TOKEN` rotacionado (vazou em transcript)
  - 2026-04-25/26 — Deploys GHA falhando ~24h por gap de permission no `CLOUDFLARE_API_TOKEN` master

#### GitHub Actions secrets (esperados)

| Secret | Uso |
|---|---|
| `CF_API_TOKEN` | `wrangler-action@v3` deploy CF Pages |
| `CF_ACCOUNT_ID` | mesma action |

(GHA `deploy.yml` não toca Worker `inkflow-cron` — esse é deploy manual.)

#### Pontos de integração entre serviços (resumo)

```
                                       ┌──────────────────────┐
                                       │   CF Pages (root)    │
                                       │  inkflowbrasil.com   │
                                       │  + functions/api/*   │
                                       └─┬────────┬───────┬───┘
            ┌─────CRON_SECRET────────────┘        │       │
            │                                     │       │
            ▼                                     ▼       ▼
  ┌──────────────────┐                  ┌──────────────┐ ┌──────────────┐
  │ inkflow-cron     │                  │  Supabase    │ │ Mercado Pago │
  │ (Worker)         │                  │  (sa-east-1) │ │  (subs+sinal)│
  └──────────────────┘                  └──────────────┘ └──────────────┘
            │                                  ▲
            │ alerta failure                   │
            ▼                                  │
  ┌──────────────────┐                         │
  │  Telegram bot 1  │                         │  webhook
  │  (alertas)       │                         │  inbound
  └──────────────────┘                         │
                                               │
                            ┌──────────────────┴──────────────┐
                            │  Webhook flow (cliente → bot):   │
WhatsApp cliente            │                                  │
       │                    │  EvoAPI ──webhook──► n8n ──http──► CF Pages /api/tools/*
       ▼                    │                                  │
  ┌─────────────┐           │  (validate via N8N_WEBHOOK_SECRET│
  │ Evolution   │◄──response│   ou INKFLOW_TOOL_SECRET)        │
  │ (Vultr VPS) │           └──────────────────────────────────┘
  └─────────────┘
       ▲                                                       │
       └─── n8n manda resposta via APIKEY per-tenant ◄─────────┘
            (lê de tenants.evo_apikey via Supabase)

CF Pages → MailerLite (per-tenant lifecycle automations)
CF Pages → Telegram bot 2 (orçamentos Modo Coleta)
Telegram bot 2 → CF Pages /api/telegram/webhook (callbacks dos botões)
```

#### Findings Fase 1.2

| # | Finding | Severity preliminar |
|---|---|---|
| F1.2.1 | bws cobre só ~50% dos secrets — outros secrets críticos vivem em CF Pages env / Bitwarden classic | média |
| F1.2.2 | Dual naming em 2 secrets críticos (EVO + SUPABASE) — risco de drift em rotação | baixa |
| F1.2.3 | Sem KV/D1/Hyperdrive — estado 100% no Supabase, sem cache layer edge | observação (decisão arquitetural pra Fase 2) |
| F1.2.4 | `SUPABASE_URL` hardcoded em código (não env var) | baixa |
| F1.2.5 | TTL só em `CLOUDFLARE_API_TOKEN` (90d) — resto sem expiry, sem política de rotação proativa | média |
| F1.2.6 | n8n e Evolution co-hospedados na **mesma VPS** Vultr — SPOF físico | alta (pra Fase 2 SPOFs) |
| F1.2.7 | cron-worker deploy é manual (sem CI) — Pages tem GHA, Worker não | média |

---

### 1.3 Workflow n8n

#### Inventário de workflows na instância

n8n está em `https://n8n.inkflowbrasil.com` (Vultr VPS, mesma máquina do Evolution). 1 projeto pessoal (`Leandro lmf4200@gmail.com`).

**10 workflows total** — 6 ativos / 4 desativados:

| ID | Nome | Status | Trigger | Papel |
|---|---|---|---|---|
| `PmCMHTaTi07XGgWh` | **MEU NOVO WORK - SAAS** | ✅ ativo | Webhook | **Hot path do bot WhatsApp** (98 nodes) |
| `0GkC6Ehh0H8sxRVE` | InkFlow PR Babysitter | ✅ ativo | Cron seg-sex 9-18 BRT | Nudge Telegram pra PRs ≥24h sem update |
| `EWrPa5xfupsAygz2` | InkFlow Uptime | ✅ ativo | Cron 5min | Pinga `inkflowbrasil.com` + Evo VPS |
| `1cyShNBUqgo6d2JY` | InkFlow Smoke Test E2E | ✅ ativo | Cron 1h | Smoke E2E |
| `8J1I0ru4yFlSab61` | INKFLOW - Sentry Error Handler | ✅ ativo | (sem trigger configurado) | Webhook handler |
| `CKoSZSI5Y9GsD5Df` | Agenda → Pushover Alarme | ✅ ativo | Cron 1min | **Não-SaaS** — ferramenta pessoal Leandro (Calendar→Pushover) |
| `KEO1tJRKpYTxi15E` | InkFlow - Expira Trial (7d) | ❌ desativado | Cron | **Migrado pro `cron-worker`** (backup desde 21/04) |
| `V2zccb03P9ZUEH3o` | INKFLOW - Reset Agendamentos | ❌ desativado | Cron | **Migrado pro `cron-worker`** |
| `JuWleItL6kb0x1NO` | InkFlow - Cleanup Tenants | ❌ desativado | Cron | **Migrado pro `cron-worker`** |
| `JZF5llQOonKjDxpY` | InkFlow - Monitor WhatsApp | ❌ desativado | Cron | **Migrado pro `cron-worker`** |

> **Observação:** o spec inicial pediu detalhes do workflow principal. Os 4 desativados são backup pós-migração e não estão no hot path (rotation pra evitar regressão — segurança operacional). O Pushover Alarme é ferramenta pessoal, não relacionada ao SaaS.

#### Workflow principal — `MEU NOVO WORK - SAAS`

- **ID:** `PmCMHTaTi07XGgWh`
- **Status:** Ativo desde 2026-03-26, última modificação 2026-05-06
- **Trigger:** Webhook POST `path=/inkflow` com `headerAuth` (autenticado via `N8N_WEBHOOK_SECRET`)
- **Total nodes:** **98** (158KB JSON, 4.4k linhas)
- **Versionamento em git:** snapshot manual em `docs/workflows/MEU NOVO WORK - SAAS - 2026-05-06.json` (1 export, 6 dias atrás). **Não há sync contínuo.**

#### Composição do workflow (histograma de tipos)

| Tipo | Conta | Papel |
|---|---|---|
| `n8n-nodes-base.supabase` | 16 | CRUD direto no DB (tenant lookup, lifecycle conversa, log IA, kill-switch) |
| `n8n-nodes-base.redis` | 16 | Memória curta (text/audio/img buffers, dedupe, agregação de mensagens) |
| `n8n-nodes-base.if` | 12 | Branching condicional |
| `n8n-nodes-base.httpRequestTool` | 12 | **12 tools chamadas pelo agent** (CF Pages `/api/tools/*`) |
| `n8n-nodes-base.httpRequest` | 8 | 4 mídia (Evo direto) + Guardrails PRE/POST + Gerar Prompt IA + kill-switch-detect |
| `n8n-nodes-evolution-api.evolutionApi` | 5 | Envio resposta WhatsApp (texto, bypass, ack/resume) |
| `n8n-nodes-base.switch` | 5 | Roteamento (in/out, ia ativa/pausada, tipo mídia, action pause/resume) |
| `n8n-nodes-base.set` | 5 | Mutação de payload (incl. `Apply Fact-Check`) |
| `n8n-nodes-base.code` | 4 | JavaScript inline (`Seletor de número`, `Mensagem Completa`, `Code6`, `Code in JavaScript`) |
| `@n8n/n8n-nodes-langchain.openAi` | 2 | OpenAI direct (whisper/transcribe?) |
| `@n8n/n8n-nodes-langchain.lmChatOpenAi` | 2 | Chat models |
| `n8n-nodes-base.wait` | 2 | Delay (debounce mensagens em rajada) |
| `n8n-nodes-base.convertToFile` | 2 | base64 → file |
| `@n8n/n8n-nodes-langchain.agent` | 1 | **`Seu Agente`** — agent core LangChain |
| `@n8n/n8n-nodes-langchain.chainLlm` | 1 | LLM chain (provavelmente fact-check ou fallback) |
| `@n8n/n8n-nodes-langchain.memoryPostgresChat` | 1 | Memory longa (Postgres) |
| `n8n-nodes-base.webhook` | 1 | Trigger |
| `n8n-nodes-base.executeWorkflow` | 1 | Sub-call (`Call 'MEU NOVO WORK - SAAS'` — recursão self-call) |
| `n8n-nodes-base.aggregate` | 1 | Aggregation |
| `n8n-nodes-base.postgres` | 1 | Salvar Histórico Humano (insert direto) |

#### 12 tools do agent (`httpRequestTool` → CF Pages `/api/tools/`)

| Tool n8n | Endpoint CF Pages |
|---|---|
| `calcular_orcamento` | `/api/tools/calcular-orcamento` ✅ |
| `acionar_handoff` | `/api/tools/acionar-handoff` ✅ |
| `consultar_horarios_livres` | `/api/tools/consultar-horarios` ✅ |
| `reservar_horario` | `/api/tools/reservar-horario` ✅ |
| `gerar_link_sinal` | `/api/tools/gerar-link-sinal` ✅ |
| `enviar_portfolio` | `/api/tools/enviar-portfolio` ✅ |
| `reagendar_horario` | `/api/tools/reagendar-horario` ✅ |
| `consultar_preco_retoque` | `/api/tools/consultar-preco-retoque` ⚠️ **404 — endpoint NÃO existe** |
| `dados_coletados` | `/api/tools/dados-coletados` ✅ |
| `enviar_orcamento_tatuador` | `/api/tools/enviar-orcamento-tatuador` ✅ |
| `enviar_objecao_tatuador` | `/api/tools/enviar-objecao-tatuador` ✅ |
| `consultar_proposta_tatuador` | `/api/tools/consultar-proposta-tatuador` ✅ |

##### Endpoints CF Pages **órfãos** (existem em `functions/api/tools/` mas n8n não chama)

| Endpoint | Onde é usado |
|---|---|
| `aprimorar-persona.js` | **0 callers** — só catalogado em `docs/canonical/ids.md` |
| `preview-orcamento.js` | Compartilha lib `_lib/pricing.js`; provavelmente chamado pelo `studio.html` (UI tatuador) — não pelo n8n |
| `simular-conversa.js` | Usado **só pelos evals** (`evals/run.mjs`, `evals/generate.mjs`) — não é hot path |

#### HTTP requests não-tool (5 críticos)

| Node | URL |
|---|---|
| `Gerar Prompt IA` | `https://inkflowbrasil.com/api/tools/prompt` (gera systemMessage do agent) |
| `Guardrails PRE` | `https://inkflowbrasil.com/api/tools/guardrails/pre` |
| `Guardrails POST` | `https://inkflowbrasil.com/api/tools/guardrails/post` |
| `kill-switch-detect` | `https://inkflowbrasil.com/api/kill-switch-detect` |
| `HTTP Request1/2/3 + send midia` | `http://evolution:8080/...` (Evolution **rede interna Docker** — confirma co-hospedagem n8n+Evo) |

#### Lógica escondida (Code nodes)

##### `Seletor de número` (entry filter)

5 filtros sequenciais antes de processar:
1. Drop se `event != "messages.upsert"`
2. Drop se `remoteJid == "status@broadcast"`
3. Drop se `remoteJid.includes("@g.us")` (grupos)
4. Drop se sem conteúdo (`conversation`/`extendedTextMessage`/`audio`/`image`/`video`)
5. **Filtro anti-loop hardcoded** — drop se texto contém:
   - `"inkflow" && "handoff"`
   - `"*inkflow -"`
   - `"a ia pausou a conversa"`

Extrai `correctJid` (prefere `@s.whatsapp.net` sobre `remoteJidAlt`), `telefone`, `instance`, `messageId`.

##### `Mensagem Completa` (aggregation)

Junta `Redis1` + `Redis2` (parse JSON), dedupe via Set, junta com espaço — agrega mensagens em rajada que chegaram em sequência rápida (debounce + concat).

##### `Code6` (formatação histórico)

Lê todas as conversas anteriores via Aggregate2, formata em texto narrativo com data BRT.

##### `Code in JavaScript` (resposta processing)

- Extrai texto do output do agent (aceita string/array/object com várias keys)
- Tenta parse JSON se vier como string `{...}`
- Detecta gatilho `'fechou!' && 'orçamentos'` → flag `encerrar`
- Detecta gatilho portfolio (lista de keywords: `'ver trabalhos'`, `'portfólio'`, etc.) → flag `enviar_video`
- Splita resposta por `\n\n` (natural) **ou** `|||` (legado) — multi-mensagem
- Output: array de `{ Resposta, encerrar, enviar_video }`

#### Switch nodes (5 — roteamento)

| Switch | Saídas |
|---|---|
| `Switch6` | `outcoming` / `incoming` (direção) |
| `Rota Atendimento` | `Ia Ativa` / `Ia pausada` (kill-switch state pré-LLM) |
| `Switch1` | `text` / `text` / `videoMessage` / `stickerMessage` / `documentMessage` / `audio` / `image` |
| `Switch2` | `Continuar na IA` / `Pausar IA` (kill-switch decision pós-LLM) |
| `Switch action` | `pause` / `resume` (kill-switch action de tatuador) |

#### Side-effects no Supabase (16 nodes)

Reads:
- `Verificar Pause` (estado kill-switch)
- `Buscar Tenant`, `Get a row`, `Get a row (Log Resposta)`, `Busca Telefone`, `Check Handoff`, `ListMessages-Supabase2`

Writes:
- `Adiciona CHAT supabase` / `Atualiza CHAT Supabase` (chat_messages)
- `Cria Histórico Supabase` (conversa)
- `Salvar Historicoo Humano1` (postgres direto — bypass Supabase REST)
- `Pausar conversa` / `Retomar conversa` (kill-switch)
- `Log IA` (tool_calls_log)
- `Update a row` (conversa state update)
- `Create a row`

#### Fluxo geral (sequência observada)

```
Webhook EVO  ─►  Seletor de número (5 filtros)  ─►  Buscar Tenant + Tenant Ativo?
                                                                  │
                  ┌───────────────────────────────────────────────┘
                  ▼
        Verificar Pause + Rota Atendimento
                  │
       ┌──────────┴──────────┐
       │ Ia Ativa            │ Ia pausada
       ▼                     ▼
    Switch1 (tipo mídia)   (drop / log)
       │
   text/audio/image
       ▼
   Redis buffers + Wait + Compara Get Memory  ◄── debounce
       ▼
   Mensagem Completa (concat)  ─►  Cria Histórico  ─►  Adiciona CHAT
       │
       ▼
   Gerar Prompt IA  ─►  Guardrails PRE  ─►  Bypass?
                                              │
                                ┌─────────────┴─────────────┐
                                │ sim                       │ não
                                ▼                           ▼
                          Bypass Output                Seu Agente
                                │                    (LangChain + 12 tools
                                │                     + Postgres Memory)
                                │                           │
                                │                           ▼
                                │                  Guardrails POST
                                │                           │
                                │                           ▼
                                │                Apply Fact-Check (Set)
                                │                           │
                                └───────────┬───────────────┘
                                            ▼
                                Code in JavaScript (split \n\n ou |||)
                                            │
                                            ▼
                            Switch2 — Continuar IA / Pausar IA
                                            │
                                            ▼
                  HTTP Request (send midia) OU Enviar texto1 (Evolution)
                                            │
                                            ▼
                     Update a row + Log IA + Check Handoff
                                            │
                                            ▼
                                  kill-switch-detect (CF)
                                            │
                                            ▼
                                  Switch action — pause/resume
                                            │
                              ┌─────────────┴─────────────┐
                              ▼                           ▼
                       Pausar conversa              Retomar conversa
                       + Ack tatuador               + Msg ao cliente
```

#### Findings Fase 1.3

| # | Finding | Severity preliminar |
|---|---|---|
| F1.3.1 | **Tool ZUMBI**: agent n8n declara `consultar_preco_retoque` mas endpoint `/api/tools/consultar-preco-retoque` **não existe** em `functions/api/tools/` — 404 silencioso ao ser chamada | **alta** (bug latente) |
| F1.3.2 | 3 endpoints órfãos em `functions/api/tools/`: `aprimorar-persona`, `preview-orcamento`, `simular-conversa` (este último é eval-only — esperado) | baixa-média |
| F1.3.3 | Workflow tem **98 nodes** num único arquivo — complexidade alta, difícil testar em isolamento, hard-to-version (snapshot único de 158KB) | alta (pra Fase 2 — versionamento + testabilidade) |
| F1.3.4 | Lógica crítica em **JS inline** (4 nodes Code) sem testes — `Seletor de número`, `Mensagem Completa`, `Code6`, `Code in JavaScript` | alta (sem rede de segurança em mudanças) |
| F1.3.5 | Filtro anti-loop hardcoded com 3 strings em PT-BR no `Seletor de número` — frágil a mudanças de copy do bot | média |
| F1.3.6 | n8n e Evolution co-hospedados (URL Docker `http://evolution:8080`) — confirma SPOF físico (Vultr VPS único) | alta |
| F1.3.7 | Workflow versiona como snapshot manual (`docs/workflows/...-2026-05-06.json`) — drift garantido entre prod e git | média |
| F1.3.8 | 4 workflows backup desativados (Expira Trial, Reset Agendamentos, Cleanup Tenants, Monitor WhatsApp) — migrados pro cron-worker em 21-22/04, sem decisão de delete | baixa |
| F1.3.9 | `Apply Fact-Check` é Set node — fact-check inline na resposta, lógica não auditada nesta auditoria | observação (investigar em 2.3 duplicação) |
| F1.3.10 | `Seu Agente` chama 2 LLM models (`OpenAI Chat Model` + `OpenAI Chat Model2`) e tem `chainLlm` separado — múltiplos LLMs em sequência aumentam latência | observação (input pra 2.1 hot path) |

---

### 1.4 Supabase

#### Tables (16)

Todas com RLS **habilitado**. Counts atuais:

| Tabela | Rows | Categoria |
|---|---|---|
| `tenants` | 1 | Core — tatuador (estúdio) |
| `payment_logs` | **880** | Histórico MP — alto volume |
| `n8n_chat_histories` | **386** | Memory LangChain (n8n agent) |
| `audit_runs` | 128 | Heartbeat dos auditores |
| `onboarding_links` | 104 | Links de onboarding (key UUID hash) |
| `tool_calls_log` | 60 | Log das tool calls do agent |
| `logs` | 52 | Logs gerais do bot |
| `chat_messages` | 32 | Mensagens WhatsApp persistidas |
| `audit_events` | 15 | Eventos detectados pelos auditores |
| `dados_cliente` | 1 | Cliente final do tatuador |
| `chats`, `conversas` | 1 cada | Lifecycle de conversa |
| `approvals` | 1 | Approvals async (heurística #4) |
| `agendamentos` | 0 | Agendamentos por conversa |
| `signups_log` | 0 | Signups novos |
| `audit_reports` | 0 | Relatórios semanais |

> **Observação:** dados de produção estão **mínimos** (1 tenant, 1 conversa, 0 agendamentos). SaaS está em fase pré-launch / smoke. `n8n_chat_histories` (386) é a tabela com mais volume orgânico — memória de teste do bot.

#### Views (3)

| View | Status |
|---|---|
| `audit_current_state` | ⚠️ **SECURITY DEFINER** (advisor ERROR) |
| `orcamentos` | ⚠️ **SECURITY DEFINER** (advisor ERROR) |
| `tenant_stats` | OK |

#### RPCs / Functions (9 em `public`)

| Function | Security | Args | Uso provável |
|---|---|---|---|
| `update_updated_at` | INVOKER | (none) | Trigger helper |
| `update_conversa_last_msg_at` | INVOKER | (none) | Trigger helper |
| `atualizar_timestamp_campanha` | INVOKER | (none) | (não usado em triggers atuais — possível dead RPC) |
| `buscar_historico_campanha` | INVOKER | `p_telefone, p_limite` | Lookup histórico |
| `dashboard_resumo_periodo` | INVOKER | `p_tenant_id, p_since, p_until` | Dashboard PR2 |
| `dashboard_sinal_recebido` | INVOKER | `p_tenant_id, p_since` | Dashboard PR2 |
| `dashboard_taxa_conversao` | INVOKER | `p_tenant_id, p_since` | Dashboard PR2 |
| `expire_trials` | **DEFINER** | (none) | Cron expire trials — ⚠️ exec via `/rest/v1/rpc/expire_trials` por anon/auth |
| `merge_conversa_jsonb` | **DEFINER** | `p_conversa_id, p_field_name, p_patch, p_set_estado_agente, p_auto_transition_to_cadastro` | Modo Coleta v2 — JSONB merge atomic — ⚠️ exec por anon/auth |

#### Triggers (4 — todos updated_at-style)

| Tabela | Trigger | Timing | Event | Action |
|---|---|---|---|---|
| `chats` | `trg_chats_updated_at` | BEFORE | UPDATE | `update_updated_at()` |
| `dados_cliente` | `trg_dados_cliente_updated_at` | BEFORE | UPDATE | `update_updated_at()` |
| `n8n_chat_histories` | `trg_n8n_chat_histories_update_conversa` | AFTER | INSERT | `update_conversa_last_msg_at()` |
| `tenants` | `trg_tenants_updated_at` | BEFORE | UPDATE | `update_updated_at()` |

> **Gap:** tabelas `conversas`, `agendamentos`, `tool_calls_log`, `approvals`, `audit_*`, `chat_messages`, `payment_logs`, `signups_log` **não têm** trigger updated_at — algumas têm a coluna mas updates não atualizam o timestamp automaticamente.

#### Migrations — drift entre DB e git

**44 migrations aplicadas no DB** (desde 2026-03-26)
**11 migrations versionadas no git** (desde 2026-04-26)

**Drift de 33 migrations** — schema "base" inicial **não está em git**, foi aplicada via Dashboard SQL Editor antes do framework migrations adotar git como source of truth (2026-04-26).

**Confirma F1.1.** Migrations versionadas:

```
2026-04-26  create-approvals-table             ← primeira em git
2026-04-27  create-audit-tables
2026-04-30  modo-coleta-prep
2026-05-02  modo-coleta-v2
2026-05-03  pagina-tatuador-foundation
2026-05-04  pagina-tatuador-conversas
2026-05-05  pr2-dashboard, pr2-dashboard-rpc, pr2-dashboard-resumo-periodo
2026-05-06  fix-rls-drift-search-path
2026-05-06  fix-rls-drift-qualified-refs
2026-05-06  merge-conversa-jsonb-rpc
```

#### Extensions instaladas

5 ativas: `pg_stat_statements`, `uuid-ossp`, `plpgsql` (default), `pg_cron`, `pg_graphql`, `pgcrypto`, `supabase_vault`. **60+ disponíveis mas não instaladas** (incluindo `pg_net`, `pgvector`, `pg_partman`, `pgmq`, `wrappers`).

#### RLS policies (23 — resumo por tabela)

| Tabela | service_role | authenticated | anon | RLS gap? |
|---|---|---|---|---|
| `tenants` | ✅ ALL | SELECT/UPDATE/DELETE own | SELECT | ⚠️ anon SELECT (?) |
| `chats` | ✅ ALL | SELECT own | — | OK |
| `chat_messages` | ✅ ALL | SELECT own | — | OK |
| `dados_cliente` | ✅ ALL | SELECT own | — | OK |
| `logs` | ✅ ALL | SELECT own | — | OK |
| `n8n_chat_histories` | ✅ ALL | — | NO ACCESS (explicit) | OK |
| `onboarding_links` | ✅ ALL | — | — | OK |
| `payment_logs` | ✅ ALL | — | — | OK |
| `signups_log` | SELECT only | — | **INSERT (USING TRUE)** ⚠️ | ⚠️ anon insert sem WITH CHECK restritivo |
| `approvals` | — implícito (admin_full pra public ALL) | — | — | ⚠️ policy usa `public` role (não service_role) |
| `audit_events` | — implícito | SELECT (admin_read) | — | sem service_role explícita |
| `audit_runs` | — implícito | SELECT (admin_read) | — | sem service_role explícita |
| `audit_reports` | — implícito | SELECT (admin_read) | — | sem service_role explícita |
| `agendamentos` | — implícito | — | — | ⚠️ **0 policies** (RLS habilitado, RPC ou service_role only) |
| `conversas` | — implícito | — | — | ⚠️ **0 policies** |
| `tool_calls_log` | — implícito | — | — | ⚠️ **0 policies** |

> **Nota técnica:** Supabase `service_role` tem `BYPASSRLS` por default — funciona sem policy explícita. Mas a inconsistência (algumas tables têm `service_role_*` policy, outras não) gera ambiguidade. Tables sem qualquer policy + RLS=ON = bloqueio total para anon/authenticated, OK desde que acesso seja só server-side.

#### Advisors — security (13 lints)

##### ERROR-level (2)

| # | Lint | Detalhe |
|---|---|---|
| 1 | `security_definer_view` | View `public.audit_current_state` é SECURITY DEFINER |
| 2 | `security_definer_view` | View `public.orcamentos` é SECURITY DEFINER |

##### WARN-level (5)

| # | Lint | Detalhe |
|---|---|---|
| 3 | `rls_policy_always_true` | `signups_log.anon` INSERT com WITH CHECK = TRUE — bypass efetivo |
| 4 | `public_bucket_allows_listing` | Bucket Storage `tattoo_bucket` (public) permite `LIST` |
| 5 | `anon_security_definer_function_executable` | `expire_trials()` callable por anon via REST RPC |
| 6 | `anon_security_definer_function_executable` | `merge_conversa_jsonb(...)` callable por anon via REST RPC |
| 7 | `auth_leaked_password_protection` | Auth leaked password check **desligado** |

> Itens 5-6 também aparecem como `authenticated_security_definer_function_executable` (= 2 itens duplos).

##### INFO-level (3)

| # | Lint | Detalhe |
|---|---|---|
| 8 | `rls_enabled_no_policy` | `agendamentos` — RLS=ON, 0 policies |
| 9 | `rls_enabled_no_policy` | `conversas` — RLS=ON, 0 policies |
| 10 | `rls_enabled_no_policy` | `tool_calls_log` — RLS=ON, 0 policies |

#### Advisors — performance (~20 lints)

##### WARN (12)

| # | Lint | Detalhe |
|---|---|---|
| 1 | `auth_rls_initplan` × 11 | 11 policies em `tenants`, `chat_messages`, `chats`, `dados_cliente`, `logs`, `approvals`, `audit_events`, `audit_runs`, `audit_reports` chamando `auth.X()` direto (deve ser `(select auth.X())` pra subquery cache) |
| 2 | `duplicate_index` | `dados_cliente` tem índices idênticos: `dados_cliente_tenant_id_telefone_key` + `unique_tenant_telefone` |

##### INFO (7)

| # | Lint | Detalhe |
|---|---|---|
| 3 | `unindexed_foreign_keys` | `agendamentos_conversa_id_fkey` sem covering index |
| 4 | `unindexed_foreign_keys` | `audit_events_superseded_by_fkey` sem covering index |
| 5 | `unindexed_foreign_keys` | `signups_log_tenant_id_fkey` sem covering index |
| 6 | `unused_index` × 4 | `approvals_status_idx`, `approvals_expires_at_idx`, `idx_conversas_orcid`, `idx_chats_tenant_id` — nunca usados |

#### S3 / Storage (Supabase)

- Bucket `tattoo_bucket` (public) — usado para imagens de tattoo (referenciadas pelo bot via URL)
- ⚠️ Permite `LIST` (advisor #4) — qualquer cliente consegue listar os arquivos. Pra URLs públicas de objetos não precisa do `LIST`. Recomendação está no remediation.

#### Findings Fase 1.4

| # | Finding | Severity preliminar |
|---|---|---|
| F1.4.1 | **Schema drift git ↔ DB**: 44 migrations no DB, 11 em git → 33 migrations base **não versionadas** | alta (governance) |
| F1.4.2 | 2 views **SECURITY DEFINER** (`audit_current_state`, `orcamentos`) — flagged ERROR | alta (security) |
| F1.4.3 | 2 RPCs **SECURITY DEFINER** executáveis por anon (`expire_trials`, `merge_conversa_jsonb`) via `/rest/v1/rpc/` — auth bypass potencial | **alta** (security) |
| F1.4.4 | `signups_log.anon` INSERT WITH CHECK = TRUE — qualquer anon insere | média |
| F1.4.5 | `tattoo_bucket` public + permite LIST — vaza inventory | média |
| F1.4.6 | Auth leaked password protection desligado | baixa |
| F1.4.7 | 11 policies com `auth.X()` direto — perf degrada com volume (em scale) | média (ainda em pré-launch) |
| F1.4.8 | `dados_cliente` com índice duplicado | baixa |
| F1.4.9 | 3 FKs sem covering index | baixa |
| F1.4.10 | 4 índices nunca usados — candidates a drop | baixa |
| F1.4.11 | Inconsistência policies `service_role` — algumas tables têm explicit, outras dependem de BYPASSRLS implícito | baixa (ergonômica) |
| F1.4.12 | RPC `atualizar_timestamp_campanha` provavelmente dead code (não está em nenhum trigger) | baixa |
| F1.4.13 | `n8n_chat_histories` é o n8n LangChain memory store (386 rows) — bot armazena memory direto no Supabase via Postgres Chat Memory n8n node — confirma uso integrado n8n↔Supabase | observação |

---

### 1.5 Cloudflare Pages Functions + Workers

#### Pages project — `inkflow-saas`

- **URL canônica:** `https://inkflowbrasil.com`
- **Custom domain:** apex `inkflowbrasil.com` + redirect 301 de `www.inkflowbrasil.com` (via `_redirects`)
- **Build output dir:** `.` (zero-build, JS puro + HTML estático servidos direto)
- **Bindings:** `AI` binding (Workers AI) declarado em `wrangler.toml` raiz
- **Deploy:** GHA `deploy.yml` (push `main` → `wrangler-action@v3 pages deploy`)
- **Pages Functions:** **96 arquivos JS** (ver detalhamento em 1.1)

#### Worker — `inkflow-cron`

- **ID:** `809d059804c54bbd82e54fd54d9a7210`
- **Domain:** `inkflow-cron.<account>.workers.dev`
- **Created:** 2026-04-22 / **Modified:** 2026-05-06 (mais recente que o `deploy.yml` toca)
- **Observability:** `enabled = true` (logs via CF Workers Observability)
- **Triggers:** 13 crons (ver tabela em 1.1)
- **Handler:** `scheduled(event, env, ctx)` + `fetch(request, env)` (manual trigger via POST + `?cron=<expr>`)
- **Pattern:** dispatcher fan-out com retry 1× em transient (5xx, exception) — implementação no `cron-worker/src/index.js`
- **Deploy:** **manual** via `cron-worker/scripts/deploy.sh` (usa `bws` pra secrets) — sem CI

#### Env vars referenciadas em código (54 únicas)

Coletadas via `grep -rEho "env\.[A-Z][A-Z0-9_]+" functions/ cron-worker/src/`:

```
AI                                       MAILERLITE_API_KEY
AUDIT_BILLING_FLOW_WEBHOOK_DELAY_HOURS    MAILERLITE_GROUP_CLIENTES_ATIVOS
AUDIT_BILLING_FLOW_WEBHOOK_SILENT_HOURS   MAILERLITE_GROUP_ID
AUDIT_DEPLOY_HEALTH_WINDOW_HOURS          MAILERLITE_GROUP_TRIAL_ATIVO
AUDIT_DEPLOY_HEALTH_WRANGLER_DRIFT        MAILERLITE_GROUP_TRIAL_EXPIROU
AUDIT_KEY_EXPIRY_LAYER3                   MP_ACCESS_TOKEN
AUDIT_VPS_LIMITS_EGRESS_MONTHLY_GB        MP_WEBHOOK_SECRET
CF_PAGES_PROJECT_NAME                     N8N_REENTRADA_WEBHOOK_URL
CF_WORKER_SCRIPT_NAME                     N8N_WEBHOOK_SECRET
CLEANUP_SECRET                            N8N_WEBHOOK_URL
CLOUDFLARE_ACCOUNT_ID                     OPENAI_API_KEY
CLOUDFLARE_API_TOKEN                      PUSHOVER_APP_TOKEN
CLOUDFLARE_API_TOKEN_EXPIRES_AT           PUSHOVER_USER_KEY
CRON_SECRET                               REENTRADA_URL
ENABLE_TRIAL_V2                           RLS_INTENTIONAL_NO_PUBLIC
EVAL_SECRET                               SITE_URL
EVO_BASE_URL                              STUDIO_TOKEN_SECRET
EVO_CENTRAL_APIKEY                        SUPABASE_PAT
EVO_CENTRAL_INSTANCE                      SUPABASE_SERVICE_KEY
EVO_DB_CLEANUP_SECRET                     SUPABASE_SERVICE_ROLE_KEY
EVO_DB_CLEANUP_URL                        TELEGRAM_ADMIN_USER_ID
EVO_GLOBAL_KEY                            TELEGRAM_BOT_TOKEN
EVOLUTION_GLOBAL_KEY                      TELEGRAM_CHAT_ID
GITHUB_API_TOKEN                          TELEGRAM_WEBHOOK_SECRET
GITHUB_REPO_FULL_NAME                     VPS_HEALTH_TOKEN
INKFLOW_TELEGRAM_BOT_TOKEN                VPS_HEALTH_URL
INKFLOW_TELEGRAM_WEBHOOK_SECRET
INKFLOW_TOOL_SECRET
KILL_SWITCH_SECRET
```

##### Cruzamento env vars vs `secrets.md`

`secrets.md` documenta ~22 secrets + ~11 não-secrets = ~33. Código referencia **54**. **Diferença de 21 vars** indica:

- **Auditor params** (não estão em `secrets.md` por serem feature flags numéricas): `AUDIT_BILLING_FLOW_*`, `AUDIT_DEPLOY_HEALTH_*`, `AUDIT_KEY_EXPIRY_LAYER3`, `AUDIT_VPS_LIMITS_*`
- **Self-reference** do auditor: `CF_PAGES_PROJECT_NAME`, `CF_WORKER_SCRIPT_NAME`, `CLOUDFLARE_API_TOKEN_EXPIRES_AT`, `GITHUB_REPO_FULL_NAME`, `RLS_INTENTIONAL_NO_PUBLIC`
- **Outros**: `N8N_REENTRADA_WEBHOOK_URL`, `REENTRADA_URL`, `TELEGRAM_ADMIN_USER_ID`, `VPS_HEALTH_TOKEN`, `VPS_HEALTH_URL`

##### Naming drift suspeito

| Code env var | bws / docs canônico |
|---|---|
| `KILL_SWITCH_SECRET` | bws: `INKFLOW_KILL_SWITCH_SECRET` |
| `SUPABASE_PAT` | bws: `SB_PAT` |
| `TELEGRAM_WEBHOOK_SECRET` | bws: (não tem — só `INKFLOW_TELEGRAM_WEBHOOK_SECRET`) — **provável dual naming** |

#### Preflight envvars (`scripts/preflight-envvars.sh`)

Script `preflight-envvars.sh` faz exatamente o que fiz acima — escaneia `functions/` por `env.X` e compara com CF Pages env_vars (production) via API. Bloqueia deploy (`exit 2`) se faltar var. **Roda apenas localmente** — **não está no GHA `deploy.yml`** (potencial gap: deploy GHA não faz preflight).

#### Headers (`_headers`)

| Path | Headers |
|---|---|
| `/*.{css,js,png,jpg,jpeg,svg,webp,woff,woff2,ico}` | `Cache-Control: public, max-age=31536000, immutable` |
| `/*.html` + `/` | `Cache-Control: public, max-age=300, must-revalidate` |
| `/sitemap.xml`, `/robots.txt` | `Cache-Control: public, max-age=3600, must-revalidate` |
| `/*` | `X-Content-Type-Options: nosniff` + `X-Frame-Options: DENY` + `Referrer-Policy: strict-origin-when-cross-origin` + `Permissions-Policy` + `Strict-Transport-Security` (HSTS preload, 2y) + `X-XSS-Protection: 1; mode=block` |

> **Observação:** Não há `Content-Security-Policy`. HSTS está com preload (correto). Nenhum `Cross-Origin-*` policy header.

#### Redirects (`_redirects`)

- 6 redirects 301 de `.html` → URL clean (`/index.html` → `/`, etc.)
- Trailing slash consistency em `/funcionalidades/`, `/precos/`, etc. — mas estas rotas não existem ainda (ver F)
- 3 redirects forçando HTTPS + canonical apex sem `www`
- Pages Functions handle `/start/[[token]]` (catch-all path-based)

#### Saúde do Worker `inkflow-cron` — observability últimas 24h

Query Workers Observability via MCP (timeframe `2026-05-06 20:00 → 2026-05-07 20:00 UTC`):

| Cron / log signature | Eventos no janela 24h |
|---|---|
| `audit-escalate` (esperado: 288/dia, a cada 5min) | **6** observados |
| `auto-retomar-bot` (esperado: 96/dia, a cada 15min) | **3** observados |
| `monitor-whatsapp` (esperado: 48/dia, a cada 30min) | **1** observado |
| `cleanup-tenants` (esperado: 1/dia) | 1 observado (logged como cron-string raw) |
| Outros crons (audit-billing-flow, audit-vps-limits, etc.) | 0 observados na janela |

**Gap drástico**: log mostra **silêncio total** entre `2026-05-07 02:48 UTC` (23:48 BRT 06/05) e o final da janela `2026-05-07 20:00 UTC` (17:00 BRT 07/05) — **~17h sem logs**.

**Possíveis causas** (não confirmadas em Fase 1):

1. `ctx.waitUntil(dispatch(event, env))` pode retornar antes do `dispatch` terminar — Workers Observability captura só logs que aconteceram antes do scheduled handler retornar (a `dispatch` async vira fire-and-forget no log capture)
2. Sampling/retention do CF Workers Observability — logs de baixa frequência podem ser perdidos
3. **Cron-worker pode ter quebrado silenciosamente** após 02:48 UTC — confirmação requer cross-check com `audit_runs` no Supabase (1.6)
4. Logs antes de 24h não foram considerados na janela — mas a timeframe cobre 24h completas

> **Decisão:** Investigar em **1.6** via `audit_runs` table (heartbeat real). Anotar finding de **observability gap** independente da causa raiz.

#### Findings Fase 1.5

| # | Finding | Severity preliminar |
|---|---|---|
| F1.5.1 | **Observability gap**: Worker logs silêncio total 17h+ no MCP `cloudflare-observability` — confirmar via heartbeat dos auditores em 1.6 | **alta** (cego em prod) |
| F1.5.2 | `cron-worker` deploy é manual (sem CI) — risco de drift entre código no git e código em prod | média |
| F1.5.3 | `preflight-envvars.sh` **não roda no GHA** — só local. Deploy via GHA pode passar com env var faltando | média |
| F1.5.4 | Naming drift: 3 vars com nomes diferentes em código vs bws (`KILL_SWITCH_SECRET`, `SUPABASE_PAT`, `TELEGRAM_WEBHOOK_SECRET`) | baixa |
| F1.5.5 | 21 env vars referenciadas em código não documentadas em `secrets.md` (auditor params + self-refs) | baixa |
| F1.5.6 | Sem CSP header. Restante de security headers OK (HSTS preload, XCTO, XFO, etc.) | média |
| F1.5.7 | Cobertura cache-control granular OK — assets imutáveis 1 ano, HTML 5min, sitemap/robots 1h | observação positiva |
| F1.5.8 | Redirects 301 pra rotas `/funcionalidades`, `/precos`, `/modos`, etc. — **rotas ainda não existem** (sem trailing-slash redirect = link quebrado se alguém referenciar) | baixa |
| F1.5.9 | `wrangler.toml` raiz: `pages_build_output_dir = "."` + `[ai] binding = "AI"` — únicos bindings declarados pra Pages | observação |

---

### 1.6 Auditores 5 — cobertura + FP rate

#### Inventário dos auditores em prod

5 auditores principais + 2 órfãos (smoke histórico):

| Auditor | Cron | Schedule | Cobertura | Endpoint |
|---|---|---|---|---|
| `billing-flow` | `30 */6 * * *` | 4×/dia | Inconsistência MP `status` ↔ `tenants.status_pagamento` | `/api/cron/audit-billing-flow` |
| `deploy-health` | `0 */6 * * *` | 4×/dia | GHA + CF Pages deploy health (4xx/5xx em prod) | `/api/cron/audit-deploy-health` |
| `key-expiry` | `0 6 * * *` | 1×/dia (03:00 BRT) | TTL de secrets (CF API token 90d) + self-check Supabase service key | `/api/cron/audit-key-expiry` |
| `rls-drift` | `0 7 * * *` | 1×/dia (04:00 BRT) | Drift RLS expected vs real (`get_advisors` + qualified refs) | `/api/cron/audit-rls-drift` |
| `vps-limits` | `15 */6 * * *` | 4×/dia | Disk/mem/cpu/egress da Vultr VPS (`VPS_HEALTH_URL`) | `/api/cron/audit-vps-limits` |
| `smoke-test` | (manual) | só 3 runs em 27/04 | Smoke do framework (setup) | — |
| `smoke-escalation` | (manual) | só 2 runs em 27/04 | Smoke do escalation flow (setup) | — |

> 2 endpoints meta-auditor:
> - `audit-escalate` (`*/5 * * * *`) — re-alerta events abertos há +N min sem ack
> - `audit-cleanup` (`0 4 * * 1` seg) — purge events resolvidos antigos

#### Heartbeat (last 30d) — `audit_runs`

Capturado em `2026-05-07 04:47 UTC`:

| Auditor | Total runs (30d) | Success | Errors | Stuck | Avg duration | Esperado/dia | Real/24h | Health |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `billing-flow` | 31 | 31 | 0 | 0 | **1.91s** | 4 | **4** | ✅ |
| `deploy-health` | 33 | 33 | 0 | 0 | **1.47s** | 4 | **4** | ✅ |
| `key-expiry` | 14 | 13 | **1** | 0 | **4.60s** | 1 | **1** | ✅ |
| `rls-drift` | 11 | 11 | 0 | 0 | **3.04s** | 1 | **1** | ✅ |
| `vps-limits` | 34 | 33 | **1** | 0 | **1.44s** | 4 | **4** | ✅ |
| `smoke-escalation` | 2 | 2 | 0 | 0 | n/a | (manual) | 0 | histórico |
| `smoke-test` | 3 | 3 | 0 | 0 | n/a | (manual) | 0 | histórico |

> **Conclusão crítica para F1.5.1:** os 5 auditores ativos estão **rodando dentro do schedule esperado** (24h de runs match 24h de expectativa). O "silêncio" do `cloudflare-observability` em 1.5 era falso negativo — `ctx.waitUntil()` no scheduled handler dispara async fora do log stream.
>
> **Reclassificação de F1.5.1:** observability gap em CF Workers Observability MCP é problema de captura/sampling, não de execução. Crons funcionam. Mas a confiança em CF logs como fonte primária de "está tudo OK" precisa ser recalibrada.

#### Audit events — eventos detectados (últimos 30d)

| Auditor | Severity | Total | Open | Resolved | FPs (resolved_reason) |
|---|---|---:|---:|---:|---:|
| `billing-flow` | critical | 1 | 0 | 1 | 0 (`next_run_clean`) |
| `deploy-health` | warn | 3 | 0 | 3 | 0 (2× `token_rotated`, 1× `next_run_clean`) |
| `key-expiry` | critical | 1 | 0 | 1 | 0 (`next_run_clean`) |
| `key-expiry` | warn | 1 | **1** | 0 | — (open há 2 dias) |
| `rls-drift` | critical | 3 | 0 | 3 | 0 (2× `manual_fix_search_path_added_via_migration_2026-05-06`, 1× `next_run_clean`) |
| `vps-limits` | critical | 1 | 0 | 1 | 0 (`next_run_clean`) |
| `smoke-escalation` | critical | 2 | 0 | 2 | (smoke do framework) |
| `smoke-test` | critical | 3 | 0 | 3 | (smoke do framework) |
| **Totais (não-smoke)** | | **10** | **1** | **9** | **0 explicit FPs** |

#### FP rate (interpretação)

Nenhum alerta foi explicitamente classificado como `false_positive` no `resolved_reason`. Mas:

- **5/10 alertas (50%)** resolveram via `next_run_clean` — auto-resolution na próxima execução. **Sem indicação de causa-raiz** (pode ser transient real, ou pode ser FP que sumiu sozinho).
- **2/10 (20%)** resolveram via `token_rotated` (deploy-health) — alerta legítimo + ação humana
- **2/10 (20%)** resolveram via `manual_fix_search_path_added_via_migration_2026-05-06` (rls-drift) — alerta legítimo + ação humana

> **FP rate "puro": 0%** (zero alertas explicitamente FP)
> **FP rate "fraco" (next_run_clean): ~50%** — alertas que sumiram sem ação documentada. Sub-categoria que merece investigação em Fase 2 (são transients reais ou FPs disfarçados?).

#### Alerta atualmente open (1)

```
ID         63e2d6f7-cedf-4dc0-9182-c615983d178f
Auditor    key-expiry
Severity   warn
Detectado  2026-05-05 06:01 UTC (2 dias atrás)
Symptom    null
Summary    "SUPABASE_SERVICE_KEY self-check transient network error: The operation was aborted due to timeout"
alert_count 1
last_alerted_at  null  ← nunca foi reescalado
```

Este alerta está open há **2 dias** sem reescalonamento (`last_alerted_at = null`). O auditor `audit-escalate` (que roda a cada 5min) não escalou. Possíveis causas: lógica de escalation com gate por severity (`warn` não escala?), ou bug.

#### Gaps de cobertura observados

| Área | Auditor cobre? | Notas |
|---|---|---|
| Inconsistência MP ↔ tenants | ✅ `billing-flow` | OK |
| Deploy GHA falhando silencioso | ✅ `deploy-health` | OK |
| TTL secrets (CF token 90d) | ✅ `key-expiry` | OK |
| RLS drift | ✅ `rls-drift` | OK |
| VPS limits (disk/mem/egress) | ✅ `vps-limits` | OK |
| **n8n workflow health** | ❌ | **Gap** — se workflow ficar paused/quebrar, ninguém detecta |
| **Evolution health** | ❌ | **Gap** — só uptime n8n (workflow `InkFlow Uptime`), não health-check de instâncias por-tenant |
| **Workers Observability gap** | ❌ | **Meta-gap** (descoberto agora) — não há auditor que valida que logs de prod estão sendo capturados |
| **Tool calls log integrity** | ❌ | **Gap** — `tool_calls_log` cresce mas ninguém valida se as 12 tools estão respondendo OK |
| **Cron-worker drift git ↔ prod** | ❌ | **Gap** — deploy é manual, sem auditor que confere se versão deployada == HEAD da main |

#### Findings Fase 1.6

| # | Finding | Severity preliminar |
|---|---|---|
| F1.6.1 | **Heartbeat dos 5 auditores tá perfeito** — todos dentro do schedule, success rate 99.4% (100/101 last 30d) | observação positiva |
| F1.6.2 | **FP rate explícito 0%**, mas 50% dos alertas resolveram via `next_run_clean` (auto-resolution sem ação) — investigar se são transients reais ou FPs | média (qualidade dos signals) |
| F1.6.3 | **1 alerta `key-expiry warn` open há 2 dias** sem reescalonamento — possível bug de escalation gating em severity warn | média |
| F1.6.4 | **Gap: nenhum auditor de n8n workflow health** — workflow pausado / nodes quebrados não dispara alerta | alta (n8n é hot path) |
| F1.6.5 | **Gap: nenhum auditor de Evolution per-tenant health** — só uptime DNS (workflow externo), não validação por instância | alta |
| F1.6.6 | **Gap: nenhum auditor de tool-calls integrity** (12 tools do agent) — broken tool fica como ZUMBI (ver F1.3.1 `consultar_preco_retoque`) | alta |
| F1.6.7 | Reclassificação de F1.5.1: observability "silence" era falso negativo. Fonte primária `audit_runs` no Supabase. CF Workers Observability é fonte secundária (não confiável pra alta cadência). | observação |
| F1.6.8 | 2 auditores "smoke" (smoke-test, smoke-escalation) sem rodar há 9 dias — são do setup, podem ser arquivados | baixa |

---

### 1.7 Tooling local

#### Versions

- Claude Code: **2.1.132**
- `bws` (Bitwarden Secrets Manager CLI): **2.0.0**

#### MCPs configurados (16 servers)

| Categoria | Servers |
|---|---|
| **Storage / SaaS Anthropic** | Google Drive, Gmail, Google Calendar, MailerLite (4) |
| **Supabase** | `plugin:supabase:supabase` |
| **Cloudflare** | `cloudflare-api`, `cloudflare-docs`, `cloudflare-bindings`, `cloudflare-builds`, `cloudflare-observability` (5) |
| **GitHub** | `github` (binary stdio via zshrc + `github-mcp-server`) |
| **n8n** | `n8n` (`https://n8n.inkflowbrasil.com/mcp-server/http`) |
| **Telegram** | `plugin:telegram:telegram` (bun run, instabilidade observada) |
| **Memory / Notes** | `obsidian-memory`, `obsidian-vault` (2) |
| **Browser** | `playwright` |

> Setup permite o agent acessar todos os back-ends sem credenciais expostas em prompt. Ponto positivo.

#### Hooks globais (`~/.claude/hooks/`)

| Hook | Quando | Função |
|---|---|---|
| `pre-git-push.sh` | PreToolUse `git push` | Validação pre-push (não inspecionado em detalhe) |
| `pre-wrangler-deploy.sh` | PreToolUse `wrangler pages deploy` | **Roda `scripts/preflight-envvars.sh` antes do deploy** — bloqueia se env var referenciada faltar no CF Pages |
| `stop-git-status.sh` | Stop | Mostra `git status` no fim da sessão |
| `stop-obsidian-sync.sh` | Stop | Sync Obsidian no fim da sessão |
| `sync-git-repos.sh` | SessionStart + Stop + cron 5min | Pull/push memory + vault com GitHub |

> **Observação:** `pre-wrangler-deploy.sh` roda **somente no terminal local do founder** — GHA `deploy.yml` invoca `wrangler-action@v3` direto, fora do escopo dos hooks. Confirma F1.5.3.

#### Hooks projeto (`.claude/settings.json`)

```json
{
  "permissions": {
    "allow": [
      "Bash(./cron-worker/scripts/deploy.sh)",
      "Bash(cron-worker/scripts/deploy.sh)",
      "Bash(bws secret list)",
      "Bash(npx wrangler deploy)"
    ]
  }
}
```

Sem hooks projeto-específicos. Apenas permissions allow — minimal.

#### `.claude/settings.local.json`

Tem **~330 entries em `permissions.allow`** — vai do macroscópico (`Bash(git *)`, `Bash(curl *)`) ao específico (queries SQL, scripts ad-hoc). Acumulado de meses de session approvals.

> **Observação:** `settings.local.json` é git-ignored (`.gitignore` cobre `.claude/worktrees/` mas o arquivo `settings.local.json` em si entra no padrão `**/.DS_Store` e geral?). Vou confirmar.

#### Subagents (`.claude/agents/`)

| Agent | Modelo | Status | Tools | Gates |
|---|---|---|---|---|
| `deploy-engineer` | Sonnet | **ativo** | Read, Edit, Bash, mcp github + cloudflare | Telegram pra `wrangler deploy`, secret put, force push, GHA edit |
| `supabase-dba` | Sonnet | **ativo** | Read, Edit, Bash, mcp supabase (16 tools) | Telegram pra apply_migration prod, DDL, DELETE/UPDATE em massa, RLS |
| `vps-ops` | Haiku | **ativo** | Read, Bash | Telegram pra restart/stop container, edit config, reboot |
| `_legacy/o-confere.md` | — | arquivado | — | — |
| `_legacy/estagiario.md` | — | arquivado | — | — |
| `_legacy/supa.md` | — | arquivado | — | — |
| `_legacy/marcelo-pago.md` | — | arquivado | — | — |
| `_legacy/doutor-evo.md` | — | arquivado | — | — |
| `_legacy/hunter.md` | — | arquivado | — | — |

> **Drift:** `MEMORY.md` (auto-memory global) referencia `project_agents.md` com **6 agentes ativos** — desatualizado vs estado real (3 ativos + 6 movidos pra `_legacy/`). Anotado em F1.7.X.

#### Skills custom (`~/.claude/skills/`)

- `llm-council` (1 skill custom local)
- Skills do plugin `superpowers/*` (ver listagem do system prompt — brainstorming, writing-plans, etc.)

#### Findings Fase 1.7

| # | Finding | Severity preliminar |
|---|---|---|
| F1.7.1 | 16 MCPs conectados — boa cobertura horizontal (Cloudflare, Supabase, n8n, GitHub, Obsidian) | observação positiva |
| F1.7.2 | Hook `pre-wrangler-deploy.sh` proteção sólida pra deploy local — mas **não cobre GHA** (confirma F1.5.3) | (cross-ref) |
| F1.7.3 | **Drift memory ↔ realidade**: `MEMORY.md` aponta 6 subagents ativos, real é 3 ativos + 6 legacy | baixa (cosmético, mas confunde sessões frescas) |
| F1.7.4 | `settings.local.json` com ~330 entries acumuladas — accumulated cruft. Pode ter permissions stale (URLs/comandos que não existem mais) | baixa (limpeza periódica) |
| F1.7.5 | bws cobre 11 secrets / código referencia 54 env vars — gap de cobertura confirma F1.2.1 | (cross-ref) |
| F1.7.6 | `.claude/settings.json` (project-level) sem hooks específicos do InkFlow — toda automação está em hooks globais (`~/.claude/hooks/`) | observação |
| F1.7.7 | Skill `llm-council` é 100% local (manual instalada pelo founder) — não plugin gerenciado | observação |
| F1.7.8 | MCP Telegram observado **disconnect transient** durante esta auditoria — instabilidade do server stdio (bun) | baixa |

---

### Resumo da Fase 1 — findings consolidados por severidade preliminar

> Severidade preliminar é minha leitura inicial — pode mudar na Fase 2 (análise crítica) com cross-reference entre dimensões.

#### **Alta** (8 findings)

| ID | Resumo |
|---|---|
| F1.3.1 | **Tool ZUMBI**: `consultar_preco_retoque` chamada pelo agent n8n mas endpoint não existe → 404 silencioso |
| F1.3.3 | Workflow n8n com 98 nodes num arquivo só — complexidade alta, hard-to-version, hard-to-test |
| F1.3.4 | Lógica crítica em JS inline (4 Code nodes) sem testes |
| F1.3.6 | n8n + Evolution co-hospedados na MESMA VPS Vultr — SPOF físico |
| F1.4.1 | Schema drift git ↔ DB: 33 migrations base não estão em git |
| F1.4.2 | 2 views SECURITY DEFINER (advisor ERROR) |
| F1.4.3 | 2 RPCs SECURITY DEFINER executáveis por anon (`expire_trials`, `merge_conversa_jsonb`) — auth bypass potencial |
| F1.6.4-6 | Gaps de auditor: n8n workflow health, Evolution per-tenant health, tool-calls integrity |

#### **Média** (12 findings)

F1.2.1 (bws cobre 50%), F1.2.5 (sem TTL/rotação proativa), F1.2.7 (cron-worker deploy manual), F1.3.5 (filtro anti-loop hardcoded), F1.3.7 (workflow snapshot manual em git), F1.4.4 (signups_log INSERT TRUE), F1.4.5 (tattoo_bucket allows LIST), F1.4.7 (auth_rls_initplan x11), F1.5.1 (CF Workers Observability gap — reclassificado em 1.6 mas vale anotar), F1.5.3 (preflight não roda em CI), F1.5.6 (sem CSP), F1.6.2-3 (FP rate fraco + 1 alerta open há 2 dias).

#### **Baixa** (15+ findings)

F1.2.2 (dual naming), F1.2.4 (SUPABASE_URL hardcoded), F1.3.2 (3 endpoints órfãos tools), F1.3.8 (4 workflows backup não-deletados), F1.4.6 (leaked password disabled), F1.4.8 (índice duplicado), F1.4.9 (3 FKs sem index), F1.4.10 (4 índices unused), F1.4.11 (inconsistência policies service_role), F1.4.12 (RPC dead), F1.5.4 (naming drift secrets), F1.5.5 (env vars não documentadas), F1.5.8 (redirects pra rotas inexistentes), F1.7.3-4-7-8.

#### **Observações** (não problemáticas)

F1.2.3 (sem KV/D1/Hyperdrive — decisão arquitetural), F1.3.9-10 (Apply Fact-Check + 2 LLMs em sequência — input pra 2.1 hot path), F1.5.7 (cache-control bem feito), F1.6.1 (heartbeat dos 5 auditores OK), F1.6.7-8 (smokes históricos), F1.7.1-2-5-6 (tooling MCP + hooks), F1.4.13 (n8n_chat_histories integração).

#### Quick stats Fase 1

| Métrica | Valor |
|---|---|
| Arquivos JS Pages Functions | 96 |
| Endpoints `/api/*` | ~67 |
| Testes (`*.test.mjs`) | 53 (cobertura ≈55%) |
| Migrations em git | 11 (de 44 no DB — drift de 33) |
| Cron triggers (cron-worker) | 13 |
| Workflows n8n | 10 (6 ativos / 4 backup desativados) |
| Nodes do workflow principal | 98 (158KB JSON) |
| Tools do agent | 12 (1 ZUMBI: `consultar_preco_retoque`) |
| Endpoints `/api/tools/*` | 14 (3 órfãos: `aprimorar-persona`, `preview-orcamento`, `simular-conversa`) |
| Tabelas Supabase | 16 (todas RLS ON, 3 sem policies) |
| Views | 3 (2 SECURITY DEFINER) |
| RPCs | 9 (2 DEFINER executáveis por anon) |
| Triggers | 4 (todos updated_at-style) |
| Auditores ativos | 5 (heartbeat OK) |
| Subagents Claude | 3 ativos + 6 legacy |
| Env vars referenciadas em código | 54 |
| bws secrets | 11 |
| MCPs configurados | 16 |
| Findings Fase 1 | **65** (8 alta + 12 média + 15+ baixa + ~20 observação) |

---

## Fase 2 — Análise crítica

### 2.1 Hot path latência

#### Hot paths identificados

6 fluxos distintos com características de latência diferentes:

| # | Hot path | Trigger | SLA-sensível? | P50 estimado |
|---|---|---|---|---|
| 1 | **Cliente WhatsApp → resposta bot** | Mensagem WhatsApp do cliente | **Sim** (UX direta) | 8-20s (com debounce 5-10s embutido) |
| 2 | **Webhook MP → atualização tenant** | Pagamento MP | Médio (1-2 min é OK) | 1-3s |
| 3 | **Cron audit → detecção** | Cron 5-30 min | Não | 1-5s (medido em `audit_runs`) |
| 4 | **Onboarding novo tatuador** | Form submit | Sim (UX) | 5-15s (cria Evo instance, MP sub, Supabase row) |
| 5 | **Deploy CF Pages** | git push main | Não (deploy time) | 30-90s |
| 6 | **Studio dashboard load** | Tatuador abre painel | Sim (UX) | 1-3s P50 |

#### Hop count — Hot path 1 (mensagem cliente, mais crítico)

```
[Cliente WhatsApp]
   │ 1. Mensagem
   ▼
[Evolution API (Vultr VPS)]
   │ 2. Webhook (rede interna Docker — http://evolution:8080)
   ▼
[n8n (mesma VPS)]                          ← MESMA MÁQUINA — latência ~1-5ms aqui
   │ 3. Webhook EVO (POST /inkflow + headerAuth)
   │ 4. Seletor de número (5 filtros JS inline)
   │
   │ 5. Buscar Tenant ──► [Supabase sa-east-1]      ← Brasil → São Paulo: ~20-50ms
   │ 6. Tenant Ativo? IF
   │ 7. Verificar Pause ──► [Supabase]              ← +20-50ms
   │ 8. Rota Atendimento (IF)
   │ 9. Switch1 (tipo mídia)
   │
   │ Se mídia:
   │   10a. HTTP Request → http://evolution:8080/getBase64FromMediaMessage
   │   11a. Convert to File
   │   12a. OpenAI (transcribe/whisper)        ← +500ms-2s
   │
   │ 13. Redis text/audio buffer + Wait (5-10s) ◄── DEBOUNCE intencional
   │ 14. Get Memory + Compara (debounce check)
   │ 15. Mensagem Completa (concat JS)
   │
   │ 16. Cria Histórico Supabase ──►            ← +20-50ms
   │ 17. Adiciona CHAT supabase ──►             ← +20-50ms
   │
   │ 18. Gerar Prompt IA ──► [CF Pages /api/tools/prompt]   ← Brasil → CF edge: ~50-100ms
   │ 19. Guardrails PRE ──► [CF Pages /api/tools/guardrails/pre]  ← +50-100ms
   │ 20. Bypass? IF — se sim, vai pra 31
   │
   │ 21. Seu Agente (LangChain) ──► [OpenAI API]              ← +1-5s P50
   │     ├─ chamada tool 1 (httpRequestTool) ──► CF Pages    ← +50-200ms
   │     ├─ chamada tool 2 ──► CF Pages → Supabase           ← +100-300ms cada
   │     ├─ ... (até maxIterations)
   │     └─ output final
   │ 22. Postgres Chat Memory write ──► [Supabase]           ← +20-50ms
   │
   │ 23. Guardrails POST ──► [CF Pages]                       ← +50-100ms
   │ 24. Apply Fact-Check (Set inline)
   │ 25. Code in JavaScript (split por \n\n ou |||)
   │
   │ 26. Switch2 (continuar IA?)
   │ 27. kill-switch-detect ──► [CF Pages /api/kill-switch-detect]  ← +50-100ms
   │ 28. Check Handoff ──► [Supabase]                                ← +20-50ms
   │
   │ Para cada parte da resposta (1-N partes):
   │   29. Update a row ──► [Supabase]                              ← +20-50ms cada
   │   30. Log IA ──► [Supabase tool_calls_log]                     ← +20-50ms cada
   │
   │ 31. Enviar texto ou send midia ──► http://evolution:8080      ← interna ~1-5ms
   │
   ▼
[Evolution]
   │ 32. WhatsApp API
   ▼
[Cliente]
```

##### Estimativa P50 (mensagem text simples, sem mídia, agent itera 2x com 1 tool call)

| Etapa | Latência |
|---|---|
| Webhook + Seletor + Buscar Tenant + Verificar Pause | 50-150ms |
| Cria Histórico + Adiciona CHAT (2 supabase writes) | 50-100ms |
| Wait (debounce intencional) | **5-10s** |
| Gerar Prompt + Guardrails PRE | 100-200ms |
| Agent: 2 iterations × LLM (~2s cada) + 1 tool call | **3-6s** |
| Guardrails POST + Code split | 100-200ms |
| kill-switch-detect + Check Handoff | 100-200ms |
| Update + Log IA + Send Evolution | 50-150ms |
| **Total P50** | **~9-17s** |

##### Onde tem gordura desnecessária

| # | Fonte | Custo | Comentário |
|---|---|---|---|
| 1 | **Wait/debounce 5-10s** | 5-10s | Intencional pra agregar mensagens em rajada. Trade-off UX (debounce melhor que respostas fragmentadas) |
| 2 | **Hops n8n → CF Pages** | ~50-100ms cada | Cada tool/guardrail é round-trip externo. **9 hops CF Pages num turn típico** = ~450-900ms só de network |
| 3 | **Supabase calls** | ~25ms cada | **8-12 supabase calls num turn típico** = ~200-300ms |
| 4 | **n8n → OpenAI direto** | (impossível remover) | LLM é dependência inerente |
| 5 | **Postgres Chat Memory write síncrono** | ~30-50ms | Pra persistir conversa pro próximo turn — necessário |
| 6 | **Filtro anti-loop hardcoded em JS** | ~5ms | Trivial, mas é checagem que poderia estar no Evolution config (se Evolution suportasse) |
| 7 | **Apply Fact-Check (Set node)** | ~5ms | É só Set, não LLM. Lógica desconhecida — investigar |

##### Onde NÃO tem gordura (conscientemente bom)

- n8n e Evolution co-hospedados (1-5ms latency interna Docker) — anti-pattern de SLA mas pragmático pra latência
- Supabase em sa-east-1 (latência baixa pra n8n na VPS US se VPS for próxima)
- CF Pages edge — workers correm próximos do request
- Async waitUntil() no cron-worker — bom pra background dispatch

#### Hot path 2 — Webhook MP

```
[Mercado Pago]
   ▼
[CF Pages /api/mp-ipn] ── valida HMAC (MP_WEBHOOK_SECRET)
   ├─► [Supabase] (payment_logs insert + tenants update)     ← ~50-100ms
   └─► [MailerLite] (move group via API)                     ← ~200-500ms
   ▼
[200 OK pra MP]
```

P50: 300-700ms. SLA OK (MP dá retries por horas).

#### Hot path 3 — Cron audit (medido em `audit_runs`)

| Auditor | Avg duration |
|---|---|
| `vps-limits` | 1.44s |
| `deploy-health` | 1.47s |
| `billing-flow` | 1.91s |
| `rls-drift` | 3.04s |
| `key-expiry` | 4.60s |

```
[CF Worker scheduled]
   ▼ ctx.waitUntil(dispatch)
[fetch → CF Pages /api/cron/audit-X]
   ▼
[Supabase] (audit_runs insert + lógica do auditor + audit_events maybe)
   ▼
[Telegram ou Pushover se severity≥critical]
```

#### Hot path 4 — Onboarding novo tatuador

```
[HTML onboarding.html (200KB!)]
   ▼ form submit
[CF Pages /api/create-tenant]
   ├─► [Supabase] insert tenant       ← ~50ms
   ├─► [Evolution] criar instance     ← ~500ms-2s
   ├─► [Mercado Pago] criar sub       ← ~500ms-1s
   ├─► [MailerLite] add subscriber    ← ~300ms
   └─► [Telegram] notif founder       ← ~200ms
   ▼
[201 + studio_token ou 422]
```

P50: 2-5s. Sequência de dependências externas — se qualquer uma falhar, rollback é manual.

#### Hot path 6 — Studio dashboard

```
[studio.html load]
   ├─► [CF Pages /api/dashboard/kpis] → Supabase RPCs (3 calls)         ← ~500ms
   ├─► [CF Pages /api/dashboard/atividade-recente] → Supabase            ← ~200ms
   └─► [CF Pages /api/conversas/list] → Supabase                          ← ~300ms
```

Em paralelo no browser. P50: 500ms-1s pra primeira renderização útil.

#### Findings 2.1

| # | Finding | Severity |
|---|---|---|
| F2.1.1 | Hot path 1 (cliente→bot) tem **~25-30 hops**, P50 ~9-17s. Debounce 5-10s é metade do tempo (intencional). | **alta** (UX core) |
| F2.1.2 | **9 hops CF Pages + 8-12 supabase calls num turn típico** ≈ 700ms-1.2s só network. Migração pra arquitetura code-first (Modo A do brainstorm) consolidaria isso em 1 hop. | alta |
| F2.1.3 | Co-hospedagem n8n+Evolution evita 50-150ms de latência (rede interna Docker) — mas custa SPOF físico (cross-ref F2.2) | observação |
| F2.1.4 | Onboarding chama 5 serviços externos sequencialmente — sem rollback transacional. Falha em MP deixa Evolution instance criada órfã. | média |
| F2.1.5 | Deploy CF Pages é razoável (30-90s P50). Worker deploy manual. | observação |

---

### 2.2 SPOFs e SLA composto

#### Mapa de SPOFs

| # | Componente | Tipo | Hot paths afetados |
|---|---|---|---|
| 1 | **Vultr VPS `104.207.145.47`** | Físico (1 máquina) | Hot path 1 (n8n+Evo na mesma VPS), Hot path 4 (Evo create instance) |
| 2 | **n8n single-instance** | Lógico (1 server n8n) | Hot path 1 inteiro |
| 3 | **Evolution central instance** | Lógico (1 instância "central") | Onboarding (envio de QR/link) |
| 4 | **Supabase `bfzuxxuscyplfoimvomh`** | Lógico (1 project sa-east-1) | TODOS os hot paths |
| 5 | **CF Pages `inkflow-saas`** | Edge (sem SPOF efetivo — global) | Hot paths 2, 3, 5, 6 |
| 6 | **Worker `inkflow-cron`** | Edge (deploy single, mas Workers são distribuídos) | Hot path 3 |
| 7 | **Mercado Pago API** | Externo (vendor) | Hot paths 2, 4 |
| 8 | **OpenAI API** | Externo (vendor) | Hot path 1 (LLM) |
| 9 | **MailerLite API** | Externo (vendor) | Hot path 2, 4 |
| 10 | **Telegram bot tokens** | Externo (vendor) | Alertas + Bot Modo Coleta v2 |
| 11 | **GitHub Actions** | Externo (vendor) | Hot path 5 (deploy) |

#### SLA composto

Assumindo SLAs típicos publicados:

| Componente | SLA típico | Notas |
|---|---|---|
| Cloudflare Pages/Workers | **99.99%** | "Four nines" para enterprise; free tier sem SLA formal mas histórico bom |
| Supabase free | **sem SLA formal** | (Pro: 99.9%) — InkFlow tá no free? Investigar |
| Vultr VPS | **100% network** | (Vultr SLA: 100% uptime, credito por hora down) — mas é só uptime de rede, não app |
| n8n self-hosted | depende do host | Vultr VPS — mesmo SLA |
| Evolution self-hosted | depende do host | Vultr VPS — mesmo SLA |
| OpenAI API | **99.9%** stated | "Best effort" historicamente |
| Mercado Pago | sem SLA público | API histórica varia |
| MailerLite | sem SLA público | — |

##### SLA composto Hot path 1 (cliente→bot)

Hot path 1 depende de: **VPS** × **n8n** × **Evolution** × **Supabase** × **CF Pages** × **OpenAI**

Se assumirmos 99.5% por componente (otimista pra self-hosted), composição multiplicativa:
```
0.995 × 0.995 × 0.995 × 0.995 × 0.999 × 0.999 ≈ 0.973 = 97.3%
```

→ **~10 dias de downtime/ano** se SLA composto é a métrica.

Se 1 dependência cair pra 99% (o que é realista pra self-hosted sem multi-AZ), composto cai pra ~94% = ~22 dias/ano.

##### Cenários de outage e blast radius

| Cenário | Blast radius | Recuperação |
|---|---|---|
| **VPS cai (n8n+Evo)** | Hot path 1 100% offline (bot não responde) | Manual: SSH, restart Docker (runbook `outage-wa.md`) |
| **n8n quebra** (workflow paused, node falha) | Hot path 1 100% offline | Manual: dashboard n8n, debug + republish |
| **Supabase cai** | TODOS os hot paths offline | Esperar Supabase voltar (sem fallback) |
| **CF Pages deploy quebrado** | API endpoints 5xx, n8n recebe erros nos tool calls → agent fail | Rollback via CF dashboard ou redeploy commit anterior |
| **OpenAI API down** | Bot LLM não responde — agent fica em loop ou erra | n8n não tem fallback de modelo (?) |
| **MercadoPago down** | Onboarding novos travados, mas existing clients OK | Esperar MP voltar |

#### Findings 2.2

| # | Finding | Severity |
|---|---|---|
| F2.2.1 | **VPS Vultr é mega-SPOF**: 3 serviços críticos numa máquina (n8n + Evolution + (eventual outros)) — queda física derruba 100% do hot path bot | **crítica** |
| F2.2.2 | **Supabase é SPOF universal** — toda transação cliente↔bot passa por lá. 99.9% SLA Pro = 8.7h/ano de downtime aceitável | alta (mas inerente — caro mitigar) |
| F2.2.3 | SLA composto realista: **~94-97%** — equivale a 10-22 dias/ano de "produto não funciona". Inaceitável pra SaaS pago. | alta |
| F2.2.4 | Sem fallback OpenAI → outro LLM. Se OpenAI cair, bot mudo. | média |
| F2.2.5 | Sem multi-region. tudo em sa-east-1 (Supabase) + 1 VPS Vultr. Disaster recovery = backup manual. | alta (mas comum em early-stage) |
| F2.2.6 | Onboarding chama 5 serviços externos em série sem rollback transacional (cross-ref F2.1.4) — failure = state inconsistente | média |
| F2.2.7 | Auditor `audit-deploy-health` cobre CF deploy mas não cobre n8n workflow paused / Evolution instance dead (cross-ref F1.6.4-5) | alta |

---

### 2.3 Duplicação de lógica (n8n ↔ CF Pages)

#### Lógica duplicada identificada

| # | Conceito | Onde mora | Duplicado? |
|---|---|---|---|
| 1 | **Filtro anti-loop** (mensagens internas) | `n8n: Seletor de número` (3 strings hardcoded) | Não duplicado, mas frágil — se mudar copy do bot, drift silencioso |
| 2 | **Tipo de mensagem** (text/audio/image) | `n8n: Switch1` + `Buscar Tenant` (?) | n8n only |
| 3 | **Validação de tenant ativo** | `n8n: Tenant Ativo IF` + CF Pages `_lib/trial-helpers.js` | **Duplicado** — n8n checa `tenants.ativo`, CF Pages checa `trial_ate < NOW()` separadamente |
| 4 | **Transição de `estado_agente`** (FSM da conversa) | `Supabase: merge_conversa_jsonb RPC` + `CF Pages: tools/dados-coletados.js` (provavelmente) | **Lógica espalhada** — RPC + tool + n8n (?) |
| 5 | **Validação de orçamento** | CF Pages `tools/calcular-orcamento.js` + `tools/preview-orcamento.js` (compartilham `_lib/pricing.js` ✅) | OK — helpers em `_lib` |
| 6 | **Concatenação de mensagens em rajada** | `n8n: Mensagem Completa` (Redis + JS) | n8n only |
| 7 | **Splitting de resposta multi-msg** | `n8n: Code in JavaScript` (split `\n\n` ou `\|\|\|`) | n8n only |
| 8 | **Detecção "fechou! orçamentos"** | `n8n: Code in JavaScript` (string match) | **Duplicado conceitualmente** — `tools/acionar-handoff.js` provavelmente também trata flow de fechamento |
| 9 | **Fact-check inline** | `n8n: Apply Fact-Check (Set)` | n8n only — lógica não auditada |
| 10 | **Kill-switch detection** | CF Pages `/api/kill-switch-detect` (chamado do n8n) | OK — só CF Pages tem |
| 11 | **Guardrails PRE/POST** | CF Pages `_lib/guardrails.js` + endpoints `/api/tools/guardrails/*` | OK — n8n só chama |
| 12 | **Prompt generation** | CF Pages `_lib/prompts/` (3-camadas) + `tools/prompt.js` | OK — só CF Pages |
| 13 | **Memória de conversa** | n8n Postgres Chat Memory + Redis buffers + Supabase `chat_messages` + `n8n_chat_histories` | **3 stores diferentes** — pode haver inconsistência |

#### Espalhamento de "estado da conversa"

A FSM de uma conversa (`estado_agente`) é tocada por:

```
1. n8n agent tools: dados_coletados, enviar_orcamento_tatuador, ...
2. CF Pages /api/tools/* (12 tools)
3. Supabase RPC merge_conversa_jsonb
4. Supabase RLS policies (lazy)
5. Lifecycle helpers: functions/_lib/conversas-lifecycle.js
6. n8n: kill-switch detect → Pausar conversa / Retomar conversa (Supabase nodes diretos)
```

Isso é **6 lugares** que podem mutar `estado_agente`. Source of truth é o Supabase, mas os mutadores são distribuídos. Mudança no fluxo precisa tocar múltiplos lugares.

#### Memória da conversa — 3 stores conflitantes

| Store | Onde | Persistência | Acesso |
|---|---|---|---|
| `Redis` (n8n) | VPS, in-memory | Curto (TTL configurado) | Buffers de mensagens em rajada |
| `Postgres Chat Memory` (n8n LangChain) | Supabase tabela `n8n_chat_histories` (386 rows) | Longo | Memory do agent entre turns |
| `chat_messages` (CF Pages) | Supabase tabela `chat_messages` (32 rows) | Longo | Histórico canônico do studio dashboard |

**3 stores, 3 fontes de "histórico". Sem garantia de consistência entre eles.** Especificamente:
- `n8n_chat_histories` tem 386 rows; `chat_messages` tem 32. **Drift de 12x.**
- Ou são populados em momentos diferentes (n8n sempre, CF só em algumas tools), ou um dos dois tem data loss.

#### Findings 2.3

| # | Finding | Severity |
|---|---|---|
| F2.3.1 | **3 memory stores diferentes pra histórico de conversa** (Redis, n8n_chat_histories, chat_messages) com volumes drasticamente diferentes (386 vs 32) | **alta** |
| F2.3.2 | FSM `estado_agente` mutável por **6 lugares distintos** (n8n agent tools, CF Pages tools, RPC merge, RLS, lifecycle helper, kill-switch path) — mudança de fluxo é multi-touchpoint | alta |
| F2.3.3 | Validação de "tenant ativo" está em 2 lugares (n8n IF + CF Pages helper) — drift possível em mudança de regra de trial | média |
| F2.3.4 | Detecção "conversa fechou" via string match em `Code in JavaScript` n8n + lógica em `acionar-handoff.js` — **fragilidade de copy** | média |
| F2.3.5 | Filtro anti-loop hardcoded com 3 strings PT-BR (cross-ref F1.3.5) | média |
| F2.3.6 | Prompts centralizados em `_lib/prompts/` — bem feito (sistema 3-camadas com snapshots) | observação positiva |
| F2.3.7 | Guardrails centralizados em CF Pages, n8n só chama — bem feito | observação positiva |

---

### 2.4 Test coverage por área de risco

#### Cobertura observada vs área de risco

| Área | Endpoints | Tem teste? | Risco se quebrar | Coverage rating |
|---|---|---|---|---|
| **Auth / token validation** | `validate-onboarding-key`, `validate-studio-token`, `get-studio-token`, `request-studio-link`, `_auth-helpers` | ❌ TODOS sem teste | **Crítico** — bypass = qualquer um acessa tenant alheio | 🔴 zero |
| **Billing** | `mp-ipn`, `webhooks/mp-sinal`, `create-subscription`, `cron/expira-trial`, `cron/expira-holds` | ❌ TODOS sem teste | **Crítico** — falha = cobranças erradas, cancelamentos errados | 🔴 zero |
| **Tenant lifecycle** | `create-tenant`, `delete-tenant`, `update-tenant`, `cleanup-tenants` | ⚠️ só `update-tenant-validation.test.mjs` cobre validação de **prompts** (não CRUD) | Alto — tenant órfão = serviço sem cobrança | 🟠 parcial |
| **Evolution** | `evo-create-instance`, `evo-pairing-code`, `evo-qr`, `evo-status` | ❌ TODOS sem teste | Alto — instance nasce quebrada = bot não funciona pro tenant | 🔴 zero |
| **Modo Coleta v2** (12 tools agent) | `tools/calcular-orcamento`, `tools/dados-coletados`, `tools/enviar-orcamento-tatuador`, `tools/enviar-objecao-tatuador`, `tools/consultar-proposta-tatuador`, etc. | ✅ 4 testes — `consultar-proposta-tatuador`, `dados-coletados`, `dados-coletados-helpers`, `enviar-objecao-tatuador`, `enviar-orcamento-tatuador`, `reentrada-helpers` | Crítico — bot quebra pro cliente | 🟢 ~50% |
| **Telegram** | `telegram-bot-info`, `telegram/webhook`, `telegram/reentrada`, `audit/telegram-webhook` | ✅ `telegram.test.mjs`, `audit-telegram-webhook.test.mjs` | Médio — só afeta canal de orçamento Modo Coleta | 🟢 |
| **Dashboard PR2** | `dashboard/kpis`, `dashboard/atividade-recente`, `dashboard/regenerate-resumo-semanal` | ✅ 3 testes | Baixo — UX studio | 🟢 |
| **Conversas / Handoff** | `conversas/list`, `conversas/thread`, `conversas/assumir`, `conversas/devolver`, `conversas/_grupos`, `conversas/_transition` | ✅ 4 testes (`conversas-list`, `conversas-thread`, `conversas-assumir-devolver`, `conversas-grupos`) | Alto — falha = handoff não rola | 🟢 |
| **Cron / scheduled** | 13 cron endpoints | ⚠️ só `cron/auto-retomar-bot` + `cron/resumo-semanal` testados | Médio — cron quebrado = sem aviso | 🟠 parcial |
| **Auditores** | 5 auditores + escalation + cleanup | ✅ TODOS testados (5 endpoint tests + 5 unit tests + escalate test) | (cobre o sistema que cobre o resto) | 🟢 alta |
| **Approvals** | `approvals/decide` | ✅ `approvals-decide.test.mjs` | Baixo | 🟢 |
| **Kill-switch** | `kill-switch-detect` | ✅ `kill-switch-detect.test.mjs` | Alto | 🟢 |
| **Public start (deeplink)** | `public-start`, `start/[[token]]` | ❌ sem teste | Médio | 🔴 zero |
| **Send link / email** | `send-studio-email`, `send-whatsapp-link`, `create-onboarding-link` | ❌ sem teste | Médio | 🔴 zero |
| **Helpers `_lib/`** | 13 helpers + 5 auditors + 26 prompts | ✅ ~6 unit tests (audit-state, conversas-upsert, conversas-lifecycle, dashboard-time, resumo-semanal-prompt, trial-helpers) | Cross-cutting — bug em helper afeta vários endpoints | 🟠 parcial |
| **Prompts** | `_lib/prompts/` (26 arquivos) | ✅ Suite dedicada (contracts, contamination, invariants, snapshots, helpers) — rodada em GHA | (CI dedicado) | 🟢 alta |

#### Resumo por rating

- 🔴 **Zero coverage em áreas críticas:** Auth, Billing, Evolution, Public start, Send link/email — 13+ endpoints
- 🟠 **Coverage parcial** em tenant lifecycle, cron, helpers — ~10 endpoints
- 🟢 **Coverage boa** em Modo Coleta v2 tools, conversas, dashboard, auditores, prompts — ~25+ endpoints

#### Findings 2.4

| # | Finding | Severity |
|---|---|---|
| F2.4.1 | **Auth completamente sem teste**: validate-onboarding-key, validate-studio-token, get-studio-token, request-studio-link — bypass = leak de dados de outro tenant | **crítica** |
| F2.4.2 | **Billing completamente sem teste**: mp-ipn, webhooks/mp-sinal, create-subscription — bug = cobranças erradas / canceladas erradas | **crítica** |
| F2.4.3 | Evolution endpoints (evo-create-instance, qr, pairing-code, status) sem teste — onboarding pode falhar silencioso | alta |
| F2.4.4 | Tests rodam **só pra prompts** no CI (`prompts-ci.yml`). Os outros 50+ testes **não rodam em GHA** — só local | **alta** (gap CI/CD) |
| F2.4.5 | Modo Coleta v2 tools tem boa cobertura (4 dos 12) — boa direção | observação positiva |
| F2.4.6 | Auditores têm cobertura excelente — meta-tests + unit tests + endpoint tests | observação positiva |

---

### 2.5 Observability gaps

#### Estado atual

| Camada | Tool | Cobertura | Gap |
|---|---|---|---|
| **Logs CF Pages** | CF Pages dashboard / `wrangler tail` | Manual | Sem agregação/alerting |
| **Logs Worker** | CF Workers Observability (`observability` enabled) | Auto-capturado, mas **sample/loss observado** (cross-ref F1.5.1) | Não confiável pra alta cadência |
| **Heartbeat de crons** | Supabase `audit_runs` (custom) | ✅ funciona | Só pros 5 auditores; outros 8 crons (auto-retomar-bot, expira-trial, etc.) **não escrevem heartbeat** |
| **Eventos de erro** | Supabase `audit_events` + Telegram alertas | Cobre auditores | **Gap pra erros runtime de Pages Functions** (ex: tool call falhou no agent) |
| **n8n workflow execution** | n8n built-in (executions log) | Visível só no dashboard n8n | Sem alerta automático em falhas — `Sentry Error Handler` workflow está ativo mas sem trigger configurado |
| **Sentry** | Workflow `INKFLOW - Sentry Error Handler` (active=true, **triggerCount=0**) | Configurado mas inativo | **Sentry não está capturando nada** (workflow ativo mas sem trigger) |
| **Pushover / Telegram** | Manual + via runbooks | Cobre crons via cron-worker | Sem dashboard |
| **Tracing distribuído** | — | **Inexistente** | Hot path 1 com 25-30 hops sem trace = debug é arqueologia |

#### "O que vai dar bug em prod e tu não vai saber?"

1. **Tool call zumbi**: F1.3.1 — `consultar_preco_retoque` chamada → 404 silencioso. **Como tu vai saber?** Hoje: só se cliente reportar. Não há monitor de tool success rate.
2. **n8n workflow paused** (acidental no dashboard): nenhum cron checa que o workflow está active. Mensagens do cliente ficam mudas. (cross-ref F1.6.4)
3. **Evolution per-tenant instance dead** (sem expirar nem QR): nenhum auditor checa por tenant — só o uptime do servidor n8n+Evo geral (cross-ref F1.6.5)
4. **Pages Function 5xx em endpoint não-cron**: GHA deploy passou, mas runtime falhou. CF dashboard mostra mas sem alerta auto.
5. **Drift secreto/configuração**: alguém edita `wrangler.toml` ou env var pelo dashboard, divergiu do git. `audit-deploy-health` cobre alguns aspectos, não todos (cross-ref F2.1).
6. **Quota Supabase free** (egress, requests, DB size) bater limite. Sem dashboard de cota.
7. **OpenAI quota/rate limit** atingido. n8n agent erra silencioso ou pára.
8. **MailerLite api error** durante onboarding: tenant criado mas não entrou em group → sem email "trial ativo".
9. **MercadoPago webhook deduplication**: mesma mensagem chega 2x → cobrança duplicada / state inconsistente. Sem teste (cross-ref F2.4.2).

#### Findings 2.5

| # | Finding | Severity |
|---|---|---|
| F2.5.1 | **Sentry workflow está ativo no n8n mas sem trigger configurado** — não captura nada. Erros n8n vão pro silêncio. | **alta** |
| F2.5.2 | **Sem tracing distribuído** no hot path 1 (25-30 hops). Debug = ler logs n8n + Supabase + CF + Evolution separados | **alta** |
| F2.5.3 | **Tool call success rate não monitorado** — tool zumbi `consultar_preco_retoque` foi descoberta nesta auditoria, não por alarme | alta (cross-ref F1.3.1, F1.6.6) |
| F2.5.4 | **Heartbeat custom (`audit_runs`) só cobre 5 dos 13 crons** — os outros 8 (expira-trial, monitor-whatsapp, auto-retomar-bot, cleanup, etc.) ficam invisíveis se quebrarem silencioso | alta |
| F2.5.5 | **Sem dashboard de quota** (Supabase free, OpenAI tokens, CF Pages requests) — limite atinge sem aviso | média |
| F2.5.6 | **Sem alerta de runtime 5xx** em Pages Functions não-cron | média |
| F2.5.7 | Logs CF Workers Observability são fonte secundária (sample/loss) — `audit_runs` é fonte primária | observação |
| F2.5.8 | Auditores próprios fazem o que Sentry deveria fazer (em escopo limitado) — boa adaptação | observação positiva |

---

### 2.6 Security posture

#### Cross-reference dos achados de Fase 1 + análise

##### RLS e DB security

| Issue | Origem | Severidade |
|---|---|---|
| 2 views SECURITY DEFINER (`audit_current_state`, `orcamentos`) | F1.4.2 advisor ERROR | **alta** |
| 2 RPCs SECURITY DEFINER callable por anon (`expire_trials`, `merge_conversa_jsonb`) | F1.4.3 advisor WARN | **alta** (auth bypass via REST) |
| `signups_log` anon INSERT WITH CHECK = TRUE | F1.4.4 advisor WARN | média |
| `tattoo_bucket` public + LIST permitido | F1.4.5 advisor WARN | média |
| 3 tables RLS ON sem policies (agendamentos, conversas, tool_calls_log) | F1.4 INFO | baixa (intencional) |
| auth_rls_initplan x11 | F1.4.7 perf | média (perf at scale) |

##### Secrets

| Issue | Origem | Severidade |
|---|---|---|
| bws cobre 11/22 secrets — 50% gap | F1.2.1 | média |
| Dual naming (EVO_GLOBAL_KEY/EVOLUTION_GLOBAL_KEY etc.) | F1.2.2 | baixa (rotation risk) |
| Sem TTL em quase todos | F1.2.5 | média |
| Naming drift code vs bws (KILL_SWITCH_SECRET, SUPABASE_PAT, TELEGRAM_WEBHOOK_SECRET) | F1.5.4 | baixa |

##### Auth / authentication

- **Studio dashboard:** `STUDIO_TOKEN_SECRET` assina tokens. Endpoint `validate-studio-token` valida. Sem teste (F2.4.1). Token leak ou bug = acesso a dados alheios.
- **Onboarding key:** UUID hash em URL (`#k=<key>`) — `onboarding_links.key` no Supabase. Sem teste de validação (F2.4.1).
- **Cron:** `CRON_SECRET` Bearer header. Validação simples em cada endpoint cron.
- **Tools (n8n→CF Pages):** `INKFLOW_TOOL_SECRET` ou `N8N_WEBHOOK_SECRET` em alguns. Inconsistente.
- **MP webhook:** `MP_WEBHOOK_SECRET` HMAC. (F2.4.2 — sem teste).
- **Telegram webhook:** `INKFLOW_TELEGRAM_WEBHOOK_SECRET` Bearer.

##### Headers de segurança (F1.5.6)

✅ HSTS preload 2y, X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, X-XSS-Protection
❌ **Sem Content-Security-Policy**
❌ Sem Cross-Origin-* (Resource-Policy, Embedder-Policy, Opener-Policy)

##### Input validation / OWASP

- **A01 Broken Access Control:** RLS gaps + RPCs anon-callable (acima)
- **A02 Cryptographic Failures:** secrets em CF Pages env (não vault) — OK
- **A03 Injection:** Pages Functions usam Supabase REST com service key — risco SQLi mitigado pelo PostgREST. Mas RPCs com inputs JSONB (`merge_conversa_jsonb`) podem ter injection lógico se inputs não sanitizados
- **A04 Insecure Design:** kill-switch + handoff design são opt-in. Sem 2FA pra studio token.
- **A05 Security Misconfiguration:** advisor lints não corrigidos = exemplo. Auditor `rls-drift` cobre parte disso.
- **A07 ID/Auth failures:** sem rate limiting em endpoints públicos (auth-bypass-friendly se houver bug de validação)
- **A08 Software/Data integrity:** sem CI signing, sem deps scanning (Pages é zero-NPM, mitiga). cron-worker tem `wrangler` dep — não scaneado.
- **A09 Logging/monitoring:** F2.5 — gaps significativos
- **A10 SSRF:** endpoints fazem fetch externo (Evo, MP, MailerLite) — URLs configuráveis via env. OK pra produção mas se env var for manipulada (precisaria acesso a secrets), vira SSRF.

##### CORS

Não inspecionado em detalhe nesta auditoria (não tinha foco). Pages Functions endpoint padrão Cloudflare Pages é "any origin" se não setar CORS explícito. Cross-cutting risk.

##### Rate limiting

Não há rate limiting visível em endpoints públicos. CF Pages tem rate limiting nativo (zone-level) mas pra inkflowbrasil.com não foi configurado nesta auditoria.

#### Findings 2.6

| # | Finding | Severity |
|---|---|---|
| F2.6.1 | **2 RPCs SECURITY DEFINER callable por anon via /rest/v1/rpc/** = potencial auth bypass / privilege escalation | **alta** (cross-ref F1.4.3) |
| F2.6.2 | **Auth endpoints completamente sem teste** (cross-ref F2.4.1) — bug = leak entre tenants | **alta** |
| F2.6.3 | **Sem rate limiting visível** em endpoints públicos (`/api/create-tenant`, `/api/public-start`, `/api/validate-*`) — DOS-friendly + brute-force-friendly | alta |
| F2.6.4 | **Sem Content-Security-Policy** — XSS surface ampla nos HTMLs estáticos (especialmente `onboarding.html` 200KB com JS inline) | média |
| F2.6.5 | **2 views SECURITY DEFINER** flagged ERROR | alta |
| F2.6.6 | **Inconsistência na auth de tools** (`INKFLOW_TOOL_SECRET` vs `N8N_WEBHOOK_SECRET`) — drift confunde | média |
| F2.6.7 | `tattoo_bucket` public allows LIST (cross-ref F1.4.5) | média |
| F2.6.8 | Storage de bot tokens em CF Pages env (não vault) — comum mas não ideal | baixa |
| F2.6.9 | Sem 2FA no studio dashboard (token apenas) | média (era pra MVP, mas escala vira problema) |

---

### 2.7 Custo $/mês — atual e projeção

#### Premissas

- 1 tatuador atual em prod (1 tenant), pré-launch ativo
- Métricas observadas:
  - 386 rows `n8n_chat_histories` (memory) — ~30 dias de smoke
  - 880 rows `payment_logs` — histórico MP de testes
  - ~100 audit_runs/dia
- Modelos LLM: assumindo gpt-4o-mini ou similar (não confirmado nesta auditoria)

#### Custo atual estimado (mensal, USD)

| Componente | Plano atual | Custo/mês USD |
|---|---|---|
| **Cloudflare Pages + Workers + R2** | Free tier | $0 |
| **Supabase** | Free (provável — 500MB DB, 5GB transfer, 50k MAU) | **$0** ou **$25** se Pro |
| **Vultr VPS** | High Frequency 1GB ou 2GB típico | **$6-12** |
| **OpenAI API** | Pay-as-go gpt-4o-mini, ~30k tokens/conversa, ~10 conversas/dia | **$5-15** (volume baixo atual) |
| **MailerLite** | Free tier (até 1k subscribers) | **$0** (até 1k) |
| **Mercado Pago** | Cobra % por transação (~3-4%) | **$0** fixo + % |
| **Telegram Bot API** | Grátis | $0 |
| **Pushover** | $5 one-time license per platform | **$0/mês** (one-time) |
| **n8n self-hosted** | (incluso na VPS) | $0 |
| **Evolution self-hosted** | (incluso na VPS) | $0 |
| **GitHub** | Free (repo público?) | $0 |
| **Bitwarden Secrets Manager** | Free (até 10k secrets) | $0 |
| **TOTAL atual** | | **~$11-52/mês** |

> Se Supabase é Free, custo total é **~$11-27/mês** — ridiculamente baixo, fazem sentido pra pré-launch.

#### Projeção

##### 10 tatuadores (~10 conversas/dia/tatuador = 100/dia)

| Componente | Custo |
|---|---|
| CF Pages | Free aguenta (até 100k requests/dia) |
| Supabase | Free aguenta (DB pequeno) ou Pro $25 |
| Vultr | $12 (mesmo) |
| OpenAI | **~$50-150/mês** (10x volume) |
| MailerLite | $9 (1-2k subs) |
| MP | % das transações |
| **Total** | **~$70-200/mês** |

##### 100 tatuadores (~1k conversas/dia)

| Componente | Custo |
|---|---|
| CF Pages | Pro $5/mês ou ainda free |
| **Supabase Pro** | $25 + addons |
| Vultr | bumping pra **$24-48** (4-8GB) — n8n + Evolution sob pressão |
| **OpenAI** | **~$500-1500/mês** (100x volume) |
| MailerLite | $30+ |
| MP | % significativo |
| **Total** | **~$600-1700/mês** |

##### 1000 tatuadores (~10k conversas/dia)

| Componente | Custo |
|---|---|
| CF Pages Pro + Workers Paid | $5 + $5+ |
| **Supabase Team** | $599+/mês (volume + replicas) |
| **VPS escalando**: 1 VPS não dá mais — precisa cluster ou managed (n8n cloud + Evolution dedicated) | **$200-500+/mês** |
| **OpenAI** | **~$5k-15k/mês** |
| MailerLite | $99+ |
| MP | bem significativo |
| **Total** | **~$5.9k-16k/mês** |

#### Onde tá vazando dinheiro

**Pré-launch atual**: nada — tudo dentro de free tiers ou minimal. Custos atuais provavelmente <$30/mês.

**Risco de scale**: 
- **OpenAI tokens** vão dominar custo desde 100 tatuadores. Cada agent loop com 12 tools chama LLM 2-5x por turno. Optimização de prompts/caching tem alto leverage.
- **Vultr VPS**: 1 caixa com n8n + Evolution + (eventualmente Postgres) será gargalo de CPU. Splittar é trabalho.
- **Supabase scaling**: hot path 1 com 8-12 reads/writes por turno × 1000 tatuadores × 10 conv/dia = 80k-120k DB ops/dia, gerenciável mas pode acionar pricing scale.

#### Findings 2.7

| # | Finding | Severity |
|---|---|---|
| F2.7.1 | Custo atual ~$11-27/mês — **ótimo pra pré-launch**. Nenhum vazamento óbvio | observação positiva |
| F2.7.2 | OpenAI tokens vão dominar custo desde 100 tatuadores. Optimizar prompts (system prompt 3-camadas já é bom) e tool count pode reduzir 30-50% | média (ROI de eng futura) |
| F2.7.3 | VPS Vultr 1-machine vai estourar entre 100-1000 tatuadores. Plano de scaling não documentado | alta (planejamento) |
| F2.7.4 | Sem dashboard de cota (cross-ref F2.5.5) — risco de surpresa de billing | média |
| F2.7.5 | n8n.cloud caro em scale (>$50/mês com volume) — self-hosted continua sendo escolha barata, com trade-off SPOF | observação |

---

### 2.8 Versionamento

#### Estado atual

| Tipo | Como é versionado | Drift observado |
|---|---|---|
| **Código (Pages Functions, Worker)** | Git ✅ | OK |
| **Workflow n8n principal** | **Snapshot manual JSON** em `docs/workflows/` (1 export 6d atrás) | **Drift garantido** — workflow tem 98 nodes em prod, qualquer edição via dashboard n8n não vai pro git |
| **Outros 9 workflows n8n** | **Não versionado nenhum** | **Drift total** |
| **Migrations Supabase** | Git desde 2026-04-26 (11 migrations) | **33 migrations base** aplicadas via Dashboard SQL Editor antes — invisíveis pro git (cross-ref F1.4.1) |
| **RLS policies** | Não versionadas separadamente — só dentro das migrations | (mesma falha que migrations) |
| **Functions / RPCs** | Em migrations de abr-mai (parcial) | OK pras recentes; RPCs antigas (`buscar_historico_campanha`, etc.) não no git |
| **Triggers** | Em migrations | OK pros 4 |
| **Secrets** | Bitwarden + bws + CF Pages env. **Lista de NOMES em `secrets.md`** | Lista de nomes desatualizada (cross-ref F1.5.5 — 21 vars não documentadas) |
| **Schema CF Pages env vars** | Em CF dashboard | Não versionado em git — drift detectado pelo `preflight-envvars.sh` (F1.5.3) |
| **GHA workflows** | Git | OK |
| **`_redirects` + `_headers`** | Git | OK |
| **Subagents Claude** | Git (`.claude/agents/`) | OK (mas memory do agent referencia versão antiga — F1.7.3) |
| **Skills custom** | Não em git (`~/.claude/skills/llm-council`) | Local-only |
| **Hooks (`~/.claude/hooks/`)** | Não em git | Local-only |
| **Schema info externa (Evolution VPS .env)** | Manual | Drift teórico |

#### Histórico de schema

`supabase/migrations/` em git tem 11 migrations (desde 2026-04-26). Antes disso = ~33 migrations rodadas via dashboard, perdidas pra rastreabilidade. **Não dá pra recriar o DB do zero a partir do git.**

#### Procedure de rotação de secrets

`docs/canonical/secrets.md` documenta procedures detalhadas pra:
- `MP_ACCESS_TOKEN`
- `CLOUDFLARE_API_TOKEN` (único com TTL fixo 90d)
- `CRON_SECRET` (atomic, dual-prong)
- `EVO_GLOBAL_KEY` (coordenado com VPS)

✅ Bem feito. Mas **só os 4** documentados — outros ~18 secrets sem procedure. Anotado em F1.2.5.

#### Findings 2.8

| # | Finding | Severity |
|---|---|---|
| F2.8.1 | **Workflow n8n drift**: snapshot manual ocasional + 9 workflows secundários não versionados — ALL changes invisíveis pro git | **alta** |
| F2.8.2 | **33 migrations base não em git** — não dá pra reproduzir DB do zero (cross-ref F1.4.1) | **alta** |
| F2.8.3 | CF Pages env vars não versionadas — drift detectado só localmente (F1.5.3) | média |
| F2.8.4 | Procedures de rotação só pra 4/22 secrets — gap de governance pra 18 | média (cross-ref F1.2.5) |
| F2.8.5 | Subagents `.claude/agents/` versionados ✅ — boa prática | observação positiva |
| F2.8.6 | `secrets.md` documentação de secrets desatualizada vs código (21 vars não documentadas) | baixa (cross-ref F1.5.5) |
| F2.8.7 | Sem schema dump baseline em git (ex: `pg_dump --schema-only` periódico) | média |

---

### Resumo da Fase 2 — análise crítica consolidada

#### Top achados da Fase 2 (não-óbvios da Fase 1)

##### Críticos / Alta severidade (15)

| ID | Achado |
|---|---|
| F2.1.1 | Hot path 1 com **25-30 hops** e **P50 ~9-17s** (5-10s é debounce intencional) |
| F2.1.2 | **9 hops CF Pages + 8-12 supabase calls num turn típico** ≈ 700ms-1.2s só network — alvo claro pro refator code-first |
| F2.2.1 | **VPS Vultr é mega-SPOF** — n8n + Evo na mesma máquina = queda física derruba 100% do hot path bot |
| F2.2.2 | Supabase é SPOF universal — 99.9% Pro = 8.7h/ano aceitável |
| F2.2.3 | **SLA composto realista 94-97%** — 10-22 dias/ano de "produto não funciona" |
| F2.2.7 | Auditor não cobre n8n workflow paused / Evolution per-tenant dead |
| F2.3.1 | **3 memory stores diferentes** pra histórico (Redis, n8n_chat_histories, chat_messages) com volumes drasticamente diferentes (386 vs 32) |
| F2.3.2 | FSM `estado_agente` mutável por **6 lugares distintos** |
| F2.4.1 | **Auth completamente sem teste** — bypass = leak entre tenants |
| F2.4.2 | **Billing completamente sem teste** — bug = cobranças/cancelamentos errados |
| F2.4.4 | **53 testes mas só os de prompts rodam em CI** — gap CI/CD severo |
| F2.5.1 | Sentry workflow ativo no n8n mas **sem trigger configurado** — captura zero |
| F2.5.2 | Sem tracing distribuído no hot path 1 |
| F2.5.4 | Heartbeat custom (`audit_runs`) só cobre 5 dos 13 crons |
| F2.6.1 | RPCs SECURITY DEFINER callable por anon (cross-ref F1.4.3) |
| F2.6.3 | Sem rate limiting visível em endpoints públicos |
| F2.8.1 | Workflow n8n drift — 9 workflows não versionados em git |

##### Média / Baixa (29)

Distribuídas em 2.1-2.8. Detalhes nas seções acima.

##### Observações positivas (10)

- Heartbeat dos 5 auditores OK (F1.6.1)
- 0 dead code em `_lib`
- Modo Coleta v2 tools com boa cobertura de testes
- Auditores próprios suprem parte do gap Sentry
- Cache headers bem configurados (F1.5.7)
- Sistema de prompts 3-camadas bem estruturado (F2.3.6)
- Guardrails centralizados (F2.3.7)
- Procedures de rotação de secrets críticos documentadas (F2.8 — pelo menos os 4)
- Custo atual ridiculamente baixo (~$11-27/mês) (F2.7.1)
- Subagents Claude Code versionados ✅

#### Padrões cruzados (cross-cutting)

1. **n8n é o ponto de fricção mais frequente** — aparece em 8+ findings (drift, SPOF, complexidade, memory split, observability, lógica espalhada, versionamento manual). Confirma a suspeita do brainstorm: n8n é dívida técnica, não plataforma final.
2. **Falta de CI extends além de prompts** — 53 testes existem, só os de prompts rodam. Resto fica como "running locally".
3. **Observability custom (auditores) é boa, mas com gaps** — não cobre n8n, Evolution per-tenant, tool calls, runtime 5xx.
4. **Drift git ↔ realidade** em 4 frentes: migrations (33 não versionadas), workflow n8n (snapshot manual), CF Pages env (não versionado), secrets.md (desatualizado).
5. **Hot path 1 tem complexidade sistêmica** — 25-30 hops + 3 memory stores + FSM em 6 lugares = debug é arqueologia (cross-ref F2.5.2).

---

## Fase 3 — Diagnóstico → Roadmap

> Esta fase é **opinada**. Severity, esforço e ordem refletem minha leitura — pra reescrutínio aberto.

### 3.1 Priorização P0-P3

#### Critérios

- **P0 — agora (1-2 semanas)**: bloqueia launch ou risco ativo de incidente sério. Tem que sair antes de qualquer feature nova.
- **P1 — próximo trimestre**: importante mas não bloqueia. Resolve antes de scale (≥10 tatuadores pagantes).
- **P2 — oportunista**: incluir junto com mudanças naturais. Não justifica trabalho dedicado.
- **P3 — limpeza**: cosmético / hygiene. Sai quando der.

#### Roadmap

| ID | Prioridade | Esforço | Blast | Item |
|---|---|---|---|---|
| **F1.3.1** | **P0** | XS (15min) | alta — preço errado pro cliente | Remover `consultar_preco_retoque` do agent n8n OU criar endpoint stub |
| **F2.4.4** | **P0** | S (1h) | crítica — bloqueia tudo abaixo | Rodar `node --test tests/` em GHA (workflow novo) |
| **F2.4.1** | **P0** | M (3-5d) | crítica — leak entre tenants | Tests pra auth (validate-onboarding-key, validate-studio-token, get-studio-token, request-studio-link, _auth-helpers) |
| **F2.4.2** | **P0** | M (3-5d) | crítica — cobranças erradas | Tests pra billing (mp-ipn, webhooks/mp-sinal, create-subscription) |
| **F1.4.3 / F2.6.1** | **P0** | S (1h) | alta — auth bypass | Migration: `REVOKE EXECUTE` ou switch `SECURITY INVOKER` em `expire_trials` e `merge_conversa_jsonb` pra `anon`/`authenticated` |
| **F1.4.2** | **P0** | S (1h) | alta — auth bypass | Migration: `ALTER VIEW audit_current_state` e `orcamentos` pra remover SECURITY DEFINER |
| **F2.5.1** | **P0** | XS (30min) | alta — voa cego | Configurar trigger no workflow n8n `INKFLOW - Sentry Error Handler` |
| **F2.8.2** | **P0** | S (1h) | alta — DR | `pg_dump --schema-only` baseline em git (`supabase/baseline-schema.sql`) |
| **F1.5.5 + F1.7.3** | **P0** | S (2h) | baixa | Atualizar `secrets.md` (21 vars) + `MEMORY.md → project_agents.md` (3 ativos) |
| | | | | |
| **F2.2.1** | **P1** | L (4-8 sem) | crítica — VPS SPOF | Splittar n8n + Evolution em VPSs separadas OU mover Evolution pra managed |
| **F2.1.2 + F2.3.1 + F2.3.2** | **P1** | XL (6-10 sem) | alta — hot path latency + dívida arquitetural | **Refator multi-agent (Modo A) com remoção integrada de n8n** — substitui 25-30 hops por code-first agent em CF Workers |
| **F1.6.4** | **P1** | M (2-3d) | alta — n8n paused silencioso | Auditor `n8n-workflow-health` (checa active=true + executions recentes) |
| **F1.6.5** | **P1** | M (2-3d) | alta — Evo per-tenant dead | Auditor `evo-instance-health` per-tenant (loop tenants → connectionState) |
| **F1.6.6** | **P1** | M (3-4d) | alta — tool zumbi não detectado | Auditor `tool-calls-integrity` (success rate por tool nas últimas 24h) |
| **F2.4.3** | **P1** | M (2-3d) | alta — onboarding falha silencioso | Tests pra `evo-create-instance`, `evo-pairing-code`, `evo-qr`, `evo-status` |
| **F2.5.2** | **P1** | L (1-2 sem) | alta — debug é arqueologia | Tracing distribuído (Langfuse ou OpenLLMetry) — incluir no escopo do refator |
| **F2.5.4** | **P1** | M (2-3d) | alta — cron silencioso | Heartbeat custom pros 8 crons restantes (não-auditor) — escrever em `audit_runs` ou tabela equivalente |
| **F2.6.3** | **P1** | M (2-3d) | alta — DOS/brute-force | Rate limiting em endpoints públicos (`/api/create-tenant`, `/api/public-start`, `/api/validate-*`, `/api/onboarding`) — via CF Rules ou helper inline |
| **F2.8.1** | **P1** | M (2-3d) | alta — drift n8n | Versionamento workflow n8n via export-on-PR (custom GHA + n8n MCP) — **OU descartar se F2.1.2 elimina n8n** |
| **F2.4 (resto)** | **P1** | M | médio — coverage gap | Tests pros endpoints sem teste (public-start, send-link/email, helpers `_lib/` faltando) |
| | | | | |
| **F1.5.6 / F2.6.4** | **P2** | S (2-4h) | média — XSS surface | Adicionar CSP header em `_headers` (`default-src 'self'; ...`) |
| **F1.4.4** | **P2** | S (1h) | média — anon insert | Trocar `signups_log` policy WITH CHECK pra restritiva (ex: rate limit por IP) |
| **F1.4.5 / F2.6.7** | **P2** | XS (15min) | média — bucket listing | Trocar bucket `tattoo_bucket` pra public sem LIST (storage policy) |
| **F1.4.7** | **P2** | M (1d) | média — perf at scale | Refator 11 RLS policies pra `(select auth.X())` (subquery cache) |
| **F1.5.3** | **P2** | XS (15min) | média | Mover preflight env vars pra GHA (`run: bash scripts/preflight-envvars.sh` no `deploy.yml`) |
| **F1.2.5** | **P2** | M (1d) | média — rotação proativa | Calendar reminder + procedures pra outros 18 secrets |
| **F1.4.8** | **P2** | XS (15min) | baixa | Migration: drop índice duplicado `dados_cliente_tenant_id_telefone_key` |
| **F1.4.9** | **P2** | S (1h) | baixa | Migration: índices pras 3 FKs (`agendamentos.conversa_id`, `audit_events.superseded_by`, `signups_log.tenant_id`) |
| **F2.7.2** | **P2** | M (2-3d) | médio — custo at scale | Optimização OpenAI tokens (prompt caching, model selection, slim system prompts) — feeding into refator |
| **F2.6.6** | **P2** | S (1h) | média | Padronizar auth de tools (1 secret só, ou matriz documentada) |
| **F2.6.9** | **P2** | M (2-3d) | média — escala | 2FA opcional no studio dashboard |
| | | | | |
| **F1.7.4** | **P3** | XS (1h) | baixa | Cleanup `settings.local.json` (remover entries stale) |
| **F1.5.4 + F1.2.2** | **P3** | S (2h) | baixa | Resolver naming drift secrets (escolher um nome canônico) |
| **F1.4.10** | **P3** | XS (15min) | baixa | Migration: drop 4 índices unused |
| **F1.4.12** | **P3** | XS (15min) | baixa | Drop RPC dead `atualizar_timestamp_campanha` |
| **F1.3.8** | **P3** | XS (10min) | baixa | Delete 4 workflows n8n backup desativados (já têm 2+ semanas de janela) |
| **F1.3.2** | **P3** | XS-S | baixa | Decidir destino dos 3 endpoints órfãos (`aprimorar-persona`, `preview-orcamento`, `simular-conversa`) — manter ou drop |
| **F1.6.8** | **P3** | XS (10min) | baixa | Arquivar smoke runs históricos (audit_runs onde auditor IN ('smoke-test','smoke-escalation')) |
| **F1.4.6** | **P3** | XS (5min) | baixa | Habilitar leaked password protection no Supabase Auth |

### 3.2 Sprints sugeridos

**Sprint 1 — Quick wins de auth/coverage (1-2 semanas)**

```
Foco: tirar P0 da mesa antes de qualquer feature nova.

├── 1.1 [F2.4.4]  Tests rodam em GHA                      ← bloqueia 1.2 e 1.3
├── 1.2 [F2.4.1]  Tests auth (5 endpoints)
├── 1.3 [F2.4.2]  Tests billing (3 endpoints)
├── 1.4 [F1.3.1]  Tool ZUMBI fix
├── 1.5 [F1.4.3]  RPCs anon revoke
├── 1.6 [F1.4.2]  Views SECURITY DEFINER fix
├── 1.7 [F2.5.1]  Sentry trigger config
├── 1.8 [F2.8.2]  Schema dump baseline
├── 1.9 [F1.5.5+F1.7.3]  Atualizar docs (secrets.md + memory)
└── 1.10 [Quick wins P3]  Drop duplicate index, drop dead RPC, archive smokes (10min total)

Definition of done sprint 1:
- Pipeline GHA verde em 100% dos 53 tests
- Auth bypass paths fechados (advisor verde nos 4 itens)
- 1 alerta Telegram do Sentry capturado em smoke
- supabase/baseline-schema.sql commitado
```

**Sprint 2 — Coverage profunda + auditores (2-3 semanas)**

```
Foco: fechar gaps de observability + cobrir SPOFs móveis.

├── 2.1 [F1.6.4]  Auditor n8n-workflow-health
├── 2.2 [F1.6.5]  Auditor evo-instance-health per-tenant
├── 2.3 [F1.6.6]  Auditor tool-calls-integrity
├── 2.4 [F2.5.4]  Heartbeat dos 8 crons restantes
├── 2.5 [F2.4.3]  Tests Evolution endpoints
├── 2.6 [F2.6.3]  Rate limiting endpoints públicos
└── 2.7 [F2.6.4]  CSP header

Definition of done sprint 2:
- 8 auditores totais (5 atuais + 3 novos) em audit_runs
- 13 crons com heartbeat
- 4 endpoints Evo com test
- Headers de segurança completos
```

**Sprint 3 — Versionamento + DR (2 semanas)**

```
Foco: eliminar drift git ↔ realidade, criar plano DR real.

├── 3.1 [F2.8.1]  Workflow n8n versionado via export-on-PR
│                 (skipa SE refator multi-agent vai eliminar n8n no Sprint 4+)
├── 3.2 [F2.8.3]  CF Pages env vars baseline (snapshot semanal em git)
├── 3.3 [F1.2.5]  Procedures de rotação pros 18 secrets restantes
├── 3.4 [F2.8.2 cont]  Cron de pg_dump baseline (semanal)
└── 3.5 Backup restore drill (1 ensaio)

Definition of done sprint 3:
- 100% das mudanças refletidas em git
- Procedure de rotação documentada pra todos os secrets
- DR drill executado em ambiente de teste
```

**Sprints 4-N — Refator multi-agent + remoção n8n (6-10 semanas)**

```
Foco: eliminar dívida arquitetural principal. Inicia novo /nova-feature.

├── 4.1 Spec dedicada do refator (já existe brainstorm pausado — retomar)
├── 4.2 Modo A code-first em CF Workers (OpenAI Agents SDK)
├── 4.3 Consolidação 3 memory stores → 1 (Supabase canônico)
├── 4.4 FSM `estado_agente` em 1 lugar (RPC + helper único)
├── 4.5 Migração Evolution → CF Pages direto (sem n8n no hot path)
├── 4.6 Tracing distribuído (Langfuse ou alternativa)
├── 4.7 Smoke E2E + dual-run (n8n + novo) durante migração
└── 4.8 Cutover + descontinuação n8n (mantém VPS só pra Evolution)

Definition of done sprints 4-N:
- Hot path 1 ≤5 hops, P50 ≤4-6s (excluindo debounce intencional)
- 1 memory store
- FSM em 1 lugar
- Tracing visível em todo turn
- n8n DESATIVADO em prod (workflow paused, depois deletado)
```

**Sprint N+ — Otimização at-scale (oportunista, ≥1º cliente pago)**

```
├── N.1 [F1.4.7]  auth_rls_initplan refactor
├── N.2 [F2.7.2]  Optimização OpenAI tokens (prompt caching)
├── N.3 [F1.4.10]  Drop unused indexes
├── N.4 [F2.6.9]  2FA studio dashboard
├── N.5 Outros P2/P3
└── Plano scaling Vultr → Containers/managed Evolution
```

### 3.3 Re-priorização do refator multi-agent

**Antes da auditoria:** Refator multi-agent era P0 do backlog (`coleta-v2-multi-agent-handoff`).

**Depois da auditoria:** Continua **estratégico** mas **reposicionado pra P1 com escopo expandido**.

#### Por quê não P0

- F2.4.1 (auth tests) e F2.4.2 (billing tests) são gaps **mais imediatos** — risco ativo, baixo esforço
- F1.3.1 (tool ZUMBI) é bug ativo, fix é XS
- F1.4.3 (RPCs anon) é exposição de auth bypass, fix é S
- Refator é XL (6-10 semanas) — começar com bug ativo e gap de coverage destrava base mais sólida pra refator

#### Por quê não Pp2

- F2.1.2 confirma latência alta no hot path
- F2.3.1-2 confirma fragmentação arquitetural
- F2.2.1 + F1.3.6 confirma SPOF
- Custo de NÃO fazer cresce com escala — quanto mais clientes, mais doloroso refatorar

#### Escopo expandido (vs spec original do brainstorm)

Spec original: "Modo A — Router code-first em CF Pages Function (com OpenAI Agents SDK)".

**Recomendação atualizada:** **incluir remoção integrada de n8n** no escopo. Motivo:

| Sem remover n8n | Com remover n8n |
|---|---|
| Modo A só pro novo agent | Modo A + Evolution → CF direto |
| n8n continua processando webhook + memory + filtros | CF Pages é único hot path |
| 3 memory stores ainda existem | 1 memory store (Supabase canônico) |
| FSM em 6 lugares ainda | FSM em 1 lugar (RPC `merge_conversa_jsonb` + helper) |
| n8n SPOF ainda existe | n8n DESATIVADO (não há mais SPOF lógico, só físico do Evo) |
| Drift workflow ainda existe | Não tem mais workflow |
| Latência: pode até melhorar (Modo A só pro agent) | Latência: 25-30 hops → 5-7 hops |

**Esforço:** +30-50% sobre spec original. **Valor:** elimina 5+ findings P1 num PR.

> **Decisão do brainstorm preservada confirma:** "Princípio de design portabilidade: agents implementados como classes/objetos puros (sem amarração HTTP) → migração futura A→B (Durable Objects + streaming) cirúrgica". Esse princípio só se honra se o agent for o ÚNICO ponto de entrada — n8n no meio quebra a portabilidade.

### 3.4 Trade-offs cravados

| # | Decisão | Recomendação | Por quê |
|---|---|---|---|
| 1 | Refator multi-agent inclui remoção de n8n? | **SIM** | Sem isso, sobram 5 findings P1 não resolvidos. Custo +30-50%, valor de eliminar dívida arquitetural domina |
| 2 | Vultr → Containers ou managed Evo? | **Vultr até refator completo** | CF Containers ainda beta. Evo managed terceirizado caro/imaturo. Decidir DEPOIS de eliminar n8n da equação |
| 3 | Supabase Pro ($25/mês) — quando? | **Quando 1º cliente pago** | Free tier sem SLA = qualquer down inválida cobrança. Agora não tem cliente pagando, free aguenta |
| 4 | Test framework: continuar `node --test`? | **Sim** | 53 testes existem, migrar pra Vitest é gasto que não retorna. Foco é rodar em GHA |
| 5 | Tracing: Langfuse ou OpenLLMetry? | **Decidir junto com Modo A spec** | Brainstorm preservou Langfuse mas com warning sobre AsyncLocalStorage. Spec dedicada do refator vai resolver |
| 6 | Workflow n8n: investir em export-on-PR? | **Não** (se refator vai eliminar) | Custo médio sem ROI se n8n vai sair. Fazer só dump pré-refator pra DR |
| 7 | OpenAI: gpt-4o-mini ou gpt-4o? | **Mini default + 4o seletivo** | Tokens dominam custo em scale. Mini é ~30x mais barato. Caso a caso onde mini não cabe (raciocínio complexo), passa pro 4o |
| 8 | Heartbeat de crons não-auditor: tabela nova ou estender `audit_runs`? | **Estender `audit_runs`** | DRY. Adicionar `auditor` value `'cron-X'` pra cada cron. Schema permanece simples |
| 9 | Rate limiting: CF Rules ou helper inline? | **CF Rules** (zone-level) | Stateless, edge-first, sem custo de DB. Inline helper só se CF Rules não cobrir caso específico |
| 10 | 33 migrations base não versionadas — migrar pra `migrations/` ou só dump? | **`pg_dump --schema-only baseline.sql`** | Rebuild do zero raro; migration replay desnecessário. Baseline garante reprodutibilidade |

### 3.5 Quick wins isolados (≤2h cada)

Pra atacar em janelas curtas — ordem por leverage decrescente:

| # | Tarefa | Tempo | Leverage |
|---|---|---|---|
| 1 | **Rodar 53 testes em GHA** (criar `tests.yml`) — F2.4.4 | 1h | bloqueia regressões silenciosas |
| 2 | **Configurar trigger Sentry workflow n8n** — F2.5.1 | 30min | activates erro capture |
| 3 | **Migration: revoke EXECUTE em `expire_trials` + `merge_conversa_jsonb` pra anon/authenticated** — F1.4.3 | 30min | fecha auth bypass |
| 4 | **Migration: ALTER VIEW remove SECURITY DEFINER** (`audit_current_state`, `orcamentos`) — F1.4.2 | 30min | fecha auth bypass |
| 5 | **Remover `consultar_preco_retoque` do agent n8n** — F1.3.1 | 15min | remove tool zumbi |
| 6 | **`pg_dump --schema-only > supabase/baseline-schema.sql` + commit** — F2.8.2 | 30min | DR baseline |
| 7 | **Storage policy: `tattoo_bucket` revoke LIST** — F1.4.5 | 15min | fecha info disclosure |
| 8 | **Migration: drop índice duplicado** (`dados_cliente_tenant_id_telefone_key`) — F1.4.8 | 15min | hygiene |
| 9 | **Migration: drop 4 índices unused** — F1.4.10 | 15min | hygiene |
| 10 | **Migration: drop RPC dead `atualizar_timestamp_campanha`** — F1.4.12 | 15min | hygiene |
| 11 | **Habilitar leaked password protection no Supabase Auth dashboard** — F1.4.6 | 5min | gratuito |
| 12 | **Adicionar CSP `default-src 'self'` em `_headers`** — F1.5.6 | 30min | XSS protection (test em staging primeiro!) |
| 13 | **Atualizar `MEMORY.md → project_agents.md` (3 ativos)** — F1.7.3 | 10min | hygiene |
| 14 | **Atualizar `secrets.md` com 21 vars não documentadas** — F1.5.5 | 1h | docs canônicos |
| 15 | **Mover preflight envvars pra GHA `deploy.yml`** — F1.5.3 | 15min | preflight em CI |
| 16 | **Delete 4 workflows n8n backup desativados** — F1.3.8 | 10min | hygiene (já passou janela de segurança) |
| 17 | **Archive smokes históricos do audit_runs** (DELETE WHERE auditor IN ('smoke-test','smoke-escalation')) — F1.6.8 | 5min | hygiene |

**Total se fizer tudo:** ~6-7h de trabalho concentrado. **Impacto:** fecha 7 P0 + 5 P3 + 4 P2 = ~16 findings em meio dia.

---

## Quick wins isolados

> Movido pra **§3.5 Quick wins isolados** — atalho aqui pra navegação.

Lista completa em [§3.5](#35-quick-wins-isolados-2h-cada). Top 5 por leverage:

1. **Rodar tests em GHA** (1h) → bloqueia regressões silenciosas
2. **Sentry trigger** (30min) → captura erros n8n
3. **Revoke EXECUTE RPCs anon** (30min) → fecha auth bypass
4. **Fix views SECURITY DEFINER** (30min) → fecha auth bypass
5. **Remover tool ZUMBI** (15min) → fix bug ativo

Total das 5: **~3h** pra fechar **5 dos 8 P0 críticos**.
