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

A feature é desenhada como o **caminho total** (visão completa, incluindo onde o Google
Calendar encaixa), mas **dividida em fases** porque o Calendar exige OAuth Google por estúdio
— uma engrenagem própria, do tamanho de um sub-projeto.

### Fase 1 (esta feature — implementável agora)

1. **Geração Pix por padrão** via `POST /v1/payments` (substitui a Preference no caminho do
   sinal). Entrega **copia-e-cola** no WhatsApp.
2. **QR sob demanda:** copia-e-cola é o padrão; a **imagem do QR** só é enviada quando o
   cliente pedir.
3. **Fallback cartão só mediante objeção:** o cartão **nunca** é oferecido proativamente.
   Só aparece se o cliente objetar o Pix, com tom de estúdio.
4. **Confirmação ao cliente no WhatsApp** quando o sinal é pago.
5. **Aviso ao tatuador no Telegram** quando o sinal é pago.

### Fase 2 (futuro — brainstorm próprio, NÃO nesta feature)

6. **Criar evento no Google Calendar** ao confirmar o agendamento. Hoje só existe a coluna
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

## Arquitetura — componentes que mudam

| Arquivo | Mudança |
|---|---|
| `functions/api/tools/gerar-link-sinal.js` | Param `metodo: 'pix' \| 'cartao'` (default `pix`). `pix` → `POST /v1/payments`; `cartao` → o código Preference atual (intocado). Persiste `mp_payment_id`. Respeita `ENABLE_PIX_SINAL`. |
| `functions/api/agent/_lib/format-link-sinal-msg.js` | Mensagem Pix: copia-e-cola em **balão próprio** (fácil de copiar, sem markdown) + instrução. Mantém a versão cartão pro fallback. |
| `functions/_lib/mp-sinal-handler.js` | Após promover `confirmed`: busca o tenant → `evoSend` confirmação ao **cliente** + `sendTelegramTo` aviso ao **tatuador**. Ambos **fail-open**. Gancho comentado pro Calendar (Fase 2). |
| PropostaAgent — `prompts/coleta/proposta/*` + schema + `route.js` | Duas ações novas no estado `aguardando_sinal`: `enviar_qr_sinal` e `oferecer_cartao_sinal`. |
| Helper QR sob demanda | Re-busca `GET /v1/payments/{mp_payment_id}` → envia `qr_code_base64` como imagem (`evoSend` `type: 'media'`). **Não** guarda a imagem no banco. |

## Fluxo de dados — geração do Pix

`POST https://api.mercadopago.com/v1/payments`

- **Headers:** `Authorization: Bearer ${MP_ACCESS_TOKEN}`, `X-Idempotency-Key:
  sinal-{agendamento_id}` (evita Pix duplicado em retry).
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

O PropostaAgent já gera o Pix ao reservar o horário. No estado `aguardando_sinal`, duas
intenções adicionais do cliente:

- **Pede o QR** ("me manda o QR", "tem o código pra escanear?") → ação `enviar_qr_sinal` →
  helper re-busca o `qr_code_base64` e envia a imagem.
- **Objeta o Pix** ("tem que ser Pix?", "não consigo Pix", "dá pra cartão?") → ação
  `oferecer_cartao_sinal` → bot responde com a copy de estúdio; se o cliente aceitar, chama
  `gerar-link-sinal` com `metodo: 'cartao'` e envia o link de checkout.

Modeladas como ações do agente (coerente com a arquitetura strict-schema do PropostaAgent,
Fase 2B), não como heurística de palavra-chave.

## Loop pós-pagamento (no `mp-sinal-handler.js`, após `confirmed`)

Após o PATCH que promove `tentative → confirmed` (idempotente, já existe):

1. Busca o tenant (`evo_apikey`, `evo_instance`, `tatuador_telegram_chat_id`, `nome_estudio`).
2. **Cliente (WhatsApp):** `evoSend(env, tenant, { type: 'text', to: cliente_telefone, text })`.
3. **Tatuador (Telegram):** `sendTelegramTo(env, tenant.tatuador_telegram_chat_id, text)`.
4. **[Fase 2 — gancho]** comentário marcando onde a criação do evento no Google Calendar
   entraria.

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

## Testes (TDD)

**Unit:**
- `gerar-link-sinal` `metodo: pix` monta o payload correto (`payment_method_id`,
  `external_reference`, `date_of_expiration`, `X-Idempotency-Key`, `payer.email` derivado).
- `metodo: cartao` mantém a Preference atual (regressão).
- `ENABLE_PIX_SINAL` off → cai pro caminho cartão/Preference.
- `format-link-sinal-msg` Pix: copia-e-cola em balão próprio, sem markdown.
- `mp-sinal-handler` dispara `evoSend` (cliente) + `sendTelegramTo` (tatuador) após
  `confirmed`; **fail-open** quando qualquer um falha.
- PropostaAgent emite `enviar_qr_sinal` (pedido de QR) e `oferecer_cartao_sinal` (objeção).

**Smoke com pago REAL** (tenant de teste `db686ef2`, conta MP real, valor baixíssimo):
conversa do zero → escolhe horário → recebe copia-e-cola → **paga de verdade** → webhook
confirma → cliente recebe a confirmação no WhatsApp + tatuador recebe o aviso no Telegram.
Verificar no banco: `agendamentos.status = 'confirmed'`, `sinal_pago_em`, `mp_payment_id`.

## Fora de escopo (Fase 1)

- Google Calendar (Fase 2 — OAuth Google por estúdio, brainstorm próprio).
- Parcelamento (P1 separado no backlog).
- Refator de tom/naturalidade da copy (P1 separado).
- Notificação ao cliente em outros eventos (lembrete da sessão etc.).
