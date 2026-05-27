# Cadeia Operacional Do Bot Premium

Este documento solidifica a regra profissional para evoluir o bot sem avancar quando nao deve. Ele conecta arquitetura, ondas, testes, WhatsApp real, naturalidade e autonomia em uma cadeia unica de decisao.

## Veredito

```text
bot_premium != prompt_bonito
bot_premium = atendimento correto + estado seguro + handoff rastreavel + naturalidade medida + validacao real
```

O projeto so deve avancar quando a cadeia inteira estiver verde. Se qualquer elo falhar, a decisao correta e travar, diagnosticar e corrigir antes de abrir nova frente.

## Cadeia De Valor

```text
1. Intencao humana entendida
2. Politica decide o que pode ou nao pode acontecer
3. Workflow valida transicao de estado
4. Context/Tenant injeta regras do estudio
5. Guardrails seguram risco operacional
6. Escalation Manager chama humano quando necessario
7. Persistencia registra estado e dados
8. Observabilidade explica a decisao
9. Resposta ao cliente e natural, curta e correta
10. WhatsApp real prova que a cadeia funciona fora do laboratorio
```

Nenhuma melhoria de linguagem deve passar por cima de estado, seguranca, handoff ou observabilidade.

## Regra De Avanco

Uma onda ou micro-slice so pode ser considerado pronto para avancar quando todos os itens aplicaveis forem verdadeiros:

```text
plano_declarado: sim
escopo_fechado: sim
fora_de_escopo_explicito: sim
risco_classificado: verde|amarelo
testes_locais: PASS quando houve codigo
ci: PASS quando houve commit
deploy: PASS antes de smoke em producao
http_radar: PASS quando behavior/contrato foi afetado
whatsapp_real: PASS quando atendimento conversacional foi afetado
naturalness_v2: sem STOP/REWORK em onda de linguagem/naturalidade
observabilidade: agent_turn_logs/gates PASS quando a decisao precisa ser explicada
registro: smoke-runs/current-objective/wave doc atualizados
wave_health: PASS no fechamento
worktree: limpo no fechamento
```

Se uma dessas condicoes falhar, nao existe PASS profissional. Existe triage pendente.

## Strategic Slice Gate

Antes de abrir qualquer novo micro-slice, a frente deve passar por um gate estrategico curto. O objetivo e impedir que o processo vire uma sequencia de cenarios pequenos sem nova hipotese premium.

```text
1. hipotese_estrategica:
2. tipo: arquitetura|produto|risco|regressao
3. risco_principal:
4. evidencia_minima:
5. whatsapp_real_obrigatorio: sim|nao + motivo
6. criterio_de_fechamento:
7. decisao_liberada_se_passar:
```

Classificacao operacional:

```text
arquitetura: prova camada, contrato central, runner, workflow ou observabilidade.
produto: prova experiencia percebida pelo cliente/tatuador.
risco: protege menoridade, handoff, orcamento, agenda, pagamento ou estado terminal.
regressao: confirma que algo ja provado continua funcionando.
```

Regra de corte:

```text
micro_slice != caso pequeno
micro_slice = menor prova necessaria de uma hipotese estrategica
```

Se a hipotese ja foi provada por 1 a 3 micro-slices equivalentes, a frente deve fechar, declarar novo gap ou mudar de frente. Nao abrir nova variacao apenas porque ela e tecnicamente facil de testar.

Regras de validacao por tipo:

```text
arquitetura/produto/risco: HTTP radar + WhatsApp real quando houver comportamento conversacional ou impacto operacional.
regressao: pode usar auditoria/read-only/evidencia reaproveitada se nao houve mudanca recente e a evidencia for aderente.
```

Um slice que nao libera decisao de produto, nao reduz risco novo e nao fecha parte do mapa deve ser tratado como regressao/auditoria, nao como micro-slice completo.

## Organic Conversation Sentinel Gate

O teste manual real mostrou que micro-slices controlados podem passar enquanto a conversa organica degrada para formulario. Por isso, qualquer frente que toque abertura, coleta, naturalidade, multi-mensagem, retomada, slang, experiencia percebida ou regressao conversacional real deve passar tambem por um sentinel organico.

O sentinel nao substitui HTTP radar nem contratos de estado. Ele prova que a cadeia continua funcionando quando o cliente fala como cliente real, em bolhas curtas e contexto acumulado.

Contrato minimo:

