# Wire Tools Coleta v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o bot Hustle Ink (n8n Agent) chame as 4 tools do Modo Coleta v2 (`dados_coletados`, `enviar_orcamento_tatuador`, `enviar_objecao_tatuador`, `consultar_proposta_tatuador`), com `dados_coletados` criando a row em `conversas` na primeira chamada via UPSERT idempotente.

**Architecture:** Helper novo `functions/_lib/conversas-upsert.js` com `ensureConversa()` chamado por `dados-coletados.js`. As 4 tools mudam contrato de input pra `(tenant_id, telefone)` (substituindo `conversa_id` que não tinha fonte no contexto n8n). 3 tools fazem SELECT + 404; só `dados_coletados` faz UPSERT. n8n recebe 4 nodes httpRequestTool novos wired ao Agent `Seu Agente` (id `PmCMHTaTi07XGgWh`).

**Tech Stack:** Cloudflare Pages Functions (JS), Supabase PostgREST (UNIQUE constraint `tenant_id+telefone`), Node native test runner (`node --test`), n8n workflow MCP.

**Spec referência:** `docs/superpowers/specs/2026-05-05-wire-tools-coleta-v2-bot-design.md`

**Branch:** `feat/wire-tools-coleta-v2` (já criada, commit base `66579ed` com spec)

---

## Implementation order

**Etapa 1 — Backend (CF Pages):**
- Task 1: Pre-flight + baseline
- Task 2: Helper `_lib/conversas-upsert.js` + 7 tests
- Task 3: Refator `dados-coletados.js` + 9 tests
- Task 4: Refator `enviar-orcamento-tatuador.js` + 5 tests
- Task 5: Refator `enviar-objecao-tatuador.js` + 5 tests
- Task 6: Refator `consultar-proposta-tatuador.js` + 3 tests
- Task 7: Update test runner script + audit + push + abrir PR
- Task 8: Smoke backend (7 curl) + merge to main

**Etapa 2 — n8n + smoke E2E:**
- Task 9: Adicionar 4 nodes httpRequestTool + connections + publish
- Task 10: Smoke E2E (2 cenários WhatsApp real) + cleanup + atualizar Painel + commit final

---

## Task 1: Pre-flight + baseline

**Goal:** garantir branch ativa, working tree clean, bateria de testes existente verde antes de mexer em qualquer coisa.

**Files:** nenhum modificado nesta task.

- [ ] **Step 1.1: Verificar branch ativa**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git branch --show-current
```

Expected output: `feat/wire-tools-coleta-v2`

Se não estiver, abortar — branch foi criada na sessão anterior.

- [ ] **Step 1.2: Verificar working tree clean**

```bash
git status
```

Expected: "nothing to commit, working tree clean" (commit base = `66579ed` com spec).

- [ ] **Step 1.3: Rodar bateria de testes existente pra confirmar baseline verde**

```bash
bash scripts/test-prompts.sh
```

Expected: cada step "▶ ..." com testes passando, output final "✓ Todos os tests passaram."

Se algum test falhar antes de qualquer mudança nossa, abortar e investigar (regressão pré-existente).

- [ ] **Step 1.4: Confirmar env vars críticas existem em `.dev.vars` ou pelo menos disponíveis em CF Pages prod**

```bash
ls .dev.vars 2>/dev/null && grep -c "INKFLOW_TOOL_SECRET\|SUPABASE_SERVICE" .dev.vars 2>/dev/null
```

Expected: contagem ≥ 2 se `.dev.vars` existe; se não existe, OK pra desenvolvimento (testes mockam fetch). Em prod, CF Pages env vars já têm `INKFLOW_TOOL_SECRET` e `SUPABASE_SERVICE_ROLE_KEY` (smoke vai validar).

---

## Task 2: Helper `_lib/conversas-upsert.js` + 7 tests

**Files:**
- Create: `functions/_lib/conversas-upsert.js`
- Create: `tests/_lib/conversas-upsert.test.mjs`

- [ ] **Step 2.1: Criar helper inicial (esqueleto)**

Cria `functions/_lib/conversas-upsert.js` com:

```js
// ── InkFlow — Helper pra garantir existência de conversa ──────────────────
// Idempotente via UNIQUE(tenant_id, telefone) + Prefer: ignore-duplicates.
// Defaults só aplicam em INSERT efetivo; SELECT pós-conflito retorna row intacta.
//
// Uso:
//   const conv = await ensureConversa(env, {
//     tenant_id, telefone,
//     defaultsOnInsert: { estado_agente: 'coletando_tattoo' }
//   });
//   if (!conv.ok) return errorResponse;
//   // conv.id, conv.criado, conv.row disponíveis
import { supaFetch } from '../api/tools/_tool-helpers.js';

/**
 * Upsert idempotente em conversas via PostgREST ignore-duplicates.
 * @param {object} env - CF Pages env (precisa SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SERVICE_KEY)
 * @param {object} args
 * @param {string} args.tenant_id - UUID do tenant
 * @param {string} args.telefone - número normalizado
 * @param {object} [args.defaultsOnInsert={}] - campos a popular se for INSERT (ignorados se row já existe)
 * @returns {Promise<
 *   {ok: true, id: string, criado: boolean, row: object} |
 *   {ok: false, reason: string, status?: number}
 * >}
 */
export async function ensureConversa(env, { tenant_id, telefone, defaultsOnInsert = {} }) {
  if (!tenant_id) return { ok: false, reason: 'tenant_id-obrigatorio' };
  if (!telefone)  return { ok: false, reason: 'telefone-obrigatorio' };

  // Try INSERT com ignore-duplicates: cria se não existe, retorna [] se conflita.
  const insRes = await supaFetch(env, '/rest/v1/conversas?on_conflict=tenant_id,telefone', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ tenant_id, telefone, ...defaultsOnInsert }),
  });
  if (!insRes.ok) {
    return { ok: false, reason: 'insert-falhou', status: insRes.status };
  }
  const insRows = await insRes.json();

  if (Array.isArray(insRows) && insRows.length > 0) {
    // INSERT efetivado: row recém-criada.
    return { ok: true, id: insRows[0].id, criado: true, row: insRows[0] };
  }

  // Conflito (row já existia) → SELECT pra recuperar.
  const selRes = await supaFetch(
    env,
    `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}&select=*`
  );
  if (!selRes.ok) {
    return { ok: false, reason: 'select-pos-conflito-falhou', status: selRes.status };
  }
  const selRows = await selRes.json();
  if (!Array.isArray(selRows) || selRows.length === 0) {
    return { ok: false, reason: 'row-nao-encontrada-pos-conflito' };
  }
  return { ok: true, id: selRows[0].id, criado: false, row: selRows[0] };
}
```

- [ ] **Step 2.2: Criar arquivo de testes com 7 tests**

Cria `tests/_lib/conversas-upsert.test.mjs`:

```js
// Testes da função ensureConversa (helper de upsert idempotente em conversas).
// Mocks fetch globalmente; cada test restaura no finally.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureConversa } from '../../functions/_lib/conversas-upsert.js';

const ENV = { SUPABASE_SERVICE_ROLE_KEY: 'test-key' };
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TELEFONE = '+5511999999999';
const CONVERSA_ID = '11111111-1111-1111-1111-111111111111';

