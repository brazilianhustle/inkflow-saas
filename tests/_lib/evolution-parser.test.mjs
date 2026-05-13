// Testes da pure function parseEvolutionPayload — extrai shape canonico do payload Evolution v2.
// Sub-4.1 task 3 (TDD red->green).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEvolutionPayload } from '../../functions/_lib/evolution-parser.js';

const baseUpsert = {
  event: 'messages.upsert',
  instance: 'inkflow_test_sub4',
  data: {
    key: { id: 'ABC123', remoteJid: '5511999998888@s.whatsapp.net', fromMe: false },
    message: { conversation: 'oi quero uma rosa' },
    pushName: 'Joao',
  },
};

test('parser: conversation texto puro → ok com texto', () => {
  const r = parseEvolutionPayload(baseUpsert);
  assert.equal(r.ok, true);
  assert.equal(r.inbound.tenantEvoInstance, 'inkflow_test_sub4');
  assert.equal(r.inbound.telefone, '5511999998888');
  assert.equal(r.inbound.evoMessageId, 'ABC123');
  assert.equal(r.inbound.texto, 'oi quero uma rosa');
  assert.equal(r.inbound.mediaBase64, null);
  assert.equal(r.inbound.pushName, 'Joao');
});

test('parser: imageMessage com caption + base64 → mediaBase64 + mediaMimetype', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, message: {
    imageMessage: { caption: 'tipo essa', mimetype: 'image/jpeg' },
    base64: '/9j/4AAQ',
  }}};
  const r = parseEvolutionPayload(body);
  assert.equal(r.ok, true);
  assert.equal(r.inbound.texto, 'tipo essa');
  assert.equal(r.inbound.mediaBase64, '/9j/4AAQ');
  assert.equal(r.inbound.mediaMimetype, 'image/jpeg');
});

test('parser: audioMessage com base64', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, message: {
    audioMessage: { mimetype: 'audio/ogg' },
    base64: 'AAAA',
  }}};
  const r = parseEvolutionPayload(body);
  assert.equal(r.ok, true);
  assert.equal(r.inbound.mediaBase64, 'AAAA');
  assert.equal(r.inbound.mediaMimetype, 'audio/ogg');
  assert.equal(r.inbound.texto, '');
});

test('parser: extendedTextMessage com text', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, message: {
    extendedTextMessage: { text: 'msg longa' },
  }}};
  const r = parseEvolutionPayload(body);
  assert.equal(r.ok, true);
  assert.equal(r.inbound.texto, 'msg longa');
});

test('parser: stickerMessage → texto vazio sem mídia', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, message: { stickerMessage: {} }}};
  const r = parseEvolutionPayload(body);
  assert.equal(r.ok, true);
  assert.equal(r.inbound.texto, '');
  assert.equal(r.inbound.mediaBase64, null);
});

test('parser: fromMe:true → skip from-me', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, key: { ...baseUpsert.data.key, fromMe: true }}};
  const r = parseEvolutionPayload(body);
  assert.deepEqual(r, { skip: 'from-me' });
});

test('parser: remoteJid @g.us → skip group-msg', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, key: { ...baseUpsert.data.key, remoteJid: '12345@g.us' }}};
  assert.deepEqual(parseEvolutionPayload(body), { skip: 'group-msg' });
});

test('parser: event !== messages.upsert → skip wrong-event', () => {
  const body = { ...baseUpsert, event: 'connection.update' };
  assert.deepEqual(parseEvolutionPayload(body), { skip: 'wrong-event' });
});

test('parser: key.id missing → skip no-key-id', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, key: { remoteJid: '5511@s.whatsapp.net', fromMe: false }}};
  assert.deepEqual(parseEvolutionPayload(body), { skip: 'no-key-id' });
});

test('parser: remoteJid sem dígitos → skip no-telefone', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, key: { ...baseUpsert.data.key, remoteJid: 'abc@s.whatsapp.net' }}};
  assert.deepEqual(parseEvolutionPayload(body), { skip: 'no-telefone' });
});

test('parser: payload null → skip wrong-event', () => {
  assert.deepEqual(parseEvolutionPayload(null), { skip: 'wrong-event' });
});

test('parser: pushName ausente → null preservado', () => {
  const body = { ...baseUpsert, data: { ...baseUpsert.data, pushName: undefined }};
  const r = parseEvolutionPayload(body);
  assert.equal(r.ok, true);
  assert.equal(r.inbound.pushName, null);
});

test('parser: media base64 > 800KB → trunca + warning marker', () => {
  const big = 'A'.repeat(900_000);
  const body = { ...baseUpsert, data: { ...baseUpsert.data, message: {
    imageMessage: { mimetype: 'image/jpeg' },
    base64: big,
  }}};
  const r = parseEvolutionPayload(body);
  assert.equal(r.ok, true);
  assert.equal(r.inbound.mediaTruncated, true);
  assert.ok(r.inbound.mediaBase64.length <= 800_000);
});
