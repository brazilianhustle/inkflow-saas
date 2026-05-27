# Level 4B - Wave 47 - Replanejamento E Novo Pedido

## Objetivo

Provar que o bot lida com mudanca de ideia, novo pedido ou complemento relevante depois de conversa avancada/terminal sem grudar no orcamento antigo, sem criar duplicidade e sem reabrir IA quando o humano ja assumiu.

## Status

```text
status: PASS
motivo: WhatsApp real full journey provou replanejamento/multiplos orcamentos desde o inicio do fluxo, com update Telegram multi-tattoo no mesmo ORCID
decisao: Wave 47 fechada; proximas variacoes de replanejamento so entram se houver risco novo ou contrato diferente
```

## Correcao De Contrato - 2026-05-27

A leitura anterior tratou toda mensagem em `aguardando_tatuador` como terminal: encaminhar ao humano, nao responder ao cliente e nao reabrir IA. Isso e correto apenas para complemento simples ou midia adicional depois que o humano assumiu.

Nao e suficiente para replanejamento orcamentavel. Quando o cliente diz:

```text
mudei de ideia, queria uma caveira na perna
```

o comportamento premium esperado e o bot entender que existe uma nova ideia de tattoo e confirmar a intencao:

```text
Beleza! Mas so pra eu entender certinho, voce quer fazer somente essa ou a anterior tambem?
```

Essa pergunta nao deve ser implementada como regra pontual para "caveira". Ela pertence a uma nova camada/contrato: Budget Items Manager.

```text
problema_estrutural_atual: conversas tem um unico dados_coletados e um unico orcid
risco: nao representa dois orcamentos/tattoos na mesma conversa
novo_contrato: conversa pode conter N itens de tattoo, cada um com briefing, local, estilo, altura/tamanho, fotos e status
telegram: precisa deixar explicito se ha 1 ou mais tattoos no pacote do tatuador
workflow: mudanca de ideia apos handoff pode significar substituir item anterior ou adicionar novo item, e o bot deve perguntar antes de decidir
```

## Micro-Slice 1 - Reclassificacao

```text
status: PASS parcial / reclassificado
o_que_provou: texto pos-handoff simples e encaminhado ao humano sem IA nova
o_que_nao_provou: capacidade de analisar nova ideia, perguntar se substitui/adiciona, coletar segunda tattoo e montar pacote multi-orcamento
decisao: manter evidencia como cobertura de encaminhamento terminal simples; nao usar como fechamento da Wave 47
```

## Novo Plano Estrutural - Budget Items Manager

```text
camada: Budget Items Manager
posicao: entre ConversationRouter/Policy e WorkflowManager
missao: modelar uma conversa como 1..N itens de tattoo orcamentaveis
estado_do_item: em_coleta | aguardando_confirmacao | pronto_para_handoff | enviado_ao_tatuador | substituido | cancelado
active_item_id: item atualmente em coleta
legacy_bridge: manter campos atuais de dados_coletados espelhados para compatibilidade ate migrar totalmente
```

Contrato minimo do primeiro corte:

```text
entrada: cliente em jornada completa ja enviada ao tatuador manda nova ideia de tattoo
saida_esperada: bot responde confirmando ambiguidade entre substituir ou adicionar
proibido: silencio automatico, novo ORCID imediato, chamar enviar-orcamento, sobrescrever briefing antigo antes da confirmacao, tratar como cobertura/risco sem gatilho real
```

## Micro-Slice 2 - Budget Change Pending

```text
status: tecnico_pass_local
escopo: detectar nova ideia orcamentavel em aguardando_tatuador antes do terminal silencioso
saida_cliente: pergunta se a nova ideia substitui a anterior ou se e adicional
persistencia: dados_coletados.budget_change_pending com snapshot anterior e proposed_item
telegram: aviso operacional de mudanca/novo orcamento pendente, nao pacote final multi-item
resolve_agora: resposta "as duas" reabre coleta do segundo item; "somente essa" marca anterior como substituido e reabre coleta da nova ideia
nao_faz_ainda: coletar item 2 ate pronto, gerar pacote Telegram final com multiplas tattoos
gate: nao fechar PASS de produto sem WhatsApp real organico completo + Telegram correto
```

