---
name: Auditoria completa do SaaS InkFlow
description: Spec de discovery read-only do estado atual (stack, repo, workflow n8n, Supabase, observability) com plano de mitigação priorizado
date: 2026-05-07
status: ready-to-execute
type: discovery-audit
tags: [audit, discovery, refactor, hot-path]
originSessionId: 2026-05-07-nova-feature-multi-agent-pivot
---

# Auditoria completa do SaaS InkFlow — Design

## Contexto

Sessão 07/05 começou como brainstorm do refator P0 `coleta-v2-multi-agent-handoff` (OpenAI Agents SDK).

Durante o brainstorm, surgiu pergunta estrutural do Leandro:

> *"SaaS profissionais usam n8n no hot path de produto? Não seria melhor remover n8n da equação?"*

Resposta honesta: praticamente nenhum SaaS sério usa n8n no hot path de produto. Trade-offs reais (latência ~150-300ms extra, SLA composto pior, custo escala, versionamento ruim, vendor lock-in).

**Decisão:** antes de refatorar fundação (multi-agent handoff), **mapear o terreno completo**. Decidir refator com dados, não com suposição. Auditoria é o gate.

## Decisões preservadas do brainstorm pausado

(viram input pra Fase 3 da auditoria — NÃO se perdem)

- **Modo A — Router code-first** em Cloudflare Pages Function (com OpenAI Agents SDK)
- **Estado conversacional:** Supabase mantém source of truth (Opção A — `conversas.estado_agente`)
- **OpenAI Agents SDK roda em Workers** com `nodejs_compat`; Langfuse pra trace (limitação `AsyncLocalStorage`)
- **Suspeita forte:** n8n é dívida técnica disfarçada. Auditoria deve confirmar/refutar.
- **Princípio de design portabilidade:** agents implementados como classes/objetos puros (sem amarração HTTP) → migração futura A→B (Durable Objects + streaming) cirúrgica, não refator total

## Princípios da auditoria

- **Read-only.** Zero edits, zero migrations, zero deploys.
- **Qualidade > velocidade.** Não pular dimensões.
- **Documentar achados objetivamente.** Opinar SÓ na Fase 3.
- **Comparar atual vs best practices SaaS profissional**, não vs status quo do projeto.
- **Paralelizar via subagents** (Agent Explore) quando dimensões são independentes.
- **MCPs > comandos manuais** quando disponível.

## Escopo

### Fase 1 — Inventário (mapping read-only)

| # | Dimensão | Output esperado | MCPs/ferramentas |
|---|---|---|---|
| 1.1 | **Repo `inkflow-saas`** | Tree completa, tamanhos por dir, deps (`package.json`/`wrangler.jsonc`), arquivos órfãos / dead code | Bash (find, wc), Agent Explore |
| 1.2 | **Stack runtime externa** | Inventário de TODOS os serviços externos: Cloudflare (Pages/Workers/KV/R2/DO), Supabase, Evolution VPS, n8n cloud, MailerLite, Telegram, Mercado Pago, bws | Cloudflare MCPs, Supabase MCP, vault notes |
| 1.3 | **Workflow n8n `MEU NOVO WORK - SAAS`** | JSON dump completo + node-by-node: o que cada faz, dependências, lógica escondida (filtros, dedupe, multi-tenant routing, hidden side-effects) | n8n MCP (`search_workflows`, `get_workflow_details`) |
| 1.4 | **Supabase** | Schemas, tables, columns, RLS policies, RPCs, triggers, advisor warnings (security + performance) | Supabase MCP (`list_tables`, `list_extensions`, `execute_sql`, `get_advisors`, `list_migrations`) |
| 1.5 | **Cloudflare endpoints** | Pages Functions + Workers (`cron-worker`) + env vars + bindings + custom domains | Bash (ls), `cloudflare-builds` MCP, `cloudflare-observability` MCP |
| 1.6 | **Auditores 5 em prod** | Cobertura mapeada, false positive rate dos últimos 30d, gaps documentados | Bash (`cron-worker/`), Supabase `audit_runs`/`audit_events` |
| 1.7 | **Tooling local** | Secrets em `bws`, MCPs configurados, hooks ativos, skills custom, `.claude/settings.json` | Bash (`bws list`, `ls ~/.claude`) |

### Fase 2 — Análise crítica (best practices)

