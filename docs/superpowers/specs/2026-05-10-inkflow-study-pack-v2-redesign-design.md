# InkFlow Study Pack v2 — Redesign

**Data:** 2026-05-10
**Status:** Spec — aguardando review
**Owner:** Leandro (founder), Claude Code (executor)

---

## Contexto

O Study Pack v1 (`~/Desktop/InkFlow-Study-Pack/`, 7 arquivos, ~127KB, snapshot 2026-05-09) foi montado como **briefing geral** pra carregar no NotebookLM e estudar o projeto fora do Claude Code. Cobre arquitetura overview, fluxos críticos, código comentado de 5 arquivos-chave, env vars, perguntas iniciais, glossário curto.

O founder pediu uma evolução: **um dicionário e guia técnico abrangente** que sirva pra ele se introduzir na área de programação **através do próprio SaaS**. Não é um sistema de ensino — é matéria-prima organizada pro NotebookLM gerar aulas.

## Objetivo

Substituir o pack v1 por um **pack v2 redesenhado em 2 camadas (Referência + Narrativa)** que:

1. Cubra **todo o acervo técnico** do InkFlow (código + canonical docs + specs + vault relevante)
2. Explique cada conceito em 2 níveis: **foundational** (o que é em programação geral) + **InkFlow-specific** (como aparece no projeto)
3. Sirva como **fonte primária pro NotebookLM** — citação cirúrgica, sem alucinação, com Audio Overview e Mind Map coesos
4. Permita ao founder não-dev consultar termos no chat do NotebookLM ou ouvir Audio Overview narrando ligações

## Não-objetivos

- **Não** é tutorial / curso passo-a-passo. Não traça caminho de aulas.
- **Não** ensina programação do zero. Assume zero conhecimento mas cobre conceitos como referência, não como sequência didática.
- **Não** substitui `docs/canonical/` no repo (essa é a fonte da verdade pra dev). O pack é uma **vista derivada** otimizada pra estudo no NotebookLM.
- **Não** inclui valores de secrets (apenas nomes de env vars).
- **Não** inclui camada business/produto (CAC, LTV, etc) — escopo aprovado é só técnico.

## Estrutura proposta — 9 arquivos em 2 camadas

```
~/Desktop/InkFlow-Study-Pack/   (pack v2 — substitui v1)

00-LEIA-PRIMEIRO.md             [guia de uso v2]

# Camada 1 — REFERÊNCIA (consulta cirúrgica no chat NotebookLM)
01-dicionario-foundationals.md  [conceitos de programação que aparecem no InkFlow]
02-dicionario-inkflow.md        [termos específicos do projeto]
03-inventario-completo.md       [endpoints, tabelas, env vars, crons, scripts, auditores]

# Camada 2 — NARRATIVA (Audio Overview + Mind Map + leitura)
04-arquitetura-e-ecosystem.md   [mapa do todo + 8 serviços + integrações + fluxo de dados]
05-fluxos-criticos.md           [8 fluxos com mermaid — signup, trial→pago, IPN, bot, crons]
06-multi-agent-deep-dive.md     [refator atual: agents, prompts, validators, handoff, custos]

# Apoio
07-decisoes-arquiteturais.md    [por que cada escolha — herda de docs/canonical/decisions/]
08-perguntas-iniciais.md        [lista de perguntas pra colar no chat do NotebookLM]
```

### Detalhamento por arquivo

#### `00-LEIA-PRIMEIRO.md` (~3KB)
- Como usar o pack (NotebookLM + ChatGPT Pro em paralelo)
- Mapa dos 9 arquivos com "quando usar cada um"
- Workflow recomendado (Audio Overview → Mind Map → chat)
- Como atualizar o pack (comando pro Claude na próxima sessão)

#### `01-dicionario-foundationals.md` (~25-35KB)
Termos de programação organizados por domínio. Cada termo: **definição geral** + **onde aparece no InkFlow** (com link mental pro arquivo do código).

Domínios cobertos:
- **Web fundamentals** — HTTP, REST, methods, status codes, headers, body, cookie, session, CORS, preflight, MIME, JSON
- **JavaScript / TypeScript** — runtime, V8, event loop, sync/async, Promise, async/await, callback, closure, scope, hoisting, ESM vs CJS, module, import/export, generics, types vs interfaces, tree-shaking, bundler
- **Database / Postgres** — relational, schema, table, row, column, primary key, foreign key, index, query plan, transaction, ACID, isolation level, JSON vs JSONB, RLS, migration, seed, pooler, connection pool
- **Security** — authentication vs authorization, OAuth, OIDC, JWT, HMAC, bearer token, CSRF, XSS, SQL injection, secret management, key rotation, principle of least privilege, fail-open vs fail-closed
- **AI / LLM** — token, embedding, context window, temperature, top_p, system vs user prompt, few-shot, chain-of-thought, RAG, structured output, tool calling, hallucination, agent, handoff, validator
- **Infra / Cloud** — serverless, edge, origin, CDN, latency, throughput, cold start, runtime, region, DNS, TLS/SSL, certificate, webhook vs polling, idempotency, retry, exponential backoff
- **Dev workflow** — git, branch, PR, merge, rebase, conflict, CI/CD, smoke test, regression test, unit/integration/e2e, mock, stub, fixture, blue-green, canary, rollback, observability (logs/metrics/traces), SLI/SLO/SLA

