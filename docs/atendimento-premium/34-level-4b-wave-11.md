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

Em implementacao.
