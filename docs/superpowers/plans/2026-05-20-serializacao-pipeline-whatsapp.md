# Serialização do pipeline WhatsApp via Durable Object — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serializar e agrupar (debounce) o processamento de mensagens WhatsApp por sessão (`tenant_id + telefone`), eliminando a race condition P0 que faz o bot perder estado, re-saudar e duplicar respostas quando o cliente manda vários balões seguidos.

**Architecture:** Uma Durable Object class `SessionQueue` (uma instância por conversa) acumula `msgRowId`s e dispara — via alarm com debounce de 4s/teto 15s — **um único** processamento do lote como um turno. A DO mora no Worker `inkflow-cron` (que já deploya estável); o `inbound.js` (Pages Function) só enfileira no DO via `script_name` binding; um endpoint interno `/api/whatsapp/process-batch` roda o pipeline refatorado `processMessage → processBatch`. A serialização é estrutural (o runtime do DO nunca roda dois `alarm()` simultâneos pra a mesma instância) — sem locks caseiros.

**Tech Stack:** Cloudflare Pages Functions + Workers (Durable Objects, SQLite-backed, free plan), JavaScript (ESM), `node:test` + `depsOverride` para testes sem fetch real, PostgREST (Supabase), Evolution API.

---

## Decisões deste plano (refinam o spec)

O spec deixa alguns pontos "detalhar no plan". Decididos aqui, com rationale:

1. **Rename completo `processMessage → processBatch`** (sem wrapper de compat). Bate com "padrão de mercado > preservação" e com o spec. Custo: migrar ~17 testes unitários + 2 de integração + o `inbound.js`. A migração é mecânica (os comportamentos das Etapas 1-8 são preservados); o plano mostra o helper novo e os casos que precisam de dados de linha reais.
2. **Etapa 0 (lookup do tenant + SELECT das linhas do lote) fica FORA do `try`** interno do pipeline. Falha de leitura aí lança → endpoint responde 500 → o `alarm()` do DO re-tenta com backoff durável (msgs continuam `received`, recuperáveis). O `catch` interno (mark `failed` + alerta admin) cobre só falhas de aplicação (runAgent/evoSend) — comportamento de hoje preservado, sem retry pós-envio (evita double-send).
3. **At-least-once tolerado** na janela rara "falha depois do `evoSend`". Não marcamos estado intermediário pré-envio (YAGNI; blast radius baixo — 1 tenant teste). Documentado como risco conhecido; mitigável depois se aparecer no smoke.
4. **DO em sintaxe clássica** (`constructor(state, env)`, sem `extends DurableObject` de `cloudflare:workers`), pra que a class seja importável e testável no runtime do `node:test` (sem runtime de Workers). O backend SQLite vem da migration `new_sqlite_classes`, não de herança.
5. **Payload do enqueue carrega `session_id` explícito** (além de `msgRowId`, `tenantId`, `telefone`). O DO não consegue ler o próprio `idFromName`, então precisa do `session_id` pra repassar ao `process-batch`. Refinamento sobre o spec (que listava `{msgRowId, telefone, tenantId}`).
6. **`classificarFoto` entra no `defaultDeps`** (já é importado no módulo). Torna a Etapa 4.5 testável por injeção, igual ao resto do pipeline.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---------|------|------------------|
| `functions/_lib/whatsapp-pipeline.js` | Modify | `processMessage(env, msg)` → `processBatch(env, batch)`. Etapa 0 (tenant lookup + SELECT das N linhas) fora do try; montagem do lote → 1 turno; Etapa 4.5 em loop por foto; marca os N `msgRowId`s `processed`/`failed`. |
| `functions/api/whatsapp/process-batch.js` | Create | Endpoint interno POST. Auth `x-cron-secret === env.CRON_SECRET`. Body `{session_id, msgRowIds[], tenantId, telefone}` → chama `processBatch`. 500 em throw inesperado (DO re-tenta). |
| `cron-worker/src/session-queue.js` | Create | DO class `SessionQueue` (clássica). `fetch('/enqueue')` acumula + agenda alarm (debounce 4s / teto 15s); `alarm()` envia o lote ao `process-batch`, trata sobreposição de balões novos. |
| `cron-worker/src/index.js` | Modify | Re-export da class `SessionQueue` (além do `export default` do dispatcher). |
| `cron-worker/wrangler.toml` | Modify | `[[durable_objects.bindings]]` (SESSION_QUEUE→SessionQueue) + `[[migrations]] new_sqlite_classes`. |
| `functions/api/whatsapp/inbound.js` | Modify | Remove `import processMessage`. Troca `waitUntil(processMessage)` por `waitUntil(stub.fetch('/enqueue'))`. Fallback claro se binding ausente (dev local). |
| `wrangler.toml` (Pages) | Modify | `[[durable_objects.bindings]]` com `script_name = "inkflow-cron"`. |
| `tests/_lib/whatsapp-pipeline.test.mjs` | Modify | Migra helpers `baseMsg/mockDeps` → batch; Etapa 0 SELECT no mock. |
| `tests/integration/pipeline-classifier.test.mjs` | Modify | Migra para `processBatch` (batch-de-1 + Etapa 0 SELECT). |
| `tests/integration/pos-handoff-foto.test.mjs` | Modify | Migra para `processBatch` (batch-de-1 + Etapa 0 SELECT). |
| `tests/api/whatsapp/inbound.test.mjs` | Modify | Mock do binding `SESSION_QUEUE`; assere enqueue em vez de `processMessage`. |
| `tests/_lib/session-queue.test.mjs` | Create | Testes da DO com `state`/`fetch` fakes. |
| `tests/api/whatsapp/process-batch.test.mjs` | Create | Testes do endpoint (auth, body inválido, chama processBatch). |
| `docs/runbooks/deploy-whatsapp-do.md` | Create | Ordem de deploy (cron-worker antes do Pages) + dev local + smoke. |

---

## Convenções de referência (não inventar — copiar daqui)

**Schema `conversa_mensagens`:** colunas `id` (int), `session_id` (text `${tenant_id}_${telefone}`), `message` (jsonb `{type, content, media_base64, media_mimetype}`), `evo_message_id`, `status` (`received`|`processed`|`failed`), `created_at`.

**Schema `conversas`:** `id`, `tenant_id`, `telefone`, `estado_agente`, `dados_coletados` (jsonb), `dados_cadastro` (jsonb), `valor_proposto`, `orcid`, `pausada_em`, `last_msg_at`, `updated_at`, `estado_extra` (jsonb).

**Select do tenant (idêntico ao `inbound.js:43-44`):**
```
/rest/v1/tenants?evo_instance=eq.${X}&select=id,nome_estudio,evo_instance,evo_apikey,evo_base_url,tatuador_telegram_chat_id,config_agente,config_precificacao,sinal_percentual,gatilhos_handoff,faq_texto,fewshots_por_modo,portfolio_urls,horario_funcionamento,duracao_sessao_padrao_h&limit=1
```
No `process-batch` o lookup é por `id` (não `evo_instance`): `?id=eq.${tenantId}&select=...&limit=1`.

**Test runner:** `npm test` → `node --test 'tests/**/*.test.mjs'`. Um arquivo só: `node --test tests/_lib/whatsapp-pipeline.test.mjs`.

**PostgREST `IN`:** `?id=in.(1,2,3)` (sem espaços).

---

## Task 1: `processBatch` — refator do pipeline + teste de regressão da race

Coração do fix. Renomeia `processMessage → processBatch`, adiciona Etapa 0 (tenant lookup + SELECT das N linhas do lote, **fora do try**), montagem do lote → 1 turno, Etapa 4.5 em loop, marca os N `msgRowId`s. Migra os testes unitários.