| # | Dimensão | Pergunta-âncora |
|---|---|---|
| 2.1 | **Hot path latência** | Quantos hops por request? Onde tem gordura desnecessária? Diagrama por tipo: msg cliente, deploy, cron audit, webhook MP, etc. |
| 2.2 | **SPOFs** | Onde a queda derruba o produto? n8n.cloud? Evolution VPS? Supabase? Cloudflare? Avaliação de SLA composto. |
| 2.3 | **Duplicação de lógica** | n8n e Pages Functions fazem coisas iguais? Mesmo helper em 2 lugares? Fontes de verdade conflitantes? |
| 2.4 | **Test coverage** | Onde tem buraco crítico sem teste? Coleta? Billing? Auth? Cron? Comparar com risco de cada área. |
| 2.5 | **Observability** | Gaps em logs/traces/alertas. O que vai dar bug em prod e tu não vai saber? Cobertura de Sentry vs Workers Tail vs auditores. |
| 2.6 | **Security posture** | RLS gaps (advisor warnings), secret management (`bws` cobre TUDO?), CORS, input validation, OWASP top 10, headers de segurança |
| 2.7 | **Custo $/mês** | Por componente. Onde tá vazando dinheiro. Projeção pra 10/100/1000 tatuadores. |
| 2.8 | **Versionamento** | n8n workflow versionado em git? Migrações Supabase rastreadas? Secrets rotation? Histórico de schema. |

### Fase 3 — Diagnóstico → Roadmap

- **Lista priorizada P0-P3** de dívidas/riscos com `severity` + `esforço estimado` + `blast radius`
- **Plano de mitigação** ordenado por dependência (X precisa vir antes de Y)
- **Trade-offs cravados** pra cada decisão grande (sem ambiguidade)
- **Re-priorização do refator multi-agent** (atual P0 backlog) considerando achados — pode mudar escopo (ex: incluir remoção de n8n no mesmo PR? separar?)
- **Quick wins** (≤2h cada) listados separado pra atacar em janelas curtas

## Output

**Arquivo único:** `docs/auditoria/2026-05-07-auditoria-completa.md`

Estrutura:
1. **Sumário executivo** (1 página, pt-BR pra Leandro não-dev)
2. **Diagrama arquitetura atual** (mermaid)
3. **Fase 1** — inventário (anexos)
4. **Fase 2** — análise (achados ordenados por severidade)
5. **Fase 3** — roadmap de mitigação priorizado
6. **Quick wins** isolados

## Operacional

| Item | Valor |
|---|---|
| Working dir | `~/Documents/inkflow-saas` |
| Branch | `chore/auditoria-completa-saas` (nova) |
| Modelo | Opus 4.7 (raciocínio, não execução) |
| Contexto | Sessão fresh — memory + spec dão tudo necessário |
| MCPs | `supabase`, `n8n`, `github`, `plugin:cloudflare:cloudflare-builds`, `plugin:cloudflare:cloudflare-observability` |
| Tempo total | ~5-6h em 1-2 sessões (Fase 1 ~2h, Fase 2 ~2h, Fase 3 ~1.5h) |

## Prompt inicial pra nova sessão (copy-paste)

```
Quero rodar uma auditoria completa do InkFlow SaaS, seguindo o spec
em docs/superpowers/specs/2026-05-07-auditoria-completa-saas-design.md.

Princípios cravados:
- READ-ONLY. Zero edits, zero migrations, zero deploys.
- Qualidade > velocidade. Não pular dimensões.
- Documentar achados objetivamente. Opinar SÓ na Fase 3.
- Comparar atual vs best practices SaaS profissional, não vs status quo.
- Use Agent (Explore) em paralelo pra mapear coisas independentes (repo,
  Supabase, n8n) — economiza contexto.
- Use MCPs disponíveis: supabase, n8n, github, cloudflare-builds,
  cloudflare-observability.

Output: docs/auditoria/2026-05-07-auditoria-completa.md (arquivo único).

Roda Fase 1 → pausa pra eu revisar → Fase 2 → pausa → Fase 3.
Não avança fase sem meu OK.

Comece confirmando o spec, listando MCPs disponíveis pra cada dimensão,
e depois vai pra Fase 1.1 (repo tree).
```

## Critério de sucesso

- Relatório markdown único em `docs/auditoria/2026-05-07-auditoria-completa.md`
- Diagrama arquitetura mermaid renderizável
- Roadmap de mitigação concreto: cada item tem `severity` + `esforço` + `dependências`
- Decisão sobre refator multi-agent re-cravada com base em achados (manter Modo A? mudar escopo? remover n8n integrado ao refator?)

## Próximos passos pós-auditoria

1. Leandro revisa relatório
2. Brainstorm dedicado pra cada P0 do roadmap (cada um é nova feature via `/nova-feature`)
3. Execução priorizada — refator multi-agent sai como spec OU re-spec dependendo dos achados
