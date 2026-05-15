# Cutover total do n8n — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o código 100% livre de n8n como dependência viva — religar o webhook de onboarding pro pipeline code-first, endurecer o parser pro formato `@lid`, limpar variáveis/comentários mortos, remover endpoints órfãos e entregar o runbook de desligamento.

**Architecture:** Mudanças cirúrgicas em 2 arquivos de runtime (`evo-create-instance.js`, `evolution-parser.js`), uma varredura de limpeza em ~8 arquivos, remoção de código morto verificado por método multi-vetor, e 1 doc novo. O n8n continua de pé (ocioso) — o desligamento físico é um runbook entregue aqui, não executado aqui.

**Tech Stack:** Cloudflare Pages Functions (JS ES modules), Evolution API, `node:test` + `node:assert/strict` pra testes, npm.

**Spec:** `docs/superpowers/specs/2026-05-14-cutover-total-n8n-design.md`
**Branch:** `feat/cutover-total-n8n` (já criada e em uso — working tree limpo)

---

## Riscos sinalizados

- **Reuso de `AGENT_INTERNAL_BASE_URL` (Task 2):** se essa var estiver errada/ausente em prod, o webhook de tenants novos quebra. Mitigado pela trava D2 + teste C7. **O valor em prod deve ser confirmado antes do smoke** (CF Pages dashboard — hoje esperado `https://inkflow-saas.pages.dev`).
- **Remoção de código morto (Task 5):** risco de remover algo vivo. Mitigado pela verificação multi-vetor — só remove o que for confirmado órfão.
- **`@lid` (Task 1):** sem número WhatsApp Business real pra testar E2E agora — cobertura via teste unitário; validação real fica pro smoke.
- **Secrets (Task 7):** a verificação do webhook do tenant de teste usa credenciais Evolution. O script é rodado pelo Leandro via `! ` no terminal — o assistente não lê secrets em plaintext.
- **Sem migrations, sem breaking change de schema.** A tabela `n8n_chat_histories` permanece intacta (é nome de tabela, não dependência de n8n).

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `functions/_lib/evolution-parser.js` | Modificar | Adiciona tratamento de `@lid` (telefone via `remoteJidAlt`) |
| `tests/_lib/evolution-parser.test.mjs` | Modificar | 3 casos novos pro `@lid` |
| `functions/api/evo-create-instance.js` | Modificar | Webhook derivado de `AGENT_INTERNAL_BASE_URL` + `WEBHOOK_SECRET`; trava D2 |
| `tests/api/evo-create-instance.test.mjs` | Criar | Cobre montagem da URL do webhook + trava D2 |
| `.env.production.example` | Modificar | Remove vars `N8N_*` mortas |
| `functions/api/telegram/webhook.js` + ~6 arquivos | Modificar | Corrige comentários que descrevem n8n como dependência viva |
| `functions/api/kill-switch-detect.js`, `tools/prompt.js`, `tools/guardrails/pre.js`, `tools/guardrails/post.js` | Investigar / Remover | Endpoints que só o n8n chamava — remover os confirmados órfãos |
| `docs/canonical/runbooks/decommission-n8n.md` | Criar | Runbook do desligamento físico do n8n |
| `scripts/check-evo-webhook.sh` | Criar | Script pro Leandro verificar/re-apontar o webhook do tenant de teste |

---

## Task 1: Endurecer o parser pro formato `@lid` (C2 + C7-parser)

**Files:**
- Modify: `functions/_lib/evolution-parser.js:15-19`
- Test: `tests/_lib/evolution-parser.test.mjs`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `tests/_lib/evolution-parser.test.mjs` (depois da linha 116):

```javascript
test('parser: @lid com remoteJidAlt → extrai telefone de remoteJidAlt', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, key: {
    id: 'LID1', fromMe: false,
    remoteJid: '199283746500123@lid',
    remoteJidAlt: '5511988887777@s.whatsapp.net',
    addressingMode: 'lid',
  }}};
  const r = parseEvolutionPayload(body);
  assert.equal(r.ok, true);
  assert.equal(r.inbound.telefone, '5511988887777');
});

test('parser: @lid sem remoteJidAlt → skip no-telefone', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, key: {
    id: 'LID2', fromMe: false,
    remoteJid: '199283746500123@lid',
    addressingMode: 'lid',
  }}};
  assert.deepEqual(parseEvolutionPayload(body), { skip: 'no-telefone' });
});

test('parser: addressingMode ausente → comportamento atual intacto', () => {
  // remoteJid normal, sem addressingMode nem remoteJidAlt → usa remoteJid
  const r = parseEvolutionPayload(baseUpsert);
  assert.equal(r.ok, true);
  assert.equal(r.inbound.telefone, '5511999998888');
});
```

