# Pix dinâmico no sinal — Core (geração + loop pós-pagamento) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O bot passa a cobrar o sinal por **Pix dinâmico** (copia-e-cola dentro do WhatsApp) como padrão no fluxo principal de reserva, e quando o sinal cai o loop se fecha — cliente confirmado no WhatsApp + tatuador avisado no Telegram.

**Architecture:** Reusa toda a infra MP existente. A tool `gerar-link-sinal` ganha um caminho `metodo: 'pix'` que chama `POST /v1/payments` (em vez da Preference cartão-first), entregando `copia-e-cola` que o `executeOrchestration` injeta na `resposta_cliente` — o pipeline WhatsApp já quebra em balões por `\n\n`. A confirmação reusa o `mp-sinal-handler` (que já busca o payment e promove `tentative → confirmed`); a novidade é o loop pós-pagamento (notificações fail-open) após o guard de idempotência. Uma flag `ENABLE_PIX_SINAL` permite rollback sem revert de código. A fonte do token MP vira a abstração `getMpAccessToken(env, tenant)` — a costura onde o MP Connect (sub-projeto futuro) entra sem tocar no código do Pix.

**Tech Stack:** Cloudflare Pages Functions (JS, ESM), Mercado Pago API (`/v1/payments`), Supabase REST, Evolution API v2, Telegram Bot API. Testes: `node:test` nativo (`node --test 'tests/**/*.test.mjs'`), mock via `globalThis.fetch`. Zod ^3.23 (não tocado neste plano). **Sem migration** — todas as colunas usadas (`agendamentos.mp_payment_id`, `sinal_valor`, `sinal_pago_em`, `inicio`, `cliente_nome`, `cliente_telefone`; `conversas.estado`, `slot_expira_em`, `slot_tentative_id`) já existem.

---

## Escopo deste plano (Fase 1 — Core)

Este é o **Plano 1 de 2** (decisão de engenharia 2026-05-21: dois planos sequenciais; o core fica 100% pronto + smoke real antes de avançar). Cobre os itens 1, 4, 5 e 6 da Fase 1 do spec:

- ✅ Geração Pix por padrão (`POST /v1/payments`) entregando copia-e-cola
- ✅ Confirmação ao cliente no WhatsApp quando o sinal é pago
- ✅ Aviso ao tatuador no Telegram quando o sinal é pago
- ✅ Abstração `getMpAccessToken(env, tenant)`
- ✅ Feature flag `ENABLE_PIX_SINAL`

