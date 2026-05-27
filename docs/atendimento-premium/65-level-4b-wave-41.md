# Level 4B - Wave 41 - Revalidacao Referencia Apos Foto Local

## Objetivo

Revalidar em producao atual que, quando a foto do local ja existe, uma nova imagem enviada pelo cliente entra como referencia do desenho, preserva a foto local, nao cria orcamento e retoma cadastro com copy atual, sem `Pra liberar teu orçamento`.

## Base Metodologica

```text
documento_canonico: docs/atendimento-premium/52-premium-operational-chain.md
regra: evidencia antiga com copy historica nao fecha comportamento atual
autonomy_level: 4B
level_4c: bloqueado
```

## Motivo Do Ataque

As Waves 36 e 37 validaram imagem ambigua e confirmacao local/referencia. A lacuna restante e o subcaso inverso: foto local ja existe e o cliente envia uma referencia adicional antes do cadastro. A evidencia principal e de 2026-05-26 e ainda mostra copy historica `Pra liberar teu orçamento`, entao precisa de revalidacao atual.

## Escopo

- fortalecer contrato dos scenarios `tattoo-media-reference-after-local`;
- HTTP radar;
- WhatsApp real definitivo `central -> bot`;
- imagem real via Evolution;
- preservacao de `foto_local_msg_id`;
- inclusao de nova referencia em `refs_imagens_msg_ids`;
- estado final `coletando_cadastro`;
- Naturalness V2 nos artifacts atuais.

## Fora De Escopo

- mudar copy antes de falha atual;
- handoff/orcamento nesta wave;
- Telegram;
- agenda, sinal, pagamento ou preco fechado;
- promover Level 4C.

## Micro-Slice 1 - Referencia Depois Da Foto Local

```text
status: PASS
http_radar: scenario-tattoo-media-reference-after-local-20260527T065214Z-28690
whatsapp_real_novo: scenario-whatsapp-real-tattoo-media-reference-after-local-20260527T065246Z-14230
estado_final: coletando_cadastro
orcid: null
foto_local_msg_id: 599 preservado
refs_imagens_msg_ids: 1 item novo
copy_antiga_bloqueada_na_resposta_atual: Pra liberar teu orçamento
naturalness_v2: 2 PASS / 0 watchlist / 0 rework / 0 stop
```

## Validacao Final

```text
codigo_alterado: nao
contrato_alterado: sim, para bloquear copy antiga no bot atual
http_radar: PASS
whatsapp_real: PASS
naturalness_v2: PASS
estado_final: coletando_cadastro
orcid: null
```

## Provas Conclusivas Reais

```text
Cliente: "essa é referência do desenho" + imagem
Bot: "Recebi essa referência também. Agora me passa teu nome completo pra eu montar o cadastro."
```

## Observacao Sobre Seed

```text
O setup ainda contem uma mensagem historica anterior ao humano com `Pra liberar teu orçamento`.
Essa mensagem nao foi emitida pelo bot atual nesta validacao. O gate anti-copy-antiga foi aplicado sobre a resposta nova apos o humano e passou em HTTP + WhatsApp real.
```

## Decisao

```text
status: PASS
decisao: referencia adicional apos foto local validada em HTTP radar e WhatsApp real definitivo
mudanca_de_codigo: nao necessaria
proximo_ataque_sugerido: continuar auditoria de subcasos de midia/cadastro com evidencia antiga ou abrir nova frente pequena de cobertura restante
```

## Gates

- tail ativo pelo runner;
- HTTP radar PASS antes do WhatsApp real;
- WhatsApp real novo `central -> bot`;
- estado final `coletando_cadastro`;
- `orcid=null`;
- `foto_local_msg_id=599` preservado;
- `refs_imagens_msg_ids` com 1 item;
- dados de tattoo preservados;
- bot nao pede foto do local de novo;
- bot nao usa `Pra liberar teu orçamento`;
- sem preco, agenda, sinal ou pagamento;
- Naturalness V2 PASS ou diagnostico antes de avancar.

## Stop Conditions

- WhatsApp real ausente;
- referencia sobrescrever foto local;
- perda de dados de tattoo;
- criacao indevida de `orcid`;
- copy antiga `Pra liberar teu orçamento`;
- preco, agenda, sinal ou pagamento;
- Naturalness V2 REWORK/STOP;
- divergencia HTTP vs WhatsApp real.
