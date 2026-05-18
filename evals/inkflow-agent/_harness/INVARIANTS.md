# Invariantes binárias do harness InkFlow

Invariantes estruturais binárias substituem (no nível de **DoD gating**) métricas subjetivas do juiz LLM, que carregam variância irreduzível (~1.0 em escala 0-5).

Cada invariante é função pura `(transcript, dados_persistidos) → bool | null`:

- `true` — invariante respeitada nessa run
- `false` — invariante violada
- `null` — não aplicável (ex: I-P2 em transcript que não chegou a handoff)

Output binário em runs determinísticos significa **variância 0**, então `pass_rate` por persona reflete adesão real ao manifesto, não ruído do juiz.

## Implementadas

| ID | Princípio (manifesto) | Detecção |
|---|---|---|
| **I-P1** | Bot nunca sugere `tamanho_cm` ao cliente | regex `/\d+\s*cm\b/i` em qualquer turn de assistant. Falha = ≥1 match. |
| **I-P2** | Handoff carrega os 4 OBR (`descricao_curta`, `local_corpo`, `altura_cm`, `estilo`) | Inspeciona turn assistant com `proxima_acao === 'handoff'`. Falha = qualquer campo undefined/null/string vazia. Retorna `null` se transcript não tem handoff. |
| **I-P4** | Bot não usa anti-patterns "Anotei/Confirmado/Vou anotar/Registrado" | regex `/\b(Anotei\|Confirmado\|Vou anotar\|Registrado)\b/i` em qualquer turn de assistant. |
| **I-tamanho_cm** | Bot não tem `tamanho_cm` flagado em violations do judge | Sintetizada em `compute-variance.mjs` a partir de `r.scores?.manifesto?.violations` (não precisa de transcript). Mantida pra retrocompat com reports legados que precedem a Task 2.5. |

## Diferidas (Fase 2 ou exigem helper LLM)

| ID | Razão de adiar |
|---|---|
| I-P3 (foto antes de tamanho) | Order check em turns com nuance (depende de persona) — não trivial via regex. |
| I-P5 (validação substantiva por turn) | Inerentemente subjetivo; pode exigir helper LLM-based. Adiado. |
| I-P6 (reconhecer pivot/indecisão) | Requer detectar mudança de tema cliente → bot acknowledge — também alto custo regex puro. |

## Limitações conhecidas

- **I-P1 false positive:** se o bot ecoa o tamanho que o cliente *informou* (ex: "perfeito, 10cm então"), a regex flagra como violação. Cobre o failure mode principal (bot sugerindo proativamente). Refinamento futuro: distinguir bot eco vs sugestão proativa exige NLU.
- **I-P2 fallback:** se o handoff turn carrega `dados_persistidos: {}` em vez de `undefined`, o fallback para o `final_dados_persistidos` acumulado **não** é usado. Pra maximizar confiabilidade, callers devem passar o snapshot acumulado como 3º arg do `checkInvariant`.

## Como adicionar uma invariante nova

1. Em `evals/inkflow-agent/_harness/invariants.mjs`:
   - Escreva o checker como função pura `function checkXN(transcript, dados_persistidos) → bool | null`
   - Adicione ao mapa `INVARIANTS`: `'I-PN': checkPN`
2. Em `tests/_lib/eval-harness/invariants.test.mjs`:
   - ≥2 test cases (positivo + negativo)
   - Se a invariante pode retornar `null`, adicione caso adicional cobrindo isso
3. Atualize esta doc com o ID + princípio + detecção
4. Não é necessário tocar `compute-variance.mjs` — ele itera dinamicamente sobre `INVARIANTS`

## Convenção de naming

`I-<código>`:
- `I-P1`..`I-P6` — invariantes derivadas de Princípios do manifesto (`docs/manifesto-tatuador-bot.md`)
- `I-<atributo>` — outras invariantes estruturais (ex: `I-tamanho_cm`)

## Como ler o output em `aggregate.json`

```json
"per-001-01-happy-path": {
  "nat": { "n": 5, "media": 3.92, "range": 1.00, "std": 0.32 },
  ...
  "invariants": {
    "I-P1":  { "n": 5, "pass": 5, "pass_rate": 1.0 },
    "I-P2":  { "n": 3, "pass": 3, "pass_rate": 1.0 },
    "I-P4":  { "n": 5, "pass": 4, "pass_rate": 0.8 },
    "I-tamanho_cm": { "n": 5, "pass": 5, "pass_rate": 1.0 }
  }
}
```

- `n` = runs onde o checker retornou non-null. Para I-P2 (handoff-conditional), `n` pode ser menor que o total de runs.
- `pass_rate` = `pass / n`. `null` se `n === 0` (ex: reports legados sem campo `transcript`).
- `n === 0` para I-P1/I-P2/I-P4 em outputs gerados antes do PR `feat/eval-methodology-cirurgia` (pre-Task 2.5) é esperado — `transcript` não era persistido.

## DoD gating sugerido

Use invariantes binárias como **gating** de DoD em sub-specs futuras:

| Métrica | Tipo | Como usar |
|---|---|---|
| `nat.media` | contínua, ruidosa | sinal informativo — **não** gate |
| `nat.std` em A/B | contínua | gate via teste estatístico (ver `eval-comparative-strategy.md`) |
| `I-P*.pass_rate` | binária por persona | gate direto: `pass_rate === 1.0` ou falha o DoD |
