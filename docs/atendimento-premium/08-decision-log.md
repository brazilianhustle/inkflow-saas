# Decision Log - Atendimento Premium

Este arquivo registra decisões técnicas e estratégicas da frente de atendimento premium.

Uso esperado em novas sessões:

```text
ler decision log
-> entender decisões vivas
-> conferir session handoff
-> só então mexer em código, prompt ou smoke
```

## 2026-05-24 - Atendimento premium não será prompt monolítico

**Status:** decidido.

**Decisão:** construir o atendimento premium como arquitetura híbrida: `SessionQueue`, `Pipeline`, `ConversationRouter`, `ConversationPolicy`, `ResponseComposer`, agent operacional e guardrails.

**Motivo:** os smokes mostraram que prompt sozinho não controla bem ordem, estado, dados pendentes e side quests. A falha era estrutural, não só de frase.

**Alternativas rejeitadas:**

- aumentar prompt com mais regras;
- adicionar regex solta para cada print;
- deixar o agent operacional resolver toda dúvida lateral;
- usar guardrail como correção principal.

**Impacto:** toda nova mudança deve ser classificada por camada antes de implementação.

**Documento canônico:** `docs/canonical/decisions/2026-05-24-atendimento-premium-hybrid-architecture.md`.

## 2026-05-24 - Side quest deve ser respondida antes da retomada

**Status:** decidido.

**Decisão:** quando o cliente faz uma dúvida lateral e também existe coleta em andamento, o bot deve:

1. responder a dúvida/objeção;
2. reconhecer dados úteis do turno;
3. retomar a coleta com uma única pergunta no final da última bolha.

**Exemplo:**

```text
Cliente:
Paola aqui
como funciona o orçamento?

Bot:
Funciona assim: eu entendo tua ideia, junto as infos principais e o tatuador avalia pra passar valor e horário.

Boa, Paola. Me diz tua altura?
```

**Motivo:** atendimento humano não ignora pergunta lateral nem atropela o cliente com formulário.

**Camadas responsáveis:**

- `ConversationPolicy`: resolver pergunta pendente;
- `ConversationRouter`: detectar lateral simples;
- `ResponseComposer`: montar resposta + retomada.

## 2026-05-24 - Pergunta pendente precisa sobreviver a turnos laterais

**Status:** decidido.

**Decisão:** a pergunta de formulário pendente deve ser buscada no histórico recente de mensagens do bot, não apenas na última mensagem do assistant.

**Motivo:** se o cliente responde uma dúvida lateral antes de responder o formulário, a última mensagem do bot pode não conter a pergunta original. Mesmo assim, a pergunta continua pendente.

**Exemplo:**

```text
Bot: Como posso te chamar?
Cliente: como funciona o orçamento?
Bot: Funciona assim...
Cliente: Paola aqui
```

O sistema ainda deve entender que `Paola` responde `Como posso te chamar?`.

**Camada responsável:** `ConversationPolicy`.

## 2026-05-24 - Vocabulário estático é aceitável como domínio, não como arquitetura

**Status:** decidido.

**Decisão:** aliases como `virilha`, `bunda -> glúteo`, `quanto que é`, `me chama de` são aceitáveis quando ficam dentro de resolvedores com contrato, teste e escopo claro.

**Motivo:** atendimento real precisa entender vocabulário humano. O problema não é lista estática; o problema é lista estática espalhada em prompt, router e agent sem autoridade única.

**Regra:** se o alias extrai dado simples, ele pertence à `ConversationPolicy`; se classifica intenção lateral, pertence ao router ou futuro `IntentPolicy`.

## 2026-05-24 - ResponseComposer é camada própria

**Status:** decidido.

**Decisão:** a montagem final da fala do bot deve ser isolada em `ResponseComposer`, não misturada com detecção de intenção ou extração de dados.

**Motivo:** o bot precisa controlar:

- introdução de primeiro contato;
- resposta lateral;
- retomada de coleta;
- pergunta no final;
- redução de repetição;
- naturalidade de bolhas.

Misturar isso no router aumenta acoplamento e dificulta teste.

## 2026-05-24 - Stale batch deve abortar antes de side effect

**Status:** decidido.

**Decisão:** se uma nova mensagem humana chega enquanto o batch atual ainda está sendo processado, o pipeline deve abortar antes de atualizar conversa, inserir AI, enviar WhatsApp ou marcar mensagens.

**Motivo:** sem isso, o bot pode responder com uma pergunta antiga por cima de uma pergunta nova do cliente.

**Camada responsável:** `whatsapp-pipeline`.

**Comportamento esperado:** `StaleBatchError` causa retry pelo Durable Object com o lote reagrupado.

## 2026-05-24 - PASS operacional não é igual a PASS premium

**Status:** decidido.

**Decisão:** validação deve separar três níveis:

- `PASS operacional`: estado, dados, mensagens, side effects;
- `PASS conversacional`: ordem, naturalidade, não repetição, pergunta final;
- `PASS premium`: robustez com variações humanas e segurança sem depender de sorte do LLM.

**Motivo:** um fluxo pode estar tecnicamente correto e ainda parecer ruim para o cliente.

## 2026-05-25 - Autonomia Level 2 exige evidência e checkpoints por micro-slice

**Status:** decidido.

**Decisão:** promover o Autonomy Gate de Level 1 para Level 2, permitindo até 2 micro-slices relacionados por rodada.

**Motivo:** a frente atingiu evidência operacional suficiente: `cadastro-handoff` e `atendimento-lateral` passaram nos slice gates, com 14 cenários recentes e 7 smokes WhatsApp reais. Manter Level 1 nesse ponto reduz velocidade sem aumentar segurança de forma proporcional.

**Alternativas rejeitadas:**

- manter Level 1 apesar de `promote_available`;
- liberar batch amplo sem limite;
- promover automaticamente sem commit deliberado.

**Camada responsável:** processo de smoke/autonomia, documentado em `autonomy-gate.env`, `current-objective.md` e `smoke-runs.md`.

**Impacto:** cada rodada pode executar até 2 micro-slices relacionados, mas cada micro-slice ainda precisa ter validação, registro e checkpoint saudável. Qualquer falha de smoke real, deploy, cleanup ou gate interrompe a rodada e volta para triage.

## 2026-05-25 - Compactação precisa ser bundle portátil, não só hook local

**Status:** decidido.

**Decisão:** a retomada após compactação deve usar um bundle versionado e executável por comando explícito: `bash scripts/smoke/continuity-bundle.sh --force`.

**Motivo:** o hook `SessionStart` em `.claude/settings.json` é útil no Claude Code, mas não dispara em Codex/API. O loop estava documentado, mas a continuidade ainda dependia do chat lembrar de comandos quando o contexto já estava baixo.

**Alternativas rejeitadas:**

- depender somente do hook Claude Code;
- tentar controlar a compactação interna do cliente;
- manter a retomada apenas como lista manual de arquivos;
- deixar script local sem versionamento.

**Camada responsável:** processo de smoke/continuidade, documentado em `12-loop-continuity-protocol.md` e `17-context-compact-architecture.md`.

**Impacto:** abaixo de 20% de contexto, a operação padrão é gerar o bundle portátil, confirmar gates e seguir pelo repo como fonte de verdade. Nenhum script local promete forçar a compactação interna do Codex; ele torna a retomada determinística.

## 2026-05-25 - Menoridade explícita é handoff humano, não orçamento

**Status:** decidido.

**Decisão:** quando uma data de nascimento explícita indica menor de 18 anos, o cadastro deve acionar handoff humano seguro, persistir a data válida e manter `orcid=null`. Esse caminho não deve chamar `enviar-orcamento-tatuador` nem exigir `orcid` no smoke, porque não é handoff de orçamento.

**Motivo:** o primeiro smoke de menoridade mostrou um risco real: o LLM podia reconhecer a situação, mas não persistir `data_nascimento`, gerando estado final inseguro ou copy incorreta. A defesa precisa existir no servidor, usando a mensagem humana como fonte adicional, não só no prompt.

**Alternativas rejeitadas:**

- depender do LLM para sempre persistir a data;
- tratar menoridade como orçamento normal;
- exigir `orcid` em todo `aguardando_tatuador`, mesmo quando o motivo é risco humano;
- aceitar copy genérica de data inválida quando a data explícita é parsável.

**Camada responsável:** guardrail de cadastro em `enforce-menor-idade`, workflow no `runAgent`, pipeline de handoff humano e smoke harness com `SMOKE_REQUIRE_ORCID`.

**Impacto:** o scenario `cadastro-menoridade-handoff-humano` passou em produção (`scenario-cadastro-menoridade-handoff-humano-20260525T170936Z-8596`) com `estado=aguardando_tatuador`, `orcid=null`, `data_nascimento=2015-03-12`, copy segura e tail gate sem envio de orçamento.

