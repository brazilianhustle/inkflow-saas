# Level 4B Wave 8

Oitava onda em Level 4B. A Wave 7 validou nome e data apos midia. Esta onda fecha o cadastro pos-midia no ponto de email/recusa de email e valida que o handoff de orcamento preserva o pacote de midia.

## Declaracao

```text
onda_id: level4b-wave-8-post-media-email-handoff
objetivo: validar email/recusa de email apos midia e handoff de orcamento preservando foto local e referencias
familia: cadastro, media-intake, workflow-manager, handoff-package, observabilidade
risco: amarelo
janela: Level 4B, ate 8 micro-slices
4c: bloqueado
```

## Escopo

Dentro do escopo:

- conversa em `coletando_cadastro` apos foto local;
- `foto_local_msg_id=12632` ja presente;
- `refs_imagens_msg_ids=[11951]` ja presente;
- nome e data ja coletados;
- cliente recusa email;
- bot pode responder lateral segura de tempo;
- estado final vira `aguardando_tatuador`;
- `orcid` deve ser criado;
- pacote de midia deve permanecer no registro da conversa;
- Workflow Manager deve registrar handoff package v1.

Fora do escopo:

- novo fluxo de preco;
- agenda, sinal, pagamento ou remarcacao;
- menoridade;
- migrations;
- secrets;
- tenant real amplo;
- promocao para 4C.

## Micro-Slices Planejados

1. `post-media-email-handoff-contract`: declarar contrato, setup, teste e cenarios.
2. `post-media-email-handoff-http`: validar recusa de email por HTTP radar.
3. `post-media-email-handoff-whatsapp-real`: validar cadeia real `central -> bot`.
4. `level4b-wave-8-closeout`: gates finais e decisao manter/expandir/rebaixar.

## Criterios De Pronto

- `wave-health.sh` PASS antes e depois;
- teste local relevante PASS;
- CI PASS quando houver commit;
- deploy PASS quando houver commit;
- HTTP radar PASS antes de WhatsApp real;
- WhatsApp real definitivo PASS;
- `copy_risk` nunca `alto`;
- `estado_agente=aguardando_tatuador`;
- `orcid` criado;
- `email_recusado=true`;
- `foto_local_msg_id=12632` preservado;
- `refs_imagens_msg_ids=[11951]` preservado;
- Workflow Manager registra `workflow_reason=cadastro_and_tattoo_complete`;
- Workflow Manager registra `workflow_handoff_package_version=handoff_package_v1`;
- 4C continua bloqueado.

## Stop Conditions

Parar a onda se ocorrer:

- CI FAIL;
- deploy FAIL;
- HTTP radar FAIL;
- WhatsApp real FAIL;
- `copy_risk=alto`;
- bot repetir pedido de nome/data/foto/local/referencia;
- perder `foto_local_msg_id` ou `refs_imagens_msg_ids`;
- nao criar `orcid` no handoff de orcamento;
- handoff sem observabilidade do Workflow Manager;
- tocar agenda, sinal, pagamento, secrets ou migrations.

## Fluxo Alvo

```text
setup: seed_cadastro_pos_midia_aguardando_email
estado_inicial: coletando_cadastro
dados_iniciais:
  descricao_curta: rosa
  estilo: fineline
  local_corpo: antebraco
  altura_cm: 170
  foto_local_msg_id: 12632
  refs_imagens_msg_ids: [11951]
  nome: Joao Silva
  data_nascimento: 1995-03-12
cliente: "pode seguir sem email\nquanto tempo demora?"
bot: responde tempo com seguranca e confirma envio ao tatuador
estado_final: aguardando_tatuador
orcid: criado
```

## Resultado Atual

```text
status: wave declarada
micro_slice_1: post-media-email-handoff-contract em andamento
autonomy_level: 4B
max_batch_size: 8
promocao_4c: bloqueada
```
