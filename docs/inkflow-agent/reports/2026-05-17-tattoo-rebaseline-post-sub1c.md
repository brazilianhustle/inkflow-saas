---
title: TattooAgent re-baseline pós Sub 1.C (gpt-4o)
date: 2026-05-17
sub: 1.C
predecessor_report: docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1b.md
spec: docs/superpowers/specs/2026-05-16-sub-1c-tattoo-reliability-gpt4o-design.md
plan: docs/superpowers/plans/2026-05-16-sub-1c-tattoo-reliability-gpt4o.md
veredito: DoD-fail
---

# TattooAgent re-baseline pós Sub 1.C (gpt-4o)

## Sumário executivo

**DoD ❌ FAIL.** Swap `gpt-4o-mini → gpt-4o` não zerou HTTP 500s — manteve o mesmo rate da Sub 1.B (2/6 = 33%), apenas **deslocou** a falha: PER-001 ganhou (1/2 → 0/2) e PER-010 piorou (1/2 → 2/2). PER-009 segue fail por qualidade (não-500). Hipótese central do spec — "modelo maior zera invariante" — **falsificada empiricamente**.

Próximo passo: rollback do swap + abertura de Sub 1.D atacando avenida estrutural diferente (schema/Zod ou model provider alternativo).

## Configuração

- **Modelo TattooAgent:** `gpt-4o` (full).
- **Outros agents:** `gpt-4o-mini` (inalterados — Cadastro/Proposta/Portfolio).
- **Branch:** `feat/sub-1c-tattoo-reliability-edge-failures`.
- **Preview URL:** `https://feat-sub-1c-tattoo-reliabili.inkflow-saas.pages.dev`.
- **Runs:** 2 (3º run dispensado — sinal conclusivo já com n=2; ver §"Decisão sobre 3º run").
- **Judge:** `claude-haiku-4-5-20251001`.
- **Custo total estimado:** ~$0.80 USD (2 runs × ~$0.40 médio gpt-4o driver + judge).

## Resultados por eval

### PER-001 — happy path

| Run | Status | naturalidade | manifesto | state | proxima_acao |
|---|---|---|---|---|---|
| 1 | ✅ PASS | 4.8 | 0.92 | 1 | esperado |
| 2 | ✅ PASS | 4.4 | 0.92 | 1 | esperado |
| **Mediana** | — | **4.6** | **0.92** | **1** | — |

**HTTP 500:** 0/2. **Threshold nat (≥ 3.8): ✅.** **Threshold manif (≥ 0.83): ✅.**

Violations apontadas pelo judge (presentes mas não fizeram fail): bot coleta 3 dos 4 OBR antes de pedir cor — falta `estilo` explícito. Comportamento parcial, não-bloqueante.

### PER-009 — muda-decisao

| Run | Status | naturalidade | manifesto | state | proxima_acao |
|---|---|---|---|---|---|
| 1 | ❌ FAIL | 3.2 | 0.58 | 0 | esperado handoff, retornou pergunta |
| 2 | ❌ FAIL | 3.8 | 0.58 | 0 | esperado handoff, retornou pergunta |
| **Mediana** | — | **3.5** | **0.58** | **0** | — |

**HTTP 500:** 0/2. **Threshold nat (≥ 3.8): ❌** (mediana 3.5). **Threshold manif (≥ 0.83): ❌** (0.58).

Violações estruturais (consistentes Run 1 + Run 2):
- P2 (ordem 4 OBR): bot pede altura antes de descrição/estilo.
- P6 (consultor): cliente indeciso (muda rosa→leão), bot segue COLETOR.
- P5 (validação): linguagem formulário sem reconhecer a mudança de ideia.

Padrão **idêntico** ao Sub 1.B (era 3.8/0.625) — gpt-4o não corrigiu falha de policy aqui, paridade clara com o aprendizado-chave da Sub 1.B (prompt iteration tem teto pra esse FM).

### PER-010 — conflito-tamanho

| Run | Status | naturalidade | manifesto | state |
|---|---|---|---|---|
| 1 | ❌ ERROR | http 500 | — | — |
| 2 | ❌ ERROR | http 500 | — | — |

**HTTP 500:** **2/2**. **Threshold nat (≥ 4.2): ❌** (não computável — output rejeitado pelo validator antes do judge ver).

**Regressão vs Sub 1.B:** PER-010 era 1/2 (mediana nat 4.2 quando passava) → agora 2/2 500 (sem score). gpt-4o falha invariante R9 **mais consistentemente** que gpt-4o-mini nesse eval.

## DoD evaluation

| Critério | Threshold | Observado | Status |
|---|---|---|---|
| HTTP 500 total | 0 em 6 execs | **2 em 6** (33%) | ❌ |
| PER-001 nat | ≥ 3.8 | 4.6 | ✅ |
| PER-009 nat | ≥ 3.8 | 3.5 | ❌ |
| PER-010 nat | ≥ 4.2 | — (errored) | ❌ |
| Manif ≥ 0.83 (todos) | min 0.83 | min 0.58 (PER-009) | ❌ |
| State PER-010 = 1 | =1 | — (errored) | ❌ |
| State PER-001 = 0 | =0 | =1 (mas judge marcou PASS) | ⚠️ (ver nota) |
| State PER-009 = 0 | =0 | 0 | ✅ |