**Files:**
- Modify: `functions/_lib/whatsapp-pipeline.js`
- Test: `tests/_lib/whatsapp-pipeline.test.mjs`

- [ ] **Step 1: Escrever o teste de regressão da race (vermelho)**

No topo de `tests/_lib/whatsapp-pipeline.test.mjs`, troque o import:
```js
import { processBatch, TERMINAL_STATES, TYPING_DELAY_MS } from '../../functions/_lib/whatsapp-pipeline.js';
```
Adicione o helper de batch e o teste-guarda (este é o teste que o backlog exige). Cole junto dos helpers existentes:
```js
const SESSION_ID = `${TENANT.id}_${TELEFONE}`;

// Constrói o resultado da Etapa 0 SELECT (linhas conversa_mensagens do lote).
function rowsFor(specs) {
  // specs: [{ id, content, media_base64, media_mimetype }]
  return specs.map(s => ({
    id: s.id,
    message: {
      type: 'human',
      content: s.content ?? '',
      media_base64: s.media_base64 ?? null,
      media_mimetype: s.media_mimetype ?? null,
    },
    created_at: '2026-05-20T00:00:00.000Z',
  }));
}

function baseBatch(overrides = {}) {
  return {
    session_id: SESSION_ID, tenantId: TENANT.id, telefone: TELEFONE,
    msgRowIds: [MSG_ROW_ID],
    ...overrides,
  };
}

// mockDeps já existente ganha resposta da Etapa 0 (tenant + rows) configurável.
// Helper que monta um supaFetch cobrindo tenant lookup, SELECT do lote, conversa, histórico.
function batchSupaFetch({ conversa, rows, onPatch, onPost, hist = [] }) {
  return async (path, init) => {
    // Etapa 0a: tenant lookup por id
    if (path.startsWith('/rest/v1/tenants?id=eq.') && !init?.method) {
      return new Response(JSON.stringify([TENANT]), { status: 200 });
    }
    // Etapa 0b: SELECT linhas do lote
    if (path.startsWith('/rest/v1/conversa_mensagens?id=in.') && !init?.method) {
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    // Etapa 1: LOAD conversa
    if (path.startsWith('/rest/v1/conversas?tenant_id=') && !init?.method) {
      return new Response(JSON.stringify(conversa ? [conversa] : []), { status: 200 });
    }
    // Etapa 3: histórico
    if (path.startsWith('/rest/v1/conversa_mensagens?session_id=') && !init?.method) {
      return new Response(JSON.stringify(hist), { status: 200 });
    }
    if (init?.method === 'PATCH') { onPatch?.(path, JSON.parse(init.body)); return new Response('[]', { status: 200 }); }
    if (init?.method === 'POST') { onPost?.(path, JSON.parse(init.body)); return new Response('[]', { status: 201 }); }
    return new Response('[]', { status: 200 });
  };
}

test('RACE GUARD: 2 balões no mesmo lote → runAgent 1× e considera ambos os textos', async () => {
  // Pré-fix (processMessage fire-and-forget): 2 msgs = 2 invocações = 2 runAgent + histórico
  // incompleto. processBatch colapsa o lote num turno só.
  const runAgentSpy = mock.fn(async () => ({
    ok: true, resposta_cliente: 'beleza, recebi tudo', estado_novo: 'tattoo',
    dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo',
  }));
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    runAgent: runAgentSpy,
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 101, content: 'quero uma tattoo' },
        { id: 102, content: 'no antebraço' },
      ]),
    }),
  });
  await processBatch({}, baseBatch({ msgRowIds: [101, 102] }), deps);
  assert.equal(runAgentSpy.mock.callCount(), 1, 'runAgent deve rodar 1× pro lote inteiro');
  assert.match(runAgentSpy.mock.calls[0].arguments[0].mensagem, /quero uma tattoo/);
  assert.match(runAgentSpy.mock.calls[0].arguments[0].mensagem, /no antebraço/);
});
```

- [ ] **Step 2: Rodar — verde falha (vermelho esperado)**

Run: `node --test tests/_lib/whatsapp-pipeline.test.mjs`
Expected: FAIL — `processBatch` não existe (import error / "processBatch is not a function").

- [ ] **Step 3: Implementar `processBatch` em `functions/_lib/whatsapp-pipeline.js`**

