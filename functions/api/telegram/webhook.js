// ── Telegram Bot Webhook ───────────────────────────────────────────────────
// POST /api/telegram/webhook
// Headers (do Telegram): X-Telegram-Bot-Api-Secret-Token
//   → validado contra env.INKFLOW_TELEGRAM_WEBHOOK_SECRET
//
// Tipos de update tratados:
// 1. /start <onboarding_key> — tatuador conectou bot via deep link do
//    onboarding. Resolve onboarding_key → tenant_id, salva chat_id +
//    username em tenants. Responde com confirmacao.
// 2. callback_query — tatuador clicou inline button. Parseamos action:
//    - "fechar:<orcid>" → pede valor via reply_to
//    - "recusar:<orcid>" → estado=lead_frio, dispara reentrada bot
//    - "aceitar:<orcid>:<valor>" → valor_proposto=valor, estado=propondo_valor
//    - "manter:<orcid>" → estado=propondo_valor (com decisao_desconto=recusado)
// 3. message text que e reply de "Qual valor pra <orcid>" → captura valor,
//    estado=propondo_valor, dispara reentrada bot.
//
// Reentrada do bot: chama webhook n8n configurado em env.N8N_REENTRADA_WEBHOOK_URL
// com payload { conversa_id, orcid, evento }. n8n carrega prompt atualizado
// via /api/tools/prompt e responde no chat do cliente via Evolution.
//
// Idempotencia: webhooks podem ser entregues 2x. Usamos update_id como chave —
// se ja processamos um update, ignoramos. (Implementacao MVP: best-effort,
// guardamos in-memory por execucao do worker; producao seria via KV/D1.)

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const TELEGRAM_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': 'https://api.telegram.org',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function tgJson(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: TELEGRAM_HEADERS });
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

async function tgCall(env, method, body) {
  const token = env.INKFLOW_TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('INKFLOW_TELEGRAM_BOT_TOKEN ausente');
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function sendMessage(env, chat_id, text, extra = {}) {
  return tgCall(env, 'sendMessage', { chat_id, text, parse_mode: 'Markdown', ...extra });
}

async function answerCallbackQuery(env, callback_query_id, text) {
  return tgCall(env, 'answerCallbackQuery', { callback_query_id, ...(text ? { text } : {}) });
}

async function disparaReentrada(env, conversa_id, evento, extra = {}) {
  const url = env.N8N_REENTRADA_WEBHOOK_URL;
  if (!url) {
    console.warn('N8N_REENTRADA_WEBHOOK_URL ausente — bot nao vai reentrar automaticamente');
    return;
  }
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversa_id, evento, ...extra }),
    });
  } catch (e) {
    console.error('Falha ao disparar reentrada n8n:', e.message);
  }
}

// ── Handler /start <onboarding_key> ────────────────────────────────────────
async function handleStart(env, message) {
  const text = message.text || '';
  const parts = text.split(/\s+/);
  const key = parts[1] ? parts[1].trim() : '';
  const chat_id = String(message.chat.id);
  const username = message.chat.username || message.from?.username || null;

  if (!key) {
    await sendMessage(env, chat_id, '👋 Oi! Esse bot e usado pelo InkFlow pra mandar orcamentos pro tatuador. Use o link de conexao no seu painel pra vincular.');
    return tgJson({ ok: true });
  }

  // Procura tenant cujo onboarding_key bate com a key recebida
  const r = await supaFetch(env,
    `/rest/v1/tenants?onboarding_key=eq.${encodeURIComponent(key)}&select=id,nome_estudio,nome_agente,tatuador_telegram_chat_id`
  );
  const rows = r.ok ? await r.json() : [];

  if (!rows || rows.length === 0) {
    await sendMessage(env, chat_id, '❌ Link invalido ou expirado. Gere um novo no painel do estudio.');
    return tgJson({ ok: false, error: 'invalid-key' });
  }

  const tenant = rows[0];

  // Idempotencia: se ja conectado com mesmo chat_id, so reconfirma
  if (tenant.tatuador_telegram_chat_id === chat_id) {
    await sendMessage(env, chat_id, `✅ Voce ja esta conectado ao estudio *${tenant.nome_estudio}*. Vou continuar te enviando orcamentos por aqui.`);
    return tgJson({ ok: true, idempotente: true });
  }

  // Atualiza tenant com chat_id + username
  const upd = await supaFetch(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      tatuador_telegram_chat_id: chat_id,
      tatuador_telegram_username: username,
    }),
  });

  if (!upd.ok) {
    await sendMessage(env, chat_id, '⚠️ Erro ao conectar. Tente de novo em alguns segundos.');
    return tgJson({ ok: false, error: 'tenant-update-failed' });
  }

  await sendMessage(env, chat_id, `✅ Conectado ao estudio *${tenant.nome_estudio}*! Voce vai receber os orcamentos do bot ${tenant.nome_agente || 'InkFlow'} aqui.`);
  return tgJson({ ok: true, tenant_id: tenant.id });
}