- [ ] **Step 2: Rodar pra confirmar que falham**

Run: `node --test tests/_lib/evolution-parser.test.mjs`
Expected: FAIL — `@lid com remoteJidAlt` falha (telefone extraído de `199283746500123@lid` em vez de `remoteJidAlt`). O caso `addressingMode ausente` já passa (comportamento atual).

- [ ] **Step 3: Implementar o tratamento de `@lid`**

Em `functions/_lib/evolution-parser.js`, substituir as linhas 15-19:

```javascript
  const remoteJid = String(key.remoteJid || '');
  if (remoteJid.includes('@g.us')) return { skip: 'group-msg' };

  const telefone = remoteJid.split('@')[0].replace(/\D/g, '');
  if (!telefone) return { skip: 'no-telefone' };
```

por:

```javascript
  const remoteJid = String(key.remoteJid || '');
  if (remoteJid.includes('@g.us')) return { skip: 'group-msg' };

  // @lid (numeros WhatsApp Business novos): key.remoteJid vem como <id>@lid
  // e o telefone real fica em key.remoteJidAlt. Fora desse caso, usa remoteJid.
  const isLid = key.addressingMode === 'lid' || remoteJid.endsWith('@lid');
  const jidParaTelefone = isLid ? String(key.remoteJidAlt || '') : remoteJid;

  const telefone = jidParaTelefone.split('@')[0].replace(/\D/g, '');
  if (!telefone) return { skip: 'no-telefone' };
```

- [ ] **Step 4: Rodar pra confirmar que passam**

Run: `node --test tests/_lib/evolution-parser.test.mjs`
Expected: PASS — todos os 15 testes verdes (12 antigos + 3 novos).

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/evolution-parser.js tests/_lib/evolution-parser.test.mjs
git commit -m "feat: parser trata formato @lid via remoteJidAlt (C2)"
```

---

## Task 2: Religar o webhook de onboarding pro pipeline code-first (C1 + C7-webhook + D2/D3)

**Files:**
- Create: `tests/api/evo-create-instance.test.mjs`
- Modify: `functions/api/evo-create-instance.js` (linhas 6, 30-38, 153, 162-176)

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/api/evo-create-instance.test.mjs`:

```javascript
// ── InkFlow — unit tests pra functions/api/evo-create-instance.js ──────────
// Spec: docs/superpowers/specs/2026-05-14-cutover-total-n8n-design.md (C1, C7, D2)
// Foco: o webhook da Evolution e montado a partir de AGENT_INTERNAL_BASE_URL
// + WEBHOOK_SECRET, e a trava D2 falha cedo (503) se faltar env var.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/evo-create-instance.js';

const BASE_ENV = {
  EVO_BASE_URL: 'https://evo.test',
  EVO_GLOBAL_KEY: 'global-key-123',
  AGENT_INTERNAL_BASE_URL: 'https://inkflow-saas.pages.dev',
  WEBHOOK_SECRET: 'webhook-secret-xyz',
};

function postRequest(body) {
  return new Request('https://inkflow.test/api/evo-create-instance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function withMockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}

test('evo-create-instance: falta AGENT_INTERNAL_BASE_URL → 503 (trava D2)', async () => {
  const env = { ...BASE_ENV, AGENT_INTERNAL_BASE_URL: undefined };
  const restore = withMockFetch(async () => { throw new Error('fetch nao deveria ser chamado'); });
  try {
    const res = await onRequest({ request: postRequest({ instanceName: 'inkflow_x', tenant_id: 't1' }), env });
    assert.equal(res.status, 503);
  } finally { restore(); }
});

test('evo-create-instance: falta WEBHOOK_SECRET → 503 (trava D2)', async () => {
  const env = { ...BASE_ENV, WEBHOOK_SECRET: undefined };
  const restore = withMockFetch(async () => { throw new Error('fetch nao deveria ser chamado'); });
  try {
    const res = await onRequest({ request: postRequest({ instanceName: 'inkflow_x', tenant_id: 't1' }), env });
    assert.equal(res.status, 503);
  } finally { restore(); }
});

test('evo-create-instance: webhook SET usa AGENT_INTERNAL_BASE_URL + WEBHOOK_SECRET', async () => {
  const calls = [];
  const restore = withMockFetch(async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes('/instance/fetchInstances')) {
      return new Response(JSON.stringify([{ hash: 'inst-key-abc' }]), { status: 200 });
    }
    if (String(url).includes('/webhook/set/')) {
      return new Response('{}', { status: 200 });
    }
    if (String(url).includes('/webhook/find/')) {
      return new Response(JSON.stringify({
        enabled: true, webhookBase64: true, events: ['MESSAGES_UPSERT'],
        url: 'https://inkflow-saas.pages.dev/api/whatsapp/inbound',
      }), { status: 200 });
    }
    if (String(url).includes('/settings/set/')) {
      return new Response('{}', { status: 200 });
    }
    throw new Error(`unmocked fetch: ${url}`);
  });
  try {
    const res = await onRequest({
      request: postRequest({ instanceName: 'inkflow_test_sub4', tenant_id: 't1' }),
      env: { ...BASE_ENV },
    });
    assert.equal(res.status, 200);
    const setCall = calls.find(c => c.url.includes('/webhook/set/'));
    assert.ok(setCall, 'webhook SET deve ter sido chamado');
    const body = JSON.parse(setCall.opts.body);
    // formato A (nested-short) e o primeiro tentado
    assert.equal(body.webhook.url, 'https://inkflow-saas.pages.dev/api/whatsapp/inbound');
    assert.equal(body.webhook.headers['x-webhook-secret'], 'webhook-secret-xyz');
  } finally { restore(); }
});
```