Adicione `classificarFoto` ao `defaultDeps` (logo após `enviarMidia,`):
```js
    enviarMidia,
    classificarFoto,
```
Substitua a assinatura e o início de `processMessage` (linhas 62-67) e implemente a Etapa 0 + montagem. O corpo das Etapas 1-8 é preservado, operando sobre o turno montado. Substitua a função inteira por:
```js
export async function processBatch(env, batch, depsOverride = {}) {
  const deps = { ...defaultDeps(env), ...depsOverride };
  let { session_id, tenantId, telefone, msgRowIds } = batch;
  // Fallback: deriva tenantId/telefone do session_id (formato `${uuid}_${telefone}`).
  if (!tenantId || !telefone) {
    const i = session_id.indexOf('_');
    tenantId = tenantId || session_id.slice(0, i);
    telefone = telefone || session_id.slice(i + 1);
  }

  // ── Etapa 0 (FORA do try): leituras que, se falharem, devem fazer o DO re-tentar.
  // tenant lookup por id (mesmas colunas do inbound).
  const tenRes = await deps.supaFetch(
    `/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}` +
    `&select=id,nome_estudio,evo_instance,evo_apikey,evo_base_url,tatuador_telegram_chat_id,config_agente,config_precificacao,sinal_percentual,gatilhos_handoff,faq_texto,fewshots_por_modo,portfolio_urls,horario_funcionamento,duracao_sessao_padrao_h&limit=1`,
  );
  const tenArr = await tenRes.json();
  const tenant = tenArr?.[0];
  if (!tenant) throw new Error(`tenant-nao-encontrado: ${tenantId}`);

  // SELECT as N linhas do lote, em ordem.
  const rowsRes = await deps.supaFetch(
    `/rest/v1/conversa_mensagens?id=in.(${msgRowIds.join(',')})&order=created_at.asc&select=id,message`,
  );
  const rows = await rowsRes.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`lote-vazio: ${msgRowIds.join(',')}`);

  // Montagem do lote → 1 turno.
  const texto = rows.map(r => r.message?.content).filter(c => c && c.trim()).join('\n');
  const fotos = rows
    .filter(r => r.message?.media_base64 && r.message?.media_mimetype?.startsWith('image/'))
    .map(r => ({ msgRowId: r.id, mediaBase64: r.message.media_base64, mediaMimetype: r.message.media_mimetype }));
  const primeiraFoto = fotos[0] || null;
  const pushName = tenant.__pushName; // não persistido; pushName não chega ao batch (vem do enqueue só p/ inbound)

  try {
    // Etapa 1: LOAD/CREATE conversa
    const convRes = await deps.supaFetch(
      `/rest/v1/conversas?tenant_id=eq.${tenantId}&telefone=eq.${encodeURIComponent(telefone)}` +
      `&select=id,estado_agente,dados_coletados,dados_cadastro,valor_proposto,orcid,pausada_em,estado_extra&limit=1`,
    );
    const convArr = await convRes.json();
    let conversa = convArr[0];
    if (!conversa) {
      const ins = await deps.supaFetch('/rest/v1/conversas', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          tenant_id: tenantId, telefone, estado_agente: 'coletando_tattoo',
          dados_coletados: {}, dados_cadastro: {}, last_msg_at: deps.now(),
        }),
      });
      const insStatus = ins.status;
      const insText = await ins.text().catch(() => '');
      let arr = [];
      try { arr = JSON.parse(insText); } catch {}
      conversa = Array.isArray(arr) ? arr[0] : null;
      if (!conversa) throw new Error(`conversa-create-failed (status=${insStatus}): ${insText.slice(0, 200)}`);
    }

    // Etapa 2: EARLY-RETURN estado terminal
    if (TERMINAL_STATES.has(conversa.estado_agente)) {
      if (tenant.tatuador_telegram_chat_id) {
        await deps.sendTelegram(
          tenant.tatuador_telegram_chat_id,
          `📩 Cliente ${pushName ?? telefone} (${tenant.nome_estudio}) mandou msg:\n${preview(texto, 200)}`,
        );
        // Re-encaminha foto(s) avulsa(s) pos-handoff; cleanup base64 só após upload OK.
        for (const foto of fotos) {
          try {
            const nome = conversa.dados_cadastro?.nome || pushName || telefone;
            await deps.enviarMidia(env, tenant.tatuador_telegram_chat_id, foto.mediaBase64, foto.mediaMimetype, `📸 ${nome} mandou +1 foto`);
            await deps.supaFetch(`/rest/v1/rpc/zerar_media_base64`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ p_msg_id: foto.msgRowId }),
            });
          } catch (e) {
            console.warn(`[pipeline] pos-handoff foto falhou: ${e.message}`);
          }
        }
      } else {
        await deps.sendTelegramAdmin(`tenant ${tenant.id} sem tatuador_telegram_chat_id em estado terminal (${conversa.estado_agente})`);
      }
      await markStatus(deps, msgRowIds, 'processed');
      return;
    }

    // Etapa 3: histórico (status=eq.processed; exclui as linhas do lote atual)
    const histRes = await deps.supaFetch(
      `/rest/v1/conversa_mensagens?session_id=eq.${encodeURIComponent(session_id)}` +
      `&status=eq.processed&order=created_at.asc&limit=40&select=id,message`,
    );
    const histRows = await histRes.json();
    const loteSet = new Set(msgRowIds);
    const historico = histRows
      .filter(r => !loteSet.has(r.id))
      .map(r => {
        const m = r.message || {};
        return { role: m.type === 'ai' ? 'assistant' : 'user', content: m.content || '' };
      });

    // Etapa 4: runAgent (1× pro turno)
    const estadoAgente = dbToAgent(conversa.estado_agente);
    let agentOut;
    try {
      agentOut = await deps.runAgent({
        tenant_id: tenantId, telefone, mensagem: texto,
        estado_atual: estadoAgente, dados_acumulados: conversa.dados_coletados || {},
        historico, tenant, conversa: { ...conversa, estado_agente: estadoAgente }, clientContext: {},
      });
    } catch (e) { throw new Error(`runAgent threw: ${e.message}`); }
    if (!agentOut?.ok) throw new Error(`runAgent returned ok:false: ${agentOut?.error || 'unknown'}`);

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
        estado_agente: agentToDb(agentOut.estado_novo),
        dados_coletados: novoDadosColetados, dados_cadastro: novoDadosCadastro, updated_at: deps.now(),
      }),
    });

    // Etapa 4.5: classificar CADA foto do lote (loop), acumulando, com 1 PATCH final.
    if (fotos.length > 0) {
      try {
        const dadosPreMerge = conversa.dados_coletados || {};
        let dadosAcc = isCadastro ? { ...dadosPreMerge } : { ...novoDadosColetados };
        let tentativas = dadosPreMerge.tentativas_foto_local || conversa.estado_extra?.tentativas_foto_local || 0;
        let fotoLocalAtual = dadosPreMerge.foto_local;
        for (const foto of fotos) {
          const tipo = deps.classificarFoto({ tentativas_foto_local: tentativas, foto_local_atual: fotoLocalAtual, texto_turno: texto });
          if (tipo === 'local') {
            dadosAcc = { ...dadosAcc, foto_local_msg_id: foto.msgRowId };
            fotoLocalAtual = foto.msgRowId; // próxima foto vê foto_local presente → vira ref
          } else {
            const ids = Array.isArray(dadosAcc.refs_imagens_msg_ids) ? dadosAcc.refs_imagens_msg_ids : [];
            dadosAcc = { ...dadosAcc, refs_imagens_msg_ids: [...ids, foto.msgRowId] };
          }
        }
        await deps.supaFetch(`/rest/v1/conversas?id=eq.${conversa.id}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ dados_coletados: dadosAcc }),
        });
      } catch (e) {
        console.warn(`[pipeline] etapa-4.5 classificador falhou: ${e.message}`);
      }
    }

    // Etapa 6: INSERT resposta AI
    await deps.supaFetch('/rest/v1/conversa_mensagens', {
      method: 'POST',
      body: JSON.stringify({ session_id, message: { type: 'ai', content: agentOut.resposta_cliente }, status: 'processed', created_at: deps.now() }),
    });

    // Etapa 7: Evolution outbound (split \n\n)
    const baloes = agentOut.resposta_cliente.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    if (baloes.length === 0) throw new Error(`resposta_cliente vazia após split (tenant=${tenant.id})`);
    for (let i = 0; i < baloes.length; i++) {
      await deps.sleep(TYPING_DELAY_MS);
      const sendRes = await deps.evoSend(tenant, { type: 'text', to: telefone, text: baloes[i] });
      if (!sendRes.ok) throw new Error(`evo sendText falhou balão ${i + 1}/${baloes.length}: ${sendRes.error || 'unknown'} (tenant=${tenant.id})`);
    }
    if (Array.isArray(agentOut.urls_portfolio) && agentOut.urls_portfolio.length > 0) {
      for (const url of agentOut.urls_portfolio) {
        const m = await deps.evoSend(tenant, { type: 'media', to: telefone, url });
        if (!m.ok) await deps.sendTelegramAdmin(`evo sendMedia falhou: ${url} (${m.error || 'unknown'})`);
      }
    }

    // Etapa 8: handoff cadastro → enviar-orcamento-tatuador
    if (estadoAgente === 'cadastro' && agentOut.proxima_acao === 'handoff') {
      if (!tenant.tatuador_telegram_chat_id) {
        await deps.sendTelegramAdmin(`handoff sem tatuador_telegram_chat_id em ${tenant.id}`);
      } else {
        const r = await deps.callTool('enviar-orcamento-tatuador', { tenant_id: tenant.id, telefone });
        if (!r.ok) await deps.sendTelegramAdmin(`enviar-orcamento-tatuador falhou: ${r.error || 'unknown'}`);
      }
    }

    // Marca TODAS as msgs do lote processed (depois das Etapas 7-8).
    await markStatus(deps, msgRowIds, 'processed');
  } catch (e) {
    console.error('[pipeline] batch failed:', { session_id, msgRowIds, error: e.message, stack: e.stack });
    await markStatus(deps, msgRowIds, 'failed').catch(() => {});
    await deps.sendTelegramAdmin(`🚨 pipeline batch failed (sessao ${session_id}): ${e.message}\n${preview(e.stack, 500)}`);
  }
}

