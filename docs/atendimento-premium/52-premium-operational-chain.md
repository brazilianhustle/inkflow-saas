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
| Mudanca de comportamento conversacional | HTTP radar + WhatsApp real obrigatorios. |
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
2. Auditar evidencia real existente.
3. Escolher uma familia, nao uma frase solta.
4. Implementar menor mudanca coerente.
5. Validar local/CI/deploy.
6. Rodar HTTP radar.
7. Rodar WhatsApp real definitivo.
8. Rodar auditoria V2 quando houver linguagem.
9. Registrar prova curta Cliente/Bot.
10. Rodar wave-health.
11. Fechar ou travar com triage.
```

## Proxima Frente Recomendada

```text
frente: auditoria V2 por familia de cadastro/handoff
objetivo: identificar watchlists reais atuais antes de nova mudanca de copy
acao: read-only primeiro
mudanca_de_codigo: somente se evidencia atual justificar
validacao_definitiva: WhatsApp real por comportamento conversacional alterado
autonomia: manter Level 4B
level_4c: bloqueado
```

## Principio Final

```text
Velocidade profissional vem de gates claros, nao de pular etapas.
```

