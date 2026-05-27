# Current Objective - Atendimento Premium

Este arquivo e o estado vivo da frente. Ele existe para permitir retomada apos compactacao de contexto, troca de aba ou pausa longa sem depender da memoria do chat.

## Objetivo Ativo

```text
Fortalecer o processo de smoke premium ate cobrir envio WhatsApp real, monitoramento completo, transcript legivel e julgamento estruturado da resposta.
```

## Estado Atual

```text
status: level4b_wave_43_limpeza_final_midia_cadastro_pass
branch: main
ultimo_commit: commit de status Wave 43 registrado no git log
ultimo_commit_funcional: b54f085 fix: route portfolio requests deterministically
deploy: pendente CI/deploy do commit 68fe072; sem mudanca de codigo do bot
tests: Wave 43 HTTP radar 8/8 PASS; WhatsApp real 8/8 PASS; Naturalness V2 8 PASS / 0 watchlist / 0 rework / 0 stop
prompts_ci: PASS no GitHub Actions
worktree_esperado: limpo apos commit da cadeia operacional premium
ultimo_commit_validado: 68fe072 docs: close wave 43 media cadastro cleanup + Wave 43 HTTP/WhatsApp real/Naturalness V2 PASS + wave-health dirty PASS; CI/deploy pendentes
autonomy_level: 4B
autonomy_limit: ate 8 micro-slices da mesma onda declarada
autonomy_recommendation: manter 4B; 4C segue bloqueado ate nova decisao deliberada
```

## Ultimos Marcos