## 2026-05-25 - Escalation Manager começa como contrato rastreável

**Status:** decidido.

**Decisão:** criar `EscalationManager` como camada propria para classificar handoff humano, gerar `reason_code`, severidade, fonte da decisão e texto padronizado para Telegram. A primeira cobertura formal e `minor_age`.

**Motivo:** menoridade nao pode depender de inferencia espalhada no pipeline. O monitoramento precisa enxergar o motivo operacional (`[escalation:minor_age]`) sem ler toda a conversa ou deduzir por estado.

**Alternativas rejeitadas:**

- continuar montando o texto de Telegram diretamente no pipeline;
- usar apenas `campos_faltando=menor_idade_trigger` como contrato externo;
- misturar escalation humano com handoff de orçamento;
- criar tabela nova antes de consolidar o contrato mínimo.

**Camada responsável:** `functions/_lib/escalation-manager.js`, `enforce-menor-idade`, retorno de `runAgent` e `whatsapp-pipeline`.

**Impacto:** escalonamento por menoridade agora carrega `reason_code=minor_age`, `severity=high`, `requires_orcid=false` e mensagem Telegram com marcador `[escalation:minor_age]`. Cobertura textual entrou no contrato com `reason_code=cover_up`, validado pelo smoke `tattoo-cobertura-handoff-humano`. Pedido explicito de humano/tatuador entrou com `reason_code=human_requested`, validado pelo smoke `tattoo-pedido-humano-handoff`. Cliente irritado entrou com `reason_code=client_upset`, `severity=high`, validado pelo smoke `tattoo-cliente-irritado-handoff`.

## 2026-05-25 - Escalation Manager precisa logar a propria decisao

**Status:** decidido.

**Decisão:** todo handoff humano classificado pelo `EscalationManager` deve registrar um turn em `agent_turn_logs` com `agent_name=escalation_manager`, incluindo `reason_code`, `reason_label`, severidade, fonte, `requires_orcid`, estado final, ids das mensagens e resposta enviada ao cliente.

**Motivo:** Telegram e transcript mostram o que aconteceu, mas nao bastam para observabilidade premium. O sistema precisa explicar por que saiu para humano sem exigir leitura do codigo ou deducao pelo estado final.

**Camada responsável:** `whatsapp-pipeline` chamando `logAgentTurn` apos `evaluateEscalation`.

**Impacto:** o smoke `tattoo-cliente-irritado-handoff` em producao confirmou `agent_turn_logs.agent_name=escalation_manager` com `reason_code=client_upset`, `severity=high` e `requires_orcid=false`.

## 2026-05-25 - Observabilidade precisa virar gate, nao checklist manual

**Status:** decidido.

**Decisão:** scenarios podem declarar `EXPECTED_AGENT_LOG_JQ_TRUE`; o runner consulta `agent_turn_logs` desde o inicio do run e aplica o filtro `jq` como gate automatico.

**Motivo:** uma verificacao manual no Supabase prova o comportamento uma vez, mas nao escala o loop. O smoke precisa falhar sozinho quando o log decisorio esperado nao existir.

**Detalhe operacional:** como `logAgentTurn` e fire-and-forget, o gate faz polling curto antes de falhar. Isso evita falso negativo quando a resposta do bot chega antes da row de telemetria.

**Impacto:** `tattoo-cliente-irritado-handoff` agora valida conversa, tail, estado, copy e row `agent_name=escalation_manager` no mesmo processo.

## 2026-05-25 - WhatsApp real e o critério definitivo por micro-slice

**Status:** decidido.

**Decisão:** para mudanças conversacionais, HTTP production smoke passa a ser somente radar inicial. O criterio definitivo e um scenario `whatsapp_real` rodando pela instancia `central` para o numero oficial do bot, com webhook real, resposta real, transcript, julgamento e gates do scenario.

**Motivo:** HTTP valida muito do servidor, mas nao valida a cadeia completa Evolution/WhatsApp/webhook/resposta visivel. O risco aparece tarde demais se o WhatsApp real ficar apenas para o fim de um bloco grande.

**Regra:** rodar WhatsApp real por micro-slice assim que o HTTP passar. No fim de um bloco, rodar gate/rehearsal consolidado, mas nao usar o fim do bloco como primeira validacao real.

**Impacto:** foram criados e rodados scenarios WhatsApp real para os gaps recentes: idade isolada, menoridade, cobertura, pedido humano e cliente irritado. `cadastro-handoff` e `escalation-manager` agora exigem esses PASS reais em seus slice gates.

## 2026-05-25 - Router precisa explicar a decisão de intent

**Status:** decidido.

**Decisão:** `ConversationRouter` passa a retornar, para cada intent resolvida, `reason` e `can_mutate_state` alem de `intent`, `confidence` e `risk`. O pipeline grava esses campos em `agent_turn_logs.context_metadata` como `router_reason` e `router_can_mutate_state`.

**Motivo:** confidence sem motivo ainda exige leitura do codigo para entender por que o bot escolheu um caminho. O padrao premium precisa explicar a decisao de atendimento no proprio log, e o smoke precisa conseguir transformar essa explicacao em gate.

**Alternativas rejeitadas:**

- manter apenas `intent/confidence/risk`;
- depender do texto do bot para inferir motivo;
- adicionar observabilidade apenas em escalation, deixando router lateral sem explicabilidade.

**Camada responsável:** `ConversationRouter`, `whatsapp-pipeline`, `agent_turn_logs` e `Smoke Scenario Registry`.

**Impacto:** `lateral-preco-generico` e `whatsapp-real-lateral-preco-generico` agora falham se nao existir row `agent_name=conversation_router` com `router_reason=generic_price_question_without_negotiation`, confidence minima, risco e permissao de mutacao de estado esperados. O mesmo padrao foi expandido para `tempo_sessao` (`router_reason=session_duration_or_number_of_sessions_question`), `processo_tatuagem` (`router_reason=tattoo_process_or_booking_flow_question`), `pergunta_imagem` (`router_reason=image_interpretation_question_without_media_context`) e `historia_vida` (`router_reason=emotional_context_or_life_story_detected`). HTTP production smoke e WhatsApp real passaram em 2026-05-25.

## 2026-05-25 - Context/Tenant Manager passa a ser camada propria

**Status:** decidido.

**Decisão:** a montagem do `clientContext` efetivo do turno sai de `runAgent` e passa para `functions/api/agent/_lib/tenant-context-manager.js`.

**Motivo:** contexto por tenant e contexto transversal estavam acoplados ao orquestrador do agent. Para evoluir regras por estúdio sem degradar o fluxo, a camada precisa ficar isolada, testável e reaproveitável.

**Alternativas rejeitadas:**

- manter prefetch de portfolio/proposta diretamente em `route.js`;
- criar uma camada grande de domínio antes de ter contrato local;
- alterar prompt/comportamento junto com a extração estrutural.

**Camada responsável:** `TenantContextManager`, `runAgent`, contexto de portfolio e contexto de proposta.

**Impacto:** comportamento preservado. `portfolio_disponivel` continua sendo derivado de `tenant.portfolio_urls`, contexto de proposta continua entrando só em substates de proposta e os testes locais cobrem precedência/imutabilidade. HTTP production smoke e WhatsApp real de portfolio passaram em 2026-05-25.

## 2026-05-25 - Level 3 deve ser recomendacao objetiva, nao promocao automatica

**Status:** decidido.

**Decisão:** o `check-autonomy-gate.sh` passa a calcular criterios de promocao para Level 3 quando o projeto estiver em Level 2, mas nao altera `CURRENT_LEVEL`.

**Motivo:** a janela de execucao pode crescer, mas apenas quando ha evidencia versionada, WhatsApp real suficiente, gates criticos passando e zero bloqueadores. A promocao em si precisa continuar sendo uma decisao deliberada porque muda o risco operacional.

**Alternativas rejeitadas:**

- promover automaticamente assim que o volume minimo for atingido;
- manter apenas criterio de Level 2 e decidir Level 3 por sensacao;
- aumentar a janela sem explicitar bloqueadores e limites de parada.

**Camada responsável:** `Autonomy Gate`, `smoke-runs.md`, slice gates e handoff operacional.

**Impacto:** em 2026-05-25 o gate retornou `decision=promote_available` para Level 3 com 40 scenarios PASS, 18 WhatsApp reais PASS e gates `atendimento-lateral`, `cadastro-handoff` e `escalation-manager` PASS. `CURRENT_LEVEL` permanece 2 ate commit deliberado de promocao.

## 2026-05-25 - Promocao deliberada para Autonomy Level 3

**Status:** decidido.

**Decisão:** promover `CURRENT_LEVEL` para 3, com `MAX_BATCH_SIZE=4` e politica de mini-campanha limitada a uma familia de cenarios por rodada.

