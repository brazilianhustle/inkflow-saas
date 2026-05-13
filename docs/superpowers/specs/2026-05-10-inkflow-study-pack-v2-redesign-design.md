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

## Princípio editorial: progressão iniciante → avançado

O founder é **não-dev** e quer dominar termos partindo do absoluto zero. Os dicionários gerais (arquivos 01 e 02) são organizados em **níveis crescentes de complexidade**: 01 cobre Nível 0–6 (absoluto zero ao básico operacional), 02 retoma como "intermediário ao avançado" e organiza por domínio (web, JS, DB, security, AI, infra, dev workflow). Dentro de cada domínio do 02, ordem do mais simples ao mais complexo. **Nunca usa um termo antes de defini-lo num lugar anterior.** O dicionário InkFlow (03) é organizado por serviço — não usa progressão por nível porque pressupõe que o leitor consultou 01/02 antes.

## Estrutura proposta — 10 arquivos em 2 camadas

```
~/Desktop/InkFlow-Study-Pack/   (pack v2 — substitui v1)

00-LEIA-PRIMEIRO.md             [guia de uso v2 + ordem de leitura recomendada]

# Camada 1 — REFERÊNCIA (consulta cirúrgica no chat NotebookLM)
01-fundamentos-programacao.md   [absoluto zero: variável, função, arquivo, terminal, git, web básico]
02-dicionario-tecnico.md        [intermediário ao avançado: web, JS/TS, DB, security, AI, infra, dev workflow]
03-dicionario-inkflow.md        [termos específicos do projeto]
04-inventario-completo.md       [endpoints, tabelas, env vars, crons, scripts, auditores]

# Camada 2 — NARRATIVA (Audio Overview + Mind Map + leitura)
05-arquitetura-e-ecosystem.md   [mapa do todo + 8 serviços + integrações + fluxo de dados]
06-fluxos-criticos.md           [8 fluxos com mermaid — signup, trial→pago, IPN, bot, crons]
07-multi-agent-deep-dive.md     [refator atual: agents, prompts, validators, handoff, custos]

# Apoio
08-decisoes-arquiteturais.md    [por que cada escolha — herda de docs/canonical/decisions/]
09-perguntas-iniciais.md        [lista de perguntas pra colar no chat do NotebookLM]
```

### Detalhamento por arquivo

#### `00-LEIA-PRIMEIRO.md` (~3-4KB)
- Como usar o pack (NotebookLM + ChatGPT Pro em paralelo)
- Mapa dos 10 arquivos com "quando usar cada um"
- **Ordem de leitura recomendada** pra não-dev: começa por 01 (fundamentos zero) → 05 (arquitetura) → ouve Audio Overview → consulta 02/03/04 sob demanda
- Como atualizar o pack (comando pro Claude na próxima sessão)

#### `01-fundamentos-programacao.md` (~30-40KB) ⭐ NOVO
**Absoluto zero ao básico operacional.** Pra quem nunca programou. Cada termo: **definição em linguagem natural** + **analogia concreta** + **onde tu vai ver isso no InkFlow** (sem ainda explicar profundamente — só "isso aparece quando..."). Organizado em 6 níveis de complexidade crescente.

**Nível 0 — O que é programação**
- Código, linguagem de programação, arquivo de código (`.js`, `.ts`, `.html`)
- Programa, software, aplicação, app
- Compilado vs interpretado
- Hardware vs software, sistema operacional, kernel, processo, memória, CPU
- O que significa "rodar" um programa

**Nível 1 — Conceitos básicos de qualquer linguagem**
- Variável (string, número/integer/float, booleano, null, undefined)
- Tipos primitivos vs estruturas
- Array / lista (coleção ordenada)
- Object / dicionário / hash / map (chave→valor)
- Operadores (matemáticos `+ - * /`, comparação `== === < >`, lógicos `&& || !`)
- Condicional (`if / else`, ternário)
- Loop (`for`, `while`, `forEach`, `map`)
- Função (parâmetro, argumento, retorno, escopo)
- Comentário
- Erro / exception / try/catch
- `console.log` (jeito básico de "ver" o que o código tá fazendo)

**Nível 2 — Estrutura e organização de código**
- Módulo, arquivo, pasta
- `import` / `export`
- Biblioteca / library / package / dependência
- Package manager (`npm`, `yarn`, `pnpm`)
- `package.json`, `package-lock.json`, `node_modules`
- Versão (semver: `major.minor.patch`, `^`, `~`)
- Configuração (`tsconfig.json`, `wrangler.toml`, etc — só o conceito de arquivo de config)

**Nível 3 — Como rodar e desenvolver código**
- Terminal / shell / linha de comando
- Comandos básicos: `cd`, `ls`, `mkdir`, `cat`, `cp`, `mv`, `rm`
- Editor de código / IDE (VSCode, Cursor)
- Run / executar
- Build / compilar / transpilar / bundler (conceito básico)
- Servidor local / dev server / hot reload
- `localhost`, porta (3000, 8080, etc)
- Stdout, stderr, exit code

