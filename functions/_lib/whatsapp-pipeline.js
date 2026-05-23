// functions/_lib/whatsapp-pipeline.js
// Pipeline async chamado por process-batch endpoint via Durable Object alarm.
// Serializa N mensagens do lote como 1 turno: Etapa 0 (tenant+rows) fora do try,
// montagem N msgs→1 turno, Etapas 1-8 preservadas, marca N msgRowIds processed/failed.
//
// Deps injetadas via depsOverride pra integration tests sem fetch real.
import { supaFetch } from '../api/tools/_tool-helpers.js';
import { evoSend, splitBaloes } from './evolution-send.js';
import { sendTelegramTo, sendTelegramAlert } from './telegram.js';
import { runAgent } from '../api/agent/route.js';
import { callTool } from '../api/agent/_lib/call-tool.js';
import { classificarFoto } from './foto-classifier.js';
import { enviarMidia } from './telegram-media.js';

export const TERMINAL_STATES = new Set([
  'aguardando_tatuador',
  'lead_frio',
  'aguardando_decisao_desconto',
]);

// UX: bot respondendo instantaneo soa robotico. n8n legacy tinha pause 1-2s.
// Aplicado antes do evoSend(text) na Etapa 7 — apenas no happy path.
export const TYPING_DELAY_MS = 1500;

// Cap de imagens enviadas ao LLM por turno (custo). A Etapa 4.5 usa fotos[] (sem cap).
const MAX_IMAGENS_VISAO = 4;

// DB usa nomes legacy (coletando_tattoo/cadastro) por causa do CHECK constraint
// herdado do n8n. Agent SDK usa nomes curtos (tattoo/cadastro). Mapeamos nas
// fronteiras: ler do DB -> dbToAgent, escrever no DB -> agentToDb.
const STATE_DB_TO_AGENT = {
  coletando_tattoo: 'tattoo',
  coletando_cadastro: 'cadastro',
  ativo: 'tattoo', // default novo -> coleta_tattoo
};
const STATE_AGENT_TO_DB = {
  tattoo: 'coletando_tattoo',
  cadastro: 'coletando_cadastro',
};

function dbToAgent(state) {
  return STATE_DB_TO_AGENT[state] || state;
}
function agentToDb(state) {
  return STATE_AGENT_TO_DB[state] || state;
}

