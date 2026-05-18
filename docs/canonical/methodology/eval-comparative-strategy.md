---
last_reviewed: 2026-05-18
owner: leandro
status: stable
related: [matrix.md, release-protocol.md, ../../../evals/inkflow-agent/_harness/INVARIANTS.md]
---

# Eval comparative strategy — A/B significância estatística

Doctrine pra DoD de sub-specs que iteram **prompts** ou **modelos** no InkFlow Agent (Pilar 4).

## Tese central

Métricas contínuas de juiz LLM (ex: naturalidade 0-5) carregam variância irreduzível na ordem de **σ≈0.3–0.4** mesmo com `temperature=0`. Range observado intra-persona em runs N=5: **~1.0 em 5** (20% de ruído). Cravado empiricamente em 4 sub-specs consecutivas (15-18/05).

Consequência: qualquer DoD na forma **"nat ≥ 4.0 absoluto"** falha por ruído antes de falhar por mérito. Iterar prompt nesse regime = `0 ganhos mergeable`.

**Saída:** DoD comparativo (A/B) com teste estatístico — em vez de absoluto.

## Quando usar A/B comparativo vs absoluto

| Tipo de mudança | DoD recomendado |
|---|---|
| Refator de prompt (tom, anti-patterns, exemplos) | **A/B comparativo** — `diff_σ > 1.96` |
| Troca de modelo (Haiku → Sonnet) | **A/B comparativo** — mesma escala estatística |
| Hardener de schema (campo obrigatório, validação) | **Invariante binária** (gate via `pass_rate = 1.0`); ver [INVARIANTS.md](../../../evals/inkflow-agent/_harness/INVARIANTS.md) |
| Bug fix em data pipeline (404 → resposta válida) | **Absoluto** — antes era erro, depois é OK; bastam smoke runs |
| Mudança de prompt que afeta **campo do schema** (ex: bot agora coleta `altura_cm`) | **Invariante binária** primária + A/B secundário pra naturalidade |

Regra prática: se o sinal esperado é **categórico** (acontece/não acontece), use invariante. Se é **gradual** (melhor/pior na escala do juiz), use A/B.

## Conceitos

### Diff em sigma

```
diff       = nat_after.media - nat_before.media
pooled_std = sqrt(((n_b-1) * σ_b² + (n_a-1) * σ_a²) / (n_b + n_a - 2))
se_diff    = pooled_std * sqrt(1/n_b + 1/n_a)
diff_σ     = diff / se_diff
```

- `diff_σ` é o tamanho do efeito em desvios-padrão da incerteza da medição.
- IC 95% = `|diff_σ| > 1.96` → diff é **significant** (rejeita H0: "sem efeito").
- `|diff_σ| ≤ 1.96` → **noise** (não rejeita H0; o diff observado é compatível com ruído de medição).

### Mínimo N por baseline

Pra detectar efeitos pequenos (`|diff_σ| ~ 2.0`):

| N por persona × baseline | Detecta diff médio mínimo |
|---|---|
| 3 | ~0.7 nat (efeito grande) |
| 5 | ~0.5 nat (default recomendado) |
| 10 | ~0.35 nat (caro, só pra mudanças críticas) |

**N=5 é o default**. Custo eval N=5 × 3 personas × 1 baseline ≈ $0.30-0.40 (Haiku judge), ~$0.75 (Sonnet judge).

### Quando o teste é insuficient_data

- `n_before + n_after - 2 ≤ 0` (i.e., um lado com N=1) → `pooled_std = null` → conclusão `insufficient_data`. Rode mais runs antes de tirar conclusão.

## Template de sub-spec aplicando A/B

```markdown
# Sub-spec X — <título>

## DoD

1. ☐ Frente A: gerar baseline AFTER (`/tmp/eval-baseline-<hash>/`) com N=5×3 personas
2. ☐ Frente B: gerar baseline BEFORE re-rodando o estado anterior (ou reusar baseline já existente da sub-spec X-1)
3. ☐ Rodar `compute-variance.mjs` em ambos dirs → aggregate.json
4. ☐ Rodar `compare-baselines.mjs <BEFORE> <AFTER>` → markdown table
5. ☐ **Gate primário:** `pass_rate = 1.0` em todas invariantes binárias relevantes (ver INVARIANTS.md)
6. ☐ **Gate secundário (se aplicável):** A/B mostra ≥1 persona com `diff_σ > 1.96` na direção esperada
7. ☐ Custo eval: ~$X (registrar real)

## Critério de FAIL

- Qualquer invariante binária com `pass_rate < 1.0` → FAIL imediato (não roda A/B; corrige primeiro)
- Todas invariantes pass MAS A/B `0/N significant` → FAIL com diagnóstico "mudança não move agulha do juiz acima do ruído". Não é mergeable.
- A/B mostra `diff_σ negativo significant` em qualquer persona → FAIL (regressão).
```

## Anti-patterns que esta doc resolve

- ❌ "Nat subiu de 4.0 pra 4.2, vamos mergear" — diff `0.2` < `1σ`, indistinguível de ruído com N=5.
- ❌ "Sonnet rolou 4.4 vs Haiku 3.9, claramente melhor" — pode ser noise; rodar A/B antes de declarar.
- ❌ DoD na forma "nat absoluto ≥ X" — descalibrado quando X cai dentro do ruído de medição.

## Comparação com método antigo

| Antigo (descontinuado) | Novo (esta doc) |
|---|---|
| DoD = `nat ≥ 4.0 absoluto` | DoD primário = invariantes binárias; DoD secundário = A/B com `diff_σ > 1.96` |
| Conclui mérito a olho ("subiu 0.2") | Conclui via teste estatístico explícito |
| Iteração de prompt sem método estatístico → DoD FAIL crônico | Iteração com método → resultado mergeable ou diagnóstico claro de "mudança não bate o ruído" |

## Referências de implementação

- **Invariantes binárias:** [`evals/inkflow-agent/_harness/invariants.mjs`](../../../evals/inkflow-agent/_harness/invariants.mjs)
- **Aggregator:** [`compute-variance.mjs`](../../../evals/inkflow-agent/_harness/compute-variance.mjs) — gera `aggregate.json`
- **A/B CLI:** [`compare-baselines.mjs`](../../../evals/inkflow-agent/_harness/compare-baselines.mjs) — gera markdown table
- **Doc de invariantes:** [`INVARIANTS.md`](../../../evals/inkflow-agent/_harness/INVARIANTS.md)
- **Spec mãe:** [`docs/superpowers/specs/2026-05-18-eval-methodology-cirurgia-design.md`](../../superpowers/specs/2026-05-18-eval-methodology-cirurgia-design.md)
