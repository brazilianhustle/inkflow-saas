# Metodologia da Fábrica — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a doctrine canonical (`docs/canonical/methodology/*`) que define como agents+humano operam — matriz principal vs. subagent, incident-response (referenciando runbooks de Sub-projeto 1), protocolo de release — com notas-âncora no vault e auto-validação de qualidade via subagents path-scoped.

**Architecture:** 4 docs canonical novos espelhando o padrão de Sub-projeto 1 (Mapa Canônico) com frontmatter `last_reviewed/owner/status/related`. Vault recebe 3 notas-âncora curtas linkando pro repo via commit. Doctrine **referencia** os 6 runbooks operacionais existentes em vez de duplicá-los. Validação fecha o loop: 3 subagents path-restricted respondem perguntas reais usando só o canonical → ≥80% certo = doctrine done.

**Tech Stack:** Markdown + frontmatter YAML. Sem código novo. Auto-validação usa `Agent` tool com `Explore` subagent type + path scoping.

**Branch:** `feat/metodologia-fabrica` (já criada, 3 commits do spec).

**PR strategy:** 1 PR único com commits granulares (1 commit por task). §12 do spec considerou 2 PRs; rejeitado porque a auto-validação roda nos 3 docs simultaneamente.

---

## Risk Register

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Conteúdo do spec drift do plan (spec edita-se enquanto plano roda) | baixa | médio | Spec congelado em commit `ea92493`. Qualquer ajuste durante execução vira novo commit em spec ANTES da task afetada. |
| Auto-validação falha (<80%) | média | alto | Iterar nos docs até passar. Se falhar 3 rodadas, abortar e reabrir spec. |
| Path scoping de subagent vazar (ler arquivo fora do escopo) | baixa | baixo (eval de qualidade) | Usar `Explore` agent com prompt explícito + verificar respostas que citam paths fora do escopo permitido. |
| Vault paths com espaços e em-dash em nomes | alta (já é realidade) | baixo | Sempre quotar paths em comandos. Wiki-links no vault funcionam sem aspas. |
| Conflito com `chore/canonical-cleanup` (branch órfã citada no SessionStart) | baixa | baixo | Ignorar — não é branch ativa, sem tracking. |
| Migrations / secrets / breaking changes | n/a | n/a | **Nenhum**. Plano é 100% docs. Sem migration, sem secret, sem código de runtime. |

---

## File Structure

**Criar:**

| Path | Responsabilidade |
|---|---|
| `docs/canonical/methodology/index.md` | Sumário + tabela "quando consultar qual" + links pros 3 docs. Sem conteúdo original. |
| `docs/canonical/methodology/matrix.md` | 9 heurísticas (Scope/Safety/Domain) + tabela 5×4 domínio×ação + 14 exemplos canônicos. Doc mais longo. |
| `docs/canonical/methodology/incident-response.md` | Estrutura mãe 5 etapas + tabela severity P0-P2 + tabela cenário→runbook (fonte única). |
| `docs/canonical/methodology/release-protocol.md` | Versionamento por componente + pre-flight (entry `/deploy-check`) + changelog + comunicação + janelas. |
| `<vault>/Mentalidade — Matriz principal-subagent.md` | Nota-âncora curta (template §9). |
| `<vault>/Mentalidade — Runbook incidentes.md` | Nota-âncora curta. |
| `<vault>/Mentalidade — Protocolo de release.md` | Nota-âncora curta. |
| `evals/methodology/auto-validation-2026-04-25.md` | Resultado das 3 perguntas pros 3 subagents path-scoped. |
| `<vault>/InkFlow — Incidentes/2026-04-25-simulacao-mp-webhook-down.md` | Timeline do teste real (DoD §10.4). |

**Modificar:**

| Path | Mudança |
|---|---|
| `<vault>/Mentalidade — Visão geral.md` | Adicionar seção "Doctrine de operação (meta-camada além dos 5 pilares)" com 3 wiki-links. |
| `<vault>/InkFlow — Painel.md` | Adicionar seção "Doctrine viva" linkando os 3 docs canonical (pós-merge). |
| `<vault>/InkFlow — Mapa geral.md` | Adicionar entrada/link pra metodologia (pós-merge). |
| `<vault>/InkFlow — Pendências (backlog).md` | Registrar os 6 gaps do §11 com prioridades P0-P3 (pós-merge). |

**Vault path:** `~/Documents/vault/` (separado do repo, próprio git).

---

## Task 1: Criar `docs/canonical/methodology/matrix.md`

**Por que primeiro:** doc mais longo + central. Destrava Sub-projeto 2 (cada agent referencia matriz no prompt). Conteúdo já está pronto no spec §5 — task copia + adapta frontmatter.

**Files:**
- Create: `docs/canonical/methodology/matrix.md`

- [ ] **Step 1: Confirmar branch e estado limpo**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git branch --show-current
git status --short
```

Expected: branch `feat/metodologia-fabrica`, working tree limpo (untracked aceitos: planos antigos do Modo Coleta + evals — ver `git status` original do `/nova-feature`).

- [ ] **Step 2: Criar diretório methodology/**

```bash
mkdir -p docs/canonical/methodology
```

Expected: `ls docs/canonical/methodology/` retorna diretório vazio.

- [ ] **Step 3: Escrever `matrix.md`**

Conteúdo: copiar §5 inteiro do spec (§5.1 heurísticas, §5.2 tabela domínio×ação, §5.3 tabela 14 exemplos). Adicionar frontmatter no topo:

```yaml
---
last_reviewed: 2026-04-25
owner: leandro
status: stable
related: [index.md, incident-response.md, release-protocol.md, ../secrets.md, ../runbooks/README.md]
---
```

Título do doc: `# Matrix — Principal vs. Subagent`

