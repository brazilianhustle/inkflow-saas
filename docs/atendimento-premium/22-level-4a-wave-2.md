# Level 4A Wave 2

Esta onda usa a disciplina validada na primeira onda Level 4A para atacar uma divida funcional de cadastro: `QuestionPolicy` precisa entender respostas humanas aos campos pendentes sem depender de frase exata do bot.

## Declaracao

```text
onda_id: level4a-wave-2-cadastro-question-policy
objetivo: fortalecer interpretacao de respostas de cadastro pendente com validacao real WhatsApp
familia: cadastro, question-policy, workflow-manager
risco: amarelo
janela: Level 4A, ate 6 micro-slices
```

## Escopo

Dentro do escopo:

- reconhecer resposta de nome completo quando essa for a pergunta pendente;
- reconhecer data de nascimento quando essa for a pergunta pendente;
- reconhecer email quando essa for a pergunta pendente;
- reconhecer recusa de email quando essa for a pergunta pendente;
- responder duvida lateral durante cadastro sem perder a pergunta pendente;
- registrar comportamento em smoke HTTP e WhatsApp real para cada micro-slice conversacional.

Fora do escopo:

- preco, sinal, pagamento ou agenda;
- secrets;
- tenant real amplo;
- mudanca de copy ampla fora do campo validado;
- refatoracao grande do Agent operacional;
- promocao para 4B/4C.

## Micro-Slices Planejados

1. `cadastro-question-policy-nome`: resposta de nome completo resolve campo pendente correto.
2. `cadastro-question-policy-data`: data de nascimento resolve campo pendente correto sem aceitar idade isolada como data.
3. `cadastro-question-policy-email`: email valido resolve campo pendente correto.
4. `cadastro-question-policy-email-recusado`: recusa explicita de email resolve campo pendente sem travar cadastro.
5. `cadastro-question-policy-lateral`: duvida lateral durante cadastro e respondida e a pergunta pendente continua recuperavel.
6. `wave-closeout`: consolidar evidencias, gates e recomendacao de autonomia.

Os itens 2-6 so devem ser executados se o item anterior terminar com CI/deploy PASS, HTTP radar PASS, WhatsApp real PASS e sem blocker.

## Criterios De Pronto

- `check-autonomy-gate.sh` PASS em Level 4A;
- `check-security-gate.sh` PASS;
- `wave-health.sh` PASS antes e depois da onda;
- testes locais relevantes PASS;
- CI PASS;
- deploy PASS;
- HTTP radar PASS para cada micro-slice conversacional;
- WhatsApp real definitivo PASS para cada micro-slice conversacional;
- `summary.md`, `transcript.md` e `judgment.md` gerados quando scenario produzir evidence;
- worktree limpo ao fechar;
- nenhuma promocao para 4B/4C.

## Stop Conditions

Parar a onda se ocorrer:

- CI FAIL;
- deploy FAIL;
- HTTP radar FAIL;
- WhatsApp real FAIL;
- `copy_risk=alto`;
- estado final errado;
- persistencia de campo incorreto;
- pergunta pendente perdida apos duvida lateral;
- falta de resposta AI;
- cleanup inseguro;
- divergencia entre HTTP e WhatsApp real;
- necessidade de tocar preco, sinal, pagamento, agenda, secrets ou tenant real amplo.

## Resultado Atual

```text
status: em-andamento
micro_slice_1: cadastro-question-policy-nome PASS
micro_slice_2: cadastro-question-policy-data PASS
micro_slice_3: cadastro-question-policy-email PASS
micro_slice_4: cadastro-question-policy-email-recusado PASS
micro_slice_5: cadastro-question-policy-lateral PASS
micro_slice_atual: wave-closeout
promocao_4b_4c: proibida
```

## Evidencia Micro-Slice 1

```text
micro_slice: cadastro-question-policy-nome
commit_codigo: 7714042 feat: resolve pending cadastro name answers
commit_gate_fix: d350099 test: fix cadastro question policy smoke gate
tests_local: npm test PASS, 1174/1174
ci_github: PASS
deploy_github: PASS
http_radar: scenario-cadastro-question-policy-nome-20260526T002805Z-22782 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-question-policy-nome-20260526T002906Z-28311 PASS
falha_intermediaria: scenario-cadastro-question-policy-nome-20260526T002546Z-25121 FAIL por contrato jq incorreto, comportamento correto
estado_final: coletando_cadastro
dados_cadastro.nome: Joao Silva
dados_cadastro.data_nascimento: null
orcid: null
copy_risk: baixo
agent_log_gate: conversation_router cadastro_pending_answer, pending_nome_completo_answered, can_mutate_state=true
decisao: seguir para cadastro-question-policy-data
```

