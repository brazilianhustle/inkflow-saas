# Level 4B Wave 17 - Naturalidade Audit

## Objetivo

Criar uma auditoria objetiva de naturalidade usando evidencias reais ja validadas, antes de alterar linguagem do bot.

Esta onda existe para separar diagnostico de execucao: primeiro identificar repeticao, rigidez e risco de copy; depois escolher micro-slices de linguagem com HTTP radar e WhatsApp real definitivo quando houver mudanca conversacional.

## Escopo

- Criar ferramenta read-only `scripts/smoke/naturalness-audit.sh`.
- Analisar amostra inicial de evidencias WhatsApp real ja aprovadas.
- Classificar sinais objetivos:
  - resposta longa demais para WhatsApp;
  - perguntas demais na mesma bolha;
  - linguagem interna/sistemica;
  - termos rigidos de template;
  - aberturas formulaicas;
  - repeticao exata dentro do run ou na amostra.
- Registrar achados e proximo slice recomendado.

## Fora De Escopo

- alterar copy do bot nesta primeira passada;
- usar score LLM continuo como criterio primario;
- executar WhatsApp real novo apenas para diagnostico read-only;
- mexer em preco, agenda, pagamento, sinal, secrets ou tenant real amplo;
- promover para 4C.

## Criterio De Pronto

```text
script_read_only: PASS
bash_n: PASS
amostra_real_existente: PASS
achados_registrados: PASS
proximo_slice_definido: PASS
```

## Stop Conditions

- qualquer tentativa de aprovar mudanca de linguagem sem WhatsApp real definitivo;
- usar naturalidade subjetiva como gate primario sem contrato binario;
- confundir diagnostico read-only com validacao conversacional nova;
- promover 4C.

## Plano De Ataque

1. Declarar a Wave 17 como auditoria, nao como mudanca de comportamento.
2. Criar ferramenta read-only para consolidar transcript/judgment ja existentes.
3. Rodar amostra mista de WhatsApp real: lateral, cadastro, midia, handoff e menoridade.
4. Registrar os principais padroes de risco.
5. Escolher o proximo micro-slice de linguagem com validação completa.

## Decisao Metodologica

Naturalidade nao deve virar score continuo primario neste momento. O processo premium continua usando invariantes binarios como gate principal. A auditoria de naturalidade entra como radar de melhoria e priorizacao.

## Micro-Slice 1 - Auditoria Read-Only

PASS: ferramenta `scripts/smoke/naturalness-audit.sh` criada e validada com amostra de 10 evidencias WhatsApp real ja aprovadas.

```text
bash_n: PASS
amostra: 10 evidencias WhatsApp real
alto: 0
medio: 9
baixo: 1
decisao: watchlist
whatsapp_real_novo: nao aplicavel; auditoria read-only sobre evidencias reais existentes
```

### Evidencias Analisadas

```text
scenario-whatsapp-real-lateral-preco-generico-20260525T191651Z-20855
scenario-whatsapp-real-lateral-tempo-sessao-20260525T193654Z-8352
scenario-whatsapp-real-lateral-processo-tatuagem-20260525T193747Z-10247
scenario-whatsapp-real-lateral-portfolio-disponivel-20260525T204606Z-651
scenario-whatsapp-real-cadastro-handoff-20260525T222253Z-9952
scenario-whatsapp-real-cadastro-email-refusal-channel-handoff-20260526T090215Z-18284
scenario-whatsapp-real-cadastro-idade-17-handoff-humano-20260526T171946Z-31823
scenario-whatsapp-real-cadastro-menoridade-pais-handoff-humano-20260526T175152Z-23494
scenario-whatsapp-real-tattoo-media-ambiguous-confirm-local-20260526T070618Z-15645
scenario-whatsapp-real-tattoo-media-reference-then-local-20260526T071915Z-30812
```

### Achado Principal

Nao houve risco alto nem repeticao exata global na amostra. O risco medio veio de dois padroes:

- bolhas laterais iniciais com mais de uma pergunta;
- termos rigidos de template em cadastro, midia e menoridade.

### Provas Conclusivas Reais - Amostra

Cliente: `quanto fica uma rosa fineline no braco?`

Bot: `Oii, tudo bem? Me chamo Assistente, muito prazer. O valor depende do tamanho, detalhe e local do corpo. O tatuador confirma certinho depois de avaliar tua ideia. Pra montar tua ...`

Cliente: `tenho autorizacao dos meus pais`

Bot: `Como a pessoa que vai tatuar tem menos de 18 anos, vou acionar o tatuador para orientar com segurança sobre responsável legal.`

Cliente: `prefiro falar por aqui`

Bot: `Fechado, Joao! O tatuador vai avaliar com calma e eu te retorno em breve com o valor certinho.`

## Decisao Apos Micro-Slice 1

Wave 17 deve continuar como frente de linguagem controlada. O proximo micro-slice recomendado e reduzir rigidez de copy em uma familia pequena, com contrato binario e validacao completa:

```text
familia_recomendada: fechamento de cadastro / handoff de orcamento
risco: amarelo baixo
validacao_obrigatoria: testes focados, CI/deploy, HTTP radar e WhatsApp real definitivo
nao_atacar_agora: menoridade legal ampla, preco, agenda, pagamento, 4C
```