Antes do conteúdo do §5 do spec, adicionar 1 parágrafo de abertura:

> Doctrine de delegação: quando trabalho fica na sessão principal vs. quando vira tarefa pra subagent dedicado. Lida por **Claude principal** (decidindo "delegar isso?") e por cada **subagent** (validando "tá no meu escopo?"). Ordem de aplicação das heurísticas: **Safety > Scope > Domain**.

Conteúdo das seções abaixo do parágrafo: cópia literal do spec §5.1 (sub-headings "Scope" / "Safety" / "Domain"), §5.2 (tabela 5×4), §5.3 (tabela 14 exemplos + parágrafo final sobre "padrão por imitação").

- [ ] **Step 4: Verificar markdown válido**

```bash
cat docs/canonical/methodology/matrix.md | head -30
wc -l docs/canonical/methodology/matrix.md
grep -c "^##" docs/canonical/methodology/matrix.md
```

Expected: frontmatter aparece, ~80-100 linhas, ≥3 sub-headings (Scope/Safety/Domain ou §5.1/§5.2/§5.3).

- [ ] **Step 5: Commit**

```bash
git add docs/canonical/methodology/matrix.md
git commit -m "$(cat <<'EOF'
docs(methodology): matrix — principal vs. subagent

9 heuristicas (Scope/Safety/Domain) + tabela dominio×acao + 14 exemplos
canonicos. Sub-projeto 5 do plano-mestre Fabrica.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit criado, `git log --oneline -1` mostra a mensagem.

---

## Task 2: Criar `docs/canonical/methodology/incident-response.md`

**Por que segundo:** linka pros 6 runbooks existentes — pouca escrita nova. Conteúdo do spec §6.

**Files:**
- Create: `docs/canonical/methodology/incident-response.md`

- [ ] **Step 1: Escrever `incident-response.md`**

Frontmatter:

```yaml
---
last_reviewed: 2026-04-25
owner: leandro
status: stable
related: [index.md, matrix.md, release-protocol.md, ../runbooks/README.md, ../runbooks/rollback.md]
---
```

Título: `# Incident Response — Estrutura mãe`

Parágrafo de abertura:

> Meta-doctrine pra responder a alertas. **Não duplica os 6 runbooks operacionais** em `../runbooks/` — esse documento é a estrutura mãe que cada runbook instancia. Sob alerta no Telegram em horário ruim: começar pelo §6.3 (cenário→runbook) e seguir o runbook específico. Esse doc só explica a moldura.

Conteúdo: cópia literal do spec §6.1 (5 etapas Detect/Confirm/Contain/Fix/Postmortem), §6.2 (tabela severity P0-P2), §6.3 (tabela cenário→runbook com 13 linhas — 7 runbooks existentes + 6 gaps). A nota de §6.3 sobre "única fonte da verdade" é crítica — manter.

- [ ] **Step 2: Verificar links pros runbooks resolvem**

```bash
grep -oE '\[`runbooks/[^]]+\]' docs/canonical/methodology/incident-response.md | sort -u
ls docs/canonical/runbooks/
```

Expected: cada path linkado em `incident-response.md` com `_gap registrado_` na coluna runbook **NÃO** precisa existir; os outros (rollback, mp-webhook-down, db-indisponivel, outage-wa, restore-backup, deploy) **DEVEM** existir em `docs/canonical/runbooks/`. Cross-checar manualmente.

- [ ] **Step 3: Commit**

```bash
git add docs/canonical/methodology/incident-response.md
git commit -m "$(cat <<'EOF'
docs(methodology): incident-response — estrutura mae

5 etapas (detect/confirm/contain/fix/postmortem) + tabela severity P0-P2
+ tabela cenario->runbook (fonte unica). Linka pros 6 runbooks
operacionais de Sub-projeto 1 sem duplicar. 6 gaps marcados pra backlog.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Criar `docs/canonical/methodology/release-protocol.md`

**Files:**
- Create: `docs/canonical/methodology/release-protocol.md`

- [ ] **Step 1: Escrever `release-protocol.md`**

Frontmatter:

```yaml
---
last_reviewed: 2026-04-25
owner: leandro
status: stable
related: [index.md, matrix.md, incident-response.md, ../runbooks/deploy.md, ../runbooks/rollback.md]
---
```

Título: `# Release Protocol`

Parágrafo de abertura:

> Como publicar mudança em prod. Entry point: `/deploy-check` (slash existente) — esse documento expande os critérios que o slash valida. Operação atomica de **deploy** mora em `../runbooks/deploy.md`; este doc é o ritual organizacional ao redor (versionamento, changelog, comunicação, janelas).

Conteúdo: cópia literal de §7.1 (versionamento por componente — tabela 4 linhas), §7.2 (pre-flight checklist), §7.3 (changelog automático com formato), §7.4 (comunicação estado MVP), §7.5 (janela de release com aviso de "ainda não validada empiricamente" no topo + tabela 5 linhas).

- [ ] **Step 2: Commit**

