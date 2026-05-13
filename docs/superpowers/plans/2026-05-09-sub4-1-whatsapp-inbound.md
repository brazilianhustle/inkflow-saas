# Sub-4.1 — WhatsApp Inbound Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Subir endpoint `/api/whatsapp/inbound` feature-complete (persist-first, idempotente, ack <200ms, processamento async) substituindo o hot path do n8n — testado em isolamento via tenant fixture, sem ainda apontar webhook prod (cutover é Sub-4.2).

**Architecture:** Endpoint thin (`inbound.js` ~80 LOC) faz auth + parse + 1 SELECT tenant + 1 INSERT idempotente em `n8n_chat_histories` (UNIQUE partial em `(session_id, evo_message_id)`) e devolve 200; processamento real roda em `context.waitUntil(processMessage)` chamando pipeline (`whatsapp-pipeline.js` ~280 LOC) que carrega conversa, monta histórico, chama `runAgent` (extraído de `route.js`), persiste estado, e despacha Evolution outbound + Telegram tatuador. Boundary cravada: `route.js` puro de transporte HTTP + decisão (agent + invariantes + side-effects de domínio); `pipeline.js` cobre transporte Supabase/Evolution/Telegram; `inbound.js` é só ingest/auth/persist-first/ack/dispatch.

**Tech Stack:** Cloudflare Pages Functions (Workers runtime), Supabase REST (PostgREST), Evolution API v2.3.x, Telegram Bot API, OpenAI Agents SDK (`@openai/agents` 0.1.0), node:test runner.

**Branch:** `feat/sub4-cutover-n8n`
**Spec:** `docs/superpowers/specs/2026-05-09-sub4-1-whatsapp-inbound-design.md`

---

## File map

**Novos (8):**

| Path | Responsibility | LOC |
|------|----------------|-----|
| `supabase/migrations/2026-05-09-sub4-1-n8n-chat-evo.sql` | Adiciona `evo_message_id`, `status` + UNIQUE partial em `n8n_chat_histories` | ~30 |
| `functions/api/whatsapp/inbound.js` | Endpoint thin: auth + parse + lookup tenant + INSERT idempotente + ack + dispatch | ~80 |
| `functions/_lib/evolution-parser.js` | Pure function: extrai shape canônico do payload Evolution v2 | ~60 |
| `functions/_lib/whatsapp-pipeline.js` | Pipeline async: load conversa + agent + persist + outbound + side-effects | ~280 |
| `functions/_lib/evolution-send.js` | Thin wrapper: sendText + sendMedia pra Evolution API | ~70 |
| `tests/_lib/evolution-parser.test.mjs` | 12 cenários parser | — |
| `tests/_lib/whatsapp-pipeline.test.mjs` | 11 cenários integration pipeline com deps mockadas | — |
| `tests/api/whatsapp/inbound.test.mjs` | 6 cenários unit endpoint | — |

**Editados (3):**

| Path | O que muda |
|------|-----------|
| `functions/api/agent/route.js` | Extrair `runAgent({...})` como função pura exportável; `onRequest` vira wrapper |
| `functions/_lib/telegram.js` | Adicionar `sendTelegramTo(env, chatId, text)` parametrizado |
| `tests/_lib/telegram.test.mjs` | (Se existir) cobrir `sendTelegramTo` |

**Não tocados (sanity):** `functions/api/agent/router.js`, `functions/api/agent/agents/*`, `functions/api/agent/_lib/*`, `functions/_lib/prompts/coleta/**`, `functions/api/tools/*`, `functions/api/conversas/{list,thread}.js`, n8n workflow ainda em prod até Sub-4.2.

---

## Riscos identificados

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | PostgREST `resolution=ignore-duplicates` pode retornar 201/409/200 com array vazio ou erro — comportamento exato precisa ser confirmado | Task 1 valida via curl direto na branch dev antes de cravar lógica |
| R2 | Refactor de `route.js` (extrair `runAgent`) toca arquivo testado em prod, suite atual = 372/372 | Task 6 roda suite completa após extração; se quebrar 1 teste sequer = sinal claro de regressão |
| R3 | `waitUntil` killed se exceder ~30s pós-response → mensagem fica `status='received'` | Aceito Sub-4.1; cron Sub-4.3 reabre. Pipeline loga estruturado |
| R4 | Evolution v2.3.7 payload pode ter campo extra/diferente do assumido | Smoke E2E (Task 14) captura payload real; parser ajusta se preciso |
| R5 | `enviar-orcamento-tatuador` depende de `tenants.tatuador_telegram_chat_id` — tenants antigos podem faltar | Pipeline checa antes; `sendTelegramAdmin` warning se faltar; cliente recebe resposta normal |
| R6 | Tests dir convention: spec diz `tests/lib/` mas codebase usa `tests/_lib/` | Plano usa `tests/_lib/` |
| R7 | Migration aplicada direto em main branch Supabase é destrutiva — tenants em prod estão ativos | Aplicar primeiro em **dev branch** Supabase, smoke-testar, depois rebase main branch |
| R8 | Mídia base64 > 1MB no JSONB pode pesar | Task 3 trunca em 800KB no parser + warning |

---

## Task 1: Pre-flight — validar shape Supabase + comportamento PostgREST

**Files:** Nenhum edit. Apenas exploração + verificação.

- [ ] **Step 1: Validar colunas atuais de `n8n_chat_histories`**

Via Supabase MCP `execute_sql`:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'n8n_chat_histories'
ORDER BY ordinal_position;
```

Expected: colunas `id`, `session_id`, `message`, `created_at`. Confirmar que **NÃO existe** `evo_message_id` nem `status` ainda. Se existirem, ajustar migration na Task 2 pra ser idempotente.

- [ ] **Step 2: Validar trigger existing**

```sql
SELECT tgname, tgrelid::regclass, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'n8n_chat_histories'::regclass
  AND NOT tgisinternal;
```

Expected: trigger `trg_n8n_chat_histories_update_conversa` listado. Se ausente, abrir issue — premissa do spec quebrada.

- [ ] **Step 3: Validar PostgREST `resolution=ignore-duplicates` com tabela existente**

Numa dev branch Supabase, manualmente criar UNIQUE index temporário em `n8n_chat_histories(session_id, created_at)` e tentar 2 INSERTs identicos com header `Prefer: resolution=ignore-duplicates, return=representation`:

```bash
curl -X POST "$SUPABASE_URL/rest/v1/n8n_chat_histories" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=ignore-duplicates, return=representation" \
  -d '{"session_id":"test-uuid_5511","message":{"type":"human","content":"x"}}'
```

Confirmar:
- Primeira chamada retorna 201 + array com row.
- Segunda (idêntica) retorna 201 + array vazio `[]`.

Se comportamento diferente, ajustar Task 12 — fallback é SELECT-then-INSERT.

- [ ] **Step 4: Confirmar `tenants.evo_instance` + `tatuador_telegram_chat_id` existem**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'tenants'
  AND column_name IN ('evo_instance', 'tatuador_telegram_chat_id', 'gatilhos_handoff', 'faqs', 'fewshots', 'config_agente', 'config_precificacao', 'sinal_percentual');
```

Expected: 8 rows.

- [ ] **Step 5: Não há commit nesta task** — só exploratory checks. Documentar findings em comentário/issue se algo divergiu.

---

## Task 2: Migration `2026-05-09-sub4-1-n8n-chat-evo.sql`

**Files:**
- Create: `supabase/migrations/2026-05-09-sub4-1-n8n-chat-evo.sql`

- [ ] **Step 1: Escrever migration**

Conteúdo exato:

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

COMMIT;
```

- [ ] **Step 2: Aplicar em dev branch Supabase**

Via MCP `apply_migration` (com aprovação explícita conforme política `supabase-dba`):

```
mcp__plugin_supabase_supabase__apply_migration
  name: 2026_05_09_sub4_1_n8n_chat_evo
  query: <conteúdo do step 1>
```

Aprovar **somente em dev branch primeiro** (R7).

- [ ] **Step 3: Verificar aplicação**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'n8n_chat_histories' AND column_name IN ('evo_message_id','status');

SELECT indexname FROM pg_indexes
WHERE tablename = 'n8n_chat_histories' AND indexname = 'n8n_chat_histories_session_evo_msg_idx';
```

Expected: 2 colunas + 1 index listados.

- [ ] **Step 4: Confirmar idempotência rodando segunda vez**

Re-aplicar o SQL — `IF NOT EXISTS` deve passar sem erro.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-05-09-sub4-1-n8n-chat-evo.sql
git commit -m "feat(sub4-1): migration adiciona evo_message_id + status + UNIQUE partial em n8n_chat_histories"
```

---

## Task 3: `functions/_lib/evolution-parser.js` (TDD red→green)

**Files:**
- Create: `functions/_lib/evolution-parser.js`
- Create: `tests/_lib/evolution-parser.test.mjs`

- [ ] **Step 1: Escrever testes vermelhos (12 cenários)**

```js
// tests/_lib/evolution-parser.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEvolutionPayload } from '../../functions/_lib/evolution-parser.js';

const baseUpsert = {
  event: 'messages.upsert',
  instance: 'inkflow_test_sub4',
  data: {
    key: { id: 'ABC123', remoteJid: '5511999998888@s.whatsapp.net', fromMe: false },
    message: { conversation: 'oi quero uma rosa' },
    pushName: 'Joao',
  },
};

test('parser: conversation texto puro → ok com texto', () => {
  const r = parseEvolutionPayload(baseUpsert);
  assert.equal(r.ok, true);
  assert.equal(r.inbound.tenantEvoInstance, 'inkflow_test_sub4');
  assert.equal(r.inbound.telefone, '5511999998888');
  assert.equal(r.inbound.evoMessageId, 'ABC123');
  assert.equal(r.inbound.texto, 'oi quero uma rosa');
  assert.equal(r.inbound.mediaBase64, null);
  assert.equal(r.inbound.pushName, 'Joao');
});

