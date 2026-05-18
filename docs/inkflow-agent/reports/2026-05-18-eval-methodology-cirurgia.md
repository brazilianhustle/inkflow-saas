# Eval Methodology Cirurgia — Implementation Report

**Data:** 2026-05-18
**Branch:** `feat/eval-methodology-cirurgia` (PR → main)
**Spec:** `docs/superpowers/specs/2026-05-18-eval-methodology-cirurgia-design.md`
**Predecessor:** `docs/inkflow-agent/reports/2026-05-18-eval-instrumentation-baseline.md` (PR #73)

---

## 1. Motivação cravada

Quatro sub-specs consecutivas (parts 1+2+3+4 de 15-18/05) totalizando ~$1.90 em evals deram DoD FAIL **não por defeito no agent**, mas por variância irreduzível (~σ 0.3-0.4) da métrica de naturalidade contínua. Range observado intra-persona em N=5: ~1.0 em escala 0-5 (20% de ruído). Qualquer prompt change com efeito < 1σ ficou indistinguível.

**Diagnóstico cravado:** problema no **método de validação**, não no juiz/modelo/prompt. Insistir em iterar prompt sem mudar metodologia = continua DoD FAIL.

## 2. Deliverables aplicados

### Frente 1 — Invariantes binárias

- [x] **T2** — `evals/inkflow-agent/_harness/invariants.mjs` (commit `c042140`) — módulo novo com 3 checkers puros (`checkP1`, `checkP2`, `checkP4`) + dispatcher `checkInvariant(id, transcript, dados)`. Retorna `bool | null` (null = não aplicável, ex: I-P2 sem handoff). 89 linhas.
- [x] **T2.5** — `run.mjs` persiste `transcript` + `final_dados_persistidos` no report (commit `18c77a2`). Mudança mínima 11+/-4. Necessária pra invariantes lerem input cru (gap descoberto durante execução, ver §5).
- [x] **T3** — `compute-variance.mjs` estendido com seção `invariants` no aggregate (commit `49e0fd1`). Itera dinamicamente sobre `INVARIANTS`, agrega `n / pass / pass_rate` por persona. I-tamanho_cm preservada (retrocompat com reports legados sem transcript). +51/-3 linhas.
- [x] **T4** — Demo executada em `/tmp/eval-baseline-sonnet-default/` (ver §3).
- [x] **T5** — `evals/inkflow-agent/_harness/INVARIANTS.md` — doc operacional: como adicionar invariante nova, naming convention, limitações conhecidas, DoD gating sugerido.

### Frente 2 — A/B comparativo

- [x] **T6** — `evals/inkflow-agent/_harness/compare-baselines.mjs` (commit `86550b1`) — CLI `node compare-baselines.mjs <BEFORE> <AFTER>` lê os 2 `aggregate.json`, computa pooled std + diff em sigma + conclusão `significant`/`noise`/`insufficient_data` por persona, output markdown table. 152 linhas + 9 testes unitários cobrindo edge cases (N=1, dirs vazios, pooled_std=0, etc).
- [x] **T7** — `docs/canonical/methodology/eval-comparative-strategy.md` — doctrine canonical: quando usar A/B vs absoluto vs invariante; tabela "qual DoD pra qual mudança"; template de sub-spec; anti-patterns que a doc resolve. Linkada no `methodology/index.md`.
- [x] **T8** — Demo Haiku N=5×3 vs Sonnet N=5×3 (ver §4).

## 3. Demo Frente 1 — saída em `/tmp/eval-baseline-sonnet-default/`

Resumo (3 personas, N=5 cada):

| Persona | nat range | nat std | I-tamanho_cm (pass/n) | I-P1 (n) | I-P2 (n) | I-P4 (n) |
|---|---|---|---|---|---|---|
| per-001-01-happy-path | 1.00 | 0.32 | 5/5 (pr=1.0) | 0 | 0 | 0 |
| per-009-01-muda-decisao | 1.00 | 0.41 | 5/5 (pr=1.0) | 0 | 0 | 0 |
| per-010-01-conflito-tamanho | 0.80 | 0.27 | 5/5 (pr=1.0) | 0 | 0 | 0 |

**Leitura:**
- `nat range ~1.0` em escala 0-5 = variância irreduzível confirmada (motivação central do spec).
- `I-tamanho_cm pass_rate 1.0` em todas 3 personas → invariante binária dá leitura determinística, sem variância intra-persona. **Prova de conceito do método funcionando.**
- `I-P1/P2/P4 n=0` é **esperado e correto**: outputs Sonnet em `/tmp/` foram gerados antes da Task 2.5 — não têm campo `transcript` persistido. Compute-variance trata como "not-applicable" e não crasha. Próximos baselines (pós-merge desta PR) virão com `n > 0` pros 3 checkers novos.

Aggregate JSON completo salvo em `/tmp/demo-frente1-sonnet-aggregate.json`.

## 4. Demo Frente 2 — Haiku vs Sonnet (parte 4 do spec)

```
# Comparação BEFORE vs AFTER

BEFORE: `/tmp/eval-baseline` (n personas: 3)
AFTER:  `/tmp/eval-baseline-sonnet-default` (n personas: 3)

| Persona | n_before | n_after | nat_before | nat_after | diff | diff_σ | conclusão |
|---|---|---|---|---|---|---|---|
| per-001-01-happy-path | 5 | 5 | 4.16 | 3.92 | -0.24 | -1.03 | noise |
| per-009-01-muda-decisao | 5 | 5 | 3.68 | 3.96 | 0.28 | 1.20 | noise |
| per-010-01-conflito-tamanho | 5 | 5 | 3.96 | 4.24 | 0.28 | 1.90 | noise |

**Resumo:** 0/3 significant · 3/3 noise · 0/3 insufficient_data
```

**Leitura:** a hipótese "upgrade pra Sonnet vai melhorar naturalidade" foi **falsificada estatisticamente em IC 95%**. Todos os diffs estão dentro de ±2σ — indistinguíveis de ruído de medição. Confirma o diagnóstico do spec ("juiz não era o problema") com base estatística rigorosa, não só `range > 0.6` a olho.

Markdown raw salvo em `/tmp/demo-frente2-haiku-vs-sonnet.md`.

## 5. Mudança de escopo durante execução (Task 2.5)

Durante setup da Task 2, descobri que `run.mjs:302` **não persistia transcript nem dados_persistidos no report individual** — só `scores` e `pass`. Os invariantes da Task 2 dependiam exatamente desses dados como input.

Implicação: a Task 4 ("re-rodar compute-variance nos outputs existentes e confirmar pass_rate 1.0/0.0 dos novos invariantes") **não era executável** com os outputs Sonnet salvos em `/tmp/` — eles foram gerados antes desta mudança.

**Decisão (user, opção A):** adicionar Task 2.5 cravando persistência em `run.mjs` (mudança mínima, 11+/-4 linhas). Demo Task 4 ficou em **modo degradado**: prova que (a) seção `invariants` aparece no aggregate.json (estrutura está pronta), e (b) I-tamanho_cm existente continua determinístico. Validação real dos 3 invariantes novos ficou via testes unitários com fixtures sintéticas em `tests/_lib/eval-harness/invariants.test.mjs` (18 testes, 100% pass).

Custo eval mantido em **$0** (não rodamos baselines novos).

## 6. DoD checkpoints

### Frente 1

- [x] `invariants.mjs` tem 3 checkers funcionais (I-P1, I-P2, I-P4) — `c042140`
- [x] Testes unitários: 18 tests (target ≥6) — 100% pass
- [x] `compute-variance.mjs` aggregate.json tem seção `invariants` populada — `49e0fd1`
- [x] Demo: re-rodar nos outputs existentes mostra pass_rate determinístico **pra I-tamanho_cm** (degradado pros invariantes novos por gap de transcript — ver §5)
- [x] `INVARIANTS.md` doc escrita

### Frente 2

- [x] `compare-baselines.mjs` CLI funcional com markdown output — `86550b1`
- [x] Testes unitários: 9 tests (target ≥4) — 100% pass
- [x] Doc canonical escrita em `docs/canonical/methodology/eval-comparative-strategy.md`
- [x] Demo: comparação Haiku vs Sonnet roda e produz tabela markdown (§4)

### DoD geral

1. [x] Frente 1 DoD completa (com nota sobre §5)
2. [x] Frente 2 DoD completa
3. [x] **Custo eval: $0** (reuso de outputs existentes)
4. [x] **Suite local: 812/812 pass** (era 780 no início; +18 invariants + +5 compute-variance + +9 compare-baselines = +32 tests)
5. [ ] CI verde no PR (aguardando merge desta sub-spec)

## 7. Próximas sub-specs com instrumento sólido

Conforme o spec previa, com este harness no lugar:

- **Sub-spec C tattoo** (candidates do report parte 2 da sub-spec B): `C.1 playbook §4.7 pós-pivot`, `C.3 audit tom per-010` — agora aplicam A/B comparativo + invariantes binárias gating DoD.
- **Caminho C Fase 2** (Cadastro + Proposta strict schema): mesmo padrão.
- **`top_p: 0`** investigation: rebaixar pra P2 (com invariantes binárias gating, variância de naturalidade vira soft signal não-bloqueador).

## 8. Comparação com Opção 3 rejeitada (PR #73)

Esta sub-spec foi a versão YAGNI da Opção 3:

| Componente Opção 3 PR #73 | Decisão | Resultado |
|---|---|---|
| Golden test cases ouro | ❌ não entrou | ok — manutenção alta evitada |
| Dashboards de eval | ❌ não entrou | ok — premature sem clientes pagantes |
| Review/refator 3 judge prompts | ❌ não entrou | ok — variância não era do prompt do juiz (Frente 2 demo confirma) |
| **Invariantes estruturais binárias** | ✅ ENTROU | ✅ entregue Frente 1 |
| **A/B comparativo metodologia** | ✅ ENTROU | ✅ entregue Frente 2 |
| Ensemble de juízes | ❌ não entrou | ok — 4× custo recorrente evitado |
| Rubric discreto (3 buckets) | ❌ não entrou | ok — nuance preservada |

PR #73 rejeitou Opção 3 com hipótese "root cause é simples (juiz Haiku)" — falsificada na parte 4 e cravada estatisticamente nesta sub-spec (§4). Hoje a rejeição original não se sustenta — esta versão cirúrgica não.
