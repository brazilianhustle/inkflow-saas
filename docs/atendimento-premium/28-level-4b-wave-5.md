# Level 4B Wave 5

Quinta onda em Level 4B. A Wave 4 validou a entrada de midia e abriu uma pergunta de classificacao para foto ambigua. Esta onda valida a resposta seguinte do cliente.

## Declaracao

```text
onda_id: level4b-wave-5-ambiguous-media-confirmation
objetivo: confirmar foto ambigua como local ou referencia sem perder dados, sem chamar LLM para resposta curta e sem criar orcamento/handoff indevido
familia: coleta-tattoo, media-intake, workflow-manager, observabilidade
risco: amarelo
janela: Level 4B, ate 8 micro-slices
4c: bloqueado
```

## Escopo

Dentro do escopo:

- cliente responde que a imagem ambigua e foto do local;
- cliente responde que a imagem ambigua e referencia do desenho;
- o pipeline promove a ultima referencia ambigua para `foto_local_msg_id` quando o cliente confirma local;
- o pipeline preserva `refs_imagens_msg_ids` e pede foto do local quando o cliente confirma referencia;
- HTTP radar antes de WhatsApp real definitivo;
- provas conclusivas reais no fechamento de cada comportamento conversacional.

Fora do escopo:

- leitura visual ampla;
- preco, desconto, sinal, pagamento ou agenda;
- tenant real amplo;
- migrations;
- secrets;
- promocao para 4C.

## Micro-Slices Planejados

1. `ambiguous-confirmation-wave-contract`: declarar contrato, setup e cenarios.
2. `tattoo-media-ambiguous-confirm-local-http`: confirmar foto ambigua como local via HTTP.
3. `tattoo-media-ambiguous-confirm-local-whatsapp-real`: validar local pela cadeia real `central -> bot`.
4. `tattoo-media-ambiguous-confirm-reference-http`: confirmar foto ambigua como referencia via HTTP.
5. `tattoo-media-ambiguous-confirm-reference-whatsapp-real`: validar referencia pela cadeia real.
6. `level4b-wave-5-closeout`: gates finais e recomendacao manter/expandir/rebaixar.

## Criterios De Pronto

- `wave-health.sh` PASS antes e depois;
- testes locais relevantes PASS;
- CI PASS quando houver commit;
- deploy PASS quando houver commit;
- HTTP radar PASS antes de WhatsApp real;
- WhatsApp real definitivo PASS para cada comportamento conversacional;
- `copy_risk` nunca `alto`;
- estado final e dados persistidos corretos;
- `orcid` permanece `null`;
- 4C continua bloqueado.

## Stop Conditions

Parar a onda se ocorrer:

- CI FAIL;
- deploy FAIL;
- HTTP radar FAIL;
- WhatsApp real FAIL;
- `copy_risk=alto`;
- resposta curta cair em LLM por caminho deterministico esperado;
- foto confirmada como local nao virar `foto_local_msg_id`;
- referencia confirmada virar foto local indevidamente;
- criar `orcid` ou handoff/orcamento indevido;
- tocar preco, sinal, pagamento, agenda, secrets ou migrations.

## Primeiro Fluxo Alvo

```text
setup: seed_tattoo_foto_ambigua_aguardando_confirmacao
cliente: "é local do corpo"
estado_final: coletando_cadastro
dados_esperados:
  descricao_curta: rosa
  estilo: fineline
  local_corpo: antebraco
  altura_cm: 170
  foto_local_msg_id: 11951
  refs_imagens_msg_ids: [11951]
bot: confirma que vai usar a imagem como foto do local e pede nome/data
```

## Segundo Fluxo Alvo

```text
setup: seed_tattoo_foto_ambigua_aguardando_confirmacao
cliente: "é referência do desenho"
estado_final: coletando_tattoo
dados_esperados:
  descricao_curta: rosa
  estilo: fineline
  local_corpo: antebraco
  altura_cm: 170
  foto_local_msg_id: null
  refs_imagens_msg_ids: [11951]
  tentativas_foto_local: 1
bot: preserva referencia e pede foto do local
```

## Resultado Atual

