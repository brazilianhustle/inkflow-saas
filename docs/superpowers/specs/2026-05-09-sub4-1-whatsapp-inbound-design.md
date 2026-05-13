# Sub-4.1 — WhatsApp Inbound Endpoint (Design)

**Data:** 2026-05-09
**Branch alvo:** `feat/sub4-cutover-n8n` (a criar)
**Status:** ready-to-plan
**Sub-projeto pai:** Refator Coleta v2 Multi-Agent — Sub-4 cutover n8n (decomposto em 4.1 endpoint + 4.2 cutover)

---

## Contexto

Sub-3.x mergeou em main. Os 4 agents (Tattoo, Cadastro, Proposta, Portfolio-intent) rodam end-to-end via `functions/api/agent/route.js` com pure structured-output, mas **`route.js` recebe `tenant` e `conversa` como stub no body** — quem hoje carrega/persiste é o n8n. Sub-4 inteiro é o cutover: substituir n8n no hot path, persistir Supabase real, remover container.

Sub-4 foi decomposto em duas sub-features (memory `project_agente_autonomo.md`):

- **Sub-4.1 (este spec)** — Endpoint feature-complete `/api/whatsapp/inbound`. Recebe webhook Evolution, persiste, chama `route.js`, manda outbound (Evolution + Telegram tatuador). **NÃO toca o webhook real do Evolution em prod** — endpoint testado em isolamento via tenant fixture.
- **Sub-4.2** — Cutover (apontar `N8N_WEBHOOK` em prod pro novo endpoint, descomissionar n8n container, remover código legado).

## Goals

1. Endpoint `/api/whatsapp/inbound` recebe payload Evolution v2.3.x com auth via `x-webhook-secret`.
2. Persistência Supabase real (load+write em `tenants`, `conversas`, `n8n_chat_histories`).
3. Idempotência via UNIQUE em `(session_id, evo_message_id)` — Evolution retry não duplica.
4. Persist-first pattern: ack 200 < 200ms, processamento via `context.waitUntil`.
5. Outbound completo: Evolution sendText/sendMedia + Telegram tatuador (orçamento no handoff cadastro + notify em estado terminal).
6. Mídia base64 persistida em `n8n_chat_histories.message` JSONB (sem upload Storage v0).
7. Gate pra Sub-4.2: integration tests cobrindo 10 cenários + smoke E2E real com tenant fixture.

## Non-Goals

- Cutover de tráfego prod (Sub-4.2).
- Descomissionar n8n container (Sub-4.2).
- Cron de retry pra mensagens stuck `status='received'` (Sub-4.3).
- `pg_advisory_lock` por `(tenant_id, telefone)` pra race entre 2 msgs (Sub-4.3).
- Migrar mídia base64 pra Supabase Storage (Sub-4.3).
- Reentrada do bot por timeout (cliente em estado terminal há X horas) (P2 backlog).
- Multimodal: passar imagem pro agent via input vision (P2 backlog).
- Migração de naming `n8n_chat_histories` → `chat_history` (P3, cosmético).
- Renomear/depurar tabela `chat_messages` legada (P3, cosmético).

## Premissas validadas

- **`tenants.evo_instance`** mapeia da `instanceName` Evolution pro `tenant_id` (validado em `evo-create-instance.js` + `evo-status.js`).
- **`tenants.tatuador_telegram_chat_id`** é o destino do Telegram tatuador (validado em `enviar-orcamento-tatuador.js`).
- **`n8n_chat_histories`** é a fonte canônica de histórico hoje (`functions/api/conversas/list.js` e `thread.js` leem dela). Sub-4.1 escreve nela pra manter compat dashboard. Schema atual: `{ id, session_id, message JSONB, created_at }`. `session_id` formato `<tenant_uuid>_<telefone>`.
- **Trigger `trg_n8n_chat_histories_update_conversa`** já atualiza `conversas.last_msg_at` em INSERT — não duplicar.
- **`conversas`** tem unique `(tenant_id, telefone)`, campos `dados_coletados JSONB` e `dados_cadastro JSONB` separados, `estado_agente`, `valor_proposto`, `orcid`, `pausada_em`.
- **`route.js`** aceita `tenant + conversa + clientContext` no body — Sub-4.1 passa real, paridade com n8n hoje. Sub-4.1 vai extrair `runAgent({...})` como função pura exportável; `onRequest` do route.js vira wrapper de ~30 LOC (sem regressão funcional).
- **Helper Telegram** existing: `_lib/telegram.js` exporta `sendTelegramAlert(env, text)` (admin alerts). Sub-4.1 estende com `sendTelegramTo(env, chatId, text)` parametrizado pra tatuador.
- **Tool `enviar-orcamento-tatuador`** é idempotente (não reenvia se `conversas.orcid` já existe), valida pré-condições, monta orçamento, manda Telegram, gera `orcid`, transiciona estado pra `aguardando_tatuador`.
- **Estados terminais** onde bot fica calado (decisão Sub-4.1): `aguardando_tatuador`, `lead_frio`, `aguardando_decisao_desconto`. Cliente que manda msg nesses estados → persist + Telegram notify tatuador, sem chamar agent.
- **Modo de processamento:** async via `context.waitUntil` + persist-first + idempotência por `evo_message_id`. Pattern padrão de webhook moderno (Stripe/Twilio).
- **Race entre 2 msgs cliente em < 2s:** YAGNI Sub-4.1. Anotar em smoke; se reproduzir, P2 follow-up Sub-4.3.

