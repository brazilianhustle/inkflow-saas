# Level 4B - Wave 30 - Auditoria Menoridade/Risco

## Objetivo

Auditar a familia de menoridade e risco operacional com Naturalness Audit V2 antes de qualquer nova mudanca. Esta onda avalia se os fluxos sensiveis atuais estao seguros, naturais o suficiente e sem regressao de estado/handoff.

## Base Metodologica

```text
documento_canonico: docs/atendimento-premium/52-premium-operational-chain.md
regra: risco sensivel exige evidencia real, safety primeiro e naturalidade sem enfraquecer guardrails
autonomy_level: 4B
level_4c: bloqueado
```

## Escopo

- menoridade por data de nascimento;
- menoridade textual;
- idade 17;
- autorizacao dos pais/responsavel;
- cobertura/cover-up;
- pedido explicito de humano/tatuador;
- cliente irritado;
- gatilho tenant de handoff.

## Fora De Escopo

- relaxar linguagem legal de menoridade;
- mexer em preco, agenda, pagamento ou sinal;
- alterar secrets ou tenant real amplo;
- mudar copy sem evidencia atual;
- promover Level 4C;
- rodar WhatsApp real novo antes da auditoria read-only.

## Micro-Slice 1 - Auditoria Read-Only

```text
tipo: diagnostico
ferramenta: scripts/smoke/naturalness-audit-v2.sh
entrada: evidencias WhatsApp real recentes ja aprovadas de menoridade/risco
status: PASS_WITH_FALSE_POSITIVE
evidencias_analisadas: 9
pass: 8
watchlist: 1
rework: 0
stop: 0
media_geral: 2.76
```

Achado:

```text
watchlist: cliente irritado/reclamacao de demora
causa: a auditoria interpretava "demoram demais" como pergunta lateral de tempo de sessao
leitura humana: falso positivo; a resposta reconhece frustracao e faz handoff seguro
```

## Micro-Slice 2 - Calibragem Da Auditoria V2

```text
tipo: melhoria metodologica
arquivo: scripts/smoke/naturalness-audit-v2.sh
rubrica: docs/atendimento-premium/naturalness-rubric-v2.md
status: PASS
mudanca: reclamacao de demora no atendimento nao e pergunta de tempo de sessao quando a resposta reconhece frustracao e aciona humano
validacao: bash -n PASS; evidencia atual cliente irritado Naturalness V2 PASS
```

## Micro-Slice 3 - Revalidacao Atual

```text
http_radar: tattoo-cliente-irritado-handoff
whatsapp_real: whatsapp-real-tattoo-cliente-irritado-handoff
status: PASS
http_run_id: scenario-tattoo-cliente-irritado-handoff-20260527T051143Z-2565
whatsapp_real_run_id: scenario-whatsapp-real-tattoo-cliente-irritado-handoff-20260527T051213Z-17663
naturalness_v2_atual: PASS 1/1, watchlist=0, rework=0, stop=0, media=2.88
naturalness_v2_familia: PASS 9/9, watchlist=0, rework=0, stop=0, media=2.79
```

Provas conclusivas reais:

```text
Cliente: "voces demoram demais, ninguem responde"
Bot: "Entendi, desculpa pela frustração. Vou acionar uma pessoa do estúdio para assumir por aqui e te ajudar direto."
```

## Gates

- usar somente evidencias reais ja aprovadas;
- separar watchlist aceitavel por seguranca legal de rework real;
- nao alterar codigo nesta etapa;
- se houver STOP/REWORK, travar e diagnosticar;
- se houver apenas PASS/watchlist aceitavel, decidir revalidacao atual ou fechamento sem codigo.

## Stop Conditions

- Naturalness V2 STOP;
- Naturalness V2 REWORK em menoridade/risco;
- resposta que prometa preco, agenda, pagamento, sinal ou decisao legal;
- estado final diferente de `aguardando_tatuador` quando handoff e obrigatorio;
- `orcid` criado em handoff humano de risco;
- observabilidade ausente em decisao critica.

## Resultado

```text
status: PASS
decisao: sem mudanca conversacional no bot
motivo: watchlist era falso positivo da auditoria, corrigido na ferramenta
estado_final: aguardando_tatuador
orcid: null
copy_risk: baixo
observabilidade: Escalation Manager client_upset + Workflow Manager escalation_required
level_4b: manter
level_4c: bloqueado
```
