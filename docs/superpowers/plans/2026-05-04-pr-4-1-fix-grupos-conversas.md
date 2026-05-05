# PR 4.1 Fix Grupos Conversas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir 3 bugs do PR #24 Painel Conversas que tornam 3 dos 4 painéis ("Hoje", "Aguardando", "Histórico") sempre vazios em prod, via cross-column query no `list.js` + lifecycle helper `markConversaFechada` com 2 callers automáticos.

**Architecture:** Dois movimentos coordenados num único PR: (1) `_grupos.js` retorna 2 listas separadas (`estados_agente` + `estados`) e `list.js` constrói query PostgREST `or=` cruzando ambas as colunas; (2) novo helper `functions/_lib/conversas-lifecycle.js` centraliza transições terminais (`estado_agente='fechado'` + motivo + timestamp), chamado por `mp-sinal-handler` (motivo `sinal_pago`) e `cron/expira-holds` (motivo `hold_expirado`).

**Tech Stack:** Node native test runner (`node --test`, `.test.mjs`), Cloudflare Pages Functions, Supabase PostgREST, Mercado Pago API.

**Spec base:** `docs/superpowers/specs/2026-05-04-pr-4-1-fix-grupos-conversas-design.md` (commit `195e1e7`)

**Branch:** `feat/pr-4-1-fix-grupos-conversas` (já criada, com spec committed)

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `functions/api/conversas/_grupos.js` | modify | Map grupo → 2 listas separadas (workflow + agente) + filtro hoje |
| `functions/api/conversas/list.js` | modify | Build cross-column query (PostgREST `or=`) ou direta quando 1 lista |
| `functions/_lib/conversas-lifecycle.js` | **NEW** | Helper `markConversaFechada(supabase, id, motivo)` idempotente |
| `functions/_lib/mp-sinal-handler.js` | modify | Após `estado='confirmado'`, chama helper com motivo `sinal_pago` |
| `functions/api/cron/expira-holds.js` | modify | Após PATCH bulk, loop chamando helper com motivo `hold_expirado` |
| `tests/api/conversas-grupos.test.mjs` | modify | 6 tests existentes ajustados + 1 novo (lista vazia + lista cheia) |
| `tests/api/conversas-list.test.mjs` | modify | 8 tests existentes ajustados + 3 novos (or=, single col, before_ts) |
| `tests/_lib/conversas-lifecycle.test.mjs` | **NEW** | 5 tests novos (motivos válidos + inválido + idempotência + erros) |
| `scripts/test-prompts.sh` | modify | Adicionar 4 linhas pra rodar tests novos no batch |

---

## Task 1: Pre-flight — baseline tests verde

**Objetivo:** Confirmar estado limpo antes de qualquer mudança. Garante que se quebrar algo depois, sabemos que foi nosso código (não dívida pré-existente).

**Files:**
- Read-only: `tests/api/conversas-grupos.test.mjs`, `tests/api/conversas-list.test.mjs`, `tests/api/conversas-thread.test.mjs`

- [ ] **Step 1: Confirmar branch e working tree limpa**

```bash
cd ~/Documents/inkflow-saas
git status
git branch --show-current
```

Expected: `On branch feat/pr-4-1-fix-grupos-conversas`. Working tree clean (untracked files antigos de specs/plans são ok).

- [ ] **Step 2: Rodar bateria atual completa**

```bash
bash scripts/test-prompts.sh
```

Expected: `✓ Todos os tests passaram.` (zero falhas)

- [ ] **Step 3: Rodar tests específicos de conversas (não estão no batch)**

```bash
node --test tests/api/conversas-grupos.test.mjs tests/api/conversas-list.test.mjs tests/api/conversas-thread.test.mjs
```

Expected: todos passam. Em `conversas-grupos.test.mjs` deve passar 6 tests, `conversas-list.test.mjs` 8, `conversas-thread.test.mjs` 6.

- [ ] **Step 4: Sem commit — apenas validação de baseline**

Sem mudanças no working tree → sem commit aqui. Próxima task começa modificando.

---

## Task 2: Refator `_grupos.js` — retornar 2 listas separadas (TDD)

**Objetivo:** Mudar shape do retorno do helper de `{estados, last_msg_at_gte?}` pra `{estados_agente, estados, last_msg_at_gte?}`. Tests primeiro, código depois.

**Files:**
- Modify: `tests/api/conversas-grupos.test.mjs` (6 tests existentes + 1 novo)
- Modify: `functions/api/conversas/_grupos.js`

- [ ] **Step 1: Atualizar tests pra novo schema (vão falhar)**

Substituir conteúdo de `tests/api/conversas-grupos.test.mjs` por:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('getGrupoFilter("hoje") — 2 listas: agente (coleta) + workflow (agenda) + filtro hoje BRT', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('hoje');
  assert.deepEqual(r.estados_agente, ['coletando_tattoo', 'coletando_cadastro']);
  assert.deepEqual(r.estados, ['escolhendo_horario', 'aguardando_sinal']);
  assert.ok(r.last_msg_at_gte, 'deve incluir filtro last_msg_at_gte');
  assert.match(r.last_msg_at_gte, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

test('getGrupoFilter("aguardando") — só estados_agente, estados vazio', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('aguardando');
  assert.deepEqual(r.estados_agente, ['aguardando_tatuador', 'aguardando_decisao_desconto']);
  assert.deepEqual(r.estados, []);
  assert.equal(r.last_msg_at_gte, undefined);
});

test('getGrupoFilter("negociacao") — propondo + lead_frio + pausada_tatuador (single col)', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('negociacao');
  assert.deepEqual(r.estados_agente, ['propondo_valor', 'lead_frio', 'pausada_tatuador']);
  assert.deepEqual(r.estados, []);
});

