import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { SessionQueue, DEBOUNCE_MS, MAX_WAIT_MS } from '../../cron-worker/src/session-queue.js';

// Fake storage SQLite-like (Map) + captura de alarm.
function fakeState() {
  const map = new Map();
  let alarmAt = null;
  return {
    _map: map,
    get alarmAt() { return alarmAt; },
    storage: {
      async get(k) { return map.has(k) ? map.get(k) : undefined; },
      async put(k, v) { map.set(k, v); },
      async delete(k) { map.delete(k); },
      async setAlarm(ts) { alarmAt = ts; },
      async getAlarm() { return alarmAt; },
      async deleteAlarm() { alarmAt = null; },
    },
  };
}

const ENV = { CRON_SECRET: 'sek' };
const SID = '00000000-0000-0000-0000-000000000001_5511';

function enqReq(msgRowId) {
  return new Request('https://do/enqueue', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgRowId, session_id: SID, tenantId: '00000000-0000-0000-0000-000000000001', telefone: '5511' }),
  });
}

test('enqueue: 1º balão grava firstEnqueuedAt e agenda alarm em now+DEBOUNCE', async () => {
  const st = fakeState();
  const t0 = 1_000_000;
  mock.timers.enable({ apis: ['Date'], now: t0 });
  try {
    const q = new SessionQueue(st, ENV);
    const res = await q.fetch(enqReq(101));
    assert.equal(res.status, 200);
    const batch = await st.storage.get('batch');
    assert.deepEqual(batch.msgRowIds, [101]);
    assert.equal(batch.firstEnqueuedAt, t0);
    assert.equal(st.alarmAt, t0 + DEBOUNCE_MS);
  } finally { mock.timers.reset(); }
});

test('enqueue: balão novo dentro da janela re-arma o debounce', async () => {
  const st = fakeState();
  const t0 = 1_000_000;
  mock.timers.enable({ apis: ['Date'], now: t0 });
  try {
    const q = new SessionQueue(st, ENV);
    await q.fetch(enqReq(101));
    mock.timers.setTime(t0 + 2000);
    await q.fetch(enqReq(102));
    const batch = await st.storage.get('batch');
    assert.deepEqual(batch.msgRowIds, [101, 102]);
    assert.equal(st.alarmAt, t0 + 2000 + DEBOUNCE_MS, 'alarm empurrado pra now+DEBOUNCE');
  } finally { mock.timers.reset(); }
});

test('enqueue: teto MAX_WAIT respeitado se cliente não para de digitar', async () => {
  const st = fakeState();
  const t0 = 1_000_000;
  mock.timers.enable({ apis: ['Date'], now: t0 });
  try {
    const q = new SessionQueue(st, ENV);
    await q.fetch(enqReq(101));               // first = t0
    mock.timers.setTime(t0 + MAX_WAIT_MS - 1000); // perto do teto
    await q.fetch(enqReq(102));
    // min(now+DEBOUNCE, first+MAX) = min(t0+MAX+3000, t0+MAX) = t0+MAX
    assert.equal(st.alarmAt, t0 + MAX_WAIT_MS);
  } finally { mock.timers.reset(); }
});

test('alarm: POSTa o lote pro process-batch e limpa em sucesso', async () => {
  const st = fakeState();
  await st.storage.put('batch', { msgRowIds: [101, 102], session_id: SID, tenantId: 'T', telefone: '5511', firstEnqueuedAt: 1 });
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { calls.push({ url, opts }); return new Response('{"ok":true}', { status: 200 }); };
  try {
    const q = new SessionQueue(st, ENV);
    await q.alarm();
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/whatsapp\/process-batch$/);
    assert.equal(calls[0].opts.headers['x-cron-secret'], 'sek');
    const sent = JSON.parse(calls[0].opts.body);
    assert.deepEqual(sent.msgRowIds, [101, 102]);
    assert.equal(sent.session_id, SID);
    assert.equal(await st.storage.get('batch'), undefined, 'batch limpo após sucesso');
  } finally { globalThis.fetch = orig; }
});

