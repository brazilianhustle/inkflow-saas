---
date: 2026-05-21
status: ready-to-plan
related:
  - functions/api/tools/gerar-link-sinal.js
  - functions/api/agent/_lib/format-link-sinal-msg.js
  - functions/_lib/mp-sinal-handler.js
  - functions/api/agent/route.js
  - functions/_lib/prompts/coleta/proposta/
  - functions/_lib/evolution-send.js
  - functions/_lib/telegram.js
  - functions/api/create-subscription.js
backlog_entry: "P1 (NEXT) — Pix dinâmico no checkout do sinal (Caminho 1: API Pix + webhook), 2026-05-21"
---

# Pix dinâmico no sinal — copia-e-cola dentro do WhatsApp

## Contexto

O smoke E2E de 2026-05-21 (pós-deploy da Fase A de visão de fotos) reconfirmou um atrito
real de conversão: hoje o link de sinal é uma **Preference** do Mercado Pago
(`POST /checkout/preferences` em `functions/api/tools/gerar-link-sinal.js:14`) que abre o
**checkout web cartão-first**. O cliente brasileiro **reluta** — pra um sinal de agendamento
ele quer **Pix**: instantâneo, sem cartão, sem cadastro, sem sair do WhatsApp.

Decisão estratégica do Leandro (21/05): implementar o **Caminho 1** — gerar **pagamento Pix
dinâmico** via API do MP (`POST /v1/payments`, `payment_method_id: "pix"`), que retorna
**copia-e-cola + QR code** pra entregar direto no WhatsApp. A confirmação é **automática** via
webhook — e aqui está o maior ganho de reuso: o handler atual
(`functions/_lib/mp-sinal-handler.js`) **já busca `/v1/payments/{id}`** e já promove o
agendamento `tentative → confirmed` validando `external_reference: "sinal:{agendamento_id}"`.
A metade da confirmação vem quase de graça.

**Por que Pix dinâmico e não comprovante/chave manual:** comprovante de Pix é falsificável;
o Pix dinâmico via PSP tem confirmação automática + antifraude e reusa toda a infra MP
existente. Se um tatuador exigir conta própria (sem MP) no futuro → Caminho 3 (Asaas/Efí com
webhook), nunca comprovante cego.

## Objetivo e escopo

O bot passa a cobrar o sinal por **Pix dinâmico** como padrão, entregando o **copia-e-cola
dentro da própria conversa do WhatsApp**. Quando o sinal é pago, o **loop se fecha**: o cliente
recebe confirmação no WhatsApp e o tatuador é avisado no Telegram.

A feature é desenhada como o **caminho total** (visão completa), mas **dividida em fases**.
Duas das peças são **conexões OAuth de terceiros por estúdio** — Mercado Pago Connect (pra o
sinal cair na conta do estúdio) e Google Calendar (pra criar o evento) — cada uma do tamanho
de um sub-projeto próprio. Provavelmente compartilham a mesma infra de "conexões por tenant"
(storage de token, renovação, revogação). Ficam fora desta feature; ver
**"Conta recebedora & ordem de implementação"** abaixo.

### Fase 1 (esta feature — implementável agora)

1. **Geração Pix por padrão** via `POST /v1/payments` (substitui a Preference no caminho do
   sinal). Entrega **copia-e-cola** no WhatsApp.
2. **QR sob demanda:** copia-e-cola é o padrão; a **imagem do QR** só é enviada quando o
   cliente pedir.
3. **Fallback cartão só mediante objeção:** o cartão **nunca** é oferecido proativamente.
   Só aparece se o cliente objetar o Pix, com tom de estúdio.
4. **Confirmação ao cliente no WhatsApp** quando o sinal é pago.
5. **Aviso ao tatuador no Telegram** quando o sinal é pago.
6. **Abstração da fonte do token MP** (`getMpAccessToken(tenant)`) — hoje devolve o token
   global; é o ponto de extensão que o MP Connect vai preencher sem refatorar o Pix.

### Sub-projeto pré-go-live (NÃO nesta feature) — Mercado Pago Connect