export function defaultDeps(env) {
  return {
    supaFetch: (path, init) => supaFetch(env, path, init),
    evoSend: (tenant, payload) => evoSend(env, tenant, payload),
    sendTelegram: (chatId, text) => sendTelegramTo(env, chatId, text),
    sendTelegramAdmin: (text) => sendTelegramAlert(env, text),
    runAgent: (args) => runAgent({ env, ...args }),
    callTool: (toolName, body) => callTool(env, toolName, body),
    enviarMidia,
    classificarFoto,
    now: () => new Date().toISOString(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

function preview(s, n = 200) {
  return String(s || '').slice(0, n);
}

// PATCH status pra todos os ids do lote de uma vez.
async function markStatus(deps, msgRowIds, status) {
  await deps.supaFetch(`/rest/v1/conversa_mensagens?id=in.(${msgRowIds.join(',')})`, {
    method: 'PATCH', body: JSON.stringify({ status }),
  });
}

export async function processBatch(env, batch, depsOverride = {}) {
  const deps = { ...defaultDeps(env), ...depsOverride };
  let { session_id, tenantId, telefone, msgRowIds } = batch;
  // Fallback: deriva tenantId/telefone do session_id (formato `${uuid}_${telefone}`).
  // Usado so em testes/invocacao manual — o DO sempre envia tenantId+telefone no body.
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
  // Lote so-foto (sem caption) → texto='' (mesmo comportamento do processMessage antigo).
  // Passar a imagem ao LLM e o P1 "foto do cliente nunca chega ao LLM" — fora de escopo aqui.
  const texto = rows.map(r => r.message?.content).filter(c => c && c.trim()).join('\n');
  const fotos = rows
    .filter(r => r.message?.media_base64 && r.message?.media_mimetype?.startsWith('image/'))
    .map(r => ({
      msgRowId: r.id, mediaBase64: r.message.media_base64, mediaMimetype: r.message.media_mimetype,
      // caption PROPRIA da foto — classificacao usa o texto DELA, nao o texto concatenado do
      // lote (senao um keyword numa msg vaza pra todas as fotos → todas viram 'local').
      caption: r.message.content || '',
    }));
  // Cap pro modelo (custo). A Etapa 4.5 ainda classifica/persiste TODAS as fotos do lote.
  // Ordem preservada (slice, nao filter): imagens[i].msgRowId === fotos[i].msgRowId — a Etapa 4.5 (A5) usa esse indice.
  const imagens = fotos.slice(0, MAX_IMAGENS_VISAO).map(f => ({
    base64: f.mediaBase64,
    mimetype: f.mediaMimetype,
    msgRowId: f.msgRowId,
  }));

  try {
    // Etapa 1: LOAD/CREATE conversa
    const convRes = await deps.supaFetch(
      `/rest/v1/conversas?tenant_id=eq.${tenantId}&telefone=eq.${encodeURIComponent(telefone)}` +
      `&select=id,estado_agente,dados_coletados,dados_cadastro,valor_proposto,orcid,pausada_em&limit=1`,
    );
    const convArr = await convRes.json();
    // Guard: SELECT falho (status>=400 / corpo nao-array) NAO e "conversa inexistente".
    // Sem isto, convArr[0] undefined cai no INSERT cego → 409 duplicate key mascarando a causa
    // real (ex: coluna inexistente no select). Throw da erro claro em vez de 409 enganoso.
    if (!convRes.ok || !Array.isArray(convArr)) {
      throw new Error(`conversa-select-failed (status=${convRes.status}): ${preview(JSON.stringify(convArr), 200)}`);
    }
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
          `📩 Cliente ${telefone} (${tenant.nome_estudio}) mandou msg:\n${preview(texto, 200)}`,
        );
        // Re-encaminha foto(s) avulsa(s) pos-handoff; cleanup base64 só após upload OK.
        for (const foto of fotos) {
          try {
            const nome = conversa.dados_cadastro?.nome || telefone;
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
    // order=desc+limit pega os 40 MAIS RECENTES (asc+limit pegava os mais antigos);
    // reverse() devolve em ordem cronológica pro runAgent.
    const histRes = await deps.supaFetch(
      `/rest/v1/conversa_mensagens?session_id=eq.${encodeURIComponent(session_id)}` +
      `&status=eq.processed&order=created_at.desc&limit=40&select=id,message`,
    );
    const histRows = (await histRes.json()).reverse();
    const loteSet = new Set(msgRowIds);
    const historico = histRows
      .filter(r => !loteSet.has(r.id))
      .map(r => {
        const m = r.message || {};
        return { role: m.type === 'ai' ? 'assistant' : 'user', content: m.content || '' };
      });

    // Etapa 4: runAgent (1× pro turno)
    const estadoAgente = dbToAgent(conversa.estado_agente);
    const isFirstContact = historico.length === 0
      && Object.keys(conversa.dados_coletados || {}).length === 0
      && Object.keys(conversa.dados_cadastro || {}).length === 0;
    let agentOut;
    try {
      agentOut = await deps.runAgent({
        tenant_id: tenantId, telefone, mensagem: texto,
        estado_atual: estadoAgente, dados_acumulados: conversa.dados_coletados || {},
        historico, tenant, conversa: { ...conversa, estado_agente: estadoAgente },
        clientContext: {
          is_first_contact: isFirstContact,
          batch_message_count: rows.filter(r => r.message?.content && r.message.content.trim()).length,
          batch_joined_by: 'newline',
        },
        imagens,
      });
    } catch (e) { throw new Error(`runAgent threw: ${e.message}`); }
    if (!agentOut?.ok) throw new Error(`runAgent returned ok:false: ${agentOut?.error || 'unknown'}`);

    // Etapa 5: UPDATE conversa
    const isCadastro = agentOut.agent_usado === 'cadastro';
    const novoDadosColetados = isCadastro
      ? (conversa.dados_coletados || {})
      : { ...(conversa.dados_coletados || {}), ...(agentOut.dados_persistidos || {}) };
    // Bug 1: incrementa contador de foto pedida. Persiste em dados_coletados
    // (estado_extra nao existe na tabela). route.js sinaliza via pediu_foto_local.
    if (agentOut.pediu_foto_local && !isCadastro) {
      novoDadosColetados.tentativas_foto_local = (conversa.dados_coletados?.tentativas_foto_local || 0) + 1;
    }
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

    // Etapa 4.5: rotear CADA foto do lote. Fonte de verdade = analise_imagens do
    // modelo (que VIU a foto). Fallback = foto-classifier heuristico quando a visao
    // falhou/ausente. Correlacao por indice: fotos[i] <-> analise[i] <-> msgRowId.
    // 1 PATCH final acumulado.
    if (fotos.length > 0) {
      try {
        const dadosPreMerge = conversa.dados_coletados || {};
        let dadosAcc = isCadastro ? { ...dadosPreMerge } : { ...novoDadosColetados };
        let tentativas = dadosPreMerge.tentativas_foto_local || 0;
        let fotoLocalAtual = dadosPreMerge.foto_local;
        const analise = Array.isArray(agentOut.analise_imagens) ? agentOut.analise_imagens : null;
        // No maximo UMA foto_local por lote: a 1ª 'local' vence; demais viram ref.
        let localAtribuidaNoLote = false;
        // Memoria de recall: descricao da arte SO de fotos 'referencia' (nao 'corpo').
        const descricoesRef = [];
        for (let i = 0; i < fotos.length; i++) {
          const foto = fotos[i];
          let tipo; // 'local' | 'ref'
          const a = analise && analise[i];
          if (a) {
            // Modelo viu a imagem: corpo→local; referencia/incerto→ref (incerto nunca dropa).
            tipo = a.tipo === 'corpo' ? 'local' : 'ref';
          } else {
            // Fallback heuristico (visao ausente p/ esta foto).
            tipo = deps.classificarFoto({ tentativas_foto_local: tentativas, foto_local_atual: fotoLocalAtual, texto_turno: foto.caption });
          }
          if (tipo === 'local' && !localAtribuidaNoLote) {
            dadosAcc = { ...dadosAcc, foto_local_msg_id: foto.msgRowId };
            fotoLocalAtual = foto.msgRowId; // proximas fotos do lote ja veem local presente
            localAtribuidaNoLote = true;
          } else {
            const ids = Array.isArray(dadosAcc.refs_imagens_msg_ids) ? dadosAcc.refs_imagens_msg_ids : [];
            dadosAcc = { ...dadosAcc, refs_imagens_msg_ids: [...ids, foto.msgRowId] };
            // Memoria SO de 'referencia' (confianca alta). 'incerto' tambem cai aqui (else=ref)
            // mas NAO vira memoria: descricao de foto ambigua nao deve semear arte falsa.
            if (a && a.tipo === 'referencia' && a.descricao && a.descricao.trim()) {
              descricoesRef.push({ msgRowId: foto.msgRowId, descricao: a.descricao.trim() });
            }
          }
        }
        await deps.supaFetch(`/rest/v1/conversas?id=eq.${conversa.id}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ dados_coletados: dadosAcc }),
        });
        // Persiste descricao da arte de referencia (jsonb_set targeted, preserva
        // demais chaves do message + coexiste com zerar_media_base64).
        // Apos o PATCH de dados_coletados (ja persistido); a RPC anota a linha de mensagem. Ordem importa.
        for (const d of descricoesRef) {
          try {
            await deps.supaFetch(`/rest/v1/rpc/set_descricao_visual`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ p_msg_id: d.msgRowId, p_descricao: d.descricao }),
            });
          } catch (e) {
            console.warn(`[pipeline] set_descricao_visual falhou (msg ${d.msgRowId}): ${e.message}`);
          }
        }
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
    const baloes = splitBaloes(agentOut.resposta_cliente);
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
