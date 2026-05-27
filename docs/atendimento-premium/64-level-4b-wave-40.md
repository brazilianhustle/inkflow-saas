# Level 4B - Wave 40 - Revalidacao Pacote Telegram Com Midia

## Objetivo

Revalidar em producao atual que o handoff de orcamento com midia entrega o pacote operacional ao tatuador pelo Telegram, preservando `foto_local_file_id`, referencias, `orcid`, observabilidade do Workflow Manager e tail de envio de fotos.

## Base Metodologica

```text
documento_canonico: docs/atendimento-premium/52-premium-operational-chain.md
zona: vermelha operacional controlada, por envolver Telegram do tatuador
regra: sem mudanca de codigo antes de evidencia atual; HTTP radar antes de WhatsApp real
autonomy_level: 4B
level_4c: bloqueado
```

## Motivo Do Ataque

As Waves 38 e 39 provaram handoff e pos-handoff na conversa real. O proximo risco premium e a entrega operacional ao tatuador: se o cliente conclui cadastro com midia, o estúdio precisa receber fotos e contexto corretamente, sem depender apenas da conversa com o cliente.

## Escopo

- `cadastro-after-media-telegram-media-package` HTTP radar;
- `whatsapp-real-cadastro-after-media-telegram-media-package` definitivo;
- seed com midia fresca aguardando e-mail;
- email valido como fechamento de cadastro;
- `fotos-orcamento-enviadas` no tail;
- `foto_local_file_id` e `refs_imagens_file_ids` persistidos;
- Workflow Manager com `handoff_package_v1`;
- Naturalness V2 nos artifacts atuais.

## Fora De Escopo

- mudar copy antes de falha atual;
- testar agenda, sinal, pagamento ou preco fechado;
- ampliar para lote de Telegram;
- promover Level 4C.

## Micro-Slice 1 - Pacote Telegram Com Midia Fresca

```text
status: PASS
http_radar: scenario-cadastro-after-media-telegram-media-package-20260527T064309Z-25394
whatsapp_real_novo: scenario-whatsapp-real-cadastro-after-media-telegram-media-package-20260527T064346Z-9484
estado_final: aguardando_tatuador
orcid_http: orc_fxaie4
orcid_real: orc_xkw5i5
tail: fotos-orcamento-enviadas confirmado
foto_local_file_id: presente
refs_imagens_file_ids: 1 item
workflow_manager: cadastro_and_tattoo_complete
handoff_package: handoff_package_v1
naturalness_v2: 2 PASS / 0 watchlist / 0 rework / 0 stop
```

## Validacao Final

```text
codigo_alterado: nao
http_radar: PASS
whatsapp_real: PASS
naturalness_v2: PASS
estado_final: aguardando_tatuador
orcid: orc_xkw5i5
tail_gate: PASS
telegram_media: fotos enviadas sem erro de tail
```

## Provas Conclusivas Reais

```text
Cliente: "joao@example.com"
Bot: "Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor."

Evidencia operacional: tail confirmou `fotos-orcamento-enviadas`, com `foto_local_file_id` e `refs_imagens_file_ids` persistidos no handoff.
```

## Decisao

```text
status: PASS
decisao: pacote Telegram com midia revalidado em HTTP radar e WhatsApp real definitivo
mudanca_de_codigo: nao necessaria
proximo_ataque_sugerido: escolher nova frente pequena fora de Telegram ou abrir auditoria read-only de cobertura restante
```

## Gates

- tail ativo pelo runner;
- HTTP radar PASS antes do WhatsApp real;
- WhatsApp real novo `central -> bot`;
- estado final `aguardando_tatuador`;
- `orcid` criado;
- e-mail valido persistido;
- `foto_local_file_id` presente;
- `refs_imagens_file_ids` com pelo menos um item;
- tail confirma envio de fotos ao Telegram;
- tail sem `telegram-4xx/5xx`, `mediaGroup falhou`, `pipeline batch failed` ou `unhandled`;
- Workflow Manager `cadastro_and_tattoo_complete` com `handoff_package_v1`;
- Naturalness V2 PASS ou diagnostico antes de avancar.

## Stop Conditions

- WhatsApp real ausente;
- HTTP PASS usado como validacao definitiva;
- Telegram falhar ou tail nao confirmar envio de fotos;
- estado final diferente de `aguardando_tatuador`;
- `orcid` ausente;
- file ids de midia ausentes;
- preco, agenda, sinal ou pagamento;
- Naturalness V2 REWORK/STOP;
- divergencia HTTP vs WhatsApp real.
