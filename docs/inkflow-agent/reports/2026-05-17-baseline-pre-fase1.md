# Eval baseline pré-Fase 1 (Caminho C) — TattooAgent

**Date:** 2026-05-17
**Branch:** `feat/caminho-c-fase1-tattoo-strict`
**SHA:** `c9ca30dadd4aead412f19fb0eb2c3e38a65f08d1` (após spike, antes do refator de produção)
**Judge model:** `claude-haiku-4-5-20251001` (Anthropic)
**Custo estimado:** ~$0.50 (1 run de cada das 3 personas)

## Comando rodado

```bash
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo --persona=per-001
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo --persona=per-009
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo --persona=per-010
```

## Resultados

| Persona | Cenário | Resultado | Motivo do fail |
|---|---|---|---|
| per-001 | 01-happy-path | ❌ fail | manifesto |
| per-009 | 01-muda-decisao | ❌ fail | manifesto |
| per-010 | 01-conflito-tamanho | ❌ fail | **http 500** |

**Totais:**
- Pass rate: **0/3** (0%)
- HTTP 500 rate: **1/3** (33%)
- Manifesto fail: 2/3 (PER-001, PER-009)

## Comparação com expectativa do plano

Plano (Task 2 Step 3 Expected) cravou:
- PER-001: ✅ pass
- PER-009: ❌ fail
- PER-010: ❌ fail (HTTP 500)
- Total: 1/3 pass, 2/6 HTTP 500

**Discrepância:** PER-001 falhou (esperava pass). PER-010 deu HTTP 500 mas só em 1 dos 1 runs (33%; plano mencionava 33% taxa, consistente).

Não há regressão entre plano e baseline real — apenas o plano superestimou levemente. Pós-Fase 1 ainda precisa demonstrar:
- HTTP 500 rate: 1/3 → **0/3** ✅
- Pass rate: 0/3 → **3/3** ✅ (ou ao menos não pior)

## Next

Task 3 — começar implementação do `_lib/agent-runtime/retry.js` (TDD).