**Motivo:** a recomendacao objetiva do gate foi atingida: 40 scenarios PASS, 18 WhatsApp reais PASS, gates criticos PASS e nenhum bloqueador. Level 3 aumenta eficiencia sem liberar loop infinito.

**Alternativas rejeitadas:**

- permanecer em Level 2 apesar da evidencia;
- promover para Level 4 sem rollback/staging documentado;
- aumentar batch sem limitar por familia de cenarios.

**Camada responsável:** `Autonomy Gate`, metodologia de smoke, slice gates e handoff operacional.

**Impacto:** proximas rodadas podem executar ate 4 micro-slices da mesma familia, mantendo HTTP radar e WhatsApp real definitivo por micro-slice conversacional. Qualquer falha de WhatsApp real, deploy, CI, cleanup, gate ou estado interrompe a campanha e volta para triage.

## 2026-05-25 - Level 4 exige rollback/staging e politica de loop

**Status:** decidido.

**Decisão:** definir criterios de recomendacao futura para Level 4 sem promover agora.

**Motivo:** Level 4 e loop continuo supervisionado; ele exige mais do que volume de PASS. Precisa de rollback/staging confiavel e politica explicita de parada.

**Alternativas rejeitadas:**

- deixar Level 4 sem parametros;
- promover por volume bruto;
- permitir loop continuo sem documentos operacionais.

**Camada responsável:** `Autonomy Gate` e docs futuros `18-rollback-staging-protocol.md` e `19-level-4-loop-policy.md`.

**Impacto:** o gate so pode recomendar Level 4 quando houver pelo menos 70 scenarios PASS, 35 WhatsApp reais PASS, gates criticos PASS, docs obrigatorios de rollback/staging e loop Level 4, alem de zero bloqueadores.

## 2026-05-25 - Context/Tenant Manager 2.0 com snapshot operacional versionado

**Status:** decidido.

**Decisão:** o `Context/TenantManager` deve expor um snapshot operacional versionado das regras do tenant em `agent_turn_logs.context_metadata`, sem vazar listas completas, URLs, nomes ou texto livre de persona.

**Motivo:** atendimento premium precisa ser auditável por regra de estúdio. Saber que o contexto foi injetado nao basta; o monitoramento precisa provar qual superficie operacional estava ativa no turno, como origem dos gatilhos de handoff, existencia de catalogo de estilos e ativos disponíveis.

**Alternativas rejeitadas:**

- registrar listas completas de estilos, gatilhos ou URLs nos logs;
- inferir regras do tenant apenas lendo prompt ou banco;
- validar contexto premium apenas por copy do bot.

**Camada responsável:** `Context/TenantManager`, `runAgent`, `whatsapp-pipeline`, `agent_turn_logs` e smoke scenario registry.

**Impacto:** `lateral-portfolio-disponivel` e `whatsapp-real-lateral-portfolio-disponivel` agora exigem `tenant_context_rules_snapshot_version="v1"`, origem dos gatilhos (`custom` no tenant teste), presença de gatilhos, catalogo de estilos, estilos aceitos e resumo de ativos sem URLs. HTTP radar e WhatsApp real passaram em 2026-05-25.

## 2026-05-25 - Workflow Manager registra a propria decisao de transicao

**Status:** decidido.

**Decisão:** o `WorkflowManager` deve registrar turn proprio em `agent_turn_logs` quando avaliar estados suportados, começando pelo fechamento de cadastro para `aguardando_tatuador`.

**Motivo:** transicao de fase nao pode ficar implicita no patch de `estado_agente`. Para diagnosticar erro premium, precisamos saber por que o estado mudou, de onde saiu, para onde foi e se a transicao foi permitida pela camada de workflow.

**Alternativas rejeitadas:**

- inferir workflow lendo apenas `estado_agente` final;
- misturar decisao de workflow dentro do log do `ConversationRouter`;
- depender somente do `orcid` como prova indireta de handoff.

**Camada responsável:** `WorkflowManager`, `whatsapp-pipeline`, `agent_turn_logs` e smoke scenario registry.

**Impacto:** `cadastro-handoff-email-recusado` e `whatsapp-real-cadastro-handoff` agora exigem `agent_name=workflow_manager`, `workflow_layer=workflow_manager`, `workflow_from_state=cadastro`, `workflow_to_state=aguardando_tatuador`, `workflow_transition_allowed=true` e `workflow_reason=cadastro_and_tattoo_complete`. HTTP radar e WhatsApp real passaram em 2026-05-25.

## 2026-05-25 - Workflow Manager oficializa transicoes de escalation

**Status:** decidido.

**Decisão:** quando o `EscalationManager` determinar que a IA deve sair de cena, o `WorkflowManager` deve registrar a transição formal para `aguardando_tatuador` com `workflow_reason=escalation_required`, preservando `requires_orcid=false` nos casos de risco humano.

**Motivo:** escalation nao deve ser apenas side effect de Telegram ou estado novo vindo do Router. A camada de workflow precisa ser a autoridade que explica que a fase mudou porque houve risco operacional, pedido humano ou frustração do cliente.

**Alternativas rejeitadas:**

- manter escalation observavel apenas no `agent_name=escalation_manager`;
- deixar `tattoo -> aguardando_tatuador` como `unsupported_state` no Workflow Manager;
- transformar escalation em handoff de orçamento, o que poderia chamar `enviar-orcamento-tatuador` indevidamente.

**Camada responsável:** `WorkflowManager`, `EscalationManager`, `ConversationRouter`, `whatsapp-pipeline` e smoke scenario registry.

**Impacto:** `tattoo-cliente-irritado-handoff` e `whatsapp-real-tattoo-cliente-irritado-handoff` agora exigem, no mesmo turno, log do `escalation_manager` com `reason_code=client_upset` e log do `workflow_manager` com `workflow_transition_allowed=true`, `workflow_reason=escalation_required`, `workflow_to_state=aguardando_tatuador` e `workflow_escalation_requires_orcid=false`. HTTP radar e WhatsApp real passaram em 2026-05-25.

## 2026-05-25 - Workflow Manager e requisitos faltantes exatos

**Status:** decidido.

**Decisão:** o `WorkflowManager` deve calcular os requisitos faltantes reais de cadastro e briefing de tattoo, em vez de registrar listas estáticas quando uma transição é bloqueada por cadastro incompleto.

**Motivo:** a camada de workflow precisa explicar por que manteve a fase atual. Sem faltantes exatos, o monitoramento sabe que houve bloqueio, mas nao sabe se o problema foi nome, data, email/recusa ou briefing incompleto.

**Alternativas rejeitadas:**

- manter apenas `workflow_reason=requirements_missing` sem contagem operacional;
- registrar sempre todos os campos obrigatorios da fase, mesmo quando parte deles ja esta preenchida;
- deixar essa explicacao somente nos testes unitarios.

**Camada responsável:** `WorkflowManager`, `whatsapp-pipeline` e smoke scenario registry.

**Impacto:** `cadastro-data-idade-nao-persiste` e `whatsapp-real-cadastro-data-idade-nao-persiste` agora exigem log `agent_name=workflow_manager` com `workflow_transition_allowed=false`, `workflow_reason=requirements_missing`, `workflow_missing_cadastro_count=2` e `workflow_missing_tattoo_count=0`. HTTP radar e WhatsApp real passaram em 2026-05-25.

## 2026-05-25 - Workflow Manager e autoridade de nao-mutacao do Router

**Status:** decidido.

**Decisão:** quando o `ConversationRouter` responder com `can_mutate_state=false`, o `WorkflowManager` deve preservar `estado_atual` e registrar a decisao como `state_preserved_by_router_policy` ou `mutation_blocked_by_router_policy`.

**Motivo:** `can_mutate_state=false` nao pode ser apenas uma declaracao do Router. A camada de workflow precisa ser a autoridade que impede regressao futura em que uma pergunta lateral altere fase, crie handoff ou avance cadastro por acidente.

**Alternativas rejeitadas:**

- confiar somente no `estado_novo` retornado pelo Router;
- validar nao-mutacao apenas por testes unitarios;
- deixar a regra implícita no pipeline sem log decisorio.

**Camada responsável:** `WorkflowManager`, `ConversationRouter`, `whatsapp-pipeline` e smoke scenario registry.

**Impacto:** `lateral-preco-generico` e `whatsapp-real-lateral-preco-generico` agora exigem, no mesmo smoke, log do `conversation_router` com `router_can_mutate_state=false` e log do `workflow_manager` com `workflow_transition_allowed=false`, `workflow_reason=state_preserved_by_router_policy` e `workflow_to_state=tattoo`. HTTP radar e WhatsApp real passaram em 2026-05-25.

## 2026-05-25 - Gatilhos de handoff do tenant pertencem ao Router deterministico

**Status:** decidido.

