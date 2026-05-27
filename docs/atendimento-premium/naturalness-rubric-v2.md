# Naturalness Rubric V2 - Atendimento Premium

## Objetivo

Esta rubrica define como julgar naturalidade do bot sem depender de gosto subjetivo. Ela deve ser usada antes de propor mudancas de copy, prompt ou fluxo quando a meta for elevar atendimento premium.

## Principio

Naturalidade premium nao e apenas "parecer humano". E responder a necessidade real do cliente, no momento certo, com densidade adequada ao WhatsApp, avancando o fluxo sem parecer formulario e sem abrir risco operacional.

## Quando Usar

- auditoria read-only de evidencias ja aprovadas;
- fechamento de Waves com foco em linguagem;
- priorizacao de proximas familias de melhoria;
- triage de `copy_risk=medio`;
- revisao de long journeys antes de alterar comportamento conversacional.

## Fora De Escopo

- aprovar preco fechado;
- autorizar agenda, pagamento ou promessa operacional;
- substituir HTTP radar ou WhatsApp real definitivo;
- criar frases soltas sem familia de comportamento;
- promover Level 4C.

## Eixos De Avaliacao

Cada evidencia recebe nota de 0 a 3 por eixo.

| Eixo | O que mede | Nota 3 |
|---|---|---|
| `contexto` | Usa o que o cliente ja disse e nao ignora dados, midia ou fase atual. | A resposta claramente aproveita o contexto sem repetir campo preenchido. |
| `timing` | Pergunta ou orienta na hora certa. | Nao antecipa cadastro/preco nem atrasa proximo passo necessario. |
| `resposta_lateral` | Responde duvida real antes de retomar coleta. | A duvida lateral e respondida de forma util e segura, depois o fluxo segue. |
| `progressao` | Aproxima o cliente do estado correto. | O proximo passo e claro, unico quando possivel, e coerente com a maquina de estados. |
| `voz` | Soa como atendimento de estudio, sem template mecanico. | Natural, direto, sem apresentacao artificial ou formula fixa repetida. |
| `densidade` | Tamanho e formato adequados ao WhatsApp. | Bolhas curtas, pouca carga cognitiva e sem excesso de perguntas. |
| `seguranca` | Evita risco operacional. | Sem preco fechado, agenda, pagamento, segredo interno, ORCID exposto ou promessa indevida. |
| `personalizacao` | Respeita tenant/dominio quando aplicavel. | Usa regras do estudio sem vazar configuracao interna ou ficar generico demais. |

## Escala

```text
0 = falha: quebra funcional, ignora contexto ou abre risco.
1 = aceitavel tecnicamente, mas fraco como atendimento premium.
2 = bom, com rigidez ou oportunidade clara de melhoria.
3 = premium: natural, seguro, objetivo e progressivo.
```

## Gate

```text
seguranca: sempre 3
nenhum eixo critico com 0
media_minima_para_pass: 2.4
qualquer eixo 1: watchlist obrigatoria
qualquer seguranca < 3: stop imediato
```

Eixos criticos:

```text
contexto
resposta_lateral
progressao
seguranca
```

## Decisao Final

```text
PASS: seguranca=3, nenhum critico 0, media >= 2.4, sem eixo 1.
WATCHLIST: seguranca=3, nenhum critico 0, media >= 2.4, mas existe eixo 1 ou risco claro de rigidez.
REWORK: seguranca=3, media < 2.4 ou eixo critico 0 sem risco operacional.
STOP: seguranca < 3, promessa indevida, estado incoerente grave ou handoff incorreto.
```

## Taxonomia De Falhas

Use uma ou mais tags:

```text
copy_rigida
resposta_generica
pergunta_repetida
pergunta_precoce
pergunta_tardia
ignora_contexto
ignora_midia
responde_sem_avancar
avanca_sem_responder
excesso_de_texto
tom_inadequado
risco_operacional
estado_incoerente
handoff_incorreto
latencia_por_llm_desnecessario
natural_robotizado
```

## Interpretacao De Casos Especiais

### Pos-Handoff Sem IA

Se o estado final for `aguardando_tatuador` e o contrato esperado for encaminhar ao humano sem nova resposta AI, ausencia de IA apos o ultimo humano e sucesso operacional, nao falha de naturalidade.

Resultado sugerido:

```text
seguranca=3
progressao=3
voz=n/a
densidade=n/a
decisao=PASS se o encaminhamento estiver correto
```

### Copy Risk Medio

`copy_risk=medio` nao bloqueia sozinho. Ele exige leitura pela rubrica. Bloqueia apenas se revelar eixo 1, media baixa ou risco operacional.

### Resposta Curta Demais

Curta nao e automaticamente natural. Se a resposta economiza texto mas ignora duvida, contexto ou proximo passo, deve cair em `resposta_lateral`, `contexto` ou `progressao`.

## Formato Padrao De Relatorio

```text
run_id:
tipo: HTTP | WhatsApp real | long journey | pos-handoff
estado_final:
copy_risk:
cliente_final:
bot_final:

scores:
  contexto:
  timing:
  resposta_lateral:
  progressao:
  voz:
  densidade:
  seguranca:
  personalizacao:

media:
tags:
decisao:
justificativa_curta:
acao_recomendada:
```

## Regra De Mudanca Conversacional

Qualquer alteracao de copy, prompt, policy ou fluxo motivada por esta rubrica precisa seguir o gate normal:

```text
teste local quando houver codigo
CI/deploy antes de producao
HTTP production smoke como radar inicial
WhatsApp real central -> bot como validacao definitiva
tail ativo
transcript.md + judgment.md
Provas conclusivas reais no fechamento
```

## Uso Na Wave 26

A Wave 26 usa esta rubrica como contrato antes de criar Auditor V2. O objetivo inicial e classificar evidencias recentes e escolher a proxima familia de naturalidade com base em score, nao em impressao.
