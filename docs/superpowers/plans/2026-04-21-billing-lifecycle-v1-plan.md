# Billing Lifecycle v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir valores de teste por precificação real (R$197/497/997), implementar free trial de 7 dias sem cartão com expiração automática e emails profissionais via MailerLite, e notificar o fundador via Telegram a cada pagamento autorizado.

**Architecture:** Cloudflare Pages Functions (ES modules) orquestram o lifecycle. Estado persistido no Supabase (`tenants.trial_ate`, `tenants.preco_mensal`). Emails automáticos via MailerLite (grupos + automations configuradas via MCP). Notificação Telegram via HTTP no mp-ipn. Feature flag `ENABLE_TRIAL_V2` permite rollback sem revert.

**Tech Stack:** Cloudflare Pages Functions, Supabase REST API, Mercado Pago Preapproval API, MailerLite API, Telegram Bot API, Node 18+ built-in test runner.

**Referência:** `docs/superpowers/specs/2026-04-21-billing-lifecycle-v1-design.md`

---

## File Map

**Create (novos):**
- `functions/_lib/telegram.js` — Helper `sendTelegramAlert()` fail-open
- `functions/_lib/trial-helpers.js` — `calculateTrialEnd()`, `moveToMailerLiteGroup()`
- `functions/api/cron/expira-trial.js` — Cron diário que expira trials vencidos
- `tests/telegram.test.mjs` — Unit tests pro telegram helper
- `tests/trial-helpers.test.mjs` — Unit tests pros trial helpers

**Modify (existentes):**
- `functions/api/create-subscription.js` — Planos reais + path `'trial'`
- `functions/api/create-tenant.js` — Aceita `plano='trial'`, grava `trial_ate`
- `functions/api/public-start.js` — Aceita `plano='trial'`
- `functions/api/evo-create-instance.js` — `isFreeTrial` aceita trial e teste (transição)
- `functions/api/mp-ipn.js` — Telegram alert + `preco_mensal` + MailerLite move
- `index.html` — Valores reais nos cards + badge "7 dias grátis"
- `termos.html` — Cláusula 8 (reajuste IPCA)
- `admin.html` — Coluna `trial_ate` no grid de listing

**External setup (não-código):**
- Supabase: migration `preco_mensal INTEGER` column
- Cloudflare Pages: env vars `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CRON_SECRET`, `MAILERLITE_GROUP_*` (3)
- MailerLite (via MCP): criar 3 grupos + 4 automations

---

## Task 1: MailerLite — criar grupos e capturar IDs

**Files:** Sem código, usa MailerLite MCP

- [ ] **Step 1: Criar grupo "Trial Ativo" via MCP**

Invocar `mcp__claude_ai_MailerLite__create_group` com:
```json
{ "name": "Trial Ativo", "description": "Estúdios em free trial de 7 dias" }
```
Guardar o `id` retornado.

- [ ] **Step 2: Criar grupo "Trial Expirou"**

Invocar `create_group`:
```json
{ "name": "Trial Expirou", "description": "Trial de 7 dias expirou sem pagamento" }
```
Guardar o `id`.

- [ ] **Step 3: Criar grupo "Clientes Ativos"**

Invocar `create_group`:
```json
{ "name": "Clientes Ativos InkFlow", "description": "Estúdios com assinatura authorized no MP" }
```
Guardar o `id`.

**Nota:** o código hoje hardcoda `184387920768009398` em `mp-ipn.js:121` como grupo "Clientes InkFlow". Se esse grupo já existe, reutilizar seu ID em vez de criar duplicata. Verificar com `list_resources({resource_type: "group", name_filter: "Clientes"})` antes de criar.

- [ ] **Step 4: Documentar IDs nos docs**

Append no final de `docs/superpowers/specs/2026-04-21-billing-lifecycle-v1-design.md`, seção nova:
```markdown
## MailerLite group IDs (captured 2026-04-21)
- Trial Ativo: <ID>
- Trial Expirou: <ID>
- Clientes Ativos: <ID>
```

- [ ] **Step 5: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add docs/superpowers/specs/2026-04-21-billing-lifecycle-v1-design.md
git commit -m "docs(billing): captura IDs dos grupos MailerLite criados via MCP"
```

---

## Task 2: Supabase migration — coluna `preco_mensal`

**Files:** Sem arquivo local; SQL via Supabase MCP.

- [ ] **Step 1: Aplicar migration via MCP**

Invocar `mcp__claude_ai_Supabase__apply_migration`:
```json
{
  "project_id": "bfzuxxuscyplfoimvomh",
  "name": "add_preco_mensal_to_tenants",
  "query": "ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS preco_mensal INTEGER;\nCOMMENT ON COLUMN public.tenants.preco_mensal IS 'Valor mensal contratado em BRL (inteiros em reais, nao centavos). Travado no momento da ativacao da assinatura. Protege grandfathering.';"
}
```

- [ ] **Step 2: Verificar via query**

Invocar `execute_sql`:
```json
{
  "project_id": "bfzuxxuscyplfoimvomh",
  "query": "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='preco_mensal';"
}
```
Expected: retorna 1 linha com `preco_mensal, integer`.

---

## Task 3: Telegram helper — TDD

**Files:**
- Create: `functions/_lib/telegram.js`
- Create: `tests/telegram.test.mjs`

- [ ] **Step 1: Escrever teste pra payload correto (fails)**

Criar `tests/telegram.test.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendTelegramAlert } from '../functions/_lib/telegram.js';

