---
title: Wire das 4 tools Modo Coleta v2 ao Agent n8n + self-heal de conversa
slug: wire-tools-coleta-v2-bot
date: 2026-05-05
status: ⚠️ CONSUMIDO — implementado via PR #27 (mergeado 2026-05-05) — arquitetura pré-pivot multi-agent
branch: feat/wire-tools-coleta-v2
related:
  - 2026-04-22-modo-coleta-design.md
  - 2026-05-02-modo-coleta-v2-principal.md
last_updated: 2026-05-08
---

# Wire das 4 tools Modo Coleta v2 ao Agent n8n + self-heal de conversa  ⚠️ HISTÓRICO

> **Status (2026-05-08):** este spec descreve trabalho **mergeado em prod via PR #27** (`0be0ec7`) em 2026-05-05. As 4 tools Coleta v2 foram wired ao Agent n8n + helper `ensureConversa` deployado.
>
> **Mas:** após smoke E2E real revelar bugs estruturais (LLM imita pseudo-código dos few-shots), a arquitetura n8n-mono-agent foi **pivotada** em 2026-05-07 (auditoria) pra multi-agent via OpenAI Agents SDK em CF Workers (PR #52 OPEN). O wire descrito aqui é da arquitetura LEGADA — funcional em prod hoje, mas será substituído pelo router CF Workers que chama os endpoints diretamente sem passar pelo n8n.
>
> **Mantido como referência histórica.** Princípios técnicos (self-heal via UPSERT idempotente, contrato `(tenant_id, telefone)`) podem ser absorvidos pelo refator multi-agent.

## Contexto

O Modo Coleta v2 (PRs #19/#20, mergeados 03/05) deployou em prod:
- 4 endpoints CF Pages (`/api/tools/dados-coletados`, `enviar-orcamento-tatuador`, `enviar-objecao-tatuador`, `consultar-proposta-tatuador`)
- Schema `conversas` com `dados_coletados`/`dados_cadastro` JSONB + enum `estado_agente` expandido
- Prompts Coleta refatorados (`functions/_lib/prompts/coleta/{tattoo,cadastro,proposta}/`) instruindo o LLM a chamar essas tools

**Mas** o workflow n8n `MEU NOVO WORK - SAAS` (id `PmCMHTaTi07XGgWh`) tem o Agent node `Seu Agente` com 8 tools antigas wired (`calcular_orcamento`, `acionar_handoff`, `consultar_horarios_livres`, `reservar_horario`, `gerar_link_sinal`, `enviar_portfolio`, `reagendar_horario`, `consultar_preco_retoque`) e **0 das 4 tools Coleta v2**.

**Sintoma observável:** `tool_calls_log` últimas 48h tem 100% das entries com `tool='prompt'` (apenas o endpoint que carrega config inicial). Zero chamadas a `dados_coletados`/`enviar_orcamento_tatuador`/etc. Bot Hustle Ink responde mas não persiste estruturadamente; tabela `conversas` fica vazia mesmo com 8 mensagens em `n8n_chat_histories`. Resultado: KPIs do Dashboard (PR #26) ficam 0, helper `markConversaFechada` (PR #25) nunca dispara.

**Bug latente descoberto durante investigação:** mesmo se as 4 tools fossem wired, primeira chamada falharia. As 3 outras tools (não-`dados_coletados`) exigem `conversa_id` como input principal, mas `Get a row` pré-Agent busca em `dados_cliente` (NÃO em `conversas`) — não há fonte de `conversa_id` no contexto n8n. E nenhum endpoint cria row inicial em `conversas` no path Coleta (única exceção é `acionar-handoff.js` no path handoff).

**Caminho A escolhido** entre 3 alternativas (B = tool nova "iniciar_conversa"; C = pre-create node n8n upstream do Agent). Caminho A: tools self-heal — `dados_coletados` cria a row na primeira chamada via UPSERT idempotente; outras 3 fazem SELECT puro e retornam 404 se conversa não existe (telegrafa bug em vez de mascarar).

## Decisões de design (locked-in via Q1-Q3)

| Q | Decisão | Razão |
|---|---|---|
| Q1 | Helper novo em `functions/_lib/conversas-upsert.js`, dedicado às 4 Coleta tools. `acionar-handoff.js` permanece com sua lógica inline. | Zero risco de regressão em handoff (PR mergeado em prod estável há semanas). 2 patterns coexistem temporariamente; consolidamos quando 3º caller surgir. |
| Q2 | Apenas `dados_coletados` faz upsert. Outras 3 retornam 404 se conversa não existe. | As 3 outras leem `dados_coletados`/`valor_proposto`/`orcid` pra produzir output. Conversa vazia produziria Telegrams sem sentido pro tatuador. 404 surface bug em vez de mascarar. |
| Q3 | Split: PR backend primeiro (CF Pages) → smoke isolado via curl → depois n8n via UI. | 80% do risco mora no backend (helper + 4 tools refactor). Isola onde bugs mais provavelmente moram. n8n change é trivial (4 nodes + 4 connections) — UI manual é mais rápido que regenerar 168k chars de workflow code. |

**Refinamentos pós-review meticulosa (R1-R3):**
- R1: as 3 outras tools (`enviar-orcamento-tatuador`, `enviar-objecao-tatuador`, `consultar-proposta-tatuador`) precisam mudar contrato de `(conversa_id)` → `(tenant_id, telefone)` por consistência com as 8 tools antigas e por necessidade técnica (n8n não tem fonte de `conversa_id`).
- R2: em `dados-coletados.js`, `conversa_id` removido completamente do contrato (não "ignorado").
- R3: test paths corretos são `tests/_lib/*.test.mjs` e `tests/tools/*.test.mjs` (não `.js`).

## Section 1 — Arquitetura geral

```
                      ┌─────────────────────────────────────┐
                      │  WhatsApp cliente                   │
                      └──────────────┬──────────────────────┘
                                     │ msg
                      ┌──────────────▼──────────────────────┐
                      │  Evolution API webhook → n8n        │
                      └──────────────┬──────────────────────┘
                                     │
                      ┌──────────────▼──────────────────────┐
                      │  Agent node "Seu Agente" (Langchain) │
                      │  ────────────────────────────────── │
                      │  Tools wired:                       │
                      │   • 8 antigas (já em prod)          │
                      │   • [NOVO] dados_coletados          │
                      │   • [NOVO] enviar_orcamento_tatuador│
                      │   • [NOVO] enviar_objecao_tatuador  │
                      │   • [NOVO] consultar_proposta_tatuador│
                      └──────────────┬──────────────────────┘
                                     │ httpRequestTool
                                     │ POST /api/tools/{nome}
                                     │ body: {tenant_id, telefone, ...$fromAI}
                      ┌──────────────▼──────────────────────┐
                      │  CF Pages — functions/api/tools/    │
                      │  dados-coletados.js  ─┐             │
                      │  enviar-orcamento-... │ usa          │
                      │  enviar-objecao-...   │ ensureConversa
                      │  consultar-proposta-..│ (só dados_col)│
                      │                       ▼             │
                      │  functions/_lib/conversas-upsert.js │ ← NOVO
                      │   ↓                                 │
                      │  Supabase: conversas (UNIQUE        │
                      │  tenant_id+telefone — upsert nativo)│
                      └─────────────────────────────────────┘
```

**Mudança em 2 dimensões:**

1. **Backend (CF Pages, Etapa 1 do split)**:
   - Helper novo `_lib/conversas-upsert.js` com função `ensureConversa()`.
   - `dados-coletados.js` reescrita: contrato `{tenant_id, telefone, campo, valor}`, usa `ensureConversa()` no início.
   - `enviar-orcamento-tatuador.js`, `enviar-objecao-tatuador.js`, `consultar-proposta-tatuador.js` reescritas: contrato `(tenant_id, telefone)` substitui `(conversa_id)`. SELECT por par; 404 se conversa não existe.

2. **n8n workflow (Etapa 2 do split)**:
   - 4 nodes httpRequestTool novos com body templates injetando `tenant_id` + `telefone` do contexto + params via `$fromAI`.
   - 4 connections `ai_tool` ao `Seu Agente`.
   - Workflow republicado via `publish_workflow`.

**NÃO muda:**
- `acionar-handoff.js` (lógica inline mantida; PR estável em prod).
- 8 tools antigas wired no Agent.
- Prompts Coleta v2 (`functions/_lib/prompts/coleta/`) — instruções LLM já corretas.
- Schema `conversas` — UNIQUE constraint suficiente.
- `_tool-helpers.js` — reuso de `withTool`, `supaFetch`, `tool_calls_log`.

## Section 2 — Componentes & contratos

### 2.1 Novo: `functions/_lib/conversas-upsert.js`

**Responsabilidade única:** garantir que existe row em `conversas` pra `(tenant_id, telefone)`. Cria com defaults se não existe; retorna existente se existe.

**Assinatura:**

```js
import { supaFetch } from '../api/tools/_tool-helpers.js';

/**
 * Upsert idempotente em conversas via PostgREST merge-duplicates.
 * @param {object} env
 * @param {object} args
 * @param {string} args.tenant_id - UUID do tenant
 * @param {string} args.telefone - número normalizado
 * @param {object} [args.defaultsOnInsert] - campos a popular se for INSERT (ignorados se row já existe)
 * @returns {Promise<{ok: true, id: string, criado: boolean, row: object} | {ok: false, reason: string, status?: number}>}
 */
export async function ensureConversa(env, { tenant_id, telefone, defaultsOnInsert = {} }) {
  if (!tenant_id) return { ok: false, reason: 'tenant_id-obrigatorio' };
  if (!telefone)  return { ok: false, reason: 'telefone-obrigatorio' };

  const body = JSON.stringify({
    tenant_id,
    telefone,
    ...defaultsOnInsert,
  });

  // PostgREST upsert nativo via merge-duplicates + on_conflict.
  // Schema tem UNIQUE(tenant_id, telefone) — conflito vira no-op no row existente.
  const r = await supaFetch(env, '/rest/v1/conversas?on_conflict=tenant_id,telefone', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body,
  });

  if (!r.ok) {
    return { ok: false, reason: 'upsert-falhou', status: r.status };
  }

  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, reason: 'sem-row-retornada' };
  }

  const row = rows[0];
  // criado=true sse created_at e updated_at são iguais (acabou de nascer).
  // Heurística: diferença < 100ms = recém-criada.
  const created = new Date(row.created_at).getTime();
  const updated = new Date(row.updated_at).getTime();
  const criado = Math.abs(updated - created) < 100;

  return { ok: true, id: row.id, criado, row };
}
```

**Notas de implementação:**
- `merge-duplicates` semântica PostgREST: na conflita por UNIQUE, faz merge entre row existente e payload — mas só atualiza colunas presentes no payload. Se `defaultsOnInsert: {estado_agente: 'coletando_tattoo'}` e a row já tem `estado_agente='aguardando_tatuador'`, o merge vai sobrescrever pra 'coletando_tattoo'. **Isso é problema** — defaults só devem aplicar em INSERT, não em UPDATE.
- **Solução:** o helper deve fazer 2-step: tentar INSERT primeiro com `Prefer: resolution=ignore-duplicates`; se 0 rows retornadas (conflito), faz SELECT pra buscar a existente. Defaults só aplicam no path INSERT.

**Assinatura final corrigida (após ajuste):**

```js
export async function ensureConversa(env, { tenant_id, telefone, defaultsOnInsert = {} }) {
  if (!tenant_id) return { ok: false, reason: 'tenant_id-obrigatorio' };
  if (!telefone)  return { ok: false, reason: 'telefone-obrigatorio' };

  // Try INSERT com ignore-duplicates: cria se não existe, no-op se existe.
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

Defaults só aplicam em INSERT efetivo (path `criado=true`). Em conflito (row existente), retorna a row intacta.

**Observabilidade:** o helper não loga diretamente. O `withTool` wrapper do caller já loga via `tool_calls_log`.

### 2.2 Modificado: `functions/api/tools/dados-coletados.js`

**Mudança no contrato de input (R2):**
- **Antes:** `{ conversa_id, campo, valor, tenant_id?, telefone? }` (tenant_id/telefone ignorados; conversa_id obrigatório)
- **Depois:** `{ tenant_id, telefone, campo, valor }` (conversa_id removido completamente)

**Mudança no fluxo:**

```js
import { ensureConversa } from '../../_lib/conversas-upsert.js';

async function handle({ env, input }) {
  const { tenant_id, telefone, campo, valor } = input || {};

  // 1. Validação de input ANTES de qualquer side-effect
  if (!tenant_id) return { status: 400, body: { ok: false, error: 'tenant_id obrigatorio' } };
  if (!telefone)  return { status: 400, body: { ok: false, error: 'telefone obrigatorio' } };
  if (!campo)     return { status: 400, body: { ok: false, error: 'campo obrigatorio' } };

  // 2. Validação de campo (∈ CAMPOS_TATTOO ∪ CAMPOS_CADASTRO)
  const isCadastro = CAMPOS_CADASTRO.includes(campo);
  const isTattoo   = CAMPOS_TATTOO.includes(campo);
  if (!isCadastro && !isTattoo) {
    return { status: 400, body: { ok: false, error: `campo invalido: ${campo}` } };
  }

  // 3. Validação especifica do valor (data_nascimento format, tamanho_cm range, etc.)
  // [lógica atual mantida — só executa se passou validações 1+2]
  // ... ANTES de criar conversa

  // 4. Garantir conversa via upsert idempotente
  const conv = await ensureConversa(env, {
    tenant_id,
    telefone,
    defaultsOnInsert: { estado_agente: 'coletando_tattoo' },
  });
  if (!conv.ok) {
    return { status: 500, body: { ok: false, error: 'upsert-falhou', detail: { reason: conv.reason, status: conv.status } } };
  }

  // 5. Aplicar mutação de campo (lógica atual mantida)
  // [PATCH em conversas?id=eq.{conv.id} com dados_coletados/dados_cadastro merge]
  // [transição de estado se 3 OBR completos]

  return { status: 200, body: { ok: true, campo, valor: ..., conversa_id: conv.id, ...etc } };
}
```

**O que muda concretamente em `dados-coletados.js`:**
- Remove `conversa_id` do destructuring de `input`
- Adiciona destructuring de `tenant_id`, `telefone`
- Adiciona validação 400 pra ausência de tenant_id/telefone
- Substitui chamada inicial `carregarConversa(env, conversa_id)` por `ensureConversa(env, {tenant_id, telefone, defaultsOnInsert})`
- Usa `conv.row` retornado pelo helper como base pra mutação (em vez do row carregado por `carregarConversa`)
- PATCH continua usando `conv.id`
- Response inclui `conversa_id` (id da row retornado pelo helper)

**O que NÃO muda:**
- Lógica de validação por campo (data_nascimento, idade<18, tamanho_cm range, refs_imagens append, email, nome)
- Transição de estado (3 OBR completos → `coletando_cadastro`)
- Constantes `CAMPOS_TATTOO`, `CAMPOS_CADASTRO`, `OBR_TATTOO`
- Funções `normalizarData`, `calcularIdade` (com seus exports pra teste)

### 2.3 Modificado: `functions/api/tools/enviar-orcamento-tatuador.js`

**Mudança no contrato de input (R1):**
- **Antes:** `{ conversa_id, tenant_id?, telefone? }` (conversa_id obrigatório)
- **Depois:** `{ tenant_id, telefone }` (conversa_id removido)

**Mudança no fluxo:**

```js
async function handle({ env, input }) {
  const { tenant_id, telefone } = input || {};
  if (!tenant_id) return { status: 400, body: { ok: false, error: 'tenant_id obrigatorio' } };
  if (!telefone)  return { status: 400, body: { ok: false, error: 'telefone obrigatorio' } };

  // SELECT por (tenant_id, telefone) substitui carregarConversaComTenant(conversa_id)
  const conv = await carregarConversaPorPar(env, tenant_id, telefone);
  if (!conv) return { status: 404, body: { ok: false, error: 'conversa-nao-encontrada' } };

  // [resto da lógica intacta: tenant.tatuador_telegram_chat_id check,
  //  conv.orcid idempotência check, validação 5 OBR, gerarOrcid, PATCH,
  //  enviarTelegram, rollback em caso de Telegram error]
}

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

**O que muda:**
- Input destructuring (conversa_id → tenant_id+telefone)
- Validações 400 (mensagens correspondentes)
- `carregarConversaComTenant(conversa_id)` → `carregarConversaPorPar(tenant_id, telefone)` (filtro por par)
- PATCHs internos passam a filtrar por `id=eq.{conv.id}` igual antes (conv.id vem do SELECT)

**O que NÃO muda:**
- Idempotência via orcid (linhas 130-142 do original)
- Validação 5 OBR (descricao_tattoo, tamanho_cm, local_corpo, nome, data_nascimento)
- Pattern reservar-antes-de-Telegram + rollback
- `gerarOrcid`, `montarTextoOrcamento`, `inlineKeyboard`, `enviarTelegram` funções helper
- Exports pra teste

### 2.4 Modificado: `functions/api/tools/enviar-objecao-tatuador.js`

**Mudança no contrato de input (R1):**
- **Antes:** `{ conversa_id, valor_pedido_cliente, tenant_id?, telefone? }`
- **Depois:** `{ tenant_id, telefone, valor_pedido_cliente }`

**Mudança no fluxo:**

```js
async function handle({ env, input }) {
  const { tenant_id, telefone, valor_pedido_cliente } = input || {};
  if (!tenant_id) return { status: 400, body: { ok: false, error: 'tenant_id obrigatorio' } };
  if (!telefone)  return { status: 400, body: { ok: false, error: 'telefone obrigatorio' } };
  if (valor_pedido_cliente === undefined || valor_pedido_cliente === null) {
    return { status: 400, body: { ok: false, error: 'valor_pedido_cliente obrigatorio' } };
  }
  // [validação numérica de valor_pedido_cliente intacta]

  const conv = await carregarConversaPorPar(env, tenant_id, telefone);
  if (!conv) return { status: 404, body: { ok: false, error: 'conversa-nao-encontrada' } };

  // [resto da lógica intacta: valor_proposto/orcid/tatuador_telegram_chat_id checks,
  //  PATCH valor_pedido_cliente, enviarTelegram com keyboard]
}

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

**O que NÃO muda:** validações de valor_proposto/orcid/tatuador_telegram_chat_id, cálculo de keyboard com callback_data, mensagem Telegram, exports pra teste.

### 2.5 Modificado: `functions/api/tools/consultar-proposta-tatuador.js`

**Mudança no contrato de input (R1):**
- **Antes:** `{ conversa_id, tenant_id?, telefone? }`
- **Depois:** `{ tenant_id, telefone }`

**Mudança no fluxo:**

```js
async function handle({ env, input }) {
  const { tenant_id, telefone } = input || {};
  if (!tenant_id) return { status: 400, body: { ok: false, error: 'tenant_id obrigatorio' } };
  if (!telefone)  return { status: 400, body: { ok: false, error: 'telefone obrigatorio' } };

  const conv = await carregarConversaPorPar(env, tenant_id, telefone);
  if (!conv) return { status: 404, body: { ok: false, error: 'conversa-nao-encontrada' } };

  // [lógica de derivação de decisao_desconto/mensagem_tatuador/recusou_pedido intacta]
  // [response shape mantida]
}

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

### 2.6 n8n workflow — 4 nodes novos no `Seu Agente`

Cada node `httpRequestTool` configurado seguindo padrão dos 8 nodes existentes (`calcular_orcamento`, `acionar_handoff`):

**`dados_coletados`:**

```json
{
  "toolDescription": "Persiste 1 campo coletado do cliente (tattoo: descricao_tattoo, tamanho_cm, local_corpo, estilo, foto_local, refs_imagens; cadastro: nome, data_nascimento, email). Cria conversa se primeira chamada. Retorna gatilho data_invalida ou menor_idade quando aplicavel.",
  "method": "POST",
  "url": "https://inkflowbrasil.com/api/tools/dados-coletados",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpHeaderAuth",
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={\n    \"tenant_id\": \"{{ $('Buscar Tenant').first().json.id }}\",\n    \"telefone\": \"{{ $('Dados').first().json.telefone_numero }}\",\n    \"campo\": \"{{ $fromAI('campo', 'nome do campo a persistir', 'string') }}\",\n    \"valor\": \"{{ $fromAI('valor', 'valor do campo (string para texto, number para tamanho_cm, array para refs_imagens)', 'string') }}\"\n  }"
}
```

**`enviar_orcamento_tatuador`:**

```json
{
  "toolDescription": "Monta orcamento completo (3 OBR tattoo + 2 OBR cadastro) e envia Telegram pro tatuador com botoes [Fechar valor / Recusar]. Idempotente via orcid. Estado vira aguardando_tatuador. Use APOS cadastro completo.",
  "method": "POST",
  "url": "https://inkflowbrasil.com/api/tools/enviar-orcamento-tatuador",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpHeaderAuth",
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={\n    \"tenant_id\": \"{{ $('Buscar Tenant').first().json.id }}\",\n    \"telefone\": \"{{ $('Dados').first().json.telefone_numero }}\"\n  }"
}
```

**`enviar_objecao_tatuador`:**

```json
{
  "toolDescription": "Envia desconto pedido pelo cliente ao tatuador via Telegram com botoes [Aceitar X / Manter Y]. Estado vira aguardando_decisao_desconto. Use SO quando cliente pediu desconto e ja existe valor_proposto.",
  "method": "POST",
  "url": "https://inkflowbrasil.com/api/tools/enviar-objecao-tatuador",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpHeaderAuth",
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={\n    \"tenant_id\": \"{{ $('Buscar Tenant').first().json.id }}\",\n    \"telefone\": \"{{ $('Dados').first().json.telefone_numero }}\",\n    \"valor_pedido_cliente\": \"{{ $fromAI('valor_pedido_cliente', 'valor (numero) que o cliente pediu de desconto', 'number') }}\"\n  }"
}
```

**`consultar_proposta_tatuador`:**

```json
{
  "toolDescription": "Consulta estado atual da conversa (estado_agente, valor_proposto, valor_pedido_cliente, decisao_desconto, mensagem_tatuador, orcid). Read-only. Usado pelo agente em propondo_valor/aguardando_decisao_desconto pra saber qual valor apresentar.",
  "method": "POST",
  "url": "https://inkflowbrasil.com/api/tools/consultar-proposta-tatuador",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpHeaderAuth",
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={\n    \"tenant_id\": \"{{ $('Buscar Tenant').first().json.id }}\",\n    \"telefone\": \"{{ $('Dados').first().json.telefone_numero }}\"\n  }"
}
```

**Conexões:** cada node tem connection `ai_tool` apontando pra `Seu Agente` (igual aos 8 existentes).

**Credentials:** todos usam `httpHeaderAuth` com header `X-Inkflow-Tool-Secret` configurado no n8n credential store (mesma credential que os 8 existentes — não precisa criar nova).

**Após adicionar:** rodar `publish_workflow` (cravado em memo `feedback_n8n_publish_apos_update`).

## Section 3 — Fluxo de dados & edge cases

### 3.1 Happy path — primeira mensagem do cliente

```
Cliente: "Quero uma rosa de 10cm no braço"
  ↓ Evolution → n8n → Agent → LLM raciocina
  ↓ LLM chama: dados_coletados(campo="descricao_tattoo", valor="rosa")
  ↓ httpRequestTool injeta tenant_id + telefone do contexto n8n
  ↓ POST /api/tools/dados-coletados
  │   body: {tenant_id, telefone, campo:"descricao_tattoo", valor:"rosa"}
  ↓
  ensureConversa(env, {tenant_id, telefone, defaultsOnInsert: {estado_agente:'coletando_tattoo'}})
  ↓ INSERT (primeira vez) → conversa criada com estado_agente='coletando_tattoo'
  ↓
  PATCH conversas SET dados_coletados = {descricao_tattoo:"rosa"} WHERE id=conv.id
  ↓
  Returns: {ok:true, campo, valor, conversa_id:conv.id}
  ↓
  LLM próxima chamada: dados_coletados(campo="tamanho_cm", valor=10)
  ↓ ensureConversa → no-op (UNIQUE conflict, retorna existente)
  ↓ PATCH dados_coletados = {descricao_tattoo:"rosa", tamanho_cm:10}
  ...
  ↓ Após 3 OBR: estado_agente transiciona pra 'coletando_cadastro'
```

### 3.2 Edge cases & comportamento

| Cenário | Comportamento |
|---|---|
| Race condition: 2 mensagens chegam quase simultâneas | UNIQUE constraint + ignore-duplicates previnem 2 INSERTs. Segundo request faz no-op. PATCH posterior é serializado pelo Postgres. Nenhuma perda de dados. |
| LLM chama `enviar_orcamento_tatuador` sem `dados_coletados` ter rodado | SELECT por (tenant_id, telefone) retorna vazio → tool retorna **404** com `{ok:false, error:"conversa-nao-encontrada"}`. LLM recebe erro, pode retry com dados_coletados primeiro (orientação de prompt) ou escalar via acionar_handoff. **Telegrafia bug em vez de mascarar.** |
| LLM chama `dados_coletados` com `campo` inválido | 400 `{ok:false, error:"campo invalido: X"}`. **Não cria conversa** (validação acontece **antes** do upsert). |
| LLM chama `dados_coletados` sem tenant_id ou telefone | 400 `{ok:false, error:"tenant_id obrigatorio"}` ou `{ok:false, error:"telefone obrigatorio"}`. Sem upsert. |
| Helper falha (Supabase down, network error) | `ensureConversa` retorna `{ok:false, reason, status}`. Tool propaga como 500 com `{ok:false, error:"upsert-falhou", detail:{reason, status}}`. tool_calls_log persiste o erro. |
| Tenant já existe mas `estado_agente` foi setado pra `aguardando_tatuador` (handoff) | Upsert via ignore-duplicates **não** sobrescreve `estado_agente` existente (defaults só aplicam em INSERT efetivo). PATCH posterior só toca `dados_coletados`/`dados_cadastro`. Lógica de transição em `dados-coletados.js` já checa `estado_agente === 'coletando_tattoo'` antes de transicionar — se estado for outro, transição não acontece. **Comportamento atual preservado.** |
| Cliente troca de número de telefone | Cada par `(tenant_id, telefone)` vira conversa distinta. Comportamento atual. |
| LLM chama `dados_coletados` 2× com mesmo campo (retry após timeout) | PATCH `{...dadosColetados, [campo]:valor}` aplicado 2× produz mesmo resultado (overwrite do mesmo campo). Idempotente. **Exceção:** `refs_imagens` é array com append behavior — 2 calls fazem `[url1]` virar `[url1, url1]`. Mantém append (memo: dedup futuro se virar problema). |

### 3.3 Ordem de operações garantida (em `dados-coletados.js`)

```
1. Validar input (tenant_id, telefone, campo presentes/válidos)
2. Validar campo (∈ CAMPOS_TATTOO ∪ CAMPOS_CADASTRO)
3. Validar valor (data_nascimento format, tamanho_cm range, etc.) ← se falha, retorna ANTES de criar row
4. ensureConversa() — cria ou recupera
5. Aplicar mutação específica (dados_coletados ou dados_cadastro merge)
6. Detectar transição de estado (3 OBR completos → coletando_cadastro)
7. PATCH único com payload merged
8. Retornar resposta com conversa_id
```

**Princípio:** validação antes de side-effects. Conversa só nasce se request é válido.

### 3.4 Side-effect em `tool_calls_log`

Mantido via `withTool` wrapper em `_tool-helpers.js` (já existente). Cada chamada — sucesso ou erro — gera row em `tool_calls_log` com `tool, input, output, sucesso, latency_ms, erro, tenant_id, telefone`. Permite confirmar pós-deploy que `tool='dados_coletados'` começou a aparecer no log (vs hoje 100% `tool='prompt'`).

## Section 4 — Error handling & observability

### 4.1 Tabela de status codes

| Cenário | Status | Body | Caller (LLM) deve |
|---|---|---|---|
| Sucesso | 200 | `{ok:true, campo, valor, conversa_id, [proxima_fase], [estado_agente]}` | Continuar fluxo |
| `tenant_id` ou `telefone` ausente | 400 | `{ok:false, error:"tenant_id obrigatorio"}` ou `"telefone obrigatorio"` | Reportar erro upstream (n8n template bug — não é problema do LLM) |
| `campo` inválido | 400 | `{ok:false, error:"campo invalido: <nome>"}` | LLM corrigir nome do campo |
| `valor` fora de range (ex: tamanho_cm > 200) | 400 | `{ok:false, error:"tamanho_cm fora do range: <v>"}` | LLM perguntar de novo ao cliente |
| `data_nascimento` formato inválido | **200** | `{ok:false, gatilho:"data_invalida", dica:"use formato dd/mm/aaaa"}` | LLM pedir nova data ao cliente (gatilho semântico, não erro HTTP) |
| Idade < 18 detectada | 200 | `{ok:true, gatilho:"menor_idade", estado_agente:"aguardando_tatuador"}` | LLM despedir-se educado, sair da conversa |
| Auth falha | 401 | `{ok:false, error:"bad-secret"\|"secret-missing"}` | Configuração n8n quebrada — Telegram alert via auditor deploy-health |
| Method não-POST | 405 | `{ok:false, error:"method-not-allowed"}` | n8n template bug |
| JSON malformado | 400 | `{ok:false, error:"invalid-json"}` | n8n template bug |
| Supabase down ou ensureConversa retorna falha | 500 | `{ok:false, error:"upsert-falhou", detail:{reason, status}}` | n8n retry com backoff (já configurado no Agent node) |
| PATCH falha após upsert OK | 500 | `{ok:false, error:"patch-falhou"}` | n8n retry |
| `enviar-orcamento-tatuador`: conversa não existe | 404 | `{ok:false, error:"conversa-nao-encontrada"}` | LLM chama `dados_coletados` primeiro |
| `enviar-orcamento-tatuador`: tatuador sem Telegram | 400 | `{ok:false, error:"tatuador-sem-telegram"}` | Bug operacional do tenant (escalar via handoff) |
| `enviar-orcamento-tatuador`: já tem orcid | 200 | `{ok:true, orcid, idempotente:true}` | Skip — já enviou |
| `enviar-orcamento-tatuador`: 5 OBR incompleto | 400 | `{ok:false, error:"campos-faltando", faltando:[...]}` | LLM coletar campos faltantes |
| `enviar-objecao-tatuador`: sem valor_proposto | 400 | `{ok:false, error:"valor_proposto-ausente"}` | Bug de ordem do LLM (raro) |
| `consultar-proposta-tatuador`: conversa não existe | 404 | `{ok:false, error:"conversa-nao-encontrada"}` | LLM chama `dados_coletados` primeiro |

**Princípio de design:** distingue erros que o **LLM** pode resolver (campo errado, data inválida → status 200/400 com payload semântico) de erros que **infra/operação** precisa resolver (auth, db down, json malformado → status ≥ 500 ou 401).

### 4.2 Convenção 200 vs 400 pra "data inválida"

Mantém comportamento existente: data_nascimento mal formatada retorna **200 com `gatilho:"data_invalida"`**. Razão: o LLM precisa entender o gatilho como "ação requerida" (perguntar de novo), não como "erro do sistema". Status 400 ativaria fallback de retry no Agent node, que não é o comportamento desejado. Cravado em PR #19/#20.

### 4.3 Observability — 3 sinais

**1. `tool_calls_log` (existente, via `withTool` wrapper)**
- Toda chamada gera row com `tool, input, output, sucesso, latency_ms, erro, tenant_id, telefone`.
- Pós-deploy, query de validação:
  ```sql
  SELECT tool, COUNT(*) FROM tool_calls_log
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY tool;
  ```
- **Critério de smoke E2E PASS:** rows com `tool='dados_coletados'` aparecem (vs hoje 100% `tool='prompt'`).

**2. Console.error em paths críticos**
- `ensureConversa` falha: log com `tenant_id`, `telefone`, `reason`, `status`.
- Acessível via Cloudflare Dashboard → Pages → `inkflow-saas` → Functions → Real-time logs.

**3. Auditor `deploy-health` (existente, cron `0 */6 * * *`)**
- Já monitora `tool_calls_log` pra ratio de erro. Sem mudança no auditor — ele cobre tools novas automaticamente.

### 4.4 Idempotência (resistência a retry)

- **`dados_coletados` é idempotente por design**: PATCH `{...dadosColetados, [campo]:valor}` aplicado 2× produz mesmo resultado. UNIQUE constraint + ignore-duplicates previnem duplicate INSERT.
- **Edge case sutil**: `refs_imagens` array com append behavior — 2 retries fazem `[url1]` virar `[url1, url1]`. Mantém append behavior (decisão consciente).
- **`enviar_orcamento_tatuador` é idempotente** via `orcid`: se row já tem orcid, retorna sem reenviar Telegram.
- **`enviar_objecao_tatuador` é idempotente**: PATCH valor_pedido_cliente + estado_agente é overwrite. 2 calls produzem mesmo Telegram (mensagem dupla pro tatuador, mas estado consistente). **Trade-off aceito** — Telegram dupla é raro (só em retry de n8n após timeout >30s) e visualmente óbvio pro tatuador.

### 4.5 Que NÃO está coberto (escopo pra futuro)

- **Concurrência fina:** 2 chamadas a `dados_coletados` no mesmo (tenant_id, telefone) sobre o **mesmo campo** quase simultâneas → race no PATCH JSON merge. Postgres faz overwrite "last write wins" — pode perder dado em janela <100ms. Item P3 backlog se virar problema; bot atual não dispara concorrente no mesmo turno.
- **Soft-delete / desativar conversa órfã**: se cliente sumir após 2 mensagens, row fica em `coletando_tattoo` indefinida. Cleanup via auditor futuro.
- **Telegram dupla em retry de `enviar_objecao_tatuador`**: aceitável trade-off MVP.

## Section 5 — Testing strategy

### 5.1 Pirâmide de testes

```
                      ┌────────────────────────┐
                      │  Smoke E2E (manual)    │  ← 1× pós-merge n8n
                      │  WhatsApp real         │
                      └────────────────────────┘
                  ┌──────────────────────────────┐
                  │  Smoke backend (curl)        │  ← entre Etapa 1 e 2
                  │  4 endpoints diretos         │
                  └──────────────────────────────┘
              ┌──────────────────────────────────────┐
              │  Unit + integration (vitest .mjs)    │  ← em CI/local
              │  ensureConversa + 4 tools refator    │
              └──────────────────────────────────────┘
```

### 5.2 Testes unit/integration (Vitest, em CI)

**Novo: `tests/_lib/conversas-upsert.test.mjs`** (~7 testes)

1. **INSERT primeira vez** — `tenant_id` + `telefone` novos → cria row com defaults aplicados → `criado:true, id:uuid, row:{...}`
2. **No-op idempotente** — chamada 2× com mesmo `(tenant_id, telefone)` → segunda retorna `criado:false, id:` (mesmo) → defaults **não** sobrescrevem campos populados
3. **Defaults respeitados em INSERT** — INSERT com `defaultsOnInsert:{estado_agente:'coletando_tattoo'}` aplica esse valor; sem o param, usa default do schema (`'ativo'`)
4. **tenant_id ausente** → `{ok:false, reason:'tenant_id-obrigatorio'}`
5. **telefone ausente** → `{ok:false, reason:'telefone-obrigatorio'}`
6. **Supabase 500 no INSERT** → `{ok:false, reason:'insert-falhou', status:500}` (mock fetch retornando erro)
7. **Conflito retorna row existente intacta** — INSERT que conflita (returns []) → SELECT recupera → defaults NÃO aplicados na row existente

**Novo: `tests/tools/dados-coletados.test.mjs`** (~9 testes)

Espelhando `tests/tools/dados-coletados-helpers.test.mjs` (que cobre helpers como `normalizarData`/`calcularIdade` — manter intacto).

1. **Conversa nova com `dados_coletados`** — primeira chamada cria row com `estado_agente='coletando_tattoo'` + persiste campo
2. **Conversa existente é reutilizada** — segunda chamada usa mesma row, faz só PATCH
3. **`tenant_id` ausente no body** → 400 `{error:"tenant_id obrigatorio"}`
4. **`telefone` ausente no body** → 400 `{error:"telefone obrigatorio"}`
5. **Validação ANTES do upsert** — payload com `campo` inválido → 400 sem criar row (mock `supaFetch` verifica que ensureConversa **não** foi chamado)
6. **Transição de estado preservada** — 3 OBR completos → estado_agente vira `coletando_cadastro`
7. **Idade < 18** → 200 com `gatilho:'menor_idade'`, estado vira `aguardando_tatuador`
8. **Data inválida** → 200 com `gatilho:'data_invalida'`, estado intacto
9. **ensureConversa falha → tool propaga 500** — mock retornar `{ok:false}` → response 500 + log

**Novo: `tests/tools/enviar-orcamento-tatuador.test.mjs`** (~5 testes — cria arquivo novo, sem refator de existente)

1. **Sucesso happy path** — conversa existente com 5 OBR completos + tenant.tatuador_telegram_chat_id → POST com (tenant_id, telefone) → orcid gerado, Telegram enviado, estado `aguardando_tatuador`
2. **`tenant_id` ausente** → 400
3. **`telefone` ausente** → 400
4. **Conversa não existe** → 404 `{error:"conversa-nao-encontrada"}`
5. **Idempotência via orcid** — segunda chamada retorna mesmo orcid sem reenviar Telegram

**Novo: `tests/tools/enviar-objecao-tatuador.test.mjs`** (~5 testes)

1. **Sucesso happy path** — conversa com valor_proposto + orcid → POST com (tenant_id, telefone, valor_pedido_cliente) → estado `aguardando_decisao_desconto`, Telegram enviado
2. **`tenant_id`/`telefone` ausente** → 400 (×2 testes)
3. **Conversa não existe** → 404
4. **Sem valor_proposto** → 400 `valor_proposto-ausente`
5. **`valor_pedido_cliente` inválido** (string, negativo, zero) → 400

**Novo: `tests/tools/consultar-proposta-tatuador.test.mjs`** (~3 testes)

1. **Sucesso happy path** — conversa com valor_proposto/orcid/dados_coletados → 200 com payload completo
2. **`tenant_id`/`telefone` ausente** → 400 (×2 testes — combinar)
3. **Conversa não existe** → 404

**Total:** 5 arquivos novos, **29 testes** novos (7 + 9 + 5 + 5 + 3).

**Mocks:** seguir pattern de `tests/tools/dados-coletados-helpers.test.mjs` (ou outros existentes em `tests/`). Vitest com `vi.mock` ou função-mock manual de `supaFetch`.

### 5.3 Smoke backend pós-deploy (curl, manual ~10min)

**Antes de mexer em n8n.** Endpoint deployed em prod (`inkflowbrasil.com`). Setup: exportar `INKFLOW_TOOL_SECRET` (valor copiado do CF Pages env vars OR via `bws secret get` se Bitwarden Secrets configurado), `TENANT_ID` (UUID Hustle Ink), `TELEFONE_TESTE` (número fictício).

```bash
# Export antes de rodar (substitua pelos valores reais)
export SECRET="<INKFLOW_TOOL_SECRET do CF Pages>"
export TENANT_ID="<uuid Hustle Ink — query: SELECT id FROM tenants WHERE nome_estudio LIKE '%Hustle%'>"
export TELEFONE_TESTE="+5511888888888"
export URL=https://inkflowbrasil.com/api/tools

# Teste 1: 401 sem secret
curl -X POST $URL/dados-coletados -H "Content-Type: application/json" -d '{}' 
# Esperado: 401 {ok:false, error:"bad-secret"|"secret-missing"}

# Teste 2: 400 sem tenant_id
curl -X POST $URL/dados-coletados \
  -H "Content-Type: application/json" \
  -H "X-Inkflow-Tool-Secret: $SECRET" \
  -d "{\"telefone\":\"$TELEFONE_TESTE\",\"campo\":\"descricao_tattoo\",\"valor\":\"rosa\"}"
# Esperado: 400 {ok:false, error:"tenant_id obrigatorio"}

# Teste 3: 200 sucesso primeira vez (cria conversa)
curl -X POST $URL/dados-coletados \
  -H "Content-Type: application/json" \
  -H "X-Inkflow-Tool-Secret: $SECRET" \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"telefone\":\"$TELEFONE_TESTE\",\"campo\":\"descricao_tattoo\",\"valor\":\"rosa teste\"}"
# Esperado: 200 {ok:true, campo:"descricao_tattoo", valor:"rosa teste", conversa_id:"<uuid>"}

# Teste 4: 200 sucesso segunda vez (no-op upsert) — repete teste 3, mesma conversa via SQL check

# Teste 5: 200 com gatilho menor_idade
curl -X POST $URL/dados-coletados \
  -H "Content-Type: application/json" \
  -H "X-Inkflow-Tool-Secret: $SECRET" \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"telefone\":\"$TELEFONE_TESTE\",\"campo\":\"data_nascimento\",\"valor\":\"01/01/2015\"}"
# Esperado: 200 {ok:true, gatilho:"menor_idade", estado_agente:"aguardando_tatuador"}

# Teste 6: 404 em enviar_orcamento_tatuador pra conversa nova
curl -X POST $URL/enviar-orcamento-tatuador \
  -H "Content-Type: application/json" \
  -H "X-Inkflow-Tool-Secret: $SECRET" \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"telefone\":\"+5511777777777\"}"
# Esperado: 404 {ok:false, error:"conversa-nao-encontrada"}

# Teste 7: 404 em consultar-proposta-tatuador pra conversa nova
curl -X POST $URL/consultar-proposta-tatuador \
  -H "Content-Type: application/json" \
  -H "X-Inkflow-Tool-Secret: $SECRET" \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"telefone\":\"+5511777777777\"}"
# Esperado: 404 {ok:false, error:"conversa-nao-encontrada"}
```

**Cleanup:** após smoke, DELETE rows criadas com telefone teste via MCP Supabase:

```sql
DELETE FROM conversas WHERE telefone IN ('+5511888888888', '+5511777777777');
```

**Validação SQL pós-smoke:**

```sql
-- Antes do cleanup:
SELECT id, tenant_id, telefone, estado_agente, dados_coletados, dados_cadastro, created_at
FROM conversas
WHERE telefone = '+5511888888888';
-- Esperado: 1 row com estado_agente='aguardando_tatuador' (após teste 5),
-- dados_coletados={descricao_tattoo:"rosa teste"}, dados_cadastro={data_nascimento:"2015-01-01", idade_anos:11}
```

**Critério PASS:** todos os 7 testes retornam status esperado + SQL valida estado correto.

### 5.4 Smoke E2E (manual, ~15min, 1× pós-merge n8n)

Etapa 2 do split. Após 4 nodes wired no n8n, workflow republicado via `publish_workflow`:

1. **Cenário golden path Hustle Ink:**
   - Cliente teste (número Leandro ou amigo, NÃO real cliente) manda mensagem ao bot Hustle Ink: "Quero uma rosa de 10cm no antebraço"
   - Esperado: bot processa → LLM chama `dados_coletados` 3× (descricao + tamanho + local) → bot responde pedindo nome/data_nasc/email
   - Verifica em `tool_calls_log` (last 5min): rows com `tool='dados_coletados'` × 3, todas `sucesso=true`
   - Verifica em `conversas`: row do telefone teste com `estado_agente='coletando_cadastro'`, `dados_coletados={descricao_tattoo,tamanho_cm,local_corpo}`

2. **Cenário cadastro completo:**
   - Cliente responde: "Maria Silva, 12/03/1995, maria@gmail.com"
   - Esperado: 3× `dados_coletados` (cadastro fields) → `enviar_orcamento_tatuador` → Telegram chega no bot do tatuador (Hustle Ink chat_id configurado)
   - Verifica em Telegram: msg de orçamento chegou no chat
   - Verifica em `conversas`: row tem `estado_agente='aguardando_tatuador'`, `orcid` preenchido, `dados_cadastro={nome,data_nascimento,email,idade_anos}`

3. **Cleanup:** ao fim, DELETE conversa teste do banco + opcional: deletar thread Telegram do bot do tatuador.

**Critério PASS:** 100% das 7 chamadas de tool em `tool_calls_log` retornaram `sucesso=true` (3 `dados_coletados` no cenário 1 + 3 `dados_coletados` + 1 `enviar_orcamento_tatuador` no cenário 2).

### 5.5 Não-coberto (decisão consciente)

- **Carga / load testing** — não justifica pra MVP solo founder
- **Concorrência fina entre chamadas simultâneas** — Postgres serializa PATCH; raro com bot single-thread
- **n8n integration tests programáticos** — não há framework adequado; manual smoke é o caminho
- **Mutation testing** — overkill pro escopo

## Section 6 — Implementation order (split PR strategy)

### Etapa 1 — Backend (CF Pages)

1. **Branch:** `feat/wire-tools-coleta-v2` (já criada)
2. **Implementação TDD task-by-task** (ver plano via `/plan`):
   - Helper `_lib/conversas-upsert.js` + 7 testes
   - `dados-coletados.js` refactor + 9 testes (novo arquivo)
   - `enviar-orcamento-tatuador.js` refactor + 5 testes
   - `enviar-objecao-tatuador.js` refactor + 5 testes
   - `consultar-proposta-tatuador.js` refactor + 3 testes
   - Update test runner (`vitest.config.js` ou similar) se preciso
3. **PR backend:** push + abrir PR + aguardar CF Pages preview ou merge to main (split A merge → smoke prod)
4. **Merge to main:** CF Pages auto-deploy
5. **Smoke backend (curl):** 7 testes acima — 100% PASS
6. **Cleanup smoke:** DELETE rows teste

### Etapa 2 — n8n workflow (manual UI)

7. **Abrir n8n editor:** workflow `MEU NOVO WORK - SAAS` (id `PmCMHTaTi07XGgWh`)
8. **Adicionar 4 nodes httpRequestTool:** copy-paste do JSON template do `acionar_handoff` ou `calcular_orcamento` como base; ajustar `toolDescription`, `url`, `jsonBody` com os schemas da Section 2.6
9. **Wire connections:** `ai_tool` de cada node novo → `Seu Agente`
10. **Publish workflow:** rodar `publish_workflow` (memo cravada `feedback_n8n_publish_apos_update`)
11. **Smoke E2E (WhatsApp real):** 2 cenários acima — 100% PASS
12. **Cleanup smoke:** DELETE conversa teste

### Critérios de DONE (todo PR)

- [x] Branch `feat/wire-tools-coleta-v2` ativa
- [ ] Helper + 4 tools refatoradas + ~22 testes passando localmente
- [ ] Build sem warnings
- [ ] PR backend mergeado em main
- [ ] CF Pages deploy SUCCESS
- [ ] Smoke backend curl: 7/7 PASS
- [ ] n8n: 4 nodes adicionados + connections + publish
- [ ] Smoke E2E WhatsApp: 2/2 cenários PASS
- [ ] `tool_calls_log` últimas 1h: ≥1 row `tool='dados_coletados'` com `sucesso=true`
- [ ] Cleanup: zero rows teste em `conversas`
- [ ] Painel atualizado
- [ ] Daily note atualizada com "parte N"

## Section 7 — Out of scope (decisões conscientes)

1. **Refator de `acionar-handoff.js`** pra usar helper compartilhado — Q1 lock-in: zero risco de regressão. Se virar 3º caller no futuro, aí consolidamos.
2. **Soft-delete de conversa órfã** (cliente sumiu após 2 msgs) — auditor futuro.
3. **Dedup de `refs_imagens` em retry** — comportamento append mantido; trivial mudar quando virar problema real.
4. **Concurrência fina em PATCH JSON merge** — Postgres serializa; race window <100ms; não bloqueia MVP.
5. **Telegram dupla em retry de `enviar_objecao_tatuador`** — aceito tradeoff MVP.
6. **Refinamento profundo de prompts Coleta** — deferido pra logs reais de tenants pagantes (cravado em memory).
7. **Migrações DB** — schema atual suficiente, sem nova migration nesta feature.
8. **Workflow n8n versionado em repo** — manual UI mantém workflow no n8n cloud, sem audit trail em git. Caminho C com MCP `update_workflow` foi descartado por custo (3h+) vs benefício marginal.

## Section 8 — References

**Specs relacionados:**
- `2026-04-22-modo-coleta-design.md` — design original Modo Coleta v1 (SUPERSEDED)
- `2026-05-02-modo-coleta-v2-principal.md` — Modo Coleta v2 implementado em PR #19/#20

**Memory anchors:**
- `[[InkFlow — Modo Coleta v2 principal (2026-05-02)]]` — status atual em prod
- `[[InkFlow — Pendências (backlog)]]` §"P1 — Tools Coleta v2 não chamados pelo bot"
- `[[feedback_calibrar_subagent_driven]]` — calibração de subagent-driven pra implementação
- `[[feedback_n8n_publish_apos_update]]` — n8n exige publish após update

**Código:**
- `functions/api/tools/_tool-helpers.js` — auth, supaFetch, withTool wrapper, tool_calls_log
- `functions/api/tools/acionar-handoff.js` — pattern de upsert inline (referência, não refatorada)
- `functions/_lib/conversas-lifecycle.js` — pattern de helper similar (markConversaFechada, style explicit env não-tool)
- `functions/_lib/prompts/coleta/{tattoo,cadastro,proposta}/` — prompts que orientam LLM a chamar as 4 tools

**n8n:**
- Workflow `MEU NOVO WORK - SAAS` (id `PmCMHTaTi07XGgWh`)
- Agent node `Seu Agente` (`@n8n/n8n-nodes-langchain.agent`)
- 8 tools wired existentes como referência: `calcular_orcamento`, `acionar_handoff`, `consultar_horarios_livres`, `reservar_horario`, `gerar_link_sinal`, `enviar_portfolio`, `reagendar_horario`, `consultar_preco_retoque`
- Pré-Agent context nodes: `Buscar Tenant`, `Dados`, `Get a row` (este último em `dados_cliente`, NÃO em `conversas`)

**Schema relevante (Supabase):**
- `conversas`: PRIMARY KEY (id), UNIQUE (tenant_id, telefone), CHECK constraints em `estado` e `estado_agente`
- `tenants`: campos relevantes `tatuador_telegram_chat_id`, `tatuador_telegram_username`
- `tool_calls_log`: log de toda chamada via `withTool` wrapper
