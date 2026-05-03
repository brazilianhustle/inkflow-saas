# Modo Coleta v2 — Modo principal — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`. Steps usam checkbox (`- [ ]`) pra tracking.

**Goal:** Implementar Modo Coleta como modo principal, deletar Modo Faixa, manter Exato como beta secundário, integrar Telegram do tatuador como canal de comunicação paralelo, adicionar fase de cadastro do cliente, vocabulário de objeção sem contraproposta. Telegram-only na v1.

**Spec:** [`docs/superpowers/specs/2026-05-02-modo-coleta-v2-principal.md`](../specs/2026-05-02-modo-coleta-v2-principal.md)

**Tech Stack:** JS ES modules, Node 20+, `node --test`, Supabase via MCP, Cloudflare Pages, Telegram Bot API, n8n.

---

## Pre-conditions

1. **Sem tenants pagantes em produção** (confirmado 2026-05-02) — sem migração SQL de Faixa→Coleta.
2. **PR1 do refactor antigo mergeado** — `functions/_lib/prompts/{_shared,faixa,exato}/` existem; `conversas.estado_agente` já aplicado.
3. **Bot Telegram InkFlow criado** (BotFather): username `@inkflow_bot` (ou similar), token salvo em `INKFLOW_TELEGRAM_BOT_TOKEN`.
4. **Branch:** `feat/modo-coleta-v2-principal` saindo de `main`.
5. **Bateria de testes existente verde** (snapshots/contracts/invariants atuais).

---

## File Structure (visão geral)

Detalhado no spec §Arquitetura. Resumo:

- **Deletar:** `functions/_lib/prompts/faixa/`, snapshots/contracts/fixtures correspondentes
- **Criar:** `functions/_lib/prompts/coleta/{tattoo,cadastro,proposta}/`, 4 tools novas, 3 endpoints Telegram, migration SQL, testes
- **Modificar:** `functions/_lib/prompts/index.js`, `functions/api/tools/prompt.js`, `functions/api/update-tenant.js`, `onboarding.html`, `studio.html`, `admin.html`, docs canonical, workflow n8n principal

---

## Fase 0 — Pre-flight

### Task 0.1: Branch setup + baseline

- [ ] **Step 1: Criar branch**
  ```bash
  cd /Users/brazilianhustler/Documents/inkflow-saas
  git checkout main && git pull
  git checkout -b feat/modo-coleta-v2-principal
  ```

- [ ] **Step 2: Rodar baseline de testes**
  ```bash
  npm test 2>&1 | tee /tmp/baseline-tests.log
  ```
  Salvar resultado pra comparar no fim. Se algum teste falha aqui, **NÃO seguir** — corrigir baseline antes.

- [ ] **Step 3: Criar bot Telegram (manual, fora do código)**
  - Conversar com `@BotFather` no Telegram, criar bot `inkflow_bot` (ou nome disponível).
  - Salvar token em Bitwarden Secrets Manager (project `inkflow`, secret `INKFLOW_TELEGRAM_BOT_TOKEN`).
  - Pôr token também em `.dev.vars` local + Cloudflare Pages env (production e preview).
  - Configurar webhook depois (Task 9 do plano).

- [ ] **Step 4: Confirmar Bitwarden CLI funcional**
  ```bash
  bws secret list --project-id inkflow | grep TELEGRAM
  ```

---

## Fase 1 — Schema & validação

### Task 1.1: Migration SQL

**File:** `migrations/2026-05-02-modo-coleta-v2.sql` (novo)

- [ ] **Step 1: Escrever migration**

  ```sql
  -- migrations/2026-05-02-modo-coleta-v2.sql
  BEGIN;

  -- tenants: canal Telegram do tatuador
  ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS tatuador_telegram_chat_id TEXT,
    ADD COLUMN IF NOT EXISTS tatuador_telegram_username TEXT;

  CREATE INDEX IF NOT EXISTS idx_tenants_telegram_chat_id
    ON tenants(tatuador_telegram_chat_id)
    WHERE tatuador_telegram_chat_id IS NOT NULL;

  -- conversas: estado de orçamento + cadastro + identificador curto
  ALTER TABLE conversas
    ADD COLUMN IF NOT EXISTS valor_proposto NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS valor_pedido_cliente NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS orcid TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS dados_cadastro JSONB DEFAULT '{}'::jsonb;

  CREATE INDEX IF NOT EXISTS idx_conversas_orcid
    ON conversas(orcid)
    WHERE orcid IS NOT NULL;

  -- Limpar fewshots_por_modo: remover chave 'faixa', manter coleta_tattoo/cadastro/proposta + exato
  UPDATE tenants
  SET fewshots_por_modo = (fewshots_por_modo - 'faixa') ||
      jsonb_build_object(
        'coleta_tattoo',     COALESCE(fewshots_por_modo->'coleta_tattoo', '[]'::jsonb),
        'coleta_cadastro',   COALESCE(fewshots_por_modo->'coleta_cadastro', '[]'::jsonb),
        'coleta_proposta',   COALESCE(fewshots_por_modo->'coleta_proposta', '[]'::jsonb)
      )
  WHERE fewshots_por_modo IS NOT NULL;

  -- Default novo: modo='coleta'
  UPDATE tenants
  SET config_precificacao = jsonb_set(config_precificacao, '{modo}', '"coleta"'::jsonb)
  WHERE config_precificacao->>'modo' = 'faixa'
     OR config_precificacao->>'modo' IS NULL;

  COMMIT;
  ```

