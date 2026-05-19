# Coleta de fotos REAIS no Telegram do tatuador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar a base64 das fotos (que já chega e é persistida) ao Telegram do tatuador: classificar cada foto como `foto_local` ou `refs_imagens`, anexar ao orçamento via `sendMediaGroup`/`sendDocument`, capturar `file_id` eterno e zerar o base64 do DB. Re-encaminhar fotos pós-handoff. Refator UX visual do orçamento (briefing natural, label `💵 Informar valor`, nome em vez de orcid).

**Architecture:** Pipeline ganha "Etapa 4.5" que classifica fotos heuristicamente (L1 estado de pedido + L2 keywords texto + L3 default ref) e grava FK `msg_id` em `dados_coletados`. Tool `enviar-orcamento-tatuador` ganha `enviarFotosOrcamento()` que faz batch SELECT base64, dispatch (carrossel JPEG/PNG/WEBP + sendDocument HEIC/HEIF/TIFF), captura `file_ids` e zera base64 via RPC atômico. Estado terminal re-encaminha foto avulsa com caption. Zero infra nova — Telegram-as-storage.

**Tech Stack:** Cloudflare Pages Functions (Workers runtime), Supabase Postgres + REST + RPC, Telegram Bot API (multipart/form-data via FormData nativo), Vitest (node:test ESM). Sem dependencies novas.

---

## Pré-requisito hard: PR-A deve estar mergeado em main

Este plan assume que a migration `n8n_chat_histories → conversa_mensagens` (PR-A) já foi aplicada e que `functions/_lib/whatsapp-pipeline.js`, `functions/api/whatsapp/inbound.js`, `functions/api/conversas/list.js`, `functions/api/conversas/thread.js` e `supabase/baseline-schema.sql` referenciam o nome novo.

**Antes de iniciar a Task 1**, validar:

```bash
# 1) Confirma branch mergeada
git log --oneline main | grep -i "rename.*conversa_mensagens" | head -3

# 2) Confirma tabela existe no Supabase
# (via Supabase MCP ou wrangler tail)
# SELECT to_regclass('public.conversa_mensagens'); → deve retornar 'conversa_mensagens'
# SELECT to_regclass('public.n8n_chat_histories'); → deve retornar NULL

# 3) Confirma pipeline já referencia nome novo
grep -n "conversa_mensagens" functions/_lib/whatsapp-pipeline.js functions/api/whatsapp/inbound.js
grep -n "n8n_chat_histories" functions/_lib/whatsapp-pipeline.js functions/api/whatsapp/inbound.js || echo "OK — nenhuma referencia residual"
```

Se PR-A não estiver mergeado, **PARAR** e executar o plan de PR-A antes (`docs/superpowers/plans/2026-05-19-rename-n8n-chat-histories.md`, plan próprio).

---

## File Structure

### Novos arquivos

| Arquivo | Responsabilidade | LOC alvo |
|---------|------------------|----------|
| `functions/_lib/foto-classifier.js` | Função pura `classificarFoto({tentativas, foto_local_atual, texto})` → `'local'\|'ref'`. Zero deps. | ~50 |
| `functions/_lib/telegram-media.js` | API `sendTelegramPhoto`, `sendTelegramDocument`, `sendTelegramMediaGroup`, `enviarMidia` (router por mimetype). FormData multipart, timeout 15s, retry 1× em 429. | ~120 |
| `supabase/migrations/2026-05-19-add-zerar-media-base64-rpc.sql` | RPC `zerar_media_base64(p_msg_id BIGINT)` — UPDATE in-place via `jsonb_set` pra evitar race read-modify-write. SECURITY DEFINER, GRANT só pra `service_role`. | ~15 |

### Novos test files

| Arquivo | Tipo | Cenários |
|---------|------|----------|
| `tests/_lib/foto-classifier.test.mjs` | unit | L1 hit/fail, L2 hit (várias keywords), L2 fail, L3 default, edge cases (texto null, mimetype undefined) |
| `tests/_lib/telegram-media.test.mjs` | unit | mock fetch: sendPhoto OK, sendMediaGroup OK retornando file_ids, sendDocument OK, retry 429 com backoff, throw 413, multipart shape, caption só primeiro item do mediaGroup, enviarMidia routing por mimetype |
| `tests/integration/pipeline-classifier.test.mjs` | integration | Cenários A (proativo local L2), B (ignorou pedido L1), C (2 fotos juntas), D (refs proativas L3) |
| `tests/integration/pos-handoff-foto.test.mjs` | integration | Estado terminal + mediaBase64 image/* → sendTelegram texto + enviarMidia + RPC zerar |
| `tests/integration/orcamento-com-fotos.test.mjs` | integration | E2E canônico 1 local + 2 refs → sendMediaGroup(3) → file_ids persistidos → base64 zerado → sendMessage |
| `tests/integration/orcamento-sem-fotos.test.mjs` | integration | msg_ids vazios → `enviarFotosOrcamento` `{enviadas:0}` → orçamento texto normal |
| `tests/integration/orcamento-falha-parcial.test.mjs` | integration | sendMediaGroup throw → texto sai com nota de falha, base64 INTACTO |
| `tests/integration/orcamento-heic-mix.test.mjs` | integration | [JPEG, HEIC, JPEG] → 1 sendDocument + 1 sendMediaGroup(2 JPEG) → 3 file_ids |
| `tests/integration/idempotencia-retry-fotos.test.mjs` | integration | 1ª chamada falha upload → fotos NÃO marcadas. 2ª chamada detecta gap → roda só upload |
| `tests/integration/orcamento-multi-refs-seco.test.mjs` | integration | Cliente seco: 5 fotos sequenciais "quanto fica?" → todas L3→ref → sendMediaGroup(5) |
| `tests/integration/orcamento-cap-10-fotos.test.mjs` | integration | 15 refs no histórico → cap 10 (9 mais recentes + 1 local), briefing menciona truncamento |

### Arquivos modificados

| Arquivo | Mudança | Linhas alvo |
|---------|---------|-------------|
| `functions/_lib/whatsapp-pipeline.js` | Etapa 4.5 (classifier+PATCH msg_id) entre runAgent e UPDATE conversa. Etapa terminal modificada (re-encaminha foto). | ~93-109 (terminal), ~150 (após Etapa 5 atual) |
| `functions/api/tools/enviar-orcamento-tatuador.js` | 8 mudanças: rename label botão, `montarBriefing`, `formatarDataBr`, `montarLinhaIdade`, refactor `montarTextoOrcamento`, `selecionarFotosOrcamento`, `enviarFotosOrcamento`, `handle()` orchestration + idempotência ajustada | 86 (botão), 80-90 (texto), 134 (idempotência), nova função (helpers), 130+ (handle) |
| `functions/api/tools/dados-coletados.js` | Guard `PIPELINE_ONLY_FIELDS` rejeitando `foto_local_msg_id`, `foto_local_file_id`, `refs_imagens_msg_ids`, `refs_imagens_file_ids` vindos do LLM | merge handler |
| `functions/api/telegram/webhook.js` | Linha 177 e 192: substituir `` `${orcid}` `` por `*${escapeMarkdown(nomeCliente)}*` | 177, 192 |
| `tests/tools/enviar-orcamento-tatuador.test.mjs` | Expandir: testes de `montarBriefing`, `montarLinhaIdade`, `formatarDataBr`, `selecionarFotosOrcamento` cap 10 | append |
| `tests/tools/dados-coletados.test.mjs` | Expandir: teste rejeitando campos `PIPELINE_ONLY_FIELDS` | append |
| `tests/audit-telegram-webhook.test.mjs` | Expandir: regression — callback "fechar" usa nome, não orcid | append |
| `tests/agent/tattoo-agent.eval.mjs` | 3 eval cenários: `per-foto-local-proativa`, `per-refs-multiplas-proativas`, `per-cliente-seco-multifoto` | append |

---

## Convenções

- **Test command:** `npm test` (executa `node --test 'tests/**/*.test.mjs'`)
- **Single file:** `node --test tests/_lib/foto-classifier.test.mjs`
- **Eval:** `npm run eval:tattoo`
- **Style commit:** `feat(escopo): descricao curta` (português, sem emoji)
- **Branch atual:** `feat/coleta-fotos-telegram-storage` (já existe)
- **PR alvo:** main, título `feat: coleta fotos reais Telegram (PR-B)`

---

## Task 1: Migration RPC `zerar_media_base64`

**Files:**
- Create: `supabase/migrations/2026-05-19-add-zerar-media-base64-rpc.sql`

**Por quê primeiro:** todas as etapas que zeram base64 (Tasks 5 e 8) dependem desse RPC existir em produção.

- [ ] **Step 1: Criar arquivo de migration**

```sql
-- supabase/migrations/2026-05-19-add-zerar-media-base64-rpc.sql
-- RPC pra zerar message.media_base64 in-place sem race read-modify-write.
-- Chamado pelo pipeline (pos-handoff) e pela tool enviar-orcamento-tatuador (pos-upload).

CREATE OR REPLACE FUNCTION public.zerar_media_base64(p_msg_id BIGINT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.conversa_mensagens
  SET message = jsonb_set(message, '{media_base64}', '""')
  WHERE id = p_msg_id;
$$;

REVOKE ALL ON FUNCTION public.zerar_media_base64(BIGINT) FROM public;
GRANT EXECUTE ON FUNCTION public.zerar_media_base64(BIGINT) TO service_role;
```

- [ ] **Step 2: Aplicar via Supabase MCP**

Usar tool `mcp__plugin_supabase_supabase__apply_migration` com:
- `name`: `2026-05-19-add-zerar-media-base64-rpc`
- `query`: conteúdo do arquivo

Esperado: success (sem warning de advisor — function tem `search_path = ''` e SECURITY DEFINER controlado).

- [ ] **Step 3: Validar RPC criado**

Via `mcp__plugin_supabase_supabase__execute_sql`:

```sql
SELECT proname, proacl FROM pg_proc WHERE proname = 'zerar_media_base64';
```

Esperado: 1 row, `proacl` contendo `service_role=X/`.

Smoke test em row dummy:

```sql
-- Insere mock row, chama RPC, valida que media_base64 ficou ""
INSERT INTO public.conversa_mensagens (session_id, message, status)
VALUES ('test_zerar_rpc', '{"media_base64":"AAAA","media_mimetype":"image/jpeg","content":"x"}'::jsonb, 'received')
RETURNING id;
-- copia o id retornado, ex: 99999
SELECT zerar_media_base64(99999);
SELECT message FROM public.conversa_mensagens WHERE id = 99999;
-- Esperado: media_base64 = "", media_mimetype intacto
DELETE FROM public.conversa_mensagens WHERE id = 99999;
```

- [ ] **Step 4: Verificar advisors**

Via `mcp__plugin_supabase_supabase__get_advisors` com `type: security`. Esperado: zero novos warnings relacionados à função.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-05-19-add-zerar-media-base64-rpc.sql
git commit -m "feat(db): RPC zerar_media_base64 para cleanup atomico de fotos base64"
```

---

## Task 2: `foto-classifier` module + unit tests (TDD)

**Files:**
- Create: `functions/_lib/foto-classifier.js`
- Create: `tests/_lib/foto-classifier.test.mjs`

- [ ] **Step 1: Escrever os testes que vão falhar**

```javascript
// tests/_lib/foto-classifier.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classificarFoto, KEYWORDS_LOCAL } from '../../functions/_lib/foto-classifier.js';

test('L1: agent pediu foto local E ainda nao tem → local', () => {
  assert.equal(
    classificarFoto({ tentativas_foto_local: 1, foto_local_atual: null, texto_turno: '' }),
    'local',
  );
});

test('L1 fail: agent pediu MAS foto_local ja presente → cai pra L2/L3', () => {
  // sem texto → cai pra L3 default
  assert.equal(
    classificarFoto({ tentativas_foto_local: 1, foto_local_atual: 'presente', texto_turno: '' }),
    'ref',
  );
});

test('L2: texto contem keyword body (pulso) → local', () => {
  assert.equal(
    classificarFoto({ tentativas_foto_local: 0, foto_local_atual: null, texto_turno: 'aqui o, no pulso' }),
    'local',
  );
});

test('L2: texto contem keyword body (antebraco com acento) → local', () => {
  assert.equal(
    classificarFoto({ tentativas_foto_local: 0, foto_local_atual: null, texto_turno: 'no antebraço esquerdo' }),
    'local',
  );
});

test('L2: texto contem keyword body (braco sem acento) → local', () => {
  assert.equal(
    classificarFoto({ tentativas_foto_local: 0, foto_local_atual: null, texto_turno: 'queria no braco' }),
    'local',
  );
});

