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

## Resultado Fechado

```text
status: PASS
commit_funcional: 4f90480 test: cover post-media email handoff
micro_slice_1: post-media-email-handoff-contract PASS
micro_slice_2: post-media-email-handoff-http PASS
micro_slice_3: post-media-email-handoff-whatsapp-real PASS
micro_slice_4: level4b-wave-8-closeout PASS
autonomy_level: 4B
max_batch_size: 8
promocao_4c: bloqueada
```

## Evidencias

```text
tests_focados: node --test tests/_lib/whatsapp-pipeline.test.mjs PASS 65/65
tests_local: npm test PASS 1193/1193
ci: PASS
deploy: PASS
http_radar: scenario-cadastro-after-media-email-recusado-handoff-20260526T074229Z-13531 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-after-media-email-recusado-handoff-20260526T074321Z-12642 PASS
cadeia_real: Evolution central -> bot 5545999012357
estado_final: aguardando_tatuador
orcid: criado
copy_risk_final: baixo
dados_coletados: descricao_curta=rosa, estilo=fineline, local_corpo=antebraco, altura_cm=170, foto_local_msg_id=12632, refs_imagens_msg_ids=[11951], tentativas_foto_local=1
dados_cadastro: nome=Joao Silva, data_nascimento=1995-03-12, email=null, email_recusado=true
workflow: cadastro_and_tattoo_complete, handoff_package_v1, trace hp_*
```

## Provas Conclusivas Reais

```text
Cliente: "pode seguir sem email
quanto tempo demora?"

Bot: "O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.

Fechado, Joao! O tatuador vai avaliar com calma e eu te retorno em breve com o valor certinho."
```

## Nota De Processo

```text
tentativa_dns_local: scenario-cadastro-after-media-email-recusado-handoff-20260526T074156Z-10437
classe: falha_ambiente_local_dns
efeito: nao enviou mensagem, falhou no cleanup antes do setup
acao: repetido com execucao de rede liberada
status_pos_repeticao: HTTP radar e WhatsApp real passaram
```

## Decisao

Manter Level 4B. A onda confirmou que o cadastro pos-midia fecha o email recusado, responde lateral segura de tempo, cria `orcid`, preserva foto local e referencias e registra o Workflow Manager com `handoff_package_v1`. O proximo ataque deve continuar leve: validar a variante com email real informado apos midia ou iniciar auditoria do pacote enviado ao Telegram quando ha midia.