- [ ] **Step 2: Aplicar via Supabase MCP**
  ```
  mcp__plugin_supabase_supabase__authenticate (se preciso)
  → executar SQL acima no projeto correto
  ```

- [ ] **Step 3: Verificar**
  ```sql
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name='tenants' AND column_name LIKE 'tatuador_telegram%';
  -- esperado: 2 rows

  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name='conversas' AND column_name IN ('valor_proposto','valor_pedido_cliente','orcid','dados_cadastro');
  -- esperado: 4 rows

  SELECT DISTINCT config_precificacao->>'modo' FROM tenants;
  -- esperado: só 'coleta' e/ou 'exato' (sem 'faixa')
  ```

- [ ] **Step 4: Commit**
  ```bash
  git add migrations/2026-05-02-modo-coleta-v2.sql
  git commit -m "feat(db): schema modo-coleta v2 — telegram tatuador + cadastro + orcid

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 1.2: Validação `update-tenant.js`

**File:** `functions/api/update-tenant.js` (modificar)

- [ ] **Step 1: Atualizar `MODOS_VALIDOS`**

  ```javascript
  const MODOS_VALIDOS = ['coleta', 'exato'];  // 'faixa' REMOVIDO
  ```

- [ ] **Step 2: Default novo**

  Onde tiver default `modo: 'faixa'`, trocar pra `modo: 'coleta'`. Garantir que se `modo` ausente, vira `coleta`.

- [ ] **Step 3: Validação de Telegram chat_id**

  Adicionar `tatuador_telegram_chat_id` em `ALLOWED_FIELDS`. Validar como string numérica ou null.

- [ ] **Step 4: Limpeza defensiva**

  Se `modo === 'exato'`, remover campos específicos de coleta do payload (não há).
  Se `modo === 'coleta'`, remover campos específicos de exato (`tabela_precos`, `multiplicadores_exato`, etc — verificar quais existem).

- [ ] **Step 5: Smoke test**
  ```bash
  node -e "
  import('./functions/api/update-tenant.js').then(m => {
    const r = m.validarConfigPrecificacao({ modo: 'faixa' });
    console.log('faixa rejeitado?', !r.ok && r.erro.includes('faixa'));
  });
  "
  ```

- [ ] **Step 6: Commit**
  ```bash
  git commit -am "feat(update-tenant): MODOS_VALIDOS=[coleta,exato]; default coleta

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Fase 2 — Deletar Faixa

### Task 2.1: Apagar gerador Faixa

**Files:** apagar `functions/_lib/prompts/faixa/` inteira

- [ ] **Step 1: Deletar diretório**
  ```bash
  git rm -r functions/_lib/prompts/faixa/
  ```

- [ ] **Step 2: Procurar referências órfãs**
  ```bash
  grep -rn "faixa\|Faixa\|generatePromptFaixa" functions/ tests/ docs/canonical/ --include="*.js" --include="*.md" 2>/dev/null
  ```
  Cada match precisa ser tratado (delete ou ajuste).

- [ ] **Step 3: Limpar testes Faixa**
  ```bash
  git rm tests/prompts/snapshots/faixa-*.txt 2>/dev/null
  git rm tests/prompts/contracts/faixa.js 2>/dev/null
  ```
  Atualizar `tests/prompts/fixtures/tenant-canonico.js` se tiver fixture `tenantCanonicoFaixa` — renomear pra `tenantCanonicoColeta` e ajustar `config_precificacao`.

- [ ] **Step 4: Atualizar `tests/prompts/invariants.test.mjs`**
  ```javascript
  const MODOS_SUPORTADOS = ['coleta-tattoo', 'coleta-cadastro', 'coleta-proposta', 'exato'];
  ```

- [ ] **Step 5: Commit**
  ```bash
  git commit -am "refactor(prompts): deletar Faixa (sem tenants pagantes)

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 2.2: Atualizar dispatcher

**File:** `functions/_lib/prompts/index.js` (modificar)

- [ ] **Step 1: Reescrever**

  ```javascript
  import { generatePromptColetaTattoo } from './coleta/tattoo/generate.js';
  import { generatePromptColetaCadastro } from './coleta/cadastro/generate.js';
  import { generatePromptColetaProposta } from './coleta/proposta/generate.js';
  import { generatePromptExato } from './exato/generate.js';

  export function generateSystemPrompt(tenant, conversa, clientContext) {
    const modo = tenant?.config_precificacao?.modo || 'coleta';
    const estado = conversa?.estado_agente || 'coletando_tattoo';

    if (modo === 'exato') {
      return generatePromptExato(tenant, conversa, clientContext);
    }

    switch (estado) {
      case 'coletando_cadastro':
        return generatePromptColetaCadastro(tenant, conversa, clientContext);
      case 'propondo_valor':
      case 'aguardando_decisao_desconto':
      case 'escolhendo_horario':
      case 'aguardando_sinal':
        return generatePromptColetaProposta(tenant, conversa, clientContext);
      case 'aguardando_tatuador':
      case 'lead_frio':
      case 'fechado':
        return null;  // bot não responde
      case 'coletando_tattoo':
      default:
        return generatePromptColetaTattoo(tenant, conversa, clientContext);
    }
  }
  ```

- [ ] **Step 2: Atualizar consumidor `functions/api/tools/prompt.js`** pra tratar `null` (significa "bot não deve responder"):

  Se `prompt === null`, retornar `{ ok: true, prompt: null, estado, conversa_id }` — o n8n vê `prompt:null` e curto-circuita o LLM.

- [ ] **Step 3: Smoke**
  ```bash
  node -e "
  import('./functions/_lib/prompts/index.js').then(m => {
    const t = { config_precificacao: { modo: 'coleta' } };
    console.log('default:', !!m.generateSystemPrompt(t, null, {}));
    console.log('agend:', !!m.generateSystemPrompt(t, { estado_agente: 'escolhendo_horario' }, {}));
    console.log('aguardando=null:', m.generateSystemPrompt(t, { estado_agente: 'aguardando_tatuador' }, {}) === null);
  });
  "
  ```

- [ ] **Step 4: Commit**
  ```bash
  git commit -am "feat(prompts): dispatcher v2 (coleta state-machine + exato)

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Fase 3 — Tools