```text
status: wave fechada
micro_slice_1: ambiguous-confirmation-wave-contract PASS
micro_slice_2: tattoo-media-ambiguous-confirm-local-http PASS
micro_slice_3: tattoo-media-ambiguous-confirm-local-whatsapp-real PASS
micro_slice_4: tattoo-media-ambiguous-confirm-reference-http PASS
micro_slice_5: tattoo-media-ambiguous-confirm-reference-whatsapp-real PASS
micro_slice_6: level4b-wave-5-closeout PASS
autonomy_level: 4B
max_batch_size: 8
promocao_4c: bloqueada
```

## Evidencias - Confirmar Como Local

```text
commit_fix: 6c900d2 fix: confirm ambiguous tattoo media
tests_local: npm test PASS, 1189/1189
ci: PASS
deploy: PASS
http_radar: scenario-tattoo-media-ambiguous-confirm-local-20260526T070539Z-16476 PASS
whatsapp_real: scenario-whatsapp-real-tattoo-media-ambiguous-confirm-local-20260526T070618Z-15645 PASS
cadeia_real: Evolution central -> bot 5545999012357
cliente: "é local do corpo"
bot: "Perfeito, então vou usar essa imagem como foto do local. Pra liberar teu orçamento personalizado, me passa nome completo e data de nascimento?"
estado_final: coletando_cadastro
orcid: null
foto_local_msg_id: 11951
refs_imagens_msg_ids: [11951]
copy_risk: baixo
```

### Provas Conclusivas Reais

```text
Cliente: "é local do corpo"
Bot: "Perfeito, então vou usar essa imagem como foto do local. Pra liberar teu orçamento personalizado, me passa nome completo e data de nascimento?"
```

## Evidencias - Confirmar Como Referencia

```text
commit_fix: 6c900d2 fix: confirm ambiguous tattoo media
tests_local: npm test PASS, 1189/1189
ci: PASS
deploy: PASS
http_radar: scenario-tattoo-media-ambiguous-confirm-reference-20260526T070726Z-11122 PASS
whatsapp_real: scenario-whatsapp-real-tattoo-media-ambiguous-confirm-reference-20260526T070803Z-28038 PASS
cadeia_real: Evolution central -> bot 5545999012357
cliente: "é referência do desenho"
bot: "Perfeito, deixei essa imagem como referência do desenho. Agora preciso da foto do local do corpo onde tu quer tatuar."
estado_final: coletando_tattoo
orcid: null
foto_local_msg_id: null
refs_imagens_msg_ids: [11951]
tentativas_foto_local: 1
copy_risk: baixo
```

### Provas Conclusivas Reais

```text
Cliente: "é referência do desenho"
Bot: "Perfeito, deixei essa imagem como referência do desenho. Agora preciso da foto do local do corpo onde tu quer tatuar."
```

## Closeout

```text
micro_slice: level4b-wave-5-closeout
status: PASS
wave_health: PASS
autonomy_gate: PASS, keep
security_gate: PASS
dependabot_open_alerts: 0
evidence_orphan_gate: PASS com WARN historico nao bloqueante
decisao_autonomia: manter Level 4B
4c: bloqueado
proximo_alvo: declarar proxima onda funcional leve
```

### Evidence Summary

| Run ID | Tipo | Resultado | Estado Final | ORCID | Copy Risk |
|---|---|---:|---|---|---|
| `scenario-whatsapp-real-tattoo-media-ambiguous-confirm-local-20260526T070618Z-15645` | WhatsApp real | PASS | `coletando_cadastro` | `null` | `baixo` |
| `scenario-whatsapp-real-tattoo-media-ambiguous-confirm-reference-20260526T070803Z-28038` | WhatsApp real | PASS | `coletando_tattoo` | `null` | `baixo` |

### Decisao Estrategica

Wave 5 fechou o ciclo aberto pela Wave 4. A classificacao ambigua agora tem ida e volta: imagem sem legenda pede classificacao, confirmacao como local promove para `foto_local_msg_id`, e confirmacao como referencia preserva a referencia e pede foto do local. A resposta curta e resolvida pelo pipeline sem LLM.
