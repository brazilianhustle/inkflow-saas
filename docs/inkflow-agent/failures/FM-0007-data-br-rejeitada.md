---
id: FM-0007
slug: data-br-rejeitada
status: mitigated
type: data_error
layers: [prompt, schema_invariant]
agents_affected: [CadastroAgent]
personas_exposing: [PER-001, PER-006]
created: 2026-05-13
last_change: 2026-05-15
owner: leandro
---

# FM-0007 — CadastroAgent rejeita data formato BR DD/MM/AAAA

## Descrição
Cliente envia "Maria Souza, 20/05/1995". Agent rejeita por invariante esperar formato ISO. Schema válido mas formato comum do BR não normalizado pelo prompt.

## Gatilho
Cliente envia data em formato `DD/MM/AAAA` ou `DD-MM-AAAA` (formato BR).

## Impacto
- Cliente final: bot pede de novo, parece "burro"
- Tatuador: friction na coleta de cadastro
- Business: drop-off no CadastroAgent

## Diagnóstico
Prompt do CadastroAgent não tinha few-shot explícito normalizando data BR → ISO. Invariante (`data_nascimento` ISO) rejeitava entrada válida.

## Contramedida
- Few-shot BR-1, BR-2 em `coleta/cadastro/exemplos.js` normalizando DD/MM/AAAA e DD-MM-AAAA → AAAA-MM-DD
- Spec `refator-prompts-coleta-v2` (2026-05-13)
- Pipeline silently-force pergunta se invariante rejeitar (em `route.js`)

## Regression test
- Eval: cenários OBS7-1, OBS7-2, OBS7-3 em `tests/agent/refator-prompts-coleta-v2.eval.mjs`
- Migrar pra `evals/inkflow-agent/regression/invariants.mjs` na Task 18

## Eval gate
OBS7-1, OBS7-2, OBS7-3 em CI permanente.

## Histórico
- 2026-05-13: observado em smoke prod cutover Sub-4.1 (OBS-7)
- 2026-05-13: spec `refator-prompts-coleta-v2` criado
- 2026-05-13/14: contramedida mergeada
- 2026-05-15: migrado pra failure catalog, status open → mitigated

## Notas
Formato BR é o esperado; formato ISO é exceção. Bot deve aceitar ambos.
