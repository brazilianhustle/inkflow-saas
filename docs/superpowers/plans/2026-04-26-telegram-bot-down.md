# Telegram Bot Down + Pushover Alt Channel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar runbook `telegram-bot-down.md` + canal alt Pushover + tabela `approvals` com endpoint admin, fechando o gap P0 da heurística #4 da matrix.md.

**Architecture:** 4 deliverables sequenciados num PR único: (1) secrets.md doc + Pushover pre-work, (2) migration `approvals` + endpoint POST `/api/approvals/decide` + UI tab no admin.html, (3) runbook + entrada no README, (4) matrix.md #4 fix com cross-link bidirecional. Auth do endpoint usa pattern existente `verifyAdmin()` (Supabase Auth JWT, NÃO studio_token).

**Tech Stack:** SQL (Postgres via Supabase), JS (CF Pages Functions, ES modules), HTML/JS inline (admin.html SPA), Markdown (canonical docs), `node:test` (testes nativos).

**Spec source:** `docs/superpowers/specs/2026-04-26-telegram-bot-down-design.md`

---

## Spec corrections (descobertas durante o /plan)

Spec original assumiu auth via `studio_token` no endpoint admin. Verificação no código revelou que `studio_token` é **per-tenant** (HMAC v1.<tenantIdB64>.<exp>.<sig>) — não admin. Pattern real do admin é:

- Admin loga em `admin.html` via Supabase Auth (`/auth/v1/token?grant_type=password`)
- Recebe JWT em `accessToken` + refresh token em `sessionStorage.ikf_refresh`
- Endpoints admin validam JWT via `verifyAdmin(authHeader, supabaseKey)` em `functions/api/get-tenant.js:35-45` — chama `${SUPABASE_URL}/auth/v1/user`, checa `user.email === ADMIN_EMAIL` (`lmf4200@gmail.com`)

Plano abaixo usa `verifyAdmin` pattern. Spec será atualizado em PR separado depois (não-bloqueante; doctrine pra próximo brainstorm).

---

## File Structure

**Create:**
- `supabase/migrations/2026-04-26-create-approvals-table.sql` — DDL + RLS + indexes
- `functions/api/approvals/decide.js` — POST endpoint pra approve/reject
- `tests/approvals-decide.test.mjs` — testes do endpoint
- `docs/canonical/runbooks/telegram-bot-down.md` — runbook completo

**Modify:**
- `admin.html` — adicionar tab "Approvals" + hash routing `#approvals/<id>` + render payload + botões
- `docs/canonical/secrets.md` — entrada Pushover na tabela §32 + seção §81+
- `docs/canonical/runbooks/README.md` — entrada na tabela §15 + `last_reviewed`
- `docs/canonical/methodology/matrix.md` — heurística #4 fix + `last_reviewed`

**Establish convention:** `supabase/migrations/` directory não existia — esse PR cria. Migrations futuras vão pra esse path. Aplicação via Supabase MCP (`apply_migration`).

---

## Risk markers

🚨 **Migration produção:** Task 2 cria tabela nova. Sem destrutivo (CREATE TABLE não toca dados existentes), mas é mudança de schema em prod. Aplicar via MCP `apply_migration` (não destrutivo, idempotente se IF NOT EXISTS — o spec usa CREATE TABLE sem IF NOT EXISTS pra falhar fast em runs duplos).

🚨 **Secret novo em prod (Task 1):** `PUSHOVER_*` ficam em Bitwarden — **NÃO** vão pra CF Pages env nesse PR (TODO marcado pra Sub-projeto 2). Validar Bitwarden item criado antes de seguir Task 2.

🚨 **Admin email hardcoded:** `ADMIN_EMAIL = 'lmf4200@gmail.com'` é constante no código. Mudança de admin futura exige refactor. Match com pattern existente — não introduzimos risco novo, mas vale anotar.

⚠️ **Polling em P0 (5s interval):** 180 queries em 15min por approval. Negligível pro free tier Supabase (~5% de 50k queries/mo budget). Sem mitigação adicional necessária.

---

## Task 1: Pre-work check + secrets.md update

**Files:**
- Modify: `docs/canonical/secrets.md`

- [ ] **Step 1: Verificar pré-trabalho do founder está completo**

Manual check (Leandro já fez OU vai fazer agora):

```bash
# Confirma item Bitwarden existe
# (manual no app Bitwarden — buscar "inkflow-pushover")

# Curl de validação (substituir <TOKEN> e <USER_KEY> com valores reais do Bitwarden)
curl -s -F "token=<PUSHOVER_APP_TOKEN>" \
     -F "user=<PUSHOVER_USER_KEY>" \
     -F "priority=1" \
     -F "title=InkFlow Pushover test" \
     -F "message=pre-work check Task 1" \
     https://api.pushover.net/1/messages.json
```

Expected: `{"status":1,"request":"..."}` + push notification no celular em <10s.

Se falhar: pausar plano, investigar Pushover setup, retomar quando OK.

- [ ] **Step 2: Modificar `docs/canonical/secrets.md` — adicionar 2 linhas na tabela §32**

Localizar tabela com `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`. Adicionar 2 linhas após `TELEGRAM_CHAT_ID`:

```
| `PUSHOVER_APP_TOKEN` | Bitwarden `inkflow-pushover` | sem expiry | leandro | alta |
| `PUSHOVER_USER_KEY` | Bitwarden `inkflow-pushover` | sem expiry | leandro | alta |
```

- [ ] **Step 3: Adicionar nova seção em `secrets.md` após "### Telegram (alertas)"**

```markdown
### Pushover (alt channel emergência)
- `PUSHOVER_APP_TOKEN` — token da application "InkFlow Alerts" criada no dashboard Pushover.
- `PUSHOVER_USER_KEY` — user key do founder (Leandro). Único por device/conta.
- Uso: ver `runbooks/telegram-bot-down.md` Ação 0.
- **NÃO replicado em CF Pages env / Worker env nesse momento** — fica em Bitwarden até Sub-projeto 2 wirar agents (manual via curl no runbook até lá).
- **TODO Sub-projeto 2:** quando agents forem implementados em CF Worker, replicar `PUSHOVER_APP_TOKEN` + `PUSHOVER_USER_KEY` em CF Pages env + Worker env (`wrangler pages secret put` + `wrangler secret put`). Hoje uso é manual via curl no runbook, então só Bitwarden basta.
- **Procedure de rotação:** se vazar, regenerar `APP_TOKEN` no dashboard Pushover (`USER_KEY` é estável por conta). Atualizar Bitwarden.
```

- [ ] **Step 4: Atualizar `last_reviewed` no frontmatter do `secrets.md` pra `2026-04-26`**