```text
origem: WhatsApp real central -> bot
formato: conversa multi-bolha, nao apenas uma mensagem sintetica
entrada: saudacao + intencao + local + ideia + tamanho/detalhe em mensagens separadas
obrigatorio: resposta humanizada de primeiro contato, reacao ao briefing, consolidacao dos fragmentos e proxima pergunta coerente
proibido: responder entre bolhas antes da ultima mensagem, ignorar briefing relevante, repetir pergunta ja respondida, soar como formulario bruto, perder estado, criar orcamento prematuro
evidencia: transcript real, resposta Cliente/Bot curta, tail, agent_turn_logs, estado final, julgamento Naturalness V2 quando houver linguagem
```

Regra de parada:

```text
falha manual organica bloqueia a proxima onda conversacional ate virar sentinel versionado e passar
2 ou 3 bolhas reais em burst passam a ser a prova principal de atendimento premium organico
```

Exemplo de gap que exige sentinel:

```text
cliente: "opa" / "tranquilo" / "quero fzr uma tattoo" / "na perna" / "um dragao bolado" / "grandao"
falha: bot perguntou parte do corpo depois da intencao e depois perguntou altura sem reagir ao dragao/tamanho
classificacao: gap conversacional e gap metodologico
```

## Context-Controlled Memory Protocol

Para nao consumir contexto lendo todo o historico, a memoria operacional passa a ter camadas.

```text
camada_0_comando: docs/atendimento-premium/00-active-context.md
camada_1_estado_historico: docs/atendimento-premium/current-objective.md
camada_2_evidencias: docs/atendimento-premium/smoke-runs.md e artifacts
camada_3_doutrina: docs/atendimento-premium/52-premium-operational-chain.md
camada_4_ondas: wave docs especificos, lidos somente quando citados
```

Regras:

```text
apos compactacao: ler primeiro 00-active-context.md ou rodar continuity-bundle
nao ler todos os wave docs por padrao
current-objective.md continua sendo historico duravel, mas nao deve ser a primeira fonte extensa de retomada
smoke-runs.md e indice de evidencia, nao memoria de planejamento
todo bloqueio metodologico ativo deve aparecer no 00-active-context.md
```

## Regra De Nao Avanco

Parar imediatamente e nao abrir nova frente quando ocorrer qualquer item:

```text
CI/deploy FAIL
HTTP radar FAIL
WhatsApp real FAIL
falha sem triage
divergencia entre HTTP e WhatsApp real
estado final errado
ORCID prematuro ou ausente quando obrigatorio
mensagem duplicada
falta de resposta AI quando esperada
IA responde depois de handoff humano quando nao deveria
copy_risk=alto
Naturalness V2 STOP ou REWORK
observabilidade ausente em decisao critica
evidencia sem run_id/artifacts/registro
smoke rodado contra commit diferente do deploy validado
risco de preco fechado, agenda, pagamento, sinal ou menoridade sem plano especifico
compactacao/contexto inseguro sem continuity bundle
active-context ausente ou desatualizado apos replanejamento metodologico
falha organica manual sem sentinel versionado e revalidado
```

Nesses casos, a proxima acao obrigatoria e diagnostico, nao novo slice.

## Ordem Profissional De Evolucao

### 1. Fundacao Operacional

Objetivo: provar que o bot opera corretamente antes de parecer mais humano.

Cobertura obrigatoria:

- primeiro contato;
- coleta de tattoo;
- midia e classificacao de imagens;
- cadastro;
- e-mail opcional;
- handoff de orcamento;
- pos-handoff sem reabrir IA;
- menoridade e risco;
- pedido humano;
- gatilhos de tenant;
- pacote Telegram/handoff.

Gate de maturidade: jornadas completas PASS em HTTP radar e WhatsApp real, com estado final correto e observabilidade suficiente.

### 2. Jornada Completa Auditavel

Objetivo: validar fluxo real, nao apenas resposta isolada.

Cada familia importante deve ter ao menos uma jornada longa que prove:

- progressao de estado;
- retomada apos pergunta lateral;
- persistencia correta;
- ausencia de preco/agenda/pagamento indevido;
- handoff correto quando aplicavel;
- transcript e judgment legiveis;
- provas conclusivas reais no fechamento.

### 3. Naturalidade Escalavel

Objetivo: melhorar linguagem sem virar colecao de remendos.

Naturalidade deve ser atacada por familia:

- abertura;
- resposta lateral;
- retomada de coleta;
- pedido de midia;
- classificacao de imagem;
- cadastro;
- e-mail opcional;
- fechamento/handoff;
- menoridade/risco;
- pos-handoff.

Fluxo obrigatorio para linguagem:

```text
evidencia real -> Naturalness Audit V2 -> familia definida -> VoicePolicy/Policy correta -> testes -> CI/deploy -> HTTP radar -> WhatsApp real -> nova auditoria -> registro
```