## Micro-Slice 3 - Segundo Item E Telegram Multi-Tattoo

```text
status: PASS
escopo: resolver confirmacao "as duas"/"somente essa", sincronizar o item ativo durante a coleta, concluir segundo item e enviar update Telegram usando o mesmo ORCID
persistencia: dados_coletados.budget_items[], active_budget_item_id e status por item
workflow: se cadastro ja estava completo, tattoo completa volta direto para aguardando_tatuador e exige pacote/update de orcamento
telegram: briefing explicita N tattoos no orcamento e lista cada item; item ativo pendente e marcado como sent_to_artist apos envio
cenario_definitivo: whatsapp-real-long-journey-post-handoff-new-request com 10 steps, do inicio ao update final
gate: PASS fechado apos CI/deploy + WhatsApp real completo + chegada correta do Telegram final
```

Falha util inicial:

```text
run: scenario-whatsapp-real-long-journey-post-handoff-new-request-20260527T180425Z-10038
resultado: FAIL no step 9
ponto_que_passou: jornada inicial, primeiro ORCID, pergunta "somente essa/anterior tambem" e confirmacao "as duas"
falha: mensagem "blackwork" foi recebida, mas o item 2 herdou estilo fineline do topo legado da tattoo anterior; Router nao captou estilo pendente e caiu em fallback tardio
correcao: ao ativar um novo budget item, o top-level legado passa a representar o item ativo e limpa estilo/fotos antigos
status_pos_correcao: npm test PASS 1238/1238; CI/deploy passaram; WhatsApp real completo passou no run definitivo
```

Falha residual encontrada antes do fechamento:

```text
run_funcional_superseded: scenario-whatsapp-real-long-journey-post-handoff-new-request-20260527T181411Z-26512
resultado: PASS funcional, mas superseded
falha: update Telegram enviava a foto, mas o PATCH final podia sobrescrever `foto_local_file_id` gravado pelo upload de midia
correcao: commit `b456c02 fix: preserve media ids in budget update`
teste: npm test PASS 1238/1238; CI PASS 26530216616; Deploy PASS 26530216614
```

Fechamento definitivo:

```text
run: scenario-whatsapp-real-long-journey-post-handoff-new-request-20260527T182057Z-3182
tipo: WhatsApp real full journey
origem: Evolution central -> bot (*2357)
telefone: 5521970789797
orcid: orc_mnw4ro
estado_final: aguardando_tatuador
budget_items_total: 2
item_1: borboleta / fineline / perna / sent_to_artist
item_2: caveira / blackwork / perna / sent_to_artist
telegram_update: fotos-orcamento-update-enviadas
telegram_update_payload: itens_total=2, active_budget_item_id=item_2, enviadas=1, falhas=0
persistencia_midia: foto_local_file_id preservado apos update
resultado: PASS
```

Provas conclusivas reais:

```text
Cliente: "mudei de ideia, queria uma caveira na perna"
Bot: "Beleza! Mas so pra eu entender certinho, voce quer fazer somente essa ou a anterior tambem?"

Cliente: "as duas"
Bot: "Fechado, vou considerar as duas. Pra caveira na perna, qual estilo voce imagina?"

Cliente: "blackwork"
Bot: "Consegue mandar uma foto do local onde tu quer tatuar?"

Cliente: "segue foto do local" + imagem
Bot: "Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor."
```

Contrato atual:

```text
se cliente disser "so essa": marcar item anterior como substituido/cancelado e coletar campos faltantes da nova tattoo
se cliente disser "as duas": criar segundo item ativo e coletar briefing/foto desse item
se item novo ficar completo: Telegram deve explicitar "Orcamento com 2 tattoos" e listar cada item com suas fotos
```

## Nota De Replanejamento