- [ ] **Step 5: Verificar render markdown + commit**

```bash
# Verifica que o arquivo é markdown válido (sem broken syntax)
head -100 docs/canonical/secrets.md
grep -A 3 "PUSHOVER_APP_TOKEN" docs/canonical/secrets.md
# Esperado: 2 linhas na tabela + seção Pushover renderizando

git add docs/canonical/secrets.md
git commit -m "docs(secrets): registra Pushover como alt channel pra heurística #4"
```

---

## Task 2: Migration `approvals` table

**Files:**
- Create: `supabase/migrations/2026-04-26-create-approvals-table.sql`

- [ ] **Step 1: Criar diretório + arquivo SQL**

```bash
mkdir -p supabase/migrations
```

Criar `supabase/migrations/2026-04-26-create-approvals-table.sql` com conteúdo:

```sql
-- Migration: create approvals table
-- Spec: docs/superpowers/specs/2026-04-26-telegram-bot-down-design.md §6.1
-- Purpose: estado compartilhado pra approval async via Pushover quando Telegram falhar.

CREATE TABLE approvals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_payload jsonb NOT NULL,
  severity        text NOT NULL CHECK (severity IN ('P0','P1','P2')),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  expires_at      timestamptz NOT NULL,
  approved_at     timestamptz,
  approved_by     text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index pra polling rápido de pendentes
CREATE INDEX approvals_status_idx ON approvals (status) WHERE status = 'pending';

-- Index pra expiry sweep (cron pode usar futuramente)
CREATE INDEX approvals_expires_at_idx ON approvals (expires_at) WHERE status = 'pending';

-- RLS: somente admin autenticado lê/atualiza; service role insere (agents).
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;

-- Admin (auth.users mapeado) tem acesso total via JWT
CREATE POLICY approvals_admin_full ON approvals
  FOR ALL
  USING (auth.jwt() ->> 'email' = 'lmf4200@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'lmf4200@gmail.com');

-- Service role bypass RLS automaticamente (PostgREST não aplica policies pra service_role)
-- Não precisa policy explícita pra service role.

COMMENT ON TABLE approvals IS 'Approvals async pra heurística #4 (matrix.md). Agent insere, admin decide via /api/approvals/decide.';
COMMENT ON COLUMN approvals.request_payload IS 'JSON da operação destrutiva pendente (ex: {action: "drop_column", table: "tenants", column: "legacy_field"})';
COMMENT ON COLUMN approvals.severity IS 'P0=15min total, P1=2h, P2=24h. Determina polling interval e timeout.';
COMMENT ON COLUMN approvals.status IS 'pending → approved | rejected | expired. Transitions via /api/approvals/decide ou cron de expiry.';
```

- [ ] **Step 2: Aplicar migration via Supabase MCP**

Usar tool `mcp__plugin_supabase_supabase__apply_migration`:

```
project_id: <pegar via mcp__plugin_supabase_supabase__list_projects>
name: 2026_04_26_create_approvals_table
query: <conteúdo do arquivo SQL acima>
```

Expected: success response, sem erros.

- [ ] **Step 3: Verificar tabela criada**

```
mcp__plugin_supabase_supabase__list_tables — schemas: ["public"]
```

Expected: `approvals` aparece na lista com colunas + indexes + RLS habilitado.

- [ ] **Step 4: Smoke test — INSERT manual**

```sql
-- Via mcp__plugin_supabase_supabase__execute_sql
INSERT INTO approvals (request_payload, severity, expires_at)
VALUES ('{"action":"smoke_test","note":"plan task 2 verification"}'::jsonb, 'P2', now() + interval '5 minutes')
RETURNING id, status, severity, expires_at;
```

Expected: 1 row returned, `status='pending'`, ID válido.

Anotar o ID retornado pra usar em Task 3 e Task 5 testes.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-04-26-create-approvals-table.sql
git commit -m "feat(db): cria tabela approvals pra heurística #4 fallback"
```

---

## Task 3: Test do endpoint `/api/approvals/decide` (failing)

**Files:**
- Create: `tests/approvals-decide.test.mjs`

- [ ] **Step 1: Escrever testes que vão falhar até endpoint existir**

Criar `tests/approvals-decide.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/approvals/decide.js';

// Mock environment + helpers
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const ADMIN_EMAIL = 'lmf4200@gmail.com';

function makeRequest({ method = 'POST', authHeader, body }) {
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;
  return new Request('https://example.com/api/approvals/decide', {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeContext({ request, fetchMock, env = {} }) {
  globalThis.fetch = fetchMock;
  return {
    request,
    env: {
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      ...env,
    },
  };
}

test('returns 405 on GET', async () => {
  const req = makeRequest({ method: 'GET' });
  const ctx = makeContext({ request: req, fetchMock: async () => ({ ok: true }) });
  const res = await onRequest(ctx);
  assert.equal(res.status, 405);
});

test('returns 401 without Authorization header', async () => {
  const req = makeRequest({ body: { id: 'abc', action: 'approve' } });
  const ctx = makeContext({ request: req, fetchMock: async () => ({ ok: true }) });
  const res = await onRequest(ctx);
  assert.equal(res.status, 401);
});

test('returns 401 when JWT user email does not match ADMIN_EMAIL', async () => {
  const req = makeRequest({
    authHeader: 'Bearer fake-jwt',
    body: { id: 'abc', action: 'approve' },
  });
  const ctx = makeContext({
    request: req,
    fetchMock: async (url) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, json: async () => ({ email: 'random@example.com' }) };
      }
      return { ok: true };
    },
  });
  const res = await onRequest(ctx);
  assert.equal(res.status, 401);
});

test('returns 400 on invalid action', async () => {
  const req = makeRequest({
    authHeader: 'Bearer admin-jwt',
    body: { id: 'some-uuid', action: 'maybe' },
  });
  const ctx = makeContext({
    request: req,
    fetchMock: async (url) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, json: async () => ({ email: ADMIN_EMAIL }) };
      }
      return { ok: true };
    },
  });
  const res = await onRequest(ctx);
  assert.equal(res.status, 400);
});

test('returns 400 on missing id', async () => {
  const req = makeRequest({
    authHeader: 'Bearer admin-jwt',
    body: { action: 'approve' },
  });
  const ctx = makeContext({
    request: req,
    fetchMock: async (url) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, json: async () => ({ email: ADMIN_EMAIL }) };
      }
      return { ok: true };
    },
  });
  const res = await onRequest(ctx);
  assert.equal(res.status, 400);
});

