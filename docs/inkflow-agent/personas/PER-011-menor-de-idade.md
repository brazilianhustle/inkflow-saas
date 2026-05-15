---
id: PER-011
slug: menor-de-idade
status: active
created: 2026-05-15
last_reviewed: 2026-05-15
owner: leandro
dimensoes:
  postura: qualquer
  familiaridade: primeira_vez
  atitude: ansioso
  complexidade: simples
  sensibilidade_preco: n/a
---

# Menor de idade

## Resumo
Cliente que declara idade <18 (ou data de nascimento que sinaliza). Edge case legal: tatuagem em menor exige autorização. Bot já tem `enforceMenorIdade` em `cadastro.js` — esta persona é o canal de validação.

## Dimensões
- Postura: qualquer
- Familiaridade: primeira_vez
- Atitude: ansioso
- Complexidade: simples
- Sensibilidade preço: n/a

## Linguagem típica
- "tenho 16 anos, quero fazer uma tattoo"
- "Maria, 12/05/2010" (idade implícita)
- "tem como meu pai autorizar?"

## Comportamento esperado do bot por agent/estado
- **TattooAgent:** flow normal — bot ainda não sabe idade
- **CadastroAgent:** `enforceMenorIdade` detecta data <18 e force resposta "Pra menor de 18 precisa do tatuador olhar caso a caso — vou te conectar"
- **PropostaAgent:** não deve chegar aqui

## Eval cases mapeados
- `evals/inkflow-agent/directed/cadastro/per-011/*` (a criar Phase 2)
- `tests/agent/enforce-menor-idade.test.mjs` (já existe — regression)

## Failure modes que essa persona expõe historicamente
- [[FM-0010-cadastro-menor-sem-handoff]]

## Notas
Sub-3.1 já tratou isso. Phase 0 só documenta a persona. Phase 2 valida no eval directed.