> Nota: `BASE_ENV` não define `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SERVICE_KEY`, então o gate de pagamento e o PATCH no Supabase são pulados — o teste foca só no caminho do webhook.

- [ ] **Step 2: Rodar pra confirmar que falha**

Run: `node --test tests/api/evo-create-instance.test.mjs`
Expected: FAIL — o teste `webhook SET usa AGENT_INTERNAL_BASE_URL` falha: o código atual lê `env.N8N_WEBHOOK_URL` (ausente em `BASE_ENV`), então a trava antiga retorna 503 em vez de 200.

- [ ] **Step 3: Religar o webhook em `evo-create-instance.js`**

**3a.** Substituir a linha 6:

```javascript
// [FIX] Bug #2A: Configura webhook n8n (server-side, removido do frontend)
```

por:

```javascript
// Configura o webhook da Evolution apontando pro pipeline code-first (/api/whatsapp/inbound)
```

**3b.** Substituir as linhas 30-38:

```javascript
  const EVO_BASE_URL    = env.EVO_BASE_URL;
  const N8N_WEBHOOK     = env.N8N_WEBHOOK_URL;
  const GLOBAL_KEY      = env.EVO_GLOBAL_KEY;
  const WEBHOOK_SECRET  = env.N8N_WEBHOOK_SECRET;

  if (!GLOBAL_KEY || !EVO_BASE_URL || !N8N_WEBHOOK) {
    console.error('evo-create-instance: env vars ausentes', { EVO_BASE_URL: !!EVO_BASE_URL, N8N_WEBHOOK: !!N8N_WEBHOOK, GLOBAL_KEY: !!GLOBAL_KEY });
    return json({ error: 'Configuração interna ausente' }, 503);
  }
```

por:

```javascript
  const EVO_BASE_URL    = env.EVO_BASE_URL;
  const GLOBAL_KEY      = env.EVO_GLOBAL_KEY;
  const AGENT_BASE_URL  = env.AGENT_INTERNAL_BASE_URL;
  const WEBHOOK_SECRET  = env.WEBHOOK_SECRET;
  // Webhook da Evolution aponta pro pipeline code-first desta aplicacao.
  const WEBHOOK_URL = AGENT_BASE_URL ? `${AGENT_BASE_URL}/api/whatsapp/inbound` : null;

  // Trava D2: nao cria instancia Evolution sem webhook valido (mesma intencao
  // protetora de antes — o alvo mudou de N8N_WEBHOOK_URL pra AGENT_INTERNAL_BASE_URL).
  if (!GLOBAL_KEY || !EVO_BASE_URL || !AGENT_BASE_URL || !WEBHOOK_SECRET) {
    console.error('evo-create-instance: env vars ausentes', { EVO_BASE_URL: !!EVO_BASE_URL, AGENT_INTERNAL_BASE_URL: !!AGENT_BASE_URL, WEBHOOK_SECRET: !!WEBHOOK_SECRET, GLOBAL_KEY: !!GLOBAL_KEY });
    return json({ error: 'Configuração interna ausente' }, 503);
  }
```

**3c.** Substituir a linha 153:

```javascript
  // ── [FIX webhook] Configurar webhook n8n com multi-format fallback ─────────
```

por:

```javascript
  // ── [FIX webhook] Configurar webhook da Evolution com multi-format fallback ─
```

**3d.** Substituir as linhas 162-176 (constante `secretHdr` + `WEBHOOK_FORMATS`):

