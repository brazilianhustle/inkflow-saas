# InkFlow Agent — Sub 1.B — Prompt Iteration TattooAgent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-16-sub-1b-prompt-iteration-tattoo-design.md`

**Goal:** Eliminar HTTP 500s nas 3 evals directed do TattooAgent + corrigir até 3 failure modes via prompt iteration data-driven + re-baseline com delta documentado vs Sub 1.A.

**Architecture:** 5 fases sequenciais com gates de avanço (Diagnose → Reliability Fix → FM Selection → Prompt Iteration → Re-baseline). Decisão tattoo-only vs cross-cutting na Fase B determina escopo da Sub 1.B (escape hatch via spec próprio). Cada FM em escopo = 1 commit isolado (revert-friendly). Sem mudanças de schema ou migration — só prompt, eval, doc e patch leve em harness.

**Tech Stack:** Node.js (harness `evals/inkflow-agent/_harness/run.mjs`), Anthropic Haiku 4.5 judge, OpenAI gpt-4o-mini (model under test), Zod schema em `functions/api/agent/agents/tattoo.js`, prompts JS em `functions/_lib/prompts/coleta/tattoo/`, snapshot tests em `tests/prompts/snapshots/coleta-tattoo.txt`.

**Decisões das open questions do spec (default cravado):**
1. Diagnose: patch leve em `run.mjs` (flag `--capture-500-body`) + helper de extração — sem script separado pesado.
2. Snapshot regen: comando manual `npm test -- --update tests/prompts/snapshots/coleta-tattoo.txt` + diff review humano antes do commit.
3. Re-baseline flake: 2 runs; mediana se diff > 0.3 entre runs em qualquer dimensão.
4. Cross-cutting spec slug: `docs/superpowers/specs/2026-05-16-phase1-5-reliability-cross-agent-design.md`.
5. Failure history: texto livre (status quo Sub 1.A — sem campo `commit_hash` formal).
6. PR strategy: **1 PR único** `feat/sub-1b-prompt-iteration-tattoo` com commits internos separados por task/FM.

**Branch base:** `feat/sub-1b-prompt-iteration-tattoo` (já checada, base `main` em `3026ddd`).

**Estimativa total:** 5-7 dias úteis (spec). 7 tasks abaixo. Cap superior absorve escape hatch parcial.

---

## File Structure

| Caminho | Tipo | Responsabilidade |
|---|---|---|
| `evals/inkflow-agent/_harness/run.mjs` | modificar | adicionar flag `--capture-500-body` + persistir `response_body_raw` em `report.json` quando status=500 |
| `docs/inkflow-agent/reports/2026-05-16-tattoo-500s-diagnose.md` | criar | sumário consolidado da Fase A com causa raiz + categorização tattoo-only/cross-cutting |
| `docs/inkflow-agent/reports/2026-05-16-tattoo-500s-diagnose/` | criar (dir) | artefatos JSON crus por turno-500 capturado |
| `functions/_lib/prompts/coleta/tattoo/decisao.js` | modificar (condicional) | regras R1-R8 + §4.x — coração da policy; alvo principal da reliability fix tattoo-only e da iteração por FM |
| `functions/_lib/prompts/coleta/tattoo/exemplos.js` | modificar (condicional) | few-shots 1-8 — adicionar/editar quando FM exigir cobertura via exemplo |
| `functions/_lib/prompts/coleta/tattoo/contexto.js` | modificar (condicional) | auxiliar — só toca se diagnose/FM apontar gap específico |
| `functions/_lib/prompts/coleta/tattoo/identidade.js` | modificar (condicional) | idem |
| `functions/_lib/prompts/coleta/tattoo/faq.js` | modificar (condicional) | idem |
| `functions/api/agent/agents/tattoo.js` | modificar (condicional) | Zod schema + `validateTattooOutputInvariant` — relaxar/endurecer invariante só se diagnose B apontar |
| `tests/prompts/snapshots/coleta-tattoo.txt` | regen | snapshot regenerado quando prompt mudar (com diff review) |
| `docs/inkflow-agent/reports/2026-05-16-tattoo-sub1b-fm-selection.md` | criar | tabela cruzando reprodução empírica × audit priority × cobertura prompt × persona — fecha lista de até 3 FMs + 0-2 evals novos |
| `evals/inkflow-agent/directed/tattoo/per-XXX/01-<cenario>.json` | criar (0-2) | novos evals directed pra personas não cobertas (PER-012, PER-014, PER-002 ou outra que FM selection decidir) |
| `docs/inkflow-agent/failures/FM-XXXX-*.md` | modificar (até 3) | status `open` → `mitigated`, atualizar `## Histórico` com referência ao commit + eval de regression |
| `docs/inkflow-agent/failures/INDEX.md` | modificar | refletir status novo dos FMs em escopo |
| `docs/inkflow-agent/failures/FM-00XX-*.md` | criar (condicional) | só se Fase B cair em cross-cutting — novo FM documentando o gap transversal |
| `docs/superpowers/specs/2026-05-16-phase1-5-reliability-cross-agent-design.md` | criar (condicional) | só se Fase B cair em cross-cutting — spec próprio paralelo |
| `docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1b.md` | criar | re-baseline final pós-Sub-1.B com seção de diff vs `2026-05-15-tattoo-baseline.md` + check de DoD |

---

## Risk callouts (lembretes pro executor)