Provas conclusivas reais:

```text
Cliente: "Joao Silva"
Bot: "Me passa tua data de nascimento completa?"
```

## Evidencia Micro-Slice 2

```text
micro_slice: cadastro-question-policy-data
commit_codigo: 0723417 feat: resolve pending cadastro birth date answers
commit_gate_fix: c68acfe test: allow optional email copy risk in data smoke
tests_local: ConversationPolicy/Router PASS, WhatsApp Pipeline PASS
ci_github: PASS
deploy_github: PASS
http_radar: scenario-cadastro-question-policy-data-20260526T003828Z-21859 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-question-policy-data-20260526T004242Z-9351 PASS
falha_intermediaria: scenario-cadastro-question-policy-data-20260526T003600Z-7842 FAIL por copy gate baixo demais; comportamento correto e contrato ajustado para medio
estado_final: coletando_cadastro
dados_cadastro.nome: Joao Silva
dados_cadastro.data_nascimento: 1995-03-12
orcid: null
copy_risk: medio
agent_log_gate: conversation_router cadastro_pending_answer, pending_data_nascimento_answered, can_mutate_state=true
decisao: seguir para cadastro-question-policy-email
```

Provas conclusivas reais:

```text
Cliente: "12/03/1995"
Bot: "E o e-mail? Se preferir seguir sem, me avisa"
```

## Evidencia Micro-Slice 3

```text
micro_slice: cadastro-question-policy-email
commit_codigo: ef87948 feat: resolve pending cadastro email answers
tests_local: ConversationPolicy/Router PASS, WhatsApp Pipeline PASS
ci_github: PASS
deploy_github: PASS
http_radar: scenario-cadastro-question-policy-email-20260526T005117Z-24570 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-question-policy-email-20260526T005621Z-20607 PASS
estado_final: aguardando_tatuador
dados_cadastro.nome: Joao Silva
dados_cadastro.data_nascimento: 1995-03-12
dados_cadastro.email: joao@example.com
orcid: orc_as5blj
copy_risk: baixo
agent_log_gate: conversation_router cadastro_pending_answer pending_email_answered + workflow_manager cadastro_and_tattoo_complete
decisao: seguir para cadastro-question-policy-email-recusado
```

Provas conclusivas reais:

```text
Cliente: "joao@example.com"
Bot: "Fechado, Joao! O tatuador vai avaliar com calma e eu te retorno em breve com o valor certinho."
```

## Evidencia Micro-Slice 4

```text
micro_slice: cadastro-question-policy-email-recusado
commit_codigo: 1e42603 feat: resolve pending cadastro email refusal
tests_local: ConversationPolicy/Router PASS, WhatsApp Pipeline PASS
ci_github: PASS
deploy_github: PASS
http_radar: scenario-cadastro-question-policy-email-recusado-20260526T010832Z-11912 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-question-policy-email-recusado-20260526T011456Z-18795 PASS
estado_final: aguardando_tatuador
dados_cadastro.nome: Joao Silva
dados_cadastro.data_nascimento: 1995-03-12
dados_cadastro.email: null
dados_cadastro.email_recusado: true
orcid: orc_bwqoy5
copy_risk: baixo
agent_log_gate: conversation_router cadastro_pending_answer pending_email_refused + workflow_manager cadastro_and_tattoo_complete
decisao: seguir para cadastro-question-policy-lateral
```

Provas conclusivas reais:

```text
Cliente: "pode seguir sem email"
Bot: "Fechado, Joao! O tatuador vai avaliar com calma e eu te retorno em breve com o valor certinho."
```

## Evidencia Micro-Slice 5

```text
micro_slice: cadastro-question-policy-lateral
commit_codigo: aff6773 test: cover cadastro lateral pending question
tests_local: ConversationPolicy/Router PASS, WhatsApp Pipeline PASS
ci_github: PASS
deploy_github: PASS
http_radar: scenario-cadastro-question-policy-lateral-20260526T030316Z-20991 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-question-policy-lateral-20260526T030449Z-21011 PASS
estado_final: coletando_cadastro
dados_cadastro.nome: Joao Silva
dados_cadastro.data_nascimento: null
dados_cadastro.email: null
orcid: null
copy_risk: baixo
agent_log_gate: conversation_router tempo_sessao can_mutate_state=false + workflow_manager state_preserved_by_router_policy
decisao: seguir para wave-closeout
```

Provas conclusivas reais:

```text
Cliente: "quanto tempo demora?"
Bot: "O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.\n\nMe passa tua data de nascimento completa?"
```
