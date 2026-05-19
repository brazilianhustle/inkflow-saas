// functions/_lib/telegram-media.js
// Wrappers Telegram Bot API para envio de midia (foto, documento, mediaGroup).
// Separado de telegram.js (que eh alerts/sendMessage). Usa FormData nativa para multipart.

const TELEGRAM_PHOTO_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const TELEGRAM_TIMEOUT_MS = 15000;

function botUrl(env, method) {
  const token = env?.INKFLOW_TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('INKFLOW_TELEGRAM_BOT_TOKEN ausente');
  return `https://api.telegram.org/bot${token}/${method}`;
}

function base64ToBlob(b64, mimetype) {
  // atob nativo no Workers runtime
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimetype || 'application/octet-stream' });
}

function filenameFor(mimetype) {
  const map = {
    'image/jpeg': 'photo.jpg',
    'image/png':  'photo.png',
    'image/webp': 'photo.webp',
    'image/heic': 'photo.heic',
    'image/heif': 'photo.heif',
    'image/tiff': 'photo.tiff',
    'image/gif':  'photo.gif',
  };
  return map[mimetype] || 'file.bin';
}

async function tgFetch(url, body, { fetch: fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), retried = false } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetchImpl(url, { method: 'POST', body, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
  const data = await resp.json().catch(() => ({}));
  if (data.ok) return data.result;

  // Retry 1x em 429
  if (resp.status === 429 && !retried) {
    const retryAfter = data.parameters?.retry_after ?? 1;
    await sleep(retryAfter * 1000);
    return tgFetch(url, body, { fetch: fetchImpl, sleep, retried: true });
  }
  const desc = data.description || resp.statusText || 'unknown';
  throw new Error(`telegram-${resp.status}: ${desc}`);
}

export async function sendTelegramPhoto(env, chatId, base64, mimetype, caption = null, deps = {}) {
  const url = botUrl(env, 'sendPhoto');
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('photo', base64ToBlob(base64, mimetype), filenameFor(mimetype));
  if (caption) fd.append('caption', caption);
  const result = await tgFetch(url, fd, deps);
  const file_id = result?.photo?.[0]?.file_id;
  if (!file_id) throw new Error('telegram-photo-no-file-id');
  return { file_id, modo: 'photo' };
}

export async function sendTelegramDocument(env, chatId, base64, mimetype, caption = null, filename = null, deps = {}) {
  const url = botUrl(env, 'sendDocument');
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('document', base64ToBlob(base64, mimetype), filename || filenameFor(mimetype));
  if (caption) fd.append('caption', caption);
  const result = await tgFetch(url, fd, deps);
  const file_id = result?.document?.file_id;
  if (!file_id) throw new Error('telegram-document-no-file-id');
  return { file_id, modo: 'document' };
}

/**
 * @param {Array<{base64: string, mimetype: string, caption?: string}>} items - 2 a 10 itens
 */
export async function sendTelegramMediaGroup(env, chatId, items, deps = {}) {
  if (!Array.isArray(items) || items.length < 2 || items.length > 10) {
    throw new Error(`mediaGroup-invalid-count: ${items?.length}`);
  }
  const url = botUrl(env, 'sendMediaGroup');
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  const media = items.map((it, idx) => {
    const attachName = `f${idx}`;
    fd.append(attachName, base64ToBlob(it.base64, it.mimetype), filenameFor(it.mimetype));
    const entry = { type: 'photo', media: `attach://${attachName}` };
    if (idx === 0 && it.caption) entry.caption = it.caption;
    return entry;
  });
  fd.append('media', JSON.stringify(media));
  const result = await tgFetch(url, fd, deps);
  // Telegram retorna array de Messages na mesma ordem. Pega o file_id da maior
  // resolucao (ultimo da array photo, igual sendTelegramPhoto). Se algum item vier
  // sem file_id (resposta malformada apesar de ok:true), throw — o caller trata o
  // grupo inteiro como falha e NAO zera o base64 (evita perder a foto pra sempre).
  return result.map((msg, i) => {
    const file_id = msg?.photo?.[msg.photo.length - 1]?.file_id ?? msg?.photo?.[0]?.file_id;
    if (!file_id) throw new Error(`telegram-mediagroup-no-file-id[${i}]`);
    return { file_id };
  });
}

export async function enviarMidia(env, chatId, base64, mimetype, caption = null, deps = {}) {
  if (mimetype && TELEGRAM_PHOTO_MIMETYPES.has(mimetype.toLowerCase())) {
    return sendTelegramPhoto(env, chatId, base64, mimetype, caption, deps);
  }
  return sendTelegramDocument(env, chatId, base64, mimetype, caption, null, deps);
}