- **Reversibilidade**: tudo é prompt/eval/doc/patch leve. Hard guarantee do spec: zero schema/migration. Cada FM = commit isolado → `git revert <sha>` é o rollback canônico.
- **Branch point real na Fase B**: se diagnose categorizar como cross-cutting, a Task 3 vira "documentar + abrir spec novo" em vez de "patch tattoo". Não escala fix transversal aqui — escape hatch é regra dura.
- **Regression gating**: snapshot tests (`tests/prompts/snapshots/coleta-tattoo.txt`) e PER-001 happy path (já 3.4 naturalidade) são canários. Se PER-001 cair abaixo de 3.0 ou snapshot diverge sem revisão humana, reverte.
- **Custo Anthropic**: cap declarado ~$2-3 USD pra Sub 1.B inteira. Re-baseline final roda 2× (Fase E) — não rodar muito mais que isso.
- **Snapshot regen NÃO é automático**: comando explícito + diff review humano antes do commit. Sem `--update` cego no CI.

---

## Task 1: Patch harness — captura body completo de 500s

**Objetivo**: harness existente perde body de 500 (só registra `error: http 500`). Sem isso, diagnose Fase A não tem material. Patch leve, retrocompatível.

**Files:**
- Modify: `evals/inkflow-agent/_harness/run.mjs:140-170` (loop `playConv` que faz `fetch` e trata `!res.ok`)

**Pré-leitura obrigatória**: linhas 140-170 de `run.mjs` (loop fetch + error handling).

- [ ] **Step 1.1: Adicionar parse da flag `--capture-500-body` em `parseArgs`**

`parseArgs` (linhas 39-46) já aceita formato `--key=value`. Pra flag booleana sem valor, ajustar pra aceitar `--capture-500-body` como `args['capture-500-body'] = true`.

Edit em `evals/inkflow-agent/_harness/run.mjs:39-46`:

```javascript
function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = a.match(/^--(\w[\w-]*)=(.+)$/);
    if (m) { args[m[1]] = m[2]; continue; }
    const f = a.match(/^--(\w[\w-]*)$/);
    if (f) { args[f[1]] = true; }
  }
  return args;
}
```

- [ ] **Step 1.2: Propagar flag pro `playConv` e capturar body cru em 500**

Em `main` (linhas 240-285), `playConv` é chamado sem flags extras. Adicionar 3o arg opcional `{ capture500Body }`. No bloco `if (!res.ok)` (linha 163-165), ler `await res.text()` e retornar `{ transcript, error, response_body_raw, response_status }` quando flag ativa.

Edit em `evals/inkflow-agent/_harness/run.mjs`:

```javascript
// substituir assinatura playConv (linha 119):
async function playConv(conv, tenant, opts = {}) {

// substituir bloco !res.ok (linhas 163-165):
if (!res.ok) {
  let bodyRaw = null;
  if (opts.capture500Body && res.status >= 500) {
    try { bodyRaw = await res.text(); } catch { bodyRaw = '[read-error]'; }
  }
  return {
    transcript,
    error: `http ${res.status}`,
    ...(bodyRaw !== null && {
      response_status: res.status,
      response_body_raw: bodyRaw,
      turn_index: i,
      turn_content: turn,
    }),
  };
}

// em main, na chamada (linha 268):
const played = await playConv(conv, tenantResolved, { capture500Body: !!args['capture-500-body'] });
```

- [ ] **Step 1.3: Persistir `response_body_raw` no `report.json`**

Quando `played.error` E `played.response_body_raw` existem, incluir os campos no entry de `results`.

Edit em `evals/inkflow-agent/_harness/run.mjs:269-273` (bloco `if (played.error)`):

```javascript
if (played.error) {
  console.log(`❌ ${played.error}`);
  const entry = { id: conv.id, status: 'error', error: played.error };
  if (played.response_body_raw) {
    entry.response_status = played.response_status;
    entry.response_body_raw = played.response_body_raw;
    entry.turn_index = played.turn_index;
    entry.turn_content = played.turn_content;
  }
  results.push(entry);
  continue;
}
```

- [ ] **Step 1.4: Smoke manual contra uma eval que dá 500**

Roda em PER-010 (que estava em ERROR no baseline). Confirma que `report.json` tem `response_body_raw` populado.

```bash
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs \
  --category=directed --agent=tattoo --persona=per-010 --capture-500-body
cat evals/inkflow-agent/report.json | python3 -m json.tool | head -60
```

Esperado: entry `{ status: 'error', error: 'http 500', response_status: 500, response_body_raw: '<json com invariant_violation ou similar>', turn_index: N, turn_content: '...' }`.

Se PER-010 não der mais 500 (ambiente mudou desde baseline 2026-05-15), roda também `--persona=per-009`. Se nenhum dos dois der 500, registra fato (Fase A pode terminar early) e segue pro Task 2 que vai verificar empiricamente.

- [ ] **Step 1.5: Confirmar retrocompat — flag ausente não muda comportamento**

```bash
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs \
  --category=directed --agent=tattoo --persona=per-001
```

Esperado: roda como antes. Sem `response_body_raw` no `report.json` (entry sem o campo).

- [ ] **Step 1.6: Commit**