**Decisão:** gatilhos configurados no tenant, como `rosto`, `mao`, `pescoco` e `retoque`, devem ser avaliados pelo `ConversationRouter` antes do Agent LLM quando a conversa esta em `tattoo`. Se um gatilho aparecer, o sistema deve parar a coleta, nao responder preco e acionar handoff humano com `reason_code=tenant_handoff_trigger`.

**Motivo:** os prompts ja declaravam que gatilhos do estudio deveriam parar a coleta, mas essa regra ficava dependente do Agent operacional. Para padrao premium, regra de elegibilidade do tenant precisa ser deterministica, observavel e validada por smoke real.

**Alternativas rejeitadas:**

- deixar apenas no prompt de tattoo;
- tratar `rosto` como pergunta lateral de preco quando vier junto de "quanto fica";
- implementar recusa comercial de estilos sem decisao humana do estudio;
- misturar essa regra com cobertura, que ja tem fluxo proprio.

**Camada responsável:** `Context/Tenant Manager`, `ConversationRouter`, `WorkflowManager`, `EscalationManager` e smoke scenario registry.

**Impacto:** `tattoo-gatilho-tenant-handoff` e `whatsapp-real-tattoo-gatilho-tenant-handoff` passaram exigindo Router `tenant_handoff_trigger`, Workflow Manager `escalation_required` e Escalation Manager `source=tenant_rules`, com `estado=aguardando_tatuador`, `orcid=null` e sem preco/formulario.

## 2026-05-25 - Handoff Package precisa de trace id cruzavel

**Status:** decidido.

**Decisão:** todo `handoff_package_v1` deve ter um trace id curto `hp_*` derivado da conversa e registrado nos pontos de auditoria. Telegram de escalation/orcamento inclui `Trace: hp_*`; `agent_turn_logs` registra `handoff_package_trace_id` no Escalation Manager e `workflow_handoff_package_trace_id` no Workflow Manager.

**Motivo:** pacote premium sem identificador comum ainda exigia abrir Telegram, logs e evidencia manualmente para cruzar um atendimento. O trace transforma o handoff em unidade operacional auditavel.

**Alternativas rejeitadas:**

- usar somente `orcid`, porque escalation humano de risco pode nao criar orçamento;
- expor o UUID completo da conversa no Telegram;
- depender apenas do timestamp do smoke.

**Camada responsável:** `Handoff Package`, `WorkflowManager`, `EscalationManager`, Telegram tools e smoke scenario registry.

**Impacto:** HTTP radar `cadastro-handoff-email-recusado` e WhatsApp real `whatsapp-real-cadastro-handoff` passaram exigindo `workflow_handoff_package_trace_id` com prefixo `hp_`; unit tests cobrem trace no Telegram de escalation e orçamento.

## 2026-05-25 - Trace decisorio deve aparecer nos artefatos legiveis do smoke

**Status:** decidido.

**Decisão:** quando o smoke capturar `agent-turn-logs.json`, `summary.md`, `transcript.md` e `judgment.md` devem promover uma seção `Decision Observability` com agente, `trace`, pacote e razão decisória. O runner deve rerenderizar o relatório depois do gate de logs para que esses dados entrem na evidência final.

**Motivo:** `agent-turn-logs.json` é a fonte bruta correta, mas a validação profissional precisa permitir leitura rápida sem abrir JSON manualmente. O relatório deve responder em segundos qual camada decidiu, qual trace une os artefatos e por que o handoff aconteceu.

**Alternativas rejeitadas:**

- deixar o trace apenas no JSON bruto;
- duplicar toda a telemetria no transcript, poluindo a leitura;
- gerar relatório separado só para observabilidade, fragmentando a evidência.

**Camada responsável:** smoke monitoring process, scenario runner e report renderer.

**Impacto:** HTTP radar `cadastro-handoff-email-recusado` e WhatsApp real `whatsapp-real-cadastro-handoff` passaram com `Decision Observability` em `summary.md`, `transcript.md` e `judgment.md`, exibindo `trace=hp_6785a917d9`, pacote `handoff_package_v1` e `workflow_reason=cadastro_and_tattoo_complete`.

## 2026-05-25 - Level 4 exige protocolo antes de promocao

**Status:** decidido.

**Decisão:** preparar Level 4 agora com dois protocolos formais: rollback/staging e politica de loop supervisionado. A existencia dos docs permite o Autonomy Gate recomendar `promote_available`, mas nao promove autonomia por si so. `CURRENT_LEVEL` permanece 3 ate commit deliberado em `autonomy-gate.env`.

**Motivo:** o projeto ja atingiu volume de evidencia suficiente para discutir Level 4, mas autonomia maior sem regra de rollback, staging, parada e regressao vira risco operacional. A ordem correta e preparar comando antes de aumentar janela.

**Alternativas rejeitadas:**

- promover Level 4 apenas porque os contadores passaram;
- continuar criando familias funcionais sem doutrina de rollback;
- bloquear a discussao de Level 4 indefinidamente mesmo com evidencias suficientes.

**Camada responsável:** Autonomy Gate, smoke monitoring process, rollback/staging protocol e Level 4 loop policy.

**Impacto:** `18-rollback-staging-protocol.md` e `19-level-4-loop-policy.md` definem zonas de risco, ambiente inicial, rollback, stop conditions, regressao de autonomia, janelas 4A/4B/4C e primeira onda recomendada. `check-autonomy-gate.sh` agora encontra os docs e pode recomendar Level 4, mantendo a promocao manual e versionada.

## 2026-05-25 - Promocao Level 4 deve ser precedida por ensaio em Level 3

**Status:** decidido.

**Decisão:** mesmo com Autonomy Gate retornando `promote_available`, a proxima acao nao e promover. A proxima acao e executar uma rodada `level4-rehearsal-1-dry-run` usando os protocolos Level 4, mas com `CURRENT_LEVEL=3`, limite de 4 micro-slices e promocao proibida durante a onda.

**Motivo:** a evidencia numerica mostra maturidade, mas a disciplina operacional dos novos protocolos precisa ser testada antes de aumentar a janela real de automacao.

**Alternativas rejeitadas:**

- alterar `CURRENT_LEVEL=4` imediatamente;
- ignorar a recomendacao do gate e seguir como se Level 4 nao estivesse pronto para discussao;
- abrir uma nova familia funcional grande antes de ensaiar o comando operacional.

**Camada responsável:** Autonomy Gate, Level 4 rehearsal plan, smoke monitoring process e session handoff.

**Impacto:** `20-level-4-rehearsal-plan.md` declara a onda dry-run, limita escopo a risco verde/amarelo, bloqueia zona vermelha e define criterios de pronto/stop conditions antes de qualquer promocao.

## 2026-05-25 - Workflow Manager vira gate obrigatorio para Level 4

**Status:** decidido.

**Decisão:** criar `slice-gates/workflow-manager.env` e adicionar `workflow-manager` aos slice gates candidatos de Level 4.

**Motivo:** o Workflow Manager e a camada que impede regressao de fase e oficializa transicoes. Se Level 4 aumentar a janela autonoma, esta camada precisa ser uma defesa verificavel, nao apenas uma lista de smokes soltos.

**Alternativas rejeitadas:**

- deixar Workflow Manager apenas como evidencia solta em `smoke-runs.md`;
- promover Level 4 sem exigir essa camada como gate;
- mover o gate para Level 2/3 retroativamente e bloquear a execucao atual sem necessidade.

**Camada responsável:** Autonomy Gate, Slice Completion Gate e Workflow Manager.

**Impacto:** a promocao futura para Level 4 passa a exigir PASS recente em HTTP radar e WhatsApp real para cinco superficies: cadastro completo, nao-mutacao de pergunta lateral, cadastro incompleto, cliente irritado e gatilho tenant. `CURRENT_LEVEL` continua 3 e a promocao continua exigindo alteracao deliberada do gate.

## 2026-05-25 - Promocao deliberada para Level 4A

**Status:** decidido.

**Decisão:** promover `CURRENT_LEVEL` para 4 com label de Level 4A e `MAX_BATCH_SIZE=6`.

**Motivo:** o gate atingiu evidencia suficiente para Level 4: 76 scenarios PASS, 36 WhatsApp reais PASS, `atendimento-lateral`, `cadastro-handoff`, `escalation-manager` e `workflow-manager` PASS, docs 18/19 PASS e zero bloqueadores. A promocao fica limitada ao primeiro degrau 4A para preservar controle operacional.

**Alternativas rejeitadas:**

- permanecer em Level 3 apesar do gate e do ensaio ja estarem saudaveis;
- promover direto para janela 4B/4C;
- abrir Level 4 para zona vermelha, dinheiro, agenda, pagamento, secrets ou tenant real amplo.

**Camada responsável:** Autonomy Gate, Level 4 Loop Policy, Rollback/Staging Protocol e Slice Completion Gates.