## Arquitetura

```
Evolution v2 (instância tenant)
    │  POST {N8N_WEBHOOK → /api/whatsapp/inbound em Sub-4.2}
    │  payload: { event:'messages.upsert', instance, data:{ key, message, ... } }
    ▼
┌──────────────────────────────────────────────────────────────────┐
│  /api/whatsapp/inbound.js  (~80 LOC)                              │
│  1. valida x-webhook-secret                                       │
│  2. parseEvolutionPayload(body) → InboundMessage                  │
│  3. lookup tenant via evo_instance (rápido)                       │
│  4. INSERT n8n_chat_histories (status='received', evo_message_id) │
│     com Prefer: resolution=ignore-duplicates → idempotente        │
│  5. ack 200                                                       │
│  6. context.waitUntil(pipeline.processMessage(env, msg))          │
└──────────────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────────────────┐
│  _lib/whatsapp-pipeline.js  processMessage(env, msg, deps)        │
│  1. lookup conversa (tenant_id, telefone) → cria se inexistente   │
│  2. early-return estado terminal: Telegram tatuador, status=done  │
│  3. monta historico de n8n_chat_histories (últimos 40)            │
│  4. runAgent({env, tenant, conversa, ...}) [importa de route.js]  │
│  5. UPDATE conversa (estado, dados_coletados OU dados_cadastro)   │
│  6. INSERT n8n_chat_histories OUT (type:'ai', content)            │
│  7. Evolution sendText (+ sendMedia urls_portfolio)               │
│  8. side-effect: cadastro→handoff → callTool enviar-orcamento     │
│  9. UPDATE n8n_chat_histories SET status='processed'              │
└──────────────────────────────────────────────────────────────────┘
```

**Boundary cravada:**

- `route.js` puro de transporte HTTP. Decisão (agent + invariants) + side-effects de domínio (Proposta substates: reservar-horario, gerar-link-sinal, etc; Portfolio intent: enviar-portfolio).
- `pipeline.js` cobre tudo de transporte: Supabase load/write, Evolution outbound, Telegram tatuador (orçamento no handoff + notify estado terminal).
- `inbound.js` é só ingest/auth/persist-first/ack/dispatch.

## Schema Supabase

### Migration `2026-05-09-sub4-1-n8n-chat-evo.sql`

```sql
-- Sub-4.1: Habilita endpoint /api/whatsapp/inbound com persist-first +
-- idempotência via Evolution message.id + observability via status.
-- Tabela alvo: n8n_chat_histories (canon de histórico hoje, lida por
-- functions/api/conversas/{list,thread}.js).
BEGIN;

-- 1. Coluna evo_message_id (nullable — linhas legacy do n8n não têm).
ALTER TABLE n8n_chat_histories
  ADD COLUMN IF NOT EXISTS evo_message_id TEXT;

-- 2. Status enum-as-text com CHECK.
ALTER TABLE n8n_chat_histories
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'processed';

ALTER TABLE n8n_chat_histories
  DROP CONSTRAINT IF EXISTS n8n_chat_histories_status_check;
ALTER TABLE n8n_chat_histories
  ADD CONSTRAINT n8n_chat_histories_status_check
  CHECK (status IN ('received', 'processed', 'failed'));

-- 3. UNIQUE partial: previne INSERT duplo por retry Evolution.
--    Partial WHERE evo_message_id IS NOT NULL — não bloqueia linhas legacy.
CREATE UNIQUE INDEX IF NOT EXISTS n8n_chat_histories_session_evo_msg_idx
  ON n8n_chat_histories (session_id, evo_message_id)
  WHERE evo_message_id IS NOT NULL;

-- Trigger trg_n8n_chat_histories_update_conversa JÁ EXISTE
-- (criado em supabase/migrations/2026-05-04-pagina-tatuador-conversas.sql).
-- Não duplicar.

COMMIT;
```

### Shape de uma linha Sub-4.1

