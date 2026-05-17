# Sub 1.C — TattooAgent reliability fix (gpt-4o) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zerar HTTP 500s do TattooAgent em PER-001/009/010 sob R9 swappando `gpt-4o-mini → gpt-4o`, preservando qualidade Sub 1.B (nat/manif/state).

**Architecture:** Mudança mínima de 1 linha (model swap) + comment justificativo em `functions/api/agent/agents/tattoo.js`. Schema, validator, prompt e route.js preservados intactos. Validação via re-baseline 2× contra preview deploy (3º run condicional). DoD binária: 0 HTTP 500 + thresholds qualidade.

**Tech Stack:** OpenAI Agents SDK (gpt-4o), Cloudflare Pages preview deploys via wrangler, eval harness com judge claude-haiku-4-5, Cloudflare Access Service Token.

**Spec:** `docs/superpowers/specs/2026-05-16-sub-1c-tattoo-reliability-gpt4o-design.md`

**Branch:** `feat/sub-1c-tattoo-reliability-edge-failures`

---

## File Structure

**Files modificados (produção):**
- `functions/api/agent/agents/tattoo.js` — swap `gpt-4o-mini → gpt-4o` na linha 124 + 3 linhas de comment inline.

**Files criados (docs):**
- `docs/superpowers/plans/2026-05-16-sub-1c-tattoo-reliability-gpt4o.md` — este plan (Task 0, já existente após este passo).
- `docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1c.md` — report final (Task 6).

**Files NÃO tocados (preservados):**
- `functions/api/agent/agents/tattoo.js:29-56` (`TattooOutputSchema`)
- `functions/api/agent/agents/tattoo.js:64-111` (`validateTattooOutputInvariant`)
- `functions/api/agent/route.js`
- `functions/api/agent/_lib/*`
- Todos os outros agents (cadastro/proposta/portfolio) continuam `gpt-4o-mini`.

---

## Task 1: Spec + plan commits (já feitos / em curso)

**Files:**
- Existe: `docs/superpowers/specs/2026-05-16-sub-1c-tattoo-reliability-gpt4o-design.md` (commit `8cab681` em branch)
- Create: `docs/superpowers/plans/2026-05-16-sub-1c-tattoo-reliability-gpt4o.md` (este arquivo, criado pelo `/plan`)

- [ ] **Step 1.1: Verificar spec commit já existe na branch**

Run: `git log --oneline -5`
Expected: ver `8cab681 docs: spec sub-1c gpt-4o reliability fix design` no topo da branch.

- [ ] **Step 1.2: Commit plan**

```bash
git add docs/superpowers/plans/2026-05-16-sub-1c-tattoo-reliability-gpt4o.md .claude/active-branch
git commit -m "$(cat <<'EOF'
docs: plan sub-1c gpt-4o reliability fix

Plan gerado via /plan sobre spec ready-to-plan. Cobre edit + comment,
pre-flight, deploy, re-baseline 2x (+3o condicional), DoD evaluation,
report e PR. Inclui Plan B caso DoD falhe.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 1 file commited (plan + active-branch pointer update).

---

## Task 2: Pre-flight — Service Token Cloudflare Access

**Files:**
- Read-only: `evals/.env` (Service Token rotacionado na Sub 1.B parte 4 — deve estar válido).
- Reference: preview URLs `*.inkflow-saas.pages.dev` requerem header `CF-Access-Client-Id` + `CF-Access-Client-Secret`.

- [ ] **Step 2.1: Confirmar env vars presentes**

Run:
```bash
grep -E "^CF_ACCESS_CLIENT_(ID|SECRET)=" evals/.env | sed 's/=.*/=<set>/'
```
Expected: 2 linhas — `CF_ACCESS_CLIENT_ID=<set>` e `CF_ACCESS_CLIENT_SECRET=<set>`. Se faltar, abortar e pedir rotação ao Leandro antes de seguir.

- [ ] **Step 2.2: Smoke test no preview-base atual (sub-1b URL ainda viva ou main)**

Run (substitua `<EXISTING-PREVIEW>` por uma preview URL viva conhecida — pode ser última da Sub 1.B):
```bash
source evals/.env && curl -I -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
                            -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
                            "<EXISTING-PREVIEW>/" | head -5