test('ensureConversa: INSERT primeira vez retorna criado=true com row populada', async () => {
  const origFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, opts) => {
    captured = { url, opts };
    // INSERT efetivado: PostgREST retorna [row] quando ignore-duplicates não conflita
    return new Response(JSON.stringify([{
      id: CONVERSA_ID,
      tenant_id: TENANT_ID,
      telefone: TELEFONE,
      estado_agente: 'coletando_tattoo',
      estado: 'qualificando',
      dados_coletados: {},
      dados_cadastro: {},
    }]), { status: 201 });
  };

  try {
    const result = await ensureConversa(ENV, {
      tenant_id: TENANT_ID,
      telefone: TELEFONE,
      defaultsOnInsert: { estado_agente: 'coletando_tattoo' },
    });
    assert.equal(result.ok, true);
    assert.equal(result.id, CONVERSA_ID);
    assert.equal(result.criado, true);
    assert.equal(result.row.estado_agente, 'coletando_tattoo');
    assert.match(captured.url, /\/rest\/v1\/conversas\?on_conflict=tenant_id,telefone/);
    assert.equal(captured.opts.method, 'POST');
    assert.match(captured.opts.headers.Prefer, /resolution=ignore-duplicates/);
    const body = JSON.parse(captured.opts.body);
    assert.equal(body.tenant_id, TENANT_ID);
    assert.equal(body.estado_agente, 'coletando_tattoo');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('ensureConversa: conflito retorna criado=false + row existente intacta', async () => {
  const origFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, opts) => {
    calls++;
    if (calls === 1) {
      // Primeira call: INSERT com ignore-duplicates → conflito → []
      return new Response(JSON.stringify([]), { status: 201 });
    }
    // Segunda call: SELECT pós-conflito retorna row existente
    return new Response(JSON.stringify([{
      id: CONVERSA_ID,
      tenant_id: TENANT_ID,
      telefone: TELEFONE,
      estado_agente: 'aguardando_tatuador', // estado já modificado, NÃO sobrescrito
      dados_coletados: { descricao_tattoo: 'rosa' },
    }]), { status: 200 });
  };

  try {
    const result = await ensureConversa(ENV, {
      tenant_id: TENANT_ID,
      telefone: TELEFONE,
      defaultsOnInsert: { estado_agente: 'coletando_tattoo' },
    });
    assert.equal(result.ok, true);
    assert.equal(result.id, CONVERSA_ID);
    assert.equal(result.criado, false);
    // Defaults NÃO foram aplicados — row existente preservada
    assert.equal(result.row.estado_agente, 'aguardando_tatuador');
    assert.deepEqual(result.row.dados_coletados, { descricao_tattoo: 'rosa' });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('ensureConversa: tenant_id ausente retorna ok=false', async () => {
  const result = await ensureConversa(ENV, { telefone: TELEFONE });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'tenant_id-obrigatorio');
});

test('ensureConversa: telefone ausente retorna ok=false', async () => {
  const result = await ensureConversa(ENV, { tenant_id: TENANT_ID });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'telefone-obrigatorio');
});

test('ensureConversa: Supabase 500 no INSERT retorna insert-falhou', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('Internal error', { status: 500 });

  try {
    const result = await ensureConversa(ENV, { tenant_id: TENANT_ID, telefone: TELEFONE });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'insert-falhou');
    assert.equal(result.status, 500);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('ensureConversa: SELECT pós-conflito 500 retorna select-pos-conflito-falhou', async () => {
  const origFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Response(JSON.stringify([]), { status: 201 });
    return new Response('Server error', { status: 500 });
  };

  try {
    const result = await ensureConversa(ENV, { tenant_id: TENANT_ID, telefone: TELEFONE });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'select-pos-conflito-falhou');
    assert.equal(result.status, 500);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('ensureConversa: SELECT pós-conflito vazio retorna row-nao-encontrada', async () => {
  // Edge case raro: row deletada entre INSERT-conflito e SELECT
  const origFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Response(JSON.stringify([]), { status: 201 });
    return new Response(JSON.stringify([]), { status: 200 });
  };

  try {
    const result = await ensureConversa(ENV, { tenant_id: TENANT_ID, telefone: TELEFONE });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'row-nao-encontrada-pos-conflito');
  } finally {
    globalThis.fetch = origFetch;
  }
});
```

- [ ] **Step 2.3: Rodar tests do helper, verificar 7 PASS**

```bash
node --test tests/_lib/conversas-upsert.test.mjs
```

Expected output: `# pass 7` na linha de resumo, exit 0.

- [ ] **Step 2.4: Commit**

```bash
git add functions/_lib/conversas-upsert.js tests/_lib/conversas-upsert.test.mjs
git commit -m "$(cat <<'EOF'
feat: add ensureConversa helper for idempotent conversa upsert

Helper novo em functions/_lib/conversas-upsert.js usado por
dados-coletados.js (próxima task) pra criar row em conversas
quando primeira mensagem do cliente chega via Modo Coleta v2.

Pattern: PostgREST ignore-duplicates + SELECT fallback. Defaults
aplicam só em INSERT efetivo, preserva row existente em conflito.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Refator `dados-coletados.js` + 9 tests

**Files:**
- Modify: `functions/api/tools/dados-coletados.js`
- Create: `tests/tools/dados-coletados.test.mjs`

**Mudança no contrato:** input passa de `{ conversa_id, campo, valor, tenant_id?, telefone? }` pra `{ tenant_id, telefone, campo, valor }`. Internamente usa `ensureConversa()` em vez de `carregarConversa(conversa_id)`.

- [ ] **Step 3.1: Refatorar `dados-coletados.js`**

Substituir bloco completo. Diff conceitual:
- Adicionar import `ensureConversa`
- Mudar `handle()` pra novo contrato
- Substituir `carregarConversa(env, conversa_id)` por `ensureConversa(env, {tenant_id, telefone, defaultsOnInsert: {estado_agente:'coletando_tattoo'}})`
- Adaptar PATCH pra usar `conv.id` retornado
- Adicionar `conversa_id` na response

Substituir o conteúdo da função `handle` em `functions/api/tools/dados-coletados.js` (linhas 119-217 do arquivo atual) por:

```js
async function handle({ env, input }) {
  const { tenant_id, telefone, campo, valor } = input || {};

  // 1. Validação de input ANTES de qualquer side-effect
  if (!tenant_id) return { status: 400, body: { ok: false, error: 'tenant_id obrigatorio' } };
  if (!telefone)  return { status: 400, body: { ok: false, error: 'telefone obrigatorio' } };
  if (!campo)     return { status: 400, body: { ok: false, error: 'campo obrigatorio' } };

  // 2. Validação de campo
  const isCadastro = CAMPOS_CADASTRO.includes(campo);
  const isTattoo   = CAMPOS_TATTOO.includes(campo);
  if (!isCadastro && !isTattoo) {
    return { status: 400, body: { ok: false, error: `campo invalido: ${campo}` } };
  }

  // 3. Garantir conversa via upsert idempotente (defaults só em INSERT)
  const conv = await ensureConversa(env, {
    tenant_id,
    telefone,
    defaultsOnInsert: { estado_agente: 'coletando_tattoo' },
  });
  if (!conv.ok) {
    return {
      status: 500,
      body: { ok: false, error: 'upsert-falhou', detail: { reason: conv.reason, status: conv.status } },
    };
  }

  const conversa_id = conv.id;
  const convData = conv.row;

  // 4. Validação especial pra data_nascimento
  if (campo === 'data_nascimento') {
    const iso = normalizarData(String(valor || ''));
    if (!iso) {
      return { status: 200, body: { ok: false, gatilho: 'data_invalida', dica: 'use formato dd/mm/aaaa' } };
    }
    const idade = calcularIdade(iso);
    if (idade !== null && idade < 18) {
      const cadastro = { ...(convData.dados_cadastro || {}), data_nascimento: iso, idade_anos: idade };
      await patchConversa(env, conversa_id, {
        dados_cadastro: cadastro,
        estado_agente: 'aguardando_tatuador',
      });
      return {
        status: 200,
        body: {
          ok: true, campo: 'data_nascimento', valor: iso, conversa_id,
          gatilho: 'menor_idade', idade_anos: idade,
          estado_agente: 'aguardando_tatuador',
        },
      };
    }
    const cadastro = { ...(convData.dados_cadastro || {}), data_nascimento: iso, idade_anos: idade };
    await patchConversa(env, conversa_id, { dados_cadastro: cadastro });
    return { status: 200, body: { ok: true, campo: 'data_nascimento', valor: iso, idade_anos: idade, conversa_id } };
  }

  // 5. Validação básica do nome
  if (campo === 'nome') {
    const v = String(valor || '').trim();
    if (v.length < 1) return { status: 400, body: { ok: false, error: 'nome vazio' } };
    const cadastro = { ...(convData.dados_cadastro || {}), nome: v };
    await patchConversa(env, conversa_id, { dados_cadastro: cadastro });
    return { status: 200, body: { ok: true, campo: 'nome', valor: v, conversa_id } };
  }

  // 6. Email (validação branda)
  if (campo === 'email') {
    const v = String(valor || '').trim();
    const cadastro = { ...(convData.dados_cadastro || {}), email: v };
    await patchConversa(env, conversa_id, { dados_cadastro: cadastro });
    return { status: 200, body: { ok: true, campo: 'email', valor: v, conversa_id } };
  }

  // 7. Campo de tattoo
  const dadosColetados = { ...(convData.dados_coletados || {}) };
  if (campo === 'refs_imagens') {
    const lista = Array.isArray(valor) ? valor : [valor];
    dadosColetados.refs_imagens = [...(dadosColetados.refs_imagens || []), ...lista];
  } else if (campo === 'tamanho_cm') {
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0 || n > 200) {
      return { status: 400, body: { ok: false, error: `tamanho_cm fora do range: ${valor}` } };
    }
    dadosColetados.tamanho_cm = n;
  } else {
    dadosColetados[campo] = valor;
  }

  // 8. Detecta transição pra cadastro
  const obrCompletos = OBR_TATTOO.every(k => {
    const v = dadosColetados[k];
    return v !== undefined && v !== null && v !== '';
  });

  let proximaFase = null;
  let novoEstado = null;
  if (obrCompletos && convData.estado_agente === 'coletando_tattoo') {
    novoEstado = 'coletando_cadastro';
    proximaFase = 'cadastro';
  }

  const patch = { dados_coletados: dadosColetados };
  if (novoEstado) patch.estado_agente = novoEstado;
  await patchConversa(env, conversa_id, patch);

  const body = { ok: true, campo, valor: dadosColetados[campo], conversa_id };
  if (proximaFase) body.proxima_fase = proximaFase;
  if (novoEstado) body.estado_agente = novoEstado;

  return { status: 200, body };
}
```

E adicionar import no topo (linha 26 do arquivo, junto com o import existente):

```js
import { withTool, supaFetch } from './_tool-helpers.js';
import { ensureConversa } from '../../_lib/conversas-upsert.js';
```

Função `carregarConversa` (linhas 101-108) pode ser removida (não mais usada). Função `patchConversa` (linhas 110-117) **mantida intacta** — ainda usada por `handle()` pra mutation final.

- [ ] **Step 3.2: Verificar imports e syntax**

```bash
node --check functions/api/tools/dados-coletados.js
```

Expected: exit 0 (sem syntax errors).

- [ ] **Step 3.3: Rodar tests existentes de helpers (devem continuar verdes)**

```bash
node --test tests/tools/dados-coletados-helpers.test.mjs
```

Expected: todos PASS — refator não tocou em `normalizarData`/`calcularIdade`/`isoFromParts`/constantes.

- [ ] **Step 3.4: Criar `tests/tools/dados-coletados.test.mjs` com 9 tests**

Cria arquivo novo (separado de `dados-coletados-helpers.test.mjs` que cobre só helpers puros):

```js
// Testes do handler completo da tool dados_coletados.
// Cobertura: input validation, upsert path, transição de estado, edge cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/tools/dados-coletados.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TELEFONE = '+5511999999999';
const CONVERSA_ID = '11111111-1111-1111-1111-111111111111';
const SECRET = 'test-secret';

const ENV = {
  INKFLOW_TOOL_SECRET: SECRET,
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
};

function buildContext(body, secret = SECRET) {
  return {
    request: new Request('https://example.com/api/tools/dados-coletados', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Inkflow-Tool-Secret': secret,
      },
      body: JSON.stringify(body),
    }),
    env: ENV,
    waitUntil: () => {},
  };
}

