# Level 4B Wave 12 - Post-Handoff Text Forwarding

## Objetivo

Validar que, depois do handoff terminal (`aguardando_tatuador`), uma nova mensagem de texto do cliente e encaminhada ao tatuador sem reabrir coleta e sem gerar nova resposta normal do bot.

## Escopo

- Seed terminal com cadastro, tattoo e `orcid` ja completos.
- Cenario HTTP como radar de producao.
- Cenario WhatsApp real como validacao definitiva.
- Observabilidade por tail via evento `pos-handoff-mensagem-encaminhada`.
- `SMOKE_REQUIRE_AI_RESPONSE=0` preservado para fluxo terminal.

## Fora De Escopo

- preco, sinal, pagamento, agenda ou proposta;
- alteracao de linguagem premium;
- promocao para 4C.

## Gates

- Testes locais focados de pipeline terminal.
- CI/deploy antes de smoke em producao.
- HTTP production smoke PASS.
- WhatsApp real PASS via instancia `central`.

## Estado

Em implementacao.