```bash
git add docs/canonical/methodology/release-protocol.md
git commit -m "$(cat <<'EOF'
docs(methodology): release-protocol — versionamento + janelas

Versionamento por componente (worker/pages/supabase/n8n) + pre-flight
expandindo /deploy-check + changelog + comunicacao MVP + janelas
hipoteticas (validar com telemetria pos-cliente-pagante).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Criar `docs/canonical/methodology/index.md`

**Por que aqui:** depende dos 3 docs anteriores existirem (linka pra eles).

**Files:**
- Create: `docs/canonical/methodology/index.md`

- [ ] **Step 1: Escrever `index.md`**

Frontmatter:

```yaml
---
last_reviewed: 2026-04-25
owner: leandro
status: stable
related: [matrix.md, incident-response.md, release-protocol.md, ../index.md, ../runbooks/README.md]
---
```

Conteúdo: cópia literal do bloco markdown dentro de §8 do spec (linhas 244-262). Esse bloco já é o doc completo — copia + cola direto, removendo só os fences ` ```markdown ` que envolvem ele no spec.

- [ ] **Step 2: Verificar que index não tem tabela duplicada com incident-response**

```bash
grep -A2 "## Cenários" docs/canonical/methodology/index.md
```

Expected: zero hits. Index deve linkar pro `incident-response.md#cenários-conhecidos` em vez de duplicar.

- [ ] **Step 3: Commit**

```bash
git add docs/canonical/methodology/index.md
git commit -m "$(cat <<'EOF'
docs(methodology): index — sumario + links

So sumario e tabela 'quando consultar qual'. Sem conteudo original
(tabela cenario->runbook fica em incident-response.md como fonte unica).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Atualizar `docs/canonical/index.md` raiz pra incluir methodology

**Por que:** o index canonical raiz é o ponto de entrada — sem entrada lá, methodology fica órfã.

**Files:**
- Modify: `docs/canonical/index.md`

- [ ] **Step 1: Ler index canonical raiz pra encontrar onde adicionar**

```bash
cat docs/canonical/index.md
```

Identificar tabela ou lista existente onde docs canonical são listados.

- [ ] **Step 2: Adicionar linha pra methodology**

Pattern depende do formato atual. Esperado: tabela ou lista markdown com colunas tipo `| Doc | Descrição |`. Adicionar linha:

```
| [methodology/index.md](methodology/index.md) | Doctrine de operação (matriz principal-subagent, incident-response, release-protocol) |
```

Se houver `last_reviewed` no frontmatter: atualizar pra `2026-04-25`.

- [ ] **Step 3: Commit**

```bash
git add docs/canonical/index.md
git commit -m "$(cat <<'EOF'
docs(canonical): index — incluir methodology/

Adiciona entrada pra docs/canonical/methodology/ (Sub-projeto 5).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Notas-âncora no vault (3 notas + Visão geral)

**Por que:** vault precisa do commit final dos 3 docs canonical pra preencher `canonical_commit:`. Logo essa task vem **depois** das tasks 1-5, antes da auto-validação.

**Files:**
- Create: `~/Documents/vault/Mentalidade — Matriz principal-subagent.md`
- Create: `~/Documents/vault/Mentalidade — Runbook incidentes.md`
- Create: `~/Documents/vault/Mentalidade — Protocolo de release.md`
- Modify: `~/Documents/vault/Mentalidade — Visão geral.md`

- [ ] **Step 1: Capturar SHA atual da branch (vai virar `canonical_commit:`)**

```bash
git rev-parse HEAD
```

Expected: SHA do último commit (Task 5). Guardar como `<SHA-METHODOLOGY>` pras notas. Se houver merge conflict ou commits adicionais antes do PR, reapontar pro novo SHA na hora do merge final.

- [ ] **Step 2: Criar `Mentalidade — Matriz principal-subagent.md` no vault**

Path completo: `~/Documents/vault/Mentalidade — Matriz principal-subagent.md`

Conteúdo (substituir `<SHA-METHODOLOGY>` pelo SHA do Step 1):

```markdown
---
tags: [mentalidade, doctrine, fabrica]
canonical: docs/canonical/methodology/matrix.md
canonical_commit: <SHA-METHODOLOGY>
created: 2026-04-25
---
# Mentalidade — Matriz principal-subagent

> Fonte canônica: `docs/canonical/methodology/matrix.md` (commit `<SHA-METHODOLOGY>`).

Matriz que decide quando trabalho fica comigo (principal) e quando vira tarefa pra subagent dedicado. 9 heurísticas em 3 grupos (Scope/Safety/Domain), tabela 5×4 por domínio, 14 exemplos canônicos. Aplicação: Safety > Scope > Domain.

## Como uso na prática

- Antes de delegar pra subagent, abro o canonical e procuro o cenário na tabela §5.3.
- Se cenário novo: aplicar heurísticas em ordem (#4 secrets/destrutivo > #1-3 scope > #7 domain).
- Quando Sub-projeto 2 sair, todo agent vai ter `matrix.md` linkado no prompt — não preciso lembrar pra eles.
- Em dúvida sobre destrutivo: regra #4 sempre vence (Telegram ✅ ou abortar).

[[Mentalidade — Visão geral]] · [[InkFlow — Mapa geral]] · [[InkFlow — Arquitetura]]
```

- [ ] **Step 3: Criar `Mentalidade — Runbook incidentes.md` no vault**

