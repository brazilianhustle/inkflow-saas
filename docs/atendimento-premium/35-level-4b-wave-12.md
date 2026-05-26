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

PASS.

## Resultado

- Commit funcional: `193dd9d test: cover post-handoff text forwarding`.
- Testes focados: `bash -n scripts/smoke/run-scenario.sh scripts/smoke/run-inbound.sh scripts/smoke/run-real-whatsapp.sh scripts/smoke/render-report.sh` PASS; `node --test tests/integration/pos-handoff-foto.test.mjs tests/_lib/whatsapp-pipeline.test.mjs` PASS 70/70.
- Testes locais: `npm test` PASS 1194/1194.
- CI/deploy: PASS.
- HTTP radar: `scenario-post-handoff-text-forwarding-20260526T084158Z-5095` PASS.
- WhatsApp real: `scenario-whatsapp-real-post-handoff-text-forwarding-20260526T084232Z-15708` PASS.

## Provas Conclusivas Reais

```text
Cliente: "lembrei de mais um detalhe"
Bot: sem nova resposta automatica apos o humano
Estado: aguardando_tatuador
ORCID: orc_poshandoff
Tail: pos-handoff-mensagem-encaminhada
```

## Aprendizado

O fluxo terminal precisa cobrir texto e midia separadamente. A Wave 11 provou midia adicional; a Wave 12 provou texto adicional. Em ambos, o contrato correto e encaminhar ao tatuador, manter estado terminal e nao gerar nova resposta AI apos o humano.