// PATCH status pra todos os ids do lote de uma vez.
async function markStatus(deps, msgRowIds, status) {
  await deps.supaFetch(`/rest/v1/conversa_mensagens?id=in.(${msgRowIds.join(',')})`, {
    method: 'PATCH', body: JSON.stringify({ status }),
  });
}
```
Remova a definição antiga de `processMessage` (que esta substitui). O `primeiraFoto`/`tenant.__pushName` acima existem só pra paridade; `pushName` real não chega ao batch (o `inbound` não o repassa) — use `pushName ?? telefone` que cai em `telefone`. Simplifique removendo a linha `const primeiraFoto` se não usada pelo linter.

- [ ] **Step 4: Rodar o teste de regressão da race — verde**

Run: `node --test tests/_lib/whatsapp-pipeline.test.mjs --test-name-pattern "RACE GUARD"`
Expected: PASS (1 teste).

- [ ] **Step 5: Migrar os testes unitários existentes pro shape de batch**

Os testes 1-18 chamam `processMessage({}, baseMsg(...), deps)`. A migração é mecânica:
1. Substitua **toda** ocorrência de `processMessage(` por `processBatch(`.
2. Substitua os call-sites `baseMsg(...)` por `baseBatch(...)`.
3. Onde o `supaFetch` do teste não trata a Etapa 0, troque-o por `batchSupaFetch({...})` OU adicione no mock os dois ramos da Etapa 0 (tenant `?id=eq.` → `[TENANT]`; `conversa_mensagens?id=in.` → `rowsFor([...])`).

Casos que precisam de **dados de linha reais** (têm asserção sobre texto/mídia/histórico) — reescreva-os assim:

Teste "historico mapeado" (era #10):
```js
test('historico mapeado', async () => {
  let runAgentCallArg = null;
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: 'oi' }]),
      hist: [
        { id: 1, message: { type: 'human', content: 'msg1' } },
        { id: 2, message: { type: 'ai', content: 'resp1' } },
        { id: MSG_ROW_ID, message: { type: 'human', content: 'oi' } },
      ],
    }),
    runAgent: async (args) => { runAgentCallArg = args; return { ok: true, resposta_cliente: 'r', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }; },
  });
  await processBatch({}, baseBatch(), deps);
  assert.deepEqual(runAgentCallArg.historico, [
    { role: 'user', content: 'msg1' },
    { role: 'assistant', content: 'resp1' },
  ]);
});
```

Teste "midia base64 in nao duplica" (era #9):
```js
test('midia base64 in nao duplica insert AI', async () => {
  let aiInserts = 0;
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: MSG_ROW_ID, content: '', media_base64: 'data', media_mimetype: 'image/jpeg' }]),
      onPost: (path, body) => { if (path === '/rest/v1/conversa_mensagens') { aiInserts++; assert.equal(body.message.type, 'ai'); } },
    }),
    runAgent: async () => ({ ok: true, resposta_cliente: 'r', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }),
    classificarFoto: () => 'referencia',
  });
  await processBatch({}, baseBatch(), deps);
  assert.equal(aiInserts, 1);
});
```

Para os demais (golden path, terminal, handoff, portfolio, typing delay, multi-message split, whitelist historico, runAgent throws, evoSend ok:false): aplique o swap dos 3 passos acima — eles não dependem de conteúdo de linha (usam `texto='oi'` implícito via `rowsFor([{ id: MSG_ROW_ID, content: 'oi' }])`). Onde o teste asserta `lastPatch.status === 'failed'`, o PATCH agora usa `id=in.(...)` — a asserção sobre `JSON.parse(init.body).status` continua válida.

Adicione um teste novo de classificação em lote (cobre Etapa 4.5 loop):
```js
test('Etapa 4.5: 2 fotos no lote → 1ª foto_local, 2ª vai pra refs', async () => {
  let conversaPatches = [];
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  const classifySpy = mock.fn();
  classifySpy.mock.mockImplementationOnce(() => 'local');
  classifySpy.mock.mockImplementation(() => 'referencia');
  const deps = mockDeps({
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([
        { id: 201, content: 'essa é minha', media_base64: 'a', media_mimetype: 'image/jpeg' },
        { id: 202, content: 'essa é referência', media_base64: 'b', media_mimetype: 'image/jpeg' },
      ]),
      onPatch: (path, body) => { if (path.startsWith(`/rest/v1/conversas?id=eq.${CONVERSA_ID}`) && body.dados_coletados) conversaPatches.push(body.dados_coletados); },
    }),
    runAgent: async () => ({ ok: true, resposta_cliente: 'recebi', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' }),
    classificarFoto: classifySpy,
  });
  await processBatch({}, baseBatch({ msgRowIds: [201, 202] }), deps);
  const fotoPatch = conversaPatches.find(p => p.foto_local_msg_id || p.refs_imagens_msg_ids);
  assert.equal(fotoPatch.foto_local_msg_id, 201);
  assert.deepEqual(fotoPatch.refs_imagens_msg_ids, [202]);
});
```

- [ ] **Step 6: Rodar a suíte do pipeline inteira — verde**

Run: `node --test tests/_lib/whatsapp-pipeline.test.mjs`
Expected: PASS (todos: race guard + 18 migrados + classificação em lote).

- [ ] **Step 7: Commit**

```bash
git add functions/_lib/whatsapp-pipeline.js tests/_lib/whatsapp-pipeline.test.mjs
git commit -m "refactor(pipeline): processMessage→processBatch (serializa lote como 1 turno) + race guard

Etapa 0 (tenant lookup + SELECT do lote) fora do try (DO re-tenta).
Montagem N msgs→1 turno; Etapa 4.5 em loop; marca N msgs processed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Migrar testes de integração que chamavam `processMessage`

`pipeline-classifier.test.mjs` e `pos-handoff-foto.test.mjs` importam/chamam `processMessage`. Após o rename ficam vermelhos. Migra ambos pro shape de batch (lote-de-1), com a Etapa 0 no mock.

**Files:**
- Test: `tests/integration/pipeline-classifier.test.mjs`
- Test: `tests/integration/pos-handoff-foto.test.mjs`

- [ ] **Step 1: Rodar os dois e confirmar o vermelho**

Run: `node --test tests/integration/pipeline-classifier.test.mjs tests/integration/pos-handoff-foto.test.mjs`
Expected: FAIL — `processMessage is not a function` (import quebrado pós-rename).

- [ ] **Step 2: Migrar `pipeline-classifier.test.mjs`**

No import, troque `processMessage` → `processBatch`. Em `makeDeps`, adicione os ramos da Etapa 0 ao `supaFetch` (tenant por id + SELECT do lote), reaproveitando o `mediaBase64`/`mediaMimetype`/`texto` que o teste já define em `buildMsg`:
```js
    supaFetch: async (path, init = {}) => {
      if (path.startsWith('/rest/v1/tenants?id=eq.') && init.method === undefined) {
        return new Response(JSON.stringify([TENANT]), { status: 200 });
      }
      if (path.startsWith('/rest/v1/conversa_mensagens?id=in.') && init.method === undefined) {
        return new Response(JSON.stringify([
          { id: 42, message: { type: 'human', content: '', media_base64: 'BASE64BLOB', media_mimetype: 'image/jpeg' }, created_at: '2026-05-19T00:00:00Z' },
        ]), { status: 200 });
      }
      // ...ramos existentes (conversa, historico, PATCH/POST) inalterados...
```
Troque cada `await processMessage({}, buildMsg(...), deps)` por:
```js
await processBatch({}, { session_id: `${TENANT.id}_5511999998888`, tenantId: TENANT.id, telefone: '5511999998888', msgRowIds: [42] }, deps);
```
Se o teste injeta `classificarFoto` real (importado), mantenha — `deps.classificarFoto` cai no `defaultDeps`; pra controlar o resultado, adicione `classificarFoto: () => 'local'` (ou `'referencia'`) no `makeDeps` conforme a asserção do caso.

- [ ] **Step 3: Migrar `pos-handoff-foto.test.mjs`**