// Setup mock de fetch que simula INSERT bem-sucedido + PATCH
function mockSuccessFlow(initialRow = null) {
  const rows = initialRow ? [initialRow] : [{
    id: CONVERSA_ID,
    tenant_id: TENANT_ID,
    telefone: TELEFONE,
    estado_agente: 'coletando_tattoo',
    estado: 'qualificando',
    dados_coletados: {},
    dados_cadastro: {},
  }];
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, method: opts?.method, body: opts?.body });
    if (opts?.method === 'POST' && url.includes('on_conflict')) {
      return new Response(JSON.stringify(rows), { status: 201 });
    }
    if (opts?.method === 'PATCH') {
      return new Response('', { status: 204 });
    }
    if (opts?.method === 'POST' && url.includes('tool_calls_log')) {
      return new Response('', { status: 201 });
    }
    return new Response(JSON.stringify(rows), { status: 200 });
  };
  return calls;
}

test('dados_coletados: conversa nova com campo tattoo cria row + persiste campo', async () => {
  const origFetch = globalThis.fetch;
  const calls = mockSuccessFlow();
  try {
    const ctx = buildContext({
      tenant_id: TENANT_ID,
      telefone: TELEFONE,
      campo: 'descricao_tattoo',
      valor: 'rosa',
    });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.campo, 'descricao_tattoo');
    assert.equal(body.valor, 'rosa');
    assert.equal(body.conversa_id, CONVERSA_ID);
    // Verificar que upsert foi chamado com defaults
    const upsertCall = calls.find(c => c.url.includes('on_conflict'));
    assert.ok(upsertCall, 'upsert foi chamado');
    const upsertBody = JSON.parse(upsertCall.body);
    assert.equal(upsertBody.tenant_id, TENANT_ID);
    assert.equal(upsertBody.estado_agente, 'coletando_tattoo');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: tenant_id ausente retorna 400', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 200 });
  try {
    const ctx = buildContext({ telefone: TELEFONE, campo: 'descricao_tattoo', valor: 'x' });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, 'tenant_id obrigatorio');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: telefone ausente retorna 400', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 200 });
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, campo: 'descricao_tattoo', valor: 'x' });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, 'telefone obrigatorio');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: campo inválido retorna 400 sem chamar upsert', async () => {
  const origFetch = globalThis.fetch;
  let upsertChamado = false;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('on_conflict')) upsertChamado = true;
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response(JSON.stringify([]), { status: 200 });
  };
  try {
    const ctx = buildContext({
      tenant_id: TENANT_ID,
      telefone: TELEFONE,
      campo: 'campo_inexistente',
      valor: 'x',
    });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.match(body.error, /campo invalido/);
    assert.equal(upsertChamado, false, 'upsert NÃO deve ter sido chamado');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: 3 OBR completos transiciona estado pra coletando_cadastro', async () => {
  const origFetch = globalThis.fetch;
  // Simular row existente com 2 OBR já preenchidos; nesta call adicionamos o 3º
  const calls = mockSuccessFlow({
    id: CONVERSA_ID,
    tenant_id: TENANT_ID,
    telefone: TELEFONE,
    estado_agente: 'coletando_tattoo',
    dados_coletados: { descricao_tattoo: 'rosa', tamanho_cm: 10 },
    dados_cadastro: {},
  });
  try {
    const ctx = buildContext({
      tenant_id: TENANT_ID,
      telefone: TELEFONE,
      campo: 'local_corpo',
      valor: 'antebraço',
    });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.proxima_fase, 'cadastro');
    assert.equal(body.estado_agente, 'coletando_cadastro');
    // Verificar PATCH conteve estado_agente novo
    const patchCall = calls.find(c => c.method === 'PATCH');
    assert.ok(patchCall);
    const patchBody = JSON.parse(patchCall.body);
    assert.equal(patchBody.estado_agente, 'coletando_cadastro');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: data_nascimento idade<18 retorna gatilho menor_idade', async () => {
  const origFetch = globalThis.fetch;
  mockSuccessFlow({
    id: CONVERSA_ID, tenant_id: TENANT_ID, telefone: TELEFONE,
    estado_agente: 'coletando_cadastro',
    dados_coletados: {}, dados_cadastro: {},
  });
  try {
    const ctx = buildContext({
      tenant_id: TENANT_ID, telefone: TELEFONE,
      campo: 'data_nascimento', valor: '01/01/2015',
    });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.gatilho, 'menor_idade');
    assert.equal(body.estado_agente, 'aguardando_tatuador');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: data_nascimento formato inválido retorna gatilho data_invalida', async () => {
  const origFetch = globalThis.fetch;
  mockSuccessFlow();
  try {
    const ctx = buildContext({
      tenant_id: TENANT_ID, telefone: TELEFONE,
      campo: 'data_nascimento', valor: 'amanha',
    });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, false);
    assert.equal(body.gatilho, 'data_invalida');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: ensureConversa falha → tool retorna 500', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('Server error', { status: 500 });
  };
  try {
    const ctx = buildContext({
      tenant_id: TENANT_ID, telefone: TELEFONE,
      campo: 'descricao_tattoo', valor: 'rosa',
    });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 500);
    assert.equal(body.error, 'upsert-falhou');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: auth falha retorna 401', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 200 });
  try {
    const ctx = buildContext({
      tenant_id: TENANT_ID, telefone: TELEFONE,
      campo: 'descricao_tattoo', valor: 'rosa',
    }, 'wrong-secret');
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.error, 'bad-secret');
  } finally {
    globalThis.fetch = origFetch;
  }
});
```

- [ ] **Step 3.5: Rodar tests do handler, verificar 9 PASS**

```bash
node --test tests/tools/dados-coletados.test.mjs
```

Expected: `# pass 9`, exit 0.

- [ ] **Step 3.6: Rodar bateria de helpers + handler juntos**

```bash
node --test tests/tools/dados-coletados-helpers.test.mjs tests/tools/dados-coletados.test.mjs tests/_lib/conversas-upsert.test.mjs
```

Expected: todos PASS, sem regressão nos helpers.

- [ ] **Step 3.7: Commit**

```bash
git add functions/api/tools/dados-coletados.js tests/tools/dados-coletados.test.mjs
git commit -m "$(cat <<'EOF'
refactor: dados_coletados usa ensureConversa + contrato (tenant_id, telefone)

Tool agora aceita {tenant_id, telefone, campo, valor} e cria conversa
via UPSERT idempotente na primeira chamada. conversa_id removido do
input (n8n não tem fonte) e adicionado na response.

Lógica de validação por campo + transição estado preservadas.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Refator `enviar-orcamento-tatuador.js` + 5 tests

**Files:**
- Modify: `functions/api/tools/enviar-orcamento-tatuador.js`
- Create: `tests/tools/enviar-orcamento-tatuador.test.mjs`

**Mudança no contrato:** `{ conversa_id }` → `{ tenant_id, telefone }`. Internamente SELECT por par; 404 se não existe.

- [ ] **Step 4.1: Refatorar `enviar-orcamento-tatuador.js`**

Substituir função `carregarConversaComTenant(env, conversa_id)` (linhas 91-99) por:

```js
async function carregarConversaPorPar(env, tenant_id, telefone) {
  const r = await supaFetch(env,
    `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}` +
    `&select=id,estado_agente,orcid,dados_coletados,dados_cadastro,tenant_id,tenants(${encodeURIComponent(TENANT_FIELDS)})`
  );
  if (!r.ok) throw new Error(`conversa-fetch-${r.status}`);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}
