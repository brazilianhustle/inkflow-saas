// ── InkFlow — Kill-switch detector (chamado pelo n8n antes do LLM) ──
// POST /api/kill-switch-detect
// Body: { tenant_id, conversa_id, mensagem, from_me, estado_atual, config_agente }
// Resposta: { action: 'pause'|'resume'|'noop', new_state?, ack_message?, mensagem_ao_retomar? }
//
// Stateless: caller (n8n) é responsável por aplicar mudanças no DB.
// Endpoint só decide. Lê config do request body — sem chamada Supabase.
// Auth: Bearer com KILL_SWITCH_SECRET (compartilhado com n8n via secrets).

// CORS '*': caller é n8n server-to-server, não browser. Wildcard ok.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function normalize(s) {
  return String(s || '').trim().toLowerCase();
}

/**
 * Função pura — decide action baseada em msg + estado + config.
 * Exportada pra ser testável sem mock de Request.
 */
export function decideAction({ mensagem, from_me, estado_atual, config }) {
  // Defesa em profundidade: from_me precisa ser literal true (não truthy).
  // String 'true' ou número 1 NÃO disparam — evita bypass se caller mandar payload errado.
  if (from_me !== true) return { action: 'noop' };

  const msg = normalize(mensagem);
  // ?? (não ||): tenant que define string vazia desabilita conscientemente o trigger.
  const fraseAssumir = normalize(config?.frase_assumir ?? '/eu assumo');
  const fraseDevolver = normalize(config?.frase_devolver ?? '/bot volta');
  const mensagemRetomar = config?.mensagem_ao_retomar ?? 'Voltei! Alguma dúvida sobre o orçamento?';

  const isPaused = estado_atual === 'pausada_tatuador';

  // Strict equality (após normalize). Punctuation/extra words não casam —
  // false positives custariam uma conversa real do estúdio.
  if (msg === fraseAssumir) {
    if (isPaused) return { action: 'noop' };
    return {
      action: 'pause',
      new_state: 'pausada_tatuador',
      ack_message: '🔇 Bot pausado. Você está no comando.',
    };
  }

  if (msg === fraseDevolver) {
    if (!isPaused) return { action: 'noop' };
    return {
      action: 'resume',
      new_state: 'ativo', // caller deve usar estado_agente_anterior se preferir restore preciso
      mensagem_ao_retomar: mensagemRetomar,
      ack_message: '✅ Bot retomou.',
    };
  }

  return { action: 'noop' };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = request.headers.get('Authorization') || '';
  const expected = `Bearer ${env.KILL_SWITCH_SECRET}`;
  if (!env.KILL_SWITCH_SECRET || auth !== expected) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const { mensagem, from_me, estado_atual, config_agente } = body;
  if (typeof from_me !== 'boolean') return json({ error: 'from_me obrigatorio (boolean)' }, 400);
  if (mensagem != null && typeof mensagem !== 'string') {
    return json({ error: 'mensagem deve ser string ou null' }, 400);
  }

  const result = decideAction({
    mensagem,
    from_me,
    estado_atual,
    config: config_agente || {}
  });

  return json(result);
}
