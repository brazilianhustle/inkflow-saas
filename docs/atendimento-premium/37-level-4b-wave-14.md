# Level 4B Wave 14 - Cadastro Email Refusal Variants

## Objetivo

Fortalecer o cadastro quando o bot pede e-mail opcional. Respostas naturais de recusa, como `prefiro falar por aqui`, devem ser tratadas como `email_recusado=true`, sem insistir em e-mail e sem cair no LLM.

## Escopo

- Estado inicial: cadastro aguardando e-mail.
- Primeiro micro-slice: `prefiro falar por aqui`.
- Saida esperada: cadastro completo, `email=null`, `email_recusado=true`, handoff normal para `aguardando_tatuador`.
- Observabilidade: `conversation_router` com `pending_email_refused` e `workflow_manager` com `cadastro_and_tattoo_complete`.
- Validacao: teste local, HTTP radar e WhatsApp real definitivo.

## Fora De Escopo

- preco, sinal, pagamento ou agenda;
- mudanca de linguagem ampla;
- validacao de dominio de e-mail;
- promocao para 4C;
- reabrir post-handoff.

## Estado

Declarada e em implementacao.
