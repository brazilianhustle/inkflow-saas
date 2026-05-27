# Level 4B - Wave 43 - Limpeza Final De Subcasos Midia/Cadastro

## Objetivo

Fechar em sequencia os subcasos restantes da familia midia/cadastro que ainda permitiam evidencia historica ou contrato permissivo para copy antiga.

## Base Metodologica

```text
documento_canonico: docs/atendimento-premium/52-premium-operational-chain.md
autonomy_level: 4B
limite: ate 8 micro-slices da mesma onda
regra: HTTP radar primeiro, WhatsApp real definitivo depois, Naturalness V2 quando houver resposta conversacional relevante
level_4c: bloqueado
```

## Motivo Do Ataque

As Waves 36 a 42 revalidaram partes da familia em producao atual, mas alguns contratos ainda estavam com `EXPECTED_COPY_RISK_MAX=medio` ou sem bloqueio explicito da copy antiga. Esta wave fecha a limpeza como pacote final, sem mudar comportamento do bot antes de evidencia atual.

## Escopo

1. `tattoo-media-local-photo`
2. `tattoo-media-ambiguous-photo-clarification`
3. `tattoo-media-ambiguous-confirm-local`
4. `tattoo-media-ambiguous-confirm-reference`
5. `cadastro-after-media-nome-data`
6. `cadastro-after-media-email-recusado-handoff`
7. `cadastro-after-media-email-valido-handoff`
8. `cadastro-after-media-telegram-media-package`

Para cada subcaso: contrato endurecido, HTTP radar PASS, WhatsApp real `central -> bot` PASS e registro em `smoke-runs.md`.

## Fora De Escopo

- alterar copy/prompt sem falha atual;
- agenda, sinal, pagamento ou preco fechado;
- menoridade legal;
- nova camada arquitetural;
- promover para Level 4C.

## Contrato De Limpeza

```text
copy_antiga_bloqueada:
  - Pra liberar teu orcamento
  - liberar teu orcamento
  - Fechado
  - valor certinho
  - avaliar com calma

gates_obrigatorios:
  - tail ativo pelo runner
  - HTTP radar antes do WhatsApp real
  - WhatsApp real novo pela instancia central
  - estado esperado coerente
  - orcid null quando ainda nao houver handoff
  - orcid obrigatorio quando houver handoff
  - midia preservada
  - sem preco fechado, agenda, sinal ou pagamento

excecao_controlada:
  - pedido de e-mail opcional pode manter copy_risk=medio no classificador deterministico atual
  - a limpeza desse ponto depende do FORBIDDEN_BOT_REGEX anti-copy-antiga e da Naturalness V2
```

## Micro-Slices

```text
1. foto local direta: PASS
2. foto ambigua sem legenda: PASS
3. confirmacao ambigua como local: PASS
4. confirmacao ambigua como referencia: PASS
5. nome/data pos-midia: PASS, com excecao controlada para email opcional copy_risk=medio
6. email recusado pos-midia: PASS
7. email valido pos-midia: PASS
8. pacote Telegram com midia: PASS
```

## Validacao Final

```text
http_radar:
  - scenario-tattoo-media-local-photo-20260527T071227Z-2586
  - scenario-tattoo-media-ambiguous-photo-clarification-20260527T071324Z-8251
  - scenario-tattoo-media-ambiguous-confirm-local-20260527T071423Z-4830
  - scenario-tattoo-media-ambiguous-confirm-reference-20260527T071518Z-2742
  - scenario-cadastro-after-media-nome-data-20260527T071723Z-3962
  - scenario-cadastro-after-media-email-recusado-handoff-20260527T071852Z-26504
  - scenario-cadastro-after-media-email-valido-handoff-20260527T071954Z-28419
  - scenario-cadastro-after-media-telegram-media-package-20260527T072057Z-24824

whatsapp_real:
  - scenario-whatsapp-real-tattoo-media-local-photo-20260527T071256Z-19985
  - scenario-whatsapp-real-tattoo-media-ambiguous-photo-clarification-20260527T071355Z-23833
  - scenario-whatsapp-real-tattoo-media-ambiguous-confirm-local-20260527T071449Z-11325
  - scenario-whatsapp-real-tattoo-media-ambiguous-confirm-reference-20260527T071546Z-26077
  - scenario-whatsapp-real-cadastro-after-media-nome-data-20260527T071805Z-4542
  - scenario-whatsapp-real-cadastro-after-media-email-recusado-handoff-20260527T071921Z-9261
  - scenario-whatsapp-real-cadastro-after-media-email-valido-handoff-20260527T072025Z-2940
  - scenario-whatsapp-real-cadastro-after-media-telegram-media-package-20260527T072129Z-24844

naturalness_v2: 8 PASS / 0 watchlist / 0 rework / 0 stop / media 2.86
```

## Falha Util

```text
run_id: scenario-cadastro-after-media-nome-data-20260527T071614Z-8891
classe: contrato excessivamente rigido
motivo: pedido de e-mail opcional e marcado como copy_risk=medio pelo classificador deterministico atual
decisao: aceitar medio somente nesse step, mantendo forbidden regex contra copy antiga e validando Naturalness V2
```

## Provas Conclusivas Reais

```text
Cliente: "segue foto do local" + imagem
Bot: "Recebi a foto do local. Agora me passa teu nome completo pra eu montar o cadastro."

Cliente: imagem sem legenda
Bot: "Vi a imagem, mas fiquei em dúvida se ela é referência do desenho ou o local do corpo. Qual dos dois fica valendo?"

Cliente: "é local do corpo"
Bot: "Perfeito, vou usar essa imagem como foto do local. Me passa nome completo e data de nascimento pra eu montar o cadastro?"

Cliente: "é referência do desenho"
Bot: "Perfeito, deixei essa imagem como referência do desenho. Agora me manda a foto do local onde tu quer tatuar."

Cliente: "12/03/1995"
Bot: "Se quiser, me passa teu e-mail. Se preferir seguir só por aqui, tudo certo."

Cliente: "pode seguir sem email" + "quanto tempo demora?"
Bot: "O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.\n\nBoa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor."

Cliente: "joao@example.com"
Bot: "Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor."
```

## Stop Conditions

- qualquer FAIL em HTTP radar;
- qualquer FAIL em WhatsApp real;
- divergencia entre HTTP e WhatsApp real;
- resposta com copy antiga bloqueada;
- perda de foto local ou referencia;
- criacao indevida de `orcid`;
- ausencia de `orcid` em handoff;
- falha Telegram/mediaGroup/pipeline no pacote de midia;
- Naturalness V2 REWORK/STOP.

## Status

```text
status: PASS
decisao: limpeza final de subcasos midia/cadastro concluida com HTTP radar, WhatsApp real e Naturalness V2
proximo_ataque_sugerido: revisar se a familia midia/cadastro pode ser marcada como fechada na cobertura atual e escolher nova frente premium
```