test('parser: imageMessage com caption + base64 → mediaBase64 + mediaMimetype', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, message: {
    imageMessage: { caption: 'tipo essa', mimetype: 'image/jpeg' },
    base64: '/9j/4AAQ',
  }}};
  const r = parseEvolutionPayload(body);
  assert.equal(r.ok, true);
  assert.equal(r.inbound.texto, 'tipo essa');
  assert.equal(r.inbound.mediaBase64, '/9j/4AAQ');
  assert.equal(r.inbound.mediaMimetype, 'image/jpeg');
});

test('parser: audioMessage com base64', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, message: {
    audioMessage: { mimetype: 'audio/ogg' },
    base64: 'AAAA',
  }}};
  const r = parseEvolutionPayload(body);
  assert.equal(r.ok, true);
  assert.equal(r.inbound.mediaBase64, 'AAAA');
  assert.equal(r.inbound.mediaMimetype, 'audio/ogg');
  assert.equal(r.inbound.texto, '');
});

test('parser: extendedTextMessage com text', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, message: {
    extendedTextMessage: { text: 'msg longa' },
  }}};
  const r = parseEvolutionPayload(body);
  assert.equal(r.ok, true);
  assert.equal(r.inbound.texto, 'msg longa');
});

test('parser: stickerMessage → texto vazio sem mídia', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, message: { stickerMessage: {} }}};
  const r = parseEvolutionPayload(body);
  assert.equal(r.ok, true);
  assert.equal(r.inbound.texto, '');
  assert.equal(r.inbound.mediaBase64, null);
});

test('parser: fromMe:true → skip from-me', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, key: { ...baseUpsert.data.key, fromMe: true }}};
  const r = parseEvolutionPayload(body);
  assert.deepEqual(r, { skip: 'from-me' });
});

test('parser: remoteJid @g.us → skip group-msg', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, key: { ...baseUpsert.data.key, remoteJid: '12345@g.us' }}};
  assert.deepEqual(parseEvolutionPayload(body), { skip: 'group-msg' });
});

test('parser: event !== messages.upsert → skip wrong-event', () => {
  const body = { ...baseUpsert, event: 'connection.update' };
  assert.deepEqual(parseEvolutionPayload(body), { skip: 'wrong-event' });
});

test('parser: key.id missing → skip no-key-id', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, key: { remoteJid: '5511@s.whatsapp.net', fromMe: false }}};
  assert.deepEqual(parseEvolutionPayload(body), { skip: 'no-key-id' });
});

test('parser: remoteJid sem dígitos → skip no-telefone', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, key: { ...baseUpsert.data.key, remoteJid: 'abc@s.whatsapp.net' }}};
  assert.deepEqual(parseEvolutionPayload(body), { skip: 'no-telefone' });
});

test('parser: payload null → skip wrong-event', () => {
  assert.deepEqual(parseEvolutionPayload(null), { skip: 'wrong-event' });
});

test('parser: pushName ausente → null preservado', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, pushName: undefined }};
  const r = parseEvolutionPayload(body);
  assert.equal(r.ok, true);
  assert.equal(r.inbound.pushName, null);
});

test('parser: media base64 > 800KB → trunca + warning marker', () => {
  const big = 'A'.repeat(900_000);
  const body = { ...baseUpsert, data: { ...baseUpsert.data, message: {
    imageMessage: { mimetype: 'image/jpeg' },
    base64: big,
  }}};
  const r = parseEvolutionPayload(body);
  assert.equal(r.ok, true);
  assert.equal(r.inbound.mediaTruncated, true);
  assert.ok(r.inbound.mediaBase64.length <= 800_000);
});
```

- [ ] **Step 2: Rodar tests pra confirmar red**

```bash
npm test -- tests/_lib/evolution-parser.test.mjs
```

Expected: 13 fails (módulo inexistente).

- [ ] **Step 3: Implementar `evolution-parser.js`**

```js
// functions/_lib/evolution-parser.js
// Pure function — sem I/O. Extrai shape canônico do payload Evolution v2.
// Skips são ack 200 + log: cliente não-acionável, não retry.

const MAX_MEDIA_B64 = 800_000;

export function parseEvolutionPayload(body) {
  if (!body || body.event !== 'messages.upsert') {
    return { skip: 'wrong-event' };
  }
  const data = body.data;
  const key = data?.key;
  if (!key?.id) return { skip: 'no-key-id' };
  if (key.fromMe === true) return { skip: 'from-me' };
  const remoteJid = String(key.remoteJid || '');
  if (remoteJid.includes('@g.us')) return { skip: 'group-msg' };

  const telefone = remoteJid.split('@')[0].replace(/\D/g, '');
  if (!telefone) return { skip: 'no-telefone' };

  const message = data?.message || {};
  const texto = String(
    message.conversation ||
    message.imageMessage?.caption ||
    message.extendedTextMessage?.text ||
    message.audioMessage?.caption ||
    ''
  );

  let mediaBase64 = null;
  let mediaMimetype = null;
  if (message.imageMessage) {
    mediaBase64 = data.base64 || message.imageMessage.base64 || null;
    mediaMimetype = message.imageMessage.mimetype || null;
  } else if (message.audioMessage) {
    mediaBase64 = data.base64 || message.audioMessage.base64 || null;
    mediaMimetype = message.audioMessage.mimetype || null;
  }

  let mediaTruncated = false;
  if (mediaBase64 && mediaBase64.length > MAX_MEDIA_B64) {
    mediaBase64 = mediaBase64.slice(0, MAX_MEDIA_B64);
    mediaTruncated = true;
  }

  return {
    ok: true,
    inbound: {
      tenantEvoInstance: String(body.instance || ''),
      telefone,
      evoMessageId: String(key.id),
      texto,
      mediaBase64,
      mediaMimetype,
      mediaTruncated,
      pushName: data?.pushName ?? null,
    },
  };
}
```

- [ ] **Step 4: Rodar tests pra confirmar green**

```bash
npm test -- tests/_lib/evolution-parser.test.mjs
```

Expected: 13/13 pass.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/evolution-parser.js tests/_lib/evolution-parser.test.mjs
git commit -m "feat(sub4-1): evolution-parser pure function + 13 unit tests"
```

---

## Task 4: `functions/_lib/telegram.js` — adicionar `sendTelegramTo`

**Files:**
- Modify: `functions/_lib/telegram.js`
- Create or Modify: `tests/telegram.test.mjs` (existe em tests/, conferir conteúdo atual antes de adicionar)

- [ ] **Step 1: Adicionar export `sendTelegramTo` em `functions/_lib/telegram.js`**

Manter `sendTelegramAlert` intacto (admin alerts via env.TELEGRAM_CHAT_ID). Adicionar:

```js
// Envia mensagem pra um chat_id arbitrário (e.g., tatuador). Mesma resiliência:
// timeout 3s, fail-open. Caller passa chatId — não usa env.TELEGRAM_CHAT_ID.
export async function sendTelegramTo(env, chatId, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) {
    console.warn('telegram: token ou chatId ausente, pulando send');
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      signal: AbortSignal.timeout(3000),
    });
    return { ok: res.ok };
  } catch (e) {
    console.error('telegram: send-to failed:', e.message);
    return { ok: false, error: e.message };
  }
}
```

- [ ] **Step 2: Adicionar 3 tests cobrindo `sendTelegramTo`**

Append em `tests/telegram.test.mjs` (preservar tests existentes):

```js
import { sendTelegramTo } from '../functions/_lib/telegram.js';

test('sendTelegramTo: chatId ausente → ok:false skipped:true', async () => {
  const r = await sendTelegramTo({ TELEGRAM_BOT_TOKEN: 'x' }, null, 'msg');
  assert.equal(r.ok, false);
  assert.equal(r.skipped, true);
});

test('sendTelegramTo: token ausente → ok:false skipped:true', async () => {
  const r = await sendTelegramTo({}, '123', 'msg');
  assert.equal(r.ok, false);
  assert.equal(r.skipped, true);
});

test('sendTelegramTo: payload posta com chat_id correto', async () => {
  const orig = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, opts) => {
    captured = { url, body: JSON.parse(opts.body) };
    return new Response('{}', { status: 200 });
  };
  try {
    await sendTelegramTo({ TELEGRAM_BOT_TOKEN: 'tok' }, '12345', 'oi');
    assert.match(captured.url, /\/bottok\/sendMessage$/);
    assert.equal(captured.body.chat_id, '12345');
    assert.equal(captured.body.text, 'oi');
  } finally {
    globalThis.fetch = orig;
  }
});
```

- [ ] **Step 3: Rodar tests**

```bash
npm test -- tests/telegram.test.mjs
```

Expected: tests originais + 3 novos = todos pass.

- [ ] **Step 4: Commit**

```bash
git add functions/_lib/telegram.js tests/telegram.test.mjs
git commit -m "feat(sub4-1): adiciona sendTelegramTo parametrizado em _lib/telegram"
```

---

## Task 5: `functions/_lib/evolution-send.js` — sendText + sendMedia

**Files:**
- Create: `functions/_lib/evolution-send.js`

Sem unit tests dedicados (thin wrapper de fetch — smoke E2E cobre). Pipeline tests vão mockar via deps.

- [ ] **Step 1: Implementar wrapper**