```javascript
  const secretHdr = WEBHOOK_SECRET ? { 'x-webhook-secret': WEBHOOK_SECRET } : {};
  const WEBHOOK_FORMATS = [
    {
      label: 'A:nested-short',
      body: { webhook: { enabled: true, url: N8N_WEBHOOK, byEvents: false, base64: true, events: ['MESSAGES_UPSERT'], ...(WEBHOOK_SECRET ? { headers: secretHdr } : {}) } }
    },
    {
      label: 'B:flat-long',
      body: { enabled: true, url: N8N_WEBHOOK, webhookByEvents: false, webhookBase64: true, events: ['MESSAGES_UPSERT'], ...(WEBHOOK_SECRET ? { headers: secretHdr } : {}) }
    },
    {
      label: 'C:nested-long',
      body: { webhook: { enabled: true, url: N8N_WEBHOOK, webhookByEvents: false, webhookBase64: true, events: ['MESSAGES_UPSERT'], ...(WEBHOOK_SECRET ? { headers: secretHdr } : {}) } }
    },
  ];
```

por (o secret agora é garantido pela trava D2 — `secretHdr` é sempre populado; D3: a lógica dos 3 formatos é quirk da Evolution e permanece):

```javascript
  const secretHdr = { 'x-webhook-secret': WEBHOOK_SECRET };
  const WEBHOOK_FORMATS = [
    {
      label: 'A:nested-short',
      body: { webhook: { enabled: true, url: WEBHOOK_URL, byEvents: false, base64: true, events: ['MESSAGES_UPSERT'], headers: secretHdr } }
    },
    {
      label: 'B:flat-long',
      body: { enabled: true, url: WEBHOOK_URL, webhookByEvents: false, webhookBase64: true, events: ['MESSAGES_UPSERT'], headers: secretHdr }
    },
    {
      label: 'C:nested-long',
      body: { webhook: { enabled: true, url: WEBHOOK_URL, webhookByEvents: false, webhookBase64: true, events: ['MESSAGES_UPSERT'], headers: secretHdr } }
    },
  ];
```

- [ ] **Step 4: Rodar pra confirmar que passa**