test('returns 200 + approved row on successful approve', async () => {
  const req = makeRequest({
    authHeader: 'Bearer admin-jwt',
    body: { id: 'fake-uuid', action: 'approve', notes: 'looks good' },
  });
  let patchedBody = null;
  const ctx = makeContext({
    request: req,
    fetchMock: async (url, opts) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, json: async () => ({ email: ADMIN_EMAIL }) };
      }
      if (url.includes('/rest/v1/approvals') && opts?.method === 'PATCH') {
        patchedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ([{
            id: 'fake-uuid',
            status: 'approved',
            approved_at: '2026-04-26T12:00:00Z',
            approved_by: ADMIN_EMAIL,
            notes: 'looks good',
          }]),
        };
      }
      return { ok: true };
    },
  });
  const res = await onRequest(ctx);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'approved');
  assert.equal(data.approved_by, ADMIN_EMAIL);
  assert.equal(patchedBody.status, 'approved');
  assert.equal(patchedBody.notes, 'looks good');
});

test('returns 409 when row already decided (PATCH returns empty array)', async () => {
  const req = makeRequest({
    authHeader: 'Bearer admin-jwt',
    body: { id: 'fake-uuid', action: 'approve' },
  });
  const ctx = makeContext({
    request: req,
    fetchMock: async (url, opts) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, json: async () => ({ email: ADMIN_EMAIL }) };
      }
      if (url.includes('/rest/v1/approvals') && opts?.method === 'PATCH') {
        return { ok: true, status: 200, json: async () => ([]) };  // 0 rows updated → conflict
      }
      return { ok: true };
    },
  });
  const res = await onRequest(ctx);
  assert.equal(res.status, 409);
});

test('returns 200 + rejected status on action=reject', async () => {
  const req = makeRequest({
    authHeader: 'Bearer admin-jwt',
    body: { id: 'fake-uuid', action: 'reject', notes: 'too risky' },
  });
  let patchedBody = null;
  const ctx = makeContext({
    request: req,
    fetchMock: async (url, opts) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, json: async () => ({ email: ADMIN_EMAIL }) };
      }
      if (url.includes('/rest/v1/approvals') && opts?.method === 'PATCH') {
        patchedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'fake-uuid', status: 'rejected', approved_by: ADMIN_EMAIL, notes: 'too risky' }]),
        };
      }
      return { ok: true };
    },
  });
  const res = await onRequest(ctx);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'rejected');
  assert.equal(patchedBody.status, 'rejected');
});
```

- [ ] **Step 2: Rodar testes — esperado FALHAR**

```bash
node --test tests/approvals-decide.test.mjs
```

Expected: erro de import `Cannot find module '../functions/api/approvals/decide.js'` ou similar — endpoint ainda não existe.

- [ ] **Step 3: Commit dos testes**

```bash
git add tests/approvals-decide.test.mjs
git commit -m "test(approvals): adiciona testes do endpoint decide (red)"
```

---

## Task 4: Implementar `/api/approvals/decide.js`

**Files:**
- Create: `functions/api/approvals/decide.js`

- [ ] **Step 1: Criar diretório + arquivo**

```bash
mkdir -p functions/api/approvals
```

Criar `functions/api/approvals/decide.js`:

```javascript
// ── InkFlow — Decide approval (approve/reject) ──────────────────────────────
// POST /api/approvals/decide
// Body: { id: "<uuid>", action: "approve" | "reject", notes?: "<string>" }
// Auth: Bearer <supabase-auth-jwt> de admin (ADMIN_EMAIL)
// Resposta sucesso: { status, approved_at, approved_by, notes }
// Resposta falha: { error }
//
// Spec: docs/superpowers/specs/2026-04-26-telegram-bot-down-design.md §6.3

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const ADMIN_EMAIL = 'lmf4200@gmail.com';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

async function verifyAdmin(authHeader, supabaseKey) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: supabaseKey, Authorization: authHeader },
    });
    if (!userRes.ok) return null;
    const user = await userRes.json();
    if (user.email !== ADMIN_EMAIL) return null;
    return user.email;
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return json({ error: 'Server misconfigured' }, 500);

  const authHeader = request.headers.get('Authorization');
  const adminEmail = await verifyAdmin(authHeader, SUPABASE_KEY);
  if (!adminEmail) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { id, action, notes } = body || {};
  if (!id || typeof id !== 'string') return json({ error: 'Missing id' }, 400);
  if (action !== 'approve' && action !== 'reject') return json({ error: 'Invalid action' }, 400);
  if (notes !== undefined && (typeof notes !== 'string' || notes.length > 1000)) {
    return json({ error: 'Invalid notes' }, 400);
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  // Atomic UPDATE: WHERE status='pending' garante que mesmo race com cron de expiry
  // não corrompe estado. Se 0 rows affected → já decidido/expirado → 409.
  try {
    const patchUrl = `${SUPABASE_URL}/rest/v1/approvals?id=eq.${encodeURIComponent(id)}&status=eq.pending`;
    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        status: newStatus,
        approved_at: new Date().toISOString(),
        approved_by: adminEmail,
        notes: notes ?? null,
      }),
    });

    if (!patchRes.ok) {
      console.error('approvals/decide: PATCH failed', patchRes.status);
      return json({ error: 'DB error' }, 500);
    }

    const rows = await patchRes.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      // Nenhuma row atualizada — id inexistente OU status != pending
      return json({ error: 'Approval not found or already decided' }, 409);
    }

    const row = rows[0];
    return json({
      status: row.status,
      approved_at: row.approved_at,
      approved_by: row.approved_by,
      notes: row.notes,
    });
  } catch (err) {
    console.error('approvals/decide exception:', err);
    return json({ error: 'Internal error' }, 500);
  }
}
```

- [ ] **Step 2: Rodar testes — esperado PASSAR**

```bash
node --test tests/approvals-decide.test.mjs
```

Expected: 8 tests passed, 0 failed.

Se falhar: ler erro, ajustar implementação OU teste (raro), re-rodar até passar.

- [ ] **Step 3: Commit**

```bash
git add functions/api/approvals/decide.js
git commit -m "feat(approvals): endpoint POST /api/approvals/decide (green)"
```

---

## Task 5: Adicionar UI de approvals no `admin.html`

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Localizar pontos de modificação**

```bash
grep -n "showApp\|loadTenants\|hashchange\|#app\|<!-- tabs -->" admin.html | head -20
```

Identificar:
- Local pra adicionar nova tab (provavelmente após tabs existentes)
- Local pra adicionar handler de hash routing (próximo a `showApp()` ou `loadTenants()`)
- Local pra adicionar funções `loadApproval(id)`, `decideApproval(id, action, notes)`

- [ ] **Step 2: Adicionar HTML da seção approvals em `admin.html`**

Localizar a seção principal `<div id="app">` (search `id="app"` no admin.html). Adicionar dentro, após as tabs existentes:

```html
<!-- Approvals — alt channel pra heurística #4 -->
<section id="approval-section" style="display:none; padding:20px; max-width:800px;">
  <h2 style="margin-top:0;">Approval</h2>
  <div id="approval-loading">Carregando...</div>
  <div id="approval-content" style="display:none;">
    <div style="margin-bottom:12px;">
      <span><strong>ID:</strong> <code id="approval-id"></code></span>
      <span style="margin-left:20px;"><strong>Severity:</strong> <span id="approval-severity"></span></span>
      <span style="margin-left:20px;"><strong>Status:</strong> <span id="approval-status"></span></span>
    </div>
    <div style="margin-bottom:12px;">
      <strong>Expira:</strong> <span id="approval-expires"></span>
    </div>
    <h3>Payload da operação</h3>
    <pre id="approval-payload" style="background:#f5f5f5; padding:12px; overflow:auto; max-height:300px;"></pre>
    <div id="approval-actions" style="margin-top:20px;">
      <textarea id="approval-notes" placeholder="Notas (opcional)" rows="2" style="width:100%; margin-bottom:12px;"></textarea>
      <button id="approval-approve-btn" style="background:#4caf50; color:white; padding:10px 20px; border:none; cursor:pointer; margin-right:10px;">✅ Aprovar</button>
      <button id="approval-reject-btn" style="background:#f44336; color:white; padding:10px 20px; border:none; cursor:pointer;">❌ Rejeitar</button>
    </div>
    <div id="approval-result" style="margin-top:20px; display:none;"></div>
  </div>
  <div id="approval-error" style="display:none; color:#c00;"></div>
