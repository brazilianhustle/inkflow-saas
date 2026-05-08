---
name: Reestruturação InkFlow — Programa Mestre
description: Programa orquestrador integrando auditoria 2026-05-07 + curso Anthropic + auditoria de frontend (gap) pra eliminar amadorismo do produto
date: 2026-05-08
status: ready-to-execute (SP1 e SP2 podem iniciar em paralelo)
type: master-program
tags: [audit, refactor, frontend, strategy, anthropic-course]
originSession: 2026-05-08-brainstorm-reestruturacao-saas
spec_predecessor: docs/superpowers/specs/2026-05-07-auditoria-completa-saas-design.md
related_artifact: docs/auditoria/2026-05-07-auditoria-completa.md
---

# Reestruturação InkFlow — Programa Mestre

## Contexto

Em **2026-05-07** foi rodada uma auditoria completa do InkFlow (`docs/auditoria/2026-05-07-auditoria-completa.md`, 141 KB, 2.373 linhas). Ela mapeou:

- Repo, stack runtime, n8n, Supabase, CF Functions, auditores, tooling local (Fase 1)
- Hot path, SPOFs, duplicação, test coverage, observability, security, custo, versionamento (Fase 2)
- Roadmap priorizado P0-P3 com 65 findings (Fase 3)

**Sprint 1 foi executado no mesmo dia** — 15 findings fechados, 12 advisor lints zerados, 6 PRs (5 mergeados). Sprints 2-N permanecem no roadmap.

Em **2026-05-08**, decisão estratégica: **eliminar todo sinal de amadorismo do produto**. Investigação durante brainstorm revelou que a auditoria 07/05 não cobriu duas dimensões críticas:

1. **Frontend** — 6 HTMLs monolíticos (de 17 a 200 KB), zero build, zero framework, zero TS, zero componentização. Auditoria menciona como observação informal mas não como finding formal.
2. **Lente Anthropic** — o curso `anthropic.skilljar.com/claude-with-the-anthropic-api` (e cursos relacionados de subagents/skills/MCP) traz padrões aplicáveis ao agente do InkFlow que não foram considerados na auditoria.

Esta spec organiza o trabalho de eliminação do amadorismo sem duplicar o que já foi feito.

## Princípio de calibração (não-negociável)

> **Padrão de mercado > preservação do existente.**
>
> Em decisões de arquitetura/stack/tech, ponto de partida é "o que um dev sênior fazendo isso do zero hoje, num projeto profissional, escolheria?" — não "o que já existe é viável?". Preservação só ganha com ROI claro e mensurável (anos de bug fixes, integrações estáveis, complexidade real de migração).

Aplicação: greenfield mindset ao avaliar cada componente. Mantém só o que sobreviveria a um code review de tech lead sênior.

## Estado atual (08/05) — o que existe e em que pé está

### Backend / infra (auditado em 07/05)

| Componente | Auditoria 07/05 | Status hoje |
|---|---|---|
| Supabase schema + RLS | Mapeado, 12 lints fechados | ✅ Sólido |
| Edge Functions (50+ endpoints) | Inventariadas | ✅ Modular (`_lib/` + `api/`) |
| Auditores 5 em prod | Cobertura 99.4%, gaps em n8n/Evo per-tenant | ⏳ Sprint 2 |
| Cron worker | Único arquivo | ⏳ Heartbeat dos 8 crons restantes (Sprint 2) |
| n8n workflow `MEU NOVO WORK - SAAS` | 98 nós, SPOF, drift git ↔ prod | 🔄 Sprint 4+ (remoção integrada ao refator multi-agent — ainda não iniciado; em curso apenas sub-fase de prompt tuning v2 na branch `audit/coleta-multi-agent-prompt-v2`) |
| Test coverage | 53 → 391 testes em GHA pós-Sprint 1 | ⏳ Evo endpoints (Sprint 2) |
| Sentry | Trigger configurado | ✅ Ativo |
| Secrets `bws` | 21 vars documentadas | ✅ Pós-Sprint 1 |

**Findings P0/P1 ainda abertos:** Sprints 2 e 3 do roadmap original (auditores adicionais, rate limiting, CSP, versionamento, DR drill).

### Frontend (NÃO auditado)

| Arquivo | Tamanho | Linhas | Padrão |
|---|---|---|---|
| `onboarding.html` | 200 KB | 3.322 | Monolítico, JS+CSS inline, 4 scripts externos |
| `studio.html` | 117 KB | 2.444 | Monolítico, 100% inline, **chama só `/api/*`** ✓ |
| `admin.html` | 55 KB | 1.074 | Monolítico, **chama Supabase REST direto** ⚠ |
| `index.html` | 50 KB | 792 | Landing |
| `reconnect.html` | 20 KB | 384 | Reconexão WhatsApp |
| `termos.html` | 17 KB | 256 | Termos |

**Pontos críticos identificados em raio-x rápido:**

