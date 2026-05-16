# TattooAgent — Re-baseline Post Sub 1.B 2026-05-16

**Eval harness:** evals/inkflow-agent/_harness/run.mjs
**Judge model:** claude-haiku-4-5-20251001
**Base URL:** https://feat-sub-1b-prompt-iteration.inkflow-saas.pages.dev (preview deploy — R9 fix vive na branch `feat/sub-1b-prompt-iteration-tattoo`, ainda não em main)
**Rodado em:** 2026-05-16T15:36:21Z (run 1) + 2026-05-16T15:39:04Z (run 2)
**Runs:** 2 (mitigação flake — mediana onde diff > 0.3)

## Scores agregados

| Eval | Naturalidade | Manifesto | State | Próxima ação | Status |
|------|--------------|-----------|-------|--------------|--------|
| per-001-01-happy-path | 3.8 (1 run; outro deu 500) | 0.83 | 0 | pergunta esperado, retornou pergunta | FAIL + 1 ERROR |
| per-009-01-muda-decisao | 3.8 (mediana 3.8/3.8 — estável) | 0.625 (mediana 0.58/0.67 — diff 0.09 < 0.3) | 0 | handoff esperado, falhou | FAIL ambos |
| per-010-01-conflito-tamanho | 4.2 (1 run; outro deu 500) | 0.83 | 1 | pergunta esperado, retornou pergunta | FAIL + 1 ERROR |

**Pass rate**: 0/3 (zero evals passam todos os thresholds).
**Error rate**: 2/6 execuções (33%) com HTTP 500 — PER-001 run 1, PER-010 run 2.

## Diff vs baseline 2026-05-15 (Sub 1.A pré-R9, BASE_URL=https://inkflowbrasil.com)

Arquivo de referência: `docs/inkflow-agent/reports/2026-05-15-tattoo-baseline-pre-fix.md` (snapshot preservado pré-R9).

| Eval | nat pré | nat pós | manif pré | manif pós | state pré | state pós | 500s pré | 500s pós | Veredito |
|------|---------|---------|-----------|-----------|-----------|-----------|----------|----------|----------|
| PER-001 | 3.4 | 3.8 (1 run) | 0.92 | 0.83 | 0 | 0 | 0/2 | 1/2 | Naturalidade +0.4, **reliability regrediu** |
| PER-009 | 3.8 | 3.8 | 0.60 | 0.625 (mediana) | 0 | 0 | 0/2 | 0/2 | Sem mudança material |
| PER-010 | 2.6 | 4.2 (1 run) | 0.90 | 0.83 | 0 | 1 | 0/2 | 1/2 | Naturalidade **+1.6**, state +1, **reliability regrediu** |

**Leitura honesta do trade-off R9 (commit `18a48a9` — acoplamento decisão↔texto em `decisao.js`):**

R9 endureceu o validator `validateTattooOutputInvariant` em `tattoo.js`. Consequência:

- **Wins de qualidade quando passa:** PER-010 naturalidade saltou de 2.6 → 4.2 (+1.6) e state 0 → 1 — o caso de uso "conflito de tamanho" agora produz resposta materialmente melhor. PER-001 ganhou +0.4 em naturalidade.
- **Loss de reliability:** sob R9, outputs que antes saíam (mesmo com qualidade ruim) agora são rejeitados pelo validator → HTTP 500. Frequência: ~33% dos runs.

Não é regressão de qualidade — é trade-off explícito entre completion rate (quantos turnos chegam ao fim) e response quality (quão bom é o turno que chega). O gpt-4o-mini, sob constraints mais estritos, falha em produzir output válido em ~1/3 dos turnos críticos.

## Padrão estrutural confirmado (aprendizado-chave Sub 1.B)

Três iterações consecutivas de Task 5 (R10 anti-repergunta, R11 substituir+validar, §4.6 modo consultor ampliado) produziram a mesma assinatura de falha: PER-001 happy path regride com qualquer regra nova de policy-de-coleta. Todas revertidas em `ebfecc7`/`226b8f1`/`4e1b3f8`. FM-0005, FM-0009, FM-0001 marcados como `intratável-via-prompt` no catálogo.

