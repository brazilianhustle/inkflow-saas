// Helpers compartilhados pelos testes integration de enviar-orcamento-tatuador.
// Mock de globalThis.fetch roteando Supabase REST + Telegram Bot API.
//
// Nota Node 25/undici: `new Response('', { status: 204 })` lanca (corpo nao-nulo
// em 204). Sempre usar `new Response(null, { status: 204 })`.
import { onRequest } from '../../functions/api/tools/enviar-orcamento-tatuador.js';

export { onRequest };

export const TENANT_ID = '00000000-0000-0000-0000-000000000001';
export const SECRET = 'test-secret';
export const TG_CHAT = '-100123456';
// base64 valido (atob aceita) — sendTelegram* reais decodificam via atob.
export const B64 = 'aGVsbG8=';

export function buildContext(body, extraEnv = {}) {
  return {
    request: new Request('https://x/api/tools/enviar-orcamento-tatuador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Inkflow-Tool-Secret': SECRET },
      body: JSON.stringify(body),
    }),
    env: {
      INKFLOW_TOOL_SECRET: SECRET,
      SUPABASE_SERVICE_ROLE_KEY: 'sk',
      INKFLOW_TELEGRAM_BOT_TOKEN: 'fake-token',
      ...extraEnv,
    },
    waitUntil: () => {},
  };
}

// Conversa pronta pra orcamento (4 OBR tattoo + cadastro completos → validacao passa).
// `dados_coletados` e `dados_cadastro`, quando passados, SUBSTITUEM os defaults.
export function makeConversa({ dados_coletados, dados_cadastro, orcid = null, estado_agente = 'coletando_tattoo' } = {}) {
  return {
    id: 'c1', estado_agente, orcid, tenant_id: TENANT_ID,
    dados_coletados: dados_coletados || {
      descricao_curta: 'borboleta', local_corpo: 'pulso', altura_cm: 8, estilo: 'fineline',
    },
    dados_cadastro: dados_cadastro || { nome: 'Maria', data_nascimento: '2001-03-15', email: 'maria@x.com' },
    tenants: { id: TENANT_ID, tatuador_telegram_chat_id: TG_CHAT, nome_estudio: 'Estudio' },
  };
}

// Linhas de conversa_mensagens (resposta do SELECT id=in.(...)).
export function mediaRow(id, mimetype = 'image/jpeg') {
  return { id, message: { media_base64: B64, media_mimetype: mimetype } };
}

// Roteador Telegram. Por padrao tudo OK. Opcoes:
//   mediaGroupIds: file_ids retornados por sendMediaGroup (em ordem)
//   photoId/docId: file_id de sendPhoto/sendDocument
//   failMethod: nome do metodo (ex 'sendMediaGroup') que retorna 413
export function tgRouter({ mediaGroupIds = [], photoId = 'PH', docId = 'DOC', failMethod = null } = {}) {
  return (url) => {
    const method = String(url).split('/').pop();
    if (failMethod && method === failMethod) {
      return new Response(JSON.stringify({ ok: false, error_code: 413, description: 'Request Entity Too Large' }), { status: 413 });
    }
    if (method === 'sendMessage') {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }
    if (method === 'sendMediaGroup') {
      return new Response(JSON.stringify({ ok: true, result: mediaGroupIds.map(id => ({ photo: [{ file_id: id }] })) }), { status: 200 });
    }
    if (method === 'sendPhoto') {
      return new Response(JSON.stringify({ ok: true, result: { photo: [{ file_id: photoId }] } }), { status: 200 });
    }
    if (method === 'sendDocument') {
      return new Response(JSON.stringify({ ok: true, result: { document: { file_id: docId } } }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  };
}

// Instala globalThis.fetch. Retorna { calls: {supa,tg}, restore() }.
export function installFetchMock({ conversa, mediaRows = [], telegram }) {
  const calls = { supa: [], tg: [] };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    if (u.includes('api.telegram.org/bot')) {
      calls.tg.push({ url: u, body: init.body, method: u.split('/').pop() });
      return telegram(u, init);
    }
    calls.supa.push({ url: u, method, body: init.body });
    if (u.includes('tool_calls_log')) return new Response(null, { status: 201 });
    if (u.includes('/rest/v1/conversas?') && method === 'GET') {
      return new Response(JSON.stringify([conversa]), { status: 200 });
    }
    if (u.includes('/rest/v1/conversa_mensagens?id=in.')) {
      return new Response(JSON.stringify(mediaRows), { status: 200 });
    }
    return new Response(null, { status: 204 });
  };
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

// Atalhos pra inspecionar calls.
export function tgCall(calls, method) {
  return calls.tg.find(c => c.method === method);
}
export function supaRpcZerar(calls) {
  return calls.supa.filter(c => c.url.includes('/rpc/zerar_media_base64'));
}
export function supaPatchFileIds(calls) {
  return calls.supa.find(c =>
    c.method === 'PATCH'
    && c.url.includes('/conversas?id=eq.c1')
    && (c.body?.includes('foto_local_file_id') || c.body?.includes('refs_imagens_file_ids')),
  );
}