</section>
```

- [ ] **Step 3: Adicionar JS de approval no admin.html**

Localizar bloco `<script>` que tem `function showApp()` e adicionar as funções abaixo após `showApp`:

```javascript
async function loadApproval(id) {
  document.getElementById('app').classList.remove('v');
  document.getElementById('ls').style.display = 'none';
  document.getElementById('approval-section').style.display = 'block';
  document.getElementById('approval-loading').style.display = 'block';
  document.getElementById('approval-content').style.display = 'none';
  document.getElementById('approval-error').style.display = 'none';

  try {
    const data = await api('GET', `/rest/v1/approvals?id=eq.${encodeURIComponent(id)}&select=*`);
    if (!Array.isArray(data) || data.length === 0) {
      document.getElementById('approval-error').textContent = 'Approval não encontrado.';
      document.getElementById('approval-error').style.display = 'block';
      document.getElementById('approval-loading').style.display = 'none';
      return;
    }
    const row = data[0];
    document.getElementById('approval-id').textContent = row.id;
    document.getElementById('approval-severity').textContent = row.severity;
    document.getElementById('approval-status').textContent = row.status;
    document.getElementById('approval-expires').textContent = row.expires_at;
    document.getElementById('approval-payload').textContent = JSON.stringify(row.request_payload, null, 2);
    document.getElementById('approval-loading').style.display = 'none';
    document.getElementById('approval-content').style.display = 'block';

    // Esconder botões se já decidido
    if (row.status !== 'pending') {
      document.getElementById('approval-actions').style.display = 'none';
      const result = document.getElementById('approval-result');
      result.style.display = 'block';
      result.innerHTML = `<strong>Já decidido:</strong> ${row.status} por ${row.approved_by || '?'} em ${row.approved_at || '?'}.<br>Notas: ${row.notes || '(vazio)'}`;
    } else {
      document.getElementById('approval-approve-btn').onclick = () => decideApproval(id, 'approve');
      document.getElementById('approval-reject-btn').onclick = () => decideApproval(id, 'reject');
    }
  } catch (e) {
    document.getElementById('approval-error').textContent = 'Erro ao carregar: ' + (e.message || e);
    document.getElementById('approval-error').style.display = 'block';
    document.getElementById('approval-loading').style.display = 'none';
  }
}

async function decideApproval(id, action) {
  const notes = document.getElementById('approval-notes').value || undefined;
  const approveBtn = document.getElementById('approval-approve-btn');
  const rejectBtn = document.getElementById('approval-reject-btn');
  approveBtn.disabled = true;
  rejectBtn.disabled = true;

  try {
    const r = await fetch('/api/approvals/decide', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id, action, notes }),
    });
    const data = await r.json();
    const result = document.getElementById('approval-result');
    result.style.display = 'block';
    if (r.ok) {
      result.innerHTML = `<strong>✓ ${data.status}</strong> registrado em ${data.approved_at}.`;
      document.getElementById('approval-actions').style.display = 'none';
      document.getElementById('approval-status').textContent = data.status;
    } else {
      result.innerHTML = `<strong style="color:#c00;">Erro:</strong> ${data.error || 'desconhecido'} (${r.status})`;
      approveBtn.disabled = false;
      rejectBtn.disabled = false;
    }
  } catch (e) {
    document.getElementById('approval-result').style.display = 'block';
    document.getElementById('approval-result').innerHTML = `<strong style="color:#c00;">Falha:</strong> ${e.message || e}`;
    approveBtn.disabled = false;
    rejectBtn.disabled = false;
  }
}