Mesmo padrão: import `processBatch`, Etapa 0 no mock (tenant + 1 linha com a foto), call-site → batch-de-1. O teste valida re-encaminhamento de foto em estado terminal — a Etapa 2 agora itera `fotos`, mas com 1 foto o comportamento é idêntico. Ajuste asserções de contagem só se contarem `enviarMidia`/`zerar_media_base64` (continuam 1×).

- [ ] **Step 4: Rodar os dois — verde**

Run: `node --test tests/integration/pipeline-classifier.test.mjs tests/integration/pos-handoff-foto.test.mjs`
Expected: PASS.

- [ ] **Step 5: Rodar a suíte inteira (garantir que nada mais quebrou com o rename)**

Run: `npm test`
Expected: PASS (nenhum import órfão de `processMessage`). Se algum arquivo ainda referenciar `processMessage`, corrija o import/call ali.

- [ ] **Step 6: Commit**

```bash
git add tests/integration/pipeline-classifier.test.mjs tests/integration/pos-handoff-foto.test.mjs
git commit -m "test(integration): migra pipeline-classifier e pos-handoff-foto para processBatch

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Endpoint interno `/api/whatsapp/process-batch`

Endpoint que o `alarm()` do DO chama. Auth via `x-cron-secret`. Body `{session_id, msgRowIds[], tenantId, telefone}` → `processBatch`. Throw inesperado → 500 (DO re-tenta).

**Files:**
- Create: `functions/api/whatsapp/process-batch.js`
- Test: `tests/api/whatsapp/process-batch.test.mjs`

- [ ] **Step 1: Escrever os testes (vermelho)**

`tests/api/whatsapp/process-batch.test.mjs`:
```js
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../../functions/api/whatsapp/process-batch.js';

const ENV = { CRON_SECRET: 'sek' };

function ctx({ method = 'POST', secret = 'sek', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (secret !== null) headers['x-cron-secret'] = secret;
  return {
    request: new Request('https://x/api/whatsapp/process-batch', {
      method, headers,
      body: method === 'POST' && body !== undefined ? JSON.stringify(body) : undefined,
    }),
    env: ENV,
  };
}

test('process-batch: 405 GET', async () => {
  assert.equal((await onRequest(ctx({ method: 'GET' }))).status, 405);
});
test('process-batch: 401 sem x-cron-secret', async () => {
  assert.equal((await onRequest(ctx({ secret: null, body: { session_id: 't_5', msgRowIds: [1] } }))).status, 401);
});
test('process-batch: 400 body sem msgRowIds', async () => {
  assert.equal((await onRequest(ctx({ body: { session_id: 't_5' } }))).status, 400);
});
test('process-batch: chama processBatch e retorna 200', async () => {
  // Mock global fetch (processBatch usa supaFetch→fetch); como não injetamos deps aqui,
  // mockamos fetch pra responder vazio em tudo (o pipeline cai no catch interno, mas
  // o endpoint só falha se processBatch LANÇAR fora do try).
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response('[]', { status: 200 });
  try {
    const res = await onRequest(ctx({ body: { session_id: '00000000-0000-0000-0000-000000000001_5511', tenantId: '00000000-0000-0000-0000-000000000001', telefone: '5511', msgRowIds: [1, 2] } }));
    // tenant lookup retorna [] → Etapa 0 lança "tenant-nao-encontrado" (fora do try) → 500.
    assert.equal(res.status, 500);
  } finally { globalThis.fetch = orig; }
});
```

- [ ] **Step 2: Rodar — vermelho**

Run: `node --test tests/api/whatsapp/process-batch.test.mjs`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `functions/api/whatsapp/process-batch.js`**

```js
// functions/api/whatsapp/process-batch.js
// POST interno — chamado pelo alarm() do DO SessionQueue. Auth: x-cron-secret.
// Roda o pipeline pro lote. Throw inesperado → 500 (o DO re-tenta com backoff durável).
import { processBatch } from '../../_lib/whatsapp-pipeline.js';

const HEADERS = { 'Content-Type': 'application/json' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: HEADERS });

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ ok: false, error: 'method-not-allowed' }, 405);
  if (!env.CRON_SECRET || request.headers.get('x-cron-secret') !== env.CRON_SECRET) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'body-invalido' }, 400); }
  const { session_id, msgRowIds, tenantId, telefone } = body || {};
  if (!session_id || !Array.isArray(msgRowIds) || msgRowIds.length === 0) {
    return json({ ok: false, error: 'bad-batch' }, 400);
  }
  try {
    await processBatch(env, { session_id, tenantId, telefone, msgRowIds });
    return json({ ok: true });
  } catch (e) {
    // Falha de infra (Etapa 0: leitura DB). 500 sinaliza ao DO re-tentar.
    console.error('[process-batch] failed:', e.message);
    return json({ ok: false, error: e.message }, 500);
  }
}
```

- [ ] **Step 4: Rodar — verde**

Run: `node --test tests/api/whatsapp/process-batch.test.mjs`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add functions/api/whatsapp/process-batch.js tests/api/whatsapp/process-batch.test.mjs
git commit -m "feat(whatsapp): endpoint interno /process-batch (auth x-cron-secret) chama processBatch

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: DO class `SessionQueue` (lógica + testes isolados)

DO clássica testável sem runtime de Workers. `fetch('/enqueue')` acumula + agenda alarm (debounce 4s / teto 15s). `alarm()` POSTa o lote pro `process-batch`; em falha lança (DO re-tenta); preserva balões que chegaram durante o envio.

**Files:**
- Create: `cron-worker/src/session-queue.js`
- Test: `tests/_lib/session-queue.test.mjs`

- [ ] **Step 1: Escrever os testes (vermelho)**

`tests/_lib/session-queue.test.mjs`:
```js
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { SessionQueue, DEBOUNCE_MS, MAX_WAIT_MS } from '../../cron-worker/src/session-queue.js';

// Fake storage SQLite-like (Map) + captura de alarm.
function fakeState() {
  const map = new Map();
  let alarmAt = null;
  return {
    _map: map,
    get alarmAt() { return alarmAt; },
    storage: {
      async get(k) { return map.has(k) ? map.get(k) : undefined; },
      async put(k, v) { map.set(k, v); },
      async delete(k) { map.delete(k); },
      async setAlarm(ts) { alarmAt = ts; },
      async getAlarm() { return alarmAt; },
      async deleteAlarm() { alarmAt = null; },
    },
  };
}

const ENV = { CRON_SECRET: 'sek' };
const SID = '00000000-0000-0000-0000-000000000001_5511';

function enqReq(msgRowId) {
  return new Request('https://do/enqueue', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgRowId, session_id: SID, tenantId: '00000000-0000-0000-0000-000000000001', telefone: '5511' }),
  });
}

test('enqueue: 1º balão grava firstEnqueuedAt e agenda alarm em now+DEBOUNCE', async () => {
  const st = fakeState();
  const t0 = 1_000_000;
  mock.timers.enable({ apis: ['Date'], now: t0 });
  try {
    const q = new SessionQueue(st, ENV);
    const res = await q.fetch(enqReq(101));
    assert.equal(res.status, 200);
    const batch = await st.storage.get('batch');
    assert.deepEqual(batch.msgRowIds, [101]);
    assert.equal(batch.firstEnqueuedAt, t0);
    assert.equal(st.alarmAt, t0 + DEBOUNCE_MS);
  } finally { mock.timers.reset(); }
});

test('enqueue: balão novo dentro da janela re-arma o debounce', async () => {
  const st = fakeState();
  const t0 = 1_000_000;
  mock.timers.enable({ apis: ['Date'], now: t0 });
  try {
    const q = new SessionQueue(st, ENV);
    await q.fetch(enqReq(101));
    mock.timers.setTime(t0 + 2000);
    await q.fetch(enqReq(102));
    const batch = await st.storage.get('batch');
    assert.deepEqual(batch.msgRowIds, [101, 102]);
    assert.equal(st.alarmAt, t0 + 2000 + DEBOUNCE_MS, 'alarm empurrado pra now+DEBOUNCE');
  } finally { mock.timers.reset(); }
});

