# Smoke WhatsApp Real

Este e o nivel superior de smoke do atendimento premium.

Ele nao substitui o smoke HTTP monitorado. Ele valida a cadeia completa:

```text
instancia Evolution remetente
-> WhatsApp real
-> numero oficial do bot
-> Evolution do bot
-> webhook /api/whatsapp/inbound
-> pipeline
-> resposta WhatsApp
-> Supabase + tail + evidencias
```

## Quando Usar

Use este smoke antes de considerar uma mudanca conversacional concluida quando ela tocar:

- inbound WhatsApp;
- Evolution;
- webhook;
- envio de resposta;
- estado de conversa;
- handoff para tatuador;
- comportamento que precisa ser visto no WhatsApp real.

Para micro-slices de atendimento premium, este smoke nao e opcional: HTTP production smoke e apenas validacao inicial; WhatsApp real e o criterio definitivo.

Para iteracao rapida, use primeiro o processo HTTP:

```bash
BASE_URL=https://inkflowbrasil.com EXPECTED_STATE=aguardando_tatuador \
  bash scripts/smoke/run-inbound.sh $'pode seguir sem email\nquanto tempo demora?' 5521970789797
```

## Comando Padrao

Neste ambiente, a instancia remetente ja existente e `central`.

```bash
SMOKE_BOT_NUMBER=55XXXXXXXXXXX \
BASE_URL=https://inkflowbrasil.com \
EXPECTED_STATE=aguardando_tatuador \
  bash scripts/smoke/run-real-whatsapp.sh $'pode seguir sem email\nquanto tempo demora?' 5521970789797
```

Tambem pode passar o numero do bot por argumento:

```bash
BASE_URL=https://inkflowbrasil.com \
  bash scripts/smoke/run-real-whatsapp.sh "quanto fica?" 5521970789797 55XXXXXXXXXXX
```

## Variaveis

```text
SMOKE_BOT_NUMBER              numero oficial do bot que recebera a mensagem real
SMOKE_SENDER_PHONE            numero conectado na instancia remetente; default 5521970789797
SMOKE_EVO_BASE_URL            default EVO_BASE_URL ou https://evo.inkflowbrasil.com
SMOKE_EVO_SENDER_INSTANCE     default EVO_CENTRAL_INSTANCE ou central
SMOKE_EVO_SENDER_APIKEY       default EVO_CENTRAL_APIKEY ou EVO_GLOBAL_KEY
SMOKE_EVO_STATE_APIKEY        default EVO_GLOBAL_KEY ou apikey remetente
BASE_URL                      alvo esperado para tail/evidencia; default https://inkflowbrasil.com
EXPECTED_STATE                estado esperado no Supabase
SMOKE_REQUIRE_ORCID           default 1 quando EXPECTED_STATE inclui aguardando_tatuador
SMOKE_EXPECT_HUMAN_TEXT       setado automaticamente pelo runner para amarrar o polling ao texto enviado
```

## Evidencias

```text
.smoke-evidence/<run_id>/
  request.json
  tail-start.txt
  verify-before.txt
  evolution-send.json
  poll.json
  verify-after.txt
  transcript.md
  judgment.md
  report-render.txt
  tail-excerpt.log
  summary.md
```

## Prova De Mensagem Real

Todo smoke `whatsapp_real` precisa deixar prova auditavel de que a mensagem saiu da instancia remetente real, entrou pelo webhook real e recebeu resposta real do bot.

Nao basta dizer que "passou". A evidencia precisa permitir reconstituir a cadeia:

```text
Evolution central enviou -> WhatsApp entregou ao numero do bot -> webhook persistiu humano -> bot respondeu -> logs explicam decisao
```

Checklist obrigatorio:

