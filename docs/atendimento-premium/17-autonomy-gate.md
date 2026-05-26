# Autonomy Gate

Este protocolo define quando o loop de atendimento premium pode aumentar a janela de execucao sem intervencao humana. A regra central e simples: autonomia nao aumenta por sensacao; aumenta por evidencia versionada, gates passando e ausencia de bloqueadores.

## Comando

```bash
bash scripts/smoke/check-autonomy-gate.sh
```

## Fonte De Verdade

```text
docs/atendimento-premium/autonomy-gate.env
```

Esse arquivo declara:

- `CURRENT_LEVEL`;
- `MAX_BATCH_SIZE`;
- `MIN_PASS_UTC`;
- requisitos minimos para promocao;
- slice gates obrigatorios;
- documentos obrigatorios;
- bloqueadores manuais.

## Niveis

```text
Nivel 0: Manual
Codex analisa e propoe, mas nao executa mudancas.

Nivel 1: 1 micro-slice
Pode implementar, testar, commitar, deployar, rodar smoke e registrar 1 comportamento por rodada.

Nivel 2: Pacote pequeno
Pode executar 2-3 micro-slices relacionados na mesma rodada, desde que nao toque risco vermelho.

Nivel 3: Mini-campanha
Pode finalizar uma familia de cenarios, como perguntas laterais simples, ate bater em falha ou bloqueador.

Nivel 4: Loop continuo supervisionado
Pode continuar ate falha, risco alto ou fim da onda. Requer staging/sandbox e rollback maduros.
```

## Nivel Atual

```text
current_level: 4
max_batch_size: conferir docs/atendimento-premium/autonomy-gate.env
politica: Level 4B, loop supervisionado com HTTP radar e WhatsApp real definitivo por micro-slice conversacional
```

## Requisitos Para Promover Ao Nivel 2

O script pode recomendar `promote_available` quando todos os pontos abaixo forem verdadeiros:

- pelo menos 5 scenarios PASS desde `MIN_PASS_UTC`;
- pelo menos 2 scenarios WhatsApp real PASS desde `MIN_PASS_UTC`;
- todos os slice gates obrigatorios passam;
- documentos obrigatorios existem;
- `BLOCKED_REASONS` esta vazio.

A promocao nao e automatica. Para promover, alterar `CURRENT_LEVEL`, `CURRENT_LEVEL_LABEL` e `MAX_BATCH_SIZE` em `autonomy-gate.env`, com commit proprio explicando a base de evidencia.

## Requisitos Para Recomendar Promocao Ao Nivel 3

O script pode recomendar `promote_available` para Level 3 quando todos os pontos abaixo forem verdadeiros:

- o projeto ja esta em Level 2;
- pelo menos 40 scenarios PASS desde `MIN_PASS_UTC`;
- pelo menos 18 scenarios WhatsApp real PASS desde `MIN_PASS_UTC`;
- todos os slice gates criticos passam;
- nao ha bloqueadores manuais;
- docs obrigatorios existem.

Level 3 ainda nao significa loop infinito. Ele permite uma mini-campanha de uma familia de cenarios, com parada imediata em falha de WhatsApp real, deploy, cleanup, CI, gate ou risco alto.

## Requisitos Para Recomendar Promocao Ao Nivel 4

O script pode recomendar `promote_available` para Level 4 quando todos os pontos abaixo forem verdadeiros:

- o projeto ja esta em Level 3;
- pelo menos 70 scenarios PASS desde `MIN_PASS_UTC`;
- pelo menos 35 scenarios WhatsApp real PASS desde `MIN_PASS_UTC`;
- todos os slice gates criticos passam, incluindo `workflow-manager`;
- existem documentos especificos de rollback/staging e politica de loop Level 4;
- nao ha bloqueadores manuais.

Slice gates candidatos de Level 4:

- `atendimento-lateral`;
- `cadastro-handoff`;
- `escalation-manager`;
- `workflow-manager`.

Level 4 exige infraestrutura operacional madura. Sem rollback documentado, staging/sandbox confiavel e politica de parada supervisionada, o gate nao deve recomendar Level 4 mesmo que o volume de PASS seja alto.

Documentos de comando:

- [18-rollback-staging-protocol.md](./18-rollback-staging-protocol.md)
- [19-level-4-loop-policy.md](./19-level-4-loop-policy.md)
- [25-multi-agent-governance.md](./25-multi-agent-governance.md)