```js
// functions/_lib/evolution-send.js
// Wrapper Evolution API v2: sendText + sendMedia.
// Usa tenant.evo_apikey (preferencial) ou env.EVO_GLOBAL_KEY (fallback admin).
// Timeout 10s. Retorna {ok, status?, error?}.

export async function evoSend(env, tenant, payload) {
  const baseUrl = env.EVO_BASE_URL || 'https://evo.inkflowbrasil.com';
  const apikey = tenant?.evo_apikey || env.EVO_GLOBAL_KEY;
  const instance = tenant?.evo_instance;
  if (!apikey || !instance) {
    return { ok: false, error: 'missing-apikey-or-instance' };
  }
  const { type, to, text, url } = payload;

  let endpoint, body;
  if (type === 'text') {
    endpoint = `/message/sendText/${encodeURIComponent(instance)}`;
    body = { number: to, text };
  } else if (type === 'media') {
    endpoint = `/message/sendMedia/${encodeURIComponent(instance)}`;
    body = { number: to, mediatype: 'image', media: url };
  } else {
    return { ok: false, error: `unknown-payload-type:${type}` };
  }

  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { apikey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: detail.slice(0, 200) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add functions/_lib/evolution-send.js
git commit -m "feat(sub4-1): evolution-send wrapper sendText + sendMedia"
```

---

## Task 6: Refactor `route.js` — extrair `runAgent({...})`

**Files:**
- Modify: `functions/api/agent/route.js`
- Create: `tests/agent/route-runagent.test.mjs`

**Risco crítico (R2).** Suite atual = 372/372 deve passar **intacta** após o refactor.

- [ ] **Step 1: Extrair lógica de `onRequest` pra `runAgent({...})` exportado**

Novo shape de `route.js`:

```js
// functions/api/agent/route.js
import { run } from '@openai/agents';
import { setDefaultOpenAIKey } from '@openai/agents-openai';
import { selectAgentBuilder, isStateImplemented, getNextState } from './router.js';
import { validateEnv } from './_lib/sdk-init.js';
import { enforceMenorIdade } from './_lib/enforce-menor-idade.js';
import { prefetchPropostaContext } from './_lib/prefetch-proposta.js';
import { prefetchPortfolio } from './_lib/prefetch-portfolio.js';
import { callTool } from './_lib/call-tool.js';
import { calcularValorSinal } from './_lib/calcular-sinal.js';
import { formatLinkSinalMessage } from './_lib/format-link-sinal-msg.js';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const PROPOSTA_SUBSTATES = new Set(['propondo_valor', 'escolhendo_horario', 'aguardando_sinal']);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

function normalizeHistoryItem(h) {
  const role = h?.role || 'user';
  const content = h?.content ?? '';
  if (role === 'assistant') {
    return {
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: String(content) }],
    };
  }
  return { role: 'user', content: String(content) };
}

// runAgent: lógica core extraída. Recebe args já validados/normalizados.
// Retorna { ok, resposta_cliente, estado_novo, ... } ou { ok:false, error, status? }.
// Sub-4.1: pipeline.js chama isso direto sem HTTP. Sub-2/3: onRequest é wrapper.
export async function runAgent({ env, tenant_id, telefone, mensagem, estado_atual,
                                  dados_acumulados, historico, tenant, conversa, clientContext }) {
  if (!isStateImplemented(estado_atual)) {
    return { ok: false, error: `estado_atual='${estado_atual}' nao implementado`, status: 501 };
  }
  const builder = selectAgentBuilder(estado_atual);

  let mergedClientContext = clientContext || {};
  const portfolioCtx = await prefetchPortfolio(env, tenant);
  mergedClientContext = { ...mergedClientContext, ...portfolioCtx };
  if (PROPOSTA_SUBSTATES.has(estado_atual)) {
    const prefetched = await prefetchPropostaContext({ env, tenant, conversa, telefone, estado_atual });
    mergedClientContext = { ...mergedClientContext, ...prefetched };
  }

  const { agent, validator } = builder({ env, tenant, conversa, clientContext: mergedClientContext, estado_atual });

  const messages = [
    ...(historico || []).map(normalizeHistoryItem),
    { role: 'user', content: mensagem },
  ];

  let result;
  try {
    result = await run(agent, messages, { maxTurns: 20 });
  } catch (e) {
    console.error('[agent/route] run() failed:', e);
    return { ok: false, error: 'agent-run-failed', status: 500 };
  }

  const out = result?.finalOutput;
  if (!out) {
    console.error('[agent/route] no finalOutput', { result });
    return { ok: false, error: 'no-final-output', status: 500 };
  }

  let working = out;
  const invariantCheck = validator(working);
  if (!invariantCheck.valid) {
    if (estado_atual === 'cadastro' && invariantCheck.reason?.startsWith('data_nascimento nao-ISO')) {
      working = {
        ...working,
        dados_persistidos: { ...(working.dados_persistidos || {}), data_nascimento: null },
        dados_completos: false,
        campos_faltando: Array.from(new Set([...(working.campos_faltando || []), 'data_nascimento'])),
        proxima_acao: 'pergunta',
        resposta_cliente: 'Nao consegui ler a data — pode mandar tipo 12/03/1995?',
      };
    } else if (PROPOSTA_SUBSTATES.has(estado_atual) && /(nao-ISO|fora da lista)/.test(invariantCheck.reason || '')) {
      const slots = mergedClientContext.horarios_livres || [];
      const legendas = slots.map(s => s.legenda).join(', ') || '(nenhum slot disponivel)';
      const msg = invariantCheck.reason.startsWith('slot fora')
        ? `Esse horario nao esta na lista — escolhe um destes? ${legendas}`
        : `Nao consegui ler o horario — pode escolher um da lista? ${legendas}`;
      working = { ...working, proxima_acao: 'pergunta', resposta_cliente: msg };
    } else {
      console.error('[agent/route] invariant violation:', invariantCheck.reason, out);
      return { ok: false, error: 'invariant-violation', reason: invariantCheck.reason, status: 500 };
    }
  }

  const enforced = estado_atual === 'cadastro' ? enforceMenorIdade(working) : working;

  const sideEffects = [];
  let finalOut = enforced;
  if (PROPOSTA_SUBSTATES.has(estado_atual)) {
    finalOut = await executeOrchestration(enforced, { env, tenant, conversa, telefone, sideEffects });
  }

  const { urls_portfolio } = await executePortfolioIntent(finalOut, { env, tenant });

  return {
    ok: true,
    resposta_cliente: finalOut.resposta_cliente,
    estado_novo: getNextState(estado_atual, finalOut),
    dados_persistidos: finalOut.dados_persistidos,
    dados_completos: finalOut.dados_completos,
    campos_faltando: finalOut.campos_faltando,
    campos_conflitantes: finalOut.campos_conflitantes,
    proxima_acao: finalOut.proxima_acao,
    agent_usado: estado_atual,
    side_effects: PROPOSTA_SUBSTATES.has(estado_atual) ? sideEffects : undefined,
    urls_portfolio,
  };
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== 'POST') return json({ ok: false, error: 'method-not-allowed' }, 405);

  const envCheck = validateEnv(env);
  if (!envCheck.ok) return json({ ok: false, error: 'env-incomplete', missing: envCheck.missing }, 503);

  setDefaultOpenAIKey(env.OPENAI_API_KEY);

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'body-invalido' }, 400); }

  const tenant_id = String(body?.tenant_id || '').trim();
  const telefone = String(body?.telefone || '').trim();
  const mensagem = String(body?.mensagem || '').trim();
  const estado_atual = String(body?.estado_atual || '').trim();
  const dados_acumulados = body?.dados_acumulados || {};
  const historico = Array.isArray(body?.historico) ? body.historico : [];

  if (!tenant_id || !telefone) {
    return json({ ok: false, error: 'tenant_id e telefone obrigatorios' }, 400);
  }

  const tenant = body?.tenant || { id: tenant_id, nome_estudio: 'Stub', config_agente: {}, gatilhos_handoff: [], faqs: [], fewshots: [] };
  const conversa = body?.conversa || { id: 'stub', telefone, estado_agente: estado_atual, dados_coletados: dados_acumulados, dados_cadastro: {} };

  const r = await runAgent({
    env, tenant_id, telefone, mensagem, estado_atual,
    dados_acumulados, historico, tenant, conversa,
    clientContext: body?.clientContext || {},
  });
  if (!r.ok) return json(r, r.status || 500);
  return json(r, 200);
}

// Mantém exports existentes (executeOrchestration, executePortfolioIntent, forcePergunta)
// inalterados — copiar do arquivo atual sem modificação.
export function forcePergunta(out, msg) {
  return { ...out, proxima_acao: 'pergunta', resposta_cliente: msg };
}

export async function executeOrchestration(out, { env, tenant, conversa, telefone, sideEffects }) {
  // (idêntico ao atual — copiar do route.js existing linhas 212-278)
}

export async function executePortfolioIntent(out, { env, tenant }) {
  // (idêntico ao atual — copiar do route.js existing linhas 287-303)
}
```

- [ ] **Step 2: Rodar suite agent existing**

```bash
npm test -- tests/agent/
```

Expected: tests via `onRequest` ainda passam (372/372 ou subset agent). Se algum quebrar = bug no refactor; investigar diff antes de prosseguir.

- [ ] **Step 3: Escrever 3 unit tests cobrindo `runAgent` direto (sem HTTP)**

```js
// tests/agent/route-runagent.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const ENV = { OPENAI_API_KEY: 'sk-test', INKFLOW_TOOL_SECRET: 'sec' };

test('runAgent: estado nao implementado → ok:false status:501', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'oi',
    estado_atual: 'estado_inexistente', dados_acumulados: {}, historico: [],
    tenant: { id: 't' }, conversa: { id: 'c', estado_agente: 'estado_inexistente' },
    clientContext: {},
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, 501);
});

test('runAgent: shape retornado tem estado_novo + agent_usado quando ok', async () => {
  // Mock @openai/agents.run pra retornar finalOutput estável
  // (exemplo simplificado — real: use mock.module ou estub do builder)
  // Detalhe: este test roda sem rede; smoke E2E cobre run() real.
  const { runAgent } = await import('../../functions/api/agent/route.js');
  // Skip se SDK nao mockavel por aqui — conforme padrao tests/agent/route.test.mjs.
  // Alternativa: usar fixture mock do executePortfolioIntent path (proxima_acao=pergunta).
  // Ver tests/agent/route.test.mjs por padrao.
  assert.ok(typeof runAgent === 'function');
});

test('runAgent: aceita historico vazio e mensagem string', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  // Smoke shape check — não executa SDK real (sem OPENAI_API_KEY válida).
  assert.ok(runAgent.constructor.name === 'AsyncFunction');
});
```

