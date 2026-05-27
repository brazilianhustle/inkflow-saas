# Level 4B - Wave 48 - Proposta Consolidada Multi-Orcamento

## Objetivo

Corrigir o fluxo de retorno de valor quando um unico ORCID contem mais de uma tattoo. O tatuador deve informar os valores por item, e o cliente deve receber uma unica proposta consolidada com introducao, valores itemizados e CTA.

## Status

```text
status: implementado_localmente
motivo: testes unitarios/integracao e suite completa passaram; falta deploy e validacao real WhatsApp + Telegram
gate_definitivo: somente tratar como PASS apos conversa WhatsApp real completa + valores informados no Telegram + cliente receber uma unica mensagem consolidada
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
1. deploy em producao
2. WhatsApp real full journey desde o inicio ate duas tattoos no mesmo ORCID
3. Telegram mostra prompt de valores por item
4. tatuador informa valores no formato numerado
5. cliente recebe uma unica mensagem consolidada com os dois valores
6. persistencia confirma proposal_summary e proposals por item
```

## Stop Conditions

```text
dois sendText separados para cada tattoo
valor unico sobrescrevendo item sem proposal individual
Telegram pedindo "Qual valor?" generico em multi-budget
cliente recebendo CTA duplicado
PASS sem validacao real WhatsApp + Telegram
```