```markdown
---
tags: [mentalidade, doctrine, fabrica, incidentes]
canonical: docs/canonical/methodology/incident-response.md
canonical_commit: <SHA-METHODOLOGY>
created: 2026-04-25
---
# Mentalidade — Runbook incidentes

> Fonte canônica: `docs/canonical/methodology/incident-response.md` (commit `<SHA-METHODOLOGY>`).

Estrutura mãe pra responder a alerta no Telegram. 5 etapas (Detect/Confirm/Contain/Fix/Postmortem) + tabela severity (P0/P1/P2) + tabela "cenário → runbook canônico" (fonte única — todos os 6 runbooks operacionais de `canonical/runbooks/` aparecem ali).

## Como uso na prática

- Alerta entra no Telegram → abro essa nota → pulo direto pra tabela cenário→runbook.
- Card específico (ex: `runbooks/mp-webhook-down.md`) tem comandos prontos. Sigo sem improvisar.
- Pós-fix: nota dedicada em `vault/InkFlow — Incidentes/<data>-<slug>.md` + entrada no Painel.
- Se cenário novo: criar runbook `canonical/runbooks/<nome>.md` depois (regra do README de runbooks).

[[Mentalidade — Visão geral]] · [[InkFlow — Painel]] · [[InkFlow — Arquitetura]]
```

- [ ] **Step 4: Criar `Mentalidade — Protocolo de release.md` no vault**

```markdown
---
tags: [mentalidade, doctrine, fabrica, release]
canonical: docs/canonical/methodology/release-protocol.md
canonical_commit: <SHA-METHODOLOGY>
created: 2026-04-25
---
# Mentalidade — Protocolo de release

> Fonte canônica: `docs/canonical/methodology/release-protocol.md` (commit `<SHA-METHODOLOGY>`).

Como publicar mudança em prod. Versionamento por componente (worker/pages/supabase/n8n), pre-flight expandindo `/deploy-check`, changelog automático do `git log`, comunicação interna no Painel (estado MVP), janelas hipotéticas (validar com telemetria). Operação atômica do deploy mora em `runbooks/deploy.md`.

## Como uso na prática

- Antes de deployar prod: rodo `/deploy-check` → ele valida o pre-flight do canonical.
- Migration destrutiva: madrugada (00h-06h BRT) + Telegram ✅ + backup confirmado. Não negocia.
- Pós-merge: nova entrada na seção "Releases recentes" do Painel.
- Quando aparecer cliente pagante: abrir sub-spec pra expandir comunicação.

[[Mentalidade — Visão geral]] · [[InkFlow — Painel]] · [[InkFlow — Pendências (backlog)]]
```

- [ ] **Step 5: Atualizar `Mentalidade — Visão geral.md` com seção Doctrine**

```bash
cat ~/Documents/vault/"Mentalidade — Visão geral.md" | tail -30
```

Identificar onde inserir (depois da listagem dos 5 pilares, antes do footer com wiki-links). Adicionar bloco:

```markdown
## Doctrine de operação (meta-camada além dos 5 pilares)

Os 5 pilares cobrem **processo de criar feature**. A doctrine cobre **como agents+humano operam no dia a dia**:

- [[Mentalidade — Matriz principal-subagent]] — quem faz o quê
- [[Mentalidade — Runbook incidentes]] — como responder a alerta
- [[Mentalidade — Protocolo de release]] — como publicar mudança

Fonte canônica: `inkflow-saas/docs/canonical/methodology/` (commit `<SHA-METHODOLOGY>`).
```

- [ ] **Step 6: Commit no repo do vault**

```bash
cd ~/Documents/vault
git add "Mentalidade — Matriz principal-subagent.md" "Mentalidade — Runbook incidentes.md" "Mentalidade — Protocolo de release.md" "Mentalidade — Visão geral.md"
git status
git commit -m "$(cat <<'EOF'
docs(mentalidade): doctrine de operacao — Sub-projeto 5

3 notas-ancora (matriz, incidentes, release) linkando pra
inkflow-saas/docs/canonical/methodology/ + secao "Doctrine" na
Visao geral.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
cd /Users/brazilianhustler/Documents/inkflow-saas
```

Expected: commit no vault. Vault tem repo próprio (mencionado em memory `[[automation_git_sync]]`). Hook `sync-git-repos.sh` cuida do push.

---

## Task 7: Auto-validação canonical-only (DoD §10.3)

**Por que aqui:** os 4 docs canonical existem, vault tem âncoras. Hora de validar que doctrine responde perguntas reais sem precisar de contexto fora do canonical.

**Files:**
- Create: `evals/methodology/auto-validation-2026-04-25.md`

- [ ] **Step 1: Criar diretório do eval**

```bash
mkdir -p evals/methodology
```

- [ ] **Step 2: Spawnar Subagent #1 (matriz) — escopo restrito**

Usar `Agent` tool com `subagent_type: "Explore"`. Prompt:

```
Você é um subagent de validação de doctrine. Você TEM ACESSO APENAS aos seguintes paths (qualquer outra leitura é violação):
- /Users/brazilianhustler/Documents/inkflow-saas/docs/canonical/methodology/
- /Users/brazilianhustler/Documents/inkflow-saas/docs/canonical/runbooks/
- /Users/brazilianhustler/Documents/inkflow-saas/docs/canonical/secrets.md

Para cada cenário abaixo, responda: vai pra principal ou subagent? Cite a heurística específica que aplicou (número e grupo).

Cenários:
1. Aplicar `wrangler rollback` em produção após deploy quebrado.
2. Pedido "lê o valor de OPENAI_API_KEY no .zshrc do servidor".
3. Refatorar 4 arquivos do frontend (sem mudança de prod).
4. Drop coluna obsoleta de `tenants` que já não tem leitura.
5. Investigar query lenta em Supabase, esperando ~30 min de exploração.

Formato esperado:
- Cenário 1: <decisão> — heurística #X (grupo Y) — <justificativa em 1 frase>
- ...

Reporte também: você precisou ler algum arquivo fora dos 3 paths listados? Se sim, qual e por quê.
```

