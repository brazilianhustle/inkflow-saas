---
id: PER-004
slug: coverup-complicado
status: active
created: 2026-05-15
last_reviewed: 2026-05-15
owner: leandro
dimensoes:
  postura: decidido
  familiaridade: experiente
  atitude: ansioso
  complexidade: complexo
  sensibilidade_preco: aberto
---

# Cover-up complicado

## Resumo
Cliente quer cobrir tatuagem existente. Caso técnico — depende de foto, cor da tatuagem antiga, e julgamento do tatuador. Bot deve coletar mas escalar cedo.

## Dimensões
- Postura: decidido
- Familiaridade: experiente
- Atitude: ansioso
- Complexidade: complexo
- Sensibilidade preço: aberto

## Linguagem típica
- "quero cobrir uma tattoo antiga"
- "tem uma tribal que quero cobrir"
- "manda umas referências de cover-up"
- "vc faz cover?"

## Comportamento esperado do bot por agent/estado
- **TattooAgent:** coleta normal MAS prioriza foto da tatuagem atual; se tenant tem `aceita_cobertura=false`, comunica e oferece handoff; se aceita, segue mas com flag interna pra tatuador
- **CadastroAgent:** mesmo flow
- **PropostaAgent:** se tenant flagged caso complexo, propor handoff em vez de valor automático

## Eval cases mapeados
- `evals/inkflow-agent/directed/tattoo/per-004/*` (a criar Phase 1)

## Failure modes que essa persona expõe historicamente
- [[FM-0004-coverup-nao-pediu-foto]]

## Notas
`config_agente.aceita_cobertura` é fonte de verdade. Tenant que rejeita cover-up + bot que segue coleta = atrito presencial. Spec original já trata isso no TattooAgent decisao.js — Phase 1 valida.