O teste manual real mostrou que a conversa organica podia degradar para coleta de formulario mesmo quando os micro-slices controlados passavam. A metodologia foi corrigida com `whatsapp_real_burst`, e o pacote organico passou antes desta Wave ser retomada.

Proxima acao antes do Micro-Slice 1:

```text
1. rodar `whatsapp-real-organic-burst-3-bubbles`;
2. rodar `whatsapp-real-organic-burst-2-bubbles`;
3. registrar transcript, tail, agent logs, estado final e julgamento;
4. atualizar active context;
5. so entao retomar o contrato pos-handoff desta Wave.
```

Resultado:

```text
falha_inicial: scenario-whatsapp-real-organic-burst-3-bubbles-20260527T163151Z-11946
fix_commit: 1374747 fix: handle organic tattoo burst briefing
pass_3_bolhas: scenario-whatsapp-real-organic-burst-3-bubbles-20260527T163643Z-11019
pass_2_bolhas: scenario-whatsapp-real-organic-burst-2-bubbles-20260527T163821Z-10923
decisao: Wave 47 liberada, mas fechamento definitivo exige full journey validation
```

## Replanejamento Metodologico - Full Journey

O contrato antigo usava `seed_pos_handoff_aguardando_tatuador` para chegar direto no estado terminal. Isso e util para radar tecnico, mas nao prova a experiencia real. O risco desta Wave depende justamente de contexto acumulado: o cliente iniciou, explicou a tattoo, enviou dados, o sistema criou um ORCID e o humano assumiu. So depois disso a mudanca de ideia tem significado operacional.

Nova regra da Wave:

```text
seed_pos_handoff:
  uso: radar tecnico e triage se a jornada completa falhar
  fechamento: proibido

jornada_completa:
  uso: validacao definitiva
  origem: WhatsApp real central -> bot
  inicio: conversa nova com cleanup inicial
  caminho: abertura organica -> briefing tattoo -> foto/local quando aplicavel -> cadastro -> handoff/orcid -> novo pedido pos-handoff
  fechamento: bot pergunta se substitui/adiciona; confirmacao "as duas" coleta segundo item; Telegram final lista as duas tattoos no mesmo ORCID
```

## Strategic Slice Gate

```text
hipotese_estrategica: o bot preserva seguranca operacional quando o cliente muda de direcao depois de handoff ou em conversa antiga
tipo: produto + risco
risco_principal: duplicar orcamento, reabrir coleta indevidamente, misturar novo pedido com ORCID antigo ou responder IA depois de handoff humano
evidencia_minima: 1 jornada completa desde primeiro contato ate handoff real, seguida de texto de novo pedido/mudanca de ideia no mesmo historico; HTTP radar pode preceder, mas WhatsApp real full journey fecha
whatsapp_real_obrigatorio: sim, porque e comportamento conversacional e operacional percebido pelo cliente/tatuador
criterio_de_fechamento: jornada inteira cria ORCID uma vez; mensagem nova do cliente chega ao humano sem IA nova, sem novo ORCID, sem mudanca de estado e com evidencia legivel
decisao_liberada_se_passar: separar replanejamento terminal como coberto por handoff humano; proximo gap passa a ser replanejamento antes do handoff ou conversa antiga nao-terminal
```

## Terreno Atual

O sistema ja tem defesa forte para pos-handoff:

- `aguardando_tatuador` e estado terminal;
- encaminhamento de texto e midia ao humano;
- `SMOKE_REQUIRE_AI_RESPONSE=0` em cenarios pos-handoff;
- Naturalness V2 calibrado para tratar ausencia de IA como sucesso operacional;
- evidencias previas de texto/midia pos-handoff.

O gap desta Wave nao e "qualquer pos-handoff". O gap e semantico: mensagem que parece novo pedido, mudanca de ideia ou alteracao de briefing depois que o humano ja assumiu.

## Fora De Escopo

```text
financeiro: fora
agenda/pagamento/sinal: fora
novo motor automatico de replanejamento: fora
criar novo ORCID automatico: fora
responder com IA depois de handoff: fora neste primeiro corte
```

