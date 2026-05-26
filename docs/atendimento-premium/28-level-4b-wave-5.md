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
status: wave declarada
micro_slice_1: ambiguous-confirmation-wave-contract em andamento
autonomy_level: 4B
max_batch_size: 8
promocao_4c: bloqueada
```