**Nível 4 — Versionamento e colaboração (Git/GitHub)**
- Git: o que é versionamento de código
- Repositório local vs remoto (GitHub)
- `commit`, `branch`, `merge`, `rebase`, `push`, `pull`, `clone`, `fetch`
- Conflito de merge
- Diff
- Histórico, hash de commit (`5e82324`)
- PR (Pull Request) / MR (Merge Request)
- `.gitignore`
- Working directory, staging, HEAD

**Nível 5 — Web básico (cliente vs servidor)**
- HTML (estrutura), CSS (estilo), JavaScript (comportamento) — o que cada um faz
- Frontend vs backend
- Cliente (browser) vs servidor
- Request / response
- URL: protocolo (`http`, `https`), domínio, path, query string, fragmento
- Verbos HTTP: `GET`, `POST`, `PATCH`, `DELETE` (apenas conceito básico)
- Status code: 200/4xx/5xx (apenas categoria)
- Header básico, body básico
- API (o que significa)
- DNS / hosting / domínio
- HTTPS / certificado (conceito básico)

**Nível 6 — Arquivos típicos de um projeto**
- Estrutura típica de um repo (`/src`, `/docs`, `/scripts`, `/tests`, `/`)
- `README.md`
- `.env`, `.env.example`, variável de ambiente (conceito)
- `Dockerfile` (apenas conceito — não tem no InkFlow mas o leitor vai encontrar)
- `wrangler.toml` (apenas conceito de config Cloudflare — detalhe técnico vai pro arquivo 02)

**Cada nível termina com um quadro:**
> "Onde tu encontra isso no InkFlow:" — exemplos concretos do projeto, sem profundidade. Convite a procurar no arquivo 02/03/04 quando quiser detalhe.

#### `02-dicionario-tecnico.md` (~25-35KB)
**Intermediário ao avançado.** Pressupõe que o leitor já leu o 01. Termos de programação organizados por domínio. Cada termo: **definição precisa** + **onde aparece no InkFlow** (com link mental pro arquivo do código). Dentro de cada domínio, ordem do mais simples ao mais complexo.

Domínios cobertos:
- **Web avançado** — HTTP detalhado (headers críticos, status codes específicos, cache-control, content-type), REST vs RPC vs GraphQL, WebSocket, SSE, cookie vs localStorage vs sessionStorage, CORS profundo, preflight (OPTIONS), MIME types, JSON detalhado, form-encoded
- **JavaScript / TypeScript profundo** — runtime, V8, event loop, microtask queue, sync/async, Promise (then/catch/finally), async/await, callback hell, closure, scope (function/block/global), hoisting, `this`, prototype, ESM vs CJS, dynamic import, generics, types vs interfaces, type narrowing, type guards, tree-shaking, bundler (webpack/vite/esbuild/rollup), source maps
- **Database / Postgres** — relacional vs NoSQL, schema, table, row, column, tipos Postgres (`text`, `int`, `uuid`, `timestamp`, `jsonb`), primary key, foreign key, índices (B-tree, GIN, partial), query plan (EXPLAIN), transaction, ACID, níveis de isolamento, JSON vs JSONB, RLS, policies, migration, seed, pooler, connection pool, deadlock
- **Segurança** — authentication vs authorization, OAuth 2.0 (fluxos), OIDC, JWT (header/payload/signature, claims), HMAC SHA-256, bearer token, CSRF, XSS, SQL injection, secret management, key rotation, principle of least privilege, fail-open vs fail-closed, rate limiting, WAF
- **AI / LLM** — token, embedding, context window, temperature, top_p, top_k, system vs user vs assistant message, few-shot vs zero-shot, chain-of-thought, RAG (retrieval augmented generation), structured output / JSON mode, tool calling / function calling, hallucination, agent, multi-agent, handoff, validator, schema validation (Zod), prompt engineering, prompt injection
- **Infra / Cloud** — serverless, edge, origin, CDN, PoP, latência (p50/p95/p99), throughput, cold start, warm start, runtime (V8 isolate vs Node), region, DNS (A/CNAME/TXT/MX), TLS/SSL, certificado, webhook vs polling, idempotência, retry, exponential backoff, circuit breaker
- **Dev workflow** — git avançado (interactive rebase, cherry-pick, stash, reflog), branching strategies (gitflow, trunk-based), PR review, conflito de merge profundo, CI/CD pipeline, GitHub Actions, smoke vs regression vs e2e, mock vs stub vs fixture, snapshot test, blue-green, canary, feature flag, rollback, observability (logs/metrics/traces), structured logging, distributed tracing, SLI/SLO/SLA, error budget, on-call, runbook, postmortem

#### `03-dicionario-inkflow.md` (~15-20KB)
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

