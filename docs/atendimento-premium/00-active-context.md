# Active Context - Atendimento Premium

Este e o primeiro arquivo a ler apos compactacao, troca de aba ou retomada. Ele deve caber em contexto curto e apontar apenas para os documentos necessarios do proximo passo.

## Estado De Comando

```text
status: wave_49_session_pricing_validated
branch: main
autonomy_level: 4B
level_4c: bloqueado
onda_ativa: Wave 49 - Orcamento Por Sessoes
proxima_acao: escolher proxima frente funcional premium
motivo: Wave 48 consolidou N tattoos; agora proposta precisa aceitar valor fechado ou valor por sessao sem perder compatibilidade com valor_proposto
```

## Evidencia Que Travou A Frente

```text
origem: teste manual WhatsApp real do usuario
cliente: "opa" / "tranquilo" / "quero fzr uma tattoo" / "na perna" / "um dragao bolado" / "grandao"
bot: "Tu imagina fazer em qual parte do corpo?" / "Qual tua altura?"
falhas: abertura pouco humanizada, nao reagiu ao briefing "dragao bolado", tratou conversa organica como formulario, fragmentos multi-bolha nao viraram contexto rico
classificacao: gap metodologico + gap conversacional
decisao: falha corrigida e sentinel organico definitivo passou
```

## Evidencia Definitiva

```text
falha_inicial: scenario-whatsapp-real-organic-burst-3-bubbles-20260527T163151Z-11946
fix_commit: 1374747 fix: handle organic tattoo burst briefing
pass_lead_new_3_bolhas: scenario-whatsapp-real-organic-burst-3-bubbles-20260527T165145Z-10140
pass_continuous_3_bolhas: scenario-whatsapp-real-organic-continuous-burst-3-bubbles-20260527T165236Z-21063
pass_continuous_2_bolhas: scenario-whatsapp-real-organic-continuous-burst-2-bubbles-20260527T165321Z-29744
fix_continuous_commit: 9c6f635 fix: keep organic burst conversations continuous
naturalness_v2_continuous: 2 PASS / 0 watchlist / 0 rework / 0 stop / media 2.88
wave_47_full_journey_pos_handoff: scenario-whatsapp-real-long-journey-post-handoff-new-request-20260527T172227Z-14895
wave_47_reclassificacao: PASS apenas para encaminhamento terminal simples; insuficiente para mudanca de ideia orcamentavel/multiplos orcamentos
wave_47_novo_contrato: cliente com nova ideia deve receber confirmacao "somente essa ou a anterior tambem?" antes de substituir/adicionar item
wave_47_codigo_atual: Budget Items Manager resolve "as duas"/"somente essa", coleta segundo item, sincroniza item ativo e envia update Telegram com multiplas tattoos usando o mesmo ORCID
wave_47_pass_final: PASS em `scenario-whatsapp-real-long-journey-post-handoff-new-request-20260527T182057Z-3182`
wave_47_falha_util_20260527: run `scenario-whatsapp-real-long-journey-post-handoff-new-request-20260527T180425Z-10038` falhou no step 9 porque `item_2` herdou `estilo=fineline` do topo legado; correcao limpa campos legados da tattoo anterior quando novo item fica ativo
wave_47_fix_persistencia_update: commit `b456c02` preserva `foto_local_file_id` apos upload Telegram antes de marcar item ativo como `sent_to_artist`
wave_47_final_orcid: `orc_mnw4ro`
wave_47_final_telegram: tail `fotos-orcamento-update-enviadas` com `itens_total=2`, `active_budget_item_id=item_2`, `enviadas=1`, `falhas=0`
wave_48_codigo_local: Budget Proposal Manager parseia valores por item, persiste proposal por budget_item, total em valor_proposto e reentrada fechar_multi consolidada
wave_48_tests_local: focused PASS 27/27; npm test PASS 1244/1244
wave_48_deploy: commit `0326956`; Tests PASS 26533581695; Deploy PASS 26533581490
wave_48_whatsapp_real: `scenario-whatsapp-real-long-journey-post-handoff-new-request-20260527T192601Z-25886` PASS 10/10, `orcid=orc_jy5c9p`
wave_48_reentrada_real: PASS via `/api/telegram/reentrada` com `fechar_multi`, cliente recebeu uma unica mensagem consolidada com R$ 200 + R$ 400 + CTA
wave_48_gate_real_manual: imagem do usuario confirmou Telegram real pedindo valores por item, erro seguro em formato ruim, resposta corrigida e WhatsApp com proposta consolidada unica
wave_49_codigo_local: Budget Proposal Manager aceita `pricing_mode=fixed_total|per_session` para single e multi-budget; `valor_proposto` permanece total para compatibilidade
wave_49_tests_local: focused PASS 28/28; npm test PASS 1249/1249
wave_49_deploy: commit `92cc7fd`; Tests PASS 26536212096; Deploy PASS 26536212025
wave_49_whatsapp_real_setup: `scenario-whatsapp-real-cadastro-handoff-20260527T201717Z-21139` PASS, `orcid=orc_zf18s9`
wave_49_telegram_webhook_prod: POST autorizado em `/api/telegram/webhook` com reply `2 sessoes 500` retornou 200 `valor=1000`
wave_49_whatsapp_real_final: cliente recebeu uma unica mensagem com intro + 2 sessoes de R$ 500 + total R$ 1000 + CTA
```