Expected respostas corretas (gabarito):
1. `deploy-engineer` ✅ — Scope/write-prod #3 + Domain #7
2. REJEITAR + pedir via Telegram — Safety/secrets #5
3. principal — Scope/write-dev #2
4. `supabase-dba` ✅ Telegram — Safety/destrutivo #4 sobrepõe Scope
5. `supabase-dba` com contexto isolado — Scope/tempo #6 + Domain #7

Critério: ≥4/5 corretos com heurística certa.

- [ ] **Step 3: Spawnar Subagent #2 (incident) — mesmo escopo**

Prompt:

```
[mesmo escopo de paths do Subagent #1]

Cenário: MP webhook parou de chegar há 30 minutos. Receita do dia ainda não foi registrada. Quais os 5 passos pra responder a esse incidente? Cite o runbook específico e a estrutura da incident-response.

Reporte também: você precisou ler algum arquivo fora dos 3 paths permitidos?
```

Expected: deve invocar a estrutura mãe de `incident-response.md` (Detect/Confirm/Contain/Fix/Postmortem) **E** linkar `runbooks/mp-webhook-down.md` no passo Fix. Severity P0.

- [ ] **Step 4: Spawnar Subagent #3 (release) — mesmo escopo**

Prompt:

```
[mesmo escopo de paths do Subagent #1]

Cenário: quero deployar uma mudança no Worker amanhã (terça-feira de manhã). É um feat sem migration. Qual o checklist pre-flight que devo seguir antes de rodar o deploy?

Reporte também: você precisou ler algum arquivo fora dos 3 paths permitidos?
```

Expected: deve invocar `release-protocol.md` §7.2 pre-flight (DoD/`/dod`, testes, migration, changelog, janela, runbook rollback acessível) **E** linkar `runbooks/deploy.md` como execução do deploy. Mencionar `/deploy-check` slash.

- [ ] **Step 5: Compilar resultado em `evals/methodology/auto-validation-2026-04-25.md`**

Estrutura do eval:

```markdown
---
data: 2026-04-25
spec: docs/superpowers/specs/2026-04-25-metodologia-fabrica-design.md
canonical_commit: <SHA-METHODOLOGY>
status: <pass|fail>
---

# Auto-validação — Methodology canonical-only

Path scope dos subagents: `methodology/` + `runbooks/` + `secrets.md`.

## Pergunta 1 — Matriz (5 cenários)

[colar prompt completo]

### Resposta do subagent

[colar resposta]

### Score

| # | Decisão correta | Subagent acertou? | Heurística certa? |
|---|---|---|---|
| 1 | deploy-engineer ✅ | <sim/não> | <sim/não> |
| 2 | REJEITAR | <sim/não> | <sim/não> |
| 3 | principal | <sim/não> | <sim/não> |
| 4 | supabase-dba ✅ Telegram | <sim/não> | <sim/não> |
| 5 | supabase-dba isolado | <sim/não> | <sim/não> |

**Resultado:** <X>/5. **Pass criterion:** ≥4/5. <PASS/FAIL>.

## Pergunta 2 — Incident (MP webhook)

[idem]

### Score

- Estrutura mãe (5 etapas) invocada? <sim/não>
- Runbook `mp-webhook-down.md` linkado? <sim/não>
- Severity P0 identificada? <sim/não>

**Pass criterion:** os 3. **Resultado:** <PASS/FAIL>.

## Pergunta 3 — Release (deploy Worker)

[idem]

### Score

- `release-protocol.md` §7.2 pre-flight invocado? <sim/não>
- `runbooks/deploy.md` linkado? <sim/não>
- Slash `/deploy-check` mencionado? <sim/não>

**Pass criterion:** os 3. **Resultado:** <PASS/FAIL>.

## Path scope violations

Algum subagent leu arquivo fora dos 3 paths permitidos? <sim/não — listar paths violados se sim>

## Resumo

- Pergunta 1: <PASS/FAIL>
- Pergunta 2: <PASS/FAIL>
- Pergunta 3: <PASS/FAIL>
- Path scope: <OK/violado>

**Doctrine done?** <sim se ≥80% (ao menos 2 dos 3 perguntas PASS, e pergunta 1 com ≥4/5)/ não>.

## Gaps detectados

[lista de pontos onde a doctrine não respondeu bem — input pra ajustar canonical antes do merge]
```

- [ ] **Step 6: Decisão de gate**

Se `Doctrine done?` = sim → seguir Task 8 (teste real).
Se = não → identificar gap, ajustar canonical (matrix/incident/release conforme pergunta que falhou), commitar fix, **re-rodar Step 2-5**. Iteração explícita. Se 3 rodadas falharem, abortar plano e reabrir spec (Risk Register linha 2).

- [ ] **Step 7: Commit do eval**

