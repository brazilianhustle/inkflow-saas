# Smoke Plan Review Protocol

Este protocolo transforma falha de contrato em reanalise de plano. A meta e impedir que um slice seja considerado concluido quando o scenario contradiz a hipotese central do comportamento.

## Quando Roda

O `run-scenario.sh` gera automaticamente:

```text
.smoke-evidence/<run_id>/plan-review.md
```

Isso acontece quando `triage.md` classifica a falha como:

```text
contract_state_not_reached
contract_handoff_without_orcid
contract_*
```

## Comando Manual

```bash
bash scripts/smoke/render-plan-review.sh .smoke-evidence/<run_id>
```

O comando exige que `triage.md` ja exista no evidence dir.

## O Que O Arquivo Decide

O `plan-review.md` registra:

- classe de falha e `plan_decision`;
- camada provavel: Router, Policy, Workflow Manager, handoff ou seed;
- contrato esperado versus estado observado;
- snapshot de `dados_cadastro` e `dados_coletados`;
- ultima mensagem humana e ultima resposta do bot;
- menor correcao recomendada;
- comando de validacao do mesmo scenario;
- gate de conclusao do slice.

## Regra De Decisao

```text
contract_* -> reopen_slice_plan
```

Uma falha de contrato nao e apenas bug de copy. Ela invalida a conclusao do slice ate o mesmo scenario passar de novo com evidence completo.

## Gate Estrategico

Um slice fica bloqueado quando:

- scenario obrigatorio falhou com `contract_*`;
- `plan-review.md` existe com `plan_decision: reopen_slice_plan`;
- nao ha PASS posterior do mesmo scenario registrado em `smoke-runs.md`.

O desbloqueio exige:

```text
mesmo scenario -> PASS -> poll.json + transcript.md + judgment.md -> smoke-runs.md atualizado
```

## Uso No Loop De Implementacao

1. Rodar scenario.
2. Se FAIL, abrir `triage.md`.
3. Se `contract_*`, abrir `plan-review.md`.
4. Ajustar apenas a menor camada provavel.
5. Rerodar o mesmo scenario.
6. Registrar PASS/FAIL.
7. So entao reavaliar se o plano do slice continua coerente.