```bash
git add evals/inkflow-agent/_harness/run.mjs
git commit -m "$(cat <<'EOF'
feat(inkflow-agent): harness flag --capture-500-body pra diagnose Fase A

Sub 1.B Task 1. Captura response_body_raw + turn_index quando harness
recebe HTTP 5xx. Retrocompat: sem flag, comportamento idêntico ao Sub 1.A.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Fase A — Diagnose 500s (3 evals × 2 runs)

**Objetivo**: capturar bodies das 500s em PER-009 e PER-010 (e PER-001 se reaparecer), repetir 3× por turno pra detectar não-determinismo, declarar causa raiz, categorizar tattoo-only vs cross-cutting. Gate A→B: hipótese documentada.

**Cap rígido**: 1 dia (spec). Se não convergir, adota hipótese tattoo-only default + segue.

**Files:**
- Create: `docs/inkflow-agent/reports/2026-05-16-tattoo-500s-diagnose/` (dir, artefatos JSON crus)
- Create: `docs/inkflow-agent/reports/2026-05-16-tattoo-500s-diagnose.md` (sumário consolidado)

- [ ] **Step 2.1: Rodar harness 3× em cada persona com `--capture-500-body`**

```bash
mkdir -p docs/inkflow-agent/reports/2026-05-16-tattoo-500s-diagnose
for persona in per-001 per-009 per-010; do
  for run in 1 2 3; do
    node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs \
      --category=directed --agent=tattoo --persona=$persona --capture-500-body
    cp evals/inkflow-agent/report.json \
       docs/inkflow-agent/reports/2026-05-16-tattoo-500s-diagnose/${persona}-run${run}.json
  done