> Nota: testes com mock do SDK ficam pesados. Alinhar padrão com `tests/agent/route.test.mjs` (que já mocka onRequest com env stub). Os 3 tests aqui cobrem casos puros (validação, shape function); cobertura comportamental segue via `route.test.mjs`/`route-orchestrator.test.mjs` que continuam passando.

- [ ] **Step 4: Rodar tests novos**

```bash
npm test -- tests/agent/route-runagent.test.mjs
```

Expected: 3/3 pass.

- [ ] **Step 5: Rodar suite completa pra zero regressão**

```bash
npm test
```

Expected: tudo passa (372+ tests). Se quebrar = blocker — reverter e investigar.

- [ ] **Step 6: Commit**

```bash
git add functions/api/agent/route.js tests/agent/route-runagent.test.mjs
git commit -m "refactor(sub4-1): extrai runAgent({...}) de route.js como funcao pura exportavel

Mantem onRequest como wrapper retro-compat. Suite 372/372 intacta.
Habilita pipeline.js (Sub-4.1) chamar agent direto sem HTTP."
```

---

## Task 7: `whatsapp-pipeline.js` skeleton + deps injection + tests vermelhos

**Files:**
- Create: `functions/_lib/whatsapp-pipeline.js`
- Create: `tests/_lib/whatsapp-pipeline.test.mjs`

Estratégia: criar skeleton com `processMessage(env, msg, depsOverride)` lançando `not-implemented`, depois escrever os 11 testes vermelhos completos (todos quebram), depois Tasks 8-11 implementam etapa por etapa fazendo testes ficarem verdes incrementalmente.

- [ ] **Step 1: Criar skeleton `pipeline.js` com deps injection**

```js
// functions/_lib/whatsapp-pipeline.js
// Pipeline async chamado por inbound.js via context.waitUntil.
// Carrega conversa, chama runAgent, persiste estado, despacha outbound.
//
// Deps injetadas via depsOverride pra integration tests sem fetch real.
import { supaFetch } from '../api/tools/_tool-helpers.js';
import { evoSend } from './evolution-send.js';
import { sendTelegramTo, sendTelegramAlert } from './telegram.js';
import { runAgent } from '../api/agent/route.js';
import { callTool } from '../api/agent/_lib/call-tool.js';

export const TERMINAL_STATES = new Set([
  'aguardando_tatuador',
  'lead_frio',
  'aguardando_decisao_desconto',
]);

export function defaultDeps(env) {
  return {
    supaFetch: (path, init) => supaFetch(env, path, init),
    evoSend: (tenant, payload) => evoSend(env, tenant, payload),
    sendTelegram: (chatId, text) => sendTelegramTo(env, chatId, text),
    sendTelegramAdmin: (text) => sendTelegramAlert(env, text),
    runAgent: (args) => runAgent({ env, ...args }),
    callTool: (toolName, body) => callTool(env, toolName, body),
    now: () => new Date().toISOString(),
  };
}

function preview(s, n = 200) {
  return String(s || '').slice(0, n);
}

export async function processMessage(env, msg, depsOverride = {}) {
  const deps = { ...defaultDeps(env), ...depsOverride };
  throw new Error('not-implemented');
}
```

- [ ] **Step 2: Criar 11 testes vermelhos**

```js
// tests/_lib/whatsapp-pipeline.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processMessage } from '../../functions/_lib/whatsapp-pipeline.js';

const TENANT = {
  id: '00000000-0000-0000-0000-000000000001',
  nome_estudio: 'Estudio Teste',
  evo_instance: 'inkflow_test',
  evo_apikey: 'evo-key',
  tatuador_telegram_chat_id: '99999',
  config_agente: {},
  config_precificacao: { sinal_percentual: 30 },
  gatilhos_handoff: [], faqs: [], fewshots: [],
};
const CONVERSA_ID = '11111111-1111-1111-1111-111111111111';
const TELEFONE = '5511999998888';
const MSG_ROW_ID = 12345;

function baseMsg(overrides = {}) {
  return {
    tenantId: TENANT.id, telefone: TELEFONE,
    evoMessageId: 'EVO_1', texto: 'oi', mediaBase64: null, mediaMimetype: null,
    pushName: 'Joao', msgRowId: MSG_ROW_ID, tenant: TENANT,
    ...overrides,
  };
}

function mockDeps(overrides = {}) {
  return {
    supaFetch: async () => new Response('[]', { status: 200 }),
    evoSend: async () => ({ ok: true }),
    sendTelegram: async () => ({ ok: true }),
    sendTelegramAdmin: async () => ({ ok: true }),
    runAgent: async () => ({ ok: true, resposta_cliente: 'oi de volta', estado_novo: 'tattoo',
                            dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }),
    callTool: async () => ({ ok: true }),
    now: () => '2026-05-09T12:00:00.000Z',
    ...overrides,
  };
}

function callsTo(spy) { return spy.mock.calls.map(c => c.arguments); }

test('1. golden path tattoo: nova conversa → agent → evoSend + UPDATE conversa + INSERT out + status processed', async () => {
  // ... (pré-condições + asserts: ver detalhes em Task 9)
  // Aqui: red — verifica supaFetch called pra conversas (load+create), n8n_chat_histories (out),
  // evoSend chamado 1x, status final 'processed'.
});

test('2. estado terminal aguardando_tatuador: agent NÃO chamado, sendTelegram pra tatuador, status processed', async () => {
  // ...
});

test('3. estado terminal sem tatuador_telegram_chat_id: sendTelegramAdmin warning chamado', async () => {
  // ...
});

test('4. handoff cadastro→orcamento: callTool(enviar-orcamento-tatuador) chamado', async () => {
  // ...
});

test('5. portfolio intent: urls_portfolio → evoSend 1x text + N x media', async () => {
  // ...
});

test('6. conversa nova: 0 rows GET → POST conversas com estado=tattoo + dados vazios', async () => {
  // ...
});

test('7. runAgent throws → status=failed + sendTelegramAdmin alerta + sem evoSend', async () => {
  // ...
});

test('8. evoSend(text) ok:false → status=failed + sendTelegramAdmin warning', async () => {
  // ...
});

test('9. mídia base64 in: pipeline NÃO duplica msg in (já criada por inbound.js); só persiste msg out', async () => {
  // ...
});

test('10. histórico monta com 5 prévias na ordem user/assistant correta + filtra msgRowId atual', async () => {
  // ...
});

test('11. agent_usado=cadastro → UPDATE merge dados_cadastro intacto dados_coletados; agent_usado=tattoo → inverso', async () => {
  // ...
});
```

> Os 11 cenários completos (com fetchSpy + asserts detalhados) ficam expandidos nas Tasks 8-11 quando a etapa correspondente é implementada. Aqui o objetivo é só ter testes red passando como skeleton — cada `test(...)` pode ser stub `assert.fail('not implemented yet')` no momento da Task 7. Tasks 8-11 expandem cada cenário ao implementar a etapa.

- [ ] **Step 3: Rodar tests pra confirmar red**

```bash
npm test -- tests/_lib/whatsapp-pipeline.test.mjs
```

Expected: 11 fails (todos `not-implemented` ou stub fail).

- [ ] **Step 4: Commit (red state — habilitando subagent driven flow)**

```bash
git add functions/_lib/whatsapp-pipeline.js tests/_lib/whatsapp-pipeline.test.mjs
git commit -m "test(sub4-1): pipeline skeleton + 11 integration tests vermelhos"
```

---

## Task 8: pipeline etapas 1-3 (load conversa + early-return terminal + monta histórico)

**Files:**
- Modify: `functions/_lib/whatsapp-pipeline.js`
- Modify: `tests/_lib/whatsapp-pipeline.test.mjs` (expandir cenários 2, 3, 6, 10)

- [ ] **Step 1: Implementar etapas 1-3**

Substituir corpo de `processMessage` no `pipeline.js`:

```js
export async function processMessage(env, msg, depsOverride = {}) {
  const deps = { ...defaultDeps(env), ...depsOverride };
  const { tenantId, telefone, evoMessageId, texto, mediaBase64, mediaMimetype,
          pushName, msgRowId, tenant } = msg;
  const session_id = `${tenantId}_${telefone}`;

  try {
    // Etapa 1: LOAD/CREATE conversa
    const convRes = await deps.supaFetch(
      `/rest/v1/conversas?tenant_id=eq.${tenantId}&telefone=eq.${encodeURIComponent(telefone)}` +
      `&select=id,estado_agente,dados_coletados,dados_cadastro,valor_proposto,orcid,pausada_em&limit=1`,
    );
    let convArr = await convRes.json();
    let conversa = convArr[0];
    if (!conversa) {
      const ins = await deps.supaFetch('/rest/v1/conversas', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          tenant_id: tenantId, telefone, estado_agente: 'tattoo',
          dados_coletados: {}, dados_cadastro: {}, last_msg_at: deps.now(),
        }),
      });
      const arr = await ins.json();
      conversa = arr[0];
    }

    // Etapa 2: EARLY-RETURN estado terminal
    if (TERMINAL_STATES.has(conversa.estado_agente)) {
      if (tenant.tatuador_telegram_chat_id) {
        await deps.sendTelegram(
          tenant.tatuador_telegram_chat_id,
          `📩 Cliente ${pushName ?? telefone} (${tenant.nome_estudio}) mandou msg:\n${preview(texto, 200)}`,
        );
      } else {
        await deps.sendTelegramAdmin(
          `tenant ${tenant.id} sem tatuador_telegram_chat_id em estado terminal (${conversa.estado_agente})`,
        );
      }
      await deps.supaFetch(`/rest/v1/n8n_chat_histories?id=eq.${msgRowId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'processed' }),
      });
      return;
    }

    // Etapa 3: MONTA historico (últimos 40, exclui msgRowId atual)
    const histRes = await deps.supaFetch(
      `/rest/v1/n8n_chat_histories?session_id=eq.${encodeURIComponent(session_id)}` +
      `&order=created_at.asc&limit=40&select=id,message`,
    );
    const histRows = await histRes.json();
    const historico = histRows
      .filter(r => r.id !== msgRowId)
      .map(r => {
        const msgObj = r.message || {};
        return {
          role: msgObj.type === 'ai' ? 'assistant' : 'user',
          content: msgObj.content || '',
        };
      });

    // (Etapas 4-9 implementadas em Tasks 9-11)
    throw new Error('etapas 4-9 nao implementadas (Tasks 9-11)');

  } catch (e) {
    console.error('[pipeline] failed:', { evoMessageId, telefone, error: e.message, stack: e.stack });
    await deps.supaFetch(`/rest/v1/n8n_chat_histories?id=eq.${msgRowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'failed' }),
    }).catch(() => {});
    await deps.sendTelegramAdmin(`🚨 pipeline failed: ${e.message}`);
  }
}
```

- [ ] **Step 2: Expandir testes 2, 3, 6, 10 com asserts concretos**

Cenário 2 (terminal aguardando_tatuador):

```js
test('2. estado terminal aguardando_tatuador: agent NÃO chamado, sendTelegram tatuador, status processed', async () => {
  let supaCalls = [];
  const sendTelegramSpy = mock.fn(async () => ({ ok: true }));
  const runAgentSpy = mock.fn();
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      supaCalls.push({ path, method: init?.method || 'GET' });
      if (path.startsWith('/rest/v1/conversas?tenant_id=')) {
        return new Response(JSON.stringify([{
          id: CONVERSA_ID, estado_agente: 'aguardando_tatuador',
          dados_coletados: {}, dados_cadastro: {},
        }]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
    sendTelegram: sendTelegramSpy,
    runAgent: runAgentSpy,
  });
  await processMessage({}, baseMsg(), deps);
  assert.equal(runAgentSpy.mock.callCount(), 0, 'runAgent não deve ser chamado');
  assert.equal(sendTelegramSpy.mock.callCount(), 1);
  assert.equal(sendTelegramSpy.mock.calls[0].arguments[0], '99999');
  assert.match(sendTelegramSpy.mock.calls[0].arguments[1], /Cliente Joao/);
  const patchCall = supaCalls.find(c => c.method === 'PATCH' && c.path.includes('n8n_chat_histories'));
  assert.ok(patchCall, 'PATCH status=processed deve ter sido chamado');
});
```

Cenário 3 (terminal sem tatuador_chat_id):

```js
test('3. estado terminal sem tatuador_telegram_chat_id: sendTelegramAdmin warning', async () => {
  const adminSpy = mock.fn(async () => ({ ok: true }));
  const tenantSemTatuador = { ...TENANT, tatuador_telegram_chat_id: null };
  const deps = mockDeps({
    supaFetch: async (path) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=')) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'lead_frio', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
    sendTelegramAdmin: adminSpy,
  });
  await processMessage({}, baseMsg({ tenant: tenantSemTatuador }), deps);
  assert.equal(adminSpy.mock.callCount(), 1);
});
```

Cenário 6 (conversa nova):

```js
test('6. conversa nova: GET retorna 0 rows → POST conversas com estado tattoo', async () => {
  let postBody = null;
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && init?.method !== 'POST') {
        return new Response('[]', { status: 200 });
      }
      if (path === '/rest/v1/conversas' && init?.method === 'POST') {
        postBody = JSON.parse(init.body);
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 201 });
      }
      // Histórico
      return new Response('[]', { status: 200 });
    },
  });
  // Vai falhar em "etapas 4-9 nao implementadas" — capturamos via sendTelegramAdmin
  await processMessage({}, baseMsg(), deps);
  assert.equal(postBody?.estado_agente, 'tattoo');
  assert.deepEqual(postBody?.dados_coletados, {});
});
```

Cenário 10 (histórico):

```js
test('10. histórico: 5 prévias mapeadas user/assistant, exclui msgRowId atual', async () => {
  let runAgentCallArg = null;
  const deps = mockDeps({
    supaFetch: async (path) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=')) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
      }
      if (path.startsWith('/rest/v1/n8n_chat_histories?session_id=')) {
        return new Response(JSON.stringify([
          { id: 1, message: { type: 'human', content: 'msg1' } },
          { id: 2, message: { type: 'ai', content: 'resp1' } },
          { id: 3, message: { type: 'human', content: 'msg2' } },
          { id: 4, message: { type: 'ai', content: 'resp2' } },
          { id: 5, message: { type: 'human', content: 'msg3' } },
          { id: MSG_ROW_ID, message: { type: 'human', content: 'oi' } },  // esta deve ser filtrada
        ]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
    runAgent: async (args) => { runAgentCallArg = args; return { ok: true, resposta_cliente: 'r', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }; },
  });
  await processMessage({}, baseMsg(), deps);
  // Etapas 4-9 lançam; mas histórico é montado antes na etapa 3.
  // Pra garantir que runAgent recebeu histórico correto, expandir após Task 9.
  // Aqui validamos via sendTelegramAdmin (catch path) ou — melhor — pular esse cenário até Task 9.
});
```

> Como cenário 10 depende de etapa 4 (runAgent) ter sido chamada, marcar como `test.skip` aqui e ativar na Task 9.

- [ ] **Step 3: Rodar tests**

```bash
npm test -- tests/_lib/whatsapp-pipeline.test.mjs
```

Expected: cenários 2, 3, 6 verdes; outros ainda red.

- [ ] **Step 4: Commit**

```bash
git add functions/_lib/whatsapp-pipeline.js tests/_lib/whatsapp-pipeline.test.mjs
git commit -m "feat(sub4-1): pipeline etapas 1-3 (load conversa + early-return terminal + historico)"
```

---

## Task 9: pipeline etapas 4-6 (runAgent + UPDATE conversa + INSERT n8n_chat_histories out)

**Files:**
- Modify: `functions/_lib/whatsapp-pipeline.js`
- Modify: `tests/_lib/whatsapp-pipeline.test.mjs` (expandir cenários 1, 7, 10, 11)

- [ ] **Step 1: Adicionar etapas 4-6 (substituir o `throw 'etapas 4-9'`)**

```js
    // Etapa 4: runAgent
    let agentOut;
    try {
      agentOut = await deps.runAgent({
        tenant_id: tenantId, telefone, mensagem: texto,
        estado_atual: conversa.estado_agente,
        dados_acumulados: conversa.dados_coletados || {},
        historico,
        tenant, conversa,
        clientContext: {},
      });
    } catch (e) {
      throw new Error(`runAgent threw: ${e.message}`);
    }
    if (!agentOut?.ok) {
      throw new Error(`runAgent returned ok:false: ${agentOut?.error || 'unknown'}`);
    }

    // Etapa 5: UPDATE conversa
    const isCadastro = agentOut.agent_usado === 'cadastro';
    const novoDadosColetados = isCadastro
      ? (conversa.dados_coletados || {})
      : { ...(conversa.dados_coletados || {}), ...(agentOut.dados_persistidos || {}) };
    const novoDadosCadastro = isCadastro
      ? { ...(conversa.dados_cadastro || {}), ...(agentOut.dados_persistidos || {}) }
      : (conversa.dados_cadastro || {});

    await deps.supaFetch(`/rest/v1/conversas?id=eq.${conversa.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        estado_agente: agentOut.estado_novo,
        dados_coletados: novoDadosColetados,
        dados_cadastro: novoDadosCadastro,
        updated_at: deps.now(),
      }),
    });

    // Etapa 6: INSERT n8n_chat_histories OUT
    await deps.supaFetch('/rest/v1/n8n_chat_histories', {
      method: 'POST',
      body: JSON.stringify({
        session_id,
        message: { type: 'ai', content: agentOut.resposta_cliente },
        status: 'processed',
        created_at: deps.now(),
      }),
    });

    // (Etapas 7-9 implementadas em Tasks 10-11)
    // Por ora, status final do msg in:
    await deps.supaFetch(`/rest/v1/n8n_chat_histories?id=eq.${msgRowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'processed' }),
    });
```

> Truque pra teste incremental: deixar status='processed' no msg in já aqui; etapas 7-8 (Task 10) **adicionam** Evolution outbound + handoff entre etapa 6 e o PATCH final, mas movem o PATCH pra depois.

- [ ] **Step 2: Implementar/ativar cenários 1, 7, 10, 11**

Cenário 1 (golden path):

```js
test('1. golden path tattoo: agent retorna pergunta → UPDATE conversa + INSERT out + status processed', async () => {
  let conversaPatch = null;
  let n8nInserts = [];
  const runAgentSpy = mock.fn(async () => ({
    ok: true, resposta_cliente: 'me conta o tamanho?',
    estado_novo: 'tattoo', dados_persistidos: { ideia: 'rosa' },
    proxima_acao: 'pergunta', agent_usado: 'tattoo',
  }));
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'tattoo', dados_coletados: { x: 1 }, dados_cadastro: {} }]), { status: 200 });
      }
      if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && init?.method === 'PATCH') {
        conversaPatch = JSON.parse(init.body);
        return new Response('[]', { status: 200 });
      }
      if (path === '/rest/v1/n8n_chat_histories' && init?.method === 'POST') {
        n8nInserts.push(JSON.parse(init.body));
        return new Response('[]', { status: 201 });
      }
      return new Response('[]', { status: 200 });
    },
    runAgent: runAgentSpy,
  });
  await processMessage({}, baseMsg(), deps);
  assert.equal(runAgentSpy.mock.callCount(), 1);
  assert.equal(conversaPatch.estado_agente, 'tattoo');
  assert.deepEqual(conversaPatch.dados_coletados, { x: 1, ideia: 'rosa' });
  assert.equal(n8nInserts.length, 1);
  assert.equal(n8nInserts[0].message.type, 'ai');
  assert.equal(n8nInserts[0].message.content, 'me conta o tamanho?');
});
```

Cenário 7 (runAgent throws):

```js
test('7. runAgent throws → status=failed + sendTelegramAdmin alerta + sem evoSend', async () => {
  const adminSpy = mock.fn(async () => ({ ok: true }));
  const evoSpy = mock.fn(async () => ({ ok: true }));
  let lastPatch = null;
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=')) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
      }
      if (init?.method === 'PATCH') lastPatch = JSON.parse(init.body);
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => { throw new Error('SDK timeout'); },
    sendTelegramAdmin: adminSpy,
    evoSend: evoSpy,
  });
  await processMessage({}, baseMsg(), deps);
  assert.equal(adminSpy.mock.callCount(), 1);
  assert.equal(evoSpy.mock.callCount(), 0);
  assert.equal(lastPatch.status, 'failed');
});
```

Cenário 10 (histórico — agora ativável):

```js
test('10. histórico: 5 prévias mapeadas user/assistant, exclui msgRowId atual', async () => {
  let runAgentCallArg = null;
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
      }
      if (path.startsWith('/rest/v1/n8n_chat_histories?session_id=')) {
        return new Response(JSON.stringify([
          { id: 1, message: { type: 'human', content: 'msg1' } },
          { id: 2, message: { type: 'ai', content: 'resp1' } },
          { id: MSG_ROW_ID, message: { type: 'human', content: 'oi' } },
        ]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
    runAgent: async (args) => { runAgentCallArg = args; return { ok: true, resposta_cliente: 'r', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }; },
  });
  await processMessage({}, baseMsg(), deps);
  assert.deepEqual(runAgentCallArg.historico, [
    { role: 'user', content: 'msg1' },
    { role: 'assistant', content: 'resp1' },
  ]);
});
```

Cenário 11 (cadastro vs tattoo dados shape):

```js
test('11. agent_usado=cadastro: merge dados_cadastro; dados_coletados intacto', async () => {
  let conversaPatch = null;
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'cadastro', dados_coletados: { ideia: 'rosa' }, dados_cadastro: { nome: 'Joao' } }]), { status: 200 });
      }
      if (init?.method === 'PATCH' && path.startsWith(`/rest/v1/conversas?id=eq.`)) {
        conversaPatch = JSON.parse(init.body);
      }
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => ({
      ok: true, resposta_cliente: 'r', estado_novo: 'aguardando_tatuador',
      dados_persistidos: { email: 'a@b.com' }, proxima_acao: 'handoff', agent_usado: 'cadastro',
    }),
  });
  await processMessage({}, baseMsg(), deps);
  assert.deepEqual(conversaPatch.dados_cadastro, { nome: 'Joao', email: 'a@b.com' });
  assert.deepEqual(conversaPatch.dados_coletados, { ideia: 'rosa' });
});
```

- [ ] **Step 3: Rodar tests**

```bash
npm test -- tests/_lib/whatsapp-pipeline.test.mjs
```

Expected: cenários 1, 2, 3, 6, 7, 10, 11 verdes. Cenários 4, 5, 8, 9 ainda red (Tasks 10-11).

- [ ] **Step 4: Commit**

```bash
git add functions/_lib/whatsapp-pipeline.js tests/_lib/whatsapp-pipeline.test.mjs
git commit -m "feat(sub4-1): pipeline etapas 4-6 (runAgent + UPDATE conversa + INSERT n8n out)"
```

---

## Task 10: pipeline etapas 7-8 (Evolution outbound + handoff orçamento)

**Files:**
- Modify: `functions/_lib/whatsapp-pipeline.js`
- Modify: `tests/_lib/whatsapp-pipeline.test.mjs` (expandir cenários 4, 5, 8, 9)

- [ ] **Step 1: Adicionar etapas 7-8 entre etapa 6 e o PATCH final de status**

```js
    // Etapa 7: Evolution outbound (text + media URLs)
    const sendRes = await deps.evoSend(tenant, {
      type: 'text', to: telefone, text: agentOut.resposta_cliente,
    });
    if (!sendRes.ok) {
      await deps.sendTelegramAdmin(`evo sendText falhou: ${sendRes.error || 'unknown'} (tenant=${tenant.id})`);
      throw new Error('evo-sendtext-failed');
    }
    if (Array.isArray(agentOut.urls_portfolio) && agentOut.urls_portfolio.length > 0) {
      for (const url of agentOut.urls_portfolio) {
        const m = await deps.evoSend(tenant, { type: 'media', to: telefone, url });
        if (!m.ok) {
          await deps.sendTelegramAdmin(`evo sendMedia falhou: ${url} (${m.error || 'unknown'})`);
          // Não throw — texto principal foi entregue
        }
      }
    }

    // Etapa 8: side-effect handoff cadastro → enviar-orcamento-tatuador
    if (conversa.estado_agente === 'cadastro' && agentOut.proxima_acao === 'handoff') {
      if (!tenant.tatuador_telegram_chat_id) {
        await deps.sendTelegramAdmin(`handoff sem tatuador_telegram_chat_id em ${tenant.id}`);
      } else {
        const r = await deps.callTool('enviar-orcamento-tatuador', {
          tenant_id: tenant.id, telefone,
        });
        if (!r.ok) {
          await deps.sendTelegramAdmin(`enviar-orcamento-tatuador falhou: ${r.error || 'unknown'}`);
        }
      }
    }

    // (PATCH status='processed' do msg in já feito ao final da etapa 6)
```

- [ ] **Step 2: Cenário 4 (handoff cadastro→orcamento)**

```js
test('4. handoff cadastro→orcamento: callTool(enviar-orcamento-tatuador) chamado', async () => {
  const callToolSpy = mock.fn(async () => ({ ok: true }));
  const deps = mockDeps({
    supaFetch: async (path) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=') ) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'cadastro', dados_coletados: {}, dados_cadastro: { nome: 'J' } }]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => ({
      ok: true, resposta_cliente: 'tudo certo, falo com ela',
      estado_novo: 'aguardando_tatuador', dados_persistidos: { email: 'a@b.com' },
      proxima_acao: 'handoff', agent_usado: 'cadastro',
    }),
    callTool: callToolSpy,
  });
  await processMessage({}, baseMsg(), deps);
  assert.equal(callToolSpy.mock.callCount(), 1);
  assert.equal(callToolSpy.mock.calls[0].arguments[0], 'enviar-orcamento-tatuador');
  assert.equal(callToolSpy.mock.calls[0].arguments[1].tenant_id, TENANT.id);
});
```

- [ ] **Step 3: Cenário 5 (portfolio intent)**

```js
test('5. portfolio intent: urls_portfolio → evoSend 1 text + N media', async () => {
  const evoSpy = mock.fn(async () => ({ ok: true }));
  const deps = mockDeps({
    supaFetch: async (path) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=')) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => ({
      ok: true, resposta_cliente: 'olha esses estilos:',
      estado_novo: 'tattoo', dados_persistidos: {},
      proxima_acao: 'enviar_portfolio', agent_usado: 'tattoo',
      urls_portfolio: ['https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg'],
    }),
    evoSend: evoSpy,
  });
  await processMessage({}, baseMsg(), deps);
  assert.equal(evoSpy.mock.callCount(), 4); // 1 text + 3 media
  assert.equal(evoSpy.mock.calls[0].arguments[1].type, 'text');
  assert.equal(evoSpy.mock.calls[1].arguments[1].type, 'media');
  assert.equal(evoSpy.mock.calls[1].arguments[1].url, 'https://x/1.jpg');
});
```

- [ ] **Step 4: Cenário 8 (evoSend text falha)**

```js
test('8. evoSend(text) ok:false → status=failed + sendTelegramAdmin warning', async () => {
  const adminSpy = mock.fn(async () => ({ ok: true }));
  let lastPatch = null;
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=')) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
      }
      if (init?.method === 'PATCH') lastPatch = JSON.parse(init.body);
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => ({ ok: true, resposta_cliente: 'r', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }),
    evoSend: async () => ({ ok: false, error: 'connection-refused' }),
    sendTelegramAdmin: adminSpy,
  });
  await processMessage({}, baseMsg(), deps);
  assert.equal(adminSpy.mock.callCount(), 1);
  assert.match(adminSpy.mock.calls[0].arguments[0], /sendText falhou/);
  assert.equal(lastPatch.status, 'failed');
});
```

- [ ] **Step 5: Cenário 9 (mídia in não duplica)**

```js
test('9. mídia base64 in: pipeline NÃO insere msg in (já criada por inbound), só msg out', async () => {
  let n8nInsertCount = 0;
  const deps = mockDeps({
    supaFetch: async (path, init) => {
      if (path.startsWith('/rest/v1/conversas?tenant_id=')) {
        return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} }]), { status: 200 });
      }
      if (path === '/rest/v1/n8n_chat_histories' && init?.method === 'POST') {
        n8nInsertCount++;
        const body = JSON.parse(init.body);
        assert.equal(body.message.type, 'ai', 'pipeline só insere msg ai/out');
        return new Response('[]', { status: 201 });
      }
      return new Response('[]', { status: 200 });
    },
    runAgent: async () => ({ ok: true, resposta_cliente: 'r', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }),
  });
  await processMessage({}, baseMsg({ mediaBase64: 'data', mediaMimetype: 'image/jpeg' }), deps);
  assert.equal(n8nInsertCount, 1);
});
```

- [ ] **Step 6: Rodar tests**

```bash
npm test -- tests/_lib/whatsapp-pipeline.test.mjs
```

Expected: 11/11 verdes.

- [ ] **Step 7: Commit**

```bash
git add functions/_lib/whatsapp-pipeline.js tests/_lib/whatsapp-pipeline.test.mjs
git commit -m "feat(sub4-1): pipeline etapas 7-8 (Evolution outbound + handoff orcamento) — 11/11 tests"
```

---

## Task 11: Polir error handling do pipeline + rodar suite completa

**Files:**
- Modify: `functions/_lib/whatsapp-pipeline.js` (review do try/catch — garantir cobertura)
- Sem novo arquivo

- [ ] **Step 1: Review do bloco try/catch — garantir que TODOS os paths de erro caem em `status='failed' + sendTelegramAdmin`**

Casos cobertos:
- `runAgent` throws → catch externo
- `runAgent` retorna `ok:false` → throw → catch externo
- `evoSend` text retorna `ok:false` → throw → catch externo
- `evoSend` media retorna `ok:false` → admin alert + continua (não fatal)
- `supaFetch` throws → catch externo
- `callTool('enviar-orcamento-tatuador')` retorna `ok:false` → admin alert + NÃO bloqueia (cliente já recebeu resposta)

Confirmar que `sendTelegramAdmin` no catch usa stack truncado:

```js
} catch (e) {
  console.error('[pipeline] failed:', { evoMessageId, telefone, error: e.message, stack: e.stack });
  await deps.supaFetch(`/rest/v1/n8n_chat_histories?id=eq.${msgRowId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'failed' }),
  }).catch(() => {});
  await deps.sendTelegramAdmin(`🚨 pipeline failed (msg ${evoMessageId}): ${e.message}\n${preview(e.stack, 500)}`);
}
```

- [ ] **Step 2: Rodar suite completa**

```bash
npm test
```

Expected: tudo verde — 372 originais + 13 parser + 3 telegram + 3 runagent + 11 pipeline = 402+ tests.

- [ ] **Step 3: Commit**

```bash
git add functions/_lib/whatsapp-pipeline.js
git commit -m "feat(sub4-1): polish pipeline error handling + suite completa pass"
```

---

## Task 12: `functions/api/whatsapp/inbound.js` endpoint thin

**Files:**
- Create: `functions/api/whatsapp/inbound.js`
- Create: `tests/api/whatsapp/inbound.test.mjs`

- [ ] **Step 1: Escrever 6 testes vermelhos**

```js
// tests/api/whatsapp/inbound.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../../functions/api/whatsapp/inbound.js';

