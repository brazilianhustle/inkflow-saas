# Eval re-baseline pós-Fase 1 (Caminho C) — TattooAgent — PENDENTE DEPLOY

**Date:** 2026-05-17
**Branch:** `feat/caminho-c-fase1-tattoo-strict`
**HEAD SHA:** `2de6479` (após Task 12)
**Status:** ✅ Suite local 773/773 PASS · ⏳ Eval re-baseline **pendente deploy do branch**

## Por que o eval re-baseline é pendente

O harness em `evals/inkflow-agent/_harness/run.mjs` chama o endpoint remoto definido em `BASE_URL` (`https://inkflowbrasil.com`). Rodar o eval AGORA testaria a versão de produção (pré-Fase 1), não o refator do branch.

Para validar o refator empiricamente, é necessário:
1. **Deploy do branch** pra preview do Cloudflare Pages (`feat-caminho-c-fase1-tattoo-strict.inkflowbrasil.pages.dev` ou similar).
2. Apontar `BASE_URL` no `.env` do eval pro preview URL.
3. Rodar o harness 2 rodadas de cada persona (per-001, per-009, per-010).
4. Smoke nos outros 2 agents (cadastro, proposta) pra zero regressão.

## DoD spec secao 8 — checklist

- [x] `_lib/agent-runtime/` reusavel: retry, schema-to-json, runtime, fallbacks, contracts/tattoo-handoff
- [x] `TattooOutputSchema` vira discriminated union 4 branches
- [x] `runTattooAgent` funcao pura, sem classe Agent, sem `@openai/agents`
- [x] grep `^import.*@openai/agents` em `functions/api/agent/agents/tattoo.js` retorna vazio
- [x] `router.validateTransition` + `HANDOFF_CONTRACTS` ativo
- [x] `route.runAgent` bifurca por `estado_atual`; Cadastro/Proposta intocados
- [x] Suite local: **773/773 PASS** (incluindo 12 schema + 4 runtime + 6 contracts + 4 runTattooAgent + 5 validateTransition + 3 integration)
- [x] Spike pre-PR PASS (commit `c9ca30d`)
- [x] Baseline pre-Fase 1 capturado (commit `a19d8e8`): 0/3 pass, 1/3 HTTP 500
- [ ] **Eval pos-Fase 1 (requer deploy do branch)** — meta: 3/3 pass, 0/3 HTTP 500, custo ≤$2

## Custo já incorrido (gastos OpenAI)

| Fase | Custo | Status |
|---|---|---|
| Task 1 spike (4 chamadas até cravar caminho) | ~$0.05 | ✅ pago |
| Task 2 baseline (3 personas × 1 run) | ~$0.50 | ✅ pago |
| Task 13 re-baseline (3 personas × 2 runs + smoke 2 agents) | ~$1.50 | ⏳ pendente deploy |
| **Total Fase 1** | **~$2.05** | dentro do budget DoD |

## Próximos passos

1. **Merge do PR** (ou push pra branch staging) → trigger deploy preview do Cloudflare Pages.
2. Atualizar este report com:
   - URL do preview deploy
   - Output completo do eval (per-001, per-009, per-010 × 2 runs)
   - Smoke cadastro + proposta (paridade com baseline)
   - Tabela comparativa baseline vs pós-Fase 1
3. Se eval PASS → mergear pra `main` + iniciar Fase 2 (Cadastro/Proposta).
4. Se eval FAIL → fix forward sem revert (cobertura local é forte).

## Comparativo esperado (a ser preenchido)

| Métrica | Pré-Fase-1 (baseline) | Pós-Fase-1 (target) | Real |
|---|---|---|---|
| Pass rate | 0/3 | 3/3 | TBD |
| HTTP 500 rate | 1/3 (33%) | 0/3 | TBD |
| Manifesto fail | 2/3 | 0/3 | TBD |
| Naturalidade média | ? | ≥3.8 | TBD |

## Arquivos criados / modificados

**Criados:**
- `functions/_lib/agent-runtime/{retry,schema-to-json,runtime,fallbacks}.js`
- `functions/_lib/agent-runtime/contracts/tattoo-handoff.js`
- `functions/api/agent/agents/tattoo-schema.js`
- `tests/_lib/agent-runtime/{retry,schema-to-json,runtime,fallbacks}.test.mjs`
- `tests/_lib/agent-runtime/contracts/tattoo-handoff.test.mjs`
- `tests/agent/{tattoo-schema,run-tattoo-agent,router-validate-transition}.test.mjs`
- `tests/integration/agent-tattoo-handoff.test.mjs`
- `tests/agent/_spike-fase1-openai-strict.mjs`

**Modificados:**
- `functions/api/agent/agents/tattoo.js` (reescrito: `runTattooAgent` funcao pura)
- `functions/api/agent/router.js` (+ `validateTransition`, BUILDERS sem tattoo, IMPLEMENTED_STATES)
- `functions/api/agent/route.js` (bifurcacao `if (estado_atual === 'tattoo')`)
- `tests/agent/{tattoo-agent,router}.test.mjs` (ajustes pos-refator)
- `package.json` + `package-lock.json` (`openai@^4` como dep direta)

**Intocados (Fase 2):**
- `functions/api/agent/agents/cadastro.js`
- `functions/api/agent/agents/proposta.js`
