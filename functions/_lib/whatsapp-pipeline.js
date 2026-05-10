// functions/_lib/whatsapp-pipeline.js
// Pipeline async chamado por inbound.js via context.waitUntil.
// Carrega conversa, chama runAgent, persiste estado, despacha outbound.
//
// Deps injetadas via depsOverride pra integration tests sem fetch real.
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

export function defaultDeps(env) {
  return {
    supaFetch: (path, init) => supaFetch(env, path, init),
    evoSend: (tenant, payload) => evoSend(env, tenant, payload),
    sendTelegram: (chatId, text) => sendTelegramTo(env, chatId, text),
    sendTelegramAdmin: (text) => sendTelegramAlert(env, text),
    runAgent: (args) => runAgent({ env, ...args }),
    callTool: (toolName, body) => callTool(env, toolName, body),
    now: () => new Date().toISOString(),
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
          tenant_id: tenantId, telefone, estado_agente: 'tattoo',
          dados_coletados: {}, dados_cadastro: {}, last_msg_at: deps.now(),
        }),
      });
      const arr = await ins.json();
      conversa = arr[0];
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

    // Etapa 3: MONTA historico (últimos 40, exclui msgRowId atual)
    const histRes = await deps.supaFetch(
      `/rest/v1/n8n_chat_histories?session_id=eq.${encodeURIComponent(session_id)}` +
      `&order=created_at.asc&limit=40&select=id,message`,
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

    // (Etapas 4-9 implementadas em Tasks 9-11)
    throw new Error('etapas-4-9-nao-implementadas');

  } catch (e) {
    console.error('[pipeline] failed:', { evoMessageId, telefone, error: e.message, stack: e.stack });
    await deps.supaFetch(`/rest/v1/n8n_chat_histories?id=eq.${msgRowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'failed' }),
    }).catch(() => {});
    await deps.sendTelegramAdmin(`🚨 pipeline failed: ${e.message}`);
  }
}
