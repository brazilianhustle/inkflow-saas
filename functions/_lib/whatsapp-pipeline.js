// functions/_lib/whatsapp-pipeline.js
// Pipeline async chamado por inbound.js via context.waitUntil.
// Carrega conversa, chama runAgent, persiste estado, despacha outbound.
//
// Deps injetadas via depsOverride pra integration tests sem fetch real.
import { setDefaultOpenAIKey } from '@openai/agents-openai';
import { supaFetch } from '../api/tools/_tool-helpers.js';
import { evoSend } from './evolution-send.js';
import { sendTelegramTo, sendTelegramAlert } from './telegram.js';
import { runAgent } from '../api/agent/route.js';
import { callTool } from '../api/agent/_lib/call-tool.js';

export const TERMINAL_STATES = new Set([
  'aguardando_tatuador',
  'lead_frio',
  'aguardando_decisao_desconto',
]);

// UX: bot respondendo instantaneo soa robotico. n8n legacy tinha pause 1-2s.
// Aplicado antes do evoSend(text) na Etapa 7 — apenas no happy path.
export const TYPING_DELAY_MS = 1500;

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
    runAgent: (args) => {
      // Idempotente — mesmo padrao de onRequest (route.js). Necessario porque
      // pipeline chama runAgent direto, sem passar pelo HTTP wrapper.
      if (env?.OPENAI_API_KEY) setDefaultOpenAIKey(env.OPENAI_API_KEY);
      return runAgent({ env, ...args });
    },
    callTool: (toolName, body) => callTool(env, toolName, body),
    now: () => new Date().toISOString(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

function preview(s, n = 200) {
  return String(s || '').slice(0, n);
}

export async function processMessage(env, msg, depsOverride = {}) {
  const deps = { ...defaultDeps(env), ...depsOverride };
  const { tenantId, telefone, evoMessageId, texto, mediaBase64, mediaMimetype,
          pushName, msgRowId, tenant } = msg;
  const session_id = `${tenantId}_${telefone}`;

  try {
    // Etapa 1: LOAD/CREATE conversa
    const convRes = await deps.supaFetch(
      `/rest/v1/conversas?tenant_id=eq.${tenantId}&telefone=eq.${encodeURIComponent(telefone)}` +
      `&select=id,estado_agente,dados_coletados,dados_cadastro,valor_proposto,orcid,pausada_em&limit=1`,
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
      if (!conversa) {
        throw new Error(`conversa-create-failed (status=${insStatus}): ${insText.slice(0, 200)}`);
      }
    }

    // Etapa 2: EARLY-RETURN estado terminal
    if (TERMINAL_STATES.has(conversa.estado_agente)) {
      if (tenant.tatuador_telegram_chat_id) {
        await deps.sendTelegram(
          tenant.tatuador_telegram_chat_id,
          `📩 Cliente ${pushName ?? telefone} (${tenant.nome_estudio}) mandou msg:\n${preview(texto, 200)}`,
        );
      } else {
        await deps.sendTelegramAdmin(
          `tenant ${tenant.id} sem tatuador_telegram_chat_id em estado terminal (${conversa.estado_agente})`,
        );
      }
      await deps.supaFetch(`/rest/v1/n8n_chat_histories?id=eq.${msgRowId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'processed' }),
      });
      return;
    }

    // Etapa 3: MONTA historico (últimos 40, exclui msgRowId atual + status=failed)
    // Failed rows poluem contexto — agente confunde input ruidoso com conversa real.
    const histRes = await deps.supaFetch(
      `/rest/v1/n8n_chat_histories?session_id=eq.${encodeURIComponent(session_id)}` +
      `&status=neq.failed&order=created_at.asc&limit=40&select=id,message`,
    );
    const histRows = await histRes.json();
    const historico = histRows
      .filter(r => r.id !== msgRowId)
      .map(r => {
        const msgObj = r.message || {};
        return {
          role: msgObj.type === 'ai' ? 'assistant' : 'user',
          content: msgObj.content || '',
        };
      });

    // Etapa 4: runAgent — mapeia DB state -> agent state pra invocar.
    const estadoAgente = dbToAgent(conversa.estado_agente);
    let agentOut;
    try {
      agentOut = await deps.runAgent({
        tenant_id: tenantId, telefone, mensagem: texto,
        estado_atual: estadoAgente,
        dados_acumulados: conversa.dados_coletados || {},
        historico,
        tenant, conversa: { ...conversa, estado_agente: estadoAgente },
        clientContext: {},
      });
    } catch (e) {
      throw new Error(`runAgent threw: ${e.message}`);
    }
    if (!agentOut?.ok) {
      throw new Error(`runAgent returned ok:false: ${agentOut?.error || 'unknown'}`);
    }

    // Etapa 5: UPDATE conversa
    // Cadastro merge em dados_cadastro (preserva dados_coletados).
    // Tattoo/proposta/etc merge em dados_coletados (preserva dados_cadastro).
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
        dados_coletados: novoDadosColetados,
        dados_cadastro: novoDadosCadastro,
        updated_at: deps.now(),
      }),
    });

    // Etapa 6: INSERT n8n_chat_histories OUT (type='ai')
    await deps.supaFetch('/rest/v1/n8n_chat_histories', {
      method: 'POST',
      body: JSON.stringify({
        session_id,
        message: { type: 'ai', content: agentOut.resposta_cliente },
        status: 'processed',
        created_at: deps.now(),
      }),
    });

    // Etapa 6.5: typing delay (UX — bot nao deve parecer robo instantaneo)
    await deps.sleep(TYPING_DELAY_MS);

    // Etapa 7: Evolution outbound (text + media URLs)
    const sendRes = await deps.evoSend(tenant, {
      type: 'text', to: telefone, text: agentOut.resposta_cliente,
    });
    if (!sendRes.ok) {
      // Throw — catch path patcha status=failed e notifica admin com a mensagem.
      throw new Error(`evo sendText falhou: ${sendRes.error || 'unknown'} (tenant=${tenant.id})`);
    }
    if (Array.isArray(agentOut.urls_portfolio) && agentOut.urls_portfolio.length > 0) {
      for (const url of agentOut.urls_portfolio) {
        const m = await deps.evoSend(tenant, { type: 'media', to: telefone, url });
        if (!m.ok) {
          await deps.sendTelegramAdmin(`evo sendMedia falhou: ${url} (${m.error || 'unknown'})`);
          // Não throw — texto principal foi entregue
        }
      }
    }

    // Etapa 8: side-effect handoff cadastro → enviar-orcamento-tatuador
    if (estadoAgente === 'cadastro' && agentOut.proxima_acao === 'handoff') {
      if (!tenant.tatuador_telegram_chat_id) {
        await deps.sendTelegramAdmin(`handoff sem tatuador_telegram_chat_id em ${tenant.id}`);
      } else {
        const r = await deps.callTool('enviar-orcamento-tatuador', {
          tenant_id: tenant.id, telefone,
        });
        if (!r.ok) {
          await deps.sendTelegramAdmin(`enviar-orcamento-tatuador falhou: ${r.error || 'unknown'}`);
        }
      }
    }

    // Marca msg IN como processada (DEPOIS das etapas 7-8 — se Evolution falhar,
    // o catch path patcha status=failed em vez disso).
    await deps.supaFetch(`/rest/v1/n8n_chat_histories?id=eq.${msgRowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'processed' }),
    });

  } catch (e) {
    console.error('[pipeline] failed:', { evoMessageId, telefone, error: e.message, stack: e.stack });
    await deps.supaFetch(`/rest/v1/n8n_chat_histories?id=eq.${msgRowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'failed' }),
    }).catch(() => {});
    await deps.sendTelegramAdmin(
      `🚨 pipeline failed (msg ${evoMessageId}): ${e.message}\n${preview(e.stack, 500)}`,
    );
  }
}
