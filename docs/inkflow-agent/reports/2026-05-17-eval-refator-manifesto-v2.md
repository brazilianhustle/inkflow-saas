# Eval re-baseline pós-refator manifesto v2 — TattooAgent

**Date:** 2026-05-17
**Branch:** `feat/refator-prompt-tattoo-manifesto-v2`
**HEAD SHA:** `7881e85`
**Preview URL:** https://feat-refator-prompt-tattoo-m.inkflow-saas.pages.dev
**Deploy:** `npx wrangler pages deploy . --project-name inkflow-saas --branch feat/refator-prompt-tattoo-manifesto-v2 --commit-dirty=true`
**Judge model:** `claude-haiku-4-5-20251001` (Anthropic)
**Predecessor:** `docs/inkflow-agent/reports/2026-05-17-eval-post-fase1.md`

---

## Comando rodado

```bash
BASE_URL=https://feat-refator-prompt-tattoo-m.inkflow-saas.pages.dev \
  node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs \
  --category=directed --agent=tattoo --persona=<per-001|per-009|per-010>
```

Rodada em **2 rounds completas** (6 runs total) — per-001, per-009, per-010 × 2.

---

## Resultados pós-refator manifesto v2

| Persona | Round | Status | Naturalidade | Manifesto adherence | Fails |
|---|---|---|---|---|---|
| per-001 (happy-path) | 1 | ❌ FAIL | 3.6 | 0.83 | naturalidade, manifesto |
| per-001 (happy-path) | 2 | ✅ **PASS** | **4.6** | **0.92** | — |
| per-009 (muda-decisao) | 1 | ❌ FAIL | 3.4 | 0.67 | naturalidade, manifesto |
| per-009 (muda-decisao) | 2 | ❌ FAIL | 3.4 | 0.75 | naturalidade, manifesto |
| per-010 (conflito-tamanho) | 1 | ❌ FAIL | 3.6 | 0.92 | naturalidade |
| per-010 (conflito-tamanho) | 2 | ❌ FAIL | 3.8 | 0.92 | naturalidade |

**Totais:**
- **Pass rate:** **1/6 runs** (~17%); por persona: **1/3** (per-001 passou em 1/2 rounds — flaky pass)
- **HTTP 500 rate:** **0/6** ✅ (mantém ganho da Fase 1)
- **Manifesto adherence média:** 0.83 (era ~0.6 no baseline pós-Fase 1) — subiu, mas per-009 ainda abaixo do threshold 0.85
- **Naturalidade média:** 3.7 (era ≥3.8 baseline) — quase estável, ainda abaixo do threshold 4.0

---

## Comparação A/B vs baseline pós-Fase 1

