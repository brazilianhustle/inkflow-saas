# Level 4A Wave 2

Esta onda usa a disciplina validada na primeira onda Level 4A para atacar uma divida funcional de cadastro: `QuestionPolicy` precisa entender respostas humanas aos campos pendentes sem depender de frase exata do bot.

## Declaracao

```text
onda_id: level4a-wave-2-cadastro-question-policy
objetivo: fortalecer interpretacao de respostas de cadastro pendente com validacao real WhatsApp
familia: cadastro, question-policy, workflow-manager
risco: amarelo
janela: Level 4A, ate 6 micro-slices
```

## Escopo

Dentro do escopo:

- reconhecer resposta de nome completo quando essa for a pergunta pendente;
- reconhecer data de nascimento quando essa for a pergunta pendente;
- reconhecer email quando essa for a pergunta pendente;
- reconhecer recusa de email quando essa for a pergunta pendente;
- responder duvida lateral durante cadastro sem perder a pergunta pendente;
- registrar comportamento em smoke HTTP e WhatsApp real para cada micro-slice conversacional.

Fora do escopo:

- preco, sinal, pagamento ou agenda;
- secrets;
- tenant real amplo;
- mudanca de copy ampla fora do campo validado;
- refatoracao grande do Agent operacional;
- promocao para 4B/4C.

## Micro-Slices Planejados

1. `cadastro-question-policy-nome`: resposta de nome completo resolve campo pendente correto.
2. `cadastro-question-policy-data`: data de nascimento resolve campo pendente correto sem aceitar idade isolada como data.
3. `cadastro-question-policy-email`: email valido resolve campo pendente correto.
4. `cadastro-question-policy-email-recusado`: recusa explicita de email resolve campo pendente sem travar cadastro.
5. `cadastro-question-policy-lateral`: duvida lateral durante cadastro e respondida e a pergunta pendente continua recuperavel.
6. `wave-closeout`: consolidar evidencias, gates e recomendacao de autonomia.

Os itens 2-6 so devem ser executados se o item anterior terminar com CI/deploy PASS, HTTP radar PASS, WhatsApp real PASS e sem blocker.

## Criterios De Pronto

- `check-autonomy-gate.sh` PASS em Level 4A;
- `check-security-gate.sh` PASS;
- `wave-health.sh` PASS antes e depois da onda;
- testes locais relevantes PASS;
- CI PASS;
- deploy PASS;
- HTTP radar PASS para cada micro-slice conversacional;
- WhatsApp real definitivo PASS para cada micro-slice conversacional;
- `summary.md`, `transcript.md` e `judgment.md` gerados quando scenario produzir evidence;
- worktree limpo ao fechar;
- nenhuma promocao para 4B/4C.

## Stop Conditions

Parar a onda se ocorrer:

- CI FAIL;
- deploy FAIL;
- HTTP radar FAIL;
- WhatsApp real FAIL;
- `copy_risk=alto`;
- estado final errado;
- persistencia de campo incorreto;
- pergunta pendente perdida apos duvida lateral;
- falta de resposta AI;
- cleanup inseguro;
- divergencia entre HTTP e WhatsApp real;
- necessidade de tocar preco, sinal, pagamento, agenda, secrets ou tenant real amplo.

## Resultado Atual

```text
status: declarada
micro_slice_atual: cadastro-question-policy-nome
promocao_4b_4c: proibida
```
