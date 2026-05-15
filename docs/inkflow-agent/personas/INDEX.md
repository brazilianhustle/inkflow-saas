# Persona Library — INDEX

> Catálogo navegável de personas. Todas em `status: active` cobrem ~85% do tráfego esperado.
> Taxonomia: [_taxonomy.md](_taxonomy.md). Template: [_template.md](_template.md).

| ID | Slug | Status | Postura | Familiaridade | Atitude | Complexidade | Sensib. preço | Failures expostos |
|---|---|---|---|---|---|---|---|---|
| [PER-001](PER-001-curioso-primeira-vez.md) | curioso-primeira-vez | active | decidido | primeira_vez | ansioso | simples | sensivel | FM-0003, FM-0007 |
| [PER-002](PER-002-indeciso-explorando.md) | indeciso-explorando | active | indeciso | primeira_vez | casual | simples | aberto | FM-0001, FM-0003 |
| [PER-003](PER-003-pesquisador-orcamento.md) | pesquisador-orcamento | active | pesquisando | qualquer | distante | simples | queima_preco | FM-0002 |
| [PER-004](PER-004-coverup-complicado.md) | coverup-complicado | active | decidido | experiente | ansioso | complexo | aberto | FM-0004 |
| [PER-005](PER-005-complemento-serie.md) | complemento-serie | active | decidido | veterano_recorrente | exigente | medio | aberto | — |
| [PER-006](PER-006-primeira-vez-safe.md) | primeira-vez-safe | active | decidido | primeira_vez | ansioso | simples | aberto | FM-0005 |
| [PER-007](PER-007-negociador-preco.md) | negociador-preco | active | decidido | experiente | agressivo | medio | negociador | FM-0006 |
| [PER-008](PER-008-vago-de-proposito.md) | vago-de-proposito | active | resistente | qualquer | distante | simples | queima_preco | FM-0008 |
| [PER-009](PER-009-indeciso-eterno.md) | indeciso-eterno | active | indeciso | primeira_vez | ansioso | medio | sensivel | FM-0003, FM-0009 |
| [PER-010](PER-010-contraditorio.md) | contraditorio | active | qualquer | qualquer | qualquer | medio | aberto | FM-0003 |
| [PER-011](PER-011-menor-de-idade.md) | menor-de-idade | active | qualquer | primeira_vez | ansioso | simples | n/a | FM-0010 |
| [PER-012](PER-012-cliente-em-surto.md) | cliente-em-surto | active | qualquer | qualquer | emocional | medio | n/a | FM-0011 |
| [PER-013](PER-013-prompt-injection.md) | prompt-injection | active | adversarial | n/a | n/a | simples | n/a | — |
| [PER-014](PER-014-estilo-indisponivel.md) | estilo-indisponivel | active | decidido | qualquer | qualquer | medio | aberto | FM-0012 |
| [PER-015](PER-015-vip-recorrente.md) | vip-recorrente | active | decidido | veterano_recorrente | casual | simples | aberto | — |

## Personas core por agent (para Phase 1-4 DoD)

| Agent | Personas core (mínimo) | Justificativa |
|---|---|---|
| TattooAgent | PER-001, PER-009, PER-010 | Happy path + memória + P1 manifesto |
| CadastroAgent | PER-001, PER-007, PER-011 | Happy path + edge negociador + menor |
| PropostaAgent | PER-007, PER-008, PER-001 | Negociador (crit) + vago (handoff) + happy |
| PortfolioAgent | PER-002, PER-014 | Modo consultor + estilo indisponível |

## Métricas

- Total personas: 15
- Em status `active`: 15
- Em status `draft`: 0
- Em status `archived`: 0

Última revisão deste INDEX: 2026-05-15