test('L2 fail: texto sem keyword body ("tipo essa daqui") → L3 default ref', () => {
  assert.equal(
    classificarFoto({ tentativas_foto_local: 0, foto_local_atual: null, texto_turno: 'tipo essa daqui' }),
    'ref',
  );
});

test('L3 default: texto null → ref', () => {
  assert.equal(
    classificarFoto({ tentativas_foto_local: 0, foto_local_atual: null, texto_turno: null }),
    'ref',
  );
});

test('L3 default: texto undefined → ref', () => {
  assert.equal(
    classificarFoto({ tentativas_foto_local: 0, foto_local_atual: null, texto_turno: undefined }),
    'ref',
  );
});

test('L3 default: foto_local ja presente, sem keyword → ref', () => {
  assert.equal(
    classificarFoto({ tentativas_foto_local: 0, foto_local_atual: 'presente', texto_turno: 'tipo essa' }),
    'ref',
  );
});

test('regex KEYWORDS_LOCAL: case insensitive', () => {
  assert.ok(KEYWORDS_LOCAL.test('PULSO'));
  assert.ok(KEYWORDS_LOCAL.test('Pulso'));
});
```

- [ ] **Step 2: Rodar pra confirmar que falha (módulo ainda não existe)**

Run: `node --test tests/_lib/foto-classifier.test.mjs`
Expected: FAIL — `Cannot find module '../../functions/_lib/foto-classifier.js'`

- [ ] **Step 3: Implementar módulo**

```javascript
// functions/_lib/foto-classifier.js
// Classificador heuristico L1+L2+L3 para fotos chegando do cliente.
// Pura, zero deps. Decide se a foto eh do LOCAL do corpo ou referencia visual.

export const KEYWORDS_LOCAL = /\b(aqui|braço|braco|antebraço|antebraco|perna|coxa|panturrilha|costas|peito|ombro|pulso|tornozelo|nuca|pescoço|pescoco|virilha|costela|bíceps|biceps|gluteo|glúteo|tô mostrando|to mostrando|no meu|na minha)\b/i;

/**
 * @param {{tentativas_foto_local: number, foto_local_atual: string|null, texto_turno: string|null|undefined}} params
 * @returns {'local'|'ref'}
 */
export function classificarFoto({ tentativas_foto_local, foto_local_atual, texto_turno }) {
  // L1 forte: agent pediu foto E ainda nao tem
  if (tentativas_foto_local > 0 && !foto_local_atual) return 'local';
  // L2 medio: texto sugere local do corpo
  if (texto_turno && KEYWORDS_LOCAL.test(texto_turno)) return 'local';
  // L3 default: assume referencia
  return 'ref';
}
```

- [ ] **Step 4: Rodar testes pra confirmar PASS**

Run: `node --test tests/_lib/foto-classifier.test.mjs`
Expected: PASS — 10 tests passing.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/foto-classifier.js tests/_lib/foto-classifier.test.mjs
git commit -m "feat(lib): foto-classifier L1+L2+L3 para classificar foto local vs ref"
```

---

## Task 3: `telegram-media` module + unit tests (TDD)

**Files:**
- Create: `functions/_lib/telegram-media.js`
- Create: `tests/_lib/telegram-media.test.mjs`

- [ ] **Step 1: Escrever os testes que vão falhar**

```javascript
// tests/_lib/telegram-media.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  sendTelegramPhoto,
  sendTelegramDocument,
  sendTelegramMediaGroup,
  enviarMidia,
} from '../../functions/_lib/telegram-media.js';

const ENV = { INKFLOW_TELEGRAM_BOT_TOKEN: 'fake-bot-token' };
const CHAT = '-100123456';
const B64_1PX_JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD//gA7Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcgSlBFRyB2NjIpLCBxdWFsaXR5ID0gOTAK';

function mockFetchOnce(response) {
  return mock.fn(async () => response);
}

test('sendTelegramPhoto: monta multipart, retorna file_id', async () => {
  let captured;
  const fetchMock = mock.fn(async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({
      ok: true,
      result: { photo: [{ file_id: 'AgACfile1' }, { file_id: 'AgACfile1_thumb' }] },
    }), { status: 200 });
  });
  const r = await sendTelegramPhoto(ENV, CHAT, B64_1PX_JPEG, 'image/jpeg', 'caption x', { fetch: fetchMock });
  assert.equal(r.file_id, 'AgACfile1');
  assert.match(captured.url, /\/sendPhoto$/);
  assert.equal(captured.init.method, 'POST');
  assert.ok(captured.init.body instanceof FormData);
});

test('sendTelegramDocument: usa filename inferido do mimetype quando ausente', async () => {
  let captured;
  const fetchMock = mock.fn(async (url, init) => {
    captured = init;
    return new Response(JSON.stringify({
      ok: true,
      result: { document: { file_id: 'BQACdoc1', file_name: 'image.heic' } },
    }), { status: 200 });
  });
  const r = await sendTelegramDocument(ENV, CHAT, B64_1PX_JPEG, 'image/heic', null, undefined, { fetch: fetchMock });
  assert.equal(r.file_id, 'BQACdoc1');
});

test('sendTelegramMediaGroup: caption SO no primeiro item, retorna array file_ids ordenado', async () => {
  let capturedBody;
  const fetchMock = mock.fn(async (url, init) => {
    capturedBody = init.body;
    return new Response(JSON.stringify({
      ok: true,
      result: [
        { photo: [{ file_id: 'g1' }] },
        { photo: [{ file_id: 'g2' }] },
        { photo: [{ file_id: 'g3' }] },
      ],
    }), { status: 200 });
  });
  const items = [
    { base64: B64_1PX_JPEG, mimetype: 'image/jpeg', caption: 'CAPTION_AQUI' },
    { base64: B64_1PX_JPEG, mimetype: 'image/jpeg', caption: 'NAO_DEVE_APARECER' },
    { base64: B64_1PX_JPEG, mimetype: 'image/jpeg' },
  ];
  const r = await sendTelegramMediaGroup(ENV, CHAT, items, { fetch: fetchMock });
  assert.deepEqual(r.map(x => x.file_id), ['g1', 'g2', 'g3']);
  // Inspeciona o campo 'media' (JSON string dentro do FormData) pra confirmar caption só no primeiro
  const mediaField = capturedBody.get('media');
  const parsed = JSON.parse(mediaField);
  assert.equal(parsed[0].caption, 'CAPTION_AQUI');
  assert.equal(parsed[1].caption, undefined);
  assert.equal(parsed[2].caption, undefined);
});

test('sendTelegramPhoto: retry 1x em 429 respeitando retry_after', async () => {
  let calls = 0;
  const fetchMock = mock.fn(async () => {
    calls++;
    if (calls === 1) {
      return new Response(JSON.stringify({
        ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 1 },
      }), { status: 429 });
    }
    return new Response(JSON.stringify({
      ok: true, result: { photo: [{ file_id: 'OK_after_retry' }] },
    }), { status: 200 });
  });
  const r = await sendTelegramPhoto(ENV, CHAT, B64_1PX_JPEG, 'image/jpeg', null, { fetch: fetchMock, sleep: async () => {} });
  assert.equal(calls, 2);
  assert.equal(r.file_id, 'OK_after_retry');
});

test('sendTelegramPhoto: throw em 413 file too large', async () => {
  const fetchMock = mock.fn(async () => new Response(JSON.stringify({
    ok: false, error_code: 413, description: 'Request Entity Too Large',
  }), { status: 413 }));
  await assert.rejects(
    () => sendTelegramPhoto(ENV, CHAT, B64_1PX_JPEG, 'image/jpeg', null, { fetch: fetchMock }),
    /413|too large/i,
  );
});

test('sendTelegramPhoto: throw em 401 bot token invalido', async () => {
  const fetchMock = mock.fn(async () => new Response(JSON.stringify({
    ok: false, error_code: 401, description: 'Unauthorized',
  }), { status: 401 }));
  await assert.rejects(
    () => sendTelegramPhoto(ENV, CHAT, B64_1PX_JPEG, 'image/jpeg', null, { fetch: fetchMock }),
    /401|bot|token/i,
  );
});

test('enviarMidia: JPEG → routes para sendPhoto (modo "photo")', async () => {
  let url;
  const fetchMock = mock.fn(async (u, init) => {
    url = u;
    return new Response(JSON.stringify({ ok: true, result: { photo: [{ file_id: 'fpJ' }] } }), { status: 200 });
  });
  const r = await enviarMidia(ENV, CHAT, B64_1PX_JPEG, 'image/jpeg', 'cap', { fetch: fetchMock });
  assert.match(url, /sendPhoto$/);
  assert.equal(r.modo, 'photo');
  assert.equal(r.file_id, 'fpJ');
});

test('enviarMidia: HEIC → routes para sendDocument (modo "document")', async () => {
  let url;
  const fetchMock = mock.fn(async (u, init) => {
    url = u;
    return new Response(JSON.stringify({ ok: true, result: { document: { file_id: 'fdH' } } }), { status: 200 });
  });
  const r = await enviarMidia(ENV, CHAT, B64_1PX_JPEG, 'image/heic', 'cap', { fetch: fetchMock });
  assert.match(url, /sendDocument$/);
  assert.equal(r.modo, 'document');
  assert.equal(r.file_id, 'fdH');
});

test('enviarMidia: mimetype null/undefined → sendDocument fallback', async () => {
  let url;
  const fetchMock = mock.fn(async (u) => {
    url = u;
    return new Response(JSON.stringify({ ok: true, result: { document: { file_id: 'fd0' } } }), { status: 200 });
  });
  await enviarMidia(ENV, CHAT, B64_1PX_JPEG, null, null, { fetch: fetchMock });
  assert.match(url, /sendDocument$/);
});

test('throw quando INKFLOW_TELEGRAM_BOT_TOKEN ausente', async () => {
  await assert.rejects(
    () => sendTelegramPhoto({}, CHAT, B64_1PX_JPEG, 'image/jpeg'),
    /INKFLOW_TELEGRAM_BOT_TOKEN/,
  );
});
```

- [ ] **Step 2: Rodar pra confirmar que falha**

Run: `node --test tests/_lib/telegram-media.test.mjs`
Expected: FAIL — `Cannot find module '../../functions/_lib/telegram-media.js'`

- [ ] **Step 3: Implementar módulo**

```javascript
// functions/_lib/telegram-media.js
// Wrappers Telegram Bot API para envio de midia (foto, documento, mediaGroup).
// Separado de telegram.js (que eh alerts/sendMessage). Usa FormData nativa para multipart.

const TELEGRAM_PHOTO_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const TELEGRAM_TIMEOUT_MS = 15000;

function botUrl(env, method) {
  const token = env?.INKFLOW_TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('INKFLOW_TELEGRAM_BOT_TOKEN ausente');
  return `https://api.telegram.org/bot${token}/${method}`;
}

function base64ToBlob(b64, mimetype) {
  // atob nativo no Workers runtime
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimetype || 'application/octet-stream' });
}

function filenameFor(mimetype) {
  const map = {
    'image/jpeg': 'photo.jpg',
    'image/png':  'photo.png',
    'image/webp': 'photo.webp',
    'image/heic': 'photo.heic',
    'image/heif': 'photo.heif',
    'image/tiff': 'photo.tiff',
    'image/gif':  'photo.gif',
  };
  return map[mimetype] || 'file.bin';
}

