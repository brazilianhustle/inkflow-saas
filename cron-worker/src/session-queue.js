// cron-worker/src/session-queue.js
// Durable Object: serializa + agrupa (debounce) o processamento WhatsApp por sessão.
// Uma instância por conversa (idFromName(session_id)). Sintaxe clássica (constructor(state,env))
// — sem extends DurableObject — pra ser importável/testável fora do runtime de Workers.
// Backend SQLite vem da migration new_sqlite_classes no wrangler.toml.

export const DEBOUNCE_MS = 4000;   // janela de silêncio que agrupa balões
export const MAX_WAIT_MS = 15000;  // teto desde o 1º balão do lote
const PROCESS_BATCH_URL = 'https://inkflowbrasil.com/api/whatsapp/process-batch';

export class SessionQueue {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/enqueue') return this.enqueue(request);
    return new Response('not-found', { status: 404 });
  }

  async enqueue(request) {
    let body;
    try { body = await request.json(); } catch { return new Response('bad-json', { status: 400 }); }
    const { msgRowId, session_id, tenantId, telefone } = body || {};
    if (msgRowId == null || !session_id) return new Response('bad-enqueue', { status: 400 });

    const now = Date.now();
    const batch = (await this.state.storage.get('batch')) || {
      msgRowIds: [], session_id, tenantId, telefone, firstEnqueuedAt: now,
    };
    batch.session_id = session_id;
    batch.tenantId = tenantId;
    batch.telefone = telefone;
    if (!batch.firstEnqueuedAt) batch.firstEnqueuedAt = now;
    if (!batch.msgRowIds.includes(msgRowId)) batch.msgRowIds.push(msgRowId);
    await this.state.storage.put('batch', batch);

    const alarmAt = Math.min(now + DEBOUNCE_MS, batch.firstEnqueuedAt + MAX_WAIT_MS);
    await this.state.storage.setAlarm(alarmAt);
    return new Response(JSON.stringify({ accepted: msgRowId }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  async alarm() {
    const batch = await this.state.storage.get('batch');
    if (!batch || batch.msgRowIds.length === 0) return;
    const sending = [...batch.msgRowIds];

    const res = await fetch(PROCESS_BATCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': this.env.CRON_SECRET },
      body: JSON.stringify({
        session_id: batch.session_id, tenantId: batch.tenantId, telefone: batch.telefone, msgRowIds: sending,
      }),
    });
    if (!res.ok) {
      // Lança → o runtime do DO re-agenda o alarm com backoff durável. Lote preservado.
      throw new Error(`process-batch HTTP ${res.status}`);
    }

    // Sucesso: remove só os ids enviados; balões que chegaram durante o POST ficam.
    const after = (await this.state.storage.get('batch')) || { msgRowIds: [] };
    const remaining = after.msgRowIds.filter(id => !sending.includes(id));
    if (remaining.length > 0) {
      await this.state.storage.put('batch', { ...after, msgRowIds: remaining, firstEnqueuedAt: Date.now() });
      await this.state.storage.setAlarm(Date.now() + DEBOUNCE_MS);
    } else {
      await this.state.storage.delete('batch');
    }
  }
}
