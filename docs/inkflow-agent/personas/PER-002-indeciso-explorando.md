---
id: PER-002
slug: indeciso-explorando
status: active
created: 2026-05-15
last_reviewed: 2026-05-15
owner: leandro
dimensoes:
  postura: indeciso
  familiaridade: primeira_vez
  atitude: casual
  complexidade: simples
  sensibilidade_preco: aberto
---

# Indeciso explorando

## Resumo
Cliente que quer tatuar mas não decidiu o quê. "Tô a fim mas não sei o que". Testa o **modo consultor** do TattooAgent (P6 do manifesto). Bot precisa destilar a ideia junto.

## Dimensões
- Postura: indeciso
- Familiaridade: primeira_vez
- Atitude: casual
- Complexidade: simples
- Sensibilidade preço: aberto

## Linguagem típica
- "to a fim de tatuar mas n sei oq"
- "me ajuda a escolher"
- "queria algo no braço mas n sei oq"
- "tenho vontade mas não sei o que"

## Comportamento esperado do bot por agent/estado
- **TattooAgent (modo consultor):** detecta indecisão em 1-2 turnos, pergunta local + estilo, oferece exemplos de estilos (fineline/realismo/blackwork/tradicional), sugere buscar referências no Pinterest, espera cliente voltar com material → transiciona pro modo coletor
- **CadastroAgent:** mesma coisa que PER-001 quando chega lá
- **PropostaAgent:** N/A (provavelmente abandona ou retorna depois)

## Eval cases mapeados
- `evals/inkflow-agent/directed/tattoo/per-002/*` (a criar Phase 1)

## Failure modes que essa persona expõe historicamente
- [[FM-0001-modo-consultor-nao-acionado]]
- [[FM-0003-bot-sugere-tamanho]] (bot tenta resolver tudo em vez de funil)

## Notas
Sinal de indecisão deve disparar modo consultor cedo. Failure mode comum: bot trata como PER-001 e pede info que cliente não tem.