## Regra Ativa

```text
HTTP production smoke = radar inicial
WhatsApp real central -> bot = validacao definitiva
Organic Conversation Sentinel = obrigatorio quando a frente envolve experiencia conversacional, abertura, coleta organica, naturalidade ou regressao manual real
Lead-new burst valida abertura; continuous burst sem cleanup valida conversa real
Full Journey Validation Gate: seed de meio de fluxo pode ser radar tecnico, mas validacao definitiva deve comecar do inicio quando o comportamento depende de contexto acumulado
```

## Proximo Ataque

1. Definir proxima frente funcional premium com base no maior risco restante.
2. Manter gate: HTTP radar quando util; WhatsApp real final quando houver experiencia do cliente.
3. Nao subir para 4C sem nova decisao deliberada.
4. Para nova frente, nao tratar como PASS sem prova conclusiva real quando tocar experiencia/conversao.

## Corte Em Andamento

```text
budget_items_manager_micro_slice_3: PASS final em producao
contrato: mensagem nova ideia em aguardando_tatuador nao pode cair no encaminhamento terminal silencioso
resposta_cliente: "Beleza! Mas so pra eu entender certinho, voce quer fazer somente essa ou a anterior tambem?"
persistencia: dados_coletados.budget_change_pending
confirmacao: "as duas" reabre coleta do segundo item; "somente essa" marca anterior como substituido
telegram_atual: aviso de replanejamento pendente + update final com multiplas tattoos quando segundo item fica completo
workflow: tattoo completa com cadastro existente vai direto para aguardando_tatuador e aciona pacote
correcao_atual: ao ativar item novo, top-level descricao/local/estilo/foto passa a representar o item novo; campos antigos nao podem contaminar `item_2`
pass_final: WhatsApp real completo + Telegram update correto + persistencia final OK
provas_conclusivas_reais: Cliente "mudei de ideia, queria uma caveira na perna" -> Bot "Beleza! Mas so pra eu entender certinho, voce quer fazer somente essa ou a anterior tambem?"; Cliente "as duas" -> Bot "Fechado, vou considerar as duas. Pra caveira na perna, qual estilo voce imagina?"; Cliente "blackwork" -> Bot "Consegue mandar uma foto do local onde tu quer tatuar?"; Cliente "segue foto do local" + imagem -> Bot "Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor."
```

## Corte Atual - Wave 48

```text
budget_proposal_manager: implementado localmente
contrato: se ha mais de um budget_item ativo, Telegram pede valores numerados no mesmo ORCID
persistencia: cada item recebe proposal.status=priced + valor individual; proposal_summary registra total
compatibilidade: valor_proposto recebe total dos itens
resposta_cliente: evento fechar_multi monta uma unica mensagem com intro + valores itemizados + CTA
validacao_local: npm test PASS 1244/1244
validacao_real_parcial: WhatsApp real full journey PASS + reentrada consolidada real PASS
pendente: prova real do callback/reply Telegram usando secret correto ou acao manual do tatuador
provas_conclusivas_reais: Cliente "mudei de ideia, queria uma caveira na perna" -> Bot "Beleza! Mas so pra eu entender certinho, voce quer fazer somente essa ou a anterior tambem?"; Cliente "as duas" -> Bot "Fechado, vou considerar as duas. Pra caveira na perna, qual estilo voce imagina?"; Telegram "Manda os valores por item..." -> Tatuador "1 400 2 500" -> Bot "Nao consegui ler todos os valores. Faltou item 2."; Tatuador "1 400\n2 500" -> Cliente recebeu uma unica mensagem consolidada com 2 valores + CTA
```