function checkApprovalRoute() {
  const hash = window.location.hash;
  const m = hash.match(/^#approvals\/([0-9a-f-]+)$/i);
  if (m && accessToken) {
    loadApproval(m[1]);
    return true;
  }
  return false;
}
```

- [ ] **Step 4: Hookar hash routing no fluxo de login**

Localizar `function showApp()` em admin.html. **Modificar pra checar hash route ANTES de chamar `loadTenants()`**:

```javascript
function showApp() {
  document.getElementById('ls').style.display = 'none';
  document.getElementById('app').classList.add('v');
  loadCfgForm();
  if (checkApprovalRoute()) return;  // se URL é #approvals/<id>, render approval em vez de lista de tenants
  loadTenants();
}
```

Adicionar listener pra mudança de hash (deep link após login):

```javascript
window.addEventListener('hashchange', () => {
  if (accessToken) checkApprovalRoute();
});
```

(adicionar após o último listener existente, perto do `DOMContentLoaded` ou similar)

- [ ] **Step 5: Smoke test manual local**

```bash
# Insert approval row de teste via Supabase MCP execute_sql
# (anotar o ID retornado)
INSERT INTO approvals (request_payload, severity, expires_at)
VALUES ('{"action":"smoke_test_admin_ui","when":"task5"}'::jsonb, 'P0', now() + interval '15 minutes')
RETURNING id;
```

Anotar `<approval-id>` retornado.

```bash
# Servir admin.html localmente (CF Pages dev OU python http.server)
# Abrir https://inkflowbrasil.com/admin.html#approvals/<approval-id> em browser autenticado
# (deploy preview se já estiver mergeado em PR, OU local com proxy)
```

Esperado:
- Login carrega → vê seção "Approval" com payload JSON renderizado
- Clica ✅ Aprovar (com notes "smoke task5") → vê confirmação "✓ approved registrado em <ts>"
- Recarrega página → status mostra "approved", botões sumiram

**Nota:** se ambiente local não tem auth real, esse teste pode ser pulado e validado em deploy preview do PR.

- [ ] **Step 6: Verificar que UI não quebrou fluxo normal de admin**

Carregar admin.html SEM hash → deve mostrar lista de tenants normal (`loadTenants()` deve ser chamado quando hash != approvals).

- [ ] **Step 7: Commit**

```bash
git add admin.html
git commit -m "feat(admin): UI de approval com hash routing #approvals/:id"
```

---

## Task 6: Criar `runbooks/telegram-bot-down.md`

**Files:**
- Create: `docs/canonical/runbooks/telegram-bot-down.md`

- [ ] **Step 1: Criar arquivo com conteúdo completo do spec §7.1**

Criar `docs/canonical/runbooks/telegram-bot-down.md`. Conteúdo completo (copy do spec, sem mudanças):

```markdown
---
last_reviewed: 2026-04-26
owner: leandro
status: stable
related: [README.md, ../stack.md, ../methodology/matrix.md, ../methodology/incident-response.md, ../secrets.md, rollback.md]
---
# Runbook — Telegram bot down

Bot Telegram (`TELEGRAM_BOT_TOKEN`) é canal de alerts operacionais E approval pra heurística #4 (Safety/destrutivo). Quando para de responder ou retorna erro, esse runbook restaura o bot E disponibiliza Pushover como fallback de approval enquanto o conserto está em andamento.

## Sintomas

- Agent reporta erro 4xx/5xx ao chamar `/sendMessage`
- Founder não vê alertas regulares (cron, deploy, auditor) por >1h
- Logs CF Pages/Worker: `telegram fetch failed` / `401 Unauthorized` / `429 Too Many Requests`
- `curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe` retorna `ok=false`
- Agent reporta "aguardando approval Telegram há >10 min sem resposta" (cruza com timeout policy da `methodology/matrix.md` heurística #4)

## Pré-requisitos

- [ ] `TELEGRAM_BOT_TOKEN` (Bitwarden item `inkflow-telegram`)
- [ ] `PUSHOVER_USER_KEY` + `PUSHOVER_APP_TOKEN` (Bitwarden item `inkflow-pushover`)
- [ ] BotFather access (Telegram pessoal do founder)
- [ ] `wrangler` autenticado (CF Pages secrets + Worker secrets)
- [ ] Bitwarden CLI ou app desktop
- [ ] Acesso ao admin panel (Supabase Auth login) pra checar `approvals` table se Pushover foi acionado

## ⚠️ Decisão inicial (gate)

**Tem destrutivo P0 BLOQUEADO esperando approval?**

→ **Sim** — pular pra **Ação 0** (Pushover) IMEDIATAMENTE. Diagnóstico em paralelo (delegar / fazer depois).
→ **Não** — Diagnóstico normal sem urgência.

Razão: cenário "agent travado em P0" é assimétrico — desbloquear vem antes de consertar bot.

## Diagnóstico (decision tree, ordem)

1. **`getMe` responde?** (Telegram-the-service vivo)
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" \
     "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"
   ```
   - Timeout / `0` / DNS fail → **Ação D** (Telegram service down OU rede CF↔Telegram cortada)
   - `200` → seguir #2

2. **`getMe.ok == true`?** (token válido)
   ```bash
   curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe" | jq '.ok'
   ```
   - `false` ou `401` → **Ação A** (token revogado / inválido)
   - `true` → seguir #3

3. **`sendMessage` retorna `429`?** (rate limit)
   ```bash
   curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
     -d "chat_id=$TELEGRAM_CHAT_ID" \
     -d "text=runbook tg-bot-down: teste de envio" | jq '.'
   ```
   - `429` com `retry_after` no body → **Ação E** (rate limit)
   - Continuar

4. **`sendMessage` retorna `400 "chat not found"`?**
   - Sim → **Ação C** (chat_id inválido)
   - Não → seguir #5

5. **Tudo aparenta OK mas msgs não chegam ou comportamento errado?**
   - **Ação B** (env desync — catch-all)

## Ação 0 — Pushover fallback (P0 destrutivo bloqueado)

Disparar approval via Pushover priority=2 (acorda founder, bypassa modo silêncio).

**Passo 1:** Inserir row em `approvals`:

```sql
-- Via Supabase dashboard ou MCP execute_sql
INSERT INTO approvals (request_payload, severity, expires_at)
VALUES (
  '{"action":"<descrição>","details":{<contexto>}}'::jsonb,
  'P0',  -- ou P1/P2 conforme severity
  now() + interval '15 minutes'  -- 15min P0, 2h P1, 24h P2
)
RETURNING id;
```

Anotar o `id` retornado.

**Passo 2:** Disparar Pushover com URL deep-link:

```bash
PUSHOVER_USER_KEY="..."  # do Bitwarden inkflow-pushover
PUSHOVER_APP_TOKEN="..."  # do Bitwarden inkflow-pushover
APPROVAL_ID="<id-da-row-acima>"
DETAILS="<descrição curta da ação destrutiva, ex: 'drop column tenants.legacy_field'>"

curl -s -F "token=$PUSHOVER_APP_TOKEN" \
     -F "user=$PUSHOVER_USER_KEY" \
     -F "priority=2" \
     -F "retry=60" \
     -F "expire=1800" \
     -F "sound=siren" \
     -F "title=APPROVAL P0 — destrutivo bloqueado" \
     -F "message=$DETAILS — tap pra revisar e decidir" \
     -F "url=https://inkflowbrasil.com/admin.html#approvals/$APPROVAL_ID" \
     -F "url_title=Aprovar / Rejeitar" \
     https://api.pushover.net/1/messages.json
```

Parâmetros `retry=60 expire=1800`: priority=2 sem retry/expire **não acorda founder de verdade**. Esses valores fazem Pushover repetir push a cada 60s por até 30 min.

Founder recebe → toca URL → admin panel (login Supabase Auth) → revisa `request_payload` → ✅ ou ❌. Endpoint POST muta `approvals.status`.

**Passo 3:** Polling do agent (ou Leandro fazendo manual via SQL):

```sql
SELECT status, approved_at, approved_by, notes
FROM approvals
WHERE id = '<APPROVAL_ID>';
```

**Polling interval por severity:**

| Severity | Polling interval | Timeout total |
|---|---|---|
| P0 | 5s | 15 min |
| P1 | 30s | 2 h |
| P2 | 2 min | 24 h |

Se `now() > expires_at` sem decisão: marcar `status='expired'` e **abortar** a operação destrutiva. Sem 2º fallback.

```sql
-- Opcional: cron de expiry sweep (pra futuro Sub-projeto 3)
UPDATE approvals SET status='expired' WHERE status='pending' AND expires_at < now();
```

## Ação A — Token revogado / inválido (`getMe` retorna 401)

Causas: BotFather revogou (manual ou compromise detectado), token foi rotated mas env não atualizado.

```bash
# 1. Confirmar no BotFather
# Telegram pessoal → @BotFather → /mybots → InkFlow → API Token → "Revoke current token"
# (ou usar token existente se ainda ativo no BotFather)

# 2. Pegar novo token + atualizar Bitwarden
# Bitwarden item `inkflow-telegram` → editar → salvar novo valor

# 3. Atualizar CF Pages env
echo "<novo-token>" | wrangler pages secret put TELEGRAM_BOT_TOKEN --project-name=inkflow-saas

# 4. Atualizar Worker env (cron-worker)
echo "<novo-token>" | wrangler secret put TELEGRAM_BOT_TOKEN

# 5. Trigger redeploy CF Pages (secret novo só vale após reload)
git commit --allow-empty -m "chore: redeploy pra pegar novo TELEGRAM_BOT_TOKEN"
git push origin main

# 6. Verificar
sleep 60  # esperar deploy CF Pages
curl -s "https://api.telegram.org/bot<novo-token>/getMe" | jq '.ok'
# Esperado: true
```

## Ação B — Env desync entre CF Pages e Worker

Sintoma: msgs falham aleatoriamente OU funcionam de um lugar e não de outro. Causa típica: rotation parcial (rotacionou em CF Pages mas esqueceu Worker, ou vice-versa).

```bash
# 1. Listar secrets de ambos
wrangler pages secret list --project-name=inkflow-saas | grep TELEGRAM_BOT_TOKEN
wrangler secret list | grep TELEGRAM_BOT_TOKEN

# (wrangler não mostra o VALOR, só nome+timestamp. Comparar timestamps:
#  se CF Pages mostra "updated 5d ago" e Worker mostra "updated 30d ago", há drift)

# 2. Identificar valor canônico (Bitwarden é fonte da verdade)
# 3. Sobrescrever em ambos (mesmo valor)
echo "<valor-canonico>" | wrangler pages secret put TELEGRAM_BOT_TOKEN --project-name=inkflow-saas
echo "<valor-canonico>" | wrangler secret put TELEGRAM_BOT_TOKEN

# 4. Redeploy CF Pages
git commit --allow-empty -m "chore: redeploy resync TELEGRAM_BOT_TOKEN"
git push origin main

# 5. Verificar com sendMessage de ambos contextos
# (CF Pages e Worker disparam alertas distintos no curso normal — ver chegando ambos)
```

## Ação C — `chat_id` inválido (`sendMessage` retorna `400 "chat not found"`)

Causas raras: chat foi deletado, bot foi removido do canal, ou `TELEGRAM_CHAT_ID` env tem typo após rotation.

```bash
# 1. Pegar chat_id correto via getUpdates
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates" | \
  jq '.result[].message.chat.id' | sort -u
# Comparar com TELEGRAM_CHAT_ID env atual

# 2. Se diferente: atualizar
echo "<chat_id-correto>" | wrangler pages secret put TELEGRAM_CHAT_ID --project-name=inkflow-saas
echo "<chat_id-correto>" | wrangler secret put TELEGRAM_CHAT_ID

# 3. Redeploy + verificar com sendMessage
```

Se `getUpdates` retorna vazio: bot perdeu acesso ao chat. Founder precisa adicionar bot ao chat manualmente (Telegram → grupo → adicionar membro → @InkFlowBot).

## Ação D — Telegram-the-service down

Confirmar que é externo, não nosso:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.telegram.org/
# 200 esperado fora de outage
```

Verificar:
- [downdetector.com/status/telegram](https://downdetector.com/status/telegram)
- [status.telegram.org](https://status.telegram.org) (raramente atualizado, mas existe)
- Twitter `@telegram` ou `@durov` se outage anunciado

**Sem ação técnica nossa.** Pushover assume todos os alertas críticos enquanto durar (incluindo approvals via Ação 0). Re-checar a cada 30 min.

Quando voltar: validar com `getMe` + `sendMessage` teste antes de declarar resolvido.

## Ação E — Rate limit (`429 Too Many Requests`)

Cenário: cron com bug spamou 1000 msgs, ou loop infinito disparou alertas. Bot pega `429` com `Retry-After` em segundos.

```bash
# 1. Identificar a fonte do flood
wrangler pages deployment tail --project-name=inkflow-saas | grep -iE "telegram|sendMessage" | head -50
wrangler tail | grep -iE "telegram|sendMessage" | head -50

# 2. Throttle / disable a fonte
# - se for cron específico: pausar via wrangler trigger pause OU comentar binding
# - se for endpoint: deploy de hotfix com circuit breaker
# - se for n8n workflow: desativar workflow via dashboard

# 3. Esperar Retry-After
# Body do 429 traz parameters.retry_after em segundos (geralmente 5-30s pra burst pequeno, até horas pra abuso massivo)
RETRY_AFTER="<valor do response>"
sleep $RETRY_AFTER

# 4. Recuperar mensagens críticas perdidas (se houver)
# Verificar logs do cron-worker / CF Pages no período do flood — se algum alerta operacional crítico (incident, billing) ficou sem entrega, redisparar manualmente:
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d "chat_id=$TELEGRAM_CHAT_ID" \
  -d "text=[backfill] $MENSAGEM_CRITICA"
```

Pós-flood: investigar causa-raiz no commit / workflow / cron. Adicionar throttle ou rate limit local antes de re-enable.

## Verificação

```bash
# 1. getMe ok
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe" | jq '.ok'
# Esperado: true

# 2. sendMessage teste
curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d "chat_id=$TELEGRAM_CHAT_ID" \
  -d "text=runbook telegram-bot-down: resolved"
# Esperado: 200 + msg chega no chat

# 3. CF Pages e Worker em sync
wrangler pages secret list --project-name=inkflow-saas | grep TELEGRAM
wrangler secret list | grep TELEGRAM
# Timestamps próximos (mesma rotation)

# 4. Pushover continua funcionando como backup (curl teste pra não enferrujar)
curl -s -F "token=$PUSHOVER_APP_TOKEN" \
     -F "user=$PUSHOVER_USER_KEY" \
     -F "priority=0" \
     -F "title=Pushover health check" \
     -F "message=ok" \
     https://api.pushover.net/1/messages.json | jq '.status'
# Esperado: 1
```

## Critério de "resolvido"

- ✅ Bot entrega msg de teste E msg real subsequente (alerta operacional natural chegando)
- ✅ Founder confirma recebimento
- ✅ Sem alertas novos de "fetch failed" / "401" nos logs por 30 min
- ✅ Valor de `TELEGRAM_BOT_TOKEN` em CF Pages **idêntico** ao do Worker (`wrangler pages secret list` + `wrangler secret list` comparados — timestamps próximos indicam sync recente)
- ✅ Se Ação 0 foi acionada: row em `approvals` com status final (approved/rejected/expired) — operação destrutiva resolvida ou abortada explicitamente

## Pós-incidente

- [ ] Nota incidente: `incident_inkflow_<YYYY-MM-DD>_telegram-bot-down.md` (causa-raiz, duração, ação aplicada, se Pushover foi usado).
- [ ] Atualizar `[[InkFlow — Painel]]` seção 🐛 Bugs / Incidentes.
- [ ] Telegram (quando voltar): `[telegram-bot-resolved] causa: <breve>. Duração: <X>. Pushover: <usado / não usado>.`
- [ ] **Atualizar `methodology/matrix.md` heurística #4 `last_reviewed`** se houve aprendizado que mudou o protocolo (cross-link bidirecional cravado).
- [ ] Se causa-raiz é env desync (Ação B): avaliar adicionar audit cron pra detectar drift CF↔Worker (vai pro backlog P2 — `auditor secret-drift`).
- [ ] Se causa-raiz é token rotation falha (Ação A): avaliar TTL formal + cron de rotação preventiva.
- [ ] Se Pushover foi acionado: **contar uso**. Mais de 2x/trimestre = sinal pra abrir spec separado formalizando 2º alt channel.
- [ ] Se Ação E (rate limit): registrar fonte do flood + adicionar throttle local na causa-raiz antes de re-enable.
```

- [ ] **Step 2: Verificar render markdown + commit**

```bash
head -50 docs/canonical/runbooks/telegram-bot-down.md
# Validar frontmatter + título + sintomas

git add docs/canonical/runbooks/telegram-bot-down.md
git commit -m "docs(runbooks): adiciona telegram-bot-down.md com Pushover fallback"
```

---

## Task 7: Atualizar `runbooks/README.md`

**Files:**
- Modify: `docs/canonical/runbooks/README.md`

- [ ] **Step 1: Adicionar entrada na tabela §15**

Localizar tabela (linha ~17 do `runbooks/README.md`) e adicionar entrada após `restore-backup.md`:

```
| `telegram-bot-down.md` | Telegram bot off / approval bloqueado | critical (se P0 ativo) | 15-30 min |
```

- [ ] **Step 2: Atualizar `last_reviewed: 2026-04-26` no frontmatter**

- [ ] **Step 3: Verificar + commit**

```bash
grep "telegram-bot-down" docs/canonical/runbooks/README.md
# Esperado: 1 linha na tabela

git add docs/canonical/runbooks/README.md
git commit -m "docs(runbooks): adiciona telegram-bot-down ao índice README"
```

---

## Task 8: Atualizar `methodology/matrix.md` heurística #4

**Files:**
- Modify: `docs/canonical/methodology/matrix.md`

- [ ] **Step 1: Localizar parágrafo a substituir**

Localizar bloco que começa com `**Fallback se Telegram indisponível ou sem resposta:** abortar a operação...` (linhas 24-25 do arquivo).

- [ ] **Step 2: Substituir parágrafo inteiro pelo novo texto**

Texto atual (linhas 24-25):

```
   - **Fallback se Telegram indisponível ou sem resposta:** abortar a operação. **Nunca** timeout silencioso autorizando destrutivo. Em P0 com Telegram down, preferir caminhos não-destrutivos (`runbooks/rollback.md` é recuperação, não destrutivo). Se destrutivo for inevitável e Telegram down: aguardar founder via canal habitual (não há canal alternativo formalizado hoje — gap registrado em §11 do spec como pré-trabalho do runbook `telegram-bot-down.md`).
```

Texto novo:

```
   - **Fallback se Telegram indisponível ou sem resposta:** ver `../runbooks/telegram-bot-down.md` Ação 0. Resumo:
     - **Trigger:** Telegram API retornou erro **OU** msg aceita mas zero resposta do founder em 10 min.
     - **Canal alt:** Pushover (priority=2, retry=60, expire=1800, sound=siren).
     - **Mecanismo de retorno:** tabela `approvals` no Supabase + admin panel `/admin.html#approvals/<id>` linkado no Pushover. Agent faz polling.
     - **Polling interval por severity** (alinhado com `incident-response.md §6.2`):

       | Severity | Polling interval | Timeout total |
       |---|---|---|
       | P0 | 5s | 15 min |
       | P1 | 30s | 2 h |
       | P2 | 2 min | 24 h |

     - **Default se Pushover também falhar (ambos canais sem resposta em `expires_at`):** abort destrutivo automático. Operação fica registrada em log com payload completo pra retry manual quando founder ficar disponível. **Não inventar 3º canal ad-hoc** — fluxo é deterministicamente "abort". Se ocorrer >2x/trimestre, abrir spec separado pra formalizar 2º alt channel.
     - **Não** timeout silencioso autorizando destrutivo. Se nem canal primário nem alt respondem em `expires_at`, **default = abort**.
```

- [ ] **Step 3: Atualizar `last_reviewed: 2026-04-26` no frontmatter**

- [ ] **Step 4: Verificar + commit**

```bash
grep -A 2 "Fallback se Telegram" docs/canonical/methodology/matrix.md
# Esperado: novo texto referenciando ../runbooks/telegram-bot-down.md

git add docs/canonical/methodology/matrix.md
git commit -m "docs(methodology): heurística #4 referencia runbook telegram-bot-down"
```

---

## Task 9: Smoke test end-to-end

- [ ] **Step 1: Rodar suite de testes completa**

```bash
node --test tests/
# Esperado: todos os testes passam (telegram, trial-helpers, approvals-decide)
```

- [ ] **Step 2: Smoke test E2E manual em deploy preview do PR**

Após push do branch e CF Pages criar deploy preview:

1. Insert approval P0 via Supabase MCP `execute_sql`:
   ```sql
   INSERT INTO approvals (request_payload, severity, expires_at)
   VALUES ('{"action":"e2e_smoke_test","when":"task9","spec":"telegram-bot-down"}'::jsonb, 'P0', now() + interval '15 minutes')
   RETURNING id;
   ```
   Anotar `<TEST_ID>`.

2. Disparar Pushover real com URL deep-link:
   ```bash
   PUSHOVER_USER_KEY="..."  # do Bitwarden
   PUSHOVER_APP_TOKEN="..."
   curl -s -F "token=$PUSHOVER_APP_TOKEN" \
        -F "user=$PUSHOVER_USER_KEY" \
        -F "priority=1" \
        -F "title=E2E test — Task 9" \
        -F "message=Smoke test do runbook telegram-bot-down" \
        -F "url=https://<deploy-preview-url>/admin.html#approvals/<TEST_ID>" \
        -F "url_title=Aprovar / Rejeitar" \
        https://api.pushover.net/1/messages.json
   ```

3. No celular: receber notif → tocar URL → autenticar admin → ver payload → aprovar com nota "task9 e2e".

4. Verificar status mudou:
   ```sql
   SELECT status, approved_at, approved_by, notes FROM approvals WHERE id = '<TEST_ID>';
   -- Esperado: status='approved', approved_by='lmf4200@gmail.com', notes='task9 e2e'
   ```

5. Limpar:
   ```sql
   DELETE FROM approvals WHERE id = '<TEST_ID>';
   ```

- [ ] **Step 3: Documentar resultado do smoke E2E**

Criar `evals/smoke-tests/2026-04-26-telegram-bot-down-e2e.md` com:
- Timestamp
- Deploy preview URL
- Test ID usado
- Latência push notif → tap URL
- Latência tap URL → status atualizado em DB
- Issues encontrados (se algum)

- [ ] **Step 4: Commit do log de smoke test**

```bash
mkdir -p evals/smoke-tests
git add evals/smoke-tests/2026-04-26-telegram-bot-down-e2e.md
git commit -m "test(e2e): smoke test do runbook telegram-bot-down"
```

---

## Task 10: Review final + abrir PR

- [ ] **Step 1: Review do diff completo**

```bash
git diff main...HEAD --stat
# Esperado: ~10 arquivos alterados/criados
```

```bash
git log --oneline main..HEAD
# Esperado: ~9 commits (Tasks 1-9)
```

- [ ] **Step 2: Cobertura do spec**

Checklist manual contra `docs/superpowers/specs/2026-04-26-telegram-bot-down-design.md`:

- [ ] §4 D1 Pushover setup + secrets.md → Task 1 ✅
- [ ] §4 D2 approvals infra → Tasks 2+3+4+5 ✅
- [ ] §4 D3 runbook + README → Tasks 6+7 ✅
- [ ] §4 D4 matrix.md #4 fix → Task 8 ✅
- [ ] §6.5 polling interval por severity → presente em runbook + matrix #4
- [ ] §11 cross-references → todos os arquivos modificados refletem
- [ ] §13 riscos mitigados ou documentados

- [ ] **Step 3: Verificar cross-links resolvem**

```bash
# Links do matrix.md #4
grep -E "runbooks/telegram-bot-down|incident-response|approvals" docs/canonical/methodology/matrix.md
# Esperado: paths existem (verificar com ls)

# Links do runbook
grep -E "matrix.md|incident-response|secrets|rollback" docs/canonical/runbooks/telegram-bot-down.md | head -5

# Frontmatter related: paths existem
ls docs/canonical/runbooks/README.md docs/canonical/stack.md docs/canonical/methodology/matrix.md docs/canonical/methodology/incident-response.md docs/canonical/secrets.md docs/canonical/runbooks/rollback.md
# Esperado: tudo existe
```

- [ ] **Step 4: Push branch + abrir PR**

```bash
git push -u origin feat/telegram-bot-down
```

```bash
gh pr create --title "feat: runbook telegram-bot-down + Pushover alt channel + approvals infra" --body "$(cat <<'EOF'
## Summary
- Implementa runbook `runbooks/telegram-bot-down.md` cobrindo escopo (A) infra do bot quebrada e (B) Telegram service down.
- Formaliza Pushover como canal alt de approval pra heurística #4 da `matrix.md` (priority=2, retry=60, expire=1800, sound=siren).
- Tabela `approvals` no Supabase + endpoint `POST /api/approvals/decide` + UI no admin com hash routing `#approvals/<id>` resolvem o problema "Pushover é outbound only" via retorno determinístico do veredito.
- Polling interval por severity alinhado com SLA do `incident-response.md §6.2` (P0=5s/15min, P1=30s/2h, P2=2min/24h).

## Test plan
- [x] Tests unitários: `node --test tests/approvals-decide.test.mjs` (8 cases)
- [ ] Smoke E2E em deploy preview: insert row → disparar Pushover → tap URL → aprovar → ver status mudar
- [ ] Verificar cross-links resolvem (matrix #4 → runbook → secrets → migration)
- [ ] Verificar admin.html não quebrou fluxo normal (sem hash → loadTenants normal)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Atualizar backlog pós-merge (manual, fora do PR)**

Após merge, atualizar `[[InkFlow — Pendências (backlog)]]`:
- Mover P0 `telegram-bot-down` pra "✅ Feito" com ref ao PR + commit SHA
- Manter P3 "Pré-impl: pagar Pushover + config siren Android" até deadline 2026-05-26 cumprido

E `[[InkFlow — Painel]]`:
- Atualizar seção de progresso com sub-projeto 1 expandido (1 runbook novo)

---

## Out of scope (lembrete pra evitar feature creep)

- ❌ Wiring automático de Pushover em CF Worker / cron-worker → **Sub-projeto 2**
- ❌ Replicação `PUSHOVER_*` em CF Pages env / Worker env → **Sub-projeto 2** (TODO marcado em secrets.md)
- ❌ Auditor cron pra detectar drift `TELEGRAM_BOT_TOKEN` CF↔Worker → **Sub-projeto 3** (backlog P2)
- ❌ 2º alt channel se Pushover também falhar → só formalizar se >2x/trimestre
- ❌ Cron de expiry sweep (`UPDATE approvals SET status='expired' WHERE...`) → **Sub-projeto 3**
- ❌ UI rica admin (filtros, search, histórico) → V2 quando uso for frequente
- ❌ Atualizar spec original com correção de auth → PR separado, doctrine pra próximo brainstorm