**Fica para o Plano 2** (ações conversacionais em `aguardando_sinal`): QR sob demanda (`reenviar_pix_sinal`), fallback cartão mediante objeção (`oferecer_cartao_sinal` + cancelar Pix / Gap #3), "já paguei" (`verificar_pagamento_sinal` / Gap #1 reativo), e extensão do `consultar-proposta-tatuador`/prefetch pra trazer `mp_payment_id`. **Fora de escopo de ambos:** MP Connect (item 7), Google Calendar (Fase 2), cron de reconciliação proativa (Gap #1 follow-up — vira item de backlog), parcelamento, refator de tom.

## Riscos sinalizados

| Risco | Mitigação no plano |
|---|---|
| **Env nova `ENABLE_PIX_SINAL`** precisa existir no CF Pages. Default quando ausente = **Pix ON** (`!== 'false'`). | Task 6 (smoke) inclui setar a flag explicitamente. Rollback documentado: `ENABLE_PIX_SINAL=false`. |
| **Conta MP global** (memória `inkflow-mp-conta-global`): sem MP Connect, o sinal cai na conta do **InkFlow**, não do estúdio. | Aceitável **só pra smoke técnico** (centavos do Leandro). Cliente real só após Plano MP Connect. Documentado na Task 6. |
| **`date_of_expiration` exige offset explícito** (`-03:00`); `toISOString()` devolve `Z`. | Helper `isoComOffsetSP` na Task 2 (Brasil sem DST desde 2019 → `-03:00` fixo). |
| **Idempotency vs regeneração de Pix**: key fixa por agendamento devolveria o Pix expirado na regen. | Task 2 usa `X-Idempotency-Key: sinal-{id}-{novoSlotExpira}` — varia entre gerações, estável dentro da chamada. Trade-off documentado. |
| **Notificações no webhook** (Evolution/Telegram podem falhar). | Loop pós-pagamento é **fail-open** (Task 5): falha só loga, sinal continua válido. |
| **`payer.email` embute telefone (PII menor / LGPD)**. | Documentado; e-mail sintético `cli{telefone}@inkflowbrasil.com` (decisão #5 do spec). |
| **Mudança no comportamento do handler quebra testes L8/L9 existentes.** | Task 5 atualiza L8/L9 explicitamente (não mascara bug — comportamento mudou por design) + adiciona testes do loop. |

---

## Task 1: Helper `getMpAccessToken` (costura pro MP Connect)

Fonte única do token MP. Hoje devolve o global; amanhã o MP Connect preenche `tenant.mp_access_token` sem tocar no Pix. Refatora os **dois call-sites do sinal** (gerar-link-sinal, mp-sinal-handler) pra consumi-lo. Os call-sites de assinatura SaaS (`create-subscription`, `mp-ipn`, `delete-tenant`, auditors) ficam **intocados** — não são do fluxo de sinal por tenant.

**Files:**
- Create: `functions/_lib/mp-token.js`
- Create: `tests/_lib/mp-token.test.mjs`
- Modify: `functions/api/tools/gerar-link-sinal.js:26` (usar helper)
- Modify: `functions/_lib/mp-sinal-handler.js:29` (usar helper)

- [ ] **Step 1: Write the failing test**

`tests/_lib/mp-token.test.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getMpAccessToken } from '../../functions/_lib/mp-token.js';

test('getMpAccessToken: devolve o token global quando não há tenant', () => {
  assert.equal(getMpAccessToken({ MP_ACCESS_TOKEN: 'GLOBAL-tok' }), 'GLOBAL-tok');
});

test('getMpAccessToken: devolve global mesmo com tenant (MP Connect ainda não existe)', () => {
  // Hoje o tenant NÃO tem credencial própria — confirma que a costura existe
  // mas o comportamento atual é sempre global. Plano MP Connect muda este teste.
  assert.equal(getMpAccessToken({ MP_ACCESS_TOKEN: 'GLOBAL-tok' }, { id: 't1' }), 'GLOBAL-tok');
});

test('getMpAccessToken: undefined quando env não tem token', () => {
  assert.equal(getMpAccessToken({}), undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/_lib/mp-token.test.mjs`
Expected: FAIL — `Cannot find module '.../functions/_lib/mp-token.js'`

- [ ] **Step 3: Write minimal implementation**

`functions/_lib/mp-token.js`:
```javascript
// functions/_lib/mp-token.js
// Fonte única do token Mercado Pago do fluxo de SINAL. Costura entre esta
// feature (Pix dinâmico) e o sub-projeto MP Connect (OAuth por estúdio).
//
// HOJE: devolve env.MP_ACCESS_TOKEN (conta global do InkFlow).
// AMANHÃ: o MP Connect preenche o token do estúdio (ex.: tenant.mp_access_token
// ou lookup numa tabela de conexões OAuth) e o sinal passa a cair na conta do
// estúdio SEM tocar no código do Pix (gerar-link-sinal / mp-sinal-handler).
//
// NÃO usar nos call-sites de assinatura SaaS (create-subscription, mp-ipn de
// assinatura, delete-tenant) — esses são da conta InkFlow por definição.
export function getMpAccessToken(env, tenant = null) {
  // Ponto de extensão do MP Connect:
  //   if (tenant?.mp_access_token) return tenant.mp_access_token;
  return env.MP_ACCESS_TOKEN;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/_lib/mp-token.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 5: Refactor os dois call-sites do sinal**

Em `functions/api/tools/gerar-link-sinal.js`, adicionar import no topo (junto ao import existente):
```javascript
import { withTool, supaFetch } from './_tool-helpers.js';
import { getMpAccessToken } from '../../_lib/mp-token.js';
```
E trocar a linha 26:
```javascript
  const MP_TOKEN = getMpAccessToken(env); // tenant entra no Plano MP Connect
  if (!MP_TOKEN) return { status: 503, body: { ok: false, error: 'mp-nao-configurado' } };
```

Em `functions/_lib/mp-sinal-handler.js`, adicionar import no topo:
```javascript
import { getMpAccessToken } from './mp-token.js';
```
E trocar a linha 29:
```javascript
  const MP_TOKEN = getMpAccessToken(env);
  if (!MP_TOKEN) return { ok: false, error: 'mp-not-configured' };
```

- [ ] **Step 6: Run the existing handler tests to confirm no regression**

Run: `node --test tests/_lib/mp-sinal-handler.test.mjs`
Expected: PASS — todos os 13 testes (L1 ainda dá `mp-not-configured` quando token ausente).

- [ ] **Step 7: Commit**

```bash
git add functions/_lib/mp-token.js tests/_lib/mp-token.test.mjs functions/api/tools/gerar-link-sinal.js functions/_lib/mp-sinal-handler.js
git commit -m "feat(sinal): helper getMpAccessToken como costura pro MP Connect"
```

---

## Task 2: `gerar-link-sinal` — caminho Pix dinâmico (`POST /v1/payments`)

A tool ganha `metodo: 'pix' | 'cartao'` (default `pix`). `pix` (e flag on) → `POST /v1/payments` retornando copia-e-cola + QR base64 + persistindo `mp_payment_id` real. `cartao` (ou flag off) → o caminho Preference atual, **intocado**. Toda validação/regeneração/conflito de slot do começo da tool é compartilhada entre os dois caminhos.

**Files:**
- Modify: `functions/api/tools/gerar-link-sinal.js`
- Create: `tests/api/tools/gerar-link-sinal.test.mjs`

- [ ] **Step 1: Write the failing tests**

`tests/api/tools/gerar-link-sinal.test.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../../functions/api/tools/gerar-link-sinal.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const AG_ID = '00000000-0000-0000-0000-000000000aaa';
const SECRET = 'test-secret';

function buildContext(body, env) {
  return {
    request: new Request('https://example.com/api/tools/gerar-link-sinal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Inkflow-Tool-Secret': SECRET },
      body: JSON.stringify(body),
    }),
    env,
    waitUntil: () => {},
  };
}

function baseEnv(overrides = {}) {
  return {
    INKFLOW_TOOL_SECRET: SECRET,
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    MP_ACCESS_TOKEN: 'TEST-mp-token',
    SITE_URL: 'https://inkflowbrasil.com',
    ENABLE_PIX_SINAL: 'true',
    ...overrides,
  };
}

