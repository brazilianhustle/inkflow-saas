# Mapa Canônico do SaaS — Design

**Data:** 2026-04-26
**Autor:** Leandro Marques (founder) + Claude (assistente)
**Status:** Spec aprovado — aguarda `/plan` e implementação
**Tipo:** Sub-spec do Sub-projeto 1 do plano-mestre [`2026-04-25-fabrica-inkflow-design.md`](2026-04-25-fabrica-inkflow-design.md)
**Cronograma:** semana 1 (paralelo com Sub-projeto 5 — Metodologia formalizada)

---

## §1. Sumário executivo

Constrói o **Mapa Canônico** — única fonte-da-verdade técnica do InkFlow, vivendo em `inkflow-saas/docs/canonical/*.md`. Sem ele, qualquer subagent ou auditor opera cego e aluciná referências, IDs e procedures.

A v1 tem **dois objetivos primários**, nessa ordem:
1. **Desbloquear o Sub-projeto 2** (4 agents core) — agents do tipo `deploy-engineer`, `supabase-dba`, `vps-ops`, `prompt-engineer` precisam de um `index.md` de referência embutido em system prompt + arquivos detalhados consultáveis via `Read`.
2. **Servir como referência humana** — substituir/consolidar parte das notas Obsidian de InkFlow que hoje estão fragmentadas, com vault mantendo notas-âncora curtas que apontam pro repo.

**DoD da v1:** 6 áreas de escopo cobertas com conteúdo real (não placeholder), 3 sessões diferentes de Claude conseguem responder perguntas técnicas sobre InkFlow consultando **só** o Mapa, notas-âncora do vault atualizadas.

---

## §2. Decisões cravadas no brainstorm (2026-04-26)

Cada decisão abaixo foi escolhida explicitamente entre 2-3 alternativas com trade-offs apresentados. Estão consolidadas aqui pra evitar re-debate na implementação.

### 2.1. Modelo de consumo pelos agents — híbrido (índice + Read on-demand)

- System prompt de cada agent (Sub-projeto 2) embute literalmente o conteúdo de `index.md` (curto, ~30-50 linhas, TOC + 1-linha por arquivo).
- Quando agent precisa de detalhe, lê o arquivo via `Read docs/canonical/<arquivo>.md`.
- Convenção pra agent: **antes de qualquer ação irreversível, consultar runbook relevante**.
- Em incidente, agent abre 1 runbook isolado via `Read runbooks/<incidente>.md` e segue decision tree.

**Por quê:** prompts gerenciáveis (não embedam Mapa inteiro), sempre fresco quando lê (sem re-deploy de agent quando doc muda), agent tem mapa do território via índice.

### 2.2. Source-of-truth — híbrido por categoria

| Categoria | Tratamento | Exemplos |
|---|---|---|
| **Narrativo** (muda raramente) | **Duplicar no Mapa** | Propósito de cada serviço, fluxos passo-a-passo, runbooks completos, decisões arquiteturais |
| **Técnico-vivo** (muda toda hora) | **Referenciar fonte original** (linkar) | Schema Supabase → linka migrations / Bindings + env vars Workers → linka `wrangler.toml` / Env vars Pages → linka `.env.example` / Lista detalhada de secrets → linka Bitwarden collection |

**Por quê:** sem `doc-keeper` agent (pós-MVP), duplicação total apodrece. Referenciar tudo deixa o Mapa sem narrativa coesa pros agents. Híbrido equilibra.

### 2.3. Granularidade — flat + pasta só pra runbooks

```
inkflow-saas/docs/canonical/
├── index.md
├── stack.md
├── flows.md
├── ids.md
├── secrets.md
├── limits.md
└── runbooks/
    ├── README.md
    ├── deploy.md
    ├── rollback.md
    ├── outage-wa.md
    ├── mp-webhook-down.md
    ├── db-indisponivel.md
    └── restore-backup.md
```

**Por quê:** stack/flows/limits/ids/secrets são lidos em conjunto (1 Read por área temática). Runbooks são lidos isoladamente sob estresse — pasta dedicada permite `Read runbooks/mp-webhook-down.md` direto sem carregar 50 KB de outros runbooks irrelevantes.

### 2.4. Sync com Obsidian — nota-âncora curta

