# Level 4B - Wave 34 - Revalidacao Pergunta De Imagem Atual

## Objetivo

Revalidar a familia `pergunta_imagem` em producao atual, cobrindo o caso sem midia disponivel e o caso com midia real, usando HTTP radar primeiro e WhatsApp real novo como validacao definitiva.

## Base Metodologica

```text
documento_canonico: docs/atendimento-premium/52-premium-operational-chain.md
regra: comportamento conversacional atual exige WhatsApp real novo quando a evidencia antiga e anterior a mudancas recentes
autonomy_level: 4B
level_4c: bloqueado
```

## Motivo Do Ataque

A familia de imagem tem evidencias reais aprovadas, mas parte delas e antiga e outra parte foi gerada antes das ultimas revalidacoes estruturais. Como imagem impacta a confianca do cliente e pode cair em resposta generica, a estrategia correta e revalidar os dois cortes principais com evidencia atual.

## Escopo

- `lateral-pergunta-imagem-sem-midia` HTTP radar;
- `whatsapp-real-lateral-pergunta-imagem-sem-midia` definitivo;
- `voice-policy-first-contact-image-question` HTTP radar com imagem;
- `whatsapp-real-voice-policy-first-contact-image-question` definitivo com imagem;
- Naturalness V2 nos artifacts atuais;
- registro curto de provas reais.

## Fora De Escopo

- alterar modelo de visao ou OCR;
- interpretar artisticamente imagem real;
- alterar prompt geral do Agent;
- mexer em portfolio, preco, agenda, sinal ou pagamento;
- promover Level 4C.

## Micro-Slice 1 - Pergunta Sem Midia

```text
status: PASS
http_radar: scenario-lateral-pergunta-imagem-sem-midia-20260527T055411Z-1581
whatsapp_real_novo: scenario-whatsapp-real-lateral-pergunta-imagem-sem-midia-20260527T055437Z-22614
estado_final: coletando_tattoo
orcid: null
copy_risk: baixo
```

## Micro-Slice 2 - Pergunta Com Midia

```text
status: PASS
http_radar: scenario-voice-policy-first-contact-image-question-20260527T055505Z-20392
whatsapp_real_novo: scenario-whatsapp-real-voice-policy-first-contact-image-question-20260527T055531Z-25979
estado_final: coletando_tattoo
orcid: null
copy_risk: baixo
media_persistida: refs_imagens_msg_ids presente
```

## Validacao Final

```text
codigo_alterado: nao
http_radar_sem_midia: PASS
whatsapp_real_sem_midia: PASS
http_radar_com_midia: PASS
whatsapp_real_com_midia: PASS
naturalness_v2: 4 PASS / 0 watchlist / 0 rework / 0 stop
estado_final: coletando_tattoo
orcid: null
```

## Provas Conclusivas Reais

```text
Sem midia:
Cliente: "o que você viu na imagem?"
Bot: "Oii, tudo bem. Consigo te ajudar, mas não estou vendo uma imagem clara aqui. Pode mandar a foto de novo?"

Com midia:
Cliente: "o que você viu na imagem?" + imagem
Bot: "Oii, tudo bem. Vi a imagem, mas fiquei em dúvida se ela é referência do desenho ou o local do corpo. Qual dos dois fica valendo?"
```

## Decisao

```text
status: PASS
decisao: familia pergunta_imagem atual validada em HTTP radar e WhatsApp real novo
mudanca_de_codigo: nao necessaria
proximo_ataque_sugerido: historia de vida/homenagem ou outra familia lateral com evidencia antiga
```

## Gates

- tail ativo pelo runner;
- HTTP radar PASS antes do WhatsApp real de cada corte;
- WhatsApp real novo `central -> bot`;
- estado final `coletando_tattoo`;
- `orcid=null`;
- sem preco fechado, agenda, sinal ou pagamento;
- sem apresentacao mecanica `Me chamo`/`muito prazer`;
- sem pedir campos desconectados quando a pergunta e sobre imagem;
- Naturalness V2 PASS ou diagnostico antes de avancar.

## Stop Conditions

- WhatsApp real ausente;
- resposta generica de formulario desconectado;
- pedido de preco, agenda, sinal ou pagamento;
- estado incoerente;
- Naturalness V2 REWORK/STOP;
- divergencia HTTP vs WhatsApp real.