// ── Handler de callback queries (botoes inline) ────────────────────────────
async function handleCallback(env, cb) {
  const data = cb.data || '';
  const [acao, orcid, ...resto] = data.split(':');
  const valorExtra = resto.length > 0 ? Number(resto[0]) : null;

  if (!orcid) {
    await answerCallbackQuery(env, cb.id, '❌ Callback invalido');
    return tgJson({ ok: false, error: 'orcid-ausente' });
  }

  // Busca conversa por orcid
  const r = await supaFetch(env,
    `/rest/v1/conversas?orcid=eq.${encodeURIComponent(orcid)}&select=id,estado_agente,valor_proposto,dados_coletados`
  );
  const rows = r.ok ? await r.json() : [];
  if (!rows || rows.length === 0) {
    await answerCallbackQuery(env, cb.id, '❌ Orcamento nao encontrado');
    return tgJson({ ok: false, error: 'orcid-nao-encontrado' });
  }
  const conv = rows[0];

  switch (acao) {
    case 'fechar': {
      // Pede valor via force_reply
      await sendMessage(env, cb.from.id,
        `Qual valor pra \`${orcid}\`? Manda so o numero (ex: 750)`,
        { reply_markup: { force_reply: true, selective: false } }
      );
      await answerCallbackQuery(env, cb.id);
      return tgJson({ ok: true, acao: 'aguardando_valor' });
    }

    case 'recusar': {
      const dados = { ...(conv.dados_coletados || {}), tatuador_recusou: true, mensagem_tatuador: 'recusou' };
      await supaFetch(env, `/rest/v1/conversas?id=eq.${encodeURIComponent(conv.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ estado_agente: 'lead_frio', dados_coletados: dados }),
      });
      await answerCallbackQuery(env, cb.id, '✓ Recusado');
      await sendMessage(env, cb.from.id, `📝 Orcamento \`${orcid}\` recusado. Cliente sera avisado pelo bot.`);
      await disparaReentrada(env, conv.id, 'recusar', { orcid });
      return tgJson({ ok: true, acao: 'recusar' });
    }

    case 'aceitar': {
      // valorExtra = novo valor que tatuador aceitou (do caminho B)
      if (!Number.isFinite(valorExtra) || valorExtra <= 0) {
        await answerCallbackQuery(env, cb.id, '❌ Valor invalido no callback');
        return tgJson({ ok: false, error: 'valor-invalido' });
      }
      const dados = { ...(conv.dados_coletados || {}), decisao_desconto: 'aceito' };
      await supaFetch(env, `/rest/v1/conversas?id=eq.${encodeURIComponent(conv.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          estado_agente: 'propondo_valor',
          valor_proposto: valorExtra,
          dados_coletados: dados,
        }),
      });
      await answerCallbackQuery(env, cb.id, '✓ Aceito');
      await sendMessage(env, cb.from.id, `✅ Desconto aceito em R$ ${valorExtra}. Bot ja avisou o cliente.`);
      await disparaReentrada(env, conv.id, 'aceitar_desconto', { orcid, valor: valorExtra });
      return tgJson({ ok: true, acao: 'aceitar', valor: valorExtra });
    }

    case 'manter': {
      const dados = { ...(conv.dados_coletados || {}), decisao_desconto: 'recusado' };
      await supaFetch(env, `/rest/v1/conversas?id=eq.${encodeURIComponent(conv.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ estado_agente: 'propondo_valor', dados_coletados: dados }),
      });
      await answerCallbackQuery(env, cb.id, '✓ Mantido');
      await sendMessage(env, cb.from.id, `✅ Valor mantido em R$ ${conv.valor_proposto}. Bot ja avisou o cliente.`);
      await disparaReentrada(env, conv.id, 'manter_valor', { orcid });
      return tgJson({ ok: true, acao: 'manter' });
    }

    default:
      await answerCallbackQuery(env, cb.id, '❌ Acao desconhecida');
      return tgJson({ ok: false, error: `acao-desconhecida: ${acao}` });
  }
}