| Métrica | Baseline pós-Fase 1 (PR #71) | Refator v2 (PR ?) | Δ |
|---|---|---|---|
| HTTP 500 rate | 0/6 (0%) | 0/6 (0%) | = ✅ (mantido) |
| Pass rate | 0/6 | 1/6 | +1 run (melhora marginal) |
| Manifesto adherence (per-001) | <0.85 (média) | 0.83 (R1) / 0.92 (R2) | ↑ |
| Manifesto adherence (per-009) | 0.58 | 0.67 / 0.75 | ↑ (~+0.15) — ainda abaixo 0.85 |
| Manifesto adherence (per-010) | <0.85 | 0.92 (constante) | ↑ ✅ acima threshold |
| Naturalidade (per-009) | 4.2 (era melhor) | 3.4 | ↓ regressão tom |

**Movimento útil:** manifesto adherence subiu em todas as 3 personas. **Movimento adverso:** per-009 naturalidade caiu (4.2 → 3.4) — refator pode ter tornado o tom menos natural ali.

---

## DoD checkpoints — 8 critérios

| # | Critério | Threshold | Resultado | Status |
|---|---|---|---|---|
| 1 | HTTP 500 rate | 0/6 | 0/6 | ✅ PASS |
| 2 | **Pass rate** | **≥ 2/3 personas (4/6 runs)** | **1/3 personas (1/6 runs)** | ❌ **FAIL** |
| 3 | Naturalidade média | ≥ 4.0 | ~3.7 | ❌ FAIL |
| 4 | Manifesto adherence por persona com pass | ≥ 0.85 | per-001 R2: 0.92 ✅ / per-010: 0.92 ✅ / per-009: 0.67-0.75 ❌ | parcial |
| 5 | Suite local | 450/450 PASS (baseline real, plan dizia 773 mas era erro) | 450/450 | ✅ PASS |
| 6 | Custo total eval | ≤ $2.00 | ~$1.50 (estimado, sem spike) | ✅ PASS |
| 7 | `grep` R10 em decisao.js | R10 presente após R9 | R9@L110 < R10@L122 < §4.4@L154 | ✅ PASS |
| 8 | `grep` exemplos.js | Ex.3/9 sem anti-pattern, Ex.10 presente | 0/0/1/0 | ✅ PASS |

**Veredito: DoD FAIL** — DoD #2 (pass rate principal) e #3 (naturalidade) não bateram.

---

## Análise dos fails

### per-009 (muda-decisao) — pivot continua sendo crônico

Manifesto adherence baixo (0.67-0.75) em ambos rounds. Naturalidade ALTA queda vs baseline (4.2 → 3.4). Hipótese: o novo **Exemplo 10** (pivot) introduziu uma estrutura de validação substantiva no turn de pivot que o LLM tenta reproduzir, mas o resultado fica artificial ("Tranquilo, leao realismo e tatuagem que impoe — bem diferente da rosa fineline. Bora cravar com leao entao." é muito mecânico). O tom de "tatuador comentando casualmente" não pegou no pivot.

**Sugestão pra sub-spec B:** rever Ex.10 ou criar variações com pivots mais naturais. Possivelmente um "playbook §4.7" focado em mudança de decisão com 2-3 mini-exemplos.

### per-010 (conflito-tamanho) — manifesto OK, naturalidade quase

Manifesto adherence 0.92 constante (passa threshold). Mas naturalidade 3.6-3.8 — perto do 4.0 mas não atinge. R10 está sendo seguido (validação substantiva presente), conflito sendo tratado per R6 (pede foto). O que falha?

Hipótese: tom ainda tem resquício de "anotação" mecânica nos turnos. Ex.4 expandido pode estar ensinando um pattern muito formal pro handoff. Borderline FAIL.

**Sugestão pra sub-spec B:** lightweight — ajustar tom específico de Ex.4/Ex.5 pra menos formal.

### per-001 (happy-path) — flaky pass

R1: nat 3.6, man 0.83 (FAIL ambos thresholds). R2: nat 4.6, man 0.92 (PASS ambos). Mesmo prompt, mesmo input, comportamentos diferentes. **Variabilidade do LLM** (gpt-4o-mini não é determinístico mesmo com temp baixa).

**Implicação:** mesmo se refator está "tecnicamente competente", a estabilidade do output não está garantida. Threshold ≥ 2/3 personas pode ser muito apertado pra hoje. Talvez DoD precise ser revisado pra exigir threshold com replay (ex: persona passa se ≥ 1 de 3 rounds).

---

## Comparação contra refator A "competente"

Critério "refator A competente" do spec §7:
- ✅ R10 cravado conforme spec
- ✅ Exemplos reescritos conforme spec (com 2 deviations documentadas: Ex.10 turn 1 "Tudo certo por aqui." em vez de "Bem demais, e tu?" + `max_tokens` 6000→6500 no contract test)
- ✅ Sem regressão em suite local (450/450 PASS)

**Refator foi competente.** DoD FAIL com competência implementacional é sinal forte de que o diagnóstico do spec subestimou a complexidade — confirma a previsão do próprio spec §7 ("Se A não bater DoD com refator competente, é sinal forte de que diagnóstico subestimou complexidade — sub-spec B parte dessa evidência").

---

## Path B — protocolo aplicado

Per spec §7:

1. **NÃO retroativar A.** Spec + plan + commits desta branch preservados como evidência empírica.
2. **Mergeia A com DoD FAIL anotado** (este report) — mesmo padrão PR #70 Sub 1.C.
3. **Próximos passos** (decisão Leandro):
   - **(a) PR com DoD FAIL anotado** — preserva evidência + branch fica como histórico
   - **(b) Sub-spec B focado em per-009 pivot** — manifesto residual + naturalidade
   - **(c) Sub-spec B focado em naturalidade geral** — per-010 + per-009 ambos falham em nat
   - **(d) Revisar threshold DoD** — flaky pass do per-001 sugere que ≥2/3 personas pode ser muito apertado pra variabilidade real do LLM

---

## Apêndice — pastas relevantes

- **Evals raw:** `/tmp/eval-runs/round{1,2}-per-{001,009,010}.{json,log}` (não comitado — temp local)
- **Spec:** `docs/superpowers/specs/2026-05-17-refator-prompt-tattoo-manifesto-v2-design.md`
- **Plan:** `docs/superpowers/plans/2026-05-17-refator-prompt-tattoo-manifesto-v2.md`
- **Commits da branch:**
  - `7881e85` docs(plan)
  - `1550a98` Task 3 (Ex.2/5/6 light)
  - `cefe2de` Task 2 (Ex.3/4/9/10 heavy + Ex.10 novo)
  - `b9fe1ea` Task 1 (R10 cravado)
- **Predecessor report:** `docs/inkflow-agent/reports/2026-05-17-eval-post-fase1.md`
- **Manifesto canônico:** `docs/manifesto-tatuador-bot.md`