**Mensagem in (cliente → bot):**
```json
{
  "id": 12345,
  "session_id": "<tenant_uuid>_5511...",
  "message": {
    "type": "human",
    "content": "quero uma rosa vermelha",
    "media_base64": null,
    "media_mimetype": null
  },
  "evo_message_id": "ABC123XYZ",
  "status": "received",
  "created_at": "2026-05-09T..."
}
```

**Mensagem com mídia in:**
```json
{
  "message": {
    "type": "human",
    "content": "tipo essa aqui",
    "media_base64": "/9j/4AAQ...",
    "media_mimetype": "image/jpeg"
  }
}
```

**Mensagem out (bot → cliente):**
```json
{
  "session_id": "<tenant>_<tel>",
  "message": { "type": "ai", "content": "Demais a ideia! Que tamanho..." },
  "evo_message_id": null,
  "status": "processed"
}
```

### Estados de `status`

```
received  → INSERT inicial pelo /inbound. Pipeline ainda não processou.
processed → pipeline.js terminou OK (UPDATE final no fim do try OU early-return terminal).
failed    → pipeline.js capturou erro fatal (no catch do waitUntil).
```

Detecção de drops (cron Sub-4.3):
```sql
SELECT * FROM n8n_chat_histories
WHERE status = 'received' AND created_at < NOW() - INTERVAL '5 minutes'
```

## Endpoint thin — `functions/api/whatsapp/inbound.js`

### Responsabilidades estritas (~80 LOC)

```
1. Method check (não-POST → 405)
2. Auth: header x-webhook-secret === env.WEBHOOK_SECRET
3. Parse JSON body → payload Evolution
4. parseEvolutionPayload(body) → { ok, inbound } | { skip: <reason> }
   - skips ack 200 + log: 'wrong-event' (não-messages.upsert), 'from-me'
     (msg do bot), 'group-msg' (@g.us), 'no-key-id', 'no-telefone'.
5. Lookup tenant via evo_instance — 1 SELECT com select específico (não *).
   - 0 rows → 200 + log warn 'orphan-tenant' + skip (NÃO 5xx — Evo retry desnecessário).
6. INSERT n8n_chat_histories com Prefer: resolution=ignore-duplicates.
   - PostgREST trata UNIQUE conflict como no-op (retorna 201 com array vazio).
   - Resposta vazia → idempotência hit. Ack 200, NÃO dispatch waitUntil.
   - Resposta com row → primeira vez. Ack 200 + dispatch waitUntil.
7. context.waitUntil(processMessage(env, msg))
8. return Response 200 { ok: true, accepted: <id|null>, idempotent?: true }
```

Tudo até passo 6 deve rodar em < 200ms (1 SELECT tenant + 1 INSERT). Passo 7 é fire-and-forget.

### Helper `parseEvolutionPayload(body)` (`_lib/evolution-parser.js`)

Pure function, sem I/O. Extrai:

```js
{
  tenantEvoInstance,    // body.instance
  telefone,             // body.data.key.remoteJid.split('@')[0].replace(/\D/g, '')
  evoMessageId,         // body.data.key.id
  texto,                // conversation || imageMessage.caption || extendedTextMessage.text || ''
  mediaBase64,          // imageMessage.base64 || audioMessage.base64 || null
  mediaMimetype,        // imageMessage.mimetype || audioMessage.mimetype || null
  pushName,             // body.data.pushName
}
```

Skip reasons retornadas:
- `wrong-event` (event !== `messages.upsert`)
- `no-key-id` (key.id missing)
- `from-me` (key.fromMe = true)
- `group-msg` (remoteJid contém `@g.us`)
- `no-telefone` (sem dígitos no remoteJid)

### Auth

`env.WEBHOOK_SECRET` — mesma var que n8n usa hoje (não rotacionar pra Sub-4.2 cutover; ambos compartilham).

### Schema do INSERT

```js
const session_id = `${tenant.id}_${telefone}`;
await supaFetch(env, '/rest/v1/n8n_chat_histories', {
  method: 'POST',
  headers: {
    'Prefer': 'return=representation, resolution=ignore-duplicates',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    session_id,
    message: {
      type: 'human',
      content: texto,
      media_base64: mediaBase64,
      media_mimetype: mediaMimetype,
    },
    evo_message_id: evoMessageId,
    status: 'received',
  }),
});
```

PostgREST com `resolution=ignore-duplicates` retorna 201 + array vazio em conflict. Pipeline checa `rows.length === 0` → idempotente.

## Pipeline — `functions/_lib/whatsapp-pipeline.js`

### Assinatura e deps

