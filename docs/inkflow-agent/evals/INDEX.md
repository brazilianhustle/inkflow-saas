# Eval INDEX — InkFlow Agent

> Catálogo de eval files com cobertura + status. Atualizado a cada mudança de eval.

## Regression suite (`evals/inkflow-agent/regression/`)

| File | Cobertura | Custo/run | Status |
|---|---|---|---|
| `invariants.mjs` | invariantes de schema (todos agents) | ~$0 | active |
| `snapshots.mjs` | snapshot tests prompts | ~$0 | active |
| `golden-paths.mjs` | happy path PER-001, PER-006 | ~$0.01 | active |

## Directed evals (`evals/inkflow-agent/directed/<agent>/`)

| Agent | Eval files | Personas | Status |
|---|---|---|---|
| tattoo | (criados em Phase 1) | PER-001, PER-009, PER-010 | planejado |
| cadastro | (criados em Phase 2) | PER-001, PER-007, PER-011 | planejado |
| proposta | (criados em Phase 3) | PER-007, PER-008, PER-001 | planejado |
| portfolio | (criados em Phase 4) | PER-002, PER-014 | planejado |

## Red-team (`evals/inkflow-agent/red-team/`)

| File | Cobertura | Custo/run | Status |
|---|---|---|---|
| `prompt-injection.mjs` | PER-013 adversarial | ~$0.30 | stub Phase 0 |
| `jailbreak-tom.mjs` | drift de tom, PER-012 | ~$0.30 | stub Phase 0 |
| `drift-multi-turn.mjs` | consistência 20+ turns | ~$0.30 | stub Phase 0 |
| `policy-violation-stress.mjs` | força violar P1-P6 | ~$0.30 | stub Phase 0 |

## Histórico de versionamento

| Data | Mudança |
|---|---|
| 2026-05-15 | Phase 0: estrutura criada, stubs ok, judge model Claude Haiku ativo |