#### `02-dicionario-inkflow.md` (~15-20KB)
Termos específicos do projeto. Reaproveita `06-glossario.md` v1 mas expande, organiza melhor, e cruza com o inventário.

Seções:
- Conceitos de produto (multi-tenant, tenant, hot path, cold path, Modo Coleta, sinal, orcid)
- Cloudflare InkFlow (Pages projeto `inkflow-saas`, Worker `inkflow-cron`, bindings, wrangler.toml, observability)
- Supabase InkFlow (project ref `bfzuxxuscyplfoimvomh`, tabelas core, RLS, JSONB columns)
- MercadoPago InkFlow (preapproval, IPN, external_reference, payment vs subscription, sinal vs assinatura)
- Evolution InkFlow (instâncias, central, APIKEY, global key, QR, webhooks)
- Telegram InkFlow (2 bots, chat_id, deep link, inline keyboard, callback_query)
- MailerLite InkFlow (3 grupos, automations)
- Multi-agent InkFlow (4 agents, structured output, handoff em código, validators, silently force pergunta)
- DevOps InkFlow (preflight, smoke tests, rotação secrets, auditores)

#### `03-inventario-completo.md` (~30-40KB)
Listagem **exaustiva**. Cada item: nome, propósito, localização, deps.

Seções:
- **Endpoints** — todos os arquivos `functions/api/*.js` (público, admin, webhooks, agent, tools, crons, telegram). ~40 endpoints. Cada um: método, path, auth, payload típico, response.
- **Tabelas Supabase** — cada tabela com cada coluna (tipo, nullable, default, FK, índice se houver), uso resumido. ~20 tabelas.
- **Env vars** — todas, organizadas por serviço (Cloudflare/Supabase/MP/Evolution/MailerLite/Telegram/OpenAI/internal). Apenas nomes — sem valores.
- **Cron schedules** — os 12 do `cron-worker/wrangler.toml` com horário, propósito, endpoint que chama, severidade.
- **Auditores** — os 5 ativos (key-expiry, rls-drift, deploy-health, billing-flow, vps-limits) com descrição e métricas.
- **Scripts** — `/scripts/*` com propósito de cada um.
- **Migrations** — lista (sem conteúdo) das migrations Supabase desde 2026-04-26.

#### `04-arquitetura-e-ecosystem.md` (~15-20KB)
Reaproveita `01-arquitetura-overview.md` v1 e expande com:
- ASCII map "8 serviços + setas de integração" (alto nível)
- Para cada serviço: propósito, URL prod, pontos de integração entrada/saída, config técnica
- Fluxo de dados típico (cliente final → resposta) narrado
- Auth: 3 mecanismos (admin JWT, onboarding_key, studio_token HMAC)
- Estado atual do refator multi-agent (status sub-1, sub-2, sub-3.1/2/3, sub-4)

#### `05-fluxos-criticos.md` (~25-30KB)
Reaproveita `02-fluxos-criticos.md` v1. Mantém os 8 fluxos com Mermaid:
1. Signup → trial
2. Trial → pago (subscription MP)
3. IPN MP (recebimento webhook)
4. Bot WhatsApp (cliente → orçamento)
5. Modo Coleta v2 (handoff Telegram)
6. Sinal de agendamento
7. Crons agendados (12 schedules)
8. Onboarding key → instância Evo

Adiciona seções "como debugar quando falha" pra cada fluxo (links pros runbooks).

#### `06-multi-agent-deep-dive.md` (~20-25KB)
Foco no refator P1 atual.

Seções:
- Por que o refator (auditoria 2026-05-07: tool-calling não escala em mini)
- Arquitetura alvo (router → 4 agents puros structured output, handoff em código JS)
- Cada agent: TattooAgent, CadastroAgent, PropostaAgent, PortfolioAgent — propósito, schema Zod, prompt resumido, validator
- Handoff matrix (de qual estado pra qual estado, qual gatilho)
- Validators e silently force pergunta
- Side-effects (orchestrator chama tools quando agent pede via `proxima_acao`)
- Custos (comparação n8n vs multi-agent)
- Status atual do refator (PRs abertos, sub-3.3 e sub-4 pendentes)

#### `07-decisoes-arquiteturais.md` (~10-15KB)
Por que cada escolha. Herda de `docs/canonical/decisions/` mas expande pro leitor não-dev.

Seções:
- Por que multi-tenant SaaS (vs instância por cliente)
- Por que self-hosted Evolution (vs WhatsApp Business API oficial)
- Por que Cloudflare Pages (vs Vercel/Netlify)
- Por que Supabase (vs Firebase/AWS)
- Por que MercadoPago (vs Stripe)
- Por que remover n8n (auditoria 2026-05-07)
- Por que studio_token HMAC (vs só JWT)
- Por que cron-worker separado (vs cron no Pages)
- Por que VPS Vultr pra Evolution (vs CF Workers)
- Por que Telegram pra Modo Coleta (vs notificação WA / push)

