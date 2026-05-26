# Current Objective - Atendimento Premium

Este arquivo e o estado vivo da frente. Ele existe para permitir retomada apos compactacao de contexto, troca de aba ou pausa longa sem depender da memoria do chat.

## Objetivo Ativo

```text
Fortalecer o processo de smoke premium ate cobrir envio WhatsApp real, monitoramento completo, transcript legivel e julgamento estruturado da resposta.
```

## Estado Atual

```text
status: level4b_wave_2_em_andamento
branch: main
ultimo_commit: conferir `git log --oneline -1`
deploy: GitHub Actions Deploy to Cloudflare Pages PASS no ultimo commit validado
tests: node --test tests/**/*.test.mjs passou local e no GitHub Actions
prompts_ci: passou no GitHub Actions
worktree_esperado: limpo
ultimo_commit_validado: conferir `git log --oneline -1`
autonomy_level: 4B
autonomy_limit: ate 8 micro-slices da mesma onda declarada
autonomy_recommendation: 4C bloqueado ate duas rodadas 4B saudaveis
```

## Ultimos Marcos

- Workflow Manager implementado para promover cadastro completo para `aguardando_tatuador`.
- Smoke HTTP monitorado oficializado com tail, snapshots, polling, evidencia e `orcid` obrigatorio em handoff.
- Smoke WhatsApp real criado usando Evolution `central` como instancia remetente.
- Polling agora pode exigir a mensagem humana exata via `SMOKE_EXPECT_HUMAN_TEXT`.
- CI estabilizado apos duas falhas de contrato: regex com `braço` acentuado e limite real do prompt `coleta-tattoo`.
- Loop Continuity Protocol criado para retomada apos compactacao.
- `transcript.md` e `judgment.md` integrados aos runners de smoke HTTP e WhatsApp real.
- Scenario registry validado com `cadastro-handoff-email-recusado`; polling agora trata `EXPECTED_STATE` como criterio autoritativo.
- Scenario WhatsApp real `whatsapp-real-cadastro-handoff` validado com Evolution `central` enviando mensagem real para o numero do bot.
- Triage automatica de falhas de scenario criada com `triage.md` e classes operacionais.
- Naturalidade do fechamento de cadastro melhorada; HTTP e WhatsApp real passaram com `copy_risk=baixo`.
- Reanalise automatica de plano criada com `plan-review.md` para falhas `contract_*`.
- Gate formal de conclusao de slice criado com cenarios obrigatorios e PASS recente registrado em `smoke-runs.md`.
- Slice `atendimento-lateral` ganhou cenarios HTTP obrigatorios para preco generico, tempo de sessao e processo; os tres passaram e o gate retornou `slice_completion: pass`.
- Ensaio WhatsApp real para `lateral-preco-generico` passou e virou `FINAL_REHEARSAL_SCENARIO` obrigatorio do gate `atendimento-lateral`.
- Scenario `lateral-portfolio-disponivel` passou com bot text gate e tail gate confirmando acionamento de portfolio.
- Scenario `lateral-historia-vida-homenagem` passou no contrato minimo: acolhimento breve, uma pergunta util e estado seguro.
- Scenario WhatsApp real `whatsapp-real-lateral-historia-vida-homenagem` passou apos correcao do Router/Composer para nao ignorar briefing emocional em primeiro contato.
- Autonomy Gate oficializado para controlar a janela maxima de execucao autonoma por evidencia, slice gates e bloqueadores.
- Primeiro check do Autonomy Gate retornou `decision=promote_available` para Level 2 com 7 scenario PASS, 2 WhatsApp real PASS e `atendimento-lateral` PASS; nivel permanece 1 ate promocao deliberada.
- Micro-slice `pergunta_imagem` iniciado pelo fallback sem midia: scenario HTTP `lateral-pergunta-imagem-sem-midia` passou com reenvio de foto e sem retorno ao formulario.
- Micro-slice `pergunta_imagem` com midia HTTP passou apos suporte de media no runner e guardrail anti-resposta apologetica: imagem persistida, resposta pergunta referencia vs local, `copy_risk=baixo`.
- Micro-slice `pergunta_imagem` com midia WhatsApp real passou: Evolution `central` usou `/message/sendMedia`, webhook registrou imagem/caption real e bot respondeu referencia vs local com `copy_risk=baixo`.
- Scenario WhatsApp real `whatsapp-real-lateral-tempo-sessao` passou: Evolution `central` enviou pergunta de tempo para o bot, webhook registrou humano real e a resposta manteve expectativa segura sem prometer horas, mesmo dia ou sessao certa.
- Scenario WhatsApp real `whatsapp-real-lateral-processo-tatuagem` passou: Evolution `central` enviou pergunta de processo para o bot, webhook registrou humano real e a resposta explicou o fluxo sem expor sistema, erro, preco fechado, agendamento ou sinal.
- Scenario WhatsApp real `whatsapp-real-lateral-portfolio-disponivel` passou: Evolution `central` enviou pedido de portfolio, webhook registrou humano real, resposta nao escreveu URL manual e tail confirmou `/api/tools/enviar-portfolio` HTTP 200.
- Scenario WhatsApp real `whatsapp-real-lateral-pergunta-imagem-sem-midia` passou: Evolution `central` enviou pergunta sobre imagem sem arquivo, webhook registrou humano real sem midia e a resposta pediu reenvio sem voltar ao formulario.
- Autonomy Gate promovido deliberadamente para Level 2 apos `atendimento-lateral` e `cadastro-handoff` passarem, com 14 cenarios recentes e 7 WhatsApp reais; janela maxima agora e 2 micro-slices relacionados por rodada.
- Micro-slice de cadastro `cadastro-data-idade-nao-persiste` encontrou e corrigiu dois gaps: polling aceitava AI anterior ao humano esperado e pipeline persistia `data_nascimento/email` como string vazia. Apos deploy, smoke passou com `dados_cadastro` preservando apenas `nome`.
- Compactacao de contexto corrigida na arquitetura: o bundle de continuidade agora e comando portavel (`scripts/smoke/continuity-bundle.sh --force`) e nao depende apenas de hook Claude Code.
- Copy premium de maioridade ajustada: idade isolada agora pede data completa com seguranca e registro de maioridade, sem frase fria como "idade nao e suficiente"; smoke HTTP em producao passou.
- Menoridade explicita em cadastro validada: `12/03/2015` agora aciona handoff humano seguro, persiste `data_nascimento=2015-03-12`, mantem `orcid=null`, nao chama envio de orcamento e passa bot/tail/poll gates em producao.
- Escalation Manager iniciado: menoridade agora gera `reason_code=minor_age`, `severity=high`, `requires_orcid=false` e mensagem de Telegram rastreavel, com smoke de producao sem regressao.
- Escalation Manager expandido para cobertura textual: `cover_up` agora sai para humano em `aguardando_tatuador`, sem `orcid`, sem coleta normal e sem orçamento automatico; smoke HTTP em producao passou.
- Escalation Manager expandido para pedido explicito de humano/tatuador: `human_requested` agora sai para humano em `aguardando_tatuador`, sem `orcid`, sem coleta normal e sem orcamento automatico; smoke HTTP em producao passou.
- Escalation Manager expandido para cliente irritado: `client_upset` agora sai para humano em `aguardando_tatuador`, sem `orcid`, sem coleta normal e sem orcamento automatico; smoke HTTP em producao passou.
- Observabilidade explicita do Escalation Manager validada: cada handoff humano agora registra um turn `agent_name=escalation_manager` em `agent_turn_logs` com `reason_code`, severidade, fonte, `requires_orcid`, estado final e resposta enviada; smoke HTTP em producao confirmou row `client_upset`.
- Smoke Scenario Registry agora tem gate automatico `EXPECTED_AGENT_LOG_JQ_TRUE`, com polling curto para logs fire-and-forget; o scenario `tattoo-cliente-irritado-handoff` valida comportamento e observabilidade no mesmo run.
- Politica corrigida: HTTP production smoke e radar inicial; WhatsApp real e validacao definitiva por micro-slice conversacional. Foram criados scenarios WhatsApp real para idade isolada, menoridade, cobertura, pedido humano e cliente irritado.
- WhatsApp real retrospectivo passou para os gaps recentes: idade isolada nao persistiu data inventada; menoridade, cobertura, pedido humano e cliente irritado sairam para humano com `orcid=null`, tail limpo e agent-log gate quando aplicavel.
- IntentPolicy/observabilidade do Router iniciado: `ConversationRouter` agora retorna `reason` e `can_mutate_state` junto de `intent`, `confidence` e `risk`; `whatsapp-pipeline` grava esses campos em `agent_turn_logs`; HTTP e WhatsApp real de preco generico passaram exigindo `router_reason=generic_price_question_without_negotiation`.
- IntentPolicy/observabilidade do Router expandido para `tempo_sessao` e `processo_tatuagem`: testes locais, HTTP radar e WhatsApp real passaram exigindo `router_reason`, `router_risk=medium` e `router_can_mutate_state=false`.
- IntentPolicy/observabilidade do Router expandido para `pergunta_imagem` e `historia_vida`: testes locais, HTTP radar e WhatsApp real passaram exigindo `router_reason`, `router_risk=medium` e `router_can_mutate_state=false`.
- Context/Tenant Manager iniciado: montagem de `clientContext` efetivo saiu de `route.js` para `tenant-context-manager.js`; portfolio e contexto de proposta continuam equivalentes, com teste local e validação HTTP/WhatsApp real pelo fluxo `portfolio_disponivel`.
- Autonomy Gate promovido deliberadamente para Level 3 apos recomendacao objetiva: 40 scenarios PASS, 18 WhatsApp reais PASS e gates criticos PASS. A janela atual permite mini-campanha de ate 4 micro-slices da mesma familia, com parada em qualquer falha.
- Autonomy Gate ganhou criterios futuros para recomendar Level 4: 70 scenarios PASS, 35 WhatsApp reais PASS, gates criticos PASS e docs obrigatorios de rollback/staging e politica de loop Level 4.
- Context/Tenant Manager ganhou observabilidade propria em `agent_turn_logs.context_metadata`: HTTP radar e WhatsApp real definitivo passaram exigindo `tenant_context_layer=tenant_context_manager`, `tenant_context_state=tattoo` e `tenant_context_portfolio_disponivel=true`.
- Context/Tenant Manager passou a derivar regras operacionais do tenant (`aceita_cobertura`, gatilhos de handoff) e expor essas regras tambem na telemetria do `ConversationRouter`, cobrindo intents que sao resolvidos antes do Agent operacional.
- Context/Tenant Manager passou a normalizar catalogo de estilos do tenant: `config_agente.estilos_aceitos` tem prioridade, `config_agente.estilo` legado vira fallback rastreavel, prompt recebe estilos aceitos/recusados e a telemetria expõe contagens sem vazar listas completas; HTTP radar e WhatsApp real definitivo passaram no fluxo de portfolio.
- Context/Tenant Manager passou a expor `modo_atendimento` do tenant como metadado operacional seguro; HTTP radar e WhatsApp real definitivo passaram exigindo `tenant_context_modo_atendimento="individual"`.
- Context/Tenant Manager passou a expor perfil de identidade do tenant sem vazar nomes literais: `tenant_profile` registra apenas se agente, estudio e persona estao configurados; HTTP radar e WhatsApp real definitivo passaram exigindo `tenant_context_has_agent_name=true` e `tenant_context_has_studio_name=true`.
- Context/Tenant Manager passou a expor resumo de ativos do tenant sem vazar URLs: `tenant_assets` registra `portfolio_urls_count`; HTTP radar e WhatsApp real definitivo passaram exigindo `tenant_context_portfolio_urls_count=3`.
- Level 4B Wave 2 iniciou a frente `tattoo-multi-info`: o Router agora resolve multi-info basico de tattoo de forma deterministica; HTTP radar e WhatsApp real definitivo passaram para `quero uma rosa fineline no antebraco, tenho 1,70`, persistindo `descricao_curta`, `estilo`, `local_corpo` e `altura_cm`, mantendo `orcid=null` e pedindo somente foto do local.
- Level 4B Wave 2 avancou para separacao de tamanho da tattoo versus altura da pessoa: o Router agora extrai `tamanho_cm` espontaneo junto de `altura_cm`, com testes locais e dry-run dos cenarios `tattoo-multi-info-height-size` e `whatsapp-real-tattoo-multi-info-height-size` passando antes do deploy.
- Governanca multi-agente oficializada: agentes podem acelerar analise, preparo, auditoria e triage, mas Level 4B mantem Commander unico, single-writer por micro-slice, WhatsApp real serial e 4C bloqueado.
- Wave Runner v1 e Evidence Registrar implementados como ferramentas metodologicas: preflight seguro de onda e geracao revisavel de linha para `smoke-runs.md`, sem executar WhatsApp real, sem editar evidencias automaticamente e sem promover autonomia.
- Evidence Orphan Gate integrado ao `wave-health`: registros quebrados passam a bloquear a saude da onda; evidencias completas recentes sem registro aparecem como `WARN` no modo padrao e bloqueiam somente no modo estrito de auditoria.
- Context/Tenant Manager 2.0 iniciado com Tenant Rules Snapshot v1: telemetria agora registra versao do snapshot, origem dos gatilhos de handoff, presenca de gatilhos, catalogo de estilos e estilos aceitos/recusados sem vazar listas ou URLs; HTTP radar e WhatsApp real definitivo passaram no fluxo de portfolio.
- Context/Tenant Manager 2.0 passou a aplicar gatilhos de handoff do tenant no Router deterministico antes do Agent LLM: `rosto` em mensagem com preco lateral sai para humano como `tenant_handoff_trigger`, `workflow_reason=escalation_required`, `source=tenant_rules`, `orcid=null`; HTTP radar e WhatsApp real definitivo passaram.
- Context/Tenant Manager 2.0 ganhou traço observavel do gatilho que bateu: `conversation_router.context_metadata` agora registra `router_has_matched_tenant_trigger` e `router_matched_tenant_trigger`, com HTTP radar e WhatsApp real definitivo exigindo `rosto`.
- Context/Tenant Manager 2.0 propagou o gatilho tenant exato ate o Escalation Manager: `escalation_manager.context_metadata.escalation_matched_tenant_trigger="rosto"` e Telegram interno inclui `Gatilho tenant: rosto`; HTTP radar e WhatsApp real definitivo passaram.
- Handoff Package / Telegram Premium iniciado: Escalation Manager agora monta `handoff_package_v1` com resumo operacional/flags para humano e registra metadados do pacote em `agent_turn_logs`; HTTP radar e WhatsApp real definitivo passaram no fluxo `cliente_irritado`.
- Handoff Package / Telegram Premium expandido para orçamento: texto de Telegram do orçamento inclui `Pacote: handoff_package_v1` e Workflow Manager registra `workflow_handoff_package_required=true`/`workflow_handoff_package_version="handoff_package_v1"`; HTTP radar e WhatsApp real definitivo passaram no fluxo `cadastro-handoff`.
- Handoff Package / Telegram Premium ganhou trace id operacional: Telegram de escalation/orçamento inclui `Trace: hp_*` e `agent_turn_logs` registra `handoff_package_trace_id`/`workflow_handoff_package_trace_id`; HTTP radar e WhatsApp real definitivo passaram no fluxo `cadastro-handoff`.
- Handoff Package / Telegram Premium fechou a mini-campanha Level 3 com Decision Observability nos relatórios: `summary.md`, `transcript.md` e `judgment.md` promovem `trace`, pacote e razão decisória vindos de `agent-turn-logs.json`; HTTP radar e WhatsApp real definitivo passaram.
- Protocolos formais de Level 4 foram preparados sem promover autonomia: rollback/staging e loop supervisionado agora definem zonas de risco, stop conditions, criterios de promocao, regressao e primeira onda recomendada.
- O ensaio Level 4 em Level 3 foi concluido e usado como base para promocao deliberada a Level 4A.
- O Workflow Manager ganhou slice gate formal para futuras promocoes: `workflow-manager` exige HTTP radar e WhatsApp real em cadastro completo, nao-mutacao lateral, cadastro incompleto, cliente irritado e gatilho tenant.
- Autonomy Gate foi promovido deliberadamente para Level 4A: janela inicial de ate 6 micro-slices da mesma onda declarada, sem zona vermelha e com parada em qualquer falha.
- Primeira onda Level 4A declarada: `level4a-wave-1-monitoring-security`, focada em monitoramento, smoke e seguranca operacional sem alterar comportamento conversacional.
- Micro-slice Level 4A `security-gate` fechado: `check-security-gate.sh` valida npm audit da raiz, npm audit do web e Dependabot aberto.
- Micro-slice Level 4A `wave-health-summary` fechado: `wave-health.sh` consolida Autonomy Gate, Security Gate e Git status.
- Micro-slice Level 4A `smoke-evidence-index` fechado: `evidence-index.sh` lista rapidamente os PASS recentes, com foco em WhatsApp real.
- Micro-slice Level 4A `level4a-stop-audit` fechado: `level4a-stop-audit.sh` verifica se stop conditions criticas seguem documentadas.
- Onda Level 4A `level4a-wave-1-monitoring-security` concluida com CI PASS, deploy PASS, `wave-health` PASS, Security Gate PASS, Dependabot 0 e worktree limpo; WhatsApp real nao foi exigido porque a onda nao alterou comportamento conversacional.
- Segunda onda Level 4A declarada: `level4a-wave-2-cadastro-question-policy`, risco amarelo, focada em respostas de cadastro pendente com HTTP radar e WhatsApp real definitivo por micro-slice conversacional.
- Micro-slice `cadastro-question-policy-nome` fechado: nome completo pendente agora e resolvido deterministicamente pela ConversationPolicy/Router sem LLM; HTTP radar e WhatsApp real `central -> bot` passaram com `nome="Joao Silva"`, `data_nascimento=null`, `orcid=null`, `copy_risk=baixo` e agent-log `cadastro_pending_answer`.
- Micro-slice `cadastro-question-policy-data` fechado: data de nascimento pendente agora e resolvida deterministicamente pela ConversationPolicy/Router sem LLM; HTTP radar e WhatsApp real `central -> bot` passaram com `data_nascimento="1995-03-12"`, `orcid=null`, `copy_risk=medio` e agent-log `pending_data_nascimento_answered`.
- Workflow Manager passou a registrar decisao propria em `agent_turn_logs`: cadastro completo com recusa de email agora confirma `workflow_layer=workflow_manager`, `workflow_transition_allowed=true` e `workflow_reason=cadastro_and_tattoo_complete`; HTTP radar e WhatsApp real definitivo passaram no fluxo `cadastro-handoff`.
- Workflow Manager passou a impor nao-mutacao para intents laterais do Router com `can_mutate_state=false`: preco generico preservou `estado=coletando_tattoo` e registrou `workflow_reason=state_preserved_by_router_policy`; HTTP radar e WhatsApp real definitivo passaram exigindo Router + Workflow Manager no mesmo turno.
- Workflow Manager passou a calcular requisitos faltantes exatos por fase e expor bloqueio formal de cadastro incompleto: idade isolada preservou `estado=coletando_cadastro`, `data_nascimento=null`, `orcid=null` e registrou `workflow_reason=requirements_missing` com contagens de faltantes; HTTP radar e WhatsApp real definitivo passaram.
- Workflow Manager passou a oficializar transicoes de escalation/handoff humano: cliente irritado saiu para `aguardando_tatuador` sem `orcid`, sem orçamento automatico e com `workflow_reason=escalation_required` ligado ao `EscalationManager`; HTTP radar e WhatsApp real definitivo passaram.