Nao corrigir frase isolada se o problema for arquitetura, workflow, contexto ou policy.

### 4. Autonomia Controlada

Objetivo: aumentar velocidade sem perder controle.

Level 4B continua sendo o nivel correto enquanto:

- ainda estamos descobrindo watchlists de naturalidade;
- ainda ha familias a auditar;
- 4C nao tem beneficio claro maior que o risco;
- o WhatsApp real deve continuar serial.

Promocao futura so pode ser discutida com evidencia versionada de multiplas ondas 4B sem regressao, sem falha metodologica e sem pular WhatsApp real.

## Matriz De Decisao

| Situacao | Decisao |
|---|---|
| HTTP PASS, WhatsApp real ausente em comportamento conversacional | Nao fechar. Rodar WhatsApp real. |
| WhatsApp real PASS, Naturalness V2 watchlist leve | Pode fechar funcionalmente; registrar watchlist e priorizar por familia. |
| Naturalness V2 REWORK/STOP | Nao fechar naturalidade. Corrigir ou travar frente. |
| Falha de infra comprovada antes de envio real | Rerun controlado apos preflight; nao contar como regressao do bot. |
| Falha depois do webhook/processamento | Tratar como falha do bot/processo ate triage provar o contrario. |
| Mudanca sem codigo, apenas docs/metodologia | CI/deploy podem passar como check final; WhatsApp real nao e obrigatorio. |
| Auditoria read-only sem mudanca de comportamento, usando evidencia WhatsApp real ja aprovada e exatamente aderente a familia auditada | Pode fechar sem novo envio real, desde que declare a validade da evidencia reaproveitada. |
| Auditoria read-only com duvida de validade da evidencia, mudanca recente no comportamento ou familia incompleta | Rodar WhatsApp real novo antes de fechar. |
| Mudanca de comportamento conversacional | HTTP radar + WhatsApp real obrigatorios. |
| Regressao manual organica em WhatsApp real | Trava a frente, cria Organic Conversation Sentinel e so depois retoma ondas conversacionais. |
| Proximo passo fora da onda declarada | Parar e declarar nova onda antes de executar. |

## Definition Of Done Premium

Um slice premium so esta realmente pronto quando consegue responder estas perguntas:

```text
O que mudou?
Por que mudou?
Qual risco foi controlado?
Qual camada decidiu?
Qual estado final ficou?
Qual evidencia HTTP prova o radar?
Qual evidencia WhatsApp real prova a cadeia real?
Se a evidencia WhatsApp real foi reaproveitada, por que ela ainda e valida?
Qual transcript mostra a conversa?
Qual judgment avaliou a resposta?
Qual log explica router/policy/workflow/handoff?
Qual commit contem a mudanca?
Qual commit registra a validacao?
Qual proximo passo e seguro?
```

Se alguma resposta estiver vazia, o slice ainda nao esta profissionalmente fechado.

## Cadencia Recomendada

```text
1. Declarar onda pequena.
2. Passar pelo Strategic Slice Gate.
3. Passar pelo Organic Conversation Sentinel quando a frente for conversacional/organica.
4. Auditar evidencia real existente.
5. Escolher uma familia/hipotese, nao uma frase solta.
6. Implementar menor mudanca coerente.
7. Validar local/CI/deploy.
8. Rodar HTTP radar.
9. Rodar WhatsApp real definitivo.
10. Rodar auditoria V2 quando houver linguagem.
11. Registrar prova curta Cliente/Bot.
12. Atualizar 00-active-context.md quando o estado de comando mudar.
13. Rodar wave-health.
14. Fechar, declarar novo gap ou mudar de frente.
```

Para ondas read-only, o passo 7 so pode ser dispensado quando a onda declarar explicitamente que nao houve mudanca funcional/conversacional e que a evidencia reaproveitada e WhatsApp real, recente o bastante e aderente a familia auditada. Qualquer duvida volta para WhatsApp real novo.

## Proxima Frente Recomendada

```text
frente: auditoria final de jornada premium
objetivo: provar experiencia ponta a ponta apos fechamento da familia midia/cadastro
acao: declarar Wave 44, selecionar jornadas longas atuais e auditar com HTTP/WhatsApp real quando necessario
mudanca_de_codigo: somente se evidencia atual justificar
validacao_definitiva: WhatsApp real por jornada ou comportamento conversacional alterado
autonomia: manter Level 4B
level_4c: bloqueado
```

## Principio Final

```text
Velocidade profissional vem de gates claros, nao de pular etapas.
```
