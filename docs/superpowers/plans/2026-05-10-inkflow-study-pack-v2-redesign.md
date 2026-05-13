# InkFlow Study Pack v2 — Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o pack v1 (`~/Desktop/InkFlow-Study-Pack/`, 7 arquivos, ~127KB) por um pack v2 redesenhado em 2 camadas (Referência + Narrativa) com 10 arquivos cobrindo todo o acervo técnico do InkFlow, com camada zero pra não-dev, otimizado pra NotebookLM.

**Architecture:** 3 fases — (1) pesquisa paralela com 3 subagents Explore que produzem sumários estruturados de canonical/code/specs; (2) redação paralela com 5 subagents general-purpose que consomem os sumários e escrevem 8 arquivos (01-08); (3) sessão principal escreve 00 e 09, faz review cruzado, migra v1→v2, atualiza vault. Critérios de qualidade aplicados como validações automatizadas (grep + wc).

**Tech Stack:** Markdown puro. Sem código. Pack vive em `~/Desktop/InkFlow-Study-Pack/` (fora de repo git). Spec-fonte: `docs/superpowers/specs/2026-05-10-inkflow-study-pack-v2-redesign-design.md`. Vault Obsidian é repo git (commit obrigatório no fim).

---

## File Structure

**Pack v2 final** (`~/Desktop/InkFlow-Study-Pack/`):
- `00-LEIA-PRIMEIRO.md` (~3-4KB) — guia de uso + ordem de leitura
- `01-fundamentos-programacao.md` (~45-55KB) ⭐ NOVO — absoluto zero ao básico operacional, foco profundo em linguagem de programação no Nível 0
- `02-dicionario-tecnico.md` (~25-35KB) — intermediário ao avançado, por domínio
- `03-dicionario-inkflow.md` (~15-20KB) — termos do projeto, por serviço
- `04-inventario-completo.md` (~30-40KB) — endpoints, tabelas, env vars, crons, scripts, auditores
- `05-arquitetura-e-ecosystem.md` (~15-20KB) — mapa do todo + 8 serviços + integrações
- `06-fluxos-criticos.md` (~25-30KB) — 8 fluxos com mermaid + debug
- `07-multi-agent-deep-dive.md` (~20-25KB) — refator atual
- `08-decisoes-arquiteturais.md` (~10-15KB) — por que cada escolha
- `09-perguntas-iniciais.md` (~6-8KB) — 30-40 perguntas pra colar no NotebookLM

**Backup v1** (`~/Desktop/InkFlow-Study-Pack-v1-backup-2026-05-12/`):
- 7 arquivos do pack v1 preservados pra referência

**Workspace temporário** (`/tmp/inkflow-study-pack-v2-build/`):
- Sumários da fase 1 (input pra fase 2)
- Logs de validação
- Working copy dos arquivos antes de mover pro destino

**Atualizações no vault** (`~/Documents/vault/`, repo git):
- `InkFlow — Painel.md` — entry no current state mencionando pack v2
- `InkFlow — Mapa geral.md` — link pro pack v2 atualizado
- 1 nota nova `InkFlow — Study Pack v2.md` — âncora pro pack

---

## Task 1: Setup do workspace e backup do v1

**Files:**
- Create: `/tmp/inkflow-study-pack-v2-build/` (workspace temporário)
- Create: `~/Desktop/InkFlow-Study-Pack-v1-backup-2026-05-12/` (backup v1)
- Read-only: `~/Desktop/InkFlow-Study-Pack/` (pack v1 atual, 7 arquivos)

- [ ] **Step 1: Criar workspace temporário**

```bash
mkdir -p /tmp/inkflow-study-pack-v2-build/{summaries,drafts,validations}
ls -la /tmp/inkflow-study-pack-v2-build/
```
Expected: 3 subdirs criadas (summaries, drafts, validations).

- [ ] **Step 2: Verificar pack v1 atual antes de backup**

```bash
ls -la ~/Desktop/InkFlow-Study-Pack/ | grep '\.md$' | wc -l
du -sh ~/Desktop/InkFlow-Study-Pack/
```
Expected: 7 arquivos `.md`, total ~127KB.

- [ ] **Step 3: Backup do v1**

```bash
cp -r ~/Desktop/InkFlow-Study-Pack/ ~/Desktop/InkFlow-Study-Pack-v1-backup-2026-05-12/
ls ~/Desktop/InkFlow-Study-Pack-v1-backup-2026-05-12/ | wc -l
```
Expected: 7 arquivos copiados.

- [ ] **Step 4: Confirmar spec e plan acessíveis**

```bash
ls -la ~/Documents/inkflow-saas/docs/superpowers/specs/2026-05-10-inkflow-study-pack-v2-redesign-design.md
ls -la ~/Documents/inkflow-saas/docs/superpowers/plans/2026-05-10-inkflow-study-pack-v2-redesign.md
```
Expected: ambos arquivos existem. Plan tem este arquivo.

---

## Task 2: Fase 1 — Pesquisa paralela (3 subagents Explore)

**Files:**
- Read-only: `~/Documents/inkflow-saas/docs/canonical/**/*.md`
- Read-only: `~/Documents/inkflow-saas/functions/**/*.js`, `cron-worker/**/*`, `functions/_lib/**/*.js`
- Read-only: `~/Documents/inkflow-saas/docs/superpowers/specs/2026-05-0[7-9]-*.md`, `docs/canonical/n8n/`
- Create: `/tmp/inkflow-study-pack-v2-build/summaries/A-canonical.md`
- Create: `/tmp/inkflow-study-pack-v2-build/summaries/B-code-inventory.md`
- Create: `/tmp/inkflow-study-pack-v2-build/summaries/C-multi-agent-state.md`

- [ ] **Step 1: Dispatch 3 subagents Explore em paralelo (single message com 3 Agent calls)**

