# Level 4B Wave 1

Primeira onda em Level 4B. A promocao para 4B aumenta a janela operacional para ate 8 micro-slices da mesma onda, mas nao aumenta a permissao de risco. Esta onda fortalece o proprio loop de validacao antes de atacar nova superficie de produto.

## Declaracao

```text
onda_id: level4b-wave-1-multiturn-smoke
objetivo: validar conversas multi-turn com HTTP radar e WhatsApp real definitivo
familia: smoke, monitoring, decision-observability, cadastro-recovery
risco: amarelo
janela: Level 4B, ate 8 micro-slices
```

## Escopo

Dentro do escopo:

- declarar formato versionado para scenarios multi-turn;
- executar mais de uma mensagem humana sequencial no mesmo setup;
- preservar evidencias por passo e evidencia consolidada;
- validar fluxo real `lateral durante cadastro -> resposta ao campo pendente`;
- exigir HTTP radar antes de WhatsApp real;
- registrar provas conclusivas reais no mesmo padrao metodologico.

Fora do escopo:

- preco, sinal, pagamento ou agenda;
- secrets;
- tenant real amplo;
- mudanca de copy ampla;
- alteracao no Agent operacional;
- promocao para 4C.

## Micro-Slices Planejados

1. `multiturn-scenario-contract`: documentar contrato multi-turn e dry-run seguro.
2. `multiturn-http-runner`: executar steps HTTP sequenciais sem perder evidencia por passo.
3. `multiturn-whatsapp-real-runner`: executar steps WhatsApp real sequenciais via `central`.
4. `cadastro-lateral-data-recovery-http`: validar HTTP `quanto tempo demora?` seguido de `12/03/1995`.
5. `cadastro-lateral-data-recovery-whatsapp-real`: validar o mesmo fluxo na cadeia real WhatsApp.
6. `multiturn-evidence-summary`: consolidar transcript/judgment/provas por passo no evidence.
7. `level4b-wave-1-closeout`: rodar gates finais e recomendar manter/expandir/rebaixar.

O item seguinte so pode iniciar se o anterior terminar com testes locais relevantes PASS, CI/deploy PASS quando houver commit executavel, e sem blocker.

## Criterios De Pronto

- `check-autonomy-gate.sh` PASS em Level 4B;
- `check-security-gate.sh` PASS;
- `wave-health.sh` PASS antes e depois da onda;
- testes locais relevantes PASS;
- CI PASS;
- deploy PASS;
- HTTP radar PASS para o fluxo multi-turn conversacional;
- WhatsApp real definitivo PASS para o fluxo multi-turn conversacional;
- evidencia por passo preservada;
- `summary.md`, `transcript.md` e `judgment.md` gerados para a evidencia final;
- worktree limpo ao fechar;
- nenhuma promocao para 4C.

## Stop Conditions

Parar a onda se ocorrer:

- CI FAIL;
- deploy FAIL;
- HTTP radar FAIL;
- WhatsApp real FAIL;
- `copy_risk=alto`;
- estado final errado;
- evidencia de step sobrescrita sem indice recuperavel;
- mensagem humana real ausente no poll;
- falta de resposta AI depois de qualquer step;
- cleanup inseguro;
- divergencia entre HTTP e WhatsApp real;
- necessidade de tocar preco, sinal, pagamento, agenda, secrets ou tenant real amplo.

## Resultado Atual

```text
status: em-andamento
micro_slice_1: multiturn-scenario-contract PASS
micro_slice_2: multiturn-http-runner PASS
micro_slice_3: multiturn-whatsapp-real-runner PASS
micro_slice_4: cadastro-lateral-data-recovery-http PASS
micro_slice_5: cadastro-lateral-data-recovery-whatsapp-real PASS
micro_slice_atual: multiturn-evidence-summary
autonomy_level: 4B
max_batch_size: 8
promocao_4c: bloqueada
```

## Estrategia

O ganho desta onda nao e fazer o bot falar diferente. O ganho e provar conversas completas em cadeia real, com passos sucessivos. Isso reduz o risco de validar apenas respostas isoladas e aumenta a autonomia segura para ondas funcionais futuras.

Primeiro fluxo alvo:

```text
setup: cadastro aguardando data
step_1_cliente: "quanto tempo demora?"
step_1_bot: responde tempo e retoma data
step_2_cliente: "12/03/1995"
step_2_bot: pede e-mail opcional
estado_final: coletando_cadastro
data_nascimento: 1995-03-12
orcid: null
```

Provas conclusivas esperadas:

```text
Cliente 1: "quanto tempo demora?"
Bot 1: resposta de tempo + retomada de data
Cliente 2: "12/03/1995"
Bot 2: "E o e-mail? Se preferir seguir sem, me avisa"
```

## Evidencia Micro-Slice 1

```text
micro_slice: multiturn-scenario-contract
status: PASS
alteracao: contrato multi-turn documentado em 13-smoke-scenario-registry.md
runner_http_multiturn: ainda nao implementado
runner_whatsapp_real_multiturn: ainda nao implementado
decisao: seguir para multiturn-http-runner
```

Leitura:

- O contrato define `STEP_COUNT`, `MESSAGE_N`, gates por step e evidencia em `steps/<n>/`.
- `http_multiturn` e `whatsapp_real_multiturn` ainda nao contam como PASS ate o runner suportar esses tipos.
- A regra preserva a metodologia: HTTP radar primeiro, WhatsApp real definitivo depois.

## Evidencia Micro-Slice 2

```text
micro_slice: multiturn-http-runner
status: PASS
run_id: scenario-cadastro-lateral-data-recovery-20260526T033036Z-11904
tipo: HTTP radar multi-turn
evidence: .smoke-evidence/scenario-cadastro-lateral-data-recovery-20260526T033036Z-11904/
proximo_micro_slice: multiturn-whatsapp-real-runner
```

Leitura:

- O runner `http_multiturn` executa passos sequenciais no mesmo setup e preserva evidencias em `steps/<n>/`.
- O pacote raiz passou a copiar a evidencia final necessaria para gerar `transcript.md` e `judgment.md`.
- Step 1 respondeu a duvida lateral sobre tempo, preservou `estado=coletando_cadastro`, nao persistiu data e confirmou Workflow Manager `state_preserved_by_router_policy`.
- Step 2 persistiu `data_nascimento=1995-03-12`, manteve `orcid=null`, pediu e-mail opcional e confirmou Router `pending_data_nascimento_answered`.
- Houve uma falha util anterior por contrato de evidencia/copy gate; o comportamento estava correto, e o runner foi ajustado antes do PASS final.

Provas HTTP radar:

```text
Cliente 1: "quanto tempo demora?"
Bot 1: "O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia. Me passa tua data de nascimento completa?"
Cliente 2: "12/03/1995"
Bot 2: "E o e-mail? Se preferir seguir sem, me avisa"
```

## Evidencia Micro-Slice 3-5

```text
micro_slice: multiturn-whatsapp-real-runner
status: PASS
run_id: scenario-whatsapp-real-cadastro-lateral-data-recovery-20260526T033539Z-27181
tipo: WhatsApp real multi-turn
cadeia: Evolution central -> numero bot -> webhook real -> pipeline -> resposta
evidence: .smoke-evidence/scenario-whatsapp-real-cadastro-lateral-data-recovery-20260526T033539Z-27181/
proximo_micro_slice: multiturn-evidence-summary
```

Leitura:

- O runner `whatsapp_real_multiturn` executou dois envios reais pela instancia `central`.
- O webhook registrou os humanos exatos nos dois passos.
- Step 1 manteve `estado=coletando_cadastro`, `data_nascimento=null`, `orcid=null`, copy risk baixo e Workflow Manager `state_preserved_by_router_policy`.
- Step 2 persistiu `data_nascimento=1995-03-12`, manteve `orcid=null`, copy risk medio permitido e Router `pending_data_nascimento_answered`.
- Como o mesmo fluxo alvo foi validado em HTTP e WhatsApp real, os micro-slices `cadastro-lateral-data-recovery-http` e `cadastro-lateral-data-recovery-whatsapp-real` tambem ficam cobertos.

Provas conclusivas reais:

```text
Cliente 1: "quanto tempo demora?"
Bot 1: "O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia. Me passa tua data de nascimento completa?"
Cliente 2: "12/03/1995"
Bot 2: "E o e-mail? Se preferir seguir sem, me avisa"
```