// Mock fetch que captura o POST ao MP e devolve um payment Pix.
function mockFetch({ capture }) {
  return async (url, init = {}) => {
    const u = String(url);
    if (u.includes('/rest/v1/agendamentos') && (init.method || 'GET') === 'GET') {
      return new Response(JSON.stringify([{
        id: AG_ID, status: 'tentative', inicio: '2026-05-23T13:00:00Z', fim: '2026-05-23T16:00:00Z',
        cliente_nome: 'Ana', cliente_telefone: '+5511988887777',
      }]), { status: 200 });
    }
    if (u.includes('/rest/v1/tenants')) {
      return new Response(JSON.stringify([{ nome_estudio: 'Estudio X', sinal_percentual: 30 }]), { status: 200 });
    }
    if (u.includes('api.mercadopago.com/v1/payments')) {
      capture.mpUrl = u; capture.mpInit = init;
      return new Response(JSON.stringify({
        id: 12345678,
        point_of_interaction: { transaction_data: { qr_code: '00020126-COPIA-E-COLA', qr_code_base64: 'iVBORw0KGgo=' } },
      }), { status: 201 });
    }
    if (u.includes('api.mercadopago.com/checkout/preferences')) {
      capture.prefCalled = true;
      return new Response(JSON.stringify({ id: 'pref-1', init_point: 'https://mpago.la/checkout' }), { status: 201 });
    }
    if (u.includes('/rest/v1/agendamentos') || u.includes('/rest/v1/conversas') || u.includes('tool_calls_log')) {
      return new Response('', { status: 200 });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
}

test('gerar-link-sinal metodo=pix: POST /v1/payments com payload correto + persiste mp_payment_id', async () => {
  const orig = globalThis.fetch;
  const capture = {};
  globalThis.fetch = mockFetch({ capture });
  try {
    const res = await onRequest(buildContext({ tenant_id: TENANT_ID, agendamento_id: AG_ID, valor_sinal: 225, metodo: 'pix' }, baseEnv()));
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.metodo_usado, 'pix');
    assert.equal(body.copia_e_cola, '00020126-COPIA-E-COLA');
    assert.equal(body.qr_code_base64, 'iVBORw0KGgo=');
    assert.equal(body.mp_payment_id, '12345678');
    // payload do POST ao MP
    const sent = JSON.parse(capture.mpInit.body);
    assert.equal(sent.payment_method_id, 'pix');
    assert.equal(sent.external_reference, `sinal:${AG_ID}`);
    assert.equal(sent.transaction_amount, 225);
    assert.equal(sent.notification_url, 'https://inkflowbrasil.com/api/webhooks/mp-sinal');
    assert.equal(sent.payer.email, 'cli5511988887777@inkflowbrasil.com');
    assert.equal(sent.payer.first_name, 'Ana');
    assert.match(sent.date_of_expiration, /-03:00$/);
    // idempotency key presente e específica do agendamento
    assert.match(capture.mpInit.headers['X-Idempotency-Key'], new RegExp(`^sinal-${AG_ID}-`));
    assert.equal(capture.prefCalled, undefined); // NÃO chamou Preference
  } finally { globalThis.fetch = orig; }
});

test('gerar-link-sinal metodo=cartao: mantém a Preference atual (regressão)', async () => {
  const orig = globalThis.fetch;
  const capture = {};
  globalThis.fetch = mockFetch({ capture });
  try {
    const res = await onRequest(buildContext({ tenant_id: TENANT_ID, agendamento_id: AG_ID, valor_sinal: 225, metodo: 'cartao' }, baseEnv()));
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.metodo_usado, 'cartao');
    assert.equal(body.link_pagamento, 'https://mpago.la/checkout');
    assert.equal(capture.prefCalled, true);
    assert.equal(capture.mpUrl, undefined); // NÃO chamou /v1/payments
  } finally { globalThis.fetch = orig; }
});

test('gerar-link-sinal ENABLE_PIX_SINAL=false: metodo=pix cai pro cartão/Preference', async () => {
  const orig = globalThis.fetch;
  const capture = {};
  globalThis.fetch = mockFetch({ capture });
  try {
    const res = await onRequest(buildContext({ tenant_id: TENANT_ID, agendamento_id: AG_ID, valor_sinal: 225, metodo: 'pix' }, baseEnv({ ENABLE_PIX_SINAL: 'false' })));
    const body = await res.json();
    assert.equal(body.metodo_usado, 'cartao');
    assert.equal(capture.prefCalled, true);
  } finally { globalThis.fetch = orig; }
});