```bash
git add evals/methodology/auto-validation-2026-04-25.md
git commit -m "$(cat <<'EOF'
test(methodology): auto-validacao canonical-only

3 subagents path-scoped responderam matriz/incident/release.
Resultado: <X>/3 perguntas PASS. Doctrine done.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Teste real (DoD §10.4) — simular incidente MP webhook

**Por que:** valida que a doctrine + runbook funcionam sob "pressão" simulada. Time-to-resolution documentado.

**Files:**
- Create: `~/Documents/vault/InkFlow — Incidentes/2026-04-25-simulacao-mp-webhook-down.md`

- [ ] **Step 1: Criar diretório no vault se não existir**

```bash
mkdir -p ~/Documents/vault/"InkFlow — Incidentes"
```

- [ ] **Step 2: Iniciar timer e simular o incidente**

Cenário: "MP webhook parou de chegar há 30 min. Última transação registrada às 14:00, agora são 14:30."

Procedimento: seguir `incident-response.md` § 6.1 (5 etapas) → no Fix, abrir `runbooks/mp-webhook-down.md` → seguir comandos do runbook **sem improvisar**. Cronometrar cada etapa.

Não executar comandos que afetem prod real (não deletar webhook real, não rotacionar secret real). Substituir `Action` por `# DRY-RUN: comando que rodaria` quando precisar.

- [ ] **Step 3: Documentar timeline em `2026-04-25-simulacao-mp-webhook-down.md`**

```markdown
---
data: 2026-04-25
tipo: simulacao
runbook: docs/canonical/runbooks/mp-webhook-down.md
estrutura: docs/canonical/methodology/incident-response.md
severidade: P0
real_or_sim: simulacao
---
# Simulação — MP webhook down (2026-04-25)

> **Cenário simulado.** Sem impacto em prod. Objetivo: validar tempo de resolução seguindo doctrine + runbook.

## Timeline

| HH:MM (sim) | Etapa | Ação | Tempo gasto |
|---|---|---|---|
| 14:30 | Detect | Recebido alerta no Telegram (simulado): "[outage] MP webhook silent >15min" | 0 min |
| 14:30 | Confirm | Abri `incident-response.md` §6.3 → identificado runbook `mp-webhook-down.md` | <X> min |
| 14:3X | Confirm | Rodei [comandos do runbook §Confirmação, em DRY-RUN] | <X> min |
| 14:XX | Contain | [...] | <X> min |
| 14:XX | Fix | [...] | <X> min |
| 14:XX | Postmortem | Esta nota + entrada no Painel | <X> min |

**Tempo total até "resolução simulada":** <X> min.
**Comparação com SLA:** P0 alvo <15 min — <PASS/FAIL>.

## O que funcionou

- [bullets]

## O que precisa ajustar no doctrine ou runbook

- [bullets — input pra ajuste no canonical antes do merge final, ou pra runbook v2]

## Conclusão

- Doctrine §6.1 (5 etapas): [funcionou/não] sob pressão simulada.
- Runbook `mp-webhook-down.md`: comandos prontos? Linkados corretamente? [bullets]
- Decisão: [merge OK / ajustar canonical antes do merge].
```

- [ ] **Step 4: Commit no vault**

```bash
cd ~/Documents/vault
git add "InkFlow — Incidentes/2026-04-25-simulacao-mp-webhook-down.md"
git commit -m "docs(incidentes): simulacao mp-webhook-down (2026-04-25)"
cd /Users/brazilianhustler/Documents/inkflow-saas
```

- [ ] **Step 5: Decisão de gate**

Se simulação detectou gap crítico no doctrine ou no runbook: ajustar canonical correspondente, commitar fix no repo, voltar pra Task 7 (re-rodar auto-validação).
Se simulação OK: avançar pra Task 9.

---

## Task 9: Push branch + abrir PR

**Files:** nenhum

- [ ] **Step 1: Verificar histórico da branch**

```bash
git log --oneline main..HEAD
```

Expected: ~6 commits (3 do spec + 4-6 desta implementação). Spec aprovado em `ea92493`.

- [ ] **Step 2: Push da branch**

```bash
git push -u origin feat/metodologia-fabrica
```

Expected: branch publicada no remote, `gh pr view` ainda dá erro (PR não existe).

- [ ] **Step 3: Abrir PR**

```bash
gh pr create --title "feat(methodology): doctrine da Fabrica — Sub-projeto 5 MVP" --body "$(cat <<'EOF'
## Summary

- 4 docs canonical novos em `docs/canonical/methodology/` (matriz principal-vs-subagent, incident-response como meta-doctrine, release-protocol, index)
- 3 notas-âncora no vault + seção "Doctrine" na Visão geral
- Auto-validação com 3 subagents path-scoped (eval committado em `evals/methodology/`)
- Teste real simulado: MP webhook down → tempo até resolução

Cobre 3 dos 4 gaps do plano-mestre Fábrica §3 (Sub-projeto 5). Gap 4 (prompt-iteration day) postponed até Sub-projeto 4 existir.

Spec: `docs/superpowers/specs/2026-04-25-metodologia-fabrica-design.md`.
Plan: `docs/superpowers/plans/2026-04-25-metodologia-fabrica.md`.

## Test plan

- [x] Auto-validação canonical-only: 3 subagents path-scoped (`methodology/` + `runbooks/` + `secrets.md`) responderam ≥80% certo.
- [x] Teste real simulado MP webhook down: tempo até resolução documentado em vault `InkFlow — Incidentes/2026-04-25-simulacao-mp-webhook-down.md`.
- [x] Path scope: nenhum subagent vazou pra fora dos 3 paths.
- [x] Frontmatter padrão (`last_reviewed`/`owner`/`status`/`related`) em cada doc canonical.
- [x] `incident-response.md` §6.3 é fonte única da tabela cenário→runbook (`index.md` só linka).
- [x] Sem duplicação com Sub-projeto 1: cards específicos referem aos 6 runbooks existentes em `canonical/runbooks/`, não criam novos.

## Pós-merge (não bloqueia este PR)

- Registrar 6 gaps de §11 do spec em `[[InkFlow — Pendências (backlog)]]` com prioridades P0-P3.
- Atualizar `[[InkFlow — Painel]]` (seção "Doctrine viva") + `[[InkFlow — Mapa geral]]`.
- Quando Sub-projeto 2 sair: cada agent vai referenciar `matrix.md` no prompt (TODO no spec do Sub-projeto 2).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR aberto, URL retornada.

---

## Task 10: Code review + merge

**Files:** nenhum (revisão)

- [ ] **Step 1: Invocar code-reviewer subagent**

Usar `Agent` tool com `subagent_type: "pr-review-toolkit:code-reviewer"`. Foco: PR atual (mudanças não-staged + commits da branch).

Prompt:

```
Review do PR `feat(methodology)`: doctrine da Fábrica — Sub-projeto 5 MVP.

