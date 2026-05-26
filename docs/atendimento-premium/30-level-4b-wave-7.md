# Level 4B Wave 7

Setima onda em Level 4B. A Wave 6 validou que referencia confirmada seguida de foto local avanca para cadastro. Esta onda valida o cadastro pos-midia: nome e data devem ser aceitos sem voltar para a coleta de tattoo e sem perder as imagens.

## Declaracao

```text
onda_id: level4b-wave-7-cadastro-after-media
objetivo: validar que cadastro pos-midia preserva foto local e referencias enquanto coleta nome/data
familia: cadastro, media-intake, workflow-manager, observabilidade
risco: amarelo
janela: Level 4B, ate 8 micro-slices
4c: bloqueado
```

## Escopo

Dentro do escopo:

- conversa em `coletando_cadastro` apos foto local;
- `foto_local_msg_id` ja presente;
- `refs_imagens_msg_ids` ja presente;
- cliente envia nome completo;
- cliente envia data de nascimento;
- dados de midia permanecem intactos;
- estado permanece `coletando_cadastro`;
- `orcid` permanece `null`;
- HTTP multi-turn antes de WhatsApp real multi-turn definitivo.

Fora do escopo:

- email e handoff de orcamento;
- menoridade;
- preco, desconto, sinal, pagamento ou agenda;
- tenant real amplo;
- migrations;
- secrets;
- promocao para 4C.

## Micro-Slices Planejados

1. `cadastro-after-media-wave-contract`: declarar contrato, setup, teste e cenarios.
2. `cadastro-after-media-nome-data-http`: validar nome/data por HTTP multi-turn.
3. `cadastro-after-media-nome-data-whatsapp-real`: validar nome/data pela cadeia real `central -> bot`.
4. `level4b-wave-7-closeout`: gates finais e recomendacao manter/expandir/rebaixar.

## Criterios De Pronto

- `wave-health.sh` PASS antes e depois;
- teste local relevante PASS;
- CI PASS quando houver commit;
- deploy PASS quando houver commit;
- HTTP radar PASS antes de WhatsApp real;
- WhatsApp real definitivo PASS;
- `copy_risk` nunca `alto`;
- `foto_local_msg_id=12632` preservado;
- `refs_imagens_msg_ids=[11951]` preservado;
- `dados_cadastro.nome="Joao Silva"`;
- `dados_cadastro.data_nascimento="1995-03-12"`;
- `orcid` permanece `null`;
- 4C continua bloqueado.

## Stop Conditions

Parar a onda se ocorrer:

- CI FAIL;
- deploy FAIL;
- HTTP radar FAIL;
- WhatsApp real FAIL;
- `copy_risk=alto`;
- bot repetir pedido de foto/local/referencia;
- perder `foto_local_msg_id` ou `refs_imagens_msg_ids`;
- criar `orcid` ou handoff/orcamento antes do email;
- tocar preco, sinal, pagamento, agenda, secrets ou migrations.

## Fluxo Alvo

```text
setup: seed_cadastro_pos_midia_aguardando_nome
estado_inicial: coletando_cadastro
dados_iniciais:
  descricao_curta: rosa
  estilo: fineline
  local_corpo: antebraco
  altura_cm: 170
  foto_local_msg_id: 12632
  refs_imagens_msg_ids: [11951]
cliente_1: "Joao Silva"
bot_1: pede data de nascimento
cliente_2: "12/03/1995"
bot_2: pede email opcional
estado_final: coletando_cadastro
orcid: null
```

## Resultado Atual

```text
status: wave declarada
micro_slice_1: cadastro-after-media-wave-contract em andamento
autonomy_level: 4B
max_batch_size: 8
promocao_4c: bloqueada
```
