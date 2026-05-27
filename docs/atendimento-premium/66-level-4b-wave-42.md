# Level 4B - Wave 42 - Revalidacao Referencia Confirmada Depois Foto Local

## Objetivo

Revalidar em producao atual que, apos o cliente confirmar uma imagem como referencia, a proxima imagem enviada como foto do local vira `foto_local_msg_id`, preserva a referencia anterior e retoma cadastro com copy atual, sem `Pra liberar teu orçamento`.

## Base Metodologica

```text
documento_canonico: docs/atendimento-premium/52-premium-operational-chain.md
regra: limpar subcasos de midia/cadastro com evidencia historica de copy antiga
autonomy_level: 4B
level_4c: bloqueado
```

## Motivo Do Ataque

A Wave 41 limpou o subcaso `foto local existente -> referencia adicional`. A variação irmã e `referencia confirmada -> foto local`. Ela já teve revalidação intermediária com copy atual, mas o contrato ainda permitia passar sem bloquear explicitamente a copy antiga. Esta wave fecha o subcaso com contrato mais rígido e WhatsApp real novo.

## Escopo

- fortalecer contrato dos scenarios `tattoo-media-reference-then-local`;
- HTTP radar;
- WhatsApp real definitivo `central -> bot`;
- imagem real via Evolution;
- preservacao de `refs_imagens_msg_ids=[11951]`;
- criacao de `foto_local_msg_id`;
- estado final `coletando_cadastro`;
- Naturalness V2 nos artifacts atuais.

## Fora De Escopo

- mudar copy antes de falha atual;
- handoff/orcamento nesta wave;
- Telegram;
- agenda, sinal, pagamento ou preco fechado;
- promover Level 4C.

## Micro-Slice 1 - Referencia Confirmada Depois Foto Local

```text
status: PASS
http_radar: scenario-tattoo-media-reference-then-local-20260527T065904Z-7743
whatsapp_real_novo: scenario-whatsapp-real-tattoo-media-reference-then-local-20260527T065936Z-25142
estado_final: coletando_cadastro
orcid: null
refs_imagens_msg_ids: [11951] preservado
foto_local_msg_id: novo id criado
copy_antiga_bloqueada: Pra liberar teu orçamento
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
Cliente: "segue foto do local" + imagem
Bot: "Recebi a foto do local. Agora me passa teu nome completo pra eu montar o cadastro."
```

## Decisao

```text
status: PASS
decisao: referencia confirmada seguida de foto local validada em HTTP radar e WhatsApp real definitivo
mudanca_de_codigo: nao necessaria
proximo_ataque_sugerido: continuar limpeza de subcasos de midia/cadastro com evidencia antiga ou revisar cobertura restante antes de nova frente
```

## Gates

- tail ativo pelo runner;
- HTTP radar PASS antes do WhatsApp real;
- WhatsApp real novo `central -> bot`;
- estado final `coletando_cadastro`;
- `orcid=null`;
- `refs_imagens_msg_ids=[11951]` preservado;
- `foto_local_msg_id` criado;
- dados de tattoo preservados;
- bot nao pede foto do local de novo;
- bot nao usa `Pra liberar teu orçamento`;
- sem preco, agenda, sinal ou pagamento;
- Naturalness V2 PASS ou diagnostico antes de avancar.

## Stop Conditions

- WhatsApp real ausente;
- foto local virar referencia duplicada;
- perda da referencia anterior;
- perda de dados de tattoo;
- criacao indevida de `orcid`;
- copy antiga `Pra liberar teu orçamento`;
- preco, agenda, sinal ou pagamento;
- Naturalness V2 REWORK/STOP;
- divergencia HTTP vs WhatsApp real.