Run: `node --test tests/api/evo-create-instance.test.mjs`
Expected: PASS — os 3 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add functions/api/evo-create-instance.js tests/api/evo-create-instance.test.mjs
git commit -m "feat: webhook de onboarding aponta pro pipeline code-first (C1, D2, D3)"
```

---

## Task 3: Remover variáveis `N8N_*` mortas do `.env.production.example` (C3-vars)

**Depende de:** Task 2 (o código não lê mais `N8N_WEBHOOK_URL`/`N8N_WEBHOOK_SECRET`).

**Files:**
- Modify: `.env.production.example:49-51`

- [ ] **Step 1: Confirmar que nenhum código ainda referencia as vars**

Run: `grep -rn "N8N_WEBHOOK_URL\|N8N_WEBHOOK_SECRET\|N8N_REENTRADA_WEBHOOK_URL" functions/ .env.production.example`
Expected: a única ocorrência em `functions/` deve ser o comentário desatualizado em `functions/api/telegram/webhook.js:18` (será corrigido na Task 4). Em `.env.production.example`, as 2 vars na seção n8n. Se aparecer qualquer outra referência em código executável, parar e investigar antes de continuar.

- [ ] **Step 2: Remover o bloco morto do `.env.production.example`**

Ler `.env.production.example` e remover estas 3 linhas (linhas 49-51):

```
# ── n8n (legacy webhook, removido em Sub-4.2) ────────────────────────────────
N8N_WEBHOOK_URL=
N8N_WEBHOOK_SECRET=
```

> `N8N_REENTRADA_WEBHOOK_URL` já não consta no arquivo — confirmar via grep do Step 1 (esperado: ausente). Se por acaso estiver presente, remover também.

- [ ] **Step 3: Verificar**

Run: `grep -n "N8N" .env.production.example`
Expected: sem saída (exit code 1).

- [ ] **Step 4: Commit**

```bash
git add .env.production.example
git commit -m "chore: remove vars N8N_* mortas do .env.production.example (C3)"
```

---

## Task 4: Corrigir comentários que descrevem o n8n como dependência viva (C3-comentários)

**Files:**
- Modify: `functions/api/telegram/webhook.js`
- Modify: `functions/_lib/guardrails.js`
- Modify: `functions/_lib/prompts/index.js`
- Modify: `functions/api/tools/acionar-handoff.js`
- Modify: `functions/api/tools/enviar-portfolio.js`
- Modify: `functions/api/cleanup-tenants.js`
- Modify: `functions/api/cron/expira-trial.js`

**Regra:** o comentário deve refletir a realidade code-first. Comentário que descreve **história** ("migrado do n8n", "herdado do n8n") **fica** — só sai/muda comentário que descreve o n8n como **caller/dependência ativa**. Reler a região de cada arquivo antes de editar (line numbers abaixo são da varredura `grep -rn "n8n" functions/`).

- [ ] **Step 1: `functions/api/telegram/webhook.js` (linhas 18-20)**

Substituir:

```javascript
// Reentrada do bot: chama webhook n8n configurado em env.N8N_REENTRADA_WEBHOOK_URL
// com payload { conversa_id, orcid, evento }. n8n carrega prompt atualizado
// via /api/tools/prompt e responde no chat do cliente via Evolution.
```

por:

```javascript
// Reentrada do bot: chama o endpoint code-first /api/telegram/reentrada via
// disparaReentrada(), que monta o prompt atualizado e responde no chat do
// cliente via Evolution. (Antes era um workflow n8n — migrado no Sub-4.x.)
```

- [ ] **Step 2: `functions/_lib/guardrails.js` (linhas ~4-5 e ~219-220)**

Ler as 4 linhas. Onde o comentário diz "chamado pelo n8n antes/depois do agente", trocar por "usado pelo pipeline code-first (whatsapp-pipeline.js) antes/depois do agente". Manter o resto do comentário intacto.

- [ ] **Step 3: `functions/_lib/prompts/index.js` (linhas ~9 e ~35)**

Ler as linhas. Onde diz "retorna null pro n8n curto-circuitar", trocar "n8n" por "o caller" (o pipeline code-first). O comportamento descrito (retornar null pra curto-circuitar) não muda.

- [ ] **Step 4: `functions/api/tools/acionar-handoff.js` (linhas ~6-7)**

Ler as linhas. O comentário "O workflow n8n deve checar conversas.estado" descreve um caller que não existe mais. Reescrever pra refletir que quem checa `conversas.estado` é o pipeline code-first, ou remover a linha se ela não agrega (a tool em si não muda).

- [ ] **Step 5: `functions/api/tools/enviar-portfolio.js` (linhas ~6-7)**

Ler as linhas. "o envio efetivo da midia cabe ao workflow n8n" → reescrever pra "o envio efetivo da mídia cabe ao caller (pipeline code-first)". A tool continua só retornando os links.

- [ ] **Step 6: `functions/api/cleanup-tenants.js` (linha ~23)**

Ler a linha. "Cron job externo (ex: n8n scheduled workflow, UptimeRobot, etc.)" → trocar o exemplo n8n: "Cron job externo (Cloudflare Worker cron / UptimeRobot, etc.)".

- [ ] **Step 7: `functions/api/cron/expira-trial.js` (linha ~2)**

Ler a linha. "Roda diariamente via trigger externo (UptimeRobot / n8n schedule)" → remover "n8n schedule": "Roda diariamente via trigger externo (Cloudflare Worker cron / UptimeRobot)".

> **Não tocar** em `functions/api/cron/monitor-whatsapp.js:2` e `functions/api/cron/reset-agendamentos.js:2` — "Migrado do n8n workflow ... em 2026-04-21" é história correta e permitida pelo critério de aceitação 2.

- [ ] **Step 8: Verificar a varredura**

Run: `grep -rn "n8n" functions/`
Expected: as únicas ocorrências restantes devem ser — (a) o nome de tabela `n8n_chat_histories` (em `whatsapp-pipeline.js`, `conversas/list.js`, `conversas/thread.js`, `whatsapp/inbound.js`); (b) comentários de história ("migrado do n8n", "herdado do n8n", "substitui o workflow n8n original" em `telegram/webhook.js`, os 2 crons, `telegram/reentrada.js`); (c) os 4 arquivos de código morto da Task 5 (ainda não removidos neste ponto). Revisar manualmente cada linha contra o critério 2 — nenhum comentário pode descrever o n8n como dependência viva.

- [ ] **Step 9: Commit**

```bash
git add functions/
git commit -m "docs: corrige comentarios que descreviam n8n como dependencia viva (C3)"
```

---

## Task 5: Investigar e remover código morto que só o n8n usava (C4 + D4)

**Files (candidatos a remoção):**
- `functions/api/kill-switch-detect.js`
- `functions/api/tools/prompt.js`
- `functions/api/tools/guardrails/pre.js`
- `functions/api/tools/guardrails/post.js`

- [ ] **Step 1: Verificação multi-vetor (método do PR #64)**

Rodar e analisar a saída de cada vetor:

```bash
# Vetor 1+2: imports estáticos/dinâmicos e grafo intra-dir
for f in kill-switch-detect "tools/prompt" "guardrails/pre" "guardrails/post"; do
  echo "=== refs a $f ==="
  grep -rn "$f" functions/ tests/ docs/ --include='*.js' --include='*.mjs' --include='*.json' --include='*.md'