**Impacto:** a primeira onda Level 4A pode executar ate 6 micro-slices da mesma onda declarada, somente zona verde/amarela, com HTTP radar e WhatsApp real definitivo quando conversacional. Qualquer falha de CI, deploy, smoke, cleanup, estado, copy risk alto ou gate interrompe a onda e volta para triage.

## 2026-05-25 - Primeira onda Level 4A com gate de seguranca

**Status:** decidido.

**Decisão:** declarar `level4a-wave-1-monitoring-security` e iniciar pelo micro-slice `security-gate`.

**Motivo:** antes de usar a janela maior em comportamento conversacional, a primeira onda 4A deve provar disciplina operacional. Dependabot e `npm audit` precisam virar gate reproduzivel, porque alertas de seguranca abertos sao ruído e risco para qualquer loop maior.

**Alternativas rejeitadas:**

- seguir direto para novo comportamento do bot;
- deixar auditoria de seguranca como checagem manual;
- tratar alerta Dependabot como problema externo ao loop de smoke.

**Camada responsável:** Security Gate, Autonomy Gate, Level 4A Wave Plan.

**Impacto:** `scripts/smoke/check-security-gate.sh` passa a validar `npm audit` na raiz e no `web`, alem de alertas Dependabot abertos via GitHub. Esta onda nao exige WhatsApp real enquanto nao alterar comportamento conversacional.

## 2026-05-25 - Wave Health consolida saude da onda Level 4A

**Status:** decidido.

**Decisão:** criar `scripts/smoke/wave-health.sh` para consolidar Autonomy Gate, Security Gate e estado Git em um unico resumo.

**Motivo:** Level 4A aumenta a janela de execucao. Quanto maior a janela, menor deve ser o custo de checar saude da onda entre micro-slices. Um comando unico reduz risco de esquecer security gate, autonomia ou worktree.

**Alternativas rejeitadas:**

- depender de varios comandos manuais separados;
- colocar essa checagem dentro de smoke conversacional;
- exigir WhatsApp real para uma mudanca puramente operacional.

**Camada responsável:** Smoke Monitoring Process, Security Gate e Autonomy Gate.

**Impacto:** a primeira onda Level 4A passa a ter um comando rapido de saude antes de continuar para o proximo micro-slice. Nao altera comportamento do bot.

## 2026-05-25 - Evidence Index para provas reais

**Status:** decidido.

**Decisão:** criar `scripts/smoke/evidence-index.sh` para listar rapidamente os PASS recentes, separando WhatsApp real de todos os smokes.

**Motivo:** a metodologia exige prova real curta no fechamento de slices. Com dezenas de smokes, procurar manualmente em `smoke-runs.md` aumenta atrito e risco de usar evidencia errada.

**Alternativas rejeitadas:**

- continuar lendo `smoke-runs.md` manualmente;
- duplicar evidencias longas em novos docs;
- acoplar esse indice ao runner de smoke.

**Camada responsável:** Smoke Monitoring Process e Evidence Registry.

**Impacto:** a onda Level 4A ganha um comando rapido para localizar run_id, tipo e pasta de evidencia recente. Nao altera comportamento conversacional e nao exige WhatsApp real novo.

## 2026-05-25 - Stop Audit para freios Level 4A

**Status:** decidido.

**Decisão:** criar `scripts/smoke/level4a-stop-audit.sh` para verificar se as stop conditions criticas continuam documentadas.

**Motivo:** autonomia maior precisa de freios auditaveis. Se os documentos perderem termos como CI/deploy fail, WhatsApp real fail, cleanup inseguro, copy risk alto, secrets, dinheiro/agenda ou triage, a onda deve ser bloqueada antes de seguir.

**Alternativas rejeitadas:**

- confiar apenas na leitura manual dos docs;
- duplicar as stop conditions em comentario sem gate;
- deixar a verificacao para o fim da onda.

**Camada responsável:** Level 4 Loop Policy, Wave Plan e Smoke Monitoring Process.

**Impacto:** a onda Level 4A agora tem um gate documental para impedir que os freios operacionais desaparecam do processo. Nao altera comportamento do bot.

## 2026-05-25 - Closeout da primeira onda Level 4A

**Status:** decidido.

**Decisão:** encerrar `level4a-wave-1-monitoring-security` como concluida e manter autonomia em Level 4A.

**Motivo:** os quatro micro-slices planejados passaram, o commit final teve CI/deploy PASS, `wave-health` final retornou PASS com worktree limpo, `check-security-gate.sh` confirmou npm audit limpo e Dependabot sem alertas abertos. A onda nao alterou comportamento conversacional, entao WhatsApp real nao era gate necessario.

**Alternativas rejeitadas:**

- promover para 4B/4C apos apenas uma onda 4A;
- seguir para nova familia sem closeout registrado;
- exigir WhatsApp real artificial em mudanca puramente operacional.

**Camada responsável:** Level 4 Loop Policy, Wave Health, Security Gate e Autonomy Gate.

**Impacto:** o processo agora tem uma primeira onda Level 4A saudavel como evidencia para futuras decisoes, mas ainda exige outra onda 4A sem falhas antes de discutir 4B.

## 2026-05-25 - Segunda onda Level 4A para QuestionPolicy de cadastro

**Status:** decidido.

**Decisão:** declarar `level4a-wave-2-cadastro-question-policy` como segunda onda Level 4A, com risco amarelo e WhatsApp real definitivo obrigatorio por micro-slice conversacional.

**Motivo:** apos fortalecer os gates operacionais, o melhor proximo ganho premium e corrigir a interpretacao de respostas a perguntas pendentes de cadastro. Essa frente reduz repeticao de perguntas, perda de contexto e transicao errada, sem entrar em preco, pagamento, agenda, secrets ou tenant real amplo.

**Alternativas rejeitadas:**

- promover para 4B antes de uma segunda onda 4A saudavel;
- atacar copy ampla sem contrato de campo pendente;
- voltar para monitoramento sem ganho funcional direto;
- iniciar preco/agenda, que continuam zona de risco maior.

**Camada responsável:** ConversationPolicy, Workflow Manager, Smoke Scenario Registry e Level 4 Loop Policy.

**Impacto:** a proxima execucao deve comecar por `cadastro-question-policy-nome`, com teste local relevante, HTTP radar e WhatsApp real definitivo antes de qualquer proximo micro-slice.

## 2026-05-25 - QuestionPolicy resolve nome pendente sem LLM

**Status:** decidido.

**Decisão:** quando o estado e cadastro, ha pergunta pendente de nome completo e o cliente responde apenas o nome, o `ConversationRouter` deve persistir o campo via `ConversationPolicy` e retomar pedindo data de nascimento.

**Motivo:** nome pendente e um campo simples e deterministico. Chamar LLM para esse caso aumenta latencia e chance de repetir pergunta ja respondida. O caminho novo e estreito: nao captura data, email ou duvida lateral ampla neste micro-slice, e escalonamentos continuam tendo prioridade.

**Alternativas rejeitadas:**

- deixar o LLM interpretar nome simples;
- implementar todos os campos de cadastro no mesmo micro-slice;
- permitir que resposta pendente sobrescreva pedido humano ou escalation;
- aceitar nome+data juntos neste caminho antes do micro-slice de data.

**Camada responsável:** ConversationPolicy, ConversationRouter e Workflow Manager.

**Impacto:** `cadastro-question-policy-nome` passou em teste local, HTTP radar e WhatsApp real. Houve uma falha intermediaria de contrato do smoke (`.conversa` vs `.conversas[0]`), corrigida e revalidada. Provas reais: Cliente "Joao Silva" -> Bot "Me passa tua data de nascimento completa?".

## 2026-05-25 - QuestionPolicy resolve data pendente sem LLM

**Status:** decidido.

**Decisão:** quando o estado e cadastro, ha pergunta pendente de data de nascimento e o cliente responde uma data explicita, o `ConversationRouter` deve persistir a data ISO via `ConversationPolicy` e retomar pedindo e-mail opcional.

**Motivo:** data explicita em formato brasileiro e deterministica. O sistema nao deve chamar LLM para normalizar `12/03/1995`, mas tambem nao deve aceitar idade isolada como data. O gate local cobre esse limite.

**Alternativas rejeitadas:**

- aceitar idade isolada como data;
- liberar handoff antes de email presente ou recusa explicita;
- manter o gate de copy em `baixo`, ja que a mencao a e-mail opcional e esperada e nao e stop condition;
- implementar email e recusa no mesmo micro-slice.

**Camada responsável:** ConversationPolicy, ConversationRouter, Workflow Manager e Smoke Scenario Registry.

**Impacto:** `cadastro-question-policy-data` passou em teste local, HTTP radar e WhatsApp real. Houve uma falha intermediaria de copy-gate (`baixo` vs `medio`) causada pela mencao esperada a e-mail opcional; contrato ajustado para `medio`, mantendo stop real em `copy_risk=alto`. Provas reais: Cliente "12/03/1995" -> Bot "E o e-mail? Se preferir seguir sem, me avisa".

