// ── InkFlow — Telegram alert helper (fail-open) ──────────────────────────────
// Envia mensagem pro bot InkFlow Alerts quando configurado.
// Timeout 3s. Nunca joga exception — retorna {ok:false} se falhar.

export async function sendTelegramAlert(env, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('telegram: env vars ausentes, pulando alert');
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      signal: AbortSignal.timeout(3000),
    });
    return { ok: res.ok };
  } catch (e) {
    console.error('telegram: send failed:', e.message);
    return { ok: false, error: e.message };
  }
}