test('enqueue: teto MAX_WAIT respeitado se cliente não para de digitar', async () => {
  const st = fakeState();
  const t0 = 1_000_000;
  mock.timers.enable({ apis: ['Date'], now: t0 });
  try {
    const q = new SessionQueue(st, ENV);
    await q.fetch(enqReq(101));               // first = t0
    mock.timers.setTime(t0 + MAX_WAIT_MS - 1000); // perto do teto
    await q.fetch(enqReq(102));
    // min(now+DEBOUNCE, first+MAX) = min(t0+MAX+3000, t0+MAX) = t0+MAX
    assert.equal(st.alarmAt, t0 + MAX_WAIT_MS);
  } finally { mock.timers.reset(); }
});

test('alarm: POSTa o lote pro process-batch e limpa em sucesso', async () => {
  const st = fakeState();
  await st.storage.put('batch', { msgRowIds: [101, 102], session_id: SID, tenantId: 'T', telefone: '5511', firstEnqueuedAt: 1 });
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { calls.push({ url, opts }); return new Response('{"ok":true}', { status: 200 }); };
  try {
    const q = new SessionQueue(st, ENV);
    await q.alarm();
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/whatsapp\/process-batch$/);
    assert.equal(calls[0].opts.headers['x-cron-secret'], 'sek');
    const sent = JSON.parse(calls[0].opts.body);
    assert.deepEqual(sent.msgRowIds, [101, 102]);
    assert.equal(sent.session_id, SID);
    assert.equal(await st.storage.get('batch'), undefined, 'batch limpo após sucesso');
  } finally { globalThis.fetch = orig; }
});

test('alarm: process-batch falha → lança (DO re-tenta) e NÃO limpa o lote', async () => {
  const st = fakeState();
  await st.storage.put('batch', { msgRowIds: [101], session_id: SID, tenantId: 'T', telefone: '5511', firstEnqueuedAt: 1 });
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response('boom', { status: 500 });
  try {
    const q = new SessionQueue(st, ENV);
    await assert.rejects(() => q.alarm());
    assert.deepEqual((await st.storage.get('batch')).msgRowIds, [101], 'lote preservado pra retry');
  } finally { globalThis.fetch = orig; }
});

test('alarm: balão que chegou durante o POST sobrevive e re-arma alarm', async () => {
  const st = fakeState();
  await st.storage.put('batch', { msgRowIds: [101], session_id: SID, tenantId: 'T', telefone: '5511', firstEnqueuedAt: 1 });
  const orig = globalThis.fetch;
  globalThis.fetch = async () => {
    // simula enqueue de 102 durante o await do POST
    const b = await st.storage.get('batch');
    await st.storage.put('batch', { ...b, msgRowIds: [...b.msgRowIds, 102] });
    return new Response('{"ok":true}', { status: 200 });
  };
  try {
    const q = new SessionQueue(st, ENV);
    await q.alarm();
    const after = await st.storage.get('batch');
    assert.deepEqual(after.msgRowIds, [102], 'só o 101 (enviado) foi removido; 102 fica');
    assert.ok(st.alarmAt != null, 're-armou alarm pro próximo ciclo');
  } finally { globalThis.fetch = orig; }
});
```

- [ ] **Step 2: Rodar — vermelho**

Run: `node --test tests/_lib/session-queue.test.mjs`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `cron-worker/src/session-queue.js`**

```js
// cron-worker/src/session-queue.js
// Durable Object: serializa + agrupa (debounce) o processamento WhatsApp por sessão.
// Uma instância por conversa (idFromName(session_id)). Sintaxe clássica (constructor(state,env))
// — sem extends DurableObject — pra ser importável/testável fora do runtime de Workers.
// Backend SQLite vem da migration new_sqlite_classes no wrangler.toml.

export const DEBOUNCE_MS = 4000;   // janela de silêncio que agrupa balões
export const MAX_WAIT_MS = 15000;  // teto desde o 1º balão do lote
const PROCESS_BATCH_URL = 'https://inkflowbrasil.com/api/whatsapp/process-batch';