Foco do review:
1. Frontmatter consistente em todos os 4 docs canonical (`last_reviewed`, `owner`, `status`, `related`).
2. Tabela "cenário → runbook" em `incident-response.md` §6.3 é a única (não duplicada em `index.md`).
3. Heurísticas (matrix.md §5.1) batem com o spec — 9 regras em 3 grupos.
4. Auto-validação eval (`evals/methodology/auto-validation-2026-04-25.md`) tem score real, não placeholder.
5. Sem duplicação com `docs/canonical/runbooks/*` — cards de incident referem aos runbooks existentes.
6. Conformidade com CLAUDE.md / convenções do repo.

Ignore: vault notes (não estão no PR — vivem em repo separado).
```

- [ ] **Step 2: Aplicar feedback do review**

Se houver issues bloqueantes: ajustar nos arquivos correspondentes, commitar, push.
Se houver suggestions opcionais: avaliar caso a caso.

- [ ] **Step 3: Merge do PR**

```bash
gh pr merge --squash --delete-branch
```

Expected: PR mergeado em `main`, branch `feat/metodologia-fabrica` deletada local + remote.

⚠️ **Não usar `--no-verify` ou bypass de hooks.** Se merge falhar por hook, investigar e fixar.

- [ ] **Step 4: Atualizar `canonical_commit:` nas notas vault pro SHA do merge final**

Após squash merge, o SHA muda. Reescrever `canonical_commit:` nas 3 notas-âncora vault + na Visão geral.

```bash
git pull origin main
git log --oneline -1  # capturar SHA do merge squash
```

Editar as 3 notas vault + Visão geral substituindo `<SHA-METHODOLOGY>` pelo SHA do merge. Commit no vault:

```bash
cd ~/Documents/vault
git add "Mentalidade — Matriz principal-subagent.md" "Mentalidade — Runbook incidentes.md" "Mentalidade — Protocolo de release.md" "Mentalidade — Visão geral.md"
git commit -m "docs(mentalidade): atualizar canonical_commit pos-merge"
cd /Users/brazilianhustler/Documents/inkflow-saas
```

---

## Task 11: Pós-merge — backlog + Painel + Mapa geral

**Files:**
- Modify: `~/Documents/vault/InkFlow — Pendências (backlog).md`
- Modify: `~/Documents/vault/InkFlow — Painel.md`
- Modify: `~/Documents/vault/InkFlow — Mapa geral.md`

- [ ] **Step 1: Registrar 6 gaps no backlog**

Path: `~/Documents/vault/InkFlow — Pendências (backlog).md`. Adicionar entradas conforme spec §11 (manter prioridades P0/P1/P1/P2/P2/P3):

```markdown
## Sub-projeto 5 — Gaps registrados (Methodology runbooks)

Gaps mapeados em `incident-response.md` §6.3 mas que **não têm runbook ainda**. Cada um vira trabalho próprio quando o cenário ocorrer. Ordem por prioridade-de-impacto, não probabilidade:

- **[P0]** `runbooks/telegram-bot-down.md` — Telegram é canal de approval pro fluxo destrutivo. Trigger: 1ª vez que bot Telegram falhar e founder precisar aprovar destrutivo. Pré-trabalho útil: definir canal de fallback (SMS/email/signal) e documentar em `secrets.md`.
- **[P1]** `runbooks/secrets-expired.md` — CF API Token tem TTL 90d. Trigger: 30 dias antes do 1º vencimento conhecido OU 1ª vez que secret expirar silenciosamente. Combinado com auditor `secret-rotation` (Sub-projeto 3 — adjacente).
- **[P1]** `runbooks/supabase-advisor-critical.md` — RLS exposto / slow query. Distinto de `db-indisponivel.md`. Trigger: 1ª vez que advisor crítico aparecer e levar >5 min ad-hoc.
- **[P2]** `runbooks/cf-pages-build-failed.md` — Build CF Pages após push (distinto do GHA). Adjacente a `rollback.md`. Trigger: 2ª vez que CF Pages build falhar.
- **[P2]** `runbooks/deploy-gha-failed.md` — GHA falhou antes de chegar em prod. Parcialmente coberto por `rollback.md`. Trigger: 2ª vez que GHA falhar de jeito não-coberto.
- **[P3]** `runbooks/mailerlite-block-rate.md` — Bounce/spam alto. Afeta funil mas não quebra produto. Trigger: alerta de auditor `billing-flow-health` ou queda visível no painel MailerLite.

