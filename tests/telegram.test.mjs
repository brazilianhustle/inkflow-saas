import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendTelegramAlert } from '../functions/_lib/telegram.js';

test('sendTelegramAlert posts to Bot API with correct payload', async () => {
  let captured = null;
  globalThis.fetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true };
  };
  const env = { TELEGRAM_BOT_TOKEN: 'abc123', TELEGRAM_CHAT_ID: '999' };
  const res = await sendTelegramAlert(env, '*teste*');

  assert.equal(res.ok, true);
  assert.match(captured.url, /api\.telegram\.org\/botabc123\/sendMessage/);
  const body = JSON.parse(captured.opts.body);
  assert.equal(body.chat_id, '999');
  assert.equal(body.text, '*teste*');
  assert.equal(body.parse_mode, 'Markdown');
});

test('sendTelegramAlert returns skipped when env vars missing', async () => {
  const res = await sendTelegramAlert({}, 'x');
  assert.equal(res.ok, false);
  assert.equal(res.skipped, true);
});

test('sendTelegramAlert fails open on fetch error', async () => {
  globalThis.fetch = async () => { throw new Error('network'); };
  const env = { TELEGRAM_BOT_TOKEN: 'x', TELEGRAM_CHAT_ID: 'y' };
  const res = await sendTelegramAlert(env, 'hi');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'network');
});