```js
export async function processMessage(env, msg, depsOverride = {}) {
  const deps = { ...defaultDeps(env), ...depsOverride };
  // ...
}

export function defaultDeps(env) {
  return {
    supaFetch: (path, init) => supaFetch(env, path, init),
    evoSend: (tenant, payload) => evoSend(env, tenant, payload),
    sendTelegram: (chatId, text) => sendTelegramTo(env, chatId, text),
    sendTelegramAdmin: (text) => sendTelegramAlert(env, text),
    runAgent: (args) => runAgent({ env, ...args }),  // importado de route.js
    callTool: (toolName, body) => callTool(env, toolName, body),
    now: () => new Date().toISOString(),
  };
}
```

Pattern: integration tests passam `depsOverride = { supaFetch: vi.fn(), evoSend: vi.fn(), ... }` pra mockar I/O sem interceptar fetch global.

### Etapas (ordem cravada)

```
INPUT msg = { tenantId, telefone, evoMessageId, texto, mediaBase64,
              mediaMimetype, pushName, msgRowId, tenant }

1. LOAD/CREATE conversa
   GET /rest/v1/conversas?tenant_id=eq.<id>&telefone=eq.<tel>
       &select=id,estado_agente,dados_coletados,dados_cadastro,valor_proposto,orcid,pausada_em
       &limit=1
   - 0 rows → POST conversas { tenant_id, telefone, estado_agente:'tattoo',
              dados_coletados:{}, dados_cadastro:{}, last_msg_at: now }
   - 1 row → usa.

2. EARLY-RETURN estado terminal
   if conversa.estado_agente in ['aguardando_tatuador','lead_frio','aguardando_decisao_desconto']:
     - if tenant.tatuador_telegram_chat_id:
         sendTelegram(chat_id,
           `📩 Cliente ${pushName ?? telefone} (${tenant.nome_estudio}) mandou msg:\n${preview(texto, 200)}`)
       else: sendTelegramAdmin('tenant sem tatuador_telegram_chat_id em estado terminal')
     - UPDATE n8n_chat_histories SET status='processed' WHERE id=msgRowId
     - return.

3. MONTA historico
   GET /rest/v1/n8n_chat_histories?session_id=eq.<tenant>_<tel>
       &order=created_at.asc&limit=40&select=id,message
   - filtra a linha atual (msgRowId) — já adicionada como 'user' no array final.
   - mapeia: { type:'human' → role:'user', type:'ai' → role:'assistant' }.
   - cap 40 mensagens.

4. runAgent
   const out = await runAgent({
     tenant_id: tenant.id, telefone, mensagem: texto,
     estado_atual: conversa.estado_agente,
     dados_acumulados: conversa.dados_coletados,
     historico,
     tenant, conversa,
     clientContext: {},
   });
   - Se out.ok === false → status='failed', sendTelegramAdmin('runAgent falhou'), return.

5. UPDATE conversa
   - Lógica condicional por agent_usado:
       if out.agent_usado === 'cadastro':
         dados_cadastro = { ...conversa.dados_cadastro, ...out.dados_persistidos }
         dados_coletados = conversa.dados_coletados  // unchanged
       else:
         dados_coletados = { ...conversa.dados_coletados, ...out.dados_persistidos }
         dados_cadastro = conversa.dados_cadastro  // unchanged
   - Proposta side-effects (reservar_horario, gerar-link-sinal) já rodaram dentro
     de runAgent e podem ter mutado out.resposta_cliente — pipeline só persiste.
   - PATCH /rest/v1/conversas?id=eq.<conversa.id>
       { estado_agente: out.estado_novo, dados_coletados, dados_cadastro,
         updated_at: now }

6. INSERT n8n_chat_histories OUT
   POST /rest/v1/n8n_chat_histories
     { session_id, message: { type:'ai', content: out.resposta_cliente },
       status: 'processed', created_at: now }

7. EVOLUTION OUTBOUND
   await evoSend(tenant, { type:'text', to: telefone, text: out.resposta_cliente })
   if (out.urls_portfolio?.length) {
     for (url of out.urls_portfolio) {
       await evoSend(tenant, { type:'media', to: telefone, url })
     }
   }
   - Falha sendText → sendTelegramAdmin('evo sendText falhou'), status='failed', return.
   - Falha sendMedia → sendTelegramAdmin('evo sendMedia falhou: <url>'), continua
     (texto principal foi entregue).

8. SIDE-EFFECT: handoff cadastro → orcamento tatuador
   if conversa.estado_agente === 'cadastro' && out.proxima_acao === 'handoff':
     - if !tenant.tatuador_telegram_chat_id:
         sendTelegramAdmin('handoff sem tatuador_telegram_chat_id'), warning, NÃO bloqueia.
     - else:
         result = callTool(env, 'enviar-orcamento-tatuador', {
           tenant_id: tenant.id, telefone,
         })
         if !result.ok:
           sendTelegramAdmin(`enviar-orcamento-tatuador falhou: ${result.error}`)

9. UPDATE n8n_chat_histories SET status='processed' WHERE id=msgRowId
```

