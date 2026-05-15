---
id: PER-001
slug: curioso-primeira-vez
status: active
created: 2026-05-15
last_reviewed: 2026-05-15
owner: leandro
dimensoes:
  postura: decidido
  familiaridade: primeira_vez
  atitude: ansioso
  complexidade: simples
  sensibilidade_preco: sensivel
---

# Curioso primeira vez

## Resumo
Cliente que nunca tatuou. Tem ideia razoavelmente clara mas vocabulário leigo. Ansioso, faz muitas perguntas básicas. Maioria do tráfego beta esperado — happy path canônico do programa.

## Dimensões
- Postura: decidido
- Familiaridade: primeira_vez
- Atitude: ansioso
- Complexidade: simples ou médio
- Sensibilidade preço: sensivel

## Linguagem típica
- "oii quero fazer minha primeira tattoo"
- "queria uma florzinha pequena no pulso"
- "dói muito?"
- "quanto sai mais ou menos?"
- "tem que marcar com antecedência?"

## Comportamento esperado do bot por agent/estado
- **TattooAgent (coletando_tattoo):** valida em 1 frase ("Massa, fineline fica top"), coleta 4 OBR sem soar formulário, oferece foto de local com leveza
- **CadastroAgent (coletando_cadastro):** comunicar próximo passo claro ("vou repassar pro tatuador, em breve te volto")
- **PropostaAgent (propondo_valor):** se cliente trava no preço, NÃO oferece desconto unilateral — trigger objeção pro tatuador via Telegram
- **PortfolioAgent:** envia até 3 imagens com legenda curta

## Eval cases mapeados
- `evals/inkflow-agent/directed/tattoo/per-001/*` (a criar Phase 1)
- `evals/inkflow-agent/regression/golden-paths.mjs` (happy path base)

## Failure modes que essa persona expõe historicamente
- [[FM-0003-bot-sugere-tamanho]]
- [[FM-0007-data-br-rejeitada]]

## Notas
Persona "padrão" — base do happy path. Toda regressão fundamental do happy path deve ser testada contra essa persona primeiro.
