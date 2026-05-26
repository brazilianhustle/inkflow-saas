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

## Resultado Fechado

```text
status: PASS
commit_funcional: b606cad fix: preserve post-media cadastro routing
micro_slice_1: cadastro-after-media-wave-contract PASS
micro_slice_2: cadastro-after-media-nome-data-http PASS
micro_slice_3: cadastro-after-media-nome-data-whatsapp-real PASS
micro_slice_4: level4b-wave-7-closeout PASS
autonomy_level: 4B
max_batch_size: 8
promocao_4c: bloqueada
```

## Evidencias

```text
tests_focados: node --test tests/_lib/conversation-policy.test.mjs tests/_lib/whatsapp-pipeline.test.mjs PASS 70/70
tests_local: npm test PASS 1192/1192
ci: PASS
deploy: PASS
http_radar: scenario-cadastro-after-media-nome-data-20260526T073334Z-32292 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-after-media-nome-data-20260526T073435Z-27846 PASS
cadeia_real: Evolution central -> bot 5545999012357
estado_final: coletando_cadastro
orcid: null
copy_risk_final: medio
dados_coletados: descricao_curta=rosa, estilo=fineline, local_corpo=antebraco, altura_cm=170, foto_local_msg_id=12632, refs_imagens_msg_ids=[11951], tentativas_foto_local=1
dados_cadastro: nome=Joao Silva, data_nascimento=1995-03-12
```

## Provas Conclusivas Reais

```text
Cliente: "Joao Silva"
Bot: "Me passa tua data de nascimento completa?"

Cliente: "12/03/1995"
Bot: "E o e-mail? Se preferir seguir sem, me avisa"
```

## Falha Util De Processo

```text
run_id: scenario-cadastro-after-media-nome-data-20260526T072952Z-18485
resultado: FAIL
classe: deploy_desatualizado
causa: smoke HTTP de producao foi executado antes do deploy do commit funcional b606cad
efeito: producao ainda usava a prioridade antiga da ConversationPolicy e nao processou "Joao Silva" como resposta ao nome pendente
correcao: aguardar CI/deploy PASS antes de qualquer smoke de producao quando houver alteracao de codigo
status_pos_correcao: HTTP radar e WhatsApp real passaram apos deploy
```

## Decisao

Manter Level 4B. A onda comprovou que cadastro pos-midia aceita nome e data sem voltar para coleta de tattoo, preserva as imagens e nao cria orcamento antes do email. O proximo ataque natural e o fechamento de email/recusa de email apos midia, culminando no handoff de orcamento com pacote de midia preservado.