## 2026-05-25 - QuestionPolicy resolve email pendente sem LLM

**Status:** decidido.

**Decisão:** quando o estado e cadastro, ha pergunta pendente de e-mail e o cliente responde um e-mail valido, o `ConversationRouter` deve persistir `dados_cadastro.email` via `ConversationPolicy` e permitir que o `Workflow Manager` avance para `aguardando_tatuador` quando o cadastro e os dados de tattoo ja estiverem completos.

**Motivo:** e-mail valido e um campo simples e deterministico. O bot nao deve chamar LLM nem repetir a pergunta quando a resposta ja satisfaz a pendencia. Como cadastro e tattoo ja estavam completos no setup, a transicao correta e criar `orcid` e preparar handoff para avaliacao do tatuador.

**Alternativas rejeitadas:**

- chamar LLM para interpretar e-mail simples;
- manter o estado em cadastro depois de e-mail valido;
- aceitar texto sem e-mail como resposta valida;
- implementar recusa de e-mail no mesmo micro-slice.

**Camada responsável:** ConversationPolicy, ConversationRouter, Workflow Manager e Smoke Scenario Registry.

**Impacto:** `cadastro-question-policy-email` passou em teste local, HTTP radar e WhatsApp real. O WhatsApp real validou envio pela Evolution `central`, webhook real, persistencia de `joao@example.com`, `estado=aguardando_tatuador`, `orcid=orc_as5blj`, copy risk baixo e logs de decisao Router + Workflow. Provas reais: Cliente "joao@example.com" -> Bot "Fechado, Joao! O tatuador vai avaliar com calma e eu te retorno em breve com o valor certinho.".

## 2026-05-25 - QuestionPolicy resolve recusa de email pendente sem LLM

**Status:** decidido.

**Decisão:** quando o estado e cadastro, ha pergunta pendente de e-mail e o cliente recusa explicitamente informar e-mail, o `ConversationRouter` deve persistir `email=null` e `email_recusado=true` via `ConversationPolicy`, com razão observável `pending_email_refused`, liberando o `Workflow Manager` para avançar se os demais requisitos estiverem completos.

**Motivo:** recusa de e-mail e uma resposta valida porque e-mail e opcional. Insistir no campo aumenta fricção e pode travar handoff mesmo com cadastro obrigatório completo. O fluxo deve diferenciar e-mail fornecido de e-mail recusado para auditoria e para o pacote de handoff.

**Alternativas rejeitadas:**

- chamar LLM para interpretar recusa simples;
- tratar recusa como texto invalido e repetir e-mail;
- persistir string vazia em `email`;
- misturar a validacao da recusa pura com pergunta lateral no mesmo scenario definitivo.

**Camada responsável:** ConversationPolicy, ConversationRouter, Workflow Manager e Smoke Scenario Registry.

**Impacto:** `cadastro-question-policy-email-recusado` passou em teste local, HTTP radar e WhatsApp real. O WhatsApp real validou envio pela Evolution `central`, webhook real, persistencia de `email_recusado=true`, `estado=aguardando_tatuador`, `orcid=orc_bwqoy5`, copy risk baixo e logs de decisao Router + Workflow. Provas reais: Cliente "pode seguir sem email" -> Bot "Fechado, Joao! O tatuador vai avaliar com calma e eu te retorno em breve com o valor certinho.".

## 2026-05-26 - Router responde lateral em cadastro sem perder pendencia

**Status:** decidido.

**Decisão:** quando o estado e cadastro, ha pergunta pendente e o cliente faz uma duvida lateral, o `ConversationRouter` pode responder a duvida com `can_mutate_state=false`, sem persistir campos novos, enquanto o `Workflow Manager` preserva `coletando_cadastro` e a resposta retoma a pergunta pendente.

**Motivo:** atendimento premium nao pode ignorar a duvida do cliente nem abandonar a coleta obrigatoria. A regra correta e responder a duvida lateral e manter a fase atual ate o campo pendente ser respondido.

**Alternativas rejeitadas:**

- chamar LLM para responder uma lateral ja classificada pelo Router;
- avancar para handoff sem data de nascimento;
- persistir dados de cadastro a partir de uma pergunta lateral;
- responder a lateral sem retomar a pergunta pendente.

**Camada responsável:** ConversationRouter, ResponseComposer, Workflow Manager e Smoke Scenario Registry.

**Impacto:** `cadastro-question-policy-lateral` passou em teste local, HTTP radar e WhatsApp real. O WhatsApp real validou envio pela Evolution `central`, webhook real, `estado=coletando_cadastro`, `orcid=null`, sem `data_nascimento`/`email` persistidos, copy risk baixo e logs de decisao Router + Workflow. Provas reais: Cliente "quanto tempo demora?" -> Bot "O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia. Me passa tua data de nascimento completa?".

## 2026-05-26 - Level 4A Wave 2 concluida sem promocao automatica

**Status:** decidido.

**Decisão:** fechar `level4a-wave-2-cadastro-question-policy` como PASS, registrar 4B como elegivel para decisao deliberada e manter 4C bloqueado.

**Motivo:** a onda validou os cinco micro-slices conversacionais planejados com teste local, CI/deploy, HTTP radar e WhatsApp real definitivo. A politica de Level 4 permite discutir 4B apos duas rodadas 4A saudaveis, mas promocao exige commit proprio. 4C exige duas rodadas 4B saudaveis, portanto ainda nao e elegivel.

**Alternativas rejeitadas:**

- promover para 4B automaticamente durante o closeout;
- discutir 4C antes de qualquer rodada 4B;
- iniciar nova familia funcional sem registrar o fechamento da onda;
- tratar falhas intermediarias de contrato como regressao funcional sem evidencia.

**Camada responsável:** Autonomy Gate, Level 4 Loop Policy, Smoke Evidence Registry e Session Handoff.

**Impacto:** `wave-health.sh` final passou com 86 smokes PASS, 41 WhatsApp reais PASS, Security Gate PASS, Dependabot 0 e worktree limpo. Proxima acao deve ser decisao estrategica: promover deliberadamente para 4B ou declarar mais uma onda 4A.

## 2026-05-26 - Promocao deliberada para Level 4B

**Status:** decidido.

**Decisão:** promover a janela operacional para Level 4B, mantendo `CURRENT_LEVEL=4`, alterando `CURRENT_LEVEL_LABEL` para `Level 4B` e `MAX_BATCH_SIZE=8`.

**Motivo:** Wave 1 e Wave 2 de Level 4A fecharam saudaveis, sem blocker, com `wave-health.sh` PASS, Security Gate PASS, 86 smokes PASS e 41 WhatsApp reais PASS. O objetivo e aumentar a janela de execucao supervisionada, nao aumentar o risco funcional.

**Alternativas rejeitadas:**

- manter 4A mesmo com duas ondas saudaveis e evidencia suficiente;
- promover para 4C sem duas rodadas 4B saudaveis;
- liberar zona vermelha, preco, sinal, pagamento, agenda, secrets ou tenant real amplo;
- promover sem commit proprio.

**Camada responsável:** Autonomy Gate e Level 4 Loop Policy.

**Impacto:** primeira onda 4B pode ter ate 8 micro-slices da mesma onda declarada, ainda em zona verde/amarela, com WhatsApp real obrigatorio para qualquer comportamento conversacional e parada em qualquer falha. 4C permanece bloqueado.

## 2026-05-26 - Primeira onda 4B foca smoke multi-turn

**Status:** decidido.

**Decisão:** declarar `level4b-wave-1-multiturn-smoke` como primeira onda Level 4B.

**Motivo:** antes de aumentar a superficie funcional, o maior ganho de seguranca e provar conversas completas com mais de uma mensagem humana no mesmo fluxo. Isso ataca uma lacuna metodologica: smokes single-turn validam respostas isoladas, mas o atendimento premium depende de recuperacao entre turnos.

**Alternativas rejeitadas:**

- iniciar uma onda funcional maior imediatamente apos promover 4B;
- validar recuperacao pos-lateral apenas por inferencia a partir de smokes single-turn;
- promover para 4C;
- tocar preco, sinal, pagamento, agenda, secrets ou tenant real amplo na primeira onda 4B.

**Camada responsável:** Smoke Scenario Registry, runners de smoke, Observabilidade e Workflow Manager.

**Impacto:** a primeira onda 4B fica limitada a infraestrutura de validacao multi-turn e ao fluxo seguro de cadastro `lateral -> data`. Comportamento conversacional novo continua exigindo HTTP radar e WhatsApp real definitivo.

## 2026-05-26 - Runner HTTP multi-turn vira radar oficial

**Status:** decidido.