### Task 3.1: Tool `dados_coletados`

**File:** `functions/api/tools/dados-coletados.js` (criar)

**Purpose:** persiste campos do checklist em `conversas.dados_coletados` (JSONB) ou `conversas.dados_cadastro` quando campo é de cadastro.

- [ ] **Step 1: Criar arquivo seguindo padrão de `_tool-helpers.js`**

  ```javascript
  import { authTool, supaFetch, toolJson, TOOL_HEADERS, logToolCall } from './_tool-helpers.js';

  const CAMPOS_TATTOO = ['descricao_tattoo','tamanho_cm','local_corpo','estilo','foto_local','refs_imagens'];
  const CAMPOS_CADASTRO = ['nome','data_nascimento','email'];

  async function handle({ env, input }) {
    const { conversa_id, campo, valor } = input;
    if (!conversa_id || !campo) return { status: 400, body: { ok: false, error: 'conversa_id e campo obrigatorios' } };

    const isCadastro = CAMPOS_CADASTRO.includes(campo);
    const isTattoo = CAMPOS_TATTOO.includes(campo);
    if (!isCadastro && !isTattoo) return { status: 400, body: { ok: false, error: 'campo invalido' } };

    // Validação data_nascimento → menor idade dispara handoff
    if (campo === 'data_nascimento') {
      const idade = calcularIdade(valor);
      if (idade < 18) {
        // Marca trigger no estado pra fluxo capturar
        await supaFetch(env, `/rest/v1/conversas?id=eq.${conversa_id}`, {
          method: 'PATCH', body: JSON.stringify({ estado_agente: 'aguardando_tatuador' })
        });
        return { status: 200, body: { ok: true, gatilho: 'menor_idade' } };
      }
    }

    const coluna = isCadastro ? 'dados_cadastro' : 'dados_coletados';
    // PATCH JSONB merge
    await supaFetch(env, `/rest/v1/conversas?id=eq.${conversa_id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ [coluna]: { [campo]: valor } })
    });
    return { status: 200, body: { ok: true, campo, valor } };
  }

  function calcularIdade(dataStr) {
    const d = new Date(dataStr);
    const diff = Date.now() - d.getTime();
    return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  }

  export const onRequest = (ctx) => /* ... handler padrão tool ... */;
  ```

- [ ] **Step 2: Testes em `tests/tools/dados-coletados.test.mjs`**
  - Campo válido tattoo → grava em `dados_coletados`
  - Campo válido cadastro → grava em `dados_cadastro`
  - `data_nascimento` < 18 anos → retorna `gatilho: 'menor_idade'`
  - Campo inválido → 400
  - Sem conversa_id → 400

- [ ] **Step 3: Commit**

### Task 3.2: Tool `enviar_orcamento_tatuador`

**File:** `functions/api/tools/enviar-orcamento-tatuador.js` (criar)

**Purpose:** monta mensagem formatada + envia pro Telegram do tatuador via API + retorna `orcid`.

- [ ] **Step 1: Criar**

  ```javascript
  import { authTool, supaFetch, toolJson, TOOL_HEADERS, logToolCall } from './_tool-helpers.js';

  async function handle({ env, input }) {
    const { conversa_id } = input;
    // 1. Carrega conversa + tenant
    const conv = await supaFetch(env, `/rest/v1/conversas?id=eq.${conversa_id}&select=*,tenants(*)`).then(r=>r.json());
    const c = conv[0];
    const t = c.tenants;
    if (!t.tatuador_telegram_chat_id) {
      return { status: 400, body: { ok: false, error: 'tatuador-sem-telegram' } };
    }

    // 2. Gera orcid curto único
    const orcid = `orc_${Math.random().toString(36).slice(2,8)}`;

    // 3. Persiste orcid + estado
    await supaFetch(env, `/rest/v1/conversas?id=eq.${conversa_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ orcid, estado_agente: 'aguardando_tatuador' })
    });

    // 4. Monta texto Telegram
    const cad = c.dados_cadastro || {};
    const dat = c.dados_coletados || {};
    const idade = cad.data_nascimento ? calcularIdade(cad.data_nascimento) : '?';
    const text = `📋 *Novo orçamento*\n\n` +
      `👤 ${cad.nome || '?'} (${idade} anos)\n` +
      (cad.email ? `📧 ${cad.email}\n` : '') +
      `🆔 \`${orcid}\`\n\n` +
      `🎨 *Tattoo*\n` +
      `   • ${dat.descricao_tattoo || '?'}\n` +
      `   • ${dat.tamanho_cm || '?'}cm\n` +
      `   • ${dat.local_corpo || '?'}\n` +
      (dat.estilo ? `   • estilo: ${dat.estilo}\n` : '') +
      `\n📸 Fotos: ${dat.foto_local ? 1 : 0} do local, ${(dat.refs_imagens||[]).length} referências`;

    // 5. Inline keyboard
    const reply_markup = {
      inline_keyboard: [[
        { text: '✅ Fechar valor', callback_data: `fechar:${orcid}` },
        { text: '❌ Recusar', callback_data: `recusar:${orcid}` },
      ]]
    };

    // 6. Envia Telegram
    const tgRes = await fetch(`https://api.telegram.org/bot${env.INKFLOW_TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: t.tatuador_telegram_chat_id,
        text, parse_mode: 'Markdown',
        reply_markup,
      })
    });
    const tgJson = await tgRes.json();
    if (!tgJson.ok) return { status: 500, body: { ok: false, error: 'telegram-error', detail: tgJson } };

    return {
      status: 200,
      body: { ok: true, orcid, telegram_message_id: tgJson.result.message_id }
    };
  }
  ```

- [ ] **Step 2: Testes em `tests/tools/enviar-orcamento-tatuador.test.mjs`** (mock fetch Telegram)
  - Tatuador sem Telegram conectado → 400
  - Conversa válida → mensagem enviada, `orcid` gerado, estado vira `aguardando_tatuador`
  - Telegram retorna erro → 500 com detail

- [ ] **Step 3: Commit**

### Task 3.3: Tool `enviar_objecao_tatuador`

**File:** `functions/api/tools/enviar-objecao-tatuador.js` (criar)

Similar à 3.2, mas:
- Texto: `🧾 Cliente pediu desconto\n\n💰 Valor original: R$ {valor_proposto}\n🙏 Cliente pediu: R$ {valor_pedido_cliente}`
- Inline keyboard: `[✅ Aceitar X][❌ Manter Y]`
- Callbacks: `aceitar:orcid:valor` / `manter:orcid`
- Atualiza estado pra `aguardando_decisao_desconto`

- [ ] Step 1: Criar
- [ ] Step 2: Testes
- [ ] Step 3: Commit

### Task 3.4: Tool `consultar_proposta_tatuador`

**File:** `functions/api/tools/consultar-proposta-tatuador.js` (criar)

- [ ] **Step 1: Criar**

  ```javascript
  async function handle({ env, input }) {
    const { conversa_id } = input;
    const r = await supaFetch(env, `/rest/v1/conversas?id=eq.${conversa_id}&select=valor_proposto,valor_pedido_cliente,estado_agente,dados_coletados`);
    const c = (await r.json())[0];
    if (!c) return { status: 404, body: { ok: false, error: 'conversa-nao-encontrada' } };

    return {
      status: 200,
      body: {
        ok: true,
        valor_proposto: c.valor_proposto,
        decisao_desconto: c.dados_coletados?.decisao_desconto || null,
        recusou_pedido: c.estado_agente === 'lead_frio',
        mensagem_tatuador: c.dados_coletados?.mensagem_tatuador || null,
      }
    };
  }
  ```

- [ ] Step 2: Testes
- [ ] Step 3: Commit

---

## Fase 4 — Telegram (endpoints)

### Task 4.1: Webhook Telegram

**File:** `functions/api/telegram/webhook.js` (criar)

**Purpose:** recebe updates do Telegram bot, parseia callbacks e mensagens, atualiza Supabase, dispara reentrada n8n.

- [ ] **Step 1: Criar**

  ```javascript
  import { supaFetch, toolJson, TOOL_HEADERS } from '../tools/_tool-helpers.js';

  export async function onRequest(context) {
    const { request, env } = context;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: TOOL_HEADERS });
    if (request.method !== 'POST') return toolJson({ ok: false, error: 'method-not-allowed' }, 405);

    // Validar secret token (configurado no setWebhook)
    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (secret !== env.INKFLOW_TELEGRAM_WEBHOOK_SECRET) return toolJson({ ok: false }, 401);

    const update = await request.json();

    // /start <onboarding_key>
    if (update.message?.text?.startsWith('/start ')) {
      return handleStart(env, update);
    }

    // Callback de inline keyboard
    if (update.callback_query) {
      return handleCallback(env, update);
    }

    // Mensagem de texto livre (continuação de fluxo, ex: depois de Fechar Valor)
    if (update.message?.text) {
      return handleText(env, update);
    }

    return toolJson({ ok: true, ignored: true });
  }

  async function handleStart(env, update) {
    const key = update.message.text.replace('/start ', '').trim();
    const chat_id = String(update.message.chat.id);
    const username = update.message.chat.username || null;

    // Busca onboarding_link
    const r = await supaFetch(env, `/rest/v1/onboarding_links?key=eq.${key}&select=tenant_id,used`);
    const links = await r.json();
    if (!links[0] || links[0].used) {
      await sendMessage(env, chat_id, '❌ Link inválido ou expirado.');
      return toolJson({ ok: false, error: 'invalid-key' }, 400);
    }

    // Atualiza tenant
    await supaFetch(env, `/rest/v1/tenants?id=eq.${links[0].tenant_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ tatuador_telegram_chat_id: chat_id, tatuador_telegram_username: username })
    });

    await sendMessage(env, chat_id, '✅ Conectado! Você vai receber orçamentos do InkFlow aqui.');
    return toolJson({ ok: true });
  }

  async function handleCallback(env, update) {
    const cb = update.callback_query;
    const [acao, orcid, valor_extra] = cb.data.split(':');

    // Lookup conversa por orcid
    const r = await supaFetch(env, `/rest/v1/conversas?orcid=eq.${orcid}&select=id,valor_proposto,tenants(tatuador_telegram_chat_id)`);
    const conv = (await r.json())[0];
    if (!conv) return toolJson({ ok: false, error: 'orcid-nao-encontrado' }, 404);

    let nextEstado, patch = {};
    switch (acao) {
      case 'fechar':
        // Resposta tem 2 passos: pede valor agora
        await sendMessage(env, cb.from.id, `Qual valor pra ${orcid}? Ex: 750`, {
          reply_markup: { force_reply: true, selective: false }
        });
        // Marcar que o próximo texto livre desse chat com reply_to_message igual à mensagem original = valor
        await answerCallbackQuery(env, cb.id);
        return toolJson({ ok: true });

      case 'recusar':
        nextEstado = 'lead_frio';
        patch = { estado_agente: nextEstado, dados_coletados: { mensagem_tatuador: 'recusou' } };
        break;

      case 'aceitar':
        // valor_extra = novo valor
        nextEstado = 'escolhendo_horario';
        patch = { estado_agente: nextEstado, valor_proposto: parseFloat(valor_extra) };
        break;

      case 'manter':
        nextEstado = 'propondo_valor';
        patch = { estado_agente: nextEstado, dados_coletados: { decisao_desconto: 'recusado' } };
        break;
    }

    await supaFetch(env, `/rest/v1/conversas?id=eq.${conv.id}`, {
      method: 'PATCH', body: JSON.stringify(patch)
    });

    // Dispara reentrada do bot na conversa do cliente via webhook n8n
    await fetch(env.N8N_REENTRADA_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversa_id: conv.id, evento: acao, orcid })
    });

    await answerCallbackQuery(env, cb.id, '✓ Aplicado');
    return toolJson({ ok: true });
  }

  async function handleText(env, update) {
    // Detecta resposta a "Fechar valor"
    const reply = update.message.reply_to_message;
    if (reply?.text?.startsWith('Qual valor pra ')) {
      const orcid = reply.text.match(/orc_\w+/)?.[0];
      const valor = parseFloat(update.message.text.replace(/[^\d.,]/g,'').replace(',','.'));
      if (orcid && !isNaN(valor)) {
        await supaFetch(env, `/rest/v1/conversas?orcid=eq.${orcid}`, {
          method: 'PATCH',
          body: JSON.stringify({ estado_agente: 'propondo_valor', valor_proposto: valor })
        });
        // Dispara reentrada
        await fetch(env.N8N_REENTRADA_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orcid, evento: 'fechar', valor })
        });
        await sendMessage(env, update.message.chat.id, `✅ Valor R$ ${valor} enviado pro cliente.`);
      }
    }
    return toolJson({ ok: true });
  }

  async function sendMessage(env, chat_id, text, extra = {}) {
    await fetch(`https://api.telegram.org/bot${env.INKFLOW_TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text, ...extra }),
    });
  }

  async function answerCallbackQuery(env, id, text) {
    await fetch(`https://api.telegram.org/bot${env.INKFLOW_TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: id, text }),
    });
  }
  ```

- [ ] **Step 2: Configurar webhook do bot Telegram (manual)**

  ```bash
  curl "https://api.telegram.org/bot$INKFLOW_TELEGRAM_BOT_TOKEN/setWebhook" \
    -d "url=https://inkflow.app/api/telegram/webhook" \
    -d "secret_token=$INKFLOW_TELEGRAM_WEBHOOK_SECRET"
  ```

- [ ] **Step 3: Testes em `tests/telegram/webhook.test.mjs`**
  - `/start <key>` válido → tenant atualizado, chat resposta
  - `/start <key>` inválido → 400
  - Callback `fechar:orcid` → manda pergunta de valor
  - Callback `recusar:orcid` → estado = lead_frio + reentrada disparada
  - Callback `aceitar:orcid:600` → valor_proposto=600, estado=escolhendo_horario
  - Texto livre que é resposta a "Qual valor" → captura valor
  - Sem secret token → 401

- [ ] **Step 4: Commit**

### Task 4.2: Endpoint `/api/check-telegram-connected`

**File:** `functions/api/check-telegram-connected.js` (criar)

**Purpose:** UI do onboarding faz polling pra detectar quando tatuador escaneou QR e bot capturou chat_id.

- [ ] Step 1: GET `/api/check-telegram-connected?onboarding_key=...` retorna `{ connected: bool, chat_id?: string }` lendo `tenants.tatuador_telegram_chat_id` por join via `onboarding_links`.
- [ ] Step 2: Tests
- [ ] Step 3: Commit

---

## Fase 5 — Prompts Coleta

Arquitetura de cada bloco segue o pattern existente em `functions/_lib/prompts/exato/`. Cada fase (tattoo/cadastro/proposta) tem 5 arquivos: `generate.js`, `fluxo.js`, `regras.js`, `few-shot.js`, `few-shot-tenant.js`.

### Task 5.1: `coleta/tattoo/`

**Files:** criar `functions/_lib/prompts/coleta/tattoo/{generate,fluxo,regras,few-shot,few-shot-tenant}.js`

**Anchors do `fluxo.js`:**
- Header `"§3 FLUXO"`
- Saudação inicial estilo existente
- Checklist OBR: `descricao_tattoo`, `tamanho_cm`, `local_corpo`
- Checklist OPC: `estilo`, `foto_local`, `refs_imagens`
- Após coleta completa: transição pra `coletando_cadastro` via `dados_coletados(campo='_transicao', valor='cadastro')` ou tool dedicada
- Gatilhos imediatos de handoff (cover-up, menor de idade, área restrita, etc)
- NÃO contém: `R$`, `valor`, `calcular_orcamento`, `consultar_horarios`, `gerar_link_sinal`

**Anchors do `regras.js`:**
- R1: nunca fala valor — `"sobre valor o tatuador confirma"`
- R2: `calcular_orcamento` não disponível
- R3: defesa profundidade — supressão de valores em FAQ
- R4: cover-up = handoff imediato
- R5: cor/P&C inferida, não perguntada
- R6: primeira tattoo não perguntada
- R7: data/disponibilidade não perguntada nesta fase
- R8: NÃO pede dados de cadastro (esses são fase 2)

- [ ] Step 1: criar `fluxo.js`
- [ ] Step 2: criar `regras.js`
- [ ] Step 3: criar `few-shot.js` (4-5 exemplos: fluxo completo + cliente perguntou preço deflete + cover-up imediato + cliente sem tamanho)
- [ ] Step 4: criar `few-shot-tenant.js` (lê `tenant.fewshots_por_modo.coleta_tattoo`)
- [ ] Step 5: criar `generate.js` (compõe blocos)
- [ ] Step 6: smoke test
- [ ] Step 7: commit

### Task 5.2: `coleta/cadastro/`

**Anchors do `fluxo.js`:**
- Header `"§3 FLUXO — Cadastro"`
- Mensagem de entrada (1 turno):
  > "Pra te passar o orçamento certinho, preciso de uns dados:
  > – Nome completo
  > – Data de nascimento
  > – E-mail (opcional)"
- Coleta tolerante: aceita os 3 dados em qualquer ordem ou mensagens separadas
- Validação `data_nascimento`: `dados_coletados(campo='data_nascimento', valor='YYYY-MM-DD')` — se tool retornar `gatilho: 'menor_idade'`, parar e fazer handoff
- E-mail opcional: aceita pular (cliente diz "sem email" / "passa")
- Após cadastro: chama `enviar_orcamento_tatuador` e transiciona pra `aguardando_tatuador`
- Mensagem de transição: *"Anotei tudo! Vou passar pro tatuador avaliar. Em breve te volto com o valor"*

**Anchors do `regras.js`:**
- R1: ainda não fala valor (cadastro vem antes do orçamento do tatuador)
- R2: e-mail é OPCIONAL — não insistir, aceitar pular após 1 tentativa
- R3: data nascimento aceita formatos `dd/mm/aaaa`, `dd-mm-aaaa`, `aaaa-mm-dd`, `dd de mes de aaaa` — tool `dados_coletados` normaliza
- R4: nome completo = pelo menos 2 palavras (validar antes de gravar)

- [ ] Steps 1-7 análogos à 5.1

### Task 5.3: `coleta/proposta/`

**Anchors do `fluxo.js`:**
- Header `"§3 FLUXO — Proposta"`
- Estado inicial `propondo_valor`: usa `consultar_proposta_tatuador` se valor não está no contexto, depois apresenta:
  > "Pelo seu trabalho, o tatuador fechou em R$ {valor_proposto}. Bora marcar?"
- 3 caminhos do cliente:
  - **Aceita** (palavras: fechado, topo, pode, vamos, sim, beleza, ok, fechou) → `consultar_horarios_livres` + apresenta slots → `reservar_horario` → `gerar_link_sinal`
  - **Pede desconto** (palavras: caro, desconto, menos, mais barato, deixa por X, valor menor) → resposta:
    > "Vou levar pra ele analisar essa proposta — quem fecha o valor é o tatuador. Em breve te dou um retorno."
    + chama `enviar_objecao_tatuador(valor_pedido_cliente)`. Se cliente não disse valor exato, perguntar antes: *"Quanto tu tava pensando?"*
  - **Adia** (palavras: vou ver, depois, te volto, deixa eu pensar, te aviso) → resposta:
    > "Tranquilo! Qualquer coisa é só me chamar."
    + estado `lead_frio`, bot para de responder

- Após decisão_desconto recebida (estado `aguardando_decisao_desconto` → mudou):
  - **Aceito**: *"Show! Ele topou em R$ {novo_valor}. Bora marcar?"* + segue agendamento
  - **Recusado**: *"Ele preferiu manter R$ {valor_proposto}. Tá fechado pra ti?"* + espera reação

**Anchors do `regras.js`:**
- R1: valor proposto vem de `valor_proposto` da conversa, NÃO calcula
- R2: PROIBIDO usar palavras "contraproposta", "contra-oferta"
- R3: PROIBIDO oferecer desconto sem aval do tatuador
- R4: agendamento usa as tools existentes: `consultar_horarios_livres`, `reservar_horario`, `gerar_link_sinal`
- R5: link de sinal segue formato existente (URL crua, sem markdown)

- [ ] Steps 1-7 análogos

---

## Fase 6 — Testes (Tier 1)

### Task 6.1: Fixtures

**File:** `tests/prompts/fixtures/tenant-coleta.js` (criar)

```javascript
import { tenantCanonico } from './tenant-canonico.js';

