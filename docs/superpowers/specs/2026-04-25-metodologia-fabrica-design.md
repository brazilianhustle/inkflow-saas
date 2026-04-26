---
slug: metodologia-fabrica
status: aprovado
created: 2026-04-25
sub_projeto_pai: 5
related:
  - docs/superpowers/specs/2026-04-25-fabrica-inkflow-design.md
  - docs/canonical/runbooks/README.md
  - docs/canonical/secrets.md
---

# Spec — Sub-projeto 5: Metodologia da Fábrica (MVP, 3 gaps)

> **Escopo:** doctrine que define como agents e humano operam. Cobre 3 dos 4 gaps do plano-mestre §3. O gap 4 (rotina prompt-iteration day) fica postponed até Sub-projeto 4 existir.

## 1. Contexto

Sub-projeto 5 do plano-mestre Fábrica InkFlow (`2026-04-25-fabrica-inkflow-design.md` §3 linhas 115-141). Sem doctrine, time de subagents fica anárquico — cada um decide quando escalar, quando autonomamente executar, quando pedir aprovação.

Base existente:
- **5 pilares da Mentalidade** no vault (brainstorm, plan, DoD, deploy, rotina).
- **10 slash commands** (`/nova-feature`, `/plan`, `/dod`, `/deploy-check`, `/hotfix`, etc.).
- **6 runbooks operacionais** mergeados em `docs/canonical/runbooks/` (Sub-projeto 1).
- **Mapa Canônico de secrets** com regra de redação (`docs/canonical/secrets.md`).

## 2. Não-objetivos

Fora de escopo desse spec:

- **Gap 4 — rotina prompt-iteration day.** Bloqueado por Sub-projeto 4 (pipeline prompt). Fica como sub-spec separado quando aquele existir.
- **Comunicação de release pra cliente externo.** Hoje sem cliente pagante ativo. Expandir quando surgir.
- **Slashes novos** (`/incidente`, `/release`). `/deploy-check` e `/hotfix` cobrem entry points por enquanto.
- **Auditor `doc-freshness` automatizando checagem de cards.** Trabalho do Sub-projeto 1 v2.
- **Criar runbooks novos pros 2 gaps identificados** (`supabase-advisor-critical`, `deploy-gha-failed`). Ficam registrados em `[[InkFlow — Pendências (backlog)]]` quando virar concrete need.

## 3. Princípios

1. **Canonical mora no repo.** Vault tem âncoras curtas linkando pro repo via commit. Padrão estabelecido em Sub-projeto 1.
2. **Doctrine não duplica fonte-da-verdade.** Os 6 runbooks de `canonical/runbooks/` já cobrem cenários operacionais — `incident-response.md` é meta-doctrine que **referencia** esses runbooks, não os duplica.
3. **Escrita pra pressão.** Doctrine é lida sob alerta no Telegram em horário ruim. Texto direto, comandos prontos, decisão antes de explicação.

## 4. Arquitetura de saída

```
inkflow-saas/docs/canonical/methodology/
├── index.md                  # sumário + links pros 3 docs (sem conteúdo original)
├── matrix.md                 # 9 heurísticas (3 grupos) + tabela domínio×ação + 12+ exemplos
├── incident-response.md      # estrutura mãe 5 etapas + tabela severity + cenário→runbook (fonte única)
└── release-protocol.md       # versionamento + pre-flight + changelog + comunicação + janelas

vault/
├── Mentalidade — Matriz principal-subagent.md       # âncora curta (1 parágrafo + link pro repo)
├── Mentalidade — Runbook incidentes.md              # âncora curta
├── Mentalidade — Protocolo de release.md            # âncora curta
└── Mentalidade — Visão geral.md                     # adicionar seção "Doctrine de operação"
```

Cada doc canonical tem frontmatter `last_reviewed` + `owner` + `status` + `related`, mesmo padrão dos arquivos existentes em `canonical/`.

**Padrão da nota-âncora no vault** (segue `[[InkFlow — Arquitetura]]`):

