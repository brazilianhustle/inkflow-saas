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

## Criterio De PASS

O smoke WhatsApp real so passa quando:

- a instancia remetente esta `open`;
- Evolution `sendText` retorna 2xx;
- o webhook real gera mensagem humana exata no Supabase para o telefone remetente;
- o polling detecta resposta AI sem estado esperado, ou atinge o estado esperado quando definido;
- se o estado esperado for `aguardando_tatuador`, existe `orcid`;
- `verify-after.txt` confirma estado/dados esperados;
- `transcript.md` mostra a conversa real em formato legivel;
- `judgment.md` confirma checks tecnicos e aponta risco de copy;
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
