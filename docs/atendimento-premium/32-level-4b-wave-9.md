# Level 4B Wave 9

Nona onda em Level 4B. A Wave 8 validou recusa de email apos midia. Esta onda fecha a variante complementar: email valido informado apos midia deve disparar o mesmo handoff de orcamento, preservando foto local e referencias.

## Declaracao

```text
onda_id: level4b-wave-9-post-media-valid-email-handoff
objetivo: validar email valido apos midia e handoff de orcamento preservando foto local e referencias
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
- cliente informa email valido;
- estado final vira `aguardando_tatuador`;
- `orcid` deve ser criado;
- pacote de midia deve permanecer no registro da conversa;
- Workflow Manager deve registrar handoff package v1.

Fora do escopo:

- recusa de email, ja fechada na Wave 8;
- novo fluxo de preco;
- agenda, sinal, pagamento ou remarcacao;
- menoridade;
- migrations;
- secrets;
- tenant real amplo;
- promocao para 4C.

## Micro-Slices Planejados

1. `post-media-valid-email-contract`: declarar contrato, teste e cenarios.
2. `post-media-valid-email-http`: validar email por HTTP radar.
3. `post-media-valid-email-whatsapp-real`: validar cadeia real `central -> bot`.
4. `level4b-wave-9-closeout`: gates finais e decisao manter/expandir/rebaixar.

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
- `dados_cadastro.email=joao@example.com`;
- `email_recusado` nao deve ser `true`;
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
- bot repetir pedido de nome/data/foto/local/referencia/email;
- perder `foto_local_msg_id` ou `refs_imagens_msg_ids`;
- marcar `email_recusado=true` quando email valido foi informado;
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
cliente: "joao@example.com"
bot: confirma envio ao tatuador
estado_final: aguardando_tatuador
orcid: criado
```

## Resultado Fechado

```text
status: PASS
commit_funcional: b8e58bf test: cover post-media valid email handoff
micro_slice_1: post-media-valid-email-contract PASS
micro_slice_2: post-media-valid-email-http PASS
micro_slice_3: post-media-valid-email-whatsapp-real PASS
micro_slice_4: level4b-wave-9-closeout PASS
autonomy_level: 4B
max_batch_size: 8
promocao_4c: bloqueada
```

## Evidencias

```text
tests_focados: node --test tests/_lib/whatsapp-pipeline.test.mjs PASS 66/66
tests_local: npm test PASS 1194/1194
ci: PASS
deploy: PASS
http_radar: scenario-cadastro-after-media-email-valido-handoff-20260526T075219Z-32176 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-after-media-email-valido-handoff-20260526T075330Z-15358 PASS
cadeia_real: Evolution central -> bot 5545999012357
estado_final: aguardando_tatuador
orcid: criado
copy_risk_final: baixo
dados_coletados: descricao_curta=rosa, estilo=fineline, local_corpo=antebraco, altura_cm=170, foto_local_msg_id=12632, refs_imagens_msg_ids=[11951], tentativas_foto_local=1
dados_cadastro: nome=Joao Silva, data_nascimento=1995-03-12, email=joao@example.com
workflow: cadastro_and_tattoo_complete, handoff_package_v1, trace hp_*
```

## Provas Conclusivas Reais

```text
Cliente: "joao@example.com"
Bot: "Fechado, Joao! O tatuador vai avaliar com calma e eu te retorno em breve com o valor certinho."
```

## Nota De Processo

```text
tentativa_dns_local: scenario-cadastro-after-media-email-valido-handoff-20260526T075101Z-13211
classe: falha_ambiente_local_dns
efeito: nao enviou mensagem, falhou no cleanup antes do setup
acao: repetido com execucao de rede liberada
status_pos_repeticao: HTTP radar e WhatsApp real passaram
```

## Decisao

Manter Level 4B. A onda confirmou que o cadastro pos-midia fecha tambem com email valido, cria `orcid`, preserva foto local e referencias, nao marca `email_recusado` indevidamente e registra Router + Workflow Manager com `handoff_package_v1`. O proximo ataque mais coerente e auditar o pacote Telegram com midia no handoff.