test('sendTelegramAlert posts to Bot API with correct payload', async () => {
  let captured = null;
  globalThis.fetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true };
  };
  const env = { TELEGRAM_BOT_TOKEN: 'abc123', TELEGRAM_CHAT_ID: '999' };
  const res = await sendTelegramAlert(env, '*teste*');

  assert.equal(res.ok, true);
  assert.match(captured.url, /api\.telegram\.org\/botabc123\/sendMessage/);
  const body = JSON.parse(captured.opts.body);
  assert.equal(body.chat_id, '999');
  assert.equal(body.text, '*teste*');
  assert.equal(body.parse_mode, 'Markdown');
});

test('sendTelegramAlert returns skipped when env vars missing', async () => {
  const res = await sendTelegramAlert({}, 'x');
  assert.equal(res.ok, false);
  assert.equal(res.skipped, true);
});

test('sendTelegramAlert fails open on fetch error', async () => {
  globalThis.fetch = async () => { throw new Error('network'); };
  const env = { TELEGRAM_BOT_TOKEN: 'x', TELEGRAM_CHAT_ID: 'y' };
  const res = await sendTelegramAlert(env, 'hi');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'network');
});
```

- [ ] **Step 2: Rodar — deve falhar**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
node --test tests/telegram.test.mjs
```
Expected: falha com "ERR_MODULE_NOT_FOUND" pra telegram.js.

- [ ] **Step 3: Implementar telegram.js**

Criar `functions/_lib/telegram.js`:
```javascript
// ── InkFlow — Telegram alert helper (fail-open) ──────────────────────────────
// Envia mensagem pro bot InkFlow Alerts quando configurado.
// Timeout 3s. Nunca joga exception — retorna {ok:false} se falhar.

export async function sendTelegramAlert(env, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('telegram: env vars ausentes, pulando alert');
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
    console.error('telegram: send failed:', e.message);
    return { ok: false, error: e.message };
  }
}
```

- [ ] **Step 4: Rodar — deve passar**

```bash
node --test tests/telegram.test.mjs
```
Expected: `tests 3 / pass 3 / fail 0`.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/telegram.js tests/telegram.test.mjs
git commit -m "feat(lib): telegram alert helper fail-open com testes"
```

---

## Task 4: Trial helpers — TDD

**Files:**
- Create: `functions/_lib/trial-helpers.js`
- Create: `tests/trial-helpers.test.mjs`

- [ ] **Step 1: Escrever testes**

Criar `tests/trial-helpers.test.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateTrialEnd, moveToMailerLiteGroup } from '../functions/_lib/trial-helpers.js';

test('calculateTrialEnd returns ISO string 7 days in the future', () => {
  const now = new Date('2026-04-21T12:00:00.000Z');
  const end = calculateTrialEnd(now);
  assert.equal(end, '2026-04-28T12:00:00.000Z');
});

test('calculateTrialEnd defaults to current time if no arg', () => {
  const end = calculateTrialEnd();
  const delta = new Date(end).getTime() - Date.now();
  const expected = 7 * 24 * 60 * 60 * 1000;
  assert.ok(Math.abs(delta - expected) < 5000, 'should be ~7 days ahead');
});

test('moveToMailerLiteGroup unassigns from old and assigns to new', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, method: opts?.method || 'GET' });
    return { ok: true, json: async () => ({}) };
  };
  const env = { MAILERLITE_API_KEY: 'k' };
  await moveToMailerLiteGroup(env, 'sub@test.com', { from: 'G1', to: 'G2' });

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /groups\/G1\/subscribers\/sub@test\.com/);
  assert.equal(calls[0].method, 'DELETE');
  assert.match(calls[1].url, /subscribers\/sub@test\.com/);
  assert.equal(calls[1].method, 'POST');
});
```

- [ ] **Step 2: Rodar — deve falhar**

```bash
node --test tests/trial-helpers.test.mjs
```
Expected: ERR_MODULE_NOT_FOUND.

- [ ] **Step 3: Implementar trial-helpers.js**

Criar `functions/_lib/trial-helpers.js`:
```javascript
// ── InkFlow — Trial lifecycle helpers ────────────────────────────────────────

const ML_BASE = 'https://connect.mailerlite.com/api';

export function calculateTrialEnd(now = new Date()) {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 7);
  return end.toISOString();
}