Fonte: `[[Mentalidade — Runbook incidentes]]`. Spec: `docs/superpowers/specs/2026-04-25-metodologia-fabrica-design.md` §11.
```

- [ ] **Step 2: Atualizar `InkFlow — Painel.md` com seção "Doctrine viva"**

```bash
cat ~/Documents/vault/"InkFlow — Painel.md" | head -50
```

Identificar onde encaixar (perto da seção sobre Mapa Canônico, provavelmente). Adicionar:

```markdown
## Doctrine viva (Sub-projeto 5 — concluído 2026-04-25)

3 docs canonical em `docs/canonical/methodology/` definem como agents+humano operam:

- [[Mentalidade — Matriz principal-subagent]] — quem faz o quê
- [[Mentalidade — Runbook incidentes]] — como responder a alerta (linka pros 6 runbooks operacionais)
- [[Mentalidade — Protocolo de release]] — como publicar mudança

Auto-validação canonical-only: 3 subagents path-scoped responderam ≥80% certo. Teste real (MP webhook simulação) documentado em `[[InkFlow — Incidentes]]`.

6 gaps registrados em `[[InkFlow — Pendências (backlog)]]` (P0-P3).
```

- [ ] **Step 3: Atualizar `InkFlow — Mapa geral.md` com link pra metodologia**

Adicionar entrada na seção apropriada (Mapa Canônico ou doctrine):

```markdown
- [[Mentalidade — Visão geral]] — 5 pilares + doctrine (matriz/incidentes/release)
```

Se já tinha entrada pra Mentalidade — Visão geral, anexar `+ doctrine (matriz/incidentes/release)` ao final.

- [ ] **Step 4: Commit no vault**

```bash
cd ~/Documents/vault
git add "InkFlow — Pendências (backlog).md" "InkFlow — Painel.md" "InkFlow — Mapa geral.md"
git commit -m "$(cat <<'EOF'
docs(painel): metodologia mergeada — Sub-projeto 5 done

- 6 gaps registrados em Pendencias (P0-P3)
- Painel ganhou secao "Doctrine viva"
- Mapa geral atualizado

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
cd /Users/brazilianhustler/Documents/inkflow-saas
```

- [ ] **Step 5: Sincronizar vault remote**

```bash
cd ~/Documents/vault
git push
cd /Users/brazilianhustler/Documents/inkflow-saas
```

Expected: hook `sync-git-repos.sh` (memory `[[automation_git_sync]]`) já cuida disso, mas confirmar push manual ok como cinto-e-suspensório.

---

## Self-Review (após escrever — fix inline)

**Spec coverage:**

| Spec § | Tasks que implementam | Coberto? |
|---|---|---|
| §4 Arquitetura | 1, 2, 3, 4, 5 (canonical raiz), 6 (vault) | ✅ |
| §5 matrix.md | 1 | ✅ |
| §6 incident-response.md | 2 | ✅ |
| §7 release-protocol.md | 3 | ✅ |
| §8 index.md | 4 | ✅ |
| §9 Vault notas + Visão geral | 6 | ✅ |
| §10.1 conteúdo | 1, 2, 3, 4 (frontmatter incluso) | ✅ |
| §10.2 cross-ref Sub-projeto 2 | TODO no PR description (Task 9) | ✅ (não-bloqueante) |
| §10.3 auto-validação | 7 | ✅ |
| §10.4 teste real | 8 | ✅ |
| §10.5 entrega (PR/review/merge/pós) | 9, 10, 11 | ✅ |
| §11 gaps backlog | 11 (Step 1) | ✅ |
| §12 sequência implementação | tasks 1→8 seguem ordem proposta (matriz primeiro) | ✅ |

**Placeholders:** `<SHA-METHODOLOGY>` aparece em Tasks 6 e 10. Está definido como placeholder intencional preenchido em runtime — Step 1 da Task 6 captura via `git rev-parse HEAD`, Task 10 Step 4 atualiza pro SHA do merge squash. Não é placeholder de plano (engineer sabe exatamente o que fazer).

`<X>` em scores e timeline da Task 7/8 são intencionais — preenchidos no momento da execução.

**Type consistency:** todos os paths e nomes de agent (`deploy-engineer`, `supabase-dba`, `vps-ops`, `prompt-engineer`) batem com a tabela em §5.2 do spec e o §3 do plano-mestre Fábrica.

**Branch coherence:** plano todo executa em `feat/metodologia-fabrica` (branch já criada). Vault commits ficam no repo do vault em paralelo.

---

## Checkpoints testáveis

- **Após Task 1-4:** `find docs/canonical/methodology -name "*.md" | wc -l` retorna 4. Cada arquivo tem frontmatter (`grep -l '^last_reviewed:' docs/canonical/methodology/*.md` retorna 4).
- **Após Task 6:** `ls ~/Documents/vault/Mentalidade*.md` retorna 4 (3 novas + Visão geral atualizada). Vault commit ✅.
- **Após Task 7:** eval committado, `Doctrine done?` = sim no markdown.
- **Após Task 8:** simulação documentada com tempo de resolução numérico.
- **Após Task 10:** PR mergeado em `main`, branch deletada, vault `canonical_commit:` apontando pro SHA do merge.
- **Após Task 11:** Painel + Mapa geral + Backlog atualizados, vault pushed.

## Estimativa

- Tasks 1-4 (criar 4 docs canonical): 60-90 min
- Task 5 (atualizar index canonical raiz): 10 min
- Task 6 (vault): 30 min
- Task 7 (auto-validação 3 subagents): 30-60 min (depende de quantas iterações)
- Task 8 (teste real): 30 min
- Tasks 9-10 (push + PR + review + merge): 30 min
- Task 11 (pós-merge vault): 20 min

**Total:** 3-4h focado. Cabe em 1 sessão.