- Stack zero-build (sem React/Vue/Svelte/Astro, sem Vite, sem TS) — fora do padrão de mercado de 2026
- `admin.html:664, 868` faz `GET/PATCH /rest/v1/tenants?...` direto no Supabase (incl. `prompt_sistema`) — depende 100% de RLS estar correto, sem audit log de mudanças, sem versionamento de prompt
- `onboarding.html:1825` faz `POST /rest/v1/signups_log` direto — surface de abuso (RLS já cobrido com `rls_policy_always_true`, mas sem rate limit)
- `SUPABASE_ANON_KEY` em HTML é OK por design (anon key é pública), mas não há fallback se rotacionar
- Zero E2E tests de UI (Playwright existe mas não usado pra cobertura de fluxos)

### Tooling / docs

- `.claude/agents/` com 6 subagents especializados ativos (auditados)
- Skills superpowers carregadas
- Specs em `docs/superpowers/specs/` (29 specs históricas + esta)
- Memory persistente em `~/.claude/projects/.../memory/`

## Decomposição em sub-projetos

```
SP1 ──── Auditoria-suplemento de FRONTEND      (eu, paralelo a SP2)
SP2 ──── Ingestão do curso Anthropic           (você + eu, paralelo a SP1)
SP3 ──── Roadmap mestre integrado              (depende de SP1 + SP2)
SP4..N ── Execução fatiada                      (cada um vira spec própria)
```

### SP1 — Auditoria-suplemento de FRONTEND

**Objetivo:** complementar a auditoria 07/05 com findings formais sobre frontend, na mesma estrutura (severity, esforço, blast radius), pra integrar ao roadmap existente.

**NÃO é** re-rodar Fase 1/2/3 da auditoria. **É** estender ela com a dimensão que ficou de fora.

**Escopo:**
- Inventário detalhado dos 6 HTMLs (tamanho de marcação vs lógica vs estilo)
- Identificação de duplicação entre HTMLs (mesma lib copy-pasted? mesmo helper?)
- Mapeamento de dependências cliente → API (cada fetch e seu contrato)
- Anti-patterns: PostgREST direto do browser, secrets management no frontend, falta de validação client-side, falta de tipos, etc.
- Avaliação contra padrão de mercado 2026: que stack greenfield seria escolhida? (Astro, Next, SvelteKit, React+Vite, etc. — análise de tradeoffs)
- Propor findings formais `F-FRONT.X.Y` integráveis ao roadmap 07/05

**Saída:** `docs/auditoria/2026-05-08-auditoria-frontend-suplemento.md`
- Estrutura espelhada à auditoria 07/05 (Fase 1 inventário, Fase 2 análise, Fase 3 priorização)
- Findings com IDs novos (`F-FRONT.*`) que não colidem com os existentes (`F1.*`, `F2.*`)
- Recomendação de stack final (greenfield vs preservação parcial)

**Dependências:** nenhuma. Read-only, eu sozinho.

**Estimativa:** ~2-3h de auditoria concentrada.

**Spec própria:** será escrita após aprovação desta mestra (`docs/superpowers/specs/2026-05-08-auditoria-frontend-suplemento-design.md`).

### SP2 — Ingestão estruturada do curso Anthropic

**Objetivo:** transformar conteúdo do curso em frameworks aplicáveis ao InkFlow, identificando onde nossa arquitetura atual diverge das recomendações canônicas da Anthropic.

**Cursos no escopo:**
- `Building with the Claude API` (principal)
- `Introduction to Model Context Protocol` (relevante: poderíamos expor Supabase/Evolution como MCP server)
- `MCP: Advanced Topics`
- `Introduction to subagents` (já temos `.claude/agents/` — comparar)
- `Introduction to agent skills` (já usamos skills — comparar)
- `AI Fluency: Framework & Foundations` (única pegada estratégica)

**Restrição operacional:**
- Cursos são **vídeo sob demanda** — eu não consigo ingerir.
- Fluxo: você assiste módulo → me passa briefing (5-10 bullets do que cobriu + insights) → eu transformo em "como aplicar ao InkFlow" com referências ao código real.

**Saída:** `docs/superpowers/audit/2026-05-08-anthropic-applied.md`
- Por módulo: resumo + insights aplicáveis ao InkFlow
- Cross-reference: onde nosso código está alinhado / desalinhado com o que o curso ensina
- Recomendações: o que mudar no agente / tools / arquitetura à luz do curso

**Dependências:** depende de você assistir os módulos. Pode rodar em paralelo a SP1.

**Estimativa:** depende do seu ritmo. Cada módulo briefing → ~30-45min meu de processamento.

**Spec própria:** será escrita após aprovação desta mestra (`docs/superpowers/specs/2026-05-08-curso-anthropic-ingestao-design.md`).

### SP3 — Roadmap mestre integrado

**Objetivo:** decidir, com base nos achados de SP1 + SP2 e no roadmap pendente da auditoria 07/05, qual a próxima onda de execução de reestruturação. Sair do diagnóstico, entrar em decisão.