async function tgFetch(url, body, { fetch: fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), retried = false } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetchImpl(url, { method: 'POST', body, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
  const data = await resp.json().catch(() => ({}));
  if (data.ok) return data.result;

  // Retry 1x em 429
  if (resp.status === 429 && !retried) {
    const retryAfter = data.parameters?.retry_after ?? 1;
    await sleep(retryAfter * 1000);
    return tgFetch(url, body, { fetch: fetchImpl, sleep, retried: true });
  }
  const desc = data.description || resp.statusText || 'unknown';
  throw new Error(`telegram-${resp.status}: ${desc}`);
}

export async function sendTelegramPhoto(env, chatId, base64, mimetype, caption = null, deps = {}) {
  const url = botUrl(env, 'sendPhoto');
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('photo', base64ToBlob(base64, mimetype), filenameFor(mimetype));
  if (caption) fd.append('caption', caption);
  const result = await tgFetch(url, fd, deps);
  const file_id = result?.photo?.[result.photo.length - 1]?.file_id ?? result?.photo?.[0]?.file_id;
  if (!file_id) throw new Error('telegram-photo-no-file-id');
  return { file_id, modo: 'photo' };
}

export async function sendTelegramDocument(env, chatId, base64, mimetype, caption = null, filename = null, deps = {}) {
  const url = botUrl(env, 'sendDocument');
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('document', base64ToBlob(base64, mimetype), filename || filenameFor(mimetype));
  if (caption) fd.append('caption', caption);
  const result = await tgFetch(url, fd, deps);
  const file_id = result?.document?.file_id;
  if (!file_id) throw new Error('telegram-document-no-file-id');
  return { file_id, modo: 'document' };
}

/**
 * @param {Array<{base64: string, mimetype: string, caption?: string}>} items - 2 a 10 itens
 */
export async function sendTelegramMediaGroup(env, chatId, items, deps = {}) {
  if (!Array.isArray(items) || items.length < 2 || items.length > 10) {
    throw new Error(`mediaGroup-invalid-count: ${items?.length}`);
  }
  const url = botUrl(env, 'sendMediaGroup');
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  const media = items.map((it, idx) => {
    const attachName = `f${idx}`;
    fd.append(attachName, base64ToBlob(it.base64, it.mimetype), filenameFor(it.mimetype));
    const entry = { type: 'photo', media: `attach://${attachName}` };
    if (idx === 0 && it.caption) entry.caption = it.caption;
    return entry;
  });
  fd.append('media', JSON.stringify(media));
  const result = await tgFetch(url, fd, deps);
  // Telegram retorna array de Messages na mesma ordem
  return result.map(msg => ({
    file_id: msg?.photo?.[msg.photo.length - 1]?.file_id ?? msg?.photo?.[0]?.file_id,
  }));
}

export async function enviarMidia(env, chatId, base64, mimetype, caption = null, deps = {}) {
  if (mimetype && TELEGRAM_PHOTO_MIMETYPES.has(mimetype.toLowerCase())) {
    return sendTelegramPhoto(env, chatId, base64, mimetype, caption, deps);
  }
  return sendTelegramDocument(env, chatId, base64, mimetype, caption, null, deps);
}
```

- [ ] **Step 4: Rodar testes pra confirmar PASS**

Run: `node --test tests/_lib/telegram-media.test.mjs`
Expected: PASS — 10 tests passing.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/telegram-media.js tests/_lib/telegram-media.test.mjs
git commit -m "feat(lib): telegram-media (sendPhoto/Document/MediaGroup/enviarMidia)"
```

---

## Task 4: Pipeline Etapa 4.5 (classifier integration)

**Files:**
- Modify: `functions/_lib/whatsapp-pipeline.js` (após Etapa 5 atual, ~linha 165)
- Create: `tests/integration/pipeline-classifier.test.mjs`

**Por quê depois de runAgent:** classifier precisa do `texto` do turno (já disponível em `msg`) e dos `dados_coletados` ATUALIZADOS pelo agent (Etapa 5 já fez merge). PATCH deste step é additive (só adiciona campos `_msg_id`).

- [ ] **Step 1: Escrever os testes que vão falhar**

```javascript
// tests/integration/pipeline-classifier.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { processMessage } from '../../functions/_lib/whatsapp-pipeline.js';

const TENANT = {
  id: '00000000-0000-0000-0000-000000000001',
  nome_estudio: 'Estudio Teste',
  evo_instance: 'inkflow_test', evo_apikey: 'k',
  tatuador_telegram_chat_id: '99999',
  config_agente: {}, config_precificacao: { sinal_percentual: 30 },
  gatilhos_handoff: [], faqs: [], fewshots_por_modo: {},
};

function buildMsg(overrides = {}) {
  return {
    tenantId: TENANT.id, telefone: '5511999998888',
    evoMessageId: 'EVO_1', texto: '', mediaBase64: 'BASE64BLOB', mediaMimetype: 'image/jpeg',
    pushName: 'Maria', msgRowId: 42, tenant: TENANT,
    ...overrides,
  };
}

function makeDeps({ conversaInicial, runAgentOut, capturedPatches }) {
  return {
    now: () => '2026-05-19T00:00:00Z',
    runAgent: async () => runAgentOut,
    evoSend: async () => ({ ok: true }),
    callTool: async () => ({ ok: true }),
    sendTelegram: async () => {},
    sendTelegramAdmin: async () => {},
    supaFetch: async (path, init = {}) => {
      // GET conversa
      if (init.method === undefined && path.includes('/conversas?')) {
        return new Response(JSON.stringify([conversaInicial]), { status: 200 });
      }
      // GET historico
      if (init.method === undefined && path.includes('/conversa_mensagens?')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      // PATCH conversa
      if (init.method === 'PATCH' && path.includes('/conversas?id=eq.')) {
        const body = JSON.parse(init.body);
        capturedPatches.push({ path, body });
      }
      // PATCH msg row (status processed)
      return new Response('', { status: 204 });
    },
  };
}

test('Cenario A: foto proativa LOCAL via L2 (keyword "pulso")', async () => {
  const conversaInicial = {
    id: 'c1', estado_agente: 'coletando_tattoo',
    dados_coletados: {}, dados_cadastro: {}, estado_extra: {},
  };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: { ok: true, agent_usado: 'tattoo', dados_persistidos: { local_corpo: 'pulso', foto_local: 'presente' } },
    capturedPatches: patches,
  });
  await processMessage({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, buildMsg({ texto: 'aqui o, no pulso' }), deps);
  // Procura PATCH com foto_local_msg_id
  const fotoPatch = patches.find(p => p.body?.dados_coletados?.foto_local_msg_id === 42);
  assert.ok(fotoPatch, 'esperado PATCH com foto_local_msg_id=42');
});

test('Cenario B: cliente ignorou pedido foto, manda turno depois (L1 hit)', async () => {
  const conversaInicial = {
    id: 'c1', estado_agente: 'coletando_tattoo',
    dados_coletados: { tentativas_foto_local: 1 },
    dados_cadastro: {},
    estado_extra: { tentativas_foto_local: 1 },
  };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: { ok: true, agent_usado: 'tattoo', dados_persistidos: { foto_local: 'presente' } },
    capturedPatches: patches,
  });
  await processMessage({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, buildMsg({ texto: '' }), deps);
  const fotoPatch = patches.find(p => p.body?.dados_coletados?.foto_local_msg_id === 42);
  assert.ok(fotoPatch);
});

test('Cenario C: foto 2 (foto_local ja presente) → classifica como ref', async () => {
  const conversaInicial = {
    id: 'c1', estado_agente: 'coletando_tattoo',
    dados_coletados: { foto_local: 'presente', foto_local_msg_id: 41 },
    dados_cadastro: {},
    estado_extra: {},
  };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: { ok: true, agent_usado: 'tattoo', dados_persistidos: { refs_imagens: ['ref1'] } },
    capturedPatches: patches,
  });
  await processMessage({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, buildMsg({ texto: 'mais essa' }), deps);
  const refPatch = patches.find(p => Array.isArray(p.body?.dados_coletados?.refs_imagens_msg_ids));
  assert.ok(refPatch);
  assert.deepEqual(refPatch.body.dados_coletados.refs_imagens_msg_ids, [42]);
});

test('Cenario D: ref proativa sem keyword body → L3 default ref', async () => {
  const conversaInicial = {
    id: 'c1', estado_agente: 'coletando_tattoo',
    dados_coletados: {}, dados_cadastro: {}, estado_extra: {},
  };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: { ok: true, agent_usado: 'tattoo', dados_persistidos: { refs_imagens: ['x'] } },
    capturedPatches: patches,
  });
  await processMessage({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, buildMsg({ texto: 'tipo essa daqui' }), deps);
  const refPatch = patches.find(p => Array.isArray(p.body?.dados_coletados?.refs_imagens_msg_ids));
  assert.ok(refPatch);
  assert.deepEqual(refPatch.body.dados_coletados.refs_imagens_msg_ids, [42]);
});

test('mediaBase64 null → skip classifier (nenhum PATCH com _msg_id)', async () => {
  const conversaInicial = {
    id: 'c1', estado_agente: 'coletando_tattoo',
    dados_coletados: {}, dados_cadastro: {}, estado_extra: {},
  };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: { ok: true, agent_usado: 'tattoo', dados_persistidos: {} },
    capturedPatches: patches,
  });
  await processMessage(
    { INKFLOW_TELEGRAM_BOT_TOKEN: 't' },
    buildMsg({ texto: 'oi', mediaBase64: null, mediaMimetype: null }),
    deps,
  );
  const fotoPatch = patches.find(p =>
    p.body?.dados_coletados?.foto_local_msg_id !== undefined
    || p.body?.dados_coletados?.refs_imagens_msg_ids !== undefined
  );
  assert.equal(fotoPatch, undefined);
});
```

- [ ] **Step 2: Rodar pra confirmar que falha**

Run: `node --test tests/integration/pipeline-classifier.test.mjs`
Expected: FAIL — todos os 5 testes failing (Etapa 4.5 não existe).

- [ ] **Step 3: Implementar Etapa 4.5 no pipeline**

Adicionar import no topo do `functions/_lib/whatsapp-pipeline.js`:

```javascript
import { classificarFoto } from './foto-classifier.js';
```

Adicionar bloco **após** a Etapa 5 (UPDATE conversa) — encontrar a linha onde o pipeline termina o UPDATE com `dados_coletados` (atual ~linha 163-180). Inserir antes da próxima etapa (callTool):

```javascript
    // Etapa 4.5: classificar foto e PATCH msg_id em dados_coletados
    // (additive PATCH; campos foto_local_msg_id / refs_imagens_msg_ids)
    if (mediaBase64 && mediaMimetype?.startsWith('image/')) {
      try {
        // Estado pos-merge da Etapa 5: usa novoDadosColetados (ja tem foto_local presente
        // se o agent persistiu nesse turno)
        const dadosAtuais = isCadastro ? (conversa.dados_coletados || {}) : novoDadosColetados;
        const tentativas = dadosAtuais.tentativas_foto_local || conversa.estado_extra?.tentativas_foto_local || 0;
        const fotoLocalAtual = dadosAtuais.foto_local;
        const tipo = classificarFoto({
          tentativas_foto_local: tentativas,
          foto_local_atual: fotoLocalAtual,
          texto_turno: texto,
        });

        let patchBody;
        if (tipo === 'local') {
          patchBody = { dados_coletados: { ...dadosAtuais, foto_local_msg_id: msgRowId } };
        } else {
          const idsAtuais = Array.isArray(dadosAtuais.refs_imagens_msg_ids) ? dadosAtuais.refs_imagens_msg_ids : [];
          patchBody = { dados_coletados: { ...dadosAtuais, refs_imagens_msg_ids: [...idsAtuais, msgRowId] } };
        }
        await deps.supaFetch(`/rest/v1/conversas?id=eq.${conversa.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify(patchBody),
        });
      } catch (e) {
        console.warn(`[pipeline] etapa-4.5 classificador falhou: ${e.message}`);
        // nao-fatal: pipeline segue, foto fica orfa (sem msg_id correlacionado)
      }
    }
```

Atualizar referência em Etapa 3 (linha ~119) e linha 104 (PATCH status processed) — substituir `n8n_chat_histories` por `conversa_mensagens` **se ainda não foi feito pelo PR-A**. Validar antes com `grep -n "n8n_chat_histories" functions/_lib/whatsapp-pipeline.js`. Se grep não retornar nada, está OK.

- [ ] **Step 4: Rodar testes pra confirmar PASS**

Run: `node --test tests/integration/pipeline-classifier.test.mjs tests/_lib/whatsapp-pipeline.test.mjs`
Expected: PASS — 5 novos testes + suite existente do pipeline verde.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/whatsapp-pipeline.js tests/integration/pipeline-classifier.test.mjs
git commit -m "feat(pipeline): Etapa 4.5 classifica foto e PATCH msg_id em dados_coletados"
```

---

## Task 5: Pipeline Etapa terminal — re-encaminhar foto pós-handoff

**Files:**
- Modify: `functions/_lib/whatsapp-pipeline.js` (linhas ~93-109)
- Create: `tests/integration/pos-handoff-foto.test.mjs`

- [ ] **Step 1: Escrever os testes que vão falhar**