- `scenario-plan.txt`: mostra `SCENARIO_TYPE=whatsapp_real`, instancia remetente, telefone remetente, numero do bot e mensagem planejada.
- `evolution-send.json`: mostra endpoint `/message/sendText/<instance>` ou `/message/sendMedia/<instance>`, destino do bot, `http_status` 2xx, id da mensagem Evolution e texto/midia enviado.
- `poll.json`: mostra a mensagem humana exata em `conversa_mensagens` com `message.type="human"` e `status="received"`, seguida de resposta `message.type="ai"` e `status="processed"`.
- `transcript.md`: mostra, de forma legivel, o turno HUMANO e o turno BOT com timestamps.
- `judgment.md`: registra `final_state`, `orcid`, checks tecnicos, ultima mensagem humana, ultima resposta do bot e `copy_risk`.
- quando houver gate de observabilidade, `agent-turn-logs.json` e `scenario-agent-log-jq.txt` precisam mostrar a decisao esperada (`agent_name`, intent/reason/risk/confidence ou reason_code).

Se qualquer uma dessas provas estiver ausente, o smoke real pode ter sido executado, mas nao pode ser usado como validacao definitiva do micro-slice.

## Resumo Para O Usuario

Ao fechar um slice validado por WhatsApp real, manter o resumo normal do trabalho e acrescentar o bloco curto abaixo para identificacao rapida:

```text
Provas conclusivas reais:
Cliente: "quanto fica uma rosa fineline no braco?"
Bot: "O valor depende do tamanho, detalhe e local do corpo..."
Resultado: WhatsApp real PASS, estado=coletando_tattoo, copy_risk=baixo.
```

Esse bloco nao substitui o restante do fechamento. A resposta ainda deve mencionar mudancas, validacoes, gates, commit e estado do worktree quando aplicavel.

Os arquivos de evidencia continuam obrigatorios no repo. Listar os arquivos completos quando o usuario pedir prova detalhada, auditoria ou investigacao de falha; em fechamento normal, preferir citar apenas run id/evidencia essencial para rastreabilidade.

## Criterio De PASS

O smoke WhatsApp real so passa quando:

- a instancia remetente esta `open`;
- Evolution `sendText` retorna 2xx;
- `evolution-send.json` comprova o envio pela instancia remetente real para o numero oficial do bot;
- o webhook real gera mensagem humana exata no Supabase para o telefone remetente;
- o polling detecta resposta AI sem estado esperado, ou atinge o estado esperado quando definido;
- se o estado esperado for `aguardando_tatuador`, existe `orcid`;
- `verify-after.txt` confirma estado/dados esperados;
- `transcript.md` mostra a conversa real em formato legivel;
- `judgment.md` confirma checks tecnicos e aponta risco de copy;
- se o scenario declarar `EXPECTED_AGENT_LOG_JQ_TRUE`, `agent-turn-logs.json` e `scenario-agent-log-jq.txt` confirmam a decisao esperada;
- `tail-excerpt.log` nao mostra erro runtime relevante.

## Limite Estrategico

Este smoke valida infraestrutura real e efeitos colaterais reais. Por isso ele e mais caro, mais lento e mais sujeito a falhas externas do que o smoke HTTP.

Regra:

```text
HTTP smoke = radar rapido
WhatsApp real smoke = validacao definitiva do micro-slice
validacao humana = julgamento de experiencia
```

Rodar WhatsApp real por micro-slice assim que o HTTP passar. Nao acumular ate o fim de um bloco grande, exceto quando o bloco for puramente documental ou refactor interno sem mudanca no comportamento do atendimento.

## Reaproveitamento De Evidencia Real

E permitido fechar uma auditoria read-only sem novo envio WhatsApp somente quando todos os criterios abaixo forem verdadeiros:

- nao houve mudanca de codigo, prompt, policy, router, composer, workflow, handoff, guardrail ou linguagem do bot;
- a evidencia reaproveitada veio de WhatsApp real, nao de HTTP;
- a evidencia cobre exatamente a familia auditada;
- a onda declara por escrito por que aquela evidencia continua valida;
- nao ha duvida sobre comportamento atual.

Se qualquer criterio falhar, o fechamento exige novo WhatsApp real `central -> bot`.