Esses documentos removem o bloqueio estrutural para discutir Level 4, mas nao promovem o nivel. A promocao continua exigindo commit deliberado em `autonomy-gate.env`.

## Bloqueadores Absolutos

Mesmo com pontuacao suficiente, nao aumentar autonomia se houver:

- estado inconsistente;
- mensagem duplicada;
- falha em WhatsApp real sem causa clara;
- risco de preco, pagamento, sinal ou agendamento;
- mudanca em secrets;
- mudanca ampla em tenant real;
- cleanup fora do telefone de teste;
- falha repetida sem causa clara;
- decisao de produto pendente.

Registrar esses itens em `BLOCKED_REASONS`.

## Politica De Execucao Por Nivel

### Nivel 1

Permitido:

- 1 comportamento completo;
- testes locais relevantes;
- commit pequeno;
- push, CI e deploy;
- smoke HTTP;
- 1 smoke WhatsApp real obrigatorio quando o micro-slice altera comportamento de atendimento;
- transcript, judgment, triage/plan-review se falhar;
- atualizacao de registry, gate e objetivo vivo.

Parar depois do registro final.

### Nivel 2

Permitido:

- 2-3 comportamentos relacionados;
- mesma familia de risco;
- nenhum fluxo de dinheiro, agenda, Telegram real, secret ou tenant amplo;
- gate parcial a cada comportamento;
- WhatsApp real por micro-slice conversacional assim que o HTTP passar;
- gate de pacote no fim.

Parar se qualquer comportamento falhar 2 vezes ou se aparecer bloqueador absoluto.

### Nivel 3

Permitido:

- finalizar uma familia de cenarios relacionados em mini-campanha de ate 4 micro-slices;
- manter HTTP radar e WhatsApp real definitivo por micro-slice conversacional;
- rodar gate de pacote no fim;
- parar em qualquer falha, risco financeiro, agendamento, pagamento, cleanup inseguro ou divergencia de estado.

Ainda nao permitido:

- mexer em secrets;
- alterar tenant real amplo;
- rodar cleanup fora do telefone de teste;
- tocar dinheiro, agenda ou pagamento sem plano e gate especificos;
- continuar apos falha sem triage.

### Nivel 4+

Reservado para quando a Onda 1 tiver cobertura ampla, WhatsApp real estavel, staging/sandbox confiavel e rollback claro.

Permitido depois de promocao deliberada:

- continuar ate fim de uma onda planejada ou ate qualquer falha;
- executar familias completas de cenarios com supervisao por gates;
- depender de rollback/staging documentado antes de tocar risco alto.

Janela inicial aprovada:

```text
Level 4A: ate 6 micro-slices da mesma onda declarada.
```

Nao permitido:

- operar como loop infinito sem objetivo fechado;
- pular WhatsApp real definitivo;
- tocar produção sensivel sem plano de rollback;
- ignorar falha de CI, deploy, smoke, cleanup ou gate.
- usar agentes paralelos sem comandante unico e single-writer.

Multi-agentes em Level 4B/4C devem seguir `25-multi-agent-governance.md`: agentes podem acelerar analise, preparo, auditoria e triage, mas o Commander continua unico responsavel por integrar, commitar, deployar, rodar WhatsApp real e declarar PASS final.

## Ordem Padrao

1. Rodar `check-autonomy-gate.sh`.
2. Respeitar `allowed_batch_size`.
3. Executar ate o limite permitido, sempre na ordem HTTP radar -> WhatsApp real definitivo para cada micro-slice conversacional.
4. Rodar slice gate.
5. Atualizar `smoke-runs.md` e `current-objective.md`.
6. Rodar `check-autonomy-gate.sh` novamente.
7. Se aparecer `promote_available`, registrar a recomendacao, mas nao promover sem decisao deliberada.

## Veredito Operacional

Enquanto o projeto estiver em Nivel 4A, a maior janela segura continua sendo:

```text
conferir CURRENT_LEVEL_LABEL e MAX_BATCH_SIZE em autonomy-gate.env.
```

Qualquer aumento para 4B/4C exige nova evidencia, ondas saudaveis no nivel anterior e commit deliberado alterando `MAX_BATCH_SIZE`.