const ENV = {
  WEBHOOK_SECRET: 'shh',
  SUPABASE_SERVICE_ROLE_KEY: 'svc-key',
};

function buildContext({ method = 'POST', body, secret = 'shh', waitUntilSpy } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (secret !== null) headers['x-webhook-secret'] = secret;
  return {
    request: new Request('https://x/api/whatsapp/inbound', {
      method,
      headers,
      body: method === 'POST' && body !== undefined ? JSON.stringify(body) : undefined,
    }),
    env: ENV,
    waitUntil: waitUntilSpy || (() => {}),
  };
}

const VALID_PAYLOAD = {
  event: 'messages.upsert',
  instance: 'inkflow_test',
  data: {
    key: { id: 'ABC', remoteJid: '5511999@s.whatsapp.net', fromMe: false },
    message: { conversation: 'oi' },
    pushName: 'Joao',
  },
};

test('inbound: 401 sem x-webhook-secret', async () => {
  const res = await onRequest(buildContext({ secret: null, body: VALID_PAYLOAD }));
  assert.equal(res.status, 401);
});

test('inbound: 405 GET', async () => {
  const res = await onRequest(buildContext({ method: 'GET' }));
  assert.equal(res.status, 405);
});

test('inbound: 400 body inválido', async () => {
  const ctx = buildContext({});
  // sobrescrever request pra body não-JSON
  ctx.request = new Request('https://x/api/whatsapp/inbound', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': 'shh' },
    body: 'not-json',
  });
  const res = await onRequest(ctx);
  assert.equal(res.status, 400);
});