- Wave 43 fechada como limpeza final dos subcasos midia/cadastro: 8 subcasos passaram em HTTP radar e WhatsApp real definitivo, contratos foram endurecidos contra copy antiga (`Pra liberar teu orçamento`, `Fechado`, `valor certinho`, `avaliar com calma`) e Naturalness V2 retornou 8 PASS/0 watchlist/0 rework/0 stop.
- Falha util controlada da Wave 43: o classificador deterministico marca pedido de e-mail opcional como `copy_risk=medio`; contrato aceitou `medio` apenas nesse step, mantendo bloqueio textual contra copy antiga e validacao Naturalness V2.
- Wave 42 fechada como revalidacao atual de referencia confirmada seguida de foto local: HTTP radar e WhatsApp real definitivo passaram; resposta atual bloqueou copy antiga `Pra liberar teu orçamento`, preservou `refs_imagens_msg_ids=[11951]`, criou `foto_local_msg_id` e manteve `orcid=null`.
- Wave 42 declarada para limpar a variacao irma da Wave 41: referencia confirmada seguida de foto local, com contrato anti-copy-antiga e WhatsApp real novo.
- Wave 41 fechada como revalidacao atual de referencia adicional apos foto local: HTTP radar e WhatsApp real definitivo passaram; resposta atual bloqueou copy antiga `Pra liberar teu orçamento`, preservou `foto_local_msg_id=599`, adicionou 1 referencia e manteve `orcid=null`.
- Wave 41 declarada como revalidacao atual de referencia apos foto local: evidencia antiga ainda aceitava/mostrava `Pra liberar teu orçamento`, entao o contrato sera fortalecido antes de HTTP radar e WhatsApp real.
- Wave 40 fechada como revalidacao atual do pacote Telegram com midia fresca: HTTP radar e WhatsApp real definitivo passaram; tail confirmou `fotos-orcamento-enviadas`, estado final `aguardando_tatuador`, `orcid=orc_xkw5i5`, `foto_local_file_id` e `refs_imagens_file_ids` preservados.
- Wave 40 declarada como proxima frente assertiva: revalidar pacote Telegram com midia fresca, porque o fluxo cliente ja passou por handoff/pos-handoff e o proximo risco premium e a entrega operacional ao tatuador.
- Wave 39 fechada como validacao atual de pos-handoff apos jornada completa: HTTP radar e WhatsApp real definitivo passaram em 7 steps; o step final `lembrei que queria pequeno` manteve `estado_agente=aguardando_tatuador`, preservou `orcid=orc_n89aee` e teve `ai_messages_after_last_human=0`.
- Wave 23 preparada como proxima frente estrategica: Naturalidade Premium em jornadas longas reais, com foco em abertura, retomada, cadastro e handoff sem remendos determinisiticos por frase.
- Wave 23 Jornada 1 passou em HTTP radar e WhatsApp real definitivo: lateral inicial de tempo, descricao simples pendente, complemento com lateral de orcamento, estilo pendente e foto local real; estado final `coletando_cadastro`, `orcid=null`, dados de tattoo completos e `foto_local_msg_id` persistido.
- Wave 23 Jornada 2 passou em HTTP radar e WhatsApp real definitivo: foto local, cadastro, lateral de tempo durante cadastro, recusa natural de e-mail, handoff com `orcid`, `handoff_package_v1` e pos-handoff sem nova IA.
- Wave 23 fechou PASS: 2 jornadas HTTP, 2 jornadas WhatsApp real, `wave-health` final PASS, Security Gate PASS e nenhuma regressao funcional aberta; proxima frente recomendada e Voice Policy para reduzir apresentacao mecanica de primeiro contato.
- Wave 24 iniciada: Voice Policy de primeiro contato deterministico. Primeiro corte remove `Me chamo`/`muito prazer` dos caminhos Router/Composer quando o cliente ja trouxe contexto acionavel; saudacao pura via Agent fica fora deste micro-slice.
- Wave 24 micro-slice 1 passou: primeiro contato com pergunta de preco validado em HTTP radar e WhatsApp real; resposta agora inicia com `Oii, tudo bem.` e nao usa `Me chamo`/`muito prazer`, preservando seguranca de preco e estado `coletando_tattoo`.
- Wave 24 micro-slice 2 passou: primeiro contato com briefing multi-info validado em HTTP radar e WhatsApp real; resposta inicia com `Oii, tudo bem.`, persiste descricao/estilo/local/altura e pede somente foto do local, sem `Me chamo`/`muito prazer`.
- Wave 24 fechada PASS: CI, deploy e `wave-health` verdes em `5eacc49`; proxima decisao estrategica recomendada e abrir Wave 25 para saudacao pura/caminhos LLM ou outra watchlist de naturalidade com evidencia real recente.
- Wave 25 iniciada: Voice Policy para saudacao pura no `runAgent`, sem editar prompts LLM; primeiro corte troca os backstops determinisiticos de `Me chamo Assistente, muito prazer` por `Oii, tudo bem.` + pedido direto de nome.
- Wave 25 micro-slice 1 passou: saudacao pura `oi` validada em HTTP radar e WhatsApp real definitivo; falha util inicial por timeout mostrou dependencia desnecessaria de LLM, corrigida com bypass deterministico antes da validacao final.
- Wave 25 micro-slice 2 iniciado: primeiro contato com pergunta sobre imagem e midia real, para validar que o backstop de imagem tambem nao reintroduz `Me chamo`/`muito prazer`.
- Wave 25 micro-slice 2 passou: pergunta explicita sobre imagem com `image/png` validada em HTTP radar e WhatsApp real definitivo; falha util inicial por timeout/resposta generica virou bypass deterministico para referencia vs local.
- Wave 25 fechada PASS: 2 micro-slices, 2 HTTP radar, 2 WhatsApp real, duas falhas uteis convertidas em melhoria estrutural, Level 4B mantido.
- Wave 26 iniciada: auditoria estrategica de naturalidade. Baseline read-only v1 rodou em 10 evidencias WhatsApp real recentes e retornou 10 baixo/0 medio/0 alto, mas a leitura critica mostrou que a ferramenta atual ainda e rasa para naturalidade premium.
- Wave 26 micro-slice 2 passou como mudanca metodologica: `naturalness-rubric-v2.md` oficializa eixos, scores, gates, taxonomia e formato de relatorio para julgar naturalidade premium antes de qualquer mudanca de copy/prompt/fluxo.
- Wave 26 micro-slice 3 passou como ferramenta read-only: `scripts/smoke/naturalness-audit-v2.sh` aplica a Rubrica V2 por eixos, diferencia pos-handoff sem IA como sucesso operacional e foi calibrado em 10 evidencias WhatsApp real recentes com 10 PASS, media geral 2.87, sem watchlist/rework/stop.
- Wave 26 micro-slice 4 passou como reaudit read-only: evidencias finais das Waves 22-25 deram 8 PASS/0 watchlist; steps longos + finais deram 25 PASS/4 watchlist, todos em steps historicos com `Me chamo Assistente`, familia ja atacada nas Waves 24/25. Proxima acao correta e revalidar uma jornada longa atual pos-Voice Policy, nao mexer em copy agora.
- Wave 27 declarada: revalidacao de jornada longa atual pos-Voice Policy. Objetivo e provar em HTTP radar + WhatsApp real que a apresentacao mecanica historica nao aparece mais no fluxo completo.
- Wave 27 validou a jornada longa atual pos-Voice Policy: HTTP radar PASS e WhatsApp real `central -> bot` PASS em 5 steps, sem `Me chamo`/`muito prazer`, estado final `coletando_cadastro`, `orcid=null`, `copy_risk=baixo`; Naturalness Audit V2 nos steps finais retornou 5 PASS/0 watchlist.
- Wave 27 fechou PASS: `wave-health` final PASS com 198 scenarios PASS, 97 WhatsApp reais PASS, Security Gate PASS, Evidence Orphan Gate PASS e worktree limpo. Familia de primeiro contato mecanico esta coberta por micro-slices e jornada longa atual.
- Wave 28 iniciada: naturalidade do e-mail opcional. Auditor V2 em cadastro/e-mail/handoff retornou 10 PASS/0 watchlist; alvo escolhido foi a frase central de e-mail opcional na `conversation-voice-policy`, sem mudar regra funcional. Testes locais focados PASS 138/138 e `npm test` PASS 1216/1216.
- Wave 28 validada em producao: HTTP radar `cadastro-lateral-data-recovery` PASS e WhatsApp real `central -> bot` PASS; nova frase `Se quiser, me passa teu e-mail. Se preferir seguir só por aqui, tudo certo.` manteve e-mail opcional, `estado=coletando_cadastro`, `orcid=null` e Naturalness Audit V2 2 PASS/0 watchlist.
- Wave 28 fechou PASS: CI e deploy do registro documental passaram, `wave-health` final PASS com 200 scenarios PASS, 98 WhatsApp reais PASS, Security Gate PASS, Evidence Orphan Gate PASS e Level 4B mantido.
- Cadeia operacional premium solidificada em `52-premium-operational-chain.md`: regra profissional de avanco/nao avanco, Definition of Done Premium, matriz de decisao e cadencia para impedir progresso sem HTTP/WhatsApp real/evidencia quando aplicavel.
- Wave 29 iniciada: auditoria read-only da familia cadastro/handoff usando Naturalness Audit V2, sem mudanca de codigo antes de evidencia real apontar familia e severidade.
- Wave 29 validou a familia cadastro/handoff atual sem mudanca de codigo: auditoria ampla teve 24 PASS/3 watchlist historicas/0 rework/0 stop; revalidacao atual passou em HTTP radar e WhatsApp real `central -> bot` com 7 steps, Naturalness V2 7 PASS/0 watchlist, estado final `aguardando_tatuador`, `orcid=orc_scfzj3` e pos-handoff sem nova IA.
- Wave 30 iniciada: auditoria read-only da familia menoridade/risco, incluindo menoridade por data/texto, responsavel legal, cobertura, pedido humano, cliente irritado e gatilho tenant.
- Wave 30 validou menoridade/risco: auditoria inicial achou 1 watchlist em cliente irritado, confirmada como falso positivo metodologico; `naturalness-audit-v2.sh` foi calibrado para diferenciar reclamacao de demora no atendimento de pergunta de tempo de sessao; HTTP radar e WhatsApp real `central -> bot` passaram para cliente irritado com `estado=aguardando_tatuador`, `orcid=null`, copy_risk=baixo e Naturalness V2 PASS. Familia final: 9 PASS/0 watchlist/0 rework/0 stop.
- Wave 31 iniciada: auditoria read-only da familia pos-handoff texto/midia, com foco em encaminhar ao humano sem nova IA e sem reabrir coleta.
- Wave 31 validou pos-handoff texto/midia sem mudanca de bot: Naturalness V2 calibrado para avaliar apenas IA apos o ultimo humano quando `SMOKE_REQUIRE_AI_RESPONSE=0`; familia real auditada teve 7 PASS/0 watchlist/0 rework/0 stop, media 2.88 e tag `pos_handoff_sem_ia_ok`.
- Regra metodologica reforcada apos Wave 31: auditoria read-only pode reaproveitar evidencia WhatsApp real existente somente sem mudanca de comportamento e com validade declarada; qualquer mudanca funcional/conversacional ou duvida exige WhatsApp real novo `central -> bot`.
- Wave 32 iniciada: revalidacao atual de lateral tempo/processo, porque evidencias antigas ainda mostram copy mecanica pre-Voice Policy e nao devem ser usadas para fechar comportamento atual.
- Wave 32 validou lateral tempo/processo atual sem mudanca de codigo: HTTP radar e WhatsApp real novo passaram para os dois cenarios; Naturalness V2 teve 4 PASS/0 watchlist/0 rework/0 stop, estado `coletando_tattoo`, `orcid=null`, copy_risk=baixo e sem `Me chamo`/`muito prazer`.
- Wave 33 iniciada: revalidacao atual de portfolio com HTTP radar e WhatsApp real novo, porque as evidencias principais sao de 2026-05-25 e nao devem fechar a familia atual sem novo envio real.
- Wave 33 validou portfolio atual apos falha util: HTTP inicial mostrou timeout e resposta tardia errada do LLM; Router ganhou `portfolio_requested` deterministico e pipeline executa `enviar-portfolio` nesse caminho; CI/deploy, HTTP radar final, WhatsApp real novo e Naturalness V2 passaram com estado `coletando_tattoo`, `orcid=null`, copy_risk=baixo e tail confirmando portfolio.
- Wave 34 validou pergunta de imagem atual sem mudanca de codigo: sem midia e com midia passaram em HTTP radar e WhatsApp real novo; Naturalness V2 teve 4 PASS/0 watchlist/0 rework/0 stop, estado `coletando_tattoo`, `orcid=null`, copy_risk=baixo, sem apresentacao mecanica e com `refs_imagens_msg_ids` persistido no corte com midia.
- Wave 35 validou historia de vida/homenagem atual sem mudanca de codigo: HTTP radar e WhatsApp real novo passaram; Naturalness V2 teve 2 PASS/0 watchlist/0 rework/0 stop, estado `coletando_tattoo`, `orcid=null`, copy_risk=baixo, Router `historia_vida` e Workflow Manager preservando estado por policy.
- Wave 36 validou midia ambigua sem legenda atual sem mudanca de codigo: HTTP radar e WhatsApp real novo com imagem enviada pela `central` passaram; Naturalness V2 teve 2 PASS/0 watchlist/0 rework/0 stop, estado `coletando_tattoo`, `orcid=null`, `foto_local_msg_id=null`, `refs_imagens_msg_ids` com 1 item e dados de tattoo preservados.
- Wave 37 validou confirmacao de midia ambigua atual sem mudanca de codigo: local e referencia passaram em HTTP radar e WhatsApp real novo; Naturalness V2 teve 4 PASS/0 watchlist/0 rework/0 stop, caminho local promoveu `foto_local_msg_id=11951` e caminho referencia preservou `foto_local_msg_id=null`.
- Wave 38 validou jornada maior atual sem mudanca de codigo: HTTP multiturn e WhatsApp real multiturn passaram em 6 steps; estado final `aguardando_tatuador`, `orcid` criado, `foto_local_msg_id` e `foto_local_file_id` persistidos, recusa de e-mail persistida, Workflow Manager `cadastro_and_tattoo_complete` e `handoff_package_v1` confirmados; Naturalness V2 2 PASS/0 watchlist/0 rework/0 stop.
- Bug corrigido durante a Jornada 1: respostas simples ao proximo campo pendente de tattoo agora sao roteadas deterministicamente por `tattoo_pending_answer`, evitando queda no LLM e repeticao de pergunta.
- Level 4B Wave 22 Jornada 2 passou em HTTP radar e WhatsApp real definitivo: jornada longa com foto local, pergunta lateral durante cadastro, handoff e texto pos-handoff sem nova IA. O runner agora suporta `SMOKE_REQUIRE_AI_RESPONSE_N` por etapa em multi-turn.
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
run_id_http: scenario-cadastro-after-media-telegram-media-package-20260527T072057Z-24824
run_id_real: scenario-whatsapp-real-cadastro-after-media-telegram-media-package-20260527T072129Z-24844
tipo: Scenario WhatsApp real final da Wave 43
base_url: central -> bot (*2357)
telefone: 5521970789797
expected_state: aguardando_tatuador
orcid: orc_2qv7mp
evidence: .smoke-evidence/scenario-whatsapp-real-cadastro-after-media-telegram-media-package-20260527T072129Z-24844/
```

Mensagem:

```text
joao@example.com
```

Resultado:

```text
estado_agente: aguardando_tatuador
resposta_ai_final: Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor.
orcid: orc_2qv7mp
copy_risk: baixo
workflow: cadastro_and_tattoo_complete + handoff_package_v1
observabilidade: tail confirmou fotos-orcamento-enviadas, poll confirmou foto_local_file_id e refs_imagens_file_ids
decision_chain: seed com midia fresca -> Evolution central envia email -> Router resolve email -> Workflow Manager faz handoff -> Telegram recebe pacote de fotos
```

## Proximo Ataque

```text
Proximo passo recomendado: marcar familia midia/cadastro como fechada na cobertura atual ou abrir nova frente premium fora dessa familia.
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

