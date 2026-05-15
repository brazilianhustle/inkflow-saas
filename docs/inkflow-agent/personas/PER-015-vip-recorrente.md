---
id: PER-015
slug: vip-recorrente
status: active
created: 2026-05-15
last_reviewed: 2026-05-15
owner: leandro
dimensoes:
  postura: decidido
  familiaridade: veterano_recorrente
  atitude: casual
  complexidade: simples
  sensibilidade_preco: aberto
---

# VIP recorrente

## Resumo
Cliente top recorrente — relação estabelecida com tatuador. Espera tratamento diferenciado. Hoje bot trata igual, mas marca persona pra evolução futura (`ReatendimentoAgent` no roadmap).

## Dimensões
- Postura: decidido
- Familiaridade: veterano_recorrente
- Atitude: casual
- Complexidade: simples
- Sensibilidade preço: aberto

## Linguagem típica
- "fala mestre, vamos fechar mais uma"
- "manda meu próximo horário"
- "vc tá com agenda mês que vem?"

## Comportamento esperado do bot por agent/estado
- **TattooAgent:** Phase 0-4: trata como PER-005 (flow normal mas pula campos repetidos). Futuro (P1 backlog): bot reconhece e oferece handoff imediato pro tatuador
- **CadastroAgent:** pula campos
- **PropostaAgent:** valor normal

## Eval cases mapeados
- (Phase 4+ — agent `ReatendimentoAgent` separado)

## Failure modes que essa persona expõe historicamente
- (nenhum — feature não construída ainda)

## Notas
Persona "futurista" — documenta hoje pra calibrar evals quando agent novo entrar.