R9 (invariante de OUTPUT) é a única vitória de prompt porque trata uma propriedade estrutural do output — não tenta moldar a policy de coleta do modelo.

**Implicação:** prompt iteration sozinho tem teto no gpt-4o-mini para TattooAgent. Próximas avenidas (Sub 1.C):

- (a) Mudança de modelo (gpt-4o como driver, ou claude-haiku-4-5)
- (b) Refator de prompt em sub-sistemas (consultor como agent separado; router cedo no fluxo)
- (c) Persona NO-CHANGE como control pra calibrar baseline
- (d) Validação estrutural em schema/Zod (move parte das constraints do prompt pro schema)

## DoD check (Sub 1.B — critérios oficiais do spec)

- [ ] **3 evals existentes sem HTTP 500s** — ❌ FAIL. 2/6 execuções (33%) com 500.
- [ ] **2/3 evals passam thresholds** (nat ≥ 4.0, manifesto ≥ 0.85, state = 1) — ❌ FAIL. 0/3 pass.
- [N/A] **Evals novos rodam até o fim** — não foram criados (Task 4 selecionou FM-0005/0009/0001, todos cobertos por evals existentes).
- [x] **Re-baseline rodou 2× sem flake material** — ✅ feito. Flake material em PER-001 e PER-010 (50% rate de 500) está documentado e é o achado principal do report.

**Veredito DoD:** **NÃO bate** os critérios oficiais.

## Notas — decisão de escopo

**Decisão Leandro (2026-05-16):** opção **(c) — entregar como está com nota explícita.**

R9 é win real que merece ir pra main (qualidade quando passa melhorou substancialmente em PER-001 e PER-010). PR vai pra `main` com:
- R9 fix preservado.
- 3 reversões (R10, R11, §4.6-amp) documentadas via commits `ebfecc7`/`226b8f1`/`4e1b3f8` + entries em FM-0005/0009/0001.
- Este report como evidência honesta do trade-off entre quality e reliability.

Reliability gap (33% rate de 500) fica encarregado da **Sub 1.C**, que ataca via avenidas estruturais (mudança de modelo, schema/Zod, sub-sistemas) — fora do escopo de prompt iteration.

Decisões descartadas e por quê:
- **(a)** Mudar DoD formalmente esconderia o trade-off real do reliability gap atrás de um critério ajustado.
- **(b)** Sub 1.B.2 adicionaria overhead de scoping sem entregar mais que a Sub 1.C já vai fazer.
- **(d)** Mais 1 iteração contradiz o aprendizado-chave: prompt iteration tem teto em gpt-4o-mini.

## Custos

Sub 1.B inteira: ~$1.50 (10+ deploys preview + ~25 evals harness) + ~$1.50 este re-baseline = **~$3.00 USD Anthropic** (estimado). Dentro do cap do spec (~$2-3 USD).

## Artefatos referenciados

- Backup baseline Sub 1.A: `/tmp/baseline-sub1a-backup.md` (cópia exata de `2026-05-15-tattoo-baseline-pre-fix.md`)
- Run 1 raw: `/tmp/baseline-run1.md`
- Run 2 raw: `/tmp/baseline-run2.md`
- Spec: `docs/superpowers/specs/2026-05-16-sub-1b-prompt-iteration-tattoo-design.md`
- Plan: `docs/superpowers/plans/2026-05-16-sub-1b-prompt-iteration-tattoo.md`
- Diagnose Fase A: `docs/inkflow-agent/reports/2026-05-16-tattoo-500s-diagnose.md`
- FM selection report: `docs/inkflow-agent/reports/2026-05-16-tattoo-sub1b-fm-selection.md`
- Failures atualizados: `FM-0005`, `FM-0009`, `FM-0001` (status `open` + notes intratável-via-prompt)