**Veredito: DoD ❌.**

**Nota state PER-001:** spec esperava state=0 (não-handoff), mas judge marcou state=1 e mesmo assim deu PASS no critério "proxima_acao=esperado" (provavelmente porque happy-path pode terminar em handoff quando coleta completa). Não muda o veredito — outros critérios já fail.

## Comparativo com Sub 1.B

| Métrica | Sub 1.B (mini + R9) | Sub 1.C (gpt-4o + R9) | Delta |
|---|---|---|---|
| **500 rate total** | 2/6 (33%) | 2/6 (33%) | **=** |
| PER-001 500s | 1/2 | 0/2 | ↑ melhor |
| PER-010 500s | 1/2 | 2/2 | ↓ pior |
| PER-001 nat (mediana qdo passou) | 3.8 | 4.6 | +0.8 |
| PER-009 nat (mediana) | 3.8 | 3.5 | -0.3 |
| PER-010 nat (mediana qdo passou) | 4.2 | n/a | sem dado |
| PER-009 manif | 0.625 | 0.58 | -0.045 |
| Custo / run | ~$0.05 | ~$0.40 | 8× mais caro |

**Interpretação:**

1. **500 rate constante (33%) é o resultado-chave.** Hipótese "gpt-4o > gpt-4o-mini pra zerar 500s sob R9" falha. Modelo maior NÃO consertou a invariante; o problema é estrutural ao schema/validator (avenida b do brainstorm).
2. **Trade-off interno entre PER-001 e PER-010 é sintoma claro de não-determinismo.** gpt-4o melhora numa eval e piora em outra com a mesma frequência — sinal de que a falha 500 é inerente à interação prompt × schema × modelo, não modulável só por capacidade do modelo.
3. **PER-009 status quo:** gpt-4o não trouxe ganho de policy. Re-confirma o aprendizado Sub 1.B (esse FM é intratável-via-prompt).
4. **PER-001 ganho de qualidade real (+0.8 nat) é o único upside.** Mas custa 8× mais e não cobre o downside de PER-010.

## Decisão sobre 3º run

Critério do plan formal (`/plan` Step 5.3): "se |run1 − run2| > 0.3 em qualquer dim, rodar 3º run". Aplicado:

- PER-001 nat: 4.8 vs 4.4 → diff 0.4. **Trigger.**
- PER-009 nat: 3.2 vs 3.8 → diff 0.6. **Trigger.**
- PER-010: ambos 500 → diff 0. Sem trigger.

**Decisão Leandro (2026-05-17):** dispensar 3º run. Justificativa:
- DoD já falhou de forma binária por 500s consistentes em PER-010 (2/2) — invariante quebra está estatisticamente robusta com n=2.
- 3º run só adicionaria robustez de mediana em PER-001/009, mas o veredito de PR não muda.
- Economiza ~$0.50 e ~15-20 min sem impacto na decisão downstream.

Documentado aqui pra paridade do critério do plan e rastreabilidade.

## Decisão: rollback + Sub 1.D

Conforme `Plan B (DoD ❌)` do spec:

1. **Rollback do swap:** revert do commit `701240f` (`fix(tattoo-agent): swap gpt-4o-mini -> gpt-4o`). TattooAgent volta pra `gpt-4o-mini` em prod.
2. **Mantém em main:** todos os ganhos da Sub 1.B (R9 preservado), test atualizado pra continuar verificando `gpt-4o-mini`.
3. **Sub 1.D abre** com diagnóstico empírico desta Sub 1.C como entrada:
   - **Avenida (a) — mudança de modelo** está descartada com `gpt-4o`. claude-haiku-4-5 fica como alternativa SE Leandro quiser explorar provider diferente (LiteLLM proxy ou model provider custom no SDK).
   - **Avenida (b) — schema/Zod refinado** ganha prioridade. Hipótese: discriminated union por `proxima_acao` (handoff/pergunta/handoff) força estrutura no schema → modelo não precisa "saber" da invariante R9, schema rejeita gerações inválidas antes de chegar no validator.
4. **PR informativo zero-code-change** pra preservar evidência da Sub 1.C em main (spec + plan + report) — opção (a) do Plan B do spec.

## Follow-ups

- **P0 — Sub 1.D — schema/Zod discriminated union** (consequência direta deste relatório).
- **P1 — Decisão NÃO-tomar:** adoção permanente de `gpt-4o` em prod. Descartada com este resultado — custo 8× sem compensação de reliability.
- **P2 — Avenida (β) claude-haiku-4-5** fica em pause até resultado de Sub 1.D. Se schema/Zod resolver, model provider alternativo torna-se desnecessário.

## Artefatos referenciados

- Spec: `docs/superpowers/specs/2026-05-16-sub-1c-tattoo-reliability-gpt4o-design.md`
- Plan: `docs/superpowers/plans/2026-05-16-sub-1c-tattoo-reliability-gpt4o.md`
- Predecessor: `docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1b.md`
- Commit do fix (a reverter): `701240f`
- Branch: `feat/sub-1c-tattoo-reliability-edge-failures`
- Logs brutos: `/tmp/sub1c-run1.log`, `/tmp/sub1c-run2.log` (não-versionados — emitir snapshot no PR se necessário)
- Baseline agregado (sobrescrito pelo último run): `docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md` (snapshot Run 2)