// ── Handler de texto livre (resposta a "Qual valor pra <orcid>") ───────────
async function handleText(env, message) {
  const reply = message.reply_to_message;
  if (!reply || !reply.text) return tgJson({ ok: true, ignorado: 'sem-reply' });

  // Detecta se o reply e da pergunta "Qual valor pra <orcid>"
  const orcidMatch = reply.text.match(/orc_[a-z0-9]+/i);
  if (!orcidMatch) return tgJson({ ok: true, ignorado: 'reply-sem-orcid' });
  const orcid = orcidMatch[0];

  // Parseia valor numerico do texto
  const valor = Number(String(message.text).replace(/[^\d.,]/g, '').replace(',', '.'));
  if (!Number.isFinite(valor) || valor <= 0) {
    await sendMessage(env, message.chat.id, '❌ Valor invalido. Manda so o numero (ex: 750)');
    return tgJson({ ok: false, error: 'valor-invalido' });
  }

  // Busca conversa por orcid
  const r = await supaFetch(env,
    `/rest/v1/conversas?orcid=eq.${encodeURIComponent(orcid)}&select=id,estado_agente`
  );
  const rows = r.ok ? await r.json() : [];
  if (!rows || rows.length === 0) {
    await sendMessage(env, message.chat.id, `❌ Orcamento \`${orcid}\` nao encontrado`);
    return tgJson({ ok: false, error: 'orcid-nao-encontrado' });
  }
  const conv = rows[0];

  await supaFetch(env, `/rest/v1/conversas?id=eq.${encodeURIComponent(conv.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ estado_agente: 'propondo_valor', valor_proposto: valor }),
  });

  await sendMessage(env, message.chat.id, `✅ Valor R$ ${valor} salvo. Bot ja avisou o cliente.`);
  await disparaReentrada(env, conv.id, 'fechar', { orcid, valor });
  return tgJson({ ok: true, valor });
}

// ── Entry point ────────────────────────────────────────────────────────────
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: TELEGRAM_HEADERS });
  }
  if (request.method !== 'POST') {
    return tgJson({ ok: false, error: 'method-not-allowed' }, 405);
  }

  // Validar secret token (configurado no setWebhook)
  const expected = env.INKFLOW_TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return tgJson({ ok: false, error: 'webhook-secret-missing' }, 503);
  const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (got !== expected) return tgJson({ ok: false, error: 'unauthorized' }, 401);

  let update;
  try { update = await request.json(); }
  catch { return tgJson({ ok: false, error: 'invalid-json' }, 400); }

  try {
    // /start <key>
    if (update.message?.text?.startsWith('/start ')) {
      return await handleStart(env, update.message);
    }
    if (update.message?.text === '/start') {
      return await handleStart(env, update.message);
    }

    // Callback queries (botoes)
    if (update.callback_query) {
      return await handleCallback(env, update.callback_query);
    }

    // Texto que e reply (resposta a "Qual valor")
    if (update.message?.text && update.message.reply_to_message) {
      return await handleText(env, update.message);
    }

    // Outros tipos: ignora silenciosamente
    return tgJson({ ok: true, ignored: true });

  } catch (e) {
    console.error('telegram-webhook error:', e);
    return tgJson({ ok: false, error: 'internal', detail: String(e?.message || e) }, 500);
  }
}