```
Expected: HTTP 200 (ou 405, 404 — qualquer coisa que NÃO seja 401/403 é OK). Se 401/403 → Service Token expirou, abortar e rotacionar.

- [ ] **Step 2.3: Anotar resultado no terminal (sem commit)**

Não há commit aqui — é só validar gate. Se falhar, escalar pro Leandro: "Service Token CF Access invalido. Rotacionar antes de prosseguir Task 3."

---

## Task 3: Edit produção — model swap + comment

**Files:**
- Modify: `functions/api/agent/agents/tattoo.js:122-128`

- [ ] **Step 3.1: Re-confirmar contexto exato do bloco**

Run: `sed -n '118,134p' functions/api/agent/agents/tattoo.js`
Expected output (texto a ser modificado):
```js
export function buildTattooAgent({ env, tenant, conversa, clientContext, baseUrl = 'http://localhost:8788' }) {
  const ctx = clientContext || {};
  const instructions = generatePromptColetaTattoo(tenant, conversa, ctx);

  const agent = new Agent({
    name: 'tattoo-agent',
    model: 'gpt-4o-mini',
    instructions,
    tools: [],
    outputType: TattooOutputSchema,
  });
```

- [ ] **Step 3.2: Aplicar edit (Edit tool, NÃO sed)**

Substituir em `functions/api/agent/agents/tattoo.js`:

old_string:
```js
  const agent = new Agent({
    name: 'tattoo-agent',
    model: 'gpt-4o-mini',
    instructions,
    tools: [],
    outputType: TattooOutputSchema,
  });
```

new_string:
```js
  // Sub 1.C: gpt-4o pra zerar 500s sob R9 (validator-rejection ~33% no mini).
  // Outros agents (cadastro/proposta/portfolio) continuam gpt-4o-mini.
  // Decisao de custo permanente pendente (ver backlog).
  const agent = new Agent({
    name: 'tattoo-agent',
    model: 'gpt-4o',
    instructions,
    tools: [],
    outputType: TattooOutputSchema,
  });
```

- [ ] **Step 3.3: Verificar diff exato**

Run: `git diff functions/api/agent/agents/tattoo.js`
Expected: 1 linha alterada (`gpt-4o-mini` → `gpt-4o`) + 3 linhas adicionadas (comment block). Zero modificações no schema, no validator, no resto do arquivo.

- [ ] **Step 3.4: Rodar unit tests pra garantir nenhuma regressão**

Run: `npm test`
Expected: 443/443 tests pass (paridade Sub 1.B). Se quebrar, investigar — model string não deveria afetar unit tests, só smoke.

- [ ] **Step 3.5: Commit**

```bash
git add functions/api/agent/agents/tattoo.js
git commit -m "$(cat <<'EOF'
fix(tattoo-agent): swap gpt-4o-mini -> gpt-4o pra zerar 500s sob R9

Sub 1.B introduziu R9 (acoplamento decisao<>texto) no validator que
endurece rejeicao de outputs invalidos. gpt-4o-mini falha invariante
em ~33% das execucoes em PER-001/PER-010 → HTTP 500 atraves do
finalOutput.

Mudanca isolada ao TattooAgent. Cadastro/Proposta/Portfolio seguem
gpt-4o-mini. Custo permanente pendente como follow-up pos-DoD.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 1 file commited, 1 commit a mais na branch.

---

## Task 4: Deploy preview da branch

**Files:**
- Read-only: `wrangler.toml` (não modificar).

- [ ] **Step 4.1: Push branch pro remote (necessário pra CI pegar)**

Run: `git push origin feat/sub-1c-tattoo-reliability-edge-failures`
Expected: push limpo, sem rejeição.

- [ ] **Step 4.2: Deploy preview**

Run:
```bash
npx wrangler pages deploy . \
  --project-name=inkflow-saas \
  --branch=feat/sub-1c-tattoo-reliability-edge-failures \
  --commit-dirty=true
```
Expected: output termina com `Deployment complete!` + 2 URLs:
- `https://<hash>.inkflow-saas.pages.dev` (versão imutável)
- `https://feat-sub-1c-tattoo-reliability-edge-failures.inkflow-saas.pages.dev` (alias da branch — pode ser truncado)

Anotar a URL alias (a 2ª) — será usada como `BASE_URL` nas próximas tasks.

- [ ] **Step 4.3: Pre-flight no preview novo**

Run (substituir `<PREVIEW-URL>`):
```bash
source evals/.env && curl -I -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
                            -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
                            "<PREVIEW-URL>/" | head -5
```
Expected: NÃO 401/403. Se 401, esperar 30-60s (CF Access tem cold-start) e tentar de novo. Se persistir, escalar.

---

## Task 5: Re-baseline 2× + 3º condicional

**Files:**
- Reference: `scripts/inkflow-agent/run-baseline.mjs` (executável existente, paridade Sub 1.B Task 6).
- Output: 2 (ou 3) sets de logs gerados pelo harness em local conhecido (provavelmente `evals/runs/<timestamp>/` — verificar config do script).

- [ ] **Step 5.1: Run 1**

Run:
```bash
BASE_URL=<PREVIEW-URL> npm run inkflow-agent:baseline 2>&1 | tee /tmp/sub1c-run1.log
```
Expected: 3 evals (PER-001, PER-009, PER-010) executam, ~10-20 min wall clock. Output final imprime ranks + 500 count por eval.

**Watch:** se aparecer `HTTP 500` no log mid-run, deixar terminar — eval harness coleta tudo. Não abortar.

- [ ] **Step 5.2: Run 2**

Run:
```bash
BASE_URL=<PREVIEW-URL> npm run inkflow-agent:baseline 2>&1 | tee /tmp/sub1c-run2.log
```
Expected: idem run 1, ~10-20 min wall clock.

- [ ] **Step 5.3: Comparar runs — decidir 3º run**

Compute diff por dim entre run 1 e run 2:

```bash
grep -E "(PER-00[19]|PER-010).*nat|state|manif|500" /tmp/sub1c-run1.log /tmp/sub1c-run2.log
```

Critério: se `|run1 - run2| > 0.3` em qualquer dim (nat / manif / state count / 500 count), rodar 3º run. Caso contrário, pular pra Task 6.

**Cap rígido:** máximo 3 runs por eval = 9 execuções totais. Não ultrapassar.

- [ ] **Step 5.4 (condicional): Run 3**

Run:
```bash
BASE_URL=<PREVIEW-URL> npm run inkflow-agent:baseline 2>&1 | tee /tmp/sub1c-run3.log
```
Expected: idem. Após este, parar — cap atingido.

- [ ] **Step 5.5: Monitorar custo acumulado**

Critério paralelo: se custo acumulado nas 6+ execuções > $2 antes de terminar Step 5.4, **abortar 3º run** mesmo se necessário pelo diff. Documentar truncamento no report.

Não há commit nesta task — output são logs em /tmp + memória do operador. Persistir vem no Task 6.

---

## Task 6: Análise DoD + report

**Files:**
- Create: `docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1c.md`
- Template: `docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1b.md` (estrutura espelho).

- [ ] **Step 6.1: Extrair números finais por eval**

Para cada eval (PER-001, PER-009, PER-010), computar a partir dos logs `/tmp/sub1c-run*.log`:
- HTTP 500 count (somar)
- nat: mediana entre runs (paridade Sub 1.B)
- manif: mediana entre runs
- state final por run (0 ou 1) + verificar invariante por eval

Anotar em scratchpad antes de escrever report.

- [ ] **Step 6.2: Aplicar DoD binária**

Critérios (todos devem bater):
- `0 HTTP 500` total em todas as runs.
- PER-001 nat mediana ≥ 3.8.
- PER-009 nat mediana ≥ 3.8.
- PER-010 nat mediana ≥ 4.2.
- Manif mediana ≥ 0.83 em todos os 3 evals.
- State: PER-010 = 1; PER-001 = 0; PER-009 = 0.

Resultado: **DoD ✅** se todos batem; **DoD ❌** se qualquer falhar. Não há cinza.

- [ ] **Step 6.3: Escrever report (estrutura espelhando post-sub1b)**

Create `docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1c.md`:

```markdown
---
title: TattooAgent re-baseline pós Sub 1.C (gpt-4o)
date: 2026-05-16
sub: 1.C
predecessor_report: docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1b.md
spec: docs/superpowers/specs/2026-05-16-sub-1c-tattoo-reliability-gpt4o-design.md
---

# TattooAgent re-baseline pós Sub 1.C (gpt-4o)

## Sumário executivo

[1 parágrafo: DoD bateu/falhou + número-chave (500 count, nat por eval).]

## Configuração

- Modelo: `gpt-4o` (full).
- Outros agents: `gpt-4o-mini` (inalterados).
- Branch: `feat/sub-1c-tattoo-reliability-edge-failures`.
- Preview URL: `<PREVIEW-URL>`.
- Runs: 2 (ou 3, se aplicável).
- Custo total: `$X.YZ`.

## Resultados por eval

### PER-001
- HTTP 500: X / N execuções
- Nat (mediana): X.X (threshold: 3.8)
- Manif (mediana): 0.XX (threshold: 0.83)
- State (esperado=0): valores observados.

### PER-009
[idem]

### PER-010
[idem, threshold nat 4.2, state esperado=1]

## DoD evaluation

| Critério | Threshold | Observado | Status |
|---|---|---|---|
| HTTP 500 total | 0 | X | ✅/❌ |
| PER-001 nat | ≥ 3.8 | X.X | ✅/❌ |
| PER-009 nat | ≥ 3.8 | X.X | ✅/❌ |
| PER-010 nat | ≥ 4.2 | X.X | ✅/❌ |
| Manif (todos) | ≥ 0.83 | X.XX min | ✅/❌ |
| State PER-010 | =1 | X | ✅/❌ |
| State PER-001/009 | =0 | X | ✅/❌ |

**Veredito:** DoD ✅ / DoD ❌.

## Comparativo com Sub 1.B

| Métrica | Sub 1.B (mini + R9) | Sub 1.C (gpt-4o + R9) |
|---|---|---|
| 500 rate | ~33% em PER-001/010 | X% |
| PER-010 nat | 4.2 | X.X |
| PER-001 nat | 3.8 | X.X |
| Custo / run | ~$0.05 | ~$0.X |

## Decisão

[Se DoD ✅: "Squash-merge em main. Adoção permanente de gpt-4o → follow-up backlog (custo)."]
[Se DoD ❌: "Rollback. Abrir Sub 1.D atacando avenida (b) schema/Zod OU (β) claude-haiku-4-5. Branch fechada com PR informativo OU descartada."]

## Follow-ups

[Pós-DoD ✅: custo permanente | Pós-DoD ❌: Sub 1.D]
```

Preencher placeholders `X.X` com números reais dos logs.

- [ ] **Step 6.4: Commit report**

```bash
git add docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1c.md
git commit -m "$(cat <<'EOF'
docs(report): re-baseline post sub 1c gpt-4o

[Sumário 1-linha do veredito DoD ✅/❌ + número-chave]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Decisão final + ação (PR ou rollback)

**Bifurcação:** Path A se DoD ✅; Path B se DoD ❌.

### Path A — DoD ✅: squash-merge

- [ ] **Step 7A.1: Push branch atualizada**

Run: `git push origin feat/sub-1c-tattoo-reliability-edge-failures`
Expected: push limpo.

- [ ] **Step 7A.2: Abrir PR via gh**

Run:
```bash
gh pr create --title "fix(tattoo-agent): swap gpt-4o-mini -> gpt-4o (Sub 1.C reliability)" \
  --body "$(cat <<'EOF'
## Sumário

- Swap `gpt-4o-mini → gpt-4o` apenas no TattooAgent pra zerar HTTP 500s sob invariante R9 introduzida na Sub 1.B.
- Outros agents (cadastro/proposta/portfolio) inalterados.
- DoD ✅: 0 HTTP 500 em N execuções, qualidade preservada (ver report).

## Evidência

- Spec: `docs/superpowers/specs/2026-05-16-sub-1c-tattoo-reliability-gpt4o-design.md`
- Plan: `docs/superpowers/plans/2026-05-16-sub-1c-tattoo-reliability-gpt4o.md`
- Report: `docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1c.md`

## Test plan

- [x] Unit tests 443/443 verde.
- [x] Re-baseline 2× contra preview deploy: 0 HTTP 500.
- [x] Qualidade Sub 1.B preservada (nat ≥ 3.8 PER-001/009; ≥ 4.2 PER-010; manif ≥ 0.83 todos).

## Follow-up

Adoção permanente de gpt-4o vs híbrido mini+fallback → backlog P1 (decisão de produto pós-evidência de custo real em prod).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: URL do PR retornada.

- [ ] **Step 7A.3: Aguardar CI verde**

Run: `gh pr checks --watch`
Expected: todos os checks passam (unit tests, lint).

- [ ] **Step 7A.4: Squash-merge (Leandro aprova primeiro)**

**NÃO mergear sem aprovação explícita do Leandro.** Quando aprovado:

```bash
gh pr merge --squash --delete-branch
```
Expected: merge em main + branch local + remota deletadas.

### Path B — DoD ❌: rollback + scoping

- [ ] **Step 7B.1: Decisão imediata Leandro — PR informativo OU descartar branch**

Apresentar números do report ao Leandro. Opções:
- **(a) PR informativo zero-code-change:** revert do fix + manter docs (spec, plan, report) como evidência. Squash-merge mesmo com revert pra registrar tentativa.
- **(b) Descartar branch local:** mantém só specs/plans/reports em PR separado contra main pra evidência futura.

- [ ] **Step 7B.2 (se opção a): Revert do fix + commit**

```bash
git revert <hash-do-commit-fix-Task-3> --no-edit
```
Editar mensagem do commit revert pra deixar claro:

```
revert: gpt-4o swap (Sub 1.C DoD falhou)

DoD nao bateu (ver report 2026-05-16-tattoo-rebaseline-post-sub1c.md):
[1-linha resumo do gap].

Mantem prompt R9 + gpt-4o-mini em prod. Sub 1.D ataca proxima avenida.
```

Push + abrir PR com descrição clara de "fail-forward" + sequenciar Sub 1.D no backlog.

- [ ] **Step 7B.3 (se opção b): Cherry-pick docs pra branch nova + descartar feat branch**

```bash
git checkout main
git checkout -b docs/sub-1c-rebaseline-evidence
git cherry-pick <hash-spec> <hash-plan> <hash-report>
git push origin docs/sub-1c-rebaseline-evidence
gh pr create --title "docs: Sub 1.C evidence (DoD failed)" --body "Evidência pós-failure, sem code change. Sub 1.D virá próxima."
# Após merge desta PR docs-only:
git branch -D feat/sub-1c-tattoo-reliability-edge-failures
git push origin --delete feat/sub-1c-tattoo-reliability-edge-failures
```

- [ ] **Step 7B.4: Registrar Sub 1.D no backlog**

Via skill `/backlog-add` ou edit direto em `~/.claude/projects/.../memory/InkFlow — Pendências.md`: criar item P0 "Sub 1.D — avenida estrutural pós gpt-4o fail" com link pro report Sub 1.C.

---

## Riscos + mitigações (resumo executável)

| Risco | Trigger | Ação no plan |
|---|---|---|
| gpt-4o não zera 500s | 500 count > 0 em Task 5 | Path B Task 7 |
| Qualidade regride | nat/manif abaixo threshold em Task 6 | Path B Task 7 |
| Service Token expirado | 401 em Task 2.2 ou 4.3 | Abortar, escalar pro Leandro pra rotacionar |
| Cap de custo estourado | > $2 acumulado em Task 5 | Truncar 3º run, documentar no report |
| Rate limit OpenAI | erro em Task 5 mid-run | Retry com backoff manual; se persistir, fragmentar runs |
| CI quebra em Task 7A.3 | check vermelho | Investigar lint/unit. Se falha externa (ex: deps), retry |

---

## Resumo de commits planejados

| # | Tipo | Mensagem |
|---|---|---|
| 1 | docs | `docs: spec sub-1c gpt-4o reliability fix design` (já feito — `8cab681`) |
| 2 | docs | `docs: plan sub-1c gpt-4o reliability fix` (Task 1.2) |
| 3 | fix | `fix(tattoo-agent): swap gpt-4o-mini -> gpt-4o pra zerar 500s sob R9` (Task 3.5) |
| 4 | docs | `docs(report): re-baseline post sub 1c gpt-4o` (Task 6.4) |
| 5 (cond.) | revert | `revert: gpt-4o swap (Sub 1.C DoD falhou)` (apenas Path B) |

**Squash policy:** squash-merge na main (4 commits granulares na branch, 1 commit limpo em main). Justificativa: fix é 1 linha, history granular preservado na branch via PR, main fica limpo.
