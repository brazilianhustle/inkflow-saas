# Level 4B - Wave 48 - Proposta Consolidada Multi-Orcamento

## Objetivo

Corrigir o fluxo de retorno de valor quando um unico ORCID contem mais de uma tattoo. O tatuador deve informar os valores por item, e o cliente deve receber uma unica proposta consolidada com introducao, valores itemizados e CTA.

## Status

```text
status: validacao_real_parcial
motivo: deploy passou; WhatsApp real full journey passou; reentrada consolidada real ao cliente passou; webhook Telegram real ainda nao fechado por secret de webhook indisponivel localmente
gate_definitivo: somente tratar como PASS completo apos callback/reply real do Telegram ou script autorizado com INKFLOW_TELEGRAM_WEBHOOK_SECRET correto
```

## Diagnostico

O modelo anterior ainda operava como:

```text
1 ORCID = 1 valor_proposto = 1 reentrada
```

A Wave 47 evoluiu a coleta para:

```text
1 ORCID = N tattoos
```

O gap desta Wave era a fase de proposta:

```text
risco: duas tattoos no mesmo orcamento gerarem dois valores separados e duas respostas independentes ao cliente
resultado_ruim: "o valor da borboleta fica 200" seguido de "o valor da caveira fica 400"
resultado_premium: uma unica resposta com intro + valores por item + CTA
```

## Contrato Implementado

```text
camada: Budget Proposal Manager
entrada: budget_items ativos em dados_coletados + resposta do tatuador com valores numerados
telegram: callback "Informar valor" em multi-budget pede valores por item no mesmo ORCID
persistencia: cada budget_items[n].proposal recebe valor, valor_text e status=priced
compatibilidade: valor_proposto recebe o total para os fluxos legados de proposta/agendamento
reentrada: evento fechar_multi monta uma unica mensagem consolidada ao cliente
```

Formato esperado para o tatuador:

```text
1 200
2 400
```

Formato esperado para o cliente:

```text
Fala Joao, tudo bem? O tatuador acabou de me passar o orçamento das 2 tattoos que voce pediu.
A borboleta na perna ficaria por R$ 200.
Ja a caveira na perna ficaria por R$ 400.
Quer que eu veja um horario pra gente agendar?
```

## Validacao Local

```text
focused_tests: node --test tests/tools/reentrada-helpers.test.mjs tests/integration/telegram-callback-nome.test.mjs tests/integration/telegram-callback-idempotencia.test.mjs
focused_result: PASS 27/27
full_tests: npm test
full_result: PASS 1244/1244
```

## Gate Definitivo Pendente

```text
1. deploy em producao - PASS
2. WhatsApp real full journey desde o inicio ate duas tattoos no mesmo ORCID - PASS
3. Telegram mostra prompt de valores por item - pendente no caminho real
4. tatuador informa valores no formato numerado - pendente no caminho real
5. cliente recebe uma unica mensagem consolidada com os dois valores - PASS via reentrada real
6. persistencia confirma proposal_summary e proposals por item - PASS
7. fechar callback/reply Telegram real com secret correto antes de marcar PASS completo
```

## Validacao Em Producao - 2026-05-27

```text
commit: 0326956 feat: consolidate multi-budget proposals
ci_tests: PASS 26533581695
deploy: PASS 26533581490
whatsapp_real_full_journey: scenario-whatsapp-real-long-journey-post-handoff-new-request-20260527T192601Z-25886
orcid: orc_jy5c9p
conversation_id: 27f4ed6f-889f-49c3-afb5-cb186fe5c135
resultado_jornada: PASS 10/10 steps; 2 budget_items no mesmo ORCID; tail fotos-orcamento-update-enviadas com itens_total=2 e falhas=0
reentrada_fechar_multi: PASS; endpoint /api/telegram/reentrada retornou ok=true e mensagem consolidada
persistencia: valor_proposto=600; item_1 proposal=R$ 200; item_2 proposal=R$ 400; proposal_summary.total=600
cliente_recebeu: uma unica mensagem com intro + valores + CTA registrada em conversa_mensagens
telegram_webhook_real: pendente; tentativa com secrets locais retornou unauthorized
```

Provas conclusivas reais da parte validada:

```text
Cliente: "mudei de ideia, queria uma caveira na perna"
Bot: "Beleza! Mas so pra eu entender certinho, voce quer fazer somente essa ou a anterior tambem?"

Cliente: "as duas"
Bot: "Fechado, vou considerar as duas. Pra caveira na perna, qual estilo voce imagina?"

Cliente: "blackwork"
Bot: "Consegue mandar uma foto do local onde tu quer tatuar?"

Cliente: "segue foto do local" + imagem
Bot: "Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor."

Reentrada de valor:
Bot: "Fala Joao, tudo bem? O tatuador acabou de me passar o orçamento das 2 tattoos que voce pediu.
A borboleta na perna ficaria por R$ 200.
Ja a caveira na perna ficaria por R$ 400.
Quer que eu veja um horario pra gente agendar?"
```

## Stop Conditions

```text
dois sendText separados para cada tattoo
valor unico sobrescrevendo item sem proposal individual
Telegram pedindo "Qual valor?" generico em multi-budget
cliente recebendo CTA duplicado
PASS sem validacao real WhatsApp + Telegram
```