```

Substituir bloco inicial da função `handle()` (linhas 115-120 do arquivo atual) que destrutura `conversa_id` e chama `carregarConversaComTenant`:

```js
async function handle({ env, input }) {
  const { tenant_id, telefone } = input || {};
  if (!tenant_id) return { status: 400, body: { ok: false, error: 'tenant_id obrigatorio' } };
  if (!telefone)  return { status: 400, body: { ok: false, error: 'telefone obrigatorio' } };

  const conv = await carregarConversaPorPar(env, tenant_id, telefone);
  if (!conv) return { status: 404, body: { ok: false, error: 'conversa-nao-encontrada' } };

  const conversa_id = conv.id; // pra usar nos PATCHs subsequentes
  // ... resto da lógica intacta
```

**Substituir todos os usos posteriores de `conversa_id` no `handle()`** — variável `conversa_id` agora é declarada localmente após o SELECT (linhas 163, 175). Lógica restante (5 OBR check, gerarOrcid, PATCH reservar, enviarTelegram, rollback) **permanece intacta**.

- [ ] **Step 4.2: Verificar syntax**

```bash
node --check functions/api/tools/enviar-orcamento-tatuador.js
```

Expected: exit 0.

- [ ] **Step 4.3: Criar `tests/tools/enviar-orcamento-tatuador.test.mjs` com 5 tests**

```js
// Testes do handler enviar-orcamento-tatuador (refator pra contrato tenant_id+telefone).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/tools/enviar-orcamento-tatuador.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TELEFONE = '+5511999999999';
const CONVERSA_ID = '11111111-1111-1111-1111-111111111111';
const SECRET = 'test-secret';
const TG_CHAT_ID = '-100123456';

const ENV = {
  INKFLOW_TOOL_SECRET: SECRET,
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  INKFLOW_TELEGRAM_BOT_TOKEN: 'fake-bot-token',
};

function buildContext(body, secret = SECRET) {
  return {
    request: new Request('https://example.com/api/tools/enviar-orcamento-tatuador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Inkflow-Tool-Secret': secret },
      body: JSON.stringify(body),
    }),
    env: ENV,
    waitUntil: () => {},
  };
}

const CONVERSA_COMPLETA = {
  id: CONVERSA_ID,
  tenant_id: TENANT_ID,
  estado_agente: 'coletando_cadastro',
  orcid: null,
  dados_coletados: { descricao_tattoo: 'rosa', tamanho_cm: 10, local_corpo: 'antebraço' },
  dados_cadastro: { nome: 'Maria Silva', data_nascimento: '1995-03-12', idade_anos: 31 },
  tenants: { id: TENANT_ID, nome_estudio: 'Hustle Ink', tatuador_telegram_chat_id: TG_CHAT_ID, tatuador_telegram_username: 'leo' },
};

test('enviar-orcamento: happy path envia Telegram e retorna 200 com orcid', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([CONVERSA_COMPLETA]), { status: 200 });
    }
    if (url.includes('telegram.org/bot') && url.includes('sendMessage')) {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 });
    }
    if (opts?.method === 'PATCH') return new Response('', { status: 204 });
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response(JSON.stringify([]), { status: 200 });
  };
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.match(body.orcid, /^orc_/);
    assert.equal(body.telegram_message_id, 42);
    assert.equal(body.estado_agente, 'aguardando_tatuador');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-orcamento: tenant_id ausente retorna 400', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 200 });
  try {
    const ctx = buildContext({ telefone: TELEFONE });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, 'tenant_id obrigatorio');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-orcamento: telefone ausente retorna 400', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 200 });
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, 'telefone obrigatorio');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-orcamento: conversa não existe retorna 404', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 404);
    assert.equal(body.error, 'conversa-nao-encontrada');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-orcamento: idempotência via orcid existente', async () => {
  const origFetch = globalThis.fetch;
  const convComOrcid = { ...CONVERSA_COMPLETA, orcid: 'orc_abc123', estado_agente: 'aguardando_tatuador' };
  let telegramCalls = 0;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([convComOrcid]), { status: 200 });
    }
    if (url.includes('telegram.org')) {
      telegramCalls++;
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.orcid, 'orc_abc123');
    assert.equal(body.idempotente, true);
    assert.equal(telegramCalls, 0, 'Telegram NÃO deve ser chamado em idempotência');
  } finally {
    globalThis.fetch = origFetch;
  }
});
```

- [ ] **Step 4.4: Rodar tests**

```bash
node --test tests/tools/enviar-orcamento-tatuador.test.mjs
```

Expected: `# pass 5`, exit 0.

- [ ] **Step 4.5: Commit**

```bash
git add functions/api/tools/enviar-orcamento-tatuador.js tests/tools/enviar-orcamento-tatuador.test.mjs
git commit -m "$(cat <<'EOF'
refactor: enviar-orcamento-tatuador usa contrato (tenant_id, telefone)

SELECT por par substitui SELECT por conversa_id (n8n não tem fonte
de conversa_id). 404 se conversa não existe — telegrafa bug se LLM
chamar fora de ordem (sem dados_coletados antes).

Lógica restante (5 OBR check, gerarOrcid, idempotência via orcid,
PATCH reservar + Telegram + rollback) preservada.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Refator `enviar-objecao-tatuador.js` + 5 tests

**Files:**
- Modify: `functions/api/tools/enviar-objecao-tatuador.js`
- Create: `tests/tools/enviar-objecao-tatuador.test.mjs`

**Mudança no contrato:** `{ conversa_id, valor_pedido_cliente }` → `{ tenant_id, telefone, valor_pedido_cliente }`.

- [ ] **Step 5.1: Refatorar `enviar-objecao-tatuador.js`**

Substituir `carregarConversa(env, conversa_id)` (linhas 52-60) por:

```js
async function carregarConversaPorPar(env, tenant_id, telefone) {
  const r = await supaFetch(env,
    `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}` +
    `&select=id,estado_agente,valor_proposto,valor_pedido_cliente,orcid,dados_cadastro,tenants(${encodeURIComponent(TENANT_FIELDS)})`
  );
  if (!r.ok) throw new Error(`conversa-fetch-${r.status}`);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}