export const tenantColeta = {
  ...tenantCanonico,
  id: '00000000-0000-0000-0000-000000000010',
  config_precificacao: { modo: 'coleta', sinal_percentual: 30 },
  tatuador_telegram_chat_id: '123456789',
  tatuador_telegram_username: 'lina_tat',
  fewshots_por_modo: { coleta_tattoo: [], coleta_cadastro: [], coleta_proposta: [], exato: [] }
};

export const conversaColetaTattoo = {
  id: 'conv-001', estado_agente: 'coletando_tattoo',
  dados_coletados: {}, dados_cadastro: {}
};
export const conversaColetaCadastro = {
  id: 'conv-002', estado_agente: 'coletando_cadastro',
  dados_coletados: { descricao_tattoo: 'rosa', tamanho_cm: 10, local_corpo: 'antebraco' },
  dados_cadastro: {}
};
export const conversaColetaProposta = {
  id: 'conv-003', estado_agente: 'propondo_valor',
  valor_proposto: 750, orcid: 'orc_test01',
  dados_coletados: { descricao_tattoo: 'rosa', tamanho_cm: 10, local_corpo: 'antebraco' },
  dados_cadastro: { nome: 'Maria Silva', data_nascimento: '1995-03-12', email: 'maria@x.com' }
};
```

- [ ] Step 1-2: criar + commit

### Task 6.2: Snapshots

- [ ] Step 1: Rodar `UPDATE_SNAPSHOTS=1 npm test tests/prompts/snapshot.test.mjs`
- [ ] Step 2: Verificar 4 snapshots gerados (coleta-tattoo, coleta-cadastro, coleta-proposta, exato)
- [ ] Step 3: Commit

### Task 6.3: Contratos

**Files:** `tests/prompts/contracts/{coleta-tattoo,coleta-cadastro,coleta-proposta}.js` (criar)

```javascript
// coleta-tattoo.js
export default {
  must_contain: ['§3 FLUXO', 'descricao_tattoo', 'tamanho_cm', 'local_corpo', 'dados_coletados', 'acionar_handoff'],
  must_not_contain: ['R$', 'calcular_orcamento', 'consultar_horarios', 'gerar_link_sinal', 'nome completo', 'data de nascimento'],
  max_tokens: 8000,
};