done
# Vetor 3: barris (index.js que re-exporta)
grep -rn "export" functions/api/tools/guardrails/index.js 2>/dev/null
ls -la functions/api/tools/guardrails/
# Vetor 4: refs nao-JS (rotas, config)
cat functions/_routes.json 2>/dev/null
grep -rn "kill-switch\|tools/prompt\|guardrails/pre\|guardrails/post" . --include='*.json' --include='*.toml' --include='*.yml' --include='*.yaml' 2>/dev/null
# Vetor 5+7: entry points e chamadas internas via callTool
grep -rn "callTool" functions/
# Vetor 6: CI / testes que exercitam o codigo
ls tests/tools/ 2>/dev/null
grep -rln "kill-switch\|guardrails/pre\|guardrails/post\|tools/prompt" tests/ 2>/dev/null
```

Para **cada um dos 4 arquivos**, classificar como **ÓRFÃO CONFIRMADO** (zero referência viva em todos os vetores — só comentários ou strings descritivas) ou **VIVO** (alguma referência real). Anotar por quais vetores cada um foi verificado — esse resumo vai no corpo do PR.

> Contexto da exploração inicial (a re-confirmar nos vetores): nenhum dos 4 tem `callTool` apontando pra ele nem import estático. `simular-conversa.js` e `telegram/webhook.js` mencionam `guardrails/pre|post` e `tools/prompt` **só em comentário** (reuso de lógica de lib / descrição antiga), não como rota chamada. Se a verificação confirmar isso, os 4 são órfãos.

- [ ] **Step 2: Remover os órfãos confirmados**

Para cada arquivo classificado como ÓRFÃO CONFIRMADO no Step 1:

```bash
git rm functions/api/kill-switch-detect.js
git rm functions/api/tools/prompt.js
git rm functions/api/tools/guardrails/pre.js
git rm functions/api/tools/guardrails/post.js
```

(Rodar `git rm` só pros que foram confirmados órfãos. Se `functions/api/tools/guardrails/` ficar vazio depois, remover o diretório.) Se algum arquivo for classificado como VIVO, **não remover** — em vez disso, corrigir o comentário de n8n dele seguindo a regra da Task 4 e incluir nesse commit.

Se algum teste em `tests/tools/` exercitar exclusivamente um arquivo removido, remover o teste junto (`git rm`).

- [ ] **Step 3: Rodar a suíte pra confirmar que nada quebrou**

Run: `npm test`
Expected: PASS — suíte verde. Se algo quebrar, o arquivo removido não era órfão: restaurar (`git checkout -- <arquivo>`) e reclassificar como VIVO.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove endpoints orfaos que so o n8n chamava (C4, D4)

Verificado por: imports estaticos/dinamicos, grafo intra-dir, barris,
refs nao-JS (_routes.json/config), entry points, CI/testes, callTool.
Removidos: <listar arquivos>. Sobreviventes: <listar, se houver>."
```

---

## Task 6: Runbook do desligamento do n8n (C6)

**Files:**
- Create: `docs/canonical/runbooks/decommission-n8n.md`

- [ ] **Step 1: Criar o runbook**

Criar `docs/canonical/runbooks/decommission-n8n.md`:

```markdown
# Runbook — Desligamento do n8n

> **Status:** pronto pra execução manual, **aguardando autorização do Leandro**
> após validação por smoke do cutover (feature `feat/cutover-total-n8n`).
> Este runbook **não** é executado pela feature de cutover — só entregue por ela.

## Contexto

O código já está 100% livre de n8n como dependência viva (cutover de 2026-05-14).
O n8n segue de pé, ocioso, como rede de segurança / rollback. Este runbook desliga
ele fisicamente, na ordem segura.

- **Workflow:** `MEU NOVO WORK - SAAS` — id `PmCMHTaTi07XGgWh`, 98 nós, `active: true`
- **Webhook:** `https://n8n.inkflowbrasil.com/webhook/inkflow` (sem tráfego real)
- **Container:** VPS `root@104.207.145.47`
- **Env vars no CF Pages:** `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET` (prod + preview)

## Pré-requisito

Smoke do cutover validado em produção: mensagem real no `inkflow_test_sub4` chega
via `/api/whatsapp/inbound` e é respondida pelo bot.

