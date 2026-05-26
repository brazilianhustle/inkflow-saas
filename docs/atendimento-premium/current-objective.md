# Current Objective - Atendimento Premium

Este arquivo e o estado vivo da frente. Ele existe para permitir retomada apos compactacao de contexto, troca de aba ou pausa longa sem depender da memoria do chat.

## Objetivo Ativo

```text
Fortalecer o processo de smoke premium ate cobrir envio WhatsApp real, monitoramento completo, transcript legivel e julgamento estruturado da resposta.
```

## Estado Atual

```text
status: level4b_wave_21_micro_slice_1_pass
branch: main
ultimo_commit: 019cb28 docs: validate wave 21 cadastro batch
ultimo_commit_funcional: b94ca29 fix: escalate minor birthdate in router
deploy: PASS no commit 5fe5ae5; Wave 21 micro-slice 1 sem mudanca funcional no bot
tests: bash -n run-scenario PASS; Wave 21 micro-slice 1 HTTP + WhatsApp real PASS
prompts_ci: PASS no GitHub Actions
worktree_esperado: limpo
ultimo_commit_validado: 019cb28 + Wave 21 micro-slice 1 por HTTP + WhatsApp real
autonomy_level: 4B
autonomy_limit: ate 8 micro-slices da mesma onda declarada
autonomy_recommendation: manter 4B; 4C segue bloqueado ate nova decisao deliberada
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
- Level 4B Wave 2 validou separacao de tamanho da tattoo versus altura da pessoa: o Router agora extrai `tamanho_cm` espontaneo junto de `altura_cm`; testes locais, CI/deploy, HTTP radar e WhatsApp real definitivo passaram para `quero uma rosa fineline na perna de 5cm, tenho 1,81`, persistindo `tamanho_cm=5` e `altura_cm=181`.
- Level 4B Wave 2 validou recuperacao multi-turn: `quero uma rosa fineline` persistiu descricao/estilo e perguntou local; `na perna, tenho 1,81` persistiu local/altura no mesmo turno e pediu foto. HTTP multi-turn e WhatsApp real multi-turn passaram.
- Level 4B Wave 2 foi consolidada em closeout: evidencias HTTP + WhatsApp real dos tres comportamentos foram registradas, `wave-health` PASS, `security-gate` PASS, `evidence-orphan-gate` PASS com um WARN nao bloqueante antigo, e decisao de manter Level 4B sem promover 4C.
- Level 4B Wave 3 declarada: `level4b-wave-3-tattoo-pending-answer-recovery`, foco leve em respostas a campos pendentes de tattoo junto de duvidas laterais, sem preco/agenda/secrets e com WhatsApp real definitivo por comportamento conversacional.
- Level 4B Wave 3 validou o primeiro comportamento: local pendente + pergunta lateral de tempo/sessoes. HTTP multi-turn e WhatsApp real multi-turn passaram para `quero uma borboleta fineline` -> `bunda\nquantas sessoes seria?`, persistindo `local_corpo=glúteo`, respondendo tempo e retomando altura.
- Level 4B Wave 3 validou o segundo comportamento: altura pendente + pergunta lateral de tempo/sessoes. HTTP multi-turn e WhatsApp real multi-turn passaram para `quero uma baleia fineline na barriga` -> `tenho 1.70\nquanto tempo demora?`, persistindo `altura_cm=170`, respondendo tempo e pedindo foto do local.
- Level 4B Wave 3 fechou PASS com o terceiro comportamento: estilo pendente + pergunta lateral de tempo/sessoes. HTTP multi-turn e WhatsApp real multi-turn passaram para `quero uma hiena na panturrilha, tenho 1.70` -> `realismo\nem quantas sessoes seria?`, persistindo `estilo=realismo`, respondendo tempo e pedindo foto do local.
- Proximo upgrade recomendado do piloto automatico: criar `wave-closeout-summarizer` revisavel para gerar Evidence Summary e provas conclusivas reais a partir de evidencias ja validadas, sem commit automatico e sem executar WhatsApp real em lote.
- `wave-closeout-summarizer` implementado como ferramenta read-only: gera Evidence Summary, estado final, ORCID, copy risk, dados persistidos, provas reais Cliente/Bot e decisao sugerida a partir de evidence dirs. A ferramenta nao executa smoke, nao edita docs, nao commita e nao promove 4C.
- Level 4B Wave 4 declarada: `level4b-wave-4-tattoo-media-intake`, foco em foto/midia dentro da coleta de tattoo. Primeiro contrato valida foto do local quando o bot ja pediu a foto: setup controlado, HTTP radar e WhatsApp real definitivo usando imagem real enviada pela Evolution `central`.
- Level 4B Wave 4 fechou o primeiro comportamento: foto do local aguardada agora e resolvida deterministicamente sem LLM quando os dados principais de tattoo ja existem. HTTP radar e WhatsApp real `central -> bot` passaram com `foto_local_msg_id` presente, `refs_imagens_msg_ids` ausente, `estado=coletando_cadastro`, `orcid=null` e `copy_risk=baixo`.
- Level 4B Wave 4 fechou o segundo comportamento: foto posterior com `foto_local_msg_id` ja existente agora vira referencia deterministica sem chamar LLM. HTTP radar e WhatsApp real `central -> bot` passaram preservando `foto_local_msg_id=599`, adicionando 1 item em `refs_imagens_msg_ids`, mantendo `estado=coletando_cadastro`, `orcid=null` e `copy_risk=baixo`.
- Level 4B Wave 4 fechou o terceiro comportamento: foto unica sem legenda clara, sem pedido pendente de foto local, agora pede classificacao entre referencia e local do corpo sem chamar LLM. HTTP radar e WhatsApp real `central -> bot` passaram preservando dados de tattoo, adicionando 1 item em `refs_imagens_msg_ids`, mantendo `foto_local_msg_id=null`, `estado=coletando_tattoo`, `orcid=null` e `copy_risk=baixo`.
- Monitoramento media-only foi fortalecido: runners aceitam mensagem vazia com midia, polling exige IA nova posterior ao humano e evidencias da Evolution omitem base64/thumbnail grande.
- Level 4B Wave 4 fechou closeout PASS: `wave-health` PASS, Autonomy Gate keep, Security Gate PASS, Dependabot 0, Evidence Orphan Gate PASS com WARNs historicos nao bloqueantes e decisao de manter Level 4B sem promover 4C.
- Level 4B Wave 5 declarada: `level4b-wave-5-ambiguous-media-confirmation`, foco em confirmar foto ambigua como local ou referencia. A confirmacao curta agora e caminho deterministico no pipeline, sem LLM.
- Level 4B Wave 5 fechou PASS: confirmacao de foto ambigua como local e como referencia passaram em HTTP radar e WhatsApp real definitivo. Provas reais: Cliente "é local do corpo" -> Bot "Perfeito, então vou usar essa imagem como foto do local. Pra liberar teu orçamento personalizado, me passa nome completo e data de nascimento?"; Cliente "é referência do desenho" -> Bot "Perfeito, deixei essa imagem como referência do desenho. Agora preciso da foto do local do corpo onde tu quer tatuar."
- Level 4B Wave 6 fechou PASS: referencia confirmada seguida de foto local passou em teste local, HTTP radar e WhatsApp real definitivo. A nova foto virou `foto_local_msg_id`, a referencia `[11951]` permaneceu preservada e o estado avancou para `coletando_cadastro`. Prova real: Cliente "segue foto do local" + imagem -> Bot "Recebi a foto do local. Pra liberar teu orçamento, preciso do teu nome completo."
- Level 4B Wave 7 fechou PASS: cadastro pos-midia aceitou nome e data sem voltar para coleta de tattoo, preservando `foto_local_msg_id=12632`, `refs_imagens_msg_ids=[11951]` e `orcid=null`. Provas reais: Cliente "Joao Silva" -> Bot "Me passa tua data de nascimento completa?"; Cliente "12/03/1995" -> Bot "E o e-mail? Se preferir seguir sem, me avisa".
- Licao de processo da Wave 7: um HTTP smoke falhou antes do deploy do commit funcional; regra reforcada: quando houver mudanca de codigo, CI/deploy PASS vem antes de qualquer smoke de producao.
- Level 4B Wave 8 fechou PASS: recusa de email apos midia criou `orcid`, promoveu `aguardando_tatuador`, preservou `foto_local_msg_id=12632` e `refs_imagens_msg_ids=[11951]`, e registrou Workflow Manager com `handoff_package_v1`. Prova real: Cliente "pode seguir sem email\nquanto tempo demora?" -> Bot respondeu tempo de sessao e confirmou avaliacao do tatuador.
- Level 4B Wave 9 fechou PASS: email valido apos midia criou `orcid`, promoveu `aguardando_tatuador`, preservou `foto_local_msg_id=12632` e `refs_imagens_msg_ids=[11951]`, registrou Router `pending_email_answered` e Workflow Manager com `handoff_package_v1`. Prova real: Cliente "joao@example.com" -> Bot "Fechado, Joao! O tatuador vai avaliar com calma e eu te retorno em breve com o valor certinho."
- Governanca multi-agente oficializada: agentes podem acelerar analise, preparo, auditoria e triage, mas Level 4B mantem Commander unico, single-writer por micro-slice, WhatsApp real serial e 4C bloqueado.
- Wave Runner v1 e Evidence Registrar implementados como ferramentas metodologicas: preflight seguro de onda e geracao revisavel de linha para `smoke-runs.md`, sem executar WhatsApp real, sem editar evidencias automaticamente e sem promover autonomia.
- Evidence Orphan Gate integrado ao `wave-health`: registros quebrados passam a bloquear a saude da onda; evidencias completas recentes sem registro aparecem como `WARN` no modo padrao e bloqueiam somente no modo estrito de auditoria.
- Level 4B Wave 10 fechou PASS: auditoria do pacote Telegram pos-midia provou envio real de 2 imagens ao Telegram, persistencia de `foto_local_file_id` e `refs_imagens_file_ids`, HTTP radar PASS e WhatsApp real definitivo PASS pela instancia `central`.
- Processo de smoke fortalecido: seeds de mídia devem usar arquivos reais versionados, `run-scenario.sh` agora aguarda side-effects de tail/poll antes dos gates e regex de tail aceita logs JSON escapados.
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
- Wave 11 validou midia adicional pos-handoff: em `aguardando_tatuador`, nova imagem enviada pelo cliente e reencaminhada ao tatuador, sem reabrir coleta e sem nova resposta AI apos o humano; HTTP radar e WhatsApp real definitivo passaram.
- Wave 12 validou texto adicional pos-handoff: em `aguardando_tatuador`, nova mensagem enviada pelo cliente e reencaminhada ao tatuador, sem reabrir coleta e sem nova resposta AI apos o humano; HTTP radar e WhatsApp real definitivo passaram.
- Wave 13 validou menoridade explicita sem data: em `cadastro`, `tenho 16 anos` sai para humano, preserva `data_nascimento=null`, `orcid=null`, nao cria orcamento e registra Router `minor_age_explicit` + Escalation Manager `minor_age`; HTTP radar e WhatsApp real definitivo passaram.
- Wave 14 declarada: `level4b-wave-14-cadastro-email-refusal-variants`, foco leve em recusas naturais de e-mail opcional, começando por `prefiro falar por aqui`.
- Wave 14 micro-slice 1 passou: `prefiro falar por aqui` agora vira `email_recusado=true`, cria `orcid`, promove `aguardando_tatuador` e passa HTTP radar + WhatsApp real definitivo.
- Wave 14 micro-slice 2 passou: `melhor falar por aqui` tambem vira `email_recusado=true`, cria `orcid`, promove `aguardando_tatuador` e passa HTTP radar + WhatsApp real definitivo.
- Wave 14 micro-slice 3 passou: `por aqui mesmo` tambem vira `email_recusado=true`, cria `orcid`, promove `aguardando_tatuador` e passa HTTP radar + WhatsApp real definitivo.
- Wave 15 declarada: `level4b-wave-15-minor-age-natural-variants`, foco leve em menoridade natural no cadastro, sem preco, agenda, pagamento, secrets ou 4C.
- Wave 15 micro-slice 1 passou: `sou menor de idade` sai para humano, preserva `data_nascimento=null`, `orcid=null`, nao cria orcamento e passa HTTP radar + WhatsApp real definitivo.
- Wave 15 micro-slice 2 passou: `tenho 17 anos` sai para humano, preserva `data_nascimento=null`, `orcid=null`, nao cria orcamento e passa HTTP radar + WhatsApp real definitivo.
- Continue implicito oficializado: quando todos os gates estao verdes e nao ha decisao humana pendente, resposta curta de continuidade ou ausencia de nova direcao autoriza seguir para o proximo micro-slice logico da mesma onda declarada; qualquer stop condition continua parando o loop.
- Wave 16 micro-slice 1 passou: `minha mae autorizou` sai para humano como sinal indireto de menoridade por responsavel legal, preserva `data_nascimento=null`, `orcid=null`, nao cria orcamento e passa HTTP radar + WhatsApp real definitivo.
- Wave 16 micro-slice 2 passou: `tenho autorizacao dos meus pais` sai para humano como segunda variacao de menoridade indireta por responsavel legal, preserva `data_nascimento=null`, `orcid=null`, nao cria orcamento e passa HTTP radar + WhatsApp real definitivo.
- Wave 17 iniciada como auditoria de naturalidade read-only: `naturalness-audit.sh` analisou 10 evidencias WhatsApp real ja aprovadas, encontrou 0 risco alto, 9 risco medio por rigidez/template ou multi-pergunta e 1 risco baixo; decisao `watchlist`, sem mudanca conversacional nesta primeira passada.
- Wave 17 micro-slice 2 passou: fechamento deterministico de cadastro/handoff ficou menos rigido (`Boa, Joao. Deixei as infos separadas...`), com testes locais, CI, Prompts CI, eval gate, deploy, HTTP radar e WhatsApp real definitivo pela `central` todos PASS.
- Wave 17 micro-slice 3 iniciou a arquitetura escalavel de naturalidade: `conversation-voice-policy.js` centraliza familias deterministicas de cadastro e midia/cadastro; Router e Pipeline passaram a importar a policy sem alterar texto ao cliente; testes locais passaram.
- Wave 17 micro-slice 4 passou: copy deterministica de mídia/cadastro deixou de usar `Pra liberar teu orçamento` e passou para `Agora me passa teu nome completo pra eu montar o cadastro`; testes locais, CI/deploy, HTTP radar e WhatsApp real definitivo pela `central` passaram com `copy_risk=baixo`.
- Wave 17 micro-slice 5 passou: retomada deterministica de cadastro vazio mudou de `Pra liberar teu orçamento...` para `Pra montar teu cadastro...`; testes locais, CI, deploy, HTTP radar e WhatsApp real definitivo pela `central` passaram com `copy_risk=baixo`.
- Wave 17 micro-slice 6 passou sem mudança de código: cenários atuais de mídia/cadastro `ambiguous-confirm-local` e `reference-then-local` foram revalidados em HTTP radar e WhatsApp real definitivo; ambos saíram com `copy_risk=baixo`, confirmando que os riscos médios restantes eram evidências antigas.
- Wave 17 micro-slice 7 passou: abertura lateral de primeiro contato removeu a pergunta retórica da saudação (`tudo bem.`), preservou a pergunta operacional, e validou preço/tempo/processo com HTTP radar + WhatsApp real definitivo; auditoria subiu para 9 baixo, 3 médio, 0 alto.
- Execucao funcional travada para investigacao Supabase: causa provavel e conectividade/DNS intermitente entre ambiente local/sandbox e Supabase durante incidente de provedor no Brasil. Metodologia corrigida: `run-scenario.sh` agora faz preflight Supabase antes de cleanup/seed, scripts REST usam timeout e triage classifica `infra_supabase_connectivity`.
- Investigacao Supabase concluida para a rodada: primeira tentativa WhatsApp real no sandbox foi bloqueada corretamente por `infra_supabase_connectivity`; rerun fora do sandbox passou com Supabase preflight 200, confirmando falha de DNS/rede do ambiente e nao regressao do bot.

## Ultimo Smoke PASS De Referencia

```text
run_id_http: scenario-cadastro-handoff-email-recusado-20260526T203228Z-29078
run_id_real: scenario-whatsapp-real-cadastro-handoff-20260526T203258Z-19586
tipo: Scenario WhatsApp real de cadastro-handoff basico da Wave 18
base_url: central -> bot (*2357)
telefone: 5521970789797
expected_state: aguardando_tatuador
orcid: orc_24av8g
evidence: .smoke-evidence/scenario-whatsapp-real-cadastro-handoff-20260526T203258Z-19586/
```

Mensagem:

```text
pode seguir sem email
quanto tempo demora?
```

Resultado:

```text
estado_agente: aguardando_tatuador
resposta_ai: O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.

Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor.
orcid: orc_24av8g
copy_risk: baixo
workflow: cadastro completo com email recusado promoveu para aguardando_tatuador com handoff_package_v1
observabilidade: Workflow Manager cadastro_and_tattoo_complete + trace hp_*
decision_chain: Evolution central -> WhatsApp real -> bot -> webhook -> recusa de email + lateral tempo -> Workflow Manager cria handoff de orcamento -> resposta lateral + fechamento ao cliente
```

## Proximo Ataque

```text
Proximo passo recomendado: Wave 21 fechada; iniciar Wave 22 com auditoria de jornada longa real no WhatsApp. Manter Level 4B; 4C bloqueado.
```

Atualizacao 2026-05-26 21:58 UTC:

- Wave 21 fechada com PASS.
- Decisao: nao atacar segunda variacao batch agora porque o ganho seria marginal diante da cobertura ja existente de e-mail/recusa.
- Nova Wave 22 declarada: `level4b-wave-22-long-journey-real-audit`.
- Objetivo da Wave 22: validar jornadas reais mais longas no WhatsApp, com transcript, judgment, estado coerente e provas conclusivas reais.
- Primeiro ataque recomendado: jornada com duvida lateral, coleta de tattoo, midia, cadastro, recusa de e-mail e handoff.
- Provas conclusivas reais da Wave 21: Cliente `Joao Silva / 12/03/1995 / como funciona o orçamento?`; Bot `Funciona assim: eu entendo tua ideia, junto as infos principais e o tatuador avalia pra passar valor e horário. E o e-mail? Se preferir seguir sem, me avisa`.

Atualizacao 2026-05-26 22:10 UTC:

- Wave 22 Jornada 1 preparada com cenarios `long-journey-lateral-media-cadastro-handoff` e `whatsapp-real-long-journey-lateral-media-cadastro-handoff`.
- Falha util inicial no HTTP radar: step 3 com midia ficou em `coletando_tattoo`; causa identificada como ausencia de `tentativas_foto_local` apos o Router pedir foto no fluxo `multi_info` sem seed.
- Correcao minima aplicada: `conversation-router` persiste `tentativas_foto_local=1` quando multi-info resolve os campos principais e a proxima pergunta e foto do local.
- Runner fortalecido: multi-turn agora propaga `SMOKE_MEDIA_FILE_N`, `SMOKE_MEDIA_BASE64_N` e `SMOKE_MEDIA_MIMETYPE_N` por etapa.
- Validacao local PASS: `bash -n scripts/smoke/run-scenario.sh`, testes focados 129/129 e `npm test` 1211/1211.
- Proximo passo obrigatorio antes do WhatsApp real: commit + push + CI/deploy PASS, depois rerodar HTTP radar da mesma jornada longa e somente entao WhatsApp real definitivo.

Atualizacao 2026-05-26 21:44 UTC:

- Wave 21 micro-slice 1 passou.
- Novo seed local `seed_cadastro_aguardando_nome_data` criado para smoke.
- HTTP radar `scenario-cadastro-batch-nome-data-lateral-20260526T214326Z-27063` PASS.
- WhatsApp real definitivo `scenario-whatsapp-real-cadastro-batch-nome-data-lateral-20260526T214404Z-5218` PASS.
- Estado final `coletando_cadastro`, `orcid=null`, `nome=Joao Silva`, `data_nascimento=1995-03-12`.
- Router observavel: `processo_tatuagem`, `tattoo_process_or_booking_flow_question`.
- `copy_risk=medio` aceito porque o proximo campo correto e e-mail opcional.
- Provas conclusivas reais: Cliente `Joao Silva\n12/03/1995\ncomo funciona o orçamento?`; Bot `Funciona assim: eu entendo tua ideia, junto as infos principais e o tatuador avalia pra passar valor e horário.\n\nE o e-mail? Se preferir seguir sem, me avisa`.
- Triage: duas tentativas foram bloqueadas por `infra_supabase_connectivity` no sandbox antes de executar; uma tentativa HTTP revelou contrato muito rigido, corrigido para a telemetria real.

Atualizacao 2026-05-26 21:39 UTC:

- Wave 21 declarada: `level4b-wave-21-cadastro-batch-fields`.
- Objetivo: validar nome + data + duvida lateral no mesmo envio, sem repetir campos ja persistidos e sem criar `orcid` prematuro.
- Novos cenarios: `cadastro-batch-nome-data-lateral` e `whatsapp-real-cadastro-batch-nome-data-lateral`.
- Novo seed metodologico: `seed_cadastro_aguardando_nome_data`, sem mudanca funcional no bot.
- Fora de escopo: preco fechado, agenda, pagamento, sinal, secrets, 4C.

Atualizacao 2026-05-26 21:36 UTC:

- Wave 20 fechada com PASS.
- Cobertura final: cadastro pendente de data com recuperacao multi-turn + cadastro vazio com retomada nome/data.
- Todos os cenarios principais passaram em HTTP radar e WhatsApp real definitivo pela instancia `central`.
- `wave-health` PASS, Security Gate PASS, Dependabot 0, Evidence Orphan Gate PASS com WARNs historicos nao bloqueantes.
- Decisao: manter Level 4B, nao promover 4C.
- Provas conclusivas reais: Cliente `quanto tempo demora?`; Bot `O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.` Cliente `12/03/1995`; Bot `E o e-mail? Se preferir seguir sem, me avisa`. Cliente `quanto tempo demora?`; Bot respondeu tempo e retomou `Pra montar teu cadastro, me passa teu nome completo e data de nascimento?`.

Atualizacao 2026-05-26 21:33 UTC:

- Wave 20 micro-slice 2 passou sem mudanca de codigo.
- HTTP radar `scenario-cadastro-resume-nome-data-natural-20260526T213201Z-8633` PASS.
- WhatsApp real definitivo `scenario-whatsapp-real-cadastro-resume-nome-data-natural-20260526T213232Z-28275` PASS.
- Estado final `coletando_cadastro`, `orcid=null`, `dados_cadastro={}`.
- Workflow Manager confirmou `state_preserved_by_router_policy`.
- `copy_risk=baixo`.
- Provas conclusivas reais: Cliente `quanto tempo demora?`; Bot `O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.` Retomada no mesmo turno: `Pra montar teu cadastro, me passa teu nome completo e data de nascimento?`.
- Leitura estrategica: a familia principal de recuperacao de cadastro apos lateral ja tem cobertura suficiente para fechar a Wave 20, salvo decisao de atacar uma terceira variacao estreita.

Atualizacao 2026-05-26 21:17 UTC:

- Wave 20 micro-slice 1 passou sem mudanca de codigo.
- HTTP radar `scenario-cadastro-lateral-data-recovery-20260526T211602Z-31472` PASS.
- WhatsApp real definitivo `scenario-whatsapp-real-cadastro-lateral-data-recovery-20260526T211646Z-28418` PASS.
- Estado final `coletando_cadastro`, `orcid=null`, nome preservado e `data_nascimento=1995-03-12`.
- Step 1 confirmou Workflow Manager `state_preserved_by_router_policy` apos pergunta lateral `quanto tempo demora?`.
- Step 2 confirmou Router `pending_data_nascimento_answered` apos `12/03/1995`.
- Provas conclusivas reais: Cliente `quanto tempo demora?`; Bot `O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.` Cliente `12/03/1995`; Bot `E o e-mail? Se preferir seguir sem, me avisa`.
- Risco medio no step 2 e esperado pelo julgador porque menciona e-mail; nao e regressao, pois e-mail e o proximo campo opcional correto.

Atualizacao 2026-05-26 21:15 UTC:

- Wave 20 declarada: `level4b-wave-20-cadastro-lateral-recovery`.
- Primeiro ataque: validar pergunta lateral durante cadastro pendente de data e, no turno seguinte, persistir a data sem repetir pergunta resolvida.
- Cenarios: `cadastro-lateral-data-recovery` e `whatsapp-real-cadastro-lateral-data-recovery`.
- Gates esperados: estado `coletando_cadastro`, `orcid=null`, nome preservado, data persistida apenas no segundo turno, e-mail pedido apenas depois da data, Workflow Manager preservando estado na lateral.
- Fora de escopo: preco fechado, agenda, pagamento, sinal, secrets, mudanca ampla de linguagem, 4C.

Atualizacao 2026-05-26 21:09 UTC:

- Wave 19 fechada com PASS.
- CI `Tests` PASS no commit `1ed345c`.
- Deploy Cloudflare Pages PASS no commit `1ed345c`.
- `wave-health` PASS, Security Gate PASS, Dependabot 0, Evidence Orphan Gate PASS com WARNs historicos nao bloqueantes.
- Worktree limpo antes do closeout doc e nenhum processo de smoke/tail/curl ficou vivo apos validacao.
- Decisao: manter Level 4B, nao promover 4C.
- Observacao metodologica: `wave-closeout-summarizer.sh` ainda pode mostrar a IA anterior como `Bot` em cenarios sem resposta esperada; para pos-handoff terminal, a prova definitiva e `ai_messages_after_last_human=0`.
- Provas conclusivas reais: Cliente `lembrei de mais um detalhe`; Bot sem nova resposta automatica apos o humano. Cliente `mais uma referencia` + `image/png`; Bot sem nova resposta automatica apos o humano.

Atualizacao 2026-05-26 21:05 UTC:

- Wave 19 micro-slice 2 passou sem mudanca de codigo.
- HTTP radar `scenario-post-handoff-media-forwarding-20260526T210521Z-19735` PASS.
- WhatsApp real definitivo `scenario-whatsapp-real-post-handoff-media-forwarding-20260526T210550Z-4850` PASS.
- Estado final `aguardando_tatuador`, `orcid=orc_poshandoff`, tail `pos-handoff-midia-encaminhada`.
- `judgment.md` confirmou `ai_messages_after_last_human=0`, `copy_risk=baixo`.
- Provas conclusivas reais: Cliente `mais uma referencia` + `image/png`; Bot sem nova resposta automatica apos o humano.

Atualizacao 2026-05-26 21:00 UTC:

- Wave 19 micro-slice 1 passou com melhoria metodologica de monitoramento.
- HTTP radar `scenario-post-handoff-text-forwarding-20260526T205943Z-14853` PASS.
- WhatsApp real definitivo `scenario-whatsapp-real-post-handoff-text-forwarding-20260526T210016Z-26317` PASS.
- Estado final `aguardando_tatuador`, `orcid=orc_poshandoff`, tail `pos-handoff-mensagem-encaminhada`.
- `render-report.sh` agora separa IA anterior ao humano de IA posterior ao humano em fluxos `SMOKE_REQUIRE_AI_RESPONSE=0`; julgamento final mostra `ai_messages_after_last_human=0`.
- Seed pos-handoff agora usa copy atual de handoff, removendo ruido antigo de `Fechado`/`valor certinho`.
- Provas conclusivas reais: Cliente `lembrei de mais um detalhe`; Bot sem nova resposta automatica apos o humano.

Atualizacao 2026-05-26 20:49 UTC:

- Wave 19 declarada: `level4b-wave-19-post-handoff-hardening`.
- Primeiro ataque: revalidar `post-handoff-text-forwarding` em HTTP radar e WhatsApp real definitivo.
- Objetivo: garantir que cliente em `aguardando_tatuador` possa mandar complemento sem reabrir coleta e sem receber nova resposta automatica.
- Fora de escopo: menoridade legal, preco, agenda, pagamento, sinal, 4C.

Atualizacao 2026-05-26 20:37 UTC:

- Wave 18 fechada com PASS.
- Resultado final: 13 evidencias auditadas, 10 baixo, 3 medio, 0 alto.
- Residual medio restrito a menoridade legal por termos de seguranca/responsavel legal; decisao: nao atacar agora.
- Contratos de `cadastro-handoff` ficaram mais rígidos contra copy antiga e promessas indevidas.
- Proximo passo recomendado: declarar Wave 19 pequena, fora de menoridade legal, mantendo Level 4B e 4C bloqueado.

Atualizacao 2026-05-26 20:30 UTC:

- Wave 18 micro-slice 2 fechou sem mudanca funcional: `cadastro-handoff` basico atual tambem ja usa copy limpa.
- HTTP radar final `scenario-cadastro-handoff-email-recusado-20260526T203228Z-29078` PASS com contrato fortalecido.
- WhatsApp real definitivo final `scenario-whatsapp-real-cadastro-handoff-20260526T203258Z-19586` PASS com contrato fortalecido.
- Estado final `aguardando_tatuador`, `orcid=orc_24av8g`, `email_recusado=true`, `copy_risk=baixo`.
- Contratos dos cenarios `cadastro-handoff-email-recusado` e `whatsapp-real-cadastro-handoff` foram apertados para `EXPECTED_COPY_RISK_MAX=baixo` e `FORBIDDEN_BOT_REGEX` contra copy antiga (`Fechado`, `valor certinho`, `avaliar com calma`) e promessas indevidas; ambos foram reexecutados e passaram.
- Auditoria de naturalidade atual: 13 evidencias, 10 baixo, 3 medio, 0 alto; os 3 medios restantes sao apenas menoridade legal por termos de seguranca.
- Provas conclusivas reais: Cliente `pode seguir sem email\nquanto tempo demora?`; Bot `O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.\n\nBoa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor.`.

Atualizacao 2026-05-26 20:23 UTC:

- Wave 18 micro-slice 1 fechou sem mudanca de codigo: e-mail valido apos midia ja usa a copy atual limpa de handoff.
- HTTP radar `scenario-cadastro-after-media-email-valido-handoff-20260526T202208Z-30399` PASS.
- WhatsApp real definitivo `scenario-whatsapp-real-cadastro-after-media-email-valido-handoff-20260526T202325Z-13097` PASS.
- Estado final `aguardando_tatuador`, `orcid=orc_0cse9z`, `foto_local_msg_id=12632`, `refs_imagens_msg_ids=[11951]`, `copy_risk=baixo`.
- Auditoria de naturalidade: a evidencia nova entrou como baixo; amostra expandida ficou 9 baixo, 4 medio, 0 alto. O medio adicional e historico do `cadastro-handoff` basico antigo, nao regressao do fluxo pos-midia atual.
- Provas conclusivas reais: Cliente `joao@example.com`; Bot `Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor.`.

Atualizacao 2026-05-26 19:37 UTC:

- Wave 17 micro-slice 8 fechou menoridade legal com copy centralizada e mais natural.
- Achado real corrigido: data pendente menor (`12/03/2015`) estava escapando pelo Router como dado normal e pedia e-mail; hotfix `b94ca29` agora calcula idade antes da retomada e aciona Escalation Manager.
- Validacao definitiva passou em HTTP radar e WhatsApp real para `12/03/2015`, `tenho 17 anos` e `tenho autorizacao dos meus pais`.
- Commits funcionais: `6b92582 feat: soften minor age handoff copy` e `b94ca29 fix: escalate minor birthdate in router`.
- Provas conclusivas reais: Cliente `12/03/2015`; Bot `Como a pessoa que vai tatuar tem menos de 18 anos, vou chamar o tatuador para seguir com segurança sobre responsável legal e próximos passos.`.

Novo proximo passo recomendado: rodar auditoria de naturalidade com as evidencias novas da Wave 17 e escolher uma proxima familia pequena. Manter Level 4B; 4C continua bloqueado.

Auditoria rodada apos micro-slice 8:

- 12 evidencias WhatsApp real analisadas;
- 8 baixo, 4 medio, 0 alto;
- sem repeticao exata global;
- tres medios sao menoridade legal por termos obrigatorios de seguranca/responsavel legal;
- um medio e fechamento antigo de cadastro/e-mail recusado com `Fechado` e `valor certinho`.

Proximo passo recomendado atualizado: atacar uma familia pequena de fechamento cadastro/e-mail recusado para remover linguagem formulaica antiga, mantendo Level 4B e WhatsApp real definitivo. Nao mexer agora em menoridade legal, porque o residual medio e esperado por seguranca.

Atualizacao 2026-05-26 20:05 UTC:

- Wave 17 micro-slice 9 fechou sem mudanca de codigo: a evidencia media de fechamento/e-mail recusado era historica.
- HTTP radar `scenario-cadastro-email-refusal-por-aqui-mesmo-20260526T200420Z-32050` PASS.
- WhatsApp real `scenario-whatsapp-real-cadastro-email-refusal-por-aqui-mesmo-20260526T200456Z-17474` PASS.
- Auditoria atualizada: 12 evidencias, 9 baixo, 3 medio, 0 alto; os 3 medios restantes sao menoridade legal por termos de seguranca.
- Provas conclusivas reais: Cliente `por aqui mesmo`; Bot `Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor.`.

Wave 17 fechada: naturalidade deterministica ficou com 9 baixo, 3 medio, 0 alto na amostra atual; os 3 medios restantes sao menoridade legal e permanecem como watchlist aceitavel por seguranca.

Proximo passo recomendado atualizado: abrir Wave 18 pequena em Level 4B, sem 4C, escolhendo uma familia funcional fora de menoridade legal. Candidatos preferenciais:

- revalidar e suavizar fechamento de cadastro com e-mail valido apos midia, porque historico antigo ainda registrou `Fechado`/`valor certinho`;
- ou revalidar midia/cadastro multi-turn atual para confirmar que nao restou copy antiga em evidencias recentes.

Primeiro ataque recomendado da Wave 18: revalidar `cadastro-after-media-email-valido-handoff` em HTTP radar e WhatsApp real antes de mexer em codigo. Se a copy atual ja estiver limpa, fechar como revalidacao sem codigo; se ainda vier rigida, corrigir na VoicePolicy/Workflow com micro-slice pequeno.

Escopo recomendado:

- rodar `check-autonomy-gate.sh` antes de iniciar nova rodada;
- rodar `wave-health.sh` e `check-security-gate.sh` antes de tocar codigo;
- manter `CURRENT_LEVEL=4` e `MAX_BATCH_SIZE=8`;
- usar `docs/atendimento-premium/40-level-4b-wave-17.md` como estado da onda atual;
- validar comportamento conversacional com teste local relevante, HTTP radar e WhatsApp real definitivo;
- Wave 16 fechou menoridade indireta por responsavel legal com duas variacoes validadas em WhatsApp real definitivo;
- Wave 17 micro-slice 1 fechou apenas auditoria read-only sobre evidencias reais existentes; WhatsApp real novo nao foi exigido porque nao houve mudanca conversacional;
- Wave 17 micro-slice 2 fechou mudanca conversacional com HTTP radar e WhatsApp real definitivo;
- Wave 17 micro-slice 3 e refactor estrutural sem mudanca de fala; WhatsApp real novo nao e exigido, mas CI/deploy e wave-health sao obrigatorios;
- qualquer proximo micro-slice que altere linguagem do bot exige WhatsApp real definitivo;
- manter Level 4B; nao promover 4C ate pelo menos mais uma onda 4B saudavel;
- manter `workflow-manager` como gate obrigatorio para qualquer discussao futura de Level 4;
- nao tocar preco, sinal, pagamento, agenda, secrets ou tenant real amplo;
- nao subir para 4C; 4C exige duas rodadas 4B saudaveis.
- quando nao houver regressao, blocker ou decisao humana pendente, tratar continuidade como implicita para o proximo micro-slice logico da onda declarada.

Leitura recomendada:

```text
4B promovido por decisao deliberada apos Wave 1 e Wave 2 Level 4A saudaveis.
Wave 2 4B fechou PASS com HTTP + WhatsApp real definitivo.
Proxima onda 4B deve permanecer em zona verde/amarela.
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