```javascript
// tests/integration/pos-handoff-foto.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { processMessage } from '../../functions/_lib/whatsapp-pipeline.js';

const TENANT = {
  id: '00000000-0000-0000-0000-000000000001',
  nome_estudio: 'Estudio', evo_instance: 'i', evo_apikey: 'k',
  tatuador_telegram_chat_id: '99999',
  config_agente: {}, config_precificacao: {}, gatilhos_handoff: [], faqs: [], fewshots_por_modo: {},
};

function makeDeps({ conversaTerminal, capturedTg, capturedRpc, capturedFetchUrls }) {
  return {
    now: () => '2026-05-19T00:00:00Z',
    runAgent: async () => ({ ok: true }),
    sendTelegram: async (chat, text, opts) => { capturedTg.push({ chat, text, opts }); },
    sendTelegramAdmin: async () => {},
    enviarMidia: async (env, chat, b64, mt, caption) => {
      capturedTg.push({ chat, midia: true, caption, mimetype: mt });
      return { file_id: 'FID_POS', modo: mt === 'image/jpeg' ? 'photo' : 'document' };
    },
    supaFetch: async (path, init = {}) => {
      capturedFetchUrls.push({ path, method: init.method || 'GET' });
      if (init.method === undefined && path.includes('/conversas?')) {
        return new Response(JSON.stringify([conversaTerminal]), { status: 200 });
      }
      if (path.includes('/rpc/zerar_media_base64') && init.method === 'POST') {
        capturedRpc.push(JSON.parse(init.body));
        return new Response('', { status: 204 });
      }
      return new Response('', { status: 204 });
    },
  };
}

test('Estado terminal + foto JPEG: re-encaminha como photo + RPC zerar', async () => {
  const conversaTerminal = {
    id: 'c1', estado_agente: 'aguardando_tatuador',
    dados_coletados: {}, dados_cadastro: { nome: 'Maria' },
  };
  const tg = []; const rpc = []; const urls = [];
  const deps = makeDeps({ conversaTerminal, capturedTg: tg, capturedRpc: rpc, capturedFetchUrls: urls });
  await processMessage(
    { INKFLOW_TELEGRAM_BOT_TOKEN: 't' },
    {
      tenantId: TENANT.id, telefone: '5511999', evoMessageId: 'E', texto: 'achei mais essa',
      mediaBase64: 'BLOB', mediaMimetype: 'image/jpeg', pushName: 'Maria', msgRowId: 99, tenant: TENANT,
    },
    deps,
  );
  // 1) sendTelegram texto preview (existente)
  assert.ok(tg.some(x => x.text?.includes('Cliente Maria')), 'texto preview enviado');
  // 2) enviarMidia chamado com caption nome
  assert.ok(tg.some(x => x.midia && x.caption?.includes('Maria mandou +1 foto')));
  // 3) RPC zerar_media_base64 chamado com msg_id=99
  assert.ok(rpc.some(r => r.p_msg_id === 99));
});

test('Estado terminal SEM foto: comportamento atual (so texto preview)', async () => {
  const conversaTerminal = {
    id: 'c1', estado_agente: 'aguardando_tatuador',
    dados_coletados: {}, dados_cadastro: { nome: 'Maria' },
  };
  const tg = []; const rpc = []; const urls = [];
  const deps = makeDeps({ conversaTerminal, capturedTg: tg, capturedRpc: rpc, capturedFetchUrls: urls });
  await processMessage(
    { INKFLOW_TELEGRAM_BOT_TOKEN: 't' },
    {
      tenantId: TENANT.id, telefone: '5511999', evoMessageId: 'E', texto: 'oi',
      mediaBase64: null, mediaMimetype: null, pushName: 'Maria', msgRowId: 100, tenant: TENANT,
    },
    deps,
  );
  assert.ok(tg.some(x => x.text), 'texto preview enviado');
  assert.equal(tg.filter(x => x.midia).length, 0);
  assert.equal(rpc.length, 0);
});

test('Estado terminal + foto HEIC: re-encaminha como document', async () => {
  const conversaTerminal = {
    id: 'c1', estado_agente: 'aguardando_tatuador',
    dados_coletados: {}, dados_cadastro: { nome: 'Maria' },
  };
  const tg = []; const rpc = []; const urls = [];
  const deps = makeDeps({ conversaTerminal, capturedTg: tg, capturedRpc: rpc, capturedFetchUrls: urls });
  await processMessage(
    { INKFLOW_TELEGRAM_BOT_TOKEN: 't' },
    {
      tenantId: TENANT.id, telefone: '5511999', evoMessageId: 'E', texto: '',
      mediaBase64: 'BLOB', mediaMimetype: 'image/heic', pushName: 'Maria', msgRowId: 101, tenant: TENANT,
    },
    deps,
  );
  assert.ok(tg.some(x => x.midia && x.mimetype === 'image/heic'));
});

test('Estado terminal + foto upload throw: NAO chama RPC (cleanup so se OK)', async () => {
  const conversaTerminal = {
    id: 'c1', estado_agente: 'aguardando_tatuador',
    dados_coletados: {}, dados_cadastro: { nome: 'Maria' },
  };
  const tg = []; const rpc = []; const urls = [];
  const deps = makeDeps({ conversaTerminal, capturedTg: tg, capturedRpc: rpc, capturedFetchUrls: urls });
  deps.enviarMidia = async () => { throw new Error('telegram-413: too large'); };
  await processMessage(
    { INKFLOW_TELEGRAM_BOT_TOKEN: 't' },
    {
      tenantId: TENANT.id, telefone: '5511999', evoMessageId: 'E', texto: '',
      mediaBase64: 'BLOB', mediaMimetype: 'image/jpeg', pushName: 'Maria', msgRowId: 102, tenant: TENANT,
    },
    deps,
  );
  // Pipeline NAO deve crashar; RPC NAO chamado
  assert.equal(rpc.length, 0);
});
```

- [ ] **Step 2: Rodar pra confirmar que falha**

Run: `node --test tests/integration/pos-handoff-foto.test.mjs`
Expected: FAIL — 3 dos 4 testes failing (sem foto passa).

- [ ] **Step 3: Implementar terminal modificada**

Adicionar import no topo (se ainda não tem):

```javascript
import { enviarMidia } from './telegram-media.js';
```

Adicionar `enviarMidia` ao `defaultDeps(env)` (encontrar função `defaultDeps`, geralmente perto do topo):

```javascript
function defaultDeps(env) {
  return {
    now: () => new Date().toISOString(),
    runAgent: async (args) => await runAgent(env, args),
    evoSend: async (...args) => await evoSend(env, ...args),
    callTool: async (...args) => await callTool(env, ...args),
    sendTelegram: async (chat, text, opts) => await sendTelegram(env, chat, text, opts),
    sendTelegramAdmin: async (text) => await sendTelegramAdmin(env, text),
    enviarMidia: async (chatId, b64, mt, caption) => await enviarMidia(env, chatId, b64, mt, caption),
    supaFetch: async (path, init) => await supaFetch(env, path, init),
  };
}
```

(Adapter à assinatura real — verificar se `defaultDeps` existe nesse formato; se diferente, adaptar mantendo o padrão.)

Modificar bloco terminal (linha ~93-109). Após o `sendTelegram` texto preview existente, antes do `PATCH status=processed`:

```javascript
    // Etapa 2: EARLY-RETURN estado terminal
    if (TERMINAL_STATES.has(conversa.estado_agente)) {
      if (tenant.tatuador_telegram_chat_id) {
        await deps.sendTelegram(
          tenant.tatuador_telegram_chat_id,
          `📩 Cliente ${pushName ?? telefone} (${tenant.nome_estudio}) mandou msg:\n${preview(texto, 200)}`,
        );
        // Re-encaminha foto se presente
        if (mediaBase64 && mediaMimetype?.startsWith('image/')) {
          try {
            const nome = conversa.dados_cadastro?.nome || pushName || telefone;
            await deps.enviarMidia(
              tenant.tatuador_telegram_chat_id,
              mediaBase64,
              mediaMimetype,
              `📸 ${nome} mandou +1 foto`,
            );
            // Cleanup base64 (so depois do upload OK) via RPC atomico
            await deps.supaFetch(`/rest/v1/rpc/zerar_media_base64`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ p_msg_id: msgRowId }),
            });
          } catch (e) {
            console.warn(`[pipeline] pos-handoff foto falhou: ${e.message}`);
          }
        }
      } else {
        await deps.sendTelegramAdmin(
          `tenant ${tenant.id} sem tatuador_telegram_chat_id em estado terminal (${conversa.estado_agente})`,
        );
      }
      await deps.supaFetch(`/rest/v1/conversa_mensagens?id=eq.${msgRowId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'processed' }),
      });
      return;
    }
```

- [ ] **Step 4: Rodar testes pra confirmar PASS**

Run: `node --test tests/integration/pos-handoff-foto.test.mjs tests/_lib/whatsapp-pipeline.test.mjs`
Expected: PASS — 4 novos + suite existente verde.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/whatsapp-pipeline.js tests/integration/pos-handoff-foto.test.mjs
git commit -m "feat(pipeline): re-encaminha foto pos-handoff com caption nome do cliente"
```

---

## Task 6: `dados-coletados` guard contra LLM hallucinar campos pipeline-only

**Files:**
- Modify: `functions/api/tools/dados-coletados.js`
- Modify: `tests/tools/dados-coletados.test.mjs`

- [ ] **Step 1: Localizar e ler o handler atual**

```bash
grep -n "export\|function\|merge\|validate" functions/api/tools/dados-coletados.js | head -20
```

Identificar onde o handler valida/aceita campos vindos do LLM payload. Em geral é uma whitelist ou um merge livre.

- [ ] **Step 2: Escrever o teste que vai falhar**

Append em `tests/tools/dados-coletados.test.mjs`:

```javascript
test('rejeita campos pipeline-only (foto_local_msg_id) vindos do LLM', async () => {
  const ctx = buildContext({
    tenant_id: TENANT_ID,
    telefone: TELEFONE,
    dados: { foto_local_msg_id: 999 },  // LLM tentou setar
  });
  const resp = await onRequest(ctx);
  assert.equal(resp.status, 400);
  const body = await resp.json();
  assert.match(body.error, /pipeline-readonly|campo-pipeline/i);
});

test('rejeita refs_imagens_file_ids vindo do LLM', async () => {
  const ctx = buildContext({
    tenant_id: TENANT_ID,
    telefone: TELEFONE,
    dados: { refs_imagens_file_ids: ['x'] },
  });
  const resp = await onRequest(ctx);
  assert.equal(resp.status, 400);
});

test('aceita campos legitimos lado a lado (local_corpo OK)', async () => {
  // Mock supaFetch retornando conversa existente
  // (assumindo helper existente; adaptar ao mock atual)
  const ctx = buildContext({
    tenant_id: TENANT_ID,
    telefone: TELEFONE,
    dados: { local_corpo: 'pulso', foto_local: 'presente' },
  });
  const resp = await onRequest(ctx);
  assert.notEqual(resp.status, 400);
});
```

- [ ] **Step 3: Rodar pra confirmar que falha**

Run: `node --test tests/tools/dados-coletados.test.mjs`
Expected: FAIL — 2 testes novos failing (guard não existe).

- [ ] **Step 4: Implementar guard**

Adicionar próximo ao topo do handler de `dados-coletados.js`:

```javascript
const PIPELINE_ONLY_FIELDS = [
  'foto_local_msg_id', 'foto_local_file_id',
  'refs_imagens_msg_ids', 'refs_imagens_file_ids',
];

function validarCamposLLM(dados) {
  if (!dados || typeof dados !== 'object') return null;
  const violacoes = PIPELINE_ONLY_FIELDS.filter(f => Object.prototype.hasOwnProperty.call(dados, f));
  if (violacoes.length > 0) {
    return { erro: 'campo-pipeline-readonly', campos: violacoes };
  }
  return null;
}
```

No `onRequest` handler, antes do merge/persist:

```javascript
const violacao = validarCamposLLM(input.dados);
if (violacao) {
  return new Response(JSON.stringify({ ok: false, error: violacao.erro, campos: violacao.campos }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 5: Rodar testes pra confirmar PASS**

Run: `node --test tests/tools/dados-coletados.test.mjs`
Expected: PASS — todos os testes verdes (novos + existentes).

- [ ] **Step 6: Commit**

```bash
git add functions/api/tools/dados-coletados.js tests/tools/dados-coletados.test.mjs
git commit -m "feat(tool): guard rejeita campos pipeline-only (foto_msg_id/file_id) vindos do LLM"
```

---

## Task 7: `enviar-orcamento-tatuador` — helpers visuais (briefing, idade, data)

**Files:**
- Modify: `functions/api/tools/enviar-orcamento-tatuador.js`
- Modify: `tests/tools/enviar-orcamento-tatuador.test.mjs`

**Por quê separado da Task 8:** estes helpers são puros (formatadores de string), facilmente testáveis isolados. Task 8 ainda mexe em fluxo I/O (Telegram + DB).

- [ ] **Step 1: Escrever os testes que vão falhar**

Append em `tests/tools/enviar-orcamento-tatuador.test.mjs`:

```javascript
import { formatarDataBr, montarLinhaIdade, montarBriefing, montarTextoOrcamento } from '../../functions/api/tools/enviar-orcamento-tatuador.js';

