// tests/_lib/telegram-media.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  sendTelegramPhoto,
  sendTelegramDocument,
  sendTelegramMediaGroup,
  enviarMidia,
} from '../../functions/_lib/telegram-media.js';

const ENV = { INKFLOW_TELEGRAM_BOT_TOKEN: 'fake-bot-token' };
const CHAT = '-100123456';
const B64_1PX_JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD//gA7Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcgSlBFRyB2NjIpLCBxdWFsaXR5ID0gOTAK';

function mockFetchOnce(response) {
  return mock.fn(async () => response);
}

test('sendTelegramPhoto: monta multipart, retorna file_id', async () => {
  let captured;
  const fetchMock = mock.fn(async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({
      ok: true,
      result: { photo: [{ file_id: 'AgACfile1' }, { file_id: 'AgACfile1_thumb' }] },
    }), { status: 200 });
  });
  const r = await sendTelegramPhoto(ENV, CHAT, B64_1PX_JPEG, 'image/jpeg', 'caption x', { fetch: fetchMock });
  assert.equal(r.file_id, 'AgACfile1');
  assert.match(captured.url, /\/sendPhoto$/);
  assert.equal(captured.init.method, 'POST');
  assert.ok(captured.init.body instanceof FormData);
});

test('sendTelegramDocument: usa filename inferido do mimetype quando ausente', async () => {
  let captured;
  const fetchMock = mock.fn(async (url, init) => {
    captured = init;
    return new Response(JSON.stringify({
      ok: true,
      result: { document: { file_id: 'BQACdoc1', file_name: 'image.heic' } },
    }), { status: 200 });
  });
  const r = await sendTelegramDocument(ENV, CHAT, B64_1PX_JPEG, 'image/heic', null, undefined, { fetch: fetchMock });
  assert.equal(r.file_id, 'BQACdoc1');
});

test('sendTelegramMediaGroup: caption SO no primeiro item, retorna array file_ids ordenado', async () => {
  let capturedBody;
  const fetchMock = mock.fn(async (url, init) => {
    capturedBody = init.body;
    return new Response(JSON.stringify({
      ok: true,
      result: [
        { photo: [{ file_id: 'g1' }] },
        { photo: [{ file_id: 'g2' }] },
        { photo: [{ file_id: 'g3' }] },
      ],
    }), { status: 200 });
  });
  const items = [
    { base64: B64_1PX_JPEG, mimetype: 'image/jpeg', caption: 'CAPTION_AQUI' },
    { base64: B64_1PX_JPEG, mimetype: 'image/jpeg', caption: 'NAO_DEVE_APARECER' },
    { base64: B64_1PX_JPEG, mimetype: 'image/jpeg' },
  ];
  const r = await sendTelegramMediaGroup(ENV, CHAT, items, { fetch: fetchMock });
  assert.deepEqual(r.map(x => x.file_id), ['g1', 'g2', 'g3']);
  // Inspeciona o campo 'media' (JSON string dentro do FormData) pra confirmar caption só no primeiro
  const mediaField = capturedBody.get('media');
  const parsed = JSON.parse(mediaField);
  assert.equal(parsed[0].caption, 'CAPTION_AQUI');
  assert.equal(parsed[1].caption, undefined);
  assert.equal(parsed[2].caption, undefined);
});

test('sendTelegramPhoto: retry 1x em 429 respeitando retry_after', async () => {
  let calls = 0;
  const fetchMock = mock.fn(async () => {
    calls++;
    if (calls === 1) {
      return new Response(JSON.stringify({
        ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 1 },
      }), { status: 429 });
    }
    return new Response(JSON.stringify({
      ok: true, result: { photo: [{ file_id: 'OK_after_retry' }] },
    }), { status: 200 });
  });
  const r = await sendTelegramPhoto(ENV, CHAT, B64_1PX_JPEG, 'image/jpeg', null, { fetch: fetchMock, sleep: async () => {} });
  assert.equal(calls, 2);
  assert.equal(r.file_id, 'OK_after_retry');
});

test('sendTelegramPhoto: throw em 413 file too large', async () => {
  const fetchMock = mock.fn(async () => new Response(JSON.stringify({
    ok: false, error_code: 413, description: 'Request Entity Too Large',
  }), { status: 413 }));
  await assert.rejects(
    () => sendTelegramPhoto(ENV, CHAT, B64_1PX_JPEG, 'image/jpeg', null, { fetch: fetchMock }),
    /413|too large/i,
  );
});

test('sendTelegramPhoto: throw em 401 bot token invalido', async () => {
  const fetchMock = mock.fn(async () => new Response(JSON.stringify({
    ok: false, error_code: 401, description: 'Unauthorized',
  }), { status: 401 }));
  await assert.rejects(
    () => sendTelegramPhoto(ENV, CHAT, B64_1PX_JPEG, 'image/jpeg', null, { fetch: fetchMock }),
    /401|bot|token/i,
  );
});

test('enviarMidia: JPEG → routes para sendPhoto (modo "photo")', async () => {
  let url;
  const fetchMock = mock.fn(async (u, init) => {
    url = u;
    return new Response(JSON.stringify({ ok: true, result: { photo: [{ file_id: 'fpJ' }] } }), { status: 200 });
  });
  const r = await enviarMidia(ENV, CHAT, B64_1PX_JPEG, 'image/jpeg', 'cap', { fetch: fetchMock });
  assert.match(url, /sendPhoto$/);
  assert.equal(r.modo, 'photo');
  assert.equal(r.file_id, 'fpJ');
});

test('enviarMidia: HEIC → routes para sendDocument (modo "document")', async () => {
  let url;
  const fetchMock = mock.fn(async (u, init) => {
    url = u;
    return new Response(JSON.stringify({ ok: true, result: { document: { file_id: 'fdH' } } }), { status: 200 });
  });
  const r = await enviarMidia(ENV, CHAT, B64_1PX_JPEG, 'image/heic', 'cap', { fetch: fetchMock });
  assert.match(url, /sendDocument$/);
  assert.equal(r.modo, 'document');
  assert.equal(r.file_id, 'fdH');
});

test('enviarMidia: mimetype null/undefined → sendDocument fallback', async () => {
  let url;
  const fetchMock = mock.fn(async (u) => {
    url = u;
    return new Response(JSON.stringify({ ok: true, result: { document: { file_id: 'fd0' } } }), { status: 200 });
  });
  await enviarMidia(ENV, CHAT, B64_1PX_JPEG, null, null, { fetch: fetchMock });
  assert.match(url, /sendDocument$/);
});

test('sendTelegramMediaGroup: throw se algum item vem sem file_id (evita perder base64)', async () => {
  const fetchMock = mock.fn(async () => new Response(JSON.stringify({
    ok: true,
    result: [{ photo: [{ file_id: 'g1' }] }, { /* malformado: sem photo */ }],
  }), { status: 200 }));
  const items = [
    { base64: B64_1PX_JPEG, mimetype: 'image/jpeg' },
    { base64: B64_1PX_JPEG, mimetype: 'image/jpeg' },
  ];
  await assert.rejects(
    () => sendTelegramMediaGroup(ENV, CHAT, items, { fetch: fetchMock }),
    /no-file-id/,
  );
});

test('throw quando INKFLOW_TELEGRAM_BOT_TOKEN ausente', async () => {
  await assert.rejects(
    () => sendTelegramPhoto({}, CHAT, B64_1PX_JPEG, 'image/jpeg'),
    /INKFLOW_TELEGRAM_BOT_TOKEN/,
  );
});