### Tratamento de erro

```js
try {
  // etapas 1-9
} catch (e) {
  console.error('[pipeline] failed:', { evoMessageId, telefone, error: e.message, stack: e.stack });
  await deps.supaFetch(`/rest/v1/n8n_chat_histories?id=eq.${msgRowId}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'failed' }),
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => {});  // best-effort
  await deps.sendTelegramAdmin(`🚨 pipeline failed: ${e.message}\n${preview(e.stack, 500)}`);
}
```

**Sem retry automático em Sub-4.1.** Mensagens `failed` ficam pra inspeção manual. Cron Sub-4.3 reabre.

### Race condition entre 2 mensagens em < 2s

**Decisão: aceitar como YAGNI.** Cliente raramente manda 2 msgs em rápida sucessão. Quando manda, última PATCH wins, resposta da msg 2 pode ser inconsistente com estado pós-msg 1. Mitigação postergada (Sub-4.3): `pg_advisory_lock` ou debounce 2s no inbound.

### Refactor `route.js` — extrair `runAgent`

`route.js` hoje tem ~300 LOC com toda a lógica dentro de `onRequest`. Sub-4.1 extrai a lógica core:

```js
// route.js (NOVO shape, ~50 LOC + runAgent ~250 LOC)
export async function runAgent({ env, tenant_id, telefone, mensagem, estado_atual,
                                  dados_acumulados, historico, tenant, conversa, clientContext }) {
  // toda a lógica atual (validateEnv, setDefaultOpenAIKey, builder, run, validator,
  // enforceMenorIdade, executeOrchestration, executePortfolioIntent) move pra cá.
  // Retorna o JSON shape atual: { ok, resposta_cliente, estado_novo, ... }.
}

export async function onRequest({ request, env }) {
  // body parse + auth básico → chama runAgent → retorna JSON.
  // Mantém retro-compat: n8n hoje POSTa /api/agent/route, vai continuar funcionando
  // até cutover Sub-4.2.
}
```

**Risco:** edit em arquivo testado em prod. Mitigação: tests existentes (372/372) cobrem comportamento via `onRequest` HTTP — se `runAgent` extrai corretamente, tests passam intactos. Adicionar 2-3 unit tests cobrindo `runAgent` direto (sem HTTP).

## Testing strategy

### 5.1 Pirâmide

```
                     ┌─────────────────┐
                     │  Smoke E2E real │   1 cenário golden path
                     │  (tenant fixt.) │   ~30min manual
                     ├─────────────────┤
                  ┌──┤  Integration    │   ~10 cenários, mocks
                  │  │  pipeline.test  │   automatizado, < 10s
                  │  └─────────────────┘
                  │
        ┌─────────┴───────┐
        │  Unit            │   ~18 cenários focados
        │  parser.test     │
        │  inbound.test    │
        │  route.runAgent  │
        └──────────────────┘