## Micro-Slice 2 - Fechamento De Cadastro Mais Natural

PASS: fechamento deterministico de cadastro/handoff de orcamento ficou menos rigido, sem alterar transicao de estado, ORCID, handoff package ou observabilidade.

Mudanca principal:

```text
antes: Fechado, Joao! O tatuador vai avaliar com calma e eu te retorno em breve com o valor certinho.
depois: Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor.
```

Validacao:

```text
commit_funcional: 8de8f84 feat: soften cadastro handoff copy
tests_focados: PASS 68/68
tests_local: npm test PASS 1203/1203
ci: PASS
prompts_ci: PASS
eval_gate: PASS
deploy: PASS
http_radar: scenario-cadastro-email-refusal-channel-handoff-20260526T180946Z-17880 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-email-refusal-channel-handoff-20260526T181023Z-21959 PASS
estado_final: aguardando_tatuador
orcid: orc_fauvjm
copy_risk: baixo
naturalness_audit_new_evidence: PASS, 2 baixo, 0 medio, 0 alto
```

### Provas Conclusivas Reais - Micro-Slice 2

Cliente: `prefiro falar por aqui`

Bot: `Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor.`

Estado final: `aguardando_tatuador`, `orcid=orc_fauvjm`, `email_recusado=true`, `copy_risk=baixo`.

## Decisao Apos Micro-Slice 2

Manter Level 4B. A primeira melhoria de linguagem passou em HTTP radar e WhatsApp real definitivo, sem regressao operacional. Proximo ataque recomendado: reexecutar `naturalness-audit.sh` incluindo as novas evidencias e escolher uma segunda familia pequena, provavelmente copy de midia/cadastro (`Pra liberar teu orcamento`) ou copy de menoridade legal, sem misturar as duas.

Auditoria apos as novas evidencias:

```text
evidencias: scenario-cadastro-email-refusal-channel-handoff-20260526T180946Z-17880, scenario-whatsapp-real-cadastro-email-refusal-channel-handoff-20260526T181023Z-21959
baixo: 2
medio: 0
alto: 0
decisao: pass
```

## Micro-Slice 3 - VoicePolicy Central

PASS estrutural: a naturalidade deterministica ganhou uma camada central de contrato antes de novas mudanças de linguagem.

Arquitetura:

```text
naturalness-audit.sh -> VoicePolicy -> Router/Pipeline -> HTTP radar -> WhatsApp real quando fala mudar
```

Implementado:

- `functions/_lib/conversation-voice-policy.js`;
- testes diretos em `tests/_lib/conversation-voice-policy.test.mjs`;
- `ConversationRouter` passou a usar `cadastroResumeQuestion` da VoicePolicy;
- caminhos determinísticos de mídia/cadastro no pipeline passaram a importar copy da VoicePolicy;
- decisão registrada no `08-decision-log.md`.

Critério:

```text
mudanca_de_texto_cliente: nao
whatsapp_real_novo: nao aplicavel; refactor estrutural sem alterar fala
validacao_minima: testes focados + npm test + CI/deploy
```

Decisão: próximas melhorias de naturalidade não devem editar strings diretamente em router/pipeline quando pertencerem a uma família reutilizável. Primeiro entra na VoicePolicy, depois nos resolvedores.

## Micro-Slice 4 - Mídia/Cadastro Mais Natural

PASS: a família determinística de mídia/cadastro reduziu linguagem transacional rígida sem alterar persistência de mídia, transição de estado ou fluxo de cadastro.

Mudança principal:

```text
antes: Recebi a foto do local. Pra liberar teu orçamento, preciso do teu nome completo.
depois: Recebi a foto do local. Agora me passa teu nome completo pra eu montar o cadastro.
```

Também foram suavizadas as variações de referência recebida, foto ambígua confirmada como local e foto ambígua confirmada como referência, todas pela `VoicePolicy`.

Validação:

```text
commit_funcional: 945f0e7 feat: soften media cadastro copy
tests_focados: PASS 77/77
tests_local: npm test PASS 1207/1207
ci: PASS
deploy: PASS
http_radar: scenario-tattoo-media-local-photo-20260526T182841Z-30300 PASS
whatsapp_real: scenario-whatsapp-real-tattoo-media-local-photo-20260526T182903Z-13172 PASS
estado_final: coletando_cadastro
orcid: null
copy_risk: baixo
naturalness_audit_new_evidence: PASS, 2 baixo, 0 medio, 0 alto
```

### Provas Conclusivas Reais - Micro-Slice 4

Cliente: `segue foto do local`

Bot: `Recebi a foto do local. Agora me passa teu nome completo pra eu montar o cadastro.`

Estado final: `coletando_cadastro`, `foto_local_msg_id=12752`, `orcid=null`, `copy_risk=baixo`.

## Decisão Apos Micro-Slice 4

Manter Level 4B. A mudança conversacional passou em HTTP radar e WhatsApp real definitivo pela `central`, sem regressão de mídia nem avanço indevido para orçamento. Próximo ataque recomendado: reexecutar a auditoria de naturalidade incluindo as novas evidências e escolher entre uma segunda variação pequena de mídia/cadastro ou outro ponto de rigidez já mapeado, sem misturar com menoridade legal ampla.