## Corte Atual - Wave 49

```text
budget_proposal_manager: pricing_mode implementado
contrato: tatuador pode responder valor fechado (`750`) ou por sessoes (`2 sessoes 500`)
multi_budget: aceita mistura de itens fechados e itens por sessao
compatibilidade: valor_proposto recebe o total estimado para proposta/agendamento/sinal legados
persistencia: single usa dados_coletados.proposal_summary; multi usa budget_items[].proposal
resposta_cliente: composer monta intro + linha de valor fechado ou sessoes + CTA
validacao_local: node --test tests/integration/telegram-callback-nome.test.mjs tests/tools/reentrada-helpers.test.mjs PASS 28/28; npm test PASS 1249/1249
deploy: commit `92cc7fd` com Tests PASS 26536212096 e Deploy PASS 26536212025
validacao_real: WhatsApp real `scenario-whatsapp-real-cadastro-handoff-20260527T201717Z-21139` gerou `orcid=orc_zf18s9`; webhook Telegram producao autorizado com `2 sessoes 500` retornou `valor=1000`; WhatsApp recebeu proposta unica
provas_conclusivas_reais: Cliente "pode seguir sem email\nquanto tempo demora?" -> Bot "O tempo de sessão depende do tamanho... Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor."; Tatuador "2 sessoes 500" -> Bot "Fala Joao, tudo bem? O tatuador acabou de me passar o seu orçamento.\nA ideia de leao no antebraco ficaria em 2 sessoes de R$ 500, totalizando R$ 1000.\nQuer que eu veja um horario pra gente agendar?"
```

## Corte Atual - Wave 50

```text
origem: regressao observada em teste manual WhatsApp real
problema: apos "Como posso te chamar?", resposta pura "Macus" caiu no LLM e demorou ~80-90s
causa_raiz: ConversationRouter tratava nome_curto pendente com lateral, mas nao tratava nome puro no estado tattoo
correcao: nome_curto em tattoo agora sai por router deterministico, salva dados_coletados.nome_preferido e retoma coleta sem chamar LLM
cadastro_formal: dados_cadastro.nome continua reservado para nome completo na fase cadastro
validacao_local: router PASS 73/73; pipeline PASS 73/73; npm test PASS 1251/1251
status: aguardando commit/deploy + WhatsApp real definitivo antes de PASS final
provas_locais: Cliente "Macus" -> Bot "Boa, Macus. Tu imagina fazer em qual parte do corpo?"; runAgent=0; nome_preferido="Macus"; dados_cadastro={}
```

## Arquivos Para Ler

```text
docs/atendimento-premium/52-premium-operational-chain.md
docs/atendimento-premium/73-organic-conversation-sentinel-pack.md
docs/atendimento-premium/74-level-4b-wave-48.md
docs/atendimento-premium/75-level-4b-wave-49.md
docs/atendimento-premium/76-level-4b-wave-50.md
docs/atendimento-premium/current-objective.md somente se precisar de historico amplo
docs/atendimento-premium/smoke-runs.md somente se precisar de evidencia antiga
scripts/smoke/continuity-bundle.sh
```

## Politica De Contexto

```text
nao_ler_tudo_por_padrao: sim
fonte_primaria_de_retomada: docs/atendimento-premium/00-active-context.md
historico_duravel: docs/atendimento-premium/current-objective.md
indice_de_evidencia: docs/atendimento-premium/smoke-runs.md
wave_docs: ler somente a onda ativa ou a onda citada no active context
```

## Stop Conditions Atuais

```text
WhatsApp real ausente em comportamento conversacional
fechamento definitivo com seed de meio de fluxo quando o risco depende de contexto acumulado
sentinel organico ausente apos nova regressao manual
bot responder como formulario quando o cliente trouxe briefing organico
bot ignorar fragmentos semanticamente relevantes em sequencia
bot responder entre bolhas de um burst real antes da ultima mensagem humana
mensagem duplicada, estado final errado ou IA depois de handoff humano
proposta multi-orcamento enviada em duas respostas separadas
Wave 49 marcada PASS sem Telegram real + WhatsApp real final
compactacao sem active context ou continuity bundle
```