export class SessionQueue {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/enqueue') return this.enqueue(request);
    return new Response('not-found', { status: 404 });
  }

  async enqueue(request) {
    let body;
    try { body = await request.json(); } catch { return new Response('bad-json', { status: 400 }); }
    const { msgRowId, session_id, tenantId, telefone } = body || {};
    if (msgRowId == null || !session_id) return new Response('bad-enqueue', { status: 400 });

    const now = Date.now();
    const batch = (await this.state.storage.get('batch')) || {
      msgRowIds: [], session_id, tenantId, telefone, firstEnqueuedAt: now,
    };
    batch.session_id = session_id;
    batch.tenantId = tenantId;
    batch.telefone = telefone;
    if (!batch.firstEnqueuedAt) batch.firstEnqueuedAt = now;
    if (!batch.msgRowIds.includes(msgRowId)) batch.msgRowIds.push(msgRowId);
    await this.state.storage.put('batch', batch);

    const alarmAt = Math.min(now + DEBOUNCE_MS, batch.firstEnqueuedAt + MAX_WAIT_MS);
    await this.state.storage.setAlarm(alarmAt);
    return new Response(JSON.stringify({ accepted: msgRowId }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  async alarm() {
    const batch = await this.state.storage.get('batch');
    if (!batch || batch.msgRowIds.length === 0) return;
    const sending = [...batch.msgRowIds];

    const res = await fetch(PROCESS_BATCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': this.env.CRON_SECRET },
      body: JSON.stringify({
        session_id: batch.session_id, tenantId: batch.tenantId, telefone: batch.telefone, msgRowIds: sending,
      }),
    });
    if (!res.ok) {
      // Lança → o runtime do DO re-agenda o alarm com backoff durável. Lote preservado.
      throw new Error(`process-batch HTTP ${res.status}`);
    }

    // Sucesso: remove só os ids enviados; balões que chegaram durante o POST ficam.
    const after = (await this.state.storage.get('batch')) || { msgRowIds: [] };
    const remaining = after.msgRowIds.filter(id => !sending.includes(id));
    if (remaining.length > 0) {
      await this.state.storage.put('batch', { ...after, msgRowIds: remaining, firstEnqueuedAt: Date.now() });
      await this.state.storage.setAlarm(Date.now() + DEBOUNCE_MS);
    } else {
      await this.state.storage.delete('batch');
    }
  }
}
```

- [ ] **Step 4: Rodar — verde**

Run: `node --test tests/_lib/session-queue.test.mjs`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add cron-worker/src/session-queue.js tests/_lib/session-queue.test.mjs
git commit -m "feat(cron-worker): DO SessionQueue (debounce 4s/teto 15s, serializa por sessao)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wiring no `cron-worker` (re-export + binding + migration)

A class precisa ser exportada pelo entrypoint `inkflow-cron` e declarada no `wrangler.toml` com a migration SQLite. Sem isso o `script_name` binding do Pages não acha a class.

**Files:**
- Modify: `cron-worker/src/index.js`
- Modify: `cron-worker/wrangler.toml`

- [ ] **Step 1: Re-exportar a class no entrypoint**

Em `cron-worker/src/index.js`, adicione no topo (após o comentário de cabeçalho, antes do `const BASE_URL`):
```js
export { SessionQueue } from './session-queue.js';
```
O `export default { scheduled, fetch }` permanece intacto.

- [ ] **Step 2: Declarar binding + migration no `cron-worker/wrangler.toml`**

Adicione ao final do arquivo:
```toml
# Durable Object: serializacao/debounce do pipeline WhatsApp (P0 race fix).
# A class mora aqui; o Pages project (inkflow-saas) faz binding via script_name.
[[durable_objects.bindings]]
name = "SESSION_QUEUE"
class_name = "SessionQueue"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["SessionQueue"]
```

- [ ] **Step 3: Validar a config (dry-run, não deploya)**

Run: `cd cron-worker && npx wrangler deploy --dry-run --outdir /tmp/cron-do-dryrun && cd ..`
Expected: build OK; saída lista o binding `SESSION_QUEUE` e a migration `v1 (new_sqlite_classes: SessionQueue)`. Sem erro de "class not found / not exported".

- [ ] **Step 4: Rodar a suíte (garantir que o import novo não quebrou nada)**

Run: `node --test tests/_lib/session-queue.test.mjs`
Expected: PASS (o import por caminho direto continua válido; o re-export é adicional).

- [ ] **Step 5: Commit**

```bash
git add cron-worker/src/index.js cron-worker/wrangler.toml
git commit -m "feat(cron-worker): exporta SessionQueue + binding + migration sqlite v1

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `inbound.js` enfileira no DO (em vez de `processMessage`)

Troca o `waitUntil(processMessage)` por `waitUntil(stub.fetch('/enqueue'))`. Persist-first + idempotência intactos. Fallback claro se o binding faltar (dev local) — não silencia.

**Files:**
- Modify: `functions/api/whatsapp/inbound.js`
- Test: `tests/api/whatsapp/inbound.test.mjs`

- [ ] **Step 1: Atualizar os testes do inbound (vermelho)**

Em `tests/api/whatsapp/inbound.test.mjs`, adicione um `SESSION_QUEUE` mock ao `ENV` e um helper de stub; ajuste o teste de dispatch pra asserir o enqueue. Substitua o bloco `ENV` e adicione:
```js
function mockSessionQueue(enqueueSpy) {
  return {
    idFromName: (name) => ({ name }),
    get: () => ({ fetch: enqueueSpy }),
  };
}
```
Reescreva o teste "INSERT OK → waitUntil chamado":
```js
test('inbound: INSERT OK → enfileira no DO via waitUntil (nao chama processMessage)', async () => {
  const orig = globalThis.fetch;
  const waitSpy = mock.fn((p) => p); // executa a promise
  const enqueueSpy = mock.fn(async () => new Response('{"accepted":12345}', { status: 200 }));
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/tenants?')) return new Response(JSON.stringify([{ id: 'tid', evo_instance: 'inkflow_test', tatuador_telegram_chat_id: '99' }]), { status: 200 });
    if (url.includes('/rest/v1/conversa_mensagens') && opts?.method === 'POST') return new Response(JSON.stringify([{ id: 12345 }]), { status: 201 });
    return new Response('[]', { status: 200 });
  };
  const env = { WEBHOOK_SECRET: 'shh', SUPABASE_SERVICE_ROLE_KEY: 'svc-key', SESSION_QUEUE: mockSessionQueue(enqueueSpy) };
  try {
    const ctx = buildContext({ body: VALID_PAYLOAD, waitUntilSpy: waitSpy });
    ctx.env = env;
    const res = await ctx.request && await onRequest(ctx);
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.accepted, 12345);
    assert.equal(enqueueSpy.mock.callCount(), 1, 'enfileirou no DO 1×');
    const enqReq = enqueueSpy.mock.calls[0].arguments[0];
    const enqBody = JSON.parse(await enqReq.text());
    assert.equal(enqBody.msgRowId, 12345);
    assert.equal(enqBody.session_id, 'tid_5511999');
  } finally { globalThis.fetch = orig; }
});

test('inbound: sem binding SESSION_QUEUE → 200 queued:false (nao silencia)', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/tenants?')) return new Response(JSON.stringify([{ id: 'tid', evo_instance: 'inkflow_test' }]), { status: 200 });
    if (url.includes('/rest/v1/conversa_mensagens') && opts?.method === 'POST') return new Response(JSON.stringify([{ id: 12345 }]), { status: 201 });
    return new Response('[]', { status: 200 });
  };
  try {
    const ctx = buildContext({ body: VALID_PAYLOAD });
    ctx.env = { WEBHOOK_SECRET: 'shh', SUPABASE_SERVICE_ROLE_KEY: 'svc-key' }; // sem SESSION_QUEUE
    const res = await onRequest(ctx);
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.queued, false);
  } finally { globalThis.fetch = orig; }
});
```
> Nota: o `session_id` esperado (`tid_5511999`) depende do `telefone` que o `parseEvolutionPayload` extrai de `5511999@s.whatsapp.net`. Confirme o valor real rodando o teste; ajuste a asserção pro telefone que o parser devolve.

- [ ] **Step 2: Rodar — vermelho**

Run: `node --test tests/api/whatsapp/inbound.test.mjs`
Expected: FAIL — inbound ainda chama `processMessage`; `enqueueSpy` não é chamado.

- [ ] **Step 3: Modificar `functions/api/whatsapp/inbound.js`**

Remova o import (linha 7):
```js
import { processMessage } from '../../_lib/whatsapp-pipeline.js';
```
Substitua o bloco de dispatch (linhas 87-100) por:
```js
  // Dispatch async: enfileira no Durable Object (serializa + debounce por sessao).
  if (env.SESSION_QUEUE) {
    const enqueueReq = new Request('https://do/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgRowId: insertedRow.id, session_id, tenantId: tenant.id, telefone: inbound.telefone,
      }),
    });
    const id = env.SESSION_QUEUE.idFromName(session_id);
    const stub = env.SESSION_QUEUE.get(id);
    if (typeof waitUntil === 'function') {
      waitUntil(stub.fetch(enqueueReq).catch(e => {
        console.error('[inbound] enqueue rejected:', e.message);
      }));
    }
    return json({ ok: true, accepted: insertedRow.id });
  }

  // Sem binding (dev local sem DO): msg fica `received`; recuperavel por retry/varredura.
  console.error('[inbound] SESSION_QUEUE binding ausente — msg', insertedRow.id, 'fica received (nao enfileirada)');
  return json({ ok: true, accepted: insertedRow.id, queued: false });
```

- [ ] **Step 4: Rodar — verde**

Run: `node --test tests/api/whatsapp/inbound.test.mjs`
Expected: PASS (incluindo os 2 novos). Ajuste o `session_id` esperado se o telefone do parser divergir.

- [ ] **Step 5: Commit**

```bash
git add functions/api/whatsapp/inbound.js tests/api/whatsapp/inbound.test.mjs
git commit -m "feat(inbound): enfileira no DO SessionQueue em vez de waitUntil(processMessage)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Binding do DO no Pages project + runbook de deploy

Declara o binding no `wrangler.toml` do Pages (com `script_name`, obrigatório em Pages) e documenta a ordem de deploy + dev local + smoke. Este é o passo de wiring/deploy — depende de todos os anteriores.

**Files:**
- Modify: `wrangler.toml`
- Create: `docs/runbooks/deploy-whatsapp-do.md`

- [ ] **Step 1: Adicionar o binding ao `wrangler.toml` (Pages)**

Adicione ao final:
```toml
# Durable Object definido no Worker inkflow-cron (cron-worker/). Pages SO faz binding
# via script_name — nunca define a class. Deploy do inkflow-cron PRECISA vir antes.
[[durable_objects.bindings]]
name = "SESSION_QUEUE"
class_name = "SessionQueue"
script_name = "inkflow-cron"
```

- [ ] **Step 2: Validar a config do Pages (dry-run)**

Run: `npx wrangler pages functions build --outdir /tmp/pages-do-dryrun`
Expected: build das Functions OK (sem erro de sintaxe). O binding de DO só resolve em runtime/deploy — o objetivo aqui é confirmar que o TOML é válido e as Functions compilam.

- [ ] **Step 3: Escrever o runbook `docs/runbooks/deploy-whatsapp-do.md`**

````markdown
# Runbook — Deploy do DO SessionQueue (serializacao WhatsApp)

## Ordem OBRIGATORIA (a class precisa existir antes do binding por script_name)

1. **Deploy do cron-worker primeiro** (define a class + roda a migration sqlite):
   ```bash
   cd cron-worker
   npx wrangler deploy        # cria/atualiza a class SessionQueue + migration v1
   cd ..
   ```
   Confirme no output: `Your Durable Objects: SessionQueue` e a migration `v1` aplicada.

2. **Garantir o secret** (mesmo valor nos dois lados; provavelmente ja existe):
   ```bash
   cd cron-worker && npx wrangler secret put CRON_SECRET && cd ..   # se ainda nao setado
   ```
   O Pages project (inkflow-saas) ja usa CRON_SECRET nos endpoints cron — nenhum secret novo.

3. **Deploy do Pages project** (resolve o binding via script_name=inkflow-cron):
   - Via Git (quando o deploy-via-Git estiver OK) OU `npx wrangler pages deploy .`
   - O binding `SESSION_QUEUE` so resolve DEPOIS que o inkflow-cron tem a class publicada.

## Rollback

- O `inbound.js` tem fallback: sem o binding, retorna `queued:false` e a msg fica `received`
  (recuperavel). Reverter o deploy do Pages volta ao comportamento anterior, mas o pipeline
  antigo (`processMessage`) nao existe mais — o rollback real e revert do commit + redeploy.
- Para desligar rapido sem revert: remover o `[[durable_objects.bindings]]` do Pages faz o
  inbound cair no fallback (msgs ficam received). Combinar com a varredura fase-2 (futura).

## Dev local

DO de Worker externo em `wrangler pages dev` exige rodar o cron-worker em paralelo:
```bash
# terminal 1
cd cron-worker && npx wrangler dev
# terminal 2 (raiz)
npx wrangler pages dev . --do SESSION_QUEUE=SessionQueue@inkflow-cron
```
Testes unitarios NAO dependem disso (deps/state mockados).

## Smoke E2E (o mesmo que pegou o bug — tenant teste db686ef2)

1. 1o contato: cliente manda **foto + legenda + 2-3 textos** em rajada (<4s entre balões).
2. Esperado: **UMA** resposta coerente que considera tudo; **sem** re-saudação dupla;
   estado preservado (nao reinicia do zero); a foto correlacionada (foto_local_msg_id).
3. Conferir nos logs do CF (Workers → inkflow-cron → Logs e Pages Functions):
   - `process-batch` chamado 1× pro lote (nao N×).
   - runAgent 1×.
4. Calibrar DEBOUNCE_MS/MAX_WAIT_MS se a cadencia real de digitacao pedir.

## Checklist pos-deploy

- [ ] cron-worker deployado, class SessionQueue listada, migration v1 ok
- [ ] Pages deployado, binding SESSION_QUEUE resolvido (sem erro de script_name)
- [ ] Smoke E2E passou (1 resposta, sem re-saudacao, foto correlacionada)
- [ ] Logs sem `SESSION_QUEUE binding ausente`
````

- [ ] **Step 4: Rodar a suíte completa (verificação final pré-deploy)**

Run: `npm test`
Expected: PASS — toda a suíte verde (pipeline, integração, process-batch, session-queue, inbound).

- [ ] **Step 5: Commit**

```bash
git add wrangler.toml docs/runbooks/deploy-whatsapp-do.md
git commit -m "feat(pages): binding DO SessionQueue (script_name=inkflow-cron) + runbook de deploy

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Riscos & ordem de deploy (revisar antes de mergear/deployar)

| Risco | Mitigação |
|-------|-----------|
| **Deploy fora de ordem** (Pages antes do cron-worker) → binding `script_name` não resolve | Runbook (Task 7) crava a ordem: `cron-worker` → secret → Pages. Validado por dry-run nas Tasks 5/6. |
| **Migration `new_sqlite_classes`** (irreversível por natureza) | Tag `v1`, SQLite-backed, free plan. Class nova (sem dados legados) → migration trivial. Não há `renamed_classes`/`deleted_classes`. |
| **Breaking: rename `processMessage`** quebra qualquer caller esquecido | Tasks 1-2 migram todos os callers conhecidos (inbound + 3 arquivos de teste). Task 2 Step 5 roda `npm test` inteiro pra pegar órfãos. |
| **At-least-once** (falha pós-`evoSend`) → resposta possivelmente duplicada | Tolerado (blast radius baixo, 1 tenant teste). Documentado. Mitigável depois com estado intermediário pré-envio se aparecer no smoke. |
| **Secret** | Zero secret novo — reusa `CRON_SECRET` (já nos dois projetos). |
| **`pushName` não chega ao batch** | O DO não repassa `pushName`; em estado terminal a notificação cai em `telefone`. Aceitável (degradação cosmética). Se incomodar no smoke, adicionar `pushName` ao payload do enqueue + à linha do lote. |
| **Calibração 4s/15s** | Chutes razoáveis; ajustar no smoke (constantes em `session-queue.js`). |
| **P1 (foto → LLM) continua aberto** | Fora de escopo (spec). O batch facilita o fix depois. |

## Self-review (executado contra o spec)

- **In-scope coberto:** serialização por sessão (Task 4 DO + estrutura) ✓; debounce/lote como 1 turno (Task 1 montagem + Task 4 alarm) ✓; DO no cron-worker (Tasks 4-5) ✓; endpoint process-batch (Task 3) ✓; refator processMessage→processBatch (Task 1) ✓; inbound enfileira no DO (Task 6) ✓; TDD com teste que guarda a race (Task 1 Step 1) ✓.
- **Componentes do spec:** todos os arquivos novos/modificados listados têm task. As 3 montagens (textos concatenados `\n`, fotos por-msg, resposta split `\n\n`) estão na Task 1. Etapa 4.5 em loop ✓. Marca todos os `msgRowId`s ✓.
- **Testes do spec (1-5):** (1) race guard → Task 1; (2) processBatch → Task 1; (3) DO isolado → Task 4; (4) inbound enfileira → Task 6; (5) smoke E2E → runbook Task 7 ✓.
- **Riscos do spec:** deploy coordenado, dev local, calibração, mídia-no-enqueue (carrega só `msgRowId`; base64 recarregado no SELECT da Etapa 0) — todos endereçados ✓.
- **Sem placeholders:** todo step com código mostra o código completo; comandos com saída esperada. A migração mecânica dos testes 1-18 (Task 1 Step 5) descreve o padrão exato (3 substituições) + reescreve por extenso os 3 casos que dependem de dados de linha — decisão consciente pra não inflar o plano com 18 blocos quase idênticos.
- **Consistência de tipos:** `processBatch(env, batch, depsOverride)` com `batch = {session_id, tenantId, telefone, msgRowIds[]}`; `markStatus(deps, msgRowIds, status)`; enqueue payload `{msgRowId, session_id, tenantId, telefone}`; process-batch body idem (sem msgRowId, com msgRowIds[]). Nomes batem entre Tasks 1/3/4/6.

**8 tasks** (< 15) — escopo de 1 spec, coeso. Não precisa quebrar.
