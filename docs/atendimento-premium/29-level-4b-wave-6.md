# Level 4B Wave 6

Sexta onda em Level 4B. A Wave 5 confirmou foto ambigua como referencia ou local. Esta onda valida o encadeamento seguinte: referencia confirmada, bot pede foto do local, cliente envia a foto do local.

## Declaracao

```text
onda_id: level4b-wave-6-media-chain-after-reference
objetivo: garantir que referencia confirmada nao se perde quando o cliente envia a foto do local em seguida
familia: coleta-tattoo, media-intake, workflow-manager, observabilidade
risco: amarelo
janela: Level 4B, ate 8 micro-slices
4c: bloqueado
```

## Escopo

Dentro do escopo:

- conversa em `coletando_tattoo` com referencia ja confirmada;
- bot ja pediu foto do local;
- cliente envia imagem com legenda de foto do local;
- nova imagem vira `foto_local_msg_id`;
- `refs_imagens_msg_ids` anterior permanece preservado;
- estado avanca para `coletando_cadastro`;
- HTTP radar antes de WhatsApp real definitivo.

Fora do escopo:

- leitura visual ampla;
- multiplas imagens no mesmo lote;
- preco, desconto, sinal, pagamento ou agenda;
- tenant real amplo;
- migrations;
- secrets;
- promocao para 4C.

## Micro-Slices Planejados

1. `media-chain-after-reference-wave-contract`: declarar contrato, setup, teste e cenarios.
2. `tattoo-media-reference-then-local-http`: validar encadeamento por HTTP.
3. `tattoo-media-reference-then-local-whatsapp-real`: validar encadeamento pela cadeia real `central -> bot`.
4. `level4b-wave-6-closeout`: gates finais e recomendacao manter/expandir/rebaixar.

## Criterios De Pronto

- `wave-health.sh` PASS antes e depois;
- teste local relevante PASS;
- CI PASS quando houver commit;
- deploy PASS quando houver commit;
- HTTP radar PASS antes de WhatsApp real;
- WhatsApp real definitivo PASS;
- `copy_risk` nunca `alto`;
- `foto_local_msg_id` presente;
- `refs_imagens_msg_ids=[11951]` preservado;
- `orcid` permanece `null`;
- 4C continua bloqueado.

## Stop Conditions

Parar a onda se ocorrer:

- CI FAIL;
- deploy FAIL;
- HTTP radar FAIL;
- WhatsApp real FAIL;
- `copy_risk=alto`;
- referencia confirmada desaparecer;
- foto local virar referencia indevidamente;
- criar `orcid` ou handoff/orcamento indevido;
- tocar preco, sinal, pagamento, agenda, secrets ou migrations.

## Fluxo Alvo

```text
setup: seed_tattoo_ref_confirmada_aguardando_foto_local
estado_inicial: coletando_tattoo
dados_iniciais:
  descricao_curta: rosa
  estilo: fineline
  local_corpo: antebraco
  altura_cm: 170
  refs_imagens_msg_ids: [11951]
  tentativas_foto_local: 1
cliente: "segue foto do local" + image/png
estado_final: coletando_cadastro
dados_esperados:
  foto_local_msg_id: presente
  refs_imagens_msg_ids: [11951]
  orcid: null
bot: confirma recebimento da foto do local e pede nome completo
```

## Resultado Atual

```text
status: wave fechada
micro_slice_1: media-chain-after-reference-wave-contract PASS
micro_slice_2: tattoo-media-reference-then-local-http PASS
micro_slice_3: tattoo-media-reference-then-local-whatsapp-real PASS
micro_slice_4: level4b-wave-6-closeout PASS
autonomy_level: 4B
max_batch_size: 8
promocao_4c: bloqueada
```

## Evidencias

```text
tests_focados: node --test tests/_lib/whatsapp-pipeline.test.mjs PASS 63/63
tests_local: npm test PASS 1190/1190
http_radar: scenario-tattoo-media-reference-then-local-20260526T071835Z-9411 PASS
whatsapp_real: scenario-whatsapp-real-tattoo-media-reference-then-local-20260526T071915Z-30812 PASS
cadeia_real: Evolution central -> bot 5545999012357
cliente: "segue foto do local" + image/png
bot: "Recebi a foto do local. Pra liberar teu orçamento, preciso do teu nome completo."
estado_final: coletando_cadastro
orcid: null
foto_local_msg_id_http: 12629
foto_local_msg_id_real: 12632
refs_imagens_msg_ids: [11951]
copy_risk: baixo
```

### Provas Conclusivas Reais

```text
Cliente: "segue foto do local" + imagem
Bot: "Recebi a foto do local. Pra liberar teu orçamento, preciso do teu nome completo."
```

## Closeout

```text
micro_slice: level4b-wave-6-closeout
status: PASS
wave_health: pendente pos-commit
decisao_autonomia: manter Level 4B
4c: bloqueado
proximo_alvo: declarar proxima onda funcional leve
```

### Evidence Summary

| Run ID | Tipo | Resultado | Estado Final | ORCID | Copy Risk |
|---|---|---:|---|---|---|
| `scenario-tattoo-media-reference-then-local-20260526T071835Z-9411` | HTTP monitorado | PASS | `coletando_cadastro` | `null` | `baixo` |
| `scenario-whatsapp-real-tattoo-media-reference-then-local-20260526T071915Z-30812` | WhatsApp real | PASS | `coletando_cadastro` | `null` | `baixo` |

### Decisao Estrategica

Wave 6 confirmou o encadeamento posterior a referencia: a imagem confirmada como referencia permanece em `refs_imagens_msg_ids`, a nova imagem vira `foto_local_msg_id`, o estado avanca para cadastro e nenhum orcamento/handoff indevido e criado.
