# Level 4 Loop Policy

Este protocolo define como o loop continuo supervisionado deve operar quando o projeto estiver pronto para Level 4. Ele transforma autonomia maior em uma sequencia de gates, nao em permissao aberta.

## Objetivo

```text
Permitir que Codex execute uma onda completa planejada com checkpoints automaticos, WhatsApp real definitivo e parada obrigatoria em qualquer sinal de risco.
```

## Estado Atual

```text
current_level: 4
level_4_status: Level 4A promovido deliberadamente
promocao: 4B/4C exige nova decisao deliberada e commit em docs/atendimento-premium/autonomy-gate.env
```

## Definicao De Level 4

Level 4 e um loop supervisionado por evidencias. Ele permite continuar ate o fim de uma onda planejada, desde que todos os gates continuem verdes.

Level 4 nao permite:

- loop infinito;
- pular WhatsApp real;
- pular CI/deploy;
- ignorar falhas;
- tocar zona vermelha sem staging;
- alterar secrets sem aprovacao explicita.
- paralelismo livre sem comandante unico e single-writer.

## Governanca Multi-Agente

Multi-agentes podem apoiar Level 4B/4C apenas sob o protocolo [25-multi-agent-governance.md](./25-multi-agent-governance.md).

Regras canonicas:

- o Commander continua sendo o unico responsavel por integrar, commitar, deployar, rodar WhatsApp real e declarar PASS final;
- cada micro-slice pode ter apenas um writer de codigo;
- agentes paralelos podem acelerar analise, preparo de cenarios, auditoria e triage;
- WhatsApp real definitivo continua serial no telefone de teste;
- arquivos de verdade operacional (`autonomy-gate.env`, `smoke-runs.md`, `current-objective.md`, `09-session-handoff.md`) nao podem receber escrita paralela;
- multi-agentes nao tornam 4C elegivel por si so.

Se dois agentes precisam editar a mesma camada logica, o trabalho deve ser sequenciado.

## Pre-Condicoes Para Promocao

O Level 4 so pode ser discutido quando todos os itens abaixo forem verdadeiros:

- `check-autonomy-gate.sh` retorna `status=PASS`;
- `decision=promote_available`;
- `scenario_pass_count >= 70`;
- `real_whatsapp_pass_count >= 35`;
- slice gates criticos PASS:
  - `atendimento-lateral`;
  - `cadastro-handoff`;
  - `escalation-manager`;
  - `workflow-manager`;
- `18-rollback-staging-protocol.md` existe;
- `19-level-4-loop-policy.md` existe;
- `BLOCKED_REASONS` vazio;
- ultimo ciclo de trabalho terminou com:
  - CI PASS;
  - deploy PASS;
  - HTTP radar PASS;
  - WhatsApp real PASS;
  - cleanup final limpo.

## Promocao Deliberada

Promocao exige commit proprio alterando:

```text
CURRENT_LEVEL="4"
CURRENT_LEVEL_LABEL="Level 4A: loop supervisionado de ate 6 micro-slices da mesma onda"
MAX_BATCH_SIZE="6"
```

Esse commit deve citar:

- evidencia do Autonomy Gate;
- ultima rodada real validada;
- familia/onda que sera executada primeiro;
- limite de batch aprovado;
- criterio de rollback.

Sem esse commit, o projeto permanece no nivel anterior mesmo que o gate recomende promocao.

## Tamanho Da Janela Level 4

Level 4 nao deve comecar com autonomia maxima.

Parametros recomendados:

| Estagio | Janela | Condicao |
|---|---:|---|
| 4A | ate 6 micro-slices da mesma onda | primeira rodada Level 4, baixo ou medio risco |
| 4B | ate 8 micro-slices da mesma onda | 2 rodadas 4A sem falha |
| 4C | onda completa definida | somente depois de 2 rodadas 4B sem falha e sem zona vermelha |

Enquanto `MAX_BATCH_SIZE` nao for alterado deliberadamente, vale o limite do gate atual.

## Anatomia De Uma Onda

Uma onda Level 4 precisa ser declarada antes de executar:

```text
onda_id:
objetivo:
familia:
risco: verde|amarelo|vermelho
escopo:
fora_de_escopo:
scenarios_obrigatorios:
whatsapp_real_obrigatorio:
rollback:
criterio_de_pronto:
```

Sem essa declaracao, nao existe onda Level 4A valida. Existe apenas trabalho fora do protocolo.

## Loop Operacional

Para cada micro-slice:

1. Confirmar contexto com `continuity-bundle.sh --force` se houver risco de compactacao.
2. Confirmar worktree.
3. Implementar menor mudanca coerente.
4. Rodar testes locais relevantes.
5. Commit funcional pequeno.
6. Push.
7. Aguardar CI e deploy.
8. Rodar HTTP radar.
9. Rodar WhatsApp real definitivo quando conversacional.
10. Confirmar `summary.md`, `transcript.md`, `judgment.md` e logs quando exigidos.
11. Registrar em `smoke-runs.md`.
12. Rodar slice gate quando aplicavel.

No fim da onda:

1. rodar Autonomy Gate;
2. atualizar `current-objective.md`;
3. atualizar `09-session-handoff.md`;
4. limpar conversa de teste;
5. confirmar worktree limpo;
6. registrar recomendacao: manter, expandir, rebaixar ou pausar.

## Continue Implicito

Quando um micro-slice terminar sem regressao, sem blocker e sem decisao humana pendente, a ausencia de nova direcao do usuario ou uma resposta curta de continuidade deve ser interpretada como autorizacao para seguir para o proximo micro-slice logico da mesma onda declarada.

Isso nao aumenta autonomia, nao promove nivel e nao permite pular gates. A regra apenas remove pausas artificiais quando o processo ja provou que nao ha acao humana imediata.

Condicoes obrigatorias:

- `wave-health` PASS;
- CI/deploy PASS quando houve commit;
- HTTP radar PASS quando aplicavel;
- WhatsApp real PASS quando o comportamento for conversacional;
- worktree limpo;
- sem regressao, bug aberto ou stop condition;
- sem zona vermelha;
- sem promocao de autonomia;
- sem mudanca de escopo, produto, copy sensivel ou arquitetura;
- proximo passo dentro da mesma onda declarada ou fechamento natural da onda.

Deve parar e pedir decisao quando:

- qualquer stop condition ocorrer;
- houver falha, regressao ou triage pendente;
- proximo passo exigir nova onda com escopo ambiguo;
- tocar preco, agenda, pagamento, secrets, tenant real amplo ou 4C;
- alterar linguagem de marca/copy sensivel;
- surgir risco legal, financeiro ou operacional novo.

Registro esperado:

- final de slice deve informar PASS, run ids e provas conclusivas reais quando houver WhatsApp real;
- se o criterio de continue implicito for usado, registrar no handoff/current objective que nao havia decisao humana pendente;
- a decisao de continuar deve apontar para o proximo micro-slice logico, nao para trabalho aberto sem onda declarada.

Aplicacao pratica:

- se todos os gates estiverem verdes e o proximo micro-slice logico ja estiver declarado na mesma onda, o fechamento do slice nao deve virar pausa operacional;
- a resposta ao usuario deve ser um update curto de PASS e, em seguida, o loop deve iniciar o proximo micro-slice;
- enviar um fechamento final sem iniciar o proximo micro-slice so e correto quando a onda terminou, quando o proximo passo e ambiguo ou quando alguma stop condition exige decisao humana.

## Stop Conditions

Parar imediatamente se qualquer item ocorrer:

- CI FAIL;
- deploy FAIL;
- HTTP radar FAIL;
- WhatsApp real FAIL;
- `copy_risk=alto`;
- estado final errado;
- mensagem duplicada;
- falta de resposta AI;
- cleanup inseguro;
- `agent_turn_logs` nao satisfaz gate;
- falha em Telegram interno;
- risco de preco/pagamento/sinal/agenda;
- contexto abaixo de seguranca sem continuidade recuperavel;
- usuario envia nova direcao conflitante.
- conflito de ownership entre agentes;
- smoke rodado sobre commit diferente do deploy validado;
- evidencia sem run id, artifact, commit ou registro;
- WhatsApp real paralelo no mesmo telefone/setup.

Depois de parar:

- gerar ou abrir `triage.md`;
- se for `contract_*`, gerar/abrir `plan-review.md`;
- nao seguir para outro micro-slice ate o mesmo scenario virar PASS ou a onda ser abortada.

## Regras De Regressao De Autonomia

Voltar para Level 3 se:

- qualquer stop condition critica nao tiver causa clara em ate uma rodada de triage;
- duas falhas da mesma classe ocorrerem na mesma onda;
- uma mudanca vermelha for necessaria sem staging confiavel;
- a automacao pular registro, cleanup ou WhatsApp real;
- houver divergencia entre `smoke-runs.md` e evidencia real.

Voltar para Level 2 se:

- falha de estado gerar risco de cliente real;
- houver risco financeiro, pagamento, sinal ou agenda;
- cleanup apagar dado fora do telefone de teste;
- secrets forem alterados incorretamente.

## Parametros De Qualidade

Uma rodada Level 4 so pode ser considerada saudavel quando:

- todos os scenarios da onda estao PASS;
- todo comportamento conversacional tem WhatsApp real PASS;
- todos os artifacts obrigatorios existem;
- `Decision Observability` aparece quando houver `agent-turn-logs.json`;
- nenhuma falha ficou sem triage;
- nenhum commit mistura familias sem justificativa;
- worktree termina limpo.

## Primeira Onda Recomendada

Primeira onda Level 4A:

```text
onda_id: level4-rehearsal-1
familia: monitoramento/smoke ou atendimento lateral de baixo risco
risco: verde/amarelo
janela: 4A, ate 6 micro-slices
fora_de_escopo: preco, sinal, pagamento, agenda, secrets, tenant real amplo
criterio_de_pronto: CI PASS, deploy PASS, HTTP radar PASS, WhatsApp real PASS quando aplicavel, gates PASS, cleanup limpo
```

## Veredito

Level 4A esta permitido apenas como loop supervisionado por onda declarada. A promocao foi manual, versionada e reversivel. Qualquer aumento para 4B/4C exige nova evidencia, duas ondas saudaveis no nivel anterior e commit deliberado.