## Ultimo Smoke PASS De Referencia

```text
run_id_http: scenario-cadastro-lateral-data-recovery-20260526T033036Z-11904
run_id_real: scenario-whatsapp-real-cadastro-lateral-data-recovery-20260526T033539Z-27181
tipo: Scenario WhatsApp real multi-turn
base_url: central -> bot (*2357)
telefone: 5521970789797
expected_state: coletando_cadastro
orcid: null
evidence: .smoke-evidence/scenario-whatsapp-real-cadastro-lateral-data-recovery-20260526T033539Z-27181/
```

Mensagem:

```text
quanto tempo demora?
12/03/1995
```

Resultado:

```text
estado_agente: coletando_cadastro
resposta_ai_posterior_ao_humano: true
orcid: null
dados_cadastro.nome: Joao Silva
dados_cadastro.data_nascimento: 1995-03-12
dados_cadastro.email: null
step_1_copy_risk: baixo
step_2_copy_risk: medio
copy: responde tempo de sessao, retoma data, persiste data e pede e-mail opcional
decision_observability: step 1 confirmou Workflow Manager state_preserved_by_router_policy; step 2 confirmou Router pending_data_nascimento_answered
decision_chain: pergunta lateral durante cadastro -> preserva pergunta pendente -> resposta de data no turno seguinte persiste corretamente
chain: Evolution central -> WhatsApp real -> bot -> webhook -> pipeline -> resposta -> poll -> agent-log gates por step
```

