---
id: FM-NNNN
slug: kebab-case-curto
status: open                          # open | mitigated | fixed | archived
type: <um dos 10 tipos>
layers: [<lista de camadas>]
agents_affected: [<lista de agents>]
personas_exposing: [PER-NNN, ...]
created: YYYY-MM-DD
last_change: YYYY-MM-DD
owner: leandro
manifesto_principle: <opcional P1-P6>
---

# FM-NNNN — Título curto

## Descrição
1-2 parágrafos descrevendo a falha observada.

## Gatilho
Que comportamento do cliente (ou estado do sistema) dispara a falha?

## Impacto
- Cliente final: <consequência>
- Tatuador: <consequência>
- Business: <consequência>

## Diagnóstico (root cause)
Por que acontece. Camada de origem.

## Contramedida
- Item 1
- Item 2
- Referências a arquivos modificados

## Regression test
- Eval: <caminho do eval file ou ID>
- Unit: <caminho do test ou ID>

## Eval gate
Que evals fazem parte do CI permanente cobrindo este failure?

## Histórico
- YYYY-MM-DD: descoberto via <onde>
- YYYY-MM-DD: spec criado <link>
- YYYY-MM-DD: contramedida em produção
- YYYY-MM-DD: status open → mitigated

## Notas
Contexto extra opcional.
