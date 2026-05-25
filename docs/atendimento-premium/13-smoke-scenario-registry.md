# Smoke Scenario Registry

Este registry transforma smokes em micro-campanhas reproduziveis. A meta e reduzir dependencia de memoria humana: o cenario sabe o setup, a mensagem, o tipo de smoke e o criterio esperado.

## Comando Padrao

```bash
bash scripts/smoke/run-scenario.sh cadastro-handoff-email-recusado
```

Dry-run sem tocar em Supabase/WhatsApp:

```bash
SMOKE_SCENARIO_DRY_RUN=1 \
  bash scripts/smoke/run-scenario.sh cadastro-handoff-email-recusado
```

## Local Dos Cenarios

```text
docs/atendimento-premium/smoke-scenarios/
  cadastro-handoff-email-recusado.env
```

O formato inicial e `.env` por ser simples, auditavel e nativo para shell. Evita parser Markdown/YAML fragil no primeiro passo.

## Contrato De Um Cenario

Campos principais:

```text
SCENARIO_ID
SCENARIO_TITLE
SCENARIO_TYPE        http | whatsapp_real
BASE_URL
TENANT_ID
PHONE
INSTANCE             usado em smoke HTTP
SETUP                none | seed_cadastro_handoff_email_recusado
CLEANUP_BEFORE       0 | 1
MESSAGE
EXPECTED_STATE
SMOKE_REQUIRE_ORCID
EXPECTED_HUMAN_TEXT
EXPECTED_COPY_RISK_MAX
```

## Primeiro Cenario

`cadastro-handoff-email-recusado`

Objetivo:

```text
Validar que cadastro completo via router, com email recusado e pergunta lateral de tempo, transiciona para aguardando_tatuador e gera orcid.
```

O setup cria:

```text
estado_agente: coletando_cadastro
dados_coletados: descricao_curta, local_corpo, altura_cm, estilo
dados_cadastro: nome, data_nascimento
historico: pergunta AI pendente sobre email
```

Depois envia:

```text
pode seguir sem email
quanto tempo demora?
```

Esperado:

```text
estado_agente: aguardando_tatuador
orcid: presente
email_recusado: true
transcript.md: presente
judgment.md: presente
```

## Criterio De PASS Do Registry

Um cenario so serve como checkpoint quando:

- runner conclui sem erro;
- evidence dir contem `summary.md`, `poll.json`, `transcript.md` e `judgment.md`;
- `EXPECTED_STATE` foi atingido quando definido;
- `SMOKE_REQUIRE_ORCID=1` foi respeitado quando definido;
- `EXPECTED_COPY_RISK_MAX` nao foi excedido quando definido;
- `judgment.md` permite leitura rapida do risco de copy.

Regra critica: quando `EXPECTED_STATE` existe, o polling nao pode aprovar por resposta AI isolada. O estado esperado e o contrato do cenario; resposta AI serve apenas como fallback para smokes sem estado-alvo.

## Proximos Passos

Depois do primeiro cenario:

1. adicionar cenario `whatsapp-real-cadastro-handoff`;
2. adicionar `triage.md` para falhas;
3. adicionar `plan-review.md` quando um cenario contradiz a hipotese do slice;
4. criar gate de conclusao de slice lendo os cenarios obrigatorios.