done
```

Esperado: 9 arquivos JSON crus na pasta `2026-05-16-tattoo-500s-diagnose/`. Custo Anthropic estimado: ~$0.50.

- [ ] **Step 2.2: Inspecionar manualmente cada `response_body_raw` em entries `status='error'`**

```bash
for f in docs/inkflow-agent/reports/2026-05-16-tattoo-500s-diagnose/*.json; do
  echo "=== $f ==="
  cat "$f" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for r in d.get('results', []):
    if r.get('status') == 'error':
        print(f\"  eval={r['id']} status={r.get('response_status')} turn={r.get('turn_index')} turn_content={r.get('turn_content','')[:60]}\")
        body = r.get('response_body_raw', '')
        try:
            b = json.loads(body)
            print(f\"    reason={b.get('reason')} error={b.get('error')}\")
        except Exception:
            print(f\"    raw={body[:200]}\")
"
done
```

Categoriza por entry: `prompt_fraco` / `invariante_forte_demais` / `retry_ausente` / `schema_mismatch` / `llm_non_determinism` / `outro`. Escreve notas em rascunho.

- [ ] **Step 2.3: Cruzar com `validateTattooOutputInvariant` em `functions/api/agent/agents/tattoo.js:64-111`**

Confere se o `reason` do 500 mapeia direto pra um dos 3 branches do validator: `handoff-sem-OBR-completos`, `enviar_portfolio sem payload_portfolio`, ou `pergunta com campos_faltando sem '?'`.

Decisão chave:
- Se reason cai no validator do tattoo.js → **tattoo-only** (ataca prompt ou relaxa invariante em `decisao.js`/`exemplos.js`/`tattoo.js`).
- Se reason vem de `route.js` ou camada compartilhada (handler global, retry ausente, parsing) → **cross-cutting** (escape hatch).

- [ ] **Step 2.4: Escrever `2026-05-16-tattoo-500s-diagnose.md`**

Estrutura mínima (segue formato Sub 1.A):

```markdown
# TattooAgent — Diagnose 500s 2026-05-16

**Contexto**: Sub 1.B Fase A. Baseline 2026-05-15 reportou ERROR HTTP 500 em
PER-009 e PER-010. Captura via `--capture-500-body` (Task 1).

**Runs**: 3 por persona × 3 personas = 9 runs. Artefatos crus em
`./2026-05-16-tattoo-500s-diagnose/`.

## Reprodução

| Persona | Run 1 | Run 2 | Run 3 | Determinismo |
|---|---|---|---|---|
| PER-001 | ... | ... | ... | ... |
| PER-009 | ... | ... | ... | ... |
| PER-010 | ... | ... | ... | ... |

## Hipótese de causa raiz por persona

### PER-009 (muda decisão)
- Body cru (run X): `{...}`
- Layer: tattoo.js / route.js / outro
- Reason mapeado: `<reason exata do validator OU do route>`
- Hipótese: prompt fraco | invariante forte | retry ausente | schema mismatch | LLM non-determinism

### PER-010 (conflito tamanho)
... (mesma estrutura)

## Categorização final

- [ ] tattoo-only (default — vai pra Task 3a)
- [ ] cross-cutting (escape hatch — vai pra Task 3b)

## Plano da Fase B

(escreve qual arquivo e qual mudança específica, ou qual FM novo + spec novo)
```

- [ ] **Step 2.5: Commit do diagnose (independente do branch de Fase B)**

```bash
git add docs/inkflow-agent/reports/2026-05-16-tattoo-500s-diagnose.md \
        docs/inkflow-agent/reports/2026-05-16-tattoo-500s-diagnose/
git commit -m "$(cat <<'EOF'
docs(inkflow-agent): Sub 1.B Fase A — diagnose 500s tattoo

Captura body cru de 9 runs (3 personas × 3) via --capture-500-body.
Hipótese de causa raiz + categorização tattoo-only vs cross-cutting
registrada. Gate A→B fechado.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Gate A→B**: hipótese de causa raiz documentada + categorizada como tattoo-only OU cross-cutting. Próxima task é a 3a OU 3b, NÃO ambas.

---

## Task 3a: Fase B — Reliability fix tattoo-only (CONDICIONAL)

**Executar SOMENTE se Task 2 categorizou como tattoo-only.** Se cross-cutting, pular pra Task 3b.

**Objetivo**: aplicar 1 fix mínimo em `decisao.js` / `exemplos.js` / `tattoo.js` que elimina 500s em PER-009 e PER-010 sem regredir PER-001. Cap: 3 iterações. Se não converge, escala pra Task 3b.

**Files (escolha 1-2 baseado no diagnose):**
- Modify: `functions/_lib/prompts/coleta/tattoo/decisao.js` (regras R1-R8, §4.x)
- Modify: `functions/_lib/prompts/coleta/tattoo/exemplos.js` (few-shots 1-8)
- Modify: `functions/api/agent/agents/tattoo.js:64-111` (`validateTattooOutputInvariant` — só relaxar se invariante for o problema)
- Regen: `tests/prompts/snapshots/coleta-tattoo.txt`

- [ ] **Step 3a.1: Editar arquivo(s) apontado(s) no diagnose**

Edita conforme hipótese. Exemplos baseados nos branches do validator:
- Se reason = `handoff-sem-OBR-completos` em conversa com mudança de decisão → adicionar §4.X em `decisao.js` cobrindo "substituir dados após troca de decisão" + few-shot novo em `exemplos.js` cobrindo PER-009-like.
- Se reason = `pergunta com campos_faltando=[...] sem '?'` → adicionar regra explícita em `decisao.js` "toda pergunta com campos pendentes termina em '?'" + reforçar 1 few-shot.
- Se reason vem de invariante semanticamente errada → relaxar `validateTattooOutputInvariant` apenas no branch problemático (ex: aceitar `?` ou `.` final em pergunta com 1 único campo conflitante puro).

Mudança mínima viável. Não refatora prompt inteiro.

- [ ] **Step 3a.2: Regenerar snapshot do prompt e revisar diff**

```bash
npm test -- --update tests/prompts/snapshots/coleta-tattoo.txt
git diff tests/prompts/snapshots/coleta-tattoo.txt
```

Esperado: diff contém só as linhas que mudaram em `decisao.js`/`exemplos.js` (ou nada se mudança foi só em `tattoo.js`). Diff não-intencional = reverte e revisa.

- [ ] **Step 3a.3: Rodar regression suite local**

```bash
npm test
```

Esperado: tudo verde. Snapshot test atualizado conta como pass. Invariant tests em `tests/prompts/invariants.test.mjs` precisam continuar passando — se cair, fix introduziu regressão; reverte.

- [ ] **Step 3a.4: Re-rodar 3 evals existentes via harness — gate B→C**

```bash
for persona in per-001 per-009 per-010; do
  node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs \
    --category=directed --agent=tattoo --persona=$persona
done
```

Esperado: 0 erros HTTP 500 em PER-009 e PER-010. PER-001 não pode regredir (naturalidade ≥ 3.0 mínimo, idealmente mantém ≥ 3.4).

Se ainda há 500: itera no fix (passos 3a.1-3a.4) até 3 tentativas. Se na 3ª tentativa ainda há 500, aborta tattoo-only e vai pra Task 3b.

- [ ] **Step 3a.5: Commit do fix de reliability**

```bash
git add functions/_lib/prompts/coleta/tattoo/ \
        functions/api/agent/agents/tattoo.js \
        tests/prompts/snapshots/coleta-tattoo.txt
git commit -m "$(cat <<'EOF'
fix(inkflow-agent): Sub 1.B Fase B — reliability fix tattoo-only

Elimina HTTP 500 em PER-009/PER-010 (causa raiz <REASON> identificada
em diagnose Fase A). Mudança mínima em <arquivo(s)>. Snapshot regenerado
+ regression suite verde. PER-001 happy path preservado (nat=<X>).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Gate B→C (tattoo-only)**: 3 evals rodam sem 500. Próxima task: Task 4 (FM selection).

---

## Task 3b: Fase B — Cross-cutting escape hatch (CONDICIONAL)

**Executar SOMENTE se Task 2 categorizou como cross-cutting OU se Task 3a falhou em 3 iterações.**

**Objetivo**: NÃO consertar transversalmente aqui. Documentar gap como FM novo + abrir spec próprio paralelo. Sub 1.B continua só com prompt iteration nos FMs que não dependem do fix transversal.

**Files:**
- Create: `docs/inkflow-agent/failures/FM-0013-<slug>.md` (próximo ID disponível — INDEX atual vai até FM-0012; confirmar com `ls docs/inkflow-agent/failures/`)
- Modify: `docs/inkflow-agent/failures/INDEX.md` (adicionar linha + atualizar contagens)
- Create: `docs/superpowers/specs/2026-05-16-phase1-5-reliability-cross-agent-design.md`

- [ ] **Step 3b.1: Confirmar próximo ID de FM**

```bash
ls docs/inkflow-agent/failures/ | grep -E '^FM-' | sort
```

Esperado: último é FM-0012. Próximo = FM-0013. Slug curto do gap (ex: `route-retry-ausente`, `validator-shared-rejeita-pergunta-conflito-puro`).

- [ ] **Step 3b.2: Criar `FM-0013-<slug>.md` seguindo `_template.md`**

Read `docs/inkflow-agent/failures/_template.md`. Preenche frontmatter (type=`infra_error` ou `state_error` conforme natureza, layers=`['route_handler']` ou `['shared_validator']`, agents_affected=`[TattooAgent, CadastroAgent, PropostaAgent, PortfolioAgent]` se transversal real). Personas_exposing = PER-009 + PER-010 (as que produziram 500). Status inicial: `open`.

Body inclui:
- **Descrição**: gap exato, com referência ao diagnose report.
- **Diagnóstico**: linha + arquivo do código (ex: `route.js:NNN` ou `validator-shared.js:NNN`) com causa raiz.
- **Contramedida**: "Tratado em spec próprio — Phase 1.5 Reliability Cross-Agent".
- **Regression test**: "Cobertura pendente — definida no spec Phase 1.5".

- [ ] **Step 3b.3: Atualizar `INDEX.md` com FM-0013 + contagens**

Edit em `docs/inkflow-agent/failures/INDEX.md`:
- Adicionar linha tabular pro FM-0013.
- Atualizar contagens em "Distribuição por status" (`open` +1), "Distribuição por tipo", "Distribuição por agent".
- Atualizar "Última revisão" pra `2026-05-16`.

- [ ] **Step 3b.4: Rodar lint do catálogo**

```bash
npm run inkflow-agent:lint
```

Esperado: pass. Se quebra (links cruzados), conserta.

- [ ] **Step 3b.5: Criar spec próprio `2026-05-16-phase1-5-reliability-cross-agent-design.md`**

Estrutura mínima (status=`brainstorm`, NÃO `ready-to-plan` — Leandro brainstorma depois):

```markdown
---
title: InkFlow Agent — Phase 1.5 Reliability Cross-Agent
status: brainstorm
created: 2026-05-16
owner: leandro
parent_spec: docs/superpowers/specs/2026-05-15-inkflow-agent-program-design.md
trigger: Sub 1.B Fase A categorizou causa raiz das 500s em PER-009/010 como cross-cutting
---

# Contexto
(síntese do diagnose 2026-05-16-tattoo-500s-diagnose.md)

# Gap
FM-0013 — <descrição>

# Escopo provisório
- Arquivo alvo: <route.js | validator-shared.js | ...>
- Mudança proposta: <retry | parse robusto | invariante mais leniente | outro>
- Agents afetados: <lista>

# Não-goals
- Não toca prompts dos agents (já cobertos por Subs 1.B/2.x/3.x/4.x)

# Open
- Brainstorm completo com Leandro pendente
```

- [ ] **Step 3b.6: Re-rodar evals — confirmar quais FMs NÃO dependem do fix transversal**

```bash
for persona in per-001 per-009 per-010; do
  node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs \
    --category=directed --agent=tattoo --persona=$persona
done
```

Esperado: PER-001 funciona (cross-cutting não bloqueia ele). PER-009 e PER-010 ainda dão 500 (esperado — fix transversal é em spec separado). Registra resultado pra usar na Task 4.

- [ ] **Step 3b.7: Commit do escape hatch**

```bash
git add docs/inkflow-agent/failures/FM-0013-*.md \
        docs/inkflow-agent/failures/INDEX.md \
        docs/superpowers/specs/2026-05-16-phase1-5-reliability-cross-agent-design.md
git commit -m "$(cat <<'EOF'
docs(inkflow-agent): Sub 1.B Fase B — escape hatch cross-cutting

Diagnose 2026-05-16 categorizou causa raiz dos 500s como transversal
(<route_handler|shared_validator>). Sub 1.B segue paralelo só com
prompt iteration nos FMs que não dependem do fix. FM-0013 + spec
Phase 1.5 abertos pra tratar separadamente.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Gate B→C (cross-cutting)**: FM-0013 + spec criados + commit pushed. DoD da Sub 1.B revisado na Fase E: "3 evals rodam até o fim sem 500s" vira "3 evals rodam até o fim OU 500 explicada por FM-0013".

---

## Task 4: Fase C — FM selection report (½ dia)

**Objetivo**: com baseline limpa (sem 500s, ou com 500s explicadas por cross-cutting), cruzar reprodução empírica × audit priority × cobertura prompt × persona. Fechar lista de até 3 FMs em escopo + 0-2 evals novos. Gate C→D documental.

**Files:**
- Create: `docs/inkflow-agent/reports/2026-05-16-tattoo-sub1b-fm-selection.md`

**Inputs:**
- `docs/inkflow-agent/reports/2026-05-15-tattoo-audit-baseline.md` (audit Sub 1.A — top 3 priorizados)
- `docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md` (scores reais Sub 1.A)
- `docs/inkflow-agent/failures/INDEX.md` (catálogo completo)
- Resultado das re-rodadas do Task 3a/3b (scores pós-fix de reliability — informa quais FMs ainda doem)

- [ ] **Step 4.1: Re-rodar baseline completa pós-reliability fix**

```bash
npm run inkflow-agent:baseline
```

Esperado: gera `docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md` reescrito (script reusa o caminho 2026-05-15 — preserva versão antiga com `git stash` se quiser comparar lado-a-lado).

Captura scores reais — qual eval ainda falha em naturalidade, qual em manifesto, qual em state. Isso indica quais FMs reproduzem empiricamente.

- [ ] **Step 4.2: Listar FMs candidatos com cobertura zero ou parcial**

Lê `INDEX.md` + cada FM com status `open`. Candidatos do spec:
- FM-0001 (modo consultor não acionado — PER-002/009 — cobertura parcial)
- FM-0008 (insiste em cliente vago — PER-008 — zero)
- FM-0009 (muda decisão — PER-009 — coberto após fix B)
- FM-0011 (frio em momento emocional — PER-012 — zero)
- FM-0012 (estilo indisponível — PER-014 — zero)

FMs `mitigated` (FM-0003, FM-0007) e `fixed` (FM-0010) ficam fora salvo regressão na baseline.

- [ ] **Step 4.3: Cruzar empiria × audit × cobertura → escolher até 3 FMs**

Critério (do spec §4.2): (a) reprodução empírica na baseline pós-fix, (b) impacto declarado no catálogo, (c) cap de 3 FMs. Eval novo só se persona não coberta — cap 2.

- [ ] **Step 4.4: Escrever `2026-05-16-tattoo-sub1b-fm-selection.md`**

Usa formato literal do spec §4.2 (tabela + seção "FMs em escopo final" + "Justificativa de exclusão" + "Evals novos planejados"). FMs e evals concretos vêm das decisões dos passos 4.2-4.3 — NÃO usa as personas ilustrativas do spec como fato.

- [ ] **Step 4.5: Review humano (Leandro) — gate C→D**

Pausa pra aprovação explícita do Leandro antes de mexer em prompt. Se Leandro reordena/recusa um FM, ajusta o report e re-pede aprovação.

- [ ] **Step 4.6: Commit do FM selection report**

```bash
git add docs/inkflow-agent/reports/2026-05-16-tattoo-sub1b-fm-selection.md \
        docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md
git commit -m "$(cat <<'EOF'
docs(inkflow-agent): Sub 1.B Fase C — FM selection report

Cruza reprodução empírica pós-fix-reliability × audit Sub 1.A × cobertura
prompt × persona. <N> FMs em escopo + <M> evals novos planejados. Review
humano (Leandro) aprovou. Gate C→D fechado.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Gate C→D**: lista fechada de até 3 FMs + 0-2 evals novos + approval do Leandro.

---

## Task 5: Fase D — Prompt iteration por FM (loop, 1-3 iterações)

**Objetivo**: pra cada FM em escopo (de Task 4): criar/atualizar eval, iterar prompt, rodar directed eval até pass thresholds, rodar regression suite, atualizar failure entry. **Cada FM = 1 commit isolado** (revert-friendly).

**Repetir este task N vezes, onde N = número de FMs em escopo (1-3).** Cada iteração produz 1 commit.

**Files (por FM):**
- Create (se persona não coberta): `evals/inkflow-agent/directed/tattoo/per-XXX/01-<slug>.json`
- Modify: `functions/_lib/prompts/coleta/tattoo/decisao.js` E/OU `exemplos.js` (E condicionalmente `contexto.js`, `identidade.js`, `faq.js`)
- Regen: `tests/prompts/snapshots/coleta-tattoo.txt`
- Modify: `docs/inkflow-agent/failures/FM-XXXX-*.md` (status `open` → `mitigated`, histórico atualizado)
- Modify: `docs/inkflow-agent/failures/INDEX.md` (status novo + contagens)

**Inputs por FM:** entry do failure catalog + persona doc + eval JSON existente (modelo).

### Subtasks por FM (repetir loop pra cada um dos 1-3 FMs)

- [ ] **Step 5.X.1: (Condicional) Criar eval novo se persona não coberta**

Modelo: copia `evals/inkflow-agent/directed/tattoo/per-009/01-muda-decisao.json` (já vimos schema completo). Adapta:
- `id`: `per-XXX-01-<slug>`
- `titulo`: descrição curta cenário
- `descricao`: cita FM-XXXX + manifesto principle aplicável
- `estado_atual`: `coletando_tattoo`
- `persona`: `PER-XXX` (formato `PER-0NN`)
- `turns_cliente`: 4-6 turnos representativos da persona
- `expected.proxima_acao_esperada`: `handoff` | `pergunta` | `enviar_portfolio` | `erro`
- `expected.manifesto_principles_aplicaveis`: array de `P1`-`P6`
- `expected.should_not_contain`: frases que violam o FM
- `expected.should_contain_at_least_one`: frases-âncora esperadas
- `thresholds`: `naturalidade_min: 4.0`, `manifesto_adherence_min: 0.85`

Caminho: `evals/inkflow-agent/directed/tattoo/per-XXX/01-<slug>.json` (criar dir se necessário).

Validar schema:

```bash
npm test -- tests/inkflow-agent/eval-schema-lint.test.mjs
```

Esperado: pass.

- [ ] **Step 5.X.2: Dry-run do eval novo via harness pra confirmar carregamento**

```bash
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs \
  --category=directed --agent=tattoo --persona=per-XXX
```

Esperado: roda até o fim (mesmo que falhe nos thresholds — vai falhar agora, é o ponto). Sem 500 NEM `error: invalid_json` NEM `error: eval not found`.

- [ ] **Step 5.X.3: Editar prompt — mudança mínima pra atacar o FM**

Lê `FM-XXXX-*.md` na seção "Diagnóstico" e "Contramedida" (sugestões já documentadas em Phase 0). Aplica:
- Regra nova em `decisao.js` (§4.x ou Rn) endereçando o gap específico.
- E/OU few-shot novo em `exemplos.js` cobrindo o turn-by-turn da persona.
- Auxiliares (`contexto.js`, `identidade.js`, `faq.js`) só se o gap for de tom/identidade/info estática.

Regra: 1 FM = 1 mudança coesa. Não bundle 2 FMs no mesmo edit.

- [ ] **Step 5.X.4: Regenerar snapshot + diff review**

```bash
npm test -- --update tests/prompts/snapshots/coleta-tattoo.txt
git diff tests/prompts/snapshots/coleta-tattoo.txt
```

Esperado: diff só na seção que mudou. Se aparecer mudança não-intencional (whitespace global, reorder não-pedido), reverte e investiga.

- [ ] **Step 5.X.5: Rodar regression suite local**

```bash
npm test
```

Esperado: tudo verde. Snapshot test consome o snapshot novo. Invariants test continua passando. Contracts test continua passando.

- [ ] **Step 5.X.6: Rodar directed eval do FM + regression dos outros 2 existentes**

```bash
for persona in per-001 per-009 per-010 per-XXX; do
  node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs \
    --category=directed --agent=tattoo --persona=$persona
done
```

Esperado:
- `per-XXX` (FM novo) passa thresholds (`naturalidade ≥ 4.0`, `manifesto ≥ 0.85`).
- PER-001/009/010 não regridem (status pass mantido, scores ≥ baseline do Task 4).

Se eval do FM não passa: itera passos 5.X.3-5.X.6 até 3 tentativas. Se na 3ª ainda não passa, marca FM como `intratável-via-prompt`:
- Atualiza `FM-XXXX-*.md` adicionando entry em Histórico: `"2026-05-16: Sub 1.B — 3 iterações de prompt não convergiram. Marcado intratável-via-prompt. Escalado pra próxima sub-fase."`
- Status fica em `open` (não vira `mitigated`).
- NÃO bloqueia outros FMs — segue pro próximo no loop.

Se eval do FM passa MAS regression quebra: reverte commit dele, retoma com hipótese revisada.

- [ ] **Step 5.X.7: Atualizar failure entry — status `open` → `mitigated`**

Edit em `docs/inkflow-agent/failures/FM-XXXX-*.md`:
- Frontmatter: `status: open` → `status: mitigated`, `last_change: 2026-05-16`.
- Seção `## Contramedida`: substitui "Pendente" por descrição real da regra/few-shot + arquivo/linha.
- Seção `## Regression test`: aponta pro eval que cobre (`evals/inkflow-agent/directed/tattoo/per-XXX/01-*.json`).
- Seção `## Histórico`: append `"2026-05-16: Sub 1.B — contramedida em commit <será preenchido pós-commit>. Status: open → mitigated."`

- [ ] **Step 5.X.8: Atualizar `INDEX.md`**

- Linha do FM-XXXX: coluna `Status` muda pra `mitigated`.
- Contagens: `open -1`, `mitigated +1`.
- "Última revisão": `2026-05-16`.

- [ ] **Step 5.X.9: Lint do catálogo**

```bash
npm run inkflow-agent:lint
```

Esperado: pass.

- [ ] **Step 5.X.10: Commit isolado do FM**

```bash
git add functions/_lib/prompts/coleta/tattoo/ \
        tests/prompts/snapshots/coleta-tattoo.txt \
        evals/inkflow-agent/directed/tattoo/per-XXX/ \
        docs/inkflow-agent/failures/FM-XXXX-*.md \
        docs/inkflow-agent/failures/INDEX.md
git commit -m "$(cat <<'EOF'
feat(inkflow-agent): Sub 1.B Fase D — mitigate FM-XXXX <slug>

<1-2 frases: o que mudou no prompt, qual persona testada, qual score>.
FM-XXXX status: open → mitigated. Regression suite verde. PER-001/009/010
sem regressão.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Anota o SHA do commit e edita `## Histórico` do FM com o SHA real (commit amend OU commit doc-only de follow-up — preferência: commit doc-only `chore(inkflow-agent): registra SHA em FM-XXXX histórico` pra preservar imutabilidade do commit anterior).

**Gate D→E (por FM)**: eval directed do FM passa + regression verde + failure entry mitigated. Avança pro próximo FM (volta no passo 5.X.1) OU encerra Task 5 (se foi o último FM).

---

## Task 6: Fase E — Re-baseline final + DoD check (½ dia)

**Objetivo**: rodar `npm run inkflow-agent:baseline` 2× contra prod com prompts novos, agregar (mediana se diff > 0.3), gerar report final com diff vs baseline Sub 1.A, validar DoD.

**Files:**
- Create: `docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1b.md`

- [ ] **Step 6.1: Rodar baseline 2× (mitigação de flake)**

```bash
npm run inkflow-agent:baseline
cp docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md /tmp/baseline-run1.md

npm run inkflow-agent:baseline
cp docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md /tmp/baseline-run2.md
```

Custo Anthropic estimado: ~$1.50 (depende de # evals — 3 a 5).

- [ ] **Step 6.2: Comparar runs — detectar flake**

```bash
diff /tmp/baseline-run1.md /tmp/baseline-run2.md
```

Pra cada eval × dimensão (naturalidade / manifesto / state), se diff > 0.3 entre runs → usa mediana das 2 (anota no report final). Se diff ≤ 0.3 → usa última.

- [ ] **Step 6.3: Escrever `2026-05-16-tattoo-rebaseline-post-sub1b.md`**

Estrutura do spec §4.4 (formato literal):

```markdown
# TattooAgent — Re-baseline Post Sub 1.B 2026-05-16

**Eval harness:** evals/inkflow-agent/_harness/run.mjs
**Judge model:** claude-haiku-4-5-20251001
**Base URL:** https://inkflowbrasil.com
**Rodado em:** <ISO>
**Runs:** 2 (mitigação flake — mediana onde diff > 0.3)

## Scores agregados

| eval | naturalidade | manifesto | state | proxima_acao | status |
| ... | ... | ... | ... | ... | ... |

## Diff vs baseline 2026-05-15

| eval | nat pre | nat pos | manif pre | manif pos | state pre | state pos | Δ |
| ... | ... | ... | ... | ... | ... | ... | ... |

## DoD check (Sub 1.B)

- [ ] 3 evals existentes sem 500s: <✅|❌>
- [ ] 2/3 pass thresholds (nat≥4.0, manif≥0.85, state=1): <✅|❌>
- [ ] Evals novos rodaram até o fim: <✅|❌|N/A>
- [ ] Re-baseline rodou 2× sem flake material: <✅|❌>

## Notas
(qualquer instabilidade, decisões tomadas, FMs intratáveis registrados, etc)
```

- [ ] **Step 6.4: Validar DoD — gate de merge**

Se DoD bate (3 sem 500 + 2/3 pass): commita report e prossegue pro Task 7 (PR).

Se DoD NÃO bate: NÃO mergeia. Decide explicitamente com Leandro:
- (a) estender prazo (mais 1 iteração em algum FM)
- (b) reduzir escopo (descommit do FM problemático)
- (c) marcar Sub 1.B como `parcial` e abrir Sub 1.B.2

Decisão registrada no próprio report final (seção "Notas") + comunicada via daily note. NÃO merge silencioso.

- [ ] **Step 6.5: Commit do re-baseline final**

```bash
git add docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1b.md
git commit -m "$(cat <<'EOF'
docs(inkflow-agent): Sub 1.B Fase E — re-baseline final

2 runs agregados (mediana onde diff > 0.3). Diff vs baseline Sub 1.A
documentado. DoD: <PASS|FAIL — detalhe>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Gate E (DoD Sub 1.B)**: 3 evals existentes 0 erros + 2/3 pass thresholds + report commitado.

---

## Task 7: Abrir PR Sub 1.B único + agendar Sub 1.C brainstorm

**Objetivo**: 1 PR único contra `main` agregando todos os commits (Tasks 1-6). Sem squash — preserva commits separados por fase/FM pra rollback granular. Agenda brainstorm da Sub 1.C como follow-up.

- [ ] **Step 7.1: Push da branch**

```bash
git push -u origin feat/sub-1b-prompt-iteration-tattoo
```

- [ ] **Step 7.2: Confirmar checks CI verdes**

```bash
gh pr checks --branch feat/sub-1b-prompt-iteration-tattoo 2>/dev/null || \
  gh run list --branch feat/sub-1b-prompt-iteration-tattoo --limit 5
```

Esperado: regression suite verde (test + lint + build). Se vermelho, conserta antes de abrir PR.

- [ ] **Step 7.3: Abrir PR**

```bash
gh pr create --base main --head feat/sub-1b-prompt-iteration-tattoo \
  --title "feat(inkflow-agent): Sub 1.B — prompt iteration TattooAgent" \
  --body "$(cat <<'EOF'
## Sumário

Sub 1.B do programa InkFlow Agent. 5 fases sequenciais com gates:

- **Fase A — Diagnose 500s**: captura body cru via flag `--capture-500-body` no harness; categorização tattoo-only vs cross-cutting.
- **Fase B — Reliability fix**: <tattoo-only: descrição da mudança> OU <cross-cutting: FM-0013 + spec Phase 1.5 abertos>.
- **Fase C — FM selection**: <N> FMs em escopo (FM-XXXX, FM-YYYY, FM-ZZZZ) + <M> evals novos (PER-XXX, PER-YYY).
- **Fase D — Prompt iteration**: <N> commits, 1 por FM. Status `open` → `mitigated` em cada.
- **Fase E — Re-baseline**: 2 runs agregados. DoD: <PASS — detalhe>.

## DoD check

- [x] Diagnose report commitado
- [x] Reliability fix aplicado (tattoo-only) OU escape hatch documentado
- [x] 3 evals existentes (PER-001/009/010) rodam sem HTTP 500
- [x] FM selection report commitado
- [x] Até 3 FMs `mitigated`
- [x] Até 2 evals novos criados
- [x] Re-baseline report commitado + DoD bate
- [x] Regression suite verde em CI
- [ ] PR mergeado em main (este merge)
- [ ] Brainstorm Sub 1.C agendado (follow-up)

## Test plan

- [x] `npm test` local (regression + snapshot + invariants + eval-schema-lint)
- [x] `npm run inkflow-agent:lint` (failure catalog coerência)
- [x] `npm run inkflow-agent:baseline` 2× (Fase E)
- [x] Directed evals por FM em escopo passam thresholds individuais
- [x] CI verde

## Spec + plan

- Spec: `docs/superpowers/specs/2026-05-16-sub-1b-prompt-iteration-tattoo-design.md`
- Plan: `docs/superpowers/plans/2026-05-16-sub-1b-prompt-iteration-tattoo.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Captura URL do PR.

- [ ] **Step 7.4: Aguardar review do Leandro + merge**

Leandro revisa. Ajustes feitos como commits adicionais na branch (sem amend de commits já pushed). Merge: preferência `--merge` (não squash, preserva commits granulares pra revert por FM).

- [ ] **Step 7.5: Agendar Sub 1.C brainstorm**

Adicionar item no backlog (via `/backlog-add`):

```
Sub 1.C — TattooAgent edge failures + DoD close (input: re-baseline post Sub 1.B)
```

Re-baseline final é input central pro Sub 1.C — confirmar que está commitado em `main`.

**Done state**: PR mergeado em main + backlog item Sub 1.C registrado.

---

## Self-review notes (do autor do plan, pós-rascunho)

- **Spec coverage**: cada componente C1-C6 do spec tem task mapeada (C1 → Task 1+2 / C2 → Task 3a/3b / C3 → Task 4 / C4-C5 → Task 5 / C6 → Task 5 + 6). DoD do spec (§Definition of Done) coberto literalmente no PR body do Task 7.
- **Branch condicional**: Task 3a OU Task 3b, nunca ambos. Plan deixa explícito que executor pula um dos dois.
- **Loop dinâmico**: Task 5 é loop de N (1-3) iterações dependendo do FM selection — cada FM = commit isolado. Plan instrui o executor a repetir os subpassos N vezes em vez de listar 3 conjuntos duplicados.
- **Placeholders no plan**: campos `<...>` no body de commits e em FMs específicos são intencionais — o conteúdo só é conhecido em runtime (qual FM, qual reason, qual SHA). O plan instrui exatamente o quê preencher.
- **Open questions**: as 6 do spec foram resolvidas no header do plan com os defaults explicitamente cravados.
- **PR strategy**: 1 PR único com commits separados internamente (default do spec). Não usa squash no merge — preserva rollback granular.
- **Estimativa**: 7 tasks pra 5-7 dias úteis. Task 5 é a mais variável (1-3 FMs × ~½ dia por FM = 0.5-1.5 dia).