## Passos (na ordem)

1. **Exportar o JSON do workflow pra arquivo morto versionado.**
   Exportar `MEU NOVO WORK - SAAS` (id `PmCMHTaTi07XGgWh`) e salvar em
   `docs/canonical/archive/n8n-workflow-PmCMHTaTi07XGgWh.json`. Commitar.

2. **Desativar o workflow no n8n** (`active: false`).
   Pela UI do n8n ou API. Confirmar que ficou inativo.

3. **Parar o container n8n na VPS** (`root@104.207.145.47`).
   `docker stop <container-n8n>` (confirmar nome do container antes).

4. **Remover as env vars do dashboard CF Pages.**
   Remover `N8N_WEBHOOK_URL` e `N8N_WEBHOOK_SECRET` dos environments
   **production e preview** do projeto InkFlow no Cloudflare Pages.

## Rollback

Se algo quebrar **antes do passo 3** (container ainda de pé):
re-ativar o workflow (`active: true`) e re-apontar o webhook da Evolution do
tenant afetado de volta pro n8n. Como o container nunca parou, o rollback é imediato.

Depois do passo 3, o rollback exige subir o container de novo antes de re-ativar.
```

- [ ] **Step 2: Verificar**

Run: `cat docs/canonical/runbooks/decommission-n8n.md`
Expected: o arquivo existe e contém os 4 passos + critério de rollback.

- [ ] **Step 3: Commit**

```bash
git add docs/canonical/runbooks/decommission-n8n.md
git commit -m "docs: runbook do desligamento do n8n (C6)"
```

---

## Task 7: Verificar (e re-apontar se preciso) o webhook do tenant de teste (C5)

**Files:**
- Create: `scripts/check-evo-webhook.sh`

> **Risco — secrets:** este script usa credenciais da Evolution API. O **Leandro** roda o script no terminal (via `! ./scripts/check-evo-webhook.sh`) — o assistente não lê nem manuseia os secrets em plaintext.

- [ ] **Step 1: Criar o script de verificação**

Criar `scripts/check-evo-webhook.sh`:

```bash
#!/usr/bin/env bash
# Verifica o webhook atual do tenant de teste inkflow_test_sub4 na Evolution API.
# Spec C5: cutover total do n8n.
#
# Uso: definir EVO_BASE_URL e EVO_GLOBAL_KEY no ambiente (ou exportar antes),
#   depois rodar:  ./scripts/check-evo-webhook.sh
set -euo pipefail

: "${EVO_BASE_URL:?defina EVO_BASE_URL}"
: "${EVO_GLOBAL_KEY:?defina EVO_GLOBAL_KEY}"
INSTANCE="${1:-inkflow_test_sub4}"

echo "→ GET ${EVO_BASE_URL}/webhook/find/${INSTANCE}"
curl -sS -H "apikey: ${EVO_GLOBAL_KEY}" \
  "${EVO_BASE_URL}/webhook/find/${INSTANCE}" | python3 -m json.tool
```

```bash
chmod +x scripts/check-evo-webhook.sh
```

- [ ] **Step 2: Leandro roda o script e cola a saída**

Pedir pro Leandro rodar (no terminal, com as credenciais Evolution disponíveis):

```
! EVO_BASE_URL=<...> EVO_GLOBAL_KEY=<...> ./scripts/check-evo-webhook.sh
```

Analisar o campo `url` retornado:
- **Se já aponta pra `/api/whatsapp/inbound`** (patch manual de 13/05): só registrar a verificação — nenhuma ação. Pular pro Step 4.
- **Se ainda aponta pro n8n** (`n8n.inkflowbrasil.com`): seguir o Step 3.

- [ ] **Step 3: (Condicional) Re-apontar o webhook pro pipeline code-first**

Só se o Step 2 mostrar o webhook apontando pro n8n. Pedir pro Leandro rodar:

```
! curl -sS -X POST \
    -H "apikey: $EVO_GLOBAL_KEY" -H "Content-Type: application/json" \
    -d '{"webhook":{"enabled":true,"url":"<AGENT_INTERNAL_BASE_URL>/api/whatsapp/inbound","byEvents":false,"base64":true,"events":["MESSAGES_UPSERT"],"headers":{"x-webhook-secret":"<WEBHOOK_SECRET>"}}}' \
    "$EVO_BASE_URL/webhook/set/inkflow_test_sub4"
```

Depois rodar `./scripts/check-evo-webhook.sh` de novo pra confirmar que `url` mudou e `enabled: true`.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-evo-webhook.sh
git commit -m "chore: script de verificacao do webhook Evolution do tenant de teste (C5)"
```