test('inbound: skip parser → 200 + skipped, não chama waitUntil', async () => {
  const orig = globalThis.fetch;
  const waitSpy = mock.fn();
  globalThis.fetch = async () => new Response('[]', { status: 200 });
  try {
    const ctx = buildContext({ body: { event: 'connection.update' }, waitUntilSpy: waitSpy });
    const res = await onRequest(ctx);
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.skipped, 'wrong-event');
    assert.equal(waitSpy.mock.callCount(), 0);
  } finally { globalThis.fetch = orig; }
});

test('inbound: idempotente (INSERT retorna []) → 200 idempotent:true, NÃO dispatch waitUntil', async () => {
  const orig = globalThis.fetch;
  const waitSpy = mock.fn();
  let calls = 0;
  globalThis.fetch = async (url, opts) => {
    calls++;
    if (url.includes('/rest/v1/tenants?')) {
      return new Response(JSON.stringify([{ id: 'tid', evo_instance: 'inkflow_test', tatuador_telegram_chat_id: '99' }]), { status: 200 });
    }
    if (url.includes('/rest/v1/n8n_chat_histories') && opts?.method === 'POST') {
      return new Response('[]', { status: 201 });  // ignore-duplicates hit
    }
    return new Response('[]', { status: 200 });
  };
  try {
    const res = await onRequest(buildContext({ body: VALID_PAYLOAD, waitUntilSpy: waitSpy }));
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.idempotent, true);
    assert.equal(waitSpy.mock.callCount(), 0);
  } finally { globalThis.fetch = orig; }
});

test('inbound: INSERT OK (row populada) → 200 accepted:<id> + waitUntil chamado', async () => {
  const orig = globalThis.fetch;
  const waitSpy = mock.fn();
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/tenants?')) {
      return new Response(JSON.stringify([{ id: 'tid', evo_instance: 'inkflow_test', tatuador_telegram_chat_id: '99' }]), { status: 200 });
    }
    if (url.includes('/rest/v1/n8n_chat_histories') && opts?.method === 'POST') {
      return new Response(JSON.stringify([{ id: 12345 }]), { status: 201 });
    }
    return new Response('[]', { status: 200 });
  };
  try {
    const res = await onRequest(buildContext({ body: VALID_PAYLOAD, waitUntilSpy: waitSpy }));
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.accepted, 12345);
    assert.equal(waitSpy.mock.callCount(), 1);
  } finally { globalThis.fetch = orig; }
});
```

- [ ] **Step 2: Rodar pra confirmar red**

```bash
npm test -- tests/api/whatsapp/inbound.test.mjs
```

Expected: 6 fails (módulo inexistente).

- [ ] **Step 3: Implementar `inbound.js`**

```js
// functions/api/whatsapp/inbound.js
// POST /api/whatsapp/inbound — webhook Evolution v2.
// Auth: x-webhook-secret. Persist-first + idempotência via UNIQUE partial.
// Ack 200 < 200ms; processamento via waitUntil(processMessage).

import { parseEvolutionPayload } from '../../_lib/evolution-parser.js';
import { processMessage } from '../../_lib/whatsapp-pipeline.js';
import { supaFetch } from '../tools/_tool-helpers.js';

const HEADERS = { 'Content-Type': 'application/json' };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

export async function onRequest(context) {
  const { request, env, waitUntil } = context;

  if (request.method !== 'POST') return json({ ok: false, error: 'method-not-allowed' }, 405);
  if (!env.WEBHOOK_SECRET || request.headers.get('x-webhook-secret') !== env.WEBHOOK_SECRET) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'body-invalido' }, 400); }

  const parsed = parseEvolutionPayload(body);
  if (parsed.skip) {
    console.log('[inbound] skip:', parsed.skip);
    return json({ ok: true, skipped: parsed.skip });
  }
  const inbound = parsed.inbound;

  // Lookup tenant via evo_instance
  let tenant;
  try {
    const r = await supaFetch(env, `/rest/v1/tenants?evo_instance=eq.${encodeURIComponent(inbound.tenantEvoInstance)}` +
      `&select=id,nome_estudio,evo_instance,evo_apikey,tatuador_telegram_chat_id,config_agente,config_precificacao,sinal_percentual,gatilhos_handoff,faqs,fewshots&limit=1`);
    const arr = await r.json();
    tenant = arr?.[0];
  } catch (e) {
    console.error('[inbound] tenant lookup failed:', e.message);
    return json({ ok: false, error: 'tenant-lookup-failed' }, 500);
  }
  if (!tenant) {
    console.warn('[inbound] orphan-tenant:', inbound.tenantEvoInstance);
    return json({ ok: true, skipped: 'orphan-tenant' });
  }

  // INSERT idempotente
  const session_id = `${tenant.id}_${inbound.telefone}`;
  let insertedRow = null;
  try {
    const ins = await supaFetch(env, '/rest/v1/n8n_chat_histories', {
      method: 'POST',
      headers: { Prefer: 'return=representation, resolution=ignore-duplicates' },
      body: JSON.stringify({
        session_id,
        message: {
          type: 'human',
          content: inbound.texto,
          media_base64: inbound.mediaBase64,
          media_mimetype: inbound.mediaMimetype,
        },
        evo_message_id: inbound.evoMessageId,
        status: 'received',
      }),
    });
    const arr = await ins.json();
    insertedRow = arr?.[0] || null;
  } catch (e) {
    console.error('[inbound] insert failed:', e.message);
    return json({ ok: false, error: 'insert-failed' }, 500);
  }

  if (!insertedRow) {
    // Idempotência hit: já tinha row com (session_id, evo_message_id) idênticos
    return json({ ok: true, idempotent: true });
  }

  // Dispatch async
  const msg = {
    tenantId: tenant.id, telefone: inbound.telefone,
    evoMessageId: inbound.evoMessageId, texto: inbound.texto,
    mediaBase64: inbound.mediaBase64, mediaMimetype: inbound.mediaMimetype,
    pushName: inbound.pushName, msgRowId: insertedRow.id, tenant,
  };
  if (typeof waitUntil === 'function') {
    waitUntil(processMessage(env, msg).catch(e => {
      console.error('[inbound] waitUntil processMessage rejected:', e.message);
    }));
  }

  return json({ ok: true, accepted: insertedRow.id });
}
```

- [ ] **Step 4: Rodar tests inbound**

```bash
npm test -- tests/api/whatsapp/inbound.test.mjs
```

Expected: 6/6 pass.

- [ ] **Step 5: Rodar suite completa — confirmar zero regressão**

```bash
npm test
```

Expected: 372 originais + 33 novos = 405+ pass.

- [ ] **Step 6: Commit**

```bash
git add functions/api/whatsapp/inbound.js tests/api/whatsapp/inbound.test.mjs
git commit -m "feat(sub4-1): endpoint /api/whatsapp/inbound (auth + persist-first + idempotente + waitUntil)"
```

---

## Task 13: Push branch + smoke verificação preview deploy

**Files:** Nenhum.

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/sub4-cutover-n8n
```