test('getGrupoFilter("historico") — só fechado em estados_agente', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('historico');
  assert.deepEqual(r.estados_agente, ['fechado']);
  assert.deepEqual(r.estados, []);
});

test('getGrupoFilter("invalid") — retorna null (caller decide 400)', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  assert.equal(getGrupoFilter('invalid'), null);
  assert.equal(getGrupoFilter(''), null);
  assert.equal(getGrupoFilter(null), null);
  assert.equal(getGrupoFilter(undefined), null);
});

test('getGrupoFilter("hoje") — last_msg_at_gte é 00:00 BRT em UTC (T03:00:00Z)', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('hoje');
  assert.ok(
    r.last_msg_at_gte.endsWith('T03:00:00.000Z') || r.last_msg_at_gte.endsWith('T03:00:00Z'),
    `Esperava ISO terminando em T03:00:00Z, recebi: ${r.last_msg_at_gte}`
  );
});

test('getGrupoFilter — caso aguardando: estados vazio + estados_agente cheio (forma assimétrica)', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('aguardando');
  assert.equal(r.estados_agente.length > 0, true, 'estados_agente deve ter itens');
  assert.equal(r.estados.length, 0, 'estados deve ser vazio (caller usa forma direta)');
});

test('GRUPOS_VALIDOS — exporta lista dos 4 grupos', async () => {
  const { GRUPOS_VALIDOS } = await import('../../functions/api/conversas/_grupos.js');
  assert.deepEqual(GRUPOS_VALIDOS, ['hoje', 'aguardando', 'negociacao', 'historico']);
});
```

- [ ] **Step 2: Rodar tests pra confirmar que falham**

```bash
node --test tests/api/conversas-grupos.test.mjs
```

Expected: FAIL — atual `_grupos.js` retorna `{estados}`, novos tests esperam `{estados_agente, estados}`.

- [ ] **Step 3: Reescrever `functions/api/conversas/_grupos.js`**

Substituir conteúdo completo por:

```js
// ── InkFlow — Grupos de Conversas: helper puro mapeando nome → estados + filtros ──
// Usado por list.js endpoint pra construir query Supabase cross-column.
// Função pura, sem side effects, sem fetch. Testável.
//
// Retorna 2 listas separadas porque:
//   `estado` é workflow do bot (escolhendo_horario, aguardando_sinal, confirmado, etc.)
//   `estado_agente` é fase de negociação humana (coletando_tattoo, propondo_valor, etc.)
// Painel "Hoje" precisa cruzar ambas. Caller (list.js) usa OR query quando ambas têm itens,
// ou forma direta quando só uma tem.

const GRUPOS = {
  hoje: {
    estados_agente: ['coletando_tattoo', 'coletando_cadastro'],
    estados: ['escolhendo_horario', 'aguardando_sinal'],
    inclui_filtro_hoje: true,
  },
  aguardando: {
    estados_agente: ['aguardando_tatuador', 'aguardando_decisao_desconto'],
    estados: [],
    inclui_filtro_hoje: false,
  },
  negociacao: {
    estados_agente: ['propondo_valor', 'lead_frio', 'pausada_tatuador'],
    estados: [],
    inclui_filtro_hoje: false,
  },
  historico: {
    estados_agente: ['fechado'],
    estados: [],
    inclui_filtro_hoje: false,
  },
};

// Retorna ISO string de hoje 00:00 BRT (= 03:00 UTC).
// BRT é UTC-3 ano-redondo (Brasil aboliu DST em 2019).
function isoHojeBrtUtc() {
  const now = new Date();
  const utc0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 0, 0, 0));
  if (now.getTime() < utc0.getTime()) {
    utc0.setUTCDate(utc0.getUTCDate() - 1);
  }
  return utc0.toISOString();
}

export function getGrupoFilter(grupo) {
  if (typeof grupo !== 'string' || !GRUPOS[grupo]) return null;
  const cfg = GRUPOS[grupo];
  // Defensive: ambas listas vazias é estado inválido — não deve ocorrer com mapping atual.
  if (!cfg.estados_agente.length && !cfg.estados.length) return null;
  const result = {
    estados_agente: cfg.estados_agente,
    estados: cfg.estados,
  };
  if (cfg.inclui_filtro_hoje) {
    result.last_msg_at_gte = isoHojeBrtUtc();
  }
  return result;
}

