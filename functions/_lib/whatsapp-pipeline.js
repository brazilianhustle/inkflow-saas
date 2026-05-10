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
  // Etapas 1-9 implementadas em Tasks 8-11.
  throw new Error('not-implemented');
}
