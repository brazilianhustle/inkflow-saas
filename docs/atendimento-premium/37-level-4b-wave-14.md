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

PASS.

## Validacao

```text
commit_funcional: 3c27878 test: cover natural email refusal
tests_focados: bash -n scripts/smoke/run-scenario.sh scripts/smoke/run-inbound.sh scripts/smoke/run-real-whatsapp.sh scripts/smoke/render-report.sh PASS; node --test tests/_lib/conversation-router.test.mjs tests/_lib/whatsapp-pipeline.test.mjs PASS 120/120
tests_local: npm test PASS 1196/1196
wave_health_pre_smoke: PASS
ci: PASS
deploy: PASS
http_radar: scenario-cadastro-email-refusal-channel-handoff-20260526T090119Z-9662 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-email-refusal-channel-handoff-20260526T090215Z-18284 PASS
```

## Resultado

- `prefiro falar por aqui` agora resolve a pergunta pendente de e-mail como recusa opcional.
- O Router registra `cadastro_pending_answer` com `pending_email_refused`.
- `dados_cadastro.email=null` e `dados_cadastro.email_recusado=true`.
- Workflow Manager promove para `aguardando_tatuador` por `cadastro_and_tattoo_complete`.
- `orcid` e criado normalmente para handoff de orcamento.
- Bot nao insiste em e-mail, nome ou data.

## Micro-Slice 2

PASS: `melhor falar por aqui` validado como segunda variacao natural de recusa de e-mail opcional, com o mesmo contrato de handoff e WhatsApp real.

```text
commit_funcional: 0ccf0a2 test: cover second natural email refusal
tests_focados: bash -n scripts/smoke/run-scenario.sh scripts/smoke/run-inbound.sh scripts/smoke/run-real-whatsapp.sh scripts/smoke/render-report.sh PASS; node --test tests/_lib/conversation-router.test.mjs tests/_lib/whatsapp-pipeline.test.mjs PASS 121/121
ci: PASS
deploy: PASS
http_radar: scenario-cadastro-email-refusal-melhor-falar-aqui-20260526T091028Z-10893 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-email-refusal-melhor-falar-aqui-20260526T091108Z-5886 PASS
```

## Provas Conclusivas Reais

Cliente: `prefiro falar por aqui`

Bot: `Fechado, Joao! O tatuador vai avaliar com calma e eu te retorno em breve com o valor certinho.`

Estado final: `aguardando_tatuador`, `orcid=orc_41d3yq`, `email=null`, `email_recusado=true`.

Cliente: `melhor falar por aqui`

Bot: `Fechado, Joao! O tatuador vai avaliar com calma e eu te retorno em breve com o valor certinho.`

Estado final: `aguardando_tatuador`, `orcid=orc_0a1325`, `email=null`, `email_recusado=true`.

## Decisao

Manter Level 4B. Os dois primeiros micro-slices da Wave 14 passaram com HTTP radar e WhatsApp real definitivo. Proximo passo pode continuar a mesma onda com outra variacao natural de recusa, desde que continue fora de preco, agenda, sinal e pagamento.