// coleta-cadastro.js
export default {
  must_contain: ['Cadastro', 'Nome completo', 'Data de nascimento', 'E-mail', 'opcional', 'dados_coletados'],
  must_not_contain: ['R$', 'calcular_orcamento', 'gerar_link_sinal'],
  max_tokens: 6000,
};

// coleta-proposta.js
export default {
  must_contain: ['valor_proposto', 'consultar_horarios', 'reservar_horario', 'gerar_link_sinal', 'enviar_objecao_tatuador'],
  must_not_contain: ['calcular_orcamento', 'contraproposta', 'contra-oferta'],
  max_tokens: 8000,
};
```

- [ ] Step 1-2: criar + commit

### Task 6.4: Invariants

- [ ] Atualizar `tests/prompts/invariants.test.mjs` pra cobrir 4 prompts (3 coleta + exato)
- [ ] Adicionar invariante: nenhum prompt vaza `INKFLOW_TELEGRAM_BOT_TOKEN` ou `tatuador_telegram_chat_id` numérico bruto

### Task 6.5: Linter contaminação

- [ ] Atualizar `tests/prompts/contamination.test.mjs`: fixture com FAQ suja contendo "R$ 500", roda nos 3 prompts coleta — assertion que valor monetário NÃO aparece em coleta-tattoo nem coleta-cadastro

### Task 6.6: Tests das tools (já feitos nas Tasks 3.1-3.4)

Confirmar que todos passam: `npm test tests/tools/`.

---

## Fase 7 — UI

### Task 7.1: Onboarding

**File:** `onboarding.html` (modificar)

- [ ] Step 1: `qa-intro` — remover botão Faixa, default `coleta`, link "modo avançado: Exato (beta)"
- [ ] Step 2: criar step `qa-tatuador-telegram` (QR + polling + status)
- [ ] Step 3: criar step `qa-handoff-triggers` (lista checkbox + custom)
- [ ] Step 4: criar step `qa-cadastro-cliente` (default ativo: nome+data+email opc)
- [ ] Step 5: routing: Coleta default → 4 steps; Exato → steps de tabela de preços (existentes)
- [ ] Step 6: nav-dots dinâmico
- [ ] Step 7: commit

### Task 7.2: Studio

**File:** `studio.html` (modificar)

- [ ] Step 1: tab "Agente": modo Coleta default + Exato badge "Beta", remover Faixa
- [ ] Step 2: nova tab "Telegram tatuador" com status + reconectar + histórico mensagens
- [ ] Step 3: commit

### Task 7.3: Admin dashboard

**File:** `admin.html` (modificar)

- [ ] Step 1: card "Orçamentos" mostrando contagens por estado_agente
- [ ] Step 2: tabela com últimos 20 orçamentos (orcid, tenant, estado, tempo aberto)
- [ ] Step 3: commit

---

## Fase 8 — Documentação canonical

### Task 8.1: Atualizar docs

- [ ] **`docs/canonical/stack.md`**: remover Faixa, adicionar Telegram bot como componente, adicionar tools novas
- [ ] **`docs/canonical/flows.md`**: novo fluxo "Coleta v2 — orçamento + handoff Telegram + reentrada" com diagrama Mermaid; substituir o atual "Webhook Evolution → n8n → bot" pela versão coleta-aware
- [ ] **`docs/canonical/ids.md`**: adicionar endpoints `/api/telegram/webhook`, `/api/telegram/connect`, `/api/check-telegram-connected`, novas tools, novas colunas
- [ ] **`docs/canonical/index.md`**: links pros docs atualizados
- [ ] **`CHANGELOG.md`**: entry v? — Modo Coleta v2

- [ ] Commit cada arquivo separadamente pra histórico limpo.

---

## Fase 9 — n8n

### Task 9.1: Workflow principal

**Workflow:** `INKFLOW — MEU NOVO WORK - SAAS` (id `PmCMHTaTi07XGgWh`)

- [ ] Step 1: Atualizar node de carga de prompt — quando `prompt === null` (estado de espera), curto-circuita e não chama LLM. Apenas loga e retorna.
- [ ] Step 2: Adicionar node `If — modo === 'coleta' && estado === 'aguardando_tatuador'` → não responde, envia ack se necessário
- [ ] Step 3: `update_workflow` no n8n + `publish_workflow`

### Task 9.2: Workflow novo de reentrada

**Workflow novo:** `INKFLOW — Reentrada Telegram`

- [ ] Step 1: Trigger webhook (URL salva em `N8N_REENTRADA_WEBHOOK_URL` env var)
- [ ] Step 2: Lê conversa por orcid/conversa_id
- [ ] Step 3: Carrega prompt atualizado (estado mudou) via `/api/tools/prompt`
- [ ] Step 4: Chama Claude/OpenAI com novo prompt + histórico
- [ ] Step 5: Envia resposta via Evolution
- [ ] Step 6: Loga em `chat_messages`, `tool_calls_log`
- [ ] Step 7: `create_workflow_from_code` + `publish_workflow`

---

## Fase 10 — Smoke E2E

### Task 10.1: Smoke Coleta

- [ ] Criar tenant teste com modo Coleta + Telegram conectado
- [ ] Mandar mensagem WhatsApp simulando cliente: "queria orçar uma rosa fineline 10cm no antebraço"
- [ ] Bot deve coletar campos restantes (estilo opc), pedir cadastro, confirmar handoff
- [ ] Verificar Telegram do tatuador recebe mensagem com botões
- [ ] Clicar "Fechar valor" → digitar 750
- [ ] Verificar bot reentra na conversa do cliente: "Pelo seu trabalho fechou em R$ 750..."
- [ ] Cliente: "consegue 600?"
- [ ] Bot: "vou levar pro tatuador analisar..."
- [ ] Telegram tatuador: objeção com "Aceitar 600 / Manter 750"
- [ ] Tatuador clica "Aceitar 600"
- [ ] Bot: "Show! Ele topou em R$ 600. Bora marcar?"
- [ ] Cliente aceita → fluxo agendamento → link sinal
- [ ] Documentar resultado em `evals/smoke-coleta-v2-{data}.md`

### Task 10.2: Smoke Exato

- [ ] Tenant teste modo Exato — repetir fluxo Faixa antigo (calcular_orcamento direto)
- [ ] Confirmar que continua funcionando

---

## Critérios de done

- [ ] Todos commits pequenos, mensagens descritivas
- [ ] Bateria de testes verde: snapshots, contracts, invariants, contamination, tools, telegram-webhook
- [ ] Smoke E2E Coleta + Exato documentados
- [ ] Docs canonical atualizados
- [ ] Workflow n8n principal e reentrada publicados (`publish_workflow` confirmado)
- [ ] PR aberto pra `main`, descrição com link pro spec, screenshots do Telegram, link do smoke

---

## Estimativa de esforço

- Fase 0 (preflight): 30min
- Fase 1 (schema): 1h
- Fase 2 (deletar Faixa): 1h
- Fase 3 (tools): 1 dia (4 tools × ~1.5h)
- Fase 4 (Telegram endpoints): 1 dia
- Fase 5 (prompts coleta): 1.5 dias (3 fases × 5 arquivos cada + escrita)
- Fase 6 (testes): 0.5 dia
- Fase 7 (UI): 1.5 dias
- Fase 8 (docs): 0.5 dia
- Fase 9 (n8n): 0.5 dia
- Fase 10 (smoke): 0.5 dia

**Total: ~7-9 dias de execução** com Claude assistido. Tempo real maior se sessões forem fragmentadas.

---

## Notas de execução

- Branch única `feat/modo-coleta-v2-principal` durante toda execução. PR só ao final, com tudo verde.
- Cada commit roda os testes da fase antes de fechar.
- Se baseline de tests quebra durante execução, **parar** e investigar — qualidade > velocidade (feedback Leandro).
- Atualizar Painel + Mapa geral ao fim de cada fase grande (1, 4, 7, 10) — não só ao final.
- Se algo do plano se mostrar errado durante execução, **parar e revisar o plano antes de continuar**.
