# Failure Catalog — INDEX

> Catálogo de failures observados (ou hipotetizados via manifesto). 13 entries.
> Taxonomia: [_taxonomy.md](_taxonomy.md). Template: [_template.md](_template.md).

| ID | Slug | Status | Tipo | Camadas | Agents | Personas | Manifesto |
|---|---|---|---|---|---|---|---|
| [FM-0001](FM-0001-modo-consultor-nao-acionado.md) | modo-consultor-nao-acionado | open | policy_violation | prompt | TattooAgent | PER-002, PER-009 | P6 |
| [FM-0002](FM-0002-bot-pressiona-fechamento.md) | bot-pressiona-fechamento | open | policy_violation | prompt | TattooAgent, PropostaAgent | PER-003 | P5 |
| [FM-0003](FM-0003-bot-sugere-tamanho.md) | bot-sugere-tamanho | mitigated | policy_violation | prompt, schema_invariant | TattooAgent | PER-001, PER-009, PER-010 | P1 |
| [FM-0004](FM-0004-coverup-nao-pediu-foto.md) | coverup-nao-pediu-foto | open | policy_violation | prompt, schema_invariant | TattooAgent | PER-004 | P3 |
| [FM-0005](FM-0005-bot-reperguntando-info-ja-dada.md) | bot-reperguntando-info-ja-dada | open | state_error | prompt, schema_invariant | TattooAgent, CadastroAgent | PER-001, PER-006 | — |
| [FM-0006](FM-0006-bot-oferece-desconto-unilateral.md) | bot-oferece-desconto-unilateral | open | policy_violation | prompt, schema_invariant | PropostaAgent | PER-007 | P5 |
| [FM-0007](FM-0007-data-br-rejeitada.md) | data-br-rejeitada | mitigated | data_error | prompt, schema_invariant | CadastroAgent | PER-001, PER-006 | — |
| [FM-0008](FM-0008-bot-insiste-em-cliente-vago.md) | bot-insiste-em-cliente-vago | open | policy_violation | prompt | TattooAgent, CadastroAgent | PER-008 | P5 |
| [FM-0009](FM-0009-bot-confunde-mudanca-de-decisao.md) | bot-confunde-mudanca-de-decisao | open | state_error | prompt, schema_invariant | TattooAgent | PER-009 | — |
| [FM-0010](FM-0010-cadastro-menor-sem-handoff.md) | cadastro-menor-sem-handoff | fixed | policy_violation | schema_invariant | CadastroAgent | PER-011 | — |
| [FM-0011](FM-0011-bot-frio-em-momento-emocional.md) | bot-frio-em-momento-emocional | open | drift_persona | prompt | TattooAgent, CadastroAgent, PropostaAgent | PER-012 | P5 |
| [FM-0012](FM-0012-bot-aceita-estilo-indisponivel.md) | bot-aceita-estilo-indisponivel | open | policy_violation | prompt, data | TattooAgent, PortfolioAgent | PER-014 | — |
| [FM-0013](FM-0013-bot-quebra-registro-whatsapp-em-coleta.md) | bot-quebra-registro-whatsapp-em-coleta | open | drift_persona | prompt | TattooAgent | PER-010, PER-001 | P5 |

## Distribuição por status

| Status | Count |
|---|---|
| open | 10 |
| mitigated | 2 |
| fixed | 1 |
| archived | 0 |

## Distribuição por tipo

| Tipo | Count |
|---|---|
| policy_violation | 7 |
| state_error | 2 |
| data_error | 1 |
| drift_persona | 2 |
| (outros) | 0 |

## Distribuição por agent

| Agent | Failures |
|---|---|
| TattooAgent | 10 |
| CadastroAgent | 5 |
| PropostaAgent | 3 |
| PortfolioAgent | 1 |

Última revisão deste INDEX: 2026-05-15
