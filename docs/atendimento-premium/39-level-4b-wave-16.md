# Level 4B Wave 16 - Minor Age Guardian Consent Variants

## Objetivo

Fortalecer a menoridade por sinais indiretos de responsavel legal. Frases como `minha mae autorizou` ou `tenho autorizacao dos meus pais` devem acionar humano com seguranca, sem exigir que o cliente escreva literalmente `sou menor de idade`.

## Escopo

- Estado inicial: cadastro aguardando data de nascimento.
- Primeiro micro-slice: `minha mae autorizou`.
- Saida esperada: handoff humano seguro, `estado=aguardando_tatuador`, `orcid=null`, `data_nascimento=null`.
- Observabilidade: `conversation_router` com `minor_age_explicit` e `escalation_manager` com `minor_age`.
- Validacao: teste local, HTTP radar e WhatsApp real definitivo.

## Fora De Escopo

- validar documento, responsavel ou permissao;
- pedir comprovante de autorizacao;
- persistir idade como data;
- preco, sinal, pagamento ou agenda;
- mudanca ampla de linguagem;
- tenant real amplo ou secrets;
- promocao para 4C.

## Criterio De Pronto

```text
tests_focados: PASS
tests_local: PASS quando risco justificar
ci: PASS
deploy: PASS
http_radar: PASS
whatsapp_real: PASS
estado_final: aguardando_tatuador
orcid: null
data_nascimento: null
copy_risk: baixo
```

## Stop Conditions

- qualquer resposta que trate autorizacao dos pais como liberacao automatica;
- criar `orcid`;
- persistir `data_nascimento` inexistente;
- continuar coleta normal depois de sinal de responsavel legal;
- WhatsApp real ausente ou FAIL;
- qualquer risco de preco, agenda, pagamento ou sinal.

## Estado

Declarada em 2026-05-26 apos Wave 15 e continue implicito oficializado.