test('alarm: process-batch falha → lança (DO re-tenta) e NÃO limpa o lote', async () => {
  const st = fakeState();
  await st.storage.put('batch', { msgRowIds: [101], session_id: SID, tenantId: 'T', telefone: '5511', firstEnqueuedAt: 1 });
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response('boom', { status: 500 });
  try {
    const q = new SessionQueue(st, ENV);
    await assert.rejects(() => q.alarm());
    assert.deepEqual((await st.storage.get('batch')).msgRowIds, [101], 'lote preservado pra retry');
  } finally { globalThis.fetch = orig; }
});

test('alarm: balão que chegou durante o POST sobrevive e re-arma alarm', async () => {
  const st = fakeState();
  await st.storage.put('batch', { msgRowIds: [101], session_id: SID, tenantId: 'T', telefone: '5511', firstEnqueuedAt: 1 });
  const orig = globalThis.fetch;
  globalThis.fetch = async () => {
    // simula enqueue de 102 durante o await do POST
    const b = await st.storage.get('batch');
    await st.storage.put('batch', { ...b, msgRowIds: [...b.msgRowIds, 102] });
    return new Response('{"ok":true}', { status: 200 });
  };
  try {
    const q = new SessionQueue(st, ENV);
    await q.alarm();
    const after = await st.storage.get('batch');
    assert.deepEqual(after.msgRowIds, [102], 'só o 101 (enviado) foi removido; 102 fica');
    assert.ok(st.alarmAt != null, 're-armou alarm pro próximo ciclo');
  } finally { globalThis.fetch = orig; }
});

test('fetch: rota desconhecida → 404', async () => {
  const st = fakeState();
  const q = new SessionQueue(st, ENV);
  const res = await q.fetch(new Request('https://do/qualquer', { method: 'POST' }));
  assert.equal(res.status, 404);
});

test('enqueue: msgRowId ausente ou session_id ausente → 400', async () => {
  const st = fakeState();
  const q = new SessionQueue(st, ENV);
  const semId = new Request('https://do/enqueue', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: SID, tenantId: 'T', telefone: '5511' }), // sem msgRowId
  });
  assert.equal((await q.fetch(semId)).status, 400);
  const semSession = new Request('https://do/enqueue', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgRowId: 1, tenantId: 'T', telefone: '5511' }), // sem session_id
  });
  assert.equal((await q.fetch(semSession)).status, 400);
});

test('alarm: CRON_SECRET ausente → lança (fail-fast), nada de fetch', async () => {
  const st = fakeState();
  await st.storage.put('batch', { msgRowIds: [101], session_id: SID, tenantId: 'T', telefone: '5511', firstEnqueuedAt: 1 });
  const orig = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}', { status: 200 }); };
  try {
    const q = new SessionQueue(st, {}); // env sem CRON_SECRET
    await assert.rejects(() => q.alarm(), /CRON_SECRET/);
    assert.equal(called, false, 'nao deve chamar process-batch sem secret');
  } finally { globalThis.fetch = orig; }
});

test('alarm: batch corrompido (msgRowIds nao-array) → self-heal (delete), nao retry infinito', async () => {
  const st = fakeState();
  await st.storage.put('batch', { msgRowIds: 'oops', session_id: SID }); // shape corrompido
  const orig = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}', { status: 200 }); };
  try {
    const q = new SessionQueue(st, ENV);
    await q.alarm(); // nao deve lançar
    assert.equal(await st.storage.get('batch'), undefined, 'batch corrompido descartado');
    assert.equal(called, false, 'nao chama process-batch com batch invalido');
  } finally { globalThis.fetch = orig; }
});

test('enqueue: batch corrompido em storage é resetado em vez de quebrar', async () => {
  const st = fakeState();
  await st.storage.put('batch', { msgRowIds: null }); // corrompido
  const t0 = 2_000_000;
  mock.timers.enable({ apis: ['Date'], now: t0 });
  try {
    const q = new SessionQueue(st, ENV);
    const res = await q.fetch(enqReq(101));
    assert.equal(res.status, 200);
    const batch = await st.storage.get('batch');
    assert.deepEqual(batch.msgRowIds, [101], 'reset limpo + novo balão');
    assert.equal(batch.firstEnqueuedAt, t0);
  } finally { mock.timers.reset(); }
});
