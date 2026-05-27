# Level 4B - Wave 49 - Orcamento Por Sessoes

## Objetivo

Permitir que o tatuador informe proposta por valor fechado ou por sessoes, sem criar regra pontual de copy e sem quebrar os fluxos legados que dependem de `valor_proposto`.

## Decisao Arquitetural

```text
proposta = item + pricing_mode
pricing_mode:
  fixed_total: valor fechado
  per_session: quantidade de sessoes + valor por sessao + total
compatibilidade:
  valor_proposto sempre recebe o total estimado
```

## Contrato Do Tatuador

```text
Orcamento unico:
750
2 sessoes 500

Multi-orcamento:
1 400
2 500

Multi misto:
1 total 400
2 2 sessoes 500
```

## Contrato Da Resposta Ao Cliente

```text
intro breve
linha de valor fechado ou linha por sessoes
CTA de agendamento
```

Exemplo estrutural:

```text
Fala Joao, tudo bem? O tatuador acabou de me passar o seu orçamento.
A caveira na perna ficaria em 2 sessoes de R$ 500, totalizando R$ 1000.
Quer que eu veja um horario pra gente agendar?
```

## Implementacao

```text
functions/_lib/budget-proposal-manager.js
- parseBudgetProposalValue
- applySingleBudgetValue
- composeSingleBudgetProposal
- parseBudgetItemValues agora aceita fixed_total/per_session
- composeMultiBudgetProposal agora aceita itens mistos

functions/api/telegram/webhook.js
- prompt do "Informar valor" mostra valor fechado e por sessoes
- handleText single-budget persiste proposal_summary
- handleText multi-budget mantem proposal por item

functions/api/telegram/reentrada.js
- evento fechar usa composeSingleBudgetProposal quando existe proposal_summary
```

## Validacao Local

```text
node --test tests/integration/telegram-callback-nome.test.mjs tests/tools/reentrada-helpers.test.mjs
PASS 28/28

npm test
PASS 1249/1249
```

## Gate Definitivo

```text
status: pendente
exige:
  1. deploy da Wave 49
  2. Telegram real com resposta por sessao
  3. WhatsApp real recebendo uma unica mensagem de proposta
  4. persistencia com valor_proposto=total e proposal_summary.pricing_mode=per_session
```

## Stop Conditions

```text
nao marcar PASS se:
  - validar apenas parser local
  - validar apenas reentrada direta sem Telegram real
  - WhatsApp receber duas mensagens de proposta
  - valor_proposto nao for o total
  - proposal_summary nao registrar pricing_mode
```