```

### 5.2 Unit — `tests/lib/evolution-parser.test.mjs` (~12 cenários)

- conversation com texto puro → `ok:true, texto`
- imageMessage com caption + base64 → `mediaBase64`, `mediaMimetype`
- audioMessage com base64
- `fromMe:true` → `skip:'from-me'`
- `remoteJid` com `@g.us` → `skip:'group-msg'`
- event !== `messages.upsert` → `skip:'wrong-event'`
- key.id missing → `skip:'no-key-id'`
- remoteJid sem dígitos → `skip:'no-telefone'`
- `stickerMessage` → `texto:''`, sem mídia
- extendedTextMessage com text → texto extraído
- pushName preservado / null
- payload corrompido (`null`, `{}`) → skip algum

### 5.3 Unit — `tests/api/whatsapp/inbound.test.mjs` (~6 cenários)

- 401 sem `x-webhook-secret`
- 405 GET
- 400 body inválido
- 200 + skip se `parseEvolutionPayload` retorna skip
- 200 idempotente se INSERT retorna array vazio (ignore-duplicates hit)
- 200 + dispatch waitUntil se INSERT OK (verifica `waitUntil` foi chamado com `processMessage`)

### 5.4 Integration — `tests/lib/whatsapp-pipeline.test.mjs` (~10 cenários, alvo principal)

Mocks injetados via `processMessage(env, msg, deps)`:

```js
function mockDeps() {
  return {
    supaFetch: vi.fn(),
    evoSend: vi.fn().mockResolvedValue({ ok: true }),
    sendTelegram: vi.fn().mockResolvedValue({ ok: true }),
    sendTelegramAdmin: vi.fn().mockResolvedValue({ ok: true }),
    runAgent: vi.fn(),
    callTool: vi.fn().mockResolvedValue({ ok: true }),
    now: () => '2026-05-09T12:00:00.000Z',
  };
}
```

**Cenários:**

1. **Golden path tattoo→cadastro**: tenant existe, conversa nova, `runAgent` retorna `proxima_acao:'pergunta'` → assert `evoSend` chamado, conversa UPDATE com novo estado, INSERT n8n_chat_histories out, status='processed'.
2. **Estado terminal `aguardando_tatuador`**: conversa em estado terminal → assert `sendTelegram(tatuador_chat_id, ...)` chamado, agent NÃO chamado, status='processed', sem evoSend.
3. **Estado terminal sem tatuador_telegram_chat_id**: → `sendTelegramAdmin` chamado com warning.
4. **Handoff cadastro → orcamento**: conversa estado='cadastro', agent retorna `proxima_acao:'handoff'` → assert `callTool('enviar-orcamento-tatuador', ...)` chamado, evoSend chamado.
5. **Portfolio intent**: agent retorna `urls_portfolio:['url1', 'url2']` → assert evoSend chamado 1x text + 2x media.
6. **Conversa nova**: `(tenant_id, telefone)` 0 rows → POST conversas com defaults.
7. **Agent falha (`runAgent` throws)**: catch → status='failed', `sendTelegramAdmin` alert, NÃO evoSend.
8. **Evolution sendText falha**: `evoSend` retorna `{ok:false}` → status='failed', `sendTelegramAdmin` warning.
9. **Mídia base64 in**: msg com `mediaBase64`, agent retorna texto → assert pipeline NÃO duplica msg in (já criada pelo /inbound), só persiste a msg out.
10. **Histórico montado corretamente**: pré-condição 5 linhas n8n_chat_histories prévias → assert `runAgent` foi chamado com `historico:[5 items]` na ordem `user/assistant/...` correta.
11. **Cadastro vs Tattoo dados shape**: agent_usado='cadastro' → UPDATE conversa com `dados_cadastro` mergeado, `dados_coletados` intacto. agent_usado='tattoo' → inverso.

(11 cenários — 1 a mais que estimei, vale o overlap.)

### 5.5 Unit — `tests/agent/route-runagent.test.mjs` (~3 cenários)

Cobertura do refactor. Garante que `runAgent` extraído funciona stand-alone:

- Chama `runAgent` direto sem HTTP, valida resposta shape `{ ok, resposta_cliente, ... }`.
- Confirma side-effects de Proposta (executeOrchestration) ainda rodam.
- Confirma side-effects de Portfolio (executePortfolioIntent) ainda rodam.

Tests existentes (`route.test.mjs`, `route-orchestrator.test.mjs`, `route-portfolio-orchestrator.test.mjs`) continuam testando via HTTP `onRequest` — devem passar intactos.

### 5.6 Smoke E2E real (manual, gate final)

**Pré-requisito:** preview deploy do branch CF Pages — `<branch>.inkflow-saas.pages.dev`. Auto-gerado por commit. Endpoint disponível em `https://<branch>.inkflow-saas.pages.dev/api/whatsapp/inbound`.

```
Setup (~30min):
1. Branch pushada → CF Pages preview build OK.
2. Criar tenant fixture no Supabase (ou reusar dev tenant existing):
   - tatuador_telegram_chat_id = chat de teste do Leandro
   - evo_instance = 'inkflow_test_sub4'
   - config_agente OK, config_precificacao OK, sinal_percentual=30.
3. POST /api/evo-create-instance { instanceName:'inkflow_test_sub4', tenant_id:<id> }
   - Cria instância no Evolution central.
4. PATCH webhook desse tenant DIRETO no Evolution apontando pra
   https://<branch>.inkflow-saas.pages.dev/api/whatsapp/inbound:
     curl -X POST $EVO_BASE_URL/webhook/set/inkflow_test_sub4 \
       -H "apikey: $EVO_APIKEY" \
       -d '{"webhook":{"enabled":true,"url":"<preview>","webhookByEvents":false,
            "webhookBase64":true,"events":["MESSAGES_UPSERT"],
            "headers":{"x-webhook-secret":"<WEBHOOK_SECRET>"}}}'
5. Escanear QR no celular teste.

Execução golden path:
- "oi quero uma tattoo" → bot pede descrição.
- Manda foto de referência → bot persiste base64 (verificar no Supabase) + responde.
- Completa fluxo: descrição + tamanho + local → handoff → cadastro.
- "Joao Silva, 12/03/1995, joao@x.com" → handoff aguardando_tatuador.
- Verifica Telegram tatuador: orcamento chegou com formato correto.
- Tatuador responde "aceitar:<orcid>:300" no Telegram → estado vira propondo_valor.
- Cliente "fechado" → escolhe horário → reservar → recebe link MP.
- Manda mensagem extra em aguardando_sinal → bot responde (NÃO terminal).
- Manda mensagem em aguardando_tatuador (forçar via dashboard) → bot calado +
  Telegram notify tatuador.

Validações pós-fluxo:
- Supabase n8n_chat_histories: in+out persistidas, status='processed' em todas,
  evo_message_id populado nas in.
- conversas.last_msg_at atualizando (trigger automático).
- Sem alerta admin (pipeline failed).
- Custo OpenAI razoável (< $0.30 pra fluxo completo).

Cleanup:
- DELETE conversa fixture (cuidado pra não deletar tenant — reusar pra Sub-4.2).
- Manter instância Evolution + webhook apontando pra preview pra Sub-4.2 testar
  cutover incremental antes de tocar webhook prod.
```

