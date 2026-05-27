# Level 4B - Wave 47 - Replanejamento E Novo Pedido

## Objetivo

Provar que o bot lida com mudanca de ideia, novo pedido ou complemento relevante depois de conversa avancada/terminal sem grudar no orcamento antigo, sem criar duplicidade e sem reabrir IA quando o humano ja assumiu.

## Status

```text
status: reaberta_por_correcao_de_contrato_produto
motivo: a validacao anterior provou encaminhamento terminal simples, mas nao provou replanejamento/multiplos orcamentos
decisao: separar cobertura pos-handoff simples de mudanca de ideia orcamentavel; abrir arquitetura de Budget Items antes de novo fechamento
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

Contrato futuro:

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
  fechamento: mensagem de mudanca de ideia encaminhada ao humano sem IA nova, sem novo ORCID e sem mudar estado terminal
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
status: PASS
tipo: regressao forte + risco operacional
setup: cleanup inicial apenas; sem seed terminal na validacao definitiva
jornada: cliente inicia pedido de tattoo, entrega briefing, completa cadastro ate handoff, depois envia "mudei de ideia, queria uma caveira na perna"
contrato: encaminhar a mudanca ao tatuador sem IA nova, manter aguardando_tatuador, preservar orcid criado na propria jornada, nao criar novo orcamento
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
require_ai_response: 0
orcid: criado uma vez na propria jornada e preservado apos a mudanca de ideia
novo_orcid: proibido
ai_messages_after_last_human: 0
tail: pos-handoff-mensagem-encaminhada
forbidden_tail: enviar-orcamento|runAgent|openai|pipeline batch failed|unhandled
evidencia_obrigatoria: transcript completo mostrando inicio, handoff e mensagem final de mudanca de ideia
```

## Criterios De Parada

```text
qualquer IA nova depois do humano
estado sair de aguardando_tatuador
novo ORCID criado
mensagem nao encaminhada ao humano
tail com runAgent/openai/enviar-orcamento
WhatsApp real ausente
validacao definitiva usando seed terminal em vez de jornada completa
```

## Proxima Decisao Apos Micro-Slice 1

Se a jornada completa passar, registrar como cobertura terminal de novo pedido pos-handoff e decidir:

- atacar replanejamento antes do handoff, quando ainda ha coleta ativa;
- ou atacar conversa antiga nao-terminal/retomada;
- ou fechar a frente se o risco terminal era o principal alvo.