#### `08-perguntas-iniciais.md` (~6KB)
Reaproveita `05-perguntas-iniciais.md` v1 e expande pra 30-40 perguntas, organizadas por:
- Pra começar (visão geral)
- Pra entender pagamentos
- Pra entender o bot
- Pra entender o multi-agent
- Pra entender deploy/infra
- Pra entender os auditores
- Pra debug de incidentes

## Plano de execução com subagents

### Fase 1 — Pesquisa paralela (3 subagents Explore em paralelo)
1. **Subagent A** — lê `docs/canonical/*` completo, extrai termos InkFlow + decisões + IDs + flows + auditores. Reporta um sumário estruturado.
2. **Subagent B** — lê `functions/api/*.js` + `cron-worker/*` + `functions/_lib/*`, extrai inventário de endpoints, env vars, libs compartilhadas. Reporta lista exaustiva.
3. **Subagent C** — lê `docs/superpowers/specs/2026-05-*` (specs do refator) + `docs/canonical/n8n/`, extrai estado do multi-agent, agents, prompts, validators. Reporta resumo.

### Fase 2 — Redação paralela (até 4 subagents general-purpose em paralelo)
Cada subagent recebe sumário relevante da fase 1 + escreve seu arquivo. Subagents independentes (sem state compartilhado):

- **Subagent W1** — escreve `01-dicionario-foundationals.md` (input: lista de termos identificados nos sumários A/B/C)
- **Subagent W2** — escreve `02-dicionario-inkflow.md` + `03-inventario-completo.md` (input: sumários A + B)
- **Subagent W3** — escreve `04-arquitetura-e-ecosystem.md` + `05-fluxos-criticos.md` (input: sumários A + B, herda v1 com upgrade)
- **Subagent W4** — escreve `06-multi-agent-deep-dive.md` + `07-decisoes-arquiteturais.md` (input: sumário C + decisions canonical)

### Fase 3 — Costura e revisão (sessão principal)
- Sessão principal escreve `00-LEIA-PRIMEIRO.md` + `08-perguntas-iniciais.md` (precisa ver os outros arquivos primeiro)
- Sessão principal faz **review cruzado**: verifica que termos citados em N existem em 01/02, que arquitetura em 04 bate com inventário em 03, etc.
- Apaga pack v1, move v2 pra `~/Desktop/InkFlow-Study-Pack/`
- Atualiza Painel + Mapa Geral no vault Obsidian (per memory rule)

## Critérios de qualidade

**Cada arquivo deve:**
- Começar com `# Título` + 1 parágrafo de contexto
- Usar headers `##` por seção (não mais que 3 níveis: `#` `##` `###`)
- Citar arquivo/path real do código quando relevante (ex: "ver `functions/api/mp-ipn.js`")
- Apenas nomes de env vars, **nunca valores**
- Linguagem PT-BR casual com "tu" (preferência do user)
- Termos técnicos novos sempre com tradução curta entre parênteses na primeira menção
- Sem emojis (preferência cravada)

**Pack como um todo:**
- 0 contradições entre arquivos (review cruzado obrigatório)
- 0 referências a arquivos que não existem
- Snapshot date no `00-LEIA-PRIMEIRO.md`
- Total estimado 150-200KB (vs 127KB do v1) — mais denso, mais cobertura

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Subagents geram conteúdo divergente sobre o mesmo tópico | Sumários da fase 1 viram fonte única; review cruzado na fase 3 |
| Dicionário foundationals fica raso ou genérico (parece copy de stackoverflow) | Cada termo precisa do anchor "onde aparece no InkFlow" — força contextualização |
| Inventário fica desatualizado em 1 semana | Snapshot date explícito; comando de regen documentado em `00-LEIA-PRIMEIRO` |
| User perde Audio Overview já gerado do v1 | Aviso explícito antes de apagar v1; user gera novo Audio Overview do v2 |
| Pack fica grande demais pro NotebookLM (limite 50 sources, 500MB cada) | 9 arquivos × ~20KB médio = ~180KB total — bem dentro do limite |

## Critérios de "feito"

- [ ] 9 arquivos `.md` existem em `~/Desktop/InkFlow-Study-Pack/`
- [ ] Pack v1 antigo movido pra backup ou removido (após confirmação do user)
- [ ] Review cruzado feito (sem contradições, sem refs quebradas)
- [ ] Painel e Mapa Geral atualizados no vault
- [ ] User confirmou que conseguiu subir no NotebookLM e gerar Audio Overview v2

## Referências

- Pack v1: `~/Desktop/InkFlow-Study-Pack/`
- Repo: `~/Documents/inkflow-saas/`
- Canonical: `~/Documents/inkflow-saas/docs/canonical/`
- Specs do refator: `~/Documents/inkflow-saas/docs/superpowers/specs/2026-05-0[7-9]-*`
- Vault: `~/Documents/vault/`