### 5.7 Gate Sub-4.1 → Sub-4.2

```
[ ] Migration 2026-05-09-sub4-1-n8n-chat-evo.sql aplicada (dev branch + main branch Supabase)
[ ] Unit parser: 12/12 pass
[ ] Unit inbound: 6/6 pass
[ ] Unit route.runAgent: 3/3 pass
[ ] Integration pipeline: 11/11 pass
[ ] Suite existing: 372+/372+ pass (sem regressão Sub-3.x)
[ ] Smoke E2E real: golden path completo OK
[ ] Telegram tatuador recebe orcamento na transição cadastro→aguardando_tatuador
[ ] Bot fica calado em estado terminal + Telegram notify funciona
[ ] Mídia base64 persistida corretamente
[ ] Custo OpenAI eval < $0.30 por fluxo full
```

## Files

### Files NOVOS (8)

```
supabase/migrations/2026-05-09-sub4-1-n8n-chat-evo.sql       (~30 LOC SQL)
functions/api/whatsapp/inbound.js                              (~80 LOC)
functions/_lib/evolution-parser.js                             (~60 LOC)
functions/_lib/whatsapp-pipeline.js                            (~280 LOC)
functions/_lib/evolution-send.js                               (~70 LOC) — sendText + sendMedia
tests/lib/evolution-parser.test.mjs                            (~12 cenários)
tests/lib/whatsapp-pipeline.test.mjs                           (~11 cenários)
tests/api/whatsapp/inbound.test.mjs                            (~6 cenários)
```

(Bônus opcional, não bloqueante: `scripts/smoke-sub4-1-direcionado.sh` — wrapper curl pra testar endpoint local sem WhatsApp real.)

### Files EDITADOS (3)

```
functions/api/agent/route.js
  → Extrair runAgent({...}) como função pura exportável.
  → onRequest vira wrapper de ~30-50 LOC chamando runAgent.
  → Sem mudança funcional — tests existentes devem passar intactos.

functions/_lib/telegram.js
  → Adicionar sendTelegramTo(env, chatId, text) parametrizado.
  → sendTelegramAlert continua igual (usa env.TELEGRAM_CHAT_ID admin).

tests/agent/route.test.mjs (e talvez companions)
  → Eventuais ajustes de import se algum teste importava interno
    de route.js. Provavelmente ZERO ajustes — onRequest exposta intacta.
```

### Files NÃO TOCADOS (sanity check)

```
functions/api/agent/router.js                              ← intacto (Sub-3.x cobriu)
functions/api/agent/agents/{tattoo,cadastro,proposta}.js   ← intacto
functions/api/agent/_lib/*                                 ← intacto
functions/_lib/prompts/coleta/**                           ← intacto
functions/api/tools/* (incluindo enviar-orcamento-tatuador) ← intacto
functions/api/telegram/{webhook,reentrada}.js              ← intacto
functions/api/evo-create-instance.js                       ← intacto Sub-4.1, Sub-4.2 muda N8N_WEBHOOK
functions/api/webhooks/mp-sinal.js                         ← intacto
functions/api/conversas/{list,thread}.js                   ← intacto (continuam lendo n8n_chat_histories)
n8n workflow MEU NOVO WORK - SAAS                          ← intacto Sub-4.1
```

## Ordem de implementação sugerida (TDD-friendly, plan vai detalhar)