Anotar o resultado da verificação (estado encontrado + ação tomada ou não) pro corpo do PR.

---

## Task 8: Verificação final + fechamento (critérios de aceitação + Obsidian)

**Files:**
- Vault Obsidian (fora do repo — sincronizado pelo hook de git)

- [ ] **Step 1: Suíte de testes completa verde**

Run: `npm test`
Expected: PASS — toda a suíte verde, incluindo os casos novos de `@lid` (Task 1) e de `evo-create-instance` (Task 2).

- [ ] **Step 2: Critério 1 e 2 — grep final de n8n**

Run: `grep -ri "n8n" functions/ .env.production.example`
Expected — revisar manualmente cada linha. Permitido: nome de tabela `n8n_chat_histories`; comentários de história ("migrado do n8n", "herdado do n8n", "substitui o workflow n8n original"). **Proibido:** qualquer comentário descrevendo n8n como dependência viva, qualquer `N8N_WEBHOOK_URL`/`N8N_WEBHOOK_SECRET`/`N8N_REENTRADA_WEBHOOK_URL`. Se algo proibido aparecer, voltar pra Task 3/4 e corrigir.

- [ ] **Step 3: Conferir os critérios de aceitação restantes**

Confirmar, um a um, contra o spec (`docs/superpowers/specs/2026-05-14-cutover-total-n8n-design.md`, seção "Critérios de aceitação"):
- (3) `evo-create-instance.js` configura o webhook pra `/api/whatsapp/inbound` — coberto pelo teste da Task 2.
- (4) parser trata `@lid` — coberto pela Task 1.
- (5) endpoints órfãos removidos / sobreviventes com comentário corrigido — Task 5.
- (6) webhook do `inkflow_test_sub4` verificado — Task 7.
- (7) `docs/canonical/runbooks/decommission-n8n.md` existe e completo — Task 6.
- (8) suíte verde — Step 1.

- [ ] **Step 4: Atualizar o Obsidian**

Seguindo a convenção do vault ([[feedback_editar_notas_obsidian_direto]] + [[feedback_atualizar_painel_e_mapa_geral_sempre]]):
- Criar a nota-âncora do novo runbook no vault, no mesmo padrão de `[[InkFlow — Como publicar]]` (que ancora `docs/canonical/runbooks/deploy.md`) — ex.: `InkFlow — Runbook decommission n8n`, apontando pra `docs/canonical/runbooks/decommission-n8n.md` no commit desta feature.
- Atualizar `[[InkFlow — Painel]]`: registrar o cutover total do n8n como estado atual.
- Atualizar `[[InkFlow — Mapa geral]]`: adicionar o link pra nota-âncora do runbook novo.
- Adicionar o pointer da nota-âncora no `MEMORY.md` (uma linha).

> As edições do vault são commitadas automaticamente pelo hook `sync-git-repos.sh` (SessionStart/Stop) — não precisa de `git commit` manual aqui.

- [ ] **Step 5: Fechar — opções de integração**

Suíte verde + todos os critérios conferidos. Invocar a skill `superpowers:finishing-a-development-branch` pra decidir entre merge / PR / cleanup. O corpo do PR deve incluir: o resumo da verificação multi-vetor da Task 5 (quais arquivos, quais vetores) e o resultado da verificação do webhook do tenant da Task 7.

---

## Self-Review (feita pelo autor do plano)

**Cobertura do spec:** C1→Task 2 · C2→Task 1 · C3→Tasks 3+4 · C4→Task 5 · C5→Task 7 · C6→Task 6 · C7→Tasks 1+2 (testes embutidos via TDD) · D1/D2/D3→Task 2 · D4→Task 5. Critérios de aceitação 1-8→Task 8. Não-objetivos (desativar workflow / parar container / remover env vars do CF) ficam no runbook da Task 6, não executados. ✅ Sem lacunas.

**Riscos sinalizados:** reuso de `AGENT_INTERNAL_BASE_URL`, remoção de código morto, `@lid` sem teste E2E, secrets na Task 7, ausência de migrations — todos no bloco "Riscos sinalizados". ✅

**Ordem de dependências:** Task 3 depende da Task 2 (sinalizado explicitamente). Demais tasks são independentes; Task 8 (verificação final) por último. ✅ < 15 passos (8 tasks).

**Consistência de tipos/nomes:** `WEBHOOK_URL`/`WEBHOOK_SECRET`/`AGENT_BASE_URL` usados consistentemente entre os steps da Task 2; o teste da Task 2 espera exatamente `body.webhook.url` e `body.webhook.headers['x-webhook-secret']` (formato A nested-short), que é o que o código produz. ✅