- **Repo é canonical.** Edição "real" sempre em `docs/canonical/`.
- Vault mantém **nota-âncora** de 10-20 linhas pra cada arquivo migrado, com:
  - TL;DR (3-5 bullets)
  - `**Fonte canônica:** \`docs/canonical/<arquivo>.md\` (commit X em \`inkflow-saas\`)`
  - Wiki-links pras notas vizinhas (preserva grafo do Obsidian)

**Por quê:** consistência com o padrão já estabelecido na memória do user (`feedback_editar_notas_obsidian_direto`: vault tão importante quanto repo + nota-âncora pra todo artifact novo).

### 2.5. Tratamento de secrets — só nomes + ponteiro

- `secrets.md` lista cada secret pelo **nome** (`MP_ACCESS_TOKEN`, `EVO_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, etc.), onde mora (Bitwarden item / Keychain entry / CF Pages env / GitHub Secret), TTL, owner, procedure de rotação.
- **Zero valores no repo.** Nem mascarados.
- Quando agent precisa do valor: usa MCP autenticado (Cloudflare/Supabase) ou pede via Telegram pro founder.

**Por quê:** casa diretamente com a regra `nunca_ler_arquivos_com_secrets_plaintext`. Repo público-friendly. Auditável em git history sem risco.

### 2.6. Faseamento da v1 — duas ondas dentro da semana 1

**Onda 1 — primeiros dias** (desbloqueia Sub-projeto 2):
- `index.md`, `stack.md`, `ids.md`, `secrets.md`, `runbooks/README.md`, `runbooks/deploy.md`, `runbooks/rollback.md`
- Critério pronto: agent novo conseguiria deployar e fazer rollback consultando só esses arquivos.

**Onda 2 — dias finais da semana 1** (completa v1):
- `flows.md`, `limits.md`, `runbooks/outage-wa.md`, `runbooks/mp-webhook-down.md`, `runbooks/db-indisponivel.md`, `runbooks/restore-backup.md`
- Critério pronto: 6 áreas de escopo do spec-mestre cobertas com conteúdo real.

**Por quê:** Sub-projeto 2 começa semana 2, Onda 1 desbloqueia sua entrada. Onda 2 cabe na mesma semana com folga; se atrasar 2-3 dias pra início da semana 2, não trava o agent (ele já tem o essencial).

### 2.7. Formato de fluxos — Mermaid em blocos de código

`flows.md` usa ` ```mermaid ... ``` ` pros diagramas + narrativa numerada complementar.

**Por quê:** agents Claude leem Mermaid bem. Renderiza no GitHub e no Obsidian (com plugin). Versionável, diff legível. Fluxos complexos são decompostos em sub-diagramas (1 por sub-fluxo).

### 2.8. Granularidade dos runbooks — comando-por-comando copy-paste

Cada runbook tem: **sintomas** → **diagnóstico** (logs/dashboards) → **decision tree** (`se output X, faça Y`) → **comandos copy-paste prontos** → **critério de "resolvido"**.

**Por quê:** runbook é "código pra humano em estresse" — verbosidade é feature, não bug. Agents do Sub-projeto 2 vão executar runbooks com aprovação Telegram; precisam do comando exato. Risco de comando obsoleto é mitigado por campo `last_reviewed` no frontmatter + auditor `doc-freshness` (pós-MVP).

---

## §3. Estrutura final do Mapa Canônico

### 3.1. Árvore de arquivos

```
inkflow-saas/docs/canonical/
├── index.md            # TOC + 1-linha por arquivo (vai pro system prompt dos agents)
├── stack.md            # serviços (CF Pages, Workers, Supabase, Evo, MP, MailerLite, n8n, Telegram)
├── flows.md            # fluxos críticos com Mermaid
├── ids.md              # tenant_id, mp_subscription_id, evo instance, tabelas Supabase, group IDs
├── secrets.md          # nomes + ponteiros (Bitwarden/Keychain/CF env/GH Secrets) + TTL + rotação
├── limits.md           # quotas Vultr/CF/Supabase/MP + thresholds de alerta
└── runbooks/
    ├── README.md       # índice de runbooks com sintomas conhecidos
    ├── deploy.md       # procedimento padrão (Direct Upload via wrangler) — Onda 1
    ├── rollback.md     # rollback CF Pages + Worker — Onda 1
    ├── outage-wa.md    # Evolution API não responde — Onda 2
    ├── mp-webhook-down.md  # webhook MP parou — Onda 2
    ├── db-indisponivel.md  # Supabase fora — Onda 2
    └── restore-backup.md   # restore from backup — Onda 2
```

### 3.2. Frontmatter padrão (todos os arquivos)

```yaml
---
last_reviewed: 2026-04-26
owner: leandro
status: stable | wip | deprecated
related: [stack.md, runbooks/deploy.md]
---
```

`last_reviewed` é alvo do auditor `doc-freshness` (pós-MVP). `status` permite sinalizar trabalho em andamento sem quebrar o Mapa.

### 3.3. Padrão de conteúdo por arquivo

#### `index.md` — referência embutida no system prompt

- TOC com 1 linha por arquivo: `stack.md — serviços e suas responsabilidades / endpoints`
- Convenções de uso pra agents (ex: "antes de qualquer ação irreversível, consultar runbook relevante")
- Lista atualizada de runbooks disponíveis (ex: "outage-wa, mp-webhook-down, deploy, rollback, ...")

#### `stack.md` — serviços e suas responsabilidades

Seção por serviço, com estrutura padrão:
- **Propósito** (1-2 frases)
- **URL principal**
- **Owner** (founder, externo, etc.)
- **Pontos de integração** (com quais outros serviços conversa)
- **Link pra config técnica** — `wrangler.toml`, `supabase/migrations/`, dashboard externo
- **Health check** — como verificar que está vivo

Serviços a cobrir: Cloudflare Pages, Cloudflare Workers (`inkflow-cron`), Supabase, Evolution API (Vultr), Mercado Pago, MailerLite, n8n, Telegram.

#### `flows.md` — fluxos críticos

Seção por fluxo, com:
- 1 diagrama Mermaid (sequence ou flowchart)
- Narrativa numerada (passo-a-passo) complementar ao diagrama
- Tabelas/endpoints/eventos relevantes em cada passo
- Pontos de falha conhecidos

Fluxos a cobrir (do spec-mestre):
- signup → trial
- trial → pago (recorrência ativada)
- payment recorrente (webhook MP processado)
- webhook Evolution → n8n (mensagem cliente recebida)
- expira-trial cron
- cleanup-tenants cron
- monitor-wa cron
- delete-tenant cascata

#### `ids.md` — IDs e referências

Tabelas estruturadas por categoria:
- **IDs de domínio** — `tenant_id` (UUID v4), `mp_subscription_id`, `evo_instance_id`, `mailerlite_subscriber_id`, etc. com formato + exemplo + onde usado
- **Tabelas Supabase** — nome / propósito / link pra migration que cria
- **Workflows n8n** — nome / id / link MCP
- **Group IDs MailerLite** — nome / id / propósito
- **Endpoints internos** — `/api/...` com método + propósito + auth

#### `secrets.md` — mapa de secrets

Tabela master:
| Nome | Fonte | TTL | Owner | Severidade rotação |
|---|---|---|---|---|
| `MP_ACCESS_TOKEN` | Bitwarden item `inkflow-mp-prod` | sem expiry | leandro | crítica |
| `EVO_API_KEY` | Keychain `inkflow-evo` | sem expiry | leandro | crítica |
| ... | ... | ... | ... | ... |

Por secret crítico, seção dedicada com **procedure de rotação completa** (comando-por-comando).

#### `limits.md` — quotas e thresholds

Tabela por sistema:
| Sistema | Recurso | Limite | Threshold warn | Threshold critical | Fonte do dado |
|---|---|---|---|---|---|
| Vultr (Evo VPS) | RAM | 2 GB | 75% | 90% | `free -m` SSH |
| Vultr (Evo VPS) | Disk | 50 GB | 75% | 90% | `df -h` SSH |
| Cloudflare Workers | CPU time | 10 ms (free) / 50 ms (paid) | 8 ms | 9.5 ms | observability dashboard |
| Supabase | Storage | conforme plano | 70% | 85% | dashboard |
| Mercado Pago | Rate limit | conforme docs | — | — | docs MP (linka) |
| ... | ... | ... | ... | ... | ... |

Esses thresholds alimentam o auditor #3 (VPS limits) e #5 (billing) do Sub-projeto 3.

#### `runbooks/<incidente>.md` — procedimentos

Estrutura padrão de cada runbook:
1. **Sintomas** — como detectar que o incidente está acontecendo (alertas Telegram, métricas, logs)
2. **Pré-requisitos** — credenciais necessárias, ferramentas (wrangler, ssh, psql)
3. **Diagnóstico** — comandos pra confirmar a causa (com decision tree)
4. **Ação** — comandos copy-paste pra resolver, condicional ao output do diagnóstico
5. **Verificação** — como confirmar que está resolvido
6. **Pós-incidente** — o que registrar (commit message, daily note, decisão arquitetural se aplicável)

#### `runbooks/README.md` — índice

Tabela:
| Runbook | Sintoma principal | Severidade típica | Tempo estimado |
|---|---|---|---|
| `deploy.md` | rotina | n/a | 5 min |
| `rollback.md` | deploy quebrado em prod | critical | 10 min |
| `outage-wa.md` | mensagens WA não fluem | critical | 15-60 min |
| ... | ... | ... | ... |

---

## §4. Migração das notas Obsidian existentes

Mapeamento das notas atuais → arquivos do Mapa + decisão de cada nota:

| Nota Obsidian atual | Destino conteúdo | Ação no vault |
|---|---|---|
| `InkFlow — Arquitetura` (26 linhas) | `stack.md` + `flows.md` | Vira nota-âncora curta com TL;DR + ponteiro |
| `InkFlow — Links e IDs` (20 linhas) | `ids.md` | Vira nota-âncora |
| `InkFlow — Como publicar` (25 linhas) | `runbooks/deploy.md` | Vira nota-âncora |
| `InkFlow — Decisões arquiteturais` (190 linhas) | **fica no vault** (decisão histórica não migra na v1) | Sem mudança |
| `InkFlow — Mapa geral` (MOC) | **fica no vault** (hub de navegação) | Sem mudança |
| `InkFlow — Painel` (dashboard) | **fica no vault** | Sem mudança |
| `InkFlow — Pendências (backlog)` | **fica no vault** | Sem mudança |

**Padrão da nota-âncora** (10-20 linhas):
```markdown
---
name: InkFlow — Arquitetura
description: Stack técnica do InkFlow — referência canônica vive no repo
type: project
tags: [inkflow, stack, anchor]
---

# InkFlow — Arquitetura

**Fonte canônica:** `docs/canonical/stack.md` + `docs/canonical/flows.md` (commit `<hash>` em `inkflow-saas`).

## TL;DR
- 3-5 bullets com o essencial
- ...

## Cross-references
- [[InkFlow — Mapa geral]]
- [[InkFlow — Pendências (backlog)]]
- ...
```

---

## §5. DoD (Definition of Done) da v1

Critérios objetivos pra fechar a v1:

1. **Onda 1 entregue:** `index.md`, `stack.md`, `ids.md`, `secrets.md`, `runbooks/README.md`, `runbooks/deploy.md`, `runbooks/rollback.md` escritos com conteúdo real (não placeholder), committed na branch.
2. **Onda 2 entregue:** `flows.md`, `limits.md`, `runbooks/outage-wa.md`, `runbooks/mp-webhook-down.md`, `runbooks/db-indisponivel.md`, `runbooks/restore-backup.md` escritos e committed.
3. **Notas-âncora atualizadas no vault:** `InkFlow — Arquitetura`, `InkFlow — Links e IDs`, `InkFlow — Como publicar` reescritas no padrão âncora (TL;DR + ponteiro).
4. **Teste de validação real:** abrir 3 sessões diferentes de Claude, fazer cada uma responder perguntas como "como faço deploy?", "quais secrets têm?", "qual o fluxo trial→pago?" — todas devem responder consultando **só** os arquivos em `docs/canonical/`.
5. **Estrutura aprovada pra ser consumida pelo Sub-projeto 2** — `index.md` está no formato que pode ser embutido em system prompt de agents.
6. **PR aberto e mergeado em main** com revisão do founder.

---

## §6. Não-objetivos (escopo NÃO coberto na v1)

- ❌ **`doc-keeper` agent** — manutenção automática do Mapa é pós-MVP (Sub-projeto 2 expandido).
- ❌ **Auditor `doc-freshness`** — auditor #7 que valida ≥ semanal a freshness dos docs é pós-MVP (Sub-projeto 3 expandido).
- ❌ **Migração da nota `Decisões arquiteturais`** — 190 linhas de decisão histórica não vão pra `docs/canonical/decisions.md` nesta v1; pode entrar no Sub-projeto 5 (Metodologia formalizada).
- ❌ **Auto-geração de docs a partir de fontes** — não há script que regenera `stack.md` a partir de `wrangler.toml` na v1; manutenção é manual.
- ❌ **Diagrama de arquitetura "big picture"** — `flows.md` cobre fluxos específicos; um diagrama macro do sistema inteiro fica como item futuro.
- ❌ **Tradução em/para inglês** — Mapa todo em pt-BR (alinhado com preferência do founder).
- ❌ **Hospedagem de docs em site público** (ex: GitHub Pages) — repo continua privado; docs só pra agents e founder.

---

## §7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Mapa apodrece sem `doc-keeper` (pós-MVP) | Frontmatter `last_reviewed` em todo arquivo + revisão manual semanal nas primeiras 4 semanas até auditor estar pronto |
| Drift entre notas-âncora do vault e arquivos do repo | Editor "fonte canônica" no frontmatter da nota-âncora avisa explicitamente; TL;DR pode envelhecer mas referência ao caminho do repo nunca |
| Comandos copy-paste em runbooks ficam obsoletos | `last_reviewed` por runbook + cada runbook **executado pelo menos 1x** durante implementação (smoke test do procedimento) |
| Onda 2 atrasa e empurra Sub-projeto 2 pra trás | Onda 1 já desbloqueia agents core (deploy + rollback essenciais); Onda 2 pode escorregar 2-3 dias sem bloquear |
| Founder edita doc no Obsidian achando que vault é canonical | Nota-âncora curta (10-20 linhas) sinaliza explicitamente "fonte canônica em `docs/canonical/X.md`" no topo |
| Estrutura proposta não cabe os agents do Sub-projeto 2 quando forem desenhados | DoD #5 (estrutura aprovada pra Sub-projeto 2) é gate explícito antes de fechar v1 — descobrir incompatibilidade vira ajuste antes de mergear, não depois |

---

## §8. Próximos passos

1. **✅ Spec aprovado** (este documento).
2. **Founder revisa o arquivo escrito** — Leandro lê, aponta ajustes ou aprova.
3. **`/plan`** — gera plano de implementação detalhado a partir desta spec, decomposto em PRs/passos.
4. **Implementação** — segue o plano em sessões dedicadas:
   - Onda 1 primeiro (desbloqueia Sub-projeto 2)
   - Onda 2 a seguir
   - Notas-âncora atualizadas no vault
5. **DoD verificado** — teste de validação real (3 sessões respondendo perguntas) executado antes do PR mergear.

---

## §9. Referências cruzadas

### Documentos no repo
- `docs/superpowers/specs/2026-04-25-fabrica-inkflow-design.md` — spec-mestre que decompõe os 6 sub-projetos
- `docs/superpowers/specs/2026-04-21-billing-lifecycle-v1-design.md` — billing v1 (precedente de spec)
- `docs/superpowers/specs/2026-04-22-modo-coleta-design.md` — Modo Coleta (precedente de spec)

### Notas Obsidian (vault)
- `InkFlow — Plano-mestre Fábrica (2026-04-25)` — meta-spec
- `InkFlow — Mapa geral` — MOC
- `InkFlow — Arquitetura` — fonte de conteúdo pra `stack.md` + `flows.md` (será nota-âncora pós-implementação)
- `InkFlow — Links e IDs` — fonte de conteúdo pra `ids.md` (será nota-âncora)
- `InkFlow — Como publicar` — fonte de conteúdo pra `runbooks/deploy.md` (será nota-âncora)
- `InkFlow — Decisões arquiteturais` — não migra na v1
- `feedback_editar_notas_obsidian_direto` — padrão nota-âncora (origem desta decisão)
- `feedback_nunca_ler_arquivos_com_secrets_plaintext` — origem do tratamento (a) de secrets
- `Mentalidade — 1. Brainstorm antes de código` — pilar 1 que originou esta sessão

### Comandos slash relacionados
- `/nova-feature` — usado pra abrir este brainstorm
- `/plan` — próximo passo após aprovação
- `/dod` — checklist de Definition of Done na implementação

---

## §10. Histórico de revisões

| Data | Versão | Mudança |
|---|---|---|
| 2026-04-26 | v1.0 | Spec inicial criado em sessão de brainstorm com Leandro. 8 decisões cravadas (consumo, SoT, granularidade, sync, secrets, faseamento, diagramas, runbooks). Estrutura de 7 arquivos + pasta `runbooks/` aprovada. Faseamento Onda 1 / Onda 2 dentro da semana 1 definido. |