// Move um subscriber entre grupos MailerLite.
// opts.from = group ID de origem (remove); opts.to = group ID de destino (add)
export async function moveToMailerLiteGroup(env, emailOrId, { from, to }) {
  const key = env.MAILERLITE_API_KEY;
  if (!key) {
    console.warn('moveToMailerLiteGroup: MAILERLITE_API_KEY ausente');
    return { ok: false, skipped: true };
  }
  const headers = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  try {
    if (from) {
      await fetch(`${ML_BASE}/groups/${from}/subscribers/${encodeURIComponent(emailOrId)}`, {
        method: 'DELETE',
        headers,
      });
    }
    if (to) {
      await fetch(`${ML_BASE}/subscribers/${encodeURIComponent(emailOrId)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ groups: [to] }),
      });
    }
    return { ok: true };
  } catch (e) {
    console.error('moveToMailerLiteGroup failed:', e.message);
    return { ok: false, error: e.message };
  }
}
```

- [ ] **Step 4: Rodar — deve passar**

```bash
node --test tests/trial-helpers.test.mjs
```
Expected: `tests 3 / pass 3 / fail 0`.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/trial-helpers.js tests/trial-helpers.test.mjs
git commit -m "feat(lib): trial helpers (calculateTrialEnd + MailerLite group move)"
```

---

## Task 5: create-subscription.js — planos reais + path trial

**Files:**
- Modify: `functions/api/create-subscription.js:18-23` (PLANOS), e bloco `if (plano === 'free')`

- [ ] **Step 1: Ler o arquivo atual**

```bash
cat functions/api/create-subscription.js | sed -n '18,25p'
```
Confirma que está com valores a R$1.

- [ ] **Step 2: Trocar PLANOS pros valores reais**

Editar `functions/api/create-subscription.js` linhas 18-23, substituir o bloco:

```diff
-const PLANOS = {
-  teste:      { nome: 'InkFlow Teste',       valor:   1.00 },  // TEMPORÁRIO: remover após teste
-  individual: { nome: 'InkFlow Individual',  valor:   1.00 },  // TEMP TESTE: original 197
-  estudio:    { nome: 'InkFlow Estúdio',     valor:   1.00 },  // TEMP TESTE: original 497
-  premium:    { nome: 'InkFlow Estúdio VIP', valor:   1.00 },  // TEMP TESTE: original 997
-};
+const PLANOS = {
+  individual: { nome: 'InkFlow Individual',  valor: 197.00 },
+  estudio:    { nome: 'InkFlow Estúdio',     valor: 497.00 },
+  premium:    { nome: 'InkFlow Estúdio VIP', valor: 997.00 },
+};
+
+// Valor em BRL inteiros gravado em tenants.preco_mensal pra grandfathering.
+export const PLANO_PRECO_BRL = { individual: 197, estudio: 497, premium: 997 };
```

- [ ] **Step 3: Trocar `plano === 'free'` por `'trial'` com side-effects**

Localizar bloco ~linha 168-171:
```diff
-  // ── Plano free — sem cobrança ─────────────────────────────────────────────
-  if (plano === 'free') {
-    return json({ trial: true });
-  }
+  // ── Plano trial — 7 dias sem cobranca ───────────────────────────────────
+  if (plano === 'trial') {
+    const { calculateTrialEnd } = await import('../_lib/trial-helpers.js');
+    const trial_ate = calculateTrialEnd();
+    await updateTenant(env, tenant_id, {
+      plano: 'trial',
+      status_pagamento: 'trial',
+      ativo: true,
+      trial_ate,
+    });
+    // Adiciona ao grupo MailerLite "Trial Ativo" (dispara automations)
+    if (email && env.MAILERLITE_API_KEY && env.MAILERLITE_GROUP_TRIAL_ATIVO) {
+      await addToMailerLite(env, email, 'trial', tenant_id, env.MAILERLITE_GROUP_TRIAL_ATIVO);
+    }
+    return json({ trial: true, trial_ate });
+  }
```

- [ ] **Step 4: Ajustar `addToMailerLite` pra aceitar group_id custom**

Localizar função `addToMailerLite` ~linha 33. Adicionar 5º param `groupOverride`:
```diff
-async function addToMailerLite(env, email, plano, tenantId) {
+async function addToMailerLite(env, email, plano, tenantId, groupOverride = null) {
   const ML_KEY   = env.MAILERLITE_API_KEY;
-  const ML_GROUP = env.MAILERLITE_GROUP_ID;
+  const ML_GROUP = groupOverride || env.MAILERLITE_GROUP_ID;
   if (!ML_KEY || !ML_GROUP || !email) return;
```

- [ ] **Step 5: Smoke test com curl**

Subir local:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
npx wrangler pages dev . --port 8788 &
sleep 3
```

Testar trial path (valor fake não deve chamar MP):
```bash
curl -s http://localhost:8788/api/create-subscription \
  -X POST -H "Content-Type: application/json" \
  -d '{"tenant_id":"00000000-0000-0000-0000-000000000000","plano":"trial","email":"fake@test.com"}' \
  | python3 -m json.tool
```
Expected: `{"trial": true, "trial_ate": "2026-04-28T..."}`.

Parar wrangler:
```bash
pkill -f wrangler
```

- [ ] **Step 6: Commit**

```bash
git add functions/api/create-subscription.js
git commit -m "feat(billing): planos reais (197/497/997) + path trial sem cobranca"
```

---

## Task 6: create-tenant + public-start + evo-create-instance — aceitar 'trial'

**Files:**
- Modify: `functions/api/create-tenant.js:75`
- Modify: `functions/api/public-start.js:3`
- Modify: `functions/api/evo-create-instance.js:71`

- [ ] **Step 1: create-tenant.js — aceitar 'trial' no allowlist**

Localizar linha 75, substituir:
```diff
-  if (!plano || !['teste', 'individual', 'estudio', 'premium'].includes(plano)) {
+  if (!plano || !['trial', 'teste', 'individual', 'estudio', 'premium'].includes(plano)) {
```

- [ ] **Step 2: public-start.js — aceitar 'trial'**

Localizar linha 3 (comentário do header):
```diff
-// Body: { plano: "individual"|"estudio"|"premium"|"teste" }
+// Body: { plano: "individual"|"estudio"|"premium"|"trial"|"teste" }
```

Procurar valida\u00e7\u00e3o de `plano` no corpo do arquivo. Se tiver array tipo `['teste', 'individual', 'estudio', 'premium']`, adicionar `'trial'` no array.

```bash
grep -n "teste" functions/api/public-start.js
```
Edite as linhas identificadas pra incluir `'trial'` no mesmo nível.

- [ ] **Step 3: evo-create-instance.js — isFreeTrial aceita ambos**

Localizar linha 71:
```diff
-          const isFreeTrial = t.plano === 'teste';
+          const isFreeTrial = t.plano === 'trial' || t.plano === 'teste';
```

- [ ] **Step 4: Commit**

```bash
git add functions/api/create-tenant.js functions/api/public-start.js functions/api/evo-create-instance.js
git commit -m "feat(billing): aceitar plano 'trial' nos endpoints de signup"
```

---

## Task 7: mp-ipn.js — Telegram alert + preco_mensal + MailerLite move

**Files:**
- Modify: `functions/api/mp-ipn.js` (dentro do bloco `if (ativo)` ~linha 224-226)

- [ ] **Step 1: Ler contexto atual**

```bash
sed -n '220,235p' functions/api/mp-ipn.js
```
Confirma estrutura do PATCH + addSubscriberToMailerLite.

- [ ] **Step 2: Adicionar imports no topo do arquivo**

Editar linha ~10 (após o import existente):
```diff
 import { processMpSinal, isSinalCandidateEvent } from '../_lib/mp-sinal-handler.js';
+import { sendTelegramAlert } from '../_lib/telegram.js';
+import { moveToMailerLiteGroup } from '../_lib/trial-helpers.js';
+import { PLANO_PRECO_BRL } from './create-subscription.js';
```

- [ ] **Step 3: Modificar bloco `if (ativo)` pra gravar preco_mensal + Telegram**

Localizar o PATCH de tenant (~linha 217):
```diff
-    await fetch(SUPABASE_URL + '/rest/v1/tenants?id=eq.' + encodeURIComponent(tenantId), {
-      method:  'PATCH',
-      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
-      body: JSON.stringify({ ativo, status_pagamento: statusPagamento, mp_subscription_id: id }),
-    });
+    // Busca plano atual do tenant pra determinar preco_mensal
+    const tRes = await fetch(
+      SUPABASE_URL + '/rest/v1/tenants?id=eq.' + encodeURIComponent(tenantId) + '&select=plano,nome_estudio,email',
+      { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } }
+    );
+    const tRows = tRes.ok ? await tRes.json() : [];
+    const tenantSnapshot = tRows[0] || {};
+    const patchBody = { ativo, status_pagamento: statusPagamento, mp_subscription_id: id };
+    if (ativo && tenantSnapshot.plano && PLANO_PRECO_BRL[tenantSnapshot.plano]) {
+      patchBody.preco_mensal = PLANO_PRECO_BRL[tenantSnapshot.plano];
+      patchBody.trial_ate = null;
+    }
+    await fetch(SUPABASE_URL + '/rest/v1/tenants?id=eq.' + encodeURIComponent(tenantId), {
+      method:  'PATCH',
+      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
+      body: JSON.stringify(patchBody),
+    });
```

- [ ] **Step 4: Substituir addSubscriberToMailerLite por moveToMailerLiteGroup + Telegram**

Localizar (~linha 223-226):
```diff
     // Boas-vindas: adiciona subscriber ao MailerLite quando pagamento é autorizado
     if (ativo) {
-      await addSubscriberToMailerLite(env, tenantId, SUPABASE_KEY);
+      // Move de "Trial Expirou" (se veio de lá) pra "Clientes Ativos"
+      const email = tenantSnapshot.email || sub.payer_email;
+      if (email) {
+        await moveToMailerLiteGroup(env, email, {
+          from: env.MAILERLITE_GROUP_TRIAL_EXPIROU || null,
+          to: env.MAILERLITE_GROUP_CLIENTES_ATIVOS || env.MAILERLITE_GROUP_ID,
+        });
+      }
+      // Notificação Telegram (fail-open)
+      const preco = PLANO_PRECO_BRL[tenantSnapshot.plano] ?? '?';
+      const alertMsg = [
+        '🟢 *Novo pagamento InkFlow*',
+        '━━━━━━━━━━━━━━━',
+        `Estúdio: ${tenantSnapshot.nome_estudio || '?'}`,
+        `Plano: ${tenantSnapshot.plano || '?'} (R$ ${preco})`,
+        `Email: ${email || '?'}`,
+        `Sub ID: \`${id}\``,
+      ].join('\n');
+      await sendTelegramAlert(env, alertMsg);
     }
```

- [ ] **Step 5: Smoke test simulando IPN**

Com wrangler dev rodando + env vars locais configuradas, simular payload IPN:
```bash
curl -s -X POST "http://localhost:8788/api/mp-ipn?type=preapproval&data.id=fake-sub-123" \
  -H "Content-Type: application/json" \
  -d '{"type":"preapproval","data":{"id":"fake-sub-123"}}'
```
Expected: erro 401 ou 500 se HMAC estiver configurado, mas Telegram não deve receber (MP API vai falhar buscando sub). Log mostra tentativa. É teste negativo — só garante que código não quebra.

Teste positivo real vem no Task 12 (smoke test pós-deploy com signup de verdade).

- [ ] **Step 6: Commit**

```bash
git add functions/api/mp-ipn.js
git commit -m "feat(billing): mp-ipn grava preco_mensal, move MailerLite e alerta Telegram"
```

---

## Task 8: Cron `/api/cron/expira-trial.js` — novo endpoint

**Files:**
- Create: `functions/api/cron/expira-trial.js`

- [ ] **Step 1: Criar arquivo**

Criar `functions/api/cron/expira-trial.js`:
```javascript
// ── InkFlow — Cron: expira trials de 7 dias ──────────────────────────────────
// Roda diariamente via UptimeRobot / n8n schedule / wrangler cron trigger.
// Auth: Bearer CRON_SECRET
//
// Lógica:
//   1. SELECT tenants WHERE status_pagamento='trial' AND trial_ate<NOW() AND ativo=true
//   2. Pra cada um: PATCH ativo=false, status_pagamento='trial_expirado'
//   3. Move do grupo MailerLite "Trial Ativo" -> "Trial Expirou"

import { moveToMailerLiteGroup } from '../../_lib/trial-helpers.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: CORS });

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Feature flag — permite desligar em incidente
  if (env.ENABLE_TRIAL_V2 === 'false') {
    return json({ disabled: true, reason: 'ENABLE_TRIAL_V2=false' }, 503);
  }

  // Auth
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!env.CRON_SECRET || token !== env.CRON_SECRET) {
    return json({ error: 'Não autorizado' }, 401);
  }

  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return json({ error: 'Configuração ausente' }, 503);

  const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
  const now = new Date().toISOString();

  try {
    // 1. Buscar trials vencidos
    const qRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?status_pagamento=eq.trial&ativo=eq.true&trial_ate=lt.${encodeURIComponent(now)}&select=id,email,nome_estudio,trial_ate`,
      { headers: sbHeaders }
    );
    if (!qRes.ok) return json({ error: 'Erro ao buscar trials' }, 500);
    const expirados = await qRes.json();

    if (expirados.length === 0) {
      return json({ expired: 0, message: 'Nenhum trial expirado' });
    }

    // 2. PATCH cada um + move MailerLite
    const results = [];
    for (const t of expirados) {
      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(t.id)}`,
        {
          method: 'PATCH',
          headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ ativo: false, status_pagamento: 'trial_expirado' }),
        }
      );

      let mlOk = false;
      if (t.email) {
        const mlRes = await moveToMailerLiteGroup(env, t.email, {
          from: env.MAILERLITE_GROUP_TRIAL_ATIVO,
          to: env.MAILERLITE_GROUP_TRIAL_EXPIROU,
        });
        mlOk = mlRes.ok;
      }

      results.push({
        id: t.id,
        nome_estudio: t.nome_estudio,
        email: t.email,
        db_patched: patchRes.ok,
        mailerlite_moved: mlOk,
      });
    }

    const expiredCount = results.filter(r => r.db_patched).length;
    return json({ expired: expiredCount, total_found: expirados.length, details: results });
  } catch (err) {
    console.error('expira-trial error:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}
```

- [ ] **Step 2: Smoke test local com wrangler dev**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
npx wrangler pages dev . --port 8788 &
sleep 3

# Sem auth — deve ser 401
curl -s -X POST http://localhost:8788/api/cron/expira-trial | python3 -m json.tool
# Expected: {"error": "Não autorizado"}

pkill -f wrangler
```

- [ ] **Step 3: Commit**

```bash
git add functions/api/cron/expira-trial.js
git commit -m "feat(cron): endpoint expira-trial que desativa trials vencidos"
```

---

## Task 9: index.html — valores reais + badge trial + CTA trial

**Files:**
- Modify: `index.html` linhas 442-516 (seção `#planos`)

- [ ] **Step 1: Substituir valores 1 pelos reais**

Editar linha 455: `<span class="price-value">1</span>` → `<span class="price-value">197</span>`

Editar linha 476: `<span class="price-value">1</span>` → `<span class="price-value">497</span>`

Editar linha 496: `<span class="price-value">1</span>` → `<span class="price-value">997</span>`

- [ ] **Step 2: Adicionar badge "7 dias grátis" antes do `price-amount` em cada card**

Em cada um dos 3 cards, antes da div `price-amount`, inserir:
```html
<div class="price-trial-badge" style="display:inline-block;padding:4px 12px;margin-bottom:10px;background:rgba(124,93,250,0.15);color:var(--brand);border-radius:999px;font-size:12px;font-weight:600">7 dias grátis sem cartão</div>
```

- [ ] **Step 3: Adicionar CTA secundário "Começar 7 dias grátis"**

Logo antes de cada `<button class="price-cta btn" onclick="startCheckout('<plano>', this)">Começar agora</button>`, inserir:
```html
<button class="price-cta-secondary btn" onclick="startCheckout('trial', this)" style="background:transparent;color:var(--brand);border:1px solid var(--brand);margin-bottom:8px;width:100%">Começar 7 dias grátis</button>
```

Isso duplica em 3 cards — mesma função, mesmo HTML. OK pra este spec (YAGNI — refactor pra template component só se escala).

- [ ] **Step 4: Smoke test visual local**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
npx wrangler pages dev . --port 8788 &
sleep 3
```

Abrir http://localhost:8788 no navegador. Verificar:
- Os 3 cards mostram R$ 197, 497, 997
- Cada card tem badge roxo "7 dias grátis sem cartão" no topo
- Cada card tem 2 CTAs (trial em cima, "Começar agora" embaixo)

```bash
pkill -f wrangler
```

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(landing): valores reais 197/497/997 + badge trial + CTA trial"
```

---

## Task 10: termos.html — cláusula 8 (reajuste IPCA)

**Files:**
- Modify: `termos.html`

- [ ] **Step 1: Localizar onde inserir a cláusula**

```bash
grep -n "^7\.\|^8\.\|CLÁUSULA\|Clausula\|section" termos.html | head -20
```
Identificar qual é a última seção/cláusula numerada.

- [ ] **Step 2: Inserir nova seção 8 antes da última cláusula (ou no fim, conforme numeração)**

Adicionar bloco:
```html
<section>
  <h2>8. REAJUSTE DE VALORES</h2>

  <p>8.1 As mensalidades poderão ser reajustadas anualmente a partir do décimo terceiro (13º) mês de contrato, com base no IPCA/IBGE acumulado dos últimos 12 meses.</p>

  <p>8.2 O reajuste será comunicado ao CONTRATANTE com antecedência mínima de 30 (trinta) dias, por email cadastrado.</p>

  <p>8.3 O CONTRATANTE poderá rescindir o contrato sem multa nos 30 dias entre a notificação e a data de vigência do novo valor.</p>

  <p>8.4 Clientes que aderiram ao plano durante a fase de lançamento (primeiros 100 estúdios ativos) terão o valor original preservado pelo tempo que mantiverem a assinatura ativa e contínua.</p>
</section>
```

- [ ] **Step 3: Renumerar cláusulas seguintes se necessário**

Se havia cláusulas 8, 9, 10 antes, renumera pra 9, 10, 11.

- [ ] **Step 4: Commit**

```bash
git add termos.html
git commit -m "docs(legal): clausula 8 de reajuste IPCA + grandfathering first-100"
```

---

## Task 11: admin.html — coluna trial_ate no grid

**Files:**
- Modify: `admin.html:640` (grid de listing)

- [ ] **Step 1: Ler contexto atual**

```bash
sed -n '635,650p' admin.html
```
Já aparece `Trial até` no listing (linha 640) — verificar se é o grid de cards ou a tabela. Se já está lá, tarefa completa — só valida.

- [ ] **Step 2: Se não aparece no grid principal, adicionar coluna**

(Depende do formato atual do grid.) Adicionar span similar ao existente com `t.trial_ate ? new Date(t.trial_ate).toLocaleDateString('pt-BR') : '-'`.

- [ ] **Step 3: Commit (se houve mudança)**

```bash
git add admin.html
git commit -m "feat(admin): visibilidade do trial_ate no listing de tenants"
```

---

## Task 12: MailerLite automations — configurar via MCP

**Files:** Sem código. Usa MailerLite MCP.

- [ ] **Step 1: Gerar copy dos 4 emails via MCP**

Invocar `mcp__claude_ai_MailerLite__generate_email_content` + `suggest_subject_lines` pra cada um dos 4 templates:

1. **Warm-up dia 2** — "Como tá indo o teste?"
2. **Warning dia 5** — "Faltam 2 dias — aproveita pra ver os resultados"
3. **Expiração dia 7** — "Seu trial acabou. O que achou?"
4. **Last-chance dia 14** — "Última chance: 10% off se voltar essa semana"

Cada um gera subject + body. Revisar e ajustar tom pro público (dono de estúdio de tatuagem, descontraído-profissional).

- [ ] **Step 2: Criar 4 automations via `build_custom_automation`**

Cada automation:
- Trigger: joined group ("Trial Ativo" pros 1 e 2, "Trial Expirou" pros 3 e 4)
- Delay: 2d, 5d, 0d, 7d respectivamente
- Email com subject + body do Step 1

- [ ] **Step 3: Testar com subscriber dummy**

Criar subscriber teste via MCP:
```
mcp__claude_ai_MailerLite__add_subscriber({ email: "test+trial@inkflowbrasil.com", groups: ["<trial_ativo_id>"] })
```

Aguarda alguns minutos, confirma email dia 0 (se houver) ou valida que o subscriber está no grupo certo com automation ativa.

- [ ] **Step 4: Documentar automation IDs**

Append na spec (seção captured IDs):
```
MailerLite automations:
- Warm-up dia 2: <id>
- Warning dia 5: <id>
- Expiração imediata: <id>
- Last-chance dia 7+7: <id>
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-21-billing-lifecycle-v1-design.md
git commit -m "docs(billing): captura IDs das 4 automations MailerLite"
```

---

## Task 13: Cloudflare Pages env vars — configurar

**Files:** Sem código. Dashboard Cloudflare Pages.

- [ ] **Step 1: Adicionar via dashboard (USER ACTION)**

Dashboard Cloudflare Pages → projeto `inkflow-saas` → Settings → Environment variables → Production:

```
TELEGRAM_BOT_TOKEN = 8774271336:AAHNv4A2Kr49FLmnaxoW1pb4pukmPbilJBk
TELEGRAM_CHAT_ID = 8529665470
CRON_SECRET = <gerar UUID via `uuidgen` ou `openssl rand -hex 32`>
MAILERLITE_GROUP_TRIAL_ATIVO = <ID do Task 1 Step 1>
MAILERLITE_GROUP_TRIAL_EXPIROU = <ID do Task 1 Step 2>
MAILERLITE_GROUP_CLIENTES_ATIVOS = <ID do Task 1 Step 3>
ENABLE_TRIAL_V2 = true
```

- [ ] **Step 2: Salvar CRON_SECRET localmente pra usar no trigger externo**

Copiar valor gerado, guardar em password manager. Vai ser usado no Task 14.

---

## Task 14: Configurar trigger externo do cron (UptimeRobot OU n8n)

**Files:** Sem código. Plataforma externa.

**Opção A — UptimeRobot (mais simples):**

- [ ] **Step 1: Criar monitor HTTP(S) Keyword**
  - URL: `https://inkflowbrasil.com/api/cron/expira-trial`
  - Method: POST
  - Custom header: `Authorization: Bearer <CRON_SECRET>`
  - Interval: 24h (requer plano pago ≥ Lite $7/mo) ou 5 min (free, força idempotência)
  - Keyword: `"expired"` ou `"disabled"` (confirma 200 ok ou 503 disabled, ambos esperados)

**Opção B — n8n schedule trigger:**

- [ ] **Step 1: Criar workflow "InkFlow cron — expira trial"**
  - Node: Schedule trigger — 09:00 BRT (12:00 UTC) diário
  - Node: HTTP Request POST `https://inkflowbrasil.com/api/cron/expira-trial`
    - Header: `Authorization: Bearer <CRON_SECRET>`
  - Node: If status != 200 → Telegram alert (reusa infra existente)

Decidir: UptimeRobot se já tem conta; n8n se quer controle granular + alerting.

---

## Task 15: Deploy + smoke test produção

**Files:** Sem mudança. Deploy + validação.

- [ ] **Step 1: Rodar testes locais finais**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
node --test tests/telegram.test.mjs tests/trial-helpers.test.mjs
```
Expected: all pass.

- [ ] **Step 2: Push pra main (Cloudflare Pages auto-deploy)**

```bash
git log --oneline main | head -15
git push origin main
```

- [ ] **Step 3: Aguardar deploy + ver build**

Abrir Cloudflare dashboard → Pages → `inkflow-saas` → Deployments. Aguardar build verde.

- [ ] **Step 4: Smoke test landing**

Abrir https://inkflowbrasil.com no navegador. Validar:
- [ ] Cards mostram 197 / 497 / 997
- [ ] Badge "7 dias grátis" em cada card
- [ ] CTA "Começar 7 dias grátis" funcional

- [ ] **Step 5: Smoke test trial signup**

Cadastrar com email pessoal novo (não o teste anterior) via CTA "Começar 7 dias grátis". Validar:
- [ ] Tenant criado no Supabase com `plano='trial'`, `trial_ate` = signup+7d, `status_pagamento='trial'`, `ativo=true`
- [ ] Subscriber aparece no grupo MailerLite "Trial Ativo"

Via MCP:
```
execute_sql: SELECT id, plano, trial_ate, status_pagamento, ativo FROM tenants WHERE email='seu@email' ORDER BY created_at DESC LIMIT 1
```

- [ ] **Step 6: Smoke test cron (forçar expiração imediata)**

Manipular o `trial_ate` do tenant teste pra ontem:
```
execute_sql: UPDATE tenants SET trial_ate='2026-04-20T00:00:00Z' WHERE email='seu@email'
```

Disparar cron manual:
```bash
curl -s -X POST https://inkflowbrasil.com/api/cron/expira-trial \
  -H "Authorization: Bearer <CRON_SECRET>"
```
Expected: `{"expired": 1, ...}`.

Validar:
- [ ] Tenant agora tem `ativo=false`, `status_pagamento='trial_expirado'`
- [ ] Subscriber movido no MailerLite pra "Trial Expirou"
- [ ] Email de expiração chega na caixa (automation imediata)

- [ ] **Step 7: Smoke test Telegram alert**

Manualmente disparar o bloco `ativo=true` path simulando IPN bem-sucedido:
- Usar tool `mcp__claude_ai_Supabase__execute_sql`: `UPDATE tenants SET status_pagamento='authorized', ativo=true, mp_subscription_id='test-sub-xyz', plano='individual' WHERE email='seu@email'`
- Como o PATCH vem do IPN e não do próprio update manual, Telegram não vai disparar por essa via.
- Alternativa: postar um IPN mock no endpoint (requer HMAC válido) — na prática, testar com pagamento real pequeno (R$ 1 em cartão de teste MP) é o teste end-to-end mais honesto.

Aceitar: real payment test vai acontecer naturalmente no primeiro pagamento — Telegram vai confirmar se funciona. Monitorar primeiras 24h.

- [ ] **Step 8: Commit de encerramento**

```bash
git log --oneline -20
git tag billing-v1-shipped
git push origin billing-v1-shipped
```

---

## Self-Review

### Spec coverage check

| Seção do spec | Task que implementa |
|---|---|
| D1 (preços 197/497/997) | T5 |
| D2 (grandfathering + preco_mensal) | T2 (schema) + T5 (gravação) + T7 (escrita no IPN) |
| D3 (cláusula IPCA) | T10 |
| D4 (trial sem cartão) | T5 (path) + T6 (endpoints aceitam) |
| D5 (MailerLite email) | T1 (grupos) + T12 (automations) |
| D6 (Telegram) | T3 (helper) + T7 (uso no IPN) + T13 (env vars) |
| Cron expira | T8 + T14 |
| Frontend valores | T9 |
| Admin visibility | T11 |
| Testing plan | T3, T4, T15 |
| Rollback feature flag | T8 (cron), T13 (env var) — **gap no create-subscription.js** |

**Gap encontrado:** Feature flag `ENABLE_TRIAL_V2` só está implementada no cron. Pra rollback completo, `create-subscription.js` também deveria checar. **Fix inline:** adicionar check em T5 Step 3.

### Placeholder scan

Sem placeholders/TBD. Todos os code blocks têm conteúdo executável.

### Type consistency

- `PLANO_PRECO_BRL` exportado em T5, importado em T7 — ✓
- `calculateTrialEnd` assinatura igual em T4 e T5 — ✓
- `sendTelegramAlert(env, text)` em T3 e T7 — ✓
- `moveToMailerLiteGroup(env, emailOrId, {from, to})` em T4 e T7+T8 — ✓

---

## Task 5 update — adicionar feature flag check (fix do self-review)

No Step 3 de Task 5, antes do `if (plano === 'trial')`, adicionar:

```javascript
  // Feature flag — rollback sem revert
  if (plano === 'trial' && env.ENABLE_TRIAL_V2 === 'false') {
    return json({ error: 'Trial temporariamente indisponível. Escolha um plano pago.' }, 503);
  }
```
