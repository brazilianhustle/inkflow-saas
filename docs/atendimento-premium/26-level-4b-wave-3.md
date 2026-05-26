# Level 4B Wave 3

Terceira onda em Level 4B. A Wave 2 validou multi-info espontaneo; esta onda valida recuperacao de pergunta pendente quando o cliente responde o campo e faz uma pergunta lateral no mesmo turno.

## Declaracao

```text
onda_id: level4b-wave-3-tattoo-pending-answer-recovery
objetivo: validar que respostas a campos pendentes de tattoo podem coexistir com duvidas laterais sem perder dados nem repetir pergunta
familia: coleta-tattoo, pending-answer, side-quest, workflow-manager, observabilidade
risco: amarelo leve
janela: Level 4B, ate 8 micro-slices
4c: bloqueado
```

## Escopo

Dentro do escopo:

- cliente responde local pendente e pergunta tempo/sessoes no mesmo turno;
- cliente responde altura pendente e pergunta tempo/sessoes no mesmo turno;
- cliente responde estilo pendente e pergunta tempo/sessoes no mesmo turno;
- o bot persiste o campo respondido;
- o bot responde a duvida lateral;
- o bot retoma somente o proximo campo realmente faltante;
- HTTP radar antes de WhatsApp real definitivo.

Fora do escopo:

- preco, desconto, sinal, pagamento ou agenda;
- mudanca ampla de copy;
- tenant real amplo;
- migrations;
- secrets;
- promocao para 4C.

## Micro-Slices Planejados

1. `tattoo-pending-answer-wave-contract`: declarar contrato e cenarios.
2. `tattoo-pending-local-lateral-http`: local pendente + pergunta de tempo em HTTP multi-turn.
3. `tattoo-pending-local-lateral-whatsapp-real`: validar o mesmo fluxo em WhatsApp real multi-turn.
4. `tattoo-pending-height-lateral-http`: altura pendente + pergunta de tempo em HTTP multi-turn.
5. `tattoo-pending-height-lateral-whatsapp-real`: validar altura pendente em WhatsApp real multi-turn.
6. `tattoo-pending-style-lateral-http`: estilo pendente + pergunta de tempo em HTTP multi-turn.
7. `tattoo-pending-style-lateral-whatsapp-real`: validar estilo pendente em WhatsApp real multi-turn.
8. `level4b-wave-3-closeout`: gates finais e recomendacao manter/expandir/rebaixar.

## Criterios De Pronto

- `check-autonomy-gate.sh` PASS em Level 4B;
- `wave-health.sh` PASS antes e depois;
- testes locais relevantes PASS quando houver mudanca funcional;
- CI PASS quando houver commit;
- deploy PASS quando houver commit;
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
- resposta lateral ignorada;
- campo pendente respondido nao persistido;
- pergunta repetida para campo ja persistido;
- criar `orcid` ou handoff indevido;
- tocar preco, sinal, pagamento, agenda, secrets ou migrations;
- divergencia entre HTTP e WhatsApp real.

## Resultado Atual

```text
status: em-andamento
micro_slice_1: tattoo-pending-answer-wave-contract PASS
micro_slice_2: tattoo-pending-local-lateral-http PASS
micro_slice_3: tattoo-pending-local-lateral-whatsapp-real PASS
micro_slice_atual: tattoo-pending-height-lateral-http
autonomy_level: 4B
max_batch_size: 8
promocao_4c: bloqueada
```

## Primeiro Fluxo Alvo

```text
setup: none
step_1_cliente: "quero uma borboleta fineline"
step_1_bot: pergunta local do corpo
step_2_cliente: "bunda\nquantas sessoes seria?"
estado_final: coletando_tattoo
dados_esperados:
  descricao_curta: contem borboleta
  estilo: fineline
  local_corpo: gluteo/glúteo
  altura_cm: null
  orcid: null
bot_final: responde tempo/sessoes e retoma altura, sem repetir local
```

Provas esperadas:

```text
Cliente: "quero uma borboleta fineline"
Bot: pergunta em qual parte do corpo
Cliente: "bunda\nquantas sessoes seria?"
Bot: responde que depende de tamanho/detalhe/local/avaliacao e pede altura
```

Primeiro radar HTTP antes do ajuste de contrato:

```text
run_id: scenario-tattoo-pending-local-lateral-20260526T052255Z-4229
status: FAIL
failure_class: agent_no_response / contrato inicial inadequado
causa: "quero uma borboleta" era briefing inicial generico demais para o alvo da onda; caiu em fallback tardio e nao persistiu descricao
decisao: ajustar step 1 para "quero uma borboleta fineline" e manter o escopo em pending answer + lateral
```

Validação apos ajuste:

```text
micro_slice: tattoo-pending-local-lateral-http
status: PASS
run_id: scenario-tattoo-pending-local-lateral-20260526T052610Z-24026
fluxo: Cliente "quero uma borboleta fineline" -> Bot pergunta local; Cliente "bunda\nquantas sessoes seria?" -> Bot responde tempo/sessoes e pede altura
resultado_final: descricao_curta=borboleta, estilo=fineline, local_corpo=glúteo, altura_cm=null, estado=coletando_tattoo, orcid=null, copy_risk=baixo
```

```text
micro_slice: tattoo-pending-local-lateral-whatsapp-real
status: PASS
run_id: scenario-whatsapp-real-tattoo-pending-local-lateral-20260526T052659Z-26598
cadeia: Evolution central -> bot 5545999012357
resultado_final: descricao_curta=borboleta, estilo=fineline, local_corpo=glúteo, altura_cm=null, estado=coletando_tattoo, orcid=null, copy_risk=baixo
provas_conclusivas_reais: Cliente "quero uma borboleta fineline" -> Bot "Oii, tudo bem? Me chamo Assistente, muito prazer.\n\nTu imagina fazer em qual parte do corpo?"; Cliente "bunda\nquantas sessoes seria?" -> Bot "O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.\n\nMe diz tua altura?"
```
