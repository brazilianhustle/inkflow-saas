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
