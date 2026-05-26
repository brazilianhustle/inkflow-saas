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

## Decisões Em Aberto

### Cadastro premium

Ainda falta decidir e implementar a extensão da `QuestionPolicy` para:

- nome completo;
- data de nascimento;
- email;
- recusa de email;
- dúvidas laterais durante cadastro.

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
