# Slice Completion Gate

Este protocolo define quando um slice pode ser considerado fechado. A decisao nao depende de memoria do chat: ela vem de cenarios obrigatorios, PASS registrado em `smoke-runs.md` e artefatos locais completos.

## Comando

```bash
bash scripts/smoke/check-slice-gate.sh cadastro-handoff
```

## Arquivo Do Gate

```text
docs/atendimento-premium/slice-gates/<slice>.env
```

Para criar um novo gate, copiar o modelo:

```text
docs/atendimento-premium/templates/slice-gate.env
```

O gate declara:

- `SLICE_ID`;
- `MIN_PASS_UTC`;
- `REQUIRED_SCENARIOS`;
- `FINAL_REHEARSAL_SCENARIO`;
- `REQUIRED_ARTIFACTS`.

## Gate Atual

```text
docs/atendimento-premium/slice-gates/cadastro-handoff.env
```

Exige PASS recente para:

```text
cadastro-handoff-email-recusado
whatsapp-real-cadastro-handoff
```

O primeiro e o radar HTTP. O segundo e o ensaio final com envio real via Evolution `central` para o numero oficial do bot.

## Regra De Definitivo

HTTP production smoke e validacao inicial. Ele prova o contrato do pipeline sem depender da cadeia WhatsApp.

WhatsApp real e validacao definitiva. Todo slice que muda comportamento de atendimento precisa ter pelo menos um scenario `whatsapp_real` obrigatorio no gate. Quando o slice contem varios micro-slices de risco diferente, cada micro-slice deve ganhar seu proprio `whatsapp_real` ou ser explicitamente coberto por um rehearsal final equivalente.

Sem PASS de WhatsApp real, o slice nao pode ser chamado de concluido; ele fica como WIP validado parcialmente por HTTP.

## Padrao Obrigatorio

Todo slice premium que alterar comportamento de atendimento precisa ter gate versionado antes de ser declarado concluido.

O gate deve existir quando o slice:

- muda estado;
- extrai ou persiste dados;
- responde pergunta lateral recorrente;
- mexe em handoff, orçamento, agenda, menoridade, cobertura, negociação ou irritação;
- cria novo contrato de prompt, router, policy, workflow ou guardrail.

Para slices somente documentais ou refactors internos sem mudança de comportamento, registrar no commit ou no `current-objective.md` por que o gate nao se aplica.

## Criterio De PASS

O script aprova somente se cada scenario obrigatorio tiver:

- linha `PASS` em `smoke-runs.md`;
- `run_id` compatível com `scenario-<scenario-id>-...`;
- data UTC igual ou posterior a `MIN_PASS_UTC`, quando definido;
- evidence dir existente;
- artefatos obrigatorios presentes.

Artefatos obrigatorios padrao:

```text
summary.md
poll.json
transcript.md
judgment.md
```

## Criterio De Bloqueio

O slice fica bloqueado quando:

- nao existe PASS registrado para algum scenario obrigatorio;
- o PASS e anterior ao corte definido;
- a evidencia local esta ausente;
- falta artefato obrigatorio;
- o ensaio final ainda nao passou.

## Ordem De Uso

1. Implementar mini-passo.
2. Rodar scenario HTTP rapido como radar inicial.
3. Rodar scenario WhatsApp real assim que o HTTP passar, ainda no micro-slice.
4. Atualizar `smoke-runs.md`.
5. Rodar `check-slice-gate.sh`.
6. Registrar o resultado do gate quando ele muda a decisao do plano.
7. So considerar o slice fechado se o gate retornar PASS.