7. **MP Connect (OAuth por estúdio)** pra o sinal cair **direto na conta do estúdio**. Hoje só
   existe **uma** `MP_ACCESS_TOKEN` global (conta do InkFlow, usada nas assinaturas do SaaS) —
   `gerar-link-sinal.js:26` usa ela. **Não há credencial MP por tenant** (confirmado: sem
   `mp_access_token`/`collector_id`/split/OAuth no código). Logo, sem o Connect o sinal cairia
   na conta do InkFlow — aceitável **só pra smoke técnico**, **não** pra cliente real
   (intermediação financeira tem implicação fiscal/BACEN). É **pré-requisito de go-live com
   cliente pagante**, brainstorm/spec próprio. 1ª tarefa do sub-projeto: checagem barata de
   viabilidade (o tipo de conta dos estúdios suporta Connect/`application_fee`?).

### Fase 2 (futuro — brainstorm próprio, NÃO nesta feature)

8. **Criar evento no Google Calendar** ao confirmar o agendamento. Hoje só existe a coluna
   `agendamentos.gcal_event_id` (vazia, nunca preenchida) e
   `tenants.google_calendar_id`/`google_drive_folder` (aceitos via API). **Zero integração
   real** — exige OAuth Google por tenant, storage de refresh token, renovação e tratamento de
   revogação. Fica como **ponto de extensão documentado** no handler + item P1 no backlog.

## Decisões cravadas no brainstorm

1. **Abordagem A — `/v1/payments` direto** (e não Preference com Pix pré-selecionado). Só A
   entrega o copia-e-cola dentro do WhatsApp; B manteria o cliente abrindo página web do MP.
2. **Pix substitui o checkout** como padrão. Cartão **nunca proativo** — só fallback **mediante
   objeção** do cliente. Copy cravada:
   > "Aqui no estúdio a gente trabalha com sinal no Pix, mas caso prefira dá pra fazer no cartão
   > também — o que fica melhor pra ti?"
3. **Entrega:** copia-e-cola por padrão (texto); **QR (imagem) só quando solicitado**.
4. **Loop pós-pagamento:** cliente (WhatsApp) + tatuador (Telegram) na Fase 1. Calendar na
   Fase 2.
5. **`payer.email`:** **único por cliente** derivado do telefone
   (`cli{telefone}@inkflowbrasil.com`). NÃO usar o email do estúdio (dono da conta MP) — seria
   "pagador = recebedor", único cenário que poderia parecer auto-pagamento. Email único por
   cliente mantém o painel do MP organizado e elimina o risco antifraude teórico. *(O Pix não
   valida o email; quem paga é identificado pelo banco/CPF de quem cola o código.)*
6. **Expiração do Pix** alinhada ao **hold do slot (48h)** já existente (`slot_expira_em`).
7. **Feature flag `ENABLE_PIX_SINAL`** — rollback sem revert de código (padrão de
   `ENABLE_TRIAL_V2`/`ENABLE_COLETA_MODE`). Off → volta pro checkout/Preference atual.
8. **Estender a tool `gerar-link-sinal`** com `metodo: 'pix' | 'cartao'` (default `pix`) — em
   vez de criar uma tool nova. Reuso máximo.
9. **Conta recebedora = Modelo A (MP Connect/OAuth).** O sinal deve cair **na conta do
   estúdio**, não na do InkFlow. Como o Connect é sub-projeto próprio (item 7), esta feature
   usa a **abstração `getMpAccessToken(tenant)`** (token global por trás, por enquanto). Quando
   o Connect entregar, ele preenche a abstração e o sinal passa a cair no estúdio **sem tocar
   no código do Pix**. (Modelos descartados: B = conta InkFlow + repasse manual = intermediação
   financeira; C = colar token MP por tenant = fricção + guardar token de terceiro.)
10. **Ordem de implementação (decisão de engenharia):** (1) definir a **interface do token**
    `getMpAccessToken(tenant)`; (2) **Pix dinâmico** (esta feature) consumindo a interface, com
    o global por trás — smoke técnico valida tudo; (3) **MP Connect** (sub-projeto) preenche a
    interface — pré-requisito de go-live; (4) **Google Calendar** (Fase 2), reusando a infra de
    conexões OAuth do Connect. Justificativa: isola o que varia, entrega valor testável cedo,
    retrabalho ~zero, e o Connect (mais caro/incerto) é construído depois de o consumidor
    deixar o requisito cristalino.

## Arquitetura — componentes que mudam

