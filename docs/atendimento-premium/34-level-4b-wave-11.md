# Level 4B Wave 11 - Post-Handoff Media Forwarding

## Objetivo

Validar que, depois do handoff terminal (`aguardando_tatuador`), uma nova midia enviada pelo cliente e encaminhada ao tatuador sem reabrir coleta, sem gerar resposta normal do bot e com cleanup de `media_base64` somente apos upload OK.

## Escopo

- Seed terminal com cadastro, tattoo e `orcid` ja completos.
- Cenario HTTP como radar de producao.
- Cenario WhatsApp real como validacao definitiva.
- Observabilidade por tail via evento `pos-handoff-midia-encaminhada`.
- `SMOKE_REQUIRE_AI_RESPONSE=0` oficializado para fluxos terminais onde o bot nao deve responder.

## Gates

- Local focado: `pos-handoff-foto`, pipeline e scripts alterados.
- CI/deploy antes de smoke em producao.
- HTTP production smoke PASS.
- WhatsApp real PASS via instancia `central`.
- Evidencia conclusiva real no fechamento da onda.

## Estado

PASS.

## Resultado

- Commit funcional: `f4cfc61 test: cover post-handoff media forwarding`.
- Testes focados: `bash -n scripts/smoke/run-scenario.sh scripts/smoke/run-inbound.sh scripts/smoke/run-real-whatsapp.sh scripts/smoke/render-report.sh` PASS; `node --test tests/integration/pos-handoff-foto.test.mjs tests/_lib/whatsapp-pipeline.test.mjs` PASS 70/70.
- Testes locais: `npm test` PASS 1194/1194.
- CI/deploy: PASS.
- HTTP radar: `scenario-post-handoff-media-forwarding-20260526T083321Z-3770` PASS.
- WhatsApp real: `scenario-whatsapp-real-post-handoff-media-forwarding-20260526T083424Z-5240` PASS.

## Provas Conclusivas Reais

```text
Cliente: "mais uma referencia" + image/png enviado pela instancia central
Bot: sem nova resposta automatica apos o humano
Estado: aguardando_tatuador
ORCID: orc_poshandoff
Tail: pos-handoff-midia-encaminhada
```

## Aprendizado

Fluxos terminais podem e devem usar `SMOKE_REQUIRE_AI_RESPONSE=0`, mas o gate nao pode exigir zero AI em todo o snapshot porque seeds/historico podem aparecer dentro da janela de `since`. O contrato correto e zero AI posterior ao humano novo.