#### `04-inventario-completo.md` (~30-40KB)
Listagem **exaustiva**. Cada item: nome, propósito, localização, deps.

Seções:
- **Endpoints** — todos os arquivos `functions/api/*.js` (público, admin, webhooks, agent, tools, crons, telegram). ~40 endpoints. Cada um: método, path, auth, payload típico, response.
- **Tabelas Supabase** — cada tabela com cada coluna (tipo, nullable, default, FK, índice se houver), uso resumido. ~20 tabelas.
- **Env vars** — todas, organizadas por serviço (Cloudflare/Supabase/MP/Evolution/MailerLite/Telegram/OpenAI/internal). Apenas nomes — sem valores.
- **Cron schedules** — os 12 do `cron-worker/wrangler.toml` com horário, propósito, endpoint que chama, severidade.
- **Auditores** — os 5 ativos (key-expiry, rls-drift, deploy-health, billing-flow, vps-limits) com descrição e métricas.
- **Scripts** — `/scripts/*` com propósito de cada um.
- **Migrations** — lista (sem conteúdo) das migrations Supabase desde 2026-04-26.

#### `05-arquitetura-e-ecosystem.md` (~15-20KB)
Reaproveita `01-arquitetura-overview.md` v1 e expande com:
- ASCII map "8 serviços + setas de integração" (alto nível)
- Para cada serviço: propósito, URL prod, pontos de integração entrada/saída, config técnica
- Fluxo de dados típico (cliente final → resposta) narrado
- Auth: 3 mecanismos (admin JWT, onboarding_key, studio_token HMAC)
- Estado atual do refator multi-agent (status sub-1, sub-2, sub-3.1/2/3, sub-4)

#### `06-fluxos-criticos.md` (~25-30KB)
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

#### `07-multi-agent-deep-dive.md` (~20-25KB)
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

#### `08-decisoes-arquiteturais.md` (~10-15KB)
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

#### `09-perguntas-iniciais.md` (~6-8KB)
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

### Fase 2 — Redação paralela (até 5 subagents general-purpose em paralelo)
Cada subagent recebe sumário relevante da fase 1 + escreve seu arquivo. Subagents independentes (sem state compartilhado):

- **Subagent W1** — escreve `01-fundamentos-programacao.md` (input: lista de termos foundational identificados; calibrado pra "absoluto zero, linguagem natural, analogias concretas, anchor InkFlow leve")
- **Subagent W2** — escreve `02-dicionario-tecnico.md` (input: sumários A/B/C; calibrado pra "intermediário ao avançado, pressupõe leitura do 01, organização por domínio")
- **Subagent W3** — escreve `03-dicionario-inkflow.md` + `04-inventario-completo.md` (input: sumários A + B)
- **Subagent W4** — escreve `05-arquitetura-e-ecosystem.md` + `06-fluxos-criticos.md` (input: sumários A + B, herda v1 com upgrade)
- **Subagent W5** — escreve `07-multi-agent-deep-dive.md` + `08-decisoes-arquiteturais.md` (input: sumário C + decisions canonical)

### Fase 3 — Costura e revisão (sessão principal)
- Sessão principal escreve `00-LEIA-PRIMEIRO.md` + `09-perguntas-iniciais.md` (precisa ver os outros arquivos primeiro)
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
- Total estimado 180-240KB (vs 127KB do v1) — mais denso, mais cobertura, com camada zero pra não-dev

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Subagents geram conteúdo divergente sobre o mesmo tópico | Sumários da fase 1 viram fonte única; review cruzado na fase 3 |
| Dicionário foundationals fica raso ou genérico (parece copy de stackoverflow) | Cada termo precisa do anchor "onde aparece no InkFlow" — força contextualização |
| Inventário fica desatualizado em 1 semana | Snapshot date explícito; comando de regen documentado em `00-LEIA-PRIMEIRO` |
| User perde Audio Overview já gerado do v1 | Aviso explícito antes de apagar v1; user gera novo Audio Overview do v2 |
| Pack fica grande demais pro NotebookLM (limite 50 sources, 500MB cada) | 10 arquivos × ~22KB médio = ~220KB total — bem dentro do limite |
| Arquivo `01-fundamentos-programacao` fica simplista demais ou condescendente | Diretriz editorial: "linguagem natural, sem jargão, analogias concretas, sem assumir conhecimento prévio, mas sem subestimar inteligência". Subagent W1 calibrado especificamente pra esse tom. |
| Arquivo `02-dicionario-tecnico` repete coisas do `01` | Regra: 02 só inclui termos **mais profundos** que 01. Onde houver overlap (ex: "função" no 01 e "closure" no 02), 02 começa com "Pressupõe que tu já leu sobre função no arquivo 01". |

## Critérios de "feito"

- [ ] 10 arquivos `.md` existem em `~/Desktop/InkFlow-Study-Pack/`
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