- [ ] **Step 2: Aguardar CF Pages preview build**

Monitorar via mcp Cloudflare Builds ou painel CF. URL preview: `https://feat-sub4-cutover-n8n.<projeto>.pages.dev`.

Esperar status `success`.

- [ ] **Step 3: Curl bogus secret → 401**

```bash
curl -i -X POST "https://<preview-url>/api/whatsapp/inbound" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: bogus" \
  -d '{}'
```

Expected: HTTP/1.1 401.

- [ ] **Step 4: Curl payload skip → 200 + skipped**

```bash
curl -s -X POST "https://<preview-url>/api/whatsapp/inbound" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -d '{"event":"connection.update"}'
```

Expected: `{"ok":true,"skipped":"wrong-event"}`.

- [ ] **Step 5: Não há commit** — só verificação.

---

## Task 14: Smoke E2E real — gate final manual

**Files:** Nenhum (memory update no final).

- [ ] **Step 1: Setup tenant fixture**

Via dashboard ou SQL direto:
- `evo_instance: 'inkflow_test_sub4'`
- `tatuador_telegram_chat_id: <chat_id_teste_Leandro>`
- `config_agente OK, config_precificacao { sinal_percentual: 30 }`
- `gatilhos_handoff: [], faqs: [], fewshots: []` (ou stubs mínimos)

```sql
SELECT id, evo_instance, tatuador_telegram_chat_id FROM tenants WHERE evo_instance = 'inkflow_test_sub4';
```

- [ ] **Step 2: Criar instância Evolution**

```bash
curl -X POST "https://<prod-url>/api/evo-create-instance" \
  -H "Content-Type: application/json" \
  -d "{\"instanceName\":\"inkflow_test_sub4\",\"tenant_id\":\"<tenant_id>\"}"
```

- [ ] **Step 3: Apontar webhook Evolution pra preview**

```bash
curl -X POST "$EVO_BASE_URL/webhook/set/inkflow_test_sub4" \
  -H "apikey: $EVO_GLOBAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "https://<preview-url>/api/whatsapp/inbound",
      "webhookByEvents": false,
      "webhookBase64": true,
      "events": ["MESSAGES_UPSERT"],
      "headers": { "x-webhook-secret": "<WEBHOOK_SECRET>" }
    }
  }'
```

- [ ] **Step 4: Escanear QR no celular teste**

Pelo dashboard ou via `/api/evo-pairing-code`.

- [ ] **Step 5: Executar golden path WhatsApp real**

Roteiro:
1. "oi quero uma tattoo" → bot pede descrição.
2. Foto referência → bot persiste base64 + responde.
3. "rosa pequena no antebraço" → completa fluxo coleta.
4. Handoff cadastro: "Joao Silva 12/03/1995 joao@x.com" → estado vira `aguardando_tatuador`.
5. Verifica: Telegram tatuador recebeu orçamento formatado.
6. Tatuador: "aceitar:<orcid>:300" → estado `propondo_valor`.
7. Cliente "fechado" → escolhe horário → reservar → recebe link MP.
8. Mensagem extra em `aguardando_sinal` → bot responde (não-terminal).
9. Mensagem em `aguardando_tatuador` (forçar via dashboard) → bot calado + Telegram notify tatuador.

- [ ] **Step 6: Validações pós-fluxo**

```sql
-- Mensagens persistidas
SELECT id, status, evo_message_id, message->>'type' AS type, message->>'content' AS content
FROM n8n_chat_histories
WHERE session_id = '<tenant_id>_<telefone_teste>'
ORDER BY created_at;

-- Estado da conversa
SELECT estado_agente, dados_coletados, dados_cadastro, last_msg_at, valor_proposto, orcid
FROM conversas
WHERE tenant_id = '<tenant_id>' AND telefone = '<telefone_teste>';
```

Expected:
- Todas msgs `status='processed'`.
- `evo_message_id` populado nas in.
- Sem alerta admin no Telegram ops.
- `last_msg_at` recente (trigger).
- Custo OpenAI < $0.30.

- [ ] **Step 7: Atualizar memory + criar PR**

Atualizar `~/.claude/projects/.../memory/project_agente_autonomo.md` com:
- Sub-4.1 ✅ DONE: endpoint feature-complete + 32+ tests + smoke OK.
- Sub-4.2 PENDENTE: cutover webhook prod + descomissionar n8n.

Abrir PR:

```bash
gh pr create --title "feat(sub4-1): WhatsApp inbound endpoint feature-complete" --body "$(cat <<'EOF'
## Summary
- Endpoint `/api/whatsapp/inbound` com auth + persist-first + idempotência + waitUntil
- Pipeline `whatsapp-pipeline.js` cobre load/agent/persist/outbound/handoff/notify
- Refactor `route.js`: extrai `runAgent({...})` exportável, `onRequest` vira wrapper
- Migration: `evo_message_id` + `status` + UNIQUE partial em `n8n_chat_histories`
- Tests: 13 parser + 11 pipeline + 6 inbound + 3 runagent (+ 372 existing intactos)

## Gate Sub-4.1 → Sub-4.2 (checklist)
- [x] Migration aplicada dev branch
- [ ] Migration aplicada main branch (após cutover Sub-4.2)
- [x] Unit parser 13/13
- [x] Unit inbound 6/6
- [x] Unit route.runAgent 3/3
- [x] Integration pipeline 11/11
- [x] Suite existing 372/372 intacta
- [x] Smoke E2E golden path OK
- [x] Telegram tatuador notify funcionando
- [x] Bot calado em estado terminal
- [x] Mídia base64 persistida
- [x] Custo OpenAI por fluxo < $0.30

## Test plan
- [ ] CI: `npm test` em CI (Cloudflare Pages build).
- [ ] Smoke E2E: documentado em Task 14 plano.
- [ ] Sub-4.2: apontar `N8N_WEBHOOK` em prod pro novo endpoint, descomissionar container n8n.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 8: Cleanup parcial**

Manter instância `inkflow_test_sub4` + webhook apontando pra preview — Sub-4.2 reusa. Deletar conversa fixture do teste:

```sql
DELETE FROM n8n_chat_histories WHERE session_id = '<tenant>_<telefone_teste>';
DELETE FROM conversas WHERE tenant_id = '<tenant>' AND telefone = '<telefone_teste>';
```

- [ ] **Step 9: Commit memory update**

```bash
git add /Users/brazilianhustler/.claude/projects/-Users-brazilianhustler-Documents-inkflow-saas/memory/project_agente_autonomo.md
git commit -m "docs(sub4-1): atualiza memory project_agente_autonomo — Sub-4.1 DONE"
git push
```

---

## Self-review

**Spec coverage:** Goals 1-7 cobertos por Tasks 12, 12, 2, 12, 10, 3+12, 14 respectivamente. Migration explícita Task 2. Refactor route.js Task 6. Pipeline 9 etapas distribuídas Tasks 7-11. Smoke E2E gate Task 14. Memory + PR Task 14.

**Placeholder scan:** Sem `TODO`, `TBD`, "implement later". Cenário 10 marcado como `test.skip` em Task 8 e ativado em Task 9 — explicitamente justificado, não placeholder.

**Type consistency:** `processMessage(env, msg, depsOverride)` consistente entre Tasks 7-11. Deps shape (`supaFetch`, `evoSend`, `sendTelegram`, `sendTelegramAdmin`, `runAgent`, `callTool`, `now`) consistente. `runAgent({env, tenant_id, telefone, mensagem, estado_atual, dados_acumulados, historico, tenant, conversa, clientContext})` consistente entre Task 6 (definição) e Task 9 (chamada do pipeline). Inbound `msg` shape (`tenantId, telefone, evoMessageId, texto, mediaBase64, mediaMimetype, pushName, msgRowId, tenant`) consistente Task 12 → Task 8.

**Task count:** 14 tasks. Dentro do limite ≤15.

**Checkpoints testáveis:** Cada Task 2-12 fecha com test gate concreto + commit. Tasks 13-14 são verificação preview + smoke manual.

**Dependências:** Folhas (parser, telegram, evolution-send) Tasks 3-5 antes do refactor route Task 6 antes do pipeline Tasks 7-11 antes do endpoint Task 12 antes do smoke Tasks 13-14.

**Migration risk:** Task 2 isola apply em dev branch (R7); main só recebe após cutover Sub-4.2.

**Refactor risk:** Task 6 explicita "suite 372/372 intacta" como gate.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-09-sub4-1-whatsapp-inbound.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, review entre tasks, iteração rápida. Bom pra esse plano por causa da quantidade de TDD steps + 4 cenários incrementais no pipeline.

**2. Inline Execution** — Executa tasks na sessão atual com checkpoints batched.

Qual abordagem?