**Subagent A — Canonical docs**:
```
description: "Sumário canonical InkFlow"
subagent_type: Explore
prompt: |
  Leia exaustivamente `~/Documents/inkflow-saas/docs/canonical/*` (toda a árvore: stack.md, flows.md, ids.md, decisions/*, runbooks/*, n8n/*, monitoring/*, security/*, etc).

  Produza um SUMÁRIO ESTRUTURADO em markdown com seções:

  ## 1. Termos InkFlow específicos
  Liste cada termo com 1-2 frases de definição. Cobre: multi-tenant, tenant, hot path, cold path, Modo Coleta, sinal, orcid, preapproval MP, IPN, external_reference, instância Evo, central, APIKEY/global key, deep link, chat_id, callback_query, studio_token, onboarding_key, structured output, handoff, validator, silently force pergunta, etc.

  ## 2. Decisões arquiteturais
  Liste cada decisão de docs/canonical/decisions/* com título + 1 parágrafo de "por que".

  ## 3. IDs e identificadores
  Project refs Supabase, Cloudflare account/zone IDs, MP user IDs, Evolution instance IDs, etc. Apenas estrutura/nomes — sem valores secretos.

  ## 4. Fluxos críticos
  Os 8 fluxos do flows.md com 1 parágrafo cada.

  ## 5. Auditores ativos
  5 auditores (key-expiry, rls-drift, deploy-health, billing-flow, vps-limits) — descrição + métricas.

  ## 6. Crons
  Os 12 schedules do cron-worker — horário + propósito + endpoint chamado.

  Salve em `/tmp/inkflow-study-pack-v2-build/summaries/A-canonical.md`. NÃO ESCREVA fora desse arquivo. Reporte o path no fim.
```

**Subagent B — Code inventory**:
```
description: "Inventário código InkFlow"
subagent_type: Explore
prompt: |
  Leia exaustivamente:
  - `~/Documents/inkflow-saas/functions/api/*.js` (todos endpoints)
  - `~/Documents/inkflow-saas/cron-worker/*.js` e `cron-worker/wrangler.toml`
  - `~/Documents/inkflow-saas/functions/_lib/*.js` (libs compartilhadas)
  - `~/Documents/inkflow-saas/scripts/*.sh`
  - `~/Documents/inkflow-saas/supabase/migrations/*.sql` (apenas listar, não ler conteúdo)
  - `~/Documents/inkflow-saas/wrangler.toml` (root) e `web/package.json`

  Produza SUMÁRIO em markdown com seções:

  ## 1. Endpoints (todos os arquivos functions/api/*.js)
  Tabela: arquivo | método | path | auth (admin JWT / studio_token / onboarding_key / pública) | propósito 1-frase.

  ## 2. Tabelas Supabase
  Liste tabelas detectáveis pelos imports/queries no código (ex: `from('estudios')`, `from('clientes')`). Pra cada: tabela + colunas que aparecem nos selects/inserts.

  ## 3. Env vars
  Grep por `env.XXX` e `process.env.XXX` em todo functions/ e cron-worker/. Liste cada env var única + onde é usada (1-2 arquivos representativos).

  ## 4. Cron schedules
  Os 12 schedules do cron-worker/wrangler.toml — horário cron + endpoint chamado.

  ## 5. Scripts
  Cada arquivo em scripts/*.sh — propósito 1-frase.

  ## 6. Libs compartilhadas
  Cada arquivo em functions/_lib/ — propósito 1-frase + funções principais exportadas.

  ## 7. Linguagens/formatos no projeto
  Confirme as 11 linguagens/formatos da spec (JS, TS, SQL, Bash, HTML, CSS/Tailwind, JSON, TOML, YAML, MD, .env). Adicione o volume de arquivos atual.

  Salve em `/tmp/inkflow-study-pack-v2-build/summaries/B-code-inventory.md`. NÃO ESCREVA fora desse arquivo. Reporte o path no fim.
```

**Subagent C — Multi-agent state**:
```
description: "Estado refator multi-agent"
subagent_type: Explore
prompt: |
  Leia:
  - `~/Documents/inkflow-saas/docs/superpowers/specs/2026-05-0[7-9]-*.md` (specs do refator multi-agent)
  - `~/Documents/inkflow-saas/docs/canonical/n8n/*` (estado anterior n8n)
  - Qualquer plano associado em `~/Documents/inkflow-saas/docs/superpowers/plans/2026-05-0*.md`
  - Código atual em `~/Documents/inkflow-saas/functions/agent/*.js` se existir

  Produza SUMÁRIO em markdown com seções:

  ## 1. Por que o refator
  Resumo da auditoria 2026-05-07 que motivou (tool-calling não escala em mini).

  ## 2. Arquitetura alvo
  Router → 4 agents (TattooAgent, CadastroAgent, PropostaAgent, PortfolioAgent). Handoff em código JS.

  ## 3. Cada agent
  Pra cada agent: propósito, schema Zod resumido (campos principais), prompt resumido (system instructions principais), validator que aplica.

  ## 4. Handoff matrix
  De qual estado pra qual estado, qual gatilho.

  ## 5. Side-effects
  Como o orchestrator chama tools quando agent pede via proxima_acao. Lista de tools disponíveis.

  ## 6. Status atual
  Sub-tarefas concluídas (sub-1, sub-2, sub-3.1/2/3, sub-4) e quais PRs ainda abertos. Inclua hashes de commit relevantes se aparecerem nas specs.

  ## 7. Custos
  Comparação n8n antigo vs multi-agent novo (tokens, latência, custo).

  Salve em `/tmp/inkflow-study-pack-v2-build/summaries/C-multi-agent-state.md`. NÃO ESCREVA fora desse arquivo. Reporte o path no fim.
```

Run: 3 Agent calls em paralelo, mesma tool message.

- [ ] **Step 2: Verificar 3 sumários gerados**

```bash
ls -la /tmp/inkflow-study-pack-v2-build/summaries/
wc -l /tmp/inkflow-study-pack-v2-build/summaries/*.md
```
Expected: 3 arquivos (A, B, C). Cada um com pelo menos 100 linhas (volume mínimo razoável).

- [ ] **Step 3: Spot-check qualidade dos sumários**

```bash
grep -E '^## ' /tmp/inkflow-study-pack-v2-build/summaries/A-canonical.md
grep -E '^## ' /tmp/inkflow-study-pack-v2-build/summaries/B-code-inventory.md
grep -E '^## ' /tmp/inkflow-study-pack-v2-build/summaries/C-multi-agent-state.md
```
Expected: A tem 6 sections, B tem 7, C tem 7 (conforme prompts).

Se algum subagent retornou sumário vazio ou faltando seções, **re-dispatch só ele** com prompt reforçado antes de prosseguir.

---

## Task 3: Fase 2 — Redação paralela (5 subagents general-purpose)

**Files:**
- Read-only inputs: `/tmp/inkflow-study-pack-v2-build/summaries/{A,B,C}.md`, spec original
- Create: `/tmp/inkflow-study-pack-v2-build/drafts/01-fundamentos-programacao.md`
- Create: `/tmp/inkflow-study-pack-v2-build/drafts/02-dicionario-tecnico.md`
- Create: `/tmp/inkflow-study-pack-v2-build/drafts/03-dicionario-inkflow.md`
- Create: `/tmp/inkflow-study-pack-v2-build/drafts/04-inventario-completo.md`
- Create: `/tmp/inkflow-study-pack-v2-build/drafts/05-arquitetura-e-ecosystem.md`
- Create: `/tmp/inkflow-study-pack-v2-build/drafts/06-fluxos-criticos.md`
- Create: `/tmp/inkflow-study-pack-v2-build/drafts/07-multi-agent-deep-dive.md`
- Create: `/tmp/inkflow-study-pack-v2-build/drafts/08-decisoes-arquiteturais.md`

- [ ] **Step 1: Dispatch 5 subagents general-purpose em paralelo (single message com 5 Agent calls)**

**Subagent W1 — Arquivo 01 (fundamentos programação)**:
```
description: "Redigir 01-fundamentos-programacao"
subagent_type: general-purpose
prompt: |
  Vais escrever o arquivo `01-fundamentos-programacao.md` do InkFlow Study Pack v2.

  ## Contexto
  - Spec completa do pack: `~/Documents/inkflow-saas/docs/superpowers/specs/2026-05-10-inkflow-study-pack-v2-redesign-design.md`. LEIA INTEIRA antes de começar.
  - Sumário B (linguagens reais do projeto): `/tmp/inkflow-study-pack-v2-build/summaries/B-code-inventory.md` — seção 7 confirma as 11 linguagens.

  ## Foco específico
  Esse arquivo é pra QUEM NUNCA PROGRAMOU. O founder é tatuador, solo founder, não-dev. Quer dominar termos partindo do absoluto zero pra estudar o próprio SaaS.

  ## Regras editoriais (não-negociáveis)
  - Linguagem: PT-BR casual com "tu" (não "você").
  - Sem emojis.
  - Termos técnicos novos: tradução curta entre parênteses na primeira menção.
  - Cada conceito: definição em linguagem natural + analogia concreta + onde aparece no InkFlow (sem profundidade — só "isso aparece quando..."), exceto Nível 0 que é mais conceitual.
  - Nunca usa um termo antes de defini-lo num lugar anterior.
  - Cita arquivo/path real do código quando relevante (ex: `functions/api/mp-ipn.js`).
  - APENAS NOMES de env vars, NUNCA valores.

  ## Estrutura (seguir EXATAMENTE a spec, seção "01-fundamentos-programacao.md")
  - Título + 1 parágrafo de contexto explicando pra quem é, como usar
  - Nível 0 — O que é programação e linguagem de programação (7 sub-blocos: 0.1 a 0.7) — esse é o nível MAIS DENSO, lê a spec inteira pra ver os 7 sub-blocos detalhados. Inclui a tabela das 11 linguagens/formatos reais do InkFlow (volume real do sumário B).
  - Nível 1 — Conceitos básicos de qualquer linguagem
  - Nível 2 — Estrutura e organização de código
  - Nível 3 — Como rodar e desenvolver código
  - Nível 4 — Versionamento e colaboração (Git/GitHub)
  - Nível 5 — Web básico (cliente vs servidor)
  - Nível 6 — Arquivos típicos de um projeto
  - Cada nível termina com quadro "Onde tu encontra isso no InkFlow".

  ## Tamanho alvo
  45-55KB. Não ficar aquém — Nível 0 sozinho deve ter ~20KB.

  ## Output
  Salve em `/tmp/inkflow-study-pack-v2-build/drafts/01-fundamentos-programacao.md`. Reporte path + tamanho final no fim.
```

**Subagent W2 — Arquivo 02 (dicionário técnico)**:
```
description: "Redigir 02-dicionario-tecnico"
subagent_type: general-purpose
prompt: |
  Vais escrever o arquivo `02-dicionario-tecnico.md` do InkFlow Study Pack v2.

  ## Contexto
  - Spec completa: `~/Documents/inkflow-saas/docs/superpowers/specs/2026-05-10-inkflow-study-pack-v2-redesign-design.md`. LEIA INTEIRA.
  - Sumário A: `/tmp/inkflow-study-pack-v2-build/summaries/A-canonical.md`
  - Sumário B: `/tmp/inkflow-study-pack-v2-build/summaries/B-code-inventory.md`
  - Sumário C: `/tmp/inkflow-study-pack-v2-build/summaries/C-multi-agent-state.md`

  ## Foco específico
  Intermediário ao avançado. PRESSUPÕE que o leitor já leu o `01-fundamentos-programacao.md` e domina termos básicos. NÃO repete conceitos do 01 — onde houver overlap, começa com "Pressupõe que tu já leu sobre [termo] no arquivo 01".

  ## Regras editoriais
  - PT-BR casual com "tu", sem emojis.
  - Tradução curta entre parênteses na primeira menção.
  - Cita path real de arquivo do código quando relevante.
  - Apenas nomes de env vars, nunca valores.
  - Dentro de cada domínio, ordem do mais simples ao mais complexo.

  ## Estrutura (seguir EXATAMENTE a spec)
  - Título + 1 parágrafo de contexto
  - Domínio: Web avançado
  - Domínio: JavaScript / TypeScript profundo
  - Domínio: Database / Postgres
  - Domínio: Segurança
  - Domínio: AI / LLM
  - Domínio: Infra / Cloud
  - Domínio: Dev workflow
  Cobertura completa dos termos listados na spec pra cada domínio.

  ## Tamanho alvo
  25-35KB.

  ## Output
  Salve em `/tmp/inkflow-study-pack-v2-build/drafts/02-dicionario-tecnico.md`. Reporte path + tamanho.
```

**Subagent W3 — Arquivos 03 (dicionário InkFlow) + 04 (inventário)**:
```
description: "Redigir 03-dicionario-inkflow + 04-inventario-completo"
subagent_type: general-purpose
prompt: |
  Vais escrever DOIS arquivos do InkFlow Study Pack v2.

  ## Contexto
  - Spec: `~/Documents/inkflow-saas/docs/superpowers/specs/2026-05-10-inkflow-study-pack-v2-redesign-design.md`. LEIA INTEIRA.
  - Sumário A (canonical): `/tmp/inkflow-study-pack-v2-build/summaries/A-canonical.md`
  - Sumário B (code inventory): `/tmp/inkflow-study-pack-v2-build/summaries/B-code-inventory.md`

  ## Regras editoriais (mesmas dos outros arquivos do pack)
  PT-BR com "tu", sem emojis, paths reais, apenas nomes de env vars.

  ## Arquivo 1: `03-dicionario-inkflow.md` (15-20KB)
  Termos específicos do projeto. Reaproveita conceitos do v1 mas expande e cruza com o inventário.
  Seções (todas obrigatórias, conforme spec):
  1. Conceitos de produto (multi-tenant, tenant, hot path, cold path, Modo Coleta, sinal, orcid)
  2. Cloudflare InkFlow
  3. Supabase InkFlow
  4. MercadoPago InkFlow
  5. Evolution InkFlow
  6. Telegram InkFlow
  7. MailerLite InkFlow
  8. Multi-agent InkFlow
  9. DevOps InkFlow

  Salva em `/tmp/inkflow-study-pack-v2-build/drafts/03-dicionario-inkflow.md`.

  ## Arquivo 2: `04-inventario-completo.md` (30-40KB)
  Listagem EXAUSTIVA. Cada item: nome, propósito, localização, deps.
  Seções (todas obrigatórias):
  1. Endpoints — todos os arquivos functions/api/*.js (~40 endpoints). Tabela: método, path, auth, payload típico, response.
  2. Tabelas Supabase — cada tabela com cada coluna (tipo, nullable, default, FK, índice se houver).
  3. Env vars — todas, organizadas por serviço. Apenas nomes.
  4. Cron schedules — os 12 do cron-worker/wrangler.toml.
  5. Auditores — os 5 ativos.
  6. Scripts — `/scripts/*` com propósito.
  7. Migrations — lista (sem conteúdo) das migrations Supabase desde 2026-04-26.

  Salva em `/tmp/inkflow-study-pack-v2-build/drafts/04-inventario-completo.md`.

  ## Output
  Reporte os 2 paths + tamanhos.
```

**Subagent W4 — Arquivos 05 (arquitetura) + 06 (fluxos críticos)**:
```
description: "Redigir 05-arquitetura + 06-fluxos-criticos"
subagent_type: general-purpose
prompt: |
  Vais escrever DOIS arquivos do InkFlow Study Pack v2.

  ## Contexto
  - Spec: `~/Documents/inkflow-saas/docs/superpowers/specs/2026-05-10-inkflow-study-pack-v2-redesign-design.md`. LEIA INTEIRA.
  - Sumário A: `/tmp/inkflow-study-pack-v2-build/summaries/A-canonical.md`
  - Sumário B: `/tmp/inkflow-study-pack-v2-build/summaries/B-code-inventory.md`
  - Pack v1 atual (reaproveitar e atualizar):
    - `~/Desktop/InkFlow-Study-Pack-v1-backup-2026-05-12/01-arquitetura-overview.md`
    - `~/Desktop/InkFlow-Study-Pack-v1-backup-2026-05-12/02-fluxos-criticos.md`

  ## Regras editoriais
  Mesmas dos outros arquivos. PT-BR com "tu", sem emojis, paths reais, apenas nomes de env vars.

  ## Arquivo 1: `05-arquitetura-e-ecosystem.md` (15-20KB)
  Reaproveita `01-arquitetura-overview.md` v1 e EXPANDE com:
  - ASCII map "8 serviços + setas de integração" (alto nível)
  - Para cada serviço: propósito, URL prod, pontos de integração entrada/saída, config técnica
  - Fluxo de dados típico (cliente final → resposta) narrado
  - Auth: 3 mecanismos (admin JWT, onboarding_key, studio_token HMAC)
  - Estado atual do refator multi-agent (status sub-1, sub-2, sub-3.1/2/3, sub-4)

  Salva em `/tmp/inkflow-study-pack-v2-build/drafts/05-arquitetura-e-ecosystem.md`.

  ## Arquivo 2: `06-fluxos-criticos.md` (25-30KB)
  Reaproveita `02-fluxos-criticos.md` v1. Mantém os 8 fluxos com Mermaid:
  1. Signup → trial
  2. Trial → pago (subscription MP)
  3. IPN MP (recebimento webhook)
  4. Bot WhatsApp (cliente → orçamento)
  5. Modo Coleta v2 (handoff Telegram)
  6. Sinal de agendamento
  7. Crons agendados (12 schedules)
  8. Onboarding key → instância Evo

  ADICIONA pra cada fluxo seção "como debugar quando falha" (links pros runbooks em docs/canonical/runbooks/).

  Salva em `/tmp/inkflow-study-pack-v2-build/drafts/06-fluxos-criticos.md`.

  ## Output
  Reporte os 2 paths + tamanhos.
```

**Subagent W5 — Arquivos 07 (multi-agent deep-dive) + 08 (decisões arquiteturais)**:
```
description: "Redigir 07-multi-agent + 08-decisoes"
subagent_type: general-purpose
prompt: |
  Vais escrever DOIS arquivos do InkFlow Study Pack v2.

  ## Contexto
  - Spec: `~/Documents/inkflow-saas/docs/superpowers/specs/2026-05-10-inkflow-study-pack-v2-redesign-design.md`. LEIA INTEIRA.
  - Sumário C (multi-agent state): `/tmp/inkflow-study-pack-v2-build/summaries/C-multi-agent-state.md`
  - Sumário A (canonical, pra decisions): `/tmp/inkflow-study-pack-v2-build/summaries/A-canonical.md`
  - Decisions canonical: `~/Documents/inkflow-saas/docs/canonical/decisions/*` (lê direto se precisar de detalhe)

  ## Regras editoriais
  Mesmas dos outros arquivos. PT-BR com "tu", sem emojis, paths reais, apenas nomes de env vars.

  ## Arquivo 1: `07-multi-agent-deep-dive.md` (20-25KB)
  Foco no refator P1 atual.
  Seções (todas obrigatórias, da spec):
  - Por que o refator (auditoria 2026-05-07: tool-calling não escala em mini)
  - Arquitetura alvo (router → 4 agents puros structured output, handoff em código JS)
  - Cada agent: TattooAgent, CadastroAgent, PropostaAgent, PortfolioAgent — propósito, schema Zod, prompt resumido, validator
  - Handoff matrix (de qual estado pra qual estado, qual gatilho)
  - Validators e silently force pergunta
  - Side-effects (orchestrator chama tools quando agent pede via proxima_acao)
  - Custos (comparação n8n vs multi-agent)
  - Status atual do refator (PRs abertos, sub-3.3 e sub-4 pendentes)

  Salva em `/tmp/inkflow-study-pack-v2-build/drafts/07-multi-agent-deep-dive.md`.

  ## Arquivo 2: `08-decisoes-arquiteturais.md` (10-15KB)
  Por que cada escolha. Herda de `docs/canonical/decisions/` mas expande pro leitor não-dev.
  Seções (todas obrigatórias, da spec):
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

  Salva em `/tmp/inkflow-study-pack-v2-build/drafts/08-decisoes-arquiteturais.md`.

  ## Output
  Reporte os 2 paths + tamanhos.
```

Run: 5 Agent calls em paralelo, mesma tool message.

- [ ] **Step 2: Verificar 8 arquivos gerados pelos 5 subagents**

```bash
ls -la /tmp/inkflow-study-pack-v2-build/drafts/
wc -l /tmp/inkflow-study-pack-v2-build/drafts/*.md
du -h /tmp/inkflow-study-pack-v2-build/drafts/*.md
```
Expected: 8 arquivos (01, 02, 03, 04, 05, 06, 07, 08). Tamanhos próximos das estimativas.

- [ ] **Step 3: Validações iniciais por arquivo (zero emojis, zero refs quebradas óbvias)**

```bash
# Zero emojis (regex captura emojis Unicode comuns)
for f in /tmp/inkflow-study-pack-v2-build/drafts/*.md; do
  count=$(grep -cP '[\x{1F300}-\x{1F9FF}]|[\x{2600}-\x{27BF}]' "$f" 2>/dev/null || echo "0")
  echo "$f: $count emojis"
done
```
Expected: todos os arquivos com 0 emojis. Se achar emoji, re-dispatch o subagent específico com regra reforçada.

```bash
# Volume mínimo: cada arquivo precisa ter pelo menos 60% do tamanho estimado mínimo
wc -c /tmp/inkflow-study-pack-v2-build/drafts/*.md
```
Expected (mínimos):
- 01: ≥27000 chars (45KB × 0.6)
- 02: ≥15000
- 03: ≥9000
- 04: ≥18000
- 05: ≥9000
- 06: ≥15000
- 07: ≥12000
- 08: ≥6000

Se algum arquivo ficou substancialmente abaixo, re-dispatch o subagent específico.

- [ ] **Step 4: Validar foco do arquivo 01 (sub-blocos 0.1 a 0.7 + tabela 11 linguagens)**

```bash
echo "=== Sub-blocos do Nível 0 ==="
grep -E '^\*\*0\.[0-9]' /tmp/inkflow-study-pack-v2-build/drafts/01-fundamentos-programacao.md
echo ""
echo "=== Linguagens citadas no quadro 11 linguagens ==="
grep -E '\b(JavaScript|TypeScript|SQL|Bash|HTML|CSS|JSON|TOML|YAML|Markdown|\.env)\b' /tmp/inkflow-study-pack-v2-build/drafts/01-fundamentos-programacao.md | head -20
```
Expected: 7 sub-blocos (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7). Tabela com 11 linguagens identificáveis.

Se faltar sub-bloco ou tabela, re-dispatch W1 com prompt reforçado.

---

## Task 4: Sessão principal escreve `09-perguntas-iniciais.md`

**Files:**
- Read: drafts dos 8 arquivos pra calibrar perguntas
- Read: `~/Desktop/InkFlow-Study-Pack-v1-backup-2026-05-12/05-perguntas-iniciais.md` (referência v1)
- Create: `/tmp/inkflow-study-pack-v2-build/drafts/09-perguntas-iniciais.md`

- [ ] **Step 1: Ler topicalmente os 8 drafts (apenas títulos `##`)**

```bash
for f in /tmp/inkflow-study-pack-v2-build/drafts/*.md; do
  echo "=== $f ==="
  grep -E '^## ' "$f" | head -15
done
```
Expected: panorama dos 8 arquivos pra calibrar perguntas que cubram todos.

- [ ] **Step 2: Escrever 09 com 30-40 perguntas organizadas por categoria**

Use Write pra criar `/tmp/inkflow-study-pack-v2-build/drafts/09-perguntas-iniciais.md` com estrutura:

```markdown
# Perguntas iniciais pro NotebookLM

> Cole essas perguntas no chat do NotebookLM (ou ChatGPT Pro) pra começar a estudar o InkFlow. Estão organizadas por tópico crescente. Sugerido fazer uma de cada vez e ler a resposta com calma.

## Pra começar (visão geral)
1. Em uma linguagem bem simples, o que é o InkFlow e quem usa ele?
2. Quais são as 8 peças principais que formam o InkFlow? Como elas se conectam?
3. ...

## Pra entender pagamentos
...

## Pra entender o bot
...

## Pra entender o multi-agent
...

## Pra entender deploy/infra
...

## Pra entender os auditores
...

## Pra debug de incidentes
...
```

Tamanho alvo: 6-8KB. ~35 perguntas no total. Cada categoria ~5 perguntas.

- [ ] **Step 3: Verificar arquivo gerado**

```bash
wc -c /tmp/inkflow-study-pack-v2-build/drafts/09-perguntas-iniciais.md
grep -cE '^[0-9]+\.' /tmp/inkflow-study-pack-v2-build/drafts/09-perguntas-iniciais.md
grep -cE '^## ' /tmp/inkflow-study-pack-v2-build/drafts/09-perguntas-iniciais.md
```
Expected: ~6000-8000 chars. ≥30 perguntas numeradas. ≥7 categorias.

---

## Task 5: Sessão principal escreve `00-LEIA-PRIMEIRO.md`

**Files:**
- Read: todos os 9 drafts (precisa saber o que cada um tem antes de escrever o guia)
- Create: `/tmp/inkflow-study-pack-v2-build/drafts/00-LEIA-PRIMEIRO.md`

- [ ] **Step 1: Coletar tamanhos finais de todos os drafts**

```bash
ls -lh /tmp/inkflow-study-pack-v2-build/drafts/*.md
```
Expected: 9 arquivos (01-09). Anotar tamanhos pro 00 listar.

- [ ] **Step 2: Escrever 00-LEIA-PRIMEIRO**

Use Write pra criar `/tmp/inkflow-study-pack-v2-build/drafts/00-LEIA-PRIMEIRO.md`:

```markdown
# InkFlow Study Pack v2 — Leia primeiro

**Snapshot:** 2026-05-12
**Versão:** v2 (substitui o v1 de 2026-05-09)
**Total:** 10 arquivos, ~XXX KB

## O que é esse pack
Material de estudo do InkFlow SaaS pro founder. Pra subir no NotebookLM, gerar Audio Overview e Mind Map, e consultar termos no chat. Não é tutorial nem curso — é matéria-prima organizada.

## Como usar
[explicação NotebookLM + ChatGPT Pro em paralelo]

## Mapa dos 10 arquivos
| Arquivo | Tamanho | Pra que serve |
|---|---|---|
| 00-LEIA-PRIMEIRO.md | ~3-4KB | Esse arquivo. Guia de uso. |
| 01-fundamentos-programacao.md | XXX KB | Absoluto zero ao básico operacional. Pra quem nunca programou. |
| 02-dicionario-tecnico.md | XXX KB | Intermediário ao avançado. Pressupõe leitura do 01. |
| ... | | |

## Ordem de leitura recomendada (pra não-dev)
1. **Comece pelo 01** — Nível 0 cobre o que é programação e linguagem de programação. Se sentir denso, lê em pedaços.
2. **Depois 05** — arquitetura geral. Vê o mapa do projeto.
3. **Ouve o Audio Overview** que o NotebookLM gerar.
4. **Consulta 02/03/04 sob demanda** — quando o 05 ou Audio Overview citar termo desconhecido.
5. **Lê 06 (fluxos)** quando quiser entender "como uma coisa acontece do começo ao fim".
6. **Lê 07 (multi-agent)** quando quiser mergulhar no refator atual.
7. **Lê 08 (decisões)** quando se perguntar "por que escolhemos X em vez de Y".
8. **Cola 09 no chat** pra fazer perguntas estruturadas ao NotebookLM.

## Como atualizar o pack na próxima sessão
Comando pra colar no Claude:
> "Atualiza o InkFlow Study Pack v2 — releia o spec em `~/Documents/inkflow-saas/docs/superpowers/specs/2026-05-10-inkflow-study-pack-v2-redesign-design.md` e o plano em `~/Documents/inkflow-saas/docs/superpowers/plans/2026-05-10-inkflow-study-pack-v2-redesign.md`, regenera os 10 arquivos com snapshot date de hoje."
```

Substituir XXX pelos tamanhos reais coletados no step 1.

- [ ] **Step 3: Verificar arquivo gerado**

```bash
wc -c /tmp/inkflow-study-pack-v2-build/drafts/00-LEIA-PRIMEIRO.md
grep -E '^## ' /tmp/inkflow-study-pack-v2-build/drafts/00-LEIA-PRIMEIRO.md
ls /tmp/inkflow-study-pack-v2-build/drafts/*.md | wc -l
```
Expected: ~3000-4000 chars. ≥4 sections. **10 arquivos** no diretório drafts.

---

## Task 6: Review cruzado — validações automatizadas

**Files:**
- Read: todos os 10 drafts em `/tmp/inkflow-study-pack-v2-build/drafts/`
- Create: `/tmp/inkflow-study-pack-v2-build/validations/report.md`

- [ ] **Step 1: Validação 1 — zero emojis em todos os 10 arquivos**

```bash
echo "=== EMOJI CHECK ==="
for f in /tmp/inkflow-study-pack-v2-build/drafts/*.md; do
  count=$(grep -cP '[\x{1F300}-\x{1F9FF}]|[\x{2600}-\x{27BF}]' "$f" 2>/dev/null || echo "0")
  if [ "$count" -gt 0 ]; then
    echo "FAIL: $f has $count emoji(s)"
    grep -P '[\x{1F300}-\x{1F9FF}]|[\x{2600}-\x{27BF}]' "$f" | head -3
  fi
done
echo "=== END EMOJI CHECK ==="
```
Expected: nenhum FAIL.

Se algum arquivo tem emoji: usar Edit pra remover, ou re-dispatch subagent específico.

- [ ] **Step 2: Validação 2 — zero referências a arquivos inexistentes no pack**

```bash
echo "=== CROSS-REF CHECK ==="
# Lista arquivos referenciados (`XX-nome.md`)
grep -hoE '[0-9]{2}-[a-z-]+\.md' /tmp/inkflow-study-pack-v2-build/drafts/*.md | sort -u > /tmp/inkflow-study-pack-v2-build/validations/refs.txt
ls /tmp/inkflow-study-pack-v2-build/drafts/ | sort > /tmp/inkflow-study-pack-v2-build/validations/files.txt
echo "Refs found:"
cat /tmp/inkflow-study-pack-v2-build/validations/refs.txt
echo ""
echo "Files exist:"
cat /tmp/inkflow-study-pack-v2-build/validations/files.txt
echo ""
echo "Refs NOT in files (broken):"
comm -23 /tmp/inkflow-study-pack-v2-build/validations/refs.txt /tmp/inkflow-study-pack-v2-build/validations/files.txt
echo "=== END CROSS-REF CHECK ==="
```
Expected: linha "Refs NOT in files (broken):" com nada abaixo.

Se houver refs quebradas: usar Edit pra corrigir nome do arquivo referenciado.

- [ ] **Step 3: Validação 3 — zero "valores de secrets" vazados (apenas nomes de env vars)**

```bash
echo "=== SECRETS CHECK ==="
# Padrões de valores reais que podem ter vazado
grep -nE '(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL=|MP_ACCESS_TOKEN=|EVOLUTION_API_KEY=|ADMIN_JWT_SECRET=|CRON_SECRET=|TELEGRAM_BOT_TOKEN=|MAILERLITE_API_KEY=|OPENAI_API_KEY=)[^N$]\S{10,}' /tmp/inkflow-study-pack-v2-build/drafts/*.md | head -20
# JWTs vazados (3 segmentos base64)
grep -nE '\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}' /tmp/inkflow-study-pack-v2-build/drafts/*.md | head -5
# Hex-secrets longos
grep -nE '\b[a-f0-9]{40,}\b' /tmp/inkflow-study-pack-v2-build/drafts/*.md | head -5
echo "=== END SECRETS CHECK ==="
```
Expected: zero matches em todos os 3 padrões.

Se algum match: PARAR imediatamente. Não prosseguir até remover. Editar o arquivo afetado pra substituir valor por `<valor omitido — só o nome da env var>`.

- [ ] **Step 4: Validação 4 — termos técnicos definidos antes de uso**

Esse é validação manual mais leve. Spot-check em 5 termos críticos:

```bash
echo "=== TERM-FIRST-USE CHECK ==="
for term in "studio_token" "structured output" "preapproval" "RLS" "JIT"; do
  echo "--- $term ---"
  grep -l "$term" /tmp/inkflow-study-pack-v2-build/drafts/*.md | head -3
done
echo "=== END ==="
```

Inspeciona manualmente: termo deve aparecer pela primeira vez **com definição** num arquivo de número menor que onde aparece sem definição. Ex: "structured output" deve estar definido em 02 (seção AI/LLM) antes de aparecer no 03/07 sem definição.

Se identificar uso antes de definição: usar Edit pra adicionar parêntese curto na primeira menção sem definição.

- [ ] **Step 5: Validação 5 — totais de tamanho dentro do alvo**

```bash
echo "=== SIZE CHECK ==="
total=$(wc -c /tmp/inkflow-study-pack-v2-build/drafts/*.md | tail -1 | awk '{print $1}')
echo "Total: $total bytes (~$((total / 1024)) KB)"
echo "Target: 200KB-260KB (204800-266240 bytes)"
if [ "$total" -lt 184320 ]; then
  echo "WARN: muito abaixo do alvo (180KB)"
elif [ "$total" -gt 286720 ]; then
  echo "WARN: muito acima do alvo (280KB)"
else
  echo "OK"
fi
echo "=== END ==="
```
Expected: OK ou warn aceitável (±10% do alvo).

- [ ] **Step 6: Salvar relatório de validação**

```bash
{
  echo "# Pack v2 Validation Report"
  echo ""
  echo "**Data:** $(date '+%Y-%m-%d %H:%M')"
  echo ""
  echo "## Arquivos gerados"
  ls -lh /tmp/inkflow-study-pack-v2-build/drafts/*.md
  echo ""
  echo "## Total"
  wc -c /tmp/inkflow-study-pack-v2-build/drafts/*.md | tail -1
  echo ""
  echo "## Validações"
  echo "- Emojis: 0"
  echo "- Refs quebradas: 0"
  echo "- Secrets vazados: 0"
  echo "- Termos não-definidos antes de uso: revisado manualmente"
  echo "- Tamanho total dentro do alvo: sim"
} > /tmp/inkflow-study-pack-v2-build/validations/report.md
cat /tmp/inkflow-study-pack-v2-build/validations/report.md
```
Expected: relatório criado.

---

## Task 7: Migração v1 → v2

**Files:**
- Move (overwrite): `/tmp/inkflow-study-pack-v2-build/drafts/*.md` → `~/Desktop/InkFlow-Study-Pack/`
- Pre-existing: `~/Desktop/InkFlow-Study-Pack-v1-backup-2026-05-12/` (já criado em Task 1)

- [ ] **Step 1: Confirmar backup do v1 existe e tem 7 arquivos**

```bash
ls ~/Desktop/InkFlow-Study-Pack-v1-backup-2026-05-12/*.md | wc -l
```
Expected: 7. Se < 7, ABORTAR e refazer Task 1 step 3.

- [ ] **Step 2: Apagar pack v1 antigo do destino (NÃO apagar o backup)**

```bash
ls ~/Desktop/InkFlow-Study-Pack/
rm ~/Desktop/InkFlow-Study-Pack/*.md
ls ~/Desktop/InkFlow-Study-Pack/
```
Expected: diretório vazio depois do rm. **NÃO usar `rm -rf` no diretório inteiro** — só os `.md`.

- [ ] **Step 3: Copiar v2 pro destino**

```bash
cp /tmp/inkflow-study-pack-v2-build/drafts/*.md ~/Desktop/InkFlow-Study-Pack/
ls -lh ~/Desktop/InkFlow-Study-Pack/
```
Expected: 10 arquivos `.md` no destino, tamanhos batendo com drafts.

- [ ] **Step 4: Validar destino final**

```bash
ls ~/Desktop/InkFlow-Study-Pack/*.md | wc -l
du -sh ~/Desktop/InkFlow-Study-Pack/
```
Expected: 10 arquivos, total ~200-260KB.

---

## Task 8: Atualizar vault Obsidian + MEMORY.md

**Files:**
- Detect: `~/Documents/vault/InkFlow — Painel.md` (path padrão — pode não existir)
- Detect: `~/Documents/vault/InkFlow — Mapa geral.md` (path padrão — pode não existir)
- Create: `~/Documents/vault/InkFlow — Study Pack v2.md` (nota-âncora)
- Modify: `/Users/brazilianhustler/.claude/projects/-Users-brazilianhustler/memory/MEMORY.md`

> **Nota:** verificação prévia (12/05) mostrou que `InkFlow — Painel.md` e `InkFlow — Mapa geral.md` NÃO existem nos paths padrão. O plano detecta e age conforme presença real — se não existirem, pula edição (sem criar do zero, porque essas notas têm estrutura que o user mantém).

- [ ] **Step 1: Inspecionar estado do vault (não exigir clean)**

```bash
cd ~/Documents/vault && git status --short
```
Expected: pode ter staged/modified — vault tem hook automático de git sync per memory rule `[[automation_git_sync]]`. Não exigir clean. Apenas confirmar visualmente que não há conflitos óbvios.

- [ ] **Step 2: Detectar paths reais de Painel e Mapa Geral**

```bash
echo "=== Procurando Painel ==="
find ~/Documents/vault -maxdepth 4 -iname "*Painel*" -o -iname "*painel*" 2>/dev/null
echo ""
echo "=== Procurando Mapa geral ==="
find ~/Documents/vault -maxdepth 4 -iname "*Mapa*" 2>/dev/null
```

Resultados possíveis:
- **Achou ambos**: usar paths reais nos steps 4 e 5
- **Achou só um**: editar o que achou, reportar o que não achou no step 7 (não criar do zero — user mantém estrutura)
- **Não achou nenhum**: pular steps 4 e 5, reportar no step 7 (user decide criar manualmente depois)

- [ ] **Step 3: Criar nota-âncora `InkFlow — Study Pack v2.md`**

Use Write pra criar `~/Documents/vault/InkFlow — Study Pack v2.md` com:

```markdown
---
tags: [inkflow, study-pack, referencia]
created: 2026-05-12
---

# InkFlow — Study Pack v2

**Localização:** `~/Desktop/InkFlow-Study-Pack/` (10 arquivos, ~XXX KB)
**Backup v1:** `~/Desktop/InkFlow-Study-Pack-v1-backup-2026-05-12/`
**Spec:** [[inkflow-saas/docs/superpowers/specs/2026-05-10-inkflow-study-pack-v2-redesign-design]]
**Plan:** [[inkflow-saas/docs/superpowers/plans/2026-05-10-inkflow-study-pack-v2-redesign]]

## O que é
Pack de estudo do InkFlow pra subir no NotebookLM. 10 arquivos em 2 camadas (Referência + Narrativa), com camada zero pra não-dev.

## Estrutura
- `00-LEIA-PRIMEIRO.md` — guia de uso
- `01-fundamentos-programacao.md` — absoluto zero ao básico operacional (Nível 0–6)
- `02-dicionario-tecnico.md` — intermediário ao avançado por domínio
- `03-dicionario-inkflow.md` — termos específicos do projeto
- `04-inventario-completo.md` — endpoints, tabelas, env vars, crons, scripts
- `05-arquitetura-e-ecosystem.md` — mapa + 8 serviços + integrações
- `06-fluxos-criticos.md` — 8 fluxos com mermaid
- `07-multi-agent-deep-dive.md` — refator atual
- `08-decisoes-arquiteturais.md` — por que cada escolha
- `09-perguntas-iniciais.md` — perguntas pro NotebookLM

## Histórico
- 2026-05-09: pack v1 criado (7 arquivos, ~127KB)
- 2026-05-12: pack v2 substitui v1 (10 arquivos, ~XXX KB) — adiciona camada zero pra não-dev, foco profundo em linguagem de programação

## Como atualizar
Releia spec + plan e regenera os 10 arquivos com snapshot date novo.

## Links
- [[InkFlow — Mapa geral]]
- [[InkFlow — Arquitetura]]
- [[InkFlow — Painel]]
```

Substituir XXX pelo tamanho real de Task 7 step 4.

- [ ] **Step 4: Atualizar `InkFlow — Painel.md` (SE existir no step 2)**

Se step 2 achou Painel: Read o path real, depois Edit pra adicionar entry no "current state":

```markdown
### 2026-05-12 — Study Pack v2 entregue

Pack de estudo redesenhado: 10 arquivos (vs 7 do v1), ~XXX KB (vs 127KB), com camada zero pra não-dev e foco profundo em linguagem de programação no Nível 0. v1 backupeado em `~/Desktop/InkFlow-Study-Pack-v1-backup-2026-05-12/`.

Próximo: subir no NotebookLM e gerar Audio Overview v2.

Ver: [[InkFlow — Study Pack v2]]
```

**Se NÃO existir**: pular este step, marcar pendência pro step 7.

- [ ] **Step 5: Atualizar `InkFlow — Mapa geral.md` (SE existir no step 2)**

Se step 2 achou Mapa geral: Read o path real, depois Edit pra adicionar link na seção apropriada:

```markdown
- [[InkFlow — Study Pack v2]] — pack de estudo NotebookLM (10 arquivos)
```

**Se NÃO existir**: pular este step, marcar pendência pro step 7.

- [ ] **Step 6: Atualizar `MEMORY.md` (auto-memory)**

Path: `/Users/brazilianhustler/.claude/projects/-Users-brazilianhustler/memory/MEMORY.md`

Adicionar linha (mantendo ordem semântica do arquivo, próximo de outras entries InkFlow):

```
- [[InkFlow — Study Pack v2 (2026-05-12)]] — pack NotebookLM v2 publicado 12/05; 10 arquivos em 2 camadas; substituiu v1 (backup em `~/Desktop/InkFlow-Study-Pack-v1-backup-2026-05-12/`)
```

Também criar o arquivo de memory referenciado pelo link wiki em `/Users/brazilianhustler/.claude/projects/-Users-brazilianhustler/memory/inkflow_study_pack_v2.md`:

```markdown
---
name: inkflow-study-pack-v2
description: Pack NotebookLM v2 do InkFlow — 10 arquivos em 2 camadas; substituiu v1 em 2026-05-12
metadata:
  type: project
---

Pack v2 publicado em `~/Desktop/InkFlow-Study-Pack/` (10 arquivos, ~XXX KB), substituindo v1 (7 arquivos, ~127KB; backup em `~/Desktop/InkFlow-Study-Pack-v1-backup-2026-05-12/`).

**Why:** founder não-dev precisa material organizado pra estudar o SaaS via NotebookLM; v1 cobriu briefing geral mas faltava camada zero pra absoluto iniciante.

**How to apply:** se user pedir pra regenerar/atualizar pack, releia spec `docs/superpowers/specs/2026-05-10-inkflow-study-pack-v2-redesign-design.md` + plan `docs/superpowers/plans/2026-05-10-inkflow-study-pack-v2-redesign.md`, regenera os 10 arquivos com snapshot date atual.

Relacionado: [[InkFlow — Painel]], [[InkFlow — Mapa geral]].
```

- [ ] **Step 7: Verificar diff e commit no vault**

```bash
cd ~/Documents/vault && git status --short && git diff --stat
```

Listar arquivos modificados. Commit com lista variável (Painel/Mapa podem ou não estar presentes):

```bash
cd ~/Documents/vault
FILES_TO_COMMIT="InkFlow — Study Pack v2.md"
[ -f "InkFlow — Painel.md" ] && git diff --quiet "InkFlow — Painel.md" || FILES_TO_COMMIT="$FILES_TO_COMMIT|InkFlow — Painel.md"
# ajustar conforme paths reais descobertos no step 2

# git add explícito (sem -A)
git add "InkFlow — Study Pack v2.md"
# adicionar Painel/Mapa se existirem e foram editados

git commit -m "$(cat <<'EOF'
inkflow: study pack v2 entregue

10 arquivos (~XXX KB) substituem v1 (7 arquivos, 127KB). Adiciona camada zero pra não-dev com foco profundo em linguagem de programação no Nível 0. Pack em ~/Desktop/InkFlow-Study-Pack/, backup v1 preservado.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git status
```

**Pendências a reportar ao user no step final (Task 9)**:
- Se Painel/Mapa não existiam: dizer "não atualizei Painel/Mapa Geral porque não encontrei nos paths esperados. Quer que eu crie do zero ou aponta o path real?"

Substituir XXX pelo tamanho real.

---

## Task 9: Limpeza de workspace temporário e verificação final

**Files:**
- Delete: `/tmp/inkflow-study-pack-v2-build/` (workspace temporário)

- [ ] **Step 1: Verificação final do pack v2 no destino**

```bash
echo "=== PACK V2 FINAL ==="
ls -lh ~/Desktop/InkFlow-Study-Pack/
echo ""
echo "Total:"
du -sh ~/Desktop/InkFlow-Study-Pack/
echo ""
echo "Count:"
ls ~/Desktop/InkFlow-Study-Pack/*.md | wc -l
echo ""
echo "=== BACKUP V1 ==="
ls ~/Desktop/InkFlow-Study-Pack-v1-backup-2026-05-12/ | wc -l
```
Expected: 10 arquivos no destino. 7 arquivos no backup. Total ~200-260KB.

- [ ] **Step 2: Remover workspace temporário (opcional — pode preservar pra debug)**

```bash
echo "Workspace temporário em /tmp/inkflow-study-pack-v2-build/ preservado pra debug. Apagar com:"
echo "  rm -rf /tmp/inkflow-study-pack-v2-build/"
```

Não apagar automaticamente. User decide se quer preservar.

- [ ] **Step 3: Reportar ao user**

Reportar ao user, em resposta de texto:
- 10 arquivos no destino, total XXX KB
- Backup v1 preservado em path Y
- Vault Obsidian commitado (e que arquivos foram atualizados — pode ser parcial se Painel/Mapa não existiam)
- MEMORY.md atualizado com entry pro Pack v2
- Se houver pendências (Painel/Mapa não existentes): listar aqui pra user decidir próxima ação
- Sugerir próximos passos: (a) subir os 10 arquivos no NotebookLM como source, (b) gerar Audio Overview v2, (c) testar consultando termos no chat do NotebookLM

---

## Critérios de "feito" (do spec)

- [ ] 10 arquivos `.md` existem em `~/Desktop/InkFlow-Study-Pack/` (Task 7 step 4)
- [ ] Pack v1 antigo movido pra backup (Task 1 step 3 + Task 7 step 2)
- [ ] Review cruzado feito sem contradições/refs quebradas (Task 6)
- [ ] Nota-âncora `InkFlow — Study Pack v2.md` criada no vault (Task 8 step 3)
- [ ] MEMORY.md atualizado com entry pro pack v2 (Task 8 step 6)
- [ ] Painel e Mapa Geral atualizados no vault SE existirem (Task 8 steps 4-5; se não existirem, pendência reportada no step 7)
- [ ] User confirmou que conseguiu subir no NotebookLM e gerar Audio Overview v2 (manual, post-implementation)