Atualizacao 2026-05-26 22:22 UTC:

- Commit funcional `cc77bba fix: track photo request after multi info` enviado.
- CI `Tests` PASS run `26477883969`; deploy Pages PASS run `26477883967`.
- HTTP radar da Wave 22 Jornada 1 PASS: `scenario-long-journey-lateral-media-cadastro-handoff-20260526T220704Z-29722`.
- WhatsApp real definitivo da Wave 22 Jornada 1 PASS: `scenario-whatsapp-real-long-journey-lateral-media-cadastro-handoff-20260526T221935Z-11804`.
- Estado final `aguardando_tatuador`, `orcid=orc_1480i5`, `foto_local_msg_id=12897`, `foto_local_file_id` persistido, `email_recusado=true`.
- Workflow Manager confirmado com `cadastro_and_tattoo_complete`, `handoff_package_v1` e trace `hp_3243fc3083`.
- Provas conclusivas reais: Cliente `como funciona o orçamento?` -> Bot explicou processo; Cliente `quero uma rosa fineline no antebraco, tenho 1.70` -> Bot pediu foto; Cliente `segue foto do local` + imagem -> Bot pediu nome; Cliente `Joao Silva` -> Bot pediu data; Cliente `12/03/1995` -> Bot pediu e-mail opcional; Cliente `pode seguir sem email` -> Bot `Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor.`
- Decisao recomendada: manter Level 4B e rodar uma segunda jornada longa de contraste antes de fechar a Wave 22.

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