**Decisão:** implementar `http_multiturn` no runner versionado de scenarios e usar `cadastro-lateral-data-recovery` como primeiro radar multi-turn.

**Motivo:** smokes single-turn nao provam recuperacao entre mensagens. O fluxo `quanto tempo demora?` seguido de `12/03/1995` precisa confirmar que o bot responde a duvida lateral, preserva a pergunta pendente e depois persiste a data sem criar handoff indevido.

**Alternativas rejeitadas:**

- validar a cadeia apenas por dois smokes isolados;
- pular direto para WhatsApp real multi-turn sem radar HTTP;
- considerar PASS sem transcript/judgment raiz;
- aceitar evidencia por step sem indice consolidado.

**Camada responsável:** Smoke Scenario Registry, runner de smoke, Workflow Manager, ConversationRouter e Observabilidade.

**Impacto:** scenarios `http_multiturn` agora executam passos sequenciais, preservam evidencia por step e geram evidencia final consolidada. O primeiro run PASS foi `scenario-cadastro-lateral-data-recovery-20260526T033036Z-11904`. O proximo passo obrigatorio e implementar `whatsapp_real_multiturn` antes de chamar a validacao de definitiva.

## 2026-05-26 - WhatsApp real multi-turn vira validacao definitiva

**Status:** decidido.

**Decisão:** implementar `whatsapp_real_multiturn` no runner versionado e exigir esse caminho como validacao definitiva de fluxos conversacionais encadeados.

**Motivo:** o teste definitivo precisa provar que mensagens sucessivas saem da instancia `central`, entram no numero oficial do bot, chegam pelo webhook real, preservam o estado e passam por Router/Workflow Manager com logs auditaveis.

**Alternativas rejeitadas:**

- considerar HTTP multi-turn suficiente para comportamento conversacional;
- mandar mensagens reais manualmente sem evidence package padronizado;
- validar somente o ultimo turno, sem preservar evidencia por step;
- pular transcript/judgment consolidado.

**Camada responsável:** Smoke Scenario Registry, Evolution Outbound QA, Pipeline WhatsApp real, ConversationRouter, Workflow Manager e Observabilidade.

**Impacto:** o scenario `whatsapp-real-cadastro-lateral-data-recovery` passou com run `scenario-whatsapp-real-cadastro-lateral-data-recovery-20260526T033539Z-27181`. A metodologia fica reforcada: HTTP multi-turn e radar; WhatsApp real multi-turn e prova conclusiva.

## 2026-05-26 - Level 4B Wave 1 concluida sem promocao para 4C

**Status:** decidido.

**Decisão:** fechar `level4b-wave-1-multiturn-smoke` como PASS, manter Level 4B e nao promover para 4C.

**Motivo:** a primeira onda 4B foi saudavel, com HTTP multi-turn, WhatsApp real multi-turn, CI, deploy, Security Gate e Wave Health passando. Ainda assim, 4C exige pelo menos duas ondas 4B saudaveis para provar repetibilidade antes de ampliar autonomia.

**Alternativas rejeitadas:**

- promover para 4C apos uma unica onda 4B;
- abrir uma onda maior sem closeout formal;
- tratar o runner multi-turn como produto final em vez de infraestrutura de validacao;
- relaxar a exigencia de WhatsApp real definitivo em fluxos conversacionais.

**Camada responsável:** Autonomy Gate, Level 4 Loop Policy, Smoke Scenario Registry e Observabilidade.

**Impacto:** a proxima frente deve continuar em Level 4B, com ate 8 micro-slices relacionados, HTTP radar e WhatsApp real definitivo para qualquer comportamento conversacional. 4C segue bloqueado ate pelo menos mais uma onda 4B saudavel.

## 2026-05-26 - Segunda onda 4B foca multi-info de tattoo

**Status:** decidido.

**Decisão:** declarar `level4b-wave-2-tattoo-multi-info` para validar que o bot extrai varias informacoes de tattoo no mesmo turno e nao repete perguntas ja respondidas.

**Motivo:** o mapa de turnos humanos classifica `multi_info` como coleta de alta prioridade. Cliente real frequentemente manda ideia, estilo, local, tamanho/altura juntos. O padrao premium precisa aproveitar esses dados de uma vez, reduzindo friccao e repeticao.

**Alternativas rejeitadas:**

- atacar preco, sinal, pagamento ou agenda nesta onda;
- promover para 4C apos apenas uma onda 4B saudavel;
- fazer copy ampla sem contrato de persistencia;
- validar multi-info apenas por prompt sem HTTP/WhatsApp real.

**Camada responsável:** Agent operacional de tattoo, Prompt de coleta tattoo, Workflow Manager, Smoke Scenario Registry e Observabilidade.

**Impacto:** a nova onda permanece em Level 4B, zona amarela, com primeiro alvo `tattoo-multi-info-basic`: `quero uma rosa fineline no antebraco, tenho 1,70`. O slice so fecha com HTTP radar e WhatsApp real definitivo.

## 2026-05-26 - Multi-info basico deve ser deterministico no Router

**Status:** decidido.

**Decisão:** tratar multi-info basico de tattoo no `ConversationRouter`, persistindo campos seguros sem depender do Agent operacional.

**Motivo:** o primeiro radar HTTP da Wave 2 mostrou que a mensagem `quero uma rosa fineline no antebraco, tenho 1,70` caiu no fallback do Agent operacional depois de latencia alta, sem persistir dados. Ideia, local, estilo e altura sao campos estruturados e podem ser resolvidos com baixo risco pelo Router.

**Alternativas rejeitadas:**

- aumentar apenas timeout do smoke;
- aceitar fallback como resposta valida;
- tentar resolver com copy/prompt antes de criar contrato deterministico;
- seguir para WhatsApp real sem HTTP radar PASS.

**Camada responsável:** ConversationRouter, ConversationPolicy, Workflow Manager e Smoke Scenario Registry.

**Impacto:** o Router passa a emitir intent `multi_info`, `can_mutate_state=true`, `reason=multiple_tattoo_fields_detected` e `dados_persistidos` com os campos encontrados. O smoke so pode fechar apos deploy e revalidacao HTTP + WhatsApp real.

**Validacao:** commit `0923b9e` teve testes locais, CI e deploy PASS. O HTTP radar `scenario-tattoo-multi-info-basic-20260526T035828Z-32439` e o WhatsApp real `scenario-whatsapp-real-tattoo-multi-info-basic-20260526T040309Z-22657` passaram, persistindo `descricao_curta=rosa`, `estilo=fineline`, `local_corpo=antebraço`, `altura_cm=170`, com `orcid=null`, `copy_risk=baixo` e resposta pedindo somente foto do local.

## 2026-05-26 - Governanca multi-agente em Level 4B

**Status:** decidido.

**Decisão:** oficializar multi-agentes como Estado-Maior de apoio, com Commander unico, single-writer por micro-slice, WhatsApp real serial e escrita canonica centralizada.

**Motivo:** agentes paralelos podem acelerar analise, preparo de cenarios, auditoria e triage, mas paralelismo livre reduz rastreabilidade, contamina smoke real e pode gerar falso PASS. O processo premium depende de commit, deploy, HTTP radar, WhatsApp real e evidencia alinhados.

**Alternativas rejeitadas:**

- permitir varios agentes editando comportamento conversacional ao mesmo tempo;
- permitir WhatsApp real paralelo no mesmo telefone/setup;
- permitir que agente paralelo promova autonomia ou feche micro-slice;
- tratar multi-agentes como criterio automatico para 4C.

**Camada responsável:** processo Level 4, Autonomy Gate, Smoke Scenario Registry, Wave Health e governanca de agentes.

**Impacto:** `25-multi-agent-governance.md` passa a ser documento de comando. Level 4B pode usar agentes para leitura/auditoria/preparo, mas a integracao, commit, deploy, WhatsApp real e PASS final continuam centralizados. 4C segue bloqueado.

## 2026-05-26 - Ferramentas metodologicas de onda

**Status:** decidido.

**Decisão:** implementar `wave-runner.sh` e `evidence-registrar.sh` como ferramentas de apoio ao Commander, sem side effects automaticos em producao.

**Motivo:** o loop Level 4B ja possui scripts fortes, mas ainda havia risco operacional por orquestracao manual: esquecer dry-run, registrar evidencia com erro ou perder alinhamento entre run id, artifact e `smoke-runs.md`. As novas ferramentas reduzem atrito sem pular julgamento humano.

**Alternativas rejeitadas:**

- criar um runner que ja execute WhatsApp real em lote;
- editar `smoke-runs.md` automaticamente;
- fazer commit/push automatico pelo runner;
- deixar o registro de evidencia totalmente manual.

**Camada responsável:** Smoke Monitoring Process, Wave Health, Autonomy Gate e Multi-Agent Governance.

