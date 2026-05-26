# Level 4B Wave 2

Segunda onda em Level 4B. A Wave 1 provou o loop multi-turn; esta onda aplica esse loop em uma frente funcional de alto valor e risco controlado: mensagens `multi_info` na coleta de tattoo.

## Declaracao

```text
onda_id: level4b-wave-2-tattoo-multi-info
objetivo: validar que o bot extrai varias informacoes de tattoo no mesmo turno sem perguntar de novo
familia: coleta-tattoo, multi-info, prompt-operacional, workflow-manager, observabilidade
risco: amarelo
janela: Level 4B, ate 8 micro-slices
4c: bloqueado
```

## Escopo

Dentro do escopo:

- cliente envia ideia, estilo, local e altura no mesmo turno;
- cliente envia tamanho da tattoo e altura da pessoa no mesmo turno;
- o bot persiste todos os campos seguros de uma vez;
- o bot pergunta somente o proximo campo realmente faltante;
- HTTP radar antes de WhatsApp real definitivo;
- provas conclusivas reais no fechamento de cada micro-slice conversacional.

Fora do escopo:

- preco, desconto, sinal, pagamento ou agenda;
- mudanca ampla de copy;
- tenant real amplo;
- migrations;
- secrets;
- promocao para 4C.

## Micro-Slices Planejados

1. `tattoo-multi-info-wave-contract`: declarar contrato e primeiro scenario HTTP.
2. `tattoo-multi-info-basic-http`: cliente manda ideia + estilo + local + altura; bot nao repete esses campos.
3. `tattoo-multi-info-basic-whatsapp-real`: validar o mesmo fluxo pela cadeia real `central -> bot`.
4. `tattoo-multi-info-height-size-http`: cliente manda tamanho da tattoo + altura da pessoa; bot separa `tamanho_cm` de `altura_cm`.
5. `tattoo-multi-info-height-size-whatsapp-real`: validar separacao por WhatsApp real.
6. `tattoo-multi-info-multiturn-recovery`: se faltar algo apos multi-info, resposta seguinte resolve o campo pendente.
7. `tattoo-multi-info-evidence-summary`: consolidar evidencias.
8. `level4b-wave-2-closeout`: gates finais e recomendacao manter/expandir/rebaixar.

## Criterios De Pronto

- `check-autonomy-gate.sh` PASS em Level 4B;
- `wave-health.sh` PASS antes e depois;
- testes locais relevantes PASS;
- CI PASS;
- deploy PASS;
- HTTP radar PASS antes de WhatsApp real;
- WhatsApp real definitivo PASS para cada comportamento conversacional;
- `copy_risk` nunca `alto`;
- estado final e dados persistidos corretos;
- nenhuma pergunta repetida por campo ja persistido;
- worktree limpo ao fechar;
- 4C continua bloqueado.

## Stop Conditions

Parar a onda se ocorrer:

- CI FAIL;
- deploy FAIL;
- HTTP radar FAIL;
- WhatsApp real FAIL;
- `copy_risk=alto`;
- persistir altura como tamanho ou tamanho como altura;
- perguntar de novo local/altura/estilo ja persistido;
- criar `orcid` ou handoff sem foto/local adequado;
- tocar preco, sinal, pagamento, agenda, secrets ou migrations;
- divergencia entre HTTP e WhatsApp real.

## Resultado Atual

```text
status: em-andamento
micro_slice_1: tattoo-multi-info-wave-contract PASS
micro_slice_2: tattoo-multi-info-basic-http PASS
micro_slice_3: tattoo-multi-info-basic-whatsapp-real PASS
micro_slice_4: tattoo-multi-info-height-size-http EM_VALIDACAO
micro_slice_atual: tattoo-multi-info-height-size-whatsapp-real
autonomy_level: 4B
max_batch_size: 8
promocao_4c: bloqueada
```

## Primeiro Fluxo Alvo

```text
setup: none
cliente: "quero uma rosa fineline no antebraco, tenho 1,70"
estado_final: coletando_tattoo
dados_esperados:
  descricao_curta: contem rosa
  estilo: fineline
  local_corpo: contem antebraco/braco
  altura_cm: 170
  orcid: null
bot: nao pergunta ideia, local, estilo ou altura de novo; deve pedir o proximo item realmente faltante, normalmente foto do local/referencia
```

Provas esperadas:

```text
Cliente: "quero uma rosa fineline no antebraco, tenho 1,70"
Bot: resposta confirma/continua sem repetir ideia/local/estilo/altura
```

## Evidencia Inicial

```text
micro_slice: tattoo-multi-info-wave-contract
status: PASS
scenario_http: tattoo-multi-info-basic
scenario_whatsapp_real: whatsapp-real-tattoo-multi-info-basic
dry_run: PASS
```

Primeiro radar HTTP antes da correcao:

```text
run_id: scenario-tattoo-multi-info-basic-20260526T035005Z-17822
status: FAIL
failure_class: scenario_gate_failed
causa: Agent operacional caiu em fallback e nao persistiu os campos multi-info
decisao: tratar multi-info basico no ConversationRouter deterministico
```

Validacao apos correcao:

```text
micro_slice: tattoo-multi-info-basic-http
status: PASS
run_id: scenario-tattoo-multi-info-basic-20260526T035828Z-32439
resultado: descricao_curta=rosa, estilo=fineline, local_corpo=antebraço, altura_cm=170, estado=coletando_tattoo, orcid=null, copy_risk=baixo
bot: "Oii, tudo bem? Me chamo Assistente, muito prazer.\n\nBoa, ja peguei a ideia principal. Consegue mandar uma foto do local onde tu quer tatuar?"
```

```text
micro_slice: tattoo-multi-info-basic-whatsapp-real
status: PASS
run_id: scenario-whatsapp-real-tattoo-multi-info-basic-20260526T040309Z-22657
cadeia: Evolution central -> bot 5545999012357
resultado: descricao_curta=rosa, estilo=fineline, local_corpo=antebraço, altura_cm=170, estado=coletando_tattoo, orcid=null, copy_risk=baixo
provas_conclusivas_reais: Cliente "quero uma rosa fineline no antebraco, tenho 1,70" -> Bot "Oii, tudo bem? Me chamo Assistente, muito prazer.\n\nBoa, ja peguei a ideia principal. Consegue mandar uma foto do local onde tu quer tatuar?"
```

Segundo fluxo alvo declarado:

```text
micro_slice: tattoo-multi-info-height-size-http
status: pre-deploy local PASS
scenario_http: tattoo-multi-info-height-size
scenario_whatsapp_real: whatsapp-real-tattoo-multi-info-height-size
cliente: "quero uma rosa fineline na perna de 5cm, tenho 1,81"
criterio: persistir tamanho_cm=5 e altura_cm=181 no mesmo turno; nao repetir ideia/local/estilo/altura; nao criar orcid.
validacao_local: node --test focado PASS; npm test PASS; dry-run HTTP/WhatsApp real PASS
```