test('gerar-link-sinal metodo default = pix quando omitido', async () => {
  const orig = globalThis.fetch;
  const capture = {};
  globalThis.fetch = mockFetch({ capture });
  try {
    const res = await onRequest(buildContext({ tenant_id: TENANT_ID, agendamento_id: AG_ID, valor_sinal: 225 }, baseEnv()));
    const body = await res.json();
    assert.equal(body.metodo_usado, 'pix');
  } finally { globalThis.fetch = orig; }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/api/tools/gerar-link-sinal.test.mjs`
Expected: FAIL — `metodo_usado` undefined, `copia_e_cola` undefined (caminho Pix ainda não existe).

- [ ] **Step 3: Implement the Pix path**

Em `functions/api/tools/gerar-link-sinal.js`:

(a) Adicionar a base da API de payments e um helper de offset, logo após `const MP_API = '...'` (linha 14):
```javascript
const MP_API = 'https://api.mercadopago.com/checkout/preferences';
const MP_PAYMENTS_API = 'https://api.mercadopago.com/v1/payments';
const HOLD_MIN = 2880; // 48 horas — mesmo TTL do reservar-horario

// MP exige date_of_expiration com offset explícito; toISOString() devolve Z (UTC).
// Brasil aboliu o horário de verão em 2019 → America/Sao_Paulo é -03:00 fixo.
function isoComOffsetSP(date) {
  const sp = new Date(date.getTime() - 3 * 3600 * 1000); // desloca pro "relógio SP"
  const p = (n) => String(n).padStart(2, '0');
  return `${sp.getUTCFullYear()}-${p(sp.getUTCMonth() + 1)}-${p(sp.getUTCDate())}` +
    `T${p(sp.getUTCHours())}:${p(sp.getUTCMinutes())}:${p(sp.getUTCSeconds())}.000-03:00`;
}
```

(b) Adicionar leitura do `metodo` no destructuring do input (linha 18):
```javascript
  const { tenant_id, agendamento_id, valor_sinal, metodo } = input || {};
```

(c) Logo após calcular `sinalPct` (linha 59) e `siteUrl`/`externalRef` (linhas 62-63), **antes** de montar `prefBody`, computar `novoSlotExpira` (que hoje está na linha 99 — subir pra cá pra reuso) e decidir o caminho. Substituir o bloco que vai de `// Monta Preference` (linha 61) até o `return` final (linha 137) por:

```javascript
  const siteUrl = env.SITE_URL || 'https://inkflowbrasil.com';
  const externalRef = `sinal:${agendamento_id}`;
  const novoSlotExpira = new Date(Date.now() + HOLD_MIN * 60000).toISOString();

  // Pix é o padrão (decisão #2). Flag ENABLE_PIX_SINAL=false força o cartão
  // (rollback sem revert). metodo='cartao' explícito também força o cartão.
  const pixEnabled = env.ENABLE_PIX_SINAL !== 'false';
  const usarPix = (metodo !== 'cartao') && pixEnabled;

  // Helper de persistência (compartilhado pelos dois caminhos).
  async function persistir(patchExtra) {
    const agendamentoPatch = { sinal_valor: Number(valor_sinal), ...patchExtra };
    if (regenerado) agendamentoPatch.status = 'tentative';
    await supaFetch(env, `/rest/v1/agendamentos?id=eq.${encodeURIComponent(agendamento_id)}`, {
      method: 'PATCH', body: JSON.stringify(agendamentoPatch),
    });
    if (ag.cliente_telefone) {
      await supaFetch(env, `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(ag.cliente_telefone)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(patchExtra.mp_preference_id ? { mp_preference_id: patchExtra.mp_preference_id } : {}),
          estado: 'aguardando_sinal',
          slot_tentative_id: agendamento_id,
          slot_expira_em: novoSlotExpira,
          updated_at: new Date().toISOString(),
        }),
      });
    }
  }

  if (usarPix) {
    // ── Caminho Pix dinâmico: POST /v1/payments → copia-e-cola + QR ──────────
    const telDigits = String(ag.cliente_telefone || '').replace(/\D/g, '');
    const pixBody = {
      transaction_amount: Number(Number(valor_sinal).toFixed(2)),
      description: `Sinal tatuagem - ${tenant.nome_estudio || 'Estudio'}`,
      payment_method_id: 'pix',
      external_reference: externalRef,
      notification_url: `${siteUrl}/api/webhooks/mp-sinal`,
      date_of_expiration: isoComOffsetSP(new Date(Date.now() + HOLD_MIN * 60000)),
      payer: {
        email: telDigits ? `cli${telDigits}@inkflowbrasil.com` : 'cliente@inkflowbrasil.com',
        first_name: ag.cliente_nome || 'Cliente',
      },
    };
    // Idempotency key inclui a expiração recomputada por chamada: protege contra
    // retry duplicado da MESMA geração, mas regen (Pix expirado) produz key nova
    // e portanto um Pix novo (não devolve o expirado).
    const idemKey = `sinal-${agendamento_id}-${novoSlotExpira}`;
    const mpRes = await fetch(MP_PAYMENTS_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': idemKey },
      body: JSON.stringify(pixBody),
    });
    if (!mpRes.ok) {
      const errd = await mpRes.text();
      console.error('gerar-link-sinal: MP pix error:', errd);
      return { status: 502, body: { ok: false, error: 'mp-error', detail: errd.slice(0, 300) } };
    }
    const pix = await mpRes.json();
    const td = pix?.point_of_interaction?.transaction_data || {};
    if (!td.qr_code || !pix.id) {
      return { status: 502, body: { ok: false, error: 'mp-sem-qr' } };
    }
    await persistir({ mp_payment_id: String(pix.id) });
    return {
      status: 200,
      body: {
        ok: true,
        metodo_usado: 'pix',
        mp_payment_id: String(pix.id),
        copia_e_cola: td.qr_code,
        qr_code_base64: td.qr_code_base64 || null,
        external_reference: externalRef,
        valor: Number(valor_sinal),
        sinal_percentual: sinalPct,
        hold_horas: Math.round(HOLD_MIN / 60),
        expira_em: novoSlotExpira,
        regenerado,
      },
    };
  }

  // ── Caminho cartão: Preference one-shot (comportamento legado, intocado) ──
  const prefBody = {
    items: [{
      id: agendamento_id,
      title: `Sinal - ${tenant.nome_estudio || 'Tatuagem'}`,
      description: `Sinal para sessao em ${new Date(ag.inicio).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
      quantity: 1,
      unit_price: Number(Number(valor_sinal).toFixed(2)),
      currency_id: 'BRL',
    }],
    external_reference: externalRef,
    notification_url: `${siteUrl}/api/webhooks/mp-sinal`,
    back_urls: {
      success: `${siteUrl}/sinal-ok?ag=${agendamento_id}`,
      failure: `${siteUrl}/sinal-falha?ag=${agendamento_id}`,
      pending: `${siteUrl}/sinal-pendente?ag=${agendamento_id}`,
    },
    auto_return: 'approved',
    metadata: { tenant_id, agendamento_id, tipo: 'sinal_tatuagem' },
  };
  const mpRes = await fetch(MP_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(prefBody),
  });
  if (!mpRes.ok) {
    const errd = await mpRes.text();
    console.error('gerar-link-sinal: MP error:', errd);
    return { status: 502, body: { ok: false, error: 'mp-error', detail: errd.slice(0, 300) } };
  }
  const pref = await mpRes.json();
  const link = pref.init_point || pref.sandbox_init_point;
  if (!link) return { status: 502, body: { ok: false, error: 'mp-sem-link' } };
  await persistir({ mp_payment_id: null, mp_preference_id: pref.id });
  return {
    status: 200,
    body: {
      ok: true,
      metodo_usado: 'cartao',
      link_pagamento: link,
      preference_id: pref.id,
      external_reference: externalRef,
      valor: Number(valor_sinal),
      sinal_percentual: sinalPct,
      hold_horas: Math.round(HOLD_MIN / 60),
      expira_em: novoSlotExpira,
      regenerado,
    },
  };
```

> Nota: o `persistir({ mp_preference_id })` no caminho cartão substitui o PATCH de conversa que antes setava `mp_preference_id: pref.id`. O `persistir` só inclui `mp_preference_id` no patch da conversa quando ele vem no `patchExtra` — preservando o comportamento legado exato.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/api/tools/gerar-link-sinal.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add functions/api/tools/gerar-link-sinal.js tests/api/tools/gerar-link-sinal.test.mjs
git commit -m "feat(sinal): caminho Pix dinâmico em gerar-link-sinal (metodo + ENABLE_PIX_SINAL)"
```

---

## Task 3: `format-link-sinal-msg` — variante Pix (copia-e-cola em balão próprio)

Mensagem do Pix em 2 balões (separados por `\n\n` — o pipeline WhatsApp os envia como mensagens distintas em `whatsapp-pipeline.js:294`): texto explicativo + copia-e-cola **cru** (sem markdown, fácil de copiar). A versão cartão (`formatLinkSinalMessage`) fica intocada pro fallback.

**Files:**
- Modify: `functions/api/agent/_lib/format-link-sinal-msg.js`
- Modify: `tests/agent/_lib/format-link-sinal-msg.test.mjs`

- [ ] **Step 1: Write the failing test** (adicionar ao arquivo existente)

```javascript
import { formatLinkSinalMessage, formatPixSinalMessage } from '../../../functions/api/agent/_lib/format-link-sinal-msg.js';

test('formatPixSinalMessage: copia-e-cola em balão próprio, sem markdown, 2 balões', () => {
  const out = formatPixSinalMessage({
    agent_text: '',
    sinal_pct: 30,
    valor_sinal: 210,
    copia_e_cola: '00020126XXXBR.GOV.BCB.PIX',
    hold_horas: 48,
  });
  const baloes = out.split(/\n\s*\n/);
  assert.equal(baloes.length, 2);                       // texto + código
  assert.equal(baloes[1], '00020126XXXBR.GOV.BCB.PIX'); // balão do código, cru
  assert.match(baloes[0], /R\$ 210,00/);
  assert.doesNotMatch(out, /[*_`]/);                    // sem markdown
});

test('formatPixSinalMessage: com agent_text vira 3 balões (prefixo natural do bot)', () => {
  const out = formatPixSinalMessage({
    agent_text: 'Show, reservei teu horario!',
    sinal_pct: 30, valor_sinal: 210, copia_e_cola: 'PIX-CODE', hold_horas: 48,
  });
  const baloes = out.split(/\n\s*\n/);
  assert.equal(baloes.length, 3);
  assert.equal(baloes[0], 'Show, reservei teu horario!');
  assert.equal(baloes[2], 'PIX-CODE');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agent/_lib/format-link-sinal-msg.test.mjs`
Expected: FAIL — `formatPixSinalMessage is not a function`.

- [ ] **Step 3: Implement** (adicionar ao `format-link-sinal-msg.js`, mantendo o `formatLinkSinalMessage` e `formatBRL` existentes)

```javascript
// Variante Pix — copia-e-cola em balão próprio. O pipeline (whatsapp-pipeline.js)
// quebra a resposta_cliente em balões por \n\n; aqui o código fica isolado no
// último balão pra o cliente copiar com um toque. PROIBIDO markdown — WhatsApp
// não renderiza e poluiria o copia-e-cola.
export function formatPixSinalMessage({ agent_text, sinal_pct, valor_sinal, copia_e_cola, hold_horas }) {
  const explicacao =
    `Pra garantir teu horario a gente pede um sinal de ${sinal_pct}%, que fica em R$ ${formatBRL(valor_sinal)}. ` +
    `E so copiar o codigo Pix abaixo e pagar no app do teu banco — assim que cair, teu horario ta confirmado. ` +
    `(O codigo vale ${hold_horas}h.)`;
  const prefix = agent_text && agent_text.trim() ? `${agent_text.trim()}\n\n` : '';
  return `${prefix}${explicacao}\n\n${copia_e_cola}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/agent/_lib/format-link-sinal-msg.test.mjs`
Expected: PASS (testes antigos do cartão + 2 novos).

- [ ] **Step 5: Commit**

```bash
git add functions/api/agent/_lib/format-link-sinal-msg.js tests/agent/_lib/format-link-sinal-msg.test.mjs
git commit -m "feat(sinal): formatPixSinalMessage com copia-e-cola em balão próprio"
```

---

## Task 4: Orquestrador `reservar_horario` — entregar Pix no fluxo principal

No `executeOrchestration`, o caso `reservar_horario` passa a pedir Pix e escolher o formatter conforme o `metodo_usado` que a tool devolver. O QR **não** é enviado proativamente (só copia-e-cola — decisão #3); o QR sob demanda é Plano 2.

**Files:**
- Modify: `functions/api/agent/route.js` (import + caso `reservar_horario`, linhas 24, 435-450)
- Modify: `tests/agent/route-orchestrator.test.mjs`

- [ ] **Step 1: Write the failing test** (adicionar ao arquivo existente)

```javascript
test('executeOrchestration reservar_horario: Pix → resposta com copia-e-cola em balão', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async (url, init) => {
    if (url.includes('reservar-horario')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, agendamento_id: 'ag-1' }) };
    }
    if (url.includes('gerar-link-sinal')) {
      const body = JSON.parse(init.body);
      assert.equal(body.metodo, 'pix'); // orquestrador pede Pix
      return { ok: true, status: 200, json: async () => ({
        ok: true, metodo_usado: 'pix', copia_e_cola: 'PIX-COPIA-COLA', hold_horas: 48,
      }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  const sideEffects = [];
  const r = await executeOrchestration(
    { resposta_cliente: 'Bora!', proxima_acao: 'reservar_horario', slot_inicio: '2026-05-23T13:00:00Z', slot_fim: '2026-05-23T16:00:00Z' },
    { env: baseEnv, tenant: baseTenant, conversa: baseConversa, telefone: '5511', sideEffects, clientContext: {} }
  );

  assert.match(r.resposta_cliente, /PIX-COPIA-COLA/);
  const baloes = r.resposta_cliente.split(/\n\s*\n/);
  assert.equal(baloes[baloes.length - 1], 'PIX-COPIA-COLA'); // código no último balão
  assert.equal(sideEffects.find(s => s.tool === 'gerar-link-sinal').metodo, 'pix');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agent/route-orchestrator.test.mjs`
Expected: FAIL — `body.metodo` undefined (orquestrador ainda não passa `metodo`) e resposta usa o formatter de cartão.

- [ ] **Step 3: Implement**

Em `functions/api/agent/route.js`, adicionar ao import de format (linha 24):
```javascript
import { formatLinkSinalMessage, formatPixSinalMessage } from './_lib/format-link-sinal-msg.js';
```

Substituir o trecho da chamada `gerar-link-sinal` até o `return` (linhas 435-450) por:
```javascript
      const lk = await callTool(env, 'gerar-link-sinal', {
        tenant_id: tenant.id,
        agendamento_id,
        valor_sinal,
        metodo: 'pix', // Pix é o padrão; a tool cai pro cartão se ENABLE_PIX_SINAL=false
      });
      sideEffects.push({ tool: 'gerar-link-sinal', ok: lk.ok, metodo: lk.metodo_usado });
      if (!lk.ok) {
        return forcePergunta(out, 'Tive um problema gerando o link — me da um minuto?');
      }
      const resposta_cliente = lk.metodo_usado === 'pix'
        ? formatPixSinalMessage({
            agent_text: out.resposta_cliente,
            sinal_pct, valor_sinal,
            copia_e_cola: lk.copia_e_cola,
            hold_horas: lk.hold_horas ?? 48,
          })
        : formatLinkSinalMessage({
            agent_text: out.resposta_cliente,
            sinal_pct, valor_sinal,
            link_pagamento: lk.link_pagamento,
            hold_horas: lk.hold_horas ?? 24,
          });
      return { ...out, resposta_cliente };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/agent/route-orchestrator.test.mjs tests/agent/route-runagent-proposta.test.mjs`
Expected: PASS — o novo teste + os existentes. **Atenção TC-P09** (`route-runagent-proposta.test.mjs`): o mock de `gerar-link-sinal` lá retorna `{ ok: true, link_pagamento: 'https://pay', hold_horas: 24 }` (sem `metodo_usado`). Como `metodo_usado !== 'pix'`, cai no formatter de cartão e o teste (que só checa que `gerar-link-sinal` foi chamada 1x) continua passando. Confirmar verde; se o TC-P09 passar a asseverar texto, ajustar o mock pra incluir `metodo_usado: 'pix', copia_e_cola: 'https://pay'`.

- [ ] **Step 5: Commit**

```bash
git add functions/api/agent/route.js tests/agent/route-orchestrator.test.mjs
git commit -m "feat(sinal): orquestrador entrega Pix (copia-e-cola) no reservar_horario"
```

---

## Task 5: `mp-sinal-handler` — loop pós-pagamento (cliente + tatuador, fail-open)

Após promover `tentative → confirmed` (e **depois** do guard `already-processed`, que já dá early-return na linha 70 → webhook duplicado não re-notifica), notifica o cliente no WhatsApp e o tatuador no Telegram. Fail-open: qualquer falha só loga. Extrai a notificação numa função exportada `notifyPosPagamento(env, ag)` pra testar isolada e manter o handler legível. Gancho comentado pro Google Calendar (Fase 2).

**Files:**
- Modify: `functions/_lib/mp-sinal-handler.js`
- Modify: `tests/_lib/mp-sinal-handler.test.mjs` (atualizar L8/L9 + novos testes do loop)

- [ ] **Step 1: Write the failing tests** (adicionar ao arquivo existente; usa os helpers `mockEnv`/`withMockFetch`/`fetchMatcher`/`jsonResponse` já presentes)

```javascript
// L14 — notifyPosPagamento: dispara evoSend (cliente) + sendTelegramTo (tatuador)
test('mp-sinal-handler — L14: notifyPosPagamento dispara WhatsApp + Telegram', async () => {
  const env = mockEnv({ EVO_BASE_URL: 'https://evo.test', INKFLOW_TELEGRAM_BOT_TOKEN: 'tg-tok' });
  const handler = fetchMatcher({
    '/rest/v1/tenants': () => jsonResponse([{
      evo_apikey: 'k', evo_instance: 'inst', tatuador_telegram_chat_id: '999', nome_estudio: 'Estudio X',
    }]),
    'evo.test/message/sendText': () => jsonResponse({ ok: true }),
    'api.telegram.org': () => jsonResponse({ ok: true }),
  });
  await withMockFetch(handler, async () => {
    const { notifyPosPagamento } = await import('../../functions/_lib/mp-sinal-handler.js');
    await notifyPosPagamento(env, {
      tenant_id: VALID_TENANT_UUID, cliente_telefone: '5511999', cliente_nome: 'Ana',
      inicio: '2026-05-23T13:00:00Z', sinal_valor: 210,
    });
    const urls = handler.calls.map(c => c.url);
    assert.ok(urls.some(u => u.includes('/rest/v1/tenants')), 'buscou tenant');
    assert.ok(urls.some(u => u.includes('evo.test/message/sendText')), 'enviou WhatsApp ao cliente');
    assert.ok(urls.some(u => u.includes('api.telegram.org')), 'enviou Telegram ao tatuador');
  });
});

// L15 — notifyPosPagamento é fail-open: Evolution falha não lança
test('mp-sinal-handler — L15: notifyPosPagamento fail-open quando Evolution falha', async () => {
  const env = mockEnv({ EVO_BASE_URL: 'https://evo.test', INKFLOW_TELEGRAM_BOT_TOKEN: 'tg-tok' });
  const handler = fetchMatcher({
    '/rest/v1/tenants': () => jsonResponse([{ evo_apikey: 'k', evo_instance: 'inst', tatuador_telegram_chat_id: '999', nome_estudio: 'X' }]),
    'evo.test/message/sendText': () => jsonResponse({ error: 'down' }, 500),
    'api.telegram.org': () => jsonResponse({ ok: true }),
  });
  await withMockFetch(handler, async () => {
    const { notifyPosPagamento } = await import('../../functions/_lib/mp-sinal-handler.js');
    // Não deve lançar
    await notifyPosPagamento(env, { tenant_id: VALID_TENANT_UUID, cliente_telefone: '5511999', cliente_nome: 'Ana', inicio: '2026-05-23T13:00:00Z', sinal_valor: 210 });
    assert.ok(true);
  });
});
```

E **atualizar L8** (happy path) — agora o fluxo tem 3 calls a mais (GET tenant + sendText + telegram). Substituir o `fetchMatcher` e os asserts de contagem de L8 por:
```javascript
  const handler = fetchMatcher({
    '/v1/payments/': () => jsonResponse({ external_reference: `sinal:${VALID_AGENDAMENTO_UUID}`, status: 'approved' }),
    '/rest/v1/agendamentos': () => jsonResponse([{
      id: VALID_AGENDAMENTO_UUID, cliente_telefone: '5511999', cliente_nome: 'Ana',
      tenant_id: VALID_TENANT_UUID, inicio: '2026-05-23T13:00:00Z', sinal_valor: 210,
    }]),
    '/rest/v1/conversas?tenant_id=': () => jsonResponse([{ id: VALID_CONVERSA_UUID }]),
    '/rest/v1/conversas?id=': ({ method }) =>
      method === 'GET' ? jsonResponse([{ dados_coletados: {}, estado_agente: 'aberto' }])
                       : jsonResponse([{ id: VALID_CONVERSA_UUID, estado_agente: 'fechado' }]),
    '/rest/v1/tenants': () => jsonResponse([{ evo_apikey: 'k', evo_instance: 'inst', tatuador_telegram_chat_id: '999', nome_estudio: 'Estudio X' }]),
    'message/sendText': () => jsonResponse({ ok: true }),
    'api.telegram.org': () => jsonResponse({ ok: true }),
  });
```
e a contagem: `assert.equal(handler.calls.length, 8);` (5 do fluxo original + GET tenant + sendText + telegram). Manter os asserts de ordem 0–4 do original; adicionar:
```javascript
    assert.ok(handler.calls[5].url.includes('/rest/v1/tenants'), 'call 5: GET tenant (loop)');
    assert.ok(handler.calls.some(c => c.url.includes('message/sendText')), 'enviou WhatsApp');
    assert.ok(handler.calls.some(c => c.url.includes('api.telegram.org')), 'enviou Telegram');
```

E **atualizar L9** (sem cliente_telefone) — adicionar pattern de tenant **sem** `tatuador_telegram_chat_id` (sem telefone do cliente E sem chat do tatuador → o loop busca o tenant e não envia nada): trocar o mock pra incluir `'/rest/v1/tenants': () => jsonResponse([{ nome_estudio: 'X' }])` e ajustar `assert.equal(handler.calls.length, 3);` (MP, PATCH agendamento, GET tenant).

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/_lib/mp-sinal-handler.test.mjs`
Expected: FAIL — `notifyPosPagamento is not a function` (L14/L15) e L8 falhando na contagem antiga (5≠8).

- [ ] **Step 3: Implement**

Em `functions/_lib/mp-sinal-handler.js`, adicionar a função exportada (antes de `isSinalCandidateEvent`):
```javascript
// Loop pós-pagamento (Fase 1). Notifica cliente (WhatsApp) + tatuador (Telegram)
// após o sinal cair. Fail-open total: nenhuma falha aqui invalida o sinal.
// Idempotência: o caller (processMpSinal) só chama isto após o guard
// already-processed, então webhook duplicado NÃO re-notifica.
export async function notifyPosPagamento(env, ag) {
  try {
    const tRes = await supaFetch(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(ag.tenant_id)}&select=evo_apikey,evo_instance,tatuador_telegram_chat_id,nome_estudio`);
    const tenant = tRes.ok ? (await tRes.json())[0] : null;
    if (!tenant) return;
    const quando = ag.inicio
      ? new Date(ag.inicio).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : 'seu horario';

    if (ag.cliente_telefone) {
      const { evoSend } = await import('./evolution-send.js');
      const r = await evoSend(env, tenant, {
        type: 'text', to: ag.cliente_telefone,
        text: `Recebemos teu sinal! ✅ Teu horario ta confirmado pra ${quando}. Qualquer coisa e so chamar aqui. Ate la!`,
      });
      if (!r.ok) console.warn('mp-sinal-handler: evoSend cliente falhou (fail-open):', r.error || r.skipped);
    }

    if (tenant.tatuador_telegram_chat_id) {
      const { sendTelegramTo } = await import('./telegram.js');
      const valorTxt = ag.sinal_valor != null ? `R$ ${Number(ag.sinal_valor).toFixed(2).replace('.', ',')}` : '';
      const r = await sendTelegramTo(env, tenant.tatuador_telegram_chat_id,
        `💰 Sinal pago! ${ag.cliente_nome || 'Cliente'} confirmou o horario de ${quando}. Sinal ${valorTxt}.`);
      if (!r.ok) console.warn('mp-sinal-handler: sendTelegramTo tatuador falhou (fail-open):', r.error || r.skipped);
    }

    // [Fase 2 — gancho] Criar evento no Google Calendar entraria aqui
    // (agendamentos.gcal_event_id + tenants.google_calendar_id), após OAuth
    // Google por tenant. Reusa a infra de conexões OAuth do MP Connect.
  } catch (e) {
    console.warn('mp-sinal-handler: notifyPosPagamento falhou (fail-open):', e?.message);
  }
}
```

E chamar dentro de `processMpSinal`, logo após `const ag = updated[0];` (linha 72), antes do bloco `if (ag.cliente_telefone && ag.tenant_id)`:
```javascript
  const ag = updated[0];

  // Loop pós-pagamento (notificações fail-open). Após o guard already-processed.
  await notifyPosPagamento(env, ag);
```

> Ordem: `notifyPosPagamento` roda antes do bloco de lifecycle (`markConversaFechada`). Os dois são independentes e fail-open; rodar a notificação primeiro garante que o cliente é avisado mesmo se o lifecycle falhar. Isso casa com a ordem de calls assertada em L8 (tenant/sendText/telegram após o PATCH agendamento — ver Step 1; se a ordem real divergir, ajustar os índices dos asserts, não o código).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/_lib/mp-sinal-handler.test.mjs`
Expected: PASS — L1–L13 (com L8/L9 atualizados) + L14/L15.

> Se a ordem das calls em L8 não bater (notifyPosPagamento roda antes do bloco de conversa, então as calls de tenant/sendText/telegram vêm **antes** das de conversa), reordene os asserts de índice em L8 pra refletir a ordem real observada no output do teste. O código fica; o teste descreve a verdade.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/mp-sinal-handler.js tests/_lib/mp-sinal-handler.test.mjs
git commit -m "feat(sinal): loop pós-pagamento (WhatsApp cliente + Telegram tatuador), fail-open"
```

---

## Task 6: Smoke real ponta-a-ponta (pago de verdade) + rollout da flag

Valida o **encanamento técnico** com um pagamento Pix real de valor baixíssimo. ⚠️ Enquanto o MP Connect não existir, o sinal cai **na conta do InkFlow** (token global) — centavos do Leandro, só pra validar o fluxo. Cobrança de cliente real só após o Plano MP Connect.

**Files:** nenhum (verificação manual + config de ambiente). Pré-requisito: webhook público — rodar contra **prod ou preview deployado** (o `notification_url` precisa ser alcançável; localhost não recebe webhook do MP).

- [ ] **Step 1: Rodar a suíte completa de testes antes do deploy**

Run: `npm test`
Expected: PASS — toda a suíte verde (sem regressão nas tools, agent, handler).

- [ ] **Step 2: Garantir `ENABLE_PIX_SINAL` no ambiente**

Confirmar a env var no Cloudflare Pages (Settings → Environment variables) para Production **e** Preview: `ENABLE_PIX_SINAL=true`. (Flag de comportamento, não-secreta — pode ir direto no painel, não precisa do fluxo Vault→sync-secrets que é só pra secrets.) Confirmar também que `MP_ACCESS_TOKEN` (global), `MP_WEBHOOK_SECRET`, `INKFLOW_TELEGRAM_BOT_TOKEN`, `SITE_URL` e as creds Evolution do tenant de teste existem.

- [ ] **Step 3: Deploy do branch (preview)**

Seguir o runbook de deploy do projeto ([[InkFlow — Como publicar]] / `docs/canonical/runbooks/deploy.md`). Confirmar que `/api/webhooks/mp-sinal` responde no host deployado.

- [ ] **Step 4: Conversa real no tenant de teste**

No tenant de teste `db686ef2`: conversa do zero → aceitar valor → escolher horário → o bot deve entregar **copia-e-cola em balão próprio** no WhatsApp (sem link de checkout web). Confirmar: copia-e-cola presente, sem markdown, sem URL de checkout.

- [ ] **Step 5: Pagar de verdade (valor baixíssimo)**

Colar o copia-e-cola no app do banco e pagar (confirmar antes o valor mínimo aceito pelo MP — centavos; o sinal real é % do valor proposto). Aguardar o webhook.

- [ ] **Step 6: Verificar o loop fechado**

- WhatsApp do cliente recebeu a confirmação ("Recebemos teu sinal! ✅ ...").
- Telegram do tatuador recebeu o aviso ("💰 Sinal pago! ...").
- No banco (`agendamentos`): `status = 'confirmed'`, `sinal_pago_em` preenchido, `mp_payment_id` preenchido.
- No banco (`conversas`): `estado = 'confirmado'`.

- [ ] **Step 7: Verificar idempotência (webhook duplicado não re-notifica)**

Reenviar o mesmo webhook (ou aguardar reenvio natural do MP). Confirmar nos logs que o segundo cai em `already-processed` e que **nenhuma** notificação extra foi enviada ao cliente/tatuador.

- [ ] **Step 8: Documentar o resultado do smoke**

Anotar no Painel do vault (memória `feedback_atualizar_painel_e_mapa_geral_sempre`): resultado do smoke, `mp_payment_id` de teste, e o reembolso dos centavos se aplicável. Registrar o rollback conhecido: `ENABLE_PIX_SINAL=false` volta pro checkout/Preference sem revert de código.

---

## Self-Review (executado contra o spec)

**Cobertura do spec (Fase 1):**
- Item 1 (geração Pix por padrão, copia-e-cola) → Tasks 2, 3, 4. ✅
- Item 2 (QR sob demanda) → **Plano 2** (declarado fora de escopo). ✅
- Item 3 (fallback cartão mediante objeção) → **Plano 2**. ✅
- Item 4 (confirmação ao cliente) → Task 5. ✅
- Item 5 (aviso ao tatuador) → Task 5. ✅
- Item 6 (`getMpAccessToken`) → Task 1. ✅
- Decisão #1 (`/v1/payments` direto) → Task 2. ✅
- Decisão #2 (Pix substitui checkout; cartão nunca proativo) → Task 2/4 (Pix default); "nunca proativo" é Plano 2. ✅
- Decisão #5 (`payer.email` derivado do telefone) → Task 2 (testado). ✅
- Decisão #6 (expiração alinhada ao hold 48h) → Task 2 (`HOLD_MIN`/`date_of_expiration`). ✅
- Decisão #7 (flag `ENABLE_PIX_SINAL`) → Task 2 + Task 6. ✅
- Decisão #8 (estender a tool, não criar nova) → Task 2 (param `metodo`). ✅
- Idempotência do handler + não-re-notificar → Task 5 (loop após guard) + Task 6 Step 7. ✅
- "Migration nova: provavelmente nenhuma" → **confirmado nenhuma** (colunas já existem; ver Tech Stack). ✅
- Smoke com pago real → Task 6. ✅

**Itens do spec deliberadamente adiados pro Plano 2** (acoplados às ações conversacionais em `aguardando_sinal`): `reenviar_pix_sinal`, `oferecer_cartao_sinal` + cancelar Pix (Gap #3), `verificar_pagamento_sinal` (Gap #1 reativo), Gap #2 (não-regressão "nunca cartão proativo"), extensão `consultar-proposta-tatuador`/prefetch com `mp_payment_id`, schema/contract/router das 3 ações novas, prompts (gatilhos). **Fora dos dois planos:** MP Connect (item 7), Calendar (item 8/Fase 2), cron de reconciliação (Gap #1 proativo → backlog).

**Placeholder scan:** nenhum TBD/TODO/"add error handling" genérico — todo passo tem código real e comando com expected output.

**Type/contrato consistency:** `metodo_usado` é o discriminador que a tool devolve e o orquestrador lê (Tasks 2↔4); `copia_e_cola`/`qr_code_base64` nomeados igual em tool→orquestrador→formatter (Tasks 2↔3↔4); `notifyPosPagamento(env, ag)` mesma assinatura em definição e chamada (Task 5). `getMpAccessToken(env, tenant)` mesma assinatura nos 3 lugares (Task 1).

---

## Próximo passo

Após este plano estar **100% pronto + smoke real verde** (filosofia "deixar totalmente pronto antes de avançar"), escrever o **Plano 2 — Ações conversacionais em `aguardando_sinal`** (QR sob demanda, fallback cartão, "já paguei") a partir do mesmo spec.