export const GRUPOS_VALIDOS = Object.keys(GRUPOS);
```

- [ ] **Step 4: Rodar tests pra confirmar que passam**

```bash
node --test tests/api/conversas-grupos.test.mjs
```

Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/api/conversas-grupos.test.mjs functions/api/conversas/_grupos.js
git commit -m "$(cat <<'EOF'
refactor(conversas): _grupos.js retorna 2 listas separadas (estados_agente + estados)

Helper agora separa estados de duas colunas distintas:
- estados_agente (kill-switch + fase negociação): coletando_tattoo, propondo_valor, fechado, etc.
- estados (workflow agendamento bot): escolhendo_horario, aguardando_sinal

Painel 'Hoje' precisa cruzar ambas porque cliente vivo pode estar tanto coletando info
quanto escolhendo horário. list.js (próximo commit) usa OR query.

Tests: 6 atualizados pra novo shape + 2 novos (assimetria + GRUPOS_VALIDOS export).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Refator `list.js` — cross-column query (TDD)

**Objetivo:** Adaptar endpoint pra novo shape do helper. Build query com `or=(in.X, in.Y)` quando ambas listas têm itens, ou forma direta quando só uma.

**Files:**
- Modify: `tests/api/conversas-list.test.mjs` (8 existentes + 3 novos)
- Modify: `functions/api/conversas/list.js:73-91`

- [ ] **Step 1: Atualizar tests existentes + adicionar 3 novos**

Substituir conteúdo de `tests/api/conversas-list.test.mjs` por (mantém 8 tests originais com asserts ajustados + 3 novos no fim):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

function mockEnv() {
  return {
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    STUDIO_TOKEN_SECRET: 'test-secret-min-32-chars-padding-padding',
  };
}

async function makeStudioToken(tenantId, env) {
  const { generateStudioToken } = await import('../../functions/api/_auth-helpers.js');
  return generateStudioToken(tenantId, env.STUDIO_TOKEN_SECRET);
}

test('list — falta studio_token → 400', async () => {
  const { onRequest } = await import('../../functions/api/conversas/list.js');
  const req = new Request('https://x.com/api/conversas/list?grupo=hoje', { method: 'GET' });
  const res = await onRequest({ request: req, env: mockEnv() });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /studio_token/i);
});

test('list — studio_token inválido → 401', async () => {
  const { onRequest } = await import('../../functions/api/conversas/list.js');
  const req = new Request('https://x.com/api/conversas/list?studio_token=invalid&grupo=hoje', { method: 'GET' });
  const res = await onRequest({ request: req, env: mockEnv() });
  assert.equal(res.status, 401);
});

test('list — grupo inválido → 400 com lista de válidos', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('[]', { status: 200 });

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=invalido`, { method: 'GET' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /grupo/i);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('list — happy path: stub Supabase, retorna conversas + previews (grupo=hoje cross-column)', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push(url);
    if (url.includes('/rest/v1/conversas?')) {
      return new Response(JSON.stringify([
        { id: 'c1', telefone: '5511999999999', estado: 'qualificando', estado_agente: 'coletando_tattoo', last_msg_at: '2026-05-04T12:00:00Z', valor_proposto: null, dados_coletados: { nome: 'Ana' }, dados_cadastro: null },
        { id: 'c2', telefone: '5511888888888', estado: 'aguardando_sinal', estado_agente: 'ativo', last_msg_at: '2026-05-04T11:00:00Z', valor_proposto: 500, dados_coletados: {}, dados_cadastro: null },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/rest/v1/n8n_chat_histories?')) {
      return new Response(JSON.stringify([
        { message: { content: 'Oi! Quero fazer uma tattoo de leão no antebraço.' } }
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=hoje&limit=30`, { method: 'GET' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.conversas.length, 2);
    assert.equal(body.conversas[0].last_msg_preview.length > 0, true);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('list — tenant_id sempre derivado do token (não aceita query param)', async () => {
  const env = mockEnv();
  const realTenantId = '00000000-0000-0000-0000-000000000aaa';
  const fakeTenantId = '00000000-0000-0000-0000-000000000bbb';
  const token = await makeStudioToken(realTenantId, env);

  const origFetch = globalThis.fetch;
  let convasCallUrl = null;
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?') && url.includes('tenant_id')) {
      convasCallUrl = url;
      return new Response('[]', { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    // Cliente tenta passar tenant_id falso na URL — deve ser ignorado
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=hoje&tenant_id=${fakeTenantId}`, { method: 'GET' });
    await onRequest({ request: req, env });
    assert.ok(convasCallUrl, 'fetch foi chamado pra conversas');
    assert.match(convasCallUrl, new RegExp(`tenant_id=eq\\.${realTenantId}`), 'usa tenant do token');
    assert.ok(!convasCallUrl.includes(fakeTenantId), 'NÃO usa tenant_id da URL');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('list — limit clamping: valores fora do range (0, -1, "abc", >100) → default 30 ou cap 100', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let limitObservado = null;
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?')) {
      const m = url.match(/limit=(\d+)/);
      limitObservado = m ? parseInt(m[1]) : null;
      return new Response('[]', { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  const cases = [
    { limit: '0', expected: 30 },
    { limit: '-1', expected: 30 },
    { limit: 'abc', expected: 30 },
    { limit: '999', expected: 100 },
    { limit: '50', expected: 50 },
  ];

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    for (const c of cases) {
      const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=hoje&limit=${c.limit}`, { method: 'GET' });
      await onRequest({ request: req, env });
      assert.equal(limitObservado, c.expected, `limit=${c.limit} deve clampar pra ${c.expected}`);
    }
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('list — before_ts inválido → 400', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const { onRequest } = await import('../../functions/api/conversas/list.js');
  const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=hoje&before_ts=not-a-date`, { method: 'GET' });
  const res = await onRequest({ request: req, env });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /before_ts/i);
});

test('list — preview falha em uma conversa não derruba o batch (silent failure protection)', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let previewCallCount = 0;
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?') && !url.includes('n8n_chat_histories')) {
      return new Response(JSON.stringify([
        { id: 'c1', telefone: '111', estado: 'qualificando', estado_agente: 'coletando_tattoo', last_msg_at: '2026-05-04T12:00:00Z', valor_proposto: null, dados_coletados: {}, dados_cadastro: null },
        { id: 'c2', telefone: '222', estado: 'qualificando', estado_agente: 'coletando_tattoo', last_msg_at: '2026-05-04T11:00:00Z', valor_proposto: null, dados_coletados: {}, dados_cadastro: null },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/rest/v1/n8n_chat_histories?')) {
      previewCallCount++;
      // Primeira preview falha (network error simulado), segunda OK
      if (previewCallCount === 1) {
        throw new Error('simulated network error');
      }
      return new Response(JSON.stringify([{ message: { content: 'Olá!' } }]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=hoje&limit=30`, { method: 'GET' });
    const res = await onRequest({ request: req, env });
    assert.equal(res.status, 200, 'NÃO deve retornar 500 mesmo com 1 preview falhando');
    const body = await res.json();
    assert.equal(body.conversas.length, 2);
    // Conversa 1 com preview vazio (silent failure), conversa 2 com preview OK
    assert.equal(body.conversas[0].last_msg_preview, '');
    assert.equal(body.conversas[1].last_msg_preview, 'Olá!');
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ─── 3 NOVOS TESTS ─────────────────────────────────────────────────────────

test('list — grupo=hoje constrói URL com or=(estado_agente.in,estado.in) + last_msg_at=gte', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let conversasUrl = null;
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?') && !url.includes('n8n_chat_histories')) {
      conversasUrl = url;
      return new Response('[]', { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=hoje&limit=30`, { method: 'GET' });
    await onRequest({ request: req, env });
    assert.ok(conversasUrl, 'conversas foi consultada');
    assert.match(conversasUrl, /or=\(estado_agente\.in\.\([^)]+\),estado\.in\.\([^)]+\)\)/, 'URL deve conter or=(estado_agente.in.(...),estado.in.(...))');
    assert.match(conversasUrl, /coletando_tattoo/, 'inclui coletando_tattoo em estado_agente');
    assert.match(conversasUrl, /escolhendo_horario/, 'inclui escolhendo_horario em estado');
    assert.match(conversasUrl, /last_msg_at=gte\./, 'inclui filtro last_msg_at=gte');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('list — grupo=negociacao constrói URL com estado_agente=in.(...) direto (sem or=)', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let conversasUrl = null;
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?') && !url.includes('n8n_chat_histories')) {
      conversasUrl = url;
      return new Response('[]', { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=negociacao&limit=30`, { method: 'GET' });
    await onRequest({ request: req, env });
    assert.ok(conversasUrl, 'conversas foi consultada');
    assert.ok(!conversasUrl.includes('or='), 'NÃO deve usar or= quando só estados_agente tem itens');
    assert.match(conversasUrl, /estado_agente=in\.\([^)]+\)/, 'usa estado_agente=in.(...) direto');
    assert.match(conversasUrl, /pausada_tatuador/, 'inclui pausada_tatuador');
    assert.ok(!conversasUrl.includes('last_msg_at=gte'), 'negociacao não filtra por hoje');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('list — grupo=hoje + before_ts → URL contém or=(...) + last_msg_at=lt.<ts>', async () => {
  const env = mockEnv();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const token = await makeStudioToken(tenantId, env);

  const origFetch = globalThis.fetch;
  let conversasUrl = null;
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?') && !url.includes('n8n_chat_histories')) {
      conversasUrl = url;
      return new Response('[]', { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };

  try {
    const { onRequest } = await import('../../functions/api/conversas/list.js');
    const beforeTs = '2026-05-04T10:00:00Z';
    const req = new Request(`https://x.com/api/conversas/list?studio_token=${token}&grupo=hoje&before_ts=${encodeURIComponent(beforeTs)}`, { method: 'GET' });
    await onRequest({ request: req, env });
    assert.ok(conversasUrl);
    assert.match(conversasUrl, /or=\(/, 'mantém or= mesmo com before_ts');
    assert.match(conversasUrl, /last_msg_at=lt\./, 'adiciona filtro last_msg_at=lt');
  } finally {
    globalThis.fetch = origFetch;
  }
});
```

- [ ] **Step 2: Rodar tests pra confirmar que falham**

```bash
node --test tests/api/conversas-list.test.mjs
```

Expected: FAIL — `list.js` atual usa `estado_agente=in.(...)` sempre (single col), tests novos esperam `or=(...)` em "hoje".

- [ ] **Step 3: Modificar `functions/api/conversas/list.js`**

No arquivo, substituir bloco de linhas 73-87 (build query string) — encontre o trecho que começa com `// Build query string` e termina antes do `const r = await fetch(...)`. Substitua por:

```js
  // Build query string (cross-column or single-column dependendo do grupo)
  const { estados_agente, estados } = grupoFilter;
  const params = [
    `tenant_id=eq.${tenant_id}`,
    'select=id,telefone,estado,estado_agente,last_msg_at,valor_proposto,dados_coletados,dados_cadastro,estado_agente_anterior,pausada_em',
    'order=last_msg_at.desc',
    `limit=${limit}`,
  ];

  if (estados_agente.length && estados.length) {
    // Cross-column: ambas listas com itens (caso "hoje")
    const ea = estados_agente.map(encodeURIComponent).join(',');
    const es = estados.map(encodeURIComponent).join(',');
    params.push(`or=(estado_agente.in.(${ea}),estado.in.(${es}))`);
  } else if (estados_agente.length) {
    // Single-col estado_agente (casos "aguardando", "negociacao", "historico")
    const ea = estados_agente.map(encodeURIComponent).join(',');
    params.push(`estado_agente=in.(${ea})`);
  } else {
    // Single-col estado (não usado atualmente, mas defensive)
    const es = estados.map(encodeURIComponent).join(',');
    params.push(`estado=in.(${es})`);
  }

  if (grupoFilter.last_msg_at_gte) {
    params.push(`last_msg_at=gte.${encodeURIComponent(grupoFilter.last_msg_at_gte)}`);
  }
  if (before_ts) {
    params.push(`last_msg_at=lt.${encodeURIComponent(before_ts)}`);
  }
```

**Importante:** o `select=` agora inclui `estado` (workflow) além de `estado_agente`. Frontend pode ignorar ou usar futuramente.

- [ ] **Step 4: Rodar tests pra confirmar que passam**

```bash
node --test tests/api/conversas-list.test.mjs
```

Expected: PASS — 11 tests (8 ajustados + 3 novos).

- [ ] **Step 5: Commit**

```bash
git add tests/api/conversas-list.test.mjs functions/api/conversas/list.js
git commit -m "$(cat <<'EOF'
fix(conversas): list.js cross-column query (PostgREST or=) cruza estado + estado_agente

Bug crítico do PR #24: list.js filtrava só estado_agente, mas grupo "hoje" mistura
estados de duas colunas distintas (estado_agente=coletando_* + estado=escolhendo_horario/aguardando_sinal).
3 dos 4 painéis sempre vazios em prod.

Fix:
- Build query: or=(estado_agente.in.(...),estado.in.(...)) quando ambas listas têm itens
- Forma direta (estado_agente=in.(...) ou estado=in.(...)) quando só uma
- Select adiciona estado (workflow) pra frontend usar futuramente

Tests: 8 atualizados pra novo shape + 3 novos (or=, single col, before_ts com or=).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Criar `_lib/conversas-lifecycle.js` + tests (TDD puro)

**Objetivo:** Helper standalone idempotente que centraliza transição pra `estado_agente='fechado'` + motivo + timestamp. Tests primeiro.

**Files:**
- Create: `tests/_lib/conversas-lifecycle.test.mjs`
- Create: `functions/_lib/conversas-lifecycle.js`

- [ ] **Step 1: Criar dir tests se não existir + escrever test file**

```bash
mkdir -p tests/_lib
```

Criar `tests/_lib/conversas-lifecycle.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

const SUPABASE_URL = 'https://example.supabase.co';
const SUPABASE_KEY = 'test-service-key';
const CONVERSA_ID = '00000000-0000-0000-0000-000000000001';

test('markConversaFechada — motivo sinal_pago: grava estado_agente=fechado + dados_coletados merged', async () => {
  const { markConversaFechada } = await import('../../functions/_lib/conversas-lifecycle.js');

  const origFetch = globalThis.fetch;
  let getUrl = null, patchUrl = null, patchBody = null;
  globalThis.fetch = async (url, opts) => {
    if (opts?.method === 'PATCH') {
      patchUrl = url;
      patchBody = JSON.parse(opts.body);
      return new Response(JSON.stringify([{ id: CONVERSA_ID, estado_agente: 'fechado' }]), { status: 200 });
    }
    getUrl = url;
    return new Response(JSON.stringify([
      { dados_coletados: { nome: 'Ana', tattoo: 'leão' }, estado_agente: 'aguardando_sinal' }
    ]), { status: 200 });
  };

  try {
    const result = await markConversaFechada({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
      conversa_id: CONVERSA_ID,
      motivo: 'sinal_pago',
    });

    assert.deepEqual(result, { fechada: true, ja_estava_fechada: false });
    assert.match(getUrl, /id=eq\.00000000/);
    assert.match(patchUrl, /id=eq\.00000000/);
    assert.match(patchUrl, /estado_agente=neq\.fechado/);
    assert.equal(patchBody.estado_agente, 'fechado');
    assert.equal(patchBody.dados_coletados.fechado_motivo, 'sinal_pago');
    assert.match(patchBody.dados_coletados.fechado_em, /^\d{4}-\d{2}-\d{2}T/);
    // Preserva keys existentes
    assert.equal(patchBody.dados_coletados.nome, 'Ana');
    assert.equal(patchBody.dados_coletados.tattoo, 'leão');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('markConversaFechada — motivo hold_expirado: grava motivo correto', async () => {
  const { markConversaFechada } = await import('../../functions/_lib/conversas-lifecycle.js');

  const origFetch = globalThis.fetch;
  let patchBody = null;
  globalThis.fetch = async (url, opts) => {
    if (opts?.method === 'PATCH') {
      patchBody = JSON.parse(opts.body);
      return new Response(JSON.stringify([{ id: CONVERSA_ID }]), { status: 200 });
    }
    return new Response(JSON.stringify([{ dados_coletados: {}, estado_agente: 'aguardando_sinal' }]), { status: 200 });
  };

  try {
    const result = await markConversaFechada({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
      conversa_id: CONVERSA_ID,
      motivo: 'hold_expirado',
    });

    assert.equal(result.fechada, true);
    assert.equal(patchBody.dados_coletados.fechado_motivo, 'hold_expirado');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('markConversaFechada — idempotente: 2ª chamada na mesma conversa retorna ja_estava_fechada=true', async () => {
  const { markConversaFechada } = await import('../../functions/_lib/conversas-lifecycle.js');

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (opts?.method === 'PATCH') {
      // Simula: row já está fechada, filtro estado_agente=neq.fechado retorna 0 rows
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify([{ dados_coletados: {}, estado_agente: 'fechado' }]), { status: 200 });
  };

  try {
    const result = await markConversaFechada({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
      conversa_id: CONVERSA_ID,
      motivo: 'sinal_pago',
    });

    // Helper detecta estado_agente='fechado' no GET inicial e retorna sem PATCH
    assert.deepEqual(result, { fechada: false, ja_estava_fechada: true });
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('markConversaFechada — motivo inválido lança Error com lista de válidos', async () => {
  const { markConversaFechada, MOTIVOS_FECHAR_VALIDOS } = await import('../../functions/_lib/conversas-lifecycle.js');

  await assert.rejects(
    () => markConversaFechada({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
      conversa_id: CONVERSA_ID,
      motivo: 'foo_invalido',
    }),
    /motivo inválido.*foo_invalido/
  );

  assert.deepEqual(MOTIVOS_FECHAR_VALIDOS, ['sinal_pago', 'hold_expirado', 'tatuador_descartou']);
});

test('markConversaFechada — conversa inexistente lança Error informativo', async () => {
  const { markConversaFechada } = await import('../../functions/_lib/conversas-lifecycle.js');

  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([]), { status: 200 });

  try {
    await assert.rejects(
      () => markConversaFechada({
        supabaseUrl: SUPABASE_URL,
        supabaseKey: SUPABASE_KEY,
        conversa_id: CONVERSA_ID,
        motivo: 'sinal_pago',
      }),
      /não encontrada/
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});
```

- [ ] **Step 2: Rodar tests pra confirmar que falham (helper não existe)**

```bash
node --test tests/_lib/conversas-lifecycle.test.mjs
```

Expected: FAIL — `Cannot find module 'functions/_lib/conversas-lifecycle.js'`.

- [ ] **Step 3: Criar `functions/_lib/conversas-lifecycle.js`**

```js
// ── InkFlow — Lifecycle helper pra transições terminais de conversas ──
// Centraliza a lógica de "marcar conversa como fechada" pra evitar drift entre callers.
// Callers automáticos:
//   - mp-sinal-handler.js (motivo='sinal_pago' após estado='confirmado')
//   - cron/expira-holds.js (motivo='hold_expirado' após estado='expirado')
// Motivo 'tatuador_descartou' enum-ready sem caller atual (YAGNI).

export const MOTIVOS_FECHAR_VALIDOS = Object.freeze([
  'sinal_pago',
  'hold_expirado',
  'tatuador_descartou',
]);

/**
 * Marca conversa como fechada (estado_agente='fechado' + motivo + timestamp em dados_coletados).
 * Idempotente: chamadas repetidas retornam ja_estava_fechada=true sem efeito.
 *
 * @param {object} args
 * @param {string} args.supabaseUrl - ex.: 'https://bfzuxxuscyplfoimvomh.supabase.co'
 * @param {string} args.supabaseKey - service role key
 * @param {string} args.conversa_id - UUID da conversa
 * @param {string} args.motivo - um de MOTIVOS_FECHAR_VALIDOS
 * @returns {Promise<{fechada: boolean, ja_estava_fechada: boolean}>}
 * @throws {Error} se motivo inválido, conversa não encontrada, ou rede/PostgREST falhar
 */
export async function markConversaFechada({ supabaseUrl, supabaseKey, conversa_id, motivo }) {
  if (!MOTIVOS_FECHAR_VALIDOS.includes(motivo)) {
    throw new Error(`motivo inválido: ${motivo}. Válidos: ${MOTIVOS_FECHAR_VALIDOS.join(', ')}`);
  }
  if (typeof conversa_id !== 'string' || !conversa_id) {
    throw new Error('conversa_id obrigatório');
  }

  const baseHeaders = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };

  // 1) Read current dados_coletados + estado_agente (preserva keys existentes)
  const r1 = await fetch(
    `${supabaseUrl}/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}&select=dados_coletados,estado_agente`,
    { headers: baseHeaders }
  );
  if (!r1.ok) throw new Error(`fetch conversa falhou: ${r1.status}`);
  const rows = await r1.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`conversa ${conversa_id} não encontrada`);
  }
  const conv = rows[0];

  // Short-circuit: já estava fechada
  if (conv.estado_agente === 'fechado') {
    return { fechada: false, ja_estava_fechada: true };
  }

  const dadosAtualizados = {
    ...(conv.dados_coletados || {}),
    fechado_motivo: motivo,
    fechado_em: new Date().toISOString(),
  };

  // 2) PATCH com idempotência via filtro estado_agente=neq.fechado.
  // Se outro processo fechou nessa janela, PATCH afeta 0 rows → ja_estava_fechada.
  const r2 = await fetch(
    `${supabaseUrl}/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}&estado_agente=neq.fechado`,
    {
      method: 'PATCH',
      headers: {
        ...baseHeaders,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        estado_agente: 'fechado',
        dados_coletados: dadosAtualizados,
        updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!r2.ok) {
    const errText = await r2.text().catch(() => '');
    throw new Error(`PATCH conversa falhou: ${r2.status} ${errText}`);
  }
  const updated = await r2.json();
  return {
    fechada: Array.isArray(updated) && updated.length > 0,
    ja_estava_fechada: Array.isArray(updated) && updated.length === 0,
  };
}
```

- [ ] **Step 4: Rodar tests pra confirmar que passam**

```bash
node --test tests/_lib/conversas-lifecycle.test.mjs
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/_lib/conversas-lifecycle.test.mjs functions/_lib/conversas-lifecycle.js
git commit -m "$(cat <<'EOF'
feat(lifecycle): markConversaFechada helper idempotente pra transições terminais

Centraliza grava estado_agente=fechado + dados_coletados.fechado_motivo + fechado_em.
Idempotência via filtro PATCH estado_agente=neq.fechado (race-safe).
Motivos enum: sinal_pago, hold_expirado, tatuador_descartou.

Tests: 5 cobrindo motivos válidos + inválido + idempotência + conversa inexistente +
preservação de keys em dados_coletados.

Próximos commits: wire mp-sinal-handler + cron/expira-holds.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire caller `mp-sinal-handler.js`

**Objetivo:** Após `estado='confirmado'` ser gravado, chamar `markConversaFechada(motivo:'sinal_pago')` em try/catch não-bloqueante. Precisa capturar `conversa_id` do PATCH atual (que filtra por `tenant_id+telefone`).

**Files:**
- Modify: `functions/_lib/mp-sinal-handler.js:74-80`

- [ ] **Step 1: Modificar PATCH conversas pra retornar id (com `Prefer: return=representation`)**

No arquivo `functions/_lib/mp-sinal-handler.js`, localizar o bloco `// Atualiza conversa correspondente para confirmado` (linhas ~74-80) e substituir por:

```js
  // Atualiza conversa correspondente para confirmado e marca lifecycle fechado
  if (ag.cliente_telefone && ag.tenant_id) {
    const cRes = await supaFetch(
      env,
      `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(ag.tenant_id)}&telefone=eq.${encodeURIComponent(ag.cliente_telefone)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ estado: 'confirmado', updated_at: new Date().toISOString() }),
      }
    );

    // Lifecycle: fecha conversa após sinal pago. Não-bloqueante — falha aqui não invalida sinal.
    if (cRes.ok) {
      const updated = await cRes.json().catch(() => []);
      if (Array.isArray(updated) && updated.length > 0 && updated[0].id) {
        try {
          const { markConversaFechada } = await import('./conversas-lifecycle.js');
          const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
          await markConversaFechada({
            supabaseUrl: SUPABASE_URL,
            supabaseKey: SB_KEY,
            conversa_id: updated[0].id,
            motivo: 'sinal_pago',
          });
        } catch (e) {
          console.warn('mp-sinal-handler: markConversaFechada falhou (não-bloqueante):', e?.message);
        }
      }
    }
  }
```

**Detalhes importantes:**
- `Prefer: return=representation` faz PostgREST retornar as rows atualizadas (incluindo `id`).
- `import` dinâmico pra evitar carregar lifecycle helper se nunca chega aqui (path raro).
- try/catch isolado: erro no helper → warn log + continua (sinal segue confirmado).

- [ ] **Step 2: Rodar bateria — confirmar nada quebrou**

```bash
bash scripts/test-prompts.sh && node --test tests/api/conversas-grupos.test.mjs tests/api/conversas-list.test.mjs tests/api/conversas-thread.test.mjs tests/_lib/conversas-lifecycle.test.mjs
```

Expected: todos passam (não há test direto de mp-sinal-handler na bateria, mas helpers que ele usa estão verde).

- [ ] **Step 3: Commit**

```bash
git add functions/_lib/mp-sinal-handler.js
git commit -m "$(cat <<'EOF'
feat(mp-sinal-handler): chama markConversaFechada(sinal_pago) após estado=confirmado

PATCH conversas agora usa Prefer: return=representation pra capturar conversa_id,
depois chama lifecycle helper em try/catch isolado. Não-bloqueante — se helper falhar,
sinal segue confirmado, painel Histórico apenas degrada (não vai mostrar essa conversa).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Wire caller `cron/expira-holds.js`

**Objetivo:** Após PATCH bulk em conversas (estado='expirado'), iterar pelos ids chamando `markConversaFechada(motivo:'hold_expirado')` em try/catch isolado por conversa (uma falha não derruba batch).

**Files:**
- Modify: `functions/api/cron/expira-holds.js:69-86`

- [ ] **Step 1: Modificar handler pra adicionar loop lifecycle após PATCH bulk**

No arquivo `functions/api/cron/expira-holds.js`, localizar o bloco `// 3. Atualiza conversas pra expirado` (linhas ~69-85) e substituir por:

```js
  // 3. Atualiza conversas pra expirado
  const convIds = conversas.map(c => `"${c.id}"`).join(',');
  if (convIds) {
    await supaFetch(
      env,
      `/rest/v1/conversas?id=in.(${convIds})`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          estado: 'expirado',
          slot_expira_em: null,
          slot_tentative_id: null,
          updated_at: nowIso,
        }),
      }
    );
  }

  // 4. Lifecycle: fecha cada conversa em try/catch isolado (uma falha não derruba batch).
  let lifecycleFechadas = 0;
  let lifecycleFalhas = 0;
  if (conversas.length > 0) {
    const { markConversaFechada } = await import('../../_lib/conversas-lifecycle.js');
    const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
    for (const conv of conversas) {
      try {
        const r = await markConversaFechada({
          supabaseUrl: SUPABASE_URL,
          supabaseKey: SB_KEY,
          conversa_id: conv.id,
          motivo: 'hold_expirado',
        });
        if (r.fechada) lifecycleFechadas++;
      } catch (e) {
        lifecycleFalhas++;
        console.warn(`expira-holds: markConversaFechada falhou pra ${conv.id}:`, e?.message);
      }
    }
  }

  return json({ ok: true, processadas: conversas.length, canceladas, lifecycleFechadas, lifecycleFalhas });
}
```

**Detalhes importantes:**
- Import dinâmico do helper (path `../../_lib/conversas-lifecycle.js`).
- Loop sequencial (não paralelo) — evita stress no Supabase com batches grandes; prod normalmente tem <10 expirações por run.
- Response inclui `lifecycleFechadas` + `lifecycleFalhas` pra observabilidade no log do cron worker.

- [ ] **Step 2: Rodar bateria pra confirmar nada quebrou**

```bash
bash scripts/test-prompts.sh && node --test tests/api/conversas-grupos.test.mjs tests/api/conversas-list.test.mjs tests/api/conversas-thread.test.mjs tests/_lib/conversas-lifecycle.test.mjs
```

Expected: todos passam.

- [ ] **Step 3: Commit**

```bash
git add functions/api/cron/expira-holds.js
git commit -m "$(cat <<'EOF'
feat(cron): expira-holds chama markConversaFechada(hold_expirado) por conversa

Após PATCH bulk em conversas (estado=expirado), loop sequencial chama lifecycle
helper em try/catch isolado por id — uma falha não derruba o batch.
Response retorna lifecycleFechadas + lifecycleFalhas pra observabilidade.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Adicionar tests novos ao runner shell + smoke local full

**Objetivo:** Garantir que `scripts/test-prompts.sh` cobre os tests novos pra prevenir drift futuro.

**Files:**
- Modify: `scripts/test-prompts.sh`

- [ ] **Step 1: Adicionar 4 linhas ao runner**

No arquivo `scripts/test-prompts.sh`, antes da linha `echo "✓ Todos os tests passaram."`, adicionar:

```bash
echo "▶ API — conversas grupos..."
node --test tests/api/conversas-grupos.test.mjs

echo "▶ API — conversas list..."
node --test tests/api/conversas-list.test.mjs

echo "▶ API — conversas thread..."
node --test tests/api/conversas-thread.test.mjs

echo "▶ Lib — conversas-lifecycle..."
node --test tests/_lib/conversas-lifecycle.test.mjs
```

**Nota:** `conversas-thread.test.mjs` já existe (PR #24) e funciona — está sendo adicionado ao runner pela primeira vez aqui (oportuna correção de gap).

- [ ] **Step 2: Rodar bateria full**

```bash
bash scripts/test-prompts.sh
```

Expected: zero falhas. Output deve incluir as 4 novas seções com PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-prompts.sh
git commit -m "$(cat <<'EOF'
chore(tests): runner cobre conversas-{grupos,list,thread} + lifecycle

Adicionado ao scripts/test-prompts.sh os 4 tests de conversas que rodavam manualmente.
Previne drift futuro — qualquer commit que quebra esses tests vai disparar no pre-push.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Audit final + push branch + abrir PR

**Objetivo:** Confirmar conformidade total com spec, push branch, abrir PR sem mergear.

**Files:**
- None (audit + git operations)

- [ ] **Step 1: Diff stat e overview**

```bash
git log --oneline main..HEAD
git diff main..HEAD --stat
```

Expected: ~7 commits (spec + 6 implementation), ~9 arquivos mudados, ~150 linhas líquidas (dependendo do delta de tests).

- [ ] **Step 2: Auto-checklist contra critérios de aceitação do spec**

Verificar manualmente cada item da seção "Critérios de aceitação" do spec:

- [ ] `_grupos.js` retorna `{estados_agente, estados, last_msg_at_gte?}` — verificar no diff de `functions/api/conversas/_grupos.js`
- [ ] `list.js` constrói query corretamente — verificar diff de `functions/api/conversas/list.js`
- [ ] `markConversaFechada` é idempotente — test 3 do `conversas-lifecycle.test.mjs` cobre
- [ ] `mp-sinal-handler.js` chama helper em try/catch — verificar diff
- [ ] `cron/expira-holds.js` chama helper em try/catch isolado por conversa — verificar diff
- [ ] 23 tests verde — `bash scripts/test-prompts.sh` exit 0

```bash
bash scripts/test-prompts.sh && echo "✓ ALL TESTS PASS"
```

- [ ] **Step 3: Push branch**

```bash
git push -u origin feat/pr-4-1-fix-grupos-conversas
```

- [ ] **Step 4: Abrir PR (sem mergear)**

```bash
gh pr create --title "fix(conversas): PR 4.1 cross-column query + lifecycle helper" --body "$(cat <<'EOF'
## Summary

- Fix 3 bugs do PR #24 que tornam 3 dos 4 painéis Conversas sempre vazios em prod
- Cross-column query no `list.js` (PostgREST `or=`) cruzando `estado_agente` + `estado`
- Novo helper `markConversaFechada` idempotente com 2 callers automáticos (`mp-sinal-handler` + `cron/expira-holds`)

Spec: `docs/superpowers/specs/2026-05-04-pr-4-1-fix-grupos-conversas-design.md`

## Bugs corrigidos

1. **`_grupos.js` mistura colunas** — listava workflow states (`escolhendo_horario`, `aguardando_sinal`) num filtro single-column de `estado_agente`. Painel "Hoje" sempre vazio em prod.
2. **`fechado` nunca gravado** — sub-tab "📁 Histórico" sempre vazio. Helper resolve.
3. **Bug menor (UX)** lista lateral não re-fetcha após Assumir/Devolver — fica P3 backlog separado (fora deste PR).

## Test plan

- [ ] CF Pages buildou (~1-2min)
- [ ] Smoke browser: criar conversa teste com `estado='escolhendo_horario'` + `estado_agente='ativo'` → aparece em "Hoje"
- [ ] Smoke browser: criar conversa teste com `estado_agente='aguardando_tatuador'` → aparece em "Aguardando"
- [ ] Smoke browser: tab "Em negociação" continua funcionando (regressão zero)
- [ ] Smoke browser: simular sinal pago via Mercado Pago → conversa migra pra "📁 Histórico"
- [ ] Tests verde: `bash scripts/test-prompts.sh`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Validação final — print URL do PR**

```bash
gh pr view --json url -q .url
```

Expected: URL do PR aberto, pronto pra Leandro fazer smoke browser pós-deploy + revisar + mergear.

---

## Riscos e mitigações (resumo)

| Risco | Mitigação no plano |
|---|---|
| PostgREST `or=` parser quebra | Tests cobrem ambas formas (or= + direta) — Tasks 3 |
| Race read-then-patch no helper | Idempotência via filtro `neq.fechado` no PATCH — Task 4 |
| `coletando_tattoo` zero em prod hoje | Documentado no spec como feature gap (Modo Coleta v2 PR 2 dependente) |
| Helper falha silenciosa em cron | try/catch isolado por conversa — Task 6 |
| `mp-sinal-handler` PATCH falha | try/catch wrap — Task 5 |

## Rollback

Se smoke browser pós-deploy detectar regressão:
1. `gh pr close <PR#>` sem merge — branch fica disponível pra fix
2. Prod continua no `90a8c2e` (PR #24 main) — bugs originais persistem mas painel não fica pior
3. Investigar via logs CF Pages + tests locais

## Cross-references

- Spec: `docs/superpowers/specs/2026-05-04-pr-4-1-fix-grupos-conversas-design.md`
- PR #24 (Painel Conversas): https://github.com/brazilianhustle/inkflow-saas/pull/24
- Smoke 04/05 noite parte 5: ver Painel `last_session_focus`
