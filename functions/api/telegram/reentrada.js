// ── Reentrada do bot na conversa do cliente (Modo Coleta v2) ───────────────
// POST /api/telegram/reentrada
// Headers: X-Inkflow-Tool-Secret
// Body: { conversa_id, evento, orcid, valor? }
//
// Chamado pelo /api/telegram/webhook após callback do tatuador (fechar valor,
// aceitar desconto, manter valor, recusar). Monta mensagem template baseada
// no evento, envia via Evolution sendText, loga em chat_messages.
//
// Por que isso e um endpoint CF Pages e nao um workflow n8n:
// - Reentrada e simples: 1 mensagem template + 1 chamada Evolution.
// - n8n seria overkill pra esse caso especifico.
// - Endpoint interno e versionado em git, testavel, mais rapido (sem hop n8n).
// - Se virar mais complexo no futuro, da pra migrar pra n8n facilmente.
//
// Eventos suportados:
// - 'fechar'           → "Show! Pelo trabalho ficou em R$ X. Bora marcar?"
// - 'aceitar_desconto' → "Show! Ele topou em R$ X. Bora marcar?"
// - 'manter_valor'     → "Ele preferiu manter R$ X. Tá fechado pra ti? Bora marcar?"
// - 'recusar'          → "Infelizmente o tatuador não vai poder fazer essa peça. Posso te ajudar com outra ideia?"

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Inkflow-Tool-Secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

function authTool(request, env) {
  const secret = env.INKFLOW_TOOL_SECRET;
  if (!secret) return { ok: false, reason: 'secret-missing' };
  const got = request.headers.get('X-Inkflow-Tool-Secret');
  if (!got || got !== secret) return { ok: false, reason: 'bad-secret' };
  return { ok: true };
}

function supaKey(env) {
  return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
}

async function supaFetch(env, path, init = {}) {
  const key = supaKey(env);
  if (!key) throw new Error('SUPABASE_SERVICE_KEY ausente');
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

function fmtBRL(valor) {
  if (valor === null || valor === undefined) return '?';
  const n = Number(valor);
  if (!Number.isFinite(n)) return String(valor);
  // Sem decimais se for valor inteiro, com 2 decimais caso contrario
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace('.', ',');
}

function montarMensagem(evento, valor, valor_proposto) {
  switch (evento) {
    case 'fechar':
      return `Show! Pelo trabalho ficou em R$ ${fmtBRL(valor)}. Bora marcar?`;
    case 'aceitar_desconto':
      return `Show! Ele topou em R$ ${fmtBRL(valor)}. Bora marcar?`;
    case 'manter_valor':
      return `Ele preferiu manter R$ ${fmtBRL(valor_proposto)}. Tá fechado pra ti? Bora marcar?`;
    case 'recusar':
      return 'Infelizmente o tatuador não vai poder fazer essa peça. Posso te ajudar com outra ideia?';
    default:
      return null;
  }
}

async function logChatMessage(env, { tenant_id, conversa_id, telefone, conteudo, direcao = 'out' }) {
  try {
    await supaFetch(env, '/rest/v1/chat_messages', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        tenant_id, conversa_id, telefone,
        direcao, tipo: 'texto',
        conteudo,
      }),
    });
  } catch (e) {
    console.warn('reentrada: log chat_messages falhou:', e.message);
  }
}

async function handle(env, input) {
  const { conversa_id, evento, orcid, valor } = input || {};
  if (!conversa_id) return { status: 400, body: { ok: false, error: 'conversa_id obrigatorio' } };
  if (!evento) return { status: 400, body: { ok: false, error: 'evento obrigatorio' } };

  // Carrega conversa + tenant
  const r = await supaFetch(env,
    `/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}` +
    '&select=id,telefone,valor_proposto,orcid,tenant_id,tenants(id,nome_agente,evo_instance,evo_apikey,evo_base_url)'
  );
  if (!r.ok) return { status: 500, body: { ok: false, error: 'db-error' } };
  const rows = await r.json();
  const conv = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!conv) return { status: 404, body: { ok: false, error: 'conversa-nao-encontrada' } };

  const tenant = conv.tenants;
  if (!tenant?.evo_instance) {
    return { status: 400, body: { ok: false, error: 'evo-instance-ausente' } };
  }
  if (!conv.telefone) {
    return { status: 400, body: { ok: false, error: 'telefone-ausente' } };
  }

  // Valida orcid se fornecido (extra safety)
  if (orcid && conv.orcid !== orcid) {
    return { status: 400, body: { ok: false, error: 'orcid-mismatch', dica: `conversa tem orcid '${conv.orcid}', recebido '${orcid}'` } };
  }

  // Monta mensagem
  const msg = montarMensagem(evento, valor, conv.valor_proposto);
  if (!msg) {
    return { status: 400, body: { ok: false, error: `evento desconhecido: ${evento}` } };
  }

  // Envia via Evolution
  const evoBase = tenant.evo_base_url || env.EVO_BASE_URL || 'https://evo.inkflowbrasil.com';
  const evoKey = tenant.evo_apikey || env.EVO_GLOBAL_KEY || '';
  if (!evoKey) {
    return { status: 503, body: { ok: false, error: 'evo-apikey-ausente' } };
  }

  const evoRes = await fetch(`${evoBase}/message/sendText/${encodeURIComponent(tenant.evo_instance)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: evoKey },
    body: JSON.stringify({ number: conv.telefone, text: msg }),
  });

  if (!evoRes.ok) {
    const detail = await evoRes.text().catch(() => '');
    return { status: 502, body: { ok: false, error: 'evolution-error', http: evoRes.status, detail: detail.slice(0, 200) } };
  }

  // Log assincrono
  logChatMessage(env, {
    tenant_id: conv.tenant_id,
    conversa_id: conv.id,
    telefone: conv.telefone,
    conteudo: msg,
    direcao: 'out',
  });

  return {
    status: 200,
    body: {
      ok: true,
      evento,
      mensagem_enviada: msg,
      conversa_id: conv.id,
      telefone: conv.telefone,
    },
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: HEADERS });
  }
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'method-not-allowed' }, 405);
  }

  const auth = authTool(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.reason }, 401);

  let input;
  try { input = await request.json(); }
  catch { return json({ ok: false, error: 'invalid-json' }, 400); }

  try {
    const res = await handle(env, input);
    return json(res.body, res.status);
  } catch (e) {
    console.error('reentrada error:', e);
    return json({ ok: false, error: 'internal', detail: String(e?.message || e) }, 500);
  }
}

// Exports pra teste
export { montarMensagem, fmtBRL };
