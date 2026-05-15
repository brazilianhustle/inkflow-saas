---
id: FM-0010
slug: cadastro-menor-sem-handoff
status: fixed
type: policy_violation
layers: [schema_invariant]
agents_affected: [CadastroAgent]
personas_exposing: [PER-011]
created: 2026-05-08
last_change: 2026-05-15
owner: leandro
---

# FM-0010 — CadastroAgent não trigger handoff pra menor de idade

## Descrição
Cliente fornece data de nascimento que computa idade <18. Antes do Sub-3.1, bot seguia flow normal — sem alerta. Tatuagem em menor exige autorização presencial.

## Gatilho
`data_nascimento` no cadastro com idade <18 calculada.

## Impacto
- Cliente final: chega no estúdio sem autorização (perda de tempo)
- Tatuador: não sabe que precisa preparar termo
- Business: risco legal

## Diagnóstico
Sem `enforceMenorIdade` aplicado, dados_persistidos passava direto.

## Contramedida
- Implementado `functions/api/agent/_lib/enforce-menor-idade.js` (Sub-3.1)
- Aplicado em `runAgent` (route.js) APÓS invariante: força mensagem de handoff humano
- Test: `tests/agent/enforce-menor-idade.test.mjs`

## Regression test
- Unit: `tests/agent/enforce-menor-idade.test.mjs`
- Migrar pra `evals/inkflow-agent/regression/invariants.mjs` na Task 18

## Eval gate
Unit + futuro eval directed PER-011 em Phase 2.

## Histórico
- 2026-05-08: identificado em audit Sub-3.1
- 2026-05-09: implementação merged
- 2026-05-15: migrado pra failure catalog, status confirmed fixed

## Notas
Bom exemplo de "failure → contramedida → regression test permanente". Stays como referência.
