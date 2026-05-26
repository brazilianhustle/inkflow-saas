# Level 4B Wave 15 - Minor Age Natural Variants

## Objetivo

Fortalecer a menoridade em cadastro para variações naturais sem depender de data completa ou frase numerica exata.

## Escopo

- Estado inicial: cadastro aguardando data de nascimento.
- Primeiro micro-slice: `sou menor de idade`.
- Saida esperada: handoff humano seguro, `estado=aguardando_tatuador`, `orcid=null`, `data_nascimento=null`.
- Observabilidade: `conversation_router` com `minor_age_explicit` e `escalation_manager` com `minor_age`.
- Validacao: teste local, HTTP radar e WhatsApp real definitivo.

## Fora De Escopo

- preco, sinal, pagamento ou agenda;
- mudanca ampla de linguagem;
- persistir idade como data;
- validar documento/responsavel;
- promocao para 4C.

## Estado

PASS parcial: micro-slice 1 concluido.

## Micro-Slice 1

PASS: `sou menor de idade` validado como menoridade explicita sem numero, acionando humano sem inventar `data_nascimento` e sem criar `orcid`.

```text
commit_funcional: 2a60215 feat: detect natural minor age disclosure
tests_focados: bash -n scripts/smoke/run-scenario.sh scripts/smoke/run-inbound.sh scripts/smoke/run-real-whatsapp.sh scripts/smoke/render-report.sh PASS; node --test tests/_lib/conversation-policy.test.mjs tests/_lib/conversation-router.test.mjs tests/_lib/escalation-manager.test.mjs tests/_lib/whatsapp-pipeline.test.mjs PASS 140/140
tests_local: npm test PASS 1200/1200
ci: PASS
deploy: PASS
http_radar: scenario-cadastro-menoridade-natural-handoff-humano-20260526T165653Z-17022 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-menoridade-natural-handoff-humano-20260526T165811Z-26978 PASS
```

## Provas Conclusivas Reais

Cliente: `sou menor de idade`

Bot: `Como a pessoa que vai tatuar tem menos de 18 anos, vou acionar o tatuador para orientar com segurança sobre responsável legal.`

Estado final: `aguardando_tatuador`, `orcid=null`, `data_nascimento=null`.

## Decisao

Manter Level 4B. A Wave 14 fica encerrada pragmaticamente com tres variacoes reais de recusa de e-mail; a Wave 15 move para uma frente de risco maior e escopo estreito: menoridade declarada em linguagem natural. Proximo micro-slice recomendado: validar uma variacao numerica diferente (`tenho 17 anos`) ou fechar a onda se o objetivo for apenas cobrir declaracao natural sem numero.