- Frontmatter com `tags`, `canonical:` (path relativo do repo), `canonical_commit:` (sha do merge), `created`.
- 1 parágrafo curto de contexto humano (por que essa nota existe pra quem abre o vault).
- Bloco "Como uso na prática" — 3-5 bullets pessoais, diferente do canonical.
- Footer com wiki-links pra notas relacionadas.

Template completo em §9.

## 5. Componente — `matrix.md`

### 5.1 Heurísticas globais (9 regras, 3 grupos)

**Scope** — decisão de delegação principal vs. subagent

1. **Read-only** (logs, docs, queries de leitura, `git log`, `wrangler tail`, `gh pr view`) → **principal**.
2. **Write seguro em dev** (refactor, novo arquivo, edit local, `npm test`, branch nova) → **principal**.
3. **Write em prod** (deploy, migration, `git push origin main`, configuração CF Pages env) → **subagent dedicado do domínio**.

**Safety** — overrides universais. Valem **mesmo dentro** do escopo de subagent autorizado.

4. **Operações destrutivas** (`drop table`, `git reset --hard`, `rm -rf`, `git push --force`, `wrangler delete`, drop de migration aplicada, truncate, `DELETE` sem `WHERE` específico) → SEMPRE confirmação humana via Telegram ✅. Subagent **nunca** executa destrutivo sozinho, mesmo no domínio dele.
   - **Fallback se Telegram indisponível ou sem resposta:** abortar a operação. **Nunca** timeout silencioso autorizando destrutivo. Em P0 com Telegram down, preferir caminhos não-destrutivos (`runbooks/rollback.md` é recuperação, não destrutivo). Se destrutivo for inevitável e Telegram down, escalar via canal alternativo definido em `secrets.md` (`TELEGRAM_BOT_TOKEN` row) ou aguardar founder.
5. **Secrets em plaintext** → NUNCA `Read` direto em `.env`, `~/.zshrc`, `~/.config/`, ou arquivos com `secret`/`token`/`key`/`password` no nome. Pra obter valor: consultar `docs/canonical/secrets.md` pra descobrir fonte canônica (Bitwarden/CF env/Keychain) e pedir via Telegram. Se já tem MCP autenticado pro serviço (Cloudflare/Supabase/etc.), usar MCP em vez de pedir secret bruto.
6. **Tarefa que precisa >15 min de exploração isolada** → subagent (preserva contexto do principal).

**Domain** — lookup rápido por área

7. **Código de domínio específico** (CF Worker/Pages, Supabase migration/RLS, VPS/n8n, prompts do produto) → subagent do domínio. Tabela em §5.2.
8. **Decisão de produto** (UX, escopo, priorização, naming público) → **principal com Leandro** (não delegar).
9. **Brainstorm / pesquisa de soluções** → **principal** (mantém visão geral cross-domínio).

### 5.2 Tabela domínio × ação

| Domínio | Read-only | Write seguro (dev) | Write em prod | Debug profundo / >15min |
|---|---|---|---|---|
| **Deploy** (CF Worker/Pages, GHA) | principal | principal | `deploy-engineer` ✅ | `deploy-engineer` |
| **Supabase** (DB, RLS, queries) | principal | principal ou `supabase-dba` | `supabase-dba` ✅ | `supabase-dba` |
| **VPS / n8n** (Vultr, Evolution, workflows) | principal | principal (editar export commitado em `n8n/workflows/`) | `vps-ops` ✅ (aplicar no servidor) | `vps-ops` |
| **Prompts** (`generate-prompt.js` + sucessores) | principal | principal | `prompt-engineer` (golden set ✅) | `prompt-engineer` |
| **Outros** (frontend, docs, código geral, decisão de produto) | principal | principal | principal | principal |

✅ = gate de aprovação humana via Telegram. Define-se no prompt de cada agent (referência cruzada com Sub-projeto 2).

### 5.3 Exemplos canônicos

12 casos resolvidos cobrindo os 3 grupos de heurísticas:

| # | Cenário | Decisão | Heurística aplicada |
|---|---|---|---|
| 1 | Ler último deploy do worker pra investigar 5xx burst | **principal** | Scope/read-only (#1) |
| 2 | Refatorar 4 arquivos do frontend de Modo Coleta | **principal** | Scope/write-dev (#2) |
| 3 | Aplicar `wrangler rollback` em prod após deploy quebrado | **`deploy-engineer` ✅** | Scope/write-prod (#3) + Domain (#7) |
| 4 | Criar migration nova adicionando coluna nullable | **`supabase-dba`** | Scope/write-prod (#3) — não-destrutivo |
| 5 | Drop coluna obsoleta de `tenants` (já sem leitura) | **`supabase-dba` ✅ Telegram** | Safety/destrutivo (#4) sobrepõe Scope |
| 6 | Rotacionar `MP_ACCESS_TOKEN` em CF Pages env | **`deploy-engineer` ✅ Telegram** | Safety/secrets (#5) — valor via Bitwarden, não plaintext |
| 7 | Pedido "lê o valor de `OPENAI_API_KEY` no `.zshrc`" | **REJEITAR** + pedir via Telegram | Safety/secrets (#5) — proibição direta |
| 8 | Force push em `main` | **REJEITAR** salvo Telegram ✅ explícito | Safety/destrutivo (#4) |
| 9a | Ajustar workflow n8n via SDK + commitar export em `n8n/workflows/` | **principal** | Scope/write-dev (#2) — código versionado |
| 9b | Aplicar workflow ajustado **via n8n MCP** (HTTP autenticada — `mcp__n8n__update_workflow`) | **principal** | Scope/write-prod (#3) — API tipada, não-destrutivo de infra |
| 9c | Modificar config do servidor VPS **via SSH** (nginx, docker, systemd, env) | **`vps-ops` ✅** | Scope/write-prod (#3) + Domain (#7) — acesso shell ao host |
| 10 | Adicionar nova tool no `generate-prompt.js` | **`prompt-engineer`** (golden set ✅) | Domain (#7) |
| 11 | Editar `docs/canonical/stack.md` pós-refactor | **principal** (pós-MVP: `doc-keeper`) | Domain/docs (#7) |
| 12 | Decidir UX do novo Modo Coleta | **principal com Leandro** | Domain/produto (#8) — não delegar |
| 13 | Brainstorm de feature nova (`/nova-feature`) | **principal** | Domain/brainstorm (#9) |
| 14 | Investigação >15 min de query lenta em Supabase | **`supabase-dba`** com contexto isolado | Scope/tempo (#6) + Domain (#7) |

Esses 14 exemplos são o "padrão por imitação". Caso novo que não encaixa: aplicar heurísticas em ordem (Safety > Scope > Domain) e adicionar à tabela quando virar repetição.

## 6. Componente — `incident-response.md`

### 6.1 Estrutura mãe (5 etapas)

Aplicável a qualquer alerta. Cada runbook em `canonical/runbooks/` é uma instância dessa estrutura pra um cenário específico.

1. **Detect** — fonte do alerta (Telegram do auditor, Sentry, Supabase advisor, GHA notification, reclamação cliente).
2. **Confirm** — verificar que não é falso positivo. 1 query / 1 curl / 1 dashboard. Antes de mexer em prod.
3. **Contain** — parar o sangramento (rollback, disable feature flag, throttle, kill process). Prioriza estancar dano sobre causa raiz.
4. **Fix** — resolver causa raiz. **Linka pro runbook específico** em `canonical/runbooks/` se houver. Se não houver, ad-hoc + criar runbook depois (regra do README de runbooks).
5. **Postmortem** — entrada nova em `[[InkFlow — Painel]]` seção "Incidentes recentes" + nota dedicada `vault/InkFlow — Incidentes/<YYYY-MM-DD>-<slug>.md` com timeline, causa, fix, prevenção. Se virou learning generalizável: atualizar matrix.md ou criar runbook novo.

### 6.2 Tabela de severity

Alinha com a do `runbooks/README.md`. Severity define **tempo de resposta esperado**, não procedimento — procedimento mora no card.

| Severity | Sintoma | Tempo de resposta | Slash de entrada |
|---|---|---|---|
| **P0** (critical) | Bot não responde / pagamento quebrado / dado corrompido | < 15 min | `/hotfix` imediato |
| **P1** (high) | Funcionalidade degradada (1 tenant afetado, ou >1 funcionalidade lenta) | < 2h | Card específico + fix em horário |
| **P2** (medium/low) | Bug não-crítico / cosmético | < 24h | `/backlog-add` priorizado |

### 6.3 Cenários conhecidos → runbook canônico (fonte única)

> **Importante:** essa tabela é a **única fonte da verdade** para mapeamento sintoma→runbook. `index.md` apenas linka pra cá. Se um runbook novo for adicionado em `canonical/runbooks/`, atualizar essa tabela aqui (não em `index.md`).

| Sintoma | Runbook | Severidade típica |
|---|---|---|
| 5xx burst em `inkflowbrasil.com/*` ou `/api/*` (deploy quebrou) | [`runbooks/rollback.md`](../runbooks/rollback.md) | P0 |
| Worker `inkflow-cron` parou de disparar | [`runbooks/rollback.md`](../runbooks/rollback.md) | P0 |
| MP webhook silent (>15 min sem evento esperado) | [`runbooks/mp-webhook-down.md`](../runbooks/mp-webhook-down.md) | P0 |
| Supabase indisponível (todos os `/api/*` quebrando) | [`runbooks/db-indisponivel.md`](../runbooks/db-indisponivel.md) | P0 |
| Mensagens WhatsApp Evolution não fluem | [`runbooks/outage-wa.md`](../runbooks/outage-wa.md) | P0/P1 |
| Dados corrompidos / restore necessário | [`runbooks/restore-backup.md`](../runbooks/restore-backup.md) | P0 |
| Procedimento de deploy padrão (não é incidente) | [`runbooks/deploy.md`](../runbooks/deploy.md) | n/a |
| Supabase advisor crítico (RLS exposto / slow query / security issue, DB no ar) | _gap registrado_ | P1 |
| Deploy GHA falhou antes de chegar em prod | _gap registrado — coberto parcialmente por `rollback.md`_ | P2 |
| **Telegram bot down** (canal de approval indisponível — quebra fluxo destrutivo §5.1#4) | _gap registrado_ | P0 |
| **Secret expirado / rotação não-anunciada** (CF API token TTL=90d, OPENAI key, etc.) | _gap registrado_ | P1 |
| **CF Pages build failed** (build no CF após push, distinto de GHA) | _gap registrado — adjacente a `rollback.md`_ | P2 |
| **MailerLite block rate alto** (entrega quebrada — afeta funil) | _gap registrado_ | P3 |

Os 6 gaps ficam registrados em `[[InkFlow — Pendências (backlog)]]` com prioridades diferenciadas (ver §11). Cada um vira trabalho próprio quando o cenário ocorrer e a resposta ad-hoc não for óbvia em 5 min (regra do `runbooks/README.md`). **Não** são trabalho desse spec.

## 7. Componente — `release-protocol.md`

### 7.1 Versionamento por componente

| Artefato | Versionamento | Tag git |
|---|---|---|
| **Worker** (`inkflow-cron`) | git SHA + tag semver manual | `worker-vX.Y.Z` |
| **CF Pages** (`inkflow-saas`) | git SHA do commit deployed (auto via GHA) | `pages-vX.Y.Z` no merge |
| **Supabase migrations** | timestamp sequencial (já existe no repo) | `supabase-MMDD` no merge da PR de migration |
| **n8n workflows** | versão do n8n SDK + export commitado em `n8n/workflows/` | `n8n-MMDD` |

Não usamos semver global (não tem cliente público que precise saber "InkFlow 1.2.3"). Cada componente versiona independentemente.

### 7.2 Pre-flight checklist

**Entry point: `/deploy-check`** — slash existente. Esse documento expande os critérios que o slash valida.

Antes de qualquer release prod:

- [ ] DoD do trabalho fechado (`/dod`)
- [ ] Testes passando (CI verde)
- [ ] Migration ✅ via Telegram (se houver migration nova)
- [ ] Changelog draft pronto (gerado por §7.3)
- [ ] Janela OK (não estamos em horário de pico — sábado tarde, domingo manhã)
- [ ] Runbook de rollback acessível ([`runbooks/rollback.md`](../runbooks/rollback.md))

### 7.3 Changelog automático

Geração: `git log <tag-anterior>..HEAD --pretty="- %s (%h)"` filtrado por convenção de commit (feat/fix/breaking).

Formato:
```markdown
### worker-v0.3.2 (2026-04-25)

**Mudanças:**
- feat: novo campo X em Y (#123)
- fix: erro Z no fluxo W (#125)

**Breaking changes:** nenhum
**Migration:** nenhum
**Action requerida do tenant:** nenhum
```

Localização: `inkflow-saas/CHANGELOG.md` (raiz do repo). Atualizado no merge da PR de release. Quando tiver cliente pagante: replicar trecho relevante em comunicação ao cliente.

### 7.4 Comunicação (estado MVP)

Hoje, sem cliente pagante ativo, comunicação é **interna**:

- Entrada nova em `[[InkFlow — Painel]]` seção "Releases recentes" — formato:
  > `2026-04-25 — worker-v0.3.2 — adicionado campo X (link PR #123)`
- Nota mãe atualizada se houver impacto operacional (ex: `[[InkFlow — Arquitetura]]`).

Quando surgir cliente pagante: expandir comunicação (email, in-app banner, status page). **Fora de escopo desse spec** — abrir sub-spec quando ocorrer.

### 7.5 Janela de release

> **Janela real ainda não validada empiricamente.** A tabela abaixo é hipótese inicial baseada em padrão de salão de tatuagem (clientes reservam mais final de semana). Refinar após primeiro mês de telemetria com cliente pagante: olhar `wrangler tail` + dashboards de uso pra identificar pico real de requests do bot. Atualizar essa seção e remover este aviso quando dados existirem.

| Tipo de release | Janela permitida | Gate |
|---|---|---|
| Worker — feat/fix sem migration | qualquer hora útil de Leandro | `/deploy-check` |
| Worker — com migration não-destrutiva | qualquer hora | `/deploy-check` + Telegram ✅ migration |
| Migration destrutiva (drop table/coluna lida) | madrugada (00h-06h BRT) | `/deploy-check` + Telegram ✅ + backup recente confirmado |
| Mudança em pico estimado (hipótese: sábado 14h-22h, domingo 10h-14h) | **adiar** salvo P0 — validar quando tiver dados | n/a |
| Hotfix P0 | imediato | `/hotfix` (bypass parcial do checklist — runbook do hotfix documenta o que pular) |

## 8. Componente — `index.md`

Conteúdo mínimo. Sem informação original — só sumário + links. Frontmatter padrão `canonical/` (`last_reviewed`, `owner`, `status`, `related`).

```markdown
# Methodology — Index

Doctrine de como agents+humano operam no InkFlow.

## Documentos

- [matrix.md](matrix.md) — quando trabalho fica no principal vs. vai pra subagent. 9 heurísticas + tabela domínio×ação + 14 exemplos canônicos.
- [incident-response.md](incident-response.md) — estrutura mãe pra responder a alerta. Linka pros runbooks operacionais em [`../runbooks/`](../runbooks/README.md).
- [release-protocol.md](release-protocol.md) — versionamento, pre-flight, changelog, comunicação, janelas. Entry point: `/deploy-check`.

## Quando consultar qual

| Situação | Doc |
|---|---|
| "Devo delegar isso pra subagent ou faço eu?" | matrix.md |
| "Alerta no Telegram — como respondo?" | incident-response.md (depois linka pro runbook específico) |
| "Vou publicar mudança em prod" | release-protocol.md |
```

## 9. Vault — notas-âncora

3 notas novas seguindo padrão de `[[InkFlow — Arquitetura]]` (referência ao commit + 1 parágrafo de contexto humano + link pro arquivo canonical):

```markdown
---
tags: [mentalidade, doctrine, fabrica]
canonical: docs/canonical/methodology/matrix.md
canonical_commit: <sha-do-merge>
created: 2026-04-25
---
# Mentalidade — Matriz principal-subagent

> Fonte canônica: `docs/canonical/methodology/matrix.md` (commit `<sha>`).

[1 parágrafo de contexto: por que essa matriz existe, quem consulta, quando]

## Como uso na prática

[3-5 bullets pessoais — diferente do canonical, foco em quando Leandro abre essa nota]

[[Mentalidade — Visão geral]] · [[InkFlow — Mapa geral]]
```

Idem pras outras 2.

`Mentalidade — Visão geral.md` ganha seção nova:

```markdown
## Doctrine de operação (meta-camada além dos 5 pilares)

Os 5 pilares cobrem **processo de criar feature**. A doctrine cobre **como agents+humano operam no dia a dia**:

- [[Mentalidade — Matriz principal-subagent]] — quem faz o quê
- [[Mentalidade — Runbook incidentes]] — como responder a alerta
- [[Mentalidade — Protocolo de release]] — como publicar mudança
```

## 10. Definition of Done

### 10.1 Conteúdo

- [ ] 4 docs canonical preenchidos com texto concreto (não TBD): `index.md`, `matrix.md`, `incident-response.md`, `release-protocol.md`.
- [ ] `matrix.md` tem 9 heurísticas em 3 grupos + tabela 5×4 + ≥12 exemplos canônicos.
- [ ] `incident-response.md` tem estrutura mãe 5 etapas + tabela severity + tabela cenário→runbook (única fonte).
- [ ] `release-protocol.md` tem versionamento por componente + pre-flight + changelog + comunicação + janelas.
- [ ] 3 notas-âncora no vault + `Mentalidade — Visão geral.md` atualizada.
- [ ] `[[InkFlow — Painel]]` atualizado com seção "Doctrine viva" linkando os 3 docs.
- [ ] `[[InkFlow — Mapa geral]]` atualizado com link pra metodologia.

### 10.2 Cross-references

- [ ] Cada agent do Sub-projeto 2 (quando implementado) referencia `matrix.md` no prompt — registrar como TODO no spec do Sub-projeto 2.

### 10.3 Auto-validação

Spawnar 3 subagents com path scoping restrito a:
- `docs/canonical/methodology/`
- `docs/canonical/runbooks/`
- `docs/canonical/secrets.md`

Perguntas:

1. **Matriz** — apresentar 5 cenários (mix scope/safety/domain): "tarefa X — vai pra principal ou subagent? Justifique." Critério: ≥4/5 corretos com justificativa pela heurística certa.
2. **Incident** — "MP webhook parou de chegar há 30 min. Quais os 5 passos pra responder?" Critério: deve invocar estrutura mãe de `incident-response.md` E linkar `runbooks/mp-webhook-down.md`.
3. **Release** — "Quero deployar Worker amanhã. Qual o checklist pre-flight?" Critério: deve invocar `release-protocol.md` E linkar `runbooks/deploy.md`.

Resultado documentado em `inkflow-saas/evals/methodology/auto-validation-2026-04-XX.md` (formato: pergunta, resposta do subagent, score, gaps detectados).

**Doctrine só é "done" se** ≥80% das perguntas passam (≥4/5 da pergunta 1, e perguntas 2 e 3 com referência correta aos runbooks).

### 10.4 Teste real

- [ ] Simular 1 incidente (escolha P0 da lista §6.3 com runbook existente — sugestão: `mp-webhook-down`) → seguir o runbook + estrutura mãe → tempo até resolução documentado em `vault/InkFlow — Incidentes/<data>-simulacao-<slug>.md`.

### 10.5 Entrega

- [ ] PR(s) contendo 4 docs canonical + 3 notas-âncora vault + Visão geral atualizada + eval da auto-validação. Split em 1 ou 2 PRs decidido no `/plan`.
- [ ] Cada doc canonical com frontmatter padrão (`last_reviewed: 2026-04-XX`, `owner: leandro`, `status: stable`, `related: [...]`) — mesmo padrão dos arquivos existentes em `canonical/`.
- [ ] Code review por subagent `code-reviewer` (ou principal se MVP do agent ainda não existir).
- [ ] Merge pra `main` após code review aprovado.
- [ ] Pós-merge: registrar os 6 gaps de §11 em `[[InkFlow — Pendências (backlog)]]` com as prioridades indicadas.
- [ ] Pós-merge: atualizar `[[InkFlow — Painel]]` (seção "Doctrine viva") + `[[InkFlow — Mapa geral]]` (link pra metodologia).
- [ ] Pós-merge: atualizar `last_reviewed` dos canonical files se a revisão real divergir da data inicial.

## 11. Gaps registrados (não-trabalho desse spec)

Adicionar ao `[[InkFlow — Pendências (backlog)]]` durante implementação. Prioridade reflete impacto se o cenário ocorrer hoje (não probabilidade):

- **P0** — Runbook `telegram-bot-down.md` em `canonical/runbooks/`. Telegram é canal de approval pro fluxo destrutivo (§5.1#4) — se ele cai, fluxo todo trava. Trigger: 1ª vez que bot Telegram não responder e founder precisar aprovar destrutivo. Pré-trabalho útil: definir canal de fallback (SMS, email, signal) e documentar em `secrets.md` como linha nova ou anexo.
- **P1** — Runbook `secrets-expired.md` em `canonical/runbooks/`. CF API Token tem TTL=90d; sem runbook, primeira expiração vai ser surpresa quebrada. Trigger: 30 dias antes do primeiro vencimento conhecido (CF token), ou na 1ª vez que um secret expirar silenciosamente. Idealmente combinado com auditor `secret-rotation` (Sub-projeto 3 — adjacente).
- **P1** — Runbook `supabase-advisor-critical.md` em `canonical/runbooks/`. RLS exposto / slow query / security advisor. Distinto de `db-indisponivel.md` (DB no ar, mas advisor flagou). Trigger: 1ª vez que advisor crítico aparecer e levar >5 min pra resolver ad-hoc.
- **P2** — Runbook `cf-pages-build-failed.md` em `canonical/runbooks/`. Build no CF Pages após push (distinto do GHA). Adjacente a `rollback.md` mas com causas/diagnósticos próprios. Trigger: 2ª vez que CF Pages build falhar de jeito não-coberto por `rollback.md`.
- **P2** — Runbook `deploy-gha-failed.md` em `canonical/runbooks/`. GHA falhou antes de chegar em prod. Parcialmente coberto por `rollback.md` mas merece doc próprio quando virar repetição. Trigger: 2ª vez que GHA falhar de jeito não-coberto.
- **P3** — Runbook `mailerlite-block-rate.md` em `canonical/runbooks/`. Entrega de email caiu (bounce/spam alto), afeta funil de aquisição mas não quebra produto. Trigger: alerta de auditor `billing-flow-health` ou queda visível na taxa de entrega no painel MailerLite.

Cada runbook só vira trabalho quando o cenário ocorrer e a resposta ad-hoc não for óbvia em 5 min (regra do `runbooks/README.md`). Esse spec **só registra** os gaps — não cria os arquivos.

## 12. Sequência de implementação sugerida (input pro `/plan`)

Ordem proposta (4 PRs ou 1 PR grande — decidir no plan):

1. `matrix.md` (mais central — destrava Sub-projeto 2). Com 14 exemplos.
2. `incident-response.md` (linka pros 6 runbooks existentes — pouca escrita nova).
3. `release-protocol.md` (entry point `/deploy-check` já existe — só formaliza).
4. `index.md` + 3 notas-âncora vault + `Mentalidade — Visão geral` atualizada.
5. **Auto-validação** (DoD 10.3) + **teste real** (DoD 10.4) + eval committado.

Tempo estimado: 1 sessão focada (4-6h) ou 2 sessões (split em PR matriz vs. PR runbook+release+vault).

---

**Próximo passo:** review desse spec por Leandro → ajustes → `/plan`.
