// ── InkFlow — Audit Telegram webhook (ack flow) ──────────────────────────────
// Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §6.4.
// Bot Telegram chama POST aqui com update; auth dupla:
//   1. Header X-Telegram-Bot-Api-Secret-Token == TELEGRAM_WEBHOOK_SECRET
//   2. message.from.id == TELEGRAM_ADMIN_USER_ID
// Parsea "ack <id_short>" → resolve UUID via prefix → PATCH acknowledged_*.

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

function timeoutSignal(ms) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function sendBotConfirmation(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
      signal: timeoutSignal(5000),
    });
  } catch (e) {
    console.error('telegram-webhook: confirmation send failed:', e.message);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Auth #1: secret header (definido no setWebhook)
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!env.TELEGRAM_WEBHOOK_SECRET || secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return json({ error: 'unauthorized' }, 401);
  }

  let update;
  try { update = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }

  const msg = update?.message;
  if (!msg || !msg.text) return json({ skipped: 'no_text' });

  // Auth #2: admin whitelist (from.id deve ser positivo + env não-vazio)
  const adminId = String(env.TELEGRAM_ADMIN_USER_ID || '').trim();
  if (!adminId) {
    console.error('telegram-webhook: TELEGRAM_ADMIN_USER_ID ausente no env, bloqueando');
    return json({ error: 'config_missing' }, 503);
  }
  const rawFromId = msg.from?.id;
  const fromId = Number.isInteger(rawFromId) && rawFromId > 0 ? String(rawFromId) : null;
  if (!fromId || fromId !== adminId) {
    console.warn(`telegram-webhook: non-admin from.id=${rawFromId}, ignorando`);
    return json({ skipped: 'not_admin' });
  }

  const text = msg.text.trim();
  if (!text.toLowerCase().startsWith('ack ')) return json({ skipped: 'not_ack' });

  const idShort = text.slice(4).trim().split(/\s+/)[0];
  if (!/^[0-9a-f]{8}$/i.test(idShort)) return json({ skipped: 'invalid_id' });

  const sbKey = env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return json({ error: 'config_missing' }, 503);

  const sbHeaders = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
  };

  // Resolver UUID por prefix (apenas eventos abertos pra evitar colisão histórica)
  const lookupUrl = `${SUPABASE_URL}/rest/v1/audit_events?id=like.${idShort}*&resolved_at=is.null&select=id,auditor,severity&limit=2`;
  const lookupRes = await fetch(lookupUrl, {
    headers: sbHeaders,
    signal: timeoutSignal(8000),
  });
  if (!lookupRes.ok) {
    console.error('telegram-webhook: lookup failed:', lookupRes.status);
    return json({ error: 'lookup_failed' }, 502);
  }
  const matches = await lookupRes.json();

  if (matches.length === 0) {
    await sendBotConfirmation(env, `❌ ack ${idShort}: evento não encontrado (já resolvido?)`);
    return json({ skipped: 'not_found' });
  }
  if (matches.length > 1) {
    await sendBotConfirmation(env, `⚠️ ack ${idShort}: ambíguo (${matches.length} matches). Use ID mais longo.`);
    return json({ skipped: 'ambiguous' });
  }

  const event = matches[0];
  const patchUrl = `${SUPABASE_URL}/rest/v1/audit_events?id=eq.${event.id}`;
  const patchRes = await fetch(patchUrl, {
    method: 'PATCH',
    headers: sbHeaders,
    body: JSON.stringify({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: fromId,
    }),
    signal: timeoutSignal(8000),
  });
  if (!patchRes.ok) {
    console.error('telegram-webhook: patch failed:', patchRes.status);
    return json({ error: 'patch_failed' }, 502);
  }

  await sendBotConfirmation(env, `✅ Acknowledged: ${event.auditor} ${event.severity}`);
  return json({ ok: true, event_id: event.id });
}