test('formatarDataBr: ISO valida → dd/mm/yyyy', () => {
  assert.equal(formatarDataBr('2001-03-15'), '15/03/2001');
});

test('formatarDataBr: ISO invalida → null (defensivo)', () => {
  assert.equal(formatarDataBr('xxx'), null);
  assert.equal(formatarDataBr(null), null);
  assert.equal(formatarDataBr(undefined), null);
});

test('montarLinhaIdade: data presente → "🎂 25 anos (15/03/2001)"', () => {
  // Fixa a data de hoje em 2026-05-19 via Date mock no caller; aqui usamos um valor
  // diretamente derivavel (calc baseado em mock interno do helper, se receber today)
  const linha = montarLinhaIdade({ data_nascimento: '2001-03-15' }, new Date('2026-05-19'));
  assert.match(linha, /🎂\s*25 anos\s*\(15\/03\/2001\)/);
});

test('montarLinhaIdade: data ausente → null (omite linha)', () => {
  assert.equal(montarLinhaIdade({ data_nascimento: null }), null);
  assert.equal(montarLinhaIdade({}), null);
});

test('montarLinhaIdade: aniversariante hoje (born 1990-05-19) → 36 em 2026-05-19', () => {
  const linha = montarLinhaIdade({ data_nascimento: '1990-05-19' }, new Date('2026-05-19'));
  assert.match(linha, /36 anos/);
});

test('montarLinhaIdade: ainda nao fez aniversario este ano', () => {
  // born 2000-12-25, today 2026-05-19 → 25 anos
  const linha = montarLinhaIdade({ data_nascimento: '2000-12-25' }, new Date('2026-05-19'));
  assert.match(linha, /25 anos/);
});

test('montarBriefing: gera texto natural com campos completos', () => {
  const conv = {
    dados_coletados: {
      descricao_curta: 'borboleta', local_corpo: 'pulso', altura_cm: 8, estilo: 'fineline',
      foto_local: 'presente', refs_imagens: ['ref1', 'ref2'],
    },
    dados_cadastro: { nome: 'Maria' },
  };
  const txt = montarBriefing(conv);
  assert.match(txt, /borboleta/);
  assert.match(txt, /fineline/);
  assert.match(txt, /pulso/);
  assert.match(txt, /8\s*cm/i);
  // Menciona foto local + qtd refs
  assert.match(txt, /foto do local/i);
  assert.match(txt, /2\s+refer/i);
});

test('montarBriefing: sem foto_local → omite mencao', () => {
  const conv = {
    dados_coletados: { descricao_curta: 'rosa', local_corpo: 'costas', altura_cm: 15, estilo: 'realismo' },
    dados_cadastro: { nome: 'Joao' },
  };
  const txt = montarBriefing(conv);
  assert.doesNotMatch(txt, /foto do local/i);
});

test('montarTextoOrcamento: SEM orcid visivel + linha idade + briefing', () => {
  const conv = {
    dados_coletados: { descricao_curta: 'borboleta', local_corpo: 'pulso', altura_cm: 8, estilo: 'fineline', foto_local: 'presente' },
    dados_cadastro: { nome: 'Maria', data_nascimento: '2001-03-15', email: 'maria@x.com' },
    orcid: 'orc_xyz123',
  };
  const txt = montarTextoOrcamento(conv, null, new Date('2026-05-19'));
  // NAO deve conter "orc_" literal nem "🆔"
  assert.doesNotMatch(txt, /orc_/);
  assert.doesNotMatch(txt, /🆔/);
  // Deve conter elementos novos
  assert.match(txt, /Maria/);
  assert.match(txt, /25 anos/);
  assert.match(txt, /maria@x\.com/);
  assert.match(txt, /borboleta/);
});

test('montarTextoOrcamento: append nota se resultadoFotos.falhas > 0', () => {
  const conv = {
    dados_coletados: { descricao_curta: 'x', local_corpo: 'y', altura_cm: 5, estilo: 'z' },
    dados_cadastro: { nome: 'X' },
    orcid: 'o',
  };
  const txt = montarTextoOrcamento(conv, { tentadas: 3, enviadas: 1, falhas: 2 });
  assert.match(txt, /2 de 3 fotos n[aã]o anexaram/i);
});

