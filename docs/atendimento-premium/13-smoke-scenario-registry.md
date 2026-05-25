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
  lateral-pergunta-imagem-com-midia.env
  lateral-historia-vida-homenagem.env
  lateral-pergunta-imagem-sem-midia.env
  lateral-portfolio-disponivel.env
  lateral-preco-generico.env
  lateral-processo-tatuagem.env
  lateral-tempo-sessao.env
  whatsapp-real-cadastro-handoff.env
  whatsapp-real-lateral-historia-vida-homenagem.env
  whatsapp-real-lateral-pergunta-imagem-com-midia.env
  whatsapp-real-lateral-pergunta-imagem-sem-midia.env
  whatsapp-real-lateral-portfolio-disponivel.env
  whatsapp-real-lateral-preco-generico.env
  whatsapp-real-lateral-processo-tatuagem.env
  whatsapp-real-lateral-tempo-sessao.env
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
SMOKE_REQUIRE_AI_RESPONSE
EXPECTED_HUMAN_TEXT
EXPECTED_COPY_RISK_MAX
EXPECTED_BOT_REGEX
FORBIDDEN_BOT_REGEX
EXPECTED_TAIL_REGEX
FORBIDDEN_TAIL_REGEX
SMOKE_MEDIA_BASE64     inline base64 curto para midia sintetica
SMOKE_MEDIA_FILE       caminho local para midia sintetica
SMOKE_MEDIA_MIMETYPE   ex: image/png, image/jpeg
SMOKE_BOT_NUMBER      somente via ambiente local/secret manager para whatsapp_real
```

## Cenarios Atuais

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

`whatsapp-real-cadastro-handoff`

Objetivo:

```text
Validar a cadeia real central -> WhatsApp -> numero oficial do bot -> webhook -> pipeline -> handoff.
```

Pre-requisitos locais:

```text
EVO_CENTRAL_INSTANCE
EVO_CENTRAL_APIKEY
SMOKE_SENDER_PHONE
SMOKE_BOT_NUMBER
```

Nao hardcodar `SMOKE_BOT_NUMBER` nem API key no scenario versionado. O runner carrega esses valores de `.dev.vars`/ambiente antes de executar o smoke real.

`lateral-preco-generico`

Objetivo:

```text
Validar que pergunta de preco recebe resposta sem valor inventado e com encaminhamento para avaliacao.
```

Contrato:

```text
resposta deve citar dependencia/avaliacao/tatuador
resposta nao pode conter preco ou fechamento de valor
```

`lateral-pergunta-imagem-sem-midia`

Objetivo:

```text
Validar que pergunta sobre imagem sem midia disponivel pede reenvio e nao volta ao formulario desconectado.
```

Contrato:

```text
estado final deve continuar coletando_tattoo
resposta deve dizer que nao esta vendo imagem clara e pedir reenvio
resposta nao pode perguntar local/altura/estilo, falar de preco, agendar, sinal ou fechar proposta
```

`whatsapp-real-lateral-pergunta-imagem-sem-midia`

Objetivo:

```text
Validar o mesmo fallback seguro de ausencia de imagem em cadeia real central -> WhatsApp -> bot -> webhook -> pipeline.
```

Contrato:

```text
estado final deve continuar coletando_tattoo
resposta deve dizer que nao esta vendo imagem clara e pedir reenvio
resposta nao pode perguntar local/altura/estilo, falar de preco, agendar, sinal ou fechar proposta
```

`lateral-pergunta-imagem-com-midia`

Objetivo:

```text
Validar que pergunta sobre imagem com midia presente entra no caminho de visao/TattooAgent e nao cai no fallback sem midia.
```

Contrato:

```text
estado final deve continuar coletando_tattoo
resposta deve reconhecer imagem/foto/referencia/desenho/local ou mencionar ambiguidade visual
resposta nao pode pedir reenvio por ausencia de imagem, falar de preco, agendar, sinal ou fechar proposta
```

`whatsapp-real-lateral-preco-generico`

Objetivo:

```text
Validar a mesma protecao financeira em cadeia real central -> WhatsApp -> bot -> webhook -> pipeline.
```

Contrato:

```text
resposta deve citar dependencia/avaliacao/tatuador
resposta nao pode conter preco ou fechamento de valor
```

`whatsapp-real-lateral-pergunta-imagem-com-midia`

Objetivo:

```text
Validar a mesma protecao visual em cadeia real central -> WhatsApp -> bot -> webhook -> pipeline com imagem enviada pela Evolution.
```

Contrato:

```text
estado final deve continuar coletando_tattoo
resposta deve reconhecer imagem/foto/referencia/desenho/local/corpo ou mencionar ambiguidade visual
resposta nao pode pedir reenvio por ausencia de imagem, falar de preco, agendar, sinal ou fechar proposta
```

`whatsapp-real-lateral-tempo-sessao`

Objetivo:

```text
Validar a mesma protecao de expectativa em cadeia real central -> WhatsApp -> bot -> webhook -> pipeline.
```

Contrato:

```text
estado final deve continuar coletando_tattoo
resposta deve explicar que o tempo depende de tamanho/detalhe/local/avaliacao
resposta nao pode prometer horas, mesmo dia, uma sessao certa, preco, agendamento, sinal ou fechar proposta
```

`whatsapp-real-lateral-processo-tatuagem`

Objetivo:

```text
Validar a mesma orientacao consultiva em cadeia real central -> WhatsApp -> bot -> webhook -> pipeline.
```

Contrato:

```text
estado final deve continuar coletando_tattoo
resposta deve explicar o processo em termos de ideia/referencia/avaliacao/orcamento/proposta
resposta nao pode expor sistema/prompt/erro, falar de preco, agendar, sinal ou fechar proposta
```

`lateral-portfolio-disponivel`

Objetivo:

```text
Validar que pedido de portfolio com portfolio cadastrado responde sem URL manual e sem mudar estado critico.
```

Contrato:

```text
estado final deve continuar coletando_tattoo
resposta deve mencionar envio/exemplos/trabalhos/referencias
resposta nao pode escrever URL manual, preco ou fechamento de valor
tail deve mostrar acionamento de portfolio
```

`whatsapp-real-lateral-portfolio-disponivel`

Objetivo:

```text
Validar a mesma entrega de portfolio em cadeia real central -> WhatsApp -> bot -> webhook -> pipeline.
```

Contrato:

```text
estado final deve continuar coletando_tattoo
resposta deve mencionar envio/exemplos/trabalhos/referencias
resposta nao pode escrever URL manual, preco, agendamento, sinal ou fechamento de valor
tail deve mostrar acionamento de portfolio e nao pode mostrar falha de envio
```

`lateral-historia-vida-homenagem`

Objetivo:

```text
Validar que historia emocional com homenagem recebe acolhimento breve, preserva o briefing e conduz com uma pergunta util.
```

Contrato:

```text
estado final deve continuar coletando_tattoo
resposta deve acolher sem textao
resposta deve preservar homenagem/pai/passaros/frase ou conduzir para local/referencia
resposta nao pode virar terapia, falar de preco, agendar, sinal ou fechar proposta
```

`whatsapp-real-lateral-historia-vida-homenagem`

Objetivo:

```text
Validar o mesmo comportamento consultivo em cadeia real central -> WhatsApp -> bot -> webhook -> pipeline.
```

Contrato:

```text
estado final deve continuar coletando_tattoo
resposta deve acolher sem textao
resposta deve preservar homenagem/pai/passaros/frase ou conduzir para local/referencia
resposta nao pode virar terapia, falar de preco, agendar, sinal ou fechar proposta
```

`lateral-tempo-sessao`

Objetivo:

```text
Validar que pergunta de tempo recebe resposta consultiva sem prometer duracao exata.
```

Contrato:

```text
resposta deve citar fatores como tamanho/detalhe/local/avaliacao
resposta nao pode prometer horas ou garantia
```

`lateral-processo-tatuagem`

Objetivo:

```text
Validar que pergunta "como funciona" recebe explicacao curta e retoma coleta.
```

Contrato:

```text
resposta deve falar de ideia/referencia/avaliacao/orcamento
resposta nao pode expor erro, sistema ou prompt
```

## Criterio De PASS Do Registry

Um cenario so serve como checkpoint quando:

- runner conclui sem erro;
- evidence dir contem `summary.md`, `poll.json`, `transcript.md` e `judgment.md`;
- `EXPECTED_STATE` foi atingido quando definido;
- `SMOKE_REQUIRE_ORCID=1` foi respeitado quando definido;
- resposta AI apareceu no snapshot final por padrao (`SMOKE_REQUIRE_AI_RESPONSE=1`);
- `EXPECTED_COPY_RISK_MAX` nao foi excedido quando definido;
- `EXPECTED_BOT_REGEX` apareceu na ultima resposta AI quando definido;
- `FORBIDDEN_BOT_REGEX` nao apareceu na ultima resposta AI quando definido;
- `EXPECTED_TAIL_REGEX` apareceu na tail quando definido;
- `FORBIDDEN_TAIL_REGEX` nao apareceu na tail quando definido;
- `judgment.md` permite leitura rapida do risco de copy.

Regra critica: quando `EXPECTED_STATE` existe, o polling nao pode aprovar por resposta AI isolada nem por estado atingido antes da resposta. O estado esperado e o contrato do cenario, e a resposta AI e obrigatoria por padrao.

## Triage Automatica

Quando um scenario falha, `run-scenario.sh` gera automaticamente:

```text
.smoke-evidence/<run_id>/triage.md
```

Esse arquivo classifica a falha e aponta a proxima acao. O protocolo completo fica em [14-smoke-triage-protocol.md](./14-smoke-triage-protocol.md).

Quando a falha e `contract_*`, o runner gera tambem:

```text
.smoke-evidence/<run_id>/plan-review.md
```

Esse arquivo reabre o plano do slice, aponta a camada provavel e bloqueia conclusao ate PASS posterior do mesmo scenario. O protocolo completo fica em [15-smoke-plan-review-protocol.md](./15-smoke-plan-review-protocol.md).

## Proximos Passos

Depois dos dois cenarios base:

1. adicionar novos cenarios obrigatorios por intent/slice;
2. rodar `check-slice-gate.sh` antes de fechar qualquer slice;
3. manter HTTP como radar rapido e WhatsApp real como ensaio final.