**Impacto:** `wave-runner.sh` valida preflight, dry-run, gates e saude da onda; `evidence-registrar.sh` gera uma linha sugerida para `smoke-runs.md`. Ambos preservam Commander unico, WhatsApp real serial e revisao humana da evidencia.

## 2026-05-26 - Gate de evidencia orfa

**Status:** decidido.

**Decisão:** adicionar `evidence-orphan-gate.sh` ao processo de `wave-health`, bloqueando registros quebrados e alertando evidencias completas recentes ainda nao registradas.

**Motivo:** o Level 4B depende de evidencia rastreavel. Um registro em `smoke-runs.md` apontando para pasta inexistente invalida retomada. Ao mesmo tempo, o historico contem tentativas abortadas e controles nao registrados; por isso o modo padrao deve alertar sem bloquear para orfaos recentes, enquanto o modo estrito fica reservado para auditoria/limpeza planejada.

**Alternativas rejeitadas:**

- bloquear todo evidence dir nao registrado imediatamente;
- ignorar divergencias entre `smoke-runs.md` e artifacts;
- apagar ou editar evidencias antigas automaticamente;
- tornar modo estrito padrao antes de limpar historico.

**Camada responsável:** Smoke Monitoring Process, Wave Health, Evidence Index e Multi-Agent Governance.

**Impacto:** `wave-health.sh` agora inclui Evidence Orphan Gate. O gate falha para registro quebrado, emite `WARN` para evidence completa recente nao registrada e pode ser executado com `EVIDENCE_ORPHAN_STRICT=1` para auditoria rigorosa.

## 2026-05-26 - Multi-info separa tamanho da tattoo e altura

**Status:** validado.

**Decisão:** expandir o `ConversationRouter` deterministico para extrair `tamanho_cm` espontaneo sem confundir com `altura_cm`.

**Motivo:** a doutrina de tattoo 4 OBR define `tamanho_cm` como opcional, mas quando o cliente manda no mesmo turno ele deve ser persistido junto com ideia, local, estilo e altura. A frase `5cm, tenho 1,81` precisa virar `tamanho_cm=5` e `altura_cm=181`, sem re-perguntar campos ja respondidos.

**Alternativas rejeitadas:**

- deixar a separacao apenas para o Agent LLM;
- ignorar `tamanho_cm` espontaneo por ser opcional;
- tratar todo numero com `cm` como altura;
- fechar o slice apenas com teste HTTP sem WhatsApp real definitivo.

**Camada responsável:** ConversationPolicy, ConversationRouter, Smoke Scenario e metodologia Level 4B.

**Impacto:** novos cenarios `tattoo-multi-info-height-size` e `whatsapp-real-tattoo-multi-info-height-size` validaram a separacao. O commit `c379f0f` passou em testes locais, CI/deploy, HTTP radar (`scenario-tattoo-multi-info-height-size-20260526T045135Z-29004`) e WhatsApp real em cadeia `central -> bot` (`scenario-whatsapp-real-tattoo-multi-info-height-size-20260526T045323Z-26781`).

## 2026-05-26 - Recuperacao multi-turn de tattoo

**Status:** validado.

**Decisão:** oficializar scenario multi-turn para provar que uma resposta ao campo pendente pode trazer mais de uma informacao e o Router deve persistir todas no mesmo turno.

**Motivo:** na conversa real o cliente nao responde de forma atomica. Depois de o bot perguntar local, `na perna, tenho 1,81` precisa resolver local e altura sem perder contexto, sem repetir pergunta e sem criar orcamento.

**Alternativas rejeitadas:**

- validar apenas por unit test;
- exigir uma mensagem por campo;
- deixar a recuperacao para o Agent LLM sem contrato de smoke;
- exigir `agent-log` em todo step multi-turn mesmo quando o gate de poll/copy ja cobre o objetivo.

**Camada responsável:** ConversationRouter, Smoke Monitoring Process e metodologia Level 4B.

**Impacto:** cenarios `tattoo-multi-info-multiturn-recovery` e `whatsapp-real-tattoo-multi-info-multiturn-recovery` passaram em HTTP multi-turn e WhatsApp real multi-turn. O runner foi ajustado para aceitar `EXPECTED_AGENT_LOG_JQ_TRUE` opcional em steps multi-turn sem abortar a geracao do step env.

## 2026-05-26 - Closeout da Wave 2 Level 4B

**Status:** decidido.

**Decisão:** fechar `level4b-wave-2-tattoo-multi-info` como PASS, manter Level 4B e nao promover para 4C.

**Motivo:** a onda cobriu os tres comportamentos planejados com HTTP radar antes de WhatsApp real definitivo: multi-info basico, separacao entre tamanho da tattoo e altura da pessoa, e recuperacao multi-turn. Todos os PASS mantiveram `copy_risk=baixo`, `orcid=null` e pergunta seguinte coerente sem repetir campos ja persistidos.

**Alternativas rejeitadas:**

- promover para 4C apenas porque a onda fechou sem regressao;
- seguir para nova implementacao sem consolidar evidencias;
- considerar apenas HTTP como evidencia final;
- bloquear a onda por WARN nao bloqueante de evidencia antiga completa sem registro.

**Camada responsável:** Autonomy Gate, Wave Health, Smoke Monitoring Process e documentacao de onda.

**Impacto:** `24-level-4b-wave-2.md`, `current-objective.md` e `09-session-handoff.md` agora registram closeout, provas conclusivas reais e a decisao de manter Level 4B. O proximo passo e declarar uma nova onda funcional em zona verde/amarela antes de tocar comportamento.

## 2026-05-26 - Wave 3 Level 4B para pending answer de tattoo

**Status:** decidido.

**Decisão:** declarar `level4b-wave-3-tattoo-pending-answer-recovery` como proxima onda funcional leve em Level 4B.

**Motivo:** depois de validar multi-info espontaneo, o proximo risco pragmatico e o cliente responder um campo pendente e fazer uma duvida lateral no mesmo turno. Esse caminho ja existe em testes unitarios, mas precisa de contrato HTTP e WhatsApp real para virar comportamento premium rastreavel.

**Alternativas rejeitadas:**

- atacar preco, agenda, sinal ou pagamento nesta rodada;
- promover para 4C antes de outra onda 4B saudavel;
- validar apenas com unit test;
- abrir uma onda ampla de linguagem sem cenarios fechados.

**Camada responsável:** ConversationRouter, ConversationPolicy, Workflow Manager e Smoke Scenario Registry.

**Impacto:** nova onda documentada em `26-level-4b-wave-3.md`; primeiros cenarios versionados sao `tattoo-pending-local-lateral` e `whatsapp-real-tattoo-pending-local-lateral`, validando local pendente + pergunta de tempo/sessoes.

**Validacao inicial:** o primeiro contrato com `quero uma borboleta` falhou por briefing inicial generico demais para o alvo da onda. O contrato foi ajustado para `quero uma borboleta fineline`; depois disso, HTTP multi-turn `scenario-tattoo-pending-local-lateral-20260526T052610Z-24026` e WhatsApp real multi-turn `scenario-whatsapp-real-tattoo-pending-local-lateral-20260526T052659Z-26598` passaram, persistindo `descricao_curta=borboleta`, `estilo=fineline`, `local_corpo=glúteo`, com `orcid=null`, `copy_risk=baixo`, resposta lateral de tempo e retomada de altura.

## Decisões Em Aberto

### Cadastro premium

Wave 2 de `QuestionPolicy` esta pronta para closeout formal. Nao ha campo planejado pendente nesta onda.

### Copy premium de maioridade e menoridade

Resolvido para idade isolada em 2026-05-25:

- frase fria evitada;
- data completa explicada como seguranca e registro de maioridade;
- smoke `cadastro-data-idade-nao-persiste` passou em producao.

Resolvido para menoridade explicita em 2026-05-25:

- data explícita de menor extrai/persiste `data_nascimento`;
- estado final vira `aguardando_tatuador`;
- `orcid` permanece `null`;
- smoke `cadastro-menoridade-handoff-humano` passou em producao.

Ainda falta, em slice futuro, ampliar variações conversacionais de menoridade e expandir `EscalationManager` para outros riscos.

### IntentPolicy

Ainda falta decidir formato final do resolvedor de intenção com:

- `intent`;
- `confidence`;
- `reason`;
- `risk`;
- `can_mutate_state`.

### Catálogo por tenant

Ainda falta decidir se estilos, locais e vocabulário de atendimento serão:

- hardcoded global;
- configuráveis por tenant;
- híbridos com vocabulário base + override por tenant.

## Regra De Atualização

Toda vez que uma nova decisão mudar direção de arquitetura, fluxo, prompt, policy, router, composer, guardrails ou smoke, adicionar uma entrada aqui.

Cada entrada precisa responder:

```text
Decisão:
Motivo:
Alternativas rejeitadas:
Camada responsável:
Impacto:
Status:
```