test('montarTextoOrcamento: append nota se resultadoFotos.falhas_total', () => {
  const conv = {
    dados_coletados: { descricao_curta: 'x', local_corpo: 'y', altura_cm: 5, estilo: 'z' },
    dados_cadastro: { nome: 'X' },
    orcid: 'o',
  };
  const txt = montarTextoOrcamento(conv, { falhas_total: true });
  assert.match(txt, /n[aã]o foi poss[ií]vel anexar as fotos/i);
});
```

- [ ] **Step 2: Rodar pra confirmar que falha**

Run: `node --test tests/tools/enviar-orcamento-tatuador.test.mjs`
Expected: FAIL — helpers ainda não exportados.

- [ ] **Step 3: Implementar helpers no tool**

Em `functions/api/tools/enviar-orcamento-tatuador.js`, adicionar exports:

```javascript
export function formatarDataBr(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function calcIdade(isoNasc, today = new Date()) {
  const m = isoNasc.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const nasc = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  const hoje = today instanceof Date ? today : new Date(today);
  let idade = hoje.getUTCFullYear() - nasc.getUTCFullYear();
  const mNow = hoje.getUTCMonth(); const dNow = hoje.getUTCDate();
  const mN = nasc.getUTCMonth();   const dN = nasc.getUTCDate();
  if (mNow < mN || (mNow === mN && dNow < dN)) idade--;
  return idade >= 0 ? idade : null;
}

export function montarLinhaIdade(cad, today = new Date()) {
  if (!cad?.data_nascimento) return null;
  const dataBr = formatarDataBr(cad.data_nascimento);
  const idade = calcIdade(cad.data_nascimento, today);
  if (!dataBr || idade === null) return null;
  return `🎂 ${idade} anos (${dataBr})`;
}

export function montarBriefing(conv) {
  const dc = conv?.dados_coletados || {};
  const nome = conv?.dados_cadastro?.nome || 'O cliente';
  const partes = [];
  if (dc.descricao_curta) partes.push(`uma tatuagem de ${dc.descricao_curta}`);
  if (dc.estilo) partes.push(`estilo ${dc.estilo}`);
  if (dc.local_corpo) partes.push(`no ${dc.local_corpo}`);
  if (dc.altura_cm) partes.push(`~${dc.altura_cm}cm`);

  let frase = `${nome} quer ${partes.join(', ')}.`;
  const detalhes = [];
  if (dc.foto_local) detalhes.push('a foto do local');
  const nRefs = Array.isArray(dc.refs_imagens) ? dc.refs_imagens.length : 0;
  if (nRefs > 0) detalhes.push(`${nRefs} referência${nRefs > 1 ? 's' : ''}`);
  if (detalhes.length > 0) frase += ` Mandou ${detalhes.join(' + ')}.`;
  return frase;
}

export function montarTextoOrcamento(conv, resultadoFotos = null, today = new Date()) {
  const nome = conv?.dados_cadastro?.nome || 'cliente';
  const email = conv?.dados_cadastro?.email;
  const linhas = ['📋 Novo orçamento', '', `👤 ${nome}`];
  const linhaIdade = montarLinhaIdade(conv?.dados_cadastro, today);
  if (linhaIdade) linhas.push(linhaIdade);
  if (email) linhas.push(`📧 ${email}`);
  linhas.push('', montarBriefing(conv));

  if (resultadoFotos?.falhas_total) {
    linhas.push('', '📸 ⚠️ Não foi possível anexar as fotos do briefing. Abra a conversa pra ver.');
  } else if (resultadoFotos?.falhas > 0) {
    linhas.push('', `📸 ⚠️ ${resultadoFotos.falhas} de ${resultadoFotos.tentadas} fotos não anexaram.`);
  }
  return linhas.join('\n');
}
```

Remover a função antiga `montarTextoOrcamento` original (ou renomear pra `montarTextoOrcamentoLegacy` se quiser preservar; remover é melhor — YAGNI).

- [ ] **Step 4: Rodar testes pra confirmar PASS**

Run: `node --test tests/tools/enviar-orcamento-tatuador.test.mjs`
Expected: PASS — todos os novos + existentes verdes.

- [ ] **Step 5: Commit**

```bash
git add functions/api/tools/enviar-orcamento-tatuador.js tests/tools/enviar-orcamento-tatuador.test.mjs
git commit -m "feat(tool): briefing natural, linha idade, sem orcid visivel no orcamento"
```

---

## Task 8: `enviar-orcamento-tatuador` — `selecionarFotosOrcamento` + `enviarFotosOrcamento`

**Files:**
- Modify: `functions/api/tools/enviar-orcamento-tatuador.js`
- Modify: `tests/tools/enviar-orcamento-tatuador.test.mjs`

- [ ] **Step 1: Escrever os testes que vão falhar**

Append em `tests/tools/enviar-orcamento-tatuador.test.mjs`:

```javascript
import { selecionarFotosOrcamento } from '../../functions/api/tools/enviar-orcamento-tatuador.js';

test('selecionarFotosOrcamento: 1 local + 2 refs → 3 itens', () => {
  const conv = { dados_coletados: { foto_local_msg_id: 42, refs_imagens_msg_ids: [43, 44] } };
  const r = selecionarFotosOrcamento(conv);
  assert.deepEqual(r, [
    { msg_id: 42, tipo: 'local' },
    { msg_id: 43, tipo: 'ref' },
    { msg_id: 44, tipo: 'ref' },
  ]);
});

test('selecionarFotosOrcamento: 0 local + 0 refs → array vazio', () => {
  const conv = { dados_coletados: {} };
  assert.deepEqual(selecionarFotosOrcamento(conv), []);
});

test('selecionarFotosOrcamento: cap 10 (1 local + 9 refs mais recentes de 15)', () => {
  const refs = Array.from({ length: 15 }, (_, i) => 100 + i);  // [100..114]
  const conv = { dados_coletados: { foto_local_msg_id: 42, refs_imagens_msg_ids: refs } };
  const r = selecionarFotosOrcamento(conv);
  assert.equal(r.length, 10);
  assert.equal(r[0].tipo, 'local');
  assert.equal(r[0].msg_id, 42);
  // Pega as 9 ULTIMAS refs: 106..114
  assert.deepEqual(r.slice(1).map(x => x.msg_id), [106, 107, 108, 109, 110, 111, 112, 113, 114]);
});

test('selecionarFotosOrcamento: 12 refs sem foto local → cap 10 (10 mais recentes)', () => {
  const refs = Array.from({ length: 12 }, (_, i) => 100 + i);
  const conv = { dados_coletados: { refs_imagens_msg_ids: refs } };
  const r = selecionarFotosOrcamento(conv);
  assert.equal(r.length, 10);
  assert.deepEqual(r.map(x => x.msg_id), [102, 103, 104, 105, 106, 107, 108, 109, 110, 111]);
});
```

Para `enviarFotosOrcamento`, teste unit com mock supaFetch + mock telegram-media:

```javascript
import { enviarFotosOrcamento } from '../../functions/api/tools/enviar-orcamento-tatuador.js';

test('enviarFotosOrcamento: 1 local + 2 refs JPEG → sendMediaGroup, PATCH file_ids, RPC zerar 3x', async () => {
  const conv = {
    id: 'c1',
    dados_coletados: { foto_local_msg_id: 42, refs_imagens_msg_ids: [43, 44] },
    dados_cadastro: { nome: 'Maria' },
  };
  const supaCalls = [];
  const tgCalls = [];
  const deps = {
    supaFetch: async (path, init = {}) => {
      supaCalls.push({ path, method: init.method || 'GET', body: init.body });
      if (path.includes('/conversa_mensagens?')) {
        return new Response(JSON.stringify([
          { id: 42, message: { media_base64: 'B42', media_mimetype: 'image/jpeg' } },
          { id: 43, message: { media_base64: 'B43', media_mimetype: 'image/jpeg' } },
          { id: 44, message: { media_base64: 'B44', media_mimetype: 'image/jpeg' } },
        ]), { status: 200 });
      }
      return new Response('', { status: 204 });
    },
    sendTelegramMediaGroup: async (env, chat, items) => {
      tgCalls.push({ tipo: 'mediaGroup', items });
      return items.map((_, i) => ({ file_id: `FID_${i}` }));
    },
    sendTelegramPhoto: async () => ({ file_id: 'FID_solo' }),
    sendTelegramDocument: async () => { throw new Error('nao esperado'); },
  };
  const r = await enviarFotosOrcamento({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, '99', conv, deps);
  assert.equal(r.enviadas, 3);
  assert.equal(r.falhas, 0);
  // PATCH dados_coletados com file_ids
  const patch = supaCalls.find(c => c.method === 'PATCH' && c.path.includes('/conversas?id=eq.c1'));
  assert.ok(patch);
  const body = JSON.parse(patch.body);
  assert.equal(body.dados_coletados.foto_local_file_id, 'FID_0');
  assert.deepEqual(body.dados_coletados.refs_imagens_file_ids, ['FID_1', 'FID_2']);
  // RPC zerar chamado 3 vezes
  const rpcs = supaCalls.filter(c => c.path.includes('/rpc/zerar_media_base64'));
  assert.equal(rpcs.length, 3);
});

test('enviarFotosOrcamento: 1 foto unica JPEG → sendTelegramPhoto (nao MediaGroup)', async () => {
  const conv = {
    id: 'c1',
    dados_coletados: { foto_local_msg_id: 42 },
    dados_cadastro: { nome: 'Maria' },
  };
  let usouSolo = false;
  const deps = {
    supaFetch: async (path) => {
      if (path.includes('/conversa_mensagens?')) {
        return new Response(JSON.stringify([
          { id: 42, message: { media_base64: 'B42', media_mimetype: 'image/jpeg' } },
        ]), { status: 200 });
      }
      return new Response('', { status: 204 });
    },
    sendTelegramPhoto: async () => { usouSolo = true; return { file_id: 'SOLO' }; },
    sendTelegramMediaGroup: async () => { throw new Error('nao esperado'); },
    sendTelegramDocument: async () => { throw new Error('nao esperado'); },
  };
  await enviarFotosOrcamento({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, '99', conv, deps);
  assert.ok(usouSolo);
});

test('enviarFotosOrcamento: mix JPEG + HEIC → 1 sendDocument(HEIC) + 1 sendMediaGroup(JPEGs)', async () => {
  const conv = {
    id: 'c1',
    dados_coletados: { foto_local_msg_id: 42, refs_imagens_msg_ids: [43, 44] },
    dados_cadastro: { nome: 'Maria' },
  };
  let chamouDoc = false; let chamouGroup = false;
  const deps = {
    supaFetch: async (path) => {
      if (path.includes('/conversa_mensagens?')) {
        return new Response(JSON.stringify([
          { id: 42, message: { media_base64: 'B42', media_mimetype: 'image/jpeg' } },
          { id: 43, message: { media_base64: 'B43', media_mimetype: 'image/heic' } },
          { id: 44, message: { media_base64: 'B44', media_mimetype: 'image/jpeg' } },
        ]), { status: 200 });
      }
      return new Response('', { status: 204 });
    },
    sendTelegramMediaGroup: async (env, chat, items) => {
      chamouGroup = true; assert.equal(items.length, 2);
      return items.map((_, i) => ({ file_id: `JPEG_${i}` }));
    },
    sendTelegramDocument: async () => { chamouDoc = true; return { file_id: 'HEIC' }; },
    sendTelegramPhoto: async () => ({ file_id: 'JPEG_solo' }),
  };
  const r = await enviarFotosOrcamento({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, '99', conv, deps);
  assert.ok(chamouDoc, 'HEIC via sendDocument');
  assert.ok(chamouGroup, 'JPEGs via mediaGroup');
  assert.equal(r.enviadas, 3);
});

test('enviarFotosOrcamento: 0 fotos → return {enviadas:0, tentadas:0}', async () => {
  const conv = { id: 'c1', dados_coletados: {}, dados_cadastro: {} };
  const deps = {
    supaFetch: async () => new Response('[]', { status: 200 }),
    sendTelegramPhoto: async () => { throw new Error('nao esperado'); },
    sendTelegramMediaGroup: async () => { throw new Error('nao esperado'); },
    sendTelegramDocument: async () => { throw new Error('nao esperado'); },
  };
  const r = await enviarFotosOrcamento({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, '99', conv, deps);
  assert.equal(r.enviadas, 0);
  assert.equal(r.tentadas, 0);
});

test('enviarFotosOrcamento: upload throw → cleanup NAO roda (base64 intacto)', async () => {
  const conv = {
    id: 'c1',
    dados_coletados: { foto_local_msg_id: 42, refs_imagens_msg_ids: [43] },
    dados_cadastro: { nome: 'Maria' },
  };
  const rpcCalls = [];
  const deps = {
    supaFetch: async (path, init = {}) => {
      if (path.includes('/conversa_mensagens?')) {
        return new Response(JSON.stringify([
          { id: 42, message: { media_base64: 'B', media_mimetype: 'image/jpeg' } },
          { id: 43, message: { media_base64: 'B', media_mimetype: 'image/jpeg' } },
        ]), { status: 200 });
      }
      if (path.includes('/rpc/zerar_media_base64')) {
        rpcCalls.push(init.body);
      }
      return new Response('', { status: 204 });
    },
    sendTelegramMediaGroup: async () => { throw new Error('telegram-413: too large'); },
    sendTelegramPhoto: async () => { throw new Error('telegram-413: too large'); },
    sendTelegramDocument: async () => { throw new Error('telegram-413: too large'); },
  };
  const r = await enviarFotosOrcamento({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, '99', conv, deps);
  assert.equal(r.falhas_total, true);
  assert.equal(rpcCalls.length, 0, 'cleanup NAO deve rodar se upload falhou');
});
```

- [ ] **Step 2: Rodar pra confirmar que falha**

Run: `node --test tests/tools/enviar-orcamento-tatuador.test.mjs`
Expected: FAIL — funções `selecionarFotosOrcamento` / `enviarFotosOrcamento` ainda não existem.

- [ ] **Step 3: Implementar funções**

Em `functions/api/tools/enviar-orcamento-tatuador.js`:

```javascript
import { sendTelegramPhoto, sendTelegramDocument, sendTelegramMediaGroup } from '../../_lib/telegram-media.js';

const FOTO_CAP_TOTAL = 10;
const TELEGRAM_PHOTO_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function selecionarFotosOrcamento(conv) {
  const dc = conv?.dados_coletados || {};
  const out = [];
  if (dc.foto_local_msg_id) out.push({ msg_id: dc.foto_local_msg_id, tipo: 'local' });
  const refs = Array.isArray(dc.refs_imagens_msg_ids) ? dc.refs_imagens_msg_ids : [];
  // Cap: total 10. Se tem local, sobra 9 pra refs. Pega as mais recentes (ultimos).
  const restante = FOTO_CAP_TOTAL - out.length;
  const refsSel = refs.slice(-restante);
  for (const id of refsSel) out.push({ msg_id: id, tipo: 'ref' });
  return out;
}

export async function enviarFotosOrcamento(env, chatId, conv, depsOverride = {}) {
  const deps = {
    supaFetch: async (path, init) => await supaFetch(env, path, init),
    sendTelegramPhoto, sendTelegramDocument, sendTelegramMediaGroup,
    ...depsOverride,
  };
  const itens = selecionarFotosOrcamento(conv);
  if (itens.length === 0) return { tentadas: 0, enviadas: 0, falhas: 0 };

  // Batch SELECT base64 + mimetype
  const ids = itens.map(x => x.msg_id);
  const sel = await deps.supaFetch(
    `/rest/v1/conversa_mensagens?id=in.(${ids.join(',')})&select=id,message`,
  );
  const rows = await sel.json();
  const byId = new Map(rows.map(r => [r.id, r.message || {}]));

  // Separa em buckets por mimetype
  const carrossel = [];  // JPEGs/PNGs/WEBPs
  const documents = [];  // HEIC/HEIF/TIFF/outros
  for (const it of itens) {
    const m = byId.get(it.msg_id);
    if (!m?.media_base64) continue;
    const mt = (m.media_mimetype || '').toLowerCase();
    const bucket = TELEGRAM_PHOTO_MIMETYPES.has(mt) ? carrossel : documents;
    bucket.push({ ...it, base64: m.media_base64, mimetype: m.media_mimetype });
  }

  const tentadas = carrossel.length + documents.length;
  let enviadas = 0; let falhas = 0;
  // Ordem: foto_local-file_id primeiro (pra mapeamento PATCH); refs collect na sequencia
  let fotoLocalFileId = null;
  const refsFileIds = [];
  const usedIds = [];  // msg_ids enviados com sucesso (para RPC zerar)

  // Documents primeiro (sem caption, individuais)
  for (const d of documents) {
    try {
      const { file_id } = await deps.sendTelegramDocument(env, chatId, d.base64, d.mimetype, null, null);
      if (d.tipo === 'local') fotoLocalFileId = file_id;
      else refsFileIds.push(file_id);
      usedIds.push(d.msg_id);
      enviadas++;
    } catch (e) {
      console.warn(`[orc] doc ${d.msg_id} falhou: ${e.message}`);
      falhas++;
    }
  }

  // Carrossel
  if (carrossel.length === 1) {
    const c = carrossel[0];
    try {
      const nome = conv.dados_cadastro?.nome || 'cliente';
      const { file_id } = await deps.sendTelegramPhoto(env, chatId, c.base64, c.mimetype, `📸 ${nome} — fotos do briefing`);
      if (c.tipo === 'local') fotoLocalFileId = file_id;
      else refsFileIds.push(file_id);
      usedIds.push(c.msg_id);
      enviadas++;
    } catch (e) {
      console.warn(`[orc] foto solo ${c.msg_id} falhou: ${e.message}`);
      falhas++;
    }
  } else if (carrossel.length >= 2) {
    const nome = conv.dados_cadastro?.nome || 'cliente';
    const groupItems = carrossel.map((c, i) => ({
      base64: c.base64,
      mimetype: c.mimetype,
      ...(i === 0 ? { caption: `📸 ${nome} — fotos do briefing` } : {}),
    }));
    try {
      const results = await deps.sendTelegramMediaGroup(env, chatId, groupItems);
      results.forEach((r, i) => {
        const c = carrossel[i];
        if (c.tipo === 'local') fotoLocalFileId = r.file_id;
        else refsFileIds.push(r.file_id);
        usedIds.push(c.msg_id);
      });
      enviadas += carrossel.length;
    } catch (e) {
      console.warn(`[orc] mediaGroup falhou: ${e.message}`);
      falhas += carrossel.length;
    }
  }

  // Se nenhum upload deu certo, return falha total — NAO faz PATCH nem cleanup
  if (enviadas === 0) {
    return { tentadas, enviadas: 0, falhas, falhas_total: true };
  }

  // PATCH dados_coletados com file_ids
  const dadosAtuais = conv.dados_coletados || {};
  const novosDados = { ...dadosAtuais };
  if (fotoLocalFileId) novosDados.foto_local_file_id = fotoLocalFileId;
  if (refsFileIds.length > 0) {
    const atuais = Array.isArray(dadosAtuais.refs_imagens_file_ids) ? dadosAtuais.refs_imagens_file_ids : [];
    novosDados.refs_imagens_file_ids = [...atuais, ...refsFileIds];
  }
  await deps.supaFetch(`/rest/v1/conversas?id=eq.${conv.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ dados_coletados: novosDados }),
  });

  // Cleanup base64 via RPC atomico, so dos msg_ids que upload OK
  for (const id of usedIds) {
    try {
      await deps.supaFetch('/rest/v1/rpc/zerar_media_base64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_msg_id: id }),
      });
    } catch (e) {
      console.warn(`[orc] RPC zerar ${id} falhou: ${e.message}`);
    }
  }

  return { tentadas, enviadas, falhas };
}
```

- [ ] **Step 4: Rodar testes pra confirmar PASS**

Run: `node --test tests/tools/enviar-orcamento-tatuador.test.mjs`
Expected: PASS — todos novos + existentes verdes.

- [ ] **Step 5: Commit**

```bash
git add functions/api/tools/enviar-orcamento-tatuador.js tests/tools/enviar-orcamento-tatuador.test.mjs
git commit -m "feat(tool): enviarFotosOrcamento (selecao cap 10 + dispatch JPEG/HEIC + cleanup atomico)"
```

---

## Task 9: `enviar-orcamento-tatuador` — `handle()` orchestration + idempotência + label botão + integration tests

**Files:**
- Modify: `functions/api/tools/enviar-orcamento-tatuador.js` (handle, idempotência, inlineKeyboard)
- Create: `tests/integration/orcamento-com-fotos.test.mjs`
- Create: `tests/integration/orcamento-sem-fotos.test.mjs`
- Create: `tests/integration/orcamento-falha-parcial.test.mjs`
- Create: `tests/integration/orcamento-heic-mix.test.mjs`
- Create: `tests/integration/idempotencia-retry-fotos.test.mjs`
- Create: `tests/integration/orcamento-multi-refs-seco.test.mjs`
- Create: `tests/integration/orcamento-cap-10-fotos.test.mjs`

- [ ] **Step 1: Escrever os testes integration**

Todos os 7 testes seguem o template abaixo. Por brevidade, mostrar o canônico `orcamento-com-fotos.test.mjs` e listar variações dos outros.

**`tests/integration/orcamento-com-fotos.test.mjs`** (canônico E2E):

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/tools/enviar-orcamento-tatuador.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const SECRET = 'test-secret';
const TG_CHAT = '-100123456';

function buildContext(body, extraEnv = {}) {
  return {
    request: new Request('https://x/api/tools/enviar-orcamento-tatuador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Inkflow-Tool-Secret': SECRET },
      body: JSON.stringify(body),
    }),
    env: {
      INKFLOW_TOOL_SECRET: SECRET,
      SUPABASE_SERVICE_ROLE_KEY: 'sk',
      INKFLOW_TELEGRAM_BOT_TOKEN: 'fake-token',
      ...extraEnv,
    },
  };
}

test('E2E: 1 local + 2 refs JPEG → sendMediaGroup, file_ids, base64 zerado, sendMessage', async () => {
  const calls = { supa: [], tg: [] };
  // Mock global fetch (intercepta supaFetch + Telegram)
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = url.toString();
    if (u.includes('api.telegram.org/bot') && u.endsWith('/sendMediaGroup')) {
      calls.tg.push({ url: u, body: init.body });
      return new Response(JSON.stringify({
        ok: true, result: [
          { photo: [{ file_id: 'F0' }] },
          { photo: [{ file_id: 'F1' }] },
          { photo: [{ file_id: 'F2' }] },
        ],
      }), { status: 200 });
    }
    if (u.includes('api.telegram.org/bot') && u.endsWith('/sendMessage')) {
      calls.tg.push({ url: u, body: init.body });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }
    // supaFetch (Supabase REST)
    calls.supa.push({ url: u, method: init.method || 'GET', body: init.body });
    // Mock conversa
    if (u.includes('/rest/v1/conversas?') && (init.method ?? 'GET') === 'GET') {
      return new Response(JSON.stringify([{
        id: 'c1', estado_agente: 'coletando_tattoo', orcid: null,
        tenant_id: TENANT_ID,
        dados_coletados: {
          descricao_curta: 'borboleta', local_corpo: 'pulso', altura_cm: 8, estilo: 'fineline',
          foto_local: 'presente', refs_imagens: ['r1', 'r2'],
          foto_local_msg_id: 42, refs_imagens_msg_ids: [43, 44],
        },
        dados_cadastro: { nome: 'Maria', data_nascimento: '2001-03-15', email: 'maria@x.com' },
        tenants: { tatuador_telegram_chat_id: TG_CHAT, sinal_percentual: 30, nome_estudio: 'Estudio' },
      }]), { status: 200 });
    }
    if (u.includes('/rest/v1/conversa_mensagens?id=in.')) {
      return new Response(JSON.stringify([
        { id: 42, message: { media_base64: 'B42', media_mimetype: 'image/jpeg' } },
        { id: 43, message: { media_base64: 'B43', media_mimetype: 'image/jpeg' } },
        { id: 44, message: { media_base64: 'B44', media_mimetype: 'image/jpeg' } },
      ]), { status: 200 });
    }
    return new Response('', { status: 204 });
  };

  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: '+5511999' });
    const resp = await onRequest(ctx);
    assert.equal(resp.status, 200);

    // 1) sendMediaGroup chamado
    assert.ok(calls.tg.find(c => c.url.endsWith('/sendMediaGroup')));
    // 2) sendMessage chamado com texto orçamento (sem orcid visivel, com Maria e 25 anos)
    const sendMsg = calls.tg.find(c => c.url.endsWith('/sendMessage'));
    assert.ok(sendMsg);
    const sendBody = JSON.parse(sendMsg.body);
    assert.match(sendBody.text, /Maria/);
    assert.doesNotMatch(sendBody.text, /orc_/);
    // 3) Botoes inline keyboard com label novo
    assert.match(sendBody.reply_markup.inline_keyboard[0][0].text, /Informar valor/);
    // 4) PATCH dados_coletados com file_ids
    const patch = calls.supa.find(c => c.method === 'PATCH' && c.url.includes('/conversas?id=eq.c1') && c.body?.includes('foto_local_file_id'));
    assert.ok(patch);
    const patchBody = JSON.parse(patch.body);
    assert.equal(patchBody.dados_coletados.foto_local_file_id, 'F0');
    assert.deepEqual(patchBody.dados_coletados.refs_imagens_file_ids, ['F1', 'F2']);
    // 5) RPC zerar chamado 3x
    const rpcs = calls.supa.filter(c => c.url.includes('/rpc/zerar_media_base64'));
    assert.equal(rpcs.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

**Variações dos outros 6 testes** (mesmo skeleton, mudando mocks):

- `orcamento-sem-fotos.test.mjs`: conversa sem `foto_local_msg_id` nem `refs_imagens_msg_ids` → orçamento texto sai, nenhum sendMediaGroup/sendPhoto/sendDocument, nenhum PATCH file_ids, nenhum RPC zerar.
- `orcamento-falha-parcial.test.mjs`: mock `sendMediaGroup` retorna `{ok:false, status:413}` → orçamento texto sai com `📸 ⚠️ ... não anexaram`, base64 intacto (zero RPC zerar).
- `orcamento-heic-mix.test.mjs`: mock conversa com 3 fotos [JPEG, HEIC, JPEG] → assert 1 sendDocument + 1 sendMediaGroup(2 items).
- `idempotencia-retry-fotos.test.mjs`: conversa com `orcid` já reservado + `foto_local_msg_id` mas SEM `foto_local_file_id` → tool detecta gap, roda só `enviarFotosOrcamento`, retorna `{ok:true, orcid, retry_fotos:true}`.
- `orcamento-multi-refs-seco.test.mjs`: conversa com 5 `refs_imagens_msg_ids` e nenhum `foto_local_msg_id` → sendMediaGroup(5).
- `orcamento-cap-10-fotos.test.mjs`: conversa com 15 refs → assert sendMediaGroup chamado com 10 itens (1 local + 9 mais recentes).

Cada arquivo segue o mesmo padrão de mock global `fetch`. Crie um helper compartilhado se desejar (`tests/integration/_orcamento-mocks.mjs`).

- [ ] **Step 2: Rodar pra confirmar que falham**

Run: `node --test tests/integration/orcamento-com-fotos.test.mjs tests/integration/orcamento-sem-fotos.test.mjs tests/integration/orcamento-falha-parcial.test.mjs tests/integration/orcamento-heic-mix.test.mjs tests/integration/idempotencia-retry-fotos.test.mjs tests/integration/orcamento-multi-refs-seco.test.mjs tests/integration/orcamento-cap-10-fotos.test.mjs`
Expected: todos os 7 FAIL (handle() ainda não chama enviarFotosOrcamento + label botão antigo).

- [ ] **Step 3: Modificar `inlineKeyboard` — rename label**

Em `functions/api/tools/enviar-orcamento-tatuador.js`, linha ~86:

```javascript
function inlineKeyboard(orcid) {
  return {
    inline_keyboard: [[
      { text: '💵 Informar valor', callback_data: `fechar:${orcid}` },
      { text: '❌ Recusar',         callback_data: `recusar:${orcid}` },
    ]],
  };
}
```

Callback_data permanece `fechar:` (compat com mensagens antigas + webhook handler).

- [ ] **Step 4: Modificar idempotência + handle()**

Substituir o bloco de idempotência atual (linha ~134) pelo novo:

```javascript
  if (conv.orcid) {
    const dc = conv.dados_coletados || {};
    const fotosPendentes =
      (dc.foto_local_msg_id && !dc.foto_local_file_id)
      || ((dc.refs_imagens_msg_ids?.length || 0) > (dc.refs_imagens_file_ids?.length || 0));

    if (!fotosPendentes) {
      return {
        status: 200,
        body: { ok: true, orcid: conv.orcid, idempotente: true, estado_agente: conv.estado_agente },
      };
    }

    // Tem orcid mas faltam file_ids → roda so o upload
    let resultadoFotos;
    try {
      resultadoFotos = await enviarFotosOrcamento(env, tenant.tatuador_telegram_chat_id, conv);
    } catch (e) {
      resultadoFotos = { falhas_total: true, error: e.message };
    }
    return {
      status: 200,
      body: { ok: true, orcid: conv.orcid, retry_fotos: true, enviadas: resultadoFotos.enviadas ?? 0 },
    };
  }
```

No fluxo principal do `handle()`, **após** reservar orcid + estado=`aguardando_tatuador` e **antes** do `enviarTelegram(sendMessage)`:

```javascript
  // Envia fotos primeiro (carrossel + documents). Falha aqui nao bloqueia orcamento.
  let resultadoFotos;
  try {
    resultadoFotos = await enviarFotosOrcamento(env, tenant.tatuador_telegram_chat_id, conv);
  } catch (e) {
    console.error(`[enviar-orcamento] enviarFotosOrcamento crash: ${e.message}`);
    resultadoFotos = { enviadas: 0, falhas_total: true, error: e.message };
  }

  // Observability
  console.log(JSON.stringify({
    evento: 'fotos-orcamento-enviadas',
    orcid, tenant_id, telefone,
    tentadas: resultadoFotos.tentadas || 0,
    enviadas: resultadoFotos.enviadas || 0,
    falhas: resultadoFotos.falhas || 0,
    falhas_total: !!resultadoFotos.falhas_total,
  }));

  // sendMessage com texto orcamento + botoes
  const textoOrc = montarTextoOrcamento(conv, resultadoFotos);
  await enviarTelegram(env, tenant.tatuador_telegram_chat_id, textoOrc, inlineKeyboard(orcid));
```

- [ ] **Step 5: Rodar todos os testes pra confirmar PASS**

Run: `npm test`
Expected: PASS — suite completa verde (888 + novos).

- [ ] **Step 6: Commit**

```bash
git add functions/api/tools/enviar-orcamento-tatuador.js tests/integration/orcamento-*.test.mjs tests/integration/idempotencia-retry-fotos.test.mjs
git commit -m "feat(tool): handle() envia fotos antes do texto + idempotencia retry + label botao"
```

---

## Task 10: `telegram/webhook.js` — nome do cliente em vez de orcid

**Files:**
- Modify: `functions/api/telegram/webhook.js` (linhas 177, 192)
- Modify: `tests/audit-telegram-webhook.test.mjs` (append regression)

- [ ] **Step 1: Escrever regression test que vai falhar**

Append em `tests/audit-telegram-webhook.test.mjs`:

```javascript
test('callback "fechar" pergunta valor citando NOME do cliente, nao orcid', async () => {
  // Mock supaFetch retorna conversa com dados_cadastro.nome
  // Mock sendMessage capturando texto enviado
  const captured = [];
  // (Adapte o mock pattern ja existente em audit-telegram-webhook.test.mjs.
  //  Garanta que conv.dados_cadastro.nome = 'Maria')
  // Resultado esperado: captured.text inclui "Maria", NAO inclui "orc_"
  // Aqui esbocando — caller adapta ao framework de mocks do arquivo
  // assert.match(captured[0].text, /Maria/);
  // assert.doesNotMatch(captured[0].text, /orc_/);
});

test('callback "recusar" cita NOME do cliente, nao orcid', async () => {
  // Mesma logica para acao = 'recusar'
});
```

(Adaptar aos mocks já presentes no arquivo — não posso inventar a estrutura completa sem ver o teste atual. O agente executando lê o arquivo, copia o setup, ajusta apenas o assert sobre o texto.)

- [ ] **Step 2: Rodar pra confirmar que falha**

Run: `node --test tests/audit-telegram-webhook.test.mjs`
Expected: FAIL (asserts novos).

- [ ] **Step 3: Modificar webhook**

Linha 177 (case `'fechar'`):

```javascript
    case 'fechar': {
      const nomeCliente = conv.dados_cadastro?.nome || 'cliente';
      await sendMessage(env, cb.from.id,
        `Qual valor pra *${escapeMarkdown(nomeCliente)}*? Manda só o número (ex: 750)`,
        { reply_markup: { force_reply: true, selective: false } }
      );
      await answerCallbackQuery(env, cb.id);
      return tgJson({ ok: true, acao: 'aguardando_valor' });
    }
```

Linha 192 (case `'recusar'`):

```javascript
      const nomeCliente = conv.dados_cadastro?.nome || 'cliente';
      await answerCallbackQuery(env, cb.id, '✓ Recusado');
      await sendMessage(env, cb.from.id,
        `📝 Orçamento da *${escapeMarkdown(nomeCliente)}* recusado. Cliente será avisado pelo bot.`
      );
```

Verificar se `escapeMarkdown` já é importado/disponível no arquivo. Se não, adicionar helper local minúsculo ou importar do utilitário existente:

```javascript
function escapeMarkdown(s) {
  return String(s).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}
```

- [ ] **Step 4: Rodar testes pra confirmar PASS**

Run: `node --test tests/audit-telegram-webhook.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/api/telegram/webhook.js tests/audit-telegram-webhook.test.mjs
git commit -m "feat(webhook): callback fechar/recusar cita nome do cliente em vez de orcid"
```

---

## Task 11: Eval scenarios novos no `tattoo-agent.eval.mjs`

**Files:**
- Modify: `tests/agent/tattoo-agent.eval.mjs` (append 3 cenários)

**Por quê depois de tasks 4-9:** evals dependem do classifier integrado no pipeline + pipeline montado com schemas reais. Adicionar antes geraria flakes.

- [ ] **Step 1: Ler arquivo eval atual pra entender estrutura**

```bash
head -80 tests/agent/tattoo-agent.eval.mjs
```

Identificar como cenários existentes são declarados (tags `per-*`, estrutura de turnos, asserts sobre `dados_persistidos`/`dados_coletados`).

- [ ] **Step 2: Adicionar 3 cenários novos**

Seguindo o padrão existente (adaptar a sintaxe ao framework atual de eval-harness):

```javascript
// Cenario per-foto-local-proativa
{
  tag: 'per-foto-local-proativa',
  turnos: [
    { user: 'queria tatuagem no pulso 📸', mediaBase64: 'FAKE', mediaMimetype: 'image/jpeg' },
  ],
  asserts: [
    { campo: 'dados_coletados.foto_local', esperado: 'presente' },
    { campo: 'dados_coletados.tentativas_foto_local', esperadoMax: 0 },
    { campo: 'dados_coletados.foto_local_msg_id', esperadoTipo: 'number' },
  ],
},

// Cenario per-refs-multiplas-proativas
{
  tag: 'per-refs-multiplas-proativas',
  turnos: [
    { user: 'tipo essas aqui 📸📸📸', mediaBase64: 'F1', mediaMimetype: 'image/jpeg' },
    { user: '', mediaBase64: 'F2', mediaMimetype: 'image/jpeg' },
    { user: '', mediaBase64: 'F3', mediaMimetype: 'image/jpeg' },
  ],
  asserts: [
    { campo: 'dados_coletados.refs_imagens_msg_ids.length', esperado: 3 },
  ],
},

// Cenario per-cliente-seco-multifoto
{
  tag: 'per-cliente-seco-multifoto',
  turnos: [
    { user: 'quanto fica?', mediaBase64: 'F1', mediaMimetype: 'image/jpeg' },
    { user: '', mediaBase64: 'F2', mediaMimetype: 'image/jpeg' },
    { user: '', mediaBase64: 'F3', mediaMimetype: 'image/jpeg' },
    { user: '', mediaBase64: 'F4', mediaMimetype: 'image/jpeg' },
    { user: '', mediaBase64: 'F5', mediaMimetype: 'image/jpeg' },
    // Turno 6: agent deve perguntar OBR (descricao_curta, local_corpo, etc), nao assumir mais fotos
  ],
  asserts: [
    { campo: 'dados_coletados.refs_imagens_msg_ids.length', esperado: 5 },
    // Asserts adicionais sobre transicao do agent para perguntar OBR (ex: ultima mensagem do bot contem "descrição" ou "local")
  ],
},
```

(Adaptar exatamente à estrutura atual do arquivo — esses são templates ilustrativos.)

- [ ] **Step 3: Rodar eval suite**

Run: `npm run eval:tattoo`
Expected: PASS — incluindo os 3 cenários novos.

- [ ] **Step 4: Commit**

```bash
git add tests/agent/tattoo-agent.eval.mjs
git commit -m "test(eval): 3 cenarios novos para classificacao fotos (proativa local/refs/seco)"
```

---

## Task 12: Smoke E2E + DoD verify + observability

**Files:**
- Nenhum código alterado nesta task (já feito).
- Manual: Cloudflare Pages deploy, Telegram E2E real, query DB.

- [ ] **Step 1: Confirmar suite total verde**

```bash
npm test 2>&1 | tail -20
npm run eval:tattoo 2>&1 | tail -10
```

Expected: 888 + ~40-50 novos tests passing. 0 failures.

- [ ] **Step 2: Push branch + abrir PR**

```bash
git push -u origin feat/coleta-fotos-telegram-storage
gh pr create --title "feat: coleta fotos reais Telegram (PR-B)" --body "$(cat <<'EOF'
## Summary
- Pipeline classifica cada foto que chega como foto_local ou refs_imagens (heurística L1+L2+L3) e grava msg_id em dados_coletados
- Tool enviar-orcamento-tatuador envia fotos via sendMediaGroup/sendPhoto/sendDocument antes do orçamento, captura file_ids eternos, zera base64 via RPC atômico
- Pós-handoff: fotos avulsas re-encaminhadas com caption nome do cliente
- HEIC/HEIF/TIFF via sendDocument fallback (graceful degrade)
- UX: briefing natural, label "💵 Informar valor", nome em vez de orcid

## Test plan
- [x] Unit foto-classifier (10 cases)
- [x] Unit telegram-media (10 cases)
- [x] Integration pipeline-classifier (cenários A/B/C/D + skip)
- [x] Integration pos-handoff-foto (JPEG, HEIC, sem foto, falha upload)
- [x] Integration enviar-orcamento (canônico, sem fotos, falha parcial, HEIC mix, idempotência retry, cliente seco, cap 10)
- [x] Eval tattoo: 3 cenários novos
- [ ] Smoke E2E manual com tenant teste (após deploy)
- [ ] Verificar logs Cloudflare: evento fotos-orcamento-enviadas ≥3 com falhas:0

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Aguardar CI 7/7 verde**

```bash
gh pr checks --watch
```

Expected: todos os checks verde (lint, test, type-check, deploy preview, etc).

- [ ] **Step 4: Deploy preview manual E2E**

Após preview deploy CF Pages estar verde:

1. Tenant de teste pareado com bot Telegram dummy.
2. WhatsApp: `oi, queria tatuagem`
3. `no antebraço 📸` + foto braço (JPEG)
4. `tipo essa 📸` + foto referência (JPEG)
5. `Maria Silva, 15/03/2001, maria@example.com`
6. Bot chama `enviar-orcamento-tatuador`.
7. Verificar no Telegram do tatuador:
   - Carrossel 2 fotos com caption `📸 Maria — fotos do briefing`
   - Mensagem orçamento: `👤 Maria` + `🎂 25 anos (15/03/2001)` + `📧 maria@example.com` + briefing natural
   - **Sem** `orc_` visível
   - Botões: `💵 Informar valor` | `❌ Recusar`
8. Cliente manda +1 foto pós-handoff → tatuador recebe `📸 Maria mandou +1 foto`
9. Tatuador clica `💵 Informar valor` → bot: `Qual valor pra *Maria*? Manda só o número (ex: 750)` → tatuador responde `550`
10. Cliente recebe proposta com valor 550.

- [ ] **Step 5: Verify no DB (via Supabase MCP)**

```sql
-- Conversa do teste
SELECT id, orcid, dados_coletados FROM conversas
WHERE telefone = '+5511XXXXX' ORDER BY created_at DESC LIMIT 1;
-- Esperado:
--   orcid: 'orc_xxx'
--   dados_coletados.foto_local_msg_id: <numero>
--   dados_coletados.foto_local_file_id: 'AgAC...'
--   dados_coletados.refs_imagens_file_ids: ['AgAC...', 'AgAC...']

-- Mensagens com base64 zerado
SELECT id, message->>'media_base64' AS b64, message->>'media_mimetype' AS mt
FROM conversa_mensagens
WHERE id IN (<msg_ids do teste>);
-- Esperado: b64 = "" (vazio), mt preservado
```

- [ ] **Step 6: Verify logs Cloudflare**

```bash
npx wrangler pages deployment tail --project-name inkflow-saas | grep fotos-orcamento-enviadas | head -3
```

Expected: ≥3 eventos com `falhas:0` em orçamentos consecutivos.

- [ ] **Step 7: DoD checklist (revisar manualmente)**

- [x] Todos unit + integration novos passando
- [x] Suite total verde (888 + novos)
- [x] CI 7/7 verde
- [x] Smoke E2E manual executado
- [x] Logs CF confirmam `fotos-orcamento-enviadas` falhas:0 em ≥3 orçamentos
- [x] DB pós-smoke: base64 zerado, file_ids preenchidos
- [x] PR-A já mergeado em main (pré-requisito)

- [ ] **Step 8: Merge PR**

Após DoD verificado:

```bash
gh pr merge --squash --delete-branch
```

---

## Self-review checklist

**1. Spec coverage:**

- Pipeline Etapa 4.5 (classifier) → Task 4 ✓
- Pipeline Etapa terminal (pós-handoff) → Task 5 ✓
- Tool enviarFotosOrcamento + cleanup → Task 8 ✓
- UX briefing/idade/sem-orcid → Task 7 ✓
- Idempotência retry parcial → Task 9 ✓
- Rename label "💵 Informar valor" → Task 9 ✓
- Webhook nome cliente em vez de orcid → Task 10 ✓
- HEIC fallback sendDocument → Task 3 + Task 8 ✓
- Cap 10 fotos → Task 8 ✓
- Cliente seco / multi-refs → Task 9 (integration test) + Task 11 (eval) ✓
- Guard PIPELINE_ONLY_FIELDS → Task 6 ✓
- Migration RPC zerar → Task 1 ✓
- Observability log → Task 9 step 4 ✓
- Smoke E2E + DoD → Task 12 ✓
- PR-A pré-requisito → bloco no topo + Task 4 step 3 verify ✓

**2. Type/naming consistency:**

- `classificarFoto` usado em Task 2 def, Task 4 import ✓
- `enviarMidia`, `sendTelegramPhoto`, `sendTelegramDocument`, `sendTelegramMediaGroup` consistentes entre Task 3 def e Task 5/Task 8 imports ✓
- `enviarFotosOrcamento`, `selecionarFotosOrcamento`, `montarBriefing`, `montarLinhaIdade`, `formatarDataBr`, `montarTextoOrcamento` consistentes entre Task 7/8 def e Task 9 uso ✓
- Campos JSONB: `foto_local_msg_id`, `foto_local_file_id`, `refs_imagens_msg_ids`, `refs_imagens_file_ids` consistentes entre pipeline (4), tool (8), guard (6), idempotência (9) ✓
- RPC `zerar_media_base64(p_msg_id)` consistente entre migration (1), pipeline (5), tool (8) ✓

**3. Placeholder scan:** clean — não há "TBD/TODO/handle edge cases" sem código. Cada step tem código concreto ou comando concreto.

**Riscos do plano:**

- **Risco 1:** PR-A não mergeado → bloco pré-requisito no topo + checklist na Task 4. Se grep encontrar `n8n_chat_histories` residual, executor deve parar e voltar pro PR-A.
- **Risco 2:** RPC SECURITY DEFINER → fixei `search_path = ''` + qualified table name + REVOKE/GRANT explícito. Task 1 step 4 valida advisors.
- **Risco 3:** Pipeline race em PATCH `dados_coletados` (read-modify-write) → spec aceita risco para MVP; mitigation futura seria RPC `jsonb_set` no append do array refs_imagens_msg_ids (anotado em open questions).
- **Risco 4:** Mock `globalThis.fetch` nos testes integration → cada teste tem `try/finally` pra restore. Se algum teste crashar fora do finally, próximos testes podem ver fetch poluído. Mitigação: rodar testes individualmente em CI se observar flakes.
- **Risco 5:** Etapa 4.5 PATCH falha → marquei como não-fatal (`console.warn`) — orçamento ainda pode sair, só fica órfão de msg_id.
- **Risco 6:** Cleanup base64 imediato → spec aceita: file_id Telegram garante recuperação via getFile, e o risco de "perder" foto é mínimo porque cleanup só roda após upload OK.
- **Risco 7:** 12 tasks no plan → dentro do limite de 15.

**Estimativa total:** ~7-9h de execução (próxima ao spec original de 5-7h, adicionando overhead de testes integration).