```

Substituir bloco inicial de `handle()` (linhas 76-87):

```js
async function handle({ env, input }) {
  const { tenant_id, telefone, valor_pedido_cliente } = input || {};
  if (!tenant_id) return { status: 400, body: { ok: false, error: 'tenant_id obrigatorio' } };
  if (!telefone)  return { status: 400, body: { ok: false, error: 'telefone obrigatorio' } };
  if (valor_pedido_cliente === undefined || valor_pedido_cliente === null) {
    return { status: 400, body: { ok: false, error: 'valor_pedido_cliente obrigatorio' } };
  }
  const valorPedido = Number(valor_pedido_cliente);
  if (!Number.isFinite(valorPedido) || valorPedido <= 0) {
    return { status: 400, body: { ok: false, error: 'valor_pedido_cliente invalido (esperado numero > 0)' } };
  }

  const conv = await carregarConversaPorPar(env, tenant_id, telefone);
  if (!conv) return { status: 404, body: { ok: false, error: 'conversa-nao-encontrada' } };

  const conversa_id = conv.id;
  // resto da lógica intacta
```

Lógica restante (linhas 90-130: validação valor_proposto/orcid/tatuador_telegram, PATCH valor_pedido_cliente, Telegram com keyboard) **preservada**.

- [ ] **Step 5.2: Verificar syntax**

```bash
node --check functions/api/tools/enviar-objecao-tatuador.js
```

Expected: exit 0.

- [ ] **Step 5.3: Criar `tests/tools/enviar-objecao-tatuador.test.mjs` com 5 tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/tools/enviar-objecao-tatuador.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TELEFONE = '+5511999999999';
const CONVERSA_ID = '11111111-1111-1111-1111-111111111111';
const SECRET = 'test-secret';
const TG_CHAT_ID = '-100123456';

const ENV = {
  INKFLOW_TOOL_SECRET: SECRET,
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  INKFLOW_TELEGRAM_BOT_TOKEN: 'fake-bot-token',
};

function buildContext(body, secret = SECRET) {
  return {
    request: new Request('https://example.com/api/tools/enviar-objecao-tatuador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Inkflow-Tool-Secret': secret },
      body: JSON.stringify(body),
    }),
    env: ENV,
    waitUntil: () => {},
  };
}

const CONVERSA_PROPONDO = {
  id: CONVERSA_ID,
  estado_agente: 'propondo_valor',
  valor_proposto: 800,
  valor_pedido_cliente: null,
  orcid: 'orc_abc123',
  dados_cadastro: { nome: 'Maria Silva' },
  tenants: { id: TENANT_ID, tatuador_telegram_chat_id: TG_CHAT_ID },
};

test('enviar-objecao: happy path envia Telegram e estado vira aguardando_decisao', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([CONVERSA_PROPONDO]), { status: 200 });
    }
    if (url.includes('telegram.org/bot')) {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }), { status: 200 });
    }
    if (opts?.method === 'PATCH') return new Response('', { status: 204 });
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, valor_pedido_cliente: 600 });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.estado_agente, 'aguardando_decisao_desconto');
    assert.equal(body.valor_pedido_cliente, 600);
    assert.equal(body.valor_proposto, 800);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-objecao: tenant_id ou telefone ausentes retornam 400', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 200 });
  try {
    const r1 = await onRequest(buildContext({ telefone: TELEFONE, valor_pedido_cliente: 600 }));
    assert.equal((await r1.json()).error, 'tenant_id obrigatorio');
    const r2 = await onRequest(buildContext({ tenant_id: TENANT_ID, valor_pedido_cliente: 600 }));
    assert.equal((await r2.json()).error, 'telefone obrigatorio');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-objecao: conversa não existe retorna 404', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    const res = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, valor_pedido_cliente: 600 }));
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, 'conversa-nao-encontrada');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-objecao: sem valor_proposto retorna 400', async () => {
  const origFetch = globalThis.fetch;
  const semValor = { ...CONVERSA_PROPONDO, valor_proposto: null };
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([semValor]), { status: 200 });
    }
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    const res = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, valor_pedido_cliente: 600 }));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'valor_proposto-ausente');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-objecao: valor_pedido_cliente inválido retorna 400', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    // Negativo
    const r1 = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, valor_pedido_cliente: -100 }));
    assert.equal(r1.status, 400);
    // Zero
    const r2 = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, valor_pedido_cliente: 0 }));
    assert.equal(r2.status, 400);
    // String não-numérica
    const r3 = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, valor_pedido_cliente: 'abc' }));
    assert.equal(r3.status, 400);
  } finally {
    globalThis.fetch = origFetch;
  }
});
```

- [ ] **Step 5.4: Rodar tests**

```bash
node --test tests/tools/enviar-objecao-tatuador.test.mjs
```

Expected: `# pass 5`, exit 0.

- [ ] **Step 5.5: Commit**

```bash
git add functions/api/tools/enviar-objecao-tatuador.js tests/tools/enviar-objecao-tatuador.test.mjs
git commit -m "$(cat <<'EOF'
refactor: enviar-objecao-tatuador usa contrato (tenant_id, telefone)

SELECT por par substitui SELECT por conversa_id. 404 se conversa
não existe. Validações de valor_proposto/orcid/keyboard preservadas.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Refator `consultar-proposta-tatuador.js` + 3 tests

**Files:**
- Modify: `functions/api/tools/consultar-proposta-tatuador.js`
- Create: `tests/tools/consultar-proposta-tatuador.test.mjs`

- [ ] **Step 6.1: Refatorar `consultar-proposta-tatuador.js`**

Substituir `carregarConversa(env, conversa_id)` (linhas 25-33) por:

```js
async function carregarConversaPorPar(env, tenant_id, telefone) {
  const r = await supaFetch(env,
    `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}` +
    '&select=id,estado_agente,valor_proposto,valor_pedido_cliente,orcid,dados_coletados'
  );
  if (!r.ok) throw new Error(`conversa-fetch-${r.status}`);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}
```

Substituir bloco inicial de `handle()` (linhas 35-40):

```js
async function handle({ env, input }) {
  const { tenant_id, telefone } = input || {};
  if (!tenant_id) return { status: 400, body: { ok: false, error: 'tenant_id obrigatorio' } };
  if (!telefone)  return { status: 400, body: { ok: false, error: 'telefone obrigatorio' } };

  const conv = await carregarConversaPorPar(env, tenant_id, telefone);
  if (!conv) return { status: 404, body: { ok: false, error: 'conversa-nao-encontrada' } };

  // resto da lógica de derivação intacta
```

Lógica de derivação `decisao_desconto`/`mensagem_tatuador`/`recusou_pedido` (linhas 42-65) **preservada**.

- [ ] **Step 6.2: Verificar syntax**

```bash
node --check functions/api/tools/consultar-proposta-tatuador.js
```

Expected: exit 0.

- [ ] **Step 6.3: Criar `tests/tools/consultar-proposta-tatuador.test.mjs` com 3 tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/tools/consultar-proposta-tatuador.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TELEFONE = '+5511999999999';
const CONVERSA_ID = '11111111-1111-1111-1111-111111111111';
const SECRET = 'test-secret';

const ENV = {
  INKFLOW_TOOL_SECRET: SECRET,
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
};

function buildContext(body, secret = SECRET) {
  return {
    request: new Request('https://example.com/api/tools/consultar-proposta-tatuador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Inkflow-Tool-Secret': secret },
      body: JSON.stringify(body),
    }),
    env: ENV,
    waitUntil: () => {},
  };
}

test('consultar-proposta: retorna estado completo da conversa', async () => {
  const origFetch = globalThis.fetch;
  const conv = {
    id: CONVERSA_ID,
    estado_agente: 'aguardando_decisao_desconto',
    valor_proposto: 800,
    valor_pedido_cliente: 600,
    orcid: 'orc_abc123',
    dados_coletados: { decisao_desconto: 'aceito', mensagem_tatuador: null },
  };
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([conv]), { status: 200 });
    }
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    const res = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE }));
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.estado_agente, 'aguardando_decisao_desconto');
    assert.equal(body.valor_proposto, 800);
    assert.equal(body.valor_pedido_cliente, 600);
    assert.equal(body.decisao_desconto, 'aceito');
    assert.equal(body.orcid, 'orc_abc123');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('consultar-proposta: tenant_id ou telefone ausentes retornam 400', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    const r1 = await onRequest(buildContext({ telefone: TELEFONE }));
    assert.equal(r1.status, 400);
    assert.equal((await r1.json()).error, 'tenant_id obrigatorio');
    const r2 = await onRequest(buildContext({ tenant_id: TENANT_ID }));
    assert.equal(r2.status, 400);
    assert.equal((await r2.json()).error, 'telefone obrigatorio');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('consultar-proposta: conversa não existe retorna 404', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    const res = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE }));
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, 'conversa-nao-encontrada');
  } finally {
    globalThis.fetch = origFetch;
  }
});
```

- [ ] **Step 6.4: Rodar tests**

```bash
node --test tests/tools/consultar-proposta-tatuador.test.mjs
```

Expected: `# pass 3`, exit 0.

- [ ] **Step 6.5: Commit**

```bash
git add functions/api/tools/consultar-proposta-tatuador.js tests/tools/consultar-proposta-tatuador.test.mjs
git commit -m "$(cat <<'EOF'
refactor: consultar-proposta-tatuador usa contrato (tenant_id, telefone)

SELECT por par substitui SELECT por conversa_id. 404 se conversa
não existe. Lógica de derivação preservada.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update test runner script + audit + push + abrir PR

**Files:**
- Modify: `scripts/test-prompts.sh`

- [ ] **Step 7.1: Adicionar 5 novos test files ao runner script**

Adicionar ao final de `scripts/test-prompts.sh`, antes da linha "✓ Todos os tests passaram." (linha 67):

```bash
echo "▶ Lib — conversas-upsert (Coleta v2 wire)..."
node --test tests/_lib/conversas-upsert.test.mjs

echo "▶ Tools — dados-coletados handler (Coleta v2 wire)..."
node --test tests/tools/dados-coletados.test.mjs

echo "▶ Tools — enviar-orcamento-tatuador (Coleta v2 wire)..."
node --test tests/tools/enviar-orcamento-tatuador.test.mjs

echo "▶ Tools — enviar-objecao-tatuador (Coleta v2 wire)..."
node --test tests/tools/enviar-objecao-tatuador.test.mjs

echo "▶ Tools — consultar-proposta-tatuador (Coleta v2 wire)..."
node --test tests/tools/consultar-proposta-tatuador.test.mjs
```

Concretamente, edit o bloco final pra:

```bash
echo "▶ API — cron resumo-semanal (PR 2)..."
node --test tests/api/cron-resumo-semanal.test.mjs

echo "▶ Lib — conversas-upsert (Coleta v2 wire)..."
node --test tests/_lib/conversas-upsert.test.mjs

echo "▶ Tools — dados-coletados handler (Coleta v2 wire)..."
node --test tests/tools/dados-coletados.test.mjs

echo "▶ Tools — enviar-orcamento-tatuador (Coleta v2 wire)..."
node --test tests/tools/enviar-orcamento-tatuador.test.mjs

echo "▶ Tools — enviar-objecao-tatuador (Coleta v2 wire)..."
node --test tests/tools/enviar-objecao-tatuador.test.mjs

echo "▶ Tools — consultar-proposta-tatuador (Coleta v2 wire)..."
node --test tests/tools/consultar-proposta-tatuador.test.mjs

echo "✓ Todos os tests passaram."
```

- [ ] **Step 7.2: Rodar bateria completa**

```bash
bash scripts/test-prompts.sh
```

Expected: cada step "▶ ..." passa, output final "✓ Todos os tests passaram." e exit 0.

- [ ] **Step 7.3: Audit final do diff**

```bash
git status
git diff main..HEAD --stat
```

Expected: ~6 arquivos novos/modificados:
- `docs/superpowers/specs/2026-05-05-wire-tools-coleta-v2-bot-design.md` (já commitado em base)
- `docs/superpowers/plans/2026-05-05-wire-tools-coleta-v2-bot.md` (este plano, será committado em Task 10)
- `functions/_lib/conversas-upsert.js` (novo)
- `functions/api/tools/dados-coletados.js` (modificado)
- `functions/api/tools/enviar-orcamento-tatuador.js` (modificado)
- `functions/api/tools/enviar-objecao-tatuador.js` (modificado)
- `functions/api/tools/consultar-proposta-tatuador.js` (modificado)
- `scripts/test-prompts.sh` (modificado)
- `tests/_lib/conversas-upsert.test.mjs` (novo)
- `tests/tools/dados-coletados.test.mjs` (novo)
- `tests/tools/enviar-orcamento-tatuador.test.mjs` (novo)
- `tests/tools/enviar-objecao-tatuador.test.mjs` (novo)
- `tests/tools/consultar-proposta-tatuador.test.mjs` (novo)

- [ ] **Step 7.4: Commit do test runner + plano + push branch**

```bash
git add scripts/test-prompts.sh docs/superpowers/plans/2026-05-05-wire-tools-coleta-v2-bot.md
git commit -m "$(cat <<'EOF'
chore: adiciona 5 test files ao runner + commita plano

5 testes da feature wire-tools-coleta-v2 incluídos na bateria
completa (test-prompts.sh) pra cobertura em CI/local. Plano
de implementação versionado junto.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push -u origin feat/wire-tools-coleta-v2
```

Expected: push success, branch criada no remote.

- [ ] **Step 7.5: Abrir PR no GitHub**

```bash
gh pr create --title "feat: wire das 4 tools Modo Coleta v2 ao Agent n8n + self-heal de conversa" --body "$(cat <<'EOF'
## Summary

- Adiciona helper `_lib/conversas-upsert.js` com `ensureConversa()` (UPSERT idempotente via PostgREST `ignore-duplicates`).
- Refatora 4 tools Coleta pra contrato `(tenant_id, telefone)` substituindo `conversa_id` (sem fonte no contexto n8n).
- `dados_coletados` cria conversa na primeira chamada; outras 3 retornam 404 se conversa não existe.
- 29 testes novos cobrindo unit + integration paths.

Etapa 1 (este PR) deploy backend. Etapa 2 (após merge): adicionar 4 nodes httpRequestTool no n8n + connections + publish + smoke E2E WhatsApp.

Spec: `docs/superpowers/specs/2026-05-05-wire-tools-coleta-v2-bot-design.md`
Plano: `docs/superpowers/plans/2026-05-05-wire-tools-coleta-v2-bot.md`

## Test plan

- [x] Bateria local 100% verde (`bash scripts/test-prompts.sh`)
- [x] 5 test files novos: 7+9+5+5+3 = 29 testes
- [ ] Smoke backend pós-merge: 7 curl tests contra endpoints prod (Task 8)
- [ ] Smoke E2E WhatsApp: 2 cenários no Hustle Ink (Task 10)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: gh imprime URL do PR. Anotar.

---

## Task 8: Smoke backend (7 curl) + merge to main

**Files:** nenhum modificado nesta task (smoke contra prod).

**Pré-requisito:** PR (Task 7) precisa ter sido mergeado em main OU CF Pages preview ativo. Caminho recomendado: merge to main → CF Pages auto-deploy → smoke contra `inkflowbrasil.com`.

- [ ] **Step 8.1: Confirmar CF Pages deploy SUCCESS**

Aguardar GitHub Action `Pages CI/CD` finalizar com SUCCESS após merge:

```bash
gh run list --branch main --limit 5
```

Expected: última run pra branch `main` com status `completed` e conclusion `success`.

OU verificar via:

```bash
gh run watch
```

(Aguarda finalizar.)

- [ ] **Step 8.2: Setup variáveis de smoke**

```bash
export SECRET="<copiar valor de INKFLOW_TOOL_SECRET dos CF Pages env vars>"
export TENANT_ID="<UUID do Hustle Ink — query: SELECT id FROM tenants WHERE nome_estudio LIKE '%Hustle%'>"
export TELEFONE_TESTE="+5511888888888"
export TELEFONE_NEGATIVE="+5511777777777"
export URL=https://inkflowbrasil.com/api/tools
```

Para pegar TENANT_ID via MCP Supabase:
```sql
SELECT id, nome_estudio FROM tenants WHERE nome_estudio ILIKE '%hustle%';
```

- [ ] **Step 8.3: Teste 1 — 401 sem secret**

```bash
curl -s -o /tmp/smoke1.json -w "%{http_code}\n" -X POST $URL/dados-coletados \
  -H "Content-Type: application/json" -d '{}'
cat /tmp/smoke1.json
```

Expected output:
- HTTP code: `401`
- Body: `{"ok":false,"error":"secret-missing"}` (se header X-Inkflow-Tool-Secret ausente, secret no env existe)

- [ ] **Step 8.4: Teste 2 — 400 sem tenant_id**

```bash
curl -s -o /tmp/smoke2.json -w "%{http_code}\n" -X POST $URL/dados-coletados \
  -H "Content-Type: application/json" \
  -H "X-Inkflow-Tool-Secret: $SECRET" \
  -d "{\"telefone\":\"$TELEFONE_TESTE\",\"campo\":\"descricao_tattoo\",\"valor\":\"rosa\"}"
cat /tmp/smoke2.json
```

Expected:
- HTTP code: `400`
- Body: `{"ok":false,"error":"tenant_id obrigatorio"}`

- [ ] **Step 8.5: Teste 3 — 200 sucesso primeira vez (cria conversa)**

```bash
curl -s -o /tmp/smoke3.json -w "%{http_code}\n" -X POST $URL/dados-coletados \
  -H "Content-Type: application/json" \
  -H "X-Inkflow-Tool-Secret: $SECRET" \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"telefone\":\"$TELEFONE_TESTE\",\"campo\":\"descricao_tattoo\",\"valor\":\"rosa teste\"}"
cat /tmp/smoke3.json
```

Expected:
- HTTP code: `200`
- Body: `{"ok":true,"campo":"descricao_tattoo","valor":"rosa teste","conversa_id":"<uuid>"}`

Verificar via SQL (MCP Supabase):
```sql
SELECT id, estado_agente, dados_coletados FROM conversas WHERE telefone = '+5511888888888';
```

Expected: 1 row com `estado_agente='coletando_tattoo'`, `dados_coletados={"descricao_tattoo":"rosa teste"}`.

- [ ] **Step 8.6: Teste 4 — 200 sucesso segunda vez (no-op upsert)**

```bash
curl -s -o /tmp/smoke4.json -w "%{http_code}\n" -X POST $URL/dados-coletados \
  -H "Content-Type: application/json" \
  -H "X-Inkflow-Tool-Secret: $SECRET" \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"telefone\":\"$TELEFONE_TESTE\",\"campo\":\"tamanho_cm\",\"valor\":10}"
cat /tmp/smoke4.json
```

Expected:
- HTTP code: `200`
- Body inclui `conversa_id` igual ao Teste 3 (mesma row, no-op upsert + PATCH novo campo)

Verificar via SQL:
```sql
SELECT dados_coletados FROM conversas WHERE telefone = '+5511888888888';
```

Expected: `{"descricao_tattoo":"rosa teste","tamanho_cm":10}`.

- [ ] **Step 8.7: Teste 5 — gatilho menor_idade**

```bash
curl -s -o /tmp/smoke5.json -w "%{http_code}\n" -X POST $URL/dados-coletados \
  -H "Content-Type: application/json" \
  -H "X-Inkflow-Tool-Secret: $SECRET" \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"telefone\":\"$TELEFONE_TESTE\",\"campo\":\"data_nascimento\",\"valor\":\"01/01/2015\"}"
cat /tmp/smoke5.json
```

Expected:
- HTTP code: `200`
- Body: `{"ok":true,"gatilho":"menor_idade","estado_agente":"aguardando_tatuador",...}`

- [ ] **Step 8.8: Teste 6 — 404 em enviar_orcamento_tatuador pra telefone novo**

```bash
curl -s -o /tmp/smoke6.json -w "%{http_code}\n" -X POST $URL/enviar-orcamento-tatuador \
  -H "Content-Type: application/json" \
  -H "X-Inkflow-Tool-Secret: $SECRET" \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"telefone\":\"$TELEFONE_NEGATIVE\"}"
cat /tmp/smoke6.json
```

Expected:
- HTTP code: `404`
- Body: `{"ok":false,"error":"conversa-nao-encontrada"}`

- [ ] **Step 8.9: Teste 7 — 404 em consultar-proposta-tatuador pra telefone novo**

```bash
curl -s -o /tmp/smoke7.json -w "%{http_code}\n" -X POST $URL/consultar-proposta-tatuador \
  -H "Content-Type: application/json" \
  -H "X-Inkflow-Tool-Secret: $SECRET" \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"telefone\":\"$TELEFONE_NEGATIVE\"}"
cat /tmp/smoke7.json
```

Expected:
- HTTP code: `404`
- Body: `{"ok":false,"error":"conversa-nao-encontrada"}`

- [ ] **Step 8.10: Cleanup smoke — DELETE rows teste**

Via MCP Supabase:

```sql
DELETE FROM conversas WHERE telefone IN ('+5511888888888', '+5511777777777');
```

Expected: rows deletadas (`DELETE 1` ou `DELETE 2` no output).

Confirmar limpeza:
```sql
SELECT COUNT(*) FROM conversas WHERE telefone IN ('+5511888888888', '+5511777777777');
```

Expected: `0`.

- [ ] **Step 8.11: Validar `tool_calls_log`**

```sql
SELECT tool, sucesso, COUNT(*)
FROM tool_calls_log
WHERE tenant_id = '<TENANT_ID>'
  AND created_at > NOW() - INTERVAL '15 minutes'
GROUP BY tool, sucesso
ORDER BY tool;
```

Expected:
- `dados_coletados` com `sucesso=true` × 3 (testes 3-5)
- `enviar_orcamento_tatuador` com `sucesso=false` × 1 (teste 6 — 404)
- `consultar_proposta_tatuador` com `sucesso=false` × 1 (teste 7 — 404)

Note: 401 (teste 1) e 400 (teste 2) podem ou não logar dependendo do `withTool` wrapper — ignorar se ausentes.

**Critério PASS Etapa 1:** todos os 7 smokes retornaram status esperado + SQL confirma estado correto + cleanup zerou rows teste.

---

## Task 9: Adicionar 4 nodes httpRequestTool no n8n + connections + publish

**Files:** nenhum no repo. Mudança ao vivo no workflow n8n `MEU NOVO WORK - SAAS` (id `PmCMHTaTi07XGgWh`).

**Estratégia:** manual via UI n8n (mais rápido que regenerar workflow code de 168k chars). MCP `update_workflow` é alternativa se preferir audit trail em código.

- [ ] **Step 9.1: Abrir workflow no editor n8n**

Via browser: `https://n8n.inkflowbrasil.com/workflow/PmCMHTaTi07XGgWh` (URL pode variar — Leandro confirma).

- [ ] **Step 9.2: Adicionar node `dados_coletados`**

Drag um `httpRequestTool` no canvas, próximo ao Agent `Seu Agente`. Configurar:

- **Name:** `dados_coletados`
- **Method:** POST
- **URL:** `https://inkflowbrasil.com/api/tools/dados-coletados`
- **Authentication:** Generic Credential Type → HTTP Header Auth (selecionar credential existente `Inkflow Tool Secret` ou criar com nome do header `X-Inkflow-Tool-Secret` e valor de `INKFLOW_TOOL_SECRET`)
- **Send Body:** ON, Type: JSON
- **JSON Body:**
  ```json
  ={
    "tenant_id": "{{ $('Buscar Tenant').first().json.id }}",
    "telefone": "{{ $('Dados').first().json.telefone_numero }}",
    "campo": "{{ $fromAI('campo', 'nome do campo a persistir (descricao_tattoo, tamanho_cm, local_corpo, estilo, foto_local, refs_imagens, nome, data_nascimento, email)', 'string') }}",
    "valor": "{{ $fromAI('valor', 'valor do campo (string para texto, number para tamanho_cm, array para refs_imagens)', 'string') }}"
  }
  ```
- **Tool Description:**
  ```
  Persiste 1 campo coletado do cliente (tattoo: descricao_tattoo, tamanho_cm, local_corpo, estilo, foto_local, refs_imagens; cadastro: nome, data_nascimento, email). Cria conversa se primeira chamada. Retorna gatilho data_invalida ou menor_idade quando aplicavel. Use UMA tool por turno para cada campo recebido do cliente.
  ```

- [ ] **Step 9.3: Adicionar node `enviar_orcamento_tatuador`**

- **Name:** `enviar_orcamento_tatuador`
- **Method:** POST
- **URL:** `https://inkflowbrasil.com/api/tools/enviar-orcamento-tatuador`
- **Auth:** mesma credential
- **JSON Body:**
  ```json
  ={
    "tenant_id": "{{ $('Buscar Tenant').first().json.id }}",
    "telefone": "{{ $('Dados').first().json.telefone_numero }}"
  }
  ```
- **Tool Description:**
  ```
  Monta orcamento completo (3 OBR tattoo + 2 OBR cadastro) e envia Telegram pro tatuador com botoes [Fechar valor / Recusar]. Idempotente via orcid. Estado vira aguardando_tatuador. Use APOS cadastro completo. Retorna 404 se conversa nao existe (chame dados_coletados primeiro).
  ```

- [ ] **Step 9.4: Adicionar node `enviar_objecao_tatuador`**

- **Name:** `enviar_objecao_tatuador`
- **Method:** POST
- **URL:** `https://inkflowbrasil.com/api/tools/enviar-objecao-tatuador`
- **Auth:** mesma credential
- **JSON Body:**
  ```json
  ={
    "tenant_id": "{{ $('Buscar Tenant').first().json.id }}",
    "telefone": "{{ $('Dados').first().json.telefone_numero }}",
    "valor_pedido_cliente": "{{ $fromAI('valor_pedido_cliente', 'valor (numero) que o cliente pediu de desconto', 'number') }}"
  }
  ```
- **Tool Description:**
  ```
  Envia desconto pedido pelo cliente ao tatuador via Telegram com botoes [Aceitar X / Manter Y]. Estado vira aguardando_decisao_desconto. Use SO quando cliente pediu desconto e ja existe valor_proposto. Retorna 400 se valor_proposto ausente.
  ```

- [ ] **Step 9.5: Adicionar node `consultar_proposta_tatuador`**

- **Name:** `consultar_proposta_tatuador`
- **Method:** POST
- **URL:** `https://inkflowbrasil.com/api/tools/consultar-proposta-tatuador`
- **Auth:** mesma credential
- **JSON Body:**
  ```json
  ={
    "tenant_id": "{{ $('Buscar Tenant').first().json.id }}",
    "telefone": "{{ $('Dados').first().json.telefone_numero }}"
  }
  ```
- **Tool Description:**
  ```
  Consulta estado atual da conversa (estado_agente, valor_proposto, valor_pedido_cliente, decisao_desconto, mensagem_tatuador, orcid). Read-only. Usado pelo agente em propondo_valor/aguardando_decisao_desconto pra saber qual valor apresentar.
  ```

- [ ] **Step 9.6: Wire as 4 connections `ai_tool` ao Agent `Seu Agente`**

Pra cada um dos 4 nodes novos:
- Arrastar conexão de saída do node → input `Tools` do Agent `Seu Agente` (mesmo padrão dos 8 tools antigas).
- Verificar que cada conexão é tipo `ai_tool`.

- [ ] **Step 9.7: Save workflow**

Click em "Save" no editor n8n (Cmd+S ou botão).

Expected: salva como nova versão DRAFT (n8n 2.x versionamento).

- [ ] **Step 9.8: Publish workflow**

Via MCP n8n:

```
mcp__n8n__publish_workflow workflowId=PmCMHTaTi07XGgWh
```

OU via UI: clicar no botão "Publish" / "Activate" do workflow.

Expected: `activeVersionId` do workflow muda pro versionId recém-salvo. Confirmação visual no editor de que workflow tá ativo.

- [ ] **Step 9.9: Verificar via MCP que workflow tem 4 tools novas wired**

```
mcp__n8n__get_workflow_details workflowId=PmCMHTaTi07XGgWh
```

Inspecionar output (via jq) pra confirmar:
- 4 nodes novos com nomes corretos: `dados_coletados`, `enviar_orcamento_tatuador`, `enviar_objecao_tatuador`, `consultar_proposta_tatuador`
- 4 connections `ai_tool` apontando pra `Seu Agente`

Comando concreto pós-MCP call:
```bash
FILE=<path to result>
jq '.workflow.nodes | map(select(.type=="n8n-nodes-base.httpRequestTool") | .name)' "$FILE"
```

Expected: array contém `["calcular_orcamento", "acionar_handoff", "consultar_horarios_livres", "reservar_horario", "gerar_link_sinal", "enviar_portfolio", "reagendar_horario", "consultar_preco_retoque", "dados_coletados", "enviar_orcamento_tatuador", "enviar_objecao_tatuador", "consultar_proposta_tatuador"]` (12 itens, 4 novos).

---

## Task 10: Smoke E2E + cleanup + atualizar Painel + commit final

**Pré-requisito:** Task 9 publish completou. Workflow ativo com 4 tools novas wired.

**Files:**
- Modify: `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Painel.md` (atualizar estado pós-merge)
- Modify: `~/.claude/projects/-Users-brazilianhustler/memory/Daily Notes/2026-05-05.md` (appender "parte N")

- [ ] **Step 10.1: Cenário E2E 1 — golden path Hustle Ink**

**Setup:** Leandro abre WhatsApp do número TESTE (não real cliente, ex: número Leandro pessoal ou amigo de confiança). Manda mensagem ao bot Hustle Ink:

```
Quero uma rosa de 10cm no antebraço
```

**Esperado em ~30s:**
- Bot responde pedindo info adicional (nome / data nasc / email)
- 3 chamadas a `dados_coletados` registradas em `tool_calls_log` (descricao_tattoo + tamanho_cm + local_corpo)

**Validação SQL:**

```sql
SELECT tool, sucesso, input->>'campo' AS campo, created_at
FROM tool_calls_log
WHERE tenant_id = '<TENANT_ID Hustle Ink>'
  AND created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC
LIMIT 10;
```

Expected:
- 3 rows com `tool='dados_coletados'`, `sucesso=true`, campos `descricao_tattoo`, `tamanho_cm`, `local_corpo`

```sql
SELECT id, estado_agente, dados_coletados, dados_cadastro
FROM conversas
WHERE tenant_id = '<TENANT_ID Hustle Ink>'
  AND telefone = '<NUMERO TESTE>';
```

Expected: 1 row com `estado_agente='coletando_cadastro'`, `dados_coletados={descricao_tattoo:"rosa",tamanho_cm:10,local_corpo:"antebraço"}`.

- [ ] **Step 10.2: Cenário E2E 2 — cadastro completo + orçamento**

**Setup:** Cliente teste responde:

```
Maria Silva, 12/03/1995, maria@gmail.com
```

**Esperado em ~30s:**
- Bot processa cadastro (3× `dados_coletados`)
- LLM dispara `enviar_orcamento_tatuador`
- Telegram do bot do tatuador (chat configurado em `tenants.tatuador_telegram_chat_id` do Hustle Ink) recebe mensagem com botões [Fechar valor / Recusar]

**Validação Telegram:** verificar visualmente que mensagem chegou.

**Validação SQL:**

```sql
SELECT id, estado_agente, orcid, dados_cadastro
FROM conversas
WHERE tenant_id = '<TENANT_ID Hustle Ink>'
  AND telefone = '<NUMERO TESTE>';
```

Expected:
- `estado_agente='aguardando_tatuador'`
- `orcid` preenchido (string `orc_xxxxxx`)
- `dados_cadastro={nome:"Maria Silva", data_nascimento:"1995-03-12", email:"maria@gmail.com", idade_anos:31}` (idade calculada)

```sql
SELECT tool, sucesso FROM tool_calls_log
WHERE tenant_id = '<TENANT_ID Hustle Ink>'
  AND created_at > NOW() - INTERVAL '10 minutes'
GROUP BY tool, sucesso ORDER BY tool;
```

Expected:
- `dados_coletados` `sucesso=true` × 6 (3 do cenário 1 + 3 cadastro)
- `enviar_orcamento_tatuador` `sucesso=true` × 1
- 100% dos calls com `sucesso=true`.

**Critério PASS:** 7/7 chamadas com `sucesso=true` em `tool_calls_log` + Telegram chegou + estado_agente final = `aguardando_tatuador`.

- [ ] **Step 10.3: Cleanup conversa teste**

Via MCP Supabase:

```sql
DELETE FROM conversas WHERE telefone = '<NUMERO TESTE>' AND tenant_id = '<TENANT_ID Hustle Ink>';
```

(Opcional) Apagar thread Telegram do bot do tatuador para o orcid de teste se tiver criado clutter.

- [ ] **Step 10.4: Atualizar Painel InkFlow**

Editar `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Painel.md`:

- Mover seção atual "Onde estamos agora" pra "Estado anterior" (mantém só current + 1 estado anterior; se já tem 2 estados, prepend o mais antigo no `[[InkFlow — Painel histórico]]`).
- Nova seção "Onde estamos agora (05/05/2026 — **wire-tools-coleta-v2 MERGED ✅ + smoke E2E 100%**)" com:
  - Resumo da feature (PR # mergeado, commits squash, fix-forward se houver)
  - Stats: tasks executadas, commits implementação, arquivos novos/modificados, testes adicionados (29), smoke backend 7/7, smoke E2E 7/7
  - Estado fundamental: `tool_calls_log` agora mostra `tool='dados_coletados'`/etc. — Bug P1 do backlog RESOLVIDO
  - Próximos passos (Dashboard agora destrava valor real, helper `markConversaFechada` PR #25 começa a disparar de verdade)

Atualizar `originSessionId` e `last_updated` no frontmatter.

Mover P1 "Tools Coleta v2 não chamados pelo bot" do backlog ativo (`InkFlow — Pendências (backlog).md`) pro histórico (`InkFlow — Backlog histórico (resolvidos).md`).

- [ ] **Step 10.5: Atualizar Daily Note 2026-05-05**

Editar `~/.claude/projects/-Users-brazilianhustler/memory/Daily Notes/2026-05-05.md` adicionando seção:

```markdown
---

# 2026-05-05 — sessão tarde wire-tools-coleta-v2 (parte 3)

## O que construí hoje (parte 3) — tarde

[descrição: investigação do P1 "tools Coleta v2 não chamados", brainstorm com 3 Q&A, spec + plano + execução, deploy backend + smoke 7/7, n8n wire 4 nodes + smoke E2E 7/7. PR # mergeado.]

## Como o Claude me ajudou (parte 3)
...

## O que aprendi (parte 3)
...

## Código que escrevi — entendi o que fiz? (parte 3)
...
```

- [ ] **Step 10.6: Memory updates persistem via hook automático**

Memory dir tem repo git separado em `~/.claude/projects/-Users-brazilianhustler/memory/`. Atualizações de Painel + Daily Notes feitas em Steps 10.4-10.5 são commitadas e pushadas automaticamente pelo hook `sync-git-repos.sh` (Stop hook do Claude Code). Não precisa commit manual no inkflow-saas.

Verificar opcionalmente:

```bash
cd ~/.claude/projects/-Users-brazilianhustler/memory/ && git log -2 --oneline
```

Expected: commits recentes do hook refletindo Painel + Daily Note.

---

## Critérios de DOD (Definition of Done)

- [ ] Branch `feat/wire-tools-coleta-v2` ativa, ahead-of-origin = 0 (tudo pushed)
- [ ] Helper `_lib/conversas-upsert.js` + 7 tests passing
- [ ] 4 tools refatoradas + 22 tests passing (9+5+5+3)
- [ ] Bateria completa `bash scripts/test-prompts.sh` 100% verde
- [ ] PR aberto, mergeado em main, CF Pages deploy SUCCESS
- [ ] Smoke backend 7/7 PASS (1 auth + 2 validation + 4 endpoint paths)
- [ ] Cleanup smoke backend: zero rows teste em `conversas`
- [ ] 4 nodes httpRequestTool adicionados no n8n workflow ativo + 4 connections ai_tool ao Agent
- [ ] `publish_workflow` executado, activeVersionId atualizado
- [ ] Smoke E2E WhatsApp: 2 cenários PASS (golden path coleta tattoo + cadastro completo + orçamento + Telegram)
- [ ] `tool_calls_log` últimas 1h: ≥7 rows `tool='dados_coletados'` ou `'enviar_orcamento_tatuador'` com `sucesso=true`
- [ ] Cleanup E2E: conversa teste deletada
- [ ] Painel InkFlow atualizado refletindo P1 RESOLVIDO
- [ ] Daily Note 2026-05-05 com seção "parte 3"
- [ ] Plano committado em `docs/superpowers/plans/`

## Out of scope (decisões conscientes — não fazer agora)

- Refator de `acionar-handoff.js` pra usar helper compartilhado (Q1 lock-in)
- Soft-delete de conversa órfã (auditor futuro)
- Dedup de `refs_imagens` em retry (mantém append behavior)
- Concurrência fina em PATCH JSON merge (Postgres serializa, race <100ms aceito)
- Versionamento do workflow n8n em git (manual UI sem audit trail aceito)
- Refinamento de prompts Coleta (deferido pra logs reais de tenants pagantes)

## References

- Spec: `docs/superpowers/specs/2026-05-05-wire-tools-coleta-v2-bot-design.md`
- Workflow n8n: `MEU NOVO WORK - SAAS` (id `PmCMHTaTi07XGgWh`)
- Schema relevante: `conversas` UNIQUE `(tenant_id, telefone)`, defaults `estado='qualificando'` + `estado_agente='ativo'`
- Test runner: `bash scripts/test-prompts.sh` ou `node --test <path>`
- Memory anchors: `[[InkFlow — Pendências (backlog)]]` §"P1 — Tools Coleta v2 não chamados", `[[feedback_n8n_publish_apos_update]]`, `[[feedback_calibrar_subagent_driven]]`