| Arquivo | Mudança |
|---|---|
| `functions/api/tools/gerar-link-sinal.js` | Param `metodo: 'pix' \| 'cartao'` (default `pix`). `pix` → `POST /v1/payments`; `cartao` → o código Preference atual (intocado). Persiste `mp_payment_id`. Respeita `ENABLE_PIX_SINAL`. |
| `functions/api/agent/_lib/format-link-sinal-msg.js` | Mensagem Pix: copia-e-cola em **balão próprio** (fácil de copiar, sem markdown) + instrução. Mantém a versão cartão pro fallback. |
| `functions/_lib/mp-sinal-handler.js` | Após promover `confirmed`: busca o tenant → `evoSend` confirmação ao **cliente** + `sendTelegramTo` aviso ao **tatuador**. Ambos **fail-open**. Gancho comentado pro Calendar (Fase 2). |
| PropostaAgent — `prompts/coleta/proposta/*` + schema + `route.js` | Três ações novas no estado `aguardando_sinal`: `reenviar_pix_sinal`, `oferecer_cartao_sinal` (só mediante objeção, **nunca proativo**) e `verificar_pagamento_sinal` ("já paguei"). |
| Helper reenviar/verificar Pix | Re-busca `GET /v1/payments/{mp_payment_id}` → reenvia copia-e-cola e/ou `qr_code_base64` como imagem (`evoSend`); e verifica status (`approved` → promove via handler). **Não** guarda dados do Pix no banco. |
| `getMpAccessToken(tenant, env)` (novo helper) | Fonte única do token MP. **Hoje** retorna `env.MP_ACCESS_TOKEN` (global); **amanhã** o token do estúdio via Connect. Usado por `gerar-link-sinal` e `mp-sinal-handler`. É a costura entre esta feature e o sub-projeto Connect. |

## Fluxo de dados — geração do Pix

`POST https://api.mercadopago.com/v1/payments`

- **Headers:** `Authorization: Bearer ${getMpAccessToken(tenant, env)}` *(global hoje, token
  do estúdio via Connect amanhã)*, `X-Idempotency-Key: sinal-{agendamento_id}` (evita Pix
  duplicado em retry).
- **Body:**
  - `transaction_amount`: valor do sinal (ex.: 30% do `valor_proposto`)
  - `description`: `"Sinal tatuagem - {nome_estudio}"`
  - `payment_method_id`: `"pix"`
  - `external_reference`: `"sinal:{agendamento_id}"` *(mantém o padrão que o webhook entende)*
  - `notification_url`: `"{SITE_URL}/api/webhooks/mp-sinal"`
  - `date_of_expiration`: ISO 8601 com offset, alinhado ao hold (now + 48h)
  - `payer`: `{ email: "cli{telefone}@inkflowbrasil.com", first_name: nome_cliente }`
- **Resposta usada:**
  - `id` → salvo em `agendamentos.mp_payment_id`
  - `point_of_interaction.transaction_data.qr_code` → **copia-e-cola** (enviado por padrão)
  - `point_of_interaction.transaction_data.qr_code_base64` → **imagem do QR** (sob demanda)

Persistência (reusa o que já existe): `agendamentos.mp_payment_id`, `sinal_valor`;
`conversas.estado = 'aguardando_sinal'`, `slot_expira_em`. **Migration nova: a confirmar no
plan — provavelmente nenhuma** (todas as colunas necessárias já existem).

## Gatilhos conversacionais (estado `aguardando_sinal`)

O PropostaAgent já gera o Pix ao reservar o horário. No estado `aguardando_sinal`, **três**
intenções adicionais do cliente:

- **Pede o QR ou o código de novo** ("me manda o QR", "tem o código pra escanear?", "manda o
  pix de novo") → ação `reenviar_pix_sinal` → helper re-busca via `GET /v1/payments/{id}` e
  re-envia o **copia-e-cola** e/ou o **QR (`qr_code_base64`) como imagem**, conforme o pedido.
  *(Gap #4: cobre código E QR, não só QR.)*
- **Objeta o Pix** ("tem que ser Pix?", "não consigo Pix", "dá pra cartão?") → ação
  `oferecer_cartao_sinal` → bot responde com a copy de estúdio; se o cliente aceitar, chama
  `gerar-link-sinal` com `metodo: 'cartao'` e envia o link de checkout (**cancela o Pix
  pendente** — ver erros). **Só dispara mediante objeção explícita — nunca proativo** (Gap #2:
  coberto por teste de não-regressão).
- **Diz que já pagou** ("já fiz o pix", "acabei de pagar", "paguei e aí?") → ação
  `verificar_pagamento_sinal` → `GET /v1/payments/{mp_payment_id}`; se `approved`, promove na
  hora (mesmo caminho do handler) e confirma; se ainda pendente, tranquiliza ("assim que cair
  eu te aviso na hora, pode deixar"). *(Gap #1: rede de segurança pra webhook perdido.)*

Modeladas como ações do agente (coerente com a arquitetura strict-schema do PropostaAgent,
Fase 2B), não como heurística de palavra-chave.

## Loop pós-pagamento (no `mp-sinal-handler.js`, após `confirmed`)

Após o PATCH que promove `tentative → confirmed` (idempotente, já existe):

1. Busca o tenant (`evo_apikey`, `evo_instance`, `tatuador_telegram_chat_id`, `nome_estudio`).
2. **Cliente (WhatsApp):** `evoSend(env, tenant, { type: 'text', to: cliente_telefone, text })`.
3. **Tatuador (Telegram):** `sendTelegramTo(env, tenant.tatuador_telegram_chat_id, text)`.
4. **[Fase 2 — gancho]** comentário marcando onde a criação do evento no Google Calendar
   entraria.

**Idempotência (Gap #1 colateral):** as notificações ficam **após** o guard
`already-processed` (o early-return quando o PATCH `tentative→confirmed` não retorna linha) —
assim webhook duplicado **não re-notifica** cliente nem tatuador. A ação
`verificar_pagamento_sinal` reusa exatamente este caminho, então "já paguei" + webhook
chegando juntos também só notificam uma vez.

**Fail-open:** falha em qualquer notificação **não invalida** o sinal — só loga (mesmo padrão
do `markConversaFechada` atual).

## Copy (cravada no brainstorm)

- **Pix (padrão), 2 balões:**
  > 💸 Pra garantir teu horário a gente pede um sinal de 30%, que fica em **R$ 210**. É só
  > copiar o código Pix abaixo e pagar no app do teu banco — assim que cair, teu horário tá
  > confirmado.
  >
  > `00020126...` *(copia-e-cola em balão separado)*
- **Pede QR:** "Claro! Tá aqui o QR pra escanear 👇" + imagem.
- **Objeta Pix:** "Aqui no estúdio a gente trabalha com sinal no Pix, mas caso prefira dá pra
  fazer no cartão também — o que fica melhor pra ti?"
- **Pago (cliente):** "Recebemos teu sinal! ✅ Teu horário tá confirmado pra **sexta, 22/05 às
  10h**. Qualquer coisa é só chamar aqui. Até lá!"
- **Pago (tatuador, Telegram):** "💰 Sinal pago! {nome} confirmou o horário de sexta 22/05 10h
  (tattoo: anjo com pássaros, antebraço). Sinal R$ 210."

> Nota: valores (R$), percentual e data/hora acima são **exemplos** — renderizados
> dinamicamente a partir do agendamento (`valor`, `sinal_percentual`, slot). O tom fino entra
> junto com o P1 "tom robotizado/naturalidade" (refator separado). Aqui a copy é funcional;
> ajustes de naturalidade não bloqueiam.

## Erros e casos de borda

- **MP falha ao gerar** → a tool retorna erro; o bot diz que teve um problema e tenta de novo.
  Não trava a conversa.
- **Pix expira (48h)** → cliente avisa "venceu" → regenera (novo `POST /v1/payments`, novo
  `mp_payment_id`). O fluxo de regeneração já existe (`gerar-link-sinal` permite regen em
  `tentative`/`cancelled`; relacionado ao TC-P09).
- **Webhook duplicado** → handler já é idempotente (só promove se ainda `tentative`).
- **Notificação cliente/tatuador falha no webhook** → fail-open; o sinal continua válido.
- **Pagou mas o slot já caiu pra outro** (raro com hold 48h) → **fora do escopo do fix
  automático**: alerta admin via `sendTelegramAdmin` pra resolução manual (eventual reembolso).
- **[Gap #1] Webhook nunca chega** (MP fora do ar / rede) → o cliente pode acionar
  `verificar_pagamento_sinal` ("já paguei"), que confere ativamente via `GET /v1/payments` e
  promove se `approved`. **Reconciliação proativa via cron** (varre `aguardando_sinal` perto de
  expirar e confere status no MP) fica como **opção recomendada no plan** — fecha o caso sem o
  cliente precisar avisar.
- **[Gap #3] Pagamento duplo (Pix + cartão no fallback):** ao gerar o link de cartão por
  objeção, **cancelar o Pix pendente** (`PUT /v1/payments/{id}` → `status: cancelled`) pra
  evitar o cliente pagar os dois. Se o cancel falhar → fail-open (raro; ambos têm o mesmo
  `external_reference` e o handler é idempotente, mas registrar pra eventual reembolso manual).

## Testes (TDD)

**Unit:**
- `gerar-link-sinal` `metodo: pix` monta o payload correto (`payment_method_id`,
  `external_reference`, `date_of_expiration`, `X-Idempotency-Key`, `payer.email` derivado).
- `metodo: cartao` mantém a Preference atual (regressão).
- `ENABLE_PIX_SINAL` off → cai pro caminho cartão/Preference.
- `format-link-sinal-msg` Pix: copia-e-cola em balão próprio, sem markdown.
- `mp-sinal-handler` dispara `evoSend` (cliente) + `sendTelegramTo` (tatuador) após
  `confirmed`; **fail-open** quando qualquer um falha.
- PropostaAgent emite `reenviar_pix_sinal` (pede QR/código), `oferecer_cartao_sinal` (objeção)
  e `verificar_pagamento_sinal` ("já paguei").
- **[Gap #2] Não-regressão (decisão de produto crítica):** o PropostaAgent **nunca** emite
  `oferecer_cartao_sinal` sem objeção explícita do cliente (Pix puro → bot **não menciona
  cartão** em nenhum momento).
- **[Gap #1]** `verificar_pagamento_sinal`: `approved` → promove e confirma; pendente →
  tranquiliza **sem** promover.
- **[Gap #3]** fallback cartão **cancela o Pix pendente** ao gerar o link.
- **[Gap #1 colateral]** notificações pós-pagamento **não disparam** em webhook duplicado
  (guard de idempotência).

**Smoke com pago REAL** (tenant de teste `db686ef2`, conta MP real, valor baixíssimo):
conversa do zero → escolhe horário → recebe copia-e-cola → **paga de verdade** → webhook
confirma → cliente recebe a confirmação no WhatsApp + tatuador recebe o aviso no Telegram.
Verificar no banco: `agendamentos.status = 'confirmed'`, `sinal_pago_em`, `mp_payment_id`.
> ⚠️ Enquanto o MP Connect não existir, este smoke cai **na conta do InkFlow** (token global) —
> são centavos do Leandro, só pra validar o **encanamento técnico**. Cobrança de cliente real
> só após o Connect (item 7).

## Notas de implementação (gaps menores — resolver no plan/impl)

- **Valor mínimo do Pix:** confirmar o mínimo aceito pelo MP pra o smoke (centavos). O sinal
  real é % do valor proposto, sem problema.
- **`date_of_expiration`:** formato ISO 8601 **com offset** (`...-03:00`), dentro do teto do
  MP; 48h ok.
- **`payer.first_name` ausente:** fallback quando o nome do cliente não estiver disponível.
- **Smoke exige webhook público:** rodar contra prod/preview deployado (o `notification_url`
  precisa ser alcançável), não localhost.
- **LGPD:** o email sintético `cli{telefone}@inkflowbrasil.com` embute o telefone (PII menor)
  enviado ao MP — registrar; alternativa é um hash do telefone se preferir não expor.

## Fora de escopo (Fase 1)

- **MP Connect / OAuth por estúdio** (item 7) — sub-projeto próprio, **pré-requisito de go-live
  com cliente pagante**. Esta feature só deixa a costura pronta (`getMpAccessToken`).
- Google Calendar (Fase 2 — OAuth Google por estúdio, brainstorm próprio).
- Parcelamento (P1 separado no backlog).
- Refator de tom/naturalidade da copy (P1 separado).
- Notificação ao cliente em outros eventos (lembrete da sessão etc.).
