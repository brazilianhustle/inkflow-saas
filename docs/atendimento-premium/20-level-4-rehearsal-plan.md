# Level 4 Rehearsal Plan

Este plano declara a proxima rota estrategica: ensaiar Level 4 ainda dentro do limite de Level 3. O objetivo e provar que os protocolos 18 e 19 sao executaveis antes de aumentar a janela real de automacao.

## Decisao

```text
Nao promover Level 4 agora.
Executar uma rodada de ensaio usando a doutrina Level 4, mas mantendo CURRENT_LEVEL=3 e MAX_BATCH_SIZE=4.
```

## Motivo

O Autonomy Gate ja retorna:

```text
status: PASS
decision: promote_available
scenario_pass_count: 76/70
real_whatsapp_pass_count: 36/35
level_4_docs: PASS
level_4_slice_gates: atendimento-lateral, cadastro-handoff, escalation-manager, workflow-manager
```

Mesmo assim, promocao imediata ainda seria cedo. O proximo passo correto e testar a disciplina operacional recem-criada em uma rodada controlada.

## Onda Declarada

```text
onda_id: level4-rehearsal-1-dry-run
modo_real: Level 3
doutrina_aplicada: Level 4
familia: governanca de automacao e monitoramento
risco: verde/amarelo
janela: ate 4 micro-slices, respeitando o Level 3 atual
promocao: proibida nesta onda
```

## Escopo

Dentro do escopo:

- validar que os protocolos 18 e 19 sao recuperaveis no bundle de continuidade;
- manter Autonomy Gate em `promote_available`, sem alterar `CURRENT_LEVEL`;
- escolher proximas mudancas de baixo risco usando zonas de risco;
- exigir stop conditions formais antes de qualquer nova familia funcional;
- registrar qualquer nova decisao em `08-decision-log.md`;
- manter `summary.md`, `transcript.md`, `judgment.md` e `Decision Observability` como padrao.

Fora do escopo:

- promover para Level 4;
- alterar `autonomy-gate.env`;
- tocar preco, sinal, pagamento, agenda ou secrets;
- tocar tenant real amplo;
- abrir zona vermelha sem staging/preview;
- executar mais de 4 micro-slices na rodada.

## Criterios De Pronto

Esta onda de ensaio fecha quando:

- `check-autonomy-gate.sh` continua PASS;
- `decision=promote_available` esta documentado;
- `CURRENT_LEVEL` continua 3;
- `workflow-manager` aparece como PASS nos slice gates candidatos de Level 4;
- docs 18/19 aparecem como PASS no gate;
- worktree termina limpo;
- CI e deploy passam para os commits da rodada;
- se houver smoke, HTTP radar e WhatsApp real definitivo passam quando aplicavel.

## Stop Conditions

Parar e nao promover se ocorrer:

- qualquer FAIL de CI ou deploy;
- qualquer FAIL de WhatsApp real;
- `copy_risk=alto`;
- divergencia de estado;
- cleanup inseguro;
- falha sem triage;
- necessidade de mexer em zona vermelha;
- contexto abaixo de seguranca sem continuidade recuperavel.

## Parametros Para Promocao Futura

Somente depois desta onda, considerar uma rodada especifica de promocao se:

- nenhum stop condition ocorreu;
- Autonomy Gate permanece `promote_available`;
- o usuario aprovar explicitamente a promocao;
- houver commit proprio alterando `CURRENT_LEVEL=4`;
- primeira janela for `4A`, ate 6 micro-slices;
- primeira onda Level 4 for de risco verde/amarelo.

## Proxima Acao Recomendada

Executar uma rodada Level 3 curta, usando este plano como filtro de comando, antes de qualquer promocao. A primeira frente recomendada continua sendo baixo risco: governanca de smoke/monitoramento ou atendimento lateral sem dinheiro/agenda.