```
Fase 1 — Fundação (~1.5h)
  [1] Validar shape real n8n_chat_histories via supabase MCP / psql query
  [2] Migration 2026-05-09-sub4-1-n8n-chat-evo.sql + apply em dev branch
  [3] Unit tests evolution-parser.test.mjs (red)
  [4] evolution-parser.js (green)
  [5] evolution-send.js (sem testes — thin wrapper, smoke cobre)
  [6] _lib/telegram.js: adicionar sendTelegramTo

Fase 2 — Refactor route.js (~1h)
  [7] Extrair runAgent({...}) de route.js, onRequest vira wrapper
  [8] Unit tests route-runagent.test.mjs (3 cenários)
  [9] Suite full pass — confirmar zero regressão Sub-3.x

Fase 3 — Pipeline (~3-4h)
  [10] Skeleton whatsapp-pipeline.js (deps injection, etapas vazias)
  [11] Integration tests whatsapp-pipeline.test.mjs (red — todos 11)
  [12] Implementa etapas 1-3 (load conversa, terminal, historico)
  [13] Implementa etapas 4-6 (runAgent, UPDATE conversa, INSERT out)
  [14] Implementa etapas 7-9 (Evolution outbound, handoff orcamento, status processed)
  [15] Pipeline tests 11/11 green
  [16] Tratamento de erro (catch + sendTelegramAdmin)

Fase 4 — Endpoint (~1.5h)
  [17] Unit tests inbound.test.mjs (red)
  [18] inbound.js (green)
  [19] Verificar suite completa: 372+ + ~32 novos = 404+ tests pass

Fase 5 — Smoke E2E (~1h)
  [20] Push branch → preview deploy CF Pages
  [21] Setup tenant fixture + apontar webhook pra preview URL
  [22] Smoke golden path completo
  [23] Validar Supabase + Telegram + custos

Fase 6 — Wrap-up (~0.5h)
  [24] PR description com checklist gate Sub-4.1 → Sub-4.2
  [25] Atualizar memory project_agente_autonomo.md com status Sub-4.1 DONE
  [26] Anotar follow-ups Sub-4.2 (apontar webhook prod, descomissionar n8n)
```

**Estimativa total:** ~8-9h de execução pura. Buffer 30% pra surpresas (~12h).

## Riscos identificados

```
R1 — PostgREST resolution=ignore-duplicates: comportamento exato em conflict
     pode variar (retorna 201 vazio? 409? 200?). Mitigação: validar via curl
     direto no Fase 1 antes de cravar lógica em inbound.js. Fallback: SELECT
     antes do INSERT (1 round-trip a mais).

R2 — Race entre 2 msgs cliente em < 2s. Mitigação: aceito YAGNI Sub-4.1.
     Acompanhar em smoke; se reproduzir, P2 follow-up Sub-4.3.

R3 — waitUntil killed se exceder ~30s pós-response. Mitigação: log estruturado
     + cron Sub-4.3 reprocessa stuck. NÃO bloqueia Sub-4.1.

R4 — Evolution v2.3.7 payload pode ter campo extra/diferente do assumido.
     Mitigação: smoke E2E captura payload real, parser ajustado se preciso.

R5 — enviar-orcamento-tatuador depende de tenants.tatuador_telegram_chat_id.
     Tenants antigos podem não ter. Mitigação: pipeline checa antes;
     sendTelegramAdmin warning se faltar; cliente recebe resposta normal,
     só tatuador não é notificado. Não trava fluxo.

R6 — Refactor runAgent em route.js: edit em arquivo testado em prod.
     Mitigação: tests existentes (~372/372) devem passar intactos pela
     extração — se algum quebrar, sinal claro de regressão.

R7 — Mídia base64 > 1MB no JSONB pode ficar pesado. Mitigação: truncar em
     800KB no parser + warning. Sub-4.3 migra pra Storage.

R8 — Naming débito: tabela "n8n_chat_histories" carrega n8n no nome
     pos-cutover. Mitigação: cosmético, P3 follow-up (rename + view alias
     pra retro-compat das functions que leem dela).

R9 — supaFetch helper: confirmar export em functions/api/tools/_tool-helpers.js
     ou criar versão genérica em functions/_lib/supabase.js. Resolver Fase 1.
```

## Out-of-scope explícito

```
✗ Cutover (apontar webhook Evolution prod pro novo endpoint) — Sub-4.2
✗ Descomissionar n8n container — Sub-4.2
✗ Cron de retry pra mensagens stuck — Sub-4.3
✗ pg_advisory_lock por (tenant, telefone) — Sub-4.3
✗ Migrar mídia pra Supabase Storage — Sub-4.3
✗ Reentrada bot por timeout — P2 follow-up
✗ Multimodal: passar imagem pro agent — P2 follow-up
✗ Rename n8n_chat_histories → chat_history — P3
✗ Métricas formais de latência/observability — Sub-4.3
✗ Mexer em chat_messages tabela legada — fora do roadmap
```

## Próxima ação

`/plan docs/superpowers/specs/2026-05-09-sub4-1-whatsapp-inbound-design.md` em sessão fresca (per `feedback_plan_aba_limpa`).
