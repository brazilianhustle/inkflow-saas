# Persona Taxonomy — 5 dimensões cruzadas

Toda persona em `PER-NNN-*.md` tem essas 5 dimensões no frontmatter + seção `## Dimensões`. Valores são string-enum — manter consistente pro lint catch divergências.

| Dimensão | Valores válidos |
|---|---|
| `postura` | `decidido`, `indeciso`, `pesquisando`, `resistente`, `adversarial`, `qualquer` |
| `familiaridade` | `primeira_vez`, `experiente`, `veterano_recorrente`, `qualquer`, `n/a` |
| `atitude` | `ansioso`, `casual`, `agressivo`, `exigente`, `distante`, `deslumbrado`, `emocional`, `qualquer`, `n/a` |
| `complexidade` | `simples`, `medio`, `complexo` |
| `sensibilidade_preco` | `aberto`, `sensivel`, `negociador`, `queima_preco`, `n/a` |

`qualquer` significa "dimensão não diferencia esta persona". `n/a` significa não aplicável (ex: prompt injection).

## Regra de evolução

- Valor novo descoberto via tráfego real → propõe no weekly, registra aqui
- Convergência entre dois valores → funde no weekly, marca um como deprecated
- Lint `scripts/inkflow-agent/failure-catalog-lint.mjs` rejeita persona com valor fora desta lista
