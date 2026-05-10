import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendTelegramAlert, sendTelegramTo } from '../functions/_lib/telegram.js';

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

test('sendTelegramTo: chatId ausente → ok:false skipped:true', async () => {
  const r = await sendTelegramTo({ TELEGRAM_BOT_TOKEN: 'x' }, null, 'msg');
  assert.equal(r.ok, false);
  assert.equal(r.skipped, true);
});

test('sendTelegramTo: token ausente → ok:false skipped:true', async () => {
  const r = await sendTelegramTo({}, '123', 'msg');
  assert.equal(r.ok, false);
  assert.equal(r.skipped, true);
});

test('sendTelegramTo: payload posta com chat_id correto', async () => {
  const orig = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, opts) => {
    captured = { url, body: JSON.parse(opts.body) };
    return new Response('{}', { status: 200 });
  };
  try {
    await sendTelegramTo({ TELEGRAM_BOT_TOKEN: 'tok' }, '12345', 'oi');
    assert.match(captured.url, /\/bottok\/sendMessage$/);
    assert.equal(captured.body.chat_id, '12345');
    assert.equal(captured.body.text, 'oi');
  } finally {
    globalThis.fetch = orig;
  }
});
