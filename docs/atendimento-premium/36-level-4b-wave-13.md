# Level 4B Wave 13 - Minor Age Explicit

## Objetivo

Validar que, em cadastro, uma idade explicitamente menor de 18 anos aciona humano sem inventar `data_nascimento`, sem criar `orcid` e sem seguir para orcamento.

## Escopo

- Mensagem: `tenho 16 anos`.
- Estado inicial: cadastro aguardando data.
- Saida esperada: `aguardando_tatuador`, `orcid=null`, `data_nascimento=null`.
- Observabilidade: `conversation_router` com `minor_age_explicit` e `escalation_manager` com `minor_age`.
- HTTP radar + WhatsApp real definitivo.

## Fora De Escopo

- linguagem premium ampla;
- responsavel legal como coleta estruturada;
- preco, sinal, pagamento, agenda ou proposta;
- promocao para 4C.

## Estado

PASS.

## Validacao

```text
commit_funcional: ae88b65 test: cover explicit minor age handoff
tests_focados: bash -n scripts/smoke/run-scenario.sh scripts/smoke/run-inbound.sh scripts/smoke/run-real-whatsapp.sh scripts/smoke/render-report.sh PASS; node --test tests/_lib/conversation-router.test.mjs tests/_lib/whatsapp-pipeline.test.mjs tests/_lib/escalation-manager.test.mjs PASS 129/129
tests_local: npm test PASS 1195/1195
wave_health_pre_smoke: PASS
ci: PASS
deploy: PASS
http_radar: scenario-cadastro-idade-menor-handoff-humano-20260526T085147Z-3519 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-idade-menor-handoff-humano-20260526T085229Z-3539 PASS
```

## Resultado

- `tenho 16 anos` em cadastro aguardando data aciona `ConversationRouter` com `intent=minor_age_explicit`.
- O estado final vira `aguardando_tatuador`.
- `data_nascimento` permanece `null`; o sistema nao inventa data.
- `orcid` permanece `null`; o sistema nao envia orcamento.
- `EscalationManager` registra `reason_code=minor_age`, `severity=high`, `requires_orcid=false`.
- Bot/tail/poll/agent-log gates passaram em HTTP radar e WhatsApp real.

## Provas Conclusivas Reais

Cliente: `tenho 16 anos`

Bot: `Como a pessoa que vai tatuar tem menos de 18 anos, vou acionar o tatuador para orientar com segurança sobre responsável legal.`

Estado final: `aguardando_tatuador`, `orcid=null`, `data_nascimento=null`.

## Decisao

Manter Level 4B. A Wave 13 fecha uma variacao leve de risco sem promover 4C. Proximo passo deve continuar em zona verde/amarela e preservar WhatsApp real como validacao definitiva.