## Proximo Ataque

```text
Proximo passo recomendado: executar micro-slice `tattoo-multi-info-basic-http` da onda `level4b-wave-2-tattoo-multi-info`.
```

Escopo recomendado:

- rodar `check-autonomy-gate.sh` antes de iniciar nova rodada;
- rodar `wave-health.sh` e `check-security-gate.sh` antes de tocar codigo;
- manter `CURRENT_LEVEL=4` e `MAX_BATCH_SIZE=8`;
- seguir a onda declarada em `docs/atendimento-premium/23-level-4b-wave-1.md`;
- validar comportamento conversacional com teste local relevante, HTTP radar e WhatsApp real definitivo;
- nova onda declarada: `level4b-wave-2-tattoo-multi-info`;
- primeiro comportamento alvo: cliente manda ideia + estilo + local + altura no mesmo turno;
- manter Level 4B; nao promover 4C ate pelo menos mais uma onda 4B saudavel;
- manter `workflow-manager` como gate obrigatorio para qualquer discussao futura de Level 4;
- nao tocar preco, sinal, pagamento, agenda, secrets ou tenant real amplo;
- nao subir para 4C; 4C exige duas rodadas 4B saudaveis.

Leitura recomendada:

```text
4B promovido por decisao deliberada apos Wave 1 e Wave 2 Level 4A saudaveis.
Primeira onda 4B deve permanecer em zona verde/amarela.
Primeira onda 4B declarada: `level4b-wave-1-multiturn-smoke`.
4C permanece bloqueado.
```

## Comando De Retomada

Ao iniciar nova sessao ou apos compactacao:

```bash
git status --short
git log --oneline -5
bash scripts/smoke/continuity-bundle.sh --force
sed -n '1,220p' docs/atendimento-premium/current-objective.md
sed -n '1,220p' docs/atendimento-premium/smoke-runs.md
sed -n '1,220p' docs/atendimento-premium/12-loop-continuity-protocol.md
bash scripts/smoke/check-autonomy-gate.sh
```

## Regras De Atualizacao

Atualizar este arquivo quando:

- mudar o objetivo ativo;
- um smoke virar referencia de PASS ou FAIL;
- houver deploy relevante;
- houver commit que mude o proximo passo;
- uma compactacao/retomada exigir contexto que nao esta em nenhum outro arquivo.

Nao registrar detalhes longos aqui. Detalhes longos ficam no evidence, decision log ou docs especificas.