**Inputs:**
- Roadmap pendente da auditoria 07/05 (Sprints 2-N — auditores, rate limit, CSP, versionamento, DR, refator multi-agent + remoção n8n)
- Findings novos de SP1 (frontend)
- Recomendações de SP2 (curso Anthropic)

**Decisões a cravar:**
1. **Stack do novo frontend** — greenfield (qual?) ou refator incremental?
2. **Studio app rewrite** — vai antes / depois / em paralelo ao refator multi-agent (Sprint 4)?
3. **Camada API anti-PostgREST** — refator do admin.html requer mover queries pra `/api/*` antes ou depois do rewrite?
4. **Re-priorização** — o que muda no roadmap original com a lente do curso? (ex: refator multi-agent pode adotar padrões da Anthropic em vez do brainstorm pausado)
5. **Próxima fatia executável** — qual SP4 prioritário?

**Saída:** `docs/superpowers/specs/2026-05-08-roadmap-mestre-design.md`
- Tabela única consolidada P0-P3 unindo findings antigos + novos
- Cronograma de fatias (SP4..N)
- Trade-offs cravados pra cada decisão grande

**Dependências:** SP1 e SP2 ambos completos.

**Estimativa:** ~3-4h de raciocínio + escrita.

**Spec própria:** será escrita ao iniciar SP3.

### SP4..N — Execução fatiada

**Cada fatia é uma feature independente** com seu próprio:
- Brainstorm (`/nova-feature` → spec)
- Plano de implementação (`/plan` → plan)
- Execução com TDD onde aplicável
- Verification before completion + DoD

**Candidatos prováveis (ordem real definida em SP3):**
- Studio app v2 (rewrite com framework escolhido + design system + TS + build + E2E tests)
- Camada API (mover PostgREST direto do admin pra `/api/*` com validação + audit log + versionamento de prompt)
- Onboarding wizard v2
- Admin dashboard v2
- Landing v2
- (eventualmente) os Sprints 2-N pendentes da auditoria 07/05 que ainda fizerem sentido

## O que NÃO está em escopo

- **Esta spec mestra não detalha implementação.** Cada SP tem sua própria spec.
- **Esta spec mestra não escolhe stack do frontend.** SP3 decide com dados (SP1 + SP2 + tradeoffs reais).
- **Esta spec mestra não re-prioriza o roadmap antigo da auditoria 07/05.** SP3 faz isso de forma integrada.
- **Posicionamento de mercado, marketing, copy, branding** — fora do escopo (usuário declarou explicitamente).
- **Backend rewrite** — preservado por ROI (auditado, 50+ endpoints estáveis, 391 testes, 17 migrations recentes).

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| SP2 trava porque você não tem tempo de assistir o curso | SP1 roda independente; SP3 só inicia quando SP2 estiver minimamente completo. Briefing por módulo (não tudo de uma vez). |
| Auditoria 07/05 ficou desatualizada após Sprint 1 | SP1 abre com checklist de validação do estado atual antes de auditar frontend (cross-check Sprint 1 final report). |
| SP1 propõe rewrite de frontend mas restos do backend mudam o cálculo | SP3 integra os dois — decisão final de stack só depois de ver findings de ambos. |
| Vício de "perfeição greenfield" leva a paralisia | Princípio: **stack moderna padrão de mercado vence; escolha defensível, não ótima**. (Next vs Astro vs SvelteKit — qualquer das três é defensível pra app SaaS B2B PT-BR em 2026.) |
| SP1 + SP2 + SP3 viram análise sem ação | Hard gate: SP3 termina com **uma fatia escolhida pra execução imediata** (SP4). Não pode terminar com "depois decidimos". |

## Critério de sucesso da spec mestra

- ✅ SP1, SP2, SP3 têm escopo, dependências, output e estimativa cravados
- ✅ Cada SP tem caminho claro pra spec própria (path do arquivo)
- ✅ Auditoria 07/05 é referência viva, não duplicada
- ✅ Princípio "padrão de mercado > preservação" calibra cada decisão
- ✅ Termina com SP4 escolhido e iniciado (não fica em loop de auditoria infinita)

## Próximos passos imediatos (após aprovação)

1. Você revisa esta spec
2. Inicia SP1 e SP2 em paralelo:
   - **SP1:** eu escrevo `2026-05-08-auditoria-frontend-suplemento-design.md` e executo a auditoria
   - **SP2:** você assiste o primeiro módulo do curso e me passa briefing inicial
3. Quando ambos prontos: SP3 cravando roadmap mestre integrado
4. SP4 inicia execução real (provavelmente Studio app v2, mas SP3 confirma)

## Anexos / referências

- Auditoria 07/05: `docs/auditoria/2026-05-07-auditoria-completa.md`
- Spec da auditoria: `docs/superpowers/specs/2026-05-07-auditoria-completa-saas-design.md`
- Curso principal: `https://anthropic.skilljar.com/claude-with-the-anthropic-api`
- Catálogo de cursos: `https://anthropic.skilljar.com`
- Memory: `feedback_padrao_mercado.md`, `project_inkflow.md`, `project_agente_autonomo.md`