## Micro-Slice 1 - Novo Pedido Depois Do Handoff Via Jornada Completa

```text
status: PASS reclassificado
tipo: regressao forte + risco operacional
setup: cleanup inicial apenas; sem seed terminal na validacao definitiva
jornada: cliente inicia pedido de tattoo, entrega briefing, completa cadastro ate handoff, depois envia "mudei de ideia, queria uma caveira na perna"
contrato_original: encaminhar a mudanca ao tatuador sem IA nova, manter aguardando_tatuador, preservar orcid criado na propria jornada, nao criar novo orcamento
reclassificacao: prova encaminhamento terminal simples, nao prova replanejamento premium
```

## Resultado Micro-Slice 1

```text
whatsapp_real_full_journey: scenario-whatsapp-real-long-journey-post-handoff-new-request-20260527T172227Z-14895
origem: Evolution central -> bot (*2357)
telefone: 5521970789797
estado_final: aguardando_tatuador
orcid: orc_0atuaw preservado
novo_orcid: nao
ai_messages_after_last_human: 0
tail_gate: PASS, pos-handoff-mensagem-encaminhada presente; enviar-orcamento/runAgent/openai ausentes no delta da etapa final
naturalness_v2: PASS, media 2.88, tag pos_handoff_sem_ia_ok
tests: node --test tests/**/*.test.mjs PASS 1227/1227
reclassificacao: evidencia valida para encaminhamento terminal simples, insuficiente para replanejamento/multiplos orcamentos
```

Provas conclusivas reais:

```text
Cliente: "prefiro falar por aqui"
Bot: "Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor."

Cliente: "mudei de ideia, queria uma caveira na perna"
Bot: sem nova resposta automatica apos o humano
```

## Correcao Metodologica Do Tail

Durante o primeiro rerun, o comportamento passou, mas o gate de tail bloqueou porque lia evento antigo da etapa 6 (`enviar-orcamento`) no log continuo da etapa 7. O runner foi corrigido para validar apenas o delta de tail gerado depois do inicio de cada etapa/cenario.

```text
risco_corrigido: falso bloqueio por tail contaminado entre etapas
arquivos: scripts/smoke/run-scenario.sh, scripts/smoke/run-real-whatsapp.sh, scripts/smoke/run-inbound.sh
regra: tail gate com EXPECTED_TAIL_REGEX/FORBIDDEN_TAIL_REGEX deve comparar apenas logs novos da etapa atual
validacao: rerun full journey WhatsApp real PASS com tail text gate ativo na etapa 7
```

## Gates

```text
http_radar: permitido como preflight, preferencialmente full journey ou seed apenas para diagnostico
whatsapp_real: obrigatorio em jornada completa desde o inicio
expected_state: aguardando_tatuador
require_ai_response: variavel por etapa; mudanca de ideia exige resposta de confirmacao, pos-update final exige handoff correto
orcid: criado uma vez na propria jornada e preservado apos a mudanca de ideia
novo_orcid: proibido
tail: budget-change-confirmation-sent, budget-change-confirmation-resolved e fotos-orcamento-update-enviadas nas etapas corretas
forbidden_tail: pipeline batch failed|unhandled; encaminhamento terminal silencioso proibido na etapa de nova ideia
evidencia_obrigatoria: transcript completo mostrando inicio, primeiro handoff, pergunta de confirmacao, confirmacao "as duas", coleta do segundo item e Telegram final multi-tattoo
```

## Criterios De Parada

```text
silencio automatico na nova ideia orcamentavel
novo item nao ser coletado apos "as duas"
Telegram final nao listar multiplas tattoos quando houver mais de um item
novo ORCID criado
WhatsApp real ausente
validacao definitiva usando seed terminal em vez de jornada completa
```

## Proxima Decisao

So fechar a Wave 47 se a jornada real completa passar e o Telegram final chegar correto. Se falhar, corrigir o ponto estrutural antes de qualquer nova frente.
